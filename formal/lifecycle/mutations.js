#!/usr/bin/env node
/**
 * Demonstrates that the lifecycle verification workflow catches deliberate
 * source mutations. For each mutation the runner:
 *
 *   1. copies the mapped sources, support files and the relevant tests into a
 *      disposable directory (the working tree is never modified),
 *   2. applies one textual mutation to the copy and runs the implementation
 *      check (real Node tests) there, expecting a failure,
 *   3. runs the drift check against the copy, expecting the mapped file to be
 *      reported as changed (the model cannot vouch for unreviewed code),
 *   4. runs the model with the mirrored model mutation, expecting a counterexample,
 *   5. restores the copy from the pristine source and removes it.
 *
 * Each implementation check is first run unmutated as a control.
 *
 *   node formal/lifecycle/mutations.js [--only NAME] [--json PATH] [--keep]
 *
 * Exit code 0 only when every control passes, every mutation is caught by its
 * implementation check, every drift check reports the mutated file, and every
 * mirrored model mutation produces a counterexample.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '..', '..')
const SERVER = 'automerge-sync-server.js'
const RUNTIME = 'lib/workspace-runtime.js'
const WORKSPACE = 'lib/workspace.js'
const CONFORMANCE = 'test/lifecycle-conformance.test.js'
const RUNTIME_TESTS = 'test/workspace-runtime.test.js'

export const MUTATIONS = [
  {
    name: 'receipt-before-persist', property: 'ReceiptAfterBarrier', file: WORKSPACE,
    description: 'workspace.apply returns savedLocally without awaiting the flush',
    find: 'try {\n      await this.repo.flush([this.handle.documentId])\n    } catch (error) {',
    replace: 'try {\n      void this.repo.flush([this.handle.documentId])\n    } catch (error) {',
    check: { file: CONFORMANCE, pattern: 'local-save receipt only after the storage barrier' },
  },
  {
    name: 'ack-before-persist', property: 'ReceiptAfterBarrier', file: WORKSPACE,
    description: 'workspace.acknowledge responds without awaiting the flush',
    find: '    await this.repo.flush([this.handle.documentId])\n    return { acknowledged: true',
    replace: '    void this.repo.flush([this.handle.documentId])\n    return { acknowledged: true',
    check: { file: CONFORMANCE, pattern: 'acknowledges heads only after the hub persisted them' },
  },
  {
    name: 'hub-acks-unknown-heads', property: 'ReceiptAfterBarrier', file: WORKSPACE,
    description: 'workspace.acknowledge no longer checks that it holds the requested heads',
    find: '    if (!hasHeads(this.handle.doc(), heads)) return { acknowledged: false }\n',
    replace: '',
    check: { file: CONFORMANCE, pattern: 'does not acknowledge heads the hub does not hold' },
  },
  {
    name: 'stale-ack-accepted', property: 'AckedHeadsPersisted', file: RUNTIME,
    description: 'synchronizeAcknowledgement records the current heads without the requested-heads guards',
    find: `      if (receipt.acknowledged) {
        const doc = this.workspace.handle.doc()
        requireValue(Array.isArray(receipt.hubHeads), 'Invalid hub persistence acknowledgement')
        if (canonical(getHeads(doc)) === canonical(requestedHeads) && hasHeads(doc, receipt.hubHeads)) {
          await this.repo.flush([this.workspace.handle.documentId])
          if (canonical(getHeads(this.workspace.handle.doc())) === canonical(requestedHeads)) {
            this.acknowledgedHeads = requestedHeads
            this.lastSyncedAt = new Date().toISOString()
          }
        }
      }`,
    replace: `      if (receipt.acknowledged) {
        requireValue(Array.isArray(receipt.hubHeads), 'Invalid hub persistence acknowledgement')
        await this.repo.flush([this.workspace.handle.documentId])
        this.acknowledgedHeads = getHeads(this.workspace.handle.doc())
        this.lastSyncedAt = new Date().toISOString()
      }`,
    check: { file: RUNTIME_TESTS, pattern: 'does not let a delayed hub acknowledgement clear newer local work' },
  },
  {
    name: 'admit-while-stopping', property: 'NoAdmissionWhileStopping', file: SERVER,
    description: 'the stopping middleware no longer rejects requests',
    find: `      if (this.stopping) {
        return res.set('Connection', 'close').status(503).json({
          code: 'SERVICE_STOPPING', error: 'The service is stopping',
        })
      }
`,
    replace: '',
    check: { file: RUNTIME_TESTS, pattern: 'rejects the pipelined request' },
  },
  {
    name: 'close-store-before-drain', property: 'StorageAvailableWhileAdmitted', file: SERVER,
    description: 'stop() closes the store before the listeners have drained',
    find: `    const listenerResults = await listenersClosed
    await this.control?.close()
    this.control = null
    this.wsHttpServer = null
    this.httpServer = null

    await this.store.close()
`,
    replace: `    await this.store.close()
    const listenerResults = await listenersClosed
    await this.control?.close()
    this.control = null
    this.wsHttpServer = null
    this.httpServer = null

`,
    check: { file: CONFORMANCE, pattern: 'keeps storage open until an acknowledgement admitted before stop' },
  },
  {
    name: 'lease-before-drain', property: 'StorageAvailableWhileAdmitted', file: RUNTIME,
    description: 'closeResources releases the storage lease before the persistence queue drains',
    find: `    this.adapter?.disconnect()
    try {
      await this.workspace?.queue
      await this.harvests
      await this.repo?.shutdown()
    } finally {
      this.initialized = false
      this.closed = true
      this.deliveryLedger?.close()
      this.records?.close()
      this.lease?.close()
      this.lease = null
    }`,
    replace: `    this.adapter?.disconnect()
    this.lease?.close()
    this.lease = null
    try {
      await this.workspace?.queue
      await this.harvests
      await this.repo?.shutdown()
    } finally {
      this.initialized = false
      this.closed = true
      this.deliveryLedger?.close()
      this.records?.close()
    }`,
    check: { file: CONFORMANCE, pattern: 'drains queued persistence before releasing the storage lease' },
  },
  {
    name: 'no-idle-reclaim', property: 'ShutdownCompletes', file: SERVER,
    description: 'listen() no longer reclaims a connection that becomes idle after stop() began',
    find: '        if (this.stopping) setImmediate(() => server.closeIdleConnections())\n',
    replace: '',
    check: { file: RUNTIME_TESTS, pattern: 'keep-alive socket that goes idle after stop' },
  },
]

const COPIED = [SERVER, 'lib', 'support', 'package.json', 'formal', CONFORMANCE, RUNTIME_TESTS]
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const mappedFiles = [...new Set(MUTATIONS.map(mutation => mutation.file))].sort()
const fingerprint = base => Object.fromEntries(mappedFiles.map(file => [file, sha256(readFileSync(join(base, file)))]))

function makeCopy() {
  const copy = mkdtempSync(join(tmpdir(), 'pardner-lifecycle-mutation-'))
  for (const entry of COPIED) {
    mkdirSync(dirname(join(copy, entry)), { recursive: true })
    cpSync(join(root, entry), join(copy, entry), { recursive: true })
  }
  symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'))
  return copy
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
  return { command: [command, ...args].join(' '), exitCode: result.status, signal: result.signal, output: `${result.stdout}${result.stderr}` }
}

const testSummary = output => Object.fromEntries(['pass', 'fail', 'cancelled'].map(key => [key, Number(output.match(new RegExp(`ℹ ${key} (\\d+)`))?.[1] ?? NaN)]))

function implementationCheck(copy, mutation) {
  const result = run(process.execPath, ['--test', `--test-name-pattern=${mutation.check.pattern}`, mutation.check.file], copy)
  const summary = testSummary(result.output)
  const diagnostics = result.output.split('\n').filter(line => /^\s*(not ok|✖|Error|AssertionError|\+ |- |expected|actual|TypeError)/.test(line) || /must|assert/i.test(line)).slice(0, 8)
  return { ...result, output: undefined, summary, diagnostics }
}

function applyMutation(copy, mutation) {
  const path = join(copy, mutation.file)
  const source = readFileSync(path, 'utf8')
  const occurrences = source.split(mutation.find).length - 1
  if (occurrences !== 1) throw new Error(`Mutation ${mutation.name}: anchor found ${occurrences} times in ${mutation.file}; update the mutation to the current source`)
  writeFileSync(path, source.replace(mutation.find, mutation.replace))
}

function restore(copy, mutation) {
  cpSync(join(root, mutation.file), join(copy, mutation.file))
  return sha256(readFileSync(join(copy, mutation.file))) === sha256(readFileSync(join(root, mutation.file)))
}

export function runMutations({ only = null, keep = false, log = () => {} } = {}) {
  const treeBefore = fingerprint(root)
  const selected = MUTATIONS.filter(mutation => !only || mutation.name === only)
  if (!selected.length) throw new Error(`Unknown mutation ${only}`)
  const copy = makeCopy()
  const started = new Date().toISOString()
  const report = { tool: 'formal/lifecycle/mutations.js', node: process.version, started, copy, controls: [], mutations: [] }
  try {
    const checks = new Map(selected.map(mutation => [`${mutation.check.file}#${mutation.check.pattern}`, mutation.check]))
    for (const [id, check] of checks) {
      log(`control: ${check.file} :: ${check.pattern}`)
      const result = implementationCheck(copy, { check })
      const passed = result.exitCode === 0 && result.summary.pass > 0 && result.summary.fail === 0
      report.controls.push({ id, ...result, outcome: passed ? 'passed' : 'failed' })
    }
    for (const mutation of selected) {
      log(`mutation: ${mutation.name} (${mutation.file})`)
      const entry = { name: mutation.name, property: mutation.property, file: mutation.file, description: mutation.description }
      try {
        applyMutation(copy, mutation)
        entry.applied = true
        const implementation = implementationCheck(copy, mutation)
        entry.implementation = { ...implementation, outcome: implementation.exitCode !== 0 ? 'caught' : 'survived' }
        const drift = run(process.execPath, ['formal/lifecycle/check.js', '--drift-only', '--root', copy, '--json'], root)
        const driftReport = drift.exitCode === 2 ? JSON.parse(drift.output).drift : null
        entry.drift = { exitCode: drift.exitCode, drifted: driftReport?.drifted ?? [], outcome: driftReport?.drifted.includes(mutation.file) ? 'reported' : 'missed' }
        const model = run(process.execPath, ['formal/lifecycle/check.js', '--skip-drift', '--mutate', mutation.name, '--json'], root)
        const modelReport = model.exitCode === 1 ? JSON.parse(model.output) : null
        entry.model = { exitCode: model.exitCode, violation: modelReport?.violation ?? null, states: modelReport?.states ?? null,
          outcome: modelReport?.violation?.property === mutation.property ? 'counterexample' : 'missed' }
      } finally {
        entry.restored = restore(copy, mutation)
      }
      report.mutations.push(entry)
    }
  } finally {
    if (!keep) rmSync(copy, { recursive: true, force: true })
  }
  report.finished = new Date().toISOString()
  report.workingTreeUnchanged = JSON.stringify(fingerprint(root)) === JSON.stringify(treeBefore)
  report.mappedSources = treeBefore
  report.ok = report.workingTreeUnchanged && report.controls.every(control => control.outcome === 'passed')
    && report.mutations.every(entry => entry.restored && entry.implementation?.outcome === 'caught' && entry.drift?.outcome === 'reported' && entry.model?.outcome === 'counterexample')
  return report
}

function table(report) {
  const rows = [['Mutation', 'Property', 'File', 'Implementation check', 'Drift check', 'Model mutation', 'Restored']]
  for (const entry of report.mutations) {
    const tests = entry.implementation?.summary
    rows.push([entry.name, entry.property, entry.file,
      `${entry.implementation?.outcome ?? 'not run'} (exit ${entry.implementation?.exitCode}, ${tests?.fail ?? '?'} failed / ${tests?.pass ?? '?'} passed)`,
      `${entry.drift?.outcome ?? 'not run'} (exit ${entry.drift?.exitCode})`,
      `${entry.model?.outcome ?? 'not run'}${entry.model?.violation ? ` on ${entry.model.violation.property}` : ''}`,
      entry.restored ? 'yes' : 'NO'])
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map(row => String(row[i]).length)))
  const line = row => `| ${row.map((cell, i) => String(cell).padEnd(widths[i])).join(' | ')} |`
  return [line(rows[0]), `| ${widths.map(width => '-'.repeat(width)).join(' | ')} |`, ...rows.slice(1).map(line)].join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const options = { only: null, keep: false, json: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') options.only = argv[++i]
    else if (argv[i] === '--keep') options.keep = true
    else if (argv[i] === '--json') options.json = argv[++i]
    else { console.error(`Unknown argument ${argv[i]}`); process.exit(3) }
  }
  const report = runMutations({ ...options, log: message => console.log(message) })
  console.log('\nControls (unmutated copy):')
  for (const control of report.controls) console.log(`  ${control.outcome.padEnd(7)} ${control.id} (${control.summary.pass} passed, ${control.summary.fail} failed)`)
  console.log(`\n${table(report)}`)
  console.log(`\nWorking tree unchanged: ${report.workingTreeUnchanged}. Disposable copy ${report.copy}${options.keep ? ' kept' : ' removed'}.`)
  if (options.json) { mkdirSync(dirname(options.json), { recursive: true }); writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`); console.log(`Report written to ${options.json}`) }
  console.log(report.ok ? 'Every mutation was caught by its implementation check, reported as drift, and reproduced by the mirrored model mutation.' : 'MUTATION DEMONSTRATION INCOMPLETE: inspect the table above.')
  process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
