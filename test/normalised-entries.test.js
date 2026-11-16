import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { canonical, digest, plain, taskState } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ALICE, actorsOf, board, everyOperation, run, signedByActor } from '../support/activity-fixture.js'

// Rule: an entry has one reading. The derivation checks each event against its change's writes and produces one
// normalised structure (`shows`: one value per field, as its change wrote it, the comment text it wrote, the records
// it names); every renderer (the browser, the CLI and the review list) reads that structure and nothing else of the
// event, so a check and a renderer can never pick different elements of one event. Any list the write set is built
// from that names one field, key or target twice is a mismatch.

const alice = n => `${ALICE}${String(n).padStart(2, '0').repeat(8)}`
const view = doc => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf, recordValid: () => true })
const entryOf = (doc, hash) => view(doc).find(entry => entry.changes.some(change => change.hash === hash))

/** Runs `request` through the real write path, then rewrites its event with `edit` in the same change, as a modified client could. */
function rewritten(doc, request, edit, { recompute = false } = {}) {
  const prepared = prepareOperation(doc, { actorId: 'alice', ...request }, { replicaId: 'replica-alice', timestamp: '2026-11-03T10:00:00.000Z' })
  const event = edit(plain(prepared.event))
  if (recompute) {
    event.fingerprint = digest(canonical({ type: event.type, actorId: event.actorId, payload: event.payload }))
    event.operationId = `op-${digest(canonical([event.requestId, event.fingerprint]))}`
  }
  const next = A.change(A.clone(doc, { actor: alice(5) }), draft => {
    prepared.change(draft)
    if (event.operationId !== prepared.event.operationId) delete draft.operations[prepared.event.operationId]
    draft.operations[event.operationId] = storageValue(event)
    draft.operationRequests[event.requestId] = storageValue(event.operationId)
  })
  return { doc: next, hash: A.getHeads(next)[0], event }
}

/** A board where a branch of task "Original" renamed it to `title`, ready to merge. */
function branchRenamed(title) {
  const { doc: start } = board()
  const parent = run(start, { type: 'task.create', payload: { title: 'Original' } })
  const taskId = parent.event.result.taskId
  const branch = run(parent.doc, { type: 'task.branch', payload: { taskId, name: 'rename' } })
  const branchId = branch.event.result.branchId
  const renamed = run(branch.doc, { type: 'task.update', payload: { taskId: branchId, updates: { title }, expectedRevisions: { title: taskState(branch.doc, branchId).revisions.title } } })
  return { doc: renamed.doc, taskId, branchId }
}

test('a merge whose event lists the title twice, the first naming a harmless value its change did not write, does not match what it did, and every reader shows the value written', async () => {
  const { doc, taskId, branchId } = branchRenamed('MALICIOUS')
  const merge = { operationId: 'merge-it', type: 'task.merge', payload: { branchId, expectedRevisions: { title: taskState(doc, taskId).revisions.title } } }
  const { doc: next, hash } = rewritten(doc, merge, event => ({ ...event, changes: [{ field: 'title', old: 'Original', new: 'HARMLESS' }, ...event.changes] }))
  assert.equal(taskState(next, taskId).task.title, 'MALICIOUS', 'the board holds what the change wrote')
  const entry = entryOf(next, hash)
  assert.equal(entry.flags.mismatch, true, `not flagged: ${JSON.stringify(entry.changes[0].mismatch)}`)
  assert.equal(entry.review, true)
  // Every reader reads one structure: the title its change wrote, once.
  assert.deepEqual(entry.shows.changes.filter(change => change.field === 'title').map(change => change.new), ['MALICIOUS'])
  const { describeEvent } = await import('../ui-prototype/src/events.js')
  const detail = describeEvent(entry.shows, { actors: {}, tasks: {} }).detail
  assert.match(detail, /MALICIOUS/)
  assert.doesNotMatch(detail, /HARMLESS/)
  const { diffItems } = await import('../lib/cli.js')
  const diff = diffItems({ activity: [entry], actors: {}, tasks: {} }, taskId)
  assert.deepEqual(diff.filter(change => change.field === 'title').map(change => change.new), ['MALICIOUS'])
})

test('in every operation type, an event whose changes, records, results or receipts name one field, key or target twice does not match what it did', () => {
  const { written } = everyOperation()
  const base = board({ actors: false }).doc
  let variants = 0
  // Each operation, on the state before it ran, rewritten with a list naming something twice.
  let doc = base
  for (const step of written) {
    const request = { operationId: step.event.requestId, actorId: step.event.actorId, type: step.event.type, payload: step.event.payload }
    const lists = []
    if (step.event.changes.length) {
      const [first] = step.event.changes
      lists.push(['changes, the first naming another value', event => ({ ...event, changes: [{ ...first, new: first.field === 'tags' ? ['other'] : first.field === 'order' ? 1 : `other ${first.field}` }, ...event.changes] })])
      lists.push(['changes, one field twice alike', event => ({ ...event, changes: [...event.changes, first] })])
    }
    if (step.event.recordIds.length) lists.push(['recordIds', event => ({ ...event, recordIds: [...event.recordIds, event.recordIds[0]] })])
    if (step.event.result.mentionIds?.length) lists.push(['result.mentionIds', event => ({ ...event, result: { ...event.result, mentionIds: [...event.result.mentionIds, event.result.mentionIds[0]] } })])
    for (const [label, edit] of lists) {
      const { doc: next, hash } = rewritten(doc, request, edit)
      const entry = entryOf(next, hash)
      assert.equal(entry.flags.mismatch, true, `${step.event.type}: ${label} is not reported`)
      variants++
    }
    if (step.event.type === 'read.mark') {
      // The same comment revision named twice: one receipt is written, and the event says two were read.
      const twice = { ...request, operationId: 'read-twice' }
      const { doc: next, hash } = rewritten(doc, twice, event => ({ ...event, payload: { ...event.payload, comments: [...event.payload.comments, ...event.payload.comments] }, result: { ...event.result, receipts: 2 } }), { recompute: true })
      const entry = entryOf(next, hash)
      assert.equal(entry.flags.idMismatch, undefined, 'its ID is the one its content gives')
      assert.equal(entry.flags.mismatch, true, `read.mark: one receipt named twice is not reported: ${JSON.stringify(entry.changes[0].mismatch)}`)
      variants++
    }
    doc = step.doc
  }
  assert.ok(variants >= 50, `only ${variants} variants`)
})

test('the write path refuses a read receipt named twice in one request', () => {
  const { written } = everyOperation()
  const read = written.find(step => step.event.type === 'read.mark')
  const before = written[written.indexOf(read) - 1].doc
  assert.throws(() => prepareOperation(before, { operationId: 'twice', actorId: 'alice', type: 'read.mark', payload: { ...read.event.payload, comments: [...read.event.payload.comments, ...read.event.payload.comments] } },
    { replicaId: 'replica-alice', timestamp: '2026-11-03T10:00:00.000Z' }), /once/)
})

test('a handoff whose payload also carries other words shows, in the browser, the CLI and the review list, the words its change wrote into the comment', async () => {
  const { doc: start } = board()
  const task = run(start, { type: 'task.create', payload: { title: 'Handed over' } })
  const taskId = task.event.result.taskId
  // Through the real write path: the signed payload also carries `text`, which a handoff ignores.
  const { doc, hash } = run(task.doc, { operationId: 'handoff-words', type: 'task.handoff', payload: { taskId, to: 'builder', status: 'review', message: 'Rejected: do not ship',
    text: 'Approved for release', expectedRevisions: { assignee: taskState(task.doc, taskId).revisions.assignee, status: taskState(task.doc, taskId).revisions.status } } })
  const entry = entryOf(doc, hash)
  assert.deepEqual(entry.flags, {}, 'its writes are the ones its event implies')
  assert.equal(entry.shows.comment.text, 'Rejected: do not ship')
  const { describeEvent } = await import('../ui-prototype/src/events.js')
  const described = describeEvent(entry.shows, { actors: {}, tasks: {} })
  assert.match(described.excerpt, /Rejected/)
  assert.doesNotMatch(described.excerpt, /Approved/)
  const { activityItems } = await import('../lib/cli.js')
  const [item] = activityItems({ activity: [entry], actors: {}, tasks: {} })
  assert.equal(item.shows.comment.text, 'Rejected: do not ship')
  // The review list, when the entry is listed, reads the same structure.
  const { reviewView } = await import('../lib/client-review.js')
  const listed = { ...entry, review: true }
  const { listing } = reviewView({ activity: [listed], actors: {}, tasks: {}, attribution: { machines: {}, review: [{ change: hash, entry: entry.id, kind: 'operation', state: 'signed', flags: {} }], summary: {} } }, 'Board')
  assert.doesNotMatch(listing, /Approved/)
})
