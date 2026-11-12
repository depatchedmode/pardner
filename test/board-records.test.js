import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { runCommand } from '../lib/cli.js'
import { reviewView } from '../lib/client-review.js'
import { shardOf, signChange } from '../lib/change-signatures.js'
import { Workspace } from '../lib/workspace.js'
import { commentView, plain, taskState } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { BOB, board, run } from '../support/activity-fixture.js'
import { eventually, withHub } from '../support/signed-hub.js'

// Rule: no record on the board can stop a view loading. Any member can write any well-formed data into any record, so
// every read that hands records to the CLI, the hub or the browser reads each one on its own: a record that is not a
// map, or has no ID it can be known by, is left out; a field holding a value of the wrong kind (including a list with an
// element of the wrong kind) reads as that kind's empty value. Each is listed in `unreadable` with the record and the
// field, and nothing on the board is changed. (Top-level keys: test/board-top-level.test.js.)

/** The kind of each field of each stored record, as the views read it: an independent statement of lib/workspace-schema.js SHAPES. */
const RECORDS = {
  actor: { map: 'actors', fields: { id: 'key', handle: 'text', kind: 'text', displayName: 'text' } },
  task: { map: 'tasks', fields: { id: 'text', actorId: 'text', created_at: 'text', branch: 'branch' } },
  goal: { map: 'goals', fields: { id: 'text', actorId: 'text', created_at: 'text' } },
  vein: { map: 'veins', fields: { id: 'text', actorId: 'text', created_at: 'text' } },
  comment: { map: 'comments', fields: { id: 'key', taskId: 'text', actorId: 'text', created_at: 'text' } },
  mention: { map: 'mentions', fields: { id: 'key', idempotency_key: 'text', taskId: 'text', commentId: 'text', toActorId: 'text', fromActorId: 'text', operationId: 'text', timestamp: 'text', commentDigest: 'text' } },
  operation: { map: 'operations', fields: { operationId: 'key', requestId: 'text', type: 'text', actorId: 'text', replicaId: 'text', timestamp: 'text', fingerprint: 'text', payload: 'map', taskId: 'text', recordIds: 'texts', changes: 'changes', result: 'map' } },
  readReceipt: { map: 'readReceipts', fields: { actorId: 'text', commentId: 'text', revisionId: 'text' } },
}
/** Each revision (one value of a record's field) and what it holds besides its value. */
const REVISION = { operationId: 'key', actorId: 'text', replicaId: 'text', timestamp: 'text', branchBaseIds: 'texts' }
const REVISIONS = {
  task: { map: 'taskFields', values: { title: 'text', description: 'text', status: 'text', priority: 'text', assignee: 'textOrNull', tags: 'texts', order: 'number', type: 'text' } },
  goal: { map: 'goalFields', values: { title: 'text', description: 'text', status: 'text' } },
  vein: { map: 'veinFields', values: { title: 'text', description: 'text', status: 'text', goalId: 'text' } },
  comment: { map: 'commentBodies', values: { text: 'text' }, also: { mentionedActorIds: 'texts' } },
  link: { map: 'veinLinks', values: { value: 'boolean' } },
}
/** Values of the wrong kind for each kind. */
const WRONG = {
  key: [null, 7, ['x'], { x: 1 }],
  text: [null, 7, ['x'], { x: 1 }, true],
  textOrNull: [7, ['x'], { x: 1 }],
  number: ['seven', null, [7], { x: 1 }],
  boolean: ['yes', 1, null],
  texts: [7, 'a', { x: 1 }, [7], ['a', null]],
  map: [7, 'a', ['x'], null],
  changes: [7, [7], [{ field: 7 }]],
  branch: [7, { parentId: 7, name: 'x' }],
}
const NOT_MAPS = [null, 7, 'not a record', ['x']]

/** What each view hands out: every field the CLI, the hub or the browser reads, with its kind (`?`: may be absent). */
const VIEWS = {
  actor: { id: 'text', handle: 'text', kind: 'text', displayName: 'text' },
  task: { id: 'text', title: 'text', description: 'text', status: 'text', priority: 'text', assignee: 'textOrNull', tags: 'texts', order: 'number', type: 'text',
    created_at: 'text', updated_at: 'text', created_by: 'text', veinIds: 'texts?', issues: 'list?', revisions: 'revisions?', conflicts: 'map?', branch_of: 'text?', branch_name: 'text?', merged: 'boolean?' },
  goal: { id: 'text', title: 'text', description: 'text', status: 'text', created_at: 'text', updated_at: 'text', created_by: 'text', revisions: 'revisions?', conflicts: 'map?' },
  vein: { id: 'text', title: 'text', description: 'text', status: 'text', goalId: 'text', created_at: 'text', updated_at: 'text', created_by: 'text', goalIds: 'texts', taskIds: 'texts',
    readyForVerdict: 'boolean', revisions: 'revisions?', conflicts: 'map?' },
  comment: { id: 'text', taskId: 'text', actorId: 'text', content: 'text', timestamp: 'text', revisionId: 'text', editedBy: 'text', deleted: 'boolean', revisionIds: 'texts', conflicts: 'list', unreadRevisionIds: 'texts?' },
  mention: { id: 'text', taskId: 'text', commentId: 'text', toActorId: 'text', fromActorId: 'text', operationId: 'text', timestamp: 'text' },
  operation: { operationId: 'text', requestId: 'text', type: 'text', actorId: 'text', replicaId: 'text', timestamp: 'text', fingerprint: 'text', payload: 'map', taskId: 'text?',
    recordIds: 'texts', changes: 'list', result: 'map' },
  readReceipt: { actorId: 'text', commentId: 'text', revisionId: 'text' },
  contextVein: { id: 'text', title: 'text', status: 'text', goalId: 'text', linkRevisions: 'texts' },
  commit: { hash: 'text', message: 'text' },
}
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const IS = {
  // An integer JSON cannot hold is handed out as its exact digits (test/entry-failures.test.js).
  text: value => typeof value === 'string', textOrNull: value => value === null || typeof value === 'string', number: value => Number.isFinite(value) || /^-?\d+$/.test(value),
  boolean: value => typeof value === 'boolean',
  texts: value => Array.isArray(value) && value.every(item => typeof item === 'string'), list: Array.isArray, map: isMap,
  revisions: value => isMap(value) && Object.values(value).every(IS.texts),
}

function wellKinded(view, record, label) {
  assert.ok(isMap(record), `${label}: a ${view} that is not a map was handed out: ${JSON.stringify(record)}`)
  for (const [field, spec] of Object.entries(VIEWS[view])) {
    const optional = spec.endsWith('?'), kind = optional ? spec.slice(0, -1) : spec
    if (optional && record[field] === undefined) continue
    assert.ok(IS[kind](record[field]), `${label}: ${view} ${field} handed out as ${JSON.stringify(record[field])}`)
  }
}

/** Every record each read hands out is of the kinds the views read. */
function checkViews({ snapshot, contexts, actors }, label) {
  const collections = { actors: 'actor', tasks: 'task', goals: 'goal', veins: 'vein', comments: 'comment', mentions: 'mention', operations: 'operation', readReceipts: 'readReceipt' }
  for (const [name, view] of Object.entries(collections)) {
    assert.ok(isMap(snapshot[name]), `${label}: the snapshot's ${name} is not a map`)
    for (const [id, record] of Object.entries(snapshot[name])) wellKinded(view, record, `${label} (snapshot ${name} ${id})`)
  }
  for (const actor of actors) wellKinded('actor', actor, `${label} (Actors)`)
  for (const [read, context] of contexts) {
    const where = `${label} (${read})`
    if (context.task) wellKinded('task', context.task, where)
    if (context.goal) wellKinded('goal', context.goal, where)
    if (context.vein) wellKinded('vein', context.vein, where)
    for (const comment of context.comments ?? []) wellKinded('comment', comment, where)
    for (const mention of context.mentions ?? []) wellKinded('mention', mention, where)
    for (const event of context.history ?? []) wellKinded('operation', event, where)
    for (const commit of context.evidence ?? []) wellKinded('commit', commit, where)
    for (const vein of read === 'taskContext' ? context.veins : []) wellKinded('contextVein', vein, where)
    for (const vein of read === 'goalContext' ? context.veins : []) wellKinded('vein', vein, where)
    for (const task of context.tasks ?? []) wellKinded('task', task, where)
    assert.ok(IS.revisions(context.revisions), `${where}: revisions handed out as ${JSON.stringify(context.revisions)}`)
  }
}

/** A board with one of every record, each written by the real write path. */
function populated() {
  let { doc } = board()
  const step = (request, actorId = 'alice') => { const result = run(doc, { actorId, ...request }); doc = result.doc; return result.event }
  const { taskId } = step({ type: 'task.create', payload: { title: 'Still here', tags: ['one'] } }).result
  const handoff = step({ type: 'task.handoff', payload: { taskId, to: 'bob', status: 'review', message: 'Over to @builder', expectedRevisions: { assignee: taskState(doc, taskId).revisions.assignee, status: taskState(doc, taskId).revisions.status } } })
  const { commentId, mentionIds: [mentionId] } = handoff.result
  step({ type: 'read.mark', payload: { taskId, comments: [{ commentId, revisionId: commentView(doc, commentId).revisionId }] } })
  step({ type: 'task.link-commit', payload: { taskId, commit: { hash: 'abc1234def', message: 'Implement it' } } })
  const { goalId } = step({ type: 'goal.create', payload: { title: 'A goal' } }).result
  const { veinId } = step({ type: 'vein.create', payload: { title: 'A vein', goalId } }).result
  step({ type: 'task.link-vein', payload: { taskId, veinId } })
  const { branchId } = step({ type: 'task.branch', payload: { taskId, name: 'experiment' } }).result
  const receipt = Object.keys(doc.readReceipts)[0]
  const operation = Object.keys(doc.operations).find(key => doc.operations[key].type.toString() === 'task.handoff')
  // Where one record of each kind is stored, and the record it belongs to.
  const ids = { actor: 'bob', task: taskId, goal: goalId, vein: veinId, comment: commentId, mention: mentionId, operation, readReceipt: receipt, link: `${taskId}:${veinId}` }
  return { doc, taskId, goalId, veinId, branchId, commentId, ids }
}

const write = (start, change) => A.change(A.clone(start, { actor: `${BOB}${'41'.repeat(8)}` }), change)
const workspaceOf = doc => new Workspace({ handle: { doc: () => doc }, replicaId: 'replica-test', workspaceId: plain(doc.workspaceId) })
/** Every read of `doc` that hands records out: each must return; a record's own context may be refused only as unreadable. */
function readAll(doc, { taskId, goalId, veinId, branchId }, unreadableRecords, label) {
  const workspace = workspaceOf(doc)
  let snapshot
  assert.doesNotThrow(() => { snapshot = workspace.snapshot() }, label)
  assert.doesNotThrow(() => JSON.stringify(snapshot), label)
  const contexts = []
  for (const [read, kind, id, ...args] of [['taskContext', 'task', taskId, 'alice'], ['taskContext', 'task', branchId], ['goalContext', 'goal', goalId], ['veinContext', 'vein', veinId]]) {
    try { contexts.push([read, workspace[read](id, ...args)]) } catch (error) {
      assert.ok(error.code === 'UNREADABLE' && unreadableRecords.has(`${kind}:${id}`), `${label}: ${read} ${id} failed: ${error.code} ${error.message}`)
    }
  }
  const actors = workspace.actors()
  checkViews({ snapshot, contexts, actors }, label)
  // The review list names Actors and tasks from the board.
  const entries = [...Object.keys(snapshot.actors), 'bob'].flatMap(actorId => [taskId, branchId].map(id => ({ id: `${actorId}:${id}`, kind: 'operation', key: id,
    shows: { actorId, type: 'task.update', taskId: id, timestamp: '2026-11-01T09:00:00.000Z', changes: [] } })))
  const reviewDoc = { ...snapshot, activity: entries, attribution: { machines: {}, summary: {}, review: entries.map(entry => ({ change: 'ab'.repeat(32), entry: entry.id, kind: 'operation', state: 'unattributed', reason: 'missing' })) } }
  let review
  assert.doesNotThrow(() => { review = reviewView(reviewDoc, 'Board') }, label)
  assert.ok(!/content can’t be printed/.test(review.listing), `${label}: the review list could not print an entry`)
  return { snapshot, contexts, actors }
}

const listed = (unreadable, kind, id, field) => unreadable.filter(item => item.kind === kind && item.id === id && (field === undefined || item.field === field))
const shownIn = { actor: 'actors', task: 'tasks', goal: 'goals', vein: 'veins', comment: 'comments', operation: 'operations', readReceipt: 'readReceipts' }

it('the table of field kinds covers every field each record on the board holds', () => {
  const { doc, ids } = populated()
  for (const [kind, { map, fields }] of Object.entries(RECORDS)) {
    for (const [id, record] of Object.entries(plain(doc[map]))) {
      for (const field of Object.keys(record)) assert.ok(Object.hasOwn(fields, field), `${kind} ${id} holds ${field}, which the table does not name`)
    }
  }
  for (const [kind, { map, also = {} }] of Object.entries(REVISIONS)) {
    for (const [key, revision] of Object.entries(plain(doc[map]))) {
      for (const field of Object.keys(revision)) assert.ok(field === 'value' || Object.hasOwn(REVISION, field) || Object.hasOwn(also, field), `${kind} revision ${key} holds ${field}, which the table does not name`)
    }
  }
  assert.equal(Object.keys(ids).length, Object.keys(RECORDS).length + 1)
})

it('every record that is not a map, in every collection, is left out and listed, and every view still reads', () => {
  const start = populated()
  const { doc: original, ids } = start
  // A record added beside the others, and one put in place of a record the board refers to.
  const cases = [{ kind: 'actor', map: 'actors', id: 'bad' }, ...Object.entries(RECORDS).map(([kind, { map }]) => ({ kind, map, id: ids[kind] })),
    { kind: 'link', map: 'veinLinks', id: ids.link }]
  for (const { kind, map, id } of cases) {
    for (const junk of NOT_MAPS) {
      const label = `${map}[${id}] as ${JSON.stringify(junk)}`
      const doc = write(original, draft => { draft[map][id] = storageValue(junk) })
      const { snapshot } = readAll(doc, start, new Set([`${kind}:${id}`]), label)
      assert.ok(listed(snapshot.unreadable, kind, id).length >= 1, `${label}: not listed: ${JSON.stringify(snapshot.unreadable)}`)
      assert.ok(!snapshot.unreadable.some(item => item.kind === 'root'), `${label}: a whole map was listed`)
      if (shownIn[kind]) assert.ok(!Object.hasOwn(snapshot[shownIn[kind]], kind === 'operation' ? plain(original.operations[id]).operationId : id), `${label}: still shown`)
      if (kind === 'link') assert.deepEqual(snapshot.veins[start.veinId].taskIds, [], `${label}: the vein still lists the task`)
      if (kind === 'mention') assert.ok(!Object.hasOwn(snapshot.mentions, id) && Object.keys(snapshot.mentions).length === 1, `${label}: the mention is still shown, or the other is not`)
      // Every other collection still loads.
      for (const name of ['tasks', 'goals', 'veins']) assert.ok(Object.keys(snapshot[name]).length > 0 || (kind === name.slice(0, -1)), `${label}: ${name} no longer load`)
    }
  }
  // Nothing on the board is changed: the record is still there, as written.
  const doc = write(original, draft => { draft.actors.bad = null })
  workspaceOf(doc).snapshot()
  assert.equal(doc.actors.bad, null)
})

it('every field of every record holding a value of the wrong kind reads as its empty value and is listed with its record and field, and every view still reads', () => {
  const start = populated()
  const { doc: original, ids } = start
  for (const [kind, { map, fields }] of Object.entries(RECORDS)) {
    // The branch is the task that has a branch field.
    const id = kind === 'task' ? start.branchId : ids[kind]
    for (const [field, spec] of Object.entries(fields)) {
      for (const junk of WRONG[spec]) {
        const label = `${map}[${id}].${field} as ${JSON.stringify(junk)}`
        const doc = write(original, draft => { draft[map][id][field] = storageValue(junk) })
        const { snapshot } = readAll(doc, start, new Set([`${kind}:${id}`]), label)
        assert.equal(listed(snapshot.unreadable, kind, id, spec === 'key' ? undefined : field).length, 1, `${label}: not listed once with its field: ${JSON.stringify(snapshot.unreadable)}`)
        const key = kind === 'operation' && field !== 'operationId' ? plain(original.operations[id]).operationId : id
        if (shownIn[kind]) assert.equal(Object.hasOwn(snapshot[shownIn[kind]], key), spec !== 'key', `${label}: ${spec === 'key' ? 'shown without its ID' : 'left out'}`)
      }
    }
  }
})

it('every revision of a field, a comment’s text and a vein link holding a value of the wrong kind, or not a map, reads as empty and is listed, and every view still reads', () => {
  const start = populated()
  const { doc: original, ids, taskId, goalId, veinId, commentId } = start
  const owners = { task: taskId, goal: goalId, vein: veinId, comment: commentId, link: ids.link }
  for (const [kind, { map, values, also = {} }] of Object.entries(REVISIONS)) {
    for (const [field, spec] of Object.entries(values)) {
      const key = kind === 'comment' || kind === 'link' ? owners[kind] : `${owners[kind]}:${field}`
      const named = kind === 'link' ? undefined : field
      const cases = [...NOT_MAPS.map(junk => [`as ${JSON.stringify(junk)}`, draft => { draft[map][key] = storageValue(junk) }]),
        ...WRONG[spec].map(junk => [`value as ${JSON.stringify(junk)}`, draft => { draft[map][key].value = storageValue(junk) }]),
        ...Object.entries({ ...REVISION, ...also }).flatMap(([part, partSpec]) => WRONG[partSpec].map(junk => [`${part} as ${JSON.stringify(junk)}`, draft => { draft[map][key][part] = storageValue(junk) }]))]
      for (const [what, change] of cases) {
        const label = `${map}[${key}] ${what}`
        const doc = write(original, change)
        const { snapshot } = readAll(doc, start, new Set(), label)
        assert.ok(listed(snapshot.unreadable, kind, owners[kind], named).length >= 1, `${label}: not listed: ${JSON.stringify(snapshot.unreadable)}`)
        // The record the revision belongs to is still shown.
        if (shownIn[kind]) assert.ok(Object.hasOwn(snapshot[shownIn[kind]], owners[kind]), `${label}: the ${kind} is no longer shown`)
      }
    }
  }
})

it('a null Actor and a task whose tags are a number are named as unreadable, and the task still reads with no tags', () => {
  const start = populated()
  const doc = write(start.doc, draft => { draft.actors.bad = null; draft.taskFields[`${start.taskId}:tags`].value = 7 })
  const workspace = workspaceOf(doc)
  const snapshot = workspace.snapshot()
  assert.ok(!Object.hasOwn(snapshot.actors, 'bad'))
  assert.deepEqual(snapshot.tasks[start.taskId].tags, [])
  assert.deepEqual(snapshot.unreadable.map(({ kind, id, field }) => `${kind} ${id}${field ? ` ${field}` : ''}`).sort(), [`actor bad`, `task ${start.taskId} tags`])
  assert.match(snapshot.unreadable.find(item => item.field === 'tags').reason, /tags is a number \(7\), not a list of text/)
  const context = workspace.taskContext(start.taskId, 'alice')
  assert.deepEqual(context.task.tags, [])
  assert.ok(context.unreadable.some(item => item.kind === 'task' && item.field === 'tags'))
  assert.ok(workspace.actors().every(actor => typeof actor.id === 'string'))
})

it('a write still names an Actor while the board holds an Actor record that is not a map', async () => {
  const start = populated()
  const doc = write(start.doc, draft => { draft.actors.bad = null })
  let current = doc
  const handle = { doc: () => current, documentId: 'board', change: fn => { current = A.change(current, fn) } }
  const workspace = new Workspace({ repo: { flush: async () => {}, persistedHeads: new Map([['board', []]]) }, handle, replicaId: 'replica-test', workspaceId: plain(doc.workspaceId), change: handle.change })
  const receipt = await workspace.execute({ operationId: randomUUID(), actorId: 'alice', type: 'comment.add', payload: { taskId: start.taskId, text: 'Still possible, @bob' } })
  assert.equal(receipt.actorId, 'alice')
  assert.equal(current.actors.bad, null)
})

it('a board holding records of the wrong kind leaves the hub, Activity, its Actors, the review list and every CLI read command readable, and says what it could not read', { timeout: 300000 }, async () => {
  await withHub(async ({ project, server, bare }) => {
    const hub = server.store
    const step = async (type, payload) => (await hub.execute({ operationId: randomUUID(), actorId: 'alice', type, payload })).result
    const { taskId } = await step('task.create', { title: 'Still here', tags: ['one'] })
    const { commentId } = await step('comment.add', { taskId, text: 'Over to @builder' })
    const { goalId } = await step('goal.create', { title: 'A goal' })
    const { veinId } = await step('vein.create', { title: 'A vein', goalId })
    await step('task.link-vein', { taskId, veinId })
    const { branchId } = await step('task.branch', { taskId, name: 'experiment' })
    await step('task.link-commit', { taskId, commit: { hash: 'abc1234def', message: 'Implement it' } })
    const member = await bare(1)
    await eventually(() => A.hasHeads(member.board.doc(), A.getHeads(hub.docHandle.doc())), 'the member never synced')
    const cli = args => runCommand([...args, '--server', `http://127.0.0.1:${server.httpPort}`, '--token', 'signed-changes-token'], {})
    const reads = [['tasks'], ['goals'], ['veins'], ['actors', 'list'], ['show', taskId], ['show', branchId], ['comments', taskId], ['goal', 'show', goalId], ['vein', 'show', veinId],
      ['activity', '--limit', '50'], ['timeline', '--limit', '50'], ['diff', taskId], ['trace', 'task', taskId], ['branches', taskId], ['status'], ['mentions', 'pending', '--actor', 'builder']]
    const writeSigned = async change => {
      member.board.change(change)
      const [hash] = A.getHeads(member.board.doc())
      member.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(member.key, project.projectId, hash) })
      await eventually(() => A.hasHeads(hub.docHandle.doc(), [hash]) && hub.attribution.log.entries.has(hash) && hub.attribution.stateOf(hash).state === 'signed', `change ${hash.slice(0, 12)} never reached the hub`)
      return hash
    }
    const operationKey = type => Object.keys(member.board.doc().operations).find(key => member.board.doc().operations[key].type.toString() === type)
    // First, fields of the wrong kind on records the board refers to, and records that are not maps beside them; then
    // the records themselves replaced by values that are not maps.
    const rounds = [
      {
        change: doc => {
          doc.actors.bad = null
          doc.actors.alice.handle = 7
          doc.taskFields[`${taskId}:tags`].value = 7
          doc.taskFields[`${taskId}:title`].value = storageValue(['x'])
          doc.taskFields[`${taskId}:priority`].timestamp = 9
          doc.tasks[branchId].branch = 7
          doc.goalFields[`${goalId}:status`].value = storageValue({ x: 1 })
          doc.veinFields[`${veinId}:goalId`].value = 7
          doc.commentBodies[commentId].mentionedActorIds = storageValue([7])
          doc.operations[operationKey('task.link-commit')].payload.commit = 7
          doc.operations[operationKey('comment.add')].recordIds = storageValue(['x', 7])
          doc.operations[operationKey('goal.create')].changes = storageValue([{ field: 7 }])
          doc.tasks['task-bad'] = 7
          doc.mentions['mention-bad'] = storageValue('x')
          doc.readReceipts['receipt-bad'] = storageValue([])
        },
        expect: [['actor', 'bad'], ['actor', 'alice', 'handle'], ['task', taskId, 'tags'], ['task', taskId, 'title'], ['task', taskId, 'priority'], ['task', branchId, 'branch'],
          ['goal', goalId, 'status'], ['vein', veinId, 'goalId'], ['comment', commentId, 'text'], ['task', 'task-bad'], ['mention', 'mention-bad'], ['readReceipt', 'receipt-bad']],
      },
      {
        change: doc => {
          doc.comments[commentId] = null
          doc.goals[goalId] = 7
          doc.veinLinks[`${taskId}:${veinId}`] = storageValue('x')
          doc.operations[operationKey('task.create')] = storageValue(['x'])
        },
        expect: [['comment', commentId], ['goal', goalId], ['link', `${taskId}:${veinId}`], ['operation', operationKey('task.create')]],
      },
    ]
    for (const [index, { change, expect }] of rounds.entries()) {
      const label = `round ${index + 1}`
      await writeSigned(change)
      let doc
      assert.doesNotThrow(() => { doc = hub.getDoc() }, label)
      assert.doesNotThrow(() => JSON.stringify(doc), label)
      for (const [kind, id, field] of expect) assert.ok(listed(doc.unreadable, kind, id, field).length >= 1, `${label}: ${kind} ${id} ${field ?? ''} is not listed: ${JSON.stringify(doc.unreadable)}`)
      assert.ok(Object.keys(doc.tasks).length > 0 && Array.isArray(doc.activity) && doc.activity.length > 0, `${label}: the board no longer loads`)
      for (const task of Object.values(doc.tasks)) wellKinded('task', task, label)
      for (const actor of await hub.getAgents()) wellKinded('actor', actor, `${label} (getAgents)`)
      // The changes are listed for review, and the review list prints.
      assert.ok(doc.attribution.review.length > 0, `${label}: nothing to review`)
      assert.ok(!/content can’t be printed/.test(reviewView(doc, 'Board').listing), `${label}: the review list could not print an entry`)
      for (const args of reads) {
        try { await cli(args) } catch (error) {
          assert.ok(error.code && error.code !== 'INTERNAL_ERROR' && !/Cannot (read|convert)|is not a function|undefined/.test(error.message), `${label}: ${args.join(' ')} failed: ${error.code} ${error.message}`)
          // Only a record's own read may be refused, and only as unreadable.
          assert.ok(error.code === 'UNREADABLE' && ['goal'].includes(args[0]), `${label}: ${args.join(' ')} was refused: ${error.code} ${error.message}`)
        }
      }
    }
  })
})
