import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { LanAccess, lanInterfaces } from '../lib/lan-access.js'
import { createServer, createTempDir, cleanupTempDir } from '../support/resources.js'

it('serves assets, authenticated APIs, and subscriptions over persisted LAN listeners', { timeout: 20000 }, async t => {
  const candidate = lanInterfaces()[0]
  if (!candidate) return t.skip('LAN listeners require a real non-loopback IPv4 interface.')
  const directory = createTempDir('pardner-lan-server-')
  const logs = []
  const options = { allowedOrigins: undefined, logger: { log: text => logs.push(text), warn: text => logs.push(text) } }
  let server = createServer(directory, options)
  let socket
  const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }
  const local = path => `http://127.0.0.1:${server.httpPort}${path}`
  try {
    await server.start()
    assert.equal(server.lanServers.length, 0)
    assert.equal((await fetch(local('/pardner/access'))).status, 401)
    const saved = await fetch(local('/pardner/access'), { method: 'POST', headers, body: JSON.stringify({ enabled: true, interfaceName: candidate.name }) })
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).restartRequired, true)
    const manifest = await readFile(join(directory, 'workspace.json'), 'utf8')
    const ports = { httpPort: server.httpPort, wsPort: server.wsPort }
    await server.stop()
    server = createServer(directory, { ...options, ...ports })
    await server.start()
    assert.equal(await readFile(join(directory, 'workspace.json'), 'utf8'), manifest)
    assert.equal((await stat(join(directory, 'access.json'))).mode & 0o777, 0o600)
    const origin = `http://${candidate.address}:${server.httpPort}`
    const lanHeaders = { ...headers, Origin: origin }
    const html = await fetch(`${origin}/pardner/`, { headers: { Origin: origin } })
    assert.equal(html.status, 200)
    const modulePath = (await html.text()).match(/src="([^"]+\.js)"/)[1]
    assert.equal((await fetch(`${origin}${modulePath}`, { headers: { Origin: origin } })).status, 200)
    const config = await (await fetch(`${origin}/pardner/config`, { headers: { Origin: origin } })).json()
    assert.equal(config.canManageAccess, false)
    assert.equal(config.wsPort, server.wsPort)
    assert.equal((await fetch(`${origin}/pardner/access`, { headers: lanHeaders })).status, 200)
    assert.equal((await fetch(`${origin}/pardner/access`, { method: 'POST', headers: lanHeaders, body: '{}' })).status, 403)
    assert.equal((await fetch(`${origin}/pardner/access/pairing`, { method: 'POST', headers: { Origin: origin }, body: '{}' })).status, 401)
    const pairing = await (await fetch(`${origin}/pardner/access/pairing`, { method: 'POST', headers: lanHeaders, body: '{}' })).json()
    const paired = await fetch(`${origin}/pardner/pair`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairing.code }) })
    assert.equal(paired.status, 200)
    assert.equal(paired.headers.get('cache-control'), 'no-store')
    const result = await paired.json()
    assert.equal(result.token === 'test-token', true)
    assert.equal((await fetch(`${origin}/pardner/pair`, { method: 'POST', headers: lanHeaders, body: JSON.stringify({ code: pairing.code }) })).status, 400)
    assert.equal((await fetch(`${origin}/pardner/pair`, { method: 'POST', headers, body: '{}' })).status, 403)
    for (const path of ['/pardner/', modulePath, '/pardner/config', '/automerge/doc', '/automerge/ws-ticket', '/pardner/pair']) {
      assert.equal((await fetch(`${origin}${path}`, { headers: { ...headers, Origin: 'http://denied.example' } })).status, 403)
    }
    assert.equal((await fetch(`${origin}/automerge/operations`, { method: 'OPTIONS', headers: { Origin: origin } })).status, 204)
    assert.equal((await fetch(`${origin}/automerge/doc`, { headers: lanHeaders })).status, 200)
    const wrongWorkspace = await fetch(`${origin}/automerge/operations`, { method: 'POST', headers: {
      ...lanHeaders, 'X-Pardner-Workspace': 'a-different-workspace',
    }, body: JSON.stringify({ operationId: 'must-not-write', actorId: 'alice', type: 'task.create', payload: { title: 'Wrong workspace' } }) })
    assert.equal(wrongWorkspace.status, 409)
    assert.equal((await wrongWorkspace.json()).code, 'WORKSPACE_MISMATCH')
    assert.equal(Object.values(server.store.getDoc().tasks).some(task => task.title === 'Wrong workspace'), false)
    const { ticket } = await (await fetch(`${origin}/automerge/ws-ticket`, { method: 'POST', headers: lanHeaders, body: '{}' })).json()
    socket = new WebSocket(`ws://${candidate.address}:${server.wsPort}/?ticket=${ticket}`, { origin })
    const first = await new Promise((resolve, reject) => { socket.once('message', data => resolve(JSON.parse(data))); socket.once('error', reject) })
    assert.equal(first.type, 'document-state')
    socket.terminate()
    for (const badOrigin of [origin, 'http://denied.example']) {
      await new Promise((resolve, reject) => {
        const denied = new WebSocket(`ws://${candidate.address}:${server.wsPort}/?ticket=secret-ticket&token=secret-query`, { origin: badOrigin })
        denied.on('error', () => {})
        denied.once('unexpected-response', (_req, response) => { response.resume(); denied.terminate(); resolve() })
        denied.once('open', () => { denied.terminate(); reject(new Error('Unexpected authorization')) })
      })
    }
    await fetch(`${origin}/automerge/doc?token=secret-query`, { headers: { Origin: 'http://denied.example' } })
    assert.equal(logs.some(line => /secret-ticket|secret-query|test-token/.test(line) || line.includes(pairing.code)), false)
    await fetch(local('/pardner/access'), { method: 'POST', headers, body: '{bad secret-query' })
    assert.equal(logs.some(line => line.includes('secret-query')), false)
    await fetch(local('/pardner/access'), { method: 'POST', headers, body: JSON.stringify({ enabled: false }) })
    await server.stop()
    server = createServer(directory, { ...options, ...ports })
    await server.start()
    assert.equal(server.lanServers.length, 0)
    assert.equal((await fetch(local('/automerge/doc'), { headers })).status, 200)
  } finally {
    socket?.terminate()
    await server.stop()
    cleanupTempDir(directory)
  }
})

it('keeps loopback available when the chosen LAN listener cannot start', async () => {
  const directory = createTempDir('pardner-lan-failure-')
  let server = createServer(directory)
  try {
    await server.start()
    await server.stop()
    const access = new LanAccess(directory, { interfaces: () => [{ name: 'gone', address: '192.0.2.250' }] })
    await access.load()
    await access.configure({ enabled: true })
    server = createServer(directory, { access })
    await server.start()
    assert.equal(server.lanServers.length, 0)
    assert.match(access.diagnostic, /could not start/)
    assert.equal((await fetch(`http://127.0.0.1:${server.httpPort}/automerge/doc`, { headers: { Authorization: 'Bearer test-token' } })).status, 200)
  } finally { await server.stop(); cleanupTempDir(directory) }
})
