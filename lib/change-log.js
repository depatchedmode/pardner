import { getChangesMetaSince, readBundle, saveBundle } from '@automerge/automerge'
import { canonical, digest } from './workspace-schema.js'

// What each board change wrote (docs/PARDNER-TRUST-DESIGN.md, section 3). Activity is a log of changes, as a git log
// is a log of commits: every entry is derived from one change, from that change's own operations, and its signer is
// the verdict for that same change. Nothing shown under a signer is read from a later state of the board, and nothing
// is selected through an ID written inside the content.
//
// The derivation, precisely. Let B be the set of the board's changes and, for a change c, ops(c) its decoded
// operations; the i-th has the ID (startOp(c) + i)@actor(c). A top-level object is one that some change in B made with
// an operation on `_root`; its name is that operation's key. An object c made itself is local to c: no operation
// outside c can name it before c exists, so its value as c wrote it is the tree c built under it from ops(c) alone.
//   read(c) classifies every operation of c:
//     - a makeMap at key K of a top-level object named `operations` is an event, with value tree(c, that map);
//     - a makeMap at key K of one named `membership` is a record, likewise;
//     - a put or make at a key of another of the board's top-level maps is a side effect (Pardner writes these);
//     - anything else is unusual: an operation on `_root` (outside the creating change, or remaking `membership`
//       beside records), a deletion, an increment, a write into an object some other change made, a write into a
//       top-level object of an unknown name, or a value that is not a map where an event or record belongs.
//   kind(c) = creation      if c has no dependencies (the board's first change; it writes the genesis record),
//             operation     if c wrote exactly one event, it is well-formed (isEvent), and no record,
//             records       if c wrote no event and at least one record,
//             unrecognised  otherwise, including a change of no operations, or one larger than this reads.
//   The entry for c is { hash(c), kind(c), its event as (K, value) or its records as [(K, value)], time(c), the
//   unusual operations it made }, and its signer is the verdict for hash(c). Both are functions of c and of which
//   objects in B are top-level, so every peer holding c derives the same entry, whenever c reached it.
// The view (lib/attribution.js, activityView) then groups entries only where their content is proven equal, and adds
// flags from the entries and the verdicts; it reads no content from anywhere else.

/** Bumped when read() would derive a different entry from the same change: stored entries of other versions are read again. */
export const DERIVATION_VERSION = 1
/** A change with more operations than this is not decoded: it is listed for review as too large to read. */
export const MAX_CHANGE_OPS = 20000
/** Likewise a change whose encoded bytes exceed this. */
export const MAX_CHANGE_BYTES = 8 * 1024 * 1024
/** At most this many unusual operations of each sort are described per change; the rest are counted. */
const MAX_DETAIL = 16
/** The board's top-level maps that Pardner operations write side effects into. */
export const SIDE_EFFECT_MAPS = new Set(['actors', 'tasks', 'taskFields', 'branchBases', 'mergedBranches', 'comments', 'commentBodies', 'deletedComments',
  'goals', 'goalFields', 'veins', 'veinFields', 'veinLinks', 'supersededRevisions', 'mentions', 'operationRequests', 'readReceipts'])
const EVENT_TYPES = new Set(['actor.register', 'task.create', 'task.update', 'task.resolve', 'task.handoff', 'comment.add', 'comment.edit', 'comment.resolve',
  'comment.delete', 'read.mark', 'task.link-commit', 'task.branch', 'task.merge', 'goal.create', 'goal.update', 'goal.resolve', 'vein.create',
  'vein.update', 'vein.resolve', 'task.link-vein', 'task.unlink-vein', 'task.link-issue', 'task.unlink-issue'])
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The value of object `objId`, made by this change, as the change wrote it: maps, lists and text built from the
 * change's own operations only. Returns `{ value, json }`, where `json` is false when the tree holds anything that is
 * not JSON (a counter, a timestamp, bytes) or a key left with two values by the change itself.
 */
function tree(local, objId, depth = 0) {
  const node = local.get(objId)
  if (!node || depth > 64) return { value: null, json: false }
  let json = true
  const scalar = entry => {
    if (entry.obj) {
      const child = tree(local, entry.obj, depth + 1)
      json &&= child.json
      return child.value
    }
    if (['counter', 'timestamp', 'bytes'].includes(entry.datatype)) json = false
    return entry.value
  }
  if (node.type === 'map') {
    const value = {}
    for (const [key, entries] of node.entries) {
      if (!entries.length) continue
      if (entries.length > 1) json = false
      value[key] = scalar(entries.at(-1))
    }
    return { value, json }
  }
  const items = node.items.filter(item => !item.deleted)
  if (node.type === 'text') return { value: items.map(item => (typeof item.value === 'string' ? item.value : '')).join(''), json }
  return { value: items.map(scalar), json }
}

/** Applies one operation on an object local to the change. */
function applyLocal(node, op, opId, value) {
  const pred = new Set(op.pred ?? [])
  if (node.type === 'map') {
    const key = String(op.key)
    const entries = (node.entries.get(key) ?? []).filter(entry => !pred.has(entry.id))
    if (op.action === 'inc') {
      const target = (node.entries.get(key) ?? []).find(entry => pred.has(entry.id))
      if (target && typeof target.value === 'number') entries.push({ ...target, value: target.value + Number(op.value) })
    } else if (op.action !== 'del') entries.push({ id: opId, ...value })
    node.entries.set(key, entries)
    return
  }
  if (op.action === 'mark' || op.action === 'unmark') return
  if (op.insert) {
    const at = op.elemId === '_head' ? 0 : node.items.findIndex(item => item.id === op.elemId) + 1
    node.items.splice(at < 0 ? node.items.length : at, 0, { id: opId, ...value })
    return
  }
  const item = node.items.find(entry => entry.id === op.elemId)
  if (!item) return
  if (op.action === 'del') item.deleted = true
  else if (op.action === 'inc') { if (typeof item.value === 'number') item.value += Number(op.value) }
  // A list element keeps the ID of the operation that inserted it, which later operations name it by.
  else Object.assign(item, { obj: undefined, datatype: undefined }, value)
}

/** A decoded operation's value: a reference to the object it makes, or a scalar with its datatype. */
function opValue(op, opId) {
  if (String(op.action).startsWith('make')) return { obj: opId }
  if (op.action !== 'set') return {}
  if (Array.isArray(op.value)) return { value: op.value, datatype: 'bytes' }
  return { value: op.value ?? null, datatype: op.datatype }
}

/**
 * Whether `event` has the shape Pardner writes for an operation event: the strings that identify it, a known type,
 * a timestamp, and the containers it renders from. Only the shape: what it says is shown as written.
 */
export function isEvent(event) {
  return isPlainObject(event) && ['operationId', 'requestId', 'type', 'actorId', 'timestamp', 'fingerprint', 'replicaId'].every(field => typeof event[field] === 'string')
    && EVENT_TYPES.has(event.type) && Number.isFinite(Date.parse(event.timestamp)) && isPlainObject(event.payload) && isPlainObject(event.result)
    && Array.isArray(event.recordIds) && event.recordIds.every(id => typeof id === 'string') && Array.isArray(event.changes) && event.changes.every(isPlainObject)
    && (event.taskId === undefined || typeof event.taskId === 'string')
}

/** Whether an event's operation ID is the one its own request ID and content give (lib/workspace-commands.js prepareOperation). */
export function eventIdHolds(event) {
  const fingerprint = digest(canonical({ type: event.type, actorId: event.actorId, payload: event.payload }))
  return event.fingerprint === fingerprint && event.operationId === `op-${digest(canonical([event.requestId, event.fingerprint]))}`
}

/**
 * The entry for one decoded change (see the derivation above). `roots` maps each top-level object made by an
 * earlier change to `{ key, type }`; the top-level objects this change makes are returned in `roots` for the next.
 */
export function readChange(change, roots) {
  const { actor, startOp, ops, hash, deps = [], time } = change
  const local = new Map(), made = [], ownRoots = new Map(), events = [], records = [], replaced = []
  const unusual = { count: 0, root: [], deleted: [], foreign: [], unknownMaps: [], notMaps: [], other: [] }
  const note = (list, item) => { unusual.count++; if (list.length < MAX_DETAIL && !list.some(entry => canonical(entry) === canonical(item))) list.push(item) }
  const creation = deps.length === 0
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index], opId = `${startOp + index}@${actor}`
    const value = opValue(op, opId)
    if (op.obj === '_root') {
      // A top-level object, whoever made it, is read as one of the board's maps, never as content of this change.
      if (value.obj) {
        const type = op.action === 'makeMap' ? 'map' : 'other'
        made.push([opId, String(op.key), type])
        ownRoots.set(opId, { key: String(op.key), type })
      }
      if (!creation) note(unusual.root, { key: String(op.key), action: op.action })
      continue
    }
    if (value.obj) local.set(opId, op.action === 'makeMap' ? { type: 'map', entries: new Map() } : { type: op.action === 'makeText' ? 'text' : 'list', items: [] })
    const root = roots.get(op.obj) ?? ownRoots.get(op.obj)
    if (!root && local.has(op.obj)) { applyLocal(local.get(op.obj), op, opId, value); continue }
    if (!root) { note(unusual.foreign, { obj: op.obj }); continue }
    const key = String(op.key)
    if (root.type !== 'map') { note(unusual.notMaps, { map: root.key, action: op.action }); continue }
    if (op.action === 'del' || op.action === 'inc') { note(unusual.deleted, { map: root.key, key, action: op.action }); continue }
    if (root.key === 'operations' || root.key === 'membership') {
      if (op.action !== 'makeMap') { note(unusual.other, { map: root.key, key, action: op.action }); continue }
      ;(root.key === 'operations' ? events : records).push({ key, objId: opId })
      if (op.pred?.length) replaced.push({ map: root.key, key, pred: [...op.pred] })
      continue
    }
    if (!SIDE_EFFECT_MAPS.has(root.key)) note(unusual.unknownMaps, { map: root.key, key })
  }
  // A records change may make `membership` again first: a write-back after it was vandalised.
  if (!creation && records.length && !events.length) {
    unusual.root = unusual.root.filter(entry => !(entry.key === 'membership' && entry.action === 'makeMap'))
    unusual.count = unusual.root.length + unusual.deleted.length + unusual.foreign.length + unusual.unknownMaps.length + unusual.notMaps.length + unusual.other.length
  }
  const built = list => list.map(({ key, objId }) => { const { value, json } = tree(local, objId); return { key, value, json } })
  const writtenEvents = built(events), writtenRecords = built(records)
  let kind
  if (creation) kind = 'creation'
  else if (writtenEvents.length === 1 && !writtenRecords.length && writtenEvents[0].json && isEvent(writtenEvents[0].value)) kind = 'operation'
  else if (!writtenEvents.length && writtenRecords.length && writtenRecords.every(record => record.json && isPlainObject(record.value))) kind = 'records'
  else kind = 'unrecognised'
  const entry = { v: DERIVATION_VERSION, hash, kind, time, ops: ops.length }
  if (made.length) entry.roots = made
  if (kind === 'operation') Object.assign(entry, { key: writtenEvents[0].key, event: writtenEvents[0].value })
  if (kind === 'records' || kind === 'creation') entry.records = writtenRecords.filter(record => record.json && isPlainObject(record.value)).map(({ key, value }) => ({ key, record: value }))
  if (kind === 'unrecognised') {
    // What it wrote, as written, so review shows it under its own signer.
    entry.wrote = { events: writtenEvents.slice(0, MAX_DETAIL).map(({ key, value, json }) => ({ key, ...(json ? { value } : { malformed: true }) })),
      records: writtenRecords.slice(0, MAX_DETAIL).map(({ key, value, json }) => ({ key, ...(json ? { value } : { malformed: true }) })),
      ...(ops.length ? {} : { empty: true }) }
  }
  if (replaced.length) entry.replaced = replaced.slice(0, MAX_DETAIL)
  if (unusual.count) entry.unusual = Object.fromEntries(Object.entries(unusual).filter(([, list]) => (Array.isArray(list) ? list.length : list)))
  return entry
}

/** The entry for a change too large to decode: listed for review with what is known without reading it. */
export function oversizedEntry(meta, bytes = null) {
  return { v: DERIVATION_VERSION, hash: meta.hash, kind: 'unrecognised', time: meta.time, ops: meta.maxOp - meta.startOp + 1, oversized: true, ...(bytes ? { bytes } : {}) }
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
    // Changes with no entry yet, in the order they were indexed (causal order), with their operation counts.
    this.pending = []
    this.queued = new Set()
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
      this.pending.push({ hash: meta.hash, ops: meta.maxOp - meta.startOp + 1, meta })
    }
  }

  get complete() { return this.pending.length === 0 }
  get remaining() { return this.pending.length }

  /**
   * Derives pending changes, in order, until the slice's operation budget or time budget is used (always at least one
   * change). A change too large to decode becomes an entry of its own without being read. Returns how many were derived.
   */
  slice({ ops: budget = this.opsPerSlice, ms = this.msPerSlice } = {}) {
    const started = this.now()
    let derived = 0, used = 0
    // Ends at whichever comes first: the operation budget or the time budget; a change larger than the budget is a
    // slice of its own.
    while (this.pending.length && (derived === 0 || (used < budget && this.now() - started < ms))) {
      const window = []
      let ops = 0
      for (const item of this.pending) {
        if (window.length && (used + ops + item.ops > budget || window.length >= 500)) break
        window.push(item)
        ops += item.ops
        if (item.ops > MAX_CHANGE_OPS) break
      }
      const count = this.deriveWindow(window)
      used += window.slice(0, count).reduce((sum, item) => sum + item.ops, 0)
      derived += count
      if (!count) break
    }
    if (derived) this.version++
    return derived
  }

  deriveWindow(window) {
    const doc = this.board.doc()
    const readable = window.filter(item => item.ops <= MAX_CHANGE_OPS)
    const decoded = new Map()
    if (readable.length) {
      const bytes = saveBundle(doc, readable.map(item => item.hash))
      // A window that is too large in bytes is read again one change at a time, so the large change is found.
      if (bytes.length > MAX_CHANGE_BYTES && window.length > 1) return this.deriveWindow(window.slice(0, 1))
      if (bytes.length > MAX_CHANGE_BYTES) {
        this.add(oversizedEntry(readable[0].meta, bytes.length))
        this.pending.splice(0, 1)
        this.queued.delete(readable[0].hash)
        return 1
      }
      for (const change of readBundle(bytes).changes) decoded.set(change.hash, change)
    }
    let count = 0
    for (const item of window) {
      const change = decoded.get(item.hash)
      if (item.ops > MAX_CHANGE_OPS) this.add(oversizedEntry(item.meta))
      else if (change) this.add(readChange(change, this.roots))
      else break
      count++
    }
    for (const item of this.pending.splice(0, count)) this.queued.delete(item.hash)
    return count
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
