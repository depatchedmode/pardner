import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit } from 'playwright'
import { cli, startCliService } from '../support/cli-resources.js'
import { createServer as createSyncServer } from '../support/resources.js'
import { lanInterfaces } from '../lib/lan-access.js'

for (const engine of [chromium, webkit]) it(`recovers pairing after network failure, credential rotation, and replacement links in ${engine.name()}`, { timeout: 60000 }, async t => {
  const candidate = lanInterfaces()[0]
  if (!candidate) return t.skip('Pairing recovery requires a non-loopback IPv4 interface.')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-pairing-recovery-'))
  let server = createSyncServer(directory, { allowedOrigins: undefined })
  let browser
  try {
    await server.start()
    await server.access.configure({ enabled: true, interfaceName: candidate.name })
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    await server.stop()
    server = createSyncServer(directory, { ...ports, allowedOrigins: undefined })
    await server.start()
    const url = server.access.status(server.httpPort, server.wsPort).phoneUrl
    browser = await engine.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    const pairingAttempts = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().endsWith('/pardner/pair')) pairingAttempts.push(request.postDataJSON().code)
    })
    const code = server.access.createPairing(server.httpPort, server.wsPort).code
    await page.route('**/pardner/pair', route => route.abort('failed'))
    await page.goto(`${url}#pair=${code}`)
    await page.getByRole('alert').waitFor()
    assert.equal(new URL(page.url()).hash, '')
    assert.equal(await page.getByLabel('Pairing code', { exact: true }).inputValue(), code)
    await page.unroute('**/pardner/pair')
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click()
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.deepEqual(pairingAttempts, [code, code])
    await page.getByLabel('Actor', { exact: true }).selectOption('alice')

    // A working credential should not consume a code intended for another device.
    const unused = server.access.createPairing(server.httpPort, server.wsPort).code
    await page.goto('about:blank')
    await page.goto(`${url}#pair=${unused}`)
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).hash, '')
    assert.equal(server.access.pairing.code, unused)
    assert.deepEqual(pairingAttempts, [code, code])

    await page.goto('about:blank')
    await server.stop()
    server = createSyncServer(directory, { ...ports, allowedOrigins: undefined, apiToken: 'rotated-test-secret' })
    await server.start()
    const replacement = server.access.createPairing(server.httpPort, server.wsPort).code
    await page.goto(`${url}#pair=${replacement}`)
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).hash, '')
    assert.equal(await page.getByLabel('Actor', { exact: true }).inputValue(), 'alice')
    assert.deepEqual(pairingAttempts, [code, code, replacement])
    await page.reload()
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.deepEqual(pairingAttempts, [code, code, replacement])

    await page.getByRole('button', { name: 'Forget this workspace', exact: true }).click()
    await page.getByLabel('Pairing code', { exact: true }).waitFor()
    const expired = server.access.createPairing(server.httpPort, server.wsPort).code
    server.access.pairing.expiresAt = Date.now() - 1
    await page.goto('about:blank')
    await page.goto(`${url}#pair=${expired}`)
    await page.getByText('The pairing code is incorrect or expired. Generate a new code on the desktop.', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).hash, '')
    const fresh = server.access.createPairing(server.httpPort, server.wsPort).code
    // Navigate directly: a fragment-only URL change can reuse the current document.
    await page.goto(`${url}#pair=${fresh}`)
    await page.getByText('Saved locally · synced', { exact: true }).waitFor({ timeout: 5000 })
    assert.equal(new URL(page.url()).hash, '')
    assert.deepEqual(pairingAttempts, [code, code, replacement, expired, fresh])
    assert.deepEqual(errors, [])
  } finally { await browser?.close(); await server.stop(); await rm(directory, { recursive: true, force: true }) }
})

for (const engine of [chromium, webkit]) it(`stays paired when an old authentication rejection arrives late in ${engine.name()}`, { timeout: 30000 }, async t => {
  const candidate = lanInterfaces()[0]
  if (!candidate) return t.skip('Pairing recovery requires a non-loopback IPv4 interface.')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-stale-auth-'))
  let server = createSyncServer(directory, { allowedOrigins: undefined })
  let browser, releaseOldResponse
  try {
    await server.start()
    await server.access.configure({ enabled: true, interfaceName: candidate.name })
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    await server.stop()
    server = createSyncServer(directory, { ...ports, allowedOrigins: undefined })
    await server.start()
    const url = server.access.status(server.httpPort, server.wsPort).phoneUrl
    const credentialKey = `pardner:${server.store.manifest.workspaceId}:credential`
    browser = await engine.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const initialCode = server.access.createPairing(server.httpPort, server.wsPort).code
    await page.goto(`${url}#pair=${initialCode}`)
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    await page.getByLabel('Actor', { exact: true }).selectOption('alice')
    await page.goto('about:blank')
    await server.stop()
    server = createSyncServer(directory, { ...ports, allowedOrigins: undefined, apiToken: 'rotated-test-secret' })
    await server.start()

    let captureOldResponse
    const captured = new Promise(resolve => { captureOldResponse = resolve })
    const released = new Promise(resolve => { releaseOldResponse = resolve })
    const isOldStatus = request => request.url().endsWith('/automerge/status') && request.headers().authorization === 'Bearer test-token'
    await page.route('**/automerge/status', async route => {
      if (!isOldStatus(route.request())) return route.continue()
      const response = await route.fetch()
      assert.equal(response.status(), 401)
      captureOldResponse()
      await released
      await route.fulfill({ response })
    })
    await page.goto(url)
    await captured
    await page.getByLabel('Pairing code', { exact: true }).waitFor()
    assert.equal(await page.evaluate(key => localStorage.getItem(key), credentialKey), null)
    const replacement = server.access.createPairing(server.httpPort, server.wsPort).code
    await page.getByLabel('Pairing code', { exact: true }).fill(replacement)
    await page.getByRole('button', { name: 'Pair this device', exact: true }).click()
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.equal(server.access.pairing, null)

    const finished = page.waitForEvent('requestfinished', { predicate: isOldStatus })
    releaseOldResponse()
    await finished
    // Let the response handler and React render finish before asserting the connection survives.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), credentialKey), 'rotated-test-secret')
    assert.equal(await page.getByLabel('Actor', { exact: true }).count(), 1)
    assert.equal(await page.getByLabel('Actor', { exact: true }).inputValue(), 'alice')
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    await page.reload()
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Actor', { exact: true }).inputValue(), 'alice')
    assert.deepEqual(errors, [])
  } finally {
    releaseOldResponse?.()
    await browser?.close()
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps bootstrap and connection failures actionable and handles credential rotation', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-browser-errors-'))
  let service = await startCliService(directory)
  let browser
  try {
    await cli(directory, ['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human', '--actor', 'alice'])
    const { token } = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8'))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/assets/*.js', route => route.abort())
    await page.goto(`${service.httpUrl}/pardner/`)
    await page.getByText(/Pardner could not finish loading/).waitFor()
    await page.getByRole('button', { name: 'Reload Pardner' }).waitFor()
    await page.unroute('**/assets/*.js')
    await page.route('**/pardner/config', route => route.fulfill({ status: 500, json: { error: 'Configuration unavailable' } }))
    await page.reload()
    await page.getByText('Configuration unavailable', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Retry connection' }).waitFor()
    await page.unroute('**/pardner/config')
    await page.getByRole('button', { name: 'Retry connection' }).click()
    await page.getByLabel('Local service token').fill('incorrect')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByRole('alert').waitFor()
    await page.getByLabel('Local service token').fill(token)
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByLabel('Actor', { exact: true }).selectOption('alice')
    await service.stop()
    await page.getByRole('button', { name: 'Retry connection' }).waitFor()
    service = await startCliService(directory, ['--token', 'rotated-test-secret'], { reusePorts: true })
    await page.getByRole('button', { name: 'Retry connection' }).click()
    await page.getByLabel('Local service token').waitFor()
    await page.getByLabel('Local service token').fill('rotated-test-secret')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByLabel('Actor', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Actor', { exact: true }).inputValue(), 'alice')
    assert.deepEqual(errors, [])
  } finally { await browser?.close(); await service.stop(); await rm(directory, { recursive: true, force: true }) }
})

it('uses a same-origin WebSocket proxy path from service configuration', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-browser-proxy-'))
  const server = createSyncServer(directory, { allowedOrigins: undefined, browserWsPath: '/pardner/ws' })
  let browser, proxy
  let upgrades = 0
  const tunnels = new Set()
  try {
    await server.start()
    proxy = createServer((req, res) => {
      const upstream = httpRequest({ host: '127.0.0.1', port: server.httpPort, path: req.url, method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode, response.headers)
        response.pipe(res)
      })
      upstream.on('error', () => { res.writeHead(502); res.end() })
      req.pipe(upstream)
    })
    proxy.on('upgrade', (req, socket, head) => {
      assert.equal(new URL(req.url, 'http://localhost').pathname, '/pardner/ws')
      upgrades++
      const upstream = httpRequest({ host: '127.0.0.1', port: server.wsPort, path: req.url.replace('/pardner/ws', '/'), headers: req.headers })
      upstream.on('upgrade', (res, remote, remoteHead) => {
        tunnels.add(socket); tunnels.add(remote)
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`)
        if (head.length) remote.write(head)
        if (remoteHead.length) socket.write(remoteHead)
        socket.pipe(remote).pipe(socket)
        socket.on('close', () => { remote.destroy(); tunnels.delete(socket); tunnels.delete(remote) })
      })
      upstream.on('error', () => socket.destroy())
      upstream.end()
    })
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${proxy.address().port}`
    server.allowedOrigins.add(url)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${url}/pardner/`)
    await page.getByLabel('Local service token').fill('test-token')
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByText('Saved locally · synced', { exact: true }).waitFor()
    assert.equal(upgrades, 1)
    await page.getByLabel('Actor', { exact: true }).selectOption('alice')
    await page.getByRole('button', { name: 'New task', exact: true }).click()
    await page.getByLabel('Title', { exact: true }).fill('Created through the proxy')
    await page.getByRole('button', { name: 'Create task', exact: true }).click()
    await page.getByRole('heading', { name: 'Created through the proxy', exact: true }).waitFor()
    assert.equal(Object.values(server.store.getDoc().tasks).some(task => task.title === 'Created through the proxy'), true)
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    for (const socket of tunnels) socket.destroy()
    if (proxy) await new Promise(resolve => proxy.close(resolve))
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
