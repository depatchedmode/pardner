import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actorId } from '../lib/client-identity.js'
import { agentNameRecord } from '../lib/enrollment.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { computeMembership, genesisProjectId, isMember, mayAuthor, maySign, offerHash } from '../lib/membership.js'
import { forge, permutations, shuffled, trustProject } from '../support/trust-records.js'

// The membership rules of docs/PARDNER-TRUST-DESIGN.md, section 2, "How membership is computed". Each rule must
// hold inside computeMembership, for records that reach a peer through the hub's gate and for records harvested
// from the synced document (test/membership-harvest.test.js covers that path end to end).

const person = (state, id) => state.people.find(entry => entry.id === id)
const machine = (state, key) => state.machines.find(entry => entry.id === key.machineId)
const counted = (state, record) => !state.rejected.some(entry => entry.recordId === record.recordId)
const sameInEveryOrder = (records, expected = computeMembership(records)) => {
  if (records.length <= 6) for (const order of permutations(records)) assert.deepEqual(computeMembership(order), expected)
  else for (let seed = 0; seed < 200; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), expected)
  assert.deepEqual(computeMembership([...records, ...records]), expected)
  return expected
}
/** A forgery of `record` by `key` whose record ID sorts between `after` and `before`, where record order would favour it. */
function sortedBetween(key, record, after, before, changes = {}) {
  for (let nonce = 0; nonce < 4096; nonce++) {
    const forged = forge(key, record, { ...changes, approval: { ...record.approval, nonce: `forged-${nonce}` } })
    if (forged.recordId > after.recordId && forged.recordId < before.recordId) return forged
  }
  return null
}

function project() {
  const p = trustProject()
  const admin = generateMachineKey(), member = generateMachineKey(), other = generateMachineKey()
  const adminAdd = p.admit(p.owner, admin, { role: 'admin', name: 'Admin' })
  const memberAdd = p.admit(p.owner, member, { name: 'Member' })
  const otherAdd = p.admit(p.owner, other, { name: 'Other' })
  return { ...p, admin, member, other, adminAdd, memberAdd, otherAdd, adminId: p.person(admin), memberId: p.person(member), otherId: p.person(other),
    base: [p.genesis, adminAdd, memberAdd, otherAdd] }
}

// ---- Rule 1a: a machine consents to its own certification ----

test('a member cannot certify an admin’s key as their own machine: without the admin’s consent it counts for nothing, in any order', () => {
  // Record IDs are chosen so that ordering by record ID would bind the admin's key to the member: the member's
  // admission sorts first, then the unconsented pairing, then the admin's own admission.
  let p, stolen
  do {
    p = project()
    const honest = p.pair(p.member, generateMachineKey(), p.memberId)
    stolen = p.memberAdd.recordId < p.adminAdd.recordId
      ? sortedBetween(p.member, honest, p.memberAdd, p.adminAdd, { subject: p.admin.machineId, publicKey: p.admin.publicKey }) : null
  } while (!stolen)
  const removal = p.remove(p.admin, p.otherId)
  const records = [...p.base, stolen, removal]
  const state = sameInEveryOrder(records)
  assert.equal(counted(state, stolen), false, 'the unconsented certification does not count')
  assert.equal(machine(state, p.admin)?.personId, p.adminId, 'the admin’s key stays the admin’s machine')
  assert.equal(person(state, p.adminId)?.role, 'admin', 'the admin keeps their authority')
  assert.deepEqual(state.removedPeople, [p.otherId], 'the admin’s removal still counts')
})

test('member.add and machine.add count only with the certified key’s join request naming this project, that person and a hash of this offer', () => {
  const p = project(), joiner = generateMachineKey(), stranger = generateMachineKey()
  const pairing = p.pair(p.member, joiner, p.memberId), admission = p.admit(p.admin, joiner)
  const elsewhere = trustProject()
  const otherOffer = p.offer(p.member, { purpose: 'device', personId: p.memberId })
  const cases = {
    'no join request': forge(p.member, pairing, { joinRequest: {} }),
    'a join request signed by another key': forge(p.member, pairing, { joinRequest: p.consent(stranger, pairing.offer, p.memberId) }),
    'a join request with its signature altered': forge(p.member, pairing, { joinRequest: { ...pairing.joinRequest, signature: admission.joinRequest.signature } }),
    'a join request for another person': forge(p.member, pairing, { joinRequest: p.consent(joiner, pairing.offer, p.adminId) }),
    'a join request for another project': forge(p.member, pairing, { joinRequest: elsewhere.consent(joiner, { ...pairing.offer, projectId: elsewhere.projectId }, p.memberId) }),
    'a join request for another offer': forge(p.member, pairing, { joinRequest: p.consent(joiner, otherOffer, p.memberId) }),
    'an embedded offer that does not match the hash the joiner signed': forge(p.member, pairing, { offer: otherOffer }),
    'an admission whose join request answered a pairing offer': forge(p.admin, admission, { joinRequest: pairing.joinRequest }),
    'an admission without a join request': forge(p.admin, admission, { joinRequest: undefined }),
  }
  for (const [name, record] of Object.entries(cases)) {
    const state = sameInEveryOrder([...p.base, record])
    assert.equal(counted(state, record), false, name)
    assert.equal(isMember(state, joiner.machineId), false, name)
    assert.equal(maySign(computeMembership(p.base), record), false, `${name}: refused at the gate too`)
  }
  for (const record of [pairing, admission]) {
    const state = computeMembership([...p.base, record])
    assert.deepEqual(state.rejected, [], record.kind)
    assert.equal(isMember(state, joiner.machineId), true, record.kind)
    assert.equal(record.joinRequest.offerHash, offerHash(record.offer))
  }
})

test('a consent cannot be reused for another role or purpose', () => {
  const p = project(), joiner = generateMachineKey()
  const asMember = p.admit(p.owner, joiner)
  const adminOffer = p.offer(p.owner, { purpose: 'human', role: 'admin' })
  const agents = p.pair(p.member, joiner, p.memberId, { agentsOnly: true })
  const deviceOffer = p.offer(p.member, { purpose: 'device', personId: p.memberId })
  const cases = {
    'a member consent raised to admin': forge(p.owner, asMember, { role: 'admin' }),
    'a member consent moved onto an admin offer': forge(p.owner, asMember, { role: 'admin', offer: adminOffer }),
    'an agents-only consent used for a full machine': forge(p.member, agents, { agentsOnly: undefined }),
    'an agents-only consent moved onto a device offer': forge(p.member, agents, { agentsOnly: undefined, offer: deviceOffer }),
  }
  for (const [name, record] of Object.entries(cases)) {
    const state = sameInEveryOrder([...p.base, record])
    assert.equal(counted(state, record), false, name)
    assert.equal(isMember(state, joiner.machineId), false, name)
  }
})

test('the owner’s machines need consent too: an unconsented owner machine counts for nothing in the owner-machine pass', () => {
  const p = project(), victim = generateMachineKey()
  const honest = p.pair(p.owner, generateMachineKey(), p.ownerId)
  const unconsented = forge(p.owner, honest, { subject: victim.machineId, publicKey: victim.publicKey })
  const state = sameInEveryOrder([...p.base, unconsented])
  assert.equal(counted(state, unconsented), false)
  assert.equal(isMember(state, victim.machineId), false)
  // A role change signed by that machine grants nothing.
  const promote = p.role(victim, p.memberId, 'admin')
  assert.equal(person(computeMembership([...p.base, unconsented, promote]), p.memberId).role, 'member')
})

test('an unconsented certification of someone else’s key cannot remove that key when its claimed person is removed', () => {
  const p = project()
  const honest = p.pair(p.member, generateMachineKey(), p.memberId)
  const claimed = forge(p.member, honest, { subject: p.other.machineId, publicKey: p.other.publicKey })
  const records = [...p.base, claimed, p.remove(p.owner, p.memberId)]
  const state = sameInEveryOrder(records)
  assert.equal(isMember(state, p.other.machineId), true, 'the other person’s machine stays')
  assert.equal(state.removedMachines.includes(p.other.machineId), false)
})

// ---- Rule 1b: a person ID belongs to its first machine ----

test('a person’s ID is derived from the key they were admitted with, for the owner and every admitted person', () => {
  const p = project()
  const state = computeMembership(p.base)
  assert.equal(p.genesis.subject, personIdFor(p.owner.publicKey))
  for (const [key, record] of [[p.admin, p.adminAdd], [p.member, p.memberAdd]]) {
    assert.equal(record.subject, personIdFor(key.publicKey))
    assert.equal(machine(state, key).personId, personIdFor(key.publicKey))
  }
  // A genesis that names another person ID is no root at all.
  const subject = personIdFor(generateMachineKey().publicKey)
  const misnamed = forge(p.owner, p.genesis, { subject, projectId: genesisProjectId({ ...p.genesis, subject }) })
  const rootless = computeMembership([misnamed], { projectId: misnamed.projectId })
  assert.deepEqual(rootless.machines, [])
  assert.deepEqual(rootless.people, [])
})

test('nobody can admit a fresh key under an existing or another key’s person ID; further machines join a person only by machine.add', () => {
  const p = project(), fresh = generateMachineKey(), absent = generateMachineKey()
  const honest = p.admit(p.owner, fresh)
  const cases = {
    'under the owner’s ID': forge(p.owner, honest, { subject: p.ownerId, joinRequest: p.consent(fresh, honest.offer, p.ownerId) }),
    'under an admin’s ID': forge(p.owner, honest, { subject: p.adminId, joinRequest: p.consent(fresh, honest.offer, p.adminId) }),
    'under the ID of a key not in the project': forge(p.owner, honest, { subject: personIdFor(absent.publicKey), joinRequest: p.consent(fresh, honest.offer, personIdFor(absent.publicKey)) }),
  }
  for (const [name, record] of Object.entries(cases)) {
    const state = sameInEveryOrder([...p.base, record])
    assert.equal(counted(state, record), false, name)
    assert.equal(isMember(state, fresh.machineId), false, name)
    assert.equal(person(state, p.adminId).role, 'admin', name)
  }
  const paired = p.pair(p.admin, fresh, p.adminId)
  assert.equal(machine(computeMembership([...p.base, paired]), fresh).personId, p.adminId)
})

// ---- Rule 1c: certifications never displace each other ----

test('a key certified more than once for one person is one machine, agents-only only if every certification says so', () => {
  const p = project(), box = generateMachineKey(), second = generateMachineKey()
  const pairSecond = p.pair(p.member, second, p.memberId)
  const agentsOnly = [p.pair(p.member, box, p.memberId, { agentsOnly: true }), p.pair(second, box, p.memberId, { agentsOnly: true })]
  const full = p.pair(p.owner, box, p.memberId)
  const both = sameInEveryOrder([...p.base, pairSecond, ...agentsOnly])
  assert.equal(machine(both, box).agentsOnly, true)
  assert.equal(both.machines.filter(entry => entry.id === box.machineId).length, 1)
  for (const mixed of [[agentsOnly[0], full], [full, agentsOnly[1]]]) {
    const state = sameInEveryOrder([...p.base, pairSecond, ...mixed])
    assert.deepEqual(state.rejected, [], 'every consented certification counts; none displaces another')
    assert.equal(machine(state, box).agentsOnly, undefined, 'one full certification lifts the agents-only mark')
    assert.equal(state.machines.filter(entry => entry.id === box.machineId).length, 1)
  }
})

test('a person admitted more than once holds the highest role any valid admission gave', () => {
  const p = project(), joiner = generateMachineKey()
  const asMember = p.admit(p.admin, joiner), asAdmin = p.admit(p.owner, joiner, { role: 'admin' })
  const state = sameInEveryOrder([...p.base, asMember, asAdmin])
  assert.deepEqual(state.rejected, [])
  assert.equal(person(state, p.person(joiner)).role, 'admin')
  assert.equal(person(state, p.person(joiner)).everAdmin, true)
  assert.equal(state.machines.filter(entry => entry.id === joiner.machineId).length, 1)
  // An admin's admission of a member, admitted again by the owner as a member, is still a member.
  assert.equal(person(sameInEveryOrder([...p.base, asMember, p.admit(p.owner, joiner)]), p.person(joiner)).role, 'member')
})

test('a key certified for two different people is removed, and records it signed still count under either authority', () => {
  const p = project(), twice = generateMachineKey(), admitted = generateMachineKey()
  // The owner admits `twice` as an admin; the member also pairs it into the member's identity, and `twice` consents to both.
  const asAdmin = p.admit(p.owner, twice, { role: 'admin', name: 'Twice' })
  const asMembersMachine = p.pair(p.member, twice, p.memberId)
  const signedAsAdmin = [p.admit(twice, admitted), p.remove(twice, p.otherId)]
  const records = [...p.base, asAdmin, asMembersMachine, ...signedAsAdmin]
  const state = sameInEveryOrder(records)
  assert.equal(isMember(state, twice.machineId), false, 'the key is removed')
  assert.ok(state.removedMachines.includes(twice.machineId))
  assert.deepEqual(state.rejected, [], 'both certifications and everything the key signed count')
  assert.equal(isMember(state, admitted.machineId), true, 'its admission as an admin still counts')
  assert.ok(state.removedPeople.includes(p.otherId), 'its removal as an admin still counts')
  assert.equal(isMember(state, p.member.machineId), true, 'the member’s own machine is untouched')
  assert.equal(person(state, p.memberId).role, 'member', 'the member gains nothing')
  // Consenting twice undoes nothing: the admin authority it was given still decides what it signed.
  assert.equal(isMember(computeMembership([...p.base, asAdmin, ...signedAsAdmin]), admitted.machineId), true)
})

test('record order and record IDs decide nothing among competing certifications', () => {
  const p = project(), contested = generateMachineKey(), box = generateMachineKey()
  const records = [...p.base,
    p.admit(p.owner, contested, { role: 'admin' }), p.admit(p.admin, contested), p.pair(p.member, contested, p.memberId),
    p.pair(p.member, box, p.memberId, { agentsOnly: true }), p.pair(p.owner, box, p.memberId), p.role(p.owner, p.memberId, 'admin')]
  const state = sameInEveryOrder(records)
  assert.equal(isMember(state, contested.machineId), false)
  assert.equal(person(state, p.person(contested)).role, 'admin')
  assert.equal(machine(state, box).agentsOnly, undefined)
})

// ---- Rule 2: agents-only machines hold no membership authority ----

function agentsOnlyProject() {
  const p = project(), ownerBox = generateMachineKey(), adminBox = generateMachineKey(), memberBox = generateMachineKey(), second = generateMachineKey()
  const boxes = [p.pair(p.owner, ownerBox, p.ownerId, { agentsOnly: true }), p.pair(p.admin, adminBox, p.adminId, { agentsOnly: true }),
    p.pair(p.member, memberBox, p.memberId, { agentsOnly: true }), p.pair(p.member, second, p.memberId)]
  return { ...p, ownerBox, adminBox, memberBox, second, base: [...p.base, ...boxes] }
}

test('an agents-only machine’s records of every kind except its own agents’ labels count for nothing, in every pass', () => {
  const p = agentsOnlyProject()
  const fresh = () => generateMachineKey()
  const forbidden = {
    'machine.add for the owner (owner-machine pass)': p.pair(p.ownerBox, fresh(), p.ownerId),
    'machine.add for its own person': p.pair(p.memberBox, fresh(), p.memberId),
    'machine.add for a member, by an admin’s box': p.pair(p.adminBox, fresh(), p.memberId),
    'member.add by an admin’s box': p.admit(p.adminBox, fresh()),
    'member.add of an admin by the owner’s box': p.admit(p.ownerBox, fresh(), { role: 'admin' }),
    'member.remove of a member by an admin’s box': p.remove(p.adminBox, p.memberId),
    'member.remove of an admin by the owner’s box': p.remove(p.ownerBox, p.adminId),
    'member.remove to leave': p.remove(p.memberBox, p.memberId),
    'machine.remove of its person’s other machine': p.removeMachine(p.memberBox, p.second),
    'machine.remove of a member’s machine by an admin’s box': p.removeMachine(p.adminBox, p.member),
    'member.role by the owner’s box': p.role(p.ownerBox, p.memberId, 'admin'),
    'profile for its own person': p.record(p.memberBox, 'profile', p.memberId, { displayName: 'Box', email: '' }),
  }
  const current = computeMembership(p.base)
  for (const [name, record] of Object.entries(forbidden)) {
    const records = [...p.base, record]
    const state = computeMembership(records)
    assert.deepEqual(state.rejected.map(entry => entry.recordId), [record.recordId], name)
    assert.equal(state.machines.length, current.machines.length, name)
    assert.deepEqual(state.removedMachines, [], name)
    assert.deepEqual(state.people.map(entry => [entry.id, entry.role, entry.displayName]), current.people.map(entry => [entry.id, entry.role, entry.displayName]), name)
    assert.equal(maySign(current, record), false, `${name}: refused at the gate`)
    assert.equal(mayAuthor(current, record), false, `${name}: no authority to approve`)
  }
  // An agent label for its own person's agent counts; one for another person's agent does not.
  const own = agentNameRecord(p.memberBox, p.projectId, p.memberId, { harnessId: 'cursor', name: 'Box agent' })
  const stolen = agentNameRecord(p.memberBox, p.projectId, p.adminId, { harnessId: 'cursor', name: 'Stolen' })
  const labelled = computeMembership([...p.base, own, stolen])
  assert.deepEqual(labelled.rejected.map(entry => entry.recordId), [stolen.recordId])
  assert.deepEqual(labelled.agentNames.map(agent => [agent.machineId, agent.id]), [[p.memberBox.machineId, actorId(p.memberId, 'cursor')]])
  assert.equal(maySign(current, own), true)
  assert.equal(maySign(current, stolen), false)
})

test('an agents-only machine’s records grant nothing in any order, mixed with records that do count', () => {
  const p = agentsOnlyProject(), viaBox = generateMachineKey(), viaMember = generateMachineKey()
  const records = [...p.base, p.pair(p.memberBox, viaBox, p.memberId), p.pair(viaBox, generateMachineKey(), p.memberId),
    p.pair(p.member, viaMember, p.memberId), p.remove(p.adminBox, p.otherId)]
  const state = sameInEveryOrder(records)
  assert.equal(isMember(state, viaBox.machineId), false)
  assert.equal(isMember(state, viaMember.machineId), true)
  assert.deepEqual(state.removedPeople, [])
  assert.equal(state.rejected.length, 3)
})
