import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClientPresence } from '../lib/client-presence.js'

const alpha = { projectId: 'project-a', actorId: 'alpha', deviceId: 'laptop', principalId: 'alpha-laptop', deviceName: 'Alice’s laptop', harnessId: 'openai-codex' }
const beta = { projectId: 'project-a', actorId: 'beta', deviceId: 'laptop', principalId: 'beta-laptop' }
function fixture(options) {
  let time = 0
  return { presence: new ClientPresence({ now: () => time, ...options }), advance: ms => { time += ms } }
}
const report = (seq, active = true, focusTaskIds = ['task-a']) => ({ seq, active, focusTaskIds })

describe('authenticated ephemeral client presence', () => {
  it('begins idle, becomes active only on a report, and disappears after disconnection', () => {
    const { presence, advance } = fixture()
    const { sessionId } = presence.start(alpha, { kind: 'agent', model: 'Reported model' })
    assert.equal(presence.snapshot('project-a').actors[0].state, 'idle')
    assert.deepEqual(presence.snapshot('project-a').actors[0].focusTaskIds, [])
    presence.report(alpha, sessionId, report(0))
    assert.equal(presence.snapshot('project-a').actors[0].state, 'active')
    advance(45000)
    assert.deepEqual(presence.snapshot('project-a').actors, [])
    assert.throws(() => presence.report(alpha, sessionId, report(1)), { code: 'SESSION_EXPIRED' })
    const fresh = presence.start(alpha)
    assert.notEqual(fresh.sessionId, sessionId)
    assert.equal(presence.snapshot('project-a').actors[0].state, 'idle')
  })

  it('expires activity before a longer live session and preserves its current focus', () => {
    const { presence, advance } = fixture({ ttlMs: 180000 })
    const { sessionId } = presence.start(alpha)
    presence.report(alpha, sessionId, report(0))
    advance(90000)
    assert.equal(presence.snapshot('project-a').actors[0].state, 'idle')
    assert.deepEqual(presence.snapshot('project-a').actors[0].focusTaskIds, ['task-a'])
  })

  it('aggregates one Actor across devices with separate models and deduplicated task markers', () => {
    const { presence } = fixture()
    const desktop = { ...alpha, deviceId: 'desktop', principalId: 'alpha-desktop', deviceName: 'Alice’s desktop' }
    const first = presence.start(alpha, { model: 'Model A', managedBy: 'T3' })
    const second = presence.start(desktop, { model: 'Model B', managedBy: 'T3' })
    presence.report(alpha, first.sessionId, report(0, true, ['task-a', 'task-a']))
    presence.report(desktop, second.sessionId, report(0, false, ['task-b', 'task-a']))
    const [actor] = presence.snapshot('project-a').actors
    assert.equal(actor.actorId, 'alpha')
    assert.equal(actor.state, 'active')
    assert.deepEqual(actor.focusTaskIds, ['task-a', 'task-b'])
    assert.deepEqual(actor.sessions.map(s => s.model).sort(), ['Model A', 'Model B'])
    presence.end(alpha, first.sessionId)
    assert.equal(presence.snapshot('project-a').actors[0].state, 'idle')
  })

  it('rejects different authors, devices, principals and projects for report and end', () => {
    const { presence } = fixture()
    const { sessionId } = presence.start(alpha)
    for (const binding of [beta, { ...alpha, deviceId: 'other' }, { ...alpha, principalId: 'other' }, { ...alpha, projectId: 'other' }]) {
      assert.throws(() => presence.report(binding, sessionId, report(0)), { code: binding.projectId === 'other' ? 'PROJECT_MISMATCH' : 'ACTOR_MISMATCH' })
      assert.throws(() => presence.end(binding, sessionId), { code: binding.projectId === 'other' ? 'PROJECT_MISMATCH' : 'ACTOR_MISMATCH' })
    }
    assert.throws(() => presence.start(alpha, { actorId: 'beta' }), { code: 'ACTOR_MISMATCH' })
    assert.throws(() => presence.report(alpha, sessionId, { ...report(0), projectId: 'other' }), { code: 'PROJECT_MISMATCH' })
    assert.equal(presence.snapshot('project-a').actors[0].state, 'idle')
  })

  it('never leaks sessions into another project or exposes private principal IDs', () => {
    const { presence } = fixture()
    presence.start(alpha, { model: null })
    assert.deepEqual(presence.snapshot('project-b').actors, [])
    const snapshot = presence.snapshot('project-a')
    assert.equal(snapshot.actors[0].sessions[0].model, null)
    assert.equal(JSON.stringify(snapshot).includes('alpha-laptop'), false)
  })

  it('does not extend a lease on duplicate reports and rejects stale or changed replays', () => {
    const { presence, advance } = fixture()
    const { sessionId } = presence.start(alpha)
    presence.report(alpha, sessionId, report(3))
    advance(30000)
    assert.equal(presence.report(alpha, sessionId, report(3)).ttlMs, 15000)
    assert.throws(() => presence.report(alpha, sessionId, report(2)), { code: 'STALE_PRESENCE_REPORT' })
    assert.throws(() => presence.report(alpha, sessionId, report(3, false)), { code: 'STALE_PRESENCE_REPORT' })
    advance(15000)
    assert.deepEqual(presence.snapshot('project-a').actors, [])
  })

  it('validates reports before changing observable activity, model or expiry', () => {
    const { presence, advance } = fixture()
    const { sessionId } = presence.start(alpha)
    presence.report(alpha, sessionId, report(0))
    advance(10000)
    for (const input of [{ ...report(1), active: 'yes' }, { ...report(1), seq: -1 },
      { ...report(1), focusTaskIds: new Array(33).fill('task-a') }, { ...report(1), activeForMs: 300001 },
      { ...report(1), model: '' }]) assert.throws(() => presence.report(alpha, sessionId, input), { code: 'INVALID_ARGUMENT' })
    advance(35000)
    assert.deepEqual(presence.snapshot('project-a').actors, [])
  })

  it('can clear a model without changing Actor identity and bound memory is reclaimed after expiry', () => {
    const { presence, advance } = fixture({ maxSessions: 1 })
    const { sessionId } = presence.start(alpha, { model: 'Model A' })
    presence.report(alpha, sessionId, { ...report(0), model: null })
    assert.equal(presence.snapshot('project-a').actors[0].sessions[0].model, null)
    assert.throws(() => presence.start(beta), { code: 'PRESENCE_LIMIT' })
    advance(45000)
    presence.start(beta)
    assert.equal(presence.snapshot('project-a').actors[0].actorId, 'beta')
  })
})
