import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from '../ui-prototype/node_modules/vite/dist/node/index.js'

import config from '../ui-prototype/vite.config.js'

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
