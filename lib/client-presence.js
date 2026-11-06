import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

function requirePresence(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message), { code })
}

function string(value, name, optional = false) {
  if (optional && (value === undefined || value === null)) return null
  requirePresence(typeof value === 'string' && value.trim().length > 0 && value.length <= 256,
    'INVALID_ARGUMENT', `Supply a nonempty ${name} of at most 256 characters`)
  return value.trim()
}

function identity(binding) {
  return Object.fromEntries(['projectId', 'actorId', 'deviceId', 'principalId'].map(key => [key, string(binding?.[key], key)]))
}

function assertIdentity(binding, input) {
  for (const key of ['projectId', 'actorId', 'deviceId', 'principalId']) {
    if (input[key] !== undefined) requirePresence(input[key] === binding[key],
      key === 'projectId' ? 'PROJECT_MISMATCH' : 'ACTOR_MISMATCH', 'Presence identity must match the authenticated session')
  }
}

function inputObject(input) {
  requirePresence(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_ARGUMENT', 'Supply a presence object')
  return input
}

export class ClientPresence {
  constructor({ now = () => performance.now(), ttlMs = 45000, activityMs = 90000, maxSessions = 1024 } = {}) {
    requirePresence(Number.isFinite(ttlMs) && ttlMs > 0 && ttlMs <= 1800000,
      'INVALID_ARGUMENT', 'Presence TTL must be between 0 and 1800000 milliseconds')
    requirePresence(Number.isFinite(activityMs) && activityMs > 0 && activityMs <= 300000,
      'INVALID_ARGUMENT', 'Activity lease must be between 0 and 300000 milliseconds')
    requirePresence(Number.isInteger(maxSessions) && maxSessions > 0, 'INVALID_ARGUMENT', 'Supply a positive session limit')
    this.now = now
    this.ttlMs = ttlMs
    this.activityMs = activityMs
    this.maxSessions = maxSessions
    this.sessions = new Map()
  }

  prune(now) {
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id)
  }

  start(binding, input = {}) {
    const bound = identity(binding)
    inputObject(input)
    assertIdentity(bound, input)
    const kind = input.kind ?? 'agent'
    requirePresence(['browser', 'agent'].includes(kind), 'INVALID_ARGUMENT', 'Session kind must be browser or agent')
    const metadata = {
      kind,
      harnessId: string(binding.harnessId ?? input.harnessId, 'harness ID', true),
      managedBy: string(input.managedBy, 'management app', true),
      model: string(input.model, 'active model', true),
      deviceName: string(binding.deviceName, 'device name', true),
    }
    const now = this.now()
    this.prune(now)
    requirePresence(this.sessions.size < this.maxSessions, 'PRESENCE_LIMIT', 'Too many live presence sessions')
    const sessionId = randomUUID()
    this.sessions.set(sessionId, { ...bound, ...metadata, sessionId, seq: -1, lastReport: null,
      focusTaskIds: [], activeUntil: now, expiresAt: now + this.ttlMs })
    return { sessionId, ttlMs: this.ttlMs }
  }

  owned(binding, sessionId, now) {
    const bound = identity(binding)
    const session = this.sessions.get(string(sessionId, 'session ID'))
    requirePresence(session, 'SESSION_EXPIRED', 'The presence session has ended; start a fresh session')
    assertIdentity(bound, session)
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId)
      requirePresence(false, 'SESSION_EXPIRED', 'The presence session has expired; start a fresh session')
    }
    return session
  }

  report(binding, sessionId, input) {
    inputObject(input)
    const now = this.now()
    const session = this.owned(binding, sessionId, now)
    assertIdentity(session, input)
    requirePresence(Number.isSafeInteger(input.seq) && input.seq >= 0, 'INVALID_ARGUMENT', 'Supply a nonnegative report sequence')
    requirePresence(typeof input.active === 'boolean', 'INVALID_ARGUMENT', 'Report whether the session is active')
    requirePresence(Array.isArray(input.focusTaskIds) && input.focusTaskIds.length <= 32,
      'INVALID_ARGUMENT', 'Supply at most 32 focused task IDs')
    const focusTaskIds = [...new Set(input.focusTaskIds.map(value => string(value, 'task ID')))].sort()
    const model = input.model === undefined ? session.model : string(input.model, 'active model', true)
    const activeForMs = input.activeForMs ?? (session.kind === 'browser' ? 120000 : this.activityMs)
    requirePresence(Number.isFinite(activeForMs) && activeForMs > 0 && activeForMs <= 300000,
      'INVALID_ARGUMENT', 'Activity lease must be between 0 and 300000 milliseconds')
    const report = JSON.stringify({ seq: input.seq, active: input.active, focusTaskIds, model, activeForMs })
    if (input.seq === session.seq && report === session.lastReport) return this.receipt(session, now)
    requirePresence(input.seq > session.seq, 'STALE_PRESENCE_REPORT', 'Report sequence must advance; a replay cannot renew presence')
    Object.assign(session, { seq: input.seq, lastReport: report, focusTaskIds, model,
      activeUntil: input.active ? now + activeForMs : now, expiresAt: now + this.ttlMs })
    return this.receipt(session, now)
  }

  receipt(session, now) {
    return { sessionId: session.sessionId, seq: session.seq, ttlMs: Math.max(0, session.expiresAt - now),
      state: session.activeUntil > now ? 'active' : 'idle' }
  }

  end(binding, sessionId) {
    this.owned(binding, sessionId, this.now())
    this.sessions.delete(sessionId)
    return { sessionId, ended: true }
  }

  snapshot(projectId) {
    string(projectId, 'project ID')
    const now = this.now()
    this.prune(now)
    const actors = new Map()
    for (const session of this.sessions.values()) {
      if (session.projectId !== projectId) continue
      const state = session.activeUntil > now ? 'active' : 'idle'
      if (!actors.has(session.actorId)) actors.set(session.actorId, { actorId: session.actorId,
        state: 'idle', focusTaskIds: new Set(), sessions: [] })
      const actor = actors.get(session.actorId)
      if (state === 'active') actor.state = state
      for (const taskId of session.focusTaskIds) actor.focusTaskIds.add(taskId)
      actor.sessions.push({ sessionId: session.sessionId, deviceId: session.deviceId, deviceName: session.deviceName,
        kind: session.kind, harnessId: session.harnessId, managedBy: session.managedBy, model: session.model,
        state, focusTaskIds: [...session.focusTaskIds], ttlMs: Math.max(0, session.expiresAt - now) })
    }
    return { actors: [...actors.values()].map(actor => ({ ...actor, focusTaskIds: [...actor.focusTaskIds].sort() })), observedAt: now }
  }
}
