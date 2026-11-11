import { Repo } from '@automerge/automerge-repo'
import { getHeads, load, stats } from '@automerge/automerge'

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
    const loadedHeads = new Map()
    const saveDocument = storage.saveDoc.bind(storage)
    storage.loadDoc = async documentId => {
      // Keep upstream chunk discovery/bookkeeping, including overlapping snapshots
      // left by interrupted compaction. load validates the combined binary.
      const binary = await storage.loadDocData(documentId)
      if (!binary) return null
      const start = performance.now()
      const doc = load(binary)
      loadedHeads.set(documentId, getHeads(doc))
      storage.emit('document-loaded', { documentId, durationMillis: performance.now() - start, ...stats(doc) })
      return doc
    }
    this.saveDocument = async (documentId, doc) => {
      const heads = loadedHeads.get(documentId)
      if (heads && JSON.stringify(heads) === JSON.stringify(getHeads(doc))) return
      // Repo's private stored-head map was not initialized by our loader. Its
      // first save therefore writes the full history, then resumes incrementals.
      // Retain the loaded baseline if that write fails, so retry still persists.
      await saveDocument(documentId, doc)
      loadedHeads.delete(documentId)
    }
    storage.saveDoc = (documentId) => this.background(() => this.persistDocument(documentId))
    for (const method of ['saveSyncState', 'removeDoc']) {
      const original = storage[method].bind(storage)
      storage[method] = (...args) => this.background(() => {
        if (method === 'removeDoc') loadedHeads.delete(args[0])
        return original(...args)
      })
    }
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
