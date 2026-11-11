// Browser helpers for local client mode (docs/PARDNER-ONBOARDING-CONTRACT.md).
// Authentication is an HttpOnly session cookie; nothing here stores a credential.

const GRANT_KEY = 'grant'
let capturedGrant = null

/** Remove one fragment parameter from the address bar, keeping the rest, and return its value. */
function takeFragmentValue(key, location, history) {
  const params = new URLSearchParams(location.hash.slice(1))
  if (!params.has(key)) return null
  const value = params.get(key)
  params.delete(key)
  const rest = params.toString()
  history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : ''))
  return value || null
}

/** Remove a one-time bootstrap grant from the address bar and return it. */
export function takeBootstrapGrant(location = window.location, history = window.history) {
  return takeFragmentValue(GRANT_KEY, location, history)
}

/** Called before the first render so the grant never stays visible while config loads. */
export function captureBootstrapGrant(location, history) {
  const grant = takeBootstrapGrant(location, history)
  if (grant) capturedGrant = grant
  return grant
}

export function consumeCapturedGrant() {
  const grant = capturedGrant
  capturedGrant = null
  return grant
}

/**
 * What a pasted invitation offers, read locally before anything is sent: its purpose, project name and, for a
 * machine invitation, the person this computer would be linked as (#155). Null without one complete invitation.
 */
export function invitationPreview(text) {
  const matches = typeof text === 'string' ? text.trim().match(/^pardner-invite-v2\.([A-Za-z0-9_-]+)$/gm) : null
  if (matches?.length !== 1) return null
  try {
    const encoded = matches[0].slice('pardner-invite-v2.'.length).replaceAll('-', '+').replaceAll('_', '/')
    const { offer, projectName, person } = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))))
    if (!['human', 'agent', 'device'].includes(offer?.purpose)) return null
    return { purpose: offer.purpose, role: offer.role ?? null, projectName: typeof projectName === 'string' ? projectName : null,
      person: person && typeof person.name === 'string' ? { name: person.name, email: typeof person.email === 'string' ? person.email : null } : null }
  } catch { return null }
}

/** The purpose a pasted invitation declares, or null when no single invitation envelope is present. */
export function invitationPurpose(text) {
  return invitationPreview(text)?.purpose ?? null
}

export function isClientConfiguration(config) {
  return config?.mode === 'client' && typeof config.clientApiBase === 'string' &&
    /^\/(?!\/)[^?#\\]*$/.test(config.clientApiBase)
}

export function bootstrapPath(config) {
  return typeof config.bootstrapPath === 'string' && /^\/(?!\/)[^?#\\]*$/.test(config.bootstrapPath)
    ? config.bootstrapPath : `${config.clientApiBase}/bootstrap`
}

const unreachable = cause => Object.assign(
  new Error('The local Pardner client did not respond. Check that it is still running, then retry.'),
  { code: 'CLIENT_UNREACHABLE', cause })

export function createClientApi(config, { fetcher = (...args) => fetch(...args) } = {}) {
  const base = config.clientApiBase
  const call = async (path, body, { keepalive = false, absolute = false } = {}) => {
    let response
    try {
      response = await fetcher(absolute ? path : `${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(keepalive ? { keepalive: true } : { signal: AbortSignal.timeout(10000) }),
      })
    } catch (failure) { throw unreachable(failure) }
    let result = null
    try { result = await response.json() } catch { /* handled below */ }
    if (!response.ok) {
      throw Object.assign(new Error(result?.error || `The local client refused the request (${response.status}).`),
        { code: result?.code ?? (response.status === 401 ? 'AUTH_REQUIRED' : undefined), status: response.status, details: result?.details ?? null })
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('The local Pardner client returned an unreadable response. Retry.')
    }
    return result
  }
  const id = value => encodeURIComponent(value)
  return {
    bootstrap: grant => call(bootstrapPath(config), { grant }, { absolute: true }),
    session: () => call('/session'),
    setIdentity: ({ name, email, operationId }) => call('/identity', { name, email, operationId }),
    createProject: ({ name, operationId }) => call('/projects', { name, operationId }),
    join: ({ invitation, operationId }) => call('/join', { invitation, operationId }),
    project: projectId => call(`/projects/${id(projectId)}`),
    presence: projectId => call(`/projects/${id(projectId)}/presence`),
    invites: (projectId, { limit, offset } = {}) => {
      const query = new URLSearchParams(Object.entries({ limit, offset }).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))
      return call(`/projects/${id(projectId)}/invites${query.size ? `?${query}` : ''}`)
    },
    createInvite: (projectId, { purpose, operationId, role, personId }) => call(`/projects/${id(projectId)}/invites`,
      { purpose, operationId, ...(role ? { role } : {}), ...(personId ? { personId } : {}) }),
    people: projectId => call(`/projects/${id(projectId)}/people`),
    removeMember: (projectId, { kind, id: subject, operationId }) => call(`/projects/${id(projectId)}/revoke`, { kind, id: subject, operationId }),
    changeRole: (projectId, { personId, role, operationId }) => call(`/projects/${id(projectId)}/role`, { personId, role, operationId }),
    leave: (projectId, { operationId }) => call(`/projects/${id(projectId)}/leave`, { operationId }),
    editProfile: (projectId, { name, email, operationId }) => call(`/projects/${id(projectId)}/profile`, { name, email, operationId }),
    joinRequests: projectId => call(`/projects/${id(projectId)}/join-requests`),
    revealCode: (projectId, requestId) => call(`/projects/${id(projectId)}/join-requests/${id(requestId)}/code`, {}),
    approveRequest: (projectId, requestId, code) => call(`/projects/${id(projectId)}/join-requests/${id(requestId)}/approve`, { code }),
    rejectRequest: (projectId, requestId) => call(`/projects/${id(projectId)}/join-requests/${id(requestId)}/reject`, {}),
    revokeInvite: (projectId, inviteId) => call(`/projects/${id(projectId)}/invites/${id(inviteId)}/revoke`, {}),
    startSession: (projectId, input) => call(`/projects/${id(projectId)}/sessions`, input),
    report: (projectId, sessionId, input) => call(`/projects/${id(projectId)}/sessions/${id(sessionId)}/report`, input),
    endSession: (projectId, sessionId) =>
      call(`/projects/${id(projectId)}/sessions/${id(sessionId)}/end`, {}, { keepalive: true }),
  }
}

/** Board configuration for one project, authenticated by the session cookie. */
export function projectConfiguration(project) {
  return {
    workspaceId: project.id,
    apiBase: project.apiBase,
    wsPath: project.wsPath,
    authentication: 'session',
    actorId: project.actorId,
  }
}

const HARNESSES = { 'anthropic-claude-code': 'Claude Code', 'openai-codex': 'Codex', cursor: 'Cursor' }
const MANAGERS = { t3: 'T3' }
export const harnessLabel = harnessId => harnessId ? HARNESSES[harnessId] ?? harnessId : null
export const managerLabel = managedBy => managedBy ? MANAGERS[String(managedBy).toLowerCase()] ?? managedBy : null

export function syncLabel(status) {
  if (!status) return 'Status not reported'
  if (status.available === false) return 'Project service unavailable'
  if (status.storageError) return 'Local save failed'
  if (!status.savedLocally) return 'Saving locally…'
  if (status.syncPending || status.hubConnected === false) return 'Saved locally · waiting for hub'
  return 'Saved locally · synced'
}
