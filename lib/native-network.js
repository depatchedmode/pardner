import { NetworkAdapter, cbor } from '@automerge/automerge-repo'
import { FRAME } from './machine-channel.js'
import { HandshakeError } from './machine-handshake.js'
import { isValidPeerMetadata, isValidStorageKeyComponent } from './storage-key.js'

export const ownedPeerId = (machineId, peerId) => `${machineId}/${peerId}`

export function ownsPeerId(machineId, peerId) {
  if (typeof peerId !== 'string' || !peerId.startsWith(`${machineId}/`)) return false
  return /^[A-Za-z0-9_-]{1,128}$/.test(peerId.slice(machineId.length + 1))
}

export function nativeMessage(payload) {
  const message = cbor.decode(payload)
  if (!isValidNativeMessage(message)) throw new HandshakeError('CHANNEL_INVALID', 'Invalid native sync message')
  return message
}

export class HubNetworkAdapter extends NetworkAdapter {
  constructor(server, machineId, canServe) {
    super()
    Object.assign(this, { server, machineId, canServe, sockets: new Map() })
  }

  isReady() { return true }
  whenReady() { return Promise.resolve() }

  connect(peerId, peerMetadata) {
    this.peerId = peerId
    this.wireId = ownedPeerId(this.machineId, peerId)
    this.peerMetadata = peerMetadata
    const keepalive = setInterval(() => {
      for (const socket of this.server.clients) {
        if (socket.readyState !== socket.OPEN) continue
        if (!socket.isAlive) socket.terminate()
        else {
          socket.isAlive = false
          socket.ping()
        }
      }
    }, 5000)
    keepalive.unref()
    this.server.once('close', () => clearInterval(keepalive))
  }

  admit(frames, machineId) {
    const { socket } = frames
    const entry = { frames, machineId, peerId: null }
    socket.once('close', () => this.remove(entry))
    const joinDeadline = setTimeout(() => {
      if (!entry.peerId) socket.terminate()
    }, 5000)
    joinDeadline.unref()
    socket.once('close', () => clearTimeout(joinDeadline))
    frames.attach(({ type, payload }) => {
      if (!this.canServe(machineId)) return socket.terminate()
      if (type !== FRAME.sync) throw new HandshakeError('CHANNEL_INVALID', 'Expected a native sync frame')
      const message = nativeMessage(payload)
      if (!entry.peerId) {
        if (message.type !== 'join' || !ownsPeerId(machineId, message.senderId)
          || !message.supportedProtocolVersions?.includes('1')) {
          throw new HandshakeError('CHANNEL_INVALID', 'Invalid native sync join')
        }
        clearTimeout(joinDeadline)
        const previous = this.sockets.get(message.senderId)
        if (previous) {
          this.remove(previous)
          previous.frames.socket.terminate()
        }
        entry.peerId = message.senderId
        this.sockets.set(entry.peerId, entry)
        frames.send(FRAME.sync, cbor.encode({ type: 'peer', senderId: this.wireId, targetId: entry.peerId,
          peerMetadata: this.peerMetadata, selectedProtocolVersion: '1' }))
        this.emit('peer-candidate', { peerId: entry.peerId, peerMetadata: message.peerMetadata })
        return
      }
      if (message.type === 'join' || message.senderId !== entry.peerId || message.targetId !== this.wireId) {
        throw new HandshakeError('CHANNEL_INVALID', 'Native sync message names another peer')
      }
      this.emit('message', { ...message, targetId: this.peerId })
    })
  }

  remove(entry) {
    if (!entry.peerId || this.sockets.get(entry.peerId) !== entry) return
    this.sockets.delete(entry.peerId)
    this.emit('peer-disconnected', { peerId: entry.peerId })
  }

  send(message) {
    const entry = this.sockets.get(message.targetId)
    if (!entry || entry.frames.socket.readyState !== entry.frames.socket.OPEN) return
    if (!this.canServe(entry.machineId)) return entry.frames.socket.terminate()
    try { entry.frames.send(FRAME.sync, cbor.encode({ ...message, senderId: this.wireId })) }
    catch { entry.frames.socket.terminate() }
  }

  disconnect() {
    for (const socket of this.server.clients) socket.terminate()
  }
}
const isRecord = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const isString = value => typeof value === 'string' && value.length > 0
const isPeerId = value => isString(value) && !Object.hasOwn(Object.prototype, value)
const isStringArray = value => Array.isArray(value) && value.every(isString)
const isStorageIds = value => value === undefined ||
  (Array.isArray(value) && value.every(isValidStorageKeyComponent))

function isValidNativeMessage(message) {
  if (!isRecord(message) || !isPeerId(message.senderId)) return false
  if (message.type === 'join') {
    return isValidPeerMetadata(message.peerMetadata) &&
      (message.peerMetadata === undefined || (isRecord(message.peerMetadata) &&
        (message.peerMetadata.isEphemeral === undefined || typeof message.peerMetadata.isEphemeral === 'boolean'))) &&
      (message.supportedProtocolVersions === undefined || isStringArray(message.supportedProtocolVersions))
  }
  if (!isPeerId(message.targetId)) return false
  if (message.type === 'remote-subscription-change') {
    return isStorageIds(message.add) && isStorageIds(message.remove)
  }
  if (!isValidStorageKeyComponent(message.documentId)) return false
  switch (message.type) {
    case 'sync':
    case 'request':
      return message.data instanceof Uint8Array && message.data.byteLength > 0
    case 'doc-unavailable':
      return true
    case 'ephemeral':
      return message.data instanceof Uint8Array && isString(message.sessionId) &&
        Number.isSafeInteger(message.count) && message.count >= 0
    case 'remote-heads-changed':
      return isRecord(message.newHeads) && Object.entries(message.newHeads).every(([storageId, state]) =>
        isValidStorageKeyComponent(storageId) && isRecord(state) &&
        isStringArray(state.heads) && Number.isFinite(state.timestamp))
    default:
      return false
  }
}
