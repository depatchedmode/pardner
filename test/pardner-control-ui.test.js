import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit } from 'playwright'
import { withClientWorkspace } from '../support/client-workspace.js'
import { FakeT3 } from '../support/fake-t3-server.js'

const AGENTS = [{ id: 'builder', kind: 'agent' }, { id: 'reviewer', kind: 'agent' }]

for (const engine of [chromium, webkit]) it(`shows stale reads, approval blocks, held follow-ups, cancellation output and separate verdicts in ${engine.name()}`, { timeout: 90000 }, async t => {
  const t3 = await new FakeT3().start()
  t.after(() => t3.stop().catch(() => {}))
  t3.thread('thread-ui', { title: 'Pardner control thread' })
  await withClientWorkspace(engine, { actors: AGENTS, runtimeOptions: { control: { pollMs: 150, staleAfterMs: 1500 } } }, async ({ page, open, operate, actorId }) => {
    const { result: task } = await operate('task.create', { title: 'Build the control pane' })
    await open()

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
    await page.getByRole('checkbox', { name: 'Alice', exact: true }).check()
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
    await first.getByText('rejected by Alice').waitFor()
    const verdicts = await first.locator('.verdicts').innerText()
    assert.match(verdicts, /Execution\s+interrupted/)
    assert.match(verdicts, /Independent check\s+Not recorded/)
    assert.match(verdicts, /Human acceptance\s+rejected by Alice/)

    await thread.getByLabel('Review evidence').fill('Confirmed the interrupted run ended')
    await thread.getByRole('button', { name: 'Release held work' }).click()
    await second.getByText('Running', { exact: true }).waitFor()
    assert.equal(t3.sends.length, 2)
    assert.deepEqual(t3.interrupts.map(entry => entry.runId), [runId])
    await page.locator('summary').filter({ hasText: 'Register Cloud context' }).click()
    for (const [label, value] of Object.entries({ 'Cloud context ID': 'cloud-review', 'Cloud project ID': 'pardner', 'Cloud agent Actor': 'reviewer',
      'Cloud repository URL': 'https://github.com/depatchedmode/pardner', 'Cloud starting ref': 'main',
      'Cloud authorized task IDs (comma separated)': task.taskId, 'Cloud authorized sender Actors (comma separated)': actorId })) await page.getByLabel(label, { exact: true }).fill(value)
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
  })
})

for (const engine of [chromium, webkit]) it(`Cloud cancellation and immutable evidence gate are visible in ${engine.name()}`, { timeout: 90000 }, async () => {
  // The project runtime is a child process, so it builds the fake Cloud transport from this module.
  const cloud = { transportModule: new URL('../support/fake-cursor-cloud.js', import.meta.url).href, dispatchEnabled: true }
  await withClientWorkspace(engine, { actors: AGENTS, runtimeOptions: { control: { pollMs: 150, cloud } } }, async ({ page, open, operate, call, project, actorId }) => {
    const control = (path, body) => call(`/projects/${project.id}/api/pardner/control${path}`, body)
    const { result: task } = await operate('task.create', { title: 'Cloud fixture task' })
    await control('/projects', { id: 'cloud-project', name: 'Cloud fixture' })
    await control('/cloud/contexts', { contextId: 'fixture', projectId: 'cloud-project', actorId: 'builder', repository: 'https://github.com/example/fixture', startingRef: 'main', allowedTaskIds: [task.taskId], allowedFromActorIds: [actorId] })
    await open()
    await page.getByRole('button', { name: 'Control', exact: true }).click()
    const context = page.getByRole('article', { name: 'Cloud context fixture', exact: true })
    const attempt = name => context.getByRole('region', { name: `Cloud execution ${name}`, exact: true })
    await context.getByLabel('Cloud follow-up').fill('Run fixture attempt A'); await context.getByRole('button', { name: 'Save Cloud intent' }).click()
    await context.getByText(/run-1/).waitFor()
    await context.getByLabel('Cloud follow-up').fill('Run fixture attempt B'); await context.getByRole('button', { name: 'Save Cloud intent' }).click()
    await context.getByText(/submissions: 0/).waitFor()
    await context.getByRole('button', { name: 'Cancel exact Cloud run' }).first().click()
    await context.getByText(/execution outcome: CANCELLED/).waitFor(); await context.getByText('partial output', { exact: true }).waitFor()
    await context.getByLabel('Full commit hash').fill('a'.repeat(40)); await context.getByLabel('Diff evidence').fill('fixture diff')
    await context.getByLabel('Test command and results').fill('fixture independent checker: passed')
    await context.getByRole('button', { name: 'Freeze attempt evidence' }).click(); await context.getByText(/Immutable evidence:/).waitFor()
    const { cloud: { executions } } = await control('')
    const [first, second] = executions.sort((a, b) => a.runId === 'run-1' ? -1 : b.runId === 'run-1' ? 1 : 0)
    assert.equal(first.runId, 'run-1')
    assert.equal(second.submissions, 0, 'freeze does not release cancellation hold')
    await attempt(second.executionId).getByText(/submissions: 0/).waitFor()
    await context.getByLabel('Cloud verdict evidence').fill('Simulated acceptance record; not real human approval')
    await context.getByRole('button', { name: 'Accept Cloud result' }).click(); await context.getByText(`human: accepted by ${actorId}`, { exact: false }).waitFor()
    await mkdir('output/verification/cloud-ui', { recursive: true })
    await context.screenshot({ path: `output/verification/cloud-ui/${engine.name()}-active.png` })
    await context.getByLabel('Cloud hold review').fill('Fixture reviewed partial effects')
    await context.getByRole('button', { name: 'Release reviewed Cloud hold' }).click(); await context.getByText(/run-2/).waitFor()
    const settled = (await control('')).cloud.executions
    assert.equal(settled.find(row => row.executionId === second.executionId).runId, 'run-2')
    assert.equal(settled.find(row => row.executionId === first.executionId).outcome, 'CANCELLED')
  })
})
