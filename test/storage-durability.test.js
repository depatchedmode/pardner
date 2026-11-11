import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'
import { DurableRepo } from '../lib/durable-repo.js'

// Automerge names snapshot chunks by a SHA-256 hex hash.
const key = ['abcdef', 'snapshot', 'a1'.repeat(32)]

async function withStorage(run) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'pardner-storage-'))
  try {
    await run(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('local persistence qualification', () => {
  it('reports background failures, rejects unsaved flushes, and retries without losing operations', async () => {
    await withStorage(async directory => {
      let fail = false
      const storage = new NodeFSStorageAdapter(directory, { io: {
        ...fs,
        rename: async (...args) => {
          if (fail) throw Object.assign(new Error('disk failure'), { code: 'EIO' })
          return fs.rename(...args)
        },
      } })
      const repo = new DurableRepo({ storage, saveDebounceRate: 0 })
      try {
        await repo.ready
        fail = true
        const failed = once(repo, 'storage-error', { signal: AbortSignal.timeout(2000) })
        const handle = repo.create({ title: 'must survive retry' })
        await failed
        await assert.rejects(repo.flush(), { code: 'EIO' })
        assert.equal(repo.persistedHeads.has(handle.documentId), false)
        fail = false
        await repo.flush()
        assert.equal(repo.storageError, null)
        await repo.shutdown()
        const reopened = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
        try {
          assert.equal((await reopened.find(handle.url)).doc().title, 'must survive retry')
        } finally {
          await reopened.shutdown()
        }
      } finally {
        fail = false
        await repo.shutdown()
      }
    })
  })

  it('acknowledged Automerge operations survive SIGKILL and offline cold startup', { timeout: 15000 }, async () => {
    await withStorage(async directory => {
      const children = []
      const start = (url) => {
        const child = fork(new URL('../support/persistence-process.js', import.meta.url),
          [directory, ...(url ? [url] : [])], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
        children.push(child)
        return child
      }
      const receive = async (child) => {
        const [message] = await once(child, 'message', { signal: AbortSignal.timeout(8000) })
        assert.notEqual(message.type, 'error', message.message)
        return message
      }
      const kill = async child => {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
      try {
        const writer = start()
        const receipt = await receive(writer)
        assert.equal(receipt.type, 'saved')
        assert.ok(receipt.compactions >= 2, 'exercise repeated snapshot compaction before termination')
        await kill(writer)
        const reader = start(receipt.url)
        const restored = await receive(reader)
        assert.equal(restored.type, 'loaded')
        assert.deepEqual(restored.heads, receipt.heads)
        assert.equal(restored.doc.counter, 100)
        assert.equal(Object.keys(restored.doc.operations).length, 100)
        for (let index = 0; index < 100; index++) {
          assert.deepEqual(restored.doc.operations[`operation-${index}`], { actor: 'builder', value: index })
        }
        const nextReceipt = receive(reader)
        reader.send('append')
        const savedAgain = await nextReceipt
        assert.equal(savedAgain.type, 'saved-again')
        await kill(reader)
        const finalReader = start(receipt.url)
        const finalState = await receive(finalReader)
        assert.equal(finalState.doc.counter, 101)
        assert.deepEqual(finalState.doc.operations['after-restart'], { actor: 'reviewer', value: 100 })
        assert.deepEqual(finalState.heads, savedAgain.heads)
      } finally {
        await Promise.all(children.filter(child => child.exitCode === null && child.signalCode === null).map(kill))
      }
    })
  })

  it('failed replacement preserves the last acknowledged value in memory and on disk', async () => {
    await withStorage(async directory => {
      let fail = false
      const adapter = new NodeFSStorageAdapter(directory, {
        io: {
          ...fs,
          rename: async (...args) => {
            if (fail) throw Object.assign(new Error('disk failure'), { code: 'EIO' })
            return fs.rename(...args)
          },
        },
      })
      await adapter.save(key, new Uint8Array([1]))
      fail = true
      await assert.rejects(adapter.save(key, new Uint8Array([2])), { code: 'EIO' })
      assert.deepEqual(await adapter.load(key), new Uint8Array([1]))
      assert.deepEqual(await new NodeFSStorageAdapter(directory).load(key), new Uint8Array([1]))
      fail = false
      await adapter.save(key, new Uint8Array([3]))
      assert.deepEqual(await new NodeFSStorageAdapter(directory).load(key), new Uint8Array([3]))
    })
  })

  it('ignores incomplete temporary files left by an interrupted replacement', async () => {
    await withStorage(async directory => {
      const adapter = new NodeFSStorageAdapter(directory)
      await adapter.save(key, new Uint8Array([1]))
      await fs.writeFile(`${adapter.getFilePath(key)}.pardner-tmp-interrupted`, new Uint8Array([9]))
      const chunks = await new NodeFSStorageAdapter(directory).loadRange(['abcdef', 'snapshot'])
      assert.deepEqual(chunks, [{ key, data: new Uint8Array([1]) }])
    })
  })

  it('owns saved bytes independently of caller and reader buffers', async () => {
    await withStorage(async directory => {
      const adapter = new NodeFSStorageAdapter(directory)
      const bytes = new Uint8Array([1])
      await adapter.save(key, bytes)
      bytes[0] = 2
      const loaded = await adapter.load(key)
      assert.deepEqual(loaded, new Uint8Array([1]))
      loaded[0] = 3
      assert.deepEqual(await adapter.load(key), new Uint8Array([1]))
    })
  })

  it('range deletion respects key boundaries in cache as well as on disk', async () => {
    await withStorage(async directory => {
      const adapter = new NodeFSStorageAdapter(directory)
      const neighbor = ['abcdef', 'snapshot-other', 'one']
      await adapter.save(key, new Uint8Array([1]))
      await adapter.save(neighbor, new Uint8Array([2]))
      await adapter.removeRange(['abcdef', 'snapshot'])
      assert.equal(await adapter.load(key), undefined)
      assert.deepEqual(await adapter.load(neighbor), new Uint8Array([2]))
      assert.deepEqual(await adapter.loadRange(['abcdef', 'snapshot']), [])
    })
  })
})

it('reopening preserves upstream heads and board views across kills during and immediately after open', { timeout: 20000 }, async () => {
  const { Repo } = await import('@automerge/automerge-repo')
  const { WorkspaceRuntime } = await import('../lib/workspace-runtime.js')
  const { Workspace } = await import('../lib/workspace.js')
  await withStorage(async directory => {
    const runtime = await new WorkspaceRuntime({ directory, actors: [{ id: 'writer', handle: 'writer', kind: 'human' }] }).init()
    let expected, url
    try {
      for (let index = 0; index < 20; index++) {
        const receipt = await runtime.execute({ operationId: `open-${index}`, actorId: 'writer', type: 'task.create',
          payload: { title: `Task ${index}`, description: 'Persist this description. '.repeat(80) } })
        await runtime.execute({ operationId: `comment-${index}`, actorId: 'writer', type: 'comment.add',
          payload: { taskId: receipt.result.taskId, text: 'This acknowledged comment must survive.' } })
      }
      expected = runtime.getDoc()
      url = runtime.docHandle.url
    } finally { await runtime.close() }
    // Independent upstream loader, against identical persisted chunks.
    const upstream = new Repo({ storage: new NodeFSStorageAdapter(join(directory, 'repo')) })
    try {
      const handle = await upstream.find(url)
      const workspace = new Workspace({ repo: upstream, handle, replicaId: 'comparison' })
      assert.deepEqual(workspace.snapshot(), expected)
    } finally { await upstream.shutdown() }
    for (const phase of ['during', 'after', 'after']) {
      const child = fork(new URL('../support/open-process.js', import.meta.url), [directory, phase],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      try {
        const [message] = await once(child, 'message', { signal: AbortSignal.timeout(8000) })
        assert.notEqual(message.type, 'error', message.message)
        if (phase === 'during') assert.equal(message.type, 'opening')
        else {
          assert.deepEqual(message.snapshot, expected)
          assert.equal(message.status.savedLocally, true)
        }
      } finally {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
    }
  })
})

it('does not rewrite a loaded document, but barriers the first edit and retries a failed save', async () => {
  await withStorage(async directory => {
    const writer = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    let url
    try {
      const handle = writer.create({ value: 'acknowledged', padding: 'snapshot'.repeat(1000) })
      url = handle.url
      await writer.flush()
      handle.change(doc => { doc.value = 'incremental' })
      await writer.flush()
    } finally { await writer.shutdown() }
    const storage = new NodeFSStorageAdapter(directory)
    const save = storage.save.bind(storage)
    let writes = 0, fail = true
    storage.save = async (...args) => {
      writes++
      if (fail) throw new Error('injected first-save failure')
      return save(...args)
    }
    const reopened = new DurableRepo({ storage })
    try {
      const handle = await reopened.find(url)
      await reopened.flush()
      assert.equal(writes, 0, 'read-only open must not rewrite stored history')
      assert.equal(handle.doc().value, 'incremental')
      const before = reopened.persistedHeads.get(handle.documentId)
      handle.change(doc => { doc.value = 'after-reopen' })
      await assert.rejects(reopened.flush(), /injected first-save failure/)
      assert.deepEqual(reopened.persistedHeads.get(handle.documentId), before)
      fail = false
      await reopened.flush()
      assert.notDeepEqual(reopened.persistedHeads.get(handle.documentId), before)
      await reopened.shutdown()
      const final = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
      try { assert.equal((await final.find(url)).doc().value, 'after-reopen') }
      finally { await final.shutdown() }
    } finally { fail = false; await reopened.shutdown() }
  })
})

it('loads overlapping snapshots and concurrent incremental tails without dropping history', async () => {
  const A = await import('@automerge/automerge')
  const { createHash } = await import('node:crypto')
  await withStorage(async directory => {
    const storage = new NodeFSStorageAdapter(directory)
    const writer = new DurableRepo({ storage })
    const handle = writer.create({ left: 0, right: 0 })
    await writer.flush()
    const base = handle.doc()
    const left = A.change(A.clone(base), doc => { doc.left = 1 })
    const right = A.change(A.clone(base), doc => { doc.right = 2 })
    const expected = A.merge(A.clone(left), right)
    await writer.shutdown()
    const chunks = [['snapshot', A.save(base)], ['snapshot', A.save(left)], ['incremental', A.saveSince(right, A.getHeads(base))]]
    for (const [kind, bytes] of chunks) await storage.save([handle.documentId, kind, createHash('sha256').update(bytes).digest('hex')], bytes)
    const reader = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    try {
      const reopened = await reader.find(handle.url)
      assert.deepEqual(A.getHeads(reopened.doc()), A.getHeads(expected))
      assert.deepEqual(reopened.doc(), expected)
      await reader.flush()
    } finally { await reader.shutdown() }
  })
})
