import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, realpath, rm, chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { ChannelLedger, startClaudeChannel } from '../lib/claude-channel-server.js'
import { ClaudeChannelAdapter, claudeChannelProvider, channelIdentity } from '../lib/claude-channel-adapter.js'
import { bridgeConfig, AgentBridge, BridgeSource, openBridgeInbox } from '../lib/agent-bridge.js'
import { bridgeProviders } from '../lib/bridge-providers.js'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { cli } from '../support/cli-resources.js'

const eventSchema = z.object({ method: z.literal('notifications/claude/channel'), params: z.object({
  content: z.string(), meta: z.record(z.string(), z.string()),
}) })

async function fixture(run) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pardner-channel-')))
  const mapping = { actorId: 'builder', adapter: 'claude-code-channel', enabled: true, sessionOwner: 'bridge',
    threadId: 'explicit-channel-binding', worktree: root, channelDirectory: join(root, 'channel'),
    expectedPolicy: { verification: 'unavailable', permissionHandling: 'local-only' },
    allowedTaskIds: ['task'], allowedFromActorIds: ['alice'], receiptTimeoutMs: 100 }
  const config = { workspaceId: 'workspace', replicaId: 'replica', dataDirectory: join(root, 'data'),
    inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
  const path = join(root, 'config.json')
  let channel, client
  const events = [], adapter = new ClaudeChannelAdapter(mapping)
  const start = async (initialize = true, served = mapping) => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    channel = await startClaudeChannel({ mapping: served, config, transport: serverTransport, cwd: root })
    client = new Client({ name: 'protocol-test-fixture', version: '1' }, { capabilities: {} })
    client.setNotificationHandler(eventSchema, message => { events.push(message.params) })
    if (initialize) await client.connect(clientTransport)
    return channel
  }
  const tool = async (name, id) => JSON.parse((await client.callTool({ name, arguments: { delivery_id: id } })).content[0].text)
  const delivery = (id = 'delivery', change = {}) => {
    const mention = { id, toActorId: 'builder', fromActorId: 'alice', taskId: 'task', ...change }
    return { id, mention, prompt: ['Full Unicode context: café 🐎.', JSON.stringify({ mention, context: { description: 'complete' } })].join('\n\n') }
  }
  try { await writeFile(path, JSON.stringify(config)); await run({ root, mapping, config, path, adapter, events, start, tool, delivery,
    stop: async () => { await channel?.close(); await client?.close() } }) }
  finally { adapter.close(); await channel?.close(); await client?.close(); await rm(root, { recursive: true, force: true }) }
}

it('validates explicit Claude channel authority and rejects native policy or cleanup claims', () => fixture(async ({ config, path, mapping }) => {
  assert.equal((await bridgeConfig(path)).mappings[0].adapter, 'claude-code-channel')
  assert.ok(bridgeProviders.create(mapping) instanceof ClaudeChannelAdapter)
  config.completionCleanup = { archiveDirectory: join(mapping.worktree, 'archive') }
  await writeFile(path, JSON.stringify(config))
  await assert.rejects(bridgeConfig(path), { code: 'UNSUPPORTED_BRIDGE_CLEANUP' })
  delete config.completionCleanup
  mapping.expectedPolicy = { approvalPolicy: 'never', sandbox: { type: 'dangerFullAccess' } }
  await writeFile(path, JSON.stringify(config)); await assert.rejects(bridgeConfig(path), /cannot attest/)
  mapping.expectedPolicy = { verification: 'unavailable', permissionHandling: 'local-only' }
  mapping.apiKey = 'not-a-real-key'; await assert.rejects(claudeChannelProvider.validateMapping(mapping), /do not accept/)
  delete mapping.apiKey
  mapping.channelDirectory = 'relative'; await assert.rejects(claudeChannelProvider.validateMapping(mapping), /absolute/)
}))

it('persists a cooperative receipt, preserves it after reopen, and rejects content or identity reuse', () => fixture(async ({ root, mapping, delivery }) => {
  const path = join(root, 'ledger.sqlite'), identity = channelIdentity(mapping), { prompt } = delivery()
  let ledger = new ChannelLedger(path, identity)
  const row = ledger.submit('delivery', prompt, 'task').row
  assert.equal(ledger.reconcile('delivery', prompt).receipt, null)
  assert.throws(() => ledger.complete('delivery'), /Accept/)
  const receipt = ledger.accept('delivery').receipt
  assert.equal(receipt, row.receipt); ledger.close()
  ledger = new ChannelLedger(path, identity)
  try {
    assert.equal(ledger.reconcile('delivery', prompt).receipt, receipt)
    assert.equal(ledger.reconcile('delivery', 'changed').receipt, null)
    assert.equal(ledger.submit('delivery', prompt, 'task').fresh, false)
    assert.throws(() => ledger.submit('delivery', 'changed', 'task'), { code: 'OPERATION_ID_REUSED' })
    assert.throws(() => ledger.submit('another', delivery('another').prompt, 'task'), { code: 'CHANNEL_BUSY' })
    ledger.complete('delivery'); assert.equal(ledger.pending().length, 0)
    ledger.submit('another', delivery('another').prompt, 'task')
  } finally { ledger.close() }
  assert.throws(() => new ChannelLedger(path, { ...identity, threadId: 'other' }), { code: 'CHANNEL_BINDING_CHANGED' })
}))

it('notification write without a model receipt stays uncertain and never resends across channel restart', () => fixture(async ({ mapping, adapter, events, start, stop, tool, delivery }) => {
  await start()
  const description = await adapter.describe(mapping)
  assert.equal(description.nativePolicyVerification, 'unavailable')
  assert.equal(description.capabilities.nativeTurnReceipt, false)
  assert.equal(await adapter.availability(mapping), 'ready')
  await assert.rejects(adapter.dispatch(mapping, delivery()), { code: 'CHANNEL_RECEIPT_UNCERTAIN' })
  assert.equal(events.length, 1); assert.equal(events[0].content, delivery().prompt)
  assert.equal(await adapter.reconcile(mapping, delivery()), null)
  assert.match(await adapter.availability(mapping), /outstanding/)
  await stop(); await start()
  assert.equal(events.length, 1); assert.equal(await adapter.reconcile(mapping, delivery()), null)
  const accepted = await tool('pardner_accept_delivery', 'delivery')
  assert.equal(await adapter.reconcile(mapping, delivery()), accepted.receipt)
  await tool('pardner_complete_delivery', 'delivery')
  assert.equal(await adapter.availability(mapping), 'ready')
  assert.equal(await adapter.dispatch(mapping, delivery()), accepted.receipt)
  assert.equal(events.length, 1)
}))

it('rejects Actor, task, sender, worktree and binding changes before any channel notification', () => fixture(async ({ root, mapping, adapter, start, events, delivery }) => {
  await start()
  for (const change of [{ toActorId: 'reviewer' }, { taskId: 'other' }, { fromActorId: 'bob' }]) {
    await assert.rejects(adapter.dispatch(mapping, delivery('delivery', change)), { code: 'DELIVERY_NOT_SUBMITTED', details: { channelCode: 'CHANNEL_SCOPE_DENIED' } })
  }
  await assert.rejects(adapter.dispatch(mapping, { ...delivery(), id: 'other' }), { code: 'INVALID_ARGUMENT' })
  await assert.rejects(adapter.describe({ ...mapping, threadId: 'other' }), { code: 'CHANNEL_BINDING_CHANGED' })
  const [client, server] = InMemoryTransport.createLinkedPair()
  const elsewhere = join(root, 'elsewhere'); await mkdir(elsewhere)
  await assert.rejects(startClaudeChannel({ mapping, config: {}, transport: server, cwd: elsewhere }), { code: 'WORKTREE_MISMATCH' })
  await client.close(); assert.equal(events.length, 0)
}))

it('reports only typed pre-notification rejections as not submitted; later or transport failures stay uncertain', () => fixture(async ({ mapping, adapter, events, start, stop, delivery }) => {
  const channel = await start()
  await assert.rejects(adapter.dispatch(mapping, delivery()), { code: 'CHANNEL_RECEIPT_UNCERTAIN' })
  await assert.rejects(adapter.dispatch(mapping, delivery('next')), { code: 'DELIVERY_NOT_SUBMITTED', details: { channelCode: 'CHANNEL_BUSY' } })
  await assert.rejects(adapter.dispatch(mapping, { ...delivery(), prompt: 'changed' }), { code: 'OPERATION_ID_REUSED' })
  channel.ledger.database.prepare("UPDATE deliveries SET state = 'completed'").run()
  channel.mcp.notification = async () => { throw new Error('Injected notification write failure') }
  await assert.rejects(adapter.dispatch(mapping, delivery('after-insert')), { code: 'CHANNEL_REQUEST_FAILED' })
  assert.equal(channel.ledger.get('after-insert').state, 'notified')
  assert.equal(events.length, 1)
  await stop()
  await assert.rejects(adapter.dispatch(mapping, delivery('later')), { code: 'ENOENT' })
}))

it('a stale channel scope leaves the bridge delivery queued with a visible reason and retries the same stored prompt', () => fixture(async ({ root, mapping, config, start, stop, events, tool }) => {
  const mention = { id: 'delivery', taskId: 'task', commentId: 'comment', toActorId: 'builder', fromActorId: 'alice' }
  const source = Object.assign(new EventEmitter(), { mentions: [mention], verify: async () => {}, watch: async () => {},
    pending: async () => ({ mentions: source.mentions }), claim: async () => ({ claimed: true, mention: source.mentions[0], claimToken: 'fixture' }),
    ack: async () => { source.mentions = [] }, context: async value => ({ mentions: [value], comments: [{ id: value.commentId }] }),
    actors: async () => ({ actors: { builder: { id: 'builder', handle: 'builder', kind: 'agent' }, alice: { id: 'alice', handle: 'alice', kind: 'human' } } }),
    close() {} })
  await mkdir(config.inboxDirectory, { recursive: true })
  const inbox = await openBridgeInbox(config)
  let bridge = new AgentBridge({ config, inbox, source })
  try {
    await start(true, { ...mapping, allowedTaskIds: ['stale-task'] })
    await bridge.start()
    const queued = inbox.rows()[0]
    assert.equal(queued.state, 'queued'); assert.match(queued.reason, /^blocked: .*scope/)
    assert.match(bridge.states.builder, /^blocked: .*scope/)
    assert.equal(events.length, 0)
    await bridge.stop(); await stop()
    await start()
    bridge = new AgentBridge({ config, inbox, source })
    const accepting = (async () => { while (!events.length) await new Promise(resolve => setTimeout(resolve, 5)); return tool('pardner_accept_delivery', 'delivery') })()
    await bridge.start()
    const { receipt } = await accepting
    assert.equal(events.length, 1); assert.equal(events[0].content, queued.prompt)
    assert.equal(inbox.rows()[0].state, 'accepted'); assert.equal(inbox.rows()[0].turn_id, receipt)
  } finally { await bridge.stop(); inbox.close() }
}))

it('owns one private socket server and rejects unsafe directory permissions', () => fixture(async ({ mapping, config, root, start, adapter }) => {
  await start()
  const [, transport] = InMemoryTransport.createLinkedPair()
  await assert.rejects(startClaudeChannel({ mapping, config, transport, cwd: root }), { code: 'STORAGE_IN_USE' })
  await chmod(mapping.channelDirectory, 0o755)
  await assert.rejects(adapter.describe(mapping), { code: 'CHANNEL_DIRECTORY_UNSAFE' })
  await chmod(mapping.channelDirectory, 0o700)
}))

it('blocks an uninitialized channel client and closes pending receipt polling promptly', () => fixture(async ({ mapping, adapter, start, stop, delivery }) => {
  await start(false)
  assert.match(await adapter.availability(mapping), /not initialized/)
  await assert.rejects(adapter.dispatch(mapping, delivery()), { code: 'DELIVERY_NOT_SUBMITTED', details: { channelCode: 'CHANNEL_UNAVAILABLE' } })
  await stop(); await start()
  const pending = adapter.dispatch(mapping, delivery())
  const rejected = assert.rejects(pending, { code: 'CHANNEL_CLOSED' })
  await new Promise(resolve => setTimeout(resolve, 20))
  adapter.close(); await rejected
}))

it('starts the actual stdio MCP entry point without signing in or launching Claude', () => fixture(async ({ path, root, mapping }) => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [new URL('../scripts/claude-channel.js', import.meta.url).pathname, path, 'builder'], cwd: root, stderr: 'pipe' })
  const client = new Client({ name: 'stdio-protocol-fixture', version: '1' }, { capabilities: {} })
  let diagnostics = ''
  transport.stderr?.on('data', chunk => { diagnostics += chunk })
  try {
    await client.connect(transport)
    assert.deepEqual(client.getServerCapabilities().experimental, { 'claude/channel': {} })
    assert.equal(Object.hasOwn(client.getServerCapabilities().experimental, 'claude/channel/permission'), false)
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['pardner_accept_delivery', 'pardner_complete_delivery'])
    const adapter = new ClaudeChannelAdapter(mapping)
    try { assert.equal((await adapter.describe(mapping)).availability, 'ready') } finally { adapter.close() }
  } catch (error) { throw new Error(`Stdio fixture failed: ${diagnostics}`, { cause: error }) }
  finally { await client.close() }
}))

it('routes a durable mention through the production channel and recovers receipt while a fixture replies through the public CLI', { timeout: 20000 }, () => withWorkspaceServer(async ({ directory, server, create, operation, context }) => fixture(async ({ root, mapping, config, start, events, tool, stop }) => {
  const taskId = await create({ description: 'Full real Pardner context', assignee: 'builder' })
  mapping.allowedTaskIds = [taskId]; mapping.receiptTimeoutMs = 100
  config.workspaceId = server.store.manifest.workspaceId; config.replicaId = server.store.manifest.replicaId
  config.dataDirectory = directory
  await writeFile(join(directory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${server.httpPort}`, token: 'test-token' }), { mode: 0o600 })
  await start()
  let inbox = await openBridgeInbox(config), bridge = new AgentBridge({ config, inbox, source: new BridgeSource(config) })
  try {
    await operation('comment.add', { taskId, text: '@builder review this task' })
    await bridge.start()
    assert.equal(events.length, 1); assert.equal(inbox.rows()[0].state, 'uncertain')
    assert.equal((await bridge.source.pending('builder')).mentions.length, 0)
    const id = inbox.rows()[0].id
    const parsed = JSON.parse(events[0].content.split('\n\n').at(-1))
    assert.equal(parsed.context.task.description, 'Full real Pardner context')
    const receipt = (await tool('pardner_accept_delivery', id)).receipt
    await bridge.stop(); inbox.close()
    inbox = await openBridgeInbox(config); bridge = new AgentBridge({ config, inbox, source: new BridgeSource(config) })
    await bridge.start()
    assert.equal(inbox.rows()[0].state, 'accepted'); assert.equal(inbox.rows()[0].turn_id, receipt); assert.equal(events.length, 1)
    const reply = await cli(directory, ['comment', taskId, 'Protocol fixture reply; no native Claude model ran.', '--actor', 'builder', '--operation-id', `fixture-reply-${id}`])
    assert.equal(reply.code, 0, reply.stderr); assert.equal(reply.result.savedLocally, true)
    assert.ok((await context(taskId)).comments.some(comment => comment.author === 'builder' || comment.actorId === 'builder'))
    await tool('pardner_complete_delivery', id)
    await bridge.wake(); assert.equal(events.length, 1)
  } finally { await bridge.stop(); inbox.close(); await stop() }
})))
