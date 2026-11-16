import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

const options = JSON.parse(process.argv[2])
const server = new AutomergeSyncServer({
  store: new WorkspaceRuntime(options), env: {}, apiToken: options.token,
  httpPort: options.httpPort ?? 0, wsPort: options.wsPort ?? 0, logger: {},
})
try {
  await server.start()
  process.send({ httpPort: server.httpPort, wsPort: server.wsPort, manifest: server.store.manifest })
} catch (error) {
  process.send({ error: error.message, code: error.code })
  process.exitCode = 1
  process.disconnect()
}
