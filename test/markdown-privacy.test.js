import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { chromium, webkit } from 'playwright'
import { withClientWorkspace } from '../support/client-workspace.js'

for (const engine of [chromium, webkit]) it(`blocks Markdown image tracking in ${engine.name()}`, { timeout: 60000 }, async () => {
  const received = []
  const tracker = createServer((request, response) => {
    received.push({ url: request.url, referer: request.headers.referer })
    response.end('tracker')
  })
  try {
    tracker.listen(0, '127.0.0.1')
    await once(tracker, 'listening')
    const origin = `http://127.0.0.1:${tracker.address().port}`
    await withClientWorkspace(engine, {}, async ({ page, operate, open }) => {
      const markdown = [
        '**Formatted text** and ~~old text~~',
        `![inline image](${origin}/inline)`,
        `![protocol relative](//127.0.0.1:${tracker.address().port}/relative)`,
        '![reference image][tracking]',
        `[tracking]: ${origin}/reference`,
        '![same origin](/markdown-image-probe)',
        '![](/empty-alt-probe)',
        `<img src="${origin}/raw-html">`,
        `[Visit reference](${origin}/visit)`,
      ].join('\n\n')
      const { result: { taskId } } = await operate('task.create', { title: 'Markdown privacy', description: markdown })
      await operate('comment.add', { taskId, text: markdown })
      const imageRequests = []
      page.on('request', request => {
        if (request.resourceType() === 'image') imageRequests.push(request.url())
    })
    await open()
    await page.getByRole('button', { name: /Markdown privacy/ }).click()
    await page.locator('.comment .markdown strong').waitFor()
    const rendered = page.locator('.markdown')
    assert.equal(await rendered.count(), 2)
    assert.equal(await rendered.locator('img').count(), 0)
    assert.equal(await rendered.locator('strong').count(), 2)
    assert.equal(await rendered.locator('del').count(), 2)
    for (const text of await rendered.allTextContents()) {
      for (const alt of ['inline image', 'protocol relative', 'reference image', 'same origin', 'Image omitted']) assert.ok(text.includes(alt), alt)
    }
    assert.deepEqual(imageRequests, [])
    assert.deepEqual(received, [])

    assert.equal(await page.evaluate(() => new Promise(resolve => {
      const image = new Image()
      image.onload = () => resolve(image.naturalWidth)
      image.onerror = () => resolve(0)
      image.src = document.createElement('canvas').toDataURL()
    })), 300, 'data images remain loadable under the page policy')

    // Exercise the browser policy independently of the Markdown renderer.
    const violation = await page.evaluate(url => new Promise(resolve => {
      document.addEventListener('securitypolicyviolation', event => resolve({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }), { once: true })
      const image = new Image()
      image.src = url
      document.body.append(image)
    }), `${origin}/csp-probe`)
    assert.equal(violation.directive, 'img-src')
    assert.equal(new URL(violation.blocked).origin, origin)
    assert.deepEqual(received, [], 'CSP must prevent the request reaching the remote server')
    await page.getByRole('link', { name: 'Visit reference', exact: true }).first().click()
    await page.waitForURL(`${origin}/visit`)
    assert.deepEqual(received, [{ url: '/visit', referer: undefined }])
    })
  } finally {
    await new Promise(resolve => tracker.close(resolve))
  }
})
