import { TASK_FIELDS, actorRecord, canonical, digest, fieldKey, issueLinkKey, issueReference, receiptKey, recordId, supersededRevisionKey, veinLinkKey } from './workspace-schema.js'

// An operation entry must match what its change did (docs/PARDNER-TRUST-DESIGN.md, section 3). For each operation
// type this states, from the event alone, the exact set of side effects the operation writes (which top-level maps,
// which keys, and the values or register contents; lib/workspace-commands.js is the write path it describes), and
// checkWrites() compares it with the change's own writes as lib/change-log.js reads them through Automerge. A
// change whose writes differ in any way (a write missing, an extra write, a different value) is listed for review,
// with both what its entry says and what it wrote. This is a declarative statement of each type's writes, not a
// replay of prepareOperation against an earlier state of the board.
//
// Exempt, because the value depends on the board's state when the operation ran and the event does not carry it:
export const EXEMPT = Object.freeze([
  // Not written: what a field held before. Shown as the event states it; it is not checked.
  'changes[].old: the value a field held before the operation; it is not written, so it is not checked',
  // Written, but bookkeeping the event does not name; checked for shape only.
  'branchBaseIds on a field register that task.update, task.resolve, task.handoff or task.merge writes: carried over from the branch values it replaces; checked to be a sorted list of distinct strings',
  'the revisions task.link-vein retires (the link’s alternatives then) and those task.merge retires of the merged branch’s status: checked to be keys under that link or that status, each true',
  'which Actors a comment’s @handles named (mentionedActorIds beyond a handoff’s recipient): checked that the mention records written are exactly those of the Actors listed, with the content each must have',
  'an Actor named by handle in a task field or a handoff (the payload’s assignee or to): the Actor ID written is the one changes[] shows; which Actor the handle named is not checked',
  'the fields task.branch copies from its parent: checked against the base it records (whose key is the digest of its content), not against the parent’s fields then',
  'the field values task.merge copies from its branch: checked to be what changes[] lists, not against the branch’s fields then',
  'the goals vein.update lists in recordIds besides the vein and a new goal: the goals the vein may leave',
  'a mention record comment.edit or comment.resolve leaves unwritten: the board already held it, so the write path does not write it again',
])

const MAX_ITEMS = 16
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const same = (a, b) => canonical(a) === canonical(b)
const distinct = list => (Array.isArray(list) ? [...new Set(list.filter(item => typeof item === 'string'))] : [])
const register = (event, value, extra = {}) => ({ value, operationId: event.operationId, actorId: event.actorId, replicaId: event.replicaId, timestamp: event.timestamp, ...extra })
const STATUS_ALIASES = { todo: 'backlog', 'in-review': 'review' }
const RECORDS = { goal: { collection: 'goals', container: 'goalFields' }, vein: { collection: 'veins', container: 'veinFields' } }

/** A task field's value as the write path stores it, from the payload alone (lib/workspace-schema.js normalizeFields, apart from Actor lookup). */
function taskValue(field, value) {
  if (field === 'status') return STATUS_ALIASES[value] ?? value
  if (field === 'tags') return Array.isArray(value) ? [...new Set(value)] : value
  if (field === 'assignee' && value === '') return null
  return value
}

/** Whether a register is `expected` exactly, apart from an optional branchBaseIds list (exempt bookkeeping). */
const registerWithOrigin = expected => actual => {
  if (!isPlainObject(actual)) return false
  const { branchBaseIds, ...rest } = actual
  return same(rest, expected) && (branchBaseIds === undefined || (Array.isArray(branchBaseIds) && branchBaseIds.every(id => typeof id === 'string')
    && same(branchBaseIds, [...new Set(branchBaseIds)].sort())))
}

/** The set of writes an event implies, built per type below. */
class Writes {
  constructor() { this.exact = new Map(); this.prefixes = []; this.claims = [] }
  /** `map[key]` must be written, with `value` (or a value `match` accepts); an `optional` one may instead be already held. */
  put(map, key, value, { match = null, optional = false } = {}) { this.exact.set(`${map}\u0000${key}`, { map, key, value, match, optional }) }
  /** Any number of `map` keys starting `prefix`, each `value`, may be written (exempt bookkeeping). */
  allow(map, prefix, value) { this.prefixes.push({ map, prefix, value }) }
  /** The event says `says` where the operation implies `implies`. */
  claim(field, says, implies) { if (!same(says, implies)) this.claims.push({ field, says, implies }) }
  supersede(key, revisions) { for (const revision of distinct(revisions)) this.put('supersededRevisions', supersededRevisionKey(key, revision), true) }
  fields(container, id, changes, event, { origin = false } = {}) {
    for (const change of changes) {
      const expected = register(event, change.new)
      this.put(container, fieldKey(id, change.field), expected, origin ? { match: registerWithOrigin(expected) } : {})
    }
  }
}

/** Checks that the fields `changes` lists are exactly `fields` (each once), with the `new` values `expected` gives. */
function changesAre(out, changes, expected, { old = undefined, actorFields = [] } = {}) {
  const listed = changes.map(change => change.field)
  out.claim('changes[].field', [...listed].sort(), Object.keys(expected).sort())
  if (new Set(listed).size !== listed.length) out.claims.push({ field: 'changes[].field', says: listed, implies: 'each field once' })
  for (const change of changes) {
    if (!Object.hasOwn(expected, change.field)) continue
    // An Actor named by handle is resolved against the board's Actors then (exempt): the value must still be an ID.
    if (actorFields.includes(change.field) && typeof expected[change.field] === 'string' && expected[change.field] !== '') {
      if (typeof change.new !== 'string' || !change.new) out.claims.push({ field: `changes.${change.field}.new`, says: change.new, implies: 'an Actor ID' })
    } else out.claim(`changes.${change.field}.new`, change.new, expected[change.field])
    if (old !== undefined) out.claim(`changes.${change.field}.old`, change.old, old)
  }
}

/** The mention records a comment body names, each as the write path makes it; `required` unless the board may already hold it. */
function mentions(out, event, { taskId, commentId, text, actorIds, optional }) {
  for (const toActorId of actorIds) {
    const key = digest(canonical([commentId, toActorId]))
    out.put('mentions', `mention-${key}`, { id: `mention-${key}`, idempotency_key: key, taskId, commentId, toActorId, fromActorId: event.actorId,
      operationId: event.operationId, timestamp: event.timestamp, commentDigest: digest(text) }, { optional })
  }
  return actorIds.map(toActorId => `mention-${digest(canonical([commentId, toActorId]))}`)
}

/** The Actors a comment body written by the change names: exempt (mention resolution), but it must be a sorted list of distinct IDs. */
function namedActors(out, body) {
  const ids = isPlainObject(body) ? body.mentionedActorIds : undefined
  if (Array.isArray(ids) && ids.every(id => typeof id === 'string') && same(ids, [...new Set(ids)].sort())) return ids
  out.claims.push({ field: 'mentionedActorIds', says: ids ?? null, implies: 'a sorted list of distinct Actor IDs' })
  return []
}

function comment(out, event, actual, { taskId, commentId, text, recipient = null, edit = false }) {
  const body = actual.get(`commentBodies\u0000${commentId}`)
  const actorIds = namedActors(out, body)
  if (recipient && !actorIds.includes(recipient)) out.claims.push({ field: 'mentionedActorIds', says: actorIds, implies: `includes the recipient ${recipient}` })
  if (!edit) out.put('comments', commentId, { id: commentId, taskId, actorId: event.actorId, created_at: event.timestamp })
  out.put('commentBodies', commentId, register(event, text, { mentionedActorIds: actorIds }))
  return mentions(out, event, { taskId, commentId, text, actorIds, optional: edit })
}

/** What each operation type writes besides its own event, from the event alone. */
const TYPES = {
  'actor.register'(out, event) {
    let actor = null
    try { actor = actorRecord(event.payload) } catch { out.claims.push({ field: 'payload', says: event.payload, implies: 'a valid Actor' }) }
    if (!actor) return
    out.put('actors', actor.id, actor)
    expect(out, event, { taskId: undefined, recordIds: [], changes: [], result: { actorId: actor.id } })
  },
  'task.create'(out, event) {
    const taskId = recordId('task', event.operationId)
    const { veinIds = [], ...fields } = event.payload
    const veins = [...new Set(Array.isArray(veinIds) ? veinIds : [])]
    const expected = Object.fromEntries(Object.entries({ description: '', priority: 'p2', status: 'backlog', assignee: null, tags: [], order: Date.parse(event.timestamp), type: 'task', ...fields })
      .map(([field, value]) => [field, taskValue(field, value)]))
    changesAre(out, event.changes, expected, { old: null, actorFields: ['assignee'] })
    out.put('tasks', taskId, { id: taskId, actorId: event.actorId, created_at: event.timestamp })
    out.fields('taskFields', taskId, event.changes, event)
    for (const veinId of veins) out.put('veinLinks', veinLinkKey(taskId, veinId), register(event, true))
    expect(out, event, { taskId, recordIds: [taskId, ...veins], result: { taskId, ...(veins.length ? { veinIds: veins } : {}) } })
  },
  'task.update'(out, event) { taskFieldsUpdate(out, event, event.payload.updates, event.payload.expectedRevisions) },
  'task.resolve'(out, event) {
    const { field, value, expectedRevisions } = event.payload
    taskFieldsUpdate(out, event, typeof field === 'string' ? { [field]: value } : {}, { [field]: expectedRevisions })
  },
  'task.handoff'(out, event, actual) {
    const { taskId, to, status, message } = event.payload
    changesAre(out, event.changes, { assignee: to, status: taskValue('status', status) }, { actorFields: ['assignee'] })
    out.fields('taskFields', taskId, event.changes, event, { origin: true })
    for (const change of event.changes) out.supersede(fieldKey(taskId, change.field), event.payload.expectedRevisions?.[change.field])
    const commentId = recordId('comment', event.operationId)
    const recipient = event.changes.find(change => change.field === 'assignee')?.new ?? null
    const mentionIds = comment(out, event, actual, { taskId, commentId, text: message, recipient })
    expect(out, event, { taskId, recordIds: [taskId], result: { taskId, commentId, mentionIds } })
  },
  'comment.add'(out, event, actual) {
    const { taskId, text } = event.payload
    const commentId = recordId('comment', event.operationId)
    const mentionIds = comment(out, event, actual, { taskId, commentId, text })
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId, mentionIds } })
  },
  'comment.edit'(out, event, actual, read) { commentRevision(out, event, actual, read) },
  'comment.resolve'(out, event, actual, read) { commentRevision(out, event, actual, read) },
  'comment.delete'(out, event, actual, read) {
    const { commentId } = event.payload
    const taskId = commentTask(out, event, read, commentId)
    out.put('deletedComments', commentId, true)
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId } })
  },
  'read.mark'(out, event) {
    const { taskId, comments = [] } = event.payload
    const list = Array.isArray(comments) ? comments : []
    for (const { commentId, revisionId } of list.filter(isPlainObject)) {
      out.put('readReceipts', receiptKey(event.actorId, commentId, revisionId), { actorId: event.actorId, commentId, revisionId })
    }
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, receipts: list.length } })
  },
  'task.link-commit'(out, event) {
    const { taskId, commit } = event.payload
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commitHash: commit?.hash } })
  },
  'task.branch'(out, event, actual, read) {
    const { taskId: parentId, name } = event.payload
    const branchId = recordId('task', event.operationId)
    // The base the branch records: its registers' branchBaseIds name it (every one must name the same), its key is its
    // content's digest.
    const named = TASK_FIELDS.map(field => actual.get(`taskFields\u0000${fieldKey(branchId, field)}`)).find(value => isPlainObject(value) && Array.isArray(value.branchBaseIds))
    const baseId = named?.branchBaseIds[0]
    if (typeof baseId !== 'string') out.claims.push({ field: 'branchBaseIds', says: named?.branchBaseIds ?? null, implies: 'the digest of the base the branch copies' })
    else {
      const base = actual.get(`branchBases\u0000${baseId}`) ?? read('branchBases', baseId)
      if (isPlainObject(base) && digest(canonical(base)) === baseId && same(Object.keys(base).sort(), [...TASK_FIELDS].sort())) {
        out.put('branchBases', baseId, base, { optional: true })
        for (const field of TASK_FIELDS) out.put('taskFields', fieldKey(branchId, field), register(event, base[field], { branchBaseIds: [baseId] }))
      } else {
        // No base whose digest is its key: that write is wrong or missing, and the fields cannot be checked against it.
        out.put('branchBases', baseId, 'the branch’s base of every task field, whose digest is its key', { match: () => false })
        for (const field of TASK_FIELDS) {
          out.put('taskFields', fieldKey(branchId, field), register(event, null, { branchBaseIds: [baseId] }), { match: value => isPlainObject(value)
            && same({ ...value, value: null }, register(event, null, { branchBaseIds: [baseId] })) })
        }
      }
    }
    out.put('tasks', branchId, { id: branchId, actorId: event.actorId, created_at: event.timestamp, branch: { parentId, name } })
    expect(out, event, { taskId: parentId, recordIds: [parentId, branchId], changes: [], result: { taskId: branchId, branchId, parentId } })
  },
  'task.merge'(out, event, actual, read) {
    const { branchId } = event.payload
    const branch = read('tasks', branchId)
    const parentId = isPlainObject(branch) && isPlainObject(branch.branch) ? branch.branch.parentId : undefined
    out.claim('taskId', event.taskId, parentId ?? 'the parent of the branch it merges')
    for (const change of event.changes) if (!TASK_FIELDS.includes(change.field) || change.field === 'order') out.claims.push({ field: 'changes[].field', says: change.field, implies: 'a task field other than order' })
    out.fields('taskFields', event.taskId, event.changes, event, { origin: true })
    for (const change of event.changes) out.supersede(fieldKey(event.taskId, change.field), event.payload.expectedRevisions?.[change.field])
    out.put('mergedBranches', branchId, true)
    const status = register(event, 'completed')
    out.put('taskFields', fieldKey(branchId, 'status'), status, { match: registerWithOrigin(status) })
    out.allow('supersededRevisions', `${fieldKey(branchId, 'status')}:`, true)
    expect(out, event, { recordIds: [event.taskId, branchId], result: { taskId: event.taskId, parentId: event.taskId, branchId } })
  },
  'goal.create'(out, event) {
    const goalId = recordId('goal', event.operationId)
    changesAre(out, event.changes, { description: '', status: 'open', ...event.payload }, { old: null })
    newRecord(out, event, 'goal', goalId, event.changes.map(change => [change.field, change.new]))
    expect(out, event, { taskId: undefined, recordIds: [goalId], result: { goalId } })
  },
  'goal.update'(out, event) { recordUpdate(out, event, 'goal', event.payload.updates, event.payload.expectedRevisions) },
  'goal.resolve'(out, event) { recordUpdate(out, event, 'goal', typeof event.payload.field === 'string' ? { [event.payload.field]: event.payload.value } : {}, { [event.payload.field]: event.payload.expectedRevisions }) },
  'vein.create'(out, event) {
    const { goal, ...fields } = event.payload
    const veinId = recordId('vein', event.operationId)
    const goalId = isPlainObject(goal) ? recordId('goal', event.operationId) : fields.goalId
    changesAre(out, event.changes, { description: '', status: 'open', ...fields, goalId }, { old: null })
    if (isPlainObject(goal)) newRecord(out, event, 'goal', goalId, Object.entries({ description: '', status: 'open', ...goal }))
    newRecord(out, event, 'vein', veinId, event.changes.map(change => [change.field, change.new]))
    expect(out, event, { taskId: undefined, recordIds: [veinId, goalId], result: { veinId, goalId, ...(isPlainObject(goal) ? { createdGoal: true } : {}) } })
  },
  'vein.update'(out, event) { recordUpdate(out, event, 'vein', event.payload.updates, event.payload.expectedRevisions) },
  'vein.resolve'(out, event) { recordUpdate(out, event, 'vein', typeof event.payload.field === 'string' ? { [event.payload.field]: event.payload.value } : {}, { [event.payload.field]: event.payload.expectedRevisions }) },
  'task.link-vein'(out, event) { veinLink(out, event, true) },
  'task.unlink-vein'(out, event) { veinLink(out, event, false) },
  'task.link-issue'(out, event) { issueLink(out, event, true) },
  'task.unlink-issue'(out, event) { issueLink(out, event, false) },
}

/** The event's own IDs and containers that the operation determines: anything else it says is a claim to check. */
function expect(out, event, spec) {
  const { taskId, recordIds, changes, result } = spec
  if (Object.hasOwn(spec, 'taskId')) out.claim('taskId', event.taskId, taskId)
  if (recordIds) out.claim('recordIds', event.recordIds, recordIds)
  if (changes) out.claim('changes', event.changes, changes)
  if (result) out.claim('result', event.result, result)
}

function taskFieldsUpdate(out, event, updates, expectedRevisions) {
  const { taskId } = event.payload
  const expected = Object.fromEntries(Object.entries(isPlainObject(updates) ? updates : {}).map(([field, value]) => [field, taskValue(field, value)]))
  changesAre(out, event.changes, expected, { actorFields: ['assignee'] })
  out.fields('taskFields', taskId, event.changes, event, { origin: true })
  for (const change of event.changes) out.supersede(fieldKey(taskId, change.field), expectedRevisions?.[change.field])
  expect(out, event, { taskId, recordIds: [taskId], result: { taskId } })
}

function newRecord(out, event, kind, id, values) {
  const { collection, container } = RECORDS[kind]
  out.put(collection, id, { id, actorId: event.actorId, created_at: event.timestamp })
  for (const [field, value] of values) out.put(container, fieldKey(id, field), register(event, value))
}

function recordUpdate(out, event, kind, updates, expectedRevisions) {
  const key = `${kind}Id`, id = event.payload[key]
  const expected = isPlainObject(updates) ? updates : {}
  changesAre(out, event.changes, expected)
  out.fields(RECORDS[kind].container, id, event.changes, event)
  for (const change of event.changes) out.supersede(fieldKey(id, change.field), expectedRevisions?.[change.field])
  // A vein's goal move belongs to the goals it may leave (exempt) and to the goal it joins.
  const joins = Object.hasOwn(expected, 'goalId') ? [expected.goalId] : []
  if (joins.length) {
    if (event.recordIds[0] !== id || !joins.every(goalId => event.recordIds.includes(goalId))) out.claims.push({ field: 'recordIds', says: event.recordIds, implies: `${id} first, and the goal it joins` })
  } else out.claim('recordIds', event.recordIds, [id])
  expect(out, event, { taskId: undefined, result: { [key]: id } })
}

function veinLink(out, event, linking) {
  const { taskId, veinId } = event.payload
  const key = veinLinkKey(taskId, veinId)
  out.put('veinLinks', key, register(event, linking))
  // Linking retires the link's alternatives then (exempt); unlinking retires exactly the ones it read.
  if (linking) out.allow('supersededRevisions', `${key}:`, true)
  else out.supersede(key, event.payload.expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId, veinId], changes: [], result: { taskId, veinId } })
}

function issueLink(out, event, linking) {
  const { taskId } = event.payload
  let issue = null
  try { issue = issueReference(event.payload) } catch { out.claims.push({ field: 'payload', says: event.payload, implies: 'a GitHub issue reference' }) }
  if (!issue) return
  if (!linking) out.supersede(issueLinkKey(taskId, issue), event.payload.expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, ...issue } })
}

/** The task of the comment `commentId` as the board held it when the operation ran (read as of its own change). */
function commentTask(out, event, read, commentId) {
  const held = read('comments', commentId)
  const taskId = isPlainObject(held) ? held.taskId : undefined
  if (taskId === undefined) out.claims.push({ field: 'payload.commentId', says: commentId, implies: 'a comment the board held' })
  return taskId ?? event.taskId
}

function commentRevision(out, event, actual, read) {
  const { commentId, text, expectedRevisions } = event.payload
  const taskId = commentTask(out, event, read, commentId)
  comment(out, event, actual, { taskId, commentId, text, edit: true })
  out.supersede(commentId, expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId } })
}

/**
 * How a change's side effects differ from what its operation event implies: a list of differences, empty when they
 * match exactly. `effects` are the change's writes into the board's top-level maps besides `operations`, each
 * `{ map, key, value }` as read through Automerge as of the change; `read(map, key)` reads a value the board held as
 * of the change. Each difference says what the entry claims and what the change wrote: `{ issue, map, key, claimed,
 * wrote }` for a write (`issue` is differs, missing or extra, and the side that does not exist is absent), or
 * `{ issue: 'claim', field, says, implies }` for a part of the event that contradicts what the operation determines.
 */
export function checkWrites(event, effects, { read = () => undefined } = {}) {
  const out = new Writes()
  const actual = new Map(effects.filter(({ map }) => map !== 'operationRequests').map(({ map, key, value }) => [`${map}\u0000${key}`, value]))
  out.put('operationRequests', event.requestId, event.operationId)
  try { TYPES[event.type]?.(out, event, actual, read) } catch (error) {
    out.claims.push({ field: 'event', says: event.type, implies: `an event its type can describe (${String(error?.message ?? error).slice(0, 120)})` })
  }
  const differences = out.claims.map(({ field, says, implies }) => ({ issue: 'claim', field, says: says ?? null, implies: implies ?? null }))
  const seen = new Set()
  for (const { map, key, value } of effects) {
    const id = `${map}\u0000${key}`
    seen.add(id)
    const wanted = out.exact.get(id)
    if (wanted) {
      if (!(wanted.match ? wanted.match(value) : same(value, wanted.value))) differences.push({ issue: 'differs', map, key, claimed: wanted.value, wrote: value })
      continue
    }
    if (out.prefixes.some(rule => rule.map === map && key.startsWith(rule.prefix) && same(value, rule.value))) continue
    differences.push({ issue: 'extra', map, key, wrote: value })
  }
  for (const [id, wanted] of out.exact) {
    if (seen.has(id)) continue
    if (wanted.optional && read(wanted.map, wanted.key) !== undefined) continue
    differences.push({ issue: 'missing', map: wanted.map, key: wanted.key, claimed: wanted.value })
  }
  // Plain data, as every entry is: a value the event leaves out is null here, never undefined.
  const bounded = differences.length > MAX_ITEMS ? [...differences.slice(0, MAX_ITEMS), { issue: 'more', more: differences.length - MAX_ITEMS }] : differences
  return JSON.parse(JSON.stringify(bounded, (key, value) => (value === undefined ? null : value)))
}
