import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { actorId, actorsFor, secret, setupAgent } from './client-identity.js'
import { invitationData, unreachableInvitation } from './client-invites.js'
import { requireValue } from './workspace-schema.js'

export async function remoteJson(url, body, token, timeoutMs = 3000) {
  // Only an explicit application code from the hub is a hub decision. Network failures, gateway error pages,
  // non-JSON bodies and hub 5xx responses are outages, and enrolled replicas keep saving locally through them.
  const unavailable = details => Object.assign(new Error('Project authority unavailable; retry this attempt'), { code: 'HUB_UNAVAILABLE', details })
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  return { key, name, role, internalToken: secret(), internalReplicaToken: secret(), people: {}, admissions: {}, state: 'starting' }
}
export async function createProject(client, principal, input) {
  client.human(principal)
  const { identity, device, setupAgent } = client.registry.read()
  requireValue(identity, 'Confirm your identity before creating a project', 'IDENTITY_REQUIRED')
  requireValue(typeof input.name === 'string' && input.name.trim() && input.name.length <= 200, 'Supply a project name')
  const key = await client.registry.attempt(`create:${client.registry.read().clientId}`, input.operationId, { name: input.name }, async (attempt, checkpoint) => {
    const project = client.registry.update(state => state.projects[attempt.id] ??= {
      ...runtimeEntry(attempt.id, input.name.trim(), 'hub'), creatorId: identity.id,
      agentReporting: { [actorId(identity.id, setupAgent.harnessId)]: setupAgent },
      actorId: actorId(identity.id), humanAllowed: true, initialActors: actorsFor(identity, device, setupAgent) })
    const runtime = await client.runtime(project)
    client.registry.update(state => { const p = state.projects[project.key]; p.id = runtime.connection.workspaceId
      p.people = { ...Object.fromEntries(p.initialActors.map(actor => [actor.id, actor])), ...p.people }; p.state = 'ready' })
    checkpoint({ phase: 'ready' })
    return project.key
  })
  return { project: await client.projectView(client.registry.read().projects[key], principal) }
}
export async function joinProject(client, principal, input) {
  requireValue(principal.kind === 'operator' || (principal.kind === 'human' && client.registry.read().humanAuthority !== false), 'Enrollment authority required', 'FORBIDDEN')
  const invitation = invitationData(input.invitation)
  if (input.agent !== undefined) requireValue(input.agent && typeof input.agent === 'object' && !Array.isArray(input.agent) &&
    Object.keys(input.agent).every(key => ['harnessId', 'name', 'model', 'managedBy'].includes(key)), 'Supply agent reporting metadata only')
  const agent = input.agent === undefined ? undefined : setupAgent({ harnessId: client.registry.read().setupAgent.harnessId, ...input.agent })
  const key = await client.registry.attempt(`join:${client.registry.read().clientId}`, input.operationId, { invitation: input.invitation, ...(agent ? { agent } : {}) }, async (attempt, checkpoint) => {
    let receipt = attempt.receipt
    if (!receipt) {
      const state = client.registry.read()
      if (invitation.purpose === 'human') requireValue(state.identity, 'Confirm your identity before joining', 'IDENTITY_REQUIRED')
      const recipient = attempt.recipient ?? { inviteId: invitation.id, invitationSecret: invitation.secret,
        recipientProof: attempt.proof, operationId: attempt.id, device: state.device, identity: state.identity, agent: agent ?? state.setupAgent }
      checkpoint({ phase: 'enrolling', recipient })
      try { receipt = await remoteJson(invitation.endpoint, recipient, undefined, 15000) }
      catch (error) { throw unreachableInvitation(invitation, error) }
      requireValue(receipt.projectId === invitation.projectId && receipt.version === 1, 'Enrollment returned another project', 'WORKSPACE_MISMATCH')
      checkpoint({ phase: 'enrolled', receipt })
    }
    const existingKey = client.registry.update(state => {
      requireValue(!state.identity || state.identity.id === receipt.identity.id, 'This client belongs to another human', 'IDENTITY_MISMATCH')
      if (!state.identity && !receipt.humanAllowed) {
        state.humanAuthority = false
        for (const session of Object.values(state.sessions)) if (session.kind === 'human') session.revoked = true
      }
      if (receipt.humanAllowed) state.humanAuthority = true
      state.identity ??= receipt.identity
      const existing = Object.values(state.projects).find(p => p.id === receipt.projectId)
      if (existing && existing.enrollmentId !== attempt.id) {
        const project = state.projects[existing.key]
        project.people = { ...existing.people, ...receipt.people }
        const agentId = actorId(state.identity.id, receipt.agent.harnessId)
        requireValue(receipt.actorId === (receipt.humanAllowed ? actorId(state.identity.id) : agentId) && receipt.device.id === state.device.id,
          'Agent admission belongs to another identity or device', 'IDENTITY_MISMATCH')
        project.agentAdmissions ??= {}
        project.agentAdmissions[agentId] = { id: receipt.admissionId, deviceToken: receipt.deviceToken }
        project.agentReporting ??= {}
        project.agentReporting[agentId] = receipt.agent
        return existing.key
      }
      state.projects[attempt.id] ??= { ...runtimeEntry(attempt.id, receipt.name, 'replica'), id: receipt.projectId,
        enrollmentId: attempt.id, actorId: receipt.actorId, humanAllowed: receipt.humanAllowed, people: receipt.people,
        agentReporting: { [actorId(receipt.identity.id, receipt.agent.harnessId)]: receipt.agent },
        hubUrl: receipt.hubUrl, hubWsUrl: receipt.hubWsUrl, deviceToken: receipt.deviceToken,
        replicaCredentialId: receipt.admissionId, replicaToken: receipt.replicaToken }
    })
    if (existingKey) {
      const runtime = await client.runtime(client.registry.read().projects[existingKey])
      const deadline = Date.now() + 8000
      do {
        const { doc } = await runtime.request('/automerge/doc')
        const status = await runtime.request('/automerge/status')
        if (doc.actors[receipt.actorId] && doc.actors[actorId(receipt.identity.id, receipt.agent.harnessId)] && status.savedLocally) return existingKey
        await delay(50)
      } while (Date.now() < deadline)
      requireValue(false, 'Actor registration is not saved locally yet; retry this join', 'REGISTRATION_PENDING')
    }
    const project = client.registry.read().projects[attempt.id]
    await client.runtime(project)
    client.registry.update(state => { state.projects[attempt.id].state = 'ready' })
    checkpoint({ phase: 'ready' })
    return attempt.id
  })
  return { project: await client.projectView(client.registry.read().projects[key], principal) }
}
