import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientReplicas } from '../support/client-workspace.js'

it('resolves a real two-replica task status conflict through the browser', { timeout: 90000 }, async () => {
  // Carol's client hosts the project; Alice and Bob each write from their own replica client.
  await withClientReplicas(chromium, { humans: ['Carol', 'Alice', 'Bob'] }, async ({ people: [, alice, bob], newPage, partition, settled, eventually }) => {
    const { result: { taskId } } = await alice.operate('task.create', { title: 'Resolve together' })
    await eventually(async () => (await bob.doc()).tasks[taskId] && await settled())
    const base = await alice.task(taskId)
    const writes = []
    await partition(async () => {
      for (const [person, status] of [[alice, 'in-progress'], [bob, 'review']]) {
        const receipt = await person.operate('task.update', { taskId, updates: { status }, expectedRevisions: { status: base.revisions.status } })
        assert.equal(receipt.savedLocally, true)
        writes.push(receipt.operationId)
      }
    }, async () => (await alice.task(taskId)).conflicts.status?.length === 2 && (await bob.task(taskId)).conflicts.status?.length === 2)

    const conflicted = await bob.task(taskId)
    const operationIds = conflicted.conflicts.status.map(choice => choice.operationId)
    assert.equal(operationIds.length, 2)

    const page = await newPage()
    await alice.open(page)
    await page.getByRole('button', { name: /Resolve together/ }).click()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    await panel.getByRole('heading', { name: 'Resolve status' }).waitFor()
    const section = panel.locator('section.conflict')
    assert.ok(await section.getByText('Alice', { exact: false }).count() >= 1, 'Alice is named')
    assert.ok(await section.getByText('Bob', { exact: false }).count() >= 1, 'Bob is named')
    assert.equal(await section.getByRole('button', { name: 'Keep this status' }).count(), 2)

    await section.locator('div', { has: page.getByText('review', { exact: true }) })
      .getByRole('button', { name: 'Keep this status' }).click()

    await eventually(async () => {
      for (const person of [alice, bob]) {
        const current = await person.task(taskId)
        if (current.task.status !== 'review' || current.conflicts.status) return false
      }
      return settled()
    })
    await panel.getByRole('heading', { name: 'Resolve status' }).waitFor({ state: 'detached' })
    for (const person of [alice, bob]) {
      const current = await person.task(taskId)
      assert.equal(current.task.status, 'review')
      assert.equal(current.conflicts.status, undefined)
      for (const operationId of operationIds) {
        assert.equal(current.history.filter(event => event.operationId === operationId).length, 1)
      }
    }
  })
})

for (const engine of [chromium, webkit]) {
  it(`limits comment conflict controls to the author in ${engine.name()}`, { timeout: 90000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', { name: 'Alice', device: true }, { name: 'Alice', device: true }, 'Carol'] },
      async ({ people: [, alice, otherDevice, carol], newPage, partition, settled, eventually }) => {
        const { result: { taskId } } = await alice.operate('task.create', { title: 'Comment permissions' })
        const added = await alice.operate('comment.add', { taskId, text: 'Original' })
        const commentId = added.result.commentId
        await eventually(async () => (await otherDevice.task(taskId)).comments.length === 1 && await settled())
        await partition(async () => {
          for (const [person, text] of [[alice, 'First alternative'], [otherDevice, 'Second alternative']]) {
            await person.operate('comment.edit', { commentId, text, expectedRevisions: [added.operationId] })
          }
        }, async () => (await alice.task(taskId)).comments[0].conflicts.length === 2)
        const viewer = await newPage()
        await carol.open(viewer)
        await viewer.getByRole('button', { name: /Comment permissions/ }).click()
        const comment = viewer.locator('article.comment')
        const keep = comment.getByRole('button', { name: 'Keep this comment', exact: true })
        await keep.first().waitFor()
        assert.equal(await keep.count(), 2)
        for (const button of await keep.all()) {
          assert.equal(await button.isDisabled(), true)
          assert.equal(await button.getAttribute('title'), 'Only the comment author may resolve it')
        }
        assert.equal(await comment.getByRole('button', { name: /delete|edit/i }).count(), 0)
        if (process.env.PARDNER_COMMENT_SCREENSHOTS) {
          await comment.screenshot({ path: `output/verification/issue-160/non-author-${engine.name()}.png` })
        }
        const author = await newPage()
        await alice.open(author)
        await author.getByRole('button', { name: /Comment permissions/ }).click()
        const authorKeep = author.getByRole('button', { name: 'Keep this comment', exact: true })
        await authorKeep.first().waitFor()
        assert.equal(await authorKeep.first().isEnabled(), true)
        await authorKeep.first().click()
        await eventually(async () => (await carol.task(taskId)).comments[0].conflicts.length === 0)
        await keep.first().waitFor({ state: 'detached' })
      })
  })
}
