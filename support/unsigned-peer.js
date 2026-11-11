import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { Repo } from '@automerge/automerge-repo'
import { machineActor } from '../lib/change-signatures.js'
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
