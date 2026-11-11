import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from './workspace-runtime.js'

let server
/**
 * Control pane options from the parent's start message. They are plain data; a test may name a module whose
 * `createTransport()` supplies the Cursor Cloud transport, since a transport object cannot cross the IPC channel.
 */
async function controlOptions(control = {}) {
  if (control === false || !control.cloud?.transportModule) return control
  const { transportModule, ...cloud } = control.cloud
  return { ...control, cloud: { ...cloud, transport: (await import(transportModule)).createTransport() } }
}
let queue = Promise.resolve()
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await queue.catch(() => {})
  await server?.stop()
  if (process.connected) process.disconnect()
}
process.on('disconnect', () => { stop().catch(() => { process.exitCode = 1 }) })
process.on('message', message => {
  const work = async () => {
    const { id, method, value } = message
    try {
      let result
      if (method === 'start') {
        const { directory, project, runtimeOptions = {} } = value
        // A client hub's genesis is signed by the client's machine key; only hand-run hubs may sign their own.
        if (project.role === 'hub' && !project.genesis) throw Object.assign(new Error('Project has no signed genesis'), { code: 'INVALID_GENESIS' })
        const store = new WorkspaceRuntime({ directory, role: project.role, actors: project.initialActors, genesis: project.genesis,
          hubUrl: project.hubUrl, hubWsUrl: project.hubWsUrl, token: project.deviceToken,
          replicaCredentialId: project.replicaCredentialId, replicaToken: project.replicaToken })
        server = new AutomergeSyncServer({ store, apiToken: project.internalToken, env: {}, host: '127.0.0.1', httpPort: 0, wsPort: 0,
          replicaCredentials: { internal: project.internalReplicaToken }, control: await controlOptions(runtimeOptions.control),
          logger: { log() {}, warn() {}, error() {} } })
        await server.start()
        if (project.id && project.id !== store.manifest.workspaceId) throw Object.assign(new Error('Project identity mismatch'), { code: 'WORKSPACE_MISMATCH' })
        result = { workspaceId: store.manifest.workspaceId, httpPort: server.httpPort, wsPort: server.wsPort }
      } else if (method === 'request') {
        // Control routes may wait on several sequential T3 calls (10s each); both stay under the parent's 30s IPC timeout.
        const timeout = value.path.startsWith('/pardner/control') ? 25000 : 15000
        const response = await fetch(`http://127.0.0.1:${server.httpPort}${value.path}`, {
          method: value.body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(timeout),
          headers: { Authorization: `Bearer ${server.apiToken}`, 'Content-Type': 'application/json', ...value.headers },
          ...(value.body === undefined ? {} : { body: JSON.stringify(value.body) }) })
        result = await response.json()
        if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code, details: result.details ?? (result.t3Code ? { t3Code: result.t3Code } : undefined) })
      } else if (method === 'stop') { result = {}; stopping = true; await server?.stop() }
      else throw new Error('Unknown runtime command')
      process.send?.({ id, result })
      if (method === 'stop') process.disconnect?.()
    } catch (error) {
      // Child failures carry string codes only; a fetch timeout is a retryable runtime timeout, not a bare DOMException code.
      const code = typeof error.code === 'string' ? error.code : error.name === 'TimeoutError' ? 'RUNTIME_TIMEOUT' : 'RUNTIME_FAILED'
      process.send?.({ id, error: { code, message: error.message, details: error.details } })
    }
  }
  queue = queue.then(work, work)
})
