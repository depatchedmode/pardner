import { spawnSync } from 'node:child_process'
import * as trace from './agent-trace.js'
import { requireValue } from './workspace-schema.js'

export async function runTraceCommand({ command, target, detail, flags, passthrough, actor, context, execute, evidence }) {
  // A task's linked commits, each from its signed Activity entry, with that entry's signer line.
  if (command === 'trace' && target === 'task') {
    requireValue(detail, 'Supply a task ID')
    return { taskId: detail, evidence: (await evidence(detail)).reverse().map(item => ({ ...(item.payload?.commit ?? {}), entry: item.entry, operationId: item.operationId,
      actorId: item.actorId, timestamp: item.timestamp, review: item.review, signers: item.signers, signerLine: item.signerLine })) }
  }
  const repoPath = trace.findGitRoot()
  requireValue(repoPath, 'Run this command inside a Git repository', 'GIT_REPOSITORY_REQUIRED')
  if (command === 'trace') {
    if (target === 'list') return { traces: trace.listTraces(repoPath, { limit: Number(flags.limit ?? 20) }) }
    requireValue(target === 'show' && detail, 'Use trace list, show <commit>, or task <task>')
    const record = trace.getTraceByCommit(repoPath, detail)
    requireValue(record, 'Commit trace not found', 'NOT_FOUND')
    return { trace: record }
  }
  requireValue(actor, 'Supply --actor or PARDNER_ACTOR', 'ACTOR_REQUIRED')
  requireValue(passthrough.length > 0, 'Put Git commit arguments after --')
  if (flags.task) await context(flags.task)
  const diffStats = trace.getDiffStats(repoPath)
  const commit = spawnSync('git', ['commit', ...passthrough], { cwd: repoPath, encoding: 'utf8' })
  if (commit.stdout) process.stderr.write(commit.stdout)
  if (commit.stderr) process.stderr.write(commit.stderr)
  requireValue(commit.status === 0, commit.error?.message ?? 'Git commit failed', 'GIT_COMMIT_FAILED')
  const info = trace.getLatestCommit(repoPath)
  requireValue(info, 'Commit succeeded, but its metadata could not be read', 'COMMIT_METADATA_FAILED')
  const { trace: record } = trace.createTrace({ repoPath, commitHash: info.hash, commitMessage: info.message,
    commitAuthor: info.author, agent: actor, model: flags.model, sessionKey: flags.session, taskId: flags.task, diffStats })
  let receipt = null
  if (flags.task) {
    try { receipt = await execute('task.link-commit', { taskId: flags.task, commit: { hash: info.hash, message: info.message, diff: diffStats } }) } catch (error) {
      error.details = { ...error.details, commitHash: info.hash, traceRecorded: true,
        recovery: 'Use link-commit with this existing commit; do not create another Git commit' }
      throw error
    }
  }
  return { trace: record, receipt }
}
