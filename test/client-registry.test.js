import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientRegistry } from '../lib/client-registry.js'
import { actorId } from '../lib/client-identity.js'

test('private registry serializes concurrent setup, resumes intent, and rejects changed retries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-registry-'))
  let registry
  try {
    registry = await ClientRegistry.open(directory)
    await assert.rejects(ClientRegistry.open(directory), { code: 'STORAGE_IN_USE' })
    const initial = registry.read()
    let runs = 0
    const action = async attempt => { runs++; await new Promise(r => setTimeout(r, 10)); return { id: attempt.id } }
    const results = await Promise.all([registry.attempt('create', 'same', { name: 'one' }, action), registry.attempt('create', 'same', { name: 'one' }, action)])
    assert.equal(runs, 1); assert.deepEqual(results[0], results[1])
    await assert.rejects(registry.attempt('create', 'same', { name: 'two' }, action), { code: 'OPERATION_ID_REUSED' })
    let interruptedId
    await assert.rejects(registry.attempt('join', 'interrupted', {}, async (attempt, checkpoint) => { interruptedId = attempt.id; checkpoint({ phase: 'enrolled', receipt: { id: 'receipt' } }); throw new Error('response lost') }), /response lost/)
    registry.close(); registry = await ClientRegistry.open(directory)
    assert.equal(registry.read().device.id, initial.device.id)
    await registry.attempt('join', 'interrupted', {}, async attempt => { assert.equal(attempt.id, interruptedId); assert.equal(attempt.receipt.id, 'receipt'); return true })
    assert.equal((await stat(join(directory, 'client.sqlite'))).mode & 0o777, 0o600)
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
  } finally { registry?.close(); await rm(directory, { recursive: true, force: true }) }
})

test('Actor identity groups by human and harness, never model or device', () => {
  assert.equal(actorId('human-a', 'openai-codex'), actorId('human-a', 'openai-codex'))
  assert.notEqual(actorId('human-a', 'openai-codex'), actorId('human-a', 'anthropic-claude-code'))
  assert.notEqual(actorId('human-a', 'openai-codex'), actorId('human-b', 'openai-codex'))
  assert.notEqual(actorId('human-a'), actorId('human-a', 'openai-codex'))
})
