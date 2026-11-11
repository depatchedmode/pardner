import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { machineIdentity, rawPublicKey, verify } from './machine-key.js'
import { actorId, agentName, enrolledDevice, profile, setupAgent } from './client-identity.js'
import { buildRecord, verifyRecord } from './membership.js'
import { canonical, requireValue } from './workspace-schema.js'

// Enrollment ceremony: a signed offer, a join request from the new machine, and a
// confirmation code both sides derive once the approver's nonce is fixed
// (docs/PARDNER-TRUST-DESIGN.md, section 4). Everything here is pure.

export const OFFER_DOMAIN = 'pardner/offer/v1'
export const JOIN_DOMAIN = 'pardner/join/v1'
export const CODE_DOMAIN = 'pardner/confirm/v1'
export const PURPOSES = ['human', 'agent', 'device']
/** Eight decimal digits: a blind guess matches with probability 10^-8 per approval. */
export const CODE_DIGITS = 8
/** Pending requests one offer may hold at once. */
export const PENDING_LIMIT = 5
/** Requests one offer may hold in any state, so a leaked invitation cannot grow the hub's queue without bound. */
export const REQUEST_LIMIT = 20
/** A pending request expires this long after the hub stores it, or when its offer expires, whichever is first. */
export const REQUEST_TTL_MS = 30 * 60000
export const OFFER_TTL_MS = 24 * 3600000

const bytes = value => Buffer.from(canonical(value), 'utf8')
const text = (value, limit = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const MACHINE_ID = /^machine-[a-z2-7]{26}$/
const PROJECT_ID = /^[a-f0-9]{64}$/
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/
const fail = (reason, code = 'INVALID_INVITATION') => { throw Object.assign(new Error(reason), { code }) }
const check = (condition, reason, code) => { if (!condition) fail(reason, code) }
const unsigned = ({ signature, ...body }) => body

export const newSecret = () => randomBytes(32).toString('base64url')
export const newNonce = () => randomBytes(32).toString('base64url')

function route(value) {
  const url = new URL(value)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  check(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Invalid invitation route')
  check(url.protocol === 'https:' || loopback, 'Remote invitations require HTTPS; use a secure private route')
  return url.toString()
}

function validateOffer(offer) {
  check(object(offer) && offer.v === 1 && PROJECT_ID.test(offer.projectId) && TOKEN.test(offer.offerId), 'Incomplete invitation offer')
  check(PURPOSES.includes(offer.purpose), 'Unknown invitation purpose')
  if (offer.purpose === 'human') check(['admin', 'member'].includes(offer.role) && offer.personId === undefined, 'A Human invitation offers the admin or member role')
  else check(text(offer.personId) && offer.role === undefined, 'A machine invitation names the person it joins')
  check(Array.isArray(offer.routes) && offer.routes.length >= 1 && offer.routes.length <= 4 && offer.routes.every(value => route(value) === value),
    'An invitation needs one to four routes to its hub')
  check(Number.isSafeInteger(offer.expiresAt) && offer.expiresAt > 0 && MACHINE_ID.test(offer.signer), 'Incomplete invitation offer')
}

/** `{projectId, offerId, purpose, role|personId, routes, expiresAt}` signed by the issuing machine. */
export function buildOffer(key, fields) {
  const offer = { v: 1, ...fields, signer: key.machineId }
  validateOffer(offer)
  return { ...offer, signature: key.sign(OFFER_DOMAIN, bytes(offer)).toString('base64url') }
}

/** Null when `offer` is well formed and signed by `publicKey`, otherwise the reason. */
export function offerRefusal(offer, publicKey) {
  try {
    validateOffer(unsigned(offer ?? {}))
    check(typeof publicKey === 'string' && machineIdentity(publicKey).machineId === offer.signer, 'Offer signer is not a machine of this project')
    const signature = Buffer.from(String(offer.signature), 'base64url')
    check(signature.toString('base64url') === offer.signature && verify(publicKey, OFFER_DOMAIN, bytes(unsigned(offer)), signature), 'Invalid offer signature')
    return null
  } catch (error) { return error.message }
}

export function encodeInvitation({ offer, secret, projectName, person }) {
  return `pardner-invite-v2.${Buffer.from(JSON.stringify({ offer, secret, projectName, ...(person ? { person } : {}) })).toString('base64url')}`
}

/** Decodes an invitation envelope. Expiry and authority are the hub's to decide; this checks only its form. */
export function decodeInvitation(envelope) {
  check(typeof envelope === 'string' && envelope.startsWith('pardner-invite-v2.'), 'Paste one complete Pardner invitation')
  let value
  try { value = JSON.parse(Buffer.from(envelope.slice('pardner-invite-v2.'.length), 'base64url').toString()) } catch { fail('Invalid invitation') }
  check(object(value) && TOKEN.test(value.secret ?? '') && typeof value.projectName === 'string', 'Incomplete invitation')
  validateOffer(unsigned(value.offer ?? {}))
  check(typeof value.offer.signature === 'string', 'Incomplete invitation')
  if (value.person !== undefined) check(object(value.person) && value.person.id === value.offer.personId && text(value.person.name), 'Incomplete invitation')
  return value
}

/**
 * The new machine's request: its public key and who it joins as, signed by
 * that key (proof of possession). `mac` keys the signed request with the
 * invitation secret, which never leaves the joiner and the hub.
 */
export function buildJoinRequest(key, secret, { offer, personId, identity, device, agent }) {
  const request = {
    v: 1, projectId: offer.projectId, offerId: offer.offerId, purpose: offer.purpose, personId,
    machineId: key.machineId, publicKey: key.publicKey, device: enrolledDevice(device), agent: setupAgent(agent),
    ...(offer.purpose === 'human' ? { profile: profile(identity) } : {}),
  }
  const signed = { ...request, signature: key.sign(JOIN_DOMAIN, bytes(request)).toString('base64url') }
  return { request: signed, mac: joinMac(secret, signed) }
}

export function joinMac(secret, request) {
  return createHmac('sha256', Buffer.from(secret, 'base64url')).update(bytes(request)).digest('base64url')
}

export function macMatches(secret, request, mac) {
  const expected = Buffer.from(joinMac(secret, request)), actual = Buffer.from(String(mac ?? ''))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Null when `request` is a well-formed, self-signed request for `offer`, otherwise the reason. */
export function joinRequestRefusal(request, offer) {
  try {
    check(object(request) && request.v === 1 && request.projectId === offer.projectId && request.offerId === offer.offerId
      && request.purpose === offer.purpose, 'The join request does not match its invitation')
    rawPublicKey(request.publicKey)
    check(machineIdentity(request.publicKey).machineId === request.machineId, 'The join request machine ID does not match its key')
    check(text(request.personId), 'The join request names no person')
    if (offer.purpose !== 'human') check(request.personId === offer.personId, 'This invitation links a machine to another person')
    check(canonical(enrolledDevice(request.device)) === canonical(request.device) && canonical(setupAgent(request.agent)) === canonical(request.agent),
      'The join request device or agent metadata is not normalised')
    if (offer.purpose === 'human') check(canonical(profile(request.profile)) === canonical(request.profile), 'The join request profile is not normalised')
    else check(request.profile === undefined, 'Only a Human invitation carries a profile')
    const signature = Buffer.from(String(request.signature), 'base64url')
    check(signature.toString('base64url') === request.signature && verify(request.publicKey, JOIN_DOMAIN, bytes(unsigned(request)), signature),
      'Invalid join request signature')
    return null
  } catch (error) { return error.message }
}

/**
 * The short code both screens show: SHA-256 over the offer, the joiner's
 * public key and the approver's nonce, reduced to eight digits. The nonce is
 * chosen after the request is stored, so a request cannot be ground to match.
 */
export function confirmationCode(offer, publicKey, nonce) {
  const digest = createHash('sha256').update(CODE_DOMAIN).update(bytes({ offer, publicKey, nonce })).digest()
  const digits = (digest.readBigUInt64BE(0) % 10n ** BigInt(CODE_DIGITS)).toString().padStart(CODE_DIGITS, '0')
  return `${digits.slice(0, 4)} ${digits.slice(4)}`
}

export const sameCode = (a, b) => typeof a === 'string' && typeof b === 'string' && a.replace(/\D/g, '') === b.replace(/\D/g, '')
  && a.replace(/\D/g, '').length === CODE_DIGITS

/** IDs of entries `[{id, code}]` whose code another entry shares; each side of a collision is listed. */
export function collidingCodes(entries) {
  const byCode = new Map()
  for (const { id, code } of entries) if (code) byCode.set(code, [...(byCode.get(code) ?? []), id])
  return new Set([...byCode.values()].filter(ids => ids.length > 1).flat())
}

/**
 * The setup agent's label on `key`'s machine; agent IDs are `actorId(person, harness)`. Its display name is the
 * name the agent was given, otherwise its owner's and harness's ("Maya’s Codex"), as the Actor is named (#150).
 */
export function agentNameRecord(key, projectId, personId, agent, ownerName) {
  const reported = setupAgent(agent)
  return buildRecord(key, { projectId, kind: 'agent.name', subject: actorId(personId, reported.harnessId), machineId: key.machineId,
    displayName: agentName({ name: ownerName }, reported), harness: reported.harnessId })
}

/** Null when `record` is an agent label the machine named in `request` signed for its own person. */
export function requestRecordRefusal(record, request) {
  if (record?.kind !== 'agent.name') return 'A join request carries only agent labels'
  if (!verifyRecord(record, request.projectId, request.publicKey).valid) return 'The agent label is not signed by the joining machine'
  if (record.machineId !== request.machineId || record.subject !== actorId(request.personId, record.harness)) return 'The agent label names another person’s agent'
  return null
}

/**
 * What a member machine may act as, from the records alone: its person's human
 * Actor unless it was admitted agents-only, and each agent it named for that
 * person. Null when the machine is not a current member.
 */
export function machineAccess(membership, machineId) {
  const machine = membership.machines.find(entry => entry.id === machineId)
  const person = machine && membership.people.find(entry => entry.id === machine.personId)
  if (!person) return null
  const humanAllowed = machine.agentsOnly !== true
  const agents = membership.agentNames.filter(agent => agent.machineId === machineId && agent.id === actorId(person.id, agent.harness)).map(agent => agent.id)
  return { machineId, personId: person.id, role: person.role, humanAllowed, actorIds: [...new Set([...(humanAllowed ? [actorId(person.id)] : []), ...agents])] }
}

/** Throws unless `nonce` has the shape `newNonce` produces. */
export function requireNonce(nonce) {
  requireValue(typeof nonce === 'string' && /^[A-Za-z0-9_-]{43}$/.test(nonce), 'Supply the approver nonce', 'INVALID_ARGUMENT')
  return nonce
}

/**
 * Why `record` cannot enter under `membership`, as [message, code], or null.
 * The gate's maySign is the final word; this names the reason a person can act on.
 */
export function recordRefusal(membership, record) {
  const signerMachine = membership.machines.find(machine => machine.id === record?.signer)
  const signer = signerMachine && membership.people.find(person => person.id === signerMachine.personId)
  if (!signer) return ['This machine is no longer a member of the project', 'REVOKED']
  const person = id => membership.people.find(entry => entry.id === id)
  const mayRemove = target => target.role !== 'owner' && (signer.role === 'owner' || (signer.role === 'admin' && target.role === 'member' && !target.everAdmin))
  switch (record.kind) {
    case 'member.remove': {
      const target = person(record.subject)
      if (!target) return ['That person is not a current member of this project', 'NOT_FOUND']
      if (target.id === signer.id) {
        if (target.role === 'owner') return ['The project owner can’t leave. The owner stays with the project for as long as it exists.', 'FORBIDDEN']
        if (signerMachine.agentsOnly) return ['This machine runs agents only, so it can’t act for you. Leave from one of your other machines.', 'FORBIDDEN']
        return null
      }
      if (target.role === 'owner') return ['The project owner can’t be removed', 'FORBIDDEN']
      if (!['owner', 'admin'].includes(signer.role)) return ['Only the owner or an admin can remove people', 'FORBIDDEN']
      if (!mayRemove(target)) return ['Only the owner can remove someone who is or was an admin', 'FORBIDDEN']
      return null
    }
    case 'machine.remove': {
      const machine = membership.machines.find(entry => entry.id === record.subject)
      if (!machine) return ['That machine is not a current member of this project', 'NOT_FOUND']
      if (machine.id === record.signer) return ['A machine can’t remove itself. Remove it from another of your machines, or ask an admin.', 'FORBIDDEN']
      const target = person(machine.personId)
      if (target.id !== signer.id && !mayRemove(target)) return ['Only that person’s other machines, the owner, or an admin removing a member’s machine can remove it', 'FORBIDDEN']
      return null
    }
    case 'member.role': {
      const target = person(record.subject)
      if (signer.role !== 'owner') return ['Only the owner can change roles', 'FORBIDDEN']
      if (!target) return ['That person is not a current member of this project', 'NOT_FOUND']
      if (target.role === 'owner') return ['The owner’s role never changes', 'FORBIDDEN']
      if (record.replaces !== target.roleRecord) return ['That person’s role changed since this machine last synced. Retry.', 'STALE_UPDATE']
      return null
    }
    case 'agent.name':
      if (record.machineId !== record.signer || record.subject !== actorId(signer.id, record.harness)) return ['A machine names only its own person’s agents', 'FORBIDDEN']
      return null
    case 'profile':
      return record.subject === signer.id ? null : ['A machine sets only its own person’s profile', 'FORBIDDEN']
    default:
      return ['Admissions enter only through an approved join request', 'FORBIDDEN']
  }
}
