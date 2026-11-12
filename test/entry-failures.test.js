import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { storageValue } from '../lib/workspace-values.js'
import { BOB, board, run } from '../support/activity-fixture.js'

// One change's data never stops every other change from being read or shown: it fails as its own entry.

const bob = n => `${BOB}${String(n).padStart(2, '0').repeat(8)}`

test('a change Automerge cannot decode into JavaScript, such as one holding an integer beyond 2^53, is its own entry for review, and every other change is derived', () => {
  const { doc: start } = board()
  const before = run(start, { type: 'task.create', payload: { title: 'Before' } })
  const odd = A.change(A.clone(before.doc, { actor: bob(1) }), draft => { draft.operations['op-big'] = storageValue({ ...before.event, payload: { title: 'Big' } }); draft.operations['op-big'].payload.big = 2 ** 60 })
  const [oddHash] = A.getHeads(odd)
  const after = run(odd, { type: 'goal.create', payload: { title: 'After' } })
  const entries = deriveAll(after.doc)
  assert.equal(entries.size, A.getChangesMetaSince(after.doc, []).length, 'every change has an entry')
  assert.equal(entries.get(oddHash).kind, 'unrecognised')
  assert.equal(entries.get(before.hash).kind, 'operation')
  assert.equal(entries.get(after.hash).event.payload.title, 'After')
})
