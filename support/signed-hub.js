import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket, WebSocketServer } from 'ws'
import * as A from '@automerge/automerge'
import { Repo } from '@automerge/automerge-repo'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { machineActor, signaturesDocumentUrl } from '../lib/change-signatures.js'
import { prepareOperation } from '../lib/workspace-commands.js'
import { admitMembers, advertiseRoutes, hubRuntime, memberAdapter, replicaRuntime, testProject } from './machines.js'

// Test-only: a hub with member replicas in one process, over real sockets, for the signed-change rules
// (docs/PARDNER-TRUST-DESIGN.md, section 3). Keys come from the fixture project, never from flags or the environment.

const token = 'signed-changes-token'
export const actors = [{ id: 'alice', handle: 'alice', kind: 'human' }, { id: 'builder', handle: 'builder', kind: 'agent' }]
// Short waits keep the pending rule observable in tests; the defaults are a second.
export const timing = { quietMs: 400, pollMs: 100 }

export async function eventually(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    assert.ok(Date.now() < deadline, typeof message === 'function' ? message() : message)
    await delay(25)
  }
}

/**
 * Runs `run` with a hub, a way to open member replicas (`replica(index)`), and bare Automerge peers acting as
 * modified clients of a member machine (`bare(index)`); everything is closed and removed afterwards.
 */
export async function withHub(run, { members = 3, hubOptions = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-signed-'))
  const project = testProject({ members })
  const server = new AutomergeSyncServer({ store: hubRuntime(join(root, 'hub'), { actors, project, retryMs: 100, attribution: timing, ...hubOptions }), env: {}, apiToken: token,
    httpPort: 0, wsPort: 0, logger: {} })
  const opened = []
  try {
    await server.start()
    await admitMembers(server.store, project)
    const replica = async (index, { directory = join(root, `replica-${index}-${randomUUID()}`), ...options } = {}) => {
      const runtime = replicaRuntime(directory, project, index, { hub: server, actors, retryMs: 100, attribution: timing, ...options })
      opened.push(runtime)
      await runtime.init()
      await eventually(() => runtime.status().hubConnected && !runtime.status().syncPending, `replica ${index} never synced`)
      return runtime
    }
    const bare = async index => {
      const repo = new Repo({ network: [memberAdapter(project, index, `ws://127.0.0.1:${server.wsPort}/automerge`, { retryMs: 100 })], sharePolicy: async () => true })
      opened.push({ close: () => repo.shutdown() })
      const board = await repo.find(server.store.manifest.url)
      const signatures = await repo.find(signaturesDocumentUrl(project.projectId))
      board.update(doc => A.clone(doc, { actor: machineActor(project.keys[index]) }))
      return { repo, board, signatures, key: project.keys[index] }
    }
    await run({ root, project, server, replica, bare })
  } finally {
    await Promise.allSettled(opened.map(runtime => runtime.close()))
    await server.stop()
    await rm(root, { recursive: true, force: true })
  }
}

export const execute = (runtime, title, actorId = 'alice') => runtime.execute({ operationId: randomUUID(), actorId, type: 'task.create', payload: { title } })
export const operationOf = (runtime, taskId) => Object.values(runtime.getDoc().operations).find(event => event.taskId === taskId && event.type === 'task.create')
/** The Activity entry derived from the change that wrote the event at key `operationId`, as `runtime` shows it. */
export const entryOf = (runtime, operationId) => runtime.getDoc().activity.find(entry => entry.kind === 'operation' && entry.key === operationId)
/** That entry's first change, with its verdict: its signer. Undefined until the change has been derived. */
export const signerOf = (runtime, operationId) => entryOf(runtime, operationId)?.changes[0]
export const stateOf = (runtime, operationId) => signerOf(runtime, operationId)?.state

/** A task.create written straight into a bare repo's board, as a modified client could: one change, with an Activity entry. */
export function writeTask(member, title, { actorId = 'alice' } = {}) {
  const prepared = prepareOperation(member.board.doc(), { operationId: randomUUID(), actorId, type: 'task.create', payload: { title } },
    { replicaId: 'replica-bare', timestamp: new Date().toISOString() })
  member.board.change(prepared.change)
  const hash = A.getHeads(member.board.doc())[0]
  return { operationId: prepared.event.operationId, taskId: prepared.event.taskId, hash }
}

/**
 * A relay in front of the hub's native socket: frames pass in order, optionally late; the link can be cut and
 * restored; and the signature document's frames from the replica can be held back.
 */
export async function relay(server, projectId) {
  const http = createServer()
  const wss = new WebSocketServer({ server: http })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${http.address().port}/automerge`
  const state = { blocked: false, delayMs: 0, holdSignatures: false, links: new Set() }
  const { cbor } = await import('@automerge/automerge-repo')
  const signaturesId = signaturesDocumentUrl(projectId).slice('automerge:'.length)
  wss.on('connection', downstream => {
    if (state.blocked) return downstream.terminate()
    const upstream = new WebSocket(`ws://127.0.0.1:${server.wsPort}/automerge`)
    const link = { downstream, upstream }
    state.links.add(link)
    const end = () => { state.links.delete(link); downstream.terminate(); upstream.terminate() }
    downstream.on('close', end); upstream.on('close', end); downstream.on('error', end); upstream.on('error', end)
    const opened = new Promise(resolve => upstream.once('open', resolve))
    const pipe = (from, to, up) => {
      let chain = Promise.resolve()
      from.on('message', (data, binary) => {
        chain = chain.then(async () => {
          await opened
          if (state.delayMs) await delay(state.delayMs)
          if (up && binary && state.holdSignatures) {
            try { if (cbor.decode(data)?.documentId === signaturesId) return } catch { /* Not an Automerge frame. */ }
          }
          if (to.readyState === WebSocket.OPEN) to.send(data, { binary })
        })
      })
    }
    pipe(downstream, upstream, true)
    pipe(upstream, downstream, false)
  })
  advertiseRoutes(server, { ws: [url] })
  return {
    url, state,
    cut() { state.blocked = true; for (const { downstream, upstream } of state.links) { downstream.terminate(); upstream.terminate() } },
    restore() { state.blocked = false },
    close: () => new Promise(resolve => { state.blocked = true; for (const { downstream, upstream } of state.links) { downstream.terminate(); upstream.terminate() }; wss.close(); http.close(resolve) }),
  }
}

/** Collects every state an operation passes through on each runtime, sampled every 10 ms. */
export function sampler(runtimes, operationId) {
  const seen = runtimes.map(() => new Set())
  const timer = setInterval(() => runtimes.forEach((runtime, index) => {
    try { const state = stateOf(runtime, operationId()); if (state) seen[index].add(state) } catch { /* Not yet arrived. */ }
  }), 10)
  return { seen, stop: () => clearInterval(timer) }
}
