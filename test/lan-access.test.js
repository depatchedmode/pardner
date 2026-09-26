import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LanAccess, canManageAccess, lanInterfaces } from '../lib/lan-access.js'

async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-lan-'))
  try { await fn(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

it('persists explicit LAN selection and resolves changed or missing interfaces on restart', () => fixture(async directory => {
  let interfaces = [{ name: 'wifi', address: '192.168.1.5' }]
  const options = { interfaces: () => interfaces }
  const access = new LanAccess(directory, options)
  assert.equal(await access.load(), null)
  await access.configure({ enabled: true })
  assert.equal(access.status(8004, 8005).restartRequired, true)
  assert.equal(access.status(8004, 8005).phoneUrl, null)
  assert.equal((await stat(join(directory, 'access.json'))).mode & 0o777, 0o600)
  const restarted = new LanAccess(directory, options)
  restarted.active = await restarted.load()
  assert.equal(restarted.status(8004, 8005).phoneUrl, 'http://192.168.1.5:8004/pardner/')
  interfaces = [{ name: 'wifi', address: '192.168.1.6' }]
  assert.equal(restarted.status(8004, 8005).phoneUrl, null)
  assert.equal(restarted.status(8004, 8005).restartRequired, true)
  const moved = new LanAccess(directory, options)
  assert.equal((await moved.load()).address, '192.168.1.6')
  interfaces = []
  const missing = new LanAccess(directory, options)
  assert.equal(await missing.load(), null)
  assert.match(missing.status(8004, 8005).diagnostic, /unavailable/)
  await missing.configure({ enabled: false })
  assert.equal(await new LanAccess(directory, options).load(), null)
}))

it('rejects ambiguous selection and preserves saved settings after a failed write', () => fixture(async directory => {
  const interfaces = () => [{ name: 'wifi', address: '192.168.1.5' }, { name: 'ethernet', address: '192.168.1.6' }]
  const access = new LanAccess(directory, { interfaces })
  await access.load()
  await assert.rejects(access.configure({ enabled: true }), /Choose an interface/)
  await access.configure({ enabled: true, interfaceName: 'wifi' })
  const bytes = await readFile(access.path, 'utf8')
  access.write = async () => { throw new Error('disk full') }
  await assert.rejects(access.configure({ enabled: false }), /disk full/)
  assert.equal(access.saved.enabled, true)
  assert.equal(await readFile(access.path, 'utf8'), bytes)
  await writeFile(access.path, '{invalid')
  await assert.rejects(new LanAccess(directory).load(), SyntaxError)
}))

it('pairing is single use, expires, resets on restart, and throttles service-wide attempts', () => fixture(async directory => {
  let now = 100000
  const access = new LanAccess(directory, { now: () => now, interfaces: () => [{ name: 'wifi', address: '192.168.1.5' }] })
  await access.load()
  assert.throws(() => access.createPairing(8004, 8005), /Enable LAN/)
  await access.configure({ enabled: true })
  access.active = { name: 'wifi', address: '192.168.1.5' }
  let { code } = access.createPairing(8004, 8005)
  assert.match(code, /^\d{8}$/)
  access.redeem(code)
  assert.throws(() => access.redeem(code), { code: 'PAIRING_INVALID' })
  code = access.createPairing(8004, 8005).code
  now += 600001
  assert.throws(() => access.redeem(code), { code: 'PAIRING_INVALID' })
  for (let i = 0; i < 9; i++) assert.throws(() => access.redeem('wrong'), { code: 'PAIRING_INVALID' })
  code = access.createPairing(8004, 8005).code
  assert.throws(() => access.redeem(code), { code: 'PAIRING_THROTTLED' })
  now += 60001
  access.redeem(code)
  assert.equal(new LanAccess(directory).pairing, null)
}))

it('only actual loopback host and origin requests can manage phone access', () => {
  const request = { socket: { localAddress: '127.0.0.1', remoteAddress: '::ffff:127.0.0.1' }, hostname: 'localhost', headers: {} }
  assert.equal(canManageAccess(request), true)
  for (const host of ['127.evil.example', 'public.example', '192.168.1.5']) {
    assert.equal(canManageAccess({ ...request, hostname: host }), false)
    assert.equal(canManageAccess({ ...request, headers: { origin: `http://${host}` } }), false)
  }
  assert.equal(canManageAccess({ ...request, socket: { ...request.socket, localAddress: '192.168.1.5' } }), false)
  assert.deepEqual(lanInterfaces({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    wifi: [{ family: 'IPv6', internal: false, address: '::1' }, { family: 'IPv4', internal: false, address: '192.168.1.5' }],
    link: [{ family: 'IPv4', internal: false, address: '169.254.2.3' }] }), [{ name: 'wifi', address: '192.168.1.5' }])
})
