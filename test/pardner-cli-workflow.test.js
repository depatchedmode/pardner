import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'
import { SCHEMA_VERSION } from '../lib/workspace-schema.js'

it('finds and completes an assigned review to-do in the same task through the public CLI', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-workflow-'))
  const service = await startCliService(directory)
  const run = async (args, actor = 'alice') => {
    const output = await cli(directory, [...args, '--actor', actor])
    assert.equal(output.code, 0, output.stdout + output.stderr)
    assert.equal(output.result.success, true)
    return output.result
  }
  try {
    assert.equal((await stat(join(directory, 'connection.json'))).mode & 0o777, 0o600)
    for (const [id, kind] of [['alice', 'human'], ['bob', 'human'], ['builder', 'agent'], ['reviewer', 'agent']]) {
      await run(['actors', 'register', id, '--handle', id, '--kind', kind])
    }
    const description = 'Complete specification. '.repeat(100)
    const created = await run(['task', 'create', '--title', 'Ship Pardner', '--description', description, '--assignee', 'alice', '--operation-id', 'create-once'])
    const taskId = created.result.taskId
    assert.equal(created.savedLocally, true)
    const again = await run(['task', 'create', '--title', 'Ship Pardner', '--description', description, '--assignee', 'alice', '--operation-id', 'create-once'])
    assert.equal(again.replayed, true)
    for (let index = 0; index < 6; index++) await run(['comment', taskId, `Comment ${index}: ${'Long evidence '.repeat(60)}`])
    let context = await run(['show', taskId])
    assert.equal(context.task.description, description)
    assert.equal(context.comments.length, 6)
    assert.ok(context.comments.every(comment => comment.content.length > 500))
    assert.equal(context.unreadCount, 6)
    await run(['read', taskId, '--receipts', JSON.stringify(context.comments.map(comment => ({ commentId: comment.id, revisionId: comment.revisionId })))])
    assert.equal((await run(['show', taskId])).unreadCount, 0)
    assert.equal((await run(['show', taskId], 'builder')).unreadCount, 6)
    const text = 'Check the release evidence'
    const add = ['todo', 'add', taskId, '--to', 'reviewer', '--message', text, '--operation-id', 'review-once']
    const assigned = await run(add, 'builder')
    const commentId = assigned.result.commentId
    assert.equal((await run(add, 'builder')).replayed, true)
    const { todos } = await run(['todos'], 'reviewer')
    assert.equal(todos.length, 1)
    assert.deepEqual({ id: todos[0].id, taskId: todos[0].taskId, actorId: todos[0].actorId, content: todos[0].content, todo: todos[0].todo },
      { id: commentId, taskId, actorId: 'builder', content: text, todo: { assignee: 'reviewer', completion: null } })
    context = await run(['show', taskId])
    assert.equal(context.task.assignee, 'alice')
    assert.equal(context.task.state, 'open')
    assert.equal(context.mentions.filter(mention => mention.operationId === assigned.operationId && mention.toActorId === 'reviewer').length, 1)
    assert.equal(context.history.filter(event => event.operationId === assigned.operationId).length, 1)
    const review = await run(['show', taskId], 'reviewer')
    assert.equal(review.comments.find(comment => comment.id === commentId).unreadRevisionIds.length, 1)
    await run(['read', taskId, '--receipts', JSON.stringify([{ commentId, revisionId: assigned.operationId }])], 'reviewer')
    const claim = await run(['mentions', 'claim-next', '--request-id', 'claim-review'], 'reviewer')
    assert.equal(claim.mention.taskId, taskId)
    await run(['mentions', 'ack', claim.mention.id, '--claim-token', claim.claimToken], 'reviewer')
    assert.equal((await run(['todos'], 'reviewer')).todos.length, 1, 'reading and acknowledging leave the to-do open')
    assert.equal((await cli(directory, ['todo', 'complete', commentId, '--actor', 'bob'])).result.error.code, 'FORBIDDEN')
    assert.equal((await cli(directory, ['comment-edit', commentId, 'Changed request', '--actor', 'builder', '--revisions', JSON.stringify([assigned.operationId])])).result.error.code, 'FORBIDDEN')
    await run(['handoff', taskId, '--to', 'builder', '--message', 'Over to Builder',
      '--revisions', JSON.stringify({ assignee: context.revisions.assignee })])
    await run(['update', taskId, '--outcome', 'completed', '--revisions', JSON.stringify({ outcome: context.revisions.outcome })])
    assert.equal((await run(['todos'], 'reviewer')).todos.length, 1, 'ended work keeps open to-dos in the reviewer queue')
    await run(['comment', taskId, 'The release evidence is ready.'], 'reviewer')
    const complete = ['todo', 'complete', commentId, '--operation-id', 'complete-once']
    const done = await run(complete, 'reviewer')
    assert.equal((await run(complete, 'reviewer')).replayed, true)
    assert.deepEqual((await run(['todos'], 'reviewer')).todos, [])
    const completed = (await run(['show', taskId])).comments.find(comment => comment.id === commentId).todo.completion
    assert.equal(completed.actorId, 'reviewer')
    assert.equal(completed.operationId, done.operationId)
    const stale = await cli(directory, ['update', taskId, '--actor', 'alice', '--outcome', 'none', '--revisions', JSON.stringify({ outcome: context.revisions.outcome })])
    assert.equal(stale.code, 1)
    assert.equal(stale.result.error.code, 'STALE_UPDATE')
    assert.ok(stale.result.error.details.current.length)
    const final = await run(['show', taskId])
    assert.equal(final.task.assignee, 'builder')
    assert.equal(final.task.outcome, 'completed')
    assert.equal(final.task.state, 'ended')
    assert.equal((await run(['tasks', '--outcome', 'completed'])).tasks[0].id, taskId)
    assert.equal(JSON.parse(await readFile(join(directory, 'workspace.json'), 'utf8')).schemaVersion, SCHEMA_VERSION)
  } finally {
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

it('reports an author-only comment deletion refusal and supports author retries through the CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-comment-author-'))
  const service = await startCliService(directory)
  const run = async (args, actor = 'alice') => {
    const output = await cli(directory, [...args, '--actor', actor])
    assert.equal(output.code, 0, output.stdout + output.stderr)
    return output.result
  }
  try {
    for (const id of ['alice', 'bob']) await run(['actors', 'register', id, '--handle', id, '--kind', 'human'])
    const { result: { taskId } } = await run(['task', 'create', '--title', 'Author permissions'])
    const { result: added } = await cli(directory, ['comment', taskId, 'Only I may delete this'], { env: { PARDNER_ACTOR: 'alice' } })
    assert.equal(added.actorId, 'alice')
    const args = ['comment-delete', added.result.commentId, '--revisions', JSON.stringify([added.operationId]), '--operation-id', 'delete-once']
    const refused = await cli(directory, [...args, '--actor', 'bob'])
    assert.equal(refused.code, 1)
    assert.equal(refused.result.error.code, 'FORBIDDEN')
    assert.equal(refused.result.error.message, 'Only the comment author may delete it')
    assert.equal((await run(['show', taskId])).comments.length, 1)
    assert.equal((await run(args)).savedLocally, true)
    assert.equal((await run(args)).replayed, true)
    assert.equal((await run(['show', taskId])).comments.length, 0)
  } finally {
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
