import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { canonical, commentView, digest, linkAlternatives, plain, recordState, taskState } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ALICE, actorsOf, board, run, signedByActor } from '../support/activity-fixture.js'

// Rule: what an entry's event says about the board when its operation ran is checked against the board as of that
// change's own dependencies (what the write path read), with every concurrent value there examined: values that agree
// on what the check needs are accepted, and only a real disagreement is flagged.

const replica = n => ({ actor: `${ALICE}${String(n).padStart(2, '0').repeat(8)}`, replicaId: `replica-${n}` })
const view = doc => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf, recordValid: () => true })
const flagged = doc => view(doc).filter(entry => entry.review).map(entry => ({ id: entry.id, kind: entry.kind, type: entry.event?.type, flags: entry.flags,
  mismatch: entry.changes.flatMap(change => change.mismatch ?? []).map(item => item.text) }))

test('two branches made offline from the same unchanged parent, then a third after the replicas merge, are each unflagged', () => {
  const { doc: start } = board()
  const parent = run(start, { type: 'task.create', payload: { title: 'Parent' } })
  const taskId = parent.event.result.taskId
  // Two replicas, offline from each other, each branch the same unchanged parent: both write the same base.
  const one = run(parent.doc, { type: 'task.branch', payload: { taskId, name: 'first' } }, replica(3))
  const two = run(parent.doc, { type: 'task.branch', payload: { taskId, name: 'second' } }, replica(4))
  const merged = A.merge(A.clone(one.doc), two.doc)
  const three = run(merged, { type: 'task.branch', payload: { taskId, name: 'third' } }, replica(3))
  assert.deepEqual(flagged(three.doc), [])
})

test('one comment.add retried on two offline replicas, merged, then the comment edited and deleted, are each unflagged', () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Commented' } })
  const request = { operationId: 'retried-comment', type: 'comment.add', payload: { taskId: task.event.result.taskId, text: 'Said twice' } }
  // The same request on two replicas: one operation, one comment ID, two records with their own times.
  const one = run(task.doc, request, replica(3))
  const two = run(task.doc, request, replica(4))
  const merged = A.merge(A.clone(one.doc), two.doc)
  const commentId = one.event.result.commentId
  const edited = run(merged, { type: 'comment.edit', payload: { commentId, text: 'Said once, edited', expectedRevisions: commentView(merged, commentId).revisionIds } }, replica(3))
  const deleted = run(edited.doc, { type: 'comment.delete', payload: { commentId, expectedRevisions: commentView(edited.doc, commentId).revisionIds } }, replica(4))
  assert.deepEqual(flagged(deleted.doc), [])
})

test('a branch made on a replica whose parent then held concurrent values agreeing on every field needs no review', () => {
  const { doc: start } = board()
  const parent = run(start, { type: 'task.create', payload: { title: 'Parent', status: 'in-progress' } })
  const taskId = parent.event.result.taskId
  // The same update retried on two replicas: two values of one register, from one operation.
  const update = { operationId: 'retried-update', type: 'task.update', payload: { taskId, updates: { priority: 'p1' }, expectedRevisions: { priority: taskState(parent.doc, taskId).revisions.priority } } }
  const one = run(parent.doc, update, replica(3))
  const two = run(parent.doc, update, replica(4))
  const merged = A.merge(A.clone(one.doc), two.doc)
  const branch = run(merged, { type: 'task.branch', payload: { taskId, name: 'after a retry' } }, replica(3))
  assert.deepEqual(flagged(branch.doc), [])
})

/** The side effects the real write path makes for `request` on `doc`, recorded with its event (as in operation-writes.test.js). */
function realWrites(doc, request, origin = { replicaId: 'replica-alice', timestamp: '2026-11-04T10:00:00.000Z' }) {
  const prepared = prepareOperation(doc, { actorId: 'alice', ...request }, origin)
  const state = plain(doc), writes = []
  const draft = new Proxy({}, { get: (_, map) => new Proxy(state[map] ??= {}, {
    set: (target, key, value) => { writes.push({ map, key, value: plain(value) }); target[key] = plain(value); return true },
  }) })
  prepared.change(draft)
  return { event: plain(prepared.event), writes: writes.filter(({ map }) => !['operations', 'operationRequests'].includes(map)) }
}

/** Writes `event` and `writes` as one change by Alice's machine, as a client that writes them itself would. */
function written(doc, event, writes) {
  const next = A.change(A.clone(doc, { actor: replica(6).actor }), draft => {
    draft.operations[event.operationId] = storageValue(event)
    draft.operationRequests[event.requestId] = storageValue(event.operationId)
    for (const { map, key, value } of writes) draft[map][key] = storageValue(value)
  })
  return { doc: next, hash: A.getHeads(next)[0] }
}
const entryOf = (doc, hash) => view(doc).find(entry => entry.changes.some(change => change.hash === hash))

test('an update whose event states the new status as the previous one does not say nothing changed: it shows the status written, and is flagged', async () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Quietly done' } })
  const taskId = task.event.result.taskId
  const { event, writes } = realWrites(task.doc, { operationId: 'quiet', type: 'task.update', payload: { taskId, updates: { status: 'completed' }, expectedRevisions: { status: taskState(task.doc, taskId).revisions.status } } })
  event.changes = [{ field: 'status', old: 'completed', new: 'completed' }]
  const { doc, hash } = written(task.doc, event, writes)
  assert.equal(taskState(doc, taskId).task.status, 'completed')
  const entry = entryOf(doc, hash)
  assert.equal(entry.flags.mismatch, true, 'a previous value the field did not hold is flagged')
  assert.match(entry.changes[0].mismatch.map(item => item.text).join(' '), /backlog/i, 'and says what the board held')
  const { describeEvent, eventText } = await import('../ui-prototype/src/events.js')
  const text = eventText(describeEvent(entry.shows, { actors: {}, tasks: {} }))
  assert.doesNotMatch(text, /no changes/)
  assert.match(text, /Completed/)
})

/** Every value the write path takes from the board then, lied about one at a time: each lie is flagged. */
test('each value an operation takes from the board then is checked against the board as of its change’s dependencies', () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Checked against history' } })
  const taskId = task.event.result.taskId
  const goal = run(task.doc, { type: 'goal.create', payload: { title: 'First goal' } })
  const other = run(goal.doc, { type: 'goal.create', payload: { title: 'Second goal' } })
  const vein = run(other.doc, { type: 'vein.create', payload: { title: 'A vein', goalId: goal.event.result.goalId } })
  const veinId = vein.event.result.veinId
  const linked = run(vein.doc, { type: 'task.link-vein', payload: { taskId, veinId } })
  const unlinked = run(linked.doc, { type: 'task.unlink-vein', payload: { taskId, veinId, expectedRevisions: linkAlternatives(linked.doc, taskId, veinId).map(link => link.operationId) } })
  const branch = run(unlinked.doc, { type: 'task.branch', payload: { taskId, name: 'experiment' } })
  const branchId = branch.event.result.branchId
  const renamed = run(branch.doc, { type: 'task.update', payload: { taskId: branchId, updates: { title: 'Renamed on the branch' }, expectedRevisions: { title: taskState(branch.doc, branchId).revisions.title } } })
  const doc = renamed.doc
  const revisions = (id, field) => taskState(doc, id).revisions[field]
  const lies = {
    'the previous value of a field': [{ type: 'task.update', payload: { taskId, updates: { priority: 'p1' }, expectedRevisions: { priority: revisions(taskId, 'priority') } } },
      ({ event }) => { event.changes[0].old = 'p3' }],
    'the bookkeeping a branch field carries over': [{ type: 'task.update', payload: { taskId: branchId, updates: { priority: 'p0' }, expectedRevisions: { priority: revisions(branchId, 'priority') } } },
      ({ writes }) => { for (const write of writes) if (write.map === 'taskFields') delete write.value.branchBaseIds }],
    'the link alternatives a link retires': [{ type: 'task.link-vein', payload: { taskId, veinId } },
      ({ writes }) => writes.splice(writes.findIndex(write => write.map === 'supersededRevisions'), 1)],
    'the branch status revisions a merge retires': [{ type: 'task.merge', payload: { branchId, expectedRevisions: { title: revisions(taskId, 'title') } } },
      ({ writes }) => writes.splice(writes.findIndex(write => write.map === 'supersededRevisions' && write.key.startsWith(`${branchId}:status:`)), 1)],
    'which Actors a comment’s @handles named': [{ type: 'comment.add', payload: { taskId, text: 'Over to @bob' } },
      ({ event, writes }) => {
        event.result.mentionIds = []
        for (let index = writes.length - 1; index >= 0; index--) if (writes[index].map === 'mentions') writes.splice(index, 1)
        for (const write of writes) if (write.map === 'commentBodies') write.value.mentionedActorIds = []
      }],
    'the Actor a handle named': [{ type: 'task.update', payload: { taskId, updates: { assignee: 'bob' }, expectedRevisions: { assignee: revisions(taskId, 'assignee') } } },
      ({ event, writes }) => { event.changes[0].new = 'builder'; for (const write of writes) if (write.map === 'taskFields') write.value.value = 'builder' }],
    'the parent fields a branch copies': [{ type: 'task.branch', payload: { taskId, name: 'second' } },
      ({ writes }) => {
        // A base of its own (the parent's unchanged base is already on the board), whose key is its digest, followed by every field.
        const fields = writes.filter(write => write.map === 'taskFields')
        const copied = { ...Object.fromEntries(fields.map(write => [write.key.split(':').at(-1), write.value.value])), title: 'Not the parent’s title' }
        const id = digest(canonical(copied))
        for (let index = writes.length - 1; index >= 0; index--) if (writes[index].map === 'branchBases') writes.splice(index, 1)
        writes.push({ map: 'branchBases', key: id, value: copied })
        for (const write of fields) Object.assign(write.value, { branchBaseIds: [id], ...(write.key.endsWith(':title') ? { value: copied.title } : {}) })
      }],
    'the branch fields a merge copies': [{ type: 'task.merge', payload: { branchId, expectedRevisions: { title: revisions(taskId, 'title') } } },
      ({ event, writes }) => { event.changes[0].new = 'Words the branch never held'; for (const write of writes) if (write.key === `${taskId}:title`) write.value.value = event.changes[0].new }],
    'the goals a vein leaves': [{ type: 'vein.update', payload: { veinId, updates: { goalId: other.event.result.goalId }, expectedRevisions: { goalId: recordState(doc, 'vein', veinId).revisions.goalId } } },
      ({ event }) => { event.recordIds = [veinId, taskId, other.event.result.goalId] }],
  }
  for (const [index, [label, [request, lie]]] of Object.entries(lies).entries()) {
    const honest = realWrites(doc, { operationId: `honest-${index}`, ...request })
    const plainCase = written(doc, honest.event, honest.writes)
    assert.deepEqual(entryOf(plainCase.doc, plainCase.hash).flags, {}, `${label}: the honest operation is flagged`)
    const told = realWrites(doc, { operationId: `lie-${index}`, ...request })
    lie(told)
    const { doc: next, hash } = written(doc, told.event, told.writes)
    const entry = entryOf(next, hash)
    assert.equal(entry.flags.mismatch, true, `${label}: the lie is not flagged`)
  }
})

/** `request` with one operation ID on each replica of `replicas`, each from `doc`, merged: one request retried on several replicas. */
function retried(doc, request, replicas) {
  const runs = replicas.map(n => run(doc, request, { ...replica(n), timestamp: new Date(Date.UTC(2026, 10, 2, 9, 0, n)).toISOString() }))
  return { doc: runs.slice(1).reduce((merged, next) => A.merge(merged, next.doc), A.clone(runs[0].doc)), runs }
}

test('one task.create and one task.update, each retried on two replicas at different times, are one entry each listing both changes, unflagged', () => {
  const { doc: start } = board()
  // Its order comes from each replica's own time, so the two creations differ there and nowhere else.
  const created = retried(start, { operationId: 'retried-create', type: 'task.create', payload: { title: 'Made twice' } }, [3, 4])
  const taskId = created.runs[0].event.result.taskId
  assert.notEqual(created.runs[0].event.changes.find(change => change.field === 'order').new, created.runs[1].event.changes.find(change => change.field === 'order').new)
  const updated = retried(created.doc, { operationId: 'retried-update', type: 'task.update', payload: { taskId, updates: { status: 'in-progress' },
    expectedRevisions: { status: taskState(created.doc, taskId).revisions.status } } }, [3, 4])
  assert.deepEqual(flagged(updated.doc), [])
  for (const operation of [created, updated]) {
    const entries = view(updated.doc).filter(entry => entry.kind === 'operation' && entry.key === operation.runs[0].event.operationId)
    assert.equal(entries.length, 1, 'one entry for one request')
    assert.deepEqual(entries[0].changes.map(change => change.hash).sort(), operation.runs.map(item => item.hash).sort())
  }
})

test('work on a task whose creation and whose branch were each retried on two replicas, from parents that differed, is unflagged', () => {
  const { doc: start } = board()
  const created = retried(start, { operationId: 'twice-made', type: 'task.create', payload: { title: 'Parent' } }, [3, 4])
  const taskId = created.runs[0].event.result.taskId
  const revisions = (doc, id, field) => taskState(doc, id).revisions[field]
  // The previous value of a field one operation wrote twice: either of its values.
  const reordered = run(created.doc, { type: 'task.update', payload: { taskId, updates: { order: 5 }, expectedRevisions: { order: revisions(created.doc, taskId, 'order') } } }, replica(5))
  // A branch whose parent holds two values of one operation: its base is either.
  const branched = run(created.doc, { type: 'task.branch', payload: { taskId, name: 'one' } }, replica(4))
  // One branch request retried on two replicas whose parent then differed: two bases under one operation.
  const renamed = run(branched.doc, { type: 'task.update', payload: { taskId, updates: { title: 'Parent, renamed' }, expectedRevisions: { title: revisions(branched.doc, taskId, 'title') } } }, replica(3))
  const one = run(renamed.doc, { operationId: 'twice-branched', type: 'task.branch', payload: { taskId, name: 'two' } }, replica(3))
  const two = run(branched.doc, { operationId: 'twice-branched', type: 'task.branch', payload: { taskId, name: 'two' } }, replica(4))
  const merged = A.merge(A.merge(A.clone(one.doc), two.doc), reordered.doc)
  const branchId = one.event.result.branchId
  // Its fields carry the bookkeeping of whichever register the write path read; a merge reads either base.
  const edited = run(merged, { type: 'task.update', payload: { taskId: branchId, updates: { description: 'Changed on the branch' }, expectedRevisions: { description: revisions(merged, branchId, 'description') } } }, replica(4))
  const done = run(edited.doc, { type: 'task.merge', payload: { branchId, expectedRevisions: { description: revisions(edited.doc, taskId, 'description') } } }, replica(3))
  assert.deepEqual(flagged(done.doc), [])
})
