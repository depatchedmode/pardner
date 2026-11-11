import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { acquireStorageLease } from './storage-lease.js'
import { MACHINE_KEY_FILE, generateMachineKey, loadMachineKey, saveMachineKey } from './machine-key.js'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { OperationError, requireValue } from './workspace-schema.js'
import { fingerprint, secret, setupAgent } from './client-identity.js'

/** Version 3: person IDs are derived from the machine key, and membership records carry each machine's consent. */
export const REGISTRY_VERSION = 3
const PRIOR_INSTALL = 'This client directory was made by an earlier Pardner version and is left unchanged; start Pardner with a fresh data directory (--data DIR)'

async function loadKey(directory, existing) {
  try { return await loadMachineKey(directory) } catch (error) {
    throw new OperationError('MACHINE_KEY_UNAVAILABLE', `This client directory's machine key (${MACHINE_KEY_FILE}) can't be used: ${error.message}. `
      + (existing ? 'Restore the file from a backup of this directory, owned by this account with mode 0600.'
        : 'The directory has no registry yet, so its first start was interrupted; start Pardner with a fresh data directory.')
      + ' Pardner never replaces the key of an existing directory.')
  }
}

/**
 * The version of an existing registry, read from a private temporary copy: opening the registry itself could
 * checkpoint its write-ahead log or rewrite its index, and a directory from an earlier version must stay
 * byte-identical when it is refused.
 */
async function registryVersion(directory, entries) {
  const copy = await mkdtemp(join(tmpdir(), 'pardner-registry-'))
  let database
  try {
    for (const name of ['client.sqlite', 'client.sqlite-wal']) if (entries.includes(name)) await copyFile(join(directory, name), join(copy, name))
    database = new DatabaseSync(join(copy, 'client.sqlite'))
    // A registry without its row is a first start interrupted before the row was written; open() writes it.
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registry'").all()
    const row = tables.length ? database.prepare('SELECT value FROM registry WHERE id=1').get() : null
    return row ? JSON.parse(row.value).version : REGISTRY_VERSION
  } finally {
    database?.close()
    await rm(copy, { recursive: true, force: true })
  }
}

export class ClientRegistry {
  static async open(directory, options = {}) {
    const lease = await acquireStorageLease(directory)
    let database
    try {
      const entries = await readdir(directory)
      const existing = entries.includes('client.sqlite')
      // A key without a registry is a first start interrupted after saving the key; it is still this directory's own.
      requireValue(existing || entries.every(name => name.startsWith('runtime-lock.sqlite') || name === 'client.log' || name === MACHINE_KEY_FILE),
        'Choose a fresh client directory; existing data is preserved', 'INCOMPATIBLE_SCHEMA')
      // Decided from the listing alone: opening an earlier install's registry could checkpoint its write-ahead log.
      requireValue(!existing || entries.includes(MACHINE_KEY_FILE),
        `This client directory has no machine key (${MACHINE_KEY_FILE}): it was made by an earlier Pardner version, or its key was removed. `
        + 'It is left unchanged. Start Pardner with a fresh data directory (--data DIR), or restore this directory from a backup that includes its key.',
        'INCOMPATIBLE_SCHEMA')
      requireValue(!existing || await registryVersion(directory, entries) === REGISTRY_VERSION, PRIOR_INSTALL, 'INCOMPATIBLE_SCHEMA')
      let machineKey
      if (entries.includes(MACHINE_KEY_FILE)) machineKey = await loadKey(directory, existing)
      else { machineKey = generateMachineKey(); await saveMachineKey(directory, machineKey) }
      const path = join(directory, 'client.sqlite')
      preparePrivateDatabase(path)
      database = new DatabaseSync(path)
      database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS registry (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
      const registry = new ClientRegistry(directory, database, lease)
      if (!database.prepare('SELECT value FROM registry WHERE id=1').get()) {
        database.prepare('INSERT INTO registry VALUES (1, ?)').run(JSON.stringify({ version: REGISTRY_VERSION, clientId: randomUUID(), identity: null,
          device: { id: randomUUID(), name: options.deviceName ?? hostname() }, machine: { machineId: machineKey.machineId, publicKey: machineKey.publicKey },
          setupAgent: setupAgent(options.setupAgent),
          operatorToken: secret(), sessions: {}, bootstraps: {}, projects: {}, attempts: {}, invites: {}, redemptions: {}, port: options.port ?? 0 }))
      }
      const state = registry.read()
      requireValue(state.version === REGISTRY_VERSION, PRIOR_INSTALL, 'INCOMPATIBLE_SCHEMA')
      requireValue(state.machine?.machineId === machineKey.machineId,
        `The machine key (${MACHINE_KEY_FILE}) belongs to another client directory; restore this directory's own key from its backup`, 'MACHINE_KEY_MISMATCH')
      registry.machineKey = machineKey
      return registry
    } catch (error) { database?.close(); lease.close(); throw error }
  }
  constructor(directory, database, lease) { Object.assign(this, { directory, database, lease }); this.jobs = new Map() }
  read() { return JSON.parse(this.database.prepare('SELECT value FROM registry WHERE id=1').get().value) }
  update(change) {
    return transaction(this.database, () => {
      const state = this.read()
      const result = change(state)
      this.database.prepare('UPDATE registry SET value=? WHERE id=1').run(JSON.stringify(state))
      return result
    })
  }
  async attempt(scope, operationId, input, run) {
    requireValue(typeof operationId === 'string' && /^[\w-]{1,128}$/.test(operationId), 'Supply a stable operationId')
    const key = fingerprint([scope, operationId]), digest = fingerprint(input)
    const attempt = this.update(state => {
      const prior = state.attempts[key]
      requireValue(!prior || prior.fingerprint === digest, 'Operation ID belongs to different input', 'OPERATION_ID_REUSED')
      return state.attempts[key] ??= { id: randomUUID(), fingerprint: digest, input, phase: 'intent', proof: secret() }
    })
    if (attempt.result !== undefined) return attempt.result
    if (this.jobs.has(key)) return this.jobs.get(key)
    const promise = (async () => {
      const result = await run(attempt, patch => this.update(state => Object.assign(state.attempts[key], patch)))
      this.update(state => Object.assign(state.attempts[key], { phase: 'complete', result }))
      return result
    })()
    this.jobs.set(key, promise)
    try { return await promise } finally { this.jobs.delete(key) }
  }
  close() { this.database.close(); this.lease.close() }
}
