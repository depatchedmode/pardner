import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from './workspace-runtime.js'
import { atomicWrite } from './atomic-file.js'

async function readOptional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

export async function startLocalService({ directory, flags = {}, env = process.env }) {
  const saved = await readOptional(join(directory, 'connection.json'))
  const manifest = await readOptional(join(directory, 'workspace.json'))
  const role = flags.role ?? env.PARDNER_ROLE ?? manifest.role ?? 'hub'
  const token = flags.token ?? env.PARDNER_API_TOKEN ?? saved.token ?? randomBytes(32).toString('hex')
  const hubToken = flags['hub-token'] ?? env.PARDNER_HUB_TOKEN ?? saved.hubToken ?? token
  const server = new AutomergeSyncServer({
    store: new WorkspaceRuntime({ directory, role,
      hubUrl: flags.hub ?? env.PARDNER_HUB_URL,
      hubWsUrl: flags['hub-ws'] ?? env.PARDNER_HUB_WS_URL, token: hubToken }),
    apiToken: token, env, httpPort: flags['http-port'] ?? env.PARDNER_HTTP_PORT ?? saved.httpPort ?? 8004,
    wsPort: flags['ws-port'] ?? env.PARDNER_WS_PORT ?? saved.wsPort ?? 8005,
    logger: { log: console.error, warn: console.error, error: console.error },
  })
  try {
    await server.start()
    const host = ['0.0.0.0', '::'].includes(server.host) ? '127.0.0.1' : server.host
    const connection = { httpUrl: `http://${host}:${server.httpPort}`, wsUrl: `ws://${host}:${server.wsPort}`,
      httpPort: server.httpPort, wsPort: server.wsPort, token, ...(role === 'replica' ? { hubToken } : {}) }
    await atomicWrite(join(directory, 'connection.json'), JSON.stringify(connection, null, 2))
    let stopping = false
    const stop = async () => {
      if (stopping) return
      stopping = true
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      try { await server.stop() } catch (error) { console.error(error); process.exitCode = 1 }
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    return { serving: true, role, workspaceId: server.store.manifest.workspaceId,
      httpUrl: connection.httpUrl, wsUrl: connection.wsUrl,
      phoneAccess: server.access.status(server.httpPort, server.wsPort) }
  } catch (error) {
    await server.stop().catch(() => {})
    throw error
  }
}
