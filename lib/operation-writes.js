import { STATUS_ALIASES, TASK_FIELDS, actorRecord, canonical, digest, fieldKey, issueLinkKey, issueReference, ownValue, receiptKey, recordId, supersededRevisionKey, veinLinkKey } from './workspace-schema.js'

// An operation entry must match what its change did (docs/PARDNER-TRUST-DESIGN.md, section 3). For each operation
// type this states, from the event and from the board as of the change's own dependencies (what its write path read;
// lib/board-history.js), the exact set of side effects the operation writes: which top-level maps, which keys, and
// the values or register contents (lib/workspace-commands.js is the write path it describes). checkWrites() compares
// that with the change's own writes as lib/change-log.js reads them through Automerge. A change whose writes differ in
// any way (a write missing, an extra write, a different value), or whose event says something about the board then
// that the board did not hold, is listed for review, with both what its entry says and what it wrote or the board held.
//
// It also gives the entry's one reading (`shows`): one value per field, as its change wrote it, with the previous value
// only where the field then held it; the comment text its change wrote; the Actor it registered. Every renderer reads
// that, never the event's own lists, so a check and a renderer cannot pick different elements of one event.
//
// What remains unchecked, and why. None of it is shown as checked: each renderer gives it as what its signer recorded.
export const EXEMPT = Object.freeze([
  'the event’s timestamp and replica: its signing machine’s own clock and replica ID, shown as what its signer recorded; a member can backdate an entry it signs',
  'a commit’s hash and message in task.link-commit: Pardner writes nothing else for it, so they are the signer’s statement about a commit, not a fact about any repository',
  'the revisions task.unlink-vein and task.unlink-issue retire, and every expectedRevisions list: compared with the set the payload names, not with the alternatives then, because the write path refuses any other set and nothing shown depends on it',
  'whether a handle named exactly one Actor then: it is resolved to the one Actor whose ID or handle it is; two Actors sharing one, which no write path registers, are not told apart',
])

const MAX_ITEMS = 16
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const same = (a, b) => canonical(a) === canonical(b)
const distinct = list => (Array.isArray(list) ? [...new Set(list.filter(item => typeof item === 'string'))] : [])
const register = (event, value, extra = {}) => ({ value, operationId: event.operationId, actorId: event.actorId, replicaId: event.replicaId, timestamp: event.timestamp, ...extra })
const RECORDS = { goal: { collection: 'goals', container: 'goalFields' }, vein: { collection: 'veins', container: 'veinFields' } }
const fromText = text => JSON.parse(text)

/** A board with nothing on it: what a caller without the change's history reads. */
export const NO_HISTORY = Object.freeze({
  candidates: () => [], values: () => [], holds: () => false, keys: () => [], retired: () => false,
  alternatives: () => ({ choices: [], groups: [], winner: null, unreadable: 0 }), soleValues: () => [], heldValues: () => [], originChoices: () => [[]], actors: () => [],
  actorsByKey: () => new Map(),
})

/** A task field's value as the write path stores it, from the payload alone (lib/workspace-schema.js normalizeFields, apart from Actor lookup). */
function taskValue(field, value) {
  if (field === 'status') return ownValue(STATUS_ALIASES, value) ?? value
  if (field === 'tags') return Array.isArray(value) ? [...new Set(value)] : value
  if (field === 'assignee' && value === '') return null
  return value
}

/**
 * The bookkeeping a field register at `key` of `container` carries over from the alternatives it replaces
 * (lib/workspace-commands.js branchOrigins): the set its change wrote, when the write path could have read it from the
 * board then (lib/board-history.js originChoices), else the first such set.
 */
function carried(out, container, key) {
  const sets = out.before.originChoices(container, key)
  const wrote = out.written(container, key)
  const own = canonical(isPlainObject(wrote) && Array.isArray(wrote.branchBaseIds) ? wrote.branchBaseIds : [])
  const ids = sets.find(set => canonical(set) === own) ?? sets[0] ?? []
  return ids.length ? { branchBaseIds: ids } : {}
}

/**
 * How the Actors on the board then answer `matches`: for each Actor key, the IDs of its records that match (`maybe`),
 * and whether every record of it does (`sure`). The write path reads the one record Automerge picks for each key, so
 * any outcome between the two is one it could have reached.
 */
function actorMatches(before, matches) {
  const sure = new Set(), maybe = new Map()
  for (const [key, records] of before.actorsByKey()) {
    const hits = records.filter(record => typeof record.id === 'string' && matches(record))
    if (!hits.length) continue
    maybe.set(key, new Set(hits.map(record => record.id)))
    if (hits.length === records.length && new Set(hits.map(record => record.id)).size === 1) sure.add(hits[0].id)
  }
  return { sure, maybe }
}

/**
 * The one Actor `reference` names on the board then, by ID or by handle, or null (lib/workspace-schema.js
 * resolveActor): `stated` when one record of it matches and no other Actor surely does, else the one Actor that
 * surely matches.
 */
function resolve(before, reference, stated = null) {
  if (typeof reference !== 'string' || !reference) return null
  const { sure, maybe } = actorMatches(before, actor => actor.id === reference || actor.handle === reference.toLowerCase())
  const keys = [...maybe].filter(([, ids]) => typeof stated === 'string' && ids.has(stated)).map(([key]) => key)
  if (keys.length && [...sure].every(id => id === stated)) return stated
  return sure.size === 1 && maybe.size === 1 ? [...sure][0] : null
}

/**
 * The Actors a comment body names, sorted: those its message's @handles name on the board then, and its `recipient`
 * (lib/workspace-commands.js commentParts). The list `stated` (what its change wrote) when it holds the recipient and
 * every Actor whose every record matches, and else only Actors one record of which matches; otherwise the recipient
 * and the Actors every record of which matches.
 */
function mentioned(before, message, recipient, stated = null) {
  const handles = new Set([...String(message ?? '').matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)].map(match => match[1].toLowerCase()))
  const { sure, maybe } = handles.size ? actorMatches(before, actor => handles.has(actor.handle)) : { sure: new Set(), maybe: new Map() }
  const required = [...sure, ...(recipient ? [recipient] : [])]
  const possible = new Set([...required, ...[...maybe.values()].flatMap(ids => [...ids])])
  if (Array.isArray(stated) && required.every(id => stated.includes(id)) && stated.every(id => possible.has(id))) return [...new Set(stated)].sort()
  return [...new Set(required)].sort()
}

/** The set of writes an event implies, and its one reading, built per type below. */
class Writes {
  constructor(event, actual, before) {
    Object.assign(this, { event, actual, before })
    this.exact = new Map()
    this.claims = []
    this.shows = {}
  }
  /** `map[key]` must be written, with `value`; an `optional` one need not be (the board then held it already). */
  put(map, key, value, { optional = false } = {}) { this.exact.set(`${map}\u0000${key}`, { map, key, value, optional }) }
  /** The event says `says` where the operation implies `implies`. */
  claim(field, says, implies) { if (!same(says, implies)) this.claims.push({ field, says, implies }) }
  /** The board then did not hold what the operation needs: `what`, in words. */
  need(field, says, what) { this.claims.push({ field, says, implies: what }) }
  supersede(key, revisions) { for (const revision of distinct(revisions)) this.put('supersededRevisions', supersededRevisionKey(key, revision), true) }
  written(map, key) { return this.actual.get(`${map}\u0000${key}`) }
  /**
   * The field registers for `changes` in `container` of record `id` (carrying over, with `carry`, the bookkeeping of the
   * alternatives they replace then), and the entry's reading of each field: the value its change wrote; the previous
   * value only when the field held it then (`old`: 'null' for a new record, whose fields held nothing).
   */
  fields(container, id, changes, { carry = false, old = 'held' } = {}) {
    const shown = []
    for (const change of changes) {
      const key = fieldKey(id, change.field)
      this.put(container, key, register(this.event, change.new, carry ? carried(this, container, key) : {}))
      const wrote = this.written(container, key)
      const reading = { field: change.field, new: isPlainObject(wrote) && Object.hasOwn(wrote, 'value') ? wrote.value : change.new }
      if (!(isPlainObject(wrote) && Object.hasOwn(wrote, 'value'))) reading.newWritten = false
      const stated = Object.hasOwn(change, 'old') ? change.old : null
      const held = old === 'null' ? [canonical(null)] : this.before.heldValues(container, id, change.field)
      if (held.includes(canonical(stated))) Object.assign(reading, { old: stated, oldVerified: true })
      else {
        Object.assign(reading, { oldStated: stated, oldVerified: false })
        this.claims.push({ issue: 'old', field: change.field, says: stated, held: held.map(fromText) })
      }
      shown.push(reading)
    }
    this.shows.changes = shown
  }
}

/** Checks that the fields `changes` lists are exactly those of `expected`, with the `new` values it gives. */
function changesAre(out, changes, expected) {
  out.claim('changes[].field', changes.map(change => change.field).sort(), Object.keys(expected).sort())
  for (const change of changes) if (Object.hasOwn(expected, change.field)) out.claim(`changes.${change.field}.new`, change.new, expected[change.field])
}

/** The new values of a task's fields, with an Actor the payload names by handle resolved as the board then held it. */
function taskExpected(out, updates) {
  const expected = Object.fromEntries(Object.entries(isPlainObject(updates) ? updates : {}).map(([field, value]) => [field, taskValue(field, value)]))
  if (typeof expected.assignee === 'string') {
    const stated = out.event.changes.find(change => change.field === 'assignee')?.new
    const id = resolve(out.before, expected.assignee, stated)
    if (id) expected.assignee = id
    else out.need('payload.assignee', expected.assignee, 'an Actor the board then held')
  }
  return expected
}

/** The mention records a comment body names, each as the write path makes it; one the board then held is not written again. */
function mentions(out, event, { taskId, commentId, text, actorIds, edit }) {
  for (const toActorId of actorIds) {
    const key = digest(canonical([commentId, toActorId]))
    out.put('mentions', `mention-${key}`, { id: `mention-${key}`, idempotency_key: key, taskId, commentId, toActorId, fromActorId: event.actorId,
      operationId: event.operationId, timestamp: event.timestamp, commentDigest: digest(text) }, { optional: edit && out.before.holds('mentions', `mention-${key}`) })
  }
  return actorIds.map(toActorId => `mention-${digest(canonical([commentId, toActorId]))}`)
}

function comment(out, event, { taskId, commentId, text, recipient = null, edit = false }) {
  // The Actors the @handles named then, and the recipient: exactly the ones the body lists.
  const written = out.written('commentBodies', commentId)
  const stated = isPlainObject(written) && Array.isArray(written.mentionedActorIds) && written.mentionedActorIds.every(id => typeof id === 'string') ? written.mentionedActorIds : null
  const actorIds = mentioned(out.before, text, recipient, stated)
  if (!edit) out.put('comments', commentId, { id: commentId, taskId, actorId: event.actorId, created_at: event.timestamp })
  out.put('commentBodies', commentId, register(event, text, { mentionedActorIds: actorIds }))
  const body = out.written('commentBodies', commentId)
  out.shows.comment = { commentId, text: isPlainObject(body) && typeof body.value === 'string' ? body.value : (typeof text === 'string' ? text : null) }
  return mentions(out, event, { taskId, commentId, text, actorIds, edit })
}

/** Whether record `id` of `collection` was on the board then; a claim when it was not. */
function existed(out, collection, id, field) {
  if (typeof id === 'string' && out.before.holds(collection, id)) return true
  out.need(field, id ?? null, `a ${collection.replace(/s$/, '')} the board then held`)
  return false
}

/** What each operation type writes besides its own event. */
const TYPES = {
  'actor.register'(out, event) {
    let actor = null
    try { actor = actorRecord(event.payload) } catch { out.claims.push({ field: 'payload', says: event.payload, implies: 'a valid Actor' }) }
    if (!actor) return
    out.put('actors', actor.id, actor)
    out.shows.payload = { id: actor.id, handle: actor.handle, kind: actor.kind, displayName: actor.displayName }
    expect(out, event, { taskId: undefined, recordIds: [], changes: [], result: { actorId: actor.id } })
  },
  'task.create'(out, event) {
    const taskId = recordId('task', event.operationId)
    const { veinIds = [], ...fields } = event.payload
    const veins = [...new Set(Array.isArray(veinIds) ? veinIds : [])]
    for (const veinId of veins) existed(out, 'veins', veinId, 'payload.veinIds')
    changesAre(out, event.changes, taskExpected(out, { description: '', priority: 'p2', status: 'backlog', assignee: null, tags: [], order: Date.parse(event.timestamp), type: 'task', ...fields }))
    out.put('tasks', taskId, { id: taskId, actorId: event.actorId, created_at: event.timestamp })
    out.fields('taskFields', taskId, event.changes, { old: 'null' })
    for (const veinId of veins) out.put('veinLinks', veinLinkKey(taskId, veinId), register(event, true))
    expect(out, event, { taskId, recordIds: [taskId, ...veins], result: { taskId, ...(veins.length ? { veinIds: veins } : {}) } })
  },
  'task.update'(out, event) { taskFieldsUpdate(out, event, event.payload.updates, event.payload.expectedRevisions) },
  'task.resolve'(out, event) {
    const { field, value, expectedRevisions } = event.payload
    taskFieldsUpdate(out, event, typeof field === 'string' ? { [field]: value } : {}, typeof field === 'string' ? { [field]: expectedRevisions } : {})
  },
  'task.handoff'(out, event) {
    const { taskId, to, status, message } = event.payload
    existed(out, 'tasks', taskId, 'payload.taskId')
    const recipient = resolve(out.before, to, event.changes.find(change => change.field === 'assignee')?.new)
    if (!recipient) out.need('payload.to', to ?? null, 'an Actor the board then held')
    changesAre(out, event.changes, { assignee: recipient ?? to, status: taskValue('status', status) })
    out.fields('taskFields', taskId, event.changes, { carry: true })
    for (const change of event.changes) out.supersede(fieldKey(taskId, change.field), ownValue(event.payload.expectedRevisions, change.field))
    const commentId = recordId('comment', event.operationId)
    const mentionIds = comment(out, event, { taskId, commentId, text: message, recipient })
    expect(out, event, { taskId, recordIds: [taskId], result: { taskId, commentId, mentionIds } })
  },
  'comment.add'(out, event) {
    const { taskId, text } = event.payload
    existed(out, 'tasks', taskId, 'payload.taskId')
    const commentId = recordId('comment', event.operationId)
    const mentionIds = comment(out, event, { taskId, commentId, text })
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId, mentionIds } })
  },
  'comment.edit'(out, event) { commentRevision(out, event) },
  'comment.resolve'(out, event) { commentRevision(out, event) },
  'comment.delete'(out, event) {
    const { commentId } = event.payload
    const taskId = heldComment(out, event, commentId)
    out.put('deletedComments', commentId, true)
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId } })
  },
  'read.mark'(out, event) {
    const { taskId, comments = [] } = event.payload
    const list = (Array.isArray(comments) ? comments : []).filter(isPlainObject)
    const keys = list.map(({ commentId, revisionId }) => receiptKey(event.actorId, commentId, revisionId))
    // Each revision once: the count the event gives is then the number of receipts its change writes.
    if (new Set(keys).size !== keys.length) out.claims.push({ field: 'payload.comments', says: list, implies: 'each comment revision named once' })
    existed(out, 'tasks', taskId, 'payload.taskId')
    list.forEach(({ commentId, revisionId }, index) => out.put('readReceipts', keys[index], { actorId: event.actorId, commentId, revisionId }))
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, receipts: list.length } })
  },
  'task.link-commit'(out, event) {
    const { taskId, commit } = event.payload
    existed(out, 'tasks', taskId, 'payload.taskId')
    expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commitHash: commit?.hash } })
  },
  'task.branch'(out, event) {
    const { taskId: parentId, name } = event.payload
    const branchId = recordId('task', event.operationId)
    // Its base is the parent's fields as the board then held them, keyed by the digest of that base. A field written
    // twice by one operation (a retried request) held either value: the one the branch's own field gives is accepted.
    if (existed(out, 'tasks', parentId, 'payload.taskId')) {
      const base = {}
      for (const field of TASK_FIELDS) {
        const key = fieldKey(parentId, field)
        const { choices } = out.before.alternatives('taskFields', key)
        if (choices.length !== 1) out.need(`parent.${field}`, choices.length, choices.length ? 'one value of each parent field (the parent had concurrent values)' : 'a value of each parent field')
        const values = out.before.soleValues('taskFields', key)
        const wrote = out.written('taskFields', fieldKey(branchId, field))
        const own = isPlainObject(wrote) && Object.hasOwn(wrote, 'value') ? canonical(wrote.value) : undefined
        base[field] = values.find(value => canonical(taskValue(field, value)) === own) ?? values[0] ?? (choices[0] && Object.hasOwn(choices[0], 'value') ? choices[0].value : null)
      }
      const baseId = digest(canonical(base))
      // Written only when the board then held nothing at its key, as the write path decides.
      out.put('branchBases', baseId, base, { optional: out.before.holds('branchBases', baseId) })
      for (const field of TASK_FIELDS) out.put('taskFields', fieldKey(branchId, field), register(event, taskValue(field, base[field]), { branchBaseIds: [baseId] }))
    }
    out.put('tasks', branchId, { id: branchId, actorId: event.actorId, created_at: event.timestamp, branch: { parentId, name } })
    expect(out, event, { taskId: parentId, recordIds: [parentId, branchId], changes: [], result: { taskId: branchId, branchId, parentId } })
  },
  'task.merge'(out, event) {
    const { branchId } = event.payload
    // The branch as the board then held it: every concurrent value of its record names one parent.
    const parents = [...new Set(out.before.values('tasks', branchId).filter(isPlainObject).map(record => (isPlainObject(record.branch) ? record.branch.parentId : undefined))
      .filter(id => typeof id === 'string'))]
    if (parents.length !== 1) out.need('payload.branchId', branchId ?? null, parents.length ? 'a branch of one parent' : 'a branch the board then held')
    const parentId = parents.length === 1 ? parents[0] : undefined
    out.claim('taskId', event.taskId, parentId ?? 'the parent of the branch it merges')
    if (out.before.values('mergedBranches', branchId).some(Boolean)) out.need('payload.branchId', branchId, 'a branch not merged then')
    // The fields it copies are the ones the branch then held changed from its base, as prepareMerge decides, for some
    // value the write path could have read (lib/board-history.js soleValues): a register written twice by one operation
    // held either value, with its own base. The value its event names is accepted when the board then allowed it.
    const updates = {}
    if (parentId) {
      const stated = new Map(event.changes.map(change => [change.field, change]))
      for (const field of TASK_FIELDS) {
        const key = fieldKey(branchId, field)
        const { choices, groups } = out.before.alternatives('taskFields', key)
        if (choices.length > 1) out.need(`branch.${field}`, choices.length, 'a branch without concurrent values')
        if (field === 'order' || !groups.length) continue
        const parentValues = out.before.soleValues('taskFields', fieldKey(parentId, field)).map(value => canonical(value ?? null))
        const options = groups[0].registers.map(register => {
          const value = Object.hasOwn(register, 'value') ? register.value : null
          const own = canonical(value ?? null)
          const bases = (Array.isArray(register.branchBaseIds) ? register.branchBaseIds : [])
            .map(id => out.before.values('branchBases', id).filter(isPlainObject).map(base => canonical(Object.hasOwn(base, field) ? base[field] : null)))
          return { value, skip: bases.every(values => values.includes(own)), update: bases.some(values => values.some(held => held !== own)),
            parentAllows: parentValues.some(held => held === own || bases.every(values => values.includes(held))) }
        })
        const change = stated.get(field)
        const fits = change ? options.filter(option => option.update && same(option.value, change.new)) : []
        if (!change && options.some(option => option.skip)) continue
        const chosen = fits.find(option => option.parentAllows) ?? fits[0] ?? options.find(option => option.update && option.parentAllows) ?? options.find(option => option.update)
        if (!chosen) continue
        if (!chosen.parentAllows) out.need(`branch.${field}`, chosen.value ?? null, 'a field the parent had not also changed')
        updates[field] = chosen.value
      }
    }
    changesAre(out, event.changes, updates)
    out.fields('taskFields', event.taskId, event.changes, { carry: true })
    for (const change of event.changes) out.supersede(fieldKey(event.taskId, change.field), ownValue(event.payload.expectedRevisions, change.field))
    out.put('mergedBranches', branchId, true)
    const statusKey = fieldKey(branchId, 'status')
    const status = out.before.alternatives('taskFields', statusKey).choices
    out.put('taskFields', statusKey, register(event, 'completed', carried(out, 'taskFields', statusKey)))
    // Each of the branch's status revisions then is retired.
    out.supersede(statusKey, status.map(choice => choice.operationId))
    expect(out, event, { recordIds: [event.taskId, branchId], result: { taskId: event.taskId, parentId: event.taskId, branchId } })
  },
  'goal.create'(out, event) {
    const goalId = recordId('goal', event.operationId)
    changesAre(out, event.changes, { description: '', status: 'open', ...event.payload })
    newRecord(out, event, 'goal', goalId, [])
    out.fields('goalFields', goalId, event.changes, { old: 'null' })
    expect(out, event, { taskId: undefined, recordIds: [goalId], result: { goalId } })
  },
  'goal.update'(out, event) { recordUpdate(out, event, 'goal', event.payload.updates, event.payload.expectedRevisions) },
  'goal.resolve'(out, event) { recordResolve(out, event, 'goal') },
  'vein.create'(out, event) {
    const { goal, ...fields } = event.payload
    const veinId = recordId('vein', event.operationId)
    const goalId = isPlainObject(goal) ? recordId('goal', event.operationId) : fields.goalId
    if (!isPlainObject(goal)) existed(out, 'goals', goalId, 'payload.goalId')
    changesAre(out, event.changes, { description: '', status: 'open', ...fields, goalId })
    if (isPlainObject(goal)) newRecord(out, event, 'goal', goalId, Object.entries({ description: '', status: 'open', ...goal }))
    newRecord(out, event, 'vein', veinId, [])
    out.fields('veinFields', veinId, event.changes, { old: 'null' })
    expect(out, event, { taskId: undefined, recordIds: [veinId, goalId], result: { veinId, goalId, ...(isPlainObject(goal) ? { createdGoal: true } : {}) } })
  },
  'vein.update'(out, event) { recordUpdate(out, event, 'vein', event.payload.updates, event.payload.expectedRevisions) },
  'vein.resolve'(out, event) { recordResolve(out, event, 'vein') },
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
  existed(out, 'tasks', taskId, 'payload.taskId')
  changesAre(out, event.changes, taskExpected(out, updates))
  out.fields('taskFields', taskId, event.changes, { carry: true })
  for (const change of event.changes) out.supersede(fieldKey(taskId, change.field), ownValue(expectedRevisions, change.field))
  expect(out, event, { taskId, recordIds: [taskId], result: { taskId } })
}

function newRecord(out, event, kind, id, values) {
  const { collection, container } = RECORDS[kind]
  out.put(collection, id, { id, actorId: event.actorId, created_at: event.timestamp })
  for (const [field, value] of values) out.put(container, fieldKey(id, field), register(event, value))
}

function recordResolve(out, event, kind) {
  const { field, value, expectedRevisions } = event.payload
  recordUpdate(out, event, kind, typeof field === 'string' ? { [field]: value } : {}, typeof field === 'string' ? { [field]: expectedRevisions } : {})
}

function recordUpdate(out, event, kind, updates, expectedRevisions) {
  const key = `${kind}Id`, id = event.payload[key]
  const { collection, container } = RECORDS[kind]
  existed(out, collection, id, `payload.${key}`)
  const expected = isPlainObject(updates) ? updates : {}
  if (Object.hasOwn(expected, 'goalId')) existed(out, 'goals', expected.goalId, 'payload.updates.goalId')
  changesAre(out, event.changes, expected)
  out.fields(container, id, event.changes)
  for (const change of event.changes) out.supersede(fieldKey(id, change.field), ownValue(expectedRevisions, change.field))
  // A vein's goal move belongs to every goal it may leave (its goals then) and to the goal it joins.
  const goals = Object.hasOwn(expected, 'goalId') ? [...out.before.alternatives(container, fieldKey(id, 'goalId')).choices.map(choice => choice.value), expected.goalId] : []
  out.claim('recordIds', event.recordIds, [...new Set([id, ...goals])])
  expect(out, event, { taskId: undefined, result: { [key]: id } })
}

function veinLink(out, event, linking) {
  const { taskId, veinId } = event.payload
  existed(out, 'tasks', taskId, 'payload.taskId')
  existed(out, 'veins', veinId, 'payload.veinId')
  const key = veinLinkKey(taskId, veinId)
  out.put('veinLinks', key, register(event, linking))
  // Linking retires each of the link's alternatives then; unlinking retires exactly the ones it read.
  if (linking) out.supersede(key, out.before.alternatives('veinLinks', key).choices.map(choice => choice.operationId))
  else out.supersede(key, event.payload.expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId, veinId], changes: [], result: { taskId, veinId } })
}

function issueLink(out, event, linking) {
  const { taskId } = event.payload
  let issue = null
  try { issue = issueReference(event.payload) } catch { out.claims.push({ field: 'payload', says: event.payload, implies: 'a GitHub issue reference' }) }
  if (!issue) return
  existed(out, 'tasks', taskId, 'payload.taskId')
  if (!linking) out.supersede(issueLinkKey(taskId, issue), event.payload.expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, ...issue } })
}

/**
 * The task of comment `commentId` as the board then held it, from every concurrent value of its record (a retried
 * comment.add leaves several, alike apart from their time). A claim when there was none, when they name different
 * tasks, when it was deleted then, or when the Actor is not its author.
 */
function heldComment(out, event, commentId) {
  const held = out.before.values('comments', commentId).filter(isPlainObject)
  const tasks = [...new Set(held.map(record => record.taskId).filter(id => typeof id === 'string'))]
  if (!tasks.length) out.need('payload.commentId', commentId ?? null, 'a comment the board then held')
  else if (tasks.length > 1) out.need('payload.commentId', commentId, 'a comment the board then held on one task (its records name several)')
  else {
    if (out.before.values('deletedComments', commentId).some(Boolean)) out.need('payload.commentId', commentId, 'a comment not deleted then')
    if (!held.every(record => record.actorId === event.actorId)) out.need('actorId', event.actorId, 'the comment’s author, who alone may change it')
  }
  return tasks.length === 1 ? tasks[0] : event.taskId
}

function commentRevision(out, event) {
  const { commentId, text, expectedRevisions } = event.payload
  const taskId = heldComment(out, event, commentId)
  comment(out, event, { taskId, commentId, text, edit: true })
  out.supersede(commentId, expectedRevisions)
  expect(out, event, { taskId, recordIds: [taskId], changes: [], result: { taskId, commentId } })
}

/**
 * How a change's side effects differ from what its operation event implies, and the entry's one reading:
 * `{ mismatch, shows }`, the mismatch empty when they match exactly. `effects` are the change's writes into the
 * board's top-level maps besides `operations`, each `{ map, key, value }` as read through Automerge as of the change;
 * `before` is the board as of the change's dependencies (lib/board-history.js). Each difference says what the entry
 * claims and what the change wrote: `{ issue, map, key, claimed, wrote }` for a write (`issue` is differs, missing or
 * extra, and the side that does not exist is absent); `{ issue: 'claim', field, says, implies }` for a part of the
 * event that contradicts what the operation determines or what the board then held; and `{ issue: 'old', field,
 * says, held }` for a previous value its field did not hold then.
 */
export function checkWrites(event, effects, { before = NO_HISTORY } = {}) {
  const actual = new Map(effects.filter(({ map }) => map !== 'operationRequests').map(({ map, key, value }) => [`${map}\u0000${key}`, value]))
  const out = new Writes(event, actual, before)
  out.put('operationRequests', event.requestId, event.operationId)
  // Each field once: a list naming a field twice would give two readings of one value. The rest is read once per field.
  const fields = event.changes.map(change => canonical(change.field))
  if (new Set(fields).size !== fields.length) out.claims.push({ field: 'changes[].field', says: event.changes.map(change => change.field), implies: 'each field once' })
  const once = event.changes.filter((_, index) => fields.indexOf(fields[index]) === index)
  try { (Object.hasOwn(TYPES, event.type) ? TYPES[event.type] : null)?.(out, once.length === event.changes.length ? event : { ...event, changes: once }) } catch (error) {
    out.claims.push({ field: 'event', says: event.type, implies: `an event its type can describe (${String(error?.message ?? error).slice(0, 120)})` })
  }
  const differences = out.claims.map(claim => (claim.issue === 'old' ? claim : { issue: 'claim', field: claim.field, says: claim.says ?? null, implies: claim.implies ?? null }))
  const seen = new Set()
  for (const { map, key, value } of effects) {
    const id = `${map}\u0000${key}`
    seen.add(id)
    const wanted = out.exact.get(id)
    if (!wanted) differences.push({ issue: 'extra', map, key, wrote: value })
    else if (!same(value, wanted.value)) differences.push({ issue: 'differs', map, key, claimed: wanted.value, wrote: value })
  }
  for (const [id, wanted] of out.exact) if (!seen.has(id) && !wanted.optional) differences.push({ issue: 'missing', map: wanted.map, key: wanted.key, claimed: wanted.value })
  // Plain data, as every entry is: a value the event leaves out is null here, never undefined.
  const bounded = differences.length > MAX_ITEMS ? [...differences.slice(0, MAX_ITEMS), { issue: 'more', more: differences.length - MAX_ITEMS }] : differences
  const plainData = value => JSON.parse(JSON.stringify(value, (key, item) => (item === undefined ? null : item)))
  return { mismatch: plainData(bounded), shows: plainData(out.shows) }
}
