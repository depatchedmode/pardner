import { once } from 'node:events'
import { WebSocket } from 'ws'
import { generateMachineKey } from '../lib/machine-key.js'
import { initiateHandshake } from '../lib/machine-handshake.js'
import { buildRecord } from '../lib/membership.js'
import { TicketNetworkAdapter } from '../lib/ticket-network-adapter.js'
import { trustProject } from './trust-records.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

/**
 * Test-only: a project whose genesis is signed by `owner`, the hub's machine,
 * with each further machine admitted as a member person by the owner. Each
 * admission carries the joining key's consent and a person ID derived from
 * that key (support/trust-records.js). Keys come from this fixture, never
 * from flags or the environment.
 */
export function testProject({ members = 1, role = 'member' } = {}) {
  const trust = trustProject()
  const { owner, genesis, projectId } = trust
  const keys = Array.from({ length: members }, () => generateMachineKey())
  const admit = (key, index, admitted = role) => trust.admit(owner, key, { role: admitted, name: `Member ${index}` })
  const records = keys.map((key, index) => admit(key, index))
  const remove = (key, signer = owner) => buildRecord(signer, { projectId, kind: 'machine.remove', subject: key.machineId })
  return { owner, ownerId: trust.ownerId, genesis, projectId, keys, records, all: [genesis, ...records], admit, remove, stranger: generateMachineKey(), trust }
}

/**
 * Test-only: one request signed by `key` over a fresh session with the hub at
 * `route`, answered as `{ status, result }` whether it succeeds or not.
 */
export async function signedRequest(key, { projectId, route }, suffix, body) {
  const { SessionClient } = await import('../lib/machine-session.js')
  let last = null
  const send = async (url, { headers = {}, body }) => {
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    last = { status: response.status, result }
    if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code })
    return result
  }
  const session = new SessionClient({ key, projectId, route, send })
  try { return { status: 200, result: await session.request(suffix, { method: body === undefined ? 'GET' : 'POST', body }) } }
  catch (error) { if (!last || last.status === 200) throw error; return last }
}

// ---- Hubs and replicas with fixture keys ----

const projects = new Map()
/** The fixture project for a hub directory, so a restarted hub keeps its machine key and genesis. */
export function projectFor(directory, options = { members: 4 }) {
  if (!projects.has(directory)) projects.set(directory, testProject(options))
  return projects.get(directory)
}

/** A hub runtime signed by the fixture project's owner key. Its members are admitted once it starts (admitMembers). */
export function hubRuntime(directory, options = {}) {
  const project = options.project ?? projectFor(directory)
  return new WorkspaceRuntime({ directory, role: 'hub', machineKey: project.owner, genesis: project.genesis, ...options, project: undefined })
}

/** Admits the fixture project's member machines through the hub's gate; a record already stored is accepted again. */
export async function admitMembers(store, project = projectFor(store.directory)) {
  await store.addRecords(project.records)
  return project
}

/** A replica runtime for member `index` of `project`, joining the hub at its direct routes. */
export function replicaRuntime(directory, project, index, { hub, hubUrl = `http://127.0.0.1:${hub.httpPort}`, hubWsUrl = `ws://127.0.0.1:${hub.wsPort}/automerge`, ...options } = {}) {
  return new WorkspaceRuntime({ directory, role: 'replica', machineKey: project.keys[index], projectId: project.projectId, hubUrl, hubWsUrl, ...options })
}

/**
 * A network adapter for a bare Automerge Repo acting as member `index`: it
 * opens each socket with the machine handshake, as a replica runtime does.
 */
export function memberAdapter(project, index, url, options = {}) {
  return new TicketNetworkAdapter({ retryMs: 60000, ...options, getUrl: async () => url,
    handshake: (socket, signal) => initiateHandshake(socket, { key: project.keys[index], projectId: project.projectId, route: url, role: 'replica',
      expectRole: 'hub', knownRecords: () => project.all, signal }) })
}

/** A raw native socket that has completed the machine handshake as `key`, ready for Automerge frames. */
export async function handshakeSocket(url, { key, projectId, records, socketOptions = {} }) {
  const socket = new WebSocket(url, socketOptions)
  await once(socket, 'open', { signal: AbortSignal.timeout(5000) })
  await initiateHandshake(socket, { key, projectId, route: url, role: 'replica', expectRole: 'hub', knownRecords: () => records })
  return socket
}

/** Adds routes that reach `server` (a relay or gate in front of it), as a client adds each origin it advertises. */
export function advertiseRoutes(server, { http = [], ws = [] }) {
  const current = server.routes()
  server.machineRoutes = { http: [...current.http, ...http], ws: [...current.ws, ...ws] }
}
