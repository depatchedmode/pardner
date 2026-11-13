import { it } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { check } from '../formal/lifecycle/checker.js'
import { MUTATIONS, createModel } from '../formal/lifecycle/model.js'
import { checkDrift, parseArguments, readMapping, repositoryRoot } from '../formal/lifecycle/check.js'

// Smaller than the default bounds so the whole file stays fast; the default run is `npm run verify:model`.
const bounds = { replicaEdits: 1, hubOps: 1, ackAttempts: 1, storageFailures: 1 }

it('the lifecycle model satisfies every property and reaches every coverage witness', () => {
  const model = createModel({ bounds })
  const result = check(model)
  assert.equal(result.invariant, null)
  assert.equal(result.progress, null)
  assert.deepEqual(Object.entries(result.witnesses).filter(([, count]) => count === 0).map(([name]) => name), [])
})

it('each mirrored source mutation produces a counterexample on its property', () => {
  const expected = {
    'receipt-before-persist': 'ReceiptAfterBarrier', 'ack-before-persist': 'ReceiptAfterBarrier', 'hub-acks-unknown-heads': 'ReceiptAfterBarrier',
    'stale-ack-accepted': 'AckedHeadsPersisted', 'admit-while-stopping': 'NoAdmissionWhileStopping', 'upgrade-while-stopping': 'NoAdmissionWhileStopping',
    'close-store-before-drain': 'StorageAvailableWhileAdmitted', 'lease-before-drain': 'StorageAvailableWhileAdmitted', 'no-idle-reclaim': 'ShutdownCompletes',
  }
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(MUTATIONS).sort(), 'every model mutation has an expected property')
  for (const [mutation, property] of Object.entries(expected)) {
    const result = check(createModel({ bounds, mutation }))
    const violated = result.invariant?.invariant ?? result.progress?.property
    assert.equal(violated, property, `mutation ${mutation}`)
    const trace = result.invariant?.trace ?? result.progress?.trace
    assert.ok(trace.length > 1 && trace.every(step => step.state), `mutation ${mutation} has a readable trace`)
  }
})

it('the state limit stops exploration instead of exhausting memory', () => {
  assert.throws(() => check(createModel({ bounds }), { maxStates: 100 }), /More than 100 states/)
})

it('the drift check accepts the mapped sources and reports a changed copy', () => {
  const model = createModel({ bounds })
  const mapping = readMapping()
  const current = checkDrift(repositoryRoot, model, mapping)
  assert.deepEqual({ drifted: current.drifted, unmapped: current.unmapped, missingAnchors: current.missingAnchors }, { drifted: [], unmapped: [], missingAnchors: [] })
  assert.equal(current.ok, true)
  const copy = mkdtempSync(join(tmpdir(), 'pardner-lifecycle-drift-'))
  try {
    for (const file of Object.keys(mapping.files)) cpSync(join(repositoryRoot, file), join(copy, file), { recursive: true })
    const path = join(copy, 'lib/durable-repo.js')
    writeFileSync(path, readFileSync(path, 'utf8').replace('this.closing = true', 'this.closing = false'))
    const drifted = checkDrift(copy, model, mapping)
    assert.equal(drifted.ok, false)
    assert.deepEqual(drifted.drifted, ['lib/durable-repo.js'])
    assert.ok(drifted.affectedActions.includes('StoreCloseBegin'))
    assert.deepEqual(drifted.missingAnchors.map(entry => entry.action), ['StoreCloseBegin'])
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
})

it('parses bounds and rejects unknown mutations', () => {
  assert.deepEqual(parseArguments(['--replica-edits', '3', '--storage-failures', '0']).bounds, { replicaEdits: 3, hubOps: 1, ackAttempts: 1, storageFailures: 0 })
  assert.throws(() => parseArguments(['--mutate', 'nope']), /Unknown mutation/)
  assert.throws(() => parseArguments(['--replica-edits', 'x']), /non-negative integer/)
})
