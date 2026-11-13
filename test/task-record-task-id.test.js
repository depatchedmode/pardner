import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

it('comments and mentions preserve canonical task references and stable recipient keys across reads', async () => {
  await withWorkspaceServer(async ({ create, operation, context, api, server }) => {
    const taskId = await create()
    const first = await operation('comment.add', { taskId, text: '@builder and @reviewer please review' })
    const second = await operation('comment.add', { taskId, text: '@builder please review again' })
    const rawBefore = JSON.stringify(server.store.workspace.handle.doc())
    let firstPassKeys
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await context(taskId)
      assert.equal(result.comments.length, 2)
      assert.equal(result.mentions.length, 3)
      const snapshot = (await api('/automerge/doc')).doc
      for (const comment of result.comments) {
        assert.equal(comment.taskId, taskId)
        assert.equal(Object.hasOwn(comment, 'task_id'), false)
        assert.equal(snapshot.comments[comment.id].taskId, taskId)
      }
      const keys = result.mentions.map(mention => {
        assert.equal(mention.taskId, taskId)
        assert.equal(Object.hasOwn(mention, 'task_id'), false)
        assert.ok([first.result.commentId, second.result.commentId].includes(mention.commentId))
        assert.equal(snapshot.mentions[mention.id].idempotency_key, mention.idempotency_key)
        return mention.idempotency_key
      })
      assert.equal(new Set(keys).size, 3, 'distinct comments and recipients get distinct mention keys')
      if (iteration === 0) firstPassKeys = keys
      else assert.deepEqual(keys, firstPassKeys, 'mention keys stay stable across replayed reads')
    }
    assert.equal(JSON.stringify(server.store.workspace.handle.doc()), rawBefore)
  })
})

for (const [legacy, schemaVersion] of [['workspace.json', 1], ['workspace.json', 2], ['document-url', null]]) {
  it(`rejects incompatible ${legacy}${schemaVersion ? ` version ${schemaVersion}` : ''} without migrating or modifying its contents`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-legacy-rejection-'))
    const contents = legacy === 'workspace.json' ? JSON.stringify({ schemaVersion, workspaceId: 'old-workspace' }) : 'automerge:legacy-document'
    const runtime = new WorkspaceRuntime({ directory })
    try {
      await writeFile(join(directory, legacy), contents)
      await assert.rejects(runtime.init(), { code: 'INCOMPATIBLE_SCHEMA' })
      assert.equal(await readFile(join(directory, legacy), 'utf8'), contents)
    } finally {
      await runtime.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
