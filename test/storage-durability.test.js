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
    // Independent upstream loader, against identical persisted chunks. Activity is the runtime's own derivation
    // from each change, not part of the stored board, so only the reopened runtime below is compared on it.
    const { activity, ...board } = expected
    assert.ok(activity.length >= 40, 'every operation has an Activity entry')
    const upstream = new Repo({ storage: new NodeFSStorageAdapter(join(directory, 'repo')) })
    try {
      const handle = await upstream.find(url)
      const workspace = new Workspace({ repo: upstream, handle, replicaId: 'comparison' })
      assert.deepEqual(workspace.snapshot(), board)
    } finally { await upstream.shutdown() }
    for (const phase of ['during', 'after', 'derived', 'after']) {
      const child = fork(new URL('../support/open-process.js', import.meta.url), [directory, phase],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      try {
        const [message] = await once(child, 'message', { signal: AbortSignal.timeout(8000) })
        assert.notEqual(message.type, 'error', message.message)
        if (phase === 'during') assert.equal(message.type, 'opening')
        else {
          // The board is whole the moment it opens; its Activity follows once every change is derived again.
          const { activity: _partial, ...opened } = message.snapshot
          assert.deepEqual(opened, board)
          assert.equal(message.status.savedLocally, true)
          if (phase === 'derived') {
            const [derived] = await once(child, 'message', { signal: AbortSignal.timeout(8000) })
            assert.equal(derived.type, 'derived', derived.message)
            assert.deepEqual(derived.activity, activity)
          }
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

it('reopens a signed board and its signature document without rewriting either, and saves the first edit and its signature', { timeout: 60000 }, async () => {
  const { Repo } = await import('@automerge/automerge-repo')
  const { getHeads } = await import('@automerge/automerge')
  const { shardOf, signaturesDocumentUrl, storedSignatures, verifyChange } = await import('../lib/change-signatures.js')
  const { hubRuntime, testProject } = await import('../support/machines.js')
  const { eventually, operationOf, stateOf } = await import('../support/signed-hub.js')
  const actors = [{ id: 'writer', handle: 'writer', kind: 'human' }]
  const project = testProject({ members: 1 })
  const open = directory => hubRuntime(directory, { actors, project, attribution: { quietMs: 400, pollMs: 100 } }).init()
  const chunks = async directory => (await fs.readdir(join(directory, 'repo'), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)).sort()
  const signed = (runtime, taskId) => stateOf(runtime, operationOf(runtime, taskId)?.operationId) === 'signed'
  await withStorage(async directory => {
    let first, written
    let runtime = await open(directory)
    try {
      first = await runtime.execute({ operationId: 'signed-before-reopen', actorId: 'writer', type: 'task.create', payload: { title: 'Signed before reopen' } })
      await eventually(() => signed(runtime, first.result.taskId) && storedSignatures(runtime.workspace.signatures.doc(), first.heads[0]).length,
        'the first signature never reached the signature document')
    } finally { await runtime.close() }
    const stored = await chunks(directory)

    runtime = await open(directory)
    try {
      const status = runtime.status()
      assert.equal(status.savedLocally, true)
      assert.equal(status.signatures.savedLocally, true)
      assert.deepEqual(status.heads, first.heads)
      await eventually(() => signed(runtime, first.result.taskId), 'the reopened board lost its signer')
      assert.deepEqual(await chunks(directory), stored, 'reopening rewrote a stored document')

      const second = await runtime.execute({ operationId: 'signed-after-reopen', actorId: 'writer', type: 'task.create', payload: { title: 'Signed after reopen' } })
      assert.equal(second.savedLocally, true)
      assert.deepEqual(runtime.repo.persistedHeads.get(runtime.workspace.handle.documentId), second.heads)
      written = { taskId: second.result.taskId, hash: second.heads[0] }
      // The signature document is saved in the background, then again by close().
      await eventually(() => storedSignatures(runtime.workspace.signatures.doc(), written.hash).length, 'the signature was never written')
    } finally { await runtime.close() }

    // Both documents as an independent upstream loader reads them from disk.
    const upstream = new Repo({ storage: new NodeFSStorageAdapter(join(directory, 'repo')) })
    try {
      const board = await upstream.find(runtime.manifest.url)
      assert.deepEqual(getHeads(board.doc()), [written.hash])
      const signatures = await upstream.find(signaturesDocumentUrl(project.projectId))
      const [signature] = storedSignatures(signatures.doc(), written.hash)
      assert.ok(shardOf(written.hash) in signatures.doc())
      assert.equal(verifyChange(project.owner.publicKey, project.projectId, written.hash, signature), true)
    } finally { await upstream.shutdown() }

    runtime = await open(directory)
    try {
      assert.equal(runtime.getDoc().tasks[written.taskId].title, 'Signed after reopen')
      await eventually(() => signed(runtime, first.result.taskId) && signed(runtime, written.taskId), 'a change lost its signer after the second reopen')
    } finally { await runtime.close() }
  })
})

// Text that does not compress, so chunk sizes follow what was written.
function noise(length, seed = 209) {
  let text = ''
  while (text.length < length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    text += seed.toString(16)
  }
  return text.slice(0, length)
}

/** The chunks on disk for one document, read by a new adapter: `type/hash:bytes`. */
async function storedChunks(directory, documentId) {
  const adapter = new NodeFSStorageAdapter(directory)
  const chunks = []
  for (const type of ['snapshot', 'incremental']) {
    for (const { key, data } of await adapter.loadRange([documentId, type])) chunks.push(`${type}/${key[2]}:${data.length}`)
  }
  return chunks
}

it('opens a stored document without announcing every patch, and computes any later diff', async () => {
  const A = await import('@automerge/automerge')
  await withStorage(async directory => {
    const writer = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    let url
    try {
      const handle = writer.create({ tasks: {}, order: [] })
      for (let index = 0; index < 20; index++) {
        handle.change(doc => {
          doc.tasks[`task-${index}`] = { title: `Task ${index}`, labels: ['open', 'storage'] }
          doc.order.unshift(`task-${index}`)
        })
      }
      url = handle.url
      await writer.flush()
    } finally { await writer.shutdown() }
    const reader = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    try {
      const events = []
      reader.findWithProgress(url).handle.on('change', event => events.push(event))
      const handle = await reader.find(url)
      // Pins Automerge 3.2.3: DocHandle's first diff was answered from the patch cache. An event here means the
      // whole document is being diffed on every open again, and lib/durable-repo.js needs another look.
      assert.deepEqual(events, [], 'the whole document was diffed on open')
      const doc = handle.doc()
      const heads = A.getHeads(doc)
      const everything = A.diff(A.load(A.save(doc)), [], heads)
      assert.ok(everything.length > 40)
      // The shortcut was for that one question; the same question asked again is computed.
      assert.deepEqual(A.diff(doc, [], heads), everything)
      handle.change(value => { value.tasks['task-5'].title = 'After reopen' })
      assert.equal(events.length, 1)
      assert.ok(events[0].patches.every(patch => patch.path.slice(0, 3).join('/') === 'tasks/task-5/title'))
      assert.deepEqual(A.diff(handle.doc(), [], heads), everything)
      await reader.flush()
    } finally { await reader.shutdown() }
  })
})

it('saves a reopened document\'s edits as small chunks, compacts them as Repo does, and stays readable by Repo', async () => {
  const A = await import('@automerge/automerge')
  const { createHash } = await import('node:crypto')
  const { Repo } = await import('@automerge/automerge-repo')
  await withStorage(async directory => {
    const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
    const writer = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    let url, documentId
    try {
      // A document made in this process is saved by Repo itself: this is the layout the reopened one must keep.
      const handle = writer.create({ padding: noise(8000), edits: [] });
      ({ url, documentId } = handle)
      await writer.flush()
      const [snapshot] = await storedChunks(directory, documentId)
      assert.equal(snapshot.split(':')[0], `snapshot/${sha256(A.getHeads(handle.doc()).join(''))}`)
      handle.change(doc => { doc.edits.push('before reopen') })
      await writer.flush()
      const [incremental] = await new NodeFSStorageAdapter(directory).loadRange([documentId, 'incremental'])
      assert.equal(incremental.key[2], sha256(incremental.data))
    } finally { await writer.shutdown() }
    const saved = await storedChunks(directory, documentId)
    assert.equal(saved.length, 2)
    const snapshotBytes = Number(saved[0].split(':')[1])
    assert.ok(snapshotBytes >= 1024, 'the fixture must be large enough not to compact on every save')

    const reader = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    let expected
    try {
      const handle = await reader.find(url)
      await reader.flush()
      assert.deepEqual(await storedChunks(directory, documentId), saved, 'a read-only reopen rewrote the document')

      handle.change(doc => { doc.edits.push('first after reopen') })
      await reader.flush()
      const afterFirst = await storedChunks(directory, documentId)
      assert.equal(afterFirst.length, 3)
      assert.deepEqual(afterFirst.filter(chunk => saved.includes(chunk)), saved, 'the first edit rewrote a stored chunk')
      const [added] = afterFirst.filter(chunk => !saved.includes(chunk))
      const [, addedHash, addedBytes] = added.match(/^incremental\/([0-9a-f]{64}):(\d+)$/)
      assert.ok(Number(addedBytes) < 512, `the first edit after a reopen wrote ${addedBytes} bytes`)
      const written = (await new NodeFSStorageAdapter(directory).loadRange([documentId, 'incremental'])).find(chunk => chunk.key[2] === addedHash)
      assert.equal(addedHash, sha256(written.data))

      // Repo's rule: a save compacts once the incremental chunks have reached the snapshot's size, and not before.
      const incrementalBytes = list => list.slice(1).reduce((sum, chunk) => sum + Number(chunk.split(':')[1]), 0)
      let edits = 0, chunks = afterFirst
      while (chunks.length > 1) {
        const due = incrementalBytes(chunks) >= snapshotBytes
        handle.change(doc => { doc.edits.push(noise(3000, ++edits)) })
        await reader.flush()
        chunks = await storedChunks(directory, documentId)
        assert.equal(chunks.length === 1, due, `after edit ${edits}: ${chunks.map(chunk => chunk.replace(/\/[0-9a-f]+/, '')).join(' ')}`)
        assert.ok(edits < 20)
      }
      assert.ok(edits > 2, 'the fixture must write incremental chunks before it compacts')
      const heads = A.getHeads(handle.doc())
      assert.match(chunks[0], new RegExp(`^snapshot/${sha256(heads.join(''))}:`))

      handle.change(doc => { doc.edits.push('after compaction') })
      await reader.flush()
      assert.deepEqual((await storedChunks(directory, documentId)).map(chunk => chunk.split('/')[0]), ['snapshot', 'incremental'])
      expected = handle.doc()
      assert.deepEqual(reader.persistedHeads.get(documentId), A.getHeads(expected))
    } finally { await reader.shutdown() }

    const upstream = new Repo({ storage: new NodeFSStorageAdapter(directory) })
    try {
      const handle = await upstream.find(url)
      assert.deepEqual(A.getHeads(handle.doc()), A.getHeads(expected))
      assert.deepEqual(handle.doc(), expected)
    } finally { await upstream.shutdown() }
  })
})

it('keeps an edit whose compaction could not remove the chunks it replaced, and removes them at the next one', async () => {
  const A = await import('@automerge/automerge')
  await withStorage(async directory => {
    const writer = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    let url, documentId
    try {
      // Under 1,024 bytes of snapshot, so every changed save is a compaction.
      const handle = writer.create({ value: 'saved' });
      ({ url, documentId } = handle)
      await writer.flush()
    } finally { await writer.shutdown() }
    const [original] = await storedChunks(directory, documentId)
    const storage = new NodeFSStorageAdapter(directory)
    const remove = storage.remove.bind(storage)
    let fail = true
    storage.remove = async (...args) => {
      if (fail) throw Object.assign(new Error('injected removal failure'), { code: 'EIO' })
      return remove(...args)
    }
    const reader = new DurableRepo({ storage })
    try {
      const handle = await reader.find(url)
      await reader.flush()
      const before = reader.persistedHeads.get(documentId)
      handle.change(doc => { doc.value = 'edited' })
      await assert.rejects(reader.flush(), { code: 'EIO' })
      assert.deepEqual(reader.persistedHeads.get(documentId), before, 'a failed save was reported as persisted')
      const interrupted = await storedChunks(directory, documentId)
      assert.equal(interrupted.length, 2)
      assert.ok(interrupted.includes(original))
      // Both snapshots on disk, as after a crash between the write and the removal: a new process reads the edit.
      const crashed = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
      try { assert.equal((await crashed.find(url)).doc().value, 'edited') } finally { await crashed.shutdown() }

      fail = false
      await reader.flush()
      assert.deepEqual(reader.persistedHeads.get(documentId), A.getHeads(handle.doc()))
      assert.deepEqual(await storedChunks(directory, documentId), interrupted, 'the retry wrote the document again')
      handle.change(doc => { doc.value = 'edited again' })
      await reader.flush()
      const compacted = await storedChunks(directory, documentId)
      assert.equal(compacted.length, 1)
      assert.ok(!interrupted.includes(compacted[0]))
    } finally { fail = false; await reader.shutdown() }
    const final = new DurableRepo({ storage: new NodeFSStorageAdapter(directory) })
    try { assert.equal((await final.find(url)).doc().value, 'edited again') } finally { await final.shutdown() }
  })
})
