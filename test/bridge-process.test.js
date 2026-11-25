import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocketServer } from 'ws'
import { BridgeInbox } from '../lib/bridge-inbox.js'
import { withWorkspaceServer } from '../support/workspace-test.js'

it('SIGKILL during a real CLI dispatch preserves intake and reconciles without another turn/start', { timeout: 15000 }, () => withWorkspaceServer(async ({ directory, server, create, context, operation }) => {
  const root = await mkdtemp(join(tmpdir(), 'pardner-bridge-process-'))
  const harness = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(harness, 'listening')
  const children = []
  let inbox
  const turns = []
  let dispatchCount = 0
  const worktree = await realpath(root)
  harness.on('connection', socket => socket.on('message', bytes => {
    const message = JSON.parse(bytes.toString())
    if (message.id === undefined) return
    let result = {}
    if (message.method === 'thread/resume') result = { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } }
    if (message.method === 'thread/read') result = { thread: { id: 'thread-one', cwd: worktree, status: { type: 'idle' }, turns } }
    if (message.method === 'turn/start') {
      dispatchCount++
      turns.push({ id: 'accepted-before-kill', items: [{ type: 'userMessage', content: message.params.input }] })
      // Hold the reply until the caller is killed; the harness has already accepted it.
      return
    }
    socket.send(JSON.stringify({ id: message.id, result }))
  }))
  async function stop(child, signal) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit'); child.kill(signal); await exited
  }
  async function eventually(check) {
    const deadline = Date.now() + 5000
    while (!check()) { assert.ok(Date.now() < deadline, 'CLI bridge did not reach expected state'); await delay(10) }
  }
  try {
    const taskId = await create()
    const config = { workspaceId: server.store.manifest.workspaceId, replicaId: server.store.manifest.replicaId,
      dataDirectory: directory, inboxDirectory: join(root, 'bridge'), mappings: [{ actorId: 'builder', enabled: true,
        adapter: 'codex-app-server', sessionOwner: 'bridge', endpoint: `ws://127.0.0.1:${harness.address().port}`,
        expectedPolicy: { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } },
        threadId: 'thread-one', worktree, allowedTaskIds: [taskId], allowedFromActorIds: ['alice'] }] }
    const configPath = join(root, 'config.json')
    await writeFile(configPath, JSON.stringify(config))
    await writeFile(join(directory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${server.httpPort}`, token: 'test-token' }), { mode: 0o600 })
    const { revisions } = await context(taskId)
    await operation('task.handoff', { taskId, to: 'builder', message: 'Scoped crash fixture',
      expectedRevisions: { assignee: revisions.assignee } })
    const launch = () => {
      const child = spawn(process.execPath, ['bin/pardner.js', 'bridge', 'run', '--config', configPath], { stdio: ['ignore', 'pipe', 'pipe'] })
      children.push(child); child.stdout.resume(); child.stderr.resume()
      return child
    }
    const first = launch()
    await eventually(() => dispatchCount === 1)
    await stop(first, 'SIGKILL')
    inbox = new BridgeInbox(join(config.inboxDirectory, 'inbox.sqlite'), { workspaceId: config.workspaceId, replicaId: config.replicaId })
    assert.equal(inbox.rows()[0].state, 'dispatching')
    assert.equal((await server.store.pendingDeliveries('builder')).mentions.length, 0)
    const second = launch()
    await eventually(() => inbox.rows()[0].state === 'accepted')
    assert.equal(inbox.rows()[0].turn_id, 'accepted-before-kill')
    assert.equal(dispatchCount, 1)
    await stop(second, 'SIGTERM')
    assert.equal(second.exitCode, 0)
  } finally {
    for (const child of children) await stop(child, 'SIGKILL')
    inbox?.close()
    for (const client of harness.clients) client.terminate()
    await new Promise(resolve => harness.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
}))
