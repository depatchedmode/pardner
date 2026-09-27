import {
  RECORDS, TASK_FIELDS, OperationError, actorRecord, canonical, checkActorNames, checkRevisions, commentAlternatives, commentDeleted,
  digest, fieldKey, identifier, linkActive, linkAlternatives, normalizeFields, normalizeRecordFields, object, plain, receiptKey,
  recordAlternatives, recordId, recordOf, recordState, requireValue, resolveActor, supersededRevisionKey, taskAlternatives, taskContext,
  taskRecord, taskView, text, veinLinkKey,
} from './workspace-schema.js'

const register = (value, event, extra = {}) => ({
  value: plain(value), operationId: event.operationId, actorId: event.actorId,
  replicaId: event.replicaId, timestamp: event.timestamp, ...extra,
})

function newTask(doc, fields, event, taskId) {
  const values = normalizeFields(doc, {
    description: '', priority: 'p2', status: 'backlog', assignee: null,
    tags: [], order: Date.parse(event.timestamp), type: 'task', ...fields,
  })
  text(values.title, 'Title')
  return {
    record: { id: taskId, actorId: event.actorId, created_at: event.timestamp },
    fields: Object.fromEntries(Object.entries(values).map(([field, value]) => [field, register(value, event)])),
  }
}

function writeTask(draft, task) {
  draft.tasks[task.record.id] = task.record
  for (const [field, value] of Object.entries(task.fields)) draft.taskFields[fieldKey(task.record.id, field)] = value
}

function supersedeRevisions(draft, field, revisions) {
  for (const revision of revisions) draft.supersededRevisions[supersededRevisionKey(field, revision)] = true
}

function branchOrigins(choices) {
  const branchBaseIds = [...new Set(choices.flatMap(record => record.branchBaseIds ?? []))].sort()
  return branchBaseIds.length ? { branchBaseIds } : {}
}

function fieldChanges(doc, taskId, updates, expected, allowConflict = false) {
  const task = taskView(doc, taskId)
  requireValue(Object.keys(updates).length > 0, 'Supply at least one task field')
  return Object.entries(updates).map(([field, value]) => {
    const choices = taskAlternatives(doc, taskId, field)
    const revisions = choices.map(record => record.operationId)
    checkRevisions(revisions, expected?.[field], allowConflict)
    return { field, old: task[field], new: value, revisions, origin: branchOrigins(choices) }
  })
}

function writeFields(draft, taskId, changes, event) {
  for (const change of changes) {
    const key = fieldKey(taskId, change.field)
    draft.taskFields[key] = register(change.new, event, change.origin)
    supersedeRevisions(draft, key, change.revisions)
  }
}

function mentionedActors(doc, message) {
  const handles = new Set([...message.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)].map(match => match[1].toLowerCase()))
  return Object.values(doc.actors).filter(actor => handles.has(actor.handle)).map(actor => actor.id).sort()
}

function commentParts(doc, taskId, message, event, recipient = null, commentId = recordId('comment', event.operationId)) {
  text(message, 'Comment')
  const recipients = [...new Set([...mentionedActors(doc, message), ...(recipient ? [recipient] : [])])].sort()
  const body = register(message, event, { mentionedActorIds: recipients })
  const mentions = recipients.map(toActorId => {
    const key = digest(canonical([commentId, toActorId]))
    return { id: `mention-${key}`, idempotency_key: key, taskId, commentId, toActorId,
      fromActorId: event.actorId, operationId: event.operationId, timestamp: event.timestamp }
  })
  return { commentId, body, mentions }
}

function writeComment(draft, taskId, parts, event) {
  draft.comments[parts.commentId] = {
    id: parts.commentId, taskId, actorId: event.actorId, created_at: event.timestamp,
  }
  draft.commentBodies[parts.commentId] = parts.body
  writeMentions(draft, parts.mentions)
}

function writeMentions(draft, mentions) {
  for (const mention of mentions) {
    if (!Object.hasOwn(draft.mentions, mention.id)) draft.mentions[mention.id] = mention
  }
}

function existingComment(doc, commentId) {
  identifier(commentId, 'Comment ID')
  const comment = Object.hasOwn(doc.comments, commentId) ? doc.comments[commentId] : null
  requireValue(comment && !commentDeleted(doc, commentId), `Comment not found: ${commentId}`, 'NOT_FOUND')
  return comment
}

function prepareActor(doc, payload, event) {
  const actor = actorRecord(payload)
  checkActorNames(Object.values(doc.actors), actor)
  return { result: { actorId: actor.id }, change: draft => { draft.actors[actor.id] = actor } }
}

function prepareCreate(doc, payload, event) {
  const taskId = recordId('task', event.operationId)
  const { veinIds = [], ...fields } = object(payload, 'Task fields')
  requireValue(Array.isArray(veinIds), 'veinIds must be a list of vein IDs')
  const veins = [...new Set(veinIds)].map(veinId => recordOf(doc, 'vein', veinId).id)
  const task = newTask(doc, fields, event, taskId)
  return { taskId, records: [taskId, ...veins], result: { taskId, ...(veins.length ? { veinIds: veins } : {}) },
    changes: Object.entries(task.fields).map(([field, record]) => ({ field, old: null, new: record.value })),
    change: draft => {
      writeTask(draft, task)
      for (const veinId of veins) draft.veinLinks[veinLinkKey(taskId, veinId)] = register(true, event)
    } }
}

function writeRecord(draft, kind, id, values, event) {
  const { collection, container } = RECORDS[kind]
  draft[collection][id] = { id, actorId: event.actorId, created_at: event.timestamp }
  for (const [field, value] of Object.entries(values)) draft[container][fieldKey(id, field)] = register(value, event)
}

function newRecordValues(doc, kind, fields) {
  const values = normalizeRecordFields(doc, kind, { description: '', status: 'open', ...fields })
  text(values.title, 'Title')
  return values
}

const createdChanges = values => Object.entries(values).map(([field, value]) => ({ field, old: null, new: value }))

function recordChanges(doc, kind, id, updates, expected, allowConflict = false) {
  const current = recordState(doc, kind, id).record
  requireValue(Object.keys(updates).length > 0, `Supply at least one ${kind} field`)
  return Object.entries(updates).map(([field, value]) => {
    const revisions = recordAlternatives(doc, kind, id, field).map(record => record.operationId)
    checkRevisions(revisions, expected?.[field], allowConflict)
    return { field, old: current[field], new: value, revisions }
  })
}

function writeRecordFields(draft, kind, id, changes, event) {
  for (const change of changes) {
    const key = fieldKey(id, change.field)
    draft[RECORDS[kind].container][key] = register(change.new, event)
    supersedeRevisions(draft, key, change.revisions)
  }
}

function prepareGoalCreate(doc, payload, event) {
  const goalId = recordId('goal', event.operationId)
  const values = newRecordValues(doc, 'goal', payload)
  return { records: [goalId], result: { goalId }, changes: createdChanges(values), change: draft => writeRecord(draft, 'goal', goalId, values, event) }
}

function prepareVeinCreate(doc, payload, event) {
  const { goal, ...fields } = object(payload, 'Vein fields')
  requireValue(Boolean(goal) !== Object.hasOwn(fields, 'goalId'), 'Every vein pursues a goal: supply goalId or a new goal', 'GOAL_REQUIRED')
  const veinId = recordId('vein', event.operationId)
  const newGoal = goal ? { goalId: recordId('goal', event.operationId), values: newRecordValues(doc, 'goal', object(goal, 'Goal')) } : null
  const values = newGoal ? { ...newRecordValues(doc, 'vein', fields), goalId: newGoal.goalId } : newRecordValues(doc, 'vein', fields)
  return { records: [veinId, values.goalId], result: { veinId, goalId: values.goalId, ...(newGoal ? { createdGoal: true } : {}) },
    changes: createdChanges(values),
    change: draft => {
      if (newGoal) writeRecord(draft, 'goal', newGoal.goalId, newGoal.values, event)
      writeRecord(draft, 'vein', veinId, values, event)
    } }
}

function recordEdit(kind, resolving = false) {
  const key = `${kind}Id`
  return (doc, payload, event) => {
    const id = recordOf(doc, kind, payload[key]).id
    if (resolving) requireValue(RECORDS[kind].fields.includes(payload.field), `Choose a valid ${kind} field to resolve`)
    const updates = normalizeRecordFields(doc, kind, resolving ? { [payload.field]: payload.value } : payload.updates)
    const expected = resolving ? { [payload.field]: payload.expectedRevisions } : payload.expectedRevisions
    const changes = recordChanges(doc, kind, id, updates, expected, resolving)
    // A vein moving between goals belongs to both goals' history.
    const goals = changes.filter(change => change.field === 'goalId').flatMap(change => [change.old, change.new])
    return { records: [id, ...goals], result: { [key]: id }, changes, change: draft => writeRecordFields(draft, kind, id, changes, event) }
  }
}

function linkChange(linking) {
  return (doc, payload, event) => {
    const taskId = taskRecord(doc, payload.taskId).id
    const veinId = recordOf(doc, 'vein', payload.veinId).id
    const links = linkAlternatives(doc, taskId, veinId)
    const revisions = links.map(record => record.operationId)
    if (!linking) {
      requireValue(linkActive(links), 'This task is not part of that vein', 'NOT_FOUND')
      checkRevisions(revisions, payload.expectedRevisions, true)
    }
    const key = veinLinkKey(taskId, veinId)
    return { taskId, records: [taskId, veinId], result: { taskId, veinId }, change: draft => {
      draft.veinLinks[key] = register(linking, event)
      supersedeRevisions(draft, key, revisions)
    } }
  }
}

function prepareUpdate(doc, payload, event) {
  const updates = normalizeFields(doc, payload.updates)
  const changes = fieldChanges(doc, payload.taskId, updates, payload.expectedRevisions)
  return { taskId: payload.taskId, result: { taskId: payload.taskId }, changes,
    change: draft => writeFields(draft, payload.taskId, changes, event) }
}

function prepareResolve(doc, payload, event) {
  requireValue(TASK_FIELDS.includes(payload.field), 'Choose a valid task field to resolve')
  const updates = normalizeFields(doc, { [payload.field]: payload.value })
  const changes = fieldChanges(doc, payload.taskId, updates, { [payload.field]: payload.expectedRevisions }, true)
  return { taskId: payload.taskId, result: { taskId: payload.taskId }, changes,
    change: draft => writeFields(draft, payload.taskId, changes, event) }
}

function prepareHandoff(doc, payload, event) {
  const recipient = resolveActor(doc, payload.to)
  const updates = normalizeFields(doc, { assignee: recipient.id, status: payload.status })
  const changes = fieldChanges(doc, payload.taskId, updates, payload.expectedRevisions)
  const parts = commentParts(doc, payload.taskId, payload.message, event, recipient.id)
  return { taskId: payload.taskId, result: { taskId: payload.taskId, commentId: parts.commentId, mentionIds: parts.mentions.map(mention => mention.id) }, changes,
    change: draft => {
      writeFields(draft, payload.taskId, changes, event)
      writeComment(draft, payload.taskId, parts, event)
    } }
}

function prepareComment(doc, payload, event) {
  taskRecord(doc, payload.taskId)
  const parts = commentParts(doc, payload.taskId, payload.text, event)
  return { taskId: payload.taskId, result: { taskId: payload.taskId, commentId: parts.commentId, mentionIds: parts.mentions.map(mention => mention.id) },
    change: draft => writeComment(draft, payload.taskId, parts, event) }
}

function prepareCommentEdit(doc, payload, event) {
  const comment = existingComment(doc, payload.commentId)
  const choices = commentAlternatives(doc, comment.id)
  checkRevisions(choices.map(record => record.operationId), payload.expectedRevisions, event.type === 'comment.resolve')
  const parts = commentParts(doc, comment.taskId, payload.text, event, null, comment.id)
  return { taskId: comment.taskId, result: { taskId: comment.taskId, commentId: comment.id },
    change: draft => {
      draft.commentBodies[comment.id] = parts.body
      supersedeRevisions(draft, comment.id, choices.map(record => record.operationId))
      writeMentions(draft, parts.mentions)
    } }
}

function prepareCommentDelete(doc, payload, event) {
  const comment = existingComment(doc, payload.commentId)
  checkRevisions(commentAlternatives(doc, comment.id).map(record => record.operationId), payload.expectedRevisions)
  return { taskId: comment.taskId, result: { taskId: comment.taskId, commentId: comment.id },
    change: draft => { draft.deletedComments[comment.id] = true } }
}

function prepareRead(doc, payload, event) {
  taskRecord(doc, payload.taskId)
  requireValue(Array.isArray(payload.comments), 'Supply the observed comment revisions')
  const receipts = payload.comments.map(value => {
    object(value, 'Comment receipt')
    identifier(value.commentId, 'Comment ID')
    identifier(value.revisionId, 'Comment revision')
    const comment = doc.comments[value.commentId]
    const operation = doc.operations[value.revisionId]
    requireValue(comment?.taskId === payload.taskId && operation?.result?.commentId === value.commentId,
      'A read receipt must refer to an observed revision of this task’s comment')
    return { key: receiptKey(event.actorId, value.commentId, value.revisionId),
      value: { actorId: event.actorId, commentId: value.commentId, revisionId: value.revisionId } }
  })
  return { taskId: payload.taskId, result: { taskId: payload.taskId, receipts: receipts.length },
    change: draft => { for (const receipt of receipts) draft.readReceipts[receipt.key] = receipt.value } }
}

function prepareCommit(doc, payload) {
  taskRecord(doc, payload.taskId)
  object(payload.commit, 'Commit')
  requireValue(typeof payload.commit.hash === 'string' && /^[a-f0-9]{7,40}$/i.test(payload.commit.hash), 'Supply a git commit hash')
  text(payload.commit.message, 'Commit message')
  return { taskId: payload.taskId, result: { taskId: payload.taskId, commitHash: payload.commit.hash }, change: () => {} }
}

function prepareBranch(doc, payload, event) {
  const context = taskContext(doc, payload.taskId)
  requireValue(Object.keys(context.conflicts).length === 0, 'Resolve parent task conflicts before branching', 'CONFLICT_REQUIRES_RESOLUTION')
  text(payload.name, 'Branch name')
  const taskId = recordId('task', event.operationId)
  const base = Object.fromEntries(TASK_FIELDS.map(field => [field, context.task[field]]))
  const baseId = digest(canonical(base))
  const task = newTask(doc, base, event, taskId)
  task.record.branch = { parentId: payload.taskId, name: payload.name }
  // A retried creation may observe another parent state. Keep the matching base
  // with each field revision, independently of the metadata's CRDT winner.
  for (const record of Object.values(task.fields)) record.branchBaseIds = [baseId]
  return { taskId: payload.taskId, records: [payload.taskId, taskId], result: { taskId, branchId: taskId, parentId: payload.taskId },
    change: draft => {
      if (!Object.hasOwn(draft.branchBases, baseId)) draft.branchBases[baseId] = base
      writeTask(draft, task)
    } }
}

function prepareMerge(doc, payload, event) {
  const branch = taskRecord(doc, payload.branchId)
  requireValue(branch.branch && !taskView(doc, payload.branchId).merged, 'Choose an unmerged branch', 'INVALID_BRANCH')
  const parentId = branch.branch.parentId
  const parent = taskView(doc, parentId)
  const { task: branchTask, conflicts } = taskContext(doc, payload.branchId)
  requireValue(Object.keys(conflicts).length === 0, 'Resolve branch conflicts before merging', 'CONFLICT_REQUIRES_RESOLUTION')
  const updates = {}
  for (const field of TASK_FIELDS) {
    if (field === 'order') continue
    const [revision] = taskAlternatives(doc, branch.id, field)
    const baseValues = revision.branchBaseIds.map(id => canonical(doc.branchBases[id][field]))
    const branchValue = canonical(branchTask[field])
    if (baseValues.every(base => branchValue === base)) continue
    const parentValue = canonical(parent[field])
    requireValue(parentValue === branchValue || baseValues.every(base => parentValue === base),
      `Both the parent and branch changed ${field}; reconcile them before merging`, 'BRANCH_CONFLICT', { field, parent: parent[field], branch: branchTask[field] })
    updates[field] = branchTask[field]
  }
  const changes = Object.keys(updates).length ? fieldChanges(doc, parentId, updates, payload.expectedRevisions) : []
  const branchStatus = taskAlternatives(doc, branch.id, 'status')
  return { taskId: parentId, records: [parentId, branch.id], result: { taskId: parentId, parentId, branchId: branch.id }, changes,
    change: draft => {
      writeFields(draft, parentId, changes, event)
      draft.mergedBranches[branch.id] = true
      const key = fieldKey(branch.id, 'status')
      draft.taskFields[key] = register('completed', event, branchOrigins(branchStatus))
      supersedeRevisions(draft, key, branchStatus.map(record => record.operationId))
    } }
}

const handlers = {
  'actor.register': prepareActor, 'task.create': prepareCreate, 'task.update': prepareUpdate,
  'task.resolve': prepareResolve, 'task.handoff': prepareHandoff, 'comment.add': prepareComment,
  'comment.edit': prepareCommentEdit, 'comment.resolve': prepareCommentEdit, 'comment.delete': prepareCommentDelete,
  'read.mark': prepareRead, 'task.link-commit': prepareCommit, 'task.branch': prepareBranch, 'task.merge': prepareMerge,
  'goal.create': prepareGoalCreate, 'goal.update': recordEdit('goal'), 'goal.resolve': recordEdit('goal', true),
  'vein.create': prepareVeinCreate, 'vein.update': recordEdit('vein'), 'vein.resolve': recordEdit('vein', true),
  'task.link-vein': linkChange(true), 'task.unlink-vein': linkChange(false),
}

export function prepareOperation(doc, request, { replicaId, timestamp }) {
  object(request, 'Operation')
  const operationId = identifier(request.operationId, 'Operation ID')
  const payload = plain(object(request.payload, 'Operation payload'))
  const handler = Object.hasOwn(handlers, request.type) ? handlers[request.type] : null
  requireValue(handler, `Unknown operation type: ${request.type}`)
  const isBootstrap = request.type === 'actor.register' && Object.keys(doc.actors).length === 0 && request.actorId === payload.id
  const actorId = isBootstrap ? actorRecord(payload).id : resolveActor(doc, request.actorId).id
  const fingerprint = digest(canonical({ type: request.type, actorId, payload }))
  const existing = Object.hasOwn(doc.operations, operationId) ? doc.operations[operationId] : null
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new OperationError('OPERATION_ID_REUSED', 'This operation ID already belongs to a different request')
    return { event: plain(existing), replayed: true }
  }
  const event = { operationId, type: request.type, actorId, replicaId, timestamp, fingerprint, payload }
  const prepared = handler(doc, payload, event)
  if (prepared.taskId) event.taskId = prepared.taskId
  event.recordIds = [...new Set(prepared.records ?? (prepared.taskId ? [prepared.taskId] : []))]
  event.changes = (prepared.changes ?? []).map(({ field, old, new: value }) => ({ field, old, new: value }))
  event.result = prepared.result
  return { event, replayed: false, change: draft => {
    prepared.change(draft)
    draft.operations[operationId] = event
  } }
}
