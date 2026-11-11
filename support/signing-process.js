import { machineKeyFromPem } from '../lib/machine-key.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

// Test-only: a hub runtime in its own process, so a test can kill it at an exact point. The parent sends the
// fixture machine key over IPC, never through arguments or the environment.

process.once('message', async ({ directory, key, genesis, actors, holdSignatures }) => {
  try {
    const runtime = new WorkspaceRuntime({ directory, role: 'hub', machineKey: machineKeyFromPem(key), genesis, actors })
    await runtime.init()
    // The signature stays out of the signature document, as when the process dies before its background save.
    if (holdSignatures) runtime.attribution.holdOutbox = true
    const receipt = await runtime.execute({ operationId: 'killed-before-signature-save', actorId: actors[0].id, type: 'task.create', payload: { title: 'Saved, then killed' } })
    process.send({ type: 'saved', receipt: { taskId: receipt.result.taskId, heads: receipt.heads, savedLocally: receipt.savedLocally }, url: runtime.manifest.url })
    process.once('message', () => process.kill(process.pid, 'SIGKILL'))
  } catch (error) {
    process.send({ type: 'error', message: error.stack })
    process.exitCode = 1
    process.disconnect()
  }
})
