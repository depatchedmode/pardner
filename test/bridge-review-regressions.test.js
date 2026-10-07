import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, symlink, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { withWorkspaceServer } from '../support/workspace-test.js'
import { AgentBridge, BridgeSource, openBridgeInbox } from '../lib/agent-bridge.js'
import { retireCompletedBridge, moveArchivedWorktree } from '../lib/bridge-retirement.js'
import { createWorktrees } from '../support/bridge-rehearsal.js'

async function fixture(run) {
  await withWorkspaceServer(async service => {
    const root = await mkdtemp(join(tmpdir(), 'pardner-review-'))
    let inbox, source
    try {
      const trees = await createWorktrees(root, 'review-regression')
      const config = { workspaceId: service.server.store.manifest.workspaceId, replicaId: service.server.store.manifest.replicaId,
        dataDirectory: service.directory, inboxDirectory: join(root, 'inbox'), completionCleanup: { archiveDirectory: join(root, 'archive') },
        mappings: ['builder', 'reviewer'].map(actorId => ({ actorId, adapter: 'codex-app-server', threadId: actorId, worktree: trees[actorId], enabled: true, allowedTaskIds: [] })) }
      await writeFile(join(service.directory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${service.server.httpPort}`, token: 'test-token' }))
      inbox = await openBridgeInbox(config)
      source = new BridgeSource(config)
      const state = { archived: [], moved: [] }
      const adapter = {
        availability: async mapping => { assert.ok(!state.archived.includes(mapping.threadId), 'Do not resume an archived thread'); return 'ready' },
        worktreeThreads: async () => [], isArchived: async mapping => state.archived.includes(mapping.threadId),
        archive: async mapping => { assert.ok(!state.archived.includes(mapping.threadId)); state.archived.push(mapping.threadId); await state.afterArchive?.(mapping) },
      }
      const bridge = { config, inbox, source, adapters: new Map(config.mappings.map(m => [m.actorId, adapter])) }
      const tick = () => retireCompletedBridge(bridge, { move: async plan => { state.moved.push(plan.source) } })
      const branch = async parent => {
        const result = await service.operation('task.branch', { taskId: parent, name: `child-${Date.now()}` })
        assert.equal(result.success, true)
        return result.result.branchId
      }
      const complete = async id => { assert.equal((await service.update(id, { status: 'completed' })).success, true) }
      const map = id => { for (const mapping of config.mappings) mapping.allowedTaskIds = [id] }
      await run({ ...service, root, trees, config, inbox, source, bridge, state, tick, branch, complete, map })
    } finally { source?.close(); inbox?.close(); await rm(root, { recursive: true, force: true }) }
  })
}

for (const relation of ['child', 'parent', 'sibling', 'descendant']) {
  it(`real BridgeSource branch discovery blocks cleanup for an open ${relation}`, () => fixture(async f => {
    const parent = await f.create(), child = await f.branch(parent)
    const sibling = await f.branch(parent), descendant = await f.branch(child)
    const ids = { parent, child, sibling, descendant }
    for (const [name, id] of Object.entries(ids)) if (name !== relation) await f.complete(id)
    f.map(relation === 'child' || relation === 'descendant' ? parent : child)
    assert.equal((await f.source.actors()).tasks[child].branch_of, parent)
    await f.tick()
    assert.deepEqual(f.state.archived, [])
    assert.deepEqual(f.state.moved, [])
    assert.equal(f.inbox.retirement(), null)
    await f.complete(ids[relation])
    await f.tick()
    assert.equal(f.inbox.retirement().state, 'archived')
  }))
}

it('real BridgeSource discovers a branch created between cleanup steps', () => fixture(async f => {
  const parent = await f.create()
  await f.complete(parent); f.map(parent)
  let child
  f.state.afterArchive = async () => {
    child = await f.branch(parent)
    assert.equal((await f.update(child, { status: 'in-progress' })).success, true)
  }
  await f.tick()
  assert.deepEqual(f.state.archived, ['builder'])
  assert.deepEqual(f.state.moved, [])
  f.state.afterArchive = null
  await f.complete(child)
  await f.tick()
  assert.ok(f.inbox.retirement().taskIds.includes(child))
  assert.equal(f.inbox.retirement().state, 'archived')
}))

for (const field of ['inboxDirectory', 'dataDirectory']) {
  for (const alias of ['none', 'direct', 'parent traversal']) {
    it(`rejects ${field} within a moving checkout${alias === 'none' ? '' : ` through a symlink (${alias})`} without changing inbox state`, () => fixture(async f => {
      const task = await f.create(); await f.complete(task); f.map(task)
      let base = f.trees.builder
      if (alias !== 'none') {
        base = join(f.root, 'checkout-alias')
        const target = alias === 'direct' ? f.trees.builder : join(f.trees.builder, 'subdir')
        if (alias === 'parent traversal') await mkdir(target)
        await symlink(target, base, 'dir')
      }
      const invalid = `${base}/${alias === 'parent traversal' ? '../' : ''}runtime/not-created-yet`
      f.config[field] = invalid
      f.inbox.status('retained-evidence', 'preserve me')
      const before = f.inbox.statuses()
      await assert.rejects(f.tick(), error => error.message.includes(field) && error.message.includes(invalid))
      assert.deepEqual(f.state.archived, [])
      assert.deepEqual(f.state.moved, [])
      assert.equal(f.inbox.retirement(), null)
      assert.deepEqual(f.inbox.statuses(), before)
      await assert.rejects(access(invalid), { code: 'ENOENT' })
    }))
  }
}

it('rejects an existing inbox inside a checkout without losing its durable rows', () => fixture(async f => {
  const task = await f.create(); await f.complete(task); f.map(task)
  const config = { ...f.config, inboxDirectory: join(f.trees.builder, 'live-inbox') }
  const inbox = await openBridgeInbox(config)
  try {
    const mapping = config.mappings[0]
    inbox.claim(mapping.actorId)
    inbox.receive(mapping.actorId, { mention: { id: 'retained', taskId: task, toActorId: mapping.actorId } }, mapping)
    inbox.clearClaim(mapping.actorId)
    inbox.begin('retained', 'retained prompt'); inbox.accept('retained', 'turn-one')
    const before = inbox.rows()
    await assert.rejects(retireCompletedBridge({ ...f.bridge, config, inbox }), /inboxDirectory/)
    assert.deepEqual(inbox.rows(), before)
    assert.equal(inbox.retirement(), null)
    assert.deepEqual(f.state.archived, [])
  } finally { inbox.close() }
}))

it('a deleted originating comment does not starve a later valid delivery through the real service', () => fixture(async f => {
  const first = await f.create(), second = await f.create()
  const mapping = { ...f.config.mappings[0], allowedTaskIds: [first, second], allowedFromActorIds: ['alice'] }
  const config = { ...f.config, mappings: [mapping], completionCleanup: undefined }
  const harness = new EventEmitter()
  const calls = []
  let busy = true
  Object.assign(harness, { availability: async () => busy ? 'busy' : 'ready',
    dispatch: async (_mapping, prompt) => { calls.push(JSON.parse(prompt.split('\n\n').at(-1))); return `turn-${calls.length}` },
    reconcile: async () => null, close: () => {} })
  const bridge = new AgentBridge({ config, inbox: f.inbox, source: f.source, adapterFactory: () => harness })
  try {
    const comment = await f.operation('comment.add', { taskId: first, text: '@builder first delivery' })
    await bridge.wake()
    assert.equal(f.inbox.rows().length, 1)
    assert.equal(f.inbox.rows()[0].reason, 'busy')
    assert.equal((await f.operation('comment.delete', { commentId: comment.result.commentId, expectedRevisions: [comment.operationId] })).success, true)
    await f.operation('comment.add', { taskId: second, text: '@builder second delivery' })
    await bridge.wake()
    busy = false
    await bridge.wake(); await bridge.wake()
    assert.deepEqual(calls.map(call => call.mention.taskId), [second])
    const blocked = f.inbox.rows().find(row => row.mention.taskId === first)
    assert.equal(blocked.state, 'queued')
    assert.match(blocked.reason, /originating context/)
  } finally { await bridge.stop() }
}))

it('partial retirement restarts after a real worktree move with historical paths missing', () => fixture(async f => {
  const task = await f.create(); await f.complete(task); f.map(task)
  let moves = 0
  await assert.rejects(retireCompletedBridge(f.bridge, { move: async plan => {
    await moveArchivedWorktree(plan)
    if (++moves === 1) throw new Error('stopped after moving checkout')
  } }), /stopped after moving checkout/)
  await assert.rejects(access(f.trees.builder), { code: 'ENOENT' })
  assert.deepEqual(f.state.archived, ['builder', 'reviewer'])
  await retireCompletedBridge(f.bridge)
  assert.equal(f.inbox.retirement().state, 'archived')
  for (const plan of f.inbox.retirement().worktrees) await access(plan.destination)
  assert.deepEqual(f.state.archived, ['builder', 'reviewer'])
}))
