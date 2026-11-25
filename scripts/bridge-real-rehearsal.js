import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { CodexBridgeAdapter } from '../lib/codex-bridge-adapter.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'
import { availablePort, startProcess, eventually, freezeCandidate, createWorktrees, requirements, HarnessProxy, execute, sha256 } from '../support/bridge-rehearsal.js'
import { completionTaskDescription, rehearseCompletion } from '../support/bridge-completion-rehearsal.js'

const args = process.argv.slice(2)
if (!args.includes('--run')) {
  console.log('Run real Codex inference in isolated worktrees: node scripts/bridge-real-rehearsal.js --run [--codex /path/to/codex] [--model gpt-5.6-luna --reasoning-effort low] [--shared-worktree] [--completion-lifecycle] [--drop-dispatch-reply] [--idle-seconds 3600]')
  process.exit(0)
}
const valueOptions = ['--idle-seconds', '--codex', '--model', '--reasoning-effort']
const allowed = new Set(['--run', '--drop-dispatch-reply', '--completion-lifecycle', '--shared-worktree', ...valueOptions])
for (let i = 0; i < args.length; i++) {
  assert.ok(allowed.has(args[i]), `Unknown option ${args[i]}`)
  if (valueOptions.includes(args[i])) { assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'Supply an option value'); i++ }
}
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const idleSeconds = Number(option('--idle-seconds') ?? 0)
const codexBinary = option('--codex') ?? 'codex'
const requestedModel = option('--model')
const requestedEffort = option('--reasoning-effort')
const sharedWorktree = args.includes('--shared-worktree')
assert.ok(!requestedEffort || requestedModel, '--reasoning-effort requires --model')
assert.ok(Number.isInteger(idleSeconds) && idleSeconds >= 0 && idleSeconds <= 3600)
const source = fileURLToPath(new URL('..', import.meta.url))
const runId = randomUUID()
const root = resolve(source, '.pardner', 'bridge-rehearsals', runId)
await mkdir(root, { recursive: true, mode: 0o700 })
const candidateDirectory = join(root, 'candidate')
const serviceDirectory = join(root, 'service')
const configPath = join(root, 'bridge.json')
const challenge = randomUUID()
const report = { runId, challenge, startedAt: new Date().toISOString(), passed: false, checks: {}, limitations: [
  'Co-host rehearsal only; separate-machine, hub-partition, and approval round trips are not qualified by this run.',
] }
report.topology = sharedWorktree ? 'shared-worktree' : 'separate-worktrees'
const processes = []
let control, proxy, bridge, crashRecovery
let serviceToken = ''
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PARDNER_')))
const safe = value => serviceToken ? value.replaceAll(serviceToken, '[REDACTED]') : value
const save = async (name, value) => writeFile(join(root, name), safe(JSON.stringify(value, null, 2)), { mode: 0o600 })
const progress = message => console.log(`[${runId.slice(0, 8)}] ${message}`)
const launch = (command, argv, options = {}) => { const child = startProcess(command, argv, { env: cleanEnvironment, ...options }); processes.push(child); return child }
const cliPath = join(candidateDirectory, 'bin/pardner.js')
async function cli(args) {
  const { stdout } = await execute(process.execPath, [cliPath, '--data', serviceDirectory, '--json', ...args], { env: cleanEnvironment, timeout: 10000 })
  const result = JSON.parse(stdout)
  assert.equal(result.success, true, JSON.stringify(result))
  return result
}
async function handoff(taskId, to, actor, message) {
  const { revisions } = await cli(['show', taskId, '--actor', actor])
  return cli(['handoff', taskId, '--to', to, '--message', message,
    '--revisions', JSON.stringify({ assignee: revisions.assignee }), '--actor', actor])
}
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`
const nodeCommand = [process.execPath, cliPath, '--data', serviceDirectory].map(shellQuote).join(' ')

try {
  progress(`Freezing the application candidate and creating ${sharedWorktree ? 'one shared' : 'two separate'} isolated Git worktree(s)`)
  report.candidate = await freezeCandidate(source, candidateDirectory)
  report.worktrees = await createWorktrees(root, challenge, { shared: sharedWorktree })
  await save('candidate.json', report.candidate)
  const service = launch(process.execPath, [cliPath, 'serve', '--data', serviceDirectory, '--http-port', '0', '--ws-port', '0'])
  await eventually(() => { service.check(); return service.output().stdout.includes('\n') }, { label: 'Pardner service' })
  const connection = JSON.parse(await readFile(join(serviceDirectory, 'connection.json'), 'utf8'))
  serviceToken = connection.token
  report.service = await cli(['status'])
  for (const [id, kind] of [['human', 'human'], ['builder', 'agent'], ['reviewer', 'agent']]) {
    await cli(['actors', 'register', id, '--handle', id, '--kind', kind, '--actor', 'human'])
  }
  const common = `This is real bridge qualification ${runId}. Challenge: ${challenge}.
Every handoff JSON must preserve runId=${JSON.stringify(runId)} and challenge=${JSON.stringify(challenge)} exactly. These are fixed correlation IDs, not new operation IDs.
Use the Pardner CLI to read the assigned task: ${nodeCommand} show TASK_ID --actor ACTOR_ID.
Use --actor explicitly for every write. Use fresh operation IDs for new writes and preserve IDs when retrying.
Do not call mentions claim-next or ack; the bridge owns receipt. Do not commit, push, access other services, or modify files outside your worktree.
${sharedWorktree ? 'Both Actors share this test worktree. Builder may change only queue.mjs and queue.test.mjs. Reviewer may change only reviewer.test.mjs; preserve the builder files.' : "Only queue.mjs and queue.test.mjs may change. Do not read the other Actor's worktree."}
Finish by using the real Pardner handoff command, not just by replying in chat. Get the current assignee revision from show before handoff.
The handoff message must be a JSON string (serialize it with JSON.stringify using a Node script and invoke CLI via execFileSync, not shell interpolation).
Record your actual cwd, challenge, source SHA256, test command/output, and session Actor in the message.`
  const description = `${requirements}\n\n${common}
BUILDER: implement queue.mjs (export challenge = ${JSON.stringify(challenge)}) and your tests. Run them.
Hand off this task to reviewer with a message containing JSON fields kind="builder-artifact", runId, challenge, actor="builder", cwd, source (full queue.mjs), sourceSha256, tests (full queue.test.mjs), and testOutput.
REVIEWER: ${sharedWorktree ? 'Read queue.mjs from the shared worktree and verify that its exact contents and SHA256 match the builder-artifact handoff. Do not rewrite the implementation or builder tests. Write your own independent reviewer.test.mjs.' : "Obtain the source ONLY from the builder-artifact handoff in this task's comments. Verify its SHA256, write queue.mjs in your own worktree, and write your own independent queue.test.mjs."} Run your tests.
If it passes, hand off to human with message JSON fields kind="review-result", runId, challenge, actor="reviewer", cwd, sourceSha256, verdict="pass", testOutput. If it fails, report verdict="fail" to human with specific evidence. Never impersonate another Actor.`
  const task = await cli(['task', 'create', '--title', `Bridge qualification ${runId.slice(0, 8)}`, '--description', description, '--actor', 'human'])
  report.taskId = task.result.taskId
  const busyTask = await cli(['task', 'create', '--title', 'Busy-session receipt check', '--description',
    `${common}\nThis is the separate busy-session check. Do not change any files. Read this task, then hand it to human with JSON message fields kind="busy-result", runId=${JSON.stringify(runId)}, challenge=${JSON.stringify(challenge)}, actor="builder", cwd, verdict="pass". Do not redo the coding task.`, '--actor', 'human'])
  report.busyTaskId = busyTask.result.taskId
  if (args.includes('--completion-lifecycle')) {
    const task = await cli(['task', 'create', '--title', 'Completion lifecycle probe', '--description', completionTaskDescription(challenge), '--actor', 'human'])
    report.lifecycleTaskId = task.result.taskId
  }

  const endpoint = `ws://127.0.0.1:${await availablePort()}`
  report.codexVersion = (await execute(codexBinary, ['--version'])).stdout.trim()
  const codex = launch(codexBinary, ['app-server', '--disable', 'plugins', '--disable', 'apps', '--listen', endpoint])
  control = new CodexBridgeAdapter({ endpoint, requestTimeoutMs: 30000 })
  await eventually(async () => { codex.check(); try { await control.connect(); return true } catch { return false } }, { label: 'Codex App Server', timeoutMs: 45000 })
  const account = await control.call('account/read', { refreshToken: false })
  assert.ok(account.account || !account.requiresOpenaiAuth, 'Sign in with codex login before running the real rehearsal')
  report.authenticated = true
  if (requestedModel) {
    let cursor, selected
    do {
      const page = await control.call('model/list', { limit: 100, includeHidden: true, cursor })
      selected = page.data.find(model => model.model === requestedModel)
      cursor = page.nextCursor
    } while (!selected && cursor)
    assert.ok(selected, `Requested model is unavailable: ${requestedModel}`)
    if (requestedEffort) assert.ok(selected.supportedReasoningEfforts.some(value => value.reasoningEffort === requestedEffort),
      `Unsupported reasoning effort for ${requestedModel}: ${requestedEffort}`)
    report.requestedModel = requestedModel
    report.requestedReasoningEffort = requestedEffort
  }
  proxy = new HarnessProxy(endpoint, { dropDispatchReply: args.includes('--drop-dispatch-reply'), dropArchiveReply: args.includes('--completion-lifecycle') })
  const bridgeEndpoint = await proxy.start()
  report.sessions = {}
  const mappings = []
  for (const actor of ['builder', 'reviewer']) {
    const cwd = report.worktrees[actor]
    const result = await control.call('thread/start', {
      cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request',
      ...(requestedModel ? { model: requestedModel } : {}),
      config: { sandbox_workspace_write: { network_access: true },
        ...(requestedEffort ? { model_reasoning_effort: requestedEffort } : {}) },
    })
    if (requestedModel) assert.equal(result.model, requestedModel)
    if (requestedEffort) assert.equal(result.reasoningEffort, requestedEffort)
    assert.equal(result.sandbox.type, 'workspaceWrite', 'Rehearsal requires a bounded workspace-write sandbox')
    assert.equal(result.approvalPolicy, 'on-request')
    const expectedPolicy = { approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer, sandbox: result.sandbox }
    report.sessions[actor] = { threadId: result.thread.id, model: result.model, reasoningEffort: result.reasoningEffort, cwd, expectedPolicy }
    progress(`${actor}: ${result.model}, reasoning ${result.reasoningEffort}`)
    await control.call('thread/inject_items', { threadId: result.thread.id, items: [{ type: 'message', role: 'user',
      content: [{ type: 'input_text', text: `You are ${actor} in authorized Pardner rehearsal ${runId}. Wait for the bridge to deliver your task. Do not check queues independently.` }] }] })
    await control.call('thread/name/set', { threadId: result.thread.id, name: `Pardner rehearsal · ${actor} · ${runId.slice(0, 8)}` })
    mappings.push({ actorId: actor, enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge', endpoint: bridgeEndpoint,
      threadId: result.thread.id, worktree: cwd, expectedPolicy, allowedTaskIds: [report.taskId, report.busyTaskId, report.lifecycleTaskId].filter(Boolean), allowedFromActorIds: ['human', 'builder', 'reviewer'] })
  }
  await save('bridge.json', { workspaceId: report.service.workspaceId, replicaId: report.service.replicaId,
    completionCleanup: { archiveDirectory: join(root, 'archived-worktrees') },
    dataDirectory: serviceDirectory, inboxDirectory: join(root, 'inbox'), mappings })
  await save('setup.json', { runId, challenge, taskId: report.taskId, busyTaskId: report.busyTaskId, sessions: report.sessions, service: report.service, worktrees: report.worktrees })
  const launchBridge = async () => {
    bridge = launch(process.execPath, [cliPath, 'bridge', 'run', '--config', configPath])
    await eventually(() => { bridge.check(); return bridge.output().stdout.includes('\n') }, { label: 'bridge startup', timeoutMs: 45000 })
  }
  proxy.on('event', event => {
    if (event.type === 'reply-dropped') {
      crashRecovery = (async () => {
        progress('Real dispatch accepted: dropping its response, killing the bridge, then restarting it')
        await bridge.stop('SIGKILL')
        await launchBridge()
        report.checks.bridgeRestartedAfterLostReply = true
      })()
      crashRecovery.catch(() => {})
    }
  })
  await launchBridge()
  report.handoffAt = Date.now()
  progress('Handing work to the builder through Pardner; no manual session prompt')
  await handoff(report.taskId, 'builder', 'human', `Begin the bounded coding task. Read its full description. Challenge ${challenge}.`)
  await eventually(() => proxy.events.find(event => event.type === 'accepted' && event.threadId === report.sessions.builder.threadId), { label: 'real builder dispatch', timeoutMs: 45000 })
  report.busyHandoffAt = Date.now()
  await handoff(report.busyTaskId, 'builder', 'human', `After your current turn, perform this separate busy-session receipt check. Challenge ${challenge}.`)
  progress('Builder is active; a second delivery is queued to verify busy-session behavior')
  let lastProgress = Date.now()
  const context = await eventually(async () => {
    service.check(); codex.check()
    await crashRecovery
    bridge.check()
    const blocked = proxy.events.find(event => event.type === 'input-required')
    if (blocked) throw new Error(`Real harness needs input (${blocked.method}); no approval was auto-answered`)
    const failed = proxy.events.find(event => event.type === 'completed' && event.status !== 'completed')
    if (failed) throw new Error(`Real model turn ${failed.turnId} ended ${failed.status}: ${JSON.stringify(failed.error)}`)
    if (Date.now() - lastProgress > 30000) {
      progress(`${proxy.events.filter(event => event.type === 'accepted').length} accepted turn(s), ${proxy.events.filter(event => event.type === 'completed').length} completed turn(s)`)
      lastProgress = Date.now()
    }
    const taskContext = await cli(['show', report.taskId, '--actor', 'human'])
    const busyContext = await cli(['show', report.busyTaskId, '--actor', 'human'])
    return taskContext.task.assignee === 'human' && busyContext.task.assignee === 'human' ? { taskContext, busyContext } : null
  }, { timeoutMs: 15 * 60 * 1000, intervalMs: 1000, label: 'real builder/reviewer/human round trip' })
  await crashRecovery
  await save('task-context.json', context)
  const messages = context.taskContext.comments.map(comment => {
    try { return { ...JSON.parse(comment.content), recordedActor: comment.actorId } } catch { return null }
  }).filter(Boolean)
  const artifact = messages.find(message => message.kind === 'builder-artifact' && message.recordedActor === 'builder')
  const review = messages.find(message => message.kind === 'review-result' && message.recordedActor === 'reviewer')
  assert.ok(artifact && review, 'Real Actors must publish their artifact and review through Pardner')
  for (const [actor, evidence] of [['builder', artifact], ['reviewer', review]]) {
    assert.equal(evidence.runId, runId); assert.equal(evidence.challenge, challenge)
    assert.equal(evidence.actor, actor); assert.equal(await realpath(evidence.cwd), report.worktrees[actor])
  }
  assert.equal(review.verdict, 'pass', JSON.stringify(review))
  const busyProof = context.busyContext.comments.filter(comment => comment.actorId === 'builder').map(comment => {
    try { return JSON.parse(comment.content) } catch { return null }
  }).find(message => message?.kind === 'busy-result')
  assert.ok(busyProof, 'Busy task needs an attributed result from the real builder')
  assert.equal(busyProof.runId, runId); assert.equal(busyProof.challenge, challenge)
  assert.equal(busyProof.verdict, 'pass'); assert.equal(await realpath(busyProof.cwd), report.worktrees.builder)
  assert.equal(sha256(artifact.source), artifact.sourceSha256)
  assert.equal(review.sourceSha256, artifact.sourceSha256)
  report.checks.artifactTransfer = true
  if (sharedWorktree) {
    assert.equal(report.worktrees.builder, report.worktrees.reviewer)
    assert.equal(await readFile(join(report.worktrees.builder, 'queue.test.mjs'), 'utf8'), artifact.tests, 'Reviewer must preserve builder tests in the shared worktree')
    report.checks.sharedWorktree = true
  }
  const independentTest = `import assert from 'node:assert/strict';
const { selectReadyTasks, challenge } = await import(process.argv[2]);
assert.equal(challenge, ${JSON.stringify(challenge)});
const tasks = [
 {id:'z',assignee:'builder',state:'open',priority:'p2',created_at:'2026-01-01'},
 {id:'b',assignee:'builder',state:'open',priority:'p0',created_at:'2026-01-02'},
 {id:'a',assignee:'builder',state:'open',priority:'p0',created_at:'2026-01-02'},
 {id:'old',assignee:'builder',state:'open',priority:'p0',created_at:'2026-01-01'},
 {id:'missing',assignee:'builder',state:'open',created_at:'2025-01-01'},
 {id:'unknown',assignee:'builder',state:'open',priority:'invalid',created_at:'2025-01-02'},
 {id:'other',assignee:'reviewer',state:'open',priority:'p0',created_at:'2020-01-01'},
 {id:'done',assignee:'builder',state:'ended',priority:'p0',created_at:'2020-01-01'}
];
const before=JSON.stringify(tasks); tasks.forEach(Object.freeze); Object.freeze(tasks);
assert.deepEqual(selectReadyTasks(tasks,'builder',20).map(x=>x.id),['old','a','b','z','missing','unknown']);
assert.deepEqual(selectReadyTasks(tasks,'builder',2).map(x=>x.id),['old','a']);
assert.equal(selectReadyTasks(tasks,'builder',1)[0],tasks[3]);
assert.deepEqual(selectReadyTasks([], 'builder',1),[]);
for(const limit of [0,-1,1.2,NaN,Infinity,'2']) assert.throws(()=>selectReadyTasks(tasks,'builder',limit),RangeError);
assert.equal(JSON.stringify(tasks),before); console.log('Independent queue assertions passed');`
  await writeFile(join(root, 'independent-check.mjs'), independentTest)
  for (const actor of ['builder', 'reviewer']) {
    const cwd = report.worktrees[actor]
    assert.equal(sha256(await readFile(join(cwd, 'queue.mjs'))), artifact.sourceSha256)
    const checks = await execute(process.execPath, [join(root, 'independent-check.mjs'), join(cwd, 'queue.mjs')], { timeout: 10000 })
    const testFile = sharedWorktree && actor === 'reviewer' ? 'reviewer.test.mjs' : 'queue.test.mjs'
    const agentTests = await execute(process.execPath, ['--test', testFile], { cwd, timeout: 10000 })
    const diff = await execute('git', ['diff', '--', 'queue.mjs'], { cwd })
    await save(`${actor}-verification.json`, { independent: checks.stdout, tests: agentTests.stdout, diff: diff.stdout })
    const changed = (await execute('git', ['status', '--porcelain'], { cwd })).stdout.trimEnd().split('\n').filter(Boolean)
    const allowedFiles = ['queue.mjs', 'queue.test.mjs', ...(sharedWorktree ? ['reviewer.test.mjs'] : [])]
    assert.ok(changed.every(line => allowedFiles.includes(line.slice(3))), `Unexpected ${actor} worktree changes: ${changed}`)
  }
  report.checks.independentTests = true
  await eventually(() => proxy.events.filter(event => event.type === 'completed').length >= 3, { label: 'three completed model turns', timeoutMs: 120000 })
  const accepted = proxy.events.filter(event => event.type === 'accepted')
  assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, 3, 'Expected exactly three model dispatch attempts, including recovery')
  assert.equal(accepted.filter(event => event.threadId === report.sessions.builder.threadId).length, 2)
  assert.equal(accepted.filter(event => event.threadId === report.sessions.reviewer.threadId).length, 1)
  const builderAccepts = accepted.filter(event => event.threadId === report.sessions.builder.threadId)
  const firstComplete = proxy.events.find(event => event.type === 'completed' && event.turnId === builderAccepts[0].turnId)
  assert.ok(firstComplete && report.busyHandoffAt < firstComplete.at, 'The second delivery must actually arrive during a busy turn')
  assert.ok(firstComplete && builderAccepts[1].at >= firstComplete.at, 'Busy delivery dispatched before the first turn completed')
  report.checks.busyQueue = true
  const resumedSettings = proxy.events.filter(event => event.type === 'session-settings')
  for (const session of Object.values(report.sessions)) {
    assert.ok(resumedSettings.some(event => event.threadId === session.threadId), 'Expected settings from each resumed test session')
  }
  for (const settings of resumedSettings) {
    if (requestedModel) assert.equal(settings.model, requestedModel)
    if (requestedEffort) assert.equal(settings.reasoningEffort, requestedEffort)
  }
  report.checks.duplicateNotifications = proxy.events.some(event => event.type === 'duplicate-notification')
  assert.equal(report.checks.duplicateNotifications, true, 'The relay must exercise duplicate notifications')
  if (args.includes('--drop-dispatch-reply')) assert.equal(report.checks.bridgeRestartedAfterLostReply, true)
  report.dispatchLatencyMs = builderAccepts[0].at - report.handoffAt
  assert.ok(report.dispatchLatencyMs <= 2000, `Healthy dispatch exceeded two seconds: ${report.dispatchLatencyMs}ms`)
  report.roundTripMs = Date.now() - report.handoffAt
  if (idleSeconds) {
    progress(`Observing ${idleSeconds} real idle seconds without model polling`)
    const before = proxy.events.filter(event => event.type === 'dispatch').length
    const began = Date.now()
    while (Date.now() - began < idleSeconds * 1000) { await delay(1000); bridge.check(); codex.check() }
    assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, before)
    report.checks.idle = { seconds: idleSeconds, modelRequests: 0 }
  } else report.checks.idle = { status: 'not-run', command: '--idle-seconds 3600' }
  if (report.lifecycleTaskId) {
    await rehearseCompletion({ report, root, cli, handoff, control, proxy, configPath, progress, save,
      checkProcesses: () => { bridge.check(); service.check(); codex.check() },
      restartBridge: async signal => { await bridge.stop(signal); await launchBridge() },
    })
  }
  assert.equal((await candidateFingerprint(candidateDirectory)).sha256, report.candidate.sha256)
  report.passed = true
  progress(`PASS: ${report.dispatchLatencyMs}ms initial dispatch; complete real-agent round trip verified`)
} catch (error) {
  report.error = safe(error.stack ?? String(error))
  process.exitCode = 1
  progress(`FAIL: ${safe(error.message)}`)
} finally {
  if (proxy) await save('protocol-events.json', proxy.events)
  if (bridge) {
    try { await save('inbox-status.json', await cli(['bridge', 'status', '--config', configPath])) } catch { /* Setup may have failed before an inbox existed. */ }
  }
  // Interrupt only the two test-owned threads before closing the dedicated server.
  if (control?.ready && report.sessions) {
    for (const session of Object.values(report.sessions)) {
      try {
        const { thread } = await control.call('thread/read', { threadId: session.threadId, includeTurns: true })
        assert.equal(thread.id, session.threadId)
        await save(`session-${session.threadId}.json`, { id: thread.id, cwd: thread.cwd, status: thread.status,
          turns: thread.turns.map(turn => ({ id: turn.id, status: turn.status, error: turn.error,
            messages: turn.items.filter(item => item.type === 'agentMessage').map(item => item.text) })) })
        for (const turn of thread.turns.filter(turn => turn.status === 'inProgress')) {
          await control.call('turn/interrupt', { threadId: session.threadId, turnId: turn.id })
        }
      } catch { /* The dedicated process is also stopped below. */ }
    }
  }
  control?.close()
  const cleanup = await Promise.allSettled(processes.reverse().map(process => process.stop()))
  await proxy?.close()
  report.cleanupErrors = cleanup.filter(result => result.status === 'rejected').map(result => String(result.reason))
  if (report.cleanupErrors.length) { report.passed = false; process.exitCode = 1 }
  report.finishedAt = new Date().toISOString()
  await save('report.json', report)
  console.log(`Evidence: ${join(root, 'report.json')}`)
}
