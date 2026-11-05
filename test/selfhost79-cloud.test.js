import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { CursorCloudExecution } from '../lib/cursor-cloud-execution.js'
import { canonical } from '../lib/workspace-schema.js'
import { FakeCursorCloud } from '../support/fake-cursor-cloud.js'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const tool = resolve('scripts/selfhost79-cloud.js')
const authority = { actorId: 'builder', taskId: 'task', fromActorId: 'alice' }
const sourceB = `export function summarizeTasks(tasks) { const closed = tasks.filter(t => ['completed','dead-end','abandoned'].includes(t.status)).length; return {total: tasks.length, closed, open: tasks.length-closed} }`
const sourceC = sourceB.replace('{ const closed', '{ tasks = tasks.filter(t => t.deleted !== true); const closed')

async function fixture(work) {
  const dir = mkdtempSync(join(tmpdir(), 'pardner-selfhost79-cloud-'))
  const repo = join(dir, 'candidate'); mkdirSync(repo)
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null')
  writeFileSync(join(repo, 'README.md'), 'fixture'); git('add', '.'); git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD'); mkdirSync(join(repo, 'lib'))
  const python = args => JSON.parse(execFileSync('python3', ['-B', 'scripts/selfhost79.py', ...args], { encoding: 'utf8', timeout: 30000 }))
  const frozen = python(['freeze', join(dir, 'trusted')])
  const provider = new FakeCursorCloud()
  provider.downloads.set('unicode.txt', Buffer.from('雪 😀\n'))
  const config = { path: join(dir, 'cloud.sqlite'), ownerId: 'fixture', transport: provider, dispatchEnabled: true }
  let controller = new CursorCloudExecution(config)
  controller.register({ contextId: 'ctx', projectId: 'project', ...authority, repository: 'https://example.invalid/repo', startingRef: base, allowedTaskIds: ['task'], allowedFromActorIds: ['alice'] })
  async function attempt(id, source, previous) {
    controller.enqueue({ executionId: id, contextId: 'ctx', ...authority, text: `Fixture ${id}` })
    await controller.pump('ctx')
    writeFileSync(join(repo, 'lib/selfhost79-task-summary.mjs'), source); git('add', '.'); git('commit', '-qm', id)
    const sha = git('rev-parse', 'HEAD')
    provider.end(); await controller.observe('ctx')
    const receipt = python(['check', '--bundle', frozen.bundle, '--seal', frozen.sealSha256, '--repo', repo, '--base', base, '--sha', sha,
      '--phase', id, '--node', process.execPath, '--output', join(dir, `checked-${id}`),
      ...(previous ? ['--previous', previous.receipt, '--previous-hash', previous.receiptSha256] : [])])
    const folder = dirname(receipt.receipt)
    const capture = await controller.freeze({ executionId: id, ...authority, commit: sha,
      diff: readFileSync(join(folder, 'diff.patch'), 'utf8'), tests: readFileSync(join(folder, 'checks.json'), 'utf8') })
    return { ...receipt, capture }
  }
  function bind(receipt, snapshot = { cloud: controller.snapshot() }, pin) {
    const snapshotPath = join(dir, 'snapshot.json'), bytes = JSON.stringify(snapshot)
    writeFileSync(snapshotPath, bytes)
    return spawnSync(process.execPath, [tool, '--snapshot', snapshotPath, '--snapshot-sha', pin ?? hash(bytes), '--execution', receipt.phase,
      '--receipt', receipt.receipt, '--receipt-sha', receipt.receiptSha256], { encoding: 'utf8', timeout: 10000 })
  }
  try { await work({ attempt, bind, provider, get controller() { return controller }, restart: async () => {
    await controller.close(); controller = new CursorCloudExecution(config)
  } }) } finally { await controller.close(); rmSync(dir, { recursive: true, force: true }) }
}

it('binds real offline Cloud captures to independent B/C checks, retaining B across next run and restart', () => fixture(async f => {
  const b = await f.attempt('B', sourceB)
  const snapshotB = { cloud: f.controller.snapshot() }
  const boundB = f.bind(b, snapshotB)
  assert.equal(boundB.status, 0, boundB.stderr)
  assert.equal(JSON.parse(boundB.stdout).humanVerdict, 'not-recorded')
  const c = await f.attempt('C', sourceC, b)
  f.provider.downloads.set('patch.txt', Buffer.from('later mutable artifact'))
  await f.restart()
  const boundC = f.bind(c)
  assert.equal(boundC.status, 0, boundC.stderr)
  assert.equal(JSON.parse(boundC.stdout).runId, 'run-2')
  assert.equal(f.bind(b).status, 0, 'Historical B evidence remains valid in current snapshot')
  assert.deepEqual(f.controller.evidence('B'), b.capture)
  assert.equal(f.provider.submissions.length, 2)
  assert.equal(JSON.parse(boundC.stdout).recoveryVerdict, 'not-established')
}))

it('rejects altered Cloud capture, wrong run, self-reported diff/tests, artifact corruption and snapshot replacement', () => fixture(async f => {
  const b = await f.attempt('B', sourceB)
  const original = { cloud: f.controller.snapshot() }
  for (const mutate of [row => { row.evidence.runId = 'next-run' }, row => { row.runId = 'next-run' },
    row => { row.evidence.diff = 'agent says success' }, row => { row.evidence.tests = 'all passed' },
    row => { row.evidence.artifacts[0].sha256 = 'f'.repeat(64) }, row => { row.outcome = 'CANCELLED' }]) {
    const snapshot = structuredClone(original), row = snapshot.cloud.executions[0]
    mutate(row)
    // Even a consistent capture hash cannot replace independent diff/test or identity evidence.
    const { sha256, ...data } = row.evidence
    row.evidence.sha256 = hash(canonical(data))
    const result = f.bind(b, snapshot)
    assert.equal(result.status, 2, result.stdout)
    assert.doesNotMatch(result.stderr, /agent says success|all passed/)
  }
  const corrupt = structuredClone(original); corrupt.cloud.executions[0].evidence.result = 'altered'
  assert.equal(f.bind(b, corrupt).status, 2)
  assert.equal(f.bind(b, original, '0'.repeat(64)).status, 2)
}))

it('keeps manual recovery separate and never imports a recorded human verdict as authentic acceptance', () => fixture(async f => {
  const b = await f.attempt('B', sourceB)
  const snapshot = { cloud: f.controller.snapshot() }
  snapshot.cloud.executions[0].intervention = { actorId: 'alice', evidence: 'manual original receipt', at: Date.now() }
  snapshot.cloud.executions[0].verdicts = [{ kind: 'human', verdict: 'accepted' }]
  const result = f.bind(b, snapshot)
  assert.equal(result.status, 0, result.stderr)
  const bound = JSON.parse(result.stdout)
  assert.equal(bound.recoveryVerdict, 'manual-intervention')
  assert.equal(bound.humanVerdict, 'not-recorded')
  assert.equal(bound.liveVerdict, 'requires-independent-evidence-and-human-review')
}))
