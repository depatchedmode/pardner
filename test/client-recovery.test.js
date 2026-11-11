import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from '../lib/client-service.js'
import { joinApproved } from '../support/enrollment.js'

const exec = promisify(execFile)
const base = '/pardner/client/v1'
async function participant(directory, name, options = {}) {
  const client = await startClient({ directory, port: 0, deviceName: name, ...options })
  const connection = JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8'))
  const api = async (path, body, { token = connection.token, expected = 200 } = {}) => {
    const response = await fetch(client.url + base + path, { method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const value = await response.json()
    assert.equal(response.status, expected, `${path}: ${value.code ?? response.status}`)
    return value
  }
  const cli = async args => {
    const { stdout } = await exec(process.execPath, ['bin/pardner.js', 'client', ...args, '--data', directory])
    const value = JSON.parse(stdout)
    assert.equal(value.success, true)
    return value
  }
  return { client, api, cli, directory, connection }
}
async function eventually(read, condition) {
  const deadline = Date.now() + 10000
  do { const value = await read(); if (condition(value)) return value; await delay(50) } while (Date.now() < deadline)
  assert.fail('Recovery state did not converge')
}
async function identity(p, name) { return p.cli(['identity', '--name', name, '--email', `${name.toLowerCase()}@example.test`, '--operation-id', 'identity']) }
async function invite(p, id, purpose, operationId) { return p.api(`/projects/${id}/invites`, { purpose, operationId }) }
const projectPath = id => `/projects/${id}/api/automerge`
const enroll = (joiner, approver, invitation, operationId = 'join') =>
  joinApproved({ join: body => joiner.api('/join', body), approver: (path, body) => approver.api(path, body), invitation, operationId })

test('cold backups restore both client and authority to fresh directories with identity, history, retries and delivery intact', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-client-restore-'))
  let alice, bob
  try {
    alice = await participant(join(root, 'alice'), 'Alice laptop')
    bob = await participant(join(root, 'bob'), 'Bob laptop')
    const aliceIdentity = await identity(alice, 'Alice'), bobIdentity = await identity(bob, 'Bob')
    const { project } = await alice.cli(['create', '--name', 'Recovery board', '--operation-id', 'create'])
    const { project: separate } = await alice.cli(['create', '--name', 'Independent board', '--operation-id', 'separate'])
    const invitation = await invite(alice, project.id, 'human', 'invite-bob')
    await enroll(bob, alice, invitation.setupPrompt)
    const path = projectPath(project.id)
    const operation = { type: 'task.create', operationId: 'retained-task', payload: { title: 'Retained work', description: 'Content and authored history survive restoration.' } }
    const saved = await bob.api(path + '/operations', operation)
    const { doc } = await eventually(() => alice.api(path + '/doc'), result => result.doc.tasks[saved.result.taskId])
    const agent = await bob.api(`/projects/${project.id}/agent-grant`, {})
    const person = (await bob.cli(['show', '--project', project.id])).actors.find(p => p.id === agent.actorId)
    await alice.api(path + '/operations', { type: 'comment.add', operationId: 'review-mention',
      payload: { taskId: saved.result.taskId, text: `@${person.handle} review the recovery evidence` } })
    const claim = await bob.api(path + '/deliveries/claim', { requestId: 'durable-receipt' }, { token: agent.token })
    assert.equal(claim.claimed, true)
    await bob.api(path + '/deliveries/ack', { mentionId: claim.mention.id, claimToken: claim.claimToken }, { token: agent.token })
    await eventually(() => bob.api(path + '/status'), s => s.savedLocally && !s.syncPending)
    const beforeContext = await bob.api(`${path}/task/${saved.result.taskId}/context`)
    assert.equal(beforeContext.comments.length, 1)
    const unusedInvite = await invite(alice, project.id, 'device', 'unused-device')
    const aliceUrl = alice.client.url
    await bob.client.stop(); bob = null
    await alice.client.stop(); alice = null
    await cp(join(root, 'alice'), join(root, 'backup-alice'), { recursive: true, errorOnExist: true, force: false })
    await cp(join(root, 'bob'), join(root, 'backup-bob'), { recursive: true, errorOnExist: true, force: false })
    await cp(join(root, 'backup-alice'), join(root, 'restored-alice'), { recursive: true, errorOnExist: true, force: false })
    await cp(join(root, 'backup-bob'), join(root, 'restored-bob'), { recursive: true, errorOnExist: true, force: false })

    bob = await participant(join(root, 'restored-bob'), 'Replacement Bob')
    const reopened = await bob.cli(['list'])
    assert.deepEqual(reopened.identity, bobIdentity.identity)
    assert.deepEqual(reopened.device, bobIdentity.device)
    assert.equal(reopened.projects[0].id, project.id)
    const exportFile = join(root, 'offline-content.json')
    await bob.cli(['export', '--project', project.id, '--output-file', exportFile])
    const exported = JSON.parse(await readFile(exportFile, 'utf8'))
    assert.equal(exported.doc.tasks[saved.result.taskId].title, doc.tasks[saved.result.taskId].title)
    assert.equal(exported.workspaceId, project.id)
    const replay = await bob.api(path + '/operations', operation)
    assert.equal(replay.replayed, true)
    assert.equal(replay.result.taskId, saved.result.taskId)
    const offline = await bob.api(path + '/operations', { type: 'comment.add', operationId: 'after-restore',
      payload: { taskId: saved.result.taskId, text: 'Saved after restoring while authority was absent.' } })
    assert.equal(offline.savedLocally, true)
    assert.equal(offline.syncPending, true)

    alice = await participant(join(root, 'restored-alice'), 'Replacement authority', { port: Number(new URL(aliceUrl).port) })
    const restored = await alice.cli(['list'])
    assert.deepEqual(restored.identity, aliceIdentity.identity)
    assert.deepEqual(restored.device, aliceIdentity.device)
    assert.equal(restored.projects.length, 2)
    // A restored hub serves no other machine until it catches up: Bob saw nothing newer than the backup, so he cannot
    // vouch for it, and the operator confirms that no machine holds newer state.
    const waiting = restored.projects.find(entry => entry.id === project.id).status.hub
    assert.equal(waiting.waiting, true); assert.equal(waiting.reason, 'restored')
    await eventually(() => bob.api(path + '/status'), s => s.hubRefusal?.code === 'HUB_WAITING')
    assert.equal((await alice.cli(['resume', '--project', project.id])).hub.waiting, false)
    const replayInvite = await invite(alice, project.id, 'device', 'unused-device')
    assert.equal(replayInvite.invitation, unusedInvite.invitation)
    const context = await eventually(() => alice.api(`${path}/task/${saved.result.taskId}/context`), c => c.comments.length === 2)
    assert.equal(context.comments.filter(c => c.content.includes('after restoring')).length, 1)
    assert.ok(context.history.some(event => event.requestId === 'retained-task'))
    const restoredAgent = await bob.api(`/projects/${project.id}/agent-grant`, {})
    assert.equal(restoredAgent.actorId, agent.actorId)
    assert.equal((await bob.api(path + '/deliveries', undefined, { token: restoredAgent.token })).mentions.length, 0)
    const ack = await bob.api(path + '/deliveries/ack', { mentionId: claim.mention.id, claimToken: claim.claimToken }, { token: restoredAgent.token })
    assert.equal(ack.acknowledged, true)
    assert.equal(ack.replayed, true)
    assert.equal(Object.keys((await alice.api(projectPath(separate.id) + '/doc')).doc.tasks).length, 0)
    await eventually(() => bob.api(path + '/status'), s => s.savedLocally && !s.syncPending)
  } finally {
    await Promise.all([alice?.client.stop(), bob?.client.stop()])
    await rm(root, { recursive: true, force: true })
  }
})

test('a surviving owned device revokes a lost device while its retained work remains exportable by its local operator', { timeout: 90000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-client-device-recovery-'))
  let alice, bob, spare
  try {
    alice = await participant(join(root, 'alice'), 'Alice')
    bob = await participant(join(root, 'bob'), 'Bob lost laptop')
    spare = await participant(join(root, 'spare'), 'Bob spare laptop')
    await identity(alice, 'Alice')
    const bobIdentity = await identity(bob, 'Bob')
    const { project } = await alice.cli(['create', '--name', 'Device recovery', '--operation-id', 'create'])
    const invited = await invite(alice, project.id, 'human', 'bob')
    await enroll(bob, alice, invited.invitation)
    // Bob's own laptop approves his spare machine.
    const linked = await invite(bob, project.id, 'device', 'spare')
    await enroll(spare, bob, linked.invitation)
    assert.deepEqual((await spare.cli(['list'])).identity, bobIdentity.identity)
    const path = projectPath(project.id)
    const saved = await bob.api(path + '/operations', { type: 'task.create', operationId: 'saved-before-loss', payload: { title: 'Retained after revocation' } })
    await eventually(() => alice.api(path + '/doc'), result => result.doc.tasks[saved.result.taskId])
    const members = await spare.cli(['show', '--project', project.id])
    assert.ok(members.actors.some(actor => actor.devices.some(device => device.id === bobIdentity.device.id)))
    const agent = await bob.api(`/projects/${project.id}/agent-grant`, {})
    assert.equal((await bob.api(`/projects/${project.id}/export`, undefined, { token: agent.token, expected: 403 })).code, 'FORBIDDEN')
    // The lost laptop is named by the device ID its profile lists; the spare signs `machine.remove` for it.
    const revoked = await spare.cli(['revoke', '--project', project.id, '--kind', 'device', '--id', bobIdentity.device.id, '--operation-id', 'lost-device'])
    assert.equal(revoked.removed, true)
    assert.equal(revoked.id, bob.client.registry.machineKey.machineId)
    const again = await spare.cli(['revoke', '--project', project.id, '--kind', 'device', '--id', bobIdentity.device.id, '--operation-id', 'lost-device'])
    assert.deepEqual(again, revoked)
    // The lost laptop learns of a removal made elsewhere when the hub closes its sync session and refuses its next
    // handshake; a write saved before that stays only local, because the hub no longer syncs with it.
    let written = 0
    const denied = await eventually(async () => {
      const response = await fetch(bob.client.url + base + path + '/operations', { method: 'POST',
        headers: { Authorization: `Bearer ${bob.connection.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'task.create', operationId: `before-refusal-${written++}`, payload: { title: 'Saved only locally' } }) })
      return { status: response.status, ...await response.json() }
    }, result => result.status === 403)
    assert.equal(denied.code, 'REVOKED')
    const exportFile = join(root, 'revoked-content.json')
    const exported = await bob.cli(['export', '--project', project.id, '--output-file', exportFile])
    assert.equal(exported.savedLocally, true)
    const text = await readFile(exportFile, 'utf8')
    const content = JSON.parse(text)
    assert.equal(content.format, 'pardner-workspace-view-v1')
    assert.equal(content.doc.tasks[saved.result.taskId].title, 'Retained after revocation')
    assert.equal((await stat(exportFile)).mode & 0o777, 0o600)
    for (const secret of [bob.connection.token, agent.token]) {
      assert.equal(text.includes(secret), false, 'Export must omit service/enrollment credentials')
    }
    assert.equal(text.includes('BEGIN PRIVATE KEY'), false, 'Export must omit the machine key')
    const continued = await spare.api(path + '/operations', { type: 'comment.add', operationId: 'surviving-device', payload: { taskId: saved.result.taskId, text: 'Still authorized on spare device.' } })
    assert.equal(continued.savedLocally, true)
    await eventually(() => alice.api(`${path}/task/${saved.result.taskId}/context`), c => c.comments.length === 1)
    const authorityPort = Number(new URL(alice.client.url).port)
    await alice.client.stop(); alice = null
    await cp(join(root, 'alice'), join(root, 'restored-authority'), { recursive: true, force: false, errorOnExist: true })
    alice = await participant(join(root, 'restored-authority'), 'Restored authority', { port: authorityPort })
    await alice.cli(['resume', '--project', project.id])
    await bob.client.stop(); bob = null
    bob = await participant(join(root, 'bob'), 'Reopened revoked device')
    await bob.cli(['export', '--project', project.id, '--output-file', exportFile])
    assert.equal(JSON.parse(await readFile(exportFile, 'utf8')).doc.tasks[saved.result.taskId].title, 'Retained after revocation')
    const persistedDenial = await bob.api(path + '/operations', { type: 'task.create', operationId: 'after-restore-denied', payload: { title: 'Still denied' } }, { expected: 403 })
    assert.equal(persistedDenial.code, 'REVOKED')
    const resumed = await spare.api(path + '/operations', { type: 'comment.add', operationId: 'survivor-after-restore', payload: { taskId: saved.result.taskId, text: 'Surviving admission remains valid after authority restore.' } })
    assert.equal(resumed.savedLocally, true)
    await eventually(() => alice.api(`${path}/task/${saved.result.taskId}/context`), c => c.comments.length === 2)
  } finally {
    await Promise.all([alice?.client.stop(), bob?.client.stop(), spare?.client.stop()])
    await rm(root, { recursive: true, force: true })
  }
})
