import { NetworkAdapter } from '@automerge/automerge-repo'
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { isValidPeerMetadata } from './storage-key.js'

/** Own retry and ticket renewal; the underlying adapter retries a fixed URL. */
export class TicketNetworkAdapter extends NetworkAdapter {
  constructor({ getUrl, retryMs = 1000, connectTimeoutMs = 5000 }) {
    super()
    this.getUrl = getUrl
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
    this.emit('transport-state', { state, error: error?.message ?? null })
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
    try {
      const url = await this.getUrl(this.controller.signal)
      if (this.stopped || generation !== this.generation) return
      // Retry timers and errors are owned here so every attempt gets a new URL.
      const child = new WebSocketClientAdapter(url, 2 ** 31 - 1)
      this.child = child
      child.onClose = () => this.retry(generation)
      child.onError = event => this.retry(generation, event.error ?? new Error('WebSocket connection failed'))
      for (const event of ['peer-disconnected', 'message']) {
        child.on(event, payload => this.emit(event, payload))
      }
      child.on('peer-candidate', candidate => {
        // The hub's storage ID becomes a local storage key; refuse it before Repo does.
        if (!isValidPeerMetadata(candidate.peerMetadata)) {
          // Repo never saw this hub, so it must not hear of it disconnecting.
          child.removeAllListeners()
          this.retry(generation, new Error('Hub sent invalid peer storage metadata'))
          return
        }
        this.emit('peer-candidate', candidate)
        clearTimeout(this.connectTimer)
        this.markReady()
        this.setState('connected')
      })
      child.connect(this.peerId, this.peerMetadata)
      child.whenReady().then(() => {
        if (generation === this.generation) this.markReady()
      })
    } catch (error) {
      this.retry(generation, error)
    }
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
    if (!this.child) return
    const socket = this.child.socket
    if (socket?.readyState === 0) {
      // ws reports cancellation as an error after the adapter removes listeners.
      socket.once('error', () => {})
    }
    this.child.disconnect()
    this.child.removeAllListeners()
    this.child = null
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

  send(message) { this.child?.send(message) }
}
