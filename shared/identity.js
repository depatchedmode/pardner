const DID_PREFIX = 'did:key:z'
const ED25519_CODEC = 0xed01n
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** The input is a validated 32-byte Ed25519 public key. */
export function machineIdFromRawKey(raw) {
  let value = ED25519_CODEC
  for (const byte of raw) value = (value << 8n) | BigInt(byte)
  let encoded = ''
  while (value > 0n) {
    encoded = BASE58[Number(value % 58n)] + encoded
    value /= 58n
  }
  return DID_PREFIX + encoded
}

/** Decode Pardner's canonical Ed25519 did:key profile, or return null. */
export function parseMachineId(id) {
  if (typeof id !== 'string' || id.length !== 56 || !id.startsWith(DID_PREFIX)) return null
  let value = 0n
  for (const char of id.slice(DID_PREFIX.length)) {
    const digit = BASE58.indexOf(char)
    if (digit < 0) return null
    value = value * 58n + BigInt(digit)
  }
  const raw = new Uint8Array(32)
  for (let i = raw.length - 1; i >= 0; i--) {
    raw[i] = Number(value & 0xffn)
    value >>= 8n
  }
  if (value !== ED25519_CODEC || machineIdFromRawKey(raw) !== id || ed25519KeyIssue(raw)) return null
  return raw
}

export const isMachineId = value => parseMachineId(value) !== null
export const isPersonId = isMachineId
export const machineIdShortForm = id => id.slice(-6)

const ED25519_SIGN_BIT = 1n << 255n
const ED25519_FIELD_PRIME = ED25519_SIGN_BIT - 19n
// The five y coordinates in libsodium 1.0.18's ge25519_has_small_order list.
const ED25519_SMALL_ORDER_Y = new Set([
  0n, 1n, ED25519_FIELD_PRIME - 1n,
  2707385501144840649318225287225658788936804267575313519463743609750303402022n,
  55188659117513257062467267217118295137698188065244968500265048394206261417927n,
])

/** Check the encoding of a 32-byte Ed25519 public key (Uint8Array). */
export function ed25519KeyIssue(raw) {
  let encoded = 0n
  for (let i = 31; i >= 0; i--) encoded = (encoded << 8n) | BigInt(raw[i])
  const y = encoded & (ED25519_SIGN_BIT - 1n)
  if (y >= ED25519_FIELD_PRIME) return 'non-canonical'
  // Masking the sign rejects both encodings at y = ±1, including invalid x = 0 with the sign set.
  if (ED25519_SMALL_ORDER_Y.has(y)) return 'small-order'
  return null
}
