#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { openSync, closeSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = 'Usage: node scripts/verify-watchdog.js --timeout SECONDS --log FILE [--record FILE] [--grace SECONDS] -- COMMAND [ARGS...]'
export function parseArguments(argv) {
  const separator = argv.indexOf('--')
  if (separator < 0 || separator === argv.length - 1) throw new Error(usage)
  const options = { grace: 10 }
  const seen = new Set()
  const flags = argv.slice(0, separator)
  for (let index = 0; index < flags.length; index += 2) {
    const [name, value] = [flags[index], flags[index + 1]]
    if (!['--timeout', '--log', '--record', '--grace'].includes(name) || value === undefined || seen.has(name)) throw new Error(usage)
    seen.add(name)
    options[name.slice(2)] = value
  }
  options.timeout = Number(options.timeout)
  options.grace = Number(options.grace)
  if (!Number.isFinite(options.timeout) || options.timeout <= 0 || options.timeout * 1000 > 2147483647
    || !Number.isFinite(options.grace) || options.grace < 0 || options.grace * 1000 > 2147483647 || !options.log) throw new Error(usage)
  if (options.record && resolve(options.record) === resolve(options.log)) throw new Error('Log and record paths must differ')
  return { ...options, command: argv[separator + 1], args: argv.slice(separator + 2) }
}

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

const rowPattern = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.*)$/
function processTable() {
  let output
  try {
    output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,lstart=,command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error(`Process enumeration failed (ps): ${detail}`)
  }
  return output.split('\n').filter(line => line.trim()).map(line => {
    const match = line.match(rowPattern)
    if (!match) throw new Error(`Process enumeration failed: unrecognized ps row "${line.slice(0, 80)}"`)
    const [, pid, ppid, pgid, started, command] = match
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), started, command }
  })
}
const pause = ms => new Promise(done => setTimeout(done, ms))
const scratch = () => readdirSync(tmpdir(), { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith('pardner-')).map(entry => entry.name).sort()

// Exit codes for the CLI. Supervision failures are distinct from the command's own exit status.
export const exitCodes = { timedOut: 124, interrupted: 130, spawnFailed: 127, unsupervised: 3, usage: 2 }

// Supervise one command. Outcomes:
//   completed          the command exited on its own; orphans left behind were reclaimed.
//   timed-out          the timeout elapsed; the owned process tree was terminated.
//   interrupted        the watchdog received SIGTERM/SIGINT; the owned tree was terminated.
//   spawn-failed       the command never started (for example ENOENT).
//   preflight-failed   process enumeration or scratch inspection failed before anything was spawned.
//   supervision-failed enumeration failed after the spawn; only the child's own process group
//                      was signalled, because other observed processes could not be re-verified.
export async function runWithWatchdog({ command, args, timeout, grace = 10, log, record }) {
  const startedAt = new Date()
  const result = {
    schemaVersion: 2, outcome: 'incomplete', command, args, cwd: process.cwd(), node: process.version,
    startedAt: startedAt.toISOString(), timeoutSeconds: timeout, childStarted: false, pid: null, timedOut: false,
    exitCode: null, signal: null, hungProcesses: [], survivorsAfterKill: [], scratchRoot: tmpdir(), scratchBefore: null,
  }
  const finish = () => {
    try { result.scratchAfter = scratch() } catch (error) { result.scratchAfter = null; result.scratchAfterError = error.message }
    result.newScratch = result.scratchAfter?.filter(name => !result.scratchBefore?.includes(name)) ?? null
    result.durationMs = Date.now() - startedAt.getTime()
    if (record) writeFileSync(record, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
    return result
  }
  // Preflight: if the process table cannot be read, a spawned command could not be supervised or reclaimed,
  // so nothing is started.
  try {
    result.scratchBefore = scratch()
    processTable()
  } catch (error) {
    result.outcome = 'preflight-failed'
    result.error = error.message
    return finish()
  }

  const owned = new Map()
  const refresh = () => {
    const table = processTable()
    const roots = table.filter(row => owned.get(row.pid)?.started === row.started)
    for (const row of roots.flatMap(root => descendants(root.pid, table))) owned.set(row.pid, row)
    return table.filter(row => owned.get(row.pid)?.started === row.started)
  }
  const signalErrors = []
  const signal = (rows, name) => {
    const live = new Map(processTable().map(row => [row.pid, row]))
    for (const row of rows) {
      if (live.get(row.pid)?.started !== row.started) continue
      try { process.kill(row.pid, name) } catch (error) { if (error.code !== 'ESRCH') signalErrors.push({ pid: row.pid, signal: name, error: error.message }) }
    }
  }
  const fd = openSync(log, 'w', 0o600)
  let timer, poll, child, interrupted, earlyFailure, failSupervision
  const onInterrupt = name => interrupted?.({ interrupted: name })
  const onTerm = () => onInterrupt('SIGTERM')
  const onInt = () => onInterrupt('SIGINT')
  const childAlive = () => child.exitCode === null && child.signalCode === null
  try {
    child = spawn(command, args, { detached: true, stdio: ['ignore', fd, fd] })
    result.pid = child.pid ?? null
    result.childStarted = Boolean(child.pid)
    const exited = new Promise(done => {
      child.once('error', error => done({ error: error.message, spawnFailed: true }))
      child.once('exit', (exitCode, signal) => done({ exitCode, signal }))
    })
    if (child.pid) {
      try {
        const table = processTable()
        for (const row of table.filter(row => row.pid === child.pid || row.pgid === child.pid)) owned.set(row.pid, row)
        refresh()
      } catch (error) { earlyFailure = { supervisionError: error.message } }
      if (!earlyFailure) {
        poll = setInterval(() => {
          try { refresh() } catch (error) { clearInterval(poll); failSupervision?.({ supervisionError: error.message }) }
        }, 250)
      }
    }
    process.on('SIGTERM', onTerm)
    process.on('SIGINT', onInt)
    const outcome = earlyFailure ?? await Promise.race([
      exited,
      new Promise(done => { timer = setTimeout(() => done({ timedOut: true }), timeout * 1000) }),
      new Promise(done => { interrupted = done }),
      new Promise(done => { failSupervision = done }),
    ])
    clearTimeout(timer)
    clearInterval(poll)
    Object.assign(result, outcome)
    if (outcome.spawnFailed) {
      result.outcome = 'spawn-failed'
    } else if (outcome.supervisionError) {
      result.outcome = 'supervision-failed'
      result.error = outcome.supervisionError
      result.cleanup = await reclaimOwnGroup(child, childAlive, grace)
      if (!childAlive()) Object.assign(result, await exited)
    } else {
      const remaining = refresh()
      if (remaining.length) {
        if (result.timedOut || result.interrupted) result.hungProcesses = remaining
        else result.orphansAfterExit = remaining
        try {
          result.openSockets = execFileSync('lsof', ['-nP', '-a', '-iTCP', '-p', remaining.map(row => row.pid).join(',')], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'pipe'] })
        } catch (error) { result.openSockets = error.stdout?.toString() ?? ''; result.socketSnapshotStatus = error.status ?? error.code }
        signal(remaining, 'SIGTERM')
        const until = Date.now() + grace * 1000
        while (refresh().length && Date.now() < until) await pause(50)
        signal(refresh(), 'SIGKILL')
        const killUntil = Date.now() + 2000
        while (refresh().length && Date.now() < killUntil) await pause(50)
        result.survivorsAfterKill = refresh().map(row => row.pid)
      }
      if (!result.survivorsAfterKill.length) Object.assign(result, await exited)
      result.outcome = result.timedOut ? 'timed-out' : result.interrupted ? 'interrupted' : 'completed'
    }
  } catch (error) {
    // Enumeration or signalling failed during cleanup. Record it and reclaim only the child's own group.
    result.outcome = 'supervision-failed'
    result.error = error.message
    if (child?.pid) result.cleanup = await reclaimOwnGroup(child, childAlive, grace)
  } finally {
    clearTimeout(timer)
    clearInterval(poll)
    process.off('SIGTERM', onTerm)
    process.off('SIGINT', onInt)
    closeSync(fd)
    if (result.outcome === 'supervision-failed') {
      // A successful group signal establishes only the reaped leader's exit. Without ps, observed
      // descendants may have survived or changed groups; include them even if they shared its group.
      result.unverifiedProcesses = [...owned.values()].filter(row => row.pid !== child?.pid || childAlive())
        .map(({ pid, pgid, started, command }) => ({ pid, pgid, started, command }))
    }
    if (signalErrors.length) result.signalErrors = signalErrors
  }
  return finish()
}

// Without a trustworthy process table, the only processes that can be reclaimed safely are the
// child's own process group: the child is the group leader (detached spawn), its liveness is known
// from Node's own reaping, and the group id cannot be reused while the leader is alive.
async function reclaimOwnGroup(child, childAlive, grace) {
  const cleanup = { method: 'process-group', groupId: child.pid, signals: [], childExited: !childAlive() }
  const signalGroup = name => {
    if (!childAlive()) return false
    try { process.kill(-child.pid, name); cleanup.signals.push(name); return true } catch (error) { cleanup.signals.push(`${name}: ${error.message}`); return false }
  }
  const waitUntil = async deadline => { while (childAlive() && Date.now() < deadline) await pause(50) }
  if (signalGroup('SIGTERM')) await waitUntil(Date.now() + grace * 1000)
  if (signalGroup('SIGKILL')) await waitUntil(Date.now() + 2000)
  cleanup.childExited = !childAlive()
  return cleanup
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const result = await runWithWatchdog(options)
    const summary = result.outcome === 'completed' ? `exit ${result.exitCode ?? result.signal}` : result.outcome === 'timed-out' ? 'timed out'
      : `${result.outcome}${result.error ? `: ${result.error}` : ''}`
    console.error(`[verify-watchdog] ${summary}; log: ${options.log}${options.record ? `; record: ${options.record}` : ''}`)
    process.exitCode = result.outcome === 'timed-out' ? exitCodes.timedOut : result.outcome === 'interrupted' ? exitCodes.interrupted
      : result.outcome === 'spawn-failed' ? exitCodes.spawnFailed : result.outcome !== 'completed' ? exitCodes.unsupervised
      : result.orphansAfterExit?.length || result.survivorsAfterKill.length ? 1 : result.exitCode ?? 1
  } catch (error) {
    console.error(`[verify-watchdog] ${error.message}`)
    process.exitCode = exitCodes.usage
  }
}
