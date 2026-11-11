import { EventEmitter } from 'node:events'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { clone, from, getHeads, hasHeads, save } from '@automerge/automerge'
import { generateAutomergeUrl, isValidAutomergeUrl, parseAutomergeUrl } from '@automerge/automerge-repo'
import { atomicWrite } from './atomic-file.js'
import { ChangeAttribution } from './attribution.js'
import { createSignaturesData, machineActor, signaturesDocumentId } from './change-signatures.js'
import { DeliveryLedger } from './delivery-ledger.js'
import { DurableRepo } from './durable-repo.js'
import { aheadOf, checkpointValid, initiateHandshake, newRun, newerCheckpoint, signCheckpoint } from './machine-handshake.js'
import { generateMachineKey, personIdFor } from './machine-key.js'
import { SessionClient } from './machine-session.js'
import { buildRecord, computeMembership, isMember, maySign, verifyRecord } from './membership.js'
import { NodeFSStorageAdapter } from './nodefs-storage-adapter.js'
import { RECORD_STORE_FILE, RecordStore } from './record-store.js'
import { SIGNATURE_CACHE_FILE, SignatureCache } from './signature-cache.js'
import { acquireStorageLease } from './storage-lease.js'
import { TicketNetworkAdapter } from './ticket-network-adapter.js'
import { requestJson } from './sync-client.js'
import { Workspace, createWorkspaceData } from './workspace.js'
import { OperationError, SCHEMA_VERSION, activeMentions, canonical, plain, requireValue, resolveActor } from './workspace-schema.js'
import { storageValue } from './workspace-values.js'

const PROJECT_ID = /^[a-f0-9]{64}$/
const NOT_STORED_LIMIT = 100
const HUB_STATE_FILE = 'hub-state.json'
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The standalone agent and integration service (`pardner serve`) has no
 * client directory and serves no other machine. Its genesis is signed by a
 * one-time key that is not kept, so it never signs another record.
 */
function standaloneGenesis() {
  const key = generateMachineKey()
  return buildRecord(key, { kind: 'project.genesis', subject: personIdFor(key.publicKey), displayName: 'Hub operator',
    nonce: randomBytes(32).toString('base64url') })
}

/**
 * One project's replica: the hub's copy, or a member machine's. Machines
 * reach each other only with their machine keys (lib/machine-handshake.js):
 * a replica opens its sync socket with the handshake and signs its
 * acknowledgement requests; a hub with a machine key answers both. A hub
 * without a machine key serves no other machine.
 */
export class WorkspaceRuntime extends EventEmitter {
  constructor({ directory, role = 'hub', hubUrl, hubWsUrl, machineKey = null, projectId = null, actors = [], genesis, retryMs = 1000, attribution = {} }) {
    super()
    requireValue(directory, 'Specify a Pardner storage directory')
    requireValue(['hub', 'replica'].includes(role), 'Runtime role must be hub or replica')
    requireValue(role === 'hub' || machineKey, 'A replica connects to its hub with its machine key', 'MACHINE_KEY_UNAVAILABLE')
    this.directory = directory
    this.role = role
    this.hubUrl = hubUrl?.replace(/\/$/, '')
    this.hubWsUrl = hubWsUrl
    this.machineKey = machineKey
    this.projectId = projectId
    this.actors = actors
    this.genesis = genesis
    this.retryMs = Math.min(retryMs, 2000)
    this.stopController = new AbortController()
    this.manifestPath = join(directory, 'workspace.json')
    this.initialized = false
    this.closed = false
    this.lastSyncError = null
    this.acknowledgedHeads = []
    this.acknowledgedSignatureHeads = []
    this.attributionOptions = attribution
    this.harvests = Promise.resolve()
    this.notStored = new Map()
    this.recordStoreError = null
    this.hubRefusal = null
    this.duplicateMachines = []
    this.syncPeers = {}
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
        requireValue(this.manifest.schemaVersion === SCHEMA_VERSION && (isValidAutomergeUrl(this.manifest.url) || (this.role === 'replica' && this.manifest.state === 'enrolling'))
          && PROJECT_ID.test(this.manifest.workspaceId),
          'This storage directory was made by an earlier Pardner version and is left unchanged; start Pardner with a fresh data directory', 'INCOMPATIBLE_SCHEMA')
        requireValue(this.manifest.role === this.role, 'Use the role recorded for this storage directory', 'ROLE_MISMATCH')
        requireValue(!this.projectId || this.projectId === this.manifest.workspaceId, 'This storage directory belongs to another project', 'WORKSPACE_MISMATCH')
        this.hubUrl ??= this.manifest.hubUrl
        this.hubWsUrl ??= this.manifest.hubWsUrl
      } else {
        const entries = await readdir(this.directory)
        // A record store without metadata is a creation interrupted after saving its genesis.
        requireValue(entries.every(name => name.startsWith('runtime-lock.sqlite') || name.startsWith(RECORD_STORE_FILE) || name.startsWith(SIGNATURE_CACHE_FILE)
          || name.includes('.pardner-tmp-')),
          'This directory contains data without compatible workspace metadata; choose a new directory', 'INCOMPATIBLE_SCHEMA')
        if (this.role === 'hub') {
          this.genesis ??= standaloneGenesis()
          requireValue(this.genesis?.kind === 'project.genesis' && verifyRecord(this.genesis, this.genesis.projectId).valid,
            'A new project needs a valid signed genesis record', 'INVALID_GENESIS')
        } else {
          // A joining machine knows its project only from its invitation; the hub must prove it belongs to that project.
          requireValue(PROJECT_ID.test(this.projectId ?? ''), 'Supply the project ID this replica joins', 'WORKSPACE_MISMATCH')
        }
        this.manifest = {
          schemaVersion: SCHEMA_VERSION, role: this.role, replicaId: `replica-${randomUUID()}`,
          workspaceId: this.role === 'hub' ? this.genesis.projectId : this.projectId, state: 'enrolling',
        }
      }
      this.records = new RecordStore(join(this.directory, RECORD_STORE_FILE), this.manifest.workspaceId)
      // Change signatures need the machine key: the standalone service, which serves no other machine, signs nothing.
      if (this.machineKey) this.signatureCache = new SignatureCache(join(this.directory, SIGNATURE_CACHE_FILE), this.manifest.workspaceId)
      this.signaturesId = this.machineKey ? signaturesDocumentId(this.manifest.workspaceId) : null
      // The creator saves its genesis before any document holds it.
      if (!this.manifest.url && this.role === 'hub') this.records.admit([this.genesis])
      if (this.role === 'hub') await this.startHubState()
      this.allowedDocumentId = this.manifest.url ? parseAutomergeUrl(this.manifest.url).documentId : null
      this.repo = new DurableRepo({
        storage: new NodeFSStorageAdapter(join(this.directory, 'repo')),
        // The board and its signature document, whose ID every member derives from the project ID.
        shareConfig: {
          announce: async (_peer, id) => id === this.allowedDocumentId || (id === this.signaturesId && this.allowedDocumentId !== null),
          access: async (_peer, id) => id === this.allowedDocumentId || (id === this.signaturesId && this.allowedDocumentId !== null),
        },
      })
      await this.repo.ready
      let handle, signatures
      if (!this.manifest.url && this.role === 'hub') {
        handle = this.createDocument(createWorkspaceData({ actors: this.actors, genesis: this.records.genesis() }))
        this.manifest.url = handle.url
        this.allowedDocumentId = handle.documentId
        if (this.machineKey) signatures = this.createDocument(createSignaturesData(), this.signaturesId)
      }
      if (this.role === 'replica') {
        requireValue(this.hubUrl && this.hubWsUrl, 'Configure the hub HTTP URL and native WebSocket URL')
        this.manifest.hubUrl = this.hubUrl
        this.manifest.hubWsUrl = this.hubWsUrl
        this.hubSession = new SessionClient({ key: this.machineKey, projectId: this.manifest.workspaceId, route: this.hubUrl, role: 'replica', expectRole: 'hub',
          knownRecords: async () => this.records.all(),
          send: (url, { method, headers, body }) => requestJson(url, '', { method, signal: this.requestSignal,
            headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) })
        // A joining machine learns the document from its first welcome, after the hub has proved its membership.
        if (!this.manifest.url) this.manifest.url = await this.discoverDocument()
      }
      await this.saveManifest()
      if (this.role === 'replica' && this.manifest.state !== 'ready' && !this.adapter) this.startNetwork()
      handle ??= this.adoptActor(await this.repo.find(this.manifest.url, { signal: AbortSignal.timeout(8000) }))
      requireValue(plain(handle.doc().workspaceId) === this.manifest.workspaceId, 'Workspace identity does not match its metadata', 'WORKSPACE_MISMATCH')
      if (this.machineKey) signatures ??= this.adoptActor(await this.repo.find(`automerge:${this.signaturesId}`, { signal: AbortSignal.timeout(8000) }))
      this.workspace = new Workspace({ repo: this.repo, handle, signatures, replicaId: this.manifest.replicaId })
      // Started before any local change of this load, so every one is signed as it is made.
      if (signatures) this.startAttribution(handle, signatures)
      this.harvestRecords()
      requireValue(this.records.genesis(), 'The document has no valid genesis for this project ID; preserve this directory', 'WORKSPACE_MISMATCH')
      this.repo.on('storage-error', () => this.emitStatus())
      this.repo.on('document-persisted', ({ documentId }) => {
        if (![handle.documentId, signatures?.documentId].includes(documentId) || !this.initialized) return
        this.emitStatus()
        this.scheduleSync()
      })
      signatures?.on('change', () => {
        if (!this.initialized) return
        this.emitStatus()
        this.scheduleSync()
      })
      // A replica asks again for the hub's acknowledgement as soon as the hub reports heads it may now cover:
      // a signature reaches the hub in its own sync message, often just after the change it signs.
      if (this.role === 'replica') this.repo.synchronizer.on('sync-state', ({ documentId }) => {
        if (!this.initialized || ![handle.documentId, signatures?.documentId].includes(documentId)) return
        const unacknowledged = canonical(getHeads(handle.doc())) !== canonical(this.acknowledgedHeads)
          || (signatures && canonical(getHeads(signatures.doc())) !== canonical(this.acknowledgedSignatureHeads))
        if (!unacknowledged) return
        if (this.syncing) this.syncAgain = true
        else this.scheduleSync()
      })
      handle.on('change', () => {
        if (!this.initialized) return
        this.scheduleHarvest()
        this.emit('change')
        this.emitStatus()
        this.scheduleSync()
      })
      await this.repo.flush(this.workspace.documents())
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

  /**
   * A new document whose creation change carries this machine's actor; Repo.create would use a random one.
   * `documentId` is the signature document's derived ID, or a fresh random one for the board.
   */
  createDocument(data, documentId = parseAutomergeUrl(generateAutomergeUrl()).documentId) {
    const doc = from(data, this.machineKey ? { actor: machineActor(this.machineKey) } : undefined)
    const handle = this.repo.import(save(doc), { docId: documentId })
    handle.update(() => doc)
    handle.doneLoading()
    return handle
  }

  /**
   * automerge-repo gives every loaded document a random actor. This machine's changes carry its machine ID's
   * digest and 8 random bytes drawn for this load instead, so the signer can be read from every change, and two
   * loads of one document, such as a restored backup beside its original, never reuse an actor and sequence number.
   */
  adoptActor(handle) {
    if (this.machineKey) handle.update(doc => clone(doc, { actor: machineActor(this.machineKey) }))
    return handle
  }

  startAttribution(board, signatures) {
    const projectId = this.manifest.workspaceId
    this.attribution = new ChangeAttribution({ projectId, key: this.machineKey, role: this.role, repo: this.repo, board, signatures,
      cache: this.signatureCache, membership: () => this.records.membership(), records: () => this.records.all(),
      peerMachine: peerId => peerId ? (this.role === 'replica' ? this.hubMachine() : this.peerMachine?.(peerId) ?? null) : null,
      hubMachine: () => this.hubMachine(),
      askHub: this.role === 'replica' ? hashes => this.stopController.signal.aborted ? null
        : this.requestHub('/automerge/attribution', { method: 'POST', body: { workspaceId: projectId, hashes } }) : null,
      ...this.attributionOptions }).start()
    this.attribution.on('update', () => {
      if (!this.initialized) return
      this.emit('attribution')
      this.emitStatus()
    })
    this.on('membership', () => this.attribution?.onMembership())
  }

  /** The machine that hosts the project: the one that answered the handshake, or the genesis machine, which starts every client hub. */
  hubMachine() {
    return this.role === 'hub' ? this.machineKey?.machineId ?? null : this.hubMachineId ?? this.records?.genesis()?.machineId ?? null
  }

  /** A signed request to the hub over this machine's session (lib/machine-session.js). */
  requestHub(path, { method = 'GET', body } = {}) {
    requireValue(this.hubSession, 'This runtime has no hub', 'HUB_REQUIRED')
    return this.hubSession.request(path, { method, body })
  }

  get requestSignal() { return AbortSignal.any([this.stopController.signal, AbortSignal.timeout(2000)]) }

  /** The native sync route as dialled; the handshake binds it. */
  nativeRoute() {
    const url = new URL(this.hubWsUrl)
    if (url.pathname === '/') url.pathname = '/automerge'
    url.search = ''
    return url.toString()
  }

  /**
   * Opens the sync socket with the machine handshake. Nothing from the hub is
   * accepted until it has proved that it is a member machine of this project;
   * its records then join this replica's grow-only store, and its signed
   * checkpoint is kept so a hub restored from an older backup can tell.
   */
  async hubHandshake(socket, signal) {
    try {
      const welcome = await initiateHandshake(socket, { key: this.machineKey, projectId: this.manifest.workspaceId, route: this.nativeRoute(),
        role: 'replica', expectRole: 'hub', checkpoint: this.manifest.hubCheckpoint ?? null, signal,
        knownRecords: () => this.records.all(), ownRecords: () => this.records.all() })
      requireValue(isValidAutomergeUrl(welcome.documentUrl ?? '') && (!this.manifest.url || welcome.documentUrl === this.manifest.url),
        'The hub serves another document for this project', 'WORKSPACE_MISMATCH')
      this.admitRecords(welcome.records)
      this.hubMachineId = welcome.responder.machineId
      const checkpoint = welcome.checkpoint && checkpointValid(welcome.checkpoint,
        { projectId: this.manifest.workspaceId, hub: welcome.responder.machineId, publicKey: welcome.responder.publicKey }) ? welcome.checkpoint : null
      if (checkpoint && newerCheckpoint(this.manifest.hubCheckpoint, checkpoint) === checkpoint && checkpoint !== this.manifest.hubCheckpoint) {
        this.manifest.hubCheckpoint = checkpoint
        if (this.manifest.url) await this.saveManifest()
      }
      if (!this.manifest.url) {
        this.allowedDocumentId = parseAutomergeUrl(welcome.documentUrl).documentId
        this.discovered?.(welcome.documentUrl)
      }
      this.hubRefusal = null
    } catch (error) {
      // A refusal from the hub (removed, not a member, waiting after a restore) is kept for the client to report.
      if (typeof error.code === 'string' && !['HANDSHAKE_CLOSED', 'HANDSHAKE_TIMEOUT'].includes(error.code)) {
        this.hubRefusal = { code: error.code, error: error.message, ...(error.details ? { details: error.details } : {}) }
        this.discoveryFailed?.(error)
      }
      throw error
    }
  }

  /**
   * Waits for the first welcome to name the document: a joining machine has
   * nothing to open before the hub proves its membership. A refusal from the
   * hub ends the wait at once.
   */
  discoverDocument() {
    return new Promise((resolve, reject) => {
      const settle = (fn, value) => {
        clearTimeout(timer)
        this.stopController.signal.removeEventListener('abort', stopped)
        this.discovered = this.discoveryFailed = null
        fn(value)
      }
      const unavailable = () => settle(reject, Object.assign(new Error('The hub did not complete the machine handshake; retry when it is reachable'), { code: 'HUB_UNAVAILABLE' }))
      const stopped = () => settle(reject, Object.assign(new Error('The local service is stopping'), { code: 'LOCAL_SERVICE_UNAVAILABLE' }))
      const timer = setTimeout(unavailable, 8000)
      this.stopController.signal.addEventListener('abort', stopped, { once: true })
      this.discovered = url => settle(resolve, url)
      this.discoveryFailed = error => settle(reject, error)
      this.startNetwork()
    })
  }

  startNetwork() {
    this.adapter = new TicketNetworkAdapter({ retryMs: this.retryMs, getUrl: async () => this.nativeRoute(),
      handshake: (socket, signal) => this.hubHandshake(socket, signal) })
    this.adapter.on('transport-state', ({ state, error }) => {
      this.lastSyncError = error
      this.emitStatus()
      if (state === 'connected') this.scheduleSync()
    })
    this.repo.networkSubsystem.addNetworkAdapter(this.adapter)
  }

  // ---- The hub's own state, for a restore ----

  /**
   * Counts this hub's starts and notes the identity of its record store file.
   * A cold backup copied back gets a new file, so a different identity means
   * this directory was restored or copied: the hub then waits before serving
   * another machine. A member that shows a checkpoint this hub never reached
   * proves the same, whatever the files say. Wall-clock time plays no part.
   *
   * The waiting state is saved with the position checkpoints are compared
   * against (`since`), fixed when the waiting began, so restarts never move
   * it; with the new file identity in one atomic write, so a kill before the
   * write detects the restore again; and it stays until a catch-up or the
   * operator clears it (resumeHub). A hub that already holds a document but
   * has no state file cannot tell whether it was restored, so it waits too.
   */
  async startHubState() {
    const path = join(this.directory, HUB_STATE_FILE)
    let previous = null
    try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const { ino } = await stat(join(this.directory, RECORD_STORE_FILE))
    const file = String(ino)
    let waiting = previous?.waiting ?? null
    if (!waiting && !previous && this.manifest.url) {
      waiting = { reason: 'state-missing', detail: 'This hub’s own state file is missing, so it can’t tell whether its files were restored.',
        since: { starts: 0, run: null, records: this.records.size } }
    } else if (!waiting && previous && previous.file !== file) {
      waiting = { reason: 'restored', detail: 'This hub’s files were restored or copied from a backup.',
        since: { starts: previous.starts, run: previous.run, records: this.records.size } }
    }
    this.hubState = { starts: (previous?.starts ?? 0) + 1, run: newRun(), file, waiting, seen: previous?.seen ?? null,
      ...(previous?.resumedBy ? { resumedBy: previous.resumedBy } : {}) }
    await this.saveHubState()
  }

  /** Saves the hub's current state; writes are serialized, so the file always ends at the latest state. */
  saveHubState() {
    this.hubStateWrites = (this.hubStateWrites ?? Promise.resolve()).catch(() => {}).then(() => {
      const { starts, run, file, waiting, seen, resumedBy } = this.hubState
      return atomicWrite(join(this.directory, HUB_STATE_FILE), `${JSON.stringify({ starts, run, file, waiting, seen, ...(resumedBy ? { resumedBy } : {}) }, null, 2)}\n`)
    })
    return this.hubStateWrites
  }

  hubPosition() { return { starts: this.hubState.starts, run: this.hubState.run, records: this.records.size } }

  /** This hub's signed statement of its state, for members to keep; null without a machine key. */
  checkpoint() {
    return this.machineKey ? signCheckpoint(this.machineKey, { projectId: this.manifest.workspaceId, ...this.hubPosition() }) : null
  }

  /**
   * A member's checkpoint, presented when it connects. One this hub signed but
   * never reached shows that the hub is behind; it then waits, and saves that
   * before answering. While waiting, checkpoints are compared with the point
   * fixed when the waiting began, not with this run. Returns whether the
   * checkpoint is ahead, so its member may vouch for catching up.
   */
  async noteCheckpoint(checkpoint) {
    if (this.stopController.signal.aborted || !this.machineKey || !checkpointValid(checkpoint, { projectId: this.manifest.workspaceId, hub: this.machineKey.machineId, publicKey: this.machineKey.publicKey })) return false
    const { waiting, seen } = this.hubState
    if (!aheadOf(checkpoint, waiting?.since ?? this.hubPosition())) return false
    const position = { starts: checkpoint.starts, run: checkpoint.run, records: checkpoint.records }
    const newer = !seen || position.starts > seen.starts || (position.starts === seen.starts && position.records > seen.records)
    if (!waiting || newer) {
      this.hubState = { ...this.hubState, seen: newer ? position : seen,
        waiting: waiting ?? { reason: 'behind', detail: 'A member machine saw a later state of this hub than it holds.', since: this.hubPosition() } }
      await this.saveHubState()
      if (!waiting) this.emitStatus()
    }
    return true
  }

  /**
   * Leaves the waiting state: a member that saw a later state has synced its
   * membership here, or the operator confirmed nothing newer exists. The new
   * start number exceeds any this hub reached or was shown before, so its new
   * checkpoints are ahead of every older one. Returns once that is saved.
   */
  async resumeHub(by) {
    requireValue(this.role === 'hub', 'Only a hub waits after a restore', 'HUB_REQUIRED')
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    if (!this.hubState.waiting) return this.hubStatus()
    this.hubState = { ...this.hubState, starts: Math.max(this.hubState.starts, this.hubState.seen?.starts ?? 0) + 1, run: newRun(), waiting: null, resumedBy: by }
    await this.saveHubState()
    this.emitStatus()
    return this.hubStatus()
  }

  hubStatus() {
    if (this.role !== 'hub' || !this.hubState) return null
    return { waiting: Boolean(this.hubState.waiting), ...(this.hubState.waiting ? { reason: this.hubState.waiting.reason, detail: this.hubState.waiting.detail } : {}),
      starts: this.hubState.starts, ...(this.hubState.resumedBy ? { resumedBy: this.hubState.resumedBy } : {}) }
  }

  /** Records offered by another machine: valid ones join the store; the document gets them at the next harvest. */
  admitRecords(records) {
    if (!Array.isArray(records) || !records.length || this.stopController.signal.aborted) return 0
    const { accepted } = this.records.admit(records)
    if (accepted.length) {
      this.emit('membership')
      if (this.initialized) this.scheduleHarvest()
    }
    return accepted.length
  }

  status() {
    const heads = this.workspace ? getHeads(this.workspace.handle.doc()) : []
    const persisted = this.repo?.persistedHeads.get(this.workspace?.handle.documentId) ?? []
    const savedLocally = this.initialized && canonical(heads) === canonical(persisted)
    // The signature document is saved in the background; the hub's acknowledgement covers it with the board.
    const signatureHeads = this.workspace?.signatures ? getHeads(this.workspace.signatures.doc()) : null
    const signaturesUnacknowledged = Boolean(signatureHeads) && canonical(signatureHeads) !== canonical(this.acknowledgedSignatureHeads)
    return {
      role: this.role, workspaceId: this.manifest?.workspaceId ?? null,
      heads,
      replicaId: this.manifest?.replicaId ?? null, savedLocally,
      hubConnected: this.role === 'hub' || this.adapter?.state === 'connected',
      syncPending: !savedLocally || (this.role === 'replica' && (canonical(heads) !== canonical(this.acknowledgedHeads) || signaturesUnacknowledged)),
      ...(signatureHeads ? { signatures: { heads: signatureHeads,
        savedLocally: this.initialized && canonical(signatureHeads) === canonical(this.repo.persistedHeads.get(this.workspace.signatures.documentId) ?? []),
        ...(this.role === 'replica' ? { acknowledgedHeads: this.acknowledgedSignatureHeads } : {}) } } : {}),
      ...(this.attribution ? { attribution: this.attributionSummary() } : {}),
      lastSyncedAt: this.lastSyncedAt ?? null,
      storageError: this.repo?.storageError?.message ?? null, syncError: this.lastSyncError,
      recordStoreError: this.recordStoreError,
      ...(this.role === 'replica' ? { hubRefusal: this.hubRefusal } : { hub: this.hubStatus(), duplicateMachines: this.duplicateMachines, syncPeers: this.syncPeers }),
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
    if (accepted.length) this.emit('membership')
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
      for (const record of missing) doc.membership[record.recordId] = storageValue(record)
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
    return { ...this.records.membership(), storedRecords: this.records.size, notStored: [...this.notStored.values()],
      ...(this.role === 'replica' ? { hubRefusal: this.hubRefusal } : {}) }
  }

  /**
   * The hub's gate: the one path by which a new membership record enters.
   * Each record must pass maySign against the current membership plus the
   * records before it in the batch, so an approval can admit a machine and
   * carry that machine's own agent label. A removed machine, or a signer who
   * no longer holds the role a record needs, is refused (enforced from
   * arrival). History received by sync is harvested without this check. The
   * batch is checked as a whole before any record is saved; its records are
   * then saved in the grow-only store, written into the document, and the
   * call returns only after the
   * document is flushed to disk. A record already stored is accepted again,
   * so a retried request is idempotent. It joins the operation queue, which
   * shutdown drains before closing the repository.
   */
  addRecords(records) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub', 'New membership records enter through the hub', 'HUB_REQUIRED')
    requireValue(Array.isArray(records) && records.length > 0 && records.length <= 16, 'Supply one to sixteen membership records')
    const result = this.workspace.queue.then(() => this.gateRecords(records))
    this.workspace.queue = result.catch(() => {})
    return result
  }

  async gateRecords(records) {
    requireValue(!this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    const fresh = []
    for (const record of records) {
      if (canonical(this.records.get(record?.recordId) ?? null) === canonical(record)) continue
      const membership = fresh.length ? computeMembership([...this.records.all(), ...fresh], { projectId: this.manifest.workspaceId }) : this.records.membership()
      requireValue(maySign(membership, record), isMember(membership, record?.signer)
        ? 'The signing machine’s current role does not allow this record'
        : 'The signing machine is not a current member of this project; removed machines cannot add records', 'RECORD_REFUSED')
      fresh.push(record)
    }
    if (fresh.length) {
      const { refused } = this.records.admit(fresh)
      requireValue(!refused.length, refused[0]?.reason, 'RECORD_REFUSED')
      this.emit('membership')
    }
    const map = isMap(this.workspace.handle.doc().membership) ? plain(this.workspace.handle.doc().membership) : {}
    const missing = records.filter(record => canonical(map[record.recordId] ?? null) !== canonical(record))
    if (missing.length) this.workspace.handle.change(doc => {
      if (!isMap(doc.membership)) doc.membership = {}
      for (const entry of missing) doc.membership[entry.recordId] = storageValue(entry)
    })
    try {
      await this.repo.flush([this.workspace.handle.documentId])
    } catch (error) {
      throw new OperationError('STORAGE_FAILED', 'Local persistence of the membership records was not confirmed. Retry the same request.', { cause: error.message })
    }
    return { recordIds: records.map(record => record.recordId), membership: this.membership() }
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
      const { signatures } = this.workspace
      const local = this.status()
      if (!local.savedLocally || (signatures && !local.signatures.savedLocally)) await this.repo.flush(this.workspace.documents())
      const requestedHeads = getHeads(this.workspace.handle.doc())
      const requestedSignatureHeads = signatures ? getHeads(signatures.doc()) : null
      const receipt = await this.requestHub('/automerge/sync-ack', {
        method: 'POST', body: { workspaceId: this.manifest.workspaceId, heads: requestedHeads, ...(signatures ? { signatureHeads: requestedSignatureHeads } : {}) },
      })
      if (receipt.acknowledged) {
        const doc = this.workspace.handle.doc()
        requireValue(Array.isArray(receipt.hubHeads) && (!signatures || Array.isArray(receipt.hubSignatureHeads)), 'Invalid hub persistence acknowledgement')
        const signaturesHeld = !signatures || hasHeads(signatures.doc(), receipt.hubSignatureHeads)
        if (canonical(getHeads(doc)) === canonical(requestedHeads) && hasHeads(doc, receipt.hubHeads) && signaturesHeld) {
          await this.repo.flush(this.workspace.documents())
          if (canonical(getHeads(this.workspace.handle.doc())) === canonical(requestedHeads)) {
            this.acknowledgedHeads = requestedHeads
            // The requested snapshot, never the current heads: a signature written since stays unacknowledged.
            if (signatures) this.acknowledgedSignatureHeads = requestedSignatureHeads
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
      const again = this.syncAgain && !this.lastSyncError
      this.syncAgain = false
      if (this.status().syncPending) this.scheduleSync(again ? 30 : this.retryMs)
    }
  }

  async execute(request) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub' || request.type !== 'actor.register', 'Register new Actors on the hub', 'HUB_REQUIRED')
    const receipt = await this.workspace.execute(request)
    const status = this.status()
    return { ...receipt, syncPending: status.syncPending, status }
  }

  async acknowledge(workspaceId, heads, signatureHeads = null) {
    requireValue(this.role === 'hub', 'Only the hub can acknowledge synchronization', 'HUB_REQUIRED')
    requireValue(workspaceId === this.manifest.workspaceId, 'Workspace identity does not match this hub', 'WORKSPACE_MISMATCH')
    const valid = value => Array.isArray(value) && value.every(head => typeof head === 'string' && /^[a-f0-9]{64}$/.test(head))
    requireValue(valid(heads) && (signatureHeads === null || valid(signatureHeads)), 'Supply Automerge heads')
    return this.workspace.acknowledge(heads, signatureHeads)
  }

  /** The hub's verdict on changes a member machine holds no valid signature for (ChangeAttribution.answer). */
  attributionStates(workspaceId, hashes) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub' && this.attribution, 'Only a hub with a machine key answers for signatures', 'HUB_REQUIRED')
    requireValue(workspaceId === this.manifest.workspaceId, 'Workspace identity does not match this hub', 'WORKSPACE_MISMATCH')
    requireValue(Array.isArray(hashes) && hashes.length <= 500, 'Supply at most 500 change hashes')
    return this.attribution.answer(hashes)
  }

  attributionSummary() {
    const { equivocations, ...counts } = this.attribution.summary()
    return { ...counts, equivocations: equivocations.length }
  }

  async prepareDelivery(actor) {
    requireValue(this.initialized && !this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
    requireValue(this.role === 'hub', 'New deliveries require the hub', 'HUB_REQUIRED')
    const doc = this.workspace.handle.doc()
    const actorId = actor ? resolveActor(doc, actor).id : null
    await this.repo.flush([this.workspace.handle.documentId])
    this.deliveryLedger.reconcile(Object.values(doc.mentions).map(plain), activeMentions(doc).map(mention => mention.id))
    return actorId
  }

  // A replica's delivery leases come from the hub through its client (lib/client-proxy.js), which signs the request.
  async claimDelivery({ actorId, requestId, ttlMs }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.claim(recipient, requestId, ttlMs)
  }

  async acknowledgeDelivery({ actorId, mentionId, claimToken }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.acknowledge(recipient, mentionId, claimToken)
  }

  async releaseDelivery({ actorId, mentionId, claimToken }) {
    requireValue(actorId, 'Supply a delivery Actor', 'ACTOR_REQUIRED')
    const recipient = await this.prepareDelivery(actorId)
    return this.deliveryLedger.release(recipient, mentionId, claimToken)
  }

  async pendingDeliveries(actorId) {
    return { mentions: this.deliveryLedger.pending(await this.prepareDelivery(actorId)) }
  }

  get docHandle() { return this.workspace?.handle }

  /** The board as the UI reads it; with a machine key it carries who made each change (attributionView). */
  getDoc() {
    const snapshot = this.workspace.snapshot()
    return this.attribution ? { ...snapshot, attribution: this.attributionView(snapshot.operations) } : snapshot
  }

  /**
   * Who made each Activity entry and each membership record, from this replica's own checks: the signing
   * machine and its person, the state of each change, and the changes that need a person's review.
   */
  attributionView(operations) {
    const membership = this.records.membership()
    const removed = new Set(membership.removedMachines)
    const people = new Map([...membership.people, ...(membership.formerPeople ?? [])].map(person => [person.id, person.displayName]))
    const machines = {}
    for (const machine of [...membership.machines, ...(membership.formerMachines ?? [])]) {
      machines[machine.id] ??= { personId: machine.personId, personName: people.get(machine.personId) ?? null, removed: removed.has(machine.id),
        ...(machine.agentsOnly ? { agentsOnly: true } : {}), ...(machine.id === this.machineKey.machineId ? { thisMachine: true } : {}) }
    }
    const flagged = this.attribution.flagged(operations)
    const summary = this.attribution.summary()
    return {
      machineId: this.machineKey.machineId, hubMachineId: this.hubMachine(), machines,
      operations: this.attribution.operationSigners(operations),
      records: this.attribution.recordEntries(this.records.all()).map(({ record, at }) => recordEntry(record, at)),
      review: flagged.map(({ hash, operations: ids, ...entry }) => ({ change: hash, operations: ids, ...entry })),
      summary: { ...summary, review: flagged.length },
    }
  }
  async getAgents() { return Object.values(this.workspace.handle.doc().actors).map(plain) }

  close() {
    this.closePromise ??= this.closeResources()
    return this.closePromise
  }

  async closeResources() {
    if (this.closed) return
    this.attribution?.pause()
    this.stopController.abort()
    clearTimeout(this.syncTimer)
    this.adapter?.disconnect()
    try {
      await this.workspace?.queue
      await this.harvests
      // Pending signatures go into the signature document; each is already in the signature cache.
      this.attribution?.close()
      // The hub's own state is written before the directory's lease is released.
      await this.hubStateWrites?.catch(() => {})
      await this.repo?.shutdown()
    } finally {
      this.initialized = false
      this.closed = true
      this.deliveryLedger?.close()
      this.records?.close()
      this.signatureCache?.close()
      this.lease?.close()
      this.lease = null
    }
  }
}

/** A membership record as Activity shows it: what it did, who signed it, and when it reached the board. */
function recordEntry(record, at) {
  const fields = ['role', 'displayName', 'harness', 'agentsOnly', 'personId', 'machineId', 'replaces'].filter(field => record[field] !== undefined)
  return { recordId: record.recordId, kind: record.kind, subject: record.subject, signer: record.signer, at,
    ...Object.fromEntries(fields.map(field => [field, record[field]])) }
}
