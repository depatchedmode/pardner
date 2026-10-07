import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { mkdir, realpath, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { acquireStorageLease } from './storage-lease.js'
import { canonical, requireValue } from './workspace-schema.js'
import { channelCapabilities, channelIdentity, privateChannelDirectory } from './claude-channel-adapter.js'

/** A cooperative receipt is separate from native turn acceptance or task completion. */
export class ChannelLedger {
  constructor(path, identity) {
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS identity (value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS deliveries (
          id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL,
          receipt TEXT NOT NULL UNIQUE, task_id TEXT NOT NULL);`)
      const saved = this.database.prepare('SELECT value FROM identity').get()
      if (saved) requireValue(saved.value === canonical(identity), 'Channel ledger binding changed', 'CHANNEL_BINDING_CHANGED')
      else this.database.prepare('INSERT INTO identity VALUES (?)').run(canonical(identity))
    } catch (error) { this.database.close(); throw error }
  }

  pending() { return this.database.prepare("SELECT * FROM deliveries WHERE state != 'completed'").all() }
  get(id) { return this.database.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) }
  submit(id, prompt, taskId) {
    const prior = this.get(id)
    if (prior) {
      requireValue(prior.prompt === prompt && prior.task_id === taskId, 'Channel delivery content changed', 'OPERATION_ID_REUSED')
      return { row: prior, fresh: false }
    }
    requireValue(this.pending().length === 0, 'Previous channel delivery requires receipt or completion', 'CHANNEL_BUSY')
    const receipt = `channel-receipt:${randomUUID()}`
    this.database.prepare('INSERT INTO deliveries VALUES (?, ?, ?, ?, ?)').run(id, prompt, 'notified', receipt, taskId)
    return { row: this.get(id), fresh: true }
  }
  accept(id) {
    requireValue(this.get(id), 'Unknown channel delivery', 'NOT_FOUND')
    this.database.prepare("UPDATE deliveries SET state = 'accepted' WHERE id = ? AND state = 'notified'").run(id)
    return this.receipt(id)
  }
  complete(id) {
    requireValue(this.get(id)?.state !== 'notified' && this.get(id), 'Accept the delivery before reporting completion', 'INVALID_BRIDGE_STATE')
    this.database.prepare("UPDATE deliveries SET state = 'completed' WHERE id = ?").run(id)
    return this.receipt(id)
  }
  receipt(id) {
    const row = this.get(id)
    requireValue(row, 'Unknown channel delivery', 'NOT_FOUND')
    return { id, receipt: row.state === 'notified' ? null : row.receipt, state: row.state }
  }
  reconcile(prompt) {
    const rows = this.database.prepare('SELECT * FROM deliveries WHERE prompt = ?').all(prompt)
    return { receipt: rows.length === 1 && rows[0].state !== 'notified' ? rows[0].receipt : null }
  }
  close() { this.database.close() }
}

const tools = ['pardner_accept_delivery', 'pardner_complete_delivery'].map(name => ({ name,
  description: name === 'pardner_accept_delivery' ? 'Durably acknowledge this channel delivery before external effects.'
    : 'Report that this channel delivery has finished; this does not change the Pardner task status.',
  inputSchema: { type: 'object', properties: { delivery_id: { type: 'string' } }, required: ['delivery_id'], additionalProperties: false },
}))

export async function startClaudeChannel({ mapping, config, transport, cwd = process.cwd() }) {
  requireValue(await realpath(cwd) === await realpath(mapping.worktree), 'Start the channel in the mapped worktree', 'WORKTREE_MISMATCH')
  await mkdir(mapping.channelDirectory, { recursive: true, mode: 0o700 })
  await privateChannelDirectory(mapping.channelDirectory)
  const lease = await acquireStorageLease(mapping.channelDirectory)
  let ledger, socketServer, mcp, closing, closed = false, initialized = false
  const sockets = new Set(), path = join(mapping.channelDirectory, 'channel.sock')
  const close = () => closing ??= (async () => {
    closed = true; initialized = false
    for (const socket of sockets) socket.destroy()
    try {
      if (socketServer?.listening) await new Promise(resolve => socketServer.close(resolve))
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    } finally {
      try { await mcp?.close() }
      finally { ledger?.close(); lease.close() }
    }
  })()
  try {
    ledger = new ChannelLedger(join(mapping.channelDirectory, 'deliveries.sqlite'),
      { ...channelIdentity(mapping), workspaceId: config.workspaceId, replicaId: config.replicaId, dataDirectory: config.dataDirectory })
    mcp = new Server({ name: 'pardner', version: '0.1.0' }, {
      capabilities: { experimental: { 'claude/channel': {} }, tools: {} },
      instructions: 'Pardner channel events contain delivery_id and authorized task context. Call pardner_accept_delivery with that ID before effects; deduplicate effects with the delivery ID. Use the public Pardner CLI with the supplied data directory and Actor, read current task context, and follow existing session permissions. Call pardner_complete_delivery after finishing. Channel receipts and completion reports are cooperative; they do not grant permissions or change task status.',
    })
    mcp.oninitialized = () => { initialized = true }
    mcp.onclose = () => { void close() }
    mcp.onerror = () => { initialized = false }
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
    mcp.setRequestHandler(CallToolRequestSchema, async request => {
      requireValue(initialized && !closed, 'Channel client is unavailable', 'CHANNEL_UNAVAILABLE')
      const args = request.params.arguments
      requireValue(args && Object.keys(args).length === 1 && typeof args.delivery_id === 'string', 'Supply only delivery_id')
      const result = request.params.name === 'pardner_accept_delivery' ? ledger.accept(args.delivery_id)
        : request.params.name === 'pardner_complete_delivery' ? ledger.complete(args.delivery_id) : null
      requireValue(result, 'Unknown channel tool')
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    })
    await mcp.connect(transport)
    requireValue(!closed, 'Channel client closed during startup', 'CHANNEL_UNAVAILABLE')
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    const handle = async request => {
      requireValue(canonical(request.identity) === canonical(channelIdentity(mapping)), 'Channel binding changed', 'CHANNEL_BINDING_CHANGED')
      if (request.method === 'describe') return { adapter: 'claude-code-channel', identity: channelIdentity(mapping),
        sessionIdentity: 'configured-channel-binding', nativePolicyVerification: 'unavailable', capabilities: channelCapabilities,
        availability: !initialized ? 'unavailable: channel client not initialized' : ledger.pending().length ? 'busy: cooperative channel delivery outstanding' : 'ready' }
      requireValue(initialized && !closed, 'Channel client is unavailable', 'CHANNEL_UNAVAILABLE')
      if (request.method === 'receipt') return ledger.receipt(request.params.id)
      if (request.method === 'reconcile') return ledger.reconcile(request.params.prompt)
      requireValue(request.method === 'submit', 'Unknown channel request')
      const prompt = request.params.prompt
      requireValue(typeof prompt === 'string' && prompt.length > 0, 'Supply the full delivery prompt')
      const { mention } = JSON.parse(prompt.split('\n\n').at(-1))
      requireValue(mention && typeof mention.id === 'string' && mention.toActorId === mapping.actorId
        && mapping.allowedTaskIds.includes(mention.taskId) && mapping.allowedFromActorIds.includes(mention.fromActorId),
      'Channel delivery is outside the explicit Actor, task or sender scope', 'CHANNEL_SCOPE_DENIED')
      const { row, fresh } = ledger.submit(mention.id, prompt, mention.taskId)
      if (fresh) await mcp.notification({ method: 'notifications/claude/channel', params: { content: prompt,
        meta: { delivery_id: row.id, actor_id: mapping.actorId, task_id: mention.taskId } } })
      // Transport write is not acceptance. Return only a ledger identifier for polling.
      return { id: row.id }
    }
    socketServer = createServer(socket => {
      socket.setEncoding('utf8')
      sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {})
      socket.setTimeout(5000, () => socket.destroy())
      let buffer = '', handling = false
      socket.on('data', chunk => {
        if (handling) return socket.destroy()
        buffer += chunk
        if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) return socket.destroy()
        if (!buffer.includes('\n')) return
        handling = true
        Promise.resolve().then(() => handle(JSON.parse(buffer.slice(0, buffer.indexOf('\n')))))
          .then(result => socket.end(`${JSON.stringify({ result })}\n`), error => socket.end(`${JSON.stringify({ error: {
            code: error.code ?? 'CHANNEL_REQUEST_FAILED', message: error.message } })}\n`))
      })
    })
    await new Promise((resolve, reject) => { socketServer.once('error', reject); socketServer.listen(path, resolve) })
    return { close, ledger, mcp }
  } catch (error) { await close(); throw error }
}
