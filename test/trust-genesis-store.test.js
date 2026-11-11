import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { getHeads } from '@automerge/automerge'
import { generateAutomergeUrl } from '@automerge/automerge-repo'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { buildRecord, genesisProjectId, verifyRecord } from '../lib/membership.js'
import { RECORD_STORE_FILE, RecordStore } from '../lib/record-store.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { plain } from '../lib/workspace-schema.js'
import { operatorClient as client, snapshot } from '../support/client-directory.js'
import { testGenesis } from '../support/genesis.js'
import { admitMembers, hubRuntime, projectFor, replicaRuntime } from '../support/machines.js'

const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]

async function eventually(check, message = 'Condition was not met within ten seconds') {
  const end = Date.now() + 10000
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > end) assert.fail(message)
    await delay(25)
  }
}

const memberAdd = (signer, projectId, person, machine, role = 'member') => buildRecord(signer, { projectId, kind: 'member.add', subject: person,
  displayName: person, role, machineId: machine.machineId, publicKey: machine.publicKey, offer: {}, joinRequest: {}, approval: {} })

test('project creation signs a genesis that verifies from the project ID alone and keeps its membership across restart', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-genesis-'))
  let local
  try {
    local = await client(directory)
    const first = await local.call('/session')
    await local.call('/identity', { name: 'Ada', email: 'ada@example.test', operationId: 'identity' })
    const { project } = await local.call('/projects', { name: 'Trust', operationId: 'create' })
    assert.match(project.id, /^[a-f0-9]{64}$/)
    assert.equal((await local.call('/projects', { name: 'Trust', operationId: 'create' })).project.id, project.id)
    const other = (await local.call('/projects', { name: 'Trust', operationId: 'create-again' })).project
    assert.notEqual(other.id, project.id, 'one person on one machine still gets a distinct project per creation')

    const { identity } = await local.call('/session')
    const { membership } = await local.call(`/projects/${project.id}`)
    assert.equal(membership.projectId, project.id)
    assert.deepEqual(membership.people.map(person => [person.id, person.role, person.displayName]), [[identity.id, 'owner', 'Ada']])
    assert.deepEqual(membership.machines.map(machine => [machine.id, machine.personId]), [[first.device.machineId, identity.id]])
    // The genesis, and the setup agent's label signed by the same machine.
    assert.equal(membership.storedRecords, 2)
    assert.deepEqual(membership.agentNames.map(agent => [agent.machineId, agent.harness]), [[first.device.machineId, 'openai-codex']])
    assert.deepEqual(membership.notStored, [])

    const key = local.service.project(project.id).key
    await local.service.stop()
    local = null

    const store = new RecordStore(join(directory, 'projects', key, RECORD_STORE_FILE), project.id)
    const genesis = store.genesis()
    store.close()
    assert.equal(genesisProjectId(genesis), project.id)
    assert.deepEqual(verifyRecord(genesis, project.id), { valid: true })
    assert.equal(genesis.signer, first.device.machineId)
    assert.equal(genesis.subject, identity.id)

    local = await client(directory)
    assert.deepEqual((await local.call(`/projects/${project.id}`)).membership.machines.map(machine => machine.id), [first.device.machineId])
  } finally {
    await local?.service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('a storage directory from an earlier schema is refused and left byte-identical', { timeout: 30000 }, async () => {
  const storage = await mkdtemp(join(tmpdir(), 'pardner-prior-storage-'))
  try {
    ;(await acquireStorageLease(storage)).close()
    await writeFile(join(storage, 'workspace.json'), JSON.stringify({ schemaVersion: 5, role: 'hub', replicaId: 'replica-old', workspaceId: randomUUID(), url: generateAutomergeUrl(), state: 'ready' }))
    await mkdir(join(storage, 'repo'))
    await writeFile(join(storage, 'repo', 'chunk'), 'prior document bytes')
    const before = await snapshot(storage)
    const runtime = new WorkspaceRuntime({ directory: storage })
    await assert.rejects(runtime.init(), { code: 'INCOMPATIBLE_SCHEMA', message: /left unchanged.*fresh data directory/s })
    assert.deepEqual(await snapshot(storage), before)
  } finally {
    await rm(storage, { recursive: true, force: true })
  }
})

test('the record store keeps valid records, refuses tampered and foreign ones, and writes back records removed from the document', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-records-'))
  const owner = generateMachineKey(), member = generateMachineKey()
  const genesis = testGenesis(owner), projectId = genesis.projectId
  const add = memberAdd(owner, projectId, 'member', member)
  const forged = { ...buildRecord(owner, { projectId, kind: 'agent.name', subject: 'agent-1', machineId: owner.machineId, displayName: 'Codex', harness: 'openai-codex' }), displayName: 'Forged' }
  const elsewhere = testGenesis(generateMachineKey())
  const foreign = buildRecord(owner, { projectId: elsewhere.projectId, kind: 'profile', subject: 'test-owner', displayName: 'Elsewhere', email: '' })
  const unsigned = buildRecord(generateMachineKey(), { projectId, kind: 'profile', subject: 'stranger', displayName: 'Stranger', email: '' })
  const records = () => plain(runtime.docHandle.doc().membership ?? {})
  const reasons = () => Object.fromEntries(runtime.membership().notStored.map(entry => [entry.recordId, entry.reason]))
  let runtime = new WorkspaceRuntime({ directory, genesis, actors })
  try {
    await runtime.init()
    assert.equal(runtime.manifest.workspaceId, projectId)
    runtime.docHandle.change(doc => { for (const record of [add, forged, elsewhere, foreign, unsigned]) doc.membership[record.recordId] = record })
    await eventually(() => runtime.membership().people.some(person => person.id === 'member'))
    assert.deepEqual(runtime.membership().machines.map(machine => machine.id).sort(), [owner.machineId, member.machineId].sort())
    assert.deepEqual(reasons(), { [forged.recordId]: 'Invalid signature', [elsewhere.recordId]: 'Wrong project',
      [foreign.recordId]: 'Wrong project', [unsigned.recordId]: 'Signer is not a machine certified in this project' })
    for (const record of [forged, elsewhere, foreign, unsigned]) assert.equal(runtime.records.get(record.recordId), undefined)
    assert.equal(runtime.membership().storedRecords, 2)

    // A member deletes a stored record, then the whole map: both return from the store.
    runtime.docHandle.change(doc => { delete doc.membership[add.recordId] })
    await eventually(() => records()[add.recordId])
    assert.deepEqual(records()[add.recordId], add)
    runtime.docHandle.change(doc => { delete doc.membership })
    await eventually(() => records()[genesis.recordId] && records()[add.recordId])
    assert.equal(runtime.membership().people.some(person => person.id === 'member'), true)
    // A written-back record reads back exactly, so the harvest settles instead of rewriting it.
    await delay(50)
    const heads = getHeads(runtime.docHandle.doc())
    await delay(150)
    assert.deepEqual(getHeads(runtime.docHandle.doc()), heads)

    // A removal that disappears from the document still holds, and is written back.
    const removal = buildRecord(owner, { projectId, kind: 'member.remove', subject: 'member' })
    runtime.docHandle.change(doc => { doc.membership[removal.recordId] = removal })
    await eventually(() => runtime.membership().removedPeople.includes('member'))
    runtime.docHandle.change(doc => { delete doc.membership[removal.recordId] })
    await eventually(() => records()[removal.recordId])
    assert.deepEqual(runtime.membership().removedPeople, ['member'])
    // Arrival-time policy: a removed machine's new records are refused, even if correctly signed.
    const late = memberAdd(member, projectId, 'late', generateMachineKey())
    runtime.docHandle.change(doc => { doc.membership[late.recordId] = late })
    await eventually(() => reasons()[late.recordId])
    assert.equal(reasons()[late.recordId], 'Signer was removed before this record arrived')

    await runtime.close()
    runtime = new WorkspaceRuntime({ directory, actors })
    await runtime.init()
    assert.deepEqual(runtime.membership().removedPeople, ['member'])
    assert.equal(runtime.membership().storedRecords, 3)
    assert.equal(reasons()[late.recordId], 'Signer was removed before this record arrived', 'refused records still in the document are reported again after a restart')
    assert.equal(reasons()[forged.recordId], undefined, 'the forged record left the document with the deleted map')
  } finally {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('a record saved to the store survives a process kill before it is used, and is written back on restart', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-record-kill-'))
  const owner = generateMachineKey()
  const genesis = testGenesis(owner)
  const record = memberAdd(owner, genesis.projectId, 'member', generateMachineKey())
  let runtime
  try {
    const child = fork(new URL('../support/record-store-process.js', import.meta.url), [JSON.stringify({ directory, genesis, record })],
      { execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    const [code, signal] = await once(child, 'exit')
    assert.equal(signal, 'SIGKILL', `the child exited with ${code} before the kill point`)

    const store = new RecordStore(join(directory, RECORD_STORE_FILE), genesis.projectId)
    assert.deepEqual(store.get(record.recordId), record)
    store.close()

    runtime = new WorkspaceRuntime({ directory, actors })
    await runtime.init()
    assert.deepEqual(plain(runtime.docHandle.doc().membership[record.recordId]), record)
    assert.equal(runtime.membership().people.some(person => person.id === 'member'), true)
  } finally {
    await runtime?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('an enrolled replica stores the genesis it synced and reopens offline with its membership', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-replica-records-'))
  const token = 'records-test-token'
  const project = projectFor(join(root, 'hub'), { members: 1 })
  const service = (directory, settings) => new AutomergeSyncServer({ env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {},
    store: settings ? replicaRuntime(directory, project, 0, { ...settings, actors, retryMs: 100 }) : hubRuntime(directory, { actors, retryMs: 100 }) })
  let hub = service(join(root, 'hub')), replica
  try {
    await hub.start()
    await admitMembers(hub.store, project)
    const settings = { hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` }
    replica = service(join(root, 'replica'), settings)
    await replica.start()
    // The replica holds the owner's machine and its own, certified by the genesis and the owner's admission.
    const owner = hub.store.membership().machines
    assert.deepEqual(owner.map(machine => machine.id).sort(), [project.owner.machineId, project.keys[0].machineId].sort())
    assert.deepEqual(replica.store.membership().machines, owner)
    assert.equal(replica.store.manifest.workspaceId, hub.store.manifest.workspaceId)
    await replica.stop()
    await hub.stop()
    hub = null

    const started = Date.now()
    replica = service(join(root, 'replica'), settings)
    await replica.start()
    assert.ok(Date.now() - started < 6000, 'the cached replica must open offline within six seconds')
    assert.deepEqual(replica.store.membership().machines, owner)
    const saved = await (await fetch(`http://127.0.0.1:${replica.httpPort}/automerge/operations`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Offline' } }) })).json()
    assert.equal(saved.savedLocally, true)
  } finally {
    await replica?.stop()
    await hub?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
