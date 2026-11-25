import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { eventually, sha256, execute } from './bridge-rehearsal.js'

const quote = value => `'${value.replaceAll("'", "'\\''")}'`

export function completionTaskDescription(challenge) {
  const barrier = `const fs=require('node:fs');fs.writeFileSync('.lifecycle-ready',${JSON.stringify(challenge)});const began=Date.now();const timer=setInterval(()=>{if(fs.existsSync('.lifecycle-release')){clearInterval(timer);console.log('Released')}else if(Date.now()-began>120000){clearInterval(timer);process.exitCode=1}},100)`
  return `This is an authorized completion-lifecycle probe. In your assigned worktree, run this exact command and wait for it to finish: ${quote(process.execPath)} -e ${quote(barrier)}
Only .lifecycle-ready may be written by you. The test controller writes .lifecycle-release and changes the task outcome while your command waits. Do not create that release file yourself, hand off, change the task outcome, or change other files. After the command finishes, reply briefly and end your turn.`
}

async function fileManifest(directory) {
  const files = {}
  async function visit(path = '') {
    for (const entry of await readdir(join(directory, path), { withFileTypes: true })) {
      if (!path && entry.name === '.git') continue
      const name = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) await visit(name)
      else { assert.ok(entry.isFile(), `Unexpected fixture file type: ${name}`); files[name] = sha256(await readFile(join(directory, name))) }
    }
  }
  await visit()
  return files
}

export async function rehearseCompletion({ report, root, cli, handoff, control, proxy, configPath, progress, restartBridge, checkProcesses, save }) {
  const status = () => cli(['bridge', 'status', '--config', configPath])
  async function complete(taskId) {
    const context = await cli(['show', taskId, '--actor', 'human'])
    await cli(['update', taskId, '--outcome', 'completed', '--revisions', JSON.stringify({ outcome: context.revisions.outcome }), '--actor', 'human'])
  }
  async function remainsOpen(label) {
    const began = Date.now()
    do {
      checkProcesses()
      assert.equal((await status()).retirement, null, label)
      assert.equal(proxy.events.filter(event => event.type === 'archive-request').length, 0, label)
      for (const cwd of Object.values(report.worktrees)) await access(cwd)
      await delay(200)
    } while (Date.now() - began < 2500)
  }
  const checks = report.checks.completion = {}
  progress('Completing the coding tasks while the related lifecycle task stays open')
  await complete(report.taskId)
  await remainsOpen('Another open task must prevent archival')
  await complete(report.busyTaskId)
  await remainsOpen('The remaining related task must prevent archival')
  checks.openTaskGuard = true
  await handoff(report.lifecycleTaskId, 'builder', 'human', 'Run the completion-lifecycle probe exactly as described.')
  const builder = report.worktrees.builder
  await eventually(async () => {
    checkProcesses()
    try { return await readFile(join(builder, '.lifecycle-ready'), 'utf8') === report.challenge } catch (error) { if (error.code !== 'ENOENT') throw error; return false }
  }, { label: 'real Luna file barrier', timeoutMs: 90000 })
  const active = await control.inspect({ threadId: report.sessions.builder.threadId, worktree: builder }, true)
  assert.equal(active.status.type, 'active')
  const turn = active.turns.find(turn => turn.status === 'inProgress')
  assert.ok(turn, 'The completion probe must be a real active turn')
  await complete(report.lifecycleTaskId)
  progress('All tasks are completed; checking that the active Luna turn prevents cleanup')
  await remainsOpen('An active thread must prevent archival after the final task closes')
  assert.equal((await control.inspect({ threadId: active.id, worktree: builder })).status.type, 'active')
  checks.busyThreadGuard = true
  for (const cwd of Object.values(report.worktrees)) {
    await writeFile(join(cwd, 'retained-notes.txt'), `Untracked evidence ${report.challenge}`)
    await writeFile(join(cwd, 'retained-evidence.log'), `Ignored evidence ${report.challenge}`)
  }
  const manifests = {}, gitStatus = {}
  for (const [actor, cwd] of Object.entries(report.worktrees)) {
    manifests[actor] = await fileManifest(cwd)
    gitStatus[actor] = (await execute('git', ['status', '--porcelain'], { cwd })).stdout.trimEnd().split('\n').sort()
  }
  for (const [actor, cwd] of Object.entries(report.worktrees)) {
    if (cwd !== builder) continue
    manifests[actor]['.lifecycle-release'] = sha256(report.challenge)
    gitStatus[actor].push('?? .lifecycle-release'); gitStatus[actor].sort()
  }
  await save('pre-archive-manifests.json', { manifests, gitStatus })
  let recovery
  const onEvent = event => {
    if (event.type !== 'archive-reply-dropped') return
    recovery = (async () => {
      progress('Codex accepted archival; dropping its reply and restarting the bridge mid-cleanup')
      await restartBridge('SIGKILL')
      checks.restartedDuringArchive = true
    })()
    recovery.catch(() => {})
  }
  proxy.on('event', onEvent)
  let retirement
  try {
    await writeFile(join(builder, '.lifecycle-release'), report.challenge)
    retirement = await eventually(async () => {
      await recovery
      checkProcesses()
      const result = await status()
      return result.retirement?.state === 'archived' ? result.retirement : null
    }, { label: 'completed retirement after restart', timeoutMs: 90000, intervalMs: 250 })
    await recovery
  } finally { proxy.off('event', onEvent) }
  assert.equal(checks.restartedDuringArchive, true)
  const completed = proxy.events.find(event => event.type === 'completed' && event.turnId === turn.id)
  assert.equal(completed?.outcome, 'completed')
  const archives = proxy.events.filter(event => event.type === 'archive-request')
  assert.equal(archives.length, 2, 'Recovery must not repeat a successful archive request')
  assert.equal(retirement.worktrees.length, new Set(Object.values(report.worktrees)).size, 'Shared worktrees must move only once')
  assert.ok(archives.every(event => event.at >= completed.at), 'Archival must follow turn completion')
  for (const [actor, session] of Object.entries(report.sessions)) {
    assert.equal(await control.isArchived({ threadId: session.threadId, worktree: session.cwd }), true)
    const moved = retirement.worktrees.find(worktree => worktree.source === session.cwd)
    assert.ok(moved)
    await assert.rejects(access(session.cwd), { code: 'ENOENT' })
    assert.deepEqual(await fileManifest(moved.destination), manifests[actor])
    assert.deepEqual((await execute('git', ['status', '--porcelain'], { cwd: moved.destination })).stdout.trimEnd().split('\n').sort(), gitStatus[actor])
    const testFile = report.topology === 'shared-worktree' && actor === 'reviewer' ? 'reviewer.test.mjs' : 'queue.test.mjs'
    await execute(process.execPath, ['--test', testFile], { cwd: moved.destination, timeout: 10000 })
  }
  checks.threadsArchived = true
  checks.worktreesPreserved = true
  await save('retirement.json', retirement)
  await restartBridge()
  assert.deepEqual((await status()).retirement, retirement, 'Restart after moving worktrees must preserve the completed record')
  assert.equal(proxy.events.filter(event => event.type === 'dispatch').length, 4)
  checks.restartAfterMove = true
  progress('PASS: completion guards, archive recovery, and preserved worktrees verified')
}
