import { plain } from '../lib/workspace-schema.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

it('all task activity uses canonical taskId and task context excludes unrelated activity', async () => {
  await withWorkspaceServer(async ({ create, operation, update, context, server }) => {
    const taskId = await create({ title: 'Parent' })
    const unrelatedId = await create({ title: 'Unrelated' })
    await operation('comment.add', { taskId, text: '@builder review this' })
    await update(taskId, { status: 'in-progress' }, 'builder')
    const branch = await operation('task.branch', { taskId, name: 'experiment' }, 'builder')
    await operation('task.merge', { branchId: branch.result.branchId, expectedRevisions: (await context(taskId)).revisions }, 'reviewer')
    await operation('task.link-commit', { taskId, commit: { hash: 'abc1234', message: 'Complete evidence' } }, 'builder')
    await operation('comment.add', { taskId: unrelatedId, text: 'Other discussion' }, 'bob')
    const result = await context(taskId)
    assert.deepEqual(result.history.map(event => event.type).sort(), ['comment.add', 'task.branch', 'task.create', 'task.link-commit', 'task.merge', 'task.update'])
    const stored = Object.values(server.store.workspace.handle.doc().operations).map(plain)
    for (const event of result.history) {
      assert.equal(event.taskId, taskId)
      assert.equal(Object.hasOwn(event, 'task_id'), false)
      assert.equal(stored.filter(value => value.operationId === event.operationId).length, 1)
    }
    const unrelated = await context(unrelatedId)
    assert.equal(unrelated.history.length, 2)
    assert.ok(unrelated.history.every(event => event.taskId === unrelatedId))
    const branchHistory = (await context(branch.result.branchId)).history
    assert.deepEqual(branchHistory.map(event => event.type).sort(), ['task.branch', 'task.merge'])
  })
})
