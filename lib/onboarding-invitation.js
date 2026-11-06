const envelopeLine = /^pardner-invite-v1\.[A-Za-z0-9_-]+$/gm

export function invitationEnvelope(text) {
  const matches = typeof text === 'string' && text.length <= 32768
    ? text.trim().match(envelopeLine) : null
  if (matches?.length !== 1) throw Object.assign(new Error('Paste one complete Pardner invitation'), { code: 'INVALID_INVITATION' })
  return matches[0]
}

export function invitationPrompt({ projectName, purpose, invitation }) {
  const envelope = invitationEnvelope(invitation)
  const project = JSON.stringify(projectName)
  const action = {
    human: `Join project ${project} with my own identity. Set up or reuse my local client, register yourself as my agent with your actual harness and model, and open my board.`,
    agent: `Join project ${project} as my agent using your actual harness and model. Reuse my local client when available, and open the board.`,
    device: `Add this machine to project ${project} under my existing identity. Set up its local client and open the board.`,
  }[purpose]
  if (!action) throw Object.assign(new Error('Choose a human, agent or device invitation'), { code: 'INVALID_ARGUMENT' })
  return `${action}\n\nUse a trusted Pardner onboarding-preview checkout with the client v1 CLI. Save the invitation below privately; join with: pardner client join --invitation-file FILE --operation-id STABLE_ID\n\n${envelope}`
}
