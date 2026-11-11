import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { canonical, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { BOB, MACHINES, actorsOf, board, run, signedByActor, writeRecords } from '../support/activity-fixture.js'

// The invariant, over random sequences of well-formed but unusual writes by a second member (Bob): every displayed
// entry's content is what each change listed under it wrote, read independently with Automerge's own history; and
// every change appears, as its own entry or grouped where its content is proven equal, under its own signer.

const CASES = 160
const ORIGIN = ['replicaId', 'timestamp']
const withoutOrigin = value => Object.fromEntries(Object.entries(value ?? {}).filter(([field]) => !ORIGIN.includes(field)))

function random(seed) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
}

/** What change `hash` wrote under every map ever made at `_root[name]`, read through getChangeByHash and materialize. */
function oracle(doc, name) {
  const backend = A.getBackend(doc)
  const decoded = new Map(A.getChangesMetaSince(doc, []).map(meta => [meta.hash, A.decodeChange(backend.getChangeByHash(meta.hash))]))
  const maps = new Set()
  for (const change of decoded.values()) change.ops.forEach((op, index) => { if (op.obj === '_root' && op.key === name && op.action === 'makeMap') maps.add(`${change.startOp + index}@${change.actor}`) })
  return hash => {
    const change = decoded.get(hash)
    return change.ops.flatMap((op, index) => (op.action === 'makeMap' && maps.has(op.obj)
      ? [{ key: op.key, value: plain(backend.materialize(`${change.startOp + index}@${change.actor}`, [hash])) }] : []))
  }
}

/** One of Bob's unusual writes against `doc`, as one change by `actor`; null when it does not apply. */
function unusualWrite(doc, next, actor) {
  const keys = Object.keys(doc.operations ?? {})
  const pick = list => list[Math.floor(next() * list.length)]
  const key = keys.length ? pick(keys) : null
  const event = key && doc.operations[key] && typeof doc.operations[key] === 'object' ? plain(doc.operations[key]) : null
  const words = `Bob ${Math.floor(next() * 1e6)}`
  const altered = value => ({ ...value, payload: { ...(value.payload ?? {}), text: words, title: words } })
  const writes = [
    // A copy of someone's event under a new key, altered or not, sometimes lexically before every key.
    () => event && (d => { d.operations[next() < 0.5 ? `op-0${words}` : `op-z${words}`] = storageValue(next() < 0.5 ? event : altered(event)) }),
    // A different value at an existing key.
    () => event && (d => { d.operations[key] = storageValue(altered(event)) }),
    // An edit inside an existing entry, a deletion of one of its fields, or a push into its list.
    () => event && (d => { const target = d.operations[key]; if (next() < 0.4) target.payload = { text: words }; else if (next() < 0.5) delete target.actorId; else if (Array.isArray(target.recordIds)) target.recordIds.push(words) }),
    // A deletion of an entry, then sometimes its re-creation in the same change.
    () => key && (d => { delete d.operations[key]; if (next() < 0.5 && event) d.operations[key] = storageValue(next() < 0.5 ? event : altered(event)) }),
    // A value that is not an event where one belongs.
    () => (d => { d.operations[`op-scalar-${words}`] = next() < 0.5 ? new A.ImmutableString(words) : [words] }),
    // Side effects with no event.
    () => (d => { d.taskFields[`task-${words}:title`] = storageValue({ value: words, operationId: 'op-none', actorId: 'alice', replicaId: 'r', timestamp: '2026-01-01T00:00:00.000Z' }) }),
    // A top-level write, including making `operations` itself again.
    () => (d => { if (next() < 0.5) d.name = new A.ImmutableString(words); else d.operations = {} }),
    // Two events in one change.
    () => event && (d => { d.operations[`op-a${words}`] = storageValue(event); d.operations[`op-b${words}`] = storageValue(altered(event)) }),
    // An event with nested lists and text that the change then edits inside itself.
    () => event && (d => { d.operations[`op-n${words}`] = { ...altered(event), payload: { list: [1, [2, 3], { text: 'x' }], notes: 'nested' } }; d.operations[`op-n${words}`].payload.list.insertAt(1, 'in'); A.splice(d, ['operations', `op-n${words}`, 'payload', 'notes'], 0, 1, 'N') }),
    // A membership record copied under another key, or one altered so that its signature fails.
    () => (d => {
      const records = Object.values(plain(d.membership ?? {}))
      if (!records.length) return
      const record = pick(records)
      d.membership[next() < 0.5 ? `${record.recordId}-copy` : record.recordId] = storageValue(next() < 0.5 ? record : { ...record, displayName: words })
    }),
    // The membership map made again, with every record written back.
    () => (d => { const records = plain(d.membership ?? {}); d.membership = {}; for (const record of Object.values(records)) d.membership[record.recordId] = storageValue(record) }),
  ]
  const write = pick(writes)()
  if (!write) return null
  try { return A.change(A.clone(doc, { actor }), write) } catch { return null }
}

test(`over ${CASES} random sequences of unusual writes, every shown entry's content is what each change listed under it wrote, and every change is shown under its own signer`, () => {
  const { project, doc: start } = board()
  // Alice's ordinary work first: a task, comments and a goal.
  let base = start
  const task = run(base, { type: 'task.create', payload: { title: 'Alice’s task' } }); base = task.doc
  for (const text of ['First', 'Second']) base = run(base, { type: 'comment.add', payload: { taskId: task.event.result.taskId, text } }).doc
  base = run(base, { type: 'goal.create', payload: { title: 'Alice’s goal' } }).doc
  base = writeRecords(base, project.records)
  let checkedEntries = 0, checkedChanges = 0, bobChanges = 0
  for (let seed = 1; seed <= CASES; seed++) {
    const next = random(seed)
    let doc = base, actorCount = 0
    const bobActor = () => `${BOB}${(seed * 100 + actorCount++).toString(16).padStart(16, '0')}`
    const steps = 1 + Math.floor(next() * 8)
    for (let step = 0; step < steps; step++) {
      if (next() < 0.25) {
        // Concurrent writes: two or three forks of the same state, each by its own load of Bob's document.
        let merged = doc
        for (let fork = 0; fork < 2 + Math.floor(next() * 2); fork++) {
          const written = unusualWrite(doc, next, bobActor())
          if (written) merged = A.merge(A.clone(merged), written)
        }
        doc = merged
      } else if (next() < 0.15) {
        try { doc = run(doc, { type: 'goal.create', payload: { title: `Alice ${seed}-${step}` } }).doc } catch { /* Alice's map may be gone. */ }
      } else {
        doc = unusualWrite(doc, next, bobActor()) ?? doc
      }
    }
    const shown = activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf,
      recordValid: record => project.all.some(known => canonical(known) === canonical(record)) })
    const events = oracle(doc, 'operations'), records = oracle(doc, 'membership')
    for (const entry of shown) {
      checkedEntries++
      for (const change of entry.changes) {
        checkedChanges++
        if (entry.kind === 'unrecognised') continue
        const writes = (entry.kind === 'operation' ? events : records)(change.hash).filter(write => write.key === entry.key)
        const content = entry.kind === 'operation' ? entry.event : entry.record
        const match = writes.find(write => (entry.kind === 'operation' && entry.changes.length > 1
          ? canonical(withoutOrigin(write.value)) === canonical(withoutOrigin(content)) && write.value.replicaId === change.replicaId && write.value.timestamp === change.timestamp
          : canonical(write.value) === canonical(content)))
        assert.ok(match, `seed ${seed}: entry ${entry.id.slice(0, 12)} shows content change ${change.hash.slice(0, 12)} did not write at ${entry.key}`)
      }
      const bobs = entry.changes.filter(change => change.machineId === MACHINES[BOB])
      if (bobs.length && entry.kind === 'operation' && entry.event.actorId !== 'bob') assert.equal(entry.review, true, `seed ${seed}: Bob's change as another Actor is not listed for review`)
      if (entry.kind === 'unrecognised') assert.equal(entry.review, true)
    }
    for (const meta of A.getChangesMetaSince(doc, [])) {
      const holding = shown.filter(entry => entry.changes.some(change => change.hash === meta.hash))
      assert.ok(holding.length, `seed ${seed}: change ${meta.hash.slice(0, 12)} is not shown`)
      for (const entry of holding) assert.equal(entry.changes.find(change => change.hash === meta.hash).machineId, MACHINES[meta.actor.slice(0, 32)], `seed ${seed}: shown under another signer`)
      if (meta.actor.startsWith(BOB)) bobChanges++
    }
  }
  assert.ok(bobChanges > CASES, `only ${bobChanges} unusual changes were made`)
  // Reported with the run: how much the property covered.
  console.log(`activity property: ${CASES} cases, ${bobChanges} unusual changes, ${checkedEntries} entries and ${checkedChanges} listed changes checked`)
})
