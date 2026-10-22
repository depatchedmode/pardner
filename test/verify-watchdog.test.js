import { it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { descendants, parseArguments, runWithWatchdog } from '../scripts/verify-watchdog.js'

const script = fileURLToPath(new URL('../scripts/verify-watchdog.js', import.meta.url))
const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pardner-watchdog-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

it('records a normal exit, its output, and does not report hung processes', async t => {
  const directory = scratch(t)
  const result = await runWithWatchdog({ command: process.execPath, args: ['-e', 'console.log("done"); process.exit(3)'],
    timeout: 20, grace: 1, log: join(directory, 'run.log'), record: join(directory, 'run.json') })
  assert.equal(result.exitCode, 3)
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
  assert.equal(result.timedOut, false)
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
