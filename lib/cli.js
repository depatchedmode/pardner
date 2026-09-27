import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { requestJson } from './sync-client.js'
import { TASK_FIELDS, isRecordId, requireValue, resolveActor } from './workspace-schema.js'

const RECORD_FLAGS = ['title', 'description', 'status']

export const HELP = `Pardner — local coordination for human and agent Actors

pardner serve [--role hub|replica] [--data directory] [--hub URL] [--hub-ws URL]
pardner actors list
pardner actors register <id> --handle name --kind human|agent --actor author
pardner tasks [--assignee Actor] [--status status] [--vein vein] --json
pardner show <task> [--actor Actor] --json
pardner task create --title text [--description text] [--assignee Actor] [--vein vein[,vein]]
pardner update <task> --status status --revisions '{"status":["revision"]}'
pardner handoff <task> --to Actor --status review --message text --revisions JSON
pardner resolve <task> --field status --value review --revisions '["revision",...]'
pardner comment <task> text
pardner comments <task>
pardner comment-edit <comment> text --revisions '["revision"]'
pardner comment-delete <comment> --revisions '["revision"]'
pardner read <task> --receipts '[{"commentId":"id","revisionId":"revision"}]'
pardner mentions pending [--actor Actor]
pardner mentions claim-next --request-id id [--ttl-ms 30000]
pardner mentions ack <mention> --claim-token token
pardner mentions release <mention> --claim-token token
pardner goals [--status open|achieved|abandoned]
pardner goal create --title text [--description text]
pardner goal show <goal>
pardner goal update <goal> [--title text] [--description text] [--status status] --revisions JSON
pardner goal resolve <goal> --field status --value achieved --revisions '["revision",...]'
pardner veins [--goal goal] [--status open|proven|dead-end|abandoned]
pardner vein create --title text --goal <goal ID or new goal title> [--description text]
pardner vein show <vein>
pardner vein update <vein> [--title text] [--description text] [--status status] [--goal goal] --revisions JSON
pardner vein resolve <vein> --field goalId --value goal --revisions '["revision",...]'
pardner vein add <vein> <task>
pardner vein remove <vein> <task> --revisions '["revision",...]'
pardner branch <task> name
pardner branches <task>
pardner merge <branch> --revisions JSON
pardner activity [--task id] [--actor Actor] [--limit 20]
pardner diff <task>
pardner link-commit <task> --commit JSON
pardner commit --task id [--model name] [--session id] -- <git commit arguments>
pardner trace list|show|task [id]
pardner operation --request JSON
pardner status
pardner bridge run|status --config /absolute/path/bridge.json
pardner bridge inspect --endpoint ws://127.0.0.1:9001 --session THREAD_ID --worktree PATH
pardner bridge reconcile --config PATH --delivery ID --decision accepted|retry --evidence TEXT [--turn-id ID]

Mutations require --actor (or PARDNER_ACTOR). Supply --operation-id for retries.
All coordination results and errors are one JSON value on stdout; diagnostics use stderr.
--data (or PARDNER_DATA_DIR) selects the local connection file. --server and --token
override it. Expected revisions come from show; reads never mark comments seen.
`

const BOOLEAN_FLAGS = new Set(['json', 'help'])
const OPTIONS = new Set(['actor', 'agent', 'operation-id', 'request-id', 'request', 'data', 'server', 'token',
  'assignee', 'status', 'title', 'description', 'priority', 'tags', 'order', 'type', 'handle', 'kind', 'display-name',
  'revisions', 'to', 'message', 'field', 'value', 'receipts', 'ttl-ms', 'claim-token', 'task', 'limit', 'commit',
  'role', 'hub', 'hub-ws', 'hub-token', 'http-port', 'ws-port', 'model', 'session',
  'config', 'delivery', 'decision', 'evidence', 'turn-id', 'endpoint', 'worktree', 'goal', 'vein'])

export function parseArguments(args) {
  const positional = [], flags = {}, passthrough = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') { passthrough.push(...args.slice(i + 1)); break }
    if (!arg.startsWith('--')) { positional.push(arg); continue }
    const key = arg.slice(2)
    requireValue(BOOLEAN_FLAGS.has(key) || OPTIONS.has(key), `Unknown option: ${arg}`)
    requireValue(!Object.hasOwn(flags, key), `Repeated option: ${arg}`)
    if (BOOLEAN_FLAGS.has(key)) flags[key] = true
    else {
      requireValue(i + 1 < args.length && !args[i + 1].startsWith('--'), `Supply a value for ${arg}`)
      flags[key] = args[++i]
    }
  }
  return { positional, flags, passthrough }
}

function json(value, label) {
  requireValue(value !== undefined, `Supply ${label}`)
  try { return JSON.parse(value) } catch { throw Object.assign(new Error(`${label} must be valid JSON`), { code: 'INVALID_ARGUMENT' }) }
}

export async function localConnection(flags, env) {
  const directory = resolve(flags.data ?? env.PARDNER_DATA_DIR ?? '.pardner')
  let saved = {}
  try { saved = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return { directory, url: flags.server ?? env.PARDNER_LOCAL_URL ?? env.PARDNER_SYNC_SERVER ?? saved.httpUrl ?? `http://127.0.0.1:${env.PARDNER_HTTP_PORT ?? 8004}`,
    token: flags.token ?? env.PARDNER_API_TOKEN ?? saved.token }
}

export async function runCommand(args, env = process.env) {
  const { positional: p, flags: f, passthrough } = parseArguments(args)
  const [command, target, detail, extra] = p
  if (!command || command === 'help' || f.help) return { help: HELP }
  if (command === 'bridge') {
    const { runBridgeCommand } = await import('./agent-bridge.js')
    return runBridgeCommand(target, f)
  }
  const connection = await localConnection(f, env)
  if (command === 'serve') {
    const { startLocalService } = await import('./local-service.js')
    return startLocalService({ directory: connection.directory, flags: f, env })
  }
  const actor = f.actor ?? f.agent ?? env.PARDNER_ACTOR
  const api = (path, body) => requestJson(connection.url, path, { token: connection.token, closeConnection: true,
    signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) })
  const context = taskId => {
    requireValue(taskId, 'Supply a task ID')
    return api(`/automerge/task/${encodeURIComponent(taskId)}/context${actor ? `?actor=${encodeURIComponent(actor)}` : ''}`)
  }
  const snapshot = async () => (await api('/automerge/doc')).doc
  const author = () => { requireValue(actor, 'Supply --actor or PARDNER_ACTOR', 'ACTOR_REQUIRED'); return actor }
  const operationId = f['operation-id'] ?? randomUUID()
  const execute = (type, payload) => api('/automerge/operations', { type, actorId: author(), operationId, payload })
  const fields = (names = TASK_FIELDS) => Object.fromEntries(names.filter(field => f[field] !== undefined).map(field => {
    let value = f[field]
    if (field === 'tags') value = json(value, '--tags')
    if (field === 'order') value = Number(value)
    if (field === 'assignee' && value === 'none') value = null
    return [field, value]
  }))
  const revisions = () => json(f.revisions, '--revisions')

  if (command === 'status') return api('/automerge/status')
  if (command === 'operation') return api('/automerge/operations', json(f.request, '--request'))
  if (command === 'show') return context(target)
  if (command === 'comments') return { taskId: target, comments: (await context(target)).comments }
  if (command === 'tasks') {
    const doc = await snapshot()
    const assignee = f.assignee ? resolveActor(doc, f.assignee).id : null
    return { tasks: Object.values(doc.tasks).filter(task => (!assignee || task.assignee === assignee) && (!f.status || task.status === f.status)
      && (!f.vein || task.veinIds.includes(f.vein))), status: await api('/automerge/status') }
  }
  if (command === 'goals') {
    return { goals: Object.values((await snapshot()).goals).filter(goal => !f.status || goal.status === f.status) }
  }
  if (command === 'veins') {
    return { veins: Object.values((await snapshot()).veins).filter(vein => (!f.goal || vein.goalId === f.goal) && (!f.status || vein.status === f.status)) }
  }
  if (command === 'goal' || command === 'vein') {
    const key = `${command}Id`
    if (target === 'show') {
      requireValue(detail, `Supply a ${command} ID`)
      return api(`/automerge/${command}/${encodeURIComponent(detail)}/context`)
    }
    if (target === 'create' && command === 'goal') return execute('goal.create', fields(RECORD_FLAGS))
    if (target === 'create') {
      // --goal names an existing goal, or is the title of a goal to create; a mistyped goal ID is not a title.
      requireValue(f.goal, 'Every vein pursues a goal: supply --goal with a goal ID or a new goal title', 'GOAL_REQUIRED')
      const existing = Object.hasOwn((await snapshot()).goals, f.goal)
      requireValue(existing || !isRecordId('goal', f.goal), `Goal not found: ${f.goal}`, 'NOT_FOUND')
      return execute('vein.create', { ...fields(RECORD_FLAGS), ...(existing ? { goalId: f.goal } : { goal: { title: f.goal } }) })
    }
    if (target === 'update') {
      const updates = { ...fields(RECORD_FLAGS), ...(command === 'vein' && f.goal !== undefined ? { goalId: f.goal } : {}) }
      return execute(`${command}.update`, { [key]: detail, updates, expectedRevisions: revisions() })
    }
    if (target === 'resolve') return execute(`${command}.resolve`, { [key]: detail, field: f.field, value: f.value, expectedRevisions: revisions() })
    if (command === 'vein' && target === 'add') return execute('task.link-vein', { veinId: detail, taskId: extra })
    if (command === 'vein' && target === 'remove') return execute('task.unlink-vein', { veinId: detail, taskId: extra, expectedRevisions: revisions() })
    requireValue(false, command === 'goal' ? 'Use goal create, show, update, or resolve' : 'Use vein create, show, update, resolve, add, or remove')
  }
  if (command === 'actors' || command === 'agents') {
    if (!target || target === 'list') return { actors: Object.values((await snapshot()).actors) }
    requireValue(target === 'register', 'Use actors list or actors register')
    return execute('actor.register', { id: detail, handle: f.handle, kind: f.kind, ...(f['display-name'] ? { displayName: f['display-name'] } : {}) })
  }
  if (command === 'task' && target === 'create') {
    return execute('task.create', { ...fields(), ...(f.vein ? { veinIds: f.vein.split(',').map(value => value.trim()).filter(Boolean) } : {}) })
  }
  if (command === 'update') return execute('task.update', { taskId: target, updates: fields(), expectedRevisions: revisions() })
  if (command === 'handoff') return execute('task.handoff', { taskId: target, to: f.to, status: f.status, message: f.message, expectedRevisions: revisions() })
  if (command === 'resolve') {
    let value = f.value
    if (['tags', 'order'].includes(f.field)) value = json(value, '--value')
    else if (value === 'null') value = null
    return execute('task.resolve', { taskId: target, field: f.field, value, expectedRevisions: revisions() })
  }
  if (command === 'comment') return execute('comment.add', { taskId: target, text: detail })
  if (['comment-edit', 'comment-resolve', 'comment-delete'].includes(command)) {
    return execute(command.replace('-', '.'), { commentId: target, ...(command === 'comment-delete' ? {} : { text: detail }), expectedRevisions: revisions() })
  }
  if (command === 'read') return execute('read.mark', { taskId: target, comments: json(f.receipts, '--receipts') })
  if (command === 'branch') return execute('task.branch', { taskId: target, name: detail })
  if (command === 'merge') return execute('task.merge', { branchId: target, expectedRevisions: revisions() })
  if (command === 'branches') return { branches: Object.values((await snapshot()).tasks).filter(task => task.branch_of === target) }
  if (command === 'link-commit') return execute('task.link-commit', { taskId: target, commit: json(f.commit, '--commit') })
  if (command === 'diff') {
    const task = await context(target)
    return { taskId: target, changes: task.history.flatMap(event => event.changes.map(change => ({ ...change, actorId: event.actorId, operationId: event.operationId }))), conflicts: task.conflicts }
  }
  if (command === 'activity' || command === 'timeline') {
    const doc = await snapshot()
    const actorId = actor ? resolveActor(doc, actor).id : null
    const limit = f.limit === undefined ? 20 : Number(f.limit)
    requireValue(Number.isInteger(limit) && limit > 0, 'Supply a positive --limit')
    return { activity: Object.values(doc.operations).filter(event => (!f.task || event.taskId === f.task) && (!actorId || event.actorId === actorId))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.operationId.localeCompare(a.operationId)).slice(0, limit) }
  }
  if (command === 'mentions') {
    if (target === 'pending' || !target) {
      return api(`/automerge/deliveries${actor ? `?actor=${encodeURIComponent(actor)}` : ''}`)
    }
    if (target === 'claim-next') return api('/automerge/deliveries/claim', { actorId: author(), requestId: f['request-id'] ?? operationId,
      ...(f['ttl-ms'] ? { ttlMs: Number(f['ttl-ms']) } : {}) })
    if (target === 'ack' || target === 'deliver') return api('/automerge/deliveries/ack', { actorId: author(), mentionId: detail, claimToken: f['claim-token'] })
    if (target === 'release') return api('/automerge/deliveries/release', { actorId: author(), mentionId: detail, claimToken: f['claim-token'] })
    requireValue(false, 'Use mentions pending, claim-next, ack, or release')
  }
  if (command === 'trace' || command === 'commit') {
    const { runTraceCommand } = await import('./cli-trace.js')
    return runTraceCommand({ command, target, detail, flags: f, passthrough, actor, context, execute })
  }
  requireValue(false, `Unknown command: ${command}`)
}
