import { createHash, randomBytes } from 'node:crypto'
import { localEndpoint } from './codex-bridge-adapter.js'

// Rejections naming a state T3 refused; anything else may have taken effect.
const DEFINITE_REJECTIONS = new Set(['capability_denied', 'invalid_request', 'run_not_found', 'runtime_mode_escalation_denied',
  'thread_not_found', 'thread_not_interruptible', 'thread_not_sendable'])
const RETAINING_STATUSES = new Set([409, 429, 503])

/** T3 answered and did not accept the operation. */
export class T3Rejected extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'T3Rejected'
    this.code = code
  }
}

/** T3 answered busy or starting; the operation was not accepted and remains retained. */
export class T3Busy extends Error {
  constructor(status) {
    super(`T3 answered HTTP ${status}`)
    this.name = 'T3Busy'
    this.status = status
  }
}

/** No conclusive answer arrived: the operation may or may not have been accepted. */
export class T3Unknown extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'T3Unknown'
  }
}

/** Signs in as an outside MCP client using a one-time pairing code from `t3 auth pairing create`. */
export async function pairT3Client({ origin, pairingCode, access = 'approval-required', clientName = 'pardner', fetch: request = fetch }) {
  const { origin: base } = localEndpoint(origin, ['http:'])
  const post = async (path, body, type = 'application/json') => {
    const response = await request(`${base}${path}`, { method: 'POST', headers: { 'content-type': type, origin: base },
      body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body) })
    const payload = await response.json()
    if (!response.ok) throw new T3Rejected('pairing_rejected', payload.message ?? `T3 sign-in failed with HTTP ${response.status}`)
    return payload
  }
  const redirect = 'http://127.0.0.1/pardner-t3'
  const resource = `${base}/mcp`
  const { client_id: clientId } = await post('/oauth/mcp/register', { client_name: clientName, redirect_uris: [redirect] })
  const verifier = randomBytes(32).toString('base64url')
  const state = randomBytes(16).toString('base64url')
  const { redirectTo } = await post('/oauth/mcp/decision', {
    authorization: { response_type: 'code', client_id: clientId, redirect_uri: redirect, state, resource,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' },
    decision: { _tag: 'pairing-code', access, code: pairingCode }
  })
  const answer = new URL(redirectTo).searchParams
  if (answer.get('state') !== state || !answer.get('code')) throw new T3Rejected('pairing_rejected', 'T3 did not approve the pairing code')
  const issued = await post('/oauth/mcp/token', { grant_type: 'authorization_code', code: answer.get('code'), redirect_uri: redirect,
    client_id: clientId, code_verifier: verifier, resource }, 'application/x-www-form-urlencoded')
  return { token: issued.access_token, expiresIn: issued.expires_in ?? null }
}

/** Loopback MCP client for one T3 credential. T3 scopes `clientRequestId` to this credential's client. */
export class T3McpClient {
  constructor({ origin, token, timeoutMs = 10_000, clock = Date.now, fetch: request = fetch }) {
    this.endpoint = `${localEndpoint(origin, ['http:']).origin}/mcp`
    this.token = token
    this.credentialId = createHash('sha256').update(token).digest('hex').slice(0, 16)
    this.timeoutMs = timeoutMs
    this.clock = clock
    this.request = request
    this.sequence = 0
  }

  async rpc(method, params, { notification = false, reopened = false } = {}) {
    let response, text
    try {
      response = await this.request(this.endpoint, { method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18', ...(this.session ? { 'mcp-session-id': this.session } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++this.sequence }), method, params }) })
      text = await response.text()
    } catch (error) { throw new T3Unknown(`No conclusive T3 reply to ${method}`, { cause: error }) }
    if (RETAINING_STATUSES.has(response.status)) throw new T3Busy(response.status)
    if (response.status === 401 || response.status === 403) throw new T3Rejected('auth_invalid', `T3 refused the credential (${response.status})`)
    if (response.status === 404 && this.session && !reopened) {
      // T3 forgets MCP sessions on restart; it processed nothing, so reopen and repeat.
      this.session = null
      this.connected = false
      await this.connect()
      return this.rpc(method, params, { notification, reopened: true })
    }
    this.session = response.headers.get('mcp-session-id') ?? this.session
    if (notification) return null
    let payload
    try { payload = JSON.parse(text.startsWith('{') ? text : text.split('\n').findLast(line => line.startsWith('data:')).slice(5)) }
    catch (error) { throw new T3Unknown(`Unreadable T3 reply to ${method} (${response.status})`, { cause: error }) }
    if (payload.error || !payload.result) throw new T3Unknown(`Inconclusive T3 reply to ${method}: ${payload.error?.message ?? response.status}`)
    return payload.result
  }

  async connect() {
    if (this.connected) return
    await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pardner', version: '0.1.0' } })
    await this.rpc('notifications/initialized', {}, { notification: true })
    this.connected = true
  }

  async tools() {
    await this.connect()
    return (await this.rpc('tools/list', {})).tools
  }

  async tool(name, input) {
    await this.connect()
    const result = await this.rpc('tools/call', { name, arguments: input })
    if (!result.isError) return result.structuredContent
    let failure = {}
    try { failure = JSON.parse(result.content?.[0]?.text ?? '{}') } catch { /* Unstructured failures remain unknown below. */ }
    if (DEFINITE_REJECTIONS.has(failure.code)) throw new T3Rejected(failure.code, failure.message)
    throw new T3Unknown(`T3 ${name} failed: ${failure.code ?? 'unstructured'}`)
  }

  send(threadId, message, clientRequestId) { return this.tool('t3_thread_send', { threadId, message, clientRequestId, mode: 'queue' }) }
  // Never with `stop`: T3 then ignores `runId` and interrupts whichever run is active.
  interrupt(threadId, runId, clientRequestId) { return this.tool('t3_thread_interrupt', { threadId, runId, clientRequestId }) }
  cancelQueued(threadId, runId) { return this.tool('t3_queue', { action: 'cancel', threadId, queuedRunId: runId }) }

  /** Every item T3 reports for a thread view, oldest first. */
  async items(threadId, view) {
    const items = []
    let afterPosition
    for (;;) {
      const page = await this.tool('t3_thread_read', { threadId, view, limit: 100, runLimit: 1, maxCharsPerItem: 1,
        ...(afterPosition === undefined ? {} : { afterPosition }) })
      items.push(...page.items)
      if (!page.hasMore || page.nextPosition == null) return items
      afterPosition = page.nextPosition
    }
  }

  /**
   * Fresh thread and run state, stamped on receipt. T3's pending count can outlive
   * an interrupted run, so `pendingRunIds` names the runs with a waiting request item.
   */
  async read(threadId) {
    const { thread, recentRuns } = await this.tool('t3_thread_read', { threadId, limit: 1, runLimit: 50, maxCharsPerItem: 1 })
    // Only an active run can be blocked, and the count can outlive an interrupted run.
    const pendingRunIds = thread.pendingRequestCount > 0 && thread.activeRunId
      ? [...new Set((await this.items(threadId, 'activity')).filter(item => item.status === 'waiting').map(item => item.runId))] : []
    return { observedAt: this.clock(), thread, runs: recentRuns, pendingRunIds }
  }

  /** The run holding this request's message, or null when no read item shows it. */
  async findRequest(threadId, clientRequestId) {
    const suffix = `:thread-send:${encodeURIComponent(clientRequestId)}`
    return (await this.items(threadId, 'messages')).find(item => item.messageId?.endsWith(suffix))?.runId ?? null
  }
}
