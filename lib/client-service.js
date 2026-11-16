import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { ClientRegistry } from './client-registry.js'
import { ClientRuntime } from './client-runtime.js'
import { ClientAuth } from './client-auth.js'
import { ClientInvites } from './client-invites.js'
import { ClientPresence } from './client-presence.js'
import { CLIENT_API, HARNESS_IDS, actorId, gitDefaults, hash, profile } from './client-identity.js'
import { createProject, joinProject, remoteJson } from './client-projects.js'
import { nativeRequest, projectPaths, workspaceProxy } from './client-proxy.js'
import { atomicWrite } from './atomic-file.js'
import { AUTOMERGE_PATHS, REPLICA_TOKEN_HEADER, TICKET_PURPOSE } from './sync-protocol.js'
import { requireValue } from './workspace-schema.js'

export async function startClient(options = {}) {
  requireValue(options.directory, 'Supply a private client directory')
  const registry = await ClientRegistry.open(resolve(options.directory), options)
  const client = new LocalClient(registry, options)
  try { await client.start(); return client } catch (error) { await client.stop(); throw error }
}
export class LocalClient {
  constructor(registry, options) {
    Object.assign(this, { registry, options, runtimes: new Map(), starting: new Map(), startFailures: new Map(), sockets: new Set(),
      upgradeSockets: new Set(), upgrades: new Set() })
    this.auth = new ClientAuth(registry)
    this.invites = new ClientInvites(this)
    this.presence = new ClientPresence()
    this.livePresence = new Map()
    this.suggestedIdentity = gitDefaults(options.gitDirectory ?? process.cwd())
  }
  human(principal) { requireValue(this.registry.read().humanAuthority !== false && ['human', 'operator'].includes(principal.kind), 'Human authority required', 'FORBIDDEN') }
  project(id) {
    const project = Object.values(this.registry.read().projects).find(p => p.id === id)
    requireValue(project, 'Project not found', 'NOT_FOUND')
    return project
  }
  binding(project, principal) {
    const state = this.registry.read()
    if (principal.kind === 'agent') requireValue(principal.projectId === project.id, 'Credential belongs to another project', 'PROJECT_MISMATCH')
    const id = principal.kind === 'agent' ? principal.actorId : project.actorId
    requireValue(project.state !== 'revoked' && !project.revokedActors?.includes(id) && project.people[id], 'Project membership is not available', 'REVOKED')
    const person = project.people[id]
    return { projectId: project.id, actorId: id, deviceId: principal.deviceId, deviceName: state.device.name,
      principalId: principal.id, harnessId: person.harnessId, kind: person.kind === 'agent' ? 'agent' : 'browser' }
  }
  async runtime(project) {
    if (this.runtimes.get(project.key)?.dead) this.runtimes.delete(project.key)
    if (this.runtimes.has(project.key)) return this.runtimes.get(project.key)
    if (!this.starting.has(project.key)) {
      // A runtime that failed to start is not retried on every poll; callers see the failure until the backoff passes.
      const failed = this.startFailures.get(project.key)
      const backoff = this.options.restartBackoffMs ?? 5000
      if (failed && Date.now() - failed.at < backoff) {
        throw Object.assign(new Error(`Project runtime failed to start; retrying after ${Math.ceil((failed.at + backoff - Date.now()) / 1000)}s`),
          { code: 'LOCAL_SERVICE_UNAVAILABLE', details: { cause: failed.code } })
      }
      const promise = ClientRuntime.start(this.registry.directory, project)
        .then(runtime => { this.startFailures.delete(project.key); this.runtimes.set(project.key, runtime); return runtime },
          error => { this.startFailures.set(project.key, { at: Date.now(), code: error.code ?? 'RUNTIME_FAILED' }); throw error })
      this.starting.set(project.key, promise)
    }
    try { return await this.starting.get(project.key) } finally { this.starting.delete(project.key) }
  }
  async people(project) {
    if (project.role === 'replica') {
      try {
        const result = await remoteJson(`${project.hubUrl}/people`, undefined, project.deviceToken)
        this.registry.update(state => { state.projects[project.key].people = result.people })
        return result.people
      } catch (error) {
        if (['AUTH_REQUIRED', 'REVOKED'].includes(error.code)) {
          this.registry.update(state => { state.projects[project.key].state = 'revoked' })
          throw Object.assign(new Error('Project access revoked; local data remains saved'), { code: 'REVOKED' })
        }
        if (error.code !== 'HUB_UNAVAILABLE') throw error
      }
    }
    return project.people
  }
  deviceToken(project, actor) { return project.agentAdmissions?.[actor]?.deviceToken ?? project.deviceToken }
  async refreshAdmission(project, actor) {
    if (project.role !== 'replica') return
    try {
      const policy = await remoteJson(`${project.hubUrl}/policy`, undefined, this.deviceToken(project, actor))
      if (actor && !policy.actorIds.includes(actor)) {
        this.registry.update(state => { const p = state.projects[project.key]; p.revokedActors ??= []; if (!p.revokedActors.includes(actor)) p.revokedActors.push(actor) })
        throw Object.assign(new Error('Actor admission revoked'), { code: 'ACTOR_REVOKED' })
      }
    }
    catch (error) {
      if (error.code === 'HUB_UNAVAILABLE') return
      if (['AUTH_REQUIRED', 'REVOKED'].includes(error.code)) {
        if (project.agentAdmissions?.[actor]) {
          this.registry.update(state => { const p = state.projects[project.key]; p.revokedActors ??= []; if (!p.revokedActors.includes(actor)) p.revokedActors.push(actor) })
          throw Object.assign(new Error('Agent admission revoked'), { code: 'ACTOR_REVOKED' })
        }
        this.registry.update(state => { state.projects[project.key].state = 'revoked' })
        throw Object.assign(new Error('Project admission revoked; local data is preserved'), { code: 'REVOKED' })
      }
      throw error
    }
  }
  async registerActor(project, person) {
    const runtime = await this.runtime(project)
    const { doc } = await runtime.request(AUTOMERGE_PATHS.doc)
    if (!doc.actors[person.id]) await runtime.request(AUTOMERGE_PATHS.operations, {
      operationId: `enroll-${person.id}`, actorId: project.actorId, type: 'actor.register',
      payload: { id: person.id, handle: person.handle, kind: person.kind, displayName: person.kind === 'human' ? person.gitIdentity.name : person.harnessId } })
    this.registry.update(state => {
      const old = state.projects[project.key].people[person.id]
      state.projects[project.key].people[person.id] = old ? { ...old, devices: [...new Map([...old.devices, ...person.devices].map(d => [d.id, d])).values()] } : person
    })
  }
  async projectView(project, principal) {
    const binding = this.binding(project, principal)
    let status
    try { status = await (await this.runtime(project)).request(AUTOMERGE_PATHS.status) }
    catch (error) { status = { savedLocally: false, syncPending: true, error: error.code, available: false } }
    return { id: project.id, name: project.name, role: project.role, actorId: binding.actorId,
      ...projectPaths(project.id), authentication: 'session', workspaceId: project.id, status }
  }
  async session(principal) {
    const state = this.registry.read()
    const projects = Object.values(state.projects).filter(project => project.id && project.state === 'ready' &&
      (principal.kind !== 'agent' || project.id === principal.projectId))
    return { identity: state.identity, device: state.device, suggestedIdentity: this.suggestedIdentity, setupAgent: state.setupAgent,
      projects: await Promise.all(projects.map(project => this.projectView(project, principal))) }
  }
  admission(project, req) {
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const admission = Object.values(project.admissions).find(entry => token && hash(entry.deviceToken) === hash(token))
    requireValue(admission?.state === 'active', 'Device is not admitted to this project', 'AUTH_REQUIRED')
    return admission
  }
  async presenceAction(project, binding, action, sessionId, input = {}) {
    for (const [id, entry] of this.livePresence) if (entry.expiresAt <= Date.now()) this.livePresence.delete(id)
    if (project.role === 'replica') {
      try { return await remoteJson(`${project.hubUrl}/presence`, { binding: { actorId: binding.actorId, principalId: binding.principalId }, action, sessionId, input }, this.deviceToken(project, binding.actorId)) }
      catch (error) {
        if (action === 'snapshot' && error.code === 'HUB_UNAVAILABLE') return { actors: [], observedAt: null, available: false, code: error.code }
        throw error
      }
    }
    if (action === 'snapshot') return { ...this.presence.snapshot(project.id), available: true }
    if (action === 'start') {
      requireValue(input.kind === undefined || input.kind === binding.kind, 'Presence kind must match the authenticated Actor', 'ACTOR_MISMATCH')
      requireValue(input.harnessId === undefined || input.harnessId === binding.harnessId, 'Harness must match admitted Actor', 'ACTOR_MISMATCH')
      const result = this.presence.start(binding, { ...input, kind: binding.kind, harnessId: binding.harnessId })
      this.livePresence.set(result.sessionId, { ...binding, expiresAt: Date.now() + result.ttlMs })
      return result
    }
    if (action === 'report') {
      const { doc } = await (await this.runtime(project)).request(AUTOMERGE_PATHS.doc)
      requireValue(Array.isArray(input.focusTaskIds) && input.focusTaskIds.every(id => Object.hasOwn(doc.tasks, id)), 'Focus must name tasks in this project', 'INVALID_ARGUMENT')
      const result = this.presence.report(binding, sessionId, input)
      this.livePresence.set(sessionId, { ...binding, expiresAt: Date.now() + result.ttlMs })
      return result
    }
    requireValue(action === 'end', 'Unknown presence action')
    const result = this.presence.end(binding, sessionId)
    this.livePresence.delete(sessionId)
    return result
  }
  async revoke(project, humanId, input) {
    const result = await this.registry.attempt(`revoke:${project.id}:${humanId}`, input.operationId, { kind: input.kind, id: input.id }, async () => {
      requireValue(['device', 'agent', 'member'].includes(input.kind), 'Choose device, agent or member')
      const revoked = this.registry.update(state => {
        const p = state.projects[project.key], affected = []
        if (input.kind === 'member') requireValue(project.creatorId === humanId && input.id !== project.creatorId, 'Only creator may revoke other memberships', 'FORBIDDEN')
        if (input.kind === 'agent') requireValue(p.people[input.id]?.kind === 'agent' && p.people[input.id].humanId === humanId, 'Agent belongs to another human', 'FORBIDDEN')
        for (const admission of Object.values(p.admissions)) {
          const match = input.kind === 'device' ? admission.device.id === input.id : input.kind === 'member' ? admission.identity.id === input.id : admission.actorIds.includes(input.id)
          if (!match) continue
          if (input.kind === 'device') requireValue(admission.identity.id === humanId, 'Device belongs to another human', 'FORBIDDEN')
          if (input.kind === 'agent') admission.actorIds = admission.actorIds.filter(id => id !== input.id)
          if (input.kind !== 'agent' || !admission.actorIds.length) admission.state = 'revoked'
          affected.push(admission.id)
        }
        if (input.kind === 'agent') {
          for (const session of Object.values(state.sessions)) if (session.projectId === project.id && session.actorId === input.id) session.revoked = true
          p.revokedActors ??= []; if (!p.revokedActors.includes(input.id)) p.revokedActors.push(input.id)
        }
        requireValue(affected.length || input.kind === 'agent', 'Admission not found', 'NOT_FOUND')
        return affected
      })
      for (const socket of this.sockets) if (socket.clientProject === project.id && (revoked.includes(socket.clientAdmission) || socket.clientActor === input.id)) socket.terminate()
      for (const [sessionId, binding] of this.livePresence) {
        const match = binding.projectId === project.id && (input.kind === 'agent' ? binding.actorId === input.id : input.kind === 'device' ? binding.deviceId === input.id : project.people[binding.actorId]?.humanId === input.id)
        if (match) { try { this.presence.end(binding, sessionId) } catch {} this.livePresence.delete(sessionId) }
      }
      return { revoked: true, kind: input.kind, id: input.id }
    })
    return result
  }
  async start() {
    this.options.publicUrl ??= this.registry.read().publicUrl
    if (this.options.publicUrl) {
      const publicUrl = new URL(this.options.publicUrl)
      requireValue(publicUrl.protocol === 'https:' && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash && !publicUrl.username && !publicUrl.password, 'Public gateway must be an explicit HTTPS origin')
      this.options.publicUrl = publicUrl.origin
    }
    const app = express()
    this.app = app
    app.disable('x-powered-by')
    app.use((req, res, next) => {
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" })
      if (this.stopping) return res.set('Connection', 'close').status(503).json({ code: 'SERVICE_STOPPING', error: 'Client is stopping' })
      res.once('finish', () => { if (this.stopping) this.server.closeIdleConnections() })
      const remoteRoute = req.path === `${CLIENT_API}/enroll` || req.path.startsWith(`${CLIENT_API}/replica/`)
      const allowedHosts = this.url ? [new URL(this.url).host, ...(remoteRoute && this.options.publicUrl ? [new URL(this.options.publicUrl).host] : [])] : []
      if (this.url && !allowedHosts.includes(req.headers.host)) return res.status(403).json({ code: 'ORIGIN_REJECTED', error: 'Open the configured client address' })
      if (req.headers.origin && req.headers.origin !== this.url) return res.status(403).json({ code: 'ORIGIN_REJECTED', error: 'Origin not allowed' })
      next()
    })
    app.use(express.json({ limit: '1mb' }))
    const handle = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next)
    app.get('/pardner/config', (_req, res) => res.json({ mode: 'client', clientApiBase: CLIENT_API }))
    app.post(['/bootstrap', `${CLIENT_API}/bootstrap`], handle(async (req, res) => {
      requireValue(req.headers.origin === this.url, 'Browser origin required', 'ORIGIN_REJECTED')
      const token = this.auth.exchange(req.body.grant, req.headers.origin)
      res.setHeader('Set-Cookie', `${this.auth.cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${this.url.startsWith('https:') ? '; Secure' : ''}`)
      res.json(await this.session(this.auth.authenticate({ headers: { authorization: `Bearer ${token}` } })))
    }))
    app.post(`${CLIENT_API}/enroll`, handle(async (req, res) => res.json(await this.invites.redeem(req.body))))
    app.use(`${CLIENT_API}/replica/:id`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      requireValue(project.role === 'hub', 'This service is not the authority', 'HUB_REQUIRED')
      const admission = this.admission(project, req)
      if (req.path === '/presence' && req.method === 'POST') {
        const id = req.body.binding?.actorId
        requireValue(admission.actorIds.includes(id), 'Presence Actor not admitted on device', 'ACTOR_MISMATCH')
        requireValue(typeof req.body.binding?.principalId === 'string', 'Presence principal required')
        const person = project.people[id]
        const binding = { projectId: project.id, actorId: id, deviceId: admission.device.id, deviceName: admission.device.name,
          principalId: `${admission.id}:${req.body.binding.principalId}`, harnessId: person.harnessId, kind: person.kind === 'agent' ? 'agent' : 'browser' }
        return res.json(await this.presenceAction(project, binding, req.body.action, req.body.sessionId, req.body.input))
      }
      if (req.path === '/revoke' && req.method === 'POST') {
        requireValue(admission.humanAllowed, 'Human authority required', 'FORBIDDEN')
        return res.json(await this.revoke(project, admission.identity.id, req.body))
      }
      if (req.path === '/invites' && req.method === 'POST') {
        requireValue(admission.humanAllowed, 'Human authority required', 'FORBIDDEN')
        if (req.body.action === 'issue') return res.json(await this.invites.issueFor(project, admission.identity, req.body.input))
        if (req.body.action === 'list') return res.json(this.invites.listFor(project, admission.identity.id))
        requireValue(req.body.action === 'revoke', 'Unknown invitation action')
        return res.json(this.invites.revokeFor(project, admission.identity.id, req.body.inviteId))
      }
      res.json(await nativeRequest(this, project, admission, req.path, req.method, req.body, req.headers))
    }))
    app.use(CLIENT_API, (req, _res, next) => {
      try {
        req.principal = this.auth.authenticate(req)
        if (!['GET', 'HEAD'].includes(req.method) && !req.headers.authorization) requireValue(req.headers.origin === this.url && req.is('application/json'), 'Same-origin JSON required', 'ORIGIN_REJECTED')
        next()
      } catch (error) { next(error) }
    })
    app.post(`${CLIENT_API}/open`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      this.human(req.principal)
      res.json({ url: `${this.url}/pardner/#grant=${this.auth.browserGrant(this.url)}` })
    }))
    app.get(`${CLIENT_API}/session`, handle(async (req, res) => res.json(await this.session(req.principal))))
    app.post(`${CLIENT_API}/identity`, handle(async (req, res) => {
      this.human(req.principal)
      const identity = profile(req.body)
      await this.registry.attempt(`identity:${this.registry.read().clientId}`, req.body.operationId, identity, async () => {
        this.registry.update(state => {
          requireValue(!state.identity || (state.identity.name === identity.name && state.identity.email === identity.email), 'Identity already initialized; linking requires My device', 'IDENTITY_EXISTS')
          state.identity ??= { id: randomUUID(), ...identity }
        })
        return true
      })
      res.json(await this.session(req.principal))
    }))
    app.post(`${CLIENT_API}/projects`, handle(async (req, res) => res.json(await createProject(this, req.principal, req.body))))
    app.post(`${CLIENT_API}/join`, handle(async (req, res) => res.json(await joinProject(this, req.principal, req.body))))
    app.get(`${CLIENT_API}/projects/:id`, handle(async (req, res) => {
      const project = this.project(req.params.id), binding = this.binding(project, req.principal)
      res.json({ project: await this.projectView(project, req.principal), actors: Object.values(await this.people(project)),
        presence: await this.presenceAction(project, binding, 'snapshot') })
    }))
    app.get(`${CLIENT_API}/projects/:id/export`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      const project = this.project(req.params.id), runtime = await this.runtime(project)
      const { doc } = await runtime.request(AUTOMERGE_PATHS.doc)
      const status = await runtime.request(AUTOMERGE_PATHS.status)
      requireValue(status.savedLocally && !status.storageError, 'Local storage is not confirmed saved', 'STORAGE_FAILED')
      res.json({ format: 'pardner-workspace-view-v1', workspaceId: project.id, exportedAt: new Date().toISOString(),
        savedLocally: true, doc, restoreRequires: 'Complete cold client backup; this readable content view is not a replica or credential backup' })
    }))
    app.post(`${CLIENT_API}/projects/:id/revoke`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal); this.human(req.principal)
      res.json(project.role === 'replica' ? await remoteJson(`${project.hubUrl}/revoke`, req.body, project.deviceToken) :
        await this.revoke(project, this.registry.read().identity.id, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/agent-grant`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      const project = this.project(req.params.id), state = this.registry.read()
      const harnessId = req.body.harnessId ?? state.setupAgent.harnessId
      requireValue(HARNESS_IDS.includes(harnessId), 'Unsupported execution harness')
      const id = actorId(state.identity.id, harnessId)
      requireValue((req.body.actorId === undefined || req.body.actorId === id) &&
        (req.body.humanId === undefined || req.body.humanId === state.identity.id), 'Agent must belong to the local human', 'ACTOR_MISMATCH')
      const person = project.people[id]
      requireValue(person?.kind === 'agent' && person.humanId === state.identity.id && person.harnessId === harnessId &&
        person.devices?.some(device => device.id === state.device.id) && !project.revokedActors?.includes(id),
        'Harness is not enrolled on this device; join an Agent invitation first', 'FORBIDDEN')
      await this.refreshAdmission(project, id)
      const reporting = project.agentReporting?.[id] ?? (harnessId === state.setupAgent.harnessId ? state.setupAgent : {})
      res.json({ token: this.auth.agentGrant(project.id, id, state.device.id), actorId: id, projectId: project.id,
        harnessId, ...(reporting.model ? { model: reporting.model } : {}), ...(reporting.managedBy ? { managedBy: reporting.managedBy } : {}) })
    }))
    app.get(`${CLIENT_API}/projects/:id/invites`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal); this.human(req.principal)
      requireValue(project.people[this.binding(project, req.principal).actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
      res.json(project.role === 'replica' ? await remoteJson(`${project.hubUrl}/invites`, { action: 'list' }, project.deviceToken) : this.invites.listFor(project, this.registry.read().identity.id))
    }))
    app.post(`${CLIENT_API}/projects/:id/invites`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.invites.issue(project, req.principal, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/invites/:inviteId/revoke`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal); this.human(req.principal)
      requireValue(project.people[this.binding(project, req.principal).actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
      res.json(project.role === 'replica' ? await remoteJson(`${project.hubUrl}/invites`, { action: 'revoke', inviteId: req.params.inviteId }, project.deviceToken) :
        this.invites.revokeFor(project, this.registry.read().identity.id, req.params.inviteId))
    }))
    app.get(`${CLIENT_API}/projects/:id/presence`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      res.json(await this.presenceAction(project, this.binding(project, req.principal), 'snapshot'))
    }))
    app.post(`${CLIENT_API}/projects/:id/sessions`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      res.json(await this.presenceAction(project, this.binding(project, req.principal), 'start', null, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/sessions/:sessionId/:action`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      requireValue(['report', 'end'].includes(req.params.action), 'Unknown session route', 'NOT_FOUND')
      res.json(await this.presenceAction(project, this.binding(project, req.principal), req.params.action, req.params.sessionId, req.body))
    }))
    app.use(`${CLIENT_API}/projects/:id/api`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      requireValue(!req.headers['x-pardner-workspace'] || req.headers['x-pardner-workspace'] === project.id, 'Wrong workspace', 'WORKSPACE_MISMATCH')
      res.json(await workspaceProxy(this, project, req.principal, req.method, new URL(req.url, this.url), req.body, req.headers.origin ?? null))
    }))
    app.use('/pardner', express.static(this.options.uiDirectory ?? fileURLToPath(new URL('../ui-prototype/dist', import.meta.url))))
    app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'Route not found' }))
    app.use((error, _req, res, _next) => {
      const status = { AUTH_REQUIRED: 401, FORBIDDEN: 403, ACTOR_MISMATCH: 403, PROJECT_MISMATCH: 403, REPLICA_REQUIRED: 403,
        REVOKED: 403, ACTOR_REVOKED: 403, ORIGIN_REJECTED: 403, NOT_FOUND: 404, SESSION_EXPIRED: 410, INVITE_EXPIRED: 410, INVITE_USED: 409,
        OPERATION_ID_REUSED: 409, STALE_UPDATE: 409, STALE_PRESENCE_REPORT: 409, IDENTITY_EXISTS: 409, IDENTITY_MISMATCH: 409,
        HUB_REQUIRED: 409, WORKSPACE_MISMATCH: 409, PRESENCE_LIMIT: 429,
        // Service-side conditions are 5xx so browser and CLI retries keep their operation identity.
        HUB_UNAVAILABLE: 503, LOCAL_SERVICE_UNAVAILABLE: 503, SERVICE_STOPPING: 503, REGISTRATION_PENDING: 503, RUNTIME_TIMEOUT: 503,
        RUNTIME_FAILED: 500, INTERNAL_ERROR: 500, STORAGE_FAILED: 507, STORAGE_IN_USE: 503 }[error.code] ?? (error.code ? 400 : 500)
      res.status(status).json({ code: error.code ?? 'INTERNAL_ERROR', error: error.code ? error.message : 'Client request failed', ...(error.details ? { details: error.details } : {}) })
    })
    this.server = createServer(app)
    this.websockets = new WebSocketServer({ noServer: true })
    this.server.on('upgrade', (req, socket, head) => {
      if (this.stopping) { socket.destroy(); return }
      this.upgradeSockets.add(socket)
      socket.once('close', () => this.upgradeSockets.delete(socket))
      const work = this.upgrade(req, socket, head).catch(() => {
        if (!socket.destroyed) socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n', () => socket.destroy())
      }).finally(() => { this.upgrades.delete(work) })
      this.upgrades.add(work)
    })
    const port = this.options.port ?? this.registry.read().port
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, '127.0.0.1', resolve) })
    this.url = `http://127.0.0.1:${this.server.address().port}`
    this.gatewayUrl = this.options.publicUrl ?? this.url
    this.registry.update(state => { state.port = this.server.address().port; state.publicUrl = this.options.publicUrl ?? null })
    await atomicWrite(join(this.registry.directory, 'client-connection.json'), JSON.stringify({ url: this.url, token: this.registry.read().operatorToken }))
    await Promise.all(Object.values(this.registry.read().projects).filter(p => p.state === 'ready').map(async p => { try { await this.runtime(p) } catch { /* One failed project must not prevent other projects opening. */ } }))
  }
  async upgrade(req, socket, head) {
    requireValue(!this.stopping && [new URL(this.url).host, ...(req.url.startsWith(`${CLIENT_API}/replica/`) && this.options.publicUrl ? [new URL(this.options.publicUrl).host] : [])].includes(req.headers.host) && (!req.headers.origin || req.headers.origin === this.url), 'Wrong origin', 'AUTH_REQUIRED')
    const url = new URL(req.url, this.url)
    const browser = url.pathname.match(/^\/pardner\/client\/v1\/projects\/([^/]+)\/ws$/)
    const native = url.pathname.match(/^\/pardner\/client\/v1\/replica\/([^/]+)\/native$/)
    requireValue(browser || native, 'Unknown socket', 'AUTH_REQUIRED')
    const project = this.project((browser ?? native)[1])
    let admissionId = null, socketActorId = null
    if (browser) {
      const principal = this.auth.authenticate(req), binding = this.binding(project, principal)
      this.auth.consume(url.searchParams.get('ticket'), project.id, req.headers.origin ?? null, binding.principalId)
      socketActorId = binding.actorId
    } else {
      const grant = this.auth.tickets.get(hash(url.searchParams.get('ticket') ?? ''))
      const admission = project.admissions[grant?.principalId]
      requireValue(admission?.state === 'active', 'Native admission revoked', 'AUTH_REQUIRED')
      this.auth.consume(url.searchParams.get('ticket'), project.id, 'native', admission.id)
      admissionId = admission.id
    }
    // Only an authenticated socket may start or wake a project runtime.
    const runtime = await this.runtime(project)
    const ticket = await runtime.request(AUTOMERGE_PATHS.wsTicket, native ? { purpose: TICKET_PURPOSE.replica, replicaId: 'internal' } : { purpose: TICKET_PURPOSE.ui },
      native ? { [REPLICA_TOKEN_HEADER]: project.internalReplicaToken } : {})
    requireValue(!this.stopping && !socket.destroyed, 'Client is stopping', 'SERVICE_STOPPING')
    const upstream = new WebSocket(`ws://127.0.0.1:${runtime.connection.wsPort}/${native ? 'automerge' : ''}?ticket=${ticket.ticket}`)
    // The upstream is tracked from creation so a handshake the client abandons, or that ws aborts, cannot leak it.
    this.sockets.add(upstream)
    const abandon = () => { upstream.terminate(); this.sockets.delete(upstream) }
    socket.on('error', () => {})
    await new Promise((resolve, reject) => {
      const gone = () => { abandon(); reject(Object.assign(new Error('Client socket closed during upgrade'), { code: 'SOCKET_CLOSED' })) }
      const settle = fn => (...args) => { socket.off('close', gone); clearTimeout(timer); fn(...args) }
      const timer = setTimeout(settle(gone), 15000)
      socket.once('close', gone)
      if (socket.destroyed) return settle(gone)()
      upstream.once('error', settle(error => { abandon(); reject(error) }))
      upstream.once('close', settle(() => { abandon(); reject(Object.assign(new Error('Upstream closed during upgrade'), { code: 'SERVICE_STOPPING' })) }))
      upstream.once('open', () => {
        try {
          requireValue(!this.stopping && !socket.destroyed, 'Client is stopping', 'SERVICE_STOPPING')
          // Bind forwarding before returning from open: its packet can also contain the initial document.
          // ws aborts an invalid handshake by destroying the socket without calling back; `gone` cleans up then.
          this.websockets.handleUpgrade(req, socket, head, settle(downstream => {
            this.sockets.add(downstream)
            downstream.clientProject = project.id; downstream.clientAdmission = admissionId; downstream.clientActor = socketActorId
            upstream.on('message', (data, binary) => {
              if (downstream.readyState !== WebSocket.OPEN) return
              if (browser && !binary) {
                try { const frame = JSON.parse(data.toString()); if (frame.doc?.actors) frame.doc.actors = { ...frame.doc.actors, ...this.project(project.id).people }; downstream.send(JSON.stringify(frame)); return } catch { /* Pass non-document frames unchanged. */ }
              }
              downstream.send(data, { binary })
            })
            downstream.on('message', (data, binary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }) })
            const close = () => { upstream.terminate(); downstream.terminate(); this.sockets.delete(upstream); this.sockets.delete(downstream) }
            upstream.on('close', close); downstream.on('close', close); upstream.on('error', close); downstream.on('error', close)
            resolve()
          }))
        } catch (error) { settle(() => { abandon(); reject(error) })() }
      })
    })
  }
  stop() {
    this.stopPromise ??= this.shutdown()
    return this.stopPromise
  }
  async shutdown() {
    this.stopping = true
    for (const socket of this.upgradeSockets) socket.destroy()
    for (const socket of this.sockets) socket.terminate()
    if (this.server?.listening) await new Promise(resolve => this.server.close(resolve))
    this.websockets?.close()
    await Promise.allSettled([...this.upgrades])
    await Promise.allSettled([...this.starting.values()])
    await Promise.all([...this.runtimes.values()].map(runtime => runtime.stop()))
    this.registry.close()
  }
}
