import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { T3Execution } from '../lib/t3-execution.js'
import { T3Busy, T3McpClient, T3Rejected, T3Unknown } from '../lib/t3-mcp-client.js'

const threadId = 'thread-one'
const route = { actorId: 'builder', threadId, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] }
const intent = (id, text = id) => ({ id, actorId: 'builder', taskId: 'task', fromActorId: 'alice', threadId, text })
const runId = n => `run:thread:${threadId}:ordinal:${n}`

/** T3 behaviors observed in the installed qualification, scripted for deterministic boundaries. */
class ScriptedT3 {
  constructor() {
    this.runs = []
    this.byRequest = new Map()
    this.submissions = []
    this.pending = 0
    this.now = 1000
  }
  start(status = 'running') {
    const run = { runId: runId(this.runs.length + 1), status }
    this.runs.push(run)
    return run
  }
  async send(thread, text, request) {
    this.onSend?.()
    // Every call counts, including one T3 would deduplicate: the contract must not resend.
    this.submissions.push({ thread, text, request })
    let run = this.byRequest.get(request)
    if (!run) {
      run = this.start()
      this.byRequest.set(request, run)
    }
    if (this.loseReply) { this.loseReply = false; throw new T3Unknown('reply lost') }
    return { runId: run.runId, status: run.status }
  }
  async read() {
    const active = this.runs.find(run => run.status === 'running')
    const status = active ? 'running' : this.runs.at(-1)?.status ?? 'idle'
    return { observedAt: ++this.now, thread: { status, activeRunId: active?.runId ?? null, pendingRequestCount: this.pending }, runs: this.runs.map(run => ({ ...run })),
      pendingRunIds: this.pending && active ? [active.runId] : [] }
  }
  async findRequest(_thread, request) { return this.byRequest.get(request)?.runId ?? null }
  async interrupt(_thread, id) {
    this.interrupted = [...(this.interrupted ?? []), id]
    const run = this.runs.find(candidate => candidate.runId === id)
    if (!run) throw new T3Rejected('run_not_found', 'No such run')
    if (run.status === 'running' && !this.slowCancel) run.status = 'interrupted'
    return { runId: id, status: run.status === 'running' ? 'interrupt_requested' : run.status }
  }
  finish(n = this.runs.length, status = 'completed') { this.runs[n - 1].status = status }
}

async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-t3-'))
  const path = join(directory, 'executions.sqlite')
  const t3 = new ScriptedT3()
  const opened = []
  const open = (ownerId = 'controller', transport = t3) => {
    const execution = new T3Execution({ path, transport, ownerId, routes: [route], clock: () => t3.now })
    opened.push(execution)
    return execution
  }
  try { await callback({ t3, open, path }) } finally {
    for (const execution of opened) try { execution.close() } catch { /* A crash fixture already closed it. */ }
    await rm(directory, { recursive: true, force: true })
  }
}

it('rejects wrong routes with zero submissions and no retained intent', () => fixture(async ({ t3, open }) => {
  const execution = open()
  for (const wrong of [{ actorId: 'other' }, { taskId: 'other' }, { fromActorId: 'mallory' }, { threadId: 'other' }]) {
    assert.throws(() => execution.enqueue({ ...intent('wrong'), ...wrong }), { code: 'ROUTE_REJECTED' })
  }
  assert.deepEqual(execution.rows(), [])
  assert.equal((await execution.pump(threadId)).submitted, null)
  assert.equal(t3.submissions.length, 0)
  assert.throws(() => new T3Execution({ path: ':memory:', transport: t3, ownerId: 'x', routes: [route, { ...route, actorId: 'second' }] }), { code: 'AMBIGUOUS_ROUTE' })
  assert.throws(() => new T3Execution({ path: ':memory:', transport: t3, ownerId: 'x', routes: [route, { ...route, threadId: 'second' }] }), { code: 'AMBIGUOUS_ROUTE' })
}))

it('allows one controller per session and quarantines a competing dispatcher it cannot lock out', () => fixture(async ({ t3, open }) => {
  const execution = open('controller')
  assert.throws(() => open('competitor'), { code: 'CONTROLLER_CONFLICT' })
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.finish()
  await execution.observe(threadId)
  t3.start() // A person or second ledger submitted directly to the same thread.
  t3.finish()
  execution.enqueue(intent('second'))
  assert.match((await execution.pump(threadId)).reason, /not linked to an execution/)
  assert.equal(t3.submissions.length, 1)
  await assert.rejects(execution.release(threadId, 'Did not look'), { code: 'UNREVIEWED_RUN' })
  await execution.release(threadId, 'Reviewed the direct submission', { reviewedRuns: [runId(2)] })
  assert.equal(execution.reviews()[0].evidence, 'Reviewed the direct submission')
  assert.equal((await execution.pump(threadId)).submitted, 'second')
}))

it('retains follow-ups while busy, blocked or answered with 409 and submits one at a time', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  assert.equal((await execution.pump(threadId)).submitted, 'first')
  assert.match((await execution.pump(threadId)).reason, /active run/)
  t3.pending = 1
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'blocked')
  assert.equal(execution.row('first').observed_at, t3.now)
  assert.match((await execution.pump(threadId)).reason, /active run/)
  t3.pending = 0
  t3.finish()
  t3.onSend = () => { throw new T3Busy(409) }
  assert.match((await execution.pump(threadId)).reason, /409/)
  assert.deepEqual([execution.row('first').state, execution.row('second').state], ['terminal', 'queued'])
  assert.equal(t3.submissions.length, 1)
  t3.onSend = null
  assert.equal((await execution.pump(threadId)).submitted, 'second')
}))

it('does not treat accepted, queued or running as completed', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  assert.equal(execution.row('first').state, 'queued')
  await execution.pump(threadId)
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['running', null])
  t3.finish(1, 'failed')
  await execution.observe(threadId)
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['terminal', 'failed'])
}))

it('crash before send: durable intent survives and submits exactly once', () => fixture(async ({ t3, open }) => {
  const first = open()
  first.enqueue(intent('first'))
  first.close()
  const second = open()
  assert.equal(second.row('first').state, 'queued')
  await second.pump(threadId)
  assert.equal(t3.submissions.length, 1)
}))

it('crash after provider acceptance before local persistence: reconciles the exact run without resubmitting', () => fixture(async ({ t3, open }) => {
  const first = open()
  first.enqueue(intent('first'))
  const request = first.row('first').request
  await t3.send(threadId, 'first', request)
  // The process died after T3 accepted, with only `submitting` saved.
  first.database.prepare("UPDATE executions SET state = 'submitting' WHERE id = 'first'").run()
  first.close()
  const second = open()
  assert.deepEqual([second.row('first').state, second.row('first').submissions], ['unknown', 1])
  assert.equal((await second.reconcile('first')).runId, runId(1))
  assert.equal(second.row('first').state, 'running')
  assert.equal(second.row('first').request, request)
  assert.equal(t3.submissions.length, 1)
}))

it('a crash during submission counts as possibly accepted, so a retried cancel stays unknown', () => fixture(async ({ t3, open }) => {
  const first = open()
  first.enqueue(intent('first'))
  first.database.prepare("UPDATE executions SET state = 'submitting' WHERE id = 'first'").run()
  first.close()
  const second = open()
  await second.resolve('first', 'retry', 'No record of it')
  assert.equal(second.row('first').evidence, 'No record of it')
  assert.equal((await second.cancel('first')).state, 'unknown')
  assert.equal(t3.submissions.length, 0)
}))

it('counts a normal acceptance as one submission and rejects an invalid decision', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  assert.equal(execution.row('first').submissions, 1)
  t3.loseReply = true
  execution.enqueue(intent('second'))
  t3.finish()
  await execution.pump(threadId)
  await assert.rejects(execution.resolve('second', 'guess', 'Evidence'), /retry or abandon/)
}))

it('lost acknowledgement quarantines the thread when acceptance cannot be established', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Unknown('reply lost before T3 processed it') }
  await execution.pump(threadId)
  assert.equal(execution.row('first').state, 'unknown')
  assert.equal((await execution.reconcile('first')).established, false)
  assert.match((await execution.pump(threadId)).reason, /context blocked/)
  assert.equal(t3.submissions.length, 0)
  await assert.rejects(execution.resolve('first', 'retry', ' '), /evidence/)
  await execution.resolve('first', 'retry', 'Inspected T3: no accepted run')
  const request = execution.row('first').request
  assert.equal((await execution.pump(threadId)).submitted, 'first')
  assert.equal(t3.submissions[0].request, request)
}))

it('an owner retry finds work T3 already accepted instead of submitting it again', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  t3.loseReply = true
  await execution.pump(threadId)
  await execution.resolve('first', 'retry', 'Owner chose a same-key retry')
  assert.deepEqual([execution.row('first').state, execution.row('first').run_id], ['running', runId(1)])
  assert.equal(t3.submissions.length, 1)
  assert.throws(() => execution.enqueue(intent('first', 'different')), { code: 'OPERATION_ID_REUSED' })
}))

it('refuses a retry from another credential, which T3 would not deduplicate', () => fixture(async ({ t3, open }) => {
  t3.credentialId = 'first-credential'
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Unknown('reply lost') }
  await execution.pump(threadId)
  t3.credentialId = 'second-credential'
  await assert.rejects(execution.resolve('first', 'retry', 'Re-paired'), { code: 'CREDENTIAL_CHANGED' })
  assert.equal(execution.row('first').state, 'unknown')
  assert.equal(t3.submissions.length, 0)
  assert.equal((await execution.resolve('first', 'abandon', 'Owner gave up')).outcome, 'abandoned')
}))

it('never submits an intent cancelled during the pre-submission read', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  const read = t3.read.bind(t3)
  t3.read = async () => { t3.read = read; await execution.cancel('first'); return read() }
  assert.equal((await execution.pump(threadId)).submitted, null)
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['terminal', 'cancelled'])
  assert.equal(t3.submissions.length, 0)
}))

it('concurrent pumps make one submission', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await Promise.all([execution.pump(threadId), execution.pump(threadId)])
  assert.equal(t3.submissions.length, 1)
}))

it('stays held when T3 still has a run queued, even on an idle-looking thread', () => fixture(async ({ t3, open }) => {
  const execution = open()
  t3.runs.push({ runId: runId(1), status: 'cancelled' }, { runId: runId(2), status: 'queued' }, { runId: runId(3), status: 'completed' })
  execution.enqueue(intent('first'))
  assert.match((await execution.pump(threadId)).reason, /still holds .*ordinal:2 as queued/)
  assert.equal(t3.submissions.length, 0)
}))

it('reports an absent run as unknown rather than wedging, and treats malformed acceptance as unknown', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.runs.length = 0
  t3.byRequest.clear()
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'unknown')
  assert.equal((await execution.resolve('first', 'abandon', 'Run is gone')).outcome, 'abandoned')
  execution.enqueue(intent('second'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; return {} }
  await execution.pump(threadId)
  assert.equal(execution.row('second').state, 'unknown')
}))

it('drops a slow older read however late it lands, and keeps terminal state final', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.pending = 1
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'blocked')
  const stale = await t3.read()
  const read = t3.read.bind(t3)
  let deliver
  t3.read = () => { t3.read = read; return new Promise(done => { deliver = () => done(stale) }) }
  const slow = execution.observe(threadId)
  t3.pending = 0
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'running')
  deliver()
  await slow
  assert.equal(execution.row('first').state, 'running')
  t3.finish()
  await execution.observe(threadId)
  assert.equal(execution.row('first').outcome, 'completed')
  t3.finish(1, 'running')
  await execution.observe(threadId)
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['terminal', 'completed'])
  assert.deepEqual(execution.transitions().map(row => row.to_state), ['queued', 'submitting', 'running', 'blocked', 'running', 'terminal'])
}))

it('a read issued during the send does not quarantine the accepted run', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.observe(threadId)
  const before = await t3.read()
  const send = t3.send.bind(t3)
  const read = t3.read.bind(t3)
  let deliver, slow
  t3.send = async (...args) => {
    t3.send = send
    t3.read = () => { t3.read = read; return new Promise(done => { deliver = () => done(before) }) }
    slow = execution.observe(threadId)
    return send(...args)
  }
  await execution.pump(threadId)
  deliver()
  await slow
  assert.equal(execution.row('first').state, 'running')
}))

it('a read issued during reconciliation does not quarantine the established run', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  t3.loseReply = true
  await execution.pump(threadId)
  const before = { ...await t3.read(), runs: [] }
  const find = t3.findRequest.bind(t3)
  const read = t3.read.bind(t3)
  let deliver, slow
  t3.findRequest = async (...args) => {
    t3.read = () => { t3.read = () => { t3.read = read; throw new T3Unknown('follow-up lost') }; return new Promise(done => { deliver = () => done(before) }) }
    slow = execution.observe(threadId)
    return find(...args)
  }
  await execution.reconcile('first')
  deliver()
  await slow
  assert.equal(execution.row('first').state, 'running')
}))

it('reconciliation stands when its follow-up read fails', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  t3.loseReply = true
  await execution.pump(threadId)
  t3.read = async () => { throw new T3Unknown('reply lost') }
  assert.equal((await execution.reconcile('first')).runId, runId(1))
  assert.equal(execution.row('first').state, 'running')
}))

it('an abandon during a lookup that finds the run is not resurrected', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  t3.loseReply = true
  await execution.pump(threadId)
  const find = t3.findRequest.bind(t3)
  t3.findRequest = async (...args) => { await execution.resolve('first', 'abandon', 'Owner gave up'); return find(...args) }
  assert.equal((await execution.reconcile('first')).established, false)
  assert.equal(execution.row('first').outcome, 'abandoned')
}))

it('a refused cancel cannot undo a terminal read', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.interrupt = async () => { t3.finish(); throw new T3Rejected('capability_denied', 'Denied') }
  assert.deepEqual([(await execution.cancel('first')).state, execution.row('first').outcome], ['terminal', 'completed'])
}))

it('a busy reply to an interrupt returns the row with the reason', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.interrupt = async () => { throw new T3Busy(503) }
  const row = await execution.cancel('first')
  assert.equal(row.state, 'running')
  assert.match(row.reason, /503/)
}))

it('keeps a refusal when the read after it also fails', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.interrupt = async () => { throw new T3Rejected('auth_invalid', 'Refused') }
  t3.read = async () => { throw new T3Rejected('auth_invalid', 'Refused') }
  assert.match((await execution.cancel('first')).reason, /did not confirm/)
  assert.equal(execution.row('first').state, 'running')
}))

it('reports only the run with a waiting request as blocked', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  const read = t3.read.bind(t3)
  t3.read = async () => ({ ...await read(), pendingRunIds: ['another-run'] })
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'running')
}))

it('recovers a row stranded in submitting by a failed local write', () => fixture(async ({ open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.observe(threadId)
  execution.database.prepare("UPDATE executions SET state = 'submitting' WHERE id = 'first'").run()
  await execution.observe(threadId)
  assert.deepEqual([execution.row('first').state, execution.row('first').submissions], ['unknown', 1])
}))

it('sets a busy timeout so another writer is waited for', () => fixture(async ({ open }) => {
  assert.equal(open().database.prepare('PRAGMA busy_timeout').get().timeout, 5000)
}))

it('a release cannot clear a hold that arrived during its read', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  const read = t3.read.bind(t3)
  t3.read = async () => { t3.read = read; await execution.cancel('first'); return read() }
  await assert.rejects(execution.release(threadId, 'Reviewed something else'), { code: 'HOLD_CHANGED' })
  assert.equal(execution.holds(threadId).length, 1)
  assert.equal((await execution.pump(threadId)).submitted, null)
}))

it('gives the owner an exit from a queued run no execution owns', () => fixture(async ({ t3, open }) => {
  const execution = open()
  await execution.observe(threadId)
  t3.start('queued')
  t3.cancelQueued = async (_thread, id) => { t3.runs.find(run => run.runId === id).status = 'cancelled' }
  execution.enqueue(intent('first'))
  assert.match((await execution.pump(threadId)).reason, /not linked to an execution/)
  await assert.rejects(execution.removeQueuedRun(threadId, runId(1), ' '), /evidence/)
  await execution.removeQueuedRun(threadId, runId(1), 'A person queued this')
  await execution.release(threadId, 'Removed it', { reviewedRuns: [runId(1)] })
  assert.equal((await execution.pump(threadId)).submitted, 'first')
  await assert.rejects(execution.removeQueuedRun(threadId, runId(2), 'Mine'), { code: 'INVALID_EXECUTION_STATE' })
  assert.equal(execution.reviews().length, 2)
}))

it('a stale thread_not_found cannot override a newer read', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  const read = t3.read.bind(t3)
  let fail
  t3.read = () => { t3.read = read; return new Promise((_done, reject) => { fail = () => reject(new T3Rejected('thread_not_found', 'Gone')) }) }
  const slow = execution.observe(threadId)
  await execution.observe(threadId)
  fail()
  await assert.rejects(slow, { code: 'thread_not_found' })
  assert.equal(execution.row('first').state, 'running')
}))

it('naming one run on release does not clear a new hold about a similarly numbered run', () => fixture(async ({ t3, open }) => {
  const execution = open()
  await execution.observe(threadId)
  t3.start('completed')
  await execution.observe(threadId)
  const read = t3.read.bind(t3)
  t3.read = async () => { t3.read = read; execution.setHold(threadId, `Run ${runId(1)}0 ended cancelled outside this controller; T3 may resume it`); return read() }
  await assert.rejects(execution.release(threadId, 'Named run one', { reviewedRuns: [runId(1)] }), { code: 'HOLD_CHANGED' })
}))

it('allows removing a queued run left behind by an abandoned execution', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.runs.length = 0
  await execution.observe(threadId)
  await execution.resolve('first', 'abandon', 'Run vanished')
  t3.runs.push({ runId: runId(1), status: 'queued' })
  t3.cancelQueued = async (_thread, id) => { t3.runs.find(run => run.runId === id).status = 'cancelled' }
  await execution.removeQueuedRun(threadId, runId(1), 'Reappeared after abandon')
  assert.equal(t3.runs[0].status, 'cancelled')
}))

it('orders queued work by insertion, whatever the clock does, and picks it after the read', () => fixture(async ({ t3, open }) => {
  const execution = open()
  t3.now = 5000
  execution.enqueue(intent('earlier'))
  t3.now = 1000
  execution.enqueue(intent('later'))
  assert.equal((await execution.pump(threadId)).submitted, 'earlier')
}))

it('does not report blocked from a pending count with no waiting request on the run', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  const read = t3.read.bind(t3)
  t3.read = async () => ({ ...await read(), pendingRunIds: [], thread: { status: 'running', activeRunId: runId(1), pendingRequestCount: 1 } })
  await execution.observe(threadId)
  assert.equal(execution.row('first').state, 'running')
}))

it('refuses a retried request after re-pairing, even at submission time', () => fixture(async ({ t3, open }) => {
  t3.credentialId = 'first-credential'
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Unknown('reply lost') }
  await execution.pump(threadId)
  await execution.resolve('first', 'retry', 'No record of it')
  t3.credentialId = 'second-credential'
  await execution.pump(threadId)
  assert.equal(execution.row('first').state, 'unknown')
  assert.equal(t3.submissions.length, 0)
}))

it('validates intent before persisting, so one bad call cannot brick the ledger', () => fixture(async ({ open }) => {
  const execution = open()
  execution.enqueue(intent('good'))
  assert.throws(() => execution.enqueue({ ...intent('bad'), text: undefined }), /non-empty text/)
  assert.deepEqual(execution.rows().map(row => row.id), ['good'])
}))

it('a vanished thread makes its runs unknown, with an exit', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.read = async () => { throw new T3Rejected('thread_not_found', 'Gone') }
  await assert.rejects(execution.observe(threadId), { code: 'thread_not_found' })
  assert.equal(execution.row('first').state, 'unknown')
  assert.equal((await execution.resolve('first', 'abandon', 'Thread was deleted')).outcome, 'abandoned')
}))

it('cancelling a retry T3 may already hold reports unknown, not cancelled', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Unknown('reply lost') }
  await execution.pump(threadId)
  await execution.resolve('first', 'retry', 'No record of it')
  assert.equal((await execution.cancel('first')).state, 'unknown')
}))

it('a controller opening on another thread does not quarantine a live send', () => fixture(async ({ t3, path, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async (...args) => {
    new T3Execution({ path, transport: t3, ownerId: 'other', routes: [{ ...route, actorId: 'a', threadId: 'another' }] }).close()
    return send(...args)
  }
  assert.equal((await execution.pump(threadId)).submitted, 'first')
  assert.equal(execution.row('first').state, 'running')
}))

it('an in-flight submission blocks the next one from a second pump', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  const send = t3.send.bind(t3)
  let second
  t3.send = async (...args) => { t3.send = send; second = await execution.pump(threadId); return send(...args) }
  await execution.pump(threadId)
  assert.match(second.reason, /active run/)
  assert.equal(t3.submissions.length, 1)
}))

it('a poll during an unknown outcome does not mistake the run for a foreign one', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  t3.loseReply = true
  await execution.pump(threadId)
  await execution.observe(threadId)
  assert.deepEqual(execution.holds(threadId), [])
  await execution.reconcile('first')
  assert.deepEqual(execution.holds(threadId), [])
}))

it('an abandon during a retry lookup is not resurrected', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Unknown('reply lost') }
  await execution.pump(threadId)
  t3.findRequest = async () => { await execution.resolve('first', 'abandon', 'Owner gave up'); return null }
  await execution.resolve('first', 'retry', 'Racing')
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['terminal', 'abandoned'])
}))

it('a definite send rejection stays queued, and a revoked route is not submitted', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  const send = t3.send.bind(t3)
  t3.send = async () => { t3.send = send; throw new T3Rejected('capability_denied', 'Denied') }
  assert.match((await execution.pump(threadId)).reason, /Denied/)
  assert.deepEqual([execution.row('first').state, execution.row('first').submissions], ['queued', 0])
  execution.routes.set(threadId, { ...route, allowedFromActorIds: [] })
  assert.match((await execution.pump(threadId)).reason, /no longer authorized/)
  assert.equal(t3.submissions.length, 0)
}))

it('surfaces an inconclusive interrupt, and reports a failed queue removal', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.interrupt = async () => { throw new T3Unknown('reply lost') }
  await assert.rejects(execution.cancel('first'), T3Unknown)
  assert.equal(execution.row('first').state, 'cancel_requested')
  t3.interrupt = async () => { throw new T3Rejected('thread_not_interruptible', 'Queued') }
  t3.cancelQueued = async () => { throw new T3Unknown('Not queued') }
  t3.slowCancel = true
  assert.match((await execution.cancel('first')).reason, /did not confirm cancellation: Not queued/)
  await assert.rejects(execution.release(threadId, ' '), /evidence/)
}))

it('reports cancellation only from a terminal fresh read and holds queued work', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.slowCancel = true
  assert.equal((await execution.cancel('first')).state, 'cancel_requested')
  assert.match((await execution.pump(threadId)).reason, /holds queued work/)
  await assert.rejects(execution.release(threadId, 'too early'), { code: 'INVALID_EXECUTION_STATE' })
  assert.equal(execution.holds(threadId).length, 1)
  t3.finish(1, 'interrupted')
  await execution.observe(threadId)
  assert.deepEqual([execution.row('first').state, execution.row('first').outcome], ['terminal', 'interrupted'])
  assert.match((await execution.pump(threadId)).reason, /holds queued work/)
  assert.equal(t3.submissions.length, 1)
  await execution.release(threadId, 'Reviewed partial output')
  assert.equal((await execution.pump(threadId)).submitted, 'second')
}))

it('a delayed cancellation of an older execution targets its own run, not the newer one', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.finish()
  t3.start()
  await execution.cancel('first')
  assert.deepEqual(t3.interrupted, [runId(1)])
  assert.equal(t3.runs[1].status, 'running')
  assert.equal(execution.row('first').outcome, 'completed')
}))

it('a finished execution cannot be cancelled', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.finish()
  await execution.observe(threadId)
  await assert.rejects(execution.cancel('first'), { code: 'INVALID_EXECUTION_STATE' })
  assert.equal(t3.interrupted, undefined)
}))

it('reports a refused interrupt instead of claiming cancellation is under way', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.interrupt = async () => { throw new T3Rejected('capability_denied', 'Read-only client') }
  const row = await execution.cancel('first')
  assert.equal(row.state, 'running')
  assert.match(row.reason, /did not confirm cancellation: Read-only/)
  await execution.observe(threadId)
  assert.match(execution.row('first').reason, /did not confirm cancellation/)
  assert.equal(execution.holds(threadId).length, 1)
}))

it('removes its own run from T3\'s queue when T3 refuses to interrupt it', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  t3.runs[0].status = 'queued'
  t3.interrupt = async () => { throw new T3Rejected('thread_not_interruptible', 'Queued') }
  t3.cancelQueued = async (_thread, id) => { t3.runs.find(run => run.runId === id).status = 'cancelled' }
  assert.equal((await execution.cancel('first')).outcome, 'cancelled')
}))

it('a release racing a cancellation cannot clear the new hold', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.slowCancel = true
  const read = t3.read.bind(t3)
  t3.read = async () => { t3.read = read; await execution.cancel('first'); return read() }
  await assert.rejects(execution.release(threadId, 'Racing'), { code: 'INVALID_EXECUTION_STATE' })
  assert.equal(execution.holds(threadId).length, 1)
}))

it('a foreign-run hold survives alongside a cancellation hold and must be named on release', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.pump(threadId)
  await execution.cancel('first')
  t3.start('completed')
  await execution.observe(threadId)
  assert.equal(execution.holds(threadId).length, 2)
  await assert.rejects(execution.release(threadId, 'Reviewed the cancel only'), { code: 'UNREVIEWED_RUN' })
  await execution.release(threadId, 'Reviewed both', { reviewedRuns: [runId(2)] })
  assert.deepEqual(execution.holds(threadId), [])
}))

it('cancelling a queued intent never reaches T3, and unknown executions cannot be cancelled', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  assert.equal((await execution.cancel('first')).outcome, 'cancelled')
  execution.enqueue(intent('second'))
  t3.loseReply = true
  await execution.pump(threadId)
  await assert.rejects(execution.cancel('second'), { code: 'INVALID_EXECUTION_STATE' })
  assert.equal(t3.interrupted, undefined)
}))

it('holds as soon as its run is cancelled outside it, before T3 starts a restart resume', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.finish(1, 'cancelled')
  assert.match((await execution.pump(threadId)).reason, /ended cancelled outside this controller/)
  t3.start()
  t3.finish(2)
  assert.equal((await execution.pump(threadId)).submitted, null)
  assert.deepEqual([execution.row('first').outcome, execution.row('second').state, t3.submissions.length], ['cancelled', 'queued', 1])
}))

it('a pending count left behind by an interrupted run does not wedge the thread', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.pending = 1
  await execution.observe(threadId)
  await execution.cancel('first')
  await execution.release(threadId, 'Reviewed the cancelled approval')
  assert.equal((await execution.pump(threadId)).submitted, 'second')
}))

it('holds when a person interrupts its run in T3', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  execution.enqueue(intent('second'))
  await execution.pump(threadId)
  t3.finish(1, 'interrupted')
  assert.match((await execution.pump(threadId)).reason, /ended interrupted outside this controller/)
  assert.equal(t3.submissions.length, 1)
}))

it('does not submit on a read a newer one superseded', () => fixture(async ({ t3, open }) => {
  const execution = open()
  execution.enqueue(intent('first'))
  await execution.observe(threadId)
  const idle = await t3.read()
  const read = t3.read.bind(t3)
  let deliver
  t3.read = () => { t3.read = read; return new Promise(done => { deliver = () => done(idle) }) }
  const pump = execution.pump(threadId)
  t3.start()
  await execution.observe(threadId)
  await execution.release(threadId, 'Reviewed the direct run', { reviewedRuns: [runId(1)] })
  deliver()
  assert.match((await pump).reason, /superseded/)
  assert.equal(t3.submissions.length, 0)
}))

it('another controller on the same ledger cannot act on this thread', () => fixture(async ({ t3, path, open }) => {
  const alice = open('alice')
  alice.enqueue(intent('first'))
  alice.enqueue(intent('second'))
  await alice.pump(threadId)
  await alice.cancel('first')
  const bob = new T3Execution({ path, transport: t3, ownerId: 'bob', routes: [{ ...route, actorId: 'bob', threadId: 'bobs' }] })
  try {
    await assert.rejects(bob.cancel('first'), { code: 'CONTROLLER_CONFLICT' })
    await assert.rejects(bob.release(threadId, 'Not mine'), { code: 'CONTROLLER_CONFLICT' })
    await assert.rejects(bob.observe(threadId), { code: 'CONTROLLER_CONFLICT' })
    await assert.rejects(bob.pump(threadId), { code: 'CONTROLLER_CONFLICT' })
    await assert.rejects(bob.removeQueuedRun(threadId, runId(1), 'Not mine'), { code: 'CONTROLLER_CONFLICT' })
    assert.equal(alice.holds(threadId).length, 1)
  } finally { bob.close() }
}))

it('stops rather than treating an unrecognized run ID as run zero', () => fixture(async ({ t3, open }) => {
  const execution = open()
  await execution.observe(threadId)
  t3.start('completed')
  await execution.observe(threadId)
  t3.runs.push({ runId: 'run:thread:thread-one:other-format', status: 'completed' })
  execution.enqueue(intent('first'))
  await assert.rejects(execution.pump(threadId), { code: 'UNRECOGNIZED_RUN_ID' })
  assert.equal(t3.submissions.length, 0)
}))

it('a thread_not_found read supersedes an older read still in flight', () => fixture(async ({ t3, open }) => {
  const execution = open()
  await execution.observe(threadId)
  const stale = { ...await t3.read(), runs: [{ runId: runId(1), status: 'completed' }] }
  const read = t3.read.bind(t3)
  let deliver
  t3.read = () => { t3.read = async () => { throw new T3Rejected('thread_not_found', 'Gone') }; return new Promise(done => { deliver = () => done(stale) }) }
  const slow = execution.observe(threadId)
  await assert.rejects(execution.observe(threadId), { code: 'thread_not_found' })
  deliver()
  assert.equal((await slow).superseded, true)
  assert.deepEqual(execution.holds(threadId), [])
}))

it('rolls back a partial controller claim', () => fixture(async ({ t3, path, open }) => {
  open('controller').close()
  assert.throws(() => new T3Execution({ path, transport: t3, ownerId: 'other', routes: [{ ...route, actorId: 'a', threadId: 'new' }, { ...route, actorId: 'b' }] }), { code: 'CONTROLLER_CONFLICT' })
  const owner = new T3Execution({ path, transport: t3, ownerId: 'controller', routes: [{ ...route, actorId: 'a', threadId: 'new' }] })
  owner.close()
}))

it('names only runs with a waiting item as pending, ignoring a stale count', async () => {
  const replies = [{ thread: { pendingRequestCount: 1, activeRunId: 'blocked' }, recentRuns: [] }, { items: [{ status: 'completed', runId: 'old' }, { status: 'waiting', runId: 'blocked' }], hasMore: false },
    { thread: { pendingRequestCount: 0 }, recentRuns: [] }]
  const client = new T3McpClient({ origin: 'http://127.0.0.1:1', token: 't', fetch: async () => new Response(JSON.stringify({ result: { structuredContent: replies.shift() } })) })
  client.connected = true
  assert.deepEqual((await client.read('t')).pendingRunIds, ['blocked'])
  assert.deepEqual((await client.read('t')).pendingRunIds, [])
  replies.push({ thread: { pendingRequestCount: 1, activeRunId: null }, recentRuns: [] })
  assert.deepEqual((await client.read('t')).pendingRunIds, [])
  assert.equal(replies.length, 0, 'no timeline walk without an active run')
})

it('sends the arguments the contract depends on', async () => {
  const calls = []
  const pages = [{ items: [{ messageId: 'x:thread-send:other', runId: 'no' }], hasMore: true, nextPosition: 7 }, { items: [{ messageId: 'x:thread-send:a%20b', runId: 'yes' }], hasMore: false }]
  const client = new T3McpClient({ origin: 'http://127.0.0.1:1', token: 'secret', fetch: async (_url, init) => {
    assert.ok(init.signal, 'every request has a timeout')
    const { params } = JSON.parse(init.body)
    calls.push(params.arguments)
    return new Response(JSON.stringify({ result: { structuredContent: pages.length && params.arguments.view ? pages.shift() : { ok: true } } }))
  } })
  client.connected = true
  await client.send('t', 'm', 'r')
  await client.interrupt('t', 'run', 'c')
  assert.deepEqual(calls.slice(0, 2), [{ threadId: 't', message: 'm', clientRequestId: 'r', mode: 'queue' }, { threadId: 't', runId: 'run', clientRequestId: 'c' }])
  assert.equal(await client.findRequest('t', 'a b'), 'yes')
  assert.equal(calls.at(-1).afterPosition, 7)
  await client.cancelQueued('t', 'run')
  assert.deepEqual(calls.at(-1), { action: 'cancel', threadId: 't', queuedRunId: 'run' })
  pages.length = 0
  const clocked = new T3McpClient({ origin: 'http://127.0.0.1:1', token: 't', clock: () => 42, fetch: async (_url, init) => {
    calls.push(JSON.parse(init.body).params.arguments)
    return new Response(JSON.stringify({ result: { structuredContent: { thread: { pendingRequestCount: 0 }, recentRuns: [] } } }))
  } })
  clocked.connected = true
  assert.equal((await clocked.read('t')).observedAt, 42)
  assert.deepEqual(calls.at(-1), { threadId: 't', limit: 1, runLimit: 50, maxCharsPerItem: 1 })
  assert.ok(!client.credentialId.includes('secret'))
})

it('classifies T3 replies without guessing about ambiguous outcomes', async () => {
  const reply = (status, body) => async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })
  const failing = code => reply(200, JSON.stringify({ result: { isError: true, content: [{ text: JSON.stringify({ code, message: code }) }] } }))
  const client = request => { const c = new T3McpClient({ origin: 'http://127.0.0.1:1', token: 't', fetch: request }); c.connected = true; return c }
  for (const code of ['capability_denied', 'invalid_request', 'run_not_found', 'runtime_mode_escalation_denied', 'thread_not_found', 'thread_not_interruptible', 'thread_not_sendable']) {
    await assert.rejects(client(failing(code)).send('t', 'm', 'r'), { name: 'T3Rejected', code })
  }
  await assert.rejects(client(failing('orchestration_error')).send('t', 'm', 'r'), T3Unknown)
  await assert.rejects(client(reply(409, '')).send('t', 'm', 'r'), T3Busy)
  await assert.rejects(client(reply(503, '')).send('t', 'm', 'r'), T3Busy)
  await assert.rejects(client(reply(429, '')).send('t', 'm', 'r'), T3Busy)
  await assert.rejects(client(reply(401, '{}')).send('t', 'm', 'r'), T3Rejected)
  await assert.rejects(client(reply(200, 'not json')).send('t', 'm', 'r'), T3Unknown)
  await assert.rejects(client(async () => { throw new Error('reset') }).send('t', 'm', 'r'), T3Unknown)
  assert.deepEqual(await client(reply(200, 'event: message\ndata: {"result":{"structuredContent":{"runId":"r"}}}\n')).send('t', 'm', 'r'), { runId: 'r' })
  assert.throws(() => new T3McpClient({ origin: 'http://example.com', token: 't' }), /loopback/)
  let calls = 0
  const expiring = client(async () => { calls += 1; return calls === 1 ? new Response('', { status: 404 }) : new Response('{"result":{"structuredContent":{"ok":true}}}', { status: 200, headers: { 'mcp-session-id': 'new' } }) })
  expiring.session = 'old'
  assert.deepEqual(await expiring.tool('t', {}), { ok: true })
  assert.equal(calls, 4)
  let lostCalls = 0
  const lost = client(async () => { lostCalls += 1; return new Response('{}', { status: 404, headers: { 'mcp-session-id': 'again' } }) })
  lost.session = 'old'
  await assert.rejects(lost.tool('t', {}), T3Unknown)
  assert.ok(lostCalls < 6, 'a server that keeps answering 404 is reopened only once')
})
