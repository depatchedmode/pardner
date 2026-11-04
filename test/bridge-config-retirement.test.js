import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { access, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AgentBridge, BridgeSource, bridgeConfig, openBridgeInbox, runBridgeCommand } from '../lib/agent-bridge.js'
import { retireCompletedBridge, moveArchivedWorktree } from '../lib/bridge-retirement.js'
import { canonical } from '../lib/workspace-schema.js'
import { createWorktrees } from '../support/bridge-rehearsal.js'
import { withWorkspaceServer } from '../support/workspace-test.js'

for (const alias of ['direct', 'parent']) {
  it(`reloads canonical retirement identity through a ${alias} symlink after an interrupted move`, () => withWorkspaceServer(async ({ directory, server, create, update }) => {
    const root = await mkdtemp(join(tmpdir(), 'pardner-bridge-config-retirement-'))
    let inbox, bridge
    try {
      const trees = await createWorktrees(root, 'config-restart')
      const aliasPath = join(root, 'checkout-alias')
      await symlink(alias === 'direct' ? trees.builder : root, aliasPath, 'dir')
      const paths = alias === 'direct' ? { ...trees, builder: aliasPath }
        : { builder: join(aliasPath, 'builder'), reviewer: join(aliasPath, 'reviewer') }
      const taskId = await create()
      assert.equal((await update(taskId, { status: 'completed' })).success, true)
      await writeFile(join(directory, 'connection.json'), JSON.stringify({ httpUrl: `http://127.0.0.1:${server.httpPort}`, token: 'test-token' }))
      const raw = { workspaceId: server.store.manifest.workspaceId, replicaId: server.store.manifest.replicaId,
        dataDirectory: directory, inboxDirectory: join(root, 'inbox'), completionCleanup: { archiveDirectory: join(root, 'archive') },
        mappings: ['builder', 'reviewer'].map(actorId => ({ actorId, enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge',
          endpoint: 'ws://127.0.0.1:9001', threadId: actorId,
          worktree: paths[actorId],
          expectedPolicy: { approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: { type: 'readOnly' } },
          allowedTaskIds: [taskId], allowedFromActorIds: ['alice'] })) }
      const path = join(root, 'config.json')
      await writeFile(path, JSON.stringify(raw))
      const config = await bridgeConfig(path), signature = canonical(config.mappings)
      const archives = []
      const adapterFactory = () => Object.assign(new EventEmitter(), {
        availability: async mapping => { assert.ok(!archives.includes(mapping.threadId), 'Archived threads must not resume'); return 'ready' },
        isArchived: async mapping => archives.includes(mapping.threadId), worktreeThreads: async () => [], close() {},
        archive: async mapping => { assert.ok(!archives.includes(mapping.threadId), 'Successful archives must not repeat'); archives.push(mapping.threadId) },
      })
      inbox = await openBridgeInbox(config)
      bridge = new AgentBridge({ config, inbox, source: new BridgeSource(config), adapterFactory })
      await update(taskId, { status: 'in-progress' })
      await assert.rejects(runBridgeCommand('approve-cleanup', { config: path }), { code: 'CLEANUP_NOT_ELIGIBLE' })
      assert.equal(inbox.cleanupApproval(), null)
      await update(taskId, { status: 'completed' })
      const approval = await runBridgeCommand('approve-cleanup', { config: path })
      assert.equal(approval.approved, true)
      await assert.rejects(retireCompletedBridge(bridge, { move: async plan => {
        await moveArchivedWorktree(plan)
        throw new Error('Interrupted after first move')
      } }), /Interrupted after first move/)
      await assert.rejects(access(trees.builder), { code: 'ENOENT' })
      await access(trees.reviewer)
      const retirement = inbox.retirement()
      assert.equal(retirement.signature, signature)
      assert.deepEqual(archives, ['builder', 'reviewer'])
      await bridge.stop(); bridge = null
      inbox.close(); inbox = null

      const reloaded = await bridgeConfig(path)
      assert.deepEqual(reloaded.mappings, config.mappings)
      assert.equal(canonical(reloaded.mappings), signature)
      inbox = await openBridgeInbox(reloaded)
      assert.deepEqual(inbox.retirement(), retirement)
      inbox.recover()
      bridge = new AgentBridge({ config: reloaded, inbox, source: new BridgeSource(reloaded), adapterFactory })
      const changed = structuredClone(reloaded)
      changed.mappings[0].threadId = 'different-thread'
      await assert.rejects(retireCompletedBridge({ ...bridge, config: changed }), /Retiring bridge mappings changed/)
      assert.deepEqual(inbox.retirement(), retirement)
      await access(trees.reviewer)
      assert.deepEqual(await runBridgeCommand('revoke-cleanup', { config: path }), { revoked: true })
      await retireCompletedBridge(bridge)
      assert.equal(inbox.retirement().state, 'archiving')
      await access(trees.reviewer)
      await runBridgeCommand('approve-cleanup', { config: path })
      await retireCompletedBridge(bridge)
      assert.equal(inbox.retirement().state, 'archived')
      assert.equal(inbox.retirement().signature, signature)
      for (const plan of retirement.worktrees) {
        await access(plan.destination)
        await assert.rejects(access(plan.source), { code: 'ENOENT' })
      }
      assert.deepEqual(archives, ['builder', 'reviewer'])

      await writeFile(path, JSON.stringify({ ...raw, completionCleanup: undefined }))
      await assert.rejects(bridgeConfig(path), { code: 'ENOENT' })
      const loop = join(root, 'loop')
      await symlink(loop, loop)
      for (const completionCleanup of [undefined, raw.completionCleanup]) {
        await writeFile(path, JSON.stringify({ ...raw, completionCleanup,
          mappings: raw.mappings.map(mapping => ({ ...mapping, worktree: loop })) }))
        await assert.rejects(bridgeConfig(path), { code: 'ELOOP' })
      }
    } finally {
      await bridge?.stop(); inbox?.close()
      await rm(root, { recursive: true, force: true })
    }
  }))
}
