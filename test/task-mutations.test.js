import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

it('creates every task field with human attribution and an atomic operation record', async () => {
  await withWorkspaceServer(async ({ operation, context }) => {
    const fields = { title: 'Complete task', description: 'Full description', priority: 'p1', outcome: null, assignee: 'builder', tags: ['release', 'offline'], order: 10, type: 'task' }
    const receipt = await operation('task.create', fields)
    assert.equal(receipt.savedLocally, true)
    const result = await context(receipt.result.taskId)
    for (const [field, value] of Object.entries(fields)) assert.deepEqual(result.task[field], value)
    assert.equal(result.task.created_by, 'alice')
    assert.equal(result.history.length, 1)
    assert.equal(result.history[0].operationId, receipt.operationId)
    assert.equal(result.history[0].changes.length, Object.keys(fields).length)
  })
})
for (const [field, value] of Object.entries({ title: 'Changed title', description: 'Changed description', priority: 'p0', assignee: 'reviewer', outcome: 'abandoned', tags: ['tested'] })) {
  it(`updates ${field} with expected revisions and agent provenance`, async () => {
    await withWorkspaceServer(async ({ create, update, context }) => {
      const taskId = await create()
      const before = await context(taskId)
      const receipt = await update(taskId, { [field]: value }, 'builder')
      assert.equal(receipt.httpStatus, 200)
      const after = await context(taskId)
      assert.deepEqual(after.task[field], value)
      assert.deepEqual(after.revisions[field], [receipt.operationId])
      const event = after.history.find(entry => entry.operationId === receipt.operationId)
      assert.equal(event.actorId, 'builder')
      assert.deepEqual(event.changes, [{ field, old: before.task[field], new: value }])
    })
  })
}
it('derives open and ended from authored outcomes', async () => {
  await withWorkspaceServer(async ({ create, update, context }) => {
    const taskId = await create()
    assert.equal((await context(taskId)).task.state, 'open')
    await update(taskId, { assignee: 'alice' })
    assert.equal((await context(taskId)).task.state, 'open')
    await update(taskId, { outcome: 'completed' })
    assert.equal((await context(taskId)).task.state, 'ended')
    await update(taskId, { outcome: null })
    assert.equal((await context(taskId)).task.state, 'open')
  })
})
it('safe replay adds no second history entry and stale writes leave intervening work intact', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const before = await context(taskId)
    const payload = { taskId, updates: { title: 'One change' }, expectedRevisions: { title: before.revisions.title } }
    const first = await operation('task.update', payload, 'alice', 'retry-once')
    const retry = await operation('task.update', payload, 'alice', 'retry-once')
    assert.equal(retry.replayed, true)
    assert.equal(retry.operationId, first.operationId)
    const stale = await operation('task.update', { ...payload, updates: { title: 'Overwrite' } }, 'bob')
    assert.equal(stale.code, 'STALE_UPDATE')
    const after = await context(taskId)
    assert.equal(after.task.title, 'One change')
    assert.equal(after.history.length, 2)
  })
})
it('rejects empty changes without creating spurious task history', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const result = await operation('task.update', { taskId, updates: {}, expectedRevisions: {} })
    assert.equal(result.httpStatus, 400)
    assert.equal((await context(taskId)).history.length, 1)
  })
})
