import { setTimeout as delay } from 'node:timers/promises'
import { actorId, actorsFor, secret, setupAgent } from './client-identity.js'
import { invitationData, unreachableInvitation } from './client-invites.js'
import { agentNameRecord, buildJoinRequest, confirmationCode } from './enrollment.js'
import { buildRecord } from './membership.js'
import { machineAccess } from './enrollment.js'
import { personIdFor } from './machine-key.js'
import { requireValue } from './workspace-schema.js'

/**
 * A person's ID belongs to the machine they were first admitted with (docs/PARDNER-TRUST-DESIGN.md, section 2).
 * A computer paired into someone's identity holds that other machine's person ID, so it cannot be a person's
 * first machine: it can't start a project or join one as a new person.
 */
function requireFirstMachine(identity, key, action, instead) {
  requireValue(identity.id === personIdFor(key.publicKey),
    `This computer was linked to ${identity.name} through another of their machines, so it can’t ${action}: a person belongs to the machine they `
    + `first joined with. ${instead}, or use a fresh client directory (--data DIR).`, 'IDENTITY_MISMATCH')
}

/**
 * One HTTP request to another machine. It carries no bearer credential: requests between machines are signed by
 * the machine key (LocalClient.remote), and enrollment requests carry the invitation's proof in their body.
 */
export async function remoteJson(url, body, { headers = {}, timeoutMs = 3000 } = {}) {
  // Only an explicit application code from the hub is a hub decision. Network failures, gateway error pages,
  // non-JSON bodies and hub 5xx responses are outages, and enrolled replicas keep saving locally through them.
  const unavailable = details => Object.assign(new Error('Project authority unavailable; retry this attempt'), { code: 'HUB_UNAVAILABLE', details })
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error' }) }
  catch (error) { throw unavailable({ cause: error.message }) }
  let result = null
  try { result = await response.json() } catch { result = null }
  const coded = result && typeof result === 'object' && typeof result.code === 'string'
  if (response.status >= 500 || (!response.ok && !coded)) throw unavailable({ status: response.status, ...(coded ? { code: result.code } : {}) })
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Project request failed'), { code: result.code, details: result.details })
  requireValue(result && typeof result === 'object' && !Array.isArray(result), 'Project authority returned an unreadable response', 'HUB_UNAVAILABLE')
  return result
}
function runtimeEntry(key, name, role) {
  return { key, name, role, internalToken: secret(), internalSocketToken: secret(), people: {}, admissions: {}, state: 'starting' }
}
export async function createProject(client, principal, input) {
  client.human(principal)
  const { identity, device, setupAgent } = client.registry.read()
  requireValue(identity, 'Confirm your identity before creating a project', 'IDENTITY_REQUIRED')
  requireValue(typeof input.name === 'string' && input.name.trim() && input.name.length <= 200, 'Supply a project name')
  requireFirstMachine(identity, client.registry.machineKey, 'start a project', 'Start it from that machine and pair this one with a My device invitation')
  const key = await client.registry.attempt(`create:${client.registry.read().clientId}`, input.operationId, { name: input.name }, async (attempt, checkpoint) => {
    // The genesis is signed and saved once, before the runtime starts, so a retry derives the same project ID.
    // Its nonce keeps two projects by one person on one machine apart.
    const project = client.registry.update(state => state.projects[attempt.id] ??= {
      ...runtimeEntry(attempt.id, input.name.trim(), 'hub'), creatorId: identity.id,
      genesis: buildRecord(client.registry.machineKey, { kind: 'project.genesis', subject: identity.id, displayName: identity.name, nonce: secret() }),
      agentReporting: { [actorId(identity.id, setupAgent.harnessId)]: setupAgent },
      // The device names its machine, so members see which computer hosts the project.
      actorId: actorId(identity.id), humanAllowed: true, initialActors: actorsFor(identity, { ...device, machineId: client.registry.machineKey.machineId }, setupAgent) })
    const runtime = await client.runtime(project)
    // The setup agent runs on this machine, so naming it needs no ceremony; the label enters through the gate.
    await client.gate(project, [agentNameRecord(client.registry.machineKey, project.genesis.projectId, identity.id, setupAgent, identity.name)])
    client.registry.update(state => { const p = state.projects[project.key]; p.id = runtime.connection.workspaceId
      p.people = { ...Object.fromEntries(p.initialActors.map(actor => [actor.id, actor])), ...p.people }; p.state = 'ready' })
    checkpoint({ phase: 'ready' })
    return project.key
  })
  return { project: await client.projectView(client.registry.read().projects[key], principal),
    suggestion: 'Pair a second machine with a My device invitation. If you lose every machine you own, nobody can remove or demote admins.' }
}

/** A join that is waiting for approval: the joiner sees this state and, once the approver opens the request, its code. */
class JoinPending extends Error {
  constructor(join) { super('Waiting for approval'); this.code = 'JOIN_PENDING'; this.join = join }
}

function pendingState(invitation, status, request) {
  return new JoinPending({ state: status.nonce ? 'confirm' : 'waiting', requestId: status.requestId, projectId: invitation.projectId,
    projectName: invitation.projectName, purpose: invitation.purpose, ...(invitation.offer.role ? { role: invitation.offer.role } : {}),
    expiresAt: status.expiresAt, machineId: request.machineId,
    code: status.nonce ? confirmationCode(invitation.offer, request.publicKey, status.nonce) : null,
    ...(invitation.person ? { linkingAs: { name: invitation.person.name, ...(invitation.person.email ? { email: invitation.person.email } : {}) } } : {}) })
}

const CLOSED = {
  rejected: ['JOIN_REJECTED', 'The approver rejected this request'],
  expired: ['REQUEST_EXPIRED', 'This request expired before it was approved. Ask for a new invitation.'],
}

/**
 * Joins a project from an invitation. A new machine sends a join request and
 * waits: each call with the same operation ID reports the request's state
 * (`{ join }`, with the confirmation code once the approver has opened it)
 * until the approver signs its admission, then finishes enrollment
 * (`{ project }`). An Agent invitation used on a machine already in the
 * project needs no approval: the machine names the agent through the gate.
 */
export async function joinProject(client, principal, input) {
  requireValue(principal.kind === 'operator' || (principal.kind === 'human' && client.registry.read().humanAuthority !== false), 'Enrollment authority required', 'FORBIDDEN')
  const invitation = invitationData(input.invitation)
  if (input.agent !== undefined) requireValue(input.agent && typeof input.agent === 'object' && !Array.isArray(input.agent) &&
    Object.keys(input.agent).every(key => ['harnessId', 'name', 'model', 'managedBy'].includes(key)), 'Supply agent reporting metadata only')
  const agent = input.agent === undefined ? undefined : setupAgent({ harnessId: client.registry.read().setupAgent.harnessId, ...input.agent })
  const { offer } = invitation, key = client.registry.machineKey
  let result
  try {
    result = await client.registry.attempt(`join:${client.registry.read().clientId}`, input.operationId, { invitation: input.invitation, ...(agent ? { agent } : {}) }, async (attempt, checkpoint) => {
      const state = client.registry.read()
      const here = Object.values(state.projects).find(p => p.id === offer.projectId && p.enrollmentId !== attempt.id)
      if (here) return addAgentHere(client, here, invitation, agent ?? state.setupAgent)
      let receipt = attempt.receipt
      if (!receipt) {
        let recipient = attempt.recipient
        if (!recipient) {
          if (offer.purpose === 'human') {
            requireValue(state.identity, 'Confirm your identity before joining', 'IDENTITY_REQUIRED')
            requireFirstMachine(state.identity, key, 'join a project as a new person',
              'Join from that machine, then add this computer with a My device invitation')
          }
          // Pairing never creates a second person or replaces this client's own (#155, #156).
          else requireValue(!state.identity || state.identity.id === offer.personId,
            `This computer already has its own identity (${state.identity?.name}), so it can’t be linked as ${invitation.person?.name ?? 'another person'}. `
            + 'Link it from a fresh client directory (--data DIR), or use a Human invitation to join as yourself.', 'IDENTITY_MISMATCH')
          const personId = offer.purpose === 'human' ? state.identity.id : offer.personId
          const reported = agent ?? state.setupAgent
          const { request, mac } = buildJoinRequest(key, invitation.secret, { offer, personId, identity: state.identity, device: state.device, agent: reported })
          const owner = offer.purpose === 'human' ? state.identity.name : state.identity?.name ?? invitation.person?.name
          recipient = { request, mac, records: [agentNameRecord(key, offer.projectId, personId, reported, owner)], recipientProof: attempt.proof }
          checkpoint({ phase: 'requesting', recipient })
        }
        const status = attempt.requestId
          ? await remoteJson(invitation.endpoint, { action: 'status', offerId: offer.offerId, requestId: attempt.requestId, recipientProof: recipient.recipientProof }, { timeoutMs: 15000 })
          // A loopback endpoint nothing answers lives on the computer that created the invitation (#162).
          : await remoteJson(invitation.endpoint, { action: 'request', ...recipient }, { timeoutMs: 15000 }).catch(error => { throw unreachableInvitation(invitation, error) })
        if (!attempt.requestId) checkpoint({ phase: 'requested', requestId: status.requestId })
        if (CLOSED[status.state]) throw Object.assign(new Error(status.reason ?? CLOSED[status.state][1]), { code: CLOSED[status.state][0] })
        if (status.state !== 'approved') throw pendingState(invitation, status, recipient.request)
        receipt = status.receipt
        requireValue(receipt?.projectId === offer.projectId && receipt.version === 1 && receipt.machineId === key.machineId, 'Enrollment returned another project', 'WORKSPACE_MISMATCH')
        checkpoint({ phase: 'enrolled', receipt })
      }
      client.registry.update(state => {
        requireValue(!state.identity || state.identity.id === receipt.identity.id, 'This client belongs to another human', 'IDENTITY_MISMATCH')
        if (!state.identity && !receipt.humanAllowed) {
          state.humanAuthority = false
          for (const session of Object.values(state.sessions)) if (session.kind === 'human') session.revoked = true
        }
        if (receipt.humanAllowed) state.humanAuthority = true
        state.identity ??= receipt.identity
        // The hub is reached with this machine's key alone: the receipt names its routes and nothing to present there.
        state.projects[attempt.id] ??= { ...runtimeEntry(attempt.id, receipt.name, 'replica'), id: receipt.projectId,
          enrollmentId: attempt.id, actorId: receipt.actorId, humanAllowed: receipt.humanAllowed, people: receipt.people,
          agentReporting: { [actorId(receipt.identity.id, receipt.agent.harnessId)]: receipt.agent },
          hubUrl: receipt.hubUrl, hubWsUrl: receipt.hubWsUrl }
      })
      const project = client.registry.read().projects[attempt.id]
      await client.runtime(project)
      client.registry.update(state => { state.projects[attempt.id].state = 'ready' })
      checkpoint({ phase: 'ready' })
      return attempt.id
    })
  } catch (error) {
    if (error.code === 'JOIN_PENDING') return { join: error.join }
    throw error
  }
  return { project: await client.projectView(client.registry.read().projects[result], principal) }
}

/** An Agent invitation used on a machine that is already in the project: name the agent here, with no approval. */
async function addAgentHere(client, project, invitation, agent) {
  const removed = 'This machine was removed from the project, and removals are permanent for a machine. Start a fresh client directory (--data DIR) to join again.'
  // Ask the hub first, so a machine removed elsewhere gets accurate advice rather than "already a member" (#153).
  if (project.role === 'replica') {
    try { await client.remote(project, '/membership') } catch (error) {
      if (error.code === 'REVOKED') throw Object.assign(new Error(removed), { code: 'REVOKED' })
      if (error.code !== 'HUB_UNAVAILABLE') throw error
    }
  }
  requireValue(client.registry.read().projects[project.key].state !== 'revoked', removed, 'REVOKED')
  requireValue(invitation.purpose === 'agent', invitation.purpose === 'device' ? 'This computer is already linked to this project'
    : 'You are already a member of this project. To add another computer, pair it with a My device invitation.', 'ALREADY_MEMBER')
  const state = client.registry.read()
  requireValue(invitation.offer.personId === state.identity?.id, 'This Agent invitation is for another person’s agents', 'IDENTITY_MISMATCH')
  const given = setupAgent(agent)
  const id = actorId(state.identity.id, given.harnessId)
  // An agent this person already has keeps the name it joined with; a different given name is refused by the hub.
  const reported = { ...given, name: given.name ?? project.people[id]?.displayName ?? null }
  const record = agentNameRecord(client.registry.machineKey, project.id, state.identity.id, reported, state.identity.name)
  const body = { offerId: invitation.offer.offerId, secret: invitation.secret, record, agent: reported }
  const result = project.role === 'hub' ? await client.invites.redeemAgent(project, client.registry.machineKey.machineId, body)
    : await client.remote(project, '/agents', body, 15000)
  client.registry.update(state => {
    const p = state.projects[project.key]
    p.people = { ...p.people, ...result.people }
    p.agentReporting = { ...p.agentReporting, [id]: reported }
    // Naming the agent again restores it on this machine after a local revocation (#153).
    p.revokedActors = (p.revokedActors ?? []).filter(actor => actor !== id)
  })
  const runtime = await client.runtime(client.registry.read().projects[project.key])
  const deadline = Date.now() + 8000
  do {
    const { doc } = await runtime.request('/automerge/doc')
    const status = await runtime.request('/automerge/status')
    // Writes are checked against this machine's own records, so its copy must also hold the agent's label.
    const named = machineAccess(await runtime.request('/automerge/membership'), client.registry.machineKey.machineId)?.actorIds.includes(id)
    if (doc.actors[id] && status.savedLocally && named) return project.key
    await delay(50)
  } while (Date.now() < deadline)
  requireValue(false, 'Actor registration is not saved locally yet; retry this join', 'REGISTRATION_PENDING')
}
