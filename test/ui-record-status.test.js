import { it } from 'node:test'
import assert from 'node:assert/strict'
import { GOAL_STATUSES, VEIN_STATUSES } from '../ui-prototype/src/record-status.js'
import * as schema from '../lib/workspace-schema.js'
import { quickStatusEditable } from '../ui-prototype/src/task-status.js'

it('offers exactly the statuses the workspace schema accepts', () => {
  assert.deepEqual(GOAL_STATUSES, schema.GOAL_STATUSES)
  assert.deepEqual(VEIN_STATUSES, schema.VEIN_STATUSES)
})

it('allows a record status edit unless status itself is in conflict', () => {
  assert.equal(quickStatusEditable({ actor: 'alice', conflicts: { goalId: [{}, {}] } }), true)
  assert.equal(quickStatusEditable({ actor: 'alice', conflicts: { status: [{}, {}] } }), false)
  assert.equal(quickStatusEditable({ actor: '', conflicts: {} }), false)
})
