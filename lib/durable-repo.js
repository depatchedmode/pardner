import { createHash } from 'node:crypto'
import { Repo } from '@automerge/automerge-repo'
import { getHeads, load, save, saveSince, stats } from '@automerge/automerge'
import { sameHeads } from './heads.js'

// Sync state only spares a peer a full exchange after a restart, so once a second per document and peer is enough.
const SYNC_STATE_SAVE_MS = 1000
// Where Automerge keeps a document's own bookkeeping, including the patches of its most recent step.
const AUTOMERGE_STATE = Symbol.for('_am_meta')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const sizeOf = (chunks, type) => chunks.reduce((sum, chunk) => sum + (chunk.type === type ? chunk.size : 0), 0)
const largest = (chunks, type) => chunks.reduce((max, chunk) => chunk.type === type ? Math.max(max, chunk.size) : max, 0)
// Snapshot serialization can exhaust WASM32 well before the board itself fails to open. Keep it for small
// documents, with headroom above the signed 10k benchmark and below the failing 100k case. A byte guard
// also catches large individual chunks without permanently excluding a long tail of small changes.
const SNAPSHOT_MAX_OPS = 1_000_000
const SNAPSHOT_MAX_BYTES = 32 * 1024 * 1024
// Compact when incremental bytes reach this fraction of snapshot bytes. Lower values keep reopen
// faster; higher values snapshot less often and spend less time on the edit save path.
export const SNAPSHOT_INCREMENTAL_RATIO = 0.25
// Soft-due saves schedule an idle snapshot instead of blocking the acknowledgement. At this
// backstop ratio the save still snapshots inline so worst-case open matches the prior policy.
export const SNAPSHOT_BACKSTOP_RATIO = 1
// After a soft-due save, wait this long with no further saves for that document before compacting.
export const COMPACTION_IDLE_MS = 2000
const PACK_MAX_BYTES = 1024 * 1024
const PACK_MIN_CHUNKS = 8
const PACK_MAX_CHUNKS = 32

function packInputs(chunks, deltaBytes) {
  const inputs = []
  const maxInputBytes = Math.floor((PACK_MAX_BYTES - deltaBytes) / PACK_MIN_CHUNKS)
  let size = deltaBytes
  for (const chunk of chunks) {
    if (chunk.type !== 'incremental' || chunk.size > maxInputBytes || size + chunk.size > PACK_MAX_BYTES) continue
    inputs.push(chunk)
    size += chunk.size
    if (inputs.length === PACK_MAX_CHUNKS) break
  }
  return inputs.length >= PACK_MIN_CHUNKS ? inputs : []
}

const compactionKey = documentId => [documentId, 'incremental-compaction']
const chunkName = chunk => `${chunk.type}/${chunk.key[2]}`

// A crash can leave both the pack and some of its inputs on disk. The journal is only a cleanup hint:
// prove that each input's exact bytes are in the published pack before removing it. If publication
// never finished, or the hint is damaged, the validated Automerge chunks still suffice to reopen.
function recoverCompactionInputs(chunks, journal) {
  let plan
  try { plan = JSON.parse(Buffer.from(journal).toString()) } catch { return [] }
  if (typeof plan?.snapshot === 'string') {
    // Snapshot bytes differ from the changes they cover. Recover the writer's exact replacement
    // intent, sealed against damage, only when the immutable snapshot it published is present.
    const { snapshot, digest, inputs, checksum } = plan
    if (!Array.isArray(inputs) || sha256(JSON.stringify({ snapshot, digest, inputs })) !== checksum) return []
    const replacement = chunks.find(chunk => chunk.type === 'snapshot' && chunk.key[2] === snapshot)
    if (!replacement || sha256(replacement.data) !== digest) return []
    const covered = new Set(inputs)
    return chunks.filter(chunk => chunk !== replacement && covered.has(chunkName(chunk)))
  }
  if (!Array.isArray(plan?.inputs) || plan.inputs.length > PACK_MAX_CHUNKS) return []
  const pack = chunks.find(chunk => chunk.type === 'incremental' && chunk.key[2] === plan.pack)
  if (!pack || pack.data.length > PACK_MAX_BYTES || sha256(pack.data) !== plan.pack) return []
  const covered = new Set()
  let offset = 0
  for (const input of plan.inputs) {
    const size = input?.size
    if (!Number.isSafeInteger(size) || size <= 0 || offset + size >= pack.data.length) return []
    if (sha256(pack.data.subarray(offset, offset + size)) !== input.hash) return []
    covered.add(input.hash)
    offset += size
  }
  return chunks.filter(chunk => chunk !== pack && chunk.type === 'incremental' &&
    covered.has(chunk.key[2]) && sha256(chunk.data) === chunk.key[2])
}

/**
 * Persistence boundary for the pinned Repo 2.5.1 storage subsystem.
 * Upstream background saves are fire-and-forget and may outlive shutdown.
 * Serialize them with explicit saves, report failures, and drain before closing.
 * Stored documents are decoded here in one validated pass, and saved from here afterwards.
 */
export class DurableRepo extends Repo {
  constructor({ snapshotMaxOps = SNAPSHOT_MAX_OPS, compactionIdleMs = COMPACTION_IDLE_MS, ...options }) {
    super(options)
    this.persistenceQueue = Promise.resolve()
    this.persistedHeads = new Map()
    this.storageError = null
    this.closing = false
    this.compactionIdleMs = compactionIdleMs
    if (!this.storageSubsystem) throw new Error('DurableRepo requires storage')
    this.ready = this.networkSubsystem.peerMetadata
    this.ready.catch(error => {
      this.storageError = error
      this.emit('storage-error', error)
    })

    const storage = this.storageSubsystem
    const adapter = options.storage
    // Track the heads and chunks on disk for reopened and newly stored documents alike.
    const stored = new Map()
    // documentId → timeout handle for a soft-due idle compaction that has not started.
    const idleCompaction = new Map()
    const clearIdleCompaction = (documentId, reason) => {
      const timer = idleCompaction.get(documentId)
      if (timer === undefined) return false
      clearTimeout(timer)
      idleCompaction.delete(documentId)
      storage.emit('doc-compaction-dropped', { documentId, reason })
      return true
    }
    this.clearIdleCompaction = clearIdleCompaction
    this.idleCompactionTimers = idleCompaction
    storage.loadDoc = async documentId => {
      const chunks = []
      for (const type of ['snapshot', 'incremental']) {
        for (const { key, data } of await adapter.loadRange([documentId, type])) {
          if (data !== undefined) chunks.push({ key, type, data })
        }
      }
      if (!chunks.length) return null
      const journal = compactionKey(documentId)
      let plan, compaction = null
      try { plan = await adapter.load(journal) } catch (error) {
        // Leave the unreadable intent in place. This process can still save loose deltas.
        compaction = { state: 'journal-unreadable' }
        this.emit('storage-cleanup-error', { documentId, error })
      }
      const start = performance.now()
      let doc
      try {
        // One validated decode of every chunk, including overlapping snapshots left by an interrupted compaction.
        doc = load(Buffer.concat(chunks.map(chunk => chunk.data)))
      } catch (error) {
        // Repo's loader would open whatever the chunks before a damaged one hold and report it as saved, and its
        // next compaction would then remove the chunks it never read. Stop instead, with every file as it was.
        //
        // Repo would also leave this handle loading until its one-minute timeout, holding the process open after
        // the error is reported. Mark it as a document this process does not have, as Repo does for one that is
        // neither stored nor offered by a peer.
        const handle = this.handles[documentId]
        handle?.request()
        handle?.unavailable()
        throw Object.assign(new Error(`Stored document ${documentId} failed validation and was not opened: ${error.message}. `
          + `Its ${chunks.length} stored chunks are unchanged.`, { cause: error }), { code: 'DAMAGED_STORAGE' })
      }
      const heads = getHeads(doc)
      if (plan !== undefined) {
        const replaced = recoverCompactionInputs(chunks, plan)
        compaction = { state: 'cleanup-pending', keys: replaced.map(chunk => chunk.key), journal }
      }
      const chunkInfo = ({ key, type, data }) => ({ key, type, size: data.length })
      stored.set(documentId, { heads, chunks: chunks.map(chunkInfo), compaction })
      // DocHandle's first update asks Automerge for every patch from an empty document to these heads, only to
      // announce them in a change event nothing acts on: listeners are added once the handle is ready, and Repo's
      // synchronizer sends its first message from the ready handle either way. Answer that one question from
      // Automerge 3.2.3's patch cache with no patches, and forget the answer as it is read, so that any later
      // diff is computed. If Automerge stops reading this field, the handle diffs the whole document as before.
      const state = doc[AUTOMERGE_STATE]
      if (state && heads.length) {
        state.mostRecentPatch = { before: [], after: heads, get patches() { delete state.mostRecentPatch; return [] } }
      }
      storage.emit('document-loaded', { documentId, durationMillis: performance.now() - start, ...stats(doc) })
      return doc
    }
    const cleanUp = async (documentId, entry) => {
      const { keys, journal } = entry.compaction
      try {
        for (const key of keys) await adapter.remove(key)
        await adapter.remove(journal)
        const removed = new Set(keys)
        entry.chunks = entry.chunks.filter(chunk => !removed.has(chunk.key))
        entry.compaction = null
      } catch (error) {
        this.emit('storage-cleanup-error', { documentId, error })
      }
    }
    const publish = async (documentId, entry, heads, chunk, bytes, replaced = [], plan) => {
      const journal = replaced.length ? compactionKey(documentId) : null
      if (journal) await adapter.save(journal, Buffer.from(JSON.stringify(plan)))
      if (bytes.length) {
        await adapter.save(chunk.key, bytes)
        entry.chunks.push({ ...chunk, size: bytes.length })
      }
      entry.heads = heads
      if (journal) {
        entry.compaction = { state: 'cleanup-pending', keys: replaced.map(input => input.key), journal }
        await cleanUp(documentId, entry)
      }
    }
    const publishSnapshot = async (documentId, entry, doc, heads, start) => {
      const binary = save(doc)
      const key = [documentId, 'snapshot', sha256(heads.join(''))]
      storage.emit('doc-compacted', { documentId, durationMillis: performance.now() - start, savedHeads: heads })
      const replaced = entry.chunks.filter(chunk => chunk.type !== 'snapshot' || chunk.key[2] !== key[2])
      const plan = { snapshot: key[2], digest: sha256(binary), inputs: replaced.map(chunkName) }
      await publish(documentId, entry, heads, { key, type: 'snapshot' }, binary, replaced,
        { ...plan, checksum: sha256(JSON.stringify(plan)) })
      clearIdleCompaction(documentId, 'compacted')
    }

    const scheduleIdleCompaction = documentId => {
      if (this.closing) return
      const previous = idleCompaction.get(documentId)
      if (previous !== undefined) clearTimeout(previous)
      const timer = setTimeout(() => {
        idleCompaction.delete(documentId)
        // persistenceQueue serializes this with saves; background() drops it once closing.
        this.background(() => this.compactDocument(documentId))
      }, this.compactionIdleMs)
      timer.unref?.()
      idleCompaction.set(documentId, timer)
    }

    this.compactDocument = async documentId => {
      const handle = this.handles[documentId]
      if (!handle?.isReady()) return
      const doc = handle.doc()
      const entry = stored.get(documentId)
      if (!entry) return
      if (entry.compaction?.state === 'cleanup-pending') await cleanUp(documentId, entry)
      if (entry.compaction) return
      const heads = getHeads(doc)
      const snapshots = sizeOf(entry.chunks, 'snapshot')
      const incrementals = sizeOf(entry.chunks, 'incremental')
      const softDue = snapshots < 1024 || incrementals >= snapshots * SNAPSHOT_INCREMENTAL_RATIO
      if (!softDue) return
      const withinByteBudget = largest(entry.chunks, 'snapshot') + largest(entry.chunks, 'incremental') <= SNAPSHOT_MAX_BYTES
      const withinOpBudget = stats(doc).numOps <= snapshotMaxOps
      if (!withinByteBudget || !withinOpBudget) return
      await publishSnapshot(documentId, entry, doc, heads, performance.now())
    }

    this.saveDocument = async (documentId, doc) => {
      const entry = stored.get(documentId) ?? { heads: [], chunks: [], compaction: null }
      stored.set(documentId, entry)
      if (entry.compaction?.state === 'cleanup-pending') await cleanUp(documentId, entry)
      const heads = getHeads(doc)
      // A read-only reopen can resume cleanup. It never rewrites the stored document.
      if (sameHeads(entry.heads, heads)) return
      const snapshots = sizeOf(entry.chunks, 'snapshot')
      const incrementals = sizeOf(entry.chunks, 'incremental')
      const softDue = snapshots < 1024 || incrementals >= snapshots * SNAPSHOT_INCREMENTAL_RATIO
      const hardDue = snapshots < 1024 || incrementals >= snapshots * SNAPSHOT_BACKSTOP_RATIO
      const needsInitialSnapshot = !entry.chunks.length
      const withinByteBudget = largest(entry.chunks, 'snapshot') + largest(entry.chunks, 'incremental') <= SNAPSHOT_MAX_BYTES
      const canCompact = !entry.compaction
      const start = performance.now()
      const withinOpBudget = !(softDue || needsInitialSnapshot) || stats(doc).numOps <= snapshotMaxOps
      if (needsInitialSnapshot && !withinOpBudget) {
        throw Object.assign(new Error('The initial document is too large to save as a snapshot. A stored checkpoint is required.'), {
          code: 'INITIAL_DOCUMENT_TOO_LARGE',
        })
      }
      // Initial checkpoint and the ratio-1.0 backstop still snapshot on the acknowledgement path.
      if (canCompact && (needsInitialSnapshot || hardDue) && withinByteBudget && withinOpBudget) {
        return publishSnapshot(documentId, entry, doc, heads, start)
      }
      const delta = saveSince(doc, entry.heads)
      const inputs = canCompact && delta.length > 0 && (softDue || !withinByteBudget) ? packInputs(entry.chunks, delta.length) : []
      let binary = delta
      if (inputs.length) {
        const parts = await Promise.all(inputs.map(async ({ key, size }) => {
          const data = await adapter.load(key)
          if (data?.length !== size || sha256(data) !== key[2]) throw new Error(`Stored incremental chunk changed: ${key.join('/')}`)
          return data
        }))
        binary = Buffer.concat([...parts, delta])
      }
      const key = [documentId, 'incremental', sha256(binary)]
      storage.emit('doc-saved', { documentId, durationMillis: performance.now() - start, sinceHeads: entry.heads, savedHeads: heads })
      const plan = { pack: key[2], inputs: inputs.map(input => ({ hash: input.key[2], size: input.size })) }
      await publish(documentId, entry, heads, { key, type: 'incremental' }, binary, inputs, plan)
      // Soft-due: acknowledge the incremental first, then compact once the document is idle.
      if (canCompact && softDue && !hardDue && withinByteBudget && withinOpBudget) {
        scheduleIdleCompaction(documentId)
      } else {
        clearIdleCompaction(documentId, 'not-due')
      }
    }
    storage.saveDoc = (documentId) => this.background(() => this.persistDocument(documentId))
    for (const method of ['saveSyncState', 'removeDoc']) {
      const original = storage[method].bind(storage)
      storage[method] = (...args) => this.background(async () => {
        if (method === 'removeDoc') {
          stored.delete(args[0])
          await adapter.remove(compactionKey(args[0]))
        }
        return original(...args)
      })
    }
    // Repo 2.5.1 throttles sync-state saves per peer, not per document, so with more than one document per peer
    // (a board and its signature document) only the last document's state in each window was saved. Each
    // document's own latest state is also saved, at most once a second, through the same background queue.
    const pending = new Map()
    this.synchronizer.on('sync-state', ({ peerId, documentId, syncState }) => {
      const { storageId, isEphemeral } = this.peerMetadataByPeerId[peerId] ?? {}
      if (!storageId || isEphemeral) return
      const key = `${documentId}/${storageId}`
      const entry = pending.get(key) ?? {}
      entry.syncState = syncState
      pending.set(key, entry)
      entry.timer ??= setTimeout(() => {
        pending.delete(key)
        void storage.saveSyncState(documentId, storageId, entry.syncState)
      }, SYNC_STATE_SAVE_MS).unref()
    })
  }

  /**
   * Repo 2.5.1 arms the caller's abort signal before it loads, and when the load fails nothing is left awaiting it:
   * a timeout signal then ends the process with an unhandled AbortError seconds after the real error was reported.
   * The caller's signal is passed on only until this find settles.
   *
   * Without a signal this must stay Repo's own promise, untouched. Repo's synchronizer calls find for every sync
   * message it receives, and one more turn of the microtask queue there changes when a change and its signature
   * are applied (test/signed-changes.test.js, the slow link).
   */
  find(id, options = {}) {
    const { signal } = options
    if (!signal) return super.find(id, options)
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    return super.find(id, { ...options, signal: controller.signal }).finally(() => signal.removeEventListener('abort', abort))
  }

  enqueue(operation) {
    const result = this.persistenceQueue.then(operation)
    this.persistenceQueue = result.catch(() => {})
    return result
  }

  background(operation) {
    if (this.closing) return Promise.resolve()
    return this.enqueue(operation).catch(error => {
      this.storageError = error
      this.emit('storage-error', error)
    })
  }

  async persistDocument(documentId) {
    // Use the current document, never an older throttled event's snapshot.
    const handle = this.handles[documentId]
    if (!handle?.isReady()) return
    const doc = handle.doc()
    await this.saveDocument(documentId, doc)
    const heads = getHeads(doc)
    const previous = this.persistedHeads.get(documentId)
    this.persistedHeads.set(documentId, heads)
    if (!sameHeads(previous, heads)) {
      this.emit('document-persisted', { documentId, heads })
    }
  }

  async flush(documents = Object.keys(this.handles)) {
    await this.ready
    return this.enqueue(async () => {
      try {
        for (const documentId of documents) await this.persistDocument(documentId)
        this.storageError = null
      } catch (error) {
        this.storageError = error
        throw error
      }
    })
  }

  async shutdown() {
    // Drop pending idle timers before closing so the drop is recorded; an already-queued
    // compaction still drains below. Timers that fire in this window hit background()'s closing check.
    for (const documentId of [...(this.idleCompactionTimers?.keys() ?? [])]) {
      this.clearIdleCompaction?.(documentId, 'shutdown')
    }
    this.closing = true
    await super.shutdown()
    await this.persistenceQueue
  }
}
