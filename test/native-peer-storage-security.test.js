import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { cbor } from '@automerge/automerge-repo'
import { WebSocket } from 'ws'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { waitFor } from '../support/resources.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

const invalidMetadata = [
  ...['../../../../outside', '/tmp/outside', '..\\outside', 'C:\\outside',
    '%2f', '..%2Foutside', '%5c', '%252f', '', '.', '..', 'a\0b', 'CON', 'nul.txt',
    null, 42, [], {}].map(storageId => ({ storageId })),
  null, 'invalid-metadata', [],
]

async function connect(server, api, auth) {
  const { ticket } = auth === 'ticket' ? await api('/automerge/ws-ticket', {}) : {}
  const ws = new WebSocket(`ws://127.0.0.1:${server.wsPort}/automerge${ticket ? `?ticket=${ticket}` : ''}`, {
    ...(auth === 'token' ? { headers: { Authorization: 'Bearer test-token' } } : {}),
  })
  await once(ws, 'open', { signal: AbortSignal.timeout(3000) })
  return ws
}

for (const auth of ['token', 'ticket']) {
  it(`rejects unsafe native join metadata admitted with a ${auth} before Repo or storage sees it`, { timeout: 15000 }, async () => {
    await withWorkspaceServer(async ({ server, api, directory }) => {
      const outside = join(directory, 'outside')
      await fs.writeFile(outside, 'keep this file')
      const candidates = []
      const syncWrites = []
      server.automergeWsAdapter.on('peer-candidate', peer => candidates.push(peer))
      const storage = server.store.repo.storageSubsystem
      const saveSyncState = storage.saveSyncState.bind(storage)
      storage.saveSyncState = (...args) => {
        syncWrites.push(args)
        return saveSyncState(...args)
      }
      for (const peerMetadata of invalidMetadata) {
        const ws = await connect(server, api, auth)
        try {
          const closed = once(ws, 'close', { signal: AbortSignal.timeout(1500) })
          ws.send(cbor.encode({ type: 'join', senderId: 'attacker', peerMetadata, supportedProtocolVersions: ['1'] }))
          // Even queued follow-up frames must not admit this closing connection.
          ws.send(cbor.encode({ type: 'join', senderId: 'queued-peer', peerMetadata: { storageId: 'valid-peer' } }))
          const [code] = await closed
          assert.equal(code, 1008)
          assert.deepEqual(candidates, [])
          assert.deepEqual(syncWrites, [])
          assert.equal(server.store.repo.peerMetadataByPeerId.attacker, undefined)
          assert.equal(await fs.readFile(outside, 'utf8'), 'keep this file')
        } finally {
          ws.terminate()
        }
      }
    })
  })
}

it('accepts ephemeral native peers without a storage ID', async () => {
  await withWorkspaceServer(async ({ server, api }) => {
    for (const peerMetadata of [undefined, {}, { isEphemeral: true }]) {
      const ws = await connect(server, api, 'ticket')
      try {
        const candidate = once(server.automergeWsAdapter, 'peer-candidate', { signal: AbortSignal.timeout(1500) })
        ws.send(cbor.encode({ type: 'join', senderId: 'ephemeral-peer', ...(peerMetadata ? { peerMetadata } : {}) }))
        const [peer] = await candidate
        assert.equal(peer.peerId, 'ephemeral-peer')
      } finally {
        const closed = once(ws, 'close')
        ws.close()
        await closed
      }
    }
  })
})

it('valid peers still synchronize and persist decodable sync state in the existing layout', { timeout: 15000 }, async () => {
  await withWorkspaceServer(async ({ server, create, directory }) => {
    const peer = new WorkspaceRuntime({ directory: join(directory, 'replica'), role: 'replica',
      hubUrl: `http://127.0.0.1:${server.httpPort}`, hubWsUrl: `ws://127.0.0.1:${server.wsPort}/automerge`,
      token: 'test-token', retryMs: 100 })
    try {
      await peer.init()
      const taskId = await create({ title: 'Valid native sync' })
      await waitFor(() => peer.workspace.handle.doc().tasks[taskId])
      assert.equal(peer.workspace.taskContext(taskId).task.title, 'Valid native sync')
      const storageId = await peer.repo.storageId()
      const documentId = peer.workspace.handle.documentId
      const statePath = join(directory, 'repo', documentId.slice(0, 2), documentId.slice(2), 'sync-state', storageId)
      await waitFor(async () => (await fs.stat(statePath)).size > 0)
      assert.ok(await server.store.repo.storageSubsystem.loadSyncState(documentId, storageId))
      assert.equal(server.store.repo.storageError, null)
    } finally {
      await peer.close()
    }
  })
})

it('replicas refuse unsafe storage metadata from the hub without a storage error', { timeout: 15000 }, async () => {
  await withWorkspaceServer(async ({ server, create, directory }) => {
    const replicaDirectory = join(directory, 'replica')
    const peer = new WorkspaceRuntime({ directory: replicaDirectory, role: 'replica',
      hubUrl: `http://127.0.0.1:${server.httpPort}`, hubWsUrl: `ws://127.0.0.1:${server.wsPort}/automerge`,
      token: 'test-token', retryMs: 100 })
    try {
      await peer.init()
      await waitFor(() => peer.status().hubConnected)
      server.automergeWsAdapter.peerMetadata = { storageId: '../../../../escaped', isEphemeral: false }
      for (const socket of server.nativeWsServer.clients) socket.terminate()
      await waitFor(() => peer.status().syncError === 'Hub sent invalid peer storage metadata')
      const taskId = await create({ title: 'Hostile hub' })
      await new Promise(resolve => setTimeout(resolve, 500))
      assert.equal(peer.workspace.handle.doc().tasks[taskId], undefined)
      assert.equal(peer.status().hubConnected, false)
      assert.equal(peer.status().storageError, null)
      await assert.rejects(fs.stat(join(replicaDirectory, 'escaped')), { code: 'ENOENT' })
    } finally {
      await peer.close()
    }
  })
})
