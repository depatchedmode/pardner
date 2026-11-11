import { performance } from 'node:perf_hooks'
import {
  HandshakeError, SEQUENCE_HEADER, SESSION_HEADER, SIGNATURE_HEADER, answerHello, createHello, memberIn, readConfirm, readHello, readReply,
  sessionId, signRequest, verifyRequest,
} from './machine-handshake.js'

/**
 * Signed HTTP sessions between machines.
 *
 * A session is the machine handshake carried by two unsigned requests:
 * `POST {route}/session` with the hello returns the reply, and
 * `POST {route}/session/confirm` with the confirmation returns the welcome.
 * The session is named by the transcript's digest. Every later request is
 * signed by the calling machine's key over the session, a sequence number,
 * the method, the URL as dialled, the body and the project
 * (machine-handshake.js requestFields), sent in three headers.
 *
 * Freshness needs no clock between machines: the responder's nonce makes the
 * session new, and each sequence number is accepted once. A window of recent
 * numbers lets concurrent requests arrive out of order. A captured request is
 * useless again in its session, in any other session, and at any other hub.
 * No bearer secret is ever issued: only the machine key authenticates, and the
 * responder re-checks membership on every request, so a removal ends the
 * session at the next request even before the session is dropped.
 *
 * Sessions live in memory: a responder restart ends them, and clients open a
 * new one. Expiry uses this process's monotonic clock only.
 */

export const SESSION_IDLE_MS = 10 * 60000
export const PENDING_MS = 30000
export const SEQUENCE_WINDOW = 1024
const PENDING_LIMIT = 256
const ACTIVE_LIMIT = 1024

export class SessionServer {
  /**
   * `member(machineId)` returns the machine's certified public key while it is a current member, else null.
   * `refusal(machineId)` is the error for a machine that is not, such as a removed one.
   * `acceptRoute(route)` decides whether a dialled route reaches this responder.
   * `welcome(machineId)` returns the welcome's fields once a session is confirmed; it may throw to refuse.
   */
  constructor({ key, projectId, role = 'hub', acceptRoute, member, refusal = notMember, welcome = () => ({}), now = () => performance.now() }) {
    Object.assign(this, { key, projectId, role, acceptRoute, member, refusal, welcome, now })
    this.pending = new Map()
    this.active = new Map()
  }

  sweep() {
    const now = this.now()
    for (const [id, entry] of this.pending) if (entry.expiresAt <= now) this.pending.delete(id)
    for (const [id, entry] of this.active) if (entry.expiresAt <= now) this.active.delete(id)
  }

  /** Answers a hello. A machine that is not a current member gets nothing beyond the refusal. */
  open(hello) {
    this.sweep()
    const accepted = readHello(hello, { projectId: this.projectId, acceptRoute: this.acceptRoute })
    const publicKey = this.member(accepted.initiator.machineId)
    if (publicKey !== accepted.initiator.publicKey) throw this.refusal(accepted.initiator.machineId)
    if (this.pending.size >= PENDING_LIMIT) throw new HandshakeError('TOO_MANY_REQUESTS', 'Too many sessions are being opened; retry shortly')
    const { transcript, reply } = answerHello(this.key, accepted, this.role)
    const id = sessionId(transcript)
    this.pending.set(id, { transcript, expiresAt: this.now() + PENDING_MS })
    return { reply, session: id }
  }

  /** Confirms a session once the initiator has signed the same transcript. */
  async confirm(id, confirmation) {
    this.sweep()
    const entry = typeof id === 'string' ? this.pending.get(id) : null
    if (!entry) throw new HandshakeError('SESSION_UNKNOWN', 'This session expired or was never opened; open a new one')
    this.pending.delete(id)
    readConfirm(entry.transcript, confirmation)
    const { machineId, publicKey } = entry.transcript.initiator
    if (this.member(machineId) !== publicKey) throw this.refusal(machineId)
    const welcome = await this.welcome(machineId)
    if (this.active.size >= ACTIVE_LIMIT) this.active.delete(this.active.keys().next().value)
    this.active.set(id, { machineId, publicKey, route: entry.transcript.route, highest: 0, seen: new Set(), expiresAt: this.now() + SESSION_IDLE_MS })
    return { type: 'welcome', ...welcome }
  }

  /**
   * The calling machine of a signed request, or a refusal. `suffix` is the
   * path and query below the session's route, as this responder received it,
   * so the signed URL must name this route. Each sequence number is used once.
   */
  verify({ session, seq, signature, method, suffix, body }) {
    const entry = typeof session === 'string' ? this.active.get(session) : null
    if (!entry || entry.expiresAt <= this.now()) {
      if (entry) this.active.delete(session)
      throw new HandshakeError('SESSION_UNKNOWN', 'This machine session expired; open a new one')
    }
    const number = Number(seq)
    if (!Number.isSafeInteger(number) || number < 1 || String(number) !== String(seq)) throw new HandshakeError('AUTH_REQUIRED', 'Supply a request sequence number')
    if (!verifyRequest(entry.publicKey, { projectId: this.projectId, session, seq: number, method, url: entry.route + suffix, body }, signature)) {
      throw new HandshakeError('AUTH_REQUIRED', 'The request signature does not match this session, route and body')
    }
    if (number <= entry.highest - SEQUENCE_WINDOW || entry.seen.has(number)) throw new HandshakeError('REQUEST_REPLAYED', 'This request was already used')
    if (this.member(entry.machineId) !== entry.publicKey) {
      this.active.delete(session)
      throw this.refusal(entry.machineId)
    }
    entry.seen.add(number)
    if (number > entry.highest) {
      entry.highest = number
      for (const value of entry.seen) if (value <= number - SEQUENCE_WINDOW) entry.seen.delete(value)
    }
    entry.expiresAt = this.now() + SESSION_IDLE_MS
    return { machineId: entry.machineId }
  }

  /** Drops every session, pending or active, of a machine that is no longer a member. */
  revokeNonMembers() {
    for (const [id, entry] of this.active) if (this.member(entry.machineId) !== entry.publicKey) this.active.delete(id)
    for (const [id, entry] of this.pending) if (this.member(entry.transcript.initiator.machineId) !== entry.transcript.initiator.publicKey) this.pending.delete(id)
  }

  /** Drops every session: a hub that stops serving ends them all. */
  clear() { this.pending.clear(); this.active.clear() }
}

function notMember() {
  return new HandshakeError('NOT_MEMBER', 'This machine is not a current member of the project; nothing is served to it')
}

/**
 * Opens and uses a signed session with a responder at `route`. `send(url,
 * { method, headers, body })` performs one HTTP request and returns its JSON
 * or throws an error with the responder's `code`. `knownRecords()` returns the
 * membership records this machine holds, so the responder must be a member
 * machine in a log rooted at `projectId` that includes them.
 */
export class SessionClient {
  constructor({ key, projectId, route, role = 'replica', expectRole = 'hub', send, knownRecords = async () => [], onWelcome = () => {} }) {
    Object.assign(this, { key, projectId, route: route.replace(/\/$/, ''), role, expectRole, send, knownRecords, onWelcome })
    this.current = null
    this.opening = null
  }

  async open() {
    const hello = createHello(this.key, { projectId: this.projectId, route: this.route, role: this.role })
    const { reply, session } = await this.send(`${this.route}/session`, { method: 'POST', body: { hello } })
    const { transcript, responder, confirm } = readReply(this.key, hello, reply, { expectRole: this.expectRole })
    if (session !== sessionId(transcript)) throw new HandshakeError('HANDSHAKE_INVALID', 'The responder named another session')
    const { welcome } = await this.send(`${this.route}/session/confirm`, { method: 'POST', body: { session, confirm } })
    const records = Array.isArray(welcome?.records) ? welcome.records : []
    if (!memberIn([...await this.knownRecords(), ...records], this.projectId, responder.machineId, responder.publicKey)) {
      throw new HandshakeError('RESPONDER_NOT_MEMBER', 'The machine that answered is not a member of this project; nothing was sent to it')
    }
    await this.onWelcome(welcome, responder)
    return { id: session, seq: 0, responder }
  }

  session() {
    if (this.current) return Promise.resolve(this.current)
    this.opening ??= this.open().then(session => { this.current = session; return session }).finally(() => { this.opening = null })
    return this.opening
  }

  /**
   * Sends a signed request for `suffix` below the route; a session the responder no longer knows is reopened once.
   * Other `options` (a timeout, for example) pass through to `send`.
   */
  async request(suffix, { method = 'GET', body, ...options } = {}) {
    for (let attempt = 0; ; attempt++) {
      const session = await this.session()
      const seq = ++session.seq
      const url = this.route + suffix
      // A read signs no body; a write signs the body as the responder will parse it (JSON drops undefined fields).
      const signed = ['GET', 'HEAD'].includes(method) ? null : JSON.parse(JSON.stringify(body ?? {}))
      const signature = signRequest(this.key, { projectId: this.projectId, session: session.id, seq, method, url, body: signed })
      try {
        return await this.send(url, { ...options, method, ...(signed === null ? {} : { body: signed }),
          headers: { [SESSION_HEADER]: session.id, [SEQUENCE_HEADER]: String(seq), [SIGNATURE_HEADER]: signature } })
      } catch (error) {
        if (error.code !== 'SESSION_UNKNOWN' || attempt > 0) throw error
        if (this.current === session) this.current = null
      }
    }
  }

  /** Forgets the session, for example after this machine learns it was removed. */
  reset() { this.current = null }
}

/** The body a signed request covers, as the responder parsed it: none for a read. */
export function signedBody(method, body) { return ['GET', 'HEAD'].includes(String(method).toUpperCase()) ? null : body ?? {} }

/** The signed-request headers of an incoming HTTP request, or null when it carries none. */
export function signedHeaders(headers) {
  const session = headers[SESSION_HEADER], seq = headers[SEQUENCE_HEADER], signature = headers[SIGNATURE_HEADER]
  return typeof session === 'string' && typeof seq === 'string' && typeof signature === 'string' ? { session, seq, signature } : null
}
