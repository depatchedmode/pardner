import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { save } from '@automerge/automerge'
import { DurableRepo } from '../lib/durable-repo.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { Workspace, createWorkspaceData } from '../lib/workspace.js'
import { withWorkspaceServer } from '../support/workspace-test.js'

const issue = { repository: 'depatchedmode/pardner', number: 77 }

it('links existing GitHub issues to tasks without contacting or changing GitHub', () => withWorkspaceServer(async ({ api, operation, create, context, update }) => {
  const realFetch = globalThis.fetch
  const outbound = []
  globalThis.fetch = (url, options) => {
    if (!String(url).startsWith('http://127.0.0.1:')) outbound.push(String(url))
    return realFetch(url, options)
  }
  try {
    const first = await create({ title: 'Wire the control pane' })
    const second = await create({ title: 'Document the control pane' })
    assert.equal((await operation('task.link-issue', { taskId: first, repository: 'DepatchedMode/Pardner', number: 77 })).success, true)
    await operation('task.link-issue', { taskId: second, ...issue })
    await operation('task.link-issue', { taskId: first, repository: 'depatchedmode/pardner', number: 79 })
    const { issues } = await context(first)
    assert.deepEqual(issues.map(link => [link.repository, link.number, link.url]), [
      ['depatchedmode/pardner', 77, 'https://github.com/depatchedmode/pardner/issues/77'],
      ['depatchedmode/pardner', 79, 'https://github.com/depatchedmode/pardner/issues/79'],
    ])
    assert.deepEqual((await api('/automerge/doc')).doc.tasks[second].issues.map(link => link.number), [77], 'one issue can link to several tasks')
    // Finishing the task neither closes nor mirrors the issue.
    await update(first, { status: 'completed' })
    assert.equal((await context(first)).issues.length, 2)
    for (const invalid of [{ repository: 'not a repo', number: 1 }, { repository: 'a/b', number: 0 }, { repository: 'a/b', number: 1.5 }, { repository: 'a/..', number: 1 }]) {
      assert.equal((await operation('task.link-issue', { taskId: first, ...invalid })).code, 'INVALID_ARGUMENT', JSON.stringify(invalid))
    }
    assert.equal((await operation('task.unlink-issue', { taskId: first, ...issue })).code, 'REVISION_REQUIRED')
    const [linked] = (await context(first)).issues
    await operation('task.unlink-issue', { taskId: first, ...issue, expectedRevisions: linked.revisions })
    assert.deepEqual((await context(first)).issues.map(link => link.number), [79])
    assert.equal((await operation('task.unlink-issue', { taskId: first, ...issue, expectedRevisions: linked.revisions })).code, 'NOT_FOUND')
    assert.deepEqual(outbound, [])
  } finally { globalThis.fetch = realFetch }
}))

it('keeps a concurrent issue link that an unlink on another replica did not observe', async () => {
  const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'bob', handle: 'bob', kind: 'human' }]
  const resources = []
  const open = async source => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-issues-'))
    const repo = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    resources.push({ directory, repo })
    const handle = source ? repo.import(save(source.handle.doc())) : repo.create(createWorkspaceData({ actors }))
    return new Workspace({ repo, handle, replicaId: `replica-${resources.length}` })
  }
  const run = (workspace, type, payload, actorId = 'alice') => workspace.execute({ operationId: randomUUID(), type, actorId, payload })
  try {
    const laptop = await open()
    const taskId = (await run(laptop, 'task.create', { title: 'Shared work' })).result.taskId
    await run(laptop, 'task.link-issue', { taskId, ...issue })
    const phone = await open(laptop)
    const observed = laptop.taskContext(taskId).issues[0].revisions
    await run(laptop, 'task.unlink-issue', { taskId, ...issue, expectedRevisions: observed })
    await run(phone, 'task.link-issue', { taskId, ...issue }, 'bob')
    laptop.handle.merge(phone.handle)
    phone.handle.merge(laptop.handle)
    for (const workspace of [laptop, phone]) {
      const links = workspace.taskContext(taskId).issues
      assert.equal(links.length, 1, 'the unobserved link survives the unlink')
      assert.equal(links[0].revisions.length, 1)
      assert.equal(links[0].revisions.includes(observed[0]), false)
    }
  } finally {
    for (const { repo, directory } of resources) { await repo.shutdown(); await rm(directory, { recursive: true, force: true }) }
  }
})
