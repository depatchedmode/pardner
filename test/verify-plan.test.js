import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, renameSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPath, createPlan, gateScriptChanges, parseArguments, planForFiles } from '../scripts/verify-plan.js'

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

it('routes files without a package script to their focused commands', () => {
  const plan = planForFiles(['lib/t3-execution.js', 'scripts/control-runtime.py', 'scripts/t3-qualification.js'])
  assert.deepEqual(plan.scripts, ['test:control-runtime'])
  assert.deepEqual(plan.focusedCommands.map(check => check.command), ['node --test test/t3-execution.test.js', 'npm run test:t3-qualification'])
  assert.match(plan.focusedCommands[1].note, /pinned T3 app/)
  assert.equal(plan.verify, true)
  assert.equal(plan.qualification.required, false)
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
  const guidance = planForFiles(['.agents/skills/verify/SKILL.md', '.claude/skills', 'AGENTS.md', 'PRODUCT.md'])
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

it('narrows only purely additive test-file inclusion and keeps every other gate change conservative', () => {
  const ui = 'npm run ui:build && node --test test/pardner-ui.test.js test/pardner-phone.test.js'
  const base = { scripts: { 'test:ui': ui, 'test:runtime': 'node --test test/workspace-runtime.test.js', verify: 'node scripts/verify.js', 'ui:build': 'npm run build --prefix ui-prototype', 'test:acceptance': 'node scripts/acceptance.js' } }
  const withScript = (name, command) => ({ scripts: { ...base.scripts, [name]: command } })
  const plan = after => planForFiles(['package.json'], { manifestVersions: { 'package.json': [base, after] } })

  const additive = plan(withScript('test:ui', `${ui} test/markdown-privacy.test.js`))
  assert.equal(additive.qualification.required, false)
  assert.deepEqual(additive.qualification.reviewRequired.map(({ kind, script, added }) => ({ kind, script, added })),
    [{ kind: 'additive-test-inclusion', script: 'test:ui', added: ['test/markdown-privacy.test.js'] }])
  assert.match(additive.qualification.reviewRequired[0].reason, /semantic review/)
  assert.equal(plan(withScript('test:ui', ui.replace('node --test', 'node --test test/new.test.js'))).qualification.required, false, 'insertion position does not matter')

  for (const [name, command, why] of [
    ['test:runtime', 'node test/added.test.js --test test/workspace-runtime.test.js', 'file before the test runner flag changes execution'],
    ['test:runtime', 'test/added.test.js node --test test/workspace-runtime.test.js', 'file before executable'],
    ['test:ui', `${ui} test/new.test.js test/new.test.js`, 'duplicate new inclusion'],
    ['pretest:ui', 'node test/extra.test.js', 'lifecycle command changes the gate'],
    ['test:ui', 'npm run ui:build && node --test test/pardner-ui.test.js', 'removed coverage'],
    ['test:ui', `${ui} --test-concurrency=1`, 'changed execution option'],
    ['test:ui', `${ui} --test-skip-pattern=x test/markdown-privacy.test.js`, 'option alongside an added file'],
    ['test:ui', ui.replace('pardner-phone', 'pardner-phone-renamed'), 'replaced file'],
    ['test:ui', `${ui} test/pardner-ui.test.js`, 'duplicate inclusion'],
    ['test:ui', `${ui} test/helper.js`, 'non-test file'],
    ['test:ui', ui.replace('npm run ui:build && ', ''), 'build removed'],
    ['ui:build', 'npm run build --prefix ui-prototype -- --mode development', 'build changed'],
    ['verify', 'node scripts/verify.js test/extra.test.js', 'verify gate is never narrowed'],
    ['test:acceptance', 'node scripts/acceptance.js test/extra.test.js', 'acceptance measurement is never narrowed'],
  ]) {
    const result = plan(withScript(name, command))
    assert.equal(result.qualification.required, true, why)
    assert.equal(result.qualification.triggers[0].kind, 'harness', why)
  }
  assert.equal(plan({ scripts: { ...base.scripts, 'test:ui': undefined } }).qualification.required, true, 'deleted command')
  const mixed = gateScriptChanges([base, withScript('test:ui', `${ui} test/a.test.js`), withScript('test:ui', `${ui} --watch`)])
  assert.deepEqual(mixed.map(change => change.kind), ['changed'], 'any changed version overrides an additive one')
})

it('tracks the delegated UI build and its lifecycle commands across every manifest version', () => {
  const before = { scripts: { build: 'vite build' } }
  const plan = versions => planForFiles(['ui-prototype/package.json'], { manifestVersions: { 'ui-prototype/package.json': versions } })
  for (const after of [{ scripts: { build: 'vite build --mode development' } }, { scripts: {} },
    { scripts: { build: 'vite build', prebuild: 'node prepare.js' } }, { scripts: { build: 'vite build', postbuild: 'node alter-output.js' } }]) {
    const result = plan([before, before, after, before])
    assert.equal(result.qualification.required, true)
    assert.ok(result.qualification.triggers.some(trigger => trigger.kind === 'harness' && trigger.path === 'ui-prototype/package.json'))
  }
  assert.equal(plan([before, { scripts: { ...before.scripts, dev: 'vite --host' } }]).qualification.required, false)
})

it('plans an explicit checkout from another working directory and records the resolved repository', t => {
  const { cwd, write } = repository(t)
  write('lib/workspace.js', 'changed\n')
  const elsewhere = mkdtempSync(join(tmpdir(), 'pardner-verify-plan-elsewhere-'))
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
  const output = execFileSync(process.execPath, [join(root, 'scripts/verify-plan.js'), '--cwd', join(cwd, 'lib')], { cwd: elsewhere, encoding: 'utf8' })
  const plan = JSON.parse(output)
  assert.equal(plan.schemaVersion, 3)
  assert.equal(plan.repository.root, execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim())
  assert.deepEqual(plan.files, ['lib/workspace.js'])
  assert.equal(plan.tooling.sameCheckout, false)
  assert.equal(plan.tooling.root, execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim())
  assert.throws(() => createPlan({ cwd: elsewhere }), 'a non-repository must fail rather than fall back to the tooling checkout')
  assert.deepEqual(parseArguments(['--cwd', 'a', '--base', 'b', '--overlay', 'c', '--overlay', 'd..e']), { cwd: 'a', base: 'b', overlays: ['c', 'd..e'] })
  assert.deepEqual(parseArguments([]).overlays, [])
  for (const args of [['--cwd'], ['--cwd', 'a', '--cwd', 'b'], ['--other', 'x'], ['--overlay']]) assert.throws(() => parseArguments(args), /Usage/)
})

it('attributes subject and overlay paths without excluding either from the combined plan', t => {
  const { cwd, git, write } = repository(t)
  git('switch', '-c', 'tooling', 'main')
  write('scripts/verify-plan.js', 'tooling\n')
  write('package.json', JSON.stringify({ dependencies: { ws: '8' }, scripts: { 'verify:plan': 'node scripts/verify-plan.js' } }))
  symlinkSync('../shared', join(cwd, 'linked'))
  git('add', '.')
  git('commit', '-m', 'Tooling under trial')
  const tooling = git('rev-parse', 'HEAD')
  git('switch', 'change')
  write('lib/workspace.js', 'subject\n')
  write('package.json', JSON.stringify({ dependencies: { ws: '8' }, scripts: { test: 'node --test' } }))
  git('add', '.')
  git('commit', '-m', 'Subject change')
  // Apply the overlay uncommitted, as a trial does; package.json is merged by hand.
  write('scripts/verify-plan.js', 'tooling\n')
  symlinkSync('../shared', join(cwd, 'linked'))
  write('package.json', JSON.stringify({ dependencies: { ws: '8' }, scripts: { test: 'node --test', 'verify:plan': 'node scripts/verify-plan.js' } }))
  write('test/local-assertion.test.js', 'local\n')
  const before = git('status', '--porcelain')
  const plan = createPlan({ cwd, overlays: [tooling] })
  assert.equal(git('status', '--porcelain'), before, 'origin attribution must not change the index')
  assert.deepEqual(plan.overlays, [{ ref: tooling, commit: tooling, base: { ref: `merge-base(origin/main, ${tooling})`, commit: plan.base.mergeBase },
    files: ['linked', 'package.json', 'scripts/verify-plan.js'], missing: [], divergent: ['package.json'], includesSubject: false }])
  assert.deepEqual(plan.files, ['lib/workspace.js', 'linked', 'package.json', 'scripts/verify-plan.js', 'test/local-assertion.test.js'])
  const overlay = `overlay:${tooling}`
  assert.deepEqual(plan.origins, { 'lib/workspace.js': ['subject'], linked: [overlay], 'package.json': ['subject', overlay], 'scripts/verify-plan.js': [overlay], 'test/local-assertion.test.js': ['unattributed'] })
  assert.deepEqual(plan.unattributed, ['test/local-assertion.test.js'], 'a local file explained by neither side is reported, not labelled subject')
  assert.deepEqual(plan.warnings.map(warning => warning.kind), ['unattributed-paths'])
  assert.deepEqual(plan.qualification.triggers.find(trigger => trigger.path === 'package.json').origin, ['subject', overlay])
  rmSync(join(cwd, 'scripts/verify-plan.js'))
  assert.deepEqual(createPlan({ cwd, overlays: [tooling] }).overlays[0].missing, ['scripts/verify-plan.js'], 'an overlay that was not fully applied is visible')
})

it('attributes several overlays with their own bases, including one that already contains the subject', t => {
  const { cwd, git, write, baseline } = repository(t)
  write('lib/workspace.js', 'subject\n')
  git('add', '.')
  git('commit', '-m', 'Subject change')
  const head = git('rev-parse', 'HEAD')
  git('switch', '-c', 'repair', 'main')
  write('lib/cli.js', 'repair\n')
  git('add', '.')
  git('commit', '-m', 'Repair from main')
  const repair = git('rev-parse', 'HEAD')
  git('switch', '-c', 'coverage', 'change')
  write('test/new-coverage.test.js', 'coverage\n')
  git('add', '.')
  git('commit', '-m', 'Coverage on top of the subject')
  const coverage = git('rev-parse', 'HEAD')
  git('switch', 'change')
  write('lib/cli.js', 'repair\n')
  write('test/new-coverage.test.js', 'coverage\n')
  // Dependency reuse through links to matching installs, outside the repository.
  mkdirSync(join(cwd, 'ui-prototype'))
  symlinkSync('../shared-install/node_modules', join(cwd, 'node_modules'))
  symlinkSync('../../shared-install/ui-prototype/node_modules', join(cwd, 'ui-prototype/node_modules'))

  const plan = createPlan({ cwd, overlays: [repair, `${head}..${coverage}`] })
  assert.deepEqual(plan.files, ['lib/cli.js', 'lib/workspace.js', 'node_modules', 'test/new-coverage.test.js', 'ui-prototype/node_modules'])
  assert.deepEqual(plan.origins, {
    'lib/cli.js': [`overlay:${repair}`], 'lib/workspace.js': ['subject'], node_modules: ['environment'],
    'test/new-coverage.test.js': [`overlay:${coverage}`], 'ui-prototype/node_modules': ['environment'],
  })
  assert.deepEqual(plan.unattributed, [])
  assert.deepEqual(plan.warnings, [])
  assert.deepEqual(plan.overlays.map(({ ref, base, files, includesSubject, divergent, missing }) => ({ ref, base: base.commit, files, includesSubject, divergent, missing })), [
    { ref: repair, base: baseline, files: ['lib/cli.js'], includesSubject: false, divergent: [], missing: [] },
    { ref: coverage, base: head, files: ['test/new-coverage.test.js'], includesSubject: true, divergent: [], missing: [] },
  ])
  assert.equal(plan.overlays[1].base.ref, head)
  assert.deepEqual(plan.environment.dependencyLinks, [
    { path: 'node_modules', target: '../shared-install/node_modules', resolved: join(plan.repository.root, '..', 'shared-install/node_modules') },
    { path: 'ui-prototype/node_modules', target: '../../shared-install/ui-prototype/node_modules', resolved: join(plan.repository.root, '..', 'shared-install/ui-prototype/node_modules') },
  ])
  assert.deepEqual(plan.unclassified, [], 'verified dependency links are classified; other unknown paths still are not')
  assert.deepEqual(plan.scripts, ['test:qualification', 'test:runtime', 'test:cli'])
  assert.equal(plan.tiers.deliberate.command, 'npm run test:acceptance -- --repeat 20 --seed 1')
  assert.equal(plan.tiers.routine.verify, 'npm run verify')

  // The same coverage branch declared from its merge base repeats the subject's content.
  const repeated = createPlan({ cwd, overlays: [coverage] })
  assert.deepEqual(repeated.warnings.map(warning => warning.kind), ['overlay-includes-subject', 'unattributed-paths'])
  assert.match(repeated.warnings[0].reason, new RegExp(`HEAD\\.\\.${coverage}`))
  assert.deepEqual(repeated.overlays[0].files, ['lib/workspace.js', 'test/new-coverage.test.js'])
  assert.deepEqual(repeated.origins['lib/workspace.js'], ['subject'], 'content identical to the subject is not credited to the overlay')
  assert.deepEqual(repeated.origins['lib/cli.js'], ['unattributed'], 'an undeclared repair is not silently labelled subject')

  // A real dependency directory is ignored by Git and never appears; a link elsewhere is still unknown.
  unlinkSync(join(cwd, 'node_modules'))
  mkdirSync(join(cwd, 'node_modules'))
  write('node_modules/.gitignore', '*\n')
  assert.deepEqual(createPlan({ cwd, overlays: [repair] }).files.includes('node_modules'), false)
  assert.throws(() => createPlan({ cwd, overlays: ['..x'] }), /BASE\.\.REF/)
  assert.throws(() => createPlan({ cwd, overlays: [`${head}..`] }), /BASE\.\.REF/)
})

it('warns when a merge commit obscures subject and overlay identity', t => {
  const { cwd, git, write, baseline } = repository(t)
  write('subject.md', 'subject')
  git('add', '.')
  git('commit', '-m', 'subject')
  git('switch', 'main')
  write('overlay.md', 'overlay')
  git('add', '.')
  git('commit', '-m', 'overlay')
  git('switch', 'change')
  git('merge', '--no-ff', 'main', '-m', 'combined')
  const plan = createPlan({ cwd, base: baseline })
  assert.equal(plan.warnings[0].kind, 'merge-head')
  assert.ok(plan.files.includes('subject.md') && plan.files.includes('overlay.md'))
})
