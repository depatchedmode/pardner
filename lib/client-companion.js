import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { isLoopback, lanInterfaces } from './lan-access.js'
import { requireValue } from './workspace-schema.js'

export { isLoopback, lanInterfaces }

export const PAIRING_TTL_MS = 600000
export const MAX_PENDING_PAIRINGS = 5
export const COMPANION_SESSION_MS = 30 * 86400000
// Finished pairings stay visible this long so a polling dialog can see the phone arrive.
const PAIRING_HISTORY_MS = 600000

/** One key per device: case-folded, with an IPv4-mapped IPv6 prefix removed. */
export function throttleSource(address) { return (address || '').toLowerCase().replace(/^::ffff:/, '') }

/**
 * A fixed one-minute window of pairing attempts. A source over its own allowance is refused before it can count
 * toward the global allowance, so one noisy device cannot lock out the others.
 */
export class Throttle {
  constructor({ now = Date.now, windowMs = 60000, perSource = 10, total = 100 } = {}) {
    Object.assign(this, { now, windowMs, perSource, total })
    this.window = { start: -Infinity, count: 0, sources: new Map() }
  }
  take(address) {
    const now = this.now()
    if (now - this.window.start >= this.windowMs) this.window = { start: now, count: 0, sources: new Map() }
    const source = throttleSource(address), count = this.window.sources.get(source) ?? 0
    requireValue(count < this.perSource && this.window.count < this.total, 'Too many attempts. Wait a minute and try again.', 'PAIRING_THROTTLED')
    this.window.sources.set(source, count + 1)
    this.window.count++
  }
}

const codeHash = (id, code) => createHash('sha256').update(`pardner-companion-pairing-v1:${id}:${code}`).digest()

export function pairingSummary(pairing, now = Date.now()) {
  return { id: pairing.id, projectId: pairing.projectId, name: pairing.name, createdAt: pairing.createdAt, expiresAt: pairing.expiresAt,
    state: pairing.state === 'pending' && pairing.expiresAt <= now ? 'expired' : pairing.state, ...(pairing.companionId ? { companionId: pairing.companionId } : {}) }
}
export function companionSummary(companion) {
  return { id: companion.id, name: companion.name, projectIds: companion.projectIds, createdAt: companion.createdAt,
    lastSeenAt: companion.lastSeenAt ?? null, revokedAt: companion.revokedAt ?? null }
}

/** Drop pairings that finished long enough ago that no dialog still needs them. Runs inside a registry transaction. */
export function prunePairings(state, now) {
  state.pairings ??= {}
  for (const [id, pairing] of Object.entries(state.pairings)) if (pairing.expiresAt + PAIRING_HISTORY_MS <= now) delete state.pairings[id]
}

/**
 * Finds the pending pairing whose code matches. Every pending code is compared, in constant time and without an
 * early exit, so neither the result nor the time taken says which pairing came close.
 */
export function matchPairing(pairings, code, now) {
  if (typeof code !== 'string' || !/^\d{8}$/.test(code)) return null
  let match = null
  for (const pairing of Object.values(pairings ?? {})) {
    if (pairing.state !== 'pending' || pairing.expiresAt <= now) continue
    if (timingSafeEqual(codeHash(pairing.id, code), Buffer.from(pairing.codeHash, 'hex'))) match = pairing
  }
  return match
}

export function companionSettings(state) {
  return { enabled: false, interfaceName: null, port: null, ...state.companion }
}

/**
 * Pairing codes and companion status for the opt-in phone companion. The service owns the listener; it records
 * the address it bound (`active`) or why it could not (`diagnostic`).
 */
export class ClientCompanion {
  constructor(registry, { interfaces = () => lanInterfaces(), now = Date.now } = {}) {
    Object.assign(this, { registry, interfaces, now })
    this.throttle = new Throttle({ now })
    this.active = null
    this.diagnostic = null
  }
  stale() {
    return Boolean(this.active && !this.interfaces().some(item => item.name === this.active.interfaceName && item.address === this.active.address))
  }
  phoneUrl() { return this.active && !this.stale() ? `http://${this.active.address}:${this.active.port}/pardner/` : null }
  /** The interface the settings name, when it has exactly one usable IPv4 address. */
  resolve(interfaceName) {
    const candidates = this.interfaces().filter(item => item.name === interfaceName)
    return candidates.length === 1 ? candidates[0] : null
  }
  status() {
    const state = this.registry.read(), now = this.now(), stale = this.stale()
    return {
      settings: companionSettings(state), interfaces: this.interfaces(), active: this.active, stale, phoneUrl: this.phoneUrl(),
      diagnostic: stale ? `The address of ${this.active.interfaceName} changed. Rebind to use the current address.` : this.diagnostic,
      pairings: Object.values(state.pairings ?? {}).filter(p => p.expiresAt + PAIRING_HISTORY_MS > now).map(p => pairingSummary(p, now)),
      companions: Object.values(state.companions ?? {}).map(companionSummary),
    }
  }
  /** Issues a keyed pairing code. The plaintext is returned once and only its salted hash is kept. */
  issue(project, name) {
    requireValue(this.phoneUrl(), 'Turn on phone access on an available network before pairing', 'COMPANION_UNAVAILABLE')
    requireValue(typeof name === 'string' && name.trim() && name.length <= 100, 'Phone name must be text of at most 100 characters')
    const now = this.now()
    return this.registry.update(state => {
      prunePairings(state, now)
      const pending = Object.values(state.pairings).filter(p => p.state === 'pending' && p.expiresAt > now)
      requireValue(pending.length < MAX_PENDING_PAIRINGS, `At most ${MAX_PENDING_PAIRINGS} pairing codes can wait at once; cancel one first`, 'PAIRING_LIMIT')
      const id = randomUUID()
      let code
      // Codes are compared across every pending pairing, so a new one must not equal any of them.
      do code = String(randomInt(0, 100000000)).padStart(8, '0'); while (matchPairing(state.pairings, code, now))
      state.pairings[id] = { id, projectId: project.id, name: name.trim(), codeHash: codeHash(id, code).toString('hex'),
        createdAt: now, expiresAt: now + PAIRING_TTL_MS, state: 'pending' }
      return { id, code, expiresAt: now + PAIRING_TTL_MS, phoneUrl: this.phoneUrl() }
    })
  }
  cancel(id) {
    return this.registry.update(state => {
      const pairing = state.pairings?.[id]
      requireValue(pairing, 'Pairing not found', 'NOT_FOUND')
      if (pairing.state === 'pending') pairing.state = 'cancelled'
      return { pairing: pairingSummary(pairing, this.now()) }
    })
  }
  /** Cancels every waiting code; paired phones are kept. Runs when phone access is turned off. */
  cancelPending() {
    this.registry.update(state => { for (const pairing of Object.values(state.pairings ?? {})) if (pairing.state === 'pending') pairing.state = 'cancelled' })
  }
}
