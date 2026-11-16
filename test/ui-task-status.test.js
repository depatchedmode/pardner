import { it } from 'node:test'
import assert from 'node:assert/strict'
import { quickStatusEditable } from '../ui-prototype/src/task-status.js'

it('shows the inline Status select only for an Actor with nothing else open and no status conflict', () => {
  const base = { actor: 'alice', editing: false, handingOff: false, conflicts: {} }
  assert.equal(quickStatusEditable(base), true)
  assert.equal(quickStatusEditable({ ...base, actor: '' }), false, 'no Actor')
  assert.equal(quickStatusEditable({ ...base, actor: null }), false, 'no Actor')
  assert.equal(quickStatusEditable({ ...base, editing: true }), false, 'editing')
  assert.equal(quickStatusEditable({ ...base, handingOff: true }), false, 'handing off')
  assert.equal(quickStatusEditable({ ...base, conflicts: { status: [{}, {}] } }), false, 'status conflict')
  assert.equal(quickStatusEditable({ ...base, conflicts: { title: [{}, {}] } }), true, 'conflict on another field')
  assert.equal(quickStatusEditable({ ...base, conflicts: undefined }), true)
})
