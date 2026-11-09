import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { startClient } from '../lib/client-service.js'
import { ClientRegistry } from '../lib/client-registry.js'
import { ClientAuth } from '../lib/client-auth.js'
import { workspaceProxy } from '../lib/client-proxy.js'
import { ClientCompanion, MAX_PENDING_PAIRINGS, PAIRING_TTL_MS, Throttle, matchPairing, throttleSource } from '../lib/client-companion.js'
import { eventually } from '../support/client-workspace.js'

const CLIENT_API = '/pardner/client/v1'

/** A raw HTTP call, so tests can send any path, Host, Origin, Authorization or Cookie header unnormalised. */
function raw(base, path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(base)
  const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: url.hostname, port: url.port, path, method,
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }), ...headers } }, res => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) } catch { /* Static files and empty bodies are not JSON. */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    req.on('error', reject)
    if (data !== undefined) req.write(data)
    req.end()
  })
}

/**
 * One client with a project and phone access on. The injected "LAN" interface is 127.0.0.1, so the phone
 * listener is a second port on loopback: its host and origin differ from the computer's by port.
 */
async function companionClient(t, { interfaces = [{ name: 'test-lan', address: '127.0.0.1' }], enable = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-companion-'))
  const uiDirectory = join(directory, 'ui')
  await mkdir(uiDirectory)
  await writeFile(join(uiDirectory, 'index.html'), '<!doctype html><title>Pardner</title>')
  const network = { interfaces }
  const client = await startClient({ directory: join(directory, 'client'), port: 0, gitDirectory: directory, uiDirectory,
    deviceName: 'Alice laptop', interfaces: () => network.interfaces })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const operator = client.registry.read().operatorToken
  const call = async (path, body, { token = operator, status = 200 } = {}) => {
    const response = await raw(client.url, `${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST', body,
      headers: { Authorization: `Bearer ${token}` } })
    assert.equal(response.status, status, `${path}: ${response.text}`)
    return response.json
  }
  await call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
  const { project } = await call('/projects', { name: 'Companion', operationId: 'create' })
  let status = null
  if (enable) status = await call('/companion/network', { enabled: true, interfaceName: 'test-lan' })
  const lanOrigin = () => new URL(client.companion.phoneUrl()).origin
  // A phone browser: it sends its own origin and keeps whatever cookie the phone listener sets.
  const phone = () => {
    const jar = { cookie: null }
    const send = async (path, body, { method = body === undefined ? 'GET' : 'POST', headers = {}, base = lanOrigin() } = {}) => {
      const response = await raw(base, path.startsWith('/pardner') ? path : `${CLIENT_API}${path}`, { method, body,
        headers: { Origin: base, ...(jar.cookie ? { Cookie: jar.cookie } : {}), ...headers } })
      const set = response.headers['set-cookie']?.[0]
      if (set) jar.cookie = set.split(';')[0].endsWith('=') ? null : set.split(';')[0]
      return response
    }
    return { jar, send }
  }
  const pair = async (projectId = project.id, name) => call(`/projects/${projectId}/companion/pairings`, name ? { name } : {})
  return { client, project, call, operator, status, phone, pair, lanOrigin, network, directory }
}
async function pairedPhone(fixture) {
  const { code } = await fixture.pair()
  const phone = fixture.phone()
  const redeemed = await phone.send('/companion/redeem', { code })
  assert.equal(redeemed.status, 200, redeemed.text)
  return { phone, redeemed }
}
const humanCookie = client => `${client.auth.cookieName}=${client.auth.exchange(client.auth.browserGrant(client.url), client.url)}`

test('pairing throttle refuses a noisy source before it can spend the global allowance', () => {
  let now = 100000
  const throttle = new Throttle({ now: () => now })
  for (let i = 0; i < 10; i++) throttle.take('192.168.1.10')
  assert.throws(() => throttle.take('192.168.1.10'), { code: 'PAIRING_THROTTLED' })
  // The IPv4-mapped form is the same device.
  for (let i = 0; i < 200; i++) assert.throws(() => throttle.take('::ffff:192.168.1.10'), { code: 'PAIRING_THROTTLED' })
  assert.equal(throttle.window.count, 10)
  throttle.take('192.168.1.11')
  for (let i = 0; i < 89; i++) throttle.take(`192.168.1.${12 + Math.floor(i / 10)}`)
  assert.equal(throttle.window.count, 100)
  // Global allowance of 100 is spent: a fresh source is refused until the window turns.
  assert.throws(() => throttle.take('192.168.1.99'), { code: 'PAIRING_THROTTLED' })
  now += 59999
  assert.throws(() => throttle.take('192.168.1.99'), { code: 'PAIRING_THROTTLED' })
  now++
  throttle.take('192.168.1.10')
  assert.equal(throttleSource('::FFFF:10.0.0.1'), '10.0.0.1')
})

test('pairing codes are keyed, hashed, capped, single use and expire', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-companion-unit-'))
  const registry = await ClientRegistry.open(directory)
  t.after(async () => { registry.close(); await rm(directory, { recursive: true, force: true }) })
  let now = 1000000
  registry.update(state => {
    state.identity = { id: 'human-1', name: 'Alice', email: 'alice@example.test' }
    state.projects.one = { key: 'one', id: 'project-one', state: 'ready' }
  })
  const companion = new ClientCompanion(registry, { now: () => now, interfaces: () => [{ name: 'wifi', address: '192.168.1.5' }] })
  const auth = new ClientAuth(registry, { now: () => now })
  const project = { id: 'project-one' }
  assert.throws(() => companion.issue(project, 'Phone'), { code: 'COMPANION_UNAVAILABLE' })
  companion.active = { interfaceName: 'wifi', address: '192.168.1.5', port: 9000 }
  const codes = []
  for (let i = 0; i < MAX_PENDING_PAIRINGS; i++) codes.push(companion.issue(project, `Phone ${i}`))
  assert.throws(() => companion.issue(project, 'Phone 6'), { code: 'PAIRING_LIMIT' })
  assert.equal(new Set(codes.map(c => c.code)).size, MAX_PENDING_PAIRINGS)
  for (const issued of codes) {
    assert.match(issued.code, /^\d{8}$/)
    assert.equal(issued.phoneUrl, 'http://192.168.1.5:9000/pardner/')
    assert.equal(JSON.stringify(registry.read()).includes(issued.code), false)
  }
  assert.equal(companion.status().pairings.every(p => !('code' in p) && !('codeHash' in p)), true)
  // Each code matches only its own pairing, and nothing else matches.
  assert.equal(matchPairing(registry.read().pairings, codes[2].code, now).id, codes[2].id)
  for (const wrong of ['', '1234567', '123456789', 'abcdefgh', 12345678, null]) assert.equal(matchPairing(registry.read().pairings, wrong, now), null)

  const first = auth.redeemCompanion(codes[0].code, null)
  assert.throws(() => auth.redeemCompanion(codes[0].code, null), { code: 'PAIRING_INVALID' })
  // A browser that already holds a companion session gains the project instead of a second phone.
  const again = auth.redeemCompanion(codes[1].code, first.token)
  assert.equal(again.token, first.token)
  assert.equal(Object.keys(registry.read().companions).length, 1)
  companion.cancel(codes[2].id)
  assert.throws(() => auth.redeemCompanion(codes[2].code, null), { code: 'PAIRING_INVALID' })
  now += PAIRING_TTL_MS
  assert.throws(() => auth.redeemCompanion(codes[3].code, null), { code: 'PAIRING_INVALID' })
  assert.deepEqual(companion.status().pairings.map(p => p.state), ['redeemed', 'redeemed', 'cancelled', 'expired', 'expired'])
  // A full window of expired codes no longer counts toward the cap.
  companion.issue(project, 'Later phone')

  // Sessions expire absolutely; a companion session never authenticates on the computer's own surface.
  const cookie = { headers: { cookie: `${auth.companionCookieName}=${first.token}` } }
  assert.equal(auth.authenticate(cookie, 'lan').kind, 'companion')
  assert.throws(() => auth.authenticate(cookie), { code: 'AUTH_REQUIRED' })
  assert.throws(() => auth.authenticate({ headers: { authorization: `Bearer ${first.token}` } }), { code: 'AUTH_REQUIRED' })
  assert.throws(() => auth.authenticate({ headers: { ...cookie.headers, authorization: `Bearer ${first.token}` } }, 'lan'), { code: 'AUTH_REQUIRED' })
  now += 30 * 86400000
  assert.throws(() => auth.authenticate(cookie, 'lan'), { code: 'AUTH_REQUIRED' })
})

test('the phone listener allows only the companion routes; the computer refuses companion sessions', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, project, call } = fixture
  assert.notEqual(fixture.lanOrigin(), client.url)
  const { phone, redeemed } = await pairedPhone(fixture)

  // The cookie: HttpOnly, same-site, Pardner paths only, thirty days, and not Secure over plain HTTP.
  const cookie = redeemed.headers['set-cookie'][0]
  assert.match(cookie, new RegExp(`^${client.auth.cookieName}_companion=[\\w-]+; HttpOnly; SameSite=Strict; Path=/pardner; Max-Age=2592000$`))
  assert.equal(redeemed.json.companion, true)

  const config = await phone.send('/pardner/config')
  assert.deepEqual(config.json, { mode: 'client', clientApiBase: CLIENT_API, companion: true })
  assert.match((await phone.send('/pardner/')).text, /<title>Pardner/)
  const session = (await phone.send('/session')).json
  assert.deepEqual(Object.keys(session).sort(), ['companion', 'device', 'identity', 'projects'])
  assert.deepEqual(session.identity, { name: 'Alice' })
  assert.equal(session.device.name, "Alice's phone")
  assert.equal(JSON.stringify(session).includes('alice@example.test'), false)
  assert.deepEqual(session.projects.map(p => [p.id, p.controlAvailable]), [[project.id, false]])

  const p = `/projects/${project.id}`
  for (const [path, body] of [[p], [`${p}/presence`], [`${p}/api/automerge/doc`], [`${p}/api/automerge/status`], [`${p}/api/automerge/ws-ticket`, { purpose: 'ui' }]]) {
    const response = await phone.send(path, body)
    assert.equal(response.status, 200, `${path}: ${response.text}`)
  }
  const presence = await phone.send(`${p}/sessions`, { kind: 'browser' })
  assert.equal(presence.status, 200)
  assert.equal((await phone.send(`${p}/sessions/${presence.json.sessionId}/report`, { seq: 0, active: true, focusTaskIds: [] })).status, 200)
  assert.equal((await phone.send(`${p}/sessions/${presence.json.sessionId}/end`, {})).status, 200)

  // Everything else on the phone listener is not found: administration, control, deliveries, agents, invites.
  const other = (await call('/projects', { name: 'Other', operationId: 'other' })).project
  const lan = fixture.lanOrigin()
  for (const [method, path] of [['POST', '/bootstrap'], ['POST', `${CLIENT_API}/bootstrap`], ['POST', `${CLIENT_API}/open`], ['POST', `${CLIENT_API}/shutdown`],
    ['POST', `${CLIENT_API}/identity`], ['POST', `${CLIENT_API}/projects`], ['POST', `${CLIENT_API}/join`], ['POST', `${CLIENT_API}/enroll`],
    ['GET', `${CLIENT_API}/companion`], ['POST', `${CLIENT_API}/companion/network`], ['POST', `${CLIENT_API}${p}/companion/pairings`],
    ['POST', `${CLIENT_API}/companion/pairings/x/cancel`], ['POST', `${CLIENT_API}/companion/devices/x/revoke`],
    ['GET', `${CLIENT_API}${p}/invites`], ['POST', `${CLIENT_API}${p}/invites`], ['POST', `${CLIENT_API}${p}/invites/x/revoke`],
    ['GET', `${CLIENT_API}${p}/export`], ['POST', `${CLIENT_API}${p}/agent-grant`], ['POST', `${CLIENT_API}${p}/revoke`],
    ['GET', `${CLIENT_API}${p}/api/pardner/control`], ['POST', `${CLIENT_API}${p}/api/pardner/control/poll`],
    ['GET', `${CLIENT_API}${p}/api/automerge/deliveries`], ['POST', `${CLIENT_API}${p}/api/automerge/deliveries/claim`],
    ['GET', `${CLIENT_API}/replica/${project.id}/people`], ['GET', '/pardner/control'], ['GET', `${CLIENT_API}/projects`],
    ['GET', `${CLIENT_API}${p}/api/%2e%2e/%2e%2e/companion`], ['GET', `${CLIENT_API}${p}/api/../../../companion`], ['GET', '/']]) {
    const response = await raw(lan, path, { method, body: method === 'POST' ? {} : undefined, headers: { Origin: lan, Cookie: phone.jar.cookie } })
    assert.equal(response.status, 404, `${method} ${path}: ${response.text}`)
  }
  // A project the phone was not paired with does not exist for it.
  for (const path of [`/projects/${other.id}`, `/projects/${other.id}/api/automerge/doc`]) assert.equal((await phone.send(path)).status, 404)

  // On the computer, the companion credential authenticates nothing, and the phone-only routes are not found.
  const token = phone.jar.cookie.split('=')[1]
  for (const headers of [{ Cookie: phone.jar.cookie }, { Authorization: `Bearer ${token}` }]) {
    assert.equal((await raw(client.url, `${CLIENT_API}/session`, { headers })).status, 401)
    assert.equal((await raw(client.url, `${CLIENT_API}/companion`, { headers })).status, 401)
  }
  assert.equal((await raw(client.url, `${CLIENT_API}/companion/redeem`, { method: 'POST', body: { code: '00000000' }, headers: { Origin: client.url } })).status, 404)
  assert.equal((await call('/companion/logout', {}, { status: 404 })).code, 'NOT_FOUND')

  // Phone administration belongs to a person (or the operator) on the computer; agents are refused.
  const state = client.registry.read()
  client.registry.update(next => {
    next.projects[client.project(project.id).key].people.builder = { id: 'builder', handle: 'builder', kind: 'agent', harnessId: 'openai-codex',
      humanId: state.identity.id, devices: [{ id: state.device.id, name: state.device.name }] }
  })
  const agent = client.auth.agentGrant(project.id, 'builder', state.device.id)
  for (const [path, body] of [['/companion'], ['/companion/network', { enabled: false }], [`${p}/companion/pairings`, {}],
    ['/companion/pairings/x/cancel', {}], ['/companion/devices/x/revoke', {}]]) {
    assert.equal((await call(path, body, { token: agent, status: 403 })).code, 'FORBIDDEN')
  }
  const human = humanCookie(client)
  const viaBrowser = await raw(client.url, `${CLIENT_API}${p}/companion/pairings`, { method: 'POST', body: { name: 'Work phone' }, headers: { Cookie: human, Origin: client.url } })
  assert.equal(viaBrowser.status, 200, viaBrowser.text)
  assert.deepEqual(Object.keys(viaBrowser.json).sort(), ['code', 'expiresAt', 'id', 'phoneUrl'])
  assert.equal((await raw(client.url, `${CLIENT_API}/companion`, { headers: { Cookie: human } })).status, 200)
})

test('the phone listener rejects bearer credentials, other hosts and other origins', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, operator } = fixture
  const { phone } = await pairedPhone(fixture)
  const lan = fixture.lanOrigin()
  // Even the operator token is refused there, and so is a valid cookie that comes with any Authorization header.
  for (const authorization of [`Bearer ${operator}`, 'Basic abc']) {
    const response = await phone.send('/session', undefined, { headers: { Authorization: authorization } })
    assert.equal(response.status, 403)
  }
  assert.equal((await raw(lan, `${CLIENT_API}/session`, { headers: { Cookie: phone.jar.cookie, Host: new URL(client.url).host } })).status, 403)
  assert.equal((await raw(lan, `${CLIENT_API}/session`, { headers: { Cookie: phone.jar.cookie, Host: `evil.example:${new URL(lan).port}` } })).status, 403)
  assert.equal((await phone.send('/session', undefined, { headers: { Origin: client.url } })).status, 403)
  assert.equal((await phone.send('/session', undefined, { headers: { Origin: 'http://evil.example' } })).status, 403)
  // Writes need the phone's own origin and JSON.
  const ops = `/projects/${fixture.project.id}/api/automerge/operations`
  const write = { type: 'task.create', operationId: 'phone-task', payload: { title: 'From the phone' } }
  assert.equal((await raw(lan, `${CLIENT_API}${ops}`, { method: 'POST', body: write, headers: { Cookie: phone.jar.cookie } })).status, 403)
  assert.equal((await phone.send(ops, JSON.stringify(write), { headers: { 'Content-Type': 'text/plain' } })).status, 403)
  // The computer's own address refuses the phone's origin.
  assert.equal((await raw(client.url, `${CLIENT_API}/session`, { headers: { Authorization: `Bearer ${operator}`, Origin: lan } })).status, 403)
  // Redeem needs the phone origin and JSON too.
  assert.equal((await raw(lan, `${CLIENT_API}/companion/redeem`, { method: 'POST', body: { code: '00000000' } })).status, 403)
})

test('a paired phone edits the board as its person and shows in presence under its own name', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, project, call } = fixture
  const { phone } = await pairedPhone(fixture)
  const p = `/projects/${project.id}`
  const saved = await phone.send(`${p}/api/automerge/operations`, { type: 'task.create', operationId: 'phone-task', payload: { title: 'From the phone' } })
  assert.equal(saved.status, 200, saved.text)
  assert.equal(saved.json.actorId, project.actorId)
  const spoof = await phone.send(`${p}/api/automerge/operations`, { type: 'task.create', operationId: 'spoof', actorId: 'someone-else', payload: { title: 'x' } })
  assert.equal(spoof.status, 403)
  const { doc } = await call(`${p}/api/automerge/doc`)
  assert.equal(doc.tasks[saved.json.result.taskId].title, 'From the phone')

  const { sessionId } = (await phone.send(`${p}/sessions`, { kind: 'browser' })).json
  const snapshot = await call(`${p}/presence`)
  const seen = snapshot.actors.find(actor => actor.actorId === project.actorId).sessions.find(s => s.sessionId === sessionId)
  assert.equal(seen.deviceName, "Alice's phone")
  assert.notEqual(seen.deviceId, client.registry.read().device.id)

  // A second code redeemed by the same phone adds the project to the same phone.
  const second = (await call('/projects', { name: 'Second', operationId: 'second' })).project
  const { code } = await fixture.pair(second.id)
  assert.equal((await phone.send('/companion/redeem', { code })).status, 200)
  const status = await call('/companion')
  assert.equal(status.companions.length, 1)
  assert.deepEqual(status.companions[0].projectIds.sort(), [project.id, second.id].sort())
  assert.equal((await phone.send('/session')).json.projects.length, 2)
  // Revoking the person's membership ends the phone's access to that project through the same binding.
  client.registry.update(state => { state.projects[client.project(second.id).key].revokedActors = [second.actorId] })
  assert.deepEqual((await phone.send('/session')).json.projects.map(row => row.id), [project.id])
  assert.equal((await phone.send(`/projects/${second.id}`)).status, 403)

  // Explicitly: the phone has no human authority and no control or deliveries.
  const principal = client.auth.authenticate({ headers: { cookie: phone.jar.cookie } }, 'lan')
  assert.throws(() => client.human(principal), { code: 'FORBIDDEN' })
  assert.equal(client.controlAllowed(principal, 'lan'), false)
  for (const path of ['/pardner/control', '/automerge/deliveries']) {
    await assert.rejects(workspaceProxy(client, client.project(project.id), principal, 'GET', new URL(path, fixture.lanOrigin()), undefined, fixture.lanOrigin(), 'lan'),
      { code: 'FORBIDDEN' })
  }
  await assert.rejects(client.invites.issue(client.project(project.id), principal, { purpose: 'human', operationId: 'x' }), { code: 'FORBIDDEN' })
})

test('pairing codes coexist, survive re-saving the same network, and are spent once', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, call } = fixture
  const first = await fixture.pair(), second = await fixture.pair()
  assert.notEqual(first.id, second.id)
  assert.match(first.phoneUrl, /^http:\/\/127\.0\.0\.1:\d+\/pardner\/$/)
  const port = client.companion.active.port
  // Saving the settings already in effect is a no-op: the listener and both codes stay (#137, #147).
  const again = await call('/companion/network', { enabled: true, interfaceName: 'test-lan' })
  assert.equal(again.active.port, port)
  assert.deepEqual(again.pairings.map(p => p.state), ['pending', 'pending'])
  assert.equal((await fixture.phone().send('/companion/redeem', { code: second.code })).status, 200)
  assert.equal((await fixture.phone().send('/companion/redeem', { code: first.code })).status, 200)
  const reused = await fixture.phone().send('/companion/redeem', { code: first.code })
  assert.equal(reused.status, 400)
  assert.equal(reused.json.code, 'PAIRING_INVALID')
  assert.equal((await call('/companion')).companions.length, 2)

  const expiring = await fixture.pair(), cancelled = await fixture.pair()
  client.registry.update(state => { state.pairings[expiring.id].expiresAt = Date.now() - 1 })
  assert.equal((await call(`/companion/pairings/${cancelled.id}/cancel`, {})).pairing.state, 'cancelled')
  for (const code of [expiring.code, cancelled.code]) assert.equal((await fixture.phone().send('/companion/redeem', { code })).json.code, 'PAIRING_INVALID')
  const states = Object.fromEntries((await call('/companion')).pairings.map(p => [p.id, p.state]))
  assert.deepEqual([states[expiring.id], states[cancelled.id], states[first.id]], ['expired', 'cancelled', 'redeemed'])
})

test('redeem is throttled by the socket address, ignoring forwarding headers', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { code } = await fixture.pair()
  const phone = fixture.phone()
  for (let i = 0; i < 10; i++) {
    const response = await phone.send('/companion/redeem', { code: '00000000' === code ? '11111111' : '00000000' }, { headers: { 'X-Forwarded-For': `10.0.0.${i}` } })
    assert.equal(response.json.code, 'PAIRING_INVALID')
  }
  const blocked = await phone.send('/companion/redeem', { code }, { headers: { 'X-Forwarded-For': '10.9.9.9' } })
  assert.equal(blocked.status, 429)
  assert.equal(blocked.json.code, 'PAIRING_THROTTLED')
  assert.equal((await fixture.call('/companion')).pairings[0].state, 'pending')
})

test('revoking a phone closes its socket, ends its presence and keeps it out', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, project, call } = fixture
  const { phone } = await pairedPhone(fixture)
  const p = `/projects/${project.id}`
  const lan = fixture.lanOrigin()
  const { ticket } = (await phone.send(`${p}/api/automerge/ws-ticket`, { purpose: 'ui' })).json
  // A ticket is bound to the phone origin: the computer's origin cannot use it.
  const socket = new WebSocket(`${lan.replace('http:', 'ws:')}${CLIENT_API}${p}/ws?ticket=${ticket}`, { origin: lan, headers: { Cookie: phone.jar.cookie } })
  const closed = new Promise(resolve => socket.once('close', resolve))
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  assert.equal([...client.sockets].filter(s => s.clientCompanion).length, 2)
  const { sessionId } = (await phone.send(`${p}/sessions`, { kind: 'browser' })).json
  const companionId = (await call('/companion')).companions[0].id

  const revoked = await call(`/companion/devices/${companionId}/revoke`, {})
  assert.equal(typeof revoked.companion.revokedAt, 'number')
  await closed
  await eventually(() => ![...client.sockets].some(s => s.clientCompanion))
  const sessions = (await call(`${p}/presence`)).actors.flatMap(actor => actor.sessions)
  assert.equal(sessions.some(s => s.sessionId === sessionId), false)
  assert.equal((await phone.send('/session')).status, 401)
  assert.equal((await phone.send(`${p}/api/automerge/ws-ticket`, { purpose: 'ui' })).status, 401)
  // A revoked phone is not revived by redeeming a new code; it becomes a new phone.
  const { code } = await fixture.pair()
  assert.equal((await phone.send('/companion/redeem', { code })).status, 200)
  assert.equal((await call('/companion')).companions.filter(c => !c.revokedAt).length, 1)
  // Signing out on the phone retires it the same way.
  const out = await phone.send('/companion/logout', {})
  assert.equal(out.status, 200)
  assert.match(out.headers['set-cookie'][0], /Max-Age=0/)
  assert.equal((await call('/companion')).companions.every(c => c.revokedAt), true)
})

test('a WebSocket on the phone listener needs a ticket bound to the phone origin', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, project } = fixture
  const { phone } = await pairedPhone(fixture)
  const p = `/projects/${project.id}`
  const lan = fixture.lanOrigin()
  const attempt = (origin, headers = { Cookie: phone.jar.cookie }) => phone.send(`${p}/api/automerge/ws-ticket`, { purpose: 'ui' }).then(({ json }) =>
    new Promise(resolve => {
      const socket = new WebSocket(`${lan.replace('http:', 'ws:')}${CLIENT_API}${p}/ws?ticket=${json.ticket}`, { ...(origin ? { origin } : {}), headers })
      socket.once('open', () => { socket.terminate(); resolve('open') })
      socket.once('error', () => resolve('refused'))
    }))
  assert.equal(await attempt(client.url), 'refused')
  assert.equal(await attempt(null), 'refused')
  assert.equal(await attempt(lan, { Cookie: phone.jar.cookie, Authorization: `Bearer ${fixture.operator}` }), 'refused')
  assert.equal(await attempt(lan), 'open')
})

test('phone access turns on and off without a restart and keeps paired phones', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, project, call } = fixture
  const { phone } = await pairedPhone(fixture)
  const lan = fixture.lanOrigin(), port = client.companion.active.port
  const p = `/projects/${project.id}`
  const { ticket } = (await phone.send(`${p}/api/automerge/ws-ticket`, { purpose: 'ui' })).json
  const socket = new WebSocket(`${lan.replace('http:', 'ws:')}${CLIENT_API}${p}/ws?ticket=${ticket}`, { origin: lan, headers: { Cookie: phone.jar.cookie } })
  const closed = new Promise(resolve => socket.once('close', resolve))
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const { sessionId } = (await phone.send(`${p}/sessions`, { kind: 'browser' })).json
  const waiting = await fixture.pair()

  const off = await call('/companion/network', { enabled: false })
  assert.deepEqual([off.settings.enabled, off.active, off.phoneUrl], [false, null, null])
  assert.equal(off.pairings.find(row => row.id === waiting.id).state, 'cancelled')
  assert.equal(off.companions.length, 1)
  await closed
  assert.equal([...client.sockets].some(s => s.clientSurface === 'lan'), false)
  assert.equal((await call(`${p}/presence`)).actors.flatMap(actor => actor.sessions).some(s => s.sessionId === sessionId), false)
  await assert.rejects(raw(lan, `${CLIENT_API}/session`, { headers: { Origin: lan, Cookie: phone.jar.cookie } }), { code: 'ECONNREFUSED' })
  assert.equal(client.registry.read().companion.port, port)
  assert.equal(lan, `http://127.0.0.1:${port}`)
  assert.equal((await call(`${p}/companion/pairings`, {}, { status: 409 })).code, 'COMPANION_UNAVAILABLE')

  // Turned back on, the same address and port come back and the paired phone is still signed in.
  const on = await call('/companion/network', { enabled: true, interfaceName: 'test-lan' })
  assert.equal(on.active.port, port)
  assert.equal((await phone.send('/session')).status, 200)
})

test('a network that cannot be bound, or that goes away, reports why and binds nothing else', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t, { interfaces: [{ name: 'test-lan', address: '127.0.0.1' }, { name: 'gone', address: '192.0.2.250' }], enable: false })
  const { client, project, call, network } = fixture
  // With two networks, one must be chosen.
  assert.equal((await call('/companion/network', { enabled: true }, { status: 400 })).code, 'INVALID_ARGUMENT')
  assert.equal((await call('/companion/network', { enabled: true, interfaceName: 'missing' }, { status: 400 })).code, 'INVALID_ARGUMENT')
  assert.equal((await call('/companion')).settings.enabled, false)
  const failed = await call('/companion/network', { enabled: true, interfaceName: 'gone' })
  assert.deepEqual([failed.settings.enabled, failed.active, failed.phoneUrl], [true, null, null])
  assert.match(failed.diagnostic, /Could not listen on 192\.0\.2\.250/)
  assert.equal(client.lan, null)
  assert.equal((await call(`/projects/${project.id}/companion/pairings`, {}, { status: 409 })).code, 'COMPANION_UNAVAILABLE')

  const bound = await call('/companion/network', { enabled: true, interfaceName: 'test-lan' })
  assert.equal(bound.diagnostic, null)
  const pairing = await fixture.pair()
  // The interface disappears: status says the address is stale; asking again rebinds or explains.
  network.interfaces = [{ name: 'gone', address: '192.0.2.250' }]
  const stale = await call('/companion')
  assert.deepEqual([stale.stale, stale.phoneUrl], [true, null])
  assert.match(stale.diagnostic, /changed\. Rebind/)
  assert.equal((await call('/companion/network', { enabled: true, interfaceName: 'test-lan' }, { status: 400 })).code, 'INVALID_ARGUMENT')
  network.interfaces = [{ name: 'test-lan', address: '127.0.0.1' }]
  const rebound = await call('/companion/network', { enabled: true, interfaceName: 'test-lan' })
  assert.equal(rebound.stale, false)
  assert.equal(rebound.pairings.find(row => row.id === pairing.id).state, 'pending')
})

test('saved phone access is restored when the service starts', { timeout: 60000 }, async t => {
  const fixture = await companionClient(t)
  const { client, directory } = fixture
  const port = client.companion.active.port, lan = fixture.lanOrigin()
  const { phone } = await pairedPhone(fixture)
  await client.stop()
  const restarted = await startClient({ directory: join(directory, 'client'), port: 0, gitDirectory: directory, uiDirectory: join(directory, 'ui'),
    interfaces: () => [{ name: 'test-lan', address: '127.0.0.1' }] })
  try {
    assert.equal(restarted.companion.active.port, port)
    assert.equal((await phone.send('/session', undefined, { base: lan })).status, 200)
  } finally { await restarted.stop() }
})

test('pairing codes and companion tokens appear in no log, response list or registry file', { timeout: 60000 }, async t => {
  const written = []
  const originals = { stderr: process.stderr.write, log: console.log, error: console.error, warn: console.warn, info: console.info }
  process.stderr.write = function (chunk, ...rest) { written.push(String(chunk)); return originals.stderr.call(this, chunk, ...rest) }
  for (const name of ['log', 'error', 'warn', 'info']) console[name] = (...args) => { written.push(args.join(' ')); originals[name](...args) }
  t.after(() => { process.stderr.write = originals.stderr; for (const name of ['log', 'error', 'warn', 'info']) console[name] = originals[name] })
  const fixture = await companionClient(t)
  const { client, call } = fixture
  const spent = await fixture.pair(), waiting = await fixture.pair()
  const phone = fixture.phone()
  await phone.send('/companion/redeem', { code: spent.code })
  await phone.send('/companion/redeem', { code: '12345678' === waiting.code ? '87654321' : '12345678' })
  const token = phone.jar.cookie.split('=')[1]
  const status = JSON.stringify(await call('/companion'))
  const registry = JSON.stringify(client.registry.read())
  const files = await Promise.all((await readdir(client.registry.directory)).filter(name => name.startsWith('client.sqlite')).map(name => readFile(join(client.registry.directory, name), 'latin1')))
  for (const secret of [spent.code, waiting.code, token]) {
    assert.equal(written.join('\n').includes(secret), false)
    assert.equal(status.includes(secret), false)
    assert.equal(registry.includes(secret), false)
    for (const file of files) assert.equal(file.includes(secret), false)
  }
})
