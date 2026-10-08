import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { CursorBridgeAdapter } from '../lib/cursor-bridge-adapter.js'
import { AgentBridge, bridgeConfig, openBridgeInbox, runBridgeCommand } from '../lib/agent-bridge.js'
import { bridgeProviders } from '../lib/bridge-providers.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
const execute = promisify(execFile)
const checkScript = fileURLToPath(new URL('../scripts/bridge-cursor-check.js', import.meta.url))

const processRunning = pid => {
  try { process.kill(pid, 0); return true }
  catch (error) { if (error.code === 'ESRCH') return false; throw error }
}
async function eventually(check) {
  const deadline = Date.now() + 5000
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'Cursor fixture did not reach the expected process state')
    await delay(10)
  }
}
async function processLog(root, name) {
  const text = await readFile(join(root, `${name}.jsonl`), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  return text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : []
}

async function fixture(settings, run) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pardner-cursor-acp-')))
  const command = join(root, 'agent')
  await writeFile(command, `#!${process.execPath}\n${await readFile(new URL('../support/cursor-acp-fixture.mjs', import.meta.url), 'utf8')}`)
  await chmod(command, 0o700)
  await writeFile(join(root, 'fixture.json'), JSON.stringify(settings))
  const mapping = { actorId: 'builder', enabled: true, adapter: 'cursor-acp', sessionOwner: 'bridge', command,
    transport: 'stdio', threadId: 'mapped-session', worktree: root, worktreeBinding: 'load-cwd',
    expectedPolicy: { verification: 'mode-only', modeId: 'ask' }, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }
  const config = { workspaceId: 'workspace', replicaId: 'replica', dataDirectory: join(root, 'data'), inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
  const path = join(root, 'bridge.json')
  const save = () => writeFile(path, JSON.stringify(config))
  await save()
  const adapters = []
  const create = () => { const adapter = new CursorBridgeAdapter(mapping, { requestTimeoutMs: 5000, promptTimeoutMs: 5000 }); adapters.push(adapter); return adapter }
  const calls = async () => (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  try { await run({ root, mapping, config, path, save, create, calls }) }
  finally { await Promise.all(adapters.map(adapter => adapter.close())); await rm(root, { recursive: true, force: true }) }
}

it('uses fixed stdio argv, loads only the mapped session, and never overrides mode/model/permissions', () => fixture({}, async ({ mapping, root, create, calls }) => {
  const adapter = create()
  assert.equal(await adapter.availability(mapping), 'ready')
  const receipt = await adapter.dispatch(mapping, 'persisted delivery')
  assert.match(receipt, /^cursor-acp:prompt-response:/)
  const observed = JSON.parse(Buffer.from(receipt.split(':').at(-1), 'base64url'))
  assert.equal(observed.sessionId, mapping.threadId); assert.equal(observed.stopReason, 'end_turn')
  const messages = await calls()
  assert.deepEqual(messages.map(value => value.method), ['initialize', 'session/load', 'session/prompt'])
  assert.deepEqual(messages[0].params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false })
  assert.deepEqual(messages[1].params, { sessionId: mapping.threadId, cwd: mapping.worktree, mcpServers: [] })
  assert.deepEqual(messages[2].params, { sessionId: mapping.threadId, prompt: [{ type: 'text', text: 'persisted delivery' }] })
  assert.equal(observed.requestId, messages[2].id)
  const started = JSON.parse((await readFile(join(root, 'starts.jsonl'), 'utf8')).trim())
  assert.equal(started.cwd, mapping.worktree); assert.deepEqual(started.args, ['acp'])
}))

it('does not load when the peer did not advertise loadSession', () => fixture({ loadSession: false }, async ({ mapping, create, calls }) => {
  await assert.rejects(create().availability(mapping), { code: 'CURSOR_LOAD_UNSUPPORTED' })
  assert.deepEqual((await calls()).map(value => value.method), ['initialize'])
}))

it('reports existing authentication/session rejection without invoking sign-in or creating sessions', () => fixture({ loadError: true }, async ({ mapping, create, calls }) => {
  await assert.rejects(create().availability(mapping), { code: 'CURSOR_RPC_REJECTED' })
  assert.deepEqual((await calls()).map(value => value.method), ['initialize', 'session/load'])
}))

for (const [settings, code] of [[{ modeMissing: true }, 'CURSOR_MODE_UNOBSERVED'], [{ mode: 'agent' }, 'PERMISSION_POLICY_CHANGED'], [{ wrongSession: true }, 'SESSION_MISMATCH']]) {
  it(`blocks unobserved/changed mode or wrong loaded session (${code})`, () => fixture(settings, async ({ mapping, create, calls }) => {
    await assert.rejects(create().availability(mapping), { code })
    assert.equal((await calls()).some(value => value.method === 'session/prompt'), false)
  }))
}

it('pins mode reported by updates and detects conflicting response mode', async () => {
  await fixture({ modeMissing: true, modeViaUpdate: 'ask' }, async ({ mapping, create }) => { assert.equal(await create().availability(mapping), 'ready') })
  await fixture({ modeViaUpdate: 'agent', mode: 'ask' }, async ({ mapping, create }) => { await assert.rejects(create().availability(mapping), { code: 'PERMISSION_POLICY_CHANGED' }) })
})

it('reports busy while prompt completion is pending and returns no early acceptance receipt', () => fixture({ promptDelayMs: 100 }, async ({ mapping, create }) => {
  const adapter = create()
  await adapter.availability(mapping)
  let completed = false
  const dispatch = adapter.dispatch(mapping, 'slow prompt').then(value => { completed = true; return value })
  await delay(10)
  assert.equal(completed, false); assert.equal(await adapter.availability(mapping), 'busy')
  assert.match(await dispatch, /^cursor-acp:prompt-response:/)
  assert.equal(adapter.activity(), 'idle')
}))

for (const method of ['session/request_permission', 'cursor/ask_question', 'cursor/create_plan', 'unknown/client_request']) {
  it(`never answers ${method}, reports blocked, and leaves the delivery queued`, () => fixture({ blockOnLoad: method }, async ({ mapping, config, create, calls }) => {
    const inbox = await openBridgeInbox(config)
    const mention = { id: 'mention', taskId: 'task', commentId: 'comment', toActorId: 'builder', fromActorId: 'alice' }
    inbox.receive('builder', { mention }, mapping)
    const source = Object.assign(new EventEmitter(), { close() {}, actors: async () => ({ actors: {
      builder: { id: 'builder', handle: 'builder', kind: 'agent' }, alice: { id: 'alice', handle: 'alice', kind: 'human' },
    } }), context: async () => ({ mentions: [mention], comments: [{ id: 'comment' }] }) })
    const adapter = create(), bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => adapter })
    try {
      await bridge.dispatch(mapping)
      assert.equal(inbox.rows()[0].state, 'queued'); assert.match(inbox.rows()[0].reason, /blocked/)
      const messages = await calls()
      assert.equal(messages.some(value => value.id === 'server-request' || value.method === 'session/prompt'), false)
    } finally { await bridge.stop(); inbox.close() }
  }))
}

it('blocked permission during a submitted prompt becomes uncertain on close and is never auto-answered', () => fixture({ promptBlock: 'session/request_permission' }, async ({ mapping, create, calls }) => {
  const adapter = create(); await adapter.availability(mapping)
  const changed = once(adapter, 'change')
  const dispatch = adapter.dispatch(mapping, 'permission prompt')
  const rejected = assert.rejects(dispatch, { code: 'CURSOR_CLOSED' })
  await changed
  while (!adapter.requests.size) await delay(5)
  assert.match(await adapter.availability(mapping), /blocked/)
  await adapter.close(); await rejected
  assert.equal((await calls()).some(value => value.id === 'server-request'), false)
}))

it('reopens the durable inbox and reconciles a lost reply from exactly one native replay ID without resubmitting', () => fixture({ loseReply: true }, async ({ mapping, config, create, calls }) => {
  let inbox = await openBridgeInbox(config)
  const mention = { id: 'mention', taskId: 'task', commentId: 'comment', toActorId: 'builder', fromActorId: 'alice' }
  inbox.receive('builder', { mention }, mapping); inbox.begin('mention', 'exact persisted prompt')
  const first = create(); await first.availability(mapping)
  await assert.rejects(first.dispatch(mapping, 'exact persisted prompt'), { code: 'CURSOR_DISCONNECTED' })
  inbox.close(); inbox = await openBridgeInbox(config); inbox.recover()
  assert.equal(inbox.rows()[0].state, 'uncertain')
  const second = create()
  const receipt = await second.reconcile(mapping, inbox.rows()[0].prompt)
  assert.match(receipt, /^cursor-acp:replayed-message:/)
  const evidence = JSON.parse(Buffer.from(receipt.split(':').at(-1), 'base64url'))
  assert.deepEqual(evidence, { sessionId: mapping.threadId, messageId: 'native-message-1' })
  inbox.accept('mention', receipt)
  assert.equal(inbox.rows()[0].state, 'accepted'); inbox.close()
  assert.equal((await calls()).filter(value => value.method === 'session/prompt').length, 1)
}))

const chunk = (messageId, text) => ({ ...(messageId === undefined ? {} : { messageId }), content: { type: 'text', text } })
for (const [name, replay] of [
  ['missing history', []], ['missing ID', [chunk(undefined, 'full prompt')]],
  ['ambiguous IDs', [chunk('one', 'full prompt'), chunk('two', 'full prompt')]],
  ['truncated prompt', [chunk('one', 'prompt')]],
  ['noncontiguous reused ID', [chunk('one', 'full '), chunk('two', 'other'), chunk('one', 'prompt')]],
]) {
  it(`keeps ${name} uncertain without a blind retry`, () => fixture({ replay }, async ({ mapping, create, calls }) => {
    assert.equal(await create().reconcile(mapping, 'full prompt'), null)
    assert.equal((await calls()).some(value => value.method === 'session/prompt'), false)
  }))
}

it('joins contiguous chunks sharing the supplied native message ID', () => fixture({ replay: [chunk('one', 'full '), chunk('one', 'prompt')] }, async ({ mapping, create }) => {
  assert.match(await create().reconcile(mapping, 'full prompt'), /^cursor-acp:replayed-message:/)
}))

it('requires a complete load response before trusting replay', () => fixture({ replay: [chunk('one', 'full prompt')], load: 'hang' }, async ({ mapping, create }) => {
  const adapter = create(); adapter.requestTimeoutMs = 150
  await adapter.connect()
  await assert.rejects(adapter.reconcile(mapping, 'full prompt'), { code: 'CURSOR_RPC_TIMEOUT' })
  assert.equal(adapter.history, null)
}))

it('waits for the timed-out process to exit before spawning its replacement', () => fixture({ load: 'hang', termDelayMs: 200 }, async ({ root, mapping, create }) => {
  const adapter = create(); await adapter.connect(); adapter.requestTimeoutMs = 150
  await assert.rejects(adapter.availability(mapping), { code: 'CURSOR_RPC_TIMEOUT' })
  await writeFile(join(root, 'fixture.json'), JSON.stringify({}))
  adapter.requestTimeoutMs = 5000; await adapter.availability(mapping)
  const starts = (await readFile(join(root, 'starts.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.equal(starts.length, 2)
  assert.ok(starts[1].priorExitedPids.includes(starts[0].pid), 'Prior ACP process must be closed before the replacement starts')
}))

it('retains the bridge storage lease through delayed Cursor shutdown before allowing a replacement owner', () => fixture({ termDelayMs: 800 }, async ({ root, mapping, config, create }) => {
  const adapter = create()
  await adapter.availability(mapping)
  const pid = adapter.child.pid
  const inbox = await openBridgeInbox(config)
  const source = Object.assign(new EventEmitter(), { close() {} })
  const bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => adapter })
  const lease = await acquireStorageLease(config.inboxDirectory)
  let released = false, replacementLease
  const stopping = bridge.stop().finally(() => { lease.close(); released = true })
  try {
    await eventually(async () => (await processLog(root, 'terminations')).some(entry => entry.pid === pid))
    assert.equal(processRunning(pid), true, 'The delayed Cursor process is still alive')
    assert.equal(released, false, 'Bridge shutdown must retain its lease until Cursor exits')
    await assert.rejects(acquireStorageLease(config.inboxDirectory), { code: 'STORAGE_IN_USE' })
    await stopping
    assert.equal(processRunning(pid), false, 'Shutdown resolves only after the Cursor process exits')
    replacementLease = await acquireStorageLease(config.inboxDirectory)
    await writeFile(join(root, 'fixture.json'), JSON.stringify({}))
    await create().availability(mapping)
    const starts = await processLog(root, 'starts')
    assert.equal(starts.length, 2)
    assert.ok(starts[1].priorExitedPids.includes(pid), 'The replacement session owner starts after the prior process exits')
  } finally {
    await stopping
    await adapter.close()
    replacementLease?.close()
    inbox.close()
  }
}))

for (const configured of [false, true]) {
  for (const failed of [false, true]) {
    it(`${configured ? 'configured' : 'direct'} Cursor inspection waits for delayed process exit on ${failed ? 'failure' : 'success'}`, () => fixture({ termDelayMs: 800, ...(failed ? { modeMissing: true } : {}) }, async ({ root, mapping, path }) => {
      let settled = false, pid
      const flags = configured ? { config: path, actor: 'builder' }
        : { adapter: 'cursor-acp', command: mapping.command, worktree: mapping.worktree, session: mapping.threadId }
      const inspecting = runBridgeCommand('inspect', flags).then(value => ({ value }), error => ({ error }))
        .then(outcome => { settled = true; return outcome })
      try {
        await eventually(async () => (await processLog(root, 'terminations')).length === 1)
        pid = (await processLog(root, 'starts'))[0].pid
        assert.equal(processRunning(pid), true, 'The delayed inspection process is still alive')
        assert.equal(settled, false, 'Inspection must await process shutdown before returning its outcome')
        const outcome = await inspecting
        if (failed) assert.equal(outcome.error?.code, 'CURSOR_MODE_UNOBSERVED')
        else assert.equal(outcome.value?.threadId, mapping.threadId)
        assert.equal(processRunning(pid), false, 'Inspection leaves no live Cursor session owner')
      } finally {
        await inspecting
        pid ??= (await processLog(root, 'starts'))[0]?.pid
        if (pid) await eventually(() => !processRunning(pid))
      }
    }))
  }
}

for (const [settings, code] of [[{ initialize: 'malformed' }, 'CURSOR_PROTOCOL_ERROR'], [{ initialize: 'wrong-id' }, 'CURSOR_PROTOCOL_ERROR'], [{ protocolVersion: 99 }, 'CURSOR_PROTOCOL_ERROR'], [{ initialize: 'exit' }, 'CURSOR_DISCONNECTED'], [{ initialize: 'hang' }, 'CURSOR_RPC_TIMEOUT']]) {
  it(`bounds invalid, unexpected, closing, or missing initialization (${JSON.stringify(settings)})`, () => fixture(settings, async ({ create }) => {
    const adapter = create(); adapter.requestTimeoutMs = settings.initialize === 'hang' ? 150 : 5000
    await assert.rejects(adapter.connect(), { code })
  }))
}

it('bounds oversized protocol frames and rejects updates for a different session', async () => {
  await fixture({ initialize: 'oversized' }, async ({ mapping }) => {
    const adapter = new CursorBridgeAdapter(mapping, { maxLineBytes: 1024 })
    try { await assert.rejects(adapter.connect(), { code: 'CURSOR_PROTOCOL_ERROR' }) } finally { await adapter.close() }
  })
  await fixture({ updateWrongSession: true }, async ({ mapping, create }) => { const adapter = create(); await assert.rejects(adapter.dispatch(mapping, 'prompt'), { code: 'CURSOR_PROTOCOL_ERROR' }) })
})

it('detects mode changes during a prompt and rejects invalid stop reasons', async () => {
  await fixture({ changeMode: 'agent' }, async ({ mapping, create }) => { await assert.rejects(create().dispatch(mapping, 'prompt'), { code: 'PERMISSION_POLICY_CHANGED' }) })
  await fixture({ stopReason: 'invented' }, async ({ mapping, create }) => { await assert.rejects(create().dispatch(mapping, 'prompt'), { code: 'CURSOR_PROTOCOL_ERROR' }) })
})

it('selects Cursor through production configuration and both inspection paths with explicit limits', () => fixture({}, async ({ mapping, path }) => {
  const normalized = await bridgeConfig(path)
  assert.ok(bridgeProviders.create(normalized.mappings[0]) instanceof CursorBridgeAdapter)
  const direct = await runBridgeCommand('inspect', { adapter: 'cursor-acp', command: mapping.command, worktree: mapping.worktree, session: mapping.threadId })
  const configured = await runBridgeCommand('inspect', { config: path, actor: 'builder' })
  assert.deepEqual(direct, configured)
  assert.equal(direct.worktreeBinding, 'load-cwd'); assert.deepEqual(direct.expectedPolicy, mapping.expectedPolicy)
  assert.match(direct.limitations.join(' '), /not independently attested/)
}))

it('rejects unsafe launch/configuration and unsupported cleanup before spawning', () => fixture({}, async ({ mapping, config, save, path }) => {
  const original = structuredClone(mapping)
  for (const modify of [value => { value.command = 'agent' }, value => { value.command = '/bin/sh' },
    value => { value.args = ['--api-key', 'not-a-real-key'] }, value => { value.env = {} }, value => { value.endpoint = 'https://example.com' },
    value => { value.expectedPolicy.sandbox = 'read-only' }, value => { value.expectedPolicy.verification = 'full' },
    value => { value.worktreeBinding = 'attested' }, value => { value.sessionOwner = 'editor' }, value => { value.transport = 'websocket' },
  ]) {
    config.mappings = [structuredClone(original)]; modify(config.mappings[0]); await save()
    await assert.rejects(bridgeConfig(path))
  }
  config.mappings = [original]; config.completionCleanup = { archiveDirectory: '/tmp/archive' }; await save()
  await assert.rejects(bridgeConfig(path), { code: 'UNSUPPORTED_BRIDGE_CLEANUP' })
}))

it('Cursor launch identity and mode pins cannot retarget queued or uncertain work', () => fixture({}, async ({ mapping, config, create }) => {
  for (const mutate of [value => { value.command += '-other' }, value => { value.transport = 'other' },
    value => { value.worktreeBinding = 'other' }, value => { value.expectedPolicy.modeId = 'agent' }, value => { value.threadId = 'other' },
  ]) {
    const original = structuredClone(mapping), current = structuredClone(mapping); mutate(current)
    const row = { id: 'delivery', state: 'queued', mapping: original, mention: { taskId: 'task', fromActorId: 'alice' } }
    const inbox = { rows: () => [row], reason: (_id, reason) => { row.reason = reason } }
    const bridge = new AgentBridge({ config: { ...config, mappings: [current] }, inbox, source: {}, adapterFactory: () => create() })
    await bridge.dispatch(current); assert.match(row.reason, /mapping changed/)
    row.state = 'uncertain'; await assert.rejects(bridge.dispatch(current), { code: 'MAPPING_CHANGED' })
  }
}))

it('repeatable check defaults to initialize only and never authenticates or loads a session', () => fixture({}, async ({ mapping, calls }) => {
  const { stdout } = await execute(process.execPath, [checkScript, '--command', mapping.command, '--worktree', mapping.worktree])
  const report = JSON.parse(stdout)
  assert.equal(report.passed, true); assert.equal(report.scope, 'initialize-only')
  assert.deepEqual((await calls()).map(value => value.method), ['initialize'])
}))

it('opt-in adapter check requires actual assistant output as well as the completion response', async () => {
  await fixture({}, async ({ path, calls }) => {
    await assert.rejects(execute(process.execPath, [checkScript, '--run', '--config', path, '--actor', 'builder']), error => {
      const report = JSON.parse(error.stdout)
      return report.passed === false && report.checks.observedCompletionResponse === true && report.checks.observedAssistantNonce === false
    })
    assert.equal((await calls()).filter(value => value.method === 'session/prompt').length, 1)
  })
  await fixture({ echoNonce: true }, async ({ path, calls }) => {
    const { stdout } = await execute(process.execPath, [checkScript, '--run', '--config', path, '--actor', 'builder'])
    const report = JSON.parse(stdout)
    assert.equal(report.passed, true); assert.equal(report.scope, 'native-adapter-only')
    assert.equal(report.checks.observedAssistantNonce, true); assert.equal(report.checks.exactReplayMessageReceipt, true)
    assert.ok(report.unqualified.includes('Automatic Pardner attributed reply'))
    assert.deepEqual((await calls()).map(value => value.method), ['initialize', 'session/load', 'session/prompt', 'session/load'])
  })
})
