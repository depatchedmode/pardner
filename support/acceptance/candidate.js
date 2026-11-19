import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const root = fileURLToPath(new URL('../../', import.meta.url))

/** Bind acceptance evidence to source, tests, dependency locks, and the actual UI build. */
export async function candidateFingerprint(directory = root) {
  const files = ['.node-version', 'package.json', 'package-lock.json', 'automerge-sync-server.js',
    'ui-prototype/package.json', 'ui-prototype/package-lock.json', 'ui-prototype/index.html', 'ui-prototype/vite.config.js']
  async function collect(relative) {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`
      if (entry.isDirectory()) await collect(path)
      else if (entry.isFile() && entry.name !== '.DS_Store') files.push(path)
    }
  }
  for (const path of ['bin', 'lib', 'scripts', 'support', 'test', 'ui-prototype/src', 'ui-prototype/dist']) await collect(path)
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const repoBackport = manifest.dependencies?.['@automerge/automerge-repo']
  if (repoBackport?.startsWith('file:vendor/automerge-repo/')) files.push(repoBackport.slice('file:'.length))
  const hashes = {}
  for (const path of files.sort()) hashes[path] = digest(await readFile(join(directory, path)))
  return { sha256: digest(JSON.stringify(hashes)), files: hashes,
    node: process.version, platform: process.platform, architecture: process.arch }
}
