import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Repo } from '@automerge/automerge-repo'
import { NodeFSStorageAdapter } from '../lib/nodefs-storage-adapter.js'

const invalidComponents = [
  '', '.', '..', '../outside', '..\\outside', '/tmp/outside', '\\outside',
  'C:\\outside', 'C:outside', '\\\\server\\share', 'a/b', 'a\\b', 'a\0b',
  '%2f', '%2F', '%5c', '%252f', '..%2foutside', 'CON', 'nul.txt', 'LPT1',
  'COM9.log', 'file:stream', 'trailing.', 'trailing ', 'a*', 'a?', 'a\n',
  null, undefined, 42, {}, [],
]
const validKey = ['abcdef', 'sync-state', 'peer-123']

async function withStorage(run) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'pardner-key-security-'))
  try {
    await run(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('storage key containment', () => {
  for (const method of ['load', 'save', 'remove', 'loadRange', 'removeRange']) {
    it(`${method} rejects unsafe keys in every position before any filesystem access`, async () => {
      const calls = []
      const io = new Proxy({}, { get: (_target, name) => async (...args) => {
        calls.push({ name, args })
        throw new Error('Unexpected filesystem access')
      } })
      const adapter = new NodeFSStorageAdapter('/unused/repo', { io })
      const invalidKeys = [[], null, 'not-an-array', new Array(1)]
      for (const component of invalidComponents) {
        for (let position = 0; position < validKey.length; position++) {
          const key = [...validKey]
          key[position] = component
          invalidKeys.push(key)
        }
      }
      for (const key of invalidKeys) {
        await assert.rejects(adapter[method](key, new Uint8Array([1])), { code: 'INVALID_STORAGE_KEY' })
      }
      assert.deepEqual(calls, [])
    })
  }

  it('blocks the reported escape without reading, overwriting, or deleting the outside file', async () => {
    await withStorage(async directory => {
      const outside = join(directory, 'outside')
      await fs.writeFile(outside, 'keep this file')
      const adapter = new NodeFSStorageAdapter(join(directory, 'repo'))
      const attack = ['abcdef', 'sync-state', '../../../../outside']
      for (const method of ['load', 'save', 'remove', 'loadRange', 'removeRange']) {
        await assert.rejects(adapter[method](attack, new Uint8Array([9])), { code: 'INVALID_STORAGE_KEY' })
        assert.equal(await fs.readFile(outside, 'utf8'), 'keep this file')
      }
    })
  })

  it('validates before returning a cached value for a normalized traversal alias', async () => {
    await withStorage(async directory => {
      const adapter = new NodeFSStorageAdapter(directory)
      await adapter.save(validKey, new Uint8Array([1]))
      await assert.rejects(adapter.load(['abcdef', 'unused', '..', 'sync-state', 'peer-123']),
        { code: 'INVALID_STORAGE_KEY' })
      assert.deepEqual(await adapter.load(validKey), new Uint8Array([1]))
    })
  })

  it('retains the existing disk layout and supports cold reads, ranges, and deletions', async () => {
    await withStorage(async directory => {
      const adapter = new NodeFSStorageAdapter(directory)
      await fs.mkdir(join(directory, 'ab', 'cdef', 'sync-state'), { recursive: true })
      await fs.writeFile(join(directory, 'ab', 'cdef', 'sync-state', 'peer-123'), new Uint8Array([1]))
      assert.deepEqual(await adapter.load(validKey), new Uint8Array([1]))
      const neighbor = ['abcdef', 'sync-state-other', 'peer-456']
      await adapter.save(neighbor, new Uint8Array([2]))
      assert.deepEqual(await adapter.loadRange(['abcdef', 'sync-state']),
        [{ key: validKey, data: new Uint8Array([1]) }])
      await adapter.removeRange(['abcdef', 'sync-state'])
      assert.equal(await adapter.load(validKey), undefined)
      assert.deepEqual(await adapter.load(neighbor), new Uint8Array([2]))
      await adapter.remove(neighbor)
      assert.equal(await new NodeFSStorageAdapter(directory).load(neighbor), undefined)
    })
  })

  it('loads documents whose chunk directories hold foreign files', async () => {
    await withStorage(async directory => {
      // Repo saves its storage ID in the background; settle it before the directory is removed.
      const writer = new Repo({ storage: new NodeFSStorageAdapter(directory), network: [] })
      await writer.storageId()
      const handle = writer.create({ count: 1 })
      handle.change(doc => { doc.count = 2 })
      await writer.flush()
      await writer.shutdown()
      const documentDirectory = join(directory, handle.documentId.slice(0, 2), handle.documentId.slice(2))
      for (const kind of await fs.readdir(documentDirectory)) {
        // Thumbs.db sorts before hex chunk names, so Automerge would parse it first.
        for (const name of ['.DS_Store', 'Thumbs.db', '4913', 'chunk~', 'notes.txt.swp']) {
          await fs.writeFile(join(documentDirectory, kind, name), 'not an Automerge chunk')
        }
      }
      const adapter = new NodeFSStorageAdapter(directory)
      const chunks = await adapter.loadRange([handle.documentId])
      assert.ok(chunks.length > 0)
      assert.ok(chunks.every(({ key }) => /^[0-9a-f]{64}$/.test(key[2])))
      const reader = new Repo({ storage: adapter, network: [] })
      await reader.storageId()
      try {
        assert.deepEqual((await reader.find(handle.documentId)).doc(), { count: 2 })
      } finally {
        await reader.flush()
        await reader.shutdown()
      }
    })
  })

  for (const method of ['remove', 'removeRange']) {
    it(`${method} captures the validated key before entering its write queue`, async () => {
      await withStorage(async directory => {
        const adapter = new NodeFSStorageAdapter(join(directory, 'repo'))
        const outside = join(directory, 'outside')
        await fs.writeFile(outside, 'keep this file')
        await adapter.save(validKey, new Uint8Array([1]))
        let release
        adapter.pending = new Promise(resolve => { release = resolve })
        const key = [...validKey]
        const removed = adapter[method](key)
        key[2] = '../../../../outside'
        release()
        await removed
        assert.equal(await adapter.load(validKey), undefined)
        assert.equal(await fs.readFile(outside, 'utf8'), 'keep this file')
      })
    })
  }
})
