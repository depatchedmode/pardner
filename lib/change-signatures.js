import { createHash, randomBytes } from 'node:crypto'
import { getBackend, getObjectId } from '@automerge/automerge'
import { parseAutomergeUrl, stringifyAutomergeUrl } from '@automerge/automerge-repo'
import { machineIdentity, verify } from './machine-key.js'

// Signed changes (docs/PARDNER-TRUST-DESIGN.md, section 3). A machine signs every Automerge change it makes:
// Ed25519 over CHANGE_DOMAIN ‖ the project ID's 32 raw bytes ‖ Automerge's raw 32-byte change hash. All three
// parts have fixed lengths, so no separator is needed. The signer is read from the change's actor ID, never from
// anything stored beside the signature.

export const CHANGE_DOMAIN = 'pardner/change/v1'
const SIGNATURES_DOCUMENT_DOMAIN = 'pardner/signatures-document/v1'
/** The layout of the signature document: 256 shard maps keyed by the first byte of the change hash. */
export const SIGNATURES_VERSION = 1
const HEX32 = /^[a-f0-9]{64}$/
const ACTOR = /^[a-f0-9]{48}$/
export const SHARDS = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'))

function changeBytes(projectId, hash) {
  if (!HEX32.test(projectId ?? '') || !HEX32.test(hash ?? '')) throw new Error('A change signature needs a project ID and a change hash')
  return Buffer.concat([Buffer.from(projectId, 'hex'), Buffer.from(hash, 'hex')])
}

/** The 64-byte signature of change `hash` in `projectId` by `key`. Ed25519 is deterministic: the same inputs give the same bytes. */
export function signChange(key, projectId, hash) {
  return new Uint8Array(key.sign(CHANGE_DOMAIN, changeBytes(projectId, hash)))
}

export function verifyChange(publicKey, projectId, hash, signature) {
  if (!(signature instanceof Uint8Array) || signature.length !== 64) return false
  try { return verify(publicKey, CHANGE_DOMAIN, changeBytes(projectId, hash), signature) } catch { return false }
}

/**
 * A fresh actor ID for one load of one document by `key`'s machine: the machine ID's raw 16-byte digest, then 8
 * random bytes. Two loads never share an actor, so a restored backup and its original, or two handles in one
 * process, never reuse an actor and sequence number.
 */
export function machineActor(key) {
  return Buffer.concat([key.actorIdPrefix, randomBytes(8)]).toString('hex')
}

/** The machine digest an actor ID claims (32 hex characters), or null for an actor that is not machine-prefixed. */
export function actorPrefix(actor) {
  return typeof actor === 'string' && ACTOR.test(actor) ? actor.slice(0, 32) : null
}

/** The actor prefix of the machine holding `publicKey`. */
export function machinePrefix(publicKey) {
  return machineIdentity(publicKey).actorIdPrefix.toString('hex')
}

/**
 * The signature document's URL, derived from the project ID alone: every peer computes the same one, so no member
 * can point a project at another signature document, and no field in the board names it.
 */
export function signaturesDocumentUrl(projectId) {
  if (!HEX32.test(projectId ?? '')) throw new Error('A signature document needs a project ID')
  const id = createHash('sha256').update(SIGNATURES_DOCUMENT_DOMAIN).update(Buffer.from(projectId, 'hex')).digest().subarray(0, 16)
  return stringifyAutomergeUrl(new Uint8Array(id))
}

export const signaturesDocumentId = projectId => parseAutomergeUrl(signaturesDocumentUrl(projectId)).documentId

/**
 * The signature document as its creator makes it: every shard exists from the first change, so no two writers
 * ever create one shard concurrently and hide each other's entries.
 */
export function createSignaturesData() {
  return { v: SIGNATURES_VERSION, ...Object.fromEntries(SHARDS.map(shard => [shard, {}])) }
}

export const shardOf = hash => hash.slice(0, 2)
export const isChangeHash = value => typeof value === 'string' && HEX32.test(value)
/** At most this many concurrent values are read for one shard or one entry; a valid signature needs only one. */
export const MAX_CONCURRENT_VALUES = 8

/**
 * Whether `value`, read from an Automerge document, is a map. Lists, text, counters, byte arrays, dates and
 * immutable strings are not: any member can write any of them where a map belongs.
 */
export function isMapValue(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof getObjectId(value) === 'string'
}

/**
 * Every well-formed value stored for `hash` in the current state of the signature document, including concurrent
 * ones: any that verifies counts. Only a change hash is looked up, only map shards are read (one, or a few written
 * concurrently), only 64-byte binary values are returned, and at most a few concurrent values are read at each
 * step, so a member cannot make reading the document expensive. Values are read with their types from Automerge,
 * so nothing stored in their place (a list, text, a counter, a scalar) is mistaken for a shard or a signature.
 */
export function storedSignatures(doc, hash) {
  if (!isChangeHash(hash) || !doc) return []
  const backend = getBackend(doc)
  const values = []
  for (const [type, shard] of backend.getAll('_root', shardOf(hash)).slice(0, MAX_CONCURRENT_VALUES)) {
    if (type !== 'map') continue
    for (const [kind, value] of backend.getAll(shard, hash).slice(0, MAX_CONCURRENT_VALUES)) {
      if (kind === 'bytes' && value instanceof Uint8Array && value.length === 64) values.push(value)
      if (values.length >= MAX_CONCURRENT_VALUES) return values
    }
  }
  return values
}
