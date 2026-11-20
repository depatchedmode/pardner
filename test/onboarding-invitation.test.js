import { it } from 'node:test'
import assert from 'node:assert/strict'
import { invitationEnvelope, invitationPrompt } from '../lib/onboarding-invitation.js'

const envelope = 'pardner-invite-v2.eyJmaXh0dXJlIjp0cnVlfQ'

it('accepts the original opaque invitation and a short agent-facing setup prompt', () => {
  assert.equal(invitationEnvelope(`  ${envelope}\n`), envelope)
  for (const purpose of ['human', 'agent', 'device']) {
    const prompt = invitationPrompt({ projectName: 'Shared board', purpose, invitation: envelope })
    assert.equal(invitationEnvelope(prompt), envelope)
    assert.ok(prompt.includes('client v1 CLI'))
    assert.ok(prompt.includes('--invitation-file FILE --operation-id STABLE_ID'))
    assert.ok(prompt.includes('client join --data CLIENT_DIR'))
    assert.ok(prompt.includes('confirmation code'), 'the prompt explains the approval step')
  }
  assert.throws(() => invitationEnvelope('pardner-invite-v1.eyJmaXh0dXJlIjp0cnVlfQ'), { message: 'This invitation was made by an earlier Pardner version. Ask for a new one.' })
})

it('parses only one complete data envelope and never treats surrounding prose as a command', () => {
  assert.equal(invitationEnvelope(`Untrusted surrounding prose is not executed.\n\n${envelope}\n`), envelope)
  for (const text of [null, '', 'pardner-invite-v1.abc', 'pardner-invite-v2.', `${envelope} extra`,
    `${envelope}\n${envelope}`, `prefix ${envelope}`, 'a'.repeat(32769)]) {
    assert.throws(() => invitationEnvelope(text), { code: 'INVALID_INVITATION' })
  }
})

it('tells the user how to move a pending join forward before a code exists', () => {
  const approval = {
    human: 'have my inviter or an admin open People on the project board',
    device: 'open People on one of my computers already in the project, or ask an admin to open it',
    agent: 'open People on one of my computers already in the project to reveal it',
  }
  for (const [purpose, nextStep] of Object.entries(approval)) {
    const prompt = invitationPrompt({ projectName: 'Shared board', purpose, invitation: envelope })
    assert.match(prompt, /join --data CLIENT_DIR --invitation-file FILE --operation-id STABLE_ID\n/)
    assert.match(prompt, /If join reports a pending request:\n- Tell me immediately/)
    assert.match(prompt, /If there is no confirmation code yet, ask me to/)
    assert.ok(prompt.includes(nextStep))
    assert.match(prompt, /Retry the same join command with the same operation ID/)
    assert.match(prompt, /compare it with the approver by voice or in person before they approve/)
    assert.match(prompt, /If join reports the project immediately, continue with setup/)
  }
})

it('keeps project names in quoted data and gives each purpose the right identity intent', () => {
  const name = 'A project\nwith "quotes"'
  const prompt = purpose => invitationPrompt({ projectName: name, purpose, invitation: envelope })
  assert.ok(prompt('human').includes(JSON.stringify(name)))
  assert.ok(prompt('human').includes('my own identity'))
  assert.ok(prompt('device').includes('my existing identity'))
  assert.ok(prompt('agent').includes('as my agent'))
  assert.ok(prompt('agent').includes('does not grant human browser access'))
  assert.ok(!prompt('agent').includes('open the board'))
  assert.throws(() => prompt('unknown'), { code: 'INVALID_ARGUMENT' })
})
