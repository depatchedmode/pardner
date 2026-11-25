import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { joinRequestRefusal, offerRefusal } from '../lib/enrollment.js'
import { createHello, readHello } from '../lib/machine-handshake.js'
import { generateMachineKey, loadMachineKey, machineIdentity, MACHINE_KEY_FILE, rawPublicKey, saveMachineKey, verify } from '../lib/machine-key.js'
import { verifyRecord } from '../lib/membership.js'
import { isMachineId, isPersonId, machineIdFromRawKey, machineIdShortForm, parseMachineId } from '../shared/identity.js'
import { trustProject } from '../support/trust-records.js'

const MEMBERSHIP_DOMAIN = 'pardner/member/v1'

function encodeY(y) {
  return Buffer.from(y.toString(16).padStart(64, '0'), 'hex').reverse()
}

const fieldPrime = 2n ** 255n - 19n
// The canonical small-order y encodings from libsodium 1.0.18's ge25519_has_small_order.
const smallOrderY = [
  encodeY(0n), encodeY(1n), encodeY(fieldPrime - 1n),
  Buffer.from('26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05', 'hex'),
  Buffer.from('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', 'hex'),
]
const outOfRangeY = Array.from({ length: 19 }, (_, offset) => encodeY(fieldPrime + BigInt(offset)))
const rejectedKeys = [...smallOrderY, ...outOfRangeY].flatMap(raw => {
  const withSignBit = Buffer.from(raw)
  withSignBit[31] |= 0x80
  return [raw, withSignBit]
})

test('machine and person IDs use one canonical Ed25519 did:key profile', () => {
  const { owner, ownerId, offer } = trustProject()
  const signed = offer(owner, { purpose: 'human', role: 'member' })
  assert.equal(offerRefusal(signed, owner.machineId), null)
  assert.equal(ownerId, owner.machineId)
  assert.ok(isMachineId(ownerId) && isPersonId(ownerId))
  const id = owner.machineId
  for (const value of [
    null, 42, [id], '', id.slice(0, -1), `${id}#${id.slice(8)}`, `${id}?key=1`,
    `DID:KEY:${id.slice(8)}`, `${id.slice(0, -1)}0`, ` ${id}`, `${id} `, `${id}\n`,
    `did:key:z1${id.slice(10)}`, 'did:key:z6LSdWQe7d3AMs9iC9MTALuP3EJSHTocSkUpH8HF7WXmf6mV',
    'did:key:zQ3shokFTS3brHcDQrn82RUDfCZESWL1ZdCEJwekUDPQiYBme',
    'machine-eh7ddx5bksrgcytl7bkai36se4', 'person-eh7ddx5bksrgcytl7bkai36se4',
  ]) {
    assert.equal(parseMachineId(value), null, JSON.stringify(value))
    assert.equal(isPersonId(value), false, JSON.stringify(value))
    assert.equal(offerRefusal({ ...signed, signer: value }, null), 'Incomplete invitation offer', JSON.stringify(value))
  }
})

test('rawPublicKey distinguishes key type, base64url format, and byte-level refusals', () => {
  const { publicKey } = generateMachineKey()
  const cases = [
    [null, 'Expected an Ed25519 public key'],
    [generateKeyPairSync('x25519').publicKey, 'Expected an Ed25519 public key'],
    ['', 'Expected canonical base64url public key'],
    [publicKey + '=', 'Expected canonical base64url public key'],
    [Buffer.alloc(31).toString('base64url'), 'Expected canonical base64url public key'],
    [encodeY(fieldPrime).toString('base64url'), 'Non-canonical Ed25519 public key'],
    [encodeY(1n).toString('base64url'), 'Small-order Ed25519 public key'],
  ]
  for (const [value, message] of cases) assert.throws(() => rawPublicKey(value), { message })
})

test('rawPublicKey rejects all small-order points and non-canonical encodings', () => {
  for (const raw of rejectedKeys) {
    assert.throws(() => rawPublicKey(raw.toString('base64url')), /Ed25519 public key/, raw.toString('hex'))
  }
})

test('verify refuses an attempted forgery for every rejected key encoding', () => {
  const payload = Buffer.from('test payload')
  // Fixed rejection input from #253. Key validation must run before signature verification.
  const signature = Buffer.concat([encodeY(1n), Buffer.alloc(32)])
  for (const raw of rejectedKeys) {
    assert.equal(verify(raw.toString('base64url'), MEMBERSHIP_DOMAIN, payload, signature), false, raw.toString('hex'))
  }
})

test('membership records, join requests and handshake hellos reject invalid Ed25519 keys', () => {
  const project = trustProject()
  const { owner, genesis, projectId, ownerId } = project
  const offer = project.offer(owner, { purpose: 'device', personId: ownerId })
  const request = project.consent(generateMachineKey(), offer, ownerId)
  const route = 'wss://hub.example.test/sync'
  const hello = createHello(owner, { projectId, route, role: 'replica' })
  const helloOptions = { projectId, acceptRoute: value => value === route }
  assert.deepEqual(verifyRecord(genesis, projectId), { valid: true })
  assert.equal(joinRequestRefusal(request, offer), null)
  assert.equal(readHello(hello, helloOptions).initiator.machineId, owner.machineId)

  for (const raw of rejectedKeys) {
    const encoding = raw.toString('hex')
    const publicKey = raw.toString('base64url')
    const machineId = machineIdFromRawKey(raw)
    assert.equal(parseMachineId(machineId), null, encoding)
    const record = verifyRecord({ ...genesis, machineId, signer: machineId }, projectId)
    assert.equal(record.valid, false, encoding)
    assert.equal(record.reason, 'Invalid subject or signer', encoding)
    assert.equal(joinRequestRefusal({ ...request, machineId }, offer), 'Invalid join request machine ID', encoding)
    assert.throws(() => readHello({ ...hello, initiator: { ...hello.initiator, publicKey, machineId } }, helloOptions), {
      code: 'HANDSHAKE_INVALID', message: 'Malformed handshake',
    }, encoding)
  }
})

test('fresh Ed25519 keys retain their bytes and verify signatures', () => {
  const payload = Buffer.from('generated key test')
  for (let i = 0; i < 256; i++) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const { x } = publicKey.export({ format: 'jwk' })
    const raw = Buffer.from(x, 'base64url')
    assert.deepEqual(rawPublicKey(publicKey), raw)
    assert.deepEqual(rawPublicKey(x), raw)
    assert.deepEqual(Buffer.from(parseMachineId(machineIdentity(x).machineId)), raw)
    const signature = sign(null, Buffer.concat([Buffer.from(MEMBERSHIP_DOMAIN), payload]), privateKey)
    assert.equal(verify(x, MEMBERSHIP_DOMAIN, payload, signature), true)
  }
})

test('published Ed25519 vectors round-trip and keep their raw-key Automerge actor prefixes', () => {
  const vectors = [
    // RFC 8032, test 1
    ['d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      'did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw', '21fe31dfa154a261626bf854046fd227'],
    // did:key specification, Ed25519 verification key example
    ['3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
      'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp', '139e3940e64b5491722088d9a0d74162'],
  ]
  for (const [hex, did, prefix] of vectors) {
    const raw = Buffer.from(hex, 'hex')
    assert.deepEqual(machineIdentity(raw.toString('base64url')), { machineId: did, actorIdPrefix: Buffer.from(prefix, 'hex') })
    assert.deepEqual(Buffer.from(parseMachineId(did)), raw)
    assert.equal(machineIdShortForm(did), did.slice(-6))
  }
})

test('matches the published freeq device-key vector', () => {
  // https://github.com/freeq-irc/freeq/blob/36fca961d38fd07a7c43eb8bcf505cd43d596a20/spec/identity-record-vectors.json
  const seed = Buffer.alloc(32, 1)
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    format: 'der', type: 'pkcs8' })
  const publicKey = createPublicKey(privateKey)
  const did = 'did:key:z6Mkon3Necd6NkkyfoGoHxid2znGc59LU3K7mubaRcFbLfLX'
  assert.equal(machineIdentity(publicKey).machineId, did)
  assert.deepEqual(Buffer.from(parseMachineId(did)), rawPublicKey(publicKey))
})

test('signatures use the exact domain prefix and cannot cross protocol domains', () => {
  const key = generateMachineKey(), payload = Buffer.from('hello')
  const signature = key.sign(MEMBERSHIP_DOMAIN, payload)
  assert.deepEqual(signature, sign(null, Buffer.concat([Buffer.from(MEMBERSHIP_DOMAIN), payload]), key.privateKey))
  assert.equal(verify(key.publicKey, MEMBERSHIP_DOMAIN, payload, signature), true)
  assert.equal(verify(key.publicKey, 'pardner/change/v1', payload, signature), false)
  assert.equal(verify(generateMachineKey().publicKey, MEMBERSHIP_DOMAIN, payload, signature), false)
  assert.equal(verify('invalid', MEMBERSHIP_DOMAIN, payload, signature), false)
})

test('keys round-trip at 0600; exposed files, symlinks, corrupt files and overwrites are refused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-machine-key-'))
  try {
    const key = generateMachineKey(), path = join(directory, MACHINE_KEY_FILE)
    await saveMachineKey(directory, key)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    const loaded = await loadMachineKey(directory)
    assert.equal(loaded.publicKey, key.publicKey)
    assert.deepEqual(loaded.sign('test', Buffer.from('x')), key.sign('test', Buffer.from('x')))
    const original = await readFile(path)
    await assert.rejects(saveMachineKey(directory, generateMachineKey()), { code: 'EEXIST' })
    assert.deepEqual(await readFile(path), original)
    for (const mode of [0o644, 0o640, 0o601, 0o700]) {
      await chmod(path, mode)
      await assert.rejects(loadMachineKey(directory), /permissions must be 0600 or stricter/)
    }
    await chmod(path, 0o400)
    assert.equal((await loadMachineKey(directory)).machineId, key.machineId)
    await chmod(path, 0o600)
    await writeFile(path, 'corrupt')
    await assert.rejects(loadMachineKey(directory))
    await rm(path)
    const target = join(directory, 'target.pem')
    await writeFile(target, original, { mode: 0o600 })
    await symlink(target, path)
    await assert.rejects(loadMachineKey(directory), { code: 'ELOOP' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
