import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { atomicWrite } from '../lib/atomic-file.js'
import { canonical } from '../lib/workspace-schema.js'

export const reviewerActors = ['reviewer-a', 'reviewer-b']

export function reviewRound({ runId, round, commitSha, sourceSha256, taskIds }) {
  assert.ok(typeof runId === 'string' && runId.length)
  assert.ok([1, 2].includes(round), 'The fixture has exactly two bounded review rounds')
  assert.match(commitSha, /^[a-f0-9]{40}$/)
  assert.match(sourceSha256, /^[a-f0-9]{64}$/)
  assert.ok(reviewerActors.every(actor => typeof taskIds[actor] === 'string' && taskIds[actor].length))
  assert.notEqual(taskIds[reviewerActors[0]], taskIds[reviewerActors[1]], 'Reviewers need distinct tasks')
  return { runId, round, commitSha, sourceSha256, taskIds: { ...taskIds } }
}

// Project only this fixture's two named, attributed reviews. A receipt or turn ID
// is deliberately not an input to the review barrier.
export function collectReviews(round, contexts) {
  const accepted = {}, ambiguous = new Set(), rejected = [], duplicates = []
  for (const actor of reviewerActors) {
    const context = contexts[actor]
    assert.equal(context.task.id, round.taskIds[actor])
    for (const comment of context.comments) {
      let result
      try { result = JSON.parse(comment.content) } catch { continue }
      if (result?.kind !== 'review-result') continue
      let reason
      if (comment.actorId !== actor || result.actor !== actor || (comment.editedBy && comment.editedBy !== actor)) reason = 'wrong reviewer attribution'
      else if (comment.conflicts?.length || comment.deleted) reason = 'conflicted or deleted result'
      else if (result.runId !== round.runId || result.round !== round.round
        || result.commitSha !== round.commitSha || result.sourceSha256 !== round.sourceSha256) reason = 'stale or unrelated revision'
      else if (result.recipient !== '@builder') reason = 'result must address the implementer'
      else if (!['approve', 'changes-requested'].includes(result.verdict)
        || !Array.isArray(result.findings) || !result.findings.every(value => typeof value === 'string')
        || (result.verdict === 'changes-requested' && !result.findings.length)
        || (result.verdict === 'approve' && result.findings.length)) reason = 'invalid verdict or findings'
      else if (typeof result.testEvidence?.command !== 'string' || !result.testEvidence.command.length
        || typeof result.testEvidence.output !== 'string' || !result.testEvidence.output.length
        || typeof result.testEvidence.passed !== 'boolean'
        || (result.verdict === 'approve' && !result.testEvidence.passed)) reason = 'missing independent test evidence'
      else if (typeof result.cwd !== 'string' || !result.cwd.length) reason = 'missing worktree attribution'
      if (reason) { rejected.push({ commentId: comment.id, actor, reason }); continue }
      const previous = accepted[actor]
      if (previous) {
        // Operation retries and repeated identical assessments count once. A
        // different assessment of the same revision requires reconciliation.
        if (canonical(previous.result) === canonical(result)) duplicates.push(comment.id)
        else { ambiguous.add(actor); rejected.push({ commentId: comment.id, actor, reason: 'ambiguous reviewer results' }) }
      } else accepted[actor] = { commentId: comment.id, result }
    }
  }
  const complete = reviewerActors.every(actor => accepted[actor] && !ambiguous.has(actor))
  return { accepted, rejected, duplicates, ambiguous: [...ambiguous], complete,
    approved: complete && reviewerActors.every(actor => accepted[actor].result.verdict === 'approve') }
}

export function nextReviewAction(round, assessment) {
  if (!assessment.complete) return 'wait'
  // Round one always collects both independent assessments before the declared
  // phase-two requirement is introduced. No artificial bug is needed.
  if (round.round === 1) return 'correct'
  return assessment.approved ? 'human-review' : 'blocked'
}

export function remainingModelTime(deadline, now = Date.now()) {
  assert.ok(deadline > now, 'The declared model-workflow deadline expired')
  return deadline - now
}

export async function readWithinConvergence(read, { timeoutMs, intervalMs = 500, onError = () => {} }) {
  const deadline = Date.now() + timeoutMs
  const expired = () => new Error('Read convergence deadline expired')
  let lastError
  while (Date.now() < deadline) {
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { const error = expired(); reject(error); controller.abort(error) }, deadline - Date.now())
    })
    try {
      const value = await Promise.race([read(controller.signal), timeout])
      if (Date.now() >= deadline) throw expired()
      return value
    } catch (error) {
      lastError = error
      await onError(error)
    } finally { clearTimeout(timer) }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw lastError
    if (intervalMs >= remaining) { await delay(remaining); throw lastError }
    await delay(intervalMs)
  }
  throw lastError ?? expired()
}

// Persist exact CLI arguments before submission, including revisions. Replaying
// a deterministic operation ID with freshly read revisions changes its payload.
// One coordinator owns this directory; this is a bounded rehearsal outbox.
export async function submitOnce(directory, key, makeArgs, submit) {
  assert.match(key, /^[a-z0-9-]+$/)
  const path = join(directory, `${key}.json`)
  let entry
  try { entry = JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    entry = { args: await makeArgs() }
    await atomicWrite(path, JSON.stringify(entry))
  }
  if (!Object.hasOwn(entry, 'result')) {
    entry.result = await submit(entry.args)
    await atomicWrite(path, JSON.stringify(entry))
  }
  return entry.result
}
