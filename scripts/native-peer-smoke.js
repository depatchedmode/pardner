#!/usr/bin/env node
import { operationEvents, requireValue } from '../lib/workspace-schema.js'
import { randomUUID } from 'node:crypto'
import { requestJson } from '../lib/sync-client.js'
import { closeNativePeer, connectNativePeer, operationHttp, resolveHttpBase, resolveWsBase, updatePeerTask } from '../lib/native-peer-client.js'

const httpBase = resolveHttpBase(), wsBase = resolveWsBase(httpBase)
const token = process.env.PARDNER_API_TOKEN || null
const storagePath = process.env.PARDNER_PEER_STORAGE_PATH
const actorId = process.env.PARDNER_ACTOR
const operationId = process.env.PARDNER_OPERATION_ID || randomUUID()
const [command, ...args] = process.argv.slice(2)

async function withPeer(run) {
  if (!storagePath) throw new Error('PARDNER_PEER_STORAGE_PATH is required for peer commands')
  const peer = await connectNativePeer({ httpBase, wsBase, token, storagePath })
  try { return await run(peer) }
  finally { await closeNativePeer(peer) }
}
function requireActor() {
  if (!actorId) throw new Error('Set PARDNER_ACTOR to a registered Actor ID or handle')
}

async function main() {
  if (command === 'watch') {
    return withPeer(async peer => {
      const print = () => console.log(JSON.stringify({ doc: peer.runtime.getDoc(), status: peer.runtime.status() }))
      peer.handle.on('change', print)
      print()
      await new Promise(resolve => {
        const stop = () => {
          process.off('SIGINT', stop)
          process.off('SIGTERM', stop)
          resolve()
        }
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
      })
      peer.handle.off('change', print)
    })
  }
  if (command === 'show-task' && args[0]) {
    if (storagePath) return withPeer(peer => peer.workspace.taskContext(args[0], actorId))
    return requestJson(httpBase, `/automerge/task/${encodeURIComponent(args[0])}/context${actorId ? `?actor=${encodeURIComponent(actorId)}` : ''}`, { token })
  }
  if (command === 'set-task' && args.length >= 3) {
    requireActor()
    const [taskId, field, ...parts] = args
    if (!['title', 'description', 'status', 'priority', 'assignee'].includes(field)) throw new Error(`Unsupported field: ${field}`)
    const raw = parts.join(' '), value = field === 'assignee' && raw === 'null' ? null : raw
    return withPeer(peer => {
      const { revisions } = peer.workspace.taskContext(taskId)
      const originals = operationEvents(peer.handle.doc(), operationId)
      requireValue(originals.length <= 1, 'This retry ID has conflicting requests', 'OPERATION_ID_REUSED')
      const original = originals[0]
      const expectedRevisions = original?.payload.expectedRevisions ?? { [field]: revisions[field] }
      return updatePeerTask(peer, taskId, { [field]: value }, actorId, expectedRevisions, operationId)
    })
  }
  if (command === 'create-task') {
    requireActor()
    const fields = { title: args.join(' ').trim() || 'Smoke task' }
    if (storagePath) return withPeer(peer => peer.runtime.execute({ operationId, actorId, type: 'task.create', payload: fields }))
    const receipt = await operationHttp(httpBase, token, 'task.create', fields, actorId, operationId)
    return { ...receipt, taskId: receipt.result.taskId }
  }
  throw new Error('Usage: native-peer-smoke.js watch | show-task <id> | set-task <id> <field> <value> | create-task [title]. Use PARDNER_ACTOR for writes and PARDNER_PEER_STORAGE_PATH for persisted peer commands.')
}
main().then(result => { if (result !== undefined) console.log(JSON.stringify(result)) }).catch(error => {
  console.log(JSON.stringify({ success: false, code: error.code || 'COMMAND_FAILED', error: error.message, operationId }))
  process.exitCode = 1
})
