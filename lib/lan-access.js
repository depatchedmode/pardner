import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import { isIP } from 'node:net'
import { atomicWrite } from './atomic-file.js'
import { requireValue } from './workspace-schema.js'

export function lanInterfaces(interfaces = networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses || []).filter(item => item.family === 'IPv4' && !item.internal &&
      !item.address.startsWith('169.254.')).map(item => ({ name, address: item.address })))
}

export function isLoopback(address) {
  const ipv4 = (address || '').replace(/^::ffff:/, '')
  return address === 'localhost' || address === '::1' || address === '[::1]' ||
    (isIP(ipv4) === 4 && ipv4.startsWith('127.'))
}

export function canManageAccess(req) {
  if (!isLoopback(req.socket.remoteAddress) || !isLoopback(req.socket.localAddress) || !isLoopback(req.hostname)) return false
  if (!req.headers.origin) return true
  try { return isLoopback(new URL(req.headers.origin).hostname) } catch { return false }
}

export class LanAccess {
  constructor(directory, { interfaces = () => lanInterfaces(), now = Date.now, write = atomicWrite } = {}) {
    this.path = join(directory, 'access.json')
    this.interfaces = interfaces
    this.now = now
    this.write = write
    this.saved = { enabled: false, interfaceName: null }
    this.active = null
    this.diagnostic = null
    this.pairing = null
    this.attempts = { start: 0, count: 0 }
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'))
      requireValue(saved.version === 1 && typeof saved.enabled === 'boolean' &&
        (saved.interfaceName === null || typeof saved.interfaceName === 'string'), 'Invalid access.json configuration')
      this.saved = { enabled: saved.enabled, interfaceName: saved.interfaceName }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    this.started = { ...this.saved }
    if (!this.saved.enabled) return null
    const candidates = this.interfaces().filter(item => item.name === this.saved.interfaceName)
    if (candidates.length !== 1) {
      this.diagnostic = candidates.length ? 'The selected interface has multiple IPv4 addresses. Choose another interface.' :
        'The selected network interface is unavailable. Choose an available interface and restart the service.'
      return null
    }
    return candidates[0]
  }

  status(httpPort, wsPort) {
    const interfaces = this.interfaces()
    const stale = this.active && !interfaces.some(item => item.name === this.active.name && item.address === this.active.address)
    return {
      saved: this.saved, active: this.active, interfaces, httpPort, wsPort,
      restartRequired: this.saved.enabled !== this.started.enabled ||
        this.saved.interfaceName !== this.started.interfaceName || Boolean(stale),
      phoneUrl: this.active && !stale ? `http://${this.active.address}:${httpPort}/pardner/` : null,
      diagnostic: stale ? 'The phone address has changed. Restart the service, then scan the current address.' : this.diagnostic,
    }
  }

  async configure({ enabled, interfaceName }) {
    requireValue(typeof enabled === 'boolean', 'Choose whether LAN access is enabled')
    requireValue(!this.writing, 'Another configuration change is being saved. Try again.', 'CONFIG_BUSY')
    if (enabled) {
      const candidates = this.interfaces()
      interfaceName ||= candidates.length === 1 ? candidates[0].name : null
      requireValue(candidates.filter(item => item.name === interfaceName).length === 1, 'Choose an interface with one available IPv4 address')
    }
    const saved = { enabled, interfaceName: enabled ? interfaceName : null }
    this.writing = true
    try {
      await this.write(this.path, `${JSON.stringify({ version: 1, ...saved }, null, 2)}\n`)
      this.saved = saved
      this.pairing = null
    } finally { this.writing = false }
  }

  createPairing(httpPort, wsPort) {
    requireValue(this.saved.enabled && this.status(httpPort, wsPort).phoneUrl,
      'Enable LAN access and restart the service before pairing', 'LAN_UNAVAILABLE')
    this.pairing = { code: String(randomInt(0, 100000000)).padStart(8, '0'), expiresAt: this.now() + 600000 }
    return this.pairing
  }

  redeem(code) {
    const now = this.now()
    if (now - this.attempts.start >= 60000) this.attempts = { start: now, count: 0 }
    requireValue(++this.attempts.count <= 10, 'Too many attempts. Wait a minute and try again.', 'PAIRING_THROTTLED')
    requireValue(this.saved.enabled && this.active && this.pairing && this.pairing.expiresAt > now &&
      typeof code === 'string' && code === this.pairing.code,
      'The pairing code is incorrect or expired. Generate a new code on the desktop.', 'PAIRING_INVALID')
    this.pairing = null
  }
}
