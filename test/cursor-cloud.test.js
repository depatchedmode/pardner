import { it, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { CursorCloudExecution } from '../lib/cursor-cloud-execution.js'
import { CursorCloudClient, CloudError, parseCloudSSE } from '../lib/cursor-cloud-client.js'

const evidence = []
after(async () => {
  if (process.env.PARDNER_CLOUD_FIXTURE_REPORT) await writeFile(process.env.PARDNER_CLOUD_FIXTURE_REPORT, JSON.stringify({ kind: 'deterministic-fixture-only', liveRequests: 0, traces: evidence }, null, 2))
})

const stamp = '2026-11-04T00:00:00.000Z'
const authority = { actorId: 'builder', taskId: 'task', fromActorId: 'alice' }
class Fixture {
  constructor() { this.reads = []; this.submissions = []; this.records = []; this.cancels = []; this.events = []; this.eventTrace = []; this.downloads = new Map([['patch.txt', Buffer.from('original')]]) }
  async create(body) {
    this.submissions.push(body)
    this.identity = { id: body.agentId, status: 'ACTIVE', env: { type: 'cloud' }, repos: body.repos }
    return { agent: { ...this.identity }, run: this.newRun() }
  }
  newRun() {
    const run = { id: `run-${this.records.length + 1}`, agentId: this.identity.id, status: 'RUNNING', createdAt: stamp, updatedAt: stamp }
    this.records.push(run); this.identity.latestRunId = run.id; this.identity.status = 'ACTIVE'
    return { ...run }
  }
  async followUp(id, body) { assert.equal(id, this.identity.id); this.submissions.push(body); return { run: this.newRun() } }
  async agent(id) { assert.equal(id, this.identity.id); this.reads.push({ at: Date.now(), agentId: id, agent: structuredClone(this.identity) }); return structuredClone(this.identity) }
  async run(id, runId) { assert.equal(id, this.identity.id); this.reads.push({ at: Date.now(), agentId: id, runId, run: structuredClone(this.records.find(row => row.id === runId)) }); return structuredClone(this.records.find(row => row.id === runId)) }
  async runs() { return structuredClone(this.records) }
  end(status = 'FINISHED') { Object.assign(this.records.at(-1), { status, result: 'partial output', git: { branches: [{ branch: 'mutable' }] } }); this.identity.status = 'IDLE' }
  async cancel(id, runId) {
    this.cancels.push({ id, runId })
    const row = this.records.find(row => row.id === runId)
    if (row.status === 'FINISHED') throw new CloudError(409, 'run_not_cancellable')
    row.status = 'CANCELLED'; row.result = 'partial output'; this.identity.status = 'IDLE'
    return { id: runId }
  }
  async artifacts() { return { items: [...this.downloads].map(([path, bytes]) => ({ path, sizeBytes: bytes.length, updatedAt: stamp })) } }
  async download(id, path) { return this.downloads.get(path) }
  async *stream(id, runId, options) { this.resume = options.lastEventId; for (const event of this.events) { this.eventTrace.push({ ...structuredClone(event), receivedAt: Date.now() }); yield event } }
}
async function fixture(work, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cloud-'))
  const transport = new Fixture(), path = join(directory, 'cloud.sqlite')
  const config = { path, ownerId: 'replica', transport, dispatchEnabled: true, ...options }
  let controller = new CursorCloudExecution(config)
  const context = controller.register({ contextId: 'context', projectId: 'project', ...authority, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'], repository: 'https://github.com/example/repo', startingRef: 'main' })
  const enqueue = (id, overrides = {}) => controller.enqueue({ executionId: id, contextId: 'context', ...authority, text: `prompt ${id}`, ...overrides })
  const pump = () => controller.pump('context')
  const freeze = (id = 'a') => controller.freeze({ executionId: id, ...authority, commit: 'a'.repeat(40), diff: 'diff bytes', tests: 'node --test: passed' })
  const restart = async () => { await controller.close(); controller = new CursorCloudExecution(config) }
  try { await work({ get c() { return controller }, context, config, transport, enqueue, pump, freeze, restart }) }
  finally { evidence.push({ scenarioIndex: evidence.length + 1, providerSubmissionCount: transport.submissions.length, requests: transport.submissions, reads: transport.reads, events: transport.eventTrace, cancellations: transport.cancels, snapshot: controller.snapshot() }); await controller.close(); await rm(directory, { recursive: true, force: true }) }
}

it('authorizes route before any receipt or submission; same IDs are idempotent but content reuse is rejected', async () => fixture(async f => {
  for (const overrides of [{ actorId: 'wrong' }, { taskId: 'wrong' }, { fromActorId: 'wrong' }]) assert.throws(() => f.enqueue('a', overrides), { code: 'ROUTE_REJECTED' })
  assert.equal(f.c.attempts().length, 0); assert.equal(f.transport.submissions.length, 0)
  f.enqueue('a'); f.enqueue('a'); assert.throws(() => f.enqueue('a', { text: 'different' }), { code: 'OPERATION_ID_REUSED' })
  await Promise.all([f.pump(), f.pump()]); assert.equal(f.transport.submissions.length, 1)
  assert.equal(f.c.attempt('a').runId, 'run-1')
  assert.equal(f.c.snapshot().contexts[0].location.kind, 'cloud')
  assert.equal('worktreePath' in f.c.snapshot().contexts[0].location, false)
}))
it('competing processes/controllers cannot open a live ledger, including the same owner', async () => fixture(async f => {
  assert.throws(() => new CursorCloudExecution(f.config), { code: 'CONTROLLER_CONFLICT' })
  assert.throws(() => new CursorCloudExecution({ ...f.config, ownerId: 'other' }), { code: 'CONTROLLER_CONFLICT' })
  await f.restart(); f.enqueue('a'); await f.pump(); assert.equal(f.transport.submissions.length, 1)
}))
it('disabled transport and revoked authorization keep durable intent queued', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); assert.equal(f.transport.submissions.length, 0)
  f.c.dispatchEnabled = true
  f.c.authorize({ contextId: 'context', allowedTaskIds: ['other'], allowedFromActorIds: ['alice'] })
  await f.pump(); assert.equal(f.transport.submissions.length, 0); assert.equal(f.c.attempt('a').state, 'queued')
}, { dispatchEnabled: false }))
it('restart before sending sends once; known active and terminal identities recover without another prompt', async () => fixture(async f => {
  f.enqueue('a'); await f.restart(); await f.pump(); await f.restart(); await f.c.poll()
  assert.equal(f.c.attempt('a').runId, 'run-1'); assert.equal(f.transport.submissions.length, 1)
  f.transport.end(); await f.restart(); await f.c.poll()
  assert.equal(f.c.attempt('a').state, 'terminal'); assert.equal(f.c.attempt('a').output, 'partial output')
  assert.equal(f.transport.submissions.length, 1)
}))
it('busy, background-work blocks and 409 agent_busy retain follow-ups in Pardner', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.enqueue('b')
  f.transport.records[0].status = 'WAITING_FOR_BACKGROUND_WORK'; await f.pump()
  assert.equal(f.c.attempt('a').state, 'blocked'); assert.equal(f.transport.submissions.length, 1)
  f.transport.end(); await f.c.observe('context'); await f.freeze()
  f.transport.followUp = async () => { throw new CloudError(409, 'agent_busy') }
  await f.pump(); assert.equal(f.c.attempt('b').state, 'queued'); assert.equal(f.c.attempt('b').runId, null)
}))
it('lost POST acknowledgement quarantines; fresh run lists never authorize guessing or retrying', async () => fixture(async f => {
  const create = f.transport.create.bind(f.transport)
  f.transport.create = async body => { await create(body); throw new Error('lost reply') }
  f.enqueue('a'); await f.pump(); f.enqueue('b'); await f.restart(); await f.c.poll(); await f.pump()
  assert.equal(f.c.attempt('a').state, 'unknown'); assert.equal(f.c.attempt('a').reconciliation.established, false)
  assert.equal(f.transport.submissions.length, 1); assert.equal(f.c.attempt('b').state, 'queued')
  await assert.rejects(f.c.release({ contextId: 'context', evidence: 'not proof' }))
}))
it('acceptance persistence failure is recovered as unknown, never submitted again', async () => fixture(async f => {
  f.enqueue('a')
  const save = f.c.saveAttempt.bind(f.c)
  f.c.saveAttempt = row => { if (row.acceptance) throw new Error('disk failure'); return save(row) }
  await assert.rejects(f.pump(), /disk failure/)
  assert.equal(f.c.attempt('a').state, 'submitting')
  await f.restart(); await f.c.poll(); assert.equal(f.transport.submissions.length, 1); assert.equal(f.c.attempt('a').state, 'unknown')
}))
it('wrong acceptance identity is quarantined and cannot authorize cancellation', async () => fixture(async f => {
  const create = f.transport.create.bind(f.transport)
  f.transport.create = async body => { const response = await create(body); response.run.agentId = 'wrong'; return response }
  f.enqueue('a'); await f.pump(); assert.equal(f.c.attempt('a').state, 'unknown')
  await assert.rejects(f.c.cancel({ executionId: 'a', ...authority })); assert.equal(f.transport.cancels.length, 0)
}))
it('cancellation is route-authorized, exact, durable before sending, and holds the next run', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.enqueue('b')
  await assert.rejects(f.c.cancel({ executionId: 'a', ...authority, taskId: 'wrong' }), { code: 'ROUTE_REJECTED' })
  const cancel = f.transport.cancel.bind(f.transport)
  f.transport.cancel = async (agent, run) => {
    assert.equal(f.c.attempt('a').state, 'cancel_requested'); assert.ok(f.c.context('context').hold)
    throw new Error('connection lost before cancel')
  }
  await assert.rejects(f.c.cancel({ executionId: 'a', ...authority }))
  f.transport.cancel = cancel; await f.restart(); await f.c.poll()
  assert.equal(f.c.attempt('a').outcome, 'CANCELLED'); assert.equal(f.c.attempt('a').output, 'partial output')
  assert.deepEqual(f.transport.cancels, [{ id: f.context.agentId, runId: 'run-1' }]); assert.equal(f.transport.submissions.length, 1)
  await f.freeze(); await f.c.release({ contextId: 'context', evidence: 'reviewed partial effects' }); await f.pump()
  assert.equal(f.c.attempt('b').runId, 'run-2')
  await f.c.cancel({ executionId: 'a', ...authority }); assert.equal(f.transport.cancels.length, 1)
}))
it('completion winning cancellation race stays FINISHED and retains queue hold', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.end()
  await f.c.cancel({ executionId: 'a', ...authority })
  assert.equal(f.c.attempt('a').outcome, 'FINISHED'); assert.ok(f.c.context('context').hold)
}))
it('immutable bytes and exact evidence gate precede later runs; mutable branches never replace it', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.enqueue('b'); f.transport.end(); await f.pump()
  assert.equal(f.transport.submissions.length, 1)
  const frozen = await f.freeze(); await assert.rejects(f.freeze(), /immutable/)
  f.transport.downloads.set('patch.txt', Buffer.from('later')); await f.pump()
  f.transport.records[0].git.branches[0].branch = 'later'
  await f.restart(); const earlier = f.c.evidence('a')
  assert.equal(earlier.sha256, frozen.sha256); assert.equal(Buffer.from(earlier.artifacts[0].base64, 'base64').toString(), 'original')
  assert.equal(earlier.git.branches[0].branch, 'mutable'); assert.equal(f.c.attempt('b').runId, 'run-2')
}))
it('foreign runs and incomplete/changing artifacts prevent reuse and false attribution', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.end(); await f.c.observe('context')
  const download = f.transport.download.bind(f.transport)
  f.transport.download = async (...args) => { f.transport.newRun(); return download(...args) }
  await assert.rejects(f.freeze(), /changed/)
  assert.equal(f.c.evidence('a'), null); f.enqueue('b'); await f.pump(); assert.equal(f.transport.submissions.length, 1)
  assert.match(f.c.context('context').hold, /Foreign/)
}))
it('SSE reconnect deduplicates opaque IDs; stale terminal events require a fresh exact run read', async () => fixture(async f => {
  f.enqueue('a'); await f.pump()
  const delta = { id: 'opaque-z', event: 'assistant', data: { text: 'one' } }
  f.transport.events = [delta, { id: 'opaque-a', event: 'result', data: { runId: 'run-1', status: 'FINISHED' } }]
  await f.c.stream('a'); assert.equal(f.c.attempt('a').state, 'running'); assert.equal(f.c.attempt('a').output, 'one')
  await f.c.stream('a'); assert.equal(f.transport.resume, 'opaque-a'); assert.equal(f.c.attempt('a').output, 'one')
  f.transport.events = [{ id: null, event: 'status', data: { runId: 'other', status: 'CANCELLED' } }]
  await assert.rejects(f.c.stream('a'), /Wrong SSE/); assert.equal(f.c.attempt('a').state, 'running')
  f.transport.end(); f.transport.stream = async function* () { throw new CloudError(410, 'stream_expired') }
  await f.c.stream('a'); assert.equal(f.c.attempt('a').outcome, 'FINISHED'); assert.equal(f.c.attempt('a').eventsIncomplete, true)
}))
it('stale provider timestamps fail closed and cannot free queued work', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); await f.c.observe('context'); f.enqueue('b')
  f.transport.records[0].updatedAt = '2020-01-01T00:00:00Z'; f.transport.end()
  await assert.rejects(f.pump(), /Stale/); assert.equal(f.transport.submissions.length, 1)
}))
it('HTTP boundary uses documented routes, bearer auth, exact cancellation, no retry and paginated reads', async () => {
  const calls = []
  const replies = [{ run: { id: 'r' } }, { id: 'r' }, { items: [{ id: 'r' }], nextCursor: 'next' }, { items: [{ id: 's' }] }]
  const client = new CursorCloudClient({ token: 'fixture', fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json(replies.shift()) } })
  await client.followUp('a', { prompt: { text: 'work' } }); await client.cancel('a', 'r'); assert.equal((await client.runs('a')).length, 2)
  assert.equal(calls[0].url, 'https://api.cursor.com/v1/agents/a/runs'); assert.equal(calls[1].url, 'https://api.cursor.com/v1/agents/a/runs/r/cancel')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture'); assert.equal(calls[0].init.redirect, 'error')
  assert.equal(JSON.parse(calls[0].init.body).delivery, undefined)
  let count = 0
  const failing = new CursorCloudClient({ token: 'fixture', fetchImpl: async () => { count++; return Response.json({ error: { code: 'agent_busy', message: 'secret' } }, { status: 409 }) } })
  await assert.rejects(failing.followUp('a', {}), error => error.code === 'agent_busy' && !error.message.includes('secret')); assert.equal(count, 1)
})
it('SSE parser handles split UTF-8, CRLF, multiline JSON and drops unfinished frames', async () => {
  const bytes = Buffer.from('id: opaque\r\nevent: assistant\r\ndata: {"text":\r\ndata: "é"}\r\n\r\nevent: done\ndata: {}')
  async function* body() { for (const byte of bytes) yield Uint8Array.of(byte) }
  const events = []; for await (const event of parseCloudSSE(body())) events.push(event)
  assert.deepEqual(events, [{ id: 'opaque', event: 'assistant', data: { text: 'é' } }])
})
it('lost follow-up reply is never retried, even after credential/transport replacement', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.end(); await f.c.observe('context'); await f.freeze()
  const send = f.transport.followUp.bind(f.transport)
  f.transport.followUp = async (...args) => { await send(...args); throw new Error('reply lost') }
  f.enqueue('b'); await f.pump(); f.enqueue('c'); await f.restart(); await f.c.poll(); await f.pump()
  assert.equal(f.c.attempt('b').state, 'unknown'); assert.equal(f.transport.submissions.length, 2)
  assert.equal(f.c.attempt('c').state, 'queued')
}))
it('owner-supplied exact acceptance is a recorded intervention, not inferred recovery', async () => fixture(async f => {
  let acceptance
  const create = f.transport.create.bind(f.transport)
  f.transport.create = async body => { acceptance = await create(body); throw new Error('lost') }
  f.enqueue('a'); await f.pump()
  await assert.rejects(f.c.establishAcceptance({ executionId: 'a', ...authority, fromActorId: 'other', acceptance, evidence: 'receipt' }), { code: 'ROUTE_REJECTED' })
  await f.c.establishAcceptance({ executionId: 'a', ...authority, acceptance, evidence: 'Original HTTP acceptance receipt reviewed' })
  assert.equal(f.c.attempt('a').runId, 'run-1'); assert.equal(f.c.attempt('a').intervention.actorId, 'alice')
  assert.ok(f.c.context('context').hold); assert.equal(f.transport.submissions.length, 1)
}))
it('failed evidence capture remains gated and no partial evidence record is accepted', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.end(); await f.c.observe('context'); f.enqueue('b')
  f.transport.download = async () => { throw new Error('artifact unavailable') }
  await assert.rejects(f.freeze()); await f.pump(); assert.equal(f.c.evidence('a'), null); assert.equal(f.transport.submissions.length, 1)
}))
it('409 cancellation refusal is only terminal if the fresh exact-run read is terminal', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.enqueue('b')
  f.transport.cancel = async () => { throw new CloudError(409, 'run_not_cancellable') }
  await f.c.cancel({ executionId: 'a', ...authority }); await f.pump()
  assert.equal(f.c.attempt('a').state, 'cancel_requested'); assert.equal(f.transport.submissions.length, 1)
}))
it('replayed SSE IDs with changed payload fail closed without duplicating output', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.events = [{ id: 'id', event: 'assistant', data: { text: 'one' } }]
  await f.c.stream('a'); f.transport.events[0].data.text = 'two'
  await assert.rejects(f.c.stream('a'), /changed an event/); assert.equal(f.c.attempt('a').output, 'one')
}))
it('authorization revocation ordered during a slow read is preserved and stops the next submission', async () => fixture(async f => {
  f.enqueue('a'); await f.pump(); f.transport.end(); await f.c.observe('context'); await f.freeze()
  let resume, entered
  const started = new Promise(resolve => { entered = resolve })
  const wait = new Promise(resolve => { resume = resolve })
  const agent = f.transport.agent.bind(f.transport)
  f.transport.agent = async id => { entered(); await wait; return agent(id) }
  const observation = f.c.observe('context'); await started
  const revocation = f.c.authorize({ contextId: 'context', allowedTaskIds: ['other'], allowedFromActorIds: ['alice'] })
  resume(); await observation; await revocation
  assert.deepEqual(f.c.context('context').allowedTaskIds, ['other'])
  assert.throws(() => f.enqueue('b'), { code: 'ROUTE_REJECTED' }); assert.equal(f.transport.submissions.length, 1)
}))

it('process death at the provider boundary releases the lock but preserves quarantine', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cloud-crash-'))
  const path = join(directory, 'cloud.sqlite')
  const moduleUrl = new URL('../lib/cursor-cloud-execution.js', import.meta.url).href
  const source = `import { CursorCloudExecution } from ${JSON.stringify(moduleUrl)};
    const c = new CursorCloudExecution({ path: ${JSON.stringify(path)}, ownerId: 'replica', dispatchEnabled: true,
      transport: { create: async () => { process.exit(73) } } });
    c.register({ contextId: 'context', projectId: 'project', actorId: 'builder', allowedTaskIds: ['task'], allowedFromActorIds: ['alice'], repository: 'https://github.com/example/repo', startingRef: 'main' });
    c.enqueue({ executionId: 'a', contextId: 'context', actorId: 'builder', taskId: 'task', fromActorId: 'alice', text: 'work' });
    await c.pump('context');`
  let reopened
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { timeout: 10000, encoding: 'utf8' })
    assert.equal(result.status, 73, result.stderr)
    reopened = new CursorCloudExecution({ path, ownerId: 'replica' })
    assert.equal(reopened.attempt('a').state, 'unknown'); assert.equal(reopened.attempt('a').submissions, 1)
    assert.equal(reopened.attempt('a').runId, null)
    assert.match(reopened.blocker('context'), /unknown/)
  } finally { await reopened?.close(); await rm(directory, { recursive: true, force: true }) }
})

it('expired stream switches to reads and is not reopened by the poller', async () => fixture(async f => {
  f.enqueue('a'); await f.pump()
  let streams = 0
  f.transport.stream = async function* () { streams++; throw new CloudError(410, 'stream_expired') }
  await f.c.stream('a'); await f.c.poll(); await f.c.poll()
  assert.equal(streams, 1); assert.equal(f.c.attempt('a').streamExpired, true)
  f.transport.end(); await f.c.poll(); assert.equal(f.c.attempt('a').outcome, 'FINISHED')
}))
