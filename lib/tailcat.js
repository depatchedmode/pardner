import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { connect } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * The tailcat release Pardner drives (prototype of #251). tailcat promises no stable CLI or wire format, so both
 * ends of a shared project must run exactly this version.
 */
export const TAILCAT_VERSION = 'v0.8.0'
const ADDRESS = /^tc[A-Za-z0-9_-]{20,400}$/
const ADDRESSES = /tc[A-Za-z0-9_-]{20,400}/g
const INSTALL = `Install tailcat ${TAILCAT_VERSION} (macOS: \`brew install tailcat\`), then try again.`

const unavailable = (message, details) => Object.assign(new Error(message), { code: 'TUNNEL_UNAVAILABLE', ...(details ? { details } : {}) })
/** A tailcat address is a bearer secret: it never appears in an error, a log or a status. */
const scrub = text => String(text ?? '').replace(ADDRESSES, 'tc…').trim()

function run(binary, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => execFile(binary, args, { timeout: timeoutMs }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stderr })) : resolve(stdout)))
}

async function requireVersion(binary) {
  let found
  try { found = (await run(binary, ['version'])).trim().split(/\s+/)[0] } catch (error) {
    throw unavailable(error.code === 'ENOENT' ? `Sharing a project between computers uses tailcat, which is not installed on this computer. ${INSTALL}`
      : `tailcat did not report its version (${scrub(error.stderr || error.message)}). ${INSTALL}`)
  }
  if (found !== TAILCAT_VERSION) throw unavailable(`Sharing needs tailcat ${TAILCAT_VERSION} on both computers, and this computer has ${found}. ${INSTALL}`, { found, required: TAILCAT_VERSION })
}

function handle(child) {
  let exited = false
  const done = new Promise(resolve => child.once('exit', () => { exited = true; resolve() }))
  return { pid: child.pid, exited: done, get running() { return !exited },
    async stop() { if (!exited) child.kill('SIGTERM'); await Promise.race([done, delay(3000)]); if (!exited) child.kill('SIGKILL'); await done } }
}

/** Collects a child's stderr, scrubbed and bounded, for the failure message of a child that exits early. */
function lastWords(child) {
  let text = ''
  child.stderr.on('data', chunk => { text = (text + chunk).slice(-2000) })
  return () => scrub(text).split('\n').filter(Boolean).at(-1) ?? 'no output'
}

async function accepts(localPort) {
  return new Promise(resolve => {
    const socket = connect(localPort, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

/**
 * Drives the tailcat CLI. `serve` exposes exactly one loopback port of this computer and resolves with its tailcat
 * address; `forward` listens on this computer's loopback only and carries connections to a served port. Both
 * resolve with `{ pid, exited, running, stop() }`. Tests replace this object through `options.tunnel`.
 */
export const tailcat = {
  async serve({ port: served, keyFile, binary = 'tailcat' }) {
    await requireVersion(binary)
    // A saved key keeps the address stable across restarts: enrolled machines hold the address they were given.
    try { await access(keyFile) } catch { await run(binary, ['genkey', `--key=${keyFile}`]) }
    const child = spawn(binary, ['serve', '--json', `--key=${keyFile}`, String(served)], { stdio: ['ignore', 'pipe', 'pipe'] })
    const words = lastWords(child), tunnel = handle(child)
    const address = await new Promise((resolve, reject) => {
      let text = ''
      const timer = setTimeout(() => reject(unavailable('tailcat did not start serving within 30 seconds. Check this computer’s network connection.')), 30000)
      child.once('error', error => { clearTimeout(timer); reject(unavailable(`tailcat could not start: ${scrub(error.message)}`)) })
      child.once('exit', () => { clearTimeout(timer); reject(unavailable(`tailcat stopped before it was serving: ${words()}`)) })
      child.stdout.on('data', chunk => {
        text += chunk
        const line = text.split('\n').find(entry => entry.trim().startsWith('{'))
        if (!line || !text.includes('\n')) return
        try {
          const { listenAddr } = JSON.parse(line)
          if (ADDRESS.test(listenAddr)) { clearTimeout(timer); resolve(listenAddr) }
        } catch { /* Wait for a complete line. */ }
      })
    }).catch(async error => { await tunnel.stop(); throw error })
    return { ...tunnel, address, get running() { return tunnel.running } }
  },

  async forward({ address, localPort, remotePort, binary = 'tailcat' }) {
    await requireVersion(binary)
    // The listener binds 127.0.0.1 (tailcat's default, stated here so a changed default cannot widen it).
    const child = spawn(binary, ['forward', '--key=new', '--bind=127.0.0.1', address, `${localPort}:${remotePort}`], { stdio: ['ignore', 'ignore', 'pipe'] })
    const words = lastWords(child), tunnel = handle(child)
    let failed = null
    child.once('error', error => { failed = unavailable(`tailcat could not start: ${scrub(error.message)}`) })
    const deadline = Date.now() + 15000
    while (Date.now() < deadline && tunnel.running && !failed) {
      if (await accepts(localPort)) return tunnel
      await delay(100)
    }
    await tunnel.stop()
    throw failed ?? unavailable(`tailcat could not listen on port ${localPort} of this computer: ${words()}`, { localPort })
  },

  /** Ends tailcat processes a client that was killed left behind; a pid that is no longer tailcat is left alone. */
  async reap(pids) {
    for (const pid of pids) {
      try {
        const command = await run('ps', ['-p', String(pid), '-o', 'comm='])
        if (/tailcat/.test(command)) process.kill(pid, 'SIGTERM')
      } catch { /* Already gone. */ }
    }
  },
}
