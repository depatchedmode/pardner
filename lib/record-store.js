import { DatabaseSync } from 'node:sqlite'
import { computeMembership, maySign, verifyRecord } from './membership.js'
import { preparePrivateDatabase } from './private-state.js'
import { transaction } from './sqlite-transaction.js'
import { canonical, requireValue } from './workspace-schema.js'

export const RECORD_STORE_FILE = 'records.sqlite'

/**
 * Why `record` may not be stored now, or null. The genesis needs only the
 * project ID. Any other record must verify under its signer's certified key
 * and be one that signer may make in the current membership: the library's
 * arrival-time policy, so a removed machine's new records are refused.
 */
function refusal(record, membership, projectId) {
  if (record?.kind === 'project.genesis') return verifyRecord(record, projectId).reason ?? null
  if (record?.projectId !== projectId) return 'Wrong project'
  const machine = membership.machines.find(candidate => candidate.id === record.signer)
  if (!machine) return 'Signer is not a member machine of this project'
  const { reason } = verifyRecord(record, projectId, machine.publicKey)
  if (reason) return reason
  return maySign(membership, record) ? null : 'Signer may not make this record in the current membership'
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
   * Saves each candidate that may be stored now and returns the others with a
   * reason. Accepting one record can authorize another in the same batch, so
   * candidates are retried until none is accepted. A refused record is not
   * stored; it is reconsidered whenever it is offered again.
   */
  admit(candidates) {
    const pending = new Map()
    for (const record of candidates) {
      const key = canonical(record)
      if (canonical(this.records.get(record?.recordId)) !== key) pending.set(key, record)
    }
    if (!pending.size) return { accepted: [], refused: [] }
    const accepted = [], refused = new Map()
    let membership = this.membership(), progress = true
    while (progress) {
      progress = false
      for (const [key, record] of [...pending].sort(([a], [b]) => a < b ? -1 : 1)) {
        const reason = refusal(record, membership, this.projectId)
        if (reason) { refused.set(key, { record, reason }); continue }
        pending.delete(key)
        refused.delete(key)
        accepted.push(record)
        membership = computeMembership([...this.all(), ...accepted], { projectId: this.projectId })
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
