import { CLIENT_API } from './client-identity.js'
import { requireValue } from './workspace-schema.js'
import { remoteJson } from './client-projects.js'

const operationTypes = new Set(['task.create', 'task.update', 'task.resolve', 'task.handoff', 'comment.add', 'comment.edit', 'comment.delete',
  'comment.resolve', 'read.mark', 'task.link-commit', 'task.branch', 'task.merge', 'goal.create', 'goal.update', 'goal.resolve',
  'vein.create', 'vein.update', 'vein.resolve', 'task.link-vein', 'task.unlink-vein', 'task.link-issue', 'task.unlink-issue'])
export function assertActor(value, actorId) {
  requireValue(value === undefined || value === null || value === actorId, 'Actor must match authenticated participant', 'ACTOR_MISMATCH')
}
export async function workspaceProxy(client, project, principal, method, url, body, origin) {
  const binding = client.binding(project, principal)
  const path = url.pathname
  const params = [...url.searchParams.keys()]
  requireValue(params.every(key => key === 'actor'), 'Unsupported query parameter', 'FORBIDDEN')
  assertActor(url.searchParams.get('actor'), binding.actorId)
  if (method === 'GET') {
    requireValue(['/automerge/doc', '/automerge/status', '/automerge/url', '/automerge/deliveries'].includes(path) ||
      /^\/automerge\/(task|vein|goal)\/[A-Za-z0-9_-]+\/context$/.test(path), 'Unsupported workspace endpoint', 'FORBIDDEN')
    if (path === '/automerge/deliveries' && project.role === 'replica') {
      return remoteJson(`${project.hubUrl}/delivery`, { action: 'pending', actorId: binding.actorId }, client.deviceToken(project, binding.actorId))
    }
    const suffix = path === '/automerge/deliveries' || /\/task\/.*\/context$/.test(path) ? `?actor=${encodeURIComponent(binding.actorId)}` : ''
    const result = await (await client.runtime(project)).request(path + suffix)
    if (path === '/automerge/doc') result.doc.actors = { ...result.doc.actors, ...await client.people(project) }
    return result
  }
  requireValue(method === 'POST', 'Unsupported method', 'FORBIDDEN')
  assertActor(body?.actorId, binding.actorId)
  if (path === '/automerge/operations') {
    await client.refreshAdmission(project, binding.actorId)
    requireValue(operationTypes.has(body?.type), 'This operation is not available to board credentials', 'FORBIDDEN')
    requireValue(!body.projectId || body.projectId === project.id, 'Operation belongs to another project', 'PROJECT_MISMATCH')
    return (await client.runtime(project)).request(path, { ...body, actorId: binding.actorId })
  }
  if (path === '/automerge/ws-ticket') {
    requireValue(!body?.purpose || body.purpose === 'ui', 'Native replicas require separate enrollment', 'REPLICA_REQUIRED')
    return { success: true, ...client.auth.ticket(binding, origin) }
  }
  if (/^\/automerge\/deliveries\/(claim|ack|release)$/.test(path)) {
    if (project.role === 'replica') return remoteJson(`${project.hubUrl}/delivery`, { ...body, actorId: binding.actorId, action: path.split('/').at(-1) }, client.deviceToken(project, binding.actorId))
    return (await client.runtime(project)).request(path, { ...body, actorId: binding.actorId })
  }
  requireValue(false, 'Unsupported workspace endpoint', 'FORBIDDEN')
}
export async function nativeRequest(client, project, admission, suffix, method, body, headers) {
  const runtime = await client.runtime(project)
  if (suffix === '/automerge/url' && method === 'GET') return runtime.request(suffix)
  if (suffix === '/automerge/sync-ack' && method === 'POST') {
    requireValue(body.workspaceId === project.id, 'Wrong project', 'PROJECT_MISMATCH')
    return runtime.request(suffix, body)
  }
  if (suffix === '/automerge/ws-ticket' && method === 'POST') {
    requireValue(body.purpose === 'replica' && body.replicaId === admission.id && headers['x-pardner-replica-token'] === admission.replicaToken,
      'Separate native replica credential required', 'REPLICA_REQUIRED')
    return client.auth.ticket({ projectId: project.id, principalId: admission.id, actorId: null, deviceId: admission.device.id }, 'native')
  }
  if (suffix === '/policy' && method === 'GET') return { actorIds: admission.actorIds, humanAllowed: admission.humanAllowed }
  if (suffix === '/people' && method === 'GET') return { people: project.people }
  if (suffix === '/delivery' && method === 'POST') {
    requireValue(admission.actorIds.includes(body.actorId), 'Delivery Actor not admitted on this device', 'ACTOR_MISMATCH')
    if (body.action === 'pending') return runtime.request(`/automerge/deliveries?actor=${encodeURIComponent(body.actorId)}`)
    requireValue(['claim', 'ack', 'release'].includes(body.action), 'Unknown delivery action')
    return runtime.request(`/automerge/deliveries/${body.action}`, body)
  }
  requireValue(false, 'Unsupported replica endpoint', 'FORBIDDEN')
}
export function projectPaths(id) { return { apiBase: `${CLIENT_API}/projects/${id}/api`, wsPath: `${CLIENT_API}/projects/${id}/ws` } }
