import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { CursorBridgeAdapter } from '../lib/cursor-bridge-adapter.js'
import { bridgeConfig } from '../lib/agent-bridge.js'

// Default: initialize only, no authentication, session load/create, or inference.
const args = process.argv.slice(2), flags = {}
const usage = 'node scripts/bridge-cursor-check.js --command /absolute/path/to/agent --worktree PATH | --run --config PATH --actor ACTOR_ID'
for (let i = 0; i < args.length; i++) {
  assert.ok(['--run', '--command', '--worktree', '--config', '--actor'].includes(args[i]), usage)
  const key = args[i].slice(2)
  assert.ok(!Object.hasOwn(flags, key), usage)
  if (key === 'run') flags.run = true
  else { assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), usage); flags[key] = args[++i] }
}
assert.equal(process.version, 'v24.11.1', 'Use the repository Node 24.11.1 pin')
let mapping
if (flags.run) {
  assert.ok(flags.config && flags.actor && !flags.command && !flags.worktree, usage)
  mapping = (await bridgeConfig(flags.config)).mappings.find(value => value.actorId === flags.actor)
  assert.equal(mapping?.adapter, 'cursor-acp', 'Select an explicitly configured Cursor Actor')
  assert.equal(mapping.enabled, true, 'The selected mapping must be explicitly enabled')
} else {
  assert.ok(flags.command && flags.worktree && !flags.config && !flags.actor, usage)
  mapping = { command: flags.command, worktree: flags.worktree, transport: 'stdio' }
}
const adapter = new CursorBridgeAdapter(mapping)
const checks = {}, report = { passed: false, scope: flags.run ? 'native-adapter-only' : 'initialize-only', checks,
  unqualified: ['Automatic Pardner attributed reply', 'Three-agent mixed-provider workflow', 'Approval UI', 'Independent native cwd/sandbox attestation', 'Discovery/archive'] }
try {
  await adapter.connect()
  checks.initialize = true
  report.protocolVersion = adapter.initialization.protocolVersion
  report.loadSession = adapter.initialization.agentCapabilities?.loadSession === true
  report.authMethodIds = (adapter.initialization.authMethods ?? []).map(value => value.id)
  if (flags.run) {
    assert.equal(await adapter.availability(mapping), 'ready', 'Session must load with an observed, unchanged mode')
    checks.existingSessionLoadedModePinned = true
    const nonce = randomUUID()
    const prompt = `Pardner Cursor qualification nonce: ${nonce}. Reply with exactly that nonce. Do not use tools, edit files, run commands, change credentials or permissions, or create tasks. This checks an already authorized mapped session only.`
    let assistantText = ''
    adapter.on('update', update => {
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
        assistantText += update.content.text
        assert.ok(Buffer.byteLength(assistantText) <= 1024 * 1024, 'Bound qualification response output')
      }
    })
    const receipt = await adapter.dispatch(mapping, prompt)
    checks.observedCompletionResponse = receipt.startsWith('cursor-acp:prompt-response:')
    checks.observedAssistantNonce = assistantText.trim() === nonce
    assert.equal(checks.observedAssistantNonce, true, 'A completion response alone does not prove the model replied')
    const replayReceipt = await adapter.reconcile(mapping, prompt)
    checks.exactReplayMessageReceipt = Boolean(replayReceipt)
    assert.equal(checks.exactReplayMessageReceipt, true, 'Complete replay with a unique native message ID is required for recovery qualification')
  }
  report.passed = true
} catch (error) {
  // Provider stderr and native error details stay private; print stable failure codes.
  report.errorCode = error.code ?? 'CURSOR_QUALIFICATION_FAILED'
  process.exitCode = 1
} finally {
  await adapter.close()
  console.log(JSON.stringify(report))
}
