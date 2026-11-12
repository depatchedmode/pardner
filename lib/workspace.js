import { getHeads, hasHeads } from '@automerge/automerge'
import { prepareOperation } from './workspace-commands.js'
import {
  SCHEMA_VERSION, OperationError, activeMentions, commentDeleted, commentView, goalContext, identifier, issueLinkIndex, operationEvents, plain,
  recordState, requireValue, taskContext, taskState, veinContext, veinLinkIndex, veinSummary,
} from './workspace-schema.js'

export { createWorkspaceData, OperationError } from './workspace-schema.js'

export class Workspace {
  /**
   * `signatures` is the board's signature document, or null for the standalone service, which signs nothing.
   * `change` makes a local change on the board; a runtime with a machine key passes its signing write path, and
   * `confirm`, which throws unless every signature this machine made is saved in its signature cache.
   */
  constructor({ repo, handle, signatures = null, replicaId, clock = () => new Date().toISOString(), change = fn => handle.change(fn), confirm = () => {} }) {
    this.repo = repo
    this.handle = handle
    this.signatures = signatures
    this.change = change
    this.confirm = confirm
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
    if (!prepared.replayed) this.change(prepared.change)
    try {
      await this.repo.flush([this.handle.documentId])
      // The change's signature is as durable as the change: saved in the signature cache before the write is acknowledged.
      this.confirm()
    } catch (error) {
      throw new OperationError('STORAGE_FAILED', 'Local persistence was not confirmed. Retry with the same operation ID.',
        { operationId: request.operationId, cause: error.message })
    }
    const { event } = prepared
    return {
      operationId: event.operationId, requestId: event.requestId, actorId: event.actorId, replicaId: event.replicaId,
      result: plain(event.result), replayed: prepared.replayed, savedLocally: true,
      heads: [...this.repo.persistedHeads.get(this.handle.documentId)],
    }
  }

  context(read, ...args) {
    const doc = this.handle.doc()
    return { ...read(doc, ...args), workspaceId: plain(doc.workspaceId), heads: getHeads(doc) }
  }

  taskContext(taskId, actorId = null) { return this.context(taskContext, taskId, actorId) }
  veinContext(veinId) { return this.context(veinContext, veinId) }
  goalContext(goalId) { return this.context(goalContext, goalId) }

  /**
   * The board as it is now. Each task, goal, vein, comment and index is read on its own: one whose stored data cannot
   * be read (any member can write any well-formed data) is listed in `unreadable` with why, and every other is shown.
   */
  snapshot() {
    const doc = this.handle.doc()
    const unreadable = []
    const attempt = (kind, id, read, fallback = undefined) => {
      try { return read() } catch (error) {
        unreadable.push({ kind, id, reason: String(error?.message ?? error).slice(0, 200) })
        return fallback
      }
    }
    const each = (kind, ids, read) => Object.fromEntries(ids.flatMap(id => {
      const value = attempt(kind, id, () => read(id))
      return value === undefined ? [] : [[id, value]]
    }))
    const links = attempt('index', 'veinLinks', () => veinLinkIndex(doc), { byTask: {}, byVein: {} })
    const issues = attempt('index', 'issueLinks', () => issueLinkIndex(doc), {})
    const tasks = each('task', Object.keys(doc.tasks), id => {
      const { task, revisions, conflicts } = taskState(doc, id)
      return { ...task, veinIds: links.byTask[id] ?? [], issues: issues[id] ?? [], revisions, conflicts }
    })
    const snapshot = {
      schemaVersion: doc.schemaVersion, workspaceId: plain(doc.workspaceId), name: plain(doc.name),
      actors: attempt('index', 'actors', () => plain(doc.actors), {}), tasks,
      goals: each('goal', Object.keys(doc.goals), id => {
        const { record, revisions, conflicts } = recordState(doc, 'goal', id)
        return { ...record, revisions, conflicts }
      }),
      veins: each('vein', Object.keys(doc.veins), id => veinSummary(doc, id, links)),
      comments: each('comment', Object.keys(doc.comments).filter(id => !attempt('comment', id, () => commentDeleted(doc, id), true)), id => commentView(doc, id)),
      mentions: attempt('index', 'mentions', () => Object.fromEntries(activeMentions(doc).map(mention => [mention.id, mention])), {}),
      operations: attempt('index', 'operations', () => Object.fromEntries(operationEvents(doc).map(event => [event.operationId, plain(event)])), {}),
      readReceipts: attempt('index', 'readReceipts', () => plain(doc.readReceipts), {}), heads: getHeads(doc),
    }
    return { ...snapshot, unreadable }
  }

  /** The board and its signature document: what a hub acknowledgement covers. */
  documents() { return [this.handle.documentId, ...(this.signatures ? [this.signatures.documentId] : [])] }

  /**
   * The hub's persistence acknowledgement, for the heads of the board and of its signature document: both must be
   * held here, and both are flushed before the answer, so an acknowledged change's signature is as durable here.
   */
  async acknowledge(heads, signatureHeads = null) {
    if (!hasHeads(this.handle.doc(), heads)) return { acknowledged: false }
    if (signatureHeads && !(this.signatures && hasHeads(this.signatures.doc(), signatureHeads))) return { acknowledged: false }
    await this.repo.flush(this.documents())
    return { acknowledged: true, acknowledgedHeads: heads, hubHeads: [...this.repo.persistedHeads.get(this.handle.documentId)],
      ...(signatureHeads ? { signatureHeads, hubSignatureHeads: [...this.repo.persistedHeads.get(this.signatures.documentId)] } : {}) }
  }
}
