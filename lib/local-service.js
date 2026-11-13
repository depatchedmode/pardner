import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from './workspace-runtime.js'
import { atomicWrite } from './atomic-file.js'
import { requireValue } from './workspace-schema.js'

/** Settings of the retired hand-run hub and replica roles; other machines now join through the client. */
const RETIRED = ['PARDNER_ROLE', 'PARDNER_HUB_URL', 'PARDNER_HUB_WS_URL', 'PARDNER_HUB_TOKEN', 'PARDNER_REPLICA_ID', 'PARDNER_REPLICA_TOKEN', 'PARDNER_REPLICA_CREDENTIALS']
export const STANDALONE_NOTE = 'This is the standalone agent and integration service: one project on this computer, for agents and scripts, '
  + 'with its own data. It serves no other machine. To host a project for others or join one, use the client (pardner open); '
  + 'the client keeps its own projects, so this service’s tasks do not appear there.'

async function readOptional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

export async function startLocalService({ directory, flags = {}, env = process.env }) {
  const retired = RETIRED.filter(name => env[name] !== undefined)
  requireValue(!flags.role && !retired.length, `pardner serve no longer hosts a project for other machines or joins one${retired.length ? ` (${retired.join(', ')} is set)` : ''}. `
    + 'Machines sync only through the client, with their machine keys: run pardner open, then create a project or join one with an invitation.', 'RETIRED_OPTION')
  const saved = await readOptional(join(directory, 'connection.json'))
  const manifest = await readOptional(join(directory, 'workspace.json'))
  requireValue(!manifest.role || manifest.role === 'hub', 'This directory holds a hand-run replica made by an earlier Pardner version and is left unchanged. '
    + 'Join the project through the client instead (pardner open, then an invitation).', 'ROLE_MISMATCH')
  const token = flags.token ?? env.PARDNER_API_TOKEN ?? saved.token ?? randomBytes(32).toString('hex')
  const server = new AutomergeSyncServer({
    store: new WorkspaceRuntime({ directory, role: 'hub' }),
    apiToken: token, env, httpPort: flags['http-port'] ?? env.PARDNER_HTTP_PORT ?? saved.httpPort ?? 8004,
    wsPort: flags['ws-port'] ?? env.PARDNER_WS_PORT ?? saved.wsPort ?? 8005,
    logger: { log: console.error, warn: console.error, error: console.error },
  })
  try {
    await server.start()
    const host = ['0.0.0.0', '::'].includes(server.host) ? '127.0.0.1' : server.host
    const connection = { httpUrl: `http://${host}:${server.httpPort}`, wsUrl: `ws://${host}:${server.wsPort}`,
      httpPort: server.httpPort, wsPort: server.wsPort, token }
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
    return { serving: true, mode: 'standalone', workspaceId: server.store.manifest.workspaceId,
      httpUrl: connection.httpUrl, wsUrl: connection.wsUrl, note: STANDALONE_NOTE }
  } catch (error) {
    await server.stop().catch(() => {})
    throw error
  }
}
