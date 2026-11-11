#!/usr/bin/env node

/**
 * Automerge Sync Server
 *
 * One project's HTTP and WebSocket service: the client's internal per-project
 * runtime, or the standalone agent and integration service (`pardner serve`).
 * The CLI, external harnesses and UI clients talk to it with its local API
 * token. Other machines reach a hub only with their machine keys: the native
 * sync socket opens with the machine handshake, and their HTTP requests are
 * signed (lib/machine-handshake.js, lib/machine-session.js).
 */

import { WebSocketServer } from 'ws'
import { ValidatedWebSocketServerAdapter } from './lib/validated-websocket-server-adapter.js'
import { WorkspaceRuntime } from './lib/workspace-runtime.js'
import express from 'express'
import crypto from 'crypto'
import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { resolve } from 'node:path'
import { findGitRoot, getTraceByCommit } from './lib/agent-trace.js'
import { parseGithubRepo } from './lib/github-remote.js'
import { isLoopback, isLoopbackRequest } from './lib/loopback.js'
import { ControlPane } from './lib/control-pane.js'
import { T3Busy, T3Rejected, T3Unknown } from './lib/t3-mcp-client.js'
import { HandshakeError, respondHandshake } from './lib/machine-handshake.js'
import { SessionServer, signedBody, signedHeaders } from './lib/machine-session.js'
import { removalFor } from './lib/membership.js'

const DEFAULT_HTTP_PORT = 8004
const DEFAULT_WS_PORT = 8005

/** WebSocket path for Automerge Repo native (CBOR) sync — distinct from JSON UI subscriptions. */
const NATIVE_AUTOMERGE_WS_PATH = '/automerge'
const REQUEST_LIMIT = '100kb'
/** Routes another machine may call with a signed request instead of the local API token. */
const MACHINE_ROUTES = new Set(['/automerge/sync-ack'])
/** How long a second sync session for one machine waits for the first to answer a ping before the first is presumed gone. */
const DUPLICATE_PROBE_MS = 3000
const HUB_WAITING_MESSAGE = 'This hub was restored or fell behind, and waits to catch up with a current member machine before it serves another machine. '
  + 'If no machine holds newer state, its operator can run pardner client resume --project ID on the hub.'

function wsUpgradePathname(req) {
  try {
    return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname
  } catch {
    return '/'
  }
}

function defaultAllowedOrigins(httpPort) {
  return [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    `http://localhost:${httpPort}`,
    `http://127.0.0.1:${httpPort}`
  ]
}

function parseAllowedOrigins(value, defaults) {
  if (value instanceof Set) return new Set(value)
  if (Array.isArray(value)) {
    return new Set(value.map(origin => origin.trim()).filter(Boolean))
  }
  if (!value) return new Set(defaults)
  return new Set(
    String(value)
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  )
}

function parsePort(value, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid ${name}: ${value}`)
  }
  return parsed
}

function appendHeaderValue(existing, value) {
  if (!existing) return value
  const values = String(existing)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  if (values.includes(value)) return String(existing)
  return `${existing}, ${value}`
}

function getBearerToken(authorizationHeader = '') {
  if (!authorizationHeader.startsWith('Bearer ')) return null
  return authorizationHeader.slice('Bearer '.length).trim()
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

class AutomergeSyncServer {
  constructor(options = {}) {
    const env = options.env ?? process.env
    this.logger = options.logger ?? console
    this.store = options.store ?? new WorkspaceRuntime({
      directory: options.directory ?? options.storagePath ?? resolve(env.PARDNER_DATA_DIR ?? '.pardner'),
      role: 'hub', actors: options.actors ?? [],
    })
    this.connectedClients = new Set()
    this.app = express()
    this.wssJson = null
    this.nativeWsServer = null
    this.automergeWsAdapter = null
    this.httpServer = null
    this.wsHttpServer = null
    this.host = options.host ?? env.PARDNER_BIND_HOST ?? '127.0.0.1'
    // Host-local T3 control records; `control: false` leaves them unopened.
    this.controlOptions = options.control ?? {}
    this.control = null
    this.browserWsPath = options.browserWsPath ?? env.PARDNER_BROWSER_WS_PATH
    if (this.browserWsPath !== undefined && !/^\/(?!\/)[^?#\\]*$/.test(this.browserWsPath)) {
      throw new Error('PARDNER_BROWSER_WS_PATH must be an absolute path without a query or fragment')
    }
    this.httpPort = parsePort(options.httpPort ?? env.PARDNER_HTTP_PORT ?? DEFAULT_HTTP_PORT, 'PARDNER_HTTP_PORT')
    this.wsPort = parsePort(options.wsPort ?? env.PARDNER_WS_PORT ?? DEFAULT_WS_PORT, 'PARDNER_WS_PORT')
    this.apiToken = options.apiToken ?? env.PARDNER_API_TOKEN ?? ''
    // The client's loopback hop to this runtime's native socket: its own process proves it with this token. It is
    // a credential inside one machine; other machines prove themselves only with the handshake.
    this.nativeToken = options.nativeToken ?? null
    if (this.nativeToken !== null && (!isNonEmptyString(this.nativeToken) || this.nativeToken === this.apiToken)) {
      throw new Error('The native socket token must be nonempty and distinct from the API token')
    }
    // Routes other machines dial to reach this hub; the handshake binds them. The client passes its public routes;
    // otherwise they are this service's own listener addresses.
    this.machineRoutes = options.machineRoutes ?? null
    this.syncSessions = new Map()
    this.duplicates = new Map()
    this.allowInsecureLocal = options.allowInsecureLocal ?? env.PARDNER_ALLOW_INSECURE_LOCAL === '1'
    this.allowLegacyWsQueryToken = options.allowLegacyWsQueryToken ?? env.PARDNER_ALLOW_LEGACY_WS_QUERY_TOKEN === '1'
    this.wsTicketTtlMs = Number(
      options.wsTicketTtlMs ?? env.PARDNER_WS_TICKET_TTL_MS ?? 60000
    )
    this.wsTickets = new Map()
    this.securityCounters = {
      httpUnauthorized: 0,
      httpOriginRejected: 0,
      wsUnauthorized: 0,
      wsOriginRejected: 0,
      machineRefused: 0,
      duplicateMachine: 0,
    }
    this.explicitOrigins = options.allowedOrigins !== undefined || env.PARDNER_ALLOWED_ORIGINS !== undefined
    this.allowedOrigins = parseAllowedOrigins(
      options.allowedOrigins ?? env.PARDNER_ALLOWED_ORIGINS ?? '',
      defaultAllowedOrigins(this.httpPort)
    )

    if (!this.apiToken && !this.allowInsecureLocal) {
      throw new Error(
        'PARDNER_API_TOKEN is required. To bypass for local-only testing, set PARDNER_ALLOW_INSECURE_LOCAL=1.'
      )
    }
    this.validateListenerHost(this.host)
    if (this.allowedOrigins.has('*')) {
      throw new Error(
        'PARDNER_ALLOWED_ORIGINS must be an explicit comma-separated allowlist. Wildcard "*" is not supported.'
      )
    }
    if (!Number.isInteger(this.wsTicketTtlMs) || this.wsTicketTtlMs <= 0) {
      throw new Error(`Invalid PARDNER_WS_TICKET_TTL_MS: ${env.PARDNER_WS_TICKET_TTL_MS}`)
    }
  }
  
  async start() {
    this.validateListenerHost(this.host)
    this.stopping = false
    this.logger.log?.('🚀 Starting Automerge Sync Server...')
    
    // Initialize backend store
    await this.store.init()
    this.onDocumentChange = () => this.broadcastDocumentUpdate()
    this.onRuntimeStatus = status => this.broadcastMessage({ type: 'sync-status', status })
    this.onMembership = () => this.enforceMembership()
    this.store.docHandle.on('change', this.onDocumentChange)
    this.store.on?.('status', this.onRuntimeStatus)
    this.store.on?.('membership', this.onMembership)
    this.sessions = this.store.role === 'hub' && this.store.machineKey ? new SessionServer({ key: this.store.machineKey,
      projectId: this.store.manifest.workspaceId, acceptRoute: route => this.routes().http.includes(route),
      member: machineId => this.memberKey(machineId), refusal: machineId => this.notMember(machineId),
      welcome: () => {
        if (this.store.hubStatus()?.waiting) throw new HandshakeError('HUB_WAITING', HUB_WAITING_MESSAGE)
        return { records: this.store.records.all(), checkpoint: this.store.checkpoint() }
      } }) : null
    this.logger.log?.('✅ Backend AutomergeStore initialized')
    if (this.controlOptions !== false) {
      this.control = await new ControlPane({ directory: this.store.directory, logger: this.logger, ...this.controlOptions,
        identity: { workspaceId: this.store.manifest.workspaceId, replicaId: this.store.manifest.replicaId },
        doc: () => this.store.getDoc() }).open()
      this.control.start()
    }
    
    // Setup Express for HTTP API
    this.setupHTTPAPI()
    
    // Setup WebSocket for real-time sync
    this.setupWebSocketServer()
    this.store.repo.networkSubsystem.addNetworkAdapter(this.automergeWsAdapter)

    // Start HTTP server
    this.httpServer = createServer(this.app)
    await this.listen(this.httpServer, this.httpPort, this.host)
    this.httpPort = this.getBoundPort(this.httpServer, this.httpPort)
    const authority = this.host.includes(':') ? `[${this.host}]` : this.host
    this.directRoutes = { http: [`http://${authority}:${this.httpPort}`] }
    if (!this.explicitOrigins) {
      for (const origin of defaultAllowedOrigins(this.httpPort)) this.allowedOrigins.add(origin)
    }

    await this.listen(this.wsHttpServer, this.wsPort, this.host)
    this.wsPort = this.getBoundPort(this.wsHttpServer, this.wsPort)
    this.directRoutes.ws = [`ws://${authority}:${this.wsPort}${NATIVE_AUTOMERGE_WS_PATH}`]

    this.logger.log?.(`📡 HTTP API listening on ${this.host}:${this.httpPort}`)
    this.logger.log?.(`🌐 WebSocket sync on ${this.host}:${this.wsPort}`)
    this.logger.log?.(`🔐 Auth mode: ${this.apiToken ? 'token required' : 'disabled (unsafe local mode)'}`)
    this.logger.log?.(
      `🌍 Allowed CORS origins: ${this.allowedOrigins.size === 0 ? '(none)' : [...this.allowedOrigins].join(', ')}`
    )
    
    // Register default agents if not exists
  }

  getBoundPort(server, fallbackPort) {
    const address = server?.address?.()
    if (address && typeof address === 'object' && Number.isInteger(address.port)) {
      return address.port
    }
    return fallbackPort
  }

  validateListenerHost(host) {
    if (!this.apiToken && (!this.allowInsecureLocal || !isIP(host) || !isLoopback(host))) {
      throw new Error('An empty PARDNER_API_TOKEN requires PARDNER_ALLOW_INSECURE_LOCAL=1 and a numeric loopback PARDNER_BIND_HOST (127.0.0.1 or ::1).')
    }
  }

  async listen(server, port, host) {
    this.validateListenerHost(host)
    server.on('request', (_req, res) => {
      res.once('finish', () => {
        // A keep-alive socket whose accepted response finishes after stop() began must not hold shutdown
        // until keepAliveTimeout; let Node mark it idle before reclaiming it.
        if (this.stopping) setImmediate(() => server.closeIdleConnections())
      })
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => { server.off('error', reject); resolve() })
    })
  }

  async stop() {
    this.stopping = true
    this.sessions?.clear()
    // Stop both listeners before draining upgraded sockets and in-flight requests.
    const listenersClosed = Promise.allSettled([
      this.closeServer(this.wsHttpServer), this.closeServer(this.httpServer),
    ])
    if (this.onDocumentChange) this.store.docHandle?.off('change', this.onDocumentChange)
    if (this.onRuntimeStatus) this.store.off?.('status', this.onRuntimeStatus)
    if (this.onMembership) this.store.off?.('membership', this.onMembership)
    for (const client of this.connectedClients) {
      try {
        client.terminate()
      } catch {
        // Ignore client shutdown errors during teardown.
      }
    }
    this.connectedClients.clear()

    if (this.wssJson) {
      await new Promise(resolve => this.wssJson.close(() => resolve()))
      this.wssJson = null
    }
    if (this.nativeWsServer) {
      for (const client of this.nativeWsServer.clients) client.terminate()
      await new Promise(resolve => this.nativeWsServer.close(() => resolve()))
      this.nativeWsServer = null
    }
    this.automergeWsAdapter = null

    const listenerResults = await listenersClosed
    await this.control?.close()
    this.control = null
    this.wsHttpServer = null
    this.httpServer = null

    await this.store.close()
    for (const result of listenerResults) if (result.status === 'rejected') throw result.reason
  }

  async closeServer(server) {
    if (!server?.listening) return
    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) return reject(error)
        resolve()
      })
    })
  }

  isAllowedOrigin(origin) {
    if (!origin) return true
    return this.allowedOrigins.has(origin)
  }

  applyCorsHeaders(res, origin) {
    if (!origin) return
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Pardner-Token, X-Pardner-Workspace')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
    res.setHeader('Vary', appendHeaderValue(res.getHeader('Vary'), 'Origin'))
  }

  recordSecurityEvent(type, message) {
    if (type in this.securityCounters) {
      this.securityCounters[type] += 1
    }
    this.logger.warn?.(`[security] ${message}`)
  }

  getSecurityCounters() {
    return { ...this.securityCounters }
  }

  originMiddleware(req, res, next) {
    const origin = req.headers.origin
    if (!this.isAllowedOrigin(origin)) {
      this.recordSecurityEvent(
        'httpOriginRejected',
        `Rejected HTTP ${req.method} from a disallowed origin`
      )
      return res.status(403).json({ code: 'ORIGIN_REJECTED', error: 'Origin not allowed. Open the current device address.' })
    }

    this.applyCorsHeaders(res, origin)

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    return next()
  }

  tokenFromRequest(req, options = {}) {
    const { allowLegacyWsQueryToken = false } = options
    const bearerToken = getBearerToken(req.headers?.authorization || '')
    if (bearerToken) return bearerToken

    const headerToken = req.headers?.['x-pardner-token']
    if (headerToken) return String(headerToken)

    if (allowLegacyWsQueryToken && this.allowLegacyWsQueryToken) {
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const queryToken = url.searchParams.get('token')
        if (queryToken) return queryToken
      } catch {
        // Ignore malformed URL values and continue unauthenticated.
      }
    }

    return null
  }

  wsTicketFromRequest(req) {
    try {
      const url = new URL(req.url || '', 'http://localhost')
      const ticket = url.searchParams.get('ticket')
      if (ticket) return ticket
    } catch {
      // Ignore malformed URL values and continue unauthenticated.
    }

    return null
  }

  mintWsTicket(native = false) {
    const ticket = crypto.randomBytes(32).toString('hex')
    this.wsTickets.set(ticket, { expiresAt: Date.now() + this.wsTicketTtlMs, native })
    return ticket
  }

  consumeWsTicket(ticket, native = false) {
    if (!ticket) return false
    const grant = this.wsTickets.get(ticket)
    if (!grant) return false
    this.wsTickets.delete(ticket)
    return grant.expiresAt > Date.now() && grant.native === native
  }

  cleanupExpiredWsTickets() {
    const now = Date.now()
    for (const [ticket, { expiresAt }] of this.wsTickets) {
      if (expiresAt <= now) this.wsTickets.delete(ticket)
    }
  }

  isAuthorizedRequest(req) {
    if (!this.apiToken) return true
    const token = this.tokenFromRequest(req)
    return token === this.apiToken
  }

  isAuthorizedWebSocketRequest(req) {
    if (wsUpgradePathname(req) === NATIVE_AUTOMERGE_WS_PATH) {
      // Another machine is admitted by the handshake on the socket; behind the client, its loopback hop also needs a ticket.
      if (!this.store.machineKey || this.store.role !== 'hub') return false
      return this.nativeToken === null || this.consumeWsTicket(this.wsTicketFromRequest(req), true)
    }
    if (!this.apiToken) return true

    const token = this.tokenFromRequest(req, { allowLegacyWsQueryToken: true })
    if (token === this.apiToken) return true

    const ticket = this.wsTicketFromRequest(req)
    return this.consumeWsTicket(ticket)
  }

  authMiddleware(req, res, next) {
    if (this.isAuthorizedRequest(req)) {
      const workspaceId = req.headers['x-pardner-workspace']
      if (workspaceId && workspaceId !== this.store.manifest.workspaceId) {
        return res.status(409).json({ code: 'WORKSPACE_MISMATCH', error: 'The service workspace changed. Reload before continuing.' })
      }
      return next()
    }
    const signed = MACHINE_ROUTES.has(req.path) && this.sessions ? signedHeaders(req.headers) : null
    if (signed) {
      try {
        req.machine = this.verifyMachine({ ...signed, method: req.method, suffix: req.originalUrl, body: signedBody(req.method, req.body) })
        return next()
      } catch (error) {
        this.recordSecurityEvent('machineRefused', `Refused a signed ${req.method} from another machine`)
        return res.status(machineStatus(error.code)).json({ code: error.code, error: error.message })
      }
    }
    this.recordSecurityEvent(
      'httpUnauthorized',
      `Rejected unauthorized HTTP ${req.method}`
    )
    return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' })
  }
  
  /** The routes other machines dial to reach this hub, as `{ http, ws }`. */
  routes() { return this.machineRoutes ?? this.directRoutes ?? { http: [], ws: [] } }

  /** The certified public key of `machineId` while it is a current member of this hub's records, else null. */
  memberKey(machineId) {
    return this.store.records.membership().machines.find(machine => machine.id === machineId)?.publicKey ?? null
  }

  /** The machine a signed request comes from; refused while this hub waits after a restore. */
  verifyMachine(request) {
    if (!this.sessions) throw new HandshakeError('NO_MACHINES', 'This service serves no other machine. Host projects with pardner client.')
    if (this.store.hubStatus()?.waiting) throw new HandshakeError('HUB_WAITING', HUB_WAITING_MESSAGE)
    return this.sessions.verify(request)
  }

  /**
   * Admits another machine on a native socket: the handshake, then the
   * Automerge adapter. Every well-formed hello is answered alike, and the
   * machine is judged only once both signatures verify, so an unproven party
   * cannot tell which keys this project knows. Only a current member machine
   * is welcomed and gets the records. While this hub waits after a restore,
   * any machine that proves its key has its records merged first, since it
   * may have been admitted after the backup; then only a member is welcomed,
   * and only a member that saw a later state of this hub vouches for catching
   * up. Every other machine is refused.
   */
  async acceptMachine(ws, req) {
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    try {
      const { initiator } = await respondHandshake(ws, { key: this.store.machineKey, projectId: this.store.manifest.workspaceId, role: 'hub',
        acceptRoute: route => this.routes().ws.includes(route),
        admit: async ({ hello, requestMembership }) => {
          const { machineId, publicKey } = hello.initiator
          const vouches = await this.store.noteCheckpoint(hello.checkpoint)
          if (this.store.hubStatus()?.waiting) {
            this.store.admitRecords(await requestMembership())
            if (this.memberKey(machineId) !== publicKey) throw this.notMember(machineId)
            if (!vouches) throw new HandshakeError('HUB_WAITING', HUB_WAITING_MESSAGE)
            await this.store.resumeHub({ machineId })
          }
          if (this.memberKey(machineId) !== publicKey) throw this.notMember(machineId)
          return { records: this.store.records.all(), checkpoint: this.store.checkpoint(), documentUrl: this.store.manifest.url }
        } })
      // Membership may have changed while the welcome was sent; nothing reaches Automerge unless it still holds.
      if (this.stopping || ws.readyState !== ws.OPEN || this.memberKey(initiator.machineId) !== initiator.publicKey) {
        ws.terminate()
        return
      }
      this.registerSyncSession(initiator.machineId, ws)
      this.nativeWsServer.emit('connection', ws, req)
    } catch (error) {
      this.recordSecurityEvent('machineRefused', `Refused a machine handshake (${error.code ?? 'failed'})`)
      if (ws.readyState === ws.OPEN) ws.close(4403, String(error.code ?? 'HANDSHAKE_FAILED').slice(0, 100))
      else ws.terminate()
    }
  }

  /**
   * The refusal for a machine that has proved its key and is not a current
   * member. A removed machine is told who removed it and whether its person
   * left (#154), since it may never hold its own removal record. Nothing calls
   * this before the machine has proved its key.
   */
  notMember(machineId) {
    const membership = this.store.records.membership()
    return membership.removedMachines.includes(machineId)
      ? new HandshakeError('REVOKED', 'This machine was removed from the project; nothing is served to it. Its local data is preserved.',
        { removal: removalFor(membership, machineId) })
      : new HandshakeError('NOT_MEMBER', 'This machine is not a member of the project; nothing is served to it')
  }

  /**
   * Tracks one machine's live sync sessions. A second session for a machine
   * that already has one is either a reconnect (the first no longer answers
   * a ping and is closed) or two live copies of one machine, such as a backup
   * running beside its original: that is reported, not refused (#165).
   */
  registerSyncSession(machineId, ws) {
    const live = this.syncSessions.get(machineId) ?? new Set()
    this.syncSessions.set(machineId, live)
    for (const other of live) this.probeDuplicate(machineId, other)
    live.add(ws)
    this.reportSyncPeer(machineId)
    ws.once('close', () => {
      live.delete(ws)
      if (!live.size) this.syncSessions.delete(machineId)
      this.reportSyncPeer(machineId)
      this.reportDuplicates()
    })
  }

  probeDuplicate(machineId, other) {
    const answered = () => {
      clearTimeout(timer)
      if (other.readyState !== other.OPEN || (this.syncSessions.get(machineId)?.size ?? 0) < 2) return
      const previous = this.duplicates.get(machineId)
      this.duplicates.set(machineId, { machineId, detectedAt: previous?.detectedAt ?? new Date().toISOString(), lastSeenAt: new Date().toISOString() })
      this.recordSecurityEvent('duplicateMachine', 'Two live sync sessions for one machine: a copied client directory may be running beside its original')
      this.reportDuplicates()
    }
    const timer = setTimeout(() => { other.off('pong', answered); other.terminate() }, DUPLICATE_PROBE_MS)
    other.once('pong', answered)
    try { other.ping() } catch { clearTimeout(timer); other.terminate() }
  }

  /**
   * Which machines hold a live sync session with this hub, and when each was
   * last seen on one, in its status (in memory only, so it resets when the hub
   * restarts). The hub's client shows these as online or last seen (#198).
   */
  reportSyncPeer(machineId) {
    this.store.syncPeers = { ...this.store.syncPeers, [machineId]: { connected: this.syncSessions.has(machineId), lastSeenAt: Date.now() } }
  }

  /** The hub's report of machines seen with two live sync sessions, in its status, while either copy is connected. */
  reportDuplicates() {
    this.store.duplicateMachines = [...this.duplicates.values()].map(entry => ({ ...entry, sessions: this.syncSessions.get(entry.machineId)?.size ?? 0 }))
    this.store.emitStatus?.()
  }

  /** Ends every session of a machine that is no longer a member, at once: its sync sockets close and its signed sessions are dropped. */
  enforceMembership() {
    this.sessions?.revokeNonMembers()
    for (const [machineId, live] of this.syncSessions) {
      if (this.memberKey(machineId)) continue
      for (const ws of live) ws.close(4403, 'REVOKED')
    }
  }

  /**
   * Control records for T3 threads this service controls. Credentials, the
   * registry, routes and owner decisions need the local loopback page; dispatch,
   * cancellation and verdicts use ordinary workspace access plus route checks.
   */
  setupControlAPI() {
    const statuses = { NOT_FOUND: 404, ROUTE_REJECTED: 403, FORBIDDEN: 403, LOCAL_ADMIN_REQUIRED: 403, AMBIGUOUS_ROUTE: 409,
      CONTROLLER_CONFLICT: 409, INVALID_EXECUTION_STATE: 409, OPERATION_ID_REUSED: 409, UNREVIEWED_RUN: 409, HOLD_CHANGED: 409,
      CREDENTIAL_CHANGED: 409, UNQUALIFIED_THREAD: 409, VERSION_ACCEPTANCE_REQUIRED: 409, UNKNOWN_ACTOR: 400, CONTROL_UNAVAILABLE: 503 }
    const failure = (res, error) => {
      const t3 = error instanceof T3Rejected ? 502 : error instanceof T3Busy ? 503 : error instanceof T3Unknown ? 504 : null
      if (!t3 && !error.code) this.logger.error?.(error)
      res.status(t3 ?? statuses[error.code] ?? (error.code ? 400 : 500)).json({ success: false, error: error.message,
        code: t3 ? `T3_${error.name.slice(2).toUpperCase()}` : error.code ?? 'INTERNAL_ERROR', ...(t3 && error.code ? { t3Code: error.code } : {}) })
    }
    const handle = (path, action, { admin = false } = {}) => this.app.post(`/pardner/control${path}`, async (req, res) => {
      res.set('Cache-Control', 'no-store')
      try {
        if (!this.control) throw Object.assign(new Error('The control pane is not running in this service'), { code: 'CONTROL_UNAVAILABLE' })
        if (admin && !isLoopbackRequest(req)) throw Object.assign(new Error('Open Pardner on this computer through its loopback address to change control settings.'), { code: 'LOCAL_ADMIN_REQUIRED' })
        res.json({ success: true, result: await action(req.body ?? {}) })
      } catch (error) { failure(res, error) }
    })
    this.app.get('/pardner/control', (_req, res) => {
      res.set('Cache-Control', 'no-store')
      if (!this.control) return res.json({ enabled: false })
      try { res.json({ enabled: true, ...this.control.snapshot() }) } catch (error) { failure(res, error) }
    })
    handle('/cloud/contexts', body => this.control.registerCloud(body), { admin: true })
    handle('/cloud/contexts/authorize', body => this.control.authorizeCloud(body), { admin: true })
    handle('/cloud/contexts/release', body => this.control.cloud.release(body), { admin: true })
    handle('/cloud/executions', body => this.control.cloud.enqueue(body))
    handle('/cloud/executions/cancel', body => this.control.cloud.cancel(body))
    handle('/cloud/executions/reconcile', body => this.control.cloud.reconcile(body.executionId))
    handle('/cloud/executions/acceptance', body => this.control.cloud.establishAcceptance(body), { admin: true })
    handle('/cloud/executions/verdicts', body => this.control.recordCloudVerdict(body))
    handle('/cloud/executions/freeze', body => this.control.cloud.freeze(body), { admin: true })
    handle('/credential', body => this.control.pair(body), { admin: true })
    handle('/projects', body => this.control.registerProject(body), { admin: true })
    handle('/sessions', body => this.control.mapSession(body), { admin: true })
    handle('/sessions/authorize', body => this.control.authorize(body), { admin: true })
    handle('/sessions/release', body => this.control.release(body), { admin: true })
    handle('/executions', body => this.control.dispatch(body))
    handle('/executions/cancel', body => this.control.cancel(body.id))
    handle('/executions/reconcile', body => this.control.reconcile(body.id))
    handle('/executions/resolve', body => this.control.resolve(body.id, body.decision, body.evidence), { admin: true })
    handle('/executions/artifacts', body => this.control.recordArtifact(body))
    handle('/executions/verdicts', body => this.control.recordVerdict(body))
    handle('/poll', async () => { await this.control.poll(); return this.control.snapshot() })
  }

  setupHTTPAPI() {
    this.app.use((_req, res, next) => {
      const setHeader = res.setHeader
      res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'content-security-policy') {
          const directives = String(value).split(';').map(value => value.trim())
            .filter(value => value && !/^frame-ancestors(?:\s|$)/i.test(value))
          value = [...directives, "frame-ancestors 'none'"].join('; ')
        }
        return setHeader.call(this, name, value)
      }
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
      res.setHeader('X-Frame-Options', 'DENY')
      if (this.stopping) {
        return res.set('Connection', 'close').status(503).json({
          code: 'SERVICE_STOPPING', error: 'The service is stopping',
        })
      }
      next()
    })
    this.app.use((req, res, next) => this.originMiddleware(req, res, next))
    this.app.use(express.json({ limit: REQUEST_LIMIT }))
    this.app.use((error, _req, res, _next) => {
      if (error?.type === 'entity.too.large') {
        return res.status(413).json({ code: 'INVALID_ARGUMENT', error: 'This change is larger than the 100 kB request limit. Shorten it and try again.' })
      }
      res.status(400).json({ code: 'INVALID_ARGUMENT', error: 'Send a valid JSON request.' })
    })
    this.app.get('/pardner/config', (_req, res) => res.set('Cache-Control', 'no-store').json({
      mode: 'standalone', apiBase: '', wsPath: this.browserWsPath ?? '/',
      ...(this.browserWsPath === undefined ? { wsPort: this.wsPort } : {}),
      workspaceId: this.store.manifest.workspaceId,
    }))
    // The machine handshake carried by HTTP: it opens a signed session (lib/machine-session.js).
    const sessionFailure = (res, error) => res.status(machineStatus(error.code)).json({ code: error.code ?? 'HANDSHAKE_INVALID', error: error.message,
      ...(error.details ? { details: error.details } : {}) })
    this.app.post('/session', (req, res) => {
      res.set('Cache-Control', 'no-store')
      try {
        if (!this.sessions) throw new HandshakeError('NO_MACHINES', 'This service serves no other machine. Host projects with pardner client.')
        res.json(this.sessions.open(req.body?.hello))
      } catch (error) {
        this.recordSecurityEvent('machineRefused', `Refused a machine session (${error.code ?? 'failed'})`)
        sessionFailure(res, error)
      }
    })
    this.app.post('/session/confirm', async (req, res) => {
      res.set('Cache-Control', 'no-store')
      try {
        if (!this.sessions) throw new HandshakeError('NO_MACHINES', 'This service serves no other machine. Host projects with pardner client.')
        res.json({ welcome: await this.sessions.confirm(req.body?.session, req.body?.confirm) })
      } catch (error) {
        this.recordSecurityEvent('machineRefused', `Refused a machine session (${error.code ?? 'failed'})`)
        sessionFailure(res, error)
      }
    })
    this.app.use('/pardner', express.static(fileURLToPath(new URL('./ui-prototype/dist/', import.meta.url)), {
      setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
    }))
    this.app.use((req, res, next) => this.authMiddleware(req, res, next))
    this.setupControlAPI()
    const commands = new Set(['/automerge/operations', '/automerge/sync-ack', '/automerge/ws-ticket', '/automerge/membership/records',
      '/automerge/deliveries/claim', '/automerge/deliveries/ack', '/automerge/deliveries/release', '/automerge/machine/verify', '/automerge/hub/resume'])
    this.app.use((req, res, next) => {
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      if (mutation && !commands.has(req.path)) {
        return res.status(409).json({ code: 'OPERATION_REQUIRED', error: 'Use attributed Pardner operations for workspace changes' })
      }
      next()
    })
    
    // Get current document state
    this.app.get('/automerge/doc', async (req, res) => {
      try {
        const doc = this.store.getDoc()
        res.json({ success: true, doc })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })
    
    // Get document URL for frontend connection
    this.app.get('/automerge/url', async (req, res) => {
      try {
        const url = this.store.docHandle?.url
        const doc = this.store.docHandle?.doc()
        res.json({ success: true, url, schemaVersion: doc?.schemaVersion, workspaceId: doc?.workspaceId })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    const operationFailure = (res, error) => {
      const statuses = { NOT_FOUND: 404, STALE_UPDATE: 409, OPERATION_ID_REUSED: 409, OPERATION_INTEGRITY_CONFLICT: 409,
        CONFLICT_REQUIRES_RESOLUTION: 409, WORKSPACE_MISMATCH: 409, STORAGE_FAILED: 507,
        LOCAL_SERVICE_UNAVAILABLE: 503, HUB_UNAVAILABLE: 503, HUB_REQUIRED: 409, STALE_CLAIM: 409, AUTH_REQUIRED: 401, RECORD_REFUSED: 403 }
      res.status(statuses[error.code] ?? (error.code ? 400 : 500)).json({
        success: false, error: error.message, code: error.code ?? 'INTERNAL_ERROR', details: error.details ?? null,
      })
    }

    this.app.post('/automerge/operations', async (req, res) => {
      try {
        res.json({ success: true, ...await this.store.execute(req.body) })
      } catch (error) { operationFailure(res, error) }
    })

    this.app.get('/automerge/status', (req, res) => {
      res.json(this.store.status())
    })

    this.app.get('/automerge/membership', (req, res) => {
      try {
        res.json(this.store.membership())
      } catch (error) { operationFailure(res, error) }
    })

    // Every membership record this runtime holds, for its client to check another machine's welcome against.
    this.app.get('/automerge/membership/log', (req, res) => {
      try {
        res.json({ records: this.store.records.all() })
      } catch (error) { operationFailure(res, error) }
    })

    // The client's own routes for other machines ask here which machine signed a request.
    this.app.post('/automerge/machine/verify', (req, res) => {
      try {
        const { session, seq, signature, method, suffix, body } = req.body ?? {}
        res.json(this.verifyMachine({ session, seq, signature, method, suffix, body }))
      } catch (error) {
        this.recordSecurityEvent('machineRefused', `Refused a signed request from another machine (${error.code ?? 'failed'})`)
        res.status(machineStatus(error.code)).json({ success: false, code: error.code ?? 'AUTH_REQUIRED', error: error.message })
      }
    })

    // The operator confirms that no machine holds newer state than this restored hub.
    this.app.post('/automerge/hub/resume', async (req, res) => {
      try {
        res.json(await this.store.resumeHub('operator'))
      } catch (error) { operationFailure(res, error) }
    })

    // The hub's gate for new membership records (WorkspaceRuntime.addRecords).
    this.app.post('/automerge/membership/records', async (req, res) => {
      try {
        res.json(await this.store.addRecords(req.body?.records))
      } catch (error) { operationFailure(res, error) }
    })

    this.app.get('/automerge/deliveries', async (req, res) => {
      try {
        res.json(await this.store.pendingDeliveries(req.query.actor))
      } catch (error) { operationFailure(res, error) }
    })

    for (const [action, method] of [['claim', 'claimDelivery'], ['ack', 'acknowledgeDelivery'], ['release', 'releaseDelivery']]) {
      this.app.post(`/automerge/deliveries/${action}`, async (req, res) => {
        try {
          res.json(await this.store[method](req.body))
        } catch (error) { operationFailure(res, error) }
      })
    }

    this.app.get('/automerge/task/:taskId/context', (req, res) => {
      try {
        res.json({ ...this.store.workspace.taskContext(req.params.taskId, req.query.actor), status: this.store.status() })
      } catch (error) { operationFailure(res, error) }
    })

    for (const kind of ['vein', 'goal']) {
      this.app.get(`/automerge/${kind}/:id/context`, (req, res) => {
        try {
          res.json({ ...this.store.workspace[`${kind}Context`](req.params.id), status: this.store.status() })
        } catch (error) { operationFailure(res, error) }
      })
    }

    this.app.post('/automerge/sync-ack', async (req, res) => {
      try {
        res.json(await this.store.acknowledge(req.body?.workspaceId, req.body?.heads))
      } catch (error) { operationFailure(res, error) }
    })

    this.app.post('/automerge/ws-ticket', async (req, res) => {
      try {
        this.cleanupExpiredWsTickets()
        const purpose = req.body?.purpose ?? 'ui'
        if (!['ui', 'replica'].includes(purpose)) {
          return res.status(400).json({ code: 'INVALID_TICKET_PURPOSE', error: 'Unknown ticket purpose' })
        }
        if (purpose === 'replica') {
          // Only the client's own loopback hop holds this token; other machines reach the socket through it.
          const supplied = req.headers['x-pardner-native-token']
          if (this.nativeToken === null || typeof supplied !== 'string' ||
              !crypto.timingSafeEqual(crypto.createHash('sha256').update(this.nativeToken).digest(),
                crypto.createHash('sha256').update(supplied).digest())) {
            return res.status(403).json({ code: 'REPLICA_REQUIRED', error: 'Other machines connect through the client, with the machine handshake' })
          }
        }
        const ticket = this.mintWsTicket(purpose === 'replica')
        res.json({ success: true, ticket, expiresInMs: this.wsTicketTtlMs })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get agent trace for a specific commit
    this.app.get('/automerge/trace/:commitHash', async (req, res) => {
      try {
        const { commitHash } = req.params
        const repoPath = req.query.repoPath || process.cwd()
        
        const gitRoot = findGitRoot(repoPath)
        if (!gitRoot) {
          return res.status(404).json({ error: 'Not a git repository' })
        }
        
        const trace = getTraceByCommit(gitRoot, commitHash, { exact: true })
        if (!trace) {
          return res.status(404).json({ error: 'Trace not found for this commit' })
        }
        
        // Try to get GitHub remote URL
        let githubUrl = null
        try {
          const remote = execSync('git config --get remote.origin.url', {
            cwd: gitRoot,
            encoding: 'utf-8'
          }).trim()

          const repo = parseGithubRepo(remote)
          if (repo) {
            githubUrl = `https://github.com/${repo}/commit/${commitHash}`
          }
        } catch {
          // No remote or not GitHub, that's fine
        }
        
        res.json({ 
          success: true, 
          trace,
          githubUrl 
        })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })
    
    // Get GitHub remote URL for current repo
    this.app.get('/automerge/github-remote', async (req, res) => {
      try {
        const repoPath = req.query.repoPath || process.cwd()
        const gitRoot = findGitRoot(repoPath)
        
        if (!gitRoot) {
          return res.status(404).json({ error: 'Not a git repository' })
        }
        
        try {
          const remote = execSync('git config --get remote.origin.url', {
            cwd: gitRoot,
            encoding: 'utf-8'
          }).trim()

          const repo = parseGithubRepo(remote)
          if (repo) {
            const githubUrl = `https://github.com/${repo}`
            res.json({ success: true, githubUrl, repo })
          } else {
            res.json({ success: true, githubUrl: null })
          }
        } catch {
          res.json({ success: true, githubUrl: null })
        }
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })
    
    this.logger.log?.('🌐 HTTP API routes configured')
  }
  
  setupWebSocketServer() {
    this.wssJson = new WebSocketServer({ noServer: true })
    this.nativeWsServer = new WebSocketServer({ noServer: true })
    this.automergeWsAdapter = new ValidatedWebSocketServerAdapter(this.nativeWsServer)

    this.wsRequestHandler = (req, res) => {
      if (this.stopping) {
        res.writeHead(503, { Connection: 'close', 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'SERVICE_STOPPING', error: 'The service is stopping' }))
        return
      }
      const origin = req.headers.origin

      if (!this.isAllowedOrigin(origin)) {
        this.recordSecurityEvent(
          'wsOriginRejected',
          `Rejected WS HTTP request ${req.method} from a disallowed origin`
        )
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ code: 'ORIGIN_REJECTED', error: 'Origin not allowed. Open the current device address.' }))
        return
      }

      this.applyCorsHeaders(res, origin)
      res.statusCode = 426
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Expected WebSocket upgrade' }))
    }

    this.wsUpgradeHandler = (req, socket, head) => {
      socket.on('error', () => {})
      if (this.stopping) {
        this.rejectWebSocketUpgrade(socket, 503, 'Service Unavailable', { error: 'The service is stopping' })
        return
      }
      this.cleanupExpiredWsTickets()

      const origin = req.headers.origin
      if (!this.isAllowedOrigin(origin)) {
        this.recordSecurityEvent(
          'wsOriginRejected',
          'Rejected WS upgrade from a disallowed origin'
        )
        this.rejectWebSocketUpgrade(socket, 403, 'Forbidden', { code: 'ORIGIN_REJECTED', error: 'Origin not allowed. Open the current device address.' })
        return
      }

      if (!this.isAuthorizedWebSocketRequest(req)) {
        this.recordSecurityEvent(
          'wsUnauthorized',
          'Rejected unauthorized WS upgrade'
        )
        this.rejectWebSocketUpgrade(socket, 401, 'Unauthorized', { error: 'Unauthorized' })
        return
      }

      const pathname = wsUpgradePathname(req)
      const target = pathname === NATIVE_AUTOMERGE_WS_PATH ? this.nativeWsServer : this.wssJson
      target.handleUpgrade(req, socket, head, ws => {
        // Another machine reaches Automerge only after the machine handshake on its socket.
        if (target === this.nativeWsServer) return void this.acceptMachine(ws, req)
        target.emit('connection', ws, req)
      })
    }
    this.wsHttpServer = createServer(this.wsRequestHandler)
    this.wsHttpServer.on('upgrade', this.wsUpgradeHandler)

    this.wssJson.on('connection', (ws, req) => {
      this.logger.log?.('🔌 UI subscriber connected')
      this.connectedClients.add(ws)

      const doc = this.store.getDoc()
      ws.send(JSON.stringify({
        type: 'document-state',
        doc: doc,
        status: this.store.status()
      }))

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString())
          await this.handleClientMessage(ws, data)
        } catch {
          this.logger.error?.('Invalid UI subscription message')
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid UI subscription message'
          }))
        }
      })

      ws.on('close', () => {
        this.logger.log?.('🔌 Frontend client disconnected')
        this.connectedClients.delete(ws)
      })
    })

    this.logger.log?.('🔄 WebSocket: UI subscriptions on / ; native Automerge Repo on ' + NATIVE_AUTOMERGE_WS_PATH)
  }

  rejectWebSocketUpgrade(socket, statusCode, statusText, payload) {
    const body = JSON.stringify(payload)
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      '\r\n' +
      body
    )
    socket.destroy()
  }
  
  async handleClientMessage(ws, data) {
    if (data.type === 'document-change') {
      ws.send(JSON.stringify({ type: 'error', code: 'HTTP_MUTATION_REQUIRED', error: 'Submit attributed operations through the HTTP API' }))
    } else if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }))
    } else {
      this.logger.log?.('Unknown UI message type')
    }
  }
  
  broadcastDocumentUpdate() {
    if (this.connectedClients.size === 0) return
    this.broadcastMessage({
      type: 'document-update', doc: this.store.getDoc(),
      status: this.store.status(), timestamp: new Date().toISOString(),
    })
  }

  broadcastMessage(payload) {
    const message = JSON.stringify(payload)
    for (const client of this.connectedClients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }


}

/** The HTTP status of a refused machine handshake or signed request. */
function machineStatus(code) {
  return { SESSION_UNKNOWN: 401, AUTH_REQUIRED: 401, REQUEST_REPLAYED: 401, REVOKED: 403, NOT_MEMBER: 403, ROUTE_REJECTED: 403, WRONG_PROJECT: 403,
    NO_MACHINES: 403, TOO_MANY_REQUESTS: 429, HUB_WAITING: 503 }[code] ?? 400
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  import('./lib/local-service.js').then(({ startLocalService }) =>
    startLocalService({ directory: resolve(process.env.PARDNER_DATA_DIR ?? '.pardner') })
  ).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

export default AutomergeSyncServer
