import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import * as A from '@automerge/automerge'
import { SHARDS, createSignaturesData, shardOf, signChange, storedSignatures, verifyChange } from '../lib/change-signatures.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { eventually, execute, operationOf, signerOf, stateOf, withHub, writeTask } from '../support/signed-hub.js'

// The rules that make a signer line mean "this machine signed exactly this content" (docs/PARDNER-TRUST-DESIGN.md,
// section 3), for every peer, even when another member's client writes unusual but well-formed data.

const reviewEntry = (runtime, hash) => runtime.getDoc().attribution.review.find(entry => entry.change === hash)

it('a machine signs only the changes its own write path made; a received change carrying its actor is not signed, is unattributed and is reported', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0)
    const { result: before } = await execute(writer, 'Written by the writer')
    const forger = await bare(1)
    await eventually(() => forger.board.doc().tasks?.[before.taskId], 'the forger never synced')
    for (const [target, label] of [[writer, 'a member machine'], [server.store, 'the hub']]) {
      // Another member continues the target's own current actor and sequence number, as it could after reading them
      // from synced changes. The change reaches the target by sync, carrying the target's actor ID.
      forger.board.update(doc => A.clone(doc, { actor: A.getActorId(target.docHandle.doc()) }))
      const forged = writeTask(forger, `Not written by ${label}`)
      assert.equal(A.getChangesMetaSince(forger.board.doc(), []).find(meta => meta.hash === forged.hash).actor, A.getActorId(target.docHandle.doc()))
      await eventually(() => operationOf(target, forged.taskId), `the change never reached ${label}`)
      assert.equal(target.signatureCache.has(forged.hash), false, `${label} never signs a change it did not make`)
      for (const runtime of [writer, server.store]) {
        await eventually(() => stateOf(runtime, forged.operationId) === 'unattributed', () => `${runtime.role} shows ${stateOf(runtime, forged.operationId)}`)
        assert.equal(signerOf(runtime, forged.operationId).claimed, target.machineKey.machineId, 'its actor names the target machine')
      }
      assert.deepEqual(storedSignatures(server.store.workspace.signatures.doc(), forged.hash), [], 'no signature for it exists anywhere')
      // The target reports that someone else used its actor.
      assert.equal(reviewEntry(target, forged.hash)?.ownActor, true, `${label} reports the change that used its actor`)
      assert.ok(target.status().attribution.ownActor >= 1, 'and counts it in status')
      // Applied, never dropped: the task is on the board.
      assert.equal(target.getDoc().tasks[forged.taskId].title, `Not written by ${label}`)
    }
    // The writer's own next change is still signed, by its own write path.
    const { result: after } = await execute(writer, 'Still the writer’s own')
    const own = await eventually(() => operationOf(server.store, after.taskId), 'the writer’s change never reached the hub')
    await eventually(() => stateOf(server.store, own.operationId) === 'signed', 'the writer’s own change was never attributed')
    assert.equal(signerOf(server.store, own.operationId).machineId, project.keys[0].machineId)
    assert.equal(signerOf(writer, own.operationId).state, 'signed')
    assert.equal(reviewEntry(writer, signerOf(writer, own.operationId).hash)?.ownActor, undefined, 'its own change is not reported as someone else’s use of its actor')
    // Every write path signs its own change: the board's creation change and the record gate's changes on the hub.
    const creation = A.getChangesMetaSince(server.store.docHandle.doc(), [])[0]
    assert.equal(server.store.attribution.stateOf(creation.hash).state, 'signed', 'the creation change is signed by the machine that created the board')
    await eventually(() => writer.attribution.stateOf(creation.hash).state === 'signed', 'a member never verified the creation change')
    const gate = server.store.attribution.writers.membership.get(project.records[0].recordId)
    assert.ok(gate?.length && gate.every(hash => server.store.attribution.stateOf(hash).state === 'signed'), 'the record gate’s change is signed')
  })
})

it('a membership write-back is signed by the machine that writes it back', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const reader = await replica(0)
    const vandal = await bare(1)
    const recordId = project.records[2].recordId
    await eventually(() => vandal.board.doc().membership?.[recordId], 'the vandal never synced')
    vandal.board.change(doc => { delete doc.membership[recordId] })
    // Every peer that stores the record writes it back; each write-back is that peer's own, signed change.
    await eventually(() => server.store.attribution.writers.membership.get(recordId)?.length
      && !A.getHeads(vandal.board.doc()).every(head => server.store.attribution.writers.membership.get(recordId).includes(head)), 'never written back')
    await eventually(() => {
      const writers = server.store.attribution.writers.membership.get(recordId) ?? []
      return writers.length && writers.every(hash => server.store.attribution.stateOf(hash).state === 'signed')
    }, 'a write-back change was never attributed')
    await eventually(() => (reader.attribution.writers.membership.get(recordId) ?? []).every(hash => reader.attribution.stateOf(hash).state === 'signed')
      && reader.attribution.writers.membership.get(recordId)?.length, 'the reader never attributed the write-back')
  })
})

it('a signature-document shard replaced by a list or any other non-map value cannot stop the service; the shard is repaired and its entries written back', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Its signature lives in a shard')
    const operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
    await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed')
    const hash = signerOf(server.store, operation.operationId).hash
    const vandal = await bare(2)
    await eventually(() => storedSignatures(vandal.signatures.doc(), hash).length, 'the vandal never received the entry')
    // Well-formed Automerge data of the wrong shape, everywhere the attribution reads the signature document.
    const other = SHARDS.filter(shard => shard !== shardOf(hash))
    vandal.signatures.change(doc => {
      doc[shardOf(hash)] = [1, 2, 3]
      doc[other[0]] = new A.ImmutableString('not a shard')
      doc[other[1]] = 7
      doc[other[2]] = new Uint8Array(64)
      doc[other[3]] = new A.Counter(1)
      doc[other[4]] = [[{ nested: true }]]
      doc[other[5]]['not-a-hash'] = new Uint8Array(64)
      doc[other[5]][`${other[5]}${'0'.repeat(62)}`] = [new Uint8Array(64)]
      doc[other[6]][`${other[6]}${'1'.repeat(62)}`] = new Uint8Array(1 << 20)
      doc.unexpected = { [hash]: new Uint8Array(64) }
    })
    const vandalism = A.getHeads(vandal.signatures.doc())
    await eventually(() => A.hasHeads(server.store.workspace.signatures.doc(), vandalism) && A.hasHeads(writer.workspace.signatures.doc(), vandalism), 'the vandalism never arrived')
    // Both services keep running, and the shard comes back as a map holding the entry, on every peer.
    for (const runtime of [server.store, writer]) {
      await eventually(() => storedSignatures(runtime.workspace.signatures.doc(), hash).length, `${runtime.role} never repaired the shard`)
      assert.equal(stateOf(runtime, operation.operationId), 'signed', 'still attributed where it was verified')
      assert.equal(runtime.status().attribution.failures.count, 0, 'nothing malformed reached a background task as an exception')
    }
    await eventually(() => storedSignatures(vandal.signatures.doc(), hash).length, 'the repair never reached the vandal')
    const { result: next } = await execute(writer, 'Still writing after the vandalism')
    const nextOperation = await eventually(() => operationOf(server.store, next.taskId), 'the service stopped syncing')
    await eventually(() => stateOf(server.store, nextOperation.operationId) === 'signed', 'the service stopped checking')
    const late = await replica(1)
    await eventually(() => stateOf(late, operation.operationId) === 'signed', 'a new replica could not check the change')
    assert.equal(project.keys[0].machineId, signerOf(late, operation.operationId).machineId)
  })
})

it('what is read from the signature document is bounded: only map shards, change-hash keys and 64-byte values, and a few concurrent values', () => {
  const projectId = 'ab'.repeat(32), key = generateMachineKey()
  const base = A.from(createSignaturesData())
  const hash = 'cd'.repeat(32), signature = signChange(key, projectId, hash)
  // Fifty members write concurrently under one hash; the one valid signature is among them.
  let doc = A.clone(base)
  for (let index = 0; index < 50; index++) doc = A.merge(doc, A.change(A.clone(base), d => { d[shardOf(hash)][hash] = new Uint8Array(randomBytes(64)) }))
  assert.ok(storedSignatures(doc, hash).length <= 8, 'at most a few concurrent values are read')
  // Values that are not exactly 64 bytes, and keys that are not change hashes, are never returned.
  const odd = A.change(A.clone(base), d => {
    d[shardOf(hash)][hash] = new Uint8Array(63)
    d.cd.short = signature
  })
  assert.deepEqual(storedSignatures(odd, hash), [])
  assert.deepEqual(storedSignatures(odd, 'short'), [])
  // A shard that is not a map, or is missing, holds nothing.
  for (const value of [[signature], new A.ImmutableString('x'), 7, new A.Counter(1), signature]) {
    assert.deepEqual(storedSignatures(A.change(A.clone(base), d => { d[shardOf(hash)] = value }), hash), [])
  }
  assert.deepEqual(storedSignatures(A.change(A.clone(base), d => { delete d[shardOf(hash)] }), hash), [])
  // Two shard maps written concurrently are both read, so a valid entry is never hidden behind the other.
  const left = A.change(A.clone(base), d => { d[shardOf(hash)] = { [hash]: signature } })
  const right = A.change(A.clone(base), d => { d[shardOf(hash)] = {} })
  const both = A.merge(A.merge(A.clone(base), left), right)
  assert.equal(storedSignatures(both, hash).filter(value => verifyChange(key.publicKey, projectId, hash, value)).length, 1)
})

it('an exception in a background attribution task is contained, logged and shown in status, and the work resumes', { timeout: 90000 }, async () => {
  await withHub(async ({ server, replica }) => {
    const writer = await replica(0)
    const add = server.store.signatureCache.add.bind(server.store.signatureCache)
    const errors = []
    const error = console.error
    console.error = (...args) => errors.push(args.join(' '))
    let operation
    try {
      server.store.signatureCache.add = () => { throw new Error('simulated disk failure') }
      const { result } = await execute(writer, 'Checked while the cache fails')
      operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
      const failures = await eventually(() => server.store.status().attribution.failures.count && server.store.status().attribution.failures, 'the failure was never shown')
      assert.match(failures.last.error, /simulated disk failure/)
      assert.ok(errors.some(line => /simulated disk failure/.test(line)), 'and it was logged')
      assert.notEqual(stateOf(server.store, operation.operationId), 'signed', 'nothing unsaved is shown as verified')
    } finally {
      server.store.signatureCache.add = add
      console.error = error
    }
    await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'checking never resumed')
    // The service is alive and still serving.
    const { result } = await execute(writer, 'After the failure')
    await eventually(() => operationOf(server.store, result.taskId), 'the hub stopped syncing')
  })
})

it('repairs of signature entries are never lost when deletions coincide: every one is put back', { timeout: 90000 }, async () => {
  await withHub(async ({ server, replica, bare }) => {
    const writer = await replica(0)
    const hashes = []
    for (let index = 0; index < 4; index++) {
      const { result } = await execute(writer, `Entry ${index}`)
      const operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
      await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed')
      hashes.push(signerOf(server.store, operation.operationId).hash)
    }
    const vandal = await bare(2)
    await eventually(() => hashes.every(hash => storedSignatures(vandal.signatures.doc(), hash).length), 'the vandal never received the entries')
    // The writer is gone, so the hub is the only peer that can put the entries back.
    await writer.close()
    // Separate deletions and overwrites, each its own change, all applied at the hub before its repair runs.
    const edits = hashes.map((hash, index) => A.change(A.clone(vandal.signatures.doc()), doc => {
      if (index % 2) doc[shardOf(hash)][hash] = new Uint8Array(randomBytes(64))
      else delete doc[shardOf(hash)][hash]
    }))
    const signatures = server.store.workspace.signatures
    for (const edit of edits) signatures.update(doc => A.merge(doc, edit))
    const publicKey = server.store.records.membership().machines.find(machine => machine.id === writer.machineKey.machineId).publicKey
    const valid = hash => storedSignatures(signatures.doc(), hash).some(value => verifyChange(publicKey, server.store.manifest.workspaceId, hash, value))
    await eventually(() => hashes.every(valid), () => `not put back: ${hashes.filter(hash => !valid(hash)).join(', ')}`)
  })
})

it('a member asks the hub about every change it has no verdict for, in turn, so one batch cannot starve the rest', { timeout: 120000 }, async () => {
  await withHub(async ({ replica, bare }) => {
    const reader = await replica(1)
    const asked = []
    // The hub's answer is held at pending for most changes, so the first batch would stay unresolved for ever.
    reader.attribution.askHub = async hashes => {
      asked.push([...hashes])
      return { states: Object.fromEntries(hashes.map(hash => [hash, settled.has(hash) ? { state: 'unsigned', relayedBy: null } : { state: 'pending', waitingFor: null }])) }
    }
    const settled = new Set()
    const member = await bare(0)
    member.board.update(doc => {
      let next = doc
      for (let index = 0; index < 1200; index++) next = A.change(next, d => { d.name = new A.ImmutableString(`Unsigned ${index}`) })
      return next
    })
    const unsigned = await eventually(() => {
      const open = [...reader.attribution.unsigned].filter(([, entry]) => entry.reason !== 'checking').map(([hash]) => hash)
      return open.length >= 1200 && open
    }, 'the unsigned changes never reached the reader', 60000)
    // A few are settled by the hub: they leave the rotation.
    for (const hash of unsigned.slice(0, 10)) settled.add(hash)
    const start = asked.length
    await eventually(() => asked.length >= start + 4, 'the reader stopped asking', 30000)
    const later = asked.slice(start + 1).flat()
    const everyone = new Set(asked.slice(start, start + 4).flat())
    assert.ok(unsigned.slice(10).every(hash => everyone.has(hash)), 'every unresolved change is asked about within a bounded number of polls')
    assert.ok(asked.every(batch => batch.length <= 500), 'each poll stays within the hub’s limit')
    assert.ok(!later.some(hash => settled.has(hash)), 'settled changes are not asked about again')
  })
})
