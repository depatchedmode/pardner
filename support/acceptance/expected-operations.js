import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const canonical = value => JSON.stringify(sort(value))
function sort(value) {
  if (Array.isArray(value)) return value.map(sort)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
  return value
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex')

/** Intents are recorded before execution; successful receipts never define expected effects. */
export class ExpectedOperations {
  constructor({ localAckMs = 2000 } = {}) {
    assert.ok(Number.isSafeInteger(localAckMs) && localAckMs > 0, 'Local acknowledgment budget must be a positive integer in milliseconds')
    this.localAckMs = localAckMs
    this.intents = new Map(); this.receipts = new Map(); this.sources = new Map()
  }
  intend(request, replicaId) {
    const prior = this.intents.get(request.operationId)
    if (prior) assert.equal(canonical(prior), canonical(request), 'Reused expected operation ID')
    this.intents.set(request.operationId, structuredClone(request))
    if (replicaId && !this.sources.has(request.operationId)) this.sources.set(request.operationId, replicaId)
  }
  acknowledge(request, receipt, elapsedMs) {
    this.intend(request)
    assert.equal(receipt.savedLocally, true)
    if (this.sources.has(request.operationId)) assert.equal(receipt.replicaId, this.sources.get(request.operationId), 'Receipt came from the wrong replica identity')
    assert.ok(elapsedMs <= this.localAckMs, `Local acknowledgement took ${elapsedMs}ms (budget ${this.localAckMs}ms)`)
    this.receipts.set(request.operationId, { receipt, elapsedMs })
  }
  verify(snapshot) {
    const tasks = new Map()
    const readReceipts = new Map()
    for (const [id, intent] of this.intents) {
      if (!this.receipts.has(id)) continue
      if (intent.type === 'task.create') {
        const taskId = `task-${createHash('sha256').update(id).digest('hex').slice(0, 24)}`
        tasks.set(taskId, { description: '', status: 'backlog', assignee: null, priority: 'p2', tags: [], ...intent.payload })
      }
      if (intent.type === 'task.update') Object.assign(tasks.get(intent.payload.taskId), intent.payload.updates)
      if (intent.type === 'task.handoff') Object.assign(tasks.get(intent.payload.taskId), { assignee: intent.payload.to, status: intent.payload.status })
      if (intent.type === 'task.resolve') tasks.get(intent.payload.taskId)[intent.payload.field] = intent.payload.value
    }
    assert.equal(Object.keys(snapshot.tasks).length, tasks.size, 'Created task cardinality differs from the manifest')
    for (const [taskId, fields] of tasks) {
      assert.ok(snapshot.tasks[taskId], `Expected task missing: ${taskId}`)
      for (const [field, value] of Object.entries(fields)) assert.equal(canonical(snapshot.tasks[taskId][field]), canonical(value), `${taskId}.${field} effect is incorrect`)
    }
    for (const [id, { receipt }] of this.receipts) {
      const intent = this.intents.get(id)
      const event = snapshot.operations[id]
      assert.ok(event, `Acknowledged operation missing: ${id}`)
      assert.equal(event.operationId, id)
      assert.equal(event.actorId, intent.actorId)
      assert.equal(event.type, intent.type)
      assert.equal(canonical(event.payload), canonical(intent.payload))
      assert.equal(event.replicaId, receipt.replicaId)
      if (intent.type === 'comment.add') {
        const matching = Object.values(snapshot.comments).filter(comment => comment.revisionId === id)
        assert.equal(matching.length, 1, `Comment ${id} must appear exactly once`)
        assert.equal(matching[0].content, intent.payload.text)
        assert.equal(matching[0].taskId, intent.payload.taskId)
        assert.equal(matching[0].actorId, intent.actorId)
      }
      if (intent.type === 'task.create') {
        assert.ok(snapshot.tasks[receipt.result.taskId], `Created task missing: ${id}`)
        assert.equal(snapshot.tasks[receipt.result.taskId].created_by, intent.actorId)
      }
      if (intent.type === 'read.mark') {
        for (const observed of intent.payload.comments) {
          const key = createHash('sha256').update(JSON.stringify([intent.actorId, observed.commentId, observed.revisionId])).digest('hex')
          readReceipts.set(key, { actorId: intent.actorId, ...observed })
        }
      }
      if (intent.type === 'task.handoff') {
        const comment = Object.values(snapshot.comments).find(comment => comment.revisionId === id)
        assert.equal(comment?.content, intent.payload.message)
        assert.equal(comment?.actorId, intent.actorId)
        assert.equal(Object.values(snapshot.comments).filter(comment => comment.revisionId === id).length, 1)
        assert.equal(Object.values(snapshot.mentions).filter(mention => mention.commentId === receipt.result.commentId && mention.toActorId === intent.payload.to).length, 1)
      }
    }
    assert.equal(canonical(snapshot.readReceipts), canonical(Object.fromEntries(readReceipts)), 'Read receipts must equal the union of observed revisions for their Actors')
    assert.equal(Object.keys(snapshot.operations).length, this.receipts.size, 'Unexpected or unacknowledged operation exists')
    return { operationCount: this.receipts.size, snapshotHash: hash(snapshot) }
  }
  report() { return { intents: [...this.intents.values()], expectedReplicas: Object.fromEntries(this.sources), receipts: Object.fromEntries(this.receipts) } }
}
