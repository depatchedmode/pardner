import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'

it('claims, releases, and acknowledges hub deliveries through a replica CLI', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-cli-delivery-'))
  const hubData = join(root, 'hub')
  const localData = join(root, 'local')
  const hub = await startCliService(hubData)
  let local
  async function run(directory, args, actor = 'builder') {
    const output = await cli(directory, [...args, '--actor', actor])
    assert.equal(output.code, 0, output.stdout + output.stderr)
    return output.result
  }
  try {
    await run(hubData, ['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human'], 'alice')
    await run(hubData, ['actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent'], 'alice')
    const { token } = JSON.parse(await readFile(join(hubData, 'connection.json'), 'utf8'))
    local = await startCliService(localData, ['--role', 'replica', '--hub', hub.httpUrl, '--hub-ws', `${hub.wsUrl}/automerge`, '--hub-token', token])
    const created = await run(hubData, ['task', 'create', '--title', 'Durable agent inbox'], 'alice')
    const taskId = created.result.taskId
    await run(hubData, ['comment', taskId, '@builder please work on this'], 'alice')
    const pending = await run(localData, ['mentions', 'pending'])
    assert.equal(pending.mentions.length, 1)
    const claim = await run(localData, ['mentions', 'claim-next', '--request-id', 'first-claim'])
    assert.equal(claim.claimed, true)
    assert.equal((await run(localData, ['mentions', 'pending'])).mentions.length, 0)
    assert.equal((await run(localData, ['mentions', 'claim-next', '--request-id', 'first-claim'])).claimToken, claim.claimToken)
    assert.equal((await run(localData, ['mentions', 'claim-next', '--request-id', 'competing-claim'])).claimed, false)
    const released = await run(localData, ['mentions', 'release', claim.mention.id, '--claim-token', claim.claimToken])
    assert.equal(released.released, true)
    assert.equal((await run(localData, ['mentions', 'pending'])).mentions.length, 1)
    assert.equal((await run(localData, ['mentions', 'release', claim.mention.id, '--claim-token', claim.claimToken])).replayed, true)
    const retry = await run(localData, ['mentions', 'claim-next', '--request-id', 'second-claim'])
    assert.notEqual(retry.claimToken, claim.claimToken)
    const stale = await cli(localData, ['mentions', 'ack', claim.mention.id, '--claim-token', claim.claimToken, '--actor', 'builder'])
    assert.equal(stale.result.error.code, 'STALE_CLAIM')
    assert.equal((await run(localData, ['mentions', 'ack', retry.mention.id, '--claim-token', retry.claimToken])).acknowledged, true)
    assert.equal((await run(localData, ['mentions', 'pending'])).mentions.length, 0)
    await hub.stop()
    await local.stop('SIGKILL')
    const reopenedAt = Date.now()
    local = await startCliService(localData)
    assert.ok(Date.now() - reopenedAt < 6000, 'Enrolled replica must reopen without its hub')
    assert.equal(local.role, 'replica')
    const unavailable = await cli(localData, ['mentions', 'claim-next', '--request-id', 'offline-claim', '--actor', 'builder'])
    assert.equal(unavailable.result.error.code, 'HUB_UNAVAILABLE')
    const progress = await run(localData, ['comment', taskId, 'Accepted work continues while offline'])
    assert.equal(progress.savedLocally, true)
    assert.equal(progress.syncPending, true)
    const context = await run(localData, ['show', taskId])
    assert.ok(context.comments.some(comment => comment.content === 'Accepted work continues while offline'))
  } finally {
    await local?.stop()
    await hub.stop()
    await rm(root, { recursive: true, force: true })
  }
})
