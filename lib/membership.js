import { createHash } from 'node:crypto'
import { actorId } from './client-identity.js'
import { PERSON_ID, machineIdentity, personIdFor, rawPublicKey, verify } from './machine-key.js'
import { canonical } from './workspace-schema.js'

export const MEMBERSHIP_DOMAIN = 'pardner/member/v1'
/** The record format. Version 2 certifications carry their machine's consent, and person IDs are derived from keys. */
export const RECORD_VERSION = 2
/** A new machine's join request is signed under this label (lib/enrollment.js). */
export const JOIN_DOMAIN = 'pardner/join/v1'
/** The join request version that carries `offerHash`. */
export const JOIN_REQUEST_VERSION = 2
const OFFER_HASH_DOMAIN = 'pardner/offer-hash/v1'
const kinds = new Set(['project.genesis', 'member.add', 'member.role', 'member.remove', 'machine.add', 'machine.remove', 'agent.name', 'profile'])
const certifications = new Set(['project.genesis', 'member.add', 'machine.add'])
const RANK = { member: 1, admin: 2, owner: 3 }
const MACHINE_ID = /^machine-[a-z2-7]{26}$/
const hash = (...parts) => parts.reduce((digest, part) => digest.update(part), createHash('sha256')).digest('hex')
const bytes = value => Buffer.from(canonical(value), 'utf8')
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sorted = values => [...values].sort((a, b) => compare(a.id, b.id) || compare(a.personId ?? '', b.personId ?? ''))
const require = (condition, reason) => { if (!condition) throw new Error(reason) }
const text = value => typeof value === 'string' && value.trim().length > 0
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Protocol limits apply to every field, including unknown fields, offers and join requests. */
export const RECORD_LIMITS = Object.freeze({ bytes: 64 * 1024, depth: 16, text: 4096 })

function limitRecord(record) {
  let size = 0
  const add = count => { size += count; require(size <= RECORD_LIMITS.bytes, 'Record exceeds serialized size limit') }
  const string = value => {
    require(value.length <= RECORD_LIMITS.text, 'Record exceeds text length limit')
    add(Buffer.byteLength(JSON.stringify(value), 'utf8'))
  }
  function visit(value, depth) {
    require(depth <= RECORD_LIMITS.depth, 'Record exceeds nesting depth limit')
    if (typeof value === 'string') return string(value)
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return add(JSON.stringify(value).length)
    require(Array.isArray(value) || (object(value) && Object.getPrototypeOf(value) === Object.prototype), 'Record must contain only JSON values')
    add(2)
    let first = true
    for (const key of Object.keys(value)) {
      if (!first) add(1)
      first = false
      if (!Array.isArray(value)) { string(key); add(1) }
      visit(value[key], depth + 1)
    }
    if (Array.isArray(value)) require(Object.keys(value).length === value.length, 'Record must contain only JSON values')
  }
  visit(record, 0)
}

/** Check before any canonicalisation or cryptography, including at storage entry points. */
export function recordLimits(record) { return outcome(() => limitRecord(record)) }

function unsigned(record) {
  const { signature, recordId, ...body } = record
  return body
}

/** The hash a join request carries of the whole signed offer it answers, so its consent covers that offer and nothing else. */
export function offerHash(offer) {
  return hash(Buffer.from(OFFER_HASH_DOMAIN, 'utf8'), bytes(offer))
}

// Hash the unsigned genesis with projectId omitted to break its self-reference.
// The final signature covers the populated projectId, as for every other record.
export function genesisProjectId(record) {
  const { projectId, ...body } = unsigned(record)
  return hash(bytes(body))
}

/** The machine a certification certifies and the person it certifies it for. */
function certified(record) {
  return record.kind === 'machine.add' ? { machineId: record.subject, personId: record.personId } : { machineId: record.machineId, personId: record.subject }
}

/**
 * A member.add or machine.add counts only with its machine's consent: the
 * join request that machine signed, naming this project, the person it joins
 * and the hash of the embedded offer. The offer must give this record's role
 * or purpose, so a consent is never reused for another. Pure: it depends on
 * the record alone, so no pass of computeMembership ever sees a certification
 * without it.
 */
function requireConsent(record) {
  const { offer, joinRequest: request } = record
  const { machineId, personId } = certified(record)
  require(object(offer) && offer.projectId === record.projectId && typeof offer.offerId === 'string', 'The certification’s offer is for another project')
  if (record.kind === 'member.add') require(offer.purpose === 'human' && offer.role === record.role, 'The admission does not give the role its offer gave')
  else require(['device', 'agent'].includes(offer.purpose) && offer.personId === personId && (record.agentsOnly === true) === (offer.purpose === 'agent'),
    'The machine certification does not match the person or purpose its offer gave')
  require(object(request) && request.v === JOIN_REQUEST_VERSION && request.projectId === record.projectId && request.offerId === offer.offerId
    && request.purpose === offer.purpose && request.offerHash === offerHash(offer) && request.machineId === machineId
    && request.publicKey === record.publicKey && request.personId === personId && typeof request.signature === 'string',
  'The certified machine did not consent to this certification')
  const { signature, ...body } = request
  const raw = Buffer.from(signature, 'base64url')
  require(raw.toString('base64url') === signature && verify(record.publicKey, JOIN_DOMAIN, bytes(body), raw), 'The certified machine did not consent to this certification')
}

function validate(record) {
  limitRecord(record)
  require(object(record), 'Record must be an object')
  require(record.v === RECORD_VERSION && kinds.has(record.kind), 'Unsupported membership record version or kind')
  require(/^[a-f0-9]{64}$/.test(record.projectId), 'Invalid projectId')
  require(text(record.subject) && MACHINE_ID.test(record.signer), 'Invalid subject or signer')
  if (certifications.has(record.kind)) {
    rawPublicKey(record.publicKey)
    const { machineId, personId } = certified(record)
    require(machineIdentity(record.publicKey).machineId === machineId, 'Certified machine ID does not match public key')
    // A person's ID belongs to the machine they were admitted with; further machines join them by machine.add.
    if (record.kind !== 'machine.add') require(personId === personIdFor(record.publicKey), 'A person ID must be derived from the key of the machine the person is admitted with')
    else require(PERSON_ID.test(personId ?? ''), 'Machine admission requires a personId')
  }
  if (record.kind === 'project.genesis') {
    require(record.signer === record.machineId && text(record.displayName), 'Genesis must name and certify its owner machine')
    require(record.projectId === genesisProjectId(record), 'Genesis does not match projectId')
  }
  if (['member.add', 'member.role'].includes(record.kind)) require(['admin', 'member'].includes(record.role), 'Invalid member role')
  if (record.kind === 'member.role') require(record.replaces === null || (typeof record.replaces === 'string' && /^[a-f0-9]{64}$/.test(record.replaces)), 'Role requires replaces: recordId or null')
  if (record.kind === 'member.add') {
    require(text(record.displayName), 'Admission requires displayName')
    for (const field of ['offer', 'joinRequest', 'approval']) require(object(record[field]), `Admission requires ${field}`)
  }
  if (record.kind === 'machine.add') {
    for (const field of ['offer', 'joinRequest', 'approval']) require(object(record[field]), `Machine admission requires ${field}`)
    require(record.agentsOnly === undefined || typeof record.agentsOnly === 'boolean', 'agentsOnly must be a boolean')
  }
  if (record.kind === 'member.add' || record.kind === 'machine.add') requireConsent(record)
  if (record.kind === 'profile') require(text(record.displayName) && typeof record.email === 'string', 'Profile requires displayName and email')
  if (record.kind === 'agent.name') require(record.machineId === record.signer && text(record.displayName) && text(record.harness), 'Agent name must name its signing machine, displayName and harness')
}

/** Throws unless `record`, already validated, is signed by `publicKey` (the genesis by its own key) for `projectId`. */
function requireSignature(record, projectId, publicKey) {
  require(record.projectId === projectId, 'Wrong project')
  const key = record.kind === 'project.genesis' ? record.publicKey : publicKey
  require(machineIdentity(key).machineId === record.signer, 'Signer key does not match signer')
  require(typeof record.signature === 'string', 'Missing signature')
  const signature = Buffer.from(record.signature, 'base64url')
  require(signature.toString('base64url') === record.signature && verify(key, MEMBERSHIP_DOMAIN, bytes(unsigned(record)), signature), 'Invalid signature')
  require(record.recordId === hash(bytes(unsigned(record)), signature), 'Invalid recordId')
}

const outcome = check => { try { check(); return { valid: true } } catch (error) { return { valid: false, reason: error.message } } }

export function buildRecord(key, fields) {
  require(!['v', 'signer', 'signature', 'recordId'].some(field => Object.hasOwn(fields, field)), 'Record metadata is assigned by the builder')
  const record = { ...fields, v: RECORD_VERSION, signer: key.machineId }
  limitRecord(record)
  if (record.kind === 'project.genesis') {
    record.machineId = key.machineId
    record.publicKey = key.publicKey
    record.projectId = genesisProjectId(record)
  }
  validate(record)
  const signature = key.sign(MEMBERSHIP_DOMAIN, bytes(record))
  const signed = { ...record, signature: signature.toString('base64url'), recordId: hash(bytes(record), signature) }
  limitRecord(signed)
  return signed
}

// Verification establishes authenticity, consent and project binding, not admission authority.
// Genesis carries its own verification key; all other signers need a certified key.
export function verifyRecord(record, projectId, publicKey) {
  return outcome(() => { validate(record); requireSignature(record, projectId, publicKey) })
}

/**
 * Membership as a pure, order-free function of signed records
 * (docs/PARDNER-TRUST-DESIGN.md, section 2). Every consented certification of
 * a key counts, and none displaces another: record order and record IDs
 * decide nothing about who is certified. Authority is the least fixed point
 * of the admissions, read without removals; removals are applied on top.
 */
export function computeMembership(records, { projectId: expectedProjectId } = {}) {
  const rejected = [], candidates = new Map(), accepted = new Set()
  const reject = (record, reason) => rejected.push({ recordId: typeof record?.recordId === 'string' ? record.recordId : null, reason })
  const seen = new Set(), limited = new Set()
  for (const record of records) {
    // Deduplicate by the complete envelope, not an unverified claimed recordId, so a repeated record, valid or
    // not, changes nothing.
    const limits = recordLimits(record)
    if (!limits.valid) {
      const id = typeof record?.recordId === 'string' && record.recordId.length <= RECORD_LIMITS.text ? record.recordId : null
      const key = JSON.stringify([id, limits.reason])
      if (!limited.has(key)) { limited.add(key); rejected.push({ recordId: id, reason: limits.reason }) }
      continue
    }
    let envelope = null
    try { envelope = canonical(record) ?? null } catch { /* Not JSON: validate rejects it. */ }
    if (envelope !== null && seen.has(envelope)) continue
    if (envelope !== null) seen.add(envelope)
    try { validate(record) } catch (error) { reject(record, error.message); continue }
    candidates.set(envelope, record)
  }
  // Ordered only so that profiles, agent labels and concurrent role heads resolve alike everywhere; no
  // certification depends on it.
  const ordered = [...candidates.values()].sort((a, b) => compare(a.recordId ?? '', b.recordId ?? '') || compare(canonical(a), canonical(b)))
  const verified = new Map()
  const signatureFor = (record, projectId, publicKey) => {
    if (record.projectId !== projectId) return { valid: false, reason: 'Wrong project' }
    if (verified.has(record)) return verified.get(record)
    const verification = outcome(() => requireSignature(record, projectId, publicKey))
    if (publicKey || record.kind === 'project.genesis') verified.set(record, verification)
    return verification
  }
  const roots = ordered.filter(record => record.kind === 'project.genesis' && signatureFor(record, record.projectId).valid
    && (!expectedProjectId || record.projectId === expectedProjectId))
  const projects = new Set(roots.map(record => record.projectId))
  const root = projects.size === 1 ? roots[0] : null
  const projectId = expectedProjectId ?? root?.projectId ?? null
  // keys: machineId → { publicKey, people: personId → [{ record, by }] }, every counted certification of each key.
  // admissions: personId → [{ record, by }], the genesis and every counted member.add of that person.
  const keys = new Map(), admissions = new Map(), removedPeople = new Set(), removedMachines = new Set(), removals = []
  const profiles = new Map(), agents = new Map()
  if (!root) {
    for (const record of ordered) reject(record, projects.size > 1 ? 'Ambiguous project: supply projectId' : 'Missing valid genesis for project')
    return result()
  }
  const ownerId = root.subject
  let notify = () => {}
  const full = new Map(), admin = new Map()
  const everAdmin = new Set()
  const grant = (machineId, personId) => {
    if (!full.has(machineId)) full.set(machineId, new Set())
    if (full.get(machineId).has(personId)) return
    full.get(machineId).add(personId)
    notify(`full:${machineId}:${personId}`)
    if (personId === ownerId) notify(`owner:${machineId}`)
    if (everAdmin.has(personId)) {
      if (!admin.has(machineId)) notify(`admin:${machineId}`)
      if (!admin.has(machineId) || personId < admin.get(machineId)) admin.set(machineId, personId)
    }
  }
  const append = (map, key, value) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(value)
  }
  const certify = (record, by) => {
    const { machineId, personId } = certified(record)
    if (!keys.has(machineId)) keys.set(machineId, { publicKey: record.publicKey, people: new Map() })
    const people = keys.get(machineId).people
    append(people, personId, { record, by })
    if (record.agentsOnly !== true) grant(machineId, personId)
    if (record.kind !== 'machine.add') {
      const fresh = !admissions.has(personId)
      append(admissions, personId, { record, by })
      if (fresh) notify(`person:${personId}`)
    }
    accepted.add(record)
  }
  certify(root, null)
  // The people a machine is certified for, and those it may act for: an agents-only machine (every one of its
  // certifications for that person says agentsOnly) holds no membership authority for them. A key certified for
  // two people acts for either, so consenting twice undoes nothing it signed; it is removed below.
  const certifiedFor = machineId => [...(keys.get(machineId)?.people.keys() ?? [])].sort()
  const agentsOnly = (machineId, personId) => !full.get(machineId)?.has(personId)
  const actsFor = machineId => [...(full.get(machineId) ?? [])].sort()
  // Bindings never change; signature checks (including invalid genesis records) are cached per envelope.
  const verificationFor = record => signatureFor(record, projectId, keys.get(record.signer)?.publicKey)
  const authentic = record => keys.has(record.signer) && verificationFor(record).valid
  // The first person the signer acts for under whom `allowed(personId)` holds, or undefined.
  const authorizedAs = (record, allowed) => actsFor(record.signer).find(allowed)

  // The owner's machines first: only the owner's own machines certify another, so this pass is complete before
  // any role or admission is judged, and no admin can acquire an owner machine.
  fixedPoint(ordered.filter(record => record.kind === 'machine.add' && record.personId === ownerId),
    record => [`full:${record.signer}:${ownerId}`], record => {
    if (!full.get(record.signer)?.has(ownerId) || !authentic(record)) return false
    certify(record, { machineId: record.signer, personId: ownerId })
    return true
  })
  const fromOwner = record => full.get(record.signer)?.has(ownerId) && authentic(record)
  const roleRecords = new Map()
  for (const record of ordered) {
    if (record.kind !== 'member.role' || record.subject === ownerId || !fromOwner(record)) continue
    append(roleRecords, record.subject, record)
  }
  // Who has ever held admin: by the owner's admission or by any owner-signed role record. Only the owner admits
  // an admin, so this is fixed before the admissions are resolved, which keeps the fixed point monotone.
  const roles = new Map(), heads = new Map()
  for (const [personId, chain] of roleRecords) {
    const replaced = new Set(chain.map(record => record.replaces))
    // Only valid roles for this person replace each other. Concurrent heads and
    // missing predecessors resolve alike: the greatest unreplaced recordId wins.
    const head = chain.filter(record => !replaced.has(record.recordId)).at(-1)
    if (head) { roles.set(personId, head.role); heads.set(personId, head.recordId) }
    if (chain.some(record => record.role === 'admin')) everAdmin.add(personId)
  }
  for (const record of ordered) if (record.kind === 'member.add' && record.role === 'admin' && fromOwner(record)) everAdmin.add(record.subject)
  const mayRemove = (signerId, targetId) => targetId !== ownerId && (signerId === ownerId || (everAdmin.has(signerId) && !everAdmin.has(targetId)))

  // The owner pass fixed everAdmin. Keep aggregate authority so repeated certifications never rescan it.
  for (const [machineId, people] of full) for (const personId of people) {
    if (everAdmin.has(personId) && (!admin.has(machineId) || personId < admin.get(machineId))) admin.set(machineId, personId)
  }
  const admissionAuthority = record => {
    const people = full.get(record.signer)
    const choices = []
    if (people?.has(ownerId)) choices.push(ownerId)
    if ((record.kind === 'member.add' ? record.role === 'member' : record.personId !== ownerId && !everAdmin.has(record.personId))
      && admin.has(record.signer)) choices.push(admin.get(record.signer))
    if (record.kind === 'machine.add' && people?.has(record.personId)) choices.push(record.personId)
    return choices.sort()[0]
  }
  // Each record subscribes to at most four one-time authority facts, not to every certification of its signer.
  fixedPoint(ordered.filter(record => record.kind === 'member.add' || record.kind === 'machine.add'), record => [
    `owner:${record.signer}`, `admin:${record.signer}`,
    ...(record.kind === 'machine.add' ? [`full:${record.signer}:${record.personId}`, `person:${record.personId}`] : []),
  ], record => {
    if (record.kind === 'machine.add' && !admissions.has(record.personId)) return false
    const as = admissionAuthority(record)
    if (!as || !authentic(record)) return false
    certify(record, { machineId: record.signer, personId: as })
    return true
  })

  // Removals, roles, profiles and labels, judged with the authority above, which removals never reduce. Removed
  // and demoted signers keep historical authority here; refusing newly arriving records belongs to maySign.
  // Profiles and agent labels use the greatest recordId, without a clock.
  for (const record of ordered) {
    if (accepted.has(record)) continue
    const verification = verificationFor(record)
    if (!verification.valid) { reject(record, verification.reason); continue }
    let as
    switch (record.kind) {
      case 'member.role':
        as = admissions.has(record.subject) && record.subject !== ownerId ? authorizedAs(record, signerId => signerId === ownerId) : undefined
        break
      case 'member.remove':
        // The owner and admins remove; a person's own full machine removes its person, to leave. The owner can't leave.
        as = admissions.has(record.subject) ? authorizedAs(record, signerId => mayRemove(signerId, record.subject)
          || (signerId === record.subject && record.subject !== ownerId)) : undefined
        if (as) { removedPeople.add(record.subject); removals.push(removal(record, as)) }
        break
      case 'machine.remove': {
        const targets = record.subject === record.signer ? [] : certifiedFor(record.subject)
        as = authorizedAs(record, signerId => targets.some(targetId => signerId === targetId || mayRemove(signerId, targetId)))
        if (as) { removedMachines.add(record.subject); removals.push(removal(record, as)) }
        break
      }
      case 'profile':
        as = admissions.has(record.subject) ? authorizedAs(record, signerId => signerId === record.subject) : undefined
        if (as) profiles.set(record.subject, record)
        break
      case 'agent.name':
        // Any certified machine, agents-only included, labels the agents of a person it is certified for; agent IDs
        // are local to their machine, so another machine cannot rename one.
        as = certifiedFor(record.signer).find(personId => record.subject === actorId(personId, record.harness))
        if (as) agents.set(canonical([record.signer, record.subject]), { id: record.subject, machineId: record.signer, displayName: record.displayName, harness: record.harness })
        break
    }
    if (as) accepted.add(record)
    else reject(record, certifications.has(record.kind) ? 'Unauthorized admission'
      : keys.get(record.signer) && !actsFor(record.signer).length ? 'An agents-only machine holds no membership authority'
        : 'Unauthorized record or unknown subject')
  }
  for (const [machineId, { people }] of keys) {
    // A key certified for two different people is removed; what it signed still counts above.
    if (people.size > 1 || [...people.keys()].some(personId => removedPeople.has(personId))) removedMachines.add(machineId)
  }
  return result()

  function removal(record, as) {
    return { recordId: record.recordId, kind: record.kind, subject: record.subject, by: { machineId: record.signer, personId: as },
      left: record.kind === 'member.remove' && as === record.subject }
  }
  function fixedPoint(records, dependencies, apply) {
    const waiting = new Map(), queue = [...records], queued = new Set(records)
    for (const record of records) for (const dependency of dependencies(record)) {
      if (!waiting.has(dependency)) waiting.set(dependency, [])
      waiting.get(dependency).push(record)
    }
    notify = fact => {
      for (const record of waiting.get(fact) ?? []) if (!accepted.has(record) && !queued.has(record)) {
        queued.add(record)
        queue.push(record)
      }
      waiting.delete(fact)
    }
    for (let index = 0; index < queue.length; index++) {
      const record = queue[index]
      queued.delete(record)
      if (!accepted.has(record)) apply(record)
    }
    notify = () => {}
  }

  // For display only (who admitted a person or a machine): the genesis, then an admission, then a pairing, then the
  // smallest recordId. Authority never depends on this choice.
  function shown(entries) {
    const order = { 'project.genesis': 0, 'member.add': 1, 'machine.add': 2 }
    return entries.reduce((a, b) => (order[a.record.kind] - order[b.record.kind] || compare(a.record.recordId, b.record.recordId)) <= 0 ? a : b)
  }
  function personView(personId) {
    const first = shown(admissions.get(personId)), profile = profiles.get(personId)
    if (personId === ownerId) {
      return { id: personId, role: 'owner', everAdmin: false, displayName: profile?.displayName ?? root.displayName, admittedBy: null,
        ...(profile ? { email: profile.email } : {}) }
    }
    const admitted = admissions.get(personId).reduce((role, { record }) => RANK[record.role] > RANK[role] ? record.role : role, 'member')
    return { id: personId, role: roles.get(personId) ?? admitted, everAdmin: everAdmin.has(personId), displayName: profile?.displayName ?? first.record.displayName,
      roleRecord: heads.get(personId) ?? null, admittedBy: first.by, ...(profile ? { email: profile.email } : {}) }
  }
  function machineView(machineId, personId, twice = false) {
    const { publicKey, people } = keys.get(machineId), first = shown(people.get(personId))
    return { id: machineId, personId, publicKey, ...(agentsOnly(machineId, personId) ? { agentsOnly: true } : {}), admittedBy: first.by,
      ...(first.record.kind === 'machine.add' ? { paired: true } : {}), ...(twice ? { certifiedTwice: true } : {}) }
  }
  function result() {
    const machineViews = [...keys].flatMap(([machineId, { people }]) => [...people.keys()].map(personId => machineView(machineId, personId, people.size > 1)))
    return {
      projectId,
      people: sorted([...admissions.keys()].filter(id => !removedPeople.has(id)).map(personView)),
      machines: sorted(machineViews.filter(machine => !removedMachines.has(machine.id))),
      agentNames: [...agents.values()].filter(agent => !removedMachines.has(agent.machineId)).sort((a, b) => compare(a.machineId, b.machineId) || compare(a.id, b.id)),
      removedPeople: [...removedPeople].sort(), removedMachines: [...removedMachines].sort(),
      // What removed people and machines were, for showing them as removed rather than as offline (#175). A key
      // certified for two people appears once for each.
      formerPeople: sorted([...removedPeople].map(personView)),
      formerMachines: sorted(machineViews.filter(machine => removedMachines.has(machine.id))),
      removals: removals.sort((a, b) => compare(a.recordId, b.recordId)),
      rejected: rejected.sort((a, b) => compare(canonical(a), canonical(b))),
    }
  }
}

export function isMember(membership, machineId) {
  return membership.machines.some(machine => machine.id === machineId)
}

// Arrival-time policy for a peer's current state, deliberately separate from
// historical set reduction. The caller must persist accepted records itself.
export function maySign(membership, record) {
  const machine = membership.machines.find(machine => machine.id === record?.signer)
  return Boolean(machine && verifyRecord(record, membership.projectId, machine.publicKey).valid && mayAuthor(membership, record))
}

// Whether `record.signer` may author `record` now, judged on its kind and
// fields alone. maySign adds the signature and consent checks; enrollment uses
// this to decide who may approve a request before anything is signed.
export function mayAuthor(membership, record) {
  const machine = membership.machines.find(machine => machine.id === record?.signer)
  if (!machine) return false
  const signer = membership.people.find(person => person.id === machine.personId)
  if (!signer) return false
  // Every machine labels its own person's agents. An agents-only machine signs nothing else.
  if (record.kind === 'agent.name') return record.machineId === record.signer && record.subject === actorId(signer.id, record.harness)
  if (machine.agentsOnly === true) return false
  const person = membership.people.find(person => person.id === record.subject)
  const mayRemove = target => Boolean(target && target.role !== 'owner'
    && (signer.role === 'owner' || (signer.role === 'admin' && target.role === 'member' && !target.everAdmin)))
  switch (record.kind) {
    case 'member.add':
      return signer.role === 'owner' || (signer.role === 'admin' && record.role === 'member')
    case 'member.role':
      return signer.role === 'owner' && Boolean(person && person.role !== 'owner')
    case 'member.remove':
      // A person's own machine may sign their removal, to leave; the owner can't leave.
      return mayRemove(person) || Boolean(person && person.id === signer.id && person.role !== 'owner')
    case 'machine.add': {
      const target = membership.people.find(person => person.id === record.personId)
      return Boolean(target && (target.id === signer.id || mayRemove(target)))
    }
    case 'machine.remove': {
      const targetMachine = membership.machines.find(machine => machine.id === record.subject)
      const target = membership.people.find(person => person.id === targetMachine?.personId)
      return record.subject !== record.signer && Boolean(target && (target.id === signer.id || mayRemove(target)))
    }
    case 'profile':
      return person?.id === signer.id
    default:
      return false
  }
}

/**
 * Who removed `machineId`, and whether its person left, from the records: `{ kind, left, by }`, or null if unknown.
 * A machine removed because its key was certified for two people says so (`certifiedTwice`), with no remover.
 */
export function removalFor(membership, machineId) {
  const machine = [...(membership.formerMachines ?? []), ...membership.machines].find(entry => entry.id === machineId)
  const removals = membership.removals ?? []
  const entry = (machine && removals.find(removal => removal.kind === 'member.remove' && removal.subject === machine.personId))
    ?? removals.find(removal => removal.kind === 'machine.remove' && removal.subject === machineId)
  if (!entry) return machine?.certifiedTwice && membership.removedMachines?.includes(machineId) ? { kind: 'machine', left: false, by: null, certifiedTwice: true } : null
  const name = [...membership.people, ...(membership.formerPeople ?? [])].find(person => person.id === entry.by.personId)?.displayName ?? null
  return { kind: entry.kind === 'member.remove' ? 'person' : 'machine', left: entry.left === true, by: { personId: entry.by.personId, name } }
}
