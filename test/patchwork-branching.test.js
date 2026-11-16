import { plain } from '../lib/workspace-schema.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

async function branch(operation, taskId, name = 'experiment', actorId = 'builder') {
  const receipt = await operation('task.branch', { taskId, name }, actorId)
  assert.equal(receipt.savedLocally, true)
  return receipt.result.branchId
}
async function merge(operation, context, taskId, branchId, operationId) {
  const { revisions } = await context(taskId)
  return operation('task.merge', { branchId, expectedRevisions: revisions }, 'reviewer', operationId)
}

it('copies all task fields into independent named branches and lists their parent relationships', async () => {
  await withWorkspaceServer(async ({ create, operation, context, api }) => {
    const fields = { title: 'Parent', description: 'Full context', status: 'in-progress', priority: 'p1', tags: ['experiment'], assignee: 'builder' }
    const taskId = await create(fields)
    const ids = [await branch(operation, taskId, 'first'), await branch(operation, taskId, 'second', 'alice')]
    for (const id of ids) {
      const result = await context(id)
      for (const [field, value] of Object.entries(fields)) assert.deepEqual(result.task[field], value)
      assert.equal(result.task.branch_of, taskId)
      assert.equal(result.task.merged, false)
    }
    const snapshot = await api('/automerge/doc')
    const branches = Object.values(snapshot.doc.tasks).filter(task => task.branch_of === taskId)
    assert.deepEqual(branches.map(task => task.branch_name).sort(), ['first', 'second'])
  })
})

it('edits branches independently and merges only changed fields without losing unrelated parent work', async () => {
  await withWorkspaceServer(async ({ create, operation, update, context }) => {
    const taskId = await create({ priority: 'p2', status: 'backlog' })
    const branchId = await branch(operation, taskId)
    await update(branchId, { priority: 'p0', status: 'in-progress' }, 'builder')
    await update(taskId, { description: 'Parent work after branching' }, 'alice')
    const parentBefore = await context(taskId)
    assert.equal(parentBefore.task.priority, 'p2')
    assert.equal(parentBefore.task.status, 'backlog')
    const receipt = await merge(operation, context, taskId, branchId)
    assert.equal(receipt.savedLocally, true)
    const parent = await context(taskId)
    assert.equal(parent.task.priority, 'p0')
    assert.equal(parent.task.status, 'in-progress')
    assert.equal(parent.task.description, 'Parent work after branching')
    const child = await context(branchId)
    assert.equal(child.task.merged, true)
    assert.equal(child.task.status, 'completed')
    for (const result of [parent, child]) {
      const event = result.history.find(event => event.operationId === receipt.operationId)
      assert.equal(event.actorId, 'reviewer')
      assert.equal(event.payload.branchId, branchId)
      assert.deepEqual(event.changes.map(change => change.field).sort(), ['priority', 'status'])
    }
  })
})

it('records branch activity once for both parent and branch with Actor attribution', async () => {
  await withWorkspaceServer(async ({ create, operation, context, server }) => {
    const taskId = await create()
    const receipt = await operation('task.branch', { taskId, name: 'tracked' }, 'builder', 'branch-once')
    const replay = await operation('task.branch', { taskId, name: 'tracked' }, 'builder', 'branch-once')
    assert.equal(replay.replayed, true)
    for (const id of [taskId, receipt.result.branchId]) {
      const events = (await context(id)).history.filter(event => event.operationId === receipt.operationId)
      assert.equal(events.length, 1)
      assert.equal(events[0].actorId, 'builder')
      assert.equal(events[0].result.parentId, taskId)
    }
    assert.equal(Object.values(server.store.workspace.handle.doc().operations).map(plain).filter(event => event.operationId === receipt.operationId).length, 1)
  })
})

it('rejects a second merge while allowing a retry of the original acknowledged operation', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const branchId = await branch(operation, taskId)
    const payload = { branchId, expectedRevisions: (await context(taskId)).revisions }
    assert.equal((await operation('task.merge', payload, 'reviewer', 'merge-once')).savedLocally, true)
    assert.equal((await operation('task.merge', payload, 'reviewer', 'merge-once')).replayed, true)
    assert.equal((await operation('task.merge', payload, 'reviewer')).code, 'INVALID_BRANCH')
    assert.equal((await context(taskId)).history.filter(event => event.type === 'task.merge').length, 1)
  })
})

it('refuses divergent parent and branch edits without marking the branch merged', async () => {
  await withWorkspaceServer(async ({ create, operation, update, context }) => {
    const taskId = await create({ title: 'Base' })
    const branchId = await branch(operation, taskId)
    await update(taskId, { title: 'Human revision' })
    await update(branchId, { title: 'Agent revision' }, 'builder')
    const receipt = await merge(operation, context, taskId, branchId)
    assert.equal(receipt.code, 'BRANCH_CONFLICT')
    assert.equal((await context(taskId)).task.title, 'Human revision')
    assert.equal((await context(branchId)).task.merged, false)
  })
})

it('preserves branch commit evidence through merge and exposes its origin in parent history', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const branchId = await branch(operation, taskId)
    const commit = { hash: 'abc123def456', message: 'feat: branch feature', diff: { shortstat: '3 files changed' } }
    await operation('task.link-commit', { taskId: branchId, commit }, 'builder')
    assert.equal((await merge(operation, context, taskId, branchId)).savedLocally, true)
    const child = await context(branchId)
    assert.deepEqual(child.evidence, [commit])
    const parent = await context(taskId)
    assert.equal(parent.history.find(event => event.type === 'task.merge').result.branchId, branchId)
  })
})
