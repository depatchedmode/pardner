import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket, WebSocketServer } from 'ws'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { fetchMachineResponse } from '../lib/machine-response.js'
import { initiateHandshake } from '../lib/machine-handshake.js'
import { RecordStore } from '../lib/record-store.js'
import { buildRecord, removalFor } from '../lib/membership.js'
import { admitMembers, handshakeSocket, hubRuntime, replicaRuntime, signedRequest, testProject } from '../support/machines.js'

// Transport admission at the project runtime (docs/PARDNER-TRUST-DESIGN.md, section 5): another machine reaches a
// hub only with its machine key. Every hub here is signed by a fixture key; replicas are member machines of it.

const token = 'admission-test-token'
const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]

async function eventually(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    assert.ok(Date.now() < deadline, message)
    await delay(25)
  }
}

async function withHub(run, { project = testProject({ members: 3 }) } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-admission-'))
  const started = []
  const hub = async (directory = join(root, 'hub'), options = {}) => {
    const server = new AutomergeSyncServer({ store: hubRuntime(directory, { actors, project, retryMs: 100 }), env: {}, apiToken: token,
      httpPort: 0, wsPort: 0, logger: {}, ...options })
    await server.start()
    await admitMembers(server.store, project)
    started.push(server)
    return server
  }
  const replicas = []
  const replica = async (server, index, directory = join(root, `replica-${index}-${randomUUID()}`)) => {
    const runtime = replicaRuntime(directory, project, index, { hub: server, actors, retryMs: 100 })
    replicas.push(runtime)
    await runtime.init()
    return runtime
  }
  try { await run({ root, project, hub, replica }) } finally {
    await Promise.allSettled(replicas.map(runtime => runtime.close()))
    await Promise.allSettled(started.map(server => server.stop()))
    await rm(root, { recursive: true, force: true })
  }
}

const nativeUrl = server => `ws://127.0.0.1:${server.wsPort}/automerge`
const httpRoute = server => `http://127.0.0.1:${server.httpPort}`

/** Opens a native socket and records every frame the hub sends. */
async function rawSocket(server) {
  const socket = new WebSocket(nativeUrl(server))
  const frames = []
  socket.on('message', (data, binary) => frames.push(binary ? { type: 'binary' } : JSON.parse(data.toString())))
  await once(socket, 'open')
  return { socket, frames }
}

it('a non-member machine is refused and served nothing, on the sync socket and over HTTP', async () => {
  await withHub(async ({ project, hub }) => {
    const server = await hub()
    const before = server.store.getDoc()
    const { socket, frames } = await rawSocket(server)
    const closed = once(socket, 'close')
    await assert.rejects(initiateHandshake(socket, { key: project.stranger, projectId: project.projectId, route: nativeUrl(server), role: 'replica' }),
      { code: 'NOT_MEMBER' })
    const [code, reason] = await closed
    assert.equal(code, 4403)
    assert.equal(reason.length, 0, 'the close frame does not repeat the sealed refusal')
    // A stranger proves its own key and is then refused; only the handshake reply reached it, no records or document data.
    assert.deepEqual(frames.map(frame => frame.type), ['hello-reply', 'binary'])
    const session = await signedRequest(project.stranger, { projectId: project.projectId, route: httpRoute(server) }, '/automerge/sync-ack',
      { workspaceId: project.projectId, heads: [] })
    assert.equal(session.status, 403); assert.equal(session.result.code, 'NOT_MEMBER')
    assert.equal(server.syncSessions.size, 0)
    assert.deepEqual(server.store.getDoc(), before)
  })
})

it('a bearer token is refused between machines: on signed routes, the native socket and the retired replica ticket', async () => {
  await withHub(async ({ project, hub }) => {
    const server = await hub()
    for (const headers of [{ Authorization: 'Bearer device-token-from-an-earlier-version' }, { 'x-pardner-replica-token': 'replica-secret' }, {}]) {
      const response = await fetch(`${httpRoute(server)}/automerge/sync-ack`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ workspaceId: project.projectId, heads: [] }) })
      assert.equal(response.status, 401)
    }
    // No replica credential mints a native ticket: only the client's own loopback hop could, and this hub has none.
    const ticket = await fetch(`${httpRoute(server)}/automerge/ws-ticket`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-pardner-replica-token': 'replica-secret' },
      body: JSON.stringify({ purpose: 'replica', replicaId: 'laptop' }) })
    assert.equal(ticket.status, 403); assert.equal((await ticket.json()).code, 'REPLICA_REQUIRED')
    // Even the local API token is no proof on the native socket: Automerge frames before a handshake close it.
    const socket = new WebSocket(`${nativeUrl(server)}?token=${token}`, { headers: { Authorization: `Bearer ${token}` } })
    const frames = []
    socket.on('message', (data, binary) => frames.push(binary ? 'binary' : JSON.parse(data.toString()).type))
    await once(socket, 'open')
    const closed = once(socket, 'close')
    socket.send(Buffer.from([0xa1, 0x64, 0x74, 0x79, 0x70, 0x65, 0x64, 0x6a, 0x6f, 0x69, 0x6e]))
    assert.equal((await closed)[0], 1006)
    assert.deepEqual(frames, [])
  })
})

it('a recorded handshake is useless against a new connection, another hub of the project and another project', async () => {
  const other = testProject()
  await withHub(async ({ root, project, hub }) => {
    const server = await hub()
    // Record what the member sends on one successful connection.
    const recorded = []
    const live = await rawSocket(server)
    const send = live.socket.send.bind(live.socket)
    live.socket.send = (data, ...rest) => { recorded.push(data); return send(data, ...rest) }
    await initiateHandshake(live.socket, { key: project.keys[0], projectId: project.projectId, route: nativeUrl(server), role: 'replica',
      knownRecords: () => project.all })
    live.socket.terminate()
    const [hello, confirm] = recorded
    const replay = async target => {
      const { socket, frames } = await rawSocket(target)
      const closed = once(socket, 'close')
      socket.send(hello)
      await eventually(() => frames.length, 'no answer to the replayed hello')
      if (frames[0].type === 'hello-reply') socket.send(confirm)
      await closed
      return frames.map(frame => frame.type === 'refused' ? frame.code : frame.type)
    }
    // A new connection: the hub's fresh nonce makes the recorded confirmation fail.
    assert.deepEqual(await replay(server), ['hello-reply'])
    // Another hub of the same project (other routes): the hello names the route it was dialled on.
    const second = await hub(join(root, 'second-hub'))
    assert.deepEqual(await replay(second), ['ROUTE_REJECTED'])
    // Another project's hub.
    const elsewhere = new AutomergeSyncServer({ store: hubRuntime(join(root, 'elsewhere'), { actors, project: other }), env: {}, apiToken: token,
      httpPort: 0, wsPort: 0, logger: {} })
    await elsewhere.start()
    try { assert.deepEqual(await replay(elsewhere), ['WRONG_PROJECT']) } finally { await elsewhere.stop() }
    assert.equal(server.syncSessions.size, 0)
  })
})

it('a captured signed request is refused when replayed, in its session or at another hub', async () => {
  await withHub(async ({ root, project, hub }) => {
    const server = await hub(), second = await hub(join(root, 'second-hub'))
    const captured = []
    const { SessionClient } = await import('../lib/machine-session.js')
    const send = async (url, { headers = {}, body }) => {
      const request = { url, init: { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) } }
      if (headers['x-pardner-signature']) captured.push(request)
      return fetchMachineResponse(url, { method: request.init.method, headers, body })
    }
    const client = new SessionClient({ key: project.keys[0], projectId: project.projectId, route: httpRoute(server), send, knownRecords: async () => project.all })
    const receipt = await client.request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } })
    assert.equal(receipt.acknowledged, true)
    const [request] = captured
    const again = await fetch(request.url, request.init)
    assert.equal(again.status, 401); assert.equal((await again.json()).code, 'REQUEST_REPLAYED')
    const elsewhere = await fetch(request.url.replace(httpRoute(server), httpRoute(second)), request.init)
    assert.equal(elsewhere.status, 401); assert.equal((await elsewhere.json()).code, 'SESSION_UNKNOWN')
    // Changing the body under a fresh sequence number breaks the signature.
    const tampered = { ...request.init, headers: { ...request.init.headers, 'x-pardner-seq': '7' } }
    const forged = await fetch(request.url, tampered)
    assert.equal(forged.status, 401); assert.equal((await forged.json()).code, 'AUTH_REQUIRED')
  })
})

it('the joiner refuses a hub machine that is not a member of the project it expects, and accepts nothing from it', async () => {
  await withHub(async ({ root, project }) => {
    // This hub holds the project's real genesis and records but answers with a key no record certifies.
    const impostor = new AutomergeSyncServer({ store: hubRuntime(join(root, 'impostor'), { actors, project: { ...project, owner: project.stranger } }),
      env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {} })
    await impostor.start()
    await admitMembers(impostor.store, project)
    try {
      const joiner = replicaRuntime(join(root, 'joiner'), project, 0, { hub: impostor, actors, retryMs: 100 })
      await assert.rejects(joiner.init(), { code: 'RESPONDER_NOT_MEMBER' })
      await joiner.close()
      assert.equal(joiner.records.size, 0, 'no record from the impostor was stored')
      assert.equal(joiner.manifest.url, undefined, 'no document was accepted')
    } finally { await impostor.stop() }
  })
})

it('a removed machine is refused, and its open sync session closes when the removal arrives', async () => {
  await withHub(async ({ project, hub, replica }) => {
    const server = await hub()
    const removed = await replica(server, 0), kept = await replica(server, 1)
    await eventually(() => removed.status().hubConnected && kept.status().hubConnected, 'replicas never connected')
    assert.equal(server.syncSessions.get(project.keys[0].machineId)?.size, 1)
    await server.store.addRecords([project.remove(project.keys[0])])
    await eventually(() => !removed.status().hubConnected, 'the removed machine’s session stayed open')
    await eventually(() => removed.status().hubRefusal?.code === 'REVOKED', 'the removed machine was never refused')
    const generation = removed.adapter.generation
    let requests = 0
    const send = removed.hubSession.send
    removed.hubSession.send = (...args) => { requests++; return send(...args) }
    await delay(350)
    assert.equal(removed.adapter.generation, generation, 'the removed replica neither reconnects nor arms another dial')
    assert.equal(requests, 0, 'the removed replica stops polling for persistence acknowledgements')
    assert.equal(server.syncSessions.has(project.keys[0].machineId), false)
    assert.equal(kept.status().hubConnected, true, 'other members keep syncing')
    const session = await signedRequest(project.keys[0], { projectId: project.projectId, route: httpRoute(server) }, '/automerge/sync-ack',
      { workspaceId: project.projectId, heads: [] })
    assert.equal(session.status, 403); assert.equal(session.result.code, 'REVOKED')
  })
})

it('removal received from a locally revoked signer leaves the durable membership unchanged', async () => {
  await withHub(async ({ project, hub, replica }) => {
    const server = await hub(), member = await replica(server, 0)
    const administrator = project.stranger
    const adminAdmission = project.admit(administrator, 3, 'admin')
    const historicalRemoval = project.remove(project.keys[0], administrator)
    member.admitRecords([adminAdmission, project.remove(administrator)])
    assert.equal(member.learnRemoval([historicalRemoval]), null)
    assert.equal(member.records.get(historicalRemoval.recordId), undefined)
    assert.equal(member.status().hubRefusal, null)
    assert.ok(member.membership().machines.some(machine => machine.id === project.keys[0].machineId))
  })
})

it('a removed machine receives only the needed signed records on the socket and over HTTP', async () => {
  await withHub(async ({ root, project, hub }) => {
    const server = await hub()
    const removed = project.keys[0]
    const removalRecord = project.remove(removed)
    await server.store.addRecords([removalRecord])
    const later = project.admit(project.stranger, 3)
    await server.store.addRecords([later, buildRecord(project.stranger, { kind: 'profile', projectId: project.projectId,
      subject: project.stranger.machineId, displayName: 'Later member', email: 'new@example.test' })])
    const recordsReceived = []
    const saved = new RecordStore(join(root, 'removed.sqlite'), project.projectId)
    const onRemoval = records => {
      recordsReceived.push(records.map(record => record.recordId).sort())
      saved.admit(records)
      const membership = saved.membership()
      return membership.removedMachines.includes(removed.machineId) ? { removal: removalFor(membership, removed.machineId) } : null
    }
    try {
      const expected = { removal: { kind: 'machine', left: false, by: { personId: project.ownerId, name: 'Owner' } } }
      // The removed machine itself finishes the signatures and is refused with who removed it (#154).
      const { socket } = await rawSocket(server)
      const refused = await initiateHandshake(socket, { key: removed, projectId: project.projectId, route: nativeUrl(server), role: 'replica', onRemoval }).catch(error => error)
      assert.deepEqual([refused.code, refused.details?.removal, refused.details?.verified], ['REVOKED', expected.removal, true])
      // Someone who presents the removed machine's public key without its private key learns nothing beyond the code.
      const impostor = { machineId: removed.machineId, publicKey: removed.publicKey, sign: project.stranger.sign.bind(project.stranger) }
      const posing = await rawSocket(server)
      const failed = await initiateHandshake(posing.socket, { key: impostor, projectId: project.projectId, route: nativeUrl(server), role: 'replica' }).catch(error => error)
      assert.notEqual(failed.code, undefined)
      assert.equal(failed.details, undefined, 'an impostor is told nothing about the removal')
      assert.equal(posing.frames.some(frame => frame.type === 'welcome' || frame.records), false)
      // The same over HTTP: the session's confirmation carries the details, never its hello.
      const { SessionClient } = await import('../lib/machine-session.js')
      const send = fetchMachineResponse
      const told = await new SessionClient({ key: removed, projectId: project.projectId, route: httpRoute(server), send, onRemoval })
        .request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } }).catch(error => error)
      assert.deepEqual([told.code, told.details], ['REVOKED', { ...expected, verified: true, authenticated: true }])
      const minimalIds = [project.genesis, project.records[0], removalRecord].map(record => record.recordId).sort()
      assert.deepEqual(recordsReceived, [minimalIds, minimalIds])
      const hello = await new SessionClient({ key: impostor, projectId: project.projectId, route: httpRoute(server), send, knownRecords: async () => project.all })
        .request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } }).catch(error => error)
      assert.equal(hello.details, undefined, 'an impostor is told nothing about the removal over HTTP either')
      assert.equal(server.sessions.active.size, 0)
    } finally { saved.close() }
  })
})

it('an unproven party gets the same answer whether the key it presents is unknown, removed or a member’s, on the socket and over HTTP', async () => {
  await withHub(async ({ project, hub }) => {
    const server = await hub()
    const [removed, current] = project.keys
    await server.store.addRecords([project.remove(removed)])
    // Each presents a public key and signs with a different private key, so none proves the key it names.
    const posing = key => ({ machineId: key.machineId, publicKey: key.publicKey, sign: project.stranger.sign.bind(project.stranger) })
    const unknown = (await import('../lib/machine-key.js')).generateMachineKey()
    const answers = []
    for (const key of [unknown, removed, current]) {
      const { socket, frames } = await rawSocket(server)
      const closed = once(socket, 'close')
      const error = await initiateHandshake(socket, { key: posing(key), projectId: project.projectId, route: nativeUrl(server), role: 'replica' }).catch(failure => failure)
      const [code] = await closed
      const http = await signedRequest(posing(key), { projectId: project.projectId, route: httpRoute(server) }, '/automerge/sync-ack',
        { workspaceId: project.projectId, heads: [] })
      answers.push({ frames: frames.map(frame => [frame.type, frame.code ?? null, frame.details ?? null]), error: [error.code, error.details ?? null], close: code,
        http: [http.status, http.result.code, http.result.details ?? null] })
    }
    assert.deepEqual(answers[1], answers[0], 'a removed machine’s key looks like an unknown one until it is proved')
    assert.deepEqual(answers[2], answers[0], 'so does a current member’s key')
    assert.deepEqual(answers[0].frames.map(([type]) => type), ['hello-reply'], 'the reply carries no records or document data')
    assert.equal(server.syncSessions.size, 0)
    assert.equal(server.sessions.active.size, 0)
  })
})

it('removal also ends a live signed HTTP session at once', async () => {
  await withHub(async ({ project, hub, replica }) => {
    const server = await hub()
    const member = await replica(server, 1)
    const { SessionClient } = await import('../lib/machine-session.js')
    const send = fetchMachineResponse
    const client = new SessionClient({ key: project.keys[1], projectId: project.projectId, route: httpRoute(server), send,
      knownRecords: async () => member.records.all(), onRemoval: records => member.learnRemoval(records) })
    await client.request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } })
    assert.ok(server.sessions.active.has(client.current.id))
    await server.store.addRecords([project.remove(project.keys[1])])
    assert.equal(server.sessions.active.has(client.current.id), false)
    await assert.rejects(client.request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } }), { code: 'REVOKED' })
  })
})

it('two live sync sessions for one machine are reported, and a dead one is replaced without a report', async () => {
  await withHub(async ({ root, project, hub, replica }) => {
    const server = await hub()
    const original = await replica(server, 0, join(root, 'original'))
    await eventually(() => original.status().hubConnected, 'the original never connected')
    // A copy of the same client directory, running beside its original.
    await original.close()
    await cp(join(root, 'original'), join(root, 'copy'), { recursive: true })
    const first = await replica(server, 0, join(root, 'original'))
    const copy = await replica(server, 0, join(root, 'copy'))
    await eventually(() => first.status().hubConnected && copy.status().hubConnected, 'both copies never connected')
    const report = await eventually(() => server.store.status().duplicateMachines.find(entry => entry.machineId === project.keys[0].machineId),
      'the duplicate was never reported')
    assert.equal(report.sessions, 2)
    assert.ok(server.securityCounters.duplicateMachine >= 1)
    // Both stay connected: the report is not a guard.
    assert.equal(first.status().hubConnected && copy.status().hubConnected, true)
    // A session that no longer answers is closed when the same machine reconnects, and is not reported.
    const clean = await hub(join(root, 'clean-hub'))
    const silent = await handshakeSocket(nativeUrl(clean), { key: project.keys[1], projectId: project.projectId, records: project.all,
      socketOptions: { autoPong: false } })
    silent.sendSync((await import('@automerge/automerge-repo')).cbor.encode({
      type: 'join', senderId: silent.peerIdFor('silent'), supportedProtocolVersions: ['1'],
    }))
    const reconnect = await handshakeSocket(nativeUrl(clean), { key: project.keys[1], projectId: project.projectId, records: project.all })
    reconnect.sendSync((await import('@automerge/automerge-repo')).cbor.encode({
      type: 'join', senderId: reconnect.peerIdFor('reconnect'), supportedProtocolVersions: ['1'],
    }))
    await eventually(() => clean.syncSessions.get(project.keys[1].machineId)?.size === 1, 'the silent session was never closed', 8000)
    assert.deepEqual(clean.store.status().duplicateMachines, [])
    silent.terminate(); reconnect.terminate()
  })
})

it('a restored hub serves no removed machine that connects first, and resumes after a member that saw a later state syncs', { timeout: 60000 }, async () => {
  await withHub(async ({ root, project, hub, replica }) => {
    const hubDirectory = join(root, 'hub')
    let server = await hub(hubDirectory)
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    let removed = await replica(server, 0, join(root, 'removed')), member = await replica(server, 1, join(root, 'member'))
    await eventually(() => !removed.status().syncPending && !member.status().syncPending, 'replicas never synced')
    await Promise.all([removed.close(), member.close()])
    // A cold backup of the hub.
    await server.stop()
    await cp(hubDirectory, join(root, 'backup'), { recursive: true })
    // The hub runs on; the member syncs with it, and the owner removes the other machine while it is offline.
    server = await hub(hubDirectory, ports)
    member = await replica(server, 1, join(root, 'member'))
    await eventually(() => !member.status().syncPending, 'the member never synced after the backup')
    await server.store.addRecords([project.remove(project.keys[0])])
    await eventually(() => member.records.membership().removedMachines.includes(project.keys[0].machineId), 'the member never received the removal')
    await member.close()
    await server.stop()
    // The hub is restored from the backup: it no longer holds the removal.
    await rm(hubDirectory, { recursive: true, force: true })
    await cp(join(root, 'backup'), hubDirectory, { recursive: true })
    server = await hub(hubDirectory, ports)
    assert.equal(server.store.hubStatus().waiting, true)
    assert.equal(server.store.hubStatus().reason, 'restored')
    assert.equal(server.store.records.membership().removedMachines.includes(project.keys[0].machineId), false)
    // The removed machine connects first. It looks like a member to the stale hub, but it saw nothing newer, so it is
    // not served: no welcome, no document data, and it vouches for nothing.
    removed = await replica(server, 0, join(root, 'removed'))
    await eventually(() => removed.status().hubRefusal?.code === 'HUB_WAITING', 'the waiting hub did not refuse the first machine')
    assert.equal(server.syncSessions.size, 0)
    assert.equal(server.store.hubStatus().waiting, true)
    const signed = await signedRequest(project.keys[0], { projectId: project.projectId, route: httpRoute(server) }, '/automerge/sync-ack',
      { workspaceId: project.projectId, heads: [] })
    assert.equal(signed.status, 503); assert.equal(signed.result.code, 'HUB_WAITING')
    // The member that synced after the backup connects; the hub takes its records, learns the removal, and resumes.
    member = await replica(server, 1, join(root, 'member'))
    await eventually(() => member.status().hubConnected, 'the member was never served')
    assert.equal(server.store.hubStatus().waiting, false)
    assert.deepEqual(server.store.hubStatus().resumedBy, { machineId: project.keys[1].machineId })
    assert.ok(server.store.records.membership().removedMachines.includes(project.keys[0].machineId))
    await eventually(() => removed.status().hubRefusal?.code === 'REVOKED', 'the removed machine was served after the hub caught up')
    assert.equal(server.syncSessions.has(project.keys[0].machineId), false)
  })
})

it('a restored hub that nobody can vouch for waits until its operator confirms nothing newer exists', { timeout: 60000 }, async () => {
  await withHub(async ({ root, hub, replica }) => {
    const hubDirectory = join(root, 'hub')
    let server = await hub(hubDirectory)
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    let member = await replica(server, 1, join(root, 'member'))
    await eventually(() => !member.status().syncPending, 'the member never synced')
    await member.close()
    await server.stop()
    await cp(hubDirectory, join(root, 'restored'), { recursive: true })
    server = await hub(join(root, 'restored'), ports)
    member = await replica(server, 1, join(root, 'member'))
    const refusal = await eventually(() => {
      const { hubRefusal } = member.status()
      return hubRefusal?.code === 'HUB_WAITING' && hubRefusal
    }, 'the restored hub served before it was confirmed')
    assert.equal(refusal.authenticated, true)
    const dial = member.adapter.getUrl
    const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    relay.on('connection', socket => socket.once('message', () => socket.close(4403, 'REVOKED')))
    await once(relay, 'listening')
    try {
      member.adapter.getUrl = async () => { throw Object.assign(new Error('Fixture dial refused'), { code: 'ECONNREFUSED' }) }
      await eventually(() => member.status().syncError === 'Fixture dial refused', 'the transport failure was never reported')
      assert.deepEqual(member.status().hubRefusal, refusal)
      member.adapter.getUrl = async () => `ws://127.0.0.1:${relay.address().port}`
      await eventually(() => member.status().syncError === 'The hub connection closed before sync started', 'the early close was never reported')
      assert.deepEqual(member.status().hubRefusal, refusal)
    } finally {
      member.adapter.getUrl = dial
      for (const socket of relay.clients) socket.terminate()
      await new Promise(resolve => relay.close(resolve))
    }
    const resumed = await (await fetch(`${httpRoute(server)}/automerge/hub/resume`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })).json()
    assert.equal(resumed.waiting, false); assert.equal(resumed.resumedBy, 'operator')
    await eventually(() => member.status().hubConnected && !member.status().syncPending, 'the member never resumed syncing')
    // Its new checkpoints are ahead of the old run's, so a later restart is not mistaken for another restore.
    const reopened = new AutomergeSyncServer({ store: hubRuntime(join(root, 'restored'), {}), env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {} })
    await member.close()
    await server.stop()
    await reopened.start()
    try { assert.equal(reopened.store.hubStatus().waiting, false) } finally { await reopened.stop() }
  })
})

it('a hub that sees a checkpoint it never reached catches up from that member, even when its files look untouched', { timeout: 60000 }, async () => {
  await withHub(async ({ root, project, hub, replica }) => {
    const hubDirectory = join(root, 'hub')
    let server = await hub(hubDirectory)
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    let member = await replica(server, 1, join(root, 'member'))
    await eventually(() => !member.status().syncPending && member.manifest.hubCheckpoint, 'the member never kept a checkpoint')
    await member.close()
    await server.stop()
    // Roll the hub's own state back in place, as a filesystem snapshot would, without changing its files' identity.
    const statePath = join(hubDirectory, 'hub-state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    await writeFile(statePath, JSON.stringify({ ...state, starts: state.starts - 1 }))
    server = await hub(hubDirectory, ports)
    assert.equal(server.store.hubStatus().waiting, false, 'nothing on disk shows the rollback')
    member = await replica(server, 1, join(root, 'member'))
    await eventually(() => member.status().hubConnected, 'the member was never served')
    assert.deepEqual(server.store.hubStatus().resumedBy, { machineId: project.keys[1].machineId })
    assert.ok(server.store.hubStatus().starts > state.starts, 'its new checkpoints are ahead of the lost run')
  })
})

it('a protected join can only claim a peer ID owned by the authenticated machine', async () => {
  await withHub(async ({ project, hub }) => {
    const server = await hub()
    const [first, second] = project.keys
    const { cbor } = await import('@automerge/automerge-repo')
    const sockets = await Promise.all([first, second].map(key => handshakeSocket(nativeUrl(server),
      { key, projectId: project.projectId, records: project.all })))
    const [member, other] = sockets
    try {
      const peerId = member.peerIdFor('live-peer')
      const admitted = once(server.automergeWsAdapter, 'peer-candidate')
      member.sendSync(cbor.encode({ type: 'join', senderId: peerId, supportedProtocolVersions: ['1'] }))
      assert.equal((await admitted)[0].peerId, peerId)
      const closed = once(other, 'close', { signal: AbortSignal.timeout(3000) })
      other.sendSync(cbor.encode({ type: 'join', senderId: peerId, supportedProtocolVersions: ['1'] }))
      await closed
      assert.equal(server.automergeWsAdapter.sockets.get(peerId).machineId, first.machineId)
      assert.equal(member.readyState, member.OPEN)
    } finally { for (const socket of sockets) socket.terminate() }
  })
})
