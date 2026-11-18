import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { joinRequestRefusal, offerRefusal } from '../lib/enrollment.js'
import { createHello, readHello } from '../lib/machine-handshake.js'
import { generateMachineKey, loadMachineKey, machineIdentity, MACHINE_KEY_FILE, PERSON_ID, personIdFor, rawPublicKey, saveMachineKey, verify } from '../lib/machine-key.js'
import { verifyRecord } from '../lib/membership.js'
import { trustProject } from '../support/trust-records.js'

const MEMBERSHIP_DOMAIN = 'pardner/member/v1'

function base32(bytes) {
  const bits = [...bytes].map(byte => byte.toString(2).padStart(8, '0')).join('')
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  return bits.match(/.{1,5}/g).map(group => alphabet[parseInt(group.padEnd(5, '0'), 2)]).join('')
}

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

test('machine and person ID checks preserve the existing forms and coercion', () => {
  const { owner, ownerId, offer } = trustProject()
  const signed = offer(owner, { purpose: 'human', role: 'member' })
  assert.equal(offerRefusal(signed, owner.publicKey), null)

  const suffix = 'abcde234567'.repeat(3).slice(0, 26)
  const cases = [
    [42, false, false],
    ['', false, false],
    [suffix, false, false],
    ['machine-short', false, false],
    ['person-short', false, false],
    [`machine-${suffix}`, true, false],
    [`person-${suffix}`, false, true],
    [`machine-${suffix.toUpperCase()}`, false, false],
    [`person-${suffix.toUpperCase()}`, false, false],
    [`machine-${suffix}a`, false, false],
    [`person-${suffix}a`, false, false],
    [`machine-${suffix.slice(1)}0`, false, false],
    [`person-${suffix.slice(1)}0`, false, false],
    [[owner.machineId], true, false],
    [[ownerId], false, true],
  ]
  for (const [value, machine, person] of cases) {
    // A matching signer shape reaches the separate check that ties it to a public key.
    assert.equal(offerRefusal({ ...signed, signer: value }, null),
      machine ? 'Offer signer is not a machine of this project' : 'Incomplete invitation offer', JSON.stringify(value))
    assert.equal(PERSON_ID.test(value), person, JSON.stringify(value))
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
    const machineId = `machine-${base32(createHash('sha256').update(raw).digest()).slice(0, 26)}`
    const record = verifyRecord({ ...genesis, publicKey, machineId, signer: machineId }, projectId)
    assert.equal(record.valid, false, encoding)
    assert.match(record.reason, /Ed25519 public key/, encoding)
    assert.match(joinRequestRefusal({ ...request, publicKey, machineId }, offer), /Ed25519 public key/, encoding)
    assert.throws(() => readHello({ ...hello, initiator: { ...hello.initiator, publicKey, machineId } }, helloOptions), {
      code: 'HANDSHAKE_INVALID', message: 'The handshake machine ID does not match its key',
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
    const signature = sign(null, Buffer.concat([Buffer.from(MEMBERSHIP_DOMAIN), payload]), privateKey)
    assert.equal(verify(x, MEMBERSHIP_DOMAIN, payload, signature), true)
  }
})

test('machine identity hashes raw Ed25519 bytes, encodes RFC 4648 base32, and exposes the actor prefix', () => {
  const key = generateMachineKey()
  const raw = rawPublicKey(key.publicKey)
  assert.equal(raw.length, 32)
  const digest = createHash('sha256').update(raw).digest()
  assert.equal(key.machineId, `machine-${base32(digest).slice(0, 26)}`)
  assert.match(key.machineId, /^machine-[a-z2-7]{26}$/)
  assert.deepEqual(key.actorIdPrefix, digest.subarray(0, 16))
  assert.deepEqual(machineIdentity(key.publicKey), { machineId: key.machineId, actorIdPrefix: key.actorIdPrefix })
})

test('a person ID is a labelled hash of the raw public key of the machine the person was admitted with', () => {
  const key = generateMachineKey()
  const digest = createHash('sha256').update('pardner/person/v1').update(rawPublicKey(key.publicKey)).digest()
  assert.equal(personIdFor(key.publicKey), `person-${base32(digest).slice(0, 26)}`)
  assert.match(personIdFor(key.publicKey), PERSON_ID)
  assert.notEqual(personIdFor(key.publicKey).slice('person-'.length), key.machineId.slice('machine-'.length), 'the label separates it from the machine ID')
  assert.notEqual(personIdFor(generateMachineKey().publicKey), personIdFor(key.publicKey))
  assert.throws(() => personIdFor('invalid'))
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
