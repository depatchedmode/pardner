import { randomUUID } from 'node:crypto'
import { actorId, actorsFor, enrolledDevice, fingerprint, hash, profile, secret, setupAgent } from './client-identity.js'
import { requireValue } from './workspace-schema.js'
import { remoteJson } from './client-projects.js'
import { invitationEnvelope, invitationPrompt } from './onboarding-invitation.js'

// Human and My device invitations are redeemed by another client, normally on another computer. Without
// --public-url their endpoint is this client's own loopback listener, which no other computer can reach, so
// they are refused at issue time. Agent invitations stay available for an agent on this computer, and an
// explicit --public-url (even a loopback relay or test gate) is the operator's chosen route and is trusted.
const ANOTHER_COMPUTER = ['human', 'device']
const PUBLIC_URL_FIX = '`pardner client serve --public-url <https origin>`'

function invitationRouteRequired(publicUrl, purpose, endpoint, { remote = false } = {}) {
  if (publicUrl || !ANOTHER_COMPUTER.includes(purpose)) return
  const label = purpose === 'device' ? 'My device' : 'Human'
  const message = remote
    ? `A ${label} invitation is used on another computer, but this project's hub (the computer that started the project, where its invitations are issued) has no public address, so the invitation would point to ${new URL(endpoint).origin}, which only the hub's computer can reach. Restart the hub's client with ${PUBLIC_URL_FIX}, then create the invitation again.`
    : `A ${label} invitation is used on another computer, but this client has no public address, so the invitation would point to ${new URL(endpoint).origin}, which only this computer can reach. Restart this client with ${PUBLIC_URL_FIX}, then create the invitation again.`
  throw Object.assign(new Error(message), { code: 'PUBLIC_URL_REQUIRED', details: { purpose, endpoint } })
}

export function invitationData(invitation) {
  try {
    const envelope = invitationEnvelope(invitation)
    const value = JSON.parse(Buffer.from(envelope.slice('pardner-invite-v1.'.length), 'base64url').toString())
    const url = new URL(value.endpoint)
    requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Invalid invitation endpoint')
    requireValue(url.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Remote invitations require HTTPS; use a secure private route')
    requireValue(['human', 'agent', 'device'].includes(value.purpose) && typeof value.secret === 'string' && typeof value.id === 'string' && typeof value.projectId === 'string', 'Incomplete invitation')
    return value
  } catch (error) { throw Object.assign(new Error(error.code ? error.message : 'Invalid invitation'), { code: 'INVALID_INVITATION' }) }
}
export function inviteSummary(invite, now = Date.now()) {
  return { id: invite.id, purpose: invite.purpose, projectId: invite.projectId, projectName: invite.projectName,
    expiresAt: invite.expiresAt, state: invite.state === 'issued' && invite.expiresAt <= now ? 'expired' : invite.state }
}
export class ClientInvites {
  constructor(client) { this.client = client; this.registry = client.registry }
  async issue(project, principal, input) {
    this.client.human(principal)
    const binding = this.client.binding(project, principal)
    requireValue(project.people[binding.actorId].kind === 'human', 'Human authority required', 'FORBIDDEN')
    if (project.role === 'replica') return remoteJson(`${project.hubUrl}/invites`, { action: 'issue', input }, project.deviceToken)
    return this.issueFor(project, this.registry.read().identity, input)
  }
  async issueFor(project, sponsor, input, options) {
    requireValue(['human', 'agent', 'device'].includes(input.purpose), 'Choose Human, Agent or My device')
    invitationRouteRequired(this.client.options.publicUrl, input.purpose, this.enrollUrl(), options)
    const result = await this.registry.attempt(`invite:${sponsor.id}:${project.id}`, input.operationId, { purpose: input.purpose }, async attempt => {
      const invite = this.registry.read().invites[attempt.id] ?? { id: attempt.id, projectId: project.id, projectName: project.name, purpose: input.purpose,
        sponsor, secret: attempt.proof, expiresAt: Date.now() + 86400000, state: 'issued' }
      const invitation = `pardner-invite-v1.${Buffer.from(JSON.stringify({ id: invite.id, projectId: project.id,
        purpose: invite.purpose, endpoint: this.enrollUrl(), secret: invite.secret })).toString('base64url')}`
      this.registry.update(state => { state.invites[invite.id] = invite })
      return { invite: inviteSummary(invite), invitation }
    })
    const invite = this.registry.read().invites[result.invite.id]
    requireValue(invite.state !== 'revoked', 'Invitation revoked', 'REVOKED')
    return { ...result, invite: inviteSummary(invite), setupPrompt: invitationPrompt({
      projectName: invite.projectName, purpose: invite.purpose, invitation: result.invitation,
    }) }
  }
  enrollUrl() { return `${this.client.gatewayUrl}/pardner/client/v1/enroll` }
  listFor(project, humanId) {
    return { invites: Object.values(this.registry.read().invites).filter(invite => invite.projectId === project.id &&
      (invite.sponsor.id === humanId || project.creatorId === humanId)).map(invite => inviteSummary(invite)) }
  }
  revokeFor(project, humanId, inviteId) {
    const invite = this.registry.update(state => {
      const invite = state.invites[inviteId]
      requireValue(invite?.projectId === project.id, 'Invitation not found', 'NOT_FOUND')
      requireValue(invite.sponsor.id === humanId || project.creatorId === humanId, 'Invitation is owned by another human', 'FORBIDDEN')
      invite.state = 'revoked'; return invite
    })
    return { invite: inviteSummary(invite) }
  }
  async redeem(input) {
    const { inviteId, invitationSecret, recipientProof, operationId } = input
    requireValue(typeof recipientProof === 'string' && recipientProof.length >= 40 && typeof invitationSecret === 'string', 'Recipient proof required', 'AUTH_REQUIRED')
    const invite = this.registry.read().invites[inviteId]
    requireValue(invite && hash(invite.secret) === hash(invitationSecret), 'Invalid invitation', 'AUTH_REQUIRED')
    requireValue(invite.state !== 'revoked', 'Invitation revoked', 'REVOKED')
    const existingAdmission = Object.values(this.client.project(invite.projectId).admissions).find(a => a.inviteId === inviteId)
    requireValue(existingAdmission?.state !== 'revoked', 'Device admission revoked', 'REVOKED')
    const proofHash = hash(recipientProof)
    requireValue(!invite.recipient || invite.recipient === proofHash, 'Invitation belongs to a different recipient', 'INVITE_USED')
    requireValue(invite.recipient || invite.expiresAt > Date.now(), 'Invitation expired', 'INVITE_EXPIRED')
    const digest = fingerprint({ operationId, device: input.device, identity: input.identity, agent: input.agent })
    return this.registry.attempt(`redeem:${inviteId}`, operationId, { proofHash, digest }, async () => {
      const project = this.client.project(invite.projectId)
      const sponsor = invite.sponsor
      const reserved = Object.values(project.admissions).find(a => a.inviteId === inviteId)
      // Validate the recipient before binding, so a rejected attempt leaves the invitation usable by its intended recipient.
      let identity
      if (invite.purpose === 'human') {
        requireValue(typeof input.identity?.id === 'string' && /^[a-f0-9-]{36}$/.test(input.identity.id), 'Recipient identity required')
        requireValue(reserved || !Object.values(project.people).some(person => person.humanId === input.identity.id), 'Existing human identity requires My device proof', 'IDENTITY_MISMATCH')
        identity = { id: input.identity.id, ...profile(input.identity) }
      } else {
        requireValue(!input.identity || input.identity.id === sponsor.id, 'Destination already belongs to another identity', 'IDENTITY_MISMATCH')
        identity = sponsor
      }
      const device = enrolledDevice(input.device)
      const agent = setupAgent(input.agent)
      const people = actorsFor(identity, device, agent)
      // Bind the recipient and reserve the admission in one transaction.
      const admission = this.registry.update(state => {
        const current = state.invites[inviteId]
        requireValue(current.state !== 'revoked', 'Invitation revoked', 'REVOKED')
        requireValue(!current.recipient || current.recipient === proofHash, 'Invitation belongs to a different recipient', 'INVITE_USED')
        requireValue(!current.recipient || current.fingerprint === digest, 'Invitation retry changed recipient or input', 'OPERATION_ID_REUSED')
        current.recipient = proofHash; current.fingerprint = digest
        const p = state.projects[project.key]
        const existing = Object.values(p.admissions).find(a => a.inviteId === inviteId)
        if (existing) return existing
        if (invite.purpose === 'human') requireValue(!Object.values(p.people).some(person => person.humanId === identity.id) &&
          !Object.values(p.admissions).some(value => value.identity.id === identity.id), 'Existing identity requires device-link proof', 'IDENTITY_MISMATCH')
        requireValue(!Object.values(p.admissions).some(value => value.device.id === device.id && value.identity.id !== identity.id), 'Device belongs to another identity', 'IDENTITY_MISMATCH')
        const record = { id: randomUUID(), inviteId, device, identity, agent, actorIds: invite.purpose === 'agent' ? [actorId(identity.id, agent.harnessId)] : people.map(p => p.id),
          humanAllowed: invite.purpose !== 'agent', deviceToken: secret(), replicaToken: secret(), state: 'pending' }
        p.admissions[record.id] = record
        return record
      })
      requireValue(admission.state !== 'revoked', 'Device admission revoked', 'REVOKED')
      for (const person of people) await this.client.registerActor(project, person)
      // A revocation that landed while Actors were registering must win over activation.
      this.registry.update(state => {
        const current = state.projects[project.key].admissions[admission.id]
        requireValue(state.invites[inviteId].state !== 'revoked' && current.state !== 'revoked', 'Invitation or device revoked during enrollment', 'REVOKED')
        current.state = 'active'; state.invites[inviteId].state = 'redeemed'
      })
      return { version: 1, projectId: project.id, name: project.name, identity, agent, device,
        actorId: invite.purpose === 'agent' ? actorId(identity.id, agent.harnessId) : actorId(identity.id),
        humanAllowed: admission.humanAllowed, admissionId: admission.id, deviceToken: admission.deviceToken,
        replicaToken: admission.replicaToken, people: this.client.project(project.id).people,
        hubUrl: `${this.client.gatewayUrl}/pardner/client/v1/replica/${project.id}`,
        hubWsUrl: `${this.client.gatewayUrl.replace(/^http/, 'ws')}/pardner/client/v1/replica/${project.id}/native` }
    })
  }
}
