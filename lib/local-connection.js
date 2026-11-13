import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { defaultHttpUrl } from './sync-protocol.js'

/** Resolve a standalone workspace service connection from flags, env, and connection.json. */
export async function localConnection(flags, env) {
  const directory = resolve(flags.data ?? env.PARDNER_DATA_DIR ?? '.pardner')
  let saved = {}
  try { saved = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return {
    directory,
    url: flags.server ?? env.PARDNER_LOCAL_URL ?? env.PARDNER_SYNC_SERVER ?? saved.httpUrl ?? defaultHttpUrl(env),
    token: flags.token ?? env.PARDNER_API_TOKEN ?? saved.token,
  }
}
