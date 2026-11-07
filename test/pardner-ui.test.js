import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, webkit } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'
import { withWorkspace } from '../support/ui-workspace.js'

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
      assert.match(
        await bob.getByText(/unread for bob/).textContent(),
        /1 unread/,
      )
      await bob
        .getByRole('button', { name: 'Mark displayed comments read' })
        .click()
      await bob.getByText('0 unread for bob', { exact: true }).waitFor()
      // Alice's comments and unread count arrive in the same task-context response, so wait for her
      // rendered comment and then for the live count; Bob's receipt applies to Bob only.
      await alice.locator('article.comment').getByText('The requirements are ready for @builder.', { exact: true }).waitFor()
      await alice.getByText('1 unread for alice', { exact: true }).waitFor()
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
      await page.getByText('comment.add').first().waitFor()
      assert.equal(await page.locator('main').evaluate(main => main.scrollTop), 0, 'a view switch starts at the top')
      assert.ok(await page.locator('.activity article').count() >= 300)
      await assertFrame(at('Activity'))
      assert.ok(await scrollMain() > 0, `the activity region scrolls ${at('Activity')}`)
      await assertFrame(`after scrolling ${at('Activity')}`)
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
