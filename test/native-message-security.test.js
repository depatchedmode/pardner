import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { cbor } from '@automerge/automerge-repo'
import { WebSocket } from 'ws'
import { nativeMessage } from '../lib/native-network.js'
import { machineKeyFromPem } from '../lib/machine-key.js'
import { handshakeSocket } from '../support/machines.js'

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
    import { admitMembers } from './support/machines.js'
    import { machineKeyPem } from './lib/machine-key.js'
    await withWorkspaceServer(async ({ server }) => {
      const project = await admitMembers(server.store)
      process.send({ httpPort: server.httpPort, wsPort: server.wsPort,
        member: { key: machineKeyPem(project.keys[0]), projectId: project.projectId, records: project.all } })
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
    const api = async (path, body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      assert.equal(response.status, 200, stderr)
      return response.json()
    }
    // A member machine past the handshake still has every malformed frame refused.
    const connect = () => handshakeSocket(`ws://127.0.0.1:${server.wsPort}/automerge`,
      { key: machineKeyFromPem(server.member.key), projectId: server.member.projectId, records: server.member.records })
    const healthy = await connect()
    try {
      const greeting = once(healthy, 'protected-frame')
      healthy.sendSync(cbor.encode({ type: 'join', senderId: healthy.peerIdFor('healthy-peer'), supportedProtocolVersions: ['1'] }))
      assert.equal(cbor.decode((await greeting)[0].payload).type, 'peer')
      for (const value of malformed) {
        const ws = await connect()
        try {
          const closed = once(ws, 'close', { signal: AbortSignal.timeout(5000) })
          const candidate = value?.senderId === join.senderId ? { ...value, senderId: ws.peerIdFor(join.senderId) } : value
          ws.sendSync(cbor.encode(candidate))
          ws.sendSync(cbor.encode({ ...join, senderId: ws.peerIdFor(join.senderId), supportedProtocolVersions: ['1'] }))
          assert.equal((await closed)[0], 1006, `payload: ${JSON.stringify(value)}`)
          assert.equal(child.exitCode, null, stderr)
          assert.equal(healthy.readyState, WebSocket.OPEN)
          const pong = once(healthy, 'pong', { signal: AbortSignal.timeout(5000) })
          healthy.ping()
          await pong
        } finally { ws.terminate() }
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

it('accepts every repository message shape supported by the pinned protocol', () => {
  const messages = [
    ...['sync', 'request'].map(type => ({ ...envelope, type, data: new Uint8Array([1]) })),
    { ...envelope, type: 'doc-unavailable' },
    { ...envelope, type: 'ephemeral', data: new Uint8Array(), count: 1, sessionId: 'session' },
    { ...envelope, type: 'remote-subscription-change', add: ['storage'], remove: [] },
    { ...envelope, type: 'remote-heads-changed', newHeads: { storage: { heads: ['hash'], timestamp: 1 } } },
  ]
  for (const message of messages) assert.deepEqual(nativeMessage(cbor.encode(message)), cbor.decode(cbor.encode(message)))
})

it('rejects malformed envelopes at the shared native decoder', () => {
  for (const bytes of [...malformed.map(value => cbor.encode(value)), Buffer.from([0xff])]) {
    assert.throws(() => nativeMessage(bytes))
  }
})
