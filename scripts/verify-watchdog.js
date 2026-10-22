#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = 'Usage: node scripts/verify-watchdog.js --timeout SECONDS --log FILE [--record FILE] [--grace SECONDS] -- COMMAND [ARGS...]'

export function parseArguments(argv) {
  const separator = argv.indexOf('--')
  if (separator < 0 || separator === argv.length - 1) throw new Error(usage)
  const options = { grace: 10 }
  const flags = argv.slice(0, separator)
  for (let index = 0; index < flags.length; index += 2) {
    const [name, value] = [flags[index], flags[index + 1]]
    if (!['--timeout', '--log', '--record', '--grace'].includes(name) || value === undefined) throw new Error(usage)
    options[name.slice(2)] = value
  }
  options.timeout = Number(options.timeout)
  options.grace = Number(options.grace)
  if (!(options.timeout > 0) || !(options.grace >= 0) || !options.log) throw new Error(usage)
  return { ...options, command: argv[separator + 1], args: argv.slice(separator + 2) }
}

// Every process descended from root, including members of a different process group
// such as detached browsers, plus any process still in root's own group.
export function descendants(rootPid, table = processTable()) {
  const found = new Map()
  let frontier = [rootPid]
  while (frontier.length) {
    const next = []
    for (const row of table) {
      if (frontier.includes(row.ppid) && !found.has(row.pid)) { found.set(row.pid, row); next.push(row.pid) }
    }
    frontier = next
  }
  for (const row of table) if (row.pgid === rootPid && row.pid !== rootPid) found.set(row.pid, row)
  return [...found.values()]
}

function processTable() {
  const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,etime=,command='], { encoding: 'utf8' })
  return output.split('\n').filter(Boolean).map(line => {
    const [, pid, ppid, pgid, elapsed, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), elapsed, command }
  })
}

function signal(pids, name) {
  for (const pid of pids) {
    try { process.kill(pid, name) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}

export async function runWithWatchdog({ command, args, timeout, grace, log, record }) {
  const startedAt = new Date()
  const output = createWriteStream(log)
  const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { output.write(chunk); process.stdout.write(chunk) })
  }
  const result = {
    schemaVersion: 1, command, args, cwd: process.cwd(), node: process.version, pid: child.pid,
    startedAt: startedAt.toISOString(), timeoutSeconds: timeout, timedOut: false,
    exitCode: null, signal: null, hungProcesses: [], survivorsAfterKill: [],
  }
  const deadline = setTimeout(async () => {
    result.timedOut = true
    result.hungProcesses = [{ pid: child.pid, command: [command, ...args].join(' ') }, ...descendants(child.pid)]
    const pids = result.hungProcesses.map(row => row.pid)
    signal(pids, 'SIGTERM')
    await new Promise(done => setTimeout(done, grace * 1000))
    const remaining = new Set(processTable().map(row => row.pid))
    signal(pids.filter(pid => remaining.has(pid)), 'SIGKILL')
    await new Promise(done => setTimeout(done, 500))
    const after = new Set(processTable().map(row => row.pid))
    result.survivorsAfterKill = pids.filter(pid => after.has(pid))
  }, timeout * 1000)
  const [exitCode, exitSignal] = await new Promise(done => child.once('exit', (code, name) => done([code, name])))
  clearTimeout(deadline)
  // An exited root can still leave descendants holding ports or files.
  if (!result.timedOut) {
    const orphans = processTable().filter(row => row.pgid === child.pid)
    if (orphans.length) {
      result.orphansAfterExit = orphans
      signal(orphans.map(row => row.pid), 'SIGKILL')
    }
  }
  await new Promise(done => output.end(done))
  Object.assign(result, { exitCode, signal: exitSignal, durationMs: Date.now() - startedAt.getTime() })
  if (record) writeFileSync(record, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWithWatchdog(parseArguments(process.argv.slice(2)))
    const summary = result.timedOut ? `timed out after ${result.timeoutSeconds}s; terminated ${result.hungProcesses.length} owned process(es)` : `exit ${result.exitCode ?? result.signal}`
    console.error(`[verify-watchdog] ${summary}`)
    process.exitCode = result.timedOut ? 124 : (result.exitCode ?? 1)
  } catch (error) {
    console.error(`[verify-watchdog] ${error.message}`)
    process.exitCode = 2
  }
}
