import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from '../lib/client-service.js'
import { CLIENT_API, secret } from '../lib/client-identity.js'
import { invitationData } from '../lib/client-invites.js'
import { agentNameRecord, buildJoinRequest, confirmationCode, OFFER_TTL_MS } from '../lib/enrollment.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { buildRecord } from '../lib/membership.js'
import { joinApproved } from '../support/enrollment.js'
import { forge } from '../support/trust-records.js'
import { sameComputerRoute } from '../support/client-workspace.js'
import { handshakeSocket, signedRequest } from '../support/machines.js'
import { createHello } from '../lib/machine-handshake.js'

// Scenarios for invitations, pairing, removal and re-admission on signed records
// (docs/PARDNER-TRUST-DESIGN.md, sections 2, 4 and 5). Every client is a real
// local client service; the first one created in a test hosts the project (the hub).

async function participant(t, name, { identity = true, ...options } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-trust-'))
  // An explicit loopback route: the Human and My device invitations here are used by another client on this computer (#162).
  const route = options.port === undefined ? await sameComputerRoute() : {}
  const client = await startClient({ directory, ...route, deviceName: `${name} laptop`, gitDirectory: directory, ...options })
  t.after(async () => { await client.stop(); await rm(directory, { recursive: true, force: true }) })
  const request = async (path, body) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.registry.read().operatorToken}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, result: await response.json() }
  }
  const call = async (path, body) => {
    const { status, result } = await request(path, body)
    assert.equal(status, 200, `${name} ${path}: ${JSON.stringify(result)}`)
    return result
  }
  const fail = async (path, body) => {
    const { status, result } = await request(path, body)
    assert.notEqual(status, 200, `${name} ${path} unexpectedly succeeded`)
    return { status, code: result.code, error: result.error }
  }
  if (identity) await call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { name, client, call, fail, directory, get machineId() { return client.registry.machineKey.machineId }, get personId() { return client.registry.read().identity?.id } }
}

async function eventually(read, message, timeout = 15000) {
  const end = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > end) assert.fail(message)
    await delay(50)
  }
}

const invite = (issuer, project, purpose, fields = {}) => issuer.call(`/projects/${project.id}/invites`, { purpose, operationId: randomUUID(), ...fields })
const approve = (joiner, approver, invitation, operationId = 'join') =>
  joinApproved({ join: body => joiner.call('/join', body), approver: approver.call, invitation, operationId })
const membership = async (person, project) => (await person.call(`/projects/${project.id}`)).membership
/** A request to the project's hub signed by `person`'s machine key, as its client would send it. */
const signed = (person, project, suffix, body) => signedRequest(person.client.registry.machineKey,
  { projectId: project.id, route: person.client.project(project.id).hubUrl }, suffix, body)
const operation = (person, project, title = 'Work') => person.client.runtime(person.client.project(project.id))
  .then(() => fetch(`${person.client.url}${CLIENT_API}/projects/${project.id}/api/automerge/operations`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${person.client.registry.read().operatorToken}` },
    body: JSON.stringify({ type: 'task.create', operationId: randomUUID(), payload: { title } }) })).then(async response => ({ status: response.status, result: await response.json() }))

/** A join request from a throwaway machine key, as a stranger holding a leaked invitation would send it. */
function strangerRequest(invitation, name = 'Mallory') {
  const { offer, secret: invitationSecret } = invitationData(invitation)
  const key = generateMachineKey(), personId = offer.purpose === 'human' ? personIdFor(key.publicKey) : offer.personId
  const { request, mac } = buildJoinRequest(key, invitationSecret, { offer, personId, identity: { name, email: `${name.toLowerCase()}@example.test` },
    device: { id: randomUUID(), name: `${name} laptop` }, agent: { harnessId: 'openai-codex', name: `${name} agent` } })
  return { key, offer, body: { action: 'request', request, mac, records: [agentNameRecord(key, offer.projectId, personId, { harnessId: 'openai-codex', name: `${name} agent` })], recipientProof: secret() } }
}
async function enroll(hub, body) {
  const response = await fetch(`${hub.client.url}${CLIENT_API}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, result: await response.json() }
}

test('a Human invitation: the joiner waits, both screens show one code, and the approval admits a member', { timeout: 60000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Codes', operationId: 'create' })
  const { invitation } = await invite(alice, project, 'human')
  const waiting = await bob.call('/join', { invitation, operationId: 'join' })
  assert.equal(waiting.join.state, 'waiting')
  assert.equal(waiting.join.code, null, 'no code exists before the approver adds a nonce')
  assert.equal(waiting.join.projectName, 'Codes')
  assert.equal((await bob.call('/session')).projects.length, 0, 'the joiner receives nothing from the project before approval')
  const { requests } = await alice.call(`/projects/${project.id}/join-requests`)
  assert.deepEqual(requests.map(entry => [entry.purpose, entry.role, entry.person.name, entry.person.email, entry.code]), [['human', 'member', 'Bob', 'bob@example.test', null]])
  const { request } = await alice.call(`/projects/${project.id}/join-requests/${requests[0].id}/code`, {})
  assert.match(request.code, /^\d{4} \d{4}$/)
  const confirm = await bob.call('/join', { invitation, operationId: 'join' })
  assert.equal(confirm.join.state, 'confirm')
  assert.equal(confirm.join.code, request.code)
  // Approving with any other code is refused: the approver compares, the client checks.
  const wrong = request.code === '0000 0000' ? '1111 1111' : '0000 0000'
  assert.equal((await alice.fail(`/projects/${project.id}/join-requests/${request.id}/approve`, { code: wrong })).code, 'CODE_MISMATCH')
  await alice.call(`/projects/${project.id}/join-requests/${request.id}/approve`, { code: request.code })
  const { project: joined } = await bob.call('/join', { invitation, operationId: 'join' })
  assert.equal(joined.id, project.id)
  const records = await membership(alice, project)
  const bobPerson = records.people.find(person => person.id === bob.personId)
  assert.equal(bobPerson.role, 'member')
  assert.equal(records.machines.find(machine => machine.id === bob.machineId).personId, bob.personId)
  assert.ok(records.agentNames.some(agent => agent.machineId === bob.machineId), 'the joiner names its setup agent in the same approval')
  assert.equal((await operation(bob, project, 'Bob writes')).result.savedLocally, true)
  // The joiner's own replica reports itself as a member once the records sync.
  await eventually(async () => (await bob.call('/session')).projects[0].memberRole === 'member', 'Bob never saw his own admission record')
})

test('a leaked invitation used by a stranger: the codes differ, the approver rejects, and nothing is served', { timeout: 60000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Leak', operationId: 'create' })
  const { invitation } = await invite(alice, project, 'human')
  const stranger = strangerRequest(invitation)
  const stored = await enroll(alice, stranger.body)
  assert.equal(stored.status, 200); assert.equal(stored.result.state, 'pending')
  const own = await bob.call('/join', { invitation, operationId: 'join' })
  const { requests } = await alice.call(`/projects/${project.id}/join-requests`)
  assert.equal(requests.length, 2, 'two requests on one offer')
  const codes = {}
  for (const entry of requests) codes[entry.id] = (await alice.call(`/projects/${project.id}/join-requests/${entry.id}/code`, {})).request.code
  const bobCode = (await bob.call('/join', { invitation, operationId: 'join' })).join.code
  const strangerId = stored.result.requestId
  assert.equal(codes[own.join.requestId], bobCode)
  assert.notEqual(codes[strangerId], bobCode, 'the stranger’s request shows a different code')
  // The approver tries Bob's code on the stranger's request, which is refused, then rejects it.
  assert.equal((await alice.fail(`/projects/${project.id}/join-requests/${strangerId}/approve`, { code: bobCode })).code, 'CODE_MISMATCH')
  await alice.call(`/projects/${project.id}/join-requests/${strangerId}/reject`, {})
  const status = await enroll(alice, { action: 'status', offerId: stranger.offer.offerId, requestId: strangerId, recipientProof: stranger.body.recipientProof })
  assert.equal(status.result.state, 'rejected')
  assert.equal(status.result.receipt, undefined, 'a rejected request receives no credential')
  assert.ok(Object.values(alice.client.project(project.id).admissions).every(admission => admission.machineId !== stranger.key.machineId))
  assert.equal((await membership(alice, project)).machines.some(machine => machine.id === stranger.key.machineId), false)
  // The invitation stays usable by its intended recipient.
  await alice.call(`/projects/${project.id}/join-requests/${own.join.requestId}/approve`, { code: bobCode })
  assert.equal((await bob.call('/join', { invitation, operationId: 'join' })).project.id, project.id)
})

test('two requests showing one code are both rejected', { timeout: 60000 }, async t => {
  const alice = await participant(t, 'Alice')
  const { project } = await alice.call('/projects', { name: 'Collision', operationId: 'create' })
  const { invitation } = await invite(alice, project, 'human')
  const first = await enroll(alice, strangerRequest(invitation, 'One').body)
  const second = await enroll(alice, strangerRequest(invitation, 'Two').body)
  // Real codes collide with probability 10^-8; this instance forces one shared code.
  alice.client.invites.codeFor = () => '4242 4242'
  await alice.call(`/projects/${project.id}/join-requests/${first.result.requestId}/code`, {})
  const collision = await alice.fail(`/projects/${project.id}/join-requests/${second.result.requestId}/code`, {})
  assert.equal(collision.code, 'CODE_COLLISION')
  const { requests } = await alice.call(`/projects/${project.id}/join-requests`)
  assert.deepEqual(requests, [], 'both requests are rejected')
  const states = Object.values(alice.client.registry.read().invites[invitationData(invitation).id].requests).map(entry => entry.state)
  assert.deepEqual(states, ['rejected', 'rejected'])
})

test('invitations expire and are used once, and one offer holds at most five pending requests', { timeout: 60000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob'), carol = await participant(t, 'Carol')
  const { project } = await alice.call('/projects', { name: 'Bounds', operationId: 'create' })
  const bounded = await invite(alice, project, 'human')
  for (let index = 0; index < 5; index++) assert.equal((await enroll(alice, strangerRequest(bounded.invitation, `S${index}`).body)).status, 200)
  const sixth = await enroll(alice, strangerRequest(bounded.invitation, 'S5').body)
  assert.equal(sixth.status, 429); assert.equal(sixth.result.code, 'TOO_MANY_REQUESTS')

  // Expiry is decided by the hub's clock, when a request arrives and when it is approved.
  const late = await invite(alice, project, 'human')
  const pending = await bob.call('/join', { invitation: late.invitation, operationId: 'late' })
  const { request } = await alice.call(`/projects/${project.id}/join-requests/${pending.join.requestId}/code`, {})
  const real = alice.client.now
  alice.client.now = () => real() + OFFER_TTL_MS + 1000
  try {
    assert.equal((await alice.fail(`/projects/${project.id}/join-requests/${request.id}/approve`, { code: request.code })).code, 'NOT_FOUND', 'an expired request leaves the approver’s list')
    const expired = await bob.fail('/join', { invitation: late.invitation, operationId: 'late' })
    assert.equal(expired.code, 'REQUEST_EXPIRED')
    const refused = await carol.fail('/join', { invitation: late.invitation, operationId: 'too-late' })
    assert.equal(refused.code, 'INVITE_EXPIRED')
  } finally { alice.client.now = real }

  // Single use: once one request is approved, the offer admits nobody else.
  const once = await invite(alice, project, 'human')
  await approve(bob, alice, once.invitation, 'once')
  const reused = await carol.fail('/join', { invitation: once.invitation, operationId: 'reuse' })
  assert.equal(reused.code, 'INVITE_USED')
  assert.equal((await membership(alice, project)).people.length, 2)
})

test('pairing: a person’s own machine or an admin approves, and nobody else can link a machine into that identity', { timeout: 90000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob'), carol = await participant(t, 'Carol')
  const { project } = await alice.call('/projects', { name: 'Pairing', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  await approve(carol, alice, (await invite(alice, project, 'human')).invitation)

  // Bob pairs his desktop from his laptop; the request names whose identity it joins.
  const desktop = await participant(t, 'Bob desktop', { identity: false })
  const own = await invite(bob, project, 'device')
  const waiting = await desktop.call('/join', { invitation: own.invitation, operationId: 'pair' })
  assert.deepEqual(waiting.join.linkingAs, { name: 'Bob', email: 'bob@example.test' })
  // Carol, a member, can neither see nor approve Bob's pairing request.
  assert.deepEqual((await carol.call(`/projects/${project.id}/join-requests`)).requests, [])
  assert.equal((await carol.fail(`/projects/${project.id}/join-requests/${waiting.join.requestId}/code`, {})).code, 'NOT_FOUND')
  await approve(desktop, bob, own.invitation, 'pair')
  const afterOwn = await membership(alice, project)
  assert.equal(afterOwn.machines.find(machine => machine.id === desktop.machineId).personId, bob.personId)
  assert.equal(afterOwn.people.length, 3, 'pairing never creates a second person')

  // Bob loses every machine; the owner pairs a new one for him.
  const replacement = await participant(t, 'Bob replacement', { identity: false })
  const forBob = await invite(alice, project, 'device', { personId: bob.personId })
  await approve(replacement, alice, forBob.invitation, 'pair')
  assert.equal(replacement.personId, bob.personId)
  assert.equal((await membership(alice, project)).machines.find(machine => machine.id === replacement.machineId).personId, bob.personId)

  // Carol may not offer or sign a pairing into Bob's identity.
  const offered = await carol.fail(`/projects/${project.id}/invites`, { purpose: 'device', personId: bob.personId, operationId: 'steal' })
  assert.equal(offered.code, 'FORBIDDEN')
  assert.equal(offered.error, 'Only that person, the owner or an admin can pair a machine into their identity')
  const intruder = generateMachineKey()
  // Signed by Carol's machine, without any consent from the intruder's key.
  const forged = forge(carol.client.registry.machineKey, { v: 2, projectId: project.id, kind: 'machine.add', subject: intruder.machineId,
    personId: bob.personId, publicKey: intruder.publicKey, offer: {}, joinRequest: {}, approval: {} })
  const submitted = await signed(carol, project, '/records', { records: [forged] })
  assert.equal(submitted.status, 403)
  assert.equal(submitted.result.error, 'Admissions enter only through an approved join request')
  // Even past the hub's routes, the gate itself refuses it.
  const runtime = await alice.client.runtime(alice.client.project(project.id))
  await assert.rejects(runtime.request('/automerge/membership/records', { records: [forged] }), { code: 'RECORD_REFUSED' })
  assert.equal((await membership(alice, project)).machines.some(machine => machine.id === intruder.machineId), false)
})

test('roles: a member cannot invite people, an admin offers only the member role, and only the owner changes roles', { timeout: 90000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob'), carol = await participant(t, 'Carol')
  const { project } = await alice.call('/projects', { name: 'Roles', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  assert.equal((await bob.fail(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'member' })).code, 'FORBIDDEN')
  assert.equal((await bob.fail(`/projects/${project.id}/role`, { personId: bob.personId, role: 'admin', operationId: 'self' })).error, 'Only the owner can change roles')
  const promoted = await alice.call(`/projects/${project.id}/role`, { personId: bob.personId, role: 'admin', operationId: 'promote' })
  assert.equal((await membership(alice, project)).people.find(person => person.id === bob.personId).role, 'admin')
  await eventually(async () => (await membership(bob, project)).people.find(person => person.id === bob.personId)?.role === 'admin', 'Bob never saw his promotion')
  const asAdmin = await bob.fail(`/projects/${project.id}/invites`, { purpose: 'human', role: 'admin', operationId: 'admin-offer' })
  assert.equal(asAdmin.code, 'FORBIDDEN'); assert.equal(asAdmin.error, 'An admin can offer only the member role')
  // An admin admits a member: Bob's own machine signs Carol's admission, and the hub records it.
  const offer = await invite(bob, project, 'human', { role: 'member' })
  await approve(carol, bob, offer.invitation)
  const admitted = (await membership(alice, project)).machines.find(machine => machine.id === carol.machineId)
  assert.equal(admitted.personId, carol.personId)
  // The role chain: each change names the one it replaces.
  const demoted = await alice.call(`/projects/${project.id}/role`, { personId: bob.personId, role: 'member', operationId: 'demote' })
  const people = (await membership(alice, project)).people
  assert.equal(people.find(person => person.id === bob.personId).role, 'member')
  assert.equal(people.find(person => person.id === bob.personId).roleRecord, demoted.recordId)
  assert.notEqual(demoted.recordId, promoted.recordId)
  // A demoted admin can no longer admit anyone from the moment the hub holds the demotion.
  const after = await bob.fail(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'after-demotion' })
  assert.equal(after.code, 'FORBIDDEN')
})

test('removal ends sync and API access, a removed machine adds no records, and people an admin admitted stay', { timeout: 90000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob'), carol = await participant(t, 'Carol')
  const { project } = await alice.call('/projects', { name: 'Removal', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  await alice.call(`/projects/${project.id}/role`, { personId: bob.personId, role: 'admin', operationId: 'promote' })
  await approve(carol, bob, (await invite(bob, project, 'human')).invitation)
  const status = person => person.call(`/projects/${project.id}/api/automerge/status`)
  await eventually(async () => (await status(bob)).hubConnected, 'Bob never connected')

  const removed = await alice.call(`/projects/${project.id}/revoke`, { kind: 'member', id: bob.personId, operationId: 'remove-bob' })
  assert.equal(removed.removed, true)
  const records = await membership(alice, project)
  assert.ok(records.removedPeople.includes(bob.personId))
  assert.equal(records.machines.some(machine => machine.id === bob.machineId), false)
  assert.ok(records.people.some(person => person.id === carol.personId), 'Carol, admitted by the removed admin, stays')
  assert.equal(Object.values(alice.client.project(project.id).admissions).find(admission => admission.machineId === bob.machineId).state, 'revoked')
  // The hub refuses Bob's signed requests from the records, closes his sync session and refuses his handshake, so his
  // own client stops his writes; his local data stays.
  const refused = await signed(bob, project, '/membership')
  assert.equal(refused.status, 403); assert.equal(refused.result.code, 'REVOKED')
  await eventually(async () => (await status(bob)).hubConnected === false, 'Bob’s sync session stayed open')
  await eventually(async () => (await status(bob)).hubRefusal?.code === 'REVOKED', 'Bob’s handshake was never refused')
  await eventually(async () => (await operation(bob, project)).result.code === 'REVOKED', 'Bob’s writes were never refused')
  // A removed machine cannot add a record, through the hub's routes or its gate.
  const record = buildRecord(bob.client.registry.machineKey, { projectId: project.id, kind: 'member.remove', subject: carol.personId })
  const submitted = await signed(bob, project, '/records', { records: [record] })
  assert.equal(submitted.status, 403); assert.equal(submitted.result.code, 'REVOKED')
  const runtime = await alice.client.runtime(alice.client.project(project.id))
  await assert.rejects(runtime.request('/automerge/membership/records', { records: [record] }),
    { code: 'RECORD_REFUSED', message: 'The signing machine is not a current member of this project; removed machines cannot add records' })
  assert.ok((await membership(alice, project)).people.some(person => person.id === carol.personId))
  assert.equal((await operation(carol, project, 'Carol still works')).result.savedLocally, true)
})

test('re-admission: a removed machine returns as a new key through pairing, a removed person through a new invitation', { timeout: 120000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Again', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  const desktop = await participant(t, 'Bob desktop', { identity: false })
  await approve(desktop, bob, (await invite(bob, project, 'device')).invitation, 'pair')
  await bob.call(`/projects/${project.id}/revoke`, { kind: 'machine', id: desktop.machineId, operationId: 'remove-desktop' })
  await eventually(async () => (await operation(desktop, project)).result.code === 'REVOKED', 'the removed desktop kept writing')
  // The removed key cannot come back, and is refused before it takes a slot on the invitation.
  const again = await invite(bob, project, 'device')
  const refused = await desktop.fail('/join', { invitation: again.invitation, operationId: 'pair-again' })
  assert.equal(refused.code, 'REVOKED')
  assert.match(refused.error, /fresh client directory/)
  // A fresh directory on the same computer is a new machine, paired like any other.
  const fresh = await participant(t, 'Bob desktop fresh', { identity: false })
  await approve(fresh, bob, again.invitation, 'pair-fresh')
  assert.equal((await membership(alice, project)).machines.find(machine => machine.id === fresh.machineId).personId, bob.personId)

  // A removed person returns only as a new person: the old identity and machine are refused with advice.
  await alice.call(`/projects/${project.id}/revoke`, { kind: 'member', id: bob.personId, operationId: 'remove-bob' })
  const back = await invite(alice, project, 'human')
  const old = await bob.fail('/join', { invitation: back.invitation, operationId: 'back' })
  assert.equal(old.code, 'REVOKED')
  assert.equal(Object.keys(alice.client.registry.read().invites[invitationData(back.invitation).id].requests).length, 0, 'the refused join used no slot')
  const returning = await participant(t, 'Bob')
  await approve(returning, alice, back.invitation, 'back')
  const records = await membership(alice, project)
  assert.notEqual(returning.personId, bob.personId, 're-admission mints a new person ID')
  assert.ok(records.removedPeople.includes(bob.personId))
  assert.deepEqual(records.people.filter(person => person.displayName === 'Bob').map(person => person.id), [returning.personId])
  assert.equal((await operation(returning, project, 'Back again')).result.savedLocally, true)
})

test('an enrolled replica reopens offline after approval and keeps saving locally', { timeout: 90000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Offline', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  await alice.client.stop()
  await bob.client.stop()
  const reopened = await startClient({ directory: bob.directory, port: 0 })
  t.after(() => reopened.stop())
  const response = await fetch(`${reopened.url}${CLIENT_API}/projects/${project.id}/api/automerge/operations`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reopened.registry.read().operatorToken}` },
    body: JSON.stringify({ type: 'task.create', operationId: 'offline', payload: { title: 'Saved with the hub down' } }) })
  const saved = await response.json()
  assert.equal(response.status, 200, JSON.stringify(saved))
  assert.equal(saved.savedLocally, true); assert.equal(saved.syncPending, true)
  const records = await (await reopened.runtime(reopened.project(project.id))).request('/automerge/membership')
  assert.ok(records.machines.some(machine => machine.id === reopened.registry.machineKey.machineId), 'the replica holds its own admission record offline')
})

test('confirmation codes depend on the offer, the joiner’s key and the nonce', () => {
  const offer = { v: 1, projectId: 'a'.repeat(64), offerId: 'offer-identifier-1', signature: 'x' }
  const one = generateMachineKey(), two = generateMachineKey()
  const nonce = secret()
  assert.equal(confirmationCode(offer, one.publicKey, nonce), confirmationCode(offer, one.publicKey, nonce))
  assert.notEqual(confirmationCode(offer, one.publicKey, nonce), confirmationCode(offer, two.publicKey, nonce))
  assert.notEqual(confirmationCode(offer, one.publicKey, nonce), confirmationCode(offer, one.publicKey, secret()))
  assert.notEqual(confirmationCode(offer, one.publicKey, nonce), confirmationCode({ ...offer, offerId: 'offer-identifier-2' }, one.publicKey, nonce))
})

test('the hub’s routes for other machines take no bearer token, serve no stranger and refuse a route they never advertised', { timeout: 60000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Gate', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  const route = bob.client.project(project.id).hubUrl
  // No bearer token is accepted between machines, not even the hub's own operator token.
  for (const suffix of ['/people', '/membership', '/policy', '/automerge/sync-ack']) {
    for (const headers of [{ Authorization: 'Bearer device-token-from-an-earlier-version' }, { Authorization: `Bearer ${alice.client.registry.read().operatorToken}` }, {}]) {
      const response = await fetch(`${route}${suffix}`, { headers })
      assert.equal(response.status, 401, `${suffix} ${JSON.stringify(headers)}`)
      assert.equal((await response.json()).code, 'AUTH_REQUIRED')
    }
  }
  // A machine no record certifies opens no session and no sync socket.
  const stranger = generateMachineKey()
  const refused = await signedRequest(stranger, { projectId: project.id, route }, '/people')
  assert.equal(refused.status, 403); assert.equal(refused.result.code, 'NOT_MEMBER')
  const native = bob.client.project(project.id).hubWsUrl
  await assert.rejects(handshakeSocket(native, { key: stranger, projectId: project.id, records: [] }), { code: 'NOT_MEMBER' })
  // A member's hello naming a route this hub never served (a relay's) is refused.
  const hello = createHello(bob.client.registry.machineKey, { projectId: project.id, route: `https://relay.example/pardner/client/v1/replica/${project.id}`, role: 'replica' })
  const relayed = await fetch(`${route}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hello }) })
  assert.equal(relayed.status, 403); assert.equal((await relayed.json()).code, 'ROUTE_REJECTED')
  // The member itself is served over both.
  assert.equal((await signed(bob, project, '/membership')).status, 200)
  const socket = await handshakeSocket(native, { key: bob.client.registry.machineKey, projectId: project.id, records: [] }).catch(error => error)
  assert.equal(socket.code, undefined, socket.message)
  socket.terminate()
})
