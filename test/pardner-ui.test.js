import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'

for (const uuidAvailable of [true, false]) it(
  `uses shared browser operations with crypto.randomUUID ${uuidAvailable ? 'available' : 'unavailable'}`,
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-ui-'))
    const service = await startCliService(directory)
    let browser
    const errors = []
    const run = async (args, actor = 'alice') => {
      const output = await cli(directory, [...args, '--actor', actor])
      assert.equal(output.code, 0, output.stdout + output.stderr)
      return output.result
    }
    try {
      for (const [id, kind] of [
        ['alice', 'human'],
        ['bob', 'human'],
        ['builder', 'agent'],
      ])
        await run(['actors', 'register', id, '--handle', id, '--kind', kind])
      const { token } = JSON.parse(
        await readFile(join(directory, 'connection.json'), 'utf8'),
      )
      browser = await chromium.launch({ headless: true })
      const pages = []
      for (const actor of ['alice', 'bob']) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        })
        if (!uuidAvailable) await context.addInitScript(() => {
          Object.defineProperty(crypto, 'randomUUID', { value: undefined })
        })
        const page = await context.newPage()
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(`${service.httpUrl}/pardner/`)
        await page.getByLabel('Local service token').fill(token)
        await page.getByRole('button', { name: 'Connect', exact: true }).click()
        await page.getByLabel('Actor', { exact: true }).selectOption(actor)
        pages.push(page)
      }
      const [alice, bob] = pages
      await alice.getByRole('button', { name: 'New task', exact: true }).click()
      await alice
        .getByLabel('Title', { exact: true })
        .fill('Coordinate the first release')
      await alice
        .getByLabel('Description', { exact: true })
        .fill(
          'Keep human decisions and agent progress together, including while offline.',
        )
      await alice
        .getByRole('button', { name: 'Create task', exact: true })
        .click()
      await alice
        .getByRole('heading', {
          name: 'Coordinate the first release',
          exact: true,
        })
        .waitFor()
      await bob
        .getByRole('button', { name: /Coordinate the first release/ })
        .click()
      await alice
        .getByLabel('Comment', { exact: true })
        .fill('The requirements are ready for @builder.')
      await alice
        .getByRole('button', { name: 'Add comment', exact: true })
        .click()
      await bob
        .getByText('The requirements are ready for @builder.', { exact: true })
        .waitFor()
      assert.match(
        await bob.getByText(/unread for bob/).textContent(),
        /1 unread/,
      )
      await bob
        .getByRole('button', { name: 'Mark displayed comments read' })
        .click()
      await bob.getByText('0 unread for bob', { exact: true }).waitFor()
      assert.match(
        await alice.getByText(/unread for alice/).textContent(),
        /1 unread/,
      )
      await alice
        .getByRole('button', { name: 'Edit task', exact: true })
        .click()
      await alice
        .getByLabel('Title', { exact: true })
        .fill('A stale local draft')
      const taskId = (await run(['tasks'])).tasks[0].id
      const original = await run(['show', taskId])
      await run(
        [
          'update',
          taskId,
          '--title',
          'A newer agent title',
          '--revisions',
          JSON.stringify({ title: original.revisions.title }),
        ],
        'builder',
      )
      await alice
        .getByRole('heading', { name: 'A newer agent title', exact: true })
        .waitFor()
      assert.equal(
        await alice.getByLabel('Title', { exact: true }).inputValue(),
        'A stale local draft',
      )
      await alice
        .getByRole('button', { name: 'Save changes', exact: true })
        .click()
      await alice
        .getByRole('alert')
        .getByText(/draft is preserved/)
        .waitFor()
      assert.equal(
        (await run(['show', taskId])).task.title,
        'A newer agent title',
      )
      await alice
        .getByRole('button', { name: 'Cancel edit', exact: true })
        .click()
      await alice.getByLabel('Recipient', { exact: true }).selectOption('builder')
      await alice.getByLabel('Handoff message', { exact: true }).fill('Please implement and record the evidence.')
      await alice.getByRole('button', { name: 'Edit task', exact: true }).click()
      await alice.getByLabel('Status', { exact: true }).selectOption('in-progress')
      await alice.getByRole('button', { name: 'Save changes', exact: true }).click()
      await alice.getByRole('button', { name: 'Edit task', exact: true }).waitFor()
      assert.equal((await run(['show', taskId])).task.status, 'in-progress')
      await alice.getByRole('button', { name: 'Use latest task details', exact: true }).waitFor()
      assert.equal(await alice.getByRole('button', { name: 'Hand off', exact: true }).isDisabled(), true)
      assert.equal(await alice.getByLabel('Handoff message', { exact: true }).inputValue(), 'Please implement and record the evidence.')
      await alice.getByRole('button', { name: 'Use latest task details', exact: true }).click()
      await alice.getByRole('button', { name: 'Hand off', exact: true }).click()
      await bob
        .getByText('Please implement and record the evidence.', { exact: true })
        .waitFor()
      assert.equal((await run(['show', taskId])).task.assignee, 'builder')
      let lost = false
      const attempts = []
      await alice.route('**/automerge/operations', async route => {
        const operation = route.request().postDataJSON()
        if (operation.type === 'comment.add') attempts.push(operation)
        if (!lost && operation.type === 'comment.add') {
          lost = true
          assert.equal((await route.fetch()).status(), 200)
          await route.abort('failed')
        } else await route.continue()
      })
      await alice.getByLabel('Comment', { exact: true }).fill('Confirm exactly once after a lost response')
      await alice.getByRole('button', { name: 'Add comment', exact: true }).click()
      await alice.getByRole('button', { name: 'Retry saved request', exact: true }).click()
      await alice.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor({ state: 'hidden' })
      assert.equal(await alice.getByLabel('Comment', { exact: true }).inputValue(), '')
      assert.equal((await run(['show', taskId])).comments.filter(comment => comment.content === 'Confirm exactly once after a lost response').length, 1)
      assert.equal(attempts.length, 2)
      assert.deepEqual(attempts[0], attempts[1])
      await alice.unroute('**/automerge/operations')

      await alice.route('**/automerge/operations', route => route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: 'AMBIGUOUS_ACTOR', error: 'Ambiguous Actor: choose another reference' }),
      }))
      await alice.getByLabel('Comment', { exact: true }).fill('Preserve this draft after Actor rejection')
      await alice.getByRole('button', { name: 'Add comment', exact: true }).click()
      await alice.getByRole('alert').getByText(/Ambiguous Actor/).waitFor()
      assert.equal(await alice.getByRole('button', { name: 'Retry saved request', exact: true }).count(), 0)
      assert.equal(await alice.getByLabel('Comment', { exact: true }).inputValue(), 'Preserve this draft after Actor rejection')
      await alice.unroute('**/automerge/operations')
      await alice.getByLabel('Actor', { exact: true }).selectOption('bob')
      await alice.getByLabel('Comment', { exact: true }).fill('New request after correcting the Actor')
      await alice.getByRole('button', { name: 'Add comment', exact: true }).click()
      await alice.getByRole('paragraph').filter({ hasText: /^New request after correcting the Actor$/ }).waitFor()
      assert.equal((await run(['show', taskId])).comments.find(comment => comment.content === 'New request after correcting the Actor').actorId, 'bob')
      await alice.getByLabel('Actor', { exact: true }).selectOption('alice')

      let releaseSnapshot, captureSnapshot
      const released = new Promise(resolve => { releaseSnapshot = resolve })
      const captured = new Promise(resolve => { captureSnapshot = resolve })
      await alice.route('**/automerge/doc', async route => {
        const response = await route.fetch()
        captureSnapshot(await response.json())
        await released
        await route.fulfill({ response })
      })
      try {
        await alice.getByLabel('Comment', { exact: true }).fill('Save while another Actor creates work')
        await alice.getByRole('button', { name: 'Add comment', exact: true }).click()
        const oldSnapshot = await captured
        const created = await run(['task', 'create', '--title', 'Arrived during an HTTP refresh'], 'builder')
        const newCard = alice.getByRole('button', { name: /Arrived during an HTTP refresh/ })
        await newCard.waitFor()
        assert.equal(oldSnapshot.doc.tasks[created.result.taskId], undefined)
        releaseSnapshot()
        // This action waits for refresh() to finish and the write controls to unlock.
        await alice.getByRole('button', { name: 'Edit task', exact: true }).click()
        assert.equal(await newCard.isVisible(), true, 'an older HTTP response must not replace the WebSocket update')
        await alice.getByRole('button', { name: 'Cancel edit', exact: true }).click()
      } finally {
        releaseSnapshot()
        await alice.unroute('**/automerge/doc')
      }
      const output = resolve('output/playwright')
      await mkdir(output, { recursive: true })
      await alice.getByRole('button', { name: 'Close', exact: true }).click()
      await run([
        'task',
        'create',
        '--title',
        'Review the handoff evidence',
        '--status',
        'up-next',
        '--assignee',
        'bob',
      ])
      await alice
        .getByRole('button', { name: /Review the handoff evidence/ })
        .waitFor()
      const vein = (await run(['vein', 'create', '--title', 'Evidence-first reviews', '--goal', 'Ship the first release'])).result
      const reviewTask = (await run(['tasks'])).tasks.find(task => task.title === 'Review the handoff evidence')
      await run(['vein', 'add', vein.veinId, reviewTask.id])
      await run(['update', reviewTask.id, '--status', 'dead-end', '--revisions',
        JSON.stringify({ status: (await run(['show', reviewTask.id])).revisions.status })])
      await alice.getByRole('region', { name: 'Dead end' })
        .getByRole('button', { name: /Review the handoff evidence/ }).waitFor()
      await alice.getByLabel('Status filter').selectOption('review')
      await alice.getByRole('button', { name: 'Goals', exact: true }).click()
      const goal = alice.getByRole('article', { name: 'Ship the first release' })
      await goal.getByText('Ready for a verdict', { exact: true }).waitFor()
      assert.match(await goal.textContent(), /Evidence-first reviews.*Open.*1 task/)
      await alice.screenshot({ path: join(output, 'pardner-goals.png'), fullPage: true })
      await goal.getByRole('button', { name: 'Evidence-first reviews', exact: true }).click()
      await alice.getByRole('button', { name: /Review the handoff evidence.*Evidence-first reviews/ }).waitFor()
      assert.equal(await alice.getByLabel('Status filter').inputValue(), '', 'showing a vein clears filters that could hide its tasks')
      assert.equal(await alice.getByRole('button', { name: /Arrived during an HTTP refresh/ }).count(), 0,
        'the vein filter hides tasks outside the vein')
      await alice.getByLabel('Vein', { exact: true }).selectOption('')
      await alice.getByRole('button', { name: /Arrived during an HTTP refresh/ }).first().waitFor()
      await alice.screenshot({
        path: join(output, 'pardner-desktop.png'),
        fullPage: true,
      })
      await bob.setViewportSize({ width: 390, height: 844 })
      await bob.screenshot({
        path: join(output, 'pardner-mobile.png'),
        fullPage: true,
      })
      assert.equal(
        await bob.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      )
      assert.deepEqual(errors, [])
    } catch (error) {
      for (const context of browser?.contexts() || []) {
        for (const page of context.pages())
          console.error(await page.locator('body').innerText())
      }
      console.error(errors)
      throw error
    } finally {
      await browser?.close()
      await service.stop()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
