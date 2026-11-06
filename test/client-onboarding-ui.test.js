import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium, webkit } from 'playwright'
import { bootstrapPath, createClientApi, projectConfiguration, takeBootstrapGrant } from '../ui-prototype/src/client-api.js'
import { createConnection } from '../ui-prototype/src/connection.js'
import { createPresenceReporter, focusByTask, presenceIndex, sortParticipants } from '../ui-prototype/src/presence.js'

const run = promisify(execFile)
const CLIENT_API = '/pardner/client/v1'

function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values }
}

// Deterministic timers and monotonic clock for presence reporting.
function clock() {
  let now = 0, next = 1
  const timers = new Map()
  const settle = async () => { for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve)) }
  return {
    now: () => now,
    setTimer: (callback, delay) => { const id = next++; timers.set(id, { at: now + delay, callback }); return id },
    clearTimer: id => timers.delete(id),
    async advance(ms) {
      const end = now + ms
      await settle()
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = Math.max(now, due[1].at)
        due[1].callback()
        await settle()
      }
      now = end
      await settle()
    },
  }
}

function fakePresenceApi() {
  const calls = []
  let sessions = 0
  const api = {
    calls, expire: new Set(),
    startSession: async (projectId, input) => { calls.push(['start', projectId, input]); return { sessionId: `s${++sessions}`, ttlMs: 45000 } },
    report: async (projectId, sessionId, input) => {
      calls.push(['report', sessionId, input])
      if (api.expire.has(sessionId)) throw Object.assign(new Error('expired'), { code: 'SESSION_EXPIRED' })
      return { sessionId, seq: input.seq }
    },
    endSession: async (projectId, sessionId) => { calls.push(['end', sessionId]); return { ended: true } },
  }
  return api
}

it('clears a bootstrap grant from the fragment while keeping other fragment state', () => {
  const replaced = []
  const history = { replaceState: (_state, _title, url) => replaced.push(url) }
  assert.equal(takeBootstrapGrant({ hash: '#grant=abc123&view=board', pathname: '/pardner/', search: '?x=1' }, history), 'abc123')
  assert.deepEqual(replaced, ['/pardner/?x=1#view=board'])
  assert.equal(takeBootstrapGrant({ hash: '#grant=only', pathname: '/pardner/', search: '' }, history), 'only')
  assert.equal(replaced.at(-1), '/pardner/')
  assert.equal(takeBootstrapGrant({ hash: '#pair=12345678', pathname: '/pardner/', search: '' }, history), null)
  assert.equal(replaced.length, 2, 'a standalone pairing fragment is left for the pairing flow')
})

it('calls the client API with the session cookie only and preserves backend error codes', async () => {
  const requests = []
  const api = createClientApi({ mode: 'client', clientApiBase: CLIENT_API }, { fetcher: async (url, init) => {
    requests.push({ url, ...init })
    if (url.endsWith('/session')) return Response.json({ code: 'AUTH_REQUIRED', error: 'Open Pardner through client open' }, { status: 401 })
    if (url.endsWith('/report')) return new Response('', { status: 410 })
    return Response.json({ ok: true })
  } })
  await assert.rejects(api.session(), { code: 'AUTH_REQUIRED', status: 401 })
  await api.bootstrap('grant-value')
  await assert.rejects(api.report('project a', 'session/1', { seq: 1, active: false, focusTaskIds: [] }), { status: 410 })
  await api.endSession('p', 's')
  assert.equal(requests[1].url, `${CLIENT_API}/bootstrap`)
  assert.deepEqual(JSON.parse(requests[1].body), { grant: 'grant-value' })
  assert.equal(requests[2].url, `${CLIENT_API}/projects/project%20a/sessions/session%2F1/report`)
  assert.equal(requests[3].keepalive, true)
  for (const request of requests) {
    assert.equal(request.credentials, 'same-origin')
    assert.equal(request.headers.Authorization, undefined)
  }
  assert.equal(bootstrapPath({ clientApiBase: CLIENT_API, bootstrapPath: '/bootstrap' }), '/bootstrap')
  assert.equal(bootstrapPath({ clientApiBase: CLIENT_API, bootstrapPath: '//elsewhere.example/x' }), `${CLIENT_API}/bootstrap`)
})

it('keeps session-authenticated drafts and retries bound to project and Actor without token storage', async () => {
  const local = storage(), drafts = storage()
  let sent
  const fetcher = async (url, init) => { sent = { url, ...init }; return Response.json({ code: 'AUTH_REQUIRED', error: 'no' }, { status: 401 }) }
  const project = { id: 'project-a', apiBase: `${CLIENT_API}/projects/project-a/api`, wsPath: `${CLIENT_API}/projects/project-a/ws`, actorId: 'actor-alice' }
  const alice = createConnection(projectConfiguration(project), { storage: local, drafts, fetcher })
  const bobHere = createConnection(projectConfiguration({ ...project, actorId: 'actor-bob' }), { storage: local, drafts, fetcher })
  const otherProject = createConnection(projectConfiguration({ ...project, id: 'project-b' }), { storage: local, drafts, fetcher })
  alice.saveDraft('task-1', { fields: { title: 'Old' }, revisions: { title: ['r1'] }, edited: { title: 'Mine' } })
  alice.savePending({ operationId: 'op-1' })
  assert.equal(alice.draft('task-1').edited.title, 'Mine')
  assert.equal(bobHere.draft('task-1'), null)
  assert.equal(otherProject.draft('task-1'), null)
  assert.equal(otherProject.pending(), null)
  alice.remember('ignored')
  assert.equal(alice.credential(), 'session')
  assert.equal([...local.values.keys()].some(key => key.endsWith(':credential')), false)
  await assert.rejects(alice.request('/automerge/doc'), { code: 'AUTH_REQUIRED' })
  assert.equal(sent.headers.Authorization, undefined)
  assert.equal(sent.headers['X-Pardner-Workspace'], 'project-a')
  assert.equal(sent.credentials, 'same-origin')
  assert.equal(alice.pending().operationId, 'op-1', 'an uncertain request survives an authentication failure')
  // Standalone services keep their original storage keys.
  const standalone = createConnection({ workspaceId: 'project-a', apiBase: '', wsPath: '/' }, { storage: local, drafts, fetcher })
  assert.equal(standalone.pending(), null)
})

it('reports browser activity only after real interaction and ends the activity lease with the idle window', async () => {
  const time = clock(), api = fakePresenceApi()
  let visible = true
  const reporter = createPresenceReporter({ api, projectId: 'p', now: time.now, setTimer: time.setTimer,
    clearTimer: time.clearTimer, visible: () => visible })
  reporter.start()
  await time.advance(0)
  assert.deepEqual(api.calls.slice(0, 2), [['start', 'p', { kind: 'browser' }],
    ['report', 's1', { seq: 1, active: false, focusTaskIds: [] }]], 'opening the board is idle, not activity')
  await time.advance(5000)
  reporter.interaction()
  reporter.setFocus(['task-1', 'task-1'])
  await time.advance(1000)
  assert.deepEqual(api.calls.at(-1), ['report', 's1', { seq: 2, active: true, activeForMs: 120000, focusTaskIds: ['task-1'] }],
    'interaction and focus coalesce into one report')
  await time.advance(15000)
  assert.deepEqual(api.calls.at(-1)[2], { seq: 3, active: true, activeForMs: 105000, focusTaskIds: ['task-1'] },
    'a heartbeat never extends activity past the last interaction')
  await time.advance(120000)
  assert.equal(api.calls.at(-1)[2].active, false)
  visible = false
  reporter.interaction()
  await time.advance(15000)
  assert.equal(api.calls.at(-1)[2].active, false, 'a hidden page is not active')
  await reporter.stop()
  assert.deepEqual(api.calls.at(-1), ['end', 's1'])
})

it('starts a fresh presence session after expiry instead of resurrecting the old one', async () => {
  const time = clock(), api = fakePresenceApi()
  const reporter = createPresenceReporter({ api, projectId: 'p', now: time.now, setTimer: time.setTimer, clearTimer: time.clearTimer, visible: () => true })
  reporter.start()
  await time.advance(0)
  api.expire.add('s1')
  await time.advance(15000)
  await time.advance(1000)
  const starts = api.calls.filter(call => call[0] === 'start')
  assert.equal(starts.length, 2)
  const reports = api.calls.filter(call => call[0] === 'report')
  assert.deepEqual(reports.at(-1).slice(0, 2), ['report', 's2'])
  assert.equal(reports.at(-1)[2].seq, 1, 'a new session restarts its sequence')
  assert.equal(reports.filter(call => call[1] === 's1').length, 2, 'the expired session is not reported again')
  await reporter.stop()
})

it('indexes presence snapshots, treats absent Actors as offline, and deduplicates task focus', () => {
  const index = presenceIndex({ actors: [
    { actorId: 'alpha', state: 'active', focusTaskIds: ['t1', 't2'], sessions: [{ sessionId: 'a', focusTaskIds: ['t1'] }, { sessionId: 'b', focusTaskIds: ['t1', 't2'] }] },
    { actorId: 'bob', state: 'idle', focusTaskIds: ['t1'], sessions: [] },
  ] })
  assert.deepEqual(focusByTask(index), { t1: ['alpha', 'bob'], t2: ['alpha'] })
  const actors = [{ id: 'carol', displayName: 'Carol' }, { id: 'bob', displayName: 'Bob' }, { id: 'alpha', displayName: 'Alpha' }]
  assert.deepEqual(sortParticipants(actors, index).map(actor => actor.id), ['alpha', 'bob', 'carol'])
  assert.equal(index.has('carol'), false)
})

// Both engines exercise the real local client service.
const serviceModule = new URL('../lib/client-service.js', import.meta.url)

async function gitProfile(name) {
  const directory = await mkdtemp(join(tmpdir(), `pardner-git-${name.toLowerCase()}-`))
  await run('git', ['init', '-q'], { cwd: directory })
  await run('git', ['config', 'user.name', name], { cwd: directory })
  await run('git', ['config', 'user.email', `${name.toLowerCase()}@example.test`], { cwd: directory })
  return directory
}

async function person(t, startClient, name, agent) {
  const directory = await mkdtemp(join(tmpdir(), `pardner-ui-${name.toLowerCase()}-`))
  const gitDirectory = await gitProfile(name)
  const client = await startClient({ directory, port: 0, deviceName: `${name}’s laptop`, gitDirectory, setupAgent: agent })
  t.after(async () => {
    await client.stop()
    await rm(directory, { recursive: true, force: true })
    await rm(gitDirectory, { recursive: true, force: true })
  })
  const call = async (path, body, token = client.registry.read().operatorToken) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    assert.equal(response.ok, true, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  return { client, call, open: async () => (await call('/open', {})).url }
}

async function eventually(read, message, timeout = 20000) {
  const end = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > end) assert.fail(message)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

for (const engine of [chromium, webkit]) it(`signs in, starts and joins projects, invites safely, isolates drafts and shows reported presence in ${engine.name()}`,
  { timeout: 180000 }, async t => {
    const { startClient } = await import(serviceModule)
    const alice = await person(t, startClient, 'Alice', { harnessId: 'anthropic-claude-code', name: 'Alpha' })
    const bob = await person(t, startClient, 'Bob', { harnessId: 'openai-codex', name: 'Gamma' })
    const browser = await engine.launch({ headless: true })
    t.after(() => browser.close())
    const errors = []
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    if (engine === chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: alice.client.url })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))

    // Agent-led opening: the grant leaves the address bar and browser storage holds no credential.
    const openUrl = await alice.open()
    const grant = new URL(openUrl).hash.slice('#grant='.length)
    await page.goto(openUrl)
    await page.getByRole('button', { name: 'Continue as Alice' }).waitFor()
    assert.equal(new URL(page.url()).hash, '')
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    assert.equal(stored.includes(grant), false)
    assert.equal(await page.getByLabel('Email').inputValue(), 'alice@example.test', 'identity defaults come from Git')
    await page.getByRole('button', { name: 'Continue as Alice' }).click()
    await page.getByLabel('Project name').fill('Shared board')
    await page.getByRole('button', { name: 'Start project' }).click()
    const switcher = page.getByRole('button', { name: 'Project: Shared board. Switch project' })
    await switcher.waitFor()
    await page.getByRole('button', { name: /^You: Alice, human, (idle|active)\. Open your profile$/ }).waitFor()
    // A registered setup agent is not evidence of activity.
    await page.getByRole('button', { name: 'Alpha, agent, offline. Open profile' }).waitFor()
    assert.equal(await page.getByRole('combobox', { name: 'Actor', exact: true }).count(), 0, 'there is no author picker')

    // The used link is replay-safe: this browser stays signed in.
    await page.goto(openUrl)
    await switcher.waitFor()
    assert.equal(new URL(page.url()).hash, '')

    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByLabel('Title').fill('Draft isolation')
    await page.getByRole('button', { name: 'Create task' }).click()
    const panel = page.getByRole('complementary', { name: 'Task details' })
    await panel.getByRole('heading', { name: 'Draft isolation' }).waitFor()
    const card = page.locator('.task-card', { hasText: 'Draft isolation' })
    await card.getByRole('img', { name: 'Alice, human, active, on this task' }).waitFor({ timeout: 20000 })

    // Invitation text stays out of the DOM until revealed; Copy uses the real invitation.
    await page.getByRole('button', { name: 'Invite' }).click()
    await page.getByRole('menuitem', { name: /^Human/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite a person' })
    await dialog.getByRole('button', { name: 'Create invitation' }).click()
    await dialog.getByRole('button', { name: 'Copy invite' }).waitFor()
    await dialog.getByRole('region', { name: 'New invitation' }).getByText(/Waiting to be used · Expires in \d+ h/).waitFor()
    assert.equal((await page.content()).includes('pardner-invite-v1.'), false)
    let copied
    if (engine === chromium) {
      await dialog.getByRole('button', { name: 'Copy invite' }).click()
      await dialog.getByText(/^Copied\./).waitFor()
      copied = await page.evaluate(() => navigator.clipboard.readText())
    }
    // WebKit does not expose Chromium's clipboard permissions. Exercise its explicit reveal path.
    await dialog.getByRole('button', { name: 'Show invite text' }).click()
    const invitation = await dialog.getByLabel('Invite text').inputValue()
    assert.match(invitation, /pardner-invite-v1\./)
    if (copied !== undefined) assert.equal(invitation, copied)
    await dialog.getByRole('button', { name: 'Hide invite text' }).click()
    assert.equal((await page.content()).includes(invitation), false)
    await dialog.getByRole('button', { name: 'Close' }).click()

    // Bob joins with his own identity from his own client.
    const bobContext = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const bobPage = await bobContext.newPage()
    bobPage.on('pageerror', error => errors.push(error.message))
    await bobPage.goto(await bob.open())
    await bobPage.getByRole('button', { name: 'Continue as Bob' }).click()
    await bobPage.getByRole('button', { name: 'Join a project' }).click()
    await bobPage.getByLabel('Invitation').fill(invitation)
    await bobPage.getByRole('button', { name: 'Join project' }).click()
    await bobPage.getByRole('button', { name: 'Project: Shared board. Switch project' }).waitFor({ timeout: 30000 })
    await bobPage.getByRole('button', { name: /^You: Bob, human/ }).waitFor()
    const bobAvatar = page.getByRole('button', { name: /^Bob, human, (idle|active)\. Open profile$/ })
    await bobAvatar.waitFor({ timeout: 30000 })
    await bobAvatar.click()
    const profile = page.getByRole('dialog', { name: 'Bob' })
    await profile.getByText('bob@example.test').waitFor()
    await profile.getByText('Bob’s laptop').first().waitFor()
    await profile.getByText(/Browser$/).first().waitFor()
    await page.keyboard.press('Escape')
    await bobAvatar.waitFor()
    assert.equal(await bobAvatar.evaluate(element => element === document.activeElement), true, 'closing returns focus')

    // A draft survives reload and another participant's save of a different field.
    await panel.getByRole('button', { name: 'Edit task' }).click()
    await panel.getByLabel('Description').fill('Alice draft only')
    await page.reload()
    await panel.getByLabel('Description').waitFor()
    assert.equal(await panel.getByLabel('Description').inputValue(), 'Alice draft only')
    const { project } = await alice.call('/session').then(session => ({ project: session.projects[0] }))
    const taskId = await eventually(async () => {
      const { doc } = await bob.call(`/projects/${project.id}/api/automerge/doc`)
      return Object.values(doc.tasks).find(task => task.title === 'Draft isolation')?.id
    }, 'Bob’s replica did not receive the task')
    const bobContext2 = await bob.call(`/projects/${project.id}/api/automerge/task/${taskId}/context`)
    await bob.call(`/projects/${project.id}/api/automerge/operations`, { operationId: 'bob-rename', type: 'task.update',
      payload: { taskId, updates: { title: 'Renamed by Bob' }, expectedRevisions: { title: bobContext2.revisions.title } } })
    await panel.getByText(/saved a newer title since/).waitFor({ timeout: 30000 })
    assert.equal(await panel.getByLabel('Description').inputValue(), 'Alice draft only')
    await panel.getByRole('button', { name: 'Save changes' }).click()
    await panel.getByRole('button', { name: 'Edit task' }).waitFor()
    await panel.getByRole('heading', { name: 'Renamed by Bob' }).waitFor()
    await panel.locator('.markdown').getByText('Alice draft only', { exact: true }).waitFor()

    // Explicit fixture agent report (not a real worker): Alpha's own credential, actual model metadata.
    const agent = await alice.call(`/projects/${project.id}/agent-grant`, {})
    const started = await alice.call(`/projects/${project.id}/sessions`, { kind: 'agent', model: 'claude-opus-5-5', managedBy: 't3' }, agent.token)
    await alice.call(`/projects/${project.id}/sessions/${started.sessionId}/report`, { seq: 1, active: true, focusTaskIds: [taskId] }, agent.token)
    const renamedCard = page.locator('.task-card', { hasText: 'Renamed by Bob' })
    await renamedCard.getByRole('img', { name: 'Alpha, agent, active, on this task' }).waitFor({ timeout: 20000 })
    await panel.getByRole('button', { name: 'Alpha, agent, active, on this task. Open profile' }).waitFor()
    await page.getByRole('group', { name: 'People in this project' })
      .getByRole('button', { name: 'Alpha, agent, active. Open profile' }).click()
    const alphaProfile = page.getByRole('dialog', { name: 'Alpha' })
    await alphaProfile.getByText('claude-opus-5-5').waitFor()
    await alphaProfile.getByText('Claude Code').first().waitFor()
    await alphaProfile.getByText('T3').waitFor()
    await alphaProfile.getByRole('button', { name: 'Close' }).click()
    await alice.call(`/projects/${project.id}/sessions/${started.sessionId}/end`, {}, agent.token)
    await page.getByRole('button', { name: 'Alpha, agent, offline. Open profile' }).waitFor({ timeout: 20000 })

    // Project switching keeps each project's draft and selection separate.
    await panel.getByRole('button', { name: 'Edit task' }).click()
    await panel.getByLabel('Description').fill('Unsaved second draft')
    await switcher.focus()
    await page.keyboard.press('ArrowDown')
    await page.getByRole('menuitemradio', { name: /^Shared board/ }).waitFor()
    assert.equal(await page.getByRole('menuitemradio', { name: /^Shared board/ }).evaluate(element => element === document.activeElement), true)
    await page.keyboard.press('Escape')
    assert.equal(await switcher.evaluate(element => element === document.activeElement), true)
    await switcher.click()
    await page.getByRole('menuitem', { name: 'Start or join a project…' }).click()
    await page.getByLabel('Project name').fill('Side project')
    await page.getByRole('button', { name: 'Start project' }).click()
    await page.getByRole('button', { name: 'Project: Side project. Switch project' }).waitFor({ timeout: 30000 })
    assert.equal(await page.getByText('Renamed by Bob').count(), 0, 'another project’s tasks are not shown')
    await page.getByRole('button', { name: 'Project: Side project. Switch project' }).click()
    await page.getByRole('menuitemradio', { name: /^Shared board/ }).click()
    await switcher.waitFor()
    assert.equal(await panel.getByLabel('Description').inputValue(), 'Unsaved second draft')
    assert.deepEqual(errors, [])
  })
