import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startClient } from '../lib/client-service.js'
import { MACHINE_KEY_FILE } from '../lib/machine-key.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { operatorClient, snapshot } from '../support/client-directory.js'

test('a client directory reports its machine ID, never its key, and keeps the same key across restarts', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-machine-key-'))
  let local
  try {
    local = await operatorClient(directory)
    const session = await local.call('/session')
    assert.match(session.device.machineId, /^machine-[a-z2-7]{26}$/)
    assert.equal(session.device.machineId, local.service.registry.machineKey.machineId)
    assert.doesNotMatch(JSON.stringify(session), /PRIVATE KEY|publicKey/)
    assert.equal((await stat(join(directory, MACHINE_KEY_FILE))).mode & 0o777, 0o600)
    const bytes = await readFile(join(directory, MACHINE_KEY_FILE))
    await local.service.stop()
    local = await operatorClient(directory)
    assert.equal((await local.call('/session')).device.machineId, session.device.machineId)
    assert.deepEqual(await readFile(join(directory, MACHINE_KEY_FILE)), bytes)
  } finally {
    await local?.service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('a missing, exposed or foreign machine key stops startup and is never replaced', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-key-'))
  const directory = join(root, 'client'), elsewhere = join(root, 'elsewhere'), path = join(directory, MACHINE_KEY_FILE)
  try {
    for (const target of [directory, elsewhere]) await (await operatorClient(target)).service.stop()
    const original = await readFile(path)

    await chmod(path, 0o644)
    await assert.rejects(startClient({ directory, port: 0 }), { code: 'MACHINE_KEY_UNAVAILABLE', message: /0600/ })
    assert.deepEqual(await readFile(path), original)
    await chmod(path, 0o600)

    await rename(path, join(root, 'kept.pem'))
    await copyFile(join(elsewhere, MACHINE_KEY_FILE), path)
    await chmod(path, 0o600)
    await assert.rejects(startClient({ directory, port: 0 }), { code: 'MACHINE_KEY_MISMATCH' })
    await rm(path)

    await assert.rejects(startClient({ directory, port: 0 }), { code: 'INCOMPATIBLE_SCHEMA', message: /no machine key.*fresh data directory/s })
    assert.equal((await readdir(directory)).includes(MACHINE_KEY_FILE), false, 'no replacement key is created')

    await rename(join(root, 'kept.pem'), path)
    const restored = await operatorClient(directory)
    assert.match((await restored.call('/session')).device.machineId, /^machine-/)
    await restored.service.stop()
    assert.deepEqual(await readFile(path), original)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('client directories from before machine keys are refused and left byte-identical', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-prior-client-'))
  try {
    // A version 1 client directory with a schema 5 project, as the previous release left it.
    const prior = async (name, unclean = false) => {
      const directory = join(root, name)
      ;(await acquireStorageLease(directory)).close()
      const registry = JSON.stringify({ version: 1, clientId: randomUUID(), identity: null, device: { id: randomUUID(), name: 'old laptop' }, projects: { old: { key: 'old', id: randomUUID() } } })
      const script = `import { DatabaseSync } from 'node:sqlite'
        const database = new DatabaseSync(${JSON.stringify(join(directory, 'client.sqlite'))})
        database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE registry (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
        database.prepare('INSERT INTO registry VALUES (1, ?)').run(${JSON.stringify(registry)})
        ${unclean ? "process.kill(process.pid, 'SIGKILL')" : 'database.close()'}`
      spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', script], { stdio: 'ignore' })
      await mkdir(join(directory, 'projects', 'old', 'repo'), { recursive: true })
      await writeFile(join(directory, 'projects', 'old', 'workspace.json'), JSON.stringify({ schemaVersion: 5, role: 'hub', workspaceId: randomUUID() }))
      await writeFile(join(directory, 'projects', 'old', 'repo', 'chunk'), 'prior document bytes')
      return directory
    }
    const directories = [await prior('clean'), await prior('unclean', true)]
    assert.ok((await readdir(directories[1])).includes('client.sqlite-wal'), 'the unclean registry keeps its write-ahead log')
    for (const directory of directories) {
      const before = await snapshot(directory)
      await assert.rejects(startClient({ directory, port: 0 }), { code: 'INCOMPATIBLE_SCHEMA', message: /left unchanged.*fresh data directory/s })
      assert.deepEqual(await snapshot(directory), before)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
