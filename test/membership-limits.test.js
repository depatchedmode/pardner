import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { generateMachineKey } from '../lib/machine-key.js'
import { computeMembership, verifyRecord } from '../lib/membership.js'
import { forge, shuffled, trustProject } from '../support/trust-records.js'

// Limits are protocol rules, including unknown fields and embedded consent material.
const oversized = base => [
  { ...base, displayName: 'x'.repeat(4097) },
  { ...base, offer: { ...base.offer, extra: Array.from({ length: 80 }, () => 'x'.repeat(1024)) } },
  { ...base, joinRequest: { ...base.joinRequest, extra: Array.from({ length: 80 }, () => 'x'.repeat(1024)) } },
  { ...base, extra: Array.from({ length: 80 }, () => 'x'.repeat(1024)) },
  { ...base, extra: Array.from({ length: 17 }).reduce(value => ({ child: value }), null) },
]

test('record limits reject oversized text, envelopes and nesting before checking signatures', t => {
  const p = trustProject(), key = generateMachineKey(), base = p.admit(p.owner, key)
  const verify = t.mock.method(crypto, 'verify', () => { throw new Error('signature verification ran before limits') })
  syncBuiltinESMExports()
  try {
    for (const record of oversized(base)) {
      const result = verifyRecord(record, p.projectId, p.owner.publicKey)
      assert.equal(result.valid, false)
      assert.match(result.reason, /Record exceeds/)
    }
    assert.equal(verify.mock.callCount(), 0)
  } finally { t.mock.restoreAll(); syncBuiltinESMExports() }
  for (const record of oversized(base)) {
    const result = computeMembership([p.genesis, record])
    assert.match(result.rejected[0].reason, /Record exceeds/)
    assert.equal(result.machines.length, 1)
  }
})

test('thousands of repeated certifications and a long admission chain require bounded work', { timeout: 60000 }, t => {
  const p = trustProject(), repeated = generateMachineKey()
  const pair = p.pair(p.owner, repeated, p.ownerId, { agentsOnly: true })
  const records = [p.genesis, ...Array.from({ length: 1000 }, (_, i) => forge(p.owner, pair, { note: `repeat ${i}` }))]
  let signer = p.owner
  for (let i = 0; i < 1100; i++) {
    const key = generateMachineKey()
    records.push(p.pair(signer, key, p.ownerId))
    signer = key
  }
  for (let i = 0; i < 900; i++) records.push(p.record(signer, 'profile', p.ownerId, { displayName: `Owner ${i}`, email: '' }))
  let reads = 0
  const observed = records.map(record => new Proxy(record, { get(target, field) {
    if (field === 'kind' || field === 'agentsOnly') reads++
    return target[field]
  } }))
  const verify = t.mock.method(crypto, 'verify')
  syncBuiltinESMExports()
  let expected
  try {
    expected = computeMembership(observed)
    assert.deepEqual(expected.rejected, [])
    assert.equal(expected.machines.length, 1102)
    assert.ok(reads < records.length * 100, `${reads} field reads for ${records.length} records`)
    assert.ok(verify.mock.callCount() <= records.length * 2, 'signature and consent are checked at most once per record')
    t.diagnostic(`${records.length} records: ${reads} field reads, ${verify.mock.callCount()} signature checks`)
  } finally { t.mock.restoreAll(); syncBuiltinESMExports() }
  for (let seed = 0; seed < 3; seed++) assert.deepEqual(computeMembership(shuffled([...records, ...records.slice(0, 1001)], seed)), expected)
})

