import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { generateMachineKey } from '../lib/machine-key.js'
import { RECORD_STORE_FILE, RecordStore } from '../lib/record-store.js'
import { testGenesis } from '../support/genesis.js'
import { forge, permutations, trustProject } from '../support/trust-records.js'

function fixture() {
  const p = trustProject(), member = generateMachineKey(), second = generateMachineKey()
  const memberId = p.person(member)
  const add = p.admit(p.owner, member)
  // Signed by the member's machine, so it can be stored only once the member's admission is.
  const pair = p.pair(member, second, memberId)
  return { ...p, member, memberId, second, add, pair }
}

test('the record store saves a batch whose records authorize each other, in any order, and keeps it across reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-record-store-'))
  const path = join(directory, RECORD_STORE_FILE)
  try {
    const f = fixture()
    for (const [index, batch] of [[f.pair, f.add, f.genesis], [f.genesis, f.add, f.pair]].entries()) {
      const store = new RecordStore(join(directory, `${index}.sqlite`), f.projectId)
      const { accepted, refused } = store.admit(batch)
      assert.deepEqual(refused, [])
      assert.equal(accepted.length, 3)
      assert.equal(store.membership().machines.length, 3)
      store.close()
    }
    let store = new RecordStore(path, f.projectId)
    store.admit([f.genesis, f.add])
    assert.deepEqual(store.admit([f.genesis, f.add]), { accepted: [], refused: [] }, 'stored records are not admitted twice')
    store.close()
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    store = new RecordStore(path, f.projectId)
    assert.deepEqual(store.get(f.add.recordId), f.add)
    assert.equal(store.genesis().recordId, f.genesis.recordId)
    store.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('the record store refuses unverifiable records and new records from a machine it already holds as removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-record-store-'))
  try {
    const f = fixture()
    const store = new RecordStore(join(directory, RECORD_STORE_FILE), f.projectId)
    const reasons = records => Object.fromEntries(store.admit(records).refused.map(({ record, reason }) => [record?.recordId ?? 'none', reason]))
    assert.deepEqual(reasons([f.add]), { [f.add.recordId]: 'Signer is not a machine certified in this project' }, 'nothing counts before the genesis')
    store.admit([f.genesis])
    const forged = { ...f.add, displayName: 'Forged' }
    const elsewhere = testGenesis()
    const promotion = f.role(f.member, f.memberId, 'admin')
    // A certification without its machine's consent is never stored, so no peer's store ever holds it.
    const unconsented = forge(f.owner, f.pair, { joinRequest: f.add.joinRequest })
    assert.deepEqual(reasons([forged, elsewhere, 'not a record', unconsented]), {
      [forged.recordId]: 'Invalid signature', [elsewhere.recordId]: 'Wrong project', none: 'Wrong project',
      [unconsented.recordId]: 'The certified machine did not consent to this certification',
    })
    store.admit([f.add])
    // Authority is computed from the store, not filtered into it: a member's promotion of themself is kept and grants nothing.
    assert.deepEqual(reasons([promotion]), {})
    assert.equal(store.membership().people.find(person => person.id === f.memberId).role, 'member')
    assert.ok(store.membership().rejected.some(entry => entry.recordId === promotion.recordId))
    const removal = f.remove(f.owner, f.memberId)
    store.admit([removal])
    assert.deepEqual(reasons([f.pair]), { [f.pair.recordId]: 'Signer was removed before this record arrived' })
    assert.equal(store.size, 4)
    store.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a log received at once keeps a removed admin’s earlier admissions in every order, and refuses that admin’s later records', () => {
  const p = trustProject(), admin = generateMachineKey(), member = generateMachineKey()
  const { genesis, projectId } = p
  const log = [genesis, p.admit(p.owner, admin, { role: 'admin' }), p.admit(admin, member), p.remove(p.owner, p.person(admin))]
  let expected
  for (const order of permutations(log)) {
    const store = new RecordStore(':memory:', projectId)
    assert.deepEqual(store.admit(order).refused, [])
    const { people, machines, removedPeople } = store.membership()
    expected ??= { people, machines, removedPeople }
    assert.deepEqual({ people, machines, removedPeople }, expected)
    store.close()
  }
  assert.deepEqual(expected.people.map(person => person.id).sort(), [p.person(member), p.ownerId].sort())
  assert.deepEqual(expected.removedPeople, [p.person(admin)])
  const store = new RecordStore(':memory:', projectId)
  store.admit(log)
  const late = p.admit(admin, generateMachineKey())
  assert.deepEqual(store.admit([late]).refused.map(entry => entry.reason), ['Signer was removed before this record arrived'])
  store.close()
})

test('the record store only grows and belongs to one project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-record-store-'))
  const path = join(directory, RECORD_STORE_FILE)
  try {
    const f = fixture()
    const store = new RecordStore(path, f.projectId)
    store.admit([f.genesis, f.add])
    store.close()
    const database = new DatabaseSync(path)
    assert.throws(() => database.exec('DELETE FROM records'), /only grow/)
    assert.throws(() => database.exec("UPDATE records SET record = '{}'"), /only grow/)
    database.close()
    assert.throws(() => new RecordStore(path, testGenesis().projectId), { code: 'WORKSPACE_MISMATCH' })
    const reopened = new RecordStore(path, f.projectId)
    assert.equal(reopened.size, 2)
    reopened.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
