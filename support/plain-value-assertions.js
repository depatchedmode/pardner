import assert from 'node:assert/strict'
import { decodeChange, getAllChanges } from '@automerge/automerge'

// Inspect history, not just visible winners: overwritten, deleted and concurrent
// text objects must also fail the guard.
export function assertNoText(doc) {
  for (const change of getAllChanges(doc)) {
    assert.equal(decodeChange(change).ops.some(op => op.action === 'makeText'), false, 'document history contains Automerge text')
  }
}
