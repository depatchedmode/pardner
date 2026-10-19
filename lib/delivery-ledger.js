import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { preparePrivateDatabase } from './private-state.js'
import { identifier, requireValue } from './workspace-schema.js'

/** Hub-local delivery leases are transactional; they must never merge as CRDT state. */
export class DeliveryLedger {
  constructor(path, { clock = Date.now } = {}) {
    this.clock = clock
    preparePrivateDatabase(path)
    this.database = new DatabaseSync(path)
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, payload TEXT NOT NULL,
        created_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        token TEXT UNIQUE, expires_at INTEGER, acknowledged_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS claims (
        request_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL,
        delivery_id TEXT, token TEXT, expires_at INTEGER
      );
    `)
  }

  transaction(operation) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  reconcile(mentions, activeIds) {
    const active = new Set(activeIds)
    this.transaction(() => {
      const insert = this.database.prepare('INSERT OR IGNORE INTO deliveries (id, actor_id, payload, created_at, state) VALUES (?, ?, ?, ?, ?)')
      const tombstone = this.database.prepare("UPDATE deliveries SET state = 'tombstoned', token = NULL, expires_at = NULL WHERE id = ? AND state != 'acknowledged'")
      for (const mention of mentions) {
        insert.run(mention.id, mention.toActorId, JSON.stringify(mention), mention.timestamp, active.has(mention.id) ? 'pending' : 'tombstoned')
        if (!active.has(mention.id)) tombstone.run(mention.id)
      }
    })
  }

  claim(actorId, requestId, ttlMs = 30000) {
    identifier(requestId, 'Claim request ID')
    requireValue(Number.isInteger(ttlMs) && ttlMs >= 100 && ttlMs <= 300000, 'Claim lifetime must be between 100 and 300000 milliseconds')
    return this.transaction(() => {
      const prior = this.database.prepare('SELECT * FROM claims WHERE request_id = ?').get(requestId)
      if (prior) {
        requireValue(prior.actor_id === actorId, 'This claim request belongs to another Actor', 'OPERATION_ID_REUSED')
        if (!prior.delivery_id) return { claimed: false, replayed: true }
        const delivery = this.database.prepare('SELECT * FROM deliveries WHERE id = ?').get(prior.delivery_id)
        requireValue(delivery.state === 'claimed' && delivery.token === prior.token && delivery.expires_at > this.clock(),
          'This delivery claim is no longer active', 'STALE_CLAIM')
        return this.claimResult(delivery, true)
      }
      const now = this.clock()
      const delivery = this.database.prepare(`SELECT * FROM deliveries WHERE actor_id = ?
        AND (state = 'pending' OR (state = 'claimed' AND expires_at <= ?)) ORDER BY created_at, id LIMIT 1`).get(actorId, now)
      if (!delivery) {
        this.database.prepare('INSERT INTO claims (request_id, actor_id) VALUES (?, ?)').run(requestId, actorId)
        return { claimed: false, replayed: false }
      }
      delivery.token = randomUUID()
      delivery.expires_at = now + ttlMs
      this.database.prepare("UPDATE deliveries SET state = 'claimed', token = ?, expires_at = ? WHERE id = ?")
        .run(delivery.token, delivery.expires_at, delivery.id)
      this.database.prepare('INSERT INTO claims (request_id, actor_id, delivery_id, token, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(requestId, actorId, delivery.id, delivery.token, delivery.expires_at)
      return this.claimResult(delivery, false)
    })
  }

  claimResult(delivery, replayed) {
    return { claimed: true, replayed, mention: JSON.parse(delivery.payload),
      claimToken: delivery.token, claimExpiresAt: delivery.expires_at }
  }

  acknowledge(actorId, deliveryId, token) {
    identifier(deliveryId, 'Delivery ID')
    identifier(token, 'Claim token')
    return this.transaction(() => {
      const delivery = this.database.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
      requireValue(delivery && delivery.actor_id === actorId && delivery.token === token,
        'The delivery claim does not match', 'STALE_CLAIM')
      if (delivery.state === 'acknowledged') return { acknowledged: true, replayed: true }
      requireValue(delivery.state === 'claimed' && delivery.expires_at > this.clock(), 'The delivery claim has expired', 'STALE_CLAIM')
      this.database.prepare("UPDATE deliveries SET state = 'acknowledged', acknowledged_at = ? WHERE id = ?").run(this.clock(), deliveryId)
      return { acknowledged: true, replayed: false }
    })
  }

  release(actorId, deliveryId, token) {
    identifier(deliveryId, 'Delivery ID')
    identifier(token, 'Claim token')
    return this.transaction(() => {
      const delivery = this.database.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
      requireValue(delivery && delivery.actor_id === actorId && delivery.token === token,
        'The delivery claim does not match', 'STALE_CLAIM')
      if (delivery.state === 'pending') return { released: true, replayed: true }
      requireValue(delivery.state === 'claimed' && delivery.expires_at > this.clock(), 'The delivery claim has expired', 'STALE_CLAIM')
      this.database.prepare("UPDATE deliveries SET state = 'pending', expires_at = NULL WHERE id = ?").run(deliveryId)
      return { released: true, replayed: false }
    })
  }

  pending(actorId = null) {
    return this.database.prepare("SELECT * FROM deliveries WHERE (state = 'pending' OR (state = 'claimed' AND expires_at <= ?)) AND (? IS NULL OR actor_id = ?) ORDER BY created_at, id")
      .all(this.clock(), actorId, actorId).map(row => ({ ...JSON.parse(row.payload), deliveryState: 'pending' }))
  }

  close() { this.database.close() }
}
