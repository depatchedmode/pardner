import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { connect } from 'node:net'
import { startClient } from '../lib/client-service.js'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('client stop closes a WebSocket whose upstream ticket was still pending', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-stop-'))
  const client = await startClient({ directory, port: 0 })
  const entered = deferred(), release = deferred()
  let socket, stop
  try {
    const api = async (path, body) => {
      const response = await fetch(`${client.url}/pardner/client/v1${path}`, { method: 'POST',
        headers: { Authorization: `Bearer ${client.registry.read().operatorToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.status, 200)
      return response.json()
    }
    await api('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    const { project } = await api('/projects', { name: 'Shutdown', operationId: 'create' })
    const runtime = await client.runtime(client.project(project.id))
    const { ticket } = await api(`/projects/${project.id}/api/automerge/ws-ticket`, { purpose: 'ui' })
    const request = runtime.request.bind(runtime)
    runtime.request = async (...args) => {
      const result = await request(...args)
      if (args[0] === '/automerge/ws-ticket') { entered.resolve(); await release.promise }
      return result
    }
    socket = new WebSocket(`${client.url.replace('http:', 'ws:')}${project.wsPath}?ticket=${ticket}`,
      { headers: { Authorization: `Bearer ${client.registry.read().operatorToken}` }, handshakeTimeout: 3000 })
    socket.on('error', () => {})
    await entered.promise
    stop = client.stop()
    release.resolve()
    let timer
    try {
      await Promise.race([stop, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Client shutdown retained an in-flight upgrade')), 2000) })])
    } finally { clearTimeout(timer) }
    assert.equal(runtime.dead, true)
    assert.equal(client.server.listening, false)
  } finally {
    release.resolve()
    socket?.terminate()
    for (const peer of client.sockets) peer.terminate()
    await (stop ?? client.stop())
    await rm(directory, { recursive: true, force: true })
  }
})

test('client stop closes a rejected upgrade even when its peer keeps the connection open', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-stop-rejected-'))
  const client = await startClient({ directory, port: 0 })
  let peer, stop
  client.server.once('connection', socket => { peer = socket })
  const socket = connect({ host: '127.0.0.1', port: new URL(client.url).port, allowHalfOpen: true })
  socket.on('error', () => {})
  try {
    socket.write(`GET /not-a-project HTTP/1.1\r\nHost: ${new URL(client.url).host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`)
    const response = await new Promise(resolve => socket.once('data', data => resolve(data.toString())))
    assert.match(response, /401 Unauthorized/)
    stop = client.stop()
    let timer
    try {
      await Promise.race([stop, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Rejected upgrade prevented shutdown')), 1000) })])
    } finally { clearTimeout(timer) }
    assert.equal(peer.destroyed, true)
  } finally {
    socket.destroy(); peer?.destroy()
    await (stop ?? client.stop())
    await rm(directory, { recursive: true, force: true })
  }
})

test('an accepted TCP connection cannot complete an upgrade after shutdown starts', { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-stop-arriving-'))
  const client = await startClient({ directory, port: 0 })
  const connected = deferred()
  let peer, stop
  client.server.once('connection', socket => { peer = socket; connected.resolve() })
  const socket = connect({ host: '127.0.0.1', port: new URL(client.url).port, allowHalfOpen: true })
  socket.on('error', () => {})
  socket.resume()
  try {
    socket.write(`GET /not-a-project HTTP/1.1\r\nHost: ${new URL(client.url).host}\r\nConnection: Upgrade\r\n`)
    await connected.promise
    stop = client.stop()
    socket.write('Upgrade: websocket\r\n\r\n')
    let timer
    try {
      await Promise.race([stop, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Late upgrade prevented shutdown')), 1000) })])
    } finally { clearTimeout(timer) }
    assert.equal(peer.destroyed, true)
  } finally {
    socket.destroy(); peer?.destroy()
    await (stop ?? client.stop())
    await rm(directory, { recursive: true, force: true })
  }
})

test('shutdown drains an admitted HTTP request and closes its keep-alive connection', { timeout: 15000 }, async () => {
  const { request, Agent } = await import('node:http')
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-stop-http-'))
  const client = await startClient({ directory, port: 0 })
  const entered = deferred(), release = deferred()
  const agent = new Agent({ keepAlive: true })
  let stop
  try {
    const api = async (path, body) => {
      const response = await fetch(`${client.url}/pardner/client/v1${path}`, { method: 'POST',
        headers: { Authorization: `Bearer ${client.registry.read().operatorToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.status, 200); return response.json()
    }
    await api('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    const { project } = await api('/projects', { name: 'HTTP drain', operationId: 'create' })
    const runtime = await client.runtime(client.project(project.id))
    const original = runtime.request.bind(runtime)
    runtime.request = async (...args) => {
      const result = await original(...args)
      if (args[0] === '/automerge/doc') { entered.resolve(); await release.promise }
      return result
    }
    const response = new Promise((resolve, reject) => {
      const req = request(`${client.url}${project.apiBase}/automerge/doc`, { agent,
        headers: { Authorization: `Bearer ${client.registry.read().operatorToken}` } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }))
      })
      req.on('error', reject); req.end()
    })
    await entered.promise
    stop = client.stop()
    release.resolve()
    const received = await response
    assert.equal(received.status, 200)
    assert.equal(received.body.doc.workspaceId, project.id)
    let timer
    try {
      await Promise.race([stop, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Completed HTTP request retained its connection during shutdown')), 2000) })])
    } finally { clearTimeout(timer) }
    assert.equal(runtime.dead, true)
  } finally {
    release.resolve(); agent.destroy()
    await (stop ?? client.stop())
    await rm(directory, { recursive: true, force: true })
  }
})
