import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from './client-service.js'
import { CLIENT_API } from './client-identity.js'
import { atomicWrite } from './atomic-file.js'
import { acquireStorageLease } from './storage-lease.js'
import { requireValue } from './workspace-schema.js'

const STOP_TIMEOUT_MS = 15000
const fail = (code, message) => Object.assign(new Error(message), { code })

async function readConnection(directory) {
  try { return JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Classifies the service named by client-connection.json without changing anything. */
async function probe(directory) {
  const connection = await readConnection(directory)
  if (!connection) return { state: 'absent' }
  let response
  try {
    response = await fetch(`${connection.url}${CLIENT_API}/session`, { headers: { Authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(2000) })
    await response.arrayBuffer()
  } catch { return { state: 'unreachable', connection } }
  if (response.ok) return { state: 'running', connection }
  // A stopping client answers 503; anything else on that port is another process that does not accept this client's token.
  return { state: response.status === 503 ? 'unreachable' : 'foreign', connection }
}

const portInUse = connection => fail('PORT_IN_USE', `${connection.url} is answering but is not this Pardner client; stop that process or start with --http-port`)

/** Asks the running client to shut down, then waits until it has released its storage directory. */
async function stopClient(directory) {
  const current = await probe(directory)
  if (current.state === 'foreign') throw portInUse(current.connection)
  if (current.state !== 'running') return { stopped: false, running: false }
  const response = await fetch(`${current.connection.url}${CLIENT_API}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${current.connection.token}`, 'Content-Type': 'application/json' }, body: '{}' })
  const result = await response.json()
  if (!response.ok) throw fail(result.code, result.error)
  const deadline = Date.now() + STOP_TIMEOUT_MS
  while (Date.now() < deadline) {
    try { (await acquireStorageLease(directory)).close(); return { stopped: true, running: false } } catch (error) {
      if (error.code !== 'STORAGE_IN_USE') throw error
    }
    await delay(100)
  }
  throw fail('CLIENT_STOP_TIMEOUT', `Client service did not release ${directory} within ${STOP_TIMEOUT_MS / 1000}s`)
}

export async function runClientCommand(command, flags) {
  const directory = resolve(flags.data ?? '.pardner-client')
  if (command === 'stop') return stopClient(directory)
  if (command === 'serve') {
    const client = await startClient({ directory, port: flags['http-port'] === undefined ? undefined : Number(flags['http-port']),
      publicUrl: flags['public-url'], gitDirectory: flags.worktree, deviceName: flags['device-name'],
      setupAgent: { harnessId: flags.harness, name: flags.name, model: flags.model, managedBy: flags['managed-by'] } })
    const stop = async () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); await client.stop() }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    return { serving: true, mode: 'client', localUrl: `${client.url}/pardner/` }
  }
  const connection = await readConnection(directory)
  requireValue(connection, 'Start the client with pardner client serve', 'CLIENT_NOT_RUNNING')
  const api = async (path, body, token = connection.token) => {
    const response = await fetch(`${connection.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code })
    return result
  }
  const operationId = flags['operation-id'] ?? randomUUID()
  if (command === 'status' || command === 'list') return api('/session')
  if (command === 'identity') return api('/identity', { name: flags.name, email: flags.email, operationId })
  if (command === 'create') return api('/projects', { name: flags.name, operationId })
  if (command === 'join') {
    requireValue(flags['invitation-file'], 'Supply --invitation-file with private invitation data')
    const agent = Object.fromEntries([['harnessId', flags.harness], ['name', flags.name], ['model', flags.model], ['managedBy', flags['managed-by']]].filter(([, value]) => value !== undefined))
    return api('/join', { invitation: (await readFile(flags['invitation-file'], 'utf8')).trim(), operationId,
      ...(Object.keys(agent).length ? { agent } : {}) })
  }
  if (command === 'open') {
    const { url } = await api('/open', {})
    if (flags['output-file']) await atomicWrite(resolve(flags['output-file']), url)
    else {
      const launcher = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open'
      requireValue(launcher, 'Use --output-file to store a private browser launch URL on this platform', 'LAUNCH_UNAVAILABLE')
      await new Promise((resolve, reject) => {
        const child = spawn(launcher, [url], { stdio: 'ignore' })
        child.once('error', () => reject(Object.assign(new Error('Browser launcher unavailable; retry open with --output-file'), { code: 'LAUNCH_UNAVAILABLE' })))
        child.once('exit', code => code === 0 ? resolve() : reject(Object.assign(new Error('Browser launch failed; retry client open'), { code: 'LAUNCH_UNAVAILABLE' })))
      })
    }
    return { localUrl: `${connection.url}/pardner/`, launchIssued: true }
  }
  requireValue(flags.project, 'Supply --project')
  const base = `/projects/${encodeURIComponent(flags.project)}`
  if (command === 'show') return api(base)
  if (command === 'revoke') {
    requireValue(flags.kind && flags.id, 'Supply --kind device|agent|member and --id')
    return api(`${base}/revoke`, { kind: flags.kind, id: flags.id, operationId })
  }
  if (command === 'export') {
    requireValue(flags['output-file'], 'Supply --output-file for the private content export')
    const result = await api(`${base}/export`)
    await atomicWrite(resolve(flags['output-file']), JSON.stringify(result, null, 2))
    return { projectId: result.workspaceId, format: result.format, savedLocally: result.savedLocally,
      exportFile: resolve(flags['output-file']) }
  }
  if (command === 'invite') {
    requireValue(flags['output-file'], 'Supply --output-file to store the private invitation')
    const result = await api(`${base}/invites`, { purpose: flags.purpose, operationId })
    await atomicWrite(resolve(flags['output-file']), result.setupPrompt ?? result.invitation)
    return { invite: result.invite, invitationFile: resolve(flags['output-file']) }
  }
  if (command === 'agent-grant') {
    requireValue(flags['output-file'], 'Supply --output-file to store the private agent credential')
    const result = await api(`${base}/agent-grant`, { ...(flags.harness ? { harnessId: flags.harness } : {}) })
    await atomicWrite(resolve(flags['output-file']), JSON.stringify({ ...result, apiBase: `${connection.url}${CLIENT_API}${base}/api` }))
    return { actorId: result.actorId, projectId: result.projectId, credentialFile: resolve(flags['output-file']) }
  }
  if (command === 'operation') {
    const grant = await api(`${base}/agent-grant`, { ...(flags.harness ? { harnessId: flags.harness } : {}) })
    const request = JSON.parse(flags.request ?? '{}')
    return api(`${base}/api/automerge/operations`, { ...request, operationId: request.operationId ?? operationId }, grant.token)
  }
  requireValue(false, 'Use client serve, open, stop, status, identity, create, list, show, join, invite, revoke, export, agent-grant or operation')
}
