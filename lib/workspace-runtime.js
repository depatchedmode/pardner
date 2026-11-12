import { EventEmitter } from 'node:events'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { clone, from, getBackend, getChangesMetaSince, getConflicts, getHeads, getObjectId, hasHeads, save } from '@automerge/automerge'
import { generateAutomergeUrl, isValidAutomergeUrl, parseAutomergeUrl } from '@automerge/automerge-repo'
import { atomicWrite } from './atomic-file.js'
import { ChangeAttribution } from './attribution.js'
import { activityView } from './activity.js'
import { ChangeLog } from './change-log.js'
import { createSignaturesData, machineActor, signChange, signaturesDocumentId } from './change-signatures.js'
import { DeliveryLedger } from './delivery-ledger.js'
import { DurableRepo } from './durable-repo.js'
import { aheadOf, checkpointValid, initiateHandshake, newRun, newerCheckpoint, signCheckpoint } from './machine-handshake.js'
import { generateMachineKey, personIdFor } from './machine-key.js'
import { SessionClient } from './machine-session.js'
import { buildRecord, computeMembership, isMember, maySign, recordLimits, verifyRecord } from './membership.js'
import { NodeFSStorageAdapter } from './nodefs-storage-adapter.js'
import { RECORD_STORE_FILE, RecordStore } from './record-store.js'
import { SIGNATURE_CACHE_FILE, SignatureCache } from './signature-cache.js'
import { acquireStorageLease } from './storage-lease.js'
import { TicketNetworkAdapter } from './ticket-network-adapter.js'
import { requestJson } from './sync-client.js'
import { actorId as humanActor } from './client-identity.js'
import { Workspace, createWorkspaceData, createdValue } from './workspace.js'
import { OperationError, SCHEMA_VERSION, activeMentions, canonical, dictionary, ownValue, plain, requireValue, resolveActor, storedRecords } from './workspace-schema.js'
import { storageValue } from './workspace-values.js'

const PROJECT_ID = /^[a-f0-9]{64}$/
const NOT_STORED_LIMIT = 100
const HUB_STATE_FILE = 'hub-state.json'
const SIGNATURE_SAVE_MS = 1000
/** Whether `value`, read from the board, is an Automerge map: text, a list or a scalar written where a map belongs is not. */
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value) && typeof getObjectId(value) === 'string'

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
/** The board's maps whose values are registers naming the operation and Actor that wrote them. */
const REGISTER_MAPS = new Set(['taskFields', 'goalFields', 'veinFields', 'commentBodies'])

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
      if (this.signaturesId) this.paceSignatureSaves()
      let handle, signatures
      if (!this.manifest.url && this.role === 'hub') {
        handle = this.createDocument(createWorkspaceData({ actors: this.actors, genesis: this.records.genesis() }), undefined, { sign: true })
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
      // The project is the one the board's creation names: a later change rewriting that key is listed, never a reason
      // to stop opening the board (lib/workspace.js readable).
      requireValue(plain(handle.doc().workspaceId) === this.manifest.workspaceId || createdValue(handle.doc(), 'workspaceId') === this.manifest.workspaceId,
        'Workspace identity does not match its metadata', 'WORKSPACE_MISMATCH')
      if (this.machineKey) signatures ??= this.adoptActor(await this.repo.find(`automerge:${this.signaturesId}`, { signal: AbortSignal.timeout(8000) }))
      this.workspace = new Workspace({ repo: this.repo, handle, signatures, replicaId: this.manifest.replicaId, workspaceId: this.manifest.workspaceId, change: fn => this.boardChange(fn),
        confirm: () => this.attribution?.confirmOwn() })
      // Started before any local change of this load, so every one is signed as it is made.
      if (signatures) this.startAttribution(handle, signatures)
      else this.startChangeLog(handle)
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
      // Checking received changes, and writing back missing signatures, run in the background from here on.
      this.attribution?.begin()
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
   * Background saves of the signature document run at most once a second. They share one persistence queue with
   * the board, so saving after every signature would put an extra disk write ahead of the next operation's save.
   * Nothing waits on them: this machine's own signatures are in the signature cache before the board is saved,
   * other machines' are synced again, and a hub acknowledgement flushes both documents itself.
   */
  paceSignatureSaves() {
    const storage = this.repo.storageSubsystem
    const save = storage.saveDoc
    storage.saveDoc = documentId => {
      if (documentId !== this.signaturesId) return save(documentId)
      this.signatureSave ??= new Promise(resolve => {
        this.signatureSaveTimer = setTimeout(() => { this.signatureSave = null; resolve(save(documentId)) }, SIGNATURE_SAVE_MS)
      })
      return this.signatureSave
    }
  }

  /**
   * A new document whose creation change carries this machine's actor; Repo.create would use a random one.
   * `documentId` is the signature document's derived ID, or a fresh random one for the board.
   */
  createDocument(data, documentId = parseAutomergeUrl(generateAutomergeUrl()).documentId, { sign = false } = {}) {
    const doc = from(data, this.machineKey ? { actor: machineActor(this.machineKey) } : undefined)
    // The board's creation change is this machine's own write: signed and cached here, before anything can save it.
    if (sign && this.machineKey) {
      const [hash] = getHeads(doc)
      this.signatureCache.add([{ hash, machineId: this.machineKey.machineId, signature: signChange(this.machineKey, this.manifest.workspaceId, hash) }])
    }
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

  /**
   * Every local change to the board goes through here: operations, the record gate and record write-backs. With
   * a machine key it is the attribution's signing write path, which signs exactly this change and nothing else.
   */
  boardChange(fn) {
    if (this.attribution) this.attribution.change(fn)
    else this.workspace.handle.change(fn)
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

  /**
   * The standalone service signs and checks nothing, but its Activity is still derived from each change
   * (lib/change-log.js), in memory, in background slices, so every surface reads one derivation.
   */
  startChangeLog(handle) {
    const log = this.changeLog = new ChangeLog({ board: handle })
    let indexed = []
    const run = () => {
      this.changeLogTimer = null
      if (this.closed || log.complete) return
      try { log.slice() } catch (error) { this.changeLogError = error.message }
      if (!log.complete) this.changeLogTimer = setImmediate(run)
      if (this.initialized) this.emit('attribution')
    }
    this.indexChanges = () => {
      const metas = getChangesMetaSince(handle.doc(), indexed)
      if (!metas.length) return
      indexed = getHeads(handle.doc())
      log.note(metas)
      if (log.pendingOps <= log.opsPerSlice) { try { log.slice({ ms: Infinity }) } catch (error) { this.changeLogError = error.message } }
      if (!log.complete && !this.changeLogTimer) this.changeLogTimer = setImmediate(run)
    }
    handle.on('heads-changed', this.indexChanges)
    this.indexChanges()
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
        since: { starts: null, run: null, records: this.records.size } }
    } else if (!waiting && previous && previous.file !== file) {
      waiting = { reason: 'restored', detail: 'This hub’s files were restored or copied from a backup.',
        since: { starts: previous.starts, run: previous.run, records: this.records.size } }
    }
    this.hubState = { starts: (previous?.starts ?? 0) + 1, run: newRun(), file, waiting, seen: previous?.seen ?? null,
      ...(previous?.resumedBy ? { resumedBy: previous.resumedBy } : {}) }
    await this.saveHubState()
  }

  /** Saves the hub's current state; writes are serialized, so the file always ends at the latest state. */
  saveHubState(update = state => state) {
    this.hubStateWrites = (this.hubStateWrites ?? Promise.resolve()).catch(() => {}).then(async () => {
      const next = update(this.hubState)
      const { starts, run, file, waiting, seen, resumedBy } = next
      await atomicWrite(join(this.directory, HUB_STATE_FILE), `${JSON.stringify({ starts, run, file, waiting, seen, ...(resumedBy ? { resumedBy } : {}) }, null, 2)}\n`)
      this.hubState = next
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
    let ahead = false, beganWaiting = false
    await this.saveHubState(state => {
      const { waiting, seen } = state
      ahead = aheadOf(checkpoint, waiting?.since ?? this.hubPosition())
      if (!ahead) return state
      const position = { starts: checkpoint.starts, run: checkpoint.run, records: checkpoint.records }
      const newer = !seen || position.starts > seen.starts || (position.starts === seen.starts && position.records > seen.records)
      beganWaiting = !waiting
      // Learning that we are behind fails closed even if saving fails. Serialize this decision with resume.
      this.hubState = { ...state, seen: newer ? position : seen,
        waiting: waiting ?? { reason: 'behind', detail: 'A member machine saw a later state of this hub than it holds.', since: this.hubPosition() } }
      return this.hubState
    })
    if (beganWaiting) this.emitStatus()
    return ahead
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
    await this.saveHubState(state => {
      requireValue(!this.stopController.signal.aborted, 'The local service is not ready', 'LOCAL_SERVICE_UNAVAILABLE')
      if (!state.waiting) return state
      return { ...state, starts: Math.max(state.starts, state.seen?.starts ?? 0) + 1, run: newRun(), waiting: null, resumedBy: by }
    })
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
    const bounded = Object.fromEntries(Object.entries(map).filter(([, record]) => recordLimits(record).valid))
    const seen = `${this.records.size}:${canonical(bounded)}`
    if (seen === this.harvested && Object.keys(bounded).length === Object.keys(map).length) return
    const { accepted, refused } = this.records.admit(Object.values(map))
    if (accepted.length) this.emit('membership')
    for (const record of accepted) this.notStored.delete(canonical(record))
    for (const { record, reason } of refused) {
      const key = recordLimits(record).valid ? canonical(record) : JSON.stringify([record?.recordId, reason])
      this.notStored.delete(key)
      this.notStored.set(key, { recordId: typeof record?.recordId === 'string' ? record.recordId : null, reason })
      if (this.notStored.size > NOT_STORED_LIMIT) this.notStored.delete(this.notStored.keys().next().value)
    }
    const missing = this.records.all().filter(record => canonical(bounded[record.recordId] ?? null) !== canonical(record))
    if (missing.length) this.boardChange(doc => {
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
      const limits = recordLimits(record)
      requireValue(limits.valid, limits.reason, 'RECORD_REFUSED')
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
    const missing = records.filter(record => canonical(ownValue(map, record.recordId) ?? null) !== canonical(record))
    if (missing.length) this.boardChange(doc => {
      if (!isMap(doc.membership)) doc.membership = {}
      for (const entry of missing) doc.membership[entry.recordId] = storageValue(entry)
    })
    try {
      await this.repo.flush([this.workspace.handle.documentId])
      this.attribution?.confirmOwn()
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
      // Every signature this machine made is written into the signature document first, so the signature heads it
      // asks the hub to hold contain each one: an acknowledgement then covers a signature for every change this
      // machine made in the acknowledged board heads. Until then nothing is requested and the sync stays pending.
      if (this.attribution) {
        this.attribution.guard('outbox', () => this.attribution.flushOutbox())
        requireValue(!this.attribution.unwritten, 'This machine’s newest signatures are not yet in the signature document', 'SIGNATURES_UNWRITTEN')
      }
      // The pair this request is about, captured in the same step that found the outbox empty: every change this
      // machine made in these board heads has its signature in these signature heads. A change made during the save
      // below is in neither, and is asked about next time.
      const requestedHeads = getHeads(this.workspace.handle.doc())
      const requestedSignatureHeads = signatures ? getHeads(signatures.doc()) : null
      const local = this.status()
      if (!local.savedLocally || (signatures && !local.signatures.savedLocally)) await this.repo.flush(this.workspace.documents())
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
    // Read from the readable board, so a top-level map holding a value of the wrong kind reads as empty.
    const { view: doc } = this.workspace.readable()
    const actorId = actor ? resolveActor(doc, actor).id : null
    await this.repo.flush([this.workspace.handle.documentId])
    this.deliveryLedger.reconcile(storedRecords(doc, 'mention', 'mentions').map(([, mention]) => mention), activeMentions(doc).map(mention => mention.id))
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

  /**
   * The board as the UI reads it: its current state, and Activity, every entry derived from the change that wrote it
   * (lib/activity.js) with that change's verdict. With a machine key it also carries who the signers are and what
   * needs review (attributionView). Activity and attribution are this replica's view; the rest is the shared board.
   */
  getDoc() {
    const snapshot = this.workspace.snapshot()
    if (!this.attribution) return { ...snapshot, activity: this.activity() }
    // Each top-level key that cannot be read names the changes that wrote what it holds, each with its own verdict.
    const entries = snapshot.unreadable.some(item => item.kind === 'root') ? this.entriesByChange() : null
    const unreadable = snapshot.unreadable.map(item => (item.kind === 'root' ? { ...item, writers: this.rootWriters(item.id, entries) } : item))
    return { ...snapshot, unreadable, activity: this.activity(), attribution: this.attributionView(snapshot) }
  }

  /**
   * The changes that wrote what top-level key `key` holds now (each concurrent value), each described with its own
   * verdict and entry; for a key that holds nothing, every change that wrote or deleted it outside the board's creation.
   */
  rootWriters(key, entries = this.entriesByChange()) {
    const doc = this.workspace.handle.doc()
    const hashes = new Set()
    for (const full of getBackend(doc).getAll('_root', key)) {
      const made = this.attribution.changeOfOp(full.length === 2 ? full[1] : full[2])
      if (made) hashes.add(made)
    }
    if (!hashes.size) {
      for (const [hash, entry] of this.attribution.log.entries) if ((entry.unusual?.root ?? []).some(write => write.key === key)) hashes.add(hash)
    }
    return [...hashes].sort().map(hash => this.describeWriter({ hash, entry: entries.get(hash) ?? null }))
  }

  /** The Activity entry each change is shown in, by change hash. */
  entriesByChange() {
    const entries = new Map()
    for (const entry of this.attribution.activity()) for (const change of entry.changes) entries.set(change.hash, entry)
    return entries
  }

  /**
   * A change that wrote something on the board now, with its own verdict, and whether its entry is confirmed: a note
   * built on it says only what that change's review state and signer support (review is null while the change's entry
   * is not derived yet).
   */
  describeWriter({ hash, entry }) {
    const verdict = entry?.changes.find(change => change.hash === hash)
    return { change: hash, entry: entry?.id ?? null, kind: entry?.kind ?? null,
      actorId: entry?.kind === 'operation' ? entry.event.actorId : null, type: entry?.kind === 'operation' ? entry.event.type : null,
      ...this.attribution.stateOf(hash), review: entry ? entry.review : null, flags: Object.keys(entry?.flags ?? {}).sort(),
      ...(verdict?.actorMismatch ? { actorMismatch: true } : {}) }
  }

  /** Activity entries, newest first; the standalone service checks no signatures, so its changes are `unchecked`. */
  activity() {
    if (this.attribution) return this.attribution.activity()
    const log = this.changeLog
    if (this.standaloneActivity?.version !== log.version) {
      this.standaloneActivity = { version: log.version, value: activityView({ entries: log.entries.values(), stateOf: () => ({ state: 'unchecked' }) }) }
    }
    return this.standaloneActivity.value
  }

  /**
   * Who signed what, from this replica's own checks: the signing machines and their persons, the changes that need
   * a person's review, and two views of the board's current state that name who wrote it without a signer line: for
   * each comment marked deleted, the changes that marked it; and each comment whose record or current text was
   * written by a change other than its recorded author's own signed operation on it.
   */
  attributionView(snapshot = this.workspace.snapshot()) {
    const membership = this.records.membership()
    const removed = new Set(membership.removedMachines)
    const people = new Map([...membership.people, ...(membership.formerPeople ?? [])].map(person => [person.id, person.displayName]))
    const machines = dictionary()
    for (const machine of [...membership.machines, ...(membership.formerMachines ?? [])]) {
      if (!Object.hasOwn(machines, machine.id)) machines[machine.id] = { personId: machine.personId, personName: people.get(machine.personId) ?? null, removed: removed.has(machine.id),
        ...(machine.agentsOnly ? { agentsOnly: true } : {}), ...(machine.id === this.machineKey.machineId ? { thisMachine: true } : {}) }
    }
    const review = this.attribution.review()
    const summary = this.attribution.summary()
    return {
      machineId: this.machineKey.machineId, hubMachineId: this.hubMachine(), machines, people: Object.fromEntries(people),
      // Each person's human Actor, so a membership record can be filed under the person whose machine signed it.
      personActors: Object.fromEntries([...people.keys()].map(personId => [personId, humanActor(personId)])),
      review, ...this.currentWriters(),
      summary: { ...summary, review: review.length, notDerived: this.attribution.log.remaining },
    }
  }

  /**
   * The changes that wrote the current value at `doc[map][key]`, each with the Activity entry it is shown in: the
   * change that made each current value (concurrent ones included), and every change that wrote into one of those
   * values afterwards (from its derived entry).
   */
  writersOf(doc, map, key, entries, intoObject) {
    const container = doc[map]
    if (!isMap(container) || !Object.hasOwn(container, key)) return []
    const hashes = new Set()
    for (const value of getBackend(doc).getAll(getObjectId(container), key)) {
      const opId = value.length === 2 ? value[1] : value[2]
      const made = this.attribution.changeOfOp(opId)
      if (made) hashes.add(made)
      if (value.length === 2) for (const hash of intoObject.get(opId) ?? []) hashes.add(hash)
    }
    return [...hashes].map(hash => ({ hash, entry: entries.get(hash) ?? null }))
  }

  /**
   * The value of a top-level map key that holds object `foreign.obj`, which some change wrote into: `{ map, key, objId }`.
   * Found from the derived entry of the change that made the object (its `nested` objects), or else from where
   * Automerge placed it as of the writing change (lib/change-log.js placeOf), which a value that lost to a concurrent
   * one does not have.
   */
  holderOf({ obj, path, container }) {
    const at = typeof obj === 'string' ? obj.indexOf('@') : -1
    const made = at > 0 ? this.attribution.log.entries.get(this.attribution.changeOfOp(obj)) : null
    const counter = Number(obj?.slice(0, at))
    for (const [map, key, holder, inside] of made?.nested ?? []) if (holder === counter || inside.includes(counter)) return { map, key, objId: `${holder}${obj.slice(at)}` }
    return container && Array.isArray(path) && path.length >= 2 ? { map: path[0], key: path[1], objId: container } : null
  }

  /**
   * Current-state authorship (README, "What a signer line means"): a comment shown in a task names its recorded
   * author and no signer. Where the change that wrote the comment or its current text is not that Actor's own,
   * unflagged, signed operation on that comment, it is listed here, so the comment can say it was changed by someone
   * else; and each deleted comment lists the changes that marked it deleted, so its historical entry can say so.
   */
  currentWriters() {
    const doc = this.workspace.handle.doc()
    const memo = canonical(getHeads(doc)) + `:${this.attribution.version}:${this.attribution.log.version}`
    if (this.currentWriterMemo?.key === memo) return this.currentWriterMemo.value
    // A write into an object counts against that object and against the value of a top-level map holding it (the
    // register or record it is part of), so an edit inside a register's list is an edit of that register.
    const entries = new Map(), intoObject = new Map()
    const into = (obj, hash) => { if (!obj) return; if (!intoObject.has(obj)) intoObject.set(obj, []); if (!intoObject.get(obj).includes(hash)) intoObject.get(obj).push(hash) }
    for (const entry of this.attribution.activity()) {
      for (const change of entry.changes) {
        entries.set(change.hash, entry)
        for (const foreign of change.unusual?.foreign ?? []) { into(foreign.obj, change.hash); into(this.holderOf(foreign)?.objId, change.hash) }
      }
    }
    // Each writer with its own verdict, and whether its entry is confirmed (describeWriter).
    const describe = writer => this.describeWriter(writer)
    // Keyed by board data: dictionaries without a prototype, so an ID such as __proto__ is only a key.
    const deletions = dictionary()
    for (const commentId of isMap(doc.deletedComments) ? Object.keys(doc.deletedComments) : []) {
      const writers = this.writersOf(doc, 'deletedComments', commentId, entries, intoObject)
      if (writers.length) deletions[commentId] = writers.map(describe)
    }
    const comments = dictionary()
    const own = (writer, author, commentId) => writer.entry?.kind === 'operation' && !writer.entry.review && writer.entry.event.actorId === author
      && writer.entry.event.result?.commentId === commentId && ['comment.add', 'comment.edit', 'comment.resolve', 'task.handoff'].includes(writer.entry.event.type)
      && writer.entry.changes.every(change => change.state === 'signed')
    for (const commentId of isMap(doc.comments) ? Object.keys(doc.comments) : []) {
      const recorded = ownValue(ownValue(doc.comments, commentId), 'actorId')
      // Text only: any other value a member stored there names no author (and its toString may not be callable).
      const author = typeof recorded === 'string' ? recorded : null
      const writers = [...this.writersOf(doc, 'comments', commentId, entries, intoObject), ...this.writersOf(doc, 'commentBodies', commentId, entries, intoObject)]
      const others = writers.filter(writer => !own(writer, author, commentId))
      if (others.length) comments[commentId] = { changedBy: others.map(describe) }
    }
    // Each current value of a field or comment (every alternative of one with concurrent values) names its recorded
    // Actor and operation. One that a change other than that operation's own signed, unflagged change wrote, or wrote
    // into, is listed by the operation ID it records. A signed, unflagged operation writes exactly the values its event
    // names (lib/operation-writes.js), so only the changes in review or not yet signed are looked at.
    const registers = dictionary(), backend = getBackend(doc)
    const slotOf = (dict, key, make) => (Object.hasOwn(dict, key) ? dict[key] : (dict[key] = make()))
    const list = (map, key, objId, hash) => {
      const container = doc[map]
      const held = ownValue(container, key)
      const value = ownValue(getConflicts(container, key), objId) ?? (held && typeof held === 'object' && getObjectId(held) === objId ? held : undefined)
      const register = value && typeof value === 'object' ? plain(value) : null
      if (typeof ownValue(register, 'operationId') !== 'string') return
      const slot = slotOf(slotOf(registers, `${map}:${key}`, dictionary), register.operationId, () => ({ changedBy: [] }))
      if (!slot.changedBy.some(writer => writer.change === hash)) slot.changedBy.push(describe({ hash, entry: entries.get(hash) ?? null }))
    }
    // Every current value at the key, read through Automerge, so a key named like an inherited property is found as data.
    const current = (map, key) => (isMap(doc[map]) ? backend.getAll(getObjectId(doc[map]), key).filter(full => full.length === 2).map(full => full[1]) : [])
    for (const [hash, entry] of entries) {
      if (!entry.review && entry.changes.find(change => change.hash === hash)?.state === 'signed') continue
      for (const [map, key] of this.attribution.log.entries.get(hash)?.effects ?? []) {
        if (!REGISTER_MAPS.has(map)) continue
        for (const objId of current(map, key)) if (this.attribution.changeOfOp(objId) === hash) list(map, key, objId, hash)
      }
      for (const foreign of entry.changes.find(change => change.hash === hash)?.unusual?.foreign ?? []) {
        const holder = this.holderOf(foreign)
        if (holder && REGISTER_MAPS.has(holder.map) && current(holder.map, holder.key).includes(holder.objId)) list(holder.map, holder.key, holder.objId, hash)
      }
    }
    const value = { deletions, comments, registers }
    this.currentWriterMemo = { key: memo, value }
    return value
  }

  /** The board's Actors that can be read (Workspace.actors). */
  async getAgents() { return this.workspace.actors() }

  close() {
    this.closePromise ??= this.closeResources()
    return this.closePromise
  }

  async closeResources() {
    if (this.closed) return
    this.attribution?.pause()
    this.stopController.abort()
    clearTimeout(this.syncTimer)
    clearTimeout(this.signatureSaveTimer)
    clearImmediate(this.changeLogTimer)
    if (this.indexChanges) this.workspace?.handle.off('heads-changed', this.indexChanges)
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
