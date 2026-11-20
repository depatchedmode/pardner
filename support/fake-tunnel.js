import assert from 'node:assert/strict'
import { connect, createServer } from 'node:net'

/**
 * Test-only stand-in for lib/tailcat.js, passed to `startClient` as `tunnel`. `serve` hands out a fixed address and
 * `forward` is a plain TCP relay between two loopback ports, so tests exercise Pardner's side of a shared route
 * with neither tailcat nor a network. `log` counts what was started and holds what is still running.
 */
export const TUNNEL_ADDRESS = `tc${'A'.repeat(60)}`
export function fakeTunnel() {
  const log = { serves: 0, forwards: 0, running: new Set() }
  const handle = stop => {
    let end
    const exited = new Promise(resolve => { end = resolve })
    const tunnel = { pid: null, exited, running: true, async stop() { if (!tunnel.running) return; tunnel.running = false; log.running.delete(tunnel); await stop?.(); end() } }
    log.running.add(tunnel)
    return tunnel
  }
  return { log,
    async serve({ port, keyFile }) { log.serves++; log.served = port; log.keyFile = keyFile; return Object.assign(handle(), { address: TUNNEL_ADDRESS }) },
    async forward({ address, localPort, remotePort }) {
      assert.equal(address, TUNNEL_ADDRESS)
      log.forwards++
      const sockets = new Set()
      const relay = createServer(socket => {
        const upstream = connect(remotePort, '127.0.0.1')
        for (const end of [socket, upstream]) { sockets.add(end); end.on('error', () => {}); end.once('close', () => sockets.delete(end)) }
        socket.pipe(upstream); upstream.pipe(socket)
        socket.once('close', () => upstream.destroy()); upstream.once('close', () => socket.destroy())
      })
      await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(localPort, '127.0.0.1', resolve) })
      return handle(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => relay.close(resolve)) })
    } }
}
