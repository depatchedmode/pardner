import { it } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { cli, startCliService } from '../support/cli-resources.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'
import { ExpectedOperations, hash } from '../support/acceptance/expected-operations.js'

it('blocks hub HTTP and native sockets while the public local service remains writable', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-gate-'))
  const hubDirectory = join(root, 'hub'), replicaDirectory = join(root, 'replica')
  const hub = await startCliService(hubDirectory)
  let gate, replica
  try {
    await cli(hubDirectory, ['actors', 'register', 'alice', '--actor', 'alice', '--handle', 'alice', '--kind', 'human'])
    const { token } = JSON.parse(await readFile(join(hubDirectory, 'connection.json'), 'utf8'))
    gate = await new NetworkGate(hub).start()
    replica = await startCliService(replicaDirectory, ['--role', 'replica', '--hub', gate.httpUrl, '--hub-ws', gate.wsUrl, '--hub-token', token])
    gate.partition()
    await assert.rejects(fetch(`${gate.httpUrl}/automerge/url`, { signal: AbortSignal.timeout(1000) }))
    const offline = await cli(replicaDirectory, ['task', 'create', '--actor', 'alice', '--title', 'Offline task'])
    assert.equal(offline.result.savedLocally, true)
    assert.equal(offline.result.syncPending, true)
    gate.loseResponse('/automerge/sync-ack')
    gate.partition(false)
    const deadline = Date.now() + 10000
    while ((await cli(replicaDirectory, ['status'])).result.syncPending) assert.ok(Date.now() < deadline, 'Convergence exceeded ten seconds')
    assert.ok(gate.events.some(event => event.type === 'response-lost'))
    const snapshot = await cli(hubDirectory, ['show', offline.result.result.taskId])
    assert.equal(snapshot.result.task.title, 'Offline task')
  } finally {
    await replica?.stop()
    await gate?.close()
    await hub.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('a client-mode gate relays upgrades on its HTTP origin as the target host and loses only body-matched responses', { timeout: 20000 }, async () => {
  const seen = []
  const target = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => { seen.push({ host: req.headers.host, body }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })) })
  })
  const sockets = new WebSocketServer({ server: target })
  sockets.on('connection', (socket, req) => socket.send(`host ${req.headers.host}`))
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  const targetUrl = `http://127.0.0.1:${target.address().port}`
  const gate = await new NetworkGate({ httpUrl: 'http://127.0.0.1:9' }).start()
  gate.retarget({ httpUrl: targetUrl })
  try {
    const socket = new WebSocket(`${gate.httpUrl.replace('http', 'ws')}/replica/p/native`)
    const [greeting] = await once(socket, 'message')
    assert.equal(greeting.toString(), `host ${new URL(targetUrl).host}`)
    gate.loseResponse('/delivery', 1, body => body?.action === 'ack')
    const post = action => fetch(`${gate.httpUrl}/replica/p/delivery`, { method: 'POST', body: JSON.stringify({ action }), signal: AbortSignal.timeout(2000) })
    assert.equal((await post('claim')).status, 200)
    await assert.rejects(post('ack'))
    assert.equal((await post('ack')).status, 200)
    assert.deepEqual(seen.map(entry => JSON.parse(entry.body).action), ['claim', 'ack', 'ack'], 'the lost response was still delivered to the target')
    assert.deepEqual(gate.events.filter(event => event.type === 'response-lost').map(event => event.path), ['/replica/p/delivery'])
    gate.partition()
    await once(socket, 'close')
    await assert.rejects(post('claim'))
  } finally {
    await gate.close()
    sockets.close()
    await new Promise(resolve => target.close(resolve))
  }
})

it('agent inbox and effect ledger survive kills before acknowledgement and after a saved effect', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-worker-'))
  const serviceDirectory = join(root, 'service'), directory = join(root, 'worker')
  const service = await startCliService(serviceDirectory)
  let worker
  async function start() {
    worker = fork(new URL('../support/acceptance/agent-worker.js', import.meta.url), [JSON.stringify({ directory, serviceDirectory, actorId: 'builder' })], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    const [ready] = await once(worker, 'message')
    assert.equal(ready.ready, true)
  }
  async function stop() {
    if (!worker) return
    const exited = once(worker, 'exit')
    worker.kill('SIGKILL')
    await exited
    worker = null
  }
  async function run(pauseAt) {
    const requestId = randomUUID()
    return new Promise(resolve => {
      const receive = message => {
        if (message.requestId !== requestId) return
        worker.off('message', receive)
        resolve(message)
      }
      worker.on('message', receive)
      worker.send({ requestId, pauseAt })
    })
  }
  try {
    await cli(serviceDirectory, ['actors', 'register', 'alice', '--actor', 'alice', '--handle', 'alice', '--kind', 'human'])
    await cli(serviceDirectory, ['actors', 'register', 'builder', '--actor', 'alice', '--handle', 'builder', '--kind', 'agent'])
    const task = await cli(serviceDirectory, ['task', 'create', '--title', 'Worker recovery', '--actor', 'alice'])
    const taskId = task.result.result.taskId
    await cli(serviceDirectory, ['comment', taskId, '@builder please begin', '--actor', 'alice'])
    await start()
    assert.equal((await run('received')).result.paused, true)
    await stop()
    await start()
    assert.equal((await run('effect-saved')).result.paused, true)
    await stop()
    await start()
    assert.equal((await run()).result.complete, true)
    assert.equal((await run()).result.idle, true)
    await stop()
    const database = new DatabaseSync(join(directory, 'inbox.sqlite'), { readOnly: true })
    assert.equal(database.prepare('SELECT count(*) AS n FROM inbox WHERE complete = 1 AND acknowledged = 1').get().n, 1)
    assert.equal(database.prepare('SELECT count(*) AS n FROM effects').get().n, 1)
    database.close()
    const context = await cli(serviceDirectory, ['show', taskId])
    assert.equal(context.result.comments.filter(comment => comment.actorId === 'builder').length, 1)
  } finally {
    await stop()
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
})

it('the independent manifest rejects missing effects even when replicas agree', () => {
  const expected = new ExpectedOperations()
  const request = { operationId: 'one', actorId: 'alice', type: 'comment.add', payload: { taskId: 'task', text: 'Required effect' } }
  expected.intend(request)
  expected.acknowledge(request, { savedLocally: true, replicaId: 'replica', result: {} }, 100)
  const operationId = `op-${hash([request.operationId, hash({ type: request.type, actorId: request.actorId, payload: request.payload })])}`
  const broken = { tasks: {}, operations: { [operationId]: { ...request, operationId, requestId: 'one', replicaId: 'replica' } }, comments: {} }
  assert.throws(() => expected.verify(broken), /must appear exactly once/)
})
