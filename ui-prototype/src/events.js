import { machineLabel } from './attribution.js'

export const STATUS_LABELS = {
  backlog: 'Backlog', 'up-next': 'Up next', 'in-progress': 'In progress', review: 'Review', completed: 'Completed',
  'dead-end': 'Dead end', abandoned: 'Abandoned', open: 'Open', proven: 'Proven', achieved: 'Achieved',
}

const own = (map, key) => (map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)
const statusLabel = value => (typeof value === 'string' && Object.hasOwn(STATUS_LABELS, value) ? STATUS_LABELS[value] : String(value ?? ''))
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const quote = value => `“${value}”`
const DELETED_NOTE = 'This comment was later deleted'
const EXCERPT_LIMIT = 140
const COMMIT_LIMIT = 100

function actorName(actors, id) {
  const actor = own(actors, id)
  return actor ? actor.displayName || actor.handle || id : id
}

// Inside an entry, every Actor name and every task, goal and vein title is looked up as it is now; everything else
// (the time, the words, the field values and the IDs) is as the entry's change wrote it. A name or title found is a
// part `{ label, current: true }`, which the row marks as current; an ID with nothing to name it is shown as written.
const current = label => ({ label, current: true })
const actorPart = (actors, id) => (own(actors, id) ? current(actorName(actors, id)) : String(id ?? ''))

function formatValue(field, value, lookups) {
  switch (field) {
    case 'status': return statusLabel(value)
    case 'assignee': return value ? actorName(lookups.actors, value) : 'Unassigned'
    case 'priority': return String(value ?? '').toUpperCase()
    case 'title': return quote(value ?? '')
    case 'tags': return Array.isArray(value) && value.length ? value.join(', ') : 'none'
    case 'goalId': return own(lookups.goals, value)?.title ?? 'an unknown goal'
    default: return String(value ?? '')
  }
}

/** A field's value as a part: a name or title looked up now is marked current; anything else is plain text. */
function formatPart(field, value, lookups) {
  if (field === 'assignee' && value && own(lookups.actors, value)) return current(actorName(lookups.actors, value))
  if (field === 'goalId' && own(lookups.goals, value)) return current(lookups.goals[value].title)
  return formatValue(field, value, lookups)
}
const partText = parts => parts.map(part => (typeof part === 'string' ? part : part.label)).join('')

const FIELD_NAMES = { goalId: 'goal' }
const fieldName = field => String(FIELD_NAMES[field] ?? field).toLowerCase()

// Unchanged fields are noise; order is only worth mentioning when nothing else moved.
function meaningfulChanges(event) {
  const changes = (Array.isArray(event.changes) ? event.changes : []).filter(change => change && !same(change.old, change.new))
  const rest = changes.filter(change => change.field !== 'order')
  return rest.length ? rest : changes
}

const DETAIL_ORDER = ['status', 'assignee', 'priority', 'title', 'tags', 'description', 'type', 'goalId']

/** The detail line of an entry's field changes, as parts. */
function detailParts(changes, lookups) {
  const lines = []
  for (const field of DETAIL_ORDER) {
    const change = changes.find(candidate => candidate.field === field)
    if (!change) continue
    if (field === 'description') lines.push(['Description edited'])
    else if (field === 'tags') lines.push([`Tags: ${formatValue('tags', change.new, lookups)}`])
    else if (field === 'type') lines.push([`Type: ${change.old ?? ''} → ${change.new ?? ''}`])
    else {
      const label = field === 'goalId' ? 'Goal' : field[0].toUpperCase() + field.slice(1)
      const before = field === 'goalId' && !change.old ? 'none' : formatPart(field, change.old, lookups)
      lines.push([`${label}: `, before, ' → ', formatPart(field, change.new, lookups)])
    }
  }
  return lines.length ? lines.flatMap((line, index) => (index ? [' · ', ...line] : line)) : null
}

const collapse = value => String(value ?? '').replace(/\s+/g, ' ').trim()

/**
 * The words a comment entry's change wrote, always: a comment deleted later keeps what its signer wrote, with a note
 * saying it was deleted and by whom (the Actor of the change that marked it deleted, as named now, when that change
 * is a comment.delete entry; otherwise that the change is listed for review).
 */
function excerptOf(event, lookups) {
  const body = event.payload?.text ?? event.payload?.message
  const commentId = event.result?.commentId
  if (typeof body !== 'string' || !commentId) return { excerpt: null, deleted: null }
  const text = collapse(body)
  const excerpt = quote(text.length > EXCERPT_LIMIT ? `${text.slice(0, EXCERPT_LIMIT)}…` : text)
  const deletions = own(lookups.deletions, commentId)
  if (Array.isArray(deletions) && deletions.length) return { excerpt, deleted: deletions }
  if (lookups.comments && !own(lookups.comments, commentId)) return { excerpt, deleted: [] }
  return { excerpt, deleted: null }
}

/**
 * The note on a comment's entry when the board now marks it deleted, as parts. Each change that marked it carries its
 * own verdict and review state (lib/workspace-runtime.js currentWriters): only the Actor's own signed, unflagged
 * comment.delete is said to be that Actor's, with the machine that signed it; any other is described neutrally by
 * its signer, and points to Activity. Names are as they are now.
 */
function deletedNote(deletions, lookups) {
  if (!deletions.length) return [`${DELETED_NOTE}.`]
  const machine = id => current(machineLabel(lookups.attribution, id))
  const notes = deletions.slice(0, 3).map(deletion => {
    const confirmed = deletion.type === 'comment.delete' && typeof deletion.actorId === 'string' && deletion.state === 'signed' && deletion.review === false
    if (deletion.review !== true && deletion.review !== false) return ['A change still being checked later marked this comment deleted. See Activity.']
    if (confirmed) return [`${DELETED_NOTE} by `, actorPart(lookups.actors, deletion.actorId), ', signed by ', machine(deletion.machineId), '.']
    if (deletion.state === 'signed' || deletion.state === 'removed') return ['A change that needs review, signed by ', machine(deletion.machineId), ', later marked this comment deleted. See Activity.']
    if (deletion.state === 'unattributed') return ['An unsigned change relayed by ', machine(deletion.relayedBy), ' later marked this comment deleted. See Activity.']
    return ['A change still being checked later marked this comment deleted. See Activity.']
  })
  return notes.flatMap((note, index) => (index ? [' ', ...note] : note))
}

/** An entry that cannot be put into words, as one entry: its signer line and details are still shown. */
const UNDESCRIBED = { actor: 'Someone', actorCurrent: false, parts: [' made a change whose content can’t be put into words'], detail: null, detailParts: null, excerpt: null }

/**
 * One Activity entry's event as a sentence. Whatever the event holds, this never throws: an entry whose content
 * cannot be put into words says so, and every other entry is still described.
 */
export function describeEvent(event, lookups = {}, options = {}) {
  try { return describeEventParts(event, lookups, options) } catch { return UNDESCRIBED }
}

function describeEventParts(event, lookups = {}, { within = null } = {}) {
  const actor = actorName(lookups.actors, event.actorId)
  const actorCurrent = Boolean(own(lookups.actors, event.actorId))
  const payload = event.payload ?? {}
  const result = event.result ?? {}

  const task = id => {
    if (within && id === within) return 'this task'
    const record = own(lookups.tasks, id)
    return record ? { subject: 'task', id, label: record.title, current: true } : { subject: 'task', id, label: 'an unknown task', missing: true }
  }
  const named = (subject, map, fallback) => id => {
    const record = own(map, id)
    return record ? { subject, id, label: record.title, current: true } : { subject, id, label: fallback, missing: true }
  }
  const vein = named('vein', lookups.veins, 'an unknown vein')
  const goal = named('goal', lookups.goals, 'an unknown goal')
  const status = key => ({ status: key, label: statusLabel(key) })
  const plainTitle = (map, id, fallback) => own(map, id)?.title ?? fallback

  const changes = meaningfulChanges(event)
  const changeOf = field => changes.find(change => change.field === field)
  const only = field => changes.length === 1 && changes[0].field === field ? changes[0] : null

  let parts = []
  let detail = null
  let excerpt = null
  const say = (...pieces) => { parts = pieces }
  const detailLine = (list, values) => detailParts(list, values)

  switch (event.type) {
    case 'task.create': {
      const values = Object.fromEntries((Array.isArray(event.changes) ? event.changes : []).map(change => [change.field, change.new]))
      const pick = field => (Object.hasOwn(values, field) ? values[field] : payload[field])
      const veinIds = Array.isArray(result.veinIds) ? result.veinIds : Array.isArray(payload.veinIds) ? payload.veinIds : []
      say(' created ', task(event.taskId))
      detail = [
        [statusLabel(pick('status') ?? 'backlog')],
        [String(pick('priority') ?? 'p2').toUpperCase()],
        pick('assignee') ? ['Assigned to ', actorPart(lookups.actors, pick('assignee'))] : ['Unassigned'],
        ...veinIds.map(id => ['Vein: ', own(lookups.veins, id) ? current(lookups.veins[id].title) : 'an unknown vein']),
      ].flatMap((line, index) => (index ? [' · ', ...line] : line))
      break
    }
    case 'task.update': {
      const [first] = changes
      if (!changes.length) say(' saved ', task(event.taskId), ' with no changes')
      else if (changes.length > 1) { say(' edited ', task(event.taskId)); detail = detailLine(changes, lookups) }
      else if (first.field === 'status') say(' moved ', task(event.taskId), ' to ', status(first.new))
      else if (first.field === 'assignee') {
        if (first.new) say(' assigned ', task(event.taskId), ' to ', actorPart(lookups.actors, first.new))
        else say(' unassigned ', task(event.taskId))
      } else if (first.field === 'priority') say(' changed the priority of ', task(event.taskId), ` to ${formatValue('priority', first.new)}`)
      else if (first.field === 'title') { say(' renamed ', task(event.taskId)); detail = [`Was ${quote(first.old ?? '')}`] }
      else if (first.field === 'description') say(' edited the description of ', task(event.taskId))
      else if (first.field === 'tags') { say(' changed the tags on ', task(event.taskId)); detail = [`Tags: ${formatValue('tags', first.new)}`] }
      else if (first.field === 'order') say(' reordered ', task(event.taskId))
      else if (first.field === 'type') say(' changed the type of ', task(event.taskId), ` to ${first.new ?? ''}`)
      else say(' edited ', task(event.taskId))
      break
    }
    case 'task.resolve':
    case 'goal.resolve':
    case 'vein.resolve': {
      const field = payload.field ?? event.changes?.[0]?.field ?? 'field'
      const change = (Array.isArray(event.changes) ? event.changes : []).find(candidate => candidate.field === field)
      const kind = event.type.split('.')[0]
      const target = kind === 'task' ? task(event.taskId) : kind === 'goal' ? goal(result.goalId) : vein(result.veinId)
      const prefix = kind === 'task' ? '' : `${kind} `
      say(` resolved conflicting ${fieldName(field)} on ${prefix}`, target)
      if (change) detail = field === 'description' ? ['Kept the chosen version'] : ['Kept ', formatPart(field, change.new, lookups)]
      break
    }
    case 'task.handoff': {
      const assignee = (Array.isArray(event.changes) ? event.changes : []).find(change => change.field === 'assignee')
      const recipientId = assignee?.new
      const recipient = recipientId && own(lookups.actors, recipientId) ? current(actorName(lookups.actors, recipientId)) : String(payload.to ?? (recipientId ?? 'someone'))
      const moved = changeOf('status')
      say(' handed ', task(event.taskId), ' to ', recipient, ...(moved ? [' and set it to ', status(moved.new)] : []))
      break
    }
    case 'task.branch':
      say(` started branch ${quote(payload.name ?? '')} from `, task(event.taskId))
      break
    case 'task.merge':
      say(' merged ', own(lookups.tasks, result.branchId) ? current(lookups.tasks[result.branchId].title) : 'an unknown branch', ' into ', task(event.taskId))
      detail = detailLine(changes, lookups)
      break
    case 'task.link-commit': {
      const commit = payload.commit ?? {}
      const hash = String(commit.hash ?? result.commitHash ?? '').slice(0, 7)
      say(` linked commit ${hash} to `, task(event.taskId))
      const line = String(commit.message ?? '').split('\n')[0].trim()
      if (line) detail = [quote(line.length > COMMIT_LIMIT ? `${line.slice(0, COMMIT_LIMIT)}…` : line)]
      break
    }
    case 'task.link-vein':
      say(' added ', task(event.taskId), ' to vein ', vein(result.veinId))
      break
    case 'task.unlink-vein':
      say(' removed ', task(event.taskId), ' from vein ', vein(result.veinId))
      break
    case 'task.link-issue':
    case 'task.unlink-issue': {
      const reference = `${result.repository ?? payload.repository ?? ''}#${result.number ?? payload.number ?? ''}`
      if (event.type === 'task.link-issue') say(` linked issue ${reference} to `, task(event.taskId))
      else say(` unlinked issue ${reference} from `, task(event.taskId))
      break
    }
    case 'comment.add':
    case 'comment.edit':
    case 'comment.resolve': {
      const verb = { 'comment.add': ' commented on ', 'comment.edit': ' edited a comment on ', 'comment.resolve': ' kept one version of a comment on ' }[event.type]
      say(verb, task(event.taskId))
      break
    }
    case 'comment.delete':
      say(' deleted a comment on ', task(event.taskId))
      break
    case 'read.mark': {
      const count = Number(result.receipts) || 0
      if (count > 0) say(` read ${count} comment${count === 1 ? '' : 's'} on `, task(event.taskId))
      else say(' marked ', task(event.taskId), ' as read')
      break
    }
    case 'goal.create':
      say(' created goal ', goal(result.goalId))
      break
    case 'goal.update': {
      const [first] = changes
      if (changes.length === 1 && first.field === 'status') say(' marked goal ', goal(result.goalId), ' ', status(first.new))
      else if (changes.length === 1 && first.field === 'title') { say(' renamed goal ', goal(result.goalId)); detail = [`Was ${quote(first.old ?? '')}`] }
      else if (changes.length === 1 && first.field === 'description') say(' edited the description of goal ', goal(result.goalId))
      else { say(' edited goal ', goal(result.goalId)); detail = detailLine(changes, lookups) }
      break
    }
    case 'vein.create':
      say(' started vein ', vein(result.veinId), result.createdGoal ? ' for new goal ' : ' for goal ', goal(result.goalId))
      break
    case 'vein.update': {
      const [first] = changes
      if (changes.length === 1 && first.field === 'status') say(' marked vein ', vein(result.veinId), ' ', status(first.new))
      else if (changes.length === 1 && first.field === 'goalId') say(' moved vein ', vein(result.veinId), ' to goal ', goal(first.new))
      else if (changes.length === 1 && first.field === 'title') say(' renamed vein ', vein(result.veinId))
      else if (changes.length === 1 && first.field === 'description') say(' edited the description of vein ', vein(result.veinId))
      else { say(' edited vein ', vein(result.veinId)); detail = detailLine(changes, lookups) }
      break
    }
    case 'actor.register': {
      // The Actor registered is named as it is now; its kind is the one the signed payload registered.
      const id = result.actorId
      const name = own(lookups.actors, id) ? current(actorName(lookups.actors, id)) : String(payload.displayName || payload.handle || id || 'an unknown actor')
      const article = payload.kind === 'agent' ? 'an agent' : 'a human'
      if (id && id === event.actorId) say(` joined as ${article}`)
      else say(' registered ', name, ` as ${article}`)
      break
    }
    default:
      say(` recorded ${event.type}`, ...(event.taskId ? [' on ', task(event.taskId)] : []))
  }

  if (['comment.add', 'comment.edit', 'comment.resolve', 'task.handoff'].includes(event.type)) {
    const found = excerptOf(event, lookups)
    excerpt = found.excerpt
    if (found.deleted) detail = deletedNote(found.deleted, lookups)
  }
  // `detail` stays plain text; `detailParts` marks the names and titles in it that are looked up now.
  const parted = Array.isArray(detail) ? detail : detail === null ? null : [detail]
  return { actor, actorCurrent, parts, detail: parted ? partText(parted) : null, detailParts: parted, excerpt }
}

export function eventText(description) {
  const sentence = description.actor + description.parts.map(part => (typeof part === 'string' ? part : part.label)).join('')
  return [sentence, description.detail, description.excerpt].filter(Boolean).join(' — ')
}

const hasStatusChange = event => (Array.isArray(event.changes) ? event.changes : []).some(change => change.field === 'status' && !same(change.old, change.new))

export function eventGroup(event) {
  const type = String(event?.type ?? '')
  if (type === 'task.handoff') return 'status'
  if (['task.update', 'task.resolve', 'task.merge', 'vein.update', 'vein.resolve', 'goal.update', 'goal.resolve'].includes(type) && hasStatusChange(event)) return 'status'
  if (type.startsWith('comment.')) return 'comments'
  if (['task.link-commit', 'task.branch', 'task.merge'].includes(type)) return 'commits'
  if (type.startsWith('goal.') || type.startsWith('vein.') || type === 'task.link-vein' || type === 'task.unlink-vein') return 'plans'
  if (type === 'actor.register') return 'actors'
  if (type === 'read.mark') return 'reads'
  return 'other'
}

const stamp = event => {
  const time = Date.parse(event.timestamp)
  return Number.isNaN(time) ? 0 : time
}

export function sortEvents(events) {
  return [...events].sort((a, b) => stamp(b) - stamp(a) || (String(a.operationId) < String(b.operationId) ? 1 : String(a.operationId) > String(b.operationId) ? -1 : 0))
}
