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

/**
 * Whether `value`, read from an Automerge document, is a map. Lists, text, counters, byte arrays, dates and
 * immutable strings are not: any member can write any of them where a map belongs.
 */
export function isMapValue(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof getObjectId(value) === 'string'
}

/**
 * The map objects among the concurrent values of one shard key, oldest first, as Automerge lists them (the winner
 * last). Every one is read: a signature can sit in any of them. Values are read with their types, so a list, text,
 * a counter or a scalar written where a shard belongs is never mistaken for one.
 */
export function shardMaps(doc, shard) {
  return getBackend(doc).getAll('_root', shard).filter(([type]) => type === 'map').map(([, objId]) => objId)
}

/** Every distinct 64-byte binary value stored for `hash` in the shard maps `maps`, concurrent values included. */
export function entryValues(doc, maps, hash) {
  const backend = getBackend(doc), values = []
  for (const map of maps) {
    for (const [kind, value] of backend.getAll(map, hash)) {
      if (kind === 'bytes' && value instanceof Uint8Array && value.length === 64 && !values.some(held => Buffer.from(held).equals(value))) values.push(value)
    }
  }
  return values
}

/**
 * Every well-formed value stored for `hash` in the current state of the signature document: every concurrent shard
 * map and every concurrent value is read, so any member's write can add a value but never hide a valid one. Only a
 * change hash is looked up and only 64-byte binary values are returned. A runtime reads through a SignatureReader,
 * which reads a shard's concurrent values once per change to that shard key rather than on every lookup.
 */
export function storedSignatures(doc, hash) {
  if (!isChangeHash(hash) || !doc) return []
  return entryValues(doc, shardMaps(doc, shardOf(hash)), hash)
}

/**
 * Reads one signature document for a runtime. Automerge returns every concurrent value at a key in one call, with
 * no way to count them first, so the list of a shard's maps is read once and kept until a change to that shard key
 * (a patch at its path, noted with changed()) makes it stale. Entry values are read per lookup.
 */
export class SignatureReader {
  constructor(handle) {
    this.handle = handle
    this.maps = new Map()
  }

  /** A change touched shard key `shard` itself, or (with no argument) the document was replaced. */
  changed(shard) {
    if (shard === undefined) this.maps.clear()
    else this.maps.delete(shard)
  }

  mapsOf(shard) {
    if (!this.maps.has(shard)) this.maps.set(shard, shardMaps(this.handle.doc(), shard))
    return this.maps.get(shard)
  }

  /** Whether `shard` holds anything but exactly one map: concurrent maps, or a value that is not a map at all. */
  conflicted(shard) {
    return this.mapsOf(shard).length !== 1 || !isMapValue(this.handle.doc()[shard])
  }

  values(hash) {
    if (!isChangeHash(hash)) return []
    return entryValues(this.handle.doc(), this.mapsOf(shardOf(hash)), hash)
  }

  /**
   * Every entry of every map of `shard`: `[hash, values]`, each with its distinct 64-byte values. What a writer
   * keeps when it makes the shard into one map again.
   */
  entries(shard) {
    const doc = this.handle.doc(), backend = getBackend(doc), maps = this.mapsOf(shard), hashes = new Set()
    for (const map of maps) for (const key of backend.keys(map)) if (isChangeHash(key) && shardOf(key) === shard) hashes.add(key)
    return [...hashes].sort().map(hash => [hash, entryValues(doc, maps, hash)]).filter(([, values]) => values.length)
  }
}
