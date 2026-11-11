import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { initiateHandshake } from '../lib/machine-handshake.js'
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
    assert.equal((await closed)[0], 4403)
    assert.deepEqual(frames.map(frame => frame.type), ['refused'], 'no reply, records or document data reach a stranger')
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
    assert.equal((await closed)[0], 4403)
    assert.deepEqual(frames, ['refused'])
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
    live.socket.send = (data, ...rest) => { recorded.push(JSON.parse(data)); return send(data, ...rest) }
    await initiateHandshake(live.socket, { key: project.keys[0], projectId: project.projectId, route: nativeUrl(server), role: 'replica',
      knownRecords: () => project.all })
    live.socket.terminate()
    const [hello, confirm] = recorded
    const replay = async target => {
      const { socket, frames } = await rawSocket(target)
      const closed = once(socket, 'close')
      socket.send(JSON.stringify(hello))
      await eventually(() => frames.length, 'no answer to the replayed hello')
      if (frames[0].type === 'hello-reply') socket.send(JSON.stringify(confirm))
      await closed
      return frames.map(frame => frame.type === 'refused' ? frame.code : frame.type)
    }
    // A new connection: the hub's fresh nonce makes the recorded confirmation fail.
    assert.deepEqual(await replay(server), ['hello-reply', 'HANDSHAKE_INVALID'])
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
      const response = await fetch(request.url, request.init)
      const result = await response.json()
      if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code })
      return result
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
    assert.equal(server.syncSessions.has(project.keys[0].machineId), false)
    assert.equal(kept.status().hubConnected, true, 'other members keep syncing')
    const session = await signedRequest(project.keys[0], { projectId: project.projectId, route: httpRoute(server) }, '/automerge/sync-ack',
      { workspaceId: project.projectId, heads: [] })
    assert.equal(session.status, 403); assert.equal(session.result.code, 'REVOKED')
  })
})

it('removal also ends a live signed HTTP session at once', async () => {
  await withHub(async ({ project, hub }) => {
    const server = await hub()
    const { SessionClient } = await import('../lib/machine-session.js')
    const send = async (url, { headers = {}, body }) => {
      const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const result = await response.json()
      if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code })
      return result
    }
    const client = new SessionClient({ key: project.keys[1], projectId: project.projectId, route: httpRoute(server), send, knownRecords: async () => project.all })
    await client.request('/automerge/sync-ack', { method: 'POST', body: { workspaceId: project.projectId, heads: [] } })
    assert.equal(server.sessions.active.size, 1)
    await server.store.addRecords([project.remove(project.keys[1])])
    assert.equal(server.sessions.active.size, 0)
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
    const reconnect = await handshakeSocket(nativeUrl(clean), { key: project.keys[1], projectId: project.projectId, records: project.all })
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
    await eventually(() => member.status().hubRefusal?.code === 'HUB_WAITING', 'the restored hub served before it was confirmed')
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
