import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const [oldSource, newSource, output] = process.argv.slice(2)
const load = source => import(pathToFileURL(join(resolve(source), 'lib/workspace-runtime.js')))
const { WorkspaceRuntime: OldRuntime } = await load(oldSource)
const { WorkspaceRuntime: NewRuntime } = await load(newSource)
const directory = await mkdtemp(join(tmpdir(), 'pardner-schema-compatibility-'))
const old = new OldRuntime({directory, actors:[{id:'alice',handle:'alice',kind:'human'}]})
const next = new NewRuntime({directory})
async function hashes(relative='') {
  const result={}
  for (const entry of await readdir(join(directory,relative),{withFileTypes:true})) {
    const name=join(relative,entry.name)
    // Runtime ownership SQLite is allowed to acquire/release a process lease.
    if (!relative && entry.name.startsWith('runtime-lock.sqlite')) continue
    if (entry.isDirectory()) Object.assign(result,await hashes(name))
    else result[name]=createHash('sha256').update(await readFile(join(directory,name))).digest('hex')
  }
  return result
}
try {
  await old.init()
  assert.equal(old.manifest.schemaVersion,4)
  const receipt=await old.execute({operationId:'preserved-schema4',actorId:'alice',type:'task.create',payload:{title:'Preserve older installation'}})
  assert.equal(receipt.savedLocally,true)
  await old.close()
  const before=await hashes()
  await assert.rejects(next.init(),{code:'INCOMPATIBLE_SCHEMA'})
  const after=await hashes()
  assert.deepEqual(after,before)
  await writeFile(output,JSON.stringify({oldSource:resolve(oldSource),newSource:resolve(newSource),result:'passed',error:'INCOMPATIBLE_SCHEMA',receipt,files:before,unchanged:true,exclusion:'runtime ownership SQLite lease files'},null,2))
} finally {
  await old.close();await next.close();await rm(directory,{recursive:true,force:true})
}
