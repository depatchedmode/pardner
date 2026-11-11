import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { Repo } from '@automerge/automerge-repo'
import { machineActor, shardOf, signChange, signaturesDocumentUrl } from '../lib/change-signatures.js'
import { initiateHandshake } from '../lib/machine-handshake.js'
import { TicketNetworkAdapter } from '../lib/ticket-network-adapter.js'
import { prepareOperation } from '../lib/workspace-commands.js'

/**
 * Test-only: a bare Automerge peer that proves `key` (a fixture machine key) at a hub's native route and writes
 * one task change under that machine's actor without signing it, as a modified client could. Returns the peer's
 * repo, to shut down, and the change's Activity entry.
 */
export async function unsignedWrite({ key, projectId, nativeUrl, boardUrl, actorId, title }) {
  const adapter = new TicketNetworkAdapter({ retryMs: 60000, getUrl: async () => nativeUrl,
    handshake: (socket, signal) => initiateHandshake(socket, { key, projectId, route: nativeUrl, role: 'replica', expectRole: 'hub', knownRecords: () => [], signal }) })
  const repo = new Repo({ network: [adapter], sharePolicy: async () => true })
  const board = await repo.find(boardUrl, { signal: AbortSignal.timeout(15000) })
  board.update(doc => A.clone(doc, { actor: machineActor(key) }))
  const prepared = prepareOperation(board.doc(), { operationId: randomUUID(), actorId, type: 'task.create', payload: { title } },
    { replicaId: 'replica-modified', timestamp: new Date().toISOString() })
  board.change(prepared.change)
  return { repo, operationId: prepared.event.operationId, taskId: prepared.event.taskId }
}

/**
 * Test-only: a bare Automerge peer that proves `key` at a hub's native route and edits a field inside an existing
 * Activity entry, as a modified client could, then signs that edit with `key`. Returns the peer's repo, to shut
 * down, and the edit's change hash.
 */
export async function alterEntry({ key, projectId, nativeUrl, boardUrl, operationId, edit }) {
  const adapter = new TicketNetworkAdapter({ retryMs: 60000, getUrl: async () => nativeUrl,
    handshake: (socket, signal) => initiateHandshake(socket, { key, projectId, route: nativeUrl, role: 'replica', expectRole: 'hub', knownRecords: () => [], signal }) })
  const repo = new Repo({ network: [adapter], sharePolicy: async () => true })
  const board = await repo.find(boardUrl, { signal: AbortSignal.timeout(15000) })
  const signatures = await repo.find(signaturesDocumentUrl(projectId), { signal: AbortSignal.timeout(15000) })
  board.update(doc => A.clone(doc, { actor: machineActor(key) }))
  board.change(doc => edit(doc.operations[operationId]))
  const [hash] = A.getHeads(board.doc())
  signatures.update(doc => A.clone(doc, { actor: machineActor(key) }))
  signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(key, projectId, hash) })
  return { repo, hash }
}

/**
 * Test-only: a bare Automerge peer that proves `key` at a hub's native route, makes any one change to the board
 * (`write(doc)`), as a modified client could, and signs it with `key`. Returns the peer's repo, to shut down, and
 * the change's hash.
 */
export async function signedWrite({ key, projectId, nativeUrl, boardUrl, write }) {
  const adapter = new TicketNetworkAdapter({ retryMs: 60000, getUrl: async () => nativeUrl,
    handshake: (socket, signal) => initiateHandshake(socket, { key, projectId, route: nativeUrl, role: 'replica', expectRole: 'hub', knownRecords: () => [], signal }) })
  const repo = new Repo({ network: [adapter], sharePolicy: async () => true })
  const board = await repo.find(boardUrl, { signal: AbortSignal.timeout(15000) })
  const signatures = await repo.find(signaturesDocumentUrl(projectId), { signal: AbortSignal.timeout(15000) })
  board.update(doc => A.clone(doc, { actor: machineActor(key) }))
  board.change(write)
  const [hash] = A.getHeads(board.doc())
  signatures.update(doc => A.clone(doc, { actor: machineActor(key) }))
  signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(key, projectId, hash) })
  return { repo, hash }
}
