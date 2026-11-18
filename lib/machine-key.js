import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

export const MACHINE_KEY_FILE = 'machine-key.pem'

const ED25519_SIGN_BIT = 1n << 255n
const ED25519_FIELD_PRIME = ED25519_SIGN_BIT - 19n
// The five y coordinates in libsodium 1.0.18's ge25519_has_small_order list.
const ED25519_SMALL_ORDER_Y = new Set([
  0n, 1n, ED25519_FIELD_PRIME - 1n,
  2707385501144840649318225287225658788936804267575313519463743609750303402022n,
  55188659117513257062467267217118295137698188065244968500265048394206261417927n,
])

export function rawPublicKey(publicKey) {
  const isText = typeof publicKey === 'string'
  if (!isText && (publicKey?.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519')) {
    throw new Error('Expected an Ed25519 public key')
  }
  const encoded = isText ? publicKey : publicKey.export({ format: 'jwk' }).x
  const raw = Buffer.from(encoded, 'base64url')
  if (raw.length !== 32 || raw.toString('base64url') !== encoded) throw new Error('Expected canonical base64url public key')

  const y = BigInt(`0x${Buffer.from(raw).reverse().toString('hex')}`) & (ED25519_SIGN_BIT - 1n)
  if (y >= ED25519_FIELD_PRIME) throw new Error('Non-canonical Ed25519 public key')
  // Masking the sign rejects both encodings at y = ±1, including invalid x = 0 with the sign set.
  if (ED25519_SMALL_ORDER_Y.has(y)) throw new Error('Small-order Ed25519 public key')
  return raw
}

/** Lowercase RFC 4648 base32 without padding. */
function base32(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0, value = 0, encoded = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      encoded += alphabet[(value >>> bits) & 31]
    }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31]
  return encoded
}

export function machineIdentity(publicKey) {
  const digest = createHash('sha256').update(rawPublicKey(publicKey)).digest()
  return { machineId: `machine-${base32(digest).slice(0, 26)}`, actorIdPrefix: digest.subarray(0, 16) }
}

export const PERSON_DOMAIN = 'pardner/person/v1'
export const PERSON_ID = /^person-[a-z2-7]{26}$/

/**
 * The ID of the person admitted with the machine that holds `publicKey`:
 * `person-` and the first 26 base32 characters of sha256(PERSON_DOMAIN ‖ raw
 * public key). The label keeps it distinct from the machine ID of the same
 * key. A person keeps this ID however many machines they pair later.
 */
export function personIdFor(publicKey) {
  return `person-${base32(createHash('sha256').update(PERSON_DOMAIN).update(rawPublicKey(publicKey)).digest()).slice(0, 26)}`
}

// Protocol domains are fixed versioned constants, not caller-controlled labels.
// No separator is inserted: membership requires exactly domain || canonical(record).
function message(domain, bytes) {
  if (typeof domain !== 'string' || !domain.length) throw new Error('A signing domain is required')
  if (!(bytes instanceof Uint8Array)) throw new Error('Signing payload must be bytes')
  return Buffer.concat([Buffer.from(domain, 'utf8'), bytes])
}

function machineKey(privateKey) {
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 private key')
  const publicKey = createPublicKey(privateKey)
  return {
    privateKey,
    publicKey: rawPublicKey(publicKey).toString('base64url'),
    ...machineIdentity(publicKey),
    sign: (domain, bytes) => cryptoSign(null, message(domain, bytes), privateKey),
  }
}

export function generateMachineKey() {
  return machineKey(generateKeyPairSync('ed25519').privateKey)
}

/**
 * The key as PKCS#8 PEM, for the client's own per-project runtime processes,
 * which receive it over their IPC channel (never through arguments, the
 * environment or another file).
 */
export function machineKeyPem(key) { return key.privateKey.export({ format: 'pem', type: 'pkcs8' }) }
export function machineKeyFromPem(pem) { return machineKey(createPrivateKey(pem)) }

export function verify(publicKey, domain, bytes, signature) {
  try {
    const raw = rawPublicKey(publicKey)
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' })
    return signature instanceof Uint8Array && signature.length === 64 && cryptoVerify(null, message(domain, bytes), key, signature)
  } catch {
    return false
  }
}

// Exclusive creation never replaces a directory's existing identity. Failed writes
// remain visible as invalid files; callers must not silently regenerate lost keys.
export async function saveMachineKey(directory, key) {
  const pem = key.privateKey.export({ format: 'pem', type: 'pkcs8' })
  machineKey(key.privateKey)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = await open(join(directory, MACHINE_KEY_FILE), 'wx', 0o600)
  try {
    await file.chmod(0o600)
    await file.writeFile(pem, 'utf8')
    await file.sync()
  } finally {
    await file.close()
  }
}

export async function loadMachineKey(directory) {
  const file = await open(join(directory, MACHINE_KEY_FILE), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Machine key must be a regular file')
    if ((stat.mode & 0o777) & ~0o600) throw new Error('Machine key permissions must be 0600 or stricter; refuse to load an exposed key')
    return machineKey(createPrivateKey(await file.readFile('utf8')))
  } finally {
    await file.close()
  }
}
