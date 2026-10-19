import { cbor } from '@automerge/automerge-repo'
import { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket'
import { isValidPeerMetadata, isValidStorageKeyComponent } from './storage-key.js'

export class ValidatedWebSocketServerAdapter extends WebSocketServerAdapter {
  receiveMessage(messageBytes, socket) {
    // Ignore frames already queued when a previous frame closed the connection.
    if (socket.readyState !== 1) return

    try {
      const message = cbor.decode(messageBytes)
      if (!isValidNativeMessage(message)) {
        socket.close(1008, 'Invalid Automerge message')
        return
      }

      // Include upstream decoding, protocol negotiation and synchronous Repo dispatch.
      super.receiveMessage(messageBytes, socket)
    } catch {
      socket.close(1008, 'Invalid Automerge message')
    }
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
