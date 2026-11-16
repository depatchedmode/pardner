import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { SCHEMA_VERSION } from '../lib/workspace-schema.js'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

it('installs the local package with the pardner executable and matching help', { timeout: 15000 }, async () => {
  const prefix = await mkdtemp(join(tmpdir(), 'pardner-install-'))
  try {
    await exec('npm', ['install', '--prefix', prefix, '--ignore-scripts', '--offline',
      '--no-audit', '--no-fund', '--package-lock=false', root])
    const { stdout } = await exec(join(prefix, 'node_modules', '.bin', 'pardner'), ['help'])
    assert.match(stdout, /Pardner/)
    assert.match(stdout, /pardner task create/)
    assert.match(stdout, /PARDNER_ACTOR/)
    // A client bridge's reconcile needs its agent credential like every other client bridge command.
    assert.match(stdout, /pardner bridge reconcile [^\n]*\[--token-file FILE\]/)
    assert.doesNotMatch(stdout, /\bmc\b|MC_|Mission Control/)
  } finally {
    await rm(prefix, { recursive: true, force: true })
  }
})

it('creates new Pardner storage without touching existing legacy data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-isolation-'))
  const legacy = join(directory, '.mission-control')
  const pardnerDirectory = join(directory, '.pardner')
  const server = new AutomergeSyncServer({
    env: { PARDNER_DATA_DIR: pardnerDirectory }, apiToken: 'test-token',
    httpPort: 0, wsPort: 0, logger: {},
  })
  try {
    await mkdir(legacy)
    await writeFile(join(legacy, 'keep'), 'legacy data must survive')
    await server.start()
    assert.equal(server.store.directory, pardnerDirectory)
    assert.equal(await readFile(join(legacy, 'keep'), 'utf8'), 'legacy data must survive')
    const manifest = JSON.parse(await readFile(join(pardnerDirectory, 'workspace.json'), 'utf8'))
    assert.equal(manifest.url, server.store.docHandle.url)
    assert.equal(manifest.schemaVersion, SCHEMA_VERSION)
  } finally {
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
