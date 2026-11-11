import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import * as A from '@automerge/automerge'
import { SHARDS, createSignaturesData, machineActor, machinePrefix, shardOf, signChange, storedSignatures, verifyChange } from '../lib/change-signatures.js'
import { machineIndex } from '../lib/attribution.js'
import { ChangeLog } from '../lib/change-log.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { actorId as actorFor } from '../lib/client-identity.js'
import { hubRuntime } from '../support/machines.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { actors, entryOf, eventually, execute, operationOf, signerOf, stateOf, withHub, writeTask } from '../support/signed-hub.js'

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
    const gate = server.store.attribution.recordWriters().get(project.records[0].recordId)
    assert.ok(gate?.length && gate.every(hash => server.store.attribution.stateOf(hash).state === 'signed'), 'the record gate’s change is signed')
  })
})

it('a membership write-back is signed by the machine that writes it back', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const reader = await replica(0)
    const vandal = await bare(1)
    const recordId = project.records[2].recordId
    await eventually(() => vandal.board.doc().membership?.[recordId], 'the vandal never synced')
    // Every change that ever wrote the record into the board, from the changes' own entries.
    const writers = runtime => runtime.attribution.recordWriters().get(recordId) ?? []
    await eventually(() => writers(server.store).length, 'the hub never derived the gate’s change')
    const before = writers(server.store).length
    vandal.board.change(doc => { delete doc.membership[recordId] })
    // Every peer that stores the record writes it back; each write-back is that peer's own, signed change.
    await eventually(() => writers(server.store).length > before, 'never written back')
    await eventually(() => writers(server.store).every(hash => server.store.attribution.stateOf(hash).state === 'signed'), 'a write-back change was never attributed')
    await eventually(() => writers(reader).length > before && writers(reader).every(hash => reader.attribution.stateOf(hash).state === 'signed'),
      'the reader never attributed the write-back')
    // The record is one Activity entry listing each change that wrote it; the deletion is its own entry, for review.
    const [shown] = await eventually(() => {
      const entries = server.store.getDoc().activity.filter(entry => entry.kind === 'record' && entry.key === recordId)
      return entries.length === 1 && entries[0].changes.length > before && entries
    }, 'the record was not shown as one entry')
    assert.equal(shown.review, false)
    const deletion = A.getHeads(vandal.board.doc()).find(head => !writers(server.store).includes(head))
    if (deletion) await eventually(() => server.store.getDoc().activity.find(entry => entry.id === deletion)?.kind === 'unrecognised', 'the deletion was not listed on its own')
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

it('what is read from the signature document is bounded: only map shards, change-hash keys and 64-byte values', () => {
  const projectId = 'ab'.repeat(32), key = generateMachineKey()
  const base = A.from(createSignaturesData())
  const hash = 'cd'.repeat(32), signature = signChange(key, projectId, hash)
  // Fifty members write concurrently under one hash; the one valid signature is among them.
  let doc = A.clone(base)
  for (let index = 0; index < 50; index++) doc = A.merge(doc, A.change(A.clone(base), d => { d[shardOf(hash)][hash] = new Uint8Array(randomBytes(64)) }))
  assert.ok(storedSignatures(doc, hash).every(value => value.length === 64), 'only 64-byte values are read')
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

it('a signature held only in the winning map of many concurrent shard maps is found, and so is one among many concurrent values', () => {
  const projectId = 'ab'.repeat(32), key = generateMachineKey()
  const hash = 'ef'.repeat(32), signature = signChange(key, projectId, hash), shard = shardOf(hash)
  const base = A.from(createSignaturesData())
  // Twelve members replace the shard concurrently; Automerge lists the winner last.
  let doc = A.clone(base)
  for (let index = 0; index < 12; index++) doc = A.merge(doc, A.change(A.clone(base), d => { d[shard] = {} }))
  doc = A.change(doc, d => { d[shard][hash] = signature })
  const listed = A.getBackend(doc).getAll('_root', shard).map(([, id]) => id)
  assert.equal(listed.length, 12)
  assert.equal(listed.at(-1), A.getObjectId(doc[shard]), 'the winner is listed last')
  assert.ok(storedSignatures(doc, hash).some(value => verifyChange(key.publicKey, projectId, hash, value)), 'a signature in the winning shard map is found')
  // Fifty concurrent values under one hash: the valid one is found wherever Automerge lists it.
  let crowded = A.clone(base)
  for (let index = 0; index < 50; index++) crowded = A.merge(crowded, A.change(A.clone(base), d => { d[shard][hash] = index === 49 ? signature : new Uint8Array(randomBytes(64)) }))
  assert.ok(storedSignatures(crowded, hash).some(value => verifyChange(key.publicKey, projectId, hash, value)), 'a valid value among fifty concurrent values is found')
})

it('many concurrent maps for one signature shard hide no signature on any peer; the hub resolves them into one map holding every verified entry', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Its shard is split twelve ways')
    const operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
    await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed')
    const hash = signerOf(server.store, operation.operationId).hash, shard = shardOf(hash)
    const vandal = await bare(2)
    await eventually(() => storedSignatures(vandal.signatures.doc(), hash).length, 'the vandal never received the entry')
    // Twelve concurrent replacements of the shard, each an empty map: the entry is in none of them.
    const base = vandal.signatures.doc()
    let split = A.clone(base)
    for (let index = 0; index < 12; index++) split = A.merge(split, A.change(A.clone(base), d => { d[shard] = {} }))
    vandal.signatures.update(doc => A.merge(doc, split))
    const vandalism = A.getHeads(vandal.signatures.doc())
    await eventually(() => A.hasHeads(server.store.workspace.signatures.doc(), vandalism), 'the vandalism never arrived')
    const late = await replica(1)
    for (const runtime of [server.store, writer, late]) {
      await eventually(() => storedSignatures(runtime.workspace.signatures.doc(), hash).some(value => verifyChange(project.keys[0].publicKey, project.projectId, hash, value)),
        `${runtime.role} never found the signature again`)
      await eventually(() => stateOf(runtime, operation.operationId) === 'signed', `${runtime.role} does not show the change signed`)
    }
    // The hub replaces the twelve maps with one that holds the entry, and repairs then stop.
    const signatures = server.store.workspace.signatures
    await eventually(() => A.getBackend(signatures.doc()).getAll('_root', shard).length === 1, 'the hub never resolved the shard')
    assert.ok(storedSignatures(signatures.doc(), hash).length, 'the resolved shard holds the entry')
    await new Promise(resolve => setTimeout(resolve, 1500))
    const settled = A.getHeads(signatures.doc()).join()
    await new Promise(resolve => setTimeout(resolve, 1500))
    assert.equal(A.getHeads(signatures.doc()).join(), settled, 'repairs keep rewriting the signature document')
  })
})

it('reading a signature shard materialises its concurrent values once per change to that shard, not once per read', { timeout: 90000 }, async () => {
  await withHub(async ({ server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Read many times')
    const operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
    await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed')
    const hash = signerOf(server.store, operation.operationId).hash, shard = shardOf(hash)
    const vandal = await bare(2)
    await eventually(() => storedSignatures(vandal.signatures.doc(), hash).length, 'the vandal never received the entry')
    const base = vandal.signatures.doc()
    let junk = A.clone(base)
    for (let index = 0; index < 40; index++) junk = A.merge(junk, A.change(A.clone(base), d => { d[shard] = new Uint8Array(4096) }))
    vandal.signatures.update(doc => A.merge(doc, junk))
    const signatures = server.store.workspace.signatures
    await eventually(() => A.hasHeads(signatures.doc(), A.getHeads(vandal.signatures.doc())), 'the vandalism never arrived')
    await eventually(() => storedSignatures(signatures.doc(), hash).length, 'the entry was never written back')
    const backend = A.getBackend(signatures.doc())
    const getAll = backend.getAll
    let reads = 0
    backend.getAll = function (obj, prop, ...rest) { if (obj === '_root' && prop === shard) reads++; return getAll.call(this, obj, prop, ...rest) }
    try {
      for (let index = 0; index < 100; index++) server.store.attribution.check(hash)
    } finally { backend.getAll = getAll }
    assert.ok(reads <= 1, `the shard's concurrent values were read ${reads} times for 100 reads`)
  })
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

it('a repair that fails stays pending and is retried until the entry is put back', { timeout: 90000 }, async () => {
  await withHub(async ({ server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Its entry is deleted while writing fails')
    const operation = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
    await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed')
    const hash = signerOf(server.store, operation.operationId).hash
    const vandal = await bare(2)
    await eventually(() => storedSignatures(vandal.signatures.doc(), hash).length, 'the vandal never received the entry')
    await writer.close()
    // The hub's first attempts to write the entry back fail; each failure is contained.
    const attribution = server.store.attribution
    const write = attribution.writeEntries.bind(attribution)
    let failures = 0
    attribution.writeEntries = entries => {
      if (entries.some(entry => entry.hash === hash) && failures < 2) { failures++; throw new Error('simulated write failure') }
      return write(entries)
    }
    const error = console.error
    console.error = () => {}
    try {
      server.store.workspace.signatures.update(doc => A.merge(doc, A.change(A.clone(vandal.signatures.doc()), d => { delete d[shardOf(hash)][hash] })))
      await eventually(() => failures >= 1, 'the repair was never attempted')
      await eventually(() => storedSignatures(server.store.workspace.signatures.doc(), hash).length, 'the failed repair was dropped instead of retried')
    } finally {
      attribution.writeEntries = write
      console.error = error
    }
  })
})

it('a member asks the hub about every change it has no verdict for, in turn, so one batch cannot starve the rest', { timeout: 120000 }, async () => {
  await withHub(async ({ replica, bare }) => {
    const reader = await replica(1)
    const asked = [], answered = new Map()
    // The hub's answer is held at pending for most changes, so the first batch would stay unresolved for ever.
    reader.attribution.askHub = async hashes => {
      asked.push([...hashes])
      for (const hash of hashes) if (settled.has(hash) && !answered.has(hash)) answered.set(hash, asked.length - 1)
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
    await eventually(() => asked.length >= start + 4 && unsigned.slice(0, 10).every(hash => answered.has(hash)), 'the reader stopped asking', 30000)
    const everyone = new Set(asked.slice(start, start + 4).flat())
    assert.ok(unsigned.slice(10).every(hash => everyone.has(hash)), 'every unresolved change is asked about within a bounded number of polls')
    assert.ok(asked.every(batch => batch.length <= 500), 'each poll stays within the hub’s limit')
    // A change the hub settled is never asked about after the poll that settled it.
    assert.ok([...answered].every(([hash, poll]) => asked.slice(poll + 1).every(batch => !batch.includes(hash))), 'settled changes are not asked about again')
  })
})

/** Waits until a runtime's attribution has finished checking, signatures and content alike. */
const checked = runtime => eventually(() => runtime.attribution.summary().checking === 0, `${runtime.role} never finished checking`)

it('the signer line is bound to the content it signed: a later change that edits an existing Activity entry is flagged, and listed with its own signer', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0), reader = await replica(1)
    const { result } = await execute(writer, 'Written and signed by member 0')
    const original = await eventually(() => operationOf(reader, result.taskId), 'never relayed')
    await eventually(() => stateOf(reader, original.operationId) === 'signed', 'never attributed')
    const signedBy = signerOf(reader, original.operationId)
    // Another member edits fields inside that entry: what it says, and when; its own change is signed by its machine.
    const editor = await bare(2)
    await eventually(() => editor.board.doc().operations?.[original.operationId], 'the editor never synced')
    editor.board.change(doc => {
      const event = doc.operations[original.operationId]
      event.payload.title = new A.ImmutableString('Rewritten by member 2')
      event.timestamp = new A.ImmutableString('2020-01-01T00:00:00.000Z')
      delete event.changes
    })
    const edit = A.getHeads(editor.board.doc())[0]
    editor.signatures.change(doc => { doc[shardOf(edit)][edit] = signChange(editor.key, project.projectId, edit) })
    for (const runtime of [reader, server.store, writer]) {
      await eventually(() => A.hasHeads(runtime.docHandle.doc(), [edit]), `the edit never reached ${runtime.role}`)
      await checked(runtime)
      await eventually(() => runtime.attribution.stateOf(edit).state === 'signed', `${runtime.role} never verified the edit’s own signature`)
      const shown = entryOf(runtime, original.operationId)
      assert.deepEqual(shown.changes.map(change => [change.hash, change.machineId]), [[signedBy.hash, project.keys[0].machineId]], 'still the change that wrote the entry, alone')
      // What is shown under the signer is the content as its change wrote it.
      assert.equal(shown.event.payload.title, 'Written and signed by member 0')
      assert.equal(shown.event.timestamp, original.timestamp)
      assert.equal(shown.timestamp, original.timestamp, 'the time shown is the signed one')
      assert.deepEqual(shown.event.changes, original.changes)
      // Member 0 acts as Alice here, which its machine is not certified for: that flag is its own; the edit adds none.
      assert.deepEqual(Object.keys(shown.flags), ['actorMismatch'])
      // The altering change is its own entry, in review, with its own signer, naming what it altered.
      const altering = runtime.getDoc().activity.find(entry => entry.id === edit)
      assert.equal(altering.kind, 'unrecognised')
      assert.deepEqual(altering.altered, [signedBy.hash])
      assert.deepEqual([altering.changes[0].state, altering.changes[0].machineId], ['signed', project.keys[2].machineId])
      assert.ok(reviewEntry(runtime, edit), `${runtime.role} never listed the altering change`)
    }
    // Every peer shows the same thing, and the board itself is not changed by the check.
    assert.equal(server.store.getDoc().operations[original.operationId].payload.title, 'Rewritten by member 2')
    const stable = runtime => JSON.stringify(runtime.getDoc().activity.map(({ changes, ...entry }) => ({ ...entry, changes: changes.map(({ hash, state, machineId }) => [hash, state, machineId]) })))
    assert.equal(new Set([reader, server.store, writer].map(stable)).size, 1)
  })
})

it('a replica that joins after an Activity entry was altered shows the same alteration, from the documents alone', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Altered before the reader joined')
    const original = await eventually(() => operationOf(server.store, result.taskId), 'never relayed')
    const editor = await bare(2)
    await eventually(() => editor.board.doc().operations?.[original.operationId], 'the editor never synced')
    // Unsigned this time, and it edits a nested list inside the entry.
    editor.board.change(doc => { doc.operations[original.operationId].recordIds.push(new A.ImmutableString('task-000000000000000000000000')) })
    const edit = A.getHeads(editor.board.doc())[0]
    await eventually(() => A.hasHeads(server.store.docHandle.doc(), [edit]), 'the edit never reached the hub')
    const late = await replica(1)
    await checked(late)
    const shown = entryOf(late, original.operationId)
    assert.equal(shown.changes[0].state, 'signed')
    assert.deepEqual(shown.event.recordIds, original.recordIds, 'shown as its change wrote it')
    await eventually(() => reviewEntry(late, edit)?.state === 'unattributed', 'the unsigned edit was never listed')
    assert.deepEqual(late.getDoc().activity.find(entry => entry.id === edit).altered, [shown.changes[0].hash])
    await checked(server.store)
    await eventually(() => reviewEntry(server.store, edit)?.state === 'unattributed', 'the hub never resolved the edit')
    // The same on the hub, apart from the replica naming the hub it learned the verdict through (`via`).
    const verdicts = changes => changes?.map(({ hash, state, machineId, claimed }) => [hash, state, machineId, claimed])
    const stable = runtime => JSON.stringify(runtime.getDoc().activity.map(({ changes, alteredLater, ...entry }) => ({ ...entry, changes: verdicts(changes), alteredLater: verdicts(alteredLater) })))
    assert.equal(stable(late), stable(server.store))
  })
})

it('replacing or deleting an Activity entry, or a signed change that leaves no Activity entry, is its own entry listed for review with its signer, and the original stays shown', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    // Member 0 acts as its own person's Actor, so its entries carry no flag of their own.
    const own = actorFor(personIdFor(project.keys[0].publicKey))
    await server.store.execute({ operationId: randomUUID(), actorId: 'alice', type: 'actor.register', payload: { id: own, handle: 'member-zero', kind: 'human' } })
    const writer = await replica(0)
    const first = await execute(writer, 'Replaced later', own), second = await execute(writer, 'Deleted later', own)
    const [replaced, deleted] = await Promise.all([first, second].map(({ result }) => eventually(() => operationOf(server.store, result.taskId), 'never relayed')))
    const editor = await bare(2)
    await eventually(() => editor.board.doc().operations?.[deleted.operationId], 'the editor never synced')
    const sign = () => {
      const hash = A.getHeads(editor.board.doc())[0]
      editor.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(editor.key, project.projectId, hash) })
      return hash
    }
    editor.board.change(doc => { doc.operations[replaced.operationId] = storageValue({ ...plain(doc.operations[replaced.operationId]), timestamp: '2020-01-01T00:00:00.000Z' }) })
    const replacement = sign()
    editor.board.change(doc => { delete doc.operations[deleted.operationId] })
    const deletion = sign()
    editor.board.change(doc => { doc.name = new A.ImmutableString('Renamed with no Activity entry') })
    const rename = sign()
    await eventually(() => A.hasHeads(server.store.docHandle.doc(), [rename]), 'the edits never reached the hub')
    await checked(server.store)
    const review = hash => reviewEntry(server.store, hash)
    await eventually(() => [replacement, deletion, rename].every(hash => review(hash)?.state === 'signed'), 'not every change was listed with its signer')
    assert.equal(review(replacement).machineId, project.keys[2].machineId)
    const activity = server.store.getDoc().activity
    // The replacement is its own entry; the entry it replaced is still shown, as its own change wrote it.
    const replacing = activity.find(entry => entry.id === replacement)
    assert.equal(replacing.event.timestamp, '2020-01-01T00:00:00.000Z')
    const originals = activity.filter(entry => entry.kind === 'operation' && (entry.key === replaced.operationId || entry.key === deleted.operationId) && entry.id !== replacement)
    assert.deepEqual(originals.map(entry => entry.event.payload.title).sort(), ['Deleted later', 'Replaced later'])
    assert.ok(originals.every(entry => entry.changes.every(change => change.machineId === project.keys[0].machineId)))
    assert.deepEqual(replacing.flags.sameKey, [originals.find(entry => entry.key === replaced.operationId).id])
    assert.deepEqual([activity.find(entry => entry.id === deletion).kind, activity.find(entry => entry.id === rename).kind], ['unrecognised', 'unrecognised'])
    // Ordinary work is never listed: only these three, and the entry whose key another change wrote again.
    // (The hub's own registration of member 0's Actor, made here as Alice, is flagged too, and is not this test's.)
    assert.deepEqual([...new Set(server.store.getDoc().attribution.review.filter(entry => entry.machineId !== project.owner.machineId).map(entry => entry.change))].sort(),
      [replacement, deletion, rename, originals.find(entry => entry.key === replaced.operationId).id].sort())
  })
})

it('a replica asks for the hub’s acknowledgement only once every signature it made is in the signature document it asks about', { timeout: 60000 }, async () => {
  await withHub(async ({ server, replica }) => {
    const writer = await replica(0)
    // The signature stays out of the signature document: the hub holds the board change but not its signature.
    writer.attribution.holdOutbox = true
    const { result } = await execute(writer, 'Not acknowledged without its signature')
    const operation = await eventually(() => operationOf(server.store, result.taskId), 'the change never reached the hub')
    await new Promise(resolve => setTimeout(resolve, 1000))
    assert.equal(writer.status().syncPending, true, 'no acknowledgement covers a change whose signature the hub cannot hold')
    writer.attribution.holdOutbox = false
    await eventually(() => !writer.status().syncPending, 'never acknowledged once the signature was written')
    const hash = signerOf(writer, operation.operationId).hash
    assert.ok(storedSignatures(server.store.workspace.signatures.doc(), hash).length, 'the acknowledged signature heads hold its signature')
  })
})

/** The 64-byte values stored for `hash` in a signature document as of `heads`, read with Automerge's history. */
function signaturesAt(doc, heads, hash) {
  const backend = A.getBackend(doc), values = []
  for (const [type, shard] of backend.getAll('_root', shardOf(hash), heads)) {
    if (type !== 'map') continue
    for (const [kind, value] of backend.getAll(shard, hash, heads)) if (kind === 'bytes' && value.length === 64) values.push(value)
  }
  return values
}

it('a replica asks the hub to acknowledge one pair of heads captured when its outbox is empty, so a change made while it saves is in neither', { timeout: 60000 }, async () => {
  await withHub(async ({ replica }) => {
    const writer = await replica(0)
    const requests = []
    const requestHub = writer.requestHub.bind(writer)
    writer.requestHub = (path, options) => {
      if (path === '/automerge/sync-ack') requests.push(structuredClone(options.body))
      return requestHub(path, options)
    }
    // While the acknowledgement request saves locally, this machine makes another change, whose signature stays
    // in the outbox for the moment.
    const flush = writer.repo.flush.bind(writer.repo)
    let made = null
    writer.repo.flush = documents => {
      if (writer.syncing && !made) {
        writer.attribution.holdOutbox = true
        const prepared = prepareOperation(writer.workspace.handle.doc(), { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Made during the save' } },
          { replicaId: writer.manifest.replicaId, timestamp: new Date().toISOString() })
        writer.boardChange(prepared.change)
        made = A.getHeads(writer.workspace.handle.doc())[0]
      }
      return flush(documents)
    }
    await execute(writer, 'Saved before the request')
    await eventually(() => made && requests.length, 'no acknowledgement was requested')
    writer.attribution.holdOutbox = false
    await eventually(() => !writer.status().syncPending, 'never acknowledged once the signature was written')
    const board = writer.workspace.handle.doc(), signatures = writer.workspace.signatures.doc()
    for (const request of requests) {
      const contains = !A.getChangesMetaSince(board, request.heads).some(meta => meta.hash === made)
      if (contains) assert.ok(signaturesAt(signatures, request.signatureHeads, made).length, 'a requested board head includes a change whose signature the requested signature heads lack')
    }
  })
})

it('a write whose signature cannot be saved in the local signature cache is not acknowledged; its retry is, once the signature is saved', { timeout: 60000 }, async () => {
  await withHub(async ({ replica }) => {
    const writer = await replica(0)
    const add = writer.signatureCache.add.bind(writer.signatureCache)
    const error = console.error
    console.error = () => {}
    const request = { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Signed, not saved' } }
    let hash
    try {
      writer.signatureCache.add = () => { throw new Error('simulated cache failure') }
      await assert.rejects(writer.execute(request), failure => failure.code === 'STORAGE_FAILED', 'a write whose own signature is only in memory was acknowledged')
      hash = A.getHeads(writer.workspace.handle.doc())[0]
      assert.equal(writer.signatureCache.has(hash), false)
    } finally {
      writer.signatureCache.add = add
      console.error = error
    }
    const receipt = await writer.execute(request)
    assert.equal(receipt.replayed, true)
    assert.equal(receipt.savedLocally, true)
    assert.equal(writer.signatureCache.get(hash)?.machineId, writer.machineKey.machineId, 'the retry is acknowledged only once the signature is saved')
  })
})

it('two keys sharing one 16-byte actor prefix attribute to neither', () => {
  const [one, two] = [generateMachineKey(), generateMachineKey()]
  const machines = [{ id: one.machineId, publicKey: one.publicKey, personId: 'person-one' }, { id: two.machineId, publicKey: two.publicKey, personId: 'person-two' }]
  const index = machineIndex(machines, () => 'f'.repeat(32))
  assert.equal(index.size, 1)
  assert.equal(index.get('f'.repeat(32)).ambiguous, true)
  // Distinct prefixes, and one key certified twice, are not ambiguous.
  const distinct = machineIndex([...machines, { ...machines[0], personId: 'person-three' }])
  assert.equal([...distinct.values()].some(entry => entry.ambiguous), false)
  assert.deepEqual(distinct.get(machinePrefix(one.publicKey)).personIds, ['person-one', 'person-three'])
})

it('an equivocation report is kept across a restart', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, bare }) => {
    const [first, second] = [await bare(0), await bare(1)]
    await eventually(() => A.getHeads(second.board.doc()).join() === A.getHeads(server.store.docHandle.doc()).join(), 'the second member never synced')
    const base = second.board.doc(), actor = machineActor(project.keys[0])
    const one = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('One story') })
    const two = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('Another story') })
    for (const [doc, member] of [[one, first], [two, second]]) {
      const [hash] = A.getHeads(doc)
      member.signatures.change(d => { d[shardOf(hash)][hash] = signChange(project.keys[0], project.projectId, hash) })
    }
    first.board.update(doc => A.merge(doc, one))
    second.board.update(doc => A.merge(doc, two))
    const report = await eventually(() => server.store.getDoc().attribution.summary.equivocations[0], 'the equivocation was never reported')
    // Both members stop, so nothing can report it again; the hub restarts from its own directory.
    await first.repo.shutdown(); await second.repo.shutdown()
    const directory = server.store.directory
    await server.store.close()
    const reopened = hubRuntime(directory, { actors, project })
    await reopened.init()
    try {
      const kept = reopened.getDoc().attribution.summary.equivocations
      assert.equal(kept.length, 1)
      assert.deepEqual([kept[0].machineId, kept[0].seq, [...kept[0].hashes].sort()], [report.machineId, report.seq, [...report.hashes].sort()])
      assert.equal(kept[0].proven, true, 'its proof is checked again on reading')
    } finally { await reopened.close() }
  })
})

/** Two changes one member machine's key signed under one actor and sequence number, one sent by each bare member. */
async function equivocate({ project, server, bare }, { sign: signNow = true } = {}) {
  const [first, second] = [await bare(0), await bare(1)]
  await eventually(() => A.getHeads(second.board.doc()).join() === A.getHeads(server.store.docHandle.doc()).join(), 'the second member never synced')
  const base = second.board.doc(), actor = machineActor(project.keys[0])
  const one = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('One story') })
  const two = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('Another story') })
  const hashes = [A.getHeads(one)[0], A.getHeads(two)[0]]
  const sign = (member, hash) => member.signatures.change(d => { d[shardOf(hash)][hash] = signChange(project.keys[0], project.projectId, hash) })
  if (signNow) {
    sign(first, hashes[0])
    sign(second, hashes[1])
    await eventually(() => hashes.every(hash => storedSignatures(server.store.workspace.signatures.doc(), hash).length), 'the signatures never arrived')
  }
  first.board.update(doc => A.merge(doc, one))
  second.board.update(doc => A.merge(doc, two))
  return { first, second, hashes, sign }
}

it('an equivocation report keeps the signatures that prove it, so it stays proven when they are deleted from the signature document and after a restart', { timeout: 90000 }, async () => {
  await withHub(async context => {
    const { project, server } = context
    const { first, second, hashes } = await equivocate(context)
    await eventually(() => server.store.getDoc().attribution.summary.equivocations[0]?.proven, 'the equivocation was never proven')
    // A member deletes both signatures from the shared document; then both members stop.
    second.signatures.change(d => { for (const hash of hashes) delete d[shardOf(hash)][hash] })
    const signatures = server.store.workspace.signatures
    await eventually(() => A.hasHeads(signatures.doc(), A.getHeads(second.signatures.doc())), 'the deletion never arrived')
    await first.repo.shutdown(); await second.repo.shutdown()
    const directory = server.store.directory
    await server.store.close()
    const reopened = hubRuntime(directory, { actors, project })
    await reopened.init()
    try {
      const [kept] = reopened.getDoc().attribution.summary.equivocations
      assert.deepEqual([...kept.hashes].sort(), [...hashes].sort())
      assert.equal(kept.proven, true, 'the proof was lost with the signature document’s entries')
    } finally { await reopened.close() }
  })
})

it('an equivocation report shown before both signatures arrived becomes proven when the second one arrives', { timeout: 90000 }, async () => {
  await withHub(async context => {
    const { server, bare } = context
    const { first, second, hashes, sign } = await equivocate(context, { sign: false })
    await eventually(() => server.store.getDoc().attribution.summary.equivocations[0], 'the equivocation was never reported')
    // The change the hub holds is signed and checked as usual; the one it refused is not signed yet.
    const held = hashes.find(hash => A.hasHeads(server.store.docHandle.doc(), [hash])), refused = hashes.find(hash => hash !== held)
    sign(held === hashes[0] ? first : second, held)
    await eventually(() => server.store.attribution.stateOf(held).state === 'signed', 'the held change was never checked')
    // The members that sent the two changes stop, so nothing is refused again; a third member then supplies the
    // missing signature.
    await first.repo.shutdown(); await second.repo.shutdown()
    await new Promise(resolve => setTimeout(resolve, 300))
    const report = server.store.getDoc().attribution.summary.equivocations[0]
    assert.deepEqual(report.signed, report.hashes.map(hash => hash === held), 'only the held change is signed so far')
    const third = await bare(2)
    await eventually(() => A.getHeads(third.signatures.doc()).join() === A.getHeads(server.store.workspace.signatures.doc()).join(), 'the third member never synced')
    sign(third, refused)
    await eventually(() => storedSignatures(server.store.workspace.signatures.doc(), refused).length, 'the second signature never arrived')
    await eventually(() => server.store.getDoc().attribution.summary.equivocations[0].proven, 'the report was not refreshed when its signature arrived', 5000)
    assert.equal(server.store.status().attribution.equivocations, 1)
  })
})

it('a reopened replica derives only the changes it has no stored entry for, and shows the same entries', { timeout: 90000 }, async () => {
  await withHub(async ({ root, project, server, replica, bare }) => {
    const directory = join(root, 'reopened-reader')
    let reader = await replica(1, { directory })
    const { result } = await execute(server.store, 'Altered, then the reader reopens')
    const original = await eventually(() => operationOf(reader, result.taskId), 'never relayed')
    const editor = await bare(2)
    await eventually(() => editor.board.doc().operations?.[original.operationId], 'the editor never synced')
    editor.board.change(doc => { doc.operations[original.operationId].payload.title = new A.ImmutableString('Rewritten') })
    const edit = A.getHeads(editor.board.doc())[0]
    await eventually(() => A.hasHeads(reader.docHandle.doc(), [edit]), 'the edit never reached the reader')
    await checked(reader)
    await eventually(() => reviewEntry(reader, edit), 'the edit was never listed')
    const changes = reader.attribution.metas.size
    const before = JSON.stringify(reader.getDoc().activity.map(({ id, kind, event, flags }) => ({ id, kind, event, flags })))
    await reader.close()
    // Count what the reopened replica derives: nothing it derived before.
    const add = ChangeLog.prototype.add
    let derived = 0
    ChangeLog.prototype.add = function (entry) { derived++; return add.call(this, entry) }
    try {
      reader = await replica(1, { directory })
      await checked(reader)
    } finally { ChangeLog.prototype.add = add }
    assert.ok(derived <= reader.attribution.metas.size - changes, `derived ${derived} changes again`)
    const shown = entryOf(reader, original.operationId)
    assert.equal(shown.changes[0].state, 'signed')
    assert.equal(shown.event.payload.title, 'Altered, then the reader reopens', 'shown as signed, as before the restart')
    assert.equal(reader.getDoc().activity.find(entry => entry.id === edit)?.kind, 'unrecognised')
    assert.ok(reviewEntry(reader, edit), 'and still listed for review')
    const after = JSON.stringify(reader.getDoc().activity.filter(entry => before.includes(entry.id)).map(({ id, kind, event, flags }) => ({ id, kind, event, flags })))
    assert.equal(after, before)
  })
})
