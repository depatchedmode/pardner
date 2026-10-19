import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createConnection, loadConfiguration, websocketUrl } from '../ui-prototype/src/connection.js'

function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const config = { workspaceId: 'workspace-a', apiBase: '', wsPath: '/', wsPort: 8005 }

it('resolves separate LAN ports and HTTPS same-origin subscription paths without URL credentials', () => {
  assert.equal(websocketUrl(config, 'http://192.168.1.5:8004/pardner/?old=1#token', 'ticket'), 'ws://192.168.1.5:8005/?ticket=ticket')
  assert.equal(websocketUrl({ ...config, wsPath: '/pardner/ws', wsPort: undefined }, 'https://review.example/pardner/', 'fresh'),
    'wss://review.example/pardner/ws?ticket=fresh')
})

it('persists credentials and preferences across browser instances while isolating workspace drafts', async () => {
  const local = storage(), drafts = storage()
  let request
  const options = { storage: local, drafts, fetcher: async (url, init) => {
    request = { url, ...init }
    return Response.json({ success: true })
  } }
  const first = createConnection(config, options)
  first.remember('secret')
  first.savePreferences({ actor: 'alice', filter: 'alice', statusFilter: 'review' })
  first.savePending({ operationId: 'one', actorId: 'alice' })
  const reopened = createConnection(config, options)
  assert.equal(reopened.credential(), 'secret')
  assert.equal(reopened.preferences().actor, 'alice')
  assert.equal(reopened.pending().operationId, 'one')
  await reopened.request('/automerge/doc')
  assert.equal(request.headers.Authorization, 'Bearer secret')
  assert.equal(request.url, '/automerge/doc')
  const other = createConnection({ ...config, workspaceId: 'workspace-b' }, options)
  assert.equal(other.credential(), '')
  assert.equal(other.pending(), null)
  reopened.forget()
  assert.equal(first.credential(), '')
  assert.deepEqual(first.preferences(), {})
  assert.equal(first.pending(), null)
})

it('rejects changed workspace pairing and forgets a rejected credential without discarding uncertain operations', async () => {
  const local = storage(), drafts = storage()
  const client = createConnection(config, { storage: local, drafts, fetcher: async url => url.endsWith('/pair') ?
    Response.json({ workspaceId: 'workspace-b', token: 'wrong-workspace' }) :
    Response.json({ code: 'AUTH_REQUIRED', error: 'Unauthorized' }, { status: 401 }) })
  await assert.rejects(client.pair('12345678'), { code: 'WORKSPACE_MISMATCH' })
  assert.equal(client.credential(), '')
  client.remember('old')
  client.savePending({ operationId: 'keep-this' })
  await assert.rejects(client.request('/automerge/doc'), { code: 'AUTH_REQUIRED' })
  assert.equal(client.credential(), '')
  assert.equal(client.pending().operationId, 'keep-this')
})

for (const recovery of ['pairing', 'manual token']) it(`preserves a replacement credential from ${recovery} when an older request rejects`, async () => {
  let rejectOldRequest
  const client = createConnection(config, { storage: storage(), drafts: storage(), fetcher: async (url, init) => {
    if (url.endsWith('/pair')) return Response.json({ workspaceId: config.workspaceId, token: 'replacement' })
    assert.equal(init.headers.Authorization, 'Bearer old')
    return new Promise(resolve => {
      rejectOldRequest = () => resolve(Response.json({ code: 'AUTH_REQUIRED', error: 'Unauthorized' }, { status: 401 }))
    })
  } })
  client.remember('old')
  client.savePending({ operationId: 'keep-this' })
  const rejected = assert.rejects(client.request('/automerge/status'), { code: 'AUTH_REQUIRED' })
  if (recovery === 'pairing') await client.pair('12345678')
  else client.remember('replacement')
  rejectOldRequest()
  await rejected
  assert.equal(client.credential(), 'replacement')
  assert.equal(client.pending().operationId, 'keep-this')
})

it('reports malformed responses and configuration instead of silently spinning', async () => {
  await assert.rejects(loadConfiguration(async () => Response.json({})), /configuration is incomplete/)
  await assert.rejects(loadConfiguration(async () => new Response('<html>failed</html>')), /unreadable response/)
  await assert.rejects(loadConfiguration(async () => Response.json(null)), /unreadable response/)
  await assert.rejects(loadConfiguration(async () => Response.json({ ...config, wsPath: '//other.example' })), /incomplete/)
  await assert.rejects(loadConfiguration(async () => Response.json({ ...config, wsPath: '/\\other.example' })), /incomplete/)
  await assert.rejects(loadConfiguration(async () => Response.json({ ...config, apiBase: 'https://other.example' })), /incomplete/)
  const client = createConnection(config, { storage: { ...storage(), setItem() { throw new Error('blocked') } }, drafts: storage() })
  assert.throws(() => client.remember('secret'), /storage is unavailable/)
})
