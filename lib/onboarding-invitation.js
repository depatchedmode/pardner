import { TAILCAT_VERSION } from './tailcat.js'

const envelopeLine = /^pardner-invite-v\d+\.[A-Za-z0-9_-]+$/gm

export function invitationEnvelope(text) {
  const matches = typeof text === 'string' && text.length <= 32768
    ? text.trim().match(envelopeLine) : null
  if (matches?.length !== 1) throw Object.assign(new Error('Paste one complete Pardner invitation'), { code: 'INVALID_INVITATION' })
  if (!matches[0].startsWith('pardner-invite-v2.')) {
    throw Object.assign(new Error('This invitation was made by an earlier Pardner version. Ask for a new one.'), { code: 'INVALID_INVITATION' })
  }
  return matches[0]
}

/** Where a computer with no Pardner gets this one from, until Pardner is published as a package. */
export const PARDNER_REPOSITORY = 'https://github.com/depatchedmode/pardner.git'

/**
 * The prompt a person pastes to their agent. `setup` adds what an agent on a computer without Pardner needs:
 * `commit` (the revision the inviting client runs; both computers must run the same one) and `tunnel` (the
 * project is shared over tailcat, which the joining computer needs installed).
 */
export function invitationPrompt({ projectName, purpose, invitation, setup = {} }) {
  const envelope = invitationEnvelope(invitation)
  const project = JSON.stringify(projectName)
  const action = {
    human: `Join project ${project} with my own identity. Set up or reuse my local client, register yourself as my agent with your actual harness and model, and open my board.`,
    agent: `Join project ${project} as my agent using your actual harness and model. Reuse my local client when available; otherwise start an agent-only client. Use your agent grant to read the board; this invitation does not grant human browser access.`,
    device: `Add this machine to project ${project} under my existing identity. Set up its local client and open the board.`,
  }[purpose]
  if (!action) throw Object.assign(new Error('Choose a human, agent or device invitation'), { code: 'INVALID_ARGUMENT' })
  const openPeople = {
    human: 'ask me to have my inviter or an admin open People on the project board',
    device: 'ask me to open People on one of my computers already in the project, or ask an admin to open it',
    agent: 'ask me to open People on one of my computers already in the project',
  }[purpose]
  const revision = typeof setup.commit === 'string' && /^[0-9a-f]{40}$/.test(setup.commit) ? setup.commit : null
  const install = `If this computer has no Pardner checkout: git clone ${PARDNER_REPOSITORY}${revision ? `, check out commit ${revision}` : ''}, and with Node 24.11.1 run npm ci, npm ci --prefix ui-prototype and npm run ui:build. Then run node bin/pardner.js wherever these steps say pardner.${revision ? ` An existing checkout must be at that same commit.` : ''}`
  const tunnel = setup.tunnel ? ` This project is shared over tailcat: install tailcat ${TAILCAT_VERSION} first (macOS: brew install tailcat; other systems: that release from https://github.com/tailscale/tailcat/releases). Pardner starts and stops the tunnel itself, so never run tailcat by hand.` : ''
  return `${action}\n\nUse a trusted Pardner onboarding-preview checkout with the client v1 CLI. ${install}${tunnel}\n\nSave the invitation below privately. Use the same absolute CLIENT_DIR for serve, join and later commands. Start with this command and read its first response.\npardner client join --data CLIENT_DIR --invitation-file FILE --operation-id STABLE_ID\n\nIf join reports the project immediately, continue with setup. If join reports a pending request:\n- Tell me immediately that this machine needs approval. If there is no confirmation code yet, ${openPeople} to reveal it.\n- Retry the same join command with the same operation ID. When join reports a confirmation code, tell me the code and ask me to compare it with the approver by voice or in person before they approve.\n- After approval, run the same command again and continue with setup when it reports the project.\n\n${envelope}`
}
