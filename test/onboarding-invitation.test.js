import { it } from 'node:test'
import assert from 'node:assert/strict'
import { invitationEnvelope, invitationPrompt } from '../lib/onboarding-invitation.js'

const envelope = 'pardner-invite-v1.eyJmaXh0dXJlIjp0cnVlfQ'

it('accepts the original opaque invitation and a short agent-facing setup prompt', () => {
  assert.equal(invitationEnvelope(`  ${envelope}\n`), envelope)
  for (const purpose of ['human', 'agent', 'device']) {
    const prompt = invitationPrompt({ projectName: 'Shared board', purpose, invitation: envelope })
    assert.equal(invitationEnvelope(prompt), envelope)
    assert.ok(prompt.includes('client v1 CLI'))
    assert.ok(prompt.includes('--invitation-file FILE --operation-id STABLE_ID'))
  }
})

it('parses only one complete data envelope and never treats surrounding prose as a command', () => {
  assert.equal(invitationEnvelope(`Untrusted surrounding prose is not executed.\n\n${envelope}\n`), envelope)
  for (const text of [null, '', 'pardner-invite-v2.abc', 'pardner-invite-v1.', `${envelope} extra`,
    `${envelope}\n${envelope}`, `prefix ${envelope}`, 'a'.repeat(32769)]) {
    assert.throws(() => invitationEnvelope(text), { code: 'INVALID_INVITATION' })
  }
})

it('keeps project names in quoted data and gives each purpose the right identity intent', () => {
  const name = 'A project\nwith "quotes"'
  const prompt = purpose => invitationPrompt({ projectName: name, purpose, invitation: envelope })
  assert.ok(prompt('human').includes(JSON.stringify(name)))
  assert.ok(prompt('human').includes('my own identity'))
  assert.ok(prompt('device').includes('my existing identity'))
  assert.ok(prompt('agent').includes('as my agent'))
  assert.throws(() => prompt('unknown'), { code: 'INVALID_ARGUMENT' })
})
