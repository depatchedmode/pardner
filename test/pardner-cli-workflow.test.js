import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'
import { SCHEMA_VERSION } from '../lib/workspace-schema.js'

it('runs human to agent to agent to human handoffs through the public CLI service path', { timeout: 30000 }, async () => {
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
    for (const [id, kind] of [['alice', 'human'], ['builder', 'agent'], ['reviewer', 'agent']]) {
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
    for (const [from, to, status] of [['alice', 'builder', 'in-progress'], ['builder', 'reviewer', 'review'], ['reviewer', 'alice', 'completed']]) {
      context = await run(['show', taskId], from)
      const receipt = await run(['handoff', taskId, '--to', to, '--status', status, '--message', `${from} hands off to @${to}`,
        '--revisions', JSON.stringify({ assignee: context.revisions.assignee, status: context.revisions.status })], from)
      assert.equal(receipt.result.mentionIds.length, 1)
      assert.equal((await run(['tasks', '--assignee', to], to)).tasks.length, 1)
      const claim = await run(['mentions', 'claim-next', '--request-id', `claim-${to}`], to)
      assert.equal(claim.claimed, true)
      assert.equal(claim.mention.taskId, taskId)
      await run(['mentions', 'ack', claim.mention.id, '--claim-token', claim.claimToken], to)
      assert.equal((await run(['mentions', 'pending'], to)).mentions.length, 0)
    }
    const stale = await cli(directory, ['update', taskId, '--actor', 'alice', '--status', 'backlog', '--revisions', JSON.stringify({ status: ['create-once'] })])
    assert.equal(stale.code, 1)
    assert.equal(stale.result.error.code, 'STALE_UPDATE')
    assert.ok(stale.result.error.details.current.length)
    const final = await run(['show', taskId])
    assert.equal(final.task.assignee, 'alice')
    assert.equal(final.task.status, 'completed')
    assert.equal(final.history.filter(event => event.type === 'task.handoff').length, 3)
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
    const added = await run(['comment', taskId, 'Only I may delete this'])
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
