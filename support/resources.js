import { replicaOptions, replicaCredentials } from './replica-credentials.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { Repo } from '@automerge/automerge-repo'
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'

import AutomergeSyncServer from '../automerge-sync-server.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { randomUUID } from 'node:crypto'

export const noopLogger = {
  log() {},
  warn() {},
  error() {},
}

export function createTempDir(prefix = 'pardner-test-') {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function cleanupTempDir(dir) {
  if (!dir) return
  rmSync(dir, { recursive: true, force: true })
}

// ─── Sync Server Helpers ───

export const TEST_TOKEN = 'test-token'
export const NATIVE_AUTOMERGE_RETRY_MS = 60_000
export const SYNC_WAIT_TIMEOUT_MS = 5000
export const POLL_INTERVAL_MS = 25

export function createServer(storagePath, overrides = {}) {
  return new AutomergeSyncServer({ replicaCredentials,
    actors: [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'builder', handle: 'builder', kind: 'agent' }],
    env: {},
    apiToken: TEST_TOKEN,
    allowedOrigins: ['http://allowed.example'],
    httpPort: 0,
    wsPort: 0,
    storagePath,
    usePersistedUrl: false,
    logger: noopLogger,
    ...overrides,
  })
}

export async function withStartedServer(overrides, fn) {
  const storagePath = createTempDir('pardner-fitness-')
  const server = createServer(storagePath, overrides)
  try {
    await server.start()
    return await fn(server)
  } finally {
    try {
      await server.stop()
      await delay(100)
    } finally {
      cleanupTempDir(storagePath)
    }
  }
}

export async function waitFor(
  predicate,
  {
    timeoutMs = SYNC_WAIT_TIMEOUT_MS,
    intervalMs = POLL_INTERVAL_MS,
    description = 'condition',
  } = {}
) {
  const start = Date.now()
  let lastError = null

  while (Date.now() - start <= timeoutMs) {
    try {
      const result = await predicate()
      if (result) return result
      lastError = null
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }

  if (lastError) {
    throw lastError
  }
  throw new Error(`Timed out waiting for ${description}`)
}

export function httpUrl(server, path) {
  return `http://${server.host}:${server.httpPort}${path}`
}

export function wsUrl(server, path = '/') {
  return `ws://${server.host}:${server.wsPort}${path}`
}

export function authedFetch(server, path, options = {}) {
  const url = httpUrl(server, path)
  const headers = {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
    ...options.headers,
  }
  return fetch(url, { ...options, headers })
}

export async function authedGet(server, path) {
  const res = await authedFetch(server, path)
  return res.json()
}

export async function authedPost(server, path, body) {
  const res = await authedFetch(server, path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { ...(await res.json()), status: res.status }
}

export async function authedPatch(server, path, body) {
  const res = await authedFetch(server, path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { ...(await res.json()), status: res.status }
}

export async function authedDelete(server, path) {
  const res = await authedFetch(server, path, { method: 'DELETE' })
  return { ...(await res.json()), status: res.status }
}

export async function getDoc(server) {
  const { doc } = await authedGet(server, '/automerge/doc')
  return doc
}

// Create a task via the API and return its ID
export async function createTask(server, fields = {}) {
  const response = await authedPost(server, '/automerge/operations', {
    operationId: randomUUID(), actorId: 'alice', type: 'task.create',
    payload: { title: 'Test task', ...fields },
  })
  if (!response.savedLocally) throw new Error(JSON.stringify(response))
  return response.result.taskId
}

// ─── WebSocket Helpers ───

export async function connectAuthenticatedWs(server) {
  const ticket = await mintWsTicket(server)
  const ws = new WebSocket(wsUrl(server, `/?ticket=${ticket}`), {
    origin: 'http://allowed.example',
  })

  // Buffer messages that arrive before callers attach listeners.
  const messageBuffer = []
  const bufferHandler = data => {
    messageBuffer.push(JSON.parse(data.toString()))
  }
  ws.on('message', bufferHandler)

  await once(ws, 'open')

  // Wait for the initial document-state message with a real timeout
  // instead of an arbitrary sleep.
  if (messageBuffer.length === 0) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No initial WS message')), 2000)
      ws.once('message', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  // Stop buffering and stash any early messages.
  ws.removeListener('message', bufferHandler)
  ws._mcBuffer = messageBuffer
  return ws
}

export async function mintWsTicket(server) {
  const { ticket } = await authedPost(server, '/automerge/ws-ticket', {})
  return ticket
}

export function nextWsMessage(ws, timeoutMs = 2000) {
  // Drain buffered messages first.
  if (ws._mcBuffer && ws._mcBuffer.length > 0) {
    return Promise.resolve(ws._mcBuffer.shift())
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS message timeout')), timeoutMs)
    ws.once('message', data => {
      clearTimeout(timeout)
      resolve(JSON.parse(data.toString()))
    })
  })
}

/** Path for Automerge Repo native (CBOR) WebSocket sync (see automerge-sync-server.js). */
export const NATIVE_AUTOMERGE_WS_PATH = '/automerge'

export function nativeAutomergeWsUrl(server, query = {}) {
  const q = new URLSearchParams(query)
  const suffix = q.toString() ? `?${q}` : ''
  return wsUrl(server, `${NATIVE_AUTOMERGE_WS_PATH}${suffix}`)
}

export async function mintReplicaTicket(server) {
  const response = await authedFetch(server, '/automerge/ws-ticket', {
    method: 'POST', headers: { 'x-pardner-replica-token': replicaOptions.replicaToken },
    body: JSON.stringify({ purpose: 'replica', replicaId: replicaOptions.replicaCredentialId }),
  })
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()).ticket
}

export async function openNativePeer(server, storagePath = createTempDir('pardner-peer-')) {
  const ticket = await mintReplicaTicket(server)
  const { url: documentUrl } = await authedGet(server, '/automerge/url')
  const adapter = new WebSocketClientAdapter(
    nativeAutomergeWsUrl(server, { ticket }),
    NATIVE_AUTOMERGE_RETRY_MS
  )
  const repo = new Repo({
    storage: new NodeFSStorageAdapter(storagePath),
    network: [adapter],
  })
  const handle = await repo.find(documentUrl)
  await handle.whenReady(['ready'])
  return { adapter, documentUrl, handle, repo, storagePath }
}

export async function disconnectNativePeer(peer) {
  const socket = peer?.adapter?.socket
  if (!socket || socket.readyState === WebSocket.CLOSED) return

  const closed = once(socket, 'close').catch(() => {})
  socket.terminate()
  await Promise.race([closed, delay(100)])
}

export async function closeNativePeer(peer, { removeStorage = true } = {}) {
  if (!peer) return

  try {
    await disconnectNativePeer(peer)
  } catch {
    // Ignore socket shutdown errors during teardown.
  }

  try {
    await peer.repo?.shutdown()
  } catch {
    // Ignore repo shutdown errors during teardown.
  }

  // Repo shutdown can leave a final async sync-state write in flight.
  await delay(50)

  if (removeStorage) {
    cleanupTempDir(peer.storagePath)
  }
}
