// Browser presence reporting and snapshot helpers. Presence is derived from
// explicit reports only: a browser is active after real interaction on a
// visible page, idle otherwise, and never reports activity it did not observe.

export const PRESENCE_DEFAULTS = Object.freeze({ heartbeatMs: 15000, idleMs: 120000, minIntervalMs: 1000 })
const ORDER = { active: 0, idle: 1, offline: 2 }
export const PRESENCE_LABELS = { active: 'Active', idle: 'Idle', offline: 'Offline' }

export function createPresenceReporter({
  api, projectId, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  visible = () => document.visibilityState !== 'hidden', onError = () => {}, ...options
}) {
  const { heartbeatMs, idleMs, minIntervalMs } = { ...PRESENCE_DEFAULTS, ...options }
  let sessionId = null, seq = 0, lastInteraction = -Infinity, focus = []
  let stopped = false, timer = null, queue = Promise.resolve(), lastSentAt = -Infinity, sent = null
  const isActive = () => visible() && now() - lastInteraction < idleMs
  // The activity lease ends when this browser's idle window would, so a heartbeat
  // never extends activity past the last real interaction.
  const state = () => {
    const remaining = Math.ceil(lastInteraction + idleMs - now())
    return isActive()
      ? { active: true, activeForMs: Math.min(300000, Math.max(1, remaining)), focusTaskIds: [...focus] }
      : { active: false, focusTaskIds: [...focus] }
  }
  const changed = () => !sent || sent.active !== isActive() || sent.focus !== focus.join('\n')

  const send = async () => {
    if (stopped) return
    try {
      if (!sessionId) {
        const started = await api.startSession(projectId, { kind: 'browser' })
        if (stopped) { await api.endSession(projectId, started.sessionId).catch(() => {}); return }
        sessionId = started.sessionId
        seq = 0
      }
      const body = { seq: ++seq, ...state() }
      lastSentAt = now()
      await api.report(projectId, sessionId, body)
      sent = { active: body.active, focus: body.focusTaskIds.join('\n') }
    } catch (failure) {
      // An expired or ended session is never resurrected; the next report starts a new one.
      if (['SESSION_EXPIRED', 'SESSION_NOT_FOUND', 'NOT_FOUND'].includes(failure.code)) {
        sessionId = null
        sent = null
        if (!stopped) schedule(minIntervalMs)
      } else onError(failure)
    }
  }
  const enqueue = () => { queue = queue.then(send); return queue }
  const schedule = delay => {
    if (stopped) return
    clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      // Keep any sooner report scheduled while this one was in flight.
      void enqueue().then(() => { if (timer === null) schedule(heartbeatMs) })
    }, Math.max(0, delay))
  }
  // Coalesce state changes to at most one report per minIntervalMs.
  const soon = () => { if (changed()) schedule(Math.max(0, lastSentAt + minIntervalMs - now())) }

  return {
    start() { schedule(0) },
    interaction() {
      const wasActive = isActive()
      lastInteraction = now()
      if (!wasActive) soon()
    },
    visibilityChanged() { soon() },
    setFocus(taskIds) {
      const next = [...new Set(taskIds.filter(Boolean))]
      if (next.join('\n') === focus.join('\n')) return
      focus = next
      soon()
    },
    async stop() {
      stopped = true
      clearTimer(timer)
      await queue
      if (sessionId) {
        const id = sessionId
        sessionId = null
        await api.endSession(projectId, id).catch(() => {})
      }
    },
    get sessionId() { return sessionId },
  }
}

/** Index a presence snapshot by Actor; Actors without a live session are offline. */
export function presenceIndex(snapshot) {
  const byActor = new Map()
  for (const entry of snapshot?.actors ?? []) {
    if (!entry?.actorId) continue
    const state = ORDER[entry.state] === undefined ? 'offline' : entry.state
    byActor.set(entry.actorId, { ...entry, state, sessions: Array.isArray(entry.sessions) ? entry.sessions : [],
      focusTaskIds: state === 'offline' ? [] : [...new Set(entry.focusTaskIds ?? [])] })
  }
  return byActor
}

export const presenceOf = (index, actorId) => index.get(actorId)?.state ?? 'offline'

/** Task ID → unique Actor IDs currently focused on it. */
export function focusByTask(index) {
  const byTask = {}
  for (const [actorId, entry] of index) {
    for (const taskId of entry.focusTaskIds) (byTask[taskId] ??= []).includes(actorId) || byTask[taskId].push(actorId)
  }
  return byTask
}

export function sortParticipants(actors, index) {
  return [...actors].sort((a, b) => ORDER[presenceOf(index, a.id)] - ORDER[presenceOf(index, b.id)] ||
    (a.displayName || a.handle).localeCompare(b.displayName || b.handle))
}
