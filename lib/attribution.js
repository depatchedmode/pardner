import { EventEmitter } from 'node:events'
import { decodeChange, decodeSyncMessage, free, getActorId, getBackend, getChangesMetaSince, getHeads, getObjectId, hasHeads, load } from '@automerge/automerge'
import { plain } from './workspace-schema.js'
import { HARNESS_IDS, actorId as actorFor } from './client-identity.js'
import { MAX_CONCURRENT_VALUES, SHARDS, actorPrefix, isChangeHash, isMapValue, machinePrefix, shardOf, signChange, storedSignatures, verifyChange } from './change-signatures.js'
import { canonical } from './workspace-schema.js'

const HASH = /^[a-f0-9]{64}$/
const MACHINE_ID = /^machine-[a-z2-7]{26}$/
const SHARD_KEYS = new Set(SHARDS)
const isMapLike = value => value !== null && typeof value === 'object' && !Array.isArray(value)
/** Reasons a change has no valid signature yet. */
const REASONS = {
  missing: 'no signature has reached this computer',
  invalid: 'its signature does not check out',
  'unknown-signer': 'its actor names no machine of this project',
  'not-machine': 'its actor names no machine at all',
  'ambiguous-signer': 'its actor prefix names more than one machine',
}
export const UNSIGNED_REASONS = REASONS
/** A refused sync message larger than this is not parsed for an equivocation report. */
const MAX_REFUSED_MESSAGE = 16 * 1024 * 1024
const MAX_REFUSED_CHANGES = 10000
const MAX_EQUIVOCATIONS = 100
/** Board maps whose entries name the change that wrote them: Activity entries and membership records. */
const WRITTEN = ['operations', 'membership']
/** Up to this many unread changes are fetched one by one at start-up; more are fetched with the whole history at once. */
const FETCH_ONE_BY_ONE = 500
/** At most this many objects another change wrote are recorded per change, to say which entries it altered. */
const MAX_REWRITE_TARGETS = 64
const opParts = opId => {
  const at = typeof opId === 'string' ? opId.indexOf('@') : -1
  return at > 0 ? { counter: Number(opId.slice(0, at)), actor: opId.slice(at + 1) } : null
}

/**
 * The changes a sync message carries, as `{ actor, seq, hash }`. Automerge 3.2.3 packs several chunks back to back
 * into one entry, and sends a peer that holds nothing one whole-document chunk; each chunk is a 4-byte magic number,
 * a 4-byte checksum, a type byte (0 document, 1 change, 2 compressed change) and a LEB128 length. At most `limit`
 * changes are returned, counted across every chunk of every entry, a whole-document chunk included; nothing after
 * the limit is decoded.
 */
export function changesInMessage(data, limit = MAX_REFUSED_CHANGES) {
  const changes = []
  for (const entry of decodeSyncMessage(data).changes) {
    if (changes.length >= limit) break
    for (let offset = 0; offset < entry.length && changes.length < limit;) {
      if (entry[offset] !== 0x85 || entry[offset + 1] !== 0x6f || entry[offset + 2] !== 0x4a || entry[offset + 3] !== 0x83) throw new Error('Not an Automerge chunk')
      let length = 0, shift = 0, cursor = offset + 9, byte
      do { byte = entry[cursor++]; length += (byte & 0x7f) * 2 ** shift; shift += 7 } while (byte & 0x80 && cursor < entry.length)
      const chunk = entry.subarray(offset, cursor + length)
      if (entry[offset + 8] === 0) {
        const doc = load(chunk)
        try {
          for (const meta of getChangesMetaSince(doc, [])) {
            if (changes.length >= limit) break
            changes.push({ actor: meta.actor, seq: meta.seq, hash: meta.hash })
          }
        } finally { free(doc) }
      } else {
        const { actor, seq, hash } = decodeChange(chunk)
        changes.push({ actor, seq, hash })
      }
      offset = cursor + length
    }
  }
  return changes
}

/**
 * The machines that are or were members, by actor prefix. A key certified more than once is one machine, with each
 * person it was certified for. Two different keys sharing one 16-byte prefix are not a practical risk, but such a
 * prefix is marked ambiguous and attributes to neither.
 */
export function machineIndex(machines, prefixOf = machinePrefix) {
  const keys = new Map()
  for (const machine of machines) {
    const prefix = prefixOf(machine.publicKey)
    const known = keys.get(prefix) ?? { machineId: machine.id, publicKey: machine.publicKey, personIds: [], agentsOnly: true }
    if (known.publicKey !== machine.publicKey) known.ambiguous = true
    if (!known.personIds.includes(machine.personId)) known.personIds.push(machine.personId)
    known.agentsOnly &&= machine.agentsOnly === true
    keys.set(prefix, known)
  }
  return keys
}

/** Whether stored findings of a read change have the shape this version writes. */
function isFindings(findings) {
  if (findings === null) return true
  if (!isMapLike(findings)) return false
  const { roots = [], targets = [], replaced = [] } = findings
  return Array.isArray(roots) && roots.length <= 64 && roots.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string'))
    && Array.isArray(targets) && targets.length <= MAX_REWRITE_TARGETS && targets.every(value => typeof value === 'string' && opParts(value))
    && Array.isArray(replaced) && replaced.length <= 10000 && replaced.every(entry => isMapLike(entry) && typeof entry.map === 'string' && ['replaced', 'deleted'].includes(entry.kind))
}

/** Whether a stored equivocation report has the shape this version writes. */
function isEquivocationReport(report) {
  return isMapLike(report) && ['board', 'signatures'].includes(report.document) && typeof report.actor === 'string' && Number.isSafeInteger(report.seq)
    && Array.isArray(report.hashes) && report.hashes.length === 2 && report.hashes.every(isChangeHash)
}

function opChange(opId) {
  const at = typeof opId === 'string' ? opId.indexOf('@') : -1
  return at > 0 ? { counter: Number(opId.slice(0, at)), actor: opId.slice(at + 1) } : null
}

/**
 * Who made each change of one project's board (docs/PARDNER-TRUST-DESIGN.md, section 3).
 *
 * Every change this runtime makes is signed at once, saved in the local signature cache before the board can be
 * saved, and written into the signature document by a deferred change that automerge-repo saves and syncs in the
 * background, off the acknowledgement path. Every other change is applied as today, then checked: its signature
 * must verify under the machine its actor prefix names, and that machine must be or have been a member. Nothing
 * is refused or hidden. A change without a valid signature is "pending" until the peer that delivered it has had
 * its chance to send one, then "unattributed" (see resolve()). A signed change by a machine this peer holds as
 * removed is "removed" unless it causally precedes its removal.
 */
export class ChangeAttribution extends EventEmitter {
  constructor({ projectId, key, role, repo, board, signatures, cache, membership, records, peerMachine = () => null, askHub = null,
    hubMachine = () => null, quietMs = 1000, pollMs = 1000, chunkSize = 250, now = () => Date.now(), logger = console }) {
    super()
    Object.assign(this, { projectId, key, role, repo, board, signatures, cache, membership, records, peerMachine, askHub, hubMachine, quietMs,
      pollMs, chunkSize, now, logger })
    this.machineId = key.machineId
    this.metas = new Map()
    this.order = []
    this.byActor = new Map()
    this.indexed = []
    this.unsigned = new Map()
    // Changes waiting for a verdict (pending, not checking and not yet unattributed), in the order the hub is asked about them.
    this.open = new Set()
    this.queue = []
    this.outbox = []
    // This machine's own signatures that could not be saved in the signature cache yet: until they are, no local
    // write is acknowledged (confirmOwn()).
    this.uncached = new Map()
    // Cached signatures to compare with the shared document, and put back where it lacks them: one set, drained in batches.
    this.repairs = new Set()
    this.peers = new Map()
    this.writers = Object.fromEntries(WRITTEN.map(map => [map, new Map()]))
    this.dirtyWriters = Object.fromEntries(WRITTEN.map(map => [map, new Set()]))
    this.writersReady = false
    this.removedFlags = new Map()
    this.removalEpoch = 0
    this.equivocations = new Map()
    this.failures = { count: 0, last: null }
    // Which change wrote what (scanChange): fetched change bytes still to read, the changes read, the board's
    // top-level maps, and the changes that wrote into what another change made or left no Activity entry.
    this.scan = { heads: null, pending: [], scanned: new Set(), roots: new Map(), rewrites: new Map(), noEntry: new Set(), version: 0, decoded: new Map(),
      entries: new Map(), unsaved: [] }
    // Bumped whenever a change's state may have changed; caches and listeners key on it.
    this.version = 0
    this.closed = false
    this.listeners = []
  }

  /**
   * Makes `fn`'s change on the board through this machine's own write path, and signs exactly that change. Nothing
   * else is ever signed: authorship is never inferred from the actor ID of a change, since any member can write a
   * change carrying another machine's actor. The signature is made while the change is indexed, inside
   * `handle.change`, and saved in the signature cache before the board can be saved.
   */
  change(fn) {
    this.authoring = { actor: getActorId(this.board.doc()), hash: null }
    try { this.board.change(fn) } finally { this.authoring = null }
  }

  /**
   * Indexes the board. Checking, the Activity map and the write-back of missing entries begin with begin(), once
   * the board is open, so they never lengthen opening it. Every listener and background task runs contained
   * (guard()): replicated data never reaches the runtime as an exception.
   */
  start() {
    this.refreshKeys()
    this.on('error', () => {})
    const listen = (emitter, event, task, listener) => {
      const contained = (...args) => this.guard(task, () => listener(...args))
      emitter.on(event, contained)
      this.listeners.push(() => emitter.off(event, contained))
    }
    listen(this.board, 'heads-changed', 'index', () => this.indexBoard())
    listen(this.board, 'change', 'board-patches', ({ patches }) => this.noteBoardPatches(patches))
    listen(this.signatures, 'change', 'signature-patches', ({ patches }) => this.noteSignaturePatches(patches))
    listen(this.repo, 'doc-metrics', 'metrics', event => this.noteMetrics(event))
    listen(this.repo.synchronizer, 'sync-state', 'sync-state', event => this.noteSyncState(event))
    listen(this.repo.networkSubsystem, 'peer', 'peer', ({ peerId }) => this.peers.set(peerId, { ...this.peers.get(peerId), connectedAt: this.now(), connected: true }))
    listen(this.repo.networkSubsystem, 'peer-disconnected', 'peer', ({ peerId }) => {
      const peer = this.peers.get(peerId)
      if (peer) peer.connected = false
    })
    // A sync message that Automerge refuses (two changes with one actor and sequence number) is reported, not only logged.
    const synchronizer = this.repo.synchronizer
    const receive = synchronizer.receiveMessage.bind(synchronizer)
    synchronizer.receiveMessage = async message => {
      try { return await receive(message) } catch (error) {
        if (this.guard('equivocation', () => this.noteRefusedMessage(message, error))) return
        throw error
      }
    }
    this.listeners.push(() => { synchronizer.receiveMessage = receive })
    for (const peerId of this.repo.peers) this.peers.set(peerId, { connectedAt: this.now(), connected: true })
    // Reports made before a restart; each one's proof is checked again whenever it is read.
    for (const [key, report] of this.cache.equivocations?.(MAX_EQUIVOCATIONS) ?? []) if (isEquivocationReport(report)) this.equivocations.set(key, report)
    this.indexBoard()
    this.loadScanned()
    // Every cached signature is compared with the shared document once, in slices, after the board opens.
    for (const [hash] of this.cache) this.repairs.add(hash)
    return this
  }

  /** Starts checking in the background: the first full check, the Activity map, and the start-up write-back. */
  begin() {
    if (this.closed || this.began) return
    this.began = true
    this.schedule()
  }

  /** Stops asking the hub, ahead of shutdown, so no request is started while the service closes. Checking and signing go on. */
  pause() {
    this.paused = true
    clearTimeout(this.resolveTimer)
    this.resolveTimer = null
  }

  close() {
    if (this.closed) return
    this.guard('outbox', () => this.flushOutbox())
    this.saveScanned()
    this.closed = true
    for (const remove of this.listeners.splice(0)) remove()
    clearImmediate(this.workTimer)
    clearTimeout(this.workTimer)
    clearTimeout(this.resolveTimer)
    clearImmediate(this.outboxTimer)
  }

  // ---- Contained failures ----

  /**
   * Runs `fn` so that nothing it throws reaches the event loop: replicated data can never end the runtime. A failure
   * is logged and kept in status (summary().failures); the work it interrupted is retried later.
   */
  guard(task, fn) {
    try { return fn() } catch (error) {
      this.fail(task, error)
      return undefined
    }
  }

  fail(task, error) {
    this.failures.count++
    this.failures.last = { task, error: String(error?.message ?? error).slice(0, 300), at: new Date(this.now()).toISOString() }
    this.failedAt = this.now()
    this.version++
    try { this.logger?.error?.(`Pardner attribution: ${task} failed and was contained: ${this.failures.last.error}`) } catch { /* Logging is best effort. */ }
    try { this.emit('update') } catch { /* A listener's failure is not this task's. */ }
  }

  // ---- Machines ----

  /**
   * The machines that are or were members, by actor prefix: a change counts as signed only under one of their keys.
   * Two different keys sharing one 16-byte prefix are not a practical risk, but such a prefix attributes to neither.
   */
  refreshKeys() {
    const membership = this.membership()
    this.keys = machineIndex([...membership.machines, ...(membership.formerMachines ?? [])])
    this.removed = new Set(membership.removedMachines)
  }

  /** Records changed: a machine may now be known, or removed. */
  onMembership() {
    if (this.closed) return
    this.guard('membership', () => {
      this.refreshKeys()
      for (const [hash, entry] of this.unsigned) if (['unknown-signer', 'ambiguous-signer', 'missing', 'invalid'].includes(entry.reason)) this.queue.push(hash)
      this.removalEpoch++
      this.version++
      this.schedule()
    })
  }

  // ---- Indexing and signing ----

  /**
   * Indexes changes the board gained, synchronously. The one change this machine's write path is making (change())
   * is signed at once; every other change, whatever actor it carries, queues for checking.
   */
  indexBoard() {
    if (this.closed) return
    const doc = this.board.doc()
    const metas = getChangesMetaSince(doc, this.indexed)
    if (!metas.length) return
    this.indexed = getHeads(doc)
    // A local change depends on every head the write path saw, so it is then the only head.
    const authoring = this.authoring && !this.authoring.hash && this.indexed.length === 1 ? this.authoring : null
    // Named by machine as well, so it is still known after its connection is gone or replaced.
    const deliverer = this.delivering ? { peerId: this.delivering, machineId: this.peerMachine(this.delivering) } : null
    const signed = []
    for (const meta of metas) {
      if (this.metas.has(meta.hash)) continue
      const entry = { actor: meta.actor, seq: meta.seq, startOp: meta.startOp, maxOp: meta.maxOp, time: meta.time }
      this.metas.set(meta.hash, entry)
      this.order.push(meta.hash)
      const list = this.byActor.get(meta.actor) ?? []
      list.push({ ...entry, hash: meta.hash })
      if (list.length > 1 && list.at(-2).startOp > entry.startOp) list.sort((a, b) => a.startOp - b.startOp)
      this.byActor.set(meta.actor, list)
      if (this.cache.has(meta.hash)) continue
      // The change being made now: this load's actor, and the single head it leaves.
      if (authoring && !authoring.hash && meta.actor === authoring.actor && meta.hash === this.indexed[0]) {
        authoring.hash = meta.hash
        signed.push({ hash: meta.hash, machineId: this.machineId, signature: signChange(this.key, this.projectId, meta.hash) })
        continue
      }
      this.unsigned.set(meta.hash, { reason: 'checking', firstSeenAt: this.now(), deliverer })
      this.queue.push(meta.hash)
    }
    if (signed.length) {
      // Queued for the signature document first, so a failure to cache it still lets every other peer verify it.
      this.outbox.push(...signed)
      // Saved before the board can be: a crash after the board's save still leaves the entry to restore.
      try { this.cache.add(signed) } catch (error) {
        // Not cached: shown as checking until it is saved, and no write is acknowledged until then (confirmOwn()).
        for (const entry of signed) {
          this.uncached.set(entry.hash, entry)
          this.unsigned.set(entry.hash, { reason: 'checking', firstSeenAt: this.now(), deliverer: null })
          this.queue.push(entry.hash)
        }
        this.fail('sign', error)
      }
      // Written once the save that acknowledges this change is done, so the write never delays that answer. The
      // change's own flush is queued only after this step returns, so the wait starts in the next turn.
      if (!this.outboxWaiting) {
        this.outboxWaiting = true
        setImmediate(() => this.repo.persistenceQueue.then(() => {
          this.outboxTimer = setImmediate(() => { this.outboxTimer = null; this.outboxWaiting = false; this.guard('outbox', () => this.flushOutbox()) })
        }, error => { this.outboxWaiting = false; this.fail('outbox', error) }))
      }
    }
    // A change's own few changes are read at once, so it is shown with its content already confirmed; a large batch,
    // such as a first sync, is left to the background slices.
    if (this.scan.heads) {
      this.fetchChanges()
      if (this.scan.pending.length <= this.chunkSize) this.scanSlice(Infinity)
    }
    this.version++
    this.schedule()
  }

  // ---- What each change wrote ----

  /**
   * Fetches the bytes of every board change not yet fetched. The first call reads the whole history at once (the
   * only Automerge call that does so without reconstructing each change separately); later calls read only what
   * arrived since.
   */
  fetchChanges() {
    const doc = this.board.doc()
    const heads = getHeads(doc)
    if (this.scan.heads && canonical(heads) === canonical(this.scan.heads)) return
    if (!this.scan.heads) {
      // The first fetch: only the changes this replica has not read before. A few are read one by one; many, such as
      // a new replica's whole history, at once.
      const unread = this.order.filter(hash => !this.scan.scanned.has(hash))
      this.scan.heads = heads
      if (unread.length > FETCH_ONE_BY_ONE) this.scan.pending.push(...getBackend(doc).getChanges([]))
      else this.scan.pending.push(...unread)
      return
    }
    const changes = getBackend(doc).getChanges(this.scan.heads)
    this.scan.heads = heads
    if (changes.length) this.scan.pending.push(...changes)
  }

  /** What an earlier run of this replica read, from the signature cache: only changes in this board count. */
  loadScanned() {
    let rows
    try { rows = this.cache.scannedChanges?.() } catch (error) { this.fail('scan', error); return }
    for (const [hash, findings] of rows ?? []) {
      if (!this.metas.has(hash) || !isFindings(findings)) continue
      this.scan.scanned.add(hash)
      this.noteFindings(hash, findings)
    }
    this.scan.version++
  }

  /** Saves what was read since the last save; a lost save only means those changes are read again. */
  saveScanned() {
    if (!this.scan.unsaved.length) return
    const rows = this.scan.unsaved.splice(0)
    try { this.cache.addScanned?.(rows) } catch (error) { this.fail('scan', error) }
  }

  noteFindings(hash, findings) {
    if (!findings) return
    const { roots, targets, more, replaced, noEntry } = findings
    for (const [objId, key] of roots ?? []) this.scan.roots.set(objId, key)
    if (targets?.length || replaced?.length) this.scan.rewrites.set(hash, { targets: targets ?? [], more: Boolean(more), replaced: replaced ?? [] })
    if (noEntry) this.scan.noEntry.add(hash)
  }

  /** Whether every change in the board has been read, so every entry's content is confirmed or flagged. */
  get scanComplete() { return this.scan.heads !== null && !this.scan.pending.length }

  /** Reads up to `limit` fetched changes, in causal order. */
  scanSlice(limit) {
    let count = 0
    const backend = getBackend(this.board.doc())
    while (this.scan.pending.length && count++ < limit) {
      const item = this.scan.pending.shift()
      // A change that cannot be read stays unread, so its entries keep showing as being checked; the failure is shown.
      try {
        const bytes = typeof item === 'string' ? backend.getChangeByHash(item) : item
        if (bytes) this.scanChange(decodeChange(bytes))
      } catch (error) { this.fail('scan', error) }
    }
    if (count) { this.scan.version++; this.version++ }
  }

  /**
   * The rule that binds what Activity shows to the change that signed it. Pardner writes every object below the
   * board's top-level maps exactly once, in the change that creates it: an operation event, a record, a field
   * register, a comment or a read receipt is replaced as a whole, never edited inside; and an Activity entry is
   * never replaced or deleted. So a change that writes into an object another change created, or replaces or deletes
   * an Activity entry, altered something another change signed. And every change Pardner makes leaves an Activity
   * entry or a membership record. This reads each change's operations once and records any change that breaks
   * either rule. It depends only on the changes, so every peer holding them finds the same.
   */
  scanChange(change) {
    const { actor, startOp, ops, hash } = change
    if (!hash || this.scan.scanned.has(hash)) return
    this.scan.scanned.add(hash)
    const end = startOp + ops.length
    let entries = false
    const targets = new Set(), replaced = [], roots = []
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index]
      if (op.obj === '_root') {
        if (String(op.action).startsWith('make')) {
          roots.push([`${startOp + index}@${actor}`, String(op.key)])
          this.scan.roots.set(`${startOp + index}@${actor}`, String(op.key))
        }
        // Membership records carry their own signatures; a write-back that makes a vandalised map again is a repair.
        if ((op.pred?.length || op.action === 'del') && op.key !== 'membership') replaced.push({ map: '_root', key: String(op.key), kind: op.action === 'del' ? 'deleted' : 'replaced' })
        continue
      }
      const map = this.scan.roots.get(op.obj)
      if (map !== undefined) {
        if (WRITTEN.includes(map) && op.action !== 'del') entries = true
        if (map === 'operations' && (op.pred?.length || op.action === 'del')) replaced.push({ map, key: String(op.key), kind: op.action === 'del' ? 'deleted' : 'replaced' })
        continue
      }
      const target = opParts(op.obj)
      if (target && target.actor === actor && target.counter >= startOp && target.counter < end) continue
      if (targets.size < MAX_REWRITE_TARGETS) targets.add(op.obj)
      else targets.overflow = true
    }
    const findings = { ...(roots.length ? { roots } : {}), ...(targets.size ? { targets: [...targets], ...(targets.overflow ? { more: true } : {}) } : {}),
      ...(replaced.length ? { replaced } : {}), ...(!entries && ops.length ? { noEntry: true } : {}) }
    this.noteFindings(hash, findings)
    this.scan.unsaved.push([hash, Object.keys(findings).length ? findings : null])
  }

  /**
   * Every alteration, by entry (`operations:key`, `membership:key`, or the map for other objects) and by change. An
   * object another change wrote into is placed by its own creation: the change that made it, read again, says
   * which top-level entry it belongs to. Computed again only when the scan finds more.
   */
  alterations() {
    if (this.alterationIndex?.version === this.scan.version) return this.alterationIndex
    // Only rewrites found since the last call are placed; an object's entry never changes, so it is placed once.
    const index = this.alterationIndex ?? { byEntry: new Map(), byChange: new Map(), placed: new Set() }
    const { byEntry, byChange } = index
    const note = (hash, entry) => {
      const key = entry.key === undefined ? entry.map : `${entry.map}:${entry.key}`
      if (!byEntry.has(key)) byEntry.set(key, [])
      if (!byEntry.get(key).some(item => item.hash === hash && item.kind === entry.kind)) byEntry.get(key).push({ hash, kind: entry.kind })
      if (!byChange.has(hash)) byChange.set(hash, [])
      if (!byChange.get(hash).some(item => item.map === entry.map && item.key === entry.key && item.kind === entry.kind)) byChange.get(hash).push(entry)
    }
    for (const [hash, { targets, replaced }] of this.scan.rewrites) {
      if (index.placed.has(hash)) continue
      index.placed.add(hash)
      for (const entry of replaced) note(hash, entry)
      for (const target of targets) {
        if (!this.scan.entries.has(target)) this.scan.entries.set(target, this.entryOf(target))
        note(hash, { ...(this.scan.entries.get(target) ?? { map: 'unknown' }), kind: 'edited' })
      }
    }
    this.scan.decoded.clear()
    this.alterationIndex = { ...index, version: this.scan.version }
    return this.alterationIndex
  }

  /** The top-level entry an object belongs to, from the change that created it: `{ map, key }`, or null. */
  entryOf(objId, depth = 0) {
    if (depth > 32) return null
    const creator = this.changeOfOp(objId), parts = opParts(objId)
    if (!creator || !parts) return null
    let change = this.scan.decoded.get(creator)
    if (!change) {
      const bytes = getBackend(this.board.doc()).getChangeByHash(creator)
      if (!bytes) return null
      change = decodeChange(bytes)
      this.scan.decoded.set(creator, change)
    }
    const op = change.ops[parts.counter - change.startOp]
    if (!op || !String(op.action).startsWith('make')) return null
    const map = this.scan.roots.get(op.obj)
    if (map !== undefined) return { map, key: String(op.key) }
    if (op.obj === '_root') return { map: String(op.key) }
    return this.entryOf(op.obj, depth + 1)
  }

  /**
   * An Activity entry as the change that wrote it made it, when a later change altered it there: what is shown under
   * its signer. Read from Automerge's history at that change, so it is the same on every peer.
   */
  signedEvent(operationId) {
    const doc = this.board.doc()
    if (!isMapValue(doc.operations) || !Object.hasOwn(doc.operations, operationId)) return null
    const objId = getObjectId(doc.operations, operationId)
    const creator = typeof objId === 'string' ? this.changeOfOp(objId) : null
    if (!creator) return null
    const cached = this.signedContent?.get(objId)
    if (cached?.creator === creator) return cached.event
    const event = plain(getBackend(doc).materialize(objId, [creator]))
    ;(this.signedContent ??= new Map()).set(objId, { creator, event })
    return event
  }

  /**
   * The local acknowledgement's signature barrier: every signature this machine made is saved in the signature
   * cache. One that could not be saved when it was made is saved now; if that fails too, this throws, and the write
   * waiting on it is not acknowledged (a retry with the same operation ID asks again).
   */
  confirmOwn() {
    if (!this.uncached.size) return
    const entries = [...this.uncached.values()]
    this.cache.add(entries)
    for (const { hash } of entries) { this.uncached.delete(hash); this.settle(hash) }
    this.version++
  }

  /** Writes this machine's new signatures into the signature document in one change; automerge-repo saves and syncs it. */
  flushOutbox() {
    if (this.closed || !this.outbox.length || this.holdOutbox) return
    const entries = this.outbox.splice(0)
    try { this.writeEntries(entries) } catch (error) {
      this.outbox.unshift(...entries)
      throw error
    }
  }

  /** Whether any signature this machine made is not yet written into the signature document. */
  get unwritten() { return this.outbox.length }

  /**
   * Writes signature entries into the signature document. A shard that is missing, or holds anything but a map (any
   * member can replace one with a list or a scalar), is made again as a map; every cached entry it held is then put
   * back by the repair its replacement triggers.
   */
  writeEntries(entries) {
    if (!entries.length) return
    this.signatures.change(doc => {
      for (const { hash, signature } of entries) {
        const shard = shardOf(hash)
        if (!isMapValue(doc[shard])) doc[shard] = {}
        doc[shard][hash] = signature
      }
    })
  }

  /**
   * Puts back every verified signature the shared document lacks, this machine's own included. Ed25519 is
   * deterministic, so an entry written back is the same bytes its writer made. Only signatures held in this
   * machine's own cache, of changes in the board, are written: nothing it never signed or checked.
   */
  restoreMissing(hashes) {
    if (this.closed) return 0
    const doc = this.signatures.doc()
    const missing = []
    for (const hash of hashes) {
      const entry = this.cache.get(hash)
      if (!entry || !this.metas.has(hash)) continue
      const held = Buffer.from(entry.signature)
      if (!storedSignatures(doc, hash).some(value => held.equals(value))) missing.push({ hash, ...entry })
    }
    this.writeEntries(missing)
    return missing.length
  }

  // ---- Checking ----

  schedule() {
    if (this.closed || !this.began) return
    if (this.queue.length || !this.writersReady || this.repairs.size || !this.scanComplete || this.scan.unsaved.length || [...WRITTEN].some(map => this.dirtyWriters[map].size)) {
      // After a failure the next slice waits a second, so a failure that repeats never spins.
      const backoff = this.failedAt !== undefined && this.now() - this.failedAt < 1000
      if (!this.workTimer) {
        const run = () => { this.workTimer = null; this.guard('check', () => this.work()); this.guard('check', () => this.schedule()) }
        this.workTimer = backoff ? setTimeout(run, 1000) : setImmediate(run)
      }
    }
    this.scheduleResolve()
  }

  /** One slice of checking, so a new replica's first full check shows progress and never blocks the board for long. */
  work() {
    if (this.closed) return
    // The first read of the whole history is a slice of its own.
    if (!this.scan.heads) { this.fetchChanges(); return }
    // Only what a person would see is announced: a change now signed, or an entry whose signer just became known.
    let visible = false
    if (this.scan.pending.length) {
      this.scanSlice(this.chunkSize)
      visible ||= this.scanComplete
    }
    if (!this.writersReady) {
      const doc = this.board.doc()
      for (const map of WRITTEN) if (isMapValue(doc[map])) for (const key of Object.keys(doc[map])) this.dirtyWriters[map].add(key)
      this.writersReady = true
    }
    visible = this.refreshWriters(this.chunkSize * 4) || visible
    this.saveScanned()
    if (this.repairs.size) {
      // A batch leaves the pending set only once its repair is written: a failure leaves it to be retried.
      const batch = []
      for (const hash of this.repairs) { batch.push(hash); if (batch.length >= this.chunkSize * 4) break }
      this.restoreMissing(batch)
      for (const hash of batch) this.repairs.delete(hash)
    }
    const batch = this.queue.splice(0, this.chunkSize)
    const verified = []
    for (const hash of new Set(batch)) {
      const entry = this.unsigned.get(hash)
      if (!entry || this.cache.has(hash)) { this.settle(hash); continue }
      const outcome = this.check(hash)
      if (outcome.signed) { verified.push(outcome.signed); continue }
      if (entry.reason !== outcome.reason || entry.claimed !== outcome.machineId) {
        Object.assign(entry, { reason: outcome.reason, claimed: outcome.machineId ?? null })
        this.version++
      }
      if (!entry.resolved) this.open.add(hash)
    }
    if (verified.length) {
      try { this.cache.add(verified) } catch (error) {
        // Checked again later; nothing is shown as verified until it is saved.
        this.queue.push(...verified.map(entry => entry.hash))
        throw error
      }
      for (const { hash } of verified) { this.settle(hash); this.uncached.delete(hash) }
      this.version++
      visible = true
    }
    if (visible) this.emit('update')
  }

  /** A change no longer waits for a signature: it is verified, or was never this peer's to check. */
  settle(hash) {
    this.unsigned.delete(hash)
    this.open.delete(hash)
  }

  check(hash) {
    const meta = this.metas.get(hash)
    const prefix = actorPrefix(meta.actor)
    if (!prefix) return { reason: 'not-machine' }
    const signer = this.keys.get(prefix)
    if (!signer) return { reason: 'unknown-signer' }
    if (signer.ambiguous) return { reason: 'ambiguous-signer' }
    const stored = storedSignatures(this.signatures.doc(), hash)
    if (!stored.length) return { reason: 'missing', machineId: signer.machineId }
    const signature = stored.find(value => verifyChange(signer.publicKey, this.projectId, hash, value))
    return signature ? { signed: { hash, machineId: signer.machineId, signature } } : { reason: 'invalid', machineId: signer.machineId }
  }

  /**
   * Notes signature-document changes: an entry that arrived may settle a pending change, and an entry this peer
   * verified that is gone or overwritten joins the repairs. Only shard keys and change-hash keys are looked at.
   */
  noteSignaturePatches(patches = []) {
    if (this.closed) return
    const touched = new Set(), shards = new Set()
    for (const patch of patches) {
      const [shard, hash] = patch.path ?? []
      if (!SHARD_KEYS.has(shard)) continue
      if (patch.path.length === 1) shards.add(shard)
      else if (isChangeHash(hash)) {
        touched.add(hash)
        if ((patch.action === 'del' || patch.action === 'put') && this.cache.has(hash)) this.repairs.add(hash)
      }
    }
    if (shards.size) {
      // A whole shard was replaced or deleted: everything in it is a candidate.
      for (const candidate of this.unsigned.keys()) if (shards.has(shardOf(candidate))) touched.add(candidate)
      for (const [candidate] of this.cache) if (shards.has(shardOf(candidate))) this.repairs.add(candidate)
    }
    for (const hash of touched) if (this.unsigned.has(hash)) this.queue.push(hash)
    this.schedule()
  }

  // ---- Which peer delivered a change, and whether it has had its chance to send the signature ----

  noteMetrics(event) {
    if (event?.type !== 'receive-sync-message' || this.closed) return
    if (event.documentId === this.board.documentId) {
      // The receive is applied in this same synchronous step; any change it adds was delivered by this peer.
      this.delivering = event.fromPeer
      queueMicrotask(() => { if (this.delivering === event.fromPeer) this.delivering = null })
    }
  }

  noteSyncState({ peerId, documentId, syncState }) {
    if (documentId !== this.signatures.documentId || this.closed) return
    const peer = this.peers.get(peerId) ?? { connectedAt: this.now(), connected: true }
    if (Array.isArray(syncState?.theirHeads) && syncState.theirHeads.every(isChangeHash)) peer.sigHeads = [...syncState.theirHeads]
    this.peers.set(peerId, peer)
  }

  scheduleResolve() {
    if (this.closed || this.paused || !this.began || this.resolveTimer || !this.open.size) return
    const delay = this.role === 'replica' ? this.pollMs : Math.max(50, Math.min(250, this.quietMs / 4))
    this.resolveTimer = setTimeout(() => { this.resolveTimer = null; void this.resolve() }, delay)
    this.resolveTimer.unref?.()
  }

  /** Changes waiting for a verdict, oldest first. */
  unresolved() {
    return [...this.open].map(hash => [hash, this.unsigned.get(hash)]).filter(([, entry]) => entry && entry.reason !== 'checking' && !entry.resolved)
  }

  /**
   * The rule that turns "pending" into "unattributed". On the hub, a change without a valid signature stays
   * pending while the machine that delivered it is disconnected, or connected but not yet caught up: this peer
   * must hold every signature-document change that machine has reported, and `quietMs` (a second) must have
   * passed on a live connection since the change arrived and since that machine connected. A writer puts its
   * signature into the signature document milliseconds after the change, and messages on one connection arrive
   * in the order they were sent, so a writer that has a signature has sent it well within that wait, however slow
   * the link. On a member machine the peer that delivered every change is the hub, which is asked for its own
   * verdict: pending while the hub is, or while it holds a signature that has not arrived here yet.
   */
  async resolve() {
    if (this.closed || this.paused) return
    try {
      const before = this.version
      if (this.role === 'replica') await this.resolveViaHub()
      else this.resolveLocally()
      if (this.version !== before) this.emit('update')
    } catch (error) {
      this.fail('resolve', error)
    }
    this.guard('resolve', () => this.scheduleResolve())
  }

  resolveLocally() {
    const sigDoc = this.signatures.doc()
    for (const [hash, entry] of this.unresolved()) {
      const verdict = this.localVerdict(hash, entry, sigDoc)
      if (canonical(verdict) === canonical(entry.waiting ?? null) && !verdict?.resolved) continue
      if (verdict.resolved) { entry.resolved = { relayedBy: verdict.relayedBy ?? null }; this.open.delete(hash) }
      entry.waiting = verdict.resolved ? null : verdict
      this.version++
    }
  }

  localVerdict(hash, entry, sigDoc) {
    const meta = this.metas.get(hash)
    if (entry.reason === 'not-machine') return { resolved: true, relayedBy: entry.deliverer?.machineId ?? null }
    const author = this.machineFor(meta.actor)
    // Found in this machine's own storage under its own prefix with no signature: nobody else can supply one.
    if (!entry.deliverer && author === this.machineId) return { resolved: true, relayedBy: null }
    // The machine to wait for: the one that delivered the change, or for a change found in storage, its author.
    const machineId = entry.deliverer ? entry.deliverer.machineId : author
    const live = [...this.peers].filter(([peerId, peer]) => peer.connected
      && (peerId === entry.deliverer?.peerId || (machineId && this.peerMachine(peerId) === machineId)))
    if (!live.length) return { waitingFor: machineId }
    const now = this.now()
    for (const [peerId, peer] of live) {
      const inSync = !peer.sigHeads || hasHeads(sigDoc, peer.sigHeads)
      const quiet = now - Math.max(entry.firstSeenAt, peer.connectedAt ?? 0) >= this.quietMs
      if (inSync && quiet) return { resolved: true, relayedBy: this.peerMachine(peerId) ?? machineId }
    }
    return { waitingFor: machineId ?? this.peerMachine(live[0][0]) }
  }

  /**
   * Asks the hub about the changes waiting for a verdict, at most 500 at a time, in turn: each one asked about moves
   * to the back of the queue, so every waiting change is asked about within a bounded number of polls, and one that
   * is settled leaves it. The hub's answer is checked before use: a lying hub can delay a verdict, never misattribute.
   */
  async resolveViaHub() {
    if (!this.askHub) return
    const open = []
    for (const hash of this.open) {
      const entry = this.unsigned.get(hash)
      if (!entry || entry.reason === 'checking' || entry.resolved) { this.open.delete(hash); continue }
      open.push(hash)
      if (open.length >= 500) break
    }
    if (!open.length) return
    // Rotate now, so a failed or slow answer still moves the next batch forward.
    for (const hash of open) { this.open.delete(hash); this.open.add(hash) }
    let states
    try { states = (await this.askHub(open))?.states } catch { return }
    if (this.closed || !isMapLike(states)) return
    const verified = []
    for (const hash of open) {
      const entry = this.unsigned.get(hash), answer = Object.hasOwn(states, hash) ? states[hash] : null
      if (!entry || !isMapLike(answer)) continue
      if (answer.state === 'signed' && typeof answer.signature === 'string' && answer.signature.length <= 128) {
        const meta = this.metas.get(hash), signer = this.keys.get(actorPrefix(meta.actor))
        const signature = new Uint8Array(Buffer.from(answer.signature, 'base64url'))
        if (signer && !signer.ambiguous && verifyChange(signer.publicKey, this.projectId, hash, signature)) {
          verified.push({ hash, machineId: signer.machineId, signature })
          continue
        }
      }
      const machine = value => (typeof value === 'string' && MACHINE_ID.test(value) ? value : null)
      if (answer.state === 'unsigned') {
        entry.resolved = { relayedBy: this.hubMachine(), origin: machine(answer.relayedBy) }
        entry.waiting = null
        this.open.delete(hash)
        this.version++
        continue
      }
      const waiting = { waitingFor: machine(answer.waitingFor) ?? this.hubMachine() }
      if (canonical(waiting) !== canonical(entry.waiting ?? null)) {
        entry.waiting = waiting
        this.version++
      }
    }
    if (verified.length) {
      this.cache.add(verified)
      for (const { hash } of verified) this.settle(hash)
      this.restoreMissing(verified.map(entry => entry.hash))
      this.version++
    }
  }

  /** The hub's answer to a member machine asking about changes it holds no valid signature for. */
  answer(hashes) {
    const states = {}
    for (const hash of Array.isArray(hashes) ? hashes.slice(0, 500) : []) {
      if (typeof hash !== 'string' || !HASH.test(hash)) continue
      const signed = this.cache.get(hash)
      if (signed) { states[hash] = { state: 'signed', machineId: signed.machineId, signature: Buffer.from(signed.signature).toString('base64url') }; continue }
      const entry = this.unsigned.get(hash)
      if (!entry) { states[hash] = { state: 'unknown' }; continue }
      states[hash] = entry.resolved ? { state: 'unsigned', reason: entry.reason, relayedBy: entry.resolved.relayedBy ?? null }
        : { state: 'pending', waitingFor: entry.waiting?.waitingFor ?? null }
    }
    return { states }
  }

  // ---- Removed machines ----

  /**
   * The board changes that wrote, into the board, a record that removes `machineId`: a machine.remove of it, a
   * member.remove of its person, or, for a key certified for two people, any of its certifications. A signed change
   * by that machine that is not an ancestor of one of them was made after its removal reached the board.
   */
  removalWrites(machineId) {
    const membership = this.membership()
    const former = (membership.formerMachines ?? []).filter(machine => machine.id === machineId)
    const people = new Set(former.map(machine => machine.personId))
    const ids = (membership.removals ?? []).filter(entry => (entry.kind === 'machine.remove' && entry.subject === machineId)
      || (entry.kind === 'member.remove' && people.has(entry.subject))).map(entry => entry.recordId)
    if (former.some(machine => machine.certifiedTwice)) {
      for (const record of this.records()) {
        if ((record.kind === 'machine.add' && record.subject === machineId) || (['member.add', 'project.genesis'].includes(record.kind) && record.machineId === machineId)) ids.push(record.recordId)
      }
    }
    const doc = this.board.doc()
    return [...new Set(ids.flatMap(id => this.writerHashes(doc, 'membership', id)))].sort()
  }

  /** The signed changes by removed `machineId` made after its removal reached the board, kept until records or their writes change. */
  removedAfter(machineId) {
    let flags = this.removedFlags.get(machineId)
    if (flags?.epoch !== this.removalEpoch) {
      const writes = this.removalWrites(machineId)
      if (!flags || canonical(flags.writes) !== canonical(writes)) {
        const doc = this.board.doc()
        const after = writes.length ? getChangesMetaSince(doc, writes) : this.order.map(hash => ({ hash, ...this.metas.get(hash) }))
        flags = { writes, after: new Set(after.filter(meta => this.signerOf(meta) === machineId).map(meta => meta.hash)), seen: this.order.length }
      }
      flags.epoch = this.removalEpoch
      this.removedFlags.set(machineId, flags)
    }
    // Changes indexed since can never be ancestors of writes already in the board.
    for (; flags.seen < this.order.length; flags.seen++) {
      const hash = this.order[flags.seen]
      if (this.signerOf(this.metas.get(hash)) === machineId) flags.after.add(hash)
    }
    return flags.after
  }

  signerOf(meta) { return this.machineFor(meta.actor) }

  /** The machine an actor names, or null when its prefix names no machine of this project, or more than one. */
  machineFor(actor) {
    const known = this.keys.get(actorPrefix(actor))
    return known && !known.ambiguous ? known.machineId : null
  }

  // ---- Which change wrote an Activity entry or a record ----

  noteBoardPatches(patches = []) {
    if (this.closed) return
    for (const patch of patches) {
      const [map, key] = patch.path ?? []
      if (WRITTEN.includes(map) && typeof key === 'string') this.dirtyWriters[map].add(key)
      else if (WRITTEN.includes(map) && patch.path.length === 1) this.writersReady = false
    }
    // A change's own few entries are mapped at once, so the board it is shown with already names their signer (a
    // local change is signed by now); a large batch, such as a first sync, is left to the background slices.
    if (this.began && this.writersReady && WRITTEN.reduce((sum, map) => sum + this.dirtyWriters[map].size, 0) <= 64) this.refreshWriters()
    this.schedule()
  }

  /** Refreshes which change wrote each dirty entry; returns whether one now shows a signer that is no longer pending. */
  refreshWriters(limit = Infinity) {
    const doc = this.board.doc()
    let done = 0, settled = false
    for (const map of WRITTEN) {
      for (const key of this.dirtyWriters[map]) {
        if (done++ >= limit) return settled
        this.dirtyWriters[map].delete(key)
        const hashes = this.writerHashes(doc, map, key)
        if (hashes.length) this.writers[map].set(key, hashes)
        else this.writers[map].delete(key)
        if (map === 'membership') this.removalEpoch++
        settled ||= map === 'membership' || hashes.some(hash => this.cache.has(hash) || this.unsigned.get(hash)?.resolved)
        this.version++
      }
    }
    return settled
  }

  /**
   * The changes that wrote `doc[map][key]`: the operation ID of each of its values, concurrent ones included, read
   * from Automerge itself. Never a value's content: a string value that looks like an operation ID names nothing.
   */
  writerHashes(doc, map, key) {
    const container = doc[map]
    if (!isMapValue(container) || !Object.hasOwn(container, key)) return []
    const values = getBackend(doc).getAll(getObjectId(container), key)
    // An object value is [type, objectId]; a scalar is [type, value, opId]. An object's ID is the operation that made it.
    const ops = values.slice(0, MAX_CONCURRENT_VALUES).map(value => (value.length === 2 ? value[1] : value[2]))
    return [...new Set(ops.map(op => this.changeOfOp(op)).filter(Boolean))].sort()
  }

  changeOfOp(opId) {
    const op = opChange(opId)
    const list = op && this.byActor.get(op.actor)
    if (!list) return null
    let low = 0, high = list.length - 1
    while (low <= high) {
      const middle = (low + high) >> 1, meta = list[middle]
      if (op.counter < meta.startOp) high = middle - 1
      else if (op.counter > meta.maxOp) low = middle + 1
      else return meta.hash
    }
    return null
  }

  // ---- What a change's state is ----

  stateOf(hash) {
    const meta = this.metas.get(hash)
    if (!meta) return { state: 'pending', reason: 'checking' }
    const signed = this.cache.get(hash)
    if (signed) {
      if (this.removed.has(signed.machineId) && this.removedAfter(signed.machineId).has(hash)) return { state: 'removed', machineId: signed.machineId }
      return { state: 'signed', machineId: signed.machineId }
    }
    const entry = this.unsigned.get(hash) ?? { reason: 'checking' }
    const claimed = this.claimedBy(hash, entry)
    if (entry.resolved) {
      // A change carrying this machine's actor that this machine did not sign: someone else used its actor.
      return { state: 'unattributed', reason: entry.reason, claimed, relayedBy: entry.resolved.origin ?? entry.resolved.relayedBy ?? null,
        ...(entry.resolved.origin ? { via: entry.resolved.relayedBy } : {}), ...(claimed === this.machineId ? { ownActor: true } : {}) }
    }
    return { state: 'pending', reason: entry.reason, claimed, waitingFor: entry.waiting?.waitingFor ?? null }
  }

  /** The machines with a verified signature in the cache, computed again only when the cache grows. */
  cachedMachines() {
    if (this.cachedMachineSet?.size !== this.cache.size) {
      this.cachedMachineSet = { size: this.cache.size, machines: new Set([...this.cache].map(([, entry]) => entry.machineId)) }
    }
    return this.cachedMachineSet.machines
  }

  /** The machine a change's actor names, or null. */
  claimedBy(hash, entry = this.unsigned.get(hash)) {
    return entry?.claimed ?? this.machineFor(this.metas.get(hash)?.actor)
  }

  /** The Actor IDs a machine may act as: its persons' agents, and the persons themselves unless it is agents-only. */
  actorsOf(machineId) {
    const machine = [...this.keys.values()].find(entry => entry.machineId === machineId)
    if (!machine) return new Set()
    return new Set(machine.personIds.flatMap(personId => [...(machine.agentsOnly ? [] : [actorFor(personId)]), ...HARNESS_IDS.map(harness => actorFor(personId, harness))]))
  }

  /** The signers of each Activity entry: one per change that wrote it, with a flag when it claims an Actor its machine is not certified for. */
  /**
   * The signers of each Activity entry: one per change that wrote it, with a flag when it claims an Actor its machine
   * is not certified for, and with every later change that altered it (`altered`). Until every change in the board
   * has been read (scanChange), a signed entry is still being checked: its content is not yet confirmed.
   */
  operationSigners(events) {
    const key = `${this.version}:${this.removalEpoch}:${this.scan.version}`
    if (this.signersMemo?.events === events && this.signersMemo.key === key) return this.signersMemo.result
    const result = {}
    const confirmed = this.scanComplete, { byEntry } = this.alterations()
    for (const [operationId, event] of Object.entries(events)) {
      const hashes = this.writers.operations.get(operationId)
      if (!hashes) { result[operationId] = [{ state: 'pending', reason: 'checking' }]; continue }
      const alterations = byEntry.get(`operations:${operationId}`) ?? []
      result[operationId] = hashes.map(hash => {
        let state = this.stateOf(hash)
        const mismatch = ['signed', 'removed'].includes(state.state) && !this.actorsOf(state.machineId).has(event.actorId)
        if (!confirmed && state.state === 'signed') state = { state: 'pending', reason: 'checking' }
        const altered = alterations.filter(item => item.hash !== hash && item.kind === 'edited')
        const replaces = alterations.some(item => item.hash === hash && item.kind === 'replaced')
        return { ...state, hash, ...(mismatch ? { actorMismatch: true } : {}), ...(replaces ? { replaces: true } : {}),
          ...(altered.length ? { altered: altered.map(item => ({ hash: item.hash, ...this.stateOf(item.hash) })) } : {}) }
      })
    }
    this.signersMemo = { events, key, result }
    return result
  }

  /**
   * The Activity entries a later change altered, as the change that wrote each one made it (signedEvent), keyed by
   * operation ID: what Activity shows under their signer.
   */
  signedEvents(events) {
    const { byEntry } = this.alterations(), shown = {}
    for (const operationId of Object.keys(events)) {
      if (!(byEntry.get(`operations:${operationId}`) ?? []).some(item => item.kind === 'edited')) continue
      const event = this.signedEvent(operationId)
      if (event) shown[operationId] = event
    }
    return shown
  }

  /**
   * Each stored record's entry for Activity: who signed it and when it reached the board, in the change that wrote
   * it. Change times have one-second resolution, so `position` (the order this replica indexed that change) breaks ties.
   */
  recordEntries(records) {
    if (!this.positions || this.positions.size !== this.order.length) this.positions = new Map(this.order.map((hash, index) => [hash, index]))
    return records.map(record => {
      const hashes = this.writers.membership.get(record.recordId) ?? []
      const times = hashes.map(hash => this.metas.get(hash)?.time).filter(Number.isFinite)
      const positions = hashes.map(hash => this.positions.get(hash)).filter(Number.isFinite)
      return { record, at: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null, position: positions.length ? Math.min(...positions) : null }
    })
  }

  /**
   * Changes that need a person's review: unattributed, made by a removed machine, claiming an Actor their machine is
   * not certified for, altering what another change wrote (`rewrote`), or leaving no Activity entry (`noEntry`).
   */
  flagged(events) {
    const signers = this.operationSigners(events)
    const byChange = new Map()
    for (const [operationId, list] of Object.entries(signers)) {
      for (const signer of list) {
        if (!signer.hash) continue
        const entry = byChange.get(signer.hash) ?? { hash: signer.hash, ...this.stateOf(signer.hash), operations: [], actorMismatch: false }
        entry.operations.push(operationId)
        entry.actorMismatch ||= signer.actorMismatch === true
        byChange.set(signer.hash, entry)
      }
    }
    for (const [hash] of this.unsigned) if (!byChange.has(hash)) byChange.set(hash, { hash, ...this.stateOf(hash), operations: [], actorMismatch: false })
    const cached = this.cachedMachines()
    for (const machineId of this.removed) {
      if (!cached.has(machineId)) continue
      for (const hash of this.removedAfter(machineId)) if (!byChange.has(hash)) byChange.set(hash, { hash, ...this.stateOf(hash), operations: [], actorMismatch: false })
    }
    const ensure = hash => {
      if (!byChange.has(hash)) byChange.set(hash, { hash, ...this.stateOf(hash), operations: [], actorMismatch: false })
      return byChange.get(hash)
    }
    for (const [hash, rewrote] of this.alterations().byChange) if (this.metas.has(hash)) ensure(hash).rewrote = rewrote
    for (const hash of this.scan.noEntry) if (this.metas.has(hash)) ensure(hash).noEntry = true
    return [...byChange.values()].filter(entry => ['unattributed', 'removed'].includes(entry.state) || entry.actorMismatch || entry.rewrote?.length || entry.noEntry)
      .map(entry => ({ ...entry, at: Number.isFinite(this.metas.get(entry.hash)?.time) ? new Date(this.metas.get(entry.hash).time * 1000).toISOString() : null }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.hash.localeCompare(b.hash))
  }

  /**
   * Counts of each state, without visiting every change: only changes without a valid signature and signed changes
   * by removed machines need a look, so the board's status stays cheap however long its history is.
   */
  summary() {
    const key = `${this.version}:${this.removalEpoch}:${this.metas.size}:${this.queue.length}:${this.failures.count}:${this.scan.version}`
    if (this.summaryCache?.key === key) return this.summaryCache.value
    // A change is still being checked until its signature is checked and its operations have been read.
    let pending = 0, unattributed = 0, checking = 0, removed = 0, ownActor = 0, unscannedElsewhere = 0
    const scanned = this.scan.scanned
    for (const [hash, entry] of this.unsigned) {
      if (!this.metas.has(hash)) continue
      if (!scanned.has(hash)) unscannedElsewhere++
      if (entry.reason === 'checking') checking++
      else if (entry.resolved) {
        unattributed++
        if (this.claimedBy(hash, entry) === this.machineId) ownActor++
      } else pending++
    }
    for (const machineId of this.removed) for (const hash of this.removedAfter(machineId)) if (this.cache.has(hash)) { removed++; if (!scanned.has(hash)) unscannedElsewhere++ }
    // Signed changes not yet read count as checking; unsigned and removed ones keep their own state.
    checking += Math.max(0, this.metas.size - scanned.size - unscannedElsewhere)
    const value = { changes: this.metas.size, signed: this.metas.size - pending - unattributed - checking - removed, removed, pending: pending + checking, unattributed,
      checking, ownActor, equivocations: [...this.equivocations.values()].map(report => this.equivocationView(report)),
      failures: { count: this.failures.count, last: this.failures.last } }
    this.summaryCache = { key, value }
    return value
  }

  // ---- Equivocation ----

  /**
   * Automerge refuses a sync message carrying a change whose actor and sequence number this document already holds
   * with a different change ("duplicate seq"); automerge-repo then logs the error and applies nothing from that
   * message, and every later message from that peer carrying the change fails the same way. Such a refusal is
   * reported here with both changes and the machine their actor names. When both changes carry valid signatures
   * the machine itself made them: that is proof of equivocation. Returns whether the refusal was such a conflict.
   */
  noteRefusedMessage(message, error) {
    if (!['sync', 'request'].includes(message?.type) || !(message.data instanceof Uint8Array) || message.data.length > MAX_REFUSED_MESSAGE) return false
    const handle = message.documentId === this.board.documentId ? this.board : message.documentId === this.signatures.documentId ? this.signatures : null
    if (!handle) return false
    let changes
    try { changes = changesInMessage(message.data) } catch { return false }
    const document = handle === this.board ? 'board' : 'signatures'
    const existing = handle === this.board ? null : this.signatureChanges()
    let found = false
    for (const change of changes) {
      const held = handle === this.board ? this.byActor.get(change.actor)?.find(meta => meta.seq === change.seq)?.hash : existing.get(`${change.actor}:${change.seq}`)
      if (!held || held === change.hash) continue
      found = true
      const key = `${document}:${change.actor}:${change.seq}`
      // Kept to a bounded number: each report names a machine to remove, and a few already say what to do.
      if (this.equivocations.has(key) || this.equivocations.size >= MAX_EQUIVOCATIONS) continue
      const report = { document, actor: change.actor, seq: change.seq, machineId: this.machineFor(change.actor),
        hashes: [held, change.hash], relayedBy: this.peerMachine(message.senderId), detectedAt: new Date(this.now()).toISOString(),
        detail: String(error?.message ?? '').slice(0, 200) }
      this.equivocations.set(key, report)
      this.guard('equivocation', () => this.cache.addEquivocation?.(key, report))
    }
    if (found) { this.version++; this.emit('update') }
    return found
  }

  /** The signature document's changes by actor and sequence number, computed once for each state of the document. */
  signatureChanges() {
    const heads = canonical(getHeads(this.signatures.doc()))
    if (this.signatureIndex?.heads !== heads) {
      this.signatureIndex = { heads, changes: new Map(getChangesMetaSince(this.signatures.doc(), []).map(meta => [`${meta.actor}:${meta.seq}`, meta.hash])) }
    }
    return this.signatureIndex.changes
  }

  /**
   * An equivocation report with its proof checked now: a signature may arrive after its change. Only board changes
   * are signed, so a conflict in the signature document proves nothing about the machine its actor names.
   */
  equivocationView(report) {
    const signer = this.keys.get(actorPrefix(report.actor))
    const signed = report.hashes.map(hash => report.document === 'board' && Boolean(signer) && !signer.ambiguous && (this.cache.get(hash)?.machineId === signer.machineId
      || storedSignatures(this.signatures.doc(), hash).some(value => verifyChange(signer.publicKey, this.projectId, hash, value))))
    return { ...report, signed, proven: signed.every(Boolean) }
  }
}
