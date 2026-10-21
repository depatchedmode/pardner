#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, startCliService } from '../support/cli-resources.js'
import { candidateFingerprint } from '../support/acceptance/candidate.js'

const root = fileURLToPath(new URL('..', import.meta.url))
assert.equal(process.argv.length, 2, 'Usage: node scripts/verify-smoke.js')
await mkdir(join(root, 'output/verification'), { recursive: true })
const output = await mkdtemp(join(root, 'output/verification/smoke-'))
const directory = await mkdtemp(join(tmpdir(), 'pardner-verify-smoke-'))
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), outcome: 'incomplete',
  behavior: 'Public CLI creates one attributed task, replays the same operation, and reopens its locally saved state after service restart',
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  commands: [], cleanup: { serviceStopped: false, scratchRemoved: false },
  limitations: ['Single local hub', 'Graceful process restart, not power loss', 'No browser, offline replica, real agent, or physical phone exercise'],
}
let service
const run = async args => {
  const result = await cli(directory, [...args, '--actor', 'alice'])
  report.commands.push({ args: [...args, '--actor', 'alice'], exitCode: result.code, result: result.result })
  assert.equal(result.code, 0, JSON.stringify(result.result))
  return result.result
}
try {
  assert.equal(process.version, `v${(await readFile(join(root, '.node-version'), 'utf8')).trim()}`)
  report.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  report.candidate = await candidateFingerprint()
  service = await startCliService(directory)
  const status = await run(['status'])
  assert.equal(status.workspaceId, service.workspaceId)
  assert.equal(status.savedLocally, true)
  assert.equal(status.storageError, null)
  assert.equal(service.child.exitCode, null)
  report.doctor = { workspaceId: status.workspaceId, pid: service.child.pid, httpUrl: service.httpUrl, savedLocally: status.savedLocally }
  await run(['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human'])
  const create = ['task', 'create', '--title', 'Verification replay and restart', '--assignee', 'alice', '--operation-id', 'verification-task']
  const created = await run(create)
  assert.equal(created.savedLocally, true)
  const replayed = await run(create)
  assert.equal(replayed.replayed, true)
  assert.equal(replayed.result.taskId, created.result.taskId)
  const tasks = await run(['tasks', '--assignee', 'alice'])
  assert.equal(tasks.tasks.length, 1)
  assert.equal(tasks.tasks[0].id, created.result.taskId)
  await service.stop()
  service = null
  service = await startCliService(directory)
  const restarted = await run(['status'])
  assert.equal(restarted.workspaceId, status.workspaceId)
  assert.equal(restarted.savedLocally, true)
  assert.equal(restarted.storageError, null)
  const context = await run(['show', created.result.taskId])
  assert.equal(context.task.title, 'Verification replay and restart')
  assert.equal(context.task.assignee, 'alice')
  const history = context.history.filter(event => event.operationId === 'verification-task')
  assert.equal(history.length, 1)
  assert.equal(history[0].actorId, 'alice')
  report.finalCandidate = await candidateFingerprint()
  assert.equal(report.finalCandidate.sha256, report.candidate.sha256, 'Source or built UI changed during the exercise')
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = error.stack
  process.exitCode = 1
} finally {
  try {
    await service?.stop()
    report.cleanup.serviceStopped = true
    await rm(directory, { recursive: true, force: true })
    report.cleanup.scratchRemoved = true
  } catch (error) {
    report.outcome = 'failed'
    report.cleanup.error = error.stack
    report.cleanup.retainedDirectory = directory
    process.exitCode = 1
  }
  report.finishedAt = new Date().toISOString()
  const artifact = join(output, 'report.json')
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`)
  assert.equal(JSON.parse(await readFile(artifact, 'utf8')).outcome, report.outcome)
  console.log(JSON.stringify({ outcome: report.outcome, report: artifact, cleanup: report.cleanup }))
}
