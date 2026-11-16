import { plain } from '../lib/workspace-schema.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

it('links complete commit evidence atomically with Actor and replica attribution', async () => {
  await withWorkspaceServer(async ({ create, operation, context, server }) => {
    const taskId = await create()
    const commit = { hash: 'abc123def456789012345678901234567890abcd',
      message: `feat: ${'a'.repeat(200)}\n\nFull commit body`,
      diff: { stat: '1 file changed', shortstat: '1 insertion' } }
    const receipt = await operation('task.link-commit', { taskId, commit }, 'builder', 'link-first-commit')
    assert.equal(receipt.savedLocally, true)
    const result = await context(taskId)
    assert.deepEqual(result.evidence, [commit])
    const event = result.history.find(event => event.operationId === receipt.operationId)
    assert.equal(event.type, 'task.link-commit')
    assert.equal(event.actorId, 'builder')
    assert.equal(event.replicaId, server.store.manifest.replicaId)
    assert.deepEqual(event.payload, { taskId, commit })
    assert.deepEqual(plain(server.store.workspace.handle.doc().operations[receipt.operationId].payload.commit), commit)
    const replay = await operation('task.link-commit', { taskId, commit }, 'builder', 'link-first-commit')
    assert.equal(replay.replayed, true)
    assert.equal((await context(taskId)).evidence.length, 1)
  })
})

it('preserves multiple commits, optional diff statistics, and ordinary task history together', async () => {
  await withWorkspaceServer(async ({ create, operation, update, context }) => {
    const taskId = await create()
    const commits = [
      { hash: 'b'.repeat(40), message: 'First commit', diff: { stat: '2 files changed' } },
      { hash: 'c'.repeat(40), message: 'Commit without diff' },
    ]
    for (const commit of commits) assert.equal((await operation('task.link-commit', { taskId, commit }, 'builder')).httpStatus, 200)
    await update(taskId, { status: 'completed' }, 'alice')
    const result = await context(taskId)
    assert.deepEqual(result.evidence, commits)
    assert.equal(result.history.length, 4)
    assert.equal(result.history.filter(event => event.type === 'task.update').length, 1)
    assert.equal(result.task.status, 'completed')
  })
})

it('rejects invalid commit links without adding evidence or activity', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    for (const commit of [{ hash: 'not-a-hash', message: 'Bad hash' }, { hash: 'abc1234', message: '' }]) {
      assert.equal((await operation('task.link-commit', { taskId, commit })).httpStatus, 400)
    }
    const result = await context(taskId)
    assert.deepEqual(result.evidence, [])
    assert.equal(result.history.length, 1)
    assert.equal((await operation('task.link-commit', { taskId: 'missing', commit: { hash: 'abc1234', message: 'Missing task' } })).httpStatus, 404)
  })
})
