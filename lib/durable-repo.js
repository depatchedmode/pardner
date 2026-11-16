import { Repo } from '@automerge/automerge-repo'
import { getHeads } from '@automerge/automerge'

// Sync state only spares a peer a full exchange after a restart, so once a second per document and peer is enough.
const SYNC_STATE_SAVE_MS = 1000

/**
 * Persistence boundary for the pinned Repo 2.5.1 storage subsystem.
 * Upstream background saves are fire-and-forget and may outlive shutdown.
 * Serialize them with explicit saves, report failures, and drain before closing.
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
    this.saveDocument = storage.saveDoc.bind(storage)
    storage.saveDoc = (documentId) => this.background(() => this.persistDocument(documentId))
    for (const method of ['saveSyncState', 'removeDoc']) {
      const original = storage[method].bind(storage)
      storage[method] = (...args) => this.background(() => original(...args))
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
    if (JSON.stringify(previous) !== JSON.stringify(heads)) {
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
