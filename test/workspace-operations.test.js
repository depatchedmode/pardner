import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs, { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getLastLocalChange, save } from '@automerge/automerge'
import { DurableRepo } from '../lib/durable-repo.js'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { Workspace, createWorkspaceData } from '../lib/workspace.js'
import { resolveActor } from '../lib/workspace-schema.js'

const actors = [
  { id: 'alice', handle: 'alice', kind: 'human' },
  { id: 'bob', handle: 'bob', kind: 'human' },
  { id: 'builder', handle: 'builder', kind: 'agent' },
  { id: 'reviewer', handle: 'reviewer', kind: 'agent' },
]

async function withWorkspaces(run) {
  const resources = []
  const create = async (source, storageOptions) => {
    const directory = await mkdtemp(join(tmpdir(), 'pardner-commands-'))
    const repo = new DurableRepo({ storage: new NodeFSStorageAdapter(directory, storageOptions) })
    const handle = source ? repo.import(save(source.handle.doc())) : repo.create(createWorkspaceData({ actors }))
    const workspace = new Workspace({ repo, handle, replicaId: `replica-${resources.length}` })
    resources.push({ directory, repo })
    return workspace
  }
  try { await run(await create(), create) } finally {
    for (const { repo, directory } of resources) {
      await repo.shutdown()
      await rm(directory, { recursive: true, force: true })
    }
  }
}

function command(workspace, type, payload, actorId = 'alice', operationId = randomUUID()) {
  return workspace.execute({ operationId, type, actorId, payload })
}

async function createTask(workspace, fields = {}) {
  return (await command(workspace, 'task.create', { title: 'Shared work', ...fields })).result.taskId
}

function updatePayload(workspace, taskId, updates) {
  const { revisions } = workspace.taskContext(taskId)
  return { taskId, updates, expectedRevisions: Object.fromEntries(Object.keys(updates).map(field => [field, revisions[field]])) }
}

describe('shared workspace operations', () => {
  it('preserves edits and resolves conflicts across concurrent creation retries and late copies', async () => {
    await withWorkspaces(async (left, create) => {
      const right = await create(left)
      const late = await create(left)
      const receipts = await Promise.all([left, right, late].map(workspace =>
        command(workspace, 'task.create', { title: 'One logical task' }, 'alice', 'shared-create')))
      const taskId = receipts[0].result.taskId
      assert.ok(receipts.every(receipt => receipt.savedLocally && receipt.result.taskId === taskId))
      await command(left, 'task.update', updatePayload(left, taskId, { description: 'Left description', status: 'review' }), 'alice', 'edit-a')
      await command(right, 'task.update', updatePayload(right, taskId, { priority: 'p0', status: 'completed' }), 'bob', 'edit_a')
      left.handle.merge(right.handle)
      right.handle.merge(left.handle)
      const context = left.taskContext(taskId)
      assert.equal(context.task.description, 'Left description')
      assert.equal(context.task.priority, 'p0')
      assert.deepEqual(Object.keys(context.conflicts), ['status'])
      assert.deepEqual(context.revisions.status, ['edit-a', 'edit_a'])
      await command(left, 'task.resolve', { taskId, field: 'status', value: 'review', expectedRevisions: context.revisions.status }, 'alice', 'resolved')
      await command(left, 'task.update', updatePayload(left, taskId, { status: 'in-progress' }), 'alice', 'after-resolution')
      right.handle.merge(left.handle)
      const reopened = await create(right)
      assert.deepEqual(reopened.taskContext(taskId).conflicts, {})
      assert.equal(reopened.taskContext(taskId).task.status, 'in-progress')
      reopened.handle.merge(late.handle)
      assert.deepEqual(reopened.taskContext(taskId).conflicts, {}, 'a late creation retry cannot resurrect initial values')
      await command(late, 'task.update', updatePayload(late, taskId, { status: 'up-next' }), 'builder', 'late-edit')
      reopened.handle.merge(late.handle)
      assert.deepEqual(reopened.taskContext(taskId).revisions.status, ['after-resolution', 'late-edit'])
      assert.equal(reopened.taskContext(taskId).history.filter(event => event.operationId === 'shared-create').length, 1)
      assert.equal((await command(reopened, 'task.create', { title: 'One logical task' }, 'alice', 'shared-create')).replayed, true)
    })
  })

  it('preserves comment edits, mentions, resolution and deletion across creation retries', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const right = await create(left)
      const [receipt] = await Promise.all([left, right].map(workspace =>
        command(workspace, 'comment.add', { taskId, text: '@builder original' }, 'alice', 'shared-comment')))
      const commentId = receipt.result.commentId
      await command(left, 'comment.edit', { commentId, text: '@bob left edit', expectedRevisions: ['shared-comment'] }, 'alice', 'edit-a')
      left.handle.merge(right.handle)
      assert.equal(left.taskContext(taskId).comments[0].content, '@bob left edit')
      assert.deepEqual(left.taskContext(taskId).mentions.map(mention => mention.toActorId), ['bob'])
      await command(right, 'comment.edit', { commentId, text: '@reviewer right edit', expectedRevisions: ['shared-comment'] }, 'alice', 'edit_a')
      left.handle.merge(right.handle)
      const revisions = left.taskContext(taskId).comments[0].revisionIds
      assert.deepEqual(revisions, ['edit-a', 'edit_a'])
      await command(left, 'comment.resolve', { commentId, text: 'Agreed', expectedRevisions: [...revisions].reverse() }, 'alice', 'comment-resolution')
      right.handle.merge(left.handle)
      assert.deepEqual(right.taskContext(taskId).comments[0].conflicts, [])
      assert.equal(right.taskContext(taskId).comments[0].content, 'Agreed')
      await command(right, 'comment.delete', { commentId, expectedRevisions: ['comment-resolution'] })
      left.handle.merge(right.handle)
      assert.equal(left.taskContext(taskId).comments.length, 0)
      assert.equal(left.taskContext(taskId).mentions.length, 0)
    })
  })

  it('merges a concurrently retried branch without losing edits or resurrecting it', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const right = await create(left)
      const late = await create(left)
      const payload = { taskId, name: 'One experiment' }
      const [receipt] = await Promise.all([left, right].map(workspace => command(workspace, 'task.branch', payload, 'alice', 'same-branch')))
      const branchId = receipt.result.branchId
      await command(left, 'task.update', updatePayload(left, branchId, { description: 'Experiment results' }))
      await command(right, 'task.update', updatePayload(right, branchId, { priority: 'p0' }))
      left.handle.merge(right.handle)
      await command(left, 'task.merge', { branchId, expectedRevisions: left.taskContext(taskId).revisions })
      await command(late, 'task.branch', payload, 'alice', 'same-branch')
      left.handle.merge(late.handle)
      right.handle.merge(left.handle)
      for (const workspace of [left, right]) {
        assert.equal(workspace.taskContext(taskId).task.description, 'Experiment results')
        assert.equal(workspace.taskContext(taskId).task.priority, 'p0')
        assert.equal(workspace.taskContext(branchId).task.merged, true)
        assert.equal(workspace.taskContext(branchId).task.status, 'completed')
        assert.deepEqual(workspace.taskContext(branchId).conflicts, {})
      }
    })
  })

  it('does not invent branch edits when creation is retried against a different parent base', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const right = await create(left)
      // Different local histories make the metadata and field CRDT winners differ.
      await command(left, 'comment.add', { taskId, text: 'F'.repeat(501) }, 'alice', 'filler')
      await command(right, 'task.update', updatePayload(right, taskId, { description: 'B'.repeat(300) }), 'alice', 'parent-edit')
      const payload = { taskId, name: 'Retried experiment' }
      const [receipt] = await Promise.all([left, right].map(workspace => command(workspace, 'task.branch', payload, 'alice', 'branch-create')))
      const branchId = receipt.result.branchId
      await command(right, 'task.update', updatePayload(right, taskId, { description: '' }), 'alice', 'parent-clear')
      left.handle.merge(right.handle)
      assert.deepEqual(left.taskContext(branchId).conflicts, {})
      await command(left, 'task.merge', { branchId, expectedRevisions: left.taskContext(taskId).revisions })
      const reopened = await create(left)
      assert.equal(reopened.taskContext(taskId).task.description, '')
      assert.equal(reopened.taskContext(branchId).task.merged, true)
    })
  })

  it('retains every contributing branch base through edits and conflict resolution', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const right = await create(left)
      await command(right, 'task.update', updatePayload(right, taskId, { description: 'Different parent base' }))
      const payload = { taskId, name: 'Divergent experiment' }
      const [receipt] = await Promise.all([left, right].map(workspace => command(workspace, 'task.branch', payload, 'alice', 'branch-create')))
      const branchId = receipt.result.branchId
      await command(left, 'task.update', updatePayload(left, branchId, { description: 'Left proposal' }))
      await command(right, 'task.update', updatePayload(right, branchId, { description: 'Right proposal' }))
      left.handle.merge(right.handle)
      await command(left, 'task.resolve', { taskId: branchId, field: 'description', value: 'Agreed proposal',
        expectedRevisions: left.taskContext(branchId).revisions.description })
      const reopened = await create(left)
      await assert.rejects(command(reopened, 'task.merge', { branchId, expectedRevisions: reopened.taskContext(taskId).revisions }), { code: 'BRANCH_CONFLICT' })
      assert.equal(reopened.taskContext(taskId).task.description, 'Different parent base')
      await command(reopened, 'task.update', updatePayload(reopened, taskId, { description: 'Agreed proposal' }))
      await command(reopened, 'task.merge', { branchId, expectedRevisions: reopened.taskContext(taskId).revisions })
      assert.equal(reopened.taskContext(taskId).task.description, 'Agreed proposal')
    })
  })

  it('keeps repeated task and comment revision storage linear', async () => {
    await withWorkspaces(async (workspace, create) => {
      const taskId = await createTask(workspace)
      const added = await command(workspace, 'comment.add', { taskId, text: 'Original' })
      const commentId = added.result.commentId
      const late = await create(workspace)
      const samples = []
      for (let index = 1; index <= 256; index++) {
        await command(workspace, 'task.update', updatePayload(workspace, taskId, { description: `Edit ${index}` }))
        const taskBytes = getLastLocalChange(workspace.handle.doc()).length
        const [comment] = workspace.taskContext(taskId).comments
        await command(workspace, 'comment.edit', { commentId, text: `Edit ${index}`, expectedRevisions: comment.revisionIds })
        if (index === 128 || index === 256) samples.push({ taskBytes,
          commentBytes: getLastLocalChange(workspace.handle.doc()).length, savedBytes: save(workspace.handle.doc()).length })
      }
      assert.ok(samples[1].taskBytes < samples[0].taskBytes * 1.25, 'task edit size must not grow with its revision history')
      assert.ok(samples[1].commentBytes < samples[0].commentBytes * 1.25, 'comment edit size must not grow with its revision history')
      assert.ok(samples[1].savedBytes < samples[0].savedBytes * 2.5, 'doubling edits must not produce quadratic document growth')
      const reopened = await create(workspace)
      await command(late, 'task.update', updatePayload(late, taskId, { description: 'Late task edit' }))
      await command(late, 'comment.edit', { commentId, text: 'Late comment edit', expectedRevisions: [added.operationId] })
      reopened.handle.merge(late.handle)
      const context = reopened.taskContext(taskId)
      assert.deepEqual(context.conflicts.description.map(choice => choice.value).sort(), ['Edit 256', 'Late task edit'])
      assert.deepEqual(context.comments[0].conflicts.map(choice => choice.value).sort(), ['Edit 256', 'Late comment edit'])
    })
  })

  it('does not resurrect intermediate task or comment revisions when they are replayed late', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const added = await command(left, 'comment.add', { taskId, text: 'Original' })
      const commentId = added.result.commentId
      const right = await create(left)
      const requests = [
        { operationId: 'retried-task-edit', actorId: 'alice', type: 'task.update', payload: updatePayload(left, taskId, { description: 'Intermediate' }) },
        { operationId: 'retried-comment-edit', actorId: 'alice', type: 'comment.edit', payload: { commentId, text: 'Intermediate', expectedRevisions: [added.operationId] } },
      ]
      for (const request of requests) await left.execute(request)
      await command(left, 'task.update', updatePayload(left, taskId, { description: 'Latest' }))
      await command(left, 'comment.edit', { commentId, text: 'Latest', expectedRevisions: ['retried-comment-edit'] })
      for (const request of requests) assert.equal((await right.execute(request)).replayed, false)
      left.handle.merge(right.handle)
      const reopened = await create(left)
      const context = reopened.taskContext(taskId)
      assert.equal(context.task.description, 'Latest')
      assert.deepEqual(context.conflicts, {})
      assert.equal(context.comments[0].content, 'Latest')
      assert.deepEqual(context.comments[0].conflicts, [])
    })
  })

  it('rejects Actor ID and handle collisions during registration and bootstrap', async () => {
    await withWorkspaces(async workspace => {
      await command(workspace, 'actor.register', { id: 'actor-carol', handle: 'carol', kind: 'human' })
      for (const payload of [
        { id: 'carol', handle: 'other', kind: 'agent' },
        { id: 'CAROL', handle: 'other', kind: 'agent' },
        { id: 'other', handle: 'actor-carol', kind: 'agent' },
      ]) {
        await assert.rejects(command(workspace, 'actor.register', payload), { code: 'ALREADY_EXISTS' })
        assert.throws(() => createWorkspaceData({ actors: [{ id: 'actor-carol', handle: 'carol', kind: 'human' }, payload] }), { code: 'ALREADY_EXISTS' })
      }
      assert.equal(resolveActor(workspace.handle.doc(), 'carol').id, 'actor-carol')
    })
  })

  it('rejects ambiguous handles after independently registered Actors merge', async () => {
    await withWorkspaces(async (left, create) => {
      const right = await create(left)
      await command(left, 'actor.register', { id: 'actor-carol', handle: 'carol', kind: 'human' })
      await command(right, 'actor.register', { id: 'carol', handle: 'other', kind: 'agent' })
      left.handle.merge(right.handle)
      assert.throws(() => resolveActor(left.handle.doc(), 'carol'), { code: 'AMBIGUOUS_ACTOR' })
      assert.equal(resolveActor(left.handle.doc(), 'actor-carol').handle, 'carol')
      assert.equal(resolveActor(left.handle.doc(), 'other').id, 'carol')
    })
  })

  it('keeps a comment unread while any concurrent revision remains unseen', async () => {
    await withWorkspaces(async (workspace, create) => {
      const taskId = await createTask(workspace)
      const original = await command(workspace, 'comment.add', { taskId, text: 'Original' })
      const commentId = original.result.commentId
      const peer = await create(workspace)
      const first = await command(workspace, 'comment.edit', { commentId, text: 'Human revision', expectedRevisions: [original.operationId] })
      const second = await command(peer, 'comment.edit', { commentId, text: 'Peer revision', expectedRevisions: [original.operationId] }, 'alice')
      workspace.handle.merge(peer.handle)
      await command(workspace, 'read.mark', { taskId, comments: [{ commentId, revisionId: first.operationId }] })
      assert.equal(workspace.taskContext(taskId, 'alice').unreadCount, 1)
      await command(workspace, 'read.mark', { taskId, comments: [{ commentId, revisionId: second.operationId }] })
      assert.equal(workspace.taskContext(taskId, 'alice').unreadCount, 0)
      assert.equal(workspace.taskContext(taskId, 'builder').unreadCount, 1)
    })
  })
  it('rejects old schemas and supports explicit first-Actor registration', async () => {
    await withWorkspaces(async workspace => {
      const old = workspace.repo.create({ tasks: {} })
      assert.throws(() => new Workspace({ repo: workspace.repo, handle: old, replicaId: 'old' }), { code: 'INCOMPATIBLE_SCHEMA' })
      const handle = workspace.repo.create(createWorkspaceData())
      const fresh = new Workspace({ repo: workspace.repo, handle, replicaId: 'fresh' })
      await command(fresh, 'actor.register', { id: 'alice', handle: 'Alice', kind: 'human' })
      await command(fresh, 'actor.register', { id: 'builder', handle: 'builder', kind: 'agent' })
      assert.equal(fresh.snapshot().actors.alice.handle, 'alice')
      await assert.rejects(command(fresh, 'actor.register', { id: 'another', handle: 'alice', kind: 'agent' }), { code: 'ALREADY_EXISTS' })
    })
  })

  it('does not acknowledge a storage failure and retries the same logical operation', async () => {
    await withWorkspaces(async (_workspace, create) => {
      let fail = false
      const workspace = await create(null, { io: { ...fs, rename: async (...args) => {
        if (fail) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        return fs.rename(...args)
      } } })
      await workspace.repo.flush()
      const id = randomUUID()
      fail = true
      try {
        await assert.rejects(command(workspace, 'task.create', { title: 'Do not lose this' }, 'alice', id), { code: 'STORAGE_FAILED' })
      } finally { fail = false }
      const receipt = await command(workspace, 'task.create', { title: 'Do not lose this' }, 'alice', id)
      assert.equal(receipt.replayed, true)
      assert.equal(receipt.savedLocally, true)
      assert.equal(Object.keys(workspace.snapshot().tasks).length, 1)
      assert.equal(Object.keys(workspace.handle.doc().operations).length, 1)
    })
  })

  it('atomically hands work to another Actor and safely replays a lost response', async () => {
    await withWorkspaces(async workspace => {
      const taskId = await createTask(workspace)
      const operationId = randomUUID()
      const payload = {
        ...updatePayload(workspace, taskId, { assignee: 'builder', status: 'in-progress' }),
        to: 'builder', status: 'in-progress', message: '@builder implement the request',
      }
      delete payload.updates
      const first = await command(workspace, 'task.handoff', payload, 'alice', operationId)
      const replay = await command(workspace, 'task.handoff', payload, 'alice', operationId)
      assert.equal(first.savedLocally, true)
      assert.equal(first.actorId, 'alice')
      assert.equal(first.replicaId, 'replica-0')
      assert.equal(replay.replayed, true)
      assert.deepEqual(replay.result, first.result)
      const context = workspace.taskContext(taskId, 'builder')
      assert.equal(context.task.assignee, 'builder')
      assert.equal(context.task.status, 'in-progress')
      assert.equal(context.comments.length, 1)
      assert.equal(context.mentions.length, 1)
      assert.equal(context.mentions[0].toActorId, 'builder')
      assert.equal(context.history.filter(event => event.operationId === operationId).length, 1)
      assert.equal(Object.keys(workspace.handle.doc().operations).length, 2)
      await assert.rejects(command(workspace, 'task.handoff', { ...payload, message: 'different' }, 'alice', operationId), { code: 'OPERATION_ID_REUSED' })
    })
  })

  it('returns complete task context and keeps read receipts separate by Actor and revision', async () => {
    await withWorkspaces(async workspace => {
      const description = 'A complete request with context. '.repeat(100)
      const taskId = await createTask(workspace, { description })
      for (let index = 0; index < 6; index++) {
        await command(workspace, 'comment.add', { taskId, text: `Full comment ${index} ${'x'.repeat(600)}` }, 'builder')
      }
      const before = workspace.taskContext(taskId, 'alice')
      assert.equal(before.task.description, description)
      assert.equal(before.comments.length, 6)
      assert.ok(before.comments.every(comment => comment.content.length > 600))
      assert.equal(before.unreadCount, 6)
      await command(workspace, 'read.mark', { taskId, comments: before.comments.map(comment => ({ commentId: comment.id, revisionId: comment.revisionId })) })
      assert.equal(workspace.taskContext(taskId, 'alice').unreadCount, 0)
      assert.equal(workspace.taskContext(taskId, 'bob').unreadCount, 6)
      const comment = before.comments[0]
      await command(workspace, 'comment.edit', { commentId: comment.id, text: 'Updated explanation', expectedRevisions: [comment.revisionId] }, 'builder')
      assert.equal(workspace.taskContext(taskId, 'alice').unreadCount, 1)
    })
  })

  it('validates before mutation and rejects stale writes instead of dropping intervening work', async () => {
    await withWorkspaces(async workspace => {
      await assert.rejects(command(workspace, 'task.create', { title: 'Bad' }, 'unknown'), { code: 'UNKNOWN_ACTOR' })
      await assert.rejects(command(workspace, 'task.create', { title: 'Bad', status: 'vanished' }), { code: 'INVALID_ARGUMENT' })
      assert.equal(Object.keys(workspace.handle.doc().operations).length, 0)
      const taskId = await createTask(workspace, { status: 'todo' })
      assert.equal(workspace.taskContext(taskId).task.status, 'backlog')
      const stale = updatePayload(workspace, taskId, { status: 'completed' })
      await command(workspace, 'task.update', updatePayload(workspace, taskId, { status: 'in-review' }), 'builder')
      assert.equal(workspace.taskContext(taskId).task.status, 'review')
      await assert.rejects(command(workspace, 'task.update', stale), { code: 'STALE_UPDATE' })
      await assert.rejects(command(workspace, 'task.update', { taskId, updates: { status: 'completed' } }), { code: 'REVISION_REQUIRED' })
      assert.equal(workspace.taskContext(taskId).task.status, 'review')
      assert.equal(workspace.taskContext(taskId).history.length, 2)
      const before = workspace.handle.heads()
      const context = workspace.taskContext(taskId)
      await assert.rejects(command(workspace, 'task.handoff', {
        taskId, to: 'builder', status: 'in-progress', message: '', expectedRevisions: context.revisions,
      }), { code: 'INVALID_ARGUMENT' })
      assert.deepEqual(workspace.handle.heads(), before, 'an invalid explanation cannot partially change responsibility')
    })
  })

  it('preserves attributed concurrent alternatives and requires explicit resolution', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      const right = await create(left)
      await command(left, 'task.update', updatePayload(left, taskId, { status: 'review' }), 'builder', 'left-edit')
      await command(right, 'task.update', updatePayload(right, taskId, { status: 'completed' }), 'reviewer', 'right-edit')
      left.handle.merge(right.handle)
      right.handle.merge(left.handle)
      const context = left.taskContext(taskId)
      assert.deepEqual(context.conflicts.status.map(value => value.actorId).sort(), ['builder', 'reviewer'])
      assert.deepEqual(context.revisions.status, ['left-edit', 'right-edit'])
      await assert.rejects(command(left, 'task.update', updatePayload(left, taskId, { status: 'completed' })), { code: 'CONFLICT_REQUIRES_RESOLUTION' })
      await command(left, 'task.resolve', {
        taskId, field: 'status', value: 'review', expectedRevisions: context.revisions.status,
      }, 'bob')
      right.handle.merge(left.handle)
      assert.deepEqual(right.taskContext(taskId).conflicts, {})
      assert.equal(right.taskContext(taskId).task.status, 'review')
      assert.equal(right.taskContext(taskId).history.length, 4)
    })
  })

  it('keeps human/agent read receipts when the same Actor works on separate replicas', async () => {
    await withWorkspaces(async (left, create) => {
      const taskId = await createTask(left)
      await command(left, 'comment.add', { taskId, text: 'First' }, 'builder')
      await command(left, 'comment.add', { taskId, text: 'Second' }, 'reviewer')
      const right = await create(left)
      const comments = left.taskContext(taskId).comments
      await command(left, 'read.mark', { taskId, comments: [{ commentId: comments[0].id, revisionId: comments[0].revisionId }] })
      await command(right, 'read.mark', { taskId, comments: [{ commentId: comments[1].id, revisionId: comments[1].revisionId }] })
      left.handle.merge(right.handle)
      assert.equal(left.taskContext(taskId, 'alice').unreadCount, 0)
      assert.equal(left.taskContext(taskId, 'bob').unreadCount, 2)
      await command(right, 'comment.add', { taskId, text: 'Previously unseen offline comment' }, 'reviewer')
      left.handle.merge(right.handle)
      assert.equal(left.taskContext(taskId, 'alice').unreadCount, 1)
    })
  })

  it('preserves commit evidence and merges branch changes without replacing unrelated parent edits', async () => {
    await withWorkspaces(async workspace => {
      const taskId = await createTask(workspace)
      const { result } = await command(workspace, 'task.branch', { taskId, name: 'Experiment' }, 'builder')
      await command(workspace, 'task.update', updatePayload(workspace, result.branchId, { description: 'A useful experiment' }), 'builder')
      await command(workspace, 'task.update', updatePayload(workspace, taskId, { priority: 'p0' }))
      await command(workspace, 'task.merge', { branchId: result.branchId, expectedRevisions: workspace.taskContext(taskId).revisions }, 'bob')
      await command(workspace, 'task.link-commit', { taskId, commit: { hash: 'abc123abcdef', message: 'Implement the experiment' } }, 'builder')
      const context = workspace.taskContext(taskId)
      assert.equal(context.task.description, 'A useful experiment')
      assert.equal(context.task.priority, 'p0')
      assert.deepEqual(context.evidence, [{ hash: 'abc123abcdef', message: 'Implement the experiment' }])
      assert.equal(workspace.taskContext(result.branchId).task.merged, true)
      await assert.rejects(command(workspace, 'task.merge', { branchId: result.branchId }), { code: 'INVALID_BRANCH' })
    })
  })

  it('keeps deleted comment history while removing its mentions from the active queue', async () => {
    await withWorkspaces(async workspace => {
      const taskId = await createTask(workspace)
      const receipt = await command(workspace, 'comment.add', { taskId, text: '@builder this has been superseded' })
      assert.equal(workspace.taskContext(taskId).mentions.length, 1)
      await command(workspace, 'comment.delete', { commentId: receipt.result.commentId, expectedRevisions: [receipt.operationId] })
      const context = workspace.taskContext(taskId)
      assert.equal(context.comments.length, 0)
      assert.equal(context.mentions.length, 0)
      assert.equal(context.history.length, 3)
      assert.equal(context.history.find(event => event.type === 'comment.add').payload.text, '@builder this has been superseded')
    })
  })
})
