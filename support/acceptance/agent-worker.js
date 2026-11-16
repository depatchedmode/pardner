import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { cli } from '../cli-resources.js'

// A standalone worker names its service directory and Actor; a client worker holds a client agent-grant credential
// file and runs `pardner --token-file`, whose Actor is the one the credential is bound to.
const { directory, serviceDirectory, tokenFile, actorId } = JSON.parse(process.argv[2])
await mkdir(directory, { recursive: true })
const database = new DatabaseSync(join(directory, 'inbox.sqlite'))
database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS inbox (key TEXT PRIMARY KEY, mention TEXT NOT NULL, claim_token TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS effects (key TEXT PRIMARY KEY, operation_id TEXT UNIQUE NOT NULL, receipt TEXT NOT NULL);
`)
const send = message => process.send(message)
async function command(args) {
  const output = tokenFile ? await cli(directory, [...args, '--token-file', tokenFile]) : await cli(serviceDirectory, [...args, '--actor', actorId])
  if (output.code !== 0) throw Object.assign(new Error(output.result.error.message), output.result.error)
  return output.result
}
async function run({ requestId, pauseAt }) {
  let row = database.prepare('SELECT * FROM inbox WHERE complete = 0 ORDER BY key LIMIT 1').get()
  if (!row) {
    const claim = await command(['mentions', 'claim-next', '--request-id', requestId || randomUUID()])
    if (!claim.claimed) return { idle: true }
    const key = claim.mention.idempotency_key
    database.prepare(`INSERT INTO inbox (key, mention, claim_token) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET claim_token=excluded.claim_token, acknowledged=0`).run(key, JSON.stringify(claim.mention), claim.claimToken)
    row = database.prepare('SELECT * FROM inbox WHERE key = ?').get(key)
  }
  const mention = JSON.parse(row.mention)
  send({ checkpoint: 'received', actorId, key: row.key, mention })
  if (pauseAt === 'received') return { paused: true }
  if (!row.acknowledged) {
    await command(['mentions', 'ack', mention.id, '--claim-token', row.claim_token])
    database.prepare('UPDATE inbox SET acknowledged = 1 WHERE key = ?').run(row.key)
  }
  send({ checkpoint: 'acknowledged', actorId, key: row.key })
  if (pauseAt === 'acknowledged') return { paused: true }
  const assigned = await command(['tasks', '--assignee', actorId])
  const context = await command(['show', mention.taskId])
  send({ checkpoint: 'context-read', actorId, key: row.key, assignedTaskIds: assigned.tasks.map(task => task.id),
    taskId: context.task.id, descriptionLength: context.task.description.length, commentCount: context.comments.length,
    historyCount: context.history.length, revisions: context.revisions })
  const operationId = `agent-effect-${createHash('sha256').update(`${actorId}:${row.key}`).digest('hex').slice(0, 32)}`
  const text = `${actorId} recorded accepted work for delivery ${row.key}.`
  const request = { operationId, actorId, type: 'comment.add', payload: { taskId: mention.taskId, text } }
  send({ intent: request })
  const receipt = await command(['operation', '--request', JSON.stringify(request)])
  send({ checkpoint: 'effect-saved', actorId, key: row.key, receipt })
  if (pauseAt === 'effect-saved') return { paused: true }
  database.exec('BEGIN IMMEDIATE')
  try {
    database.prepare('INSERT OR IGNORE INTO effects (key, operation_id, receipt) VALUES (?, ?, ?)').run(row.key, operationId, JSON.stringify(receipt))
    database.prepare('UPDATE inbox SET complete = 1 WHERE key = ?').run(row.key)
    database.exec('COMMIT')
  } catch (error) { database.exec('ROLLBACK'); throw error }
  return { complete: true, key: row.key, operationId }
}
let queue = Promise.resolve()
process.on('message', message => {
  queue = queue.then(async () => {
    try { send({ requestId: message.requestId, result: await run(message) }) }
    catch (error) { send({ requestId: message.requestId, error: { code: error.code, message: error.message } }) }
  })
})
process.on('disconnect', () => { database.close() })
send({ ready: true, actorId })
