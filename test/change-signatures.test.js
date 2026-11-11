import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import * as A from '@automerge/automerge'
import { CHANGE_DOMAIN, SHARDS, actorPrefix, createSignaturesData, machineActor, machinePrefix, shardOf, signChange, signaturesDocumentUrl,
  storedSignatures, verifyChange } from '../lib/change-signatures.js'
import { changesInMessage } from '../lib/attribution.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { canonical } from '../lib/workspace-schema.js'
import { SIGNATURE_CACHE_FILE, SignatureCache } from '../lib/signature-cache.js'

const projectId = createHash('sha256').update('project').digest('hex')

test('a change signature covers the domain, the project and the raw change hash, and is deterministic', () => {
  const key = generateMachineKey(), other = generateMachineKey()
  const doc = A.change(A.from({ a: 1 }, { actor: machineActor(key) }), d => { d.a = 2 })
  const [hash] = A.getHeads(doc)
  const signature = signChange(key, projectId, hash)
  assert.equal(signature.length, 64)
  assert.deepEqual(signChange(key, projectId, hash), signature, 'Ed25519 gives the same bytes again, so a writer can re-create an entry')
  assert.ok(verifyChange(key.publicKey, projectId, hash, signature))
  assert.equal(verifyChange(other.publicKey, projectId, hash, signature), false, 'only under the signing machine’s key')
  assert.equal(verifyChange(key.publicKey, createHash('sha256').update('other').digest('hex'), hash, signature), false, 'bound to its project')
  assert.equal(verifyChange(key.publicKey, projectId, A.getHeads(A.from({ b: 1 }))[0], signature), false, 'bound to its change')
  assert.equal(verifyChange(key.publicKey, projectId, hash, signature.slice(0, 63)), false)
  // The signed message is exactly the domain label, the project ID's 32 bytes and the change hash's 32 bytes.
  const raw = Buffer.concat([Buffer.from(CHANGE_DOMAIN), Buffer.from(projectId, 'hex'), Buffer.from(hash, 'hex')])
  const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.publicKey }, format: 'jwk' })
  assert.ok(verify(null, raw, publicKey, signature))
  assert.throws(() => signChange(key, projectId, 'not-a-hash'))
})

test('a machine actor is its 16-byte digest and 8 fresh bytes; the signer is read from the prefix', () => {
  const key = generateMachineKey()
  const [first, second] = [machineActor(key), machineActor(key)]
  assert.match(first, /^[a-f0-9]{48}$/)
  assert.notEqual(first, second, 'each load draws a new suffix')
  assert.equal(actorPrefix(first), machinePrefix(key.publicKey))
  assert.equal(actorPrefix(first), key.actorIdPrefix.toString('hex'))
  assert.equal(actorPrefix('ab'.repeat(16)), null, 'a random 16-byte Automerge actor names no machine')
  assert.equal(actorPrefix(undefined), null)
})

test('the signature document’s URL is derived from the project ID alone, and it is created with every shard', () => {
  assert.equal(signaturesDocumentUrl(projectId), signaturesDocumentUrl(projectId))
  assert.notEqual(signaturesDocumentUrl(projectId), signaturesDocumentUrl(createHash('sha256').update('other').digest('hex')))
  assert.match(signaturesDocumentUrl(projectId), /^automerge:/)
  const data = createSignaturesData()
  assert.deepEqual(Object.keys(data).filter(key => key !== 'v').sort(), SHARDS)
  assert.equal(SHARDS.length, 256)
  const key = generateMachineKey(), hash = 'ab'.repeat(32)
  // Concurrent values for one entry are all returned, so a valid one hides behind no overwrite.
  let base = A.from(createSignaturesData())
  const good = A.change(A.clone(base), d => { d[shardOf(hash)][hash] = signChange(key, projectId, hash) })
  const junk = A.change(A.clone(base), d => { d[shardOf(hash)][hash] = new Uint8Array(randomBytes(64)) })
  base = A.merge(A.merge(base, good), junk)
  const values = storedSignatures(base, hash)
  assert.equal(values.length, 2)
  assert.ok(values.some(value => verifyChange(key.publicKey, projectId, hash, value)))
  assert.deepEqual(storedSignatures(base, 'cd'.repeat(32)), [])
})

test('the changes in a sync message are found when Automerge packs chunks together or sends a whole document', () => {
  let doc = A.from({ n: 0 }, { actor: 'ab'.repeat(24) })
  for (let index = 1; index <= 3; index++) doc = A.change(doc, d => { d.n = index })
  const metas = A.getChangesMetaSince(doc, []).map(({ actor, seq, hash }) => ({ actor, seq, hash }))
  // Runs the sync protocol between `peer` and `doc` and returns the changes found in `doc`'s messages.
  const reply = peer => {
    let [ours, theirs, mine, other] = [A.clone(doc), peer, A.initSyncState(), A.initSyncState()]
    const found = []
    for (let round = 0; round < 6; round++) {
      let message
      ;[other, message] = A.generateSyncMessage(theirs, other)
      if (message) [ours, mine] = A.receiveSyncMessage(ours, mine, message)
      ;[mine, message] = A.generateSyncMessage(ours, mine)
      if (!message) continue
      found.push(...changesInMessage(message))
      ;[theirs, other] = A.receiveSyncMessage(theirs, other, message)
    }
    return found
  }
  // To a peer that holds nothing: the whole document in one chunk.
  assert.deepEqual(reply(A.init()).sort((a, b) => a.seq - b.seq), metas)
  // To a peer that holds the first change: the rest, in whatever chunks Automerge chooses.
  const [partial] = A.applyChanges(A.init(), [A.getAllChanges(doc)[0]])
  const found = reply(partial)
  for (const meta of metas.slice(1)) assert.ok(found.some(change => canonical(change) === canonical(meta)), `change ${meta.seq} found`)
  assert.ok(found.every(change => metas.some(meta => canonical(meta) === canonical(change))))
  // Two change chunks back to back in one entry are both read.
  const [first, second] = A.getAllChanges(doc).slice(1, 3)
  const packed = A.encodeSyncMessage({ heads: [], need: [], have: [], changes: [new Uint8Array([...first, ...second])] })
  assert.deepEqual(changesInMessage(packed).map(change => change.seq), [2, 3])
})

test('the signature cache only grows, belongs to one project, is private, and survives reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-signature-cache-'))
  const path = join(directory, SIGNATURE_CACHE_FILE)
  try {
    const key = generateMachineKey(), hash = 'ab'.repeat(32)
    const entry = { hash, machineId: key.machineId, signature: signChange(key, projectId, hash) }
    let cache = new SignatureCache(path, projectId)
    assert.equal(cache.add([entry, entry]), 1)
    assert.equal(cache.add([{ ...entry, signature: new Uint8Array(64) }]), 0, 'an entry held is kept as it was')
    assert.throws(() => cache.add([{ hash: 'nope', machineId: key.machineId, signature: entry.signature }]))
    cache.close()
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    cache = new SignatureCache(path, projectId)
    assert.deepEqual(Buffer.from(cache.get(hash).signature), Buffer.from(entry.signature))
    assert.equal(cache.get(hash).machineId, key.machineId)
    cache.close()
    const database = new DatabaseSync(path)
    assert.throws(() => database.exec('DELETE FROM signatures'), /only grow/)
    assert.throws(() => database.exec("UPDATE signatures SET machine_id = 'x'"), /only grow/)
    database.close()
    assert.throws(() => new SignatureCache(path, createHash('sha256').update('other').digest('hex')), { code: 'WORKSPACE_MISMATCH' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
