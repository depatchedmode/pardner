import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPath, createPlan, planForFiles } from '../scripts/verify-plan.js'

const root = fileURLToPath(new URL('..', import.meta.url))

it('classifies every current lib, scripts, and support file explicitly', () => {
  function walk(path) {
    return readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => {
      const child = `${path}/${entry.name}`
      return entry.isDirectory() ? (entry.name === '__pycache__' ? [] : walk(child)) : [child]
    })
  }
  const files = ['lib', 'scripts', 'support'].flatMap(walk).filter(path => !path.endsWith('.pyc') && !path.endsWith('.DS_Store'))
  assert.deepEqual(files.filter(path => !classifyPath(path)), [], 'Classify new implementation and harness files before claiming verification is complete')
  for (const path of ['lib/new-store.js', 'support/new-fixture.js', 'scripts/new-check.js']) assert.equal(classifyPath(path), null)
})

it('plans conservative checks without confusing routine test:qualification with the deliberate gate', () => {
  const plan = planForFiles(['lib/storage-key.js', 'lib/workspace.js', 'ui-prototype/src/Pardner.jsx', 'lib/storage-key.js'])
  assert.deepEqual(plan.files, ['lib/storage-key.js', 'lib/workspace.js', 'ui-prototype/src/Pardner.jsx'])
  assert.deepEqual(plan.scripts, ['test:qualification', 'test:runtime', 'test:cli', 'test:ui'])
  assert.equal(plan.verify, true)
  assert.equal(plan.qualification.required, true)
  assert.deepEqual(plan.qualification.triggers.map(trigger => trigger.path), ['lib/storage-key.js'])
  assert.deepEqual(plan.semanticReview, plan.files)
  assert.equal(plan.scripts.includes('test:acceptance'), false)
})

it('leaves semantic questions open even when paths have no automatic trigger', () => {
  for (const path of ['lib/workspace-schema.js', 'lib/agent-bridge.js', 'ui-prototype/src/operation-id.js', 'docs/PARDNER-EVIDENCE.md']) {
    const plan = planForFiles([path])
    assert.equal(plan.qualification.required, false)
    assert.deepEqual(plan.semanticReview, [path])
  }
  assert.equal(planForFiles(['docs/PARDNER-GOAL-AUDIT.md']).qualification.required, true)
})

it('distinguishes guidance, no diff, and unknown files', () => {
  const guidance = planForFiles(['.agents/skills/verify/SKILL.md', '.claude/skills', 'AGENTS.md'])
  assert.equal(guidance.guidanceOnly, true)
  assert.equal(guidance.verify, false)
  assert.deepEqual(guidance.scripts, [])
  assert.equal(planForFiles([]).guidanceOnly, false)
  const unknown = planForFiles(['lib/new-store.js', 'odd\nfile name.js'])
  assert.equal(unknown.verify, true)
  assert.equal(unknown.guidanceOnly, false)
  assert.deepEqual(unknown.unclassified, ['lib/new-store.js', 'odd\nfile name.js'])
})

it('flags foundation dependency and gate changes, including staged changes later reverted in the worktree', () => {
  const before = { engines: { node: '24.11.1' }, dependencies: { ws: '^8.14.2' }, scripts: { verify: 'node scripts/verify.js' } }
  const changed = { ...before, dependencies: { ws: '^9.0.0' } }
  const plan = planForFiles(['package.json'], { manifestVersions: { 'package.json': [before, changed, before] } })
  assert.equal(plan.qualification.triggers[0].kind, 'dependency')
  const scripts = { ...before, scripts: { verify: 'echo passed' } }
  assert.equal(planForFiles(['package.json'], { manifestVersions: { 'package.json': [before, scripts] } }).qualification.triggers[0].kind, 'harness')
  for (const after of [{ ...before, engines: { node: '25' } }, { ...before, overrides: { ws: '9' } }, null]) {
    assert.equal(planForFiles(['package.json'], { manifestVersions: { 'package.json': [before, after] } }).qualification.required, true)
  }
  assert.equal(planForFiles(['package.json']).qualification.required, true, 'Unavailable contents must not imply no dependency changes')
})

it('ignores manifest formatting and unrelated metadata but checks nested lockfile foundation entries', () => {
  const before = { dependencies: { ws: '8', react: '18' }, scripts: { verify: 'node scripts/verify.js' } }
  const after = { scripts: { ...before.scripts, 'verify:plan': 'node scripts/verify-plan.js' }, dependencies: { react: '19', ws: '8' } }
  assert.equal(planForFiles(['package.json'], { manifestVersions: { 'package.json': [before, after] } }).qualification.required, false)
  const lock = { packages: { 'node_modules/a/node_modules/playwright-core': { version: '1', integrity: 'old' } } }
  const next = { packages: { 'node_modules/a/node_modules/playwright-core': { version: '1', integrity: 'new' } } }
  assert.equal(planForFiles(['package-lock.json'], { manifestVersions: { 'package-lock.json': [lock, next] } }).qualification.required, true)
  assert.throws(() => planForFiles(['package-lock.json'], { manifestVersions: { 'package-lock.json': [{ lockfileVersion: 1 }, next] } }), /packages map/)
})

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'pardner-verify-plan-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (path, value) => {
    mkdirSync(join(cwd, path, '..'), { recursive: true })
    writeFileSync(join(cwd, path), value)
  }
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Verification Test')
  git('config', 'user.email', 'verify@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '/dev/null')
  write('README.md', 'Initial\n')
  write('lib/storage-key.js', 'initial\n')
  write('lib/cli.js', 'initial\n')
  write('package.json', JSON.stringify({ dependencies: { ws: '8' } }))
  write('.gitignore', 'output/\n')
  git('add', '.')
  git('commit', '-m', 'Baseline')
  const baseline = git('rev-parse', 'HEAD')
  git('update-ref', 'refs/remotes/origin/main', baseline)
  git('switch', '-c', 'change')
  return { cwd, git, write, baseline }
}

it('uses the merge base, includes committed/staged/unstaged/untracked files, and retains deleted rename sources', t => {
  const { cwd, git, write, baseline } = repository(t)
  write('lib/workspace.js', 'committed\n')
  git('add', 'lib/workspace.js')
  git('commit', '-m', 'Domain change')
  const head = git('rev-parse', 'HEAD')
  git('switch', 'main')
  write('docs/upstream.md', 'Only upstream\n')
  git('add', '.')
  git('commit', '-m', 'Upstream diverges')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('switch', 'change')
  renameSync(join(cwd, 'lib/storage-key.js'), join(cwd, 'lib/new-name.js'))
  git('add', 'lib')
  write('lib/cli.js', 'unstaged\n')
  write('new file\nwith newline.md', 'untracked\n')
  write('output/ignored.json', '{}')
  const plan = createPlan({ cwd })
  assert.equal(plan.base.mergeBase, baseline)
  assert.equal(plan.head, head)
  assert.deepEqual(plan.files, ['lib/cli.js', 'lib/new-name.js', 'lib/storage-key.js', 'lib/workspace.js', 'new file\nwith newline.md'])
  assert.deepEqual(plan.unclassified, ['lib/new-name.js', 'new file\nwith newline.md'])
  assert.equal(plan.qualification.required, true)
  assert.equal(createPlan({ cwd, base: baseline }).base.commit, baseline)
})

it('reads manifest contents from index as well as HEAD and working tree', t => {
  const { cwd, git, write } = repository(t)
  write('package.json', JSON.stringify({ dependencies: { ws: '9' } }))
  git('add', 'package.json')
  write('package.json', JSON.stringify({ dependencies: { ws: '8' } }))
  assert.equal(createPlan({ cwd }).qualification.required, true)
  write('package.json', 'invalid JSON')
  assert.throws(() => createPlan({ cwd }))
  assert.throws(() => createPlan({ cwd, base: 'missing-ref' }))
})

it('refuses unresolved merges and exposes CLI errors without emitting a fake plan', t => {
  const { cwd, git, write, baseline } = repository(t)
  write('README.md', 'Branch\n')
  git('add', '.')
  git('commit', '-m', 'Branch edit')
  git('switch', 'main')
  write('README.md', 'Main\n')
  git('add', '.')
  git('commit', '-m', 'Main edit')
  git('switch', 'change')
  assert.throws(() => git('merge', 'main'))
  assert.throws(() => createPlan({ cwd, base: baseline }), /Resolve merge conflicts/)
  assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/verify-plan.js'), '--unexpected'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), error => {
    assert.equal(error.status, 1)
    assert.equal(error.stdout, '')
    assert.match(error.stderr, /Usage:/)
    return true
  })
})
