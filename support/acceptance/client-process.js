import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CLI_PATH, cliEnvironment } from '../cli-resources.js'

const CLIENT_API = '/pardner/client/v1'

/**
 * One person's `pardner client serve` subprocess, driven over HTTP with its local operator bearer from
 * client-connection.json. A restart reuses the port saved in its registry, so browser origins and cookies survive.
 */
export async function startClientProcess(directory, args = []) {
  const child = spawn(process.execPath, [CLI_PATH, 'client', 'serve', '--data', directory, ...args], {
    env: cliEnvironment(), stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = '', stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.on('data', chunk => { stdout += chunk })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Client startup timed out: ${stderr}`)) }, 15000)
    const exited = code => { clearTimeout(timer); reject(new Error(`Client exited ${code}: ${stderr} ${stdout}`)) }
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', exited)
    const ready = () => {
      if (!stdout.includes('\n')) return
      child.stdout.off('data', ready); child.off('exit', exited); clearTimeout(timer)
      try {
        const result = JSON.parse(stdout.split('\n')[0])
        if (result.success && result.serving) resolve(); else reject(new Error(stdout))
      } catch (error) { reject(error) }
    }
    child.stdout.on('data', ready)
  })
  const { url, token } = JSON.parse(await readFile(join(directory, 'client-connection.json'), 'utf8'))
  const call = async (path, body, { bearer = token, timeout = 30000 } = {}) => {
    const response = await fetch(`${url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!response.ok) throw Object.assign(new Error(`${path}: ${result.error}`), { code: result.code, status: response.status })
    return result
  }
  return { directory, url, token, child, call, logs: () => ({ stdout, stderr }), async stop(signal = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
    child.kill(signal)
    const [code, actualSignal] = await exited
    clearTimeout(timer)
    if (signal === 'SIGTERM' && (code !== 0 || actualSignal)) throw new Error(`Client did not close cleanly (${code}/${actualSignal}): ${stderr}`)
  } }
}
