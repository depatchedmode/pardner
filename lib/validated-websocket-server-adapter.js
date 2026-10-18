import { cbor } from '@automerge/automerge-repo'
import { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket'
import { isValidPeerMetadata } from './storage-key.js'

export class ValidatedWebSocketServerAdapter extends WebSocketServerAdapter {
  receiveMessage(messageBytes, socket) {
    // Ignore frames already queued when a previous frame closed the connection.
    if (socket.readyState !== 1) return

    let message
    try {
      message = cbor.decode(messageBytes)
    } catch {
      socket.close(1008, 'Invalid Automerge message')
      return
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      socket.close(1008, 'Invalid Automerge message')
      return
    }

    if (message.type === 'join' && !isValidPeerMetadata(message.peerMetadata)) {
      socket.close(1008, 'Invalid peer storage metadata')
      return
    }

    // Validate before the upstream adapter emits peer-candidate to Repo.
    super.receiveMessage(messageBytes, socket)
  }
}
