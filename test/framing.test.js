import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chromium } from 'playwright'
import { withStartedServer, httpUrl, TEST_TOKEN } from '../support/resources.js'

it('denies framing on UI documents, assets, redirects, cached responses and errors', async () => {
  await withStartedServer({}, async server => {
    const get = (path, options) => fetch(httpUrl(server, path), { redirect: 'manual', ...options })
    const check = (response, status) => {
      assert.equal(response.status, status)
      assert.match(response.headers.get('content-security-policy'), /(?:^|;\s*)frame-ancestors 'none'(?:;|$)/)
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
    }
    const index = await get('/pardner/')
    check(index, 200)
    const html = await index.text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1])
    assert.ok(assets.length > 0, 'build the UI before running this test')
    for (const asset of assets) check(await get(new URL(asset, httpUrl(server, '/pardner/')).pathname), 200)
    check(await get('/pardner/index.html'), 200)
    check(await get('/pardner/', { method: 'HEAD' }), 200)
    check(await get('/pardner/', { headers: { 'If-None-Match': index.headers.get('etag'), 'Cache-Control': 'max-age=0' } }), 304)
    check(await get('/pardner'), 301)
    check(await get('/pardner/missing'), 401)
    check(await get('/pardner/missing', { headers: { Authorization: `Bearer ${TEST_TOKEN}` } }), 404)
    check(await get('/pardner/', { headers: { Origin: 'https://hostile.example' } }), 403)
    check(await get('/pardner/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), 400)
  })
})

it('blocks cross-origin framing while allowing the authenticated top-level UI', { timeout: 60000 }, async () => {
  await withStartedServer({ allowedOrigins: undefined }, async server => {
    const target = httpUrl(server, '/pardner/')
    const attacker = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<iframe src="${target}"></iframe>`)
    })
    let browser
    try {
      attacker.listen(0, '127.0.0.1')
      await once(attacker, 'listening')
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      await page.goto(target)
      await page.getByLabel('Local service token').fill(TEST_TOKEN)
      await page.getByRole('button', { name: 'Connect', exact: true }).click()
      await page.getByRole('button', { name: 'New task', exact: true }).waitFor()
      const blocked = page.waitForEvent('console', { predicate: message => /frame-ancestors/.test(message.text()) })
      await page.goto(`http://127.0.0.1:${attacker.address().port}/`)
      await blocked
      assert.equal(page.frames().some(frame => frame.url() === target), false)
      assert.equal(await page.frameLocator('iframe').getByRole('button', { name: 'New task', exact: true }).count(), 0)
    } finally {
      await browser?.close()
      await new Promise(resolve => attacker.close(resolve))
    }
  })
})
