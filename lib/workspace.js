import { getHeads, hasHeads } from '@automerge/automerge'
import { prepareOperation } from './workspace-commands.js'
import {
  SCHEMA_VERSION, OperationError, activeMentions, commentDeleted, commentView, goalContext, identifier, plain,
  recordState, requireValue, taskContext, taskState, veinContext, veinLinkIndex, veinSummary,
} from './workspace-schema.js'

export { createWorkspaceData, OperationError } from './workspace-schema.js'

export class Workspace {
  constructor({ repo, handle, replicaId, clock = () => new Date().toISOString() }) {
    this.repo = repo
    this.handle = handle
    this.replicaId = identifier(replicaId, 'Replica ID')
    this.clock = clock
    this.queue = Promise.resolve()
    requireValue(handle.doc().schemaVersion === SCHEMA_VERSION,
      'This workspace uses an incompatible schema. Preserve its data and enroll a new Pardner workspace.', 'INCOMPATIBLE_SCHEMA')
  }

  execute(request) {
    const input = plain(request)
    const result = this.queue.then(() => this.apply(input))
    this.queue = result.catch(() => {})
    return result
  }

  async apply(request) {
    const prepared = prepareOperation(this.handle.doc(), request, { replicaId: this.replicaId, timestamp: this.clock() })
    if (!prepared.replayed) this.handle.change(prepared.change)
    try {
      await this.repo.flush([this.handle.documentId])
    } catch (error) {
      throw new OperationError('STORAGE_FAILED', 'Local persistence was not confirmed. Retry with the same operation ID.',
        { operationId: request.operationId, cause: error.message })
    }
    const { event } = prepared
    return {
      operationId: event.operationId, actorId: event.actorId, replicaId: event.replicaId,
      result: plain(event.result), replayed: prepared.replayed, savedLocally: true,
      heads: [...this.repo.persistedHeads.get(this.handle.documentId)],
    }
  }

  context(read, ...args) {
    const doc = this.handle.doc()
    return { ...read(doc, ...args), workspaceId: doc.workspaceId, heads: getHeads(doc) }
  }

  taskContext(taskId, actorId = null) { return this.context(taskContext, taskId, actorId) }
  veinContext(veinId) { return this.context(veinContext, veinId) }
  goalContext(goalId) { return this.context(goalContext, goalId) }

  snapshot() {
    const doc = this.handle.doc()
    const links = veinLinkIndex(doc)
    const tasks = Object.fromEntries(Object.keys(doc.tasks).map(id => {
      const { task, revisions, conflicts } = taskState(doc, id)
      return [id, { ...task, veinIds: links.byTask[id] ?? [], revisions, conflicts }]
    }))
    return {
      schemaVersion: doc.schemaVersion, workspaceId: doc.workspaceId, name: doc.name,
      actors: plain(doc.actors), tasks,
      goals: Object.fromEntries(Object.keys(doc.goals).map(id => {
        const { record, revisions, conflicts } = recordState(doc, 'goal', id)
        return [id, { ...record, revisions, conflicts }]
      })),
      veins: Object.fromEntries(Object.keys(doc.veins).map(id => [id, veinSummary(doc, id, links, taskId => tasks[taskId].status)])),
      comments: Object.fromEntries(Object.keys(doc.comments).filter(id => !commentDeleted(doc, id)).map(id => [id, commentView(doc, id)])),
      mentions: Object.fromEntries(activeMentions(doc).map(mention => [mention.id, mention])),
      operations: plain(doc.operations), readReceipts: plain(doc.readReceipts), heads: getHeads(doc),
    }
  }

  async acknowledge(heads) {
    if (!hasHeads(this.handle.doc(), heads)) return { acknowledged: false }
    await this.repo.flush([this.handle.documentId])
    return { acknowledged: true, acknowledgedHeads: heads, hubHeads: [...this.repo.persistedHeads.get(this.handle.documentId)] }
  }
}
