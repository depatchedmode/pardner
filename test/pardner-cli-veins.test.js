import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'

it('pursues a goal through veins and tasks with the public CLI', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-veins-'))
  const service = await startCliService(directory)
  const attempt = (args, actor = 'alice') => cli(directory, [...args, '--actor', actor])
  const run = async (args, actor) => {
    const output = await attempt(args, actor)
    assert.equal(output.code, 0, output.stdout + output.stderr)
    assert.equal(output.result.success, true)
    return output.result
  }
  try {
    await run(['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human'])
    await run(['actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent'])

    const aimless = await attempt(['vein', 'create', '--title', 'Aimless'])
    assert.notEqual(aimless.code, 0)
    assert.equal(aimless.result.error.code, 'GOAL_REQUIRED')

    const caching = await run(['vein', 'create', '--title', 'Edge caching', '--goal', 'p95 under 200ms'])
    const { veinId, goalId } = caching.result
    assert.equal(caching.result.createdGoal, true)
    const rewrite = await run(['vein', 'create', '--title', 'Rewrite hot path', '--goal', goalId])
    assert.equal(rewrite.result.goalId, goalId, 'an existing goal ID links instead of creating')
    const typo = await attempt(['vein', 'create', '--title', 'Typo', '--goal', `goal-${'0'.repeat(24)}`])
    assert.equal(typo.result.error.code, 'NOT_FOUND', 'a mistyped goal ID is not turned into a goal title')

    const shared = (await run(['task', 'create', '--title', 'Add latency instrumentation', '--vein', `${veinId},${rewrite.result.veinId}`], 'builder')).result.taskId
    const solo = (await run(['task', 'create', '--title', 'Cache headers'], 'builder')).result.taskId
    await run(['vein', 'add', veinId, solo], 'builder')

    assert.deepEqual((await run(['tasks', '--vein', veinId])).tasks.map(task => task.id).sort(), [shared, solo].sort())
    assert.deepEqual((await run(['veins', '--goal', goalId])).veins.map(vein => vein.title).sort(), ['Edge caching', 'Rewrite hot path'])
    assert.deepEqual((await run(['goals', '--status', 'open'])).goals.map(goal => goal.title), ['p95 under 200ms'])

    const taskContext = await run(['show', solo])
    const removed = await run(['vein', 'remove', veinId, solo, '--revisions', JSON.stringify(taskContext.veins[0].linkRevisions)])
    assert.equal(removed.result.taskId, solo)

    const { revisions } = await run(['show', shared])
    await run(['update', shared, '--status', 'dead-end', '--revisions', JSON.stringify({ status: revisions.status })], 'builder')
    let vein = await run(['vein', 'show', veinId])
    assert.equal(vein.vein.readyForVerdict, true)
    assert.equal(vein.goal.title, 'p95 under 200ms')
    await run(['vein', 'update', veinId, '--status', 'dead-end', '--revisions', JSON.stringify({ status: vein.revisions.status })])
    vein = await run(['vein', 'show', veinId])
    assert.equal(vein.vein.status, 'dead-end')
    assert.equal(vein.vein.readyForVerdict, false)

    const goal = await run(['goal', 'show', goalId])
    assert.equal(goal.goal.status, 'open')
    await run(['goal', 'update', goalId, '--status', 'achieved', '--revisions', JSON.stringify({ status: goal.revisions.status })])
    assert.deepEqual((await run(['goals', '--status', 'achieved'])).goals.map(item => item.id), [goalId])
  } finally {
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
