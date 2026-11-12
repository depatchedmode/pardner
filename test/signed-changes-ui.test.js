import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientReplicas } from '../support/client-workspace.js'
import * as A from '@automerge/automerge'
import { alterEntry, signedWrite, unsignedWrite } from '../support/unsigned-peer.js'

// Who made each change, on real clients in Chromium and WebKit (#197): Activity names the signing person and
// machine, membership records appear with their signer, and a change without a valid signature is announced on
// the board with a way to review it. Every entry is derived from the change that wrote it: an entry another change
// altered is shown as it was signed, and the altering change is listed under its own signer. Nothing is hidden.

const row = (page, text) => page.locator('article.event').filter({ hasText: text })

for (const engine of [chromium, webkit]) it(`names who made each change, lists membership records, announces an unsigned change, and shows an altered entry as it was signed in ${engine.name()}`,
  { timeout: 180000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', 'Bob'] }, async ({ people, newPage, eventually, project }) => {
      const [alice, bob] = people
      // A change Bob's machine made, relayed to Alice by her own hub.
      const { result } = await bob.operate('task.create', { title: 'Written on Bob’s machine' })
      await eventually(async () => (await alice.doc()).tasks[result.taskId], 'the change never reached Alice')
      const page = await newPage()
      await alice.open(page)
      await page.getByRole('button', { name: 'Activity', exact: true }).click()
      const written = row(page, 'Written on Bob’s machine')
      await written.locator('.event-signer').getByText('Signed by Bob · Bob’s laptop').waitFor({ timeout: 30000 })
      assert.equal(await written.locator('.event-signer').getAttribute('data-tone'), 'signed')
      // Membership records are Activity entries too, with the machine that signed each.
      await page.getByRole('combobox', { name: 'Show' }).selectOption('members')
      const admission = row(page, 'Alice let Bob in as a member')
      await admission.waitFor({ timeout: 30000 })
      await admission.locator('.event-signer').getByText('Signed by Alice · this computer').waitFor()
      // The record's signature covers the record, not the time shown: that is when a machine wrote it to the board.
      await admission.locator('time').getByText(/^Written to the board /).waitFor()
      assert.match(await admission.locator('time').getAttribute('title'), /when a machine wrote this record to the board\. The record’s signer didn’t sign this time\./)
      await row(page, 'Alice started the project').waitFor()
      await page.getByRole('combobox', { name: 'Show' }).selectOption('changes')
      assert.equal(await page.locator('.review-notice').count(), 0, 'nothing to review yet')

      // A modified client on Bob's machine writes a change without signing it.
      const nativeUrl = `${alice.client.url.replace(/^http/, 'ws')}/pardner/client/v1/replica/${project.id}/native`
      const { url: boardUrl } = await alice.call(`/projects/${project.id}/api/automerge/url`)
      const unsigned = await unsignedWrite({ key: bob.client.registry.machineKey, projectId: project.id, nativeUrl, boardUrl, actorId: bob.actorId,
        title: 'Never signed' })
      try {
        const notice = page.locator('.review-notice')
        await notice.getByText('One change needs review', { exact: false }).waitFor({ timeout: 30000 })
        await notice.getByRole('button', { name: 'Review changes' }).click()
        assert.equal(await page.getByRole('combobox', { name: 'Show' }).inputValue(), 'review')
        const flagged = row(page, 'Never signed')
        await flagged.locator('.event-signer').getByText('Unattributed: no signature arrived · relayed by Bob · Bob’s laptop').waitFor({ timeout: 30000 })
        assert.equal(await flagged.locator('.event-signer').getAttribute('data-tone'), 'flag')
        assert.equal(await row(page, 'Written on Bob’s machine').count(), 0, 'only changes that need review are listed')
        // Applied, not hidden: the task is on Alice's board and, through her hub, on Bob's.
        await eventually(async () => (await bob.doc()).activity.find(entry => entry.key === unsigned.operationId)?.changes[0]?.state === 'unattributed', 'Bob never learned it is unattributed')
        await page.getByRole('button', { name: 'Tasks', exact: true }).click()
        await page.locator('.task-card').filter({ hasText: 'Never signed' }).waitFor()
      } finally { await unsigned.repo.shutdown() }

      // Bob's modified client rewrites Alice's comment inside her signed Activity entry, and signs its own edit.
      const { result: comment } = await alice.operate('comment.add', { taskId: result.taskId, text: 'Alice’s own words' })
      const entry = Object.values((await alice.doc()).operations).find(event => event.result?.commentId === comment.commentId)
      const altered = await alterEntry({ key: bob.client.registry.machineKey, projectId: project.id, nativeUrl, boardUrl, operationId: entry.operationId,
        edit: event => { event.payload.text = new A.ImmutableString('Bob’s words') } })
      try {
        await page.getByRole('button', { name: 'Activity', exact: true }).click()
        await page.getByRole('combobox', { name: 'Show' }).selectOption('changes')
        // Shown as Alice signed it, with the alteration and the machine that made it.
        const signed = row(page, 'Alice’s own words')
        await signed.locator('.event-signer').getByText('altered after signing by Bob · Bob’s laptop', { exact: false }).waitFor({ timeout: 30000 })
        assert.match(await signed.locator('.event-signer').textContent(), /^Signed by Alice · this computer/)
        assert.equal(await signed.locator('.event-signer').getAttribute('data-tone'), 'flag')
        assert.equal(await row(page, 'Bob’s words').count(), 0, 'what Bob wrote is not shown under Alice’s signature')
        // Bob's edit is listed for review under his own signer.
        await page.getByRole('combobox', { name: 'Show' }).selectOption('review')
        const edit = row(page, 'altered an Activity entry another change signed')
        await edit.locator('.event-signer').getByText('Signed by Bob · Bob’s laptop').waitFor({ timeout: 30000 })
      } finally { await altered.repo.shutdown() }
    })
  })

for (const engine of [chromium, webkit]) it(`later changes by another member never change what an entry shows: its signed time and words stay, names are marked as current, and a later deletion says by whom, in ${engine.name()}`,
  { timeout: 180000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', 'Bob'] }, async ({ people, newPage, eventually, project }) => {
      const [alice, bob] = people
      const { result: task } = await alice.operate('task.create', { title: 'The title Alice saw' })
      const { result: kept } = await alice.operate('comment.add', { taskId: task.taskId, text: 'Alice’s kept words' })
      const { result: doomed } = await alice.operate('comment.add', { taskId: task.taskId, text: 'Alice’s deleted words' })
      const signedAt = Object.values((await alice.doc()).operations).find(event => event.result?.commentId === doomed.commentId).timestamp
      // Bob renames the task through his own client, then his modified client rewrites one comment's text and marks
      // the other deleted, in one change it signs.
      const revisions = (await bob.call(`/projects/${project.id}/api/automerge/task/${encodeURIComponent(task.taskId)}/context`)).revisions
      await eventually(async () => (await bob.doc()).comments[doomed.commentId], 'Bob never received the comments')
      await bob.operate('task.update', { taskId: task.taskId, updates: { title: 'Renamed by Bob' }, expectedRevisions: { title: revisions.title } })
      const nativeUrl = `${alice.client.url.replace(/^http/, 'ws')}/pardner/client/v1/replica/${project.id}/native`
      const { url: boardUrl } = await alice.call(`/projects/${project.id}/api/automerge/url`)
      const changed = await signedWrite({ key: bob.client.registry.machineKey, projectId: project.id, nativeUrl, boardUrl, write: doc => {
        doc.commentBodies[kept.commentId].value = new A.ImmutableString('Words put in Alice’s mouth')
        doc.deletedComments[doomed.commentId] = true
      } })
      try {
        await eventually(async () => (await alice.doc()).attribution.deletions?.[doomed.commentId], 'the deletion never reached Alice')
        const page = await newPage()
        await alice.open(page)
        await page.getByRole('button', { name: 'Activity', exact: true }).click()
        // The deleted comment's entry keeps Alice's words and her signed time, and says it was deleted later, by a
        // change that needs review, naming that change's signer, never as Alice's own deletion.
        const deleted = row(page, 'Alice’s deleted words')
        await deleted.getByText('A change that needs review, signed by Bob · Bob’s laptop, later marked this comment deleted. See Activity.').waitFor({ timeout: 30000 })
        assert.equal(await deleted.locator('time').getAttribute('datetime'), new Date(signedAt).toISOString(), 'the time shown is the signed one')
        assert.match(await deleted.locator('.event-signer').textContent(), /^Signed by Alice · this computer/)
        // The task's title is looked up now, and marked so.
        const title = deleted.locator('.event-line .current-label', { hasText: 'Renamed by Bob' })
        await title.waitFor()
        assert.equal(await title.getAttribute('title'), 'As named now: not part of what was signed')
        await page.locator('.current-legend').first().waitFor()
        // What Bob's client put in Alice's mouth is never shown in her entry; the change is listed under his signer.
        assert.equal(await row(page, 'Words put in Alice’s mouth').count(), 0)
        await page.getByRole('combobox', { name: 'Show' }).selectOption('review')
        await row(page, 'changed content another change wrote').locator('.event-signer').getByText('Signed by Bob · Bob’s laptop').waitFor({ timeout: 30000 })
        // The task panel shows the comment as it is now, and says someone other than its author changed it.
        await page.getByRole('combobox', { name: 'Show' }).selectOption('changes')
        await deleted.locator('button[data-task-id]').click()
        const panel = page.getByRole('complementary', { name: 'Task details' })
        const comment = panel.locator('article.comment', { hasText: 'Words put in Alice’s mouth' })
        await comment.getByText('Changed by someone other than its author.', { exact: false }).waitFor({ timeout: 30000 })
        assert.equal(await panel.locator('.comment-changed').count(), 1, 'only the changed comment says so')
      } finally { await changed.repo.shutdown() }
    })
  })

for (const engine of [chromium, webkit]) it(`a board part a member's change rewrote is named as unreadable, and the rest of the board and Activity still show, in ${engine.name()}`,
  { timeout: 180000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', 'Bob'] }, async ({ people, newPage, eventually, project }) => {
      const [alice, bob] = people
      const { result } = await alice.operate('task.create', { title: 'Still on the board' })
      await alice.operate('goal.create', { title: 'A goal soon unreadable' })
      await eventually(async () => (await bob.doc()).tasks[result.taskId], 'the task never reached Bob')
      const page = await newPage()
      await alice.open(page)
      await page.locator('.task-card').filter({ hasText: 'Still on the board' }).waitFor({ timeout: 30000 })
      // A modified client on Bob's machine replaces the board's goals with text, and signs its change.
      const nativeUrl = `${alice.client.url.replace(/^http/, 'ws')}/pardner/client/v1/replica/${project.id}/native`
      const { url: boardUrl } = await alice.call(`/projects/${project.id}/api/automerge/url`)
      const rewrite = await signedWrite({ key: bob.client.registry.machineKey, projectId: project.id, nativeUrl, boardUrl, write: doc => { doc.goals = new A.ImmutableString('no goals here') } })
      try {
        await page.getByText('Part of this board can’t be read, so what it holds isn’t shown: goals.', { exact: false }).waitFor({ timeout: 30000 })
        await page.locator('.task-card').filter({ hasText: 'Still on the board' }).waitFor()
        // The change is listed for review under its own signer.
        await page.getByRole('button', { name: 'Activity', exact: true }).click()
        await page.getByRole('combobox', { name: 'Show' }).selectOption('review')
        await page.locator('article.event .event-signer').getByText('Signed by Bob · Bob’s laptop').first().waitFor({ timeout: 30000 })
        const doc = await alice.doc()
        assert.ok(doc.unreadable.some(item => item.kind === 'root' && item.id === 'goals' && item.writers.some(writer => writer.change === rewrite.hash)))
      } finally { await rewrite.repo.shutdown() }
    })
  })
