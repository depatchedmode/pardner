import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
export const CLI_PATH = fileURLToPath(new URL('../bin/pardner.js', import.meta.url))

export function cliEnvironment(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PARDNER_')))
  return { ...env, ...extra }
}

export async function cli(directory, args, options = {}) {
  let output
  try {
    output = await execute(process.execPath, [CLI_PATH, '--data', directory, '--json', ...args], {
      env: cliEnvironment(options.env), cwd: options.cwd, timeout: 10000, maxBuffer: 8 * 1024 * 1024,
    })
    output.code = 0
  } catch (error) {
    if (!error.stdout) throw error
    output = error
  }
  const lines = output.stdout.trim().split('\n')
  if (lines.length !== 1) throw new Error(`Expected exactly one JSON result, got: ${output.stdout}`)
  return { ...output, result: JSON.parse(lines[0]) }
}

export async function startCliService(directory, args = [], { reusePorts = false } = {}) {
  const ports = reusePorts ? [] : ['--http-port', '0', '--ws-port', '0']
  const child = spawn(process.execPath, [CLI_PATH, 'serve', '--data', directory, ...ports, ...args], {
    env: cliEnvironment(), stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = '', stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Service startup timed out: ${stderr}`)) }, 15000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Service exited ${code}: ${stderr} ${stdout}`)) })
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (!stdout.includes('\n')) return
      clearTimeout(timer)
      try {
        const result = JSON.parse(stdout.trim())
        if (!result.success) reject(new Error(JSON.stringify(result)))
        else resolve(result)
      } catch (error) { reject(error) }
    })
  })
  return { ...ready, child, logs: () => ({ stdout, stderr }), async stop(signal = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.kill(signal)
    const [code, actualSignal] = await exited
    clearTimeout(timer)
    if (signal === 'SIGTERM' && (code !== 0 || actualSignal)) throw new Error(`Service did not close cleanly: ${stderr}`)
  } }
}
