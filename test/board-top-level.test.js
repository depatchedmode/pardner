import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { runCommand } from '../lib/cli.js'
import { reviewView } from '../lib/client-review.js'
import { shardOf, signChange } from '../lib/change-signatures.js'
import { Workspace } from '../lib/workspace.js'
import { createWorkspaceData, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { BOB, board, run } from '../support/activity-fixture.js'
import { actors, eventually, withHub } from '../support/signed-hub.js'
import { hubRuntime, testProject } from '../support/machines.js'

// Rule: one change can make part of the board unreadable, never the whole of it. Every top-level read is checked and
// contained: a top-level key holding a value of the wrong kind (null, a number, text or a list where a map belongs,
// a map where a scalar belongs) is listed as unreadable, with the changes that wrote it and their signers, and every
// other collection, Activity, the review list and each CLI read command still return.

const KEYS = Object.keys(createWorkspaceData({ genesis: testProject({ members: 1 }).genesis }))
const SCALARS = new Set(['schemaVersion', 'workspaceId', 'name', 'created_at'])
const JUNK = {
  null: () => null,
  number: () => 7,
  text: () => 'not what belongs here',
  list: () => [1, 'two'],
  map: () => ({ odd: 5, other: ['x'] }),
}
/** The collections the board shows, and the top-level maps each is read from. */
const NEEDS = { tasks: ['tasks', 'taskFields'], goals: ['goals', 'goalFields'], veins: ['veins', 'veinFields'], comments: ['comments', 'commentBodies'], actors: ['actors'] }
/**
 * Whether `kind` written at `key` is of the wrong kind there: anything but a map where a map belongs (a map of another
 * shape is a map, whose entries are each read on their own), anything but text for the name and creation time, and
 * anything but this board's own values for its schema version and project ID.
 */
const wrongKind = (key, kind) => (['schemaVersion', 'workspaceId'].includes(key) ? true : SCALARS.has(key) ? kind !== 'text' : kind !== 'map')

/** A board with one of everything on it, written by the real write path. */
function populated() {
  let { doc } = board()
  const step = request => { const result = run(doc, request); doc = result.doc; return result.event.result }
  const { taskId } = step({ type: 'task.create', payload: { title: 'Still here' } })
  step({ type: 'comment.add', payload: { taskId, text: 'Over to @builder' } })
  const { goalId } = step({ type: 'goal.create', payload: { title: 'A goal' } })
  const { veinId } = step({ type: 'vein.create', payload: { title: 'A vein', goalId } })
  step({ type: 'task.link-vein', payload: { taskId, veinId } })
  step({ type: 'task.branch', payload: { taskId, name: 'experiment' } })
  return { doc, taskId, goalId, veinId }
}

it('each top-level key holding a value of the wrong kind is listed as unreadable, and every other part of the board and each record still reads', () => {
  const { doc: start, taskId, goalId, veinId } = populated()
  const workspaceId = plain(start.workspaceId)
  for (const key of KEYS) {
    for (const [kind, junk] of Object.entries(JUNK)) {
      const label = `${key} as ${kind}`
      const doc = A.change(A.clone(start, { actor: `${BOB}${'31'.repeat(8)}` }), draft => { draft[key] = storageValue(junk()) })
      const workspace = new Workspace({ handle: { doc: () => doc }, replicaId: 'replica-test', workspaceId })
      let snapshot
      assert.doesNotThrow(() => { snapshot = workspace.snapshot() }, label)
      assert.doesNotThrow(() => JSON.stringify(snapshot), label)
      const listed = snapshot.unreadable.filter(item => item.kind === 'root' && item.id === key)
      if (wrongKind(key, kind)) assert.equal(listed.length, 1, `${label}: not listed as unreadable: ${JSON.stringify(snapshot.unreadable)}`)
      else assert.deepEqual(listed, [], `${label}: listed although it is a value of the right kind`)
      for (const [collection, needs] of Object.entries(NEEDS)) {
        if (needs.includes(key) && wrongKind(key, kind)) assert.deepEqual(Object.keys(snapshot[collection]), [], `${label}: ${collection} shown from a key that cannot be read`)
        else if (!needs.includes(key)) assert.ok(Object.keys(snapshot[collection]).length > 0, `${label}: ${collection} no longer load`)
      }
      // The board is called by this replica's project, whatever a change wrote at its project key.
      assert.equal(snapshot.workspaceId, workspaceId, label)
      assert.equal(snapshot.schemaVersion, start.schemaVersion, label)
      // A record's own context reads, or is refused with what cannot be read: never an internal error.
      for (const [read, id] of [['taskContext', taskId], ['goalContext', goalId], ['veinContext', veinId]]) {
        try { workspace[read](id) } catch (error) {
          assert.ok(['UNREADABLE', 'NOT_FOUND'].includes(error.code), `${label}: ${read} failed: ${error.code} ${error.message}`)
        }
      }
      // A record that is not on the board is not found, unless a map it would be in cannot be read.
      const lost = wrongKind(key, kind) && !SCALARS.has(key)
      assert.throws(() => workspace.taskContext('task-000000000000000000000000'), error => error.code === (lost && NEEDS.tasks.includes(key) ? 'UNREADABLE' : lost ? error.code : 'NOT_FOUND'), label)
    }
  }
})

it('a write that needs a top-level map holding a value of the wrong kind is refused as unreadable, never as an internal error', async () => {
  const { doc: start, taskId } = populated()
  const doc = A.change(A.clone(start, { actor: `${BOB}${'32'.repeat(8)}` }), draft => { draft.taskFields = null })
  const handle = { doc: () => doc, documentId: 'board' }
  const workspace = new Workspace({ repo: { flush: async () => {} }, handle, replicaId: 'replica-test', workspaceId: plain(doc.workspaceId), change: () => { throw new Error('nothing may be written') } })
  await assert.rejects(workspace.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.update', payload: { taskId, updates: { title: 'x' }, expectedRevisions: { title: [] } } }),
    error => error.code === 'UNREADABLE' && /taskFields/.test(error.message))
})

it('each top-level key replaced by a value of the wrong kind leaves the board, Activity, review and every CLI read command readable, and says which change by which signer wrote it', { timeout: 900000 }, async () => {
  await withHub(async ({ project, server, bare }) => {
    const hub = server.store
    const step = async (type, payload) => (await hub.execute({ operationId: randomUUID(), actorId: 'alice', type, payload })).result
    const { taskId } = await step('task.create', { title: 'Still here' })
    await step('comment.add', { taskId, text: 'Over to @builder' })
    const { goalId } = await step('goal.create', { title: 'A goal' })
    const { veinId } = await step('vein.create', { title: 'A vein', goalId })
    await step('task.link-vein', { taskId, veinId })
    await step('task.branch', { taskId, name: 'experiment' })
    const member = await bare(1)
    await eventually(() => A.hasHeads(member.board.doc(), A.getHeads(hub.docHandle.doc())), 'the member never synced')
    const cli = args => runCommand([...args, '--server', `http://127.0.0.1:${server.httpPort}`, '--token', 'signed-changes-token'], {})
    const reads = [['tasks'], ['goals'], ['veins'], ['actors', 'list'], ['show', taskId], ['comments', taskId], ['goal', 'show', goalId], ['vein', 'show', veinId],
      ['activity', '--limit', '5'], ['timeline', '--limit', '5'], ['diff', taskId], ['trace', 'task', taskId], ['branches', taskId], ['status'], ['mentions', 'pending', '--actor', 'builder']]
    /** Writes `change` on the member's board as one change, signed by its machine; returns once the hub has checked it. */
    const write = async change => {
      member.board.change(change)
      const [hash] = A.getHeads(member.board.doc())
      member.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(member.key, project.projectId, hash) })
      await eventually(() => A.hasHeads(hub.docHandle.doc(), [hash]) && hub.attribution.log.entries.has(hash) && hub.attribution.stateOf(hash).state === 'signed',
        `change ${hash.slice(0, 12)} never reached the hub`)
      return hash
    }
    for (const key of KEYS) {
      const original = plain(hub.docHandle.doc()[key])
      for (const [kind, junk] of Object.entries(JUNK)) {
        if (!wrongKind(key, kind)) continue
        const label = `${key} as ${kind}`
        const hash = await write(doc => { doc[key] = storageValue(junk()) })
        let doc
        assert.doesNotThrow(() => { doc = hub.getDoc() }, label)
        assert.doesNotThrow(() => JSON.stringify(doc), label)
        // What cannot be read is listed with the change that wrote it and its signer (the hub writes membership back
        // as a map at once, so that key may already read again).
        const item = doc.unreadable.find(entry => entry.kind === 'root' && entry.id === key)
        if (item || key !== 'membership') {
          assert.ok(item, `${label}: the board does not say it cannot read ${key}: ${JSON.stringify(doc.unreadable)}`)
          assert.ok(item.writers.some(writer => writer.change === hash && writer.state === 'signed' && writer.machineId === project.keys[1].machineId),
            `${label}: not attributed to the change and its signer: ${JSON.stringify(item.writers)}`)
        }
        for (const [collection, needs] of Object.entries(NEEDS)) {
          if (!needs.includes(key)) assert.ok(Object.keys(doc[collection]).length > 0, `${label}: ${collection} no longer load`)
        }
        assert.equal(doc.workspaceId, project.projectId, `${label}: the board names another project`)
        // Activity and the review list load, and list the change for review.
        assert.ok(doc.activity.some(entry => entry.changes.some(change => change.hash === hash) && entry.review), `${label}: the change is not in Activity for review`)
        assert.ok(doc.attribution.review.some(entry => entry.change === hash), `${label}: the change is not in the review list`)
        assert.doesNotThrow(() => reviewView(doc, 'Board'), label)
        assert.deepEqual(await hub.getAgents().then(list => Array.isArray(list)), true, `${label}: the Actors cannot be listed`)
        // Each CLI read command returns: a result, or a refusal that says what it cannot read, never an internal error.
        // The board-level reads always answer.
        for (const args of reads) {
          try { await cli(args) } catch (error) {
            assert.ok(error.code && error.code !== 'INTERNAL_ERROR' && !/Cannot (read|convert)|is not a function|undefined/.test(error.message),
              `${label}: ${args.join(' ')} failed: ${error.code} ${error.message}`)
            assert.ok(!['tasks', 'goals', 'veins', 'activity', 'timeline', 'status'].includes(args[0]), `${label}: ${args.join(' ')} was refused: ${error.code} ${error.message}`)
          }
        }
      }
      // The member writes the original back, so the next key starts from a readable board.
      await write(doc => { doc[key] = storageValue(original) })
    }
  })
})

it('a board whose schema version and project ID a change rewrote reopens, names its own project, and lists both keys as unreadable', { timeout: 120000 }, async () => {
  await withHub(async ({ project, server, bare }) => {
    const member = await bare(1)
    await eventually(() => A.hasHeads(member.board.doc(), A.getHeads(server.store.docHandle.doc())), 'the member never synced')
    member.board.change(doc => { doc.schemaVersion = 3; doc.workspaceId = storageValue('f'.repeat(64)) })
    const [hash] = A.getHeads(member.board.doc())
    await eventually(() => A.hasHeads(server.store.docHandle.doc(), [hash]), 'the change never arrived')
    await member.repo.shutdown()
    const directory = server.store.directory
    await server.store.close()
    const reopened = hubRuntime(directory, { actors, project })
    await reopened.init()
    try {
      const doc = reopened.getDoc()
      assert.equal(doc.workspaceId, project.projectId)
      for (const key of ['schemaVersion', 'workspaceId']) assert.ok(doc.unreadable.some(item => item.kind === 'root' && item.id === key), `${key} is not listed`)
    } finally { await reopened.close() }
  })
})

it('a top-level map written concurrently with another is read as the one Automerge picks, not as empty, and listed', () => {
  const { doc: start, taskId } = populated()
  const copy = actor => A.change(A.clone(start, { actor }), draft => { draft.tasks = storageValue(plain(start.tasks)) })
  const doc = A.merge(copy(`${BOB}${'33'.repeat(8)}`), copy(`${BOB}${'34'.repeat(8)}`))
  assert.equal(A.getBackend(doc).getAll('_root', 'tasks').length, 2, 'the two maps are concurrent')
  const snapshot = new Workspace({ handle: { doc: () => doc }, replicaId: 'replica-test', workspaceId: plain(doc.workspaceId) }).snapshot()
  assert.deepEqual(Object.keys(snapshot.tasks).sort(), Object.keys(doc.tasks).sort())
  assert.ok(Object.hasOwn(snapshot.tasks, taskId), 'the tasks were read as empty')
  assert.ok(snapshot.unreadable.some(item => item.kind === 'root' && item.id === 'tasks' && /2 values written concurrently/.test(item.reason)), 'the concurrent values are not listed')
})
