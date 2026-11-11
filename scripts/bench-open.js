#!/usr/bin/env node
// Synthetic data only. Every timed open runs in a new process against a fresh copy.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, rm, cp, readdir, stat } from 'node:fs/promises'
import { tmpdir, loadavg } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const started = performance.now()
const args = process.argv.slice(2)
const worker = args[0] === '--open'
const build = args[0] === '--build'
const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim()
const script = fileURLToPath(import.meta.url)

if (worker || build) {
  const { WorkspaceRuntime } = await import('../lib/workspace-runtime.js')
  const { taskState } = await import('../lib/workspace-schema.js')
  const { prepareOperation } = await import('../lib/workspace-commands.js')
  const { DurableRepo } = await import('../lib/durable-repo.js')
  const { NodeFSStorageAdapter } = await import('../lib/nodefs-storage-adapter.js')
  const { getHeads } = await import('@automerge/automerge')
  const phases = { imports: performance.now() - started, storageRead: 0, decode: 0, find: 0, flush: 0 }
  const loadBefore = loadavg(), uptimeBefore = uptime()
  const originalFind = DurableRepo.prototype.find
  DurableRepo.prototype.find = async function (...args) {
    const start = performance.now()
    this.on('doc-metrics', m => { if (m.type === 'doc-loaded') phases.decode += m.durationMillis })
    try { return await originalFind.apply(this, args) } finally { phases.find += performance.now() - start }
  }
  const originalLoad = NodeFSStorageAdapter.prototype.loadRange
  NodeFSStorageAdapter.prototype.loadRange = async function (...args) {
    const start = performance.now()
    try { return await originalLoad.apply(this, args) } finally { phases.storageRead += performance.now() - start }
  }
  const originalFlush = DurableRepo.prototype.flush
  DurableRepo.prototype.flush = async function (...args) {
    const start = performance.now()
    try { return await originalFlush.apply(this, args) } finally { phases.flush += performance.now() - start }
  }
  const directory = args[1]
  const actors = Array.from({ length: 4 }, (_, i) => ({ id: `actor-${i}`, handle: `actor${i}`, kind: i < 2 ? 'human' : 'agent' }))
  const runtime = new WorkspaceRuntime({ directory, actors })
  try {
    await runtime.init()
    const openMs = performance.now() - started
    if (build) {
      let seed = 209
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
      const words = 'review task board change service storage local agent human comment record update project branch test evidence persist merge retry offline queue design read write runtime process request response field title description issue link work item document'.split(' ')
      const prose = length => { let result = ''; while (result.length < length) result += `${words[Math.floor(random() * words.length)]} `; return result.slice(0, length) }
      const tasks = []
      for (let i = 0; i < Number(args[2]); i++) {
        const kind = i % 100
        const taskId = tasks[Math.floor(random() * tasks.length)]
        let type, payload
        if (kind < 20) { type = 'task.create'; payload = { title: prose(45), description: prose(2000) } }
        else if (kind < 65) { type = 'comment.add'; payload = { taskId, text: prose(100 + Math.floor(random() * 500)) + (i % 10 === 0 ? ' @actor2' : '') } }
        else if (kind < 85) { type = 'task.update'; payload = { taskId, updates: { priority: `p${i % 4}` } } }
        else if (kind < 95) { type = 'task.update'; payload = { taskId, updates: { description: prose(2000) } } }
        else { type = 'task.link-issue'; payload = { taskId, repository: 'example/benchmark', number: i + 1 } }
        if (type === 'task.update') payload.expectedRevisions = taskState(runtime.docHandle.doc(), taskId).revisions
        const prepared = prepareOperation(runtime.docHandle.doc(), { operationId: `bench-${i}`, actorId: actors[i % 4].id, type, payload },
          { replicaId: 'bench-replica', timestamp: new Date(1700000000000 + i * 1000).toISOString() })
        runtime.docHandle.change(prepared.change)
        await runtime.repo.flush([runtime.docHandle.documentId])
        if (type === 'task.create') tasks.push(prepared.event.result.taskId)
        if ((i + 1) % 1000 === 0) console.error(`built ${i + 1}: ${uptime()}`)
      }
    } else {
      const snapshot = runtime.getDoc()
      const usableMs = performance.now() - started
      console.log(JSON.stringify({ openMs, usableMs, phases, snapshotMs: usableMs - openMs,
        tasks: Object.keys(snapshot.tasks).length, operations: Object.keys(snapshot.operations).length,
        heads: getHeads(runtime.docHandle.doc()), peakRssMiB: process.resourceUsage().maxRSS / 1024,
        loadBefore, loadAfter: loadavg(), uptimeBefore, uptimeAfter: uptime() }))
    }
  } finally { await runtime.close() }
} else {
  const runs = Number(args[args.indexOf('--runs') + 1]) || 5
  const sizes = args.includes('--sizes') ? args[args.indexOf('--sizes') + 1].split(',').map(Number) : [1000, 10000]
  const root = await mkdtemp(join(tmpdir(), 'pardner-bench-open-'))
  const child = params => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script, ...params], { stdio: ['ignore', 'pipe', 'inherit'] })
    let output = ''; p.stdout.on('data', data => { output += data })
    p.on('error', reject); p.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`worker exited ${code}`)))
  })
  const bytes = async path => { let total = 0; for (const entry of await readdir(path, { withFileTypes: true })) { const p = join(path, entry.name); total += entry.isDirectory() ? await bytes(p) : (await stat(p)).size }; return total }
  const summary = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return { median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, min: sorted[0], max: sorted.at(-1) } }
  try {
    for (const size of sizes) {
      const fixture = join(root, `fixture-${size}`)
      await child(['--build', fixture, String(size)])
      const savedBytes = await bytes(join(fixture, 'repo'))
      const samples = []
      for (let i = 0; i < runs; i++) {
        const directory = join(root, `open-${size}-${i}`)
        await cp(fixture, directory, { recursive: true })
        const sample = JSON.parse(await child(['--open', directory]))
        samples.push(sample); console.log(JSON.stringify({ size, run: i + 1, savedBytes, ...sample }))
        await rm(directory, { recursive: true, force: true })
      }
      const lowLoad = [...samples].sort((a, b) => Math.max(a.loadBefore[0], a.loadAfter[0]) - Math.max(b.loadBefore[0], b.loadAfter[0])).slice(0, Math.min(3, runs))
      console.log(JSON.stringify({ size, savedBytes, summary: Object.fromEntries(['openMs', 'usableMs', 'snapshotMs', 'peakRssMiB'].map(k => [k, summary(samples.map(s => s[k]))])), phases: Object.fromEntries(Object.keys(samples[0].phases).map(k => [k, summary(samples.map(s => s.phases[k]))])), lowestLoadUsableMs: summary(lowLoad.map(s => s.usableMs)) }))
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}
