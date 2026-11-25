import { createHash } from 'node:crypto'
import { getConflicts, isImmutableString } from '@automerge/automerge'
import { storageValue } from './workspace-values.js'
import { GOAL_FIELDS, OUTCOMES, SCHEMA_VERSION, TASK_FIELDS, VEIN_FIELDS } from '../shared/domain-vocab.js'

export { GOAL_FIELDS, OUTCOMES, SCHEMA_VERSION, TASK_FIELDS, VEIN_FIELDS }

export const RECORDS = {
  task: { collection: 'tasks', container: 'taskFields', fields: TASK_FIELDS, label: 'Task' },
  goal: { collection: 'goals', container: 'goalFields', fields: GOAL_FIELDS, label: 'Goal' },
  vein: { collection: 'veins', container: 'veinFields', fields: VEIN_FIELDS, label: 'Vein' },
}
// An integer JSON cannot hold (Automerge reads one as a BigInt) is shown as its digits, so one value never stops a view.
const jsonSafe = (key, value) => (typeof value === 'bigint' ? value.toString() : value)
export const plain = value => JSON.parse(JSON.stringify(value, jsonSafe))
/**
 * A dictionary keyed by board data: no prototype, so a key such as `__proto__` or `constructor` is only data, and no
 * write through it can reach a shared prototype. JSON.stringify writes it as an ordinary object.
 */
export const dictionary = () => Object.create(null)
/** `map[key]` when it is `map`'s own property (an Automerge map, a plain object or a dictionary), else undefined. */
export const ownValue = (map, key) => (map !== null && typeof map === 'object' && (typeof key === 'string' || typeof key === 'number') && Object.hasOwn(map, key) ? map[key] : undefined)
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

// ---- Reading what any member can write ----
//
// Any member can write any well-formed data into any record. A read view (lib/workspace.js Workspace.readable())
// reads every stored record through SHAPES: a record that is not a map, or lacks the ID it is known by, is left out;
// a field holding a value of the wrong kind reads as that kind's empty value. Each is listed in the view's
// `unreadable`, with the record and field, and nothing on the board is changed. The write path reads the board as it
// is, so what an operation records (a previous value, a revision) is what the board held.

const UNREADABLE = Symbol('unreadable')
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
/** Each kind of field a view reads: whether a value is of it, its empty value, and both in words. */
const KINDS = {
  key: { is: value => typeof value === 'string', words: 'text' },
  text: { is: value => typeof value === 'string', empty: () => '', words: 'text', none: 'empty text' },
  textOrNull: { is: value => value === null || typeof value === 'string', empty: () => null, words: 'text', none: 'nothing' },
  // An integer JSON cannot hold reads as its exact digits (plain), and is still a number.
  number: { is: value => Number.isFinite(value) || (typeof value === 'string' && /^-?\d+$/.test(value)), empty: () => 0, words: 'a number', none: '0' },
  boolean: { is: value => typeof value === 'boolean', empty: () => false, words: 'true or false', none: 'false' },
  texts: { is: value => Array.isArray(value) && value.every(item => typeof item === 'string'), empty: () => [], words: 'a list of text', none: 'an empty list' },
  outcome: { is: value => value === null || OUTCOMES.includes(value), empty: () => null, words: 'an outcome', none: 'nothing' },
  map: { is: isPlainObject, empty: () => ({}), words: 'a map', none: 'an empty map' },
  changes: { is: value => Array.isArray(value) && value.every(item => isPlainObject(item) && typeof item.field === 'string'), empty: () => [], words: 'a list of field changes', none: 'an empty list' },
  branch: { is: value => isPlainObject(value) && typeof value.parentId === 'string' && typeof value.name === 'string', empty: () => undefined, words: 'a parent task and a branch name', none: 'not a branch' },
}
const REVISION = { operationId: 'key', actorId: 'text', replicaId: 'text', timestamp: 'text', branchBaseIds: 'texts?' }
const FIELD_KINDS = {
  task: { title: 'text', description: 'text', outcome: 'outcome', priority: 'text', assignee: 'textOrNull', tags: 'texts', order: 'number', type: 'text' },
  goal: { title: 'text', description: 'text', outcome: 'outcome' },
  vein: { title: 'text', description: 'text', outcome: 'outcome', goalId: 'text' },
}
/**
 * What a read view reads of each record as lib/workspace-commands.js stores it, and the kind of each field: a `key`
 * field is the ID the record is known by, without which it is left out; a field marked `?` may be absent. Each field
 * of a task, goal and vein, a comment's text and a task's place in a vein are revisions (REVISION), with a `value`.
 */
export const SHAPES = Object.freeze({
  actor: { id: 'key', handle: 'text', kind: 'text', displayName: 'text' },
  task: { id: 'text', actorId: 'text', created_at: 'text', branch: 'branch?' },
  goal: { id: 'text', actorId: 'text', created_at: 'text' },
  vein: { id: 'text', actorId: 'text', created_at: 'text' },
  comment: { id: 'key', taskId: 'text', actorId: 'text', created_at: 'text', assignedTo: 'text?' },
  todoCompletion: { operationId: 'key', actorId: 'key', timestamp: 'text' },
  mention: { id: 'key', idempotency_key: 'text', taskId: 'text', commentId: 'text', toActorId: 'text', fromActorId: 'text', operationId: 'text', timestamp: 'text', commentDigest: 'text' },
  operation: { operationId: 'key', requestId: 'text', type: 'text', actorId: 'text', replicaId: 'text', timestamp: 'text', fingerprint: 'text', payload: 'map', taskId: 'text?', recordIds: 'texts', changes: 'changes', result: 'map' },
  readReceipt: { actorId: 'text', commentId: 'text', revisionId: 'text' },
  ...Object.fromEntries(Object.entries(FIELD_KINDS).flatMap(([kind, fields]) => Object.entries(fields).map(([field, value]) => [`${kind}.${field}`, { ...REVISION, value }]))),
  'comment.text': { ...REVISION, value: 'text', mentionedActorIds: 'texts' },
  link: { ...REVISION, value: 'boolean' },
})
const LABELS = { actor: 'Actor', task: 'Task', goal: 'Goal', vein: 'Vein', comment: 'Comment', todoCompletion: 'To-do completion', mention: 'Mention', operation: 'Activity entry', readReceipt: 'Read receipt', link: 'Vein link' }

function describe(value) {
  if (value === null || value === undefined) return 'missing'
  if (typeof value === 'string') return `text (“${value.slice(0, 40)}”)`
  if (Array.isArray(value)) {
    const odd = value.find(item => typeof item !== 'string')
    return odd === undefined ? 'a list of text' : `a list holding ${describe(odd)}`
  }
  if (typeof value === 'object') return 'a map'
  return `${typeof value === 'number' ? 'a number' : `a ${typeof value}`} (${String(value).slice(0, 40)})`
}

/** Board view `view` reads every record through SHAPES from now on, adding what it cannot read to `unreadable`. */
export function containReads(view, unreadable) {
  view[UNREADABLE] = { items: unreadable, seen: new Set() }
  return view
}

/** Lists `item` ({ kind, id, field?, reason }) in what read view `doc` cannot read, once per record and field. */
export function noteUnreadable(doc, item) {
  const sink = doc?.[UNREADABLE]
  if (!sink) return
  const key = `${item.kind}\u0000${item.id}\u0000${item.field ?? ''}`
  if (sink.seen.has(key)) return
  sink.seen.add(key)
  sink.items.push(item)
}

/**
 * `value`, stored for record `owner.id` of kind `owner.kind` (one revision of its field `owner.field` when that is
 * given), as a read view reads it with `shape`: undefined when it is not a map or lacks its key, and otherwise a copy
 * with each field of the wrong kind read as that kind's empty value; each is listed. Elsewhere, `value` as stored.
 */
function readStored(doc, shape, value, owner) {
  if (!doc?.[UNREADABLE]) return value
  const label = `${LABELS[owner.kind]} ${owner.id}`
  const what = owner.field ? `A revision of ${label}’s ${owner.field}` : label
  if (!isPlainObject(value)) {
    noteUnreadable(doc, { ...owner, reason: `${what} is ${describe(value)}, not a map, so it isn’t read` })
    return undefined
  }
  const read = { ...value }
  for (const [name, spec] of Object.entries(shape)) {
    const optional = spec.endsWith('?'), kind = KINDS[optional ? spec.slice(0, -1) : spec]
    const held = Object.hasOwn(value, name) ? value[name] : undefined
    if ((optional && held === undefined) || kind.is(held)) continue
    if (spec === 'key') {
      noteUnreadable(doc, { ...owner, reason: `${what} has ${describe(held)} as its ${name}, not text, so it isn’t read` })
      return undefined
    }
    const field = owner.field ?? name
    noteUnreadable(doc, { ...owner, field, reason: name === 'value' ? `${label}’s ${field} is ${describe(held)}, not ${kind.words}, so it reads as ${kind.none}`
      : `${what} has ${describe(held)} as its ${name}, not ${kind.words}, so it reads as ${kind.none}` })
    const empty = kind.empty()
    if (empty === undefined) delete read[name]
    else read[name] = empty
  }
  return read
}

/** The empty value of field `owner.field`, of kind `kind`, for a record holding no readable value for it: listed on a read view, refused elsewhere. */
function unreadableField(doc, owner, kind) {
  const reason = `${LABELS[owner.kind]} ${owner.id} holds no readable ${owner.field}`
  if (!doc?.[UNREADABLE]) throw new OperationError('UNREADABLE', reason)
  noteUnreadable(doc, { ...owner, reason: `${reason}, so it reads as ${KINDS[kind].none}` })
  return KINDS[kind].empty()
}

/** Record `id` of `kind` in top-level map `map`, as stored (readStored); NOT_FOUND when absent, UNREADABLE when it can't be read. */
export function storedRecord(doc, kind, map, id) {
  const held = ownValue(doc[map], id)
  requireValue(held !== undefined, `${LABELS[kind]} not found: ${id}`, 'NOT_FOUND')
  const record = readStored(doc, SHAPES[kind], plain(held), { kind, id })
  requireValue(record !== undefined, `${LABELS[kind]} ${id} can’t be read`, 'UNREADABLE', { kind, id })
  return record
}

/** Every record of `kind` held in top-level map `map` that can be read, as `[key, record]` (readStored). */
export function storedRecords(doc, kind, map) {
  return Object.entries(doc[map]).flatMap(([key, value]) => {
    const record = readStored(doc, SHAPES[kind], plain(value), { kind, id: key })
    return record === undefined ? [] : [[key, record]]
  })
}

/** `read()`, or undefined when it is refused (a record that is not there or can't be read). */
const maybe = read => { try { return read() } catch (error) { if (error instanceof OperationError) return undefined; throw error } }

/**
 * The board's Actors: on a read view each that can be read; elsewhere each stored map with a text ID, as the check of
 * an operation reads them (lib/operation-writes.js actorMatches). An Actor record with no ID names nobody.
 */
export const boardActors = doc => storedRecords(doc, 'actor', 'actors').map(([, actor]) => actor).filter(actor => isPlainObject(actor) && typeof actor.id === 'string')

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
  if (isImmutableString(value)) return JSON.stringify(value.toString())
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
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
  const actor = { id, handle, kind: input.kind, displayName: input.displayName ? text(input.displayName, 'Display name') : handle }
  return actor
}

export function checkActorNames(actors, actor) {
  requireValue(!actors.some(value => value.id === actor.id), 'Actor ID already exists', 'ALREADY_EXISTS')
  requireValue(!actors.some(value => value.handle === actor.handle), 'Actor handle already exists', 'ALREADY_EXISTS')
  requireValue(!actors.some(value => value.handle === actor.id.toLowerCase() || value.id.toLowerCase() === actor.handle),
    'Actor IDs and handles must not refer to different Actors', 'ALREADY_EXISTS')
}

/**
 * A new workspace document. Its ID is the project ID derived from the signed
 * genesis, which it holds in `membership`: signed membership records keyed by
 * recordId. The caller verifies the genesis; this only places it.
 */
export function createWorkspaceData({ actors = [], genesis, now = new Date().toISOString() } = {}) {
  requireValue(genesis?.kind === 'project.genesis' && /^[a-f0-9]{64}$/.test(genesis.projectId) && typeof genesis.recordId === 'string',
    'A new workspace needs its signed genesis record')
  const records = actors.map(actorRecord)
  for (let index = 0; index < records.length; index++) checkActorNames(records.slice(0, index), records[index])
  return storageValue({
    schemaVersion: SCHEMA_VERSION, workspaceId: genesis.projectId, name: 'Pardner', created_at: now,
    membership: { [genesis.recordId]: plain(genesis) },
    actors: Object.fromEntries(records.map(actor => [actor.id, actor])),
    tasks: {}, taskFields: {}, branchBases: {}, mergedBranches: {}, comments: {}, commentBodies: {}, deletedComments: {}, todoCompletions: {},
    goals: {}, goalFields: {}, veins: {}, veinFields: {}, veinLinks: {},
    supersededRevisions: {},
    mentions: {}, operations: {}, operationRequests: {}, readReceipts: {},
  })
}

export function resolveActor(doc, reference) {
  requireValue(typeof reference === 'string' && reference.length > 0, 'Select an Actor before changing work', 'ACTOR_REQUIRED')
  const matches = boardActors(doc).filter(candidate => candidate.id === reference || candidate.handle === reference.toLowerCase())
  requireValue(matches.length <= 1, `Ambiguous Actor: ${reference}; use an unambiguous Actor reference`, 'AMBIGUOUS_ACTOR')
  const [actor] = matches
  requireValue(actor, `Unknown Actor: ${reference}`, 'UNKNOWN_ACTOR')
  return actor
}

function normalizeOutcome(value) {
  requireValue(value === null || OUTCOMES.includes(value), `Outcome must be one of: ${OUTCOMES.join(', ')}, or null`)
}

export function normalizeFields(doc, input) {
  object(input, 'Task fields')
  const result = {}
  for (const [field, raw] of Object.entries(input)) {
    requireValue(TASK_FIELDS.includes(field), `Unknown task field: ${field}`)
    let value = raw
    if (['title', 'type'].includes(field)) text(value, field)
    if (field === 'description') text(value, field, true)
    if (field === 'outcome') normalizeOutcome(value)
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

/** The revisions held at `key` of `container`, each read as `shape` for `owner` (readStored), less those retired. */
function alternatives(doc, container, key, shape, owner) {
  if (!Object.hasOwn(container, key)) return []
  const conflicts = getConflicts(container, key)
  const values = (conflicts ? Object.values(conflicts) : [container[key]]).flatMap(value => {
    const read = readStored(doc, shape, plain(value), owner)
    return read === undefined ? [] : [read]
  })
  // Logical retirement is shared across replicas, including late copies of a
  // retried operation. Each retired field revision is stored only once.
  const active = values.filter(record => !ownValue(doc.supersededRevisions, supersededRevisionKey(key, record?.operationId)))
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
  const preferredId = ownValue(preferred, 'operationId')
  return choices.find(record => record.operationId === (preferredId === undefined ? undefined : plain(preferredId))) ?? choices.at(-1)
}

export function normalizeRecordFields(doc, kind, input) {
  const { fields, label } = RECORDS[kind]
  object(input, `${label} fields`)
  const result = {}
  for (const [field, value] of Object.entries(input)) {
    requireValue(fields.includes(field), `Unknown ${kind} field: ${field}`)
    if (field === 'title') text(value, field)
    if (field === 'description') text(value, field, true)
    if (field === 'outcome') normalizeOutcome(value)
    result[field] = field === 'goalId' ? recordOf(doc, 'goal', value).id : plain(value)
  }
  return result
}

export function recordOf(doc, kind, id) {
  const { collection, label } = RECORDS[kind]
  identifier(id, `${label} ID`)
  return storedRecord(doc, kind, collection, id)
}

/** Whether the board holds record `id` of `kind`, and it can be read. */
export const holds = (doc, kind, id) => maybe(() => recordOf(doc, kind, id)) !== undefined

export function recordAlternatives(doc, kind, id, field) {
  recordOf(doc, kind, id)
  return alternatives(doc, doc[RECORDS[kind].container], fieldKey(id, field), SHAPES[`${kind}.${field}`], { kind, id, field })
}

export const recordValues = (doc, kind, id, field) => recordAlternatives(doc, kind, id, field).map(choice => choice.value)

export function recordState(doc, kind, id) {
  const record = recordOf(doc, kind, id)
  const { container, fields: names } = RECORDS[kind]
  const fields = {}, revisions = {}, conflicts = {}
  let updated = ''
  for (const field of names) {
    const choices = recordAlternatives(doc, kind, id, field)
    const selected = selectedAlternative(choices, ownValue(doc[container], fieldKey(id, field)))
    revisions[field] = choices.map(choice => choice.operationId)
    if (!selected) { fields[field] = unreadableField(doc, { kind, id, field }, FIELD_KINDS[kind][field]); continue }
    fields[field] = selected.value
    if (selected.timestamp > updated) updated = selected.timestamp
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
  const key = veinLinkKey(taskId, veinId)
  return alternatives(doc, doc.veinLinks, key, SHAPES.link, { kind: 'link', id: key })
}

export const linkActive = links => links.some(record => record.value === true)

export function veinLinkIndex(doc) {
  const byTask = dictionary(), byVein = dictionary()
  for (const key of Object.keys(doc.veinLinks)) {
    const [taskId, veinId] = key.split(':')
    if (!linkActive(linkAlternatives(doc, taskId, veinId))) continue
    ;(Object.hasOwn(byTask, taskId) ? byTask[taskId] : (byTask[taskId] = [])).push(veinId)
    ;(Object.hasOwn(byVein, veinId) ? byVein[veinId] : (byVein[veinId] = [])).push(taskId)
  }
  for (const list of [...Object.values(byTask), ...Object.values(byVein)]) list.sort()
  return { byTask, byVein }
}

/**
 * A GitHub issue reference as Pardner records it. Linking stores the reference
 * only: nothing is fetched from or published to GitHub, and GitHub status never
 * moves the task.
 */
export function issueReference(input) {
  object(input, 'Issue reference')
  const repository = text(input.repository, 'Repository').trim().toLowerCase()
  requireValue(/^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/.test(repository) && !repository.endsWith('/.') && !repository.endsWith('/..'),
    'Repository must be a GitHub owner/name')
  requireValue(Number.isSafeInteger(input.number) && input.number > 0, 'Issue number must be a positive integer')
  return { repository, number: input.number }
}

export const issueLinkKey = (taskId, { repository, number }) => `issue:${taskId}:${repository}#${number}`

// Links are add-wins: an unlink retires only the link revisions it observed.
export function issueLinkIndex(doc) {
  const byTask = new Map()
  for (const event of operationEvents(doc)) {
    if (event.type !== 'task.link-issue') continue
    // Only links as the write path records them: another value in the operations map is not a link.
    const { taskId, repository, number } = event.result && typeof event.result === 'object' ? event.result : {}
    if (typeof taskId !== 'string' || typeof repository !== 'string' || !Number.isSafeInteger(number) || typeof event.operationId !== 'string') continue
    const key = issueLinkKey(taskId, { repository, number })
    if (ownValue(doc.supersededRevisions, supersededRevisionKey(key, event.operationId))) continue
    if (!byTask.has(taskId)) byTask.set(taskId, new Map())
    const links = byTask.get(taskId)
    if (!links.has(key)) links.set(key, { repository, number, url: `https://github.com/${repository}/issues/${number}`, revisions: [] })
    links.get(key).revisions.push(event.operationId)
  }
  const index = dictionary()
  for (const [taskId, links] of byTask) {
    index[taskId] = [...links.values()].map(link => ({ ...link, revisions: link.revisions.sort() }))
      .sort((a, b) => a.repository.localeCompare(b.repository) || a.number - b.number)
  }
  return index
}

function fieldValues(record, conflicts, field) {
  return conflicts[field]?.map(choice => choice.value) ?? [record[field]]
}

function outcomeState(outcomes) {
  return outcomes.some(value => value !== null) ? 'ended' : 'open'
}

export function veinSummary(doc, veinId, index, readTask = taskId => taskView(doc, taskId)) {
  const { record, revisions, conflicts } = recordState(doc, 'vein', veinId)
  const taskIds = (ownValue(index.byVein, veinId) ?? []).filter(taskId => holds(doc, 'task', taskId))
  const tasks = taskIds.map(readTask).filter(Boolean)
  const state = outcomeState(fieldValues(record, conflicts, 'outcome'))
  // Every alternative must have an outcome to prompt for a verdict; a concurrent reopening keeps the prompt off.
  const readyForVerdict = state !== 'ended' && tasks.length > 0 && tasks.length === taskIds.length
    && tasks.every(task => task.hasVerdictOutcome)
  return { ...record, state, goalIds: recordValues(doc, 'vein', veinId, 'goalId'), taskIds, readyForVerdict, revisions, conflicts }
}

export function goalSummary(doc, goalId) {
  const { record, revisions, conflicts } = recordState(doc, 'goal', goalId)
  const state = outcomeState(fieldValues(record, conflicts, 'outcome'))
  return { ...record, state, revisions, conflicts }
}

// A retry on another replica can create a concurrent map value. Read every
// value, then collapse only identical logical requests in a stable order.
export function operationEvents(doc, requestId = null) {
  const keys = requestId === null ? Object.keys(doc.operations)
    : Object.hasOwn(doc.operationRequests, requestId)
      ? Object.values(getConflicts(doc.operationRequests, requestId) ?? { value: doc.operationRequests[requestId] }).map(plain) : []
  const events = [...new Set(keys)].sort().flatMap(key => {
    const values = Object.values(getConflicts(doc.operations, key) ?? { value: doc.operations[key] })
      .flatMap(value => { const event = readStored(doc, SHAPES.operation, plain(value), { kind: 'operation', id: key }); return event === undefined ? [] : [event] })
      .filter(event => requestId === null || event.requestId === requestId)
    return values.sort((a, b) => canonical(a).localeCompare(canonical(b)))
  })
  const groups = new Map()
  for (const event of events) {
    const key = canonical([event.operationId, event.fingerprint])
    if (!groups.has(key)) groups.set(key, { ...plain(event), origins: [] })
    const origins = groups.get(key).origins
    const origin = { replicaId: event.replicaId, timestamp: event.timestamp }
    if (!origins.some(value => canonical(value) === canonical(origin))) origins.push(origin)
  }
  return [...groups.values()]
}

export function operationIntegrityConflicts(doc, recordId = null) {
  const groups = new Map()
  for (const event of operationEvents(doc)) {
    if (!groups.has(event.requestId)) groups.set(event.requestId, [])
    groups.get(event.requestId).push(event)
  }
  return [...groups.entries()].filter(([, variants]) => variants.length > 1
    && (recordId === null || variants.some(event => event.recordIds.includes(recordId))))
    .map(([requestId, variants]) => ({ requestId, status: 'unresolved', variants }))
    .sort((a, b) => a.requestId.localeCompare(b.requestId))
}

// Every operation lists the records it touched, so history is one lookup for tasks, veins, and goals.
function recordHistory(doc, id) {
  return operationEvents(doc).filter(event => event.recordIds.includes(id)).map(plain)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.operationId.localeCompare(b.operationId))
}

export function veinContext(doc, veinId) {
  const index = veinLinkIndex(doc)
  const { revisions, conflicts, ...vein } = veinSummary(doc, veinId, index)
  const tasks = vein.taskIds.map(taskId => ({ ...taskView(doc, taskId), linkRevisions: linkAlternatives(doc, taskId, veinId).map(record => record.operationId) }))
  let goal = null
  if (holds(doc, 'goal', vein.goalId)) {
    const { revisions: _revisions, conflicts: _conflicts, ...summary } = goalSummary(doc, vein.goalId)
    goal = summary
  }
  return { vein, revisions, conflicts, goal, tasks, history: recordHistory(doc, veinId) }
}

function veinsForGoal(doc, goalId, index) {
  return Object.keys(doc.veins).filter(veinId => holds(doc, 'vein', veinId) && recordValues(doc, 'vein', veinId, 'goalId').includes(goalId))
    .map(veinId => veinSummary(doc, veinId, index))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function goalContext(doc, goalId) {
  recordOf(doc, 'goal', goalId)
  const veins = veinsForGoal(doc, goalId, veinLinkIndex(doc))
  const { revisions, conflicts, ...goal } = goalSummary(doc, goalId)
  return { goal, revisions, conflicts, veins, history: recordHistory(doc, goalId) }
}

export function taskView(doc, taskId) {
  return taskState(doc, taskId).task
}

export function commentAlternatives(doc, commentId) {
  return alternatives(doc, doc.commentBodies, commentId, SHAPES['comment.text'], { kind: 'comment', id: commentId, field: 'text' })
}

export function commentDeleted(doc, commentId) {
  return Boolean(ownValue(doc.deletedComments, commentId))
}

export function todoCompletion(doc, commentId, assignee) {
  return alternatives(doc, doc.todoCompletions, commentId, SHAPES.todoCompletion, { kind: 'todoCompletion', id: commentId })
    .filter(record => record.actorId === assignee)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.operationId.localeCompare(b.operationId))[0] ?? null
}

export function commentView(doc, commentId) {
  const comment = storedRecord(doc, 'comment', 'comments', commentId)
  const choices = commentAlternatives(doc, commentId)
  const body = selectedAlternative(choices, ownValue(doc.commentBodies, commentId))
    ?? { value: unreadableField(doc, { kind: 'comment', id: commentId, field: 'text' }, 'text'), operationId: '', actorId: '' }
  return {
    id: comment.id, taskId: comment.taskId, actorId: comment.actorId, content: body.value,
    timestamp: comment.created_at, revisionId: body.operationId,
    editedBy: body.actorId, deleted: commentDeleted(doc, commentId),
    revisionIds: choices.map(choice => choice.operationId),
    conflicts: choices.length > 1 ? choices : [],
    ...(comment.assignedTo ? { todo: { assignee: comment.assignedTo, completion: todoCompletion(doc, commentId, comment.assignedTo) } } : {}),
  }
}

export function activeMentions(doc, taskId = null) {
  return storedRecords(doc, 'mention', 'mentions').map(([, mention]) => mention).filter(mention => {
    if (!isPlainObject(mention) || (taskId && mention.taskId !== taskId)) return false
    const comment = typeof mention.commentId === 'string' ? maybe(() => storedRecord(doc, 'comment', 'comments', mention.commentId)) : undefined
    return comment !== undefined && !commentDeleted(doc, mention.commentId)
      && commentAlternatives(doc, mention.commentId).some(body => body.mentionedActorIds.includes(mention.toActorId))
  })
}

export function receiptKey(actorId, commentId, revisionId) {
  return digest(canonical([actorId, commentId, revisionId]))
}

export function taskState(doc, taskId) {
  const { record, revisions, conflicts } = recordState(doc, 'task', taskId)
  const { branch } = recordOf(doc, 'task', taskId)
  const outcomes = fieldValues(record, conflicts, 'outcome')
  const state = outcomeState(outcomes)
  const hasVerdictOutcome = outcomes.every(value => value !== null)
  return {
    task: { ...record, state, hasVerdictOutcome, ...(branch ? { branch_of: branch.parentId, branch_name: branch.name, merged: Boolean(ownValue(doc.mergedBranches, taskId)) } : {}) },
    revisions, conflicts,
  }
}

/** The commit a `task.link-commit` entry names, when it is a map with a text hash and message; listed otherwise. */
function evidenceOf(doc, event) {
  const commit = event.payload?.commit
  if (isPlainObject(commit) && typeof commit.hash === 'string' && typeof commit.message === 'string') return [commit]
  noteUnreadable(doc, { kind: 'operation', id: event.operationId, field: 'payload.commit',
    reason: `${LABELS.operation} ${event.operationId} names a commit that is ${describe(commit)}, not a map with a text hash and message, so it isn’t shown` })
  return []
}

// Derived, read-only: revisions with no receipt for this reader. Authors are not excluded.
function unreadRevisionIds(doc, actorId, comment) {
  return actorId ? comment.revisionIds.filter(revisionId => !ownValue(doc.readReceipts, receiptKey(actorId, comment.id, revisionId))) : [...comment.revisionIds]
}

export function taskContext(doc, taskId, observer = null) {
  const state = taskState(doc, taskId)
  // Each comment is read on its own: one that can't be read is listed and left out.
  const comments = storedRecords(doc, 'comment', 'comments').filter(([commentId, comment]) => isPlainObject(comment) && comment.taskId === taskId && !commentDeleted(doc, commentId))
    .flatMap(([commentId]) => maybe(() => commentView(doc, commentId)) ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))
  const history = recordHistory(doc, taskId).filter(event => event.type !== 'read.mark')
  const actorId = observer ? resolveActor(doc, observer).id : null
  const viewed = comments.map(comment => ({ ...comment, unreadRevisionIds: unreadRevisionIds(doc, actorId, comment) }))
  // Only this task's link keys are read, not every link in the workspace.
  const veins = Object.keys(doc.veins).sort().flatMap(veinId => {
    const links = linkAlternatives(doc, taskId, veinId)
    if (!linkActive(links) || !holds(doc, 'vein', veinId)) return []
    const { id, title, outcome, goalId } = recordState(doc, 'vein', veinId).record
    return [{ id, title, outcome, goalId, linkRevisions: links.map(record => record.operationId) }]
  })
  return {
    ...state, comments: viewed, history, veins, integrityConflicts: operationIntegrityConflicts(doc, taskId), issues: ownValue(issueLinkIndex(doc), taskId) ?? [],
    mentions: activeMentions(doc, taskId), evidence: history.filter(event => event.type === 'task.link-commit').flatMap(event => evidenceOf(doc, event)),
    unreadCount: viewed.filter(comment => comment.unreadRevisionIds.length).length,
  }
}
