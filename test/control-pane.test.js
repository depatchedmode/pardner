import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { randomUUID } from 'node:crypto'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { ACTORS } from '../support/workspace-test.js'
import { FakeCursorCloud } from '../support/fake-cursor-cloud.js'
import { FakeT3 } from '../support/fake-t3-server.js'

const THREAD = 'thread-pardner'

/**
 * A real service and control ledger driving the real MCP client over HTTP against
 * a scripted T3. Polling is manual (`/pardner/control/poll`) so each step is
 * deterministic; restarts reopen the same data directory as a new process would.
 */
async function withControl(run, { version, pollMs = 60_000, staleAfterMs = 60_000, cloud = {} } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-control-'))
  const t3 = await new FakeT3({ version }).start()
  t3.thread(THREAD)
  const time = { offset: 0 }
  let server
  const open = async () => {
    server = new AutomergeSyncServer({ directory, actors: ACTORS, env: {}, apiToken: 'test-token', httpPort: 0, wsPort: 0, logger: {},
      control: { cloud, pollMs, staleAfterMs, clock: () => Date.now() + time.offset } })
    await server.start()
  }
  const api = async (path, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', Connection: 'close', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { ...(await response.json()), httpStatus: response.status }
  }
  const ok = async (path, body) => {
    const reply = await api(path, body)
    assert.equal(reply.httpStatus, 200, JSON.stringify(reply))
    return reply.result
  }
  const operation = async (type, payload, actorId = 'alice') => (await api('/automerge/operations', { type, payload, actorId, operationId: randomUUID() })).result
  const restart = async () => { await server.stop(); await open() }
  const poll = () => ok('/pardner/control/poll', {})
  const execution = async id => (await api('/pardner/control')).executions.find(row => row.id === id)
  const session = async () => (await api('/pardner/control')).sessions.find(row => row.threadId === THREAD)
  const setup = async () => {
    const taskId = (await operation('task.create', { title: 'Build the control pane' })).taskId
    await ok('/pardner/control/credential', { origin: t3.origin, pairingCode: t3.issueCode() })
    await ok('/pardner/control/projects', { id: 'pardner', name: 'Pardner', repository: 'depatchedmode/pardner' })
    await ok('/pardner/control/sessions', { projectId: 'pardner', threadId: THREAD, actorId: 'builder', allowedTaskIds: [taskId], allowedFromActorIds: ['alice'] })
    return taskId
  }
  const dispatch = (taskId, id, text = id, overrides = {}) => api('/pardner/control/executions',
    { id, threadId: THREAD, actorId: 'builder', taskId, fromActorId: 'alice', text, ...overrides })
  try {
    await open()
    await run({ directory, t3, api, ok, poll, restart, setup, dispatch, execution, session, operation, time, server: () => server })
  } finally {
    await server?.stop().catch(() => {})
    await t3.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

it('pairs one private credential, records registry identity honestly, and refuses unqualified threads', () => withControl(async ({ directory, t3, api, setup, server }) => {
  const expired = await api('/pardner/control/credential', { origin: t3.origin, pairingCode: 'not-a-code' })
  assert.equal(expired.httpStatus, 502)
  assert.equal(expired.t3Code, 'pairing_rejected')
  const taskId = await setup()
  assert.equal((await stat(join(directory, 't3-credential.json'))).mode & 0o777, 0o600)
  for (const file of ['control.sqlite', 'control.sqlite-wal', 'control.sqlite-shm']) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600, file)
  const state = await api('/pardner/control')
  assert.equal(JSON.stringify(state).includes([...t3.tokens.keys()][0]), false, 'the token never leaves the service')
  assert.equal(state.credential.status, 'valid')
  assert.ok(state.credential.expiresAt > Date.now() + 29 * 24 * 60 * 60 * 1000)
  const [mapped] = state.sessions
  assert.deepEqual([mapped.provider, mapped.actorId, mapped.project.repository, mapped.identity.runtimeMode], ['t3', 'builder', 'depatchedmode/pardner', 'approval-required'])
  assert.deepEqual(mapped.location, { kind: 'local', host: mapped.location.host, worktreePath: null, branch: null }, 'no worktree is invented for a project-folder thread')
  assert.equal(mapped.identity.environmentId, 'environment-fake')

  t3.thread('thread-broad', { runtimeMode: 'full-access' })
  t3.thread('thread-child', { parentThreadId: THREAD })
  const refusals = [
    [{ threadId: 'thread-broad', actorId: 'reviewer' }, 'UNQUALIFIED_THREAD'],
    [{ threadId: 'thread-child', actorId: 'reviewer' }, 'UNQUALIFIED_THREAD'],
    [{ threadId: THREAD, actorId: 'reviewer' }, 'AMBIGUOUS_ROUTE'],
    [{ threadId: 'thread-broad', actorId: 'alice' }, 'UNKNOWN_ACTOR'],
    [{ threadId: 'thread-broad', actorId: 'reviewer', allowedTaskIds: ['*'] }, 'INVALID_ARGUMENT'],
  ]
  for (const [overrides, code] of refusals) {
    const reply = await api('/pardner/control/sessions', { projectId: 'pardner', allowedTaskIds: [taskId], allowedFromActorIds: ['alice'], ...overrides })
    assert.equal(reply.code, code, JSON.stringify(overrides))
  }
  // Changing control settings needs the local loopback page; a LAN address reaches the gate itself.
  const remote = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: 'other', name: 'Other' })
    const req = httpRequest({ host: '127.0.0.1', port: server().httpPort, path: '/pardner/control/projects', method: 'POST',
      headers: { Host: '192.168.1.9', Authorization: 'Bearer test-token', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(text) }))
    })
    req.on('error', reject)
    req.end(body)
  })
  assert.deepEqual([remote.status, remote.code], [403, 'LOCAL_ADMIN_REQUIRED'])
  assert.equal((await api('/pardner/control')).projects.length, 1)
  assert.equal(t3.sends.length, 0)
}))

it('rejects wrong and revoked routes before any T3 submission', () => withControl(async ({ t3, ok, poll, setup, dispatch, execution, operation }) => {
  const taskId = await setup()
  const other = (await operation('task.create', { title: 'Unauthorized task' })).taskId
  for (const overrides of [{ actorId: 'reviewer' }, { fromActorId: 'bob' }, { taskId: other }]) {
    const reply = await dispatch(taskId, `wrong-${randomUUID()}`, 'wrong', overrides)
    assert.equal(reply.code, 'ROUTE_REJECTED', JSON.stringify(overrides))
  }
  assert.equal((await dispatch(taskId, 'stranger', 'x', { threadId: 'thread-unmapped' })).code, 'NOT_FOUND')
  await poll()
  assert.equal(t3.sends.length, 0)
  // Revoking the task keeps already queued intent held rather than dispatching it.
  await ok('/pardner/control/sessions/authorize', { threadId: THREAD, allowedTaskIds: [other], allowedFromActorIds: ['alice'] })
  assert.equal((await dispatch(other, 'allowed')).httpStatus, 200)
  await ok('/pardner/control/sessions/authorize', { threadId: THREAD, allowedTaskIds: [taskId], allowedFromActorIds: ['alice'] })
  await poll()
  assert.deepEqual([(await execution('allowed')).state, (await execution('allowed')).reason], ['queued', 'This route is no longer authorized'])
  assert.equal(t3.sends.length, 0)
}))

it('holds follow-ups, shows approval blocks and verdicts, and rebuilds everything after a restart', () => withControl(async ({ t3, api, ok, poll, restart, setup, dispatch, execution, session }) => {
  const taskId = await setup()
  await dispatch(taskId, 'first', 'Implement the pane')
  await dispatch(taskId, 'second', 'Follow up on review')
  await poll()
  const first = await execution('first')
  assert.deepEqual([first.state, first.runId, (await execution('second')).state], ['running', `run:thread:${THREAD}:ordinal:1`, 'queued'])
  assert.deepEqual(t3.sends.map(send => send.mode), ['queue'])

  t3.block(first.runId)
  await poll()
  const blocked = await execution('first')
  assert.equal(blocked.state, 'blocked')
  assert.equal(blocked.approval.decideAt, t3.threads.get(THREAD).link, 'approvals are decided in T3 through its thread link')
  assert.equal((await execution('second')).state, 'queued')
  assert.equal((await api('/pardner/control/executions/verdicts', { id: 'first', kind: 'human', verdict: 'accepted', actorId: 'alice', evidence: 'early' })).code, 'INVALID_EXECUTION_STATE')

  // The controller restarts while the run is blocked: nothing is prompted again.
  await restart()
  await poll()
  assert.equal((await execution('first')).state, 'blocked')
  assert.equal((await execution('second')).state, 'queued')
  assert.equal(t3.sends.length, 1)

  t3.unblock(first.runId)
  t3.say(first.runId, 'Implemented the pane and its tests.')
  t3.finish(first.runId)
  await poll()
  const done = await execution('first')
  assert.deepEqual([done.state, done.completion, done.checker, done.human], ['terminal', 'completed', null, null], 'completion is not acceptance')
  assert.equal(done.output.text, 'Implemented the pane and its tests.')
  assert.equal((await execution('second')).state, 'running', 'the held follow-up is submitted once the thread is free')

  await ok('/pardner/control/executions/artifacts', { id: 'first', kind: 'commit', reference: 'abc1234', actorId: 'builder' })
  assert.equal((await api('/pardner/control/executions/verdicts', { id: 'first', kind: 'checker', verdict: 'accepted', actorId: 'builder', evidence: 'self-check' })).code, 'FORBIDDEN')
  assert.equal((await api('/pardner/control/executions/verdicts', { id: 'first', kind: 'human', verdict: 'accepted', actorId: 'reviewer', evidence: 'agent' })).code, 'FORBIDDEN')
  await ok('/pardner/control/executions/verdicts', { id: 'first', kind: 'checker', verdict: 'accepted', actorId: 'reviewer', evidence: 'Tests pass at abc1234' })
  const checked = await execution('first')
  assert.deepEqual([checked.completion, checked.checker.verdict, checked.human], ['completed', 'accepted', null])
  await ok('/pardner/control/executions/verdicts', { id: 'first', kind: 'human', verdict: 'rejected', actorId: 'alice', evidence: 'Needs a stale-read label' })

  await restart()
  const rebuilt = await execution('first')
  assert.deepEqual([rebuilt.runId, rebuilt.output.text, rebuilt.artifacts[0].reference, rebuilt.checker.verdict, rebuilt.human.verdict],
    [first.runId, 'Implemented the pane and its tests.', 'abc1234', 'accepted', 'rejected'])
  assert.equal((await session()).actorId, 'builder')
  assert.equal((await api('/pardner/control')).credential.status, 'valid')
  t3.finish((await execution('second')).runId)
  await poll()
  assert.equal((await execution('second')).outcome, 'completed', 'a fresh read after restart reconciles the terminal record')
  assert.equal(t3.sends.length, 2)
}))

it('reconciles a lost reply to the exact run without resubmitting, and quarantines what it cannot find', () => withControl(async ({ t3, ok, poll, setup, dispatch, execution, session }) => {
  const taskId = await setup()
  t3.loseNextSendReply = true
  await dispatch(taskId, 'lost')
  await poll()
  const found = await execution('lost')
  assert.deepEqual([found.state, found.runId, found.reconciliation.established], ['running', `run:thread:${THREAD}:ordinal:1`, true])
  assert.equal(t3.sends.length, 1)

  // T3 does not show a message while it is still queued, so this lookup finds nothing.
  t3.finish(found.runId)
  t3.loseNextSendReply = true
  const raw = t3.tool.bind(t3)
  t3.tool = (client, name, input) => name === 't3_thread_read' && input.view === 'messages' ? { ...raw(client, name, input), items: [] } : raw(client, name, input)
  await dispatch(taskId, 'hidden')
  await dispatch(taskId, 'next')
  await poll()
  const hidden = await execution('hidden')
  assert.equal(hidden.state, 'unknown')
  assert.match(hidden.reconciliation.reason, /absence does not prove non-acceptance/)
  assert.equal((await execution('next')).state, 'queued', 'an unresolved outcome blocks context reuse')
  assert.match((await session()).blocker, /Unknown outcome/)
  assert.equal(t3.sends.length, 2)
  // Once T3 shows the message, a later reconciliation establishes the exact run.
  t3.tool = raw
  const reconciled = await ok('/pardner/control/executions/reconcile', { id: 'hidden' })
  assert.deepEqual([reconciled.established, reconciled.runId], [true, `run:thread:${THREAD}:ordinal:2`])
  t3.finish(reconciled.runId)
  await poll()
  assert.equal((await execution('next')).state, 'running')
  assert.equal(t3.sends.length, 3)
}))

it('recovers a crash before persisting acceptance and repeats a cancellation the crash interrupted', () => withControl(async ({ directory, t3, ok, poll, restart, setup, dispatch, execution, session, api, server }) => {
  const taskId = await setup()
  await dispatch(taskId, 'crashed')
  await poll()
  const { runId } = await execution('crashed')
  await server().stop()
  // As if the process died after T3 accepted but before it saved the run.
  const database = new DatabaseSync(join(directory, 'control.sqlite'))
  database.prepare("UPDATE executions SET state = 'submitting', run_id = NULL WHERE id = 'crashed'").run()
  database.close()
  await restart()
  await poll()
  assert.deepEqual([(await execution('crashed')).state, (await execution('crashed')).runId], ['running', runId])
  assert.equal(t3.sends.length, 1)

  // A crash after saving cancel_requested but before the interrupt was sent.
  await dispatch(taskId, 'held')
  await server().stop()
  const ledger = new DatabaseSync(join(directory, 'control.sqlite'))
  ledger.prepare("UPDATE executions SET state = 'cancel_requested' WHERE id = 'crashed'").run()
  ledger.prepare('INSERT OR IGNORE INTO holds VALUES (?, ?)').run(THREAD, `Cancellation of ${runId} holds queued work`)
  ledger.close()
  t3.say(runId, 'Partial work before cancellation')
  await restart()
  await poll()
  assert.deepEqual(t3.interrupts.map(entry => [entry.runId, entry.stop]), [[runId, undefined]], 'the exact run is interrupted, never with stop')
  const cancelled = await execution('crashed')
  assert.deepEqual([cancelled.state, cancelled.outcome, cancelled.output.text], ['terminal', 'interrupted', 'Partial work before cancellation'])
  assert.equal((await execution('held')).state, 'queued', 'queued work stays held after cancellation')
  assert.match((await session()).blocker, /Cancellation/)

  await ok('/pardner/control/sessions/release', { threadId: THREAD, evidence: 'Confirmed the cancelled run ended' })
  await poll()
  const next = await execution('held')
  assert.equal(next.state, 'running')
  // A delayed cancel of the finished execution cannot reach the newer run.
  assert.equal((await api('/pardner/control/executions/cancel', { id: 'crashed' })).code, 'INVALID_EXECUTION_STATE')
  assert.equal(t3.runById(next.runId).status, 'running')
  assert.equal(t3.interrupts.length, 1)
}))

it('cancels an active run only on a terminal fresh read and preserves its partial output', () => withControl(async ({ t3, ok, poll, setup, dispatch, execution }) => {
  const taskId = await setup()
  await dispatch(taskId, 'long')
  await poll()
  const { runId } = await execution('long')
  t3.say(runId, 'Halfway there')
  t3.slowInterrupt = true
  const requested = await ok('/pardner/control/executions/cancel', { id: 'long' })
  assert.equal(requested.state, 'cancel_requested', 'interrupt_requested is not terminal')
  t3.slowInterrupt = false
  t3.finish(runId, 'interrupted')
  await poll()
  const ended = await execution('long')
  assert.deepEqual([ended.state, ended.outcome, ended.output.text, ended.output.truncated, ended.output.settled], ['terminal', 'interrupted', 'Halfway there', false, false])
  // Output written after T3 reported the end is picked up by the confirming read.
  t3.say(runId, 'Last words')
  await poll()
  assert.deepEqual([(await execution('long')).output.text, (await execution('long')).output.settled], ['Halfway there\n\nLast words', true])
}))

it('retries an output capture that failed instead of keeping the failure', () => withControl(async ({ t3, poll, setup, dispatch, execution }) => {
  const taskId = await setup()
  await dispatch(taskId, 'flaky')
  await poll()
  const { runId } = await execution('flaky')
  t3.say(runId, 'Finished the work')
  t3.finish(runId)
  const raw = t3.tool.bind(t3)
  t3.tool = (client, name, input) => {
    if (name === 't3_thread_read' && input.maxCharsPerItem === 4000) throw Object.assign(new Error('busy'), { t3Code: 'invalid_request' })
    return raw(client, name, input)
  }
  await poll()
  const failed = (await execution('flaky')).output
  assert.deepEqual([failed.text, failed.settled], [null, false])
  assert.match(failed.error, /busy/)
  t3.tool = raw
  await poll()
  await poll()
  assert.deepEqual([(await execution('flaky')).output.text, (await execution('flaky')).output.error, (await execution('flaky')).output.settled], ['Finished the work', null, true])
}))

it('shows stale reads and holds dispatch for an unqualified T3, an unqualified mode, or an expired credential', () => withControl(async ({ t3, api, ok, poll, setup, dispatch, execution, session, time }) => {
  const taskId = await setup()
  await poll()
  assert.equal((await session()).stale, false)
  assert.match((await session()).holds.join(), /T3 9\.9\.9 is not qualified/)
  await dispatch(taskId, 'waiting')
  await poll()
  assert.equal((await execution('waiting')).state, 'queued')
  assert.equal((await api('/pardner/control/sessions/release', { threadId: THREAD, evidence: 'Reviewed a cancellation' })).code, 'VERSION_ACCEPTANCE_REQUIRED')
  await ok('/pardner/control/sessions/release', { threadId: THREAD, evidence: 'Requalified 9.9.9 with npm run test:t3-qualification', acceptVersion: true })
  await poll()
  assert.equal((await execution('waiting')).state, 'running')
  assert.deepEqual((await api('/pardner/control')).acceptedVersions, ['9.9.9'])

  t3.threads.get(THREAD).runtimeMode = 'full-access'
  await poll()
  assert.match((await session()).holds.join(), /runtime mode is full-access/)

  const observedAt = (await session()).observedAt
  await t3.stop()
  time.offset = 120_000
  await poll()
  const stale = await session()
  assert.deepEqual([stale.stale, stale.observedAt], [true, observedAt])
  assert.match(stale.health.error, /No conclusive T3 reply/)
  assert.equal((await execution('waiting')).stale, true)
  assert.equal((await execution('waiting')).observedAt <= observedAt, true)

  time.offset = 31 * 24 * 60 * 60 * 1000
  assert.equal((await api('/pardner/control')).credential.status, 'expired')
  await poll()
  assert.match((await session()).health.error, /credential is expired/)
}, { version: '9.9.9' }))

it('refuses a retry from a re-paired credential, which T3 would not deduplicate', () => withControl(async ({ t3, api, ok, poll, setup, dispatch, execution }) => {
  const taskId = await setup()
  await dispatch(taskId, 'first')
  await poll()
  t3.finish((await execution('first')).runId)
  // A lost reply on a queued message that reconciliation cannot see yet.
  t3.loseNextSendReply = true
  const raw = t3.tool.bind(t3)
  t3.tool = (client, name, input) => name === 't3_thread_read' && input.view === 'messages' ? { ...raw(client, name, input), items: [] } : raw(client, name, input)
  await dispatch(taskId, 'uncertain')
  await poll()
  assert.equal((await execution('uncertain')).state, 'unknown')
  const before = (await api('/pardner/control')).credential.credentialId
  await ok('/pardner/control/credential', { origin: t3.origin, pairingCode: t3.issueCode() })
  assert.notEqual((await api('/pardner/control')).credential.credentialId, before)
  const retry = await api('/pardner/control/executions/resolve', { id: 'uncertain', decision: 'retry', evidence: 'Try again' })
  assert.equal(retry.code, 'CREDENTIAL_CHANGED')
  await ok('/pardner/control/executions/resolve', { id: 'uncertain', decision: 'abandon', evidence: 'Checked T3 by hand; the run ran once' })
  assert.deepEqual([(await execution('uncertain')).state, (await execution('uncertain')).outcome], ['terminal', 'abandoned'])
  assert.equal(t3.sends.length, 2)
}))

it('defers startup recovery, rather than skipping it, while T3 is unreachable at startup', () => withControl(async ({ directory, t3, poll, restart, setup, dispatch, execution, session, server }) => {
  const taskId = await setup()
  await dispatch(taskId, 'during-outage')
  await poll()
  const { runId } = await execution('during-outage')
  await server().stop()
  const database = new DatabaseSync(join(directory, 'control.sqlite'))
  database.prepare("UPDATE executions SET state = 'submitting', run_id = NULL WHERE id = 'during-outage'").run()
  database.close()
  const port = Number(new URL(t3.origin).port)
  await t3.stop()
  await restart()
  await poll()
  assert.equal((await execution('during-outage')).state, 'unknown')
  assert.match((await session()).health.error, /No conclusive T3 reply/)
  t3.server.listen(port, '127.0.0.1')
  await new Promise(resolve => t3.server.once('listening', resolve))
  await poll()
  assert.deepEqual([(await execution('during-outage')).state, (await execution('during-outage')).runId], ['running', runId])
  assert.equal(t3.sends.length, 1)
}))

it('Cloud API reserves a separate provider context, authorizes intent, and never enables dispatch implicitly', async () => withControl(async f => {
  const taskId = await f.setup()
  const mapping = { contextId: 'cloud', projectId: 'pardner', actorId: 'reviewer', allowedTaskIds: [taskId], allowedFromActorIds: ['alice'], repository: 'https://github.com/depatchedmode/pardner', startingRef: 'main' }
  const context = await f.ok('/pardner/control/cloud/contexts', mapping)
  assert.match(context.agentId, /^bc-/)
  const intent = { executionId: 'cloud-a', contextId: 'cloud', actorId: 'reviewer', taskId, fromActorId: 'alice', text: 'Review' }
  const rejected = await f.api('/pardner/control/cloud/executions', { ...intent, taskId: 'wrong' })
  assert.equal(rejected.httpStatus, 403)
  await f.ok('/pardner/control/cloud/executions', intent)
  let snapshot = await f.poll()
  assert.equal(snapshot.cloud.dispatchEnabled, false); assert.equal(snapshot.cloud.executions[0].submissions, 0)
  assert.equal(snapshot.cloud.contexts[0].location.kind, 'cloud'); assert.equal('worktreePath' in snapshot.cloud.contexts[0].location, false)
  assert.equal((await f.api('/pardner/control/cloud/executions/cancel', { ...intent, fromActorId: 'bob' })).httpStatus, 403)
  await f.restart(); snapshot = await f.poll()
  assert.equal(snapshot.cloud.executions[0].state, 'queued'); assert.equal(snapshot.cloud.executions[0].runId, null)
  await f.ok('/pardner/control/cloud/executions/cancel', intent)
  snapshot = await f.poll(); assert.equal(snapshot.cloud.executions[0].outcome, 'WITHDRAWN')
  assert.equal(snapshot.cloud.executions[0].submissions, 0)
}))

it('Cloud service freezes exact cancelled evidence before the next run, with separate authorized verdicts', async () => {
  const transport = new FakeCursorCloud()
  await withControl(async f => {
    const taskId = await f.setup()
    await f.ok('/pardner/control/cloud/contexts', { contextId: 'cloud', projectId: 'pardner', actorId: 'reviewer', allowedTaskIds: [taskId], allowedFromActorIds: ['alice'], repository: 'https://github.com/depatchedmode/pardner', startingRef: 'main' })
    const authority = { actorId: 'reviewer', taskId, fromActorId: 'alice' }
    const intent = { executionId: 'a', contextId: 'cloud', ...authority, text: 'Review' }
    await f.ok('/pardner/control/cloud/executions', intent); await f.poll()
    await f.ok('/pardner/control/cloud/executions', { ...intent, executionId: 'b', text: 'Follow up' }); await f.poll()
    assert.equal(transport.submissions.length, 1)
    await f.ok('/pardner/control/cloud/executions/cancel', { executionId: 'a', ...authority })
    await f.restart(); let snapshot = await f.poll()
    assert.equal(snapshot.cloud.executions[0].outcome, 'CANCELLED'); assert.equal(snapshot.cloud.executions[1].state, 'queued')
    const frozen = await f.ok('/pardner/control/cloud/executions/freeze', { executionId: 'a', ...authority, commit: 'a'.repeat(40), diff: 'fixture diff', tests: 'fixture checker: passed' })
    assert.equal(frozen.runId, 'run-1')
    const verdict = { executionId: 'a', kind: 'checker', verdict: 'accepted', actorId: 'reviewer', evidence: 'same Actor' }
    assert.equal((await f.api('/pardner/control/cloud/executions/verdicts', verdict)).httpStatus, 403)
    await f.ok('/pardner/control/cloud/executions/verdicts', { ...verdict, actorId: 'builder', evidence: 'independent fixture check' })
    await f.ok('/pardner/control/cloud/executions/verdicts', { ...verdict, kind: 'human', actorId: 'alice', evidence: 'simulated human record; no real human acceptance' })
    await f.ok('/pardner/control/cloud/contexts/release', { contextId: 'cloud', evidence: 'reviewed partial effects' }); await f.poll()
    snapshot = await f.poll()
    assert.equal(snapshot.cloud.executions[1].runId, 'run-2')
    assert.equal(snapshot.cloud.executions[0].evidence.sha256, frozen.sha256)
    assert.deepEqual(snapshot.cloud.executions[0].verdicts.map(v => v.kind), ['checker', 'human'])
    assert.equal(transport.submissions.length, 2)
  }, { cloud: { transport, dispatchEnabled: true } })
})
