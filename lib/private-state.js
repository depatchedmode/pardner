import { constants, openSync, closeSync, fstatSync, fchmodSync, mkdirSync, writeFileSync, ftruncateSync } from 'node:fs'

function withPrivateHandle(path, flags, mode, directory, operation) {
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, mode)
  try {
    const stat = fstatSync(fd)
    if ((directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
        (process.getuid && stat.uid !== process.getuid())) {
      throw new Error(`Unsafe private state path: ${path}`)
    }
    fchmodSync(fd, mode)
    return operation?.(fd)
  } finally {
    closeSync(fd)
  }
}

export function ensurePrivateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  withPrivateHandle(path, constants.O_RDONLY | constants.O_DIRECTORY, 0o700, true)
}

export function ensurePrivateFile(path, { create = true } = {}) {
  try {
    withPrivateHandle(path, constants.O_RDWR | (create ? constants.O_CREAT : 0), 0o600, false)
  } catch (error) {
    if (!create && error.code === 'ENOENT') return
    throw error
  }
}

export function preparePrivateDatabase(path) {
  if (path === ':memory:') return
  ensurePrivateFile(path)
  // SQLite derives new sidecar modes from the database; repair existing ones before opening it.
  for (const suffix of ['-wal', '-shm', '-journal']) {
    ensurePrivateFile(`${path}${suffix}`, { create: false })
  }
}

export function writePrivateFile(path, contents) {
  withPrivateHandle(path, constants.O_RDWR | constants.O_CREAT, 0o600, false, fd => {
    ftruncateSync(fd, 0)
    writeFileSync(fd, contents)
  })
}
