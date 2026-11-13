import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import { startClient } from '../lib/client-service.js'
import { joinApproved } from '../support/enrollment.js'
import { sameComputerRoute } from '../support/client-workspace.js'

const base = '/pardner/client/v1'

async function request(url, path, body, headers = {}, expected = 200) {
  const response = await fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value = await response.json()
  assert.equal(response.status, expected, `${path}: ${value.code ?? 'unexpected response'}`)
  return { value, response }
}

async function browserSession(client, directory) {
  const { token } = JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8'))
  const { value: opened } = await request(client.url, base + '/open', {}, { Authorization: `Bearer ${token}` })
  const grant = new URLSearchParams(new URL(opened.url).hash.slice(1)).get('grant')
  assert.ok(grant, 'Operator open supplies a private browser grant')
  const { response } = await request(client.url, base + '/bootstrap', { grant }, { Origin: client.url })
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  await request(client.url, base + '/bootstrap', { grant }, { Origin: client.url }, 401)
  return cookie.split(';')[0]
}

async function eventually(read, predicate, message) {
  const deadline = performance.now() + 10000
  do {
    const value = await read()
    if (predicate(value)) return value
    await delay(50)
  } while (performance.now() < deadline)
  assert.fail(message)
}

it('keeps browser identity, project isolation and saved work through an offline client restart', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-onboarding-flow-'))
  const aliceDirectory = join(root, 'alice'), bobDirectory = join(root, 'bob')
  let alice, bob
  try {
    alice = await startClient({ directory: aliceDirectory, ...await sameComputerRoute(), deviceName: 'Alice laptop',
      setupAgent: { harnessId: 'openai-codex', name: 'Alpha', managedBy: 'T3' } })
    bob = await startClient({ directory: bobDirectory, port: 0, deviceName: 'Bob laptop',
      setupAgent: { harnessId: 'anthropic-claude-code', name: 'Gamma', managedBy: 'T3' } })
    await request(alice.url, base + '/session', undefined, {}, 401)
    const aliceCookie = await browserSession(alice, aliceDirectory)
    const bobCookie = await browserSession(bob, bobDirectory)
    const aliceApi = async (path, body, expected) => (await request(alice.url, path, body,
      { Cookie: aliceCookie, Origin: alice.url }, expected)).value
    const bobApi = async (path, body, expected) => (await request(bob.url, path, body,
      { Cookie: bobCookie, Origin: bob.url }, expected)).value
    const aliceIdentity = await aliceApi(base + '/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'alice-identity' })
    const bobIdentity = await bobApi(base + '/identity', { name: 'Bob', email: 'bob@example.test', operationId: 'bob-identity' })
    assert.notEqual(aliceIdentity.identity.id, bobIdentity.identity.id)
    const { project: shared } = await aliceApi(base + '/projects', { name: 'Shared board', operationId: 'shared-project' })
    const { project: privateProject } = await aliceApi(base + '/projects', { name: 'Second project', operationId: 'second-project' })
    assert.notEqual(shared.id, privateProject.id)
    const invitation = await aliceApi(`${base}/projects/${shared.id}/invites`, { purpose: 'human', operationId: 'invite-bob' })
    assert.ok(invitation.setupPrompt.includes('client v1 CLI'))
    // Bob's browser shows the waiting state and code; Alice's browser opens the request and approves the same code.
    const { project: joined } = await joinApproved({ join: body => bobApi(base + '/join', body), approver: (path, body) => aliceApi(base + path, body),
      invitation: invitation.setupPrompt, operationId: 'bob-join' })
    assert.equal(joined.id, shared.id)
    assert.notEqual(joined.actorId, shared.actorId)
    const again = await bobApi(base + '/join', { invitation: invitation.setupPrompt, operationId: 'bob-join' })
    assert.equal(again.project.id, shared.id)
    const session = await bobApi(base + '/session')
    assert.equal(session.projects.length, 1)
    assert.equal(session.identity.id, bobIdentity.identity.id)
    await bobApi(`${base}/projects/${privateProject.id}`, undefined, 404)

    const operationPath = joined.apiBase + '/automerge/operations'
    const documentPath = joined.apiBase + '/automerge/doc'
    const statusPath = joined.apiBase + '/automerge/status'
    const initialRequest = { operationId: 'before-offline', type: 'task.create', payload: { title: 'Saved before disconnect' } }
    const initial = await bobApi(operationPath, initialRequest)
    assert.equal(initial.savedLocally, true)
    assert.equal(initial.actorId, joined.actorId)
    await eventually(() => aliceApi(documentPath), value => value.doc.tasks[initial.result.taskId], 'Alice receives Bob’s saved task')
    await eventually(() => bobApi(statusPath), status => !status.syncPending, 'Hub acknowledges Bob’s saved heads')
    const secondDoc = await aliceApi(privateProject.apiBase + '/automerge/doc')
    assert.equal(Object.hasOwn(secondDoc.doc.tasks, initial.result.taskId), false)
    const mismatched = await aliceApi(privateProject.apiBase + '/automerge/operations',
      { ...initialRequest, projectId: shared.id }, 403)
    assert.equal(mismatched.code, 'PROJECT_MISMATCH')

    const oldSession = await bobApi(`${base}/projects/${shared.id}/sessions`, { kind: 'browser' })
    await bobApi(`${base}/projects/${shared.id}/sessions/${oldSession.sessionId}/report`,
      { seq: 0, active: true, focusTaskIds: [initial.result.taskId] })
    const online = await aliceApi(`${base}/projects/${shared.id}/presence`)
    assert.equal(online.actors.find(actor => actor.actorId === joined.actorId).state, 'active')

    await bob.stop(); bob = null
    await alice.stop(); alice = null
    const reopeningAt = performance.now()
    bob = await startClient({ directory: bobDirectory })
    assert.ok(performance.now() - reopeningAt < 6000, 'Enrolled client opens offline within six seconds')
    const reopened = await bobApi(base + '/session')
    assert.equal(reopened.identity.id, bobIdentity.identity.id, 'Remembered browser cookie retains the same human')
    assert.equal(reopened.projects[0].id, shared.id)
    assert.equal(reopened.projects[0].actorId, joined.actorId)
    const offlinePresence = await bobApi(`${base}/projects/${shared.id}/presence`)
    assert.equal(offlinePresence.available, false)
    assert.deepEqual(offlinePresence.actors, [])
    const offlineRequest = { operationId: 'offline-task', type: 'task.create', payload: { title: 'Saved while disconnected' } }
    const offline = await bobApi(operationPath, offlineRequest)
    assert.equal(offline.savedLocally, true)
    assert.equal(offline.syncPending, true)
    assert.equal(offline.actorId, joined.actorId)
    await bob.stop(); bob = null
    bob = await startClient({ directory: bobDirectory })
    const replay = await bobApi(operationPath, offlineRequest)
    assert.equal(replay.replayed, true)
    assert.equal(replay.result.taskId, offline.result.taskId)
    const offlineDoc = await bobApi(documentPath)
    assert.ok(offlineDoc.doc.tasks[initial.result.taskId])
    assert.ok(offlineDoc.doc.tasks[offline.result.taskId])

    alice = await startClient({ directory: aliceDirectory })
    await eventually(() => aliceApi(documentPath), value => value.doc.tasks[offline.result.taskId], 'Reconnected Alice receives the offline task')
    await eventually(() => bobApi(statusPath), status => !status.syncPending, 'Reconnected hub acknowledges saved offline work')
    const context = await aliceApi(`${shared.apiBase}/automerge/task/${offline.result.taskId}/context`)
    assert.equal(context.task.title, 'Saved while disconnected')
    const staleSession = await bobApi(`${base}/projects/${shared.id}/sessions/${oldSession.sessionId}/report`,
      { seq: 1, active: true, focusTaskIds: [initial.result.taskId] }, 410)
    assert.equal(staleSession.code, 'SESSION_EXPIRED')
    const finalSession = await aliceApi(base + '/session')
    assert.equal(finalSession.projects.length, 2)
    assert.equal(finalSession.identity.id, aliceIdentity.identity.id)
    assert.equal(Object.hasOwn((await aliceApi(privateProject.apiBase + '/automerge/doc')).doc.tasks, offline.result.taskId), false)
  } finally {
    const results = await Promise.allSettled([bob?.stop(), alice?.stop()])
    const failed = results.find(result => result.status === 'rejected')
    if (failed) throw failed.reason
    await rm(root, { recursive: true, force: true })
  }
})
