import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { requestJson } from '../lib/sync-client.js'

const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'builder', handle: 'builder', kind: 'agent' }]
const token = 'runtime-test-token'
async function eventually(check) {
  const deadline = Date.now() + 10000
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Runtime did not converge within ten seconds')
    await delay(25)
  }
}
function service(directory, options = {}) {
  const { hubUrl, hubWsUrl, ...serverOptions } = options
  return new AutomergeSyncServer({
    store: new WorkspaceRuntime({ directory, role: hubUrl ? 'replica' : 'hub', hubUrl, hubWsUrl, token, actors, retryMs: 100 }),
    env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {}, ...serverOptions,
  })
}
function api(server, path, body) {
  return requestJson(`http://127.0.0.1:${server.httpPort}`, path, {
    token, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
}

it('persists public operations, opens offline, and reconnects the same workspace', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-runtime-'))
  let hub = service(join(root, 'hub'))
  let replica
  try {
    await hub.start()
    const ports = { httpPort: hub.httpPort, wsPort: hub.wsPort }
    const settings = { hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` }
    replica = service(join(root, 'replica'), settings)
    await replica.start()
    await eventually(() => !replica.store.status().syncPending)
    const identity = replica.store.manifest.workspaceId
    const first = await api(replica, '/automerge/operations', {
      operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Before partition' },
    })
    assert.equal(first.savedLocally, true)
    await eventually(() => !replica.store.status().syncPending)
    assert.equal(hub.store.workspace.taskContext(first.result.taskId).task.title, 'Before partition')
    await replica.stop()
    replica = null
    await hub.stop()
    hub = null
    const started = Date.now()
    replica = service(join(root, 'replica'), settings)
    await replica.start()
    assert.ok(Date.now() - started < 5000, 'Cached workspace must open offline within five seconds')
    assert.equal(replica.store.manifest.workspaceId, identity)
    const offline = await api(replica, '/automerge/operations', {
      operationId: randomUUID(), actorId: 'builder', type: 'task.create', payload: { title: 'Agent authored offline' },
    })
    assert.equal(offline.savedLocally, true)
    assert.equal(offline.syncPending, true)
    hub = service(join(root, 'hub'), ports)
    await hub.start()
    await eventually(() => !replica.store.status().syncPending)
    assert.equal(hub.store.workspace.taskContext(offline.result.taskId).task.title, 'Agent authored offline')
    assert.equal(hub.securityCounters.wsUnauthorized, 0)
  } finally {
    await replica?.stop()
    await hub?.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects a second directory owner and releases ownership on close', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-owner-'))
  const first = new WorkspaceRuntime({ directory, actors })
  const second = new WorkspaceRuntime({ directory, actors })
  try {
    await first.init()
    await assert.rejects(second.init(), { code: 'STORAGE_IN_USE' })
    await Promise.all([first.close(), first.close()])
    await second.init()
    assert.equal(second.manifest.workspaceId, first.manifest.workspaceId)
  } finally {
    await first.close()
    await second.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('recovers acknowledged public operations after SIGKILL and releases the process lock', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-process-'))
  const children = []
  async function start() {
    const child = fork(new URL('../support/workspace-service-process.js', import.meta.url), [JSON.stringify({ directory, token, actors })],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    children.push(child)
    let stderr = ''
    child.stderr.on('data', bytes => { stderr += bytes })
    const result = await Promise.race([
      once(child, 'message').then(([message]) => message),
      once(child, 'exit').then(([code]) => { throw new Error(`Service exited ${code}: ${stderr}`) }),
    ])
    return { child, ...result }
  }
  async function kill(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  try {
    const original = await start()
    assert.equal(original.error, undefined)
    const request = { operationId: randomUUID(), actorId: 'builder', type: 'task.create', payload: { title: 'Survives process death' } }
    const receipt = await api(original, '/automerge/operations', request)
    assert.equal(receipt.savedLocally, true)
    await api(original, '/automerge/operations', { operationId: randomUUID(), actorId: 'alice', type: 'comment.add',
      payload: { taskId: receipt.result.taskId, text: '@builder please take this work' } })
    const claimRequest = { actorId: 'builder', requestId: randomUUID() }
    const claim = await api(original, '/automerge/deliveries/claim', claimRequest)
    assert.equal(claim.claimed, true)
    const competing = await start()
    assert.equal(competing.code, 'STORAGE_IN_USE')
    await kill(original.child)
    const reopened = await start()
    assert.equal(reopened.error, undefined)
    assert.equal(reopened.manifest.replicaId, original.manifest.replicaId)
    const context = await api(reopened, `/automerge/task/${receipt.result.taskId}/context?actor=builder`)
    assert.equal(context.task.title, request.payload.title)
    assert.equal(context.history.filter(event => event.requestId === request.operationId).length, 1)
    const replay = await api(reopened, '/automerge/operations', request)
    assert.equal(replay.replayed, true)
    assert.equal(replay.result.taskId, receipt.result.taskId)
    const recoveredClaim = await api(reopened, '/automerge/deliveries/claim', claimRequest)
    assert.equal(recoveredClaim.claimToken, claim.claimToken)
    const acknowledgement = { actorId: 'builder', mentionId: claim.mention.id, claimToken: claim.claimToken }
    assert.equal((await api(reopened, '/automerge/deliveries/ack', acknowledgement)).acknowledged, true)
    await kill(reopened.child)
    const final = await start()
    assert.equal((await api(final, '/automerge/deliveries/ack', acknowledgement)).replayed, true)
    assert.equal((await api(final, '/automerge/deliveries/claim', { actorId: 'builder', requestId: randomUUID() })).claimed, false)
  } finally {
    for (const child of children) await kill(child)
    await rm(directory, { recursive: true, force: true })
  }
})

it('does not let a delayed hub acknowledgement clear newer local work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-ack-'))
  const hub = service(join(root, 'hub'))
  let replica
  let release
  try {
    await hub.start()
    replica = new WorkspaceRuntime({ directory: join(root, 'replica'), role: 'replica', token,
      hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` })
    await replica.init()
    assert.equal((await replica.claimDelivery({ actorId: 'builder', requestId: randomUUID() })).claimed, false)
    await eventually(() => !replica.status().syncPending)
    const requestHub = replica.requestHub.bind(replica)
    let received
    const pending = new Promise(resolve => { received = resolve })
    const gate = new Promise(resolve => { release = resolve })
    replica.requestHub = async (path, ...args) => {
      const receipt = await requestHub(path, ...args)
      if (path === '/automerge/sync-ack') { received(); await gate }
      return receipt
    }
    const acknowledging = replica.synchronizeAcknowledgement()
    await pending
    await replica.execute({ operationId: randomUUID(), actorId: 'builder', type: 'task.create', payload: { title: 'Newer than acknowledgement' } })
    assert.equal(replica.status().syncPending, true)
    release()
    await acknowledging
    assert.equal(replica.status().syncPending, true)
    replica.requestHub = requestHub
    await eventually(() => !replica.status().syncPending)
  } finally {
    release?.()
    await replica?.close()
    await hub.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('broadcasts native replica changes to every UI subscriber and rejects JSON mutations', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-subscribers-'))
  const hub = service(join(root, 'hub'))
  const sockets = []
  let replica
  let stage = 'start'
  t.signal.addEventListener('abort', () => {
    if (stage !== 'complete') t.diagnostic(`Stopped at ${stage}; JSON clients=${hub.wssJson?.clients.size}, native clients=${hub.nativeWsServer?.clients.size}`)
  })
  try {
    await hub.start()
    replica = new WorkspaceRuntime({ directory: join(root, 'replica'), role: 'replica', token, retryMs: 100,
      hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` })
    await replica.init()
    await eventually(() => !replica.status().syncPending)
    const inboxes = []
    for (let i = 0; i < 2; i++) {
      const { ticket } = await api(hub, '/automerge/ws-ticket', {})
      const socket = new WebSocket(`ws://127.0.0.1:${hub.wsPort}/?ticket=${ticket}`)
      sockets.push(socket)
      const inbox = []
      inboxes.push(inbox)
      socket.on('message', bytes => inbox.push(JSON.parse(bytes)))
      await once(socket, 'open')
    }
    const result = await replica.execute({ operationId: randomUUID(), actorId: 'builder', type: 'task.create', payload: { title: 'From a native peer' } })
    await eventually(() => inboxes.every(inbox => inbox.some(message => message.type === 'document-update' && message.doc.tasks[result.result.taskId])))
    for (const inbox of inboxes) {
      assert.equal(inbox.filter(message => message.type === 'document-update' && message.doc.tasks[result.result.taskId]).length, 1)
    }
    sockets[0].send(JSON.stringify({ type: 'document-change', change: { type: 'task-update', taskId: result.result.taskId, updates: { title: 'Bypass' } } }))
    await eventually(() => inboxes[0].some(message => message.code === 'HTTP_MUTATION_REQUIRED'))
    assert.equal(hub.store.workspace.taskContext(result.result.taskId).task.title, 'From a native peer')
    await assert.rejects(api(hub, '/automerge/task', { title: 'Old mutation path' }), error => error.status === 409)
    assert.equal(Object.keys(hub.store.workspace.snapshot().tasks).length, 1)
    // The hub must also stop while a native peer remains connected.
    stage = 'hub.stop'
    await hub.stop()
    stage = 'replica disconnect'
    await eventually(() => !replica.status().hubConnected)
  } finally {
    stage = 'cleanup'
    for (const socket of sockets) socket.terminate()
    await replica?.close()
    if (hub.httpServer) await hub.stop()
    await rm(root, { recursive: true, force: true })
    stage = 'complete'
  }
})

it('preserves human and agent alternatives across an offline partition and converges an explicit resolution', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-partition-'))
  let hub = service(join(root, 'hub'))
  const replicas = []
  try {
    await hub.start()
    const ports = { httpPort: hub.httpPort, wsPort: hub.wsPort }
    const settings = { hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` }
    for (let i = 0; i < 2; i++) {
      const replica = service(join(root, `replica-${i}`), settings)
      replicas.push(replica)
      await replica.start()
    }
    const created = await api(replicas[0], '/automerge/operations', { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Resolve together' } })
    const taskId = created.result.taskId
    await eventually(() => replicas.every(replica => !replica.store.status().syncPending && replica.store.workspace.handle.doc().tasks[taskId]))
    const before = await api(replicas[0], `/automerge/task/${taskId}/context`)
    await hub.stop()
    hub = null
    await eventually(() => replicas.every(replica => !replica.store.status().hubConnected))
    const operations = ['alice', 'builder'].map((actorId, i) => ({ operationId: randomUUID(), actorId, type: 'task.update',
      payload: { taskId, updates: { status: i ? 'review' : 'in-progress' }, expectedRevisions: { status: before.revisions.status } } }))
    const receipts = []
    for (let i = 0; i < 2; i++) {
      const receipt = await api(replicas[i], '/automerge/operations', operations[i])
      assert.equal(receipt.savedLocally, true)
      receipts.push(receipt)
      assert.equal(receipt.syncPending, true)
    }
    hub = service(join(root, 'hub'), ports)
    await hub.start()
    await eventually(() => replicas.every(replica => !replica.store.status().syncPending && replica.store.workspace.taskContext(taskId).conflicts.status?.length === 2))
    const conflicted = await api(replicas[1], `/automerge/task/${taskId}/context`)
    assert.deepEqual(conflicted.conflicts.status.map(choice => choice.actorId).sort(), ['alice', 'builder'])
    assert.deepEqual(conflicted.conflicts.status.map(choice => choice.operationId).sort(), receipts.map(receipt => receipt.operationId).sort())
    await api(replicas[1], '/automerge/operations', { operationId: randomUUID(), actorId: 'builder', type: 'task.resolve',
      payload: { taskId, field: 'status', value: 'review', expectedRevisions: conflicted.revisions.status } })
    await eventually(() => replicas.every(replica => !replica.store.status().syncPending && !replica.store.workspace.taskContext(taskId).conflicts.status))
    for (const replica of replicas) {
      const context = await api(replica, `/automerge/task/${taskId}/context`)
      assert.equal(context.task.status, 'review')
      for (const operation of operations) assert.equal(context.history.filter(event => event.requestId === operation.operationId).length, 1)
    }
  } finally {
    for (const replica of replicas) await replica.stop()
    await hub?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
