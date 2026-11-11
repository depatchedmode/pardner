import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import {
  aheadOf, answerHello, checkpointValid, createHello, initiateHandshake, newRun, readConfirm, readHello, readReply, respondHandshake,
  sessionId, signCheckpoint, signRequest,
} from '../lib/machine-handshake.js'
import { SEQUENCE_WINDOW, SessionClient, SessionServer } from '../lib/machine-session.js'
import { computeMembership } from '../lib/membership.js'
import { testProject } from '../support/machines.js'

const ROUTE = 'https://hub.example/pardner/client/v1/replica/p/native'

function exchange(initiator, responder, { projectId, route = ROUTE, acceptRoute = value => value === ROUTE } = {}) {
  const hello = createHello(initiator, { projectId, route, role: 'replica' })
  const accepted = readHello(hello, { projectId, acceptRoute })
  const { transcript, reply } = answerHello(responder, accepted, 'hub')
  const read = readReply(initiator, hello, reply, { expectRole: 'hub' })
  readConfirm(transcript, read.confirm)
  return { hello, reply, transcript, confirm: read.confirm }
}

test('both machines sign one transcript that names the project, both machines, both nonces, both roles and the route', () => {
  const project = testProject()
  const { transcript } = exchange(project.keys[0], project.owner, project)
  assert.deepEqual(Object.keys(transcript).sort(), ['initiator', 'projectId', 'responder', 'route', 'v'])
  assert.equal(transcript.projectId, project.projectId)
  assert.equal(transcript.route, ROUTE)
  assert.equal(transcript.initiator.machineId, project.keys[0].machineId)
  assert.equal(transcript.responder.machineId, project.owner.machineId)
  assert.deepEqual([transcript.initiator.role, transcript.responder.role], ['replica', 'hub'])
  assert.notEqual(transcript.initiator.nonce, transcript.responder.nonce)
})

test('a recorded handshake is useless against another hub, another project or a new connection', () => {
  const project = testProject(), other = testProject()
  const recorded = exchange(project.keys[0], project.owner, project)
  // Another project: the hello names the project it was made for.
  assert.throws(() => readHello(recorded.hello, { projectId: other.projectId, acceptRoute: () => true }), { code: 'WRONG_PROJECT' })
  // Another hub: a route this hub never served is refused.
  assert.throws(() => readHello(recorded.hello, { projectId: project.projectId, acceptRoute: value => value === 'https://other.example/x' }), { code: 'ROUTE_REJECTED' })
  // A new connection: the responder's fresh nonce changes the transcript, so the recorded confirmation fails.
  const fresh = answerHello(project.owner, readHello(recorded.hello, { projectId: project.projectId, acceptRoute: () => true }), 'hub')
  assert.throws(() => readConfirm(fresh.transcript, recorded.confirm), { code: 'HANDSHAKE_INVALID' })
  // A recorded reply does not answer a new hello from the same machine.
  const hello = createHello(project.keys[0], { projectId: project.projectId, route: ROUTE, role: 'replica' })
  assert.throws(() => readReply(project.keys[0], hello, recorded.reply), { code: 'HANDSHAKE_INVALID' })
  // Another hub's key cannot sign the recorded transcript as this responder.
  const forged = { ...recorded.reply, responder: { ...recorded.reply.responder, machineId: other.owner.machineId, publicKey: other.owner.publicKey } }
  assert.throws(() => readReply(project.keys[0], recorded.hello, forged), { code: 'HANDSHAKE_INVALID' })
})

test('a relay that rewrites the dialled route breaks the responder’s signature', () => {
  const project = testProject()
  const hello = createHello(project.keys[0], { projectId: project.projectId, route: 'https://relay.example/native', role: 'replica' })
  const rewritten = { ...hello, route: ROUTE }
  const { reply } = answerHello(project.owner, readHello(rewritten, { projectId: project.projectId, acceptRoute: value => value === ROUTE }), 'hub')
  assert.throws(() => readReply(project.keys[0], hello, reply), { code: 'HANDSHAKE_INVALID' })
})

async function socketPair() {
  const server = createServer()
  const wss = new WebSocketServer({ server })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const accepted = once(wss, 'connection')
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  await once(client, 'open')
  const [socket] = await accepted
  return { client, socket, close: async () => { client.terminate(); socket.terminate(); wss.close(); await new Promise(resolve => server.close(resolve)) } }
}

test('the exchange over a socket admits a member and offers records only after both signatures verify', async () => {
  const project = testProject()
  const pair = await socketPair()
  try {
    let admitted = null
    const responding = respondHandshake(pair.socket, { key: project.owner, projectId: project.projectId, role: 'hub', acceptRoute: () => true,
      admit: async ({ hello }) => { admitted = hello.initiator.machineId; return { records: project.all } } })
    const result = await initiateHandshake(pair.client, { key: project.keys[0], projectId: project.projectId, route: ROUTE, role: 'replica', expectRole: 'hub' })
    assert.equal((await responding).initiator.machineId, project.keys[0].machineId)
    assert.equal(admitted, project.keys[0].machineId)
    assert.equal(result.responder.machineId, project.owner.machineId)
    assert.equal(result.records.length, project.all.length)
  } finally { await pair.close() }
})

test('the joiner refuses a responder that is not a member machine of the expected project', async () => {
  const project = testProject(), impostor = testProject()
  for (const [key, records] of [[impostor.owner, impostor.all], [project.stranger, project.all]]) {
    const pair = await socketPair()
    try {
      const responding = respondHandshake(pair.socket, { key, projectId: project.projectId, role: 'hub', acceptRoute: () => true, admit: async () => ({ records }) })
      await assert.rejects(initiateHandshake(pair.client, { key: project.keys[0], projectId: project.projectId, route: ROUTE, role: 'replica', expectRole: 'hub' }),
        { code: 'RESPONDER_NOT_MEMBER' })
      await responding
    } finally { await pair.close() }
  }
})

test('the joiner keeps a removal it already holds even when the responder omits it', async () => {
  const project = testProject()
  const removal = project.remove(project.keys[0], project.owner)
  const pair = await socketPair()
  try {
    // The responder is the member machine keys[0], whose removal it leaves out; the joiner already holds the removal.
    const responding = respondHandshake(pair.socket, { key: project.keys[0], projectId: project.projectId, role: 'hub', acceptRoute: () => true,
      admit: async () => ({ records: project.all }) }).catch(error => error)
    const initiator = project.admit(project.stranger, 9)
    await assert.rejects(initiateHandshake(pair.client, { key: project.stranger, projectId: project.projectId, route: ROUTE, role: 'replica',
      knownRecords: () => [...project.all, initiator, removal] }), { code: 'RESPONDER_NOT_MEMBER' })
    await responding
  } finally { await pair.close() }
})

test('a refusal reaches the initiator with its code and nothing else is sent', async () => {
  const project = testProject()
  const pair = await socketPair()
  try {
    const frames = []
    pair.client.on('message', data => frames.push(JSON.parse(data.toString())))
    const responding = respondHandshake(pair.socket, { key: project.owner, projectId: project.projectId, role: 'hub', acceptRoute: () => true,
      screen: () => { throw Object.assign(new Error('Not a member'), { code: 'REVOKED' }) }, admit: async () => ({ records: project.all }) }).catch(error => error)
    await assert.rejects(initiateHandshake(pair.client, { key: project.stranger, projectId: project.projectId, route: ROUTE, role: 'replica' }), { code: 'REVOKED' })
    assert.equal((await responding).code, 'REVOKED')
    assert.deepEqual(frames.map(frame => frame.type), ['refused'])
  } finally { await pair.close() }
})

function sessions(project, { now = () => 0 } = {}) {
  const live = new Map(project.all.filter(record => record.kind === 'member.add').map(record => [record.machineId, record.publicKey]))
  live.set(project.owner.machineId, project.owner.publicKey)
  const route = 'https://hub.example/pardner/client/v1/replica/p'
  const removed = new Set()
  const server = new SessionServer({ key: project.owner, projectId: project.projectId, acceptRoute: value => value === route,
    member: id => live.get(id) ?? null, welcome: () => ({ records: project.all }), now,
    refusal: id => Object.assign(new Error(removed.has(id) ? 'Removed' : 'Not a member'), { code: removed.has(id) ? 'REVOKED' : 'NOT_MEMBER' }) })
  const requests = []
  const send = async (url, { method, headers = {}, body }) => {
    const suffix = url.slice(route.length)
    if (suffix === '/session') return server.open(body.hello)
    if (suffix === '/session/confirm') return { welcome: await server.confirm(body.session, body.confirm) }
    const request = { session: headers['x-pardner-session'], seq: headers['x-pardner-seq'], signature: headers['x-pardner-signature'], method, suffix, body: method === 'GET' ? null : body }
    requests.push(request)
    return { caller: server.verify(request).machineId }
  }
  const client = new SessionClient({ key: project.keys[0], projectId: project.projectId, route, send })
  return { server, client, requests, live, route, remove: id => { live.delete(id); removed.add(id) } }
}

test('a signed request authenticates the calling machine, and a captured request cannot be replayed', async () => {
  const project = testProject()
  const { server, client, requests } = sessions(project)
  assert.equal((await client.request('/people')).caller, project.keys[0].machineId)
  assert.equal((await client.request('/records', { method: 'POST', body: { records: [] } })).caller, project.keys[0].machineId)
  const [captured, post] = requests
  assert.throws(() => server.verify(captured), { code: 'REQUEST_REPLAYED' })
  // The signature covers the route, method and body: changing any of them fails.
  assert.throws(() => server.verify({ ...post, seq: '99', suffix: '/invites' }), { code: 'AUTH_REQUIRED' })
  assert.throws(() => server.verify({ ...post, seq: '99', body: { records: [1] } }), { code: 'AUTH_REQUIRED' })
  assert.throws(() => server.verify({ ...post, seq: '99', method: 'PUT' }), { code: 'AUTH_REQUIRED' })
  // Another session of the same machine does not accept it either.
  client.reset()
  await client.request('/people')
  assert.notEqual(requests.at(-1).session, captured.session)
  assert.throws(() => server.verify({ ...captured, session: requests.at(-1).session }), { code: 'AUTH_REQUIRED' })
})

test('requests may arrive out of order within the window, never twice and never far behind', async () => {
  const project = testProject()
  const { server, client, requests, route } = sessions(project)
  await client.request('/people')
  const { session } = requests[0]
  const signed = seq => ({ ...requests[0], seq: String(seq),
    signature: signRequest(project.keys[0], { projectId: project.projectId, session, seq, method: 'GET', url: `${route}/people`, body: null }) })
  for (const seq of [4, 2, 3]) assert.equal(server.verify(signed(seq)).machineId, project.keys[0].machineId)
  server.verify(signed(SEQUENCE_WINDOW + 10))
  assert.throws(() => server.verify(signed(5)), { code: 'REQUEST_REPLAYED' })
  assert.throws(() => server.verify(signed(SEQUENCE_WINDOW + 10)), { code: 'REQUEST_REPLAYED' })
})

test('a non-member opens no session, and a removal ends a live session at once', async () => {
  const project = testProject({ members: 2 })
  const { server, client, remove } = sessions(project)
  const stranger = new SessionClient({ key: project.stranger, projectId: project.projectId, route: client.route, send: client.send })
  await assert.rejects(stranger.request('/people'), { code: 'NOT_MEMBER' })
  await client.request('/people')
  remove(project.keys[0].machineId)
  server.revokeNonMembers()
  assert.equal(server.active.size, 0)
  await assert.rejects(client.request('/people'), { code: 'REVOKED' })
})

test('a session expires by the responder’s own clock and is reopened once', async () => {
  const project = testProject()
  let clock = 0
  const { client, requests } = sessions(project, { now: () => clock })
  await client.request('/people')
  clock += 11 * 60000
  await client.request('/people')
  assert.notEqual(requests[0].session, requests.at(-1).session)
})

test('a session name is the transcript digest', () => {
  const project = testProject()
  const { transcript } = exchange(project.keys[0], project.owner, project)
  assert.match(sessionId(transcript), /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(sessionId(transcript), sessionId(exchange(project.keys[0], project.owner, project).transcript))
})

test('a hub checkpoint is signed, bound to its project and hub, and shows when a hub fell behind', () => {
  const project = testProject()
  const run = newRun()
  const checkpoint = signCheckpoint(project.owner, { projectId: project.projectId, run, starts: 3, records: 4 })
  const context = { projectId: project.projectId, hub: project.owner.machineId, publicKey: project.owner.publicKey }
  assert.equal(checkpointValid(checkpoint, context), true)
  assert.equal(checkpointValid({ ...checkpoint, records: 5 }, context), false)
  assert.equal(checkpointValid(checkpoint, { ...context, projectId: testProject().projectId }), false)
  assert.equal(checkpointValid(signCheckpoint(project.keys[0], { projectId: project.projectId, run, starts: 3, records: 4 }), context), false)
  const current = { run, starts: 3, records: 4 }
  assert.equal(aheadOf(checkpoint, current), false)
  assert.equal(aheadOf(checkpoint, { ...current, records: 9 }), false)
  assert.equal(aheadOf(checkpoint, { ...current, starts: 4, run: newRun() }), false)
  assert.equal(aheadOf(checkpoint, { ...current, run: newRun() }), true, 'the same start number in another run was lost to a restore')
  assert.equal(aheadOf(checkpoint, { ...current, starts: 2 }), true)
  assert.equal(aheadOf(checkpoint, { ...current, records: 3 }), true)
  assert.equal(computeMembership(project.all, { projectId: project.projectId }).machines.length, 2)
})
