export const STATUS_LABELS = {
  backlog: 'Backlog', 'up-next': 'Up next', 'in-progress': 'In progress', review: 'Review', completed: 'Completed',
  'dead-end': 'Dead end', abandoned: 'Abandoned', open: 'Open', proven: 'Proven', achieved: 'Achieved',
}

const own = (map, key) => (map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)
const statusLabel = value => (typeof value === 'string' && Object.hasOwn(STATUS_LABELS, value) ? STATUS_LABELS[value] : String(value ?? ''))
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const quote = value => `“${value}”`
const DELETED_NOTE = 'This comment was later deleted.'
const EXCERPT_LIMIT = 140
const COMMIT_LIMIT = 100

function actorName(actors, id) {
  const actor = own(actors, id)
  return actor ? actor.displayName || actor.handle || id : id
}

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

const FIELD_NAMES = { goalId: 'goal' }
const fieldName = field => String(FIELD_NAMES[field] ?? field).toLowerCase()

// Unchanged fields are noise; order is only worth mentioning when nothing else moved.
function meaningfulChanges(event) {
  const changes = (Array.isArray(event.changes) ? event.changes : []).filter(change => change && !same(change.old, change.new))
  const rest = changes.filter(change => change.field !== 'order')
  return rest.length ? rest : changes
}

const DETAIL_ORDER = ['status', 'assignee', 'priority', 'title', 'tags', 'description', 'type', 'goalId']

function detailLine(changes, lookups) {
  const lines = []
  for (const field of DETAIL_ORDER) {
    const change = changes.find(candidate => candidate.field === field)
    if (!change) continue
    if (field === 'description') lines.push('Description edited')
    else if (field === 'tags') lines.push(`Tags: ${formatValue('tags', change.new, lookups)}`)
    else if (field === 'type') lines.push(`Type: ${change.old ?? ''} → ${change.new ?? ''}`)
    else {
      const label = field === 'goalId' ? 'Goal' : field[0].toUpperCase() + field.slice(1)
      const before = field === 'goalId' && !change.old ? 'none' : formatValue(field, change.old, lookups)
      lines.push(`${label}: ${before} → ${formatValue(field, change.new, lookups)}`)
    }
  }
  return lines.length ? lines.join(' · ') : null
}

const collapse = value => String(value ?? '').replace(/\s+/g, ' ').trim()

function excerptOf(event, lookups) {
  const body = event.payload?.text ?? event.payload?.message
  if (typeof body !== 'string') return { excerpt: null, deleted: false }
  const commentId = event.result?.commentId
  if (!commentId) return { excerpt: null, deleted: false }
  if (!own(lookups.comments, commentId)) return { excerpt: null, deleted: true }
  const text = collapse(body)
  return { excerpt: quote(text.length > EXCERPT_LIMIT ? `${text.slice(0, EXCERPT_LIMIT)}…` : text), deleted: false }
}

export function describeEvent(event, lookups = {}, { within = null } = {}) {
  const actor = actorName(lookups.actors, event.actorId)
  const payload = event.payload ?? {}
  const result = event.result ?? {}

  const task = id => {
    if (within && id === within) return 'this task'
    const record = own(lookups.tasks, id)
    return record ? { subject: 'task', id, label: record.title } : { subject: 'task', id, label: 'an unknown task', missing: true }
  }
  const named = (subject, map, fallback) => id => {
    const record = own(map, id)
    return record ? { subject, id, label: record.title } : { subject, id, label: fallback, missing: true }
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

  switch (event.type) {
    case 'task.create': {
      const values = Object.fromEntries((Array.isArray(event.changes) ? event.changes : []).map(change => [change.field, change.new]))
      const pick = field => (Object.hasOwn(values, field) ? values[field] : payload[field])
      const veinIds = Array.isArray(result.veinIds) ? result.veinIds : Array.isArray(payload.veinIds) ? payload.veinIds : []
      say(' created ', task(event.taskId))
      detail = [
        statusLabel(pick('status') ?? 'backlog'),
        String(pick('priority') ?? 'p2').toUpperCase(),
        pick('assignee') ? `Assigned to ${actorName(lookups.actors, pick('assignee'))}` : 'Unassigned',
        ...veinIds.map(id => `Vein: ${plainTitle(lookups.veins, id, 'an unknown vein')}`),
      ].join(' · ')
      break
    }
    case 'task.update': {
      const [first] = changes
      if (!changes.length) say(' saved ', task(event.taskId), ' with no changes')
      else if (changes.length > 1) { say(' edited ', task(event.taskId)); detail = detailLine(changes, lookups) }
      else if (first.field === 'status') say(' moved ', task(event.taskId), ' to ', status(first.new))
      else if (first.field === 'assignee') {
        if (first.new) say(' assigned ', task(event.taskId), ` to ${actorName(lookups.actors, first.new)}`)
        else say(' unassigned ', task(event.taskId))
      } else if (first.field === 'priority') say(' changed the priority of ', task(event.taskId), ` to ${formatValue('priority', first.new)}`)
      else if (first.field === 'title') { say(' renamed ', task(event.taskId)); detail = `Was ${quote(first.old ?? '')}` }
      else if (first.field === 'description') say(' edited the description of ', task(event.taskId))
      else if (first.field === 'tags') { say(' changed the tags on ', task(event.taskId)); detail = `Tags: ${formatValue('tags', first.new)}` }
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
      if (change) detail = field === 'description' ? 'Kept the chosen version' : `Kept ${formatValue(field, change.new, lookups)}`
      break
    }
    case 'task.handoff': {
      const assignee = (Array.isArray(event.changes) ? event.changes : []).find(change => change.field === 'assignee')
      const recipientId = assignee?.new
      const recipient = recipientId && own(lookups.actors, recipientId) ? actorName(lookups.actors, recipientId) : payload.to ?? (recipientId ?? 'someone')
      const moved = changeOf('status')
      say(' handed ', task(event.taskId), ` to ${recipient}`, ...(moved ? [' and set it to ', status(moved.new)] : []))
      break
    }
    case 'task.branch':
      say(` started branch ${quote(payload.name ?? '')} from `, task(event.taskId))
      break
    case 'task.merge':
      say(` merged ${plainTitle(lookups.tasks, result.branchId, 'an unknown branch')} into `, task(event.taskId))
      detail = detailLine(changes, lookups)
      break
    case 'task.link-commit': {
      const commit = payload.commit ?? {}
      const hash = String(commit.hash ?? result.commitHash ?? '').slice(0, 7)
      say(` linked commit ${hash} to `, task(event.taskId))
      const line = String(commit.message ?? '').split('\n')[0].trim()
      if (line) detail = quote(line.length > COMMIT_LIMIT ? `${line.slice(0, COMMIT_LIMIT)}…` : line)
      break
    }
    case 'task.link-vein':
      say(' added ', task(event.taskId), ' to vein ', vein(result.veinId))
      break
    case 'task.unlink-vein':
      say(' removed ', task(event.taskId), ' from vein ', vein(result.veinId))
      break
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
      else if (changes.length === 1 && first.field === 'title') { say(' renamed goal ', goal(result.goalId)); detail = `Was ${quote(first.old ?? '')}` }
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
      const id = result.actorId
      const name = own(lookups.actors, id) ? actorName(lookups.actors, id) : payload.displayName || payload.handle || id || 'an unknown actor'
      const kind = own(lookups.actors, id)?.kind ?? payload.kind
      const article = kind === 'agent' ? 'an agent' : 'a human'
      if (id && id === event.actorId) say(` joined as ${article}`)
      else say(` registered ${name} as ${article}`)
      break
    }
    default:
      say(` recorded ${event.type}`, ...(event.taskId ? [' on ', task(event.taskId)] : []))
  }

  if (['comment.add', 'comment.edit', 'comment.resolve', 'task.handoff'].includes(event.type)) {
    const found = excerptOf(event, lookups)
    excerpt = found.excerpt
    if (found.deleted) detail = DELETED_NOTE
  }
  return { actor, parts, detail, excerpt }
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
