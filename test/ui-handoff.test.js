import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultHandoffStatus } from '../ui-prototype/src/handoff.js'

test('a handoff defaults to Review only from In progress', () => {
  assert.equal(defaultHandoffStatus('backlog'), 'backlog')
  assert.equal(defaultHandoffStatus('up-next'), 'up-next')
  assert.equal(defaultHandoffStatus('in-progress'), 'review')
  assert.equal(defaultHandoffStatus('review'), 'review')
  assert.equal(defaultHandoffStatus('completed'), 'completed')
})
