import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { reviewRound, collectReviews, nextReviewAction, submitOnce, reviewerActors, remainingModelTime, readWithinConvergence } from '../support/three-agent-review.js'

const taskIds = { 'reviewer-a': 'task-a', 'reviewer-b': 'task-b' }
const round = reviewRound({ runId: 'fixture', round: 1, commitSha: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), taskIds })
function result(actor, overrides = {}) {
  return { kind: 'review-result', runId: round.runId, round: round.round, actor, commitSha: round.commitSha,
    sourceSha256: round.sourceSha256, recipient: '@builder', cwd: `/fixture/${actor}`, verdict: 'approve', findings: [],
    testEvidence: { command: 'node --test reviewer.test.mjs', output: 'Independent tests passed', passed: true }, ...overrides }
}
function contexts(results = {}) {
  return Object.fromEntries(reviewerActors.map(actor => [actor, { task: { id: taskIds[actor] },
    comments: (results[actor] ?? []).map((value, index) => ({ id: `${actor}-${index}`, actorId: actor, content: JSON.stringify(value) })) }]))
}

it('requires both independent same-revision assessments before correction or human review', () => {
  const one = collectReviews(round, contexts({ 'reviewer-a': [result('reviewer-a')] }))
  assert.equal(one.complete, false)
  assert.equal(nextReviewAction(round, one), 'wait')
  const both = collectReviews(round, contexts({ 'reviewer-a': [result('reviewer-a')], 'reviewer-b': [result('reviewer-b')] }))
  assert.equal(both.approved, true)
  assert.equal(nextReviewAction(round, both), 'correct')
})

it('new commits invalidate earlier approvals and reject late old-SHA and wrong-round results', () => {
  const final = reviewRound({ ...round, round: 2, commitSha: 'c'.repeat(40), sourceSha256: 'd'.repeat(64) })
  const fresh = actor => result(actor, { round: 2, commitSha: final.commitSha, sourceSha256: final.sourceSha256 })
  const old = collectReviews(final, contexts({ 'reviewer-a': [result('reviewer-a'), fresh('reviewer-a')], 'reviewer-b': [result('reviewer-b')] }))
  assert.equal(old.complete, false)
  assert.equal(old.rejected.length, 2)
  assert.equal(nextReviewAction(final, old), 'wait')
  const complete = collectReviews(final, contexts({ 'reviewer-a': [fresh('reviewer-a')], 'reviewer-b': [fresh('reviewer-b')] }))
  assert.equal(nextReviewAction(final, complete), 'human-review')
})

it('duplicate results cannot impersonate a second reviewer or resolve contradictory evidence', () => {
  const a = result('reviewer-a')
  const reordered = Object.fromEntries(Object.entries(a).reverse())
  const duplicates = collectReviews(round, contexts({ 'reviewer-a': [a, reordered] }))
  assert.equal(duplicates.duplicates.length, 1)
  assert.equal(duplicates.complete, false)
  const conflict = collectReviews(round, contexts({ 'reviewer-a': [a, result('reviewer-a', { verdict: 'changes-requested', findings: ['A failing case'] })], 'reviewer-b': [result('reviewer-b')] }))
  assert.deepEqual(conflict.ambiguous, ['reviewer-a'])
  assert.equal(conflict.complete, false)
})

it('uses the remaining overall model budget for pending acknowledgments without extending it', () => {
  assert.equal(remainingModelTime(1200000, 410000), 790000)
  assert.throws(() => remainingModelTime(1200000, 1200000), /deadline expired/)
  assert.throws(() => remainingModelTime(1200000, 1200001), /deadline expired/)
})

it('retains a failed read observation and recovers synchronized context within a bounded interval', async () => {
  let calls = 0
  const observations = []
  const context = { task: { id: 'parent' }, comments: [{ content: 'current context' }] }
  const actual = await readWithinConvergence(async () => {
    calls++; if (calls === 1) throw new Error('Local read temporarily unavailable'); return context
  }, { timeoutMs: 1000, intervalMs: 1, onError: error => observations.push(error.message) })
  assert.equal(actual, context)
  assert.equal(calls, 2)
  assert.deepEqual(observations, ['Local read temporarily unavailable'])
})

it('a read deadline surfaces the original failure rather than accepting absent context', async () => {
  const error = new Error('Read remains unavailable')
  await assert.rejects(readWithinConvergence(async () => { throw error }, { timeoutMs: 10, intervalMs: 20 }), actual => actual === error)
})

it('an expired read interval never starts a read', async () => {
  let calls = 0
  await assert.rejects(readWithinConvergence(async () => { calls++; return 'late' }, { timeoutMs: 0 }), /deadline expired/)
  assert.equal(calls, 0)
})

it('late successful reads are aborted and cannot satisfy context convergence', async () => {
  let signal
  const result = readWithinConvergence(async received => { signal = received; await delay(50); return 'late context' }, { timeoutMs: 10 })
  await assert.rejects(result, /deadline expired/)
  assert.equal(signal.aborted, true)
})

it('retry delay reaching expiry cannot start another read', async () => {
  let calls = 0
  const error = new Error('Read unavailable')
  await assert.rejects(readWithinConvergence(async () => { calls++; throw error }, { timeoutMs: 10, intervalMs: 20 }), actual => actual === error)
  assert.equal(calls, 1)
})

it('rejects misattribution, absent recipient, bad evidence, unrelated runs and conflicted comments', () => {
  for (const overrides of [{ actor: 'reviewer-b' }, { recipient: 'builder' }, { runId: 'other' },
    { testEvidence: { command: 'node --test', output: 'failed', passed: false } }, { findings: ['unresolved'] }]) {
    const assessment = collectReviews(round, contexts({ 'reviewer-a': [result('reviewer-a', overrides)] }))
    assert.equal(assessment.complete, false)
    assert.equal(Object.keys(assessment.accepted).length, 0)
    assert.equal(assessment.rejected.length, 1)
  }
  const source = contexts({ 'reviewer-a': [result('reviewer-a')] })
  source['reviewer-a'].comments[0].conflicts = [{ value: 'alternative' }]
  assert.equal(collectReviews(round, source).rejected.length, 1)
})

it('final changes requested blocks the bounded run and never hands off to human review', () => {
  const final = reviewRound({ ...round, round: 2 })
  const assessment = collectReviews(final, contexts({ 'reviewer-a': [result('reviewer-a', { round: 2 })],
    'reviewer-b': [result('reviewer-b', { round: 2, verdict: 'changes-requested', findings: ['Independent assertion fails'],
      testEvidence: { command: 'node --test', output: 'failed', passed: false } })] }))
  assert.equal(assessment.complete, true)
  assert.equal(nextReviewAction(final, assessment), 'blocked')
})

it('retries the exact persisted operation after response loss and reuses a confirmed result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-review-outbox-'))
  let constructions = 0, submissions = 0
  const makeArgs = async () => { constructions++; return ['handoff', '--revisions', 'original', '--operation-id', 'fixed'] }
  try {
    await assert.rejects(submitOnce(directory, 'review-a', makeArgs, async () => { submissions++; throw new Error('Reply lost') }))
    const response = await submitOnce(directory, 'review-a', async () => { throw new Error('Must not reread revisions') }, async args => {
      submissions++; assert.deepEqual(args, ['handoff', '--revisions', 'original', '--operation-id', 'fixed']); return { success: true }
    })
    assert.deepEqual(response, { success: true })
    await submitOnce(directory, 'review-a', makeArgs, async () => { throw new Error('Already submitted') })
    assert.equal(constructions, 1)
    assert.equal(submissions, 2)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
