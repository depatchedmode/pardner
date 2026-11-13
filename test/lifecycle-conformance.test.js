/**
 * Implementation checks for the lifecycle model in formal/lifecycle: each test
 * drives the real runtime or sync server through a scenario the model covers and
 * observes the concrete boundary the model abstracts (persistence barrier,
 * storage ownership, acknowledgement guards). See docs/PARDNER-LIFECYCLE-MODEL.md.
 */
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { getHeads } from '@automerge/automerge'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { agentNameRecord } from '../lib/enrollment.js'
import { testGenesis } from '../support/genesis.js'

const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]
const token = 'lifecycle-test-token'
const hubRuntime = directory => new WorkspaceRuntime({ directory, role: 'hub', actors })

async function eventually(check, what) {
  const deadline = Date.now() + 5000
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${what}`)
    await delay(20)
  }
}

/** Observe the persistence barrier: hold writes behind a gate and record storage ownership at entry and exit. */
function instrumentStorage(runtime) {
  const repo = runtime.repo
  const original = repo.saveDocument
  const writes = []
  let gate = null
  let failNext = false
  const open = () => !runtime.closed && Boolean(runtime.lease)
  repo.saveDocument = async (...args) => {
    const entry = { enteredOpen: open(), exitedOpen: null, failed: false }
    writes.push(entry)
    if (gate) await gate.promise
    if (failNext) { failNext = false; entry.failed = true; throw Object.assign(new Error('disk failure'), { code: 'EIO' }) }
    const result = await original(...args)
    entry.exitedOpen = open()
    return result
  }
  return {
    writes,
    hold() { gate = Promise.withResolvers(); return () => { gate?.resolve(); gate = null } },
    failOnce() { failNext = true },
  }
}

async function settled(promise, ms = 300) {
  return Promise.race([promise.then(() => 'resolved', () => 'rejected'), delay(ms, 'pending')])
}

it('returns a local-save receipt only after the storage barrier completes, and no receipt when it fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-receipt-'))
  const runtime = hubRuntime(join(root, 'hub'))
  let release
  try {
    await runtime.init()
    const storage = instrumentStorage(runtime)
    release = storage.hold()
    const receipt = runtime.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Behind the barrier' } })
    assert.equal(await settled(receipt), 'pending', 'the receipt must wait for the storage barrier')
    release()
    const result = await receipt
    assert.equal(result.savedLocally, true)
    assert.deepEqual(result.heads, getHeads(runtime.workspace.handle.doc()))
    assert.deepEqual(runtime.repo.persistedHeads.get(runtime.workspace.handle.documentId), result.heads)

    storage.failOnce()
    await assert.rejects(
      runtime.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Lost write' } }),
      { code: 'STORAGE_FAILED' })
    assert.deepEqual(runtime.repo.persistedHeads.get(runtime.workspace.handle.documentId), result.heads, 'persisted heads must not advance past a failed barrier')
    assert.equal(storage.writes.at(-1).failed, true)
  } finally {
    release?.()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('answers the record gate only after the storage barrier completes, and not when it fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-gate-'))
  const key = generateMachineKey(), genesis = testGenesis(key)
  const runtime = new WorkspaceRuntime({ directory: join(root, 'hub'), role: 'hub', actors, genesis })
  let release
  try {
    await runtime.init()
    const storage = instrumentStorage(runtime)
    release = storage.hold()
    const record = agentNameRecord(key, genesis.projectId, genesis.subject, { harnessId: 'openai-codex', name: 'Gated' })
    const answer = runtime.addRecords([record])
    assert.equal(await settled(answer), 'pending', 'the gate must wait for the storage barrier')
    release()
    const result = await answer
    assert.deepEqual(result.recordIds, [record.recordId])
    assert.deepEqual(runtime.repo.persistedHeads.get(runtime.workspace.handle.documentId), getHeads(runtime.workspace.handle.doc()))
    const heads = getHeads(runtime.workspace.handle.doc())

    storage.failOnce()
    const next = agentNameRecord(key, genesis.projectId, genesis.subject, { harnessId: 'cursor', name: 'Unconfirmed' })
    await assert.rejects(runtime.addRecords([next]), { code: 'STORAGE_FAILED' })
    assert.deepEqual(runtime.repo.persistedHeads.get(runtime.workspace.handle.documentId), heads, 'persisted heads must not advance past a failed barrier')
  } finally {
    release?.()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('acknowledges heads only after the hub persisted them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-ack-'))
  const runtime = hubRuntime(join(root, 'hub'))
  let release
  try {
    await runtime.init()
    const handle = runtime.workspace.handle
    // A change that arrived over sync is persisted only by a throttled background save.
    handle.change(doc => { doc.name = 'Synced from a replica' })
    const heads = getHeads(handle.doc())
    const storage = instrumentStorage(runtime)
    release = storage.hold()
    const acknowledging = runtime.acknowledge(runtime.manifest.workspaceId, heads)
    assert.equal(await settled(acknowledging), 'pending', 'the acknowledgement must wait for the persistence barrier')
    release()
    const receipt = await acknowledging
    assert.equal(receipt.acknowledged, true)
    assert.deepEqual(receipt.acknowledgedHeads, heads)
    assert.deepEqual(receipt.hubHeads, heads)
    assert.deepEqual(runtime.repo.persistedHeads.get(handle.documentId), heads)
  } finally {
    release?.()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('does not acknowledge heads the hub does not hold', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-unknown-'))
  const runtime = hubRuntime(join(root, 'hub'))
  try {
    await runtime.init()
    const receipt = await runtime.acknowledge(runtime.manifest.workspaceId, ['f'.repeat(64)])
    assert.equal(receipt.acknowledged, false)
    assert.equal(receipt.acknowledgedHeads, undefined)
    assert.equal(receipt.hubHeads, undefined)
  } finally {
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps storage open until an acknowledgement admitted before stop() has been persisted', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-stop-'))
  const hub = new AutomergeSyncServer({ store: hubRuntime(join(root, 'hub')), env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {} })
  let socket, stopping, release
  try {
    await hub.start()
    const storage = instrumentStorage(hub.store)
    const entered = Promise.withResolvers()
    const gate = Promise.withResolvers()
    release = gate.resolve
    const acknowledge = hub.store.acknowledge.bind(hub.store)
    hub.store.acknowledge = async (...args) => { entered.resolve(); await gate.promise; return acknowledge(...args) }
    socket = connect(hub.httpPort, '127.0.0.1')
    socket.setTimeout(5000, () => socket.destroy(new Error('shutdown response timed out')))
    let response = ''
    socket.on('data', chunk => { response += chunk })
    const closed = once(socket, 'close')
    await once(socket, 'connect')
    const body = JSON.stringify({ workspaceId: hub.store.manifest.workspaceId, heads: [] })
    socket.write(`POST /automerge/sync-ack HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    await entered.promise
    stopping = hub.stop()
    // Give a defective stop() time to close the store before the admitted request uses it.
    await delay(300)
    hub.store.workspace.handle.change(doc => { doc.name = 'Changed while draining' })
    const before = storage.writes.length
    release()
    await stopping
    await closed
    assert.deepEqual([...response.matchAll(/HTTP\/1\.1 (\d+)/g)].map(match => match[1]), ['200'])
    assert.match(response, /"acknowledged":true/)
    assert.ok(storage.writes.length > before, 'the acknowledgement must flush storage')
    for (const write of storage.writes.slice(before)) {
      assert.equal(write.enteredOpen, true, 'storage must still be owned when the admitted acknowledgement starts writing')
      assert.equal(write.exitedOpen, true, 'storage must still be owned when the admitted acknowledgement finishes writing')
    }
    assert.equal(hub.store.closed, true)
  } finally {
    release?.()
    socket?.destroy()
    await (stopping ?? hub.stop())
    await rm(root, { recursive: true, force: true })
  }
})

it('drains queued persistence before releasing the storage lease', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-lifecycle-drain-'))
  const directory = join(root, 'hub')
  const runtime = hubRuntime(directory)
  let release
  try {
    await runtime.init()
    const storage = instrumentStorage(runtime)
    release = storage.hold()
    runtime.workspace.handle.change(doc => { doc.name = 'Queued save' })
    await eventually(() => storage.writes.length === 1, 'the throttled background save to start')
    const closing = runtime.close()
    assert.equal(await settled(closing, 200), 'pending', 'close() must wait for the queued save')
    release()
    await closing
    assert.equal(storage.writes[0].exitedOpen, true, 'the lease must stay held until the queued save completes')
    assert.equal(runtime.closed, true)
    assert.equal(runtime.lease, null)
    const reopened = hubRuntime(directory)
    try {
      await reopened.init()
      assert.equal(reopened.workspace.handle.doc().name, 'Queued save')
    } finally {
      await reopened.close()
    }
  } finally {
    release?.()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
})
