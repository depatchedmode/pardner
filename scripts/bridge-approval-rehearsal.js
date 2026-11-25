import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { CodexBridgeAdapter } from '../lib/codex-bridge-adapter.js'
import { AgentBridge, BridgeSource, openBridgeInbox } from '../lib/agent-bridge.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'
import { availablePort, startProcess, eventually, execute, freezeCandidate } from '../support/bridge-rehearsal.js'

// This probe observes a real pending approval, then interrupts it; it never approves it.
const args = process.argv.slice(2)
if (!args.includes('--run')) {
  console.log('Real Luna/low approval-boundary probe: node scripts/bridge-approval-rehearsal.js --run --codex /path/to/codex')
  process.exit(0)
}
assert.ok(args.length === 3 && args[0] === '--run' && args[1] === '--codex' && args[2], 'Supply --run --codex /path/to/codex')
const runId = randomUUID()
const source = fileURLToPath(new URL('..', import.meta.url))
const root = join(source, '.pardner', 'bridge-rehearsals', runId)
const cwd = join(root, 'approval-worktree')
const candidate = join(root, 'candidate')
const data = join(root, 'service')
await mkdir(root, { recursive: true, mode: 0o700 })
await mkdir(cwd)
const marker = join(cwd, 'must-not-exist.txt')
const report = { runId, passed: false, startedAt: new Date().toISOString(), checks: {},
  limitations: ['Pending approval and cancellation only; a usable human approval round trip remains unqualified.'] }
const processes = []
let control, bridge, inbox, mapping, token = ''
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PARDNER_')))
const save = (name, value) => {
  const text = JSON.stringify(value, null, 2)
  return writeFile(join(root, name), token ? text.replaceAll(token, '[REDACTED]') : text, { mode: 0o600 })
}
const launch = (command, argv) => {
  const child = startProcess(command, argv, { env: environment })
  processes.push(child)
  return child
}
async function cli(args) {
  const { stdout } = await execute(process.execPath, [join(candidate, 'bin/pardner.js'), '--data', data, '--actor', 'human', '--json', ...args], { env: environment, timeout: 10000 })
  const result = JSON.parse(stdout)
  assert.equal(result.success, true)
  return result
}
async function handoff(taskId, message) {
  const { revisions } = await cli(['show', taskId])
  return cli(['handoff', taskId, '--to', 'probe', '--message', message,
    '--revisions', JSON.stringify({ assignee: revisions.assignee })])
}
async function markerAbsent() {
  await assert.rejects(access(marker), { code: 'ENOENT' })
}
try {
  report.candidate = await freezeCandidate(source, candidate)
  const service = launch(process.execPath, [join(candidate, 'bin/pardner.js'), 'serve', '--data', data, '--http-port', '0', '--ws-port', '0'])
  await eventually(() => { service.check(); return service.output().stdout.includes('\n') })
  token = JSON.parse(await readFile(join(data, 'connection.json'), 'utf8')).token
  const status = await cli(['status'])
  for (const [actor, kind] of [['human', 'human'], ['probe', 'agent']]) await cli(['actors', 'register', actor, '--handle', actor, '--kind', kind])
  const task = (await cli(['task', 'create', '--title', 'Real approval boundary', '--description',
    `This is an authorized test of pending approvals. Request exec_command with sandbox_permissions=require_escalated and command ${JSON.stringify(`touch '${marker}'`)}. Use justification "Request approval for the isolated Pardner marker fixture". Wait for the approval decision. Do not attempt another tool, write, workaround, or approval answer. The controller will interrupt this request without approving it.`])).result.taskId
  const queuedTask = (await cli(['task', 'create', '--title', 'Must remain queued during approval'])).result.taskId
  report.taskIds = [task, queuedTask]
  const endpoint = `ws://127.0.0.1:${await availablePort()}`
  report.codexVersion = (await execute(args[2], ['--version'])).stdout.trim()
  const codex = launch(args[2], ['app-server', '--disable', 'plugins', '--disable', 'apps', '--listen', endpoint])
  control = new CodexBridgeAdapter({ endpoint, requestTimeoutMs: 30000 })
  await eventually(async () => { codex.check(); try { await control.connect(); return true } catch { return false } })
  const result = await control.call('thread/start', { cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user',
    model: 'gpt-5.6-luna', config: { model_reasoning_effort: 'low' } })
  assert.equal(result.model, 'gpt-5.6-luna')
  assert.equal(result.reasoningEffort, 'low')
  assert.equal(result.approvalPolicy, 'on-request')
  assert.equal(result.approvalsReviewer, 'user')
  assert.equal(result.sandbox.type, 'readOnly')
  mapping = { actorId: 'probe', enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge', endpoint,
    threadId: result.thread.id, worktree: cwd, allowedTaskIds: [task, queuedTask], allowedFromActorIds: ['human'],
    expectedPolicy: { approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer, sandbox: result.sandbox } }
  report.session = { ...mapping, model: result.model, reasoningEffort: result.reasoningEffort }
  await control.call('thread/inject_items', { threadId: mapping.threadId, items: [{ type: 'message', role: 'user',
    content: [{ type: 'input_text', text: 'You are the approval-boundary probe. Wait for the bounded Pardner task.' }] }] })
  await control.call('thread/name/set', { threadId: mapping.threadId, name: `Pardner rehearsal · approval · ${runId.slice(0, 8)}` })
  const config = { workspaceId: status.workspaceId, replicaId: status.replicaId, dataDirectory: data, inboxDirectory: join(root, 'inbox'), mappings: [mapping] }
  await save('bridge.json', config)
  inbox = await openBridgeInbox(config)
  bridge = new AgentBridge({ config, inbox, source: new BridgeSource(config) })
  await bridge.start()
  await handoff(task, 'Perform only the approval-boundary request described in this task.')
  console.log(`[${runId}] Waiting for a real Luna/low approval request`)
  const adapter = bridge.adapters.get('probe')
  await eventually(() => [...adapter.requests.values()].some(request => request.method.includes('requestApproval')), { timeoutMs: 180000, label: 'real approval request' })
  report.requests = [...adapter.requests.values()]
  await handoff(queuedTask, 'This delivery must stay queued while approval is pending. Do not execute it.')
  await eventually(() => inbox.rows().some(row => row.mention.taskId === queuedTask && row.state === 'queued' && row.reason?.startsWith('blocked:')))
  for (let i = 0; i < 5; i++) {
    await delay(1000)
    await bridge.wake()
    assert.equal(await adapter.availability(mapping), 'blocked: harness input or approval required')
    assert.equal(inbox.rows().filter(row => row.state === 'accepted').length, 1)
    await markerAbsent()
  }
  report.checks = { realApprovalObserved: true, queuedWhileBlocked: true, permissionPolicyPreserved: true, markerNotWritten: true }
  await save('inbox-status.json', { deliveries: inbox.rows(), statuses: inbox.statuses() })
  assert.equal((await candidateFingerprint(candidate)).sha256, report.candidate.sha256)
  report.passed = true
} catch (error) {
  report.error = error.stack
  process.exitCode = 1
} finally {
  report.cleanupErrors = []
  try {
    await bridge?.stop()
    if (mapping) {
      const thread = await control.inspect(mapping, true)
      for (const turn of thread.turns.filter(turn => turn.status === 'inProgress')) await control.call('turn/interrupt', { threadId: mapping.threadId, turnId: turn.id })
      await eventually(async () => (await control.inspect(mapping)).status.type === 'idle')
      await markerAbsent()
      for (const taskId of report.taskIds) {
        await cli(['comment', taskId, 'Qualification probe concluded. The controller cancelled the approval; queued work was intentionally not executed.'])
        const { revisions } = await cli(['show', taskId])
        await cli(['update', taskId, '--outcome', 'completed', '--revisions', JSON.stringify({ outcome: revisions.outcome })])
      }
      await control.archive(mapping)
      assert.equal(await control.isArchived(mapping), true)
      report.checks.interruptedAndArchived = true
    }
  } catch (error) { report.cleanupErrors.push(error.message); report.passed = false; process.exitCode = 1 }
  inbox?.close()
  control?.close()
  for (const child of processes.reverse()) {
    try { await child.stop() } catch (error) { report.cleanupErrors.push(error.message); report.passed = false; process.exitCode = 1 }
  }
  report.finishedAt = new Date().toISOString()
  await save('report.json', report)
  console.log(JSON.stringify({ runId, passed: report.passed, checks: report.checks, error: report.error, cleanupErrors: report.cleanupErrors }))
}
