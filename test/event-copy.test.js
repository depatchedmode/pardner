import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_LABELS, describeEvent, eventGroup, eventText, sortEvents } from '../ui-prototype/src/events.js'

const actors = {
  alice: { id: 'alice', handle: 'alice', kind: 'human', displayName: 'Alice Moreno' },
  builder: { id: 'builder', handle: 'builder', kind: 'agent', displayName: 'Builder' },
  plain: { id: 'plain', handle: 'plainhandle', kind: 'agent' },
}
const tasks = {
  t1: { id: 't1', title: 'Fix login' },
  t2: { id: 't2', title: 'Branch work' },
}
const veins = { v1: { id: 'v1', title: 'Auth' }, v2: { id: 'v2', title: 'Billing' } }
const goals = { g1: { id: 'g1', title: 'Ship v1' }, g2: { id: 'g2', title: 'Ship v2' } }
const comments = { c1: { id: 'c1', taskId: 't1' } }
const lookups = { actors, tasks, veins, goals, comments }

let counter = 0
const ev = (type, fields = {}) => ({
  operationId: `op-${++counter}`, type, actorId: 'alice', timestamp: '2026-01-01T10:00:00.000Z',
  taskId: 't1', payload: {}, changes: [], result: {}, recordIds: [], ...fields,
})
const ch = (field, old, value) => ({ field, old, new: value })
const sentence = description => eventText({ ...description, detail: null, excerpt: null })
const describe1 = (event, options) => describeEvent(event, lookups, options)
const say = (event, options) => sentence(describe1(event, options))

describe('task copy', () => {
  it('task.create with details', () => {
    const e = ev('task.create', {
      changes: [ch('title', null, 'Fix login'), ch('status', null, 'review'), ch('priority', null, 'p1'), ch('assignee', null, 'builder'),
        ch('tags', null, []), ch('order', null, 5), ch('type', null, 'task')],
      result: { taskId: 't1', veinIds: ['v1', 'v2'] },
    })
    const d = describe1(e)
    assert.equal(sentence(d), 'Alice Moreno created Fix login')
    assert.equal(d.detail, 'Review · P1 · Assigned to Builder · Vein: Auth · Vein: Billing')
    assert.equal(d.excerpt, null)
  })
  it('task.create with null tags, unassigned, order/type omitted', () => {
    const e = ev('task.create', { changes: [ch('title', null, 'Fix login'), ch('status', null, 'backlog'), ch('priority', null, 'p2'), ch('assignee', null, null), ch('tags', null, null)] })
    assert.equal(describe1(e).detail, 'Backlog · P2 · Unassigned')
  })
  it('task.create with no changes at all still has a sentence', () => {
    const d = describe1(ev('task.create', { changes: undefined, payload: { title: 'Fix login', status: 'in-progress', priority: 'p3' } }))
    assert.equal(sentence(d), 'Alice Moreno created Fix login')
    assert.equal(d.detail, 'In progress · P3 · Unassigned')
  })
  it('task.update single-field variants', () => {
    assert.equal(say(ev('task.update', { changes: [ch('status', 'backlog', 'review')] })), 'Alice Moreno moved Fix login to Review')
    assert.equal(say(ev('task.update', { changes: [ch('assignee', null, 'builder')] })), 'Alice Moreno assigned Fix login to Builder')
    assert.equal(say(ev('task.update', { changes: [ch('assignee', 'builder', null)] })), 'Alice Moreno unassigned Fix login')
    assert.equal(say(ev('task.update', { changes: [ch('priority', 'p2', 'p1')] })), 'Alice Moreno changed the priority of Fix login to P1')
    const title = describe1(ev('task.update', { changes: [ch('title', 'Old name', 'Fix login')] }))
    assert.equal(sentence(title), 'Alice Moreno renamed Fix login')
    assert.equal(title.detail, 'Was “Old name”')
    const description = describe1(ev('task.update', { changes: [ch('description', 'a', 'b')] }))
    assert.equal(sentence(description), 'Alice Moreno edited the description of Fix login')
    assert.equal(description.detail, null)
    const tags = describe1(ev('task.update', { changes: [ch('tags', [], ['a', 'b'])] }))
    assert.equal(sentence(tags), 'Alice Moreno changed the tags on Fix login')
    assert.equal(tags.detail, 'Tags: a, b')
    assert.equal(describe1(ev('task.update', { changes: [ch('tags', ['a'], [])] })).detail, 'Tags: none')
    assert.equal(say(ev('task.update', { changes: [ch('order', 1, 2)] })), 'Alice Moreno reordered Fix login')
    assert.equal(say(ev('task.update', { changes: [ch('type', 'task', 'bug')] })), 'Alice Moreno changed the type of Fix login to bug')
  })
  it('task.update with several changes shows the ordered detail line', () => {
    const d = describe1(ev('task.update', {
      changes: [ch('order', 1, 2), ch('type', 'task', 'bug'), ch('tags', [], ['x', 'y']), ch('description', 'a', 'b'), ch('title', 'Old', 'New'),
        ch('priority', 'p2', 'p1'), ch('assignee', null, 'builder'), ch('status', 'backlog', 'review')],
    }))
    assert.equal(sentence(d), 'Alice Moreno edited Fix login')
    assert.equal(d.detail, 'Status: Backlog → Review · Assignee: Unassigned → Builder · Priority: P2 → P1 · Title: “Old” → “New” · Tags: x, y · Description edited · Type: task → bug')
  })
  it('drops unchanged and order changes alongside real changes', () => {
    const d = describe1(ev('task.update', { changes: [ch('order', 1, 2), ch('status', 'review', 'review'), ch('priority', 'p2', 'p1')] }))
    assert.equal(sentence(d), 'Alice Moreno changed the priority of Fix login to P1')
    assert.equal(say(ev('task.update', { changes: [ch('tags', ['a'], ['a'])] })), 'Alice Moreno saved Fix login with no changes')
    assert.equal(say(ev('task.update', { changes: [] })), 'Alice Moreno saved Fix login with no changes')
  })
  it('task.resolve', () => {
    const d = describe1(ev('task.resolve', { payload: { field: 'status' }, changes: [ch('status', 'backlog', 'review')] }))
    assert.equal(sentence(d), 'Alice Moreno resolved conflicting status on Fix login')
    assert.equal(d.detail, 'Kept Review')
    assert.equal(describe1(ev('task.resolve', { payload: { field: 'assignee' }, changes: [ch('assignee', 'x', null)] })).detail, 'Kept Unassigned')
    assert.equal(describe1(ev('task.resolve', { payload: { field: 'priority' }, changes: [ch('priority', 'p3', 'p1')] })).detail, 'Kept P1')
  })
  it('task.handoff maps the assignee id to a name and mentions the status change', () => {
    const e = ev('task.handoff', {
      payload: { to: 'builder', status: 'completed', message: 'Ready   for\n review' },
      changes: [ch('assignee', null, 'builder'), ch('status', 'review', 'completed')],
      result: { taskId: 't1', commentId: 'c1' },
    })
    const d = describe1(e)
    assert.equal(sentence(d), 'Alice Moreno handed Fix login to Builder and set it to Completed')
    assert.equal(d.detail, null)
    assert.equal(d.excerpt, '“Ready for review”')
  })
  it('task.handoff with unchanged status omits "and set it to"; falls back to payload.to', () => {
    const e = ev('task.handoff', {
      payload: { to: 'ghost', status: 'review', message: 'hi' },
      changes: [ch('assignee', null, 'ghost-id'), ch('status', 'review', 'review')], result: { commentId: 'c1' },
    })
    assert.equal(say(e), 'Alice Moreno handed Fix login to ghost')
    assert.equal(say(ev('task.handoff', { payload: { to: 'builder' }, changes: [ch('assignee', 'alice', 'builder'), ch('status', 'review', 'review')] })), 'Alice Moreno handed Fix login to Builder')
  })
  it('task.branch reads from the parent and the branch', () => {
    const e = ev('task.branch', { taskId: 't1', payload: { taskId: 't1', name: 'spike' }, result: { taskId: 't2', branchId: 't2', parentId: 't1' } })
    assert.equal(say(e), 'Alice Moreno started branch “spike” from Fix login')
    assert.equal(describe1(e).parts.find(p => p.subject).id, 't1')
    assert.equal(eventGroup(e), 'commits')
  })
  it('task.merge names the branch in plain text and summarises changes', () => {
    const e = ev('task.merge', { taskId: 't1', payload: { branchId: 't2' }, result: { taskId: 't1', branchId: 't2', parentId: 't1' }, changes: [ch('priority', 'p2', 'p1'), ch('status', 'backlog', 'review')] })
    const d = describe1(e)
    assert.equal(sentence(d), 'Alice Moreno merged Branch work into Fix login')
    assert.equal(d.detail, 'Status: Backlog → Review · Priority: P2 → P1')
    assert.equal(describe1(ev('task.merge', { result: { branchId: 't2' } })).detail, null)
    assert.equal(eventGroup(e), 'status')
    assert.equal(eventGroup(ev('task.merge', { result: { branchId: 't2' } })), 'commits')
    assert.match(say(ev('task.merge', { result: { branchId: 'nope' } })), /^Alice Moreno merged .* into Fix login$/)
  })
  it('task.link-commit', () => {
    const d = describe1(ev('task.link-commit', { payload: { commit: { hash: 'abcdef1234567890', message: 'Fix the bug\n\nLong body' } } }))
    assert.equal(sentence(d), 'Alice Moreno linked commit abcdef1 to Fix login')
    assert.equal(d.detail, '“Fix the bug”')
    const long = describe1(ev('task.link-commit', { payload: { commit: { hash: 'abcdef1', message: 'x'.repeat(130) } } }))
    assert.equal(long.detail, `“${'x'.repeat(100)}…”`)
  })
  it('task.link-vein and unlink-vein', () => {
    assert.equal(say(ev('task.link-vein', { result: { taskId: 't1', veinId: 'v1' } })), 'Alice Moreno added Fix login to vein Auth')
    assert.equal(say(ev('task.unlink-vein', { result: { taskId: 't1', veinId: 'v1' } })), 'Alice Moreno removed Fix login from vein Auth')
  })
  it('task.link-issue and unlink-issue name the issue', () => {
    const issue = { taskId: 't1', repository: 'acme/lantern-checkout', number: 418 }
    assert.equal(say(ev('task.link-issue', { result: issue })), 'Alice Moreno linked issue acme/lantern-checkout#418 to Fix login')
    assert.equal(say(ev('task.unlink-issue', { result: issue })), 'Alice Moreno unlinked issue acme/lantern-checkout#418 from Fix login')
    assert.equal(say(ev('task.link-issue', { payload: issue })), 'Alice Moreno linked issue acme/lantern-checkout#418 to Fix login')
    assert.doesNotMatch(say(ev('task.link-issue', { result: issue })), /recorded/)
  })
})

describe('comments and reads', () => {
  const base = { payload: { text: 'Looks good to me' }, result: { taskId: 't1', commentId: 'c1' } }
  it('comment.add / edit / resolve carry an excerpt', () => {
    const add = describe1(ev('comment.add', base))
    assert.equal(sentence(add), 'Alice Moreno commented on Fix login')
    assert.equal(add.excerpt, '“Looks good to me”')
    assert.equal(sentence(describe1(ev('comment.edit', base))), 'Alice Moreno edited a comment on Fix login')
    assert.equal(describe1(ev('comment.edit', base)).excerpt, '“Looks good to me”')
    const resolve = describe1(ev('comment.resolve', base))
    assert.equal(sentence(resolve), 'Alice Moreno kept one version of a comment on Fix login')
    assert.equal(resolve.excerpt, '“Looks good to me”')
  })
  it('comment.delete has no excerpt', () => {
    const d = describe1(ev('comment.delete', { result: { commentId: 'c1' } }))
    assert.equal(sentence(d), 'Alice Moreno deleted a comment on Fix login')
    assert.equal(d.excerpt, null)
    assert.equal(d.detail, null)
  })
  it('a comment deleted later keeps what its signer wrote, and says it was deleted and by whom', () => {
    // The words are the entry's own; that the comment was deleted is the board now, named by the change that did it.
    const d = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), lookups)
    assert.equal(d.excerpt, '“Looks good to me”')
    assert.equal(d.detail, 'This comment was later deleted.')
    const machines = { 'machine-laptopaaaaaaaaaaaaaaaaaaaaaa': { personId: 'person-alice', personName: 'Alice', name: 'laptop' },
      'machine-bobbbbbbbbbbbbbbbbbbbbbbbb': { personId: 'person-bob', personName: 'Bob', name: 'desk' } }
    const attribution = { machines }
    // Deleted by the Actor's own signed, unflagged comment.delete: named, with the machine that signed it.
    const deletions = { gone: [{ change: 'a'.repeat(64), type: 'comment.delete', actorId: 'builder', state: 'signed', machineId: 'machine-laptopaaaaaaaaaaaaaaaaaaaaaa', review: false }] }
    const named = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), { ...lookups, attribution, deletions })
    assert.equal(named.excerpt, '“Looks good to me”')
    assert.equal(named.detail, 'This comment was later deleted by Builder, signed by Alice · laptop.')
    assert.deepEqual(named.detailParts.filter(part => typeof part !== 'string').map(part => [part.label, part.current]), [['Builder', true], ['Alice · laptop', true]], 'names are as they are now')
    const unrecognised = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), { ...lookups, attribution, deletions: { gone: [{ change: 'b'.repeat(64), type: null, actorId: null, state: 'signed', machineId: 'machine-bobbbbbbbbbbbbbbbbbbbbbbbb', review: true }] } })
    assert.equal(unrecognised.detail, 'A change that needs review, signed by Bob · desk, later marked this comment deleted. See Activity.')
    const handoff = describe1(ev('task.handoff', { payload: { to: 'builder', message: 'signed words' }, changes: [ch('assignee', null, 'builder'), ch('status', 'a', 'a')], result: { commentId: 'gone' } }))
    assert.equal(handoff.excerpt, '“signed words”')
    assert.equal(handoff.detail, 'This comment was later deleted.')
  })
  it('a deletion claiming another Actor is never said to be that Actor’s: it names the signer and needs review', () => {
    const attribution = { machines: { 'machine-bobbbbbbbbbbbbbbbbbbbbbbbb': { personId: 'person-bob', personName: 'Bob', name: 'desk' } } }
    const claimed = [{ change: 'c'.repeat(64), type: 'comment.delete', actorId: 'alice', state: 'signed', machineId: 'machine-bobbbbbbbbbbbbbbbbbbbbbbbb', review: true, actorMismatch: true }]
    const d = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), { ...lookups, attribution, deletions: { gone: claimed } })
    assert.doesNotMatch(d.detail, /Alice Moreno/)
    assert.equal(d.detail, 'A change that needs review, signed by Bob · desk, later marked this comment deleted. See Activity.')
    const pending = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), { ...lookups, attribution, deletions: { gone: [{ ...claimed[0], state: 'pending', review: null, actorMismatch: false }] } })
    assert.equal(pending.detail, 'A change still being checked later marked this comment deleted. See Activity.')
    const unsigned = describeEvent(ev('comment.add', { ...base, result: { commentId: 'gone' } }), { ...lookups, attribution, deletions: { gone: [{ ...claimed[0], state: 'unattributed', relayedBy: 'machine-bobbbbbbbbbbbbbbbbbbbbbbbb' }] } })
    assert.equal(unsigned.detail, 'An unsigned change relayed by Bob · desk later marked this comment deleted. See Activity.')
  })
  it('names and titles looked up now are marked current; the time, words and values are the entry’s own', () => {
    const d = describe1(ev('task.handoff', { payload: { to: 'builder', message: 'Over to you' }, changes: [ch('assignee', null, 'builder'), ch('status', 'backlog', 'review')], result: { commentId: 'c1' } }))
    assert.equal(d.actorCurrent, true)
    assert.deepEqual(d.parts.filter(part => typeof part !== 'string').map(part => [part.label, Boolean(part.current)]), [['Fix login', true], ['Builder', true], ['Review', false]])
    const edited = describe1(ev('task.update', { changes: [ch('assignee', 'alice', 'builder'), ch('priority', 'p2', 'p1')] }))
    assert.equal(edited.detail, 'Assignee: Alice Moreno → Builder · Priority: P2 → P1')
    assert.deepEqual(edited.detailParts.filter(part => typeof part !== 'string'), [{ label: 'Alice Moreno', current: true }, { label: 'Builder', current: true }])
    // An ID nothing names is shown as written, not as a current label.
    const unknown = describeEvent(ev('task.update', { actorId: 'ghost', taskId: 'nowhere', changes: [ch('status', 'a', 'review')] }), lookups)
    assert.equal(unknown.actorCurrent, false)
    assert.equal(unknown.parts.find(part => part.subject).current, undefined)
  })
  it('truncates long excerpts at 140 characters with curly quotes', () => {
    const d = describe1(ev('comment.add', { ...base, payload: { text: 'a'.repeat(200) } }))
    assert.equal(d.excerpt, `“${'a'.repeat(140)}…”`)
    const exact = describe1(ev('comment.add', { ...base, payload: { text: 'b'.repeat(140) } }))
    assert.equal(exact.excerpt, `“${'b'.repeat(140)}”`)
  })
  it('read.mark', () => {
    assert.equal(say(ev('read.mark', { result: { receipts: 3 } })), 'Alice Moreno read 3 comments on Fix login')
    assert.equal(say(ev('read.mark', { result: { receipts: 1 } })), 'Alice Moreno read 1 comment on Fix login')
    assert.equal(say(ev('read.mark', { result: { receipts: 0 } })), 'Alice Moreno marked Fix login as read')
  })
})

describe('goals and veins', () => {
  it('goal.create / update / resolve', () => {
    const g = { taskId: undefined, result: { goalId: 'g1' } }
    assert.equal(say(ev('goal.create', g)), 'Alice Moreno created goal Ship v1')
    assert.equal(say(ev('goal.update', { ...g, changes: [ch('status', 'open', 'achieved')] })), 'Alice Moreno marked goal Ship v1 Achieved')
    const renamed = describe1(ev('goal.update', { ...g, changes: [ch('title', 'Old', 'Ship v1')] }))
    assert.equal(sentence(renamed), 'Alice Moreno renamed goal Ship v1')
    assert.equal(renamed.detail, 'Was “Old”')
    assert.equal(say(ev('goal.update', { ...g, changes: [ch('description', 'a', 'b')] })), 'Alice Moreno edited the description of goal Ship v1')
    const other = describe1(ev('goal.update', { ...g, changes: [ch('status', 'open', 'achieved'), ch('title', 'Old', 'Ship v1')] }))
    assert.equal(sentence(other), 'Alice Moreno edited goal Ship v1')
    assert.equal(other.detail, 'Status: Open → Achieved · Title: “Old” → “Ship v1”')
    const resolve = describe1(ev('goal.resolve', { ...g, payload: { field: 'title' }, changes: [ch('title', 'A', 'Ship v1')] }))
    assert.equal(sentence(resolve), 'Alice Moreno resolved conflicting title on goal Ship v1')
    assert.equal(resolve.detail, 'Kept “Ship v1”')
  })
  it('vein.create', () => {
    assert.equal(say(ev('vein.create', { taskId: undefined, result: { veinId: 'v1', goalId: 'g1' } })), 'Alice Moreno started vein Auth for goal Ship v1')
    assert.equal(say(ev('vein.create', { taskId: undefined, result: { veinId: 'v1', goalId: 'g1', createdGoal: true } })), 'Alice Moreno started vein Auth for new goal Ship v1')
  })
  it('vein.update variants', () => {
    const v = { taskId: undefined, result: { veinId: 'v1' } }
    assert.equal(say(ev('vein.update', { ...v, changes: [ch('status', 'open', 'proven')] })), 'Alice Moreno marked vein Auth Proven')
    assert.equal(say(ev('vein.update', { ...v, changes: [ch('goalId', 'g1', 'g2')] })), 'Alice Moreno moved vein Auth to goal Ship v2')
    assert.equal(say(ev('vein.update', { ...v, changes: [ch('title', 'Old', 'Auth')] })), 'Alice Moreno renamed vein Auth')
    assert.equal(say(ev('vein.update', { ...v, changes: [ch('description', 'a', 'b')] })), 'Alice Moreno edited the description of vein Auth')
    const other = describe1(ev('vein.update', { ...v, changes: [ch('goalId', 'g1', 'g2'), ch('status', 'open', 'proven')] }))
    assert.equal(sentence(other), 'Alice Moreno edited vein Auth')
    assert.equal(other.detail, 'Status: Open → Proven · Goal: Ship v1 → Ship v2')
    const resolve = describe1(ev('vein.resolve', { ...v, payload: { field: 'goalId' }, changes: [ch('goalId', 'g1', 'g2')] }))
    assert.equal(sentence(resolve), 'Alice Moreno resolved conflicting goal on vein Auth')
    assert.equal(resolve.detail, 'Kept Ship v2')
  })
})

describe('actors, fallbacks and lookups', () => {
  it('actor.register for self (bootstrap) and for another actor', () => {
    const boot = ev('actor.register', { actorId: 'alice', taskId: undefined, payload: { id: 'alice', handle: 'alice', kind: 'human' }, result: { actorId: 'alice' } })
    assert.equal(say(boot), 'Alice Moreno joined as a human')
    const other = ev('actor.register', { actorId: 'alice', taskId: undefined, payload: { id: 'builder', handle: 'builder', kind: 'agent' }, result: { actorId: 'builder' } })
    const d = describe1(other)
    assert.equal(sentence(d), 'Alice Moreno registered Builder as an agent')
    assert.deepEqual(d.parts.filter(part => typeof part !== 'string'), [{ label: 'Builder', current: true }], 'the registered Actor is named as it is now, and says so')
    assert.equal(say(ev('actor.register', { taskId: undefined, payload: { id: 'zed', handle: 'zed', displayName: 'Zed', kind: 'human' }, result: { actorId: 'zed' } })), 'Alice Moreno registered Zed as a human')
  })
  it('actor name falls back to the handle, then the id', () => {
    assert.equal(say(ev('task.update', { actorId: 'plain', changes: [ch('status', 'a', 'review')] })), 'plainhandle moved Fix login to Review')
    assert.equal(describe1(ev('task.update', { actorId: 'nobody', changes: [] })).actor, 'nobody')
  })
  it('unknown types fall back', () => {
    assert.equal(say(ev('widget.spin')), 'Alice Moreno recorded widget.spin on Fix login')
    assert.equal(say(ev('widget.spin', { taskId: undefined })), 'Alice Moreno recorded widget.spin')
    assert.equal(eventGroup(ev('widget.spin')), 'other')
  })
  it('missing task, vein and goal use placeholders', () => {
    const d = describe1(ev('task.link-vein', { taskId: 'gone', result: { veinId: 'gone-v' } }))
    assert.equal(sentence(d), 'Alice Moreno added an unknown task to vein an unknown vein')
    assert.deepEqual(d.parts.filter(p => p.subject).map(p => [p.subject, p.missing]), [['task', true], ['vein', true]])
    assert.equal(say(ev('goal.create', { taskId: undefined, result: { goalId: 'gone' } })), 'Alice Moreno created goal an unknown goal')
    assert.equal(say(ev('vein.create', { taskId: undefined, result: { veinId: 'gone', goalId: 'gone' } })), 'Alice Moreno started vein an unknown vein for goal an unknown goal')
    assert.equal(say(ev('read.mark', { taskId: undefined, result: { receipts: 0 } })), 'Alice Moreno marked an unknown task as read')
  })
  it('subjects carry id and label; status parts carry key and label', () => {
    const d = describe1(ev('task.update', { changes: [ch('status', 'backlog', 'in-progress')] }))
    assert.deepEqual(d.parts.filter(p => typeof p !== 'string'), [{ subject: 'task', id: 't1', label: 'Fix login', current: true }, { status: 'in-progress', label: 'In progress' }])
    assert.equal(STATUS_LABELS['dead-end'], 'Dead end')
  })
  it('unknown status values render raw', () => {
    assert.equal(say(ev('task.update', { changes: [ch('status', 'a', 'zzz')] })), 'Alice Moreno moved Fix login to zzz')
  })
  it('within turns the matching task subject into "this task"', () => {
    const d = describe1(ev('task.update', { changes: [ch('status', 'backlog', 'review')] }), { within: 't1' })
    assert.equal(sentence(d), 'Alice Moreno moved this task to Review')
    assert.ok(d.parts.every(part => typeof part === 'string' || !part.subject))
    assert.equal(say(ev('task.update', { changes: [ch('status', 'backlog', 'review')] }), { within: 'other' }), 'Alice Moreno moved Fix login to Review')
  })
  it('eventText flattens detail and excerpt', () => {
    const d = describe1(ev('comment.add', { payload: { text: 'hello' }, result: { commentId: 'c1' } }))
    assert.equal(eventText(d), 'Alice Moreno commented on Fix login — “hello”')
  })
})

describe('eventGroup', () => {
  it('groups by type and status change', () => {
    const g = (type, changes = []) => eventGroup(ev(type, { changes }))
    assert.equal(g('task.handoff', [ch('status', 'a', 'a')]), 'status')
    assert.equal(g('task.update', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('task.resolve', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('vein.update', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('vein.resolve', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('goal.update', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('goal.resolve', [ch('status', 'a', 'b')]), 'status')
    assert.equal(g('task.update', [ch('status', 'a', 'a')]), 'other')
    assert.equal(g('task.update', [ch('title', 'a', 'b')]), 'other')
    assert.equal(g('task.create', [ch('status', null, 'backlog')]), 'other')
    assert.equal(g('comment.add'), 'comments')
    assert.equal(g('comment.delete'), 'comments')
    assert.equal(g('task.link-commit'), 'commits')
    assert.equal(g('task.branch'), 'commits')
    assert.equal(g('task.merge'), 'commits')
    assert.equal(g('goal.create', [ch('status', null, 'open')]), 'plans')
    assert.equal(g('vein.create', [ch('status', null, 'open')]), 'plans')
    assert.equal(g('vein.update', [ch('title', 'a', 'b')]), 'plans')
    assert.equal(g('goal.update', [ch('title', 'a', 'b')]), 'plans')
    assert.equal(g('task.link-vein'), 'plans')
    assert.equal(g('task.unlink-vein'), 'plans')
    assert.equal(g('actor.register'), 'actors')
    assert.equal(g('read.mark'), 'reads')
    assert.equal(eventGroup({ type: 'task.update' }), 'other')
  })
})

describe('sortEvents', () => {
  it('sorts newest first, then operationId descending, stably, without mutating', () => {
    const a = { operationId: 'op-a', timestamp: '2026-01-01T10:00:00.000Z' }
    const b = { operationId: 'op-b', timestamp: '2026-01-01T10:00:00.000Z' }
    const c = { operationId: 'op-c', timestamp: '2026-01-02T10:00:00.000Z' }
    const d1 = { operationId: 'op-d', timestamp: '2025-12-31T10:00:00.000Z', n: 1 }
    const d2 = { operationId: 'op-d', timestamp: '2025-12-31T10:00:00.000Z', n: 2 }
    const input = [d1, a, d2, b, c]
    const sorted = sortEvents(input)
    assert.deepEqual(sorted.map(e => e.operationId), ['op-c', 'op-b', 'op-a', 'op-d', 'op-d'])
    assert.deepEqual(sorted.slice(3).map(e => e.n), [1, 2])
    assert.deepEqual(input.map(e => e.operationId), ['op-d', 'op-a', 'op-d', 'op-b', 'op-c'])
  })
})
