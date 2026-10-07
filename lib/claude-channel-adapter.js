import { EventEmitter } from 'node:events'
import { connect } from 'node:net'
import { lstat } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { canonicalFilesystemPath } from './bridge-paths.js'
import { canonical, requireValue, OperationError } from './workspace-schema.js'

export const channelCapabilities = Object.freeze({ completionCleanup: false,
  nativeSessionIdentity: false, nativePolicyVerification: false, nativeBusyState: false,
  nativeTurnReceipt: false, cooperativeReceiptRecovery: true })

export function channelIdentity(mapping) {
  return { actorId: mapping.actorId, threadId: mapping.threadId,
    worktree: mapping.worktree, expectedPolicy: mapping.expectedPolicy }
}

export async function privateChannelDirectory(directory) {
  const info = await lstat(directory)
  requireValue(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid()
    && (info.mode & 0o077) === 0, 'Channel directory must belong to this user and have mode 0700', 'CHANNEL_DIRECTORY_UNSAFE')
}

export class ClaudeChannelAdapter extends EventEmitter {
  constructor(mapping) {
    super()
    this.directory = mapping.channelDirectory
    this.requestTimeoutMs = mapping.requestTimeoutMs ?? 5000
    this.receiptTimeoutMs = mapping.receiptTimeoutMs ?? 10000
    this.sockets = new Set()
  }

  async call(mapping, method, params = {}) {
    requireValue(!this.closed, 'Channel adapter is closed', 'CHANNEL_CLOSED')
    await privateChannelDirectory(this.directory)
    requireValue(!this.closed, 'Channel adapter is closed', 'CHANNEL_CLOSED')
    return new Promise((resolve, reject) => {
      const socket = connect(join(this.directory, 'channel.sock'))
      socket.setEncoding('utf8')
      this.sockets.add(socket)
      let buffer = '', done = false
      const finish = (error, value) => {
        if (done) return
        done = true; clearTimeout(timer); this.sockets.delete(socket); socket.destroy()
        if (error) reject(error); else resolve(value)
      }
      const timer = setTimeout(() => finish(new OperationError('CHANNEL_TIMEOUT', 'Channel RPC timed out')), this.requestTimeoutMs)
      socket.once('error', error => finish(error))
      socket.once('close', () => finish(new OperationError('CHANNEL_CLOSED', 'Channel connection closed')))
      socket.once('connect', () => socket.write(`${JSON.stringify({ method, identity: channelIdentity(mapping), params })}\n`))
      socket.on('data', chunk => {
        buffer += chunk
        if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) return finish(new Error('Channel response too large'))
        if (!buffer.includes('\n')) return
        try {
          const response = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
          if (response.error) finish(new OperationError(response.error.code, response.error.message))
          else finish(null, response.result)
        } catch (error) { finish(error) }
      })
    })
  }

  async describe(mapping) {
    const result = await this.call(mapping, 'describe')
    requireValue(canonical(result.identity) === canonical(channelIdentity(mapping)), 'Channel binding differs from the configured mapping', 'CHANNEL_BINDING_CHANGED')
    return result
  }

  async availability(mapping) {
    const description = await this.describe(mapping)
    this.state = description.availability
    return this.state
  }

  activity() { return this.state ?? 'accepted: native harness state not observed' }

  async dispatch(mapping, prompt) {
    const row = await this.call(mapping, 'submit', { prompt })
    const deadline = Date.now() + this.receiptTimeoutMs
    while (!this.closed) {
      const observed = await this.call(mapping, 'receipt', { id: row.id })
      if (observed.receipt) { this.state = 'accepted: cooperative channel receipt'; return observed.receipt }
      requireValue(Date.now() < deadline, 'Claude has not acknowledged the channel delivery; reconcile before retry', 'CHANNEL_RECEIPT_UNCERTAIN')
      await new Promise(resolve => { this.pollTimer = setTimeout(resolve, 50); this.resolvePoll = resolve })
      this.resolvePoll = null
    }
    throw new OperationError('CHANNEL_CLOSED', 'Channel adapter is closed')
  }

  async reconcile(mapping, prompt) {
    return (await this.call(mapping, 'reconcile', { prompt })).receipt
  }

  close() {
    this.closed = true
    clearTimeout(this.pollTimer); this.resolvePoll?.()
    for (const socket of this.sockets) socket.destroy()
  }
}

export const claudeChannelProvider = Object.freeze({
  id: 'claude-code-channel', capabilities: channelCapabilities,
  async validateMapping(mapping) {
    const fields = new Set(['actorId', 'adapter', 'enabled', 'sessionOwner', 'threadId', 'worktree',
      'channelDirectory', 'expectedPolicy', 'allowedTaskIds', 'allowedFromActorIds', 'requestTimeoutMs', 'receiptTimeoutMs'])
    requireValue(Object.keys(mapping).every(key => fields.has(key)), 'Claude channel mappings do not accept credentials, native policy overrides or launch arguments')
    requireValue(mapping.sessionOwner === 'bridge', 'Use a dedicated bridge-owned Claude channel')
    requireValue(isAbsolute(mapping.channelDirectory ?? ''), 'Channel directory must be absolute')
    mapping.channelDirectory = await canonicalFilesystemPath(mapping.channelDirectory)
    requireValue(mapping.expectedPolicy?.verification === 'unavailable'
      && mapping.expectedPolicy?.permissionHandling === 'local-only'
      && Object.keys(mapping.expectedPolicy).length === 2,
    'Claude channels cannot attest native permissions; explicitly select verification unavailable and permissionHandling local-only')
    for (const field of ['requestTimeoutMs', 'receiptTimeoutMs']) {
      if (mapping[field] !== undefined) requireValue(Number.isInteger(mapping[field]) && mapping[field] >= 1 && mapping[field] <= 600000, `Invalid ${field}`)
    }
  },
  connectionIdentity: mapping => ({ channelDirectory: mapping.channelDirectory }),
  create: mapping => new ClaudeChannelAdapter(mapping),
  inspectionMapping() { throw new OperationError('INVALID_ARGUMENT', 'Inspect Claude channels with --config and --actor') },
})
