// Run through locked.py and verify-watchdog. The subject is an immutable source archive.
import fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import assert from 'node:assert/strict'

const [subjectArg, outputArg, seedArg = '1'] = process.argv.slice(2)
if (!subjectArg || !outputArg || !process.env.PARDNER_HEAVY_LOCK_FD) throw Error('Use locked.py node baseline.mjs SUBJECT OUTPUT SEED')
const subject = resolve(subjectArg), output = resolve(outputArg), seed = Number(seedArg)
assert.ok(Number.isSafeInteger(seed) && seed > 0)
await fs.mkdir(output, { recursive: false })
const configBytes = await fs.readFile(new URL('./profiles.json', import.meta.url))
const config = JSON.parse(configBytes), profile = config.preliminary
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const load = relative => import(pathToFileURL(join(subject, relative)))
const { default: Server } = await load('automerge-sync-server.js')
const { candidateFingerprint } = await load('support/acceptance/candidate.js')
const before = await candidateFingerprint(subject)
await fs.writeFile(join(output, 'candidate.before.json'), JSON.stringify(before, null, 2))
const directory = await fs.mkdtemp(join(os.tmpdir(), 'pardner-baseline-'))
const server = new Server({ directory, env: {}, apiToken: 'disposable-baseline-token', httpPort: 0, wsPort: 0, logger: {} })
let phase = 'setup', index = 0, stopped = null, timer, busy = false, vanishedDuringSampling = 0
const intents = [], receipts = [], contexts = [], resources = [], tasks = [], comments = []
const activity = Object.fromEntries(Array.from({length: profile.actors}, (_, i) => [`actor-${i}`, 0]))
const loop = monitorEventLoopDelay({resolution: 20}); loop.enable()
async function diskBytes(path) {
  let sum = 0
  for (const entry of await fs.readdir(path, {withFileTypes: true})) {
    const child = join(path, entry.name)
    try { sum += entry.isDirectory() ? await diskBytes(child) : (await fs.stat(child)).size }
    catch (error) { if (error.code !== 'ENOENT') throw error; vanishedDuringSampling++ }
  }
  return sum
}
async function sample() {
  if (busy) return
  busy = true
  try {
    const row = {phase, time: performance.now(), rss: process.memoryUsage().rss, cpu: process.cpuUsage(), disk: await diskBytes(directory), eventLoopMaxMs: loop.max / 1e6}
    resources.push(row); loop.reset()
    await fs.appendFile(join(output, 'resources.jsonl'), JSON.stringify(row)+'\n')
    if (row.rss > config.limits.rssBytes || row.disk > config.limits.diskBytes) stopped = 'resource-limit'
  } finally {busy = false}
}
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, {method: body ? 'POST' : 'GET', headers: {Authorization: 'Bearer disposable-baseline-token', 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(config.limits.requestTimeoutMs)})
  const result = await response.json()
  if (!response.ok || result.success === false) throw Error(`HTTP ${response.status}: ${JSON.stringify(result)}`)
  return result
}
async function operation(type, payload, actorId, scheduled = performance.now()) {
  if (stopped) throw Error(stopped)
  const request = {operationId: `baseline-${seed}-${index++}`, type, actorId, payload}
  const intent = {phase, scheduled, submitted: performance.now(), request}
  intents.push(intent)
  await fs.appendFile(join(output, 'intents.jsonl'), JSON.stringify(intent)+'\n')
  try {
    const result = await api('/automerge/operations', request)
    assert.equal(result.savedLocally, true)
    const receipt = {phase, requestId: request.operationId, latencyMs: performance.now()-scheduled, queueMs: intent.submitted-scheduled, result}
    receipts.push(receipt); activity[actorId]++
    await fs.appendFile(join(output, 'receipts.jsonl'), JSON.stringify(receipt)+'\n')
    return result
  } catch(error) {
    await fs.appendFile(join(output, 'failures.jsonl'), JSON.stringify({requestId: request.operationId, phase, elapsedMs: performance.now()-scheduled, error: error.message})+'\n')
    throw error
  }
}
async function context(taskId) {
  const start = performance.now(), result = await api(`/automerge/task/${taskId}/context`)
  contexts.push({phase, ms: performance.now()-start, bytes: Buffer.byteLength(JSON.stringify(result))})
  return result
}
async function update(i, scheduled) {
  const taskId = tasks[(i+seed)%tasks.length], c = await context(taskId)
  return operation('task.update', {taskId, updates: {description: `seed ${seed} edit ${i}`}, expectedRevisions: {description: c.revisions.description}}, `actor-${i%profile.actors}`, scheduled)
}
let outcome = 'incomplete', failure = null
try {
  await server.start(); timer = setInterval(() => sample().catch(error => {stopped = error.message}), 1000)
  phase = 'preload'
  for (let i=0; i<profile.actors; i++) await operation('actor.register', {id: `actor-${i}`, handle: `actor-${i}`, kind: i<profile.actors/4 ? 'human' : 'agent'}, i===0 ? 'actor-0' : 'actor-0')
  for (let i=0; i<profile.tasks; i++) tasks.push((await operation('task.create', {title: `seed ${seed} task ${i}`}, `actor-${i%profile.actors}`)).result.taskId)
  for (let i=0; i<profile.comments; i++) comments.push((await operation('comment.add', {taskId: tasks[i%tasks.length], text: `seed ${seed} comment ${i}`}, `actor-${i%profile.actors}`)).result.commentId)
  while (index<profile.preloadOperations) await update(index)
  for (const [name, seconds] of [['warmup', profile.warmupSeconds], ['measurement', profile.measurementSeconds]]) {
    phase=name; const start=performance.now()
    for(let i=0; i<seconds*profile.writesPerSecond; i++) {
      const scheduled=start+i*1000/profile.writesPerSecond
      await new Promise(r=>setTimeout(r, Math.max(0, scheduled-performance.now())))
      if (i%10<5) await update(index, scheduled)
      else if (i%10<8) {
        const actorId=`actor-${i%profile.actors}`, text=i%10===5 ? `@actor-${(i+1)%profile.actors} measured ${index}` : `measured ${index}`
        comments.push((await operation('comment.add', {taskId: tasks[(i+seed)%tasks.length], text}, actorId, scheduled)).result.commentId)
      } else {
        const taskId=tasks[(i+seed)%tasks.length], c=await context(taskId)
        await operation('read.mark', {taskId, comments: c.comments.flatMap(comment=>comment.revisionIds.map(revisionId=>({commentId: comment.id, revisionId})))}, `actor-${i%profile.actors}`, scheduled)
      }
    }
    await new Promise(r=>setTimeout(r, Math.max(0, start+seconds*1000-performance.now())))
  }
  phase='inspection'
  const snapshot=await api('/automerge/doc')
  const state=snapshot.doc
  const encode = value => Array.isArray(value) ? '['+value.map(encode).join(',')+']'
    : value && typeof value === 'object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+encode(value[k])).join(',')+'}' : JSON.stringify(value)
  const entityId = (prefix, request) => {
    const id = state.schemaVersion < 5 ? request.operationId : 'op-'+hash(encode([request.operationId, hash(encode({type:request.type, actorId:request.actorId, payload:request.payload}))]))
    return prefix+'-'+hash(id).slice(0,24)
  }
  assert.deepEqual(Object.keys(state.tasks).sort(), intents.filter(i=>i.request.type==='task.create').map(i=>entityId('task',i.request)).sort())
  assert.deepEqual(Object.keys(state.comments).sort(), intents.filter(i=>i.request.type==='comment.add').map(i=>entityId('comment',i.request)).sort())
  const events=Object.values(state.operations)
  assert.equal(events.length, intents.length)
  for(const {request} of intents) {
    const event=events.find(e=>(e.requestId??e.operationId)===request.operationId)
    assert.ok(event); assert.equal(event.type, request.type); assert.equal(event.actorId, request.actorId); assert.deepEqual(event.payload, request.payload)
  }
  await fs.writeFile(join(output,'inspection.json'), JSON.stringify({tasks:Object.keys(state.tasks), comments:Object.keys(state.comments), events},null,2))
  outcome='passed'
  if (stopped) throw Error(stopped)
  assert.ok(receipts.filter(r=>r.phase==='measurement').every(r=>r.latencyMs<=config.gates.ackMs), 'Measured acknowledgement exceeded 2000 ms')
} catch(error) {outcome='failed'; failure=error.stack; process.exitCode=1}
finally {
  clearInterval(timer); while(busy) await new Promise(r=>setTimeout(r,10)); loop.disable()
  try {await server.stop(); await fs.rm(directory,{recursive:true,force:true})} catch(error) {failure=(failure??'')+'\ncleanup: '+error.stack;outcome='failed';process.exitCode=1}
  const after=await candidateFingerprint(subject)
  if(before.sha256!==after.sha256) {outcome='failed';failure=(failure??'')+'\nSubject changed';process.exitCode=1}
  await fs.writeFile(join(output,'candidate.after.json'),JSON.stringify(after,null,2))
  const measured=receipts.filter(r=>r.phase==='measurement').map(r=>r.latencyMs).sort((a,b)=>a-b)
  const percentile=p=>measured[Math.max(0,Math.ceil(measured.length*p)-1)]??null
  await fs.writeFile(join(output,'report.json'),JSON.stringify({outcome,failure,classification:'preliminary single-hub HTTP persistence baseline; not profile qualification',seed,configHash:hash(configBytes),harnessHash:hash(await fs.readFile(new URL(import.meta.url))),subject,before:before.sha256,environment:{node:process.version,os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,cores:os.cpus().length,ram:os.totalmem(),storage:'temporary directory on host filesystem',network:'loopback'},topology:{hubs:1,replicas:0,browsers:0},phaseCounts:Object.fromEntries(['preload','warmup','measurement'].map(p=>[p,receipts.filter(r=>r.phase===p).length])),activity,requests:intents.length,accepted:receipts.length,retries:0,offeredWritesPerSecond:profile.writesPerSecond,acceptedMeasuredWritesPerSecond:measured.length/profile.measurementSeconds,latency:{samples:measured.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:percentile(1),gate:measured.length ? (percentile(1)<=config.gates.ackMs?'passed':'failed'):'not-measured'},contexts,notComparable:['Location registration/fanout/receipts','hub-loss recovery'],notMeasured:['browser visibility','sync convergence','offline startup','notification receipt and handoff','queue drain','sync traffic','full profile capacity'],vanishedDuringSampling,resourceSamples:resources.length},null,2))
}
