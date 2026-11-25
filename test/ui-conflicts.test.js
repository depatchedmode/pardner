import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientReplicas, showTaskActions } from '../support/client-workspace.js'

it('resolves a real two-replica task outcome conflict through the browser', { timeout: 90000 }, async () => {
  // Carol's client hosts the project; Alice and Bob each write from their own replica client.
  await withClientReplicas(chromium, { humans: ['Carol', 'Alice', 'Bob'] }, async ({ people: [, alice, bob], newPage, partition, settled, eventually }) => {
    const { result: { taskId } } = await alice.operate('task.create', { title: 'Resolve together' })
    await eventually(async () => (await bob.doc()).tasks[taskId] && await settled())
    const base = await alice.task(taskId)
    const writes = []
    await partition(async () => {
      for (const [person, outcome] of [[alice, 'dead-end'], [bob, 'abandoned']]) {
        const receipt = await person.operate('task.update', { taskId, updates: { outcome }, expectedRevisions: { outcome: base.revisions.outcome } })
        assert.equal(receipt.savedLocally, true)
        writes.push(receipt.operationId)
      }
    }, async () => (await alice.task(taskId)).conflicts.outcome?.length === 2 && (await bob.task(taskId)).conflicts.outcome?.length === 2)

    const conflicted = await bob.task(taskId)
    const operationIds = conflicted.conflicts.outcome.map(choice => choice.operationId)
    assert.equal(operationIds.length, 2)

    const page = await newPage()
    await alice.open(page)
    await page.getByRole('button', { name: /Resolve together/ }).click()
    const panel = page.getByRole('dialog', { name: 'Task details' })
    await panel.getByRole('heading', { name: 'Resolve outcome' }).waitFor()
    const section = panel.locator('section.conflict')
    assert.ok(await section.getByText('Alice', { exact: false }).count() >= 1, 'Alice is named')
    assert.ok(await section.getByText('Bob', { exact: false }).count() >= 1, 'Bob is named')
    assert.equal(await section.getByRole('button', { name: 'Keep this outcome' }).count(), 2)

    await section.locator('div', { has: page.getByText('Abandoned', { exact: true }) })
      .getByRole('button', { name: 'Keep this outcome' }).click()

    await eventually(async () => {
      for (const person of [alice, bob]) {
        const current = await person.task(taskId)
        if (current.task.outcome !== 'abandoned' || current.conflicts.outcome) return false
      }
      return settled()
    })
    await panel.getByRole('heading', { name: 'Resolve outcome' }).waitFor({ state: 'detached' })
    for (const person of [alice, bob]) {
      const current = await person.task(taskId)
      assert.equal(current.task.outcome, 'abandoned')
      assert.equal(current.conflicts.outcome, undefined)
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
        const group = comment.getByRole('group', { name: 'Competing comment edits' })
        const keep = group.getByRole('button', { name: 'Keep this comment', exact: true })
        await keep.first().waitFor()
        assert.equal(await group.count(), 1)
        assert.equal(await comment.getByText('First alternative', { exact: true }).count(), 1)
        assert.equal(await comment.getByText('Second alternative', { exact: true }).count(), 1)
        assert.equal(await keep.count(), 2)
        const reason = 'Only the comment author can resolve these edits.'
        await comment.getByText(reason, { exact: true }).waitFor()
        for (const button of await keep.all()) {
          assert.equal(await button.isDisabled(), true)
        }
        assert.equal(await comment.getByRole('button', { name: /delete|edit/i }).count(), 0)
        if (process.env.PARDNER_COMMENT_SCREENSHOTS) {
          await comment.screenshot({ path: `output/verification/issue-160/non-author-${engine.name()}.png` })
        }
        const author = await newPage()
        await alice.open(author)
        await author.getByRole('button', { name: /Comment permissions/ }).click()
        const authorGroup = author.getByRole('group', { name: 'Competing comment edits' })
        const authorKeep = authorGroup.getByRole('button', { name: 'Keep this comment', exact: true })
        await authorKeep.first().waitFor()
        assert.equal(await author.getByText(reason, { exact: true }).count(), 0)
        assert.equal(await authorKeep.first().isEnabled(), true)
        await authorKeep.first().click()
        await eventually(async () => (await carol.task(taskId)).comments[0].conflicts.length === 0)
        await group.waitFor({ state: 'detached' })
      })
  })
}

for (const engine of [chromium, webkit]) {
  it(`finds and completes a review to-do on an ended task in ${engine.name()}`, { timeout: 90000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', 'Bob'], contextOptions: { viewport: { width: 1280, height: 900 } } },
      async ({ people: [alice, bob], newPage, settled, eventually }) => {
        const description = 'The release evidence is ready for review.'
        const details = Array(8).fill('Review the deployment notes and the latest records for the release.').join('\n\n')
        const { result: { taskId } } = await alice.operate('task.create', {
          title: 'Verify the release evidence', description: `${description}\n\n${details}`, assignee: alice.actorId,
        })
        await alice.operate('task.create', { title: 'Unrelated work' })
        const builder = await newPage()
        await alice.open(builder)
        await builder.getByRole('button', { name: /Verify the release evidence/ }).click()
        const taskPanel = builder.getByRole('dialog', { name: 'Task details' })
        await showTaskActions(taskPanel)
        await taskPanel.getByRole('button', { name: 'Assign to-do', exact: true }).click()
        const assignment = taskPanel.getByRole('region', { name: 'To-dos' })
        await assignment.getByLabel('Recipient', { exact: true }).selectOption(bob.actorId)
        const text = 'Check the recorded evidence before shipping.'
        await taskPanel.getByLabel('To-do', { exact: true }).fill(text)
        const requests = []
        await builder.route('**/automerge/operations', async route => {
          const request = route.request().postDataJSON()
          if (request.type !== 'todo.add') return route.continue()
          requests.push(request)
          if (requests.length !== 1) return route.continue()
          assert.equal((await route.fetch()).status(), 200)
          await route.abort('failed')
        })
        await taskPanel.getByRole('button', { name: 'Assign to-do', exact: true }).last().click()
        const retry = taskPanel.getByRole('button', { name: 'Retry saved request' })
        await retry.click()
        await retry.waitFor({ state: 'hidden' })
        await builder.unroute('**/automerge/operations')
        const builderCheck = taskPanel.getByRole('region', { name: 'To-dos' }).getByRole('checkbox', { name: text })
        await builderCheck.waitFor()
        assert.equal(await builderCheck.isDisabled(), true)
        assert.equal(requests.length, 2)
        assert.deepEqual(requests[0], requests[1])
        const { revisions } = await alice.task(taskId)
        await alice.operate('task.update', { taskId, updates: { outcome: 'completed' }, expectedRevisions: { outcome: revisions.outcome } })
        await eventually(async () => (await bob.task(taskId)).task.state === 'ended' && await settled())
        const received = await bob.task(taskId)
        assert.equal(received.comments.filter(comment => comment.content === text).length, 1)
        assert.equal(received.mentions.filter(mention => mention.toActorId === bob.actorId).length, 1)
        assert.equal(received.task.assignee, alice.actorId)

        const reviewer = await newPage()
        await bob.open(reviewer)
        await reviewer.getByRole('button', { name: 'My to-dos' }).click()
        const ended = reviewer.getByRole('region', { name: 'Ended' })
        await ended.getByRole('button', { name: /Verify the release evidence.*1 open to-do/ }).click()
        assert.equal(await reviewer.getByRole('button', { name: 'Unrelated work', exact: true }).count(), 0)
        const panel = reviewer.getByRole('dialog', { name: 'Task details' })
        const item = panel.locator('article.comment').filter({ has: reviewer.getByRole('button', { name: 'To-do for Bob', exact: true }) })
        const checklist = panel.getByRole('region', { name: 'To-dos' })
        const checkbox = checklist.getByRole('checkbox', { name: text })
        const handle = `@${(await bob.doc()).actors[bob.actorId].handle}`
        const assignee = checkbox.locator('xpath=ancestor::li').locator('bdi.task-todo-assignee')
        assert.deepEqual(await assignee.evaluate(node => [
          node.parentElement.textContent, getComputedStyle(node).textDecorationLine,
        ]), [`${text} ${handle}`, 'underline'])
        const doneLabel = checklist.getByText('Done', { exact: true })
        const jump = item.getByRole('button', { name: 'To-do for Bob', exact: true })
        await jump.click()
        assert.equal(await checkbox.evaluate(element => document.activeElement === element.closest('li')), true)
        assert.equal(await item.getByText(text, { exact: true }).count(), 0)
        assert.equal(await checkbox.isChecked(), false)
        assert.equal(await checkbox.isEnabled(), true)
        assert.equal(await doneLabel.count(), 0)
        const prose = await panel.getByText(description, { exact: true }).boundingBox()
        const list = await checklist.boundingBox()
        const discussion = await panel.getByRole('heading', { name: /^Comments/ }).boundingBox()
        assert.ok(prose.y + prose.height <= list.y && list.y + list.height <= discussion.y)
        assert.equal(await item.getByRole('checkbox').count(), 0)
        assert.equal(await item.getByRole('button', { name: 'Mark to-do done' }).count(), 0)
        if (process.env.PARDNER_TODO_SCREENSHOTS) await reviewer.screenshot({ path: `${process.env.PARDNER_TODO_SCREENSHOTS}/todo-${engine.name()}.png` })
        await reviewer.setViewportSize({ width: 320, height: 720 })
        await checkbox.evaluate(input => {
          const pane = input.closest('.side-panel')
          pane.scrollTop += input.getBoundingClientRect().top - 640
        })
        const completionRequests = []
        await reviewer.route('**/automerge/operations', async route => {
          const request = route.request().postDataJSON()
          if (request.type !== 'todo.complete') return route.continue()
          completionRequests.push(request)
          if (completionRequests.length === 1) return route.abort('failed')
          await route.continue()
        })
        if (engine === chromium) await checklist.getByText(text, { exact: true }).click()
        else await checkbox.press('Space')
        const completionRetry = checklist.getByRole('alert').getByRole('button', { name: 'Retry saved request' })
        await completionRetry.waitFor()
        const retryBounds = await completionRetry.boundingBox()
        assert.ok(retryBounds.y >= 0 && retryBounds.y + retryBounds.height <= 720, 'completion retry is in the viewport')
        assert.equal(await checkbox.isChecked(), false)
        assert.equal(await doneLabel.count(), 0)
        await completionRetry.press('Enter')
        await item.getByText('Done by Bob', { exact: true }).waitFor()
        await checklist.getByRole('status').getByText('To-do marked done.', { exact: true }).waitFor()
        await item.getByText('To-do for Bob', { exact: true }).waitFor()
        const { completion } = (await bob.task(taskId)).comments.find(comment => comment.content === text).todo
        assert.equal(await item.locator('time[datetime]').last().getAttribute('datetime'), completion.timestamp)
        assert.equal(completionRequests.length, 2)
        assert.deepEqual(completionRequests[0], completionRequests[1])
        assert.equal(await checkbox.isChecked(), true)
        assert.equal(await checkbox.isDisabled(), true)
        await doneLabel.waitFor({ state: 'visible' })
        await eventually(async () => (await alice.task(taskId)).comments[0].todo.completion?.actorId === bob.actorId && await settled())
        await eventually(() => builderCheck.isChecked())
        await taskPanel.getByRole('region', { name: 'To-dos' }).getByText('Done', { exact: true }).waitFor({ state: 'visible' })
        assert.equal((await bob.task(taskId)).task.state, 'ended')
        await eventually(async () => {
          const entry = (await bob.doc()).activity.find(entry => entry.shows?.type === 'todo.complete' && entry.shows.taskId === taskId)
          return entry?.actorId === bob.actorId && !entry.review && entry.changes.every(change => change.state === 'signed')
        })
        await alice.operate('todo.add', { taskId, to: bob.actorId, text: '- Compare the **release notes**' })
        const formatted = checklist.getByRole('checkbox', { name: /Compare the release notes/ }).locator('xpath=ancestor::li')
        await formatted.getByText(handle, { exact: true }).waitFor()
        assert.deepEqual(await formatted.locator('.markdown').evaluate(block =>
          [...block.children].map(element => [element.tagName, element.textContent.trim()])), [
          ['UL', 'Compare the release notes'], ['P', handle],
        ])
      })
  })
}
