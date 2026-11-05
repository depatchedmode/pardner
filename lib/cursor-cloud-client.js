import { requireValue } from './workspace-schema.js'

export class CloudError extends Error {
  constructor(status, code) {
    super(`Cursor Cloud ${status}: ${code}`)
    this.code = code
    this.status = status
  }
}
const part = value => encodeURIComponent(value)

/** Official v1 HTTP boundary. No automatic POST retries or credential-bearing redirects. */
export class CursorCloudClient {
  constructor({ token, fetchImpl = fetch, timeoutMs = 30_000 }) {
    requireValue(typeof token === 'string' && token.length > 0, 'Cursor API credential required')
    this.token = token
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async request(path, { method = 'GET', body, headers, signal } = {}) {
    const response = await this.fetch(`https://api.cursor.com/v1${path}`, {
      method, redirect: 'error', signal: signal ?? AbortSignal.timeout(this.timeoutMs),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      // Provider messages can echo prompts or credentials. Keep only a bounded error code.
      const code = error.error?.code ?? error.code
      throw new CloudError(response.status, typeof code === 'string' && /^[a-z_]{1,80}$/.test(code) ? code : 'request_failed')
    }
    return response
  }
  async json(path, options) { return (await this.request(path, options)).json() }
  create(body) { return this.json('/agents', { method: 'POST', body }) }
  followUp(agentId, body) { return this.json(`/agents/${part(agentId)}/runs`, { method: 'POST', body }) }
  agent(agentId) { return this.json(`/agents/${part(agentId)}`) }
  run(agentId, runId) { return this.json(`/agents/${part(agentId)}/runs/${part(runId)}`) }
  cancel(agentId, runId) { return this.json(`/agents/${part(agentId)}/runs/${part(runId)}/cancel`, { method: 'POST' }) }
  async runs(agentId) {
    const items = [], seen = new Set()
    let cursor
    do {
      const page = await this.json(`/agents/${part(agentId)}/runs?limit=100${cursor ? `&cursor=${part(cursor)}` : ''}`)
      requireValue(Array.isArray(page.items), 'Invalid Cloud run list')
      items.push(...page.items)
      cursor = page.nextCursor
      requireValue(!cursor || !seen.has(cursor), 'Repeated Cloud pagination cursor')
      seen.add(cursor)
    } while (cursor)
    return items
  }
  artifacts(agentId) { return this.json(`/agents/${part(agentId)}/artifacts`) }
  async download(agentId, path) {
    const signed = await this.json(`/agents/${part(agentId)}/artifacts/download?path=${part(path)}`)
    const url = new URL(signed.url)
    requireValue(url.protocol === 'https:' && !url.username && !url.password, 'Invalid artifact download URL')
    // Signed URLs are never persisted and receive no API credential.
    const response = await this.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) })
    requireValue(response.ok, 'Artifact download failed')
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      requireValue(size <= 16 * 1024 * 1024, 'Artifact exceeds the 16 MiB capture limit')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  async *stream(agentId, runId, { lastEventId, signal } = {}) {
    const response = await this.request(`/agents/${part(agentId)}/runs/${part(runId)}/stream`, {
      signal, headers: { Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
    })
    yield* parseCloudSSE(response.body)
  }
}

/** Handles split UTF-8 and CRLF frames. IDs are opaque, not sortable timestamps. */
export async function* parseCloudSSE(body) {
  const decoder = new TextDecoder()
  let buffer = '', event = 'message', id = null, data = []
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    requireValue(buffer.length < 2 * 1024 * 1024, 'Cloud SSE frame too large')
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '')
      buffer = buffer.slice(end + 1)
      if (!line) {
        if (data.length) yield { event, id, data: JSON.parse(data.join('\n')) }
        event = 'message'; id = null; data = []
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') event = value
        if (field === 'data') {
          data.push(value)
          requireValue(data.reduce((size, item) => size + item.length, 0) < 2 * 1024 * 1024, 'Cloud SSE frame too large')
        }
        if (field === 'id' && !value.includes('\0')) id = value
      }
    }
  }
  // An unterminated frame is deliberately not committed; reconnect replays it.
}
