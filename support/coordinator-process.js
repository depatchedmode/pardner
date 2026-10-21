import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

export async function executeCoordinatorCommand(program, args, { cwd, env, signal, timeout = 10000, maxBuffer = 1024 * 1024 } = {}) {
  signal?.throwIfAborted()
  const grouped = process.platform !== 'win32'
  const child = spawn(program, args, { cwd, env, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = { stdout: [], stderr: [] }, lengths = { stdout: 0, stderr: 0 }
  let failure, stopping = false, closed = false, timeoutTimer, killTimer
  const completion = new Promise(resolve => child.once('close', (code, exitSignal) => {
    closed = true
    resolve({ code, signal: exitSignal })
  }))

  function send(killSignal) {
    if (!child.pid || (!grouped && closed)) return
    try { if (grouped) process.kill(-child.pid, killSignal); else child.kill(killSignal) }
    catch (error) { if (error.code !== 'ESRCH') failure ??= error }
  }
  function groupExists() {
    if (!grouped || !child.pid) return false
    try { process.kill(-child.pid, 0); return true }
    catch (error) { if (error.code === 'ESRCH') return false; throw error }
  }
  function stop(error) {
    failure ??= error
    if (stopping) return
    stopping = true
    send('SIGTERM')
    killTimer = setTimeout(() => send('SIGKILL'), 3000)
  }
  const abort = () => stop(Object.assign(new Error('The operation was aborted', { cause: signal.reason }), {
    name: 'AbortError', code: 'ABORT_ERR',
  }))
  child.once('error', stop)
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
    const remaining = Math.max(0, maxBuffer - lengths[stream])
    if (remaining > 0) output[stream].push(chunk.subarray(0, remaining))
    lengths[stream] += chunk.length
    if (lengths[stream] > maxBuffer) stop(Object.assign(new Error(`${stream} maxBuffer length exceeded`), {
      code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
    }))
  })
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  if (timeout > 0) timeoutTimer = setTimeout(() => stop(Object.assign(new Error(`Command timed out after ${timeout}ms`), {
    code: 'ETIMEDOUT',
  })), timeout)

  try {
    const exit = await completion
    if (groupExists() && !stopping) stop(new Error('Command exited while child processes were still running'))
    while (groupExists()) await delay(10)
    const result = Object.fromEntries(Object.entries(output).map(([stream, chunks]) => [stream, Buffer.concat(chunks).toString('utf8')]))
    if (!failure && (exit.code !== 0 || exit.signal)) failure = new Error(`Command failed: ${program} ${args.join(' ')}\n${result.stderr}`)
    if (failure) {
      failure.code ??= exit.code
      Object.assign(failure, result, { signal: exit.signal, killed: stopping, cmd: `${program} ${args.join(' ')}` })
      throw failure
    }
    return result
  } finally {
    clearTimeout(timeoutTimer)
    clearTimeout(killTimer)
    signal?.removeEventListener('abort', abort)
  }
}
