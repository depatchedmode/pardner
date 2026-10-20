import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { ChannelLedger, startClaudeChannel } from '../lib/claude-channel-server.js'
import { channelIdentity, ClaudeChannelAdapter } from '../lib/claude-channel-adapter.js'
import { runClaudeDisposition } from '../lib/claude-channel-disposition.js'
import { AgentBridge, bridgeConfig, runBridgeCommand, openBridgeInbox } from '../lib/agent-bridge.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { bridgeProviders } from '../lib/bridge-providers.js'
import { cli } from '../support/cli-resources.js'
import { eventually } from '../support/bridge-rehearsal.js'

const eventSchema = z.object({ method: z.literal('notifications/claude/channel'),
  params: z.object({ content: z.string(), meta: z.record(z.string(), z.string()) }) })

async function fixture(run) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pardner-disposition-')))
  const mapping = { actorId: 'builder', adapter: 'claude-code-channel', enabled: true, sessionOwner: 'bridge',
    threadId: 'fixture-binding', worktree: root, channelDirectory: join(root, 'channel'),
    expectedPolicy: { verification: 'unavailable', permissionHandling: 'local-only' },
    allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }
  const config = { workspaceId: 'workspace', replicaId: 'replica', dataDirectory: join(root, 'data'),
    inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
  const path = join(root, 'bridge.json')
  const ledgers = []
  const inbox = await openBridgeInbox(config)
  const openLedger = async (route = mapping) => {
    await mkdir(route.channelDirectory, { recursive: true, mode: 0o700 })
    const ledger = new ChannelLedger(join(route.channelDirectory, 'deliveries.sqlite'), {
      ...channelIdentity(route), workspaceId: config.workspaceId, replicaId: config.replicaId, dataDirectory: config.dataDirectory })
    ledgers.push(ledger); return ledger
  }
  const ledger = await openLedger()
  const seed = (id, state = 'uncertain', route = mapping, store = ledger) => {
    const mention = { id, taskId: 'task', commentId: `${id}-comment`, toActorId: route.actorId, fromActorId: 'alice' }
    const prompt = ['Full durable fixture café 🐎', JSON.stringify({ mention, context: { description: 'complete task' } })].join('\n\n')
    inbox.receive(route.actorId, { mention, claimToken: 'fixture', claimExpiresAt: Date.now() + 30000 }, route)
    inbox.clearClaim(route.actorId); inbox.begin(id, prompt)
    store.submit(id, prompt, 'task')
    if (state === 'accepted') inbox.accept(id, store.accept(id).receipt)
    else if (state !== 'dispatching') inbox.uncertain(id)
    return { prompt, inbox: inbox.rows().find(value => value.id === id), channel: store.get(id) }
  }
  const inspect = (id = 'delivery', actor = 'builder') => runBridgeCommand('disposition', { config: path, delivery: id, actor })
  // Throwing from the step hook stops the command between durable commits, as a process exit would.
  const dispose = async (flags, crashAfter) => runClaudeDisposition('dispose', flags, await bridgeConfig(path), bridgeProviders,
    { step: name => { if (name === crashAfter) throw new Error(`injected crash after ${name}`) } })
  const options = (revision, changes = {}) => ({ config: path, actor: 'builder', delivery: 'delivery', decision: 'abandon',
    'expected-revision': revision, 'operation-id': 'operator-decision', evidence: 'Fixture client and all effects stopped; no execution outcome inferred.',
    'confirm-client-stopped': true, ...changes })
  try {
    await writeFile(path, JSON.stringify(config))
    await run({ root, mapping, config, path, inbox, ledger, seed, inspect, dispose, options, openLedger })
  } finally { inbox.close(); for (const ledger of ledgers) ledger.close(); await rm(root, { recursive: true, force: true }) }
}

class LifecycleSource extends EventEmitter {
  constructor(mentions) { super(); this.mentions = mentions; this.acks = [] }
  async verify() {}
  async watch() {}
  async pending(actor) { return { mentions: this.mentions.filter(mention => mention.toActorId === actor) } }
  async claim(actor) { return { claimed: true, mention: this.mentions.find(mention => mention.toActorId === actor), claimToken: 'restart-fixture' } }
  async ack(_actor, receipt) {
    this.acks.push(receipt.mention.id)
    this.mentions = this.mentions.filter(mention => mention.id !== receipt.mention.id)
  }
  async actors() { return { actors: { builder: { id: 'builder', handle: 'builder', kind: 'agent' },
    reviewer: { id: 'reviewer', handle: 'reviewer', kind: 'agent' }, alice: { id: 'alice', handle: 'alice', kind: 'human' } } } }
  async context(mention) { return { task: { title: 'Separately authorized work' }, mentions: [mention], comments: [{ id: mention.commentId }] } }
  close() {}
}

// A cooperative fixture client that accepts every channel notification it receives.
async function serve(s, route) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = await startClaudeChannel({ mapping: route, config: s.config, cwd: s.root, transport: serverTransport })
  const client = new Client({ name: 'disposition-fixture', version: '1' }, { capabilities: {} })
  const events = []
  client.setNotificationHandler(eventSchema, async message => {
    events.push(message.params)
    await client.callTool({ name: 'pardner_accept_delivery', arguments: { delivery_id: message.params.meta.delivery_id } })
  })
  await client.connect(clientTransport)
  return { server, events, close: async () => { await client.close(); await server.close() } }
}

async function runningBridge(s, mentions, run) {
  const lease = await acquireStorageLease(s.config.inboxDirectory)
  const inbox = await openBridgeInbox(s.config)
  const source = new LifecycleSource(mentions)
  const channels = {}
  const bridge = new AgentBridge({ config: s.config, inbox, source })
  try {
    for (const route of s.config.mappings) channels[route.actorId] = await serve(s, route)
    await bridge.start()
    await run({ bridge, inbox, source, channels })
  } finally {
    try { await bridge.stop() }
    finally {
      inbox.close(); lease.close()
      for (const channel of Object.values(channels)) await channel.close()
    }
  }
}

const later = { id: 'separate-delivery', taskId: 'task', commentId: 'separate-comment', toActorId: 'builder', fromActorId: 'alice' }
const abandonedReason = flags => `Operator abandonment; execution outcome remains uncertain: ${flags.evidence}`

it('public offline abandonment tombstones both stores, keeps decision-time evidence and never resurrects receipt or execution', () => fixture(async s => {
  const before = s.seed('delivery')
  const preview = await cli(s.root, ['bridge', 'disposition', '--config', s.path, '--actor', 'builder', '--delivery', 'delivery'])
  assert.equal(preview.code, 0, preview.stderr)
  assert.equal(preview.result.cooperativeReceipt, null); assert.equal(preview.result.disposition, null)
  const argumentsFor = confirmation => ['bridge', 'dispose', '--config', s.path, '--actor', 'builder', '--delivery', 'delivery',
    '--decision', 'abandon', '--expected-revision', preview.result.revision, '--operation-id', 'operator-decision',
    '--evidence', 'Fixture effects quiesced; outcome unknown.', ...confirmation]
  assert.notEqual((await cli(s.root, argumentsFor([]))).code, 0)
  assert.equal(s.ledger.get('delivery').state, 'notified')
  const result = await cli(s.root, argumentsFor(['--confirm-client-stopped']))
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(result.result, { success: true, disposed: true, delivery: 'delivery', decision: 'abandon', operationId: 'operator-decision',
    disposition: 'finalized', executionOutcome: 'unverified' })
  assert.deepEqual((await cli(s.root, argumentsFor(['--confirm-client-stopped']))).result, result.result)
  assert.equal(s.inbox.rows()[0].state, 'abandoned'); assert.equal(s.inbox.rows()[0].prompt, before.prompt)
  const saved = s.inbox.dispositionFor('delivery')
  assert.equal(saved.state, 'finalized')
  assert.deepEqual(saved.prior.inbox, { id: 'delivery', actor: 'builder', state: 'uncertain', reason: before.inbox.reason,
    turnId: null, prompt: preview.result.promptDigest })
  assert.deepEqual(saved.prior.channel, { state: 'notified', receipt: null, taskId: 'task', prompt: preview.result.promptDigest })
  const inspected = await s.inspect()
  assert.equal(inspected.inboxState, 'abandoned'); assert.equal(inspected.channelState, 'abandoned')
  assert.equal(inspected.disposition.state, 'finalized'); assert.match(inspected.executionOutcome, /^unverified/)
  const reopened = await s.openLedger()
  assert.equal(reopened.pending().length, 0)
  assert.equal(reopened.get('delivery').prompt, before.prompt)
  assert.equal(reopened.receipt('delivery').receipt, null)
  assert.equal(reopened.reconcile('delivery', before.prompt).receipt, null)
  for (const action of [() => reopened.accept('delivery'), () => reopened.complete('delivery'),
    () => reopened.submit('delivery', before.prompt, 'task')]) assert.throws(action, { code: 'CHANNEL_DELIVERY_ABANDONED' })
  assert.throws(() => s.inbox.accept('delivery', 'invented'), { code: 'INVALID_BRIDGE_STATE' })
  assert.throws(() => s.inbox.uncertain('delivery'), { code: 'INVALID_BRIDGE_STATE' })
  assert.throws(() => s.inbox.resolve('delivery', 'accepted', 'No inference', 'invented'), { code: 'INVALID_BRIDGE_STATE' })
  reopened.submit('later', 'A separate authorized delivery', 'task')
  assert.equal(reopened.pending().length, 1)
}))

for (const state of ['uncertain', 'dispatching', 'accepted']) {
  for (const crashAfter of ['recorded', 'abandoned']) {
    it(`a crash after the ${crashAfter} commit of ${state} work keeps the Actor barrier and the same operation ID finishes it`, () => fixture(async s => {
      const before = s.seed('delivery', state)
      const flags = s.options((await s.inspect()).revision)
      await assert.rejects(s.dispose(flags, crashAfter), /injected crash/)
      assert.equal(s.inbox.dispositionFor('delivery').state, 'pending')
      assert.deepEqual(s.inbox.rows()[0], before.inbox)
      assert.equal(s.ledger.get('delivery').state, crashAfter === 'recorded' ? before.channel.state : 'abandoned')
      s.inbox.recover()
      assert.deepEqual(s.inbox.rows()[0], before.inbox)
      for (const mutate of [() => s.inbox.begin('delivery', before.prompt), () => s.inbox.uncertain('delivery'),
        () => s.inbox.accept('delivery', 'invented'), () => s.inbox.reason('delivery', 'changed'),
        () => s.inbox.resolve('delivery', 'accepted', 'changed', 'invented')]) assert.throws(mutate, { code: 'INVALID_BRIDGE_STATE' })
      const pending = await s.inspect()
      assert.equal(pending.disposition.state, 'pending')
      assert.deepEqual(pending.disposition.request.expectedRevision, flags['expected-revision'])
      assert.match(pending.requires, /--operation-id operator-decision/)
      const result = await s.dispose(flags)
      assert.equal(result.disposition, 'finalized')
      assert.equal(s.inbox.rows()[0].state, 'abandoned'); assert.equal(s.inbox.rows()[0].reason, abandonedReason(flags))
      assert.equal(s.ledger.get('delivery').state, 'abandoned')
      assert.equal(s.inbox.dispositionFor('delivery').prior.inbox.state, state)
      assert.equal(s.inbox.pendingDispositions('builder').length, 0)
      assert.deepEqual(await s.dispose(flags), result)
    }))
  }
}

it('Claude accepting between the pending record and the ledger abandon does not stale the same-ID retry', () => fixture(async s => {
  s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  await assert.rejects(s.dispose(flags, 'recorded'), /injected crash/)
  const receipt = s.ledger.accept('delivery').receipt
  const fresh = await s.inspect()
  assert.notEqual(fresh.revision, flags['expected-revision']); assert.equal(fresh.cooperativeReceipt, receipt)
  await assert.rejects(s.dispose({ ...flags, 'expected-revision': fresh.revision }), { code: 'OPERATION_ID_REUSED' })
  await assert.rejects(s.dispose({ ...flags, 'expected-revision': fresh.revision, 'operation-id': 'second-decision' }), { code: 'INVALID_BRIDGE_STATE' })
  assert.equal((await s.dispose(flags)).disposition, 'finalized')
  assert.equal(s.ledger.get('delivery').state, 'abandoned'); assert.equal(s.ledger.receipt('delivery').receipt, null)
  assert.equal(s.inbox.dispositionFor('delivery').prior.channel.state, 'notified')
}))

it('a delivery Claude completed before the retry is withdrawn, leaves the inbox untouched and blocks nothing', () => fixture(async s => {
  const before = s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  await assert.rejects(s.dispose(flags, 'recorded'), /injected crash/)
  const receipt = s.ledger.accept('delivery').receipt
  s.ledger.complete('delivery')
  const result = await s.dispose(flags)
  assert.equal(result.disposed, false); assert.equal(result.disposition, 'withdrawn'); assert.match(result.reason, /nothing was abandoned/)
  assert.deepEqual(await s.dispose(flags), result)
  assert.deepEqual(s.inbox.rows()[0], before.inbox)
  assert.equal(s.ledger.get('delivery').state, 'completed')
  assert.equal(s.inbox.pendingDispositions('builder').length, 0)
  assert.equal((await s.inspect()).disposition.state, 'withdrawn')
  await assert.rejects(s.dispose(s.options((await s.inspect()).revision, { 'operation-id': 'second-decision' })), { code: 'INVALID_BRIDGE_STATE' })
  s.inbox.resolve('delivery', 'accepted', 'Cooperative completion observed', receipt)
  assert.equal(s.inbox.rows()[0].state, 'accepted')
}))

it('rejects a reused operation ID with a different payload, Actor or delivery before any change', () => fixture(async s => {
  s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  await assert.rejects(s.dispose(flags, 'recorded'), /injected crash/)
  await assert.rejects(s.dispose({ ...flags, evidence: 'Changed decision' }), { code: 'OPERATION_ID_REUSED' })
  assert.equal(s.ledger.get('delivery').state, 'notified')
  await s.dispose(flags)
  const other = { ...s.mapping, actorId: 'reviewer', threadId: 'reviewer-binding', channelDirectory: join(s.root, 'review') }
  s.config.mappings.push(other); await writeFile(s.path, JSON.stringify(s.config))
  const otherLedger = await s.openLedger(other)
  const before = s.seed('other-delivery', 'uncertain', other, otherLedger)
  const preview = await s.inspect('other-delivery', 'reviewer')
  await assert.rejects(s.dispose(s.options(preview.revision, { actor: 'reviewer', delivery: 'other-delivery' })), { code: 'OPERATION_ID_REUSED' })
  assert.equal(otherLedger.get('other-delivery').state, 'notified')
  assert.equal(s.inbox.dispositionFor('other-delivery'), null)
  assert.deepEqual(s.inbox.rows('reviewer')[0], before.inbox)
}))

it('a pending disposition blocks only its Actor while the bridge starts past unregistered history and other Actors dispatch', () => fixture(async s => {
  const before = s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  await assert.rejects(s.dispose(flags, 'abandoned'), /injected crash/)
  const reviewer = { ...s.mapping, actorId: 'reviewer', threadId: 'reviewer-binding', channelDirectory: join(s.root, 'review') }
  s.config.mappings.push(reviewer); await writeFile(s.path, JSON.stringify(s.config))
  const retired = { id: 'retired-delivery', taskId: 'task', toActorId: 'retired', fromActorId: 'alice' }
  s.inbox.database.prepare("INSERT INTO inbox (id, actor, mention, mapping, state, received_at) VALUES (?, 'retired', ?, ?, 'uncertain', ?)")
    .run(retired.id, JSON.stringify(retired), JSON.stringify({ actorId: 'retired', adapter: 'retired-provider' }), Date.now())
  const forReviewer = { ...later, id: 'reviewer-delivery', commentId: 'reviewer-comment', toActorId: 'reviewer' }
  await runningBridge(s, [later, forReviewer], async online => {
    assert.equal(online.bridge.states.builder,
      'blocked: abandonment of delivery is unfinished; rerun bridge dispose with --operation-id operator-decision')
    assert.ok(online.inbox.statuses().some(status => status.actor === 'builder' && status.state === online.bridge.states.builder))
    assert.deepEqual(online.inbox.rows().find(row => row.id === 'delivery'), before.inbox)
    assert.equal(online.inbox.rows().find(row => row.id === later.id).state, 'queued')
    assert.deepEqual(online.channels.builder.events, [])
    assert.equal(online.inbox.rows().find(row => row.id === forReviewer.id).state, 'accepted')
    assert.deepEqual(online.channels.reviewer.events.map(event => event.meta.delivery_id), [forReviewer.id])
  })
  assert.equal((await s.dispose(flags)).disposition, 'finalized')
  await runningBridge(s, [], async online => {
    assert.equal(online.inbox.rows().find(row => row.id === later.id).state, 'accepted')
    assert.deepEqual(online.channels.builder.events.map(event => event.meta.delivery_id), [later.id])
    assert.equal(online.channels.builder.server.ledger.get('delivery').state, 'abandoned')
  })
}))

it('columns added to the inbox, ledger or disposition tables neither stale the revision nor wedge a retry', () => fixture(async s => {
  s.seed('delivery', 'accepted')
  const preview = await s.inspect()
  s.inbox.database.exec("ALTER TABLE inbox ADD COLUMN later_field TEXT DEFAULT 'added'")
  s.ledger.database.exec("ALTER TABLE deliveries ADD COLUMN later_field TEXT DEFAULT 'added'")
  assert.equal((await s.inspect()).revision, preview.revision)
  const flags = s.options(preview.revision)
  await assert.rejects(s.dispose(flags, 'recorded'), /injected crash/)
  s.inbox.database.exec("ALTER TABLE dispositions ADD COLUMN later_field TEXT DEFAULT 'added'")
  s.inbox.database.exec("ALTER TABLE inbox ADD COLUMN another_field TEXT DEFAULT 'added'")
  assert.equal((await s.dispose(flags)).disposition, 'finalized')
}))

it('later receipts, inbox changes, retargeted mappings and narrowed scope reject a new decision before any change', () => fixture(async s => {
  s.seed('delivery')
  const stale = await s.inspect()
  const receipt = s.ledger.accept('delivery').receipt
  await assert.rejects(s.dispose(s.options(stale.revision)), { code: 'STALE_DISPOSITION' })
  assert.equal(s.ledger.get('delivery').state, 'accepted'); assert.equal(s.inbox.dispositionFor('delivery'), null)
  const accepted = await s.inspect(); assert.equal(accepted.cooperativeReceipt, receipt)
  s.inbox.accept('delivery', receipt)
  await assert.rejects(s.dispose(s.options(accepted.revision)), { code: 'STALE_DISPOSITION' })
  s.mapping.threadId = 'retargeted'; await writeFile(s.path, JSON.stringify(s.config))
  await assert.rejects(s.inspect(), { code: 'CHANNEL_BINDING_CHANGED' })
  s.mapping.threadId = 'fixture-binding'; s.mapping.allowedTaskIds = ['other']; await writeFile(s.path, JSON.stringify(s.config))
  await assert.rejects(s.dispose(s.options((await s.inspect()).revision)), { code: 'CHANNEL_SCOPE_DENIED' })
  s.mapping.allowedTaskIds = ['task']; await writeFile(s.path, JSON.stringify(s.config))
  s.ledger.database.prepare('UPDATE deliveries SET prompt = ? WHERE id = ?').run('Different context', 'delivery')
  await assert.rejects(s.inspect(), { code: 'INVALID_BRIDGE_STATE' })
  assert.equal(s.ledger.get('delivery').state, 'accepted'); assert.equal(s.inbox.dispositionFor('delivery'), null)
}))

it('requires exclusive ownership of both inbox and channel even for offline disposition inspection', () => fixture(async s => {
  s.seed('delivery')
  for (const directory of [s.config.inboxDirectory, s.mapping.channelDirectory]) {
    const lease = await acquireStorageLease(directory)
    try { await assert.rejects(s.inspect(), { code: 'STORAGE_IN_USE' }) } finally { lease.close() }
  }
  assert.equal(s.ledger.get('delivery').state, 'notified'); assert.equal(s.inbox.rows()[0].state, 'uncertain')
}))

it('a restarted MCP channel rejects late callbacks and sends only a separately authorized new delivery', () => fixture(async s => {
  const before = s.seed('delivery')
  await s.dispose(s.options((await s.inspect()).revision))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = await startClaudeChannel({ mapping: s.mapping, config: s.config, cwd: s.root, transport: serverTransport })
  const client = new Client({ name: 'disposition-fixture', version: '1' }, { capabilities: {} })
  const events = []
  client.setNotificationHandler(eventSchema, message => { events.push(message.params) })
  const adapter = new ClaudeChannelAdapter({ ...s.mapping, receiptTimeoutMs: 5000 })
  try {
    await client.connect(clientTransport)
    for (const name of ['pardner_accept_delivery', 'pardner_complete_delivery']) {
      await assert.rejects(client.callTool({ name, arguments: { delivery_id: 'delivery' } }), /abandoned/)
    }
    assert.equal(server.ledger.reconcile('delivery', before.prompt).receipt, null)
    assert.equal(server.ledger.pending().length, 0)
    const mention = { id: 'new-delivery', taskId: 'task', toActorId: 'builder', fromActorId: 'alice' }
    const prompt = ['Separate authorized fixture delivery', JSON.stringify({ mention, context: {} })].join('\n\n')
    const pending = adapter.dispatch(s.mapping, { id: mention.id, mention, prompt })
    await eventually(() => events.length === 1)
    const result = await client.callTool({ name: 'pardner_accept_delivery', arguments: { delivery_id: 'new-delivery' } })
    const accepted = JSON.parse(result.content[0].text)
    assert.equal(await pending, accepted.receipt)
    assert.equal(events[0].meta.delivery_id, 'new-delivery')
    assert.equal(events[0].content, prompt)
    assert.equal(server.ledger.get('delivery').state, 'abandoned')
  } finally { adapter.close(); await client.close(); await server.close() }
}))
