#!/usr/bin/env node
// Scripted stand-in for the Codex binary, so T3 qualification runs real T3 code without model turns.
// The message text picks the behavior: FIXTURE:hold, FIXTURE:approval, FIXTURE:input, otherwise complete.
import { appendFileSync } from 'node:fs'

const log = entry => appendFileSync(process.env.PARDNER_FAKE_CODEX_LOG, `${JSON.stringify({ at: Date.now(), ...entry })}\n`)
const args = process.argv.slice(2)
log({ argv: args })
if (args[0] === '--version') { console.log('codex-cli 0.200.0'); process.exit(0) }
if (args[0] === 'login' || args[1] === '--help') { console.log('Logged in'); process.exit(0) }
if (args[0] !== 'app-server') process.exit(0)

const send = message => { log({ out: message }); process.stdout.write(`${JSON.stringify(message)}\n`) }
const notify = (method, params) => send({ method, params })
const threads = new Map()
const waiting = new Map()
let sequence = 0
let serverRequest = 1000

const seconds = () => Math.floor(Date.now() / 1000)
const describe = (thread, status = { type: 'idle' }, turns = []) => ({ cliVersion: '0.200.0', createdAt: seconds(), cwd: thread.cwd, ephemeral: false, id: thread.id,
  modelProvider: 'fixture', preview: '', projectId: null, sessionId: thread.id, source: 'appServer', status, turns, updatedAt: seconds() })
const policy = cwd => ({ approvalPolicy: 'on-request', approvalsReviewer: 'user', cwd, model: 'fixture', modelProvider: 'fixture', sandbox: { type: 'readOnly' } })

function finish(thread, turn, status) {
  turn.status = status
  thread.active = null
  if (status === 'completed') {
    const item = { type: 'agentMessage', id: `item-${++sequence}`, text: `fixture reply ${turn.id}` }
    notify('item/started', { threadId: thread.id, turnId: turn.id, item })
    notify('item/completed', { threadId: thread.id, turnId: turn.id, item })
    turn.items.push(item)
  }
  notify('thread/status/changed', { threadId: thread.id, status: { type: 'idle' } })
  notify('turn/completed', { threadId: thread.id, turn: { ...turn } })
}

function block(thread, turn, flag, method, params) {
  const id = ++serverRequest
  waiting.set(id, { thread, turn })
  notify('thread/status/changed', { threadId: thread.id, status: { type: 'active', activeFlags: [flag] } })
  send({ id, method, params: { threadId: thread.id, turnId: turn.id, ...params } })
}

function startTurn(request) {
  const thread = threads.get(request.params.threadId)
  const text = (request.params.input ?? []).map(input => input.text ?? '').join(' ')
  const turn = { id: `turn-${++sequence}`, items: [{ type: 'userMessage', id: `user-${sequence}`, content: request.params.input }], status: 'inProgress' }
  thread.turns.push(turn)
  thread.active = turn
  send({ id: request.id, result: { turn: { ...turn, items: [] } } })
  notify('thread/status/changed', { threadId: thread.id, status: { type: 'active', activeFlags: [] } })
  notify('turn/started', { threadId: thread.id, turn: { ...turn, items: [] } })
  if (text.includes('FIXTURE:approval')) {
    const itemId = `command-${sequence}`
    notify('item/started', { threadId: thread.id, turnId: turn.id, item: { type: 'commandExecution', id: itemId, command: 'fixture-write', commandActions: [], cwd: thread.cwd, status: 'inProgress' } })
    block(thread, turn, 'waitingOnApproval', 'item/commandExecution/requestApproval', { itemId, command: 'fixture-write', startedAtMs: Date.now(), reason: 'fixture approval' })
  } else if (text.includes('FIXTURE:input')) {
    block(thread, turn, 'waitingOnUserInput', 'item/tool/requestUserInput', { itemId: `question-${sequence}`, isBlocking: true,
      questions: [{ id: 'proceed', header: 'Fixture', question: 'Proceed?', options: [{ label: 'Yes', description: 'Continue' }, { label: 'No', description: 'Stop' }] }] })
  } else if (!text.includes('FIXTURE:hold')) setTimeout(() => { if (thread.active === turn) finish(thread, turn, 'completed') }, 150)
}

function handle(message) {
  log({ in: message })
  if (message.method && message.id === undefined) return
  if (!message.method) {
    const pending = waiting.get(message.id)
    if (!pending) return
    waiting.delete(message.id)
    notify('serverRequest/resolved', { threadId: pending.thread.id, requestId: message.id })
    notify('thread/status/changed', { threadId: pending.thread.id, status: { type: 'active', activeFlags: [] } })
    setTimeout(() => { if (pending.thread.active === pending.turn) finish(pending.thread, pending.turn, 'completed') }, 100)
    return
  }
  const params = message.params ?? {}
  const reply = result => send({ id: message.id, result })
  switch (message.method) {
    case 'initialize': return reply({ userAgent: 'fixture/0.200.0', codexHome: process.env.HOME, platformFamily: 'unix', platformOs: 'macos' })
    case 'thread/start': {
      const thread = { id: `fixture-thread-${process.pid}-${++sequence}`, cwd: params.cwd, turns: [] }
      threads.set(thread.id, thread)
      reply({ ...policy(params.cwd), thread: describe(thread) })
      return notify('thread/started', { thread: describe(thread) })
    }
    case 'thread/resume': {
      if (!threads.has(params.threadId)) threads.set(params.threadId, { id: params.threadId, cwd: params.cwd, turns: [] })
      const thread = threads.get(params.threadId)
      return reply({ ...policy(thread.cwd), thread: describe(thread, { type: 'idle' }, thread.turns) })
    }
    case 'turn/start': return startTurn(message)
    case 'turn/interrupt': {
      const thread = threads.get(params.threadId)
      reply({})
      if (thread?.active?.id === params.turnId) {
        // Interrupting a turn clears its outstanding requests, as the app-server protocol reports them.
        for (const [id, pending] of waiting) {
          if (pending.turn !== thread.active) continue
          waiting.delete(id)
          notify('serverRequest/resolved', { threadId: thread.id, requestId: id })
        }
        finish(thread, thread.active, 'interrupted')
      }
      return
    }
    case 'account/read': return reply({ account: { type: 'apiKey' }, requiresOpenaiAuth: false })
    default: return reply({ data: [] })
  }
}

let buffer = ''
process.stdin.on('data', chunk => {
  buffer += chunk
  for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
    const line = buffer.slice(0, end)
    buffer = buffer.slice(end + 1)
    if (line.trim()) handle(JSON.parse(line))
  }
})
