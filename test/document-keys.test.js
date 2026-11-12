import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { Workspace } from '../lib/workspace.js'
import { storageValue } from '../lib/workspace-values.js'
import { BOB, actorsOf, board, run, signedByActor } from '../support/activity-fixture.js'
import { eventually, execute, withHub } from '../support/signed-hub.js'

// Rule: a key or an ID read from the board is only data. Whatever its name (`__proto__`, `constructor`, `toString`),
// no view throws, loses another entry, or changes a shared prototype because of it: every dictionary keyed by board
// data is a Map or an object without a prototype, read through its own properties only.

const bob = n => `${BOB}${String(n).padStart(2, '0').repeat(8)}`
const NAMES = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']

it('a register whose operation ID is __proto__, written by a change in review, does not stop the board and Activity from loading', { timeout: 90000 }, async () => {
  await withHub(async ({ server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Plain task')
    const member = await bare(1)
    await eventually(() => member.board.doc().tasks?.[result.taskId], 'the member never synced')
    // A modified client writes field values naming odd operation IDs; its change is unsigned, so it is in review.
    member.board.change(doc => {
      for (const [index, name] of NAMES.entries()) {
        doc.taskFields[`${result.taskId}:${index ? `extra${index}` : 'title'}`] = storageValue({ value: `By ${name}`, operationId: name, actorId: 'alice', replicaId: 'replica-x', timestamp: '2026-01-01T00:00:00.000Z' })
      }
    })
    const hash = A.getHeads(member.board.doc())[0]
    const hub = server.store
    await eventually(() => A.hasHeads(hub.docHandle.doc(), [hash]), 'the change never arrived')
    await eventually(() => hub.attribution.log.entries.has(hash), 'the change was never derived')
    const doc = hub.getDoc()
    assert.ok(Array.isArray(doc.activity) && doc.activity.length > 0, 'Activity loads')
    const registers = doc.attribution.registers
    assert.equal(Object.getPrototypeOf(JSON.parse(JSON.stringify({}))), Object.prototype)
    const title = JSON.parse(JSON.stringify(registers))[`taskFields:${result.taskId}:title`]
    assert.ok(title && Object.hasOwn(title, '__proto__'), 'the value is listed under its own operation ID')
    assert.equal(title.__proto__.changedBy[0].change, hash)
    for (const [index, name] of NAMES.entries()) {
      if (!index) continue
      const listed = JSON.parse(JSON.stringify(registers))[`taskFields:${result.taskId}:extra${index}`]
      assert.ok(Object.hasOwn(listed, name), `${name} is listed as data`)
    }
    assert.equal(Object.prototype.changedBy, undefined, 'no shared prototype was changed')
  })
})

/** A change by Bob's machine that writes `writes(draft)` straight into the board, as a modified client could. */
function bobWrites(doc, writes, n = 1) {
  const next = A.change(A.clone(doc, { actor: bob(n) }), writes)
  return { doc: next, hash: A.getHeads(next)[0] }
}

it('the board view reads vein links, issue links, mentions and tasks keyed by names like __proto__ as data, and keeps every ordinary one', () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Ordinary' } })
  const taskId = task.event.result.taskId
  const vein = run(task.doc, { type: 'vein.create', payload: { title: 'A vein', goal: { title: 'A goal' } } })
  const veinId = vein.event.result.veinId
  const linked = run(vein.doc, { type: 'task.link-vein', payload: { taskId, veinId } })
  const issue = run(linked.doc, { type: 'task.link-issue', payload: { taskId, repository: 'example/pardner', number: 3 } })
  const comment = run(issue.doc, { type: 'comment.add', payload: { taskId, text: 'Hello @bob' } })
  const register = value => storageValue({ value, operationId: 'op-odd', actorId: 'bob', replicaId: 'replica-x', timestamp: '2026-01-01T00:00:00.000Z' })
  const { doc } = bobWrites(comment.doc, draft => {
    for (const name of NAMES) {
      draft.veinLinks[`${name}:${veinId}`] = register(true)
      draft.veinLinks[`${taskId}:${name}`] = register(true)
      draft.operations[`op-${name}`] = storageValue({ ...issue.event, operationId: `op-${name}`, result: { taskId: name, repository: 'example/odd', number: 1 } })
      draft.mentions[`mention-${name}`] = storageValue({ id: `mention-${name}`, commentId: name, taskId: name, toActorId: name })
    }
    // Tasks named like inherited properties (Automerge hides a key named __proto__ from every enumeration).
    for (const name of NAMES.slice(1)) {
      draft.tasks[name] = storageValue({ id: name, actorId: 'bob', created_at: '2026-01-01T00:00:00.000Z' })
      for (const field of ['title', 'description', 'status', 'priority', 'assignee', 'tags', 'order', 'type']) {
        draft.taskFields[`${name}:${field}`] = register(field === 'title' ? `Task ${name}` : field === 'tags' ? [] : field === 'order' ? 1 : field === 'status' ? name : null)
      }
    }
  })
  const before = Object.getOwnPropertyNames(Object.prototype).sort()
  const snapshot = new Workspace({ handle: { doc: () => doc }, replicaId: 'replica-test' }).snapshot()
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), before, 'no shared prototype was changed')
  assert.deepEqual(snapshot.unreadable.filter(item => item.kind === 'index'), [], 'no index is lost to one odd key')
  // The ordinary link is kept, and the links to veins named like inherited properties are listed as the data they are.
  assert.deepEqual(snapshot.tasks[taskId].veinIds, [veinId, ...NAMES].sort(), 'every vein link is kept as data')
  assert.deepEqual(snapshot.tasks[taskId].issues.map(link => `${link.repository}#${link.number}`), ['example/pardner#3'], 'the ordinary issue link is kept')
  assert.ok(Object.values(snapshot.mentions).some(mention => mention.commentId === comment.event.result.commentId), 'the ordinary mention is kept')
  // A task under such a key (no write path makes one) is listed as unreadable, with why; it never borrows inherited values.
  for (const name of NAMES.slice(1)) {
    const odd = Object.hasOwn(snapshot.tasks, name) ? snapshot.tasks[name] : null
    if (odd) assert.ok(Array.isArray(odd.veinIds) && Array.isArray(odd.issues), `task ${name} has lists, not inherited values`)
    else assert.ok(snapshot.unreadable.some(item => item.kind === 'task' && item.id === name && item.reason), `task ${name} is neither shown nor listed`)
  }
  assert.ok(Object.hasOwn(snapshot.tasks, taskId), 'the ordinary task is shown')
  assert.doesNotThrow(() => JSON.stringify(snapshot))
})

it('an entry naming a field, status, role or type like an inherited property is put into words without inherited text', async () => {
  const { describeEvent, eventText } = await import('../ui-prototype/src/events.js')
  const { describeRecord } = await import('../ui-prototype/src/attribution.js')
  const event = { operationId: 'op-x', actorId: 'alice', timestamp: '2026-01-01T00:00:00.000Z', taskId: 't1', recordIds: ['t1'], result: { taskId: 't1' } }
  for (const name of NAMES) {
    const resolve = eventText(describeEvent({ ...event, type: 'task.resolve', payload: { field: name }, changes: [{ field: name, old: null, new: 'x' }] }, { actors: {}, tasks: {} }))
    assert.doesNotMatch(resolve, /function|\[object|native code/, resolve)
    const moved = eventText(describeEvent({ ...event, type: 'task.update', payload: {}, changes: [{ field: 'status', old: 'backlog', new: name }] }, { actors: {}, tasks: {} }))
    assert.doesNotMatch(moved, /function|\[object|native code/, moved)
    const record = describeRecord({ entry: { kind: 'record', record: { kind: 'member.add', role: name, displayName: 'Dee' } } }, { machines: {} })
    assert.doesNotMatch(record.parts.join(''), /function|\[object|native code/)
  }
})

it('a task status named like an inherited property is compared as the data it is, never as an inherited value', () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Ordinary' } })
  for (const name of NAMES) {
    const event = { ...task.event, type: 'task.update', operationId: `op-status-${name}`, payload: { taskId: task.event.result.taskId, updates: { status: name } },
      changes: [{ field: 'status', old: 'backlog', new: name }], recordIds: [task.event.result.taskId], result: { taskId: task.event.result.taskId } }
    const { doc, hash } = bobWrites(task.doc, draft => {
      draft.operations[event.operationId] = storageValue(event)
      draft.operationRequests[event.requestId] = storageValue(event.operationId)
      draft.taskFields[`${task.event.result.taskId}:status`] = storageValue({ value: name, operationId: event.operationId, actorId: event.actorId, replicaId: event.replicaId, timestamp: event.timestamp })
    })
    const entry = activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf }).find(item => item.changes.some(change => change.hash === hash))
    // Its change wrote exactly the status its event says: nothing differs, whatever the status is called.
    assert.deepEqual(entry.changes[0].mismatch ?? [], [], `${name}: ${JSON.stringify(entry.changes[0].mismatch)}`)
  }
})

it('the browser holds the board’s dictionaries and its label tables without a prototype, so a lookup by an ID from the board finds only what the board holds', async () => {
  const { boardData, dictionary } = await import('../ui-prototype/src/board-data.js')
  const { STATUS_LABELS } = await import('../ui-prototype/src/events.js')
  const doc = boardData(JSON.parse(JSON.stringify({ actors: { alice: { id: 'alice' } }, tasks: { t1: { title: 'One' } }, goals: {}, veins: {}, comments: {}, mentions: {}, operations: {}, readReceipts: {}, activity: [] })))
  for (const name of NAMES) {
    for (const map of ['actors', 'tasks', 'goals', 'veins', 'comments', 'mentions', 'operations', 'readReceipts']) assert.equal(doc[map][name], undefined, `${map}[${name}]`)
    assert.equal(STATUS_LABELS[name], undefined, `STATUS_LABELS[${name}]`)
    assert.equal(dictionary(doc.actors, { bob: { id: 'bob' } })[name], undefined)
  }
  assert.equal(doc.actors.alice.id, 'alice')
  assert.equal(JSON.stringify(doc.tasks), '{"t1":{"title":"One"}}')
})
