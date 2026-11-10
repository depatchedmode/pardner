export function websocketUrl(config, pageUrl, ticket) {
  const url = new URL(config.wsPath, pageUrl)
  url.protocol = new URL(pageUrl).protocol === 'https:' ? 'wss:' : 'ws:'
  if (config.wsPort !== undefined) url.port = String(config.wsPort)
  url.search = new URLSearchParams({ ticket }).toString()
  url.hash = ''
  return url.href
}

async function readResponse(response) {
  let result
  try { result = await response.json() } catch {
    throw new Error('The service returned an unreadable response. Retry the connection.')
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('The service returned an unreadable response. Retry the connection.')
  }
  if (!response.ok) throw Object.assign(new Error(result.error || 'The request failed. Try again.'), {
    code: result.code, details: result.details,
  })
  return result
}

const pathPattern = /^\/(?!\/)[^?#\\]*$/

export async function loadConfiguration(fetcher = fetch) {
  const response = await fetcher('/pardner/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  const config = await readResponse(response)
  // Local client mode chooses projects after sign-in; each project supplies its own board configuration.
  // Any other service is an agent and integration service with no human board.
  if (config.mode === 'client' && (typeof config.clientApiBase !== 'string' || !pathPattern.test(config.clientApiBase))) {
    throw new Error('The local client configuration is incomplete. Restart Pardner and retry.')
  }
  return config
}

// One project board inside the local client. The browser's HttpOnly session
// cookie authenticates; drafts and retries are bound to the project and the
// signed-in Actor.
export function createConnection(config, { storage = localStorage, drafts = sessionStorage, fetcher = fetch } = {}) {
  const key = `pardner:${config.workspaceId}:${config.actorId}`
  const read = (store, suffix) => {
    const value = store.getItem(`${key}:${suffix}`)
    try { return JSON.parse(value) } catch { return null }
  }
  const write = (store, suffix, value) => {
    try {
      if (value === null) store.removeItem(`${key}:${suffix}`)
      else store.setItem(`${key}:${suffix}`, JSON.stringify(value))
    } catch {
      throw new Error('Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes.')
    }
  }
  return {
    preferences: () => read(storage, 'preferences') || {},
    savePreferences: value => write(storage, 'preferences', value),
    pending: () => read(drafts, 'pending'),
    savePending: value => write(drafts, 'pending', value),
    draft: taskId => read(drafts, `draft:${taskId}`),
    saveDraft: (taskId, value) => write(drafts, `draft:${taskId}`, value),
    async request(path, body) {
      let response
      try {
        response = await fetcher(`${config.apiBase}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Pardner-Workspace': config.workspaceId },
          credentials: 'same-origin',
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(10000),
        })
      } catch (cause) {
        // No answer is not a refusal: the caller keeps any pending operation for retry.
        throw Object.assign(new Error('The local Pardner client did not respond. Check that it is still running, then retry.'),
          { code: 'CLIENT_UNREACHABLE', cause })
      }
      return readResponse(response)
    },
  }
}
