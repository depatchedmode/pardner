import { NetworkAdapter, cbor } from '@automerge/automerge-repo'
import { WebSocket } from 'ws'
import { isValidPeerMetadata } from './storage-key.js'
import { FRAME } from './machine-channel.js'
import { HANDSHAKE_TIMEOUT_MS, HandshakeError } from './machine-handshake.js'
import { nativeMessage, ownedPeerId, ownsPeerId } from './native-network.js'

const PROTOCOL_VERSION = '1'
const RETRY_CAP_MS = 4000

/** The replica owns reconnects and exposes a peer only after the v2 welcome and sealed Repo join. */
export class TicketNetworkAdapter extends NetworkAdapter {
  constructor({ getUrl, handshake, retryMs = 1000, connectTimeoutMs = HANDSHAKE_TIMEOUT_MS }) {
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
    this.failures = 0
  }

  isReady() { return this.ready }
  whenReady() { return this.readyPromise }

  markReady() {
    this.ready = true
    this.resolveReady()
  }

  setState(state, error = null) {
    this.state = state
    this.emit('transport-state', { state, error: error?.message ?? null, code: error?.code ?? null, details: error?.details ?? null })
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
    this.connectTimer = setTimeout(() => this.retry(generation, new HandshakeError('HANDSHAKE_TIMEOUT', 'WebSocket handshake timed out')), this.connectTimeoutMs)
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
      socket.on('close', () => {
        const error = child.frames?.failure ?? (child.remotePeerId ? null
          : new HandshakeError('HANDSHAKE_CLOSED', 'The hub connection closed before sync started'))
        this.retry(generation, error)
      })
      socket.once('open', async () => {
        try {
          const welcome = await this.handshake(socket, this.controller.signal)
          if (this.stopped || generation !== this.generation || socket.readyState !== WebSocket.OPEN) return
          Object.assign(child, { frames: welcome.frames, machineId: welcome.responder.machineId,
            localId: ownedPeerId(welcome.transcript.initiator.machineId, this.peerId) })
          child.frames.attach(({ type, payload }) => {
            if (type === FRAME.control) return this.retry(generation, welcome.refusal(payload))
            if (type !== FRAME.sync || !child.joinSent) throw new HandshakeError('CHANNEL_INVALID', 'Unexpected protected frame')
            this.receiveProtected(child, payload)
          })
          child.joinSent = true
          this.sendFrame({ type: 'join', senderId: this.peerId, peerMetadata: this.peerMetadata, supportedProtocolVersions: [PROTOCOL_VERSION] })
        } catch (error) {
          this.retry(generation, error)
        }
      })
    } catch (error) {
      this.retry(generation, error)
    }
  }

  receiveProtected(child, payload) {
    if (!child.remotePeerId) {
      const message = cbor.decode(payload)
      if (message?.type !== 'peer' || !ownsPeerId(child.machineId, message.senderId) || message.targetId !== child.localId
        || message.selectedProtocolVersion !== PROTOCOL_VERSION || !isValidPeerMetadata(message.peerMetadata)) {
        throw new HandshakeError('CHANNEL_INVALID', 'The hub sent an invalid peer announcement')
      }
      this.connected(child, message)
      return
    }
    const message = nativeMessage(payload)
    if (message.type === 'join' || message.senderId !== child.remotePeerId || message.targetId !== child.localId) {
      throw new HandshakeError('CHANNEL_INVALID', 'Native sync message names another peer')
    }
    this.emit('message', { ...message, targetId: this.peerId })
  }

  connected(child, message) {
    child.remotePeerId = message.senderId
    this.emit('peer-candidate', { peerId: message.senderId, peerMetadata: message.peerMetadata })
    clearTimeout(this.connectTimer)
    this.failures = 0
    this.markReady()
    this.setState('connected')
  }

  sendFrame(message) {
    const child = this.child
    if (!child?.frames || child.socket.readyState !== WebSocket.OPEN) return
    try { child.frames.send(FRAME.sync, cbor.encode({ ...message, senderId: child.localId })) }
    catch (error) { this.retry(this.generation, error) }
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
    const delay = Math.min(Math.max(this.retryMs, RETRY_CAP_MS), this.retryMs * 2 ** Math.min(this.failures++, 8))
    this.retryTimer = setTimeout(() => { void this.attempt() }, delay)
  }

  dropChild() {
    clearTimeout(this.readyTimer)
    if (!this.child) return
    const { socket, remotePeerId } = this.child
    this.child = null
    socket.removeAllListeners()
    // ws reports cancellation of a pending handshake as an error after listeners are gone.
    socket.on('error', () => {})
    socket.terminate()
    if (remotePeerId) this.emit('peer-disconnected', { peerId: remotePeerId })
  }

  disconnect(error = null) {
    this.stopped = true
    this.generation++
    this.controller?.abort()
    clearTimeout(this.connectTimer)
    clearTimeout(this.retryTimer)
    this.dropChild()
    if (error) this.markReady()
    this.setState('offline', error)
  }

  send(message) {
    if ('data' in message && message.data?.byteLength === 0) throw new Error('Tried to send a zero-length message')
    this.sendFrame(message)
  }
}
