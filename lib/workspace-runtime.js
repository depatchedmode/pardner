import { EventEmitter } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { getHeads, hasHeads } from '@automerge/automerge'
import { isValidAutomergeUrl, parseAutomergeUrl } from '@automerge/automerge-repo'
import { atomicWrite } from './atomic-file.js'
import { DeliveryLedger } from './delivery-ledger.js'
import { DurableRepo } from './durable-repo.js'
import { generateMachineKey } from './machine-key.js'
import { buildRecord, verifyRecord } from './membership.js'
import { NodeFSStorageAdapter } from './nodefs-storage-adapter.js'
import { RECORD_STORE_FILE, RecordStore } from './record-store.js'
import { acquireStorageLease } from './storage-lease.js'
import { TicketNetworkAdapter } from './ticket-network-adapter.js'
import { requestJson } from './sync-client.js'
import { Workspace, createWorkspaceData } from './workspace.js'
import { SCHEMA_VERSION, activeMentions, canonical, plain, requireValue, resolveActor } from './workspace-schema.js'

const PROJECT_ID = /^[a-f0-9]{64}$/
const NOT_STORED_LIMIT = 100
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Hand-run hubs (`pardner serve --role hub`) have no client directory and
 * are retired with the machine-key handshake. Their genesis is signed by a
 * one-time key that is not kept, so they never sign another record.
 */
function handRunGenesis() {
  return buildRecord(generateMachineKey(), { kind: 'project.genesis', subject: 'hub-operator', displayName: 'Hub operator',
    nonce: randomBytes(32).toString('base64url') })
}

export class WorkspaceRuntime extends EventEmitter {
  constructor({ directory, role = 'hub', hubUrl, hubWsUrl, token, replicaCredentialId, replicaToken, actors = [], genesis, retryMs = 1000 }) {
    super()
    requireValue(directory, 'Specify a Pardner storage directory')
    requireValue(['hub', 'replica'].includes(role), 'Runtime role must be hub or replica')
    this.directory = directory
    this.role = role
    this.hubUrl = hubUrl?.replace(/\/$/, '')
    this.hubWsUrl = hubWsUrl
    this.token = token
    this.replicaCredentialId = replicaCredentialId
    this.replicaToken = replicaToken
    this.actors = actors
    this.genesis = genesis
    this.retryMs = Math.min(retryMs, 2000)
    this.stopController = new AbortController()
    this.manifestPath = join(directory, 'workspace.json')
    this.initialized = false
    this.closed = false
    this.lastSyncError = null
    this.acknowledgedHeads = []
    this.harvests = Promise.resolve()
    this.notStored = new Map()
    this.recordStoreError = null
  }

  async init() {
    requireValue(!this.closed, 'Create a new runtime to reopen this workspace', 'LOCAL_SERVICE_UNAVAILABLE')
    if (this.initialized) return this
    this.lease = await acquireStorageLease(this.directory)
    try {
      try { this.manifest = JSON.parse(await readFile(this.manifestPath, 'utf8')) } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (this.manifest) {
        requireValue(this.manifest.schemaVersion === SCHEMA_VERSION && isValidAutomergeUrl(this.manifest.url) && PROJECT_ID.test(this.manifest.workspaceId),
          'This storage directory was made by an earlier Pardner version and is left unchanged; start Pardner with a fresh data directory', 'INCOMPATIBLE_SCHEMA')
        requireValue(this.manifest.role === this.role, 'Use the role recorded for this storage directory', 'ROLE_MISMATCH')
        this.hubUrl ??= this.manifest.hubUrl
        this.hubWsUrl ??= this.manifest.hubWsUrl
      } else {
        const entries = await readdir(this.directory)
        // A record store without metadata is a creation interrupted after saving its genesis.
        requireValue(entries.every(name => name.startsWith('runtime-lock.sqlite') || name.startsWith(RECORD_STORE_FILE) || name.includes('.pardner-tmp-')),
          'This directory contains data without compatible workspace metadata; choose a new directory', 'INCOMPATIBLE_SCHEMA')
        if (this.role === 'hub') {
          this.genesis ??= handRunGenesis()
          requireValue(this.genesis?.kind === 'project.genesis' && verifyRecord(this.genesis, this.genesis.projectId).valid,
            'A new project needs a valid signed genesis record', 'INVALID_GENESIS')
        }
        const identity = this.role === 'replica' ? await this.fetchHubIdentity() : { workspaceId: this.genesis.projectId }
        this.manifest = {
          schemaVersion: SCHEMA_VERSION, role: this.role, replicaId: `replica-${randomUUID()}`,
          workspaceId: identity.workspaceId, ...(identity.url ? { url: identity.url } : {}), state: 'enrolling',
        }
      }
      this.records = new RecordStore(join(this.directory, RECORD_STORE_FILE), this.manifest.workspaceId)
      // The creator saves its genesis before any document holds it.
      if (!this.manifest.url && this.role === 'hub') this.records.admit([this.genesis])
      let allowedDocumentId = this.manifest.url ? parseAutomergeUrl(this.manifest.url).documentId : null
      this.repo = new DurableRepo({
        storage: new NodeFSStorageAdapter(join(this.directory, 'repo')),
        shareConfig: {
          announce: async (_peer, id) => id === allowedDocumentId,
          access: async (_peer, id) => id === allowedDocumentId,
        },
      })
      await this.repo.ready
      let handle
      if (!this.manifest.url) {
        handle = this.repo.create(createWorkspaceData({ actors: this.actors, genesis: this.records.genesis() }))
        this.manifest.url = handle.url
        allowedDocumentId = handle.documentId
      }
      if (this.role === 'replica') {
        requireValue(this.hubUrl && this.hubWsUrl, 'Configure the hub HTTP URL and native WebSocket URL')
        this.manifest.hubUrl = this.hubUrl
        this.manifest.hubWsUrl = this.hubWsUrl
      }
      await this.saveManifest()
      if (this.role === 'replica' && this.manifest.state !== 'ready') this.startNetwork()
      handle ??= await this.repo.find(this.manifest.url, { signal: AbortSignal.timeout(8000) })
      requireValue(handle.doc().workspaceId === this.manifest.workspaceId, 'Workspace identity does not match its metadata', 'WORKSPACE_MISMATCH')
      this.workspace = new Workspace({ repo: this.repo, handle, replicaId: this.manifest.replicaId })
      this.harvestRecords()
      requireValue(this.records.genesis(), 'The document has no valid genesis for this project ID; preserve this directory', 'WORKSPACE_MISMATCH')
      this.repo.on('storage-error', () => this.emitStatus())
      this.repo.on('document-persisted', ({ documentId }) => {
        if (documentId !== handle.documentId || !this.initialized) return
        this.emitStatus()
        this.scheduleSync()
      })
      handle.on('change', () => {
        if (!this.initialized) return
        this.scheduleHarvest()
        this.emit('change')
        this.emitStatus()
        this.scheduleSync()
      })
      await this.repo.flush([handle.documentId])
      this.manifest.state = 'ready'
      await this.saveManifest()
      if (this.role === 'hub') this.deliveryLedger = new DeliveryLedger(join(this.directory, 'deliveries.sqlite'))
      this.initialized = true
      if (this.role === 'replica' && !this.adapter) this.startNetwork()
      this.scheduleSync()
      return this
    } catch (error) {
      try { await this.close() } catch { /* Preserve the initialization failure. */ }
      throw error
    }
  }

  saveManifest() {
    return atomicWrite(this.manifestPath, `${JSON.stringify(this.manifest, null, 2)}\n`)
  }

  requestHub(path, options = {}, signal = this.stopController.signal) {
    requireValue(this.hubUrl, 'Configure PARDNER_HUB_URL before enrolling a replica')
    return requestJson(this.hubUrl, path, { ...options, token: this.token,
      signal: AbortSignal.any([signal, this.stopController.signal, AbortSignal.timeout(2000)]) })
  }

  async fetchHubIdentity(signal) {
    const identity = await this.requestHub('/automerge/url', {}, signal)
    requireValue(identity.schemaVersion === SCHEMA_VERSION && isValidAutomergeUrl(identity.url) && typeof identity.workspaceId === 'string',
      'The hub does not expose a compatible Pardner workspace', 'INCOMPATIBLE_SCHEMA')
    requireValue(PROJECT_ID.test(identity.workspaceId), 'The hub does not expose a project ID derived from a genesis', 'INCOMPATIBLE_SCHEMA')
    return identity
  }

  startNetwork() {
    this.adapter = new TicketNetworkAdapter({ retryMs: this.retryMs, getUrl: async signal => {
      const identity = await this.fetchHubIdentity(signal)
      requireValue(identity.url === this.manifest.url && identity.workspaceId === this.manifest.workspaceId,
        'The configured hub belongs to a different workspace', 'WORKSPACE_MISMATCH')
      const { ticket } = await this.requestHub('/automerge/ws-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pardner-replica-token': this.replicaToken ?? '' },
        body: JSON.stringify({ purpose: 'replica', replicaId: this.replicaCredentialId }),
      }, signal)
      requireValue(typeof ticket === 'string' && ticket.length > 0, 'The hub did not issue a WebSocket ticket')
      const url = new URL(this.hubWsUrl)
      if (url.pathname === '/') url.pathname = '/automerge'
      url.search = new URLSearchParams({ ticket }).toString()
      return url.toString()
    } })
    this.adapter.on('transport-state', ({ state, error }) => {
      this.lastSyncError = error
      this.emitStatus()
      if (state === 'connected') this.scheduleSync()
    })
    this.repo.networkSubsystem.addNetworkAdapter(this.adapter)
  }

  status() {
    const heads = this.workspace ? getHeads(this.workspace.handle.doc()) : []
    const persisted = this.repo?.persistedHeads.get(this.workspace?.handle.documentId) ?? []
    const savedLocally = this.initialized && canonical(heads) === canonical(persisted)
    return {
      role: this.role, workspaceId: this.manifest?.workspaceId ?? null,
      heads,
      replicaId: this.manifest?.replicaId ?? null, savedLocally,
      hubConnected: this.role === 'hub' || this.adapter?.state === 'connected',
      syncPending: !savedLocally || (this.role === 'replica' && canonical(heads) !== canonical(this.acknowledgedHeads)),
      lastSyncedAt: this.lastSyncedAt ?? null,
      storageError: this.repo?.storageError?.message ?? null, syncError: this.lastSyncError,
      recordStoreError: this.recordStoreError,
    }
  }

  /**
   * Stores the document's new valid membership records, then writes every
   * stored record the document lacks back into it, so a record removed from
   * the document still counts and reaches other peers again. Refused records
   * are not stored; they are reported until this runtime stops.
   */
  harvestRecords() {
    const doc = this.workspace.handle.doc()
    const map = isMap(doc.membership) ? plain(doc.membership) : {}
    // Admission depends only on the records offered and the store, which only grows: unchanged inputs change nothing.
    const seen = `${this.records.size}:${canonical(map)}`
    if (seen === this.harvested) return
    const { accepted, refused } = this.records.admit(Object.values(map))
    for (const record of accepted) this.notStored.delete(canonical(record))
    for (const { record, reason } of refused) {
      const key = canonical(record)
      this.notStored.delete(key)
      this.notStored.set(key, { recordId: typeof record?.recordId === 'string' ? record.recordId : null, reason })
      if (this.notStored.size > NOT_STORED_LIMIT) this.notStored.delete(this.notStored.keys().next().value)
    }
    const missing = this.records.all().filter(record => canonical(map[record.recordId] ?? null) !== canonical(record))
    if (missing.length) this.workspace.handle.change(doc => {
      if (!isMap(doc.membership)) doc.membership = {}
      for (const record of missing) doc.membership[record.recordId] = record
    })
    else this.harvested = seen
  }

  /** Harvests after document changes, whether local or received by sync; a burst of changes needs one pass. */
  scheduleHarvest() {
    if (this.harvestQueued || this.stopController.signal.aborted) return
    this.harvestQueued = true
    this.harvests = this.harvests.then(() => {
      this.harvestQueued = false
      if (this.stopController.signal.aborted) return
      const previous = this.recordStoreError
      try {
        this.harvestRecords()
        this.recordStoreError = null
      } catch (error) {
        this.recordStoreError = error.message
      }
      if (this.recordStoreError !== previous) this.emitStatus()
    })
  }

  membership() {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    return { ...this.records.membership(), storedRecords: this.records.size, notStored: [...this.notStored.values()] }
  }

  emitStatus() {
    if (this.initialized) this.emit('status', this.status())
  }

  scheduleSync(delay = 30) {
    if (!this.initialized || this.role !== 'replica' || this.stopController.signal.aborted) return
    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => { void this.synchronizeAcknowledgement() }, delay)
  }

  async synchronizeAcknowledgement() {
    if (this.syncing || this.stopController.signal.aborted) return
    this.syncing = true
    try {
      if (!this.status().savedLocally) await this.repo.flush([this.workspace.handle.documentId])
      const requestedHeads = getHeads(this.workspace.handle.doc())
      const receipt = await this.requestHub('/automerge/sync-ack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: this.manifest.workspaceId, heads: requestedHeads }),
      })
      if (receipt.acknowledged) {
        const doc = this.workspace.handle.doc()
        requireValue(Array.isArray(receipt.hubHeads), 'Invalid hub persistence acknowledgement')
        if (canonical(getHeads(doc)) === canonical(requestedHeads) && hasHeads(doc, receipt.hubHeads)) {
          await this.repo.flush([this.workspace.handle.documentId])
          if (canonical(getHeads(this.workspace.handle.doc())) === canonical(requestedHeads)) {
            this.acknowledgedHeads = requestedHeads
            this.lastSyncedAt = new Date().toISOString()
          }
        }
      }
      this.lastSyncError = null
    } catch (error) {
      if (!this.stopController.signal.aborted) this.lastSyncError = error.message
    } finally {
      this.syncing = false
      this.emitStatus()
      if (this.status().syncPending) this.scheduleSync(this.retryMs)
    }
  }

  async execute(request) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub' || request.type !== 'actor.register', 'Register new Actors on the hub', 'HUB_REQUIRED')
    const receipt = await this.workspace.execute(request)
    const status = this.status()
    return { ...receipt, syncPending: status.syncPending, status }
  }

  async acknowledge(workspaceId, heads) {
    requireValue(this.role === 'hub', 'Only the hub can acknowledge synchronization', 'HUB_REQUIRED')
    requireValue(workspaceId === this.manifest.workspaceId, 'Workspace identity does not match this hub', 'WORKSPACE_MISMATCH')
    requireValue(Array.isArray(heads) && heads.every(head => typeof head === 'string' && /^[a-f0-9]{64}$/.test(head)), 'Supply Automerge heads')
    return this.workspace.acknowledge(heads)
  }

  async prepareDelivery(actor) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub', 'New deliveries require the hub', 'HUB_REQUIRED')
    const doc = this.workspace.handle.doc()
    const actorId = actor ? resolveActor(doc, actor).id : null
    await this.repo.flush([this.workspace.handle.documentId])
    this.deliveryLedger.reconcile(Object.values(doc.mentions), activeMentions(doc).map(mention => mention.id))
    return actorId
  }

  async claimDelivery({ actorId, requestId, ttlMs }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    if (this.role === 'replica') return this.forwardDelivery('/automerge/deliveries/claim', { actorId, requestId, ttlMs })
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.claim(recipient, requestId, ttlMs)
  }

  async acknowledgeDelivery({ actorId, mentionId, claimToken }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    if (this.role === 'replica') return this.forwardDelivery('/automerge/deliveries/ack', { actorId, mentionId, claimToken })
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.acknowledge(recipient, mentionId, claimToken)
  }

  async releaseDelivery({ actorId, mentionId, claimToken }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    if (this.role === 'replica') return this.forwardDelivery('/automerge/deliveries/release', { actorId, mentionId, claimToken })
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.release(recipient, mentionId, claimToken)
  }

  async pendingDeliveries(actorId) {
    if (this.role === 'replica') return this.forwardDelivery(`/automerge/deliveries${actorId ? `?actor=${encodeURIComponent(actorId)}` : ''}`)
    return { mentions: this.deliveryLedger.pending(await this.prepareDelivery(actorId)) }
  }

  async forwardDelivery(path, body) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    try {
      return await this.requestHub(path, body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
    } catch (error) {
      if (error.isTransport) error.code = 'HUB_UNAVAILABLE'
      throw error
    }
  }

  get docHandle() { return this.workspace?.handle }
  getDoc() { return this.workspace.snapshot() }
  async getAgents() { return Object.values(this.workspace.handle.doc().actors) }

  close() {
    this.closePromise ??= this.closeResources()
    return this.closePromise
  }

  async closeResources() {
    if (this.closed) return
    this.stopController.abort()
    clearTimeout(this.syncTimer)
    this.adapter?.disconnect()
    try {
      await this.workspace?.queue
      await this.harvests
      await this.repo?.shutdown()
    } finally {
      this.initialized = false
      this.closed = true
      this.deliveryLedger?.close()
      this.records?.close()
      this.lease?.close()
      this.lease = null
    }
  }
}
