import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as A from '@automerge/automerge'
import { deriveAll } from '../lib/change-log.js'
import { activityView } from '../lib/activity.js'
import { EXEMPT } from '../lib/operation-writes.js'
import { OPERATION_TYPES, prepareOperation } from '../lib/workspace-commands.js'
import { canonical, plain } from '../lib/workspace-schema.js'
import { storageValue } from '../lib/workspace-values.js'
import { ALICE, actorsOf, board, everyOperation, signedByActor } from '../support/activity-fixture.js'

// Rule: an operation entry's change writes exactly the side effects its event implies (lib/operation-writes.js).
// A write missing, an extra write, or a different value makes the entry "does not match what it did", in review,
// with both what it says and what its change wrote.

/** The side effects the real write path makes for `request` on `doc` (besides the event and its request record), recorded. */
function realWrites(doc, request, origin) {
  const prepared = prepareOperation(doc, request, origin)
  const state = plain(doc), writes = []
  const draft = new Proxy({}, { get: (_, map) => new Proxy(state[map] ??= {}, {
    set: (target, key, value) => { writes.push({ map, key, value: plain(value) }); target[key] = plain(value); return true },
  }) })
  prepared.change(draft)
  return { event: plain(prepared.event), writes: writes.filter(({ map }) => !['operations', 'operationRequests'].includes(map)) }
}

/** Writes `event` and `writes` as one change by Alice's machine, as a client that writes them itself would. */
function written(doc, event, writes) {
  const next = A.change(A.clone(doc, { actor: `${ALICE}${'0f'.repeat(8)}` }), draft => {
    draft.operations[event.operationId] = storageValue(event)
    draft.operationRequests[event.requestId] = storageValue(event.operationId)
    for (const { map, key, value } of writes) draft[map][key] = storageValue(value)
  })
  return { doc: next, hash: A.getHeads(next)[0] }
}

/** A different value of the same kind, so only the value differs. */
function altered(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'value')) return { ...value, value: altered(value.value) }
  if (value && typeof value === 'object' && !Array.isArray(value)) { const [key] = Object.keys(value); return { ...value, [key]: altered(value[key]) } }
  if (Array.isArray(value)) return [...value, 'altered']
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') return value + 1
  if (value === null) return 'altered'
  return `${value} (altered)`
}

const entryOf = (doc, hash) => activityView({ entries: deriveAll(doc).values(), stateOf: signedByActor(doc), actorsOf }).find(entry => entry.changes.some(change => change.hash === hash))

/**
 * Every operation type, on the state before it ran in the fixture: its request, origin and that state. Requests
 * replayed in order give each one the state it needs (lib/workspace-commands.js decides; this only records).
 */
function everyRequest() {
  const { doc, written: steps } = everyOperation()
  const metas = A.getChangesMetaSince(doc, [])
  return steps.map(({ hash, event }) => {
    const before = A.view(doc, metas.find(meta => meta.hash === hash).deps)
    return { before: A.clone(before), request: { operationId: event.requestId, actorId: event.actorId, type: event.type, payload: event.payload },
      origin: { replicaId: event.replicaId, timestamp: event.timestamp } }
  })
}

test('each operation type’s writes, written by a client as the real write path makes them, match its entry exactly', () => {
  const requests = everyRequest()
  assert.deepEqual([...new Set(requests.map(({ request }) => request.type))].sort(), [...OPERATION_TYPES].sort())
  for (const { before, request, origin } of requests) {
    const { event, writes } = realWrites(before, request, origin)
    const { doc, hash } = written(before, event, writes)
    const entry = entryOf(doc, hash)
    assert.equal(entry.kind, 'operation', request.type)
    assert.equal(entry.flags.mismatch, undefined, `${request.type}: ${JSON.stringify(entry.changes[0].mismatch)}`)
  }
})

test('each operation type’s writes altered one at a time, left out one at a time, or joined by an extra write, make its entry not match what it did', () => {
  let variants = 0
  for (const { before, request, origin } of everyRequest()) {
    const { event, writes } = realWrites(before, request, origin)
    const cases = [
      ...writes.map((write, index) => ({ label: `${write.map} ${write.key} altered`, writes: writes.map((other, at) => (at === index ? { ...other, value: altered(other.value) } : other)), expect: { issue: 'differs', map: write.map, key: write.key } })),
      ...writes.map((write, index) => ({ label: `${write.map} ${write.key} left out`, writes: writes.filter((_, at) => at !== index), expect: { issue: 'missing', map: write.map, key: write.key } })),
      { label: 'an extra comment text', writes: [...writes, { map: 'commentBodies', key: 'comment-extra', value: { value: 'Extra words' } }], expect: { issue: 'extra', map: 'commentBodies', key: 'comment-extra' } },
    ]
    // Retiring the link's or the merged branch status's alternatives depends on the board then (exempt): any number of
    // such keys may be written, each true, so leaving one out is not detected, and a false one is an extra write.
    const retirement = key => (event.type === 'task.merge' && key.startsWith(`${event.payload.branchId}:status:`))
      || (event.type === 'task.link-vein' && key.startsWith(`${event.payload.taskId}:${event.payload.veinId}:`))
    for (const { label, writes: variant, expect } of cases) {
      // A mention the board already holds may be left out by an edit; branch bases likewise (exempt).
      if (expect.issue === 'missing' && ['mentions', 'branchBases'].includes(expect.map) && Object.hasOwn(before[expect.map] ?? {}, expect.key)) continue
      if (expect.map === 'supersededRevisions' && retirement(expect.key)) {
        if (expect.issue === 'missing') continue
        expect.issue = 'extra'
      }
      const { doc, hash } = written(before, event, variant)
      const entry = entryOf(doc, hash)
      assert.equal(entry.flags.mismatch, true, `${request.type}: ${label} is not reported`)
      assert.equal(entry.review, true)
      const found = entry.changes[0].mismatch.find(item => Object.entries(expect).every(([field, value]) => item[field] === value))
      assert.ok(found, `${request.type}: ${label} is not listed: ${JSON.stringify(entry.changes[0].mismatch)}`)
      assert.ok(found.text.length > 20, 'and is said in words')
      if (expect.issue === 'differs') assert.notEqual(canonical(found.claimed), canonical(found.wrote))
      variants++
    }
  }
  assert.ok(variants > 150, `only ${variants} variants were checked`)
})

test('the exempt fields are few, each said with why', () => {
  assert.ok(EXEMPT.length <= 10)
  for (const line of EXEMPT) assert.match(line, /:/)
})
