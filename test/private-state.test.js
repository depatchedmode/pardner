import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, chmodSync, writeFileSync, readFileSync, symlinkSync, linkSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeliveryLedger } from '../lib/delivery-ledger.js'
import { acquireStorageLease } from '../lib/storage-lease.js'
import { createTrace, ensureTraceDir } from '../lib/agent-trace.js'
import { ensurePrivateFile, ensurePrivateDirectory } from '../lib/private-state.js'

const mode = path => statSync(path).mode & 0o777
const mention = { id: 'mention', toActorId: 'builder', timestamp: '2026-10-19T00:00:00Z' }

for (const mask of [0o022, 0o000]) {
  it(`keeps new and existing SQLite state and traces private under umask ${mask.toString(8)}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'pardner-private-'))
    const priorMask = process.umask(mask)
    let lease, ledger, second
    try {
      const directory = join(root, 'state')
      lease = await acquireStorageLease(directory)
      assert.equal(mode(directory), 0o700)
      assert.equal(mode(join(directory, 'runtime-lock.sqlite')), 0o600)
      const path = join(directory, 'deliveries.sqlite')
      ledger = new DeliveryLedger(path)
      ledger.reconcile([mention], [mention.id])
      const claim = ledger.claim('builder', 'request')
      for (const suffix of ['', '-wal', '-shm']) {
        assert.equal(mode(path + suffix), 0o600)
        chmodSync(path + suffix, 0o666)
      }
      second = new DeliveryLedger(path)
      for (const suffix of ['', '-wal', '-shm']) assert.equal(mode(path + suffix), 0o600)
      assert.equal(second.claim('builder', 'request').claimToken, claim.claimToken)
      second.close(); second = null
      ledger.close(); ledger = new DeliveryLedger(path)
      ledger.reconcile([mention], [mention.id])
      for (const suffix of ['', '-wal', '-shm']) assert.equal(mode(path + suffix), 0o600)
      lease.close(); lease = null
      chmodSync(directory, 0o755)
      chmodSync(join(directory, 'runtime-lock.sqlite'), 0o644)
      lease = await acquireStorageLease(directory)
      assert.equal(mode(directory), 0o700)
      assert.equal(mode(join(directory, 'runtime-lock.sqlite')), 0o600)
      const options = { repoPath: root, commitHash: 'abcdef1234567890', sessionKey: 'private-session' }
      const first = createTrace(options)
      assert.equal(mode(first.filepath), 0o600)
      chmodSync(first.filepath, 0o644)
      chmodSync(join(root, '.agent-trace'), 0o755)
      const legacy = join(root, '.agent-trace', 'legacy.json')
      writeFileSync(legacy, '{"legacy":true}', { mode: 0o644 })
      createTrace({ ...options, sessionKey: 'updated-session' })
      assert.equal(mode(first.filepath), 0o600)
      assert.equal(mode(legacy), 0o600)
      assert.equal(mode(join(root, '.agent-trace')), 0o700)
      assert.equal(JSON.parse(readFileSync(first.filepath)).agent.sessionKey, 'updated-session')
      assert.equal(readFileSync(legacy, 'utf8'), '{"legacy":true}')
    } finally {
      second?.close(); ledger?.close(); lease?.close()
      process.umask(priorMask)
      rmSync(root, { recursive: true, force: true })
    }
  })
}

it('rejects symbolic links, hard links and non-files without modifying their targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'pardner-unsafe-'))
  try {
    const target = join(root, 'target')
    writeFileSync(target, 'untouched', { mode: 0o644 })
    chmodSync(target, 0o644)
    const symbolic = join(root, 'symbolic')
    symlinkSync(target, symbolic)
    assert.throws(() => ensurePrivateFile(symbolic))
    const hard = join(root, 'hard')
    linkSync(target, hard)
    assert.throws(() => ensurePrivateFile(hard), /Unsafe private state/)
    assert.equal(readFileSync(target, 'utf8'), 'untouched')
    assert.equal(mode(target), 0o644)
    const directory = join(root, 'directory')
    mkdirSync(directory)
    assert.throws(() => ensurePrivateFile(directory))
    symlinkSync(directory, join(root, '.agent-trace'))
    assert.throws(() => ensureTraceDir(root))
    assert.throws(() => ensurePrivateDirectory(join(root, '.agent-trace')))
    const db = join(root, 'deliveries.sqlite')
    symlinkSync(target, `${db}-wal`)
    assert.throws(() => new DeliveryLedger(db))
    assert.equal(mode(target), 0o644)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
