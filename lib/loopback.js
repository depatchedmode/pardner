import { isIP } from 'node:net'

export function isLoopback(address) {
  const ipv4 = (address || '').replace(/^::ffff:/, '')
  return address === 'localhost' || address === '::1' || address === '[::1]' ||
    (isIP(ipv4) === 4 && ipv4.startsWith('127.'))
}

/** True only for a request that reached a loopback listener from a loopback peer, by a loopback host and origin. */
export function isLoopbackRequest(req) {
  if (!isLoopback(req.socket.remoteAddress) || !isLoopback(req.socket.localAddress) || !isLoopback(req.hostname)) return false
  if (!req.headers.origin) return true
  try { return isLoopback(new URL(req.headers.origin).hostname) } catch { return false }
}
