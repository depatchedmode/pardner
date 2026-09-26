import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, webkit } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'
import { lanInterfaces } from '../lib/lan-access.js'

for (const engine of [chromium, webkit]) it(`pairs and remembers a phone over actual LAN HTTP in ${engine.name()}`, { timeout: 90000 }, async t => {
  const candidate = lanInterfaces()[0]
  if (!candidate) return t.skip('Physical LAN qualification unavailable: no non-loopback IPv4 interface; localhost is not a substitute.')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-phone-'))
  let service, desktopBrowser, phoneContext
  const errors = []
  const run = async args => {
    const output = await cli(directory, [...args, '--actor', 'alice'])
    assert.equal(output.code, 0, output.stderr)
    return output.result
  }
  const launchPhone = async () => {
    phoneContext = await engine.launchPersistentContext(join(directory, 'phone-browser'), {
      headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })
    const page = phoneContext.pages()[0]
    page.on('pageerror', error => errors.push(error.message))
    return page
  }
  try {
    service = await startCliService(directory)
    for (const id of ['alice', 'bob']) await run(['actors', 'register', id, '--handle', id, '--kind', 'human'])
    const own = await run(['task', 'create', '--title', 'Review phone connection evidence', '--status', 'review', '--assignee', 'alice'])
    await run(['task', 'create', '--title', 'Someone else’s review', '--status', 'review', '--assignee', 'bob'])
    await run(['task', 'create', '--title', 'Work still in progress', '--status', 'in-progress', '--assignee', 'alice'])
    const { token } = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8'))
    desktopBrowser = await chromium.launch({ headless: true })
    const desktop = await desktopBrowser.newPage()
    await desktop.goto(`${service.httpUrl}/pardner/`)
    await desktop.getByLabel('Local service token').fill(token)
    await desktop.getByRole('button', { name: 'Connect', exact: true }).click()
    await desktop.getByRole('button', { name: 'Pair another device', exact: true }).click()
    await desktop.getByLabel('Network interface').selectOption(candidate.name)
    await desktop.getByRole('button', { name: 'Enable phone access', exact: true }).click()
    await desktop.getByText(/Settings saved. Restart/).waitFor()
    assert.equal(service.phoneAccess.active, null)
    await service.stop()
    service = await startCliService(directory, [], { reusePorts: true })
    assert.equal(service.phoneAccess.active.address, candidate.address)
    const phoneUrl = service.phoneAccess.phoneUrl
    await desktop.reload()
    await desktop.getByRole('button', { name: 'Pair another device', exact: true }).click()
    await desktop.getByText('Connect manually', { exact: true }).click()
    const code = await desktop.getByLabel('Pairing code', { exact: true }).textContent()
    await desktop.getByAltText('QR code for the device address').waitFor()
    const output = resolve('output/playwright')
    await mkdir(output, { recursive: true })
    await desktop.screenshot({ path: join(output, 'pardner-phone-setup.png'), mask: [desktop.getByLabel('Pairing code', { exact: true }), desktop.getByLabel('Device address', { exact: true }), desktop.getByAltText('QR code for the device address')] })

    let phone = await launchPhone()
    const pairingUrl = await desktop.getByLabel('Device address', { exact: true }).inputValue()
    assert.equal(new URL(pairingUrl).hash, `#pair=${code}`)
    await phone.goto(pairingUrl)
    assert.equal(await phone.evaluate(() => isSecureContext), false)
    await phone.getByLabel('Actor', { exact: true }).waitFor()
    assert.equal(new URL(phone.url()).hash, '')
    const usedLink = await desktopBrowser.newPage()
    await usedLink.goto(pairingUrl)
    await usedLink.getByText('The pairing code is incorrect or expired. Generate a new code on the desktop.', { exact: true }).waitFor()
    assert.equal(new URL(usedLink.url()).hash, '')
    await usedLink.getByLabel('Pairing code', { exact: true }).waitFor()
    await usedLink.close()
    await phone.getByRole('button', { name: 'Pair another device', exact: true }).click()
    await phone.getByAltText('QR code for the device address').waitFor()
    assert.equal(await phone.getByLabel('Network interface').count(), 0)
    await phone.getByRole('button', { name: 'Generate new code', exact: true }).click()
    await phone.getByText('Connect manually', { exact: true }).click()
    await phone.getByLabel('Pairing code', { exact: true }).waitFor()
    await phone.getByRole('button', { name: 'Close device pairing' }).click()
    await phone.getByLabel('Actor', { exact: true }).selectOption('alice')
    await phone.getByRole('button', { name: 'My reviews', exact: true }).click()
    await phone.getByRole('button', { name: /Review phone connection evidence/ }).waitFor()
    assert.equal(await phone.getByRole('button', { name: /Someone else’s review|Work still in progress/ }).count(), 0)
    await phone.screenshot({ path: join(output, `pardner-phone-reviews-${engine.name()}.png`), fullPage: true })
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

    await phoneContext.close()
    phoneContext = null
    phone = await launchPhone()
    await phone.goto(phoneUrl)
    await phone.getByRole('button', { name: /Review phone connection evidence/ }).click()
    assert.equal(await phone.getByLabel('Actor', { exact: true }).inputValue(), 'alice')
    assert.equal(await phone.getByLabel('Status filter').inputValue(), 'review')
    await run(['comment', own.result.taskId, 'New evidence from the desktop'])
    await phone.getByText('New evidence from the desktop', { exact: true }).waitFor()
    let lost = false
    const attempts = []
    await phone.route('**/automerge/operations', async route => {
      attempts.push(route.request().postDataJSON())
      if (!lost) {
        lost = true
        assert.equal((await route.fetch()).status(), 200)
        await route.abort('failed')
      } else await route.continue()
    })
    await phone.getByLabel('Comment', { exact: true }).fill('Reviewed on my phone')
    await phone.getByRole('button', { name: 'Add comment', exact: true }).click()
    await phone.getByRole('button', { name: 'Retry saved request', exact: true }).click()
    await phone.getByRole('button', { name: 'Retry saved request', exact: true }).waitFor({ state: 'hidden' })
    await phone.unroute('**/automerge/operations')
    assert.equal(attempts.length, 2)
    assert.deepEqual(attempts[0], attempts[1])
    let task = await run(['show', own.result.taskId])
    assert.equal(task.comments.filter(item => item.content === 'Reviewed on my phone').length, 1)
    assert.equal(task.comments.find(item => item.content === 'Reviewed on my phone').actorId, 'alice')
    await phone.getByRole('button', { name: 'Edit task', exact: true }).click()
    await phone.getByLabel('Status', { exact: true }).selectOption('completed')
    await phone.getByRole('button', { name: 'Save changes', exact: true }).click()
    await phone.getByRole('button', { name: 'Edit task', exact: true }).waitFor()
    await service.stop()
    service = await startCliService(directory, [], { reusePorts: true })
    await run(['comment', own.result.taskId, 'Service restarted successfully'])
    await phone.getByText('Service restarted successfully', { exact: true }).waitFor()
    task = await run(['show', own.result.taskId])
    assert.equal(task.task.status, 'completed')
    assert.equal(task.comments.filter(item => item.content === 'Reviewed on my phone').length, 1)
    await phone.getByRole('button', { name: 'Close', exact: true }).click()
    await phone.getByRole('button', { name: 'Forget this workspace', exact: true }).click()
    await phone.getByRole('button', { name: 'Pair this device', exact: true }).waitFor()
    await phone.reload()
    await phone.getByRole('button', { name: 'Pair this device', exact: true }).waitFor()
    assert.deepEqual(errors, [])
    const logs = service.logs()
    assert.equal(JSON.stringify(logs).includes(token), false)
    assert.equal(JSON.stringify(logs).includes(code), false)
  } finally {
    await phoneContext?.close()
    await desktopBrowser?.close()
    await service?.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
