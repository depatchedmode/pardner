import { setTimeout as delay } from 'node:timers/promises'
import { actorId, actorsFor, CLIENT_API, secret, setupAgent } from './client-identity.js'
import { invitationData, unreachableInvitation } from './client-invites.js'
import { agentNameQuery, agentNameRecord, buildJoinRequest, confirmationCode, joinMac, machineAccess } from './enrollment.js'
import { buildRecord } from './membership.js'
import { memberIn, newNonce } from './machine-handshake.js'
import { answerValue, fetchMachineResponse, jsonRequestBody, verifyMachineAnswer } from './machine-response.js'
import { publicKeyFromMachineId } from './machine-key.js'
import { canonical, ownValue, requireValue } from './workspace-schema.js'

/**
 * A person's ID belongs to the machine they were first admitted with (docs/PARDNER-TRUST-DESIGN.md, section 2).
 * A computer paired into someone's identity holds that other machine's person ID, so it cannot be a person's
 * first machine: it can't start a project or join one as a new person.
 */
function requireFirstMachine(identity, key, action, instead) {
  requireValue(identity.id === key.machineId,
    `This computer was linked to ${identity.name} through another of their machines, so it can’t ${action}: a person belongs to the machine they `
    + `first joined with. ${instead}, or use a fresh client directory (--data DIR).`, 'IDENTITY_MISMATCH')
}

async function enrollmentAnswer(invitation, input) {
  try {
    const { pathname, search } = new URL(invitation.endpoint)
    const request = { projectId: invitation.projectId, method: 'POST', suffix: pathname + search,
      body: jsonRequestBody({ ...input, challenge: newNonce() }) }
    const answer = await fetchMachineResponse(invitation.endpoint, { ...request, timeoutMs: 15000 })
    const { status, body, signature, signer } = answer
    const unsignedSuccess = status >= 200 && status < 300 && body && typeof body === 'object' && !Array.isArray(body) && !signer && !signature
    requireValue(!unsignedSuccess,
      'The hub may be running an older version of Pardner. Check the version on both computers and try again.',
      'UNSIGNED_ENROLLMENT_REPLY')
    const result = verifyMachineAnswer(answer, request, signer)
    requireValue(memberIn([result.genesis], invitation.projectId, signer, publicKeyFromMachineId(signer)),
      'The enrollment reply did not prove the hub belongs to this project', 'HUB_UNAVAILABLE')
    return { value: answerValue(status, result), signer }
  } catch (error) { throw unreachableInvitation(invitation, error) }
}

function runtimeCredentials() { return { internalToken: secret(), internalSocketToken: secret() } }

function runtimeEntry(key, name, role, credentials = runtimeCredentials()) {
  return { key, name, role, ...credentials, people: {}, admissions: {}, state: 'starting' }
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
    code: status.nonce ? confirmationCode(invitation.offer, request.machineId, status.nonce) : null,
    ...(invitation.person ? { linkingAs: { name: invitation.person.name, ...(invitation.person.email ? { email: invitation.person.email } : {}) } } : {}) })
}

function certifiedPeople(membership, display) {
  const people = new Map([...membership.people, ...membership.formerPeople].map(person => [person.id, person]))
  const currentMachine = new Map(membership.machines.map(machine => [machine.id, machine]))
  const certifiedDevices = new Set([...membership.machines, ...membership.formerMachines].map(machine => `${machine.id}/${machine.personId}`))
  const actors = new Map([...people.values()].map(person => [
    actorId(person.id), { person, kind: 'human', name: person.displayName },
  ]))
  for (const label of membership.agentNames) {
    const machine = currentMachine.get(label.machineId)
    const person = machine && people.get(machine.personId)
    if (person && label.id === actorId(person.id, label.harness) && !actors.has(label.id)) {
      actors.set(label.id, { person, kind: 'agent', name: label.displayName, harnessId: label.harness })
    }
  }
  return Object.fromEntries([...actors].map(([id, { person, kind, name, harnessId }]) => {
    const hint = ownValue(display ?? {}, id)
    const devices = Array.isArray(hint?.devices) ? hint.devices.filter(device => certifiedDevices.has(`${device?.machineId}/${person.id}`)) : []
    const [human, agent] = actorsFor({ id: person.id, name: person.displayName, email: person.email ?? hint?.gitIdentity?.email },
      devices[0], { harnessId, name })
    return [id, { ...(kind === 'human' ? human : agent), devices }]
  }))
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
      if (state.projects[attempt.id]?.state === 'ready') return attempt.id
      const here = Object.values(state.projects).find(p => p.id === offer.projectId && p.enrollmentId !== attempt.id)
      if (here) return addAgentHere(client, here, invitation, agent ?? state.setupAgent)
      // A shared project is reached through a tailcat route: this machine opens its own end before it dials the hub.
      if (invitation.tunnel) await client.share.ensureForward(invitation.tunnel, invitation.endpoint)
      let recipient = attempt.recipient
      if (!recipient) {
        if (offer.purpose === 'human') {
          requireValue(state.identity, 'Confirm your identity before joining', 'IDENTITY_REQUIRED')
          requireFirstMachine(state.identity, key, 'join a project as a new person',
            'Join from that machine, then add this computer with a My device invitation')
        } else requireValue(!state.identity || state.identity.id === offer.personId,
          `This computer already has its own identity (${state.identity?.name}), so it can’t be linked as ${invitation.person?.name ?? 'another person'}. `
          + 'Link it from a fresh client directory (--data DIR), or use a Human invitation to join as yourself.', 'IDENTITY_MISMATCH')
        const personId = offer.purpose === 'human' ? state.identity.id : offer.personId
        let reported = agent ?? state.setupAgent
        if (offer.purpose !== 'human' && !reported.name) {
          const query = agentNameQuery(offer.offerId, reported.harnessId)
          const { value } = await enrollmentAnswer(invitation, { ...query, mac: joinMac(invitation.secret, query) })
          if (value.name) reported = { ...reported, name: value.name }
        }
        const { request, mac } = buildJoinRequest(key, invitation.secret, { offer, personId, identity: state.identity, device: state.device, agent: reported })
        const owner = offer.purpose === 'human' ? state.identity.name : state.identity?.name ?? invitation.person?.name
        recipient = { request, mac, records: [agentNameRecord(key, offer.projectId, personId, reported, owner)], recipientProof: attempt.proof }
        checkpoint({ phase: 'requesting', recipient })
      }
      const { request, recipientProof } = recipient
      const { value: status, signer } = await enrollmentAnswer(invitation, attempt.requestId
        ? { action: 'status', offerId: offer.offerId, requestId: attempt.requestId, recipientProof }
        : { action: 'request', ...recipient })
      if (!attempt.requestId) checkpoint({ phase: 'requested', requestId: status.requestId })
      if (CLOSED[status.state]) throw Object.assign(new Error(status.reason ?? CLOSED[status.state][1]), { code: CLOSED[status.state][0] })
      if (status.state !== 'approved') throw pendingState(invitation, status, request)
      const receipt = status.receipt
      requireValue(receipt?.projectId === offer.projectId && receipt.version === 1 && receipt.machineId === key.machineId,
        'Enrollment returned another project', 'WORKSPACE_MISMATCH')
      const origin = new URL(invitation.endpoint).origin
      const route = `${CLIENT_API}/replica/${offer.projectId}`
      const credentials = attempt.runtimeCredentials ?? runtimeCredentials()
      if (!attempt.runtimeCredentials) checkpoint({ runtimeCredentials: credentials })
      const draft = { ...runtimeEntry(attempt.id, receipt.name, 'replica', credentials), id: offer.projectId,
        enrollmentId: attempt.id, expectedHubId: signer, hubUrl: origin + route, hubWsUrl: origin.replace(/^http/, 'ws') + route + '/native',
        ...(invitation.tunnel ? { tunnel: { kind: invitation.tunnel.kind, localPort: invitation.tunnel.localPort } } : {}) }
      // Start privately. Only publish the registry entry after the sealed welcome and a durable first sync.
      const runtime = await client.runtime(draft)
      try {
        const { records, membership } = await runtime.call('enrollment-membership')
        publishReplica(client, draft, receipt, offer, request, key, records, membership)
      } catch (error) {
        await client.discardRuntime(draft.key, runtime)
        throw error
      }
      checkpoint({ phase: 'ready', receipt: { admissionId: receipt.admissionId } })
      return attempt.id
    })
  } catch (error) {
    if (error.code === 'JOIN_PENDING') return { join: error.join }
    throw error
  }
  return { project: await client.projectView(client.registry.read().projects[result], principal) }
}

function publishReplica(client, { expectedHubId, ...entry }, receipt, offer, request, key, records, membership) {
  const access = machineAccess(membership, key.machineId)
  const rejected = new Set(membership.rejected.map(record => record.recordId))
  const certified = records.some(record => !rejected.has(record.recordId)
    && ((record.kind === 'member.add' && record.machineId === key.machineId) || (record.kind === 'machine.add' && record.subject === key.machineId))
    && record.offer?.offerId === offer.offerId && canonical(record.joinRequest) === canonical(request))
  requireValue(certified && access?.personId === request.personId, 'The hub did not prove this invitation’s admission', 'NOT_MEMBER')
  const person = membership.people.find(entry => entry.id === access.personId)
  const identity = { id: person.id, name: person.displayName, email: person.email ?? request.profile?.email ?? receipt.identity?.email }
  const agentId = actorId(identity.id, request.agent.harnessId)
  const label = membership.agentNames.find(entry => entry.id === agentId && entry.machineId === key.machineId)
  requireValue(label, 'The hub did not provide the signed Actor label', 'ACTOR_REVOKED')
  const actor = access.humanAllowed ? actorId(identity.id) : agentId
  const ownActors = actorsFor(identity, { ...request.device, machineId: key.machineId }, { ...request.agent, name: label.displayName })
  client.registry.update(state => {
    requireValue(!state.identity || state.identity.id === identity.id, 'This client belongs to another human', 'IDENTITY_MISMATCH')
    if (!state.identity && !access.humanAllowed) {
      state.humanAuthority = false
      for (const session of Object.values(state.sessions)) if (session.kind === 'human') session.revoked = true
    }
    if (access.humanAllowed) state.humanAuthority = true
    state.identity ??= identity
    const people = certifiedPeople(membership, receipt.people)
    for (const actor of ownActors) {
      const devices = new Map([...(people[actor.id]?.devices ?? []), ...actor.devices].map(device => [device.id, device]))
      people[actor.id] = { ...actor, devices: [...devices.values()] }
    }
    state.projects[entry.key] ??= { ...entry, state: 'ready', actorId: actor, humanAllowed: access.humanAllowed, people,
      agentReporting: { [agentId]: request.agent } }
  })
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
    if (ownValue(doc.actors, id) && status.savedLocally && named) return project.key
    await delay(50)
  } while (Date.now() < deadline)
  requireValue(false, 'Actor registration is not saved locally yet; retry this join', 'REGISTRATION_PENDING')
}
