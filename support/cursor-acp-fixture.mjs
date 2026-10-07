// Fake protocol peer for process tests. This is never real provider qualification.
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
const config = JSON.parse(readFileSync('fixture.json', 'utf8'))
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`)
const update = (sessionId, value) => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: value } })
const respond = (id, result) => send({ jsonrpc: '2.0', id, result })
const exitedPids = () => existsSync('exits.jsonl') ? readFileSync('exits.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line).pid) : []
appendFileSync('starts.jsonl', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), pid: process.pid, priorExitedPids: exitedPids() }) + '\n')
if (config.termDelayMs) process.on('SIGTERM', () => setTimeout(() => {
  appendFileSync('exits.jsonl', JSON.stringify({ pid: process.pid }) + '\n')
  process.exit(0)
}, config.termDelayMs))
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  appendFileSync('calls.jsonl', line + '\n')
  const { id, method, params } = message
  if (method === 'initialize') {
    if (config.initialize === 'hang') return
    if (config.initialize === 'malformed') { process.stdout.write('not-json\n'); return }
    if (config.initialize === 'wrong-id') { respond('unknown', {}); return }
    if (config.initialize === 'oversized') { process.stdout.write('x'.repeat(2048)); return }
    if (config.initialize === 'exit') { process.exit(1) }
    respond(id, { protocolVersion: config.protocolVersion ?? 1, agentCapabilities: { loadSession: config.loadSession ?? true }, authMethods: [{ id: 'cursor_login', name: 'Cursor login' }] })
  }
  if (method === 'session/load') {
    if (config.loadError) { send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'fixture authentication required' } }); return }
    for (const entry of (config.replay ?? (existsSync('history.json') ? JSON.parse(readFileSync('history.json', 'utf8')) : []))) update(params.sessionId, { sessionUpdate: 'user_message_chunk', ...entry })
    if (config.modeViaUpdate) update(params.sessionId, { sessionUpdate: 'current_mode_update', currentModeId: config.modeViaUpdate })
    if (config.blockOnLoad) send({ jsonrpc: '2.0', id: 'server-request', method: config.blockOnLoad, params: { sessionId: params.sessionId } })
    if (config.load === 'hang') return
    respond(id, { ...(config.modeMissing ? {} : { modes: { currentModeId: config.mode ?? 'ask', availableModes: [{ id: 'ask', name: 'Ask' }] } }), ...(config.wrongSession ? { sessionId: 'another-session' } : {}) })
  }
  if (method === 'session/prompt') {
    const history = existsSync('history.json') ? JSON.parse(readFileSync('history.json', 'utf8')) : []
    history.push({ messageId: `native-message-${history.length + 1}`, content: { type: 'text', text: params.prompt[0].text } })
    writeFileSync('history.json', JSON.stringify(history))
    if (config.loseReply) process.exit(1)
    if (config.promptBlock) { send({ jsonrpc: '2.0', id: 'server-request', method: config.promptBlock, params: { sessionId: params.sessionId } }); return }
    if (config.changeMode) update(params.sessionId, { sessionUpdate: 'current_mode_update', currentModeId: config.changeMode })
    if (config.updateWrongSession) update('another-session', { sessionUpdate: 'current_mode_update', currentModeId: 'ask' })
    if (config.echoNonce) update(params.sessionId, { sessionUpdate: 'agent_message_chunk', content: {
      type: 'text', text: params.prompt[0].text.match(/qualification nonce: ([^.]+)\./)?.[1] ?? 'missing nonce',
    } })
    setTimeout(() => respond(id, { stopReason: config.stopReason ?? 'end_turn' }), config.promptDelayMs ?? 0)
  }
})
