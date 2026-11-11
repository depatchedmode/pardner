import { createHash } from 'node:crypto'
import { canonical } from './workspace-schema.js'
import { machineIdentity, rawPublicKey, verify } from './machine-key.js'

export const MEMBERSHIP_DOMAIN = 'pardner/member/v1'
const kinds = new Set(['project.genesis', 'member.add', 'member.role', 'member.remove', 'machine.add', 'machine.remove', 'agent.name', 'profile'])
const hash = (...parts) => parts.reduce((digest, part) => digest.update(part), createHash('sha256')).digest('hex')
const bytes = value => Buffer.from(canonical(value), 'utf8')
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sorted = values => [...values].sort((a, b) => compare(a.id, b.id))
const require = (condition, reason) => { if (!condition) throw new Error(reason) }
const text = value => typeof value === 'string' && value.trim().length > 0
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function json(value) {
  require(value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) && Array.from(value).every(item => { json(item); return true }))
    || (object(value) && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(item => { json(item); return true })), 'Record must contain only JSON values')
}

function unsigned(record) {
  const { signature, recordId, ...body } = record
  return body
}

// Hash the unsigned genesis with projectId omitted to break its self-reference.
// The final signature covers the populated projectId, as for every other record.
export function genesisProjectId(record) {
  const { projectId, ...body } = unsigned(record)
  return hash(bytes(body))
}

function validate(record) {
  json(record)
  require(object(record), 'Record must be an object')
  require(record.v === 1 && kinds.has(record.kind), 'Unsupported membership record version or kind')
  require(/^[a-f0-9]{64}$/.test(record.projectId), 'Invalid projectId')
  require(text(record.subject) && /^machine-[a-z2-7]{26}$/.test(record.signer), 'Invalid subject or signer')
  if (['project.genesis', 'member.add', 'machine.add'].includes(record.kind)) {
    rawPublicKey(record.publicKey)
    const id = machineIdentity(record.publicKey).machineId
    require(id === (record.kind === 'machine.add' ? record.subject : record.machineId), 'Certified machine ID does not match public key')
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
    require(text(record.personId) && object(record.approval), 'Machine admission requires personId and approval')
    require(record.agentsOnly === undefined || typeof record.agentsOnly === 'boolean', 'agentsOnly must be a boolean')
  }
  if (record.kind === 'profile') require(text(record.displayName) && typeof record.email === 'string', 'Profile requires displayName and email')
  if (record.kind === 'agent.name') require(record.machineId === record.signer && text(record.displayName) && text(record.harness), 'Agent name must name its signing machine, displayName and harness')
}

export function buildRecord(key, fields) {
  require(!['v', 'signer', 'signature', 'recordId'].some(field => Object.hasOwn(fields, field)), 'Record metadata is assigned by the builder')
  const record = { ...fields, v: 1, signer: key.machineId }
  if (record.kind === 'project.genesis') {
    record.machineId = key.machineId
    record.publicKey = key.publicKey
    record.projectId = genesisProjectId(record)
  }
  validate(record)
  const signature = key.sign(MEMBERSHIP_DOMAIN, bytes(record))
  return { ...record, signature: signature.toString('base64url'), recordId: hash(bytes(record), signature) }
}

// Verification establishes authenticity and project binding, not admission authority.
// Genesis carries its own verification key; all other signers need a certified key.
export function verifyRecord(record, projectId, publicKey) {
  try {
    validate(record)
    require(record.projectId === projectId, 'Wrong project')
    const key = record.kind === 'project.genesis' ? record.publicKey : publicKey
    require(machineIdentity(key).machineId === record.signer, 'Signer key does not match signer')
    require(typeof record.signature === 'string', 'Missing signature')
    const signature = Buffer.from(record.signature, 'base64url')
    require(signature.toString('base64url') === record.signature && verify(key, MEMBERSHIP_DOMAIN, bytes(unsigned(record)), signature), 'Invalid signature')
    require(record.recordId === hash(bytes(unsigned(record)), signature), 'Invalid recordId')
    return { valid: true }
  } catch (error) {
    return { valid: false, reason: error.message }
  }
}

export function computeMembership(records, { projectId: expectedProjectId } = {}) {
  const rejected = [], candidates = new Map(), accepted = new Set()
  const reject = (record, reason) => rejected.push({ recordId: typeof record?.recordId === 'string' ? record.recordId : null, reason })
  for (const record of records) {
    try { validate(record) } catch (error) { reject(record, error.message); continue }
    // Deduplicate by the complete envelope, not an unverified claimed recordId.
    candidates.set(canonical(record), record)
  }
  const ordered = [...candidates.values()].sort((a, b) => compare(a.recordId ?? '', b.recordId ?? '') || compare(canonical(a), canonical(b)))
  const roots = ordered.filter(record => record.kind === 'project.genesis' && verifyRecord(record, record.projectId).valid
    && (!expectedProjectId || record.projectId === expectedProjectId))
  const projects = new Set(roots.map(record => record.projectId))
  const root = projects.size === 1 ? roots[0] : null
  const projectId = expectedProjectId ?? root?.projectId ?? null
  const people = new Map(), machines = new Map(), agents = new Map()
  const removedPeople = new Set(), removedMachines = new Set(), removals = []
  // Who signed each counted removal. A person who left removed themselves (`left`).
  const removal = record => ({ recordId: record.recordId, kind: record.kind, subject: record.subject, by: by(record),
    left: record.kind === 'member.remove' && machines.get(record.signer).personId === record.subject })
  if (!root) {
    for (const record of ordered) reject(record, projects.size > 1 ? 'Ambiguous project: supply projectId' : 'Missing valid genesis for project')
    return result()
  }
  const ownerId = root.subject
  // `admittedBy` names the machine that signed the certification, and that machine's person; null for the genesis.
  const by = record => ({ machineId: record.signer, personId: machines.get(record.signer).personId })
  // An agents-only machine may act only as the agents it names, never as its person (machine.add `agentsOnly`).
  // `paired` marks a machine added to an existing person (machine.add) rather than with their admission.
  const admitMachine = (id, personId, publicKey, agentsOnly = false, admittedBy = null, paired = false) =>
    machines.set(id, { id, personId, publicKey, ...(agentsOnly ? { agentsOnly: true } : {}), admittedBy, ...(paired ? { paired: true } : {}) })
  people.set(ownerId, { id: ownerId, role: 'owner', everAdmin: false, displayName: root.displayName, admittedBy: null })
  admitMachine(root.machineId, ownerId, root.publicKey)
  accepted.add(root)
  const verified = new Map()
  const verificationFor = record => {
    const publicKey = machines.get(record.signer)?.publicKey
    // Bindings never change. Cache only after a key is known so a later fixed-
    // point pass can discover a signer without repeating successful crypto work.
    if (!verified.has(record) && publicKey) verified.set(record, verifyRecord(record, projectId, publicKey))
    return verified.get(record) ?? verifyRecord(record, projectId, publicKey)
  }
  const authentic = record => machines.has(record.signer) && verificationFor(record).valid

  // Resolve the owner's machine chain first: only that person's machines can
  // certify another owner machine. This makes owner role decisions independent
  // of member admission order and prevents admins from acquiring the owner key.
  fixedPoint(record => {
    if (record.kind !== 'machine.add' || record.personId !== ownerId || machines.get(record.signer)?.personId !== ownerId || !authentic(record)) return false
    if (machines.has(record.subject)) return false
    admitMachine(record.subject, ownerId, record.publicKey, record.agentsOnly === true, by(record), true)
    return true
  })
  const roleRecords = new Map()
  for (const record of ordered) {
    if (record.kind !== 'member.role' || record.subject === ownerId || machines.get(record.signer)?.personId !== ownerId || !authentic(record)) continue
    if (!roleRecords.has(record.subject)) roleRecords.set(record.subject, [])
    roleRecords.get(record.subject).push(record)
  }
  const roles = new Map(), heads = new Map(), promoted = new Set()
  for (const [personId, records] of roleRecords) {
    const replaced = new Set(records.map(record => record.replaces))
    // Only valid roles for this person replace each other. Concurrent heads and
    // missing predecessors resolve alike: the greatest unreplaced recordId wins.
    const head = records.filter(record => !replaced.has(record.recordId)).at(-1)
    if (head) { roles.set(personId, head.role); heads.set(personId, head.recordId) }
    if (records.some(record => record.role === 'admin')) promoted.add(personId)
  }
  // `roleRecord` is the head of the person's role chain, which a new member.role names in `replaces`.
  const personFromAdmission = record => ({
    id: record.subject, role: roles.get(record.subject) ?? record.role,
    everAdmin: record.role === 'admin' || promoted.has(record.subject), displayName: record.displayName,
    roleRecord: heads.get(record.subject) ?? null, admittedBy: machines.has(record.signer) ? by(record) : null,
  })
  const mayAdmit = signer => signer.role === 'owner' || signer.everAdmin
  const mayRemove = (signer, target) => target.id !== ownerId
    && (signer.role === 'owner' || (signer.everAdmin && !target.everAdmin))
  // Leaving: a person's own machine removes its own person. The owner can't leave, and an agents-only
  // machine never acts as its person.
  const mayLeave = (record, target) => target.id !== ownerId && machines.get(record.signer)?.personId === target.id
    && machines.get(record.signer).agentsOnly !== true

  // Record-ID-ordered fixed-point passes resolve arbitrarily deep authority
  // chains. The first reachable certification binds a person/machine; competing
  // certifications are rejected, never allowed to rebind a key or change a role.
  fixedPoint(record => {
    if (!['member.add', 'machine.add'].includes(record.kind) || !authentic(record)) return false
    const signer = people.get(machines.get(record.signer)?.personId)
    if (!signer) return false
    if (record.kind === 'member.add') {
      if (people.has(record.subject) || machines.has(record.machineId)) return false
      if (!mayAdmit(signer) || (signer.role !== 'owner' && record.role !== 'member')) return false
      people.set(record.subject, personFromAdmission(record))
      admitMachine(record.machineId, record.subject, record.publicKey, false, by(record))
    } else {
      const person = people.get(record.personId)
      if (!person || machines.has(record.subject) || !(signer.id === person.id || mayRemove(signer, person))) return false
      admitMachine(record.subject, person.id, record.publicKey, record.agentsOnly === true, by(record), true)
    }
    return true
  })

  // A conflicting add cannot rebind a key, but its authorized certification
  // still participates in removal. Otherwise a second person ID with a smaller
  // recordId could hide the original person/key association and resurrect a key.
  // Keep this history separate from the chosen binding; it grants no authority.
  const history = new Map([...people.values()].map(person => [person.id, { ...person, machineIds: new Set() }]))
  for (const machine of machines.values()) history.get(machine.personId).machineIds.add(machine.id)
  for (const record of ordered) {
    if (record.kind !== 'member.add' || !authentic(record)) continue
    const signer = people.get(machines.get(record.signer)?.personId)
    if (!signer || !mayAdmit(signer) || (signer.role !== 'owner' && record.role !== 'member')) continue
    const binding = people.get(machines.get(record.machineId)?.personId)
    if (binding && binding.id !== record.subject && !mayRemove(signer, binding)) continue
    if (!history.has(record.subject)) history.set(record.subject, { ...personFromAdmission(record), machineIds: new Set() })
    history.get(record.subject).machineIds.add(record.machineId)
  }
  for (const record of ordered) {
    if (record.kind !== 'machine.add' || !authentic(record)) continue
    const signer = people.get(machines.get(record.signer)?.personId), target = history.get(record.personId)
    const binding = people.get(machines.get(record.subject)?.personId)
    if (signer && target && (signer.id === target.id || mayRemove(signer, target))
      && (!binding || binding.id === target.id || mayRemove(signer, binding))) target.machineIds.add(record.subject)
  }

  // Removed and demoted signers retain historical authority in this set.
  // Apply removals last; refusing newly arriving records belongs to maySign.
  // Profiles and agent labels use greatest recordId, without a clock.
  for (const record of ordered) {
    if (accepted.has(record)) continue
    const verification = verificationFor(record)
    if (!verification.valid) { reject(record, verification.reason); continue }
    const signer = people.get(machines.get(record.signer)?.personId)
    const person = people.get(record.subject)
    const machine = machines.get(record.subject)
    let allowed = false
    if (signer) switch (record.kind) {
      case 'member.role':
        allowed = person && person.id !== ownerId && signer.role === 'owner'
        break
      case 'member.remove': {
        const target = history.get(record.subject)
        allowed = Boolean(target) && (mayRemove(signer, target) || mayLeave(record, target))
        if (allowed) { removedPeople.add(record.subject); removals.push(removal(record)) }
        break
      }
      case 'machine.remove': {
        const target = people.get(machine?.personId)
        allowed = target && record.subject !== record.signer && (target.id === signer.id || mayRemove(signer, target))
        if (allowed) { removedMachines.add(machine.id); removals.push(removal(record)) }
        break
      }
      case 'profile':
        allowed = person?.id === signer.id
        if (allowed) Object.assign(person, { displayName: record.displayName, email: record.email })
        break
      case 'agent.name':
        allowed = true
        // Agent IDs are local to their machine, so another machine cannot rename one.
        agents.set(canonical([record.signer, record.subject]), { id: record.subject, machineId: record.signer, displayName: record.displayName, harness: record.harness })
        break
    }
    if (allowed) accepted.add(record)
    else reject(record, ['member.add', 'machine.add'].includes(record.kind)
      ? 'Unauthorized admission or conflicting person/machine certification'
      : 'Unauthorized record or unknown subject')
  }
  for (const personId of removedPeople) for (const machineId of history.get(personId).machineIds) removedMachines.add(machineId)
  return result()

  function fixedPoint(apply) {
    let changed
    do {
      changed = false
      for (const record of ordered) if (!accepted.has(record) && apply(record)) { accepted.add(record); changed = true }
    } while (changed)
  }
  function result() {
    return {
      projectId,
      people: sorted([...people.values()].filter(person => !removedPeople.has(person.id))),
      machines: sorted([...machines.values()].filter(machine => !removedMachines.has(machine.id))),
      agentNames: [...agents.values()].filter(agent => !removedMachines.has(agent.machineId)).sort((a, b) => compare(a.machineId, b.machineId) || compare(a.id, b.id)),
      removedPeople: [...removedPeople].sort(), removedMachines: [...removedMachines].sort(),
      // What removed people and machines were, for showing them as removed rather than as offline (#175).
      formerPeople: sorted([...removedPeople].map(id => {
        const { machineIds, ...person } = people.get(id) ?? history.get(id)
        return person
      })),
      formerMachines: sorted([...removedMachines].filter(id => machines.has(id)).map(id => machines.get(id))),
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
// fields alone. maySign adds the signature check; enrollment uses this to
// decide who may approve a request before anything is signed.
export function mayAuthor(membership, record) {
  const machine = membership.machines.find(machine => machine.id === record?.signer)
  if (!machine) return false
  const signer = membership.people.find(person => person.id === machine.personId)
  if (!signer) return false
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
      return mayRemove(person) || Boolean(person && person.id === signer.id && person.role !== 'owner' && machine.agentsOnly !== true)
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
    case 'agent.name':
      return true
    default:
      return false
  }
}
