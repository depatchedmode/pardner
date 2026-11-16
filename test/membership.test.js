import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { actorId } from '../lib/client-identity.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { computeMembership, genesisProjectId, isMember, maySign, MEMBERSHIP_DOMAIN, verifyRecord } from '../lib/membership.js'
import { canonical } from '../lib/workspace-schema.js'
import { forge, permutations, shuffled, trustProject } from '../support/trust-records.js'

// Every certification here is built through the enrollment code with real keys and the joining key's consent
// (support/trust-records.js); person IDs are derived from the key each person was admitted with.

function fixture() {
  const p = trustProject()
  const admin = generateMachineKey(), member = generateMachineKey()
  const adminAdd = p.admit(p.owner, admin, { role: 'admin', name: 'Admin' })
  const label = (key, personId, displayName = 'Agent', harness = 'test') => p.record(key, 'agent.name', actorId(personId, harness), { machineId: key.machineId, displayName, harness })
  return { ...p, admin, member, adminAdd, adminId: p.person(admin), memberId: p.person(member), label }
}
const role = (state, personId) => state.people.find(person => person.id === personId)?.role

test('genesis verifies from its project ID alone and signatures/record IDs cover all fields', () => {
  const f = fixture(), { genesis } = f
  assert.equal(genesisProjectId(genesis), genesis.projectId)
  assert.deepEqual(verifyRecord(genesis, genesis.projectId), { valid: true })
  assert.equal(verifyRecord(genesis, '0'.repeat(64)).valid, false)
  assert.equal(verifyRecord({ ...genesis, displayName: 'Forged' }, genesis.projectId).valid, false)
  const { signature, recordId, ...body } = f.adminAdd
  assert.equal(recordId, createHash('sha256').update(canonical(body)).update(Buffer.from(signature, 'base64url')).digest('hex'))
  assert.equal(verifyRecord({ ...f.adminAdd, displayName: 'Forged' }, genesis.projectId, f.owner.publicKey).reason, 'Invalid signature')
  assert.equal(verifyRecord({ ...f.adminAdd, recordId: '0'.repeat(64) }, genesis.projectId, f.owner.publicKey).reason, 'Invalid recordId')
  assert.equal(verifyRecord({ ...f.adminAdd, signature: signature + '=' }, genesis.projectId, f.owner.publicKey).valid, false)
  assert.deepEqual(verifyRecord(f.adminAdd, genesis.projectId, f.owner.publicKey), { valid: true })
  assert.equal(f.adminAdd.v, 2)
  assert.equal(verifyRecord(forge(f.owner, f.adminAdd, { v: 1 }), genesis.projectId, f.owner.publicKey).reason, 'Unsupported membership record version or kind')
})

test('every permutation resolves authority chains and retains a removed admin’s admissions', () => {
  const f = fixture()
  const records = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.remove(f.owner, f.adminId)]
  const expected = computeMembership(records)
  assert.equal(isMember(expected, f.member.machineId), true)
  assert.equal(isMember(expected, f.admin.machineId), false)
  assert.deepEqual(expected.removedPeople, [f.adminId])
  assert.deepEqual(expected.removedMachines, [f.admin.machineId])
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  assert.deepEqual(computeMembership([...records, ...records]), expected)
})

test('only the owner can add, remove or change admins; no one can remove or re-role the owner', () => {
  const f = fixture(), other = generateMachineKey(), deputy = generateMachineKey()
  const deputyId = f.person(deputy)
  const base = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.admit(f.owner, deputy, { role: 'admin' })]
  const forbidden = [
    f.admit(f.admin, other, { role: 'admin' }), f.admit(f.member, other),
    // An admin may leave (below), but never removes another admin.
    f.remove(f.admin, deputyId), f.role(f.admin, f.adminId, 'member'),
    f.role(f.admin, f.memberId, 'admin'),
    f.remove(f.owner, f.ownerId), f.role(f.owner, f.ownerId, 'member'),
    f.remove(f.admin, f.ownerId),
  ]
  for (const record of forbidden) {
    const state = computeMembership([...base, record])
    assert.equal(state.rejected.length, 1, record.kind)
    assert.equal(role(state, f.ownerId), 'owner')
  }
  const promoted = computeMembership([...base, f.role(f.owner, f.memberId, 'admin')])
  assert.equal(role(promoted, f.memberId), 'admin')
  assert.deepEqual(promoted.rejected, [])
  const demoted = computeMembership([f.genesis, f.adminAdd, f.role(f.owner, f.adminId, 'member')])
  assert.equal(role(demoted, f.adminId), 'member')
  const removed = computeMembership([...base, f.remove(f.admin, f.memberId)])
  assert.equal(isMember(removed, f.member.machineId), false)
})

test('same-person pairing and mutual machine removals converge; removed machines keep set authority', () => {
  const f = fixture(), second = generateMachineKey()
  const records = [f.genesis, f.pair(f.owner, second, f.ownerId), f.removeMachine(f.owner, second), f.removeMachine(second, f.owner)]
  const expected = computeMembership(records)
  assert.deepEqual(expected.machines, [])
  assert.deepEqual(expected.removedMachines, [f.owner.machineId, second.machineId].sort())
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  const selfRemoval = computeMembership([f.genesis, f.removeMachine(f.owner, f.owner)])
  assert.equal(selfRemoval.rejected.length, 1)
})

test('machine authority respects person roles and owner machines resolve before roles', () => {
  const f = fixture(), secondOwner = generateMachineKey(), secondAdmin = generateMachineKey(), secondMember = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.admit(f.admin, f.member)]
  for (const forbidden of [f.pair(f.admin, secondOwner, f.ownerId), f.pair(f.member, secondAdmin, f.adminId), f.removeMachine(f.admin, f.owner)]) {
    assert.equal(computeMembership([...base, forbidden]).rejected.length, 1)
  }
  const records = [...base, f.pair(f.owner, secondOwner, f.ownerId), f.pair(f.admin, secondAdmin, f.adminId), f.pair(f.admin, secondMember, f.memberId),
    f.role(secondOwner, f.memberId, 'admin')]
  const state = computeMembership(records)
  // Having ever held admin protects the newly promoted admin from the other admin's pairing.
  assert.equal(isMember(state, secondMember.machineId), false)
  assert.equal(state.rejected.length, 1)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
})

test('removals are permanent across repeated adds of the same key or person', () => {
  const f = fixture(), fresh = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.admit(f.admin, f.member)]
  const machineRecords = [...base, f.removeMachine(f.admin, f.member), f.pair(f.owner, f.member, f.memberId), f.admit(f.owner, f.member)]
  assert.equal(isMember(computeMembership(machineRecords), f.member.machineId), false)
  const personRecords = [...base, f.remove(f.admin, f.memberId), f.admit(f.owner, f.member), f.pair(f.owner, fresh, f.memberId)]
  const state = computeMembership(personRecords)
  assert.equal(state.people.some(person => person.id === f.memberId), false)
  assert.equal(isMember(state, fresh.machineId), false)
  assert.equal(isMember(state, f.member.machineId), false)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(personRecords, seed)), state)
})

test('unrooted cycles, forged signatures and records from another project grant nothing', () => {
  const f = fixture(), foreign = fixture()
  const forged = { ...f.adminAdd, signature: generateMachineKey().sign(MEMBERSHIP_DOMAIN, Buffer.from('forged')).toString('base64url') }
  const records = [f.genesis, forged, foreign.adminAdd, f.admit(f.admin, f.member, { role: 'admin' }), f.admit(f.member, f.admin, { role: 'admin' })]
  const state = computeMembership(records)
  assert.equal(state.machines.length, 1)
  assert.equal(state.rejected.length, 4)
  assert.ok(state.rejected.some(rejection => rejection.reason === 'Wrong project'))
  assert.ok(state.rejected.some(rejection => rejection.reason === 'Invalid signature'))
  assert.equal(computeMembership([f.genesis, foreign.genesis]).machines.length, 0)
  const selected = computeMembership([foreign.genesis, ...records], { projectId: f.genesis.projectId })
  assert.equal(selected.projectId, f.genesis.projectId)
  assert.equal(selected.machines.length, 1)
})

test('profiles and agent labels are self-authored, project-bound and deterministically resolved', () => {
  const f = fixture()
  const profileA = f.record(f.owner, 'profile', f.ownerId, { displayName: 'First', email: 'first@example.invalid' })
  const profileB = f.record(f.owner, 'profile', f.ownerId, { displayName: 'Second', email: 'second@example.invalid' })
  const labels = ['One', 'Two'].map(displayName => f.label(f.owner, f.ownerId, displayName))
  const records = [f.genesis, f.adminAdd, profileA, profileB, ...labels,
    f.record(f.admin, 'profile', f.ownerId, { displayName: 'Forgery', email: '' }),
    forge(f.admin, labels[0])]
  const state = computeMembership(records)
  const winningProfile = [profileA, profileB].sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1)
  assert.equal(state.people.find(person => person.id === f.ownerId).displayName, winningProfile.displayName)
  assert.equal(state.agentNames[0].displayName, labels.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).displayName)
  assert.equal(state.rejected.length, 2)
  const original = structuredClone(records)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
  assert.deepEqual(records, original)
})

test('concurrent owner role heads choose greatest recordId without undoing admissions', () => {
  const f = fixture()
  const roles = ['member', 'admin'].map(newRole => f.role(f.owner, f.adminId, newRole))
  const records = [f.genesis, f.adminAdd, ...roles, f.admit(f.admin, f.member)]
  const winner = roles.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role
  const state = computeMembership(records)
  assert.equal(role(state, f.adminId), winner)
  assert.equal(isMember(state, f.member.machineId), true)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
})

test('malformed records are rejected with reasons rather than granting authority', () => {
  const f = fixture()
  const state = computeMembership([null, undefined, {}, { ...f.adminAdd, publicKey: 'invalid' }, { ...f.adminAdd, v: 1 }, f.genesis])
  assert.equal(state.rejected.length, 5)
  assert.ok(state.rejected.every(record => typeof record.reason === 'string'))
  assert.equal(state.machines.length, 1)
  assert.throws(() => f.record(f.owner, 'profile', f.ownerId, { displayName: 'Name', email: undefined }), /JSON/)
})

test('a removed person’s key admitted again, with fresh consent each time, cannot bypass the tombstone', () => {
  const f = fixture()
  const records = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.remove(f.owner, f.memberId)]
  for (let index = 0; index < 10; index++) {
    const again = f.admit(f.owner, f.member, { name: `Replacement ${index}` })
    const state = computeMembership([...records, again])
    assert.equal(isMember(state, f.member.machineId), false)
    assert.ok(state.removedPeople.includes(f.memberId))
    assert.ok(state.removedMachines.includes(f.member.machineId))
    assert.deepEqual(computeMembership([...records, again].reverse()), state)
  }
})

test('a member cannot poison another person’s key through their own removal history', () => {
  const f = fixture()
  // The member claims the owner's key as its own machine; the owner never consented.
  const claimed = forge(f.member, f.pair(f.member, generateMachineKey(), f.memberId), { subject: f.owner.machineId, publicKey: f.owner.publicKey })
  const state = computeMembership([f.genesis, f.adminAdd, f.admit(f.admin, f.member), claimed, f.remove(f.admin, f.memberId)])
  assert.equal(isMember(state, f.owner.machineId), true)
  assert.equal(state.rejected.length, 1)
})

test('role records require a signed replaces field and only owner machines may change roles', () => {
  const f = fixture()
  const valid = f.role(f.owner, f.adminId, 'member')
  for (const replaces of [undefined, '', 4, 'missing', 'A'.repeat(64)]) {
    assert.throws(() => f.record(f.owner, 'member.role', f.adminId, { role: 'member', replaces }), /JSON|replaces/)
    const malformed = { ...valid }
    if (replaces === undefined) delete malformed.replaces
    else malformed.replaces = replaces
    assert.equal(verifyRecord(forge(f.owner, malformed), f.genesis.projectId, f.owner.publicKey).valid, false)
  }
  assert.throws(() => f.record(f.owner, 'member.role', f.adminId, { role: 'member' }), /replaces/)
  assert.equal(verifyRecord({ ...valid, replaces: '0'.repeat(64) }, f.genesis.projectId, f.owner.publicKey).valid, false)
  const forbidden = f.role(f.admin, f.memberId, 'member')
  const state = computeMembership([f.genesis, f.adminAdd, f.admit(f.admin, f.member), forbidden])
  assert.deepEqual(state.rejected.map(record => record.recordId), [forbidden.recordId])
})

test('demotion and removal preserve both person and machine admissions in every permutation', () => {
  const f = fixture(), second = generateMachineKey()
  const records = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.pair(f.admin, second, f.memberId),
    f.role(f.owner, f.adminId, 'member'), f.remove(f.owner, f.adminId)]
  const expected = computeMembership(records)
  assert.equal(isMember(expected, f.member.machineId), true)
  assert.equal(isMember(expected, second.machineId), true)
  assert.equal(isMember(expected, f.admin.machineId), false)
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
})

test('a role chain follows replaces even when the successor has a smaller recordId', () => {
  const f = fixture()
  let promote, demote
  for (let nonce = 0; nonce < 100; nonce++) {
    promote = f.role(f.owner, f.memberId, 'admin', null, { nonce })
    demote = f.role(f.owner, f.memberId, 'member', promote.recordId)
    if (demote.recordId < promote.recordId) break
  }
  assert.ok(demote.recordId < promote.recordId)
  const records = [f.genesis, f.admit(f.owner, f.member), promote, demote, f.admit(f.member, f.admin)]
  const expected = computeMembership(records)
  assert.equal(role(expected, f.memberId), 'member')
  assert.equal(expected.people.find(person => person.id === f.memberId).everAdmin, true)
  assert.equal(isMember(expected, f.admin.machineId), true)
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
})

test('missing and cross-person predecessors leave heads; invalid roles cannot replace or grant authority', () => {
  const f = fixture()
  const first = f.role(f.owner, f.memberId, 'admin')
  const missing = f.role(f.owner, f.memberId, 'member', '0'.repeat(64))
  const crossPerson = f.role(f.owner, f.adminId, 'member', first.recordId)
  const invalid = f.role(f.admin, f.memberId, 'member', first.recordId)
  const forged = { ...f.role(f.owner, f.memberId, 'admin', missing.recordId), signature: 'invalid' }
  const records = [f.genesis, f.adminAdd, f.admit(f.owner, f.member), first, missing, crossPerson, invalid, forged]
  const expected = computeMembership(records)
  assert.equal(role(expected, f.memberId), [first, missing].sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role)
  assert.equal(role(expected, f.adminId), 'member')
  assert.equal(expected.rejected.length, 2)
  const noPromotion = computeMembership([f.genesis, f.adminAdd, f.admit(f.owner, f.member),
    forged, f.role(f.admin, f.memberId, 'admin'), f.pair(f.member, generateMachineKey(), f.adminId)])
  assert.equal(noPromotion.people.find(person => person.id === f.memberId).everAdmin, false)
  assert.equal(noPromotion.rejected.length, 3)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), expected)
})

test('promotion racing admin removal protects the person and their machines in every permutation', () => {
  const f = fixture()
  const base = [f.genesis, f.adminAdd, f.admit(f.owner, f.member), f.role(f.owner, f.memberId, 'admin')]
  for (const removal of [f.remove(f.admin, f.memberId), f.removeMachine(f.admin, f.member)]) {
    const records = [...base, removal]
    const expected = computeMembership(records)
    assert.equal(isMember(expected, f.member.machineId), true)
    assert.deepEqual(expected.rejected.map(record => record.recordId), [removal.recordId])
    for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  }
})

test('ever-admin protection survives demotion, including other-person machine additions', () => {
  const f = fixture(), second = generateMachineKey()
  for (const admissionRole of ['admin', 'member']) {
    const promote = f.role(f.owner, f.memberId, 'admin')
    const base = [f.genesis, f.adminAdd, f.admit(f.owner, f.member, { role: admissionRole }),
      ...(admissionRole === 'member' ? [promote] : []),
      f.role(f.owner, f.memberId, 'member', admissionRole === 'member' ? promote.recordId : null)]
    const forbidden = [f.remove(f.admin, f.memberId), f.removeMachine(f.admin, f.member), f.pair(f.admin, second, f.memberId)]
    const state = computeMembership([...base, ...forbidden])
    assert.equal(role(state, f.memberId), 'member')
    assert.equal(isMember(state, f.member.machineId), true)
    assert.equal(isMember(state, second.machineId), false)
    assert.equal(state.rejected.length, 3)
    assert.equal(isMember(computeMembership([...base, f.pair(f.member, second, f.memberId)]), second.machineId), true)
    assert.equal(isMember(computeMembership([...base, f.pair(f.owner, second, f.memberId)]), second.machineId), true)
    assert.equal(isMember(computeMembership([...base, f.remove(f.owner, f.memberId)]), f.member.machineId), false)
    assert.equal(isMember(computeMembership([...base, f.removeMachine(f.owner, f.member)]), f.member.machineId), false)
    for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled([...base, ...forbidden], seed)), state)
  }
})

test('concurrent owner machines, chained roles, historical admissions and racing removals shuffle identically', () => {
  const f = fixture(), secondOwner = generateMachineKey(), admitted = generateMachineKey()
  const promote = f.role(f.owner, f.memberId, 'admin')
  const heads = [f.role(f.owner, f.memberId, 'member', promote.recordId), f.role(secondOwner, f.memberId, 'admin', promote.recordId)]
  const records = [f.genesis, f.pair(f.owner, secondOwner, f.ownerId), f.adminAdd, f.admit(f.admin, f.member),
    f.role(f.owner, f.adminId, 'member'), promote, ...heads, f.admit(f.member, admitted), f.remove(f.admin, f.memberId)]
  const expected = computeMembership(records)
  assert.equal(isMember(expected, admitted.machineId), true)
  assert.equal(isMember(expected, f.member.machineId), true)
  assert.equal(role(expected, f.memberId), heads.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role)
  assert.equal(expected.rejected.length, 1)
  for (let seed = 0; seed < 200; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), expected)
})

test('hundreds of records reach an authority fixed point within a generous time bound', { timeout: 20000 }, () => {
  const f = fixture(), records = [f.genesis]
  let signer = f.owner
  for (let index = 0; index < 150; index++) {
    const machine = generateMachineKey()
    records.push(f.admit(signer, machine), f.role(f.owner, f.person(machine), 'admin'))
    signer = machine
  }
  const start = performance.now()
  const state = computeMembership(records.reverse())
  const elapsed = performance.now() - start
  assert.equal(state.people.length, 151)
  assert.equal(state.machines.length, 151)
  assert.deepEqual(state.rejected, [])
  assert.ok(elapsed < 5000, `301 records took ${elapsed.toFixed(0)} ms`)
})

test('maySign uses current roles while the reducer keeps demoted and removed signer authority', () => {
  const f = fixture(), extra = generateMachineKey(), paired = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.admit(f.owner, f.member)]
  const records = [f.admit(f.admin, extra), f.pair(f.admin, paired, f.memberId), f.remove(f.admin, f.memberId), f.removeMachine(f.admin, f.member)]
  const current = computeMembership(base)
  const demotedBase = [...base, f.role(f.owner, f.adminId, 'member')]
  const demoted = computeMembership(demotedBase)
  const removedBase = [...base, f.remove(f.owner, f.adminId)]
  const removed = computeMembership(removedBase)
  for (const record of records) {
    assert.equal(maySign(current, record), true, record.kind)
    assert.equal(maySign(demoted, record), false, record.kind)
    assert.equal(maySign(removed, record), false, record.kind)
    assert.deepEqual(computeMembership([...demotedBase, record]).rejected, [])
    assert.deepEqual(computeMembership([...removedBase, record]).rejected, [])
  }
  const profile = f.record(f.admin, 'profile', f.adminId, { displayName: 'Updated', email: '' })
  for (const record of [profile, f.label(f.admin, f.adminId), f.pair(f.admin, paired, f.adminId)]) {
    assert.equal(maySign(demoted, record), true)
    assert.equal(maySign(removed, record), false)
    assert.deepEqual(computeMembership([...removedBase, record]).rejected, [])
  }
})

test('maySign enforces owner-only roles, historical target protection and same-person machine control', () => {
  const f = fixture(), second = generateMachineKey(), extra = generateMachineKey()
  const promote = f.role(f.owner, f.memberId, 'admin')
  const base = [f.genesis, f.adminAdd, f.admit(f.owner, f.member), promote, f.role(f.owner, f.memberId, 'member', promote.recordId),
    f.pair(f.member, second, f.memberId)]
  const state = computeMembership(base)
  for (const key of [f.owner, f.admin, f.member]) {
    assert.equal(maySign(state, f.role(key, f.memberId, 'admin')), key === f.owner)
    // The member's own machine may sign their removal: that is leaving.
    assert.equal(maySign(state, f.remove(key, f.memberId)), key !== f.admin)
    assert.equal(maySign(state, f.pair(key, extra, f.memberId)), key !== f.admin)
    assert.equal(maySign(state, f.removeMachine(key, second)), key !== f.admin)
    assert.equal(maySign(state, f.admit(key, extra, { role: 'admin' })), key === f.owner)
  }
  assert.equal(maySign(state, f.removeMachine(f.member, f.member)), false)
  assert.equal(maySign(state, f.remove(f.owner, f.ownerId)), false)
  assert.equal(maySign(state, f.role(f.owner, f.ownerId, 'member')), false)
  assert.equal(maySign(state, f.removeMachine(f.admin, f.owner)), false)
  assert.equal(maySign(state, f.pair(f.admin, extra, f.ownerId)), false)
  assert.equal(maySign(state, f.record(f.admin, 'profile', f.memberId, { displayName: 'Forgery', email: '' })), false)
  const removedMachine = computeMembership([...base, f.removeMachine(second, f.member)])
  assert.equal(maySign(removedMachine, f.pair(f.member, extra, f.memberId)), false)
  assert.equal(maySign(removedMachine, f.pair(second, extra, f.memberId)), true)
})

test('maySign rejects unknown signers, malformed, forged and foreign records without mutating state', () => {
  const f = fixture(), foreign = fixture()
  const state = computeMembership([f.genesis, f.adminAdd])
  const original = structuredClone(state)
  const valid = f.admit(f.admin, f.member)
  for (const record of [null, {}, f.genesis, foreign.adminAdd,
    f.admit(f.member, generateMachineKey()), { ...valid, displayName: 'Tampered' },
    f.remove(f.owner, f.memberId), f.pair(f.owner, f.member, f.person(generateMachineKey())),
    f.removeMachine(f.owner, f.member)]) {
    assert.equal(maySign(state, record), false)
  }
  assert.equal(maySign(state, valid), true)
  assert.deepEqual(state, original)
})

test('a person leaves by signing their own removal from any of their machines; the owner cannot leave', () => {
  const f = fixture(), second = generateMachineKey(), agentsOnly = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.pair(f.member, second, f.memberId),
    f.pair(f.member, agentsOnly, f.memberId, { agentsOnly: true })]
  for (const [key, person] of [[f.member, f.memberId], [second, f.memberId], [f.admin, f.adminId]]) {
    const leave = f.remove(key, person)
    const records = [...base, leave]
    const expected = computeMembership(records)
    assert.deepEqual(expected.rejected, [], `${person} leaves`)
    assert.ok(expected.removedPeople.includes(person))
    assert.equal(expected.people.some(entry => entry.id === person), false)
    assert.deepEqual(expected.removals.map(entry => [entry.subject, entry.left, entry.by.personId]), [[person, true, person]])
    assert.ok(expected.formerPeople.some(entry => entry.id === person))
    // Leaving takes every machine of the person; people the leaver admitted stay.
    if (person === f.memberId) for (const machine of [f.member, second, agentsOnly]) assert.equal(isMember(expected, machine.machineId), false)
    if (person === f.adminId) assert.equal(isMember(expected, f.member.machineId), true)
    for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  }
  // The owner can't leave, and an agents-only machine never acts as its person.
  for (const forbidden of [f.remove(f.owner, f.ownerId), f.remove(agentsOnly, f.memberId)]) {
    const state = computeMembership([...base, forbidden])
    assert.deepEqual(state.rejected.map(entry => entry.recordId), [forbidden.recordId])
    assert.deepEqual(state.removedPeople, [])
  }
})

test('leaving is judged at arrival like every removal: current members only, never the owner or an agents-only machine', () => {
  const f = fixture(), agentsOnly = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.pair(f.member, agentsOnly, f.memberId, { agentsOnly: true })]
  const state = computeMembership(base)
  assert.equal(maySign(state, f.remove(f.member, f.memberId)), true)
  assert.equal(maySign(state, f.remove(f.admin, f.adminId)), true)
  assert.equal(maySign(state, f.remove(f.owner, f.ownerId)), false)
  assert.equal(maySign(state, f.remove(agentsOnly, f.memberId)), false)
  // A member still can't remove anyone else.
  assert.equal(maySign(state, f.remove(f.member, f.adminId)), false)
  const removed = computeMembership([...base, f.remove(f.owner, f.memberId)])
  assert.equal(maySign(removed, f.remove(f.member, f.memberId)), false, 'a removed machine adds nothing, not even its own leave')
})

test('who admitted and who removed each person and machine is the same in every order', () => {
  const f = fixture(), second = generateMachineKey()
  const records = [f.genesis, f.adminAdd, f.admit(f.admin, f.member), f.pair(f.member, second, f.memberId),
    f.removeMachine(f.member, second), f.remove(f.owner, f.adminId)]
  const expected = computeMembership(records)
  const person = id => expected.people.find(entry => entry.id === id)
  assert.equal(person(f.ownerId).admittedBy, null, 'the owner started the project')
  assert.deepEqual(person(f.memberId).admittedBy, { machineId: f.admin.machineId, personId: f.adminId }, 'the removed admin’s admission stays attributed')
  assert.equal(expected.machines.find(machine => machine.id === f.owner.machineId).admittedBy, null)
  assert.deepEqual(expected.formerMachines.find(machine => machine.id === second.machineId).admittedBy, { machineId: f.member.machineId, personId: f.memberId })
  // A machine paired to an existing person is marked; one admitted with its person is not.
  assert.equal(expected.formerMachines.find(machine => machine.id === second.machineId).paired, true)
  assert.equal(expected.machines.find(machine => machine.id === f.member.machineId).paired, undefined)
  assert.deepEqual(expected.formerPeople.map(entry => [entry.id, entry.role, entry.admittedBy.personId]), [[f.adminId, 'admin', f.ownerId]])
  assert.deepEqual(expected.removals.map(entry => [entry.kind, entry.subject, entry.by.personId, entry.left]).sort(),
    [['machine.remove', second.machineId, f.memberId, false], ['member.remove', f.adminId, f.ownerId, false]].sort())
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
})
