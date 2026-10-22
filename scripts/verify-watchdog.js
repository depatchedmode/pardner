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

function processTable() {
  const output = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,lstart=,command='], { encoding: 'utf8' })
  return output.split('\n').filter(Boolean).map(line => {
    const [, pid, ppid, pgid, started, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.*)$/)
    return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), started, command }
  })
}
const pause = ms => new Promise(done => setTimeout(done, ms))
const scratch = () => readdirSync(tmpdir(), { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.startsWith('pardner-')).map(entry => entry.name).sort()

export async function runWithWatchdog({ command, args, timeout, grace = 10, log, record }) {
  const startedAt = new Date()
  const result = {
    schemaVersion: 1, command, args, cwd: process.cwd(), node: process.version,
    startedAt: startedAt.toISOString(), timeoutSeconds: timeout, timedOut: false,
    exitCode: null, signal: null, hungProcesses: [], survivorsAfterKill: [],
    scratchRoot: tmpdir(), scratchBefore: scratch(),
  }
  const owned = new Map()
  const refresh = () => {
    const table = processTable()
    const roots = table.filter(row => owned.get(row.pid)?.started === row.started)
    for (const row of roots.flatMap(root => descendants(root.pid, table))) owned.set(row.pid, row)
    return table.filter(row => owned.get(row.pid)?.started === row.started)
  }
  const signal = (rows, name) => {
    const live = new Map(processTable().map(row => [row.pid, row]))
    for (const row of rows) {
      if (live.get(row.pid)?.started !== row.started) continue
      try { process.kill(row.pid, name) } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  const fd = openSync(log, 'w', 0o600)
  let timer, poll, child, interrupted
  const onInterrupt = name => interrupted?.({ interrupted: name })
  const onTerm = () => onInterrupt('SIGTERM')
  const onInt = () => onInterrupt('SIGINT')
  try {
    child = spawn(command, args, { detached: true, stdio: ['ignore', fd, fd] })
    result.pid = child.pid ?? null
    const exited = new Promise(done => {
      child.once('error', error => done({ error: error.message }))
      child.once('exit', (exitCode, signal) => done({ exitCode, signal }))
    })
    if (child.pid) {
      const table = processTable()
      for (const row of table.filter(row => row.pid === child.pid || row.pgid === child.pid)) owned.set(row.pid, row)
      refresh()
      poll = setInterval(refresh, 250)
    }
    process.on('SIGTERM', onTerm)
    process.on('SIGINT', onInt)
    const outcome = await Promise.race([
      exited,
      new Promise(done => { timer = setTimeout(() => done({ timedOut: true }), timeout * 1000) }),
      new Promise(done => { interrupted = done }),
    ])
    clearTimeout(timer)
    clearInterval(poll)
    Object.assign(result, outcome)
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
  } finally {
    clearTimeout(timer)
    clearInterval(poll)
    process.off('SIGTERM', onTerm)
    process.off('SIGINT', onInt)
    closeSync(fd)
  }
  result.scratchAfter = scratch()
  result.newScratch = result.scratchAfter.filter(name => !result.scratchBefore.includes(name))
  result.durationMs = Date.now() - startedAt.getTime()
  if (record) writeFileSync(record, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWithWatchdog(parseArguments(process.argv.slice(2)))
    console.error(`[verify-watchdog] ${result.timedOut ? 'timed out' : result.error ?? `exit ${result.exitCode ?? result.signal}`}; log: ${process.argv[process.argv.indexOf('--log') + 1]}`)
    process.exitCode = result.timedOut ? 124 : result.interrupted ? 130
      : result.orphansAfterExit?.length || result.survivorsAfterKill.length ? 1 : result.exitCode ?? 1
  } catch (error) {
    console.error(`[verify-watchdog] ${error.message}`)
    process.exitCode = 2
  }
}
