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
  constructor() { this.intents = new Map(); this.receipts = new Map(); this.sources = new Map(); this.baseline = new Set() }
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
    // Each replica's attribution is its own view (it names that replica's machine as "this computer"); the shared
    // document is what must be identical. attributed() checks the views themselves.
    const { attribution, ...shared } = snapshot
    return { operationCount: this.receipts.size, snapshotHash: hash(shared) }
  }

  /**
   * Who signed what, in the form every replica must agree on. For each operation in the board, baseline included:
   * for each change that wrote it, the change hash, its state, the signing machine, that machine's person, the
   * entry's Actor, and any flag (an Actor the machine may not act as, a later change that altered the entry, a
   * replaced entry). For each membership record: its kind, subject, signer, the signer's person and Actor, and when
   * it reached the board. And the changes listed for review. Left out, because they name this replica or what it
   * happened to observe: which machine is "this computer", the position in which this replica indexed a change,
   * who relayed a verdict to it, and what a pending change is waiting for.
   */
  stableAttribution(snapshot) {
    const { attribution, operations } = snapshot
    const personOf = machineId => (machineId && attribution?.machines?.[machineId]?.personId) || null
    const signersOf = id => (Array.isArray(attribution?.operations?.[id]) ? attribution.operations[id] : [])
    return {
      operations: Object.fromEntries(Object.keys(operations).sort().map(id => [id, signersOf(id).map(signer => ({
        change: signer.hash ?? null, state: signer.state, machineId: signer.machineId ?? null, personId: personOf(signer.machineId),
        actorId: operations[id].actorId ?? null, actorMismatch: signer.actorMismatch === true, replaces: signer.replaces === true,
        altered: (Array.isArray(signer.altered) ? signer.altered : []).map(change => change.hash) }))])),
      records: (attribution?.records ?? []).map(({ position, ...record }) => ({ ...record, signerPersonId: personOf(record.signer) }))
        .sort((a, b) => a.recordId.localeCompare(b.recordId)),
      review: (attribution?.review ?? []).map(entry => entry.change).sort(),
    }
  }

  /**
   * Whether this replica shows every operation in the board, baseline included, as signed by a named machine with no
   * flag, and nothing for review: every change was signed by the machine that made it, and every peer checked it.
   */
  attributed(snapshot) {
    if (!snapshot.attribution) return false
    const { operations, review } = this.stableAttribution(snapshot)
    return review.length === 0 && Object.values(operations).every(signers => signers.length > 0
      && signers.every(signer => signer.state === 'signed' && MACHINE_ID.test(signer.machineId ?? '') && signer.personId && !signer.actorMismatch
        && !signer.replaces && !signer.altered.length))
  }

  /**
   * The acceptance check on attribution. Every replica reports the same stable attribution (stableAttribution), and
   * it matches what the harness knows: each acknowledged operation was signed by the machine whose replica
   * acknowledged it, for the intended Actor, whose person is that machine's person; each baseline operation by the
   * machine and Actor that enrolled the others; and each membership record by a machine `recordSigner` allows.
   */
  verifyAttribution(snapshots, { machineOfReplica, personOfActor, baseline, recordSigner }) {
    const views = snapshots.map(snapshot => this.stableAttribution(snapshot))
    for (const [index, view] of views.entries()) {
      assert.equal(canonical(view), canonical(views[0]), `Replica ${index}'s attribution differs between replicas`)
    }
    const [{ operations, records }] = views
    const expectSigner = (id, machineId, actorId) => {
      const signers = operations[id]
      assert.ok(signers?.length, `Operation ${id} has no signer`)
      for (const signer of signers) {
        assert.equal(signer.state, 'signed', `Operation ${id} is ${signer.state}`)
        assert.ok(signer.machineId === machineId, `Operation ${id} was signed by ${signer.machineId} but performed on ${machineId}`)
        assert.equal(signer.actorId, actorId, `Operation ${id} names the wrong Actor`)
        assert.equal(signer.personId, personOfActor[actorId], `Operation ${id} was signed for a person other than its Actor's`)
      }
    }
    for (const [id, { receipt }] of this.receipts) {
      const intent = this.intents.get(id)
      const machineId = machineOfReplica[receipt.replicaId]
      assert.ok(machineId, `No machine is known for replica ${receipt.replicaId}`)
      expectSigner(storedId(intent), machineId, intent.actorId)
    }
    for (const id of this.baseline) expectSigner(id, baseline.machineId, baseline.actorId)
    assert.ok(records.length > 0, 'No membership records were attributed')
    for (const record of records) {
      const allowed = recordSigner(record)
      assert.ok(allowed?.includes(record.signer), `Record ${record.recordId} (${record.kind} of ${record.subject}) was signed by ${record.signer}, not ${allowed?.join(' or ') || 'any machine the harness expects'}`)
    }
    return { operations: Object.keys(operations).length, records: records.length, attributionHash: hash(views[0]) }
  }

  report() { return { intents: [...this.intents.values()], expectedReplicas: Object.fromEntries(this.sources), receipts: Object.fromEntries(this.receipts) } }
}
