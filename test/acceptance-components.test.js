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
import AutomergeSyncServer from '../automerge-sync-server.js'
import { requestJson } from '../lib/sync-client.js'
import { admitMembers, advertiseRoutes, hubRuntime, replicaRuntime } from '../support/machines.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'
import { ExpectedOperations, hash } from '../support/acceptance/expected-operations.js'

it('blocks hub HTTP and native sockets while the member replica remains writable, and recovers a lost acknowledgement', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-gate-'))
  const token = 'gate-test-token', actors = [{ id: 'alice', handle: 'alice', kind: 'human' }]
  const service = store => new AutomergeSyncServer({ store, env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {} })
  const hub = service(hubRuntime(join(root, 'hub'), { actors }))
  let gate, replica
  try {
    await hub.start()
    const project = await admitMembers(hub.store)
    gate = await new NetworkGate({ httpUrl: `http://127.0.0.1:${hub.httpPort}`, wsUrl: `ws://127.0.0.1:${hub.wsPort}` }).start()
    // The hub serves the member machine at the gate's address, which is the route the replica dials.
    advertiseRoutes(hub, { http: [gate.httpUrl], ws: [gate.wsUrl] })
    replica = service(replicaRuntime(join(root, 'replica'), project, 0, { hubUrl: gate.httpUrl, hubWsUrl: gate.wsUrl, actors, retryMs: 100 }))
    await replica.start()
    const api = (server, path, body) => requestJson(`http://127.0.0.1:${server.httpPort}`, path, { token,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    gate.partition()
    await assert.rejects(fetch(`${gate.httpUrl}/session`, { method: 'POST', signal: AbortSignal.timeout(1000) }))
    const offline = await api(replica, '/automerge/operations', { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Offline task' } })
    assert.equal(offline.savedLocally, true)
    assert.equal(offline.syncPending, true)
    gate.loseResponse('/automerge/sync-ack')
    gate.partition(false)
    const deadline = Date.now() + 10000
    while (replica.store.status().syncPending) { assert.ok(Date.now() < deadline, 'Convergence exceeded ten seconds'); await new Promise(resolve => setTimeout(resolve, 25)) }
    assert.ok(gate.events.some(event => event.type === 'response-lost'))
    assert.equal(hub.store.workspace.taskContext(offline.result.taskId).task.title, 'Offline task')
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

const A_MACHINE = 'machine-aaaaaaaaaaaaaaaaaaaaaaaaaa', B_MACHINE = 'machine-bbbbbbbbbbbbbbbbbbbbbbbbbb'
const GENESIS = { recordId: 'record-genesis', kind: 'project.genesis', subject: 'person-alice', signer: A_MACHINE }

/**
 * A replica's snapshot with one acknowledged and one baseline operation, each the entry of one change signed as
 * `changes` says, the membership records `records`, and `extra` entries; `summary` overrides the counts.
 */
function attributedSnapshot({ expected, here, changes = {}, records = [GENESIS], extra = [], review = [], summary = {}, payload = null }) {
  const machines = { [A_MACHINE]: { personId: 'person-alice', ...(here === 'a' ? { thisMachine: true } : {}) },
    [B_MACHINE]: { personId: 'person-bob', ...(here === 'b' ? { thisMachine: true } : {}) } }
  const operations = Object.fromEntries([...expected.intents.values()].map(intent => {
    const operationId = `op-${hash([intent.operationId, hash({ type: intent.type, actorId: intent.actorId, payload: intent.payload })])}`
    return [operationId, { ...intent, payload: payload ?? intent.payload, operationId, requestId: intent.operationId, replicaId: 'replica-a', timestamp: '2026-01-01T00:00:01.000Z' }]
  }))
  operations['op-baseline'] = { operationId: 'op-baseline', actorId: 'alice', type: 'actor.register', replicaId: 'replica-a', timestamp: '2026-01-01T00:00:00.000Z' }
  const changeOf = (id, event) => ({ hash: `change-${id}`, state: 'signed', machineId: A_MACHINE, replicaId: event.replicaId, timestamp: event.timestamp, ...changes[id] })
  const activity = [
    ...Object.entries(operations).map(([id, event]) => ({ id: `change-${id}`, kind: 'operation', key: id, event, timestamp: event.timestamp, changes: [changeOf(id, event)], flags: {}, review: false })),
    ...records.map(record => ({ id: `change-${record.recordId}:${record.recordId}`, kind: 'record', key: record.recordId, record, timestamp: '2026-01-01T00:00:00.000Z',
      changes: [{ hash: `change-${record.recordId}`, state: 'signed', machineId: A_MACHINE, timestamp: '2026-01-01T00:00:00.000Z', ...(here === 'b' ? { relayedBy: B_MACHINE } : {}) }], flags: {}, review: false })),
    ...extra,
  ]
  const hashes = new Set(activity.flatMap(entry => entry.changes.map(change => change.hash)))
  return { operations, activity, attribution: { machineId: here === 'a' ? A_MACHINE : B_MACHINE, machines, review,
    summary: { changes: hashes.size, checking: 0, notDerived: 0, ...summary } } }
}

it('the acceptance gate compares, by change hash, what each change wrote and who signed it on every replica, and checks every operation and record the harness expects', () => {
  const expected = new ExpectedOperations()
  const request = { operationId: 'one', actorId: 'alice', type: 'comment.add', payload: { taskId: 'task', text: 'Signed by Alice’s desktop' } }
  expected.intend(request, 'replica-a')
  expected.acknowledge(request, { savedLocally: true, replicaId: 'replica-a', result: {} }, 100)
  expected.ignore(['op-baseline'])
  expected.expectRecords('create', [{ kind: 'project.genesis', subject: 'person-alice', signer: A_MACHINE }])
  const operationId = `op-${hash([request.operationId, hash({ type: request.type, actorId: request.actorId, payload: request.payload })])}`
  const known = { machineOfReplica: { 'replica-a': A_MACHINE }, personOfActor: { alice: 'person-alice' },
    baseline: { machineId: A_MACHINE, actorId: 'alice' }, resolve: ({ action, ...fields }) => ({ action, fields }) }
  // Replica-specific labels (this computer, who relayed a verdict) are normalised away.
  const a = attributedSnapshot({ expected, here: 'a' })
  const b = attributedSnapshot({ expected, here: 'b', changes: { [operationId]: { via: B_MACHINE } } })
  assert.ok(expected.attributed(a) && expected.attributed(b))
  assert.equal(canonicalView(expected, a), canonicalView(expected, b))
  const result = expected.verifyAttribution([a, b], known)
  assert.deepEqual([result.changes, result.operations, result.records], [3, 2, 1])
  // Two replicas that disagree on the signing machine fail, even though each shows "signed".
  const other = attributedSnapshot({ expected, here: 'b', changes: { [operationId]: { machineId: B_MACHINE } } })
  assert.ok(expected.attributed(other))
  assert.throws(() => expected.verifyAttribution([a, other], known), /attribution differs between replicas/)
  // Two replicas that agree on the signer but show different signed content fail too.
  const content = attributedSnapshot({ expected, here: 'b', payload: { taskId: 'task', text: 'Other words' } })
  assert.throws(() => expected.verifyAttribution([a, content], known), /attribution differs between replicas/)
  // A signer that is not the machine the harness knows performed the operation fails, on every replica alike.
  assert.throws(() => expected.verifyAttribution([other, other], known), /signed by machine-b.* but performed on machine-a/)
  // Content that is not what the harness intended fails, on every replica alike.
  assert.throws(() => expected.verifyAttribution([content, content], known), /signed payload is not what was intended/)
  // A signer with no machine ID is not attribution.
  assert.equal(expected.attributed(attributedSnapshot({ expected, here: 'a', changes: { [operationId]: { machineId: undefined } } })), false)
  // Baseline operations are checked too.
  assert.equal(expected.attributed(attributedSnapshot({ expected, here: 'a', changes: { 'op-baseline': { state: 'pending' } } })), false)
  const forged = attributedSnapshot({ expected, here: 'a', changes: { 'op-baseline': { machineId: B_MACHINE } } })
  assert.throws(() => expected.verifyAttribution([forged, forged], known), /op-baseline.*signed by machine-b/)
  // Records: one every replica omits, one signed by another machine, and one never expected each fail.
  const none = attributedSnapshot({ expected, here: 'a', records: [] })
  assert.ok(expected.attributed(none), 'every replica may agree')
  assert.throws(() => expected.verifyAttribution([none, none], known), /Expected record missing \(create\)/)
  const wrongSigner = attributedSnapshot({ expected, here: 'a', records: [{ ...GENESIS, signer: B_MACHINE }] })
  assert.throws(() => expected.verifyAttribution([wrongSigner, wrongSigner], known), /Expected record missing/)
  const surplus = attributedSnapshot({ expected, here: 'a', records: [GENESIS, { recordId: 'record-extra', kind: 'profile', subject: 'person-alice', signer: A_MACHINE }] })
  assert.throws(() => expected.verifyAttribution([surplus, surplus], known), /Membership records the harness never expected/)
  // A second entry for an acknowledged operation (another change wrote its key) fails, and is not clean attribution.
  const copy = { id: 'change-copy', kind: 'operation', key: operationId, event: { ...a.operations[operationId], replicaId: 'replica-b' }, timestamp: '2026-01-01T00:00:02.000Z',
    changes: [{ hash: 'change-copy', state: 'signed', machineId: A_MACHINE, replicaId: 'replica-b', timestamp: '2026-01-01T00:00:02.000Z' }], flags: { sameKey: ['change-x'] }, review: true }
  const doubled = attributedSnapshot({ expected, here: 'a', extra: [copy] })
  assert.equal(expected.attributed(doubled), false)
  assert.throws(() => expected.verifyAttribution([doubled, doubled], known), /shown in 2 entries/)
  // Anything left to review, a change not yet derived, or a change missing from Activity is not a clean attribution.
  assert.equal(expected.attributed(attributedSnapshot({ expected, here: 'a', review: [{ change: 'other' }] })), false)
  assert.equal(expected.attributed(attributedSnapshot({ expected, here: 'a', summary: { notDerived: 1 } })), false)
  assert.equal(expected.attributed(attributedSnapshot({ expected, here: 'a', summary: { changes: 4 } })), false)
})

const canonicalView = (expected, snapshot) => JSON.stringify(expected.stableAttribution(snapshot))
