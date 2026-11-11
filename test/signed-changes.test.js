import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, cp } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket, WebSocketServer } from 'ws'
import * as A from '@automerge/automerge'
import { Repo } from '@automerge/automerge-repo'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { actorPrefix, machineActor, machinePrefix, shardOf, signChange, signaturesDocumentUrl } from '../lib/change-signatures.js'
import { actorId as actorFor } from '../lib/client-identity.js'
import { machineKeyPem, personIdFor } from '../lib/machine-key.js'
import { DurableRepo } from '../lib/durable-repo.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { storedSignatures } from '../lib/change-signatures.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { admitMembers, advertiseRoutes, hubRuntime, memberAdapter, replicaRuntime, testProject } from '../support/machines.js'

// Every change a machine makes is signed and every peer checks it (docs/PARDNER-TRUST-DESIGN.md, section 3).
// Changes are applied first and checked after; none is refused, dropped or hidden.

const token = 'signed-changes-token'
const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'builder', handle: 'builder', kind: 'agent' }]
// Short waits keep the pending rule observable in tests; the defaults are a second.
const timing = { quietMs: 400, pollMs: 100 }

async function eventually(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    assert.ok(Date.now() < deadline, typeof message === 'function' ? message() : message)
    await delay(25)
  }
}

async function withHub(run, { members = 3 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-signed-'))
  const project = testProject({ members })
  const server = new AutomergeSyncServer({ store: hubRuntime(join(root, 'hub'), { actors, project, retryMs: 100, attribution: timing }), env: {}, apiToken: token,
    httpPort: 0, wsPort: 0, logger: {} })
  const opened = []
  try {
    await server.start()
    await admitMembers(server.store, project)
    const replica = async (index, { directory = join(root, `replica-${index}-${randomUUID()}`), ...options } = {}) => {
      const runtime = replicaRuntime(directory, project, index, { hub: server, actors, retryMs: 100, attribution: timing, ...options })
      opened.push(runtime)
      await runtime.init()
      await eventually(() => runtime.status().hubConnected && !runtime.status().syncPending, `replica ${index} never synced`)
      return runtime
    }
    const bare = async index => {
      const repo = new Repo({ network: [memberAdapter(project, index, `ws://127.0.0.1:${server.wsPort}/automerge`, { retryMs: 100 })], sharePolicy: async () => true })
      opened.push({ close: () => repo.shutdown() })
      const board = await repo.find(server.store.manifest.url)
      const signatures = await repo.find(signaturesDocumentUrl(project.projectId))
      board.update(doc => A.clone(doc, { actor: machineActor(project.keys[index]) }))
      return { repo, board, signatures, key: project.keys[index] }
    }
    await run({ root, project, server, replica, bare })
  } finally {
    await Promise.allSettled(opened.map(runtime => runtime.close()))
    await server.stop()
    await rm(root, { recursive: true, force: true })
  }
}

const execute = (runtime, title, actorId = 'alice') => runtime.execute({ operationId: randomUUID(), actorId, type: 'task.create', payload: { title } })
const operationOf = (runtime, taskId) => Object.values(runtime.getDoc().operations).find(event => event.taskId === taskId && event.type === 'task.create')
const signerOf = (runtime, operationId) => runtime.getDoc().attribution.operations[operationId]?.[0]
const stateOf = (runtime, operationId) => signerOf(runtime, operationId)?.state

/** A task.create written straight into a bare repo's board, as a modified client could: one change, with an Activity entry. */
function writeTask(member, title) {
  const prepared = prepareOperation(member.board.doc(), { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title } },
    { replicaId: 'replica-bare', timestamp: new Date().toISOString() })
  member.board.change(prepared.change)
  const hash = A.getHeads(member.board.doc())[0]
  return { operationId: prepared.event.operationId, taskId: prepared.event.taskId, hash }
}

it('every change carries its machine’s actor prefix, the creation change included, and each load draws a new suffix', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const prefixOf = key => machinePrefix(key.publicKey)
    const first = A.getChangesMetaSince(server.store.docHandle.doc(), [])[0]
    assert.equal(first.seq, 1)
    assert.equal(actorPrefix(first.actor), prefixOf(project.owner), 'the board’s creation change is the hub machine’s')
    const signatureCreation = A.getChangesMetaSince(server.store.workspace.signatures.doc(), [])[0]
    assert.equal(actorPrefix(signatureCreation.actor), prefixOf(project.owner), 'so is the signature document’s')
    const directory = join(server.store.directory, '..', 'reopened')
    let writer = await replica(0, { directory })
    await execute(writer, 'Before reopening')
    const firstActor = A.getActorId(writer.docHandle.doc())
    await writer.close()
    writer = await replica(0, { directory })
    const { result } = await execute(writer, 'After reopening')
    const secondActor = A.getActorId(writer.docHandle.doc())
    assert.notEqual(secondActor, firstActor, 'a new load, a new suffix')
    assert.equal(actorPrefix(secondActor), prefixOf(project.keys[0]))
    const own = A.getChangesMetaSince(writer.docHandle.doc(), []).filter(meta => actorPrefix(meta.actor) === prefixOf(project.keys[0]))
    assert.ok(own.some(meta => meta.actor === secondActor && meta.seq === 1), 'its sequence starts again at 1')
    await eventually(() => stateOf(server.store, operationOf(server.store, result.taskId)?.operationId) === 'signed', 'the hub never attributed the change')
    for (const meta of A.getChangesMetaSince(server.store.docHandle.doc(), [])) {
      assert.ok([prefixOf(project.owner), ...project.keys.map(prefixOf)].includes(actorPrefix(meta.actor)), `change ${meta.hash} has a machine actor`)
    }
  })
})

it('a change relayed by the hub to another member shows its original signer there, and an Actor its machine may not act as is flagged', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    // Member 0's own human Actor, as the client registers it, and member 1's.
    const own = actorFor(personIdFor(project.keys[0].publicKey)), other = actorFor(personIdFor(project.keys[1].publicKey))
    for (const [id, handle] of [[own, 'member-zero'], [other, 'member-one']]) {
      await server.store.execute({ operationId: randomUUID(), actorId: 'alice', type: 'actor.register', payload: { id, handle, kind: 'human' } })
    }
    const writer = await replica(0), reader = await replica(1)
    const { result } = await execute(writer, 'Written by member 0', own)
    const operation = await eventually(() => operationOf(reader, result.taskId), 'the change never reached the reader')
    const signer = await eventually(() => signerOf(reader, operation.operationId)?.state === 'signed' && signerOf(reader, operation.operationId), 'never attributed')
    assert.equal(signer.machineId, project.keys[0].machineId, 'the writer, not the hub that relayed it')
    assert.equal(signerOf(server.store, operation.operationId).machineId, project.keys[0].machineId)
    assert.equal(signer.actorMismatch, undefined, 'a machine may act as its own person')
    assert.equal(reader.getDoc().attribution.machines[project.keys[0].machineId].personName, 'Member 0')
    // Peers take a machine's word for which of its Actors acted, but not for another person's Actor.
    const { result: claimed } = await execute(writer, 'Claims to be member 1', other)
    const impersonation = await eventually(() => operationOf(reader, claimed.taskId), 'never relayed')
    await eventually(() => signerOf(reader, impersonation.operationId)?.state === 'signed', 'never attributed')
    assert.equal(signerOf(reader, impersonation.operationId).actorMismatch, true)
    assert.equal(signerOf(reader, impersonation.operationId).machineId, project.keys[0].machineId, 'still shown as made by the machine that signed it')
    assert.ok(reader.getDoc().attribution.review.some(entry => entry.operations.includes(impersonation.operationId) && entry.actorMismatch))
    assert.ok(!reader.getDoc().attribution.review.some(entry => entry.operations.includes(operation.operationId)))
  })
})

it('a change with no signature is applied everywhere, pending, then unattributed and named with the machine that relayed it', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const reader = await replica(1)
    const member = await bare(0)
    const states = { hub: new Set(), reader: new Set() }
    const written = writeTask(member, 'Never signed')
    const sample = setInterval(() => {
      const hubOp = operationOf(server.store, written.taskId), readerOp = operationOf(reader, written.taskId)
      if (hubOp) states.hub.add(stateOf(server.store, hubOp.operationId))
      if (readerOp) states.reader.add(stateOf(reader, readerOp.operationId))
    }, 10)
    try {
      await eventually(() => stateOf(reader, written.operationId) === 'unattributed', () => `reader saw ${[...states.reader]}`)
      await eventually(() => stateOf(server.store, written.operationId) === 'unattributed', 'the hub never resolved it')
    } finally { clearInterval(sample) }
    assert.ok(states.hub.has('pending') && states.reader.has('pending'), 'pending first')
    assert.ok(!states.hub.has('signed') && !states.reader.has('signed'))
    const atHub = signerOf(server.store, written.operationId)
    assert.equal(atHub.relayedBy, project.keys[0].machineId, 'the hub names the machine that sent it')
    assert.equal(atHub.claimed, project.keys[0].machineId)
    assert.equal(atHub.reason, 'missing')
    assert.equal(signerOf(reader, written.operationId).relayedBy, project.keys[0].machineId, 'the reader learns it from the hub')
    // Never dropped or hidden: the task is on every board, and every peer holds the same changes.
    assert.equal(reader.getDoc().tasks[written.taskId].title, 'Never signed')
    await eventually(() => A.getHeads(reader.docHandle.doc()).join() === A.getHeads(server.store.docHandle.doc()).join(), 'the peers did not converge')
    assert.ok(reader.getDoc().attribution.review.some(entry => entry.change === written.hash && entry.state === 'unattributed'))
  })
})

it('a signature that arrives after its change turns pending into attributed, and a bad one is flagged', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const reader = await replica(1)
    const member = await bare(0)
    // Pending while the signature is held back, then attributed once it arrives.
    const late = writeTask(member, 'Signed late')
    await eventually(() => stateOf(server.store, late.operationId) === 'pending', 'the hub never saw the change')
    await eventually(() => stateOf(reader, late.operationId) === 'pending', 'the reader never saw the change')
    member.signatures.change(doc => { doc[shardOf(late.hash)][late.hash] = signChange(member.key, project.projectId, late.hash) })
    await eventually(() => stateOf(server.store, late.operationId) === 'signed', 'the hub never attributed it')
    await eventually(() => stateOf(reader, late.operationId) === 'signed', 'the reader never attributed it')
    assert.equal(signerOf(reader, late.operationId).machineId, project.keys[0].machineId)
    // A signature made by another key does not count: the signer is read from the actor, never the entry.
    const forged = writeTask(member, 'Badly signed')
    member.signatures.change(doc => { doc[shardOf(forged.hash)][forged.hash] = signChange(project.keys[1], project.projectId, forged.hash) })
    await eventually(() => stateOf(server.store, forged.operationId) === 'unattributed', 'the hub never flagged it')
    assert.equal(signerOf(server.store, forged.operationId).reason, 'invalid')
    await eventually(() => stateOf(reader, forged.operationId) === 'unattributed', 'the reader never flagged it')
    // Random bytes are flagged the same way.
    const junk = writeTask(member, 'Junk signature')
    member.signatures.change(doc => { doc[shardOf(junk.hash)][junk.hash] = new Uint8Array(randomBytes(64)) })
    await eventually(() => signerOf(server.store, junk.operationId)?.reason === 'invalid' && stateOf(server.store, junk.operationId) === 'unattributed', 'junk never flagged')
  })
})

it('a signature entry deleted from the shared document stays attributed where it was seen, and is written back', { timeout: 60000 }, async () => {
  await withHub(async ({ server, replica, bare }) => {
    const writer = await replica(0), reader = await replica(1)
    const { result } = await execute(writer, 'Keep my signature')
    const operation = await eventually(() => operationOf(reader, result.taskId), 'never relayed')
    await eventually(() => stateOf(reader, operation.operationId) === 'signed', 'never attributed')
    const hash = signerOf(reader, operation.operationId).hash
    // A member deletes the entry from its copy of the shared document.
    const vandal = await bare(2)
    await eventually(() => vandal.signatures.doc()[shardOf(hash)]?.[hash], 'the vandal never received the entry')
    vandal.signatures.change(doc => { delete doc[shardOf(hash)][hash] })
    const deletion = A.getHeads(vandal.signatures.doc())
    await eventually(() => A.hasHeads(server.store.workspace.signatures.doc(), deletion), 'the deletion never reached the hub')
    assert.equal(stateOf(reader, operation.operationId), 'signed', 'still attributed where it was verified')
    assert.equal(stateOf(server.store, operation.operationId), 'signed')
    // Peers that verified it write it back, so a member that never saw it can still check it.
    await eventually(() => server.store.workspace.signatures.doc()[shardOf(hash)]?.[hash], 'the entry was not written back')
    await eventually(() => vandal.signatures.doc()[shardOf(hash)]?.[hash], 'the written-back entry did not reach the vandal')
    const late = await replica(2)
    await eventually(() => stateOf(late, operation.operationId) === 'signed', 'a new replica could not check it')
  })
})

/**
 * A relay in front of the hub's native socket: frames pass in order, optionally late; the link can be cut and
 * restored; and the signature document's frames from the replica can be held back.
 */
async function relay(server, projectId) {
  const http = createServer()
  const wss = new WebSocketServer({ server: http })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${http.address().port}/automerge`
  const state = { blocked: false, delayMs: 0, holdSignatures: false, links: new Set() }
  const { cbor } = await import('@automerge/automerge-repo')
  const signaturesId = signaturesDocumentUrl(projectId).slice('automerge:'.length)
  wss.on('connection', downstream => {
    if (state.blocked) return downstream.terminate()
    const upstream = new WebSocket(`ws://127.0.0.1:${server.wsPort}/automerge`)
    const link = { downstream, upstream }
    state.links.add(link)
    const end = () => { state.links.delete(link); downstream.terminate(); upstream.terminate() }
    downstream.on('close', end); upstream.on('close', end); downstream.on('error', end); upstream.on('error', end)
    const opened = new Promise(resolve => upstream.once('open', resolve))
    const pipe = (from, to, up) => {
      let chain = Promise.resolve()
      from.on('message', (data, binary) => {
        chain = chain.then(async () => {
          await opened
          if (state.delayMs) await delay(state.delayMs)
          if (up && binary && state.holdSignatures) {
            try { if (cbor.decode(data)?.documentId === signaturesId) return } catch { /* Not an Automerge frame. */ }
          }
          if (to.readyState === WebSocket.OPEN) to.send(data, { binary })
        })
      })
    }
    pipe(downstream, upstream, true)
    pipe(upstream, downstream, false)
  })
  advertiseRoutes(server, { ws: [url] })
  return {
    url, state,
    cut() { state.blocked = true; for (const { downstream, upstream } of state.links) { downstream.terminate(); upstream.terminate() } },
    restore() { state.blocked = false },
    close: () => new Promise(resolve => { state.blocked = true; for (const { downstream, upstream } of state.links) { downstream.terminate(); upstream.terminate() }; wss.close(); http.close(resolve) }),
  }
}

/** Collects every state an operation passes through on each runtime, sampled every 10 ms. */
function sampler(runtimes, operationId) {
  const seen = runtimes.map(() => new Set())
  const timer = setInterval(() => runtimes.forEach((runtime, index) => {
    try { const state = stateOf(runtime, operationId()); if (state) seen[index].add(state) } catch { /* Not yet arrived. */ }
  }), 10)
  return { seen, stop: () => clearInterval(timer) }
}

it('a writer’s cut link keeps its change pending for the outage, everywhere, and a slow link never makes one unattributed', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const path = await relay(server, project.projectId)
    try {
      const writer = await replica(0, { hubWsUrl: path.url }), reader = await replica(1)
      // The board change leaves; its signature does not, and then the link drops.
      writer.attribution.holdOutbox = true
      const { result } = await execute(writer, 'Written before the cut')
      const operation = await eventually(() => operationOf(server.store, result.taskId), 'the change never reached the hub')
      path.cut()
      const states = sampler([server.store, reader], () => operation.operationId)
      try {
        await eventually(() => operationOf(reader, result.taskId), 'the change never reached the reader')
        await delay(timing.quietMs * 4)
        assert.equal(stateOf(server.store, operation.operationId), 'pending', 'the hub waits for the machine that sent it')
        assert.equal(signerOf(server.store, operation.operationId).waitingFor, project.keys[0].machineId)
        assert.equal(stateOf(reader, operation.operationId), 'pending', 'the reader waits too: the hub is still waiting')
        writer.attribution.holdOutbox = false
        writer.attribution.flushOutbox()
        path.restore()
        await eventually(() => stateOf(server.store, operation.operationId) === 'signed', 'never attributed after the link returned')
        await eventually(() => stateOf(reader, operation.operationId) === 'signed', 'the reader never attributed it')
      } finally { states.stop() }
      assert.deepEqual(states.seen.map(set => set.has('unattributed')), [false, false], 'never unattributed during the outage')
      // Every frame now arrives later than the quiet wait, in order: a signature still follows its change.
      path.state.delayMs = timing.quietMs * 1.5
      const writes = []
      for (let index = 0; index < 3; index++) writes.push((await execute(writer, `Slow ${index}`)).result.taskId)
      for (const taskId of writes) {
        const slow = await eventually(() => operationOf(server.store, taskId), 'a slow change never arrived', 30000)
        const seen = sampler([server.store, reader], () => slow.operationId)
        try {
          await eventually(() => stateOf(server.store, slow.operationId) === 'signed' && stateOf(reader, slow.operationId) === 'signed', 'a slow change was never attributed', 30000)
        } finally { seen.stop() }
        assert.deepEqual(seen.seen.map(set => set.has('unattributed')), [false, false], 'a slow link is not an unsigned change')
      }
    } finally { await path.close() }
  })
})

it('a write is acknowledged locally with the hub unreachable; the hub’s acknowledgement waits for its signature too', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const path = await relay(server, project.projectId)
    try {
      const writer = await replica(0, { hubWsUrl: path.url })
      path.cut()
      await eventually(() => !writer.status().hubConnected, 'the link never dropped')
      const { result, savedLocally, syncPending } = await execute(writer, 'Saved while the hub is away')
      assert.equal(savedLocally, true, 'acknowledged locally after the disk barrier')
      assert.equal(syncPending, true)
      assert.equal(writer.getDoc().attribution.operations[operationOf(writer, result.taskId).operationId][0].state, 'signed', 'signed at once, before any sync')
      // The board change reaches the hub, but the signature document's frames are held back: no acknowledgement yet.
      path.state.holdSignatures = true
      path.restore()
      const operation = await eventually(() => operationOf(server.store, result.taskId), 'the change never reached the hub')
      await delay(500)
      // To the hub this machine now looks like one that never sends its signature; that is never final.
      assert.notEqual(stateOf(server.store, operation.operationId), 'signed')
      assert.equal(writer.status().syncPending, true, 'the hub has not persisted the signature, so nothing is acknowledged')
      assert.notDeepEqual(writer.status().signatures.acknowledgedHeads, writer.status().signatures.heads)
      path.state.holdSignatures = false
      path.cut()
      path.restore()
      await eventually(() => !writer.status().syncPending, 'never acknowledged')
      assert.deepEqual(writer.status().signatures.acknowledgedHeads, writer.status().signatures.heads)
      assert.ok(A.hasHeads(server.store.workspace.signatures.doc(), writer.status().signatures.heads))
      assert.equal(stateOf(server.store, operation.operationId), 'signed')
    } finally { await path.close() }
  })
})

it('the same field edited on two disconnected machines keeps both signed alternatives for explicit resolution', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const left = await relay(server, project.projectId), right = await relay(server, project.projectId)
    try {
      const a = await replica(0, { hubWsUrl: left.url }), b = await replica(1, { hubWsUrl: right.url })
      const { result } = await execute(a, 'Disputed title')
      await eventually(() => b.workspace.snapshot().tasks[result.taskId], 'the task never reached the second machine')
      left.cut(); right.cut()
      await eventually(() => !a.status().hubConnected && !b.status().hubConnected, 'the links never dropped')
      const edit = (runtime, title) => runtime.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.update',
        payload: { taskId: result.taskId, updates: { title }, expectedRevisions: { title: runtime.workspace.taskContext(result.taskId).revisions.title } } })
      const [fromA, fromB] = [await edit(a, 'Title from A'), await edit(b, 'Title from B')]
      left.restore(); right.restore()
      await eventually(() => Object.keys(server.store.workspace.taskContext(result.taskId).conflicts).includes('title'), 'the alternatives never met')
      const alternatives = server.store.workspace.taskContext(result.taskId).conflicts.title.map(choice => choice.value).sort()
      assert.deepEqual(alternatives, ['Title from A', 'Title from B'], 'both kept; neither silently discarded')
      for (const [receipt, key] of [[fromA, project.keys[0]], [fromB, project.keys[1]]]) {
        await eventually(() => stateOf(server.store, receipt.operationId) === 'signed', 'an alternative was never attributed')
        assert.equal(signerOf(server.store, receipt.operationId).machineId, key.machineId)
      }
      await eventually(() => A.getHeads(a.docHandle.doc()).join() === A.getHeads(b.docHandle.doc()).join(), 'the machines never converged')
    } finally { await left.close(); await right.close() }
  })
})

it('a change from a removed machine, relayed by a member, is applied and flagged; earlier work stays attributed; every peer converges', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const removed = await replica(0), carrier = await replica(1), observer = await replica(2)
    const { result: before } = await execute(removed, 'Before the removal')
    const earlier = await eventually(() => operationOf(observer, before.taskId), 'never relayed')
    await eventually(() => stateOf(observer, earlier.operationId) === 'signed', 'never attributed')
    await server.store.addRecords([project.remove(project.keys[0])])
    await eventually(() => removed.status().hubRefusal?.code === 'REVOKED', 'the removed machine was never refused')
    // Not yet aware of its removal, it writes on, and a member carries the change and its signature to the hub.
    const { result: after } = await removed.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'After the removal' } })
    removed.attribution.flushOutbox()
    carrier.docHandle.update(doc => A.merge(doc, A.clone(removed.docHandle.doc())))
    carrier.workspace.signatures.update(doc => A.merge(doc, A.clone(removed.workspace.signatures.doc())))
    for (const runtime of [server.store, carrier, observer]) {
      const late = await eventually(() => operationOf(runtime, after.taskId), 'the relayed change never arrived')
      await eventually(() => stateOf(runtime, late.operationId) === 'removed', () => `${runtime.role} shows ${stateOf(runtime, late.operationId)}`)
      assert.equal(signerOf(runtime, late.operationId).machineId, project.keys[0].machineId)
      assert.equal(stateOf(runtime, earlier.operationId), 'signed', 'work from before the removal stays attributed')
      assert.equal(runtime.getDoc().tasks[after.taskId].title, 'After the removal', 'applied, not dropped')
      assert.ok(runtime.getDoc().attribution.review.some(entry => entry.state === 'removed' && entry.operations.includes(late.operationId)))
    }
    await eventually(() => new Set([server.store, carrier, observer].map(runtime => A.getHeads(runtime.docHandle.doc()).join())).size === 1, 'the peers diverged')
  })
})

it('a restored backup running beside its original, in one process, never reuses an actor and sequence number', { timeout: 90000 }, async () => {
  await withHub(async ({ root, project, server, replica }) => {
    const directory = join(root, 'original'), backup = join(root, 'backup')
    const original = await replica(0, { directory })
    await execute(original, 'Before the backup')
    await original.close()
    await cp(directory, backup, { recursive: true })
    const [first, second] = [await replica(0, { directory }), await replica(0, { directory: backup })]
    assert.notEqual(A.getActorId(first.docHandle.doc()), A.getActorId(second.docHandle.doc()), 'two handles of one document, two actors')
    const tasks = []
    for (let index = 0; index < 3; index++) {
      tasks.push((await execute(first, `Original ${index}`)).result.taskId, (await execute(second, `Backup ${index}`)).result.taskId)
    }
    await eventually(() => tasks.every(taskId => server.store.workspace.snapshot().tasks[taskId]), 'the hub never merged both copies')
    await eventually(() => tasks.every(taskId => first.workspace.snapshot().tasks[taskId] && second.workspace.snapshot().tasks[taskId]), 'the copies never merged')
    const seen = new Map()
    for (const meta of A.getChangesMetaSince(server.store.docHandle.doc(), [])) {
      const key = `${meta.actor}:${meta.seq}`
      assert.ok(!seen.has(key), `actor and sequence number ${key} used twice`)
      seen.set(key, meta.hash)
    }
    for (const taskId of tasks) await eventually(() => stateOf(server.store, operationOf(server.store, taskId).operationId) === 'signed', 'a copy’s change was never attributed')
    assert.ok(server.duplicates.has(project.keys[0].machineId), 'two live copies of one machine are reported')
  })
})

it('a kill between the board’s save and the signature’s save loses nothing, and the entry is re-created at start-up', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-signed-kill-'))
  const project = testProject({ members: 1 })
  try {
    const directory = join(root, 'hub')
    const child = fork(new URL('../support/signing-process.js', import.meta.url), [], { execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    child.send({ directory, key: machineKeyPem(project.owner), genesis: project.genesis, actors, holdSignatures: true })
    const [message] = await once(child, 'message')
    assert.equal(message.type, 'saved', message.message)
    assert.equal(message.receipt.savedLocally, true, 'the write was acknowledged after its disk barrier')
    const exited = once(child, 'exit')
    child.send('kill')
    assert.equal((await exited)[1], 'SIGKILL')
    // On disk: the board holds the change, and the signature document does not hold its signature.
    const copy = join(root, 'inspect')
    await cp(join(directory, 'repo'), copy, { recursive: true })
    const inspect = new DurableRepo({ storage: new NodeFSStorageAdapter(copy) })
    const board = await inspect.find(message.url)
    const hash = A.getHeads(board.doc()).find(head => A.getChangesMetaSince(board.doc(), []).some(meta => meta.hash === head))
    assert.ok(board.doc().tasks[message.receipt.taskId], 'the acknowledged change survived')
    const signatures = await inspect.find(signaturesDocumentUrl(project.projectId))
    assert.deepEqual(storedSignatures(signatures.doc(), hash), [], 'killed before the signature document was saved')
    await inspect.shutdown()
    // Reopened, the writer puts its own entry back from its signature cache: the same bytes it would sign again.
    const runtime = hubRuntime(directory, { actors, project, attribution: timing })
    await runtime.init()
    try {
      const [restored] = await eventually(() => storedSignatures(runtime.workspace.signatures.doc(), hash).length && storedSignatures(runtime.workspace.signatures.doc(), hash),
        'the entry was not written back')
      assert.deepEqual(Buffer.from(restored), Buffer.from(signChange(project.owner, project.projectId, hash)))
      const operation = operationOf(runtime, message.receipt.taskId)
      await eventually(() => stateOf(runtime, operation.operationId) === 'signed', 'the change was never shown as signed')
    } finally { await runtime.close() }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('two different signed changes with one actor and sequence number are reported, with the machine named, and sync is not silently broken', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, bare, replica }) => {
    const watcher = await replica(2)
    const [first, second] = [await bare(0), await bare(1)]
    await eventually(() => A.getHeads(second.board.doc()).join() === A.getHeads(server.store.docHandle.doc()).join(), 'the second member never synced')
    // Member 0's key signs two different changes made under one actor and sequence number.
    const base = second.board.doc(), actor = machineActor(project.keys[0])
    const one = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('One story') })
    const two = A.change(A.clone(base, { actor }), doc => { doc.name = new A.ImmutableString('Another story') })
    const [hashOne, hashTwo] = [A.getHeads(one)[0], A.getHeads(two)[0]]
    for (const [hash, member] of [[hashOne, first], [hashTwo, second]]) {
      member.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(project.keys[0], project.projectId, hash) })
    }
    await eventually(() => [hashOne, hashTwo].every(hash => storedSignatures(server.store.workspace.signatures.doc(), hash).length), 'the signatures never arrived')
    // Each reaches the hub from a different member at once; whichever arrives second is refused by Automerge.
    first.board.update(doc => A.merge(doc, one))
    second.board.update(doc => A.merge(doc, two))
    const report = await eventually(() => server.store.getDoc().attribution.summary.equivocations[0], 'the equivocation was never reported')
    assert.equal(report.machineId, project.keys[0].machineId, 'the machine is named')
    assert.equal(report.proven, true, 'both changes carry valid signatures: proof')
    assert.deepEqual([...report.hashes].sort(), [hashOne, hashTwo].sort())
    assert.equal(report.seq, 1)
    assert.ok([project.keys[0].machineId, project.keys[1].machineId].includes(report.relayedBy))
    assert.equal(server.store.status().attribution.equivocations, 1, 'visible in status')
    // The hub's board and every other member keep syncing; only the conflicting change's sender is affected.
    const { result } = await execute(watcher, 'Still syncing')
    await eventually(() => server.store.workspace.snapshot().tasks[result.taskId], 'sync with other members broke')
  })
})
