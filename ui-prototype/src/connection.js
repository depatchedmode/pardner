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

function isValidConfiguration({ workspaceId, apiBase, wsPath, wsPort }) {
  const pathPattern = /^\/(?!\/)[^?#\\]*$/
  if (typeof workspaceId !== 'string' || !workspaceId) return false
  if (typeof apiBase !== 'string' || (apiBase !== '' && !pathPattern.test(apiBase))) return false
  if (!pathPattern.test(wsPath)) return false
  return wsPort === undefined || (Number.isInteger(wsPort) && wsPort >= 1 && wsPort <= 65535)
}

export async function loadConfiguration(fetcher = fetch) {
  const response = await fetcher('/pardner/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  const config = await readResponse(response)
  if (!isValidConfiguration(config)) {
    throw new Error('The service configuration is incomplete. Restart the service and retry.')
  }
  if (import.meta.env?.DEV) {
    config.apiBase = '/pardner-api'
    config.wsPath = '/pardner-ws/'
    delete config.wsPort
  }
  return config
}

export function createConnection(config, { storage = localStorage, drafts = sessionStorage, fetcher = fetch } = {}) {
  const key = `pardner:${config.workspaceId}`
  const read = (store, suffix) => {
    const value = store.getItem(`${key}:${suffix}`)
    try { return JSON.parse(value) } catch { return null }
  }
  const write = (store, suffix, value) => {
    try {
      if (value === null) store.removeItem(`${key}:${suffix}`)
      else store.setItem(`${key}:${suffix}`, JSON.stringify(value))
    } catch {
      throw new Error('Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes.')
    }
  }
  const credential = () => read(storage, 'credential') || ''
  const forgetCredential = () => write(storage, 'credential', null)
  return {
    credential,
    remember: token => write(storage, 'credential', token.trim()),
    forgetCredential,
    preferences: () => read(storage, 'preferences') || {},
    savePreferences: value => write(storage, 'preferences', value),
    pending: () => read(drafts, 'pending'),
    savePending: value => write(drafts, 'pending', value),
    forget() {
      forgetCredential()
      write(storage, 'preferences', null)
      write(drafts, 'pending', null)
    },
    async pair(code) {
      const result = await readResponse(await fetcher(`${config.apiBase}/pardner/pair`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }), signal: AbortSignal.timeout(10000),
      }))
      if (result.workspaceId !== config.workspaceId) throw Object.assign(
        new Error('The service workspace changed. Reload before pairing.'), { code: 'WORKSPACE_MISMATCH' })
      if (typeof result.token !== 'string' || !result.token) throw new Error('The service did not return a credential. Generate a new pairing code and try again.')
      write(storage, 'credential', result.token)
    },
    async request(path, body) {
      const token = credential()
      try {
        return await readResponse(await fetcher(`${config.apiBase}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
            'X-Pardner-Workspace': config.workspaceId },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(10000),
        }))
      } catch (error) {
        if (error.code === 'AUTH_REQUIRED' && credential() === token) forgetCredential()
        throw error
      }
    },
  }
}
