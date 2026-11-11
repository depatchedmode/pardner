import { createHash, randomBytes } from 'node:crypto'
import { machineIdentity, verify } from './machine-key.js'
import { computeMembership } from './membership.js'
import { canonical } from './workspace-schema.js'

/**
 * The machine-key handshake (docs/PARDNER-TRUST-DESIGN.md, section 5).
 *
 * Every connection between two machines, a sync socket or an HTTP session,
 * opens with the same four messages:
 *
 *   initiator → responder  hello    { v, projectId, route, initiator: party, checkpoint? }
 *   responder → initiator  reply    { responder: party, signature }
 *   initiator → responder  confirm  { signature }
 *   responder → initiator  welcome  { records, checkpoint?, documentUrl? }  or  refused { code, error }
 *
 *   party      = { machineId, publicKey, nonce, role }   (a fresh 32-byte nonce per connection)
 *   transcript = canonical({ v, projectId, route, initiator, responder })
 *
 * The responder signs "pardner/hello/v1/responder" ‖ transcript and the
 * initiator signs "pardner/hello/v1/initiator" ‖ transcript, each with its
 * machine key. Both nonces bind the signatures to this connection, the
 * machine IDs to these two machines, `projectId` to one project and `route`
 * (the URL the initiator dialled) to one responder, so a recorded or relayed
 * answer is useless against another hub, project or connection. Neither side
 * reveals membership records until both signatures have verified.
 *
 * The responder serves only a current member machine of its own records. The
 * initiator accepts nothing else until the responder is a member machine in
 * the log rooted at the project ID it expected, using the records it already
 * holds plus those the welcome offers. While a hub waits to catch up after a
 * restore, it asks for the initiator's records between confirm and welcome:
 *
 *   responder → initiator  { type: 'membership-request' }
 *   initiator → responder  { type: 'membership', records }
 *
 * Roles are `hub`, `replica` or `peer`; the shapes are symmetric so two peers
 * (#200) run the same exchange with role `peer` on both sides.
 */

export const HANDSHAKE_VERSION = 1
export const HELLO_DOMAIN = 'pardner/hello/v1'
export const SESSION_DOMAIN = 'pardner/session/v1'
export const REQUEST_DOMAIN = 'pardner/request/v1'
export const CHECKPOINT_DOMAIN = 'pardner/checkpoint/v1'
export const ROLES = ['hub', 'replica', 'peer']
/** HTTP headers of a signed request. */
export const SESSION_HEADER = 'x-pardner-session'
export const SEQUENCE_HEADER = 'x-pardner-seq'
export const SIGNATURE_HEADER = 'x-pardner-signature'

const NONCE = /^[A-Za-z0-9_-]{43}$/
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/
const MACHINE_ID = /^machine-[a-z2-7]{26}$/
const PROJECT_ID = /^[a-f0-9]{64}$/
const RUN = /^[A-Za-z0-9_-]{22}$/
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const bytes = value => Buffer.from(canonical(value), 'utf8')
const digest = (...parts) => parts.reduce((hash, part) => hash.update(part), createHash('sha256')).digest('base64url')

export class HandshakeError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const check = (condition, message, code = 'HANDSHAKE_INVALID') => { if (!condition) throw new HandshakeError(code, message) }

export const newNonce = () => randomBytes(32).toString('base64url')
export const newRun = () => randomBytes(16).toString('base64url')

function party(key, role) {
  check(ROLES.includes(role), 'Unknown handshake role')
  return { machineId: key.machineId, publicKey: key.publicKey, nonce: newNonce(), role }
}

function readParty(value) {
  check(object(value) && MACHINE_ID.test(value.machineId) && typeof value.publicKey === 'string' && NONCE.test(value.nonce) && ROLES.includes(value.role),
    'Malformed handshake')
  let machineId = null
  try { machineId = machineIdentity(value.publicKey).machineId } catch { /* Refused below. */ }
  check(machineId === value.machineId, 'The handshake machine ID does not match its key')
  return { machineId, publicKey: value.publicKey, nonce: value.nonce, role: value.role }
}

export function transcript(hello, responder) {
  return { v: hello.v, projectId: hello.projectId, route: hello.route, initiator: hello.initiator, responder }
}

const signSide = (key, side, value) => key.sign(`${HELLO_DOMAIN}/${side}`, bytes(value)).toString('base64url')
function verifySide(publicKey, side, value, signature) {
  return typeof signature === 'string' && SIGNATURE.test(signature) && verify(publicKey, `${HELLO_DOMAIN}/${side}`, bytes(value), Buffer.from(signature, 'base64url'))
}

/** The initiator's first message. `checkpoint` is the newest one this machine holds from the responder, if any. */
export function createHello(key, { projectId, route, role, checkpoint = null }) {
  check(PROJECT_ID.test(projectId) && typeof route === 'string' && route.length > 0 && route.length <= 2048, 'Supply the project ID and the route dialled')
  return { type: 'hello', v: HANDSHAKE_VERSION, projectId, route, initiator: party(key, role), ...(checkpoint ? { checkpoint } : {}) }
}

/** Responder: the hello's fields, refused unless it names this project and a route that reaches this responder. */
export function readHello(hello, { projectId, acceptRoute }) {
  check(object(hello) && hello.type === 'hello', 'Expected a hello')
  check(hello.v === HANDSHAKE_VERSION, 'Unsupported handshake version; update Pardner on both machines', 'HANDSHAKE_VERSION')
  check(hello.projectId === projectId, 'This hub does not serve that project', 'WRONG_PROJECT')
  check(typeof hello.route === 'string' && hello.route.length <= 2048 && acceptRoute(hello.route), 'The route you dialled does not belong to this hub', 'ROUTE_REJECTED')
  return { v: hello.v, projectId, route: hello.route, initiator: readParty(hello.initiator), checkpoint: object(hello.checkpoint) ? hello.checkpoint : null }
}

/** Responder: its party and signature over the transcript. */
export function answerHello(key, hello, role) {
  const responder = party(key, role)
  check(responder.machineId !== hello.initiator.machineId, 'A machine cannot open a session with itself')
  const value = transcript(hello, responder)
  return { transcript: value, reply: { type: 'hello-reply', responder, signature: signSide(key, 'responder', value) } }
}

/** Initiator: checks the responder's signature over this connection's transcript and returns its confirmation. */
export function readReply(key, hello, reply, { expectRole } = {}) {
  check(object(reply) && reply.type === 'hello-reply', 'Expected a handshake reply')
  const responder = readParty(reply.responder)
  check(responder.machineId !== hello.initiator.machineId && responder.nonce !== hello.initiator.nonce, 'The responder echoed this machine')
  check(!expectRole || responder.role === expectRole, `Expected a ${expectRole}`, 'WRONG_ROLE')
  const value = transcript(hello, responder)
  check(verifySide(responder.publicKey, 'responder', value, reply.signature), 'The responder’s handshake signature is invalid')
  return { transcript: value, responder, confirm: { type: 'hello-confirm', signature: signSide(key, 'initiator', value) } }
}

/** Responder: checks the initiator's signature over the same transcript. */
export function readConfirm(value, confirm) {
  check(object(confirm) && confirm.type === 'hello-confirm' && verifySide(value.initiator.publicKey, 'initiator', value, confirm.signature),
    'The initiator’s handshake signature is invalid')
}

/** An HTTP session's name: the transcript's digest, so it names one handshake and nothing else. */
export function sessionId(value) { return digest(SESSION_DOMAIN, canonical(value)) }

/**
 * Whether `machineId` with `publicKey` is a current member machine in the log
 * `records`, rooted at `projectId` (its genesis must hash to that ID).
 */
export function memberIn(records, projectId, machineId, publicKey) {
  const machine = computeMembership(records, { projectId }).machines.find(entry => entry.id === machineId)
  return Boolean(machine && machine.publicKey === publicKey)
}

// ---- Signed requests (HTTP sessions) ----

/** What a signed request covers: the session, a sequence number, the method, the URL as dialled, the body and the project. */
export function requestFields({ projectId, session, seq, method, url, body }) {
  return { v: HANDSHAKE_VERSION, projectId, session, seq, method: String(method).toUpperCase(), url, body: digest(canonical(body ?? null)) }
}

export function signRequest(key, fields) { return key.sign(REQUEST_DOMAIN, bytes(requestFields(fields))).toString('base64url') }

export function verifyRequest(publicKey, fields, signature) {
  return typeof signature === 'string' && SIGNATURE.test(signature) && verify(publicKey, REQUEST_DOMAIN, bytes(requestFields(fields)), Buffer.from(signature, 'base64url'))
}

// ---- Hub checkpoints (restored-hub detection) ----

/**
 * A hub's signed statement of its state: `run` is chosen at each start,
 * `starts` counts starts and `records` is the size of its grow-only record
 * store. Members keep the newest one they receive and present it when they
 * connect, so a hub restored from an older backup learns that it is stale.
 */
export function signCheckpoint(key, { projectId, run, starts, records }) {
  const body = { v: 1, projectId, hub: key.machineId, run, starts, records }
  return { ...body, signature: key.sign(CHECKPOINT_DOMAIN, bytes(body)).toString('base64url') }
}

export function checkpointValid(checkpoint, { projectId, hub, publicKey }) {
  if (!object(checkpoint) || checkpoint.v !== 1 || checkpoint.projectId !== projectId || checkpoint.hub !== hub || !RUN.test(checkpoint.run ?? '')
    || !Number.isSafeInteger(checkpoint.starts) || checkpoint.starts < 1 || !Number.isSafeInteger(checkpoint.records) || checkpoint.records < 0) return false
  const { signature, ...body } = checkpoint
  return Object.keys(body).length === 6 && typeof signature === 'string' && SIGNATURE.test(signature)
    && verify(publicKey, CHECKPOINT_DOMAIN, bytes(body), Buffer.from(signature, 'base64url'))
}

/**
 * Whether `seen` shows state the hub at `current` lacks: a later start, the
 * same start number in another run (one lost to a restore), or more records.
 */
export function aheadOf(seen, current) {
  return seen.starts > current.starts || (seen.starts === current.starts && seen.run !== current.run) || seen.records > current.records
}

/** Which of two valid checkpoints from one hub is newer, for a member keeping the newest. */
export function newerCheckpoint(a, b) {
  if (!a) return b
  if (!b) return a
  return b.starts > a.starts || (b.starts === a.starts && b.records > a.records) ? b : a
}

// ---- The exchange over a WebSocket ----

/**
 * JSON text frames from `socket`, one at a time, until released. A binary
 * frame, a malformed frame, a close or the deadline ends the exchange.
 */
function inbox(socket, timeoutMs, signal) {
  const queue = [], waiting = []
  let failure = null
  const fail = error => {
    failure ??= error
    for (const { reject } of waiting.splice(0)) reject(failure)
  }
  const onMessage = (data, binary) => {
    if (binary) return fail(new HandshakeError('HANDSHAKE_INVALID', 'Data arrived before the handshake finished'))
    let message
    try { message = JSON.parse(data.toString()) } catch { return fail(new HandshakeError('HANDSHAKE_INVALID', 'Malformed handshake frame')) }
    if (!object(message)) return fail(new HandshakeError('HANDSHAKE_INVALID', 'Malformed handshake frame'))
    if (message.type === 'refused') return fail(new HandshakeError(typeof message.code === 'string' ? message.code : 'HANDSHAKE_REFUSED',
      typeof message.error === 'string' ? message.error : 'The other machine refused the handshake'))
    const next = waiting.shift()
    if (next) next.resolve(message); else queue.push(message)
  }
  const onClose = () => fail(new HandshakeError('HANDSHAKE_CLOSED', 'The connection closed during the handshake'))
  const onError = error => fail(Object.assign(new HandshakeError('HANDSHAKE_CLOSED', error?.message ?? 'The connection failed during the handshake'), { transport: true }))
  const timer = setTimeout(() => fail(new HandshakeError('HANDSHAKE_TIMEOUT', 'The handshake did not finish in time')), timeoutMs)
  const onAbort = () => fail(new HandshakeError('HANDSHAKE_CLOSED', 'The handshake was abandoned'))
  signal?.addEventListener('abort', onAbort, { once: true })
  socket.on('message', onMessage)
  socket.on('close', onClose)
  socket.on('error', onError)
  return {
    next() {
      if (failure) return Promise.reject(failure)
      if (queue.length) return Promise.resolve(queue.shift())
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }))
    },
    release() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      socket.off('message', onMessage)
      socket.off('close', onClose)
      socket.off('error', onError)
    },
  }
}

const sendJson = (socket, value) => { if (socket.readyState === 1) socket.send(JSON.stringify(value)) }

/**
 * Initiator side on an open `ws` socket. Resolves once the responder has
 * proved its key and its membership; rejects with the responder's refusal or
 * the first failure. `knownRecords()` are the records this machine already
 * holds, so a responder cannot hide a removal this machine has seen;
 * `ownRecords()` answers a hub's membership request.
 */
export async function initiateHandshake(socket, { key, projectId, route, role, expectRole, checkpoint = null,
  knownRecords = () => [], ownRecords = () => [], timeoutMs = 10000, signal }) {
  const frames = inbox(socket, timeoutMs, signal)
  try {
    const hello = createHello(key, { projectId, route, role, checkpoint })
    sendJson(socket, hello)
    const { transcript: value, responder, confirm } = readReply(key, hello, await frames.next(), { expectRole })
    sendJson(socket, confirm)
    let message = await frames.next()
    if (message.type === 'membership-request') {
      sendJson(socket, { type: 'membership', records: ownRecords() })
      message = await frames.next()
    }
    check(message.type === 'welcome' && Array.isArray(message.records ?? []), 'Expected a welcome')
    const records = message.records ?? []
    check(memberIn([...knownRecords(), ...records], projectId, responder.machineId, responder.publicKey),
      'The machine that answered is not a member of this project; nothing was accepted from it', 'RESPONDER_NOT_MEMBER')
    return { responder, transcript: value, records, checkpoint: object(message.checkpoint) ? message.checkpoint : null,
      documentUrl: typeof message.documentUrl === 'string' ? message.documentUrl : null }
  } finally { frames.release() }
}

/**
 * Responder side on an accepted `ws` socket. `admit({ hello, transcript,
 * requestMembership })` runs once both signatures have verified; it returns
 * the welcome's fields or throws a HandshakeError, which is sent as a refusal
 * before the socket closes. Resolves with the initiator's party.
 */
export async function respondHandshake(socket, { key, projectId, role, acceptRoute, screen = () => {}, admit, timeoutMs = 10000 }) {
  const frames = inbox(socket, timeoutMs)
  try {
    const hello = readHello(await frames.next(), { projectId, acceptRoute })
    await screen(hello)
    const { transcript: value, reply } = answerHello(key, hello, role)
    sendJson(socket, reply)
    readConfirm(value, await frames.next())
    const welcome = await admit({ hello, transcript: value, requestMembership: async () => {
      sendJson(socket, { type: 'membership-request' })
      const message = await frames.next()
      check(message.type === 'membership' && Array.isArray(message.records) && message.records.length <= 10000, 'Expected membership records')
      return message.records
    } })
    sendJson(socket, { type: 'welcome', ...welcome })
    return { initiator: hello.initiator, transcript: value, checkpoint: hello.checkpoint }
  } catch (error) {
    // Coded errors are Pardner's own refusals and say what to do; anything else is reported without detail.
    const coded = typeof error?.code === 'string'
    if (error?.code !== 'HANDSHAKE_CLOSED') sendJson(socket, { type: 'refused', code: coded ? error.code : 'HANDSHAKE_FAILED', error: coded ? error.message : 'The handshake failed' })
    throw error
  } finally { frames.release() }
}
