import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { T3Busy, T3Rejected } from './t3-mcp-client.js'
import { canonical, requireValue } from './workspace-schema.js'

const ACTIVE_RUN_STATES = new Set(['preparing', 'queued', 'starting', 'running', 'waiting'])
const TERMINAL_RUN_STATES = new Set(['completed', 'failed', 'interrupted', 'cancelled', 'rolled_back'])
const IDLE_THREAD_STATES = new Set(['idle', ...TERMINAL_RUN_STATES])
const OBSERVED_STATES = ['running', 'blocked', 'cancel_requested']

const ordinal = runId => Number(runId?.match(/:ordinal:(\d+)$/)?.[1] ?? 0)

/**
 * Durable contract between one Pardner controller and one T3 thread per route.
 * Intent is saved before submission and only one submission is in T3 at a time, so
 * held work stays here under owner control rather than in T3's own queue. Receipt,
 * queueing and T3 acceptance never imply completion; `terminal` records how T3
 * ended the exact run.
 */
export class T3Execution {
  constructor({ path, transport, ownerId, routes, clock = Date.now }) {
    this.transport = transport
    this.ownerId = ownerId
    this.clock = clock
    const threads = routes.map(route => route.threadId)
    requireValue(new Set(threads).size === threads.length && new Set(routes.map(route => route.actorId)).size === routes.length,
      'Each T3 thread needs one route and each route its own Actor', 'AMBIGUOUS_ROUTE')
    this.routes = new Map(routes.map(route => [route.threadId, route]))
    this.readSequence = 0
    this.appliedRead = new Map()
    this.acceptedAtRead = new Map()
    this.sending = new Set()
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS controllers (thread TEXT PRIMARY KEY, owner TEXT NOT NULL, baseline INTEGER);
        CREATE TABLE IF NOT EXISTS holds (thread TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (thread, reason));
        CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, thread TEXT NOT NULL, evidence TEXT NOT NULL, holds TEXT NOT NULL, runs TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY, request TEXT NOT NULL UNIQUE, intent TEXT NOT NULL, thread TEXT NOT NULL,
          state TEXT NOT NULL, run_id TEXT, outcome TEXT, reason TEXT, evidence TEXT, credential TEXT, created_at INTEGER NOT NULL,
          observed_at INTEGER, submissions INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS transitions (id INTEGER PRIMARY KEY AUTOINCREMENT, execution TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, at INTEGER NOT NULL, detail TEXT);
      `)
      this.atomically(() => {
        for (const thread of threads) {
          this.database.prepare('INSERT OR IGNORE INTO controllers (thread, owner) VALUES (?, ?)').run(thread, ownerId)
          const { owner } = this.database.prepare('SELECT owner FROM controllers WHERE thread = ?').get(thread)
          requireValue(owner === ownerId, 'Another controller owns this T3 thread', 'CONTROLLER_CONFLICT')
        }
        // A process that stopped during submission cannot know whether T3 received it.
        for (const row of this.rows().filter(row => row.state === 'submitting' && this.routes.has(row.thread))) {
          this.move(row.id, ['submitting'], { state: 'unknown', reason: 'Controller stopped during submission', submissions: row.submissions + 1 })
        }
      })
    } catch (error) { this.database.close(); throw error }
  }

  atomically(work) {
    if (this.database.isTransaction) return work()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.database.exec('COMMIT')
      return result
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  /** Ownership is per thread, so another controller on this ledger cannot act on it. */
  requireOwner(threadId) {
    const row = this.database.prepare('SELECT owner FROM controllers WHERE thread = ?').get(threadId)
    requireValue(row?.owner === this.ownerId, 'This controller does not own that T3 thread', 'CONTROLLER_CONFLICT')
  }

  rows(threadId) {
    return this.database.prepare('SELECT * FROM executions WHERE (? IS NULL OR thread = ?) ORDER BY rowid')
      .all(threadId ?? null, threadId ?? null).map(row => ({ ...row, intent: JSON.parse(row.intent) }))
  }
  row(id) { return this.rows().find(row => row.id === id) }
  transitions() { return this.database.prepare('SELECT execution, from_state, to_state, at, detail FROM transitions ORDER BY id').all() }
  reviews() { return this.database.prepare('SELECT thread, evidence, holds, runs, at FROM reviews ORDER BY id').all() }
  holds(threadId) { return this.database.prepare('SELECT reason FROM holds WHERE thread = ? ORDER BY reason').all(threadId).map(row => row.reason) }
  setHold(threadId, reason) { this.database.prepare('INSERT OR IGNORE INTO holds VALUES (?, ?)').run(threadId, reason) }

  /** Applies fields only from an expected state, so an await cannot resurrect a changed row. */
  move(id, from, fields) {
    return this.atomically(() => {
      const before = this.database.prepare('SELECT state FROM executions WHERE id = ?').get(id)?.state
      if (!from.includes(before)) return false
      const names = Object.keys(fields)
      this.database.prepare(`UPDATE executions SET ${names.map(name => `${name} = ?`).join(', ')} WHERE id = ?`).run(...names.map(name => fields[name]), id)
      if (fields.state && fields.state !== before) {
        this.database.prepare('INSERT INTO transitions (execution, from_state, to_state, at, detail) VALUES (?, ?, ?, ?, ?)')
          .run(id, before, fields.state, this.clock(), fields.outcome ?? fields.reason ?? null)
      }
      return true
    })
  }

  authorized({ actorId, taskId, fromActorId, threadId }) {
    const route = this.routes.get(threadId)
    return route?.actorId === actorId && route.allowedTaskIds.includes(taskId) && route.allowedFromActorIds.includes(fromActorId)
  }

  /** Authorizes before persisting: a rejected route leaves no row and never reaches T3. */
  enqueue({ id, actorId, taskId, fromActorId, threadId, text }) {
    requireValue(this.authorized({ actorId, taskId, fromActorId, threadId }), 'This Actor, task and sender are not authorized for the T3 thread', 'ROUTE_REJECTED')
    requireValue(typeof id === 'string' && id && typeof text === 'string' && text.trim(), 'An execution needs an ID and non-empty text')
    const intent = canonical({ actorId, taskId, fromActorId, threadId, text })
    this.atomically(() => {
      const inserted = this.database.prepare("INSERT OR IGNORE INTO executions (id, request, intent, thread, state, created_at) VALUES (?, ?, ?, ?, 'queued', ?)")
        .run(id, randomUUID(), intent, threadId, this.clock())
      requireValue(this.database.prepare('SELECT intent FROM executions WHERE id = ?').get(id).intent === intent,
        'Execution ID was reused with different content', 'OPERATION_ID_REUSED')
      if (inserted.changes) this.database.prepare("INSERT INTO transitions (execution, from_state, to_state, at) VALUES (?, NULL, 'queued', ?)").run(id, this.clock())
    })
    return this.row(id)
  }

  /** Why this thread cannot take its next submission now, or null if it can. */
  blocker(threadId) {
    const [hold] = this.holds(threadId)
    if (hold) return hold
    const rows = this.rows(threadId)
    if (rows.some(row => row.state === 'unknown')) return 'Unknown outcome: context blocked until reconciled'
    if (rows.some(row => ['submitting', ...OBSERVED_STATES].includes(row.state))) return 'Awaiting this controller\'s active run'
    return null
  }

  /** Submits the oldest queued intent only after a fresh read shows T3 idle. Busy work stays queued. */
  async pump(threadId) {
    this.requireOwner(threadId)
    if (!this.rows(threadId).some(row => row.state === 'queued')) return { submitted: null, reason: 'Nothing queued' }
    let observation
    try { observation = await this.observe(threadId) } catch (error) {
      for (const row of this.rows(threadId).filter(row => row.state === 'queued')) this.move(row.id, ['queued'], { reason: error.message })
      return { submitted: null, reason: error.message }
    }
    // A newer read has been applied, so this one cannot show the thread idle.
    if (observation.superseded) return { submitted: null, reason: 'A newer read superseded this one' }
    const next = this.rows(threadId).find(row => row.state === 'queued')
    if (!next) return { submitted: null, reason: 'Nothing queued' }
    const credential = this.transport.credentialId ?? null
    // T3 deduplicates per credential, so a possibly accepted request cannot move to another one.
    if (next.submissions > 0 && next.credential !== credential) {
      this.move(next.id, ['queued'], { state: 'unknown', reason: 'Credential changed after a possibly accepted submission' })
      return { submitted: null, reason: 'Credential changed' }
    }
    const reason = (this.authorized(next.intent) ? null : 'This route is no longer authorized') ?? this.blocker(threadId) ?? this.busyReason(observation)
    if (reason) { this.move(next.id, ['queued'], { reason }); return { submitted: null, reason } }
    this.move(next.id, ['queued'], { state: 'submitting', reason: null, credential })
    let accepted
    this.sending.add(next.id)
    try {
      accepted = await this.transport.send(threadId, next.intent.text, next.request)
      requireValue(typeof accepted?.runId === 'string', 'T3 accepted without an exact run')
    } catch (error) {
      if (error instanceof T3Busy || error instanceof T3Rejected) {
        this.move(next.id, ['submitting'], { state: 'queued', reason: error.message })
        return { submitted: null, reason: error.message }
      }
      this.move(next.id, ['submitting'], { state: 'unknown', reason: 'Lost reply: T3 may have accepted this submission', submissions: next.submissions + 1 })
      return { submitted: null, reason: 'Unknown outcome' }
    } finally { this.sending.delete(next.id) }
    this.acceptedAtRead.set(next.id, this.readSequence)
    if (!this.move(next.id, ['submitting'], { state: 'running', run_id: accepted.runId, submissions: next.submissions + 1 })) {
      return { submitted: null, reason: 'Execution changed during submission' }
    }
    return { submitted: next.id, runId: accepted.runId }
  }

  busyReason({ thread, runs }) {
    // T3 can keep counting a request after its run was interrupted, so only an active run blocks on it.
    if (thread.activeRunId || !IDLE_THREAD_STATES.has(thread.status)) return `T3 thread is ${thread.status}`
    const queued = runs.find(run => ACTIVE_RUN_STATES.has(run.status))
    return queued ? `T3 still holds ${queued.runId} as ${queued.status}` : null
  }

  /**
   * Applies a fresh T3 read. Reads are ordered by when they were issued, so a slow
   * older reply is dropped however late it lands; terminal is final. A vanished
   * thread makes its tracked runs unknown.
   */
  async observe(threadId) {
    this.requireOwner(threadId)
    const issued = ++this.readSequence
    let observation
    try { observation = await this.transport.read(threadId) } catch (error) {
      if (error.code === 'thread_not_found' && issued > (this.appliedRead.get(threadId) ?? 0)) {
        for (const row of this.rows(threadId).filter(row => OBSERVED_STATES.includes(row.state))) {
          this.move(row.id, [row.state], { state: 'unknown', reason: 'Thread absent from T3' })
        }
      }
      throw error
    }
    if (issued < (this.appliedRead.get(threadId) ?? 0)) return { ...observation, superseded: true }
    this.appliedRead.set(threadId, issued)
    this.apply(threadId, observation, issued)
    return observation
  }

  unreviewedRuns(threadId, runs) {
    const { baseline } = this.database.prepare('SELECT baseline FROM controllers WHERE thread = ?').get(threadId)
    const owned = new Set(this.rows(threadId).map(row => row.run_id).filter(Boolean))
    return runs.filter(run => ordinal(run.runId) > baseline && !owned.has(run.runId)).map(run => run.runId)
  }

  apply(threadId, { observedAt, thread, runs, pendingRunIds = [] }, issued) {
    const { baseline } = this.database.prepare('SELECT baseline FROM controllers WHERE thread = ?').get(threadId)
    if (baseline === null) {
      this.database.prepare('UPDATE controllers SET baseline = ? WHERE thread = ?').run(Math.max(0, ...runs.map(run => ordinal(run.runId))), threadId)
    } else if (!this.rows(threadId).some(row => ['submitting', 'unknown'].includes(row.state))) {
      // Another dispatcher, a person, or T3's own restart resume started this run.
      for (const runId of this.unreviewedRuns(threadId, runs)) this.setHold(threadId, `Run ${runId} is not linked to an execution here; review before reuse`)
    }
    for (const row of this.rows(threadId)) {
      // A failed local write can strand a row after its send has returned.
      if (row.state === 'submitting' && !this.sending.has(row.id)) {
        this.move(row.id, ['submitting'], { state: 'unknown', reason: 'Submission outcome was not saved', submissions: row.submissions + 1 })
      }
      if (!OBSERVED_STATES.includes(row.state)) continue
      const run = runs.find(candidate => candidate.runId === row.run_id)
      const fields = { observed_at: observedAt }
      if (!run) {
        // A read issued before acceptance cannot show the run; that is not absence.
        if (issued <= (this.acceptedAtRead.get(row.id) ?? 0)) continue
        Object.assign(fields, { state: 'unknown', reason: 'Run absent from the fresh T3 read' })
      }
      else if (TERMINAL_RUN_STATES.has(run.status)) {
        Object.assign(fields, { state: 'terminal', outcome: run.status, reason: null })
        // A stop this controller did not request can precede T3's restart resume; hold before it appears.
        if (row.state !== 'cancel_requested' && ['cancelled', 'interrupted'].includes(run.status)) {
          this.setHold(threadId, `Run ${row.run_id} ended ${run.status} outside this controller; T3 may resume it`)
        }
      } else if (!ACTIVE_RUN_STATES.has(run.status)) fields.reason = `Unrecognized T3 run status: ${run.status}`
      else if (row.state !== 'cancel_requested') {
        const blocked = pendingRunIds.includes(row.run_id)
        // Leaving `blocked` clears the reason; on a running row, a refused cancellation stays visible.
        Object.assign(fields, { state: blocked ? 'blocked' : 'running', reason: blocked ? 'Native T3 approval or input required' : row.state === 'blocked' ? null : row.reason })
      }
      this.move(row.id, [row.state], fields)
    }
  }

  /** Establishes the exact run for an unknown outcome, never by resubmitting. */
  async reconcile(id) {
    const row = this.row(id)
    requireValue(row?.state === 'unknown', 'Only unknown outcomes can be reconciled', 'INVALID_EXECUTION_STATE')
    this.requireOwner(row.thread)
    const runId = await this.transport.findRequest(row.thread, row.request)
    if (!runId) return { established: false, reason: 'No T3 record of this request; absence does not prove non-acceptance' }
    this.acceptedAtRead.set(id, this.readSequence)
    if (!this.move(id, ['unknown'], { state: 'running', run_id: runId, reason: null })) return { established: false, reason: 'Execution changed during the read' }
    // The run is established even if this follow-up read fails; a later observe catches up.
    await this.observe(row.thread).catch(() => {})
    return { established: true, runId }
  }

  /**
   * Owner decision for an outcome T3 cannot establish. `retry` reuses the original
   * request ID, which T3 deduplicates only for the same credential, so it first
   * looks for the request and refuses a different credential.
   */
  async resolve(id, decision, evidence) {
    const row = this.row(id)
    requireValue(row?.state === 'unknown', 'Only unknown outcomes can be resolved', 'INVALID_EXECUTION_STATE')
    this.requireOwner(row.thread)
    requireValue(typeof evidence === 'string' && evidence.trim(), 'Supply reconciliation evidence')
    requireValue(['retry', 'abandon'].includes(decision), 'Use retry or abandon')
    if (decision === 'abandon') {
      this.move(id, ['unknown'], { state: 'terminal', outcome: 'abandoned', reason: null, evidence })
      return this.row(id)
    }
    const found = await this.reconcile(id)
    if (found.established) {
      const current = this.row(id)
      this.move(id, [current.state], { evidence })
      return this.row(id)
    }
    requireValue(!row.credential || row.credential === this.transport.credentialId,
      'T3 deduplicates per credential, so retrying with another credential could run this twice', 'CREDENTIAL_CHANGED')
    this.move(id, ['unknown'], { state: 'queued', reason: null, evidence })
    return this.row(id)
  }

  /**
   * Requests cancellation of the exact run and holds this thread first. Terminal
   * state comes only from a later fresh read. Partial effects are not rolled back.
   */
  async cancel(id) {
    const row = this.row(id)
    requireValue(row, 'Unknown execution', 'INVALID_EXECUTION_STATE')
    this.requireOwner(row.thread)
    if (row.state === 'queued') {
      // A retried intent may already be in T3, where it cannot be seen until it starts.
      this.move(id, ['queued'], row.submissions > 0 ? { state: 'unknown', reason: 'Cancelled a retry that T3 may already have accepted' }
        : { state: 'terminal', outcome: 'cancelled', reason: 'Cancelled before submission' })
      return this.row(id)
    }
    requireValue(OBSERVED_STATES.includes(row.state), `Cannot cancel a ${row.state} execution`, 'INVALID_EXECUTION_STATE')
    this.setHold(row.thread, `Cancellation of ${row.run_id} holds queued work`)
    this.move(id, [row.state], { state: 'cancel_requested' })
    let refused = null
    try {
      await this.transport.interrupt(row.thread, row.run_id, `cancel:${row.request}`)
    } catch (error) {
      if (!(error instanceof T3Rejected || error instanceof T3Busy)) throw error
      refused = error
      // T3 refuses to interrupt a queued run; that run is removed from its queue instead.
      if (error.code === 'thread_not_interruptible') {
        try { await this.transport.cancelQueued(row.thread, row.run_id); refused = null } catch (queueError) { refused = queueError }
      }
    }
    await this.observe(row.thread).catch(error => { if (!refused) throw error })
    if (refused) this.move(id, ['cancel_requested'], { state: row.state === 'cancel_requested' ? 'running' : row.state, reason: `T3 did not confirm cancellation: ${refused.message}` })
    return this.row(id)
  }

  /** Owner exit for a run T3 still holds in its queue that no execution owns. */
  async removeQueuedRun(threadId, runId, evidence) {
    this.requireOwner(threadId)
    requireValue(typeof evidence === 'string' && evidence.trim(), 'Supply evidence for removing this run')
    requireValue(!this.rows(threadId).some(row => row.run_id === runId && row.state !== 'terminal'), 'Cancel an owned run through its execution', 'INVALID_EXECUTION_STATE')
    await this.transport.cancelQueued(threadId, runId)
    this.database.prepare('INSERT INTO reviews (thread, evidence, holds, runs, at) VALUES (?, ?, ?, ?, ?)')
      .run(threadId, evidence, JSON.stringify(this.holds(threadId)), JSON.stringify([runId]), this.clock())
    await this.observe(threadId)
  }

  /**
   * Resumes dispatch after review. Every run this controller did not submit must be
   * named, and a hold appearing during the read is refused unless it names one of them.
   * Holds already present when called are taken as reviewed, and the record keeps them.
   */
  async release(threadId, evidence, { reviewedRuns = [] } = {}) {
    this.requireOwner(threadId)
    requireValue(typeof evidence === 'string' && evidence.trim(), 'Supply evidence for releasing this thread')
    const seen = new Set(this.holds(threadId))
    const observation = await this.observe(threadId)
    requireValue(!this.rows(threadId).some(row => row.state === 'cancel_requested'), 'Cancellation has not reached a terminal state', 'INVALID_EXECUTION_STATE')
    const unreviewed = this.unreviewedRuns(threadId, observation.runs).filter(runId => !reviewedRuns.includes(runId))
    requireValue(unreviewed.length === 0, `Review these runs first: ${unreviewed.join(', ')}`, 'UNREVIEWED_RUN')
    const arrived = this.holds(threadId).filter(hold => !seen.has(hold) && !reviewedRuns.some(runId => hold.startsWith(`Run ${runId} `)))
    requireValue(arrived.length === 0, `Review this new hold first: ${arrived.join('; ')}`, 'HOLD_CHANGED')
    this.atomically(() => {
      this.database.prepare('INSERT INTO reviews (thread, evidence, holds, runs, at) VALUES (?, ?, ?, ?, ?)')
        .run(threadId, evidence, JSON.stringify(this.holds(threadId)), JSON.stringify(reviewedRuns), this.clock())
      this.database.prepare('DELETE FROM holds WHERE thread = ?').run(threadId)
      this.database.prepare('UPDATE controllers SET baseline = ? WHERE thread = ?').run(Math.max(0, ...observation.runs.map(run => ordinal(run.runId))), threadId)
    })
  }

  close() { this.database.close() }
}
