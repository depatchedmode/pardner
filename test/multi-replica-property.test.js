import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { OperationError, commentView, issueLinkIndex, linkAlternatives, plain, recordState, taskState } from '../lib/workspace-schema.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { ALICE, BOB, actorsOf, board, signedByActor } from '../support/activity-fixture.js'

// Rule: honest work is never flagged. Over seeded random histories of several replicas working as the real write path
// does (offline periods, concurrent edits of one field, comments and links, retries of one request on two replicas,
// branches and merges, conflicts resolved, then merges), no entry on any replica needs review.

const SEEDS = Number(process.env.PARDNER_REPLICA_SEEDS ?? 12)
const STEPS = Number(process.env.PARDNER_REPLICA_STEPS ?? 160)

function random(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
}

// Two machines of Alice's (one also runs her Builder agent) and two of Bob's, each with its own Automerge actor.
const REPLICAS = [
  { name: 'alice-laptop', actor: `${ALICE}${'11'.repeat(8)}`, actorIds: ['alice'] },
  { name: 'alice-desktop', actor: `${ALICE}${'12'.repeat(8)}`, actorIds: ['alice', 'builder'] },
  { name: 'bob-laptop', actor: `${BOB}${'21'.repeat(8)}`, actorIds: ['bob'] },
  { name: 'bob-desktop', actor: `${BOB}${'22'.repeat(8)}`, actorIds: ['bob'] },
]
const HANDLES = ['alice', 'bob', 'builder', 'scout', 'scouter']
const STATUSES = ['backlog', 'up-next', 'in-progress', 'review', 'completed']
const WORDS = ['plan', 'draft', 'check', 'ship', 'review', 'fix', 'note', 'idea']

/** One replica's history: its own document, its Automerge actor, the Actors it acts as, and whether it is online. */
function replicas(start) {
  return REPLICAS.map(replica => ({ ...replica, doc: A.clone(start, { actor: replica.actor }), online: true, clock: 0 }))
}

/** A generator of plausible requests for one replica's board as it now is. */
function requests(rand) {
  const pick = list => list[Math.floor(rand() * list.length)]
  // Most work lands on a few busy records, so replicas often edit one field concurrently.
  const busy = list => (rand() < 0.6 ? list[Math.floor(rand() * Math.min(2, list.length))] : pick(list))
  const words = (n = 2) => Array.from({ length: n }, () => pick(WORDS)).join(' ')
  const mention = () => (rand() < 0.4 ? ` @${pick(HANDLES)}` : '')
  const ids = map => Object.keys(map ?? {})
  return (doc, actorId) => {
    const tasks = ids(doc.tasks), goals = ids(doc.goals), veins = ids(doc.veins)
    const comments = ids(doc.comments).filter(id => !doc.deletedComments[id])
    const own = comments.filter(id => plain(doc.comments[id]).actorId === actorId)
    const choices = []
    // An agent registered on one replica, sometimes also on another while they are apart: one ID twice (with one handle
    // or two), or one handle under two IDs.
    if (rand() < 0.05) choices.push(() => ({ type: 'actor.register', payload: { id: `agent-scout-${Math.floor(rand() * 2)}`, handle: pick(['scout', 'scouter']), kind: 'agent', displayName: 'Scout' } }))
    choices.push(() => ({ type: 'task.create', payload: { title: `Task ${words()}`, ...(veins.length && rand() < 0.3 ? { veinIds: [pick(veins)] } : {}) } }))
    choices.push(() => ({ type: 'goal.create', payload: { title: `Goal ${words()}` } }))
    if (goals.length) choices.push(() => ({ type: 'vein.create', payload: { title: `Vein ${words()}`, goalId: pick(goals) } }))
    if (tasks.length) {
      const taskId = busy(tasks)
      const state = taskState(doc, taskId)
      const field = rand() < 0.5 ? pick(['title', 'status']) : pick(['title', 'description', 'status', 'priority', 'assignee', 'tags', 'order'])
      const value = { title: `Title ${words()}`, description: words(4), status: pick(STATUSES), priority: pick(['p0', 'p1', 'p2', 'p3']),
        assignee: rand() < 0.2 ? null : pick(HANDLES), tags: [pick(WORDS), pick(WORDS)], order: Math.floor(rand() * 1000) }[field]
      // A conflict is usually resolved when it is seen: to a new value, or to the one shown.
      if (Object.hasOwn(state.conflicts, field)) {
        const resolve = { type: 'task.resolve', payload: { taskId, field, value: rand() < 0.5 ? value : state.task[field], expectedRevisions: state.revisions[field] } }
        if (rand() < 0.7) return { ...resolve, actorId }
        choices.push(() => resolve)
      } else {
        choices.push(() => ({ type: 'task.update', payload: { taskId, updates: { [field]: value }, expectedRevisions: { [field]: state.revisions[field] } } }))
        choices.push(() => ({ type: 'task.update', payload: { taskId, updates: { [field]: state.task[field] }, expectedRevisions: { [field]: state.revisions[field] } } }))
      }
      choices.push(() => ({ type: 'task.handoff', payload: { taskId, to: pick(HANDLES), status: pick(STATUSES), message: `Over to you${mention()}`,
        expectedRevisions: { assignee: state.revisions.assignee, status: state.revisions.status } } }))
      choices.push(() => ({ type: 'comment.add', payload: { taskId, text: `${words(3)}${mention()}` } }))
      choices.push(() => ({ type: 'task.link-commit', payload: { taskId, commit: { hash: 'abcdef1234567'.slice(0, 7 + Math.floor(rand() * 6)), message: words(3) } } }))
      choices.push(() => ({ type: 'task.link-issue', payload: { taskId, repository: 'example/pardner', number: 1 + Math.floor(rand() * 3) } }))
      const links = issueLinkIndex(doc)[taskId] ?? []
      if (links.length) { const link = pick(links); choices.push(() => ({ type: 'task.unlink-issue', payload: { taskId, repository: link.repository, number: link.number, expectedRevisions: link.revisions } })) }
      if (!state.task.branch_of) choices.push(() => ({ type: 'task.branch', payload: { taskId, name: words(1) } }))
      if (state.task.branch_of && !state.task.merged) {
        const parent = taskState(doc, state.task.branch_of).revisions
        choices.push(() => ({ type: 'task.merge', payload: { branchId: taskId, expectedRevisions: parent } }))
      }
      if (veins.length) {
        const veinId = pick(veins)
        const linked = linkAlternatives(doc, taskId, veinId)
        choices.push(() => ({ type: 'task.link-vein', payload: { taskId, veinId } }))
        if (linked.some(link => link.value === true)) choices.push(() => ({ type: 'task.unlink-vein', payload: { taskId, veinId, expectedRevisions: linked.map(link => link.operationId) } }))
      }
      const visible = comments.filter(id => plain(doc.comments[id]).taskId === taskId)
      if (visible.length) {
        const view = commentView(doc, pick(visible))
        choices.push(() => ({ type: 'read.mark', payload: { taskId, comments: [{ commentId: view.id, revisionId: view.revisionId }] } }))
      }
    }
    if (own.length) {
      const view = commentView(doc, busy(own))
      if (view.conflicts.length) choices.push(() => ({ type: 'comment.resolve', payload: { commentId: view.id, text: rand() < 0.5 ? view.content : `${words(3)}${mention()}`, expectedRevisions: view.revisionIds } }))
      else choices.push(() => ({ type: 'comment.edit', payload: { commentId: view.id, text: `${words(3)}${mention()}`, expectedRevisions: view.revisionIds } }))
      if (rand() < 0.3) choices.push(() => ({ type: 'comment.delete', payload: { commentId: view.id, expectedRevisions: view.revisionIds } }))
    }
    for (const [kind, list] of [['goal', goals], ['vein', veins]]) {
      if (!list.length) continue
      const id = busy(list)
      const state = recordState(doc, kind, id)
      const field = pick(kind === 'goal' ? ['title', 'status', 'description'] : ['title', 'status', 'description', 'goalId'])
      if (field === 'goalId' && !goals.length) continue
      const value = { title: `${kind} ${words()}`, description: words(4), status: kind === 'goal' ? pick(['open', 'achieved', 'abandoned']) : pick(['open', 'proven', 'abandoned']), goalId: pick(goals) }[field]
      if (Object.hasOwn(state.conflicts, field)) {
        const resolve = { type: `${kind}.resolve`, payload: { [`${kind}Id`]: id, field, value: rand() < 0.5 ? value : state.record[field], expectedRevisions: state.revisions[field] } }
        if (rand() < 0.7) return { ...resolve, actorId }
        choices.push(() => resolve)
      }
      else choices.push(() => ({ type: `${kind}.update`, payload: { [`${kind}Id`]: id, updates: { [field]: value }, expectedRevisions: { [field]: state.revisions[field] } } }))
    }
    return { ...pick(choices)(), actorId }
  }
}

/** Runs `request` on `replica` as its write path would: one change, or nothing when the write path refuses it. */
function perform(replica, request, operationId) {
  let prepared
  try {
    prepared = prepareOperation(replica.doc, { ...request, operationId }, { replicaId: `replica-${replica.name}`, timestamp: new Date(Date.UTC(2026, 10, 1, 9) + replica.clock++ * 1000).toISOString() })
  } catch (error) {
    if (error instanceof OperationError || error?.code) return null
    throw error
  }
  if (prepared.replayed) return null
  replica.doc = A.change(replica.doc, prepared.change)
  return A.getHeads(replica.doc)[0]
}

/** Every online replica exchanges everything with every other, as through the hub. */
function syncOnline(all) {
  const online = all.filter(replica => replica.online)
  if (online.length < 2) return
  let merged = online[0].doc
  for (const replica of online.slice(1)) merged = A.merge(A.clone(merged), replica.doc)
  for (const replica of online) replica.doc = A.merge(replica.doc, merged)
}

function history(seed) {
  const rand = random(seed)
  const all = replicas(board().doc)
  const next = requests(rand)
  let count = 0, retries = 0, refused = 0
  const later = []
  for (let step = 0; step < STEPS; step++) {
    const roll = rand()
    if (roll < 0.08) {
      // An offline period begins or ends; at least one replica stays online.
      const replica = all[Math.floor(rand() * all.length)]
      if (!replica.online || all.filter(other => other.online).length > 1) replica.online = !replica.online
    } else if (roll < 0.25) syncOnline(all)
    else {
      const replica = all[Math.floor(rand() * all.length)]
      const actorId = replica.actorIds[Math.floor(rand() * replica.actorIds.length)]
      let request
      try { request = next(replica.doc, actorId) } catch (error) { if (error instanceof OperationError) continue; throw error }
      const operationId = `op-${seed}-${count++}`
      if (!perform(replica, request, operationId)) { refused++; continue }
      // The same request retried on another of the Actor's replicas, as a client does when its first answer is lost:
      // at once, or a few steps later, against whatever that replica's board then holds.
      if (rand() < 0.15) {
        const twins = all.filter(other => other !== replica && other.actorIds.includes(actorId))
        const twin = twins[Math.floor(rand() * twins.length)]
        if (twin) later.push({ at: step + (rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 12)), twin, request, operationId })
      }
    }
    for (const retry of later.filter(item => item.at <= step)) {
      later.splice(later.indexOf(retry), 1)
      if (perform(retry.twin, retry.request, retry.operationId)) retries++
    }
  }
  for (const replica of all) replica.online = true
  syncOnline(all)
  return { all, retries, refused }
}

const view = doc => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf, recordValid: () => true })

test('seeded histories of four replicas working offline, concurrently and with retries flag nothing', { timeout: 600000 }, () => {
  let entries = 0, retries = 0, concurrent = 0, resolved = 0, joined = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { all, retries: retried } = history(seed)
    retries += retried
    const [{ doc }] = all
    for (const replica of all) assert.deepEqual(A.getHeads(replica.doc).sort(), A.getHeads(doc).sort(), `seed ${seed}: the replicas did not converge`)
    concurrent += A.getChangesMetaSince(doc, []).filter(meta => meta.deps.length > 1).length
    const shown = view(doc)
    entries += shown.length
    resolved += shown.filter(entry => entry.event?.type?.endsWith('.resolve')).length
    joined += shown.filter(entry => entry.changes.length > 1).length
    // Every replica derives the same entries from the same changes, whichever it holds them in.
    if (seed % 6 === 0) assert.deepEqual(view(all.at(-1).doc), shown, `seed ${seed}: another replica shows other entries`)
    const flagged = shown.filter(entry => entry.review).map(entry => ({ type: entry.event?.type ?? entry.kind, flags: entry.flags,
      differences: entry.changes.flatMap(change => change.mismatch ?? []).map(item => item.text) }))
    assert.deepEqual(flagged, [], `seed ${seed}: honest work is flagged`)
  }
  // The histories are what the rule is about: concurrent work, merges and retries, not one replica alone.
  assert.ok(retries >= SEEDS, `only ${retries} retries`)
  assert.ok(concurrent >= SEEDS, `only ${concurrent} merges of concurrent work`)
  assert.ok(entries > SEEDS * 40, `only ${entries} entries`)
  assert.ok(resolved > 0 && joined > 0, `only ${resolved} conflicts resolved and ${joined} retries shown as one entry`)
})
