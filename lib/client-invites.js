import { randomUUID } from 'node:crypto'
import { actorId, actorsFor, hash, secret as newToken, setupAgent } from './client-identity.js'
import {
  OFFER_TTL_MS, PENDING_LIMIT, REQUEST_LIMIT, REQUEST_TTL_MS, buildOffer, collidingCodes, confirmationCode, decodeInvitation,
  encodeInvitation, joinRequestRefusal, machineAccess, macMatches, newNonce, offerRefusal, requestRecordRefusal, requireNonce, sameCode,
} from './enrollment.js'
import { buildRecord, isMember, mayAuthor } from './membership.js'
import { canonical, requireValue } from './workspace-schema.js'
import { remoteJson } from './client-projects.js'
import { invitationEnvelope, invitationPrompt } from './onboarding-invitation.js'

/** A pasted invitation's offer and secret; its first route is the hub's enrollment endpoint. */
export function invitationData(invitation) {
  try {
    const value = decodeInvitation(invitationEnvelope(invitation))
    return { ...value, id: value.offer.offerId, projectId: value.offer.projectId, purpose: value.offer.purpose, endpoint: value.offer.routes[0] }
  } catch (error) {
    throw Object.assign(new Error(error.code ? error.message : 'Invalid invitation'), { code: 'INVALID_INVITATION' })
  }
}

/**
 * One invitation as its history shows it (#183): who issued it and when, its state, and who used it. `membership`
 * names people, including removed ones; without it the names are left out.
 */
export function inviteSummary(invite, now = Date.now(), membership = null) {
  const pending = Object.values(invite.requests ?? {}).filter(request => request.state === 'pending' && request.expiresAt > now).length
  const everyone = membership ? [...membership.people, ...(membership.formerPeople ?? [])] : []
  const removed = new Set(membership?.removedPeople ?? [])
  const person = (personId, fallback) => personId ? { personId, name: everyone.find(entry => entry.id === personId)?.displayName ?? fallback ?? null,
    ...(removed.has(personId) ? { removed: true } : {}) } : null
  const issuer = membership && [...membership.machines, ...(membership.formerMachines ?? [])].find(machine => machine.id === invite.issuerId)
  const approved = Object.values(invite.requests ?? {}).find(request => request.state === 'approved')
  const usedBy = invite.state !== 'redeemed' ? null : approved ? person(approved.request.personId, approved.request.profile?.name) : person(invite.offer.personId)
  return { id: invite.id, purpose: invite.purpose, projectId: invite.projectId, projectName: invite.projectName, expiresAt: invite.expiresAt,
    // Offers are issued with an OFFER_TTL_MS lifetime, so an invitation stored before createdAt was kept still has its creation time.
    createdAt: invite.createdAt ?? invite.expiresAt - OFFER_TTL_MS,
    ...(invite.offer.role ? { role: invite.offer.role } : {}), ...(invite.offer.personId ? { personId: invite.offer.personId, for: person(invite.offer.personId) } : {}),
    ...(membership ? { issuedBy: issuer ? person(issuer.personId) : null } : {}),
    state: invite.state === 'issued' && invite.expiresAt <= now ? 'expired' : invite.state, pending,
    ...(usedBy ? { usedBy, usedAt: approved?.approvedAt ?? invite.redeemedAt ?? null } : {}),
    ...(invite.state === 'revoked' ? { revokedAt: invite.revokedAt ?? null, ...(membership && invite.revokedBy ? { revokedBy: person(invite.revokedBy) } : {}) } : {}) }
}

/** Invitations a history page shows at most, and by default. */
export const INVITE_PAGE_LIMIT = 50
export const INVITE_PAGE_DEFAULT = 10

const STATE_REFUSALS = {
  revoked: ['This invitation was revoked. Ask for a new one.', 'REVOKED'],
  redeemed: ['This invitation was already used. Ask for a new one.', 'INVITE_USED'],
}

/**
 * Invitations on signed offers (docs/PARDNER-TRUST-DESIGN.md, section 4).
 *
 * The hub (the client that hosts a project) is the enrollment point. It keeps
 * each offer, its secret and its join requests in the client registry, which
 * commits with synchronous=FULL before a request is answered. A pending
 * request expires REQUEST_TTL_MS after it is stored or when its offer expires,
 * whichever comes first; at most PENDING_LIMIT wait on one offer at a time and
 * REQUEST_LIMIT are kept in any state. Expiry and single use are decided here,
 * by the hub's clock, and nowhere else.
 */
export class ClientInvites {
  constructor(client) { this.client = client; this.registry = client.registry }
  now() { return this.client.now() }

  // ---- Issuing (any member machine, for the purposes its records allow) ----

  /** Signs an offer with this machine's key and registers it with the hub. Retries with one operation ID reuse the offer. */
  async issue(project, principal, input) {
    this.client.human(principal)
    const binding = this.client.binding(project, principal)
    requireValue(project.people[binding.actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
    requireValue(['human', 'agent', 'device'].includes(input.purpose), 'Choose Human, Agent or My device')
    requireValue(input.role === undefined || ['admin', 'member'].includes(input.role), 'Choose the admin or member role')
    requireValue(input.purpose === 'human' || input.role === undefined, 'Only a Human invitation offers a role')
    requireValue(input.personId === undefined || input.purpose === 'device', 'Only a My device invitation can name another person')
    const state = this.registry.read(), key = this.registry.machineKey
    const personId = input.purpose === 'human' ? undefined : input.personId ?? state.identity.id
    const role = input.purpose === 'human' ? input.role ?? 'member' : undefined
    // The hub decides from its records; a replica's own copy may not hold its newest records yet, so the hub checks again.
    if (project.role === 'hub') {
      const refusal = issueRefusal(await this.client.membership(project.id), key.machineId, { purpose: input.purpose, role, personId })
      requireValue(!refusal, ...(refusal ?? []))
    }
    const person = personId ? personPreview(project, personId) : undefined
    const result = await this.registry.attempt(`invite:${state.clientId}:${project.id}`, input.operationId, { purpose: input.purpose, role, personId }, async (attempt, checkpoint) => {
      let offer = attempt.offer
      if (!offer) {
        const routes = project.role === 'hub' ? [this.enrollUrl()] : (await remoteJson(`${project.hubUrl}/invites`, { action: 'routes' }, project.deviceToken)).routes
        offer = buildOffer(key, { projectId: project.id, offerId: attempt.id, purpose: input.purpose, ...(role ? { role } : { personId }),
          routes, expiresAt: this.now() + OFFER_TTL_MS })
        checkpoint({ offer })
      }
      const invite = project.role === 'hub' ? this.register(project, key.machineId, offer, attempt.proof)
        : (await remoteJson(`${project.hubUrl}/invites`, { action: 'issue', offer, secret: attempt.proof }, project.deviceToken)).invite
      return { invite, invitation: encodeInvitation({ offer, secret: attempt.proof, projectName: project.name, person }) }
    })
    const invite = project.role === 'hub' ? inviteSummary(this.registry.read().invites[result.invite.id], this.now(), await this.client.membership(project.id))
      : (await remoteJson(`${project.hubUrl}/invites`, { action: 'list', limit: 1 }, project.deviceToken)).invites.find(entry => entry.id === result.invite.id) ?? result.invite
    return { ...result, invite, setupPrompt: invitationPrompt({ projectName: project.name, purpose: input.purpose, invitation: result.invitation }) }
  }

  enrollUrl() { return `${this.client.gatewayUrl}/pardner/client/v1/enroll` }

  /** Hub: stores an offer signed by `issuerId` (the authenticated caller), once. */
  register(project, issuerId, offer, secret) {
    requireValue(offer?.signer === issuerId && offer.projectId === project.id, 'The offer must be signed by the requesting machine for this project', 'FORBIDDEN')
    requireValue(typeof secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(secret), 'Supply the invitation secret', 'INVALID_ARGUMENT')
    const invite = this.registry.update(state => {
      const existing = state.invites[offer.offerId]
      if (existing) {
        requireValue(canonical(existing.offer) === canonical(offer) && existing.secret === secret, 'This offer ID belongs to another invitation', 'OPERATION_ID_REUSED')
        return existing
      }
      return state.invites[offer.offerId] = { id: offer.offerId, projectId: project.id, projectName: project.name, purpose: offer.purpose,
        offer, secret, issuerId, expiresAt: offer.expiresAt, createdAt: this.now(), state: 'issued', requests: {} }
    })
    return inviteSummary(invite, this.now())
  }

  /** Hub: verifies an offer from a replica machine against the current records before storing it. */
  async registerRemote(project, access, offer, secret) {
    const membership = await this.client.membership(project.id)
    const machine = membership.machines.find(entry => entry.id === access.machineId)
    const refusal = offerRefusal(offer, machine?.publicKey)
    requireValue(!refusal, refusal, 'FORBIDDEN')
    requireValue(access.humanAllowed, 'Human authority required', 'FORBIDDEN')
    const denied = issueRefusal(membership, access.machineId, offer)
    requireValue(!denied, ...(denied ?? []))
    requireValue(offer.routes.includes(this.enrollUrl()), 'The offer does not name this hub', 'FORBIDDEN')
    return { invite: this.register(project, access.machineId, offer, secret) }
  }

  /**
   * Hub: offers a viewer may see, newest first, one page at a time. The owner and admins see every offer; others see
   * their own person’s. `total` counts them all and `nextOffset` is null on the last page.
   */
  async listFor(project, viewer, { limit = INVITE_PAGE_DEFAULT, offset = 0 } = {}) {
    const size = Math.min(INVITE_PAGE_LIMIT, Math.max(1, Number.parseInt(limit, 10) || INVITE_PAGE_DEFAULT))
    const start = Math.max(0, Number.parseInt(offset, 10) || 0)
    const membership = await this.client.membership(project.id)
    const visible = Object.values(this.registry.read().invites).filter(invite => invite.projectId === project.id && this.mayManage(viewer, invite))
      .map(invite => inviteSummary(invite, this.now(), membership)).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    const invites = visible.slice(start, start + size)
    return { invites, total: visible.length, offset: start, nextOffset: start + invites.length < visible.length ? start + invites.length : null }
  }

  mayManage(viewer, invite) {
    return ['owner', 'admin'].includes(viewer.role) || viewer.machineIds.includes(invite.issuerId) || invite.offer.personId === viewer.personId
  }

  revokeFor(project, viewer, inviteId) {
    const invite = this.registry.update(state => {
      const invite = state.invites[inviteId]
      requireValue(invite?.projectId === project.id, 'Invitation not found', 'NOT_FOUND')
      requireValue(this.mayManage(viewer, invite), 'Invitation is owned by another person', 'FORBIDDEN')
      // An approval is the decision point: once one is being recorded, the invitation belongs to it.
      requireValue(!invite.approving, 'This invitation is already being used by an approved request', 'REQUEST_CLOSED')
      if (invite.state === 'issued') Object.assign(invite, { state: 'revoked', revokedAt: this.now(), revokedBy: viewer.personId })
      for (const request of Object.values(invite.requests ?? {})) if (request.state === 'pending') Object.assign(request, { state: 'rejected', reason: 'The invitation was revoked' })
      return invite
    })
    return { invite: inviteSummary(invite, this.now()) }
  }

  // ---- The enrollment point (hub, unauthenticated except by the invitation) ----

  /** Marks pending requests past their expiry as expired. Runs inside a registry transaction. */
  expire(invite, now = this.now()) {
    for (const request of Object.values(invite.requests ?? {})) {
      if (overdue(invite, request, now)) Object.assign(request, { state: 'expired', reason: 'The request expired before it was approved' })
    }
  }

  /** Expires overdue requests of `projectId`, writing the registry only when one is overdue: joiners and approvers poll. */
  expireProject(projectId, now = this.now()) {
    const due = invite => invite.projectId === projectId && Object.values(invite.requests ?? {}).some(request => overdue(invite, request, now))
    if (Object.values(this.registry.read().invites).some(due)) {
      this.registry.update(state => { for (const invite of Object.values(state.invites)) if (due(invite)) this.expire(invite, now) })
    }
  }

  /**
   * Stores a new machine's join request before anything else happens. A request
   * that cannot succeed (a removed machine or person, an existing member) is
   * refused before it takes a slot, so the invitation stays usable.
   */
  async request({ request, mac, records, recipientProof } = {}) {
    requireValue(request && typeof request.offerId === 'string', 'Invalid invitation', 'AUTH_REQUIRED')
    const found = this.registry.read().invites[request.offerId]
    requireValue(found && macMatches(found.secret, request, mac), 'Invalid invitation', 'AUTH_REQUIRED')
    requireValue(typeof recipientProof === 'string' && recipientProof.length >= 40 && recipientProof.length <= 128, 'Recipient proof required', 'AUTH_REQUIRED')
    const refusal = joinRequestRefusal(request, found.offer)
    requireValue(!refusal, refusal, 'INVALID_ARGUMENT')
    requireValue(Array.isArray(records) && records.length === 1, 'A join request carries its setup agent’s label', 'INVALID_ARGUMENT')
    const recordRefusal = requestRecordRefusal(records[0], request)
    requireValue(!recordRefusal, recordRefusal, 'INVALID_ARGUMENT')
    const requestId = `join-${hash(canonical([found.id, request.machineId])).slice(0, 32)}`
    const prior = found.requests?.[requestId]
    if (prior) {
      requireValue(canonical(prior.request) === canonical(request) && prior.proofHash === hash(recipientProof),
        'This machine already sent a different request for this invitation', 'INVITE_USED')
      return this.requestStatus(found.id, requestId, recipientProof)
    }
    requireValue(!STATE_REFUSALS[found.state], ...(STATE_REFUSALS[found.state] ?? []))
    requireValue(found.expiresAt > this.now(), 'This invitation expired. Ask for a new one.', 'INVITE_EXPIRED')
    const membership = await this.client.membership(found.projectId)
    requireValue(isMember(membership, found.offer.signer), 'The person who issued this invitation is no longer a member. Ask for a new invitation.', 'REVOKED')
    const conflict = admissionRefusal(membership, request)
    requireValue(!conflict, ...(conflict ?? []))
    const now = this.now()
    this.registry.update(state => {
      const invite = state.invites[found.id]
      this.expire(invite, now)
      requireValue(!STATE_REFUSALS[invite.state], ...(STATE_REFUSALS[invite.state] ?? []))
      const requests = Object.values(invite.requests ??= {})
      requireValue(requests.filter(entry => entry.state === 'pending').length < PENDING_LIMIT,
        `This invitation already has ${PENDING_LIMIT} requests waiting for approval. Ask the approver to approve or reject them, or ask for a new invitation.`, 'TOO_MANY_REQUESTS')
      requireValue(requests.length < REQUEST_LIMIT, 'This invitation has had too many requests. Ask for a new one.', 'TOO_MANY_REQUESTS')
      invite.requests[requestId] = { id: requestId, offerId: invite.id, state: 'pending', request, records, proofHash: hash(recipientProof),
        createdAt: now, expiresAt: Math.min(now + REQUEST_TTL_MS, invite.expiresAt) }
    })
    return this.requestStatus(found.id, requestId, recipientProof)
  }

  /** The joiner's view of its request: its state, the approver's nonce once added, and its receipt once approved. */
  requestStatus(offerId, requestId, recipientProof) {
    const found = this.registry.read().invites[offerId]?.requests?.[requestId]
    requireValue(found && typeof recipientProof === 'string' && found.proofHash === hash(recipientProof), 'Join request not found', 'AUTH_REQUIRED')
    this.expireProject(this.registry.read().invites[offerId].projectId)
    const invite = this.registry.read().invites[offerId], entry = invite.requests[requestId]
    const view = { requestId, offerId, state: entry.state === 'approving' ? 'pending' : entry.state, expiresAt: entry.expiresAt, nonce: entry.nonce ?? null,
      ...(entry.reason ? { reason: entry.reason } : {}) }
    if (entry.state !== 'approved') return view
    const project = this.client.project(invite.projectId)
    const admission = project.admissions[entry.admissionId]
    requireValue(admission?.state === 'active', 'This machine’s admission was revoked', 'REVOKED')
    return { ...view, receipt: this.receipt(project, invite, admission) }
  }

  receipt(project, invite, admission) {
    const gateway = this.client.gatewayUrl
    return { version: 1, projectId: project.id, name: project.name, identity: admission.identity, agent: admission.agent, device: admission.device,
      machineId: admission.machineId, actorId: invite.purpose === 'agent' ? actorId(admission.identity.id, admission.agent.harnessId) : actorId(admission.identity.id),
      humanAllowed: invite.purpose !== 'agent', admissionId: admission.id, deviceToken: admission.deviceToken, replicaToken: admission.replicaToken,
      people: project.people, hubUrl: `${gateway}/pardner/client/v1/replica/${project.id}`,
      hubWsUrl: `${gateway.replace(/^http/, 'ws')}/pardner/client/v1/replica/${project.id}/native` }
  }

  /**
   * Hub: an Agent invitation used on a machine already in the project. No approval is needed: the machine names
   * the agent itself, the invitation's secret proves it was offered, and the label enters through the gate.
   */
  async redeemAgent(project, machineId, { offerId, secret, record, agent } = {}) {
    const invite = this.registry.read().invites[offerId]
    requireValue(invite?.projectId === project.id && invite.purpose === 'agent' && typeof secret === 'string' && hash(invite.secret) === hash(secret),
      'Invalid invitation', 'AUTH_REQUIRED')
    const access = machineAccess(await this.client.membership(project.id), machineId)
    requireValue(access, 'This machine was removed from the project', 'REVOKED')
    requireValue(access.personId === invite.offer.personId, 'This Agent invitation is for another person’s agents', 'IDENTITY_MISMATCH')
    const reported = setupAgent(agent)
    requireValue(record?.kind === 'agent.name' && record.signer === machineId && record.machineId === machineId && record.harness === reported.harnessId
      && record.displayName === reported.name && record.subject === actorId(access.personId, reported.harnessId), 'The agent label does not match this invitation', 'INVALID_ARGUMENT')
    const now = this.now()
    this.registry.update(state => {
      const current = state.invites[offerId]
      if (current.redeemedBy === record.recordId) return
      requireValue(!STATE_REFUSALS[current.state], ...(STATE_REFUSALS[current.state] ?? []))
      requireValue(current.expiresAt > now, 'This invitation expired. Ask for a new one.', 'INVITE_EXPIRED')
      Object.assign(current, { state: 'redeemed', redeemedBy: record.recordId, redeemedAt: now })
    })
    try {
      await this.client.gate(project, [record])
    } catch (error) {
      if (error.code === 'RECORD_REFUSED') this.registry.update(state => { Object.assign(state.invites[offerId], { state: 'issued' }); delete state.invites[offerId].redeemedBy })
      throw error
    }
    const human = Object.values(project.people).find(actor => actor.kind === 'human' && actor.humanId === access.personId)
    const identity = { id: access.personId, name: human?.gitIdentity?.name ?? human?.displayName, email: human?.gitIdentity?.email }
    const admission = Object.values(project.admissions).find(entry => entry.machineId === machineId && entry.state === 'active')
    const device = admission?.device ?? { ...this.registry.read().device, machineId }
    for (const person of actorsFor(identity, device, reported)) await this.client.registerActor(project, person)
    return { people: this.client.project(project.id).people, actorId: actorId(access.personId, reported.harnessId) }
  }

  // ---- Approval (hub; the approving machine signs) ----

  /** The draft record an approver's machine would sign for `entry`; mayAuthor judges it before signing. */
  draft(invite, entry, signer) {
    const { request } = entry
    const approval = { requestId: entry.id, nonce: entry.nonce ?? null }
    return invite.purpose === 'human'
      ? { projectId: invite.projectId, kind: 'member.add', subject: request.personId, role: invite.offer.role, displayName: request.profile.name,
        machineId: request.machineId, publicKey: request.publicKey, offer: invite.offer, joinRequest: request, approval, ...(signer ? { signer } : {}) }
      : { projectId: invite.projectId, kind: 'machine.add', subject: request.machineId, personId: request.personId, publicKey: request.publicKey,
        ...(invite.purpose === 'agent' ? { agentsOnly: true } : {}), offer: invite.offer, joinRequest: request, approval, ...(signer ? { signer } : {}) }
  }

  findRequest(project, requestId) {
    const invite = Object.values(this.registry.read().invites).find(invite => invite.projectId === project.id && invite.requests?.[requestId])
    requireValue(invite, 'Join request not found', 'NOT_FOUND')
    return { invite, entry: invite.requests[requestId] }
  }

  /** Hub: requests `machineId` may approve, with what an approver needs to compare the code. */
  async pendingFor(project, machineId) {
    const membership = await this.client.membership(project.id)
    this.expireProject(project.id)
    const people = Object.values(project.people)
    const requests = []
    for (const invite of Object.values(this.registry.read().invites)) {
      if (invite.projectId !== project.id) continue
      for (const entry of Object.values(invite.requests ?? {})) {
        if (!['pending', 'approving'].includes(entry.state) || !mayAuthor(membership, this.draft(invite, entry, machineId))) continue
        const { request } = entry
        const person = request.purpose === 'human' ? { id: request.personId, name: request.profile.name, email: request.profile.email }
          : { id: request.personId, name: membership.people.find(p => p.id === request.personId)?.displayName ?? request.personId,
            email: people.find(actor => actor.kind === 'human' && actor.humanId === request.personId)?.gitIdentity?.email ?? null }
        const duplicates = request.purpose !== 'human' ? [] : membership.people.filter(member => {
          const actor = people.find(entry => entry.kind === 'human' && entry.humanId === member.id)
          return member.displayName.trim().toLowerCase() === request.profile.name.toLowerCase()
            || (actor?.gitIdentity?.email && actor.gitIdentity.email.toLowerCase() === request.profile.email.toLowerCase())
        }).map(member => ({ personId: member.id, name: member.displayName }))
        requests.push({ id: entry.id, offerId: invite.id, purpose: invite.purpose, ...(invite.offer.role ? { role: invite.offer.role } : {}),
          state: 'pending', createdAt: entry.createdAt, expiresAt: entry.expiresAt, nonce: entry.nonce ?? null,
          offer: invite.offer, machineId: request.machineId, publicKey: request.publicKey, joinRequest: request,
          device: request.device, agent: request.agent, person, ...(duplicates.length ? { possibleDuplicates: duplicates } : {}) })
      }
    }
    return { requests: requests.sort((a, b) => a.createdAt - b.createdAt) }
  }

  authorize(project, membership, machineId, requestId) {
    const { invite, entry } = this.findRequest(project, requestId)
    requireValue(mayAuthor(membership, this.draft(invite, entry, machineId)), 'This machine may not approve that request', 'FORBIDDEN')
    return { invite, entry }
  }

  /** The code a stored request shows. Tests replace it on one instance to force two requests onto one code. */
  codeFor(offer, entry) { return confirmationCode(offer, entry.request.publicKey, entry.nonce) }

  /**
   * Hub: fixes the approver's nonce once. If two pending requests on one offer
   * now show the same code, both are rejected.
   */
  async setNonce(project, machineId, requestId, nonce) {
    requireNonce(nonce)
    this.authorize(project, await this.client.membership(project.id), machineId, requestId)
    const now = this.now()
    // Settle the expiry and any collision in one transaction, then report; a throw inside would roll the rejections back.
    const outcome = this.registry.update(state => {
      const invite = Object.values(state.invites).find(invite => invite.projectId === project.id && invite.requests?.[requestId])
      this.expire(invite, now)
      const entry = invite.requests[requestId]
      if (entry.state !== 'pending' && entry.state !== 'approving') return { closed: entry.reason ?? 'This request is no longer pending' }
      entry.nonce ??= nonce
      const pending = Object.values(invite.requests).filter(request => request.state === 'pending' && request.nonce)
      const colliding = collidingCodes(pending.map(request => ({ id: request.id, code: this.codeFor(invite.offer, request) })))
      for (const id of colliding) Object.assign(invite.requests[id], { state: 'rejected', reason: 'Two requests on this invitation showed the same confirmation code, so both were rejected. Ask for a new invitation.' })
      return colliding.has(requestId) ? { collision: invite.requests[requestId].reason } : { nonce: entry.nonce }
    })
    requireValue(!outcome.closed, outcome.closed, 'REQUEST_CLOSED')
    requireValue(!outcome.collision, outcome.collision, 'CODE_COLLISION')
    return outcome
  }

  /**
   * Hub: records an approval signed by `machineId`. The record must hold this
   * offer, this request and the stored nonce. Expiry and single use are checked
   * here; the record then enters through the gate, and the machine's bearer
   * admission is created only after the gate has saved it.
   */
  async approve(project, machineId, requestId, record) {
    const membership = await this.client.membership(project.id)
    const { invite, entry } = this.authorize(project, membership, machineId, requestId)
    if (entry.state === 'approved') {
      requireValue(entry.recordId === record?.recordId, 'This request was already approved', 'INVITE_USED')
      return this.approved(project, invite.id, requestId)
    }
    const now = this.now()
    this.registry.update(state => {
      const current = state.invites[invite.id], request = current.requests[requestId]
      if (request.state !== 'approving') this.expire(current, now)
      requireValue(['pending', 'approving'].includes(request.state), request.reason ?? 'This request is no longer pending', request.state === 'expired' ? 'REQUEST_EXPIRED' : 'REQUEST_CLOSED')
      requireValue(request.state === 'approving' || current.state === 'issued', ...(STATE_REFUSALS[current.state] ?? ['This invitation expired', 'INVITE_EXPIRED']))
      requireValue(request.state === 'approving' || current.expiresAt > now, 'This invitation expired before the request was approved', 'INVITE_EXPIRED')
      requireValue(!current.approving || current.approving === requestId, 'Another request on this invitation is being approved', 'INVITE_USED')
      const conflict = request.state === 'pending' && admissionRefusal(membership, request.request)
      requireValue(!conflict, ...(conflict || []))
      requireValue(request.nonce, 'Show the confirmation code before approving', 'CODE_REQUIRED')
      const expected = buildFields(this.draft(current, request))
      requireValue(record?.signer === machineId && canonical(buildFields(record)) === canonical(expected),
        'The approval does not match this request, its invitation and its confirmation code', 'INVALID_ARGUMENT')
      requireValue(request.state === 'pending' || request.recordId === record.recordId, 'Another approval of this request is in progress', 'INVITE_USED')
      current.approving = requestId
      Object.assign(request, { state: 'approving', recordId: record.recordId })
    })
    try {
      await this.client.gate(project, [record, ...entry.records])
    } catch (error) {
      // A refusal is a decision: release the reservation. Any other failure keeps it, so only this approval can finish.
      if (error.code === 'RECORD_REFUSED') this.registry.update(state => {
        const current = state.invites[invite.id]
        delete current.approving
        Object.assign(current.requests[requestId], { state: 'pending' })
        delete current.requests[requestId].recordId
      })
      throw error
    }
    return this.complete(project, invite.id, requestId)
  }

  /** Creates the bearer admission for an approved machine, registers its Actors, and closes the offer. Idempotent. */
  async complete(project, offerId, requestId) {
    const { request } = this.findRequest(project, requestId).entry
    const human = Object.values(project.people).find(actor => actor.kind === 'human' && actor.humanId === request.personId)
    const identity = request.purpose === 'human' ? { id: request.personId, ...request.profile }
      : { id: request.personId, name: human?.gitIdentity?.name ?? human?.displayName, email: human?.gitIdentity?.email }
    const device = { ...request.device, machineId: request.machineId }
    const admission = this.registry.update(state => {
      const p = state.projects[project.key]
      const existing = Object.values(p.admissions).find(value => value.requestId === requestId)
      if (existing) return existing
      const id = randomUUID()
      return p.admissions[id] = { id, inviteId: offerId, requestId, machineId: request.machineId, device, identity, agent: request.agent,
        deviceToken: newToken(), replicaToken: newToken(), state: 'pending' }
    })
    for (const person of actorsFor(identity, device, request.agent)) await this.client.registerActor(project, person)
    this.registry.update(state => {
      const current = state.invites[offerId]
      state.projects[project.key].admissions[admission.id].state = 'active'
      Object.assign(current.requests[requestId], { state: 'approved', admissionId: admission.id, approvedAt: this.now() })
      delete current.approving
      current.state = 'redeemed'
      for (const other of Object.values(current.requests)) if (other.state === 'pending') Object.assign(other, { state: 'rejected', reason: 'The invitation was used by another request' })
    })
    return this.approved(project, offerId, requestId)
  }

  approved(project, offerId, requestId) {
    const entry = this.registry.read().invites[offerId].requests[requestId]
    return { request: { id: requestId, state: entry.state, recordId: entry.recordId } }
  }

  async reject(project, machineId, requestId) {
    this.authorize(project, await this.client.membership(project.id), machineId, requestId)
    return this.registry.update(state => {
      const invite = Object.values(state.invites).find(invite => invite.projectId === project.id && invite.requests?.[requestId])
      const entry = invite.requests[requestId]
      requireValue(entry.state !== 'approving' && entry.state !== 'approved', 'This request is already being approved', 'REQUEST_CLOSED')
      if (entry.state === 'pending') Object.assign(entry, { state: 'rejected', reason: 'The approver rejected this request' })
      return { request: { id: requestId, state: entry.state } }
    })
  }

  // ---- The approver's client (hub or replica) ----

  async approverRequests(project) {
    const { requests } = project.role === 'hub' ? await this.pendingFor(project, this.registry.machineKey.machineId)
      : await remoteJson(`${project.hubUrl}/join-requests`, { action: 'list' }, project.deviceToken)
    return { requests: requests.map(entry => publicRequest(entry)) }
  }

  /** Adds this approver's nonce if none is fixed yet, then derives the code locally from the offer and the joiner's key. */
  async revealCode(project, requestId) {
    const { requests } = project.role === 'hub' ? await this.pendingFor(project, this.registry.machineKey.machineId)
      : await remoteJson(`${project.hubUrl}/join-requests`, { action: 'list' }, project.deviceToken)
    const entry = requests.find(request => request.id === requestId)
    requireValue(entry, 'Join request not found, or no longer pending', 'NOT_FOUND')
    const nonce = entry.nonce ?? newNonce()
    const fixed = project.role === 'hub' ? await this.setNonce(project, this.registry.machineKey.machineId, requestId, nonce)
      : await remoteJson(`${project.hubUrl}/join-requests`, { action: 'nonce', requestId, nonce }, project.deviceToken)
    return { request: publicRequest({ ...entry, nonce: fixed.nonce }) }
  }

  /** Signs the approval with this machine's key after the approver confirms the code both screens show. */
  async approveRequest(project, requestId, code) {
    const { requests } = project.role === 'hub' ? await this.pendingFor(project, this.registry.machineKey.machineId)
      : await remoteJson(`${project.hubUrl}/join-requests`, { action: 'list' }, project.deviceToken)
    const entry = requests.find(request => request.id === requestId)
    requireValue(entry, 'Join request not found, or no longer pending', 'NOT_FOUND')
    requireValue(entry.nonce, 'Show the confirmation code before approving', 'CODE_REQUIRED')
    requireValue(sameCode(code, confirmationCode(entry.offer, entry.publicKey, entry.nonce)),
      'That code does not match this request. Do not approve: ask the person to read the code on their screen again, or reject the request.', 'CODE_MISMATCH')
    const invite = { projectId: project.id, purpose: entry.purpose, offer: entry.offer }
    const record = buildRecord(this.registry.machineKey, this.draft(invite, { id: entry.id, nonce: entry.nonce, request: entry.joinRequest }))
    return project.role === 'hub' ? this.approve(project, this.registry.machineKey.machineId, requestId, record)
      : remoteJson(`${project.hubUrl}/join-requests`, { action: 'approve', requestId, record }, project.deviceToken, 15000)
  }

  async rejectRequest(project, requestId) {
    return project.role === 'hub' ? this.reject(project, this.registry.machineKey.machineId, requestId)
      : remoteJson(`${project.hubUrl}/join-requests`, { action: 'reject', requestId }, project.deviceToken)
  }
}

const overdue = (invite, request, now) => request.state === 'pending' && (request.expiresAt <= now || invite.expiresAt <= now)

/** Display fields and current code for an approver. The offer and joiner key stay so the approver's client derives the code itself. */
function publicRequest(entry) {
  const { offer, publicKey, nonce, joinRequest, ...rest } = entry
  return { ...rest, code: nonce ? confirmationCode(offer, publicKey, nonce) : null }
}

/** A record's signed fields, for comparing an approval with the draft it must match. */
function buildFields(record) {
  const { v, signer, signature, recordId, ...fields } = record ?? {}
  return fields
}

/** Who a machine invitation links to, shown to the joiner before it sends a request (#155). */
function personPreview(project, personId) {
  const actor = Object.values(project.people).find(entry => entry.kind === 'human' && entry.humanId === personId)
  return { id: personId, name: actor?.gitIdentity?.name ?? actor?.displayName ?? personId, ...(actor?.gitIdentity?.email ? { email: actor.gitIdentity.email } : {}) }
}

/**
 * Why a join request cannot lead to an admission under `membership`, as [message, code], or null. Checked when the
 * request arrives, so a join that cannot succeed never takes a slot (#153), and again when it is approved.
 */
function admissionRefusal(membership, request) {
  if (membership.removedMachines.includes(request.machineId)) return ['This computer’s machine was removed from the project, and removals are permanent for a machine. '
    + 'Start a fresh client directory (--data DIR) on this computer and join from there.', 'MACHINE_REMOVED']
  if (isMember(membership, request.machineId)) return ['This computer is already a member of the project', 'ALREADY_MEMBER']
  if (request.purpose !== 'human') return membership.people.some(person => person.id === request.personId) ? null : ['The person this invitation links to is no longer a member', 'REVOKED']
  if (membership.removedPeople.includes(request.personId)) return ['You were removed from this project, and removals are permanent for a person. '
    + 'To join again as a new person, start a fresh client directory (--data DIR) and use a new Human invitation.', 'PERSON_REMOVED']
  if (membership.people.some(person => person.id === request.personId)) return ['You are already a member of this project. '
    + 'To add this computer, pair it with a My device invitation from one of your machines.', 'ALREADY_MEMBER']
  return null
}

/** Why `machineId` may not issue this offer under `membership`, as [message, code], or null. */
function issueRefusal(membership, machineId, { purpose, role, personId }) {
  const signer = membership.people.find(person => person.id === membership.machines.find(machine => machine.id === machineId)?.personId)
  if (!signer) return ['This machine is no longer a member of the project', 'REVOKED']
  if (purpose === 'human') {
    if (!['owner', 'admin'].includes(signer.role)) return ['Only the owner or an admin can invite people. Ask an admin, or pair another of your own machines with My device.', 'FORBIDDEN']
    if (signer.role !== 'owner' && role !== 'member') return ['An admin can offer only the member role', 'FORBIDDEN']
    return null
  }
  if (!membership.people.some(person => person.id === personId)) return ['That person is not a current member of this project', 'NOT_FOUND']
  if (purpose === 'agent' && personId !== signer.id) return ['Agent invitations are for your own agents', 'FORBIDDEN']
  if (!mayAuthor(membership, { kind: 'machine.add', signer: machineId, personId })) return ['Only that person, the owner or an admin can pair a machine into their identity', 'FORBIDDEN']
  return null
}
