// Test-only: opens a hub runtime, receives `record` in its document and is killed the moment the record
// store has saved it, before the runtime uses it (no write-back, no reply, no further persistence).
import { RecordStore } from '../lib/record-store.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

const { directory, genesis, record } = JSON.parse(process.argv[2])
const admit = RecordStore.prototype.admit
RecordStore.prototype.admit = function (candidates) {
  const result = admit.call(this, candidates)
  if (result.accepted.some(accepted => accepted.recordId === record.recordId)) process.kill(process.pid, 'SIGKILL')
  return result
}
const runtime = new WorkspaceRuntime({ directory, genesis })
await runtime.init()
runtime.docHandle.change(doc => { doc.membership[record.recordId] = record })
setTimeout(() => process.exit(3), 10000).unref()
