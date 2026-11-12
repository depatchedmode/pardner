import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { storageValue } from '../lib/workspace-values.js'
import { ChangeEncoder } from '../support/change-encoder.js'
import { BOB, actorsOf, board, run, signedByActor } from '../support/activity-fixture.js'

// One change's data never stops every other change from being read or shown: it fails as its own entry.

const bob = n => `${BOB}${String(n).padStart(2, '0').repeat(8)}`

test('a change Automerge cannot decode into JavaScript, such as one holding an integer beyond 2^53, is its own entry for review, and every other change is derived', () => {
  const { doc: start } = board()
  const before = run(start, { type: 'task.create', payload: { title: 'Before' } })
  const odd = A.change(A.clone(before.doc, { actor: bob(1) }), draft => { draft.operations['op-big'] = storageValue({ ...before.event, payload: { title: 'Big' } }); draft.operations['op-big'].payload.big = 2 ** 60 })
  const [oddHash] = A.getHeads(odd)
  const after = run(odd, { type: 'goal.create', payload: { title: 'After' } })
  const entries = deriveAll(after.doc)
  assert.equal(entries.size, A.getChangesMetaSince(after.doc, []).length, 'every change has an entry')
  assert.equal(entries.get(oddHash).kind, 'unrecognised')
  assert.equal(entries.get(before.hash).kind, 'operation')
  assert.equal(entries.get(after.hash).event.payload.title, 'After')
})

test('a change whose time is outside what a date can show is shown with an unknown time and flagged, and Activity still reads', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Timed' } })
  const enc = new ChangeEncoder(created.doc, bob(2), { time: 8640000000001 })
  enc.value({ obj: enc.root('operations'), key: 'op-copy' }, created.event)
  const { doc, hash } = enc.apply()
  const shown = activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf })
  const entry = shown.find(item => item.changes.some(change => change.hash === hash))
  assert.equal(entry.flags.badTime, true)
  assert.equal(entry.review, true)
  // A record written by such a change has no time to show.
  const records = A.change(A.clone(created.doc), draft => { draft.membership['record-x'] = storageValue({ recordId: 'record-x', kind: 'profile' }) })
  const encRecord = new ChangeEncoder(records, bob(3), { time: -8640000000001 })
  encRecord.value({ obj: encRecord.root('membership'), key: 'record-y' }, { recordId: 'record-y', kind: 'profile' })
  const withRecord = encRecord.apply()
  const record = activityView({ entries: deriveAll(withRecord.doc).values(), stateOf: signedByActor(withRecord.doc), actorsOf }).find(item => item.key === 'record-y')
  assert.deepEqual([record.timestamp, record.flags.badTime], [null, true])
})

test('one entry whose payload cannot be turned into words is shown as such, and every other entry is described', async () => {
  const { describeEvent } = await import('../ui-prototype/src/events.js')
  const { activityRows, describeRecord, signerLine } = await import('../ui-prototype/src/attribution.js')
  const odd = { toString: 'not a function', valueOf: 'nor this' }
  const event = { operationId: 'op-x', type: 'task.branch', actorId: odd, timestamp: '2026-01-01T00:00:00.000Z', taskId: 't1', payload: { name: odd, commit: { hash: odd, message: odd } },
    changes: [{ field: 'status', old: odd, new: odd }], result: { veinIds: odd, receipts: odd }, recordIds: [] }
  for (const type of ['task.create', 'task.update', 'task.branch', 'task.link-commit', 'actor.register', 'task.handoff', 'comment.add', 'vein.create', 'read.mark', 'task.link-issue']) {
    assert.doesNotThrow(() => describeEvent({ ...event, type }, { actors: {}, tasks: { t1: { title: odd } } }), type)
  }
  const recordEntry = { id: 'r', kind: 'record', key: 'r', record: { kind: odd, displayName: odd, subject: odd, signer: odd, role: odd }, changes: [{ hash: 'h', state: 'signed', machineId: odd }], flags: {} }
  assert.doesNotThrow(() => activityRows({ activity: [recordEntry], attribution: { machines: {} } }))
  assert.doesNotThrow(() => describeRecord({ entry: recordEntry }, { machines: {} }))
  assert.doesNotThrow(() => signerLine({ machines: {} }, recordEntry))
})

test('the board view shows every record it can read when one change left another unreadable, and lists the ones it cannot', async () => {
  const { Workspace } = await import('../lib/workspace.js')
  const { doc: start } = board()
  const kept = run(start, { type: 'task.create', payload: { title: 'Kept' } })
  const broken = run(kept.doc, { type: 'task.create', payload: { title: 'Broken' } })
  const huge = run(broken.doc, { type: 'task.create', payload: { title: 'Huge' } })
  const comment = run(huge.doc, { type: 'comment.add', payload: { taskId: kept.event.result.taskId, text: 'Kept words' } })
  const doc = A.change(A.clone(comment.doc, { actor: bob(4) }), draft => {
    draft.taskFields[`${broken.event.result.taskId}:title`] = 5
    draft.taskFields[`${huge.event.result.taskId}:order`] = storageValue({ ...JSON.parse(JSON.stringify(draft.taskFields[`${huge.event.result.taskId}:order`])) })
    draft.taskFields[`${huge.event.result.taskId}:order`].value = 2 ** 60
    draft.comments['comment-orphan'] = storageValue({ id: 'comment-orphan', taskId: kept.event.result.taskId, actorId: 'bob', created_at: '2026-01-01T00:00:00.000Z' })
    draft.operations['op-odd-link'] = storageValue({ type: 'task.link-issue', operationId: 'op-odd-link' })
  })
  const snapshot = new Workspace({ handle: { doc: () => doc }, replicaId: 'replica-test' }).snapshot()
  assert.equal(snapshot.tasks[kept.event.result.taskId].title, 'Kept')
  assert.equal(snapshot.comments[comment.event.result.commentId].content, 'Kept words')
  // Each record and field that can't be read is listed: the comment with no text, the title that is not a revision, and
  // the Activity entry holding none of what an entry holds.
  assert.deepEqual([...new Set(snapshot.unreadable.map(item => `${item.kind} ${item.id}`))].sort(), ['comment comment-orphan', 'operation op-odd-link', `task ${broken.event.result.taskId}`].sort())
  assert.equal(snapshot.tasks[broken.event.result.taskId].title, '', 'a title that is not a revision reads as empty, and the task is still shown')
  assert.equal(snapshot.tasks[huge.event.result.taskId].order, (2n ** 60n).toString(), 'an integer JSON cannot hold is shown as its exact digits')
  assert.doesNotThrow(() => JSON.stringify(snapshot))
})
