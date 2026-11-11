import { plain } from '../lib/workspace-schema.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

it('two agents concurrently update independent fields without losing either change', async () => {
  await withWorkspaceServer(async ({ create, context, operation }) => {
    const taskId = await create()
    const { revisions } = await context(taskId)
    const receipts = await Promise.all([
      operation('task.update', { taskId, updates: { status: 'in-progress' }, expectedRevisions: { status: revisions.status } }, 'builder'),
      operation('task.update', { taskId, updates: { assignee: 'reviewer' }, expectedRevisions: { assignee: revisions.assignee } }, 'reviewer'),
    ])
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    const result = await context(taskId)
    assert.equal(result.task.status, 'in-progress')
    assert.equal(result.task.assignee, 'reviewer')
    for (const receipt of receipts) assert.equal(result.history.filter(event => event.operationId === receipt.operationId).length, 1)
  })
})

it('concurrent writes to one local field acknowledge one winner and explicitly reject the stale write', async () => {
  await withWorkspaceServer(async ({ create, context, operation }) => {
    const taskId = await create()
    const { revisions } = await context(taskId)
    const receipts = await Promise.all(['in-progress', 'review'].map((status, index) =>
      operation('task.update', { taskId, updates: { status }, expectedRevisions: { status: revisions.status } }, index ? 'reviewer' : 'builder')))
    const accepted = receipts.filter(receipt => receipt.httpStatus === 200)
    const rejected = receipts.filter(receipt => receipt.code === 'STALE_UPDATE')
    assert.equal(accepted.length, 1)
    assert.equal(rejected.length, 1)
    const result = await context(taskId)
    assert.equal(result.history.length, 2)
    assert.deepEqual(result.revisions.status, [accepted[0].operationId])
    assert.equal(result.task.status, result.history.find(event => event.operationId === accepted[0].operationId).payload.updates.status)
  })
})

it('concurrent comments preserve both authors, content, and operation history', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const actors = ['builder', 'reviewer']
    const receipts = await Promise.all(actors.map(actor => operation('comment.add', { taskId, text: `From ${actor}` }, actor)))
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    const result = await context(taskId)
    assert.equal(result.comments.length, 2)
    for (const actor of actors) {
      const comment = result.comments.find(comment => comment.actorId === actor)
      assert.equal(comment.content, `From ${actor}`)
    }
    assert.equal(result.history.filter(event => event.type === 'comment.add').length, 2)
  })
})

it('sequential alternating-agent updates retain every acknowledged revision and its exact value', async () => {
  await withWorkspaceServer(async ({ create, update, context }) => {
    const taskId = await create()
    const expected = []
    for (let index = 0; index < 10; index++) {
      const priority = `p${index % 4}`, actor = index % 2 ? 'reviewer' : 'builder'
      const receipt = await update(taskId, { priority }, actor)
      assert.equal(receipt.savedLocally, true)
      expected.push({ id: receipt.operationId, priority, actor })
    }
    const result = await context(taskId)
    assert.equal(result.history.length, 11)
    assert.equal(result.task.priority, expected.at(-1).priority)
    for (const item of expected) {
      const event = result.history.find(event => event.operationId === item.id)
      assert.equal(event.actorId, item.actor)
      assert.equal(event.payload.updates.priority, item.priority)
    }
  })
})

it('concurrent task creation produces distinct attributed tasks', async () => {
  await withWorkspaceServer(async ({ operation, context }) => {
    const actors = ['builder', 'reviewer']
    const receipts = await Promise.all(actors.map(actor => operation('task.create', { title: `Task from ${actor}` }, actor)))
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    assert.notEqual(receipts[0].result.taskId, receipts[1].result.taskId)
    for (let index = 0; index < receipts.length; index++) {
      const result = await context(receipts[index].result.taskId)
      assert.equal(result.task.title, `Task from ${actors[index]}`)
      assert.equal(result.task.created_by, actors[index])
    }
  })
})

it('mixed concurrent operations each appear once in the shared activity record', async () => {
  await withWorkspaceServer(async ({ create, update, operation, context, server }) => {
    const taskId = await create()
    const receipts = await Promise.all([
      update(taskId, { status: 'in-progress' }, 'builder'),
      operation('comment.add', { taskId, text: 'Concurrent comment' }, 'reviewer'),
    ])
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    const result = await context(taskId)
    assert.deepEqual(result.history.map(event => event.type).sort(), ['comment.add', 'task.create', 'task.update'])
    const activity = Object.values(server.store.workspace.handle.doc().operations).map(plain).filter(event => event.taskId === taskId)
    assert.deepEqual(activity.map(event => event.operationId).sort(), result.history.map(event => event.operationId).sort())
  })
})

it('a burst from five registered agents preserves all fifty comments and their provenance', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    for (let index = 0; index < 5; index++) {
      assert.equal((await operation('actor.register', { id: `agent-${index}`, handle: `agent-${index}`, kind: 'agent' })).savedLocally, true)
    }
    const receipts = await Promise.all(Array.from({ length: 50 }, (_, index) =>
      operation('comment.add', { taskId, text: `Message ${index}` }, `agent-${index % 5}`)))
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    const result = await context(taskId)
    assert.equal(result.comments.length, 50)
    assert.equal(result.history.length, 51)
    for (let index = 0; index < receipts.length; index++) {
      const comment = result.comments.find(comment => comment.id === receipts[index].result.commentId)
      assert.equal(comment.content, `Message ${index}`)
      assert.equal(comment.actorId, `agent-${index % 5}`)
    }
  })
})
