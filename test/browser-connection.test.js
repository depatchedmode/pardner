import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createConnection, loadConfiguration, websocketUrl } from '../ui-prototype/src/connection.js'
import { hubNotice, syncLabel } from '../ui-prototype/src/client-api.js'

function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const config = { workspaceId: 'workspace-a', actorId: 'alice', apiBase: '/projects/workspace-a/api', wsPath: '/', wsPort: 8005 }

it('resolves separate LAN ports and HTTPS same-origin subscription paths without URL credentials', () => {
  assert.equal(websocketUrl(config, 'http://192.168.1.5:8004/pardner/?old=1#token', 'ticket'), 'ws://192.168.1.5:8005/?ticket=ticket')
  assert.equal(websocketUrl({ ...config, wsPath: '/pardner/ws', wsPort: undefined }, 'https://review.example/pardner/', 'fresh'),
    'wss://review.example/pardner/ws?ticket=fresh')
})

it('keeps preferences and pending operations per project and Actor, authenticating with the session cookie', async () => {
  const local = storage(), drafts = storage()
  let request
  const options = { storage: local, drafts, fetcher: async (url, init) => {
    request = { url, ...init }
    return Response.json({ success: true })
  } }
  const first = createConnection(config, options)
  first.savePreferences({ filter: 'alice', statusFilter: 'review' })
  first.savePending({ operationId: 'one', actorId: 'alice' })
  first.saveDraft('task-1', { fields: { title: 'Draft' } })
  const reopened = createConnection(config, options)
  assert.equal(reopened.preferences().statusFilter, 'review')
  assert.equal(reopened.pending().operationId, 'one')
  assert.equal(reopened.draft('task-1').fields.title, 'Draft')
  await reopened.request('/automerge/doc')
  assert.equal(request.url, '/projects/workspace-a/api/automerge/doc')
  assert.equal(request.credentials, 'same-origin')
  assert.equal(request.headers.Authorization, undefined, 'no bearer token leaves the browser')
  assert.equal(request.headers['X-Pardner-Workspace'], 'workspace-a')
  for (const other of [{ ...config, workspaceId: 'workspace-b' }, { ...config, actorId: 'bob' }]) {
    const isolated = createConnection(other, options)
    assert.equal(isolated.pending(), null)
    assert.deepEqual(isolated.preferences(), {})
    assert.equal(isolated.draft('task-1'), null)
  }
})

it('keeps an uncertain operation when a request is rejected', async () => {
  const client = createConnection(config, { storage: storage(), drafts: storage(),
    fetcher: async () => Response.json({ code: 'AUTH_REQUIRED', error: 'Unauthorized' }, { status: 401 }) })
  client.savePending({ operationId: 'keep-this' })
  await assert.rejects(client.request('/automerge/doc'), { code: 'AUTH_REQUIRED' })
  assert.equal(client.pending().operationId, 'keep-this')
})

it('reports an unreachable client in plain words and keeps the pending operation', async () => {
  const cause = new TypeError('Failed to fetch')
  const client = createConnection(config, { storage: storage(), drafts: storage(), fetcher: async () => { throw cause } })
  client.savePending({ operationId: 'retry-this' })
  await assert.rejects(client.request('/automerge/operations', { operationId: 'retry-this' }), error => {
    assert.equal(error.code, 'CLIENT_UNREACHABLE')
    assert.equal(error.cause, cause)
    assert.match(error.message, /local Pardner client did not respond/)
    assert.doesNotMatch(error.message, /Failed to fetch/)
    return true
  })
  assert.equal(client.pending().operationId, 'retry-this')
})

it('reports malformed responses and configuration instead of silently spinning', async () => {
  await assert.rejects(loadConfiguration(async () => new Response('<html>failed</html>')), /unreadable response/)
  await assert.rejects(loadConfiguration(async () => Response.json(null)), /unreadable response/)
  await assert.rejects(loadConfiguration(async () => Response.json({ mode: 'client' })), /configuration is incomplete/)
  await assert.rejects(loadConfiguration(async () => Response.json({ mode: 'client', clientApiBase: '//other.example' })), /incomplete/)
  await assert.rejects(loadConfiguration(async () => Response.json({ mode: 'client', clientApiBase: 'https://other.example' })), /incomplete/)
  assert.deepEqual(await loadConfiguration(async () => Response.json({ mode: 'client', clientApiBase: '/pardner/client' })),
    { mode: 'client', clientApiBase: '/pardner/client' })
  // A standalone service has no human board; its configuration only selects the notice. An empty one is broken (#187).
  assert.equal((await loadConfiguration(async () => Response.json({ mode: 'standalone', workspaceId: 'workspace-a' }))).workspaceId, 'workspace-a')
  await assert.rejects(loadConfiguration(async () => Response.json({})), /service configuration is incomplete/)
  await assert.rejects(loadConfiguration(async () => Response.json({ workspaceId: 'workspace-a' })), /service configuration is incomplete/)
  const client = createConnection(config, { storage: { ...storage(), setItem() { throw new Error('blocked') } }, drafts: storage() })
  assert.throws(() => client.savePreferences({ view: 'board' }), /storage is unavailable/)
})

it('shows a restored hub that waits, two copies of one machine and a hub catching up before the save state', () => {
  const synced = { savedLocally: true, syncPending: false, hubConnected: true }
  assert.equal(syncLabel(synced), 'Saved locally · synced')
  assert.equal(syncLabel({ ...synced, hub: { waiting: true, reason: 'restored' } }),
    'Restored hub · waits for a member machine, or pardner client resume, before serving others')
  assert.equal(syncLabel({ ...synced, duplicateMachines: [{ machineId: 'machine-x', sessions: 2 }] }),
    'Two copies of one machine are connected · check for a running backup')
  assert.equal(hubNotice({ ...synced, duplicateMachines: [{ machineId: 'machine-x', sessions: 1 }] }), null, 'a past report with one copy left is not shown')
  assert.equal(syncLabel({ ...synced, hubRefusal: { code: 'HUB_WAITING' } }), 'Saved locally · the hub is catching up after a restore')
})
