import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { defaultHttpUrl } from './sync-protocol.js'
import { requireValue } from './workspace-schema.js'

/** Reads a private credential file: the JSON written by client agent-grant, or a file holding only a token. */
async function tokenFile(path) {
  const text = (await readFile(resolve(path), 'utf8')).trim()
  requireValue(text, '--token-file is empty')
  if (!text.startsWith('{')) return { token: text }
  let grant
  try { grant = JSON.parse(text) } catch { throw Object.assign(new Error('--token-file must be valid JSON'), { code: 'INVALID_ARGUMENT' }) }
  requireValue(typeof grant.token === 'string' && grant.token, '--token-file JSON must contain a token')
  return { token: grant.token, actorId: grant.actorId, apiBase: grant.apiBase }
}

/** Resolve a workspace service connection from flags (including --token-file), env, and connection.json. */
export async function localConnection(flags, env) {
  const directory = resolve(flags.data ?? env.PARDNER_DATA_DIR ?? '.pardner')
  requireValue(!(flags.token && flags['token-file']), 'Supply --token or --token-file, not both')
  const credential = flags['token-file'] ? await tokenFile(flags['token-file']) : {}
  let saved = {}
  try { saved = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return { directory, url: flags.server ?? credential.apiBase ?? env.PARDNER_LOCAL_URL ?? env.PARDNER_SYNC_SERVER ?? saved.httpUrl ?? defaultHttpUrl(env),
    token: credential.token ?? flags.token ?? env.PARDNER_API_TOKEN ?? saved.token, actorId: credential.actorId }
}
