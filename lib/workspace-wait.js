import { diff, getChangesMetaSince, getHeads, hasHeads, view } from '@automerge/automerge'
import { sameHeads } from './heads.js'
import { identifier, object, OperationError, ownValue, requireValue, resolveActor, storedRecord, taskState } from './workspace-schema.js'
import { decodeBoardVersion, encodeBoardVersion, validateWaitTimeout } from './board-version.js'

// Comments and mentions have stable metadata keys. Deleting a comment or removing a mention edits other maps.
// Report new keys only, so a replay or a merge that picks a different copy of the same record does not wake a wait.
function addedRecords(workspace, doc, before, after, kind) {
  const map = `${kind}s`
  const keys = new Set(diff(doc, before, after)
    .filter(patch => patch.action === 'put' && patch.path.length === 2 && patch.path[0] === map)
    .map(patch => patch.path[1]))
  if (!keys.size) return []
  const previous = view(doc, before)[map]
  const { view: current } = workspace.readable(view(doc, after))
  const records = []
  for (const key of keys) {
    if (ownValue(previous, key) !== undefined) continue
    try {
      const record = storedRecord(current, kind, map, key)
      if (record.id === key) records.push(record)
    } catch (error) {
      if (!['NOT_FOUND', 'UNREADABLE'].includes(error.code)) throw error
    }
  }
  return records
}

/** One subscription for the project, shared by every open wait. */
export class WorkspaceWaits {
  constructor(store) {
    this.store = store
    this.waiters = new Set()
    this.onPersist = ({ documentId }) => {
      if (documentId !== store.docHandle.documentId || !this.waiters.size) return
      // Reading and responding must not run on the repository's persistence path.
      this.scheduled ??= setImmediate(() => {
        this.scheduled = null
        for (const waiter of this.waiters) waiter.check()
      })
    }
    store.repo.on('document-persisted', this.onPersist)
  }

  close() {
    this.stopError = new OperationError('SERVICE_STOPPING', 'The local Pardner service stopped while waiting')
    this.store.repo.off('document-persisted', this.onPersist)
    clearImmediate(this.scheduled)
    for (const waiter of this.waiters) waiter.finish(this.stopError)
  }

  wait(input, signal) {
    signal.throwIfAborted()
    if (this.stopError) throw this.stopError
    object(input, 'Wait request')
    const timeout = validateWaitTimeout(input.timeoutMs)
    const { workspace, repo, manifest: { workspaceId } } = this.store
    const { handle } = workspace
    const savedHeads = () => repo.persistedHeads.get(handle.documentId)
    const doc = handle.doc()
    let scanned = input.after === undefined ? savedHeads() : decodeBoardVersion(input.after, workspaceId)
    requireValue(hasHeads(doc, scanned), 'This replica does not have that board version. Use the same replica or wait for it to sync.', 'UNKNOWN_BOARD_VERSION')
    const { view: board } = workspace.readable(doc)
    const taskId = input.taskId === undefined ? null : identifier(input.taskId, 'Task ID')
    const kind = taskId ? 'comment' : 'mention'
    let matches, toEvent
    if (taskId) {
      taskState(board, taskId)
      matches = comment => comment.taskId === taskId
      toEvent = ({ id, taskId, actorId, created_at: timestamp }) => ({ type: 'comment', comment: { id, taskId, actorId, timestamp } })
    } else {
      requireValue(input.actorId, 'Supply --actor or PARDNER_ACTOR to wait for mentions', 'ACTOR_REQUIRED')
      const actorId = resolveActor(board, input.actorId).id
      matches = mention => mention.toActorId === actorId
      toEvent = mention => ({ type: 'mention', mention })
    }

    return new Promise((resolve, reject) => {
      let timer
      const abort = () => finish(signal.reason)
      const finish = (error, result) => {
        this.waiters.delete(waiter)
        signal.removeEventListener('abort', abort)
        clearTimeout(timer)
        if (error) reject(error)
        else resolve({ ...result, boardVersion: encodeBoardVersion({ workspaceId, heads: scanned }) })
      }
      // An ordinary read can observe in-memory heads before the disk save finishes. Catch up once those heads are saved.
      let versionSaved = input.after === undefined
      const check = (expired = false) => {
        try {
          const after = savedHeads()
          const current = handle.doc()
          if (!versionSaved) {
            const unsaved = sameHeads(getHeads(current), after) ? [] : getChangesMetaSince(current, after)
            versionSaved = scanned.every(head => !unsaved.some(change => change.hash === head))
          }
          if (versionSaved && !sameHeads(scanned, after)) {
            const events = addedRecords(workspace, current, scanned, after, kind).filter(matches).map(toEvent)
            scanned = after
            if (events.length) return finish(null, { reason: 'matched', events })
          }
          if (expired) finish(null, { reason: 'timeout', events: [] })
        } catch (error) { finish(error) }
      }
      const waiter = { check, finish }
      this.waiters.add(waiter)
      signal.addEventListener('abort', abort, { once: true })
      if (timeout !== undefined) timer = setTimeout(() => check(true), timeout)
      check()
    })
  }
}
