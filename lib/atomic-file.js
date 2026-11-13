import fs from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Marker substring for crash-safer temp files; empty-dir enrollment must allow these names. */
export const PARDNER_TMP_MARKER = '.pardner-tmp-'

export async function atomicWrite(filePath, bytes, io = fs) {
  const temporaryPath = `${filePath}${PARDNER_TMP_MARKER}${randomUUID()}`
  await io.mkdir(dirname(filePath), { recursive: true })
  try {
    const handle = await io.open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await io.rename(temporaryPath, filePath)
  } finally {
    await io.rm(temporaryPath, { force: true })
  }
}
