#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const names = text => text.trim().split(/\s+/)
const groups = [
  {
    name: 'persistence', scripts: ['test:qualification', 'test:runtime'], qualification: 'Disk persistence and directory ownership',
    files: names(`lib/atomic-file.js lib/durable-repo.js lib/nodefs-storage-adapter.js lib/storage-key.js lib/storage-lease.js lib/private-state.js
      support/persistence-process.js`),
  },
  {
    name: 'transport', scripts: ['test:qualification', 'test:runtime', 'test:cli', 'test:ui'], qualification: 'Offline reopen, authenticated transport, or acknowledgement ordering',
    files: names(`automerge-sync-server.js lib/local-service.js lib/workspace-runtime.js lib/native-peer-client.js
      lib/sync-client.js lib/ticket-network-adapter.js lib/validated-websocket-server-adapter.js
      support/resources.js support/workspace-service-process.js support/replica-credentials.js`),
  },
  {
    name: 'delivery', scripts: ['test:runtime', 'test:cli'], qualification: 'Durable delivery, leases, or replay',
    files: names('lib/delivery-ledger.js lib/bridge-inbox.js lib/sqlite-transaction.js'),
  },
  {
    name: 'domain', scripts: ['test:runtime', 'test:qualification', 'test:cli'],
    files: names('lib/workspace.js lib/workspace-commands.js lib/workspace-schema.js support/workspace-test.js'),
  },
  {
    name: 'cli', scripts: ['test:cli'],
    files: names('bin/pardner.js lib/cli.js lib/cli-trace.js lib/agent-trace.js lib/github-remote.js support/cli-resources.js'),
  },
  { name: 'lan', scripts: ['test:ui', 'test:runtime'], files: ['lib/lan-access.js'] },
  {
    name: 'bridge', scripts: ['test:runtime', 'test:cli'],
    files: names(`lib/agent-bridge.js lib/codex-bridge-adapter.js lib/bridge-paths.js lib/bridge-retirement.js
      scripts/bridge-approval-rehearsal.js scripts/bridge-codex-smoke.js scripts/bridge-real-rehearsal.js
      scripts/bridge-three-agent-rehearsal.js support/bridge-rehearsal.js support/bridge-completion-rehearsal.js
      support/coordinator-process.js support/three-agent-coordinator.js support/three-agent-review.js`),
  },
  {
    name: 'acceptance-harness', scripts: ['test:qualification', 'test:runtime', 'test:cli', 'test:ui'],
    qualification: 'Acceptance measurement or regression gate changed',
    files: names(`scripts/acceptance.js scripts/verify.js support/acceptance/agent-process.js
      support/acceptance/agent-worker.js support/acceptance/candidate.js support/acceptance/expected-operations.js
      support/acceptance/network-gate.js test/acceptance-components.test.js`),
  },
  {
    name: 'operator-harness', scripts: ['test:runtime', 'test:cli'],
    files: names(`scripts/native-peer-smoke.js scripts/stress-native-peer.js scripts/remote/install-node.sh
      scripts/remote/provision.sh scripts/remote/rehearse.py scripts/remote/verify-agent.py`),
  },
  {
    name: 'verification-tooling', scripts: ['test:verification'],
    files: names(`scripts/verify-plan.js scripts/verify-sanitize.js scripts/verify-smoke.js scripts/verify-watchdog.js
      test/verify-plan.test.js test/verify-sanitize.test.js test/verify-watchdog.test.js`),
  },
  {
    name: 't3-execution', scripts: [], files: names('lib/t3-execution.js lib/t3-mcp-client.js'),
    focused: [{ command: 'node --test test/t3-execution.test.js', note: 'Also discovered by npm run verify' }],
  },
  { name: 'cursor-cloud', scripts: ['test:runtime', 'test:ui'], files: names('lib/cursor-cloud-client.js lib/cursor-cloud-execution.js support/fake-cursor-cloud.js'),
    focused: [{ command: 'node --test test/cursor-cloud.test.js', note: 'Deterministic official API fixtures; no live Cloud runs' }] },
  { name: 'reliability-tooling', scripts: ['test:runtime'], files: names('support/reliability/baseline.mjs support/reliability/collision-example.mjs support/reliability/compatibility.mjs support/reliability/locked.py support/reliability/profiles.json') },
  { name: 'control-pane', scripts: ['test:runtime', 'test:ui'], files: names('lib/control-pane.js support/fake-t3-server.js') },
  {
    name: 't3-qualification-harness', scripts: [], files: names('scripts/t3-qualification.js support/t3-fake-codex.mjs'),
    focused: [{ command: 'npm run test:t3-qualification', note: 'Requires the pinned T3 app; see docs/PARDNER-T3-QUALIFICATION.md' }],
  },
  {
    name: 'selfhost79-proof', scripts: ['test:runtime'],
    files: names('scripts/selfhost79.py support/selfhost79/checker.py support/selfhost79/probe.mjs support/selfhost79/fixture.json'),
    focused: [{ command: 'node --test test/selfhost79.test.js', note: 'Offline artifact proof only; live attempts remain owner-gated' }],
  },
  { name: 'control-runtime', scripts: ['test:control-runtime'], files: names('scripts/control-runtime.py test/control_runtime_test.py') },
  {
    name: 'lifecycle-model', scripts: ['test:runtime'],
    files: names('formal/lifecycle/checker.js formal/lifecycle/model.js formal/lifecycle/check.js formal/lifecycle/mutations.js formal/lifecycle/mapping.json'),
    focused: [{ command: 'npm run verify:model', note: 'Bounded model check with source/model drift detection; see docs/PARDNER-LIFECYCLE-MODEL.md' }],
  },
]
const manifests = ['package.json', 'package-lock.json', 'ui-prototype/package.json', 'ui-prototype/package-lock.json']
const scriptOrder = ['test:verification', 'test:qualification', 'test:runtime', 'test:cli', 'test:ui', 'test:control-runtime']

export function classifyPath(path) {
  const group = groups.find(group => group.files.includes(path))
  if (group) return group
  if (manifests.includes(path)) return { name: 'dependencies', scripts: scriptOrder.filter(script => script !== 'test:verification') }
  if (path === '.node-version') return { name: 'node', scripts: scriptOrder, qualification: 'Pinned Node runtime changed' }
  if (/^ui-prototype\/(src\/|public\/)/.test(path) || ['ui-prototype/index.html', 'ui-prototype/vite.config.js'].includes(path)) {
    return { name: 'ui', scripts: ['test:ui'] }
  }
  if (/^test\/[^/]+\.test\.js$/.test(path)) {
    if (/pardner-(ui|phone|connection-ui|control-ui)|browser-connection|lan-/.test(path)) return { name: 'ui-test', scripts: ['test:ui'] }
    if (/storage|conflict|ticket/.test(path)) return { name: 'qualification-test', scripts: ['test:qualification'], qualification: 'Persistence or conflict regression evidence changed' }
    if (/pardner-cli|pardner-brand/.test(path)) return { name: 'cli-test', scripts: ['test:cli'] }
    return { name: 'regression-test', scripts: ['test:runtime'] }
  }
  if (['README.md', 'AGENTS.md', 'CLAUDE.md', 'LICENSE', '.claude/skills'].includes(path)
    || /^(docs|skills|\.agents)\/.*\.md$/.test(path) || /^docs\/evidence\/.*\.json$/.test(path)) return { name: 'guidance', scripts: [] }
  if (['.gitignore', 'ui-prototype/.gitignore'].includes(path)) return { name: 'repository-config', scripts: [] }
  return null
}

const protectedPackage = name => name.startsWith('@automerge/') || ['ws', 'playwright', 'playwright-core'].includes(name)
function foundations(document, lockfile) {
  const entries = {}
  if (!document) return entries
  if (lockfile) {
    if (!document.packages) throw new Error('Expected a package-lock with a packages map; classify this lockfile format before proceeding')
    for (const [path, value] of Object.entries(document.packages)) {
      const name = path.split('node_modules/').at(-1)
      if (protectedPackage(name)) entries[path] = value
    }
    entries.node = document.packages['']?.engines?.node ?? null
  } else {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides', 'resolutions']) {
      for (const [name, value] of Object.entries(document[section] ?? {})) {
        if (protectedPackage(name) || ['overrides', 'resolutions'].includes(section)) entries[`${section}:${name}`] = value
      }
    }
    entries.node = document.engines?.node ?? null
  }
  return entries
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))

const gateScripts = ['test', 'verify', 'test:acceptance', 'test:qualification', 'test:runtime', 'test:cli', 'test:ui', 'ui:build']
const regressionScripts = new Set(['test:qualification', 'test:runtime', 'test:cli', 'test:ui'])
const testFile = /^test\/[^\s'"`$;&|<>]+\.test\.js$/

// Compare each version's gate commands with the merge base. Only a regression command whose
// tokens are unchanged apart from inserted test files is additive; anything else is a change.
export function gateScriptChanges(versions, scripts = gateScripts) {
  const changes = []
  for (const script of scripts.flatMap(name => [`pre${name}`, name, `post${name}`])) {
    const commands = versions.map(document => document?.scripts?.[script] ?? null)
    const added = new Set()
    let changed = false
    for (const command of commands.slice(1)) {
      if (command === commands[0]) continue
      const extra = additiveTestFiles(commands[0], command)
      if (!regressionScripts.has(script) || !extra) changed = true
      else for (const file of extra) added.add(file)
    }
    if (changed) changes.push({ kind: 'changed', script })
    else if (added.size) changes.push({ kind: 'additive', script, added: [...added].sort() })
  }
  return changes
}

function additiveTestFiles(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return null
  const old = before.trim().split(/\s+/), next = after.trim().split(/\s+/)
  const testIndex = old.indexOf('--test')
  if (testIndex < 1 || old[testIndex - 1] !== 'node' || (testIndex > 1 && old[testIndex - 2] !== '&&')) return null
  const firstFile = testIndex + 1
  if (!old.slice(firstFile).length || !old.slice(firstFile).every(token => testFile.test(token))) return null
  if (!equal(old.slice(0, firstFile), next.slice(0, firstFile))) return null
  if (new Set(next.slice(firstFile)).size !== next.length - firstFile) return null
  const added = []
  let index = firstFile
  for (const token of next.slice(firstFile)) {
    if (index < old.length && token === old[index]) index++
    else if (testFile.test(token) && !old.includes(token)) added.push(token)
    else return null
  }
  return index === old.length && added.length ? added : null
}

// Installed dependency directories that a verification checkout may reuse through a symlink to a
// matching install. Git ignores only real directories at these paths, so a link shows up as an
// untracked path; it is recorded as environment, not as part of the change.
export const dependencyLinkPaths = ['node_modules', 'ui-prototype/node_modules']
const qualificationCommand = 'npm run test:acceptance -- --repeat 20 --seed 1'

export function planForFiles(files, { base = null, head = null, repository = null, tooling = null, overlays = [], origins = null, warnings = [], manifestVersions = {}, dependencyLinks = [] } = {}) {
  files = [...new Set(files)].sort()
  const linked = new Set(dependencyLinks.map(link => link.path))
  const classify = path => linked.has(path) ? { name: 'dependency-link', scripts: [] } : classifyPath(path)
  const selected = new Set(), focused = new Map(), triggers = [], reviewRequired = [], unclassified = []
  for (const path of files) {
    const group = classify(path)
    if (!group) unclassified.push(path)
    for (const script of group?.scripts ?? []) selected.add(script)
    for (const check of group?.focused ?? []) focused.set(check.command, check)
    if (group?.qualification) triggers.push({ kind: group.name.includes('harness') ? 'harness' : 'path', path, reason: group.qualification })
    if (path === 'docs/PARDNER-GOAL-AUDIT.md') triggers.push({ kind: 'claim', path, reason: 'Goal audit update requires current qualification evidence' })
    if (!manifests.includes(path)) continue
    const versions = manifestVersions[path]
    if (!versions) {
      triggers.push({ kind: 'dependency', path, reason: 'Dependency contents unavailable; qualification cannot be ruled out' })
      continue
    }
    const foundationsByVersion = versions.map(document => foundations(document, path.endsWith('lock.json')))
    if (foundationsByVersion.some(value => !equal(value, foundationsByVersion[0]))) {
      triggers.push({ kind: 'dependency', path, reason: 'Node, Automerge, WebSocket, browser tooling, or dependency overrides changed' })
    }
    if (path === 'package.json' || path === 'ui-prototype/package.json') {
      const changes = gateScriptChanges(versions, path === 'package.json' ? gateScripts : ['build'])
      if (changes.some(change => change.kind === 'changed')) {
        triggers.push({ kind: 'harness', path, reason: 'A regression, build, or acceptance command changed' })
      } else {
        for (const change of changes) reviewRequired.push({ kind: 'additive-test-inclusion', path, script: change.script, added: change.added,
          reason: 'Test files were only added to an otherwise unchanged regression command; record a semantic review of what the new tests measure' })
      }
    }
  }
  // Without declared overlays every change belongs to the subject under verification. With overlays the
  // subject is its committed diff; a path explained by neither is reported rather than assumed.
  const origin = path => linked.has(path) ? ['environment'] : origins?.[path] ?? ['subject']
  for (const entry of [...triggers, ...reviewRequired]) entry.origin = origin(entry.path)
  const attributed = Object.fromEntries(files.map(path => [path, origin(path)]))
  const unattributed = files.filter(path => attributed[path].includes('unattributed'))
  if (unattributed.length) warnings = [...warnings, { kind: 'unattributed-paths', paths: unattributed, reason: 'Changed paths belong to neither the subject commits nor a declared overlay. Declare their source (another --overlay, local repair, or environment) before interpreting attribution.' }]
  const changed = files.filter(path => !linked.has(path))
  const scripts = scriptOrder.filter(script => selected.has(script))
  return {
    schemaVersion: 3, repository, tooling, base, head, overlays, files, warnings,
    origins: attributed,
    unattributed,
    environment: { dependencyLinks },
    scripts,
    focusedCommands: [...focused.values()],
    verify: changed.some(path => classifyPath(path)?.name !== 'guidance'),
    qualification: { required: triggers.length > 0, triggers, reviewRequired },
    tiers: {
      routine: { scripts, focusedCommands: [...focused.keys()], verify: 'npm run verify', note: '`test:qualification` is a focused regression suite that belongs to routine verification; it is not the deliberate qualification tier.' },
      deliberate: { command: qualificationCommand, required: triggers.length > 0, note: 'Run only when qualification is explicitly requested; a trigger records the obligation, it does not run the gate.' },
    },
    semanticReview: changed,
    unclassified,
    guidanceOnly: changed.length > 0 && changed.every(path => classifyPath(path)?.name === 'guidance'),
  }
}

const gitIn = cwd => args => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })

export function createPlan({ cwd = process.cwd(), base = 'origin/main', overlays = [] } = {}) {
  cwd = gitIn(resolve(cwd))(['rev-parse', '--show-toplevel']).trim()
  const git = gitIn(cwd)
  const list = args => git(args).split('\0').filter(Boolean)
  const rev = spec => git(['rev-parse', '--verify', '--end-of-options', `${spec}^{commit}`]).trim()
  const isAncestor = (ancestor, descendant) => { try { git(['merge-base', '--is-ancestor', ancestor, descendant]); return true } catch { return false } }
  const repository = { root: cwd, gitDir: resolve(cwd, git(['rev-parse', '--git-dir']).trim()) }
  let tooling = null
  try {
    const toolingRoot = gitIn(root)(['rev-parse', '--show-toplevel']).trim()
    tooling = { root: toolingRoot, head: gitIn(toolingRoot)(['rev-parse', 'HEAD']).trim(), sameCheckout: toolingRoot === cwd }
  } catch { tooling = { root, head: null, sameCheckout: false } }
  const head = git(['rev-parse', '--verify', 'HEAD']).trim()
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/).slice(1)
  const warnings = parents.length > 1 ? [{ kind: 'merge-head', reason: 'HEAD is a merge commit. Confirm the subject identity; apply tooling as a staged patch instead of merging it.' }] : []
  const commit = rev(base)
  const mergeBase = git(['merge-base', commit, head]).trim()
  const conflicts = list(['diff', '--name-only', '--diff-filter=U', '-z'])
  if (conflicts.length) throw new Error(`Resolve merge conflicts before planning: ${conflicts.join(', ')}`)
  const subjectCommitted = list(['diff', '--name-only', '--no-renames', '-z', mergeBase, head, '--'])
  const untracked = list(['ls-files', '--others', '--exclude-standard', '-z'])
  const files = [...new Set([
    ...subjectCommitted,
    ...list(['diff', '--name-only', '--no-renames', '-z', '--cached', head, '--']),
    ...list(['diff', '--name-only', '--no-renames', '-z', '--']),
    ...untracked,
  ])]
  function readRevision(revision, path) {
    const listed = revision === ':' ? list(['ls-files', '-z', '--', path]) : list(['ls-tree', '--name-only', '-z', revision, '--', path])
    if (!listed.length) return null
    return JSON.parse(git(['show', revision === ':' ? `:${path}` : `${revision}:${path}`]))
  }
  const manifestVersions = {}
  for (const path of files.filter(path => manifests.includes(path))) {
    let working
    try { working = JSON.parse(readFileSync(resolve(cwd, path), 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error; working = null }
    manifestVersions[path] = [readRevision(mergeBase, path), readRevision(head, path), readRevision(':', path), working]
  }
  // Only an untracked symlink at a known dependency path is a dependency link; anything else stays a changed path.
  const dependencyLinks = []
  for (const path of untracked.filter(path => dependencyLinkPaths.includes(path))) {
    const absolute = resolve(cwd, path)
    if (!lstatSync(absolute).isSymbolicLink()) continue
    const target = readlinkSync(absolute)
    dependencyLinks.push({ path, target, resolved: resolve(cwd, path, '..', target) })
  }
  // Each overlay (for example verification tooling under trial, or a declared repair) is applied to the
  // subject checkout as uncommitted changes. Its paths stay in the plan; origins attribute them.
  const described = overlays.map(spec => {
    const separator = spec.indexOf('..')
    const [baseSpec, refSpec] = separator >= 0 ? [spec.slice(0, separator), spec.slice(separator + 2)] : [null, spec]
    if (!refSpec || baseSpec === '') throw new Error(`Overlay "${spec}" must be REF or BASE..REF`)
    const overlayCommit = rev(refSpec)
    const overlayBase = baseSpec ? rev(baseSpec) : git(['merge-base', commit, overlayCommit]).trim()
    const overlayFiles = list(['diff', '--name-only', '--no-renames', '-z', overlayBase, overlayCommit, '--']).sort()
    const includesSubject = overlayCommit !== head && isAncestor(head, overlayCommit)
    if (includesSubject && !isAncestor(head, overlayBase)) {
      warnings.push({ kind: 'overlay-includes-subject', overlay: refSpec, reason: `Overlay ${refSpec} descends from the subject HEAD but its base ${overlayBase.slice(0, 12)} predates it, so base..overlay repeats subject content. Declare it as HEAD..${refSpec} to attribute only its own changes, and record that the omitted content equals the subject.` })
    }
    return { ref: refSpec, commit: overlayCommit, base: { ref: baseSpec ?? `merge-base(${base}, ${refSpec})`, commit: overlayBase }, files: overlayFiles,
      missing: overlayFiles.filter(path => !files.includes(path)), divergent: [], includesSubject }
  })
  let origins = null
  if (described.length) {
    const committed = new Set(subjectCommitted)
    const candidates = [...new Set(described.flatMap(overlay => overlay.files))]
    const differs = new Set(differingFromCommit(cwd, head, candidates))
    for (const overlay of described) {
      const changedSince = new Set(differingFromCommit(cwd, overlay.commit, overlay.files))
      overlay.divergent = overlay.files.filter(path => files.includes(path) && changedSince.has(path))
    }
    origins = Object.fromEntries(files.map(path => {
      const sources = []
      if (committed.has(path)) sources.push('subject')
      for (const overlay of described) if (overlay.files.includes(path) && differs.has(path)) sources.push(`overlay:${overlay.ref}`)
      return [path, sources.length ? sources : ['unattributed']]
    }))
  }
  return planForFiles(files, { base: { ref: base, commit, mergeBase }, head, repository, tooling, overlays: described, origins, warnings, manifestVersions, dependencyLinks })
}

// Paths whose working-tree state (including untracked files and symlinks) differs from commit,
// computed through a temporary index so the user's index is never modified.
function differingFromCommit(cwd, commit, paths) {
  if (!paths.length) return []
  const directory = mkdtempSync(join(tmpdir(), 'pardner-verify-plan-index-'))
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index') }
    const run = args => execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    run(['read-tree', 'HEAD'])
    run(['add', '-A', '--', '.'])
    return run(['diff', '--cached', '--name-only', '--no-renames', '-z', commit, '--', ...paths]).split('\0').filter(Boolean)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function parseArguments(args) {
  const options = { overlays: [] }
  const usage = 'Usage: node scripts/verify-plan.js [--base REF] [--cwd CHECKOUT] [--overlay REF | --overlay BASE..REF]...'
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]]
    if (!['--base', '--cwd', '--overlay'].includes(name) || value === undefined) throw new Error(usage)
    if (name === '--overlay') { options.overlays.push(value); continue }
    if (name.slice(2) in options) throw new Error(usage)
    options[name.slice(2)] = value
  }
  return { base: options.base, cwd: options.cwd, overlays: options.overlays }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { base, cwd, overlays } = parseArguments(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(createPlan({ base, cwd: cwd ?? process.cwd(), overlays }), null, 2)}\n`)
  } catch (error) {
    console.error(`Cannot plan verification: ${error.message}`)
    process.exitCode = 1
  }
}
