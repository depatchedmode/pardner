import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as Automerge from '@automerge/automerge'

function field(value, actorId, operationId) {
  return { value, actorId, operationId, replicaId: `replica-${actorId}` }
}

function fixture() {
  return Automerge.from({
    fields: {
      outcome: field(null, 'alice', 'created'),
      title: field('Shared work', 'alice', 'created'),
    },
    operations: { created: { actorId: 'alice' } },
    readReceipts: {},
  })
}

function edit(doc, fieldName, value, actorId, operationId) {
  return Automerge.change(doc, draft => {
    draft.fields[fieldName] = field(value, actorId, operationId)
    draft.operations[operationId] = { actorId, field: fieldName, value }
  })
}

describe('pinned CRDT qualification', () => {
  it('merges different fields together with each operation and its attribution', () => {
    const original = fixture()
    const left = edit(Automerge.clone(original), 'outcome', 'dead-end', 'builder', 'a')
    const right = edit(Automerge.clone(original), 'title', 'Reviewed work', 'bob', 'b')
    const merged = Automerge.merge(left, right)
    assert.deepEqual(merged.fields.outcome, field('dead-end', 'builder', 'a'))
    assert.deepEqual(merged.fields.title, field('Reviewed work', 'bob', 'b'))
    assert.deepEqual(Object.keys(merged.operations).sort(), ['a', 'b', 'created'])
  })

  it('preserves conflicting values and authors through serialization and explicit resolution', () => {
    const original = fixture()
    const left = edit(Automerge.clone(original), 'outcome', 'abandoned', 'builder', 'a')
    const right = edit(Automerge.clone(original), 'outcome', 'completed', 'reviewer', 'b')
    const merged = Automerge.load(Automerge.save(Automerge.merge(left, right)))
    const alternatives = Object.values(Automerge.getConflicts(merged.fields, 'outcome'))
    assert.deepEqual(alternatives.sort((a, b) => a.operationId.localeCompare(b.operationId)), [
      field('abandoned', 'builder', 'a'), field('completed', 'reviewer', 'b'),
    ])
    const resolved = edit(merged, 'outcome', 'abandoned', 'bob', 'resolution')
    assert.ok(Object.keys(Automerge.getConflicts(resolved.fields, 'outcome') || {}).length <= 1)
    assert.deepEqual(resolved.fields.outcome, field('abandoned', 'bob', 'resolution'))
    assert.deepEqual(Object.keys(resolved.operations).sort(), ['a', 'b', 'created', 'resolution'])
    const late = edit(Automerge.clone(original), 'outcome', 'dead-end', 'alice', 'late')
    const withLateEdit = Automerge.merge(resolved, late)
    assert.deepEqual(Object.values(Automerge.getConflicts(withLateEdit.fields, 'outcome'))
      .map(record => record.operationId).sort(), ['late', 'resolution'])
  })

  it('merges Actor read receipts without hiding previously unseen comments', () => {
    const original = fixture()
    const left = Automerge.change(Automerge.clone(original), draft => {
      draft.readReceipts['alice:comment-a'] = true
    })
    const right = Automerge.change(Automerge.clone(original), draft => {
      draft.readReceipts['alice:comment-b'] = true
      draft.readReceipts['bob:comment-b'] = true
    })
    const merged = Automerge.merge(left, right)
    assert.equal(merged.readReceipts['alice:comment-a'], true)
    assert.equal(merged.readReceipts['alice:comment-b'], true)
    assert.equal(merged.readReceipts['bob:comment-a'], undefined)
    assert.equal(merged.readReceipts['alice:unseen-offline-comment'], undefined)
  })
})
