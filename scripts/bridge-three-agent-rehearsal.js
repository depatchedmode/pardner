import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { CodexBridgeAdapter } from '../lib/codex-bridge-adapter.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'
import { availablePort, startProcess, eventually, execute, freezeCandidate, createWorktrees, auditThreeAgentWorktree, deliveryTiming, requirements, HarnessProxy, sha256 } from '../support/bridge-rehearsal.js'
import { reviewRound, collectReviews, nextReviewAction, submitOnce, reviewerActors, readWithinConvergence } from '../support/three-agent-review.js'

const args = process.argv.slice(2)
const usage = 'node scripts/bridge-three-agent-rehearsal.js --check|--run [--codex /path/to/codex] [--drop-dispatch-reply]'
if (!args.includes('--run') && !args.includes('--check')) { console.log(usage); process.exit(0) }
for (let i = 0; i < args.length; i++) {
  assert.ok(['--run', '--check', '--codex', '--drop-dispatch-reply'].includes(args[i]), `Unknown option ${args[i]}`)
  if (args[i] === '--codex') { assert.ok(args[++i] && !args[i].startsWith('--')); }
}
assert.ok(!(args.includes('--run') && args.includes('--check')), 'Choose check or run')
assert.equal(process.version, 'v24.11.1', 'Use the repository Node pin')
const codexBinary = args.includes('--codex') ? args[args.indexOf('--codex') + 1] : 'codex'
const checkOnly = args.includes('--check')
const source = fileURLToPath(new URL('..', import.meta.url))
const runId = randomUUID(), challenge = randomUUID()
const root = join(source, '.pardner', 'three-agent-rehearsals', runId)
await mkdir(root, { recursive: true, mode: 0o700 })
const candidate = join(root, 'candidate'), data = join(root, 'service'), configPath = join(root, 'bridge.json')
const bounds = { dispatchMs: 2000, startupMs: 45000, convergenceMs: 30000, modelWorkflowMs: 20 * 60 * 1000, idleSeconds: 5 }
const report = { runId, startedAt: new Date().toISOString(), passed: false, topology: 'one-host-one-replica-three-isolated-worktrees',
  bounds, checks: {}, interventions: [], limitations: [
    'Separate-machine, hub-loss, multi-user authorization, other adapters, and hosted/Desktop task wake-up are not qualified.',
    'Human acceptance, a human approval-and-resume UI, and one-hour idle observation are not run.',
    'Actor attribution is workspace evidence, not cryptographic identity. External effects have no exactly-once guarantee.',
  ] }
const actors = ['builder', ...reviewerActors], processes = [], controls = []
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PARDNER_')))
let bridge, proxy, control, token = '', recovery = Promise.resolve(), config
let stopRequested
const requestStop = signal => { stopRequested = new Error(`Operator requested ${signal}; stopping qualification-owned processes`) }
const onInterrupt = () => requestStop('SIGINT'), onTerminate = () => requestStop('SIGTERM')
process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate)
const assertRunning = () => { if (stopRequested) throw stopRequested }
const safe = text => token ? text.replaceAll(token, '[REDACTED]') : text
const save = (name, value) => writeFile(join(root, name), safe(JSON.stringify(value, null, 2)), { mode: 0o600 })
report.transportEvents = []
for (const [name, stream] of [['stdout', process.stdout], ['stderr', process.stderr]]) stream.on('error', error => {
  if (error.code !== 'EPIPE') throw error
  report.transportEvents.push({ stream: name, code: error.code, at: new Date().toISOString() })
  writeFileSync(join(root, 'transport-events.json'), JSON.stringify(report.transportEvents), { mode: 0o600 })
})
const progress = message => {
  writeFileSync(join(root, 'progress.json'), JSON.stringify({ runId, at: new Date().toISOString(), message }), { mode: 0o600 })
  console.log(`[${runId.slice(0, 8)}] ${message}`)
}
const launch = (command, argv) => {
  const child = startProcess(command, argv, { env: environment }); processes.push(child)
  child.qualificationCommand = command; child.qualificationArgs = argv
  writeFileSync(join(root, 'processes.json'), JSON.stringify({ driverPid: process.pid,
    processes: processes.map(handle => ({ pid: handle.child.pid, command: handle.qualificationCommand, args: handle.qualificationArgs })) }), { mode: 0o600 })
  return child
}
const cliPath = join(candidate, 'bin/pardner.js')
async function cli(argv) {
  const submit = async signal => {
    try {
      const output = await execute(process.execPath, [cliPath, '--data', data, '--json', ...argv], { env: environment, timeout: 10000, maxBuffer: 4 * 1024 * 1024, signal })
      const result = JSON.parse(output.stdout)
      assert.equal(result.success, true, safe(JSON.stringify(result)))
      return result
    } catch (error) {
      let body
      try { body = JSON.parse(error.stdout) } catch { /* A transport timeout may have no JSON body. */ }
      const failure = new Error(`CLI ${argv[0]} failed (${body?.error?.code ?? error.code ?? 'unknown'}): ${body?.error?.message ?? error.message}`, { cause: error })
      failure.cliDiagnostic = { argv, code: error.code, signal: error.signal, killed: error.killed,
        stdout: error.stdout, stderr: error.stderr }
      await save('cli-last-error.json', failure.cliDiagnostic)
      throw failure
    }
  }
  const readOnly = ['show', 'status'].includes(argv[0]) || (argv[0] === 'bridge' && argv[1] === 'status')
  if (!readOnly) return submit()
  return readWithinConvergence(submit, { timeoutMs: bounds.convergenceMs, onError: async error => {
    assertRunning()
    report.readRetries ??= []
    report.readRetries.push({ command: argv[0], at: new Date().toISOString(), message: safe(error.message) })
    await save('read-retries.json', report.readRetries)
  } })
}
const outbox = join(root, 'outbox')
async function handoff(key, taskId, to, message, status = 'review') {
  return submitOnce(outbox, key, async () => {
    const { revisions } = await cli(['show', taskId, '--actor', 'coordinator'])
    return ['handoff', taskId, '--to', to, '--status', status, '--message', JSON.stringify(message),
      '--actor', 'coordinator', '--operation-id', `${runId}-${key}`,
      '--revisions', JSON.stringify({ assignee: revisions.assignee, status: revisions.status })]
  }, cli)
}
async function comment(key, taskId, message) {
  return submitOnce(outbox, key, () => ['comment', taskId, JSON.stringify(message), '--actor', 'coordinator',
    '--operation-id', `${runId}-${key}`], cli)
}
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
const nodeCommand = [process.execPath, cliPath, '--data', data].map(quote).join(' ')
const messages = context => context.comments.flatMap(comment => {
  try { return [{ ...JSON.parse(comment.content), commentId: comment.id, recordedActor: comment.actorId }] } catch { return [] }
})

try {
  const endpoint = `ws://127.0.0.1:${await availablePort()}`
  report.codexVersion = (await execute(codexBinary, ['--version'])).stdout.trim()
  const codex = launch(codexBinary, ['app-server', '--disable', 'plugins', '--disable', 'apps', '--listen', endpoint])
  control = new CodexBridgeAdapter({ endpoint, requestTimeoutMs: 30000 }); controls.push(control)
  await eventually(async () => { assertRunning(); codex.check(); try { await control.connect(); return true } catch { return false } },
    { timeoutMs: bounds.startupMs, label: 'dedicated App Server' })
  const account = await control.call('account/read', { refreshToken: false })
  assert.ok(account.account || !account.requiresOpenaiAuth, 'Existing Codex authentication is required; no credentials are created or copied')
  const catalog = []
  let cursor
  do { const page = await control.call('model/list', { includeHidden: true, limit: 100, cursor }); catalog.push(...page.data); cursor = page.nextCursor } while (cursor)
  const readinessCwd = join(root, 'readiness'); await mkdir(readinessCwd)
  const readiness = await control.call('thread/start', { cwd: readinessCwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' })
  assert.ok(catalog.some(model => model.model === readiness.model), 'Configured model is absent from the current server catalog')
  report.readiness = { authenticated: true, configuredModel: readiness.model, reasoningEffort: readiness.reasoningEffort,
    modelListed: true, modelAccess: 'not-proven-until-real-turn', modelRequests: 0 }
  await control.call('thread/inject_items', { threadId: readiness.thread.id, items: [{ type: 'message', role: 'user',
    content: [{ type: 'input_text', text: 'Readiness fixture only. No model action requested.' }] }] })
  await control.archive({ threadId: readiness.thread.id, worktree: readinessCwd,
    expectedPolicy: { approvalPolicy: readiness.approvalPolicy, approvalsReviewer: readiness.approvalsReviewer, sandbox: readiness.sandbox } })
  progress(`Readiness: ${report.codexVersion}, configured model ${readiness.model}; no inference yet`)
  assertRunning()
  if (checkOnly) { report.passed = true; report.checks.readiness = true }
  else {
    report.candidate = await freezeCandidate(source, candidate)
    report.worktrees = await createWorktrees(root, challenge, { actors })
    const repository = join(root, 'fixture-repository')
    const service = launch(process.execPath, [cliPath, 'serve', '--data', data, '--http-port', '0', '--ws-port', '0'])
    await eventually(() => { service.check(); return service.output().stdout.includes('\n') }, { label: 'isolated Pardner service' })
    token = JSON.parse(await readFile(join(data, 'connection.json'), 'utf8')).token
    report.service = await cli(['status'])
    for (const actor of ['human', 'coordinator', ...actors]) await cli(['actors', 'register', actor, '--handle', actor,
      '--kind', actor === 'human' ? 'human' : 'agent', '--actor', 'human'])
    const common = `Authorized bounded Pardner qualification. Fixed runId=${JSON.stringify(runId)}; challenge=${JSON.stringify(challenge)}.
Use ${nodeCommand} show TASK_ID --actor YOUR_ACTOR --json to read current synchronized context before acting.
Use --actor explicitly for all writes. Do not claim or acknowledge notifications; the bridge owns receipt.
Publishing fixture task comments and handoffs through this CLI is explicitly authorized. The CLI reads its connection file and sends HTTP RPC to the running loopback service, which owns the data writes. Run these commands normally in your inspected workspace-write sandbox with its network access. The service data path being outside your worktree does not require a direct filesystem write or sandbox escalation. If a normal CLI command fails, retain its concrete error; do not change permissions or request escalation merely to publish an authorized fixture result.
Use execFileSync from a Node script to invoke CLI arguments and JSON safely; never interpolate JSON into shell commands.
Read only your worktree and immutable Git objects in ${repository}. Do not change Git metadata, other worktrees, services, credentials, or model/permission configuration. No push, merge, deployment, or human acceptance.
Do not start other agents. Finish required coordination via Pardner, not chat alone. Every actionable message includes an explicit @recipient.
Publish structured results with these exact fixed correlation IDs. Fresh operation IDs identify new writes; retries preserve IDs.`
    const parentDescription = `${requirements}\n\n${common}
You are builder. Initially implement the stated contract in queue.mjs and queue.test.mjs and run your tests.
Only queue.mjs, queue.test.mjs, and ignored *.log files may be written. Use inline Node scripts for CLI coordination rather than additional helper files.
Declared correction exercise: after BOTH independent initial reviews, the coordinator introduces the additional requirement to exclude tasks with blocked === true. This is a planned second phase, not an invented bug. Do not implement it before the correction-request.
Publish a JSON comment here: kind="builder-artifact", runId, challenge, round=1 or 2, actor="builder", cwd, source (full queue.mjs), sourceSha256 (SHA256 of exact UTF-8 source), testEvidence={command,output,passed:true}. Do not commit. The coordinator freezes your submitted artifact into an immutable Git commit and requests both reviews.
When reviewer results wake you, inspect both review tasks. Wait without modifying files unless the parent contains a coordinator correction-request for round 2. Once that request exists, implement it once, test and publish round 2 here. A duplicate or stale notification must not create another artifact or change source. The coordinator guards the two-review barrier and final handoff. Human review is not acceptance.`
    report.parentTaskId = (await cli(['task', 'create', '--title', 'Three-agent bounded queue fixture', '--description', parentDescription, '--actor', 'human'])).result.taskId
    report.reviewTaskIds = {}
    for (const actor of reviewerActors) {
      const description = `${common}\nYou are ${actor}. Parent task: ${report.parentTaskId}.
For a review-request, independently inspect the specified immutable commit with git show COMMIT:queue.mjs. Copy that exact source into your own queue.mjs; verify SHA256, then write independent reviewer.test.mjs. Do not read or reuse builder tests. Run your tests against that revision and phase requirement.
Only queue.mjs, reviewer.test.mjs, ignored *.log files, and optional review-result-round-1.json / review-result-round-2.json evidence files may be written. Use these exact names if saving result JSON; do not create executable helper files.
Hand this reviewer task to builder with status review and JSON message: kind="review-result", runId, challenge, round, commitSha, sourceSha256, actor=${JSON.stringify(actor)}, cwd, recipient="@builder", verdict="approve" or "changes-requested", findings (array of concrete strings; empty on approval), testEvidence={command,output,passed:boolean}. If tests fail, request changes with concrete evidence.
When the delivered comment kind is busy-probe, only publish a JSON comment kind="busy-result", runId, challenge, actor, recipient="@coordinator". Do not repeat review or touch files. For ordinary review, publish once per round; duplicate notifications reuse the same logical result.`
      report.reviewTaskIds[actor] = (await cli(['task', 'create', '--title', `Independent ${actor} queue review`, '--description', description, '--actor', 'human'])).result.taskId
    }
    proxy = new HarnessProxy(endpoint, { dropDispatchReply: args.includes('--drop-dispatch-reply') })
    proxy.on('event', event => appendFileSync(join(root, 'protocol-events.jsonl'), `${safe(JSON.stringify(event))}\n`, { mode: 0o600 }))
    const bridgeEndpoint = await proxy.start()
    report.sessions = {}; const mappings = []
    for (const actor of actors) {
      const result = await control.call('thread/start', { cwd: report.worktrees[actor], sandbox: 'workspace-write',
        approvalPolicy: 'on-request', approvalsReviewer: 'user', config: { sandbox_workspace_write: { network_access: true } } })
      assert.equal(result.sandbox.type, 'workspaceWrite'); assert.equal(result.approvalPolicy, 'on-request')
      const expectedPolicy = { approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer, sandbox: result.sandbox }
      report.sessions[actor] = { threadId: result.thread.id, cwd: report.worktrees[actor], model: result.model, reasoningEffort: result.reasoningEffort, expectedPolicy,
        actorId: actor, replicaId: report.service.replicaId }
      await control.call('thread/inject_items', { threadId: result.thread.id, items: [{ type: 'message', role: 'user', content: [{ type: 'input_text',
        text: `You are ${actor} in the authorized three-agent Pardner fixture ${runId}. Follow the bounded task contract delivered by the bridge. Wait for it; do not independently check queues.` }] }] })
      await control.call('thread/name/set', { threadId: result.thread.id, name: `Pardner #66 ${actor} ${runId.slice(0, 8)}` })
      mappings.push({ actorId: actor, enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge', endpoint: bridgeEndpoint,
        threadId: result.thread.id, worktree: report.worktrees[actor], expectedPolicy,
        allowedTaskIds: actor === 'builder' ? [report.parentTaskId, ...Object.values(report.reviewTaskIds)] : [report.reviewTaskIds[actor]],
        allowedFromActorIds: actor === 'builder' ? ['coordinator', ...reviewerActors] : ['coordinator'] })
    }
    config = { workspaceId: report.service.workspaceId, replicaId: report.service.replicaId, dataDirectory: data, inboxDirectory: join(root, 'inbox'), mappings }
    const launchBridge = async () => {
      bridge = launch(process.execPath, [cliPath, 'bridge', 'run', '--config', configPath])
      await eventually(() => { bridge.check(); return bridge.output().stdout.includes('\n') }, { label: 'bridge startup', timeoutMs: bounds.startupMs })
    }
    const inboxStatus = () => cli(['bridge', 'status', '--config', configPath])
    // Mismatch probe retains its received route; restoring the inspected policy
    // cannot silently redirect that old row. Later correctly mapped work proceeds.
    const originalPolicy = mappings[2].expectedPolicy
    mappings[2].expectedPolicy = { ...originalPolicy, approvalPolicy: 'never' }
    await save('bridge.json', config); await launchBridge()
    await comment('policy-probe', report.reviewTaskIds['reviewer-b'], { kind: 'policy-probe', recipient: '@reviewer-b', instruction: 'This must not execute under a mismatched policy.' })
    const unauthorized = (await cli(['task', 'create', '--title', 'Unauthorized fixture notification', '--actor', 'human'])).result.taskId
    await comment('unauthorized-probe', unauthorized, { kind: 'unauthorized-probe', recipient: '@reviewer-b', instruction: 'This task is not authorized; do not execute.' })
    await eventually(async () => {
      const status = await inboxStatus()
      return status.deliveries.some(row => row.reason?.includes('not authorized'))
        && status.states.some(state => state.state === 'PERMISSION_POLICY_CHANGED')
    }, { label: 'unauthorized and permission-policy blocking', timeoutMs: bounds.convergenceMs })
    assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, 0)
    report.checks.unauthorizedAndPolicyMismatch = true
    await save('policy-probe.json', await inboxStatus())
    await bridge.stop(); mappings[2].expectedPolicy = originalPolicy; await save('bridge.json', config); await launchBridge()
    proxy.on('event', event => {
      if (event.type !== 'reply-dropped') return
      recovery = (async () => {
        await eventually(async () => (await inboxStatus()).deliveries.some(row => row.state === 'uncertain'),
          { label: 'visible uncertain dispatch', timeoutMs: bounds.convergenceMs })
        await save('uncertain-dispatch.json', await inboxStatus())
        await bridge.stop('SIGKILL'); await launchBridge()
        report.checks.acceptedReplyLossRestart = true
        progress('Observed uncertain dispatch after real acceptance; restarted the bridge for history reconciliation')
      })()
      recovery.catch(() => {})
    })
    const kickoffAt = Date.now()
    const modelDeadline = kickoffAt + bounds.modelWorkflowMs
    await handoff('kickoff', report.parentTaskId, 'builder', { kind: 'kickoff', runId, challenge, recipient: '@builder', instruction: 'Begin phase one of the bounded fixture.' }, 'in-progress')
    progress('Initial kickoff delivered through Pardner; all subsequent workflow messages are automatic')
    const rounds = []; let busySent = false, busyVerified = false, lastProgress = Date.now(), finalContext
    await eventually(async () => {
      assertRunning(); await recovery; bridge.check(); service.check(); codex.check()
      const input = proxy.events.find(event => event.type === 'input-required')
      if (input) throw new Error(`Harness input required (${input.method}); no request was answered`)
      const failed = proxy.events.find(event => event.type === 'completed' && event.status !== 'completed')
      if (failed) throw new Error(`Model turn ended ${failed.status}: ${JSON.stringify(failed.error)}`)
      const parent = await cli(['show', report.parentTaskId, '--actor', 'coordinator'])
      const artifacts = messages(parent).filter(message => message.kind === 'builder-artifact' && message.recordedActor === 'builder')
      for (const artifact of artifacts) {
        assert.equal(artifact.runId, runId); assert.equal(artifact.challenge, challenge); assert.equal(artifact.actor, 'builder')
        assert.equal(await realpath(artifact.cwd), report.worktrees.builder)
        assert.ok([1, 2].includes(artifact.round)); assert.equal(sha256(artifact.source), artifact.sourceSha256)
        assert.equal(artifact.testEvidence?.passed, true)
        if (rounds.some(round => round.round === artifact.round)) continue
        if (artifact.round === 2) assert.equal(rounds[0]?.correctionRequested, true, 'Both initial assessments must precede revision')
        else assert.equal(rounds.length, 0)
        assert.equal(await readFile(join(report.worktrees.builder, 'queue.mjs'), 'utf8'), artifact.source)
        await writeFile(join(repository, 'queue.mjs'), artifact.source)
        await execute('git', ['add', 'queue.mjs'], { cwd: repository })
        await execute('git', ['-c', 'user.name=Pardner Rehearsal', '-c', 'user.email=rehearsal@localhost', 'commit', '--quiet', '-m', `test: freeze real builder round ${artifact.round}`], { cwd: repository })
        const commitSha = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim()
        const round = { ...reviewRound({ runId, round: artifact.round, commitSha, sourceSha256: artifact.sourceSha256, taskIds: report.reviewTaskIds }), artifactCommentId: artifact.commentId }
        rounds.push(round)
        await comment(`candidate-${round.round}`, report.parentTaskId, { kind: 'candidate', runId, round: round.round, commitSha, sourceSha256: round.sourceSha256 })
        for (const actor of reviewerActors) await handoff(`review-${round.round}-${actor}`, report.reviewTaskIds[actor], actor, {
          kind: 'review-request', runId, challenge, round: round.round, commitSha, sourceSha256: round.sourceSha256, recipient: `@${actor}`,
          instruction: `${requirements.replace('Add meaningful Node tests in queue.test.mjs.', '')}${round.round === 2 ? '\nAdditional final requirement: exclude tasks with blocked === true.' : ''}`,
        })
        progress(`Round ${round.round}: both reviewers requested for immutable ${commitSha.slice(0, 12)}`)
        if (round.round === 2) {
          const first = rounds[0].assessment.accepted['reviewer-a'].result
          const late = await cli(['comment', report.reviewTaskIds['reviewer-a'], JSON.stringify({ ...first, probe: 'declared late old-SHA transport fixture' }),
            '--actor', 'reviewer-a', '--operation-id', `${runId}-late-old-sha-probe`])
          report.oldShaProbeCommentId = late.result.commentId
        }
      }
      const firstReview = proxy.events.find(event => event.type === 'accepted' && event.threadId === report.sessions['reviewer-a'].threadId)
      if (firstReview && !busySent) {
        report.busyQueuedAt = Date.now()
        await comment('busy-probe', report.reviewTaskIds['reviewer-a'], { kind: 'busy-probe', runId, challenge, recipient: '@reviewer-a' })
        busySent = true
      }
      if (busySent && !busyVerified) {
        const inbox = await inboxStatus()
        const queued = inbox.deliveries.find(row => row.actor === 'reviewer-a' && row.state === 'queued' && row.reason === 'busy')
        if (queued) {
          await save('busy-before-restart.json', inbox)
          await bridge.stop('SIGKILL'); await launchBridge()
          const after = await inboxStatus()
          assert.ok(after.deliveries.some(row => row.id === queued.id), 'Durably received busy work must survive restart')
          report.checks.busyReceivedWorkRestart = true; busyVerified = true
          progress('Busy reviewer delivery survived bridge SIGKILL and restart')
        }
      }
      for (const round of rounds) {
        if (round.finished) continue
        const contexts = Object.fromEntries(await Promise.all(reviewerActors.map(async actor => [actor, await cli(['show', report.reviewTaskIds[actor], '--actor', 'coordinator'])])))
        const assessment = collectReviews(round, contexts); round.assessment = assessment
        const action = nextReviewAction(round, assessment)
        if (action === 'wait') continue
        if (action === 'blocked') throw new Error('Final fixture review requests changes; bounded run stops for human inspection')
        for (const actor of reviewerActors) {
          const result = assessment.accepted[actor].result
          assert.equal(result.challenge, challenge); assert.equal(await realpath(result.cwd), report.worktrees[actor])
        }
        await save(`round-${round.round}.json`, { ...round, contexts })
        if (action === 'correct') {
          // Repeat an actual published result with the same logical operation.
          // This intentionally adds a duplicate assessment, never a second vote.
          const first = assessment.accepted['reviewer-a'].result
          await cli(['comment', report.reviewTaskIds['reviewer-a'], JSON.stringify(first), '--actor', 'reviewer-a', '--operation-id', `${runId}-duplicate-result`])
          await cli(['comment', report.reviewTaskIds['reviewer-a'], JSON.stringify(first), '--actor', 'reviewer-a', '--operation-id', `${runId}-duplicate-result`])
          const duplicateContext = { ...contexts, 'reviewer-a': await cli(['show', report.reviewTaskIds['reviewer-a'], '--actor', 'coordinator']) }
          assert.equal(collectReviews(round, duplicateContext).duplicates.length, 1)
          report.checks.duplicateResult = true
          await handoff('correction', report.parentTaskId, 'builder', { kind: 'correction-request', runId, challenge, round: 2, recipient: '@builder',
            previousCommitSha: round.commitSha, reviewTaskIds: report.reviewTaskIds,
            instruction: 'Both independent initial assessments are collected. Implement the declared additional requirement: exclude tasks with blocked === true, preserving the original contract. Address any substantive findings, run tests, and publish one round-2 builder-artifact.',
            findings: reviewerActors.flatMap(actor => assessment.accepted[actor].result.findings) }, 'in-progress')
          round.correctionRequested = true; round.finished = true
          progress('Both initial assessments collected; automatic correction request delivered to builder')
        } else {
          await handoff('human-review', report.parentTaskId, 'human', { kind: 'human-review-ready', runId, round: 2, recipient: '@human',
            commitSha: round.commitSha, sourceSha256: round.sourceSha256,
            approvals: reviewerActors.map(actor => ({ actor, commentId: assessment.accepted[actor].commentId })),
            instruction: 'Both named reviewers approved this immutable final revision. Await actual human acceptance; no auto-merge.' })
          round.finished = true; finalContext = { parent: await cli(['show', report.parentTaskId, '--actor', 'human']), contexts }
        }
      }
      if (Date.now() - lastProgress > 30000) {
        progress(`${proxy.events.filter(event => event.type === 'accepted').length} real accepted turns; ${rounds.length} immutable review rounds`); lastProgress = Date.now()
      }
      if (!finalContext) return false
      const reviewA = await cli(['show', report.reviewTaskIds['reviewer-a'], '--actor', 'coordinator'])
      return messages(reviewA).some(message => message.kind === 'busy-result' && message.recordedActor === 'reviewer-a')
    }, { deadline: modelDeadline, intervalMs: 1000, label: 'automatic three-agent workflow' })
    await recovery
    assert.equal(finalContext.parent.task.status, 'review'); assert.equal(finalContext.parent.task.assignee, 'human')
    assert.equal(rounds.length, 2); assert.notEqual(rounds[0].commitSha, rounds[1].commitSha)
    const currentContexts = Object.fromEntries(await Promise.all(reviewerActors.map(async actor => [actor, await cli(['show', report.reviewTaskIds[actor], '--actor', 'human'])])))
    const finalAssessment = collectReviews(rounds[1], currentContexts)
    assert.equal(finalAssessment.approved, true)
    assert.ok(finalAssessment.rejected.some(row => row.commentId === report.oldShaProbeCommentId && row.reason === 'stale or unrelated revision'))
    report.checks.staleOldShaRejected = true
    report.rounds = rounds
    report.finalCommitSha = rounds[1].commitSha
    await save('task-context.json', { ...finalContext, contexts: currentContexts })
    await eventually(async () => {
      assertRunning(); bridge.check(); service.check(); codex.check()
      const threads = await Promise.all(actors.map(actor => control.inspect({ threadId: report.sessions[actor].threadId, worktree: report.worktrees[actor] }, true)))
      const failed = threads.flatMap(thread => thread.turns).find(turn => ['failed', 'interrupted'].includes(turn.status))
      assert.ok(!failed, 'A real model acknowledgment failed or was interrupted')
      return threads.every(thread => thread.status.type === 'idle')
    }, { deadline: modelDeadline, intervalMs: 1000, label: 'all model acknowledgments completed within the declared workflow budget' })
    // Independently rerun every agent's own tests and stronger external assertions.
    const external = `import assert from 'node:assert/strict'; const {selectReadyTasks,challenge}=await import(process.argv[2]);
assert.equal(challenge,${JSON.stringify(challenge)}); const tasks=[
{id:'blocked',assignee:'builder',status:'todo',priority:'p0',blocked:true,created_at:'2020'},
{id:'b',assignee:'builder',status:'todo',priority:'p1',created_at:'2021'},
{id:'a',assignee:'builder',status:'todo',priority:'p1',created_at:'2021'},
{id:'unknown',assignee:'builder',status:'todo',priority:'other',created_at:'2020'},
{id:'other',assignee:'reviewer',status:'todo',priority:'p0',created_at:'2010'}];
const before=JSON.stringify(tasks); tasks.forEach(Object.freeze);Object.freeze(tasks);
assert.deepEqual(selectReadyTasks(tasks,'builder',20).map(t=>t.id),['a','b','unknown']);
assert.equal(selectReadyTasks(tasks,'builder',1)[0],tasks[2]); assert.equal(JSON.stringify(tasks),before);
for(const n of [0,-1,1.5,NaN,Infinity,'2'])assert.throws(()=>selectReadyTasks(tasks,'builder',n),RangeError);
console.log('Independent final fixture assertions passed');`
    await writeFile(join(root, 'external-check.mjs'), external)
    for (const actor of actors) {
      const cwd = report.worktrees[actor]
      assert.equal(sha256(await readFile(join(cwd, 'queue.mjs'))), rounds[1].sourceSha256)
      const tests = await execute(process.execPath, ['--test', actor === 'builder' ? 'queue.test.mjs' : 'reviewer.test.mjs'], { cwd, timeout: 10000 })
      const independent = await execute(process.execPath, [join(root, 'external-check.mjs'), join(cwd, 'queue.mjs')], { cwd, timeout: 10000 })
      const status = await auditThreeAgentWorktree(actor, cwd)
      const commands = proxy.events.filter(event => event.type === 'command' && event.threadId === report.sessions[actor].threadId)
      assert.ok(commands.some(event => event.exitCode === 0 && event.command?.includes('--test')), `Missing real independent test execution for ${actor}`)
      await save(`${actor}-verification.json`, { tests: tests.stdout, independent: independent.stdout, status, commands })
    }
    const inbox = await inboxStatus()
    const accepted = proxy.events.filter(event => event.type === 'accepted')
    assert.equal(new Set(accepted.map(event => event.turnId)).size, accepted.length, 'No duplicate real accepted turn receipts')
    assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, accepted.length)
    for (const row of inbox.deliveries.filter(row => row.state === 'accepted')) assert.ok(accepted.some(event => event.turnId === row.turnId))
    const dropped = proxy.events.find(event => event.type === 'reply-dropped')
    if (dropped) assert.ok(inbox.deliveries.some(row => row.state === 'accepted' && row.turnId === dropped.turnId), 'History reconciliation must retain the original accepted turn')
    for (const actor of actors) assert.ok(accepted.some(event => event.threadId === report.sessions[actor].threadId))
    const reviewerTurns = accepted.filter(event => event.threadId === report.sessions['reviewer-a'].threadId)
    const initialCompleted = proxy.events.find(event => event.type === 'completed' && event.turnId === reviewerTurns[0].turnId)
    assert.ok(initialCompleted && report.busyQueuedAt < initialCompleted.at)
    assert.ok(reviewerTurns[1].at >= initialCompleted.at, 'Busy notification must dispatch after the active turn completes')
    assert.equal(busyVerified, true, 'The busy queue restart must actually be observed')
    assert.ok(proxy.events.some(event => event.type === 'duplicate-notification'))
    if (args.includes('--drop-dispatch-reply')) assert.equal(report.checks.acceptedReplyLossRestart, true)
    report.checks = { ...report.checks, automaticCorrectionRoundTrip: true, twoFinalShaApprovals: true, independentRealTests: true,
      allThreeRealAgents: true, duplicateNotifications: true, busyQueue: true, humanReviewQueue: true }
    report.timing = { initialDispatchMs: accepted[0].at - kickoffAt, workflowMs: Date.now() - kickoffAt,
      deliveries: inbox.deliveries.filter(row => row.state === 'accepted').map(row => deliveryTiming(row, report.sessions[row.actor], proxy.events)) }
    assert.ok(report.timing.initialDispatchMs <= bounds.dispatchMs, `Healthy initial dispatch exceeded ${bounds.dispatchMs}ms`)
    const beforeIdle = proxy.events.filter(event => event.type === 'dispatch').length
    await delay(bounds.idleSeconds * 1000)
    assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, beforeIdle)
    report.checks.shortIdle = { seconds: bounds.idleSeconds, modelRequests: 0 }
    report.readiness.modelAccess = 'observed-real-turns'
    assert.equal((await candidateFingerprint(candidate)).sha256, report.candidate.sha256)
    report.passed = true
    progress('PASS: three real agents, two immutable rounds, independent tests, and final human-review barrier')
  }
} catch (error) {
  report.error = safe(error.stack ?? String(error)); process.exitCode = 1; progress(`FAIL: ${safe(error.message)}`)
} finally {
  report.cleanupErrors = []
  if (proxy) await save('protocol-events.json', proxy.events)
  if (bridge) {
    try { await save('inbox-status.json', await cli(['bridge', 'status', '--config', configPath])) } catch { /* Setup may be incomplete. */ }
    try { await bridge.stop() } catch (error) { report.cleanupErrors.push(error.message) }
  }
  for (const [actor, session] of Object.entries(report.sessions ?? {})) {
    try {
      const thread = await control.inspect({ threadId: session.threadId, worktree: session.cwd }, true)
      await save(`session-${actor}.json`, thread)
      for (const turn of thread.turns.filter(turn => turn.status === 'inProgress')) await control.call('turn/interrupt', { threadId: session.threadId, turnId: turn.id })
    } catch (error) { report.cleanupErrors.push(error.message) }
  }
  for (const adapter of controls) adapter.close()
  for (const child of processes.reverse()) { try { await child.stop() } catch (error) { report.cleanupErrors.push(error.message) } }
  await proxy?.close()
  if (report.cleanupErrors.length) { report.passed = false; process.exitCode = 1 }
  report.finishedAt = new Date().toISOString()
  await save('report.json', report)
  process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate)
  console.log(`Evidence: ${join(root, 'report.json')}`)
}
