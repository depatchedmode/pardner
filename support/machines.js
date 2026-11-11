import { randomBytes } from 'node:crypto'
import { generateMachineKey } from '../lib/machine-key.js'
import { buildRecord } from '../lib/membership.js'

/**
 * Test-only: a project whose genesis is signed by `owner`, the hub's machine,
 * with each further machine admitted as a member person by the owner. Keys
 * come from this fixture, never from flags or the environment.
 */
export function testProject({ members = 1, role = 'member' } = {}) {
  const owner = generateMachineKey()
  const genesis = buildRecord(owner, { kind: 'project.genesis', subject: 'person-owner', displayName: 'Owner', nonce: randomBytes(16).toString('base64url') })
  const projectId = genesis.projectId
  const keys = Array.from({ length: members }, () => generateMachineKey())
  const admit = (key, index, admitted = role) => buildRecord(owner, { projectId, kind: 'member.add', subject: `person-${index}`, role: admitted,
    displayName: `Member ${index}`, machineId: key.machineId, publicKey: key.publicKey, offer: {}, joinRequest: {}, approval: {} })
  const records = keys.map((key, index) => admit(key, index))
  const remove = (key, signer = owner) => buildRecord(signer, { projectId, kind: 'machine.remove', subject: key.machineId })
  return { owner, genesis, projectId, keys, records, all: [genesis, ...records], admit, remove, stranger: generateMachineKey() }
}
