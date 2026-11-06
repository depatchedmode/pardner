import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { canonical, requireValue } from './workspace-schema.js'

export const CLIENT_API = '/pardner/client/v1'
export const secret = () => randomBytes(32).toString('base64url')
export const hash = value => createHash('sha256').update(value).digest('hex')
export const fingerprint = value => hash(canonical(value))
export const HARNESS_IDS = ['openai-codex', 'anthropic-claude-code', 'cursor']
export function actorId(humanId, harnessId = null) {
  return `actor-${fingerprint(harnessId ? ['pardner-actor-v1', 'agent', humanId, harnessId] : ['pardner-actor-v1', 'human', humanId])}`
}
export function profile(input) {
  requireValue(typeof input?.name === 'string' && input.name.trim() && input.name.length <= 200, 'Supply a name')
  requireValue(typeof input?.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(input.email) && input.email.length <= 320, 'Supply an email')
  return { name: input.name.trim(), email: input.email.trim() }
}
export function setupAgent(input = {}) {
  const harnessId = input.harnessId ?? 'openai-codex'
  requireValue(HARNESS_IDS.includes(harnessId), 'Unsupported execution harness')
  return { harnessId, name: input.name || 'Setup agent', model: input.model ?? null, managedBy: input.managedBy ?? null }
}
export function actorsFor(identity, device, agent) {
  const shared = { humanId: identity.id, gitIdentity: { name: identity.name, email: identity.email }, devices: [device] }
  return [
    { ...shared, id: actorId(identity.id), handle: `human-${identity.id}`, kind: 'human', displayName: identity.name },
    { ...shared, id: actorId(identity.id, agent.harnessId), handle: `agent-${hash(identity.id).slice(0, 20)}-${agent.harnessId}`,
      kind: 'agent', displayName: agent.name, harnessId: agent.harnessId },
  ]
}
export function gitDefaults(directory) {
  const get = key => { try { return execFileSync('git', ['config', '--get', key], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  return { name: get('user.name'), email: get('user.email') }
}
