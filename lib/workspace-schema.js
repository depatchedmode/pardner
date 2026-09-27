import { createHash, randomUUID } from 'node:crypto'
import { getConflicts } from '@automerge/automerge'

export const SCHEMA_VERSION = 4
export const TASK_FIELDS = ['title', 'description', 'status', 'priority', 'assignee', 'tags', 'order', 'type']
export const STATUSES = ['backlog', 'up-next', 'in-progress', 'review', 'completed', 'dead-end', 'abandoned']
export const CLOSED_TASK_STATUSES = ['completed', 'dead-end', 'abandoned']
// A goal is the state a vein pursues; a vein is a line of work toward one goal.
export const GOAL_FIELDS = ['title', 'description', 'status']
export const GOAL_STATUSES = ['open', 'achieved', 'abandoned']
export const VEIN_FIELDS = ['title', 'description', 'status', 'goalId']
export const VEIN_STATUSES = ['open', 'proven', 'dead-end', 'abandoned']
export const RECORDS = {
  task: { collection: 'tasks', container: 'taskFields', fields: TASK_FIELDS, statuses: STATUSES, label: 'Task' },
  goal: { collection: 'goals', container: 'goalFields', fields: GOAL_FIELDS, statuses: GOAL_STATUSES, label: 'Goal' },
  vein: { collection: 'veins', container: 'veinFields', fields: VEIN_FIELDS, statuses: VEIN_STATUSES, label: 'Vein' },
}
export const plain = value => JSON.parse(JSON.stringify(value))
export const digest = value => createHash('sha256').update(value).digest('hex')
export const recordId = (prefix, operationId) => `${prefix}-${digest(operationId).slice(0, 24)}`
export const isRecordId = (prefix, value) => new RegExp(`^${prefix}-[a-f0-9]{24}$`).test(value)

export class OperationError extends Error {
  constructor(code, message, details = null) {
    super(message)
    this.name = 'OperationError'
    this.code = code
    this.details = details
  }
}

export function requireValue(condition, message, code = 'INVALID_ARGUMENT', details = null) {
  if (!condition) throw new OperationError(code, message, details)
}

export function identifier(value, name) {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
    && !Object.hasOwn(Object.prototype, value), `${name} must be a nonempty identifier`)
  return value
}

export function object(value, name) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`)
  return value
}

export function text(value, name, allowEmpty = false) {
  requireValue(typeof value === 'string' && (allowEmpty || value.trim().length > 0), `${name} must be text${allowEmpty ? '' : ' with content'}`)
  return value
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function actorRecord(input) {
  object(input, 'Actor')
  const id = identifier(input.id, 'Actor ID')
  const handle = text(input.handle, 'Actor handle').toLowerCase()
  requireValue(/^[a-z][a-z0-9_-]{0,63}$/.test(handle), 'Actor handles must start with a letter and contain letters, numbers, underscores, or hyphens')
  requireValue(['human', 'agent'].includes(input.kind), 'Actor kind must be human or agent')
  return { id, handle, kind: input.kind, displayName: input.displayName ? text(input.displayName, 'Display name') : handle }
}

export function checkActorNames(actors, actor) {
  requireValue(!actors.some(value => value.id === actor.id), 'Actor ID already exists', 'ALREADY_EXISTS')
  requireValue(!actors.some(value => value.handle === actor.handle), 'Actor handle already exists', 'ALREADY_EXISTS')
  requireValue(!actors.some(value => value.handle === actor.id.toLowerCase() || value.id.toLowerCase() === actor.handle),
    'Actor IDs and handles must not refer to different Actors', 'ALREADY_EXISTS')
}

export function createWorkspaceData({ actors = [], workspaceId = randomUUID(), now = new Date().toISOString() } = {}) {
  const records = actors.map(actorRecord)
  for (let index = 0; index < records.length; index++) checkActorNames(records.slice(0, index), records[index])
  return {
    schemaVersion: SCHEMA_VERSION, workspaceId, name: 'Pardner', created_at: now,
    actors: Object.fromEntries(records.map(actor => [actor.id, actor])),
    tasks: {}, taskFields: {}, branchBases: {}, mergedBranches: {}, comments: {}, commentBodies: {}, deletedComments: {},
    goals: {}, goalFields: {}, veins: {}, veinFields: {}, veinLinks: {},
    supersededRevisions: {},
    mentions: {}, operations: {}, readReceipts: {},
  }
}

export function resolveActor(doc, reference) {
  requireValue(typeof reference === 'string' && reference.length > 0, 'Select an Actor before changing work', 'ACTOR_REQUIRED')
  const matches = Object.values(doc.actors).filter(candidate => candidate.id === reference || candidate.handle === reference.toLowerCase())
  requireValue(matches.length <= 1, `Ambiguous Actor: ${reference}; use an unambiguous Actor reference`, 'AMBIGUOUS_ACTOR')
  const [actor] = matches
  requireValue(actor, `Unknown Actor: ${reference}`, 'UNKNOWN_ACTOR')
  return actor
}

export function normalizeFields(doc, input) {
  object(input, 'Task fields')
  const result = {}
  for (const [field, raw] of Object.entries(input)) {
    requireValue(TASK_FIELDS.includes(field), `Unknown task field: ${field}`)
    let value = raw
    if (['title', 'type'].includes(field)) text(value, field)
    if (field === 'description') text(value, field, true)
    if (field === 'status') {
      value = { todo: 'backlog', 'in-review': 'review' }[value] ?? value
      requireValue(STATUSES.includes(value), `Status must be one of: ${STATUSES.join(', ')}`)
    }
    if (field === 'priority') requireValue(['p0', 'p1', 'p2', 'p3'].includes(value), 'Priority must be p0, p1, p2, or p3')
    if (field === 'assignee') value = value === null || value === '' ? null : resolveActor(doc, value).id
    if (field === 'order') requireValue(Number.isFinite(value), 'Task order must be a finite number')
    if (field === 'tags') {
      requireValue(Array.isArray(value) && value.every(tag => typeof tag === 'string' && tag.trim()), 'Tags must be a list of nonempty strings')
      value = [...new Set(value)]
    }
    result[field] = plain(value)
  }
  return result
}

export const supersededRevisionKey = (field, operationId) => `${field}:${operationId}`

function alternatives(doc, container, field) {
  if (!Object.hasOwn(container, field)) return []
  const conflicts = getConflicts(container, field)
  const values = conflicts ? Object.values(conflicts) : [container[field]]
  // Logical retirement is shared across replicas, including late copies of a
  // retried operation. Each retired field revision is stored only once.
  const active = values.filter(record => !doc.supersededRevisions[supersededRevisionKey(field, record.operationId)])
  const byId = new Map(active.map(record => [record.operationId, plain(record)]))
  return [...byId.keys()].sort().map(id => byId.get(id))
}

export function checkRevisions(current, expected, allowConflict = false) {
  requireValue(Array.isArray(expected) && expected.every(value => typeof value === 'string'), 'Supply the observed field revisions', 'REVISION_REQUIRED', { current })
  requireValue(canonical([...new Set(expected)].sort()) === canonical([...new Set(current)].sort()), 'This field changed since it was read; refresh its context', 'STALE_UPDATE', { current, expected })
  requireValue(allowConflict || current.length <= 1, 'Resolve the concurrent alternatives explicitly', 'CONFLICT_REQUIRES_RESOLUTION', { current })
}

export const fieldKey = (id, field) => `${id}:${field}`
export const taskRecord = (doc, taskId) => recordOf(doc, 'task', taskId)
export const taskAlternatives = (doc, taskId, field) => recordAlternatives(doc, 'task', taskId, field)

function selectedAlternative(choices, preferred) {
  return choices.find(record => record.operationId === preferred.operationId) ?? choices.at(-1)
}

export function normalizeRecordFields(doc, kind, input) {
  const { fields, statuses, label } = RECORDS[kind]
  object(input, `${label} fields`)
  const result = {}
  for (const [field, value] of Object.entries(input)) {
    requireValue(fields.includes(field), `Unknown ${kind} field: ${field}`)
    if (field === 'title') text(value, field)
    if (field === 'description') text(value, field, true)
    if (field === 'status') requireValue(statuses.includes(value), `${label} status must be one of: ${statuses.join(', ')}`)
    result[field] = field === 'goalId' ? recordOf(doc, 'goal', value).id : plain(value)
  }
  return result
}

export function recordOf(doc, kind, id) {
  const { collection, label } = RECORDS[kind]
  identifier(id, `${label} ID`)
  requireValue(Object.hasOwn(doc[collection], id), `${label} not found: ${id}`, 'NOT_FOUND')
  return doc[collection][id]
}

export function recordAlternatives(doc, kind, id, field) {
  recordOf(doc, kind, id)
  return alternatives(doc, doc[RECORDS[kind].container], fieldKey(id, field))
}

export function recordState(doc, kind, id) {
  const record = recordOf(doc, kind, id)
  const { container, fields: names } = RECORDS[kind]
  const fields = {}, revisions = {}, conflicts = {}
  let updated = ''
  for (const field of names) {
    const choices = recordAlternatives(doc, kind, id, field)
    const selected = selectedAlternative(choices, doc[container][fieldKey(id, field)])
    fields[field] = selected.value
    if (selected.timestamp > updated) updated = selected.timestamp
    revisions[field] = choices.map(choice => choice.operationId)
    if (choices.length > 1) conflicts[field] = choices
  }
  return {
    record: { id, ...fields, created_at: record.created_at, updated_at: updated || record.created_at, created_by: record.actorId },
    revisions, conflicts,
  }
}

export const veinLinkKey = (taskId, veinId) => `${taskId}:${veinId}`

// Links are add-wins: concurrent links survive an unlink that did not observe them.
export function linkAlternatives(doc, taskId, veinId) {
  return alternatives(doc, doc.veinLinks, veinLinkKey(taskId, veinId))
}

export const linkActive = links => links.some(record => record.value === true)

export function veinLinkIndex(doc) {
  const byTask = {}, byVein = {}
  for (const key of Object.keys(doc.veinLinks)) {
    const [taskId, veinId] = key.split(':')
    if (!linkActive(linkAlternatives(doc, taskId, veinId))) continue
    ;(byTask[taskId] ??= []).push(veinId)
    ;(byVein[veinId] ??= []).push(taskId)
  }
  for (const list of [...Object.values(byTask), ...Object.values(byVein)]) list.sort()
  return { byTask, byVein }
}

// Resolves each task's status at most once, however many veins share it.
export function taskStatuses(doc) {
  const statuses = new Map()
  return taskId => {
    if (!statuses.has(taskId)) statuses.set(taskId, taskView(doc, taskId).status)
    return statuses.get(taskId)
  }
}

export function veinSummary(doc, veinId, index, statusOf) {
  const { record, revisions, conflicts } = recordState(doc, 'vein', veinId)
  const taskIds = index.byVein[veinId] ?? []
  // Closed tasks are a prompt for a verdict, never a verdict themselves.
  const readyForVerdict = record.status === 'open' && taskIds.length > 0
    && taskIds.every(taskId => CLOSED_TASK_STATUSES.includes(statusOf(taskId)))
  return { ...record, taskIds, readyForVerdict, revisions, conflicts }
}

// Every operation lists the records it touched, so history is one lookup for tasks, veins, and goals.
function recordHistory(doc, id) {
  return Object.values(doc.operations).filter(event => event.recordIds.includes(id)).map(plain)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.operationId.localeCompare(b.operationId))
}

export function veinContext(doc, veinId) {
  const index = veinLinkIndex(doc)
  const tasks = (index.byVein[veinId] ?? []).map(taskId => ({ ...taskView(doc, taskId),
    linkRevisions: linkAlternatives(doc, taskId, veinId).map(record => record.operationId) }))
  const statusById = Object.fromEntries(tasks.map(task => [task.id, task.status]))
  const { revisions, conflicts, ...vein } = veinSummary(doc, veinId, index, taskId => statusById[taskId])
  return { vein, revisions, conflicts, goal: recordState(doc, 'goal', vein.goalId).record, tasks, history: recordHistory(doc, veinId) }
}

export function goalContext(doc, goalId) {
  const { record, revisions, conflicts } = recordState(doc, 'goal', goalId)
  const index = veinLinkIndex(doc), statusOf = taskStatuses(doc)
  const veins = Object.keys(doc.veins).filter(veinId => recordState(doc, 'vein', veinId).record.goalId === goalId)
    .map(veinId => veinSummary(doc, veinId, index, statusOf))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return { goal: record, revisions, conflicts, veins, history: recordHistory(doc, goalId) }
}

export function taskView(doc, taskId) {
  return taskState(doc, taskId).task
}

export function commentAlternatives(doc, commentId) {
  return alternatives(doc, doc.commentBodies, commentId)
}

export function commentDeleted(doc, commentId) {
  return Boolean(doc.deletedComments[commentId])
}

export function commentView(doc, commentId) {
  const comment = doc.comments[commentId]
  const choices = commentAlternatives(doc, commentId)
  const body = selectedAlternative(choices, doc.commentBodies[commentId])
  return {
    id: comment.id, taskId: comment.taskId, actorId: comment.actorId, content: body.value,
    timestamp: comment.created_at, revisionId: body.operationId,
    editedBy: body.actorId, deleted: commentDeleted(doc, commentId),
    revisionIds: choices.map(choice => choice.operationId),
    conflicts: choices.length > 1 ? choices : [],
  }
}

export function activeMentions(doc, taskId = null) {
  return Object.values(doc.mentions).filter(mention => {
    const comment = doc.comments[mention.commentId]
    return (!taskId || mention.taskId === taskId) && comment && !commentDeleted(doc, comment.id)
      && commentAlternatives(doc, comment.id).some(body => body.mentionedActorIds.includes(mention.toActorId))
  }).map(plain)
}

export function receiptKey(actorId, commentId, revisionId) {
  return digest(canonical([actorId, commentId, revisionId]))
}

export function taskState(doc, taskId) {
  const { record, revisions, conflicts } = recordState(doc, 'task', taskId)
  const { branch } = doc.tasks[taskId]
  return {
    task: { ...record, ...(branch ? { branch_of: branch.parentId, branch_name: branch.name, merged: Boolean(doc.mergedBranches[taskId]) } : {}) },
    revisions, conflicts,
  }
}

export function taskContext(doc, taskId, observer = null) {
  const state = taskState(doc, taskId)
  const comments = Object.values(doc.comments).filter(comment => comment.taskId === taskId && !commentDeleted(doc, comment.id))
    .map(comment => commentView(doc, comment.id)).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))
  const history = recordHistory(doc, taskId).filter(event => event.type !== 'read.mark')
  const actorId = observer ? resolveActor(doc, observer).id : null
  // Only this task's link keys are read, not every link in the workspace.
  const veins = Object.keys(doc.veins).sort().flatMap(veinId => {
    const links = linkAlternatives(doc, taskId, veinId)
    if (!linkActive(links)) return []
    const { id, title, status, goalId } = recordState(doc, 'vein', veinId).record
    return [{ id, title, status, goalId, linkRevisions: links.map(record => record.operationId) }]
  })
  return {
    ...state, comments, history, veins,
    mentions: activeMentions(doc, taskId), evidence: history.filter(event => event.type === 'task.link-commit').map(event => event.payload.commit),
    unreadCount: actorId ? comments.filter(comment => comment.revisionIds.some(revisionId => !doc.readReceipts[receiptKey(actorId, comment.id, revisionId)])).length : comments.length,
  }
}
