import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BridgeInbox } from '../lib/bridge-inbox.js'
import { approveBridgeCleanup, retireCompletedBridge, planWorktreeArchive, moveArchivedWorktree } from '../lib/bridge-retirement.js'
import { createWorktrees } from '../support/bridge-rehearsal.js'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-retirement-'))
  const inbox = new BridgeInbox(join(root, 'inbox.sqlite'), { workspaceId: 'w', replicaId: 'r' })
  const mappings = ['builder', 'reviewer'].map(actorId => ({ actorId, threadId: actorId, worktree: '/shared-fixture', enabled: true, allowedTaskIds: ['one', 'two'] }))
  const state = { tasks: { one: 'completed', two: 'completed' }, busy: false, pending: [], archived: [], moved: [], plans: [], extraThreads: [], conflicts: {} }
  const adapter = {
    availability: async () => state.busy ? 'busy' : 'ready',
    worktreeThreads: async () => state.extraThreads,
    isArchived: async mapping => state.archived.includes(mapping.threadId),
    archive: async mapping => {
      if (!state.archived.includes(mapping.threadId)) state.archived.push(mapping.threadId)
      await state.afterArchive?.(mapping)
      if (state.loseReply) { state.loseReply = false; throw new Error('reply lost') }
    },
  }
  const bridge = { config: { mappings, inboxDirectory: root, dataDirectory: join(root, 'service'), completionCleanup: { archiveDirectory: join(root, 'archive') } }, inbox,
    source: { actors: async () => ({ tasks: state.branches ?? {} }), pending: async () => ({ mentions: state.pending }),
      context: async ({ taskId }) => ({ task: { status: state.tasks[taskId] }, conflicts: state.conflicts }) },
    adapters: new Map(mappings.map(mapping => [mapping.actorId, adapter])),
  }
  const dependencies = {
    plan: async source => { state.plans.push(source); return { source, destination: '/archive/fixture' } },
    move: async plan => {
      if (state.failMove) throw new Error('disk unavailable')
      if (!state.moved.includes(plan.source)) state.moved.push(plan.source)
      await state.afterMove?.(plan)
    },
  }
  state.retire = () => retireCompletedBridge(bridge, dependencies)
  state.approve = () => approveBridgeCleanup(bridge)
  state.tick = async () => {
    await state.approve().catch(error => { if (error.code !== 'CLEANUP_NOT_ELIGIBLE') throw error })
    return state.retire()
  }
  state.inbox = inbox
  state.bridge = bridge
  try { await run(state) } finally { inbox.close(); await rm(root, { recursive: true, force: true }) }
}

it('waits for all tasks, conflicts, deliveries, and active turns, then archives a shared worktree once', () => fixture(async state => {
  state.tasks.two = 'review'; await state.tick()
  state.tasks.two = 'completed'; state.conflicts = { status: ['a', 'b'] }; await state.tick()
  state.conflicts = {}; state.busy = true; await state.tick()
  state.busy = false; state.pending = [{}]; await state.tick()
  state.pending = []; state.extraThreads = [{ id: 'unmapped-thread' }]; await state.tick()
  assert.deepEqual(state.archived, [])
  state.extraThreads = []; await state.tick(); await state.tick()
  assert.deepEqual(state.archived, ['builder', 'reviewer'])
  assert.deepEqual(state.plans, ['/shared-fixture'])
  assert.deepEqual(state.moved, ['/shared-fixture'])
  assert.equal(state.inbox.retirement().state, 'archived')
}))

it('an open related branch prevents cleanup even when the configured parent is complete', () => fixture(async state => {
  state.branches = { child: { id: 'child', branch_of: 'one' } }
  state.tasks.child = 'review'; await state.tick()
  assert.equal(state.inbox.retirement(), null)
  state.tasks.child = 'completed'; await state.tick()
  assert.equal(state.inbox.retirement().state, 'archived')
}))

it('retires once related tasks end as dead-end or abandoned, but not while one is in review', () => fixture(async state => {
  state.tasks = { one: 'dead-end', two: 'review' }; await state.tick()
  assert.equal(state.inbox.retirement(), null)
  state.tasks.two = 'abandoned'; await state.tick()
  assert.equal(state.inbox.retirement().state, 'archived')
  assert.deepEqual(state.archived, ['builder', 'reviewer'])
}))

it('queued and uncertain work and outstanding claims prevent retirement', () => fixture(async state => {
  const mapping = state.bridge.config.mappings[0]
  state.inbox.claim('builder')
  await state.tick(); assert.equal(state.inbox.retirement(), null)
  state.inbox.receive('builder', { mention: { id: 'delivery', taskId: 'one', toActorId: 'builder' } }, mapping)
  state.inbox.clearClaim('builder')
  await state.tick(); assert.equal(state.inbox.retirement(), null)
  state.inbox.begin('delivery', 'prompt'); state.inbox.recover()
  await state.tick(); assert.equal(state.inbox.retirement(), null)
  state.inbox.accept('delivery', 'turn'); await state.tick()
  assert.equal(state.inbox.retirement().state, 'archived')
}))

it('lost archive replies and move failures retain a durable retirement decision for retry', () => fixture(async state => {
  state.loseReply = true
  await assert.rejects(state.tick(), /reply lost/)
  assert.equal(state.inbox.retirement().state, 'archiving')
  state.failMove = true
  await assert.rejects(state.tick(), /disk unavailable/)
  assert.deepEqual(state.archived, ['builder', 'reviewer'])
  state.failMove = false
  await state.tick()
  assert.equal(state.inbox.retirement().state, 'archived')
  assert.deepEqual(state.plans, ['/shared-fixture'])
}))

it('reopening a task pauses partial retirement and never reactivates an archived ownership group', () => fixture(async state => {
  state.loseReply = true
  await assert.rejects(state.tick(), /reply lost/)
  state.tasks.two = 'in-progress'
  await state.tick()
  assert.deepEqual(state.archived, ['builder'])
  assert.deepEqual(state.moved, [])
  state.tasks.two = 'completed'
  await state.tick()
  const completed = state.inbox.retirement()
  state.tasks.one = 'backlog'
  await state.tick()
  assert.deepEqual(state.inbox.retirement(), completed)
  assert.equal(state.moved.length, 1)
}))

for (const actor of ['builder', 'reviewer']) {
  it(`pauses immediately when a task reopens after archiving ${actor}`, () => fixture(async state => {
    state.afterArchive = mapping => { if (mapping.actorId === actor) state.tasks.two = 'in-progress' }
    await state.tick()
    assert.deepEqual(state.archived, actor === 'builder' ? ['builder'] : ['builder', 'reviewer'])
    assert.deepEqual(state.moved, [])
    assert.equal(state.inbox.retirement().state, 'archiving')
    state.afterArchive = null
    state.tasks.two = 'completed'
    await state.tick()
    assert.deepEqual(state.archived, ['builder', 'reviewer'])
    assert.deepEqual(state.moved, ['/shared-fixture'])
    assert.equal(state.inbox.retirement().state, 'archived')
  }))
}

it('discovers an open branch added during archival before continuing', () => fixture(async state => {
  state.afterArchive = () => {
    state.branches = { child: { id: 'child', branch_of: 'one' } }
    state.tasks.child = 'review'
  }
  await state.tick()
  assert.deepEqual(state.archived, ['builder'])
  assert.deepEqual(state.moved, [])
  state.afterArchive = null
  state.tasks.child = 'completed'
  await state.tick()
  assert.ok(state.inbox.retirement().taskIds.includes('child'))
  assert.equal(state.inbox.retirement().state, 'archived')
}))

for (const change of ['pending delivery', 'stop']) {
  it(`pauses archival when ${change} arrives during the first archive`, () => fixture(async state => {
    state.afterArchive = () => {
      if (change === 'stop') state.bridge.stopped = true
      else state.pending = [{}]
    }
    await state.tick()
    assert.deepEqual(state.archived, ['builder'])
    assert.deepEqual(state.moved, [])
    assert.equal(state.inbox.retirement().state, 'archiving')
  }))
}

it('pauses between worktree moves and resumes without repeating a completed move', () => fixture(async state => {
  state.bridge.config.mappings[1].worktree = '/reviewer-fixture'
  state.afterMove = () => { state.tasks.one = 'in-progress' }
  await state.tick()
  assert.deepEqual(state.moved, ['/shared-fixture'])
  assert.equal(state.inbox.retirement().state, 'archiving')
  state.afterMove = null
  state.tasks.one = 'completed'
  await state.tick()
  assert.deepEqual(state.moved, ['/shared-fixture', '/reviewer-fixture'])
  assert.equal(state.inbox.retirement().state, 'archived')
}))

it('rechecks unmapped ownership after archived threads and a failed move without resuming them', () => fixture(async state => {
  state.failMove = true
  await assert.rejects(state.tick(), /disk unavailable/)
  assert.deepEqual(state.archived, ['builder', 'reviewer'])
  const saved = state.inbox.retirement()
  const adapter = state.bridge.adapters.get('builder')
  adapter.availability = async () => { throw new Error('Archived threads must not be resumed') }
  adapter.archive = async () => { throw new Error('Successful archives must not repeat') }
  state.extraThreads = [{ id: 'new-active-thread', cwd: '/shared-fixture', status: { type: 'active' } }]
  state.failMove = false
  await state.tick()
  assert.deepEqual(state.moved, [])
  assert.deepEqual(state.inbox.retirement(), saved)
  state.extraThreads = []
  await state.tick()
  assert.deepEqual(state.moved, ['/shared-fixture'])
  assert.equal(state.inbox.retirement().state, 'archived')
}))

it('checks new unmapped ownership between successful thread archives and moves', () => fixture(async state => {
  state.afterArchive = mapping => {
    if (mapping.actorId === 'reviewer') state.extraThreads = [{ id: 'new-active-thread', cwd: '/shared-fixture' }]
  }
  await state.tick()
  assert.deepEqual(state.archived, ['builder', 'reviewer'])
  assert.deepEqual(state.moved, [])
  assert.equal(state.inbox.retirement().state, 'archiving')
}))

it('moving a real dirty worktree preserves tracked, untracked, and ignored files and tolerates retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-archive-worktree-'))
  try {
    const trees = await createWorktrees(root, 'challenge')
    await writeFile(join(trees.builder, 'queue.mjs'), 'uncommitted work')
    await writeFile(join(trees.builder, 'notes.txt'), 'untracked work')
    await writeFile(join(trees.builder, 'evidence.log'), 'ignored evidence')
    await assert.rejects(planWorktreeArchive(join(root, 'fixture-repository'), join(root, 'archive')), /main checkout/)
    const plan = await planWorktreeArchive(trees.builder, join(root, 'archive'))
    await moveArchivedWorktree(plan); await moveArchivedWorktree(plan)
    for (const [name, value] of [['queue.mjs', 'uncommitted work'], ['notes.txt', 'untracked work'], ['evidence.log', 'ignored evidence']]) {
      assert.equal(await readFile(join(plan.destination, name), 'utf8'), value)
    }
    await assert.rejects(readFile(join(trees.builder, 'queue.mjs')), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('a restored mapped thread blocks a partial retirement without resuming or rearchiving it', () => fixture(async state => {
  state.failMove = true
  await assert.rejects(state.tick(), /disk unavailable/)
  state.failMove = false
  const adapter = state.bridge.adapters.get('builder')
  adapter.isArchived = async () => false
  adapter.availability = async () => { throw new Error('Do not resume a restored retirement member') }
  adapter.archive = async () => { throw new Error('Do not repeat archived receipts') }
  await state.tick()
  assert.deepEqual(state.moved, [])
  assert.equal(state.inbox.retirement().state, 'archiving')
}))


it('closed shared tasks alone cannot authorize cleanup, including legacy retirement records', () => fixture(async state => {
  await state.retire()
  assert.deepEqual(state.archived, [])
  assert.deepEqual(state.plans, [])
  assert.equal(state.inbox.retirement(), null)
  await state.approve()
  state.failMove = true
  await assert.rejects(state.retire(), /disk unavailable/)
  state.inbox.revokeCleanupApproval()
  state.failMove = false
  await state.retire()
  assert.deepEqual(state.moved, [])
  assert.equal(state.inbox.retirement().state, 'archiving')
}))

for (const boundary of ['builder', 'reviewer', 'move']) {
  it(`rechecks local approval after ${boundary} and permits an explicitly approved retry`, () => fixture(async state => {
    state.bridge.config.mappings[1].worktree = '/reviewer-fixture'
    await state.approve()
    state.afterArchive = mapping => {
      if (mapping.actorId === boundary) state.inbox.revokeCleanupApproval()
    }
    state.afterMove = () => { if (boundary === 'move') state.inbox.revokeCleanupApproval() }
    await state.retire()
    assert.equal(state.archived.length, boundary === 'builder' ? 1 : 2)
    assert.equal(state.moved.length, boundary === 'move' ? 1 : 0)
    state.afterArchive = null; state.afterMove = null
    await state.approve()
    await state.retire()
    assert.equal(state.inbox.retirement().state, 'archived')
  }))
}

for (const change of ['owner', 'workspace', 'replica', 'mapping', 'destination', 'task revision', 'new branch']) {
  it(`rejects approval after a change to ${change}`, () => fixture(async state => {
    const source = state.bridge.source
    source.context = async ({ taskId }) => ({ task: { status: state.tasks[taskId] }, revisions: { status: [state.revision ?? 'first'] } })
    await state.approve()
    if (change === 'owner') state.inbox.saveCleanupApproval({ ...state.inbox.cleanupApproval(), ownerUid: process.getuid() + 1 })
    if (change === 'workspace') state.bridge.config.workspaceId = 'other'
    if (change === 'replica') state.bridge.config.replicaId = 'other'
    if (change === 'mapping') state.bridge.config.mappings[0].threadId = 'other'
    if (change === 'destination') state.bridge.config.completionCleanup.archiveDirectory += '-other'
    if (change === 'task revision') state.revision = 'reclosed-by-shared-writer'
    if (change === 'new branch') {
      state.branches = { child: { id: 'child', branch_of: 'one' } }
      state.tasks.child = 'completed'
    }
    await state.retire()
    assert.deepEqual(state.archived, [])
    assert.deepEqual(state.moved, [])
    assert.equal(state.inbox.retirement(), null)
  }))
}
