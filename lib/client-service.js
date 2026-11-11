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
import { CLIENT_API, HARNESS_IDS, UNSUPPORTED_HARNESS, actorId, gitDefaults, hash, profile } from './client-identity.js'
import { createProject, joinProject, remoteJson } from './client-projects.js'
import { nativeRequest, projectPaths, workspaceProxy } from './client-proxy.js'
import { atomicWrite } from './atomic-file.js'
import { machineAccess, recordRefusal } from './enrollment.js'
import { buildRecord, isMember } from './membership.js'
import { peopleView, removalFor, removedMessage } from './client-people.js'
import { requireValue } from './workspace-schema.js'

// How long a positive hub admission answer is reused before a replica write waits on the hub again.
export const ADMISSION_CACHE_MS = 10000

export async function startClient(options = {}) {
  requireValue(options.directory, 'Supply a private client directory')
  const registry = await ClientRegistry.open(resolve(options.directory), options)
  const client = new LocalClient(registry, options)
  try { await client.start(); return client } catch (error) { await client.stop(); throw error }
}
export class LocalClient {
  constructor(registry, options) {
    Object.assign(this, { registry, options, runtimes: new Map(), starting: new Map(), startFailures: new Map(), sockets: new Set(),
      upgradeSockets: new Set(), upgrades: new Set(), admissions: new Map(), admissionRefreshes: new Map(),
      // Hub: when each member machine last reached it, in memory only ("last seen where known"), and its open syncs.
      seen: new Map(), recordNames: new Map() })
    this.now = options.now ?? (() => Date.now())
    this.auth = new ClientAuth(registry)
    this.invites = new ClientInvites(this)
    this.presence = new ClientPresence()
    this.livePresence = new Map()
    this.suggestedIdentity = gitDefaults(options.gitDirectory ?? process.cwd())
  }
  /** Control needs a person (never an agent credential) on this computer; the client listens on loopback only. */
  controlAllowed(principal) {
    return this.registry.read().humanAuthority !== false && ['human', 'operator'].includes(principal.kind)
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
    if (project.state === 'revoked') requireValue(false, removedMessage(project.removal), 'REVOKED', { removal: project.removal ?? null })
    requireValue(!project.revokedActors?.includes(id) && project.people[id], 'Project membership is not available', 'REVOKED')
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
      const promise = ClientRuntime.start(this.registry.directory, project, this.options.runtimeOptions)
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
        if (['AUTH_REQUIRED', 'REVOKED'].includes(error.code)) throw this.removed(project, error.details?.removal)
        if (error.code !== 'HUB_UNAVAILABLE') throw error
      }
    }
    return project.people
  }
  /**
   * Records that this machine is no longer a member of `project`, keeping the project listed as removed (#154), and
   * returns the REVOKED error to throw. `removal` says who removed what, where the hub or the records know it.
   */
  removed(project, removal = null) {
    const updated = this.registry.update(state => {
      const p = state.projects[project.key]
      p.state = 'revoked'
      if (removal || !p.removal) p.removal = removal ?? null
      return p.removal
    })
    return Object.assign(new Error(removedMessage(updated)), { code: 'REVOKED', details: { removal: updated } })
  }
  /** The Actors this project shows, with each person's current name and email from their profile records, and removed people marked. */
  actors(project, people = project.people) {
    const names = this.recordNames.get(project.id)
    if (!names) return people
    return Object.fromEntries(Object.entries(people).map(([id, actor]) => {
      const person = names.get(actor.humanId)
      if (!person) return [id, actor]
      const named = actor.kind === 'human' && !person.removed
        ? { ...actor, displayName: person.name, gitIdentity: { ...actor.gitIdentity, name: person.name, ...(person.email ? { email: person.email } : {}) } } : actor
      return [id, person.removed ? { ...named, removed: true } : named]
    }))
  }
  /** Remembers each person's record name and removal for `actors`, which the board's socket frames read synchronously. */
  rememberNames(projectId, membership) {
    const names = new Map()
    for (const person of membership.people ?? []) names.set(person.id, { name: person.displayName, email: person.email ?? null })
    for (const person of membership.formerPeople ?? []) names.set(person.id, { name: person.displayName, email: person.email ?? null, removed: true })
    this.recordNames.set(projectId, names)
  }
  deviceToken(project, actor) { return project.agentAdmissions?.[actor]?.deviceToken ?? project.deviceToken }
  /** A replica's call to its hub with this machine's credential; a removal it reports puts the project in the removed state. */
  async hub(project, path, body, timeoutMs) {
    try { return await remoteJson(`${project.hubUrl}${path}`, body, project.deviceToken, timeoutMs) } catch (error) {
      if (error.code === 'REVOKED' && error.details && 'removal' in error.details) throw this.removed(project, error.details.removal)
      throw error
    }
  }
  policy(project, actor) { return remoteJson(`${project.hubUrl}/policy`, undefined, this.deviceToken(project, actor)) }
  /**
   * Confirms with the hub that `actor` is still admitted before a replica write. A positive answer is reused for
   * ADMISSION_CACHE_MS per (project, actor) and refreshed in the background on each reuse, so a slow hub does not
   * hold up local saves; a revocation takes effect at the first refresh that observes it. When the cached answer
   * has expired and the runtime reports the hub disconnected, the last positive answer stands instead of waiting on
   * an unreachable hub. `fresh` forces a check, for issuing credentials.
   */
  async refreshAdmission(project, actor, { fresh = false } = {}) {
    if (project.role !== 'replica') return
    const key = `${project.key}:${actor ?? ''}`
    const known = this.admissions.get(key)
    if (!fresh && known && Date.now() - known.at < ADMISSION_CACHE_MS) {
      this.backgroundAdmission(project, actor, key)
      return
    }
    if (!fresh && known && !(await this.hubConnected(project))) return
    await this.checkAdmission(project, actor, key)
  }
  backgroundAdmission(project, actor, key) {
    if (this.admissionRefreshes.has(key) || this.stopping) return
    const refresh = this.checkAdmission(project, actor, key).catch(() => { /* A revocation is recorded; outages keep the last answer. */ })
      .finally(() => this.admissionRefreshes.delete(key))
    this.admissionRefreshes.set(key, refresh)
  }
  async hubConnected(project) {
    try { return (await (await this.runtime(project)).request('/automerge/status')).hubConnected !== false } catch { return true }
  }
  async checkAdmission(project, actor, key) {
    try {
      const policy = await this.policy(project, actor)
      if (actor && !policy.actorIds.includes(actor)) {
        this.admissions.delete(key)
        this.registry.update(state => { const p = state.projects[project.key]; p.revokedActors ??= []; if (!p.revokedActors.includes(actor)) p.revokedActors.push(actor) })
        throw Object.assign(new Error('Actor admission revoked'), { code: 'ACTOR_REVOKED' })
      }
      this.admissions.set(key, { at: Date.now() })
    }
    catch (error) {
      if (error.code === 'HUB_UNAVAILABLE') return
      if (['AUTH_REQUIRED', 'REVOKED'].includes(error.code)) {
        this.admissions.delete(key)
        if (project.agentAdmissions?.[actor]) {
          this.registry.update(state => { const p = state.projects[project.key]; p.revokedActors ??= []; if (!p.revokedActors.includes(actor)) p.revokedActors.push(actor) })
          throw Object.assign(new Error('Agent admission revoked'), { code: 'ACTOR_REVOKED' })
        }
        throw this.removed(project, error.details?.removal)
      }
      throw error
    }
  }
  async registerActor(project, person) {
    const runtime = await this.runtime(project)
    const { doc } = await runtime.request('/automerge/doc')
    if (!doc.actors[person.id]) await runtime.request('/automerge/operations', {
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
    try { status = await (await this.runtime(project)).request('/automerge/status') }
    catch (error) { status = { savedLocally: false, syncPending: true, error: error.code, available: false } }
    // This machine's role from its own record store; a just-joined replica may not hold its admission record yet.
    let memberRole = null
    try { memberRole = machineAccess(await this.membership(project.id), this.registry.machineKey.machineId)?.role ?? null } catch { /* Reported by status. */ }
    return { id: project.id, name: project.name, role: project.role, actorId: binding.actorId, memberRole,
      ...projectPaths(project.id), authentication: 'session', workspaceId: project.id, status, controlAvailable: this.controlAllowed(principal) }
  }
  async session(principal) {
    const state = this.registry.read()
    const projects = Object.values(state.projects).filter(project => project.id && project.state === 'ready' &&
      (principal.kind !== 'agent' || project.id === principal.projectId))
    // A project this machine was removed from stays listed as removed, never silently dropped (#154).
    const removedProjects = principal.kind === 'agent' ? [] : Object.values(state.projects).filter(project => project.id && project.state === 'revoked')
      .map(project => ({ id: project.id, name: project.name, role: project.role, removal: project.removal ?? null, message: removedMessage(project.removal) }))
    return { identity: state.identity, device: { ...state.device, machineId: state.machine.machineId }, suggestedIdentity: this.suggestedIdentity, setupAgent: state.setupAgent,
      projects: await Promise.all(projects.map(project => this.projectView(project, principal))), removedProjects }
  }
  /** The project's membership as computed from this client's grow-only record store, read-only. */
  async membership(projectId) {
    const membership = await (await this.runtime(this.project(projectId))).request('/automerge/membership')
    this.rememberNames(projectId, membership)
    return membership
  }
  /** The hub's membership when this client is a replica: the hub's gate decides, and this copy may not have synced yet. */
  async authoritativeMembership(project) {
    return project.role === 'hub' ? this.membership(project.id) : remoteJson(`${project.hubUrl}/membership`, undefined, project.deviceToken)
  }
  /**
   * The calling device's admission at the hub. Its bearer token names it; the records decide what it may do. Its
   * machine must be a current member, and the Actors it may act as, and whether it may act as its person, come from
   * that machine's records, so a removal takes effect from the records.
   */
  async admission(project, req) {
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const admission = Object.values(project.admissions).find(entry => token && hash(entry.deviceToken) === hash(token))
    requireValue(admission, 'Device is not admitted to this project', 'AUTH_REQUIRED')
    requireValue(admission.state === 'active', removedMessage(admission.removal), 'REVOKED', { removal: admission.removal ?? null })
    const access = await this.access(project, admission)
    this.touch(project, admission.machineId)
    return access
  }
  async access(project, admission) {
    const membership = await this.membership(project.id)
    const access = machineAccess(membership, admission.machineId)
    if (!access) {
      const removal = removalFor(membership, admission.machineId)
      requireValue(false, removedMessage(removal), 'REVOKED', { removal })
    }
    return { ...admission, ...access }
  }
  /** Hub: notes that `machineId` reached it now; `sockets` counts its open syncs (+1 on open, -1 on close). */
  touch(project, machineId, sockets = 0) {
    const key = `${project.id}:${machineId}`, entry = this.seen.get(key) ?? { lastSeenAt: null, sockets: 0 }
    this.seen.set(key, { lastSeenAt: this.now(), sockets: Math.max(0, entry.sockets + sockets) })
  }
  /** Hub: `{ [machineId]: { connected, lastSeenAt } }` for the project's machines it has seen since it started. */
  seenFor(project) {
    const result = {}
    for (const [key, entry] of this.seen) if (key.startsWith(`${project.id}:`)) result[key.slice(project.id.length + 1)] = { connected: entry.sockets > 0, lastSeenAt: entry.lastSeenAt }
    return result
  }
  /** Who `machineId` is in the project, for deciding which invitations it may see and revoke. */
  async viewer(project, machineId) {
    const membership = await this.membership(project.id)
    const access = machineAccess(membership, machineId)
    requireValue(access, 'This machine was removed from the project', 'REVOKED')
    return { ...access, machineIds: membership.machines.filter(machine => machine.personId === access.personId).map(machine => machine.id) }
  }
  /**
   * Sends new records through this hub's gate (WorkspaceRuntime.addRecords). A removal also ends bearer admission at
   * once, as revocation did: the admission is revoked, its sockets close, its presence ends, and invitations its
   * machine issued are revoked.
   */
  async gate(project, records) {
    const result = await (await this.runtime(project)).request('/automerge/membership/records', { records })
    this.rememberNames(project.id, result.membership)
    if (records.some(record => ['member.remove', 'machine.remove'].includes(record.kind))) this.afterRemoval(project, result.membership)
    return result
  }
  afterRemoval(project, membership) {
    this.rememberNames(project.id, membership)
    const ended = this.registry.update(state => {
      const p = state.projects[project.key], ended = []
      for (const admission of Object.values(p.admissions)) {
        if (admission.state === 'active' && !isMember(membership, admission.machineId)) {
          // Kept so the removed machine is told who removed it, and whether its person left (#154).
          Object.assign(admission, { state: 'revoked', removal: removalFor(membership, admission.machineId) })
          ended.push(admission.id)
        }
      }
      for (const invite of Object.values(state.invites)) {
        if (invite.projectId === project.id && invite.state === 'issued' && !isMember(membership, invite.issuerId)) Object.assign(invite, { state: 'revoked', revokedAt: this.now() })
      }
      return ended
    })
    for (const socket of this.sockets) if (socket.clientProject === project.id && ended.includes(socket.clientAdmission)) socket.terminate()
    for (const [sessionId, binding] of this.livePresence) {
      if (binding.projectId !== project.id || !ended.some(id => binding.principalId.startsWith(`${id}:`))) continue
      try { this.presence.end(binding, sessionId) } catch { /* Already expired. */ }
      this.livePresence.delete(sessionId)
    }
  }
  /** Records this machine signed itself go to the hub's gate; on the hub they are checked and gated here. */
  async submitRecords(project, records) {
    if (project.role === 'replica') return remoteJson(`${project.hubUrl}/records`, { records }, project.deviceToken, 15000)
    return this.acceptRecords(project, this.registry.machineKey.machineId, records)
  }
  /** Hub: removals, role changes and agent labels a member machine signed, each refused with a reason a person can act on. */
  async acceptRecords(project, machineId, records) {
    requireValue(Array.isArray(records) && records.length >= 1 && records.length <= 4, 'Supply one to four records')
    const membership = await this.membership(project.id)
    for (const record of records) {
      requireValue(record?.signer === machineId && record.projectId === project.id, 'Submit only records this machine signed for this project', 'FORBIDDEN')
      const refusal = recordRefusal(membership, record)
      requireValue(!refusal, ...(refusal ?? []))
    }
    const { recordIds } = await this.gate(project, records)
    return { recordIds }
  }
  async presenceAction(project, binding, action, sessionId, input = {}) {
    for (const [id, entry] of this.livePresence) if (entry.expiresAt <= Date.now()) this.livePresence.delete(id)
    if (project.role === 'replica') {
      try { return await remoteJson(`${project.hubUrl}/presence`, { binding: { actorId: binding.actorId, principalId: binding.principalId }, action, sessionId, input }, this.deviceToken(project, binding.actorId)) }
      catch (error) {
        if (action === 'snapshot' && error.code === 'HUB_UNAVAILABLE') return { actors: [], observedAt: null, available: false, code: error.code }
        if (error.code === 'REVOKED' && !project.agentAdmissions?.[binding.actorId]) throw this.removed(project, error.details?.removal)
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
      const { doc } = await (await this.runtime(project)).request('/automerge/doc')
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
  /**
   * Removes a person (`member.remove`) or one machine (`machine.remove`), signed by this machine and recorded by the
   * hub's gate, or revokes one of this machine's own agents locally. A machine is named by its machine ID, or by the
   * device ID its profile lists.
   */
  async revoke(project, principal, input) {
    this.human(principal)
    const state = this.registry.read()
    requireValue(['member', 'machine', 'device', 'agent'].includes(input.kind), 'Choose member, machine or agent')
    requireValue(typeof input.id === 'string' && input.id.length <= 200, 'Supply --id')
    return this.registry.attempt(`revoke:${project.id}:${state.identity.id}`, input.operationId, { kind: input.kind, id: input.id }, async () => {
      if (input.kind === 'agent') return this.revokeAgent(project, input.id)
      const subject = input.kind === 'member' ? input.id : this.machineFor(project, input.id)
      if (input.kind !== 'member') {
        // Removing the machine that hosts the project would cut every member off from it.
        const membership = await this.membership(project.id)
        const owner = membership.people.find(person => person.role === 'owner')
        const host = membership.machines.find(machine => machine.admittedBy === null && machine.personId === owner?.id)
        requireValue(subject !== host?.id, 'This machine hosts the project, so it can’t be removed.', 'FORBIDDEN')
      }
      const record = buildRecord(this.registry.machineKey, { projectId: project.id, kind: input.kind === 'member' ? 'member.remove' : 'machine.remove', subject })
      await this.submitRecords(project, [record])
      // A removal made from this computer is checked again on the next write rather than after the cache window.
      for (const key of this.admissions.keys()) if (key.startsWith(`${project.key}:`)) this.admissions.delete(key)
      // Removing your own person is leaving: this machine goes with it.
      if (input.kind === 'member' && subject === state.identity.id) this.removed(project, { kind: 'person', left: true, by: { personId: subject, name: state.identity.name } })
      return { removed: true, kind: input.kind === 'member' ? 'member' : 'machine', id: subject, recordId: record.recordId,
        ...(input.kind === 'member' && subject === state.identity.id ? { left: true } : {}) }
    })
  }
  machineFor(project, id) {
    if (/^machine-[a-z2-7]{26}$/.test(id)) return id
    const devices = Object.values(project.people).flatMap(person => person.devices ?? [])
    const machineId = devices.find(device => device.id === id)?.machineId
    requireValue(machineId, 'No machine with that ID in this project. Use the machine ID that client show lists.', 'NOT_FOUND')
    return machineId
  }
  /** Agent grants are this machine's own: revoking one ends its sessions here. Joining a new Agent invitation here restores it. */
  revokeAgent(project, id) {
    const state = this.registry.read(), person = project.people[id]
    requireValue(person?.kind === 'agent', 'No agent with that ID in this project', 'NOT_FOUND')
    requireValue(person.humanId === state.identity.id, 'Agent belongs to another human', 'FORBIDDEN')
    this.registry.update(state => {
      for (const session of Object.values(state.sessions)) if (session.projectId === project.id && session.actorId === id) session.revoked = true
      const p = state.projects[project.key]; p.revokedActors ??= []; if (!p.revokedActors.includes(id)) p.revokedActors.push(id)
    })
    for (const socket of this.sockets) if (socket.clientProject === project.id && socket.clientActor === id) socket.terminate()
    for (const [sessionId, binding] of this.livePresence) {
      if (binding.projectId !== project.id || binding.actorId !== id) continue
      try { this.presence.end(binding, sessionId) } catch { /* Already expired. */ }
      this.livePresence.delete(sessionId)
    }
    return { revoked: true, kind: 'agent', id }
  }
  /** Owner only: a `member.role` naming the head of the person's role chain, so concurrent changes stay ordered. */
  async changeRole(project, principal, input) {
    this.human(principal)
    requireValue(['admin', 'member'].includes(input.role), 'Choose the admin or member role')
    requireValue(typeof input.personId === 'string', 'Supply --person')
    return this.registry.attempt(`role:${project.id}`, input.operationId, { personId: input.personId, role: input.role }, async () => {
      const target = (await this.authoritativeMembership(project)).people.find(person => person.id === input.personId)
      requireValue(target, 'That person is not a current member of this project', 'NOT_FOUND')
      const record = buildRecord(this.registry.machineKey, { projectId: project.id, kind: 'member.role', subject: input.personId,
        role: input.role, replaces: target.roleRecord ?? null })
      await this.submitRecords(project, [record])
      return { personId: input.personId, role: input.role, recordId: record.recordId }
    })
  }
  /** Leaves the project: this machine signs `member.remove` for its own person. The owner can't leave. */
  async leave(project, principal, input) {
    this.human(principal)
    const state = this.registry.read()
    return this.revoke(project, principal, { kind: 'member', id: state.identity.id, operationId: input.operationId })
  }
  /**
   * Sets this person's display name and email in the project with a `profile` record, signed by this machine, and
   * keeps them as this computer's identity for projects it starts or joins later. Agent names are not changed.
   */
  async editProfile(project, principal, input) {
    this.human(principal)
    const identity = profile(input)
    const state = this.registry.read()
    return this.registry.attempt(`profile:${project.id}`, input.operationId, identity, async () => {
      const record = buildRecord(this.registry.machineKey, { projectId: project.id, kind: 'profile', subject: state.identity.id,
        displayName: identity.name, email: identity.email })
      await this.submitRecords(project, [record])
      this.registry.update(next => { next.identity = { ...next.identity, ...identity } })
      return { personId: state.identity.id, ...identity, recordId: record.recordId }
    })
  }
  /**
   * The People view of `project` from this machine's records (lib/client-people.js), with live presence and, from the
   * hub, when each machine was last seen. It opens offline; the hub re-checks every action taken from it.
   */
  async peopleFor(project, principal) {
    this.binding(project, principal)
    const state = this.registry.read()
    const membership = await this.membership(project.id)
    const machineId = this.registry.machineKey.machineId
    if (project.role === 'replica' && membership.removedMachines.includes(machineId)) throw this.removed(project, removalFor(membership, machineId))
    let seen = null, hubReachable = true
    if (project.role === 'hub') seen = this.seenFor(project)
    else {
      try { seen = (await remoteJson(`${project.hubUrl}/machines`, undefined, project.deviceToken)).machines } catch (error) {
        if (error.code === 'REVOKED') throw this.removed(project, error.details?.removal)
        if (error.code !== 'HUB_UNAVAILABLE') throw error
        hubReachable = false
      }
    }
    let presence = null
    try { presence = await this.presenceAction(project, this.binding(project, principal), 'snapshot') } catch (error) { if (error.code === 'REVOKED') throw error }
    return peopleView({ membership, project: this.registry.read().projects[project.key], machineId, localDevice: state.device,
      presence: presence?.available === false ? null : presence, seen, hubReachable, now: this.now() })
  }
  async start() {
    this.options.publicUrl ??= this.registry.read().publicUrl
    if (this.options.publicUrl) {
      const publicUrl = new URL(this.options.publicUrl)
      // Plain HTTP is accepted only for a gateway on this machine's loopback (a local relay or test network gate).
      const loopback = publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(publicUrl.hostname)
      requireValue((publicUrl.protocol === 'https:' || loopback) && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash && !publicUrl.username && !publicUrl.password,
        'Public gateway must be an explicit HTTPS origin, or an HTTP origin on loopback')
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
    // The enrollment point: a new machine stores its join request and polls it with its recipient proof.
    app.post(`${CLIENT_API}/enroll`, handle(async (req, res) => {
      if (req.body?.action === 'status') return res.json(this.invites.requestStatus(req.body.offerId, req.body.requestId, req.body.recipientProof))
      requireValue(req.body?.action === 'request', 'Unknown enrollment action')
      res.json(await this.invites.request(req.body))
    }))
    app.use(`${CLIENT_API}/replica/:id`, handle(async (req, res) => {
      const project = this.project(req.params.id)
      requireValue(project.role === 'hub', 'This service is not the authority', 'HUB_REQUIRED')
      const admission = await this.admission(project, req)
      if (req.path === '/presence' && req.method === 'POST') {
        const id = req.body.binding?.actorId
        requireValue(admission.actorIds.includes(id), 'Presence Actor not admitted on device', 'ACTOR_MISMATCH')
        requireValue(typeof req.body.binding?.principalId === 'string', 'Presence principal required')
        const person = project.people[id]
        const binding = { projectId: project.id, actorId: id, deviceId: admission.device.id, deviceName: admission.device.name,
          principalId: `${admission.id}:${req.body.binding.principalId}`, harnessId: person.harnessId, kind: person.kind === 'agent' ? 'agent' : 'browser' }
        return res.json(await this.presenceAction(project, binding, req.body.action, req.body.sessionId, req.body.input))
      }
      if (req.path === '/membership' && req.method === 'GET') return res.json(await this.membership(project.id))
      if (req.path === '/machines' && req.method === 'GET') return res.json({ machines: this.seenFor(project) })
      if (req.path === '/records' && req.method === 'POST') {
        requireValue(admission.humanAllowed || req.body.records?.every(record => record?.kind === 'agent.name'), 'Human authority required', 'FORBIDDEN')
        return res.json(await this.acceptRecords(project, admission.machineId, req.body.records))
      }
      if (req.path === '/agents' && req.method === 'POST') return res.json(await this.invites.redeemAgent(project, admission.machineId, req.body))
      if (req.path === '/invites' && req.method === 'POST') {
        requireValue(admission.humanAllowed, 'Human authority required', 'FORBIDDEN')
        if (req.body.action === 'routes') return res.json({ routes: [this.invites.enrollUrl()] })
        if (req.body.action === 'issue') return res.json(await this.invites.registerRemote(project, admission, req.body.offer, req.body.secret))
        const viewer = await this.viewer(project, admission.machineId)
        if (req.body.action === 'list') return res.json(await this.invites.listFor(project, viewer, req.body))
        requireValue(req.body.action === 'revoke', 'Unknown invitation action')
        return res.json(this.invites.revokeFor(project, viewer, req.body.inviteId))
      }
      if (req.path === '/join-requests' && req.method === 'POST') {
        requireValue(admission.humanAllowed, 'Human authority required', 'FORBIDDEN')
        const { action, requestId } = req.body
        if (action === 'list') return res.json(await this.invites.pendingFor(project, admission.machineId))
        if (action === 'nonce') return res.json(await this.invites.setNonce(project, admission.machineId, requestId, req.body.nonce))
        if (action === 'approve') return res.json(await this.invites.approve(project, admission.machineId, requestId, req.body.record))
        requireValue(action === 'reject', 'Unknown join request action')
        return res.json(await this.invites.reject(project, admission.machineId, requestId))
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
    // Only the local operator token (client-connection.json) may stop the service; browser cookie sessions cannot.
    app.post(`${CLIENT_API}/shutdown`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      res.once('finish', () => { this.stop() })
      res.json({ stopping: true })
    }))
    app.post(`${CLIENT_API}/identity`, handle(async (req, res) => {
      this.human(req.principal)
      const identity = profile(req.body)
      await this.registry.attempt(`identity:${this.registry.read().clientId}`, req.body.operationId, identity, async () => {
        this.registry.update(state => {
          requireValue(!state.identity || (state.identity.name === identity.name && state.identity.email === identity.email),
            `This client already has an identity (${state.identity?.name} <${state.identity?.email}>); it can't be changed. To use a different identity, start a separate client directory.`,
            'IDENTITY_EXISTS', state.identity && { identity: { name: state.identity.name, email: state.identity.email } })
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
      let membership
      try { membership = await this.membership(project.id) } catch (error) { membership = { available: false, code: error.code ?? 'RUNTIME_FAILED' } }
      // The records may hold this machine's removal before the hub refuses it.
      const machineId = this.registry.machineKey.machineId
      if (project.role === 'replica' && membership.removedMachines?.includes(machineId)) throw this.removed(project, removalFor(membership, machineId))
      const people = await this.people(project)
      res.json({ project: await this.projectView(project, req.principal), actors: Object.values(this.actors(project, people)),
        presence: await this.presenceAction(project, binding, 'snapshot'), membership })
    }))
    app.get(`${CLIENT_API}/projects/:id/export`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      const project = this.project(req.params.id), runtime = await this.runtime(project)
      const { doc } = await runtime.request('/automerge/doc')
      const status = await runtime.request('/automerge/status')
      requireValue(status.savedLocally && !status.storageError, 'Local storage is not confirmed saved', 'STORAGE_FAILED')
      res.json({ format: 'pardner-workspace-view-v1', workspaceId: project.id, exportedAt: new Date().toISOString(),
        savedLocally: true, doc, restoreRequires: 'Complete cold client backup; this readable content view is not a replica or credential backup' })
    }))
    app.post(`${CLIENT_API}/projects/:id/revoke`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.revoke(project, req.principal, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/role`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.changeRole(project, req.principal, req.body))
    }))
    app.get(`${CLIENT_API}/projects/:id/people`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.human(req.principal)
      res.json(await this.peopleFor(project, req.principal))
    }))
    app.post(`${CLIENT_API}/projects/:id/leave`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.leave(project, req.principal, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/profile`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.editProfile(project, req.principal, req.body))
    }))
    // Join requests this machine may approve: list them, fix the code, then approve with the code both screens show, or reject.
    const approver = req => {
      const project = this.project(req.params.id), binding = this.binding(project, req.principal); this.human(req.principal)
      requireValue(project.people[binding.actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
      return project
    }
    app.get(`${CLIENT_API}/projects/:id/join-requests`, handle(async (req, res) => res.json(await this.invites.approverRequests(approver(req)))))
    app.post(`${CLIENT_API}/projects/:id/join-requests/:requestId/code`, handle(async (req, res) =>
      res.json(await this.invites.revealCode(approver(req), req.params.requestId))))
    app.post(`${CLIENT_API}/projects/:id/join-requests/:requestId/approve`, handle(async (req, res) =>
      res.json(await this.invites.approveRequest(approver(req), req.params.requestId, req.body.code))))
    app.post(`${CLIENT_API}/projects/:id/join-requests/:requestId/reject`, handle(async (req, res) =>
      res.json(await this.invites.rejectRequest(approver(req), req.params.requestId))))
    app.post(`${CLIENT_API}/projects/:id/agent-grant`, handle(async (req, res) => {
      requireValue(req.principal.kind === 'operator', 'Local operator authority required', 'FORBIDDEN')
      const project = this.project(req.params.id), state = this.registry.read()
      const harnessId = req.body.harnessId ?? state.setupAgent.harnessId
      requireValue(HARNESS_IDS.includes(harnessId), UNSUPPORTED_HARNESS)
      const id = actorId(state.identity.id, harnessId)
      requireValue((req.body.actorId === undefined || req.body.actorId === id) &&
        (req.body.humanId === undefined || req.body.humanId === state.identity.id), 'Agent must belong to the local human', 'ACTOR_MISMATCH')
      const person = project.people[id]
      requireValue(!project.revokedActors?.includes(id), 'This agent was revoked on this computer. Join a new Agent invitation here to restore it.', 'ACTOR_REVOKED')
      requireValue(person?.kind === 'agent' && person.humanId === state.identity.id && person.harnessId === harnessId &&
        person.devices?.some(device => device.id === state.device.id),
        'Harness is not enrolled on this device; join an Agent invitation first', 'FORBIDDEN')
      await this.refreshAdmission(project, id, { fresh: true })
      const reporting = project.agentReporting?.[id] ?? (harnessId === state.setupAgent.harnessId ? state.setupAgent : {})
      res.json({ token: this.auth.agentGrant(project.id, id, state.device.id), actorId: id, projectId: project.id,
        harnessId, ...(reporting.model ? { model: reporting.model } : {}), ...(reporting.managedBy ? { managedBy: reporting.managedBy } : {}) })
    }))
    app.get(`${CLIENT_API}/projects/:id/invites`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal); this.human(req.principal)
      requireValue(project.people[this.binding(project, req.principal).actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
      const page = { limit: req.query.limit, offset: req.query.offset }
      res.json(project.role === 'replica' ? await this.hub(project, '/invites', { action: 'list', ...page })
        : await this.invites.listFor(project, await this.viewer(project, this.registry.machineKey.machineId), page))
    }))
    app.post(`${CLIENT_API}/projects/:id/invites`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal)
      res.json(await this.invites.issue(project, req.principal, req.body))
    }))
    app.post(`${CLIENT_API}/projects/:id/invites/:inviteId/revoke`, handle(async (req, res) => {
      const project = this.project(req.params.id); this.binding(project, req.principal); this.human(req.principal)
      requireValue(project.people[this.binding(project, req.principal).actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
      res.json(project.role === 'replica' ? await remoteJson(`${project.hubUrl}/invites`, { action: 'revoke', inviteId: req.params.inviteId }, project.deviceToken) :
        this.invites.revokeFor(project, await this.viewer(project, this.registry.machineKey.machineId), req.params.inviteId))
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
        RECORD_REFUSED: 403, JOIN_REJECTED: 403, REQUEST_EXPIRED: 410, REQUEST_CLOSED: 409, CODE_REQUIRED: 409, CODE_MISMATCH: 409, CODE_COLLISION: 409,
        MACHINE_REMOVED: 403, PERSON_REMOVED: 403, ALREADY_MEMBER: 409, TOO_MANY_REQUESTS: 429,
        OPERATION_ID_REUSED: 409, STALE_UPDATE: 409, STALE_PRESENCE_REPORT: 409, IDENTITY_EXISTS: 409, IDENTITY_MISMATCH: 409,
        HUB_REQUIRED: 409, WORKSPACE_MISMATCH: 409, PRESENCE_LIMIT: 429,
        // Control pane refusals and conflicts, as the project runtime reports them.
        ROUTE_REJECTED: 403, LOCAL_ADMIN_REQUIRED: 403, AMBIGUOUS_ROUTE: 409, CONTROLLER_CONFLICT: 409, INVALID_EXECUTION_STATE: 409,
        UNREVIEWED_RUN: 409, HOLD_CHANGED: 409, CREDENTIAL_CHANGED: 409, UNQUALIFIED_THREAD: 409, VERSION_ACCEPTANCE_REQUIRED: 409,
        CONTROL_UNAVAILABLE: 503, T3_REJECTED: 502, T3_BUSY: 503, T3_UNKNOWN: 504,
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
    await new Promise((resolve, reject) => {
      this.server.once('error', error => reject(error.code === 'EADDRINUSE'
        ? Object.assign(new Error(`Port ${port} is in use by another process; choose another --http-port`), { code: 'PORT_IN_USE' }) : error))
      this.server.listen(port, '127.0.0.1', resolve)
    })
    this.url = `http://127.0.0.1:${this.server.address().port}`
    this.gatewayUrl = this.options.publicUrl ?? this.url
    this.registry.update(state => { state.port = this.server.address().port; state.publicUrl = this.options.publicUrl ?? null })
    await atomicWrite(join(this.registry.directory, 'client-connection.json'), JSON.stringify({ url: this.url, token: this.registry.read().operatorToken, pid: process.pid }))
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
      await this.access(project, admission)
      this.auth.consume(url.searchParams.get('ticket'), project.id, 'native', admission.id)
      admissionId = admission.id
    }
    // Only an authenticated socket may start or wake a project runtime.
    const runtime = await this.runtime(project)
    const ticket = await runtime.request('/automerge/ws-ticket', native ? { purpose: 'replica', replicaId: 'internal' } : { purpose: 'ui' },
      native ? { 'x-pardner-replica-token': project.internalReplicaToken } : {})
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
            if (native) {
              const machineId = project.admissions[admissionId].machineId
              this.touch(project, machineId, 1)
              downstream.once('close', () => this.touch(project, machineId, -1))
            }
            upstream.on('message', (data, binary) => {
              if (downstream.readyState !== WebSocket.OPEN) return
              if (browser && !binary) {
                try { const frame = JSON.parse(data.toString()); if (frame.doc?.actors) frame.doc.actors = { ...frame.doc.actors, ...this.actors(this.project(project.id)) }; downstream.send(JSON.stringify(frame)); return } catch { /* Pass non-document frames unchanged. */ }
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
    await Promise.allSettled([...this.admissionRefreshes.values()])
    await Promise.all([...this.runtimes.values()].map(runtime => runtime.stop()))
    this.registry.close()
  }
}
