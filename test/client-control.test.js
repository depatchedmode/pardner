import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { startClient } from '../lib/client-service.js'
import { hash } from '../lib/client-identity.js'
import { FakeT3 } from '../support/fake-t3-server.js'
import { eventually } from '../support/client-workspace.js'

const CLIENT_API = '/pardner/client/v1'

// One client hosting one project, with a human browser session, an enrolled agent credential and the operator token.
async function controlClient(t, runtimeOptions) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-client-control-'))
  const client = await startClient({ directory, port: 0, gitDirectory: directory, runtimeOptions })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const operator = client.registry.read().operatorToken
  const call = async (path, body, { token = operator, status = 200 } = {}) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  await call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
  const { project } = await call('/projects', { name: 'Control', operationId: 'create' })
  const runtime = await client.runtime(client.project(project.id))
  await runtime.request('/automerge/operations', { operationId: 'register-builder', actorId: project.actorId, type: 'actor.register',
    payload: { id: 'builder', handle: 'builder', kind: 'agent' } })
  // An agent enrolled on this device, as an Agent invitation would leave it.
  const state = client.registry.read()
  client.registry.update(next => {
    next.projects[client.project(project.id).key].people.builder = { id: 'builder', handle: 'builder', kind: 'agent', harnessId: 'codex',
      humanId: state.identity.id, devices: [{ id: state.device.id, name: state.device.name }] }
  })
  const agent = client.auth.agentGrant(project.id, 'builder', state.device.id)
  const human = client.auth.exchange(client.auth.browserGrant(client.url), client.url)
  const control = `/projects/${project.id}/api/pardner/control`
  return { client, project, call, operator, agent, human, control, runtime }
}

test('control is offered to people on this computer and refused to agent credentials', { timeout: 30000 }, async t => {
  const { project, call, agent, human, control } = await controlClient(t)
  assert.equal((await call(`/projects/${project.id}`)).project.controlAvailable, true)
  assert.equal((await call(`/projects/${project.id}`, undefined, { token: human })).project.controlAvailable, true)
  assert.equal((await call(`/projects/${project.id}`, undefined, { token: agent })).project.controlAvailable, false)

  const view = await call(control, undefined, { token: human })
  assert.equal(view.enabled, true)
  assert.equal(view.credential.status, 'missing')

  for (const [path, body] of [[control, undefined], [`${control}/poll`, {}], [`${control}/projects`, { id: 'p', name: 'P' }]]) {
    const refused = await call(path, body, { token: agent, status: 403 })
    assert.equal(refused.code, 'FORBIDDEN')
  }
})

test('control accepts only the real control routes', { timeout: 30000 }, async t => {
  const { call, human, control } = await controlClient(t)
  for (const [path, body] of [[`${control}/poll`, undefined], [`${control}/sessions/delete`, {}], [`${control}/../access`, {}],
    [`${control}x`, {}], [`${control}/executions?actor=x`, {}]]) {
    const refused = await call(path, body, { token: human, status: 403 })
    assert.match(refused.code, /FORBIDDEN|ACTOR_MISMATCH/)
  }
  assert.equal((await call(`${control}/poll`, {}, { token: human })).success, true)
})

test('a stored session of any other kind authenticates nothing', { timeout: 30000 }, async t => {
  const { client, project, call } = await controlClient(t)
  // A registry written by an earlier version may still hold such sessions; they reach neither the board nor control.
  const token = 'stale-session-token'
  client.registry.update(state => { state.sessions[hash(token)] = { id: randomUUID(), kind: 'companion', deviceId: randomUUID(), projectIds: [project.id] } })
  for (const path of ['/session', `/projects/${project.id}`, `/projects/${project.id}/api/pardner/control`]) {
    assert.equal((await call(path, undefined, { token, status: 401 })).code, 'AUTH_REQUIRED')
  }
})

test('control binds the requesting Actor to the signed-in person and maps control errors', { timeout: 60000 }, async t => {
  const t3 = await new FakeT3().start()
  t.after(() => t3.stop().catch(() => {}))
  t3.thread('thread-proxy', { title: 'Proxy thread' })
  const { project, call, human, control, runtime } = await controlClient(t, { control: { pollMs: 100 } })
  const me = project.actorId
  const { result: task } = await runtime.request('/automerge/operations', { operationId: randomUUID(), actorId: me, type: 'task.create',
    payload: { title: 'Controlled task' } })

  // Control refusals keep their codes and get the matching HTTP status.
  assert.equal((await call(`${control}/sessions`, { projectId: 'missing', threadId: 'thread-proxy', actorId: 'builder',
    allowedTaskIds: [task.taskId], allowedFromActorIds: [me] }, { token: human, status: 404 })).code, 'NOT_FOUND')

  assert.equal((await call(`${control}/credential`, { origin: t3.origin, pairingCode: t3.issueCode() }, { token: human })).success, true)
  await call(`${control}/projects`, { id: 'proxy', name: 'Proxy' }, { token: human })
  await call(`${control}/sessions`, { projectId: 'proxy', threadId: 'thread-proxy', actorId: 'builder',
    allowedTaskIds: [task.taskId], allowedFromActorIds: [me] }, { token: human })
  assert.equal((await call(`${control}/sessions`, { projectId: 'proxy', threadId: 'thread-proxy', actorId: 'builder',
    allowedTaskIds: [task.taskId], allowedFromActorIds: [me] }, { token: human, status: 409 })).code, 'AMBIGUOUS_ROUTE')

  // Naming another sender is refused, never rewritten.
  const forged = await call(`${control}/executions`, { id: randomUUID(), threadId: 'thread-proxy', actorId: 'builder', taskId: task.taskId,
    fromActorId: 'builder', text: 'Forged' }, { token: human, status: 403 })
  assert.equal(forged.code, 'ACTOR_MISMATCH')
  // An absent sender is the signed-in person.
  const id = randomUUID()
  const dispatched = await call(`${control}/executions`, { id, threadId: 'thread-proxy', actorId: 'builder', taskId: task.taskId, text: 'Do it' }, { token: human })
  assert.equal(dispatched.success, true)
  const execution = await eventually(async () => (await call(control, undefined, { token: human })).executions.find(row => row.id === id))
  assert.equal(execution.intent.fromActorId, me)

  assert.equal((await call(`${control}/executions/verdicts`, { id, kind: 'human', verdict: 'accepted', actorId: 'builder', evidence: 'x' },
    { token: human, status: 403 })).code, 'ACTOR_MISMATCH')
})
