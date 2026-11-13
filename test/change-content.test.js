import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll, oversizedEntry } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { plain, taskState } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ChangeEncoder } from '../support/change-encoder.js'
import { BOB, actorsOf, board, everyOperation, run, signedByActor } from '../support/activity-fixture.js'

// What a change wrote is read through Automerge itself, as of that change, and is plain data that survives storage
// unchanged (lib/change-log.js). These changes are encoded operation by operation, as a modified client can write them.

const bob = n => `${BOB}${String(n).padStart(2, '0').repeat(8)}`
const view = doc => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf, recordValid: () => true })
const stored = entry => JSON.parse(JSON.stringify(entry))
const ids = ['operationId', 'requestId', 'type', 'actorId', 'timestamp', 'fingerprint', 'replicaId']

/** A task.update of `field` prepared on `doc` by Alice, not yet written. */
function prepared(doc, field, value) {
  const taskId = Object.keys(doc.tasks)[0]
  const request = { operationId: `update-${field}`, actorId: 'alice', type: 'task.update', payload: { taskId, updates: { [field]: value }, expectedRevisions: { [field]: taskState(doc, taskId).revisions[field] } } }
  return { taskId, ...prepareOperation(doc, request, { replicaId: 'replica-alice', timestamp: '2026-11-02T10:00:00.000Z' }) }
}

/** Writes, in `enc`, the side effects the real write path makes for a one-field task.update. */
function fieldWrites(enc, doc, { taskId, event }, field) {
  const key = `${taskId}:${field}`
  const current = A.getBackend(doc).getAll(enc.root('taskFields'), key).map(value => value[1])
  enc.value({ obj: enc.root('taskFields'), key }, { value: event.changes[0].new, operationId: event.operationId, actorId: event.actorId, replicaId: event.replicaId, timestamp: event.timestamp }, current)
  for (const revision of event.payload.expectedRevisions[field]) enc.value({ obj: enc.root('supersededRevisions'), key: `${key}:${revision}` }, true)
  enc.value({ obj: enc.root('operationRequests'), key: event.requestId }, event.operationId)
}

test('an element inserted, replaced, then deleted naming only its insertion, inside one event, is shown exactly as Automerge reads it', () => {
  const { doc: start } = board()
  const { doc } = run(start, { type: 'task.create', payload: { title: 'Encoded' } })
  const update = prepared(doc, 'status', 'completed')
  const enc = new ChangeEncoder(doc, bob(1))
  const { changes, ...rest } = update.event
  const event = enc.value({ obj: enc.root('operations'), key: update.event.operationId }, rest)
  const list = enc.op({ action: 'makeList', obj: event, key: 'changes' })
  const inserted = enc.value({ obj: list, elemId: '_head', insert: true }, { field: 'status', old: 'backlog', new: 'open' })
  enc.value({ obj: list, elemId: inserted }, { field: 'status', old: 'backlog', new: 'completed' }, [inserted])
  enc.op({ action: 'del', obj: list, elemId: inserted, pred: [inserted] })
  fieldWrites(enc, doc, update, 'status')
  const { doc: written, hash } = enc.apply()
  // Automerge keeps the replacement: the deletion named only the insertion it replaced.
  assert.deepEqual(plain(written.operations[update.event.operationId].changes), [{ field: 'status', old: 'backlog', new: 'completed' }])
  const entry = deriveAll(written).get(hash)
  assert.equal(entry.kind, 'operation')
  assert.deepEqual(entry.event.changes, [{ field: 'status', old: 'backlog', new: 'completed' }], 'the content is what Automerge reads, not a second reading of the operations')
  assert.deepEqual(stored(entry), entry)
})

test('an event whose identifying fields sit in a map at the key __proto__ is not an operation, keeps that key as data, and reads the same after storage', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Prototype' } })
  const enc = new ChangeEncoder(created.doc, bob(2))
  const identifying = Object.fromEntries(ids.map(field => [field, created.event[field]]))
  const rest = Object.fromEntries(Object.entries(created.event).filter(([field]) => !ids.includes(field)))
  const event = enc.value({ obj: enc.root('operations'), key: 'op-prototype' }, rest)
  enc.value({ obj: event, key: '__proto__' }, identifying)
  enc.value({ obj: event, key: 'constructor' }, 'a plain key')
  const { doc, hash } = enc.apply()
  const entry = deriveAll(doc).get(hash)
  assert.equal(entry.kind, 'unrecognised', 'identifying fields must be the event’s own')
  const value = entry.wrote.events[0].value
  assert.equal(Object.getPrototypeOf(value), Object.prototype, 'nothing was written onto a prototype')
  assert.ok(Object.hasOwn(value, '__proto__') && Object.hasOwn(value, 'constructor'), 'both keys are ordinary data')
  assert.equal(value.__proto__.operationId, created.event.operationId)
  assert.deepEqual(stored(entry), entry, 'storage gives back the same entry')
  assert.equal(view(doc).find(item => item.id === hash).review, true)
})

test('a payload that JSON cannot hold exactly, such as Infinity, bytes, a date or a counter, makes the change unrecognised, and its entry reads the same after storage', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Values' } })
  for (const [index, odd] of [Infinity, NaN, new Uint8Array([1]), new Date(0), new A.Counter(1), 2 ** 53 + 2].entries()) {
    // Written inside the change's own event as Automerge stores it, not through storageValue, which makes plain maps.
    const doc = A.change(A.clone(created.doc, { actor: bob(10 + index) }), draft => {
      draft.operations[created.event.operationId] = storageValue({ ...created.event, payload: { title: 'Values' } })
      draft.operations[created.event.operationId].payload.odd = odd
    })
    const [hash] = A.getHeads(doc)
    const entry = deriveAll(doc).get(hash)
    assert.equal(entry.kind, 'unrecognised', `${String(odd)} is not shown as an operation`)
    assert.deepEqual(stored(entry), entry, `${String(odd)}: storage gives back the same entry`)
  }
})

test('every ordinary operation’s derived entry reads the same after storage', () => {
  const { doc } = everyOperation()
  for (const entry of deriveAll(doc).values()) assert.deepEqual(stored(entry), entry, `${entry.kind} ${entry.event?.type ?? ''}`)
})

test('an entry at every limit of the derivation reads the same after storage, and says how much it left out', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Limits' } })
  const { doc } = created
  const taskId = created.event.result.taskId
  const many = 20
  const register = value => ({ value, operationId: created.event.operationId, actorId: 'alice', replicaId: 'replica-alice', timestamp: created.event.timestamp })
  const cases = {
    'more unreadable values than are described': (enc) => {
      // A counter is not plain data.
      for (let i = 0; i < many; i++) enc.op({ action: 'set', obj: enc.root('taskFields'), key: `${taskId}:odd${i}`, value: 1, datatype: 'counter' })
      return { wrote: 'unreadable' }
    },
    'more events in one change than are described': (enc) => {
      for (let i = 0; i < many; i++) enc.value({ obj: enc.root('operations'), key: `op-many-${i}` }, { ...created.event, operationId: `op-many-${i}` })
      return { wrote: 'events' }
    },
    'more records beside an event than are described': (enc) => {
      enc.value({ obj: enc.root('operations'), key: 'op-with-records' }, { ...created.event, operationId: 'op-with-records' })
      for (let i = 0; i < many; i++) enc.value({ obj: enc.root('membership'), key: `record-${i}` }, { recordId: `record-${i}`, kind: 'profile' })
      return { wrote: 'records' }
    },
    'more replaced entries than are described': (enc, base) => {
      // Each of the events the base holds at `op-held-i` is written again, naming the one it replaces.
      for (let i = 0; i < many; i++) {
        const pred = A.getBackend(base).getAll(enc.root('operations'), `op-held-${i}`).map(value => value[1])
        enc.value({ obj: enc.root('operations'), key: `op-held-${i}` }, { ...created.event, operationId: `op-replaced-${i}` }, pred)
      }
      return {}
    },
    'more unusual writes of each sort than are described': (enc) => {
      for (let i = 0; i < many; i++) {
        enc.op({ action: 'set', obj: '_root', key: `top${i}`, value: i, datatype: 'int' })
        enc.op({ action: 'set', obj: enc.root('elsewhere'), key: `k${i}`, value: i, datatype: 'int' })
      }
      return { unusual: ['root', 'unknownMaps'] }
    },
    'more differences from its event than are described': (enc) => {
      const event = { ...created.event, operationId: 'op-differs', requestId: 'request-differs' }
      enc.value({ obj: enc.root('operations'), key: event.operationId }, event)
      enc.value({ obj: enc.root('operationRequests'), key: event.requestId }, event.operationId)
      for (let i = 0; i < many; i++) enc.value({ obj: enc.root('commentBodies'), key: `comment-extra-${i}` }, register(`Extra ${i}`))
      return { mismatch: true }
    },
    'a value nested deeper than is read': (enc) => {
      let value = 'deep'
      for (let i = 0; i < 40; i++) value = { inside: value }
      enc.value({ obj: enc.root('taskFields'), key: `${taskId}:deep` }, value)
      return {}
    },
    'more values holding objects of their own than are indexed': (enc) => {
      for (let i = 0; i < 1005; i++) enc.value({ obj: enc.root('taskFields'), key: `${taskId}:nested${i}` }, register([`tag-${i}`]))
      return { nested: true }
    },
  }
  for (const [label, write] of Object.entries(cases)) {
    // The `elsewhere` map exists before the change, so writes into it are writes into an unknown top-level map.
    const base = A.change(A.clone(doc, { actor: bob(9) }), draft => {
      draft.elsewhere = {}
      for (let i = 0; i < many; i++) draft.operations[`op-held-${i}`] = storageValue({ ...created.event, operationId: `op-held-${i}` })
    })
    const enc = new ChangeEncoder(base, bob(10))
    const expect = write(enc, base)
    const { doc: next, hash } = enc.apply()
    const entry = deriveAll(next).get(hash)
    assert.deepEqual(stored(entry), entry, `${label}: the entry is not the same after storage`)
    if (expect.wrote) assert.ok(entry.wrote?.more?.[expect.wrote] > 0, `${label}: it does not say how many were left out: ${JSON.stringify(entry.wrote?.more)}`)
    for (const sort of expect.unusual ?? []) assert.ok(entry.unusual.count > entry.unusual[sort].length, `${label}: ${sort}`)
    if (expect.mismatch) assert.ok(entry.mismatch.at(-1).issue === 'more' && entry.mismatch.at(-1).more > 0, label)
    if (expect.nested) assert.ok(entry.more?.nested > 0, `${label}: it does not say how many were not indexed`)
    if (label.startsWith('more replaced')) assert.ok(entry.more?.replaced > 0, `${label}: it does not say how many replaced entries were left out`)
    // Shown in Activity the same way before and after storage.
    const shown = activityView({ entries: [entry], stateOf: signedByActor(next), actorsOf })
    assert.deepEqual(activityView({ entries: [stored(entry)], stateOf: signedByActor(next), actorsOf }), shown, label)
  }
})

test('the entry of a change that is not read in detail (too large, undecodable, or with a time no date can show) reads the same after storage', () => {
  const { doc: start } = board()
  const created = run(start, { type: 'task.create', payload: { title: 'Limits' } })
  const odd = A.change(A.clone(created.doc, { actor: bob(11) }), draft => { draft.operations['op-big'] = storageValue({ ...created.event, payload: { title: 'Big' } }); draft.operations['op-big'].payload.big = 2 ** 60 })
  const timed = new ChangeEncoder(odd, bob(12), { time: 8640000000001 })
  timed.value({ obj: timed.root('operations'), key: 'op-timed' }, { ...created.event, operationId: 'op-timed' })
  const { doc } = timed.apply()
  const entries = [...deriveAll(doc).values()]
  const meta = A.getChangesMetaSince(doc, []).at(-1)
  entries.push(oversizedEntry({ ...meta, maxOp: meta.startOp + 10 ** 6 }), oversizedEntry(meta, 9 * 1024 * 1024))
  assert.ok(entries.some(entry => entry.wrote?.unreadable?.[0]?.reason?.startsWith('could not be read')), 'an undecodable change is among them')
  assert.ok(entries.some(entry => entry.badTime), 'a change with a time no date can show is among them')
  for (const entry of entries) assert.deepEqual(stored(entry), entry)
})
