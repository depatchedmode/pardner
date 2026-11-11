import { DatabaseSync } from 'node:sqlite'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { requireValue } from './workspace-schema.js'

export const SIGNATURE_CACHE_FILE = 'signatures.sqlite'
const HASH = /^[a-f0-9]{64}$/
const MACHINE_ID = /^machine-[a-z2-7]{26}$/

/**
 * Every change signature this replica has verified, its own included, for one project, the equivocation reports
 * it has made with the signatures that prove them, and the board changes whose operations it has read. Like the record store it only grows: there is no update or delete path, and triggers refuse both. So an entry deleted from the shared
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
        CREATE TABLE IF NOT EXISTS equivocations (key TEXT PRIMARY KEY, report TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS scanned (hash TEXT PRIMARY KEY, findings TEXT) WITHOUT ROWID;
        CREATE TRIGGER IF NOT EXISTS scanned_no_update BEFORE UPDATE ON scanned BEGIN SELECT RAISE(ABORT, 'Read changes only grow'); END;
        CREATE TRIGGER IF NOT EXISTS scanned_no_delete BEFORE DELETE ON scanned BEGIN SELECT RAISE(ABORT, 'Read changes only grow'); END;
        CREATE TRIGGER IF NOT EXISTS equivocations_no_update BEFORE UPDATE ON equivocations BEGIN SELECT RAISE(ABORT, 'Equivocation reports only grow'); END;
        CREATE TRIGGER IF NOT EXISTS equivocations_no_delete BEFORE DELETE ON equivocations BEGIN SELECT RAISE(ABORT, 'Equivocation reports only grow'); END;
        CREATE TABLE IF NOT EXISTS equivocation_proofs (key TEXT NOT NULL, hash TEXT NOT NULL, signature BLOB NOT NULL, PRIMARY KEY (key, hash)) WITHOUT ROWID;
        CREATE TRIGGER IF NOT EXISTS equivocation_proofs_no_update BEFORE UPDATE ON equivocation_proofs BEGIN SELECT RAISE(ABORT, 'Equivocation proofs only grow'); END;
        CREATE TRIGGER IF NOT EXISTS equivocation_proofs_no_delete BEFORE DELETE ON equivocation_proofs BEGIN SELECT RAISE(ABORT, 'Equivocation proofs only grow'); END;
      `)
      this.database.prepare('INSERT OR IGNORE INTO project (id, project_id) VALUES (1, ?)').run(projectId)
      requireValue(this.database.prepare('SELECT project_id FROM project WHERE id = 1').get().project_id === projectId,
        'This signature cache belongs to another project; preserve this directory and start a fresh one', 'WORKSPACE_MISMATCH')
      this.entries = new Map(this.database.prepare('SELECT hash, machine_id, signature FROM signatures').all()
        .map(row => [row.hash, { machineId: row.machine_id, signature: new Uint8Array(row.signature) }]))
      this.insert = this.database.prepare('INSERT OR IGNORE INTO signatures (hash, machine_id, signature) VALUES (?, ?, ?)')
      this.insertReport = this.database.prepare('INSERT OR IGNORE INTO equivocations (key, report) VALUES (?, ?)')
      this.reports = this.database.prepare('SELECT key, report FROM equivocations ORDER BY key LIMIT ?')
      this.insertProof = this.database.prepare('INSERT OR IGNORE INTO equivocation_proofs (key, hash, signature) VALUES (?, ?, ?)')
      this.proofs = this.database.prepare('SELECT hash, signature FROM equivocation_proofs WHERE key = ?')
      this.insertScanned = this.database.prepare('INSERT OR IGNORE INTO scanned (hash, findings) VALUES (?, ?)')
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

  /**
   * Equivocation reports (lib/attribution.js), kept so a report survives a restart even when the peer that carried
   * the conflicting change never returns. Only grows, and only the first `limit` are read.
   */
  equivocations(limit) {
    const reports = []
    for (const { key, report } of this.reports.all(limit)) {
      try { reports.push([key, JSON.parse(report)]) } catch { /* A row this version cannot read is left as it is. */ }
    }
    return reports
  }

  addEquivocation(key, report) {
    requireValue(typeof key === 'string' && key.length <= 200, 'Invalid equivocation report')
    this.insertReport.run(key, JSON.stringify(report))
  }

  /**
   * The verified signature of one of a report's two changes, kept with the report so its proof survives the entry
   * being deleted from the signature document and a restart. Each is checked again whenever it is read.
   */
  addEquivocationProof(key, hash, signature) {
    requireValue(typeof key === 'string' && key.length <= 200 && HASH.test(hash) && signature instanceof Uint8Array && signature.length === 64, 'Invalid equivocation proof')
    this.insertProof.run(key, hash, signature)
  }

  /** The signatures kept for report `key`, by change hash. */
  equivocationProofs(key) {
    return new Map(this.proofs.all(key).filter(row => HASH.test(row.hash)).map(row => [row.hash, new Uint8Array(row.signature)]))
  }

  /**
   * The board changes whose operations this replica has read (lib/attribution.js scanChange), with what each one
   * wrote that matters (null for an ordinary change), so a reopened replica reads only the changes it has not.
   */
  scannedChanges() {
    const rows = new Map()
    for (const { hash, findings } of this.database.prepare('SELECT hash, findings FROM scanned').iterate()) {
      if (!HASH.test(hash)) continue
      if (findings === null) { rows.set(hash, null); continue }
      try { rows.set(hash, JSON.parse(findings)) } catch { /* Read again: a row this version cannot read is left as it is. */ }
    }
    return rows
  }

  /** Saves `[hash, findings]` rows in one transaction; a change already held is kept as it was. */
  addScanned(rows) {
    if (!rows.length) return
    for (const [hash] of rows) requireValue(HASH.test(hash), 'Invalid read change')
    transaction(this.database, () => { for (const [hash, findings] of rows) this.insertScanned.run(hash, findings === null ? null : JSON.stringify(findings)) })
  }

  close() { if (this.database.isOpen) this.database.close() }
}
