import { it } from 'node:test'
import assert from 'node:assert/strict'
import { withWorkspaceServer } from '../support/workspace-test.js'

for (const [type, payload] of [
  ['task.update', { taskId: 'missing', updates: { status: 'review' }, expectedRevisions: {} }],
  ['task.link-commit', { taskId: 'missing', commit: { hash: 'abc1234', message: 'Test' } }],
  ['task.branch', { taskId: 'missing', name: 'experiment' }],
  ['task.merge', { branchId: 'missing', expectedRevisions: {} }],
  ['comment.delete', { commentId: 'missing', expectedRevisions: [] }],
  ['comment.edit', { commentId: 'missing', text: 'Updated', expectedRevisions: [] }],
]) {
  it(`${type} rejects a missing resource with a structured 404`, async () => {
    await withWorkspaceServer(async ({ operation }) => {
      const result = await operation(type, payload)
      assert.equal(result.httpStatus, 404)
      assert.equal(result.code, 'NOT_FOUND')
    })
  })
}

for (const [label, type, fields] of [
  ['missing title', 'task.create', {}],
  ['empty title', 'task.create', { title: '' }],
  ['missing branch name', 'task.branch', {}],
  ['missing Actor fields', 'actor.register', {}],
  ['blank Actor handle', 'actor.register', { id: 'new-actor', handle: '  ', kind: 'agent' }],
  ['missing commit hash', 'task.link-commit', { commit: { message: 'No hash' } }],
  ['missing observed revisions', 'read.mark', {}],
]) {
  it(`rejects ${label} without changing the workspace`, async () => {
    await withWorkspaceServer(async ({ create, operation, api }) => {
      const taskId = await create()
      const before = (await api('/automerge/doc')).doc
      const result = await operation(type, { taskId, ...fields })
      assert.equal(result.httpStatus, 400)
      assert.equal(typeof result.code, 'string')
      assert.deepEqual((await api('/automerge/doc')).doc, before)
    })
  })
}

it('all workspace, transport, delivery, and trace endpoints require authentication', async () => {
  await withWorkspaceServer(async ({ api }) => {
    const routes = [
      ['GET', '/automerge/doc'], ['GET', '/automerge/url'], ['GET', '/automerge/status'],
      ['GET', '/automerge/task/missing/context'], ['GET', '/automerge/deliveries'],
      ['GET', '/automerge/trace/abc1234'], ['GET', '/automerge/github-remote'],
      ['POST', '/automerge/operations'], ['POST', '/automerge/sync-ack'], ['POST', '/automerge/ws-ticket'],
      ...['claim', 'ack', 'release'].map(action => ['POST', `/automerge/deliveries/${action}`]),
      ['POST', '/automerge/task'], ['PATCH', '/automerge/task/missing'], ['DELETE', '/automerge/comment/missing'],
    ]
    for (const [method, path] of routes) {
      const result = await api(path, method === 'GET' ? undefined : {}, { method, token: '' })
      assert.equal(result.httpStatus, 401, `${method} ${path}`)
      assert.equal(result.code, 'AUTH_REQUIRED')
    }
  })
})

for (const action of ['ack', 'release']) {
  it(`delivery ${action} rejects missing tokens and nonexistent claims explicitly`, async () => {
    await withWorkspaceServer(async ({ api }) => {
      const path = `/automerge/deliveries/${action}`
      const missing = await api(path, { actorId: 'builder', mentionId: 'missing' })
      assert.equal(missing.httpStatus, 400)
      const stale = await api(path, { actorId: 'builder', mentionId: 'missing', claimToken: 'fake-token' })
      assert.equal(stale.httpStatus, 409)
      assert.equal(stale.code, 'STALE_CLAIM')
    })
  })
}

it('claims require a registered Actor and a stable request ID', async () => {
  await withWorkspaceServer(async ({ api }) => {
    for (const body of [{}, { actorId: ' ' }, { actorId: 'unknown', requestId: 'poll' }, { actorId: 'builder' }]) {
      const result = await api('/automerge/deliveries/claim', body)
      assert.ok([400, 404].includes(result.httpStatus))
      assert.equal(typeof result.code, 'string')
    }
    const empty = await api('/automerge/deliveries/claim', { actorId: 'builder', requestId: 'empty-poll' })
    assert.equal(empty.httpStatus, 200)
    assert.equal(empty.claimed, false)
  })
})

it('registers an agent with stable identity and rejects duplicate identity or handle', async () => {
  await withWorkspaceServer(async ({ operation, api }) => {
    const actor = { id: 'review-bot', handle: 'review-bot', kind: 'agent' }
    assert.equal((await operation('actor.register', actor)).savedLocally, true)
    assert.equal((await api('/automerge/doc')).doc.actors[actor.id].kind, 'agent')
    for (const duplicate of [actor, { ...actor, id: 'other-id' }]) {
      assert.equal((await operation('actor.register', duplicate)).code, 'ALREADY_EXISTS')
    }
  })
})

it('empty-workspace queries return JSON and missing task context is explicit', async () => {
  await withWorkspaceServer(async ({ api }) => {
    assert.deepEqual((await api('/automerge/doc')).doc.tasks, {})
    assert.equal((await api('/automerge/status')).savedLocally, true)
    assert.deepEqual((await api('/automerge/deliveries')).mentions, [])
    assert.equal((await api('/automerge/task/missing/context')).code, 'NOT_FOUND')
  })
})

it('explains an oversized request with 413 and keeps malformed JSON at 400', async () => {
  await withWorkspaceServer(async ({ server, operation, create }) => {
    const send = body => fetch(`http://127.0.0.1:${server.httpPort}/automerge/operations`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', Connection: 'close' },
      body,
    }).then(async response => ({ status: response.status, body: await response.json() }))
    const big = await send(JSON.stringify({ type: 'task.create', payload: { title: 'Big', description: 'x'.repeat(110 * 1024) }, actorId: 'alice', operationId: 'big-1' }))
    assert.equal(big.status, 413)
    assert.equal(big.body.code, 'INVALID_ARGUMENT')
    assert.equal(big.body.error, 'This change is larger than the 100 kB request limit. Shorten it and try again.')
    const malformed = await send('{ not json')
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.code, 'INVALID_ARGUMENT')
    assert.equal(malformed.body.error, 'Send a valid JSON request.')
    assert.ok(await create())
  })
})
