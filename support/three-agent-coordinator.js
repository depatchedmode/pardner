import assert from 'node:assert/strict'
import { join } from 'node:path'
import { executeCoordinatorCommand } from './coordinator-process.js'
import { readWithinConvergence, submitOnce } from './three-agent-review.js'

export class RehearsalScope {
  controller = new AbortController()
  pending = new Set()
  cleanupErrors = new Set()

  get signal() { return this.controller.signal }

  check() {
    if (this.deadline !== undefined && Date.now() >= this.deadline) this.cancel(this.expired())
    this.signal.throwIfAborted()
  }

  setDeadline(deadline, label) {
    this.check()
    clearTimeout(this.timer)
    this.deadline = deadline
    this.expired = () => new Error(`Timed out waiting for ${label}`)
    this.timer = setTimeout(() => this.cancel(this.expired()), Math.max(0, deadline - Date.now()))
    this.check()
  }

  clearDeadline() {
    this.check()
    clearTimeout(this.timer)
    this.deadline = undefined
  }

  run(operation) {
    const pending = Promise.resolve().then(() => {
      this.check()
      return operation(this.signal)
    }).then(result => { this.check(); return result })
    this.pending.add(pending)
    const settled = () => this.pending.delete(pending)
    pending.then(settled, error => {
      if (error.cleanupError) this.cleanupErrors.add(error.cleanupError)
      settled()
    })
    return pending
  }

  cancel(reason = new Error('Rehearsal stopped')) {
    clearTimeout(this.timer)
    this.controller.abort(reason)
  }

  async close() {
    this.cancel()
    await Promise.allSettled([...this.pending])
    return [...this.cleanupErrors]
  }
}

export function coordinatorCommands({ scope, root, runId, cliPath, data, environment, convergenceMs, save, onReadError = () => {}, run = executeCoordinatorCommand }) {
  const command = (program, args, options = {}) => scope.run(signal => run(program, args, {
    timeout: 10000, ...options, env: environment,
    signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
  }))

  const cli = argv => scope.run(async () => {
    const submit = async signal => {
      try {
        const output = await command(process.execPath, [cliPath, '--data', data, '--json', ...argv], {
          maxBuffer: 4 * 1024 * 1024, signal,
        })
        const result = JSON.parse(output.stdout)
        assert.equal(result.success, true, JSON.stringify(result))
        return result
      } catch (error) {
        scope.check()
        let body
        try { body = JSON.parse(error.stdout) } catch { /* A transport timeout may have no JSON body. */ }
        const failure = new Error(`CLI ${argv[0]} failed (${body?.error?.code ?? error.code ?? 'unknown'}): ${body?.error?.message ?? error.message}`, { cause: error })
        failure.cliDiagnostic = { argv, code: error.code, signal: error.signal, killed: error.killed,
          stdout: error.stdout, stderr: error.stderr }
        await save('cli-last-error.json', failure.cliDiagnostic)
        throw failure
      }
    }
    const readOnly = ['show', 'status'].includes(argv[0]) || (argv[0] === 'bridge' && argv[1] === 'status')
    if (!readOnly) return submit(scope.signal)
    return readWithinConvergence(submit, { timeoutMs: convergenceMs, signal: scope.signal, onError: async error => {
      scope.check()
      await onReadError(argv, error)
    } })
  })

  const outbox = join(root, 'outbox')
  const once = (key, makeArgs) => scope.run(signal => submitOnce(outbox, key, makeArgs, cli, { signal }))
  return {
    execute: command, cli,
    handoff: (key, taskId, to, message, status = 'review') => once(key, async () => {
      const { revisions } = await cli(['show', taskId, '--actor', 'coordinator'])
      return ['handoff', taskId, '--to', to, '--status', status, '--message', JSON.stringify(message),
        '--actor', 'coordinator', '--operation-id', `${runId}-${key}`,
        '--revisions', JSON.stringify({ assignee: revisions.assignee, status: revisions.status })]
    }),
    comment: (key, taskId, message) => once(key, () => ['comment', taskId, JSON.stringify(message), '--actor', 'coordinator',
      '--operation-id', `${runId}-${key}`]),
  }
}
