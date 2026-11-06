// Browser helpers for local client mode (docs/PARDNER-ONBOARDING-CONTRACT.md).
// Authentication is an HttpOnly session cookie; nothing here stores a credential.

const GRANT_KEY = 'grant'
let capturedGrant = null

/** Remove a one-time bootstrap grant from the address bar and return it. */
export function takeBootstrapGrant(location = window.location, history = window.history) {
  const params = new URLSearchParams(location.hash.slice(1))
  if (!params.has(GRANT_KEY)) return null
  const grant = params.get(GRANT_KEY)
  params.delete(GRANT_KEY)
  const rest = params.toString()
  history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : ''))
  return grant || null
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

/** The purpose a pasted invitation declares, or null when no single invitation envelope is present. */
export function invitationPurpose(text) {
  const matches = typeof text === 'string' ? text.trim().match(/^pardner-invite-v1\.([A-Za-z0-9_-]+)$/gm) : null
  if (matches?.length !== 1) return null
  try {
    const encoded = matches[0].slice('pardner-invite-v1.'.length).replaceAll('-', '+').replaceAll('_', '/')
    const { purpose } = JSON.parse(atob(encoded))
    return ['human', 'agent', 'device'].includes(purpose) ? purpose : null
  } catch { return null }
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
        { code: result?.code ?? (response.status === 401 ? 'AUTH_REQUIRED' : undefined), status: response.status })
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
    invites: projectId => call(`/projects/${id(projectId)}/invites`),
    createInvite: (projectId, { purpose, operationId }) => call(`/projects/${id(projectId)}/invites`, { purpose, operationId }),
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
