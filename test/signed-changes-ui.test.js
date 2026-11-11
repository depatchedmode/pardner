import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientReplicas } from '../support/client-workspace.js'
import * as A from '@automerge/automerge'
import { alterEntry, unsignedWrite } from '../support/unsigned-peer.js'

// Who made each change, on real clients in Chromium and WebKit (#197): Activity names the signing person and
// machine, membership records appear with their signer, and a change without a valid signature is announced on
// the board with a way to review it. An entry another change altered is shown as it was signed, and the altering
// change is listed under its own signer. Nothing is hidden.

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
        await eventually(async () => (await bob.doc()).attribution.operations[unsigned.operationId]?.[0]?.state === 'unattributed', 'Bob never learned it is unattributed')
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
