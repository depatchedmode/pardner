import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { ensurePrivateDirectory, preparePrivateDatabase } from './private-state.js'
import { OperationError } from './workspace-schema.js'

/** The operating system releases this SQLite lock even after an abrupt exit. */
export async function acquireStorageLease(directory) {
  ensurePrivateDirectory(directory)
  const path = join(directory, 'runtime-lock.sqlite')
  preparePrivateDatabase(path)
  const database = new DatabaseSync(path)
  try {
    database.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE')
  } catch (error) {
    database.close()
    if (error.errcode === 5) {
      throw new OperationError('STORAGE_IN_USE', 'Another Pardner service is using this storage directory')
    }
    throw error
  }
  return database
}
