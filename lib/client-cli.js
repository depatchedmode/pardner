import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { startClient } from './client-service.js'
import { CLIENT_API } from './client-identity.js'
import { atomicWrite } from './atomic-file.js'
import { requireValue } from './workspace-schema.js'

export async function runClientCommand(command, flags) {
  const directory = resolve(flags.data ?? '.pardner-client')
  if (command === 'serve') {
    const client = await startClient({ directory, port: flags['http-port'] === undefined ? undefined : Number(flags['http-port']),
      publicUrl: flags['public-url'], gitDirectory: flags.worktree, deviceName: flags['device-name'],
      setupAgent: { harnessId: flags.harness, name: flags.name, model: flags.model, managedBy: flags['managed-by'] } })
    const stop = async () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); await client.stop() }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    return { serving: true, mode: 'client', localUrl: `${client.url}/pardner/` }
  }
  const connection = JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8'))
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
  requireValue(false, 'Use client serve, open, identity, create, list, show, join, invite, revoke, export, agent-grant or operation')
}
