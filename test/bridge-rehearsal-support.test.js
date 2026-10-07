import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket, { WebSocketServer } from 'ws'
import { HarnessProxy, createWorktrees, auditThreeAgentWorktree, deliveryTiming, startProcess, eventually, execute } from '../support/bridge-rehearsal.js'

it('creates separate real Git worktrees whose files are independent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-rehearsal-trees-'))
  try {
    const trees = await createWorktrees(root, 'fresh-challenge')
    const original = await readFile(join(trees.reviewer, 'queue.mjs'), 'utf8')
    await writeFile(join(trees.builder, 'queue.mjs'), 'builder-only change')
    assert.equal(await readFile(join(trees.reviewer, 'queue.mjs'), 'utf8'), original)
    const list = await execute('git', ['worktree', 'list', '--porcelain'], { cwd: trees.builder })
    assert.equal(list.stdout.match(/^worktree /gm).length, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('maps both Actors to one linked worktree in shared mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-rehearsal-shared-'))
  try {
    const trees = await createWorktrees(root, 'shared-challenge', { shared: true })
    assert.equal(trees.builder, trees.reviewer)
    await writeFile(join(trees.builder, 'queue.mjs'), 'shared change')
    assert.equal(await readFile(join(trees.reviewer, 'queue.mjs'), 'utf8'), 'shared change')
    const list = await execute('git', ['worktree', 'list', '--porcelain'], { cwd: trees.builder })
    assert.equal(list.stdout.match(/^worktree /gm).length, 2)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('keeps three fixture worktrees independent and permits declared review evidence while rejecting extra code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-three-fixture-'))
  try {
    const trees = await createWorktrees(root, 'three-challenge', { actors: ['builder', 'reviewer-a', 'reviewer-b'] })
    const baseline = await readFile(join(trees['reviewer-b'], 'queue.mjs'), 'utf8')
    await writeFile(join(trees.builder, 'queue.mjs'), 'builder-only source')
    await writeFile(join(trees['reviewer-a'], 'review-result-round-1.json'), JSON.stringify({ kind: 'review-result' }))
    assert.equal(await readFile(join(trees['reviewer-b'], 'queue.mjs'), 'utf8'), baseline)
    await auditThreeAgentWorktree('builder', trees.builder)
    assert.match(await auditThreeAgentWorktree('reviewer-a', trees['reviewer-a']), /review-result-round-1.json/)
    await auditThreeAgentWorktree('reviewer-b', trees['reviewer-b'])
    await writeFile(join(trees['reviewer-a'], 'helper.mjs'), 'unexpected executable helper')
    await assert.rejects(auditThreeAgentWorktree('reviewer-a', trees['reviewer-a']), /Unexpected reviewer-a fixture files: helper.mjs/)
    const list = await execute('git', ['worktree', 'list', '--porcelain'], { cwd: trees.builder })
    assert.equal(list.stdout.match(/^worktree /gm).length, 4)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('relay forwards real bytes and drops only an accepted dispatch response', async () => {
  const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(upstream, 'listening')
  let dispatches = 0
  upstream.on('connection', socket => socket.on('message', (bytes, binary) => {
    assert.equal(binary, false, 'App Server JSON-RPC requires text frames')
    const request = JSON.parse(bytes)
    if (request.method === 'turn/start') {
      dispatches++
      socket.send(JSON.stringify({ id: request.id, result: { turn: { id: 'upstream-turn' } } }))
    } else socket.send(bytes, { binary })
  }))
  const proxy = new HarnessProxy(`ws://127.0.0.1:${upstream.address().port}`, { dropDispatchReply: true })
  const client = new WebSocket(await proxy.start())
  try {
    await once(client, 'open')
    const echo = once(client, 'message')
    client.send(JSON.stringify({ method: 'echo', value: 'unchanged' }))
    assert.equal(JSON.parse((await echo)[0]).value, 'unchanged')
    let replied = false
    client.on('message', () => { replied = true })
    const closed = once(client, 'close')
    client.send(JSON.stringify({ id: 1, method: 'turn/start', params: { threadId: 'real-thread', input: [{ type: 'text', text: 'Pardner delivery real-delivery. Actor: builder. Task: task.' }] } }))
    await closed
    assert.equal(dispatches, 1)
    assert.equal(replied, false)
    assert.deepEqual(proxy.events.map(event => event.type), ['dispatch', 'accepted', 'reply-dropped'])
    assert.equal(proxy.events[1].turnId, 'upstream-turn')
    assert.equal(proxy.events[0].deliveryId, 'real-delivery')
    assert.equal(proxy.events[1].deliveryId, 'real-delivery')
    assert.equal(proxy.events[0].submissionId, proxy.events[1].submissionId)
  } finally {
    client.terminate(); await proxy.close()
    for (const socket of upstream.clients) socket.terminate()
    await new Promise(resolve => upstream.close(resolve))
  }
})

it('delivery timing uses the exact submission even when reconciliation follows a later same-session turn', () => {
  const row = { id: 'first', actor: 'builder', turnId: 'turn-first', receivedAt: 1, contextPersistedAt: 2, dispatchedAt: 100 }
  const session = { threadId: 'thread' }
  const events = [
    { type: 'dispatch', threadId: 'thread', deliveryId: 'first', submissionId: 'rpc-first', at: 3 },
    { type: 'accepted', threadId: 'thread', deliveryId: 'first', submissionId: 'rpc-first', turnId: 'turn-first', at: 4 },
    { type: 'dispatch', threadId: 'thread', deliveryId: 'later', submissionId: 'rpc-later', at: 101 },
  ]
  const timing = deliveryTiming(row, session, events)
  assert.equal(timing.adapterSubmissionAt, 3)
  assert.equal(timing.synchronizedContextPersistedAt, 2)
  assert.equal(timing.acceptedAt, 4)
  assert.equal(timing.harnessReceiptRecordedAt, 100)
  assert.equal(timing.completedAt, null, 'Absent live completion is explicitly unmeasured')
  assert.throws(() => deliveryTiming({ ...row, contextPersistedAt: null }, session, events), /not measured/)
  assert.throws(() => deliveryTiming({ ...row, contextPersistedAt: 5 }, session, events), /out of order/)
  assert.throws(() => deliveryTiming({ ...row, id: 'other' }, session, events), /match this delivery/)
  assert.throws(() => deliveryTiming(row, session, events.slice(1)), /exact accepted request/)
})

it('process cleanup waits for descendants holding inherited pipes', async () => {
  const script = `const {spawn}=require('node:child_process'); spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']}); console.log('started'); setInterval(()=>{},1000)`
  const worker = startProcess(process.execPath, ['-e', script])
  try {
    await eventually(() => worker.output().stdout.includes('started'))
    await worker.stop()
    assert.notEqual(worker.child.signalCode, null)
  } finally { await worker.stop() }
})
