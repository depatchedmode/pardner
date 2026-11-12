import { EventEmitter } from 'node:events'
import { decodeChange, decodeSyncMessage, free, getActorId, getChangesMetaSince, getHeads, hasHeads, load } from '@automerge/automerge'
import { HARNESS_IDS, actorId as actorFor } from './client-identity.js'
import { ChangeLog, isoOfSeconds } from './change-log.js'
import { activityView } from './activity.js'
import { verifyRecord } from './membership.js'
import { CANDIDATES_PER_PASS, SHARDS, SignatureReader, actorPrefix, isChangeHash, isMapValue, keptCandidates, machinePrefix, shardOf, signChange, verifyChange } from './change-signatures.js'
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
/** At most this many verification results are kept, beyond those of the changes under examination (ChangeAttribution.verifies). */
const CHECKS_KEPT = 50000

/** A pass of checking has verified all it may: the change named is examined further in the next, from where it stopped. */
export class VerificationDeferred extends Error {
  constructor(hash) {
    super(`The candidates of change ${hash} are examined further in the next pass`)
    this.name = 'VerificationDeferred'
    this.hash = hash
  }
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
  /**
   * The background work runs in slices, each in its own turn of the event loop. Per slice: the derivation reads at
   * most `deriveOps` operations, or one larger change alone, and starts no change after `deriveMs` (lib/change-log.js
   * ChangeLog gives the exact bounds, and why the time of one change has none); at most `chunkSize` changes are
   * checked; at most four times `chunkSize` cached signatures are compared and put back. Checking a change, and settling
   * a shard on the hub, reads every value stored for each change (lib/change-signatures.js entryValues) and verifies
   * them in passes (verifies): at most `verifyPerSlice` Ed25519 verifications in one slice, CANDIDATES_PER_PASS of them
   * for one change, each resumed in a later slice from where it stopped. A write into the signature document that must
   * remake a shard is one pass of its own. A local change, or a small batch received, is derived at once when every
   * pending change fits in `deriveOps` (indexBoard), bounded by operations alone.
   */
  constructor({ projectId, key, role, repo, board, signatures, cache, membership, records, peerMachine = () => null, askHub = null,
    hubMachine = () => null, quietMs = 1000, pollMs = 1000, chunkSize = 250, verifyPerSlice = chunkSize, checksKept = CHECKS_KEPT, deriveOps = 2000, deriveMs = 10,
    now = () => Date.now(), logger = console }) {
    super()
    Object.assign(this, { projectId, key, role, repo, board, signatures, cache, membership, records, peerMachine, askHub, hubMachine, quietMs,
      pollMs, chunkSize, verifyPerSlice, checksKept, now, logger })
    // What each change wrote (lib/change-log.js): every Activity entry is derived from its own change.
    this.log = new ChangeLog({ board, store: cache, opsPerSlice: deriveOps, msPerSlice: deriveMs })
    this.machineId = key.machineId
    this.reader = new SignatureReader(signatures)
    // Shards whose key changed: the hub makes any that holds more than one value into one map again.
    this.resolveShards = new Set()
    // Changes whose signature shard holds several candidates kept while their signer could not be established; the
    // hub settles each shard again once its change and signer are known (settleShards).
    this.candidates = new Set()
    this.settleShards = new Set()
    this.knownKeys = []
    // Verification results by change, least recently added first (verifies); the changes under examination and the
    // shards being merged keep theirs, so no examination starts again from the beginning.
    this.candidateChecks = new Map()
    this.checksHeld = 0
    this.examining = new Set()
    this.merging = new Set()
    this.pass = null
    this.verifications = 0
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
    this.removedFlags = new Map()
    this.removalEpoch = 0
    this.equivocations = new Map()
    // The verified signatures that prove each report, by report and change hash, kept in the signature cache with it.
    this.proofs = new Map()
    // Reports and proofs shown but not yet saved in the signature cache: retried in the background until saved.
    this.unsavedReports = new Set()
    this.unsavedProofs = new Map()
    this.failures = { count: 0, last: null }
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
    for (const [key, report] of this.cache.equivocations?.(MAX_EQUIVOCATIONS) ?? []) {
      if (!isEquivocationReport(report)) continue
      this.equivocations.set(key, report)
      this.proofs.set(key, this.cache.equivocationProofs?.(key) ?? new Map())
    }
    this.indexBoard()
    // Entries derived before a restart; every other change is derived in the background, after the board opens.
    try { this.log.load(this.order.map(hash => ({ hash, ...this.metas.get(hash) }))) } catch (error) { this.fail('derive', error) }
    this.logLoaded = true
    // Every cached signature is compared with the shared document once, in slices, after the board opens.
    for (const [hash] of this.cache) this.repairs.add(hash)
    return this
  }

  /** Starts checking in the background: the first full check, the Activity map, and the start-up write-back. */
  begin() {
    if (this.closed || this.began) return
    this.began = true
    // The hub looks at every shard once: concurrent values that arrived while it was stopped are resolved too.
    if (this.role === 'hub') for (const shard of SHARDS) this.resolveShards.add(shard)
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
    this.guard('derive', () => this.log.save())
    this.guard('equivocation', () => this.saveEquivocations())
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
    const machines = [...membership.machines, ...(membership.formerMachines ?? [])]
    this.keys = machineIndex(machines)
    // Every known key with its prefix (an ambiguous prefix keeps only one in `keys`), for ranking kept candidates.
    this.knownKeys = [...new Map(machines.map(machine => [machine.publicKey, { publicKey: machine.publicKey, prefix: machinePrefix(machine.publicKey) }])).values()]
    this.removed = new Set(membership.removedMachines)
  }

  /**
   * Whether `value` verifies as the signature of change `hash` under `publicKey`. Each pair is verified once: its result
   * is kept while the change is under examination (or its shard is being merged, or it is in an equivocation report),
   * and otherwise while fewer than `checksKept` results are held, the least recently added change's going first. In a
   * pass (inPass) at most CANDIDATES_PER_PASS pairs of one change and `verifyPerSlice` in all are verified; past that,
   * this throws VerificationDeferred and the change is examined further in the next pass. `bounded: false` (an
   * equivocation report's proof) verifies outside any pass.
   */
  verifies(hash, publicKey, value, { bounded = true } = {}) {
    const pair = `${publicKey}\u0000${Buffer.from(value).toString('base64')}`
    const held = this.candidateChecks.get(hash)
    if (held?.has(pair)) return held.get(pair)
    const pass = bounded ? this.pass : null
    if (pass) {
      const used = pass.changes.get(hash) ?? 0
      if (pass.left <= 0 || used >= CANDIDATES_PER_PASS) {
        this.examining.add(hash)
        throw new VerificationDeferred(hash)
      }
      pass.left--
      pass.changes.set(hash, used + 1)
    }
    this.verifications++
    const result = verifyChange(publicKey, this.projectId, hash, value)
    this.keepCheck(hash, pair, result)
    return result
  }

  keepCheck(hash, pair, result) {
    const held = this.candidateChecks.get(hash) ?? new Map()
    this.candidateChecks.delete(hash)
    this.candidateChecks.set(hash, held.set(pair, result))
    this.checksHeld++
    if (this.checksHeld <= this.checksKept) return
    const reported = new Set([...this.equivocations.values()].flatMap(report => report.hashes))
    for (const [old, results] of this.candidateChecks) {
      if (this.checksHeld <= this.checksKept) break
      if (old === hash || this.examining.has(old) || this.merging.has(shardOf(old)) || reported.has(old)) continue
      this.candidateChecks.delete(old)
      this.checksHeld -= results.size
    }
  }

  /** Runs `fn` as one pass of verification (verifies), or within the pass already running. */
  inPass(fn) {
    if (this.pass) return fn()
    this.pass = { left: this.verifyPerSlice, changes: new Map() }
    try { return fn() } finally { this.pass = null }
  }

  /** Records changed: a machine may now be known, or removed. */
  onMembership() {
    if (this.closed) return
    this.guard('membership', () => {
      this.refreshKeys()
      for (const [hash, entry] of this.unsigned) if (['unknown-signer', 'ambiguous-signer', 'missing', 'invalid'].includes(entry.reason)) this.queue.push(hash)
      // A machine now known may prove a report, or establish the signer of a change whose candidates are kept.
      for (const key of this.equivocations.keys()) this.prove(key)
      for (const hash of this.candidates) this.noteCandidate(hash)
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
    const signed = [], fresh = []
    for (const meta of metas) {
      if (this.metas.has(meta.hash)) continue
      fresh.push(meta)
      const entry = { actor: meta.actor, seq: meta.seq, startOp: meta.startOp, maxOp: meta.maxOp, time: meta.time }
      this.metas.set(meta.hash, entry)
      this.order.push(meta.hash)
      const list = this.byActor.get(meta.actor) ?? []
      list.push({ ...entry, hash: meta.hash })
      if (list.length > 1 && list.at(-2).startOp > entry.startOp) list.sort((a, b) => a.startOp - b.startOp)
      this.byActor.set(meta.actor, list)
      this.noteCandidate(meta.hash)
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
    // A change's own entry is derived at once, so a local change, or a small batch received, is shown as it arrives; a
    // large batch, such as a first sync, is left to the background slices.
    if (this.logLoaded && fresh.length) {
      this.log.note(fresh)
      if (this.began && this.log.pendingOps <= this.log.opsPerSlice) this.guard('derive', () => this.log.slice({ ms: Infinity }))
    }
    this.version++
    this.schedule()
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
      // Retried by the background work loop until written, whether or not this machine writes again; a shard to remake
      // whose candidates take more than one pass is not a failure.
      this.outboxRetry = true
      this.schedule()
      if (error instanceof VerificationDeferred) return
      throw error
    }
    this.outboxRetry = false
  }

  /** Whether any signature this machine made is not yet written into the signature document. */
  get unwritten() { return this.outbox.length }

  /**
   * Writes signature entries into the signature document. A shard that is missing, or holds anything but a map (any
   * member can replace one with a list or a scalar), is made again as a map; every cached entry it held is then put
   * back by the repair its replacement triggers.
   */
  writeEntries(entries, resolve = new Set()) {
    const groups = new Map()
    for (const entry of entries) {
      const shard = shardOf(entry.hash)
      if (!groups.has(shard)) groups.set(shard, [])
      groups.get(shard).push(entry)
    }
    const shards = new Set([...groups.keys(), ...resolve])
    if (!shards.size) return
    // A shard written as one map again keeps every entry any of its values held; computed before the change.
    const doc = this.signatures.doc()
    // A shard whose candidates can't all be examined in this pass is merged in a later one, from where it stopped
    // (verifies): its changes keep their results meanwhile, and nothing is written until it is.
    const remade = this.inPass(() => new Map([...shards].filter(shard => resolve.has(shard) || !isMapValue(doc[shard])).map(shard => {
      try { return [shard, this.mergedShard(shard)] } catch (error) {
        if (error instanceof VerificationDeferred) this.merging.add(shard)
        throw error
      }
    })))
    this.signatures.change(draft => {
      for (const shard of shards) {
        const fresh = groups.get(shard) ?? []
        if (remade.has(shard)) {
          const merged = remade.get(shard)
          for (const { hash, signature } of fresh) merged.set(hash, signature)
          draft[shard] = Object.fromEntries(merged)
        } else for (const { hash, signature } of fresh) draft[shard][hash] = signature
      }
    })
    for (const shard of shards) this.reader.changed(shard)
    for (const shard of remade.keys()) this.merging.delete(shard)
  }

  /**
   * One map holding every entry of every value of `shard`, and every signature this peer verified for it: what the
   * shard becomes when a writer makes it one map again. Where values for one change differ, nothing is chosen while
   * the change's signer cannot be established (the change is not in the board yet, or its actor names no known
   * machine): every distinct value is kept, as a candidate list at its key, up to MAX_CANDIDATES, in the order
   * keptCandidates (lib/change-signatures.js) gives: what may be its genuine signature before what cannot. Once the
   * signer is known, the value that verifies under it is kept; if none does, none is valid and the cached or lowest is
   * kept. Every peer holding the same known machines chooses alike.
   */
  mergedShard(shard) {
    const merged = new Map()
    for (const [hash, values] of this.reader.entries(shard)) {
      const cached = this.cache.get(hash)?.signature
      if (values.length === 1) { merged.set(hash, values[0]); continue }
      const signer = this.metas.has(hash) ? this.keys.get(actorPrefix(this.metas.get(hash).actor)) : null
      const ordered = [...values].sort(Buffer.compare)
      const held = cached && ordered.find(value => Buffer.from(cached).equals(value))
      if (!signer || signer.ambiguous) {
        this.candidates.add(hash)
        // Its signer may be any known machine while the change has not arrived; once it has, one sharing its prefix.
        const prefix = this.metas.has(hash) ? actorPrefix(this.metas.get(hash).actor) : null
        const possible = this.knownKeys.filter(key => !this.metas.has(hash) || key.prefix === prefix).map(key => key.publicKey)
        const others = this.knownKeys.map(key => key.publicKey).filter(publicKey => !possible.includes(publicKey))
        merged.set(hash, keptCandidates({ values: ordered, held: held ?? null, possible, others, verify: (publicKey, value) => this.verifies(hash, publicKey, value) }))
        continue
      }
      this.candidates.delete(hash)
      merged.set(hash, ordered.find(value => this.verifies(hash, signer.publicKey, value)) ?? held ?? ordered[0])
    }
    for (const [hash, entry] of this.cache) if (shardOf(hash) === shard && !merged.has(hash) && this.metas.has(hash)) merged.set(hash, entry.signature)
    return merged
  }

  /**
   * Makes each shard whose key changed and now holds more than one value, or no map, into one map (on the hub), and
   * settles each shard holding candidates for a change whose signer is now known.
   */
  resolveConflictedShards() {
    const shards = new Set()
    for (const shard of this.resolveShards) if (this.reader.conflicted(shard) || this.settleShards.has(shard)) shards.add(shard)
    // A shard is merged in this pass when its candidates can all be examined in it, and else in a later one, from where
    // it stopped; it stays listed meanwhile.
    const ready = new Set([...shards].filter(shard => {
      try { this.mergedShard(shard); return true } catch (error) {
        if (!(error instanceof VerificationDeferred)) throw error
        this.merging.add(shard)
        return false
      }
    }))
    if (ready.size) this.writeEntries([], ready)
    for (const shard of ready) this.settleShards.delete(shard)
    for (const shard of [...this.resolveShards]) if (!shards.has(shard) || ready.has(shard)) this.resolveShards.delete(shard)
  }

  /** A change whose candidates are kept may now have a known signer: on the hub, its shard is settled. */
  noteCandidate(hash) {
    if (this.role !== 'hub' || !this.candidates.has(hash) || !this.metas.has(hash)) return
    const signer = this.keys.get(actorPrefix(this.metas.get(hash).actor))
    if (!signer || signer.ambiguous) return
    this.settleShards.add(shardOf(hash))
    this.resolveShards.add(shardOf(hash))
  }

  /**
   * Puts back every verified signature the shared document lacks, this machine's own included. Ed25519 is
   * deterministic, so an entry written back is the same bytes its writer made. Only signatures held in this
   * machine's own cache, of changes in the board, are written: nothing it never signed or checked.
   */
  restoreMissing(hashes) {
    if (this.closed) return 0
    const missing = []
    for (const hash of hashes) {
      const entry = this.cache.get(hash)
      if (!entry || !this.metas.has(hash)) continue
      const held = Buffer.from(entry.signature)
      if (!this.reader.values(hash).some(value => held.equals(value))) missing.push({ hash, ...entry })
    }
    // A shard that must be remade and can't be in this pass is put back in a later one: each stays a repair until then.
    try { this.writeEntries(missing) } catch (error) {
      if (!(error instanceof VerificationDeferred)) throw error
      for (const hash of hashes) this.repairs.add(hash)
      this.schedule()
      return null
    }
    return missing.length
  }

  // ---- Checking ----

  schedule() {
    if (this.closed || !this.began) return
    // Every queue of work not yet done or saved: anything entering one is retried here until it leaves it.
    if (this.queue.length || this.repairs.size || this.resolveShards.size || !this.log.complete || this.log.unsaved.length || this.unsavedReports.size || this.unsavedProofs.size
      || this.uncached.size || (this.outboxRetry && this.outbox.length)) {
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
    this.inPass(() => this.slice())
  }

  slice() {
    // Only what a person would see is announced: entries derived (once all are, and at most once a second before
    // that, so a first full derivation does not redraw the board every slice), or a change now signed.
    let visible = false
    if (!this.log.complete) {
      const derived = this.log.slice()
      if (derived && (this.log.complete || this.now() - (this.announcedAt ?? 0) >= 1000)) { visible = true; this.announcedAt = this.now() }
    }
    this.log.save()
    this.saveEquivocations()
    // This machine's own signatures whose first save in the cache or write into the signature document failed.
    if (this.uncached.size) this.confirmOwn()
    if (this.outboxRetry) this.flushOutbox()
    if (this.repairs.size) {
      // A batch leaves the pending set only once its repair is written: a failure leaves it to be retried.
      const batch = []
      for (const hash of this.repairs) { batch.push(hash); if (batch.length >= this.chunkSize * 4) break }
      if (this.restoreMissing(batch) !== null) for (const hash of batch) this.repairs.delete(hash)
    }
    if (this.resolveShards.size) {
      if (this.role === 'hub') this.resolveConflictedShards()
      else this.resolveShards.clear()
    }
    const batch = this.queue.splice(0, this.chunkSize)
    const verified = []
    for (const hash of new Set(batch)) {
      const entry = this.unsigned.get(hash)
      if (!entry || this.cache.has(hash)) { this.settle(hash); continue }
      let outcome
      // A change with more candidates than this pass may verify is examined further in a later slice.
      try { outcome = this.check(hash) } catch (error) {
        if (!(error instanceof VerificationDeferred)) throw error
        this.queue.push(hash)
        continue
      }
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
      for (const { hash } of verified) { this.settle(hash); this.uncached.delete(hash); this.noteCandidate(hash) }
      this.version++
      visible = true
    }
    if (visible) this.emit('update')
  }

  /** A change no longer waits for a signature: it is verified, or was never this peer's to check. */
  settle(hash) {
    this.unsigned.delete(hash)
    this.open.delete(hash)
    // Its examination is over: its results are not needed again, so an honest board keeps none.
    this.examining.delete(hash)
    const held = this.candidateChecks.get(hash)
    if (held) { this.checksHeld -= held.size; this.candidateChecks.delete(hash) }
  }

  check(hash) {
    const meta = this.metas.get(hash)
    const prefix = actorPrefix(meta.actor)
    if (!prefix) return { reason: 'not-machine' }
    const signer = this.keys.get(prefix)
    if (!signer) return { reason: 'unknown-signer' }
    if (signer.ambiguous) return { reason: 'ambiguous-signer' }
    const stored = this.reader.values(hash)
    if (!stored.length) return { reason: 'missing', machineId: signer.machineId }
    // Verified in passes (verifies), each resumed where the last stopped.
    const signature = stored.find(value => this.verifies(hash, signer.publicKey, value))
    this.examining.delete(hash)
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
      if (patch.path.length === 1) { shards.add(shard); this.reader.changed(shard); this.resolveShards.add(shard) }
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
    // A signature that arrives for either change of a report may prove it: the report is shown again at once.
    let proved = false
    for (const [key, report] of this.equivocations) {
      if (report.hashes.some(hash => touched.has(hash) || shards.has(shardOf(hash)))) proved = this.prove(key) || proved
    }
    if (proved) { this.version++; this.emit('update') }
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
    const writers = this.recordWriters()
    return [...new Set(ids.flatMap(id => writers.get(id) ?? []))].sort()
  }

  /** The changes that wrote each membership record into the board, by record ID, from their derived entries. */
  recordWriters() {
    if (this.recordWriterIndex?.version !== this.log.version) {
      const writers = new Map()
      for (const entry of this.log.entries.values()) {
        for (const { key, record } of entry.records ?? []) {
          const id = typeof record?.recordId === 'string' ? record.recordId : key
          if (!writers.has(id)) writers.set(id, [])
          writers.get(id).push(entry.hash)
        }
      }
      this.recordWriterIndex = { version: this.log.version, writers }
    }
    return this.recordWriterIndex.writers
  }

  /** The signed changes by removed `machineId` made after its removal reached the board, kept until records or their writes change. */
  removedAfter(machineId) {
    let flags = this.removedFlags.get(machineId)
    // The changes that wrote a removal are known from their derived entries, so a change derived since counts too.
    if (flags?.epoch !== this.removalEpoch || flags.derived !== this.log.version) {
      const writes = this.removalWrites(machineId)
      if (!flags || canonical(flags.writes) !== canonical(writes)) {
        const doc = this.board.doc()
        const after = writes.length ? getChangesMetaSince(doc, writes) : this.order.map(hash => ({ hash, ...this.metas.get(hash) }))
        flags = { writes, after: new Set(after.filter(meta => this.signerOf(meta) === machineId).map(meta => meta.hash)), seen: this.order.length }
      }
      flags.epoch = this.removalEpoch
      flags.derived = this.log.version
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

  /** The change whose operation range holds operation `opId`, or null. */
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
    if (this.actorSets?.keys !== this.keys) this.actorSets = { keys: this.keys, sets: new Map() }
    if (!this.actorSets.sets.has(machineId)) {
      const machine = [...this.keys.values()].find(entry => entry.machineId === machineId)
      this.actorSets.sets.set(machineId, machine ? new Set(machine.personIds.flatMap(personId => [...(machine.agentsOnly ? [] : [actorFor(personId)]),
        ...HARNESS_IDS.map(harness => actorFor(personId, harness))])) : new Set())
    }
    return this.actorSets.sets.get(machineId)
  }

  // ---- What Activity shows ----

  /**
   * Activity: every derived entry with the verdict for its own change (lib/activity.js). A pure function of the
   * board's changes and the verified signatures and records, recomputed only when one of them changes. A change not
   * derived yet is not shown; summary().checking counts it.
   */
  activity() {
    const records = this.records()
    const key = `${this.version}:${this.removalEpoch}:${this.log.version}:${records.length}`
    if (this.activityMemo?.key === key) return this.activityMemo.value
    const value = activityView({ entries: this.log.entries.values(), stateOf: hash => this.stateOf(hash), actorsOf: machineId => this.actorsOf(machineId),
      recordValid: record => this.recordValid(record, records), changeOfObject: objId => this.changeOfOp(objId) })
    this.activityMemo = { key, value }
    return value
  }

  /**
   * Whether a membership record, as a change wrote it, is a valid record of this project: the one this peer stored
   * under its ID, or one whose own signature verifies under its signer's key (or, for the genesis, its own).
   */
  recordValid(record, records = this.records()) {
    if (this.storedRecords?.records !== records) this.storedRecords = { records, byId: new Map(records.map(stored => [stored.recordId, canonical(stored)])), checked: new Map() }
    const text = canonical(record)
    if (this.storedRecords.byId.get(record?.recordId) === text) return true
    if (!this.storedRecords.checked.has(text)) {
      const signer = [...this.keys.values()].find(entry => entry.machineId === record?.signer)
      this.storedRecords.checked.set(text, verifyRecord(record, this.projectId, signer?.publicKey).valid)
    }
    return this.storedRecords.checked.get(text)
  }

  /**
   * The changes that need a person's review, one item per change, each with the entry it belongs to: unattributed,
   * by a removed machine, or in an entry with a flag (lib/activity.js).
   */
  review() {
    const items = []
    for (const entry of this.activity()) {
      if (!entry.review) continue
      for (const { hash, timestamp, ...change } of entry.changes) {
        // A change's time that a date cannot show is unknown here, never a failure of the whole review.
        items.push({ change: hash, entry: entry.id, kind: entry.kind, ...change, flags: entry.flags, at: isoOfSeconds(this.metas.get(hash)?.time) })
      }
    }
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.change.localeCompare(b.change))
  }

  /**
   * Counts of each state, without visiting every change: only changes without a valid signature and signed changes
   * by removed machines need a look, so the board's status stays cheap however long its history is.
   */
  summary() {
    const key = `${this.version}:${this.removalEpoch}:${this.metas.size}:${this.queue.length}:${this.failures.count}:${this.log.version}`
    if (this.summaryCache?.key === key) return this.summaryCache.value
    // A change is still being checked until its signature is checked and its entry has been derived.
    let pending = 0, unattributed = 0, checking = 0, removed = 0, ownActor = 0, unscannedElsewhere = 0
    const scanned = this.log.entries
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
    // Signed changes not yet derived count as checking; unsigned and removed ones keep their own state.
    checking += Math.max(0, this.metas.size - scanned.size - unscannedElsewhere)
    const value = { changes: this.metas.size, signed: this.metas.size - pending - unattributed - checking - removed, removed, pending: pending + checking, unattributed,
      checking, ownActor, equivocations: [...this.equivocations].map(([key, report]) => this.equivocationView(report, key)),
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
      this.proofs.set(key, new Map())
      // Shown at once; kept once saved, and saved again in the background until that succeeds, proof or no proof.
      this.unsavedReports.add(key)
      this.guard('equivocation', () => this.saveEquivocations())
      this.prove(key)
    }
    if (this.unsavedReports.size || this.unsavedProofs.size) this.schedule()
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
  equivocationView(report, key = `${report.document}:${report.actor}:${report.seq}`) {
    const signer = this.keys.get(actorPrefix(report.actor))
    const proofs = this.proofs.get(key) ?? new Map()
    const signed = report.hashes.map(hash => report.document === 'board' && Boolean(signer) && !signer.ambiguous && (this.cache.get(hash)?.machineId === signer.machineId
      || [proofs.get(hash), ...this.reader.values(hash)].some(value => value && this.verifies(hash, signer.publicKey, value, { bounded: false }))))
    return { ...report, signed, proven: signed.every(Boolean) }
  }

  /**
   * Finds and keeps a verified signature for each change of report `key` that has none kept yet: from the signature
   * cache or the signature document. Kept in the signature cache with the report, so the proof outlives the entry.
   * Returns whether a signature was added.
   */
  prove(key) {
    const report = this.equivocations.get(key), proofs = this.proofs.get(key)
    const signer = report && this.keys.get(actorPrefix(report.actor))
    if (!proofs || report.document !== 'board' || !signer || signer.ambiguous) return false
    let added = false
    for (const hash of report.hashes) {
      if (proofs.has(hash)) continue
      const cached = this.cache.get(hash)
      const signature = [cached?.machineId === signer.machineId ? cached.signature : null, ...this.reader.values(hash)]
        .find(value => value && this.verifies(hash, signer.publicKey, value, { bounded: false }))
      if (!signature) continue
      proofs.set(hash, signature)
      added = true
      // Shown at once; kept once saved, and saved again in the background until that succeeds.
      if (!this.unsavedProofs.has(key)) this.unsavedProofs.set(key, new Map())
      this.unsavedProofs.get(key).set(hash, signature)
    }
    if (added) this.guard('equivocation', () => this.saveEquivocations())
    if (this.unsavedProofs.size) this.schedule()
    return added
  }

  /**
   * Saves every report and proof not yet in the signature cache, each leaving the queue only once its save succeeds;
   * a failure is thrown (and contained by the caller), so the rest are retried after the usual backoff.
   */
  saveEquivocations() {
    for (const key of [...this.unsavedReports]) {
      this.cache.addEquivocation?.(key, this.equivocations.get(key))
      this.unsavedReports.delete(key)
    }
    for (const [key, proofs] of [...this.unsavedProofs]) {
      for (const [hash, signature] of [...proofs]) {
        this.cache.addEquivocationProof?.(key, hash, signature)
        proofs.delete(hash)
      }
      this.unsavedProofs.delete(key)
    }
  }
}
