import { DatabaseSync } from 'node:sqlite'
import { computeMembership, verifyRecord } from './membership.js'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { canonical, requireValue } from './workspace-schema.js'

export const RECORD_STORE_FILE = 'records.sqlite'

/** Adds the machine key an accepted record certifies. */
function certify(keys, record) {
  if (['project.genesis', 'member.add'].includes(record.kind)) keys.set(record.machineId, record.publicKey)
  if (record.kind === 'machine.add') keys.set(record.subject, record.publicKey)
}

/**
 * Why `record` may not be stored, or null. The genesis needs only the project
 * ID. Any other record must verify under a machine key that an accepted record
 * certifies, and its signer must not already be removed (enforced from arrival).
 * Authority is not checked here: computeMembership decides what a record grants.
 */
function refusal(record, keys, removed, projectId) {
  if (record?.kind === 'project.genesis') return verifyRecord(record, projectId).reason ?? null
  if (record?.projectId !== projectId) return 'Wrong project'
  const key = keys.get(record.signer)
  if (!key) return 'Signer is not a machine certified in this project'
  if (removed.has(record.signer)) return 'Signer was removed before this record arrived'
  return verifyRecord(record, projectId, key).reason ?? null
}

/**
 * Every membership record this replica has accepted for one project. The store
 * only grows: there is no update or delete path, and triggers refuse both. A
 * record is committed with synchronous=FULL before admit() returns, so callers
 * act on a record only after it is saved. Tests establish process-crash
 * durability, not power-loss durability.
 */
export class RecordStore {
  constructor(path, projectId) {
    preparePrivateDatabase(path)
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS records (record_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, record TEXT NOT NULL);
        CREATE TRIGGER IF NOT EXISTS records_no_update BEFORE UPDATE ON records BEGIN SELECT RAISE(ABORT, 'Membership records only grow'); END;
        CREATE TRIGGER IF NOT EXISTS records_no_delete BEFORE DELETE ON records BEGIN SELECT RAISE(ABORT, 'Membership records only grow'); END;
      `)
      const rows = this.database.prepare('SELECT record_id, project_id, record FROM records').all()
      requireValue(rows.every(row => row.project_id === projectId),
        'This record store belongs to another project; preserve this directory and start a fresh one', 'WORKSPACE_MISMATCH')
      this.projectId = projectId
      this.records = new Map(rows.map(row => [row.record_id, JSON.parse(row.record)]))
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  get size() { return this.records.size }
  get(recordId) { return this.records.get(recordId) }
  all() { return [...this.records.values()].sort((a, b) => a.recordId < b.recordId ? -1 : 1) }
  genesis() { return this.all().find(record => record.kind === 'project.genesis') ?? null }

  /** Read-only. The store only grows, so its membership changes only when its size does. */
  membership() {
    if (this.computed?.size !== this.records.size) this.computed = { size: this.records.size, membership: computeMembership(this.all(), { projectId: this.projectId }) }
    return this.computed.membership
  }

  /**
   * Saves each authentic candidate and returns the others with a reason. A
   * record accepted in this batch can certify the signer of another, so
   * candidates are retried until none is accepted; the result does not depend
   * on their order. Only removals already stored before the batch refuse a
   * signer, so a replica that receives a whole log at once keeps a removed
   * admin's earlier admissions. A refused record is not stored; it is
   * reconsidered whenever it is offered again.
   */
  admit(candidates) {
    const pending = new Map()
    for (const record of candidates) {
      const key = canonical(record)
      if (canonical(this.records.get(record?.recordId)) !== key) pending.set(key, record)
    }
    if (!pending.size) return { accepted: [], refused: [] }
    const keys = new Map(), removed = new Set(this.membership().removedMachines)
    for (const record of this.records.values()) certify(keys, record)
    const accepted = [], refused = new Map()
    let progress = true
    while (progress) {
      progress = false
      for (const [key, record] of pending) {
        const reason = refusal(record, keys, removed, this.projectId)
        if (reason) { refused.set(key, { record, reason }); continue }
        pending.delete(key)
        refused.delete(key)
        accepted.push(record)
        certify(keys, record)
        progress = true
      }
    }
    if (accepted.length) {
      transaction(this.database, () => {
        const insert = this.database.prepare('INSERT INTO records (record_id, project_id, record) VALUES (?, ?, ?)')
        for (const record of accepted) insert.run(record.recordId, this.projectId, canonical(record))
      })
      for (const record of accepted) this.records.set(record.recordId, record)
    }
    return { accepted, refused: [...refused.values()] }
  }

  close() { if (this.database.isOpen) this.database.close() }
}
