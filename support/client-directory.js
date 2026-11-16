import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { startClient } from '../lib/client-service.js'
import { CLIENT_API } from '../lib/client-identity.js'

/** A client service on `directory`, driven over HTTP with its operator bearer. */
export async function operatorClient(directory) {
  const service = await startClient({ directory, port: 0, gitDirectory: directory })
  const call = async (path, body) => {
    const response = await fetch(`${service.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${service.registry.read().operatorToken}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.ok, true, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  return { service, call }
}

/** Every path under `directory` with its mode, and for files the hash of its bytes. */
export async function snapshot(directory) {
  const result = {}
  for (const name of (await readdir(directory, { recursive: true })).sort()) {
    const path = join(directory, name), info = await stat(path)
    result[name] = `${(info.mode & 0o777).toString(8)} ${info.isFile() ? createHash('sha256').update(await readFile(path)).digest('hex') : 'directory'}`
  }
  return result
}
