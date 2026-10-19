import { it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { BridgeInbox } from '../lib/bridge-inbox.js'
import { digest } from '../lib/workspace-schema.js'
import { AgentBridge } from '../lib/agent-bridge.js'

const mapping = { actorId: 'builder', enabled: true, adapter: 'codex-app-server', sessionOwner: 'bridge',
  endpoint: 'ws://127.0.0.1:9001/', threadId: 'thread-one', worktree: '/tmp', allowedTaskIds: ['task-one'], allowedFromActorIds: ['alice'] }
const mention = { id: 'mention-one', taskId: 'task-one', commentId: 'comment-one', fromActorId: 'alice', toActorId: 'builder', idempotency_key: 'effect-one', operationId: 'revision-one', commentDigest: digest('Authorized request') }

class Harness extends EventEmitter {
  constructor() { super(); this.calls = []; this.state = 'ready'; this.accepted = new Map() }
  async availability() { return this.state }
  async dispatch(_mapping, prompt) {
    this.calls.push(prompt)
    this.accepted.set(prompt, `turn-${this.calls.length}`)
    if (this.loseResponse) throw new Error('Lost response after acceptance')
    this.state = 'busy'
    return this.accepted.get(prompt)
  }
  async reconcile(_mapping, prompt) { return this.accepted.get(prompt) ?? null }
  close() {}
}

class Source extends EventEmitter {
  constructor(inbox) { super(); this.inbox = inbox; this.mentions = []; this.acks = []; this.claimIds = []; this.claims = new Map() }
  async verify() { if (this.wrongReplica) throw Object.assign(new Error('Wrong replica'), { code: 'WORKSPACE_MISMATCH' }) }
  async watch() {}
  async pending() { if (this.hubOffline) throw Object.assign(new Error('Offline'), { code: 'HUB_UNAVAILABLE' }); return { mentions: this.mentions } }
  async claim(_actor, requestId) {
    this.claimIds.push(requestId)
    if (!this.claims.has(requestId)) this.claims.set(requestId, { claimed: true, mention: this.mentions[0], claimToken: 'token' })
    if (this.loseClaimOnce) { this.loseClaimOnce = false; throw new Error('Lost claim response') }
    return this.claims.get(requestId)
  }
  async ack(_actor, receipt) {
    assert.ok(this.inbox.rows().some(row => row.id === receipt.mention.id), 'durable inbox must precede hub ack')
    this.acks.push(receipt.mention.id)
    if (this.failAck) throw new Error('Ack unavailable')
    this.mentions = this.mentions.filter(item => item.id !== receipt.mention.id)
  }
  async actors() { return { actors: { builder: { id: 'builder', handle: 'builder', kind: 'agent' }, alice: { id: 'alice', handle: 'alice', kind: 'human' } } } }
  async context(received) { return { task: { title: 'Bounded work' }, mentions: this.contextMissing ? [] : [received], comments: [{ id: received.commentId, content: 'Authorized request', revisionId: received.operationId, editedBy: received.fromActorId, conflicts: [] }] } }
  close() {}
}

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'pardner-bridge-'))
  const identity = { workspaceId: 'workspace', replicaId: 'replica' }
  const path = join(directory, 'inbox.sqlite')
  let inbox = new BridgeInbox(path, identity)
  const source = new Source(inbox), harness = new Harness()
  const config = { ...identity, dataDirectory: directory, mappings: [structuredClone(mapping)] }
  let bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => harness })
  const state = { source, harness, config, get inbox() { return inbox }, get bridge() { return bridge },
    restart: async () => {
      await bridge.stop(); inbox.close()
      inbox = new BridgeInbox(path, identity); source.inbox = inbox
      bridge = new AgentBridge({ config, inbox, source, adapterFactory: () => harness })
      inbox.recover()
    } }
  try { await run(state) } finally { await bridge.stop(); inbox.close(); await rm(directory, { recursive: true, force: true }) }
}

it('an idle hour performs zero harness requests; a delivery is persisted before ack and dispatched promptly', () => fixture(async state => {
  let availabilityCalls = 0
  const original = state.harness.availability.bind(state.harness)
  state.harness.availability = () => { availabilityCalls++; return original() }
  // One deterministic catch-up tick per second, with no real-time hour or model inference.
  for (let second = 0; second < 3600; second++) await state.bridge.wake()
  assert.equal(availabilityCalls, 0)
  assert.equal(state.harness.calls.length, 0)
  state.source.mentions.push(mention)
  const start = performance.now()
  await state.bridge.wake()
  assert.ok(performance.now() - start < 2000)
  assert.equal(state.inbox.rows()[0].state, 'accepted')
  assert.equal(state.harness.calls.length, 1)
  assert.deepEqual(state.source.acks, [mention.id])
}))

it('busy sessions retain queued work across restart, and duplicate notifications and claims do not redispatch', () => fixture(async state => {
  state.harness.state = 'busy'; state.source.mentions.push(mention)
  await state.bridge.wake()
  assert.equal(state.inbox.rows()[0].state, 'queued')
  assert.equal(state.inbox.rows()[0].reason, 'busy')
  await state.restart()
  state.source.mentions.push(mention)
  state.harness.state = 'ready'
  await Promise.all(Array.from({ length: 20 }, () => state.bridge.wake()))
  assert.equal(state.harness.calls.length, 1)
  assert.equal(state.inbox.rows().length, 1)
  await state.restart(); await state.bridge.wake()
  assert.equal(state.harness.calls.length, 1)
}))

it('lost claim replies reuse the durable request ID across restart', () => fixture(async state => {
  state.source.mentions.push(mention); state.source.loseClaimOnce = true
  await state.bridge.wake()
  assert.equal(state.harness.calls.length, 0)
  await state.restart(); await state.bridge.wake()
  assert.equal(state.source.claimIds.length, 2)
  assert.equal(state.source.claimIds[0], state.source.claimIds[1])
  assert.equal(state.harness.calls.length, 1)
}))

it('ack failures preserve durable work and can be recovered without another accepted turn', () => fixture(async state => {
  state.source.mentions.push(mention); state.source.failAck = true
  await state.bridge.wake()
  assert.equal(state.inbox.rows()[0].state, 'accepted')
  await state.restart(); state.source.failAck = false; await state.bridge.wake()
  assert.equal(state.harness.calls.length, 1)
  assert.equal(state.inbox.hasClaim('builder'), false)
}))

it('lost dispatch replies reconcile to the existing turn, including after restart', () => fixture(async state => {
  state.source.mentions.push(mention); state.harness.loseResponse = true
  await state.bridge.wake()
  assert.equal(state.inbox.rows()[0].state, 'uncertain')
  await state.restart(); await state.bridge.wake()
  assert.equal(state.inbox.rows()[0].state, 'accepted')
  assert.equal(state.inbox.rows()[0].turn_id, 'turn-1')
  assert.equal(state.harness.calls.length, 1)
}))

it('restart during dispatch requires explicit reconciliation when the harness has no acceptance evidence', () => fixture(async state => {
  state.source.mentions.push(mention); state.harness.state = 'busy'
  await state.bridge.wake()
  state.inbox.begin(mention.id, 'original prompt')
  await state.restart(); state.harness.state = 'ready'; await state.bridge.wake()
  assert.equal(state.inbox.rows()[0].state, 'uncertain')
  assert.equal(state.harness.calls.length, 0)
  assert.throws(() => state.inbox.resolve(mention.id, 'retry', ''), /evidence/)
  state.inbox.resolve(mention.id, 'retry', 'Operator inspected the stopped harness and verified no turn was accepted')
  await state.bridge.wake()
  assert.deepEqual(state.harness.calls, ['original prompt'])
}))

it('accepted inbox work can dispatch with the hub offline; a wrong local replica prevents dispatch', () => fixture(async state => {
  state.source.mentions.push(mention); state.harness.state = 'busy'
  await state.bridge.wake()
  state.harness.state = 'ready'; state.source.wrongReplica = true
  await state.bridge.wake(); assert.equal(state.harness.calls.length, 0)
  state.source.wrongReplica = false; state.source.hubOffline = true
  await state.bridge.wake(); assert.equal(state.harness.calls.length, 1)
}))

it('disabled, unauthorized, and retargeted mappings never dispatch', async () => {
  for (const change of [m => { m.enabled = false }, m => { m.allowedTaskIds = ['other'] }, m => { m.allowedFromActorIds = ['other'] }]) {
    await fixture(async state => {
      change(state.config.mappings[0]); state.source.mentions.push(mention)
      await state.bridge.wake(); assert.equal(state.harness.calls.length, 0)
    })
  }
  await fixture(async state => {
    state.harness.state = 'busy'; state.source.mentions.push(mention); await state.bridge.wake()
    state.config.mappings[0].threadId = 'different-session'; state.harness.state = 'ready'
    await state.bridge.wake(); assert.equal(state.harness.calls.length, 0)
    assert.match(state.inbox.rows()[0].reason, /mapping changed/)
  })
})

it('waits for originating task context to reach the local replica before dispatch', () => fixture(async state => {
  state.source.mentions.push(mention); state.source.contextMissing = true
  await state.bridge.wake()
  assert.equal(state.harness.calls.length, 0)
  assert.match(state.inbox.rows()[0].reason, /originating context/)
  state.source.contextMissing = false
  await state.bridge.wake()
  assert.equal(state.harness.calls.length, 1)
}))

it('a blocked delivery does not starve authorized work, and explicit allowlist changes release queued work', () => fixture(async state => {
  state.source.mentions.push({ ...mention, id: 'unauthorized', taskId: 'other-task' }, mention)
  await state.bridge.wake()
  assert.equal(state.harness.calls.length, 1)
  assert.equal(state.inbox.rows().find(row => row.id === 'unauthorized').state, 'queued')
  state.config.mappings[0].allowedTaskIds.push('other-task')
  state.harness.state = 'ready'
  await state.bridge.wake()
  assert.equal(state.harness.calls.length, 2)
}))

it('a stalled Actor does not hold up newly arriving work for another Actor', () => fixture(async state => {
  const slowMapping = { ...mapping, actorId: 'reviewer', threadId: 'thread-two' }
  state.config.mappings.push(slowMapping)
  const slow = new Harness()
  let release
  const gate = new Promise(resolve => { release = resolve })
  slow.availability = () => gate.then(() => 'busy')
  state.bridge.adapters.set('reviewer', slow)
  state.source.actors = async () => ({ actors: Object.fromEntries(['alice', 'builder', 'reviewer'].map(id => [id, { id, handle: id, kind: id === 'alice' ? 'human' : 'agent' }])) })
  const slowMention = { ...mention, id: 'slow-delivery', toActorId: 'reviewer' }
  state.inbox.claim('reviewer')
  state.inbox.receive('reviewer', { claimed: true, mention: slowMention }, slowMapping)
  state.inbox.clearClaim('reviewer')
  const first = state.bridge.wake()
  try {
    await delay(10)
    state.inbox.claim('builder')
    state.inbox.receive('builder', { claimed: true, mention }, mapping)
    state.inbox.clearClaim('builder')
    const second = state.bridge.wake()
    const deadline = Date.now() + 1000
    while (!state.harness.calls.length) { assert.ok(Date.now() < deadline); await delay(5) }
    assert.equal(state.harness.calls.length, 1)
    release(); await second
  } finally { release(); await first }
}))

it('failed replica verification prevents completion cleanup from accessing tasks or the harness', () => fixture(async state => {
  state.config.completionCleanup = { archiveDirectory: '/unused-archive' }
  state.source.wrongReplica = true
  let taskReads = 0, harnessChecks = 0
  state.source.actors = async () => { taskReads++; throw new Error('Unverified replica') }
  state.harness.availability = async () => { harnessChecks++; return 'ready' }
  await state.bridge.wake()
  assert.equal(taskReads, 0, 'Cleanup must not read an unverified replica')
  assert.equal(harnessChecks, 0, 'Cleanup must not access the harness')
  assert.equal(state.inbox.retirement(), null)
  assert.equal(state.bridge.sourceError, 'WORKSPACE_MISMATCH')
}))

it('later eligible context dispatches once while lagged context stays queued and can arrive later', () => fixture(async state => {
  const second = { ...mention, id: 'mention-two', commentId: 'comment-two' }
  state.harness.state = 'busy'; state.source.mentions.push(mention)
  await state.bridge.wake()
  let missing = true
  const context = state.source.context.bind(state.source)
  state.source.context = async received => {
    const value = await context(received)
    if (missing && received.id === mention.id) value.comments = []
    return value
  }
  state.source.mentions.push(second)
  await state.bridge.wake()
  state.harness.state = 'ready'
  await state.bridge.dispatch(state.config.mappings[0])
  assert.equal(state.harness.calls.length, 1)
  assert.ok(state.harness.calls[0].includes('Pardner delivery mention-two.'))
  assert.match(state.inbox.rows().find(row => row.id === mention.id).reason, /originating context/)
  assert.equal(state.inbox.rows().find(row => row.id === mention.id).state, 'queued')
  missing = false; state.harness.state = 'ready'
  await state.bridge.dispatch(state.config.mappings[0])
  assert.equal(state.harness.calls.length, 2)
  assert.equal(state.inbox.rows().find(row => row.id === mention.id).state, 'accepted')
}))

it('uncertain dispatch remains an Actor-wide barrier even when later context is eligible', () => fixture(async state => {
  state.harness.state = 'busy'
  state.source.mentions.push(mention, { ...mention, id: 'mention-two', commentId: 'comment-two' })
  await state.bridge.wake()
  state.inbox.begin(mention.id, 'unknown prompt'); state.inbox.recover()
  state.harness.state = 'ready'
  await state.bridge.dispatch(state.config.mappings[0])
  assert.equal(state.harness.calls.length, 0)
  assert.match(state.bridge.states.builder, /uncertain/)
}))

for (const code of ['LOCAL_SERVICE_UNAVAILABLE', 'AUTH_REQUIRED']) {
  it(`context ${code} errors remain visible and do not release later deliveries`, () => fixture(async state => {
    state.harness.state = 'busy'
    state.source.mentions.push(mention, { ...mention, id: 'mention-two', commentId: 'comment-two' })
    await state.bridge.wake()
    const queued = state.inbox.rows()
    const error = Object.assign(new Error('Context request failed'), { code })
    state.source.context = async () => { throw error }
    state.harness.state = 'ready'
    await assert.rejects(state.bridge.dispatch(state.config.mappings[0]), value => value === error)
    await state.bridge.wake()
    assert.equal(state.bridge.states.builder, code)
    assert.ok(state.inbox.statuses().some(status => status.actor === 'builder' && status.state === code))
    assert.equal(state.harness.calls.length, 0)
    assert.deepEqual(state.inbox.rows(), queued)
  }))
}

for (const change of [
  (comment, mention) => { comment.content = 'Replacement request' },
  (comment, mention) => { comment.revisionId = 'edited-revision' },
  (comment, mention) => { comment.editedBy = 'bob' },
  (comment, mention) => { comment.conflicts = [{ value: 'Competing request' }] },
  (comment, mention) => { delete mention.commentDigest },
]) {
  it('blocks changed, conflicted, or legacy comment bindings after queue recovery', () => fixture(async state => {
    state.harness.state = 'busy'
    const received = structuredClone(mention)
    const context = state.source.context.bind(state.source)
    state.source.context = async value => {
      const current = await context(value)
      change(current.comments[0], current.mentions[0])
      return current
    }
    // Apply legacy metadata before durable intake as well.
    change({}, received)
    state.source.mentions.push(received)
    await state.bridge.wake()
    await state.restart()
    state.harness.state = 'ready'
    await state.bridge.wake()
    assert.equal(state.harness.calls.length, 0)
    assert.equal(state.inbox.rows()[0].state, 'queued')
    assert.match(state.inbox.rows()[0].reason, /content binding/)
  }))
}
