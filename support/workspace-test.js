import { replicaCredentials } from './replica-credentials.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AutomergeSyncServer from '../automerge-sync-server.js'

export const ACTORS = [
  { id: 'alice', handle: 'alice', kind: 'human' },
  { id: 'bob', handle: 'bob', kind: 'human' },
  { id: 'builder', handle: 'builder', kind: 'agent' },
  { id: 'reviewer', handle: 'reviewer', kind: 'agent' },
]

export async function withWorkspaceServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-public-test-'))
  const server = new AutomergeSyncServer({ replicaCredentials, directory, actors: ACTORS, env: {}, apiToken: 'test-token', httpPort: 0, wsPort: 0, logger: {} })
  try {
    await server.start()
    const api = async (path, body, { token = 'test-token', method = body === undefined ? 'GET' : 'POST' } = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, { method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Connection: 'close' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { ...(await response.json()), httpStatus: response.status }
    }
    const operation = (type, payload, actorId = 'alice', operationId = randomUUID()) => api('/automerge/operations', { type, payload, actorId, operationId })
    const create = async (fields = {}) => (await operation('task.create', { title: 'Shared task', ...fields })).result.taskId
    const context = taskId => api(`/automerge/task/${taskId}/context`)
    const update = async (taskId, updates, actorId = 'alice') => {
      const { revisions } = await context(taskId)
      return operation('task.update', { taskId, updates, expectedRevisions: Object.fromEntries(Object.keys(updates).map(field => [field, revisions[field]])) }, actorId)
    }
    await run({ directory, server, api, operation, create, context, update })
  } finally {
    await server.stop()
    await rm(directory, { recursive: true, force: true })
  }
}
