import { randomBytes } from 'node:crypto'
import { generateMachineKey, personIdFor } from '../lib/machine-key.js'
import { buildRecord } from '../lib/membership.js'

/** Test-only: a genesis signed by a throwaway machine key, for documents built without a project runtime. */
export function testGenesis(key = generateMachineKey(), fields = {}) {
  return buildRecord(key, { kind: 'project.genesis', subject: personIdFor(key.publicKey), displayName: 'Test owner',
    nonce: randomBytes(16).toString('base64url'), ...fields })
}
