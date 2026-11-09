// Browser helpers for local client mode (docs/PARDNER-ONBOARDING-CONTRACT.md).
// Authentication is an HttpOnly session cookie; nothing here stores a credential.

const GRANT_KEY = 'grant'
const PAIR_KEY = 'pair'
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

/** Remove a phone pairing code (`#pair=`, from the computer's QR code) from the address bar and return its digits. */
export function takePairingCode(location = window.location, history = window.history) {
  const digits = pairingDigits(takeFragmentValue(PAIR_KEY, location, history))
  return digits || null
}

/** The digits of a typed or scanned pairing code, at most eight. */
export const pairingDigits = text => String(text ?? '').replace(/\D/g, '').slice(0, 8)

/** A pairing code as people read it aloud: "1234 5678". */
export function groupPairingCode(text) {
  const digits = pairingDigits(text)
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits
}

/** Time left on a pairing code as m:ss, never negative. */
export function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** A pairing's state as the computer should show it: a pending code past its expiry is expired before the next poll says so. */
export function pairingState(summary, expiresAt, now) {
  const state = summary?.state ?? 'pending'
  return state === 'pending' && expiresAt <= now ? 'expired' : state
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
    // Phone access: managed from the computer, redeemed and signed out from the phone.
    companion: () => call('/companion'),
    setCompanionNetwork: ({ enabled, interfaceName }) => call('/companion/network', { enabled, ...(interfaceName ? { interfaceName } : {}) }),
    createPairing: (projectId, { name } = {}) => call(`/projects/${id(projectId)}/companion/pairings`, name ? { name } : {}),
    cancelPairing: pairingId => call(`/companion/pairings/${id(pairingId)}/cancel`, {}),
    revokeCompanion: companionId => call(`/companion/devices/${id(companionId)}/revoke`, {}),
    redeemCompanion: code => call('/companion/redeem', { code }),
    logoutCompanion: () => call('/companion/logout', {}),
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

// A paired phone keeps no copy: the project is saved on the host computer, so it never reads "locally".
export function syncLabel(status, { companion = false } = {}) {
  const where = companion ? 'on your computer' : 'locally'
  if (!status) return 'Status not reported'
  if (status.available === false) return 'Project service unavailable'
  if (status.storageError) return companion ? 'Your computer couldn’t save' : 'Local save failed'
  if (!status.savedLocally) return `Saving ${where}…`
  if (status.syncPending || status.hubConnected === false) return `Saved ${where} · waiting for hub`
  return `Saved ${where} · synced`
}
