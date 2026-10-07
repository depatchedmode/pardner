import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'
import { ExpectedOperations, hash } from '../support/acceptance/expected-operations.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'
import { AgentProcess } from '../support/acceptance/agent-process.js'

const args = process.argv.slice(2)
const option = (key, fallback) => { const index = args.indexOf(`--${key}`); return index < 0 ? fallback : args[index + 1] }
const repeat = Number(option('repeat', 1)), firstSeed = Number(option('seed', 1))
assert.ok(Number.isInteger(repeat) && repeat > 0 && Number.isInteger(firstSeed))
const limits = { localAckMs: Number(option('local-ack-ms', 2000)), localVisibleMs: 2000, offlineStartMs: 5000, convergenceMs: 10000 }
assert.ok(Number.isSafeInteger(limits.localAckMs) && limits.localAckMs > 0, '--local-ack-ms must be a positive integer in milliseconds')
const output = resolve(option('output', `output/acceptance/${new Date().toISOString().replaceAll(':', '-')}`))
await mkdir(output, { recursive: true })
const candidate = await candidateFingerprint()
await writeFile(join(output, 'candidate.json'), JSON.stringify(candidate, null, 2))
await writeFile(join(output, 'configuration.json'), JSON.stringify({ repeat, firstSeed, limits }, null, 2))
console.log(`Declared acceptance bounds: ${JSON.stringify(limits)}`)
function random(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
}

async function runSeed(seed) {
  const rng = random(seed), expected = new ExpectedOperations({ localAckMs: limits.localAckMs }), timings = []
  const root = await mkdtemp(join(tmpdir(), `pardner-acceptance-${seed}-`))
  const reportDirectory = join(output, `seed-${seed}`)
  await mkdir(reportDirectory, { recursive: true })
  const directories = [join(root, 'hub'), join(root, 'alice'), join(root, 'bob')]
  const services = [], gates = [], contexts = [], replicaIds = [], agents = [], pageErrors = []
  let scenarioError
  let browser, next = 0, responseQueue = Promise.resolve()
  const requestTimes = new Map()
  const opId = () => `seed-${seed}-operation-${++next}`
  const progress = text => console.log(`[seed ${seed}] ${text}`)
  const execute = async (side, type, payload, actorId = 'alice', operationId = opId()) => {
    const request = { operationId, type, actorId, payload }
    expected.intend(request, replicaIds[side])
    const started = performance.now()
    const result = await cli(directories[side], ['operation', '--request', JSON.stringify(request)])
    assert.equal(result.code, 0, result.stdout + result.stderr)
    const elapsed = performance.now() - started
    expected.acknowledge(request, result.result, elapsed)
    timings.push({ kind: 'local-ack', operationId, elapsed })
    return result.result
  }
  const show = async (side, id) => {
    const result = await cli(directories[side], ['show', id, '--actor', side === 2 ? 'bob' : 'alice'])
    assert.equal(result.code, 0, result.stdout)
    return result.result
  }
  const snapshot = async side => {
    const connection = JSON.parse(await readFile(join(directories[side], 'connection.json'), 'utf8'))
    const response = await fetch(`${connection.httpUrl}/automerge/doc`, { headers: { Authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(2000) })
    assert.equal(response.status, 200)
    return (await response.json()).doc
  }
  const converge = async () => {
    const started = performance.now()
    while (true) {
      const docs = await Promise.all([0, 1, 2].map(snapshot))
      const statuses = await Promise.all([1, 2].map(side => cli(directories[side], ['status'])))
      const elapsed = performance.now() - started
      assert.ok(elapsed <= 10000, 'Replicas did not converge within ten seconds')
      if (docs.every(doc => JSON.stringify(doc.heads) === JSON.stringify(docs[0].heads)) && statuses.every(status => status.result.syncPending === false)) {
        timings.push({ kind: 'convergence', elapsed })
        return docs
      }
      await delay(40)
    }
  }
  try {
    services[0] = await startCliService(directories[0])
    replicaIds[0] = JSON.parse(await readFile(join(directories[0], 'workspace.json'), 'utf8')).replicaId
    for (const [id, kind] of [['alice', 'human'], ['bob', 'human'], ['builder', 'agent'], ['reviewer', 'agent']]) await execute(0, 'actor.register', { id, handle: id, kind })
    const { token: hubToken } = JSON.parse(await readFile(join(directories[0], 'connection.json'), 'utf8'))
    for (const side of [1, 2]) {
      const gate = await new NetworkGate(services[0]).start()
      gates.push(gate)
      services[side] = await startCliService(directories[side], ['--role', 'replica', '--hub', gate.httpUrl, '--hub-ws', gate.wsUrl, '--hub-token', hubToken])
      replicaIds[side] = JSON.parse(await readFile(join(directories[side], 'workspace.json'), 'utf8')).replicaId
    }
    progress('Creating 100 tasks and 400 comments through the CLI')
    const taskIds = []
    for (let i = 0; i < 100; i++) {
      taskIds.push((await execute(0, 'task.create', { title: `Pardner task ${i}`, description: `Seed ${seed}, task ${i}. ${'Complete local-first context. '.repeat(30)}`, assignee: i % 2 ? 'bob' : 'alice' })).result.taskId)
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
      page.on('request', request => {
        if (new URL(request.url()).pathname !== '/automerge/operations' || request.method() !== 'POST') return
        const body = request.postDataJSON()
        expected.intend(body, replicaIds[side]); requestTimes.set(request, performance.now())
      })
      page.on('response', response => {
        const request = response.request()
        if (!requestTimes.has(request)) return
        responseQueue = responseQueue.then(async () => {
          assert.equal(response.status(), 200)
          expected.acknowledge(request.postDataJSON(), await response.json(), performance.now() - requestTimes.get(request))
        })
      })
      const { token } = JSON.parse(await readFile(join(directories[side], 'connection.json'), 'utf8'))
      await page.goto(`${services[side].httpUrl}/pardner/`)
      await page.getByLabel('Local service token').fill(token)
      await page.getByRole('button', { name: 'Connect', exact: true }).click()
      await page.getByLabel('Actor', { exact: true }).selectOption(side === 1 ? 'alice' : 'bob')
      await page.getByRole('button', { name: /Pardner task 0 alice/ }).click()
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
    for (let i = 0; i < 200; i++) {
      const index = 1 + Math.floor(rng() * 99), side = index % 2 + 1
      const taskId = taskIds[index], field = rng() < .5 ? 'priority' : 'description'
      const value = field === 'priority' ? `p${Math.floor(rng() * 4)}` : `Scripted operation ${i}, seed ${seed}, task ${index}`
      const context = await show(side, taskId)
      await execute(side, 'task.update', { taskId, updates: { [field]: value }, expectedRevisions: { [field]: context.revisions[field] } }, side === 1 ? 'alice' : 'bob')
      if (i === 80 + seed % 40) {
        const killedSide = seed % 2 + 1
        await services[killedSide].stop('SIGKILL')
        const started = performance.now()
        services[killedSide] = await startCliService(directories[killedSide])
        const elapsed = performance.now() - started
        assert.ok(elapsed <= 5000, `Offline restart took ${elapsed}ms`)
        timings.push({ kind: 'offline-start', elapsed })
      }
    }
    // The browser connected to the killed process is reopened using its persisted
    // tab credentials; each replica still has its distinct local service.
    for (let side = 1; side <= 2; side++) {
      if (new URL(pages[side - 1].url()).port !== new URL(services[side].httpUrl).port) {
        const { token } = JSON.parse(await readFile(join(directories[side], 'connection.json'), 'utf8'))
        await pages[side - 1].goto(`${services[side].httpUrl}/pardner/`)
        await pages[side - 1].getByLabel('Local service token').fill(token)
        await pages[side - 1].getByRole('button', { name: 'Connect', exact: true }).click()
        await pages[side - 1].getByLabel('Actor', { exact: true }).selectOption(side === 1 ? 'alice' : 'bob')
        await pages[side - 1].getByRole('button', { name: /Pardner task 0 alice/ }).click()
      }
    }
    for (const side of [1, 2]) {
      const context = await show(side, taskIds[0])
      await execute(side, 'task.update', { taskId: taskIds[0], updates: { status: side === 1 ? 'in-progress' : 'review' }, expectedRevisions: { status: context.revisions.status } }, side === 1 ? 'alice' : 'bob')
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
    await pages[0].getByLabel('Recipient', { exact: true }).selectOption('builder')
    const handoffText = `Seed ${seed}: builder, please implement the accepted work.`
    await pages[0].getByLabel('Handoff message', { exact: true }).fill(handoffText)
    await pages[0].getByRole('button', { name: 'Hand off', exact: true }).click()
    await pages[0].getByText(handoffText, { exact: true }).waitFor()
    await responseQueue
    await converge()
    for (const [index, actorId] of ['builder', 'reviewer'].entries()) {
      let intentStarted
      const agent = new AgentProcess({ directory: join(root, actorId), serviceDirectory: directories[index + 1], actorId }, message => {
        if (message.intent) { expected.intend(message.intent, replicaIds[index + 1]); intentStarted = performance.now() }
        if (message.checkpoint === 'effect-saved') {
          const intent = expected.intents.get(message.receipt.operationId)
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
    gates[0].loseResponse('/automerge/deliveries/ack')
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
    await execute(1, 'task.handoff', { taskId: taskIds[0], to: 'reviewer', status: 'review', message: 'Builder finished; reviewer, check the recorded work.',
      expectedRevisions: { assignee: taskContext.revisions.assignee, status: taskContext.revisions.status } }, 'builder')
    await converge()
    const reviewerPause = seed % 2 ? 'effect-saved' : 'received'
    assert.equal((await agents[1].run(reviewerPause)).result.paused, true)
    await agents[1].stop('SIGKILL'); await agents[1].start()
    assert.equal((await agents[1].run()).result.complete, true)
    taskContext = await show(2, taskIds[0])
    await execute(2, 'task.handoff', { taskId: taskIds[0], to: 'alice', status: 'review', message: 'Reviewer finished; Alice can confirm completion.',
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
    gates.forEach(gate => gate.partition())
    const halfway = Math.ceil(observed.length / 2)
    await execute(1, 'read.mark', { taskId: taskIds[0], comments: observed.slice(0, halfway) }, 'alice')
    await execute(2, 'read.mark', { taskId: taskIds[0], comments: observed.slice(halfway) }, 'alice')
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
    const docs = await converge()
    const verified = docs.map(doc => expected.verify(doc))
    assert.ok(verified.every(result => result.snapshotHash === verified[0].snapshotHash))
    const report = { seed, candidateSha256: candidate.sha256, scenarioPassed: true, timings, gates: gates.map(gate => gate.events), verified, agentEvidence,
      manifest: expected.report(), heads: docs.map(doc => doc.heads), fixture: { tasks: 100, comments: 400, scriptedOperations: 200 },
      limits }
    await writeFile(join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2))
    await writeFile(join(reportDirectory, 'snapshot.json'), JSON.stringify(docs[0]))
    return { seed, scenarioPassed: true, report: join(reportDirectory, 'report.json'), hash: hash(report) }
  } catch (error) {
    scenarioError = error
    await writeFile(join(reportDirectory, 'failure.json'), JSON.stringify({ seed, candidateSha256: candidate.sha256, limits, error: error.stack, timings, gates: gates.map(gate => gate.events), manifest: expected.report() }, null, 2))
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
await writeFile(join(output, 'summary.json'), JSON.stringify({ scenarioPassed: true, candidateSha256: candidate.sha256, repeat, limits, reports }, null, 2))
console.log(`Acceptance scenario reports: ${output}`)
