import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { generateMachineKey } from '../lib/machine-key.js'
import { buildRecord, computeMembership, genesisProjectId, isMember, MEMBERSHIP_DOMAIN, verifyRecord } from '../lib/membership.js'
import { canonical } from '../lib/workspace-schema.js'

function fixture() {
  const owner = generateMachineKey(), admin = generateMachineKey(), member = generateMachineKey()
  const genesis = buildRecord(owner, { kind: 'project.genesis', subject: 'owner', displayName: 'Owner' })
  const record = (key, kind, subject, fields = {}) => buildRecord(key, { projectId: genesis.projectId, kind, subject, ...fields })
  const add = (key, person, machine, role = 'member', fields = {}) => record(key, 'member.add', person, {
    displayName: person, role, machineId: machine.machineId, publicKey: machine.publicKey,
    offer: {}, joinRequest: {}, approval: {}, ...fields,
  })
  const pair = (key, person, machine) => record(key, 'machine.add', machine.machineId, { personId: person, publicKey: machine.publicKey, approval: {} })
  const adminAdd = add(owner, 'admin', admin, 'admin')
  return { owner, admin, member, genesis, record, add, pair, adminAdd }
}

function* permutations(values) {
  if (!values.length) { yield []; return }
  for (let i = 0; i < values.length; i++) for (const tail of permutations(values.filter((_, index) => index !== i))) yield [values[i], ...tail]
}

function shuffled(values, seed) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function resign(key, record) {
  const { signature: oldSignature, recordId, ...body } = record
  const data = Buffer.from(canonical(body))
  const signature = key.sign(MEMBERSHIP_DOMAIN, data)
  return { ...body, signature: signature.toString('base64url'), recordId: createHash('sha256').update(data).update(signature).digest('hex') }
}

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
})

test('every permutation resolves authority chains and retains a removed admin’s admissions', () => {
  const f = fixture()
  const records = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member), f.record(f.owner, 'member.remove', 'admin')]
  const expected = computeMembership(records)
  assert.equal(isMember(expected, f.member.machineId), true)
  assert.equal(isMember(expected, f.admin.machineId), false)
  assert.deepEqual(expected.removedPeople, ['admin'])
  assert.deepEqual(expected.removedMachines, [f.admin.machineId])
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  assert.deepEqual(computeMembership([...records, ...records]), expected)
})

test('only the owner can add, remove or change admins; no one can remove or re-role the owner', () => {
  const f = fixture(), other = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member)]
  const forbidden = [
    f.add(f.admin, 'other', other, 'admin'), f.add(f.member, 'other', other),
    f.record(f.admin, 'member.remove', 'admin'), f.record(f.admin, 'member.role', 'admin', { role: 'member', replaces: null }),
    f.record(f.admin, 'member.role', 'member', { role: 'admin', replaces: null }),
    f.record(f.owner, 'member.remove', 'owner'), f.record(f.owner, 'member.role', 'owner', { role: 'member', replaces: null }),
    f.record(f.admin, 'member.remove', 'owner'),
  ]
  for (const record of forbidden) {
    const state = computeMembership([...base, record])
    assert.equal(state.rejected.length, 1, record.kind)
    assert.equal(state.people.find(person => person.id === 'owner').role, 'owner')
  }
  const promoted = computeMembership([...base, f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null })])
  assert.equal(promoted.people.find(person => person.id === 'member').role, 'admin')
  assert.deepEqual(promoted.rejected, [])
  const demoted = computeMembership([f.genesis, f.adminAdd, f.record(f.owner, 'member.role', 'admin', { role: 'member', replaces: null })])
  assert.equal(demoted.people.find(person => person.id === 'admin').role, 'member')
  const removed = computeMembership([...base, f.record(f.admin, 'member.remove', 'member')])
  assert.equal(isMember(removed, f.member.machineId), false)
})

test('same-person pairing and mutual machine removals converge; removed machines keep set authority', () => {
  const f = fixture(), second = generateMachineKey()
  const records = [f.genesis, f.pair(f.owner, 'owner', second),
    f.record(f.owner, 'machine.remove', second.machineId), f.record(second, 'machine.remove', f.owner.machineId)]
  const expected = computeMembership(records)
  assert.deepEqual(expected.machines, [])
  assert.deepEqual(expected.removedMachines, [f.owner.machineId, second.machineId].sort())
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
  const selfRemoval = computeMembership([f.genesis, f.record(f.owner, 'machine.remove', f.owner.machineId)])
  assert.equal(selfRemoval.rejected.length, 1)
})

test('machine authority respects person roles and owner machines resolve before roles', () => {
  const f = fixture(), secondOwner = generateMachineKey(), secondAdmin = generateMachineKey(), secondMember = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member)]
  for (const forbidden of [f.pair(f.admin, 'owner', secondOwner), f.pair(f.member, 'admin', secondAdmin), f.record(f.admin, 'machine.remove', f.owner.machineId)]) {
    assert.equal(computeMembership([...base, forbidden]).rejected.length, 1)
  }
  const records = [...base, f.pair(f.owner, 'owner', secondOwner), f.pair(f.admin, 'admin', secondAdmin), f.pair(f.admin, 'member', secondMember),
    f.record(secondOwner, 'member.role', 'member', { role: 'admin', replaces: null })]
  const state = computeMembership(records)
  // Having ever held admin protects the newly promoted admin from the other admin's pairing.
  assert.equal(isMember(state, secondMember.machineId), false)
  assert.equal(state.rejected.length, 1)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
})

test('removals are permanent across repeated adds of the same key or person', () => {
  const f = fixture(), fresh = generateMachineKey()
  const base = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member)]
  const machineRecords = [...base, f.record(f.admin, 'machine.remove', f.member.machineId), f.pair(f.owner, 'member', f.member)]
  assert.equal(isMember(computeMembership(machineRecords), f.member.machineId), false)
  const personRecords = [...base, f.record(f.admin, 'member.remove', 'member'), f.add(f.owner, 'member', fresh), f.pair(f.owner, 'member', fresh)]
  const state = computeMembership(personRecords)
  assert.equal(state.people.some(person => person.id === 'member'), false)
  assert.equal(isMember(state, fresh.machineId), false)
  assert.equal(isMember(state, f.member.machineId), false)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(personRecords, seed)), state)
})

test('unrooted cycles, forged signatures and records from another project grant nothing', () => {
  const f = fixture(), foreign = fixture()
  const forged = { ...f.adminAdd, signature: generateMachineKey().sign(MEMBERSHIP_DOMAIN, Buffer.from('forged')).toString('base64url') }
  const records = [f.genesis, forged, foreign.adminAdd, f.add(f.admin, 'member', f.member, 'admin'), f.add(f.member, 'admin', f.admin, 'admin')]
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
  const profileA = f.record(f.owner, 'profile', 'owner', { displayName: 'First', email: 'first@example.invalid' })
  const profileB = f.record(f.owner, 'profile', 'owner', { displayName: 'Second', email: 'second@example.invalid' })
  const labels = ['One', 'Two'].map(displayName => f.record(f.owner, 'agent.name', 'agent', { machineId: f.owner.machineId, displayName, harness: 'test' }))
  const records = [f.genesis, f.adminAdd, profileA, profileB, ...labels,
    f.record(f.admin, 'profile', 'owner', { displayName: 'Forgery', email: '' }),
    resign(f.admin, { ...labels[0], signer: f.admin.machineId })]
  const state = computeMembership(records)
  const winningProfile = [profileA, profileB].sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1)
  assert.equal(state.people.find(person => person.id === 'owner').displayName, winningProfile.displayName)
  assert.equal(state.agentNames[0].displayName, labels.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).displayName)
  assert.equal(state.rejected.length, 2)
  const original = structuredClone(records)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
  assert.deepEqual(records, original)
})

test('concurrent owner role heads choose greatest recordId without undoing admissions', () => {
  const f = fixture()
  const roles = ['member', 'admin'].map(role => f.record(f.owner, 'member.role', 'admin', { role, replaces: null }))
  const records = [f.genesis, f.adminAdd, ...roles, f.add(f.admin, 'member', f.member)]
  const role = roles.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role
  const state = computeMembership(records)
  assert.equal(state.people.find(person => person.id === 'admin').role, role)
  assert.equal(isMember(state, f.member.machineId), true)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), state)
})

test('malformed records are rejected with reasons rather than granting authority', () => {
  const f = fixture()
  const state = computeMembership([null, undefined, {}, { ...f.adminAdd, publicKey: 'invalid' }, { ...f.adminAdd, v: 2 }, f.genesis])
  assert.equal(state.rejected.length, 5)
  assert.ok(state.rejected.every(record => typeof record.reason === 'string'))
  assert.equal(state.machines.length, 1)
  assert.throws(() => f.record(f.owner, 'profile', 'owner', { displayName: 'Name', email: undefined }), /JSON/)
})

test('reusing a removed person’s key under another person ID cannot bypass the tombstone', () => {
  const f = fixture()
  const records = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member), f.record(f.owner, 'member.remove', 'member')]
  for (let index = 0; index < 30; index++) {
    const reused = f.add(f.owner, `replacement-${index}`, f.member)
    const state = computeMembership([...records, reused])
    assert.equal(isMember(state, f.member.machineId), false)
    assert.ok(state.removedPeople.includes('member'))
    assert.ok(state.removedMachines.includes(f.member.machineId))
    assert.deepEqual(computeMembership([...records, reused].reverse()), state)
  }
})

test('a member cannot poison another person’s key through their own removal history', () => {
  const f = fixture()
  const state = computeMembership([f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member),
    f.pair(f.member, 'member', f.owner), f.record(f.admin, 'member.remove', 'member')])
  assert.equal(isMember(state, f.owner.machineId), true)
  assert.equal(state.rejected.length, 1)
})

test('role records require a signed replaces field and only owner machines may change roles', () => {
  const f = fixture()
  const fields = { role: 'member', replaces: null }
  const valid = f.record(f.owner, 'member.role', 'admin', fields)
  for (const replaces of [undefined, '', 4, 'missing', 'A'.repeat(64)]) {
    assert.throws(() => f.record(f.owner, 'member.role', 'admin', { role: 'member', replaces }), /JSON|replaces/)
    const malformed = { ...valid }
    if (replaces === undefined) delete malformed.replaces
    else malformed.replaces = replaces
    assert.equal(verifyRecord(resign(f.owner, malformed), f.genesis.projectId, f.owner.publicKey).valid, false)
  }
  assert.throws(() => f.record(f.owner, 'member.role', 'admin', { role: 'member' }), /replaces/)
  assert.equal(verifyRecord({ ...valid, replaces: '0'.repeat(64) }, f.genesis.projectId, f.owner.publicKey).valid, false)
  const forbidden = f.record(f.admin, 'member.role', 'member', fields)
  const state = computeMembership([f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member), forbidden])
  assert.deepEqual(state.rejected.map(record => record.recordId), [forbidden.recordId])
})

test('demotion and removal preserve both person and machine admissions in every permutation', () => {
  const f = fixture(), second = generateMachineKey()
  const records = [f.genesis, f.adminAdd, f.add(f.admin, 'member', f.member),
    f.pair(f.admin, 'member', second),
    f.record(f.owner, 'member.role', 'admin', { role: 'member', replaces: null }),
    f.record(f.owner, 'member.remove', 'admin')]
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
    promote = f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null, nonce })
    demote = f.record(f.owner, 'member.role', 'member', { role: 'member', replaces: promote.recordId })
    if (demote.recordId < promote.recordId) break
  }
  assert.ok(demote.recordId < promote.recordId)
  const records = [f.genesis, f.add(f.owner, 'member', f.member), promote, demote, f.add(f.member, 'admin', f.admin)]
  const expected = computeMembership(records)
  assert.equal(expected.people.find(person => person.id === 'member').role, 'member')
  assert.equal(expected.people.find(person => person.id === 'member').everAdmin, true)
  assert.equal(isMember(expected, f.admin.machineId), true)
  assert.deepEqual(expected.rejected, [])
  for (const permutation of permutations(records)) assert.deepEqual(computeMembership(permutation), expected)
})

test('missing and cross-person predecessors leave heads; invalid roles cannot replace or grant authority', () => {
  const f = fixture()
  const first = f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null })
  const missing = f.record(f.owner, 'member.role', 'member', { role: 'member', replaces: '0'.repeat(64) })
  const crossPerson = f.record(f.owner, 'member.role', 'admin', { role: 'member', replaces: first.recordId })
  const invalid = f.record(f.admin, 'member.role', 'member', { role: 'member', replaces: first.recordId })
  const forged = { ...f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: missing.recordId }), signature: 'invalid' }
  const records = [f.genesis, f.adminAdd, f.add(f.owner, 'member', f.member), first, missing, crossPerson, invalid, forged]
  const expected = computeMembership(records)
  assert.equal(expected.people.find(person => person.id === 'member').role,
    [first, missing].sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role)
  assert.equal(expected.people.find(person => person.id === 'admin').role, 'member')
  assert.equal(expected.rejected.length, 2)
  const noPromotion = computeMembership([f.genesis, f.adminAdd, f.add(f.owner, 'member', f.member),
    forged, f.record(f.admin, 'member.role', 'member', { role: 'admin', replaces: null }),
    f.pair(f.member, 'admin', generateMachineKey())])
  assert.equal(noPromotion.people.find(person => person.id === 'member').everAdmin, false)
  assert.equal(noPromotion.rejected.length, 3)
  for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), expected)
})

test('promotion racing admin removal protects the person and their machines in every permutation', () => {
  const f = fixture()
  const base = [f.genesis, f.adminAdd, f.add(f.owner, 'member', f.member),
    f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null })]
  for (const removal of [f.record(f.admin, 'member.remove', 'member'), f.record(f.admin, 'machine.remove', f.member.machineId)]) {
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
    const promote = f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null })
    const base = [f.genesis, f.adminAdd, f.add(f.owner, 'member', f.member, admissionRole),
      ...(admissionRole === 'member' ? [promote] : []),
      f.record(f.owner, 'member.role', 'member', { role: 'member', replaces: admissionRole === 'member' ? promote.recordId : null })]
    const forbidden = [f.record(f.admin, 'member.remove', 'member'),
      f.record(f.admin, 'machine.remove', f.member.machineId), f.pair(f.admin, 'member', second)]
    const state = computeMembership([...base, ...forbidden])
    assert.equal(state.people.find(person => person.id === 'member').role, 'member')
    assert.equal(isMember(state, f.member.machineId), true)
    assert.equal(isMember(state, second.machineId), false)
    assert.equal(state.rejected.length, 3)
    assert.equal(isMember(computeMembership([...base, f.pair(f.member, 'member', second)]), second.machineId), true)
    assert.equal(isMember(computeMembership([...base, f.pair(f.owner, 'member', second)]), second.machineId), true)
    assert.equal(isMember(computeMembership([...base, f.record(f.owner, 'member.remove', 'member')]), f.member.machineId), false)
    assert.equal(isMember(computeMembership([...base, f.record(f.owner, 'machine.remove', f.member.machineId)]), f.member.machineId), false)
    for (let seed = 0; seed < 100; seed++) assert.deepEqual(computeMembership(shuffled([...base, ...forbidden], seed)), state)
  }
})

test('concurrent owner machines, chained roles, historical admissions and racing removals shuffle identically', () => {
  const f = fixture(), secondOwner = generateMachineKey(), admitted = generateMachineKey()
  const promote = f.record(f.owner, 'member.role', 'member', { role: 'admin', replaces: null })
  const heads = [f.record(f.owner, 'member.role', 'member', { role: 'member', replaces: promote.recordId }),
    f.record(secondOwner, 'member.role', 'member', { role: 'admin', replaces: promote.recordId })]
  const records = [f.genesis, f.pair(f.owner, 'owner', secondOwner), f.adminAdd, f.add(f.admin, 'member', f.member),
    f.record(f.owner, 'member.role', 'admin', { role: 'member', replaces: null }),
    promote, ...heads, f.add(f.member, 'admitted', admitted), f.record(f.admin, 'member.remove', 'member')]
  const expected = computeMembership(records)
  assert.equal(isMember(expected, admitted.machineId), true)
  assert.equal(isMember(expected, f.member.machineId), true)
  assert.equal(expected.people.find(person => person.id === 'member').role,
    heads.sort((a, b) => a.recordId.localeCompare(b.recordId)).at(-1).role)
  assert.equal(expected.rejected.length, 1)
  for (let seed = 0; seed < 200; seed++) assert.deepEqual(computeMembership(shuffled(records, seed)), expected)
})

test('hundreds of records reach an authority fixed point within a generous time bound', { timeout: 10000 }, () => {
  const f = fixture(), records = [f.genesis]
  let signer = f.owner
  for (let index = 0; index < 150; index++) {
    const machine = generateMachineKey(), person = `person-${index}`
    records.push(f.add(signer, person, machine),
      f.record(f.owner, 'member.role', person, { role: 'admin', replaces: null }))
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
