import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { AgentBridge, BridgeSource, bridgeConfig, openBridgeInbox, runBridgeCommand } from '../lib/agent-bridge.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { withWorkspaceServer } from '../support/workspace-test.js'

async function eventually(check, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'Bridge did not reach the expected state')
    await delay(10)
  }
}

for (const mode of ['co-worktree', 'co-host', 'replica']) {
  it(`dispatches a real handoff through the local subscription in ${mode} topology`, { timeout: 15000 }, () => withWorkspaceServer(async ({ server, directory, create, context, operation }) => {
    const root = await mkdtemp(join(tmpdir(), 'pardner-bridge-integration-'))
    let replica, bridge, inbox
    try {
      let local = server, dataDirectory = directory
      if (mode === 'replica') {
        dataDirectory = join(root, 'replica')
        replica = new AutomergeSyncServer({ directory: dataDirectory, role: 'replica',
          hubUrl: `http://127.0.0.1:${server.httpPort}`, hubWsUrl: `ws://127.0.0.1:${server.wsPort}/automerge`,
          hubToken: 'test-token', apiToken: 'test-token', env: {}, httpPort: 0, wsPort: 0, logger: {} })
        await replica.start(); local = replica
      }
      await writeFile(join(dataDirectory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${local.httpPort}`, token: 'test-token' }), { mode: 0o600 })
      const taskId = await create()
      const worktree = mode === 'co-worktree' ? root : join(root, 'agent-worktree')
      await mkdir(worktree, { recursive: true })
      const config = { workspaceId: local.store.manifest.workspaceId, replicaId: local.store.manifest.replicaId,
        dataDirectory, inboxDirectory: join(root, 'bridge'), mappings: [{
          actorId: 'builder', enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge',
          expectedPolicy: { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } },
          endpoint: 'ws://127.0.0.1:9001', threadId: 'dedicated-thread', worktree: await realpath(worktree),
          allowedTaskIds: [taskId], allowedFromActorIds: ['alice'],
        }] }
      inbox = await openBridgeInbox(config)
      const harness = new EventEmitter()
      const calls = []
      harness.availability = async () => 'ready'
      harness.dispatch = async (mapping, prompt) => { calls.push({ mapping, prompt }); return `turn-${calls.length}` }
      harness.reconcile = async () => null
      harness.close = () => {}
      const source = new BridgeSource(config)
      // The long fallback interval establishes that notifications drive healthy dispatch.
      bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => harness, retryMs: 60000 })
      await bridge.start()
      await eventually(() => source.socket?.readyState === 1)
      const { revisions } = await context(taskId)
      const began = performance.now()
      const result = await operation('task.handoff', { taskId, to: 'builder', status: 'in-progress', message: 'Review the bounded task',
        expectedRevisions: { assignee: revisions.assignee, status: revisions.status } })
      assert.equal(result.success, true)
      await eventually(() => calls.length === 1, 2000)
      assert.ok(performance.now() - began < 2000)
      assert.equal(inbox.rows()[0].state, 'accepted')
      assert.equal(calls[0].mapping.worktree, await realpath(worktree))
      assert.ok(calls[0].prompt.includes('Review the bounded task'))
      assert.equal((await source.pending('builder')).mentions.length, 0)
      server.broadcastDocumentUpdate(); server.broadcastDocumentUpdate()
      await bridge.wake()
      assert.equal(calls.length, 1)
      await bridge.stop()
      bridge = new AgentBridge({ config, inbox, source: new BridgeSource(config), adapterFactory: () => harness })
      await bridge.start()
      assert.equal(calls.length, 1)
    } finally {
      await bridge?.stop(); inbox?.close(); await replica?.stop()
      await rm(root, { recursive: true, force: true })
    }
  }))
}

it('configuration and CLI status require explicit authority, and reconciliation respects the process lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-bridge-config-'))
  let inbox, lease
  try {
    const config = { workspaceId: 'workspace', replicaId: 'replica', dataDirectory: join(root, 'data'), inboxDirectory: join(root, 'bridge'),
      mappings: [{ actorId: 'builder', enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge',
        expectedPolicy: { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } },
        endpoint: 'ws://127.0.0.1:9001', threadId: 'thread', worktree: root, allowedTaskIds: ['task-one'], allowedFromActorIds: ['alice'] }] }
    const path = join(root, 'config.json')
    await writeFile(path, JSON.stringify(config))
    assert.equal((await bridgeConfig(path)).mappings[0].worktree, await realpath(root))
    inbox = await openBridgeInbox(config)
    lease = await acquireStorageLease(config.inboxDirectory)
    const status = await runBridgeCommand('status', { config: path })
    assert.deepEqual(status.deliveries, [])
    await assert.rejects(runBridgeCommand('reconcile', { config: path }), { code: 'STORAGE_IN_USE' })
    for (const modify of [
      c => { c.mappings[0].sessionOwner = 'desktop' },
      c => { c.mappings[0].enabled = undefined },
      c => { c.mappings[0].allowedTaskIds = ['*'] },
      c => { c.mappings[0].endpoint = 'ws://remote.example' },
      c => { c.mappings.push({ ...c.mappings[0], actorId: 'reviewer' }) },
    ]) {
      const invalid = structuredClone(config); modify(invalid)
      await writeFile(path, JSON.stringify(invalid))
      await assert.rejects(bridgeConfig(path))
    }
    await assert.rejects(openBridgeInbox({ ...config, replicaId: 'other' }), { code: 'WORKSPACE_MISMATCH' })
  } finally { lease?.close(); inbox?.close(); await rm(root, { recursive: true, force: true }) }
})

it('a task missing from the local replica does not starve later context and dispatches once after sync', { timeout: 15000 }, () => withWorkspaceServer(async ({ server, create, context, operation }) => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-bridge-context-'))
  let replica, bridge, inbox
  try {
    const second = await create()
    await operation('comment.add', { taskId: second, text: '@builder complete local context' })
    const secondMention = (await context(second)).mentions[0]
    const dataDirectory = join(root, 'replica')
    replica = new AutomergeSyncServer({ directory: dataDirectory, role: 'replica',
      hubUrl: `http://127.0.0.1:${server.httpPort}`, hubWsUrl: `ws://127.0.0.1:${server.wsPort}/automerge`,
      hubToken: 'test-token', apiToken: 'test-token', env: {}, httpPort: 0, wsPort: 0, logger: {} })
    await replica.start()
    replica.store.adapter.disconnect()
    await writeFile(join(dataDirectory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${replica.httpPort}`, token: 'test-token' }))
    const first = await create()
    await operation('comment.add', { taskId: first, text: '@builder context still on the hub' })
    const firstMention = (await context(first)).mentions[0]
    const mapping = { actorId: 'builder', enabled: true, adapter: 'codex-app-server', worktree: root, threadId: 'thread',
      allowedTaskIds: [first, second], allowedFromActorIds: ['alice'] }
    const config = { workspaceId: replica.store.manifest.workspaceId, replicaId: replica.store.manifest.replicaId,
      dataDirectory, inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
    inbox = await openBridgeInbox(config)
    const source = new BridgeSource(config), harness = new EventEmitter(), calls = []
    Object.assign(harness, { availability: async () => 'ready', reconcile: async () => null, close() {},
      dispatch: async (_mapping, prompt) => { calls.push(JSON.parse(prompt.split('\n\n').at(-1)).mention.id); return `turn-${calls.length}` } })
    bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => harness })
    // The hub can deliver a receipt before its task reaches the local replica.
    inbox.receive('builder', { mention: firstMention }, mapping)
    assert.equal((await source.actors()).tasks[first], undefined)
    await assert.rejects(source.context(firstMention), { status: 404, code: 'NOT_FOUND' })
    inbox.receive('builder', { mention: secondMention }, mapping)
    assert.deepEqual(inbox.rows().map(row => row.id), [firstMention.id, secondMention.id])
    await bridge.dispatch(mapping)
    assert.deepEqual(calls, [secondMention.id])
    const waiting = inbox.rows().find(row => row.id === firstMention.id)
    assert.equal(waiting.state, 'queued')
    assert.equal(waiting.reason, 'waiting: originating context has not arrived or the mention was withdrawn')
    await bridge.dispatch(mapping)
    assert.deepEqual(calls, [secondMention.id])
    const adapter = replica.store.adapter
    adapter.connect(adapter.peerId, adapter.peerMetadata)
    await eventually(async () => (await source.actors()).tasks[first])
    await bridge.dispatch(mapping); await bridge.dispatch(mapping)
    assert.deepEqual(calls, [secondMention.id, firstMention.id])
    assert.ok(inbox.rows().every(row => row.state === 'accepted'))
  } finally {
    await bridge?.stop(); inbox?.close(); await replica?.stop()
    await rm(root, { recursive: true, force: true })
  }
}))
