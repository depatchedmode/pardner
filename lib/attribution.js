import { EventEmitter } from 'node:events'
import { decodeChange, decodeSyncMessage, free, getActorId, getChangesMetaSince, getConflicts, getHeads, getObjectId, hasHeads, load } from '@automerge/automerge'
import { HARNESS_IDS, actorId as actorFor } from './client-identity.js'
import { actorPrefix, machinePrefix, shardOf, signChange, storedSignatures, verifyChange } from './change-signatures.js'
import { canonical } from './workspace-schema.js'

const HASH = /^[a-f0-9]{64}$/
/** Reasons a change has no valid signature yet. */
const REASONS = {
  missing: 'no signature has reached this computer',
  invalid: 'its signature does not check out',
  'unknown-signer': 'its actor names no machine of this project',
  'not-machine': 'its actor names no machine at all',
}
export const UNSIGNED_REASONS = REASONS
/** Board maps whose entries name the change that wrote them: Activity entries and membership records. */
const WRITTEN = ['operations', 'membership']

/**
 * The changes a sync message carries, as `{ actor, seq, hash }`. Automerge 3.2.3 packs several chunks back to back
 * into one entry, and sends a peer that holds nothing one whole-document chunk; each chunk is a 4-byte magic number,
 * a 4-byte checksum, a type byte (0 document, 1 change, 2 compressed change) and a LEB128 length.
 */
export function changesInMessage(data) {
  const changes = []
  for (const entry of decodeSyncMessage(data).changes) {
    for (let offset = 0; offset < entry.length;) {
      if (entry[offset] !== 0x85 || entry[offset + 1] !== 0x6f || entry[offset + 2] !== 0x4a || entry[offset + 3] !== 0x83) throw new Error('Not an Automerge chunk')
      let length = 0, shift = 0, cursor = offset + 9, byte
      do { byte = entry[cursor++]; length += (byte & 0x7f) * 2 ** shift; shift += 7 } while (byte & 0x80 && cursor < entry.length)
      const chunk = entry.subarray(offset, cursor + length)
      if (entry[offset + 8] === 0) {
        const doc = load(chunk)
        try { for (const meta of getChangesMetaSince(doc, [])) changes.push({ actor: meta.actor, seq: meta.seq, hash: meta.hash }) } finally { free(doc) }
      } else {
        const { actor, seq, hash } = decodeChange(chunk)
        changes.push({ actor, seq, hash })
      }
      offset = cursor + length
    }
  }
  return changes
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
    hubMachine = () => null, quietMs = 1000, pollMs = 1000, chunkSize = 500, now = () => Date.now() }) {
    super()
    Object.assign(this, { projectId, key, role, repo, board, signatures, cache, membership, records, peerMachine, askHub, hubMachine, quietMs,
      pollMs, chunkSize, now })
    this.machineId = key.machineId
    this.metas = new Map()
    this.order = []
    this.byActor = new Map()
    this.indexed = []
    this.unsigned = new Map()
    this.queue = []
    this.outbox = []
    this.peers = new Map()
    this.writers = Object.fromEntries(WRITTEN.map(map => [map, new Map()]))
    this.dirtyWriters = Object.fromEntries(WRITTEN.map(map => [map, new Set()]))
    this.writersReady = false
    this.removedFlags = new Map()
    this.removalEpoch = 0
    this.equivocations = new Map()
    this.signedAt = new Map()
    // Bumped whenever a change's state may have changed; caches and listeners key on it.
    this.version = 0
    this.closed = false
    this.listeners = []
  }

  get boardActor() { return getActorId(this.board.doc()) }

  /** Indexes the board, signs this machine's unsigned changes of this load, restores its own missing entries and starts checking. */
  start() {
    this.refreshKeys()
    this.on('error', () => {})
    const listen = (emitter, event, listener) => { emitter.on(event, listener); this.listeners.push(() => emitter.off(event, listener)) }
    listen(this.board, 'heads-changed', () => this.indexBoard())
    listen(this.board, 'change', ({ patches }) => this.noteBoardPatches(patches))
    listen(this.signatures, 'change', ({ patches }) => this.noteSignaturePatches(patches))
    listen(this.repo, 'doc-metrics', event => this.noteMetrics(event))
    listen(this.repo.synchronizer, 'sync-state', event => this.noteSyncState(event))
    listen(this.repo.networkSubsystem, 'peer', ({ peerId }) => this.peers.set(peerId, { ...this.peers.get(peerId), connectedAt: this.now(), connected: true }))
    listen(this.repo.networkSubsystem, 'peer-disconnected', ({ peerId }) => {
      const peer = this.peers.get(peerId)
      if (peer) peer.connected = false
    })
    // A sync message that Automerge refuses (two changes with one actor and sequence number) is reported, not only logged.
    const synchronizer = this.repo.synchronizer
    const receive = synchronizer.receiveMessage.bind(synchronizer)
    synchronizer.receiveMessage = async message => {
      try { return await receive(message) } catch (error) {
        if (this.noteRefusedMessage(message, error)) return
        throw error
      }
    }
    this.listeners.push(() => { synchronizer.receiveMessage = receive })
    for (const peerId of this.repo.peers) this.peers.set(peerId, { connectedAt: this.now(), connected: true })
    this.indexBoard()
    this.restoreMissing()
    this.schedule()
    return this
  }

  /** Stops asking the hub, ahead of shutdown, so no request is started while the service closes. Checking and signing go on. */
  pause() {
    this.paused = true
    clearTimeout(this.resolveTimer)
    this.resolveTimer = null
  }

  close() {
    if (this.closed) return
    this.flushOutbox()
    this.closed = true
    for (const remove of this.listeners.splice(0)) remove()
    clearImmediate(this.workTimer)
    clearTimeout(this.resolveTimer)
    clearImmediate(this.outboxTimer)
  }

  // ---- Machines ----

  /** The machines that are or were members, by actor prefix: a change counts as signed only under one of their keys. */
  refreshKeys() {
    const membership = this.membership()
    this.keys = new Map()
    for (const machine of [...membership.machines, ...(membership.formerMachines ?? [])]) {
      const prefix = machinePrefix(machine.publicKey)
      const known = this.keys.get(prefix) ?? { machineId: machine.id, publicKey: machine.publicKey, personIds: [], agentsOnly: true }
      if (!known.personIds.includes(machine.personId)) known.personIds.push(machine.personId)
      known.agentsOnly &&= machine.agentsOnly === true
      this.keys.set(prefix, known)
    }
    this.removed = new Set(membership.removedMachines)
  }

  /** Records changed: a machine may now be known, or removed. */
  onMembership() {
    if (this.closed) return
    this.refreshKeys()
    for (const [hash, entry] of this.unsigned) if (['unknown-signer', 'missing', 'invalid'].includes(entry.reason)) this.queue.push(hash)
    this.removalEpoch++
    this.version++
    this.schedule()
  }

  // ---- Indexing and signing ----

  /** Indexes changes the board gained, synchronously: this load's own are signed at once, the rest queue for checking. */
  indexBoard() {
    if (this.closed) return
    const doc = this.board.doc()
    const metas = getChangesMetaSince(doc, this.indexed)
    if (!metas.length) return
    this.indexed = getHeads(doc)
    const own = this.boardActor
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
      if (meta.actor === own) {
        const signature = signChange(this.key, this.projectId, meta.hash)
        signed.push({ hash: meta.hash, machineId: this.machineId, signature })
        continue
      }
      this.unsigned.set(meta.hash, { reason: 'checking', firstSeenAt: this.now(), deliverer })
      this.queue.push(meta.hash)
    }
    if (signed.length) {
      // Saved before the board can be: a crash after the board's save still leaves the entry to restore.
      this.cache.add(signed)
      for (const entry of signed) this.signedAt.set(entry.hash, this.now())
      this.outbox.push(...signed)
      this.outboxTimer ??= setImmediate(() => { this.outboxTimer = null; this.flushOutbox() })
    }
    this.version++
    this.schedule()
  }

  /** Writes this machine's new signatures into the signature document in one change; automerge-repo saves and syncs it. */
  flushOutbox() {
    if (this.closed || !this.outbox.length) return
    const entries = this.outbox.splice(0)
    if (this.holdOutbox) { this.outbox.unshift(...entries); return }
    this.writeEntries(entries)
  }

  writeEntries(entries) {
    if (!entries.length) return
    this.signatures.change(doc => {
      for (const { hash, signature } of entries) {
        const shard = shardOf(hash)
        // Only the creator makes shards; one that is missing was deleted, so it is made again.
        if (!doc[shard] || typeof doc[shard] !== 'object') doc[shard] = {}
        doc[shard][hash] = signature
      }
    })
  }

  /**
   * Puts back every verified signature the shared document lacks, this machine's own included. Ed25519 is
   * deterministic, so an entry written back is the same bytes its writer made. Only signatures of changes in the
   * board are written: nothing this machine never checked is ever written.
   */
  restoreMissing(hashes = null) {
    if (this.closed) return 0
    const doc = this.signatures.doc()
    const missing = []
    const candidates = hashes ?? [...this.cache].map(([hash]) => hash)
    for (const hash of candidates) {
      const entry = this.cache.get(hash)
      if (!entry || !this.metas.has(hash)) continue
      if (!storedSignatures(doc, hash).some(value => Buffer.compare(Buffer.from(value), Buffer.from(entry.signature)) === 0)) missing.push({ hash, ...entry })
    }
    this.writeEntries(missing)
    return missing.length
  }

  // ---- Checking ----

  schedule() {
    if (this.closed) return
    if (this.queue.length || !this.writersReady || [...WRITTEN].some(map => this.dirtyWriters[map].size)) {
      this.workTimer ??= setImmediate(() => { this.workTimer = null; this.work() })
    }
    this.scheduleResolve()
  }

  /** One slice of checking, so a new replica's first full check shows progress and never blocks the board for long. */
  work() {
    if (this.closed) return
    const before = this.version
    if (!this.writersReady) {
      const doc = this.board.doc()
      for (const map of WRITTEN) for (const key of Object.keys(doc[map] ?? {})) this.dirtyWriters[map].add(key)
      this.writersReady = true
    }
    this.refreshWriters(this.chunkSize * 4)
    const batch = this.queue.splice(0, this.chunkSize)
    const verified = []
    for (const hash of new Set(batch)) {
      const entry = this.unsigned.get(hash)
      if (!entry || this.cache.has(hash)) { this.unsigned.delete(hash); continue }
      const outcome = this.check(hash)
      if (outcome.signed) { verified.push(outcome.signed); this.unsigned.delete(hash); continue }
      if (entry.reason !== outcome.reason || entry.claimed !== outcome.machineId) {
        Object.assign(entry, { reason: outcome.reason, claimed: outcome.machineId ?? null })
        this.version++
      }
    }
    if (verified.length) { this.cache.add(verified); this.version++ }
    if (this.version !== before) this.emit('update')
    this.schedule()
  }

  check(hash) {
    const meta = this.metas.get(hash)
    const prefix = actorPrefix(meta.actor)
    if (!prefix) return { reason: 'not-machine' }
    const signer = this.keys.get(prefix)
    if (!signer) return { reason: 'unknown-signer' }
    const stored = storedSignatures(this.signatures.doc(), hash)
    if (!stored.length) return { reason: 'missing', machineId: signer.machineId }
    const signature = stored.find(value => verifyChange(signer.publicKey, this.projectId, hash, value))
    return signature ? { signed: { hash, machineId: signer.machineId, signature } } : { reason: 'invalid', machineId: signer.machineId }
  }

  noteSignaturePatches(patches = []) {
    if (this.closed) return
    const touched = new Set(), deleted = new Set()
    for (const patch of patches) {
      const [shard, hash] = patch.path
      if (patch.path.length === 1 && typeof shard === 'string') {
        // A whole shard was replaced or deleted: everything in it is a candidate.
        for (const candidate of this.unsigned.keys()) if (shardOf(candidate) === shard) touched.add(candidate)
        for (const [candidate] of this.cache) if (shardOf(candidate) === shard) deleted.add(candidate)
      } else if (typeof hash === 'string' && HASH.test(hash)) {
        touched.add(hash)
        if (patch.action === 'del' || patch.action === 'put') deleted.add(hash)
      }
    }
    for (const hash of touched) if (this.unsigned.has(hash)) this.queue.push(hash)
    // An entry this peer verified that is gone or overwritten is put back, so peers that never saw it still can.
    const restore = [...deleted].filter(hash => this.cache.has(hash))
    if (restore.length) {
      this.restoreTimer ??= setImmediate(() => { this.restoreTimer = null; this.restoreMissing(restore) })
    }
    this.schedule()
  }

  // ---- Which peer delivered a change, and whether it has had its chance to send the signature ----

  noteMetrics(event) {
    if (event?.type !== 'receive-sync-message' || this.closed) return
    if (event.documentId === this.board.documentId) {
      // The receive is applied in this same synchronous step; any change it adds was delivered by this peer.
      this.delivering = event.fromPeer
      queueMicrotask(() => { if (this.delivering === event.fromPeer) this.delivering = null })
    } else if (event.documentId === this.signatures.documentId) {
      const peer = this.peers.get(event.fromPeer) ?? { connectedAt: this.now(), connected: true }
      peer.sigReceivedAt = this.now()
      this.peers.set(event.fromPeer, peer)
      this.scheduleResolve()
    }
  }

  noteSyncState({ peerId, documentId, syncState }) {
    if (documentId !== this.signatures.documentId || this.closed) return
    const peer = this.peers.get(peerId) ?? { connectedAt: this.now(), connected: true }
    if (Array.isArray(syncState?.theirHeads)) peer.sigHeads = [...syncState.theirHeads]
    this.peers.set(peerId, peer)
  }

  scheduleResolve() {
    if (this.closed || this.paused || this.resolveTimer || !this.unresolved().length) return
    const delay = this.role === 'replica' ? this.pollMs : Math.max(50, Math.min(250, this.quietMs / 4))
    this.resolveTimer = setTimeout(() => { this.resolveTimer = null; void this.resolve() }, delay)
    this.resolveTimer.unref?.()
  }

  unresolved() {
    return [...this.unsigned].filter(([, entry]) => entry.reason !== 'checking' && !entry.resolved)
  }

  /**
   * The rule that turns "pending" into "unattributed". On the hub, a change without a valid signature stays
   * pending while the machine that delivered it is disconnected, or connected but not yet caught up: this peer
   * must hold every signature-document change that machine has reported, and either a signature-document message
   * from it must have arrived after the change did, or `quietMs` must have passed on a live connection since the
   * change arrived. Messages on one connection arrive in the order they were sent, and a writer signs before its
   * board change is sent, so a writer that has a signature has sent it by then. On a member machine the peer that
   * delivered every change is the hub, which is asked for its own verdict: pending while the hub is, or while it
   * holds a signature that has not arrived here yet.
   */
  async resolve() {
    if (this.closed || this.paused) return
    const before = this.version
    if (this.role === 'replica') await this.resolveViaHub()
    else this.resolveLocally()
    if (this.version !== before) this.emit('update')
    this.scheduleResolve()
  }

  resolveLocally() {
    const sigDoc = this.signatures.doc()
    for (const [hash, entry] of this.unresolved()) {
      const verdict = this.localVerdict(hash, entry, sigDoc)
      if (canonical(verdict) === canonical(entry.waiting ?? null) && !verdict?.resolved) continue
      if (verdict.resolved) entry.resolved = { relayedBy: verdict.relayedBy ?? null }
      entry.waiting = verdict.resolved ? null : verdict
      this.version++
    }
  }

  localVerdict(hash, entry, sigDoc) {
    const meta = this.metas.get(hash)
    if (entry.reason === 'not-machine') return { resolved: true, relayedBy: entry.deliverer?.machineId ?? null }
    const author = this.keys.get(actorPrefix(meta.actor))?.machineId ?? null
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
      const fresh = (peer.sigReceivedAt ?? 0) > entry.firstSeenAt
      const quiet = now - Math.max(entry.firstSeenAt, peer.connectedAt ?? 0) >= this.quietMs
      if (inSync && (fresh || quiet)) return { resolved: true, relayedBy: this.peerMachine(peerId) ?? machineId }
    }
    return { waitingFor: machineId ?? this.peerMachine(live[0][0]) }
  }

  async resolveViaHub() {
    const open = this.unresolved().map(([hash]) => hash).slice(0, 500)
    if (!open.length || !this.askHub) return
    let states
    try { states = (await this.askHub(open))?.states } catch { return }
    if (this.closed || !states || typeof states !== 'object') return
    const verified = []
    for (const hash of open) {
      const entry = this.unsigned.get(hash), answer = states[hash]
      if (!entry || !answer) continue
      if (answer.state === 'signed' && typeof answer.signature === 'string') {
        const meta = this.metas.get(hash), signer = this.keys.get(actorPrefix(meta.actor))
        const signature = new Uint8Array(Buffer.from(answer.signature, 'base64url'))
        if (signer && verifyChange(signer.publicKey, this.projectId, hash, signature)) {
          verified.push({ hash, machineId: signer.machineId, signature })
          this.unsigned.delete(hash)
          continue
        }
      }
      const waiting = answer.state === 'unsigned' ? null : { waitingFor: answer.waitingFor ?? this.hubMachine() }
      if (answer.state === 'unsigned') {
        entry.resolved = { relayedBy: this.hubMachine(), origin: answer.relayedBy ?? null }
        entry.waiting = null
        this.version++
      } else if (canonical(waiting) !== canonical(entry.waiting ?? null)) {
        entry.waiting = waiting
        this.version++
      }
    }
    if (verified.length) {
      this.cache.add(verified)
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

  signerOf(meta) { return this.keys.get(actorPrefix(meta.actor))?.machineId ?? null }

  // ---- Which change wrote an Activity entry or a record ----

  noteBoardPatches(patches = []) {
    if (this.closed) return
    for (const patch of patches) {
      const [map, key] = patch.path
      if (WRITTEN.includes(map) && typeof key === 'string') this.dirtyWriters[map].add(key)
      else if (WRITTEN.includes(map) && patch.path.length === 1) this.writersReady = false
    }
    this.schedule()
  }

  refreshWriters(limit = Infinity) {
    const doc = this.board.doc()
    let done = 0
    for (const map of WRITTEN) {
      for (const key of this.dirtyWriters[map]) {
        if (done++ >= limit) return
        this.dirtyWriters[map].delete(key)
        const hashes = this.writerHashes(doc, map, key)
        if (hashes.length) this.writers[map].set(key, hashes)
        else this.writers[map].delete(key)
        if (map === 'membership') this.removalEpoch++
        this.version++
      }
    }
  }

  writerHashes(doc, map, key) {
    const container = doc[map]
    if (!container || typeof container !== 'object' || !Object.hasOwn(container, key)) return []
    const conflicts = getConflicts(container, key)
    const ops = conflicts ? Object.keys(conflicts) : [getObjectId(container, key)]
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
    const claimed = entry.claimed ?? this.keys.get(actorPrefix(meta.actor))?.machineId ?? null
    if (entry.resolved) {
      return { state: 'unattributed', reason: entry.reason, claimed, relayedBy: entry.resolved.origin ?? entry.resolved.relayedBy ?? null,
        ...(entry.resolved.origin ? { via: entry.resolved.relayedBy } : {}) }
    }
    return { state: 'pending', reason: entry.reason, claimed, waitingFor: entry.waiting?.waitingFor ?? null }
  }

  /** The Actor IDs a machine may act as: its persons' agents, and the persons themselves unless it is agents-only. */
  actorsOf(machineId) {
    const machine = [...this.keys.values()].find(entry => entry.machineId === machineId)
    if (!machine) return new Set()
    return new Set(machine.personIds.flatMap(personId => [...(machine.agentsOnly ? [] : [actorFor(personId)]), ...HARNESS_IDS.map(harness => actorFor(personId, harness))]))
  }

  /** The signers of each Activity entry: one per change that wrote it, with a flag when it claims an Actor its machine is not certified for. */
  operationSigners(events) {
    const result = {}
    for (const [operationId, event] of Object.entries(events)) {
      const hashes = this.writers.operations.get(operationId)
      if (!hashes) { result[operationId] = [{ state: 'pending', reason: 'checking' }]; continue }
      result[operationId] = hashes.map(hash => {
        const state = this.stateOf(hash)
        const mismatch = ['signed', 'removed'].includes(state.state) && !this.actorsOf(state.machineId).has(event.actorId)
        return { ...state, hash, ...(mismatch ? { actorMismatch: true } : {}) }
      })
    }
    return result
  }

  /** Each stored record's entry for Activity: who signed it and when it reached the board, in the change that wrote it. */
  recordEntries(records) {
    return records.map(record => {
      const hashes = this.writers.membership.get(record.recordId) ?? []
      const times = hashes.map(hash => this.metas.get(hash)?.time).filter(Number.isFinite)
      return { record, at: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null }
    })
  }

  /** Changes that need a person's review: unattributed, made by a removed machine, or claiming an Actor their machine is not certified for. */
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
    for (const machineId of this.removed) {
      if (![...this.cache].some(([, entry]) => entry.machineId === machineId)) continue
      for (const hash of this.removedAfter(machineId)) if (!byChange.has(hash)) byChange.set(hash, { hash, ...this.stateOf(hash), operations: [], actorMismatch: false })
    }
    return [...byChange.values()].filter(entry => ['unattributed', 'removed'].includes(entry.state) || entry.actorMismatch)
      .map(entry => ({ ...entry, at: Number.isFinite(this.metas.get(entry.hash)?.time) ? new Date(this.metas.get(entry.hash).time * 1000).toISOString() : null }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.hash.localeCompare(b.hash))
  }

  summary() {
    const key = `${this.version}:${this.removalEpoch}:${this.metas.size}:${this.queue.length}`
    if (this.summaryCache?.key === key) return this.summaryCache.value
    let signed = 0, removed = 0, pending = 0, unattributed = 0
    for (const hash of this.metas.keys()) {
      const { state } = this.stateOf(hash)
      if (state === 'signed') signed++
      else if (state === 'removed') removed++
      else if (state === 'pending') pending++
      else unattributed++
    }
    const checking = this.queue.length + [...this.unsigned.values()].filter(entry => entry.reason === 'checking').length
    const value = { changes: this.metas.size, signed, removed, pending, unattributed, checking: Math.min(checking, this.metas.size),
      equivocations: [...this.equivocations.values()].map(report => this.equivocationView(report)) }
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
    if (!['sync', 'request'].includes(message?.type) || !(message.data instanceof Uint8Array)) return false
    const handle = message.documentId === this.board.documentId ? this.board : message.documentId === this.signatures.documentId ? this.signatures : null
    if (!handle) return false
    let changes
    try { changes = changesInMessage(message.data) } catch { return false }
    const document = handle === this.board ? 'board' : 'signatures'
    const existing = handle === this.board ? null : new Map(getChangesMetaSince(handle.doc(), []).map(meta => [`${meta.actor}:${meta.seq}`, meta.hash]))
    let found = false
    for (const change of changes) {
      const held = handle === this.board ? this.byActor.get(change.actor)?.find(meta => meta.seq === change.seq)?.hash : existing.get(`${change.actor}:${change.seq}`)
      if (!held || held === change.hash) continue
      found = true
      const key = `${document}:${change.actor}:${change.seq}`
      if (this.equivocations.has(key)) continue
      this.equivocations.set(key, { document, actor: change.actor, seq: change.seq, machineId: this.keys.get(actorPrefix(change.actor))?.machineId ?? null,
        hashes: [held, change.hash], relayedBy: this.peerMachine(message.senderId), detectedAt: new Date(this.now()).toISOString(),
        detail: String(error?.message ?? '').slice(0, 200) })
    }
    if (found) { this.version++; this.emit('update') }
    return found
  }

  /**
   * An equivocation report with its proof checked now: a signature may arrive after its change. Only board changes
   * are signed, so a conflict in the signature document proves nothing about the machine its actor names.
   */
  equivocationView(report) {
    const signer = this.keys.get(actorPrefix(report.actor))
    const signed = report.hashes.map(hash => report.document === 'board' && Boolean(signer) && (this.cache.get(hash)?.machineId === signer.machineId
      || storedSignatures(this.signatures.doc(), hash).some(value => verifyChange(signer.publicKey, this.projectId, hash, value))))
    return { ...report, signed, proven: signed.every(Boolean) }
  }
}
