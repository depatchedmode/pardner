import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const ACTIVE = new Set(['preparing', 'queued', 'starting', 'running', 'waiting'])

/**
 * Loopback stand-in for the T3 0.1.5/0.1.6 surfaces Pardner uses: pairing,
 * the environment descriptor and the MCP thread tools, with the behaviors the
 * qualification observed. `clientRequestId` deduplicates per credential, the
 * request appears in `messageId`, and a plain interrupt starts the next queued run.
 * Tests script runs, approvals, output and lost replies through its methods.
 */
export class FakeT3 {
  constructor({ version = '0.1.6' } = {}) {
    this.version = version
    this.environmentId = 'environment-fake'
    this.threads = new Map()
    this.codes = new Set()
    this.tokens = new Map()
    this.sends = []
    this.interrupts = []
    this.dedupe = new Map()
    this.server = createServer((req, res) => { void this.handle(req, res) })
  }

  async start() {
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve))
    this.origin = `http://127.0.0.1:${this.server.address().port}`
    return this
  }

  async stop() {
    this.server.closeAllConnections()
    await new Promise(resolve => this.server.close(resolve))
  }

  issueCode() {
    const code = randomBytes(6).toString('hex')
    this.codes.add(code)
    return code
  }

  thread(threadId, fields = {}) {
    const thread = { threadId, projectId: 'project-fake', title: threadId, link: `${this.origin ?? 'http://t3'}/environment-fake/${threadId}`,
      providerInstanceId: 'codex', model: 'fixture', runtimeMode: 'approval-required', interactionMode: 'default',
      branch: null, worktreePath: null, parentThreadId: null, runs: [], items: [], ...fields }
    this.threads.set(threadId, thread)
    return thread
  }

  run(threadId, ordinal) { return this.threads.get(threadId).runs.find(run => run.ordinal === ordinal) }
  runById(runId) { for (const thread of this.threads.values()) { const run = thread.runs.find(candidate => candidate.runId === runId); if (run) return run } }

  /** Starts a run nobody in Pardner requested, as a person typing in T3 would. */
  foreignRun(threadId, status = 'running') { return this.addRun(this.threads.get(threadId), status) }

  addRun(thread, status) {
    const run = { runId: `run:thread:${thread.threadId}:ordinal:${thread.runs.length + 1}`, ordinal: thread.runs.length + 1, status }
    thread.runs.push(run)
    return run
  }

  say(runId, text) {
    const thread = [...this.threads.values()].find(candidate => candidate.runs.some(run => run.runId === runId))
    thread.items.push({ itemId: `item-${thread.items.length + 1}`, runId, type: 'assistant_message', createdBy: 'agent', status: 'completed', text, textTruncated: false })
  }

  block(runId) { this.runById(runId).waiting = true }
  unblock(runId) { this.runById(runId).waiting = false }

  finish(runId, status = 'completed') {
    const run = this.runById(runId)
    run.status = status
    run.waiting = false
    this.startNext(run.runId.split(':')[2])
  }

  startNext(threadId) {
    const thread = this.threads.get(threadId)
    if (thread.runs.some(run => ['running', 'starting', 'waiting'].includes(run.status))) return
    const next = thread.runs.find(run => run.status === 'queued')
    if (next) next.status = 'running'
  }

  threadView(thread) {
    const active = thread.runs.find(run => ['running', 'starting', 'waiting'].includes(run.status))
    const { runs, items, ...fields } = thread
    return { ...fields, status: active ? active.status : thread.runs.at(-1)?.status ?? 'idle', activeRunId: active?.runId ?? null,
      latestRunId: thread.runs.at(-1)?.runId ?? null, pendingRequestCount: thread.runs.filter(run => run.waiting).length }
  }

  tool(client, name, input) {
    const thread = this.threads.get(input.threadId)
    const fail = (code, message) => { throw Object.assign(new Error(message), { t3Code: code }) }
    if (!thread) fail('thread_not_found', 'No such thread')
    if (name === 't3_thread_read') {
      const view = this.threadView(thread)
      const recentRuns = thread.runs.slice(-(input.runLimit ?? 50)).reverse().map(({ waiting, ...run }) => ({ ...run }))
      if (!input.view) return { thread: view, recentRuns, items: [], hasMore: false, nextPosition: null }
      // T3 shows a message only once its run leaves the queue.
      const items = input.view === 'activity'
        ? thread.runs.filter(run => run.waiting).map(run => ({ runId: run.runId, type: 'approval_request', status: 'waiting' }))
        : thread.items.filter(item => thread.runs.find(run => run.runId === item.runId)?.status !== 'queued')
          .map(item => ({ ...item, text: item.text?.slice(0, input.maxCharsPerItem ?? 50_000) ?? null }))
      return { thread: view, recentRuns, items, hasMore: false, nextPosition: null }
    }
    if (name === 't3_thread_send') {
      this.sends.push({ client, threadId: input.threadId, message: input.message, clientRequestId: input.clientRequestId, mode: input.mode })
      const key = `${client}:${input.clientRequestId}`
      let run = this.dedupe.get(key)
      if (!run) {
        const busy = thread.runs.some(candidate => ACTIVE.has(candidate.status))
        run = this.addRun(thread, busy ? 'queued' : 'running')
        this.dedupe.set(key, run)
        thread.items.push({ itemId: `item-${thread.items.length + 1}`, runId: run.runId, type: 'user_message', createdBy: 'user', status: 'completed',
          messageId: `message:mcp:client%3A${client}:thread-send:${encodeURIComponent(input.clientRequestId)}`, text: input.message, textTruncated: false })
      }
      return { threadId: thread.threadId, link: thread.link, runId: run.runId, status: run.status, delivery: run.status }
    }
    if (name === 't3_thread_interrupt') {
      this.interrupts.push({ threadId: input.threadId, runId: input.runId, stop: input.stop })
      const run = thread.runs.find(candidate => candidate.runId === input.runId)
      if (!run) fail('run_not_found', 'No such run')
      if (run.status === 'queued') fail('thread_not_interruptible', 'Queued runs cannot be interrupted')
      if (!ACTIVE.has(run.status)) return { runId: run.runId, status: run.status }
      if (!this.slowInterrupt) { run.status = 'interrupted'; run.waiting = false; this.startNext(thread.threadId) }
      return { runId: run.runId, status: 'interrupt_requested' }
    }
    if (name === 't3_queue' && input.action === 'cancel') {
      const run = thread.runs.find(candidate => candidate.runId === input.queuedRunId)
      if (run?.status !== 'queued') fail('orchestration_error', 'Not queued')
      run.status = 'cancelled'
      return { queuedRunId: run.runId, status: 'cancelled' }
    }
    fail('invalid_request', `Unsupported tool ${name}`)
  }

  async handle(req, res) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    const json = (status, value, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(value)) }
    if (req.url === '/.well-known/t3/environment') return json(200, { environmentId: this.environmentId, serverVersion: this.version, orchestrationProtocolVersion: 2 })
    if (req.url === '/oauth/mcp/register') return json(200, { client_id: `client-${randomBytes(4).toString('hex')}` })
    if (req.url === '/oauth/mcp/decision') {
      const { authorization, decision } = JSON.parse(raw)
      if (!this.codes.delete(decision.code)) { res.writeHead(400, { 'content-type': 'text/html' }); return res.end('<html>Pairing code expired</html>') }
      const code = randomBytes(8).toString('hex')
      this.pending = { code, clientId: authorization.client_id, access: decision.access }
      return json(200, { redirectTo: `${authorization.redirect_uri}?code=${code}&state=${authorization.state}` })
    }
    if (req.url === '/oauth/mcp/token') {
      const form = new URLSearchParams(raw)
      if (form.get('code') !== this.pending?.code) return json(400, { message: 'Invalid code' })
      const token = randomBytes(16).toString('hex')
      this.tokens.set(token, { client: this.pending.clientId, access: this.pending.access })
      return json(200, { access_token: token, expires_in: 30 * 24 * 60 * 60 })
    }
    if (req.url !== '/mcp') return json(404, {})
    const credential = this.tokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    if (!credential || this.revoked) return json(401, { message: 'Unauthorized' })
    const message = JSON.parse(raw)
    const session = { 'mcp-session-id': 'session-fake' }
    if (message.method === 'initialize') return json(200, { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }, session)
    if (!message.id) { res.writeHead(202, session); return res.end() }
    const { name, arguments: input } = message.params
    let result
    try { result = { structuredContent: this.tool(credential.client, name, input) } } catch (error) {
      if (!error.t3Code) throw error
      result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.t3Code, message: error.message }) }] }
    }
    // The operation has taken effect; dropping the reply leaves the caller unable to know.
    if (name === 't3_thread_send' && this.loseNextSendReply) { this.loseNextSendReply = false; return req.socket.destroy() }
    json(200, { jsonrpc: '2.0', id: message.id, result }, session)
  }
}
