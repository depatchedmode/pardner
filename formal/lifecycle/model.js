/**
 * Lifecycle model: request admission, persistence acknowledgement, and shutdown
 * of the Pardner hub (`AutomergeSyncServer` + `WorkspaceRuntime` + `DurableRepo`)
 * with one enrolled replica (`WorkspaceRuntime` in the replica role).
 *
 * Document heads are abstracted as a pair {r, h}: r replica-authored edits and
 * h hub-authored operations known so far. Each side authors edits in sequence,
 * so "hasHeads(doc, heads)" is the componentwise comparison `within`.
 *
 * Every action records `maps`: the concrete source anchors it abstracts. The
 * drift check in check.js verifies those anchors still exist and that the
 * mapped files match formal/lifecycle/mapping.json.
 */

export const DEFAULT_BOUNDS = { replicaEdits: 2, hubOps: 1, ackAttempts: 1, storageFailures: 1 }

export const MUTATIONS = {
  'receipt-before-persist': 'workspace.apply returns savedLocally before awaiting repo.flush',
  'ack-before-persist': 'workspace.acknowledge responds before awaiting repo.flush',
  'hub-acks-unknown-heads': 'workspace.acknowledge skips the hasHeads check',
  'stale-ack-accepted': 'synchronizeAcknowledgement records the current heads without the requested-heads guards',
  'admit-while-stopping': 'the stopping middleware no longer rejects new HTTP requests',
  'upgrade-while-stopping': 'the upgrade handler no longer rejects upgrades while stopping',
  'close-store-before-drain': 'stop() closes the store before the listeners have drained',
  'lease-before-drain': 'closeResources releases the lease before the persistence queue drains',
  'no-idle-reclaim': 'listen() no longer reclaims a connection that becomes idle after stop() began',
}

const SERVER = 'automerge-sync-server.js'
const RUNTIME = 'lib/workspace-runtime.js'
const WORKSPACE = 'lib/workspace.js'
const REPO = 'lib/durable-repo.js'

export const within = (heads, doc) => heads.r <= doc.r && heads.h <= doc.h
export const sameHeads = (a, b) => a.r === b.r && a.h === b.h
const busy = conn => conn === 'active' || conn === 'idle' || conn === 'ws'

export function createModel({ bounds = DEFAULT_BOUNDS, mutation = null } = {}) {
  if (mutation && !(mutation in MUTATIONS)) throw new Error(`Unknown model mutation: ${mutation}`)
  const requests = []
  for (let i = 0; i < bounds.hubOps; i++) requests.push({ id: `op${i + 1}`, kind: 'op' })
  for (let i = 0; i < bounds.ackAttempts; i++) requests.push({ id: `ack${i + 1}`, kind: 'ack' })
  requests.push({ id: 'ws1', kind: 'upgrade' })

  const initial = () => ({
    stopping: false, listener: 'open', repoClosing: false, storeOpen: true, done: false,
    hub: { r: 0, h: 0 }, disk: { r: 0, h: 0 }, queue: [], failuresLeft: bounds.storageFailures,
    replica: { r: 0, h: 0 }, acked: null, inflight: null,
    flags: { admittedWhileStopping: false, upgradeWhileStopping: false },
    requests: requests.map(({ id, kind }) => ({
      id, kind, state: 'new', conn: 'none', keepAlive: false, edit: null, result: null, heads: null, hubHeads: null,
    })),
  })

  const patchRequest = (state, index, patch) => ({
    ...state, requests: state.requests.map((request, i) => {
      if (i !== index) return request
      const next = { ...request, ...patch }
      if (next.conn === 'closed') next.keepAlive = false
      return next
    }),
  })
  /** The replica consumed this acknowledgement; only the connection still matters. */
  const finished = (state, index, acked) => patchRequest({ ...state, inflight: null, ...(acked ? { acked } : {}) }, index,
    { state: 'finished', heads: null, hubHeads: null, result: null })
  const enqueue = (queue, job) => (job.kind === 'bg' && queue.at(-1)?.kind === 'bg' ? queue : [...queue, job])
  const actions = []
  const action = (name, { fair, maps, apply }) => actions.push({ name, fair, maps, apply })
  const each = (kind, build) => requests.forEach((request, index) => { if (request.kind === kind) build(request, index) })

  // ---- Environment: requests arrive, clients edit, the operator stops the service ----

  each('op', (request, index) => action(`Arrive(${request.id})`, {
    fair: false,
    maps: [
      { file: SERVER, anchor: "return res.set('Connection', 'close').status(503).json({", note: 'first middleware; stopping is read synchronously' },
      { file: SERVER, anchor: "this.app.post('/automerge/operations'", note: 'route reached only after admission' },
      { file: SERVER, anchor: "this.app.post('/automerge/membership/records'", note: 'the record gate is a hub operation behind the same admission' },
    ],
    apply: state => arrive(state, index, 'new'),
  }))
  each('ack', (request, index) => action(`Arrive(${request.id})`, {
    fair: false,
    maps: [
      { file: SERVER, anchor: "return res.set('Connection', 'close').status(503).json({", note: 'first middleware; stopping is read synchronously' },
      { file: SERVER, anchor: "this.app.post('/automerge/sync-ack'", note: 'route reached only after admission: the local API token, or a request signed by a member machine; a refused signature is a failed acknowledgement (ReplicaReceive)' },
    ],
    apply: state => arrive(state, index, 'sent'),
  }))

  function arrive(state, index, readyState) {
    const request = state.requests[index]
    if (state.done || request.state !== readyState) return []
    const options = []
    if (state.listener === 'open') for (const keepAlive of [false, true]) options.push({ via: null, keepAlive })
    state.requests.forEach((other, j) => { if (j !== index && other.conn === 'idle') options.push({ via: j, keepAlive: true }) })
    return options.map(({ via, keepAlive }) => {
      let next = via === null ? state : patchRequest(state, via, { conn: 'closed' })
      const suffix = via === null ? (keepAlive ? ' keep-alive' : '') : ` via ${state.requests[via].id}`
      const admit = !state.stopping || mutation === 'admit-while-stopping'
      if (!admit) {
        const rejected = request.kind === 'op' ? { state: 'finished', conn: 'closed' } : { state: 'rejected', result: 'rejected', conn: 'closed' }
        return { label: `Arrive(${request.id}${suffix}) rejected 503`, next: patchRequest(next, index, rejected) }
      }
      if (state.stopping) next = { ...next, flags: { ...next.flags, admittedWhileStopping: true } }
      return { label: `Arrive(${request.id}${suffix}) admitted`, next: patchRequest(next, index, { state: 'admitted', conn: 'active', keepAlive }) }
    })
  }

  each('upgrade', (request, index) => action(`UpgradeArrive(${request.id})`, {
    fair: false,
    maps: [
      { file: SERVER, anchor: "this.rejectWebSocketUpgrade(socket, 503, 'Service Unavailable', { error: 'The service is stopping' })" },
      { file: SERVER, anchor: 'target.handleUpgrade(req, socket, head, ws => {', note: 'accepted upgrade becomes a WebSocket client; a native one reaches Automerge only after the machine handshake, and stop() terminates it either way' },
    ],
    apply: state => {
      if (state.done || state.requests[index].state !== 'new') return []
      const options = []
      if (state.listener === 'open') options.push(null)
      state.requests.forEach((other, j) => { if (j !== index && other.conn === 'idle') options.push(j) })
      return options.map(via => {
        let next = via === null ? state : patchRequest(state, via, { conn: 'closed' })
        const accept = !state.stopping || mutation === 'upgrade-while-stopping'
        if (!accept) return { label: `UpgradeArrive(${request.id}) rejected 503`, next: patchRequest(next, index, { state: 'finished', conn: 'closed' }) }
        if (state.stopping) next = { ...next, flags: { ...next.flags, upgradeWhileStopping: true } }
        return { label: `UpgradeArrive(${request.id}) accepted`, next: patchRequest(next, index, { state: 'finished', conn: 'ws' }) }
      })
    },
  }))

  action('ReplicaEdit', {
    fair: false,
    maps: [
      { file: WORKSPACE, anchor: 'this.queue = result.catch(() => {})', note: 'replica-local execute; its own local-save barrier is the same apply() path modeled by Handle(op)' },
      { file: RUNTIME, anchor: "syncPending: !savedLocally || (this.role === 'replica' && (canonical(heads) !== canonical(this.acknowledgedHeads) || signaturesUnacknowledged))", note: 'heads stand for the board and its signature document together; a replica edit is pending until the hub acknowledges both' },
      { file: RUNTIME, anchor: 'for (const record of missing) doc.membership[record.recordId] = storageValue(record)', note: 'a membership write-back is a local change without a request, on a replica or the hub; it only advances heads, and every acknowledgement still flushes first' },
      { file: RUNTIME, anchor: 'if (signatures) this.startAttribution(handle, signatures)', note: 'every local change is signed as it is made (lib/attribution.js) and its signature written to the signature document by a deferred local change; that only advances the signature heads, off the acknowledgement path' },
    ],
    apply: state => (state.done || state.replica.r >= bounds.replicaEdits ? [] : [{ next: { ...state, replica: { ...state.replica, r: state.replica.r + 1 } } }]),
  })

  action('SyncUp', {
    fair: false,
    maps: [
      { file: REPO, anchor: 'storage.saveDoc = (documentId) => this.background(() => this.persistDocument(documentId))', note: 'a synced change reaches the hub document and schedules a throttled background save' },
      { file: REPO, anchor: 'if (this.closing) return Promise.resolve()', note: 'background saves requested after closing are dropped' },
    ],
    apply: state => {
      if (state.done || !state.storeOpen || state.hub.r >= state.replica.r) return []
      const queue = state.repoClosing ? state.queue : enqueue(state.queue, { kind: 'bg' })
      return [{ next: { ...state, hub: { ...state.hub, r: state.hub.r + 1 }, queue } }]
    },
  })

  action('SyncDown', {
    fair: false,
    maps: [{ file: RUNTIME, anchor: 'this.repo.networkSubsystem.addNetworkAdapter(this.adapter)', note: 'hub operations reach the replica through the native adapter' }],
    apply: state => (state.done || state.replica.h >= state.hub.h ? [] : [{ next: { ...state, replica: { ...state.replica, h: state.replica.h + 1 } } }]),
  })

  action('ReplicaSendAck', {
    fair: false,
    maps: [
      { file: RUNTIME, anchor: 'const requestedHeads = getHeads(this.workspace.handle.doc())' },
      { file: RUNTIME, anchor: "const receipt = await this.requestHub('/automerge/sync-ack', {" },
    ],
    apply: state => {
      if (state.done || state.inflight) return []
      const index = state.requests.findIndex(request => request.kind === 'ack' && request.state === 'new')
      if (index < 0) return []
      return [{ next: patchRequest({ ...state, inflight: { req: index, phase: 'sent' } }, index, { state: 'sent', heads: { ...state.replica } }) }]
    },
  })

  action('StopBegin', {
    fair: false,
    maps: [
      { file: SERVER, anchor: 'this.stopping = true', note: 'set synchronously before any await in stop()' },
      { file: SERVER, anchor: '// Stop both listeners before draining upgraded sockets and in-flight requests.', note: 'server.close() refuses new connections and closes idle ones immediately' },
      { file: SERVER, anchor: 'for (const socket of this.unusedSockets ?? []) socket.destroy()', note: 'a connection that never carried a request holds no modeled request; ending it changes no request state' },
      { file: SERVER, anchor: 'for (const client of this.nativeWsServer.clients) client.terminate()', note: 'accepted WebSocket clients are terminated' },
    ],
    apply: state => {
      if (state.done || state.stopping) return []
      const next = { ...state, stopping: true, listener: 'closing',
        requests: state.requests.map(request => (request.conn === 'idle' || request.conn === 'ws' ? { ...request, conn: 'closed' } : request)) }
      return [{ next }]
    },
  })

  each('op', (request, index) => action(`IdleConnectionEnds(${request.id})`, { fair: false, maps: idleEndMaps(), apply: state => idleEnds(state, index) }))
  each('ack', (request, index) => action(`IdleConnectionEnds(${request.id})`, { fair: false, maps: idleEndMaps(), apply: state => idleEnds(state, index) }))
  function idleEndMaps() {
    return [{ file: SERVER, anchor: '// until keepAliveTimeout; let Node mark it idle before reclaiming it.', note: 'client close or Node keepAliveTimeout; neither is assumed to happen (unfair)' }]
  }
  function idleEnds(state, index) {
    if (state.done || state.requests[index].conn !== 'idle') return []
    return [{ next: patchRequest(state, index, { conn: 'closed' }) }]
  }

  // ---- System: handlers, persistence, responses, shutdown steps (weakly fair) ----

  each('op', (request, index) => action(`Handle(${request.id})`, {
    fair: true,
    maps: [
      { file: RUNTIME, anchor: "async execute(request) {\n    requireValue(this.initialized && !this.stopController.signal.aborted", note: 'execute() refuses once closeResources aborted' },
      { file: WORKSPACE, anchor: 'if (!prepared.replayed) this.handle.change(prepared.change)' },
      { file: WORKSPACE, anchor: "throw new OperationError('STORAGE_FAILED', 'Local persistence was not confirmed. Retry with the same operation ID.'" },
      { file: RUNTIME, anchor: "addRecords(records) {\n    requireValue(this.initialized && !this.stopController.signal.aborted", note: 'the record gate refuses once closeResources aborted' },
      { file: RUNTIME, anchor: 'const result = this.workspace.queue.then(() => this.gateRecords(records))', note: 'the gate joins the operation queue that closeResources drains' },
      { file: RUNTIME, anchor: 'for (const entry of missing) doc.membership[entry.recordId] = storageValue(entry)', note: 'the gate’s change, then its flush; a refused record changes nothing' },
      { file: RUNTIME, anchor: "throw new OperationError('STORAGE_FAILED', 'Local persistence of the membership records was not confirmed. Retry the same request.'" },
    ],
    apply: state => {
      if (state.done || state.requests[index].state !== 'admitted') return []
      if (state.repoClosing) return [{ label: `Handle(${request.id}) unavailable`, next: patchRequest(state, index, { state: 'responding', result: 'unavailable' }) }]
      const edit = state.hub.h + 1
      const next = { ...state, hub: { ...state.hub, h: edit }, queue: [...state.queue, { kind: 'flush', req: index }] }
      if (mutation === 'receipt-before-persist') return [{ next: patchRequest(next, index, { state: 'responding', result: 'ok', edit }) }]
      return [{ next: patchRequest(next, index, { state: 'flushing', edit }) }]
    },
  }))

  each('ack', (request, index) => action(`Handle(${request.id})`, {
    fair: true,
    maps: [
      { file: RUNTIME, anchor: 'return this.workspace.acknowledge(heads, signatureHeads)', note: 'no initialized/aborted guard on this path' },
      { file: WORKSPACE, anchor: 'if (!hasHeads(this.handle.doc(), heads)) return { acknowledged: false }' },
      { file: WORKSPACE, anchor: 'if (signatureHeads && !(this.signatures && hasHeads(this.signatures.doc(), signatureHeads))) return { acknowledged: false }', note: 'the same guard for the signature document: both components of the modeled heads must be held' },
      { file: WORKSPACE, anchor: 'await this.repo.flush(this.documents())\n    return { acknowledged: true', note: 'one flush job covers both documents' },
    ],
    apply: state => {
      const current = state.requests[index]
      if (state.done || current.state !== 'admitted') return []
      const known = mutation === 'hub-acks-unknown-heads' || within(current.heads, state.hub)
      if (!known) return [{ label: `Handle(${request.id}) not acknowledged`, next: patchRequest(state, index, { state: 'responding', result: 'nack' }) }]
      const next = { ...state, queue: [...state.queue, { kind: 'flush', req: index }] }
      if (mutation === 'ack-before-persist') return [{ next: patchRequest(next, index, { state: 'responding', result: 'ok', hubHeads: state.disk }) }]
      return [{ next: patchRequest(next, index, { state: 'flushing' }) }]
    },
  }))

  action('PersistRun', {
    fair: true,
    maps: [
      { file: REPO, anchor: 'const result = this.persistenceQueue.then(operation)', note: 'one job at a time, FIFO' },
      { file: REPO, anchor: 'await this.saveDocument(documentId, doc)', note: 'persistDocument reads the current document' },
      { file: REPO, anchor: 'this.persistedHeads.set(documentId, heads)' },
      { file: REPO, anchor: 'this.storageError = error\n        throw error', note: 'flush failure propagates to the caller' },
    ],
    apply: state => {
      if (state.done || !state.queue.length) return []
      const [job, ...rest] = state.queue
      const finish = (base, result) => {
        const request = base.requests[job.req]
        if (job.kind !== 'flush' || request.state !== 'flushing') return base
        return patchRequest(base, job.req, { state: 'responding', result, ...(request.kind === 'ack' ? { hubHeads: base.disk } : {}) })
      }
      const outcomes = [{ label: 'PersistRun succeeds', next: finish({ ...state, queue: rest, disk: { ...state.hub } }, 'ok') }]
      if (state.failuresLeft > 0) {
        outcomes.push({ label: 'PersistRun fails', next: finish({ ...state, queue: rest, failuresLeft: state.failuresLeft - 1 }, 'fail') })
      }
      return outcomes
    },
  })

  each('op', (request, index) => action(`Respond(${request.id})`, { fair: true, maps: respondMaps(), apply: state => respond(state, index) }))
  each('ack', (request, index) => action(`Respond(${request.id})`, { fair: true, maps: respondMaps(), apply: state => respond(state, index) }))
  function respondMaps() {
    return [
      { file: SERVER, anchor: 'res.json(await this.store.acknowledge(req.body?.workspaceId, req.body?.heads, req.body?.signatureHeads ?? null))' },
      { file: SERVER, anchor: 'res.json(await this.store.addRecords(req.body?.records))', note: 'the gate answers only after its flush' },
      { file: WORKSPACE, anchor: 'result: plain(event.result), replayed: prepared.replayed, savedLocally: true,' },
      { file: SERVER, anchor: "res.once('finish', () => {", note: 'response completion; keep-alive sockets become idle' },
    ]
  }
  function respond(state, index) {
    const current = state.requests[index]
    if (state.done || current.state !== 'responding') return []
    const conn = current.keepAlive ? 'idle' : 'closed'
    // An operation receipt has been delivered; the invariant was checked while responding and disk only grows.
    if (current.kind === 'op') return [{ next: patchRequest(state, index, { state: 'finished', conn, edit: null, result: null, hubHeads: null }) }]
    return [{ next: patchRequest(state, index, { state: 'responded', conn }) }]
  }

  each('op', (request, index) => action(`ReclaimIdle(${request.id})`, { fair: true, maps: reclaimMaps(), apply: state => reclaim(state, index) }))
  each('ack', (request, index) => action(`ReclaimIdle(${request.id})`, { fair: true, maps: reclaimMaps(), apply: state => reclaim(state, index) }))
  function reclaimMaps() {
    return [{ file: SERVER, anchor: 'if (this.stopping) setImmediate(() => server.closeIdleConnections())' }]
  }
  function reclaim(state, index) {
    if (mutation === 'no-idle-reclaim') return []
    if (state.done || !state.stopping || state.requests[index].conn !== 'idle') return []
    return [{ next: patchRequest(state, index, { conn: 'closed' }) }]
  }

  action('ListenerClosed', {
    fair: true,
    maps: [{ file: SERVER, anchor: 'const listenerResults = await listenersClosed', note: 'server.close callbacks fire once every connection has ended' }],
    apply: state => {
      if (state.done || state.listener !== 'closing' || state.requests.some(request => busy(request.conn))) return []
      return [{ next: { ...state, listener: 'closed' } }]
    },
  })

  action('StoreCloseBegin', {
    fair: true,
    maps: [
      { file: SERVER, anchor: 'await this.store.close()', note: 'after listenersClosed settled' },
      { file: RUNTIME, anchor: 'this.stopController.abort()' },
      { file: RUNTIME, anchor: 'await this.workspace?.queue', note: 'operation queue is already empty: every operation and record gate request arrives through a drained listener' },
      { file: RUNTIME, anchor: 'await this.harvests', note: 'a pending membership harvest settles before the repo closes; it admits no request' },
      { file: RUNTIME, anchor: 'this.attribution?.close()', note: 'pending signatures are written into the signature document in memory, after the operation queue drained; it admits no request, and each signature is already in the signature cache' },
      { file: RUNTIME, anchor: 'await this.hubStateWrites?.catch(() => {})', note: 'a pending write of the hub’s own waiting state settles before the repo closes and the lease is released; it admits no request' },
      { file: REPO, anchor: 'this.closing = true' },
    ],
    apply: state => {
      if (state.done || !state.stopping || !state.storeOpen || state.repoClosing) return []
      if (state.listener !== 'closed' && mutation !== 'close-store-before-drain') return []
      return [{ next: { ...state, repoClosing: true } }]
    },
  })

  action('StoreCloseComplete', {
    fair: true,
    maps: [
      { file: REPO, anchor: 'await this.persistenceQueue', note: 'drains jobs enqueued before closing' },
      { file: RUNTIME, anchor: 'this.lease?.close()', note: 'storage ownership released in finally' },
      { file: RUNTIME, anchor: 'this.closed = true' },
    ],
    apply: state => {
      if (state.done || !state.repoClosing || !state.storeOpen) return []
      if (state.queue.length && mutation !== 'lease-before-drain') return []
      return [{ next: { ...state, storeOpen: false, done: true } }]
    },
  })

  each('ack', (request, index) => action(`ReplicaReceive(${request.id})`, {
    fair: true,
    maps: [
      { file: RUNTIME, anchor: 'if (canonical(getHeads(doc)) === canonical(requestedHeads) && hasHeads(doc, receipt.hubHeads) && signaturesHeld) {', note: 'first guard, before the local flush; the hub’s reported heads must be held for both documents' },
      { file: RUNTIME, anchor: 'if (!this.stopController.signal.aborted) this.lastSyncError = error.message', note: 'rejected or failed acknowledgements only record an error' },
    ],
    apply: state => {
      const current = state.requests[index]
      if (state.done || state.inflight?.req !== index || state.inflight.phase !== 'sent') return []
      if (current.state !== 'responded' && current.state !== 'rejected') return []
      if (current.result !== 'ok') return [{ label: `ReplicaReceive(${request.id}) ${current.result}`, next: finished(state, index, null) }]
      const accept = mutation === 'stale-ack-accepted'
        || (sameHeads(state.replica, current.heads) && within(current.hubHeads, state.replica))
      if (!accept) return [{ label: `ReplicaReceive(${request.id}) ignored (heads moved)`, next: finished(state, index, null) }]
      return [{ label: `ReplicaReceive(${request.id}) acknowledged`, next: { ...state, inflight: { ...state.inflight, phase: 'flushing' } } }]
    },
  }))

  each('ack', (request, index) => action(`ReplicaAckCommit(${request.id})`, {
    fair: true,
    maps: [
      { file: RUNTIME, anchor: 'if (canonical(getHeads(this.workspace.handle.doc())) === canonical(requestedHeads)) {\n            this.acknowledgedHeads = requestedHeads', note: 'second guard after the local flush; records the requested snapshot, not the current heads' },
      { file: RUNTIME, anchor: 'if (signatures) this.acknowledgedSignatureHeads = requestedSignatureHeads', note: 'the signature document’s requested snapshot likewise, never its current heads' },
    ],
    apply: state => {
      if (state.done || state.inflight?.req !== index || state.inflight.phase !== 'flushing') return []
      const current = state.requests[index]
      if (mutation === 'stale-ack-accepted') return [{ next: finished(state, index, { ...state.replica }) }]
      if (!sameHeads(state.replica, current.heads)) return [{ label: `ReplicaAckCommit(${request.id}) skipped (heads moved)`, next: finished(state, index, null) }]
      return [{ next: finished(state, index, { ...current.heads }) }]
    },
  }))

  // ---- Properties ----

  const invariants = [
    {
      name: 'ReceiptAfterBarrier',
      description: 'A savedLocally receipt or an acknowledged sync-ack is produced only after the persistence barrier covered its heads.',
      holds: state => state.requests.every(request => {
        if (request.result !== 'ok' || request.kind === 'upgrade') return true
        if (request.kind === 'op') return request.edit !== null && state.disk.h >= request.edit
        return within(request.heads, state.disk) && within(request.hubHeads, state.disk)
      }),
    },
    {
      name: 'StorageAvailableWhileAdmitted',
      description: 'Admitted requests and queued persistence jobs only exist while the store is open.',
      holds: state => state.storeOpen || (state.queue.length === 0
        && state.requests.every(request => !['admitted', 'flushing', 'responding'].includes(request.state))),
    },
    {
      name: 'NoAdmissionWhileStopping',
      description: 'Once stopping began, no HTTP request is admitted and no WebSocket upgrade is accepted.',
      holds: state => !state.flags.admittedWhileStopping && !state.flags.upgradeWhileStopping,
    },
    {
      name: 'AckedHeadsPersisted',
      description: 'The heads a replica records as acknowledged were persisted by the hub, so newer local edits are never reported as synchronized.',
      holds: state => state.acked === null || within(state.acked, state.disk),
    },
  ]

  const progress = {
    name: 'ShutdownCompletes',
    description: 'Once stop() begins, shutdown completes under weak fairness of the system actions.',
    trigger: state => state.stopping,
    goal: state => state.done,
  }

  /** Reachability witnesses: scenarios the bounds must actually cover, otherwise the properties are vacuous. */
  const witnesses = [
    { name: 'acknowledgement admitted before stop() is still in flight while the listener drains',
      holds: state => state.stopping && state.listener === 'closing' && state.requests.some(request => request.kind === 'ack' && ['admitted', 'flushing', 'responding'].includes(request.state)) },
    { name: 'operation admitted before stop() is still in flight while the listener drains',
      holds: state => state.stopping && state.listener === 'closing' && state.requests.some(request => request.kind === 'op' && ['admitted', 'flushing', 'responding'].includes(request.state)) },
    { name: 'keep-alive connection becomes idle after stop() began',
      holds: state => state.stopping && state.requests.some(request => request.conn === 'idle') },
    { name: 'request rejected with 503 after stop() began',
      holds: state => state.stopping && state.requests.some(request => request.state === 'rejected') },
    { name: 'persistence failure reported to a request',
      holds: state => state.requests.some(request => request.result === 'fail') },
    { name: 'acknowledgement for older heads pending while the replica has newer edits',
      holds: state => state.inflight?.phase === 'sent' && state.requests.some(request => request.kind === 'ack' && request.state === 'responded' && request.result === 'ok' && !sameHeads(request.heads, state.replica)) },
    { name: 'replica edits acknowledged', holds: state => state.acked !== null && state.acked.r === bounds.replicaEdits },
    { name: 'hub operation acknowledged by the replica', holds: state => state.acked !== null && state.acked.h >= 1 },
    { name: 'synced change still unpersisted when shutdown completes (never acknowledged)',
      holds: state => state.done && state.hub.r > state.disk.r },
    { name: 'shutdown completed with every persisted head acknowledged',
      holds: state => state.done && state.acked !== null && sameHeads(state.acked, state.disk) && sameHeads(state.disk, state.hub) },
  ]

  return { bounds, mutation, requests, initial, actions, invariants, progress, witnesses }
}

export function describeState(state) {
  const requests = state.requests.map(request => {
    const heads = request.heads ? ` heads=${request.heads.r}/${request.heads.h}` : ''
    const edit = request.edit !== null ? ` edit=${request.edit}` : ''
    const result = request.result ? ` ${request.result}` : ''
    return `${request.id}:${request.state}/${request.conn}${request.keepAlive ? '+ka' : ''}${heads}${edit}${result}`
  }).join(' ')
  const queue = state.queue.map(job => (job.kind === 'bg' ? 'bg' : `flush(${state.requests[job.req].id})`)).join(',') || '-'
  const acked = state.acked ? `${state.acked.r}/${state.acked.h}` : '-'
  const inflight = state.inflight ? `${state.requests[state.inflight.req].id}@${state.inflight.phase}` : '-'
  return `stopping=${state.stopping} listener=${state.listener} repoClosing=${state.repoClosing} storeOpen=${state.storeOpen} done=${state.done}`
    + ` | hub=${state.hub.r}/${state.hub.h} disk=${state.disk.r}/${state.disk.h} queue=[${queue}] failuresLeft=${state.failuresLeft}`
    + ` | replica=${state.replica.r}/${state.replica.h} acked=${acked} inflight=${inflight} | ${requests}`
}
