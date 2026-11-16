import test from 'node:test'
import assert from 'node:assert/strict'
import { isLoopback, isLoopbackRequest } from '../lib/loopback.js'

test('local admin needs a loopback request from a loopback peer, host and origin', () => {
  for (const address of ['127.0.0.1', '127.8.9.10', '::ffff:127.0.0.1', '::1', '[::1]', 'localhost']) assert.equal(isLoopback(address), true, address)
  for (const address of ['', undefined, '192.168.1.5', '127.evil.example', '::ffff:192.168.1.5']) assert.equal(isLoopback(address), false, String(address))
  const request = { socket: { localAddress: '127.0.0.1', remoteAddress: '::ffff:127.0.0.1' }, hostname: 'localhost', headers: {} }
  assert.equal(isLoopbackRequest(request), true)
  assert.equal(isLoopbackRequest({ ...request, headers: { origin: 'http://127.0.0.1:4000' } }), true)
  for (const host of ['127.evil.example', 'public.example', '192.168.1.5']) {
    assert.equal(isLoopbackRequest({ ...request, hostname: host }), false)
    assert.equal(isLoopbackRequest({ ...request, headers: { origin: `http://${host}` } }), false)
  }
  assert.equal(isLoopbackRequest({ ...request, headers: { origin: 'not a url' } }), false)
  assert.equal(isLoopbackRequest({ ...request, socket: { ...request.socket, localAddress: '192.168.1.5' } }), false)
  assert.equal(isLoopbackRequest({ ...request, socket: { ...request.socket, remoteAddress: '192.168.1.9' } }), false)
})
