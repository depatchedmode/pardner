import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { startClientProcess } from '../support/acceptance/client-process.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'
import { ExpectedOperations, hash } from '../support/acceptance/expected-operations.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'
import { AgentProcess } from '../support/acceptance/agent-process.js'
import { joinApproved } from '../support/enrollment.js'

const args = process.argv.slice(2)
const option = (key, fallback) => { const index = args.indexOf(`--${key}`); return index < 0 ? fallback : args[index + 1] }
const repeat = Number(option('repeat', 1)), firstSeed = Number(option('seed', 1))
assert.ok(Number.isInteger(repeat) && repeat > 0 && Number.isInteger(firstSeed))
const output = resolve(option('output', `output/acceptance/${new Date().toISOString().replaceAll(':', '-')}`))
await mkdir(output, { recursive: true })
const candidate = await candidateFingerprint()
await writeFile(join(output, 'candidate.json'), JSON.stringify(candidate, null, 2))
function random(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
}

// Runtime children of a client process; a SIGKILLed client must not leave one holding the project storage lease.
const childPids = pid => { try { return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number) } catch { return [] } }
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const email = name => `${name.toLowerCase()}@example.test`
const AGENT_HARNESS = 'anthropic-claude-code'

/**
 * Client topology: side 0 is Alice's always-on desktop client, the project authority (hub), with no browser. Side 1
 * is Alice's laptop, joined with a `device` invitation (the same Actor on a second replica); side 2 is Bob's laptop,
 * joined with a `human` invitation. Each laptop reaches the hub only through its own NetworkGate, advertised as the
 * hub's loopback public URL when that laptop enrolled. The hub approves each laptop after comparing its confirmation
 * code. Builder is Alice's agent joined on her laptop and Reviewer is Bob's agent joined on his, each with an `agent`
 * invitation used on a machine already in the project (no approval); their workers hold agent-grant credentials.
 */
async function runSeed(seed) {
  const rng = random(seed), expected = new ExpectedOperations(), timings = []
  const root = await mkdtemp(join(tmpdir(), `pardner-acceptance-${seed}-`))
  const reportDirectory = join(output, `seed-${seed}`)
  await mkdir(reportDirectory, { recursive: true })
  const directories = [join(root, 'hub'), join(root, 'alice'), join(root, 'bob')]
  const deviceNames = ['Alice desktop', 'Alice laptop', 'Bob laptop']
  const services = [], gates = [], contexts = [], replicaIds = [], agents = [], pageErrors = []
  const actors = {}, grants = {}
  let scenarioError, project
  let browser, next = 0, responseQueue = Promise.resolve()
  const requestTimes = new Map()
  const opId = () => `seed-${seed}-operation-${++next}`
  const progress = text => console.log(`[seed ${seed}] ${text}`)
  const human = side => side === 2 ? 'bob' : 'alice'
  const api = path => `/projects/${project.id}/api/automerge${path}`
  // The hub advertises `gate` as its public URL, so the laptop that enrolls next reaches it only through that gate.
  const start = (side, gate) => startClientProcess(directories[side], ['--device-name', deviceNames[side], ...(gate ? ['--public-url', gate.httpUrl] : [])])
  const advertise = async gate => {
    await services[0]?.stop()
    services[0] = await start(0, gate)
    for (const each of gates) each.retarget({ httpUrl: services[0].url })
  }
  // Every harness operation goes through the client proxy: the local operator acts as the side's person, and an
  // agent writes with its own agent-grant credential, so the proxy binds and checks the author as in use.
  const execute = async (side, type, payload, who = human(side), operationId = opId()) => {
    const request = { operationId, type, actorId: actors[who], payload }
    expected.intend(request, replicaIds[side])
    const started = performance.now()
    const receipt = await services[side].call(api('/operations'), request, grants[who] ? { bearer: grants[who].token } : {})
    const elapsed = performance.now() - started
    expected.acknowledge(request, receipt, elapsed)
    timings.push({ kind: 'client-proxy-ack', side, operationId, elapsed })
    return receipt
  }
  const show = (side, id) => services[side].call(api(`/task/${encodeURIComponent(id)}/context`), undefined, { timeout: 5000 })
  const snapshot = async side => (await services[side].call(api('/doc'), undefined, { timeout: 5000 })).doc
  const status = side => services[side].call(api('/status'), undefined, { timeout: 5000 })
  // Every acknowledged operation shown as signed, with no Actor flag, on every replica, within ten seconds.
  const attributed = async () => {
    const started = performance.now()
    for (;;) {
      const docs = await Promise.all([0, 1, 2].map(snapshot))
      if (docs.every(doc => expected.attributed(doc))) {
        timings.push({ kind: 'attribution', elapsed: performance.now() - started })
        return docs
      }
      assert.ok(performance.now() - started <= 10000, 'Acknowledged operations were not all shown as signed on every replica within ten seconds')
      await delay(40)
    }
  }
  const converge = async () => {
    const started = performance.now()
    while (true) {
      const docs = await Promise.all([0, 1, 2].map(snapshot))
      const statuses = await Promise.all([1, 2].map(status))
      const elapsed = performance.now() - started
      assert.ok(elapsed <= 10000, 'Replicas did not converge within ten seconds')
      if (docs.every(doc => JSON.stringify(doc.heads) === JSON.stringify(docs[0].heads)) && statuses.every(current => current.syncPending === false)) {
        timings.push({ kind: 'convergence', elapsed })
        return docs
      }
      await delay(40)
    }
  }
  // A new laptop waits for the hub's owner to approve it after comparing the confirmation code; an agent joined on a
  // laptop already in the project is named there without approval.
  const enroll = async (side, invitation, operationId, agent) => {
    const joined = await joinApproved({ join: body => services[side].call('/join', body), approver: (path, body) => services[0].call(path, body),
      invitation, operationId, agent })
    assert.equal(joined.project.id, project.id)
    return joined.project
  }
  const openBoard = async (side, page) => {
    const { url } = await services[side].call('/open', {})
    await page.goto(url)
    await page.getByRole('button', { name: /Pardner task 0 / }).click()
  }
  try {
    // gates[0] stands between Alice's laptop and the hub, gates[1] between Bob's laptop and the hub.
    for (let side = 1; side <= 2; side++) gates.push(await new NetworkGate({ httpUrl: 'http://127.0.0.1:9' }).start())
    progress('Enrolling Alice’s laptop, Bob’s laptop and their agents through per-laptop network gates')
    await advertise(gates[0])
    await services[0].call('/identity', { name: 'Alice', email: email('Alice'), operationId: 'identity' })
    ;({ project } = await services[0].call('/projects', { name: `Acceptance ${seed}`, operationId: 'create' }))
    actors.alice = project.actorId
    services[1] = await start(1)
    const device = await services[0].call(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'invite-laptop' })
    assert.equal((await enroll(1, device.invitation, 'join-laptop')).actorId, actors.alice)
    const builderInvite = await services[1].call(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'invite-builder' })
    await enroll(1, builderInvite.invitation, 'join-builder', { harnessId: AGENT_HARNESS, name: 'Builder' })
    await advertise(gates[1])
    services[2] = await start(2)
    await services[2].call('/identity', { name: 'Bob', email: email('Bob'), operationId: 'identity' })
    const bobInvite = await services[0].call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite-bob' })
    actors.bob = (await enroll(2, bobInvite.invitation, 'join-bob')).actorId
    const reviewerInvite = await services[2].call(`/projects/${project.id}/invites`, { purpose: 'agent', operationId: 'invite-reviewer' })
    await enroll(2, reviewerInvite.invitation, 'join-reviewer', { harnessId: AGENT_HARNESS, name: 'Reviewer' })
    for (const [side, who] of [[1, 'builder'], [2, 'reviewer']]) {
      const grant = await services[side].call(`/projects/${project.id}/agent-grant`, { harnessId: AGENT_HARNESS })
      grants[who] = { ...grant, apiBase: `${services[side].url}/pardner/client/v1/projects/${project.id}/api`, file: join(root, `${who}-credential.json`) }
      await writeFile(grants[who].file, JSON.stringify(grants[who]), { mode: 0o600 })
      actors[who] = grant.actorId
    }
    for (const side of [0, 1, 2]) replicaIds[side] = (await status(side)).replicaId
    const enrolled = await converge()
    for (const [who, label] of [['builder', 'Builder'], ['reviewer', 'Reviewer']]) assert.equal(enrolled[0].actors[actors[who]].displayName, label)
    expected.ignore(Object.keys(enrolled[0].operations))
    progress('Creating 100 tasks and 400 comments through the hub client')
    const taskIds = []
    for (let i = 0; i < 100; i++) {
      taskIds.push((await execute(0, 'task.create', { title: `Pardner task ${i}`, description: `Seed ${seed}, task ${i}. ${'Complete local-first context. '.repeat(30)}`, assignee: actors[i % 2 ? 'bob' : 'alice'] })).result.taskId)
      for (let j = 0; j < 4; j++) await execute(0, 'comment.add', { taskId: taskIds[i], text: `Fixture comment ${i}/${j}: ${'Evidence and context. '.repeat(30)}` })
    }
    await converge()
    browser = await chromium.launch({ headless: true })
    const pages = []
    for (const side of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1360, height: 900 } })
      contexts.push(context)
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      const intent = request => ({ ...request.postDataJSON(), actorId: actors[human(side)] })
      page.on('request', request => {
        if (!new URL(request.url()).pathname.endsWith('/api/automerge/operations') || request.method() !== 'POST') return
        expected.intend(intent(request), replicaIds[side]); requestTimes.set(request, performance.now())
      })
      page.on('response', response => {
        const request = response.request()
        if (!requestTimes.has(request)) return
        responseQueue = responseQueue.then(async () => {
          assert.equal(response.status(), 200)
          expected.acknowledge(intent(request), await response.json(), performance.now() - requestTimes.get(request))
        })
      })
      await openBoard(side, page)
      pages.push(page)
    }
    progress('Partitioning both replicas and varying 200 operation schedules')
    gates.forEach(gate => gate.partition())
    for (let side = 1; side <= 2; side++) {
      const text = `Human ${side} authored offline in seed ${seed}.`
      await pages[side - 1].getByLabel('Comment', { exact: true }).fill(text)
      const started = performance.now()
      await pages[side - 1].getByRole('button', { name: 'Add comment', exact: true }).click()
      await pages[side - 1].getByText(text, { exact: true }).waitFor()
      const elapsed = performance.now() - started
      assert.ok(elapsed <= 2000, `Local UI visibility took ${elapsed}ms`)
      timings.push({ kind: 'local-ui-visible', elapsed })
    }
    await responseQueue
    // Different tasks have one offline owner; the explicit conflict scenario below
    // supplies competing same-field edits independently of the fixture workload.
    let restartedSide
    for (let i = 0; i < 200; i++) {
      const index = 1 + Math.floor(rng() * 99), side = index % 2 + 1
      const taskId = taskIds[index], field = rng() < .5 ? 'priority' : 'description'
      const value = field === 'priority' ? `p${Math.floor(rng() * 4)}` : `Scripted operation ${i}, seed ${seed}, task ${index}`
      const context = await show(side, taskId)
      await execute(side, 'task.update', { taskId, updates: { [field]: value }, expectedRevisions: { [field]: context.revisions[field] } })
      if (i === 80 + seed % 40) {
        const killedSide = restartedSide = seed % 2 + 1
        const runtimes = childPids(services[killedSide].child.pid)
        await services[killedSide].stop('SIGKILL')
        const started = performance.now()
        while (runtimes.some(alive)) {
          assert.ok(performance.now() - started <= 6000, 'A project runtime outlived its SIGKILLed client')
          await delay(10)
        }
        timings.push({ kind: 'orphan-runtime-exit', side: killedSide, runtimes: runtimes.length, elapsed: performance.now() - started })
        services[killedSide] = await start(killedSide)
        // The restart is complete when the project runtime (and its storage lease) answers with saved local state.
        while (!(await status(killedSide).catch(() => ({}))).savedLocally) await delay(20)
        const elapsed = performance.now() - started
        assert.ok(elapsed <= 6000, `Offline restart took ${elapsed}ms`)
        timings.push({ kind: 'offline-start', side: killedSide, elapsed })
      }
    }
    // The browser of the killed client reopens on the same address; its session cookie persists across the restart.
    await pages[restartedSide - 1].reload()
    await pages[restartedSide - 1].getByRole('button', { name: /Pardner task 0 / }).click()
    for (const side of [1, 2]) {
      const context = await show(side, taskIds[0])
      await execute(side, 'task.update', { taskId: taskIds[0], updates: { status: side === 1 ? 'in-progress' : 'review' }, expectedRevisions: { status: context.revisions.status } })
    }
    gates[seed % 2].loseResponse('/automerge/sync-ack', 1 + seed % 2)
    for (const index of seed % 2 ? [1, 0] : [0, 1]) { gates[index].partition(false); await delay(40 + Math.floor(rng() * 120)) }
    await converge()
    const conflict = await show(1, taskIds[0])
    assert.equal(conflict.conflicts.status.length, 2)
    await pages[0].getByRole('heading', { name: 'Resolve status', exact: true }).waitFor()
    await pages[0].getByRole('button', { name: 'Keep this status', exact: true }).first().click()
    await pages[0].getByRole('heading', { name: 'Resolve status', exact: true }).waitFor({ state: 'hidden' })
    await responseQueue
    await converge()
    progress('Running the human → builder → reviewer → human handoff with durable workers')
    await pages[0].getByRole('button', { name: 'Hand off work', exact: true }).click()
    await pages[0].getByLabel('Recipient', { exact: true }).selectOption({ label: 'Builder · agent' })
    const handoffText = `Seed ${seed}: builder, please implement the accepted work.`
    await pages[0].getByLabel('Handoff message', { exact: true }).fill(handoffText)
    await pages[0].getByRole('button', { name: 'Hand off', exact: true }).click()
    await pages[0].getByText(handoffText, { exact: true }).waitFor()
    await responseQueue
    await converge()
    for (const [index, who] of ['builder', 'reviewer'].entries()) {
      let intentStarted
      const agent = new AgentProcess({ directory: join(root, who), tokenFile: grants[who].file, actorId: actors[who] }, message => {
        if (message.intent) { expected.intend(message.intent, replicaIds[index + 1]); intentStarted = performance.now() }
        if (message.checkpoint === 'effect-saved') {
          const intent = expected.intents.get(message.receipt.requestId)
          const elapsed = performance.now() - intentStarted
          expected.acknowledge(intent, message.receipt, elapsed)
          timings.push({ kind: 'agent-effect-ack', operationId: intent.operationId, elapsed })
        }
      })
      agents.push(agent)
      await agent.start()
    }
    assert.equal((await agents[0].run('received')).result.paused, true)
    if (seed % 2) { await agents[0].stop('SIGKILL'); await agents[0].start() }
    // A replica's delivery calls reach the hub as /delivery with the action in the body.
    gates[0].loseResponse('/delivery', 1, body => body?.action === 'ack')
    assert.equal((await agents[0].run('acknowledged')).error.code, 'HUB_UNAVAILABLE')
    await agents[0].stop('SIGKILL'); await agents[0].start()
    assert.equal((await agents[0].run('acknowledged')).result.paused, true)
    gates[0].partition()
    assert.equal((await agents[0].run('effect-saved')).result.paused, true)
    await agents[0].stop('SIGKILL'); await agents[0].start()
    assert.equal((await agents[0].run()).result.complete, true)
    gates[0].partition(false)
    await converge()
    let taskContext = await show(1, taskIds[0])
    await execute(1, 'task.handoff', { taskId: taskIds[0], to: actors.reviewer, status: 'review', message: 'Builder finished; reviewer, check the recorded work.',
      expectedRevisions: { assignee: taskContext.revisions.assignee, status: taskContext.revisions.status } }, 'builder')
    await converge()
    const reviewerPause = seed % 2 ? 'effect-saved' : 'received'
    assert.equal((await agents[1].run(reviewerPause)).result.paused, true)
    await agents[1].stop('SIGKILL'); await agents[1].start()
    assert.equal((await agents[1].run()).result.complete, true)
    taskContext = await show(2, taskIds[0])
    await execute(2, 'task.handoff', { taskId: taskIds[0], to: actors.alice, status: 'review', message: 'Reviewer finished; Alice can confirm completion.',
      expectedRevisions: { assignee: taskContext.revisions.assignee, status: taskContext.revisions.status } }, 'reviewer')
    await converge()
    for (const agent of agents) assert.equal((await agent.run()).result.idle, true)
    // A lost HTTP response must replay the browser's original operation ID.
    let lostOperationId
    await pages[0].route('**/automerge/operations', async route => {
      const request = route.request().postDataJSON()
      if (!lostOperationId && request.type === 'comment.add') {
        lostOperationId = request.operationId
        const response = await route.fetch()
        assert.equal(response.status(), 200)
        await route.abort('failed')
      } else await route.continue()
    })
    const confirmation = `Alice confirmed the handoff in seed ${seed}.`
    await pages[0].getByLabel('Comment', { exact: true }).fill(confirmation)
    await pages[0].getByRole('button', { name: 'Add comment', exact: true }).click()
    await pages[0].getByRole('button', { name: 'Retry saved request', exact: true }).click()
    await pages[0].getByRole('button', { name: 'Retry saved request', exact: true }).waitFor({ state: 'hidden' })
    await responseQueue
    assert.equal(expected.receipts.get(lostOperationId).receipt.replayed, true)
    assert.equal(await pages[0].getByText(confirmation, { exact: true }).count(), 1)
    await pages[0].unroute('**/automerge/operations')
    await pages[0].getByRole('button', { name: 'Edit task', exact: true }).click()
    await pages[0].getByLabel('Status', { exact: true }).selectOption('completed')
    await pages[0].getByRole('button', { name: 'Save changes', exact: true }).click()
    await pages[0].getByRole('button', { name: 'Edit task', exact: true }).waitFor()
    await responseQueue
    assert.equal((await show(1, taskIds[0])).task.status, 'completed')
    const commit = { hash: '0123456789abcdef'.repeat(2) + '01234567',
      message: `Agent evidence for seed ${seed}\n\n${'Complete evidence body. '.repeat(40)}`,
      diff: { shortstat: '1 file changed, 1 insertion' } }
    await execute(1, 'task.link-commit', { taskId: taskIds[0], commit }, 'builder')
    await converge()
    const observed = (await show(1, taskIds[0])).comments.map(comment => ({ commentId: comment.id, revisionId: comment.revisionId }))
    // Alice reads half on her laptop and half on her desktop while they are partitioned; Bob's unread state is his own.
    gates.forEach(gate => gate.partition())
    const halfway = Math.ceil(observed.length / 2)
    await execute(1, 'read.mark', { taskId: taskIds[0], comments: observed.slice(0, halfway) })
    await execute(0, 'read.mark', { taskId: taskIds[0], comments: observed.slice(halfway) })
    gates.forEach(gate => gate.partition(false))
    await converge()
    assert.equal((await show(1, taskIds[0])).unreadCount, 0)
    assert.equal((await show(2, taskIds[0])).unreadCount, observed.length)
    assert.deepEqual((await show(1, taskIds[0])).evidence, [commit])
    const agentEvidence = agents.map(agent => agent.evidence())
    for (const evidence of agentEvidence) {
      assert.equal(evidence.inbox.length, 1)
      assert.equal(evidence.inbox[0].acknowledged, 1)
      assert.equal(evidence.inbox[0].complete, 1)
      assert.equal(evidence.effects.length, 1)
      assert.ok(evidence.events.some(event => event.checkpoint === 'context-read' && event.assignedTaskIds.includes(taskIds[0]) && event.descriptionLength > 500 && event.commentCount >= 4 && event.historyCount >= 5))
    }
    assert.deepEqual(pageErrors, [])
    progress('Verifying acknowledged operations and final effects against the independent manifest')
    await converge()
    // Signatures travel in their own document, so they may land just after the boards converged.
    const docs = await attributed()
    const verified = docs.map(doc => expected.verify(doc))
    assert.ok(verified.every(result => result.snapshotHash === verified[0].snapshotHash))
    const maxima = {}
    for (const { kind, elapsed } of timings) maxima[kind] = Math.max(maxima[kind] ?? 0, elapsed)
    const report = { seed, candidateSha256: candidate.sha256, scenarioPassed: true, topology: 'client', maxima, timings, gates: gates.map(gate => gate.events), verified, agentEvidence,
      manifest: expected.report(), heads: docs.map(doc => doc.heads), fixture: { tasks: 100, comments: 400, scriptedOperations: 200 },
      limits: { localAckMs: 2500, clientProxyAckMs: 2500, agentEffectAckMs: 2500, localVisibleMs: 2000, offlineStartMs: 6000, convergenceMs: 10000 } }
    await writeFile(join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(join(reportDirectory, 'snapshot.json'), JSON.stringify(docs[0]))
    progress(`Maxima (ms): ${Object.entries(maxima).map(([kind, value]) => `${kind} ${value.toFixed(1)}`).join(', ')}`)
    return { seed, scenarioPassed: true, report: join(reportDirectory, 'report.json'), maxima, hash: hash(report) }
  } catch (error) {
    scenarioError = error
    await writeFile(join(reportDirectory, 'failure.json'), JSON.stringify({ seed, error: error.stack, timings, gates: gates.map(gate => gate.events), manifest: expected.report() }, null, 2))
    throw error
  } finally {
    const cleanupErrors = []
    const cleanup = async actions => {
      const results = await Promise.allSettled(actions.map(action => action()))
      for (const result of results) if (result.status === 'rejected') cleanupErrors.push(result.reason)
    }
    await cleanup(agents.map(agent => () => agent.stop()))
    await cleanup(services.map((service, side) => async () => {
      if (service) await writeFile(join(reportDirectory, `service-${side}.log`), JSON.stringify(service.logs(), null, 2))
    }))
    await cleanup(contexts.map((context, index) => () => context.tracing.stop({ path: join(reportDirectory, `browser-${index}.zip`) })))
    await cleanup([() => browser?.close()])
    await cleanup(services.slice().reverse().map(service => () => service?.stop()))
    await cleanup(gates.map(gate => () => gate.close()))
    await cleanup([() => rm(root, { recursive: true, force: true })])
    if (cleanupErrors.length) {
      await writeFile(join(reportDirectory, 'cleanup-errors.json'), JSON.stringify(cleanupErrors.map(error => error.stack || String(error)), null, 2))
      throw new AggregateError([...(scenarioError ? [scenarioError] : []), ...cleanupErrors], 'Acceptance failed to cleanly release all resources')
    }
  }
}
const reports = []
for (let i = 0; i < repeat; i++) reports.push(await runSeed(firstSeed + i))
const finalCandidate = await candidateFingerprint()
assert.equal(finalCandidate.sha256, candidate.sha256, 'Source or built UI changed during acceptance; this is not a single-candidate run')
await writeFile(join(output, 'summary.json'), JSON.stringify({ scenarioPassed: true, candidateSha256: candidate.sha256, repeat, reports }, null, 2))
console.log(`Acceptance scenario reports: ${output}`)
