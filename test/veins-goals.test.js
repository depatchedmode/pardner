import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { save } from '@automerge/automerge'
import { DurableRepo } from '../lib/durable-repo.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { Workspace, createWorkspaceData } from '../lib/workspace.js'
import { withWorkspaceServer } from '../support/workspace-test.js'

const actors = [
  { id: 'alice', handle: 'alice', kind: 'human' },
  { id: 'bob', handle: 'bob', kind: 'human' },
  { id: 'builder', handle: 'builder', kind: 'agent' },
]

async function withWorkspaces(run) {
  const resources = []
  const create = async source => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-veins-'))
    const repo = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    const handle = source ? repo.import(save(source.handle.doc())) : repo.create(createWorkspaceData({ actors }))
    resources.push({ directory, repo })
    return new Workspace({ repo, handle, replicaId: `replica-${resources.length}` })
  }
  try { await run(await create(), create) } finally {
    for (const { repo, directory } of resources) {
      await repo.shutdown()
      await rm(directory, { recursive: true, force: true })
    }
  }
}

const command = (workspace, type, payload, actorId = 'alice', operationId = randomUUID()) =>
  workspace.execute({ operationId, type, actorId, payload })
const createTask = async (workspace, fields = {}) =>
  (await command(workspace, 'task.create', { title: 'Shared work', ...fields })).result.taskId
const createVein = async (workspace, fields = {}) =>
  (await command(workspace, 'vein.create', { title: 'Edge caching', goal: { title: 'p95 under 200ms' }, ...fields })).result
const snapshotOf = workspace => workspace.snapshot()
const sync = (a, b) => { a.handle.merge(b.handle); b.handle.merge(a.handle) }

function veinUpdate(workspace, veinId, updates) {
  const { revisions } = workspace.veinContext(veinId)
  return { veinId, updates, expectedRevisions: Object.fromEntries(Object.keys(updates).map(field => [field, revisions[field]])) }
}

function taskUpdate(workspace, taskId, updates) {
  const { revisions } = workspace.taskContext(taskId)
  return { taskId, updates, expectedRevisions: Object.fromEntries(Object.keys(updates).map(field => [field, revisions[field]])) }
}

describe('goals and veins', () => {
  it('creates a vein with a new goal in one operation and shares it across replicas', async () => {
    await withWorkspaces(async (left, create) => {
      const right = await create(left)
      const [a, b] = await Promise.all([left, right].map(workspace => command(workspace, 'vein.create',
        { title: 'Edge caching', goal: { title: 'p95 under 200ms', description: 'Measured at the edge' } }, 'alice', 'shared-vein')))
      assert.deepEqual(a.result, b.result, 'a retried creation names the same vein and goal')
      assert.equal(a.result.createdGoal, true)
      sync(left, right)
      const context = left.veinContext(a.result.veinId)
      assert.deepEqual(context.conflicts, {})
      assert.equal(context.vein.status, 'open')
      assert.equal(context.vein.goalId, a.result.goalId)
      assert.equal(context.goal.title, 'p95 under 200ms')
      assert.equal(context.goal.description, 'Measured at the edge')
      assert.equal(context.goal.status, 'open')
      assert.equal(context.history.filter(event => event.operationId === 'shared-vein').length, 1)
      assert.deepEqual(left.goalContext(a.result.goalId).veins.map(vein => vein.id), [a.result.veinId])
    })
  })

  it('requires every vein to pursue exactly one goal', async () => {
    await withWorkspaces(async workspace => {
      const { goalId } = (await command(workspace, 'goal.create', { title: 'Ship v2' })).result
      await assert.rejects(command(workspace, 'vein.create', { title: 'Aimless' }), { code: 'GOAL_REQUIRED' })
      await assert.rejects(command(workspace, 'vein.create', { title: 'Both', goalId, goal: { title: 'Another' } }), { code: 'GOAL_REQUIRED' })
      await assert.rejects(command(workspace, 'vein.create', { title: 'Missing', goalId: 'goal-missing' }), { code: 'NOT_FOUND' })
      await assert.rejects(command(workspace, 'vein.create', { title: 'Untitled goal', goal: { title: ' ' } }), /title must be text/)
      const { veinId } = (await command(workspace, 'vein.create', { title: 'Rewrite', goalId })).result
      const { veinId: second } = (await command(workspace, 'vein.create', { title: 'Incremental', goalId })).result
      assert.deepEqual(workspace.goalContext(goalId).veins.map(vein => vein.id).sort(), [veinId, second].sort(), 'several veins share one goal')
      assert.equal(Object.keys(snapshotOf(workspace).goals).length, 1)
    })
  })

  it('records vein and goal verdicts independently', async () => {
    await withWorkspaces(async workspace => {
      const { veinId, goalId } = await createVein(workspace)
      await assert.rejects(command(workspace, 'vein.update', veinUpdate(workspace, veinId, { status: 'completed' })), /Vein status must be one of/)
      await command(workspace, 'vein.update', veinUpdate(workspace, veinId, { status: 'proven' }))
      assert.equal(workspace.veinContext(veinId).vein.status, 'proven')
      assert.equal(workspace.goalContext(goalId).goal.status, 'open', 'a proven vein never closes its goal')
      const { revisions } = workspace.goalContext(goalId)
      await assert.rejects(command(workspace, 'goal.update', { goalId, updates: { status: 'proven' }, expectedRevisions: { status: revisions.status } }),
        /Goal status must be one of/)
      await command(workspace, 'goal.update', { goalId, updates: { status: 'achieved' }, expectedRevisions: { status: revisions.status } })
      assert.equal(workspace.goalContext(goalId).goal.status, 'achieved')
      await assert.rejects(command(workspace, 'goal.update', { goalId, updates: { status: 'abandoned' }, expectedRevisions: { status: revisions.status } }),
        { code: 'STALE_UPDATE' })
    })
  })

  it('moves a vein to another goal and surfaces concurrent moves for resolution', async () => {
    await withWorkspaces(async (left, create) => {
      const { veinId, goalId } = await createVein(left)
      const other = (await command(left, 'goal.create', { title: 'Cut hosting cost' })).result.goalId
      const third = (await command(left, 'goal.create', { title: 'Simplify deploys' })).result.goalId
      const right = await create(left)
      await command(left, 'vein.update', veinUpdate(left, veinId, { goalId: other }), 'alice', 'move-left')
      await command(right, 'vein.update', veinUpdate(right, veinId, { goalId: third }), 'bob', 'move-right')
      sync(left, right)
      const context = left.veinContext(veinId)
      assert.deepEqual(Object.keys(context.conflicts), ['goalId'])
      assert.deepEqual(context.revisions.goalId, ['move-left', 'move-right'])
      await assert.rejects(command(left, 'vein.update', veinUpdate(left, veinId, { goalId })), { code: 'CONFLICT_REQUIRES_RESOLUTION' })
      // Keep the displayed goal, so the resolution leaves only the concurrent goal Automerge did not display.
      const kept = context.vein.goalId, dropped = kept === other ? third : other
      await command(left, 'vein.resolve', { veinId, field: 'goalId', value: kept, expectedRevisions: context.revisions.goalId })
      assert.deepEqual(left.veinContext(veinId).conflicts, {})
      assert.equal(left.veinContext(veinId).goal.id, kept)
      assert.deepEqual(left.goalContext(goalId).veins, [])
      assert.deepEqual(left.goalContext(dropped).veins, [])
      const moves = id => left.goalContext(id).history.filter(event => event.recordIds.includes(veinId)).map(event => event.type)
      assert.deepEqual(moves(goalId), ['vein.create', 'vein.update', 'vein.update'], 'the goal a vein left records both concurrent moves')
      assert.deepEqual(moves(kept), ['vein.update', 'vein.resolve'], 'the goal a vein stays with records the move and resolution')
      assert.deepEqual(moves(dropped), ['vein.update', 'vein.resolve'], 'the concurrent goal a vein leaves records the move and resolution')
    })
  })

  it('lets one task contribute to several veins', async () => {
    await withWorkspaces(async workspace => {
      const caching = await createVein(workspace)
      const rewrite = (await command(workspace, 'vein.create', { title: 'Rewrite hot path', goalId: caching.goalId })).result
      const shared = await createTask(workspace, { title: 'Add latency instrumentation', veinIds: [caching.veinId, rewrite.veinId] })
      const solo = await createTask(workspace, { title: 'Cache headers' })
      await command(workspace, 'task.link-vein', { taskId: solo, veinId: caching.veinId })
      const snapshot = snapshotOf(workspace)
      assert.deepEqual(snapshot.tasks[shared].veinIds, [caching.veinId, rewrite.veinId].sort())
      assert.deepEqual(snapshot.tasks[solo].veinIds, [caching.veinId])
      assert.deepEqual(snapshot.veins[caching.veinId].taskIds, [shared, solo].sort())
      assert.deepEqual(snapshot.veins[rewrite.veinId].taskIds, [shared])
      assert.deepEqual(workspace.taskContext(shared).veins.map(vein => vein.title).sort(), ['Edge caching', 'Rewrite hot path'])
      assert.deepEqual(workspace.veinContext(caching.veinId).tasks.map(task => task.title).sort(), ['Add latency instrumentation', 'Cache headers'])
      assert.ok(workspace.taskContext(solo).history.some(event => event.type === 'task.link-vein'), 'links appear in task history')
      assert.ok(workspace.veinContext(caching.veinId).history.some(event => event.type === 'task.link-vein'), 'links appear in vein history')
      for (const veinId of [caching.veinId, rewrite.veinId]) {
        assert.ok(workspace.veinContext(veinId).history.some(event => event.type === 'task.create' && event.taskId === shared),
          'a link made at creation appears in every linked vein\'s history')
      }
      await assert.rejects(command(workspace, 'task.create', { title: 'Bad link', veinIds: ['vein-missing'] }), { code: 'NOT_FOUND' })
    })
  })

  it('merges links made concurrently on different machines without conflicts', async () => {
    await withWorkspaces(async (left, create) => {
      const first = await createVein(left)
      const second = (await command(left, 'vein.create', { title: 'Second vein', goalId: first.goalId })).result
      const taskId = await createTask(left)
      const right = await create(left)
      await command(left, 'task.link-vein', { taskId, veinId: first.veinId }, 'alice')
      await command(right, 'task.link-vein', { taskId, veinId: second.veinId }, 'bob')
      sync(left, right)
      assert.deepEqual(snapshotOf(left).tasks[taskId].veinIds, [first.veinId, second.veinId].sort())
      assert.deepEqual(snapshotOf(right).tasks[taskId].veinIds, snapshotOf(left).tasks[taskId].veinIds)
    })
  })

  it('keeps a concurrent link when an unlink did not observe it', async () => {
    await withWorkspaces(async (left, create) => {
      const { veinId } = await createVein(left)
      const taskId = await createTask(left, { veinIds: [veinId] })
      const right = await create(left)
      const observed = left.taskContext(taskId).veins[0].linkRevisions
      await command(left, 'task.unlink-vein', { taskId, veinId, expectedRevisions: observed }, 'alice')
      assert.deepEqual(snapshotOf(left).tasks[taskId].veinIds, [])
      await command(right, 'task.link-vein', { taskId, veinId }, 'bob')
      sync(left, right)
      assert.deepEqual(snapshotOf(left).tasks[taskId].veinIds, [veinId], 'the unobserved link wins')
      const revisions = left.taskContext(taskId).veins[0].linkRevisions
      assert.equal(revisions.length, 2)
      await command(left, 'task.unlink-vein', { taskId, veinId, expectedRevisions: revisions }, 'alice')
      assert.deepEqual(snapshotOf(left).tasks[taskId].veinIds, [])
    })
  })

  it('checks observed link revisions before unlinking', async () => {
    await withWorkspaces(async workspace => {
      const { veinId } = await createVein(workspace)
      const taskId = await createTask(workspace, { veinIds: [veinId] })
      const stale = workspace.taskContext(taskId).veins[0].linkRevisions
      await command(workspace, 'task.link-vein', { taskId, veinId }, 'bob')
      await assert.rejects(command(workspace, 'task.unlink-vein', { taskId, veinId, expectedRevisions: stale }), { code: 'STALE_UPDATE' })
      await assert.rejects(command(workspace, 'task.unlink-vein', { taskId, veinId }), { code: 'REVISION_REQUIRED' })
      const current = workspace.taskContext(taskId).veins[0].linkRevisions
      await command(workspace, 'task.unlink-vein', { taskId, veinId, expectedRevisions: current })
      await assert.rejects(command(workspace, 'task.unlink-vein', { taskId, veinId, expectedRevisions: current }), { code: 'NOT_FOUND' })
    })
  })

  it('flags an open vein for a verdict once all of its tasks have ended', async () => {
    await withWorkspaces(async workspace => {
      const { veinId } = await createVein(workspace)
      const ready = () => snapshotOf(workspace).veins[veinId].readyForVerdict
      assert.equal(ready(), false, 'an empty vein has nothing to judge')
      const tasks = [await createTask(workspace, { veinIds: [veinId] }), await createTask(workspace, { veinIds: [veinId] }),
        await createTask(workspace, { veinIds: [veinId] })]
      await command(workspace, 'task.update', taskUpdate(workspace, tasks[0], { status: 'completed' }))
      await command(workspace, 'task.update', taskUpdate(workspace, tasks[1], { status: 'dead-end' }))
      assert.equal(ready(), false)
      await command(workspace, 'task.update', taskUpdate(workspace, tasks[2], { status: 'abandoned' }))
      assert.equal(ready(), true)
      assert.equal(workspace.veinContext(veinId).vein.status, 'open', 'readiness never sets the verdict')
      await command(workspace, 'vein.update', veinUpdate(workspace, veinId, { status: 'dead-end' }))
      assert.equal(ready(), false, 'a decided vein is no longer waiting')
    })
  })

  it('waits for a verdict while any concurrent task status is still open', async () => {
    await withWorkspaces(async (left, create) => {
      const { veinId, goalId } = await createVein(left)
      const taskId = await createTask(left, { veinIds: [veinId] })
      const right = await create(left)
      await command(left, 'task.update', taskUpdate(left, taskId, { status: 'completed' }), 'alice')
      await command(right, 'task.update', taskUpdate(right, taskId, { status: 'in-progress' }), 'bob')
      sync(left, right)
      const readiness = () => [snapshotOf(left).veins[veinId].readyForVerdict, left.veinContext(veinId).vein.readyForVerdict,
        left.goalContext(goalId).veins[0].readyForVerdict]
      assert.deepEqual(Object.keys(left.taskContext(taskId).conflicts), ['status'])
      assert.deepEqual(readiness(), [false, false, false], 'a task that may still be in progress has not ended')
      const { revisions } = left.taskContext(taskId)
      await command(left, 'task.resolve', { taskId, field: 'status', value: 'dead-end', expectedRevisions: revisions.status })
      assert.deepEqual(readiness(), [true, true, true])
    })
  })

  it('starts task branches without veins and leaves the parent veins on merge', async () => {
    await withWorkspaces(async workspace => {
      const first = await createVein(workspace)
      const second = (await command(workspace, 'vein.create', { title: 'Second vein', goalId: first.goalId })).result
      const parent = await createTask(workspace, { veinIds: [first.veinId] })
      const branchId = (await command(workspace, 'task.branch', { taskId: parent, name: 'try-it' })).result.branchId
      assert.deepEqual(snapshotOf(workspace).tasks[branchId].veinIds, [])
      await command(workspace, 'task.link-vein', { taskId: branchId, veinId: second.veinId })
      await command(workspace, 'task.update', taskUpdate(workspace, branchId, { description: 'Refined scope' }))
      const { revisions } = workspace.taskContext(parent)
      await command(workspace, 'task.merge', { branchId, expectedRevisions: { description: revisions.description } })
      assert.equal(workspace.taskContext(parent).task.description, 'Refined scope')
      assert.deepEqual(snapshotOf(workspace).tasks[parent].veinIds, [first.veinId])
    })
  })

  it('accepts dead-end and abandoned as task outcomes', async () => {
    await withWorkspaces(async workspace => {
      for (const status of ['dead-end', 'abandoned']) {
        const taskId = await createTask(workspace, { status })
        assert.equal(workspace.taskContext(taskId).task.status, status)
      }
    })
  })
})

describe('goal and vein context over HTTP', () => {
  it('serves vein and goal context and reports missing records', async () => {
    await withWorkspaceServer(async ({ api, operation }) => {
      const created = await operation('vein.create', { title: 'Edge caching', goal: { title: 'p95 under 200ms' } })
      assert.equal(created.success, true)
      const { veinId, goalId } = created.result
      const task = await operation('task.create', { title: 'Instrument', veinIds: [veinId] })
      const vein = await api(`/automerge/vein/${veinId}/context`)
      assert.equal(vein.httpStatus, 200)
      assert.deepEqual(vein.tasks.map(item => item.id), [task.result.taskId])
      assert.equal(vein.goal.id, goalId)
      const goal = await api(`/automerge/goal/${goalId}/context`)
      assert.deepEqual(goal.veins.map(item => item.id), [veinId])
      const doc = (await api('/automerge/doc')).doc
      assert.deepEqual(Object.keys(doc.veins), [veinId])
      assert.deepEqual(Object.keys(doc.goals), [goalId])
      const missing = await api('/automerge/vein/vein-missing/context')
      assert.equal(missing.httpStatus, 404)
      assert.equal(missing.code, 'NOT_FOUND')
      const aimless = await operation('vein.create', { title: 'Aimless' })
      assert.equal(aimless.httpStatus, 400)
      assert.equal(aimless.code, 'GOAL_REQUIRED')
    })
  })
})
