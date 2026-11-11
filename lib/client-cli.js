import { closeSync, constants, openSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from './client-service.js'
import { CLIENT_API } from './client-identity.js'
import { atomicWrite } from './atomic-file.js'
import { ensurePrivateDirectory } from './private-state.js'
import { acquireStorageLease } from './storage-lease.js'
import { requireValue } from './workspace-schema.js'

const SERVE_FLAGS = ['http-port', 'public-url', 'worktree', 'device-name', 'harness', 'name', 'model', 'managed-by']
const START_TIMEOUT_MS = 15000
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

/** The child's own JSON failure line names the reason (STORAGE_IN_USE, PORT_IN_USE…); runtime warnings may follow it. */
async function startFailure(path, offset, exited) {
  const lines = (await readFile(path)).subarray(offset).toString('utf8').split('\n').map(line => line.trim()).filter(Boolean)
  for (const line of lines.toReversed()) {
    try {
      const { success, error } = JSON.parse(line)
      if (success === false && error?.code) return fail(error.code, error.message)
    } catch { /* not the result line */ }
  }
  return fail('CLIENT_START_FAILED', `Client service exited (${exited.signal ?? exited.code}): ${lines.at(-1) ?? 'no output'}; see ${path}`)
}

/** Returns the connection of a running client for this directory, starting a detached `client serve` when none answers. */
async function ensureRunning(directory, flags) {
  const first = await probe(directory)
  if (first.state === 'running') return first.connection
  if (first.state === 'foreign') throw portInUse(first.connection)
  ensurePrivateDirectory(directory)
  const logPath = join(directory, 'client.log')
  const log = openSync(logPath, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
  let child, offset
  try {
    offset = (await readFile(logPath)).length
    const args = [fileURLToPath(new URL('../bin/pardner.js', import.meta.url)), 'client', 'serve', '--data', directory,
      ...SERVE_FLAGS.flatMap(flag => flags[flag] === undefined ? [] : [`--${flag}`, flags[flag]])]
    child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', log, log] })
  } finally { closeSync(log) }
  let exited = null
  child.once('exit', (code, signal) => { exited = { code, signal } })
  child.unref()
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    await delay(150)
    if (exited) throw await startFailure(logPath, offset, exited)
    const current = await probe(directory)
    if (current.state === 'running') return current.connection
  }
  throw fail('CLIENT_START_TIMEOUT', `Client service did not answer within ${START_TIMEOUT_MS / 1000}s; see ${logPath}`)
}

/** Asks the running client to shut down, then waits until it has released its storage directory. */
async function stopClient(directory) {
  const current = await probe(directory)
  if (current.state === 'foreign') throw portInUse(current.connection)
  if (current.state !== 'running') return { stopped: false, running: false }
  const response = await fetch(`${current.connection.url}${CLIENT_API}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${current.connection.token}`, 'Content-Type': 'application/json' }, body: '{}' })
  const result = await response.json()
  if (!response.ok) throw fail(result.code, result.error)
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    try { (await acquireStorageLease(directory)).close(); return { stopped: true, running: false } } catch (error) {
      if (error.code !== 'STORAGE_IN_USE') throw error
    }
    await delay(100)
  }
  throw fail('CLIENT_STOP_TIMEOUT', `Client service did not release ${directory} within ${START_TIMEOUT_MS / 1000}s`)
}

export const defaultClientDirectory = () => join(homedir(), '.pardner', 'client')

export async function runClientCommand(command, flags) {
  const directory = resolve(flags.data ?? defaultClientDirectory())
  if (command === 'stop') return stopClient(directory)
  if (command === 'serve') {
    const client = await startClient({ directory, port: flags['http-port'] === undefined ? undefined : Number(flags['http-port']),
      publicUrl: flags['public-url'], gitDirectory: flags.worktree, deviceName: flags['device-name'],
      setupAgent: { harnessId: flags.harness, name: flags.name, model: flags.model, managedBy: flags['managed-by'] } })
    const stop = async () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); await client.stop() }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    return { serving: true, mode: 'client', localUrl: `${client.url}/pardner/` }
  }
  const connection = command === 'open' ? await ensureRunning(directory, flags) : await readConnection(directory)
  requireValue(connection, 'Start Pardner with pardner open or pardner client serve', 'CLIENT_NOT_RUNNING')
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
    const body = { invitation: (await readFile(flags['invitation-file'], 'utf8')).trim(), operationId, ...(Object.keys(agent).length ? { agent } : {}) }
    // A new machine waits for approval. Without --wait this reports the state once; run it again with the same
    // operation ID to continue. With --wait it polls, printing the confirmation code to stderr when it appears.
    const wait = flags.wait === undefined ? 0 : Number(flags.wait)
    requireValue(Number.isFinite(wait) && wait >= 0 && wait <= 3600, '--wait takes a number of seconds up to 3600')
    const deadline = Date.now() + wait * 1000
    let shown = null
    for (;;) {
      const result = await api('/join', body)
      if (result.project || Date.now() >= deadline) return result
      if (result.join.code && result.join.code !== shown) {
        shown = result.join.code
        process.stderr.write(`Confirmation code: ${shown}. Compare it with the person approving this request.\n`)
      }
      await delay(500)
    }
  }
  if (command === 'open') {
    const { url } = await api('/open', {})
    const outputFile = flags['output-file'] && resolve(flags['output-file'])
    if (outputFile) await atomicWrite(outputFile, url)
    else {
      const launcher = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open'
      requireValue(launcher, 'Use --output-file to store a private browser launch URL on this platform', 'LAUNCH_UNAVAILABLE')
      await new Promise((resolve, reject) => {
        const child = spawn(launcher, [url], { stdio: 'ignore' })
        child.once('error', () => reject(Object.assign(new Error('Browser launcher unavailable; retry open with --output-file'), { code: 'LAUNCH_UNAVAILABLE' })))
        child.once('exit', code => code === 0 ? resolve() : reject(Object.assign(new Error('Browser launch failed; run pardner open --output-file FILE and open that address in your browser within 60 seconds'), { code: 'LAUNCH_UNAVAILABLE' })))
      })
    }
    // The launch grant expires 60 seconds after it is issued (ClientAuth.browserGrant).
    return { localUrl: `${connection.url}/pardner/`, launchIssued: true,
      ...(outputFile ? { outputFile, expiresInSeconds: 60 } : {}) }
  }
  requireValue(flags.project, 'Supply --project')
  const base = `/projects/${encodeURIComponent(flags.project)}`
  if (command === 'show') return api(base)
  if (command === 'revoke') {
    requireValue(flags.kind && flags.id, 'Supply --kind member|machine|agent and --id')
    return api(`${base}/revoke`, { kind: flags.kind, id: flags.id, operationId })
  }
  if (command === 'role') {
    requireValue(flags.person && flags.role, 'Supply --person PERSON_ID and --role admin|member')
    return api(`${base}/role`, { personId: flags.person, role: flags.role, operationId })
  }
  if (command === 'requests') {
    // Opening the requests adds this approver's nonce to each, so both screens can show the code.
    const { requests } = await api(`${base}/join-requests`)
    return { requests: await Promise.all(requests.map(async request => request.code ? request
      : (await api(`${base}/join-requests/${encodeURIComponent(request.id)}/code`, {})).request)) }
  }
  if (command === 'approve') {
    requireValue(flags.request && flags.code, 'Supply --request REQUEST_ID and --code with the code the joining machine shows')
    return api(`${base}/join-requests/${encodeURIComponent(flags.request)}/approve`, { code: String(flags.code) })
  }
  if (command === 'reject') {
    requireValue(flags.request, 'Supply --request REQUEST_ID')
    return api(`${base}/join-requests/${encodeURIComponent(flags.request)}/reject`, {})
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
    const result = await api(`${base}/invites`, { purpose: flags.purpose, operationId,
      ...(flags.role ? { role: flags.role } : {}), ...(flags.person ? { personId: flags.person } : {}) })
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
    requireValue(flags.request, 'Supply --request with the operation JSON')
    let request
    try { request = JSON.parse(flags.request) } catch { throw fail('INVALID_ARGUMENT', '--request must be valid JSON') }
    const grant = await api(`${base}/agent-grant`, { ...(flags.harness ? { harnessId: flags.harness } : {}) })
    return api(`${base}/api/automerge/operations`, { ...request, operationId: request.operationId ?? operationId }, grant.token)
  }
  requireValue(false, 'Use client serve, open, stop, status, identity, create, list, show, join, invite, requests, approve, reject, revoke, role, export, agent-grant or operation')
}
