import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { storageValue } from '../lib/workspace-values.js'
import { admitMembers, hubRuntime, replicaRuntime, testProject } from '../support/machines.js'
import { forge } from '../support/trust-records.js'

// The membership rules hold for records that reach a peer as existing history in the synced document, which the
// hub's gate never sees: a member machine writes them straight into its copy, it syncs to the hub, and each peer
// harvests them into its record store and computes membership from that.

const token = 'harvest-test-token'
const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]

async function eventually(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    assert.ok(Date.now() < deadline, message)
    await delay(25)
  }
}

async function withHub(run) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-harvest-'))
  const project = testProject({ members: 2 })
  const server = new AutomergeSyncServer({ store: hubRuntime(join(root, 'hub'), { actors, project, retryMs: 100 }), env: {}, apiToken: token,
    httpPort: 0, wsPort: 0, logger: {} })
  const replicas = []
  try {
    await server.start()
    await admitMembers(server.store, project)
    const replica = async index => {
      const runtime = replicaRuntime(join(root, `replica-${index}-${randomUUID()}`), project, index, { hub: server, actors, retryMs: 100 })
      replicas.push(runtime)
      await runtime.init()
      await eventually(() => runtime.status().hubConnected && !runtime.status().syncPending, `replica ${index} never synced`)
      return runtime
    }
    await run({ project, server, replica })
  } finally {
    await Promise.allSettled(replicas.map(runtime => runtime.close()))
    await server.stop()
    await rm(root, { recursive: true, force: true })
  }
}

/** Writes `records` straight into `runtime`'s document, as a modified client could, bypassing every gate. */
const write = (runtime, records) => runtime.docHandle.change(doc => { for (const record of records) doc.membership[record.recordId] = storageValue(record) })
const member = (membership, key) => membership.machines.some(machine => machine.id === key.machineId)
const notStored = (runtime, record) => runtime.membership().notStored.find(entry => entry.recordId === record.recordId)?.reason

it('certifications without the certified machine’s consent, or under a person ID that is not its key’s, count for nothing when synced as history', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const trust = project.trust, [first, second] = project.keys
    const writer = await replica(0)
    const firstId = personIdFor(first.publicKey), secondId = personIdFor(second.publicKey)
    const intruder = generateMachineKey(), misnamed = generateMachineKey()
    // The first member claims an intruder key, and the second member's key, as its own machines; neither consented.
    const honest = trust.pair(first, generateMachineKey(), firstId)
    const claimIntruder = forge(first, honest, { subject: intruder.machineId, publicKey: intruder.publicKey })
    const claimSecond = forge(first, honest, { subject: second.machineId, publicKey: second.publicKey })
    // The owner's machine admits a fresh key under the second member's person ID, with the fresh key's consent to that ID.
    const admission = trust.admit(project.owner, misnamed)
    const underSecond = forge(project.owner, admission, { subject: secondId, joinRequest: trust.consent(misnamed, admission.offer, secondId) })
    // A record that does count, so each peer's harvest shows when it has processed the batch.
    const marker = trust.record(first, 'profile', firstId, { displayName: 'First member', email: 'first@example.test' })
    write(writer, [claimIntruder, claimSecond, underSecond, marker])
    for (const runtime of [server.store, writer]) {
      // The batch is one change, so once the marker is stored every record in it has been harvested.
      await eventually(() => runtime.records.get(marker.recordId), 'the batch never arrived')
      const membership = runtime.membership()
      assert.equal(member(membership, intruder), false, 'an unconsented key is not a member')
      assert.equal(member(membership, misnamed), false, 'a key admitted under another person’s ID is not a member')
      assert.equal(membership.machines.find(machine => machine.id === second.machineId)?.personId, secondId, 'the second member’s key stays theirs')
      assert.deepEqual(membership.removedMachines, [])
      assert.equal(notStored(runtime, claimIntruder), 'The certified machine did not consent to this certification')
      assert.equal(notStored(runtime, claimSecond), 'The certified machine did not consent to this certification')
      assert.equal(notStored(runtime, underSecond), 'A person ID must be derived from the key of the machine the person is admitted with')
    }
    // The second member's own replica still syncs as itself.
    const other = await replica(1)
    assert.equal(other.status().hubRefusal, null)
  })
})

it('an agents-only machine’s membership records, synced as history, grant and remove nothing on any peer', { timeout: 60000 }, async () => {
  await withHub(async ({ project, server, replica }) => {
    const trust = project.trust, [first, second] = project.keys
    const firstId = personIdFor(first.publicKey), secondId = personIdFor(second.publicKey)
    const box = generateMachineKey(), viaBox = generateMachineKey(), spare = generateMachineKey()
    // The first member pairs a full spare machine and an agents-only box through the gate, as the client does.
    await server.store.addRecords([trust.pair(first, spare, firstId), trust.pair(first, box, firstId, { agentsOnly: true })])
    const writer = await replica(0)
    await eventually(() => member(writer.membership(), box), 'the box never reached the replica')
    const forbidden = [
      trust.pair(box, viaBox, firstId),
      trust.removeMachine(box, spare),
      trust.remove(box, firstId),
      trust.record(box, 'profile', firstId, { displayName: 'Renamed by the box', email: '' }),
      // Signed by the box for another person's agent.
      trust.record(box, 'agent.name', `actor-${'0'.repeat(64)}`, { machineId: box.machineId, displayName: 'Stolen', harness: 'cursor' }),
    ]
    const marker = trust.record(first, 'profile', firstId, { displayName: 'First member', email: 'first@example.test' })
    write(writer, [...forbidden, marker])
    for (const runtime of [server.store, writer]) {
      // The batch is one change, so once the marker is stored every record in it has been harvested.
      await eventually(() => runtime.records.get(marker.recordId), 'the batch never arrived')
      const membership = runtime.membership()
      assert.equal(member(membership, viaBox), false, 'an agents-only machine pairs no machine')
      assert.equal(member(membership, spare), true, 'nor removes one')
      assert.deepEqual(membership.removedPeople, [], 'nor makes its person leave')
      assert.equal(member(membership, second), true)
      assert.equal(membership.people.find(person => person.id === secondId)?.role, 'member')
      for (const record of forbidden) assert.ok(membership.rejected.some(entry => entry.recordId === record.recordId), `${record.kind} does not count`)
      assert.equal(membership.agentNames.some(agent => agent.machineId === box.machineId), false)
    }
  })
})
