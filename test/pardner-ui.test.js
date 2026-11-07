import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, webkit } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'
import { withWorkspace } from '../support/ui-workspace.js'
import { operationHttp } from '../lib/native-peer-client.js'

for (const uuidAvailable of [true, false]) it(
  `uses shared browser operations with crypto.randomUUID ${uuidAvailable ? 'available' : 'unavailable'}`,
  { timeout: 60000 },
  async t => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-ui-'))
    const service = await startCliService(directory)
    let browser
    const errors = []
    const run = async (args, actor = 'alice') => {
      const output = await cli(directory, [...args, '--actor', actor])
      assert.equal(output.code, 0, output.stdout + output.stderr)
      return output.result
    }
    t.after(async () => {
      await browser?.close()
      await service.stop()
      await rm(directory, { recursive: true, force: true })
    }, { timeout: 60000 })
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
      assert.equal(await alice.getByLabel('Title', { exact: true }).evaluate(input => input === document.activeElement), true,
        'opening New task focuses the title')
      assert.deepEqual(await alice.getByLabel('Priority', { exact: true }).locator('option').allTextContents(), ['P0', 'P1', 'P2', 'P3'])
      await alice.getByLabel('Title', { exact: true }).fill('   ')
      await alice.getByRole('button', { name: 'Create task', exact: true }).click()
      await alice.getByRole('alert').getByText('Enter a title that is not only spaces.', { exact: true }).waitFor()
      assert.equal((await run(['tasks'])).tasks.length, 0, 'a blank title never reaches the service')
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
      await alice.getByLabel('Comment', { exact: true }).fill('   ')
      assert.equal(await alice.getByRole('button', { name: 'Add comment', exact: true }).isDisabled(), true)
      await alice.getByRole('button', { name: 'Hand off work', exact: true }).click()
      assert.equal(await alice.getByRole('button', { name: 'Hand off', exact: true }).isDisabled(), true)
      assert.equal(await alice.getByLabel('Assigned to').count(), 1)
      await alice.getByRole('button', { name: 'Activity', exact: true }).click()
      assert.equal(await alice.getByLabel('Assigned to').count(), 0, 'board filters are hidden off the Tasks view')
      assert.equal(await alice.getByLabel('Status filter').count(), 0)
      await alice.getByRole('button', { name: 'Tasks', exact: true }).click()
      await alice
        .getByLabel('Comment', { exact: true })
        .fill('The requirements are ready for @builder.')
      await alice
        .getByRole('button', { name: 'Add comment', exact: true })
        .click()
      await bob
        .getByText('The requirements are ready for @builder.', { exact: true })
        .waitFor()
      const heading = (page) => page.getByRole('heading', { name: /^Comments \d/ })
      const headingText = async (page) => (await heading(page).textContent()).replace(/\s+/g, ' ').trim()
      await bob.getByText('Comments 1 · 1 new', { exact: true }).waitFor()
      // Alice's comments and new count arrive in the same task-context response, so wait for her rendered comment first.
      await alice.locator('article.comment').getByText('The requirements are ready for @builder.', { exact: true }).waitFor()
      assert.equal(await headingText(alice), 'Comments 1', 'authors are not told their own comment is new')
      assert.equal(await alice.getByText('New', { exact: true }).count(), 0)
      assert.equal(await bob.getByText('New', { exact: true }).count(), 1)
      assert.equal(await alice.getByRole('button', { name: 'Mark all read', exact: true }).isDisabled(), true)
      await bob.getByRole('button', { name: 'Mark all read', exact: true }).click()
      await bob.getByText('Comments 1', { exact: true }).waitFor()
      assert.equal(await headingText(bob), 'Comments 1')
      assert.equal(await bob.getByRole('button', { name: 'Mark all read', exact: true }).isDisabled(), true)
      assert.equal(await bob.getByText('New', { exact: true }).count(), 0)
      await bob.getByLabel('Comment', { exact: true }).fill('Seen')
      await bob.getByRole('button', { name: 'Add comment', exact: true }).click()
      await alice.getByText('Comments 2 · 1 new', { exact: true }).waitFor()
      assert.equal(await alice.getByText('New', { exact: true }).count(), 1)
      assert.equal(await alice.locator('.comment.is-new', { hasText: 'Seen' }).count(), 1, 'the tag sits on Bob\'s comment')
      assert.equal(await headingText(bob), 'Comments 2', 'Bob sees no new count for his own comment')
      assert.equal(await bob.locator('.mention', { hasText: '@builder' }).count(), 1, 'a delivered mention is chipped')
      await alice.getByLabel('Comment', { exact: true }).fill('ping @buildr ')
      await alice.getByText("@buildr matches no Actor and won't notify anyone.", { exact: true }).waitFor()
      assert.equal(await alice.getByRole('button', { name: 'Add comment', exact: true }).isDisabled(), false)
      await alice.getByLabel('Comment', { exact: true }).fill('ping @bui')
      assert.equal(await alice.locator('.mention-hint').count(), 0, 'a half-typed handle is not flagged')
      await alice.getByLabel('Comment', { exact: true }).fill('')
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
      await alice.locator('article.comment').getByText('New request after correcting the Actor', { exact: true }).waitFor()
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
      const veinRow = goal.locator(`li[data-vein-id="${vein.veinId}"]`)
      const veinStatus = alice.getByLabel('Status of vein Evidence-first reviews', { exact: true })
      assert.equal(await veinStatus.inputValue(), 'open')
      assert.match(await veinRow.textContent(), /1 task/)
      assert.equal(await veinRow.locator('.record-status').count(), 0, 'an Actor sees the select, not the pill')
      await alice.screenshot({ path: join(output, 'pardner-goals.png'), fullPage: true })

      // A pending request disables the record selects, and Retry still works.
      let lostVerdict = false
      await alice.route('**/automerge/operations', async route => {
        if (!lostVerdict && route.request().postDataJSON().type === 'vein.update') {
          lostVerdict = true
          await route.abort('failed')
        } else await route.continue()
      })
      await veinStatus.selectOption('proven')
      await alice.getByRole('button', { name: 'Retry saved request', exact: true }).first().waitFor()
      assert.equal(await veinStatus.isDisabled(), true, 'pending request disables the vein select')
      assert.equal(await alice.getByLabel('Status of goal Ship the first release', { exact: true }).isDisabled(), true)
      await alice.getByRole('button', { name: 'Retry saved request', exact: true }).first().click()
      await goal.getByText('Ready for a verdict', { exact: true }).waitFor({ state: 'hidden' })
      await alice.unroute('**/automerge/operations')
      assert.equal((await run(['vein', 'show', vein.veinId])).vein.status, 'proven')
      assert.equal(await veinStatus.inputValue(), 'proven')
      await veinStatus.selectOption('open')
      await goal.getByText('Ready for a verdict', { exact: true }).waitFor()
      await veinStatus.selectOption('proven')
      await goal.getByText('Ready for a verdict', { exact: true }).waitFor({ state: 'hidden' })
      await alice.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Status of vein Evidence-first reviews')

      // A stale change from the CLI lands in the vein row, never a task panel.
      let raced = false
      await alice.route('**/automerge/operations', async route => {
        if (raced) return route.continue()
        raced = true
        const current = (await run(['vein', 'show', vein.veinId])).revisions.status
        await run(['vein', 'update', vein.veinId, '--status', 'dead-end', '--revisions', JSON.stringify({ status: current })], 'builder')
        await route.continue()
      })
      await veinStatus.selectOption('abandoned')
      await veinRow.getByRole('alert').waitFor()
      assert.equal(await alice.locator('.side-panel [role="alert"]').count(), 0)
      await veinRow.getByRole('alert').getByRole('button', { name: 'Dismiss', exact: true }).click()
      assert.equal(await veinStatus.inputValue(), 'dead-end', 'the select falls back to the stored value')
      await veinStatus.selectOption('proven')
      await veinRow.getByRole('alert').waitFor({ state: 'hidden' })
      await alice.unroute('**/automerge/operations')
      assert.equal((await run(['vein', 'show', vein.veinId])).vein.status, 'proven')

      // A task panel open over Goals must not make "Status" ambiguous.
      await alice.getByRole('button', { name: 'Tasks', exact: true }).click()
      await alice.getByLabel('Status filter').selectOption('dead-end')
      await alice.getByRole('button', { name: /Review the handoff evidence/ }).click()
      await alice.getByRole('button', { name: 'Goals', exact: true }).click()
      assert.equal(await alice.getByLabel('Status', { exact: true }).count(), 1)
      await alice.getByRole('button', { name: 'Close', exact: true }).click()
      await alice.getByRole('button', { name: 'Tasks', exact: true }).click()
      await alice.getByLabel('Status filter').selectOption('review')
      await alice.getByRole('button', { name: 'Goals', exact: true }).click()

      const goalStatus = alice.getByLabel('Status of goal Ship the first release', { exact: true })
      await goalStatus.focus()
      await goalStatus.selectOption('achieved')
      await alice.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Status of goal Ship the first release')
      const [goalId] = (await run(['vein', 'show', vein.veinId])).vein.goalIds
      assert.equal((await run(['goal', 'show', goalId])).goal.status, 'achieved')
      assert.equal((await run(['vein', 'show', vein.veinId])).vein.status, 'proven', 'achieving a goal leaves its veins alone')
      assert.equal(await veinStatus.inputValue(), 'proven')
      await alice.screenshot({ path: join(output, 'pardner-goals-achieved.png'), fullPage: true })

      // Without an Actor the Goals view is read-only: pills, no selects.
      await alice.getByLabel('Actor', { exact: true }).selectOption('')
      assert.equal(await alice.locator('.goals select').count(), 0)
      assert.equal(await alice.locator('.goals .record-status').count(), 2)
      await alice.getByLabel('Actor', { exact: true }).selectOption('alice')
      await goalStatus.selectOption('open')
      await goalStatus.evaluate(element => element.value === 'open')
      await veinStatus.selectOption('open')
      await goal.getByText('Ready for a verdict', { exact: true }).waitFor()
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
    }
  },
)

// Reads one pixel column of an element screenshot; used to see scroll shadows.
async function pixelColumn(page, locator, x) {
  const png = (await locator.screenshot()).toString('base64')
  return page.evaluate(async ({ png, x }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const column = x < 0 ? image.width + x : x
    const { data } = context.getImageData(column, Math.floor(image.height / 2), 1, 1)
    return [data[0], data[1], data[2]]
  }, { png, x })
}

const MARKDOWN_FIXTURE = [
  '# Heading one',
  '',
  '## Heading two',
  '',
  '### Heading three',
  '',
  '> A quoted decision from the review.',
  '',
  '- [ ] Write the failing assertion first',
  '- [x] Keep **bold** and `code` inline in a task item',
  '',
  `| ${Array.from({ length: 12 }, (_, index) => `Measurement${String(index + 1).padStart(2, '0')}`).join(' | ')} |`,
  `|${' --- |'.repeat(12)}`,
  `| ${Array.from({ length: 12 }, (_, index) => `value${index + 1}`).join(' | ')} |`,
  '',
  '```',
  `const line = '${'x'.repeat(200)}'`,
  '```',
  '',
  '```',
  'short()',
  '```',
].join('\n')

for (const engine of [chromium, webkit]) it(`gives user-authored Markdown its own subordinate scale in ${engine.name()}`, { timeout: 60000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, operate, open }) => {
    const { result: { taskId } } = await operate('task.create', { title: 'Render the Markdown fixture', description: MARKDOWN_FIXTURE })
    await operate('comment.add', { taskId, text: MARKDOWN_FIXTURE })
    await open()
    await page.getByRole('button', { name: /Render the Markdown fixture/ }).click()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const description = panel.locator('.markdown').first()
    const comment = panel.locator('.comment .markdown')
    await comment.getByRole('heading', { name: 'Heading one' }).waitFor()
    const styles = target => target.evaluate(root => {
      const pick = (selector, ...properties) => {
        const style = getComputedStyle(root.querySelector(selector))
        return Object.fromEntries(properties.map(property => [property, style[property]]))
      }
      return {
        h1: pick('h1', 'fontSize', 'fontWeight', 'lineHeight', 'marginTop'),
        h2: pick('h2', 'fontSize', 'fontWeight', 'lineHeight'),
        h3: pick('h3', 'fontSize', 'fontWeight', 'color'),
        quote: pick('blockquote', 'borderLeftWidth', 'borderLeftStyle', 'color', 'paddingLeft'),
        td: pick('td', 'borderTopWidth', 'borderLeftWidth', 'paddingTop', 'paddingLeft', 'borderCollapse'),
        th: pick('th', 'backgroundColor'),
        pre: pick('pre', 'backgroundImage', 'backgroundAttachment'),
        checkbox: pick('input[type=checkbox]', 'width', 'minHeight', 'paddingLeft'),
        muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
        mutedColor: (() => { const probe = document.createElement('span'); probe.style.color = 'var(--muted)'; root.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color })(),
      }
    })
    const fromDescription = await styles(description)
    assert.deepEqual(await styles(comment), fromDescription, 'descriptions and comments render Markdown identically')
    const size = value => parseFloat(value)
    assert.ok(size(fromDescription.h1.fontSize) < 17, `h1 ${fromDescription.h1.fontSize} is below the 17px section heading`)
    assert.ok(size(fromDescription.h1.fontSize) >= size(fromDescription.h2.fontSize))
    assert.ok(size(fromDescription.h2.fontSize) >= size(fromDescription.h3.fontSize))
    assert.ok(Number(fromDescription.h1.fontWeight) >= 700 && Number(fromDescription.h2.fontWeight) >= 700, 'h1 and h2 are bold')
    assert.equal(fromDescription.h3.color, fromDescription.mutedColor, 'h3 is muted')
    assert.ok(size(fromDescription.quote.borderLeftWidth) >= 2 && fromDescription.quote.borderLeftStyle === 'solid')
    assert.equal(fromDescription.quote.color, fromDescription.mutedColor, 'blockquote text is muted')
    assert.equal(fromDescription.td.borderTopWidth, '1px')
    assert.equal(fromDescription.td.borderLeftWidth, '1px')
    assert.ok(size(fromDescription.td.paddingTop) >= 6 && size(fromDescription.td.paddingLeft) >= 10, 'cells have at least 6×10px padding')
    assert.notEqual(fromDescription.th.backgroundColor, 'rgba(0, 0, 0, 0)', 'header cells are tinted')
    assert.match(fromDescription.pre.backgroundImage, /gradient/)
    assert.match(fromDescription.pre.backgroundAttachment, /local/)

    for (const target of [description, comment]) {
      assert.equal(await target.getByRole('table').count(), 1, 'the wrapped table keeps table semantics')
      const scroll = await target.locator('.md-table').evaluate(wrapper => ({
        overflows: wrapper.scrollWidth > wrapper.clientWidth, overflowX: getComputedStyle(wrapper).overflowX,
        table: getComputedStyle(wrapper.querySelector('table')).display,
      }))
      assert.deepEqual(scroll, { overflows: true, overflowX: 'auto', table: 'table' }, 'a wide table scrolls inside .md-table')
      const [long, short] = await target.locator('pre').all()
      assert.equal(await long.evaluate(pre => pre.scrollWidth > pre.clientWidth), true)
      assert.equal(await short.evaluate(pre => pre.scrollWidth > pre.clientWidth), false)
      const shortEdge = await pixelColumn(page, short, -3)
      const shortMiddle = await pixelColumn(page, short, 40)
      const longEdge = await pixelColumn(page, long, -3)
      assert.deepEqual(shortEdge, shortMiddle, 'a short code block shows no scroll shadow')
      assert.ok(Math.max(...longEdge.map((channel, index) => Math.abs(channel - shortMiddle[index]))) >= 8,
        `an overflowing code block shows a scroll shadow (${longEdge} vs ${shortMiddle})`)
    }
    assert.equal(await panel.evaluate(aside => aside.scrollWidth <= aside.clientWidth), true, 'wide Markdown never widens the panel')
    const output = resolve('output/playwright')
    await mkdir(output, { recursive: true })
    await description.screenshot({ path: join(output, `pardner-markdown-${engine.name()}.png`) })

    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      for (const target of [description, comment]) {
        const items = await target.locator('li.task-list-item').evaluateAll(list => list.map(item => {
          const checkbox = item.querySelector('input[type=checkbox]')
          const text = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
          const range = document.createRange()
          range.selectNodeContents(text)
          const line = range.getClientRects()[0]
          const box = checkbox.getBoundingClientRect()
          const li = item.getBoundingClientRect()
          return { checkbox: { left: box.left, right: box.right, top: box.top, width: box.width, height: box.height },
            text: { left: line.left, top: line.top, height: line.height }, li: { left: li.left, right: li.right, top: li.top } }
        }))
        assert.equal(items.length, 2)
        for (const { checkbox, text, li } of items) {
          const where = `at ${width}: ${JSON.stringify({ checkbox, text, li })}`
          assert.ok(checkbox.width <= 16, `checkbox is at most 16px wide ${where}`)
          assert.ok(checkbox.right <= text.left, `checkbox sits left of its text ${where}`)
          assert.ok(Math.abs((checkbox.top + checkbox.height / 2) - (text.top + text.height / 2)) <= 4, `checkbox shares the first line ${where}`)
          assert.ok(checkbox.left >= li.left && checkbox.right <= li.right && checkbox.top >= li.top - 4, `checkbox stays inside its item ${where}`)
        }
      }
    }
  })
})

// Runs `count` seeding operations a batch at a time.
async function seed(count, operation, batch = 25) {
  for (let start = 0; start < count; start += batch)
    await Promise.all(Array.from({ length: Math.min(batch, count - start) }, (_, offset) => operation(start + offset)))
}

for (const engine of [chromium, webkit]) it(`keeps the app frame in the viewport and scrolls its regions in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1024, height: 700 } }, async ({ page, operate, open }) => {
    const created = []
    await seed(40, async index => created.push((await operate('task.create', {
      title: `Backlog task ${index + 1}`, description: 'Seeded to overflow one column.',
    })).result.taskId))
    await seed(260, index => operate('comment.add', { taskId: created[0], text: `Activity event ${index + 1}` }))
    await seed(12, index => operate('vein.create', {
      title: `Vein ${index + 1}`, goal: { title: `Goal ${index + 1}`, description: 'Seeded to overflow the goals view.' },
    }))
    await open()
    await page.getByRole('button', { name: /Backlog task 40/ }).waitFor()
    const nav = name => page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name, exact: true })
    const frame = () => page.evaluate(() => {
      const top = selector => document.querySelector(selector).getBoundingClientRect().top
      const newTask = [...document.querySelectorAll('header button')].find(button => button.textContent === 'New task')
      return {
        fits: document.scrollingElement.scrollHeight <= innerHeight + 1,
        scrollHeight: document.scrollingElement.scrollHeight, innerHeight,
        scrollY, header: top('header'), nav: top('nav'), newTask: newTask.getBoundingClientRect().top,
      }
    })
    const assertFrame = async where => {
      const state = await frame()
      assert.equal(state.fits, true, `document stays within the viewport ${where}: ${JSON.stringify(state)}`)
      assert.equal(state.scrollY, 0, `the document never scrolls ${where}`)
      assert.ok(state.header >= 0 && state.nav >= 0 && state.newTask >= 0, `header, nav and New task stay visible ${where}: ${JSON.stringify(state)}`)
    }
    const scrollMain = () => page.locator('main').evaluate(main => { main.scrollTop = 1e6; return main.scrollTop })

    for (const [width, height] of [[1024, 700], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height })
      const at = view => `on ${view} at ${width}×${height}`
      await nav('Tasks').click()
      await assertFrame(at('Tasks'))
      const backlog = page.getByRole('region', { name: 'Backlog' })
      assert.ok(await backlog.evaluate(column => { column.scrollTop = 1e6; return column.scrollTop }) > 0, `the long column scrolls inside itself ${at('Tasks')}`)
      await assertFrame(`after scrolling a column ${at('Tasks')}`)
      assert.equal(await backlog.getByRole('heading').evaluate(heading => {
        const column = heading.parentElement.getBoundingClientRect()
        return Math.abs(heading.getBoundingClientRect().top - column.top) < 40
      }), true, 'the column heading stays in view while its cards scroll')
      const board = await page.locator('.board').evaluate(board => {
        const overflows = board.scrollWidth > board.clientWidth
        board.scrollLeft = 1e6
        return { overflows, scrolled: board.scrollLeft > 0, page: document.scrollingElement.scrollWidth <= innerWidth }
      })
      if (width === 1024) assert.deepEqual(board, { overflows: true, scrolled: true, page: true }, 'the board scrolls sideways inside itself')

      await nav('Goals').click()
      await page.getByRole('article', { name: 'Goal 12' }).waitFor()
      await assertFrame(at('Goals'))
      assert.ok(await scrollMain() > 0, `the goals region scrolls ${at('Goals')}`)
      await assertFrame(`after scrolling ${at('Goals')}`)

      await nav('Activity').click()
      await page.getByText(/commented on/).first().waitFor()
      assert.equal(await page.locator('main').evaluate(main => main.scrollTop), 0, 'a view switch starts at the top')
      assert.ok(await page.locator('.activity article').count() >= 100)
      if (width === 1024) assert.equal(await page.locator('.activity article').count(), 100, 'Activity pages at 100 rows')
      await assertFrame(at('Activity'))
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, `no sideways overflow with the Activity filters ${at('Activity')}`)
      assert.ok(await scrollMain() > 0, `the activity region scrolls ${at('Activity')}`)
      await assertFrame(`after scrolling ${at('Activity')}`)
      if (width === 1024) {
        await page.getByRole('button', { name: 'Show older activity', exact: true }).click()
        assert.ok(await page.locator('.activity article').count() > 100)
        assert.ok(await scrollMain() > 0, `the activity region still scrolls ${at('Activity')}`)
        await assertFrame(`after paging ${at('Activity')}`)
      }
    }

    // A request lost before the service saw it stays pending across a reload.
    await page.setViewportSize({ width: 1024, height: 700 })
    await page.route('**/automerge/operations', route => route.abort('failed'))
    await nav('Tasks').click()
    await page.getByRole('button', { name: 'New task', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Lost before the service saw it')
    await page.getByRole('button', { name: 'Create task', exact: true }).click()
    await page.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor()
    await page.unroute('**/automerge/operations')
    await page.reload()
    await page.getByText('A request is awaiting confirmation.').waitFor()
    for (const view of ['Tasks', 'Goals', 'Activity']) {
      await nav(view).click()
      await assertFrame(`with the pending notice on ${view} at 1024×700`)
      if (view !== 'Tasks') assert.ok(await scrollMain() > 0)
      await assertFrame(`after scrolling with the pending notice on ${view} at 1024×700`)
    }
    await page.screenshot({ path: join(resolve('output/playwright'), `pardner-frame-${engine.name()}.png`), fullPage: true })
  })
})

for (const engine of [chromium, webkit]) it(`never overflows sideways at mid widths and never leaves a panel sliver in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, operate, open }) => {
    const longTitle = `Evidence-first reviews for the companion devices ${'and their long-running agent handoffs '.repeat(3)}`.slice(0, 120)
    assert.equal(longTitle.length, 120)
    const { result: { veinId } } = await operate('vein.create', { title: longTitle, goal: { title: 'Ship the first release' } })
    await operate('task.create', { title: 'Review the handoff evidence', status: 'review', veinIds: [veinId] })
    await operate('task.create', { title: 'Coordinate the first release', status: 'in-progress' })
    await operate('task.create', { title: 'Plan the next milestone' })
    await open()
    await page.getByRole('button', { name: /Review the handoff evidence/ }).waitFor()
    const vein = page.getByLabel('Vein', { exact: true })
    const widths = [...Array.from({ length: 101 }, (_, index) => 320 + index * 16), 761, 767, 768, 839, 840, 867]
    const sweep = async when => {
      const overflowing = []
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        const scrollWidth = await page.evaluate(() => document.scrollingElement.scrollWidth)
        if (scrollWidth > width) overflowing.push(`${width}→${scrollWidth}`)
      }
      assert.deepEqual(overflowing, [], `the page never scrolls sideways ${when}`)
    }
    await sweep('with no vein selected')
    await page.setViewportSize({ width: 1440, height: 900 })
    assert.equal(await vein.getAttribute('title'), 'All veins')
    await vein.selectOption(veinId)
    assert.equal(await vein.getAttribute('title'), longTitle, 'the Vein select names the full selected vein')
    await sweep('with the long vein selected')

    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const filters = await page.getByRole('navigation', { name: 'Workspace views' }).evaluate(nav => {
        const style = getComputedStyle(nav)
        return {
          right: nav.getBoundingClientRect().right - parseFloat(style.paddingRight),
          labels: [...nav.querySelectorAll('label')].map(label => {
            const box = label.getBoundingClientRect()
            return { left: box.left, right: box.right, select: label.querySelector('select').getBoundingClientRect().width }
          }),
        }
      })
      const where = `at ${width}: ${JSON.stringify(filters)}`
      assert.equal(filters.labels.length, 3)
      for (const [index, label] of filters.labels.entries()) {
        assert.ok(label.select <= 191, `filter selects keep their share ${where}`)
        if (index) assert.ok(label.left - filters.labels[index - 1].right <= 10, `filters form one group ${where}`)
      }
      assert.ok(Math.abs(filters.labels.at(-1).right - filters.right) <= 1, `filters sit at the right of the nav ${where}`)
    }

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.getByRole('button', { name: /Review the handoff evidence/ }).click()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const close = panel.getByRole('button', { name: 'Close', exact: true })
    await close.waitFor()
    const closeBox = await close.boundingBox()
    assert.ok(closeBox.x + closeBox.width <= 768, `Close sits inside the viewport at 768: ${JSON.stringify(closeBox)}`)
    for (const width of [761, 768, 800, 839, 840, 867, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      const { innerWidth, panelWidth } = await panel.evaluate(aside => ({ innerWidth, panelWidth: aside.getBoundingClientRect().width }))
      const sliver = innerWidth - panelWidth
      assert.ok(sliver === 0 || sliver >= 160, `the board beside the panel is 0 or ≥ 160px at ${width}, got ${sliver}`)
    }
  })
})

// Box of a locator, or null when it is absent.
const box = locator => locator.evaluate(element => {
  const { top, bottom, left, right } = element.getBoundingClientRect()
  return { top, bottom, left, right }
})

for (const engine of [chromium, webkit]) it(`shows errors where the work is in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    const { result: { taskId } } = await operate('task.create', { title: 'Route errors to the work' })
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const alert = page.getByRole('alert')

    // Blank title: a compact field error attached to its input.
    await page.getByRole('button', { name: 'New task', exact: true }).click()
    const title = page.getByLabel('Title', { exact: true })
    const description = page.getByLabel('Description', { exact: true })
    const before = await box(description)
    await title.fill('   ')
    await page.getByRole('button', { name: 'Create task', exact: true }).click()
    await alert.getByText('Enter a title that is not only spaces.', { exact: true }).waitFor()
    assert.equal(await title.getAttribute('aria-invalid'), 'true')
    const [input, fieldError, after] = [await box(title), await box(alert), await box(description)]
    const lineHeight = await alert.evaluate(element => parseFloat(getComputedStyle(element).lineHeight))
    assert.ok(fieldError.top >= input.bottom && fieldError.top - input.bottom <= 8, `the field error sits ≤ 8px below its input: ${JSON.stringify({ input, fieldError })}`)
    assert.ok(fieldError.bottom - fieldError.top <= lineHeight + 1, 'the field error is one line')
    assert.ok(after.top - before.top <= lineHeight + 8, `the field error adds at most one line: ${before.top} → ${after.top}`)
    assert.notEqual(await title.evaluate(element => getComputedStyle(element).borderTopColor),
      await description.evaluate(element => getComputedStyle(element).borderTopColor), 'the invalid input has a danger border')
    await page.getByRole('button', { name: 'Close', exact: true }).click()

    // Error, notice and warning have distinct, tokenised tones; the notice is not red.
    const tones = await page.evaluate(() => Object.fromEntries(['error', 'notice', 'notice warning'].map(className => {
      const probe = document.createElement('div')
      probe.className = className
      document.querySelector('.app').append(probe)
      const style = getComputedStyle(probe)
      const tone = { border: style.borderBottomColor, background: style.backgroundColor, color: style.color }
      probe.remove()
      return [className, tone]
    })))
    assert.equal(new Set(Object.values(tones).map(tone => tone.border)).size, 3, `distinct borders: ${JSON.stringify(tones)}`)
    assert.notEqual(tones.notice.color, tones.error.color, 'the notice does not use the error colour')
    assert.notEqual(tones.notice.background, tones.error.background, 'the notice does not use the error background')

    const openTask = async () => {
      await page.getByRole('button', { name: /Route errors to the work|A newer agent title/ }).click()
      await panel.getByRole('button', { name: 'Edit task', exact: true }).waitFor()
    }
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // STALE_UPDATE renders inside the edit form, above Save changes, and Cancel edit clears it.
      await openTask()
      await panel.getByRole('button', { name: 'Edit task', exact: true }).click()
      await panel.getByLabel('Title', { exact: true }).fill(`A stale local draft at ${width}`)
      const { revisions } = await run(['show', taskId])
      await run(['update', taskId, '--title', `A newer agent title ${width}`, '--revisions', JSON.stringify({ title: revisions.title })])
      await panel.getByRole('heading', { name: `A newer agent title ${width}`, exact: true }).waitFor()
      await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
      await alert.getByText(/draft is preserved/).waitFor()
      assert.equal(await panel.getByRole('alert').count(), 1, `the stale error renders inside the panel at ${width}`)
      assert.equal(await panel.getByRole('region', { name: 'Edit task' }).getByRole('alert').count(), 1, `the stale error renders inside the edit form at ${width}`)
      const save = await box(panel.getByRole('button', { name: 'Save changes', exact: true }))
      const cancel = await box(panel.getByRole('button', { name: 'Cancel edit', exact: true }))
      const notice = await box(alert)
      assert.ok(notice.bottom <= save.top && notice.bottom <= cancel.top, `the error sits above Save/Cancel at ${width}: ${JSON.stringify({ notice, save, cancel })}`)
      assert.equal(await alert.getByRole('button', { name: 'Dismiss', exact: true }).count(), 1, 'a non-pending error can be dismissed')
      await panel.getByRole('button', { name: 'Cancel edit', exact: true }).click()
      assert.equal(await alert.count(), 0, `Cancel edit clears the error at ${width}`)
      await panel.getByRole('button', { name: 'Close', exact: true }).click()
    }

    // A lost response keeps Retry inside the panel, then on the page after Escape; it replays exactly once.
    await page.setViewportSize({ width: 375, height: 812 })
    await openTask()
    const attempts = []
    let dropped = 0
    await page.route('**/automerge/operations', async route => {
      const operation = route.request().postDataJSON()
      if (operation.type === 'comment.add') attempts.push(operation)
      if (operation.type === 'comment.add' && dropped === 0) {
        dropped++
        assert.equal((await route.fetch()).status(), 200)
        await route.abort('failed')
      } else if (operation.type === 'comment.add' && dropped === 1) {
        dropped++
        await route.abort('failed')
      } else await route.continue()
    })
    await panel.getByLabel('Comment', { exact: true }).fill('Replay this comment once')
    await panel.getByRole('button', { name: 'Add comment', exact: true }).click()
    await panel.getByRole('alert').getByRole('button', { name: 'Retry saved request', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Dismiss', exact: true }).count(), 0, 'a pending error cannot be dismissed')
    const commentForm = panel.getByRole('button', { name: 'Add comment', exact: true }).locator('xpath=ancestor::form')
    assert.equal(await commentForm.getByRole('alert').count(), 1, 'the comment error renders in the comment form')
    await page.keyboard.press('Escape')
    await panel.waitFor({ state: 'detached' })
    await page.getByText('A request is awaiting confirmation.').waitFor()
    assert.equal(await alert.count(), 0, 'Escape clears the error but not the pending request')
    await page.getByRole('button', { name: 'Retry saved request', exact: true }).click()
    // The second attempt is lost before the service sees it: the page slot keeps Retry in flow under the header.
    await alert.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor()
    const slot = await page.locator('.app > .error').evaluate(element => ({
      position: getComputedStyle(element).position, top: element.getBoundingClientRect().top,
      header: document.querySelector('header').getBoundingClientRect().bottom,
    }))
    assert.notEqual(slot.position, 'fixed', 'the page error is in normal flow')
    assert.ok(slot.top >= slot.header - 1, `the page error sits under the header: ${JSON.stringify(slot)}`)
    assert.equal(await page.getByRole('button', { name: 'Dismiss', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Retry saved request', exact: true }).click()
    await page.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor({ state: 'hidden' })
    assert.equal((await run(['show', taskId])).comments.filter(comment => comment.content === 'Replay this comment once').length, 1)
    assert.equal(attempts.length, 3)
    assert.deepEqual(attempts[0], attempts[2])
    await page.unroute('**/automerge/operations')

    // AMBIGUOUS_ACTOR: Dismiss clears the alert and keeps the draft.
    await openTask()
    await page.route('**/automerge/operations', route => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'AMBIGUOUS_ACTOR', error: 'Ambiguous Actor: choose another reference' }),
    }))
    await panel.getByLabel('Comment', { exact: true }).fill('Keep this draft')
    await panel.getByRole('button', { name: 'Add comment', exact: true }).click()
    await commentForm.getByRole('alert').getByText(/Ambiguous Actor/).waitFor()
    await alert.getByRole('button', { name: 'Dismiss', exact: true }).click()
    assert.equal(await alert.count(), 0, 'Dismiss clears the error')
    assert.equal(await panel.getByLabel('Comment', { exact: true }).inputValue(), 'Keep this draft')
    await page.unroute('**/automerge/operations')
  })
})

for (const engine of [chromium, webkit]) it(`shows a connection error inside the failed form in ${engine.name()}`, { timeout: 60000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 375, height: 640 } }, async ({ page, service, open }) => {
    await page.goto(`${service.httpUrl}/pardner/`)
    const token = page.getByLabel('Local service token')
    await token.fill('incorrect')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    const alert = page.getByRole('alert')
    await alert.waitFor()
    assert.equal(await alert.evaluate(element => Boolean(element.closest('form')?.querySelector('input[type=password]'))), true,
      'the token error renders inside the token form')
    const where = await alert.evaluate(element => {
      const { top, bottom } = element.getBoundingClientRect()
      return { top, bottom, innerHeight }
    })
    assert.ok(where.top >= 0 && where.bottom <= where.innerHeight + 1, `the token error is in the viewport: ${JSON.stringify(where)}`)
    await token.fill('another attempt')
    assert.equal(await alert.count(), 0, 'editing the token clears its error')

    // Failures still in flight when the user forgets the workspace never reach the fresh form (P1-05).
    await open()
    await page.route('**/automerge/**', route => route.abort('failed'))
    await page.reload()
    await alert.getByRole('button', { name: 'Retry connection', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Forget this workspace', exact: true }).click()
    await page.getByLabel('Local service token').waitFor()
    await page.waitForTimeout(1500)
    assert.equal(await alert.count(), 0, 'no stale error after Forget')
  })
})

for (const engine of [chromium, webkit]) it(`moves focus into panels and back to their opener in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open, service }) => {
    await run(['actors', 'register', 'bob', '--handle', 'bob', '--kind', 'human'])
    const { result: { taskId } } = await operate('task.create', { title: 'Keep focus where the work is' })
    await operate('task.create', { title: 'A neighbouring card' })

    // On loopback the token field is focused on arrival.
    await page.goto(`${service.httpUrl}/pardner/`)
    await page.getByLabel('Local service token').waitFor()
    await page.waitForFunction(() => document.activeElement?.type === 'password')
    await open()

    const panel = page.getByRole('complementary', { name: 'Task details' })
    const heading = panel.getByRole('heading', { level: 2 })
    const focused = () => page.evaluate(() => {
      const element = document.activeElement
      return { tag: element?.tagName, text: element?.textContent?.trim(), taskId: element?.dataset?.taskId, label: element?.getAttribute('aria-label') }
    })
    const waitForFocus = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 5000 })
    const card = page.locator(`.task-card[data-task-id="${taskId}"]`)

    // Opening a card focuses the details heading; Escape and Close return focus to the card.
    await card.click()
    await waitForFocus(() => document.activeElement?.matches('.side-panel h2'))
    assert.equal(await card.getAttribute('aria-current'), 'true', 'the open card is current')
    const neighbour = page.getByRole('button', { name: /A neighbouring card/ })
    assert.equal(await neighbour.getAttribute('aria-current'), null)
    // Buttons transition their border colour, so wait for it to settle.
    await page.waitForFunction(() => document.getAnimations().length === 0)
    const borders = await page.evaluate(id => ({
      open: getComputedStyle(document.querySelector(`.task-card[data-task-id="${id}"]`)).borderTopColor,
      other: getComputedStyle([...document.querySelectorAll('.task-card')].find(card => card.dataset.taskId !== id)).borderTopColor,
      accent: (() => { const probe = document.createElement('span'); probe.style.color = 'var(--accent)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color })(),
    }), taskId)
    assert.equal(borders.open, borders.accent, `the open card has the accent border: ${JSON.stringify(borders)}`)
    assert.notEqual(borders.open, borders.other)
    await page.keyboard.press('Escape')
    await waitForFocus(id => document.activeElement?.dataset.taskId === id, taskId)
    await card.click()
    await waitForFocus(() => document.activeElement?.matches('.side-panel h2'))
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await waitForFocus(id => document.activeElement?.dataset.taskId === id, taskId)

    // New task focuses Title; Close returns to New task.
    await page.getByRole('button', { name: 'New task', exact: true }).click()
    await waitForFocus(() => document.activeElement?.name === 'title')
    await page.getByRole('region', { name: 'New task' }).getByRole('button', { name: 'Close', exact: true }).click()
    await waitForFocus(() => document.activeElement?.textContent === 'New task')

    // Edit task focuses Title; Cancel edit and Save changes return to Edit task; a failed Save focuses Save changes.
    await card.click()
    await waitForFocus(() => document.activeElement?.matches('.side-panel h2'))
    const editTask = panel.getByRole('button', { name: 'Edit task', exact: true })
    await editTask.click()
    await waitForFocus(() => document.activeElement?.name === 'title' && Boolean(document.activeElement.closest('.editor')))
    await panel.getByRole('button', { name: 'Cancel edit', exact: true }).click()
    await waitForFocus(() => document.activeElement?.textContent === 'Edit task')
    await editTask.click()
    await panel.getByLabel('Title', { exact: true }).fill('Keep focus where the work is, edited')
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
    await heading.getByText('Keep focus where the work is, edited', { exact: true }).waitFor()
    await waitForFocus(() => document.activeElement?.textContent === 'Edit task')
    await editTask.click()
    await panel.getByLabel('Title', { exact: true }).fill('A stale draft')
    const { revisions } = await run(['show', taskId])
    await run(['update', taskId, '--title', 'A newer title', '--revisions', JSON.stringify({ title: revisions.title })])
    await heading.getByText('A newer title', { exact: true }).waitFor()
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('alert').getByText(/draft is preserved/).waitFor()
    await waitForFocus(() => document.activeElement?.textContent === 'Save changes')
    await panel.getByRole('button', { name: 'Cancel edit', exact: true }).click()

    // Switching Actor with details open leaves focus on the Actor select.
    const actor = page.getByLabel('Actor', { exact: true })
    await actor.focus()
    await actor.selectOption('bob')
    await panel.getByRole('button', { name: 'Edit task', exact: true }).waitFor()
    await page.waitForTimeout(300)
    assert.equal(await actor.evaluate(select => select === document.activeElement), true, `focus stays on the Actor select: ${JSON.stringify(await focused())}`)
    await actor.selectOption('alice')
    await page.keyboard.press('Escape')

    // An Activity button is an opener too.
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Activity', exact: true }).click()
    const activityButton = page.locator('.activity article button[data-task-id]').first()
    const activityLabel = await activityButton.textContent()
    await activityButton.click()
    await waitForFocus(() => document.activeElement?.matches('.side-panel h2'))
    await page.keyboard.press('Escape')
    await waitForFocus(text => document.activeElement?.closest('.activity') && document.activeElement.textContent === text, activityLabel)
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Tasks', exact: true }).click()

    // After creating a task its card becomes the opener.
    await page.getByRole('button', { name: 'New task', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Created with focus kept')
    await page.getByRole('button', { name: 'Create task', exact: true }).click()
    await heading.getByText('Created with focus kept', { exact: true }).waitFor()
    await waitForFocus(() => document.activeElement?.matches('.side-panel h2'))
    const createdId = (await run(['tasks'])).tasks.find(task => task.title === 'Created with focus kept').id
    await page.keyboard.press('Escape')
    await waitForFocus(id => document.activeElement?.dataset.taskId === id, createdId)
  })
})

it('describes Activity and task History as plain sentences', { timeout: 120000 }, async () => {
  await withWorkspace(chromium, { viewport: { width: 1440, height: 900 } }, async ({ page, run, open, token, service }) => {
    const as = (actor, type, payload) => operationHttp(service.httpUrl, token, type, payload, actor)
    await run(['actors', 'register', 'carol', '--handle', 'carol', '--kind', 'human', '--display-name', 'Carol Moreno'])
    await run(['actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent', '--display-name', 'Builder'])
    const { taskId } = (await as('carol', 'task.create', { title: 'Ship the release', assignee: 'carol' })).result
    const revisions = async fields => Object.fromEntries(Object.entries((await run(['show', taskId])).revisions).filter(([field]) => fields.includes(field)))
    await as('carol', 'task.update', { taskId, updates: { status: 'review' }, expectedRevisions: await revisions(['status']) })
    await as('carol', 'comment.add', { taskId, text: 'Looks fine to me' })
    await as('carol', 'task.handoff', { taskId, to: 'builder', status: 'completed', message: 'Over to you', expectedRevisions: await revisions(['assignee', 'status']) })
    await as('builder', 'task.link-commit', { taskId, commit: { hash: 'a1b2c3d4e5f6', message: 'feat: ship it' } })
    const { veinId } = (await as('carol', 'vein.create', { title: 'Launch plan', goal: { title: 'Launch well' } })).result
    await open()
    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Activity', exact: true }).click()
    const activity = page.locator('.activity')
    await activity.getByText('Carol Moreno moved Ship the release to Review', { exact: false }).first().waitFor()
    const visible = await activity.innerText()
    assert.ok(!visible.includes('task.update'), `raw operation types stay out of view: ${visible}`)
    assert.ok(!/ · (human|agent)/.test(visible), `no kind suffix in Activity: ${visible}`)
    assert.match(visible, /Carol Moreno moved Ship the release to Review/)
    assert.match(visible, /Carol Moreno handed Ship the release to Builder and set it to Completed/)
    assert.match(visible, /Builder linked commit a1b2c3d to Ship the release/)
    assert.equal(await activity.locator('article[title="task.update"]').count(), 1, 'the raw type is only a tooltip')
    const veinRow = activity.locator('article', { hasText: 'started vein' })
    await veinRow.getByRole('button', { name: 'Launch plan', exact: true }).click()
    await page.getByLabel('Vein', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Vein', { exact: true }).inputValue(), veinId)
    assert.equal(await page.locator('.board').count(), 1, 'the vein subject shows Tasks')

    await page.getByRole('navigation', { name: 'Workspace views' }).getByRole('button', { name: 'Activity', exact: true }).click()
    await activity.locator('article button[data-task-id]').first().click()
    const history = page.locator('.side-panel section', { has: page.getByRole('heading', { name: 'History', exact: true }) })
    await history.getByRole('heading', { name: 'History', exact: true }).waitFor()
    const rows = history.locator('.event')
    await rows.first().waitFor()
    const text = await history.innerText()
    assert.ok(!text.includes('null →') && !text.includes('order:') && !text.includes('"builder"'), `History has no raw values: ${text}`)
    assert.ok(!/commented on/.test(text), 'History has no comment.add rows')
    assert.equal(await history.locator('button').count(), 0, 'History subjects are plain text')
    assert.match(await rows.first().innerText(), /linked commit a1b2c3d/, 'the newest event comes first')
    assert.match(await rows.last().innerText(), /created this task/)
  })
})

it('filters, groups and pages the Activity feed', { timeout: 120000 }, async () => {
  await withWorkspace(chromium, { viewport: { width: 1440, height: 900 } }, async ({ page, run, open, token, service }) => {
    const as = (actor, type, payload) => operationHttp(service.httpUrl, token, type, payload, actor)
    await run(['actors', 'register', 'reviewer', '--handle', 'reviewer', '--kind', 'agent', '--display-name', 'Reviewer'])
    const { taskId } = (await as('alice', 'task.create', { title: 'Page this feed', status: 'review' })).result
    const revisions = async () => (await run(['show', taskId])).revisions
    const { assignee, status } = await revisions()
    await as('reviewer', 'task.handoff', { taskId, to: 'alice', status: 'completed', message: 'Approved', expectedRevisions: { assignee, status } })
    for (let start = 0; start < 150; start += 25)
      await Promise.all(Array.from({ length: 25 }, (_, offset) => as('reviewer', 'comment.add', { taskId, text: `Review note ${start + offset + 1}` })))
    for (let index = 0; index < 30; index++) {
      const { result } = await as('alice', 'comment.add', { taskId, text: `Alice note ${index + 1}` })
      const comment = (await run(['show', taskId])).comments.find(candidate => candidate.id === result.commentId)
      await as('reviewer', 'read.mark', { taskId, comments: [{ commentId: comment.id, revisionId: comment.revisionIds[0] }] })
    }
    await open()
    const views = page.getByRole('navigation', { name: 'Workspace views' })
    await views.getByRole('button', { name: 'Activity', exact: true }).click()
    const activity = page.locator('.activity')
    const articles = activity.locator('article')
    await activity.getByText(/Showing 100 of/).waitFor()
    assert.equal(await articles.count(), 100)
    assert.equal(await activity.getByText(/read \d+ comment/).count(), 0, 'read receipts are hidden by default')
    await activity.getByRole('heading', { name: 'Today', exact: true }).waitFor()
    assert.equal(await page.getByLabel('Assigned to').count(), 0, 'board filters stay off Activity')
    assert.equal(await page.getByLabel('Status filter').count(), 0)
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true)

    await page.getByLabel('Performed by', { exact: true }).selectOption({ label: 'Reviewer · agent' })
    await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Status changes and handoffs' })
    await articles.first().waitFor()
    assert.equal(await articles.count(), 1)
    assert.match(await articles.first().innerText(), /and set it to Completed/)
    await page.getByLabel('Performed by', { exact: true }).selectOption('')
    await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Read receipts' })
    await activity.getByText(/read 1 comment/).first().waitFor()
    await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Actors registered' })
    await page.getByLabel('Performed by', { exact: true }).selectOption({ label: 'Reviewer · agent' })
    await activity.getByText('No activity matches these filters.').waitFor()
    await page.getByLabel('Performed by', { exact: true }).selectOption('')
    await page.getByLabel('Show', { exact: true }).selectOption({ label: 'All changes' })

    await articles.nth(99).waitFor()
    assert.equal(await articles.count(), 100, 'changing a filter resets paging')
    await page.getByRole('button', { name: 'Show older activity', exact: true }).click()
    await articles.nth(100).waitFor()
    assert.ok(await articles.count() > 100)
    assert.equal(await articles.nth(100).evaluate(article => article === document.activeElement), true, 'focus moves to the first newly revealed row')

    // A panel opened from a row keeps its opener when new operations arrive.
    const row = activity.locator('article button[data-task-id]').first()
    const opener = await row.elementHandle()
    await row.click()
    await page.locator('.side-panel h2').waitFor()
    const before = await articles.count()
    await as('alice', 'comment.add', { taskId, text: 'Arrived while the panel was open' })
    await page.waitForFunction(count => document.querySelectorAll('.activity article').length > count, before)
    await page.keyboard.press('Escape')
    await page.waitForFunction(element => document.activeElement === element, opener)
  })
})

for (const engine of [chromium, webkit]) it(`keeps Hand off work collapsed until asked in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    await run(['actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent', '--display-name', 'Builder'])
    const { result: { taskId } } = await operate('task.create', { title: 'Hand off on request' })
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const opener = panel.getByRole('button', { name: 'Hand off work', exact: true })
    await page.getByRole('button', { name: /Hand off on request/ }).click()
    await opener.waitFor()
    assert.equal(await panel.getByLabel('Recipient', { exact: true }).count(), 0, 'the form is closed on open')
    const commentsTop = await panel.getByRole('heading', { name: /^Comments \d/ }).evaluate(element => element.getBoundingClientRect().top)
    assert.ok(commentsTop < 900, `Comments are in the first screen: ${commentsTop}`)

    await opener.click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Recipient')
    await panel.getByLabel('Recipient', { exact: true }).selectOption('builder')
    await panel.getByLabel('Handoff message', { exact: true }).fill('Half-written note')
    await panel.getByRole('button', { name: 'Cancel handoff', exact: true }).click()
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Hand off work')
    await opener.click()
    assert.equal(await panel.getByLabel('Recipient', { exact: true }).inputValue(), '')
    assert.equal(await panel.getByLabel('Handoff message', { exact: true }).inputValue(), '')
    await panel.getByRole('button', { name: 'Cancel handoff', exact: true }).click()

    await opener.click()
    await panel.getByLabel('Recipient', { exact: true }).selectOption('builder')
    await panel.getByLabel('Handoff status').selectOption('in-progress')
    await panel.getByLabel('Handoff message', { exact: true }).fill('Please take this.')
    await panel.getByRole('button', { name: 'Hand off', exact: true }).click()
    await panel.getByText('Handed off to Builder · agent · In progress.', { exact: true }).waitFor()
    assert.equal(await panel.getByLabel('Recipient', { exact: true }).count(), 0)
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Hand off work')
    await opener.click()
    assert.equal(await panel.getByLabel('Recipient', { exact: true }).inputValue(), '')
    assert.equal(await panel.getByText(/^Handed off to/).count(), 0, 'reopening clears the confirmation')
    await panel.getByRole('button', { name: 'Cancel handoff', exact: true }).click()

    // A lost response keeps Retry reachable, even after the form is cancelled.
    let lost = false
    await page.route('**/automerge/operations', async route => {
      const operation = route.request().postDataJSON()
      if (!lost && operation.type === 'task.handoff') {
        lost = true
        await route.fetch()
        await route.abort('failed')
      } else await route.continue()
    })
    await opener.click()
    await panel.getByLabel('Recipient', { exact: true }).selectOption('alice')
    await panel.getByLabel('Handoff message', { exact: true }).fill('Back to you, once.')
    await panel.getByRole('button', { name: 'Hand off', exact: true }).click()
    const retry = panel.getByRole('button', { name: 'Retry saved request', exact: true })
    await retry.waitFor()
    await panel.getByRole('button', { name: 'Cancel handoff', exact: true }).click()
    const pageRetry = page.getByRole('button', { name: 'Retry saved request', exact: true })
    await pageRetry.waitFor()
    await pageRetry.click()
    await pageRetry.waitFor({ state: 'hidden' })
    const comments = (await run(['show', taskId])).comments.filter(comment => comment.content.includes('Back to you, once.'))
    assert.equal(comments.length, 1)
  })
})

for (const engine of [chromium, webkit]) it(`defaults the handoff status from the task and re-derives it on Use latest in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    await run(['actors', 'register', 'builder', '--handle', 'builder', '--kind', 'agent', '--display-name', 'Builder'])
    const { result: { taskId: backlogId } } = await operate('task.create', { title: 'Backlog handoff' })
    await operate('task.create', { title: 'Moving handoff' , status: 'in-progress' })
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const status = panel.getByLabel('Handoff status')
    const opener = panel.getByRole('button', { name: 'Hand off work', exact: true })

    await page.getByRole('button', { name: /Moving handoff/ }).click()
    await opener.click()
    assert.equal(await status.inputValue(), 'review', 'In progress hands off to Review')
    await panel.getByRole('button', { name: 'Close', exact: true }).click()

    await page.getByRole('button', { name: /Backlog handoff/ }).click()
    await opener.click()
    assert.equal(await status.inputValue(), 'backlog', 'Backlog stays Backlog')
    await panel.getByLabel('Handoff message').fill('Draft kept')
    const shown = await run(['show', backlogId])
    await run(['update', backlogId, '--status', 'in-progress', '--revisions', JSON.stringify({ status: shown.revisions.status })])
    const notice = panel.getByRole('status').filter({ hasText: 'This task changed while you were writing' })
    await notice.getByText(/^This task changed while you were writing: now .* · In progress\. Your draft is preserved\.$/).waitFor()
    assert.equal(await panel.getByRole('button', { name: 'Hand off', exact: true }).isDisabled(), true)
    await panel.getByRole('button', { name: 'Use latest task details', exact: true }).click()
    assert.equal(await status.inputValue(), 'review', 'an untouched status is re-derived from the latest task')
    assert.equal(await panel.getByLabel('Handoff message').inputValue(), 'Draft kept')

    // A status the user chose is never overwritten.
    await panel.getByRole('button', { name: 'Cancel handoff', exact: true }).click()
    await opener.click()
    await status.selectOption('completed')
    await panel.getByLabel('Handoff message').fill('Chosen')
    const again = await run(['show', backlogId])
    await run(['update', backlogId, '--status', 'up-next', '--revisions', JSON.stringify({ status: again.revisions.status })])
    await panel.getByRole('button', { name: 'Use latest task details', exact: true }).click()
    assert.equal(await status.inputValue(), 'completed')
  })
})

for (const engine of [chromium, webkit]) it(`keeps typed drafts and the pairing dialog safe from Escape in ${engine.name()}`, { timeout: 120000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, operate, open, service }) => {
    const { result: { taskId } } = await operate('task.create', { title: 'Do not lose the draft', description: 'Original description' })
    await page.goto(`${service.httpUrl}/pardner/`)
    await page.getByLabel('Local service token').waitFor()
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const card = page.locator(`.task-card[data-task-id="${taskId}"]`)
    const comment = panel.getByLabel('Comment', { exact: true })

    await card.click()
    await comment.fill('Half-written thought')
    await comment.press('Escape')
    assert.equal(await panel.count(), 1, 'Escape in a field with text keeps the panel')
    assert.equal(await comment.inputValue(), 'Half-written thought')

    await panel.getByRole('button', { name: 'Edit task', exact: true }).click()
    const description = panel.locator('.editor textarea')
    await description.fill('Edited description')
    await description.press('Escape')
    assert.equal(await description.inputValue(), 'Edited description', 'the editor stays')
    await page.getByRole('button', { name: 'Cancel edit', exact: true }).click()

    await comment.fill('')
    await comment.press('Escape')
    await panel.waitFor({ state: 'detached' })
    await page.waitForFunction(id => document.activeElement?.dataset.taskId === id, taskId)

    await card.click()
    await panel.waitFor()
    await page.getByRole('button', { name: 'Pair another device', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Pair another device' })
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await panel.count(), 1, 'Escape in the pairing dialog leaves the task panel open')
  })
})

for (const engine of [chromium, webkit]) it(`changes a task's status in place from Task details in ${engine.name()}`, { timeout: 180000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    const { result: { taskId } } = await operate('task.create', { title: 'Approve release notes', status: 'review' })
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const select = panel.getByLabel('Status', { exact: true })
    const meta = panel.locator('p.muted').first()
    const posts = []
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/automerge/operations') && request.postDataJSON().type === 'task.update') posts.push(request.postDataJSON())
    })
    const openTask = async () => {
      await page.getByRole('button', { name: /Approve release notes/ }).click()
      await panel.getByRole('button', { name: 'Edit task', exact: true }).waitFor()
    }
    const close = () => panel.getByRole('button', { name: 'Close', exact: true }).click()

    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
      await run(['update', taskId, '--status', 'review', '--revisions', JSON.stringify({ status: (await run(['show', taskId])).revisions.status })])
      posts.length = 0
      await openTask()
      assert.equal(await select.inputValue(), 'review')
      assert.equal(await select.count(), 1)
      assert.equal(await meta.textContent().then(text => text.includes('· Review ·')), false, `the meta line drops the status at ${width}`)
      if (width === 375) {
        const [selectBox, labelBox, panelOverflow] = [await box(select), await box(panel.locator('label.status-field')),
          await panel.evaluate(element => element.scrollWidth - element.clientWidth)]
        assert.ok(selectBox.bottom - selectBox.top >= 44, 'the select is at least 44px tall')
        assert.ok(panelOverflow <= 0, 'the panel does not overflow sideways')
        assert.ok(labelBox.bottom - labelBox.top < 70, 'the label and select share one line')
      }
      await select.focus()
      await select.selectOption('completed')
      await page.waitForFunction(() => document.querySelector('.column[aria-label="Completed"] .task-card'))
      assert.equal((await run(['show', taskId])).task.status, 'completed')
      assert.equal(await select.inputValue(), 'completed')
      await panel.getByText(/to Completed/).first().waitFor()
      assert.equal(await page.locator('.column[aria-label="Completed"] .task-card', { hasText: 'Approve release notes' }).count(), 1)
      assert.equal(await panel.getByRole('region', { name: 'Edit task' }).count(), 0, 'no editor opens')
      await page.waitForFunction(() => document.activeElement === document.querySelector('.side-panel select[aria-label="Status"]'), null, { timeout: 3000 })
      assert.equal(posts.length, 1, `exactly one task.update at ${width}`)
      await close()
    }

    // Mutual exclusion with Edit and Hand off.
    await run(['update', taskId, '--status', 'review', '--revisions', JSON.stringify({ status: (await run(['show', taskId])).revisions.status })])
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: /Approve release notes/ }).click()
    await select.waitFor()
    await panel.getByRole('button', { name: 'Edit task', exact: true }).click()
    assert.equal(await panel.getByLabel('Status', { exact: true }).count(), 1)
    assert.equal(await panel.getByRole('region', { name: 'Edit task' }).getByLabel('Status', { exact: true }).count(), 1)
    assert.equal(await meta.textContent().then(text => text.includes('· Review ·')), true, 'the meta line shows the status while editing')
    await panel.getByRole('button', { name: 'Cancel edit', exact: true }).click()
    await select.waitFor()
    await panel.getByRole('button', { name: 'Hand off work', exact: true }).click()
    assert.equal(await select.count(), 0, 'the inline select is hidden during a handoff')
    await close()
  })
})

for (const engine of [chromium, webkit]) it(`recovers the inline Status select from a stale change and a lost response in ${engine.name()}`, { timeout: 180000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    const { result: { taskId } } = await operate('task.create', { title: 'Approve release notes', status: 'review' })
    await open()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    const select = panel.getByLabel('Status', { exact: true })
    await page.getByRole('button', { name: /Approve release notes/ }).click()
    await select.waitFor()

    // Stale: another Actor changes status while the request is held.
    let release
    const held = new Promise(resolve => { release = resolve })
    await page.route('**/automerge/operations', async route => {
      if (route.request().postDataJSON().type === 'task.update') await held
      await route.continue()
    })
    const change = select.selectOption('completed')
    const { revisions } = await run(['show', taskId])
    await run(['update', taskId, '--status', 'in-progress', '--revisions', JSON.stringify({ status: revisions.status })])
    release()
    await change
    const alert = panel.getByRole('alert')
    await alert.getByRole('button', { name: 'Dismiss', exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.side-panel select')?.value === 'in-progress')
    assert.equal(await select.inputValue(), 'in-progress')
    assert.equal((await run(['show', taskId])).task.status, 'in-progress')
    await alert.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await page.unroute('**/automerge/operations')

    // Lost response: Retry replays the same operation exactly once.
    const attempts = []
    let lost = false
    await page.route('**/automerge/operations', async route => {
      const operation = route.request().postDataJSON()
      if (operation.type === 'task.update') attempts.push(operation)
      if (operation.type === 'task.update' && !lost) {
        lost = true
        assert.equal((await route.fetch()).status(), 200)
        await route.abort('failed')
      } else await route.continue()
    })
    await select.selectOption('completed')
    const retry = panel.getByRole('button', { name: 'Retry saved request', exact: true })
    await retry.waitFor()
    assert.equal(await alert.getByRole('button', { name: 'Dismiss', exact: true }).count(), 0, 'a pending request cannot be dismissed')
    await retry.click()
    await retry.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.querySelector('.side-panel select')?.value === 'completed')
    assert.equal(attempts.length, 2)
    assert.deepEqual(attempts[0], attempts[1])
    assert.equal((await run(['show', taskId])).task.status, 'completed')
  })
})

for (const engine of [chromium, webkit]) it(`keeps the New task draft until it is created or discarded in ${engine.name()}`, { timeout: 180000 }, async () => {
  await withWorkspace(engine, { viewport: { width: 1440, height: 900 } }, async ({ page, run, operate, open }) => {
    await operate('task.create', { title: 'Existing card' })
    await open()
    const panel = page.getByRole('region', { name: 'New task' })
    const title = panel.getByLabel('Title', { exact: true })
    const description = panel.locator('textarea')
    const tags = panel.getByLabel('Tags, separated by commas')
    const priority = panel.getByLabel('Priority', { exact: true })
    const create = panel.getByRole('button', { name: /^(Create task|Creating…)$/ })
    const discard = panel.getByRole('button', { name: 'Discard draft', exact: true })
    const newTask = page.getByRole('button', { name: 'New task', exact: true })
    const close = () => panel.getByRole('button', { name: 'Close', exact: true }).click()
    const titleFocused = () => page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'title')
    const retry = page.getByRole('button', { name: 'Retry saved request', exact: true })
    const taskCount = async title => (await run(['tasks'])).tasks.filter(task => task.title === title).length

    // 1. Close and reopen restores the draft and focuses Title.
    await newTask.click()
    assert.equal(await discard.count(), 0, 'a pristine form has no Discard draft')
    await title.fill('Drafted title')
    await description.fill('Drafted description')
    await tags.fill('a, b')
    await priority.selectOption('p1')
    await close()
    await panel.waitFor({ state: 'detached' })
    await newTask.click()
    await titleFocused()
    assert.equal(await title.inputValue(), 'Drafted title')
    assert.equal(await description.inputValue(), 'Drafted description')
    assert.equal(await tags.inputValue(), 'a, b')
    assert.equal(await priority.inputValue(), 'p1')

    // 2. Opening a card keeps the draft.
    await close()
    await page.locator('.task-card', { hasText: 'Existing card' }).click()
    await page.getByRole('complementary', { name: 'Task details' }).waitFor()
    await page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Close', exact: true }).click()
    await newTask.click()
    assert.equal(await title.inputValue(), 'Drafted title')

    // 3. Discard draft resets, keeps the panel open on Title, and the button goes away.
    await discard.click()
    await titleFocused()
    assert.equal(await title.inputValue(), '')
    assert.equal(await description.inputValue(), '')
    assert.equal(await tags.inputValue(), '')
    assert.equal(await priority.inputValue(), 'p2')
    assert.equal(await discard.count(), 0)
    await close()
    await newTask.click()
    assert.equal(await title.inputValue(), '')

    // 6. A definitive rejection keeps the draft editable.
    await title.fill('Rejected title')
    await page.route('**/automerge/operations', route => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'INVALID_ARGUMENT', error: 'Send a valid JSON request.' }),
    }))
    await create.click()
    await panel.getByRole('alert').waitFor()
    assert.equal(await title.getAttribute('readonly'), null, 'the Title stays editable after a rejection')
    assert.equal(await title.inputValue(), 'Rejected title')
    await page.unroute('**/automerge/operations')

    // 7. While saving the form is busy and locked.
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route('**/automerge/operations', async route => { await gate; await route.continue() })
    await title.fill('Busy title')
    await create.click()
    await panel.getByRole('button', { name: 'Creating…', exact: true }).waitFor()
    assert.equal(await panel.locator('form').getAttribute('aria-busy'), 'true')
    assert.equal(await create.isDisabled(), true)
    assert.notEqual(await title.getAttribute('readonly'), null)
    release()
    await page.getByRole('complementary', { name: 'Task details' }).waitFor()
    await page.unroute('**/automerge/operations')
    await page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Close', exact: true }).click()

    // 4. After a successful create the draft is gone.
    await newTask.click()
    assert.equal(await title.inputValue(), '')
    assert.equal(await discard.count(), 0)

    // 5. A pending create locks the fields; a page Retry after closing creates exactly one task and clears the draft.
    await page.route('**/automerge/operations', route => route.abort('failed'))
    await title.fill('Pending title')
    await create.click()
    await panel.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor()
    assert.notEqual(await title.getAttribute('readonly'), null)
    assert.equal(await priority.isDisabled(), true)
    assert.equal(await panel.getByRole('button', { name: 'Retry saved request', exact: true }).isEnabled(), true)
    await close()
    await page.unroute('**/automerge/operations')
    await retry.click()
    await retry.waitFor({ state: 'hidden' })
    await page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Close', exact: true }).click()
    assert.equal(await taskCount('Pending title'), 1)
    await newTask.click()
    assert.equal(await title.inputValue(), '')
    assert.equal(await discard.count(), 0)

    // 8. Forget this workspace drops the draft.
    await title.fill('Secret draft')
    await close()
    await page.getByRole('button', { name: 'Forget this workspace', exact: true }).click()
    await open()
    await newTask.click()
    assert.equal(await title.inputValue(), '')
  })
})
