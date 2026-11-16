import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from '../ui-prototype/node_modules/vite/dist/node/index.js'

import config, { clientProxy } from '../ui-prototype/vite.config.js'

const fetch = (url, options = {}) => globalThis.fetch(url, { signal: AbortSignal.timeout(60000), ...options })

const root = fileURLToPath(new URL('../ui-prototype/', import.meta.url))

test('development server isolates workspace files and listens only on loopback', async (t) => {
  const inside = await mkdtemp(path.join(root, '.security-test-'))
  const outside = await mkdtemp(path.join(root, '../.security-test-'))
  t.after(() => Promise.all([inside, outside].map(dir => rm(dir, { recursive: true, force: true }))))
  const secret = 'synthetic-workspace-token'
  await mkdir(path.join(inside, '.pardner'))
  await mkdir(path.join(outside, '.pardner'))
  const denied = [
    path.join(inside, '.pardner/connection.json'),
    path.join(outside, '.pardner/connection.json'),
    path.join(outside, 'parent-file.txt'),
    path.join(inside, '.env.local'),
    path.join(inside, 'private.pem')
  ]
  await Promise.all(denied.map(file => writeFile(file, secret)))
  await writeFile(path.join(inside, 'public.txt'), 'safe-ui-file')
  const server = await createServer({ ...config, root, configFile: false, server: { ...config.server, port: 0, preTransformRequests: false }, optimizeDeps: { disabled: true }, logLevel: 'silent' })
  t.after(async () => {
    server.httpServer.closeAllConnections()
    await server.close()
  })
  await server.listen()
  const address = server.httpServer.address()
  assert.equal(address.address, '127.0.0.1')
  const origin = `http://127.0.0.1:${address.port}`
  assert.equal((await fetch(`${origin}/pardner/`)).status, 200)
  const allowed = await fetch(`${origin}/pardner/@fs/${path.join(inside, 'public.txt')}`)
  assert.equal(allowed.status, 200)
  assert.equal(await allowed.text(), 'safe-ui-file')
  for (const file of denied) {
    for (const suffix of ['', '?raw', '?url']) {
      const response = await fetch(`${origin}/pardner/@fs/${file}${suffix}`)
      assert.equal(response.status, 403, `${file}${suffix}`)
      assert.ok(!(await response.text()).includes(secret))
    }
  }
  const relative = path.relative(root, path.join(inside, '.pardner/connection.json'))
  assert.equal((await fetch(`${origin}/pardner/${relative}`)).status, 403)
  const lan = Object.values(networkInterfaces()).flat().find(iface => iface.family === 'IPv4' && !iface.internal)
  if (lan) {
    await assert.rejects(fetch(`http://${lan.address}:${address.port}/pardner/`, { signal: AbortSignal.timeout(1500) }))
  } else {
    t.diagnostic('No non-loopback IPv4 interface; verified bound socket address instead')
  }
})

test('development proxy presents the client origin only for its own page and leaves other origins to be rejected', async (t) => {
  const { createServer: createHttpServer } = await import('node:http')
  const { WebSocketServer, WebSocket } = await import('ws')
  const seen = []
  const target = createHttpServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host, origin: req.headers.origin })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ mode: 'client', clientApiBase: '/pardner/client/v1' }))
  })
  const sockets = new WebSocketServer({ server: target })
  sockets.on('connection', (socket, req) => {
    seen.push({ url: req.url, host: req.headers.host, origin: req.headers.origin })
    socket.send('upstream')
  })
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    // Upgraded sockets are not HTTP connections: end them first or close() waits on them.
    for (const client of sockets.clients) client.terminate()
    sockets.close()
    target.closeAllConnections()
    return new Promise(resolve => target.close(resolve))
  })
  const clientUrl = `http://127.0.0.1:${target.address().port}`
  const proxy = clientProxy(clientUrl)
  assert.equal(clientProxy(undefined), undefined, 'without PARDNER_CLIENT_URL nothing is proxied')
  const server = await createServer({ ...config, root, configFile: false,
    server: { ...config.server, port: 0, proxy, preTransformRequests: false }, optimizeDeps: { disabled: true }, logLevel: 'silent' })
  t.after(async () => {
    server.httpServer.closeAllConnections()
    await server.close()
  })
  await server.listen()
  const devOrigin = `http://127.0.0.1:${server.httpServer.address().port}`
  const clientHost = new URL(clientUrl).host

  assert.equal((await (await fetch(`${devOrigin}/pardner/config`)).json()).mode, 'client')
  await fetch(`${devOrigin}/pardner/client/v1/bootstrap`, { method: 'POST', headers: { Origin: devOrigin } })
  await fetch(`${devOrigin}/pardner/client/v1/session`, { headers: { Origin: 'http://evil.example' } })
  assert.deepEqual(seen.splice(0), [
    { url: '/pardner/config', host: clientHost, origin: undefined },
    { url: '/pardner/client/v1/bootstrap', host: clientHost, origin: clientUrl },
    { url: '/pardner/client/v1/session', host: clientHost, origin: 'http://evil.example' },
  ])
  const socket = new WebSocket(`${devOrigin.replace('http', 'ws')}/pardner/client/v1/projects/p/ws?ticket=t`, { headers: { Origin: devOrigin } })
  t.after(() => socket.terminate())
  assert.equal(String(await new Promise((resolve, reject) => { socket.once('message', resolve); socket.once('error', reject) })), 'upstream')
  assert.deepEqual(seen.splice(0), [{ url: '/pardner/client/v1/projects/p/ws?ticket=t', host: clientHost, origin: clientUrl }])
  // Only the client's own routes are forwarded; a look-alike prefix stays on the dev server.
  await fetch(`${devOrigin}/pardner/clientele`)
  assert.deepEqual(seen, [])
})
