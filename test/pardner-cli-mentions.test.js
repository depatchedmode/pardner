import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from '../lib/client-service.js'
import { cli } from '../support/cli-resources.js'
import { joinApproved } from '../support/enrollment.js'
import { sameComputerRoute } from '../support/client-workspace.js'

async function participant(root, name) {
  const directory = join(root, name.toLowerCase())
  // An explicit loopback route: the Human invitations here are used by another client on this computer (#162).
  const client = await startClient({ directory, ...await sameComputerRoute(), deviceName: `${name} laptop`, gitDirectory: root })
  const token = client.registry.read().operatorToken
  const call = async (path, body) => {
    const response = await fetch(`${client.url}/pardner/client/v1${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.status, 200, `${name} ${path}: ${JSON.stringify(result)}`)
    return result
  }
  await call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { client, call, directory }
}

it('claims, releases, and acknowledges hub deliveries through a joined machine’s agent CLI', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-cli-delivery-'))
  let alice, bob
  try {
    alice = await participant(root, 'Alice')
    bob = await participant(root, 'Bob')
    const { project } = await alice.call('/projects', { name: 'Agent inbox', operationId: 'create' })
    const { invitation } = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite-bob' })
    await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation, operationId: 'join' })
    // Bob's agent runs on Bob's machine; its delivery calls reach the hub as requests signed by Bob's machine key.
    const grantFile = join(bob.directory, 'agent.json')
    const granted = await cli(bob.directory, ['client', 'agent-grant', '--project', project.id, '--output-file', grantFile])
    assert.equal(granted.code, 0, granted.stdout + granted.stderr)
    const grant = JSON.parse(await readFile(grantFile, 'utf8'))
    const run = async args => {
      const output = await cli(bob.directory, [...args, '--token-file', grantFile])
      assert.equal(output.code, 0, output.stdout + output.stderr)
      return output.result
    }
    const created = await alice.call(`/projects/${project.id}/api/automerge/operations`, { type: 'task.create', operationId: 'task', payload: { title: 'Durable agent inbox' } })
    const taskId = created.result.taskId
    let handle
    while (!handle) {
      handle = (await alice.call(`/projects/${project.id}`)).actors.find(actor => actor.id === grant.actorId)?.handle
      if (!handle) await delay(50)
    }
    await alice.call(`/projects/${project.id}/api/automerge/operations`, { type: 'comment.add', operationId: 'mention', payload: { taskId, text: `@${handle} please work on this` } })
    const deadline = Date.now() + 10000
    let pending = await run(['mentions', 'pending'])
    while (!pending.mentions.length && Date.now() < deadline) { await delay(50); pending = await run(['mentions', 'pending']) }
    assert.equal(pending.mentions.length, 1)
    const claim = await run(['mentions', 'claim-next', '--request-id', 'first-claim'])
    assert.equal(claim.claimed, true)
    assert.equal((await run(['mentions', 'pending'])).mentions.length, 0)
    assert.equal((await run(['mentions', 'claim-next', '--request-id', 'first-claim'])).claimToken, claim.claimToken)
    assert.equal((await run(['mentions', 'claim-next', '--request-id', 'competing-claim'])).claimed, false)
    const released = await run(['mentions', 'release', claim.mention.id, '--claim-token', claim.claimToken])
    assert.equal(released.released, true)
    assert.equal((await run(['mentions', 'pending'])).mentions.length, 1)
    assert.equal((await run(['mentions', 'release', claim.mention.id, '--claim-token', claim.claimToken])).replayed, true)
    const retry = await run(['mentions', 'claim-next', '--request-id', 'second-claim'])
    assert.notEqual(retry.claimToken, claim.claimToken)
    const stale = await cli(bob.directory, ['mentions', 'ack', claim.mention.id, '--claim-token', claim.claimToken, '--token-file', grantFile])
    assert.equal(stale.result.error.code, 'STALE_CLAIM')
    assert.equal((await run(['mentions', 'ack', retry.mention.id, '--claim-token', retry.claimToken])).acknowledged, true)
    assert.equal((await run(['mentions', 'pending'])).mentions.length, 0)
    // Without the hub, new leases are unavailable and say so; accepted work continues and saves locally.
    await alice.client.stop(); alice = null
    const unavailable = await cli(bob.directory, ['mentions', 'claim-next', '--request-id', 'offline-claim', '--token-file', grantFile])
    assert.equal(unavailable.result.error.code, 'HUB_UNAVAILABLE')
    const progress = await run(['comment', taskId, 'Accepted work continues while offline'])
    assert.equal(progress.savedLocally, true)
    assert.equal(progress.syncPending, true)
    const context = await run(['show', taskId])
    assert.ok(context.comments.some(comment => comment.content === 'Accepted work continues while offline'))
  } finally {
    await bob?.client.stop()
    await alice?.client.stop()
    await rm(root, { recursive: true, force: true })
  }
})
