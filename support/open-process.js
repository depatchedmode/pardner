import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'

const [directory, phase] = process.argv.slice(2)
if (phase === 'during') {
  const loadRange = NodeFSStorageAdapter.prototype.loadRange
  NodeFSStorageAdapter.prototype.loadRange = async function (...args) {
    const chunks = await loadRange.apply(this, args)
    if (args[0][1] === 'snapshot') {
      process.send({ type: 'opening' })
      await new Promise(() => {})
    }
    return chunks
  }
}
try {
  const runtime = await new WorkspaceRuntime({ directory }).init()
  process.send({ type: 'opened', snapshot: runtime.getDoc(), status: runtime.status() })
  process.on('message', async message => {
    if (message === 'close') { await runtime.close(); process.disconnect() }
  })
} catch (error) {
  process.send({ type: 'error', message: error.stack })
  process.disconnect()
}
