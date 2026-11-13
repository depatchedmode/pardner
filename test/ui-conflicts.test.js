import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { withReplicaWorkspace } from '../support/replica-workspace.js'

it('resolves a real two-replica task status conflict through the browser', { timeout: 60000 }, async () => {
  await withReplicaWorkspace(chromium, async ({ page, replicas, operate, context, partition, eventually }) => {
    const { result: { taskId } } = await operate(0, 'alice', 'task.create', { title: 'Resolve together' })
    await eventually(() => replicas.every(replica => replica.store.workspace.handle.doc().tasks[taskId]))
    const path = `/automerge/task/${taskId}/context`
    const base = await context(0, path)
    const writes = []
    await partition(async () => {
      const update = (i, actorId, status) => {
        const payload = { taskId, updates: { status }, expectedRevisions: { status: base.revisions.status } }
        return operate(i, actorId, 'task.update', payload)
      }
      for (const [i, actorId, status] of [[0, 'alice', 'in-progress'], [1, 'builder', 'review']]) {
        const receipt = await update(i, actorId, status)
        assert.equal(receipt.savedLocally, true)
        writes.push(receipt.operationId)
      }
    }, () => replicas.every(replica => replica.store.workspace.taskContext(taskId).conflicts.status?.length === 2))

    const conflicted = await context(1, path)
    const operationIds = conflicted.conflicts.status.map(choice => choice.operationId)
    assert.equal(operationIds.length, 2)

    await page.getByRole('button', { name: /Resolve together/ }).click()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    await panel.getByRole('heading', { name: 'Resolve status' }).waitFor()
    const section = panel.locator('section.conflict')
    assert.ok(await section.getByText('alice', { exact: false }).count() >= 1, 'alice is named')
    assert.ok(await section.getByText('builder', { exact: false }).count() >= 1, 'builder is named')
    assert.equal(await section.getByRole('button', { name: 'Keep this status' }).count(), 2)

    await section.locator('div', { has: page.getByText('review', { exact: true }) })
      .getByRole('button', { name: 'Keep this status' }).click()

    await eventually(async () => {
      for (const i of [0, 1]) {
        const current = await context(i, path)
        if (current.task.status !== 'review' || current.conflicts.status) return false
      }
      return replicas.every(replica => !replica.store.status().syncPending)
    })
    await panel.getByRole('heading', { name: 'Resolve status' }).waitFor({ state: 'detached' })
    for (const i of [0, 1]) {
      const current = await context(i, path)
      assert.equal(current.task.status, 'review')
      assert.equal(current.conflicts.status, undefined)
      for (const operationId of operationIds) {
        assert.equal(current.history.filter(event => event.operationId === operationId).length, 1)
      }
    }
  })
})
