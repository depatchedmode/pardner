import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

export const MACHINE_KEY_FILE = 'machine-key.pem'

export function rawPublicKey(publicKey) {
  const key = typeof publicKey === 'string'
    ? createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' })
    : publicKey
  if (key?.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 public key')
  const raw = Buffer.from(key.export({ format: 'jwk' }).x, 'base64url')
  if (typeof publicKey === 'string' && raw.toString('base64url') !== publicKey) throw new Error('Expected canonical base64url public key')
  return raw
}

export function machineIdentity(publicKey) {
  const digest = createHash('sha256').update(rawPublicKey(publicKey)).digest()
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0, value = 0, encoded = ''
  for (const byte of digest) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      encoded += alphabet[(value >>> bits) & 31]
    }
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31]
  return { machineId: `machine-${encoded.slice(0, 26)}`, actorIdPrefix: digest.subarray(0, 16) }
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
