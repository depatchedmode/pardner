import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { ChangeEncoder } from '../support/change-encoder.js'

// Which of Automerge 3.2.3's reads are faithful at a past head, measured in the pinned version. lib/change-log.js
// reads a change's content with exactly the faithful ones: getAll, keys and length with explicit heads (and objInfo
// for where an object sits). It never reads a view through getConflicts, materialize or the document proxy.

const actor = n => `${String(n).repeat(32).slice(0, 32)}${'01'.repeat(8)}`

function history() {
  let doc = A.from({ operations: {} }, { actor: actor(1) })
  doc = A.change(doc, draft => { draft.operations.k = { x: new A.ImmutableString('one'), list: [1, 2] } })
  const [head] = A.getHeads(doc)
  // Later: an edit inside the object, and two concurrent replacements of the value at its key.
  const edit = A.change(A.clone(doc, { actor: actor(2) }), draft => { draft.operations.k.x = new A.ImmutableString('two'); draft.operations.k.list.push(3); draft.operations.k.y = 1 })
  const left = A.change(A.clone(doc, { actor: actor(3) }), draft => { draft.operations.k = { z: 1 } })
  const right = A.change(A.clone(doc, { actor: actor(4) }), draft => { draft.operations.k = { z: 2 } })
  const now = A.merge(A.merge(A.merge(A.clone(doc), edit), left), right)
  const backend = A.getBackend(now), ops = A.getObjectId(now.operations)
  const [[, object]] = backend.getAll(ops, 'k', [head])
  return { now, head, backend, ops, object }
}

test('getAll, keys and length with explicit heads read exactly the state at those heads', () => {
  const { head, backend, ops, object } = history()
  assert.equal(backend.getAll(ops, 'k').length, 2, 'two values at the key now')
  assert.equal(backend.getAll(ops, 'k', [head]).length, 1, 'one at the head')
  assert.deepEqual(backend.keys(object, [head]), ['list', 'x'])
  assert.deepEqual(backend.keys(object), ['list', 'x', 'y'])
  const [[, list]] = backend.getAll(object, 'list', [head])
  assert.deepEqual([backend.length(list, [head]), backend.length(list)], [2, 3])
  assert.deepEqual(backend.getAll(object, 'x', [head]).map(value => value.slice(0, 2)), [['str', 'one']])
  assert.deepEqual(backend.objInfo(list, [head]).path, ['operations', 'k', 'list'], 'objInfo gives where an object sat at the head')
})

test('getConflicts on a view reports the current document’s conflicts, not the view’s', () => {
  const { now, head } = history()
  const past = A.view(now, [head])
  assert.equal(past.operations.k.x.toString(), 'one', 'the view’s value is the past one')
  assert.equal(Object.keys(A.getConflicts(past.operations, 'k') ?? {}).length, 2, 'but its conflicts are the current ones')
})

test('materialize applies a key named __proto__ as a prototype, so it is never used to read content', () => {
  const doc = A.from({ operations: {} }, { actor: actor(5) })
  const enc = new ChangeEncoder(doc, actor(6))
  const event = enc.value({ obj: enc.root('operations'), key: 'k' }, {})
  enc.value({ obj: event, key: '__proto__' }, { operationId: 'hidden' })
  const { doc: written, hash } = enc.apply()
  const backend = A.getBackend(written)
  const [[, object]] = backend.getAll(enc.root('operations'), 'k', [hash])
  const materialized = backend.materialize(object, [hash])
  assert.equal(Object.hasOwn(materialized, '__proto__'), false)
  assert.equal(String(materialized.operationId), 'hidden', 'the field is inherited, not data')
  assert.deepEqual(backend.keys(object, [hash]), ['__proto__'], 'keys() reads the key as written')
})

test('Automerge refuses a change whose operation names an object no change has made, so a change’s own objects hold only what it put there', () => {
  const doc = A.from({ operations: {} }, { actor: actor(7) })
  const enc = new ChangeEncoder(doc, actor(8))
  enc.op({ action: 'set', obj: `99@${actor(9)}`, key: 'x', value: 'from an ancestor' })
  // Automerge reports the refusal through its panic hook, on the console; the test keeps that out of its output.
  const error = console.error
  console.error = () => {}
  try { assert.throws(() => A.applyChanges(A.clone(doc), [enc.encode().bytes])) } finally { console.error = error }
})
