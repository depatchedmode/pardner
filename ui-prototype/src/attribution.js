// Who made each change, as this computer's Pardner checked it (lib/activity.js on the service). Every Activity entry
// is derived from one change, and its signer line is that change's own verdict: it means "this machine signed
// exactly this content", and it is the only part of an entry that is verified. What the entry says the change did
// is its author's description, compared with what the change wrote on a best-effort basis: a flag says only that the
// two differ. A change without a valid signature is shown, never hidden. Plain words first: people and machine
// names, never a raw hash as the main label. Names of people and machines are as they are now.

const own = (map, key) => (map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)

const REASONS = Object.assign(Object.create(null), {
  missing: 'no signature arrived',
  invalid: 'its signature doesn’t check out',
  'unknown-signer': 'its signer isn’t a machine of this project',
  'not-machine': 'it wasn’t made by a Pardner machine',
  'ambiguous-signer': 'its actor names more than one machine',
  checking: 'still being checked',
})

const FLAGS = {
  keyMismatch: 'written under a key other than its own operation ID',
  idMismatch: 'its operation ID doesn’t match its content',
  sameKey: 'another change also wrote this entry',
  alsoWrote: 'the change also altered content outside this entry',
  invalidRecord: 'its record signature doesn’t check out',
  alsoCreated: 'another change also claims to create this board',
  mismatch: 'this description does not match what the change wrote',
  badTime: 'its change’s time can’t be shown',
}

/** A machine as people know it: its person and its name, with a short ID only when it has no name. */
export function machineLabel(attribution, machineId) {
  if (typeof machineId !== 'string' || !machineId) return 'an unknown machine'
  const machine = own(attribution?.machines, machineId)
  const short = String(machineId).slice('machine-'.length, 'machine-'.length + 6)
  if (!machine) return `a machine outside this project (${short})`
  const name = machine.thisMachine ? 'this computer' : machine.name ?? `machine ${short}`
  return machine.personName ? `${machine.personName} · ${name}` : name
}

/** Who made a change, as briefly as a signer line allows. */
function changeLabel(attribution, change) {
  if (change?.state === 'signed' || change?.state === 'removed') return machineLabel(attribution, change.machineId)
  if (change?.state === 'unattributed') return `an unsigned change relayed by ${machineLabel(attribution, change.relayedBy)}`
  return 'a change still being checked'
}

/** The Actor a record entry is filed under: the human Actor of the person whose machine signed it, when known. */
const recordActor = (attribution, record) => own(attribution?.personActors, own(attribution?.machines, record?.signer)?.personId) ?? null

/**
 * Activity entries (lib/activity.js) as rows for the list: each keeps its entry, and carries what sorting and
 * filtering use, all of it signed and read from the entry's one reading (`entry.shows`): its time and Actor, the type
 * of its event, its fields as its change wrote them, and the records it names.
 */
export function activityRows(doc) {
  const attribution = doc?.attribution ?? null
  const text = value => (typeof value === 'string' ? value : null)
  return (Array.isArray(doc?.activity) ? doc.activity : []).map(entry => {
    const shows = entry.kind === 'operation' ? entry.shows ?? {} : null
    return {
      entry, operationId: entry.id, timestamp: text(entry.timestamp) ?? '',
      actorId: shows ? text(shows.actorId) : entry.kind === 'record' ? recordActor(attribution, entry.record) : null,
      type: shows ? text(shows.type) : entry.kind === 'record' ? `record.${text(entry.record?.kind) ?? 'unknown'}` : 'change.other',
      ...(shows ? { changes: Array.isArray(shows.changes) ? shows.changes : [], taskId: text(shows.taskId), recordIds: Array.isArray(shows.recordIds) ? shows.recordIds : [] } : {}),
    }
  })
}

/** A sentence for an entry that cannot be put into words: one entry fails, never the list. */
const UNDESCRIBED = { actor: 'Someone', actorCurrent: false, parts: [' made a change whose content can’t be put into words'], detail: null, excerpt: null }
const safely = (describe, fallback) => (...args) => { try { return describe(...args) } catch { return fallback } }

/** The rows of one task's History: entries whose signed event names the task. */
export function taskRows(doc, taskId) {
  return activityRows(doc).filter(row => row.entry.kind === 'operation' && (row.taskId === taskId || (Array.isArray(row.recordIds) && row.recordIds.includes(taskId))))
}

/** One change's verdict as words and a tone: `signed`, `pending` or `flag`. */
function changeLine(attribution, change) {
  const machine = own(attribution?.machines, change.machineId)
  switch (change.state) {
    case 'signed': {
      const parts = [`Signed by ${machineLabel(attribution, change.machineId)}`]
      if (machine?.removed) parts.push('machine since removed')
      if (change.actorMismatch) parts.push('as an Actor this machine isn’t allowed to act as')
      return { text: parts.join(' · '), tone: change.actorMismatch ? 'flag' : 'signed' }
    }
    case 'removed':
      return { text: `Made by a removed machine: ${machineLabel(attribution, change.machineId)}${change.actorMismatch ? ' · as an Actor it isn’t allowed to act as' : ''}`, tone: 'flag' }
    case 'unattributed':
      return { text: `Unattributed: ${REASONS[change.reason] ?? 'no valid signature'} · relayed by ${machineLabel(attribution, change.relayedBy)}${change.ownActor ? ' · it carries this computer’s actor, but this computer didn’t make it' : ''}`, tone: 'flag' }
    default: {
      const waiting = change.waitingFor ? ` · waiting for ${machineLabel(attribution, change.waitingFor)}` : ''
      return { text: `Signature pending${waiting}`, tone: 'pending' }
    }
  }
}

/**
 * The signer line under an Activity entry: `{ text, tone }`. One part per change the entry lists (several only for
 * one operation retried on two replicas, or one record written back), then the entry's flags. For a membership
 * record the line is the record's own signature, which covers exactly the record shown, followed by any change that
 * wrote it into the board without a valid signature. Null when the service checks no signatures.
 */
export const signerLine = safely(signerLineOf, { text: 'Its signer can’t be shown', tone: 'flag' })

function signerLineOf(attribution, entry) {
  if (!attribution || !entry) return null
  const changes = Array.isArray(entry.changes) ? entry.changes : []
  let lines
  if (entry.kind === 'record') {
    // A record whose own signature fails names a signer it cannot prove: say so, and name who wrote it to the board.
    const invalid = Boolean(entry.flags?.invalidRecord)
    lines = [invalid
      ? { text: `Not signed by the machine it names (${machineLabel(attribution, entry.record.signer)})`, tone: 'flag' }
      : { text: `Signed by ${machineLabel(attribution, entry.record.signer)}`, tone: 'signed' }]
    for (const change of changes) if (invalid || ['unattributed', 'removed'].includes(change.state)) lines.push({ ...changeLine(attribution, change), text: `written to the board by a change: ${changeLine(attribution, change).text}` })
  } else {
    lines = changes.length ? changes.map(change => changeLine(attribution, change)) : [{ text: 'Signature pending', tone: 'pending' }]
    if (changes.length > 1) lines = lines.map((line, index) => ({ ...line, text: `${line.text} (${changes[index].replicaId ? 'on another replica, ' : ''}${new Date(changes[index].timestamp).toLocaleString()})` }))
  }
  const flags = Object.entries(FLAGS).filter(([flag]) => entry.flags?.[flag]).map(([, text]) => ({ text, tone: 'flag' }))
  // What the entry says and what its change wrote, each difference in words (lib/activity.js mismatchText).
  for (const change of changes) for (const item of Array.isArray(change.mismatch) ? change.mismatch : []) if (typeof item?.text === 'string') flags.push({ text: item.text, tone: 'flag' })
  const later = (entry.alteredLater ?? []).length
    ? [{ text: `shown as signed; its stored copy was altered after signing by ${entry.alteredLater.map(change => changeLabel(attribution, change)).join(' and ')}`, tone: 'flag' }] : []
  const all = [...lines, ...flags, ...later]
  const tone = all.some(line => line.tone === 'flag') ? 'flag' : all.every(line => line.tone === 'signed') ? 'signed' : 'pending'
  return { text: [lines.map(line => line.text).join('; '), ...flags.map(line => line.text), ...later.map(line => line.text)].join(' · '), tone }
}

/** Whether an Activity entry needs a person's review (lib/activity.js decides; this reads it). */
export const needsReview = row => Boolean(row?.entry?.review)

const ROLE = Object.freeze(Object.assign(Object.create(null), { admin: 'an admin', member: 'a member' }))

/** One membership record entry as a plain sentence, in the shape describeEvent returns. Names are as they are now. */
export const describeRecord = safely(describeRecordOf, UNDESCRIBED)

function describeRecordOf(row, attribution) {
  const { record } = row.entry
  const person = id => own(attribution?.people, id) ?? 'someone'
  const signerPerson = own(attribution?.machines, record.signer)?.personId
  const actor = signerPerson ? person(signerPerson) : machineLabel(attribution, record.signer)
  let parts, detail = null
  switch (record.kind) {
    case 'project.genesis': parts = [' started the project']; break
    case 'member.add': parts = [` let ${record.displayName ?? 'someone'} in as ${own(ROLE, record.role) ?? 'a member'}`]; break
    case 'member.role': parts = [' made ', { label: person(record.subject), current: true }, ` ${own(ROLE, record.role) ?? 'a member'}`]; break
    case 'member.remove':
      parts = record.subject === signerPerson ? [' left the project'] : [' removed ', { label: person(record.subject), current: true }, ' from the project']
      break
    case 'machine.add':
      parts = record.personId === signerPerson ? [` paired a new machine${record.agentsOnly ? ' for agents only' : ''}`]
        : [' paired a machine for ', { label: person(record.personId), current: true }, record.agentsOnly ? ', for agents only' : '']
      detail = machineLabel(attribution, record.subject)
      break
    case 'machine.remove': parts = [' removed the machine ', { label: machineLabel(attribution, record.subject), current: true }]; break
    case 'agent.name': parts = [` named an agent “${record.displayName ?? ''}”`]; break
    case 'profile': parts = [` updated their name to ${record.displayName ?? ''}`]; break
    default: parts = [` recorded ${record.kind}`]
  }
  return { actor, actorCurrent: Boolean(signerPerson), parts, detail, excerpt: null }
}

/** A change that wrote neither one Activity entry nor a record, as a sentence: what it altered or wrote. */
export const describeChange = safely(describeChangeOf, UNDESCRIBED)

function describeChangeOf(row, attribution) {
  const { entry } = row
  const [change] = entry.changes
  const claimed = change?.claimed ?? change?.machineId
  const actor = claimed ? machineLabel(attribution, claimed) : 'A machine'
  if (entry.oversized) return { actor, actorCurrent: true, parts: [` made a change too large to read (${entry.ops} operations)`], detail: null, excerpt: null }
  if (entry.altered?.length) {
    const others = entry.altered.length - 1
    return { actor, actorCurrent: true, parts: [' altered an Activity entry another change signed'], detail: others > 0 ? `and ${others} more` : null, excerpt: null }
  }
  if (entry.wrote?.unreadable?.length) return { actor, actorCurrent: true, parts: [' wrote content that can’t be read exactly as plain data'], detail: entry.wrote.unreadable.map(item => String(item?.reason ?? '')).filter(Boolean).slice(0, 3).join('; ') || null, excerpt: null }
  const events = entry.wrote?.events?.length ?? 0
  if (events) return { actor, actorCurrent: true, parts: [events === 1 ? ' wrote an Activity entry that isn’t well formed' : ` wrote ${events} Activity entries in one change`], detail: null, excerpt: null }
  if (entry.alteredContent?.length) return { actor, actorCurrent: true, parts: [' changed content another change wrote'], detail: null, excerpt: null }
  if (change?.unusual?.deleted?.length) return { actor, actorCurrent: true, parts: [' deleted content another change wrote'], detail: null, excerpt: null }
  if (entry.wrote?.empty) return { actor, actorCurrent: true, parts: [' made a change that wrote nothing'], detail: null, excerpt: null }
  return { actor, actorCurrent: true, parts: [' made a change that left no Activity entry'], detail: null, excerpt: null }
}

/** The board's notice: how many changes need review, and any equivocation, in plain words; null when there is nothing. */
export function reviewNotice(attribution) {
  const count = attribution?.summary?.review ?? 0
  const equivocations = attribution?.summary?.equivocations ?? []
  const ownActor = attribution?.summary?.ownActor ?? 0
  if (!count && !equivocations.length) return null
  const lines = []
  if (count) lines.push(`${count === 1 ? 'One change needs' : `${count} changes need`} review: ${count === 1 ? 'its' : 'their'} signer couldn’t be confirmed, ${count === 1 ? 'it was' : 'they were'} made by a removed machine, ${count === 1 ? 'it claims' : 'they claim'} an Actor ${count === 1 ? 'its' : 'their'} machine isn’t allowed to act as, or ${count === 1 ? 'it wrote' : 'they wrote'} something other than one Activity entry of ${count === 1 ? 'its' : 'their'} own.`)
  if (ownActor) lines.push(`${ownActor === 1 ? 'One change carries' : `${ownActor} changes carry`} this computer’s actor but ${ownActor === 1 ? 'wasn’t' : 'weren’t'} made here: another machine used it.`)
  for (const report of equivocations) {
    const relayer = machineLabel(attribution, report.relayedBy)
    lines.push(report.proven
      ? `${machineLabel(attribution, report.machineId)} signed two different changes with the same number. Board changes from ${relayer} can’t be applied here until that machine is removed and its copy rebuilt.`
      : `A change claiming to be from ${machineLabel(attribution, report.machineId)} conflicts with one already here, and ${report.signed?.some(Boolean) ? 'only one of them is' : 'neither is'} signed. Board changes from ${relayer} can’t be applied here until the machine that wrote it is removed.`)
  }
  return lines
}

/**
 * For the task panel, which shows comments as they are now: whether a comment's record or current text was written
 * by a change other than its recorded author's own signed operation on it. Such a comment says so, and points to
 * Activity, where that change has its own entry under its own signer.
 */
export const changedBySomeoneElse = (attribution, commentId) => Boolean(own(attribution?.comments, commentId)?.changedBy?.length)

/**
 * Likewise for one alternative of a field or comment with concurrent values (`map` is taskFields, goalFields,
 * veinFields or commentBodies; `key` the field or comment key): whether the change that wrote it, or wrote into it,
 * is anything but the operation it records by the Actor it names.
 */
export const alternativeChangedBySomeoneElse = (attribution, map, key, operationId) =>
  Boolean(own(own(attribution?.registers, `${map}:${key}`), operationId)?.changedBy?.length)

/**
 * For the edit form's "X saved a newer …": who to credit for each field that changed since the form opened, grouped
 * as `{ by, unconfirmed, fields }`, from the change that wrote the field's current value, not from the newest entry
 * that mentions it. Each current value names the operation that wrote it (`revisions`); it is credited to that
 * operation's Actor, confirmed only when that operation's own entry is signed and unflagged and no other change
 * wrote it or into it (`registers`, from the service), and nothing is still being read. Otherwise it is unconfirmed,
 * credited to the Actor of the change that did write it where that change names one, else to no one.
 */
export function newerAuthors({ fields, taskId, revisions = {}, activity = [], attribution = null }) {
  const reading = Boolean(attribution) && ((attribution.summary?.notDerived ?? 0) > 0 || (attribution.summary?.checking ?? 0) > 0)
  const groups = []
  const credit = (by, unconfirmed, field) => {
    const group = groups.find(candidate => candidate.by === by && candidate.unconfirmed === unconfirmed)
    if (!group) groups.push({ by, unconfirmed, fields: [field] })
    else if (!group.fields.includes(field)) group.fields.push(field)
  }
  for (const field of fields) {
    const ids = Array.isArray(own(revisions, field)) ? revisions[field] : []
    if (!ids.length) credit(null, true, field)
    for (const id of ids) {
      const changedBy = own(own(attribution?.registers, `taskFields:${taskId}:${field}`), id)?.changedBy
      if (Array.isArray(changedBy) && changedBy.length) {
        for (const writer of changedBy) credit(typeof writer?.actorId === 'string' ? writer.actorId : null, true, field)
        continue
      }
      const written = (Array.isArray(activity) ? activity : []).filter(entry => entry?.kind === 'operation' && entry.key === id)
      const [entry] = written
      // The standalone service checks no signatures: its entries are confirmed by what they record.
      const signed = !attribution || entry?.changes?.every(change => change.state === 'signed')
      credit(written.length === 1 ? entry.shows?.actorId ?? null : null, !(written.length === 1 && !entry.review && signed && !reading), field)
    }
  }
  return groups
}
