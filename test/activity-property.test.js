import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll, isEvent } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { canonical, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ChangeEncoder } from '../support/change-encoder.js'
import { BOB, MACHINES, actorsOf, board, run, signedByActor, writeRecords } from '../support/activity-fixture.js'

// The invariant, over random sequences of well-formed but unusual changes by a second member (Bob), made through
// Automerge's API and by encoding operations directly: every ordinary entry's content deep-equals two readings that
// share no code with lib/change-log.js, its stored form is the same entry, every other change is unrecognised and in
// review, and every change appears under its own signer.
//
// The two readings:
//   intended  what the generator meant each encoded or API write to leave, by Automerge's documented rules (a value
//             replaced naming its predecessor is the replacement; a deletion removes only the values it names; two
//             values at one key that do not name each other are both kept, so the change is unrecognised);
//   rebuilt   a new document made from the raw bytes of the change and its ancestors only, read with current-state
//             reads (no heads) through a converter written here.

const CASES = 160
const ORIGIN = ['replicaId', 'timestamp']
const withoutOrigin = value => Object.fromEntries(Object.entries(value ?? {}).filter(([field]) => !ORIGIN.includes(field)))
const define = (target, key, value) => Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
const stored = entry => JSON.parse(JSON.stringify(entry))

function random(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
}

// ---- Rebuilt: the document as of one change, from raw change bytes, read with current-state reads ----

/** A new document holding exactly `hash` and its ancestors, applied from their encoded bytes. */
function rebuilt(doc, hash) {
  const metas = new Map(A.getChangesMetaSince(doc, []).map(meta => [meta.hash, meta]))
  const keep = new Set(), stack = [hash]
  while (stack.length) { const next = stack.pop(); if (keep.has(next)) continue; keep.add(next); stack.push(...metas.get(next).deps) }
  const backend = A.getBackend(doc)
  const [state] = A.applyChanges(A.init(), [...keep].map(each => backend.getChangeByHash(each)))
  return A.getBackend(state)
}

/** A current value as plain JSON, or a reason it is not exactly that; written separately from lib/change-log.js. */
function plainValue(backend, full, depth = 0) {
  if (depth > 32) return { not: 'deep' }
  const [type, value] = full
  if (type === 'str' || type === 'boolean') return { value }
  if (type === 'null') return { value: null }
  if (['int', 'uint', 'f64'].includes(type)) return typeof value === 'number' && Number.isFinite(value) && (type === 'f64' || Number.isSafeInteger(value)) ? { value } : { not: 'number' }
  if (type === 'map') {
    const out = {}
    for (const key of backend.keys(value)) {
      const values = backend.getAll(value, key)
      if (values.length !== 1) return { not: 'several' }
      const child = plainValue(backend, values[0], depth + 1)
      if (child.not) return child
      define(out, key, child.value)
    }
    return { value: out }
  }
  if (type === 'list') {
    const out = []
    for (let index = 0; index < backend.length(value); index++) {
      const values = backend.getAll(value, index)
      if (values.length !== 1) return { not: 'several' }
      const child = plainValue(backend, values[0], depth + 1)
      if (child.not) return child
      out.push(child.value)
    }
    return { value: out }
  }
  return { not: type }
}

/** What change `hash` left at `key` of every top-level map named `name`, read in the rebuilt document. */
function rebuiltWrite(doc, hash, name, key) {
  const meta = A.getChangesMetaSince(doc, []).find(each => each.hash === hash)
  const mine = opId => { const [counter, actor] = opId.split('@'); return actor === meta.actor && Number(counter) >= meta.startOp && Number(counter) <= meta.maxOp }
  const backend = rebuilt(doc, hash)
  const found = []
  for (const [type, map] of backend.getAll('_root', name)) {
    if (type !== 'map') continue
    const values = backend.getAll(map, key)
    if (!values.some(full => mine(full.length === 2 ? full[1] : full[2]))) continue
    found.push(values.length === 1 ? plainValue(backend, values[0]) : { not: 'several' })
  }
  return found
}

// ---- Intended: encoded writes with rewrites, and what Automerge's rules leave ----

/**
 * Writes `value` at `where` in `enc`, sometimes with rewrites inside the change: a value replaced naming its
 * predecessor, a list element replaced then deleted naming only its insertion, a decoy written and deleted, or two
 * values at one key that do not name each other. Returns what should remain, or `{ several: true }`.
 */
function encode(enc, where, value, next, pred = []) {
  if (Array.isArray(value)) {
    const list = enc.op({ action: 'makeList', ...where, pred })
    const kept = []
    let after = '_head', several = false
    for (const item of value) {
      const roll = next()
      if (roll < 0.15) {
        // Inserted, replaced naming the insertion, then deleted naming only the insertion: the replacement stays.
        const inserted = enc.value({ obj: list, elemId: after, insert: true }, 'decoy')
        const replaced = encode(enc, { obj: list, elemId: inserted }, item, next, [inserted])
        enc.op({ action: 'del', obj: list, elemId: inserted, pred: [inserted] })
        if (replaced.several) several = true; else kept.push(replaced.value)
        after = inserted
      } else if (roll < 0.25) {
        // A decoy inserted and deleted naming it: gone; the item follows it.
        const decoy = enc.value({ obj: list, elemId: after, insert: true }, 'decoy')
        enc.op({ action: 'del', obj: list, elemId: decoy, pred: [decoy] })
        const placed = encodeInsert(enc, list, decoy, item, next)
        if (placed.several) several = true; else kept.push(placed.value)
        after = placed.id
      } else {
        const placed = encodeInsert(enc, list, after, item, next)
        if (placed.several) several = true; else kept.push(placed.value)
        after = placed.id
      }
    }
    return several ? { several: true } : { value: kept }
  }
  if (value !== null && typeof value === 'object') {
    const map = enc.op({ action: 'makeMap', ...where, pred })
    const out = {}
    let several = false
    for (const [key, item] of Object.entries(value)) {
      const roll = next()
      if (roll < 0.12) {
        // A decoy, then the value naming it: the value stays.
        const decoy = enc.value({ obj: map, key }, 'decoy')
        const written = encode(enc, { obj: map, key }, item, next, [decoy])
        if (written.several) several = true; else define(out, key, written.value)
      } else if (roll < 0.18) {
        // A decoy written and deleted naming it, then the value: the value stays.
        const decoy = enc.value({ obj: map, key }, 'decoy')
        enc.op({ action: 'del', obj: map, key, pred: [decoy] })
        const written = encode(enc, { obj: map, key }, item, next)
        if (written.several) several = true; else define(out, key, written.value)
      } else if (roll < 0.2) {
        // Two values that do not name each other: both stay, so this is no single plain value.
        enc.value({ obj: map, key }, 'decoy')
        encode(enc, { obj: map, key }, item, next)
        several = true
      } else {
        const written = encode(enc, { obj: map, key }, item, next)
        if (written.several) several = true; else define(out, key, written.value)
      }
    }
    return several ? { several: true } : { value: out }
  }
  enc.value(where, value, pred)
  return { value }
}

function encodeInsert(enc, list, after, item, next) {
  const id = enc.nextId
  const written = encode(enc, { obj: list, elemId: after, insert: true }, item, next)
  return { ...written, id }
}

/** A nested payload of maps and lists, with keys that name inherited properties as ordinary data. */
function nested(next, depth = 0) {
  const roll = next()
  if (depth > 3 || roll < 0.3) return roll < 0.1 ? null : roll < 0.2 ? Math.floor(next() * 100) : `text ${Math.floor(next() * 1000)}`
  if (roll < 0.6) return Array.from({ length: 1 + Math.floor(next() * 3) }, () => nested(next, depth + 1))
  const out = {}
  // Automerge 3.2.3 itself panics applying a map key __proto__ whose value is null (reported in the PR), so that one value is not generated.
  for (const key of ['a', next() < 0.2 ? '__proto__' : 'b', next() < 0.2 ? 'constructor' : 'c'].slice(0, 1 + Math.floor(next() * 3))) define(out, key, key === '__proto__' ? nested(next, depth + 1) ?? 0 : nested(next, depth + 1))
  return out
}

/** One of Bob's encoded changes against `doc`: `{ doc, hash, intended }`, where intended is null when not tracked. */
function encodedWrite(doc, next, actor) {
  const keys = Object.keys(doc.operations ?? {})
  const key = keys.length ? keys[Math.floor(next() * keys.length)] : null
  const source = key ? A.getBackend(doc).getAll(A.getObjectId(doc.operations), key) : []
  if (!source.length || source[0][0] !== 'map') return null
  const event = plain(doc.operations[key])
  if (!isEvent(event)) return null
  const words = `Bob ${Math.floor(next() * 1e6)}`
  const roll = next()
  const value = { ...event, payload: roll < 0.5 ? { ...event.payload, text: words, nested: nested(next) } : event.payload,
    changes: [{ field: 'status', old: 'backlog', new: words }, { field: 'title', old: null, new: words }], recordIds: [...event.recordIds, words] }
  const enc = new ChangeEncoder(doc, actor)
  const target = next() < 0.5 ? `op-e${words}` : key
  const pred = target === key ? source.map(full => full[1]) : []
  let intended
  if (next() < 0.15) {
    // Identifying fields moved into a map at the key __proto__: data, so the event lacks them.
    const identifying = Object.fromEntries(['operationId', 'requestId', 'type', 'actorId'].map(field => [field, value[field]]))
    const rest = Object.fromEntries(Object.entries(value).filter(([field]) => !Object.hasOwn(identifying, field)))
    intended = encode(enc, { obj: enc.root('operations'), key: target }, define(rest, '__proto__', identifying), next, pred)
  } else intended = encode(enc, { obj: enc.root('operations'), key: target }, value, next, pred)
  const applied = enc.apply()
  return { ...applied, intended: { key: target, ...intended } }
}

// ---- API writes, as before: copies, edits inside, deletions, top-level writes, records ----

/** One of Bob's unusual writes against `doc` through Automerge's API, as one change by `actor`; null when it does not apply. */
function unusualWrite(doc, next, actor) {
  const keys = Object.keys(doc.operations ?? {})
  const pick = list => list[Math.floor(next() * list.length)]
  const key = keys.length ? pick(keys) : null
  const event = key && doc.operations[key] && typeof doc.operations[key] === 'object' ? plain(doc.operations[key]) : null
  const words = `Bob ${Math.floor(next() * 1e6)}`
  const altered = value => ({ ...value, payload: { ...(value.payload ?? {}), text: words, title: words } })
  const odd = [Infinity, NaN, new A.Counter(1), new Date(0), new Uint8Array([1]), 'collaborative text']
  const writes = [
    // A copy of someone's event under a new key, altered or not, sometimes lexically before every key.
    () => event && (d => { d.operations[next() < 0.5 ? `op-0${words}` : `op-z${words}`] = storageValue(next() < 0.5 ? event : altered(event)) }),
    // A different value at an existing key.
    () => event && (d => { d.operations[key] = storageValue(altered(event)) }),
    // An edit inside an existing entry, a deletion of one of its fields, or a push into its list.
    () => event && (d => { const target = d.operations[key]; if (next() < 0.4) target.payload = { text: new A.ImmutableString(words) }; else if (next() < 0.5) delete target.actorId; else if (Array.isArray(target.recordIds)) target.recordIds.push(new A.ImmutableString(words)) }),
    // A deletion of an entry, then sometimes its re-creation in the same change.
    () => key && (d => { delete d.operations[key]; if (next() < 0.5 && event) d.operations[key] = storageValue(next() < 0.5 ? event : altered(event)) }),
    // A value that is not an event where one belongs.
    () => (d => { d.operations[`op-scalar-${words}`] = next() < 0.5 ? new A.ImmutableString(words) : [new A.ImmutableString(words)] }),
    // A copied event holding a value JSON cannot hold exactly, or collaborative text.
    () => event && (d => { d.operations[`op-odd${words}`] = storageValue(event); d.operations[`op-odd${words}`].payload.odd = pick(odd) }),
    // Side effects with no event.
    () => (d => { d.taskFields[`task-${words}:title`] = storageValue({ value: words, operationId: 'op-none', actorId: 'alice', replicaId: 'r', timestamp: '2026-01-01T00:00:00.000Z' }) }),
    // A top-level write, including making `operations` itself again.
    () => (d => { if (next() < 0.5) d.name = new A.ImmutableString(words); else d.operations = {} }),
    // Two events in one change.
    () => event && (d => { d.operations[`op-a${words}`] = storageValue(event); d.operations[`op-b${words}`] = storageValue(altered(event)) }),
    // An event with nested lists that the change then edits inside itself.
    () => event && (d => { d.operations[`op-n${words}`] = storageValue({ ...altered(event), payload: { list: [1, [2, 3], { inner: 'x' }] } }); d.operations[`op-n${words}`].payload.list.insertAt(1, new A.ImmutableString('in')); d.operations[`op-n${words}`].payload.list[2].splice(0, 1) }),
    // A membership record copied under another key, or one altered so that its signature fails.
    () => (d => {
      const records = Object.values(plain(d.membership ?? {}))
      if (!records.length) return
      const record = pick(records)
      d.membership[next() < 0.5 ? `${record.recordId}-copy` : record.recordId] = storageValue(next() < 0.5 ? record : { ...record, displayName: words })
    }),
    // The membership map made again, with every record written back.
    () => (d => { const records = plain(d.membership ?? {}); d.membership = {}; for (const record of Object.values(records)) d.membership[record.recordId] = storageValue(record) }),
    // A change on a history of its own, with no dependencies.
    () => ({ root: true }),
  ]
  const write = pick(writes)()
  if (!write) return null
  if (write.root) return A.merge(A.clone(doc), A.change(A.init({ actor }), d => { d.name = new A.ImmutableString(words) }))
  try { return A.change(A.clone(doc, { actor }), write) } catch { return null }
}

/** One of Bob's changes: encoded (tracking what it should leave) or through the API. */
function bobWrite(doc, next, actor, intended) {
  if (next() < 0.4) {
    const written = encodedWrite(doc, next, actor)
    if (written) { intended.set(written.hash, written.intended); return written.doc }
  }
  return unusualWrite(doc, next, actor)
}

test(`over ${CASES} random sequences of unusual changes, encoded or through the API, every ordinary entry is exactly what two independent readings say its change wrote, survives storage, and every other change is in review`, () => {
  const { project, doc: start } = board()
  // Alice's ordinary work first: a task, comments and a goal.
  let base = start
  const task = run(base, { type: 'task.create', payload: { title: 'Alice’s task' } }); base = task.doc
  for (const text of ['First', 'Second']) base = run(base, { type: 'comment.add', payload: { taskId: task.event.result.taskId, text } }).doc
  base = run(base, { type: 'goal.create', payload: { title: 'Alice’s goal' } }).doc
  base = writeRecords(base, project.records)
  const counts = { entries: 0, changes: 0, bob: 0, encoded: 0, intendedChecked: 0, rebuiltChecked: 0, unrecognised: 0 }
  for (let seed = 1; seed <= CASES; seed++) {
    const next = random(seed)
    const intended = new Map()
    let doc = base, actorCount = 0
    const bobActor = () => `${BOB}${(seed * 100 + actorCount++).toString(16).padStart(16, '0')}`
    const steps = 1 + Math.floor(next() * 8)
    for (let step = 0; step < steps; step++) {
      if (next() < 0.25) {
        // Concurrent writes: two or three forks of the same state, each by its own load of Bob's document.
        let merged = doc
        for (let fork = 0; fork < 2 + Math.floor(next() * 2); fork++) {
          const written = bobWrite(doc, next, bobActor(), intended)
          if (written) merged = A.merge(A.clone(merged), written)
        }
        doc = merged
      } else if (next() < 0.15) {
        try { doc = run(doc, { type: 'goal.create', payload: { title: `Alice ${seed}-${step}` } }).doc } catch { /* Alice's map may be gone. */ }
      } else {
        doc = bobWrite(doc, next, bobActor(), intended) ?? doc
      }
    }
    const derived = deriveAll(doc)
    for (const entry of derived.values()) assert.deepStrictEqual(stored(entry), entry, `seed ${seed}: entry ${entry.hash.slice(0, 12)} changes when stored`)
    // What the generator meant each encoded change to leave.
    for (const [hash, want] of intended) {
      counts.encoded++
      const entry = derived.get(hash)
      if (want.several || !isEvent(want.value)) { assert.equal(entry.kind, 'unrecognised', `seed ${seed}: encoded change ${hash.slice(0, 12)} should be unrecognised`); continue }
      assert.equal(entry.kind, 'operation', `seed ${seed}: encoded change ${hash.slice(0, 12)} is ${entry.kind}`)
      assert.deepStrictEqual([entry.key, entry.event], [want.key, want.value], `seed ${seed}: encoded change ${hash.slice(0, 12)} is not shown as it was meant`)
      counts.intendedChecked++
    }
    const shown = activityView({ entries: derived.values(), stateOf: signedByActor(doc), actorsOf,
      recordValid: record => project.all.some(known => canonical(known) === canonical(record)) })
    for (const entry of shown) {
      counts.entries++
      for (const change of entry.changes) {
        counts.changes++
        if (entry.kind === 'unrecognised') continue
        const content = entry.kind === 'operation' ? entry.event : entry.record
        const readings = rebuiltWrite(doc, change.hash, entry.kind === 'operation' ? 'operations' : 'membership', entry.key)
        assert.equal(readings.length, 1, `seed ${seed}: change ${change.hash.slice(0, 12)} left ${readings.length} values at ${entry.key}`)
        const [reading] = readings
        assert.ok(!reading.not, `seed ${seed}: change ${change.hash.slice(0, 12)} is shown, but its value is ${reading.not}`)
        if (entry.kind === 'operation' && entry.changes.length > 1) {
          assert.deepStrictEqual(withoutOrigin(entry.event), withoutOrigin(reading.value), `seed ${seed}: entry ${entry.id.slice(0, 12)} differs from its change`)
          assert.deepEqual([reading.value.replicaId, reading.value.timestamp], [change.replicaId, change.timestamp])
        } else assert.deepStrictEqual(content, reading.value, `seed ${seed}: entry ${entry.id.slice(0, 12)} shows content change ${change.hash.slice(0, 12)} did not write at ${entry.key}`)
        counts.rebuiltChecked++
      }
      const bobs = entry.changes.filter(change => change.machineId === MACHINES[BOB])
      if (bobs.length && entry.kind === 'operation' && entry.event.actorId !== 'bob') assert.equal(entry.review, true, `seed ${seed}: Bob's change as another Actor is not listed for review`)
      if (entry.kind === 'unrecognised') { counts.unrecognised++; assert.equal(entry.review, true) }
    }
    for (const meta of A.getChangesMetaSince(doc, [])) {
      const holding = shown.filter(entry => entry.changes.some(change => change.hash === meta.hash))
      assert.ok(holding.length, `seed ${seed}: change ${meta.hash.slice(0, 12)} is not shown`)
      for (const entry of holding) assert.equal(entry.changes.find(change => change.hash === meta.hash).machineId, MACHINES[meta.actor.slice(0, 32)], `seed ${seed}: shown under another signer`)
      if (meta.actor.startsWith(BOB)) counts.bob++
    }
  }
  assert.ok(counts.bob > CASES, `only ${counts.bob} unusual changes were made`)
  assert.ok(counts.intendedChecked > 20 && counts.encoded > counts.intendedChecked, 'encoded changes of both outcomes were checked')
  // Reported with the run: how much the property covered.
  console.log(`activity property: ${CASES} cases, ${counts.bob} unusual changes (${counts.encoded} encoded, ${counts.intendedChecked} checked against what was meant), ` +
    `${counts.entries} entries, ${counts.changes} listed changes, ${counts.rebuiltChecked} checked against the rebuilt document, ${counts.unrecognised} unrecognised in review`)
})
