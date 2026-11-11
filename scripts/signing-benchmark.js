#!/usr/bin/env node
// Signed changes (#197): authoring with and without signing, receive-side checking at 1, 10 and 50 changes a
// second, a new replica's first full check, and open time, at 1,000 and 10,000 operations. Prints a Markdown
// table and writes JSON with --json FILE. Fixture keys come from support/machines.js, never from flags or the
// environment. Usage: node scripts/signing-benchmark.js [--sizes 1000,10000] [--json FILE]
import { fork } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { loadavg, tmpdir, cpus } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import * as A from '@automerge/automerge'
import { Repo } from '@automerge/automerge-repo'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { ChangeAttribution } from '../lib/attribution.js'
import { machineActor, shardOf, signChange, signaturesDocumentUrl } from '../lib/change-signatures.js'
import { machineKeyFromPem, machineKeyPem } from '../lib/machine-key.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { admitMembers, hubRuntime, memberAdapter, replicaRuntime, testProject } from '../support/machines.js'

const ACTORS = [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'bob', handle: 'bob', kind: 'human' },
  { id: 'codex', handle: 'codex', kind: 'agent' }, { id: 'claude', handle: 'claude', kind: 'agent' }]
const WORDS = 'board signal ledger branch review merge plan task vein goal agent human change record proof sync note draft clear quick steady'.split(' ')
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN }
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] }
const load = () => loadavg().map(value => Number(value.toFixed(2)))

/** A seeded workload in the spike's mix: 20% task.create, 45% comment.add, 25% small task.update, 10% description rewrite. */
function workload(seed = 1) {
  let state = seed >>> 0
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32 }
  const prose = length => { let text = ''; while (text.length < length) text += `${WORDS[Math.floor(random() * WORDS.length)]} `; return text.slice(0, length).trim() }
  const tasks = []
  return doc => {
    const actorId = ACTORS[Math.floor(random() * ACTORS.length)].id
    const roll = random() * 100
    if (!tasks.length || roll < 20) {
      return { type: 'task.create', actorId, payload: { title: prose(30 + Math.floor(random() * 30)), description: prose(2000) }, onDone: result => tasks.push(result.taskId) }
    }
    const taskId = tasks[Math.floor(random() * tasks.length)]
    if (roll < 65) return { type: 'comment.add', actorId, payload: { taskId, text: prose(100 + Math.floor(random() * 500)) } }
    const field = roll < 90 ? ['status', 'priority', 'assignee'][Math.floor(random() * 3)] : 'description'
    const value = field === 'status' ? ['backlog', 'up-next', 'in-progress', 'review'][Math.floor(random() * 4)]
      : field === 'priority' ? ['p0', 'p1', 'p2', 'p3'][Math.floor(random() * 4)] : field === 'assignee' ? ACTORS[Math.floor(random() * 4)].id : prose(2000)
    const current = doc.taskFields[`${taskId}:${field}`]
    const revisions = current ? [...new Set(Object.values(A.getConflicts(doc.taskFields, `${taskId}:${field}`) ?? { one: current }).map(entry => String(entry.operationId)))] : []
    return { type: 'task.update', actorId, payload: { taskId, updates: { [field]: value }, expectedRevisions: { [field]: revisions } } }
  }
}

/** Builds an `operations`-long board in a hub directory, every change signed as the runtime makes it. */
async function build(directory, project, operations) {
  const runtime = hubRuntime(directory, { actors: ACTORS, project })
  await runtime.init()
  await admitMembers(runtime, project)
  const next = workload(operations)
  const started = performance.now()
  for (let index = 0; index < operations; index++) {
    const request = next(runtime.workspace.handle.doc())
    const prepared = prepareOperation(runtime.workspace.handle.doc(), { ...request, operationId: `build-${index}` },
      { replicaId: runtime.manifest.replicaId, timestamp: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() })
    runtime.boardChange(prepared.change)
    request.onDone?.(prepared.event.result)
    if (index % 50 === 49) await new Promise(resolve => setImmediate(resolve))
  }
  await new Promise(resolve => setImmediate(resolve))
  await runtime.repo.flush(runtime.workspace.documents())
  const changes = A.getChangesMetaSince(runtime.workspace.handle.doc(), []).length
  await runtime.close()
  return { seconds: (performance.now() - started) / 1000, changes }
}

/** Median and p90 of `execute` latency (prepare, change, disk barrier) for `count` operations on an open runtime. */
async function author(runtime, count, seed) {
  const next = workload(seed), times = []
  // The workload needs tasks of its own to update.
  for (let index = 0; index < count; index++) {
    const request = next(runtime.workspace.handle.doc())
    const started = performance.now()
    const receipt = await runtime.execute({ ...request, operationId: randomUUID() })
    times.push(performance.now() - started)
    request.onDone?.(receipt.result)
  }
  return times
}

async function authoring(base, project, count = 40) {
  const results = { signed: [], plain: [] }
  for (const round of [0, 1]) {
    for (const arm of round ? ['plain', 'signed'] : ['signed', 'plain']) {
      const directory = await mkdtemp(join(tmpdir(), `pardner-bench-author-${arm}-`))
      await cp(base, directory, { recursive: true })
      const runtime = arm === 'signed' ? hubRuntime(directory, { actors: ACTORS, project })
        : new WorkspaceRuntime({ directory, role: 'hub', actors: ACTORS })
      process.stderr.write(`  ${arm} ${round}\n`)
      await runtime.init()
      await author(runtime, 5, 1000 + round)
      results[arm].push(...await author(runtime, count, 2000 + round))
      await runtime.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
  // The signing step alone: Ed25519 and the signature cache's commit, measured inside the runtime's path.
  return { signed: { median: median(results.signed), p90: percentile(results.signed, 0.9) }, plain: { median: median(results.plain), p90: percentile(results.plain, 0.9) },
    overhead: median(results.signed) / median(results.plain) - 1, samples: results.signed.length }
}

/** A hub served from a copied directory: it detects the copy and waits, so the operator confirms nothing newer exists. */
async function copiedHub(directory, project) {
  const server = new AutomergeSyncServer({ store: hubRuntime(directory, { actors: ACTORS, project }), env: {}, apiToken: 'benchmark', httpPort: 0, wsPort: 0, logger: {}, control: false })
  await server.start()
  await server.store.resumeHub('operator')
  return server
}

/** A hub on a copy of `base`; a bare member writes signed changes at `rate` a second for `seconds`; the hub checks them. */
async function receiving(base, project, rate, seconds = 10) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-bench-receive-'))
  await cp(base, directory, { recursive: true })
  const server = await copiedHub(directory, project)
  const attribution = server.store.attribution
  // Checking slices, and the content check (scanSlice) a change gets in the step that applies it, outside a slice.
  let checking = 0, scanning = 0, inWork = false
  const work = attribution.work.bind(attribution), scan = attribution.scanSlice.bind(attribution)
  attribution.work = () => { const started = performance.now(); inWork = true; try { work() } finally { inWork = false }; checking += performance.now() - started }
  attribution.scanSlice = limit => { const started = performance.now(); scan(limit); if (!inWork) scanning += performance.now() - started }
  const repo = new Repo({ network: [memberAdapter(project, 0, `ws://127.0.0.1:${server.wsPort}/automerge`, { retryMs: 100 })], sharePolicy: async () => true })
  try {
    const board = await repo.find(server.store.manifest.url, { signal: AbortSignal.timeout(120000) })
    const signatures = await repo.find(signaturesDocumentUrl(project.projectId), { signal: AbortSignal.timeout(120000) })
    const key = project.keys[0]
    board.update(doc => A.clone(doc, { actor: machineActor(key) }))
    const next = workload(77)
    const written = new Map()
    checking = 0
    scanning = 0
    // Arrival and attribution at the hub, sampled every 2 ms while writing and after.
    const sample = () => {
      for (const entry of written.values()) {
        if (!entry.arrived && attribution.metas.has(entry.hash)) entry.arrived = performance.now()
        if (!entry.signed && attribution.cache.has(entry.hash)) entry.signed = performance.now()
      }
    }
    const sampler = setInterval(sample, 2)
    const started = performance.now()
    let index = 0
    while (performance.now() - started < seconds * 1000) {
      const due = started + index * (1000 / rate)
      if (performance.now() < due) await delay(due - performance.now())
      const request = next(board.doc())
      const prepared = prepareOperation(board.doc(), { ...request, operationId: randomUUID() }, { replicaId: 'bench-writer', timestamp: new Date().toISOString() })
      board.change(prepared.change)
      request.onDone?.(prepared.event.result)
      const [hash] = A.getHeads(board.doc())
      signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(key, project.projectId, hash) })
      written.set(hash, { hash, sent: performance.now() })
      index++
    }
    const achieved = index / ((performance.now() - started) / 1000)
    const deadline = performance.now() + 60000
    while (performance.now() < deadline && ![...written.values()].every(entry => entry.signed)) await delay(5)
    clearInterval(sampler)
    sample()
    const entries = [...written.values()]
    const unsigned = entries.filter(entry => !entry.signed).length
    const window = entries.filter(entry => entry.arrived && entry.signed).map(entry => Math.max(0, entry.signed - entry.arrived))
    const perChange = (checking + scanning) / Math.max(1, entries.length)
    return { rate, achieved, changes: entries.length, unsigned, checkMsPerChange: perChange, scanMsPerChange: scanning / Math.max(1, entries.length),
      budgetShare: perChange / (1000 / rate), unattributedWindow: { median: median(window), max: Math.max(...window) },
      seenAfter: median(entries.filter(entry => entry.arrived).map(entry => entry.arrived - entry.sent)) }
  } finally {
    await repo.shutdown()
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * A new member machine joins a hub on a copy of `base`: its open, then its first full check, which runs in slices
 * after the board opens. Reports the check's wall time, its CPU time and its longest slice (how long it ever held
 * the event loop).
 */
async function firstCheck(base, project) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-bench-first-'))
  const replicaDirectory = await mkdtemp(join(tmpdir(), 'pardner-bench-replica-'))
  await cp(base, directory, { recursive: true })
  const server = await copiedHub(directory, project)
  const replica = replicaRuntime(replicaDirectory, project, 1, { hub: server, actors: ACTORS })
  const slices = []
  const work = ChangeAttribution.prototype.work
  ChangeAttribution.prototype.work = function () {
    const started = performance.now()
    work.call(this)
    if (this === replica.attribution) slices.push({ started, took: performance.now() - started })
  }
  try {
    const started = performance.now()
    await replica.init()
    const opened = performance.now() - started
    const progress = []
    for (;;) {
      const { checking, changes, signed } = replica.attribution.summary()
      progress.push(checking)
      if (!checking && signed >= changes && !replica.attribution.queue.length && replica.attribution.writersReady) break
      if (performance.now() - started > 600000) break
      await delay(10)
    }
    const done = slices.at(-1)
    const summary = replica.attribution.summary()
    return { opened, checkWall: done ? done.started + done.took - slices[0].started : 0, checkCpu: slices.reduce((sum, slice) => sum + slice.took, 0),
      longestSlice: Math.max(0, ...slices.map(slice => slice.took)), slices: slices.length, changes: summary.changes, signed: summary.signed,
      progress: [...new Set(progress)].slice(0, 12) }
  } finally {
    ChangeAttribution.prototype.work = work
    await replica.close()
    await server.stop()
    await rm(directory, { recursive: true, force: true })
    await rm(replicaDirectory, { recursive: true, force: true })
  }
}

/** Open time in a fresh process: `init()` of a hub runtime on a copy of `base`, with or without its machine key. */
async function openTime(base, project, signed) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-bench-open-'))
  await cp(base, directory, { recursive: true })
  try {
    const child = fork(fileURLToPath(import.meta.url), ['--open-child'], { execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    child.send({ directory, key: signed ? machineKeyPem(project.owner) : null })
    const result = await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject) })
    child.kill()
    return result
  } finally { await rm(directory, { recursive: true, force: true }) }
}

async function openChild() {
  process.once('message', async ({ directory, key }) => {
    const started = performance.now()
    const runtime = new WorkspaceRuntime({ directory, role: 'hub', actors: ACTORS, machineKey: key ? machineKeyFromPem(key) : null })
    await runtime.init()
    const opened = performance.now() - started
    let checked = opened
    if (runtime.attribution) {
      while (runtime.attribution.summary().checking) await delay(5)
      checked = performance.now() - started
    }
    process.send({ opened, checked, rss: process.memoryUsage().rss })
    await runtime.close()
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--open-child')) return openChild()
  const sizes = (args[args.indexOf('--sizes') + 1] && args.includes('--sizes') ? args[args.indexOf('--sizes') + 1] : '1000,10000').split(',').map(Number)
  const jsonFile = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
  if (args.includes('--build-only')) {
    const directory = args[args.indexOf('--build-only') + 1], size = sizes[0]
    const project = testProject({ members: 2 })
    const built = await build(join(directory, 'hub'), project, size)
    writeFileSync(join(directory, 'project.json'), JSON.stringify({ owner: machineKeyPem(project.owner), genesis: project.genesis }))
    process.stdout.write(`${JSON.stringify(built)}\n`)
    return
  }
  const report = { node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, started: new Date().toISOString(), loadAtStart: load(), sizes: {} }
  for (const size of sizes) {
    const root = await mkdtemp(join(tmpdir(), `pardner-bench-${size}-`))
    const project = testProject({ members: 2 })
    try {
      const base = join(root, 'hub')
      const built = await build(base, project, size)
      process.stderr.write(`built ${size} operations (${built.changes} changes) in ${built.seconds.toFixed(1)} s, load ${load()}\n`)
      const entry = { built, load: { beforeAuthoring: load() } }
      process.stderr.write('authoring\n'); entry.authoring = await authoring(base, project)
      entry.load.afterAuthoring = load()
      entry.receiving = []
      for (const rate of [1, 10, 50]) { process.stderr.write(`receiving ${rate}\n`); entry.receiving.push(await receiving(base, project, rate)) }
      entry.load.afterReceiving = load()
      process.stderr.write('first check\n'); entry.firstCheck = await firstCheck(base, project)
      entry.open = { signed: [], plain: [] }
      for (let sample = 0; sample < 3; sample++) {
        entry.open.signed.push(await openTime(base, project, true))
        entry.open.plain.push(await openTime(base, project, false))
      }
      entry.load.end = load()
      report.sizes[size] = entry
      process.stderr.write(`${size}: ${JSON.stringify(entry)}\n`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
  report.finished = new Date().toISOString()
  report.loadAtEnd = load()
  if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(table(report))
}

function table(report) {
  const ms = value => `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ms`
  const lines = [`Node ${report.node}, ${report.cpu} (${report.cores} cores). One-minute load: ${report.loadAtStart[0]} at start, ${report.loadAtEnd[0]} at end.`, '',
    '| Operations | Measure | Signed | Without signing | Note |', '|---|---|---|---|---|']
  for (const [size, entry] of Object.entries(report.sizes)) {
    const { authoring: a, firstCheck: f, open } = entry
    lines.push(`| ${size} | Authoring, execute to receipt (median / p90) | ${ms(a.signed.median)} / ${ms(a.signed.p90)} | ${ms(a.plain.median)} / ${ms(a.plain.p90)} | ${(a.overhead * 100).toFixed(1)}% on the median, ${a.samples} samples per arm, load ${entry.load.afterAuthoring[0]} |`)
    for (const r of entry.receiving) {
      lines.push(`| ${size} | Receive and check at ${r.rate}/s | ${r.changes - r.unsigned} of ${r.changes} attributed; check ${ms(r.checkMsPerChange)} per change (${(r.budgetShare * 100).toFixed(2)}% of the budget${r.scanMsPerChange === undefined ? '' : `; content check ${ms(r.scanMsPerChange)} of it`}) | — | writer achieved ${r.achieved.toFixed(1)}/s; hub sees a change ${ms(r.seenAfter)} after it is written; pending ${ms(r.unattributedWindow.median)} median, ${ms(r.unattributedWindow.max)} worst |`)
    }
    lines.push(`| ${size} | New replica: open, then first full check | open ${ms(f.opened)}; all ${f.signed} of ${f.changes} checked in ${ms(f.checkWall)} after it (${ms(f.checkCpu)} CPU) | — | ${f.slices} slices, longest ${ms(f.longestSlice)}; changes still unchecked, sampled: ${f.progress.join(', ')} |`)
    const openMs = arm => median(open[arm].map(sample => sample.opened))
    lines.push(`| ${size} | Open (init), median of 3 fresh processes | ${ms(openMs('signed'))} (checked by ${ms(median(open.signed.map(sample => sample.checked)))}) | ${ms(openMs('plain'))} | delta ${ms(openMs('signed') - openMs('plain'))}, load ${entry.load.end[0]} |`)
  }
  return `${lines.join('\n')}\n`
}

main().catch(error => { console.error(error.stack); process.exitCode = 1 })
