import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { buildJoinRequest, buildOffer, certificationFields, newNonce, newSecret } from '../lib/enrollment.js'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { MEMBERSHIP_DOMAIN, buildRecord } from '../lib/membership.js'
import { canonical } from '../lib/workspace-schema.js'

const ROUTES = ['https://hub.example.test/pardner/client/v1/enroll']

/**
 * Test-only: a project whose genesis (`genesis`, or a new one) is signed by `owner`, and builders for
 * its membership records with real keys. Every certification goes through
 * the enrollment code: a signed offer, the joining key's signed join request
 * for that offer (its consent), and the record that embeds both.
 */
export function trustProject({ owner = generateMachineKey(), ownerName = 'Owner', genesis: given } = {}) {
  const genesis = given ?? buildRecord(owner, { kind: 'project.genesis', subject: personIdFor(owner.publicKey), displayName: ownerName,
    nonce: randomBytes(16).toString('base64url') })
  const projectId = genesis.projectId
  const person = key => personIdFor(key.publicKey)
  const offer = (issuer, fields) => buildOffer(issuer, { projectId, offerId: randomUUID(), routes: ROUTES, expiresAt: Date.now() + 3600000, ...fields })
  /** `key`'s join request for `forOffer`, joining `personId`: the key's consent to that one certification. */
  const consent = (key, forOffer, personId, name = 'Joiner') => buildJoinRequest(key, newSecret(), { offer: forOffer, personId,
    identity: { name, email: 'joiner@example.test' }, device: { id: randomUUID(), name: 'Test machine' }, agent: {} }).request
  const approval = () => ({ requestId: `join-${randomBytes(16).toString('hex')}`, nonce: newNonce() })
  const record = (key, kind, subject, fields = {}) => buildRecord(key, { projectId, kind, subject, ...fields })
  /** `signer` admits `key` as a new person with `role`; the person's ID is derived from `key`. */
  const admit = (signer, key, { role = 'member', name = 'Member', issuer = signer } = {}) => {
    const forOffer = offer(issuer, { purpose: 'human', role })
    return buildRecord(signer, certificationFields({ projectId, offer: forOffer, request: consent(key, forOffer, person(key), name), approval: approval() }))
  }
  /** `signer` pairs `key` into `personId`, as a full machine or, with `agentsOnly`, through an Agent offer. */
  const pair = (signer, key, personId, { agentsOnly = false, issuer = signer } = {}) => {
    const forOffer = offer(issuer, { purpose: agentsOnly ? 'agent' : 'device', personId })
    return buildRecord(signer, certificationFields({ projectId, offer: forOffer, request: consent(key, forOffer, personId), approval: approval() }))
  }
  const remove = (signer, subject) => record(signer, 'member.remove', subject)
  const removeMachine = (signer, key) => record(signer, 'machine.remove', key.machineId)
  const role = (signer, personId, newRole, replaces = null, fields = {}) => record(signer, 'member.role', personId, { role: newRole, replaces, ...fields })
  return { owner, ownerId: person(owner), genesis, projectId, person, offer, consent, approval, record, admit, pair, remove, removeMachine, role }
}

/**
 * Test-only: re-signs `record` with `key` after changing its fields, as a
 * modified client could, bypassing buildRecord's checks. The result carries
 * a valid signature and record ID over whatever it now says.
 */
export function forge(key, record, changes = {}) {
  const { signature, recordId, ...body } = { ...record, ...changes, signer: key.machineId }
  for (const [field, value] of Object.entries(changes)) if (value === undefined) delete body[field]
  const data = Buffer.from(canonical(body))
  const signed = key.sign(MEMBERSHIP_DOMAIN, data)
  return { ...body, signature: signed.toString('base64url'), recordId: createHash('sha256').update(data).update(signed).digest('hex') }
}

/** Every ordering of `values`. */
export function* permutations(values) {
  if (!values.length) { yield []; return }
  for (let i = 0; i < values.length; i++) for (const tail of permutations(values.filter((_, index) => index !== i))) yield [values[i], ...tail]
}

/** `values` in a pseudo-random order fixed by `seed`. */
export function shuffled(values, seed) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export { newSecret }
