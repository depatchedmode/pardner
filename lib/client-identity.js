import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { canonical, requireValue } from './workspace-schema.js'

export const CLIENT_API = '/pardner/client/v1'
export const secret = () => randomBytes(32).toString('base64url')
export const hash = value => createHash('sha256').update(value).digest('hex')
export const fingerprint = value => hash(canonical(value))
export const HARNESS_IDS = ['openai-codex', 'anthropic-claude-code', 'cursor']
export const UNSUPPORTED_HARNESS = `Unsupported execution harness; use ${HARNESS_IDS.slice(0, -1).join(', ')} or ${HARNESS_IDS.at(-1)}`
export function actorId(humanId, harnessId = null) {
  return `actor-${fingerprint(harnessId ? ['pardner-actor-v1', 'agent', humanId, harnessId] : ['pardner-actor-v1', 'human', humanId])}`
}
export function profile(input) {
  requireValue(typeof input?.name === 'string' && input.name.trim(), 'Supply a name')
  requireValue(input.name.length <= 200, 'Use a name of at most 200 characters')
  requireValue(typeof input?.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(input.email) && input.email.length <= 320, 'Supply an email')
  return { name: input.name.trim(), email: input.email.trim() }
}
const text = (value, name, limit) => {
  if (value === undefined || value === null || value === '') return null
  requireValue(typeof value === 'string' && value.trim() && value.length <= limit, `${name} must be text of at most ${limit} characters`)
  return value.trim()
}
/**
 * Agent metadata as reported at enrollment: validated once here, then trusted by every member view.
 * `name` is null unless one was given; the Actor is then named after its owner when it is registered.
 */
export function setupAgent(input = {}) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Supply agent metadata as an object')
  const harnessId = input.harnessId ?? 'openai-codex'
  requireValue(HARNESS_IDS.includes(harnessId), UNSUPPORTED_HARNESS)
  return { harnessId, name: text(input.name, 'Agent name', 200), model: text(input.model, 'Agent model', 200), managedBy: text(input.managedBy, 'Agent manager', 100) }
}
const HARNESS_NAMES = { 'openai-codex': 'Codex', 'anthropic-claude-code': 'Claude', cursor: 'Cursor' }
export const harnessName = harnessId => HARNESS_NAMES[harnessId] ?? 'agent'
/**
 * The display name of an agent: the name it was given, otherwise "Maya’s Codex" from its owner and harness.
 * It is fixed when the Actor is registered; identities can't be renamed, so it never needs to follow one.
 */
export function agentName(owner, agent) {
  return agent.name ?? `${owner.name}’s ${harnessName(agent.harnessId)}`
}
/** Refuses a given agent name that differs from the agent already enrolled for that owner and harness. */
export function requireAgentName(owner, agent, enrolled) {
  requireValue(!agent.name || !enrolled || enrolled.displayName === agent.name,
    `${owner.name} already has a ${harnessName(agent.harnessId)} agent in this project named “${enrolled?.displayName}”. ` +
    'Each person has one agent per harness, and agents keep the name they joined with. Use that name, or none, to add this computer to it.',
    'AGENT_NAME_CONFLICT', enrolled && { actorId: enrolled.id, name: enrolled.displayName })
}
/** A device record as presented at enrollment, reduced to the fields members may see. */
export function enrolledDevice(input) {
  requireValue(typeof input?.id === 'string' && /^[a-f0-9-]{36}$/.test(input.id), 'Device required')
  return { id: input.id, name: text(input.name, 'Device name', 200) ?? 'Unnamed device' }
}
export function actorsFor(identity, device, agent) {
  const shared = { humanId: identity.id, gitIdentity: { name: identity.name, email: identity.email }, devices: [device] }
  return [
    { ...shared, id: actorId(identity.id), handle: `human-${identity.id}`, kind: 'human', displayName: identity.name },
    { ...shared, id: actorId(identity.id, agent.harnessId), handle: `agent-${hash(identity.id).slice(0, 20)}-${agent.harnessId}`,
      kind: 'agent', displayName: agentName(identity, agent), harnessId: agent.harnessId },
  ]
}
export function gitDefaults(directory) {
  const get = key => { try { return execFileSync('git', ['config', '--get', key], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  return { name: get('user.name'), email: get('user.email') }
}
