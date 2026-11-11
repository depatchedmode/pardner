import { canonical } from './workspace-schema.js'
import { eventIdHolds } from './change-log.js'

// Activity as every surface shows it: browser Activity and task History, the review list, `pardner activity`,
// `timeline`, `trace task` and `diff`, and `client review`. A pure function of the entries lib/change-log.js derives
// from each change and of the verdict for each change hash, so every peer holding the same changes and signatures
// shows the same entries with the same signers.
//
// Each shown entry is the entry of one change, with that change's verdict as its signer. Entries are grouped only
// where their content is proven equal: changes that wrote the same event at one key, apart from the replica and
// time each was made, and that are each signed by a machine certified for the event's Actor (that Actor's operation
// retried on two of its replicas), are one entry listing each change with its own replica, time and signer; changes
// that wrote the same record at one key are likewise one entry (a record carries its own signature). Any other
// change is an entry of its own, even when what it wrote equals another's. Flags are facts about the entry and its
// changes:
//   keyMismatch  the key it was written at is not the operation ID (or record ID) inside it;
//   idMismatch   its operation ID is not the one its own request ID and content give;
//   sameKey      another change also wrote this key, in another entry (each such change is its own entry);
//   actorMismatch the signing machine is not certified for the Actor the event names;
//   alsoWrote    the change also deleted, wrote at the top level, or wrote into what other changes made;
//   invalidRecord the record's own signature does not verify;
//   unrecognised the change wrote neither one well-formed event nor a record (or was too large to read).
// An entry needs review when it has a flag, or one of its changes is unattributed or by a removed machine. An entry
// whose stored copy a later change edited (that change is an unrecognised entry naming it) also lists that change
// (`alteredLater`); what it shows is still what its own change wrote.

const ORIGIN = ['replicaId', 'timestamp']
const withoutOrigin = event => Object.fromEntries(Object.entries(event).filter(([field]) => !ORIGIN.includes(field)))
const isoOf = seconds => (Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null)
const byTime = (a, b) => String(a.timestamp).localeCompare(String(b.timestamp)) || a.hash.localeCompare(b.hash)

/**
 * The shown entries, newest first. `entries` are derived entries (lib/change-log.js); `stateOf(hash)` is a change's
 * verdict; `actorsOf(machineId)` the Actors a machine may act as; `recordValid(record)` whether a record's own
 * signature verifies; `changeOfObject(objId)` the change that made an object.
 */
export function activityView({ entries, stateOf, actorsOf = () => new Set(), recordValid = () => false, changeOfObject = () => null }) {
  const operations = new Map(), records = new Map(), shown = [], derived = new Map()
  for (const entry of entries) derived.set(entry.hash, entry)
  const inEvent = objId => {
    const creator = derived.get(changeOfObject(objId))
    return Boolean(creator?.eventObjects?.includes(Number(String(objId).split('@')[0])))
  }
  for (const entry of derived.values()) {
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
  }
  for (const [key, list] of operations) {
    const verdicts = new Map(list.map(entry => {
      const verdict = verdictOf(entry, stateOf)
      const mismatch = ['signed', 'removed'].includes(verdict.state) && !actorsOf(verdict.machineId).has(entry.event.actorId)
      return [entry.hash, { ...verdict, timestamp: entry.event.timestamp, replicaId: entry.event.replicaId, ...(mismatch ? { actorMismatch: true } : {}) }]
    }))
    // Only a retry of the Actor's own operation joins another change's entry.
    const retry = entry => verdicts.get(entry.hash).state === 'unchecked' || (verdicts.get(entry.hash).state === 'signed' && !verdicts.get(entry.hash).actorMismatch)
    const classes = groups(list, entry => (retry(entry) ? canonical(withoutOrigin(entry.event)) : `change:${entry.hash}`))
    for (const members of classes) {
      const changes = members.map(entry => verdicts.get(entry.hash)).sort(byTime)
      const first = members.find(entry => entry.hash === changes[0].hash)
      const others = classes.filter(other => other !== members).flatMap(other => other.map(entry => entry.hash)).sort()
      const flags = {
        ...(key !== first.event.operationId ? { keyMismatch: true } : {}),
        ...(!eventIdHolds(first.event) ? { idMismatch: true } : {}),
        ...(others.length ? { sameKey: others } : {}),
        ...(changes.some(change => change.actorMismatch) ? { actorMismatch: true } : {}),
        ...(changes.some(change => change.unusual) ? { alsoWrote: true } : {}),
      }
      shown.push(finish({ id: changes[0].hash, kind: 'operation', key, event: first.event, timestamp: first.event.timestamp, actorId: first.event.actorId, changes, flags }))
    }
  }
  for (const [key, list] of records) {
    const classes = groups(list, item => canonical(item.record))
    for (const members of classes) {
      const changes = members.map(({ entry }) => ({ ...verdictOf(entry, stateOf), timestamp: isoOf(entry.time) })).sort(byTime)
      const { record } = members[0]
      const others = classes.filter(other => other !== members).flatMap(other => other.map(item => item.entry.hash)).sort()
      const flags = {
        ...(key !== record.recordId ? { keyMismatch: true } : {}),
        ...(!recordValid(record) ? { invalidRecord: true } : {}),
        ...(others.length ? { sameKey: others } : {}),
        ...(changes.some(change => change.unusual) ? { alsoWrote: true } : {}),
      }
      shown.push(finish({ id: `${changes[0].hash}:${key}`, kind: 'record', key, record, timestamp: changes[0].timestamp, actorId: null, changes, flags }))
    }
  }
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

/** A change's verdict, with the unusual writes it made beside its event or records, if any. */
function verdictOf(entry, stateOf) {
  return { hash: entry.hash, ...stateOf(entry.hash), ...(entry.unusual ? { unusual: entry.unusual } : {}), ...(entry.replaced ? { replaced: entry.replaced } : {}) }
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

function finish(shown) {
  const flagged = Object.keys(shown.flags).length > 0
  shown.review = flagged || shown.changes.some(change => ['unattributed', 'removed'].includes(change.state))
  return shown
}
