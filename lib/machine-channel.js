import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from 'node:crypto'
import { canonical } from './workspace-schema.js'

const X25519_SPKI = Buffer.from('302a300506032b656e032100', 'hex')
const TAG_BYTES = 16
const LAST_COUNTER = (1n << 64n) - 1n
const MAX_PAYLOAD = 100 * 1024 * 1024 - TAG_BYTES - 1
export const FRAME = Object.freeze({ control: 1, sync: 2, ping: 3, pong: 4 })

export function ephemeralKey() {
  const { privateKey, publicKey } = generateKeyPairSync('x25519')
  return { privateKey, wireKey: publicKey.export({ type: 'spki', format: 'der' }).subarray(X25519_SPKI.length).toString('base64url') }
}

export function validEphemeral(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').toString('base64url') === value
}

export function channelSecrets(shared, transcriptBytes) {
  const salt = createHash('sha256').update(transcriptBytes).digest()
  return ['initiator', 'responder'].map(side => Buffer.from(hkdfSync('sha256', shared, salt, `pardner/channel/v2/${side}`, 32)))
}

export function deriveChannel(privateKey, remoteKey, transcript, initiating) {
  const publicKey = createPublicKey({ key: Buffer.concat([X25519_SPKI, Buffer.from(remoteKey, 'base64url')]), type: 'spki', format: 'der' })
  const shared = diffieHellman({ privateKey, publicKey })
  try {
    const [initiator, responder] = channelSecrets(shared, Buffer.from(canonical(transcript)))
    return initiating ? channel(initiator, responder) : channel(responder, initiator)
  } finally { shared.fill(0) }
}

function nonce(counter) {
  if (counter > LAST_COUNTER) throw new Error('Channel counter exhausted')
  const value = Buffer.alloc(12)
  value.writeBigUInt64BE(counter, 4)
  return value
}

function validType(type, length) {
  return type === FRAME.control || type === FRAME.sync || ((type === FRAME.ping || type === FRAME.pong) && length === 0)
}

export function channel(sendKey, receiveKey) {
  let sent = 0n, received = 0n, failed = false
  return {
    seal(type, payload) {
      try {
        if (failed || payload.byteLength > MAX_PAYLOAD || !validType(type, payload.byteLength)) throw new Error('Invalid outgoing frame')
        const cipher = createCipheriv('chacha20-poly1305', sendKey, nonce(sent++), { authTagLength: TAG_BYTES })
        const kind = cipher.update(Buffer.of(type))
        const data = cipher.update(payload)
        cipher.final()
        return Buffer.concat([kind, data, cipher.getAuthTag()])
      } catch (error) { failed = true; throw error }
    },
    open(frame) {
      try {
        if (failed || frame.length < TAG_BYTES + 1 || frame.length > MAX_PAYLOAD + TAG_BYTES + 1) throw new Error('Invalid frame length')
        const decipher = createDecipheriv('chacha20-poly1305', receiveKey, nonce(received++), { authTagLength: TAG_BYTES })
        decipher.setAuthTag(frame.subarray(-TAG_BYTES))
        const data = decipher.update(frame.subarray(0, -TAG_BYTES))
        decipher.final()
        const type = data[0], payload = data.subarray(1)
        if (!validType(type, payload.length)) throw new Error('Unknown or malformed frame type')
        return { type, payload }
      } catch (error) { failed = true; throw error }
    },
  }
}
