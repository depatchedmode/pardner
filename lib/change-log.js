import { getBackend, getChangesMetaSince, readBundle, saveBundle } from '@automerge/automerge'
import { canonical, digest } from './workspace-schema.js'
import { checkWrites } from './operation-writes.js'
import { BoardAt } from './board-history.js'

// What each board change wrote (docs/PARDNER-TRUST-DESIGN.md, section 3). Activity is a log of changes, as a git log
// is a log of commits: every entry is derived from one change, and its signer is the verdict for that same change.
// Nothing shown under a signer is read from a later state of the board, and nothing is selected through an ID
// written inside the content.
//
// The derivation, precisely. Let B be the set of the board's changes and, for a change c, ops(c) its decoded
// operations; the i-th has the ID (startOp(c) + i)@actor(c). A top-level object is one that some change in B made with
// an operation on `_root`; its name is that operation's key.
//   Structure, from ops(c) only: which keys of which top-level maps c wrote (put or made a value at), which it deleted
//   or incremented, which objects outside c it wrote into, and what it wrote at `_root`.
//   Content, from Automerge only: the value at each such key is what Automerge itself reads as of c, with getAll,
//   keys and length at the heads [hash(c)] (test/automerge-history-reads.test.js pins which reads are faithful at a
//   past head). That state holds c and its ancestors and nothing later, and Automerge refuses a change whose
//   operation names an object no change has made yet, so an object c made holds exactly what c put there. A value is
//   accepted only as plain JSON: maps, lists, strings, booleans, null, finite numbers JSON holds exactly, at most
//   MAX_DEPTH deep, each key and list element with exactly one value. Keys are ordinary data, whatever their name
//   (`__proto__` included): objects are built with defineProperty, never through a setter.
//   read(c) classifies each key c wrote:
//     - a map at key K of a top-level object named `operations` is an event, with Automerge's value as of c;
//     - a map at key K of one named `membership` is a record, likewise;
//     - a value at a key of another of the board's top-level maps is a side effect (Pardner writes these), which
//       lib/operation-writes.js compares with the writes its event implies;
//     - anything else is unusual: an operation on `_root` (outside the creating change, or remaking `membership`
//       beside records), a deletion, an increment, a write into an object some other change made, a write into a
//       top-level object of an unknown name, or a value that is not a map where an event or record belongs.
//   kind(c) = creation      if c has no dependencies and wrote records and no event (the board's first change,
//                           with its genesis record; a second such change in B flags every creation),
//             operation     if c wrote exactly one event, it is well-formed (isEvent), and no record,
//             records       if c wrote no event and at least one record,
//             unrecognised  otherwise: also when a value it wrote cannot be read exactly as plain JSON (several
//                           values at one key in c's own state, a counter, bytes, a date, text, a number JSON
//                           cannot hold, nesting too deep), when c cannot be decoded, and when it is larger than
//                           this reads.
//   The entry for c is { hash(c), kind(c), its event as (K, value) or its records as [(K, value)], time(c), the keys
//   of its side effects, how they differ from what its event implies, the unusual operations it made }, and its
//   signer is the verdict for hash(c). Both are functions of c and of its ancestors, so every peer holding c derives
//   the same entry, whenever c reached it, and the entry is plain data: stored and read back, it is the same entry.
// The view (lib/activity.js) then groups entries only where their content is proven equal, and adds flags from the
// entries and the verdicts; it reads no content from anywhere else.

/**
 * Bumped when read() would derive a different entry from the same change: stored entries of other versions are read
 * again (and left where they are). 3: every list capped in an entry says how many it left out, as data. 4: an
 * operation entry is checked against the board as of its change's dependencies, and carries its one reading (`shows`).
 * 5: a value one operation wrote twice at one key (a retried request) is read as either of its values.
 */
export const DERIVATION_VERSION = 5
/** A change with more operations than this is not decoded: it is listed for review as too large to read. */
export const MAX_CHANGE_OPS = 20000
/** Likewise a change whose encoded bytes exceed this. */
export const MAX_CHANGE_BYTES = 8 * 1024 * 1024
/** Values nested deeper than this are not read: the change is unrecognised. */
export const MAX_DEPTH = 32
/** At most this many unusual operations of each sort are described per change; the rest are counted. */
const MAX_DETAIL = 16
/** At most this many written values have the objects inside them indexed (`nested`); the rest are counted. */
const MAX_NESTED = 1000
/** The positive counts among `values`, or null when there are none: how many items capped lists left out. */
const counts = values => {
  const kept = Object.entries(values).filter(([, count]) => count > 0)
  return kept.length ? Object.fromEntries(kept) : null
}
/** The board's top-level maps that Pardner operations write side effects into. */
export const SIDE_EFFECT_MAPS = new Set(['actors', 'tasks', 'taskFields', 'branchBases', 'mergedBranches', 'comments', 'commentBodies', 'deletedComments',
  'goals', 'goalFields', 'veins', 'veinFields', 'veinLinks', 'supersededRevisions', 'mentions', 'operationRequests', 'readReceipts'])
export const EVENT_TYPES = new Set(['actor.register', 'task.create', 'task.update', 'task.resolve', 'task.handoff', 'comment.add', 'comment.edit', 'comment.resolve',
  'comment.delete', 'read.mark', 'task.link-commit', 'task.branch', 'task.merge', 'goal.create', 'goal.update', 'goal.resolve', 'vein.create',
  'vein.update', 'vein.resolve', 'task.link-vein', 'task.unlink-vein', 'task.link-issue', 'task.unlink-issue'])
const IDENTIFYING = ['operationId', 'requestId', 'type', 'actorId', 'timestamp', 'fingerprint', 'replicaId']
export const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
/** `value[key]` when it is `value`'s own property, else undefined: a key named like an inherited property is only data. */
export const ownValue = (value, key) => (value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined)
/** Sets `key` on `target` as an own data property, whatever its name: never through a setter such as __proto__. */
export function define(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  return target
}

/** The largest time JavaScript dates hold, in milliseconds either side of 1970. */
const MAX_DATE_MS = 8.64e15
/** Whether `seconds` (a change's time) is a time a date can show. */
export const isShowableTime = seconds => typeof seconds === 'number' && Number.isFinite(seconds) && Math.abs(seconds * 1000) <= MAX_DATE_MS
/** A change's time as an ISO string, or null when it is no time a date can show. */
export const isoOfSeconds = seconds => (isShowableTime(seconds) ? new Date(seconds * 1000).toISOString() : null)
/** Whether `value` is a timestamp string a date can show. */
export const isShowableIso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))

class Unreadable extends Error {}

/**
 * Automerge's value `full` (as getAll returns it) read at `heads`, as plain JSON, or Unreadable when it is not
 * exactly that. Every key and list element is read with getAll, so a key holding several values is found.
 */
function readValue(backend, full, heads, depth) {
  if (depth > MAX_DEPTH) throw new Unreadable('nested too deeply')
  const [type, value] = full
  switch (type) {
    case 'str': case 'boolean': return value
    case 'null': return null
    case 'int': case 'uint': case 'f64':
      if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) && (type === 'f64' || Number.isSafeInteger(value))) return value
      throw new Unreadable('a number JSON cannot hold exactly')
    case 'map': {
      const out = {}
      for (const key of backend.keys(value, heads)) define(out, key, readAt(backend, value, key, heads, depth + 1))
      return out
    }
    case 'list': {
      const out = [], length = backend.length(value, heads)
      for (let index = 0; index < length; index++) out.push(readAt(backend, value, index, heads, depth + 1))
      return out
    }
    default: throw new Unreadable(`a ${type} value, which is not plain data`)
  }
}

function readAt(backend, obj, prop, heads, depth) {
  const values = backend.getAll(obj, prop, heads)
  if (values.length !== 1) throw new Unreadable(values.length ? 'several values at one key' : 'a key with no value')
  return readValue(backend, values[0], heads, depth)
}

/** The ID of the operation that wrote a value getAll returned (an object's ID is the ID of the operation that made it). */
const writerOf = full => (full.length === 2 ? full[1] : full[2])

/**
 * Reads, as of one change, what it wrote at `key` of top-level map `mapObj`. `{ kept: false }` when no value it wrote
 * is there in its own state (it deleted its own write), else the value, or why it cannot be read exactly.
 */
function readWrite(backend, mapObj, key, heads, isOwn) {
  const values = backend.getAll(mapObj, key, heads)
  if (!values.some(full => isOwn(writerOf(full)))) return { kept: false }
  if (values.length > 1) return { kept: true, reason: 'several values at one key' }
  try { return { kept: true, full: values[0], value: readValue(backend, values[0], heads, 1) } } catch (error) {
    if (error instanceof Unreadable) return { kept: true, full: values[0], reason: error.message }
    throw error
  }
}

/**
 * Where object `obj` sat as of `heads`: its path, and the value of a top-level map that holds it (the register or
 * record it is part of), so a write into it can be told apart from a write into a sibling. Null parts when not known.
 */
function placeOf(backend, obj, heads) {
  let path = null
  try { path = backend.objInfo(obj, heads)?.path ?? null } catch { path = null }
  if (!Array.isArray(path) || path.length < 2) return { path: path?.map(String) ?? null, container: null }
  const objects = (list, prop) => list.flatMap(id => backend.getAll(id, prop, heads).filter(full => full.length === 2).map(full => full[1]))
  for (const container of objects(objects(['_root'], path[0]), path[1])) {
    let frontier = [container]
    for (const prop of path.slice(2)) { frontier = objects(frontier, prop); if (frontier.length > 16) break }
    if (container === obj || frontier.includes(obj)) return { path: path.slice(0, 8).map(String), container }
  }
  return { path: path.slice(0, 8).map(String), container: null }
}

/**
 * Whether `event` has the shape Pardner writes for an operation event: the strings that identify it, a known type,
 * a timestamp a date can show, and the containers it renders from, each its own property. Only the shape: what it
 * says is shown as written.
 */
export function isEvent(event) {
  const own = field => Object.hasOwn(event, field)
  return isPlainObject(event) && IDENTIFYING.every(field => own(field) && typeof event[field] === 'string')
    && EVENT_TYPES.has(event.type) && isShowableIso(event.timestamp)
    && own('payload') && isPlainObject(event.payload) && own('result') && isPlainObject(event.result)
    && own('recordIds') && Array.isArray(event.recordIds) && event.recordIds.every(id => typeof id === 'string')
    && own('changes') && Array.isArray(event.changes) && event.changes.every(isPlainObject)
    && (!own('taskId') || typeof event.taskId === 'string')
}

/** Whether an event's operation ID is the one its own request ID and content give (lib/workspace-commands.js prepareOperation). */
export function eventIdHolds(event) {
  const fingerprint = digest(canonical({ type: event.type, actorId: event.actorId, payload: event.payload }))
  return event.fingerprint === fingerprint && event.operationId === `op-${digest(canonical([event.requestId, event.fingerprint]))}`
}

/**
 * The entry for one decoded change (see the derivation above), reading its values through `backend`, a document
 * that holds it. `roots` maps each top-level object made by an earlier change to `{ key, type }`; the top-level
 * objects this change makes are returned in `roots` for the next.
 */
export function readChange(change, roots, backend) {
  const { actor, startOp, ops, hash, deps = [] } = change
  const heads = [hash]
  const isOwn = opId => {
    const at = typeof opId === 'string' ? opId.indexOf('@') : -1
    const counter = at > 0 ? Number(opId.slice(0, at)) : NaN
    return at > 0 && opId.slice(at + 1) === actor && counter >= startOp && counter < startOp + ops.length
  }
  const made = [], ownRoots = new Map(), parents = new Map(), written = new Map(), foreign = new Map(), replaced = []
  const unusual = { count: 0, root: [], deleted: [], foreign: [], unknownMaps: [], notMaps: [], other: [] }
  const note = (list, item) => { unusual.count++; if (list.length < MAX_DETAIL && !list.some(entry => canonical(entry) === canonical(item))) list.push(item) }
  const creation = deps.length === 0
  const rootWrites = new Map()
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index], opId = `${startOp + index}@${actor}`
    const makes = String(op.action).startsWith('make')
    if (op.obj === '_root') {
      // A top-level object, whoever made it, is read as one of the board's maps, never as content of this change.
      if (makes) {
        const type = op.action === 'makeMap' ? 'map' : 'other'
        made.push([opId, String(op.key), type])
        ownRoots.set(opId, { key: String(op.key), type })
      }
      rootWrites.set(String(op.key), op.action)
      if (!creation) note(unusual.root, { key: String(op.key), action: op.action })
      continue
    }
    if (makes) parents.set(opId, op.obj)
    const root = roots.get(op.obj) ?? ownRoots.get(op.obj)
    if (!root) {
      // Inside an object this change made: content, read through Automerge below. Inside one another change made:
      // unusual, and every such object is kept (lib/workspace-runtime.js currentWriters names each change that altered it).
      if (!parents.has(op.obj)) { unusual.count++; foreign.set(op.obj, true) }
      continue
    }
    const key = String(op.key)
    if (root.type !== 'map') { note(unusual.notMaps, { map: root.key, action: op.action }); continue }
    if (op.action === 'del' || op.action === 'inc') { note(unusual.deleted, { map: root.key, key, action: op.action }); continue }
    if ((root.key === 'operations' || root.key === 'membership')) {
      if (op.action !== 'makeMap') { note(unusual.other, { map: root.key, key, action: op.action }); continue }
      if (op.pred?.length) replaced.push({ map: root.key, key, pred: [...op.pred] })
    } else if (!SIDE_EFFECT_MAPS.has(root.key)) { note(unusual.unknownMaps, { map: root.key, key }); continue }
    written.set(`${op.obj}\u0000${key}`, { map: root.key, mapObj: op.obj, key })
  }
  for (const obj of foreign.keys()) unusual.foreign.push({ obj, ...placeOf(backend, obj, heads) })
  // Content: each key's value as Automerge reads it as of this change.
  const events = [], records = [], effects = [], unreadable = []
  // How many items each capped list leaves out, as data: stored and read back, an entry says the same.
  let unreadableMore = 0, nestedMore = 0
  for (const write of written.values()) {
    const read = readWrite(backend, write.mapObj, write.key, heads, isOwn)
    if (!read.kept) { note(unusual.deleted, { map: write.map, key: write.key, action: 'not kept' }); continue }
    if (read.reason) { if (unreadable.length < MAX_DETAIL) unreadable.push({ map: write.map, key: write.key, reason: read.reason }); else unreadableMore++; continue }
    const isMap = read.full[0] === 'map'
    if (write.map === 'operations' || write.map === 'membership') {
      ;(write.map === 'operations' ? events : records).push({ key: write.key, value: read.value, objId: isMap ? read.full[1] : null })
    } else effects.push({ map: write.map, key: write.key, value: read.value, objId: isMap || read.full[0] === 'list' ? read.full[1] : null })
  }
  // A records change may make `membership` again first: a write-back after it was vandalised. It writes nothing else:
  // a side effect beside records is unusual. The board's creation writes only what a new board holds (creationOnly).
  if (!creation && records.length && !events.length) {
    unusual.root = unusual.root.filter(entry => !(entry.key === 'membership' && entry.action === 'makeMap'))
    for (const { map, key } of effects) note(unusual.other, { map, key, action: 'beside records' })
    unusual.count = unusual.root.length + unusual.deleted.length + unusual.foreign.length + unusual.unknownMaps.length + unusual.notMaps.length + unusual.other.length
  }
  const registered = creation ? creationOnly(effects, rootWrites, note, unusual) : []
  const plainRecords = records.every(record => isPlainObject(record.value))
  let kind
  if (unreadable.length) kind = 'unrecognised'
  else if (creation && records.length && !events.length && plainRecords) kind = 'creation'
  else if (creation) kind = 'unrecognised'
  else if (events.length === 1 && !records.length && isEvent(events[0].value)) kind = 'operation'
  else if (!events.length && records.length && plainRecords) kind = 'records'
  else kind = 'unrecognised'
  const entry = { v: DERIVATION_VERSION, hash, kind, time: isShowableTime(change.time) ? change.time : null, ops: ops.length }
  if (!isShowableTime(change.time)) entry.badTime = true
  if (made.length) entry.roots = made
  if (effects.length) entry.effects = effects.map(({ map, key }) => [map, key])
  // The objects this change made inside each value it wrote at a top-level map key, by operation counter, so a later
  // write into one is known to alter that value (objInfo gives no path inside a value that lost to a concurrent one).
  const nested = []
  for (const { map, key, objId } of effects) {
    if (!objId) continue
    const inside = new Set([objId])
    for (const [child, parent] of parents) if (inside.has(parent)) inside.add(child)
    inside.delete(objId)
    if (!inside.size) continue
    if (nested.length < MAX_NESTED) nested.push([map, key, Number(objId.split('@')[0]), [...inside].map(id => Number(id.split('@')[0]))])
    else nestedMore++
  }
  if (nested.length) entry.nested = nested
  if (kind === 'operation') {
    const [{ key, value: event, objId }] = events
    // The objects of the event's own tree, by operation counter, so a later write into one is known to alter it.
    const own = new Set([objId])
    for (const [child, parent] of parents) if (own.has(parent)) own.add(child)
    // Whether its operation ID is the one its own content gives, and whether its side effects are exactly the writes
    // its event implies: facts about the change, computed once.
    // ... and its one reading, which every renderer shows. What its event says about the board when it ran is read
    // as of its own dependencies: the state its write path read.
    const { mismatch, shows } = checkWrites(event, effects, { before: new BoardAt(backend, deps) })
    Object.assign(entry, { key, event, shows, idHolds: eventIdHolds(event), eventObjects: [...own].map(id => Number(id.split('@')[0])) })
    if (mismatch.length) entry.mismatch = mismatch
  }
  if (kind === 'records' || kind === 'creation') entry.records = records.map(({ key, value }) => ({ key, record: value }))
  if (kind === 'creation' && registered.length) entry.registered = registered
  if (kind === 'unrecognised') {
    // What it wrote, as Automerge reads it, so review shows it under its own signer.
    const more = counts({ events: events.length - MAX_DETAIL, records: records.length - MAX_DETAIL, unreadable: unreadableMore })
    entry.wrote = { events: events.slice(0, MAX_DETAIL).map(({ key, value }) => ({ key, value })),
      records: records.slice(0, MAX_DETAIL).map(({ key, value }) => ({ key, value })),
      ...(unreadable.length ? { unreadable } : {}), ...(ops.length ? {} : { empty: true }), ...(more ? { more } : {}) }
  }
  if (replaced.length) entry.replaced = replaced.slice(0, MAX_DETAIL)
  const more = counts({ replaced: replaced.length - MAX_DETAIL, nested: nestedMore })
  if (more) entry.more = more
  if (unusual.count) entry.unusual = Object.fromEntries(Object.entries(unusual).filter(([, list]) => (Array.isArray(list) ? list.length : list)))
  return entry
}

/** The root keys the board's creation writes (lib/workspace-schema.js createWorkspaceData), each with its kind of value. */
const CREATION_ROOT = { schemaVersion: 'set', workspaceId: 'set', name: 'set', created_at: 'set', membership: 'makeMap', actors: 'makeMap', operations: 'makeMap',
  ...Object.fromEntries([...SIDE_EFFECT_MAPS].filter(map => map !== 'actors').map(map => [map, 'makeMap'])) }

/**
 * The board's creation writes the root keys a new board holds, its genesis record, and the Actors it starts with;
 * anything else it writes is unusual. Returns the Actors it registered, as written.
 */
function creationOnly(effects, rootWrites, note, unusual) {
  for (const [key, action] of rootWrites) if (!Object.hasOwn(CREATION_ROOT, key) || CREATION_ROOT[key] !== action) note(unusual.other, { key, action, beside: 'creation' })
  const registered = []
  for (const { map, key, value } of effects) {
    if (map === 'actors' && isActorRecord(value) && value.id === key) registered.push(value)
    else note(unusual.other, { map, key, action: 'beside creation' })
  }
  return registered
}

const isActorRecord = value => isPlainObject(value) && canonical(Object.keys(value).sort()) === canonical(['displayName', 'handle', 'id', 'kind'])
  && ['id', 'handle', 'displayName'].every(field => typeof value[field] === 'string') && ['human', 'agent'].includes(value.kind)

/** The entry for a change too large to decode: listed for review with what is known without reading it. */
export function oversizedEntry(meta, bytes = null) {
  return { v: DERIVATION_VERSION, hash: meta.hash, kind: 'unrecognised', time: isShowableTime(meta.time) ? meta.time : null, ...(isShowableTime(meta.time) ? {} : { badTime: true }),
    ops: meta.maxOp - meta.startOp + 1, oversized: true, ...(bytes ? { bytes } : {}) }
}

/** The entry for a change that could not be decoded or read: listed for review, with why. One change never stops the rest. */
export function unreadableEntry(meta, error) {
  return { v: DERIVATION_VERSION, hash: meta.hash, kind: 'unrecognised', time: isShowableTime(meta.time) ? meta.time : null, ...(isShowableTime(meta.time) ? {} : { badTime: true }),
    ops: meta.maxOp - meta.startOp + 1, wrote: { events: [], records: [], unreadable: [{ reason: `could not be read: ${String(error?.message ?? error).slice(0, 200)}` }] } }
}

/** Whether a stored entry has the shape this version derives. */
export function isStoredEntry(entry, hash) {
  return isPlainObject(entry) && entry.v === DERIVATION_VERSION && entry.hash === hash && ['creation', 'operation', 'records', 'unrecognised'].includes(entry.kind)
    && (entry.roots === undefined || (Array.isArray(entry.roots) && entry.roots.every(root => Array.isArray(root) && root.length === 3 && root.every(part => typeof part === 'string'))))
}

/**
 * Derives and keeps the entry of every board change: incrementally, in slices bounded by operations and time, never by
 * a count of changes, and resumable, since each entry is stored under its change hash (which never changes) as it is
 * derived. A reopened replica reads only the changes it has no entry for. `store` is the signature cache (or null:
 * the standalone service keeps entries in memory only).
 */
export class ChangeLog {
  constructor({ board, store = null, opsPerSlice = 2000, msPerSlice = 10, now = () => performance.now() }) {
    Object.assign(this, { board, store, opsPerSlice, msPerSlice, now })
    this.entries = new Map()
    this.roots = new Map()
    // Changes with no entry yet, in the order they were indexed (causal order), with their operation counts: the
    // ones before `cursor` are done.
    this.pending = []
    this.cursor = 0
    this.pendingOps = 0
    this.queued = new Set()
    // Changes decoded in a bundle but not derived yet, because a slice ran out of time first.
    this.decoded = new Map()
    this.unsaved = []
    this.version = 0
  }

  /** Loads stored entries for the changes `metas` lists; returns the hashes still to derive. */
  load(metas) {
    const wanted = new Set(metas.map(meta => meta.hash))
    let rows = []
    try { rows = this.store?.derivedEntries?.(wanted) ?? [] } catch { rows = [] }
    for (const [hash, entry] of rows) {
      if (!wanted.has(hash) || !isStoredEntry(entry, hash)) continue
      this.entries.set(hash, entry)
      for (const [objId, key, type] of entry.roots ?? []) this.roots.set(objId, { key, type })
    }
    this.note(metas)
    this.version++
  }

  /** Queues every change in `metas` that has no entry. */
  note(metas) {
    for (const meta of metas) {
      if (this.entries.has(meta.hash) || this.queued.has(meta.hash)) continue
      this.queued.add(meta.hash)
      const ops = meta.maxOp - meta.startOp + 1
      this.pending.push({ hash: meta.hash, ops, meta })
      this.pendingOps += ops
    }
  }

  get complete() { return this.cursor >= this.pending.length }
  get remaining() { return this.pending.length - this.cursor }

  /**
   * Derives pending changes, in order, one at a time, until the slice's operation budget or time budget is used
   * (always at least one change); both are checked after every change. A change too large to decode, or one that
   * cannot be decoded or read, becomes an entry of its own. Returns how many were derived.
   */
  slice({ ops: budget = this.opsPerSlice, ms = this.msPerSlice } = {}) {
    const started = this.now()
    let derived = 0, used = 0, backend = null
    while (!this.complete && (derived === 0 || (used < budget && this.now() - started < ms))) {
      const item = this.pending[this.cursor]
      if (item.ops <= MAX_CHANGE_OPS && !this.decoded.has(item.hash)) this.decodeFrom(this.cursor, budget)
      const change = this.decoded.get(item.hash)
      this.decoded.delete(item.hash)
      let entry
      if (item.ops > MAX_CHANGE_OPS) entry = oversizedEntry(item.meta)
      else if (change.oversized) entry = oversizedEntry(item.meta, change.bytes)
      else if (change.error) entry = unreadableEntry(item.meta, change.error)
      else {
        backend ??= getBackend(this.board.doc())
        try { entry = readChange(change, this.roots, backend) } catch (error) { entry = unreadableEntry(item.meta, error) }
      }
      this.add(entry)
      this.cursor++
      this.queued.delete(item.hash)
      this.pendingOps -= item.ops
      derived++
      used += item.ops
    }
    if (this.cursor > 1024 && this.cursor * 2 > this.pending.length) { this.pending = this.pending.slice(this.cursor); this.cursor = 0 }
    if (derived) this.version++
    return derived
  }

  /**
   * Decodes the pending changes from `start` in one bundle: up to 500 changes or `budget` operations (at least one),
   * stopping before a change too large to decode. A bundle too large in bytes, or one Automerge cannot decode, is
   * decoded one change at a time, so the change at fault is found and every other is read.
   */
  decodeFrom(start, budget) {
    const window = []
    let ops = 0
    for (let index = start; index < this.pending.length; index++) {
      const item = this.pending[index]
      if (item.ops > MAX_CHANGE_OPS || (window.length && (ops + item.ops > budget || window.length >= 500))) break
      window.push(item)
      ops += item.ops
    }
    const doc = this.board.doc()
    const one = item => {
      try {
        const bytes = saveBundle(doc, [item.hash])
        if (bytes.length > MAX_CHANGE_BYTES) return { oversized: true, bytes: bytes.length }
        return readBundle(bytes).changes.find(change => change.hash === item.hash) ?? { error: new Error('the change is not in its own bundle') }
      } catch (error) { return { error } }
    }
    let changes = null
    if (window.length > 1) {
      try {
        const bytes = saveBundle(doc, window.map(item => item.hash))
        if (bytes.length <= MAX_CHANGE_BYTES) changes = new Map(readBundle(bytes).changes.map(change => [change.hash, change]))
      } catch { changes = null }
    }
    for (const item of window) this.decoded.set(item.hash, changes?.get(item.hash) ?? one(item))
  }

  add(entry) {
    this.entries.set(entry.hash, entry)
    for (const [objId, key, type] of entry.roots ?? []) this.roots.set(objId, { key, type })
    this.unsaved.push([entry.hash, entry])
  }

  /** Stores the entries derived since the last save, in one transaction; a lost save only means deriving them again. */
  save() {
    if (!this.unsaved.length || !this.store?.addDerived) { this.unsaved.length = 0; return }
    const rows = this.unsaved.splice(0)
    try { this.store.addDerived(rows) } catch (error) { this.unsaved.unshift(...rows); throw error }
  }
}

/** Every change's entry for a whole document at once, in memory: for tests and one-off checks. */
export function deriveAll(doc) {
  const log = new ChangeLog({ board: { doc: () => doc }, opsPerSlice: Infinity, msPerSlice: Infinity })
  log.note(getChangesMetaSince(doc, []))
  while (!log.complete) log.slice()
  return log.entries
}
