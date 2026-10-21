import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { RehearsalScope, coordinatorCommands } from '../support/three-agent-coordinator.js'
import { eventually } from '../support/bridge-rehearsal.js'
import { executeCoordinatorCommand } from '../support/coordinator-process.js'

function deferred() {
  let resolve
  const promise = new Promise(complete => { resolve = complete })
  return { promise, resolve }
}

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-coordinator-'))
  const scope = new RehearsalScope()
  t.after(async () => { await scope.close(); await rm(root, { recursive: true, force: true }) })
  const commands = coordinatorCommands({ scope, root, runId: 'fixture', cliPath: '/fixture/pardner.js',
    data: '/fixture/data', environment: { FIXTURE_SAFE: 'retained' }, convergenceMs: 10000,
    save: async () => {}, ...overrides })
  return { root, scope, ...commands }
}

it('an expired workflow cannot commit or send writes after a stalled context read completes', async t => {
  const started = deferred(), release = deferred(), aborted = deferred(), calls = []
  const coordinator = await fixture(t, { run: async (program, args, options) => {
    calls.push({ program, args })
    options.signal.addEventListener('abort', aborted.resolve, { once: true })
    started.resolve()
    await release.promise
    return { stdout: JSON.stringify({ success: true, revisions: { assignee: [], status: [] } }) }
  } })
  const workflow = (async () => {
    await coordinator.cli(['show', 'parent', '--actor', 'coordinator'])
    await coordinator.execute('git', ['commit', '-m', 'late artifact'])
    await coordinator.handoff('late-review', 'parent', 'reviewer-a', { kind: 'review' })
    await coordinator.comment('late-comment', 'parent', { kind: 'artifact' })
  })()
  const rejected = assert.rejects(workflow, /Timed out waiting for workflow/)
  try {
    await started.promise
    coordinator.scope.setDeadline(Date.now() + 100, 'workflow')
    await aborted.promise
    await rejected
  } finally {
    release.resolve()
    await coordinator.scope.close()
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args[4], 'show')
})

it('cancelling a handoff argument read prevents outbox persistence and submission', async t => {
  const started = deferred(), release = deferred(), calls = []
  const coordinator = await fixture(t, { run: async (program, args) => {
    calls.push(args)
    started.resolve()
    await release.promise
    return { stdout: JSON.stringify({ success: true, revisions: { assignee: ['original'], status: ['original'] } }) }
  } })
  const reason = new Error('Fixture cancellation')
  const handoff = coordinator.handoff('review-a', 'parent', 'reviewer-a', { kind: 'review' })
  const rejected = assert.rejects(handoff, error => error === reason)
  try {
    await started.promise
    coordinator.scope.cancel(reason)
    await rejected
  } finally {
    release.resolve()
    await coordinator.scope.close()
  }
  assert.deepEqual(calls.map(args => args[4]), ['show'])
  await assert.rejects(readFile(join(coordinator.root, 'outbox', 'review-a.json')), { code: 'ENOENT' })
})

it('cancellation during read diagnostics never retries the command', async t => {
  const reporting = deferred(), release = deferred()
  let calls = 0, closed = false, closing
  const coordinator = await fixture(t, {
    run: async () => { calls++; throw new Error('Fixture read unavailable') },
    onReadError: async () => { reporting.resolve(); await release.promise },
  })
  const reason = new Error('Fixture cancellation')
  const read = coordinator.cli(['show', 'parent', '--actor', 'coordinator'])
  const rejected = assert.rejects(read, error => error === reason || error.cause === reason)
  try {
    await reporting.promise
    coordinator.scope.cancel(reason)
    closing = coordinator.scope.close().then(() => { closed = true })
    await nextTurn()
    assert.equal(closed, false, 'Cleanup must wait for pending diagnostics')
  } finally { release.resolve() }
  await rejected
  await closing
  assert.equal(calls, 1)
  assert.equal(closed, true)
})

it('closing waits for in-flight commands that ignore cancellation and forbids later commands', async t => {
  const started = deferred(), release = deferred()
  let calls = 0, finished = false, closed = false
  const coordinator = await fixture(t, { run: async () => {
    calls++; started.resolve()
    await release.promise
    finished = true
    return { stdout: 'finished' }
  } })
  const operation = coordinator.execute('git', ['status', '--porcelain'])
  const rejected = assert.rejects(operation, /Rehearsal stopped/)
  await started.promise
  const closing = coordinator.scope.close().then(() => { closed = true })
  try {
    await nextTurn()
    assert.equal(closed, false)
    assert.equal(finished, false)
    await assert.rejects(coordinator.execute('git', ['commit', '-m', 'late']), /Rehearsal stopped/)
    assert.equal(calls, 1)
  } finally { release.resolve() }
  await rejected
  await closing
  assert.equal(finished, true)
  assert.equal(closed, true)
})

it('closing terminates a real child that ignores graceful cancellation before cleanup completes', async t => {
  const coordinator = await fixture(t)
  const marker = join(coordinator.root, 'child-ready')
  const script = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)'
  let pid, watchdog, forcedCleanup = false
  const operation = coordinator.execute(process.execPath, ['-e', script, marker])
  const rejected = assert.rejects(operation, error => error.name === 'AbortError' || /Rehearsal stopped/.test(error.message))
  try {
    await eventually(async () => {
      try { pid = Number(await readFile(marker, 'utf8')); return pid > 0 }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false }
    }, { timeoutMs: 5000, intervalMs: 10, label: 'fixture child readiness' })
    watchdog = setTimeout(() => {
      forcedCleanup = true
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }, 5000)
    await coordinator.scope.close()
    await rejected
    assert.equal(forcedCleanup, false, 'Command cancellation must terminate the child without test cleanup')
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'Cleanup must wait for the child to exit')
  } finally {
    clearTimeout(watchdog)
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
    await coordinator.scope.close()
    await rejected
  }
})

it('cancellation drains independent-stdio descendants even after their parent exits', { skip: process.platform === 'win32' }, async t => {
  const coordinator = await fixture(t)
  const marker = join(coordinator.root, 'descendant-ready')
  const descendant = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ pid: process.pid, parent: process.ppid })); setInterval(() => {}, 1000)'
  const script = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, process.argv[1]], { stdio: 'ignore' }); setInterval(() => {}, 1000)`
  let pids, watchdog, forcedCleanup = false
  const stopFixtures = () => {
    for (const pid of pids ? [pids.pid, pids.parent] : []) {
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  const operation = coordinator.execute(process.execPath, ['-e', script, marker])
  const rejected = assert.rejects(operation, error => error.name === 'AbortError' || /Rehearsal stopped/.test(error.message))
  try {
    await eventually(async () => {
      try { pids = JSON.parse(await readFile(marker, 'utf8')); return true }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false }
    }, { timeoutMs: 5000, intervalMs: 10, label: 'fixture descendant readiness' })
    watchdog = setTimeout(() => { forcedCleanup = true; stopFixtures() }, 5000)
    await coordinator.scope.close()
    await rejected
    assert.equal(forcedCleanup, false)
    assert.throws(() => process.kill(pids.pid, 0), { code: 'ESRCH' }, 'The descendant must exit before cleanup completes')
    assert.throws(() => process.kill(-pids.parent, 0), { code: 'ESRCH' }, 'The command process group must be gone')
  } finally {
    clearTimeout(watchdog)
    stopFixtures()
    await coordinator.scope.close()
    await rejected
  }
})

it('a command timeout terminates an uncooperative child and preserves its diagnostics', async t => {
  const coordinator = await fixture(t)
  const marker = join(coordinator.root, 'timeout-child-ready')
  const script = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], String(process.pid)); console.log("fixture output"); console.error("fixture diagnostic"); setInterval(() => {}, 1000)'
  let pid, watchdog, forcedCleanup = false
  const operation = coordinator.execute(process.execPath, ['-e', script, marker], { timeout: 1000 })
  const rejected = assert.rejects(operation, error => {
    assert.equal(error.code, 'ETIMEDOUT')
    assert.equal(error.stdout, 'fixture output\n')
    assert.equal(error.stderr, 'fixture diagnostic\n')
    assert.equal(error.killed, true)
    return true
  })
  try {
    await eventually(async () => {
      try { pid = Number(await readFile(marker, 'utf8')); return pid > 0 }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false }
    }, { timeoutMs: 5000, intervalMs: 10, label: 'timeout fixture readiness' })
    watchdog = setTimeout(() => {
      forcedCleanup = true
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }, 6000)
    await rejected
    assert.equal(forcedCleanup, false)
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  } finally {
    clearTimeout(watchdog)
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
    await coordinator.scope.close()
    await rejected
  }
})

it('a command cancelled before invocation never spawns or writes a file', async t => {
  const coordinator = await fixture(t)
  const marker = join(coordinator.root, 'must-not-exist')
  const reason = new Error('Already cancelled')
  await assert.rejects(executeCoordinatorCommand(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], "unexpected")', marker], {
    signal: AbortSignal.abort(reason), env: {},
  }), error => error === reason)
  await assert.rejects(readFile(marker), { code: 'ENOENT' })
})

it('nonzero exits retain exit status, stdout and stderr', async t => {
  const coordinator = await fixture(t)
  await assert.rejects(coordinator.execute(process.execPath, ['-e', 'console.log("fixture output"); console.error("fixture error"); process.exitCode = 7']), error => {
    assert.equal(error.code, 7)
    assert.equal(error.stdout, 'fixture output\n')
    assert.equal(error.stderr, 'fixture error\n')
    assert.equal(error.killed, false)
    return true
  })
})

it('final test commands receive only the sanitized environment even when options attempt to replace it', async t => {
  const coordinator = await fixture(t)
  const script = 'console.log(JSON.stringify({ safe: process.env.FIXTURE_SAFE, pardner: Object.keys(process.env).filter(key => key.startsWith("PARDNER_")) }))'
  for (const options of [{}, { env: { PARDNER_URL: 'http://fixture.invalid', PARDNER_TOKEN: 'fixture-only-token' } }]) {
    const { stdout } = await coordinator.execute(process.execPath, ['-e', script], options)
    assert.deepEqual(JSON.parse(stdout), { safe: 'retained', pardner: [] })
  }
})
