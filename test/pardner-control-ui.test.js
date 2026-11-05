import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, webkit } from 'playwright'
import AutomergeSyncServer from '../automerge-sync-server.js'
import { ACTORS } from '../support/workspace-test.js'
import { FakeT3 } from '../support/fake-t3-server.js'

for (const engine of [chromium, webkit]) it(`shows stale reads, approval blocks, held follow-ups, cancellation output and separate verdicts in ${engine.name()}`, { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-control-ui-'))
  const t3 = await new FakeT3().start()
  t3.thread('thread-ui', { title: 'Pardner control thread' })
  const server = new AutomergeSyncServer({ directory, actors: ACTORS, env: {}, apiToken: 'ui-token', httpPort: 0, wsPort: 0, logger: {},
    control: { pollMs: 150, staleAfterMs: 1500 } })
  await server.start()
  const browser = await engine.launch({ headless: true })
  t.after(async () => {
    await browser.close()
    await server.stop()
    await t3.stop().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  })
  const errors = []
  const operation = async (type, payload) => (await (await fetch(`http://127.0.0.1:${server.httpPort}/automerge/operations`, { method: 'POST',
    headers: { Authorization: 'Bearer ui-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload, actorId: 'alice', operationId: randomUUID() }) })).json()).result
  const task = await operation('task.create', { title: 'Build the control pane' })

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpPort}/pardner/`)
  await page.getByLabel('Local service token').fill('ui-token')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByLabel('Actor', { exact: true }).selectOption('alice')

  // Link an existing GitHub issue from the task itself.
  await page.getByRole('button', { name: /Build the control pane/ }).click()
  await page.getByLabel('Link GitHub issue').fill('depatchedmode/pardner#77')
  await page.getByRole('button', { name: 'Link issue', exact: true }).click()
  await page.getByRole('link', { name: 'depatchedmode/pardner#77' }).waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()

  await page.getByRole('button', { name: 'Control', exact: true }).click()
  await page.getByLabel('T3 address').fill(t3.origin)
  await page.getByLabel('T3 pairing code').fill(t3.issueCode())
  await page.getByRole('button', { name: 'Pair T3' }).click()
  await page.getByText(/T3 credential: valid/).waitFor()
  await page.getByLabel('Project ID', { exact: true }).fill('pardner')
  await page.getByLabel('Project name').fill('Pardner')
  await page.getByLabel('GitHub repository').fill('depatchedmode/pardner')
  await page.getByRole('button', { name: 'Save project' }).click()
  await page.getByLabel('Project', { exact: true }).selectOption('pardner')
  await page.getByLabel('T3 thread ID').fill('thread-ui')
  await page.getByLabel('Agent Actor', { exact: true }).selectOption('builder')
  await page.getByRole('checkbox', { name: 'Build the control pane' }).check()
  await page.getByRole('checkbox', { name: 'alice' }).check()
  await page.getByRole('button', { name: 'Map thread' }).click()
  const thread = page.getByRole('region', { name: 'T3 thread Pardner control thread' })
  await thread.waitFor()
  await thread.getByText('project folder (T3 reports no worktree)', { exact: false }).waitFor()

  const followUp = thread.getByLabel(/Follow-up for builder/)
  await followUp.fill('Implement the pane')
  await thread.getByRole('button', { name: 'Queue follow-up' }).click()
  const first = thread.getByRole('article').filter({ hasText: 'Implement the pane' })
  await first.getByText('Running', { exact: true }).waitFor()
  const runId = t3.threads.get('thread-ui').runs[0].runId

  t3.block(runId)
  await first.getByText('Waiting for approval or input').waitFor()
  assert.equal(await first.getByRole('link', { name: 'Decide in T3' }).getAttribute('href'), t3.threads.get('thread-ui').link)
  await followUp.fill('Address review feedback')
  await thread.getByRole('button', { name: 'Queue follow-up' }).click()
  const second = thread.getByRole('article').filter({ hasText: 'Address review feedback' })
  await second.getByText('Queued in Pardner').waitFor()
  await thread.getByText(/Dispatch held: Awaiting this controller/).waitFor()

  // T3 becomes unreachable: the last read is shown as stale rather than current.
  const port = new URL(t3.origin).port
  await t3.stop()
  await thread.getByText(/^Stale: last read/).first().waitFor()
  await thread.getByText(/Last T3 pass failed/).waitFor()
  t3.server.listen(Number(port), '127.0.0.1')
  await new Promise(resolve => t3.server.once('listening', resolve))
  await thread.getByText(/^Read \d+s ago/).first().waitFor()

  t3.unblock(runId)
  t3.say(runId, 'Partial work: wrote the registry')
  t3.slowInterrupt = true
  await first.getByRole('button', { name: 'Cancel this run' }).click()
  await first.getByText('Cancellation requested').waitFor()
  t3.finish(runId, 'interrupted')
  await first.getByText('Ended: interrupted').waitFor()
  await first.getByText('Partial work: wrote the registry').waitFor()
  assert.equal(await second.getByText('Queued in Pardner').count(), 1, 'cancellation holds queued work')
  await thread.getByText(/Cancellation of .* holds queued work/).first().waitFor()

  await first.getByLabel('Verdict evidence').fill('Partial output reviewed; not accepted')
  await first.getByRole('button', { name: 'Reject' }).click()
  await first.getByText('rejected by alice').waitFor()
  const verdicts = await first.locator('.verdicts').innerText()
  assert.match(verdicts, /Execution\s+interrupted/)
  assert.match(verdicts, /Independent check\s+Not recorded/)
  assert.match(verdicts, /Human acceptance\s+rejected by alice/)

  await thread.getByLabel('Review evidence').fill('Confirmed the interrupted run ended')
  await thread.getByRole('button', { name: 'Release held work' }).click()
  await second.getByText('Running', { exact: true }).waitFor()
  assert.equal(t3.sends.length, 2)
  assert.deepEqual(t3.interrupts.map(entry => entry.runId), [runId])
  await page.locator('summary').filter({ hasText: 'Register Cloud context' }).click()
  for (const [label, value] of Object.entries({ 'Cloud context ID': 'cloud-review', 'Cloud project ID': 'pardner', 'Cloud agent Actor': 'reviewer',
    'Cloud repository URL': 'https://github.com/depatchedmode/pardner', 'Cloud starting ref': 'main',
    'Cloud authorized task IDs (comma separated)': task.taskId, 'Cloud authorized sender Actors (comma separated)': 'alice' })) await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Register Cloud context', exact: true }).click()
  const cloud = page.getByRole('article', { name: 'Cloud context cloud-review', exact: true })
  await cloud.waitFor()
  await cloud.getByLabel('Cloud follow-up').fill('Review the immutable attempt')
  await cloud.getByRole('button', { name: 'Save Cloud intent' }).click()
  await cloud.getByText(/submissions: 0/).waitFor()
  await page.getByText(/Live dispatch disabled/).waitFor()
  await cloud.getByRole('button', { name: 'Cancel exact Cloud run' }).click()
  await cloud.getByText(/WITHDRAWN/).waitFor()
  await mkdir('output/verification/cloud-ui', { recursive: true })
  await cloud.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `output/verification/cloud-ui/${engine.name()}.png` })
  assert.deepEqual(errors, [])
})

for (const engine of [chromium, webkit]) it(`Cloud cancellation and immutable evidence gate are visible in ${engine.name()}`, { timeout: 90000 }, async t => {
  const { FakeCursorCloud } = await import('../support/fake-cursor-cloud.js')
  const transport = new FakeCursorCloud()
  const directory = await mkdtemp(join(tmpdir(), 'pardner-cloud-ui-'))
  const server = new AutomergeSyncServer({ directory, actors: ACTORS, env: {}, apiToken: 'fixture-cloud-token', httpPort: 0, wsPort: 0, logger: {},
    control: { pollMs: 150, cloud: { transport, dispatchEnabled: true } } })
  let browser
  t.after(async () => { await browser?.close(); await server.stop(); await rm(directory, { recursive: true, force: true }) })
  await server.start(); browser = await engine.launch({ headless: true })
  const api = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.httpPort}${path}`, { method: 'POST', headers: { Authorization: 'Bearer fixture-cloud-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).result
  }
  const task = await api('/automerge/operations', { operationId: randomUUID(), actorId: 'alice', type: 'task.create', payload: { title: 'Cloud fixture task' } })
  await api('/pardner/control/projects', { id: 'cloud-project', name: 'Cloud fixture' })
  await api('/pardner/control/cloud/contexts', { contextId: 'fixture', projectId: 'cloud-project', actorId: 'builder', repository: 'https://github.com/example/fixture', startingRef: 'main', allowedTaskIds: [task.taskId], allowedFromActorIds: ['alice'] })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpPort}/pardner/`)
  await page.getByLabel('Local service token').fill('fixture-cloud-token'); await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByLabel('Actor', { exact: true }).selectOption('alice'); await page.getByRole('button', { name: 'Control', exact: true }).click()
  const cloud = page.getByRole('article', { name: 'Cloud context fixture', exact: true })
  await cloud.getByLabel('Cloud follow-up').fill('Run fixture attempt A'); await cloud.getByRole('button', { name: 'Save Cloud intent' }).click()
  await cloud.getByText(/run-1/).waitFor()
  await cloud.getByLabel('Cloud follow-up').fill('Run fixture attempt B'); await cloud.getByRole('button', { name: 'Save Cloud intent' }).click()
  await cloud.getByText(/submissions: 0/).waitFor()
  await cloud.getByRole('button', { name: 'Cancel exact Cloud run' }).first().click()
  await cloud.getByText(/execution outcome: CANCELLED/).waitFor(); await cloud.getByText('partial output', { exact: true }).waitFor()
  await cloud.getByLabel('Full commit hash').fill('a'.repeat(40)); await cloud.getByLabel('Diff evidence').fill('fixture diff')
  await cloud.getByLabel('Test command and results').fill('fixture independent checker: passed')
  await cloud.getByRole('button', { name: 'Freeze attempt evidence' }).click(); await cloud.getByText(/Immutable evidence:/).waitFor()
  assert.equal(transport.submissions.length, 1, 'freeze does not release cancellation hold')
  await cloud.getByLabel('Cloud verdict evidence').fill('Simulated acceptance record; not real human approval')
  await cloud.getByRole('button', { name: 'Accept Cloud result' }).click(); await cloud.getByText(/human: accepted by alice/).waitFor()
  await mkdir('output/verification/cloud-ui', { recursive: true })
  await cloud.screenshot({ path: `output/verification/cloud-ui/${engine.name()}-active.png` })
  await cloud.getByLabel('Cloud hold review').fill('Fixture reviewed partial effects')
  await cloud.getByRole('button', { name: 'Release reviewed Cloud hold' }).click(); await cloud.getByText(/run-2/).waitFor()
  assert.equal(transport.submissions.length, 2); assert.deepEqual(transport.cancels.map(row => row.runId), ['run-1'])
  assert.deepEqual(errors, [])
})
