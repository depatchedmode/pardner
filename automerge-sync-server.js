#!/usr/bin/env node

/**
 * Automerge Sync Server
 *
 * HTTP/WebSocket hub for the current Pardner deployment.
 * CLI, external harnesses, and UI clients talk to this process.
 */

import { WebSocketServer } from 'ws'
import { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket'
import { WorkspaceRuntime } from './lib/workspace-runtime.js'
import express from 'express'
import crypto from 'crypto'
import { createServer } from 'node:http'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { resolve } from 'node:path'
import { findGitRoot, getTraceByCommit } from './lib/agent-trace.js'
import { parseGithubRepo } from './lib/github-remote.js'

const DEFAULT_HTTP_PORT = 8004
const DEFAULT_WS_PORT = 8005

/** WebSocket path for Automerge Repo native (CBOR) sync — distinct from JSON UI subscriptions. */
const NATIVE_AUTOMERGE_WS_PATH = '/automerge'

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
  if (!Number.isInteger(parsed) || parsed < 0) {
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
      role: options.role ?? env.PARDNER_ROLE ?? 'hub', actors: options.actors ?? [],
      hubUrl: options.hubUrl ?? env.PARDNER_HUB_URL, hubWsUrl: options.hubWsUrl ?? env.PARDNER_HUB_WS_URL,
      replicaCredentialId: options.replicaCredentialId ?? env.PARDNER_REPLICA_ID,
      replicaToken: options.replicaToken ?? env.PARDNER_REPLICA_TOKEN,
      token: options.hubToken ?? env.PARDNER_HUB_TOKEN ?? options.apiToken ?? env.PARDNER_API_TOKEN,
    })
    this.connectedClients = new Set()
    this.app = express()
    this.wssJson = null
    this.nativeWsServer = null
    this.automergeWsAdapter = null
    this.httpServer = null
    this.wsHttpServer = null
    this.host = options.host ?? env.PARDNER_BIND_HOST ?? '127.0.0.1'
    this.httpPort = parsePort(options.httpPort ?? env.PARDNER_HTTP_PORT ?? DEFAULT_HTTP_PORT, 'PARDNER_HTTP_PORT')
    this.wsPort = parsePort(options.wsPort ?? env.PARDNER_WS_PORT ?? DEFAULT_WS_PORT, 'PARDNER_WS_PORT')
    this.apiToken = options.apiToken ?? env.PARDNER_API_TOKEN ?? ''
    const replicaCredentials = options.replicaCredentials ?? JSON.parse(env.PARDNER_REPLICA_CREDENTIALS ?? '{}')
    if (!replicaCredentials || Array.isArray(replicaCredentials) || typeof replicaCredentials !== 'object') {
      throw new Error('PARDNER_REPLICA_CREDENTIALS must map enrolled replica IDs to distinct secrets')
    }
    this.replicaCredentials = new Map(Object.entries(replicaCredentials))
    const secrets = new Set()
    for (const [id, secret] of this.replicaCredentials) {
      if (!isNonEmptyString(id) || !isNonEmptyString(secret) || secret === this.apiToken || secrets.has(secret)) {
        throw new Error('Replica credentials must have nonempty IDs and unique secrets distinct from the API token')
      }
      secrets.add(secret)
    }
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
      wsOriginRejected: 0
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
    this.stopping = false
    this.logger.log?.('🚀 Starting Automerge Sync Server...')
    
    // Initialize backend store
    await this.store.init()
    this.onDocumentChange = () => this.broadcastDocumentUpdate()
    this.onRuntimeStatus = status => this.broadcastMessage({ type: 'sync-status', status })
    this.store.docHandle.on('change', this.onDocumentChange)
    this.store.on?.('status', this.onRuntimeStatus)
    this.logger.log?.('✅ Backend AutomergeStore initialized')
    
    // Setup Express for HTTP API
    this.setupHTTPAPI()
    
    // Setup WebSocket for real-time sync
    this.setupWebSocketServer()
    this.store.repo.networkSubsystem.addNetworkAdapter(this.automergeWsAdapter)

    // Start HTTP server
    this.httpServer = await new Promise((resolve, reject) => {
      const server = this.app.listen(this.httpPort, this.host, () => resolve(server))
      server.once('error', reject)
    })
    this.httpPort = this.getBoundPort(this.httpServer, this.httpPort)
    if (!this.explicitOrigins) {
      for (const origin of defaultAllowedOrigins(this.httpPort)) this.allowedOrigins.add(origin)
    }

    this.wsHttpServer = await new Promise((resolve, reject) => {
      const server = this.wsHttpServer.listen(this.wsPort, this.host, () => resolve(this.wsHttpServer))
      server.once('error', reject)
    })
    this.wsPort = this.getBoundPort(this.wsHttpServer, this.wsPort)

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

  async stop() {
    this.stopping = true
    // Stop both listeners before draining upgraded sockets and in-flight requests.
    const listenersClosed = Promise.allSettled([
      this.closeServer(this.wsHttpServer), this.closeServer(this.httpServer),
    ])
    if (this.onDocumentChange) this.store.docHandle?.off('change', this.onDocumentChange)
    if (this.onRuntimeStatus) this.store.off?.('status', this.onRuntimeStatus)
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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Pardner-Token')
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
        `Rejected HTTP ${req.method} ${req.url} from origin ${origin}`
      )
      return res.status(403).json({ error: `Origin not allowed: ${origin}` })
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
        const url = new URL(req.url || '', `http://${this.host}:${this.httpPort}`)
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
      const url = new URL(req.url || '', `http://${this.host}:${this.httpPort}`)
      const ticket = url.searchParams.get('ticket')
      if (ticket) return ticket
    } catch {
      // Ignore malformed URL values and continue unauthenticated.
    }

    return null
  }

  mintWsTicket(replicaId = null) {
    const ticket = crypto.randomBytes(32).toString('hex')
    this.wsTickets.set(ticket, { expiresAt: Date.now() + this.wsTicketTtlMs, replicaId })
    return ticket
  }

  consumeWsTicket(ticket, native = false) {
    if (!ticket) return false
    const grant = this.wsTickets.get(ticket)
    if (!grant) return false
    this.wsTickets.delete(ticket)
    return grant.expiresAt > Date.now() && (native
      ? grant.replicaId !== null && this.replicaCredentials.has(grant.replicaId)
      : grant.replicaId === null)
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
      return this.consumeWsTicket(this.wsTicketFromRequest(req), true)
    }
    if (!this.apiToken) return true

    const token = this.tokenFromRequest(req, { allowLegacyWsQueryToken: true })
    if (token === this.apiToken) return true

    const ticket = this.wsTicketFromRequest(req)
    return this.consumeWsTicket(ticket)
  }

  authMiddleware(req, res, next) {
    if (this.isAuthorizedRequest(req)) {
      return next()
    }
    this.recordSecurityEvent(
      'httpUnauthorized',
      `Rejected unauthorized HTTP ${req.method} ${req.url}`
    )
    return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' })
  }
  
  setupHTTPAPI() {
    this.app.use((req, res, next) => this.originMiddleware(req, res, next))
    this.app.use(express.json())
    this.app.get('/pardner/config', (_req, res) => res.json({
      apiBase: '', wsPath: '/', wsPort: this.wsPort,
    }))
    this.app.use('/pardner', express.static(fileURLToPath(new URL('./ui-prototype/dist/', import.meta.url)), {
      setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
    }))
    this.app.use((req, res, next) => this.authMiddleware(req, res, next))
    const commands = new Set(['/automerge/operations', '/automerge/sync-ack', '/automerge/ws-ticket',
      '/automerge/deliveries/claim', '/automerge/deliveries/ack', '/automerge/deliveries/release'])
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
      const statuses = { NOT_FOUND: 404, STALE_UPDATE: 409, OPERATION_ID_REUSED: 409,
        CONFLICT_REQUIRES_RESOLUTION: 409, WORKSPACE_MISMATCH: 409, STORAGE_FAILED: 507,
        LOCAL_SERVICE_UNAVAILABLE: 503, HUB_UNAVAILABLE: 503, HUB_REQUIRED: 409, STALE_CLAIM: 409, AUTH_REQUIRED: 401 }
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
        let replicaId = null
        if (purpose === 'replica') {
          replicaId = req.body?.replicaId
          const expected = this.replicaCredentials.get(replicaId)
          const supplied = req.headers['x-pardner-replica-token']
          if (!expected || typeof supplied !== 'string' ||
              !crypto.timingSafeEqual(crypto.createHash('sha256').update(expected).digest(),
                crypto.createHash('sha256').update(supplied).digest())) {
            return res.status(403).json({ code: 'REPLICA_REQUIRED', error: 'An enrolled replica credential is required' })
          }
        }
        const ticket = this.mintWsTicket(replicaId)
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
    this.automergeWsAdapter = new WebSocketServerAdapter(this.nativeWsServer)

    this.wsHttpServer = createServer((req, res) => {
      const origin = req.headers.origin

      if (!this.isAllowedOrigin(origin)) {
        this.recordSecurityEvent(
          'wsOriginRejected',
          `Rejected WS HTTP request ${req.method} ${req.url} from origin ${origin}`
        )
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Origin not allowed: ${origin}` }))
        return
      }

      this.applyCorsHeaders(res, origin)
      res.statusCode = 426
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Expected WebSocket upgrade' }))
    })

    this.wsHttpServer.on('upgrade', (req, socket, head) => {
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
          `Rejected WS upgrade ${req.url} from origin ${origin}`
        )
        this.rejectWebSocketUpgrade(socket, 403, 'Forbidden', { error: `Origin not allowed: ${origin}` })
        return
      }

      if (!this.isAuthorizedWebSocketRequest(req)) {
        this.recordSecurityEvent(
          'wsUnauthorized',
          `Rejected unauthorized WS upgrade ${req.url}`
        )
        this.rejectWebSocketUpgrade(socket, 401, 'Unauthorized', { error: 'Unauthorized' })
        return
      }

      const pathname = wsUpgradePathname(req)
      const target = pathname === NATIVE_AUTOMERGE_WS_PATH ? this.nativeWsServer : this.wssJson
      target.handleUpgrade(req, socket, head, ws => {
        target.emit('connection', ws, req)
      })
    })

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
        } catch (error) {
          this.logger.error?.('❌ WebSocket message error:', error)
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
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
      this.logger.log?.('Unknown UI message type:', data.type)
    }
  }
  
  broadcastDocumentUpdate() {
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  import('./lib/local-service.js').then(({ startLocalService }) =>
    startLocalService({ directory: resolve(process.env.PARDNER_DATA_DIR ?? '.pardner') })
  ).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

export default AutomergeSyncServer
