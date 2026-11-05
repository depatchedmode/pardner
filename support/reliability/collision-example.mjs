// Independent before/after diagnostic; no transport, browser or recovery claim.
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
const [subjectArg, output] = process.argv.slice(2)
const subject=resolve(subjectArg)
const load=relative=>import(pathToFileURL(join(subject,relative)))
const {DurableRepo}=await load('lib/durable-repo.js')
const {NodeFSStorageAdapter}=await load('lib/nodefs-storage-adapter.js')
const {Workspace,createWorkspaceData}=await load('lib/workspace.js')
const {save}=await import(pathToFileURL(join(subject,'node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_node.js')))
const root=await mkdtemp(join(tmpdir(),'pardner-collision-example-'))
const repos=[]
try {
  const leftRepo=new DurableRepo({storage:new NodeFSStorageAdapter(join(root,'left'))});repos.push(leftRepo)
  const left=new Workspace({repo:leftRepo,handle:leftRepo.create(createWorkspaceData({actors:[{id:'alice',handle:'alice',kind:'human'}]})),replicaId:'left'})
  const rightRepo=new DurableRepo({storage:new NodeFSStorageAdapter(join(root,'right'))});repos.push(rightRepo)
  const right=new Workspace({repo:rightRepo,handle:rightRepo.import(save(left.handle.doc())),replicaId:'right'})
  const intents=['First acknowledged request','Second acknowledged request'].map(title=>({operationId:'same-key',type:'task.create',actorId:'alice',payload:{title}}))
  await writeFile(output+'.intents.json',JSON.stringify(intents,null,2))
  const receipts=[]
  for(const [i,workspace] of [left,right].entries()) receipts.push(await workspace.execute(intents[i]))
  left.handle.merge(right.handle);await leftRepo.flush()
  const snapshot=left.snapshot()
  const contexts=Object.keys(snapshot.tasks).map(id=>left.taskContext(id))
  await writeFile(output,JSON.stringify({subject,receipts,taskCount:contexts.length,historyCount:new Set(contexts.flatMap(c=>c.history.map(e=>e.operationId))).size,contexts},null,2))
} finally {
  for(const repo of repos) await repo.shutdown()
  await rm(root,{recursive:true,force:true})
}
