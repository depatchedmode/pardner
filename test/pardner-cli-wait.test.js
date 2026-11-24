import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'
import { encodeBoardVersion } from '../lib/board-version.js'

it('catches up from board reads and resumes without missing or consuming notifications', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-wait-'))
  let service
  const run = async (...args) => {
    const output = await cli(directory, args, { env: { PARDNER_ACTOR: 'alice' } })
    assert.equal(output.code, 0, output.stdout + output.stderr)
    return output.result
  }
  try {
    service = await startCliService(directory)
    await run('actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human')
    await run('actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent')
    const { result: { taskId } } = await run('task', 'create', '--title', 'Watch this task')
    const { result: { taskId: otherTask } } = await run('task', 'create', '--title', 'Another task')
    const { result: { goalId } } = await run('goal', 'create', '--title', 'A goal')
    const { result: { veinId } } = await run('vein', 'create', '--title', 'A vein', '--goal', goalId)
    const old = await run('comment', taskId, 'A comment already read by the caller')

    const start = await run('status')
    assert.equal(typeof start.boardVersion, 'string')
    for (const args of [['actors', 'list'], ['tasks'], ['show', taskId], ['comments', taskId], ['branches', taskId],
      ['goals'], ['goal', 'show', goalId], ['veins'], ['vein', 'show', veinId], ['mentions', 'pending'],
      ['activity'], ['timeline'], ['diff', taskId], ['trace', 'task', taskId]]) {
      assert.equal((await run(...args)).boardVersion, start.boardVersion, args.join(' '))
    }

    // An edit can create a mention without creating a new comment.
    await run('comment-edit', old.result.commentId, '@builder please review', '--revisions', JSON.stringify([old.operationId]))
    const unrelated = await run('comment', otherTask, '@alice on a separate task')
    const reply = await run('comment', taskId, '@builder more context', '--operation-id', 'reply')
    const replay = await run('comment', taskId, '@builder more context', '--operation-id', 'reply')
    assert.equal(replay.replayed, true)
    const deleted = await run('comment', taskId, 'This will be deleted before wait starts')
    await run('comment-delete', deleted.result.commentId, '--revisions', JSON.stringify([deleted.operationId]))
    const beforeWait = await run('status')

    // The saved board version names the same history after an ordinary service restart.
    await service.stop()
    service = await startCliService(directory)
    const mentions = await run('wait', '--actor', 'builder', '--after', start.boardVersion, '--timeout', '2')
    assert.equal(mentions.reason, 'matched')
    assert.equal(mentions.boardVersion, beforeWait.boardVersion)
    assert.deepEqual(new Set(mentions.events.map(event => event.mention.commentId)), new Set([old.result.commentId, reply.result.commentId]))
    assert.equal(mentions.events.length, 2)
    assert.ok(mentions.events.every(event => event.type === 'mention' && event.mention.toActorId === 'builder'))
    const pending = await run('mentions', 'pending', '--actor', 'builder')
    assert.deepEqual(new Set(pending.mentions.map(mention => mention.id)), new Set(mentions.events.map(event => event.mention.id)))
    assert.ok(!pending.mentions.some(mention => mention.id === unrelated.result.mentionIds[0]))
    const claim = await run('mentions', 'claim-next', '--actor', 'builder', '--request-id', 'after-wait')
    assert.equal(claim.claimed, true)
    assert.ok(pending.mentions.some(mention => mention.id === claim.mention.id))

    const comments = await run('wait', '--task', taskId, '--after', start.boardVersion, '--timeout', '2')
    assert.equal(comments.reason, 'matched')
    assert.equal(comments.events.length, 2)
    assert.deepEqual(new Set(comments.events.map(event => event.comment.id)), new Set([reply.result.commentId, deleted.result.commentId]))
    assert.ok(comments.events.every(event => event.type === 'comment' && event.comment.taskId === taskId && !Object.hasOwn(event.comment, 'content')))
    const context = await run('show', taskId, '--actor', 'builder')
    assert.equal(context.unreadCount, 2, 'waiting never writes read receipts')
    assert.equal(context.boardVersion, beforeWait.boardVersion, 'waiting never writes to the board')

    const timeout = await cli(directory, ['wait', '--task', taskId, '--after', comments.boardVersion, '--timeout', '0.05'])
    assert.equal(timeout.code, 2, timeout.stdout + timeout.stderr)
    assert.deepEqual(timeout.result, { success: true, reason: 'timeout', events: [], boardVersion: comments.boardVersion })
    assert.equal(timeout.stderr, '')
    const next = await run('comment', taskId, 'Another reply after the timeout')
    const resumed = await run('wait', '--task', taskId, '--after', timeout.result.boardVersion, '--timeout', '2')
    assert.deepEqual(resumed.events.map(event => event.comment.id), [next.result.commentId])
  } finally {
    await service?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

it('distinguishes invalid board versions and arguments from a normal wait timeout', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-wait-invalid-'))
  let service
  try {
    service = await startCliService(directory)
    const { result: status } = await cli(directory, ['status'])
    for (const [options, code] of [
      [['--timeout', 'zero'], 'INVALID_ARGUMENT'],
      [['--timeout', '0'], 'INVALID_ARGUMENT'],
      [['--timeout', '3000000'], 'INVALID_ARGUMENT'],
      [['--task', 'missing'], 'NOT_FOUND'],
      [['--after', 'invalid!'], 'INVALID_BOARD_VERSION'],
      [['--after', encodeBoardVersion({ ...status, workspaceId: 'another-project' })], 'WORKSPACE_MISMATCH'],
      [['--after', encodeBoardVersion({ ...status, heads: ['f'.repeat(64)] })], 'UNKNOWN_BOARD_VERSION'],
      [['--actor', 'unregistered'], 'UNKNOWN_ACTOR'],
      [['--token', 'invalid-test-token'], 'AUTH_REQUIRED'],
      [[], 'ACTOR_REQUIRED'],
    ]) {
      const result = await cli(directory, ['wait', ...options])
      assert.equal(result.code, 1, result.stdout + result.stderr)
      assert.equal(result.result.error.code, code, result.stdout + result.stderr)
    }
  } finally {
    await service?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
