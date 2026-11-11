import fs from 'node:fs/promises'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WebSocket } from 'ws'
import { initiateHandshake, signCheckpoint, newRun } from '../lib/machine-handshake.js'
import { machineKeyPem } from '../lib/machine-key.js'
import { admitMembers, hubRuntime, replicaRuntime, testProject } from '../support/machines.js'

// A stale hub backup (docs/PARDNER-TRUST-DESIGN.md, "Backup, restore and loss"): a hub restored from a backup, or
// one that learns it is behind, waits before serving. The waiting state is saved with a fixed comparison point and
// the newest checkpoint seen, survives any number of restarts and a process kill at any step, and is cleared only by
// a catch-up from a member holding a later checkpoint or by the operator.

const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]
const token = 'restore-test-token'

async function eventually(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    assert.ok(Date.now() < deadline, message)
    await delay(25)
  }
}

/** Opens the hub runtime on `directory`, reads its status, and closes it again: one restart. */
async function restart(project, directory, then = async () => {}) {
  const runtime = hubRuntime(directory, { project, actors })
  await runtime.init()
  try { return { status: runtime.hubStatus(), result: await then(runtime) } } finally { await runtime.close() }
}

/**
 * A hub that ran, was backed up while stopped, then ran once more without any new record, so a member holds a
 * checkpoint from a later start than the backup. `restored()` copies the backup to a new directory, as a restore
 * from a cold backup does. That member's checkpoint is ahead of the backup only by its start, not its records.
 */
async function backedUp(root) {
  const project = testProject({ members: 2 })
  const live = join(root, 'live'), backup = join(root, 'backup')
  let runtime = hubRuntime(live, { project, actors })
  await runtime.init()
  await admitMembers(runtime, project)
  const atBackup = runtime.checkpoint()
  await runtime.close()
  await cp(live, backup, { recursive: true })
  runtime = hubRuntime(live, { project, actors })
  await runtime.init()
  const later = runtime.checkpoint(), records = runtime.records.all()
  await runtime.close()
  assert.equal(later.records, atBackup.records, 'the later checkpoint is ahead only by its start')
  let copies = 0
  const restored = async () => {
    const directory = join(root, `restored-${++copies}`)
    await cp(backup, directory, { recursive: true })
    return directory
  }
  return { project, live, atBackup, later, records, restored }
}

it('a restored hub keeps waiting across restarts, and a member with a later checkpoint can still vouch for it after any number of them', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  try {
    const { project, later, atBackup, records, restored } = await backedUp(root)
    const directory = await restored()
    for (let start = 1; start <= 4; start++) {
      const { status } = await restart(project, directory)
      assert.equal(status.waiting, true, `start ${start} after the restore`)
      assert.equal(status.reason, 'restored')
    }
    // A checkpoint the backup itself reached shows nothing newer.
    assert.equal((await restart(project, directory, runtime => runtime.noteCheckpoint(atBackup))).result, false)
    // The member that saw the later start vouches, the hub takes in its records and resumes.
    const { result } = await restart(project, directory, async runtime => {
      const vouches = await runtime.noteCheckpoint(later)
      runtime.admitRecords(records)
      if (vouches) await runtime.resumeHub({ machineId: project.keys[0].machineId })
      return { vouches, status: runtime.hubStatus() }
    })
    assert.equal(result.vouches, true, 'restarts did not move the point the member’s checkpoint is compared with')
    assert.equal(result.status.waiting, false)
    const { status } = await restart(project, directory)
    assert.equal(status.waiting, false, 'resuming is saved')
    assert.ok(status.starts > later.starts, 'its new checkpoints are ahead of every one seen')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('a hub with data whose state file is missing waits, rather than starting as if fresh', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  try {
    const { project, live, atBackup } = await backedUp(root)
    await rm(join(live, 'hub-state.json'))
    for (let start = 1; start <= 2; start++) {
      const { status } = await restart(project, live)
      assert.equal(status.waiting, true, `start ${start} without a state file`)
      assert.equal(status.reason, 'state-missing')
    }
    // An old checkpoint cannot establish freshness without a known comparison point.
    const { result } = await restart(project, live, async runtime => {
      const vouches = await runtime.noteCheckpoint(atBackup)
      await runtime.resumeHub({ machineId: project.keys[0].machineId })
      return vouches
    })
    assert.equal(result, false)
    assert.equal((await restart(project, live)).status.waiting, false)
    // A brand-new hub has no state file either, and does not wait.
    const fresh = hubRuntime(join(root, 'fresh'), { project: testProject(), actors })
    await fresh.init()
    try { assert.equal(fresh.hubStatus().waiting, false) } finally { await fresh.close() }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('a hub that learns from a member’s checkpoint that it is behind keeps waiting across restarts until it catches up', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  try {
    const { project, live, later, records } = await backedUp(root)
    // Roll the hub's own state back in place, as a filesystem snapshot would, without changing its files' identity.
    const statePath = join(live, 'hub-state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    await writeFile(statePath, JSON.stringify({ ...state, starts: state.starts - 1 }))
    const { status, result } = await restart(project, live, runtime => runtime.noteCheckpoint(later))
    assert.equal(status.waiting, false, 'nothing on disk shows the rollback')
    assert.equal(result, true)
    for (let start = 1; start <= 3; start++) {
      const reopened = await restart(project, live)
      assert.equal(reopened.status.waiting, true, `start ${start} after learning it is behind`)
      assert.equal(reopened.status.reason, 'behind')
    }
    const caughtUp = await restart(project, live, async runtime => {
      const vouches = await runtime.noteCheckpoint(later)
      runtime.admitRecords(records)
      await runtime.resumeHub({ machineId: project.keys[0].machineId })
      return vouches
    })
    assert.equal(caughtUp.result, true)
    assert.equal((await restart(project, live)).status.waiting, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('a process kill at any step of the waiting sequence leaves the hub waiting, or resumed only once that is saved', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  try {
    const { project, later, records, restored } = await backedUp(root)
    const by = { machineId: project.keys[0].machineId }
    const steps = { 'start-before-save': true, 'start-after-save': true, 'note-before-save': true, 'note-after-save': true,
      'catch-up-before-resume': true, 'resume-before-save': true, 'resume-after-save': false }
    for (const [killAt, waits] of Object.entries(steps)) {
      const directory = await restored()
      const child = fork(new URL('../support/hub-state-process.js', import.meta.url), [],
        { execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
      child.send({ directory, pem: machineKeyPem(project.owner), genesis: project.genesis, killAt, checkpoint: later, records, by })
      const [code, signal] = await once(child, 'exit')
      assert.equal(signal, 'SIGKILL', `${killAt}: the child exited with ${code} before its kill point`)
      for (let start = 1; start <= 2; start++) {
        const { status } = await restart(project, directory)
        assert.equal(status.waiting, waits, `${killAt}, start ${start}`)
        if (waits) assert.equal(status.reason, 'restored', killAt)
      }
      if (!waits) continue
      // The member can still vouch, and the hub resumes.
      const { result } = await restart(project, directory, async runtime => {
        const vouches = await runtime.noteCheckpoint(later)
        runtime.admitRecords(records)
        await runtime.resumeHub(by)
        return vouches
      })
      assert.equal(result, true, `${killAt}: the member can still vouch`)
      assert.equal((await restart(project, directory)).status.waiting, false, killAt)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('a restored hub restarted before any member connects is still caught up by the first member that saw a later state', { timeout: 90000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  const servers = [], replicas = []
  try {
    const project = testProject({ members: 2 })
    const hubDirectory = join(root, 'hub')
    const serve = async (ports = {}) => {
      const server = new AutomergeSyncServer({ store: hubRuntime(hubDirectory, { actors, project, retryMs: 100 }), env: {}, apiToken: token,
        httpPort: 0, wsPort: 0, logger: {}, ...ports })
      servers.push(server)
      await server.start()
      await admitMembers(server.store, project)
      return server
    }
    const replica = async (server, index) => {
      const runtime = replicaRuntime(join(root, `member-${index}`), project, index, { hub: server, actors, retryMs: 100 })
      replicas.push(runtime)
      await runtime.init()
      return runtime
    }
    let server = await serve()
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    let member = await replica(server, 0)
    await eventually(() => !member.status().syncPending && member.manifest.hubCheckpoint, 'the member never kept a checkpoint')
    await member.close()
    await server.stop()
    await cp(hubDirectory, join(root, 'backup'), { recursive: true })
    // The hub runs on and the member syncs with it again, so the member's checkpoint is newer than the backup.
    server = await serve(ports)
    member = await replica(server, 0)
    const before = member.manifest.hubCheckpoint
    await eventually(() => member.manifest.hubCheckpoint?.starts > before.starts, 'the member never saw the later start')
    await member.close()
    await server.stop()
    await rm(hubDirectory, { recursive: true, force: true })
    await cp(join(root, 'backup'), hubDirectory, { recursive: true })
    // Restarted three times while nobody connects.
    for (let start = 1; start <= 3; start++) {
      server = await serve(ports)
      assert.equal(server.store.hubStatus().waiting, true, `start ${start}`)
      await server.stop()
    }
    server = await serve(ports)
    member = await replica(server, 0)
    await eventually(() => member.status().hubConnected, 'the member was never served')
    assert.equal(server.store.hubStatus().waiting, false)
    assert.deepEqual(server.store.hubStatus().resumedBy, { machineId: project.keys[0].machineId })
  } finally {
    await Promise.allSettled(replicas.map(runtime => runtime.close()))
    await Promise.allSettled(servers.map(server => server.stop()))
    await rm(root, { recursive: true, force: true })
  }
})

it('a missing-state hub requires a later record count and verified growth before a member can resume it', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  let server
  try {
    const { project, live, atBackup, records } = await backedUp(root)
    await rm(join(live, 'hub-state.json'))
    server = new AutomergeSyncServer({ store: hubRuntime(live, { project, actors }), env: {}, apiToken: token,
      httpPort: 0, wsPort: 0, logger: {} })
    await server.start()
    const route = `ws://127.0.0.1:${server.wsPort}/automerge`
    const connect = async (checkpoint, offered) => {
      const socket = new WebSocket(route)
      try {
        await once(socket, 'open')
        return await initiateHandshake(socket, { key: project.keys[0], projectId: project.projectId, route,
          role: 'replica', expectRole: 'hub', checkpoint, knownRecords: () => records, ownRecords: () => offered })
      } finally { socket.terminate() }
    }
    await assert.rejects(connect(atBackup, records), { code: 'HUB_WAITING' })
    assert.equal(server.store.hubStatus().waiting, true)
    const removal = project.remove(project.keys[1])
    const later = signCheckpoint(project.owner, { projectId: project.projectId, starts: atBackup.starts + 10,
      run: newRun(), records: records.length + 1 })
    await assert.rejects(connect(later, [...records, { ...removal, signature: 'invalid' }]), { code: 'HUB_WAITING' })
    assert.equal(server.store.hubStatus().waiting, true, 'a signed count alone is insufficient')
    await connect(later, [...records, removal])
    assert.equal(server.store.hubStatus().waiting, false)
    assert.ok(server.store.membership().removedMachines.includes(project.keys[1].machineId))
  } finally {
    await server?.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('resume keeps serving blocked until its saved state succeeds and serializes concurrent attempts', { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-restore-'))
  let runtime, release
  try {
    const { project, restored } = await backedUp(root)
    runtime = hubRuntime(await restored(), { project, actors })
    await runtime.init()
    const rename = fs.rename
    let writes = 0
    const entered = Promise.withResolvers(), gate = Promise.withResolvers()
    const retryEntered = Promise.withResolvers(), retryGate = Promise.withResolvers()
    release = () => { gate.resolve(); retryGate.resolve() }
    t.mock.method(fs, 'rename', async (from, to) => {
      if (to === join(runtime.directory, 'hub-state.json')) {
        writes++
        if (writes === 1) {
          entered.resolve()
          await gate.promise
          throw Object.assign(new Error('test write failure'), { code: 'EIO' })
        }
        retryEntered.resolve()
        await retryGate.promise
      }
      return rename(from, to)
    })
    const first = runtime.resumeHub('operator').catch(error => error)
    await entered.promise
    const second = runtime.resumeHub('operator')
    try {
      assert.equal(runtime.hubStatus().waiting, true, 'pending writes must not enable serving')
      assert.equal(writes, 1, 'the second resume has not started a write')
    } finally { gate.resolve() }
    assert.equal((await first).code, 'EIO')
    await retryEntered.promise
    assert.equal(runtime.hubStatus().waiting, true, 'a failed write leaves serving blocked during the retry')
    retryGate.resolve()
    await second
    assert.equal(writes, 2, 'a failed resume must not make the next attempt skip persistence')
    assert.equal(runtime.hubStatus().waiting, false)
    assert.equal(JSON.parse(await readFile(join(runtime.directory, 'hub-state.json'), 'utf8')).waiting, null)
  } finally {
    release?.()
    await runtime?.close()
    t.mock.restoreAll()
    await rm(root, { recursive: true, force: true })
  }
})
