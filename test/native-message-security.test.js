import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { cbor } from '@automerge/automerge-repo'
import { WebSocket } from 'ws'
import { ValidatedWebSocketServerAdapter } from '../lib/validated-websocket-server-adapter.js'

const join = { type: 'join', senderId: 'test-peer' }
const envelope = { senderId: 'test-peer', targetId: 'server', documentId: 'valid-document' }
const malformed = [
  null, false, 42, 'hello', [], [join], {}, new Uint8Array([1]),
  ...[null, 1, '1', {}, [1], [null]].map(supportedProtocolVersions => ({ ...join, supportedProtocolVersions })),
  ...[undefined, null, 1, [], {}, '', '__proto__', 'constructor'].map(senderId => ({ ...join, senderId })),
  { ...join, peerMetadata: { isEphemeral: 'yes' } },
  ...['sync', 'request'].flatMap(type => [undefined, null, 'data', [], {}, new Uint8Array()].map(data => ({ ...envelope, type, data }))),
  { ...envelope, type: 'doc-unavailable', documentId: [] },
  { ...envelope, type: 'ephemeral', data: new Uint8Array([1]), count: '1', sessionId: 's' },
  { ...envelope, type: 'remote-subscription-change', add: 'storage' },
  { ...envelope, type: 'remote-subscription-change', remove: [null] },
  ...[null, [], { storage: null }, { storage: { heads: 'hash', timestamp: 1 } }].map(newHeads => ({ ...envelope, type: 'remote-heads-changed', newHeads })),
  { ...envelope, type: 'unknown' },
]

it('malformed native CBOR closes only the offending socket and leaves the service alive', { timeout: 120000 }, async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { withWorkspaceServer } from './support/workspace-test.js'
    await withWorkspaceServer(async ({ server }) => {
      process.send({ httpPort: server.httpPort, wsPort: server.wsPort })
      await new Promise(resolve => process.once('message', resolve))
    })
    process.disconnect()
  `], { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let stderr = ''
  child.stderr.on('data', data => { stderr += data })
  child.stdout.resume()
  const exited = once(child, 'exit')
  try {
    const [server] = await once(child, 'message', { signal: AbortSignal.timeout(30000) })
    const api = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      assert.equal(response.status, 200, stderr)
      return response.json()
    }
    const connect = async auth => {
      const { ticket } = auth === 'ticket' ? await api('/automerge/ws-ticket', {}) : {}
      const ws = new WebSocket(`ws://127.0.0.1:${server.wsPort}/automerge${ticket ? `?ticket=${ticket}` : ''}`, {
        ...(auth === 'token' ? { headers: { Authorization: 'Bearer test-token' } } : {}),
      })
      await once(ws, 'open', { signal: AbortSignal.timeout(5000) })
      return ws
    }
    const healthy = await connect('token')
    try {
      const greeting = once(healthy, 'message')
      healthy.send(cbor.encode({ type: 'join', senderId: 'healthy-peer' }))
      assert.equal(cbor.decode((await greeting)[0]).type, 'peer')
      for (const auth of ['token', 'ticket']) {
        for (const value of malformed) {
          const ws = await connect(auth)
          try {
            const closed = once(ws, 'close', { signal: AbortSignal.timeout(5000) })
            ws.send(cbor.encode(value))
            ws.send(cbor.encode(join))
            assert.equal((await closed)[0], 1008, `payload: ${JSON.stringify(value)}`)
            assert.equal(child.exitCode, null, stderr)
            assert.equal(healthy.readyState, WebSocket.OPEN)
            const pong = once(healthy, 'pong', { signal: AbortSignal.timeout(5000) })
            healthy.ping()
            await pong
          } finally { ws.terminate() }
        }
      }
      assert.ok((await api('/automerge/doc')).doc)
    } finally { healthy.terminate() }
    child.send('stop')
    assert.deepEqual(await exited, [0, null], stderr)
  } finally {
    if (child.exitCode === null) child.kill()
    await exited
  }
})

it('contains synchronous dispatch errors and ignores frames queued after rejection', () => {
  const adapter = new ValidatedWebSocketServerAdapter(new EventEmitter())
  adapter.peerId = 'server'
  let candidates = 0
  adapter.on('peer-candidate', () => { candidates++; throw new Error('dispatch failure') })
  const socket = { readyState: 1, close(code) { this.code = code; this.readyState = 2 } }
  assert.doesNotThrow(() => adapter.receiveMessage(cbor.encode(join), socket))
  assert.equal(socket.code, 1008)
  adapter.receiveMessage(cbor.encode(join), socket)
  assert.equal(candidates, 1)
})

it('accepts every repository message shape supported by the pinned protocol', () => {
  const adapter = new ValidatedWebSocketServerAdapter(new EventEmitter())
  adapter.peerId = 'server'
  const delivered = []
  adapter.on('message', message => delivered.push(message))
  const socket = { readyState: 1, close() { assert.fail('Valid message rejected') } }
  const messages = [
    ...['sync', 'request'].map(type => ({ ...envelope, type, data: new Uint8Array([1]) })),
    { ...envelope, type: 'doc-unavailable' },
    { ...envelope, type: 'ephemeral', data: new Uint8Array(), count: 1, sessionId: 'session' },
    { ...envelope, type: 'remote-subscription-change', add: ['storage'], remove: [] },
    { ...envelope, type: 'remote-heads-changed', newHeads: { storage: { heads: ['hash'], timestamp: 1 } } },
  ]
  for (const message of messages) adapter.receiveMessage(cbor.encode(message), socket)
  assert.deepEqual(delivered, messages.map(message => cbor.decode(cbor.encode(message))))
})

it('rejects malformed envelopes before emitting any Repo events', () => {
  const adapter = new ValidatedWebSocketServerAdapter(new EventEmitter())
  adapter.peerId = 'server'
  const events = []
  for (const event of ['peer-candidate', 'peer-disconnected', 'message']) {
    adapter.on(event, () => events.push(event))
  }
  for (const bytes of [...malformed.map(value => cbor.encode(value)), Buffer.from([0xff])]) {
    const socket = { readyState: 1, close(code) { this.code = code; this.readyState = 2 } }
    adapter.receiveMessage(bytes, socket)
    assert.equal(socket.code, 1008)
    assert.deepEqual(events, [])
  }
})
