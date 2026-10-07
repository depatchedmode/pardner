import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { requireValue, OperationError } from './workspace-schema.js'

const failure = (code, message) => new OperationError(code, message)
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const stopReasons = new Set(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'])

export async function cursorConnection(mapping) {
  requireValue(mapping.transport === 'stdio', 'Cursor ACP requires transport: stdio')
  requireValue(nonempty(mapping.command) && isAbsolute(mapping.command)
    && ['agent', 'cursor-agent'].includes(basename(mapping.command)), 'Supply an absolute agent or cursor-agent executable')
  const command = await realpath(mapping.command)
  requireValue(['agent', 'cursor-agent'].includes(basename(command)) && (await stat(command)).isFile(), 'Cursor command must resolve to an agent or cursor-agent file')
  await access(command, constants.X_OK)
  requireValue(nonempty(mapping.worktree) && isAbsolute(mapping.worktree), 'Cursor worktree must be absolute')
  const worktree = await realpath(mapping.worktree)
  requireValue((await stat(worktree)).isDirectory(), 'Cursor worktree must be a directory')
  return { command, worktree }
}

/** Owns one explicitly mapped session. ACP attests mode, not original cwd or sandbox. */
export class CursorBridgeAdapter extends EventEmitter {
  constructor(mapping, { requestTimeoutMs = 10000, promptTimeoutMs = 180000, maxLineBytes = 2 * 1024 * 1024 } = {}) {
    super()
    for (const timeout of [requestTimeoutMs, promptTimeoutMs]) requireValue(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 300000, 'Bound Cursor RPC timeouts to 1–300000 ms')
    requireValue(Number.isSafeInteger(maxLineBytes) && maxLineBytes > 0 && maxLineBytes <= 8 * 1024 * 1024, 'Bound Cursor protocol frames to at most 8 MiB')
    this.mapping = structuredClone(mapping)
    this.requestTimeoutMs = requestTimeoutMs
    this.promptTimeoutMs = promptTimeoutMs
    this.maxLineBytes = maxLineBytes
    this.pending = new Map()
    this.requests = new Map()
    this.sequence = 0
    this.clientId = randomUUID()
  }

  async connect() {
    requireValue(!this.closed, 'Cursor adapter is closed', 'CURSOR_CLOSED')
    if (this.protocolFailure) throw this.protocolFailure
    if (this.ready) return
    if (this.connecting) return this.connecting
    this.connecting = this.open().finally(() => { this.connecting = null })
    return this.connecting
  }

  async open() {
    // A timeout can reject before the old child exits. Never overlap ACP owners.
    if (this.child) await this.stopProcess()
    const connection = await cursorConnection(this.mapping)
    requireValue(!this.closed, 'Cursor adapter is closed', 'CURSOR_CLOSED')
    const grouped = process.platform !== 'win32'
    const child = spawn(connection.command, ['acp'], { cwd: connection.worktree, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'], detached: grouped })
    this.child = child
    this.connection = connection
    let buffer = '', finished = false
    const completion = new Promise(resolve => child.once('close', () => { finished = true; resolve() }))
    const terminate = signal => {
      if (finished || !child.pid) return
      try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal) }
      catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    let stopping
    this.stopProcess = () => {
      if (stopping) return stopping
      stopping = completion
      terminate('SIGTERM')
      const timer = setTimeout(() => terminate('SIGKILL'), 1000)
      timer.unref()
      completion.finally(() => clearTimeout(timer))
      return completion
    }
    this.processCompletion = completion
    child.stderr.resume() // Never put provider diagnostics or credentials into bridge output.
    child.stdin.on('error', () => this.disconnected(failure('CURSOR_DISCONNECTED', 'Cursor ACP input closed'), child))
    child.on('error', () => this.disconnected(failure('CURSOR_DISCONNECTED', 'Cursor ACP process could not start'), child))
    child.on('close', () => this.disconnected(failure('CURSOR_DISCONNECTED', 'Cursor ACP process closed'), child))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', text => {
      if (this.child !== child || this.protocolFailure || this.closed) return
      buffer += text
      try {
        let newline
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
          requireValue(line.length && Buffer.byteLength(line) <= this.maxLineBytes, 'Invalid Cursor ACP frame', 'CURSOR_PROTOCOL_ERROR')
          this.message(JSON.parse(line))
        }
        requireValue(Buffer.byteLength(buffer) <= this.maxLineBytes, 'Cursor ACP frame exceeded its bound', 'CURSOR_PROTOCOL_ERROR')
      } catch {
        this.protocolFailure = failure('CURSOR_PROTOCOL_ERROR', 'Malformed or unsupported Cursor ACP protocol message')
        this.disconnected(this.protocolFailure, child)
        void this.stopProcess()
      }
    })
    try {
      const { result } = await this.call('initialize', { protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'pardner_bridge', version: '0.1.0' } })
      requireValue(result.protocolVersion === 1, 'Cursor ACP protocol version 1 is required', 'CURSOR_PROTOCOL_ERROR')
      this.initialization = result
      this.ready = true
    } catch (error) { void this.stopProcess(); throw error }
  }

  disconnected(error, child) {
    if (child !== this.child) return
    this.ready = false
    this.loaded = false
    this.mode = undefined
    this.history = null
    this.busy = false
    this.requests.clear()
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
    this.emit('change')
  }

  message(message) {
    requireValue(record(message) && message.jsonrpc === '2.0', 'Invalid ACP envelope', 'CURSOR_PROTOCOL_ERROR')
    if (Object.hasOwn(message, 'method')) {
      requireValue(nonempty(message.method) && !Object.hasOwn(message, 'result') && !Object.hasOwn(message, 'error'), 'Invalid ACP request', 'CURSOR_PROTOCOL_ERROR')
      if (Object.hasOwn(message, 'id')) {
        requireValue(typeof message.id === 'string' || Number.isSafeInteger(message.id), 'Invalid ACP request ID', 'CURSOR_PROTOCOL_ERROR')
        requireValue(!this.requests.has(message.id) && this.requests.size < 256, 'Duplicate or excessive ACP server requests', 'CURSOR_PROTOCOL_ERROR')
        // Includes permission, question, plan, and unsupported client requests.
        // No response is a permission decision. Leave every request unanswered.
        this.requests.set(message.id, message.method)
        this.emit('change')
        return
      }
      if (message.method !== 'session/update') return
      const { sessionId, update } = message.params ?? {}
      requireValue(sessionId === this.mapping.threadId && record(update) && nonempty(update.sessionUpdate), 'ACP update does not match the mapped session', 'CURSOR_PROTOCOL_ERROR')
      if (update.sessionUpdate === 'current_mode_update') this.observeMode(update.currentModeId)
      if (this.loading && update.sessionUpdate === 'user_message_chunk') {
        const { messageId, content } = update
        if (!nonempty(messageId) || content?.type !== 'text' || typeof content.text !== 'string') this.replayComplete = false
        else {
          if (this.replay.has(messageId) && this.lastMessageId !== messageId) this.replayComplete = false
          this.lastMessageId = messageId
          this.replay.set(messageId, (this.replay.get(messageId) ?? '') + content.text)
          this.replayBytes += Buffer.byteLength(content.text)
          requireValue(this.replayBytes <= 8 * 1024 * 1024, 'ACP replay exceeded its bound', 'CURSOR_PROTOCOL_ERROR')
        }
      }
      this.emit('update', update)
      this.emit('change')
      return
    }
    requireValue(this.pending.has(message.id) && (Object.hasOwn(message, 'result') !== Object.hasOwn(message, 'error')), 'Unexpected ACP response', 'CURSOR_PROTOCOL_ERROR')
    const request = this.pending.get(message.id)
    if (Object.hasOwn(message, 'error')) {
      requireValue(record(message.error) && Number.isInteger(message.error.code), 'Invalid ACP error', 'CURSOR_PROTOCOL_ERROR')
      request.reject(failure('CURSOR_RPC_REJECTED', `Cursor ACP rejected ${request.method}; check existing CLI authentication and session access`))
    } else {
      requireValue(record(message.result), 'Invalid ACP result', 'CURSOR_PROTOCOL_ERROR')
      request.resolve(message.result)
    }
    this.pending.delete(message.id)
  }

  call(method, params, timeoutMs = this.requestTimeoutMs) {
    const id = `${this.clientId}:${++this.sequence}`
    const frame = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`
    requireValue(Buffer.byteLength(frame) <= this.maxLineBytes, 'Cursor ACP outgoing frame exceeded its bound', 'CURSOR_PROTOCOL_ERROR')
    requireValue(this.pending.size < 32, 'Too many pending Cursor ACP requests', 'CURSOR_PROTOCOL_ERROR')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = failure('CURSOR_RPC_TIMEOUT', `Cursor ACP ${method} timed out; acceptance may be uncertain`)
        this.disconnected(error, this.child)
        void this.stopProcess()
      }, timeoutMs)
      const finish = callback => value => { clearTimeout(timer); callback(value) }
      this.pending.set(id, { method, resolve: finish(resolve), reject: finish(reject) })
      this.child.stdin.write(frame, error => {
        if (error) this.disconnected(failure('CURSOR_DISCONNECTED', 'Cursor ACP write failed'), this.child)
      })
    }).then(result => ({ id, result }))
  }

  observeMode(mode) {
    requireValue(nonempty(mode), 'Cursor ACP did not report a valid mode', 'CURSOR_PROTOCOL_ERROR')
    this.mode = mode
    if (this.mapping.expectedPolicy && mode !== this.mapping.expectedPolicy.modeId) this.modeChanged = true
  }

  checkPolicy(mapping) {
    requireValue(!this.modeChanged && this.mode === mapping.expectedPolicy?.modeId,
      'Cursor mode differs from the explicitly pinned mode', 'PERMISSION_POLICY_CHANGED')
  }

  async load(mapping) {
    await this.connect()
    requireValue(this.initialization.agentCapabilities?.loadSession === true, 'Cursor ACP did not advertise session/load', 'CURSOR_LOAD_UNSUPPORTED')
    requireValue(mapping.threadId === this.mapping.threadId && await realpath(mapping.worktree) === this.connection.worktree,
      'Cursor mapping differs from its process/session binding', 'WORKTREE_MISMATCH')
    this.mode = undefined
    this.replay = new Map(); this.lastMessageId = undefined; this.replayBytes = 0; this.replayComplete = true
    this.loading = true
    try {
      const { result } = await this.call('session/load', { sessionId: mapping.threadId, cwd: this.connection.worktree, mcpServers: [] })
      requireValue(!Object.hasOwn(result, 'sessionId') || result.sessionId === mapping.threadId, 'Cursor loaded another session', 'SESSION_MISMATCH')
      if (result.modes) this.observeMode(result.modes.currentModeId)
      requireValue(nonempty(this.mode), 'Cursor mode was not observed; dispatch is disabled', 'CURSOR_MODE_UNOBSERVED')
      if (mapping.expectedPolicy) this.checkPolicy(mapping)
      this.history = this.replayComplete ? this.replay : null
      this.loaded = true
    } finally { this.loading = false; this.replay = null }
  }

  async availability(mapping) {
    if (this.requests.size) return 'blocked: Cursor input or approval required; no response supplied'
    if (this.busy) return 'busy'
    if (!this.loaded) await this.load(mapping)
    this.checkPolicy(mapping)
    return this.requests.size ? 'blocked: Cursor input or approval required; no response supplied' : 'ready'
  }

  activity() {
    if (this.requests.size) return 'blocked: Cursor input or approval required; no response supplied'
    if (this.modeChanged) return 'blocked: Cursor mode changed'
    return this.busy ? 'busy' : this.loaded ? 'idle' : 'unavailable'
  }

  async describe(mapping) {
    await this.load(mapping)
    return { threadId: mapping.threadId, worktree: this.connection.worktree, worktreeBinding: 'load-cwd',
      expectedPolicy: { verification: 'mode-only', modeId: this.mode },
      limitations: ['Native original cwd and sandbox policy are not independently attested.', 'No discovery, archive, or approval UI.'] }
  }

  async dispatch(mapping, prompt) {
    requireValue(await this.availability(mapping) === 'ready', 'Cursor session is busy or requires user input', 'CURSOR_BLOCKED')
    requireValue(nonempty(prompt), 'Supply the full persisted delivery prompt')
    this.busy = true; this.emit('change')
    try {
      const { id, result } = await this.call('session/prompt', { sessionId: mapping.threadId, prompt: [{ type: 'text', text: prompt }] }, this.promptTimeoutMs)
      requireValue(stopReasons.has(result.stopReason), 'Cursor did not return a valid prompt completion response', 'CURSOR_PROTOCOL_ERROR')
      this.checkPolicy(mapping)
      // This identifies an observed JSON-RPC completion response, not a native turn ID.
      return `cursor-acp:prompt-response:${encode({ sessionId: mapping.threadId, requestId: id, stopReason: result.stopReason })}`
    } finally { this.busy = false; this.emit('change') }
  }

  async reconcile(mapping, prompt) {
    if (this.busy || this.requests.size) return null
    await this.load(mapping) // The successful load response is the replay-complete barrier.
    const matches = this.history ? [...this.history].filter(([, text]) => text === prompt) : []
    return matches.length === 1 ? `cursor-acp:replayed-message:${encode({ sessionId: mapping.threadId, messageId: matches[0][0] })}` : null
  }

  close() {
    this.closed = true
    if (!this.child) return Promise.resolve()
    this.disconnected(failure('CURSOR_CLOSED', 'Cursor adapter closed'), this.child)
    return this.stopProcess()
  }
}
