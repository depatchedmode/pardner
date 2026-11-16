import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from './cli-resources.js'
import { operationHttp } from '../lib/native-peer-client.js'

// Opens one browser on a fresh workspace with Actor alice. `operate` posts a
// shared operation over HTTP so layout tests can seed hundreds of records quickly.
export async function withWorkspace(engine, contextOptions, body) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-ui-layout-'))
  const service = await startCliService(directory)
  let browser
  const errors = []
  const run = async args => {
    const output = await cli(directory, [...args, '--actor', 'alice'])
    assert.equal(output.code, 0, output.stdout + output.stderr)
    return output.result
  }
  try {
    await run(['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human'])
    const { token } = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8'))
    const operate = (type, payload) => operationHttp(service.httpUrl, token, type, payload, 'alice')
    browser = await engine.launch({ headless: true })
    const context = await browser.newContext(contextOptions)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const open = async () => {
      await page.goto(`${service.httpUrl}/pardner/`)
      await page.getByLabel('Local service token').fill(token)
      await page.getByRole('button', { name: 'Connect', exact: true }).click()
      await page.getByLabel('Actor', { exact: true }).selectOption('alice')
    }
    await body({ page, run, operate, open, token, service })
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
}
