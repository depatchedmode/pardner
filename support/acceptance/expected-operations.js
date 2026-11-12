import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const canonical = value => JSON.stringify(sort(value))
function sort(value) {
  if (Array.isArray(value)) return value.map(sort)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
  return value
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex')

const MACHINE_ID = /^machine-[a-z2-7]{26}$/
const storedId = request => `op-${hash([request.operationId, hash({ type: request.type, actorId: request.actorId, payload: request.payload })])}`

/** Intents are recorded before execution; successful receipts never define expected effects. */
export class ExpectedOperations {
  constructor() { this.intents = new Map(); this.receipts = new Map(); this.sources = new Map(); this.baseline = new Set(); this.records = [] }
  /** Operations already in the document before the measured workload (such as enrollment registrations). */
  ignore(operationIds) { for (const id of operationIds) this.baseline.add(id) }
  intend(request, replicaId) {
    const prior = this.intents.get(request.operationId)
    if (prior) assert.equal(canonical(prior), canonical(request), 'Reused expected operation ID')
    this.intents.set(request.operationId, structuredClone(request))
    if (replicaId && !this.sources.has(request.operationId)) this.sources.set(request.operationId, replicaId)
  }
  acknowledge(request, receipt, elapsedMs) {
    this.intend(request)
    assert.equal(receipt.savedLocally, true)
    if (this.sources.has(request.operationId)) assert.equal(receipt.replicaId, this.sources.get(request.operationId), 'Receipt came from the wrong replica identity')
    assert.ok(elapsedMs <= 2500, `Local acknowledgement took ${elapsedMs}ms`)
    this.receipts.set(request.operationId, { receipt, elapsedMs })
  }
  verify(snapshot) {
    const tasks = new Map()
    const readReceipts = new Map()
    for (const [id, intent] of this.intents) {
      if (!this.receipts.has(id)) continue
      if (intent.type === 'task.create') {
        const taskId = `task-${createHash('sha256').update(storedId(intent)).digest('hex').slice(0, 24)}`
        tasks.set(taskId, { description: '', status: 'backlog', assignee: null, priority: 'p2', tags: [], ...intent.payload })
      }
      if (intent.type === 'task.update') Object.assign(tasks.get(intent.payload.taskId), intent.payload.updates)
      if (intent.type === 'task.handoff') Object.assign(tasks.get(intent.payload.taskId), { assignee: intent.payload.to, status: intent.payload.status })
      if (intent.type === 'task.resolve') tasks.get(intent.payload.taskId)[intent.payload.field] = intent.payload.value
    }
    assert.equal(Object.keys(snapshot.tasks).length, tasks.size, 'Created task cardinality differs from the manifest')
    for (const [taskId, fields] of tasks) {
      assert.ok(snapshot.tasks[taskId], `Expected task missing: ${taskId}`)
      for (const [field, value] of Object.entries(fields)) assert.equal(canonical(snapshot.tasks[taskId][field]), canonical(value), `${taskId}.${field} effect is incorrect`)
    }
    for (const [id, { receipt }] of this.receipts) {
      const intent = this.intents.get(id)
      const operationId = storedId(intent)
      const event = snapshot.operations[operationId]
      assert.ok(event, `Acknowledged operation missing: ${id}`)
      assert.equal(event.operationId, operationId)
      assert.equal(event.requestId, id)
      assert.equal(event.actorId, intent.actorId)
      assert.equal(event.type, intent.type)
      assert.equal(canonical(event.payload), canonical(intent.payload))
      assert.equal(event.replicaId, receipt.replicaId)
      if (intent.type === 'comment.add') {
        const matching = Object.values(snapshot.comments).filter(comment => comment.revisionId === operationId)
        assert.equal(matching.length, 1, `Comment ${id} must appear exactly once`)
        assert.equal(matching[0].content, intent.payload.text)
        assert.equal(matching[0].taskId, intent.payload.taskId)
        assert.equal(matching[0].actorId, intent.actorId)
      }
      if (intent.type === 'task.create') {
        assert.ok(snapshot.tasks[receipt.result.taskId], `Created task missing: ${id}`)
        assert.equal(snapshot.tasks[receipt.result.taskId].created_by, intent.actorId)
      }
      if (intent.type === 'read.mark') {
        for (const observed of intent.payload.comments) {
          const key = createHash('sha256').update(JSON.stringify([intent.actorId, observed.commentId, observed.revisionId])).digest('hex')
          readReceipts.set(key, { actorId: intent.actorId, ...observed })
        }
      }
      if (intent.type === 'task.handoff') {
        const comment = Object.values(snapshot.comments).find(comment => comment.revisionId === operationId)
        assert.equal(comment?.content, intent.payload.message)
        assert.equal(comment?.actorId, intent.actorId)
        assert.equal(Object.values(snapshot.comments).filter(comment => comment.revisionId === operationId).length, 1)
        assert.equal(Object.values(snapshot.mentions).filter(mention => mention.commentId === receipt.result.commentId && mention.toActorId === intent.payload.to).length, 1)
      }
    }
    assert.equal(canonical(snapshot.readReceipts), canonical(Object.fromEntries(readReceipts)), 'Read receipts must equal the union of observed revisions for their Actors')
    assert.equal(Object.keys(snapshot.operations).filter(id => !this.baseline.has(id)).length, this.receipts.size, 'Unexpected or unacknowledged operation exists')
    // Each replica's Activity and attribution are its own view (they name that replica's machine as "this computer");
    // the shared document is what must be identical. attributed() and verifyAttribution() check the views themselves.
    const { attribution, activity, ...shared } = snapshot
    return { operationCount: this.receipts.size, snapshotHash: hash(shared) }
  }

  /**
   * Membership records the harness expects, as it performs each enrollment, pairing, profile or agent action:
   * `{ kind, subject, signer, ...fields }`, where `subject` and `signer` may name a side, a person or an Actor of the
   * harness symbolically (resolved by verifyAttribution once the replicas' machines are known).
   */
  expectRecords(action, records) {
    for (const record of records) this.records.push({ action, ...record })
  }

  /**
   * What every replica must agree on, keyed by board change hash: for each change, the Activity entry it is shown in
   * (its kind and key, the group of changes the entry lists, its flags with their values, and the changes that later
   * altered its stored copy), the content that change wrote (the event with that change's own replica and time, the
   * record, or what an unrecognised change wrote), what else it wrote (its unusual writes, the entries it replaced, how
   * its writes differ from what its event implies, and the Actors a creation registered), and that change's verdict
   * (its state, the signing machine, that machine's person, whether it signed an Actor it may not act as, and whether
   * its time can be shown). Also the changes listed for review. Left out, because they name this replica or what it
   * happened to observe: which machine is "this computer", machine names, who relayed a verdict to it, what a pending
   * change is waiting for, and the reason recorded for an unsigned one.
   */
  stableAttribution(snapshot) {
    const { attribution } = snapshot
    const personOf = machineId => (machineId && attribution?.machines?.[machineId]?.personId) || null
    const changes = {}
    for (const entry of Array.isArray(snapshot.activity) ? snapshot.activity : []) {
      for (const change of entry.changes ?? []) {
        const content = entry.kind === 'operation' ? { ...entry.event, replicaId: change.replicaId, timestamp: change.timestamp }
          : entry.kind === 'record' ? entry.record
            : { wrote: entry.wrote ?? null, ops: entry.ops ?? null, oversized: entry.oversized === true, altered: entry.altered ?? [], alteredContent: entry.alteredContent ?? [] }
        ;(changes[change.hash] ??= []).push({ kind: entry.kind, key: entry.key ?? null, content, group: entry.changes.map(other => other.hash).sort(),
          flags: entry.flags ?? {}, alteredLater: (entry.alteredLater ?? []).map(other => other.hash).sort(),
          wroteElse: { unusual: change.unusual ?? null, replaced: change.replaced ?? null, mismatch: change.mismatch ?? null, registered: change.registered ?? null },
          state: change.state, machineId: change.machineId ?? null, personId: personOf(change.machineId), actorMismatch: change.actorMismatch === true,
          badTime: change.badTime === true })
      }
    }
    for (const list of Object.values(changes)) list.sort((a, b) => canonical(a).localeCompare(canonical(b)))
    return { changes: Object.fromEntries(Object.keys(changes).sort().map(key => [key, changes[key]])),
      review: [...new Set((attribution?.review ?? []).map(entry => entry.change))].sort() }
  }

  /**
   * Whether this replica has derived and checked every board change, and shows every one, baseline included, in an
   * entry signed by a named machine with a person, with no flag and nothing for review.
   */
  attributed(snapshot) {
    const summary = snapshot.attribution?.summary
    if (!summary || summary.notDerived || summary.checking) return false
    const { changes, review } = this.stableAttribution(snapshot)
    return review.length === 0 && Object.keys(changes).length === summary.changes && Object.values(changes).flat()
      .every(change => change.state === 'signed' && MACHINE_ID.test(change.machineId ?? '') && change.personId && !change.actorMismatch && !Object.keys(change.flags).length
        && !change.wroteElse.mismatch && !change.wroteElse.unusual && !change.badTime)
  }

  /**
   * The acceptance check on attribution. Every replica reports the same stable attribution, keyed by change hash
   * (stableAttribution), and it matches what the harness knows:
   * - each acknowledged operation is exactly one entry of exactly one change, which wrote the event the harness
   *   intended (its operation ID, request ID, type, Actor and payload) on the replica that acknowledged it, and was
   *   signed by that replica's machine, whose person is the Actor's person;
   * - each baseline operation likewise, by the machine and Actor that enrolled the others, with the payload that
   *   enrollment intends for the Actor it registers (`registration`);
   * - on every replica, each of those entries matches its change's writes exactly (lib/operation-writes.js), and its
   *   change wrote nothing unusual;
   * - there is no other operation entry;
   * - the membership records shown are exactly those expectRecords() named, each signed by the expected machine.
   */
  verifyAttribution(snapshots, { machineOfReplica, personOfActor, baseline, registration, resolve }) {
    const views = snapshots.map(snapshot => this.stableAttribution(snapshot))
    for (const [index, view] of views.entries()) {
      assert.equal(canonical(view), canonical(views[0]), `Replica ${index}'s attribution differs between replicas`)
    }
    const activity = snapshots[0].activity
    const operationEntries = activity.filter(entry => entry.kind === 'operation')
    // Rule 3, on every replica: each operation's entry is exactly what its change did.
    for (const [index, snapshot] of snapshots.entries()) {
      for (const entry of snapshot.activity.filter(item => item.kind === 'operation')) {
        assert.ok(!entry.flags.mismatch && entry.changes.every(change => !change.mismatch && !change.unusual),
          `Replica ${index} shows operation ${entry.key} with writes that differ from its entry: ${JSON.stringify(entry.changes.map(change => change.mismatch ?? change.unusual)).slice(0, 400)}`)
      }
    }
    const expectEntry = (id, machineId, actorId, check = () => {}) => {
      const entries = operationEntries.filter(entry => entry.key === id)
      assert.equal(entries.length, 1, `Operation ${id} is shown in ${entries.length} entries, not one`)
      const [entry] = entries
      assert.equal(entry.changes.length, 1, `Operation ${id} was written by ${entry.changes.length} changes`)
      const [change] = entry.changes
      assert.equal(change.state, 'signed', `Operation ${id} is ${change.state}`)
      assert.ok(change.machineId === machineId, `Operation ${id} was signed by ${change.machineId} but performed on ${machineId}`)
      assert.equal(entry.event.operationId, id, `Operation ${id} carries another operation ID`)
      assert.equal(entry.event.actorId, actorId, `Operation ${id} names the wrong Actor`)
      assert.equal(snapshots[0].attribution.machines[machineId]?.personId, personOfActor[actorId], `Operation ${id} was signed for a person other than its Actor's`)
      check(entry)
    }
    for (const [id, { receipt }] of this.receipts) {
      const intent = this.intents.get(id)
      const machineId = machineOfReplica[receipt.replicaId]
      assert.ok(machineId, `No machine is known for replica ${receipt.replicaId}`)
      expectEntry(storedId(intent), machineId, intent.actorId, entry => {
        assert.equal(entry.event.requestId, id)
        assert.equal(entry.event.type, intent.type)
        assert.equal(canonical(entry.event.payload), canonical(intent.payload), `Operation ${id}'s signed payload is not what was intended`)
        assert.equal(entry.event.replicaId, receipt.replicaId, `Operation ${id} was written on another replica`)
      })
    }
    const registered = new Set()
    for (const id of this.baseline) {
      expectEntry(id, baseline.machineId, baseline.actorId, entry => {
        // Enrollment registers each Actor it admits, with the payload it builds for that Actor (lib/client-service.js
        // registerActor): baseline operations get the same intended-content check as the workload's.
        assert.equal(entry.event.type, 'actor.register', `Baseline operation ${id} is not an Actor registration`)
        const intended = registration(entry.event.payload?.id)
        assert.ok(intended, `Baseline operation ${id} registers an Actor the harness never enrolled: ${entry.event.payload?.id}`)
        assert.equal(entry.event.requestId, `enroll-${intended.id}`)
        assert.equal(canonical(entry.event.payload), canonical(intended), `Baseline operation ${id}'s signed payload is not what enrollment intends`)
        assert.ok(!registered.has(intended.id), `Actor ${intended.id} is registered twice`)
        registered.add(intended.id)
      })
    }
    const known = new Set([...[...this.receipts.keys()].map(id => storedId(this.intents.get(id))), ...this.baseline])
    const unexpected = operationEntries.filter(entry => !known.has(entry.key))
    assert.deepEqual(unexpected.map(entry => entry.key), [], 'Activity shows operations the harness never performed')
    // Membership records: exactly the expected ones, each by its expected signer.
    const records = activity.filter(entry => entry.kind === 'record')
    const expected = this.records.map(record => resolve(record))
    const unmatched = [...records]
    for (const want of expected) {
      const index = unmatched.findIndex(entry => Object.entries(want.fields).every(([field, value]) => canonical(entry.record[field]) === canonical(value)))
      assert.ok(index >= 0, `Expected record missing (${want.action}): ${canonical(want.fields)}`)
      const [entry] = unmatched.splice(index, 1)
      assert.ok(!entry.flags.invalidRecord && !entry.flags.keyMismatch, `Record ${entry.record.recordId} is not a valid record at its own key`)
      assert.ok(entry.changes.every(change => change.state === 'signed'), `Record ${entry.record.recordId} was written by a change that is not signed`)
    }
    assert.deepEqual(unmatched.map(entry => `${entry.record.kind} of ${entry.record.subject} by ${entry.record.signer}`), [], 'Membership records the harness never expected')
    return { changes: Object.keys(views[0].changes).length, operations: operationEntries.length, records: records.length, attributionHash: hash(views[0]) }
  }

  report() { return { intents: [...this.intents.values()], expectedReplicas: Object.fromEntries(this.sources), receipts: Object.fromEntries(this.receipts), expectedRecords: this.records } }
}
