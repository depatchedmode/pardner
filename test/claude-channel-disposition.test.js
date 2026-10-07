import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { ChannelLedger, startClaudeChannel } from '../lib/claude-channel-server.js'
import { channelIdentity, ClaudeChannelAdapter } from '../lib/claude-channel-adapter.js'
import { runBridgeCommand, openBridgeInbox } from '../lib/agent-bridge.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { cli } from '../support/cli-resources.js'
import { eventually } from '../support/bridge-rehearsal.js'

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
    const mention = { id, taskId: 'task', toActorId: route.actorId, fromActorId: 'alice' }
    const prompt = ['Full durable fixture café 🐎', JSON.stringify({ mention, context: { description: 'complete task' } })].join('\n\n')
    inbox.receive(route.actorId, { mention, claimToken: 'fixture', claimExpiresAt: Date.now() + 30000 }, route)
    inbox.clearClaim(route.actorId); inbox.begin(id, prompt)
    store.submit(id, prompt, 'task')
    if (state === 'accepted') inbox.accept(id, store.accept(id).receipt)
    else inbox.uncertain(id)
    return { prompt, inbox: inbox.rows().find(value => value.id === id), channel: store.get(id) }
  }
  const inspect = (id = 'delivery', actor = 'builder') => runBridgeCommand('disposition', { config: path, delivery: id, actor })
  const options = (revision, changes = {}) => ({ config: path, actor: 'builder', delivery: 'delivery', decision: 'abandon',
    'expected-revision': revision, 'operation-id': 'operator-decision', evidence: 'Fixture client and all effects stopped; no execution outcome inferred.',
    'confirm-client-stopped': true, ...changes })
  try {
    await writeFile(path, JSON.stringify(config))
    await run({ root, mapping, config, path, inbox, ledger, seed, inspect, options, openLedger })
  } finally { inbox.close(); for (const ledger of ledgers) ledger.close(); await rm(root, { recursive: true, force: true }) }
}

it('public offline abandonment retains both original records, survives restart and never resurrects receipt or execution', () => fixture(async s => {
  const before = s.seed('delivery')
  const preview = await cli(s.root, ['bridge', 'disposition', '--config', s.path, '--actor', 'builder', '--delivery', 'delivery'])
  assert.equal(preview.code, 0, preview.stderr)
  assert.equal(preview.result.cooperativeReceipt, null)
  const argumentsFor = confirmation => ['bridge', 'dispose', '--config', s.path, '--actor', 'builder', '--delivery', 'delivery',
    '--decision', 'abandon', '--expected-revision', preview.result.revision, '--operation-id', 'operator-decision',
    '--evidence', 'Fixture effects quiesced; outcome unknown.', ...confirmation]
  assert.notEqual((await cli(s.root, argumentsFor([]))).code, 0)
  assert.equal(s.ledger.get('delivery').state, 'notified')
  const result = await cli(s.root, argumentsFor(['--confirm-client-stopped']))
  assert.equal(result.code, 0, result.stderr); assert.equal(result.result.executionOutcome, 'unverified')
  assert.equal(s.inbox.rows()[0].state, 'abandoned')
  const reopened = await s.openLedger()
  assert.equal(reopened.pending().length, 0)
  assert.equal(reopened.get('delivery').prompt, before.prompt)
  assert.equal(reopened.get('delivery').receipt, before.channel.receipt)
  assert.equal(reopened.receipt('delivery').receipt, null)
  assert.equal(reopened.reconcile(before.prompt).receipt, null)
  assert.deepEqual({ ...reopened.disposition('operator-decision').prior.channel }, { ...before.channel })
  assert.deepEqual(reopened.disposition('operator-decision').prior.inbox, before.inbox)
  assert.deepEqual(s.inbox.disposition('operator-decision').prior, before.inbox)
  for (const action of [() => reopened.accept('delivery'), () => reopened.complete('delivery'),
    () => reopened.submit('delivery', before.prompt, 'task')]) assert.throws(action, { code: 'CHANNEL_DELIVERY_ABANDONED' })
  assert.throws(() => s.inbox.accept('delivery', 'invented'), { code: 'INVALID_BRIDGE_STATE' })
  assert.throws(() => s.inbox.uncertain('delivery'), { code: 'INVALID_BRIDGE_STATE' })
  assert.throws(() => s.inbox.resolve('delivery', 'retry', 'No inference'), { code: 'INVALID_BRIDGE_STATE' })
  await assert.rejects(runBridgeCommand('reconcile', { config: s.path, delivery: 'delivery', decision: 'retry', evidence: 'No inference' }), { code: 'INVALID_BRIDGE_STATE' })
  reopened.submit('later', 'A separate authorized delivery', 'task')
  assert.equal(reopened.pending().length, 1)
}))

it('an acknowledgement lost after cooperative acceptance invalidates a stale disposition without changing either store', () => fixture(async s => {
  const before = s.seed('delivery')
  const stale = await s.inspect()
  const receipt = s.ledger.accept('delivery').receipt
  await assert.rejects(runBridgeCommand('dispose', s.options(stale.revision)), { code: 'STALE_DISPOSITION' })
  assert.equal(s.ledger.get('delivery').state, 'accepted'); assert.deepEqual(s.inbox.rows()[0], before.inbox)
  assert.equal(s.ledger.dispositionFor('delivery'), null)
  const fresh = await s.inspect(); assert.equal(fresh.cooperativeReceipt, receipt)
  await runBridgeCommand('dispose', s.options(fresh.revision))
  assert.equal(s.ledger.disposition('operator-decision').prior.channel.receipt, receipt)
  assert.equal(s.ledger.disposition('operator-decision').prior.channel.state, 'accepted')
  assert.equal(s.ledger.receipt('delivery').receipt, null)
}))

it('an earlier core retry that requeued a persisted prompt can be explicitly abandoned without getting stuck', () => fixture(async s => {
  const original = s.seed('delivery')
  await runBridgeCommand('reconcile', { config: s.path, delivery: 'delivery', decision: 'retry', evidence: 'Earlier operator attempted retry' })
  assert.equal(s.inbox.rows()[0].state, 'queued')
  const preview = await s.inspect()
  await runBridgeCommand('dispose', s.options(preview.revision))
  assert.equal(s.inbox.rows()[0].state, 'abandoned')
  assert.equal(s.inbox.disposition('operator-decision').prior.state, 'queued')
  assert.equal(s.ledger.disposition('operator-decision').prior.channel.prompt, original.prompt)
  assert.equal(s.ledger.disposition('operator-decision').finalized, 1)
  assert.equal(s.ledger.pending().length, 0)
  assert.equal(s.ledger.submit('later', 'A different delivery', 'task').fresh, true)
}))

it('inbox receipt changes and mapping or prompt changes invalidate the inspected evidence before any disposition', () => fixture(async s => {
  s.seed('delivery')
  const stale = await s.inspect()
  s.inbox.accept('delivery', 'separately-observed-receipt')
  await assert.rejects(runBridgeCommand('dispose', s.options(stale.revision)), { code: 'STALE_DISPOSITION' })
  assert.equal(s.ledger.dispositionFor('delivery'), null)
  s.mapping.threadId = 'retargeted'; await writeFile(s.path, JSON.stringify(s.config))
  await assert.rejects(s.inspect(), { code: 'CHANNEL_BINDING_CHANGED' })
  s.mapping.threadId = 'fixture-binding'; await writeFile(s.path, JSON.stringify(s.config))
  s.ledger.database.prepare('UPDATE deliveries SET prompt = ? WHERE id = ?').run('Different context', 'delivery')
  await assert.rejects(s.inspect(), { code: 'CHANNEL_SCOPE_DENIED' })
  assert.equal(s.ledger.get('delivery').state, 'notified')
}))

it('requires exclusive ownership of both inbox and channel even for offline disposition inspection', () => fixture(async s => {
  s.seed('delivery')
  for (const directory of [s.config.inboxDirectory, s.mapping.channelDirectory]) {
    const lease = await acquireStorageLease(directory)
    try { await assert.rejects(s.inspect(), { code: 'STORAGE_IN_USE' }) } finally { lease.close() }
  }
  assert.equal(s.ledger.get('delivery').state, 'notified'); assert.equal(s.inbox.rows()[0].state, 'uncertain')
}))

it('a crash between ledger and accepted-inbox commits keeps later deliveries blocked until the identical decision finishes', () => fixture(async s => {
  const before = s.seed('delivery', 'accepted')
  const preview = await s.inspect(), flags = s.options(preview.revision)
  s.inbox.database.exec("CREATE TRIGGER fail_abandon BEFORE UPDATE OF state ON inbox BEGIN SELECT RAISE(ABORT, 'injected inbox failure'); END")
  await assert.rejects(runBridgeCommand('dispose', flags), /injected inbox failure/)
  assert.equal(s.ledger.get('delivery').state, 'abandoned'); assert.equal(s.ledger.pending().length, 1)
  assert.equal(s.ledger.disposition('operator-decision').finalized, 0)
  assert.deepEqual(s.inbox.rows()[0], before.inbox)
  assert.throws(() => s.ledger.submit('next', 'No blind progress during partial commit', 'task'), { code: 'CHANNEL_BUSY' })
  await assert.rejects(runBridgeCommand('reconcile', { config: s.path, delivery: 'delivery', decision: 'retry', evidence: 'No blind retry' }), { code: 'INVALID_BRIDGE_STATE' })
  await assert.rejects(runBridgeCommand('dispose', { ...flags, evidence: 'Changed decision' }), { code: 'OPERATION_ID_REUSED' })
  s.inbox.database.exec('DROP TRIGGER fail_abandon')
  const result = await runBridgeCommand('dispose', flags)
  assert.equal(result.finalized, true); assert.equal(s.ledger.pending().length, 0)
  assert.equal(s.ledger.disposition('operator-decision').prior.inbox.turn_id, before.inbox.turn_id)
  assert.deepEqual(await runBridgeCommand('dispose', flags), result)
  assert.equal(s.ledger.submit('next', 'Separate new delivery', 'task').fresh, true)
}))

it('a crash after inbox commit retains the barrier and can finalize without overwriting the original audit', () => fixture(async s => {
  s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  s.ledger.database.exec("CREATE TRIGGER fail_finalize BEFORE UPDATE OF finalized ON dispositions BEGIN SELECT RAISE(ABORT, 'injected finalize failure'); END")
  await assert.rejects(runBridgeCommand('dispose', flags), /injected finalize failure/)
  assert.equal(s.inbox.rows()[0].state, 'abandoned'); assert.equal(s.ledger.pending().length, 1)
  const audit = s.inbox.disposition('operator-decision')
  const preview = await s.inspect(); assert.equal(preview.disposition.finalized, false)
  assert.equal(preview.disposition.request.expectedRevision, flags['expected-revision'])
  s.ledger.database.exec('DROP TRIGGER fail_finalize')
  await runBridgeCommand('dispose', flags)
  assert.deepEqual(s.inbox.disposition('operator-decision'), audit)
  assert.equal(s.ledger.pending().length, 0)
}))

it('rejects a reused operator ID across different Actors before writing the second channel decision', () => fixture(async s => {
  s.seed('delivery')
  await runBridgeCommand('dispose', s.options((await s.inspect()).revision))
  const other = { ...s.mapping, actorId: 'reviewer', threadId: 'reviewer-binding', channelDirectory: join(s.root, 'reviewer-channel') }
  s.config.mappings.push(other); await writeFile(s.path, JSON.stringify(s.config))
  const otherLedger = await s.openLedger(other)
  const before = s.seed('other-delivery', 'uncertain', other, otherLedger)
  const preview = await s.inspect('other-delivery', 'reviewer')
  await assert.rejects(runBridgeCommand('dispose', s.options(preview.revision, { actor: 'reviewer', delivery: 'other-delivery' })), { code: 'OPERATION_ID_REUSED' })
  assert.equal(otherLedger.get('other-delivery').state, 'notified')
  assert.equal(otherLedger.dispositionFor('other-delivery'), null)
  assert.deepEqual(s.inbox.rows('reviewer')[0], before.inbox)
}))

it('changed prior inbox evidence during a partial decision remains blocked instead of overwriting it', () => fixture(async s => {
  s.seed('delivery')
  const flags = s.options((await s.inspect()).revision)
  s.inbox.database.exec("CREATE TRIGGER fail_abandon BEFORE UPDATE OF state ON inbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
  await assert.rejects(runBridgeCommand('dispose', flags), /injected failure/)
  s.inbox.database.exec('DROP TRIGGER fail_abandon')
  s.inbox.reason('delivery', 'Changed evidence that must be preserved')
  await assert.rejects(runBridgeCommand('dispose', flags), { code: 'STALE_DISPOSITION' })
  assert.equal(s.inbox.rows()[0].reason, 'Changed evidence that must be preserved')
  assert.equal(s.ledger.disposition('operator-decision').finalized, 0)
  assert.equal(s.ledger.pending().length, 1)
}))

it('changed channel receipt evidence during a partial decision prevents finalization and retains the barrier', () => fixture(async s => {
  const before = s.seed('delivery', 'accepted')
  const flags = s.options((await s.inspect()).revision)
  s.inbox.database.exec("CREATE TRIGGER fail_abandon BEFORE UPDATE OF state ON inbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
  await assert.rejects(runBridgeCommand('dispose', flags), /injected failure/)
  s.inbox.database.exec('DROP TRIGGER fail_abandon')
  s.ledger.database.prepare('UPDATE deliveries SET receipt = ? WHERE id = ?').run('changed-receipt-evidence', 'delivery')
  await assert.rejects(runBridgeCommand('dispose', flags), { code: 'STALE_DISPOSITION' })
  assert.deepEqual(s.inbox.rows()[0], before.inbox)
  assert.equal(s.ledger.disposition('operator-decision').prior.channel.receipt, before.channel.receipt)
  assert.equal(s.ledger.disposition('operator-decision').finalized, 0)
  assert.equal(s.ledger.pending().length, 1)
}))

it('a restarted MCP channel rejects late callbacks and sends only a separately authorized new delivery', () => fixture(async s => {
  const before = s.seed('delivery')
  await runBridgeCommand('dispose', s.options((await s.inspect()).revision))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = await startClaudeChannel({ mapping: s.mapping, config: s.config, cwd: s.root, transport: serverTransport })
  const client = new Client({ name: 'disposition-fixture', version: '1' }, { capabilities: {} })
  const events = []
  client.setNotificationHandler(z.object({ method: z.literal('notifications/claude/channel'),
    params: z.object({ content: z.string(), meta: z.record(z.string(), z.string()) }) }), message => { events.push(message.params) })
  const adapter = new ClaudeChannelAdapter({ ...s.mapping, receiptTimeoutMs: 5000 })
  try {
    await client.connect(clientTransport)
    for (const name of ['pardner_accept_delivery', 'pardner_complete_delivery']) {
      await assert.rejects(client.callTool({ name, arguments: { delivery_id: 'delivery' } }), /abandoned/)
    }
    assert.equal(server.ledger.reconcile(before.prompt).receipt, null)
    assert.equal(server.ledger.pending().length, 0)
    const prompt = ['Separate authorized fixture delivery', JSON.stringify({ mention: {
      id: 'new-delivery', taskId: 'task', toActorId: 'builder', fromActorId: 'alice' }, context: {} })].join('\n\n')
    const pending = adapter.dispatch(s.mapping, prompt)
    await eventually(() => events.length === 1)
    const result = await client.callTool({ name: 'pardner_accept_delivery', arguments: { delivery_id: 'new-delivery' } })
    const accepted = JSON.parse(result.content[0].text)
    assert.equal(await pending, accepted.receipt)
    assert.equal(events[0].meta.delivery_id, 'new-delivery')
    assert.equal(events[0].content, prompt)
    assert.equal(server.ledger.get('delivery').state, 'abandoned')
  } finally { adapter.close(); await client.close(); await server.close() }
}))
