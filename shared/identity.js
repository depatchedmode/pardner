const MACHINE_PREFIX = 'machine-'
const PERSON_PREFIX = 'person-'
const ID_SUFFIX_LENGTH = 26
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const ID_SUFFIX_PATTERN = `[a-z2-7]{${ID_SUFFIX_LENGTH}}$`
const MACHINE_ID = new RegExp(`^${MACHINE_PREFIX}${ID_SUFFIX_PATTERN}`)
export const PERSON_ID = new RegExp(`^${PERSON_PREFIX}${ID_SUFFIX_PATTERN}`)

export const isMachineId = value => MACHINE_ID.test(value)
export const isPersonId = value => PERSON_ID.test(value)

/** For display, cut at the same offsets even if the ID is malformed. */
export const machineIdShortForm = id => id.slice(MACHINE_PREFIX.length, MACHINE_PREFIX.length + 6)

/** Lowercase RFC 4648 base32 without padding. */
function base32(bytes) {
  let bits = 0, value = 0, encoded = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      encoded += BASE32_ALPHABET[(value >>> bits) & 31]
    }
  }
  if (bits) encoded += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return encoded
}

export const machineIdFromDigest = digest => MACHINE_PREFIX + base32(digest).slice(0, ID_SUFFIX_LENGTH)
export const personIdFromDigest = digest => PERSON_PREFIX + base32(digest).slice(0, ID_SUFFIX_LENGTH)

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
