import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { machineActor, shardOf, signChange } from '../lib/change-signatures.js'
import { canonical, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { eventually, execute, withHub } from '../support/signed-hub.js'
import { everyOperationVia } from '../support/activity-fixture.js'
import { OPERATION_TYPES } from '../lib/workspace-commands.js'
import { personIdFor } from '../lib/machine-key.js'
import { actorId as actorFor } from '../lib/client-identity.js'

// A signer line means "this machine signed exactly this content" (docs/PARDNER-TRUST-DESIGN.md, section 3). These
// tests run two or more peers, with the unusual data arriving by sync, and check every shown entry against what
// each change listed under it wrote, as Automerge itself reads that change.

const ORIGIN = ['replicaId', 'timestamp']
const withoutOrigin = event => Object.fromEntries(Object.entries(event ?? {}).filter(([field]) => !ORIGIN.includes(field)))

/** Every event change `hash` wrote, read independently: the change's own operations, and the object as of that change. */
function wrote(doc, hash) {
  const backend = A.getBackend(doc)
  const change = A.decodeChange(backend.getChangeByHash(hash))
  const maps = new Set(A.getBackend(doc).getAll('_root', 'operations').map(([, id]) => id))
  return change.ops.flatMap((op, index) => (op.action === 'makeMap' && maps.has(op.obj)
    ? [{ key: op.key, value: plain(backend.materialize(`${change.startOp + index}@${change.actor}`, [hash])) }] : []))
}

/** The operation entries a runtime shows, each with the changes listed as having written it, in either API shape. */
function shown(runtime) {
  const doc = runtime.getDoc(), attribution = doc.attribution
  if (Array.isArray(doc.activity)) return doc.activity.filter(entry => entry.kind === 'operation').map(entry => ({ key: entry.key, content: entry.event, changes: entry.changes, review: entry.review }))
  // The shape before this rework: the board's current events, each with the changes that wrote its key.
  return Object.entries(doc.operations).map(([id, { origins, ...event }]) => ({ key: id, content: attribution.signed?.[id] ?? event, changes: attribution.operations[id] ?? [],
    review: attribution.review.some(entry => (entry.operations ?? []).includes(id)) }))
}

/**
 * The invariant: under every shown entry, each listed change wrote exactly the content shown (apart from the replica
 * and time of each, when several changes are listed as one retried operation).
 */
function assertBound(runtime, label = runtime.role) {
  const board = runtime.workspace.handle.doc()
  for (const entry of shown(runtime)) {
    for (const change of entry.changes) {
      if (!change.hash) continue
      const writes = wrote(board, change.hash)
      const exact = writes.some(write => canonical(write.value) === canonical(entry.content))
      const same = writes.some(write => canonical(withoutOrigin(write.value)) === canonical(withoutOrigin(entry.content)))
      assert.ok(entry.changes.length === 1 ? exact : same,
        `${label} shows content under change ${change.hash.slice(0, 12)} (${change.state}) that it did not write: ${JSON.stringify(entry.content?.payload ?? entry.content).slice(0, 120)}`)
    }
  }
}

/** Signs a bare member's own change, as a modified client of a member machine would. */
function sign(member, projectId, hash) {
  member.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(member.key, projectId, hash) })
}

/** Waits until every runtime holds `heads` and has read and checked everything. */
async function settled(runtimes, heads) {
  for (const runtime of runtimes) {
    await eventually(() => A.hasHeads(runtime.workspace.handle.doc(), heads), `${runtime.role} never received the change`)
    await eventually(() => runtime.attribution.summary().checking === 0 && runtime.attribution.summary().pending === 0, `${runtime.role} never finished checking`)
  }
}

async function comment(runtime, text) {
  const { result } = await execute(runtime, 'A task to comment on')
  const receipt = await runtime.execute({ operationId: randomUUID(), actorId: 'alice', type: 'comment.add', payload: { taskId: result.taskId, text } })
  return plain(runtime.workspace.handle.doc().operations[receipt.operationId])
}

it('a copy of another person’s event under an earlier key, with different text, is shown under its own signer and never under theirs', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const alice = await replica(0)
    const original = await comment(alice, 'Alice’s own words')
    const bob = await bare(1)
    await eventually(() => bob.board.doc().operations?.[original.operationId], 'Bob never synced')
    // Bob's client writes a second entry under a lexically earlier key: Alice's operation ID, fingerprint and Actor,
    // with other text. Bob signs his own change.
    const copy = { ...original, payload: { ...original.payload, text: 'Words Alice never wrote' } }
    bob.board.change(doc => { doc.operations['op-0000'] = storageValue(copy) })
    const [hash] = A.getHeads(bob.board.doc())
    sign(bob, project.projectId, hash)
    await settled([server.store, alice], [hash])
    for (const runtime of [server.store, alice]) {
      assertBound(runtime)
      const entries = shown(runtime)
      assert.ok(entries.some(entry => entry.content?.payload?.text === 'Alice’s own words' && entry.changes.every(change => change.machineId === project.keys[0].machineId)),
        'Alice’s words are shown under her signer')
      const forged = entries.find(entry => entry.content?.payload?.text === 'Words Alice never wrote')
      assert.ok(forged, 'Bob’s entry is shown')
      assert.deepEqual(forged.changes.map(change => [change.hash, change.machineId]), [[hash, project.keys[1].machineId]], 'under Bob’s signer only')
      assert.equal(forged.review, true, 'and listed for review')
    }
  })
})

it('each of many concurrent values at one key is shown with only the change that wrote it, none dropped', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const alice = await replica(0)
    const original = await comment(alice, 'The first value')
    const bob = await bare(1)
    await eventually(() => bob.board.doc().operations?.[original.operationId], 'Bob never synced')
    // Ten concurrent values at Alice's key, each in its own change, each signed by Bob's machine.
    const base = bob.board.doc(), hashes = []
    let merged = A.clone(base)
    for (let index = 0; index < 10; index++) {
      // Each fork has its own actor with Bob's machine prefix, as ten loads of his document would.
      const fork = A.change(A.clone(base, { actor: machineActor(bob.key) }), doc => { doc.operations[original.operationId] = storageValue({ ...original, payload: { ...original.payload, text: `Concurrent value ${index}` } }) })
      hashes.push(A.getHeads(fork)[0])
      merged = A.merge(merged, fork)
    }
    bob.board.update(doc => A.merge(doc, merged))
    for (const hash of hashes) sign(bob, project.projectId, hash)
    await settled([server.store, alice], hashes)
    for (const runtime of [server.store, alice]) {
      assertBound(runtime)
      const entries = shown(runtime)
      for (const [index, hash] of hashes.entries()) {
        const holding = entries.filter(entry => entry.changes.some(change => change.hash === hash))
        assert.equal(holding.length, 1, `Bob’s change ${index} is shown exactly once`)
        assert.equal(holding[0].content.payload.text, `Concurrent value ${index}`)
        assert.equal(holding[0].changes.length, 1)
        assert.equal(holding[0].review, true, 'another change wrote a different value at its key')
      }
      assert.ok(entries.some(entry => entry.content?.payload?.text === 'The first value' && entry.changes.every(change => change.machineId === project.keys[0].machineId)),
        'Alice’s value is still shown under her signer')
    }
  })
})

it('an edit inside another person’s signed entry changes nothing shown under their signer; the edit is listed under its own', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const alice = await replica(0)
    const original = await comment(alice, 'Exactly what Alice signed')
    const bob = await bare(1)
    await eventually(() => bob.board.doc().operations?.[original.operationId], 'Bob never synced')
    bob.board.change(doc => { doc.operations[original.operationId].payload.text = new A.ImmutableString('Edited inside the entry') })
    const [hash] = A.getHeads(bob.board.doc())
    sign(bob, project.projectId, hash)
    const late = await replica(2)
    await settled([server.store, alice, late], [hash])
    for (const runtime of [server.store, alice, late]) {
      assertBound(runtime)
      assert.ok(!shown(runtime).some(entry => entry.content?.payload?.text === 'Edited inside the entry'), 'the edit is never shown as an Activity entry')
      const review = runtime.getDoc().attribution.review.find(entry => (entry.change ?? entry.id) === hash || entry.changes?.some(change => change.hash === hash))
      assert.ok(review, 'the edit is listed for review')
    }
  })
})

it('every ordinary operation type and every record flow is shown on every peer as one signed entry of its own change, with nothing flagged', { timeout: 120000 }, async () => {
  // Each machine acts as its own person's Actor, which it is certified for: the hub's owner registers itself first.
  await withHub(async ({ project, server, replica }) => {
    const owner = actorFor(personIdFor(project.owner.publicKey)), member = actorFor(personIdFor(project.keys[0].publicKey))
    const register = payload => server.store.execute({ operationId: randomUUID(), actorId: owner, type: 'actor.register', payload })
    await register({ id: owner, handle: 'owner', kind: 'human', displayName: 'Owner' })
    await register({ id: member, handle: 'member-zero', kind: 'human', displayName: 'Member Zero' })
    const writer = await replica(0)
    const receipts = await everyOperationVia({ execute: request => writer.execute(request), doc: () => writer.workspace.handle.doc(), register, actorId: member, recipient: owner })
    assert.deepEqual([...new Set(receipts.map(item => item.type))].sort(), [...OPERATION_TYPES].sort(), 'every operation type ran')
    const late = await replica(1)
    const heads = A.getHeads(writer.workspace.handle.doc())
    await settled([server.store, writer, late], heads)
    for (const runtime of [server.store, writer, late]) {
      assertBound(runtime)
      const { activity, attribution } = runtime.getDoc()
      await eventually(() => runtime.getDoc().attribution.review.length === 0, () => `${runtime.role} lists ${runtime.getDoc().attribution.review.length} changes for review: ${JSON.stringify(runtime.getDoc().attribution.review.map(item => [item.kind, item.flags, item.state]))}`)
      assert.ok(activity.every(entry => !entry.review && !Object.keys(entry.flags).length && entry.changes.every(change => change.state === 'signed')), `${runtime.role} flags an ordinary entry`)
      for (const { receipt } of receipts) {
        const entries = activity.filter(entry => entry.kind === 'operation' && entry.key === receipt.operationId)
        assert.equal(entries.length, 1)
        assert.equal(entries[0].changes.length, 1)
      }
      // Records: the gate's admissions, and the creation change's genesis, each signed and valid.
      const records = activity.filter(entry => entry.kind === 'record')
      assert.ok(records.length >= project.all.length && records.every(entry => !entry.flags.invalidRecord))
      assert.equal(new Set(activity.flatMap(entry => entry.changes.map(change => change.hash))).size, attribution.summary.changes, 'every change is shown')
    }
  }, { hubOptions: { actors: [] } })
})

it('a field alternative another member’s change wrote in someone else’s name is said to be changed by someone else; the real author’s is not', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const owner = actorFor(personIdFor(project.owner.publicKey)), member = actorFor(personIdFor(project.keys[0].publicKey))
    const register = payload => server.store.execute({ operationId: randomUUID(), actorId: owner, type: 'actor.register', payload })
    await register({ id: owner, handle: 'owner', kind: 'human' })
    await register({ id: member, handle: 'member-zero', kind: 'human' })
    const alice = await replica(0)
    const created = await alice.execute({ operationId: randomUUID(), actorId: member, type: 'task.create', payload: { title: 'Original title' } })
    const taskId = created.result.taskId, key = `${taskId}:title`
    const bob = await bare(1)
    await eventually(() => bob.board.doc().taskFields?.[key], 'Bob never synced')
    // Bob's client prepares a title value in Alice's name, concurrent with her own edit below, and signs it.
    const fork = A.change(A.clone(bob.board.doc(), { actor: machineActor(bob.key) }), doc => {
      doc.taskFields[key] = storageValue({ value: 'Forged title', operationId: 'op-forged', actorId: member, replicaId: 'r', timestamp: new Date().toISOString() })
    })
    const [forged] = A.getHeads(fork)
    const revisions = alice.workspace.taskContext(taskId).revisions
    const edited = await alice.execute({ operationId: randomUUID(), actorId: member, type: 'task.update', payload: { taskId, updates: { title: 'Alice’s title' }, expectedRevisions: { title: revisions.title } } })
    bob.board.update(doc => A.merge(doc, fork))
    sign(bob, project.projectId, forged)
    await settled([server.store, alice], [forged, A.getHeads(alice.workspace.handle.doc())[0]])
    for (const runtime of [server.store, alice]) {
      const doc = runtime.getDoc()
      assert.equal(doc.tasks[taskId].conflicts.title.length, 2, 'both values are kept for explicit resolution')
      const listed = await eventually(() => runtime.getDoc().attribution.registers?.[`taskFields:${key}`], `${runtime.role} never listed the alternative`)
      assert.deepEqual(Object.keys(listed), ['op-forged'], 'only the value Alice did not write is listed')
      assert.equal(listed['op-forged'].changedBy[0].change, forged)
      assert.ok(doc.tasks[taskId].conflicts.title.some(choice => choice.operationId === edited.operationId))
    }
  }, { hubOptions: { actors: [] } })
})
