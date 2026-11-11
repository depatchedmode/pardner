import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { requestJson } from './sync-client.js'
import { CLIENT_API } from './client-identity.js'
import { RECORDS, TASK_FIELDS, isRecordId, requireValue, resolveActor } from './workspace-schema.js'

export const HELP = `Pardner — local coordination for human and agent Actors

pardner [open] [--data directory] [--output-file private-launch-file]
    Open Pardner in your browser, starting your local client service if it is not running.
    Your client data lives in ~/.pardner/client unless you pass --data.

Client
pardner client serve [--data directory] [--http-port port] [--harness ID] [--name NAME] [--model MODEL] [--managed-by APP] [--public-url HTTPS_ORIGIN]
pardner client open [--data directory] [--output-file private-launch-file]
pardner client status
pardner client stop
pardner client identity --name NAME --email EMAIL --operation-id ID
pardner client create --name NAME --operation-id ID
pardner client list
pardner client show --project ID
pardner client people --project ID [--json]
pardner client revoke --project ID --kind member|machine|agent --id ID --operation-id ID
pardner client role --project ID --person PERSON_ID --role admin|member --operation-id ID
pardner client resume --project ID
pardner client leave --project ID --operation-id ID
pardner client profile --project ID --name NAME --email EMAIL --operation-id ID
pardner client export --project ID --output-file FILE
pardner client join --invitation-file FILE --operation-id ID [--wait SECONDS] [--harness ID --name NAME --model MODEL --managed-by APP]
pardner client invite --project ID --purpose human|agent|device --output-file FILE --operation-id ID [--role admin|member] [--person PERSON_ID]
pardner client invites --project ID [--limit N] [--offset N]
pardner client revoke-invite --project ID --invite INVITE_ID
pardner client requests --project ID
pardner client approve --project ID --request REQUEST_ID --code CODE
pardner client reject --project ID --request REQUEST_ID
pardner client agent-grant --project ID --output-file FILE [--harness ID]
pardner client operation --project ID --request JSON [--harness ID]

Agent and integration service (standalone)
pardner serve [--data directory] [--http-port port] [--ws-port port]
    One project on this computer for agents and scripts, with its own data. It serves no other
    machine, and its tasks do not appear in the client (pardner open), which keeps its own projects.
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
pardner issue link <task> owner/repo#number
pardner issue unlink <task> owner/repo#number --revisions '["revision",...]'
pardner commit --task id [--model name] [--session id] -- <git commit arguments>
pardner trace list|show|task [id]
pardner operation --request JSON
pardner status
pardner bridge run|status|approve-cleanup|revoke-cleanup --config /absolute/path/bridge.json [--token-file FILE]
pardner bridge inspect --endpoint ws://127.0.0.1:9001 --session THREAD_ID --worktree PATH
pardner bridge reconcile --config PATH --delivery ID --decision accepted|retry --evidence TEXT [--turn-id ID] [--token-file FILE]

Standalone commands are for agents and integrations; people use pardner open. Only the client hosts a
project for other machines or joins one: machines sync with their machine keys, never a shared token.
Standalone mutations require --actor (or PARDNER_ACTOR); client commands use their authenticated Actor.
An agent Actor of your client runs coordination commands with --token-file FILE, where FILE is the
credential from client agent-grant (or a file holding only the token). The token never appears in
arguments; --server defaults to the credential's apiBase and the Actor is the credential's own.
Supply --operation-id for retries.
All coordination results and errors are one JSON value on stdout; diagnostics use stderr.
--data (or PARDNER_DATA_DIR) selects the local connection file. --server and --token
override it. Expected revisions come from show; reads never mark comments seen.
`

const BOOLEAN_FLAGS = new Set(['json', 'help'])
const OPTIONS = new Set(['actor', 'agent', 'operation-id', 'request-id', 'request', 'data', 'server', 'token', 'token-file',
  'assignee', 'status', 'title', 'description', 'priority', 'tags', 'order', 'type', 'handle', 'kind', 'display-name',
  'revisions', 'to', 'message', 'field', 'value', 'receipts', 'ttl-ms', 'claim-token', 'task', 'limit', 'commit',
  'role', 'http-port', 'ws-port', 'model', 'session',
  'name', 'email', 'harness', 'managed-by', 'device-name', 'invitation-file', 'output-file', 'project', 'purpose', 'public-url', 'id',
  'config', 'delivery', 'decision', 'evidence', 'turn-id', 'endpoint', 'worktree', 'goal', 'vein',
  // Client membership commands: role and invite --person, approve --code, join --wait, invites --offset, revoke-invite --invite.
  'person', 'code', 'wait', 'offset', 'invite'])

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

/** Reads a private credential file: the JSON written by client agent-grant, or a file holding only a token. */
async function tokenFile(path) {
  const text = (await readFile(resolve(path), 'utf8')).trim()
  requireValue(text, '--token-file is empty')
  if (!text.startsWith('{')) return { token: text }
  const grant = json(text, '--token-file')
  requireValue(typeof grant.token === 'string' && grant.token, '--token-file JSON must contain a token')
  return { token: grant.token, actorId: grant.actorId, apiBase: grant.apiBase }
}

export async function localConnection(flags, env) {
  const directory = resolve(flags.data ?? env.PARDNER_DATA_DIR ?? '.pardner')
  requireValue(!(flags.token && flags['token-file']), 'Supply --token or --token-file, not both')
  const credential = flags['token-file'] ? await tokenFile(flags['token-file']) : {}
  let saved = {}
  try { saved = JSON.parse(await readFile(join(directory, 'connection.json'), 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return { directory, url: flags.server ?? credential.apiBase ?? env.PARDNER_LOCAL_URL ?? env.PARDNER_SYNC_SERVER ?? saved.httpUrl ?? `http://127.0.0.1:${env.PARDNER_HTTP_PORT ?? 8004}`,
    token: credential.token ?? flags.token ?? env.PARDNER_API_TOKEN ?? saved.token, actorId: credential.actorId }
}

/** A client project API base (…/pardner/client/v1/projects/ID/api) names its Actor through the client session. */
async function sessionActor(connection) {
  const match = new RegExp(`^(.*${CLIENT_API})/projects/([^/]+)/api/?$`).exec(connection.url)
  if (!match) return undefined
  const { projects } = await requestJson(match[1], '/session', { token: connection.token, closeConnection: true, signal: AbortSignal.timeout(10000) })
  return projects.find(project => project.id === decodeURIComponent(match[2]))?.actorId
}

export async function runCommand(args, env = process.env) {
  const { positional: p, flags: f, passthrough } = parseArguments(args)
  const [command, target, detail, extra] = p
  if (command === 'help' || f.help) return { help: HELP }
  if (!command || command === 'open' || command === 'client') {
    const { runClientCommand } = await import('./client-cli.js')
    return runClientCommand(command === 'client' ? target : 'open', f)
  }
  if (command === 'bridge') {
    const { runBridgeCommand } = await import('./agent-bridge.js')
    return runBridgeCommand(target, f)
  }
  const connection = await localConnection(f, env)
  if (command === 'serve') {
    const { startLocalService } = await import('./local-service.js')
    return startLocalService({ directory: connection.directory, flags: f, env })
  }
  // `actor` is what the caller named (it also filters activity); `selected` adds the Actor a client credential is bound to.
  const actor = f.actor ?? f.agent ?? env.PARDNER_ACTOR
  const selected = actor ?? connection.actorId ?? (f['token-file'] ? await sessionActor(connection) : undefined)
  const api = (path, body) => requestJson(connection.url, path, { token: connection.token, closeConnection: true,
    signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) })
  const context = taskId => {
    requireValue(taskId, 'Supply a task ID')
    return api(`/automerge/task/${encodeURIComponent(taskId)}/context${selected ? `?actor=${encodeURIComponent(selected)}` : ''}`)
  }
  const snapshot = async () => (await api('/automerge/doc')).doc
  const author = () => { requireValue(selected, 'Supply --actor or PARDNER_ACTOR', 'ACTOR_REQUIRED'); return selected }
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
    return { veins: Object.values((await snapshot()).veins).filter(vein => (!f.goal || vein.goalIds.includes(f.goal)) && (!f.status || vein.status === f.status)) }
  }
  if (command === 'goal' || command === 'vein') {
    const key = `${command}Id`
    // --goal is handled separately.
    const flags = RECORDS[command].fields.filter(field => field !== 'goalId')
    if (target === 'show') {
      requireValue(detail, `Supply a ${command} ID`)
      return api(`/automerge/${command}/${encodeURIComponent(detail)}/context`)
    }
    if (target === 'create' && command === 'goal') return execute('goal.create', fields(flags))
    if (target === 'create') {
      // --goal names an existing goal, or is the title of a goal to create; the server rejects a mistyped goal ID.
      requireValue(f.goal, 'Every vein pursues a goal: supply --goal with a goal ID or a new goal title', 'GOAL_REQUIRED')
      return execute('vein.create', { ...fields(flags), ...(isRecordId('goal', f.goal) ? { goalId: f.goal } : { goal: { title: f.goal } }) })
    }
    if (target === 'update') {
      const updates = { ...fields(flags), ...(command === 'vein' && f.goal !== undefined ? { goalId: f.goal } : {}) }
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
  if (command === 'issue') {
    requireValue(['link', 'unlink'].includes(target), 'Use issue link or issue unlink')
    const match = /^([^#\s]+)#(\d+)$/.exec(extra ?? '')
    requireValue(match, 'Name the issue as owner/repo#number')
    const issue = { taskId: detail, repository: match[1], number: Number(match[2]) }
    return execute(`task.${target}-issue`, target === 'link' ? issue : { ...issue, expectedRevisions: revisions() })
  }
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
      return api(`/automerge/deliveries${selected ? `?actor=${encodeURIComponent(selected)}` : ''}`)
    }
    if (target === 'claim-next') return api('/automerge/deliveries/claim', { actorId: author(), requestId: f['request-id'] ?? operationId,
      ...(f['ttl-ms'] ? { ttlMs: Number(f['ttl-ms']) } : {}) })
    if (target === 'ack' || target === 'deliver') return api('/automerge/deliveries/ack', { actorId: author(), mentionId: detail, claimToken: f['claim-token'] })
    if (target === 'release') return api('/automerge/deliveries/release', { actorId: author(), mentionId: detail, claimToken: f['claim-token'] })
    requireValue(false, 'Use mentions pending, claim-next, ack, or release')
  }
  if (command === 'trace' || command === 'commit') {
    const { runTraceCommand } = await import('./cli-trace.js')
    return runTraceCommand({ command, target, detail, flags: f, passthrough, actor: selected, context, execute })
  }
  requireValue(false, `Unknown command: ${command}`)
}
