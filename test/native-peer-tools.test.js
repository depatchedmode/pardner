import { replicaEnvironment } from '../support/replica-credentials.js'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { cliEnvironment } from '../support/cli-resources.js'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/native-peer-smoke.js', import.meta.url))
it('native smoke commands require an Actor, persist edits, and safely replay a stable operation ID', { timeout: 20000 }, async () => {
  await withWorkspaceServer(async ({ server, directory }) => {
    const env = cliEnvironment({ ...replicaEnvironment, PARDNER_SYNC_SERVER: `http://127.0.0.1:${server.httpPort}`,
      PARDNER_WS_BASE: `ws://127.0.0.1:${server.wsPort}`, PARDNER_API_TOKEN: 'test-token' })
    const run = async (args, extra = {}) => {
      let result
      try { result = await execute(process.execPath, [script, ...args], { env: { ...env, ...extra }, timeout: 10000 }) }
      catch (error) { if (!error.stdout) throw error; result = error }
      assert.equal(result.stdout.trim().split('\n').length, 1)
      return { code: result.code || 0, ...JSON.parse(result.stdout) }
    }
    const missing = await run(['create-task', 'Missing Actor'])
    assert.equal(missing.code, 'COMMAND_FAILED')
    const created = await run(['create-task', 'Native tooling task'], { PARDNER_ACTOR: 'alice' })
    assert.equal(created.savedLocally, true)
    const peerEnv = { PARDNER_ACTOR: 'builder', PARDNER_PEER_STORAGE_PATH: join(directory, 'smoke-peer'), PARDNER_OPERATION_ID: 'stable-native-edit' }
    const args = ['set-task', created.taskId, 'description', 'Durable native edit']
    const first = await run(args, peerEnv)
    assert.equal(first.savedLocally, true)
    const replay = await run(args, peerEnv)
    assert.equal(replay.replayed, true)
    assert.equal(replay.operationId, first.operationId)
    const changed = await run(['set-task', created.taskId, 'description', 'Different payload'], peerEnv)
    assert.equal(changed.code, 'OPERATION_ID_REUSED')
    const context = await run(['show-task', created.taskId], peerEnv)
    assert.equal(context.task.description, 'Durable native edit')
    assert.equal(context.history.filter(event => event.operationId === first.operationId).length, 1)
  })
})
