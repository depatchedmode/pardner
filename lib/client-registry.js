import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { hostname } from 'node:os'
import { acquireStorageLease } from './storage-lease.js'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { requireValue } from './workspace-schema.js'
import { fingerprint, secret, setupAgent } from './client-identity.js'

export class ClientRegistry {
  static async open(directory, options = {}) {
    const lease = await acquireStorageLease(directory)
    let database
    try {
      const entries = await readdir(directory)
      requireValue(entries.includes('client.sqlite') || entries.every(name => name.startsWith('runtime-lock.sqlite') || name === 'client.log'),
        'Choose a fresh client directory; existing data is preserved', 'INCOMPATIBLE_SCHEMA')
      const path = join(directory, 'client.sqlite')
      preparePrivateDatabase(path)
      database = new DatabaseSync(path)
      database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS registry (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
      const registry = new ClientRegistry(directory, database, lease)
      if (!database.prepare('SELECT value FROM registry WHERE id=1').get()) {
        database.prepare('INSERT INTO registry VALUES (1, ?)').run(JSON.stringify({ version: 1, clientId: randomUUID(), identity: null,
          device: { id: randomUUID(), name: options.deviceName ?? hostname() }, setupAgent: setupAgent(options.setupAgent),
          operatorToken: secret(), sessions: {}, bootstraps: {}, projects: {}, attempts: {}, invites: {}, redemptions: {}, port: options.port ?? 0,
          companion: { enabled: false, interfaceName: null, port: null }, pairings: {}, companions: {} }))
      }
      requireValue(registry.read().version === 1, 'Incompatible client registry; preserve this directory', 'INCOMPATIBLE_SCHEMA')
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
