import { createHash, randomBytes } from 'node:crypto'
import { getBackend, getHeads, getObjectId } from '@automerge/automerge'
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

/**
 * Candidates kept for one change while its signer cannot be established (lib/attribution.js mergedShard): at most
 * this many distinct values, as a list at the change's key, in the order keptCandidates gives. Ed25519 is
 * deterministic, so a genuine writer writes one value for a change; more than one means others were written beside it.
 * A genuine signature is dropped from the shared document only when this many values rank before it: values that
 * verify under as many other keys that may be the change's signer (one each), or, for a machine not known yet, values
 * no known key verifies. Its writer puts it back when it sees its entry missing (at start-up and on the patch); the
 * change is pending meanwhile.
 */
export const MAX_CANDIDATES = 16

/**
 * At most this many verifications (one stored value under one key) are made for one change in one pass of checking:
 * one slice of the background work, or one write into the signature document. About 3.5 ms of Ed25519 at the ~110 µs
 * a verification took in the signing spike. A change with more values is examined further in the next pass, from where
 * it stopped (lib/attribution.js ChangeAttribution.verifies), so values stored ahead of a genuine signature delay it but
 * never hide it, and never hold the event loop.
 */
export const CANDIDATES_PER_PASS = 32

/**
 * The candidates kept for a change while its signer cannot be established, at most MAX_CANDIDATES, in this order: the
 * value this peer cached (`held`); then, for each key in `possible` (the known machines that may be its signer: every
 * known machine while the change has not arrived, those sharing its actor prefix once it has), one value that
 * verifies under it; then the values no known key verifies (a machine not known yet may have made them); then the rest:
 * further values under one key, and values made by a known machine that cannot be the signer (`others`). Each part is
 * in byte order. `values` are distinct and in byte order; `verify(publicKey, value)` checks one value under one key.
 */
export function keptCandidates({ values, held = null, possible = [], others = [], verify }) {
  const kept = [], rest = [], unknown = []
  const isHeld = value => held && Buffer.from(held).equals(value)
  if (held && values.some(isHeld)) kept.push(values.find(isHeld))
  const placed = new Set(kept)
  for (const publicKey of possible) {
    const value = values.find(candidate => !placed.has(candidate) && verify(publicKey, candidate))
    if (value) { kept.push(value); placed.add(value) }
  }
  for (const value of values) {
    if (placed.has(value)) continue
    if ([...possible, ...others].some(publicKey => verify(publicKey, value))) rest.push(value)
    else unknown.push(value)
  }
  return [...kept, ...unknown, ...rest].slice(0, MAX_CANDIDATES)
}

/**
 * Every distinct 64-byte binary value stored for `hash` in the shard maps `maps`: every concurrent value, and every
 * position of a candidate list held there, distinct by content and in the order stored. Nothing stored is skipped, so
 * no number of copies ahead of a genuine signature hides it; ranking (keptCandidates) and verification
 * (CANDIDATES_PER_PASS) come after. Reading is linear in what is stored, as applying the change that stored it was.
 */
export function entryValues(doc, maps, hash) {
  const backend = getBackend(doc), values = [], seen = new Set()
  const add = (kind, value) => {
    if (kind !== 'bytes' || !(value instanceof Uint8Array) || value.length !== 64) return
    const key = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
    if (!seen.has(key)) { seen.add(key); values.push(value) }
  }
  for (const map of maps) {
    for (const [kind, value] of backend.getAll(map, hash)) {
      if (kind === 'list') {
        const length = backend.length(value)
        for (let index = 0; index < length; index++) for (const [itemKind, item] of backend.getAll(value, index)) add(itemKind, item)
      } else add(kind, value)
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
 * (a patch at its path, noted with changed()) makes it stale. A change's values are read once for each state of the
 * document, however often they are looked up: a write inside a concurrent map that is not the winner produces no
 * patch, so they are kept by the document's heads, not by patches.
 */
export class SignatureReader {
  constructor(handle) {
    this.handle = handle
    this.maps = new Map()
    this.cached = new Map()
    this.cachedHeads = null
  }

  /** A change touched shard key `shard` itself, or (with no argument) the document was replaced. */
  changed(shard) {
    if (shard === undefined) this.maps.clear()
    else this.maps.delete(shard)
    this.cached.clear()
    this.cachedHeads = null
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
    const doc = this.handle.doc(), heads = getHeads(doc).join(',')
    if (heads !== this.cachedHeads) { this.cached.clear(); this.cachedHeads = heads }
    let values = this.cached.get(hash)
    if (!values) {
      values = entryValues(doc, this.mapsOf(shardOf(hash)), hash)
      if (this.cached.size >= 50000) this.cached.clear()
      this.cached.set(hash, values)
    }
    return values
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
