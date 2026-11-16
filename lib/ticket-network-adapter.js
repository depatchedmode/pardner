import { NetworkAdapter, cbor } from '@automerge/automerge-repo'
import { WebSocket } from 'ws'
import { isValidPeerMetadata } from './storage-key.js'

const PROTOCOL_VERSION = '1'
const toArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

/**
 * The replica's connection to its hub: its own retry, a fresh URL per attempt,
 * and an optional `handshake(socket, signal)` that must finish on the open
 * socket before any Automerge frame is sent or accepted. The Automerge side is
 * the websocket client protocol of @automerge/automerge-repo-network-websocket:
 * a `join`, the hub's `peer` answer, then CBOR messages.
 */
export class TicketNetworkAdapter extends NetworkAdapter {
  constructor({ getUrl, handshake = null, retryMs = 1000, connectTimeoutMs = 5000 }) {
    super()
    this.getUrl = getUrl
    this.handshake = handshake
    this.retryMs = retryMs
    this.connectTimeoutMs = connectTimeoutMs
    this.stopped = true
    this.generation = 0
    this.ready = false
    this.readyPromise = new Promise(resolve => { this.resolveReady = resolve })
    this.state = 'offline'
  }

  isReady() { return this.ready }
  whenReady() { return this.readyPromise }

  markReady() {
    this.ready = true
    this.resolveReady()
  }

  setState(state, error = null) {
    this.state = state
    this.emit('transport-state', { state, error: error?.message ?? null, code: error?.code ?? null })
  }

  connect(peerId, peerMetadata) {
    this.disconnect()
    this.stopped = false
    this.peerId = peerId
    this.peerMetadata = peerMetadata
    void this.attempt()
  }

  async attempt() {
    if (this.stopped) return
    const generation = ++this.generation
    this.controller = new AbortController()
    this.setState('connecting')
    this.connectTimer = setTimeout(() => this.retry(generation, new Error('WebSocket handshake timed out')), this.connectTimeoutMs)
    // A hub that never answers must not hold up documents that are already available locally.
    this.readyTimer = setTimeout(() => this.markReady(), 1000)
    try {
      const url = await this.getUrl(this.controller.signal)
      if (this.stopped || generation !== this.generation) return
      // Retry timers and errors are owned here so every attempt gets a new URL.
      const socket = new WebSocket(url)
      const child = { socket, remotePeerId: null }
      this.child = child
      socket.on('error', error => this.retry(generation, error))
      socket.on('close', (code, reason) => this.retry(generation, code === 1000 || code === 1005 ? null
        : Object.assign(new Error(reason?.length ? reason.toString() : `The hub closed the connection (${code})`), { code: reason?.length ? reason.toString() : undefined })))
      socket.once('open', async () => {
        try {
          if (this.handshake) await this.handshake(socket, this.controller.signal)
          if (this.stopped || generation !== this.generation || socket.readyState !== WebSocket.OPEN) return
          socket.on('message', (data, binary) => {
            if (!binary) return this.retry(generation, new Error('The hub sent an unexpected text frame'))
            this.receive(generation, child, data)
          })
          this.sendFrame({ type: 'join', senderId: this.peerId, peerMetadata: this.peerMetadata, supportedProtocolVersions: [PROTOCOL_VERSION] })
        } catch (error) {
          this.retry(generation, error)
        }
      })
    } catch (error) {
      this.retry(generation, error)
    }
  }

  receive(generation, child, data) {
    let message
    try { message = cbor.decode(new Uint8Array(data)) } catch { return }
    if (message?.type === 'peer') {
      // The hub's storage ID becomes a local storage key; refuse it before Repo does.
      if (!isValidPeerMetadata(message.peerMetadata)) {
        // Repo never saw this hub, so it must not hear of it disconnecting.
        this.retry(generation, new Error('Hub sent invalid peer storage metadata'))
        return
      }
      child.remotePeerId = message.senderId
      this.emit('peer-candidate', { peerId: message.senderId, peerMetadata: message.peerMetadata })
      clearTimeout(this.connectTimer)
      this.markReady()
      this.setState('connected')
      return
    }
    if (message?.type === 'error') return
    this.emit('message', message)
  }

  sendFrame(message) {
    const socket = this.child?.socket
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(toArrayBuffer(cbor.encode(message)))
  }

  retry(generation, error = null) {
    if (this.stopped || generation !== this.generation) return
    this.generation++
    this.controller?.abort()
    clearTimeout(this.connectTimer)
    this.dropChild()
    this.markReady()
    this.setState('offline', error)
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => { void this.attempt() }, this.retryMs)
  }

  dropChild() {
    clearTimeout(this.readyTimer)
    if (!this.child) return
    const { socket, remotePeerId } = this.child
    this.child = null
    socket.removeAllListeners()
    // ws reports cancellation of a pending handshake as an error after listeners are gone.
    socket.on('error', () => {})
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
    else socket.close()
    if (remotePeerId) this.emit('peer-disconnected', { peerId: remotePeerId })
  }

  disconnect() {
    this.stopped = true
    this.generation++
    this.controller?.abort()
    clearTimeout(this.connectTimer)
    clearTimeout(this.retryTimer)
    this.dropChild()
    this.setState('offline')
  }

  send(message) {
    if ('data' in message && message.data?.byteLength === 0) throw new Error('Tried to send a zero-length message')
    this.sendFrame(message)
  }
}
