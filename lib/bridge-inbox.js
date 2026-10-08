import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { canonical, requireValue } from './workspace-schema.js'

/** Harness receipt is durable before hub ack; dispatch intent is durable before RPC. */
export class BridgeInbox {
  constructor(path, identity) {
    this.database = new DatabaseSync(path)
    try {
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS identity (value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS claims (actor TEXT PRIMARY KEY, request TEXT NOT NULL, receipt TEXT);
        CREATE TABLE IF NOT EXISTS bridge_status (actor TEXT PRIMARY KEY, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS retirement (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inbox (
          id TEXT PRIMARY KEY, actor TEXT NOT NULL, mention TEXT NOT NULL, mapping TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'queued', prompt TEXT, turn_id TEXT, reason TEXT,
          received_at INTEGER NOT NULL, dispatched_at INTEGER, context_persisted_at INTEGER
        );
      `)
      const saved = this.database.prepare('SELECT value FROM identity').get()
      if (saved) requireValue(saved.value === canonical(identity), 'Bridge inbox belongs to another workspace or replica', 'WORKSPACE_MISMATCH')
      else this.database.prepare('INSERT INTO identity VALUES (?)').run(canonical(identity))
      if (!this.database.prepare('PRAGMA table_info(inbox)').all().some(column => column.name === 'context_persisted_at')) {
        this.database.exec('ALTER TABLE inbox ADD COLUMN context_persisted_at INTEGER')
      }
    } catch (error) { this.database.close(); throw error }
  }

  recover() {
    this.database.exec("UPDATE inbox SET state = 'uncertain', reason = 'Bridge stopped during dispatch; reconcile before retry' WHERE state = 'dispatching'")
  }

  claim(actor) {
    this.database.prepare('INSERT OR IGNORE INTO claims VALUES (?, ?, NULL)').run(actor, randomUUID())
    const row = this.database.prepare('SELECT * FROM claims WHERE actor = ?').get(actor)
    return { requestId: row.request, receipt: row.receipt ? JSON.parse(row.receipt) : null }
  }

  hasClaim(actor) { return Boolean(this.database.prepare('SELECT 1 FROM claims WHERE actor = ?').get(actor)) }
  clearClaim(actor) { this.database.prepare('DELETE FROM claims WHERE actor = ?').run(actor) }

  receive(actor, receipt, mapping) {
    const { mention } = receipt
    requireValue(mention.toActorId === actor && typeof mention.id === 'string', 'Delivery does not match the mapped Actor', 'ACTOR_MISMATCH')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('INSERT OR IGNORE INTO inbox (id, actor, mention, mapping, received_at) VALUES (?, ?, ?, ?, ?)')
        .run(mention.id, actor, canonical(mention), canonical(mapping), Date.now())
      const prior = this.database.prepare('SELECT mention FROM inbox WHERE id = ?').get(mention.id)
      requireValue(prior.mention === canonical(mention), 'Delivery ID was reused with different content', 'OPERATION_ID_REUSED')
      this.database.prepare('UPDATE claims SET receipt = ? WHERE actor = ?').run(JSON.stringify(receipt), actor)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  rows(actor) {
    return this.database.prepare('SELECT * FROM inbox WHERE (? IS NULL OR actor = ?) ORDER BY received_at, id').all(actor ?? null, actor ?? null)
      .map(row => ({ ...row, mention: JSON.parse(row.mention), mapping: JSON.parse(row.mapping) }))
  }

  status(actor, state) {
    this.database.prepare('INSERT INTO bridge_status VALUES (?, ?) ON CONFLICT(actor) DO UPDATE SET state = excluded.state WHERE state != excluded.state').run(actor, state)
  }
  statuses() { return this.database.prepare('SELECT actor, state FROM bridge_status ORDER BY actor').all() }

  retirement() {
    const row = this.database.prepare('SELECT value FROM retirement WHERE id = 1').get()
    return row ? JSON.parse(row.value) : null
  }
  saveRetirement(value) {
    this.database.prepare('INSERT INTO retirement VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value').run(JSON.stringify(value))
  }

  reason(id, reason) { this.database.prepare('UPDATE inbox SET reason = ? WHERE id = ? AND reason IS NOT ?').run(reason, id, reason) }
  begin(id, prompt) {
    const result = this.database.prepare("UPDATE inbox SET state = 'dispatching', prompt = ?, reason = NULL WHERE id = ? AND state = 'queued'").run(prompt, id)
    requireValue(result.changes === 1, 'Delivery is no longer queued', 'INVALID_BRIDGE_STATE')
    // Observe only after the prompt's FULL synchronous commit has returned.
    // Persist this observation separately before any harness RPC. Legacy rows
    // stay null; acceptance/reconciliation must never invent context timing.
    this.database.prepare('UPDATE inbox SET context_persisted_at = ? WHERE id = ?').run(Date.now(), id)
  }
  uncertain(id) {
    this.database.prepare("UPDATE inbox SET state = 'uncertain', reason = 'Dispatch response uncertain; reconcile before retry' WHERE id = ?").run(id)
  }
  accept(id, turnId) {
    requireValue(typeof turnId === 'string' && turnId.length > 0, 'A harness turn ID is required')
    this.database.prepare("UPDATE inbox SET state = 'accepted', turn_id = ?, reason = NULL, dispatched_at = ? WHERE id = ?").run(turnId, Date.now(), id)
  }
  resolve(id, decision, evidence, turnId) {
    requireValue(typeof evidence === 'string' && evidence.trim(), 'Supply reconciliation evidence')
    const row = this.rows().find(row => row.id === id)
    requireValue(row?.state === 'uncertain', 'Only uncertain dispatches can be reconciled', 'INVALID_BRIDGE_STATE')
    requireValue(['accepted', 'retry'].includes(decision), 'Use --decision accepted or retry')
    if (decision === 'accepted') this.accept(id, turnId)
    else this.database.prepare("UPDATE inbox SET state = 'queued' WHERE id = ?").run(id)
    this.reason(id, evidence)
  }
  close() { this.database.close() }
}
