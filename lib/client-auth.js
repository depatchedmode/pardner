import { randomUUID } from 'node:crypto'
import { hash, secret } from './client-identity.js'
import { requireValue } from './workspace-schema.js'

export class ClientAuth {
  constructor(registry, { now = Date.now } = {}) { this.registry = registry; this.now = now; this.tickets = new Map() }
  get cookieName() { return `pardner_${this.registry.read().clientId.replaceAll('-', '')}` }
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
  authenticate(req) {
    const state = this.registry.read()
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
    if (bearer && hash(bearer) === hash(state.operatorToken)) return { id: 'operator', kind: 'operator', deviceId: state.device.id }
    const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${this.cookieName}=`))?.slice(this.cookieName.length + 1)
    const session = state.sessions[hash(bearer ?? cookie ?? '')]
    requireValue(session && !session.revoked, 'Open Pardner through client open to authenticate', 'AUTH_REQUIRED')
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
