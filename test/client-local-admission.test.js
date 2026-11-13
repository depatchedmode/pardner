import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startClient } from '../lib/client-service.js'
import { joinApproved } from '../support/enrollment.js'
import { sameComputerRoute } from '../support/client-workspace.js'

// Before a write, a client checks its own machine's membership in its record store (item 5 of #199): no `/policy`
// call and no cache, so a write never waits on the hub and an enrolled member keeps saving through an outage.

async function participant(root, name) {
  const directory = join(root, name.toLowerCase())
  // An explicit loopback route: the Human invitations here are used by another client on this computer (#162).
  const client = await startClient({ directory, ...await sameComputerRoute(), deviceName: `${name} laptop`, gitDirectory: root })
  const token = client.registry.read().operatorToken
  const request = async (path, body) => {
    const response = await fetch(`${client.url}/pardner/client/v1${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, result: await response.json() }
  }
  const call = async (path, body) => {
    const { status, result } = await request(path, body)
    assert.equal(status, 200, `${name} ${path}: ${JSON.stringify(result)}`)
    return result
  }
  await call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { client, call, request }
}

test('an enrolled member writes and gets an agent grant with no hub and no hub request', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-local-admission-'))
  const seen = []
  const recorder = createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.writeHead(503).end() })
  await new Promise(resolve => recorder.listen(0, '127.0.0.1', resolve))
  let alice, bob
  try {
    alice = await participant(root, 'Alice')
    bob = await participant(root, 'Bob')
    const { project } = await alice.call('/projects', { name: 'Offline writes', operationId: 'create' })
    const { invitation } = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
    await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation, operationId: 'join' })
    await alice.client.stop(); alice = null
    // Whatever Bob's client would ask the hub now reaches only this recorder.
    const key = Object.values(bob.client.registry.read().projects).find(entry => entry.id === project.id).key
    bob.client.registry.update(state => { state.projects[key].hubUrl = `http://127.0.0.1:${recorder.address().port}/replica` })
    let remote = 0
    const send = bob.client.remote.bind(bob.client)
    bob.client.remote = (...args) => { remote++; return send(...args) }
    const path = `/projects/${project.id}/api/automerge/operations`
    const started = performance.now()
    const saved = await bob.call(path, { type: 'task.create', operationId: 'offline', payload: { title: 'Saved with no hub' } })
    assert.equal(saved.savedLocally, true)
    assert.equal(saved.syncPending, true)
    assert.ok(performance.now() - started < 2000, 'a write does not wait on an unreachable hub')
    const commented = await bob.call(path, { type: 'comment.add', operationId: 'offline-comment', payload: { taskId: saved.result.taskId, text: 'Still local' } })
    assert.equal(commented.savedLocally, true)
    const grant = await bob.call(`/projects/${project.id}/agent-grant`, {})
    assert.ok(grant.token)
    assert.equal(remote, 0, 'no write or grant asked the hub')
    assert.deepEqual(seen, [], 'no /policy or other request left the machine')
  } finally {
    await bob?.client.stop()
    await alice?.client.stop()
    await new Promise(resolve => recorder.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
})

test('a write is refused locally once the hub has refused this machine as removed, and stays refused after a restart', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-local-removal-'))
  let alice, bob
  try {
    alice = await participant(root, 'Alice')
    bob = await participant(root, 'Bob')
    const { project } = await alice.call('/projects', { name: 'Local removal', operationId: 'create' })
    const { invitation } = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
    await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation, operationId: 'join' })
    await alice.call(`/projects/${project.id}/revoke`, { kind: 'machine', id: bob.client.registry.machineKey.machineId, operationId: 'remove-bob' })
    const path = `/projects/${project.id}/api/automerge/operations`
    const deadline = Date.now() + 15000
    let refused
    for (let attempt = 0; !refused; attempt++) {
      const { status, result } = await bob.request(path, { type: 'task.create', operationId: `attempt-${attempt}`, payload: { title: 'After removal' } })
      if (status === 403) refused = result
      else { assert.ok(Date.now() < deadline, 'the removed machine kept writing'); await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    assert.equal(refused.code, 'REVOKED')
    await alice.client.stop(); alice = null
    const directory = bob.client.registry.directory
    await bob.client.stop()
    bob = { ...bob, client: await startClient({ directory, port: 0 }) }
    const token = bob.client.registry.read().operatorToken
    const after = await fetch(`${bob.client.url}/pardner/client/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task.create', operationId: 'after-restart', payload: { title: 'Still refused' } }) })
    assert.equal(after.status, 403)
  } finally {
    await bob?.client.stop()
    await alice?.client.stop()
    await rm(root, { recursive: true, force: true })
  }
})
