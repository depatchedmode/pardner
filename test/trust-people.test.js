import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from '../lib/client-service.js'
import { CLIENT_API } from '../lib/client-identity.js'
import { peopleListing } from '../lib/client-people.js'
import { joinApproved } from '../support/enrollment.js'
import { sameComputerRoute } from '../support/client-workspace.js'

// The People view, leaving, profiles and the removed state (#198, #152, #154, #175, #183), on real client services.
// The first client in each test hosts the project (the hub).

async function participant(t, name, { identity = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-people-'))
  // An explicit loopback route: the Human and My device invitations here are used by another client on this computer (#162).
  const client = await startClient({ directory, ...await sameComputerRoute(), deviceName: `${name} laptop`, gitDirectory: directory })
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
    return { status, ...result }
  }
  if (identity) await call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  return { name, client, call, fail, get machineId() { return client.registry.machineKey.machineId }, get personId() { return client.registry.read().identity?.id } }
}

async function eventually(read, message, timeout = 20000) {
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
const people = (person, project) => person.call(`/projects/${project.id}/people`)
const row = (view, name) => view.people.find(person => person.name === name)

/** Alice owns the project; Bob is an admin she let in; Carol is a member Bob let in. Bob also paired a desktop. */
async function team(t) {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob'), carol = await participant(t, 'Carol')
  const desktop = await participant(t, 'Bob desktop', { identity: false })
  const { project } = await alice.call('/projects', { name: 'People', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human', { role: 'admin' })).invitation)
  await approve(carol, bob, (await invite(bob, project, 'human')).invitation)
  await approve(desktop, bob, (await invite(bob, project, 'device')).invitation, 'pair')
  for (const person of [bob, carol, desktop]) {
    await eventually(async () => (await people(person, project)).people.length === 3 && !(await people(person, project)).syncing, `${person.name} never saw everyone`)
  }
  return { alice, bob, carol, desktop, project }
}

test('the People view shows each person’s role, machines, agents and who let them in, and only the actions each may take', { timeout: 180000 }, async t => {
  const { alice, bob, carol, desktop, project } = await team(t)
  const owner = await people(alice, project)
  assert.deepEqual(owner.counts, { people: 3, machines: 4, agents: 3, removed: 0 })
  assert.deepEqual(owner.people.map(person => [person.name, person.role, person.you]), [['Alice', 'owner', true], ['Bob', 'admin', false], ['Carol', 'member', false]])
  assert.equal(row(owner, 'Alice').admittedBy, null, 'the owner started the project')
  assert.deepEqual(row(owner, 'Bob').admittedBy, { personId: alice.personId, name: 'Alice' })
  assert.deepEqual(row(owner, 'Carol').admittedBy, { personId: bob.personId, name: 'Bob' })
  const [aliceLaptop] = row(owner, 'Alice').machines
  assert.deepEqual([aliceLaptop.name, aliceLaptop.thisMachine, aliceLaptop.hostsProject, aliceLaptop.status], ['Alice laptop', true, true, 'this'])
  assert.equal(aliceLaptop.shortId.length, 6)
  assert.deepEqual(row(owner, 'Bob').machines.map(machine => machine.name).sort(), ['Bob desktop laptop', 'Bob laptop'])
  assert.deepEqual(row(owner, 'Bob').machines.find(machine => machine.name === 'Bob desktop laptop').admittedBy, { personId: bob.personId, name: 'Bob' })
  assert.deepEqual(row(owner, 'Bob').machines.map(machine => [machine.name, machine.paired]).sort(), [['Bob desktop laptop', true], ['Bob laptop', false]])
  assert.ok(row(owner, 'Alice').agents.every(agent => agent.machines[0].name === 'Alice laptop'))
  // The owner may do everything except remove or re-role herself, remove her hub, or leave.
  assert.deepEqual(owner.actions.invite, { allowed: true, reason: null, roles: ['member', 'admin'] })
  assert.equal(owner.actions.leave.allowed, false)
  assert.match(owner.actions.leave.reason, /owner, you can’t leave/)
  assert.deepEqual(Object.keys(row(owner, 'Alice').actions).sort(), ['editProfile', 'pairMachine'])
  assert.equal(aliceLaptop.actions.remove.allowed, false)
  for (const name of ['Bob', 'Carol']) {
    assert.deepEqual(Object.fromEntries(Object.entries(row(owner, name).actions).map(([key, value]) => [key, value.allowed])), { remove: true, changeRole: true, pairMachine: true })
  }
  // Bob, an admin, admits and removes members but not the owner, and offers only the member role.
  const admin = await people(bob, project)
  assert.deepEqual(admin.actions.invite.roles, ['member'])
  assert.equal(admin.actions.leave.allowed, true)
  // Only the owner manages the owner's entry, so an admin is shown why instead of controls.
  assert.deepEqual(row(admin, 'Alice').actions, { note: 'Only the owner manages the owner’s machines. The owner can’t be removed.' })
  assert.deepEqual([row(admin, 'Alice').machines[0].name, row(admin, 'Alice').machines[0].hostsProject, row(admin, 'Alice').machines[0].status], ['Alice laptop', true, 'online'])
  assert.deepEqual(row(admin, 'Alice').machines[0].actions, {})
  assert.equal(aliceLaptop.actions.remove.reason, 'Hosts the project, so it can’t be removed.')
  assert.equal(row(admin, 'Carol').actions.remove.allowed, true)
  assert.equal(row(admin, 'Carol').actions.pairMachine.allowed, true)
  const bobsOwn = row(admin, 'Bob')
  assert.equal(bobsOwn.machines.find(machine => machine.thisMachine).actions.remove.allowed, false, 'a machine never removes itself')
  assert.equal(bobsOwn.machines.find(machine => !machine.thisMachine).actions.remove.allowed, true, 'Bob may remove his other machine')
  // Carol, a member, may pair her own machines and leave; she sees no admission or removal controls for others.
  const member = await people(carol, project)
  assert.equal(member.actions.invite.allowed, false)
  assert.equal(member.actions.invite.reason, 'Only the owner or an admin can let people in. You can pair your own machines.')
  assert.equal(member.actions.leave.allowed, true)
  for (const name of ['Alice', 'Bob']) assert.deepEqual(row(member, name).actions, {})
  assert.deepEqual(Object.keys(row(member, 'Carol').actions).sort(), ['editProfile', 'pairMachine'])
  // Bob's own browser on his second machine sees itself as "this machine".
  const second = await people(desktop, project)
  assert.equal(row(second, 'Bob').machines.find(machine => machine.thisMachine).name, 'Bob desktop laptop')
  // Last seen: the hub knows which replicas are connected to it.
  await eventually(async () => row(await people(alice, project), 'Carol').machines[0].status === 'online', 'the hub never saw Carol connected')
  // The CLI listing states the same facts in words.
  const listing = peopleListing(owner)
  assert.match(listing, /^People: 3 people, 4 machines, 3 agents\n/)
  assert.match(listing, /Carol · Member · carol@example\.test\n {2}Let in by Bob\n/)
  assert.match(listing, /Alice laptop \[[a-z2-7]{6}\] · this machine · hosts the project/)
})

test('removal is shown as removed, with who removed it, to everyone and to the removed party', { timeout: 180000 }, async t => {
  const { alice, bob, carol, desktop, project } = await team(t)
  // Bob removes his own desktop; the owner removes Carol.
  await bob.call(`/projects/${project.id}/revoke`, { kind: 'machine', id: desktop.machineId, operationId: 'remove-desktop' })
  await alice.call(`/projects/${project.id}/revoke`, { kind: 'member', id: carol.personId, operationId: 'remove-carol' })
  const view = await people(alice, project)
  assert.deepEqual(view.counts, { people: 2, machines: 2, agents: 2, removed: 2 })
  assert.deepEqual(view.removed.people.map(person => [person.name, person.left, person.removedBy.map(entry => entry.name), person.machines.map(machine => machine.name)]),
    [['Carol', false, ['Alice'], ['Carol laptop']]])
  assert.deepEqual(view.removed.machines.map(machine => [machine.personName, machine.name, machine.removedBy.map(entry => entry.name)]), [['Bob', 'Bob desktop laptop', ['Bob']]])
  // The removed parties are told so, by name, and the project stays listed as removed rather than vanishing (#154).
  const told = await eventually(async () => {
    const { status, result } = await fetch(`${carol.client.url}${CLIENT_API}/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${carol.client.registry.read().operatorToken}` } }).then(async response => ({ status: response.status, result: await response.json() }))
    return status === 403 && result.code === 'REVOKED' && result
  }, 'Carol was never told she was removed')
  assert.equal(told.error, 'You were removed from this project by Alice. Its copy on this computer stays saved here.')
  assert.deepEqual(told.details.removal, { kind: 'person', left: false, by: { personId: alice.personId, name: 'Alice' } })
  const session = await carol.call('/session')
  assert.deepEqual(session.projects, [])
  assert.deepEqual(session.removedProjects.map(entry => [entry.id, entry.name, entry.removal.kind, entry.removal.by.name]), [[project.id, 'People', 'person', 'Alice']])
  const desktopTold = await eventually(async () => (await desktop.fail(`/projects/${project.id}`)).code === 'REVOKED' && (await desktop.call('/session')).removedProjects[0],
    'the desktop was never told it was removed')
  assert.equal(desktopTold.message, 'This computer was removed from the project by Bob. Its copy here stays saved.')
  // After a restart the removed project is still listed, with the same facts.
  const directory = carol.client.registry.directory, carolId = carol.personId
  await carol.client.stop()
  const reopened = await startClient({ directory, port: 0 })
  t.after(() => reopened.stop())
  const again = await fetch(`${reopened.url}${CLIENT_API}/session`, { headers: { Authorization: `Bearer ${reopened.registry.read().operatorToken}` } }).then(response => response.json())
  assert.equal(again.removedProjects[0].removal.by.name, 'Alice')
  // Everyone else's board marks removed people instead of listing them as offline (#175).
  const actors = (await alice.call(`/projects/${project.id}`)).actors
  const carolActors = actors.filter(actor => actor.humanId === carolId)
  assert.ok(carolActors.length > 0 && carolActors.every(actor => actor.removed === true))
  assert.ok(actors.filter(actor => actor.humanId === bob.personId).every(actor => !actor.removed))
  // The machine that hosts the project can't be removed, even by another of the owner's machines.
  const refused = await alice.fail(`/projects/${project.id}/revoke`, { kind: 'machine', id: alice.machineId, operationId: 'remove-hub' })
  assert.equal(refused.error, 'This machine hosts the project, so it can’t be removed.')
  // Removal accepts the Actor ID a profile shows, explains an agent's or an unknown ID, and a refused ID leaves the
  // operation ID free for the corrected request (#152).
  const bobActor = actors.find(actor => actor.kind === 'human' && actor.humanId === bob.personId).id
  const bobAgent = actors.find(actor => actor.kind === 'agent' && actor.humanId === bob.personId).id
  const agentId = await alice.fail(`/projects/${project.id}/revoke`, { kind: 'member', id: bobAgent, operationId: 'remove-bob' })
  assert.equal(agentId.code, 'INVALID_ARGUMENT'); assert.match(agentId.error, /^That is an agent’s ID/)
  const unknown = await alice.fail(`/projects/${project.id}/revoke`, { kind: 'member', id: 'nobody', operationId: 'remove-bob' })
  assert.deepEqual([unknown.code, unknown.error], ['NOT_FOUND', 'No current member has that ID. Use the person ID that pardner client people lists.'])
  const removedAgain = await alice.fail(`/projects/${project.id}/revoke`, { kind: 'member', id: carolId, operationId: 'remove-bob' })
  assert.deepEqual([removedAgain.code, removedAgain.error], ['NOT_FOUND', 'That person was already removed from this project'])
  const byActor = await alice.call(`/projects/${project.id}/revoke`, { kind: 'member', id: bobActor, operationId: 'remove-bob' })
  assert.equal(byActor.id, bob.personId)
})

test('a member or an admin leaves; the owner cannot; and leaving looks like leaving', { timeout: 180000 }, async t => {
  const { alice, bob, carol, desktop, project } = await team(t)
  const owner = await alice.fail(`/projects/${project.id}/leave`, { operationId: 'leave' })
  assert.equal(owner.code, 'FORBIDDEN')
  assert.equal(owner.error, 'The project owner can’t leave. The owner stays with the project for as long as it exists.')
  const left = await carol.call(`/projects/${project.id}/leave`, { operationId: 'leave' })
  assert.deepEqual([left.removed, left.left, left.id], [true, true, carol.personId])
  const session = await carol.call('/session')
  assert.deepEqual(session.removedProjects.map(entry => [entry.removal.kind, entry.removal.left, entry.message]),
    [['person', true, 'You left this project. Its copy on this computer stays saved here.']])
  assert.equal((await carol.fail(`/projects/${project.id}/api/automerge/doc`)).code, 'REVOKED')
  // Leaving takes all of a person's machines; the people the leaver let in stay.
  await bob.call(`/projects/${project.id}/leave`, { operationId: 'leave' })
  const view = await people(alice, project)
  assert.deepEqual(view.people.map(person => person.name), ['Alice'])
  assert.deepEqual(view.removed.people.map(person => [person.name, person.left]), [['Bob', true], ['Carol', true]])
  assert.deepEqual(view.removed.people.find(person => person.name === 'Bob').machines.map(machine => machine.name).sort(), ['Bob desktop laptop', 'Bob laptop'])
  // The desktop learns it from the hub the next time its board polls the project.
  await eventually(async () => (await desktop.fail(`/projects/${project.id}`)).code === 'REVOKED' && (await desktop.call('/session')).removedProjects[0]?.removal?.left === true,
    'Bob’s desktop never learned that Bob left')
  // Leaving is final for that person: the old identity can't rejoin on the same invitation path.
  const back = await invite(alice, project, 'human')
  assert.equal((await carol.fail('/join', { invitation: back.invitation, operationId: 'back' })).code, 'REVOKED')
})

test('a person stops one of their own agents on this machine from the People view', { timeout: 120000 }, async t => {
  const alice = await participant(t, 'Alice')
  const { project } = await alice.call('/projects', { name: 'Agents', operationId: 'create' })
  const [agent] = row(await people(alice, project), 'Alice').agents
  assert.deepEqual(agent.actions, { stopHere: { allowed: true, reason: null } })
  await alice.call(`/projects/${project.id}/revoke`, { kind: 'agent', id: agent.id, operationId: 'stop' })
  const [after] = row(await people(alice, project), 'Alice').agents
  assert.deepEqual([after.stoppedHere, after.actions], [true, {}])
  assert.equal((await alice.fail(`/projects/${project.id}/agent-grant`, {})).code, 'ACTOR_REVOKED')
})

test('a profile edit renames the person on every member’s board; agent names stay as registered', { timeout: 180000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'Names', operationId: 'create' })
  await approve(bob, alice, (await invite(alice, project, 'human')).invitation)
  const edited = await bob.call(`/projects/${project.id}/profile`, { name: 'Robert', email: 'robert@example.test', operationId: 'rename' })
  assert.deepEqual([edited.name, edited.email], ['Robert', 'robert@example.test'])
  assert.equal((await bob.call('/session')).identity.name, 'Robert', 'this computer keeps the corrected identity for later projects')
  const human = actors => actors.find(actor => actor.kind === 'human' && actor.humanId === bob.personId)
  await eventually(async () => human((await alice.call(`/projects/${project.id}`)).actors)?.displayName === 'Robert', 'Alice’s board never showed the new name')
  const aliceBoard = (await alice.call(`/projects/${project.id}/api/automerge/doc`)).doc.actors
  assert.equal(Object.values(aliceBoard).find(actor => actor.kind === 'human' && actor.humanId === bob.personId).gitIdentity.email, 'robert@example.test')
  assert.equal(row(await people(alice, project), 'Robert').email, 'robert@example.test')
  const agent = Object.values(aliceBoard).find(actor => actor.kind === 'agent' && actor.humanId === bob.personId)
  assert.ok(agent && agent.displayName !== 'Robert', 'agent names are fixed at registration')
  // Only the person's own machines set their profile.
  const forged = await alice.fail(`/projects/${project.id}/profile`, { name: '', email: 'x@example.test', operationId: 'blank' })
  assert.equal(forged.error, 'Supply a name')
})

test('invitation history names who issued each invitation, when, who used it, and pages newest first', { timeout: 180000 }, async t => {
  const alice = await participant(t, 'Alice'), bob = await participant(t, 'Bob')
  const { project } = await alice.call('/projects', { name: 'History', operationId: 'create' })
  const used = await invite(alice, project, 'human', { role: 'admin' })
  await approve(bob, alice, used.invitation)
  const fromBob = await invite(bob, project, 'human')
  const revoked = await invite(alice, project, 'device')
  await alice.call(`/projects/${project.id}/invites/${revoked.invite.id}/revoke`, {})
  for (let index = 0; index < 10; index++) await invite(alice, project, 'agent')
  const first = await alice.call(`/projects/${project.id}/invites?limit=5`)
  assert.equal(first.total, 13); assert.equal(first.invites.length, 5); assert.equal(first.nextOffset, 5)
  assert.ok(first.invites.every((entry, index) => index === 0 || first.invites[index - 1].createdAt >= entry.createdAt), 'newest first')
  const all = (await alice.call(`/projects/${project.id}/invites?limit=50`)).invites
  assert.equal(all.length, 13)
  const find = id => all.find(entry => entry.id === id)
  assert.deepEqual([find(used.invite.id).state, find(used.invite.id).issuedBy.name, find(used.invite.id).usedBy.name, find(used.invite.id).role], ['redeemed', 'Alice', 'Bob', 'admin'])
  assert.ok(Number.isFinite(find(used.invite.id).usedAt))
  assert.deepEqual([find(fromBob.invite.id).state, find(fromBob.invite.id).issuedBy.name], ['issued', 'Bob'])
  assert.deepEqual([find(revoked.invite.id).state, find(revoked.invite.id).revokedBy.name], ['revoked', 'Alice'])
  const last = await alice.call(`/projects/${project.id}/invites?limit=5&offset=10`)
  assert.equal(last.invites.length, 3); assert.equal(last.nextOffset, null)
  // A replica admin sees the same history, through the hub.
  const remote = await bob.call(`/projects/${project.id}/invites?limit=50`)
  assert.equal(remote.total, 13)
  assert.equal(remote.invites.find(entry => entry.id === used.invite.id).usedBy.name, 'Bob')
})
