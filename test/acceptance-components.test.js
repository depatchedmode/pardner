import { it } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { cli, startCliService } from '../support/cli-resources.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'
import { ExpectedOperations } from '../support/acceptance/expected-operations.js'

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
  const broken = { tasks: {}, operations: { one: { ...request, replicaId: 'replica' } }, comments: {} }
  assert.throws(() => expected.verify(broken), /must appear exactly once/)
})

it('an explicit acknowledgment budget changes only the latency gate, preserving receipt and effect checks', () => {
  const request = { operationId: 'budget', actorId: 'alice', type: 'comment.add', payload: { taskId: 'task', text: 'Required effect' } }
  const receipt = { savedLocally: true, replicaId: 'replica', result: {} }
  const strict = new ExpectedOperations()
  assert.throws(() => strict.acknowledge(request, receipt, 2001), /budget 2000ms/)
  assert.equal(strict.receipts.size, 0)
  const relaxed = new ExpectedOperations({ localAckMs: 10000 })
  relaxed.intend(request, 'replica')
  assert.throws(() => relaxed.acknowledge(request, { ...receipt, savedLocally: false }, 4802))
  assert.throws(() => relaxed.acknowledge(request, { ...receipt, replicaId: 'other' }, 4802), /wrong replica/)
  relaxed.acknowledge(request, receipt, 4802)
  assert.equal(relaxed.receipts.get('budget').elapsedMs, 4802)
  assert.throws(() => relaxed.verify({ tasks: {}, operations: { budget: { ...request, replicaId: 'replica' } }, comments: {} }), /must appear exactly once/)
  assert.throws(() => relaxed.acknowledge(request, receipt, 10001), /budget 10000ms/)
})

it('acknowledgment budgets must remain finite positive integer bounds', () => {
  for (const localAckMs of [0, -1, 1.5, NaN, Infinity, '10000']) {
    assert.throws(() => new ExpectedOperations({ localAckMs }), /positive integer/)
  }
})
