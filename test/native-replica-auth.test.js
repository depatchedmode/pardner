import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { Repo } from '@automerge/automerge-repo'
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { replicaOptions } from '../support/replica-credentials.js'
import { withStartedServer, authedFetch, mintWsTicket, mintReplicaTicket, wsUrl } from '../support/resources.js'

async function rejected(server, path, headers = {}) {
  const socket = new WebSocket(wsUrl(server, path), { headers })
  socket.on('error', () => {})
  socket.on('open', () => socket.close())
  try {
    const status = await new Promise((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode) })
      socket.once('open', () => reject(new Error('Unauthorized connection opened')))
      socket.once('error', reject)
    })
    assert.equal(status, 401)
  } finally { socket.terminate() }
}

function requestReplicaTicket(server, replicaId, secret) {
  return authedFetch(server, '/automerge/ws-ticket', {
    method: 'POST', headers: { 'x-pardner-replica-token': secret },
    body: JSON.stringify({ purpose: 'replica', replicaId }),
  })
}

it('ordinary credentials cannot reach the raw CRDT writer through any supported credential transport', async () => {
  await withStartedServer({ allowLegacyWsQueryToken: true, replicaCredentials: {
    [replicaOptions.replicaCredentialId]: replicaOptions.replicaToken, other: 'other-replica-secret',
  } }, async server => {
    const before = server.store.getDoc()
    await rejected(server, '/automerge', { authorization: 'Bearer test-token' })
    await rejected(server, '/automerge', { 'x-pardner-token': 'test-token' })
    await rejected(server, '/automerge?token=test-token')
    await rejected(server, `/automerge?ticket=${await mintWsTicket(server)}`)
    for (const [id, secret] of [
      [replicaOptions.replicaCredentialId, 'test-token'],
      [replicaOptions.replicaCredentialId, ''],
      ['unenrolled', replicaOptions.replicaToken],
      ['other', replicaOptions.replicaToken],
      ['__proto__', replicaOptions.replicaToken],
    ]) {
      const response = await requestReplicaTicket(server, id, secret)
      assert.equal(response.status, 403)
      assert.equal((await response.json()).code, 'REPLICA_REQUIRED')
    }
    assert.equal(server.nativeWsServer.clients.size, 0)
    await server.store.repo.flush([server.store.docHandle.documentId])
    assert.deepEqual(server.store.getDoc(), before)
  })
})

it('native sync requires enrollment even when local API authentication is disabled', async () => {
  await withStartedServer({ apiToken: '', allowInsecureLocal: true, replicaCredentials: {} }, async server => {
    await rejected(server, '/automerge')
    await rejected(server, `/automerge?ticket=${await mintWsTicket(server)}`)
    assert.equal((await requestReplicaTicket(server, replicaOptions.replicaCredentialId, replicaOptions.replicaToken)).status, 403)
  })
})

it('replica tickets are confined to native sync, single use, and expire', async () => {
  await withStartedServer({ wsTicketTtlMs: 100 }, async server => {
    const scoped = await mintReplicaTicket(server)
    await rejected(server, `/?ticket=${scoped}`)
    await rejected(server, `/automerge?ticket=${scoped}`)
    const expired = await mintReplicaTicket(server)
    await delay(120)
    await rejected(server, `/automerge?ticket=${expired}`)
    const ticket = await mintReplicaTicket(server)
    const socket = new WebSocket(wsUrl(server, `/automerge?ticket=${ticket}`))
    try {
      await once(socket, 'open')
      await rejected(server, `/automerge?ticket=${ticket}`)
    } finally { socket.terminate() }
  })
})

it('enrolled replicas are explicitly trusted full writers and synchronize durably', async () => {
  await withStartedServer({}, async server => {
    const ticket = await mintReplicaTicket(server)
    const adapter = new WebSocketClientAdapter(wsUrl(server, `/automerge?ticket=${ticket}`), 60000)
    const repo = new Repo({ network: [adapter] })
    try {
      const handle = await repo.find(server.store.docHandle.url, { signal: AbortSignal.timeout(10000) })
      handle.change(doc => { doc.trustedReplicaMarker = 'full-writer' })
      const deadline = Date.now() + 3000
      while (server.store.docHandle.doc().trustedReplicaMarker !== 'full-writer') {
        assert.ok(Date.now() < deadline, 'Trusted replica write did not arrive')
        await delay(10)
      }
      await server.store.repo.flush([server.store.docHandle.documentId])
    } finally { adapter.socket?.terminate(); await repo.shutdown() }
  })
})

it('rejects enrollment that reuses an ordinary API credential or another replica secret', () => {
  for (const replicaCredentials of [{ laptop: 'api' }, { laptop: 'secret', desktop: 'secret' }, { laptop: '' }]) {
    assert.throws(() => new AutomergeSyncServer({ env: {}, apiToken: 'api', replicaCredentials }), /Replica credentials/)
  }
})
