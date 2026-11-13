import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, sign } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateMachineKey, loadMachineKey, machineIdentity, MACHINE_KEY_FILE, PERSON_ID, personIdFor, rawPublicKey, saveMachineKey, verify } from '../lib/machine-key.js'

const MEMBERSHIP_DOMAIN = 'pardner/member/v1'

test('machine identity hashes raw Ed25519 bytes, encodes RFC 4648 base32, and exposes the actor prefix', () => {
  const key = generateMachineKey()
  const raw = rawPublicKey(key.publicKey)
  assert.equal(raw.length, 32)
  const digest = createHash('sha256').update(raw).digest()
  const bits = [...digest].map(byte => byte.toString(2).padStart(8, '0')).join('')
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const base32 = bits.match(/.{1,5}/g).map(group => alphabet[parseInt(group.padEnd(5, '0'), 2)]).join('')
  assert.equal(key.machineId, `machine-${base32.slice(0, 26)}`)
  assert.match(key.machineId, /^machine-[a-z2-7]{26}$/)
  assert.deepEqual(key.actorIdPrefix, digest.subarray(0, 16))
  assert.deepEqual(machineIdentity(key.publicKey), { machineId: key.machineId, actorIdPrefix: key.actorIdPrefix })
})

test('a person ID is a labelled hash of the raw public key of the machine the person was admitted with', () => {
  const key = generateMachineKey()
  const digest = createHash('sha256').update('pardner/person/v1').update(rawPublicKey(key.publicKey)).digest()
  const bits = [...digest].map(byte => byte.toString(2).padStart(8, '0')).join('')
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const base32 = bits.match(/.{1,5}/g).map(group => alphabet[parseInt(group.padEnd(5, '0'), 2)]).join('')
  assert.equal(personIdFor(key.publicKey), `person-${base32.slice(0, 26)}`)
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
