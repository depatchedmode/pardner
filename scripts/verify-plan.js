#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const names = text => text.trim().split(/\s+/)
const groups = [
  {
    name: 'persistence', scripts: ['test:qualification', 'test:runtime'], qualification: 'Disk persistence and directory ownership',
    files: names(`lib/atomic-file.js lib/durable-repo.js lib/nodefs-storage-adapter.js lib/storage-key.js lib/storage-lease.js
      support/persistence-process.js`),
  },
  {
    name: 'transport', scripts: ['test:qualification', 'test:runtime', 'test:cli', 'test:ui'], qualification: 'Offline reopen, authenticated transport, or acknowledgement ordering',
    files: names(`automerge-sync-server.js lib/local-service.js lib/workspace-runtime.js lib/native-peer-client.js
      lib/sync-client.js lib/ticket-network-adapter.js lib/validated-websocket-server-adapter.js
      support/resources.js support/workspace-service-process.js`),
  },
  {
    name: 'delivery', scripts: ['test:runtime', 'test:cli'], qualification: 'Durable delivery, leases, or replay',
    files: names('lib/delivery-ledger.js lib/bridge-inbox.js'),
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
      support/bridge-rehearsal.js support/bridge-completion-rehearsal.js`),
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
    files: names('scripts/verify-plan.js scripts/verify-smoke.js scripts/verify-watchdog.js test/verify-plan.test.js test/verify-watchdog.test.js'),
  },
]
const manifests = ['package.json', 'package-lock.json', 'ui-prototype/package.json', 'ui-prototype/package-lock.json']
const scriptOrder = ['test:verification', 'test:qualification', 'test:runtime', 'test:cli', 'test:ui']

export function classifyPath(path) {
  const group = groups.find(group => group.files.includes(path))
  if (group) return group
  if (manifests.includes(path)) return { name: 'dependencies', scripts: scriptOrder.filter(script => script !== 'test:verification') }
  if (path === '.node-version') return { name: 'node', scripts: scriptOrder, qualification: 'Pinned Node runtime changed' }
  if (/^ui-prototype\/(src\/|public\/)/.test(path) || ['ui-prototype/index.html', 'ui-prototype/vite.config.js'].includes(path)) {
    return { name: 'ui', scripts: ['test:ui'] }
  }
  if (/^test\/[^/]+\.test\.js$/.test(path)) {
    if (/pardner-(ui|phone|connection-ui)|browser-connection|lan-/.test(path)) return { name: 'ui-test', scripts: ['test:ui'] }
    if (/storage|conflict|ticket/.test(path)) return { name: 'qualification-test', scripts: ['test:qualification'], qualification: 'Persistence or conflict regression evidence changed' }
    if (/pardner-cli|pardner-brand/.test(path)) return { name: 'cli-test', scripts: ['test:cli'] }
    return { name: 'regression-test', scripts: ['test:runtime'] }
  }
  if (['README.md', 'AGENTS.md', 'CLAUDE.md', 'LICENSE', '.claude/skills'].includes(path)
    || /^(docs|skills|\.agents)\/.*\.md$/.test(path)) return { name: 'guidance', scripts: [] }
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
export function gateScriptChanges(versions) {
  const changes = []
  for (const script of gateScripts) {
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
  const added = []
  let index = 0
  for (const token of next) {
    if (index < old.length && token === old[index]) index++
    else if (testFile.test(token) && !old.includes(token)) added.push(token)
    else return null
  }
  return index === old.length && added.length ? added : null
}

export function planForFiles(files, { base = null, head = null, repository = null, tooling = null, overlay = null, origins = null, warnings = [], manifestVersions = {} } = {}) {
  files = [...new Set(files)].sort()
  const selected = new Set(), triggers = [], reviewRequired = [], unclassified = []
  for (const path of files) {
    const group = classifyPath(path)
    if (!group) unclassified.push(path)
    for (const script of group?.scripts ?? []) selected.add(script)
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
    if (path === 'package.json') {
      const changes = gateScriptChanges(versions)
      if (changes.some(change => change.kind === 'changed')) {
        triggers.push({ kind: 'harness', path, reason: 'A regression, build, or acceptance command changed' })
      } else {
        for (const change of changes) reviewRequired.push({ kind: 'additive-test-inclusion', path, script: change.script, added: change.added,
          reason: 'Test files were only added to an otherwise unchanged regression command; record a semantic review of what the new tests measure' })
      }
    }
  }
  const origin = path => origins?.[path] ?? 'subject'
  for (const entry of [...triggers, ...reviewRequired]) entry.origin = origin(entry.path)
  return {
    schemaVersion: 2, repository, tooling, base, head, overlay, files, warnings,
    origins: Object.fromEntries(files.map(path => [path, origin(path)])),
    scripts: scriptOrder.filter(script => selected.has(script)),
    verify: files.some(path => classifyPath(path)?.name !== 'guidance'),
    qualification: { required: triggers.length > 0, triggers, reviewRequired },
    semanticReview: files,
    unclassified,
    guidanceOnly: files.length > 0 && files.every(path => classifyPath(path)?.name === 'guidance'),
  }
}

const gitIn = cwd => args => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })

export function createPlan({ cwd = process.cwd(), base = 'origin/main', overlay: overlayRef = null } = {}) {
  cwd = gitIn(resolve(cwd))(['rev-parse', '--show-toplevel']).trim()
  const git = gitIn(cwd)
  const list = args => git(args).split('\0').filter(Boolean)
  const repository = { root: cwd, gitDir: resolve(cwd, git(['rev-parse', '--git-dir']).trim()) }
  let tooling = null
  try {
    const toolingRoot = gitIn(root)(['rev-parse', '--show-toplevel']).trim()
    tooling = { root: toolingRoot, head: gitIn(toolingRoot)(['rev-parse', 'HEAD']).trim(), sameCheckout: toolingRoot === cwd }
  } catch { tooling = { root, head: null, sameCheckout: false } }
  const head = git(['rev-parse', '--verify', 'HEAD']).trim()
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/).slice(1)
  const warnings = parents.length > 1 ? [{ kind: 'merge-head', reason: 'HEAD is a merge commit. Confirm the subject identity; apply tooling as a staged patch instead of merging it.' }] : []
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim()
  const mergeBase = git(['merge-base', commit, head]).trim()
  const conflicts = list(['diff', '--name-only', '--diff-filter=U', '-z'])
  if (conflicts.length) throw new Error(`Resolve merge conflicts before planning: ${conflicts.join(', ')}`)
  const files = [...new Set([
    ...list(['diff', '--name-only', '--no-renames', '-z', mergeBase, head, '--']),
    ...list(['diff', '--name-only', '--no-renames', '-z', '--cached', head, '--']),
    ...list(['diff', '--name-only', '--no-renames', '-z', '--']),
    ...list(['ls-files', '--others', '--exclude-standard', '-z']),
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
  let overlay = null, origins = null
  if (overlayRef) {
    // The overlay (for example verification tooling under trial) is applied to the subject checkout.
    // Its paths stay in the plan; origins only attribute them.
    const overlayCommit = git(['rev-parse', '--verify', '--end-of-options', `${overlayRef}^{commit}`]).trim()
    const overlayBase = git(['merge-base', commit, overlayCommit]).trim()
    const overlayFiles = list(['diff', '--name-only', '--no-renames', '-z', overlayBase, overlayCommit, '--'])
    const subjectCommitted = new Set(list(['diff', '--name-only', '--no-renames', '-z', mergeBase, head, '--']))
    const differs = new Set(differingFromCommit(cwd, overlayCommit, overlayFiles))
    origins = Object.fromEntries(files.map(path => [path,
      !overlayFiles.includes(path) ? 'subject'
        : subjectCommitted.has(path) || differs.has(path) ? 'both' : 'overlay']))
    overlay = { ref: overlayRef, commit: overlayCommit, mergeBase: overlayBase, files: overlayFiles.sort(),
      missing: overlayFiles.filter(path => !files.includes(path)).sort() }
  }
  return planForFiles(files, { base: { ref: base, commit, mergeBase }, head, repository, tooling, overlay, origins, warnings, manifestVersions })
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
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]]
    if (!['--base', '--cwd', '--overlay'].includes(name) || value === undefined || name.slice(2) in options) {
      throw new Error('Usage: node scripts/verify-plan.js [--base REF] [--cwd CHECKOUT] [--overlay REF]')
    }
    options[name.slice(2)] = value
  }
  return { base: options.base, cwd: options.cwd, overlay: options.overlay }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { base, cwd, overlay } = parseArguments(process.argv.slice(2))
    process.stdout.write(`${JSON.stringify(createPlan({ base, cwd: cwd ?? process.cwd(), overlay }), null, 2)}\n`)
  } catch (error) {
    console.error(`Cannot plan verification: ${error.message}`)
    process.exitCode = 1
  }
}
