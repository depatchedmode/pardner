/**
 * Local filesystem storage adapter for Automerge Repo.
 *
 * This mirrors the behavior of the upstream nodefs adapter but uses
 * native fs APIs for range deletion to avoid bringing in rimraf/glob.
 */

import fs from 'fs'
import path from 'path'
import { atomicWrite } from './atomic-file.js'
import { isValidStorageKey, validateStorageKey } from './storage-key.js'

export class NodeFSStorageAdapter {
  constructor(baseDirectory = 'automerge-repo-data', { io = fs.promises } = {}) {
    this.baseDirectory = path.resolve(baseDirectory)
    this.io = io
    this.cache = {}
    this.pending = Promise.resolve()
  }

  enqueue(operation) {
    const result = this.pending.then(operation)
    // A failed operation is reported to its caller; later writes can retry.
    this.pending = result.catch(() => {})
    return result
  }

  async load(keyArray) {
    const filePath = this.getFilePath(keyArray)
    const key = getKey(keyArray)
    if (this.cache[key]) return this.cache[key].slice()

    try {
      const fileContent = await this.io.readFile(filePath)
      return new Uint8Array(fileContent)
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }

  async save(keyArray, binary) {
    const key = getKey(keyArray)
    const bytes = new Uint8Array(binary)
    const filePath = this.getFilePath(keyArray)
    return this.enqueue(async () => {
      await atomicWrite(filePath, bytes, this.io)
      this.cache[key] = bytes
    })
  }

  async remove(keyArray) {
    const filePath = this.getFilePath(keyArray)
    const key = getKey(keyArray)
    return this.enqueue(async () => {
      await this.io.rm(filePath, { force: true })
      delete this.cache[key]
    })
  }

  async loadRange(keyPrefix) {
    const dirPath = this.getFilePath(keyPrefix)
    const cachedKeys = this.cachedKeys(keyPrefix)
    const diskFiles = await walkdir(dirPath, this.io)

    // Foreign files such as .DS_Store or Thumbs.db are not chunks; skip them rather than fail the range.
    const diskKeys = diskFiles.map((fileName) => {
      const k = path.relative(this.baseDirectory, fileName)
      return k.slice(0, 2) + k.slice(3)
    }).filter((keyString) => isStoredKey(keyString.split(path.sep)))

    const allKeys = [...new Set([...cachedKeys, ...diskKeys])]

    const chunks = await Promise.all(
      allKeys.map(async (keyString) => {
        const key = keyString.split(path.sep)
        const data = await this.load(key)
        return { data, key }
      })
    )

    return chunks
  }

  async removeRange(keyPrefix) {
    const dirPath = this.getFilePath(keyPrefix)
    const prefix = [...keyPrefix]
    return this.enqueue(async () => {
      await this.io.rm(dirPath, { recursive: true, force: true })
      this.cachedKeys(prefix).forEach((key) => delete this.cache[key])
    })
  }

  cachedKeys(keyPrefix) {
    const cacheKeyPrefixString = getKey(keyPrefix)
    return Object.keys(this.cache).filter((key) =>
      key === cacheKeyPrefixString || key.startsWith(`${cacheKeyPrefixString}${path.sep}`)
    )
  }

  getFilePath(keyArray) {
    validateStorageKey(keyArray)
    const [firstKey, ...remainingKeys] = keyArray
    const filePath = path.resolve(
      this.baseDirectory,
      firstKey.slice(0, 2),
      firstKey.slice(2),
      ...remainingKeys
    )
    const relative = path.relative(this.baseDirectory, filePath)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw Object.assign(new Error('Storage path escapes its root'), { code: 'INVALID_STORAGE_KEY' })
    }
    return filePath
  }
}

// Automerge Repo 2.5.1 names snapshot and incremental chunks by a SHA-256 hex hash.
const HASHED_CHUNK_KINDS = new Set(['snapshot', 'incremental'])
const isStoredKey = (key) => isValidStorageKey(key) &&
  (!HASHED_CHUNK_KINDS.has(key[1]) || (key.length === 3 && /^[0-9a-f]{64}$/.test(key[2])))

const getKey = (key) => {
  validateStorageKey(key)
  return key.join(path.sep)
}

async function walkdir(dirPath, io) {
  try {
    const entries = await io.readdir(dirPath, { withFileTypes: true })
    const files = await Promise.all(entries.filter(entry => !entry.name.includes('.pardner-tmp-')).map((entry) => {
      const subpath = path.resolve(dirPath, entry.name)
      return entry.isDirectory() ? walkdir(subpath, io) : subpath
    }))
    return files.flat()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
