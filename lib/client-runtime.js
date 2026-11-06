import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { once } from 'node:events'

export class ClientRuntime {
  static async start(directory, project) {
    const runtime = new ClientRuntime()
    try { runtime.connection = await runtime.call('start', { directory: join(directory, 'projects', project.key), project }); return runtime }
    catch (error) { await runtime.stop(); throw error }
  }
  constructor() {
    this.pending = new Map()
    this.child = fork(new URL('./client-runtime-child.js', import.meta.url), [], { execPath: process.execPath, execArgv: [],
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PARDNER_'))),
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    this.child.on('message', ({ id, result, error }) => {
      const request = this.pending.get(id)
      if (!request) return
      this.pending.delete(id); clearTimeout(request.timer)
      if (error) request.reject(Object.assign(new Error(error.message), error)); else request.resolve(result)
    })
    const failed = () => {
      this.dead = true
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(Object.assign(new Error('Project runtime unavailable'), { code: 'LOCAL_SERVICE_UNAVAILABLE' })) }
      this.pending.clear()
    }
    this.child.on('error', failed); this.child.on('exit', failed)
  }
  call(method, value) {
    if (this.dead) return Promise.reject(Object.assign(new Error('Project runtime unavailable'), { code: 'LOCAL_SERVICE_UNAVAILABLE' }))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Object.assign(new Error('Runtime response unknown; retry the same request'), { code: 'RUNTIME_TIMEOUT' })) }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      this.child.send({ id, method, value }, error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error) } })
    })
  }
  request(path, body, headers) { return this.call('request', { path, body, headers }) }
  async stop() {
    if (this.dead) return
    const exited = once(this.child, 'exit')
    try { await this.call('stop') } catch { this.child.kill('SIGTERM') }
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 3000)
    try { await exited } finally { clearTimeout(timer) }
  }
}
