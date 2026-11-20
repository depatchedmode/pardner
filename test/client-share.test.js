import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:net'
import { WebSocket } from 'ws'
import { startClient } from '../lib/client-service.js'
import { CLIENT_API } from '../lib/client-identity.js'
import { invitationData } from '../lib/client-invites.js'
import { decodeInvitation, encodeInvitation, tunnelRefusal } from '../lib/enrollment.js'
import { TAILCAT_VERSION } from '../lib/tailcat.js'
import { joinApproved } from '../support/enrollment.js'
import { TUNNEL_ADDRESS as ADDRESS, fakeTunnel } from '../support/fake-tunnel.js'

// Sharing a hosted project over a managed route (lib/client-share.js, prototype of #251). The tunnel driver here is
// a stand-in: `serve` hands out an address and `forward` is a plain TCP relay between two loopback ports, so these
// tests cover Pardner's side of the route and need neither tailcat nor a network.

async function person(t, name, options = {}) {
  const directory = options.directory ?? await mkdtemp(join(tmpdir(), 'pardner-share-'))
  const tunnel = options.tunnel ?? fakeTunnel()
  const client = await startClient({ directory, port: 0, deviceName: `${name} laptop`, tunnel, tunnelProbeMs: 150, commit: 'c'.repeat(40),
    setupAgent: { harnessId: 'openai-codex', name: `${name} agent` } })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const send = async (path, body, token = client.registry.read().operatorToken) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, result: await response.json() }
  }
  const call = async (path, body, token) => { const { status, result } = await send(path, body, token); assert.equal(status, 200, JSON.stringify(result)); return result }
  if (!options.directory) await call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { client, call, send, directory, tunnel }
}
async function eventually(read, message) {
  const end = Date.now() + 15000
  for (;;) { const value = await read(); if (value) return value; assert.ok(Date.now() < end, message); await new Promise(resolve => setTimeout(resolve, 50)) }
}
const titles = async (who, projectId) => Object.values((await who.call(`/projects/${projectId}/api/automerge/doc`)).doc.tasks).map(task => task.title)
async function createTask(who, projectId, title) {
  const { token } = await who.call(`/projects/${projectId}/agent-grant`, {})
  return who.call(`/projects/${projectId}/api/automerge/operations`, { type: 'task.create', operationId: `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, payload: { title } }, token)
}

test('a hosted project is shared by a switch, joined through the route, and reaches nothing else on the hub', { timeout: 60000 }, async t => {
  const alice = await person(t, 'Alice'), bob = await person(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Shared board', operationId: 'create' })
  const { project: other } = await alice.call('/projects', { name: 'Private board', operationId: 'create-private' })
  assert.deepEqual(project.share, { role: 'hub', via: 'tailcat', on: false, state: 'off' })

  // Off: a Human invitation is refused and names the switch; nothing listens for other computers.
  const refused = await alice.send(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'early' })
  assert.equal(refused.result.code, 'PUBLIC_URL_REQUIRED')
  assert.ok(refused.result.error.endsWith(`Or switch on sharing for this project: \`pardner client share --project ${project.id} --on\`.`), refused.result.error)
  assert.equal(alice.tunnel.log.serves, 0)

  assert.deepEqual((await alice.call(`/projects/${project.id}/share`, { on: true })).share, { role: 'hub', via: 'tailcat', on: true, state: 'on' })
  const { advertisedPort, listenPort } = alice.client.registry.read().share
  assert.equal(alice.tunnel.log.served, listenPort, 'tailcat serves the shared listener, never the client’s own port')
  assert.notEqual(listenPort, new URL(alice.client.url).port)
  assert.ok(alice.tunnel.log.keyFile.startsWith(join(alice.directory, 'tailcat')), 'the route’s key stays in the private client directory')

  const invitation = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  const data = invitationData(invitation.invitation)
  assert.equal(data.endpoint, `http://127.0.0.1:${advertisedPort}${CLIENT_API}/enroll`)
  assert.deepEqual(data.tunnel, { kind: 'tailcat', address: ADDRESS, localPort: advertisedPort, remotePort: listenPort })
  assert.ok(!JSON.stringify(data.offer).includes(ADDRESS), 'the tailcat address stays out of the signed offer')
  assert.ok(invitation.setupPrompt.includes(`check out commit ${'c'.repeat(40)}`))
  assert.ok(invitation.setupPrompt.includes(`install tailcat ${TAILCAT_VERSION} first`))
  assert.ok(!JSON.stringify(await alice.call(`/projects/${project.id}`)).includes(ADDRESS), 'the address is in no project view')

  await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation: invitation.setupPrompt, operationId: 'join' })
  assert.equal(bob.tunnel.log.forwards, 1, 'the joining client opened its own end of the route')
  const joined = Object.values(bob.client.registry.read().projects)[0]
  assert.equal(joined.hubUrl, `http://127.0.0.1:${advertisedPort}${CLIENT_API}/replica/${project.id}`)
  assert.deepEqual((await bob.call(`/projects/${project.id}`)).project.share, { role: 'replica', via: 'tailcat', state: 'on' })
  await createTask(alice, project.id, 'From the hub')
  await eventually(async () => (await titles(bob, project.id)).includes('From the hub'), 'the joined machine syncs through the route')

  // What the route carries: enrollment and the shared project's machine routes, and nothing else.
  const operator = alice.client.registry.read().operatorToken
  const probe = async (path, init = {}) => (await fetch(`http://127.0.0.1:${advertisedPort}${path}`,
    { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operator}`, ...init.headers } })).status
  assert.equal(await probe(`${CLIENT_API}/session`), 404, 'the operator API is not there, even with the operator token')
  assert.equal(await probe(`${CLIENT_API}/projects/${project.id}`), 404)
  assert.equal(await probe(`${CLIENT_API}/shutdown`, { method: 'POST', body: '{}' }), 404)
  assert.equal(await probe('/pardner/'), 404, 'the board is not there')
  assert.equal(await probe('/pardner/config'), 404)
  assert.equal(await probe(`${CLIENT_API}/replica/${other.id}/session`, { method: 'POST', body: '{}' }), 404, 'another project on this client is not there')
  assert.equal(await probe(`${CLIENT_API}/enroll`), 404, 'enrollment takes POST only')
  assert.equal(await probe(`${CLIENT_API}/replica/${project.id}/session`, { method: 'POST', body: '{}', headers: { Origin: 'https://example.test' } }), 404, 'a web page is refused')
  assert.equal(await probe(`${CLIENT_API}/replica/${project.id}/session`, { method: 'POST', body: '{}' }), 400, 'the shared project’s handshake route answers')
  // fetch normalises dot segments, so escaped and repeated separators are sent raw.
  const raw = path => new Promise(resolve => {
    const socket = connect(advertisedPort, '127.0.0.1', () => socket.write(`POST ${path} HTTP/1.1\r\nHost: 127.0.0.1:${advertisedPort}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`))
    let text = ''
    socket.on('data', chunk => { text += chunk }); socket.on('close', () => resolve(Number(text.split(' ')[1]))); socket.on('error', () => resolve(0))
  })
  for (const path of [`${CLIENT_API}/replica/${project.id}/../../session`, `${CLIENT_API}/replica/${project.id}/%2e%2e/%2e%2e/session`, `${CLIENT_API}//replica/${project.id}/session`, `${CLIENT_API}/replica/${other.id}/../${project.id}/session`]) {
    assert.equal(await raw(path), 404, path)
  }
  // The shared listener itself answers only requests addressed to the advertised host.
  assert.equal((await fetch(`http://127.0.0.1:${listenPort}${CLIENT_API}/replica/${project.id}/session`, { method: 'POST', body: '{}' })).status, 404)
  // A machine socket for a project that is not shared is dropped before any upgrade.
  await assert.rejects(new Promise((resolve, reject) => { const socket = new WebSocket(`ws://127.0.0.1:${advertisedPort}${CLIENT_API}/replica/${other.id}/native`); socket.once('open', resolve); socket.once('error', reject) }))
  // An invitation to a project that is not shared does not exist through the route.
  const hidden = await alice.call(`/projects/${other.id}/invites`, { purpose: 'agent', operationId: 'agent' })
  const offerId = invitationData(hidden.invitation).offer.offerId
  assert.equal(await probe(`${CLIENT_API}/enroll`, { method: 'POST', body: JSON.stringify({ action: 'status', offerId, requestId: 'x', recipientProof: 'y' }) }), 401)

  // Off: the joined machine keeps saving locally and syncs once sharing is back on.
  assert.deepEqual((await alice.call(`/projects/${project.id}/share`, { on: false })).share, { role: 'hub', via: 'tailcat', on: false, state: 'off' })
  assert.equal(alice.tunnel.log.running.size, 0, 'the route stops with its last shared project')
  await assert.rejects(fetch(`http://127.0.0.1:${listenPort}/`), 'the shared listener is closed')
  await createTask(bob, project.id, 'Made while off')
  await new Promise(resolve => setTimeout(resolve, 500))
  assert.ok(!(await titles(alice, project.id)).includes('Made while off'))
  assert.equal((await alice.send(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'while-off' })).result.code, 'PUBLIC_URL_REQUIRED')
  await alice.call(`/projects/${project.id}/share`, { on: true })
  assert.deepEqual(alice.client.registry.read().share.listenPort, listenPort, 'the route keeps its ports, since joined machines hold them')
  await eventually(async () => (await titles(alice, project.id)).includes('Made while off'), 'work saved while sharing was off arrives when it is back on')
})

test('sharing and a joined machine’s route come back after a restart, and a stale forward is replaced', { timeout: 60000 }, async t => {
  const alice = await person(t, 'Alice'), bob = await person(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Restarted board', operationId: 'create' })
  await alice.call(`/projects/${project.id}/share`, { on: true })
  const invitation = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation: invitation.invitation, operationId: 'join' })

  await bob.client.stop()
  assert.equal(bob.tunnel.log.running.size, 0, 'stopping the client stops its forward')
  const bobAgain = await person(t, 'Bob', { directory: bob.directory })
  await eventually(() => bobAgain.tunnel.log.forwards === 1, 'the forward is opened again at start')
  await createTask(alice, project.id, 'After Bob restarted')
  await eventually(async () => (await titles(bobAgain, project.id)).includes('After Bob restarted'), 'the restarted machine syncs')

  await alice.client.stop()
  const aliceAgain = await person(t, 'Alice', { directory: alice.directory })
  await eventually(async () => (await aliceAgain.call(`/projects/${project.id}`)).project.share.state === 'on', 'a shared project is shared again after the hub restarts')
  await createTask(aliceAgain, project.id, 'After the hub restarted')
  await eventually(async () => (await titles(bobAgain, project.id)).includes('After the hub restarted'), 'the joined machine finds the restarted hub')

  // A forward nothing answers through is replaced: here the relay keeps running while the hub's listener is gone.
  const before = bobAgain.tunnel.log.forwards
  await aliceAgain.call(`/projects/${project.id}/share`, { on: false })
  await eventually(() => bobAgain.tunnel.log.forwards > before, 'an unanswered forward is restarted')
  assert.equal((await bobAgain.call(`/projects/${project.id}`)).project.share.role, 'replica')
})

test('only the hosting computer shares, and a malformed or mismatched route is refused before anything is dialled', { timeout: 60000 }, async t => {
  const alice = await person(t, 'Alice'), bob = await person(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Routes', operationId: 'create' })
  await alice.call(`/projects/${project.id}/share`, { on: true })
  const invitation = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  const value = decodeInvitation(invitation.invitation)

  const good = { kind: 'tailcat', address: ADDRESS, localPort: 30000, remotePort: 30001 }
  assert.equal(tunnelRefusal(good), null)
  for (const bad of [null, [], { ...good, kind: 'ssh' }, { ...good, address: 'tc; rm -rf /' }, { ...good, address: `--key=${'A'.repeat(30)}` }, { ...good, localPort: 80 },
    { ...good, remotePort: '30001' }, { ...good, extra: 1 }, { kind: 'tailcat', address: ADDRESS }]) assert.equal(typeof tunnelRefusal(bad), 'string', JSON.stringify(bad))
  assert.throws(() => decodeInvitation(encodeInvitation({ ...value, tunnel: { ...good, address: 'nope' } })), { code: 'INVALID_INVITATION' })

  // A route whose port is not the one the signed offer names is refused, and no forward is opened.
  const mismatched = encodeInvitation({ ...value, tunnel: { ...value.tunnel, localPort: value.tunnel.localPort + 1 } })
  const refused = await bob.send('/join', { invitation: mismatched, operationId: 'join-mismatched' })
  assert.equal(refused.status, 400); assert.equal(refused.result.code, 'INVALID_INVITATION')
  assert.equal(bob.tunnel.log.forwards, 0)

  await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation: invitation.invitation, operationId: 'join' })
  const share = await bob.send(`/projects/${project.id}/share`, { on: true })
  assert.equal(share.status, 409); assert.equal(share.result.code, 'HUB_REQUIRED')
  // A member's invitation is issued by the hub and carries the same route.
  const fromBob = await bob.call(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'pair' })
  assert.deepEqual(invitationData(fromBob.invitation).tunnel, value.tunnel)
  // An agent credential cannot switch sharing.
  const { token } = await alice.call(`/projects/${project.id}/agent-grant`, {})
  assert.equal((await alice.send(`/projects/${project.id}/share`, { on: false }, token)).status, 403)
})

test('a route that cannot start leaves sharing off and says why', { timeout: 30000 }, async t => {
  const tunnel = fakeTunnel()
  tunnel.serve = async () => { throw Object.assign(new Error('Sharing a project between computers uses tailcat, which is not installed on this computer.'), { code: 'TUNNEL_UNAVAILABLE' }) }
  const alice = await person(t, 'Alice', { tunnel })
  const { project } = await alice.call('/projects', { name: 'No tailcat', operationId: 'create' })
  const { status, result } = await alice.send(`/projects/${project.id}/share`, { on: true })
  assert.equal(status, 503); assert.equal(result.code, 'TUNNEL_UNAVAILABLE')
  assert.match(result.error, /tailcat, which is not installed/)
  assert.deepEqual((await alice.call(`/projects/${project.id}/share`)).share, { role: 'hub', via: 'tailcat', on: false, state: 'off' })
})
