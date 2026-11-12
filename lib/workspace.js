import { getBackend, getChangesMetaSince, getHeads, getObjectId, hasHeads, isImmutableString } from '@automerge/automerge'
import { prepareOperation } from './workspace-commands.js'
import {
  SCHEMA_VERSION, OperationError, activeMentions, commentDeleted, commentView, dictionary, goalContext, identifier, issueLinkIndex, operationEvents, ownValue, plain,
  recordState, requireValue, taskContext, taskState, veinContext, veinLinkIndex, veinSummary,
} from './workspace-schema.js'

export { createWorkspaceData, OperationError } from './workspace-schema.js'

/** The board's top-level maps (lib/workspace-schema.js createWorkspaceData): each is read only when it holds one map. */
export const BOARD_MAPS = Object.freeze(['membership', 'actors', 'tasks', 'taskFields', 'branchBases', 'mergedBranches', 'comments', 'commentBodies', 'deletedComments',
  'goals', 'goalFields', 'veins', 'veinFields', 'veinLinks', 'supersededRevisions', 'mentions', 'operations', 'operationRequests', 'readReceipts'])
/** Each collection the board shows, and the top-level maps it is read from: none is shown while one of them cannot be read. */
const COLLECTIONS = { tasks: ['tasks', 'taskFields'], goals: ['goals', 'goalFields'], veins: ['veins', 'veinFields'], comments: ['comments', 'commentBodies'] }
const EMPTY = Object.freeze(Object.create(null))
const isMapValue = value => value !== null && typeof value === 'object' && !Array.isArray(value) && typeof getObjectId(value) === 'string'
/** Text as the board stores it: a string, or an immutable string (lib/workspace-values.js). */
const isText = value => typeof value === 'string' || isImmutableString(value)
const kindOf = value => (value === null || value === undefined ? 'missing' : isText(value) ? `text (“${String(value).slice(0, 60)}”)` : Array.isArray(value) ? 'a list'
  : typeof value === 'object' ? (isMapValue(value) ? 'a map' : 'a value that is not a map') : `a ${typeof value} (${String(value).slice(0, 60)})`)

/**
 * The scalar the board's creation (a change with no dependencies) wrote at top-level key `key`, as Automerge reads it
 * as of that change: what no later change can rewrite. Undefined when no creation wrote a scalar there.
 */
export function createdValue(doc, key) {
  const backend = getBackend(doc)
  for (const meta of getChangesMetaSince(doc, [])) {
    if (meta.deps.length) continue
    for (const [type, value] of backend.getAll('_root', key, [meta.hash])) if (['str', 'int', 'uint', 'f64'].includes(type)) return value
  }
  return undefined
}

export class Workspace {
  /**
   * `signatures` is the board's signature document, or null for the standalone service, which signs nothing.
   * `change` makes a local change on the board; a runtime with a machine key passes its signing write path, and
   * `confirm`, which throws unless every signature this machine made is saved in its signature cache. `workspaceId`
   * is the project this replica's own metadata names: the board is called by it, whatever a change wrote there.
   */
  constructor({ repo, handle, signatures = null, replicaId, workspaceId = null, clock = () => new Date().toISOString(), change = fn => handle.change(fn), confirm = () => {} }) {
    this.repo = repo
    this.handle = handle
    this.signatures = signatures
    this.change = change
    this.confirm = confirm
    this.replicaId = identifier(replicaId, 'Replica ID')
    this.workspaceId = workspaceId
    this.clock = clock
    this.queue = Promise.resolve()
    // The schema is the one the board's creation wrote: a later change rewriting it is listed (readable()), never a
    // reason to stop opening the board.
    const doc = handle.doc()
    requireValue(doc.schemaVersion === SCHEMA_VERSION || createdValue(doc, 'schemaVersion') === SCHEMA_VERSION,
      'This workspace uses an incompatible schema. Preserve its data and enroll a new Pardner workspace.', 'INCOMPATIBLE_SCHEMA')
  }

  execute(request) {
    const input = plain(request)
    const result = this.queue.then(() => this.apply(input))
    this.queue = result.catch(() => {})
    return result
  }

  async apply(request) {
    const doc = this.handle.doc()
    // A write that fails on a top-level map holding a value of the wrong kind is refused as such, never as an internal error.
    const refuse = error => {
      const { unreadable } = this.readable(doc)
      if (error instanceof OperationError || !unreadable.length) return error
      return new OperationError('UNREADABLE', `This change can’t be made while part of the board can’t be read: ${unreadable.map(item => item.reason).join('; ')}`,
        { unreadable, reason: String(error?.message ?? error).slice(0, 200) })
    }
    let prepared
    try { prepared = prepareOperation(doc, request, { replicaId: this.replicaId, timestamp: this.clock() }) } catch (error) { throw refuse(error) }
    if (!prepared.replayed) { try { this.change(prepared.change) } catch (error) { throw refuse(error) } }
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

  /**
   * The board as every read sees it: each top-level map that holds one map, and an empty one in place of any that does
   * not; the schema version and the project this replica's metadata names; and, in `unreadable`, each top-level key
   * whose value is not what the board holds there, with why (one written concurrently with another is listed too: only
   * Automerge's pick of them is read). One change rewriting a top-level key never stops a read.
   */
  readable(doc = this.handle.doc()) {
    const unreadable = []
    const view = Object.create(null)
    const backend = getBackend(doc)
    const several = key => {
      const count = backend.getAll('_root', key).length
      if (count > 1) unreadable.push({ kind: 'root', id: key, reason: `the board’s ${key} holds ${count} values written concurrently; only one of them is read` })
    }
    for (const key of BOARD_MAPS) {
      const value = doc[key]
      if (isMapValue(value)) { view[key] = value; several(key) } else {
        view[key] = EMPTY
        unreadable.push({ kind: 'root', id: key, reason: `the board’s ${key} is ${kindOf(value)}, not a map` })
      }
    }
    const scalar = (key, valid, what) => {
      const value = doc[key]
      if (valid(value)) { several(key); return true }
      unreadable.push({ kind: 'root', id: key, reason: `the board’s ${key} is ${kindOf(value)}, not ${what}` })
      return false
    }
    const text = isText
    scalar('schemaVersion', value => value === SCHEMA_VERSION, `schema version ${SCHEMA_VERSION}`)
    view.schemaVersion = SCHEMA_VERSION
    const named = scalar('workspaceId', value => text(value) && (!this.workspaceId || plain(value) === this.workspaceId), this.workspaceId ? 'this project’s ID' : 'a project ID')
    view.workspaceId = this.workspaceId ?? (named ? plain(doc.workspaceId) : null)
    view.name = scalar('name', text, 'text') ? plain(doc.name) : null
    view.created_at = scalar('created_at', text, 'a time') ? plain(doc.created_at) : null
    return { view, unreadable }
  }

  /**
   * One record's context, read from the readable board. A read that fails on what the board holds is refused with
   * what cannot be read (`UNREADABLE`), never as an internal error; a record that is not there is NOT_FOUND, unless
   * the map it would be in cannot be read.
   */
  context(read, ...args) {
    const doc = this.handle.doc()
    const { view, unreadable } = this.readable(doc)
    let context
    try { context = read(view, ...args) } catch (error) {
      if (error instanceof OperationError && (error.code !== 'NOT_FOUND' || !unreadable.length)) throw error
      const reason = String(error?.message ?? error).slice(0, 200)
      throw new OperationError('UNREADABLE', unreadable.length ? `This record can’t be read: ${unreadable.map(item => item.reason).join('; ')}`
        : `This record’s stored data can’t be read: ${reason}`, { unreadable, reason })
    }
    return { ...context, workspaceId: view.workspaceId, heads: getHeads(doc), ...(unreadable.length ? { unreadable } : {}) }
  }

  taskContext(taskId, actorId = null) { return this.context(taskContext, taskId, actorId) }
  veinContext(veinId) { return this.context(veinContext, veinId) }
  goalContext(goalId) { return this.context(goalContext, goalId) }

  /**
   * The board as it is now. Each top-level key, then each task, goal, vein, comment and index, is read on its own: one
   * whose stored data cannot be read (any member can write any well-formed data) is listed in `unreadable` with why,
   * and every other is shown. A collection whose top-level maps cannot be read is shown empty.
   */
  snapshot() {
    const raw = this.handle.doc()
    const { view: doc, unreadable } = this.readable(raw)
    const missing = new Set(unreadable.filter(item => item.kind === 'root' && !isMapValue(raw[item.id]) && BOARD_MAPS.includes(item.id)).map(item => item.id))
    const ids = name => (COLLECTIONS[name].some(map => missing.has(map)) ? [] : Object.keys(doc[name]))
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
    // Links name tasks: while the tasks cannot be read, no vein lists any.
    const noLinks = () => ({ byTask: dictionary(), byVein: dictionary() })
    const links = COLLECTIONS.tasks.some(map => missing.has(map)) ? noLinks() : attempt('index', 'veinLinks', () => veinLinkIndex(doc), noLinks())
    const issues = attempt('index', 'issueLinks', () => issueLinkIndex(doc), dictionary())
    const tasks = each('task', ids('tasks'), id => {
      const { task, revisions, conflicts } = taskState(doc, id)
      return { ...task, veinIds: ownValue(links.byTask, id) ?? [], issues: ownValue(issues, id) ?? [], revisions, conflicts }
    })
    const snapshot = {
      schemaVersion: doc.schemaVersion, workspaceId: doc.workspaceId, name: doc.name,
      actors: attempt('index', 'actors', () => plain(doc.actors), {}), tasks,
      goals: each('goal', ids('goals'), id => {
        const { record, revisions, conflicts } = recordState(doc, 'goal', id)
        return { ...record, revisions, conflicts }
      }),
      veins: each('vein', ids('veins'), id => veinSummary(doc, id, links)),
      comments: each('comment', ids('comments').filter(id => !attempt('comment', id, () => commentDeleted(doc, id), true)), id => commentView(doc, id)),
      mentions: attempt('index', 'mentions', () => Object.fromEntries(activeMentions(doc).map(mention => [mention.id, mention])), {}),
      operations: attempt('index', 'operations', () => Object.fromEntries(operationEvents(doc).map(event => [event.operationId, plain(event)])), {}),
      readReceipts: attempt('index', 'readReceipts', () => plain(doc.readReceipts), {}), heads: getHeads(raw),
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
