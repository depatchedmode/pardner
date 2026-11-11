import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { actorId } from '../lib/client-identity.js'
import {
  agentNameRecord, buildJoinRequest, buildOffer, collidingCodes, confirmationCode, decodeInvitation, encodeInvitation, joinRequestRefusal,
  machineAccess, macMatches, newNonce, newSecret, offerRefusal, recordRefusal, requestRecordRefusal, sameCode,
} from '../lib/enrollment.js'
import { generateMachineKey } from '../lib/machine-key.js'
import { buildRecord, computeMembership, mayAuthor, maySign } from '../lib/membership.js'

function project() {
  const owner = generateMachineKey(), joiner = generateMachineKey()
  const genesis = buildRecord(owner, { kind: 'project.genesis', subject: 'owner', displayName: 'Owner', nonce: newSecret() })
  const offer = buildOffer(owner, { projectId: genesis.projectId, offerId: randomUUID(), purpose: 'human', role: 'member',
    routes: ['https://hub.example.test/pardner/client/v1/enroll'], expiresAt: Date.now() + 60000 })
  return { owner, joiner, genesis, offer }
}
const identity = { name: 'Bob', email: 'bob@example.test' }
const device = { id: randomUUID(), name: 'Bob laptop' }
const agent = { harnessId: 'openai-codex', name: 'Bob agent' }

test('offers are signed by their issuing machine and carry the role or the person they link', () => {
  const { owner, joiner, offer, genesis } = project()
  assert.equal(offerRefusal(offer, owner.publicKey), null)
  assert.equal(offerRefusal(offer, joiner.publicKey), 'Offer signer is not a machine of this project')
  assert.equal(offerRefusal({ ...offer, role: 'admin' }, owner.publicKey), 'Invalid offer signature')
  assert.equal(offerRefusal({ ...offer, expiresAt: offer.expiresAt + 1 }, owner.publicKey), 'Invalid offer signature')
  const { v, signer, signature, ...fields } = offer
  assert.throws(() => buildOffer(owner, { ...fields, role: 'owner' }), /admin or member role/)
  assert.throws(() => buildOffer(owner, { projectId: genesis.projectId, offerId: randomUUID(), purpose: 'device', routes: offer.routes, expiresAt: 1 }), /names the person/)
  assert.throws(() => buildOffer(owner, { projectId: genesis.projectId, offerId: randomUUID(), purpose: 'human', role: 'member',
    routes: ['http://hub.example.test/enroll'], expiresAt: 1 }), /HTTPS/)
  const text = encodeInvitation({ offer, secret: newSecret(), projectName: 'Board' })
  assert.deepEqual(decodeInvitation(text).offer, offer)
  assert.throws(() => decodeInvitation(text.replace('v2', 'v1')), /complete Pardner invitation/)
})

test('a join request proves its key and the invitation secret, and must match its offer', () => {
  const { joiner, offer } = project()
  const secret = newSecret()
  const { request, mac } = buildJoinRequest(joiner, secret, { offer, personId: 'bob', identity, device, agent })
  assert.equal(joinRequestRefusal(request, offer), null)
  assert.equal(macMatches(secret, request, mac), true)
  assert.equal(macMatches(newSecret(), request, mac), false, 'another secret does not key this request')
  assert.equal(macMatches(secret, { ...request, personId: 'mallory' }, mac), false)
  assert.equal(joinRequestRefusal({ ...request, personId: 'mallory' }, offer), 'Invalid join request signature')
  const other = generateMachineKey()
  assert.equal(joinRequestRefusal({ ...request, publicKey: other.publicKey }, offer), 'The join request machine ID does not match its key')
  assert.equal(joinRequestRefusal(request, { ...offer, offerId: randomUUID() }), 'The join request does not match its invitation')
  const label = agentNameRecord(joiner, offer.projectId, 'bob', agent)
  assert.equal(requestRecordRefusal(label, request), null)
  assert.equal(requestRecordRefusal(agentNameRecord(joiner, offer.projectId, 'someone-else', agent), request), 'The agent label names another person’s agent')
  assert.equal(requestRecordRefusal(agentNameRecord(other, offer.projectId, 'bob', agent), request), 'The agent label is not signed by the joining machine')
})

test('confirmation codes are eight digits that change with the offer, key and nonce, and collisions are found', () => {
  const { joiner, offer } = project()
  const nonce = newNonce()
  const code = confirmationCode(offer, joiner.publicKey, nonce)
  assert.match(code, /^\d{4} \d{4}$/)
  assert.equal(sameCode(code, code.replace(' ', '')), true)
  assert.equal(sameCode(code, code.slice(0, 4)), false)
  const codes = new Set(Array.from({ length: 200 }, () => confirmationCode(offer, joiner.publicKey, newNonce())))
  assert.ok(codes.size >= 199, 'fresh nonces give fresh codes')
  assert.deepEqual([...collidingCodes([{ id: 'a', code: '1' }, { id: 'b', code: '2' }, { id: 'c', code: '1' }, { id: 'd', code: null }])].sort(), ['a', 'c'])
})

test('machine access comes from the records: agents-only machines act only as the agents they name', () => {
  const { owner, joiner, genesis } = project()
  const box = generateMachineKey()
  const pid = genesis.projectId
  const records = [genesis,
    buildRecord(owner, { projectId: pid, kind: 'member.add', subject: 'bob', role: 'member', displayName: 'Bob', machineId: joiner.machineId,
      publicKey: joiner.publicKey, offer: {}, joinRequest: {}, approval: {} }),
    buildRecord(joiner, { projectId: pid, kind: 'machine.add', subject: box.machineId, personId: 'bob', publicKey: box.publicKey, agentsOnly: true, approval: {} }),
    agentNameRecord(joiner, pid, 'bob', agent),
    agentNameRecord(box, pid, 'bob', { harnessId: 'cursor', name: 'Box' }),
    // A label for another person's agent grants nothing to this machine.
    agentNameRecord(box, pid, 'owner', { harnessId: 'cursor', name: 'Stolen' })]
  const membership = computeMembership(records)
  assert.deepEqual(machineAccess(membership, joiner.machineId).actorIds, [actorId('bob'), actorId('bob', 'openai-codex')])
  const access = machineAccess(membership, box.machineId)
  assert.equal(access.humanAllowed, false)
  assert.deepEqual(access.actorIds, [actorId('bob', 'cursor')])
  assert.equal(machineAccess(membership, generateMachineKey().machineId), null)
  const removed = computeMembership([...records, buildRecord(owner, { projectId: pid, kind: 'machine.remove', subject: box.machineId })])
  assert.equal(machineAccess(removed, box.machineId), null)
})

test('the gate refuses records a signer may not author now, with reasons a person can act on', () => {
  const { owner, joiner, genesis } = project()
  const pid = genesis.projectId, admin = generateMachineKey()
  const add = (key, person, machine, role) => buildRecord(key, { projectId: pid, kind: 'member.add', subject: person, role, displayName: person,
    machineId: machine.machineId, publicKey: machine.publicKey, offer: {}, joinRequest: {}, approval: {} })
  const records = [genesis, add(owner, 'admin', admin, 'admin'), add(admin, 'bob', joiner, 'member')]
  const membership = computeMembership(records)
  const record = (key, fields) => buildRecord(key, { projectId: pid, ...fields })
  assert.deepEqual(recordRefusal(membership, record(joiner, { kind: 'member.remove', subject: 'admin' })), ['Only the owner or an admin can remove people', 'FORBIDDEN'])
  assert.deepEqual(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: 'owner' })), ['The project owner can’t be removed', 'FORBIDDEN'])
  assert.equal(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: 'bob' })), null)
  // Leaving: a person's own machine signs their removal; the owner can't leave.
  assert.equal(recordRefusal(membership, record(joiner, { kind: 'member.remove', subject: 'bob' })), null)
  assert.equal(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: 'admin' })), null)
  assert.deepEqual(recordRefusal(membership, record(owner, { kind: 'member.remove', subject: 'owner' })),
    ['The project owner can’t leave. The owner stays with the project for as long as it exists.', 'FORBIDDEN'])
  const box = generateMachineKey()
  const withBox = computeMembership([...records, buildRecord(joiner, { projectId: pid, kind: 'machine.add', subject: box.machineId, personId: 'bob',
    publicKey: box.publicKey, approval: {}, agentsOnly: true })])
  assert.deepEqual(recordRefusal(withBox, record(box, { kind: 'member.remove', subject: 'bob' })),
    ['This machine runs agents only, so it can’t act for you. Leave from one of your other machines.', 'FORBIDDEN'])
  assert.deepEqual(recordRefusal(membership, record(joiner, { kind: 'machine.remove', subject: joiner.machineId })),
    ['A machine can’t remove itself. Remove it from another of your machines, or ask an admin.', 'FORBIDDEN'])
  assert.deepEqual(recordRefusal(membership, record(admin, { kind: 'member.role', subject: 'bob', role: 'admin', replaces: null })), ['Only the owner can change roles', 'FORBIDDEN'])
  assert.equal(recordRefusal(membership, record(owner, { kind: 'member.role', subject: 'bob', role: 'admin', replaces: null })), null)
  assert.deepEqual(recordRefusal(membership, add(owner, 'carol', generateMachineKey(), 'member')), ['Admissions enter only through an approved join request', 'FORBIDDEN'])
  // After the admin is removed, the hub's gate refuses anything the admin's machine signs.
  const afterRemoval = computeMembership([...records, record(owner, { kind: 'member.remove', subject: 'admin' })])
  assert.deepEqual(recordRefusal(afterRemoval, record(admin, { kind: 'member.remove', subject: 'bob' })), ['This machine is no longer a member of the project', 'REVOKED'])
  assert.equal(maySign(afterRemoval, add(admin, 'carol', generateMachineKey(), 'member')), false)
  assert.ok(afterRemoval.people.some(person => person.id === 'bob'), 'people the removed admin admitted stay')
  // mayAuthor judges a draft before anything is signed.
  assert.equal(mayAuthor(membership, { kind: 'member.add', signer: admin.machineId, role: 'admin' }), false)
  assert.equal(mayAuthor(membership, { kind: 'member.add', signer: admin.machineId, role: 'member' }), true)
  assert.equal(mayAuthor(membership, { kind: 'machine.add', signer: joiner.machineId, personId: 'admin' }), false)
})

test('role chains expose their head so the next change names what it replaces', () => {
  const { owner, joiner, genesis } = project()
  const pid = genesis.projectId
  const added = buildRecord(owner, { projectId: pid, kind: 'member.add', subject: 'bob', role: 'member', displayName: 'Bob', machineId: joiner.machineId,
    publicKey: joiner.publicKey, offer: {}, joinRequest: {}, approval: {} })
  const promote = buildRecord(owner, { projectId: pid, kind: 'member.role', subject: 'bob', role: 'admin', replaces: null })
  const demote = buildRecord(owner, { projectId: pid, kind: 'member.role', subject: 'bob', role: 'member', replaces: promote.recordId })
  assert.equal(computeMembership([genesis, added]).people.find(person => person.id === 'bob').roleRecord, null)
  assert.equal(computeMembership([genesis, added, promote]).people.find(person => person.id === 'bob').roleRecord, promote.recordId)
  const bob = computeMembership([genesis, added, promote, demote]).people.find(person => person.id === 'bob')
  assert.deepEqual([bob.role, bob.roleRecord, bob.everAdmin], ['member', demote.recordId, true])
})
