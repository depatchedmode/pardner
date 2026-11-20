import { createServer } from 'node:http'
import { randomInt } from 'node:crypto'
import { join } from 'node:path'
import { CLIENT_API } from './client-identity.js'
import { ensurePrivateDirectory } from './private-state.js'
import { TUNNEL_LOCAL_PORTS, tunnelRefusal } from './enrollment.js'
import { tailcat } from './tailcat.js'
import { requireValue } from './workspace-schema.js'

const ENROLL = `${CLIENT_API}/enroll`
const REPLICA = new RegExp(`^${CLIENT_API}/replica/([A-Za-z0-9_-]+)(/|$)`)
const NATIVE = new RegExp(`^${CLIENT_API}/replica/([A-Za-z0-9_-]+)/native$`)
const RETRY_MS = 2000
/** How often a joined machine checks its end of the route, how many failed checks replace it, and the slowest it checks during a long outage. */
const PROBE_MS = 8000
const PROBE_FAILURES = 2
const PROBE_SLOWEST_MS = 60000

/** Whether anything answers HTTP on this computer's `port`: the hub's shared listener answers every request. */
async function answers(port) {
  try { await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(4000) })).arrayBuffer(); return true } catch { return false }
}

/**
 * Sharing a hosted project with other computers over a Pardner-managed tailcat route (prototype of #251).
 *
 * Hub: sharing is switched on per project. While any project is shared, this client runs a second loopback
 * listener that carries only enrollment and the shared projects' machine routes into the client, and a
 * `tailcat serve` child that exposes that one port. Nothing else this client serves, and no other project, is
 * reachable through it. Switching the last project off stops both.
 *
 * The hub never binds the port it advertises. Invitations name `http://127.0.0.1:<advertisedPort>`, and each
 * joined machine binds that port itself with `tailcat forward`, which this class also runs and keeps running.
 * So a joined machine only ever stores a loopback address, and the tailcat address (a bearer secret) lives in
 * the invitation and the two private registries, never in a signed or replicated record.
 *
 * Not in this prototype: a signed route fingerprint, key rotation, and a tailcat allow-list by client key.
 */
export class ClientShare {
  constructor(client) {
    Object.assign(this, { client, registry: client.registry, driver: client.options.tunnel ?? tailcat, forwards: new Map(), serving: null, server: null, failure: null, starting: null })
  }

  /** Before any project runtime starts: the advertised port is one of the routes a hosted project's handshake accepts. */
  async prepare() {
    const stale = this.registry.update(state => {
      state.share ??= { advertisedPort: randomInt(...TUNNEL_LOCAL_PORTS), listenPort: 0, projects: [], address: null }
      state.forwards ??= {}
      const pids = state.tunnelPids ?? []
      state.tunnelPids = []
      return pids
    })
    await this.driver.reap?.(stale)
  }
  /** tailcat children are recorded while they run, so a client that was killed can end the ones it left behind. */
  track(tunnel) {
    if (!tunnel.pid) return
    this.registry.update(state => { state.tunnelPids = [...new Set([...(state.tunnelPids ?? []), tunnel.pid])] })
    tunnel.exited.then(() => { try { this.registry.update(state => { state.tunnelPids = (state.tunnelPids ?? []).filter(pid => pid !== tunnel.pid) }) } catch { /* The registry closed with the client. */ } })
  }
  get state() { return this.registry.read().share }
  get origin() { return `http://127.0.0.1:${this.state.advertisedPort}` }
  get host() { return `127.0.0.1:${this.state.advertisedPort}` }
  on(projectId) { return this.state.projects.includes(projectId) }
  /** The origin other machines dial for `projectId`, or null while it is not shared. */
  originFor(projectId) { return this.on(projectId) ? this.origin : null }

  /** What an invitation to a shared project carries so the joining machine can open its own end of the route. */
  tunnelFor(projectId) {
    if (!this.on(projectId)) return undefined
    const { address, advertisedPort, listenPort } = this.state
    requireValue(this.serving?.running && address, `Sharing is switched on but its route is not running${this.failure ? `: ${this.failure}` : ''}. Switch sharing off and on again.`, 'TUNNEL_UNAVAILABLE')
    return { kind: 'tailcat', address, localPort: advertisedPort, remotePort: listenPort }
  }

  /** A request that arrived on the shared listener may reach only enrollment and a shared project's machine routes. */
  admits(req, pattern = REPLICA) {
    const path = req.url.split('?')[0]
    // Project IDs and route names need no escapes; refusing them keeps this check and the router reading one path.
    if (req.headers.host !== this.host || req.headers.origin || /\.\.|\/\/|%|\\/.test(path)) return false
    if (pattern === REPLICA && path === ENROLL) return req.method === 'POST'
    const match = path.match(pattern)
    return Boolean(match && this.on(match[1]))
  }

  async listen() {
    if (this.server) return
    const server = createServer((req, res) => {
      if (!this.admits(req)) return res.writeHead(404, { 'Content-Type': 'application/json', Connection: 'close' }).end('{"code":"NOT_FOUND","error":"Route not found"}')
      req.pardnerShare = true
      this.client.app(req, res)
    })
    server.on('upgrade', (req, socket, head) => {
      if (!this.admits(req, NATIVE)) { socket.destroy(); return }
      req.pardnerShare = true
      this.client.onUpgrade(req, socket, head)
    })
    const wanted = this.state.listenPort
    await new Promise((resolve, reject) => {
      server.once('error', error => reject(Object.assign(new Error(error.code === 'EADDRINUSE'
        ? `Port ${wanted}, which this client shares projects on, is in use by another process on this computer. Stop that process, then switch sharing on again.` : error.message), { code: 'TUNNEL_UNAVAILABLE' })))
      server.listen(wanted, '127.0.0.1', resolve)
    })
    this.server = server
    this.registry.update(state => { state.share.listenPort = server.address().port })
  }

  /** Starts the listener and the tailcat child, once; concurrent callers share one start. */
  ensureServing() {
    if (this.serving?.running) return Promise.resolve()
    this.starting ??= (async () => {
      await this.listen()
      const directory = join(this.registry.directory, 'tailcat')
      ensurePrivateDirectory(directory)
      const serving = await this.driver.serve({ port: this.state.listenPort, keyFile: join(directory, 'share.private.json') })
      this.serving = serving; this.failure = null
      this.registry.update(state => { state.share.address = serving.address })
      this.track(serving)
      // A tailcat child that dies while projects are shared is started again; members see an outage meanwhile.
      serving.exited.then(() => { if (this.serving === serving) { this.serving = null; this.revive() } })
    })().finally(() => { this.starting = null })
    return this.starting
  }
  /** Tries again shortly, keeping `failure` (why the route is not running) for the board to show meanwhile. */
  revive(failure = 'the tailcat process stopped; starting it again') {
    if (this.client.stopping || !this.state.projects.length) return
    this.failure = failure
    const timer = setTimeout(() => {
      if (this.client.stopping || !this.state.projects.length) return
      this.ensureServing().catch(error => this.revive(error.message))
    }, RETRY_MS)
    timer.unref()
  }

  /** Hub: switches sharing of `project` on or off. On fails, and stays off, when the route cannot be started. */
  async set(project, on) {
    requireValue(project.role === 'hub', 'Only the computer that hosts a project can share it. Ask the person who started it.', 'HUB_REQUIRED')
    requireValue(typeof on === 'boolean', 'Supply on: true or false')
    if (on) {
      await this.ensureServing()
      this.registry.update(state => { if (!state.share.projects.includes(project.id)) state.share.projects.push(project.id) })
    } else {
      this.registry.update(state => { state.share.projects = state.share.projects.filter(id => id !== project.id) })
      // Machines syncing this project through the route lose their socket at once; they keep working locally.
      for (const socket of this.client.sockets) if (socket.viaShare && socket.clientProject === project.id) socket.terminate()
      if (!this.state.projects.length) await this.stopServing()
    }
    return this.view(this.client.project(project.id))
  }

  /** What the board and CLI show: never the tailcat address. */
  view(project) {
    if (project.role !== 'hub') {
      if (!project.tunnel) return null
      const forward = this.forwards.get(project.tunnel.localPort)
      const up = Boolean(forward?.tunnel?.running) && forward.reachable !== false
      return { role: 'replica', via: 'tailcat', state: up ? 'on' : 'error', ...(!up ? { error: forward?.failure ?? 'the project’s hub is not answering through the route' } : {}) }
    }
    const on = this.on(project.id)
    const state = !on ? 'off' : this.serving?.running ? 'on' : this.starting ? 'starting' : 'error'
    return { role: 'hub', via: 'tailcat', on, state, ...(state === 'error' && this.failure ? { error: this.failure } : {}) }
  }

  /** At client start: bring back the route for projects left shared, and this machine's forwards to the hubs it joined. */
  async start() {
    if (this.state.projects.length) await this.ensureServing().catch(error => this.revive(error.message))
    for (const tunnel of Object.values(this.registry.read().forwards)) this.keepForward(tunnel).catch(() => {})
  }

  /**
   * Joining machine: opens this computer's end of an invitation's route and keeps it open, now and after restarts.
   * The invitation's hub address must be the loopback port this forward binds.
   */
  async ensureForward(tunnel, endpoint) {
    const refusal = tunnelRefusal(tunnel)
    requireValue(!refusal, refusal, 'INVALID_INVITATION')
    requireValue(new URL(endpoint).origin === `http://127.0.0.1:${tunnel.localPort}`, 'This invitation’s route does not match its hub address', 'INVALID_INVITATION')
    requireValue(tunnel.localPort !== this.state.advertisedPort && tunnel.localPort !== this.state.listenPort && `http://127.0.0.1:${tunnel.localPort}` !== this.client.url,
      'This invitation’s route uses a port this Pardner client already uses. Ask for a new invitation from a hub restarted with a fresh sharing port.', 'TUNNEL_UNAVAILABLE')
    const known = this.registry.read().forwards[tunnel.localPort]
    requireValue(!known || (known.address === tunnel.address && known.remotePort === tunnel.remotePort),
      `Port ${tunnel.localPort} on this computer already carries another shared project.`, 'TUNNEL_UNAVAILABLE')
    this.registry.update(state => { state.forwards[tunnel.localPort] = tunnel })
    await this.keepForward(tunnel)
  }
  async keepForward(tunnel) {
    const entry = this.forwards.get(tunnel.localPort) ?? {}
    this.forwards.set(tunnel.localPort, entry)
    if (entry.tunnel?.running) return
    entry.starting ??= (async () => {
      try {
        const running = await this.driver.forward({ address: tunnel.address, localPort: tunnel.localPort, remotePort: tunnel.remotePort })
        // `reachable` keeps its last value: a replacement forward counts as up only once something answers through it.
        Object.assign(entry, { tunnel: running, failure: null })
        this.watchForward(tunnel, entry, running)
        this.track(running)
        running.exited.then(() => { if (entry.tunnel === running) { entry.tunnel = null; entry.failure ??= 'the tailcat process stopped; starting it again'; this.retryForward(tunnel) } })
      } catch (error) { entry.failure = error.message; this.retryForward(tunnel); throw error }
    })().finally(() => { entry.starting = null })
    return entry.starting
  }
  /**
   * A running `tailcat forward` does not find its server again after the hub's tailcat restarts (measured with
   * tailcat v0.7.0: no recovery in 40 s, while a fresh forward connects at once). So this end is checked, and a
   * forward nothing answers through is replaced. While the hub is simply off this replaces it at a slowing pace.
   */
  watchForward(tunnel, entry, running) {
    const base = this.client.options.tunnelProbeMs ?? PROBE_MS
    let failures = 0, timer
    const check = async () => {
      if (entry.tunnel !== running || this.client.stopping) return
      // `reachable` is what the board shows: a forward can be running while nothing answers through it.
      if (await answers(tunnel.localPort)) { failures = 0; entry.strikes = 0; entry.reachable = true } else { failures++; entry.reachable = false }
      if (entry.tunnel !== running || this.client.stopping) return
      if (failures < PROBE_FAILURES) return schedule()
      // Each replacement in a row waits longer, so a hub that is off for hours is not redialled every few seconds.
      entry.strikes = (entry.strikes ?? 0) + 1
      entry.failure = 'the project’s hub is not answering through the route; reconnecting'
      await running.stop()
    }
    const schedule = () => { timer = setTimeout(check, Math.min(base * 2 ** Math.min(entry.strikes ?? 0, 6), PROBE_SLOWEST_MS)); timer.unref() }
    schedule()
    running.exited.then(() => clearTimeout(timer))
  }
  retryForward(tunnel) {
    if (this.client.stopping) return
    const timer = setTimeout(() => { if (!this.client.stopping) this.keepForward(tunnel).catch(() => {}) }, RETRY_MS)
    timer.unref()
  }

  async stopServing() {
    const serving = this.serving
    this.serving = null
    await serving?.stop()
    if (this.server) { const server = this.server; this.server = null; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  }
  async stop() {
    await this.starting?.catch(() => {})
    await this.stopServing()
    await Promise.all([...this.forwards.values()].map(async entry => { await entry.starting?.catch(() => {}); const tunnel = entry.tunnel; entry.tunnel = null; await tunnel?.stop() }))
  }
}
