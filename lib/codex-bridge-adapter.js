import { EventEmitter } from 'node:events'
import { realpath } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import WebSocket from 'ws'
import { canonicalFilesystemPath } from './bridge-paths.js'
import { canonical, requireValue } from './workspace-schema.js'
import { localEndpoint } from './bridge-endpoints.js'
export { localEndpoint } from './bridge-endpoints.js'

export class CodexBridgeAdapter extends EventEmitter {
  constructor({ endpoint, requestTimeoutMs = 5000 }) {
    super()
    this.endpoint = localEndpoint(endpoint, ['ws:']).href
    this.requestTimeoutMs = requestTimeoutMs
    this.pending = new Map()
    this.sequence = 0
    this.requests = new Map()
    this.subscribed = new Set()
    this.statuses = new Map()
  }

  async connect() {
    if (this.ready) return
    if (this.connecting) return this.connecting
    this.connecting = this.open().finally(() => { this.connecting = null })
    return this.connecting
  }

  async open() {
    const socket = new WebSocket(this.endpoint, { handshakeTimeout: this.requestTimeoutMs })
    this.socket = socket
    socket.on('message', bytes => {
      try { this.message(JSON.parse(bytes.toString())) } catch { socket.terminate() }
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      this.ready = false
      this.requests.clear()
      this.subscribed.clear()
      this.statuses.clear()
      for (const request of this.pending.values()) request.reject(new Error('Codex connection closed'))
      this.pending.clear()
      this.emit('change')
    })
    try {
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
      await this.call('initialize', { clientInfo: { name: 'pardner_bridge', title: 'Pardner bridge', version: '0.1.0' } })
      socket.send(JSON.stringify({ method: 'initialized', params: {} }))
      this.ready = true
    } catch (error) { socket.terminate(); throw error }
  }

  message(message) {
    if (message.method) {
      // Never answer approval or input requests on the user's behalf.
      if (message.id !== undefined) this.requests.set(message.id, { method: message.method, threadId: message.params?.threadId })
      if (message.method === 'serverRequest/resolved') this.requests.delete(message.params.requestId)
      if (message.method === 'thread/status/changed') this.statuses.set(message.params.threadId, message.params.status)
      if (message.id !== undefined || ['thread/status/changed', 'turn/completed', 'serverRequest/resolved'].includes(message.method)) this.emit('change')
      return
    }
    const request = this.pending.get(message.id)
    if (!request) return
    this.pending.delete(message.id)
    if (message.error) request.reject(new Error(`Codex RPC rejected (${message.error.code})`, { cause: message.error }))
    else request.resolve(message.result)
  }

  call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex RPC timed out')) }, this.requestTimeoutMs)
      const finish = callback => value => { clearTimeout(timer); callback(value) }
      this.pending.set(id, { resolve: finish(resolve), reject: finish(reject) })
      this.socket.send(JSON.stringify({ id, method, params }), error => {
        if (error) { this.pending.delete(id); clearTimeout(timer); reject(error) }
      })
    })
  }

  async inspect(mapping, includeTurns = false) {
    await this.connect()
    const { thread } = await this.call('thread/read', { threadId: mapping.threadId, includeTurns })
    requireValue(thread.id === mapping.threadId && await realpath(thread.cwd) === await realpath(mapping.worktree),
      'Codex thread does not match the authorized worktree', 'WORKTREE_MISMATCH')
    return thread
  }

  async availability(mapping) {
    let thread = await this.inspect(mapping)
    if (!this.subscribed.has(mapping.threadId) || thread.status.type === 'notLoaded') {
      // No model, permission, sandbox, or directory overrides: retain session policy.
      const resumed = await this.call('thread/resume', { threadId: mapping.threadId })
      requireValue(canonical({ approvalPolicy: resumed.approvalPolicy, approvalsReviewer: resumed.approvalsReviewer, sandbox: resumed.sandbox })
        === canonical(mapping.expectedPolicy), 'Codex permissions differ from the authorized session policy', 'PERMISSION_POLICY_CHANGED')
      this.subscribed.add(mapping.threadId)
      thread = await this.inspect(mapping)
    }
    if ([...this.requests.values()].some(request => request.threadId === mapping.threadId)) return 'blocked: harness input or approval required'
    if (thread.status.type === 'active') return thread.status.activeFlags?.length ? 'blocked: harness input or approval required' : 'busy'
    if (thread.status.type !== 'idle') return 'unavailable'
    return 'ready'
  }

  activity(mapping) {
    if ([...this.requests.values()].some(request => request.threadId === mapping.threadId)) return 'blocked: harness input or approval required'
    const status = this.statuses.get(mapping.threadId)
    if (status?.activeFlags?.length) return 'blocked: harness input or approval required'
    if (!status) return 'accepted: harness state not observed'
    return status?.type === 'active' ? 'busy' : 'idle'
  }

  async describe(mapping) {
    await this.inspect(mapping)
    const result = await this.call('thread/resume', { threadId: mapping.threadId })
    await this.inspect(mapping)
    return { threadId: mapping.threadId, worktree: await realpath(mapping.worktree),
      expectedPolicy: { approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer, sandbox: result.sandbox } }
  }

  async dispatch(mapping, prompt) {
    const result = await this.call('turn/start', { threadId: mapping.threadId, input: [{ type: 'text', text: prompt, text_elements: [] }] })
    requireValue(typeof result.turn?.id === 'string', 'Codex did not return a turn receipt')
    return result.turn.id
  }

  async worktreeThreads(mapping, archived) {
    await this.connect()
    const threads = []
    let cursor
    do {
      const page = await this.call('thread/list', { archived, cursor, limit: 100,
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'] })
      threads.push(...page.data)
      cursor = page.nextCursor
    } while (cursor)
    const related = new Set([mapping.threadId])
    let expanded
    do {
      expanded = false
      for (const thread of threads) {
        const parent = thread.source?.subAgent?.thread_spawn?.parent_thread_id ?? thread.forkedFromId
        if (related.has(parent) && !related.has(thread.id)) { related.add(thread.id); expanded = true }
      }
    } while (expanded)
    const worktree = await canonicalFilesystemPath(mapping.worktree)
    const matches = await Promise.all(threads.map(async thread =>
      related.has(thread.id) || await canonicalFilesystemPath(thread.cwd) === worktree))
    return threads.filter((_thread, index) => matches[index])
  }

  async isArchived(mapping) {
    if ((await this.worktreeThreads(mapping, true)).some(thread => thread.id === mapping.threadId)) return true
    // Empty persisted fixtures can be absent from listings; read still reports their archived rollout.
    const { thread } = await this.call('thread/read', { threadId: mapping.threadId })
    return thread.id === mapping.threadId && typeof thread.path === 'string' && basename(dirname(thread.path)) === 'archived_sessions'
  }

  async archive(mapping) {
    if (await this.isArchived(mapping)) return
    requireValue(await this.availability(mapping) === 'ready', 'Thread must be idle before archiving')
    await this.call('thread/archive', { threadId: mapping.threadId })
  }

  async reconcile(mapping, prompt) {
    const thread = await this.inspect(mapping, true)
    const matches = thread.turns.filter(turn => turn.items.some(item => item.type === 'userMessage'
      && item.content.some(input => input.type === 'text' && input.text === prompt)))
    return matches.length === 1 ? matches[0].id : null
  }

  close() { this.socket?.terminate() }
}
