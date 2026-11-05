import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { canonical, requireValue } from './workspace-schema.js'
import { transaction } from './sqlite-transaction.js'
import { preparePrivateDatabase } from './private-state.js'
import { CloudError } from './cursor-cloud-client.js'

const active = new Set(['CREATING', 'RUNNING', 'WAITING_FOR_BACKGROUND_WORK'])
const terminal = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const checkText = value => typeof value === 'string' && value.trim().length > 0
const list = value => Array.isArray(value) && value.length > 0 && value.every(v => checkText(v) && v !== '*')

/** Host-local controller; Cloud never participates in the workspace's CRDT or delivery leases. */
export class CursorCloudExecution {
  constructor({ path, ownerId, transport = null, dispatchEnabled = false, clock = Date.now }) {
    this.transport = transport
    this.dispatchEnabled = dispatchEnabled
    this.clock = clock
    this.pending = new Map()
    this.streams = new Map()
    this.streamTasks = new Map()
    this.ownerId = ownerId
    for (const file of [path, `${path}.controller`]) preparePrivateDatabase(file)
    // A separate SQLite lock is held for the process lifetime and released by the OS on crash.
    // No TTL can let a slow controller overlap its replacement.
    this.lock = new DatabaseSync(`${path}.controller`)
    try { this.lock.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE') } catch {
      this.lock.close()
      throw Object.assign(new Error('Another Cloud controller has this ledger open'), { code: 'CONTROLLER_CONFLICT' })
    }
    try {
      this.db = new DatabaseSync(path)
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS cloud_owner (owner TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cloud_contexts (id TEXT PRIMARY KEY, agent TEXT UNIQUE NOT NULL, actor TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cloud_attempts (id TEXT PRIMARY KEY, context TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cloud_events (attempt TEXT NOT NULL, event_key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(attempt,event_key));
        CREATE TABLE IF NOT EXISTS cloud_evidence (attempt TEXT PRIMARY KEY, sha256 TEXT NOT NULL, data TEXT NOT NULL);
      `)
      if (!this.db.prepare('SELECT owner FROM cloud_owner').get()) this.db.prepare('INSERT INTO cloud_owner VALUES (?)').run(ownerId)
      requireValue(this.db.prepare('SELECT owner FROM cloud_owner').get().owner === ownerId, 'Cloud ledger belongs to another replica', 'WORKSPACE_MISMATCH')
      for (const row of this.attempts()) if (row.state === 'submitting') this.saveAttempt({ ...row, state: 'unknown', reason: 'Restart during submission; acceptance is unresolved' })
    } catch (error) { this.db?.close(); this.lock.close(); throw error }
  }
  atomic(work) { return transaction(this.db, work) }
  contexts() { return this.db.prepare('SELECT data FROM cloud_contexts ORDER BY rowid').all().map(row => JSON.parse(row.data)) }
  context(id) { const row = this.db.prepare('SELECT data FROM cloud_contexts WHERE id=?').get(id); requireValue(row, 'Unknown Cloud context', 'NOT_FOUND'); return JSON.parse(row.data) }
  attempts(contextId) { return this.db.prepare('SELECT data FROM cloud_attempts WHERE (? IS NULL OR context=?) ORDER BY rowid').all(contextId ?? null, contextId ?? null).map(row => JSON.parse(row.data)) }
  attempt(id) { const row = this.db.prepare('SELECT data FROM cloud_attempts WHERE id=?').get(id); requireValue(row, 'Unknown Cloud execution', 'NOT_FOUND'); return JSON.parse(row.data) }
  saveContext(row) { this.db.prepare('UPDATE cloud_contexts SET data=? WHERE id=?').run(JSON.stringify(row), row.contextId); return row }
  saveAttempt(row) {
    const previous = this.db.prepare('SELECT data FROM cloud_attempts WHERE id=?').get(row.executionId)
    const before = previous && JSON.parse(previous.data)
    if (before?.state !== row.state) row.transitions = [...(before?.transitions ?? []), { from: before?.state ?? null, to: row.state, at: this.clock() }]
    this.db.prepare('INSERT INTO cloud_attempts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(row.executionId, row.contextId, JSON.stringify(row))
    return row
  }
  serial(contextId, work) {
    const previous = this.pending.get(contextId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(work)
    this.pending.set(contextId, next)
    void next.finally(() => { if (this.pending.get(contextId) === next) this.pending.delete(contextId) }).catch(() => {})
    return next
  }
  register({ contextId, projectId, actorId, allowedTaskIds, allowedFromActorIds, repository, startingRef }) {
    requireValue([contextId, projectId, actorId, repository, startingRef].every(checkText), 'Context, project, Actor, repository and starting ref required')
    const url = new URL(repository)
    requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Use a credential-free HTTPS repository URL')
    requireValue(list(allowedTaskIds) && list(allowedFromActorIds), 'Explicit tasks and sender Actors required')
    const row = { contextId, projectId, actorId, allowedTaskIds, allowedFromActorIds, agentId: `bc-${randomUUID()}`, repository, startingRef,
      created: false, hold: null, identity: null, observedAt: null, health: null }
    this.db.prepare('INSERT INTO cloud_contexts VALUES (?,?,?,?)').run(contextId, row.agentId, actorId, JSON.stringify(row))
    return row
  }
  authorized(context, intent) {
    return context.actorId === intent.actorId && context.allowedTaskIds.includes(intent.taskId) && context.allowedFromActorIds.includes(intent.fromActorId)
  }
  authorize({ contextId, allowedTaskIds, allowedFromActorIds }) {
    requireValue(list(allowedTaskIds) && list(allowedFromActorIds), 'Explicit tasks and sender Actors required')
    return this.serial(contextId, () => this.saveContext({ ...this.context(contextId), allowedTaskIds, allowedFromActorIds }))
  }
  enqueue({ executionId, contextId, actorId, taskId, fromActorId, text }) {
    const context = this.context(contextId)
    requireValue(this.authorized(context, { actorId, taskId, fromActorId }), 'Cloud route is not authorized', 'ROUTE_REJECTED')
    requireValue(checkText(executionId) && checkText(text), 'Execution ID and prompt required')
    const intent = { actorId, taskId, fromActorId, text }
    const existing = this.attempts().find(row => row.executionId === executionId)
    if (existing) {
      requireValue(existing.contextId === contextId && canonical(existing.intent) === canonical(intent), 'Execution ID reused', 'OPERATION_ID_REUSED')
      return existing
    }
    return this.saveAttempt({ executionId, contextId, agentId: context.agentId, runId: null, intent, state: 'queued', submissions: 0,
      createdAt: this.clock(), observedAt: null, outcome: null, acceptance: null, cursor: null, output: '', eventsIncomplete: false })
  }
  blocker(contextId) {
    const context = this.context(contextId), rows = this.attempts(contextId)
    return context.hold ?? (rows.some(row => !['queued', 'terminal'].includes(row.state)) ? 'Busy, cancelling or unknown execution' : null)
      ?? (rows.some(row => row.runId && row.state === 'terminal' && !this.evidence(row.executionId)) ? 'Freeze immutable evidence before another run' : null)
  }
  async pump(contextId) {
    return this.serial(contextId, async () => {
      await this.observeUnlocked(contextId)
      const context = this.context(contextId), next = this.attempts(contextId).find(row => row.state === 'queued')
      if (!next) return null
      const reason = !this.dispatchEnabled ? 'Live Cloud dispatch disabled' : !this.transport ? 'Cloud access not configured'
        : !this.authorized(context, next.intent) ? 'Route authorization revoked' : this.blocker(contextId)
          ?? (context.created && context.identity?.status !== 'IDLE' ? 'Cloud agent is not idle' : null)
      if (reason) return this.saveAttempt({ ...next, reason })
      const sending = this.saveAttempt({ ...next, state: 'submitting', reason: null, submissions: next.submissions + 1, sentAt: this.clock(), operation: context.created ? 'follow-up' : 'create' })
      let response
      try {
        response = context.created ? await this.transport.followUp(context.agentId, { prompt: { text: next.intent.text } })
          : await this.transport.create({ agentId: context.agentId, prompt: { text: next.intent.text }, repos: [{ url: context.repository, startingRef: context.startingRef }], autoCreatePR: false })
        this.validateRun(response.run, context.agentId)
        requireValue(!context.created ? response.agent?.id === context.agentId : true, 'Wrong Cloud agent acceptance')
        requireValue(!this.attempts().some(row => row.runId === response.run.id), 'Cloud reused a run identity')
      } catch (error) {
        const rejected = error instanceof CloudError && [400, 401, 403, 429].includes(error.status)
          || error instanceof CloudError && error.status === 409 && error.code === 'agent_busy'
        return this.saveAttempt({ ...sending, state: rejected ? 'queued' : 'unknown', reason: rejected ? error.message : 'Acceptance unresolved; reconcile before reuse' })
      }
      // Failure here intentionally leaves durable submitting intent, recovered as unknown.
      return this.atomic(() => {
        this.saveContext({ ...this.context(contextId), created: true })
        return this.saveAttempt({ ...sending, state: 'running', runId: response.run.id, acceptance: response, acceptedAt: this.clock() })
      })
    })
  }
  validateRun(run, agentId, runId = run?.id) {
    requireValue(checkText(run?.id) && run.id === runId && run.agentId === agentId && (active.has(run.status) || terminal.has(run.status))
      && Number.isFinite(Date.parse(run.updatedAt)) && Number.isFinite(Date.parse(run.createdAt)), 'Unrecognized Cloud run identity/status/timestamps')
  }
  observe(contextId) { return this.serial(contextId, () => this.observeUnlocked(contextId)) }
  async observeUnlocked(contextId) {
    const context = this.context(contextId)
    if (!context.created) return context
    requireValue(this.transport, 'Cloud access not configured')
    const agent = await this.transport.agent(context.agentId)
    requireValue(agent.id === context.agentId, 'Wrong Cloud agent read')
    const rows = this.attempts(contextId)
    if (agent.latestRunId && !rows.some(row => row.runId === agent.latestRunId)) context.hold = 'Foreign or unresolved run; context quarantined'
    for (const row of rows.filter(row => row.runId && row.state !== 'terminal')) {
      const run = await this.transport.run(context.agentId, row.runId)
      this.validateRun(run, context.agentId, row.runId)
      requireValue(!row.providerUpdatedAt || Date.parse(run.updatedAt) >= Date.parse(row.providerUpdatedAt), 'Stale Cloud run read')
      const ended = terminal.has(run.status)
      this.saveAttempt({ ...row, state: ended ? 'terminal' : row.state === 'cancel_requested' ? row.state : run.status === 'WAITING_FOR_BACKGROUND_WORK' ? 'blocked' : 'running',
        outcome: ended ? run.status : null, observedAt: this.clock(), providerUpdatedAt: run.updatedAt, lastRun: run,
        output: run.result ?? row.output })
      if (run.status === 'CANCELLED') context.hold = context.hold ?? 'Cancellation holds queued work; effects are not rolled back'
    }
    return this.saveContext({ ...context, identity: agent, observedAt: this.clock(), health: null })
  }
  async reconcile(executionId) {
    const row = this.attempt(executionId)
    return this.serial(row.contextId, async () => {
      if (row.runId) { await this.observeUnlocked(row.contextId); return { established: true, execution: this.attempt(executionId) } }
      requireValue(row.state === 'unknown', 'Only unknown acceptance needs reconciliation')
      const agent = await this.transport.agent(row.agentId)
      requireValue(agent.id === row.agentId, 'Wrong reconciliation agent')
      const runs = await this.transport.runs(row.agentId)
      for (const run of runs) this.validateRun(run, row.agentId)
      // Neither prompt matching, latestRunId nor a singleton list is proof of acceptance.
      const reconciliation = { at: this.clock(), candidateRunIds: runs.map(run => run.id), established: false,
        reason: 'No documented follow-up request lookup; exact acceptance evidence required. No retry is authorized.' }
      this.saveAttempt({ ...this.attempt(executionId), reconciliation })
      return reconciliation
    })
  }
  async establishAcceptance({ executionId, actorId, taskId, fromActorId, acceptance, evidence }) {
    const row = this.attempt(executionId)
    return this.serial(row.contextId, async () => {
      const context = this.context(row.contextId), current = this.attempt(executionId)
      requireValue(taskId === current.intent.taskId && this.authorized(context, { actorId, taskId, fromActorId }), 'Reconciliation route is not authorized', 'ROUTE_REJECTED')
      requireValue(current.state === 'unknown' && checkText(evidence), 'Unknown acceptance and owner evidence required')
      this.validateRun(acceptance?.run, row.agentId)
      requireValue(!this.attempts().some(other => other.runId === acceptance.run.id), 'Run already belongs to an execution')
      const run = await this.transport.run(row.agentId, acceptance.run.id)
      this.validateRun(run, row.agentId, acceptance.run.id)
      requireValue(run.createdAt === acceptance.run.createdAt, 'Acceptance receipt differs from fresh run')
      this.atomic(() => {
        this.saveContext({ ...context, created: true, hold: 'Owner supplied acceptance evidence; review before queue release' })
        this.saveAttempt({ ...current, state: 'running', runId: run.id, acceptance, acceptedAt: this.clock(),
          intervention: { actorId: fromActorId, evidence, at: this.clock() } })
      })
      await this.observeUnlocked(row.contextId)
      return this.attempt(executionId)
    })
  }

  async cancel({ executionId, actorId, taskId, fromActorId }) {
    const row = this.attempt(executionId)
    return this.serial(row.contextId, async () => {
      const current = this.attempt(executionId), context = this.context(row.contextId)
      requireValue(taskId === current.intent.taskId && this.authorized(context, { actorId, taskId, fromActorId }), 'Cancellation route is not authorized', 'ROUTE_REJECTED')
      if (current.state === 'terminal') return current
      requireValue(['queued', 'running', 'blocked', 'cancel_requested'].includes(current.state), 'Unknown acceptance cannot be cancelled by guessing a run')
      this.atomic(() => {
        this.saveContext({ ...context, hold: 'Cancellation holds queued work; effects are not rolled back' })
        this.saveAttempt({ ...current, state: current.state === 'queued' ? 'terminal' : 'cancel_requested', outcome: current.state === 'queued' ? 'WITHDRAWN' : null })
      })
      if (current.runId) await this.cancelUnlocked(this.attempt(executionId))
      return this.attempt(executionId)
    })
  }
  async cancelUnlocked(row) {
    try { await this.transport.cancel(row.agentId, row.runId) } catch (error) {
      if (!(error instanceof CloudError && error.status === 409 && error.code === 'run_not_cancellable')) throw error
    }
    await this.observeUnlocked(row.contextId)
  }
  async poll() {
    for (const context of this.contexts()) {
      try {
        for (const row of this.attempts(context.contextId)) {
          if (row.state === 'unknown') await this.reconcile(row.executionId)
          if (row.state === 'cancel_requested') await this.serial(context.contextId, () => this.cancelUnlocked(this.attempt(row.executionId)))
        }
        await this.pump(context.contextId)
        for (const row of this.attempts(context.contextId).filter(row => ['running', 'blocked', 'cancel_requested'].includes(row.state))) {
          if (!this.transport?.stream || row.streamExpired || this.streamTasks.has(row.executionId)) continue
          const task = this.stream(row.executionId).catch(() => {}).finally(() => this.streamTasks.delete(row.executionId))
          this.streamTasks.set(row.executionId, task)
        }
      } catch (error) { this.saveContext({ ...this.context(context.contextId), health: error instanceof CloudError ? error.message : 'Cloud observation unavailable or invalid' }) }
    }
  }
  evidence(id) {
    const row = this.db.prepare('SELECT sha256,data FROM cloud_evidence WHERE attempt=?').get(id)
    return row ? { sha256: row.sha256, ...JSON.parse(row.data) } : null
  }
  async freeze({ executionId, actorId, taskId, fromActorId, commit, diff, tests }) {
    const row = this.attempt(executionId)
    return this.serial(row.contextId, async () => {
      const context = this.context(row.contextId)
      requireValue(taskId === row.intent.taskId && this.authorized(context, { actorId, taskId, fromActorId }), 'Evidence route is not authorized', 'ROUTE_REJECTED')
      requireValue(!this.evidence(executionId), 'Evidence is immutable')
      requireValue(/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(commit) && typeof diff === 'string' && checkText(tests), 'Full commit hash, diff bytes and test evidence required')
      await this.observeUnlocked(row.contextId)
      const current = this.attempt(executionId)
      requireValue(current.state === 'terminal' && current.runId, 'Freeze an exact terminal run')
      const freshRun = await this.transport.run(row.agentId, current.runId)
      this.validateRun(freshRun, row.agentId, current.runId)
      requireValue(terminal.has(freshRun.status) && Date.parse(freshRun.updatedAt) >= Date.parse(current.providerUpdatedAt), 'Fresh terminal evidence required')
      requireValue(this.context(row.contextId).identity.latestRunId === current.runId, 'Later run already changed this context; cannot attribute mutable evidence')
      const listing = await this.transport.artifacts(row.agentId)
      requireValue(Array.isArray(listing.items) && listing.items.length < 100, 'Artifact listing may be truncated; capture is incomplete')
      const artifacts = []
      let totalBytes = 0
      for (const artifact of listing.items) {
        const bytes = await this.transport.download(row.agentId, artifact.path)
        requireValue(bytes.length === artifact.sizeBytes, 'Artifact changed while capturing')
        totalBytes += bytes.length
        requireValue(totalBytes <= 32 * 1024 * 1024, 'Evidence exceeds the 32 MiB capture limit')
        artifacts.push({ path: artifact.path, updatedAt: artifact.updatedAt, sizeBytes: bytes.length, sha256: hash(bytes), base64: bytes.toString('base64') })
      }
      const after = await this.transport.agent(row.agentId)
      requireValue(after.id === row.agentId && after.latestRunId === current.runId && after.status !== 'ACTIVE', 'Context changed during evidence capture')
      const data = { executionId, contextId: row.contextId, agentId: row.agentId, runId: current.runId, capturedAt: this.clock(), actorId: fromActorId,
        commit, diff, tests, git: freshRun.git ?? null, result: freshRun.result ?? current.output, artifacts,
        attribution: 'Captured before later controller work; commit/diff/tests supplied by Actor, not independently verified' }
      const bytes = canonical(data)
      this.db.prepare('INSERT INTO cloud_evidence VALUES (?,?,?)').run(executionId, hash(bytes), bytes)
      return this.evidence(executionId)
    })
  }
  async release({ contextId, evidence }) {
    return this.serial(contextId, async () => {
      requireValue(checkText(evidence), 'Review evidence required')
      await this.observeUnlocked(contextId)
      requireValue(!this.attempts(contextId).some(row => !['terminal', 'queued'].includes(row.state)), 'Unresolved work blocks release')
      const context = this.context(contextId)
      requireValue(!context.created || context.identity?.status === 'IDLE' && this.attempts(contextId).some(row => row.runId === context.identity.latestRunId), 'Foreign or busy context cannot be released')
      this.saveContext({ ...context, hold: null, releases: [...(context.releases ?? []), { at: this.clock(), evidence }] })
    })
  }
  async stream(executionId, { signal } = {}) {
    const row = this.attempt(executionId)
    requireValue(row.runId && !this.streams.has(executionId), 'Exact run required; only one stream per attempt')
    const abort = new AbortController()
    this.streams.set(executionId, abort)
    try {
      await this.observe(row.contextId)
      for await (const event of this.transport.stream(row.agentId, row.runId, { lastEventId: row.cursor, signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal })) {
        await this.serial(row.contextId, () => {
          requireValue(!event.data.runId || event.data.runId === row.runId, 'Wrong SSE run')
          this.atomic(() => {
            const current = this.attempt(executionId)
            const key = event.id ? canonical([event.id, event.event]) : null
            const previous = key && this.db.prepare('SELECT data FROM cloud_events WHERE attempt=? AND event_key=?').get(executionId, key)
            if (previous) {
              requireValue(canonical(JSON.parse(previous.data).data) === canonical(event.data), 'SSE replay changed an event payload')
              return
            }
            if (key) this.db.prepare('INSERT INTO cloud_events VALUES (?,?,?)').run(executionId, key, JSON.stringify({ ...event, receivedAt: this.clock() }))
            this.saveAttempt({ ...current, cursor: event.id ?? current.cursor,
              output: event.event === 'assistant' && key && current.state !== 'terminal' ? current.output + (event.data.text ?? '') : current.output })
          })
        })
        // SSE is a hint. Sticky, stale and reordered statuses never establish terminal state.
        if (['status', 'result', 'done'].includes(event.event)) await this.observe(row.contextId)
      }
    } catch (error) {
      await this.serial(row.contextId, () => this.saveAttempt({ ...this.attempt(executionId), eventsIncomplete: true,
        streamExpired: this.attempt(executionId).streamExpired || error instanceof CloudError && error.status === 410 }))
      if (!(error instanceof CloudError && error.status === 410)) throw error
    } finally { this.streams.delete(executionId) }
    await this.observe(row.contextId)
  }
  snapshot() {
    return { provider: 'cursor-cloud', dispatchEnabled: this.dispatchEnabled, configured: Boolean(this.transport), liveQualified: false,
      contexts: this.contexts().map(row => ({ ...row, location: { kind: 'cloud', env: row.identity?.env ?? null }, blocker: this.blocker(row.contextId), stale: !row.observedAt || this.clock() - row.observedAt > 6000 })),
      executions: this.attempts().map(row => ({ ...row, evidence: this.evidence(row.executionId) })) }
  }
  async close() {
    for (const abort of this.streams.values()) abort.abort()
    await Promise.allSettled([...this.pending.values()])
    await Promise.allSettled([...this.streamTasks.values()])
    this.db.close(); this.lock.close()
  }
}
