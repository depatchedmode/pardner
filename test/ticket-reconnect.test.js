import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocketServer } from 'ws'
import { HubNetworkAdapter } from '../lib/native-network.js'
import { Workspace } from '../lib/workspace.js'
import { DurableRepo } from '../lib/durable-repo.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { TicketNetworkAdapter } from '../lib/ticket-network-adapter.js'
import { initiateHandshake, respondHandshake } from '../lib/machine-handshake.js'
import { admitMembers, projectFor, testProject } from '../support/machines.js'
import {
  withStartedServer, createTask, createTempDir, cleanupTempDir,
  nativeAutomergeWsUrl, waitFor,
} from '../support/resources.js'

it('renews its ticket after a stalled handshake and connects without restarting', { timeout: 5000 }, async () => {
  const server = createServer()
  const sockets = new Set()
  const native = new WebSocketServer({ noServer: true })
  const project = testProject()
  const hubAdapter = new HubNetworkAdapter(native, project.owner.machineId, () => true)
  hubAdapter.connect('hub-peer', {})
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  let upgrades = 0
  server.on('upgrade', (request, socket, head) => {
    if (++upgrades > 1) native.handleUpgrade(request, socket, head, connection => {
      void respondHandshake(connection, { projectId: project.projectId, key: project.owner, role: 'hub',
        acceptRoute: () => true, admit: async () => ({ records: project.all }) })
        .then(({ frames, initiator }) => hubAdapter.admit(frames, initiator.machineId))
        .catch(() => connection.terminate())
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const tickets = []
  const adapter = new TicketNetworkAdapter({ retryMs: 20, connectTimeoutMs: 100, getUrl: async () => {
    const ticket = `ticket-${tickets.length}`
    tickets.push(ticket)
    return `ws://127.0.0.1:${server.address().port}/?ticket=${ticket}`
  }, handshake: (socket, signal) => initiateHandshake(socket, { key: project.keys[0], projectId: project.projectId, role: 'replica',
    route: socket.url, signal }) })
  try {
    adapter.connect('replica-peer', {})
    await waitFor(() => adapter.state === 'connected')
    assert.equal(upgrades, 2)
    assert.deepEqual(tickets, ['ticket-0', 'ticket-1'])
    assert.equal(adapter.child.socket.readyState, 1)
  } finally {
    adapter.disconnect()
    hubAdapter.disconnect()
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => native.close(resolve))
    await new Promise(resolve => server.close(resolve))
  }
})

it('shuts down safely while a WebSocket handshake is still pending', { timeout: 5000 }, async () => {
  const directory = createTempDir('pardner-handshake-')
  const server = createServer()
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('upgrade', () => {})
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const adapter = new TicketNetworkAdapter({ getUrl: async () => `ws://127.0.0.1:${server.address().port}/`,
    handshake: () => assert.fail('The socket never opens') })
  const repo = new DurableRepo({ storage: new NodeFSStorageAdapter(directory), network: [adapter] })
  try {
    await waitFor(() => adapter.child?.socket?.readyState === 0)
    await repo.shutdown()
    assert.equal(adapter.state, 'offline')
  } finally {
    await repo.shutdown()
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
    cleanupTempDir(directory)
  }
})

it('a slow sealed welcome can finish within the handshake budget while local readiness stays independent', { timeout: 15000 }, async () => {
  const project = testProject()
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const route = `ws://127.0.0.1:${server.address().port}/`
  const hub = new HubNetworkAdapter(server, project.owner.machineId, () => true)
  hub.connect('hub', {})
  const slow = new AbortController()
  let dials = 0
  server.on('connection', socket => {
    dials++
    socket.isAlive = true
    socket.on('pong', () => { socket.isAlive = true })
    void respondHandshake(socket, { projectId: project.projectId, key: project.owner, role: 'hub', acceptRoute: () => true,
      admit: async () => { await delay(5200, undefined, { signal: slow.signal }); return { records: project.all } } })
      .then(({ frames, initiator }) => hub.admit(frames, initiator.machineId)).catch(() => socket.terminate())
  })
  const adapter = new TicketNetworkAdapter({ getUrl: async () => route,
    handshake: (socket, signal) => initiateHandshake(socket, { key: project.keys[0], projectId: project.projectId, route, role: 'replica', timeoutMs: null, signal }) })
  try {
    adapter.connect('replica', {})
    await adapter.whenReady()
    assert.equal(adapter.state, 'connecting')
    await once(adapter, 'peer-candidate', { signal: AbortSignal.timeout(8000) })
    assert.equal(adapter.state, 'connected')
    assert.equal(dials, 1)
  } finally {
    slow.abort()
    adapter.disconnect()
    hub.disconnect()
    await new Promise(resolve => server.close(resolve))
  }
})

it('native transport runs a fresh machine handshake after repeated disconnects without recreating its Repo', { timeout: 15000 }, async () => {
  await withStartedServer({}, async server => {
    const directory = createTempDir('pardner-renewal-')
    const taskId = await createTask(server)
    const project = await admitMembers(server.store, projectFor(server.store.directory))
    const route = nativeAutomergeWsUrl(server)
    const tickets = []
    // Each attempt proves the member key again over that connection's own nonces.
    const adapter = new TicketNetworkAdapter({ retryMs: 30, getUrl: async () => route,
      handshake: async (socket, signal) => {
        const welcome = await initiateHandshake(socket, { key: project.keys[0], projectId: project.projectId, route, role: 'replica',
          expectRole: 'hub', knownRecords: () => project.all, signal })
        tickets.push(welcome.transcript.responder.nonce)
        return welcome
      } })
    const repo = new DurableRepo({ storage: new NodeFSStorageAdapter(directory), network: [adapter] })
    try {
      const handle = await repo.find(server.store.docHandle.url)
      const workspace = new Workspace({ repo, handle, replicaId: 'ticket-test-replica' })
      for (let index = 0; index < 3; index++) {
        await waitFor(() => adapter.state === 'connected')
        const disconnected = once(adapter, 'peer-disconnected')
        adapter.child.socket.terminate()
        await disconnected
        await workspace.execute({ operationId: `offline-${index}`, actorId: 'builder', type: 'task.update',
          payload: { taskId, updates: { description: `offline-${index}` }, expectedRevisions: { description: workspace.taskContext(taskId).revisions.description } } })
        await waitFor(() => server.store.getDoc().tasks[taskId].description === `offline-${index}`)
      }
      assert.equal(new Set(tickets).size, tickets.length)
      assert.ok(tickets.length >= 4, 'initial connection plus three fresh authenticated connections')
      assert.equal(server.securityCounters.wsUnauthorized, 0)
    } finally {
      await repo.shutdown()
      cleanupTempDir(directory)
    }
  })
})
