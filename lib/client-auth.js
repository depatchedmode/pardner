import { randomUUID } from 'node:crypto'
import { hash, secret } from './client-identity.js'
import { COMPANION_SESSION_MS, matchPairing } from './client-companion.js'
import { requireValue } from './workspace-schema.js'

const cookie = (req, name) => (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)

export class ClientAuth {
  constructor(registry, { now = Date.now } = {}) { this.registry = registry; this.now = now; this.tickets = new Map() }
  get cookieName() { return `pardner_${this.registry.read().clientId.replaceAll('-', '')}` }
  get companionCookieName() { return `${this.cookieName}_companion` }
  /** The companion cookie: the phone's only credential, scoped to the Pardner paths and never readable by script. */
  companionCookie(token, expiresAt, origin) {
    const maxAge = Math.max(0, Math.ceil((expiresAt - this.now()) / 1000))
    return `${this.companionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/pardner; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`
  }
  /**
   * Redeems a pairing code in one registry transaction: the code is spent, the companion is created (or, when the
   * browser already holds a live companion session, gains the project) and the session is bound to its projects.
   */
  redeemCompanion(code, existingToken) {
    const now = this.now()
    return this.registry.update(state => {
      state.companions ??= {}
      const pairing = matchPairing(state.pairings, code, now)
      const project = pairing && Object.values(state.projects).find(p => p.id === pairing.projectId && p.state === 'ready')
      requireValue(pairing && project && state.identity && state.humanAuthority !== false,
        'The pairing code is incorrect or expired. Make a new code on the computer.', 'PAIRING_INVALID')
      const prior = existingToken && state.sessions[hash(existingToken)]
      const live = prior?.kind === 'companion' && !prior.revoked && prior.expiresAt > now && !state.companions[prior.companionId]?.revokedAt
      let token = existingToken, session = prior
      if (!live) {
        token = secret()
        const companion = { id: randomUUID(), name: pairing.name, humanId: state.identity.id, projectIds: [], createdAt: now, lastSeenAt: now, revokedAt: null }
        state.companions[companion.id] = companion
        session = state.sessions[hash(token)] = { id: randomUUID(), kind: 'companion', companionId: companion.id, deviceId: companion.id,
          projectIds: [], createdAt: now, expiresAt: now + COMPANION_SESSION_MS }
      }
      const companion = state.companions[session.companionId]
      for (const ids of [companion.projectIds, session.projectIds]) if (!ids.includes(project.id)) ids.push(project.id)
      Object.assign(pairing, { state: 'redeemed', companionId: companion.id, redeemedAt: now })
      return { token, expiresAt: session.expiresAt, companionId: companion.id }
    })
  }
  browserGrant(origin) {
    const grant = secret()
    this.registry.update(state => {
      for (const [key, value] of Object.entries(state.bootstraps)) if (value.expiresAt <= this.now()) delete state.bootstraps[key]
      state.bootstraps[hash(grant)] = { origin, expiresAt: this.now() + 60000 }
    })
    return grant
  }
  exchange(grant, origin) {
    requireValue(typeof grant === 'string', 'Supply a browser grant', 'AUTH_REQUIRED')
    const token = secret()
    this.registry.update(state => {
      requireValue(state.humanAuthority !== false, 'Agent-only device has no human browser authority', 'FORBIDDEN')
      const entry = state.bootstraps[hash(grant)]
      requireValue(entry && entry.expiresAt > this.now() && entry.origin === origin, 'Browser grant expired, used or wrong origin', 'AUTH_REQUIRED')
      delete state.bootstraps[hash(grant)]
      state.sessions[hash(token)] = { id: randomUUID(), kind: 'human', deviceId: state.device.id }
    })
    return token
  }
  agentGrant(projectId, actorId, deviceId) {
    const state = this.registry.read()
    const key = `${projectId}:${actorId}`
    const existing = state.agentTokens?.[key]
    if (existing && !state.sessions[hash(existing)]?.revoked) return existing
    const token = secret()
    this.registry.update(state => { state.agentTokens ??= {}; state.agentTokens[key] = token; state.sessions[hash(token)] = { id: randomUUID(), kind: 'agent', projectId, actorId, deviceId } })
    return token
  }
  /**
   * The loopback surface accepts the operator token, browser cookies and agent bearer tokens, never a companion
   * session. The phone (LAN) surface accepts only the companion cookie.
   */
  authenticate(req, surface = 'loopback') {
    if (surface === 'lan') return this.companion(req)
    const state = this.registry.read()
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
    if (bearer && hash(bearer) === hash(state.operatorToken)) return { id: 'operator', kind: 'operator', deviceId: state.device.id }
    const session = state.sessions[hash(bearer ?? cookie(req, this.cookieName) ?? '')]
    requireValue(session && !session.revoked && session.kind !== 'companion', 'Open Pardner through client open to authenticate', 'AUTH_REQUIRED')
    return session
  }
  /** The companion token the request carries, if any; only meaningful on the LAN surface. */
  companionToken(req) { return cookie(req, this.companionCookieName) ?? null }
  companion(req) {
    requireValue(!req.headers.authorization, 'Phones sign in with a pairing code', 'AUTH_REQUIRED')
    const state = this.registry.read(), now = this.now()
    const session = state.sessions[hash(this.companionToken(req) ?? '')]
    const companion = session && state.companions?.[session.companionId]
    requireValue(session?.kind === 'companion' && !session.revoked && session.expiresAt > now && companion && !companion.revokedAt,
      'Pair this phone with a code from the computer', 'AUTH_REQUIRED')
    // Last seen is informational; writing it at most once a minute keeps polling off the disk.
    if (!(companion.lastSeenAt > now - 60000)) this.registry.update(next => { next.companions[companion.id].lastSeenAt = now })
    return session
  }
  ticket(binding, origin) {
    for (const [key, grant] of this.tickets) if (grant.expiresAt <= this.now()) this.tickets.delete(key)
    const ticket = secret()
    this.tickets.set(hash(ticket), { ...binding, origin, expiresAt: this.now() + 30000 })
    return { ticket, expiresInMs: 30000 }
  }
  consume(ticket, projectId, origin, principalId) {
    const key = hash(ticket ?? ''), grant = this.tickets.get(key)
    this.tickets.delete(key)
    requireValue(grant && grant.projectId === projectId && grant.origin === origin && grant.principalId === principalId && grant.expiresAt > this.now(), 'Invalid WebSocket ticket', 'AUTH_REQUIRED')
    return grant
  }
}
