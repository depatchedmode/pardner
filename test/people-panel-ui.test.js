import { it } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { withClientReplicas } from '../support/client-workspace.js'

// The People panel (#198) and the removed state (#154) on real clients, in Chromium and WebKit. The first human
// hosts the project; the others are replicas that joined through approved invitations.

const PHONE = { viewport: { width: 390, height: 844 } }

async function openPanel(page) {
  await page.getByRole('button', { name: /^People/ }).click()
  const panel = page.getByRole('dialog', { name: 'People', exact: true })
  await panel.getByRole('heading', { name: /^Members/ }).waitFor({ timeout: 30000 })
  return panel
}
/** One person's entry in the panel's member list, found by the name in its heading. */
const member = (panel, name) => panel.locator('.member-list > li')
  .filter({ has: panel.page().getByRole('heading', { level: 4, name: new RegExp(`^${name}( \\(you\\))?$`) }) })

for (const engine of [chromium, webkit]) it(`shows each role what it may do, changes a role, and removes a machine and a person in ${engine.name()}`,
  { timeout: 300000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', { name: 'Bob', role: 'admin' }, 'Carol', { name: 'Alice', device: true }] }, async ({ people, newPage, eventually }) => {
      const [alice, bob, carol] = people
      const alicePage = await newPage(), bobPage = await newPage(), carolPage = await newPage(PHONE)
      await alice.open(alicePage); await bob.open(bobPage); await carol.open(carolPage)

      // The owner: counts in the heading, every control on others, and no way to leave.
      const owner = await openPanel(alicePage)
      await owner.getByText(/^Shared board · 3 people · 4 machines · \d agents?$/).waitFor({ timeout: 30000 })
      await owner.getByRole('button', { name: 'Invite someone' }).waitFor()
      await member(owner, 'Alice').getByText('Started the project').waitFor()
      await member(owner, 'Bob').getByText('Let in by Alice').waitFor()
      for (const name of ['Bob', 'Carol']) {
        await member(owner, name).getByRole('button', { name: `Remove ${name}`, exact: true }).waitFor()
        await member(owner, name).getByRole('button', { name: `Pair a machine for ${name}` }).waitFor()
      }
      await member(owner, 'Bob').getByRole('button', { name: 'Make member' }).waitFor()
      await member(owner, 'Carol').getByRole('button', { name: 'Make admin' }).waitFor()
      await owner.getByText('As the owner, you can’t leave.', { exact: false }).waitFor()
      assert.equal(await owner.getByRole('button', { name: 'Leave project' }).count(), 0)
      // Alice's two machines share a name; the short ID tells them apart, and only the other one can be removed here.
      const aliceMachines = member(owner, 'Alice').getByRole('list', { name: 'Alice’s machines' }).getByRole('listitem')
      assert.equal(await aliceMachines.count(), 2)
      const hub = aliceMachines.filter({ hasText: 'This machine' })
      assert.equal(await hub.getByText('Hosts the project', { exact: true }).count(), 1)
      await hub.getByText('Hosts the project, so it can’t be removed.').waitFor()
      assert.equal(await owner.getByText(/ID [a-z2-7]{6}/).count() >= 4, true)

      // The admin: lets members in and out, but has no controls on the owner and can't change roles.
      const admin = await openPanel(bobPage)
      await admin.getByRole('button', { name: 'Invite someone' }).waitFor()
      await member(admin, 'Alice').getByText('Only the owner manages the owner’s machines. The owner can’t be removed.').waitFor()
      assert.equal(await member(admin, 'Alice').getByRole('button').count(), 0)
      await member(admin, 'Carol').getByRole('button', { name: 'Remove Carol', exact: true }).waitFor()
      assert.equal(await member(admin, 'Carol').getByRole('button', { name: /^Make / }).count(), 0, 'only the owner changes roles')
      await admin.getByRole('button', { name: 'Leave project' }).waitFor()

      // The member, at phone width: pairs and edits only their own entry, and is told why they can't let people in.
      const plain = await openPanel(carolPage)
      await plain.getByText('Only the owner or an admin can let people in. You can pair your own machines.').waitFor()
      assert.equal(await plain.getByRole('button', { name: 'Invite someone' }).count(), 0)
      for (const name of ['Alice', 'Bob']) assert.equal(await member(plain, name).getByRole('button', { name: /^(Remove|Pair|Make)/ }).count(), 0)
      await member(plain, 'Carol').getByRole('button', { name: 'Pair another machine' }).waitFor()
      await member(plain, 'Carol').getByRole('button', { name: 'Edit name and email' }).waitFor()
      await plain.getByRole('button', { name: 'Leave project' }).waitFor()
      assert.ok(await carolPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling at phone width')
      await plain.getByRole('button', { name: 'Close' }).click()

      // A role change states its consequences first; Cancel has the focus.
      await member(owner, 'Carol').getByRole('button', { name: 'Make admin' }).click()
      const promote = alicePage.getByRole('dialog', { name: 'Make Carol an admin?' })
      await promote.getByText('Carol will be able to let people in and remove members.').waitFor()
      assert.equal(await promote.getByRole('button', { name: 'Cancel' }).evaluate(element => element === document.activeElement), true)
      await promote.getByRole('button', { name: 'Make admin' }).click()
      await member(owner, 'Carol').locator('.role-badge', { hasText: 'Admin' }).waitFor({ timeout: 30000 })

      // Removing a machine, using the keyboard.
      const other = aliceMachines.filter({ hasNotText: 'This machine' })
      await other.getByRole('button', { name: /^Remove / }).focus()
      await alicePage.keyboard.press('Enter')
      const machineConfirm = alicePage.getByRole('dialog', { name: /^Remove Alice’s laptop\?$/ })
      await machineConfirm.getByText('To use that computer again, pair it as a new machine from a fresh client directory.').waitFor()
      // WebKit, like Safari, doesn't move Tab focus onto buttons by default, so focus the confirming button directly.
      await machineConfirm.getByRole('button', { name: 'Remove machine' }).focus()
      await alicePage.keyboard.press('Enter')
      const removed = owner.getByRole('region', { name: /^Removed/ })
      await removed.getByRole('listitem', { name: 'Alice’s laptop (Alice’s machine), removed' }).getByText(/^Removed by Alice\./).waitFor({ timeout: 30000 })
      assert.equal(await aliceMachines.count(), 1)

      // Removing a person says what loses access, what stays, and how they could come back.
      await member(owner, 'Carol').getByRole('button', { name: 'Remove Carol', exact: true }).click()
      const confirm = alicePage.getByRole('dialog', { name: 'Remove Carol from “Shared board”?' })
      for (const text of ['stop syncing and lose access right away', 'Carol’s past work stays in the project under their name.',
        'People Carol let in stay in the project.', 'To come back, Carol needs a new invitation, used from a fresh client directory.']) {
        await confirm.getByText(text, { exact: false }).waitFor()
      }
      await confirm.getByRole('button', { name: 'Remove Carol', exact: true }).click()
      await removed.getByRole('listitem', { name: 'Carol, removed' }).getByText('Was an admin · Removed by Alice', { exact: false }).waitFor({ timeout: 30000 })
      await owner.getByText(/^Shared board · 2 people · 2 machines · \d agents? · 2 removed$/).waitFor()
      // Carol's own board says she was removed, and by whom; it never says she is signed out (#154).
      const heading = carolPage.getByRole('heading', { name: 'You were removed from “Shared board”' })
      await heading.waitFor({ timeout: 45000 })
      await carolPage.getByText('Alice removed you.').waitFor()
      await carolPage.getByText('Ask the owner or an admin for a new invitation.', { exact: false }).waitFor()
      assert.equal(await carolPage.getByText('isn’t signed in', { exact: false }).count(), 0)
      await carolPage.reload()
      await heading.waitFor({ timeout: 30000 })
      await carolPage.getByRole('button', { name: 'Project: Shared board. Switch project' }).click()
      await carolPage.getByRole('menuitemradio', { name: /^Shared board\s*Removed · no longer syncs$/ }).waitFor()
      // Bob's board, an admin, stops listing Carol among the people here.
      await eventually(async () => await bobPage.getByRole('group', { name: 'People in this project' }).getByRole('button', { name: /^Carol, / }).count() === 0,
        'Carol stayed in Bob’s header after her removal', 45000)
    })
  })

for (const engine of [chromium, webkit]) it(`approves a join and pairs a machine with the code, keeps invitation history, renames and leaves in ${engine.name()}`,
  { timeout: 300000 }, async () => {
    await withClientReplicas(engine, { humans: ['Alice', 'Bob'] }, async ({ people, newPage, newcomer, eventually, project }) => {
      const [alice, bob] = people
      const alicePage = await newPage(), bobPage = await newPage(PHONE)
      await alice.open(alicePage); await bob.open(bobPage)

      // The owner of a one-machine project is nudged on the board; dismissed there, it stays in the panel until done.
      const nudge = alicePage.getByRole('status', { name: 'Pair a second machine' })
      await nudge.getByText('If you lose every machine you own, nobody can remove or demote an admin any more', { exact: false }).waitFor({ timeout: 30000 })
      await nudge.getByRole('button', { name: 'Not now' }).click()
      await nudge.waitFor({ state: 'detached' })
      const panel = await openPanel(alicePage)
      const panelNudge = panel.getByRole('note', { name: 'Pair a second machine' })
      await panelNudge.waitFor()

      // Pairing: the new machine waits, both screens show one code, and Alice approves it from the panel.
      await panelNudge.getByRole('button', { name: 'Pair a machine' }).click()
      const pairing = alicePage.getByRole('dialog', { name: 'Pair one of your machines' })
      await pairing.getByRole('button', { name: 'Create invitation' }).click()
      await pairing.getByRole('button', { name: 'Show invite text' }).click()
      const deviceInvitation = await pairing.getByLabel('Invite text').inputValue()
      await pairing.getByRole('button', { name: 'Close' }).click()
      const desk = await newcomer('Alice desk', { identity: false })
      const deskJoin = { invitation: deviceInvitation, operationId: 'pair' }
      await desk.call('/join', deskJoin)
      const pairRequest = panel.getByRole('listitem', { name: 'A new machine wants to join as Alice' })
      const pairCode = (await pairRequest.locator('.confirmation-code').filter({ hasText: /^\d{4} \d{4}$/ }).textContent({ timeout: 30000 })).trim()
      await eventually(async () => (await desk.call('/join', deskJoin)).join?.code === pairCode, 'the new machine never showed the same code')
      await pairRequest.getByRole('button', { name: `Approve Alice, code ${pairCode}` }).click()
      await eventually(async () => Boolean((await desk.call('/join', deskJoin)).project), 'the paired machine never finished joining')
      await member(panel, 'Alice').getByRole('list', { name: 'Alice’s machines' }).getByRole('listitem').nth(1).waitFor({ timeout: 30000 })
      await panelNudge.waitFor({ state: 'detached', timeout: 30000 })

      // A new person: invited from the panel, approved with the code both screens show.
      await panel.getByRole('button', { name: 'Invite someone' }).click()
      const inviting = alicePage.getByRole('dialog', { name: 'Invite a person' })
      await inviting.getByRole('button', { name: 'Create invitation' }).click()
      await inviting.getByRole('button', { name: 'Show invite text' }).click()
      const invitation = await inviting.getByLabel('Invite text').inputValue()
      await inviting.getByRole('button', { name: 'Close' }).click()
      const dana = await newcomer('Dana')
      const danaJoin = { invitation, operationId: 'join' }
      await dana.call('/join', danaJoin)
      const request = panel.getByRole('listitem', { name: 'Dana wants to join as a member' })
      const code = (await request.locator('.confirmation-code').filter({ hasText: /^\d{4} \d{4}$/ }).textContent({ timeout: 30000 })).trim()
      await eventually(async () => (await dana.call('/join', danaJoin)).join?.code === code, 'Dana never showed the same code')
      await request.getByRole('button', { name: `Approve Dana, code ${code}` }).click()
      await panel.getByText('No one is waiting to join.').waitFor({ timeout: 30000 })
      await eventually(async () => Boolean((await dana.call('/join', danaJoin)).project), 'Dana never finished joining')
      await member(panel, 'Dana').getByText('Let in by Alice').waitFor({ timeout: 30000 })

      // Invitation history: who issued each and who used it, newest first, and revoking from the list.
      const history = panel.getByRole('region', { name: 'Invitations' })
      await history.getByRole('listitem', { name: /^Person invitation, Used, Issued by Alice/ }).getByText(/Used by Dana/).waitFor({ timeout: 30000 })
      await history.getByRole('listitem', { name: /^Machine for Alice invitation, Used|^Machine invitation, Used/ }).first().waitFor()
      const spare = await alice.call(`/projects/${project.id}/invites`, { purpose: 'human', operationId: 'spare' })
      const spareRow = history.getByRole('listitem', { name: /^Person invitation, Waiting to be used, Issued by Alice/ })
      await spareRow.waitFor({ timeout: 30000 })
      assert.equal(await history.getByRole('listitem').first().getAttribute('aria-label') === await spareRow.getAttribute('aria-label'), true, 'the newest is first')
      await spareRow.getByRole('button', { name: /^Revoke Person invitation/ }).click()
      await history.getByRole('listitem', { name: /^Person invitation, Revoked/ }).getByText(/Revoked by Alice/).waitFor({ timeout: 30000 })
      const states = await alice.call(`/projects/${project.id}/invites`)
      assert.equal(states.invites.find(entry => entry.id === spare.invite.id).state, 'revoked')

      // Bob renames himself from his phone; Alice's board shows the new name. Agent names stay as given.
      const bobPanel = await openPanel(bobPage)
      await member(bobPanel, 'Bob').getByRole('button', { name: 'Edit name and email' }).click()
      const form = bobPanel.getByRole('form', { name: 'Your name and email' })
      await form.getByText('Your agents keep the names they were given', { exact: false }).waitFor()
      await form.getByLabel('Name').fill('Robert')
      await form.getByRole('button', { name: 'Save' }).click()
      await member(bobPanel, 'Robert').waitFor({ timeout: 30000 })
      await alicePage.getByRole('group', { name: 'People in this project' }).getByRole('button', { name: /^Robert, human, / }).waitFor({ timeout: 45000 })
      await member(panel, 'Robert').waitFor({ timeout: 30000 })

      // Bob leaves; his board says so, and Alice's panel lists him as having left.
      await bobPanel.getByRole('button', { name: 'Leave project' }).click()
      const leaving = bobPage.getByRole('dialog', { name: 'Leave “Shared board”?' })
      await leaving.getByText('Your past work stays in the project under your name.').waitFor()
      await leaving.getByRole('button', { name: 'Leave project' }).click()
      await bobPage.getByRole('heading', { name: 'You left “Shared board”' }).waitFor({ timeout: 30000 })
      await bobPage.getByText('You chose to leave this project.').waitFor()
      assert.ok(await bobPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling at phone width')
      await panel.getByRole('region', { name: /^Removed/ }).getByRole('listitem', { name: 'Robert, left' }).getByText(/Left the project/).waitFor({ timeout: 30000 })
    })
  })
