import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { chromium, webkit } from 'playwright'
import { bootstrapPath, createClientApi, projectConfiguration, takeBootstrapGrant } from '../ui-prototype/src/client-api.js'
import { createConnection } from '../ui-prototype/src/connection.js'
import { sameComputerRoute, showTaskActions } from '../support/client-workspace.js'
import { fakeTunnel } from '../support/fake-tunnel.js'
import { joinApproved } from '../support/enrollment.js'
import { buildOffer, encodeInvitation } from '../lib/enrollment.js'
import { generateMachineKey } from '../lib/machine-key.js'
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
  assert.equal(takeBootstrapGrant({ hash: '#view=board', pathname: '/pardner/', search: '' }, history), null)
  assert.equal(replaced.length, 2, 'a fragment without a grant is left in place')
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
  alice.savePreferences({ view: 'board' })
  assert.equal([...local.values.keys()].some(key => key.endsWith(':credential')), false)
  await assert.rejects(alice.request('/automerge/doc'), { code: 'AUTH_REQUIRED' })
  assert.equal(sent.headers.Authorization, undefined)
  assert.equal(sent.headers['X-Pardner-Workspace'], 'project-a')
  assert.equal(sent.credentials, 'same-origin')
  assert.equal(alice.pending().operationId, 'op-1', 'an uncertain request survives an authentication failure')
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
const peopleDialog = page => page.getByRole('dialog', { name: 'People', exact: true })
async function openPeople(page) {
  await page.getByRole('button', { name: /^People(?:,|$)/ }).click()
  return peopleDialog(page)
}

async function openPerson(people, name) {
  const row = people.locator('.member-list > li').filter({
    has: people.page().locator('.member-name').filter({ hasText: new RegExp(`^${RegExp.escape(name)}(?: \\(you\\))?$`) }),
  })
  await row.locator('summary').click()
  return row
}

const serviceModule = new URL('../lib/client-service.js', import.meta.url)

async function gitProfile(name) {
  const directory = await mkdtemp(join(tmpdir(), `pardner-git-${name.toLowerCase()}-`))
  await run('git', ['init', '-q'], { cwd: directory })
  await run('git', ['config', 'user.name', name], { cwd: directory })
  await run('git', ['config', 'user.email', `${name.toLowerCase()}@example.test`], { cwd: directory })
  return directory
}

// `route: false` stands for a client started without --public-url.
async function person(t, startClient, name, agent, { route = true, tunnel } = {}) {
  const directory = await mkdtemp(join(tmpdir(), `pardner-ui-${name.toLowerCase()}-`))
  const gitDirectory = await gitProfile(name)
  const client = await startClient({ directory, ...(route ? await sameComputerRoute() : { port: 0 }), deviceName: `${name}’s laptop`, gitDirectory, setupAgent: agent, tunnel })
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
  return { client, call, directory, open: async () => (await call('/open', {})).url }
}

async function admitPerson(t, startClient, approver, projectId, name, agent) {
  const guest = await person(t, startClient, name, agent)
  await guest.call('/identity', { name, email: `${name.toLowerCase()}@example.test`, operationId: 'identity' })
  const { invitation } = await approver(`/projects/${projectId}/invites`, { purpose: 'human', operationId: `invite-${name}` })
  await joinApproved({ join: body => guest.call('/join', body), approver, invitation, operationId: 'join' })
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
    assert.equal(await page.evaluate(async () => (await document.fonts.load('14px "Monaspace Neon"'))
      .some(face => face.status === 'loaded')), true, 'Monaspace loads from the local UI build')
    await page.getByRole('button', { name: /^Alice, human, (idle|active), you\. Open People$/ }).waitFor()
    // The owner of a new project, on one machine, is told to pair a second one; the suggestion can be put off.
    const pairing = page.getByRole('status', { name: 'Pair a second machine' })
    await pairing.getByText('If you lose every machine you own, nobody can remove or demote an admin any more', { exact: false }).waitFor({ timeout: 30000 })
    await pairing.getByRole('button', { name: 'Not now' }).click()
    await pairing.waitFor({ state: 'detached' })
    // A registered setup agent is not evidence of activity.
    await page.getByRole('button', { name: 'Alpha, agent, offline. Open People' }).waitFor()
    assert.equal(await page.getByRole('combobox', { name: 'Actor', exact: true }).count(), 0, 'there is no author picker')

    // The used link is replay-safe: this browser stays signed in.
    await page.goto(openUrl)
    await switcher.waitFor()
    assert.equal(new URL(page.url()).hash, '')

    await page.getByRole('button', { name: 'New task' }).click()
    await page.getByLabel('Title').fill('Draft isolation')
    await page.getByRole('button', { name: 'Create task' }).click()
    const panel = page.getByRole('dialog', { name: 'Task details' })
    await panel.getByRole('heading', { name: 'Draft isolation' }).waitFor()
    const card = page.locator('.task-card', { hasText: 'Draft isolation' })
    await card.getByRole('img', { name: 'Alice, human, active, on this task' }).waitFor({ timeout: 20000 })

    // Invitation text stays out of the DOM until revealed; Copy uses the real invitation.
    assert.equal(await page.getByRole('button', { name: 'Invite', exact: true }).count(), 0, 'invitations start inside People')
    assert.equal(await page.getByRole('button', { name: /^You:/ }).count(), 0, 'your avatar replaces the separate profile button')
    const invitingPeople = await openPeople(page)
    const inviteTrigger = invitingPeople.getByRole('button', { name: 'Invite', exact: true })
    const inviteMenu = page.getByRole('menu', { name: 'Invite', exact: true })
    await inviteTrigger.press('ArrowDown')
    const humanItem = inviteMenu.getByRole('menuitem', { name: /^Human/ })
    await humanItem.waitFor()
    await eventually(() => humanItem.evaluate(element => element === document.activeElement), 'Invite must focus the first item')
    await page.keyboard.press('a')
    const agentItem = inviteMenu.getByRole('menuitem', { name: /^Agent/ })
    await eventually(() => agentItem.evaluate(element => element === document.activeElement), 'Menu typeahead must focus Agent')
    await page.keyboard.press('Escape')
    await inviteMenu.waitFor({ state: 'hidden' })
    await eventually(() => inviteTrigger.evaluate(element => element === document.activeElement), 'Escape must restore focus to Invite')
    await inviteTrigger.press('ArrowDown')
    await humanItem.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Invite a person' })
    assert.equal(await dialog.getByLabel('Role').inputValue(), 'member', 'the owner chooses the role; member by default')
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'the invitation dialog takes keyboard focus')
    await dialog.getByRole('button', { name: 'Create invitation' }).click()
    await dialog.getByRole('button', { name: 'Copy invite' }).waitFor()
    await dialog.getByRole('region', { name: 'New invitation' }).getByText(/Expires in \d+ h/).waitFor()
    assert.equal((await page.content()).includes('pardner-invite-v2.'), false)
    let copied
    if (engine === chromium) {
      await dialog.getByRole('button', { name: 'Copy invite' }).click()
      await dialog.getByText(/^Copied\./).waitFor()
      copied = await page.evaluate(() => navigator.clipboard.readText())
    }
    // WebKit does not expose Chromium's clipboard permissions. Exercise its explicit reveal path.
    await dialog.getByText(/^When they request to join, open People/).waitFor()
    await dialog.getByRole('button', { name: 'Show invite text' }).click()
    const invitation = await dialog.getByLabel('Invite text').inputValue()
    assert.match(invitation, /pardner-invite-v2\./)
    if (copied !== undefined) assert.equal(invitation, copied)
    await dialog.getByRole('button', { name: 'Hide invite text' }).click()
    assert.equal((await page.content()).includes(invitation), false)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await eventually(() => inviteTrigger.evaluate(element => element === document.activeElement), 'Closing the invitation must restore focus to Invite')
    await invitingPeople.getByRole('button', { name: 'Close', exact: true }).click()

    // Bob joins with his own identity from his own client.
    const bobContext = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const bobPage = await bobContext.newPage()
    bobPage.on('pageerror', error => errors.push(error.message))
    await bobPage.goto(await bob.open())
    await bobPage.getByRole('button', { name: 'Continue as Bob' }).click()
    await bobPage.getByRole('button', { name: 'Join a project' }).click()
    await bobPage.getByLabel('Invitation').fill(invitation)
    await bobPage.getByRole('button', { name: 'Join project' }).click()
    // Bob waits; Alice opens his request, both screens show one code, and Alice approves it.
    const waiting = bobPage.getByRole('region', { name: 'Waiting for approval' })
    await waiting.getByText('Ask your inviter or an admin to open People to reveal your code.').waitFor({ timeout: 30000 })
    assert.equal(await bobPage.getByRole('group', { name: 'Choose how to begin' }).count(), 0, 'waiting keeps the next approval step in focus')
    // The People button counts the requests waiting for this machine; the panel shows each with its code.
    await page.getByRole('button', { name: 'People, 1 waiting to join' }).click({ timeout: 30000 })
    const requests = page.getByRole('dialog', { name: 'People', exact: true })
    const request = requests.getByRole('listitem', { name: 'Bob wants to join as a member' })
    await request.getByText('bob@example.test · Bob’s laptop').waitFor()
    const approverCode = (await request.locator('.confirmation-code').textContent()).trim()
    assert.match(approverCode, /^\d{4} \d{4}$/)
    await waiting.getByTestId('join-code').getByText(approverCode, { exact: true }).waitFor({ timeout: 30000 })
    await request.getByRole('button', { name: `Approve Bob, code ${approverCode}` }).click()
    await requests.getByText('Approved the request from Bob.', { exact: true }).waitFor({ timeout: 30000 })
    await requests.getByRole('button', { name: 'Close' }).click()
    await bobPage.getByRole('button', { name: 'Project: Shared board. Switch project' }).waitFor({ timeout: 30000 })
    await bobPage.getByRole('button', { name: /^Bob, human, .*, you\. Open People$/ }).waitFor()
    const bobPeople = await openPeople(bobPage)
    const bobInvite = bobPeople.getByRole('button', { name: 'Invite', exact: true })
    await bobInvite.press('ArrowDown')
    const bobInviteMenu = bobPage.getByRole('menu', { name: 'Invite', exact: true })
    const unavailable = bobInviteMenu.getByRole('menuitem', { name: /^Human/ })
    await unavailable.waitFor()
    assert.equal(await unavailable.getAttribute('aria-disabled'), 'true')
    await unavailable.press('Enter')
    assert.equal(await bobPage.getByRole('dialog', { name: 'Invite a person' }).count(), 0)
    await bobPage.keyboard.press('Escape')
    await bobInviteMenu.waitFor({ state: 'hidden' })
    await bobPeople.getByRole('button', { name: 'Close', exact: true }).click()
    const bobAvatar = page.getByRole('button', { name: /^Bob, human, (idle|active)\. Open People$/ })
    await bobAvatar.waitFor({ timeout: 30000 })
    await bobAvatar.hover()
    const preview = page.getByRole('tooltip').filter({ hasText: 'Bob' })
    await preview.getByText('Human', { exact: false }).waitFor()
    await bobAvatar.click()
    const bobRoster = peopleDialog(page)
    const bobRow = await openPerson(bobRoster, 'Bob')
    await bobRow.getByRole('button', { name: 'View profile' }).click()
    const profile = page.getByRole('dialog', { name: 'Bob' })
    await profile.getByText('bob@example.test').waitFor()
    await profile.getByText('Bob’s laptop').first().waitFor()
    await profile.getByText(/Browser$/).first().waitFor()
    await page.keyboard.press('Escape')
    await bobRoster.getByRole('button', { name: 'Close', exact: true }).click()
    await bobAvatar.waitFor()
    assert.equal(await bobAvatar.evaluate(element => element === document.activeElement), true, 'closing returns focus')

    // A draft survives reload and another participant's save of a different field.
    await showTaskActions(panel)
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
    await panel.getByText('Task actions', { exact: true }).waitFor()
    await panel.getByRole('heading', { name: 'Renamed by Bob' }).waitFor()
    await panel.locator('.markdown').getByText('Alice draft only', { exact: true }).waitFor()

    // Rebasing a draft onto a collaborator's newer save keeps their value for fields this user never touched.
    await showTaskActions(panel)
    await panel.getByRole('button', { name: 'Edit task' }).click()
    await panel.getByLabel('Description').fill('Alice draft after rebase')
    const bobContext3 = await bob.call(`/projects/${project.id}/api/automerge/task/${taskId}/context`)
    await bob.call(`/projects/${project.id}/api/automerge/operations`, { operationId: 'bob-rename-2', type: 'task.update',
      payload: { taskId, updates: { title: 'Renamed twice by Bob' }, expectedRevisions: { title: bobContext3.revisions.title } } })
    await panel.getByText(/saved a newer title since/).waitFor({ timeout: 30000 })
    await panel.getByRole('button', { name: 'Base my draft on the latest version' }).click()
    assert.equal(await panel.getByLabel('Title').inputValue(), 'Renamed twice by Bob', 'an untouched field follows the latest version')
    assert.equal(await panel.getByLabel('Description').inputValue(), 'Alice draft after rebase', 'the edited field keeps the draft')
    await panel.getByRole('button', { name: 'Save changes' }).click()
    await panel.getByText('Task actions', { exact: true }).waitFor()
    await panel.getByRole('heading', { name: 'Renamed twice by Bob' }).waitFor()
    await panel.locator('.markdown').getByText('Alice draft after rebase', { exact: true }).waitFor()
    const afterRebase = await alice.call(`/projects/${project.id}/api/automerge/doc`)
    assert.equal(afterRebase.doc.tasks[taskId].title, 'Renamed twice by Bob', 'the rebase must not revert Bob’s saved title')

    // Explicit fixture agent report (not a real worker): Alpha's own credential, actual model metadata.
    const agent = await alice.call(`/projects/${project.id}/agent-grant`, {})
    const started = await alice.call(`/projects/${project.id}/sessions`, { kind: 'agent', model: 'claude-opus-5-5', managedBy: 't3' }, agent.token)
    await alice.call(`/projects/${project.id}/sessions/${started.sessionId}/report`, { seq: 1, active: true, focusTaskIds: [taskId] }, agent.token)
    const renamedCard = page.locator('.task-card', { hasText: 'Renamed twice by Bob' })
    await renamedCard.getByRole('img', { name: 'Alpha, agent, active, on this task' }).waitFor({ timeout: 20000 })
    await panel.getByRole('button', { name: 'Alpha, agent, active, on this task. Open profile' }).waitFor()
    await page.getByRole('group', { name: 'People in this project' })
      .getByRole('button', { name: 'Alpha, agent, active. Open People' }).click()
    const alphaRoster = peopleDialog(page)
    const alphaRow = await openPerson(alphaRoster, 'Alice')
    await alphaRow.getByRole('button', { name: 'Alpha', exact: true }).click()
    const alphaProfile = page.getByRole('dialog', { name: 'Alpha' })
    await alphaProfile.getByText('claude-opus-5-5').waitFor()
    await alphaProfile.getByText('Claude Code').first().waitFor()
    await alphaProfile.getByText('T3').waitFor()
    await alphaProfile.getByRole('button', { name: 'Close' }).click()
    await alphaRoster.getByRole('button', { name: 'Close' }).click()
    await alice.call(`/projects/${project.id}/sessions/${started.sessionId}/end`, {}, agent.token)
    await page.getByRole('button', { name: 'Alpha, agent, offline. Open People' }).waitFor({ timeout: 20000 })

    // Project switching keeps each project's draft and selection separate.
    await showTaskActions(panel)
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
    assert.equal(await page.getByText('Renamed twice by Bob').count(), 0, 'another project’s tasks are not shown')
    await page.getByRole('button', { name: 'Project: Side project. Switch project' }).click()
    await page.getByRole('menuitemradio', { name: /^Shared board/ }).click()
    await switcher.waitFor()
    assert.equal(await panel.getByLabel('Description').inputValue(), 'Unsaved second draft')
    assert.deepEqual(errors, [])
  })

for (const engine of [chromium, webkit]) it(`links a second device from the identity step and refuses other invitation kinds there in ${engine.name()}`,
  { timeout: 120000 }, async t => {
    const { startClient } = await import(serviceModule)
    const alice = await person(t, startClient, 'Alice', { harnessId: 'anthropic-claude-code', name: 'Alpha' })
    await alice.call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    const { project } = await alice.call('/projects', { name: 'Linked board', operationId: 'create' })
    const human = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'human' })
    const device = await alice.call(`/projects/${project.id}/invites`, { purpose: 'device', operationId: 'device' })
    const desktop = await person(t, startClient, 'Desktop')
    const browser = await engine.launch({ headless: true })
    t.after(() => browser.close())
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(await desktop.open())
    await page.getByRole('button', { name: 'Link this device instead' }).click()
    const form = page.getByRole('form', { name: 'Link this device' })
    // A Human invitation pasted here is refused before any request, so it stays usable by its recipient.
    await form.getByLabel('My device invitation').fill(human.invitation)
    await form.getByRole('button', { name: 'Link device' }).click()
    await form.getByText('This is a Human invitation. Confirm your identity first, then join with it.').waitFor()
    assert.deepEqual(alice.client.registry.read().invites[human.invite.id].requests, {}, 'a refused paste never reaches the hub')
    await form.getByLabel('My device invitation').fill(device.invitation)
    // Before anything is sent, the page says whose identity this computer joins (#155).
    await form.getByText('This computer will be linked as Alice <alice@example.test> in “Linked board”.').waitFor()
    const operationIds = new Set()
    let unsignedPoll = false
    await page.route(`**${CLIENT_API}/join`, route => {
      operationIds.add(route.request().postDataJSON().operationId)
      if (!unsignedPoll) return route.continue()
      return route.fulfill({ status: 503, json: { code: 'UNSIGNED_ENROLLMENT_REPLY',
        error: 'The hub may be running an older version of Pardner. Check the version on both computers and try again.' } })
    })
    await form.getByRole('button', { name: 'Link device' }).click()
    const waiting = page.getByRole('region', { name: 'Waiting for approval' })
    await waiting.getByText(/link this computer as Alice <alice@example\.test> in “Linked board”/).waitFor({ timeout: 30000 })
    unsignedPoll = true
    const warning = waiting.getByRole('alert')
    await warning.getByText('Pardner couldn’t verify the hub’s reply', { exact: true }).waitFor()
    await warning.getByText(/Check the version on both computers/).waitFor()
    await waiting.screenshot({ path: join('output', 'playwright', `unsigned-approval-${engine.name()}.png`) })
    unsignedPoll = false
    await warning.waitFor({ state: 'hidden' })
    // Alice approves from her own client after comparing the code.
    const [pending] = (await alice.call(`/projects/${project.id}/join-requests`)).requests
    assert.equal(pending.person.name, 'Alice'); assert.equal(pending.purpose, 'device')
    const { request } = await alice.call(`/projects/${project.id}/join-requests/${pending.id}/code`, {})
    await waiting.getByTestId('join-code').getByText(request.code, { exact: true }).waitFor({ timeout: 30000 })
    await alice.call(`/projects/${project.id}/join-requests/${pending.id}/approve`, { code: request.code })
    await page.getByRole('button', { name: 'Project: Linked board. Switch project' }).waitFor({ timeout: 30000 })
    await page.getByRole('button', { name: /^Alice, human, .*, you\. Open People$/ }).waitFor()
    assert.equal(desktop.client.registry.read().identity.id, alice.client.registry.read().identity.id, 'the device adopts the sponsor identity')
    assert.equal(alice.client.registry.read().invites[device.invite.id].state, 'redeemed')
    assert.equal(operationIds.size, 1, 'the browser keeps polling the same join attempt')
    assert.deepEqual(errors, [])
  })

for (const engine of [chromium, webkit]) it(`explains recovery on a joined computer when its sharing route goes down in ${engine.name()}`,
  { timeout: 120000 }, async t => {
    const { startClient } = await import(serviceModule)
    const host = await person(t, startClient, 'Alice', undefined, { tunnel: fakeTunnel() })
    const guest = await person(t, startClient, 'Bob', undefined, { route: false, tunnel: fakeTunnel() })
    const configuredPeer = await person(t, startClient, 'Carol')
    await host.call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    await guest.call('/identity', { name: 'Bob', email: 'bob@example.test', operationId: 'identity' })
    await configuredPeer.call('/identity', { name: 'Carol', email: 'carol@example.test', operationId: 'identity' })
    const { project } = await host.call('/projects', { name: 'Shared board', operationId: 'create' })
    const configured = await host.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'configured-invite' })
    await joinApproved({ join: body => configuredPeer.call('/join', body), approver: host.call, invitation: configured.invitation, operationId: 'configured-join' })
    const sharing = `/projects/${project.id}/share`
    await host.call(sharing, { on: true })
    const { invitation } = await host.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite' })
    await joinApproved({ join: body => guest.call('/join', body), approver: host.call, invitation, operationId: 'join' })

    const browser = await engine.launch({ headless: true })
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(await guest.open())
    const trigger = page.getByRole('button', { name: /^Project status, 1 connected computer$/ })
    const details = page.getByRole('dialog', { name: 'Project status' })
    const route = details.getByRole('status')
    await trigger.waitFor()
    assert.deepEqual(await trigger.locator('svg title').allTextContents(), ['1 connected computer'])
    await trigger.click()
    await route.getByText(/Connected through Tailcat/).waitFor({ timeout: 30000 })
    const hostPage = await browser.newPage()
    await hostPage.goto(await host.open())
    await hostPage.getByRole('button', { name: /^Project status, 2 connected computers$/ }).waitFor()
    await hostPage.getByRole('button', { name: 'Tailcat on' }).click()
    await hostPage.getByRole('dialog', { name: 'Tailcat sharing' }).getByRole('button', { name: 'Turn off Tailcat sharing' }).click()
    await hostPage.getByRole('button', { name: /^Project status, 1 connected computer$/ }).waitFor()
    await route.getByText(/Saved work stays here. Pardner retries automatically./).waitFor({ timeout: 30000 })
    await route.getByText(/ask the host to check Tailcat sharing/).waitFor()
    await page.getByRole('button', { name: /^Project status, No peers connected$/ }).waitFor()
    await guest.call(`/projects/${project.id}/api/automerge/operations`, {
      type: 'task.create', operationId: 'offline-task', payload: { title: 'Draft the offline release notes' },
    })
    const waiting = page.getByRole('button', { name: /^Project status, No peers connected, Waiting to replicate$/ })
    await waiting.waitFor()
    assert.deepEqual(await waiting.locator('svg title').allTextContents(), ['No peers connected', 'Waiting to replicate'])
    assert.equal(await route.getByRole('button').count(), 0)
    await page.keyboard.press('Escape')
    await details.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: /^People/ }).click()
    const people = page.getByRole('dialog', { name: 'People', exact: true })
    await people.getByText(/Showing the last member list/).waitFor()
    assert.equal(await people.getByRole('heading', { name: 'Waiting to join' }).count(), 0,
      'a known hub outage does not repeat the same error in an empty request section')
    await people.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: /Draft the offline release notes/ }).click()
    const panel = page.getByRole('dialog', { name: 'Task details' })
    const taskIndicator = panel.locator('.discussion-title svg')
    await taskIndicator.waitFor()
    assert.deepEqual(await taskIndicator.locator('title').allTextContents(), ['Waiting to replicate'])
    await panel.getByRole('status').getByText('Waiting to replicate', { exact: true }).waitFor()
    await host.call(sharing, { on: true })
    await taskIndicator.waitFor({ state: 'detached', timeout: 45000 })
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await trigger.click()
    await route.getByText(/Connected through Tailcat/).waitFor({ timeout: 45000 })
  })

for (const engine of [chromium, webkit]) it(`recovers a loopback-only invitation and keeps the Invite dialog usable through a hub outage in ${engine.name()}`,
  { timeout: 150000 }, async t => {
    const { startClient } = await import(serviceModule)
    const browser = await engine.launch({ headless: true })
    t.after(() => browser.close())
    const errors = []
    const newPage = async () => {
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
      page.on('pageerror', error => errors.push(error.message))
      return page
    }
    const openInvite = async (page, projectName, { item = /^Human/, title = 'Invite a person' } = {}) => {
      await page.getByRole('button', { name: `Project: ${projectName}. Switch project` }).waitFor({ timeout: 30000 })
      await (await openPeople(page)).getByRole('button', { name: 'Invite', exact: true }).click()
      await page.getByRole('menuitem', { name: item }).click()
      return page.getByRole('dialog', { name: title })
    }

    // Carol's client was started without --public-url, so a Human invitation could only be used on her computer.
    const carol = await person(t, startClient, 'Carol', undefined, { route: false, tunnel: fakeTunnel() })
    await carol.call('/identity', { name: 'Carol', email: 'carol@example.test', operationId: 'identity' })
    await carol.call('/projects', { name: 'Loopback board', operationId: 'create' })
    const carolPage = await newPage()
    await carolPage.goto(await carol.open())
    const refusing = await openInvite(carolPage, 'Loopback board')
    assert.equal(await refusing.getByRole('region', { name: 'Invitations for this project' }).count(), 0)
    assert.equal(await refusing.getByRole('alert').count(), 0, 'no alert before the person acts')
    const enableSharing = refusing.getByRole('button', { name: 'Turn on Tailcat' })
    await enableSharing.waitFor()
    assert.deepEqual(carol.client.registry.read().share.projects, [], 'sharing stays off until confirmed')
    assert.equal(await refusing.getByRole('button', { name: 'Copy invite' }).count(), 0)
    assert.equal(Object.keys(carol.client.registry.read().invites).length, 0, 'opening the invite dialog creates no invitation')
    await refusing.getByLabel('Role').selectOption('admin')
    await enableSharing.press('Enter')
    const createInvite = refusing.getByRole('button', { name: 'Create invitation' })
    await createInvite.waitFor()
    await refusing.getByText('Tailcat sharing is on for this project.', { exact: true }).waitFor()
    assert.equal(await createInvite.evaluate(node => node === document.activeElement), true)
    assert.equal(Object.keys(carol.client.registry.read().invites).length, 0, 'enabling a route does not issue an invitation')
    await createInvite.click()
    await refusing.getByRole('button', { name: 'Copy invite' }).waitFor()
    const [created] = Object.values(carol.client.registry.read().invites)
    assert.equal(created.offer.role, 'admin')
    assert.equal(carol.client.registry.read().share.projects.length, 1)
    await refusing.getByRole('button', { name: 'Close' }).click()
    await peopleDialog(carolPage).getByRole('button', { name: 'Close', exact: true }).click()

    // An invitation whose only route is another computer's loopback address names it instead of advising a retry.
    const { port } = await sameComputerRoute()
    const unreachable = `http://127.0.0.1:${port}`
    const loopbackInvitation = encodeInvitation({ projectName: 'Elsewhere', secret: 'i'.repeat(43), offer: buildOffer(generateMachineKey(), {
      projectId: 'a'.repeat(64), offerId: 'offer-unreachable-1', purpose: 'human', role: 'member', routes: [`${unreachable}/pardner/client/v1/enroll`],
      expiresAt: Date.now() + 3600000 }) })
    await carolPage.getByRole('button', { name: 'Project: Loopback board. Switch project' }).click()
    await carolPage.getByRole('menuitem', { name: 'Start or join a project…' }).click()
    await carolPage.getByRole('button', { name: 'Join a project' }).click()
    await carolPage.getByLabel('Invitation').fill(loopbackInvitation)
    await carolPage.getByRole('button', { name: 'Join project' }).click()
    const unreachableAlert = carolPage.getByRole('alert')
    await unreachableAlert.getByText('This invitation points somewhere this computer can’t reach', { exact: true }).waitFor({ timeout: 30000 })
    await unreachableAlert.getByText(`This invitation points to ${unreachable}, which this computer can't reach`, { exact: false }).waitFor()
    assert.doesNotMatch(await unreachableAlert.textContent(), /retry/i)

    const olderHub = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ state: 'pending', requestId: 'unsigned-request' }))
    })
    await new Promise(resolve => olderHub.listen(0, '127.0.0.1', resolve))
    try {
      const olderInvitation = encodeInvitation({ projectName: 'Older board', secret: 'i'.repeat(43), offer: buildOffer(generateMachineKey(), {
        projectId: 'a'.repeat(64), offerId: 'offer-unsigned-1', purpose: 'human', role: 'member',
        routes: [`http://127.0.0.1:${olderHub.address().port}${CLIENT_API}/enroll`], expiresAt: Date.now() + 3600000 }) })
      await carolPage.getByLabel('Invitation').fill(olderInvitation)
      await carolPage.getByRole('button', { name: 'Join project' }).click()
      const versionAlert = carolPage.getByRole('alert')
      await versionAlert.getByText('Pardner couldn’t verify the hub’s reply', { exact: true }).waitFor()
      await versionAlert.getByText(/may be running an older version of Pardner/).waitFor()
    } finally { await new Promise(resolve => olderHub.close(resolve)) }

    // Bob joined Alice's project; with Alice's computer (the hub) down, his Invite dialog explains rather than loading forever.
    // Bob is a member, so since #196 the invitation he may issue is My device (pairing his own machine), issued by the hub.
    const alice = await person(t, startClient, 'Alice')
    await alice.call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
    const { project } = await alice.call('/projects', { name: 'Outage board', operationId: 'create' })
    const invite = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'invite-bob' })
    const bob = await person(t, startClient, 'Bob')
    await bob.call('/identity', { name: 'Bob', email: 'bob@example.test', operationId: 'identity' })
    await joinApproved({ join: body => bob.call('/join', body), approver: alice.call, invitation: invite.invitation, operationId: 'join' })
    await alice.client.stop()
    const bobPage = await newPage()
    await bobPage.goto(await bob.open())
    const dialog = await openInvite(bobPage, 'Outage board', { item: /^My device/, title: 'Pair one of your machines' })
    await dialog.getByText('Invitation history', { exact: true }).click()
    const history = dialog.getByRole('region', { name: 'Invitations for this project' })
    await history.getByText('Couldn’t load invitations.').waitFor({ timeout: 20000 })
    await history.getByText('issued by its hub, the computer of the person who started it', { exact: false }).waitFor()
    assert.equal(await dialog.getByRole('alert').count(), 0, 'a failed list is not an alert before any action')
    assert.equal(await history.getByText('Loading…').count(), 0)
    await dialog.getByRole('button', { name: 'Create invitation' }).click()
    const outage = dialog.getByRole('alert')
    await outage.getByText('The project’s hub is unreachable', { exact: true }).waitFor()
    await outage.getByText('Invitations for this project are issued by its hub', { exact: false }).waitFor()
    assert.equal(await dialog.getByText('Project authority unavailable', { exact: false }).count(), 0, 'the raw server message is not the heading')
    assert.equal(await history.getByText('issued by its hub', { exact: false }).count(), 0, 'the list does not repeat the alert')
    await history.getByText('Couldn’t load invitations.').waitFor()

    // When the hub is back, Retry loads the list and the same Create invitation succeeds.
    const hub = await startClient({ directory: alice.directory })
    // Stopped before the fixture removes this directory: after hooks run in the order they were added, so a hook here
    // would run after the removal, which then races the running client and can leave it running.
    try {
      await history.getByRole('button', { name: 'Retry' }).click()
      await history.getByText('None yet.').waitFor({ timeout: 20000 })
      await dialog.getByRole('button', { name: 'Create invitation' }).click()
      await dialog.getByRole('button', { name: 'Copy invite' }).waitFor({ timeout: 20000 })
      assert.equal(await dialog.getByRole('alert').count(), 0)
      assert.deepEqual(errors, [])
    } finally {
      await hub.stop()
    }
  })

// A Git profile with only user.name; global and system config are hidden so the email cannot leak in.
async function startNameOnlyClient(t, startClient, name) {
  const directory = await mkdtemp(join(tmpdir(), `pardner-ui-${name.toLowerCase()}-`))
  const gitDirectory = await mkdtemp(join(tmpdir(), `pardner-git-${name.toLowerCase()}-`))
  await run('git', ['init', '-q'], { cwd: gitDirectory })
  await run('git', ['config', 'user.name', name], { cwd: gitDirectory })
  const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM }
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  let client
  try { client = await startClient({ directory, ...await sameComputerRoute(), deviceName: `${name}’s laptop`, gitDirectory }) } finally {
    for (const [key, value] of [['GIT_CONFIG_GLOBAL', saved.global], ['GIT_CONFIG_NOSYSTEM', saved.nosystem]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
  t.after(async () => {
    await client.stop()
    await rm(directory, { recursive: true, force: true })
    await rm(gitDirectory, { recursive: true, force: true })
  })
  return client
}

// Fixture Actors registered straight into the project's people, so the header overflows into "+N".
async function addFixturePeople(client, projectId, people) {
  const { actorsFor } = await import(new URL('../lib/client-identity.js', import.meta.url))
  const project = client.project(projectId)
  for (const [index, { name, agent }] of people.entries()) {
    const id = `00000000-0000-4000-8000-00000000000${index + 1}`
    const device = { id: `00000000-0000-4000-9000-00000000000${index + 1}`, name: `${name}’s desk` }
    for (const actor of actorsFor({ id, name, email: `${name.toLowerCase()}@example.test` }, device, agent)) {
      await client.registerActor(project, actor)
    }
  }
}

it('explains sign-in, the Git prefill, invitation follow-up and People focus in chromium', { timeout: 180000 }, async t => {
  const { startClient } = await import(serviceModule)
  const client = await startNameOnlyClient(t, startClient, 'Nadia')
  const call = async (path, body) => {
    const response = await fetch(`${client.url}${CLIENT_API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.registry.read().operatorToken}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.ok, true, path)
    return response.json()
  }
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const errors = []
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  page.on('pageerror', error => errors.push(error.message))

  // Signed out: the person can run the command; a reused link says why it failed.
  const { url: openUrl } = await call('/open', {})
  await page.goto(openUrl.split('#')[0])
  await page.getByText('Run pardner up on this computer, or ask your agent to.', { exact: false }).waitFor()
  assert.equal(await page.getByText('pardner client up').count(), 0)
  await page.goto(openUrl)
  await page.getByRole('button', { name: /^Continue as/ }).waitFor()
  const stranger = await (await browser.newContext()).newPage()
  await stranger.goto(openUrl)
  await stranger.getByText('This sign-in link was already used or is more than 60 seconds old. Links work once.').waitFor()

  // Git supplied only a name, so the note says which field still needs typing.
  assert.equal(await page.getByLabel('Name').inputValue(), 'Nadia')
  assert.equal(await page.getByLabel('Email').inputValue(), '')
  await page.getByText('Name filled in from your Git configuration; enter your email.').waitFor()
  await page.getByLabel('Email').fill('nadia@example.test')
  await page.getByRole('button', { name: 'Continue as Nadia' }).click()
  // With no name given, the setup agent is named after its owner and harness.
  await page.getByText('Your Codex agent is registered as Nadia’s Codex.', { exact: false }).waitFor()
  await page.getByLabel('Project name').fill('Chrome board')
  await page.getByRole('button', { name: 'Start project' }).click()
  await page.getByRole('button', { name: 'Project: Chrome board. Switch project' }).waitFor()
  const projectId = (await call('/session')).projects[0].id

  // The new invitation is not repeated in history; after revoking it, another is one click away.
  await (await openPeople(page)).getByRole('button', { name: 'Invite', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Human/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite a person' })
  await dialog.getByRole('button', { name: 'Create invitation' }).click()
  const ready = dialog.getByRole('region', { name: 'New invitation' })
  await ready.getByRole('button', { name: 'Copy invite' }).waitFor()
  await dialog.getByText('Invitation history', { exact: true }).click()
  await dialog.getByText('No other invitations.').waitFor()
  assert.equal(await dialog.locator('.invite-list li').count(), 0, 'the shown invitation is not listed twice')
  await ready.getByText('Send privately. One use.', { exact: false }).waitFor()
  await ready.getByRole('button', { name: 'Show invite text' }).click()
  await ready.getByLabel('Invite text').waitFor()
  assert.equal(await ready.getByText('Send privately. One use.', { exact: false }).count(), 0, 'no hidden note while visible')
  await ready.getByRole('button', { name: 'Revoke this invitation' }).click()
  await ready.getByText('This invitation can no longer be used.', { exact: false }).waitFor()
  assert.equal(await ready.getByText(/Expires/).count(), 0, 'a revoked invitation shows no expiry')
  const firstId = (await call(`/projects/${projectId}/invites`)).invites[0].id
  await ready.getByRole('button', { name: 'Create another invitation' }).click()
  await ready.getByRole('button', { name: 'Copy invite' }).waitFor()
  await ready.getByText(/Expires in \d+ h/).waitFor()
  const { invites } = await call(`/projects/${projectId}/invites`)
  assert.equal(invites.length, 2, 'a fresh operation ID creates a second invitation')
  assert.equal(invites.find(invite => invite.id === firstId).state, 'revoked')
  await dialog.locator('.invite-list li', { hasText: 'Revoked' }).waitFor()
  assert.equal(await dialog.locator('.invite-list li').count(), 1)
  await dialog.getByRole('button', { name: 'Close' }).click()

  await peopleDialog(page).getByRole('button', { name: 'Close', exact: true }).click()

  // Closing a profile returns to People, and closing People returns focus to +N.
  await admitPerson(t, startClient, call, projectId, 'Omar', { harnessId: 'cursor', name: 'Cursor (ci)' })
  await admitPerson(t, startClient, call, projectId, 'Priya', { harnessId: 'openai-codex', name: 'Quill' })
  const more = page.getByRole('button', { name: /more Actors?\. Open People$/ })
  await more.waitFor({ timeout: 30000 })
  await more.click()
  const people = peopleDialog(page)
  const omarRow = await openPerson(people, 'Omar')
  await omarRow.getByRole('button', { name: 'View profile' }).click()
  const profile = page.getByRole('dialog', { name: 'Omar' })
  await profile.waitFor()
  await page.keyboard.press('Escape')
  await people.waitFor()
  assert.equal(await profile.count(), 0)
  await people.getByRole('button', { name: 'Close' }).click()
  await page.waitForFunction(() => /Open People$/.test(document.activeElement?.getAttribute('aria-label') ?? ''))
  assert.deepEqual(errors, [])
})

it('shows letter initials and keeps an owner’s Git details off agent profiles in chromium', { timeout: 120000 }, async t => {
  const { startClient } = await import(serviceModule)
  const alice = await person(t, startClient, 'Alice', { harnessId: 'anthropic-claude-code', name: 'Alpha' })
  await alice.call('/identity', { name: 'Alice', email: 'alice@example.test', operationId: 'identity' })
  const { project } = await alice.call('/projects', { name: 'Initials board', operationId: 'create' })
  await admitPerson(t, startClient, alice.call, project.id, 'Omar', { harnessId: 'cursor', name: 'Cursor (ci)' })
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const errors = []
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(await alice.open())
  const stack = page.getByRole('group', { name: 'People in this project' })
  const cursor = stack.getByRole('button', { name: /^Cursor \(ci\), agent, / })
  await cursor.waitFor({ timeout: 30000 })
  assert.equal(await cursor.locator('.avatar-initials').textContent(), 'CC', 'punctuation is not an initial')

  await cursor.click()
  const roster = peopleDialog(page)
  const row = await openPerson(roster, 'Omar')
  await row.getByRole('button', { name: 'Cursor (ci)', exact: true }).click()
  const agentProfile = page.getByRole('dialog', { name: 'Cursor (ci)' })
  await agentProfile.getByText('Works for').waitFor()
  await agentProfile.locator('dd', { hasText: /^Omar$/ }).waitFor()
  for (const label of ['Name', 'Email', 'Git name', 'Git email']) {
    assert.equal(await agentProfile.locator('dt', { hasText: new RegExp(`^${label}$`) }).count(), 0, `${label} is not on an agent profile`)
  }
  assert.equal(await agentProfile.getByText('omar@example.test').count(), 0, 'the owner’s email is not shown as the agent’s')
  await page.keyboard.press('Escape')

  await row.getByRole('button', { name: 'View profile' }).click()
  const humanProfile = page.getByRole('dialog', { name: 'Omar' })
  await humanProfile.locator('dt', { hasText: /^Email$/ }).waitFor()
  await humanProfile.getByText('omar@example.test').waitFor()
  assert.equal(await humanProfile.locator('dt', { hasText: /^Git (name|email)$/ }).count(), 0)
  assert.deepEqual(errors, [])
})

it('tells two people’s default agents apart in the header and Actor pickers in chromium', { timeout: 120000 }, async t => {
  const { startClient } = await import(serviceModule)
  const priya = await person(t, startClient, 'Priya', {})
  await priya.call('/identity', { name: 'Priya', email: 'priya@example.test', operationId: 'identity' })
  const { project } = await priya.call('/projects', { name: 'Two agents', operationId: 'create' })
  await addFixturePeople(priya.client, project.id, [{ name: 'Marcus', agent: { harnessId: 'openai-codex', name: null } }])
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const errors = []
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(await priya.open())
  const stack = page.getByRole('group', { name: 'People in this project' })
  const initials = []
  for (const name of ['Priya’s Codex', 'Marcus’s Codex']) {
    const avatar = stack.getByRole('button', { name: new RegExp(`^${name}, agent, `) })
    await avatar.waitFor({ timeout: 30000 })
    initials.push(await avatar.locator('.avatar-initials').textContent())
  }
  assert.deepEqual(initials, ['PC', 'MC'])
  const options = await page.getByLabel('Assigned to').locator('option').allTextContents()
  assert.deepEqual(options.filter(option => option.endsWith(' · agent')).sort(), ['Marcus’s Codex · agent', 'Priya’s Codex · agent'])
  assert.deepEqual(errors, [])
})
