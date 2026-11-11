import { DatabaseSync } from 'node:sqlite'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { requireValue } from './workspace-schema.js'

export const SIGNATURE_CACHE_FILE = 'signatures.sqlite'
const HASH = /^[a-f0-9]{64}$/
const MACHINE_ID = /^machine-[a-z2-7]{26}$/

/**
 * Every change signature this replica has verified, its own included, for one project. Like the record store it
 * only grows: there is no update or delete path, and triggers refuse both. So an entry deleted from the shared
 * signature document does not unattribute a change here, and a writer can put its own entries back.
 *
 * Entries are not re-verified when the file is opened: it is private to this client directory, as the record
 * store is. Each add() is one transaction. The database uses WAL with synchronous=NORMAL: a commit reaches the
 * operating system before add() returns, so it survives a crash of this process, but only a checkpoint is synced
 * to disk. A power loss may drop the newest entries; a dropped entry from another machine is verified again from
 * the signature document, and a dropped entry of this machine's own leaves that change unattributed, never
 * misattributed. Tests establish process-crash durability, not power-loss durability.
 */
export class SignatureCache {
  constructor(path, projectId) {
    preparePrivateDatabase(path)
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK (id = 1), project_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS signatures (hash TEXT PRIMARY KEY, machine_id TEXT NOT NULL, signature BLOB NOT NULL) WITHOUT ROWID;
        CREATE TRIGGER IF NOT EXISTS project_no_update BEFORE UPDATE ON project BEGIN SELECT RAISE(ABORT, 'The signature cache belongs to one project'); END;
        CREATE TRIGGER IF NOT EXISTS project_no_delete BEFORE DELETE ON project BEGIN SELECT RAISE(ABORT, 'The signature cache belongs to one project'); END;
        CREATE TRIGGER IF NOT EXISTS signatures_no_update BEFORE UPDATE ON signatures BEGIN SELECT RAISE(ABORT, 'Verified signatures only grow'); END;
        CREATE TRIGGER IF NOT EXISTS signatures_no_delete BEFORE DELETE ON signatures BEGIN SELECT RAISE(ABORT, 'Verified signatures only grow'); END;
      `)
      this.database.prepare('INSERT OR IGNORE INTO project (id, project_id) VALUES (1, ?)').run(projectId)
      requireValue(this.database.prepare('SELECT project_id FROM project WHERE id = 1').get().project_id === projectId,
        'This signature cache belongs to another project; preserve this directory and start a fresh one', 'WORKSPACE_MISMATCH')
      this.entries = new Map(this.database.prepare('SELECT hash, machine_id, signature FROM signatures').all()
        .map(row => [row.hash, { machineId: row.machine_id, signature: new Uint8Array(row.signature) }]))
      this.insert = this.database.prepare('INSERT OR IGNORE INTO signatures (hash, machine_id, signature) VALUES (?, ?, ?)')
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  get size() { return this.entries.size }
  get(hash) { return this.entries.get(hash) }
  has(hash) { return this.entries.has(hash) }
  *[Symbol.iterator]() { yield* this.entries }

  /** Saves verified `{ hash, machineId, signature }` entries in one transaction; an entry already held is kept as it was. */
  add(entries) {
    const fresh = [...new Map(entries.filter(entry => !this.entries.has(entry.hash)).map(entry => [entry.hash, entry])).values()]
    if (!fresh.length) return 0
    for (const { hash, machineId, signature } of fresh) {
      requireValue(HASH.test(hash) && MACHINE_ID.test(machineId) && signature instanceof Uint8Array && signature.length === 64, 'Invalid signature cache entry')
    }
    transaction(this.database, () => { for (const { hash, machineId, signature } of fresh) this.insert.run(hash, machineId, signature) })
    for (const { hash, machineId, signature } of fresh) this.entries.set(hash, { machineId, signature: new Uint8Array(signature) })
    return fresh.length
  }

  close() { if (this.database.isOpen) this.database.close() }
}
