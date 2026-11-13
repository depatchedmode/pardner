import { createServer, request } from 'node:http'
import { createServer as createTcpServer, connect } from 'node:net'

/**
 * Real sockets cross these gates; partitioning destroys existing connections too. The HTTP listener also relays
 * WebSocket upgrades (a client hub URL carries HTTP and its native socket on one origin); the separate `wsUrl`
 * listener relays raw TCP to the target's socket port, for a standalone hub whose socket has its own port.
 */
export class NetworkGate {
  constructor({ httpUrl, wsUrl }) {
    this.targetHttp = new URL(httpUrl)
    this.targetWs = new URL(wsUrl ?? httpUrl)
    this.connected = true
    this.sockets = new Set()
    this.drops = []
    this.events = []
    this.http = createServer((incoming, outgoing) => {
      if (!this.connected) { incoming.socket.destroy(); return }
      const candidates = this.drops.filter(drop => drop.remaining && incoming.url.split('?')[0].endsWith(drop.path))
      // A body matcher needs the request body before forwarding; other requests stream through unchanged.
      if (candidates.some(drop => drop.body)) {
        const chunks = []
        incoming.on('data', chunk => chunks.push(chunk))
        incoming.on('end', () => {
          const body = Buffer.concat(chunks)
          let parsed = null
          try { parsed = JSON.parse(body.toString()) } catch { /* not JSON */ }
          this.forward(incoming, outgoing, candidates.find(drop => !drop.body || drop.body(parsed)), body)
        })
      } else this.forward(incoming, outgoing, candidates[0])
    })
    this.http.on('connection', socket => this.track(socket))
    this.http.on('upgrade', (incoming, socket, head) => {
      this.track(socket)
      if (!this.connected) { socket.destroy(); return }
      const upstream = connect({ host: this.targetHttp.hostname, port: Number(this.targetHttp.port) })
      this.track(upstream)
      // Re-send the upgrade request with the target as Host, as a reverse proxy would.
      const lines = [`${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}`]
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
        const [name, value] = [incoming.rawHeaders[i], incoming.rawHeaders[i + 1]]
        lines.push(`${name}: ${name.toLowerCase() === 'host' ? this.targetHttp.host : value}`)
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head?.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
      socket.on('close', () => upstream.destroy())
      upstream.on('close', () => socket.destroy())
    })
    this.ws = createTcpServer(socket => {
      this.track(socket)
      if (!this.connected) { socket.destroy(); return }
      const upstream = connect({ host: this.targetWs.hostname, port: Number(this.targetWs.port) })
      this.track(upstream)
      socket.pipe(upstream).pipe(socket)
      socket.on('close', () => upstream.destroy())
      upstream.on('close', () => socket.destroy())
    })
  }

  forward(incoming, outgoing, drop, body) {
    const upstream = request(new URL(incoming.url, this.targetHttp), {
      method: incoming.method, headers: { ...incoming.headers, host: this.targetHttp.host, connection: 'close' },
    }, response => {
      if (drop?.remaining) {
        drop.remaining--
        response.resume()
        response.on('end', () => {
          this.events.push({ type: 'response-lost', path: incoming.url, at: Date.now() })
          outgoing.destroy()
        })
      } else {
        outgoing.writeHead(response.statusCode, response.headers)
        response.pipe(outgoing)
      }
    })
    upstream.on('socket', socket => this.track(socket))
    upstream.on('error', () => outgoing.destroy())
    incoming.on('aborted', () => upstream.destroy())
    if (body) upstream.end(body)
    else incoming.pipe(upstream)
  }

  track(socket) {
    this.sockets.add(socket)
    socket.on('error', () => socket.destroy())
    socket.on('close', () => this.sockets.delete(socket))
  }

  async start() {
    await Promise.all([this.http, this.ws].map(server => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })))
    this.httpUrl = `http://127.0.0.1:${this.http.address().port}`
    this.wsUrl = `ws://127.0.0.1:${this.ws.address().port}/automerge`
    return this
  }

  partition(blocked = true) {
    this.connected = !blocked
    this.events.push({ type: blocked ? 'partition' : 'heal', at: Date.now() })
    if (blocked) for (const socket of this.sockets) socket.destroy()
  }

  /**
   * Forwards the next `count` requests whose path ends with `path` (and whose JSON body satisfies `body`, when
   * given) but destroys the connection instead of returning the response.
   */
  loseResponse(path, count = 1, body) {
    this.drops = this.drops.filter(drop => drop.remaining && !(drop.path === path && drop.body === body))
    this.drops.push({ path, remaining: count, body })
  }

  retarget({ httpUrl, wsUrl }) {
    this.targetHttp = new URL(httpUrl)
    this.targetWs = new URL(wsUrl ?? httpUrl)
  }

  async close() {
    this.partition()
    await Promise.all([this.http, this.ws].map(server => new Promise(resolve => server.close(resolve))))
  }
}
