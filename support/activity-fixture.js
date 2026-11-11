import * as A from '@automerge/automerge'
import { prepareOperation } from '../lib/workspace-commands.js'
import { commentView, createWorkspaceData, issueLinkIndex, linkAlternatives, plain, recordState, taskState } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { testProject } from './machines.js'

// Test-only: boards built change by change, as a machine's write path makes them, for the per-change derivation
// (lib/change-log.js) and its view (lib/activity.js). Keys come from the fixture project, never from flags.

export const ALICE = 'aa'.repeat(16), BOB = 'bb'.repeat(16)
export const MACHINES = { [ALICE]: 'machine-aliceaaaaaaaaaaaaaaaaaaaaaa', [BOB]: 'machine-bobbbbbbbbbbbbbbbbbbbbbbbb' }

/** A verdict for each change: signed by the machine its actor's first 16 bytes name. */
export const signedByActor = doc => {
  const actors = new Map(A.getChangesMetaSince(doc, []).map(meta => [meta.hash, meta.actor]))
  return hash => ({ state: 'signed', machineId: MACHINES[actors.get(hash)?.slice(0, 32)] ?? null })
}
export const actorsOf = machineId => new Set(machineId === MACHINES[ALICE] ? ['alice', 'builder'] : machineId === MACHINES[BOB] ? ['bob'] : [])

export const ACTORS = [{ id: 'alice', handle: 'alice', kind: 'human', displayName: 'Alice' }, { id: 'bob', handle: 'bob', kind: 'human', displayName: 'Bob' },
  { id: 'builder', handle: 'builder', kind: 'agent', displayName: 'Builder' }]

/** A board created by Alice's machine, with Alice, Bob and Builder registered in its creation change unless `actors` is false. */
export function board({ actors = true } = {}) {
  const project = testProject({ members: 1 })
  const doc = A.from(createWorkspaceData({ actors: actors ? ACTORS : [], genesis: project.genesis }), { actor: `${ALICE}${'01'.repeat(8)}` })
  return { project, doc }
}

/**
 * Runs `request` on `doc` as one change by `actor`, the way Workspace.apply does, and returns the new document, the
 * change's hash and the event it wrote.
 */
export function run(doc, request, { actor = `${ALICE}${'01'.repeat(8)}`, replicaId = 'replica-alice', timestamp = new Date(Date.UTC(2026, 10, 1, 9, 0, run.clock++)).toISOString() } = {}) {
  const prepared = prepareOperation(doc, { actorId: 'alice', operationId: `op-${run.clock++}`, ...request }, { replicaId, timestamp })
  if (prepared.replayed) throw new Error('replayed')
  const next = A.change(A.clone(doc, { actor }), prepared.change)
  return { doc: next, hash: A.getHeads(next)[0], event: plain(prepared.event) }
}
run.clock = 0

/** Every operation type, in an order where each has what it needs. Returns the document and each change's event. */
export function everyOperation(start = board({ actors: false }).doc) {
  let doc = start
  const written = []
  const step = request => { const result = run(doc, request); doc = result.doc; written.push(result); return result.event }
  step({ type: 'actor.register', actorId: 'alice', payload: { id: 'alice', handle: 'alice', kind: 'human', displayName: 'Alice' } })
  step({ type: 'actor.register', payload: { id: 'bob', handle: 'bob', kind: 'human', displayName: 'Bob' } })
  step({ type: 'actor.register', payload: { id: 'builder', handle: 'builder', kind: 'agent', displayName: 'Builder' } })
  const task = step({ type: 'task.create', payload: { title: 'Every operation', description: 'From the fixture', tags: ['one'] } }).result.taskId
  const revisions = field => taskState(doc, task).revisions[field]
  step({ type: 'task.update', payload: { taskId: task, updates: { status: 'in-progress' }, expectedRevisions: { status: revisions('status') } } })
  step({ type: 'task.resolve', payload: { taskId: task, field: 'priority', value: 'p1', expectedRevisions: revisions('priority') } })
  const handoff = step({ type: 'task.handoff', payload: { taskId: task, to: 'builder', status: 'review', message: 'Over to you, @builder',
    expectedRevisions: { assignee: revisions('assignee'), status: revisions('status') } } })
  const added = step({ type: 'comment.add', payload: { taskId: task, text: 'A first comment' } }).result.commentId
  step({ type: 'comment.edit', payload: { commentId: added, text: 'A first comment, edited', expectedRevisions: commentView(doc, added).revisionIds } })
  step({ type: 'comment.resolve', payload: { commentId: added, text: 'The kept version', expectedRevisions: commentView(doc, added).revisionIds } })
  const doomed = step({ type: 'comment.add', payload: { taskId: task, text: 'Soon deleted' } }).result.commentId
  step({ type: 'comment.delete', payload: { commentId: doomed, expectedRevisions: commentView(doc, doomed).revisionIds } })
  const view = commentView(doc, handoff.result.commentId)
  step({ type: 'read.mark', payload: { taskId: task, comments: [{ commentId: view.id, revisionId: view.revisionId }] } })
  step({ type: 'task.link-commit', payload: { taskId: task, commit: { hash: 'abc1234def', message: 'Implement it' } } })
  const goal = step({ type: 'goal.create', payload: { title: 'A goal' } }).result.goalId
  step({ type: 'goal.update', payload: { goalId: goal, updates: { description: 'Why' }, expectedRevisions: { description: recordState(doc, 'goal', goal).revisions.description } } })
  step({ type: 'goal.resolve', payload: { goalId: goal, field: 'status', value: 'open', expectedRevisions: recordState(doc, 'goal', goal).revisions.status } })
  const vein = step({ type: 'vein.create', payload: { title: 'A vein', goalId: goal } }).result.veinId
  step({ type: 'vein.update', payload: { veinId: vein, updates: { title: 'A vein, renamed' }, expectedRevisions: { title: recordState(doc, 'vein', vein).revisions.title } } })
  step({ type: 'vein.resolve', payload: { veinId: vein, field: 'status', value: 'open', expectedRevisions: recordState(doc, 'vein', vein).revisions.status } })
  step({ type: 'task.link-vein', payload: { taskId: task, veinId: vein } })
  step({ type: 'task.unlink-vein', payload: { taskId: task, veinId: vein, expectedRevisions: linkAlternatives(doc, task, vein).map(link => link.operationId) } })
  step({ type: 'task.link-issue', payload: { taskId: task, repository: 'example/pardner', number: 7 } })
  step({ type: 'task.unlink-issue', payload: { taskId: task, repository: 'example/pardner', number: 7, expectedRevisions: issueLinkIndex(doc)[task][0].revisions } })
  const branch = step({ type: 'task.branch', payload: { taskId: task, name: 'experiment' } }).result.branchId
  const branchRevisions = taskState(doc, branch).revisions
  step({ type: 'task.update', payload: { taskId: branch, updates: { description: 'Changed on the branch' }, expectedRevisions: { description: branchRevisions.description } } })
  const parent = taskState(doc, task).revisions
  step({ type: 'task.merge', payload: { branchId: branch, expectedRevisions: { description: parent.description } } })
  return { doc, written, task, comment: added, goal, vein }
}

/** Writes membership records into `doc` as the record gate and the harvest write-back do: one change. */
export function writeRecords(doc, records, { actor = `${ALICE}${'02'.repeat(8)}`, remake = false } = {}) {
  return A.change(A.clone(doc, { actor }), draft => {
    if (remake || !draft.membership) draft.membership = {}
    for (const record of records) draft.membership[record.recordId] = storageValue(record)
  })
}
