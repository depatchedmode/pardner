import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli, startCliService } from '../support/cli-resources.js'

it('links and unlinks GitHub issues with the public CLI', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cli-issues-'))
  const service = await startCliService(directory)
  const attempt = args => cli(directory, [...args, '--actor', 'alice'])
  const run = async args => {
    const output = await attempt(args)
    assert.equal(output.code, 0, output.stdout + output.stderr)
    return output.result
  }
  try {
    await run(['actors', 'register', 'alice', '--handle', 'alice', '--kind', 'human'])
    const { taskId } = (await run(['task', 'create', '--title', 'Wire the control pane'])).result
    assert.deepEqual((await run(['issue', 'link', taskId, 'depatchedmode/pardner#77'])).result, { taskId, repository: 'depatchedmode/pardner', number: 77 })
    const [link] = (await run(['show', taskId])).issues
    assert.equal(link.url, 'https://github.com/depatchedmode/pardner/issues/77')
    assert.equal((await attempt(['issue', 'link', taskId, 'pardner-77'])).result.error.code, 'INVALID_ARGUMENT')
    await run(['issue', 'unlink', taskId, 'depatchedmode/pardner#77', '--revisions', JSON.stringify(link.revisions)])
    assert.deepEqual((await run(['show', taskId])).issues, [])
  } finally {
    await service.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
