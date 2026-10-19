/**
 * Env-driven native Automerge Repo peer for external processes (smoke / stress tools).
 * Connects to a running sync server over HTTP (ticket + document URL) and WS (/automerge).
 */

import { rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { WorkspaceRuntime } from './workspace-runtime.js'
import { taskView } from './workspace-schema.js'
import { requestJson } from './sync-client.js'

export const NATIVE_AUTOMERGE_PATH = '/automerge'
export const DEFAULT_NATIVE_WS_RETRY_MS = 1000

export function resolveHttpBase(env = process.env) {
  const raw =
    env.PARDNER_SYNC_SERVER || `http://127.0.0.1:${env.PARDNER_HTTP_PORT || '8004'}`
  return raw.replace(/\/$/, '')
}

/**
 * WebSocket origin base (no path, no trailing slash), e.g. ws://127.0.0.1:8005
 * Pardner defaults: HTTP 8004, native WS 8005 unless PARDNER_WS_BASE / PARDNER_WS_PORT override.
 */
export function resolveWsBase(httpBase, env = process.env) {
  if (env.PARDNER_WS_BASE) {
    return String(env.PARDNER_WS_BASE).replace(/\/$/, '')
  }
  const u = new URL(httpBase)
  const wsPort =
    env.PARDNER_WS_PORT != null && String(env.PARDNER_WS_PORT).length > 0
      ? Number(env.PARDNER_WS_PORT)
      : 8005
  const scheme = u.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${u.hostname}:${wsPort}`
}

export function nativeAutomergeWsUrl(wsBase, ticket) {
  const q = new URLSearchParams({ ticket })
  const base = wsBase.replace(/\/$/, '')
  return `${base}${NATIVE_AUTOMERGE_PATH}?${q}`
}

export async function mintWsTicket(httpBase, token, replicaId = process.env.PARDNER_REPLICA_ID, replicaToken = process.env.PARDNER_REPLICA_TOKEN) {
  const data = await requestJson(httpBase, '/automerge/ws-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-pardner-replica-token': replicaToken ?? '' },
    body: JSON.stringify({ purpose: 'replica', replicaId }),
    token,
  })
  const ticket = data?.ticket
  if (!ticket) throw new Error('No ticket in /automerge/ws-ticket response')
  return ticket
}

export async function fetchDocumentUrl(httpBase, token) {
  const data = await requestJson(httpBase, '/automerge/url', { token })
  const url = data?.url
  if (!url) throw new Error('No url in /automerge/url response')
  return url
}

export async function connectNativePeer({ httpBase = resolveHttpBase(), wsBase = resolveWsBase(httpBase), token, replicaCredentialId = process.env.PARDNER_REPLICA_ID, replicaToken = process.env.PARDNER_REPLICA_TOKEN, storagePath, retryMs = DEFAULT_NATIVE_WS_RETRY_MS }) {
  const runtime = new WorkspaceRuntime({ directory: storagePath, role: 'replica',
    hubUrl: httpBase, hubWsUrl: `${wsBase.replace(/\/$/, '')}${NATIVE_AUTOMERGE_PATH}`, token, replicaCredentialId, replicaToken, retryMs })
  try {
    await runtime.init()
    return { runtime, workspace: runtime.workspace, adapter: runtime.adapter, repo: runtime.repo,
      handle: runtime.docHandle, documentUrl: runtime.docHandle.url, storagePath, httpBase, wsBase }
  } catch (error) {
    await runtime.close()
    throw error
  }
}

export async function disconnectNativePeer(peer) {
  peer?.adapter?.disconnect()
}

export async function closeNativePeer(peer, { removeStorage = false } = {}) {
  if (!peer) return
  await peer.runtime.close()
  if (removeStorage) await rm(peer.storagePath, { recursive: true, force: true })
}

export async function operationHttp(httpBase, token, type, payload, actorId, operationId = randomUUID()) {
  return requestJson(httpBase, '/automerge/operations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, token,
    body: JSON.stringify({ operationId, actorId, type, payload }),
  })
}

export async function createTaskHttp(httpBase, token, fields, actorId, operationId) {
  const receipt = await operationHttp(httpBase, token, 'task.create', fields, actorId, operationId)
  if (!receipt.savedLocally || !receipt.result?.taskId) throw new Error('Task creation was not durably acknowledged')
  return receipt.result.taskId
}

export async function patchTaskHttp(httpBase, token, taskId, updates, actorId, expectedRevisions, operationId) {
  return operationHttp(httpBase, token, 'task.update', { taskId, updates, expectedRevisions }, actorId, operationId)
}

export async function updatePeerTask(peer, taskId, updates, actorId, expectedRevisions, operationId = randomUUID()) {
  return peer.runtime.execute({ operationId, actorId, type: 'task.update', payload: { taskId, updates, expectedRevisions } })
}

export async function getDocHttp(httpBase, token) {
  const data = await requestJson(httpBase, '/automerge/doc', { token })
  if (!data?.doc) throw new Error('Invalid /automerge/doc response')
  return data.doc
}

export async function waitFor(
  predicate,
  {
    timeoutMs = 8000,
    intervalMs = 25,
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

  if (lastError) throw lastError
  throw new Error(`Timed out waiting for ${description}`)
}

export async function waitForTaskFieldsOnHandle(handle, taskId, expected, label) {
  await waitFor(
    () => {
      const doc = handle.doc()
      if (!doc?.tasks?.[taskId]) return false
      const task = taskView(doc, taskId)
      return Object.entries(expected).every(([k, v]) => task[k] === v)
    },
    { description: label }
  )
}

export async function waitForTaskFieldsOnHub(httpBase, token, taskId, expected, label) {
  await waitFor(
    async () => {
      const doc = await getDocHttp(httpBase, token)
      const task = doc?.tasks?.[taskId]
      if (!task) return false
      return Object.entries(expected).every(([k, v]) => task[k] === v)
    },
    { description: label }
  )
}
