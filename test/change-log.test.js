import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { ChangeLog, MAX_CHANGE_OPS, deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { OPERATION_TYPES } from '../lib/workspace-commands.js'
import { canonical, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ALICE, BOB, MACHINES, actorsOf, board, everyOperation, run, signedByActor, writeRecords } from '../support/activity-fixture.js'

// The per-change derivation (lib/change-log.js) and its view (lib/activity.js), as pure functions of the board's
// changes and each change's verdict.

const bob = n => `${BOB}${String(n).padStart(2, '0').repeat(8)}`
const view = (doc, recordValid = () => true) => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf, recordValid,
  changeOfObject: objId => A.getChangesMetaSince(doc, []).find(meta => meta.actor === objId.split('@')[1] && Number(objId.split('@')[0]) >= meta.startOp && Number(objId.split('@')[0]) <= meta.maxOp)?.hash ?? null })
const operations = shown => shown.filter(entry => entry.kind === 'operation')

test('every ordinary operation type and every record flow is one entry per change, exactly as the change wrote it, with nothing flagged', () => {
  const { project, doc: start } = board({ actors: false })
  const { doc: operated, written } = everyOperation(start)
  assert.deepEqual([...new Set(written.map(item => item.event.type))].sort(), [...OPERATION_TYPES].sort(), 'the fixture runs every operation type')
  // Records as the gate writes them, then a write-back after a member replaced the membership map.
  let doc = writeRecords(operated, project.records)
  doc = A.change(A.clone(doc, { actor: `${BOB}${'09'.repeat(8)}` }), draft => { draft.membership = {} })
  doc = writeRecords(doc, project.all, { remake: true })
  const entries = deriveAll(doc)
  assert.equal(entries.size, A.getChangesMetaSince(doc, []).length, 'every change has an entry')
  for (const { hash, event } of written) {
    const entry = entries.get(hash)
    assert.equal(entry.kind, 'operation', `${event.type} is an operation`)
    assert.equal(entry.key, event.operationId)
    assert.equal(canonical(entry.event), canonical(event), `${event.type} is shown as written`)
    assert.equal(entry.unusual, undefined, `${event.type} wrote nothing unusual`)
  }
  const [creation] = A.getChangesMetaSince(doc, [])
  assert.equal(entries.get(creation.hash).kind, 'creation')
  assert.deepEqual(entries.get(creation.hash).records.map(({ record }) => record.recordId), [project.genesis.recordId])
  const valid = record => project.all.some(known => canonical(known) === canonical(record))
  const shown = view(doc, valid)
  const vandal = shown.find(entry => entry.kind === 'unrecognised')
  assert.ok(vandal, 'the change that emptied the membership map is listed')
  assert.deepEqual(shown.filter(entry => entry.review).map(entry => entry.id), [vandal.id], 'only that change needs review')
  // Every record is one entry, each listing every change that wrote it.
  const records = shown.filter(entry => entry.kind === 'record')
  assert.deepEqual(records.map(entry => entry.record.recordId).sort(), project.all.map(record => record.recordId).sort())
  assert.ok(records.filter(entry => entry.record.kind !== 'project.genesis').every(entry => entry.changes.length === 2), 'written by the gate, then written back')
})

test('a copy of another person’s event under an earlier key, with different text, is that change’s own entry', () => {
  let { doc } = board()
  const { doc: withTask, event: created } = run(doc, { type: 'task.create', payload: { title: 'Shared' } })
  const comment = run(withTask, { type: 'comment.add', payload: { taskId: created.result.taskId, text: 'Alice’s own words' } })
  const copy = { ...comment.event, payload: { ...comment.event.payload, text: 'Words Alice never wrote' } }
  doc = A.change(A.clone(comment.doc, { actor: bob(1) }), draft => { draft.operations['op-0000'] = storageValue(copy) })
  const forged = A.getHeads(doc)[0]
  const entries = deriveAll(doc)
  assert.equal(entries.get(comment.hash).event.payload.text, 'Alice’s own words')
  assert.deepEqual([entries.get(forged).key, entries.get(forged).event.payload.text], ['op-0000', 'Words Alice never wrote'])
  const shown = operations(view(doc))
  const alices = shown.find(entry => entry.changes.some(change => change.hash === comment.hash))
  assert.equal(alices.event.payload.text, 'Alice’s own words')
  assert.deepEqual(alices.changes.map(change => change.hash), [comment.hash])
  assert.equal(alices.review, false)
  const bobs = shown.find(entry => entry.changes.some(change => change.hash === forged))
  assert.deepEqual(bobs.changes.map(change => [change.hash, change.machineId]), [[forged, MACHINES[BOB]]])
  assert.deepEqual(Object.keys(bobs.flags).sort(), ['actorMismatch', 'idMismatch', 'keyMismatch'])
  assert.equal(bobs.review, true)
})

test('each of many concurrent values at one key is its own entry with its own change; none is dropped and none is listed under another', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Contended' } })
  const forks = Array.from({ length: 12 }, (_, index) => A.change(A.clone(created.doc, { actor: bob(index) }), draft => {
    draft.operations[created.event.operationId] = storageValue({ ...created.event, payload: { title: `Value ${index}` } })
  }))
  let doc = created.doc
  for (const fork of forks) doc = A.merge(doc, fork)
  const hashes = forks.map(fork => A.getHeads(fork)[0])
  const shown = operations(view(doc))
  for (const [index, hash] of hashes.entries()) {
    const holding = shown.filter(entry => entry.changes.some(change => change.hash === hash))
    assert.equal(holding.length, 1)
    assert.deepEqual(holding[0].changes.map(change => change.hash), [hash])
    assert.equal(holding[0].event.payload.title, `Value ${index}`)
    assert.equal(holding[0].flags.sameKey.length, 12, 'flagged with every other change that wrote the key')
  }
  const original = shown.find(entry => entry.changes.some(change => change.hash === created.hash))
  assert.equal(original.event.payload.title, 'Contended', 'the first value is still shown, under its own change')
})

test('what later changes do to the board never changes an entry: its time, text and IDs are the ones its change wrote', () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Original title' } })
  const comment = run(task.doc, { type: 'comment.add', payload: { taskId: task.event.result.taskId, text: 'What Alice wrote' } }, { timestamp: '2026-11-01T09:30:00.000Z' })
  const before = canonical(deriveAll(comment.doc).get(comment.hash))
  // Another member renames the task, renames Alice, rewrites the comment's body and marks it deleted.
  const commentId = comment.event.result.commentId
  const doc = A.change(A.clone(comment.doc, { actor: bob(2) }), draft => {
    draft.taskFields[`${task.event.result.taskId}:title`] = storageValue({ value: 'Renamed later', operationId: 'op-other', actorId: 'bob', replicaId: 'r', timestamp: '2027-01-01T00:00:00.000Z' })
    draft.actors.alice = storageValue({ id: 'alice', handle: 'alice', kind: 'human', displayName: 'Someone else' })
    draft.commentBodies[commentId] = storageValue({ value: 'Words put in Alice’s mouth', operationId: comment.event.operationId, actorId: 'alice', replicaId: 'r', timestamp: '2026-11-01T09:30:00.000Z', mentionedActorIds: [] })
    draft.deletedComments[commentId] = true
  })
  assert.equal(canonical(deriveAll(doc).get(comment.hash)), before, 'the entry is derived from its change alone')
  const shown = view(doc).find(entry => entry.id === comment.hash)
  assert.equal(shown.timestamp, '2026-11-01T09:30:00.000Z', 'the time shown is the signed one')
  assert.equal(shown.event.payload.text, 'What Alice wrote')
  assert.equal(view(doc).find(entry => entry.changes[0].hash === A.getHeads(doc)[0]).kind, 'unrecognised', 'the change that wrote no event is listed on its own')
})

test('an edit inside an entry another change made, a deletion and a re-creation are each the editing change’s own entry, and the original stays', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Signed by Alice' } })
  const edited = A.change(A.clone(created.doc, { actor: bob(3) }), draft => { draft.operations[created.event.operationId].payload.title = new A.ImmutableString('Edited inside') })
  const deleted = A.change(A.clone(edited, { actor: bob(3) }), draft => { delete draft.operations[created.event.operationId] })
  const recreated = A.change(A.clone(deleted, { actor: bob(3) }), draft => { draft.operations[created.event.operationId] = storageValue({ ...created.event, payload: { title: 'Made again' } }) })
  const [editHash, deleteHash, recreateHash] = [edited, deleted, recreated].map(doc => A.getHeads(doc)[0])
  const shown = view(recreated)
  const original = shown.find(entry => entry.id === created.hash)
  assert.equal(original.event.payload.title, 'Signed by Alice')
  assert.deepEqual(original.flags.sameKey, [recreateHash])
  const edit = shown.find(entry => entry.id === editHash)
  assert.equal(edit.kind, 'unrecognised')
  assert.deepEqual(edit.altered, [created.hash], 'it names the change whose content it altered')
  assert.equal(shown.find(entry => entry.id === deleteHash).kind, 'unrecognised')
  const again = shown.find(entry => entry.id === recreateHash)
  assert.equal(again.event.payload.title, 'Made again')
  assert.ok(again.flags.sameKey && again.flags.idMismatch && again.flags.actorMismatch)
  assert.ok(shown.filter(entry => entry.review).length >= 3)
})

test('one operation retried on two replicas is one entry listing both changes, each with its own replica, time and signer; different content is not merged', () => {
  const { doc: start } = board()
  // A goal's event holds nothing that depends on when or where it was made, apart from its replica and timestamp. (A
  // task.create retried later computes another order, so it is another value, shown as its own entry.)
  const request = { type: 'goal.create', operationId: 'shared-retry', payload: { title: 'Retried' } }
  const left = run(start, request, { replicaId: 'replica-left', timestamp: '2026-11-01T10:00:00.000Z' })
  const right = run(start, request, { actor: `${ALICE}${'03'.repeat(8)}`, replicaId: 'replica-right', timestamp: '2026-11-01T10:00:05.000Z' })
  const doc = A.merge(A.clone(left.doc), right.doc)
  const shown = operations(view(doc)).filter(entry => entry.key === left.event.operationId)
  assert.equal(shown.length, 1)
  assert.deepEqual(shown[0].changes.map(change => [change.hash, change.replicaId, change.timestamp]),
    [[left.hash, 'replica-left', '2026-11-01T10:00:00.000Z'], [right.hash, 'replica-right', '2026-11-01T10:00:05.000Z']])
  assert.equal(shown[0].review, false)
  // Another member's copy, equal apart from its time, is not a retry of Alice's operation: it is its own entry.
  const copy = A.change(A.clone(doc, { actor: bob(7) }), draft => { draft.operations[left.event.operationId] = storageValue({ ...left.event, timestamp: '2020-01-01T00:00:00.000Z' }) })
  const withCopy = operations(view(copy)).filter(entry => entry.key === left.event.operationId)
  assert.equal(withCopy.length, 2)
  const copied = withCopy.find(entry => entry.changes.some(change => change.machineId === MACHINES[BOB]))
  assert.deepEqual([copied.changes.length, Boolean(copied.flags.actorMismatch), copied.review], [1, true, true])
  assert.ok(withCopy.every(entry => entry.flags.sameKey?.length), 'and both are flagged: two changes wrote the key')
  // A third replica that observed another state wrote other `changes`: its own entry, and every entry is flagged.
  const other = A.change(A.clone(start, { actor: bob(4) }), draft => { draft.operations[left.event.operationId] = storageValue({ ...left.event, changes: [], replicaId: 'replica-bob' }) })
  const all = operations(view(A.merge(A.clone(doc), other))).filter(entry => entry.key === left.event.operationId)
  assert.equal(all.length, 2)
  assert.ok(all.every(entry => entry.flags.sameKey?.length))
})

test('a change too large to read is listed for review without being decoded', () => {
  const { doc: start } = board()
  const big = A.change(A.clone(start, { actor: bob(5) }), draft => { draft.name = new A.ImmutableString('x'); for (let index = 0; index <= MAX_CHANGE_OPS; index++) draft.taskFields[`k${index}`] = index })
  const [hash] = A.getHeads(big)
  const log = new ChangeLog({ board: { doc: () => big } })
  log.note(A.getChangesMetaSince(big, []))
  while (!log.complete) log.slice()
  const entry = log.entries.get(hash)
  assert.deepEqual([entry.kind, entry.oversized, entry.ops], ['unrecognised', true, MAX_CHANGE_OPS + 2])
  assert.equal(entry.wrote, undefined, 'nothing it wrote was read')
  assert.equal(activityView({ entries: log.entries.values(), stateOf: signedByActor(big) }).find(item => item.id === hash).review, true)
})

test('an event is read from its change exactly as Automerge reads the object as of that change; text inside it is not plain data', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Lists and text', tags: ['a', 'b', 'c'] } })
  // A change that builds an event with nested lists, edits and deletions inside its own objects.
  const shaped = A.change(A.clone(created.doc, { actor: bob(6) }), draft => {
    draft.operations['op-shaped'] = storageValue({ ...created.event, payload: { title: 'Shaped', list: [1, 2, 3, { deep: [true, null] }] } })
    const payload = draft.operations['op-shaped'].payload
    payload.list.splice(1, 1)
    payload.list.insertAt(0, new A.ImmutableString('zero'))
    payload.list[3].deep.push(new A.ImmutableString('more'))
    delete payload.title
    payload.title = new A.ImmutableString('Shaped again')
  })
  const [hash] = A.getHeads(shaped)
  const entry = deriveAll(shaped).get(hash)
  const objId = A.getObjectId(shaped.operations['op-shaped'])
  assert.equal(canonical(entry.event), canonical(plain(A.getBackend(shaped).materialize(objId, [hash]))))
  const texted = A.change(A.clone(shaped, { actor: bob(6) }), draft => { draft.operations['op-text'] = { ...plain(draft.operations['op-shaped']), payload: { title: 'collaborative text' } } })
  assert.equal(deriveAll(texted).get(A.getHeads(texted)[0]).kind, 'unrecognised', 'text is an Automerge type, not a plain string')
})

test('derivation is resumable: entries are stored by change hash, and a log loaded from them derives only new changes', () => {
  const { doc } = everyOperation()
  const rows = new Map()
  const store = { derivedEntries: wanted => [...rows].filter(([hash]) => wanted.has(hash)), addDerived: added => { for (const [hash, entry] of added) rows.set(hash, structuredClone(entry)) } }
  const metas = A.getChangesMetaSince(doc, [])
  const first = new ChangeLog({ board: { doc: () => doc }, store, opsPerSlice: 40 })
  first.load(metas)
  let slices = 0
  while (!first.complete) { first.slice(); first.save(); slices++ }
  assert.ok(slices > 1, 'the work was split into slices by operations')
  const more = run(doc, { type: 'goal.create', payload: { title: 'After reopening' } })
  const reopened = new ChangeLog({ board: { doc: () => more.doc }, store })
  reopened.load(A.getChangesMetaSince(more.doc, []))
  assert.equal(reopened.remaining, 1, 'only the new change is left to derive')
  reopened.slice()
  assert.equal(canonical([...reopened.entries.values()].filter(entry => entry.hash !== more.hash)), canonical([...first.entries.values()]))
  assert.equal(reopened.entries.get(more.hash).event.payload.title, 'After reopening')
})

test('a second change with no dependencies is never hidden: with no record it is unrecognised, and a copied genesis flags both creations', () => {
  const { project, doc: start } = board()
  // A change on a history of its own, writing a top-level key and no record.
  const stray = A.change(A.init({ actor: bob(8) }), draft => { draft.name = new A.ImmutableString('Another board') })
  const merged = A.merge(A.clone(start), stray)
  const [strayHash] = A.getHeads(stray)
  const shown = view(merged)
  assert.equal(shown.find(entry => entry.id === strayHash)?.kind, 'unrecognised', 'it is shown, for review')
  // A second creation that copies the genesis record: the record is one entry listing both, and both are flagged.
  const twin = A.change(A.init({ actor: bob(9) }), draft => { draft.membership = { [project.genesis.recordId]: storageValue(project.genesis) } })
  const both = A.merge(A.clone(start), twin)
  const genesis = view(both, () => true).find(entry => entry.kind === 'record' && entry.key === project.genesis.recordId)
  assert.equal(genesis.changes.length, 2)
  assert.equal(genesis.flags.alsoCreated.length, 2)
  assert.equal(genesis.review, true)
})

test('a records change that also writes anything else is flagged', () => {
  const { project, doc: start } = board()
  const doc = A.change(A.clone(start, { actor: bob(10) }), draft => {
    draft.membership[project.records[0].recordId] = storageValue(project.records[0])
    draft.taskFields['task-x:title'] = storageValue({ value: 'Beside a record', operationId: 'op-x', actorId: 'alice', replicaId: 'r', timestamp: '2026-01-01T00:00:00.000Z' })
  })
  const record = view(doc, () => true).find(entry => entry.kind === 'record' && entry.key === project.records[0].recordId)
  assert.equal(record.flags.alsoWrote, true)
  assert.equal(record.review, true)
})
