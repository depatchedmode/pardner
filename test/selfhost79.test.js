import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('scripts/selfhost79.py')
const bSource = `export function summarizeTasks(tasks) {
 const closed = tasks.filter(t => ['completed','dead-end','abandoned'].includes(t.status)).length
 return {total:tasks.length, closed, open:tasks.length-closed}
}\n`
const cSource = bSource.replace(' const closed', ' tasks = tasks.filter(t => t.deleted !== true)\n const closed')
const call = args => spawnSync('python3', ['-B', script, ...args], { encoding: 'utf8', timeout: 30000 })
function json(args) {
  const r = call(args)
  assert.equal(r.status, 0, r.stderr || r.stdout)
  return JSON.parse(r.stdout)
}
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pardner-selfhost79-'))
  const repo = join(dir, 'candidate')
  mkdirSync(repo)
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null')
  writeFileSync(join(repo, 'README.md'), 'Disposable Pardner fixture\n')
  git('add', '.'); git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  mkdirSync(join(repo, 'lib'))
  const commit = source => {
    writeFileSync(join(repo, 'lib/selfhost79-task-summary.mjs'), source)
    git('add', '.'); git('commit', '-qm', 'candidate')
    return git('rev-parse', 'HEAD')
  }
  const frozen = json(['freeze', join(dir, 'trusted')])
  let count = 0
  const args = (sha, phase = 'B', extra = []) => ['check', '--bundle', frozen.bundle, '--seal', frozen.sealSha256,
    '--repo', repo, '--base', base, '--sha', sha, '--phase', phase, '--node', process.execPath,
    '--output', join(dir, `evidence-${++count}`), ...extra]
  try { fn({ dir, repo, git, commit, args, frozen, base }) } finally { rmSync(dir, { recursive: true, force: true }) }
}

it('freezes exact B then proves C fails on B and passes on C, ignoring dirty checkout state', () => fixture(({ repo, commit, args }) => {
  const b = commit(bSource)
  writeFileSync(join(repo, 'lib/selfhost79-task-summary.mjs'), 'throw new Error("dirty checkout")')
  const receiptB = json(args(b))
  assert.equal(receiptB.checkerVerdict, 'accepted')
  assert.equal(receiptB.executionVerdict, 'not-observed')
  assert.equal(receiptB.humanVerdict, 'not-recorded')
  const before = readFileSync(receiptB.receipt)
  const c = commit(cSource)
  const receiptC = json(args(c, 'C', ['--previous', receiptB.receipt, '--previous-hash', receiptB.receiptSha256]))
  assert.equal(receiptC.checkerVerdict, 'accepted')
  const checks = JSON.parse(readFileSync(join(receiptC.receipt, '..', 'checks.json')))
  assert.equal(checks.B_under_C.passed, false)
  assert.equal(checks.candidate.passed, true)
  assert.deepEqual(readFileSync(receiptB.receipt), before)
}))

it('rejects false success, zero-exit without results and candidate filesystem writes', () => fixture(({ commit, args, dir }) => {
  for (const source of ['export function summarizeTasks(){return {total:0,closed:0,open:0}}',
    'console.log("all tests passed"); process.exit(0)',
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(join(dir, 'forged'))}, 'yes')`]) {
    const r = call(args(commit(source)))
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /"checkerVerdict": "accepted"/)
  }
}))

it('rejects modified checker, probe and seal before candidate execution', () => {
  for (const file of ['support/selfhost79/checker.py', 'support/selfhost79/probe.mjs', 'scripts/selfhost79-cloud.js', 'seal.json']) {
    fixture(({ commit, args, frozen }) => {
      chmodSync(join(frozen.bundle, file), 0o644)
      writeFileSync(join(frozen.bundle, file), 'tampered')
      const r = call(args(commit(bSource)))
      assert.equal(r.status, 2)
      assert.match(r.stderr, /integrity mismatch/)
    })
  }
})

it('rejects branch names, out-of-scope diffs and evidence overwrite', () => fixture(({ commit, args, repo, git }) => {
  const b = commit(bSource)
  assert.match(call(args('HEAD')).stderr, /full immutable SHA/)
  const command = args(b)
  json(command)
  assert.match(call(command).stderr, /already exists/)
  writeFileSync(join(repo, 'README.md'), 'unexpected edit')
  git('add', '.'); git('commit', '-qm', 'scope violation')
  assert.match(call(args(git('rev-parse', 'HEAD'))).stderr, /only the frozen fixture/)
}))

it('rejects stale B receipt and artifact mutations, missing C linkage, and nonsemantic C', () => fixture(({ commit, args }) => {
  const b = json(args(commit(bSource)))
  const c = commit(bSource + '// cosmetic only\n')
  assert.match(call(args(c, 'C')).stderr, /requires frozen B/)
  const extra = ['--previous', b.receipt, '--previous-hash', b.receiptSha256]
  const rejected = call(args(c, 'C', extra))
  assert.equal(rejected.status, 1)
  assert.equal(JSON.parse(rejected.stdout).checkerVerdict, 'rejected')
  chmodSync(join(b.receipt, '..', 'diff.patch'), 0o644)
  writeFileSync(join(b.receipt, '..', 'diff.patch'), 'tampered')
  assert.match(call(args(c, 'C', extra)).stderr, /historical B artifact changed/)
  chmodSync(b.receipt, 0o644)
  writeFileSync(b.receipt, '{}')
  assert.match(call(args(c, 'C', extra)).stderr, /historical B receipt changed/)
}))

it('audit preserves six not-run attempts and never manufactures acceptance', () => {
  const report = json(['audit', 'support/selfhost79/fixture.json'])
  assert.equal(report.attempts.length, 6)
  assert.ok(report.attempts.every(a => a.result === 'not-run'))
  assert.equal(report.t3CrashCoverage.active.disposition, 'not-run')
  assert.equal(report.liveVerdict, 'requires-independent-evidence-and-human-review')
})

it('audit refuses unknown recovery and incomplete success claims', () => fixture(({ dir }) => {
  const manifest = JSON.parse(readFileSync('support/selfhost79/fixture.json'))
  manifest.attempts[0] = { id: 't3-A', disposition: 'observed', runId: 'one', recoveredRunId: 'unknown',
    executionVerdict: 'completed', queueHeld: false, submissions: 2 }
  const path = join(dir, 'manifest.json'); writeFileSync(path, JSON.stringify(manifest))
  const report = json(['audit', path])
  assert.equal(report.attempts[0].result, 'incomplete')
  assert.ok(report.attempts[0].gaps.includes('exact run recovery'))
  assert.ok(report.attempts[0].gaps.includes('held queue'))
  assert.ok(report.attempts[0].gaps.includes('terminal cancellation'))
}))

it('terminates a nonterminating candidate within the independent probe deadline', () => fixture(({ commit, args }) => {
  const result = call(args(commit('while (true) {}')))
  assert.equal(result.status, 2)
  assert.match(result.stderr, /probe timed out/)
}))

it('rejects symlink candidates and evidence/checker locations inside the candidate', () => fixture(({ repo, git, commit, args, frozen }) => {
  const sha = commit(bSource)
  const inside = args(sha)
  inside[inside.indexOf('--output') + 1] = join(repo, 'evidence')
  assert.match(call(inside).stderr, /outside candidate/)
  git('rm', 'lib/selfhost79-task-summary.mjs')
  mkdirSync(join(repo, 'lib'), { recursive: true })
  execFileSync('ln', ['-s', '../README.md', join(repo, 'lib/selfhost79-task-summary.mjs')])
  git('add', '.'); git('commit', '-qm', 'symlink')
  assert.match(call(args(git('rev-parse', 'HEAD'))).stderr, /regular nonexecutable blob/)
}))

it('audit checks completed record ordering and frozen history without granting live or human acceptance', () => fixture(({ dir }) => {
  const manifest = JSON.parse(readFileSync('support/selfhost79/fixture.json'))
  manifest.attempts = ['t3', 'cloud'].flatMap(route => ['A', 'B', 'C'].map((phase, i) => {
    const start = 1000 + i * 100
    return { id: `${route}-${phase}`, disposition: 'observed', contextId: route, agentId: route === 'cloud' ? 'agent' : null,
      runId: `run-${i}`, executionId: `exec-${i}`, intentAt: start, acceptedAt: start + 1,
      terminalAt: start + 50, freshReadAt: start + 51, evidenceSha256: 'a'.repeat(64), submissions: 1,
      executionVerdict: i === 0 ? 'cancelled' : 'completed', checkerVerdict: 'accepted',
      controllerRestartAt: start + 2, recoveredAt: start + 3, recoveredRunId: `run-${i}`, cancelRequestedAt: start + 4,
      queueHeld: true, queuedSubmissions: 0, partialEffectsSha256: 'b'.repeat(64),
      releasedByHumanAt: start - 1, checkerReceiptSha256: `${i}`.repeat(64), commitSha: 'a'.repeat(40), checkerFrozenAt: start + 52,
      nativeApprovalRequestedAt: start + 5, nativeApprovalDecidedAt: start + 6, nativeApprovalEvidenceSha256: 'c'.repeat(64),
      previousReceiptSha256: '1'.repeat(64), terminalRestartEvidenceSha256: 'd'.repeat(64) }
  }))
  const path = join(dir, 'records.json')
  writeFileSync(path, JSON.stringify(manifest))
  const report = json(['audit', path])
  assert.ok(report.attempts.every(a => a.result === 'record-complete'))
  assert.ok(report.attempts.every(a => a.human === 'not-recorded'))
  manifest.attempts[2].intentAt = 1100
  writeFileSync(path, JSON.stringify(manifest))
  assert.ok(json(['audit', path]).attempts[2].gaps.includes('B frozen before C'))
  manifest.attempts[0].disposition = 'passed'
  writeFileSync(path, JSON.stringify(manifest))
  assert.match(call(['audit', path]).stderr, /invalid disposition/)
}))
