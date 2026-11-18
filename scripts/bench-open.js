#!/usr/bin/env node
// Board open benchmark (#209). Synthetic data only: one seeded fixture is built with a machine key, so every change
// is signed, and every timed open runs in a new process against a fresh copy of it.
//
//   node scripts/bench-open.js [--sizes 10000] [--runs 5] [--modes standalone,signed,signed-cold]
//     [--baseline DIR]     also open with the lib/ of another checkout (for example a worktree of origin/main): arm "before"
//     [--arm NAME=DIR]     likewise, under any name, and repeatable: for trying a change without committing it
//     [--upstream]         also open this checkout with the pinned upstream loader restored: arm "upstream"
//     [--fixture DIR]      build the fixture here, or reuse the one already there, and keep it
//     [--max-load N]       start a sample only once the one-minute load is below N [--load-wait SECONDS, default 3600]
//     [--json FILE]        write every sample and the summaries
//
// Modes: `standalone` opens without a machine key, as `pardner serve` does; `signed` opens as the machine that
// wrote the board, with its signature cache; `signed-cold` removes that cache first, so every signature is checked
// and every Activity entry derived again after the board opens.
import { execFileSync, spawn } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { cpus, loadavg, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

const started = performance.now()
const script = fileURLToPath(import.meta.url)
const here = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const SEED = 209
const MODES = ['standalone', 'signed', 'signed-cold']
const ACTORS = Array.from({ length: 4 }, (_, i) => ({ id: `actor-${i}`, handle: `actor${i}`, kind: i < 2 ? 'human' : 'agent' }))
const SIGNATURE_CACHE_FILE = 'signatures.sqlite'
const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim()
const load = () => loadavg().map(value => Number(value.toFixed(2)))

/** Bytes of the files under `path`. A save in progress is not counted: its temporary file is renamed into place when it is done. */
async function bytes(path) {
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += await bytes(child)
    else if (!entry.name.includes('.pardner-tmp-')) total += (await stat(child).catch(error => { if (error.code === 'ENOENT') return { size: 0 }; throw error })).size
  }
  return total
}

function summary(values) {
  const sorted = values.filter(value => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return { median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, min: sorted[0], max: sorted.at(-1) }
}

// ---- Fixture: one hub directory with a machine key, built by the real write path ----

async function buildFixture(root, size) {
  const { prepareOperation } = await import('../lib/workspace-commands.js')
  const { taskState } = await import('../lib/workspace-schema.js')
  const { machineKeyPem } = await import('../lib/machine-key.js')
  const { getChangesMetaSince, getHeads } = await import('@automerge/automerge')
  const { hubRuntime, testProject } = await import('../support/machines.js')
  const project = testProject({ members: 0 })
  const runtime = hubRuntime(join(root, 'hub'), { actors: ACTORS, project })
  const began = performance.now()
  await runtime.init()
  try {
    let seed = SEED
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const words = 'review task board change service storage local agent human comment record update project branch test evidence persist merge retry offline queue design read write runtime process request response field title description issue link work item document'.split(' ')
    const prose = length => { let result = ''; while (result.length < length) result += `${words[Math.floor(random() * words.length)]} `; return result.slice(0, length) }
    const tasks = []
    for (let i = 0; i < size; i++) {
      const kind = i % 100
      const taskId = tasks[Math.floor(random() * tasks.length)]
      let type, payload
      if (kind < 20) { type = 'task.create'; payload = { title: prose(45), description: prose(2000) } }
      else if (kind < 65) { type = 'comment.add'; payload = { taskId, text: prose(100 + Math.floor(random() * 500)) + (i % 10 === 0 ? ' @actor2' : '') } }
      else if (kind < 85) { type = 'task.update'; payload = { taskId, updates: { priority: `p${i % 4}` } } }
      else if (kind < 95) { type = 'task.update'; payload = { taskId, updates: { description: prose(2000) } } }
      else { type = 'task.link-issue'; payload = { taskId, repository: 'example/benchmark', number: i + 1 } }
      if (type === 'task.update') payload.expectedRevisions = taskState(runtime.docHandle.doc(), taskId).revisions
      const prepared = prepareOperation(runtime.docHandle.doc(), { operationId: `bench-${i}`, actorId: ACTORS[i % 4].id, type, payload },
        { replicaId: 'bench-replica', timestamp: new Date(1700000000000 + i * 1000).toISOString() })
      // The signing write path, then the real barrier: one acknowledged operation at a time, as the product saves them.
      runtime.boardChange(prepared.change)
      await runtime.repo.flush([runtime.docHandle.documentId])
      if (type === 'task.create') tasks.push(prepared.event.result.taskId)
      if ((i + 1) % 1000 === 0) console.error(`built ${i + 1}: ${uptime()}`)
    }
    // Every signature in the signature document, every change checked and derived, both documents saved.
    const attribution = runtime.attribution
    const idle = () => !attribution.outbox.length && !attribution.queue.length && !attribution.repairs.size && attribution.log.complete && !attribution.log.unsaved.length
    while (!idle() || attribution.summary().signed < attribution.summary().changes) await delay(20)
    await runtime.repo.flush(runtime.workspace.documents())
    const changes = getChangesMetaSince(runtime.docHandle.doc(), []).length
    const fixture = { size, seed: SEED, changes, signed: attribution.summary().signed, heads: getHeads(runtime.docHandle.doc()),
      node: process.version, builtAt: new Date().toISOString(), buildSeconds: (performance.now() - began) / 1000 }
    await runtime.close()
    // A throwaway fixture key, kept beside the fixture and outside its storage directory; never passed as an argument.
    await writeFile(join(root, 'project.json'), JSON.stringify({ owner: machineKeyPem(project.owner), genesis: project.genesis }), { mode: 0o600 })
    await writeFile(join(root, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`)
  } catch (error) {
    await runtime.close().catch(() => {})
    throw error
  }
}

// ---- Worker: one open of one copy, with each phase timed where it happens ----

async function openWorker({ directory, mode, project, checkout, upstream }) {
  const lib = name => import(pathToFileURL(join(checkout, 'lib', name)).href)
  const { WorkspaceRuntime } = await lib('workspace-runtime.js')
  const { DurableRepo } = await lib('durable-repo.js')
  const { NodeFSStorageAdapter } = await lib('nodefs-storage-adapter.js')
  const { ChangeAttribution } = await lib('attribution.js')
  const { ChangeLog } = await lib('change-log.js')
  const { Workspace } = await lib('workspace.js')
  const { machineKeyFromPem } = await lib('machine-key.js')
  const importsMs = performance.now() - started

  // Spans are keyed by the stage they ran in, so work repeated later (a save, a derivation) is never counted as open time.
  let stage = 'init', runtime = null, firstFind = null
  const spans = {}, stored = {}, workSlices = [], deriveSlices = []
  const add = (name, ms) => { spans[`${stage}.${name}`] = (spans[`${stage}.${name}`] ?? 0) + ms }
  const documentName = id => (id === runtime?.signaturesId ? 'signatures' : 'board')
  const timed = (proto, method, name, each = null) => {
    const original = proto[method]
    proto[method] = function (...callArgs) {
      const label = typeof name === 'function' ? name.apply(this, callArgs) : name
      const at = performance.now()
      const done = () => { const ms = performance.now() - at; add(label, ms); each?.(ms) }
      let result
      try { result = original.apply(this, callArgs) } catch (error) { done(); throw error }
      if (typeof result?.then === 'function') return result.then(value => { done(); return value }, error => { done(); throw error })
      done()
      return result
    }
  }
  timed(DurableRepo.prototype, 'find', function (url) {
    firstFind ??= performance.now()
    if (!this.benchListening) {
      this.benchListening = true
      this.on('doc-metrics', event => { if (event.type === 'doc-loaded') add(`decode.${documentName(event.documentId)}`, event.durationMillis) })
      // The comparison loader: the pinned upstream one, which also seeds upstream's own save bookkeeping.
      if (upstream) this.storageSubsystem.loadDoc = Object.getPrototypeOf(this.storageSubsystem).loadDoc.bind(this.storageSubsystem)
    }
    return `find.${documentName(String(url).replace('automerge:', ''))}`
  })
  const loadRange = NodeFSStorageAdapter.prototype.loadRange
  NodeFSStorageAdapter.prototype.loadRange = async function (prefix) {
    const at = performance.now()
    const chunks = await loadRange.call(this, prefix)
    if (prefix[1] === 'snapshot' || prefix[1] === 'incremental') {
      const name = documentName(prefix[0])
      add(`read.${name}`, performance.now() - at)
      const entry = stored[name] ??= { snapshotBytes: 0, incrementalBytes: 0, snapshots: 0, incrementals: 0 }
      for (const chunk of chunks) {
        if (!chunk.data) continue
        entry[`${prefix[1]}Bytes`] += chunk.data.length
        entry[`${prefix[1]}s`]++
      }
    }
    return chunks
  }
  timed(WorkspaceRuntime.prototype, 'adoptActor', handle => `actor.${documentName(handle.documentId)}`)
  timed(WorkspaceRuntime.prototype, 'startAttribution', 'attribution')
  timed(WorkspaceRuntime.prototype, 'startChangeLog', 'attribution')
  timed(WorkspaceRuntime.prototype, 'harvestRecords', 'harvest')
  timed(DurableRepo.prototype, 'flush', 'flush')
  timed(ChangeAttribution.prototype, 'indexBoard', 'attribution.index')
  timed(ChangeLog.prototype, 'load', 'attribution.storedEntries')
  timed(Workspace.prototype, 'snapshot', 'snapshot')
  timed(ChangeAttribution.prototype, 'work', 'work', ms => workSlices.push(ms))
  timed(ChangeLog.prototype, 'slice', 'derive', ms => deriveSlices.push(ms))
  timed(ChangeLog.prototype, 'save', 'deriveSave')
  timed(ChangeAttribution.prototype, 'checkBatch', 'check')
  timed(ChangeAttribution.prototype, 'restoreMissing', 'repair')
  timed(ChangeAttribution.prototype, 'resolveConflictedShards', 'shards')

  const signed = mode !== 'standalone'
  if (mode === 'signed-cold') for (const suffix of ['', '-wal', '-shm']) await rm(join(directory, `${SIGNATURE_CACHE_FILE}${suffix}`), { force: true })
  const key = signed ? machineKeyFromPem(JSON.parse(await readFile(project, 'utf8')).owner) : null
  const savedBytes = await bytes(join(directory, 'repo'))
  const loadBefore = load(), uptimeBefore = uptime()
  const cpu = () => { const { user, system } = process.cpuUsage(); return (user + system) / 1000 }
  const rss = () => process.resourceUsage().maxRSS / 1024
  runtime = new WorkspaceRuntime({ directory, role: 'hub', actors: ACTORS, machineKey: key })
  try {
    const initAt = performance.now(), initCpu = cpu()
    await runtime.init()
    const initMs = performance.now() - initAt
    const openMs = performance.now() - started
    const init = { cpuMs: cpu() - initCpu, setup: firstFind - initAt }
    stage = 'view'
    const viewAt = performance.now()
    const snapshot = runtime.getDoc()
    const viewMs = performance.now() - viewAt
    const usableMs = performance.now() - started
    const peakRssAtView = rss()
    const loadAtView = load(), uptimeAtView = uptime()

    // What main does after the board is open: check signatures and derive Activity, in slices.
    stage = 'background'
    const attribution = runtime.attribution
    const settled = () => (attribution
      ? !attribution.queue.length && !attribution.repairs.size && !attribution.resolveShards.size && attribution.log.complete && !attribution.log.unsaved.length && !attribution.workTimer
      : runtime.changeLog.complete)
    const backgroundAt = performance.now(), backgroundCpu = cpu()
    while (!settled()) {
      if (performance.now() - backgroundAt > 900000) throw new Error('background checking did not settle in 15 minutes')
      await delay(2)
    }
    const background = { wallMs: performance.now() - backgroundAt, cpuMs: cpu() - backgroundCpu, afterOpenMs: performance.now() - started - openMs,
      workSlices: workSlices.length, workMs: workSlices.reduce((sum, ms) => sum + ms, 0), longestWorkSliceMs: Math.max(0, ...workSlices),
      deriveSlices: deriveSlices.length, longestDeriveSliceMs: Math.max(0, ...deriveSlices), verifications: attribution?.verifications ?? 0,
      summary: attribution ? (({ changes, signed, pending, unattributed, checking }) => ({ changes, signed, pending, unattributed, checking }))(attribution.summary()) : null,
      activityEntries: runtime.getDoc().activity.length }
    const peakRssSettled = rss()

    // The first acknowledged edits after reopen, once nothing else is running: the save bookkeeping is all that differs.
    stage = 'edit'
    const edits = []
    // Sizes are read once the edit's signature is in the signature document and both documents are saved (the
    // signature document is saved in the background), so each size is of a settled directory.
    const saved = () => { const status = runtime.status(); return status.savedLocally && (status.signatures?.savedLocally ?? true) && !attribution?.outbox.length && settled() }
    for (let index = 0; index < 3; index++) {
      const at = performance.now()
      const receipt = await runtime.execute({ operationId: `after-open-${index}`, actorId: 'actor-0', type: 'task.create', payload: { title: `Edit ${index + 1} after reopen` } })
      const ms = performance.now() - at
      while (!saved()) await delay(5)
      await runtime.repo.persistenceQueue
      edits.push({ ms, savedLocally: receipt.savedLocally, settledMs: performance.now() - at, repoBytes: await bytes(join(directory, 'repo')) })
    }
    stage = 'close'
    const closeAt = performance.now()
    await runtime.close()
    const closeMs = performance.now() - closeAt
    console.log(JSON.stringify({ mode, initMs, openMs, viewMs, usableMs, importsMs, init, spans, stored, background, edits, closeMs,
      savedBytes, bytesAfterClose: await bytes(join(directory, 'repo')),
      tasks: Object.keys(snapshot.tasks).length, operations: Object.keys(snapshot.operations).length, boardHeads: snapshot.heads, peakRssMiB: peakRssAtView, peakRssSettledMiB: peakRssSettled, peakRssEndMiB: rss(),
      loadBefore, loadAtView, loadAfter: load(), uptimeBefore, uptimeAtView, uptimeAfter: uptime() }))
  } finally { await runtime.close().catch(() => {}) }
}

// ---- Parent: fixture, load gate, interleaved arms, summaries ----

const child = (params, { quiet = false } = {}) => new Promise((resolveChild, reject) => {
  const worker = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...params], { stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] })
  let output = ''
  worker.stdout.on('data', data => { output += data })
  worker.on('error', reject)
  worker.on('exit', code => (code === 0 ? resolveChild(output) : reject(new Error(`worker ${params[0]} exited ${code}`))))
})

/** Waits until the one-minute load is below `maxLoad`; returns how long that took and the load then. */
async function quiet(maxLoad, waitSeconds) {
  const at = performance.now()
  if (maxLoad === null) return { waitedMs: 0, load: load() }
  for (;;) {
    const now = load()
    if (now[0] < maxLoad) return { waitedMs: performance.now() - at, load: now }
    if (performance.now() - at > waitSeconds * 1000) throw new Error(`one-minute load stayed at or above ${maxLoad} for ${waitSeconds} s (now ${now[0]}); no sample taken`)
    await delay(5000)
  }
}

/** Exclusive phases of one sample, in milliseconds: the open, the first view, then what runs after the board is open. */
function phasesOf(sample) {
  const s = name => sample.spans[name] ?? 0
  const find = name => { const total = s(`init.find.${name}`), read = s(`init.read.${name}`), decode = s(`init.decode.${name}`); return { read, decode, handle: total - read - decode, total } }
  const board = find('board'), signatures = find('signatures')
  const attribution = s('init.attribution')
  const counted = sample.init.setup + board.total + signatures.total + s('init.actor.board') + s('init.actor.signatures') + attribution + s('init.harvest') + s('init.flush')
  return {
    imports: sample.importsMs,
    setup: sample.init.setup,
    boardRead: board.read, boardDecode: board.decode, boardHandle: board.handle, boardActor: s('init.actor.board'),
    signaturesRead: signatures.read, signaturesDecode: signatures.decode, signaturesHandle: signatures.handle, signaturesActor: s('init.actor.signatures'),
    attributionIndex: s('init.attribution.index'), attributionStoredEntries: s('init.attribution.storedEntries'),
    attributionOther: attribution - s('init.attribution.index') - s('init.attribution.storedEntries'),
    harvest: s('init.harvest'), flush: s('init.flush'), initOther: sample.initMs - counted,
    viewSnapshot: s('view.snapshot'), viewActivity: sample.viewMs - s('view.snapshot'),
    backgroundWall: sample.background.wallMs, backgroundCpu: sample.background.cpuMs,
    backgroundDerive: s('background.derive'), backgroundCheck: s('background.check'), backgroundRepair: s('background.repair'),
    backgroundDeriveSave: s('background.deriveSave'), backgroundShards: s('background.shards'),
    longestSlice: Math.max(sample.background.longestWorkSliceMs, sample.background.longestDeriveSliceMs),
  }
}

function summarize(samples) {
  const metrics = {
    openMs: s => s.openMs, initMs: s => s.initMs, viewMs: s => s.viewMs, usableMs: s => s.usableMs, initCpuMs: s => s.init.cpuMs,
    peakRssMiB: s => s.peakRssMiB, peakRssSettledMiB: s => s.peakRssSettledMiB, settledAfterOpenMs: s => s.background.afterOpenMs,
    firstEditMs: s => s.edits[0].ms, secondEditMs: s => s.edits[1].ms, thirdEditMs: s => s.edits[2].ms, closeMs: s => s.closeMs,
    savedBytes: s => s.savedBytes, bytesAfterFirstEdit: s => s.edits[0].repoBytes, bytesAfterSecondEdit: s => s.edits[1].repoBytes,
    bytesAfterThirdEdit: s => s.edits[2].repoBytes, bytesAfterClose: s => s.bytesAfterClose, verifications: s => s.background.verifications,
  }
  const phases = samples.map(phasesOf)
  return {
    samples: samples.length,
    metrics: Object.fromEntries(Object.entries(metrics).map(([name, read]) => [name, summary(samples.map(read))])),
    phases: Object.fromEntries(Object.keys(phases[0]).map(name => [name, summary(phases.map(phase => phase[name]))])),
    loadOneMinute: summary(samples.flatMap(s => [s.loadBefore[0], s.loadAtView[0]])),
    stored: samples[0].stored, attribution: samples[0].background.summary, activityEntries: samples[0].background.activityEntries,
    tasks: samples[0].tasks, operations: samples[0].operations,
  }
}

function report(results) {
  const seconds = value => (value ? `${(value.median / 1000).toFixed(3)} (${(value.min / 1000).toFixed(3)}–${(value.max / 1000).toFixed(3)})` : '—')
  const mib = value => (value ? `${value.median.toFixed(0)} (${value.min.toFixed(0)}–${value.max.toFixed(0)})` : '—')
  const megabytes = value => (value ? (value.median / 1e6).toFixed(2) : '—')
  const lines = []
  for (const [size, modes] of Object.entries(results.sizes)) {
    lines.push(`### ${Number(size).toLocaleString('en-US')} operations`, '',
      '| Mode / arm | Open | First view | Peak RSS MiB | Settled after open | 1st / 2nd / 3rd edit | Repo MB: saved, after each edit, after close | Load |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const [mode, arms] of Object.entries(modes.summaries)) {
      for (const [arm, { metrics: m, loadOneMinute }] of Object.entries(arms)) {
        lines.push(`| ${mode} / ${arm} | ${seconds(m.openMs)} | ${seconds(m.usableMs)} | ${mib(m.peakRssMiB)} | ${seconds(m.settledAfterOpenMs)} | ${(m.firstEditMs.median / 1000).toFixed(3)} / ${(m.secondEditMs.median / 1000).toFixed(3)} / ${(m.thirdEditMs.median / 1000).toFixed(3)} | ${megabytes(m.savedBytes)}, ${megabytes(m.bytesAfterFirstEdit)}, ${megabytes(m.bytesAfterSecondEdit)}, ${megabytes(m.bytesAfterThirdEdit)}, ${megabytes(m.bytesAfterClose)} | ${loadOneMinute.min}–${loadOneMinute.max} |`)
      }
    }
    for (const [mode, arms] of Object.entries(modes.summaries)) {
      const names = Object.keys(arms)
      lines.push('', `Phase medians, ${mode} (seconds):`, '', `| Phase | ${names.join(' | ')} |`, `| --- | ${names.map(() => '---:').join(' | ')} |`)
      for (const phase of Object.keys(arms[names[0]].phases)) {
        lines.push(`| ${phase} | ${names.map(name => (arms[name].phases[phase].median / 1000).toFixed(3)).join(' | ')} |`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const runs = Number(option('--runs', 5))
  const sizes = option('--sizes', '10000').split(',').map(Number)
  const modes = option('--modes', MODES.join(',')).split(',')
  if (modes.some(mode => !MODES.includes(mode))) throw new Error(`modes are ${MODES.join(', ')}`)
  const maxLoad = option('--max-load') === null ? null : Number(option('--max-load'))
  const loadWait = Number(option('--load-wait', 3600))
  const jsonFile = option('--json')
  const baseline = option('--baseline') ? resolve(option('--baseline')) : null
  const extra = args.flatMap((arg, index) => (arg === '--arm' ? [args[index + 1]] : [])).map(spec => ({ name: spec.slice(0, spec.indexOf('=')), checkout: resolve(spec.slice(spec.indexOf('=') + 1)) }))
  const arms = [...(baseline ? [{ name: 'before', checkout: baseline }] : []), ...(args.includes('--upstream') ? [{ name: 'upstream', checkout: here, upstream: true }] : []),
    { name: 'after', checkout: here }, ...extra]
  const revision = checkout => execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const kept = option('--fixture') ? resolve(option('--fixture')) : null
  const root = kept ?? await mkdtemp(join(tmpdir(), 'pardner-bench-open-'))
  const scratch = await mkdtemp(join(tmpdir(), 'pardner-bench-open-run-'))
  const results = { issue: 209, node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, memoryGiB: Math.round(totalmem() / 2 ** 30), seed: SEED,
    started: new Date().toISOString(), runs, maxLoad, arms: arms.map(arm => ({ name: arm.name, revision: revision(arm.checkout), loader: arm.upstream ? 'upstream' : 'checkout' })), sizes: {} }
  try {
    for (const size of sizes) {
      const fixture = join(root, `fixture-${size}`)
      let built = null
      try { built = JSON.parse(await readFile(join(fixture, 'fixture.json'), 'utf8')) } catch { /* Built below. */ }
      if (!built || built.size !== size || built.seed !== SEED) {
        await rm(fixture, { recursive: true, force: true })
        await mkdir(fixture, { recursive: true })
        await child(['--build', fixture, String(size)])
        built = JSON.parse(await readFile(join(fixture, 'fixture.json'), 'utf8'))
      }
      const hub = join(fixture, 'hub')
      const entry = results.sizes[size] = { fixture: { ...built, repoBytes: await bytes(join(hub, 'repo')), signatureCacheBytes: (await stat(join(hub, SIGNATURE_CACHE_FILE))).size },
        samples: [], summaries: {} }
      for (let run = 0; run < runs; run++) {
        for (const mode of modes) {
          // Alternating order, so neither arm always runs first or always runs on a warmer machine.
          for (const arm of run % 2 ? [...arms].reverse() : arms) {
            const gate = await quiet(maxLoad, loadWait)
            const directory = join(scratch, `open-${size}-${mode}-${arm.name}-${run}`)
            await cp(hub, directory, { recursive: true })
            try {
              const output = await child(['--open', directory, '--mode', mode, '--project', join(fixture, 'project.json'), '--checkout', arm.checkout, ...(arm.upstream ? ['--upstream-loader'] : [])])
              const sample = { size, run: run + 1, arm: arm.name, gate, ...JSON.parse(output) }
              entry.samples.push(sample)
              if (jsonFile) await appendFile(`${jsonFile}.samples.jsonl`, `${JSON.stringify(sample)}\n`)
              console.error(`${size} ${mode} ${arm.name} run ${run + 1}: open ${(sample.openMs / 1000).toFixed(3)} s, view ${(sample.usableMs / 1000).toFixed(3)} s, load ${sample.loadBefore[0]}→${sample.loadAtView[0]}`)
            } finally { await rm(directory, { recursive: true, force: true }) }
          }
        }
      }
      for (const mode of modes) {
        entry.summaries[mode] = Object.fromEntries(arms.map(arm => [arm.name, summarize(entry.samples.filter(sample => sample.mode === mode && sample.arm === arm.name))]))
      }
    }
    results.finished = new Date().toISOString()
    // The summaries and one line per sample; every sample in full is in the .samples.jsonl file beside it.
    const row = s => ({ mode: s.mode, arm: s.arm, run: s.run, openMs: s.openMs, usableMs: s.usableMs, peakRssMiB: s.peakRssMiB, settledAfterOpenMs: s.background.afterOpenMs,
      firstEditMs: s.edits[0].ms, bytesAfterFirstEdit: s.edits[0].repoBytes, loadBefore: s.loadBefore, loadAtView: s.loadAtView, waitedForLoadMs: Math.round(s.gate.waitedMs), uptimeBefore: s.uptimeBefore })
    const compact = { ...results, sizes: Object.fromEntries(Object.entries(results.sizes).map(([size, entry]) => [size, { ...entry, samples: entry.samples.map(row) }])) }
    if (jsonFile) await writeFile(jsonFile, `${JSON.stringify(compact, null, 2)}\n`)
    process.stdout.write(`${report(results)}\n`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
    if (!kept) await rm(root, { recursive: true, force: true })
  }
}

if (args[0] === '--build') await buildFixture(args[1], Number(args[2]))
else if (args[0] === '--open') await openWorker({ directory: args[1], mode: option('--mode'), project: option('--project'), checkout: option('--checkout', here), upstream: args.includes('--upstream-loader') })
else await main()
