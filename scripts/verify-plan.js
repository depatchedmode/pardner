#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    files: names('scripts/verify-plan.js scripts/verify-smoke.js test/verify-plan.test.js'),
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

export function planForFiles(files, { base = null, head = null, manifestVersions = {} } = {}) {
  files = [...new Set(files)].sort()
  const selected = new Set(), triggers = [], unclassified = []
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
      const gateScripts = document => Object.fromEntries(['test', 'verify', 'test:acceptance', 'test:qualification', 'test:runtime', 'test:cli', 'test:ui', 'ui:build']
        .map(name => [name, document?.scripts?.[name] ?? null]))
      if (versions.some(value => !equal(gateScripts(value), gateScripts(versions[0])))) {
        triggers.push({ kind: 'harness', path, reason: 'A regression, build, or acceptance command changed' })
      }
    }
  }
  return {
    schemaVersion: 1, base, head, files,
    scripts: scriptOrder.filter(script => selected.has(script)),
    verify: files.some(path => classifyPath(path)?.name !== 'guidance'),
    qualification: { required: triggers.length > 0, triggers },
    semanticReview: files,
    unclassified,
    guidanceOnly: files.length > 0 && files.every(path => classifyPath(path)?.name === 'guidance'),
  }
}

export function createPlan({ cwd = root, base = 'origin/main' } = {}) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  const list = args => git(args).split('\0').filter(Boolean)
  const head = git(['rev-parse', '--verify', 'HEAD']).trim()
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
  return planForFiles(files, { base: { ref: base, commit, mergeBase }, head, manifestVersions })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args.length !== 2 || args[0] !== '--base')) throw new Error('Usage: node scripts/verify-plan.js [--base REF]')
    process.stdout.write(`${JSON.stringify(createPlan({ base: args[1] }), null, 2)}\n`)
  } catch (error) {
    console.error(`Cannot plan verification: ${error.message}`)
    process.exitCode = 1
  }
}
