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

/**
 * Persistence boundary for the pinned Repo 2.5.1 storage subsystem.
 * Upstream background saves are fire-and-forget and may outlive shutdown.
 * Serialize them with explicit saves, report failures, and drain before closing.
 * Stored documents are decoded here in one validated pass, and saved from here afterwards.
 */
export class DurableRepo extends Repo {
  constructor(options) {
    super(options)
    this.persistenceQueue = Promise.resolve()
    this.persistedHeads = new Map()
    this.storageError = null
    this.closing = false
    if (!this.storageSubsystem) throw new Error('DurableRepo requires storage')
    this.ready = this.networkSubsystem.peerMetadata
    this.ready.catch(error => {
      this.storageError = error
      this.emit('storage-error', error)
    })

    const storage = this.storageSubsystem
    const adapter = options.storage
    // For each document this process read from disk: the heads its stored chunks hold, and those chunks. Repo 2.5.1
    // keeps the same two facts privately and only fills them in its own loader, so a document loaded here is also
    // saved here, in Repo's chunk layout and by its compaction rule. Documents made or first received in this
    // process have no entry and are saved by Repo, whose bookkeeping starts with their first save.
    const stored = new Map()
    storage.loadDoc = async documentId => {
      const chunks = []
      for (const type of ['snapshot', 'incremental']) {
        for (const { key, data } of await adapter.loadRange([documentId, type])) {
          if (data !== undefined) chunks.push({ key, type, data })
        }
      }
      if (!chunks.length) return null
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
      stored.set(documentId, { heads, chunks: chunks.map(({ key, type, data }) => ({ key, type, size: data.length })) })
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
    const saveDocument = storage.saveDoc.bind(storage)
    this.saveDocument = async (documentId, doc) => {
      const entry = stored.get(documentId)
      if (!entry) return saveDocument(documentId, doc)
      const heads = getHeads(doc)
      // A read-only reopen writes nothing: these heads are already on disk.
      if (sameHeads(entry.heads, heads)) return
      const snapshots = sizeOf(entry.chunks, 'snapshot')
      if (snapshots < 1024 || sizeOf(entry.chunks, 'incremental') >= snapshots) {
        const snapshot = { key: [documentId, 'snapshot', sha256(heads.join(''))], type: 'snapshot' }
        const binary = save(doc)
        snapshot.size = binary.length
        await adapter.save(snapshot.key, binary)
        // The snapshot holds everything from here on. A failed removal below fails this save and is retried by the
        // next compaction; the chunks it leaves are still listed and still load.
        const replaced = entry.chunks.filter(chunk => chunk.key.join('/') !== snapshot.key.join('/'))
        entry.heads = heads
        entry.chunks = [...replaced, snapshot]
        for (const chunk of replaced) {
          await adapter.remove(chunk.key)
          entry.chunks.splice(entry.chunks.indexOf(chunk), 1)
        }
      } else {
        const binary = saveSince(doc, entry.heads)
        if (binary.length) {
          const key = [documentId, 'incremental', sha256(binary)]
          await adapter.save(key, binary)
          entry.chunks.push({ key, type: 'incremental', size: binary.length })
        }
        entry.heads = heads
      }
    }
    storage.saveDoc = (documentId) => this.background(() => this.persistDocument(documentId))
    for (const method of ['saveSyncState', 'removeDoc']) {
      const original = storage[method].bind(storage)
      storage[method] = (...args) => this.background(() => {
        if (method === 'removeDoc') stored.delete(args[0])
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
    this.closing = true
    await super.shutdown()
    await this.persistenceQueue
  }
}
