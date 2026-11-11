import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { actorId } from '../lib/client-identity.js'
import {
  agentNameRecord, buildJoinRequest, buildOffer, certificationFields, collidingCodes, confirmationCode, decodeInvitation, encodeInvitation, joinRequestRefusal,
  machineAccess, macMatches, newNonce, newSecret, offerRefusal, recordRefusal, requestRecordRefusal, sameCode,
} from '../lib/enrollment.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { buildRecord, computeMembership, mayAuthor, maySign, offerHash } from '../lib/membership.js'
import { trustProject } from '../support/trust-records.js'

function project() {
  const p = trustProject(), joiner = generateMachineKey()
  const offer = buildOffer(p.owner, { projectId: p.projectId, offerId: randomUUID(), purpose: 'human', role: 'member',
    routes: ['https://hub.example.test/pardner/client/v1/enroll'], expiresAt: Date.now() + 60000 })
  return { ...p, joiner, bob: personIdFor(joiner.publicKey), offer }
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
  const { joiner, offer, bob } = project()
  const secret = newSecret()
  const { request, mac } = buildJoinRequest(joiner, secret, { offer, personId: bob, identity, device, agent })
  assert.equal(joinRequestRefusal(request, offer), null)
  assert.equal(request.v, 2)
  assert.equal(request.offerHash, offerHash(offer), 'the request names the whole offer it answers')
  assert.equal(macMatches(secret, request, mac), true)
  assert.equal(macMatches(newSecret(), request, mac), false, 'another secret does not key this request')
  assert.equal(macMatches(secret, { ...request, personId: 'mallory' }, mac), false)
  assert.equal(joinRequestRefusal({ ...request, profile: { name: 'Mallory', email: 'mallory@example.test' } }, offer), 'Invalid join request signature')
  assert.equal(joinRequestRefusal({ ...request, personId: 'mallory' }, offer), 'A new person’s ID must be derived from the key they join with')
  const other = generateMachineKey()
  assert.equal(joinRequestRefusal({ ...request, publicKey: other.publicKey }, offer), 'The join request machine ID does not match its key')
  assert.equal(joinRequestRefusal(request, { ...offer, offerId: randomUUID() }), 'The join request does not match its invitation')
  assert.equal(joinRequestRefusal(request, { ...offer, expiresAt: offer.expiresAt + 1 }), 'The join request does not match its invitation', 'another offer, another hash')
  const misnamed = buildJoinRequest(joiner, secret, { offer, personId: personIdFor(other.publicKey), identity, device, agent }).request
  assert.equal(joinRequestRefusal(misnamed, offer), 'A new person’s ID must be derived from the key they join with')
  const label = agentNameRecord(joiner, offer.projectId, bob, agent)
  assert.equal(requestRecordRefusal(label, request), null)
  assert.equal(requestRecordRefusal(agentNameRecord(joiner, offer.projectId, 'someone-else', agent), request), 'The agent label names another person’s agent')
  assert.equal(requestRecordRefusal(agentNameRecord(other, offer.projectId, bob, agent), request), 'The agent label is not signed by the joining machine')
})

test('an approved request becomes a certification that embeds the offer and the joiner’s consent', () => {
  const p = project(), box = generateMachineKey()
  const { request } = buildJoinRequest(p.joiner, newSecret(), { offer: p.offer, personId: p.bob, identity, device, agent })
  const approval = { requestId: 'join-1', nonce: newNonce() }
  const admission = buildRecord(p.owner, certificationFields({ projectId: p.projectId, offer: p.offer, request, approval }))
  assert.deepEqual([admission.kind, admission.subject, admission.role, admission.machineId], ['member.add', p.bob, 'member', p.joiner.machineId])
  assert.deepEqual([admission.offer, admission.joinRequest, admission.approval], [p.offer, request, approval])
  const agents = buildOffer(p.joiner, { projectId: p.projectId, offerId: randomUUID(), purpose: 'agent', personId: p.bob, routes: p.offer.routes, expiresAt: p.offer.expiresAt })
  const boxRequest = buildJoinRequest(box, newSecret(), { offer: agents, personId: p.bob, device, agent }).request
  const pairing = buildRecord(p.joiner, certificationFields({ projectId: p.projectId, offer: agents, request: boxRequest, approval }))
  assert.deepEqual([pairing.kind, pairing.subject, pairing.personId, pairing.agentsOnly], ['machine.add', box.machineId, p.bob, true])
  const state = computeMembership([p.genesis, admission, pairing])
  assert.deepEqual(state.rejected, [])
  assert.equal(state.machines.find(machine => machine.id === box.machineId).agentsOnly, true)
  // Nobody can build one for a request the machine did not sign for this offer.
  assert.throws(() => buildRecord(p.owner, certificationFields({ projectId: p.projectId, offer: agents, request, approval })), /offer gave|consent/)
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
  const p = project(), { owner, joiner, genesis, bob } = p
  const box = generateMachineKey()
  const pid = genesis.projectId
  const stolen = agentNameRecord(box, pid, p.ownerId, { harnessId: 'cursor', name: 'Stolen' })
  const records = [genesis, p.admit(owner, joiner, { name: 'Bob' }), p.pair(joiner, box, bob, { agentsOnly: true }),
    agentNameRecord(joiner, pid, bob, agent),
    agentNameRecord(box, pid, bob, { harnessId: 'cursor', name: 'Box' }),
    // A label for another person's agent grants nothing to this machine.
    stolen]
  const membership = computeMembership(records)
  assert.deepEqual(membership.rejected.map(entry => entry.recordId), [stolen.recordId])
  assert.deepEqual(machineAccess(membership, joiner.machineId).actorIds, [actorId(bob), actorId(bob, 'openai-codex')])
  const access = machineAccess(membership, box.machineId)
  assert.equal(access.humanAllowed, false)
  assert.deepEqual(access.actorIds, [actorId(bob, 'cursor')])
  assert.equal(machineAccess(membership, generateMachineKey().machineId), null)
  const removed = computeMembership([...records, p.removeMachine(owner, box)])
  assert.equal(machineAccess(removed, box.machineId), null)
})

test('the gate refuses records a signer may not author now, with reasons a person can act on', () => {
  const p = project(), { owner, joiner, genesis, bob } = p
  const pid = genesis.projectId, admin = generateMachineKey(), adminId = personIdFor(admin.publicKey), ownerId = p.ownerId
  const records = [genesis, p.admit(owner, admin, { role: 'admin' }), p.admit(admin, joiner)]
  const membership = computeMembership(records)
  const record = (key, fields) => buildRecord(key, { projectId: pid, ...fields })
  assert.deepEqual(recordRefusal(membership, record(joiner, { kind: 'member.remove', subject: adminId })), ['Only the owner or an admin can remove people', 'FORBIDDEN'])
  assert.deepEqual(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: ownerId })), ['The project owner can’t be removed', 'FORBIDDEN'])
  assert.equal(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: bob })), null)
  // Leaving: a person's own machine signs their removal; the owner can't leave.
  assert.equal(recordRefusal(membership, record(joiner, { kind: 'member.remove', subject: bob })), null)
  assert.equal(recordRefusal(membership, record(admin, { kind: 'member.remove', subject: adminId })), null)
  assert.deepEqual(recordRefusal(membership, record(owner, { kind: 'member.remove', subject: ownerId })),
    ['The project owner can’t leave. The owner stays with the project for as long as it exists.', 'FORBIDDEN'])
  // An agents-only machine labels its own person's agents and signs nothing else.
  const box = generateMachineKey()
  const withBox = computeMembership([...records, p.pair(joiner, box, bob, { agentsOnly: true })])
  const agentsOnly = ['This machine runs agents only, so it can’t change who is in this project, leave it or edit a profile. Do that from one of your other machines.', 'FORBIDDEN']
  for (const fields of [{ kind: 'member.remove', subject: bob }, { kind: 'machine.remove', subject: joiner.machineId },
    { kind: 'profile', subject: bob, displayName: 'Box', email: '' }]) assert.deepEqual(recordRefusal(withBox, record(box, fields)), agentsOnly, fields.kind)
  assert.deepEqual(recordRefusal(withBox, p.pair(box, generateMachineKey(), bob)), agentsOnly)
  assert.equal(recordRefusal(withBox, agentNameRecord(box, pid, bob, { harnessId: 'cursor' })), null)
  assert.deepEqual(recordRefusal(membership, record(joiner, { kind: 'machine.remove', subject: joiner.machineId })),
    ['A machine can’t remove itself. Remove it from another of your machines, or ask an admin.', 'FORBIDDEN'])
  assert.deepEqual(recordRefusal(membership, record(admin, { kind: 'member.role', subject: bob, role: 'admin', replaces: null })), ['Only the owner can change roles', 'FORBIDDEN'])
  assert.equal(recordRefusal(membership, record(owner, { kind: 'member.role', subject: bob, role: 'admin', replaces: null })), null)
  assert.deepEqual(recordRefusal(membership, p.admit(owner, generateMachineKey())), ['Admissions enter only through an approved join request', 'FORBIDDEN'])
  // After the admin is removed, the hub's gate refuses anything the admin's machine signs.
  const afterRemoval = computeMembership([...records, record(owner, { kind: 'member.remove', subject: adminId })])
  assert.deepEqual(recordRefusal(afterRemoval, record(admin, { kind: 'member.remove', subject: bob })), ['This machine is no longer a member of the project', 'REVOKED'])
  assert.equal(maySign(afterRemoval, p.admit(admin, generateMachineKey())), false)
  assert.ok(afterRemoval.people.some(person => person.id === bob), 'people the removed admin admitted stay')
  // mayAuthor judges a draft before anything is signed.
  assert.equal(mayAuthor(membership, { kind: 'member.add', signer: admin.machineId, role: 'admin' }), false)
  assert.equal(mayAuthor(membership, { kind: 'member.add', signer: admin.machineId, role: 'member' }), true)
  assert.equal(mayAuthor(membership, { kind: 'machine.add', signer: joiner.machineId, personId: adminId }), false)
  assert.equal(mayAuthor(withBox, { kind: 'machine.add', signer: box.machineId, personId: bob }), false, 'an agents-only machine approves nothing')
})

test('role chains expose their head so the next change names what it replaces', () => {
  const p = project(), { owner, joiner, genesis } = p
  const added = p.admit(owner, joiner, { name: 'Bob' })
  const promote = p.role(owner, p.bob, 'admin')
  const demote = p.role(owner, p.bob, 'member', promote.recordId)
  assert.equal(computeMembership([genesis, added]).people.find(person => person.id === p.bob).roleRecord, null)
  assert.equal(computeMembership([genesis, added, promote]).people.find(person => person.id === p.bob).roleRecord, promote.recordId)
  const bob = computeMembership([genesis, added, promote, demote]).people.find(person => person.id === p.bob)
  assert.deepEqual([bob.role, bob.roleRecord, bob.everAdmin], ['member', demote.recordId, true])
})
