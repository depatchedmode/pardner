import { it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, webkit } from 'playwright'
import Server from '../automerge-sync-server.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

// Independent canonical encoder: expected fingerprints never use production helpers.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
  return JSON.stringify(value)
}
const fingerprint = request => createHash('sha256').update(canonical({type: request.type, actorId: 'actor-a', payload: request.payload})).digest('hex')
const token = 'disposable-integrity-token'
const replicaCredentials = Object.fromEntries([0, 1].map(i => [`peer-${i}`, `disposable-integrity-replica-${i}`]))
const actors = [{id: 'actor-a', handle: 'alice', kind: 'human'}]
async function until(check) {
  const deadline=Date.now()+10000
  while(!await check()) { assert.ok(Date.now()<deadline, 'Convergence exceeded 10 seconds'); await delay(25) }
}
for (const order of [[0,1],[1,0]]) it(`preserves public collision evidence after sync order ${order}, restart and browser inspection`, {timeout:60000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'pardner-integrity-'))
  const make=(name, settings={})=>new Server({replicaCredentials,store:new WorkspaceRuntime({directory:join(root,name),role:name==='hub'?'hub':'replica',actors,token,replicaCredentialId:name,replicaToken:replicaCredentials[name],retryMs:100,...settings}),env:{},apiToken:token,httpPort:0,wsPort:0,logger:{}})
  let hub=make('hub'), peers=[], browser
  async function api(server,path,body) {
    const response=await fetch(`http://127.0.0.1:${server.httpPort}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    return {status:response.status,...await response.json()}
  }
  const write=(server,request)=>api(server,'/automerge/operations',request)
  const context=(server,id)=>api(server,`/automerge/task/${id}/context`)
  const requests=['Left full payload','Right full payload'].map(title=>({operationId:'collision',actorId:'alice',type:'task.create',payload:{title,description:'preserve complete intent',tags:['integrity']}}))
  const expected=requests.map(fingerprint).sort()
  const same={operationId:'equivalent',actorId:'alice',type:'task.create',payload:{title:'Equivalent retry'}}
  try {
    await hub.start()
    const ports={httpPort:hub.httpPort,wsPort:hub.wsPort}
    const settings={hubUrl:`http://127.0.0.1:${hub.httpPort}`,hubWsUrl:`ws://127.0.0.1:${hub.wsPort}/automerge`}
    for(let i=0;i<2;i++) {peers[i]=make(`peer-${i}`,settings);await peers[i].start()}
    await until(()=>peers.every(p=>!p.store.status().syncPending))
    await hub.stop();hub=null
    const receipts=[]
    for(let i=0;i<2;i++) {
      receipts[i]=await write(peers[i],requests[i]);assert.equal(receipts[i].savedLocally,true)
      const first=await write(peers[i],{...same,actorId:i?'actor-a':'alice'})
      for(let retry=0;retry<10;retry++) {
        const result=await write(peers[i],same);assert.equal(result.replayed,true);assert.deepEqual(result.result,first.result);assert.equal(result.operationId,first.operationId)
      }
      const rejected=await write(peers[i],{...requests[i],payload:{title:'Rejected'}})
      assert.equal(rejected.code,'OPERATION_ID_REUSED')
      await peers[i].stop()
    }
    peers=[]
    hub=make('hub'); hub.httpPort=ports.httpPort;hub.wsPort=ports.wsPort;await hub.start()
    for(const i of order) {peers[i]=make(`peer-${i}`,settings);await peers[i].start();await until(()=>!peers[i].store.status().syncPending)}
    await until(()=>peers.every(p=>p.store.workspace.taskContext(receipts[0].result.taskId).integrityConflicts.length===1))
    for(const peer of peers) await peer.stop()
    await hub.stop();peers=[];hub=make('hub');hub.httpPort=ports.httpPort;hub.wsPort=ports.wsPort;await hub.start()
    for(let i=0;i<2;i++) {peers[i]=make(`peer-${i}`,settings);await peers[i].start()}
    await until(()=>peers.every(p=>!p.store.status().syncPending))
    for(const server of [hub,...peers]) {
      const doc=(await api(server,'/automerge/doc')).doc
      assert.equal(Object.keys(doc.tasks).length,3)
      assert.equal(Object.keys(doc.operations).length,3)
      for(const receipt of receipts) {
        const c=await context(server,receipt.result.taskId)
        assert.equal(c.integrityConflicts.length,1)
        const group=c.integrityConflicts[0]
        assert.equal(group.status,'unresolved');assert.equal(group.requestId,'collision')
        assert.deepEqual(group.variants.map(v=>v.fingerprint).sort(),expected)
        for(const variant of group.variants) {
          assert.equal(variant.actorId,'actor-a');assert.equal(variant.type,'task.create')
          assert.deepEqual(variant.payload,requests.find(r=>fingerprint(r)===variant.fingerprint).payload)
          assert.equal(variant.origins.length,1);assert.equal(variant.origins[0].replicaId,receipts.find(r=>r.result.taskId===variant.result.taskId).replicaId)
          assert.ok(receipts.some(r=>r.result.taskId===variant.result.taskId))
        }
      }
      const equivalent=Object.values(doc.operations).find(e=>e.requestId==='equivalent')
      assert.equal(equivalent.origins.length,2)
      assert.deepEqual(equivalent.origins.map(o=>o.replicaId).sort(),peers.map(p=>p.store.manifest.replicaId).sort())
      assert.equal((await context(server,equivalent.result.taskId)).integrityConflicts.length,0)
      assert.equal((await context(server,equivalent.result.taskId)).history.length,1)
      for(const request of requests) {
        const retry=await write(server,request)
        assert.equal(retry.status,409);assert.equal(retry.code,'OPERATION_INTEGRITY_CONFLICT')
        assert.deepEqual(retry.details.variants.map(v=>v.fingerprint).sort(),expected)
      }
      assert.equal(Object.keys((await api(server,'/automerge/doc')).doc.operations).length,3)
      if (server === hub) assert.equal(server.store.deliveryLedger.pending().length,0)
    }
    for(const engine of [chromium,webkit]) {
      browser=await engine.launch({headless:true})
      const page=await browser.newPage({viewport:{width:1440,height:1000}})
      await page.goto(`http://127.0.0.1:${hub.httpPort}/pardner/`)
      await page.getByLabel('Local service token').fill(token)
      await page.getByRole('button',{name:'Connect',exact:true}).click()
      await page.getByLabel('Actor',{exact:true}).selectOption('actor-a')
      await page.getByText('Left full payload',{exact:true}).click()
      const conflict=page.getByRole('region',{name:'Operation integrity conflict'})
      await conflict.waitFor()
      assert.match(await conflict.innerText(),/Unresolved operation ID conflict/)
      for(const details of await conflict.locator('details').all()) await details.locator('summary').click()
      const text=await conflict.innerText()
      for(const expectedFingerprint of expected) assert.ok(text.includes(expectedFingerprint))
      assert.ok(text.includes('Right full payload'))
      for(const pre of await conflict.locator('pre').all()) assert.ok(await pre.evaluate(el=>el.scrollWidth<=el.clientWidth), 'Integrity payload must wrap within the panel')
      await conflict.getByRole('heading').scrollIntoViewIfNeeded()
      if(process.env.PARDNER_INTEGRITY_SCREENSHOTS) await page.screenshot({path:join(process.env.PARDNER_INTEGRITY_SCREENSHOTS,`integrity-${order.join('')}-${engine.name()}.png`)})
      await browser.close();browser=null
    }
  } finally {
    await browser?.close()
    for(const peer of peers) await peer?.stop()
    await hub?.stop()
    await rm(root,{recursive:true,force:true})
  }
})
