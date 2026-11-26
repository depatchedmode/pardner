import { createHash, randomBytes } from 'node:crypto'
import { publicKeyFromMachineId, verify } from './machine-key.js'
import { computeMembership } from './membership.js'
import { canonical } from './workspace-schema.js'
import { deriveChannel, ephemeralKey, FRAME, validEphemeral } from './machine-channel.js'

// Byte encoding, transport phases and disclosure rules are specified in docs/PARDNER-CHANNEL-SPEC.md.
export const HANDSHAKE_VERSION = 2
export const HELLO_DOMAIN = 'pardner/hello/v2'
export const SESSION_DOMAIN = 'pardner/session/v2'
export const REQUEST_DOMAIN = 'pardner/request/v2'
export const CHECKPOINT_DOMAIN = 'pardner/checkpoint/v1'
export const ROLES = ['hub', 'replica', 'peer']
/** HTTP headers of a signed request. */
export const SESSION_HEADER = 'x-pardner-session'
export const SEQUENCE_HEADER = 'x-pardner-seq'
export const SIGNATURE_HEADER = 'x-pardner-signature'
export const HANDSHAKE_TIMEOUT_MS = 10000

const NONCE = /^[A-Za-z0-9_-]{43}$/
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/
const PROJECT_ID = /^[a-f0-9]{64}$/
const RUN = /^[A-Za-z0-9_-]{22}$/
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const bytes = value => Buffer.from(canonical(value), 'utf8')
const digest = (...parts) => parts.reduce((hash, part) => hash.update(part), createHash('sha256')).digest('base64url')

export class HandshakeError extends Error {
  constructor(code, message, details = null) { super(message); this.code = code; if (details) this.details = details }
}
const check = (condition, message, code = 'HANDSHAKE_INVALID') => { if (!condition) throw new HandshakeError(code, message) }

export const newNonce = () => randomBytes(32).toString('base64url')
export const newRun = () => randomBytes(16).toString('base64url')

function party(key, role, ephemeral) {
  check(ROLES.includes(role), 'Unknown handshake role')
  return { machineId: key.machineId, publicKey: key.publicKey, nonce: newNonce(), role, ...(ephemeral ? { ephemeral } : {}) }
}

function readParty(value, transport) {
  check(object(value) && typeof value.publicKey === 'string' && NONCE.test(value.nonce) && ROLES.includes(value.role), 'Malformed handshake')
  const { machineId, nonce, role } = value
  const publicKey = publicKeyFromMachineId(machineId)
  check(publicKey, 'Malformed handshake')
  check(publicKey === value.publicKey, 'The handshake machine ID does not match its key')
  check(transport === 'ws' ? validEphemeral(value.ephemeral) : value.ephemeral === undefined, 'Invalid ephemeral key')
  return { machineId, publicKey, nonce, role, ...(transport === 'ws' ? { ephemeral: value.ephemeral } : {}) }
}

export function transcript(hello, responder) {
  return { v: hello.v, projectId: hello.projectId, route: hello.route, transport: hello.transport,
    initiator: hello.initiator, responder, checkpoint: hello.checkpoint ?? null }
}

const signSide = (key, side, value) => key.sign(`${HELLO_DOMAIN}/${side}`, bytes(value)).toString('base64url')
function verifySide(publicKey, side, value, signature) {
  return typeof signature === 'string' && SIGNATURE.test(signature) && verify(publicKey, `${HELLO_DOMAIN}/${side}`, bytes(value), Buffer.from(signature, 'base64url'))
}

/** The initiator's first message. `checkpoint` is the newest one this machine holds from the responder, if any. */
export function createHello(key, { projectId, route, role, checkpoint = null, ephemeral }) {
  check(PROJECT_ID.test(projectId) && typeof route === 'string' && route.length > 0 && route.length <= 2048, 'Supply the project ID and the route dialled')
  return { type: 'hello', v: HANDSHAKE_VERSION, projectId, route, transport: ephemeral ? 'ws' : 'http', initiator: party(key, role, ephemeral), ...(checkpoint ? { checkpoint } : {}) }
}

/** Responder: the hello's fields, refused unless it names this project and a route that reaches this responder. */
export function readHello(hello, { projectId, acceptRoute, transport = 'http' }) {
  check(object(hello) && hello.type === 'hello', 'Expected a hello')
  check(hello.v === HANDSHAKE_VERSION, 'Unsupported handshake version; update Pardner on both machines', 'HANDSHAKE_VERSION')
  check(hello.transport === transport && (transport === 'ws' || hello.checkpoint === undefined), 'Wrong handshake transport')
  check(hello.projectId === projectId, 'This hub does not serve that project', 'WRONG_PROJECT')
  check(typeof hello.route === 'string' && hello.route.length <= 2048 && acceptRoute(hello.route), 'The route you dialled does not belong to this hub', 'ROUTE_REJECTED')
  return { v: hello.v, projectId, route: hello.route, transport, initiator: readParty(hello.initiator, transport), checkpoint: object(hello.checkpoint) ? hello.checkpoint : null }
}

/** Responder: its party and signature over the transcript. */
export function answerHello(key, hello, role, ephemeral) {
  const responder = party(key, role, ephemeral)
  check((role === 'hub' && hello.initiator.role === 'replica') || (role === 'peer' && hello.initiator.role === 'peer'), 'Wrong endpoint roles', 'WRONG_ROLE')
  check(responder.machineId !== hello.initiator.machineId, 'A machine cannot open a session with itself')
  const value = transcript(hello, responder)
  return { transcript: value, reply: { type: 'hello-reply', responder, signature: signSide(key, 'responder', value) } }
}

/** Initiator: checks the responder's signature over this connection's transcript and returns its confirmation. */
export function readReply(key, hello, reply, { expectRole } = {}) {
  check(object(reply) && reply.type === 'hello-reply', 'Expected a handshake reply')
  const responder = readParty(reply.responder, hello.transport)
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

export function checkpointValid(checkpoint, { projectId, hub }) {
  if (!object(checkpoint) || checkpoint.v !== 1 || checkpoint.projectId !== projectId || checkpoint.hub !== hub || !RUN.test(checkpoint.run ?? '')
    || !Number.isSafeInteger(checkpoint.starts) || checkpoint.starts < 1 || !Number.isSafeInteger(checkpoint.records) || checkpoint.records < 0) return false
  const { signature, ...body } = checkpoint
  return Object.keys(body).length === 6 && typeof signature === 'string' && SIGNATURE.test(signature)
    && verify(publicKeyFromMachineId(hub), CHECKPOINT_DOMAIN, bytes(body), Buffer.from(signature, 'base64url'))
}

/**
 * Whether `seen` shows state the hub at `current` lacks: a later start, the
 * same start number in another run (one lost to a restore), or more records.
 */
export function aheadOf(seen, current) {
  // Missing state has no trustworthy run counter (including older saved zero sentinels).
  if (!Number.isSafeInteger(current.starts) || current.starts < 1) return seen.records > current.records
  return seen.starts > current.starts || (seen.starts === current.starts && seen.run !== current.run) || seen.records > current.records
}

/** Which of two valid checkpoints from one hub is newer, for a member keeping the newest. */
export function newerCheckpoint(a, b) {
  if (!a) return b
  if (!b) return a
  return b.starts > a.starts || (b.starts === a.starts && b.records > a.records) ? b : a
}

export function provesRemoval(known, offered, { projectId, machineId, responder }) {
  if (!Array.isArray(offered)) return false
  const membership = computeMembership([...known, ...offered], { projectId })
  return membership.machines.some(machine => machine.id === responder.machineId) && membership.removedMachines.includes(machineId)
}

export function revokedError(proof) {
  return new HandshakeError('REVOKED', refusalText.REVOKED, { ...proof, verified: true, authenticated: true })
}

const refusalText = {
  HANDSHAKE_VERSION: 'The hub and this machine must run the same Pardner sync protocol. Update both machines.',
  WRONG_PROJECT: 'The connection was refused for this project.',
  ROUTE_REJECTED: 'The connection was refused for this hub route.',
  WRONG_ROLE: 'The connection was refused for this endpoint role.',
  HUB_WAITING: 'The hub is catching up after a restore.',
  NOT_MEMBER: 'This machine was refused access to the project.',
  REVOKED: 'This machine was removed from the project. Its local data is preserved.',
}

const earlyRefusals = new Set(['HANDSHAKE_VERSION', 'WRONG_PROJECT', 'ROUTE_REJECTED', 'WRONG_ROLE'])

function socketRefusal(message, context) {
  const { code, records } = message
  if (code === 'REVOKED' && context && provesRemoval(context.knownRecords(), records, context)) {
    const saved = context.onRemoval(records)
    if (saved) return revokedError(saved)
  }
  if (earlyRefusals.has(code)) return new HandshakeError(code, refusalText[code])
  if (context && ['HUB_WAITING', 'NOT_MEMBER'].includes(code)) {
    const { responder, projectId, knownRecords, recognized } = context
    const authenticated = recognized || memberIn(knownRecords(), projectId, responder.machineId, responder.publicKey)
    return new HandshakeError(code, refusalText[code], { authenticated })
  }
  return new HandshakeError('HANDSHAKE_REFUSED', 'The hub refused the connection.')
}

/** One receiver for the life of the socket. Handshake steps can hold one frame
 * while yielding. The ready handler claims that frame before any new dispatch. */
class SocketFrames {
  constructor(socket, timeoutMs, signal) {
    this.socket = socket
    const fail = () => this.fail(new HandshakeError('HANDSHAKE_CLOSED', 'The connection closed'))
    const aborted = () => { fail(); socket.terminate() }
    socket.on('message', (data, binary) => this.dispatch(() => {
      check(binary === Boolean(this.channel), 'Unexpected frame format')
      const frame = this.channel ? this.channel.open(data) : { type: FRAME.control, payload: data }
      if (this.receive) this.receive(frame)
      else if (this.waiting) {
        const { resolve } = this.waiting
        this.waiting = null
        resolve(frame)
      } else {
        check(!this.queued, 'Unexpected pipelined frame')
        this.queued = frame
      }
    }))
    socket.once('close', fail)
    socket.on('error', fail)
    const timer = timeoutMs === null ? null : setTimeout(() => {
      this.fail(new HandshakeError('HANDSHAKE_TIMEOUT', 'The handshake did not finish in time'))
      socket.terminate()
    }, timeoutMs)
    signal?.addEventListener('abort', aborted, { once: true })
    this.clearDeadline = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
    }
  }

  dispatch(receive) {
    if (this.failure || this.socket.readyState !== this.socket.OPEN) return
    try { receive() } catch (error) {
      this.fail(error instanceof HandshakeError ? error : new HandshakeError('CHANNEL_INVALID', 'The sync channel received an invalid frame'))
      this.socket.terminate()
    }
  }

  fail(error) {
    this.failure ??= error
    this.clearDeadline()
    this.queued = null
    this.waiting?.reject(this.failure)
    this.waiting = null
  }

  async next(context) {
    if (this.failure) throw this.failure
    let frame = this.queued
    this.queued = null
    frame ??= await new Promise((resolve, reject) => { this.waiting = { resolve, reject } })
    if (this.failure) throw this.failure
    check(frame.type === FRAME.control, 'Expected a handshake control frame')
    const message = readControl(frame.payload)
    if (message.type === 'refused') throw socketRefusal(message, context)
    return message
  }

  send(type, payload) {
    if (this.failure) throw this.failure
    check(this.socket.readyState === this.socket.OPEN, 'The connection closed', 'HANDSHAKE_CLOSED')
    if (this.channel) this.socket.send(this.channel.seal(type, payload))
    else this.socket.send(payload.toString('utf8'))
  }

  control(message) { this.send(FRAME.control, Buffer.from(JSON.stringify(message))) }

  protect(key, remote, transcript, initiating) {
    // A frame received ahead of the key transition is never reinterpreted.
    check(!this.queued && !this.failure, 'Frame received before key transition')
    this.channel = deriveChannel(key.privateKey, remote.ephemeral, transcript, initiating)
  }

  attach(receive) {
    if (this.failure) throw this.failure
    this.clearDeadline()
    const queued = this.queued
    this.queued = null
    this.receive = receive
    if (queued) this.dispatch(() => receive(queued))
    if (this.failure) throw this.failure
  }
}

export function readControl(payload) {
  let message
  try { message = JSON.parse(payload.toString('utf8')) } catch {}
  check(object(message), 'Malformed control frame')
  return message
}

export async function initiateHandshake(socket, { key, projectId, route, role, expectRole = 'hub', expectedResponder = null, checkpoint = null,
  knownRecords = () => [], ownRecords = () => [], onRemoval = () => null, timeoutMs = HANDSHAKE_TIMEOUT_MS, signal }) {
  signal?.throwIfAborted()
  const frames = new SocketFrames(socket, timeoutMs, signal)
  const ephemeral = ephemeralKey()
  const hello = createHello(key, { projectId, route, role, checkpoint, ephemeral: ephemeral.wireKey })
  frames.control(hello)
  const { transcript: value, responder, confirm } = readReply(key, hello, await frames.next(), { expectRole })
  check(!expectedResponder || responder.machineId === expectedResponder, 'The hub answered with another machine key', 'RESPONDER_NOT_MEMBER')
  frames.protect(ephemeral, responder, value, true)
  frames.control(confirm)
  const context = { knownRecords, projectId, machineId: key.machineId, responder, onRemoval, recognized: Boolean(expectedResponder) }
  let message = await frames.next(context)
  if (message.type === 'membership-request') {
    check(context.recognized || memberIn(knownRecords(), projectId, responder.machineId, responder.publicKey),
      'The responding machine is not a member of this project', 'RESPONDER_NOT_MEMBER')
    context.recognized = true
    frames.control({ type: 'membership', records: ownRecords() })
    message = await frames.next(context)
  }
  check(message.type === 'welcome' && Array.isArray(message.records), 'Expected a welcome')
  const membership = computeMembership([...knownRecords(), ...message.records], { projectId })
  check(membership.machines.some(machine => machine.id === responder.machineId),
    'The responding machine is not a member of this project', 'RESPONDER_NOT_MEMBER')
  if (membership.removedMachines.includes(key.machineId)) throw socketRefusal({ code: 'REVOKED', records: message.records }, context)
  check(membership.machines.some(machine => machine.id === key.machineId), 'This machine has no admission in the welcome', 'NOT_MEMBER')
  context.recognized = true
  return { responder, transcript: value, records: message.records, checkpoint: message.checkpoint ?? null,
    documentUrl: message.documentUrl ?? null, frames, refusal: payload => {
      const message = readControl(payload)
      check(message.type === 'refused', 'Unexpected protected control frame', 'CHANNEL_INVALID')
      return socketRefusal(message, context)
    } }
}

export async function respondHandshake(socket, { key, projectId, role, acceptRoute, admit,
  canWelcome = () => true, timeoutMs = HANDSHAKE_TIMEOUT_MS }) {
  const frames = new SocketFrames(socket, timeoutMs)
  let confirmed = false
  try {
    const hello = readHello(await frames.next(), { projectId, acceptRoute, transport: 'ws' })
    const ephemeral = ephemeralKey()
    const { transcript: value, reply } = answerHello(key, hello, role, ephemeral.wireKey)
    frames.control(reply)
    frames.protect(ephemeral, hello.initiator, value, false)
    readConfirm(value, await frames.next())
    confirmed = true
    const welcome = await admit({ hello, transcript: value, requestMembership: async () => {
      frames.control({ type: 'membership-request' })
      const message = await frames.next()
      check(message.type === 'membership' && Array.isArray(message.records) && message.records.length <= 10000, 'Expected membership records')
      return message.records
    } })
    check(!frames.queued, 'Protected traffic arrived before the welcome', 'CHANNEL_INVALID')
    check(canWelcome(hello.initiator), 'The hub stopped serving this session', 'HANDSHAKE_CLOSED')
    frames.control({ type: 'welcome', ...welcome })
    return { initiator: hello.initiator, transcript: value, frames }
  } catch (error) {
    if (!frames.failure && error.code !== 'HANDSHAKE_CLOSED') {
      if (confirmed) frames.control(refusalFrame(error))
      else if (!frames.channel) frames.control({ type: 'refused', code: refusalCode(error) })
    }
    throw error
  }
}

function refusalCode(error) { return error instanceof HandshakeError ? error.code : 'HANDSHAKE_REFUSED' }

export function refusalFrame(error) {
  const code = refusalCode(error)
  return { type: 'refused', code, ...(code === 'REVOKED' && error.details?.records ? { records: error.details.records } : {}) }
}
