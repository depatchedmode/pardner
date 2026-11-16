import test from 'node:test'
import assert from 'node:assert/strict'
import { ADMISSION_CACHE_MS, LocalClient } from '../lib/client-service.js'

const ACTOR = 'actor-bob'
// A replica client whose hub policy calls and runtime status are scripted; nothing listens or forks.
function replicaClient({ hubConnected = true } = {}) {
  const state = { device: { id: 'device', name: 'Bob laptop' }, projects: { key: { key: 'key', id: 'project', role: 'replica', state: 'ready',
    hubUrl: 'http://127.0.0.1:9/replica/project', deviceToken: 'device-token', actorId: ACTOR, people: { [ACTOR]: { id: ACTOR, kind: 'human' } } } } }
  const registry = { read: () => state, update: change => change(state) }
  const client = new LocalClient(registry, { gitDirectory: process.cwd() })
  const calls = []
  let answer = () => ({ actorIds: [ACTOR], humanAllowed: true })
  client.policy = async (_project, actor) => { calls.push(actor); return answer() }
  client.runtime = async () => ({ request: async path => { assert.equal(path, '/automerge/status'); return { hubConnected: client.hubIsConnected } } })
  client.hubIsConnected = hubConnected
  const project = () => client.project('project')
  const principal = { kind: 'operator', id: 'operator', deviceId: 'device' }
  return { client, calls, project, principal, answer: next => { answer = next }, settle: () => Promise.allSettled([...client.admissionRefreshes.values()]) }
}

test('a fresh positive admission is reused without waiting on the hub, then refreshed in the background', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { client, calls, project, settle } = replicaClient()
  await client.refreshAdmission(project(), ACTOR)
  assert.deepEqual(calls, [ACTOR])
  let release
  client.policy = async actor => { calls.push(actor); await new Promise(resolve => { release = resolve }); return { actorIds: [ACTOR] } }
  await client.refreshAdmission(project(), ACTOR)
  await client.refreshAdmission(project(), ACTOR)
  assert.equal(calls.length, 2, 'a cache hit starts at most one background refresh and does not wait for it')
  release()
  await settle()
})

test('an expired admission is checked again before the write', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { client, calls, project, settle } = replicaClient()
  await client.refreshAdmission(project(), ACTOR)
  await settle()
  t.mock.timers.tick(ADMISSION_CACHE_MS + 1)
  let waited = false
  client.policy = async actor => { calls.push(actor); await Promise.resolve(); waited = true; return { actorIds: [ACTOR] } }
  await client.refreshAdmission(project(), ACTOR)
  assert.equal(calls.length, 2)
  assert.equal(waited, true, 'the expired check completed before the write continued')
})

test('a revocation observed by a background refresh refuses the next write', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { client, project, principal, answer, settle } = replicaClient()
  await client.refreshAdmission(project(), ACTOR)
  answer(() => ({ actorIds: [], humanAllowed: true }))
  await client.refreshAdmission(project(), ACTOR)
  await settle()
  assert.throws(() => client.binding(project(), principal), { code: 'REVOKED' })
  await assert.rejects(client.refreshAdmission(project(), ACTOR), { code: 'ACTOR_REVOKED' })
})

test('a forced check skips the cache, and a revoked device revokes the project', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { client, calls, project, principal, answer, settle } = replicaClient()
  await client.refreshAdmission(project(), ACTOR)
  answer(() => { throw Object.assign(new Error('Device is not admitted'), { code: 'AUTH_REQUIRED' }) })
  await assert.rejects(client.refreshAdmission(project(), ACTOR, { fresh: true }), { code: 'REVOKED' })
  assert.equal(calls.length, 2)
  assert.throws(() => client.binding(project(), principal), { code: 'REVOKED' })
  await settle()
})

test('with the hub disconnected an expired admission stands without a hub call, so saves do not stall', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  const { client, calls, project, settle } = replicaClient()
  await client.refreshAdmission(project(), ACTOR)
  t.mock.timers.tick(ADMISSION_CACHE_MS + 1)
  client.hubIsConnected = false
  // A hub that never answers would hold the write until the 3 s timeout if it were asked.
  client.policy = actor => { calls.push(actor); return new Promise(() => {}) }
  await client.refreshAdmission(project(), ACTOR)
  assert.equal(calls.length, 1)
  // A cache hit while the hub hangs returns at once; its background refresh is left pending.
  client.hubIsConnected = true
  client.admissions.set(`key:${ACTOR}`, { at: Date.now() })
  await client.refreshAdmission(project(), ACTOR)
  assert.equal(calls.length, 2)
  client.admissionRefreshes.clear()
  await settle()
})

test('without any earlier admission the hub is still asked, and an outage still allows the local save', async () => {
  const { client, calls, project, answer } = replicaClient({ hubConnected: false })
  answer(() => { throw Object.assign(new Error('unavailable'), { code: 'HUB_UNAVAILABLE' }) })
  await client.refreshAdmission(project(), ACTOR)
  assert.equal(calls.length, 1)
  assert.equal(client.admissions.size, 0, 'an outage is not a positive admission')
})
