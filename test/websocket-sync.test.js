import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'
import { withWorkspaceServer } from '../support/workspace-test.js'

async function withSubscribers(count, run) {
  await withWorkspaceServer(async fixture => {
    const clients = []
    try {
      for (let index = 0; index < count; index++) {
        const { ticket } = await fixture.api('/automerge/ws-ticket', {})
        const ws = new WebSocket(`ws://127.0.0.1:${fixture.server.wsPort}/?ticket=${ticket}`, {
          origin: `http://localhost:${fixture.server.httpPort}`,
        })
        const messages = []
        ws.on('message', data => messages.push(JSON.parse(data.toString())))
        const client = { ws, messages, async next(type) {
          const deadline = Date.now() + 3000
          while (true) {
            const index = messages.findIndex(message => message.type === type)
            if (index >= 0) return messages.splice(index, 1)[0]
            assert.ok(Date.now() < deadline, `Missing ${type} message`)
            await delay(10)
          }
        } }
        clients.push(client)
        await once(ws, 'open')
        client.initial = await client.next('document-state')
      }
      await run({ ...fixture, clients })
    } finally {
      await Promise.all(clients.map(async ({ ws }) => {
        if (ws.readyState === WebSocket.CLOSED) return
        const closed = once(ws, 'close')
        ws.close()
        await closed
      }))
    }
  })
}

it('a UI subscriber receives a complete initial snapshot with registered Actors', async () => {
  await withSubscribers(1, async ({ clients }) => {
    const { doc } = clients[0].initial
    assert.deepEqual(doc.tasks, {})
    assert.equal(doc.actors.builder.kind, 'agent')
    assert.equal(doc.actors.alice.kind, 'human')
    assert.ok(Array.isArray(doc.heads))
  })
})

it('HTTP task creation broadcasts the new task and its attributed operation', async () => {
  await withSubscribers(1, async ({ clients, operation }) => {
    const receipt = await operation('task.create', { title: 'Broadcast task' }, 'builder')
    assert.equal(receipt.savedLocally, true)
    const { doc } = await clients[0].next('document-update')
    assert.equal(doc.tasks[receipt.result.taskId].title, 'Broadcast task')
    assert.equal(doc.operations[receipt.operationId].actorId, 'builder')
  })
})

it('HTTP edits broadcast changed fields and their revision IDs', async () => {
  await withSubscribers(1, async ({ clients, create, update }) => {
    const taskId = await create()
    await clients[0].next('document-update')
    const receipt = await update(taskId, { status: 'in-progress' }, 'builder')
    const { doc } = await clients[0].next('document-update')
    assert.equal(doc.tasks[taskId].status, 'in-progress')
    assert.equal(doc.operations[receipt.operationId].payload.updates.status, 'in-progress')
  })
})

it('HTTP comments broadcast complete content and author', async () => {
  await withSubscribers(1, async ({ clients, create, operation }) => {
    const taskId = await create()
    await clients[0].next('document-update')
    const receipt = await operation('comment.add', { taskId, text: 'Complete broadcast comment' }, 'reviewer')
    const { doc } = await clients[0].next('document-update')
    assert.equal(doc.comments[receipt.result.commentId].content, 'Complete broadcast comment')
    assert.equal(doc.comments[receipt.result.commentId].actorId, 'reviewer')
  })
})

it('every connected UI subscriber receives the same document broadcast', async () => {
  await withSubscribers(2, async ({ clients, create }) => {
    const taskId = await create({ title: 'Shared broadcast' })
    const messages = await Promise.all(clients.map(client => client.next('document-update')))
    assert.equal(messages[0].doc.tasks[taskId].title, 'Shared broadcast')
    assert.deepEqual(messages[0].doc, messages[1].doc)
  })
})

for (const changeType of ['task-create', 'task-update', 'comment-add']) {
  it(`rejects legacy JSON ${changeType} without changing shared state`, async () => {
    await withSubscribers(2, async ({ clients, create, api }) => {
      const taskId = await create()
      await Promise.all(clients.map(client => client.next('document-update')))
      const before = (await api('/automerge/doc')).doc
      clients[0].ws.send(JSON.stringify({ type: 'document-change', agent: 'builder', change: {
        type: changeType, taskId, updates: { status: 'completed' },
        task: { id: 'injected', title: 'Injected task' }, comment: { text: 'Injected comment' },
      } }))
      const error = await clients[0].next('error')
      assert.equal(error.code, 'HTTP_MUTATION_REQUIRED')
      assert.deepEqual((await api('/automerge/doc')).doc, before)
      assert.equal(clients[1].messages.filter(message => message.type === 'document-update').length, 0)
    })
  })
}

it('JSON ping receives a pong without a document mutation', async () => {
  await withSubscribers(1, async ({ clients }) => {
    clients[0].ws.send(JSON.stringify({ type: 'ping' }))
    assert.equal((await clients[0].next('pong')).type, 'pong')
  })
})

it('headless operations skip UI projection and a later subscriber receives their complete state', async () => {
  await withWorkspaceServer(async ({ server, api, operation }) => {
    const getDoc = server.store.getDoc.bind(server.store)
    let projections = 0
    server.store.getDoc = () => { projections++; return getDoc() }
    const created = await operation('task.create', { title: 'Before subscribing' })
    const comment = await operation('comment.add', { taskId: created.result.taskId, text: 'Saved without a UI' })
    assert.equal(created.savedLocally, true)
    assert.equal(comment.savedLocally, true)
    assert.equal(projections, 0)
    const { ticket } = await api('/automerge/ws-ticket', {})
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsPort}/?ticket=${ticket}`)
    try {
      const [bytes] = await once(ws, 'message')
      const { doc } = JSON.parse(bytes.toString())
      assert.equal(doc.tasks[created.result.taskId].title, 'Before subscribing')
      assert.equal(doc.comments[comment.result.commentId].content, 'Saved without a UI')
      assert.equal(projections, 1)
    } finally {
      const closed = once(ws, 'close')
      ws.close()
      await closed
    }
  })
})
