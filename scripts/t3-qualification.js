import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { T3Execution } from '../lib/t3-execution.js'
import { pairT3Client, T3McpClient, T3Unknown } from '../lib/t3-mcp-client.js'

// Qualifies the installed T3 against a disposable home and a scripted provider:
// no model turns, and the owner's T3 data, threads and credentials are never used.
const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
const cli = argument('--t3') ?? process.env.PARDNER_T3_CLI ?? join(homedir(), '.t3/bin/t3')
const output = argument('--output') ? resolve(argument('--output')) : null
const sleep = ms => new Promise(done => setTimeout(done, ms))
const home = await realpath(await mkdtemp(join(tmpdir(), 'pardner-t3-qualification-')))
if (home.startsWith(join(homedir(), '.t3'))) throw new Error('Refusing to qualify inside the owner T3 home')
// An allowlist keeps the session's T3 thread, provider credentials and proxies out of the isolated server.
const env = { PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: tmpdir(), HOME: home, T3CODE_HOME: home, PARDNER_FAKE_CODEX_LOG: join(home, 'provider.log') }

const checks = []
const observations = []
const transcript = []
const ledgers = {}
function check(scenario, observation, passed) {
  checks.push({ scenario, passed: Boolean(passed), observation })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${scenario}`)
  if (!passed) console.log(JSON.stringify(observation))
}
function note(subject, observation) {
  observations.push({ subject, observation })
  console.log(`NOTE ${subject}: ${JSON.stringify(observation).slice(0, 200)}`)
}

async function freePort() {
  const server = createServer()
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  await new Promise(done => server.close(done))
  return port
}

/** Records sanitized MCP calls; the Authorization header is never captured. Repeated identical reads are polling, so only changes are kept. */
function recorder(label) {
  const lastRead = new Map()
  return async (url, init) => {
    const response = await fetch(url, init)
    const request = JSON.parse(init.body)
    if (response.status === 404) transcript.push({ at: new Date().toISOString(), client: label, method: request.method, http: 404 })
    if (request.method !== 'tools/call' || response.status === 404) return response
    const text = await response.clone().text()
    const line = text.startsWith('{') ? text : text.split('\n').findLast(entry => entry.startsWith('data:'))?.slice(5)
    const parse = (text, fallback) => { try { return JSON.parse(text) } catch { return fallback } }
    const result = parse(line ?? '', {}).result
    const { name, arguments: input } = request.params
    let reply = result?.isError ? { error: parse(result.content?.[0]?.text, { unstructured: result.content?.[0]?.text }) } : result?.structuredContent
    if (reply === undefined) reply = { http: response.status, body: text.slice(0, 200) }
    if (name === 't3_thread_read' && reply.thread) {
      reply = { status: reply.thread.status, activeRunId: reply.thread.activeRunId, pendingRequestCount: reply.thread.pendingRequestCount,
        runs: reply.recentRuns?.map(({ runId, status }) => ({ runId, status })), items: input.view ? reply.items?.map(({ messageId, runId, type, status }) => ({ messageId, runId, type, status })) : undefined }
      const signature = JSON.stringify(reply)
      if (lastRead.get(input.threadId + input.view) === signature) return response
      lastRead.set(input.threadId + input.view, signature)
    }
    if (name === 't3_project_list') reply = { count: reply.projects?.length }
    transcript.push({ at: new Date().toISOString(), client: label, tool: name, arguments: input, reply })
    return response
  }
}

const t3 = (...args) => run(cli, args, { env, cwd: join(home, 'project'), maxBuffer: 1 << 24 }).then(({ stdout }) => stdout)
let server
async function startServer(port) {
  server = spawn(cli, ['serve', '--base-dir', home, '--host', '127.0.0.1', '--port', String(port), '--no-browser', '.'],
    { env, cwd: join(home, 'project'), stdio: 'ignore', detached: true })
  for (let attempt = 0; attempt < 120; attempt++) {
    const ready = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`).then(response => response.ok, () => false)
    if (ready) return
    await sleep(500)
  }
  throw new Error('Isolated T3 server did not start')
}
const killServer = signal => { try { process.kill(-server.pid, signal) } catch { /* Already gone. */ } }

async function providerLog() {
  const text = await readFile(env.PARDNER_FAKE_CODEX_LOG, 'utf8').catch(() => '')
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}
const providerTurns = async text => (await providerLog()).filter(entry => entry.in?.method === 'turn/start'
  && (entry.in.params.input ?? []).some(input => input.text === text)).length

const statusOf = async (client, threadId) => {
  const { thread, runs, observedAt } = await client.read(threadId)
  return { status: thread.status, active: thread.activeRunId, pending: thread.pendingRequestCount, observedAt: new Date(observedAt).toISOString(),
    runs: runs.map(({ ordinal, status }) => ({ ordinal, status })).sort((a, b) => a.ordinal - b.ordinal) }
}
async function until(read, accept, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!accept(value) && Date.now() < deadline) { await sleep(150); value = await read() }
  return value
}
const finished = entry => ['completed', 'failed', 'interrupted', 'cancelled'].includes(entry.status)

let exitCode = 0
try {
  await mkdir(join(home, 'project'), { recursive: true })
  await mkdir(join(home, 'bin'))
  await mkdir(join(home, 'userdata'))
  const provider = join(home, 'bin/codex')
  await copyFile(join(root, 'support/t3-fake-codex.mjs'), provider)
  await chmod(provider, 0o755)
  await run('git', ['init', '-q'], { cwd: join(home, 'project') })
  await run('git', ['-c', 'user.email=qualification@pardner.invalid', '-c', 'user.name=qualification', 'commit', '-q', '--allow-empty', '-m', 'fixture'], { cwd: join(home, 'project') })
  const disabled = Object.fromEntries(['claudeAgent', 'cursor', 'grok', 'opencode', 'antigravity', 'fx', 'muse', 'pi'].map(id => [id, { driver: id, enabled: false }]))
  await writeFile(join(home, 'userdata/settings.json'), JSON.stringify({ defaultModelSelection: { instanceId: 'codex', model: 'fixture' }, defaultRuntimeMode: 'approval-required',
    providerInstances: { codex: { driver: 'codex', enabled: true, config: { binaryPath: provider } }, ...disabled } }))

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  await startServer(port)
  const version = (await run(cli, ['--version'], { env })).stdout.trim()
  const descriptor = await (await fetch(`${origin}/.well-known/t3/environment`)).json()
  await t3('project', 'add', '--base-dir', home, '.')

  const pair = async (access, label) => {
    const code = JSON.parse(await t3('auth', 'pairing', 'create', '--base-dir', home, '--json', '--ttl', '5m'))
    const { token, expiresIn } = await pairT3Client({ origin, pairingCode: code.credential, access })
    const client = new T3McpClient({ origin, token, fetch: recorder(label) })
    client.expiresIn = expiresIn
    return client
  }
  const client = await pair('full-access', 'full-access')
  const limited = await pair('approval-required', 'approval-required')
  const readOnly = await pair('read-only', 'read-only')
  const tools = await client.tools()
  const project = (await client.tool('t3_project_list', { limit: 10 })).projects[0]
  const modelSelection = { instanceId: 'codex', model: 'fixture' }
  let requests = 0
  const key = label => `${label}-${++requests}`
  const launch = (message, caller = client, clientRequestId = key('launch')) => caller.tool('t3_thread_launch', { projectId: project.id, title: message, message, modelSelection,
    runtimeMode: 'approval-required', clientRequestId })
  const running = (caller, threadId) => until(() => statusOf(caller, threadId), state => state.status === 'running')

  // Capability inventory.
  const relevant = ['t3_thread_launch', 't3_thread_send', 't3_thread_read', 't3_thread_wait', 't3_thread_interrupt', 't3_thread_list', 't3_pending_request', 't3_queue', 't3_project_list']
  const definitions = tools.filter(tool => relevant.includes(tool.name))
  const toolInventory = tools.map(tool => ({ name: tool.name, sha256: createHash('sha256').update(JSON.stringify(tool)).digest('hex') })).sort((a, b) => a.name.localeCompare(b.name))
  check('Installed version and MCP tool surface are inspected', { version, serverVersion: descriptor.serverVersion, orchestrationProtocol: descriptor.orchestrationProtocolVersion,
    toolCount: tools.length, tokenExpiresInSeconds: client.expiresIn }, definitions.length === relevant.length && project)
  const cliHelp = await t3('thread', '--help')
  const cliSend = await t3('thread', 'send', '--help')
  const cliStart = await t3('thread', 'start', '--help')
  const subcommands = ['list', 'start', 'send', 'show'].filter(name => new RegExp(`\\n {2}${name}\\b`).test(cliHelp))
  check('The thread CLI offers no request ID, interrupt or runtime mode', { subcommands, hasInterrupt: /\n {2}interrupt\b/.test(cliHelp), hasRequestId: /request-id/i.test(cliSend + cliStart), hasRuntimeMode: /--runtime-mode/.test(cliStart) },
    subcommands.length === 4 && /--wait/.test(cliSend) && !/\n {2}interrupt\b/.test(cliHelp) && !/request-id/i.test(cliSend + cliStart) && !/--runtime-mode/.test(cliStart))

  // Effective permissions.
  const probe = await launch('plain probe')
  const denied = await readOnly.send(probe.threadId, 'denied', key('denied')).catch(error => error)
  const readable = await readOnly.read(probe.threadId)
  const escalation = await limited.tool('t3_thread_launch', { projectId: project.id, title: 'x', message: 'x', modelSelection, runtimeMode: 'full-access' }).catch(error => error)
  check('Read-only clients cannot write and clients cannot exceed their approved mode', { readOnlySend: denied.code, readOnlyRead: Boolean(readable.thread), escalation: escalation.code },
    denied.code === 'capability_denied' && readable.thread && escalation.code === 'runtime_mode_escalation_denied')
  const firstTurn = await until(async () => (await providerLog()).find(entry => entry.in?.method === 'turn/start'), Boolean)
  check('T3 passes the thread approval policy to the provider', { runtimeMode: 'approval-required', approvalPolicy: firstTurn?.in.params.approvalPolicy }, firstTurn?.in.params.approvalPolicy === 'untrusted')
  const launchKey = key('launch')
  const launched = await launch('launch dedupe', client, launchKey)
  const launchedAgain = await launch('launch dedupe', client, launchKey)
  check('t3_thread_launch deduplicates a repeated request ID to the same thread and run', { sameThread: launched.threadId === launchedAgain.threadId, sameRun: launched.runId === launchedAgain.runId },
    launched.threadId === launchedAgain.threadId && launched.runId === launchedAgain.runId)

  const identityRead = (await client.tool('t3_thread_read', { threadId: probe.threadId, limit: 1, runLimit: 1 })).thread
  const identityFields = ['threadId', 'projectId', 'latestRunId', 'activeRunId', 'providerInstanceId', 'model', 'runtimeMode', 'interactionMode', 'branch', 'worktreePath', 'link']
  note('Identifiers on a thread read, as present or absent in a project-folder thread', Object.fromEntries(identityFields.map(field => [field, identityRead[field] == null ? 'absent' : 'present'])))
  note('Runtime mode recorded on the thread', { runtimeMode: identityRead.runtimeMode })
  note('Environment identifier from the environment descriptor', { present: Boolean(descriptor.environmentId) })
  const borrowed = await launch('FIXTURE:hold borrowed thread')
  await running(client, borrowed.threadId)
  const limitedOnOther = await limited.send(borrowed.threadId, 'from a limited client', key('send')).catch(error => error)
  const limitedInterrupt = await limited.interrupt(borrowed.threadId, borrowed.runId, key('cancel')).catch(error => error)
  note('An approval-required client acting on a same-mode thread another client launched', { send: limitedOnOther.delivery ?? limitedOnOther.code, interrupt: limitedInterrupt.status ?? limitedInterrupt.code })

  // Busy follow-ups and idempotency.
  const held = await launch('FIXTURE:hold follow-ups')
  await running(client, held.threadId)
  const sendId = key('send')
  const first = await client.send(held.threadId, 'follow-up one', sendId)
  const replay = await client.send(held.threadId, 'follow-up one', sendId)
  const changed = await client.send(held.threadId, 'different content', sendId)
  const second = await client.send(held.threadId, 'follow-up two', key('send'))
  const queue = await client.tool('t3_queue', { action: 'list', threadId: held.threadId })
  const other = await pair('full-access', 'second-full-access')
  const crossClient = await other.send(held.threadId, 'follow-up one', sendId)
  check('With mode queue, a busy thread queues same-session follow-ups in order and returns no 409', { firstDelivery: first.delivery, secondDelivery: second.delivery, queued: queue.items.map(item => item.text) },
    first.delivery === 'queued' && second.delivery === 'queued' && queue.items.map(item => item.text).join() === 'follow-up one,follow-up two')
  check('clientRequestId replays return the original run, even with different content', { replaySameRun: replay.runId === first.runId, changedContentSameRun: changed.runId === first.runId },
    replay.runId === first.runId && changed.runId === first.runId)
  check('clientRequestId is scoped to one MCP client: another client creates a new run', { crossClientSameRun: crossClient.runId === first.runId }, crossClient.runId !== first.runId)
  note('A message still in T3\'s queue, looked up by request ID', { foundRun: await client.findRequest(held.threadId, sendId) })
  const lookupThread = (await launch('lookup baseline')).threadId
  await until(() => statusOf(client, lookupThread), state => state.status === 'completed')
  const lookupId = key('send')
  const lookupSent = await other.send(lookupThread, 'lookup message', lookupId)
  const lookupFound = await until(() => client.findRequest(lookupThread, lookupId), Boolean, 5000)
  check('A read finds a started request by ID, including one sent by another client', { sameRun: lookupFound === lookupSent.runId }, lookupFound === lookupSent.runId)
  const heldRead = await statusOf(client, held.threadId)
  const rawRead = await client.tool('t3_thread_read', { threadId: held.threadId, limit: 1, runLimit: 5 })
  check('Fresh reads report exact runs; T3 supplies no observation time, so Pardner stamps receipt', { ...heldRead, threadTimeFields: Object.keys(rawRead.thread).filter(field => /At$/.test(field)) },
    heldRead.runs.length === 4 && heldRead.status === 'running' && !('observedAt' in rawRead.thread))

  // Send modes other than queue.
  for (const [mode, delivery] of [['auto', 'steered'], ['steer', 'steered'], ['restart', 'restarted']]) {
    const thread = await launch(`FIXTURE:hold mode ${mode}`)
    await running(client, thread.threadId)
    // `auto` queues rather than steers in the moment before a new run can be steered.
    await sleep(1000)
    const sendId = key('send')
    // A run reports `running` slightly before T3 can steer it, and T3 refuses until then.
    const sent = await until(() => client.tool('t3_thread_send', { threadId: thread.threadId, message: `via ${mode}`, mode, clientRequestId: sendId }).catch(error => error), reply => !(reply instanceof Error))
    check(`Send mode ${mode} on a busy thread stays on the active run instead of queueing`, { delivery: sent.delivery, sameRun: sent.runId === thread.runId }, sent.delivery === delivery && sent.runId === thread.runId)
    await client.interrupt(thread.threadId, (await client.read(thread.threadId)).thread.activeRunId, key('cancel')).catch(() => {})
  }

  // Exact-run cancellation against T3 itself.
  const activeRun = (await client.read(held.threadId)).thread.activeRunId
  const plainInterrupt = (threadId, runId) => client.interrupt(threadId, runId, key('cancel'))
  const stopInterrupt = (caller, threadId, runId) => caller.tool('t3_thread_interrupt', { threadId, runId, clientRequestId: key('cancel'), stop: true })
  const bogus = await plainInterrupt(held.threadId, `${activeRun.replace(/\d+$/, '')}99`).catch(error => error)
  const queuedInterrupt = await plainInterrupt(held.threadId, first.runId).catch(error => error)
  const requested = await plainInterrupt(held.threadId, activeRun)
  const advanced = await until(() => statusOf(client, held.threadId), state => state.runs[0].status === 'interrupted' && state.runs[1].status !== 'queued')
  check('T3 targets the exact run and rejects unknown or queued interrupt targets', { bogus: bogus.code, queuedInterrupt: queuedInterrupt.code, requested: requested.status },
    bogus.code === 'run_not_found' && queuedInterrupt.code === 'thread_not_interruptible' && requested.status === 'interrupt_requested')
  check('A plain interrupt starts the next queued run', { firstRun: advanced.runs[0].status, nextRun: advanced.runs[1].status }, advanced.runs[1].status !== 'queued')

  const stopped = await launch('FIXTURE:hold stop')
  await running(client, stopped.threadId)
  const stoppedFollowUp = await client.send(stopped.threadId, 'held by stop', key('send'))
  const stoppedRun = (await client.read(stopped.threadId)).thread.activeRunId
  await stopInterrupt(client, stopped.threadId, stoppedRun)
  await until(() => statusOf(client, stopped.threadId), state => state.runs[0].status === 'interrupted')
  await sleep(1500)
  const stoppedState = await statusOf(client, stopped.threadId)
  check('An interrupt with stop holds T3\'s queue: the next run does not start', { thread: stoppedState.status, runs: stoppedState.runs, turns: await providerTurns('held by stop') },
    stoppedState.runs[1].status === 'queued' && !stoppedState.active && await providerTurns('held by stop') === 0)
  const removed = await client.cancelQueued(stopped.threadId, stoppedFollowUp.runId)
  const removedState = await statusOf(client, stopped.threadId)
  const removedAgain = await client.cancelQueued(stopped.threadId, stoppedFollowUp.runId).catch(error => error.message)
  check('t3_queue cancel removes a queued run; a repeat is an orchestration_error', { reply: Object.keys(removed), run: removedState.runs[1], thread: removedState.status, repeat: removedAgain },
    removedState.runs[1].status === 'cancelled' && /orchestration_error/.test(removedAgain))

  const delayedThread = await launch('FIXTURE:hold delayed one')
  await running(client, delayedThread.threadId)
  const delayedNext = await client.send(delayedThread.threadId, 'FIXTURE:hold delayed two', key('send'))
  const delayedRun = (await client.read(delayedThread.threadId)).thread.activeRunId
  await plainInterrupt(delayedThread.threadId, delayedRun)
  await until(() => statusOf(client, delayedThread.threadId), state => state.active === delayedNext.runId && state.status === 'running')
  const delayed = await plainInterrupt(delayedThread.threadId, delayedRun)
  await sleep(1000)
  const afterDelayed = await statusOf(client, delayedThread.threadId)
  check('A delayed interrupt of a finished run leaves the next active run running', { delayed: delayed.status, runs: afterDelayed.runs },
    delayed.status === 'interrupted' && afterDelayed.active === delayedNext.runId && afterDelayed.runs[1].status === 'running')
  const delayedStop = await stopInterrupt(client, delayedThread.threadId, delayedRun)
  const afterDelayedStop = await until(() => statusOf(client, delayedThread.threadId), state => state.runs[1].status !== 'running', 3000)
  check('HAZARD: with stop, T3 ignores runId, so a delayed interrupt of a finished run hits the next active run', { delayed: delayedStop.status, runs: afterDelayedStop.runs },
    delayedStop.status === 'interrupt_requested' && afterDelayedStop.runs[0].status === 'interrupted' && afterDelayedStop.runs[1].status === 'interrupted')

  const stopTargets = await launch('FIXTURE:hold stop targets')
  await running(client, stopTargets.threadId)
  const stopTargetRun = (await client.read(stopTargets.threadId)).thread.activeRunId
  const stopBogus = await stopInterrupt(client, stopTargets.threadId, `${stopTargetRun.replace(/\d+$/, '')}99`).catch(error => error)
  note('stop aimed at a run that does not exist', { reply: stopBogus.code ?? stopBogus.status, runs: (await until(() => statusOf(client, stopTargets.threadId), state => !state.active, 3000)).runs })

  const repeatThread = await launch('FIXTURE:hold repeat')
  await running(client, repeatThread.threadId)
  const repeatRun = (await client.read(repeatThread.threadId)).thread.activeRunId
  const repeatKey = key('cancel')
  const repeatFirst = await client.interrupt(repeatThread.threadId, repeatRun, repeatKey)
  await until(() => statusOf(client, repeatThread.threadId), state => !state.active)
  const repeatSecond = await client.interrupt(repeatThread.threadId, repeatRun, repeatKey)
  check('Repeating a plain interrupt with its request ID reports the finished run', { first: repeatFirst.status, second: repeatSecond.status }, repeatFirst.status === 'interrupt_requested' && repeatSecond.status === 'interrupted')

  const contract = (name, caller, threadId, actorId = 'builder') => {
    const execution = new T3Execution({ path: join(home, `${name}.sqlite`), transport: caller, ownerId: 'qualification', routes: [{ actorId, threadId, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }] })
    const intent = (id, text) => ({ id, actorId, taskId: 'task', fromActorId: 'alice', threadId, text })
    const settle = id => until(async () => { await execution.observe(threadId); return execution.row(id) }, row => row.state === 'terminal')
    const finish = () => { ledgers[name] = { executions: execution.rows().map(({ id, state, outcome, run_id: runId, submissions, observed_at: observedAt }) => ({ id, state, outcome, runId, submissions, observedAt })), transitions: execution.transitions(), reviews: execution.reviews() }; execution.close() }
    return { execution, intent, settle, finish }
  }

  // Native approval, decided through T3's own browser UI.
  const pairing = JSON.parse(await t3('auth', 'pairing', 'create', '--base-dir', home, '--json', '--ttl', '5m', '--base-url', origin))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(pairing.pairUrl ?? `${origin}/pair#token=${pairing.credential}`)
    await sleep(2500)
    for (const [decision, button, expected] of [['Approve', /^approve/i, 'accept'], ['Decline', /^decline/i, 'decline']]) {
      const blocked = await launch(`FIXTURE:approval ${decision}`)
      const waiting = await until(() => statusOf(client, blocked.threadId), state => state.pending === 1)
      const pendingList = await client.tool('t3_pending_request', { action: 'list', threadId: blocked.threadId })
      const activity = await client.tool('t3_thread_read', { threadId: blocked.threadId, view: 'activity', limit: 50, runLimit: 1, maxCharsPerItem: 40 })
      const approvalItem = activity.items.find(item => item.type === 'approval_request')
      // The item ID wraps the runtime request ID, the form `respond` accepts for input requests.
      const requestId = decodeURIComponent(approvalItem.itemId.replace('turn-item:runtime-request:', ''))
      const mcpDecisions = []
      for (const candidate of [approvalItem.itemId, requestId]) {
        const reply = await client.tool('t3_pending_request', { action: 'respond', threadId: blocked.threadId, requestId: candidate, answers: { decision: 'approve' } }).catch(error => error)
        mcpDecisions.push(reply.code ?? reply.message ?? 'accepted')
      }
      await sleep(500)
      const afterMcp = await statusOf(client, blocked.threadId)
      const decisionsBeforeUi = (await providerLog()).filter(entry => entry.in && !entry.in.method && entry.in.result?.decision).length
      const followUp = await client.send(blocked.threadId, `after ${decision}`, key('send'))
      await sleep(1000)
      const heldTurns = await providerTurns(`after ${decision}`)
      await page.goto(blocked.link)
      await page.getByRole('button', { name: button }).first().click({ timeout: 15_000 })
      const resolved = await until(() => statusOf(client, blocked.threadId), state => state.pending === 0 && state.runs.every(finished))
      const decisionsAfterUi = (await providerLog()).filter(entry => entry.in && !entry.in.method && entry.in.result?.decision).length
      const answer = (await providerLog()).filter(entry => entry.in && !entry.in.method && entry.in.id >= 1000).at(-1)?.in.result?.decision
      check(`Approval blocks visibly, MCP cannot decide it, and ${decision} in the T3 UI reaches the provider`, { blockedStatus: waiting.status, pendingRequestCount: waiting.pending, approvalItemStatus: approvalItem?.status,
        mcpPendingList: pendingList.requestIds, mcpRespond: mcpDecisions, pendingAfterMcp: afterMcp.pending, uiDecisions: decisionsAfterUi - decisionsBeforeUi, followUpDelivery: followUp.delivery, followUpTurnsWhileBlocked: heldTurns, providerDecision: answer, finalRuns: resolved.runs },
      waiting.pending === 1 && waiting.status === 'running' && approvalItem?.status === 'waiting' && pendingList.requestIds.length === 0 && mcpDecisions.every(reply => reply === 'invalid_request') && afterMcp.pending === 1 && decisionsAfterUi - decisionsBeforeUi === 1
        && followUp.delivery === 'queued' && heldTurns === 0 && answer === expected && resolved.runs.length === 2 && resolved.runs.every(entry => entry.status === 'completed'))
    }

    // The contract through a least-privilege client, blocked and resumed by the same UI.
    const approvalThread = (await launch('contract approval baseline', limited)).threadId
    await until(() => statusOf(limited, approvalThread), state => state.status === 'completed')
    const approval = contract('approval', limited, approvalThread)
    await approval.execution.observe(approvalThread)
    approval.execution.enqueue(approval.intent('needs-approval', 'FIXTURE:approval contract'))
    approval.execution.enqueue(approval.intent('after-approval', 'after contract approval'))
    await approval.execution.pump(approvalThread)
    const contractBlocked = await until(async () => { await approval.execution.observe(approvalThread); return approval.execution.row('needs-approval') }, row => row.state === 'blocked')
    const heldByBlock = await approval.execution.pump(approvalThread)
    const heldRow = approval.execution.row('after-approval')
    await page.goto((await limited.tool('t3_thread_read', { threadId: approvalThread, limit: 1 })).thread.link)
    await page.getByRole('button', { name: /^approve/i }).first().click({ timeout: 15_000 })
    const approved = await approval.settle('needs-approval')
    await approval.execution.pump(approvalThread)
    const afterApproved = await approval.settle('after-approval')
    check('Contract with an approval-required client: blocked from a real read, follow-up held, UI approval resumes', { blocked: contractBlocked.state, heldReason: heldByBlock.reason, heldState: heldRow.state, heldSubmissions: heldRow.submissions, outcome: approved.outcome, next: afterApproved.outcome },
      contractBlocked.state === 'blocked' && /active run/.test(heldByBlock.reason) && heldRow.state === 'queued' && heldRow.submissions === 0 && approved.outcome === 'completed' && afterApproved.outcome === 'completed')
    approval.execution.enqueue(approval.intent('cancel-blocked', 'FIXTURE:approval cancel'))
    await approval.execution.pump(approvalThread)
    await until(async () => { await approval.execution.observe(approvalThread); return approval.execution.row('cancel-blocked') }, row => row.state === 'blocked')
    await approval.execution.cancel('cancel-blocked')
    const cancelledBlocked = await approval.settle('cancel-blocked')
    await sleep(2000)
    const blockedAfterCancel = await statusOf(limited, approvalThread)
    note('Pending count 2 seconds after interrupting an approval-blocked run', { active: blockedAfterCancel.active, pending: blockedAfterCancel.pending })
    await approval.execution.release(approvalThread, 'Reviewed the cancelled approval')
    approval.execution.enqueue(approval.intent('after-cancelled-approval', 'after cancelled approval'))
    await approval.execution.pump(approvalThread)
    const afterCancelledApproval = await approval.settle('after-cancelled-approval')
    check('Contract: cancelling a blocked run reaches terminal, and later work runs after release', { outcome: cancelledBlocked.outcome, next: afterCancelledApproval.outcome, turns: await providerTurns('after cancelled approval') },
      cancelledBlocked.outcome === 'interrupted' && afterCancelledApproval.outcome === 'completed' && await providerTurns('after cancelled approval') === 1)
    const falselyBlocked = approval.execution.transitions().filter(row => row.to_state === 'blocked' && ['after-approval', 'after-cancelled-approval'].includes(row.execution))
    check('Contract: plain work is never reported blocked, despite a stale pending count', { falselyBlocked: falselyBlocked.length }, falselyBlocked.length === 0)
    approval.finish()
  } finally { await browser.close() }

  const asking = await launch('FIXTURE:input question')
  const inputWaiting = await until(() => statusOf(client, asking.threadId), state => state.pending === 1)
  const inputRequests = await client.tool('t3_pending_request', { action: 'list', threadId: asking.threadId })
  const answered = inputRequests.requestIds[0] && await client.tool('t3_pending_request', { action: 'respond', threadId: asking.threadId, requestId: inputRequests.requestIds[0], answers: { proceed: 'Yes' } })
  const inputDone = await until(() => statusOf(client, asking.threadId), state => state.status === 'completed')
  check('Input requests are listed and answered through MCP, unlike approvals', { pending: inputWaiting.pending, listed: inputRequests.requestIds.length, answered: Boolean(answered), final: inputDone.status },
    inputWaiting.pending === 1 && inputRequests.requestIds.length === 1 && inputDone.status === 'completed')

  const inputThread = (await launch('contract input baseline', limited)).threadId
  await until(() => statusOf(limited, inputThread), state => state.status === 'completed')
  const inputContract = contract('input', limited, inputThread)
  await inputContract.execution.observe(inputThread)
  inputContract.execution.enqueue(inputContract.intent('asks', 'FIXTURE:input contract'))
  await inputContract.execution.pump(inputThread)
  const inputBlocked = await until(async () => { await inputContract.execution.observe(inputThread); return inputContract.execution.row('asks') }, row => row.state === 'blocked')
  const contractRequest = (await limited.tool('t3_pending_request', { action: 'list', threadId: inputThread })).requestIds[0]
  await limited.tool('t3_pending_request', { action: 'respond', threadId: inputThread, requestId: contractRequest, answers: { proceed: 'Yes' } })
  const inputSettled = await inputContract.settle('asks')
  check('Contract: an input request is reported blocked, then completes once answered', { blocked: inputBlocked.state, outcome: inputSettled.outcome }, inputBlocked.state === 'blocked' && inputSettled.outcome === 'completed')
  inputContract.finish()

  const absent = await client.read(`mcp:${'0'.repeat(32)}`).catch(error => error)
  check('Reading a thread that does not exist is thread_not_found', { code: absent.code }, absent.code === 'thread_not_found')

  // A person's queued message, seen and removed through the owner exit by a least-privilege client.
  const strayThread = (await launch('FIXTURE:hold stray baseline', limited)).threadId
  await running(limited, strayThread)
  const strayActive = (await limited.read(strayThread)).thread.activeRunId
  const stray = contract('stray', limited, strayThread)
  await stray.execution.observe(strayThread)
  const strayRun = await limited.send(strayThread, 'stray message', key('send'))
  await stopInterrupt(limited, strayThread, strayActive)
  stray.execution.enqueue(stray.intent('after-stray', 'after stray'))
  const strayHeld = await until(() => stray.execution.pump(strayThread), result => /not linked/.test(result.reason ?? ''))
  await stray.execution.removeQueuedRun(strayThread, strayRun.runId, 'A person queued this message')
  await stray.execution.release(strayThread, 'Removed the stray run', { reviewedRuns: [strayRun.runId] })
  await stray.execution.pump(strayThread)
  const strayDone = await stray.settle('after-stray')
  check('Contract: a queued run nobody owns holds the thread, and the owner exit clears it from an approval-required client', { heldReason: /not linked/.test(strayHeld.reason), strayTurns: await providerTurns('stray message'), next: strayDone.outcome },
    /not linked/.test(strayHeld.reason) && await providerTurns('stray message') === 0 && strayDone.outcome === 'completed')
  stray.finish()

  // The contract against real T3: one submission at a time keeps work held.
  const contractThread = (await launch('contract baseline', limited)).threadId
  await until(() => statusOf(limited, contractThread), state => state.status === 'completed')
  const cancelling = contract('cancel', limited, contractThread)
  await cancelling.execution.observe(contractThread)
  const wrongRoute = (() => { try { cancelling.execution.enqueue({ ...cancelling.intent('wrong', 'wrong route'), fromActorId: 'mallory' }) } catch (error) { return error.code } })()
  check('Wrong route: zero submissions', { code: wrongRoute, turns: await providerTurns('wrong route'), persisted: cancelling.execution.rows().length }, wrongRoute === 'ROUTE_REJECTED' && await providerTurns('wrong route') === 0 && cancelling.execution.rows().length === 0)
  cancelling.execution.enqueue(cancelling.intent('cancel-me', 'FIXTURE:hold contract'))
  cancelling.execution.enqueue(cancelling.intent('held-work', 'contract held work'))
  await cancelling.execution.pump(contractThread)
  await running(limited, contractThread)
  const busy = await cancelling.execution.pump(contractThread)
  const cancelled = await cancelling.execution.cancel('cancel-me')
  const terminal = await cancelling.settle('cancel-me')
  await sleep(1000)
  const heldPump = await cancelling.execution.pump(contractThread)
  await sleep(500)
  const heldAfterCancel = { reason: heldPump.reason, state: cancelling.execution.row('held-work').state, turns: await providerTurns('contract held work') }
  check('Contract: cancel reaches terminal from a fresh read and a pump afterwards is held', { busyReason: busy.reason, immediate: cancelled.state, terminal: terminal.outcome, ...heldAfterCancel },
    terminal.outcome === 'interrupted' && /holds queued work/.test(heldPump.reason) && heldAfterCancel.state === 'queued' && heldAfterCancel.turns === 0)
  const plainBlocked = cancelling.execution.transitions().filter(row => row.to_state === 'blocked').length
  check('Contract: a plain running run is not reported blocked', { blockedTransitions: plainBlocked }, plainBlocked === 0)
  await cancelling.execution.release(contractThread, 'Reviewed cancelled run')
  await cancelling.execution.pump(contractThread)
  const releasedDone = await cancelling.settle('held-work')
  check('Contract: released work submits once and reaches its own terminal state', { outcome: releasedDone.outcome, turns: await providerTurns('contract held work') }, releasedDone.outcome === 'completed' && await providerTurns('contract held work') === 1)
  cancelling.finish()

  // A real lost acknowledgement: T3 accepts, the reply is discarded.
  const lostThread = (await launch('contract lost baseline', limited)).threadId
  await until(() => statusOf(limited, lostThread), state => state.status === 'completed')
  const lossy = Object.create(limited)
  lossy.send = async (...args) => { await limited.send(...args); throw new T3Unknown('Reply discarded by qualification') }
  const losing = contract('lost-ack', lossy, lostThread)
  await losing.execution.observe(lostThread)
  losing.execution.enqueue(losing.intent('lost-ack', 'contract lost ack'))
  await losing.execution.pump(lostThread)
  const unknownState = losing.execution.row('lost-ack').state
  const blockedReuse = losing.execution.blocker(lostThread)
  const reconciled = await losing.execution.reconcile('lost-ack')
  const exactRun = (await limited.read(lostThread)).thread.latestRunId
  const lostDone = await losing.settle('lost-ack')
  const lostAckTurns = await providerTurns('contract lost ack')
  check('Lost acknowledgement: unknown blocks reuse, then reconciles to the exact run without resubmitting', { unknownState, blockedReuse, reconciledToLatestRun: reconciled.runId === exactRun, outcome: lostDone.outcome, turns: lostAckTurns },
    unknownState === 'unknown' && blockedReuse && reconciled.runId === exactRun && lostDone.run_id === exactRun && lostAckTurns === 1)
  losing.finish()

  // Crash T3 itself: an active run, a queued run, and an approval-blocked run.
  const crashHeld = await launch('FIXTURE:hold crash')
  await running(client, crashHeld.threadId)
  const crashSend = key('send')
  const crashQueued = await client.send(crashHeld.threadId, 'crash queued', crashSend)
  const crashBlocked = await launch('FIXTURE:approval crash')
  await until(() => statusOf(client, crashBlocked.threadId), state => state.pending === 1)
  const crashTurnsBefore = (await providerLog()).filter(entry => entry.in?.method === 'turn/start').length
  killServer('SIGKILL')
  await sleep(500)
  await startServer(port)
  const notFoundBefore = transcript.filter(entry => entry.http === 404).length
  const afterCrash = await until(() => statusOf(client, crashHeld.threadId), state => state.runs.some(entry => entry.status === 'cancelled') && state.runs.length > 2 && !state.active, 10_000)
  check('T3 crash: the same credential works and a stale MCP session gets 404, then reopens', { notFound: transcript.filter(entry => entry.http === 404).length - notFoundBefore }, transcript.filter(entry => entry.http === 404).length > notFoundBefore)
  const replayAfterCrash = await client.send(crashHeld.threadId, 'crash queued', crashSend)
  const resumed = afterCrash.runs.filter(entry => entry.ordinal > 2)
  const notices = await client.tool('t3_thread_read', { threadId: crashHeld.threadId, view: 'activity', limit: 100, runLimit: 5, maxCharsPerItem: 160 })
  check('T3 crash: active run is cancelled', { firstRun: afterCrash.runs[0] }, afterCrash.runs[0].status === 'cancelled')
  note('T3\'s own resume run within 10 seconds of restart, which does not always appear', { runs: afterCrash.runs, resumedRuns: resumed.length, notice: notices.items.find(item => item.type === 'notification')?.text, providerTurnsAdded: (await providerLog()).filter(entry => entry.in?.method === 'turn/start').length - crashTurnsBefore })
  check('T3 crash: clientRequestId dedupes across restart with the same credential', { sameRun: replayAfterCrash.runId === crashQueued.runId }, replayAfterCrash.runId === crashQueued.runId)
  await sleep(5000)
  const blockedAfterCrash = await statusOf(client, crashBlocked.threadId)
  check('T3 crash: approval-blocked run is cancelled and not resumed after 5 seconds', blockedAfterCrash, blockedAfterCrash.status === 'cancelled' && blockedAfterCrash.pending === 0 && blockedAfterCrash.runs.length === 1)
  const stranded = await statusOf(client, crashHeld.threadId)
  note('A run queued before the T3 crash, 5 seconds after restart', { thread: stranded.status, queuedRun: stranded.runs[1] })
  const strandedInterrupt = await client.interrupt(crashHeld.threadId, crashQueued.runId, key('cancel')).catch(error => error)
  const strandedRemoval = await client.cancelQueued(crashHeld.threadId, crashQueued.runId).then(() => 'removed', error => error.message)
  const strandedAfter = await statusOf(client, crashHeld.threadId)
  note('Cancelling that stranded queued run on an idle thread', { interrupt: strandedInterrupt.code ?? strandedInterrupt.status, removal: strandedRemoval, run: strandedAfter.runs[1] })

  const crashThread = (await launch('contract crash baseline', limited)).threadId
  await until(() => statusOf(limited, crashThread), state => state.status === 'completed')
  const crashing = contract('t3-crash', limited, crashThread)
  await crashing.execution.observe(crashThread)
  crashing.execution.enqueue(crashing.intent('crash-run', 'FIXTURE:hold contract crash'))
  crashing.execution.enqueue(crashing.intent('crash-next', 'crash next'))
  await crashing.execution.pump(crashThread)
  await running(limited, crashThread)
  killServer('SIGKILL')
  await sleep(500)
  await startServer(port)
  const crashState = await until(() => statusOf(limited, crashThread), state => state.runs.length > 2 && !state.active, 10_000)
  const crashPump = await crashing.execution.pump(crashThread)
  const crashTurns = await providerTurns('crash next')
  check('Contract: an unrequested cancel holds further dispatch, with one more hold if T3 resumed', { resumed: crashState.runs.length > 2, runs: crashState.runs, holdReasons: crashing.execution.holds(crashThread).map(reason => reason.replace(/^Run \S+/, 'Run')), run: crashing.execution.row('crash-run').outcome, next: crashing.execution.row('crash-next').state, holds: crashing.execution.holds(crashThread).length, reason: crashPump.reason, nextTurns: crashTurns },
    crashing.execution.row('crash-run').outcome === 'cancelled' && crashing.execution.row('crash-next').state === 'queued' && crashing.execution.holds(crashThread).length === crashState.runs.length - 1 && crashTurns === 0)
  crashing.finish()

  const fingerprint = createHash('sha256')
  for (const file of ['lib/t3-execution.js', 'lib/t3-mcp-client.js', 'scripts/t3-qualification.js', 'support/t3-fake-codex.mjs']) fingerprint.update(await readFile(join(root, file)))
  const failed = checks.filter(result => !result.passed)
  const report = { generatedBy: 'scripts/t3-qualification.js', evaluatedAt: new Date().toISOString(),
    environment: { t3: version, serverVersion: descriptor.serverVersion, orchestrationProtocol: descriptor.orchestrationProtocolVersion, node: process.version, chromium: await (async () => { const b = await chromium.launch(); const v = b.version(); await b.close(); return v })() },
    source: { baseCommit: (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(), qualificationFilesSha256: fingerprint.digest('hex') },
    provider: 'support/t3-fake-codex.mjs (no model turns)', summary: { checks: checks.length, passed: checks.length - failed.length, observationsNotCounted: observations.length, providerTurns: (await providerLog()).filter(entry => entry.in?.method === 'turn/start').length },
    checks, observations, ledgers, transcript, tools: { inventory: toolInventory, definitions } }
  const pseudonyms = new Map()
  const pseudonym = (kind, value) => { const id = `${kind}-${[...pseudonyms.keys()].filter(key => key.startsWith(`${kind}:`)).length + 1}`; const entry = `${kind}:${value}`; if (!pseudonyms.has(entry)) pseudonyms.set(entry, id); return pseudonyms.get(entry) }
  const sanitized = JSON.stringify(report, null, 1).replaceAll(home, '<isolated-home>').replaceAll(origin, '<loopback>')
    .replace(/mcp(?:%3A|:)launch(?:%3A|:)([0-9a-f]{64})/g, (_match, value) => pseudonym('thread', value))
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, value => pseudonym('id', value))
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${sanitized}\n`, { mode: 0o644 }) }
  console.log(`${checks.length - failed.length}/${checks.length} checks passed against ${version}; ${observations.length} observations recorded`)
  exitCode = failed.length ? 1 : 0
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  if (server) killServer('SIGTERM')
  await sleep(1000)
  if (server) killServer('SIGKILL')
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.error(`Left ${home}: ${error.message}`))
}
process.exit(exitCode)
