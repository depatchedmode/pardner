// Who made each change, as this computer's Pardner checked it (lib/attribution.js on the service). Every change is
// signed by the machine that made it; a change without a valid signature is shown, never hidden. Plain words first:
// people and machine names, never a raw hash as the main label.

const own = (map, key) => (map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)

const REASONS = {
  missing: 'no signature arrived',
  invalid: 'its signature doesn’t check out',
  'unknown-signer': 'its signer isn’t a machine of this project',
  'not-machine': 'it wasn’t made by a Pardner machine',
  checking: 'still being checked',
}

/** A machine as people know it: its person and its name, with a short ID only when it has no name. */
export function machineLabel(attribution, machineId) {
  if (!machineId) return 'an unknown machine'
  const machine = own(attribution?.machines, machineId)
  const short = String(machineId).slice('machine-'.length, 'machine-'.length + 6)
  if (!machine) return `a machine outside this project (${short})`
  const name = machine.thisMachine ? 'this computer' : machine.name ?? `machine ${short}`
  return machine.personName ? `${machine.personName} · ${name}` : name
}

const signerOf = signers => (Array.isArray(signers) ? signers : [])

/**
 * The signer line under an Activity entry: `{ text, tone }`, where tone is `signed`, `pending` or `flag`. Null when
 * the service checks no signatures (the standalone service).
 */
export function signerLine(attribution, signers) {
  if (!attribution) return null
  const list = signerOf(signers)
  if (!list.length) return { text: 'Signature pending', tone: 'pending' }
  const lines = list.map(signer => {
    const machine = own(attribution.machines, signer.machineId)
    switch (signer.state) {
      case 'signed': {
        const parts = [`Signed by ${machineLabel(attribution, signer.machineId)}`]
        if (machine?.removed) parts.push('machine since removed')
        if (signer.actorMismatch) parts.push('as an Actor this machine isn’t allowed to act as')
        return { text: parts.join(' · '), tone: signer.actorMismatch ? 'flag' : 'signed' }
      }
      case 'removed':
        return { text: `Made by a removed machine: ${machineLabel(attribution, signer.machineId)}${signer.actorMismatch ? ' · as an Actor it isn’t allowed to act as' : ''}`, tone: 'flag' }
      case 'unattributed':
        return { text: `Unattributed: ${REASONS[signer.reason] ?? 'no valid signature'} · relayed by ${machineLabel(attribution, signer.relayedBy)}`, tone: 'flag' }
      default: {
        const waiting = signer.waitingFor ? ` · waiting for ${machineLabel(attribution, signer.waitingFor)}` : ''
        return { text: `Signature pending${waiting}`, tone: 'pending' }
      }
    }
  })
  const flagged = lines.find(line => line.tone === 'flag')
  return { text: lines.map(line => line.text).join('; '), tone: flagged ? 'flag' : lines.every(line => line.tone === 'signed') ? 'signed' : 'pending' }
}

/** Whether an Activity entry needs a person's review: one of its changes is unattributed, from a removed machine, or claims an Actor its machine may not act as. */
export function needsReview(attribution, event) {
  if (event?.review) return true
  return signerOf(attribution?.operations?.[event?.operationId]).some(signer => ['unattributed', 'removed'].includes(signer.state) || signer.actorMismatch)
}

const RECORD_STAMP = ''

/**
 * Membership records as Activity entries, signed by the machine that signed each record. Their times have
 * one-second resolution; the key sorts records of one second in the order they reached the board.
 */
export function recordEvents(attribution) {
  return (attribution?.records ?? []).map(record => ({ operationId: `record-${String(record.position ?? 0).padStart(9, '0')}-${record.recordId}`,
    type: `record.${record.kind}`, timestamp: record.at ?? RECORD_STAMP, actorId: record.signerActorId ?? null, record }))
}

/** Changes that need review but wrote no Activity entry, so they are still listed. */
export function reviewOnlyEvents(attribution) {
  return (attribution?.review ?? []).filter(entry => !entry.operations?.length).map(entry => ({ operationId: `change-${entry.change}`, type: 'change.other',
    timestamp: entry.at ?? RECORD_STAMP, review: entry }))
}

const ROLE = { admin: 'an admin', member: 'a member' }

/** One membership record as a plain sentence, in the shape describeEvent returns. */
export function describeRecord(event, attribution) {
  const record = event.record
  const person = id => own(attribution?.people, id) ?? 'someone'
  const signerPerson = own(attribution?.machines, record.signer)?.personId
  const actor = signerPerson ? person(signerPerson) : machineLabel(attribution, record.signer)
  let parts, detail = null
  switch (record.kind) {
    case 'project.genesis': parts = [' started the project']; break
    case 'member.add': parts = [` let ${record.displayName ?? 'someone'} in as ${ROLE[record.role] ?? 'a member'}`]; break
    case 'member.role': parts = [` made ${person(record.subject)} ${ROLE[record.role] ?? 'a member'}`]; break
    case 'member.remove':
      parts = record.subject === signerPerson ? [' left the project'] : [` removed ${person(record.subject)} from the project`]
      break
    case 'machine.add':
      parts = record.personId === signerPerson ? [` paired a new machine${record.agentsOnly ? ' for agents only' : ''}`]
        : [` paired a machine for ${person(record.personId)}${record.agentsOnly ? ', for agents only' : ''}`]
      detail = machineLabel(attribution, record.subject)
      break
    case 'machine.remove': parts = [` removed the machine ${machineLabel(attribution, record.subject)}`]; break
    case 'agent.name': parts = [` named an agent “${record.displayName ?? ''}”`]; break
    case 'profile': parts = [` updated their name to ${record.displayName ?? ''}`]; break
    default: parts = [` recorded ${record.kind}`]
  }
  return { actor, parts, detail, excerpt: null }
}

/** A flagged change that wrote no Activity entry, as a sentence. */
export function describeChange(event, attribution) {
  const claimed = event.review.claimed ?? event.review.machineId
  return { actor: claimed ? machineLabel(attribution, claimed) : 'A machine', parts: [' made a change that left no Activity entry'], detail: null, excerpt: null }
}

/** The signer line of a membership record: it was verified when this computer stored it. */
export function recordSignerLine(attribution, record) {
  if (!attribution) return null
  return { text: `Signed by ${machineLabel(attribution, record.signer)}`, tone: 'signed' }
}

/** The board's notice: how many changes need review, and any equivocation, in plain words; null when there is nothing. */
export function reviewNotice(attribution) {
  const count = attribution?.summary?.review ?? 0
  const equivocations = attribution?.summary?.equivocations ?? []
  if (!count && !equivocations.length) return null
  const lines = []
  if (count) lines.push(`${count === 1 ? 'One change needs' : `${count} changes need`} review: ${count === 1 ? 'its' : 'their'} signer couldn’t be confirmed, ${count === 1 ? 'it was' : 'they were'} made by a removed machine, or ${count === 1 ? 'it claims' : 'they claim'} an Actor ${count === 1 ? 'its' : 'their'} machine isn’t allowed to act as.`)
  for (const report of equivocations) {
    const relayer = machineLabel(attribution, report.relayedBy)
    lines.push(report.proven
      ? `${machineLabel(attribution, report.machineId)} signed two different changes with the same number. Board changes from ${relayer} can’t be applied here until that machine is removed and its copy rebuilt.`
      : `A change claiming to be from ${machineLabel(attribution, report.machineId)} conflicts with one already here, and ${report.signed?.some(Boolean) ? 'only one of them is' : 'neither is'} signed. Board changes from ${relayer} can’t be applied here until the machine that wrote it is removed.`)
  }
  return lines
}
