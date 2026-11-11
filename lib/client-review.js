// `pardner client review`: the changes of a project that need a person's review (#197), as plain text. A change
// needs review when no valid signature by a member machine has reached this computer, when a machine this
// computer holds as removed made it, or when it claims an Actor its machine may not act as. Each is applied and
// on the board; this lists them with what they did and who relayed them.

const REASONS = {
  missing: 'no signature arrived',
  invalid: 'its signature doesn’t check out',
  'unknown-signer': 'its signer isn’t a machine of this project',
  'not-machine': 'it wasn’t made by a Pardner machine',
}

function machineLabel(attribution, machineId) {
  if (!machineId) return 'an unknown machine'
  const machine = attribution.machines?.[machineId]
  const short = String(machineId).slice('machine-'.length, 'machine-'.length + 6)
  if (!machine) return `a machine outside this project [${short}]`
  const name = machine.thisMachine ? 'this computer' : machine.name ?? 'unnamed machine'
  return `${machine.personName ? `${machine.personName} · ` : ''}${name} [${short}]`
}

function stateLine(attribution, entry) {
  if (entry.state === 'removed') return `Made by a removed machine: ${machineLabel(attribution, entry.machineId)}`
  if (entry.state === 'unattributed') return `Unattributed: ${REASONS[entry.reason] ?? 'no valid signature'} · relayed by ${machineLabel(attribution, entry.relayedBy)}`
    + (entry.ownActor ? ' · it carries this computer’s actor, but this computer didn’t make it' : '')
  return `Signed by ${machineLabel(attribution, entry.machineId)}`
}

function operationLine(doc, operationId) {
  const event = doc.operations?.[operationId]
  if (!event) return `an entry no longer on the board (${operationId})`
  const actor = doc.actors?.[event.actorId]?.displayName ?? event.actorId
  const task = event.taskId ? doc.tasks?.[event.taskId]?.title : null
  return `${actor}: ${event.type}${task ? ` “${task}”` : ''} at ${event.timestamp}`
}

/** The review as data (`changes`, `equivocations`) and as a listing for people. */
export function reviewView(doc, projectName) {
  const attribution = doc.attribution
  if (!attribution) return { changes: [], equivocations: [], listing: `${projectName}: this service checks no signatures.\n` }
  const changes = attribution.review ?? [], equivocations = attribution.summary?.equivocations ?? []
  const { checking = 0, pending = 0 } = attribution.summary ?? {}
  const lines = [`${projectName}: ${changes.length === 1 ? '1 change needs' : `${changes.length} changes need`} review`
    + (equivocations.length ? `, ${equivocations.length === 1 ? '1 equivocation' : `${equivocations.length} equivocations`}` : '')]
  if (pending) lines.push(`${pending === 1 ? '1 change is' : `${pending} changes are`} waiting for a signature${checking ? `; ${checking} not checked yet` : ''}.`)
  for (const entry of changes) {
    lines.push('', stateLine(attribution, entry) + (entry.actorMismatch ? ' · as an Actor this machine isn’t allowed to act as' : ''))
    for (const operationId of entry.operations ?? []) lines.push(`  ${operationLine(doc, operationId)}`)
    if (!entry.operations?.length) lines.push('  a change that left no Activity entry')
    lines.push(`  Change ${entry.change}${entry.at ? ` · made ${entry.at}` : ''}`)
  }
  for (const report of equivocations) {
    lines.push('', report.proven
      ? `Equivocation: ${machineLabel(attribution, report.machineId)} signed two different changes with sequence number ${report.seq}.`
      : `Conflicting change: a change claiming to be from ${machineLabel(attribution, report.machineId)} conflicts with one already here; ${report.signed?.some(Boolean) ? 'only one of them is' : 'neither is'} signed.`)
    lines.push(`  Board changes from ${machineLabel(attribution, report.relayedBy)} carrying it are refused by Automerge until that machine is removed and its copy rebuilt.`)
    lines.push(`  Changes ${report.hashes.join(' and ')}`)
  }
  if (!changes.length && !equivocations.length) lines.push('', 'Every change here is signed by a member machine.')
  return { changes, equivocations, listing: `${lines.join('\n')}\n` }
}
