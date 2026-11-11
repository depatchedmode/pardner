import { it } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { storedSignatures } from '../lib/change-signatures.js'
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
