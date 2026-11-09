import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientWorkspace } from '../support/client-workspace.js'

// The phone listener binds the injected "LAN" interface. On 127.0.0.1 it is a second port on loopback, so the phone's
// origin differs from the computer's by port. Each browser context stands for a separate device.
const LAN = [{ name: 'test-lan', address: '127.0.0.1' }]
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

/** Captures what the service process writes, so a test can prove no secret reached the log. */
function captureProcessOutput() {
  const written = []
  const originals = { stdout: process.stdout.write, stderr: process.stderr.write }
  for (const stream of ['stdout', 'stderr']) {
    process[stream].write = function (chunk, ...rest) { written.push(String(chunk)); return originals[stream].call(this, chunk, ...rest) }
  }
  return { text: () => written.join(''), restore: () => { process.stdout.write = originals.stdout; process.stderr.write = originals.stderr } }
}

const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

for (const engine of [chromium, webkit]) it(`pairs, uses, revokes and signs out a phone companion in ${engine.name()}`, { timeout: 240000 }, async () => {
  const output = captureProcessOutput()
  try {
    await withClientWorkspace(engine, { projectName: 'Phone board', clientOptions: { interfaces: () => LAN } },
      async ({ page, newPage, open, operate, task, client, actorId }) => {
        const consoleLines = []
        const watch = target => target.on('console', message => consoleLines.push(message.text()))
        watch(page)
        const { result: { taskId } } = await operate('task.create', { title: 'Check from the phone' })
        await open()

        // The computer turns phone access on and makes a code; the plaintext lives only in the dialog.
        const pairButton = page.getByRole('button', { name: 'Pair a phone', exact: true })
        await pairButton.click()
        const dialog = page.getByRole('dialog', { name: 'Pair a phone' })
        await dialog.getByText('Unencrypted HTTP. Use only on a network you trust', { exact: false }).waitFor()
        assert.equal(await dialog.getByRole('combobox', { name: 'Network' }).count(), 0, 'one network needs no choice')
        const box = await dialog.boundingBox()
        await dialog.getByRole('button', { name: 'Turn on phone access' }).click()
        await dialog.getByText(/^Phones open http:\/\/127\.0\.0\.1:\d+\/pardner\/$/).waitFor()
        const phoneUrl = client.companion.phoneUrl()
        assert.notEqual(new URL(phoneUrl).port, new URL(client.url).port)
        await dialog.getByLabel('Phone name').fill('Test phone')
        await dialog.getByRole('button', { name: 'New code', exact: true }).click()
        const digits = dialog.locator('.pairing-digits')
        await digits.waitFor()
        const grouped = await digits.textContent()
        assert.match(grouped, /^\d{4} \d{4}$/)
        const code = grouped.replace(' ', '')
        await dialog.getByRole('timer').filter({ hasText: /^Use once before .+ · \d+:\d\d left$/ }).waitFor()
        await dialog.getByRole('img', { name: /^QR code that pairs a phone/ }).waitFor()
        assert.equal(await dialog.getByRole('button', { name: /copy/i }).count(), 0, 'the secret link is never offered for copying')
        assert.deepEqual(await dialog.boundingBox(), box, 'the dialog keeps its size and position as its state changes')

        // Scanning opens the phone address with the code in the fragment, which leaves the address bar at once.
        const phone = await newPage(PHONE)
        watch(phone)
        await phone.goto(`${phoneUrl}#pair=${code}`)
        const switcher = phone.getByRole('button', { name: 'Project: Phone board. Switch project' })
        await switcher.waitFor({ timeout: 30000 })
        assert.equal(new URL(phone.url()).hash, '')
        await phone.getByRole('button', { name: /^You \(phone\): Test phone, signed in as Alice\. Open phone settings$/ }).waitFor()
        for (const name of ['Invite', 'Pair a phone', 'Control']) {
          assert.equal(await phone.getByRole('button', { name, exact: true }).count(), 0, `${name} is not offered on a phone`)
        }
        await switcher.click()
        assert.equal(await phone.getByRole('menuitem', { name: /Start or join/ }).count(), 0)
        await phone.getByRole('menuitemradio', { name: /Phone board/ }).filter({ hasText: /Saved on your computer/ }).waitFor()
        await phone.keyboard.press('Escape')
        assert.equal(await noHorizontalScroll(phone), true, 'the phone board fits 390px without horizontal scroll')
        await dialog.getByText('Paired: Test phone').waitFor({ timeout: 10000 })
        await dialog.getByRole('button', { name: 'Revoke Test phone' }).waitFor()

        // An edit on the phone is the human's, saved through the computer, and the computer sees it.
        await phone.getByRole('button', { name: /Check from the phone/ }).click()
        const phonePanel = phone.getByRole('complementary', { name: 'Task details' })
        await phonePanel.getByRole('button', { name: 'Edit task' }).click()
        await phonePanel.getByLabel('Description').fill('Edited on the phone')
        await phonePanel.getByRole('button', { name: 'Save changes' }).click()
        await phonePanel.getByRole('button', { name: 'Edit task' }).waitFor()
        const shown = await task(taskId)
        assert.equal(shown.task.description, 'Edited on the phone')
        assert.deepEqual(shown.history.filter(event => event.type === 'task.update').map(event => event.actorId), [actorId])
        assert.equal(await noHorizontalScroll(phone), true)
        // The phone keeps no copy, so its save status names the computer instead of claiming a local save.
        await phone.locator('.header-controls .save-status').filter({ hasText: /^Saved on your computer · (synced|waiting for hub)$/ }).waitFor()
        await phonePanel.locator('.save-status').filter({ hasText: /^Saved on your computer/ }).waitFor()
        assert.equal(await phone.getByText(/locally/).count(), 0, 'nothing on the phone claims a local save')
        await page.locator('.header-controls .save-status').filter({ hasText: /^Saved locally/ }).waitFor()

        // A second and third code wait side by side; one is redeemed by typing it on another phone.
        await dialog.getByLabel('Phone name').fill('Second phone')
        await dialog.getByRole('button', { name: 'New code', exact: true }).click()
        await digits.filter({ hasNotText: grouped }).waitFor()
        const second = (await digits.textContent()).replace(' ', '')
        await dialog.getByLabel('Phone name').fill('Third phone')
        await dialog.getByRole('button', { name: 'New code', exact: true }).click()
        await digits.filter({ hasNotText: `${second.slice(0, 4)} ${second.slice(4)}` }).waitFor()
        const third = (await digits.textContent()).replace(' ', '')
        await dialog.getByRole('button', { name: 'Cancel code for Second phone' }).waitFor()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await page.waitForFunction(() => document.activeElement?.textContent === 'Pair a phone')

        const typed = await newPage(PHONE)
        watch(typed)
        await typed.goto(phoneUrl)
        await typed.getByRole('heading', { name: 'Pair this phone' }).waitFor()
        const field = typed.getByLabel('Pairing code')
        assert.equal(await field.getAttribute('inputmode'), 'numeric')
        assert.equal(await field.getAttribute('autocomplete'), 'one-time-code')
        const wrong = ['12345678', '87654321'].find(candidate => ![code, second, third].includes(candidate))
        await field.fill(wrong)
        assert.equal(await field.inputValue(), `${wrong.slice(0, 4)} ${wrong.slice(4)}`)
        await typed.getByRole('button', { name: 'Pair this phone' }).click()
        await typed.getByRole('alert').getByText('That code didn’t work.').waitFor()
        assert.equal(await field.inputValue(), '', 'a refused code is cleared for the next one')
        assert.equal(await noHorizontalScroll(typed), true)
        await field.fill(second)
        await typed.getByRole('button', { name: 'Pair this phone' }).click()
        await typed.getByRole('button', { name: /^You \(phone\): Second phone/ }).waitFor({ timeout: 30000 })

        // The computer's presence names the phone the human is using.
        await page.getByRole('button', { name: /^You: Alice, human, (idle|active)\. Open your profile$/ }).click()
        const profile = page.getByRole('dialog', { name: 'Alice' })
        await profile.getByText('Test phone', { exact: true }).first().waitFor({ timeout: 30000 })
        await page.keyboard.press('Escape')
        await profile.waitFor({ state: 'detached' })

        // Revoking a phone sends it back to pairing; the other phone keeps working until it signs itself out.
        await pairButton.click()
        await dialog.getByRole('button', { name: 'Cancel code for Third phone' }).waitFor()
        await dialog.getByRole('button', { name: 'Revoke Test phone' }).click()
        await dialog.getByText('Revoke Test phone? It is signed out now', { exact: false }).waitFor()
        await dialog.getByRole('button', { name: 'Revoke', exact: true }).click()
        await dialog.getByRole('button', { name: 'Revoke Test phone' }).waitFor({ state: 'detached' })
        await phone.getByRole('heading', { name: 'Pair this phone' }).waitFor({ timeout: 30000 })
        await phone.getByText(/pairing ended/).waitFor()
        assert.equal(await typed.getByRole('heading', { name: 'Pair this phone' }).count(), 0)

        await typed.getByRole('button', { name: /^You \(phone\): Second phone/ }).click()
        const settings = typed.getByRole('dialog', { name: 'Second phone' })
        await settings.getByRole('button', { name: 'Sign out this phone' }).click()
        await settings.getByRole('button', { name: 'Sign out', exact: true }).click()
        await typed.getByText('This phone is signed out.', { exact: false }).waitFor()
        await typed.reload()
        await typed.getByRole('heading', { name: 'Pair this phone' }).waitFor()
        await dialog.getByRole('button', { name: 'Revoke Second phone' }).waitFor({ state: 'detached' })

        // Turning access off asks first.
        await dialog.getByRole('button', { name: 'Turn off phone access' }).click()
        await dialog.getByRole('button', { name: 'Turn off', exact: true }).click()
        await dialog.getByRole('button', { name: 'Turn on phone access' }).waitFor()
        assert.equal(client.companion.phoneUrl(), null)

        const cookie = (await phone.context().cookies()).find(item => item.name.endsWith('_companion'))?.value
        for (const secret of [code, second, third, cookie].filter(Boolean)) {
          assert.equal(consoleLines.join('\n').includes(secret), false, 'no pairing code or session reaches the browser console')
          assert.equal(output.text().includes(secret), false, 'no pairing code or session reaches the service output')
        }
      })
  } finally { output.restore() }
})

for (const engine of [chromium, webkit]) it(`explains a used pairing link, a failed bind and a changed address in ${engine.name()}`, { timeout: 120000 }, async () => {
  // 192.0.2.0/24 is reserved for documentation, so binding it fails as an unavailable address would.
  const network = { interfaces: [{ name: 'test-lan', address: '127.0.0.1' }, { name: 'gone', address: '192.0.2.250' }] }
  await withClientWorkspace(engine, { projectName: 'Phone board', clientOptions: { interfaces: () => network.interfaces } },
    async ({ page, newPage, open, call, client, project }) => {
      await open()
      await page.getByRole('button', { name: 'Pair a phone', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Pair a phone' })
      const select = dialog.getByRole('combobox', { name: 'Network' })
      await select.selectOption('gone')
      await dialog.getByRole('button', { name: 'Turn on phone access' }).click()
      await dialog.getByText(/Could not listen on 192\.0\.2\.250/).waitFor()
      await dialog.getByText('Not running', { exact: true }).waitFor()
      await dialog.getByRole('button', { name: 'Rebind', exact: true }).waitFor()
      await select.selectOption('test-lan')
      await dialog.getByRole('button', { name: 'Use this network', exact: true }).click()
      await dialog.getByText(/^Phones open http:\/\/127\.0\.0\.1:/).waitFor()

      // A used code in a link reports a clear, final failure and leaves the field empty.
      const { code } = await call(`/projects/${project.id}/companion/pairings`, {})
      const phoneUrl = client.companion.phoneUrl()
      const first = await newPage(PHONE)
      await first.goto(`${phoneUrl}#pair=${code}`)
      await first.getByRole('button', { name: 'Project: Phone board. Switch project' }).waitFor({ timeout: 30000 })
      const second = await newPage(PHONE)
      await second.goto(`${phoneUrl}#pair=${code}`)
      await second.getByRole('alert').getByText('That code didn’t work.').waitFor()
      assert.equal(new URL(second.url()).hash, '')
      assert.equal(await second.getByLabel('Pairing code').inputValue(), '')

      // The address the listener holds changes: the computer says so, and Rebind applies the network's current address.
      network.interfaces = [{ name: 'test-lan', address: '192.0.2.251' }, network.interfaces[1]]
      await dialog.getByText('The address of test-lan changed. Rebind to use the current address.').waitFor({ timeout: 10000 })
      await dialog.getByRole('button', { name: 'Rebind', exact: true }).click()
      await dialog.getByText(/Could not listen on 192\.0\.2\.251/).waitFor()
      network.interfaces = [{ name: 'test-lan', address: '127.0.0.1' }, network.interfaces[1]]
      await dialog.getByRole('button', { name: 'Rebind', exact: true }).click()
      await dialog.getByText(/^Phones open http:\/\/127\.0\.0\.1:/).waitFor()
      // The phone paired before the change reconnects to the rebound listener on the same port.
      await first.getByRole('button', { name: 'Project: Phone board. Switch project' }).waitFor()
    })
})
