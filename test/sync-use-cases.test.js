import { replicaOptions } from '../support/replica-credentials.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { NetworkGate } from '../support/acceptance/network-gate.js'

async function eventually(check) {
  const deadline = Date.now() + 10000
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Replicas must converge within ten seconds')
    await delay(25)
  }
}

async function withReplicas(run) {
  await withWorkspaceServer(async fixture => {
    const { server, directory } = fixture
    const gates = []
    const replicas = []
    const reopen = async index => {
      const gate = gates[index]
      const replica = new WorkspaceRuntime({ ...replicaOptions, directory: join(directory, `replica-${index}`), role: 'replica',
        hubUrl: gate.httpUrl, hubWsUrl: gate.wsUrl, token: 'test-token', retryMs: 100 })
      replicas[index] = replica
      await replica.init()
      return replica
    }
    try {
      for (let index = 0; index < 2; index++) {
        gates.push(await new NetworkGate({ httpUrl: `http://127.0.0.1:${server.httpPort}`, wsUrl: `ws://127.0.0.1:${server.wsPort}/automerge` }).start())
        await reopen(index)
      }
      const converge = () => eventually(() => replicas.every(replica => !replica.status().syncPending))
      await converge()
      await run({ ...fixture, gates, replicas, reopen, converge })
    } finally {
      const results = await Promise.allSettled(replicas.map(replica => replica.close()))
      const gateResults = await Promise.allSettled(gates.map(gate => gate.close()))
      for (const result of [...results, ...gateResults]) if (result.status === 'rejected') throw result.reason
    }
  })
}

function edit(replica, taskId, updates, actorId) {
  const { revisions } = replica.workspace.taskContext(taskId)
  return replica.workspace.execute({ operationId: randomUUID(), actorId, type: 'task.update',
    payload: { taskId, updates, expectedRevisions: Object.fromEntries(Object.keys(updates).map(field => [field, revisions[field]])) } })
}

it('retains acknowledged edits when a creation request is replayed on disconnected replicas', { timeout: 30000 }, async () => {
  await withReplicas(async ({ context, gates, replicas, reopen, converge }) => {
    gates.forEach(gate => gate.partition())
    const request = { operationId: 'same-create-request', actorId: 'alice', type: 'task.create', payload: { title: 'Cross-device retry' } }
    const created = await Promise.all(replicas.map(replica => replica.execute(request)))
    const taskId = created[0].result.taskId
    const edits = await Promise.all([
      edit(replicas[0], taskId, { description: 'Acknowledged description' }, 'alice'),
      edit(replicas[1], taskId, { priority: 'p0' }, 'alice'),
    ])
    assert.ok([...created, ...edits].every(receipt => receipt.savedLocally))
    gates.forEach(gate => gate.partition(false))
    await converge()
    await eventually(() => replicas.every(replica => replica.workspace.taskContext(taskId).task.priority === 'p0'
      && replica.workspace.taskContext(taskId).task.description === 'Acknowledged description'))
    await replicas[0].close()
    await reopen(0)
    for (const result of [await context(taskId), ...replicas.map(replica => replica.workspace.taskContext(taskId))]) {
      assert.equal(result.task.description, 'Acknowledged description')
      assert.equal(result.task.priority, 'p0')
      assert.deepEqual(result.conflicts, {})
      assert.equal(result.history.filter(event => event.operationId === request.operationId).length, 1)
      for (const receipt of edits) assert.ok(result.history.some(event => event.operationId === receipt.operationId))
    }
  })
})

it('UC1: two Actors on the same hub retain concurrent disjoint changes and attribution', { timeout: 20000 }, async () => {
  await withWorkspaceServer(async ({ create, context, operation }) => {
    const taskId = await create()
    const { revisions } = await context(taskId)
    const receipts = await Promise.all([
      operation('task.update', { taskId, updates: { assignee: 'builder' }, expectedRevisions: { assignee: revisions.assignee } }, 'alice'),
      operation('task.update', { taskId, updates: { priority: 'p0' }, expectedRevisions: { priority: revisions.priority } }, 'builder'),
    ])
    assert.ok(receipts.every(receipt => receipt.savedLocally))
    const result = await context(taskId)
    assert.equal(result.task.assignee, 'builder')
    assert.equal(result.task.priority, 'p0')
    assert.deepEqual(result.history.filter(event => event.type === 'task.update').map(event => event.actorId).sort(), ['alice', 'builder'])
  })
})

for (const [name, actorIds] of [['UC2: one Actor on two replicas', ['alice', 'alice']], ['UC3: human and agent on two replicas', ['alice', 'builder']]]) {
  it(`${name} merge offline changes with distinct replica provenance`, { timeout: 30000 }, async () => {
    await withReplicas(async ({ create, context, gates, replicas, converge }) => {
      const taskId = await create()
      await eventually(() => replicas.every(replica => replica.workspace.handle.doc().tasks[taskId]))
      gates.forEach(gate => gate.partition())
      const receipts = await Promise.all([
        edit(replicas[0], taskId, { description: 'From first replica' }, actorIds[0]),
        edit(replicas[1], taskId, { priority: 'p0' }, actorIds[1]),
      ])
      assert.ok(receipts.every(receipt => receipt.savedLocally))
      assert.notEqual(receipts[0].replicaId, receipts[1].replicaId)
      gates.forEach(gate => gate.partition(false))
      await converge()
      for (const result of [await context(taskId), ...replicas.map(replica => replica.workspace.taskContext(taskId))]) {
        assert.equal(result.task.description, 'From first replica')
        assert.equal(result.task.priority, 'p0')
        for (let index = 0; index < receipts.length; index++) {
          const event = result.history.find(event => event.operationId === receipts[index].operationId)
          assert.equal(event.actorId, actorIds[index])
          assert.equal(event.replicaId, receipts[index].replicaId)
        }
      }
    })
  })
}

it('UC4: a persisted replica reopens offline and merges with work completed at the hub', { timeout: 30000 }, async () => {
  await withReplicas(async ({ create, update, context, gates, replicas, reopen, converge }) => {
    const taskId = await create()
    await eventually(() => replicas.every(replica => replica.workspace.handle.doc().tasks[taskId]))
    gates[0].partition()
    const receipt = await edit(replicas[0], taskId, { description: 'Durable offline edit' }, 'builder')
    assert.equal(receipt.savedLocally, true)
    const identity = replicas[0].manifest.replicaId
    await update(taskId, { status: 'review' })
    assert.notEqual((await context(taskId)).task.description, 'Durable offline edit')
    await replicas[0].close()
    const started = Date.now()
    const reopened = await reopen(0)
    assert.ok(Date.now() - started < 5000)
    assert.equal(reopened.manifest.replicaId, identity)
    assert.equal(reopened.workspace.taskContext(taskId).task.description, 'Durable offline edit')
    gates[0].partition(false)
    await converge()
    for (const result of [await context(taskId), ...replicas.map(replica => replica.workspace.taskContext(taskId))]) {
      assert.equal(result.task.description, 'Durable offline edit')
      assert.equal(result.task.status, 'review')
      assert.equal(result.history.filter(event => event.operationId === receipt.operationId).length, 1)
    }
  })
})
