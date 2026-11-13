import { it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import * as A from '@automerge/automerge'
import { runCommand } from '../lib/cli.js'
import { shardOf, signChange } from '../lib/change-signatures.js'
import { plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { eventually, execute, withHub } from '../support/signed-hub.js'

// `pardner activity`, `timeline`, `trace task` and `diff` print each act from the Activity entry derived from the
// change that wrote it, with that change's signer line: the same derivation the browser shows.

it('activity, timeline, trace task and diff print each entry with the signer of the change that wrote it, a copy under its own signer', { timeout: 90000 }, async () => {
  await withHub(async ({ project, server, replica, bare }) => {
    const writer = await replica(0)
    const { result } = await execute(writer, 'Traced work')
    const taskId = result.taskId
    const commit = { hash: 'abcdef1234567', message: 'Implement it' }
    const linked = await writer.execute({ operationId: randomUUID(), actorId: 'alice', type: 'task.link-commit', payload: { taskId, commit } })
    const original = await eventually(() => server.store.getDoc().operations[linked.operationId], 'never relayed')
    // Another member's client writes a copy of the linked commit under an earlier key, naming another commit, and signs it.
    const bob = await bare(1)
    await eventually(() => bob.board.doc().operations?.[linked.operationId], 'Bob never synced')
    const created = Object.values(plain(server.store.getDoc().operations)).find(event => event.type === 'task.create' && event.taskId === taskId)
    bob.board.change(doc => { doc.operations['op-0000'] = storageValue({ ...plain(original), payload: { taskId, commit: { hash: '0000000', message: 'Never linked' } } }) })
    const [forged] = A.getHeads(bob.board.doc())
    // And a copy of the task's creation listing other field values, so diff has a flagged change to print.
    bob.board.change(doc => { doc.operations['op-0001'] = storageValue({ ...created, changes: [{ field: 'title', old: null, new: 'A title nobody chose' }] }) })
    const [recreated] = A.getHeads(bob.board.doc())
    for (const hash of [forged, recreated]) bob.signatures.change(doc => { doc[shardOf(hash)][hash] = signChange(bob.key, project.projectId, hash) })
    await eventually(() => server.store.getDoc().activity.find(entry => entry.id === recreated)?.changes[0].state === 'signed', 'the hub never checked the second copy')
    await eventually(() => server.store.getDoc().activity.find(entry => entry.id === forged)?.changes[0].state === 'signed', 'the hub never checked the copy')
    await eventually(() => server.store.attribution.summary().checking === 0, 'the hub never finished checking')
    const cli = args => runCommand([...args, '--server', `http://127.0.0.1:${server.httpPort}`, '--token', 'signed-changes-token'], {})
    for (const command of ['activity', 'timeline']) {
      const { activity } = await cli([command, '--task', taskId, '--limit', '50'])
      const mine = activity.find(item => item.entry === server.store.getDoc().activity.find(entry => entry.key === linked.operationId).id)
      assert.deepEqual(mine.payload.commit, commit)
      assert.match(mine.signerLine, /^Signed by /)
      assert.deepEqual(mine.signers.map(signer => signer.machineId), [project.keys[0].machineId])
      const copy = activity.find(item => item.entry === forged)
      assert.equal(copy.payload.commit.message, 'Never linked')
      assert.deepEqual(copy.signers.map(signer => signer.machineId), [project.keys[1].machineId], `${command} shows the copy under its own signer`)
      assert.equal(copy.review, true)
      assert.equal(mine.labels.task.current, true, 'a task title looked up now says so')
    }
    const { evidence } = await cli(['trace', 'task', taskId])
    const byCommit = Object.fromEntries(evidence.map(item => [item.hash, item.signers.map(signer => signer.machineId)]))
    assert.deepEqual(byCommit, { [commit.hash]: [project.keys[0].machineId], '0000000': [project.keys[1].machineId] }, 'each linked commit under its own signer')
    assert.ok(evidence.every(item => typeof item.signerLine === 'string' && item.signerLine.length))
    // Every item of every command carries its entry's flags, its review state and each signer as data.
    const carries = item => item.flags && typeof item.flags === 'object' && typeof item.review === 'boolean' && Array.isArray(item.signers) && item.signers.every(signer => signer.hash && signer.state)
    assert.ok(evidence.every(carries), 'trace task items carry flags, review state and signers')
    assert.equal(evidence.find(item => item.hash === '0000000').review, true)
    const { changes } = await cli(['diff', taskId])
    assert.ok(changes.length && changes.every(change => /^Signed by /.test(change.signerLine)))
    assert.ok(changes.every(carries), 'diff items carry flags, review state and signers')
    const copied = changes.filter(change => change.new === 'A title nobody chose')
    assert.deepEqual(copied.map(change => [change.review, Boolean(change.flags.keyMismatch), change.signers[0].machineId]), [[true, true, project.keys[1].machineId]], 'a flagged change keeps its warnings')
    for (const command of ['activity', 'timeline']) assert.ok((await cli([command, '--limit', '100'])).activity.every(carries))
  })
})
