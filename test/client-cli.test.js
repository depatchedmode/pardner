import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startClient } from '../lib/client-service.js'
import { invitationData } from '../lib/client-invites.js'
import { acquireStorageLease } from '../lib/storage-lease.js'

const execute = promisify(execFile)
const pardner = async (args, env = {}) => {
  const { stdout } = await execute(process.execPath, ['bin/pardner.js', ...args], { cwd: process.cwd(), env: { ...process.env, ...env } })
  const value = JSON.parse(stdout); assert.equal(value.success, true); return value
}
const pardnerFailure = async (args, env = {}) => {
  const error = await execute(process.execPath, ['bin/pardner.js', ...args], { cwd: process.cwd(), env: { ...process.env, ...env } }).then(() => null, error => error)
  assert.ok(error, `Expected pardner ${args.join(' ')} to fail`)
  return JSON.parse(error.stdout).error
}
const connectionOf = async directory => JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8'))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
// Spawned client services are detached, so every test stops them even when an assertion fails.
async function stopSpawned(directory, env = {}) {
  try { await pardner(['client', 'stop', '--data', directory], env) } catch {
    try { const { pid } = await connectionOf(directory); if (pid !== process.pid) process.kill(pid, 'SIGTERM') } catch { /* nothing was started */ }
  }
}
test('CLI performs real identity/create/agent save and writes private launch/invite material only to files', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-client-'))
  let client
  try {
    client = await startClient({ directory, port: 0, setupAgent: { model: 'reported-codex-model', managedBy: 'T3' } })
    const run = async args => {
      const { stdout } = await execute(process.execPath, ['bin/pardner.js', 'client', ...args, '--data', directory], { cwd: process.cwd() })
      const value = JSON.parse(stdout); assert.equal(value.success, true); return { value, stdout }
    }
    await run(['identity', '--name', 'Alice', '--email', 'alice@example.test', '--operation-id', 'identity'])
    const { value: { project } } = await run(['create', '--name', 'CLI board', '--operation-id', 'create'])
    const request = { type: 'task.create', operationId: 'task', payload: { title: 'Agent-authored CLI task' } }
    const { value: saved } = await run(['operation', '--project', project.id, '--request', JSON.stringify(request)])
    assert.equal(saved.savedLocally, true); assert.notEqual(saved.actorId, project.actorId)
    const { value: replay } = await run(['operation', '--project', project.id, '--request', JSON.stringify(request)])
    assert.equal(replay.replayed, true)
    const grantFile = join(directory, 'agent.json')
    const grantOutput = await run(['agent-grant', '--project', project.id, '--output-file', grantFile])
    const grant = JSON.parse(await readFile(grantFile, 'utf8'))
    assert.equal(grant.harnessId, 'openai-codex')
    assert.equal(grant.model, 'reported-codex-model')
    assert.equal(grant.managedBy, 'T3')
    assert.ok(!grantOutput.stdout.includes(grant.token))
    assert.equal((await stat(grantFile)).mode & 0o777, 0o600)
    const output = join(directory, 'invite.txt')
    const { stdout } = await run(['invite', '--project', project.id, '--purpose', 'human', '--operation-id', 'invite', '--output-file', output])
    const invitation = await readFile(output, 'utf8')
    assert.equal(invitationData(invitation).projectId, project.id)
    assert.ok(!stdout.includes(invitation)); assert.equal((await stat(output)).mode & 0o777, 0o600)
    const launch = join(directory, 'launch.txt')
    const opened = await run(['open', '--output-file', launch])
    assert.ok((await readFile(launch, 'utf8')).includes('#grant=')); assert.ok(!opened.stdout.includes('#grant='))
    const status = await run(['status'])
    assert.ok(!status.stdout.includes(client.registry.read().operatorToken))
    assert.ok(!status.stdout.includes(client.project(project.id).internalToken))
  } finally { await client?.stop(); await rm(directory, { recursive: true, force: true }) }
})

test('explicit public gateway produces HTTPS invitations while browser origin stays local', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-gateway-'))
  let client
  try {
    client = await startClient({ directory, port: 0, publicUrl: 'https://pardner.example.test' })
    const api = async (path, body) => {
      const response = await fetch(`${client.url}/pardner/client/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${client.registry.read().operatorToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.status, 200); return response.json()
    }
    await api('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    const { project } = await api('/projects', { name: 'Public gateway', operationId: 'create' })
    const { invitation } = await api(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
    assert.equal(invitationData(invitation).endpoint, 'https://pardner.example.test/pardner/client/v1/enroll')
    assert.match(client.url, /^http:\/\/127.0.0.1:/)
    const config = await fetch(`${client.url}/pardner/config`)
    assert.equal(config.headers.get('content-security-policy'), "frame-ancestors 'none'")
    const wrongHost = await new Promise((resolve, reject) => {
      const request = httpRequest(`${client.url}/pardner/config`, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject); request.end()
    })
    assert.equal(wrongHost, 403)
  } finally { await client?.stop(); await rm(directory, { recursive: true, force: true }) }
})

test('programmatic client started from Node input-type mode launches isolated file-based runtimes', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-inline-client-'))
  try {
    const source = `
      import { startClient } from './lib/client-service.js';
      const client = await startClient({ directory: process.argv[1], port: 0 });
      try {
        const call = async (path, body) => {
          const response = await fetch(client.url + '/pardner/client/v1' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + client.registry.read().operatorToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!response.ok) throw Error('Client request failed: ' + response.status);
          return response.json();
        };
        await call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' });
        const result = await call('/projects', { name: 'Inline', operationId: 'create' });
        console.log(JSON.stringify({ savedLocally: result.project.status.savedLocally }));
      } finally { await client.stop(); }
    `
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', source, directory])
    assert.equal(JSON.parse(stdout).savedLocally, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('client shutdown accepts only the operator token, never a browser session', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-shutdown-'))
  let client
  try {
    client = await startClient({ directory, port: 0 })
    const operator = { Authorization: `Bearer ${client.registry.read().operatorToken}`, 'Content-Type': 'application/json' }
    const call = (path, headers) => fetch(`${client.url}/pardner/client/v1${path}`, { method: 'POST', headers, body: '{}' })
    const { url } = await (await call('/open', operator)).json()
    const bootstrap = await fetch(`${client.url}/pardner/client/v1/bootstrap`, { method: 'POST',
      headers: { Origin: client.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ grant: new URL(url).hash.slice('#grant='.length) }) })
    assert.equal(bootstrap.status, 200)
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
    const human = await call('/shutdown', { Cookie: cookie, Origin: client.url, 'Content-Type': 'application/json' })
    assert.equal(human.status, 403); assert.equal((await human.json()).code, 'FORBIDDEN')
    assert.equal((await call('/shutdown', { 'Content-Type': 'application/json', Origin: client.url })).status, 401)
    assert.equal(client.stopping, undefined)
    const stopped = await call('/shutdown', operator)
    assert.deepEqual(await stopped.json(), { stopping: true })
    await client.stopPromise
  } finally { await client?.stop(); await rm(directory, { recursive: true, force: true }) }
})
