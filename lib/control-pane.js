import { DatabaseSync } from 'node:sqlite'
import { chmod, open as openFile, readFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { atomicWrite } from './atomic-file.js'
import { CursorCloudExecution } from './cursor-cloud-execution.js'
import { T3Execution } from './t3-execution.js'
import { T3McpClient, T3Rejected, pairT3Client } from './t3-mcp-client.js'
import { identifier, issueReference, ownValue, requireValue, text } from './workspace-schema.js'

/** T3 server versions whose behavior `docs/PARDNER-T3-QUALIFICATION.md` qualified. */
export const QUALIFIED_T3_VERSIONS = ['0.1.5', '0.1.6']
// Only this mode reached `blocked` on an approval; a broader one may run without asking.
export const QUALIFIED_RUNTIME_MODE = 'approval-required'
const RUN_OUTCOMES = new Set(['completed', 'failed', 'interrupted', 'cancelled', 'rolled_back'])
const ARTIFACT_KINDS = ['commit', 'branch', 'pull_request', 'test_result', 'note']
const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000

const versionHold = version => `T3 ${version} is not qualified (qualified: ${QUALIFIED_T3_VERSIONS.join(', ')}); requalify it before dispatch`
const modeHold = mode => `T3 thread runtime mode is ${mode}; only ${QUALIFIED_RUNTIME_MODE} is qualified to block on approvals`

function idList(value, name) {
  requireValue(Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && id && id !== '*'),
    `Authorize explicit ${name}; wildcard dispatch is not supported`)
  return [...new Set(value)].sort()
}

/** Every T3 call fails definitely, so work stays queued until a credential is paired. */
function unpairedTransport(reason) {
  const refuse = async () => { throw new T3Rejected('credential_required', reason) }
  return { credentialId: null, read: refuse, send: refuse, interrupt: refuse, cancelQueued: refuse, findRequest: refuse, output: refuse, environment: refuse }
}

/**
 * Host-local control records for one Pardner service acting as the sole
 * controller of its mapped T3 threads. It persists the registry, routes and
 * Actor authorization, one T3 credential, and per-execution artifacts, output
 * and verdicts beside the `T3Execution` ledger, and drives that passive contract:
 * it reconciles on startup and after a lost reply, repeats cancellation, polls
 * and pumps. Nothing here is synchronized to other replicas or published to GitHub.
 */
export class ControlPane {
  constructor({ directory, identity, doc, pollMs = 2000, staleAfterMs = pollMs * 3, cancelRetryMs = 10_000,
    cloud = {}, transportFactory = credential => new T3McpClient(credential), pair = pairT3Client, clock = Date.now, logger = {} }) {
    this.cloudOptions = cloud
    this.directory = directory
    this.path = join(directory, 'control.sqlite')
    this.credentialPath = join(directory, 't3-credential.json')
    this.identity = identity
    this.doc = doc
    this.pollMs = pollMs
    this.staleAfterMs = staleAfterMs
    this.cancelRetryMs = cancelRetryMs
    this.transportFactory = transportFactory
    this.pairClient = pair
    this.clock = clock
    this.logger = logger
    this.health = new Map()
    this.cancelAttempts = new Map()
    this.reconciliations = new Map()
    this.environment = null
    this.authRejected = null
  }

  async open() {
    this.credential = await readFile(this.credentialPath, 'utf8').then(JSON.parse, error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    // SQLite gives its -wal and -shm files the database file's mode, so create it private first.
    await (await openFile(this.path, 'a', 0o600)).close()
    await chmod(this.path, 0o600)
    this.database = new DatabaseSync(this.path)
    try {
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS control_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, repository TEXT, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          thread TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(id), provider TEXT NOT NULL, actor TEXT NOT NULL UNIQUE,
          allowed_task_ids TEXT NOT NULL, allowed_from_actor_ids TEXT NOT NULL, host TEXT NOT NULL, identity TEXT NOT NULL,
          created_at INTEGER NOT NULL, observed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY AUTOINCREMENT, execution TEXT NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS verdicts (id INTEGER PRIMARY KEY AUTOINCREMENT, execution TEXT NOT NULL, kind TEXT NOT NULL, verdict TEXT NOT NULL, actor TEXT NOT NULL, evidence TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS outputs (execution TEXT PRIMARY KEY, text TEXT, truncated INTEGER NOT NULL, error TEXT, at INTEGER NOT NULL, settled INTEGER NOT NULL);
      `)
      // A copied directory must not act as a second controller for the same threads.
      const owner = `pardner:${this.identity.workspaceId}:${this.identity.replicaId}`
      this.database.prepare('INSERT OR IGNORE INTO control_meta VALUES (?, ?)').run('owner', owner)
      requireValue(this.meta('owner') === owner, 'This control ledger belongs to another workspace or replica', 'WORKSPACE_MISMATCH')
      this.cloud = new CursorCloudExecution({ ...this.cloudOptions, path: join(this.directory, 'cursor-cloud.sqlite'), ownerId: owner, clock: this.clock })
      this.execution = new T3Execution({ path: this.path, transport: this.transport(), ownerId: owner, routes: this.routes(), clock: this.clock })
    } catch (error) { await this.cloud?.close(); this.database.close(); throw error }
    return this
  }

  meta(key, fallback = null) {
    const row = this.database.prepare('SELECT value FROM control_meta WHERE key = ?').get(key)
    return row ? row.value : fallback
  }

  transport() {
    return this.credential ? this.transportFactory({ origin: this.credential.origin, token: this.credential.token })
      : unpairedTransport('Pair a T3 credential before dispatching')
  }

  routes() {
    return this.database.prepare('SELECT * FROM sessions ORDER BY created_at, thread').all().map(row => ({
      threadId: row.thread, actorId: row.actor, allowedTaskIds: JSON.parse(row.allowed_task_ids), allowedFromActorIds: JSON.parse(row.allowed_from_actor_ids),
    }))
  }

  session(threadId) {
    const row = this.database.prepare('SELECT * FROM sessions WHERE thread = ?').get(threadId)
    requireValue(row, `No mapped T3 thread: ${threadId}`, 'NOT_FOUND')
    return row
  }

  registerCloud(body) {
    requireValue(this.database.prepare('SELECT 1 FROM projects WHERE id = ?').get(body.projectId), 'Register the project first', 'NOT_FOUND')
    this.authorization(body)
    requireValue(!this.routes().some(route => route.actorId === body.actorId), 'Actor is already mapped to T3', 'AMBIGUOUS_ROUTE')
    return this.cloud.register(body)
  }

  recordCloudVerdict({ executionId, kind, verdict, actorId, evidence }) {
    const initial = this.cloud.attempt(executionId)
    return this.cloud.serial(initial.contextId, () => {
      const row = this.cloud.attempt(executionId), actor = ownValue(this.doc().actors, actorId)
      requireValue(row.state === 'terminal' && row.runId, 'Record verdicts for exact terminal Cloud runs')
      requireValue(['checker', 'human'].includes(kind) && ['accepted', 'rejected'].includes(verdict), 'Invalid verdict')
      text(evidence, 'Verdict evidence')
      requireValue(actor && (kind === 'human' ? actor.kind === 'human' : actorId !== row.intent.actorId), 'Verdict Actor is not authorized', 'FORBIDDEN')
      requireValue(this.cloud.evidence(executionId), 'Freeze attempt evidence before recording acceptance')
      return this.cloud.saveAttempt({ ...row, verdicts: [...(row.verdicts ?? []), { kind, verdict, actorId, evidence, at: this.clock() }] })
    })
  }

  authorizeCloud(body) {
    this.authorization({ ...body, actorId: this.cloud.context(body.contextId).actorId })
    return this.cloud.authorize(body)
  }

  credentialStatus() {
    if (!this.credential) return 'missing'
    if (this.authRejected === this.credential.credentialId) return 'rejected'
    const remaining = this.credential.expiresAt === null ? Infinity : this.credential.expiresAt - this.clock()
    return remaining <= 0 ? 'expired' : remaining <= EXPIRY_WARNING_MS ? 'expiring' : 'valid'
  }

  /**
   * Replaces this controller's one credential. T3 deduplicates `clientRequestId`
   * per credential, so the contract refuses to retry possibly accepted work with
   * the new one; the owner reconciles or abandons it instead.
   */
  async pair({ origin, pairingCode }) {
    text(pairingCode, 'Pairing code')
    const pairedAt = this.clock()
    const { token, expiresIn } = await this.pairClient({ origin, pairingCode, access: QUALIFIED_RUNTIME_MODE })
    const client = this.transportFactory({ origin, token })
    const credential = { origin: client.origin ?? origin, token, access: QUALIFIED_RUNTIME_MODE, credentialId: client.credentialId,
      pairedAt, expiresAt: expiresIn ? pairedAt + expiresIn * 1000 : null }
    await atomicWrite(this.credentialPath, JSON.stringify(credential, null, 2))
    this.credential = credential
    this.execution.transport = client
    this.authRejected = null
    this.recovering = new Set(this.execution.routes.keys())
    await this.readEnvironment().catch(() => {})
    this.wake()
    return this.credentialSummary()
  }

  credentialSummary() {
    const { origin = null, access = null, credentialId = null, pairedAt = null, expiresAt = null } = this.credential ?? {}
    return { status: this.credentialStatus(), origin, access, credentialId, pairedAt, expiresAt }
  }

  registerProject({ id, name, repository = null }) {
    identifier(id, 'Project ID')
    text(name, 'Project name')
    const repo = repository ? issueReference({ repository, number: 1 }).repository : null
    this.database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, repository = excluded.repository')
      .run(id, name.trim(), repo, this.clock())
    return this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  }

  authorization({ actorId, allowedTaskIds, allowedFromActorIds }) {
    // Looked up as the board's own entries only, so an ID named like an inherited property names nothing.
    const { actors, tasks } = this.doc()
    requireValue(ownValue(actors, actorId)?.kind === 'agent', 'Map a T3 thread to a registered agent Actor', 'UNKNOWN_ACTOR')
    const taskIds = idList(allowedTaskIds, 'task IDs')
    const senders = idList(allowedFromActorIds, 'sender Actor IDs')
    for (const taskId of taskIds) requireValue(ownValue(tasks, taskId), `Task not found: ${taskId}`, 'NOT_FOUND')
    for (const sender of senders) requireValue(ownValue(actors, sender) && sender !== actorId, `Authorize existing senders other than the agent: ${sender}`, 'UNKNOWN_ACTOR')
    return { taskIds, senders }
  }

  /**
   * Maps one existing T3 thread to one agent Actor. The thread must be top-level
   * and approval-required, since only that combination was qualified to stop for
   * approvals. The first read becomes the baseline for recognizing foreign runs.
   */
  async mapSession({ projectId, threadId, actorId, allowedTaskIds, allowedFromActorIds }) {
    requireValue(this.database.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId), `Register project ${projectId} first`, 'NOT_FOUND')
    text(threadId, 'T3 thread ID')
    requireValue(!this.cloud.contexts().some(context => context.actorId === actorId), 'Actor is already mapped to Cloud', 'AMBIGUOUS_ROUTE')
    requireValue(!this.database.prepare('SELECT 1 FROM sessions WHERE thread = ?').get(threadId), 'This T3 thread is already mapped', 'AMBIGUOUS_ROUTE')
    const { taskIds, senders } = this.authorization({ actorId, allowedTaskIds, allowedFromActorIds })
    if (!this.environment) await this.readEnvironment().catch(() => {})
    const { thread } = await this.execution.transport.read(threadId)
    requireValue(thread.runtimeMode === QUALIFIED_RUNTIME_MODE, modeHold(thread.runtimeMode), 'UNQUALIFIED_THREAD')
    requireValue(!thread.parentThreadId, 'Child threads are not qualified; map a top-level thread', 'UNQUALIFIED_THREAD')
    requireValue(!this.cloud.contexts().some(context => context.actorId === actorId), 'Actor is already mapped to Cloud', 'AMBIGUOUS_ROUTE')
    const route = { threadId, actorId, allowedTaskIds: taskIds, allowedFromActorIds: senders }
    this.execution.setRoutes([...this.routes(), route])
    try {
      this.database.prepare('INSERT INTO sessions (thread, project, provider, actor, allowed_task_ids, allowed_from_actor_ids, host, identity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(threadId, projectId, 't3', actorId, JSON.stringify(taskIds), JSON.stringify(senders), hostname(), JSON.stringify(this.threadIdentity(thread)), this.clock())
    } catch (error) {
      this.execution.setRoutes(this.routes())
      throw error
    }
    await this.observeThread(threadId).catch(error => this.recordHealth(threadId, error))
    return this.sessionView(this.session(threadId))
  }

  /** Replaces a route's authorization. Work that loses it stays queued, never dispatched. */
  authorize({ threadId, allowedTaskIds, allowedFromActorIds }) {
    const session = this.session(threadId)
    const { taskIds, senders } = this.authorization({ actorId: session.actor, allowedTaskIds, allowedFromActorIds })
    // The contract's ledger is another connection, so it updates after this write rather than inside it.
    this.database.prepare('UPDATE sessions SET allowed_task_ids = ?, allowed_from_actor_ids = ? WHERE thread = ?')
      .run(JSON.stringify(taskIds), JSON.stringify(senders), threadId)
    this.execution.setRoutes(this.routes())
    return this.sessionView(this.session(threadId))
  }

  threadIdentity(thread) {
    const { projectId = null, title = null, providerInstanceId = null, model = null, runtimeMode = null, interactionMode = null,
      link = null, branch = null, worktreePath = null, parentThreadId = null } = thread
    return { t3ProjectId: projectId, title, providerInstanceId, model, runtimeMode, interactionMode, link, branch, worktreePath, parentThreadId,
      environmentId: this.environment?.environmentId ?? null }
  }

  /** Persists durable intent and wakes the poller; it is not a submission. */
  dispatch({ id, threadId, actorId, taskId, fromActorId, text: message }) {
    this.session(threadId)
    const row = this.execution.enqueue({ id, threadId, actorId, taskId, fromActorId, text: message })
    this.wake()
    return this.executionView(row)
  }

  async cancel(id) {
    this.cancelAttempts.set(id, this.clock())
    const row = await this.execution.cancel(id)
    await this.captureOutputs(row.thread)
    return this.executionView(this.execution.row(id))
  }

  async reconcile(id) {
    const result = await this.execution.reconcile(id)
    this.reconciliations.set(id, { ...result, at: this.clock() })
    return { ...result, execution: this.executionView(this.execution.row(id)) }
  }

  async resolve(id, decision, evidence) {
    return this.executionView(await this.execution.resolve(id, decision, evidence))
  }

  versionAllowed(version) {
    return QUALIFIED_T3_VERSIONS.includes(version) || JSON.parse(this.meta('acceptedVersions', '[]')).includes(version)
  }

  /**
   * Owner release after review. Releasing a hold for an unqualified T3 version must
   * say so with `acceptVersion`, which accepts it for this controller with the evidence.
   */
  async release({ threadId, evidence, reviewedRuns = [], acceptVersion = false }) {
    const version = this.environment?.serverVersion
    const versionHeld = Boolean(version) && this.execution.holds(threadId).includes(versionHold(version))
    requireValue(!versionHeld || acceptVersion === true, `Accepting T3 ${version} is a separate decision; release with acceptVersion after requalifying it`, 'VERSION_ACCEPTANCE_REQUIRED')
    await this.execution.release(threadId, evidence, { reviewedRuns })
    if (versionHeld) {
      const accepted = JSON.parse(this.meta('acceptedVersions', '[]'))
      this.database.prepare('INSERT OR REPLACE INTO control_meta VALUES (?, ?)').run('acceptedVersions', JSON.stringify([...new Set([...accepted, version])]))
    }
    this.wake()
    return this.sessionView(this.session(threadId))
  }

  terminalRow(id) {
    const row = this.execution.row(id)
    requireValue(row, 'Unknown execution', 'NOT_FOUND')
    requireValue(row.state === 'terminal' && RUN_OUTCOMES.has(row.outcome), 'Record artifacts and verdicts after T3 reports the run ended', 'INVALID_EXECUTION_STATE')
    return row
  }

  /** An artifact is a reference someone recorded, not evidence that it is correct. */
  recordArtifact({ id, kind, reference, actorId }) {
    this.terminalRow(id)
    requireValue(ARTIFACT_KINDS.includes(kind), `Artifact kind must be one of: ${ARTIFACT_KINDS.join(', ')}`)
    text(reference, 'Artifact reference')
    if (kind === 'commit') requireValue(/^[a-f0-9]{7,64}$/i.test(reference), 'Supply a commit hash')
    requireValue(ownValue(this.doc().actors, actorId), `Unknown Actor: ${actorId}`, 'UNKNOWN_ACTOR')
    this.database.prepare('INSERT INTO artifacts (execution, kind, reference, actor, at) VALUES (?, ?, ?, ?, ?)').run(id, kind, reference.trim(), actorId, this.clock())
    return this.executionView(this.execution.row(id))
  }

  /**
   * Records a checker's or a person's verdict. Completion is T3's outcome; a
   * checker verdict must come from an Actor other than the one that ran the work,
   * and human acceptance from a human Actor. Neither implies the other.
   */
  recordVerdict({ id, kind, verdict, actorId, evidence }) {
    const row = this.terminalRow(id)
    requireValue(['checker', 'human'].includes(kind), 'Verdict kind must be checker or human')
    requireValue(['accepted', 'rejected'].includes(verdict), 'Verdict must be accepted or rejected')
    text(evidence, 'Verdict evidence')
    const actor = ownValue(this.doc().actors, actorId)
    requireValue(actor, `Unknown Actor: ${actorId}`, 'UNKNOWN_ACTOR')
    if (kind === 'human') requireValue(actor.kind === 'human', 'Human acceptance must come from a human Actor', 'FORBIDDEN')
    else requireValue(actorId !== row.intent.actorId, 'An independent check cannot come from the Actor that ran the work', 'FORBIDDEN')
    this.database.prepare('INSERT INTO verdicts (execution, kind, verdict, actor, evidence, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, kind, verdict, actorId, evidence.trim(), this.clock())
    return this.executionView(this.execution.row(id))
  }

  /**
   * Starts polling. Each thread gets startup recovery (reconciliation and a repeated
   * cancellation) on its first pass that reaches T3, so an outage at startup only defers it.
   */
  start() {
    this.stopped = false
    this.recovering = new Set(this.execution.routes.keys())
    this.wake()
  }

  wake() {
    if (this.stopped !== false) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.poll() }, 0).unref()
  }

  /** One complete pass over every mapped thread; concurrent callers share it. */
  poll() {
    if (this.stopped) return Promise.resolve()
    if (this.polling) return this.polling.then(() => this.polling ?? this.poll())
    this.polling = (async () => {
      try {
        await this.cloud.poll()
        await this.checkEnvironment()
        for (const { threadId } of this.execution.routes.values()) await this.pollThread(threadId)
      } finally {
        this.polling = null
        if (this.stopped === false) {
          clearTimeout(this.timer)
          this.timer = setTimeout(() => { void this.poll() }, this.pollMs).unref()
        }
      }
    })()
    return this.polling
  }

  usable() {
    const status = this.credentialStatus()
    return ['valid', 'expiring'].includes(status) ? null : `T3 credential is ${status}; pair again to continue`
  }

  async readEnvironment() {
    try { this.environment = { ...await this.execution.transport.environment(), observedAt: this.clock() } } catch (error) {
      this.environmentError = error.message
      throw error
    }
    this.environmentError = null
  }

  /** Holds every thread while T3 reports a version that was neither qualified nor accepted by its owner. */
  async checkEnvironment() {
    if (this.usable()) return
    try { await this.readEnvironment() } catch { return }
    if (this.stopped) return
    const version = this.environment.serverVersion
    if (this.versionAllowed(version)) return
    for (const threadId of this.execution.routes.keys()) this.execution.setHold(threadId, versionHold(version))
  }

  async pollThread(threadId) {
    const unusable = this.usable()
    if (unusable) return this.recordHealth(threadId, new Error(unusable))
    const recovering = this.recovering?.has(threadId)
    try {
      if (recovering) await this.reconcileThread(threadId)
      await this.repeatCancellation(threadId, recovering)
      await this.observeThread(threadId)
      this.recovering?.delete(threadId)
      await this.captureOutputs(threadId)
      // Without T3's version, a qualified one cannot be confirmed, so nothing is submitted.
      if (!this.environment) throw new Error('T3 environment descriptor not read yet; dispatch waits for a qualified version')
      // Checked here too, so a thread mapped during this pass is held before its first submission.
      if (!this.versionAllowed(this.environment.serverVersion)) this.execution.setHold(threadId, versionHold(this.environment.serverVersion))
      const pumped = await this.execution.pump(threadId)
      // A lost reply is reconciled at once rather than left for an owner to notice.
      if (pumped.reason === 'Unknown outcome') await this.reconcileThread(threadId)
    } catch (error) { this.recordHealth(threadId, error) }
  }

  async observeThread(threadId) {
    const observation = await this.execution.observe(threadId)
    if (observation.superseded) return
    const identity = this.threadIdentity(observation.thread)
    this.database.prepare('UPDATE sessions SET identity = ?, observed_at = ? WHERE thread = ?').run(JSON.stringify(identity), observation.observedAt, threadId)
    if (identity.runtimeMode !== QUALIFIED_RUNTIME_MODE) this.execution.setHold(threadId, modeHold(identity.runtimeMode))
    this.health.set(threadId, { error: null, at: observation.observedAt })
  }

  async reconcileThread(threadId) {
    for (const row of this.execution.rows(threadId).filter(row => row.state === 'unknown')) {
      try { await this.reconcile(row.id) } catch (error) { this.reconciliations.set(row.id, { established: false, reason: error.message, at: this.clock() }) }
    }
  }

  /** A crash can land between saving cancel_requested and sending the interrupt, so it is repeated. */
  async repeatCancellation(threadId, recovering) {
    for (const row of this.execution.rows(threadId).filter(row => row.state === 'cancel_requested')) {
      if (!recovering && this.clock() - (this.cancelAttempts.get(row.id) ?? 0) < this.cancelRetryMs) continue
      this.cancelAttempts.set(row.id, this.clock())
      await this.execution.cancel(row.id).catch(error => this.recordHealth(threadId, error))
    }
  }

  /**
   * Captures what the run produced once T3 reports it ended, including a cancelled
   * run's partial output. A failed read is retried, and a successful one is read once
   * more on a later pass, since T3 can report the end before its last message is written.
   */
  async captureOutputs(threadId) {
    const settled = new Set(this.database.prepare('SELECT execution FROM outputs WHERE settled = 1').all().map(row => row.execution))
    for (const row of this.execution.rows(threadId).filter(row => row.state === 'terminal' && row.run_id && !settled.has(row.id))) {
      const previous = this.database.prepare('SELECT text, error FROM outputs WHERE execution = ?').get(row.id)
      let output
      try { output = { ...await this.execution.transport.output(threadId, row.run_id), error: null } } catch (error) {
        output = { text: previous?.text ?? null, truncated: false, error: error.message }
      }
      const done = !output.error && previous && !previous.error
      this.database.prepare('INSERT OR REPLACE INTO outputs VALUES (?, ?, ?, ?, ?, ?)')
        .run(row.id, output.text, output.truncated ? 1 : 0, output.error, this.clock(), done ? 1 : 0)
    }
  }

  recordHealth(threadId, error) {
    if (error.code === 'auth_invalid') this.authRejected = this.credential?.credentialId ?? null
    this.health.set(threadId, { error: error.message, code: error.code ?? null, at: this.clock() })
    this.logger.warn?.(`Control pane: ${threadId}: ${error.message}`)
  }

  sessionView(row) {
    const identity = JSON.parse(row.identity)
    const project = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(row.project)
    return {
      threadId: row.thread, provider: row.provider, actorId: row.actor, project: { id: project.id, name: project.name, repository: project.repository },
      allowedTaskIds: JSON.parse(row.allowed_task_ids), allowedFromActorIds: JSON.parse(row.allowed_from_actor_ids),
      // A project-folder thread reports no worktree; none is invented.
      location: { kind: 'local', host: row.host, worktreePath: identity.worktreePath, branch: identity.branch },
      identity, observedAt: row.observed_at, stale: row.observed_at === null || this.clock() - row.observed_at > this.staleAfterMs,
      health: this.health.get(row.thread) ?? null, holds: this.execution.holds(row.thread), blocker: this.execution.blocker(row.thread),
      unqualified: [identity.worktreePath ? 'Worktree threads were not qualified on T3 0.1.5' : null].filter(Boolean),
    }
  }

  executionView(row) {
    const link = JSON.parse(this.database.prepare('SELECT identity FROM sessions WHERE thread = ?').get(row.thread)?.identity ?? '{}').link ?? null
    const output = this.database.prepare('SELECT text, truncated, error, at, settled FROM outputs WHERE execution = ?').get(row.id)
    const verdicts = this.database.prepare('SELECT kind, verdict, actor, evidence, at FROM verdicts WHERE execution = ? ORDER BY id').all(row.id)
    const latest = kind => verdicts.findLast(verdict => verdict.kind === kind) ?? null
    return {
      id: row.id, threadId: row.thread, intent: row.intent, requestId: row.request, state: row.state, runId: row.run_id, outcome: row.outcome,
      reason: row.reason, evidence: row.evidence, credentialId: row.credential, submissions: row.submissions, createdAt: row.created_at,
      observedAt: row.observed_at, stale: ['running', 'blocked', 'cancel_requested'].includes(row.state)
        && (row.observed_at === null || this.clock() - row.observed_at > this.staleAfterMs),
      // T3's approvals are decided only in its own UI; input requests look the same here.
      approval: row.state === 'blocked' ? { decideAt: link } : null,
      completion: row.state === 'terminal' ? row.outcome : null, checker: latest('checker'), human: latest('human'), verdicts,
      artifacts: this.database.prepare('SELECT kind, reference, actor, at FROM artifacts WHERE execution = ? ORDER BY id').all(row.id),
      output: output ? { ...output, truncated: Boolean(output.truncated), settled: Boolean(output.settled) } : null,
      reconciliation: this.reconciliations.get(row.id) ?? null,
      transitions: this.database.prepare('SELECT from_state, to_state, at, detail FROM transitions WHERE execution = ? ORDER BY id').all(row.id),
    }
  }

  snapshot() {
    return {
      cloud: this.cloud.snapshot(), provider: 't3', qualifiedVersions: QUALIFIED_T3_VERSIONS, qualifiedRuntimeMode: QUALIFIED_RUNTIME_MODE,
      now: this.clock(), pollMs: this.pollMs, staleAfterMs: this.staleAfterMs,
      credential: this.credentialSummary(), environment: this.environment, environmentError: this.environmentError ?? null,
      acceptedVersions: JSON.parse(this.meta('acceptedVersions', '[]')),
      projects: this.database.prepare('SELECT id, name, repository FROM projects ORDER BY id').all(),
      sessions: this.database.prepare('SELECT * FROM sessions ORDER BY created_at, thread').all().map(row => this.sessionView(row)),
      executions: this.execution.rows().reverse().map(row => this.executionView(row)),
      reviews: this.execution.reviews().map(review => ({ ...review, holds: JSON.parse(review.holds), runs: JSON.parse(review.runs) })),
    }
  }

  async close() {
    this.stopped = true
    clearTimeout(this.timer)
    await this.polling?.catch(() => {})
    await this.cloud?.close()
    this.execution?.close()
    this.database?.close()
  }
}
