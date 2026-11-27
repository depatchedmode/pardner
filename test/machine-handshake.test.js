import { createPrivateKey } from 'node:crypto'
import { channel, channelSecrets, deriveChannel, ephemeralKey, FRAME } from '../lib/machine-channel.js'

import { machineAnswer } from '../lib/machine-response.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import {
  aheadOf, answerHello, checkpointValid, createHello, HandshakeError, initiateHandshake, newRun, readConfirm, readHello, readReply, refusalFrame, respondHandshake,
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
  assert.deepEqual(Object.keys(transcript).sort(), ['checkpoint', 'initiator', 'projectId', 'responder', 'route', 'transport', 'v'])
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

test('a restore request gets records only from a replica that recognizes the hub', async () => {
  const project = testProject()
  for (const [key, known, expectedResponder, offered] of [
    [project.owner, [project.genesis], null, project.all],
    [project.owner, [], project.owner.machineId, []],
    [project.stranger, [project.genesis], null, project.all],
  ]) {
    const pair = await socketPair()
    try {
      const responding = respondHandshake(pair.socket, { key, projectId: project.projectId, role: 'hub', acceptRoute: () => true,
        admit: async ({ requestMembership }) => {
          assert.deepEqual(await requestMembership(), offered)
          return { records: project.all }
        } })
      const initiating = initiateHandshake(pair.client, { key: project.keys[0], projectId: project.projectId, route: ROUTE, role: 'replica',
        knownRecords: () => known, expectedResponder, ownRecords: () => {
          assert.notEqual(key, project.stranger, 'do not offer records to an unknown responder')
          return offered
        } })
      if (key === project.stranger) {
        const closed = assert.rejects(responding, { code: 'HANDSHAKE_CLOSED' })
        await assert.rejects(initiating, { code: 'RESPONDER_NOT_MEMBER' })
        pair.client.terminate()
        await closed
      } else {
        const [welcome] = await Promise.all([initiating, responding])
        assert.equal(welcome.responder.machineId, project.owner.machineId)
      }
    } finally { await pair.close() }
  }
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

test('a refusal reaches the initiator with its code once it has proved its key, and nothing else is sent', async () => {
  const project = testProject()
  const pair = await socketPair()
  try {
    const frames = []
    pair.client.on('message', (data, binary) => frames.push(binary ? 'protected' : JSON.parse(data.toString()).type))
    let judged = null
    const responding = respondHandshake(pair.socket, { key: project.owner, projectId: project.projectId, role: 'hub', acceptRoute: () => true,
      admit: async ({ hello }) => { judged = hello.initiator.machineId; throw new HandshakeError('NOT_MEMBER', 'Not a member') } }).catch(error => error)
    await assert.rejects(initiateHandshake(pair.client, { key: project.stranger, projectId: project.projectId, route: ROUTE, role: 'replica' }), { code: 'NOT_MEMBER' })
    assert.equal((await responding).code, 'NOT_MEMBER')
    assert.equal(judged, project.stranger.machineId, 'the responder judges the initiator only after both signatures verified')
    assert.deepEqual(frames, ['hello-reply', 'protected'])
  } finally { await pair.close() }
})

test('native refusal frames expose protocol errors and omit internal errors', () => {
  const failure = Object.assign(new Error('Storage failed'), { code: 'SQLITE_BUSY' })
  assert.deepEqual(refusalFrame(failure), { type: 'refused', code: 'HANDSHAKE_REFUSED' })
  assert.deepEqual(refusalFrame(new HandshakeError('HUB_WAITING', 'Restoring')), { type: 'refused', code: 'HUB_WAITING' })
})

function sessions(project, { now = () => 0, handshakeStatus = () => 200 } = {}) {
  const live = new Map(project.keys.map(key => [key.machineId, key.publicKey]))
  live.set(project.owner.machineId, project.owner.publicKey)
  const route = 'https://hub.example/pardner/client/v1/replica/p'
  const removed = new Set()
  const server = new SessionServer({ key: project.owner, projectId: project.projectId, acceptRoute: value => value === route,
    member: id => live.get(id) ?? null, welcome: () => ({ records: project.all }), now,
    refusal: id => removed.has(id)
      ? Object.assign(new Error('Removed'), { code: 'REVOKED', details: { records: [...project.all, project.remove(project.keys.find(key => key.machineId === id))] } })
      : Object.assign(new Error('Not a member'), { code: 'NOT_MEMBER' }) })
  const requests = []
  const send = async (url, { method, headers = {}, body }) => {
    const suffix = url.slice(route.length)
    const binding = { projectId: project.projectId, suffix, method, headers, body }
    const answer = (status, value) => machineAnswer(project.owner, binding, status, value)
    try {
      if (suffix === '/session') return answer(handshakeStatus(suffix), server.open(body.hello))
      if (suffix === '/session/confirm') return answer(handshakeStatus(suffix), { welcome: await server.confirm(body.session, body.confirm) })
      const request = { session: headers['x-pardner-session'], seq: headers['x-pardner-seq'], signature: headers['x-pardner-signature'], method, suffix, body: method === 'GET' ? null : body }
      requests.push(request)
      return answer(200, { caller: server.verify(request).machineId })
    } catch (error) {
      return answer(403, { code: error.code, error: error.message, details: error.details })
    }
  }
  const client = new SessionClient({ key: project.keys[0], projectId: project.projectId, route, send, onRemoval: () => ({ removal: null }) })
  return { server, client, requests, live, route, remove: id => { live.delete(id); removed.add(id) } }
}

test('both signed HTTP handshake steps require status 200 and recover on the next request', async () => {
  const project = testProject()
  for (const step of ['/session', '/session/confirm']) {
    let unexpected = true
    const { client, requests } = sessions(project, { handshakeStatus: suffix => unexpected && suffix === step ? 201 : 200 })
    client.knownRecords = async () => project.all
    await assert.rejects(client.request('/people'), { code: 'HUB_UNAVAILABLE' })
    assert.equal(client.current, null)
    assert.equal(requests.length, 0)
    unexpected = false
    assert.equal((await client.request('/people')).caller, project.keys[0].machineId)
  }
})

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
  const declines = new SessionClient({ key: project.keys[0], projectId: project.projectId, route: client.route, send: client.send })
  await assert.rejects(declines.request('/people'), { code: 'HUB_UNAVAILABLE' })
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
  const context = { projectId: project.projectId, hub: project.owner.machineId }
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

test('membership changes leave unproven sessions indistinguishable until uniform expiry', async () => {
  const project = testProject({ members: 2 })
  let now = 0
  const { server, client, remove, route } = sessions(project, { now: () => now })
  await client.request('/people')
  const keys = [project.keys[0], project.keys[1], project.stranger]
  const open = key => server.open(createHello(key, { projectId: project.projectId, route, role: 'replica' })).session
  const pending = keys.map(open), expiring = keys.map(open)
  remove(project.keys[0].machineId)
  server.revokeNonMembers()
  assert.equal(server.active.size, 0, 'proven removed sessions end immediately')
  for (const id of pending) await assert.rejects(server.confirm(id, { type: 'confirm', signature: 'invalid' }), { code: 'HANDSHAKE_INVALID' })
  now = 30001
  for (const id of expiring) await assert.rejects(server.confirm(id, { type: 'confirm', signature: 'invalid' }), { code: 'SESSION_UNKNOWN' })
})

test('v2 derives the published keys and first frames from the RFC 7748 shared secret', () => {
  const alicePrivate = Buffer.from('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', 'hex')
  const bobPublic = Buffer.from('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f', 'hex')
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), alicePrivate]),
    type: 'pkcs8', format: 'der' })
  const binding = { transcript: 'Pardner wire vector', v: 2 }
  const shared = Buffer.from('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742', 'hex')
  const transcript = Buffer.from('{"transcript":"Pardner wire vector","v":2}')
  assert.deepEqual(channelSecrets(shared, transcript).map(key => key.toString('hex')), [
    'ae4d3828994f82a42356f2412144e4a894a12d06cdd6275a64e1bad0aaedc33c',
    'fe96b7e47a81e56f3455d004f0a4d443199a26ed95ceac695bcd397f58ea51ca',
  ])
  const initiator = deriveChannel(privateKey, bobPublic.toString('base64url'), binding, true)
  const payload = Buffer.from('{"type":"fixture"}')
  assert.equal(initiator.seal(FRAME.control, payload).toString('hex'),
    '3e1857298991d9fc74d37b71297f34f1c2b51cd77ae3b2708c585a6453b1059913d959')
  assert.deepEqual(initiator.open(Buffer.from('f3fbeba92eabcaf0b1dd1ed4bcbae51a7af87bc17bf2a10b04abed9f6ef3b06bb72f83', 'hex')),
    { type: FRAME.control, payload })
  assert.throws(() => deriveChannel(privateKey, Buffer.alloc(32).toString('base64url'), binding, true))
})

test('a frame rejected for integrity, order, replay or direction invalidates the entire session', () => {
  const outward = Buffer.alloc(32, 1), inward = Buffer.alloc(32, 2)
  const payload = Buffer.from('sample sync data')
  for (const kind of ['modified', 'skipped', 'replayed', 'reflected', 'other session', 'truncated']) {
    const client = channel(outward, inward), hub = channel(inward, outward)
    const first = client.seal(FRAME.sync, payload), second = client.seal(FRAME.sync, payload)
    let invalid
    switch (kind) {
      case 'modified': invalid = Buffer.from(first); invalid[1] ^= 1; break
      case 'skipped': invalid = second; break
      case 'replayed': assert.deepEqual(hub.open(first).payload, payload); invalid = first; break
      case 'reflected': invalid = hub.seal(FRAME.sync, payload); break
      case 'other session': invalid = channel(Buffer.alloc(32, 3), inward).seal(FRAME.sync, payload); break
      case 'truncated': invalid = first.subarray(0, -1); break
    }
    assert.throws(() => hub.open(invalid), kind)
    assert.throws(() => hub.open(kind === 'replayed' ? second : first), `${kind}: receiver must close`)
    assert.throws(() => hub.seal(FRAME.sync, payload), `${kind}: sender must close too`)
  }
})

test('the transcript signs the checkpoint, ephemeral keys, roles and transport', () => {
  const project = testProject()
  const checkpoint = signCheckpoint(project.owner, { projectId: project.projectId, run: newRun(), starts: 2, records: 3 })
  const hello = createHello(project.keys[0], { projectId: project.projectId, route: ROUTE, role: 'replica', checkpoint, ephemeral: ephemeralKey().wireKey })
  const options = { projectId: project.projectId, acceptRoute: () => true, transport: 'ws' }
  const { reply } = answerHello(project.owner, readHello(hello, options), 'hub', ephemeralKey().wireKey)
  assert.doesNotThrow(() => readReply(project.keys[0], hello, reply, { expectRole: 'hub' }))
  for (const changed of [{ ...hello, checkpoint: null }, { ...hello, checkpoint: { ...checkpoint, records: 5 } },
    { ...hello, initiator: { ...hello.initiator, ephemeral: ephemeralKey().wireKey } }]) {
    assert.throws(() => readReply(project.keys[0], changed, reply, { expectRole: 'hub' }), { code: 'HANDSHAKE_INVALID' })
  }
  assert.throws(() => readHello({ ...hello, v: 1 }, options), { code: 'HANDSHAKE_VERSION' })
  assert.throws(() => readHello(hello, { ...options, transport: 'http' }), { code: 'HANDSHAKE_INVALID' })
  assert.throws(() => answerHello(project.owner, { ...hello, initiator: { ...hello.initiator, role: 'peer' } }, 'hub', ephemeralKey().wireKey),
    { code: 'WRONG_ROLE' })
})

test('an unverified response cannot acknowledge persistence, revoke a member or retry a write', async () => {
  const project = testProject()
  const { client, requests } = sessions(project)
  const authentic = client.send
  await client.request('/people')
  let previous = null
  for (const mutate of [
    answer => ({ ...answer, body: { acknowledged: true, hubHeads: [] } }),
    answer => ({ ...answer, status: 401, body: { code: 'SESSION_UNKNOWN' } }),
    answer => ({ ...answer, status: 403, body: { code: 'REVOKED' } }),
    answer => ({ ...answer, signer: project.keys[0].machineId }),
    () => previous,
  ]) {
    client.send = async (...parameters) => {
      const answer = await authentic(...parameters)
      const changed = mutate(answer)
      previous = answer
      return changed
    }
    const before = requests.length
    await assert.rejects(client.request('/records', { method: 'POST', body: { records: [] } }), { code: 'HUB_UNAVAILABLE' })
    assert.equal(requests.length, before + 1, 'the signed request reaches the hub once')
  }
  let transportAttempts = 0
  client.send = async () => {
    transportAttempts++
    throw Object.assign(new Error('Transport failed'), { code: 'SESSION_UNKNOWN' })
  }
  await assert.rejects(client.request('/records', { method: 'POST', body: { records: [] } }), /Transport failed/)
  assert.equal(transportAttempts, 1)
  client.send = authentic
  assert.equal((await client.request('/people')).caller, project.keys[0].machineId)
})

test('clear refusals cannot establish removal or restore status', async () => {
  const project = testProject()
  for (const code of ['REVOKED', 'HUB_WAITING', 'NOT_MEMBER']) {
    const pair = await socketPair()
    try {
      pair.socket.once('message', () => pair.socket.send(JSON.stringify({ type: 'refused', code })))
      await assert.rejects(initiateHandshake(pair.client, {
        key: project.keys[0], projectId: project.projectId, route: ROUTE, role: 'replica', knownRecords: () => project.all,
      }), { code: 'HANDSHAKE_REFUSED', message: 'The hub refused the connection.' })
    } finally { await pair.close() }
  }
})

test('a sealed frame whose dispatch throws closes the receiver, including the queued frame at attachment', async () => {
  const project = testProject()
  for (const queued of [false, true]) {
    const pair = await socketPair()
    try {
      const responding = respondHandshake(pair.socket, { key: project.owner, projectId: project.projectId, role: 'hub', acceptRoute: () => true,
        admit: async () => ({ records: project.all }) })
      const { frames } = await initiateHandshake(pair.client, { key: project.keys[0], projectId: project.projectId, route: ROUTE, role: 'replica' })
      const { frames: sender } = await responding
      const closed = once(pair.client, 'close', { signal: AbortSignal.timeout(3000) })
      let calls = 0
      const receive = () => { calls++; throw new Error('Unexpected Repo listener error') }
      if (queued) {
        const buffered = once(pair.client, 'message', { signal: AbortSignal.timeout(3000) })
        sender.send(FRAME.sync, Buffer.from('first'))
        await buffered
        assert.throws(() => frames.attach(receive), { code: 'CHANNEL_INVALID' })
      } else {
        frames.attach(receive)
        sender.send(FRAME.sync, Buffer.from('first'))
        sender.send(FRAME.sync, Buffer.from('second'))
      }
      await closed
      assert.equal(frames.failure?.code, 'CHANNEL_INVALID')
      assert.equal(calls, 1)
    } finally { await pair.close() }
  }
})
