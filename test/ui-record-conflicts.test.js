import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { withClientReplicas } from '../support/client-workspace.js'
import { FIELD_LABELS, conflictGroups, disputedStatusText } from '../ui-prototype/src/record-conflicts.js'

const choice = (operationId, actorId, value) => ({ operationId, actorId, value })

describe('record conflict helpers', () => {
  it('labels the conflicted fields for people', () => {
    assert.deepEqual(FIELD_LABELS, { title: 'title', description: 'description', status: 'status', goalId: 'goal' })
  })

  it('groups identical values and names every author once, ordered by first operation', () => {
    const groups = conflictGroups([
      choice('op-3', 'bob', 'proven'), choice('op-1', 'alice', 'dead-end'), choice('op-2', 'builder', 'proven'), choice('op-4', 'bob', 'proven'),
    ])
    assert.deepEqual(groups, [
      { value: 'dead-end', actorIds: ['alice'], operationIds: ['op-1'] },
      { value: 'proven', actorIds: ['builder', 'bob'], operationIds: ['op-2', 'op-3', 'op-4'] },
    ])
  })

  it('writes a disputed status as "A or B"', () => {
    const labels = { proven: 'Proven', 'dead-end': 'Dead end', abandoned: 'Abandoned' }
    assert.equal(disputedStatusText([choice('1', 'a', 'proven'), choice('2', 'b', 'dead-end')], labels), 'Proven or Dead end')
    assert.equal(disputedStatusText([choice('1', 'a', 'proven'), choice('2', 'b', 'dead-end'), choice('3', 'c', 'abandoned')], labels), 'Proven, Dead end or Abandoned')
    assert.equal(disputedStatusText([choice('1', 'a', 'proven'), choice('2', 'b', 'proven')], labels), 'Proven')
  })
})

const shots = process.env.WP3_SHOTS
async function capture(page, name) {
  if (!shots) return
  await mkdir(shots, { recursive: true })
  const original = page.viewportSize()
  for (const [size, viewport] of [['1440', { width: 1440, height: 900 }], ['375', { width: 375, height: 812 }]]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(shots, `wp3-${size}-${name}.png`), fullPage: true })
  }
  await page.setViewportSize(original)
}

const isDisputed = (doc, collection, id, field) => doc[collection][id].conflicts[field]?.length === 2

// Carol's client hosts the project; Alice and Bob write from their own replica clients and the browser is Alice's.
async function withConflicts(body) {
  await withClientReplicas(chromium, { humans: ['Carol', 'Alice', 'Bob'] }, async ({ people: [, alice, bob], newPage, ...harness }) => {
    const page = await newPage()
    await alice.open(page)
    await body({ ...harness, page, alice, bob, replicas: [alice, bob] })
  })
}

async function seed({ alice, replicas, settled, eventually }, goals = ['Ship the pilot'], vein = 'Edge caching') {
  const goalIds = []
  for (const title of goals) goalIds.push((await alice.operate('goal.create', { title })).result.goalId)
  const { result: { veinId } } = await alice.operate('vein.create', { title: vein, goalId: goalIds[0] })
  await eventually(async () => {
    for (const replica of replicas) {
      const current = await replica.doc()
      if (!current.veins[veinId] || !goalIds.every(id => current.goals[id])) return false
    }
    // Stopping the hub while replicas still push their seed writes can hang the stop.
    return settled()
  })
  return { goalIds, veinId }
}

// Two actors write `field` from the same base on different replicas while the hub is down.
async function disagree(harness, collection, id, field, [[aliceValue], [bobValue]], kind) {
  const { alice, bob, partition, replicas } = harness
  const base = (await alice.doc())[collection][id].revisions[field]
  const update = (person, value) => person.operate(`${kind}.update`, {
    [`${kind}Id`]: id, updates: { [field]: value }, expectedRevisions: { [field]: base },
  })
  await partition(async () => {
    await update(alice, aliceValue)
    await update(bob, bobValue)
  }, async () => {
    for (const replica of replicas) if (!isDisputed(await replica.doc(), collection, id, field)) return false
    return true
  })
}

async function converged(harness, check) {
  await harness.eventually(async () => {
    for (const replica of harness.replicas) if (!check(await replica.doc())) return false
    return harness.settled()
  })
}

const focused = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.className ?? null)

describe('goal and vein conflicts in the Goals view', () => {
  it('discloses a vein status conflict and keeps one value', { timeout: 90000 }, async () => {
    await withConflicts(async harness => {
      const { page } = harness
      const { veinId, goalIds } = await seed(harness)
      await disagree(harness, 'veins', veinId, 'status', [['proven'], ['dead-end']], 'vein')
      await page.getByRole('button', { name: 'Goals', exact: true }).click()
      const row = page.locator(`li[data-vein-id="${veinId}"]`)
      const pill = row.locator('.record-status')
      await pill.waitFor()
      assert.match(await pill.innerText(), /^(Proven or Dead end|Dead end or Proven)$/)
      assert.equal(await pill.getAttribute('data-status'), 'disputed')
      assert.equal(await page.getByLabel('Status of vein Edge caching').count(), 0)
      const details = row.locator('details.record-conflict')
      assert.equal(await details.evaluate(element => element.open), false)
      assert.equal((await details.locator('summary').innerText()).trim(), 'Conflicting edits: status')
      await capture(page, 'vein-closed')
      await details.locator('summary').click()
      assert.equal(await details.getByText('Status: both edits are kept until you choose one.').count(), 1)
      assert.ok(await details.getByText('Alice', { exact: false }).count() >= 1)
      assert.ok(await details.getByText('Bob', { exact: false }).count() >= 1)
      await capture(page, 'vein-open')
      assert.equal(await details.getByRole('button').count(), 2)
      await details.getByRole('button', { name: 'Keep Dead end for vein Edge caching' }).click()
      await converged(harness, current => current.veins[veinId].status === 'dead-end' && !current.veins[veinId].conflicts.status)
      await page.getByLabel('Status of vein Edge caching').waitFor()
      assert.equal(await page.getByLabel('Status of vein Edge caching').inputValue(), 'dead-end')
      assert.equal(await row.locator('details.record-conflict').count(), 0)
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Status of vein Edge caching')
      assert.equal(await focused(page), 'Status of vein Edge caching')
      await capture(page, 'vein-after-keep')
      assert.deepEqual((await harness.bob.doc()).veins[veinId].goalIds, [goalIds[0]])
    })
  })

  it('discloses a goal status conflict and keeps one value', { timeout: 90000 }, async () => {
    await withConflicts(async harness => {
      const { page } = harness
      const { goalIds: [goalId] } = await seed(harness)
      await disagree(harness, 'goals', goalId, 'status', [['achieved'], ['abandoned']], 'goal')
      await page.getByRole('button', { name: 'Goals', exact: true }).click()
      const article = page.locator(`.goal[data-goal-id="${goalId}"]`)
      const pill = article.locator('.goal-heading .record-status')
      await pill.waitFor()
      assert.match(await pill.innerText(), /^(Achieved or Abandoned|Abandoned or Achieved)$/)
      assert.equal(await page.getByLabel('Status of goal Ship the pilot').count(), 0)
      assert.equal(await article.getByRole('heading', { level: 3 }).innerText(), 'Ship the pilot')
      const details = article.locator(':scope > details.record-conflict')
      await details.locator('summary').click()
      await capture(page, 'goal-open')
      await details.getByRole('button', { name: 'Keep Abandoned for goal Ship the pilot' }).click()
      await converged(harness, current => current.goals[goalId].status === 'abandoned' && !current.goals[goalId].conflicts.status)
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Status of goal Ship the pilot')
      assert.equal(await page.getByLabel('Status of goal Ship the pilot').inputValue(), 'abandoned')
    })
  })

  it('lists a vein under both goals it may pursue and keeps one goal', { timeout: 90000 }, async () => {
    await withConflicts(async harness => {
      const { page } = harness
      const { goalIds: [, goalA, goalB], veinId } = await seed(harness, ['Starting goal', 'Goal A', 'Goal B'])
      await disagree(harness, 'veins', veinId, 'goalId', [[goalA], [goalB]], 'vein')
      const current = (await harness.alice.doc()).veins[veinId]
      assert.deepEqual([...current.goalIds].sort(), [goalA, goalB].sort())
      await page.getByRole('button', { name: 'Goals', exact: true }).click()
      const underA = page.locator(`.goal[data-goal-id="${goalA}"] li[data-vein-id="${veinId}"]`)
      const underB = page.locator(`.goal[data-goal-id="${goalB}"] li[data-vein-id="${veinId}"]`)
      await underA.waitFor()
      await underB.waitFor()
      assert.equal((await underA.locator('summary').innerText()).trim(), 'Conflicting edits: goal')
      await underA.locator('summary').click()
      await capture(page, 'goal-conflict-open')
      assert.equal(await underA.getByText('Goal: both edits are kept until you choose one.').count(), 1)
      await underA.getByRole('button', { name: 'Keep Goal B for vein Edge caching' }).click()
      await converged(harness, doc => doc.veins[veinId].goalIds.length === 1)
      assert.deepEqual((await harness.alice.doc()).veins[veinId].goalIds, [goalB])
      assert.deepEqual((await harness.bob.doc()).veins[veinId].goalIds, [goalB])
      await underA.waitFor({ state: 'detached' })
      await underB.waitFor()
      await page.waitForFunction(() => document.activeElement?.closest('li[data-vein-id]')?.closest('.goal')?.getAttribute('aria-label') === 'Goal B')
      await capture(page, 'goal-conflict-after-keep')
    })
  })

  it('shows an alert in the row, or removes the disclosure, when the conflict was resolved elsewhere', { timeout: 90000 }, async () => {
    await withConflicts(async harness => {
      const { page, alice, bob } = harness
      const { veinId } = await seed(harness)
      await disagree(harness, 'veins', veinId, 'status', [['proven'], ['dead-end']], 'vein')
      await page.getByRole('button', { name: 'Goals', exact: true }).click()
      const row = page.locator(`li[data-vein-id="${veinId}"]`)
      const details = row.locator('details.record-conflict')
      await details.locator('summary').click()
      const keepProven = details.getByRole('button', { name: 'Keep Proven for vein Edge caching' })
      await keepProven.waitFor()
      const before = (await bob.doc()).veins[veinId]
      await bob.operate('vein.resolve', { veinId, field: 'status', value: 'dead-end', expectedRevisions: before.revisions.status })
      await converged(harness, current => current.veins[veinId].status === 'dead-end' && !current.veins[veinId].conflicts.status)
      const clicked = await keepProven.click({ timeout: 1500 }).then(() => true, () => false)
      if (clicked) await row.getByRole('alert').waitFor()
      else await details.waitFor({ state: 'detached' })
      assert.equal((await alice.doc()).veins[veinId].status, 'dead-end')
      const history = (await alice.show('vein', veinId)).history
      assert.ok(history.filter(event => event.type === 'vein.update').length >= 2, 'both competing edits stay in history')
    })
  })
})
