import { randomUUID } from 'node:crypto'
import { actorId, actorsFor, secret } from './client-identity.js'
import { invitationData } from './client-invites.js'
import { requireValue } from './workspace-schema.js'

export async function remoteJson(url, body, token, timeoutMs = 3000) {
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error' }) }
  catch { throw Object.assign(new Error('Project authority unavailable; retry this attempt'), { code: 'HUB_UNAVAILABLE' }) }
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Project request failed'), { code: result.code ?? 'HUB_ERROR' })
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
  const key = await client.registry.attempt(`join:${client.registry.read().clientId}`, input.operationId, { invitation: input.invitation }, async (attempt, checkpoint) => {
    let receipt = attempt.receipt
    if (!receipt) {
      const state = client.registry.read()
      if (invitation.purpose === 'human') requireValue(state.identity, 'Confirm your identity before joining', 'IDENTITY_REQUIRED')
      const recipient = attempt.recipient ?? { inviteId: invitation.id, invitationSecret: invitation.secret,
        recipientProof: attempt.proof, operationId: attempt.id, device: state.device, identity: state.identity, agent: state.setupAgent }
      checkpoint({ phase: 'enrolling', recipient })
      receipt = await remoteJson(invitation.endpoint, recipient, undefined, 15000)
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
        state.projects[existing.key].people = { ...existing.people, ...receipt.people }
        return existing.key
      }
      state.projects[attempt.id] ??= { ...runtimeEntry(attempt.id, receipt.name, 'replica'), id: receipt.projectId,
        enrollmentId: attempt.id, actorId: receipt.actorId, humanAllowed: receipt.humanAllowed, people: receipt.people,
        hubUrl: receipt.hubUrl, hubWsUrl: receipt.hubWsUrl, deviceToken: receipt.deviceToken,
        replicaCredentialId: receipt.admissionId, replicaToken: receipt.replicaToken }
    })
    if (existingKey) return existingKey
    const project = client.registry.read().projects[attempt.id]
    await client.runtime(project)
    client.registry.update(state => { state.projects[attempt.id].state = 'ready' })
    checkpoint({ phase: 'ready' })
    return attempt.id
  })
  return { project: await client.projectView(client.registry.read().projects[key], principal) }
}
