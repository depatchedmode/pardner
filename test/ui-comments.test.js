import assert from 'node:assert/strict'
import test from 'node:test'
import { newRevisionIds, isNewComment } from '../ui-prototype/src/comments.js'

const single = (extra = {}) => ({
  actorId: 'alice', editedBy: 'alice', revisionIds: ['r1'], unreadRevisionIds: ['r1'], conflicts: [], ...extra,
})

test('own comment is not new for its author', () => {
  assert.deepEqual(newRevisionIds(single(), 'alice'), [])
  assert.equal(isNewComment(single(), 'alice'), false)
})
test("another Actor's comment is new", () => {
  assert.deepEqual(newRevisionIds(single({ actorId: 'bob', editedBy: 'bob' }), 'alice'), ['r1'])
})
test("another Actor's edit of Alice's comment is new for Alice", () => {
  const edited = single({ editedBy: 'bob', revisionIds: ['r1', 'r2'], unreadRevisionIds: ['r2'] })
  assert.deepEqual(newRevisionIds(edited, 'alice'), ['r2'])
  assert.equal(isNewComment(edited, 'alice'), true)
})
test("own edit of someone else's comment is not new", () => {
  assert.deepEqual(newRevisionIds(single({ actorId: 'bob', editedBy: 'alice' }), 'alice'), [])
})
test('already-read revisions are never new', () => {
  assert.deepEqual(newRevisionIds(single({ actorId: 'bob', editedBy: 'bob', unreadRevisionIds: [] }), 'alice'), [])
})
test('conflicts resolve the author per revision', () => {
  const conflicted = single({
    revisionIds: ['r1', 'r2'], unreadRevisionIds: ['r1', 'r2'],
    conflicts: [{ operationId: 'r1', actorId: 'alice' }, { operationId: 'r2', actorId: 'bob' }],
  })
  assert.deepEqual(newRevisionIds(conflicted, 'alice'), ['r2'])
  assert.deepEqual(newRevisionIds(conflicted, 'bob'), ['r1'])
})
test('a conflict with one alternative read is still new', () => {
  const conflicted = single({
    revisionIds: ['r1', 'r2'], unreadRevisionIds: ['r2'],
    conflicts: [{ operationId: 'r1', actorId: 'bob' }, { operationId: 'r2', actorId: 'bob' }],
  })
  assert.equal(isNewComment(conflicted, 'alice'), true)
})
test('a revision missing from conflicts falls back to editedBy', () => {
  const odd = single({ editedBy: 'bob', conflicts: [{ operationId: 'zz', actorId: 'alice' }] })
  assert.deepEqual(newRevisionIds(odd, 'alice'), ['r1'])
})
test('no Actor or missing fields yields nothing', () => {
  assert.deepEqual(newRevisionIds(single({ actorId: 'bob', editedBy: 'bob' }), null), [])
  assert.deepEqual(newRevisionIds({ actorId: 'bob' }, 'alice'), [])
})
