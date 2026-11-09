import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { startClient } from '../lib/client-service.js'
import { CLIENT_API, setupAgent } from '../lib/client-identity.js'

async function fixture(t, name) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-'))
  const client = await startClient({ directory, port: 0, deviceName: `${name} laptop`, setupAgent: { harnessId: 'openai-codex', name: `${name} agent` } })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const api = async (path, body, options = {}) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.registry.read().operatorToken}`, ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!options.failure) assert.equal(response.status, 200, JSON.stringify(result))
    return { result, response }
  }
  await api('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { client, api, directory }
}
async function eventually(read, predicate) {
  const end = Date.now() + 10000
  while (Date.now() < end) { const value = await read(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 50)) }
  assert.fail('Expected persisted replicas to converge')
}

test('two real clients create, invite, join, save and share authenticated presence', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Shared board', operationId: 'create' })
  const { result: again } = await alice.api('/projects', { name: 'Shared board', operationId: 'create' })
  assert.equal(again.project.id, project.id)
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  const { result: joined } = await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' })
  assert.equal(joined.project.id, project.id)
  assert.notEqual(joined.project.actorId, project.actorId)
  const path = `/projects/${project.id}/api/automerge/operations`
  const request = { type: 'task.create', operationId: 'bob-task', payload: { title: 'Saved by Bob' } }
  const { result: saved } = await bob.api(path, request)
  assert.equal(saved.savedLocally, true)
  assert.equal(saved.actorId, joined.project.actorId)
  const { result: retried } = await bob.api(path, request)
  assert.equal(retried.replayed, true)
  await eventually(async () => (await alice.api(`/projects/${project.id}/api/automerge/doc`)).result.doc, doc => !!doc.tasks[saved.result.taskId])
  const { result: session } = await bob.api(`/projects/${project.id}/sessions`, { kind: 'browser' })
  await bob.api(`/projects/${project.id}/sessions/${session.sessionId}/report`, { seq: 1, active: true, focusTaskIds: [saved.result.taskId] })
  const { result: presence } = await alice.api(`/projects/${project.id}/presence`)
  assert.equal(presence.actors.find(actor => actor.actorId === joined.project.actorId).state, 'active')
  const { result: spoof, response } = await bob.api(path, { ...request, operationId: 'spoof', actorId: project.actorId }, { failure: true })
  assert.equal(response.status, 403); assert.equal(spoof.code, 'ACTOR_MISMATCH')
})

test('member-issued device and agent invitations preserve Bob and reuse enrolled projects', { timeout: 60000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Members', operationId: 'create' })
  const { result: human } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'human' })
  await bob.api('/join', { invitation: human.invitation, operationId: 'join' })
  const { result: agent } = await bob.api(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'agent' })
  await bob.api('/join', { invitation: agent.invitation, operationId: 'agent-join' })
  assert.equal(Object.keys(bob.client.registry.read().projects).length, 1)
  const { result: device } = await bob.api(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'device' })
  const directory = await mkdtemp(join(tmpdir(), 'pardner-device-'))
  const linked = await startClient({ directory, port: 0, deviceName: 'Bob desktop' })
  t.after(async () => { await linked.stop(); await rm(directory, { recursive: true, force: true }) })
  const response = await fetch(`${linked.url}${CLIENT_API}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${linked.registry.read().operatorToken}` },
    body: JSON.stringify({ invitation: device.invitation, operationId: 'link' }) })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.equal(linked.registry.read().identity.id, bob.client.registry.read().identity.id)
  assert.notEqual(linked.registry.read().identity.id, alice.client.registry.read().identity.id)
  const replay = await bob.api(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'device' })
  assert.equal(replay.result.invitation, device.invitation)
  assert.equal(replay.result.invite.state, 'redeemed')
})

test('bootstrap, author, observer, claim, native, proxy and project boundaries fail closed', { timeout: 45000 }, async t => {
  const { client, api } = await fixture(t, 'Alice')
  const { result: { project: a } } = await api('/projects', { name: 'A', operationId: 'a' })
  const { result: { project: b } } = await api('/projects', { name: 'B', operationId: 'b' })
  const { result: grant } = await api(`/projects/${a.id}/agent-grant`, {})
  for (const [path, body, code] of [
    [`/projects/${b.id}`, undefined, 'PROJECT_MISMATCH'],
    [`/projects/${a.id}/invites`, { purpose: 'human', operationId: 'bad' }, 'FORBIDDEN'],
    [`/projects/${a.id}/sessions`, { kind: 'browser' }, 'ACTOR_MISMATCH'],
    [`/projects/${a.id}/api/automerge/operations`, { type: 'actor.register', operationId: 'bad', payload: {} }, 'FORBIDDEN'],
    [`/projects/${a.id}/api/pardner/pair`, { code: '123' }, 'FORBIDDEN'],
    [`/projects/${a.id}/api/automerge/ws-ticket`, { purpose: 'replica' }, 'REPLICA_REQUIRED'],
    [`/projects/${a.id}/api/automerge/deliveries?actor=${a.actorId}`, undefined, 'ACTOR_MISMATCH'],
    [`/projects/${a.id}/api/automerge/deliveries/claim`, { actorId: a.actorId }, 'ACTOR_MISMATCH'],
  ]) {
    const { result } = await api(path, body, { failure: true, headers: { Authorization: `Bearer ${grant.token}` } })
    assert.equal(result.code, code, path)
  }
  const anonymous = await fetch(`${client.url}${CLIENT_API}/session`)
  assert.equal(anonymous.status, 401)
  const { result: opening } = await api('/open', {})
  const token = new URLSearchParams(new URL(opening.url).hash.slice(1)).get('grant')
  const exchange = origin => fetch(`${client.url}${CLIENT_API}/bootstrap`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ grant: token }) })
  assert.equal((await exchange('http://evil.example')).status, 403)
  const response = await exchange(client.url)
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/)
  assert.equal((await exchange(client.url)).status, 401)
  const csrf = await fetch(`${client.url}${CLIENT_API}/projects`, { method: 'POST', headers: { Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'CSRF', operationId: 'csrf' }) })
  assert.equal(csrf.status, 403)
  const { result: listed } = await api('/session')
  const serialized = JSON.stringify(listed)
  assert.ok(!serialized.includes(client.registry.read().operatorToken))
  assert.ok(!serialized.includes(client.project(a.id).internalToken))
})

test('offline restart preserves projects, identity, credentials and operation retries; one child failure is isolated', { timeout: 60000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Remote', operationId: 'remote' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'human' })
  await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' })
  const { result: { project: local } } = await bob.api('/projects', { name: 'Local', operationId: 'local' })
  const identity = bob.client.registry.read().identity
  await alice.client.stop()
  const request = { type: 'task.create', operationId: 'offline', payload: { title: 'Offline save' } }
  const path = `/projects/${project.id}/api/automerge/operations`
  const { result: saved } = await bob.api(path, request)
  assert.equal(saved.savedLocally, true)
  assert.equal(saved.syncPending, true)
  await bob.client.stop()
  const restarted = await startClient({ directory: bob.directory })
  t.after(() => restarted.stop())
  assert.deepEqual(restarted.registry.read().identity, identity)
  const call = async (suffix, body) => {
    const response = await fetch(`${restarted.url}${CLIENT_API}${suffix}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${restarted.registry.read().operatorToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value
  }
  const replay = await call(path, request)
  assert.equal(replay.replayed, true)
  assert.equal(replay.result.taskId, saved.result.taskId)
  const doc = await call(`/projects/${project.id}/api/automerge/doc`)
  assert.equal(doc.doc.tasks[saved.result.taskId].title, 'Offline save')
  const badRuntime = await restarted.runtime(restarted.project(project.id))
  badRuntime.child.kill('SIGKILL')
  await new Promise(resolve => badRuntime.child.once('exit', resolve))
  const independent = await call(`/projects/${local.id}/api/automerge/operations`, { type: 'task.create', operationId: 'independent', payload: { title: 'Other project works' } })
  assert.equal(independent.savedLocally, true)
})

test('recipient proof, revocation and changed retries cannot recover another admission', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Private', operationId: 'create' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' })
  const attempt = Object.values(bob.client.registry.read().attempts).find(a => a.recipient)
  const enroll = async body => {
    const response = await fetch(`${alice.client.url}${CLIENT_API}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, result: await response.json() }
  }
  const retry = await enroll(attempt.recipient)
  assert.equal(retry.status, 200)
  assert.equal(retry.result.deviceToken, attempt.receipt.deviceToken)
  assert.equal((await enroll({ ...attempt.recipient, recipientProof: 'different'.repeat(8) })).result.code, 'INVITE_USED')
  assert.equal((await enroll({ ...attempt.recipient, device: { ...attempt.recipient.device, name: 'changed' } })).result.code, 'OPERATION_ID_REUSED')
  const { result: changed } = await alice.api('/projects', { name: 'Changed', operationId: 'create' }, { failure: true })
  assert.equal(changed.code, 'OPERATION_ID_REUSED')
  await bob.api(`/projects/${project.id}/revoke`, { kind: 'device', id: bob.client.registry.read().device.id, operationId: 'revoke' })
  const { result } = await bob.api(`/projects/${project.id}/api/automerge/operations`, { type: 'task.create', operationId: 'denied', payload: { title: 'denied' } }, { failure: true })
  assert.equal(result.code, 'REVOKED')
})

test('browser WebSocket tickets bind origin, project and principal; direct child credentials remain private', { timeout: 30000 }, async t => {
  const { WebSocket } = await import('ws')
  const { client, api } = await fixture(t, 'Alice')
  const { result: { project } } = await api('/projects', { name: 'Sockets', operationId: 'create' })
  const { result: agent } = await api(`/projects/${project.id}/agent-grant`, {})
  const runtime = await client.runtime(client.project(project.id))
  const direct = await fetch(`http://127.0.0.1:${runtime.connection.httpPort}/automerge/doc`, { headers: { Authorization: `Bearer ${agent.token}` } })
  assert.equal(direct.status, 401)
  const ticket = async () => (await api(`/projects/${project.id}/api/automerge/ws-ticket`, { purpose: 'ui' })).result.ticket
  const connect = (value, token) => new WebSocket(`${client.url.replace('http:', 'ws:')}${project.wsPath}?ticket=${value}`, { headers: { Authorization: `Bearer ${token}` }, handshakeTimeout: 2000 })
  const refused = connect(await ticket(), agent.token)
  await new Promise(resolve => refused.once('error', resolve))
  const acceptedTicket = await ticket()
  const socket = connect(acceptedTicket, client.registry.read().operatorToken)
  t.after(() => socket.terminate())
  const frame = await new Promise((resolve, reject) => { socket.once('message', bytes => resolve(JSON.parse(bytes.toString()))); socket.once('error', reject) })
  assert.equal(frame.type, 'document-state')
  assert.equal(frame.doc.workspaceId, project.id)
  const replay = connect(acceptedTicket, client.registry.read().operatorToken)
  await new Promise(resolve => replay.once('error', resolve))
})

test('WebSocket proxy forwards a document delivered in the same packet as its upstream upgrade', { timeout: 10000 }, async t => {
  const { WebSocket } = await import('ws')
  const { client, api } = await fixture(t, 'Alice')
  const { result: { project } } = await api('/projects', { name: 'Immediate document', operationId: 'create' })
  const runtime = await client.runtime(client.project(project.id))
  const originalPort = runtime.connection.wsPort
  const peers = new Set()
  const server = createServer()
  server.on('upgrade', (request, socket) => {
    peers.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => peers.delete(socket))
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    const payload = Buffer.from(JSON.stringify({ type: 'document-state', doc: { workspaceId: project.id } }))
    assert.ok(payload.length < 126)
    // One write makes the initial frame available before an awaited open continuation.
    socket.write(Buffer.concat([Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`),
      Buffer.from([0x81, payload.length]), payload]))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  runtime.connection.wsPort = server.address().port
  t.after(async () => {
    runtime.connection.wsPort = originalPort
    for (const peer of peers) peer.destroy()
    await new Promise(resolve => server.close(resolve))
  })
  const { result: { ticket } } = await api(`/projects/${project.id}/api/automerge/ws-ticket`, { purpose: 'ui' })
  const socket = new WebSocket(`${client.url.replace('http:', 'ws:')}${project.wsPath}?ticket=${ticket}`,
    { headers: { Authorization: `Bearer ${client.registry.read().operatorToken}` }, handshakeTimeout: 2000 })
  t.after(() => socket.terminate())
  const frame = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Initial upstream document was lost')), 2000)
    socket.once('message', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())) })
    socket.once('error', error => { clearTimeout(timer); reject(error) })
  })
  assert.equal(frame.type, 'document-state')
  assert.equal(frame.doc.workspaceId, project.id)
})

test('agent-only enrollment has its own author and cannot obtain a human browser session', { timeout: 30000 }, async t => {
  const alice = await fixture(t, 'Alice')
  const { result: { project } } = await alice.api('/projects', { name: 'Agent', operationId: 'create' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'agent' })
  const directory = await mkdtemp(join(tmpdir(), 'pardner-agent-'))
  const agent = await startClient({ directory, port: 0, setupAgent: { harnessId: 'anthropic-claude-code', name: 'Gamma' } })
  t.after(async () => { await agent.stop(); await rm(directory, { recursive: true, force: true }) })
  const api = async (path, body) => {
    const response = await fetch(`${agent.url}${CLIENT_API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${agent.registry.read().operatorToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, result: await response.json() }
  }
  const input = { invitation: invitation.invitation, operationId: 'join' }
  assert.equal((await api('/join', input)).status, 200)
  assert.equal((await api('/join', input)).status, 200)
  assert.equal((await api('/projects', { name: 'Impersonate human', operationId: 'bad' })).status, 403)
  const deniedLaunch = await api('/open', {})
  assert.equal(deniedLaunch.status, 403)
  assert.equal(deniedLaunch.result.code, 'FORBIDDEN')
  assert.equal(deniedLaunch.result.url, undefined)
  const token = agent.auth.browserGrant(agent.url)
  const exchange = await fetch(`${agent.url}${CLIENT_API}/bootstrap`, { method: 'POST', headers: { Origin: agent.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ grant: token }) })
  assert.equal(exchange.status, 403)
  const grant = await api(`/projects/${project.id}/agent-grant`, {})
  assert.equal(grant.status, 200)
  assert.notEqual(grant.result.actorId, project.actorId)
  assert.equal(grant.result.model, undefined)
  assert.equal(grant.result.managedBy, undefined)
})

test('reopening with a new browser principal replays setup instead of allocating projects or recipient proofs', { timeout: 30000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const bootstrap = async client => {
    const grant = client.auth.browserGrant(client.url)
    const response = await fetch(`${client.url}${CLIENT_API}/bootstrap`, { method: 'POST', headers: { Origin: client.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ grant }) })
    assert.equal(response.status, 200)
    return response.headers.get('set-cookie').split(';')[0]
  }
  const request = async (client, cookie, path, body) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: 'POST', headers: { Cookie: cookie, Origin: client.url, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result
  }
  const create = { name: 'Across sessions', operationId: 'browser-create' }
  const firstCookie = await bootstrap(alice.client)
  const first = await request(alice.client, firstCookie, '/projects', create)
  const secondCookie = await bootstrap(alice.client)
  assert.notEqual(firstCookie, secondCookie)
  const second = await request(alice.client, secondCookie, '/projects', create)
  assert.equal(first.project.id, second.project.id)
  const inviteInput = { purpose: 'human', operationId: 'browser-invite' }
  const invited = await request(alice.client, firstCookie, `/projects/${first.project.id}/invites`, inviteInput)
  assert.equal((await request(alice.client, secondCookie, `/projects/${first.project.id}/invites`, inviteInput)).invitation, invited.invitation)
  const join = { invitation: invited.invitation, operationId: 'browser-join' }
  const joined = await request(bob.client, await bootstrap(bob.client), '/join', join)
  const attemptsBefore = bob.client.registry.read().attempts
  const again = await request(bob.client, await bootstrap(bob.client), '/join', join)
  assert.equal(joined.project.id, again.project.id)
  assert.deepEqual(bob.client.registry.read().attempts, attemptsBefore)
  assert.equal(Object.keys(bob.client.registry.read().projects).length, 1)
})

test('concurrent human redemptions cannot admit the same identity through two unrelated grants', { timeout: 30000 }, async t => {
  const { randomUUID, randomBytes } = await import('node:crypto')
  const { invitationData } = await import('../lib/client-invites.js')
  const alice = await fixture(t, 'Alice')
  const { result: { project } } = await alice.api('/projects', { name: 'Concurrent admission', operationId: 'create' })
  const first = (await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'one' })).result
  const second = (await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'two' })).result
  const identity = { id: randomUUID(), name: 'Bob', email: 'bob@example.test' }
  const results = await Promise.all([first, second].map(async ({ invitation }) => {
    const parsed = invitationData(invitation)
    const response = await fetch(parsed.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      inviteId: parsed.id, invitationSecret: parsed.secret, recipientProof: randomBytes(32).toString('base64url'), operationId: randomUUID(),
      identity, device: { id: randomUUID(), name: 'New machine' }, agent: { harnessId: 'openai-codex', name: 'Beta' },
    }) })
    return { status: response.status, result: await response.json() }
  }))
  assert.equal(results.filter(result => result.status === 200).length, 1)
  assert.equal(results.find(result => result.status !== 200).result.code, 'IDENTITY_MISMATCH')
})

test('a second harness reuses Bob’s replica with distinct authorship, remote presence and delivery admission', { timeout: 45000 }, async t => {
  const { actorId } = await import('../lib/client-identity.js')
  const { mkdtemp, writeFile, readFile } = await import('node:fs/promises')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execute = promisify(execFile)
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Two harnesses', operationId: 'create' })
  const { result: human } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'human' })
  await bob.api('/join', { invitation: human.invitation, operationId: 'join' })
  const original = bob.client.registry.read()
  const runtime = await bob.client.runtime(bob.client.project(project.id))
  const { result: codex } = await bob.api(`/projects/${project.id}/agent-grant`, {})
  const { result: invitation } = await bob.api(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'claude-invite' })
  const privateDirectory = await mkdtemp(join(tmpdir(), 'pardner-second-harness-'))
  t.after(() => rm(privateDirectory, { recursive: true, force: true }))
  const invitationFile = join(privateDirectory, 'invite.txt')
  await writeFile(invitationFile, invitation.setupPrompt, { mode: 0o600 })
  const cli = async args => {
    const { stdout } = await execute(process.execPath, ['bin/pardner.js', 'client', ...args, '--data', bob.directory])
    const result = JSON.parse(stdout); assert.equal(result.success, true); return result
  }
  const joinArgs = ['join', '--invitation-file', invitationFile, '--operation-id', 'claude-join', '--harness', 'anthropic-claude-code',
    '--name', 'Gamma', '--model', 'reported-model', '--managed-by', 'T3']
  assert.equal((await cli(joinArgs)).project.id, project.id)
  assert.equal((await cli(joinArgs)).project.id, project.id)
  for (const agent of [
    { harnessId: 'cursor', name: 'Gamma', model: 'reported-model', managedBy: 'T3' },
    { harnessId: 'anthropic-claude-code', name: 'Changed', model: 'reported-model', managedBy: 'T3' },
    { harnessId: 'anthropic-claude-code', name: 'Gamma', model: 'changed-model', managedBy: 'T3' },
    { harnessId: 'anthropic-claude-code', name: 'Gamma', model: 'reported-model', managedBy: 'Changed' },
  ]) {
    const changed = await bob.api('/join', { invitation: invitation.setupPrompt, operationId: 'claude-join', agent }, { failure: true })
    assert.equal(changed.result.code, 'OPERATION_ID_REUSED')
  }
  const grantFile = join(privateDirectory, 'agent.json')
  const selected = await cli(['agent-grant', '--project', project.id, '--harness', 'anthropic-claude-code', '--output-file', grantFile])
  const claude = JSON.parse(await readFile(grantFile, 'utf8'))
  assert.equal(claude.harnessId, 'anthropic-claude-code')
  assert.equal(claude.model, 'reported-model')
  assert.equal(claude.managedBy, 'T3')
  assert.equal((await bob.api(`/projects/${project.id}/agent-grant`, {})).result.model, undefined)
  assert.equal(selected.actorId, actorId(original.identity.id, 'anthropic-claude-code'))
  assert.notEqual(claude.actorId, codex.actorId)
  assert.deepEqual(bob.client.registry.read().setupAgent, original.setupAgent)
  assert.deepEqual(bob.client.registry.read().identity, original.identity)
  assert.equal(Object.keys(bob.client.registry.read().projects).length, 1)
  assert.equal(await bob.client.runtime(bob.client.project(project.id)), runtime)
  assert.equal((await bob.api(`/projects/${project.id}/agent-grant`, {})).result.actorId, codex.actorId)
  assert.equal(bob.client.project(project.id).people[claude.actorId].displayName, 'Gamma')
  const saved = await cli(['operation', '--project', project.id, '--harness', 'anthropic-claude-code', '--request',
    JSON.stringify({ type: 'task.create', operationId: 'claude-task', payload: { title: 'Claude wrote this' } })])
  assert.equal(saved.actorId, claude.actorId); assert.equal(saved.savedLocally, true)
  await eventually(async () => (await alice.api(`/projects/${project.id}/api/automerge/doc`)).result.doc, doc => !!doc.tasks[saved.result.taskId])
  const asClaude = { headers: { Authorization: `Bearer ${claude.token}` } }
  const { result: session } = await bob.api(`/projects/${project.id}/sessions`, { kind: 'agent', model: 'reported-model', managedBy: 'T3' }, asClaude)
  await bob.api(`/projects/${project.id}/sessions/${session.sessionId}/report`, { seq: 1, active: true, focusTaskIds: [saved.result.taskId] }, asClaude)
  const presence = (await alice.api(`/projects/${project.id}/presence`)).result.actors.find(actor => actor.actorId === claude.actorId)
  assert.equal(presence.state, 'active')
  assert.equal(presence.sessions[0].harnessId, 'anthropic-claude-code')
  assert.equal(presence.sessions[0].model, 'reported-model')
  const comment = await alice.api(`/projects/${project.id}/api/automerge/operations`, { type: 'comment.add', operationId: 'mention-claude',
    payload: { taskId: saved.result.taskId, text: `@${bob.client.project(project.id).people[claude.actorId].handle} please review` } })
  assert.equal(comment.result.result.mentionIds.length, 1)
  const pending = await bob.api(`/projects/${project.id}/api/automerge/deliveries`, undefined, asClaude)
  assert.equal(pending.result.mentions.length, 1)
  const claim = await bob.api(`/projects/${project.id}/api/automerge/deliveries/claim`, { requestId: 'claude-claim' }, asClaude)
  assert.equal(claim.result.claimed, true)
  assert.equal(claim.result.mention.toActorId, claude.actorId)
  await bob.api(`/projects/${project.id}/api/automerge/deliveries/release`, { mentionId: claim.result.mention.id, claimToken: claim.result.claimToken }, asClaude)
  for (const input of [{ harnessId: 'cursor' }, { harnessId: 'anthropic-claude-code', humanId: alice.client.registry.read().identity.id },
    { harnessId: 'anthropic-claude-code', actorId: actorId(alice.client.registry.read().identity.id, 'anthropic-claude-code') }]) {
    const denied = await bob.api(`/projects/${project.id}/agent-grant`, input, { failure: true })
    assert.equal(denied.response.status, 403)
  }
  const injected = await bob.api(`/projects/${project.id}/api/automerge/operations`, { type: 'task.create', operationId: 'spoof-human',
    actorId: project.actorId, payload: { title: 'Denied' } }, { ...asClaude, failure: true })
  assert.equal(injected.result.code, 'ACTOR_MISMATCH')
  await bob.api(`/projects/${project.id}/revoke`, { kind: 'agent', id: claude.actorId, operationId: 'revoke-claude' })
  const revoked = await bob.api(`/projects/${project.id}/agent-grant`, { harnessId: 'anthropic-claude-code' }, { failure: true })
  assert.equal(revoked.result.code, 'ACTOR_REVOKED')
  const stillHuman = await bob.api(`/projects/${project.id}/api/automerge/operations`, { type: 'task.create', operationId: 'human-still-active', payload: { title: 'Bob still works' } })
  assert.equal(stillHuman.result.savedLocally, true)
})

test('the hub client also enrolls a second harness without changing its setup agent or runtime', { timeout: 30000 }, async t => {
  const alice = await fixture(t, 'Alice')
  const initial = alice.client.registry.read()
  const { result: { project } } = await alice.api('/projects', { name: 'Local harnesses', operationId: 'create' })
  const runtime = await alice.client.runtime(alice.client.project(project.id))
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'invite' })
  await alice.api('/join', { invitation: invitation.invitation, operationId: 'join-claude', agent: { harnessId: 'anthropic-claude-code', name: 'Gamma' } })
  const { result: selected } = await alice.api(`/projects/${project.id}/agent-grant`, { harnessId: 'anthropic-claude-code' })
  const { result: original } = await alice.api(`/projects/${project.id}/agent-grant`, {})
  assert.notEqual(selected.actorId, original.actorId)
  const { result: saved } = await alice.api(`/projects/${project.id}/api/automerge/operations`, { type: 'task.create', operationId: 'claude-task', payload: { title: 'By Claude' } },
    { headers: { Authorization: `Bearer ${selected.token}` } })
  assert.equal(saved.actorId, selected.actorId)
  assert.equal(saved.savedLocally, true)
  assert.equal(await alice.client.runtime(alice.client.project(project.id)), runtime)
  assert.equal(Object.keys(alice.client.registry.read().projects).length, 1)
  assert.deepEqual(alice.client.registry.read().setupAgent, initial.setupAgent)
  assert.deepEqual(alice.client.registry.read().identity, initial.identity)
})

test('a rejected enrollment leaves the invitation usable by its intended recipient', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Devices', operationId: 'create' })
  const { result: device } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'device' })
  const { result: wrong, response } = await bob.api('/join', { invitation: device.invitation, operationId: 'wrong-person' }, { failure: true })
  assert.equal(response.status, 409); assert.equal(wrong.code, 'IDENTITY_MISMATCH')
  assert.equal(alice.client.registry.read().invites[device.invite.id].recipient, undefined, 'a rejected attempt must not bind the invitation')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-device-'))
  const linked = await startClient({ directory, port: 0, deviceName: 'Alice desktop' })
  t.after(async () => { await linked.stop(); await rm(directory, { recursive: true, force: true }) })
  const link = await fetch(`${linked.url}${CLIENT_API}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${linked.registry.read().operatorToken}` },
    body: JSON.stringify({ invitation: device.invitation, operationId: 'link' }) })
  const result = await link.json()
  assert.equal(link.status, 200, JSON.stringify(result))
  assert.equal(linked.registry.read().identity.id, alice.client.registry.read().identity.id)
  assert.equal(alice.client.registry.read().invites[device.invite.id].state, 'redeemed')
})

test('a revocation that lands during enrollment wins over activation', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Race', operationId: 'create' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  const register = alice.client.registerActor.bind(alice.client)
  alice.client.registerActor = async (...args) => {
    alice.client.invites.revokeFor(alice.client.project(project.id), alice.client.registry.read().identity.id, invitation.invite.id)
    return register(...args)
  }
  const { result, response } = await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' }, { failure: true })
  assert.equal(response.status, 403, JSON.stringify(result)); assert.equal(result.code, 'REVOKED')
  const hub = alice.client.project(project.id)
  assert.ok(Object.values(hub.admissions).every(admission => admission.state !== 'active'), 'no admission may activate after revocation')
  assert.equal(alice.client.registry.read().invites[invitation.invite.id].state, 'revoked')
  assert.equal(Object.values(bob.client.registry.read().projects).filter(p => p.state === 'ready').length, 0)
})

test('an unauthenticated WebSocket upgrade cannot restart a dead project runtime', { timeout: 30000 }, async t => {
  const { WebSocket } = await import('ws')
  const { client, api } = await fixture(t, 'Alice')
  const { result: { project } } = await api('/projects', { name: 'Dormant', operationId: 'create' })
  const runtime = await client.runtime(client.project(project.id))
  runtime.child.kill('SIGKILL')
  await new Promise(resolve => runtime.child.once('exit', resolve))
  const socket = new WebSocket(`${client.url.replace(/^http/, 'ws')}${CLIENT_API}/projects/${project.id}/ws?ticket=forged`, { headers: { Origin: client.url } })
  const outcome = await new Promise(resolve => { socket.once('error', error => resolve(error.message)); socket.once('open', () => resolve('open')) })
  assert.match(outcome, /401/)
  assert.equal(client.runtimes.get(client.project(project.id).key), runtime, 'the dead runtime must not be replaced by an anonymous socket')
  assert.equal(client.starting.size, 0)
})

test('gateway error pages and hub 5xx responses are outages: replicas keep saving locally and only explicit revocation revokes', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const { result: { project } } = await alice.api('/projects', { name: 'Degraded', operationId: 'create' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' })
  let reply = { status: 502, type: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1></body></html>' }
  const gateway = createServer((_req, res) => { res.writeHead(reply.status, { 'Content-Type': reply.type }); res.end(reply.body) })
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => gateway.close(resolve)))
  const key = Object.values(bob.client.registry.read().projects).find(p => p.id === project.id).key
  bob.client.registry.update(state => { state.projects[key].hubUrl = `http://127.0.0.1:${gateway.address().port}` })
  const path = `/projects/${project.id}/api/automerge/operations`
  const { result: html } = await bob.api(path, { type: 'task.create', operationId: 'through-502', payload: { title: 'Saved behind a 502 page' } })
  assert.equal(html.savedLocally, true)
  const { result: view } = await bob.api(`/projects/${project.id}`)
  assert.equal(view.project.id, project.id)
  assert.equal(view.presence.available, false, 'remote presence is reported unavailable, not failed')
  const { result: doc } = await bob.api(`/projects/${project.id}/api/automerge/doc`)
  assert.equal(doc.doc.tasks[html.result.taskId].title, 'Saved behind a 502 page')
  reply = { status: 503, type: 'application/json', body: JSON.stringify({ code: 'SERVICE_STOPPING', error: 'The service is stopping' }) }
  const { result: stopping } = await bob.api(path, { type: 'task.create', operationId: 'through-503', payload: { title: 'Saved while the hub restarts' } })
  assert.equal(stopping.savedLocally, true)
  reply = { status: 401, type: 'application/json', body: JSON.stringify({ code: 'AUTH_REQUIRED', error: 'Device is not admitted to this project' }) }
  const { result: revoked, response } = await bob.api(path, { type: 'task.create', operationId: 'denied', payload: { title: 'denied' } }, { failure: true })
  assert.equal(response.status, 403); assert.equal(revoked.code, 'REVOKED')
})

test('identity, harness and revocation refusals name the actual problem', { timeout: 45000 }, async t => {
  const alice = await fixture(t, 'Alice'), bob = await fixture(t, 'Bob')
  const refusal = async (api, path, body, status, code, error) => {
    const { result, response } = await api(path, body, { failure: true })
    assert.equal(response.status, status, JSON.stringify(result)); assert.equal(result.code, code); assert.equal(result.error, error)
    return result
  }
  await refusal(alice.api, '/identity', { name: '   ', email: 'alice@example.test', operationId: 'blank' }, 400, 'INVALID_ARGUMENT', 'Supply a name')
  await refusal(alice.api, '/identity', { name: 'A'.repeat(201), email: 'alice@example.test', operationId: 'long' }, 400, 'INVALID_ARGUMENT',
    'Use a name of at most 200 characters')
  const exists = await refusal(alice.api, '/identity', { name: 'Alice', email: 'alice@elsewhere.test', operationId: 'fix-email' }, 409, 'IDENTITY_EXISTS',
    "This client already has an identity (Alice <alice@example.test>); it can't be changed. To use a different identity, start a separate client directory.")
  assert.deepEqual(exists.details, { identity: { name: 'Alice', email: 'alice@example.test' } })
  const harness = 'Unsupported execution harness; use openai-codex, anthropic-claude-code or cursor'
  assert.throws(() => setupAgent({ harnessId: 'claude' }), { code: 'INVALID_ARGUMENT', message: harness })
  const { result: { project } } = await alice.api('/projects', { name: 'Refusals', operationId: 'create' })
  await refusal(alice.api, `/projects/${project.id}/agent-grant`, { harnessId: 'claude' }, 400, 'INVALID_ARGUMENT', harness)
  const aliceId = alice.client.registry.read().identity.id
  await refusal(alice.api, `/projects/${project.id}/revoke`, { kind: 'member', id: aliceId, operationId: 'self' }, 403, 'FORBIDDEN',
    "The project creator's own membership can't be revoked")
  await refusal(alice.api, `/projects/${project.id}/revoke`, { kind: 'agent', id: 'actor-doesnotexist', operationId: 'missing-agent' }, 404, 'NOT_FOUND',
    'No agent with that ID in this project')
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  await bob.api('/join', { invitation: invitation.invitation, operationId: 'join' })
  await refusal(bob.api, `/projects/${project.id}/revoke`, { kind: 'member', id: aliceId, operationId: 'not-creator' }, 403, 'FORBIDDEN',
    'Only the project creator can remove other members')
  const aliceAgent = Object.values(alice.client.project(project.id).people).find(person => person.kind === 'agent' && person.humanId === aliceId)
  await refusal(bob.api, `/projects/${project.id}/revoke`, { kind: 'agent', id: aliceAgent.id, operationId: 'foreign-agent' }, 403, 'FORBIDDEN',
    'Agent belongs to another human')
})

test('enrollment normalises agent and device metadata at the boundary and leaves a refused invitation usable', { timeout: 30000 }, async t => {
  const alice = await fixture(t, 'Alice')
  const { result: { project } } = await alice.api('/projects', { name: 'Boundary', operationId: 'create' })
  const { result: invitation } = await alice.api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
  const envelope = JSON.parse(Buffer.from(invitation.invitation.slice('pardner-invite-v1.'.length), 'base64url').toString())
  const enroll = async body => {
    const response = await fetch(`${alice.client.url}${CLIENT_API}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, result: await response.json() }
  }
  const base = { inviteId: envelope.id, invitationSecret: envelope.secret, recipientProof: 'p'.repeat(48), operationId: 'enroll',
    identity: { id: '11111111-2222-4333-8444-555555555555', name: 'Carol', email: 'carol@example.test' }, device: { id: '66666666-7777-4888-9999-aaaaaaaaaaaa', name: 'Carol laptop' } }
  for (const [index, agent] of [{ harnessId: 'openai-codex', name: {} }, { harnessId: 'openai-codex', model: ['x'] }, { harnessId: 'openai-codex', name: 'x'.repeat(201) }].entries()) {
    const refused = await enroll({ ...base, operationId: `refused-${index}`, agent })
    assert.equal(refused.status, 400, JSON.stringify(refused.result)); assert.equal(refused.result.code, 'INVALID_ARGUMENT')
  }
  assert.equal(alice.client.registry.read().invites[invitation.invite.id].recipient, undefined, 'refused metadata never binds the invitation')
  const accepted = await enroll({ ...base, agent: { harnessId: 'openai-codex', name: ' Carol’s agent ', model: 'gpt-x' }, device: { ...base.device, extra: 'dropped', name: ' Carol laptop ' } })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.result))
  assert.deepEqual(accepted.result.device, { id: base.device.id, name: 'Carol laptop' })
  assert.equal(accepted.result.agent.name, 'Carol’s agent')
  const people = alice.client.project(project.id).people
  assert.ok(Object.values(people).every(person => person.devices.every(device => Object.keys(device).sort().join() === 'id,name')))
})

test('a handshake that ws aborts does not leak the upstream runtime socket', { timeout: 30000 }, async t => {
  const { request } = await import('node:http')
  const { client, api } = await fixture(t, 'Alice')
  const { result: { project } } = await api('/projects', { name: 'Handshake', operationId: 'create' })
  const { result: { ticket } } = await api(`/projects/${project.id}/api/automerge/ws-ticket`, { purpose: 'ui' })
  const url = new URL(`${client.url}${project.wsPath}?ticket=${ticket}`)
  // A valid, authenticated upgrade request with an invalid Sec-WebSocket-Key: ws answers 400 and destroys the socket without calling back.
  const status = await new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path: url.pathname + url.search, headers: {
      Authorization: `Bearer ${client.registry.read().operatorToken}`, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'not-base64!' } })
    req.on('response', response => { response.resume(); resolve(response.statusCode) })
    req.on('upgrade', () => reject(new Error('the invalid handshake was accepted')))
    req.on('error', reject)
    req.end()
  })
  assert.equal(status, 400)
  await eventually(async () => client.sockets.size, size => size === 0)
})

test('a runtime that fails to start is not re-forked on every request until the backoff passes', { timeout: 30000 }, async t => {
  const { ClientRuntime } = await import('../lib/client-runtime.js')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-'))
  const client = await startClient({ directory, port: 0, deviceName: 'Alice laptop', restartBackoffMs: 500 })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const api = async (path, body) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.registry.read().operatorToken}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, result: await response.json() }
  }
  await api('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
  const { result: { project } } = await api('/projects', { name: 'Fragile', operationId: 'create' })
  const runtime = await client.runtime(client.project(project.id))
  runtime.child.kill('SIGKILL')
  await new Promise(resolve => runtime.child.once('exit', resolve))
  const start = ClientRuntime.start
  let starts = 0
  ClientRuntime.start = async () => { starts++; throw Object.assign(new Error('simulated start failure'), { code: 'WORKSPACE_MISMATCH' }) }
  t.after(() => { ClientRuntime.start = start })
  const first = await api(`/projects/${project.id}/api/automerge/doc`)
  assert.equal(first.status, 409); assert.equal(first.result.code, 'WORKSPACE_MISMATCH')
  const second = await api(`/projects/${project.id}/api/automerge/doc`)
  assert.equal(second.status, 503, JSON.stringify(second.result)); assert.equal(second.result.code, 'LOCAL_SERVICE_UNAVAILABLE')
  assert.equal(starts, 1, 'the second request must not fork again inside the backoff window')
  ClientRuntime.start = start
  await new Promise(resolve => setTimeout(resolve, 600))
  const recovered = await api(`/projects/${project.id}/api/automerge/doc`)
  assert.equal(recovered.status, 200, JSON.stringify(recovered.result))
})
