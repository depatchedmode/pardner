import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { generateMachineKey } from '../lib/machine-key.js'
import { buildRecord } from '../lib/membership.js'
import { RECORD_STORE_FILE, RecordStore } from '../lib/record-store.js'
import { testGenesis } from '../support/genesis.js'

function fixture() {
  const owner = generateMachineKey(), member = generateMachineKey(), second = generateMachineKey()
  const genesis = testGenesis(owner), projectId = genesis.projectId
  const add = buildRecord(owner, { projectId, kind: 'member.add', subject: 'member', displayName: 'Member', role: 'member',
    machineId: member.machineId, publicKey: member.publicKey, offer: {}, joinRequest: {}, approval: {} })
  // Signed by the member's machine, so it can be stored only once the member's admission is.
  const pair = buildRecord(member, { projectId, kind: 'machine.add', subject: second.machineId, personId: 'member', publicKey: second.publicKey, approval: {} })
  return { owner, member, genesis, projectId, add, pair }
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

test('the record store refuses records it cannot verify or that their signer may not make now', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-record-store-'))
  try {
    const f = fixture()
    const store = new RecordStore(join(directory, RECORD_STORE_FILE), f.projectId)
    const reasons = records => Object.fromEntries(store.admit(records).refused.map(({ record, reason }) => [record?.recordId ?? 'none', reason]))
    assert.deepEqual(reasons([f.add]), { [f.add.recordId]: 'Signer is not a member machine of this project' }, 'nothing counts before the genesis')
    store.admit([f.genesis])
    const forged = { ...f.add, displayName: 'Forged' }
    const elsewhere = testGenesis()
    const promotion = buildRecord(f.member, { projectId: f.projectId, kind: 'member.role', subject: 'member', role: 'admin', replaces: null })
    assert.deepEqual(reasons([forged, elsewhere, 'not a record']), {
      [forged.recordId]: 'Invalid signature', [elsewhere.recordId]: 'Wrong project', none: 'Wrong project',
    })
    store.admit([f.add])
    assert.deepEqual(reasons([promotion]), { [promotion.recordId]: 'Signer may not make this record in the current membership' })
    const removal = buildRecord(f.owner, { projectId: f.projectId, kind: 'member.remove', subject: 'member' })
    store.admit([removal])
    assert.deepEqual(reasons([f.pair]), { [f.pair.recordId]: 'Signer is not a member machine of this project' }, 'a removed signer is refused from arrival')
    assert.equal(store.size, 3)
    store.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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
