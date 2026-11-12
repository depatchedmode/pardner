// `pardner client review`: the changes of a project that need a person's review (#197), as plain text. Each change is
// listed with the Activity entry derived from it (lib/activity.js) and that change's own signer: unattributed, by a
// removed machine, or in an entry with a flag. Each is applied and on the board; this lists them with what they did
// and who relayed them. Names and titles are as they are now; times, words and IDs are as each change wrote them.

const REASONS = {
  missing: 'no signature arrived',
  invalid: 'its signature doesn’t check out',
  'unknown-signer': 'its signer isn’t a machine of this project',
  'not-machine': 'it wasn’t made by a Pardner machine',
}

const FLAGS = {
  keyMismatch: 'written under a key other than its own operation ID',
  idMismatch: 'its operation ID doesn’t match its content',
  sameKey: 'another change also wrote this entry’s key',
  alsoWrote: 'it also changed content outside its own entry',
  invalidRecord: 'its record’s own signature doesn’t check out',
  alsoCreated: 'another change also claims to create this board',
  mismatch: 'it doesn’t match what its change did',
  badTime: 'its change’s time can’t be shown',
}

function machineLabel(attribution, machineId) {
  if (!machineId) return 'an unknown machine'
  const machine = attribution.machines?.[machineId]
  const short = String(machineId).slice('machine-'.length, 'machine-'.length + 6)
  if (!machine) return `a machine outside this project [${short}]`
  const name = machine.thisMachine ? 'this computer' : machine.name ?? 'unnamed machine'
  return `${machine.personName ? `${machine.personName} · ` : ''}${name} [${short}]`
}

function stateLine(attribution, item) {
  if (item.state === 'removed') return `Made by a removed machine: ${machineLabel(attribution, item.machineId)}`
  if (item.state === 'unattributed') return `Unattributed: ${REASONS[item.reason] ?? 'no valid signature'} · relayed by ${machineLabel(attribution, item.relayedBy)}`
    + (item.ownActor ? ' · it carries this computer’s actor, but this computer didn’t make it' : '')
  if (item.state === 'pending') return `Signature pending${item.waitingFor ? ` · waiting for ${machineLabel(attribution, item.waitingFor)}` : ''}`
  return `Signed by ${machineLabel(attribution, item.machineId)}`
}

function flagText(item) {
  const parts = []
  if (item.actorMismatch) parts.push('as an Actor this machine isn’t allowed to act as')
  for (const [flag, text] of Object.entries(FLAGS)) if (item.flags?.[flag]) parts.push(text)
  return parts.map(part => ` · ${part}`).join('')
}

/** What a change wrote that is neither one Activity entry nor a record, in a few words. */
function unrecognisedLine(entry) {
  if (entry.oversized) return `a change too large to read (${entry.ops} operations)`
  if (entry.wrote?.empty) return 'a change that wrote nothing'
  const parts = []
  const events = entry.wrote?.events?.length ?? 0, records = entry.wrote?.records?.length ?? 0
  if (events) parts.push(`${events === 1 ? 'an Activity entry that isn’t well formed' : `${events} Activity entries in one change`}`)
  if (records) parts.push(`${records} membership record${records === 1 ? '' : 's'} beside it`)
  const unusual = entry.changes?.[0]?.unusual ?? {}
  if (entry.altered?.length) parts.push(`altered the Activity entry of ${entry.altered.length === 1 ? `change ${entry.altered[0].slice(0, 12)}` : `${entry.altered.length} other changes`}`)
  if (entry.alteredContent?.length) parts.push(`changed content written by ${entry.alteredContent.length === 1 ? `change ${entry.alteredContent[0].slice(0, 12)}` : `${entry.alteredContent.length} other changes`}`)
  for (const { map, key } of unusual.deleted ?? []) parts.push(`deleted ${map} ${key}`)
  for (const { key } of unusual.root ?? []) parts.push(`wrote the board’s top-level ${key}`)
  for (const { map } of unusual.unknownMaps ?? []) parts.push(`wrote into an unknown map ${map}`)
  if (!parts.length) parts.push('a change that left no Activity entry')
  return parts.join('; ')
}

function entryLine(doc, entry) {
  if (!entry) return 'an entry not derived yet'
  if (entry.kind === 'operation') {
    const { event } = entry
    const actor = doc.actors?.[event.actorId]?.displayName ?? event.actorId
    // A task's title as created is part of what was signed; any other title is the task's title now.
    const task = event.type === 'task.create' ? event.payload?.title : event.taskId ? doc.tasks?.[event.taskId]?.title : null
    return `${actor}: ${event.type}${task ? ` “${task}”` : ''} at ${event.timestamp}`
  }
  if (entry.kind === 'record') return `Membership record ${entry.record.kind} of ${entry.record.subject}, signed by ${machineLabel(doc.attribution, entry.record.signer)}`
  return `Unrecognised: ${unrecognisedLine(entry)}`
}

/** The review as data (`changes`, `equivocations`) and as a listing for people. */
export function reviewView(doc, projectName) {
  const attribution = doc.attribution
  if (!attribution) return { changes: [], equivocations: [], listing: `${projectName}: this service checks no signatures.\n` }
  const entries = new Map((doc.activity ?? []).map(entry => [entry.id, entry]))
  const changes = (attribution.review ?? []).map(item => {
    const entry = entries.get(item.entry)
    return { ...item, operations: entry?.kind === 'operation' ? [entry.key] : [] }
  })
  const equivocations = attribution.summary?.equivocations ?? []
  const { checking = 0, pending = 0 } = attribution.summary ?? {}
  const lines = [`${projectName}: ${changes.length === 1 ? '1 change needs' : `${changes.length} changes need`} review`
    + (equivocations.length ? `, ${equivocations.length === 1 ? '1 equivocation' : `${equivocations.length} equivocations`}` : '')]
  if (pending) lines.push(`${pending === 1 ? '1 change is' : `${pending} changes are`} waiting for a signature${checking ? `; ${checking} not checked yet` : ''}.`)
  if (changes.length) lines.push('Names and titles are as they are now; times, words and IDs are as each change wrote them.')
  for (const item of changes) {
    lines.push('', stateLine(attribution, item) + flagText(item))
    lines.push(`  ${entryLine(doc, entries.get(item.entry))}`)
    for (const difference of Array.isArray(item.mismatch) ? item.mismatch : []) if (typeof difference?.text === 'string') lines.push(`  ${difference.text}`)
    lines.push(`  Change ${item.change}${item.at ? ` · made ${item.at}` : ''}`)
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
