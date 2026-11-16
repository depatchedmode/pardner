import { canonical } from './workspace-schema.js'
import { eventIdHolds, isoOfSeconds } from './change-log.js'

// Activity as every surface shows it: browser Activity and task History, the review list, `pardner activity`,
// `timeline`, `trace task` and `diff`, and `client review`. A pure function of the entries lib/change-log.js derives
// from each change and of the verdict for each change hash, so every peer holding the same changes and signatures
// shows the same entries with the same signers.
//
// Each shown entry is the entry of one change, with that change's verdict as its signer. Entries are grouped only
// where their content is proven equal: changes that wrote the same event at one key, apart from the replica and
// time each was made, and that are each signed by a machine certified for the event's Actor (that Actor's operation
// retried on two of its replicas), are one entry listing each change with its own replica, time and signer. So are
// such retries of one request whose events differ only in what each replica's write path read from its own time and
// board, when each change matches its own event: the entry shows the first change's reading, and each other change
// whose reading differs carries its own as `shows`. Changes
// that wrote the same record at one key are likewise one entry (a record carries its own signature). Any other
// change is an entry of its own, even when what it wrote equals another's. Flags are facts about the entry and its
// changes:
//   keyMismatch  the key it was written at is not the operation ID (or record ID) inside it;
//   idMismatch   its operation ID is not the one its own request ID and content give;
//   sameKey      another change also wrote this key, in another entry (each such change is its own entry);
//   actorMismatch the signing machine is not certified for the Actor the event names;
//   alsoWrote    the change also deleted, wrote at the top level, or wrote into what other changes made;
//   invalidRecord the record's own signature does not verify;
//   unrecognised the change wrote neither one well-formed event nor a record (or was too large to read);
//   alsoCreated  more than one change in the board has no dependencies and writes records (two creations);
//   mismatch     the change's writes are not exactly the ones its event implies (lib/operation-writes.js): a write
//                missing, an extra write, or a different value; each difference is listed with what the entry says
//                and what the change wrote, in plain words (`mismatch` on the change);
//   badTime      the change's own time is no time a date can show: it is shown as unknown.
// An entry needs review when it has a flag, or one of its changes is unattributed or by a removed machine. An entry
// whose stored copy a later change edited (that change is an unrecognised entry naming it) also lists that change
// (`alteredLater`); what it shows is still what its own change wrote.

const ORIGIN = ['replicaId', 'timestamp']
const withoutOrigin = event => Object.fromEntries(Object.entries(event).filter(([field]) => !ORIGIN.includes(field)))
const isoOf = isoOfSeconds
const byTime = (a, b) => String(a.timestamp).localeCompare(String(b.timestamp)) || a.hash.localeCompare(b.hash)

/**
 * The shown entries, newest first. `entries` are derived entries (lib/change-log.js); `stateOf(hash)` is a change's
 * verdict; `actorsOf(machineId)` the Actors a machine may act as; `recordValid(record)` whether a record's own
 * signature verifies; `changeOfObject(objId)` the change that made an object.
 */
export function activityView({ entries, stateOf, actorsOf = () => new Set(), recordValid: checkRecord = () => false, changeOfObject = () => null }) {
  const operations = new Map(), records = new Map(), shown = [], derived = new Map()
  // One change's data never stops the view: a record whose own check fails to run is not valid, and an entry that
  // fails to be built is shown as a change that could not be shown, with its own verdict.
  const recordValid = record => { try { return checkRecord(record) === true } catch { return false } }
  const contained = (list, build) => { try { build() } catch (error) { for (const entry of list) shown.push(unshowable(entry, stateOf, error)) } }
  for (const entry of entries) derived.set(entry.hash, entry)
  const creations = [...derived.values()].filter(entry => entry.kind === 'creation').map(entry => entry.hash)
  const inEvent = objId => {
    const creator = derived.get(changeOfObject(objId))
    return Boolean(creator?.eventObjects?.includes(Number(String(objId).split('@')[0])))
  }
  for (const entry of derived.values()) contained([entry], () => {
    if (entry.kind === 'operation') {
      if (!operations.has(entry.key)) operations.set(entry.key, [])
      operations.get(entry.key).push(entry)
    } else if (entry.kind === 'records' || entry.kind === 'creation') {
      for (const { key, record } of entry.records ?? []) {
        if (!records.has(key)) records.set(key, [])
        records.get(key).push({ entry, record })
      }
      if (entry.kind === 'records' && !entry.records?.length) shown.push(unrecognised(entry, stateOf, changeOfObject, inEvent))
    } else shown.push(unrecognised(entry, stateOf, changeOfObject, inEvent))
  })
  for (const [key, list] of operations) contained(list, () => {
    const verdicts = new Map(list.map(entry => {
      const verdict = verdictOf(entry, stateOf)
      const mismatch = ['signed', 'removed'].includes(verdict.state) && !actorsOf(verdict.machineId).has(entry.event.actorId)
      return [entry.hash, { ...verdict, timestamp: entry.event.timestamp, replicaId: entry.event.replicaId, ...(mismatch ? { actorMismatch: true } : {}) }]
    }))
    // Only a retry of the Actor's own operation joins another change's entry. A key written once needs no comparison.
    const retry = entry => verdicts.get(entry.hash).state === 'unchecked' || (verdicts.get(entry.hash).state === 'signed' && !verdicts.get(entry.hash).actorMismatch)
    // A retry whose own change matches its event, written at its own operation ID, which its request and content give.
    const checked = entry => retry(entry) && key === entry.event.operationId && (entry.idHolds ?? eventIdHolds(entry.event)) && !entry.mismatch && !entry.unusual
    const classes = list.length === 1 ? [list]
      : joinRetries(groups(list, entry => (retry(entry) ? canonical([withoutOrigin(entry.event), entry.shows ?? null]) : `change:${entry.hash}`)), checked)
    for (const members of classes) {
      const sorted = members.map(entry => verdicts.get(entry.hash)).sort(byTime)
      const first = members.find(entry => entry.hash === sorted[0].hash)
      // The entry shows its first change's reading; a joined retry whose own reading differs (apart from the time each
      // change gives, which it lists) keeps it, on its change.
      const reading = canonical(withoutOrigin(showsOf(first)))
      const changes = sorted.map(change => {
        const member = members.find(entry => entry.hash === change.hash)
        return member === first || canonical(withoutOrigin(showsOf(member))) === reading ? change : { ...change, shows: showsOf(member) }
      })
      const others = classes.filter(other => other !== members).flatMap(other => other.map(entry => entry.hash)).sort()
      const flags = {
        ...(key !== first.event.operationId ? { keyMismatch: true } : {}),
        ...(!(first.idHolds ?? eventIdHolds(first.event)) ? { idMismatch: true } : {}),
        ...(others.length ? { sameKey: others } : {}),
        ...(changes.some(change => change.actorMismatch) ? { actorMismatch: true } : {}),
        ...(changes.some(change => change.unusual) ? { alsoWrote: true } : {}),
        ...(changes.some(change => change.mismatch) ? { mismatch: true } : {}),
        ...(changes.some(change => change.badTime) ? { badTime: true } : {}),
      }
      shown.push(finish({ id: changes[0].hash, kind: 'operation', key, event: first.event, shows: showsOf(first), timestamp: first.event.timestamp, actorId: first.event.actorId, changes, flags }))
    }
  })
  for (const [key, list] of records) contained(list.map(item => item.entry), () => {
    const classes = list.length === 1 ? [list] : groups(list, item => canonical(item.record))
    for (const members of classes) {
      const changes = members.map(({ entry }) => ({ ...verdictOf(entry, stateOf), timestamp: isoOf(entry.time),
        ...(entry.kind === 'creation' ? { creation: true, ...(entry.registered ? { registered: entry.registered } : {}) } : {}) })).sort(byTime)
      const { record } = members[0]
      const others = classes.filter(other => other !== members).flatMap(other => other.map(item => item.entry.hash)).sort()
      const flags = {
        ...(key !== record.recordId ? { keyMismatch: true } : {}),
        ...(!recordValid(record) ? { invalidRecord: true } : {}),
        ...(others.length ? { sameKey: others } : {}),
        ...(changes.some(change => change.unusual) ? { alsoWrote: true } : {}),
        ...(creations.length > 1 && changes.some(change => change.creation) ? { alsoCreated: creations.sort() } : {}),
        ...(changes.some(change => change.badTime) ? { badTime: true } : {}),
      }
      shown.push(finish({ id: `${changes[0].hash}:${key}`, kind: 'record', key, record, timestamp: changes[0].timestamp, actorId: null, changes, flags }))
    }
  })
  const byChange = new Map()
  for (const entry of shown) for (const change of entry.changes) byChange.set(change.hash, entry)
  for (const entry of shown) {
    for (const hash of entry.altered ?? []) {
      const target = byChange.get(hash)
      if (target && target !== entry) (target.alteredLater ??= []).push(entry.changes[0])
    }
  }
  return shown.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

/**
 * An operation entry's one reading, which every renderer (the browser, the CLI and the review list) reads instead of
 * the event: the event's own scalars, and from its derivation one value per field as its change wrote it (with the
 * previous value only where the board then held it), the comment text its change wrote, and the Actor it registered.
 * The words of a comment are only `comment.text`, never a payload field a renderer might pick instead.
 */
export function showsOf(entry) {
  const { event } = entry
  const derived = entry.shows ?? {}
  const { text, message, ...payload } = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload : {}
  return { operationId: event.operationId, type: event.type, actorId: event.actorId, timestamp: event.timestamp, ...(Object.hasOwn(event, 'taskId') ? { taskId: event.taskId } : {}),
    recordIds: event.recordIds, result: event.result, payload: { ...payload, ...(derived.payload ?? {}) }, changes: derived.changes ?? [], comment: derived.comment ?? null }
}

/**
 * Joins the classes of one key whose every change is a `checked` retry of one request (its operation ID, request ID,
 * type, Actor, fingerprint and payload): one request retried on several of its Actor's replicas, each change checked
 * against its own board then (lib/operation-writes.js). Their events can differ only in what each replica's write path
 * read from its own time and board (a creation's order, a field's previous value), so they are one entry.
 */
function joinRetries(classes, checked) {
  const joined = new Map(), out = []
  for (const members of classes) {
    if (!members.every(checked)) { out.push(members); continue }
    const { operationId, requestId, type, actorId, fingerprint, payload } = members[0].event
    const request = canonical([operationId, requestId, type, actorId, fingerprint, payload])
    if (joined.has(request)) joined.get(request).push(...members)
    else { const list = [...members]; joined.set(request, list); out.push(list) }
  }
  return out
}

/** Splits `list` into classes of equal `key(item)`, each in a stable order. */
function groups(list, key) {
  const classes = new Map()
  for (const item of list) {
    const value = key(item)
    if (!classes.has(value)) classes.set(value, [])
    classes.get(value).push(item)
  }
  return [...classes.keys()].sort().map(value => classes.get(value))
}

/**
 * A change's verdict, with the unusual writes it made beside its event or records, how its writes differ from what
 * its event implies (each with a sentence saying so), and whether its time can be shown.
 */
function verdictOf(entry, stateOf) {
  return { hash: entry.hash, ...stateOf(entry.hash), ...(entry.unusual ? { unusual: entry.unusual } : {}), ...(entry.replaced ? { replaced: entry.replaced } : {}),
    ...(entry.mismatch ? { mismatch: entry.mismatch.map(item => ({ ...item, text: mismatchText(item) })) } : {}), ...(entry.badTime ? { badTime: true } : {}) }
}

const MAP_WORDS = { commentBodies: 'the text of comment', comments: 'the record of comment', deletedComments: 'the deletion of comment', taskFields: 'task field',
  goalFields: 'goal field', veinFields: 'vein field', tasks: 'the record of task', goals: 'the record of goal', veins: 'the record of vein', veinLinks: 'the vein link',
  readReceipts: 'the read receipt', mentions: 'the mention', supersededRevisions: 'the retired revision', operationRequests: 'the request record of',
  mergedBranches: 'the merge of branch', branchBases: 'the branch base', actors: 'the Actor' }

/** A value in a sentence: a register's value, quoted words, or a short JSON text, as the change wrote it. */
function said(value) {
  const inner = value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'value') && Object.hasOwn(value, 'operationId') ? value.value : value
  if (typeof inner === 'string') return `“${inner.length > 160 ? `${inner.slice(0, 160)}…` : inner}”`
  const text = JSON.stringify(inner) ?? String(inner)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

/** One difference between an entry and what its change did, in plain words. */
export function mismatchText(item) {
  if (item.issue === 'more') return `and ${item.more} more differences`
  if (item.issue === 'old') {
    const held = Array.isArray(item.held) && item.held.length ? item.held.map(said).join(' or ') : 'no value it can show'
    return `It says ${item.field} was ${said(item.says)} before; the board then held ${held}`
  }
  if (item.issue === 'claim') return `It says ${item.field} is ${said(item.says)}, but its operation gives ${typeof item.implies === 'string' && !item.implies.startsWith('op-') && item.implies.includes(' ') ? item.implies : said(item.implies)}`
  const what = `${Object.hasOwn(MAP_WORDS, item.map) ? MAP_WORDS[item.map] : item.map} ${item.key}`
  if (item.issue === 'extra') return `Its change also wrote ${what}: ${said(item.wrote)}`
  if (item.issue === 'missing') return `It says its change wrote ${what} as ${said(item.claimed)}, but the change did not write it`
  return `It says ${what} is ${said(item.claimed)}; its change wrote ${said(item.wrote)}`
}

/**
 * A change that wrote neither one well-formed event nor a record. `altered` names the changes whose Activity entry it
 * wrote into (the objects of their event), `alteredContent` those whose other content it wrote into.
 */
function unrecognised(entry, stateOf, changeOfObject, inEvent) {
  const change = { ...verdictOf(entry, stateOf), timestamp: isoOf(entry.time) }
  const foreign = entry.unusual?.foreign ?? []
  const changes = list => [...new Set(list.map(({ obj }) => changeOfObject(obj)).filter(Boolean))].sort()
  const altered = changes(foreign.filter(({ obj }) => inEvent(obj))), alteredContent = changes(foreign.filter(({ obj }) => !inEvent(obj)))
  return finish({ id: entry.hash, kind: 'unrecognised', timestamp: change.timestamp, actorId: null, changes: [change],
    wrote: entry.wrote ?? null, ops: entry.ops, ...(entry.oversized ? { oversized: true } : {}), ...(altered.length ? { altered } : {}),
    ...(alteredContent.length ? { alteredContent } : {}), flags: { unrecognised: true } })
}

/** A change whose entry could not be built, as an unrecognised entry of its own, with its own verdict when that can be read. */
function unshowable(entry, stateOf, error) {
  let change
  try { change = { ...verdictOf(entry, stateOf), timestamp: isoOf(entry.time) } } catch { change = { hash: entry.hash, state: 'pending', reason: 'checking', timestamp: null } }
  return finish({ id: entry.hash, kind: 'unrecognised', timestamp: change.timestamp, actorId: null, changes: [change], ops: entry.ops ?? null,
    wrote: { events: [], records: [], unreadable: [{ reason: `could not be shown: ${String(error?.message ?? error).slice(0, 200)}` }] }, flags: { unrecognised: true } })
}

function finish(shown) {
  const flagged = Object.keys(shown.flags).length > 0
  shown.review = flagged || shown.changes.some(change => ['unattributed', 'removed'].includes(change.state))
  return shown
}
