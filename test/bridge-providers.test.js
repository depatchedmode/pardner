import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BridgeProviders, bridgeProviders, codexBridgeProvider } from '../lib/bridge-providers.js'
import { AgentBridge, bridgeConfig, runBridgeCommand } from '../lib/agent-bridge.js'
import { CodexBridgeAdapter } from '../lib/codex-bridge-adapter.js'

it('shutdown waits for all owners even after one close fails, and repeated stops share completion', async () => {
  let finish, closed = 0
  const pending = new Promise(resolve => { finish = resolve })
  const source = Object.assign(new EventEmitter(), { close: () => pending })
  const adapter = Object.assign(new EventEmitter(), { close() { closed++; throw new Error('close failed') } })
  const states = []
  const bridge = new AgentBridge({ config: { mappings: [{ actorId: 'builder' }] },
    inbox: { status: (...value) => states.push(value) }, source, adapterFactory: () => adapter })
  const stopping = bridge.stop()
  assert.equal(bridge.stop(), stopping)
  let settled = false
  const result = assert.rejects(stopping, error => error instanceof AggregateError && error.errors[0].message === 'close failed')
    .then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, 1); assert.equal(settled, false); assert.deepEqual(states, [])
  finish(); await result
  assert.deepEqual(states, [['bridge', 'stopped']])
})

const policy = { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } }
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-provider-'))
  const mapping = { actorId: 'builder', enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge',
    endpoint: 'ws://127.0.0.1:9001', threadId: 'thread', worktree: await realpath(root), expectedPolicy: policy,
    allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }
  const config = { workspaceId: 'workspace', replicaId: 'replica', dataDirectory: join(root, 'data'), inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
  const path = join(root, 'config.json')
  const save = () => writeFile(path, JSON.stringify(config))
  try { await save(); await run({ root, path, mapping, config, save }) }
  finally { await rm(root, { recursive: true, force: true }) }
}

it('normalizes legacy Codex mappings identically and selects the real Codex factory', () => fixture(async ({ path, mapping }) => {
  const config = await bridgeConfig(path)
  assert.deepEqual(config.mappings[0], { ...mapping, endpoint: `${mapping.endpoint}/` })
  const adapter = bridgeProviders.create(config.mappings[0])
  try { assert.ok(adapter instanceof CodexBridgeAdapter) }
  finally { adapter.close() }
}))

it('rejects unknown providers, legacy policy changes, nonlocal endpoints, and duplicate sessions before connection', () => fixture(async ({ path, mapping, config, save }) => {
  const original = structuredClone(mapping)
  for (const change of [
    value => { value.adapter = 'unimplemented' },
    value => { value.sessionOwner = 'desktop' },
    value => { delete value.expectedPolicy.sandbox },
    value => { value.endpoint = 'ws://example.com' },
  ]) {
    config.mappings = [structuredClone(original)]; change(config.mappings[0]); await save()
    await assert.rejects(bridgeConfig(path))
  }
  config.mappings = [original, { ...original, actorId: 'reviewer' }]; await save()
  await assert.rejects(bridgeConfig(path), /session only once/)
}))

it('default, explicit, and config-based inspection use the registry and close on success or failure', () => fixture(async ({ path, mapping }) => {
  let calls = 0, closes = 0, fail = false
  const providers = new BridgeProviders([{ ...codexBridgeProvider, create: () => ({
    async describe(target) { calls++; assert.equal(target.threadId, mapping.threadId); if (fail) throw new Error('inspection failed'); return { inspected: true } },
    close() { closes++ },
  }) }])
  const flags = { endpoint: mapping.endpoint, session: mapping.threadId, worktree: mapping.worktree }
  assert.deepEqual(await runBridgeCommand('inspect', flags, { providers }), { inspected: true })
  await runBridgeCommand('inspect', { ...flags, adapter: 'codex-app-server' }, { providers })
  await runBridgeCommand('inspect', { config: path, actor: 'builder' }, { providers })
  fail = true
  await assert.rejects(runBridgeCommand('inspect', flags, { providers }), /inspection failed/)
  assert.equal(calls, 4); assert.equal(closes, 4)
  await assert.rejects(runBridgeCommand('inspect', { ...flags, adapter: 'unknown' }, { providers }), { code: 'UNSUPPORTED_BRIDGE_ADAPTER' })
  await assert.rejects(runBridgeCommand('inspect', { config: path, actor: 'builder', adapter: 'unknown' }, { providers }), /differs/)
  assert.equal(calls, 4)
}))

it('cleanup is available only when the selected implementation declares support', () => fixture(async ({ path, mapping, config, save }) => {
  config.completionCleanup = { archiveDirectory: join(mapping.worktree, 'archive') }; await save()
  const providers = new BridgeProviders([{ ...codexBridgeProvider, capabilities: { completionCleanup: false } }])
  await assert.rejects(bridgeConfig(path, { providers }), { code: 'UNSUPPORTED_BRIDGE_CLEANUP' })
}))

it('provider connection identity blocks both queued and uncertain work before any harness call', async () => {
  const mapping = { actorId: 'builder', adapter: 'test-harness', sessionOwner: 'bridge', threadId: 'thread',
    worktree: '/tmp', expectedPolicy: {}, connectionName: 'old', enabled: true, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }
  const calls = []
  const harness = Object.assign(new EventEmitter(), { close() {},
    availability: async () => { calls.push('availability'); return 'ready' },
    reconcile: async () => { calls.push('reconcile'); return 'turn' },
    dispatch: async () => { calls.push('dispatch'); return 'turn' },
  })
  const providers = new BridgeProviders([{ id: 'test-harness', validateMapping() {},
    connectionIdentity: value => ({ connectionName: value.connectionName }), create: () => harness, inspectionMapping: () => mapping }])
  const row = { id: 'delivery', state: 'queued', mapping: structuredClone(mapping), mention: { taskId: 'task', fromActorId: 'alice' } }
  const inbox = { rows: () => [row], reason: (_id, reason) => { row.reason = reason } }
  const bridge = new AgentBridge({ config: { mappings: [mapping] }, inbox, source: {}, providers })
  mapping.connectionName = 'new'
  await bridge.dispatch(mapping)
  assert.match(row.reason, /mapping changed/)
  row.state = 'uncertain'
  await assert.rejects(bridge.dispatch(mapping), { code: 'MAPPING_CHANGED' })
  assert.deepEqual(calls, [])
})

it('provider registration requires unique IDs and a complete contract', () => {
  assert.throws(() => new BridgeProviders([codexBridgeProvider, codexBridgeProvider]), /unique/)
  assert.throws(() => new BridgeProviders([{ ...codexBridgeProvider, create: undefined }]), /requires create/)
})
