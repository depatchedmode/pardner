import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'
import { requestJson } from '../lib/sync-client.js'

const token = 'replica-workspace-token'
const actors = [
  { id: 'alice', handle: 'alice', kind: 'human' },
  { id: 'bob', handle: 'bob', kind: 'human' },
  { id: 'builder', handle: 'builder', kind: 'agent' },
]

async function eventually(check, message = 'Replicas did not converge within ten seconds') {
  const deadline = Date.now() + 10000
  while (!(await check())) {
    assert.ok(Date.now() < deadline, message)
    await delay(25)
  }
}

function service(directory, options = {}) {
  const { hubUrl, hubWsUrl, ...serverOptions } = options
  return new AutomergeSyncServer({
    store: new WorkspaceRuntime({ directory, role: hubUrl ? 'replica' : 'hub', hubUrl, hubWsUrl, token, actors, retryMs: 100 }),
    env: {}, apiToken: token, httpPort: 0, wsPort: 0, logger: {}, ...serverOptions,
  })
}

// Runs a hub and two replicas in process. The browser is attached to replica 0.
// `partition(writes, converged)` stops the hub, runs `writes` while both replicas
// are disconnected, restarts the hub on the same ports and waits for convergence.
export async function withReplicaWorkspace(engine, body, contextOptions = { viewport: { width: 1440, height: 900 } }) {
  const root = await mkdtemp(join(tmpdir(), 'pardner-replicas-'))
  let hub = service(join(root, 'hub'))
  const replicas = []
  let browser
  const errors = []
  try {
    await hub.start()
    const ports = { httpPort: hub.httpPort, wsPort: hub.wsPort }
    const settings = { hubUrl: `http://127.0.0.1:${hub.httpPort}`, hubWsUrl: `ws://127.0.0.1:${hub.wsPort}/automerge` }
    for (let i = 0; i < 2; i++) {
      const replica = service(join(root, `replica-${i}`), settings)
      replicas.push(replica)
      await replica.start()
    }
    const url = i => `http://127.0.0.1:${replicas[i].httpPort}`
    const api = (i, path, payload) => requestJson(url(i), path, {
      token, ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
    })
    const operate = (i, actorId, type, payload) => api(i, '/automerge/operations', { operationId: randomUUID(), actorId, type, payload })
    const context = (i, path) => api(i, path)
    const settled = () => replicas.every(replica => !replica.store.status().syncPending)
    await eventually(settled)
    const partition = async (writes, converged = () => true) => {
      await hub.stop()
      hub = null
      await eventually(() => replicas.every(replica => !replica.store.status().hubConnected), 'Replicas did not report the hub as disconnected')
      await writes()
      hub = service(join(root, 'hub'), ports)
      await hub.start()
      await eventually(async () => settled() && await converged())
    }
    browser = await engine.launch({ headless: true })
    const page = await (await browser.newContext(contextOptions)).newPage()
    page.on('pageerror', error => errors.push(error.message))
    const open = async () => {
      await page.goto(`${url(0)}/pardner/`)
      await page.getByLabel('Local service token').fill(token)
      await page.getByRole('button', { name: 'Connect', exact: true }).click()
      await page.getByLabel('Actor', { exact: true }).selectOption('alice')
    }
    await open()
    await body({ page, replicas, operate, context, partition, eventually, token, open })
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    for (const replica of replicas) await replica.stop()
    await hub?.stop()
    await rm(root, { recursive: true, force: true })
  }
}
