import { it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { descendants, exitCodes, parseArguments, runWithWatchdog } from '../scripts/verify-watchdog.js'

const script = fileURLToPath(new URL('../scripts/verify-watchdog.js', import.meta.url))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pardner-watchdog-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}
// A `ps` ahead of the real one on PATH that answers `limit` enumerations and then fails like a
// sandbox that denies process inspection. The watchdog resolves `ps` through PATH.
function denyingPs(directory, limit) {
  const bin = join(directory, 'bin')
  const counter = join(directory, 'ps-calls')
  writeFileSync(join(directory, 'ps-limit'), String(limit))
  const script = `#!/bin/sh
count=$(cat "${counter}" 2>/dev/null || echo 0); count=$((count+1)); echo "$count" > "${counter}"
if [ "$count" -gt "$(cat "${directory}/ps-limit")" ]; then echo "ps: Operation not permitted" >&2; exit 1; fi
exec /bin/ps "$@"
`
  mkdirSync(bin)
  writeFileSync(join(bin, 'ps'), script)
  chmodSync(join(bin, 'ps'), 0o755)
  return { PATH: `${bin}:${process.env.PATH}`, calls: () => Number(readFileSync(counter, 'utf8')) }
}
const watchdog = (directory, env, timeout, command) => spawnSync(process.execPath, [script, '--timeout', String(timeout), '--grace', '1',
  '--log', join(directory, 'run.log'), '--record', join(directory, 'run.json'), '--', process.execPath, '-e', command],
{ encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env } })

it('records a normal exit, its output, and does not report hung processes', async t => {
  const directory = scratch(t)
  const result = await runWithWatchdog({ command: process.execPath, args: ['-e', 'console.log("done"); process.exit(3)'],
    timeout: 20, grace: 1, log: join(directory, 'run.log'), record: join(directory, 'run.json') })
  assert.equal(result.exitCode, 3)
  assert.equal(result.outcome, 'completed')
  assert.equal(result.childStarted, true)
  assert.equal(result.timedOut, false)
  assert.deepEqual(result.hungProcesses, [])
  assert.match(readFileSync(join(directory, 'run.log'), 'utf8'), /done/)
  assert.equal(JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8')).exitCode, 3)
})

it('terminates a hung command with same-group and detached descendants and records them', { timeout: 30000 }, async t => {
  const directory = scratch(t)
  const pids = join(directory, 'pids.json')
  // A child in the same process group and a detached grandchild in its own group, like a browser.
  const program = `
    const { spawn } = require('node:child_process')
    const fs = require('node:fs')
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    const detached = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
    fs.writeFileSync(${JSON.stringify(pids)}, JSON.stringify([child.pid, detached.pid]))
    setInterval(() => {}, 1000)`
  const run = spawnSync(process.execPath, [script, '--timeout', '3', '--grace', '1', '--log', join(directory, 'run.log'),
    '--record', join(directory, 'run.json'), '--', process.execPath, '-e', program], { encoding: 'utf8', timeout: 15000 })
  assert.equal(run.status, 124, run.stderr)
  assert.match(run.stderr, /timed out/)
  const record = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  const [child, detached] = JSON.parse(readFileSync(pids, 'utf8'))
  t.after(() => { for (const pid of [child, detached]) try { process.kill(pid, 'SIGKILL') } catch {} })
  assert.equal(record.timedOut, true)
  const recorded = record.hungProcesses.map(row => row.pid)
  assert.ok(recorded.includes(record.pid) && recorded.includes(child) && recorded.includes(detached), JSON.stringify(record.hungProcesses))
  assert.deepEqual(record.survivorsAfterKill, [])
  assert.equal(alive(child), false)
  assert.equal(alive(detached), false)
})

it('finds descendants by parent chain and process group', () => {
  const table = [
    { pid: 10, ppid: 1, pgid: 10 }, { pid: 11, ppid: 10, pgid: 10 }, { pid: 12, ppid: 11, pgid: 12 },
    { pid: 13, ppid: 1, pgid: 10 }, { pid: 14, ppid: 1, pgid: 14 },
  ]
  assert.deepEqual(descendants(10, table).map(row => row.pid).sort(), [11, 12, 13])
})

it('rejects incomplete invocations', () => {
  for (const args of [[], ['--timeout', '1', '--', 'x'], ['--log', 'x', '--', 'y'], ['--timeout', '0', '--log', 'x', '--', 'y'], ['--timeout', '1', '--log', 'x', '--']]) {
    assert.throws(() => parseArguments(args), /Usage/)
  }
  assert.deepEqual(parseArguments(['--timeout', '5', '--log', 'l', '--', 'cmd', '--flag']),
    { grace: 10, timeout: 5, log: 'l', command: 'cmd', args: ['--flag'] })
})

it('waits for forced cleanup before writing the report', { timeout: 20000 }, async t => {
  const directory = scratch(t)
  const result = await runWithWatchdog({ command: process.execPath,
    args: ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    timeout: 1, grace: 0.2, log: join(directory, 'run.log'), record: join(directory, 'run.json') })
  assert.equal(result.timedOut, true)
  assert.equal(result.signal, 'SIGKILL')
  assert.equal(alive(result.pid), false)
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8')).survivorsAfterKill, [])
})

it('records an executable that cannot be spawned without hanging', async t => {
  const directory = scratch(t)
  const result = await runWithWatchdog({ command: join(directory, 'absent'), args: [],
    timeout: 2, grace: 0, log: join(directory, 'run.log'), record: join(directory, 'run.json') })
  assert.match(result.error, /ENOENT/)
  assert.equal(result.outcome, 'spawn-failed')
  assert.equal(result.childStarted, false)
  assert.equal(result.timedOut, false)
  assert.equal(JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8')).outcome, 'spawn-failed')
})

it('starts nothing when the process table cannot be read before the spawn', t => {
  const directory = scratch(t)
  const marker = join(directory, 'started')
  const run = watchdog(directory, { PATH: denyingPs(directory, 0).PATH }, 5, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`)
  assert.equal(run.status, exitCodes.unsupervised, run.stderr)
  assert.match(run.stderr, /preflight-failed/)
  assert.match(run.stderr, /Operation not permitted/)
  const record = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  assert.equal(record.outcome, 'preflight-failed')
  assert.equal(record.childStarted, false)
  assert.equal(record.pid, null)
  assert.match(record.error, /Process enumeration failed/)
  assert.equal(existsSync(marker), false, 'the command must not run unsupervised')
  assert.equal(existsSync(join(directory, 'run.log')), false, 'no log is opened before the preflight passes')
})

it('records a later enumeration failure and reclaims only the child process group', { timeout: 30000 }, t => {
  const directory = scratch(t)
  const pids = join(directory, 'pids.json')
  // Preflight and the first sample succeed; the sampler then loses permission while the command runs.
  const ps = denyingPs(directory, 4)
  const program = `
    const { spawn } = require('node:child_process')
    const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    require('node:fs').writeFileSync(${JSON.stringify(pids)}, JSON.stringify([process.pid, sibling.pid]))
    setInterval(() => {}, 1000)`
  const run = watchdog(directory, { PATH: ps.PATH }, 20, program)
  const [child, sibling] = JSON.parse(readFileSync(pids, 'utf8'))
  t.after(() => { for (const pid of [child, sibling]) try { process.kill(pid, 'SIGKILL') } catch {} })
  assert.equal(run.status, exitCodes.unsupervised, run.stderr)
  assert.match(run.stderr, /supervision-failed/)
  const record = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  assert.equal(record.outcome, 'supervision-failed')
  assert.equal(record.childStarted, true)
  assert.equal(record.pid, child)
  assert.match(record.error, /Process enumeration failed .*Operation not permitted/)
  assert.equal(record.timedOut, false)
  assert.deepEqual(record.cleanup.method, 'process-group')
  assert.equal(record.cleanup.groupId, child)
  assert.equal(record.cleanup.signals[0], 'SIGTERM')
  assert.equal(record.cleanup.childExited, true)
  assert.equal(record.signal, 'SIGTERM')
  assert.equal(alive(child), false)
  assert.equal(alive(sibling), false, 'same-group members are reclaimed with the group')
  assert.ok(ps.calls() > 4, 'enumeration was attempted after the spawn')
  assert.deepEqual(record.unverifiedProcesses, [], 'nothing outside the group was observed, so nothing was left unverified')
})

it('leaves observed processes outside the child group alone when it cannot re-verify them', { timeout: 30000 }, t => {
  const directory = scratch(t)
  const pids = join(directory, 'pids.json')
  const ps = denyingPs(directory, 6)
  // A detached grandchild in its own group, like a browser, observed by the first samples.
  const program = `
    const { spawn } = require('node:child_process')
    const detached = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
    require('node:fs').writeFileSync(${JSON.stringify(pids)}, JSON.stringify([process.pid, detached.pid]))
    setInterval(() => {}, 1000)`
  const run = watchdog(directory, { PATH: ps.PATH }, 20, program)
  const [child, detached] = JSON.parse(readFileSync(pids, 'utf8'))
  t.after(() => { for (const pid of [child, detached]) try { process.kill(pid, 'SIGKILL') } catch {} })
  assert.equal(run.status, exitCodes.unsupervised, run.stderr)
  const record = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  assert.equal(record.outcome, 'supervision-failed')
  assert.equal(alive(child), false)
  assert.ok(record.unverifiedProcesses.some(row => row.pid === detached), JSON.stringify(record.unverifiedProcesses))
  assert.equal(alive(detached), true, 'an observed process that cannot be re-verified is reported, never signalled')
})

it('reclaims an observed detached descendant after the parent exits', { timeout: 20000 }, async t => {
  const directory = scratch(t)
  const pidFile = join(directory, 'pid')
  const program = `const {spawn} = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached:true, stdio:'ignore'});
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    child.unref(); setTimeout(() => process.exit(0), 1000);`
  const result = await runWithWatchdog({ command: process.execPath, args: ['-e', program],
    timeout: 5, grace: 0.2, log: join(directory, 'run.log') })
  const pid = Number(readFileSync(pidFile, 'utf8'))
  t.after(() => { try { process.kill(pid, 'SIGKILL') } catch {} })
  assert.ok(result.orphansAfterExit.some(row => row.pid === pid))
  assert.equal(alive(pid), false)
  assert.deepEqual(result.survivorsAfterKill, [])
})
