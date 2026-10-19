import { mintReplicaTicket } from '../support/resources.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { Repo } from '@automerge/automerge-repo'
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { SCHEMA_VERSION, taskView } from '../lib/workspace-schema.js'

it('a native Automerge Repo peer resolves the production schema over the CBOR WebSocket endpoint', { timeout: 10000 }, async () => {
  await withWorkspaceServer(async ({ server, api, create }) => {
    const taskId = await create({ title: 'Native wire contract' })
    const ticket = await mintReplicaTicket(server)
    const { url } = await api('/automerge/url')
    const adapter = new WebSocketClientAdapter(`ws://127.0.0.1:${server.wsPort}/automerge?ticket=${ticket}`, 60000)
    const repo = new Repo({ network: [adapter] })
    try {
      const handle = await repo.find(url, { signal: AbortSignal.timeout(3000) })
      const doc = handle.doc()
      assert.equal(doc.schemaVersion, SCHEMA_VERSION)
      assert.equal(taskView(doc, taskId).title, 'Native wire contract')
      assert.equal(doc.actors.builder.kind, 'agent')
    } finally {
      adapter.socket?.terminate()
      await repo.shutdown()
    }
  })
})

it('mention keys survive operation replay and distinguish separate comments with identical text', async () => {
  await withWorkspaceServer(async ({ create, operation, context }) => {
    const taskId = await create()
    const payload = { taskId, text: '@builder please review' }
    const first = await operation('comment.add', payload, 'alice', 'mention-first')
    const replay = await operation('comment.add', payload, 'alice', 'mention-first')
    const second = await operation('comment.add', payload, 'alice', 'mention-second')
    assert.equal(replay.replayed, true)
    assert.equal(replay.result.commentId, first.result.commentId)
    assert.notEqual(second.result.commentId, first.result.commentId)
    const { mentions } = await context(taskId)
    assert.equal(mentions.length, 2)
    assert.equal(new Set(mentions.map(mention => mention.idempotency_key)).size, 2)
    for (const mention of mentions) {
      assert.equal(mention.toActorId, 'builder')
      assert.match(mention.idempotency_key, /^[a-f0-9]{64}$/)
    }
  })
})

it('field effects and attributed history become visible in one Automerge change', async () => {
  await withWorkspaceServer(async ({ server, create, update, context }) => {
    const taskId = await create({ status: 'backlog' })
    const observations = []
    const observe = () => {
      const doc = server.store.docHandle.doc()
      observations.push({ status: taskView(doc, taskId).status,
        events: Object.values(doc.operations).filter(event => event.taskId === taskId && event.type === 'task.update') })
    }
    server.store.docHandle.on('change', observe)
    let receipt
    try { receipt = await update(taskId, { status: 'in-progress' }, 'builder') }
    finally { server.store.docHandle.off('change', observe) }
    assert.equal(receipt.savedLocally, true)
    assert.equal(observations.length, 1)
    assert.equal(observations[0].status, 'in-progress')
    assert.equal(observations[0].events.length, 1)
    assert.equal(observations[0].events[0].operationId, receipt.operationId)
    assert.equal(observations[0].events[0].actorId, 'builder')
    assert.equal((await context(taskId)).history.length, 2)
  })
})
