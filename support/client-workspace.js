import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { startClient } from '../lib/client-service.js'
import { joinApproved } from './enrollment.js'

const CLIENT_API = '/pardner/client/v1'

export async function eventually(read, message = 'Condition was not met within twenty seconds', timeout = 20000) {
  const end = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > end) assert.fail(message)
    await delay(50)
  }
}

const email = name => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.test`

// One person's local client service, driven over HTTP with its operator bearer.
async function participant(directory, name, options = {}) {
  const client = await startClient({ directory, port: 0, deviceName: `${name}’s laptop`, gitDirectory: directory, ...options })
  const call = async (path, body, { token = client.registry.read().operatorToken, expected } = {}) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (expected === undefined) assert.equal(response.ok, true, `${path}: ${JSON.stringify(result)}`)
    else assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  return { name, client, call, directory }
}

// Board helpers bound to one participant and project. `operate` writes as the signed-in human through the
// client proxy; naming another Actor writes through the project runtime directly, a test-only bypass of the
// proxy's authorship binding that stands in for that Actor's own client.
function board(person, project) {
  const api = `/projects/${project.id}/api/automerge`
  const runtime = () => person.client.runtime(person.client.project(project.id))
  const operate = async (type, payload, actor, operationId = randomUUID()) => {
    if (actor === undefined || actor === project.actorId) return person.call(`${api}/operations`, { operationId, type, payload })
    return (await runtime()).request('/automerge/operations', { operationId, actorId: actor, type, payload })
  }
  const doc = async () => (await person.call(`${api}/doc`)).doc
  const status = () => person.call(`${api}/status`)
  const show = (kind, id) => person.call(`${api}/${kind}/${encodeURIComponent(id)}/context`)
  const task = id => show('task', id)
  const register = (...actors) => registerActors(person, project, actors)
  return { api, runtime, operate, doc, status, show, task, register }
}

// The proxy refuses actor.register, so fixture Actors are registered through the runtime, authored by the human.
async function registerActors(person, project, actors) {
  const runtime = await person.client.runtime(person.client.project(project.id))
  for (const { id, handle = id, kind = 'agent', displayName } of actors) {
    await runtime.request('/automerge/operations', { operationId: `register-${id}`, actorId: project.actorId, type: 'actor.register',
      payload: { id, handle, kind, ...(displayName ? { displayName } : {}) } })
  }
}

function browserPages(browser, defaults, errors) {
  const contexts = []
  const newPage = async (contextOptions = defaults) => {
    const context = await browser.newContext(contextOptions)
    contexts.push(context)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    return page
  }
  return { newPage, contexts }
}

// Opens `page` on the person's client: `/open` mints a one-time grant that main.jsx exchanges for a session cookie.
async function openBoard(person, project, page) {
  const { url } = await person.call('/open', {})
  await page.goto(url)
  await page.getByRole('button', { name: `Project: ${project.name}. Switch project` }).waitFor({ timeout: 30000 })
}

/**
 * Runs `body` against one client-mode workspace: a local client with a confirmed identity and one project it hosts.
 * `actors` are extra Actors ({ id, handle, kind, displayName }) registered in the project for the test.
 * `runtimeOptions` is plain data for each project runtime, such as `{ control: { pollMs } }` for its control pane.
 * The body receives { page, newPage, open, operate, doc, task, show, status, call, client, project, actorId, browser }.
 * `open(page?)` signs the page in and waits for the board; it is not called for you.
 */
export async function withClientWorkspace(engine, options, body) {
  const { identity = { name: 'Alice' }, actors = [], contextOptions = { viewport: { width: 1440, height: 900 } }, projectName = 'Test board',
    runtimeOptions } = options ?? {}
  const root = await mkdtemp(join(tmpdir(), 'pardner-client-ui-'))
  let person, browser
  const errors = []
  try {
    person = await participant(join(root, 'client'), identity.name, { runtimeOptions })
    await person.call('/identity', { name: identity.name, email: identity.email ?? email(identity.name), operationId: 'identity' })
    const { project } = await person.call('/projects', { name: projectName, operationId: 'create' })
    await registerActors(person, project, actors)
    browser = await engine.launch({ headless: true })
    const { newPage } = browserPages(browser, contextOptions, errors)
    const page = await newPage()
    const open = (target = page) => openBoard(person, project, target)
    await body({ ...board(person, project), page, newPage, open, browser, project, actorId: project.actorId,
      client: person.client, call: person.call, url: person.client.url, errors })
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await person?.client.stop()
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Runs `body` against several people's clients sharing one project. `humans[0]` hosts the project (the hub);
 * every other human joins from a separate client with a `human` invitation (as an admin when given as
 * { name, role: 'admin' }), or with a `device` invitation when given as { name, device: true } (the hub person's
 * identity on a second machine, so the same Actor). The hub approves each join after comparing its confirmation code.
 * The body receives { people, hub, browser, newPage, partition, settled, eventually, project, newcomer }; each person
 * has { name, client, call, actorId, open(page), operate, doc, task, show, status }. `newcomer(name, { identity })`
 * starts another client that is not in the project yet ({ name, client, call, signIn(page) }), stopped afterwards.
 * `partition(writes, converged)` stops the hub, runs `writes` while every replica is disconnected, restarts
 * the hub on the same port and waits until all replicas have synced and `converged()` holds.
 */
export async function withClientReplicas(engine, options, body) {
  const { humans = ['Alice', 'Bob'], actors = [], contextOptions = { viewport: { width: 1440, height: 900 } }, projectName = 'Shared board' } = options ?? {}
  const root = await mkdtemp(join(tmpdir(), 'pardner-client-replicas-'))
  const people = []
  let browser
  const errors = []
  try {
    const entries = humans.map(entry => typeof entry === 'string' ? { name: entry } : entry)
    const hubEntry = entries[0]
    let hubPerson = await participant(join(root, 'hub'), hubEntry.name)
    await hubPerson.call('/identity', { name: hubEntry.name, email: email(hubEntry.name), operationId: 'identity' })
    const { project } = await hubPerson.call('/projects', { name: projectName, operationId: 'create' })
    await registerActors(hubPerson, project, actors)
    people.push(hubPerson)
    for (const [index, entry] of entries.slice(1).entries()) {
      const purpose = entry.device ? 'device' : 'human'
      const invite = await hubPerson.call(`/projects/${project.id}/invites`, { purpose, operationId: `invite-${index}`, ...(entry.role ? { role: entry.role } : {}) })
      const person = await participant(join(root, `replica-${index}`), entry.name)
      if (!entry.device) await person.call('/identity', { name: entry.name, email: email(entry.name), operationId: 'identity' })
      await joinApproved({ join: body => person.call('/join', body), approver: hubPerson.call, invitation: invite.invitation, operationId: 'join' })
      people.push(person)
    }
    const replicas = () => people.slice(1)
    const projectOf = person => person.client.project(project.id)
    const status = person => person.call(`/projects/${project.id}/api/automerge/status`)
    const settled = async () => {
      for (const person of replicas()) { const current = await status(person); if (current.syncPending || !current.hubConnected) return false }
      return true
    }
    await eventually(settled, 'Replicas did not finish their initial sync')
    const partition = async (writes, converged = () => true) => {
      const port = Number(new URL(hubPerson.client.url).port)
      await hubPerson.client.stop()
      await eventually(async () => {
        for (const person of replicas()) if ((await status(person)).hubConnected) return false
        return true
      }, 'Replicas did not report the hub as disconnected')
      await writes()
      const restarted = await participant(join(root, 'hub'), hubEntry.name, { port })
      hubPerson.client = restarted.client
      hubPerson.call = restarted.call
      await eventually(async () => await settled() && await converged(), 'Replicas did not converge after the hub returned')
    }
    browser = await engine.launch({ headless: true })
    const { newPage } = browserPages(browser, contextOptions, errors)
    const views = people.map(person => {
      const view = { name: person.name, get client() { return person.client }, call: (...args) => person.call(...args),
        get actorId() { return projectOf(person).actorId }, open: page => openBoard(person, project, page) }
      return Object.assign(view, boardFor(person, project))
    })
    const newcomers = []
    const newcomer = async (name, { identity = true } = {}) => {
      const person = await participant(join(root, `newcomer-${newcomers.length}`), name)
      newcomers.push(person)
      people.push(person)
      if (identity) await person.call('/identity', { name, email: email(name), operationId: 'identity' })
      return { name, client: person.client, call: person.call, signIn: async page => page.goto((await person.call('/open', {})).url) }
    }
    await body({ people: views, hub: views[0], browser, newPage, partition, settled, eventually, project, errors, newcomer })
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    for (const person of people.slice(1)) await person.client.stop()
    await people[0]?.client.stop()
    await rm(root, { recursive: true, force: true })
  }
}

// `board` for a person whose client may be replaced by a restart: every call resolves the current client.
function boardFor(person, project) {
  const proxy = { call: (...args) => person.call(...args), get client() { return person.client } }
  const helpers = board(proxy, { ...project, actorId: person.client.project(project.id).actorId })
  return helpers
}
