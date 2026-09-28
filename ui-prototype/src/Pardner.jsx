import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './pardner.css'
import { createOperationId } from './operation-id.js'
import { createConnection, loadConfiguration, websocketUrl } from './connection.js'
import PhoneAccess from './PhoneAccess.jsx'

const STATUSES = ['backlog', 'up-next', 'in-progress', 'review', 'completed', 'dead-end', 'abandoned']
const LABELS = {
  backlog: 'Backlog',
  'up-next': 'Up next',
  'in-progress': 'In progress',
  review: 'Review',
  completed: 'Completed',
  'dead-end': 'Dead end',
  abandoned: 'Abandoned',
  open: 'Open',
  proven: 'Proven',
  achieved: 'Achieved',
}
const GOAL_STATUSES = ['open', 'achieved', 'abandoned']
const labelActor = (actor) =>
  actor ? `${actor.displayName || actor.handle} · ${actor.kind}` : 'Unassigned'

function SelectActor({
  actors,
  value,
  onChange,
  label = 'Actor',
  optional = false,
  emptyLabel,
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel || (optional ? 'Unassigned' : 'Choose an Actor')}</option>
        {Object.values(actors).map((actor) => (
          <option key={actor.id} value={actor.id}>
            {labelActor(actor)}
          </option>
        ))}
      </select>
    </label>
  )
}
function ErrorNotice({ error, retry }) {
  if (!error) return null
  return (
    <div className="error" role="alert">
      <strong>{error.message}</strong>
      <p>
        {error.code === 'STALE_UPDATE'
          ? 'Your draft is preserved. Review the latest context before making a new edit.'
          : 'Your last confirmed data remains available.'}
      </p>
      {retry && <button onClick={retry}>Retry saved request</button>}
    </div>
  )
}
function SaveStatus({ status, connected, busy, heads }) {
  let text = 'Connecting to local service'
  if (busy) text = 'Saving locally…'
  else if (!connected) text = 'Local service disconnected'
  else if (status?.storageError) text = 'Local save failed'
  else if (!status?.savedLocally || status.heads?.join(',') !== heads) text = 'Saving locally…'
  else if (status.syncPending) text = 'Saved locally · waiting for hub'
  else text = 'Saved locally · synced'
  return (
    <span
      className="save-status"
      role="status"
      data-pending={Boolean(status?.syncPending)}
    >
      {text}
    </span>
  )
}

export default function Pardner() {
  const [config, setConfig] = useState(null)
  const [failure, setFailure] = useState(null)
  const reload = useCallback(async () => {
    const next = await loadConfiguration()
    setConfig(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    setFailure(null)
    return next
  }, [])
  useEffect(() => { reload().catch(setFailure) }, [reload])
  if (!config) return <main className="connection">
    <h1>Pardner</h1>
    <p role="status">{failure ? failure.message : 'Opening your workspace…'}</p>
    {failure && <><p>Check that the service is running. If the address changed, open Pair another device on the desktop.</p>
      <button onClick={() => reload().catch(setFailure)}>Retry connection</button></>}
  </main>
  return <Workspace key={config.workspaceId} config={config} reloadConfiguration={reload} />
}

function Workspace({ config, reloadConfiguration }) {
  const client = useMemo(() => createConnection(config), [config])
  // Let a scanned link validate stored authentication before normal requests begin.
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('pair') ? '' : client.credential())
  const [credential, setCredential] = useState('')
  const [pairCode, setPairCode] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('pair') ?? '')
  const [pairBusy, setPairBusy] = useState(false)
  const [phoneSetup, setPhoneSetup] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [doc, setDoc] = useState(null)
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const [actor, setActor] = useState(() => client.preferences().actor || '')
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState(() => client.preferences().view || 'board')
  const [filter, setFilter] = useState(() => client.preferences().filter || '')
  const [statusFilter, setStatusFilter] = useState(() => client.preferences().statusFilter || '')
  const [veinFilter, setVeinFilter] = useState(() => client.preferences().veinFilter || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmedOperation, setConfirmedOperation] = useState(null)
  const [pending, setPending] = useState(() => client.pending())
  const inflight = useRef(false)
  const docUpdates = useRef(0)
  const statusUpdates = useRef(0)
  const refreshGeneration = useRef(0)
  const [retryGeneration, setRetryGeneration] = useState(0)
  const pairDevice = useCallback(async code => {
    setPairBusy(true)
    setConnectionError(null)
    try {
      if (client.credential()) {
        try { await client.request('/automerge/status') }
        catch (failure) { if (failure.code !== 'AUTH_REQUIRED') throw failure }
      }
      if (!client.credential()) await client.pair(code)
      setPairCode('')
      setToken(client.credential())
    }
    catch (failure) { setConnectionError(failure) }
    finally { setPairBusy(false) }
  }, [client])
  useEffect(() => {
    const pairFromUrl = () => {
      const code = new URLSearchParams(window.location.hash.slice(1)).get('pair')
      if (code === null) return
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setPairCode(code)
      void pairDevice(code)
    }
    window.addEventListener('hashchange', pairFromUrl)
    pairFromUrl()
    return () => window.removeEventListener('hashchange', pairFromUrl)
  }, [pairDevice])

  useEffect(() => {
    try { client.savePreferences({ actor, filter, statusFilter, veinFilter, view }) } catch (failure) { setError(failure) }
  }, [client, actor, filter, statusFilter, veinFilter, view])
  const request = useCallback(async (path, body) => {
    try { return await client.request(path, body) } catch (failure) {
      if (failure.code === 'AUTH_REQUIRED' && !client.credential()) {
        setToken('')
        setDoc(null)
        setConnectionError(new Error('The service credential changed. Pair again or enter the current local service token.'))
      }
      if (failure.code === 'WORKSPACE_MISMATCH') await reloadConfiguration()
      throw failure
    }
  }, [client, reloadConfiguration])
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    const observedDoc = docUpdates.current
    const observedStatus = statusUpdates.current
    const [{ doc: next }, state] = await Promise.all([
      request('/automerge/doc'),
      request('/automerge/status'),
    ])
    if (next.workspaceId !== config.workspaceId) {
      await reloadConfiguration()
      throw Object.assign(new Error('The service workspace changed. Reopening the current workspace.'), { code: 'WORKSPACE_MISMATCH' })
    }
    if (generation !== refreshGeneration.current) return
    if (observedDoc === docUpdates.current) setDoc(next)
    if (observedStatus === statusUpdates.current) setStatus(state)
  }, [request, config.workspaceId, reloadConfiguration])
  useEffect(() => {
    if (!token || !config) return
    let stopped = false, socket, timer, openingTimer, attempt = 0, connecting = false
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15000))
    }
    const connect = async () => {
      if (stopped || connecting || socket?.readyState === WebSocket.OPEN) return
      connecting = true
      try {
        const currentConfig = await reloadConfiguration()
        if (stopped || currentConfig.workspaceId !== config.workspaceId) return
        await refresh()
        if (stopped) return
        const { ticket } = await request('/automerge/ws-ticket', {})
        if (stopped) return
        socket = new WebSocket(websocketUrl(currentConfig, location.href, ticket))
        openingTimer = setTimeout(() => socket?.close(), 10000)
        socket.onopen = () => {
          clearTimeout(openingTimer)
          connecting = false
          attempt = 0
          setConnected(true)
          setConnectionError(null)
        }
        socket.onmessage = (event) => {
          if (stopped) return
          try {
            const message = JSON.parse(event.data)
            if (message.doc && message.doc.workspaceId !== config.workspaceId) {
              socket.close()
              void reloadConfiguration().catch(setConnectionError)
              return
            }
            if (message.doc) { docUpdates.current++; setDoc(message.doc) }
            if (message.status) { statusUpdates.current++; setStatus(message.status) }
          } catch {
            setConnectionError(new Error('The service sent an unreadable update. Reconnecting…'))
            socket.close()
          }
        }
        socket.onclose = () => {
          clearTimeout(openingTimer)
          connecting = false
          if (stopped) return
          setConnected(false)
          setConnectionError(new Error('Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable.'))
          schedule()
        }
        socket.onerror = () => socket.close()
      } catch (failure) {
        connecting = false
        if (stopped) return
        setConnected(false)
        setConnectionError(failure)
        if (failure.code !== 'AUTH_REQUIRED') schedule()
      }
    }
    const resume = () => {
      if (document.visibilityState === 'hidden') return
      setRetryGeneration(value => value + 1)
    }
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    void connect()
    return () => {
      stopped = true
      refreshGeneration.current++
      clearTimeout(timer)
      clearTimeout(openingTimer)
      socket?.close()
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [token, config, refresh, request, reloadConfiguration, retryGeneration])
  useEffect(() => {
    if (doc && actor && !doc.actors[actor]) setActor('')
  }, [doc, actor])
  const submit = async (type, payload, replay = null) => {
    if (inflight.current) return null
    if (!actor && !replay) {
      setError({ message: 'Choose the Actor making this change.' })
      return null
    }
    if (pending && !replay) {
      setError({
        message: 'Resolve the saved request before starting another change.',
      })
      return null
    }
    let operation
    try {
      operation = replay || { operationId: createOperationId(), actorId: actor, type, payload }
      client.savePending(operation)
    } catch (failure) { setError(failure); return null }
    setPending(operation)
    inflight.current = true
    setBusy(true)
    setError(null)
    try {
      const receipt = await request('/automerge/operations', operation)
      setConfirmedOperation(operation)
      if (operation.type === 'task.create') {
        setCreating(false)
        setSelected(receipt.result.taskId)
      }
      client.savePending(null)
      setPending(null)
      await refresh()
      return receipt
    } catch (failure) {
      setError(failure)
      // Definitive validation errors did not mutate; a new decision may follow.
      if (
        [
          'STALE_UPDATE',
          'CONFLICT_REQUIRES_RESOLUTION',
          'INVALID_ARGUMENT',
          'AMBIGUOUS_ACTOR',
          'NOT_FOUND',
          'OPERATION_ID_REUSED',
        ].includes(failure.code)
      ) {
        try { client.savePending(null); setPending(null) } catch (storageFailure) { setError(storageFailure) }
      }
      return null
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }
  const forget = () => {
    try {
      client.forget()
      setToken('')
      setActor('')
      showBoard({})
      setPending(null)
      setDoc(null)
      setCredential('')
      setPairCode('')
      setConnectionError(null)
      setError(null)
    } catch (failure) { setError(failure) }
  }
  const connectWithToken = event => {
    event.preventDefault()
    setConnectionError(null)
    try {
      client.remember(credential)
      setToken(client.credential())
      setCredential('')
    } catch (failure) { setConnectionError(failure) }
  }
  const retryConnection = () => {
    if (!token) void pairDevice(pairCode)
    else setRetryGeneration(value => value + 1)
  }
  if (!token || !doc) return <main className="connection">
    <h1>Pardner</h1>
    <p>One workspace for human and agent Actors.</p>
    {!token && <>
      <form onSubmit={async event => {
        event.preventDefault()
        await pairDevice(pairCode)
      }}>
        <label>Pairing code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required disabled={pairBusy} value={pairCode} onChange={event => setPairCode(event.target.value)} /></label>
        <p className="muted">Open Pair another device on the desktop to get a code. This browser will remember your workspace. Use a trusted network: HTTP traffic is unencrypted.</p>
        <button className="primary" disabled={pairBusy}>{pairBusy ? 'Connecting…' : 'Pair this device'}</button>
      </form>
      <details open={config.canManageAccess}>
        <summary>Connect with a local service token</summary>
        <form onSubmit={connectWithToken}>
          <label>Local service token<input type="password" autoComplete="off" required value={credential} onChange={event => setCredential(event.target.value)} /></label>
          <p className="muted">Use the token from the service’s connection.json file. This browser remembers it until you forget the workspace or the secret changes.</p>
          <button className="primary" disabled={pairBusy}>Connect</button>
        </form>
      </details>
    </>}
    {token && <p role="status">Opening your local workspace…</p>}
    {connectionError && <div role="alert" className="error"><p>{connectionError.message}</p>
      <p>Check that the service is running. For a changed address, reopen Pair another device on the desktop.</p>
      <button disabled={pairBusy || (!token && !pairCode)} onClick={retryConnection}>Retry connection</button>
    </div>}
    <ErrorNotice error={error} />
    {token && <button onClick={forget}>Forget this workspace</button>}
  </main>
  const actors = doc.actors
  const veins = doc.veins || {}
  const goals = doc.goals || {}
  const activeVeinFilter = veins[veinFilter] ? veinFilter : ''
  const tasks = Object.values(doc.tasks).filter(
    (task) => (!filter || task.assignee === filter) && (!statusFilter || task.status === statusFilter)
      && (!activeVeinFilter || task.veinIds?.includes(activeVeinFilter)),
  )
  // Each board preset sets every filter, so a stale one never hides its tasks.
  const showBoard = ({ assignee = '', status = '', vein = '' }) => {
    setFilter(assignee); setStatusFilter(status); setVeinFilter(vein); setView('board')
  }
  const showVein = (veinId) => showBoard({ vein: veinId })
  const showingMyReviews = filter === actor && statusFilter === 'review'
  const changeActor = (value) => {
    setActor(value)
    if (showingMyReviews) setFilter(value)
  }
  return (
    <div className="app">
      <header>
        <div>
          <h1>Pardner</h1>
          <SaveStatus status={status} connected={connected} busy={busy} heads={doc.heads.join(',')} />
        </div>
        <div className="header-controls">
          <SelectActor actors={actors} value={actor} onChange={changeActor} />
          <button
            className="primary"
            disabled={!actor || busy || Boolean(pending)}
            onClick={() => {
              setCreating(true)
              setSelected(null)
            }}
          >
            New task
          </button>
        </div>
      </header>
      {phoneSetup && <PhoneAccess canManageAccess={config.canManageAccess} request={request} onClose={() => setPhoneSetup(false)} />}
      {connectionError && <div className="notice" role="status"><p>{connectionError.message}</p>
        <button onClick={retryConnection}>Retry connection</button>
      </div>}
      <ErrorNotice
        error={error}
        retry={pending && !busy ? () => submit(null, null, pending) : null}
      />
      {pending && !error && (
        <div className="notice">
          A request is awaiting confirmation.{' '}
          <button disabled={busy} onClick={() => submit(null, null, pending)}>
            Retry saved request
          </button>
        </div>
      )}
      {!Object.keys(actors).length && (
        <div className="notice">
          Register your first human or agent Actor with{' '}
          <code>pardner actors register</code> to begin.
        </div>
      )}
      <div className="workspace-actions">
        <button onClick={() => setPhoneSetup(true)}>Pair another device</button>
        <button disabled={busy} onClick={forget}>Forget this workspace</button>
      </div>
      <nav aria-label="Workspace views">
        <button
          aria-pressed={view === 'board'}
          onClick={() => setView('board')}
        >
          Tasks
        </button>
        <button
          aria-pressed={view === 'goals'}
          onClick={() => setView('goals')}
        >
          Goals
        </button>
        <button
          aria-pressed={view === 'activity'}
          onClick={() => setView('activity')}
        >
          Activity
        </button>
        <button disabled={!actor} aria-pressed={showingMyReviews} onClick={() => showBoard({ assignee: actor, status: 'review' })}>
          My reviews
        </button>
        <SelectActor
          label="Assigned to"
          emptyLabel="All Actors"
          actors={actors}
          value={filter}
          onChange={setFilter}
          optional
        />
        <label>Status filter<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(value => <option key={value} value={value}>{LABELS[value]}</option>)}
        </select></label>
        <label>Vein<select aria-label="Vein" value={activeVeinFilter} onChange={event => setVeinFilter(event.target.value)}>
          <option value="">All veins</option>
          {Object.values(veins).sort((a, b) => a.title.localeCompare(b.title)).map(vein =>
            <option key={vein.id} value={vein.id}>{vein.title}</option>)}
        </select></label>
      </nav>
      <main>
        {view === 'board' ? (
          <div className="board" data-filtered={Boolean(statusFilter)} style={{ '--columns': STATUSES.length }}>
            {STATUSES.filter(column => !statusFilter || column === statusFilter).map((column) => (
              <section
                className="column"
                key={column}
                aria-label={LABELS[column]}
              >
                <h2>
                  {LABELS[column]}{' '}
                  <span>
                    {tasks.filter((task) => task.status === column).length}
                  </span>
                </h2>
                {tasks
                  .filter((task) => task.status === column)
                  .sort(
                    (a, b) =>
                      a.priority.localeCompare(b.priority) || a.order - b.order,
                  )
                  .map((task) => (
                    <button
                      className="task-card"
                      key={task.id}
                      onClick={() => {
                        setSelected(task.id)
                        setCreating(false)
                      }}
                    >
                      <span className="priority">
                        {task.priority.toUpperCase()}
                      </span>
                      <strong>{task.title}</strong>
                      <span>{labelActor(actors[task.assignee])}</span>
                      {task.veinIds?.filter(veinId => veins[veinId]).map(veinId => (
                        <span className="vein-label" key={veinId}>{veins[veinId].title}</span>
                      ))}
                      {Object.keys(task.conflicts).length > 0 && (
                        <span className="conflict-label">
                          Conflicting edits
                        </span>
                      )}
                    </button>
                  ))}
                {!tasks.some((task) => task.status === column) && (
                  <p className="empty">No tasks here</p>
                )}
              </section>
            ))}
          </div>
        ) : view === 'goals' ? (
          <Goals goals={goals} veins={veins} showVein={showVein} />
        ) : (
          <section className="activity">
            <h2>Workspace activity</h2>
            {Object.values(doc.operations)
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
              .map((event) => (
                <article key={event.operationId}>
                  <p>
                    <strong>{labelActor(actors[event.actorId])}</strong> ·{' '}
                    {event.type}
                  </p>
                  {event.taskId && (
                    <button onClick={() => setSelected(event.taskId)}>
                      {doc.tasks[event.taskId]?.title || event.taskId}
                    </button>
                  )}
                  <time>{new Date(event.timestamp).toLocaleString()}</time>
                </article>
              ))}
          </section>
        )}
      </main>
      {creating && (
        <TaskForm
          actors={actors}
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={async (fields) => {
            const receipt = await submit('task.create', fields)
            if (receipt) {
              setCreating(false)
              setSelected(receipt.result.taskId)
            }
          }}
        />
      )}
      {selected && (
        <TaskDetail
          key={`${selected}:${actor}`}
          taskId={selected}
          actors={actors}
          actor={actor}
          heads={doc.heads.join(',')}
          request={request}
          confirmedOperation={confirmedOperation}
          submit={submit}
          busy={busy}
          status={status}
          connected={connected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function Goals({ goals, veins, showVein }) {
  const list = Object.values(goals).sort((a, b) =>
    GOAL_STATUSES.indexOf(a.status) - GOAL_STATUSES.indexOf(b.status) || a.created_at.localeCompare(b.created_at))
  const veinsByGoal = {}
  for (const vein of Object.values(veins).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    for (const goalId of vein.goalIds) (veinsByGoal[goalId] ??= []).push(vein)
  }
  return (
    <section className="goals" aria-label="Goals">
      <h2>Goals</h2>
      {!list.length && <p className="empty">
        No goals yet. Start a vein with <code>pardner vein create --title … --goal …</code>.
      </p>}
      {list.map(goal => {
        const goalVeins = veinsByGoal[goal.id] ?? []
        return (
          <article className="goal" key={goal.id} aria-label={goal.title}>
            <h3>{goal.title} <span className="record-status" data-status={goal.status}>{LABELS[goal.status]}</span></h3>
            {goal.description && <p className="muted">{goal.description}</p>}
            {Object.keys(goal.conflicts).length > 0 && <p className="conflict-label">Conflicting edits</p>}
            {!goalVeins.length && <p className="muted">No veins pursue this goal yet.</p>}
            <ul>
              {goalVeins.map(vein => (
                <li key={vein.id}>
                  <button onClick={() => showVein(vein.id)}>{vein.title}</button>
                  <span className="record-status" data-status={vein.status}>{LABELS[vein.status]}</span>
                  <span className="muted">{vein.taskIds.length} {vein.taskIds.length === 1 ? 'task' : 'tasks'}</span>
                  {vein.readyForVerdict && <span className="verdict-label">Ready for a verdict</span>}
                  {Object.keys(vein.conflicts).length > 0 && <span className="conflict-label">Conflicting edits</span>}
                </li>
              ))}
            </ul>
          </article>
        )
      })}
    </section>
  )
}

function TaskForm({
  actors,
  busy,
  onClose,
  onSubmit,
  initial,
  editing = false,
}) {
  const [fields, setFields] = useState(
    initial || {
      title: '',
      description: '',
      priority: 'p2',
      status: 'backlog',
      assignee: null,
      tags: [],
    },
  )
  const set = (field, value) =>
    setFields((current) => ({ ...current, [field]: value }))
  const [tags, setTags] = useState(fields.tags.join(', '))
  return (
    <section
      className={editing ? 'editor' : 'side-panel'}
      aria-label={editing ? 'Edit task' : 'New task'}
    >
      {!editing && (
        <div className="panel-heading">
          <h2>New task</h2>
          <button onClick={onClose}>Close</button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onSubmit({ ...fields, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) })
        }}
      >
        <label>
          Title
          <input
            required
            value={fields.title}
            onChange={(event) => set('title', event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={5}
            value={fields.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select
              aria-label="Status"
              value={fields.status}
              onChange={(event) => set('status', event.target.value)}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="Priority"
              value={fields.priority}
              onChange={(event) => set('priority', event.target.value)}
            >
              {['p0', 'p1', 'p2', 'p3'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <SelectActor
          label="Assignee"
          actors={actors}
          value={fields.assignee}
          onChange={(value) => set('assignee', value || null)}
          optional
        />
        <label>
          Tags, separated by commas
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {editing ? 'Save changes' : 'Create task'}
          </button>
          {editing && (
            <button type="button" onClick={onClose}>
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
function TaskDetail({
  taskId,
  actors,
  actor,
  heads,
  request,
  confirmedOperation,
  submit,
  busy,
  status,
  connected,
  onClose,
}) {
  const [context, setContext] = useState(null)
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState('')
  const [to, setTo] = useState('')
  const [handoffStatus, setHandoffStatus] = useState('review')
  const [handoffMessage, setHandoffMessage] = useState('')
  const [failure, setFailure] = useState(null)
  const [handoffBase, setHandoffBase] = useState(null)
  useEffect(() => {
    if (confirmedOperation?.payload.taskId !== taskId) return
    if (confirmedOperation.type === 'comment.add') {
      setMessage(current => current === confirmedOperation.payload.text ? '' : current)
    }
    if (confirmedOperation.type === 'task.handoff') {
      setHandoffMessage(current => current === confirmedOperation.payload.message ? '' : current)
      setHandoffBase(null)
    }
  }, [confirmedOperation, taskId])
  useEffect(() => {
    let stale = false
    request(
      `/automerge/task/${taskId}/context${actor ? `?actor=${encodeURIComponent(actor)}` : ''}`,
    )
      .then((value) => {
        if (!stale) {
          setContext(value)
          setFailure(null)
        }
      })
      .catch((error) => {
        if (!stale) setFailure(error)
      })
    return () => {
      stale = true
    }
  }, [taskId, actor, heads, request])
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  if (!context)
    return (
      <aside className="side-panel">
        <button onClick={onClose}>Close</button>
        <p role="status">Opening task…</p>
        <ErrorNotice error={failure} />
      </aside>
    )
  const { task, comments, history, conflicts, revisions } = context
  const canWrite = Boolean(actor) && !busy
  const handoffRevisions = { assignee: revisions.assignee, status: revisions.status }
  const handoffStale = handoffBase && JSON.stringify(handoffBase) !== JSON.stringify(handoffRevisions)
  return (
    <aside className="side-panel" aria-label="Task details">
      <div className="panel-heading">
        <h2>{task.title}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <SaveStatus status={status} connected={connected} busy={busy} heads={heads} />
      <p className="muted">
        {labelActor(actors[task.assignee])} · {LABELS[task.status]} ·{' '}
        {task.priority.toUpperCase()}
      </p>
      {context.veins?.length > 0 && (
        <p className="muted">Veins: {context.veins.map(vein => `${vein.title} (${LABELS[vein.status]})`).join(', ')}</p>
      )}
      <ErrorNotice error={failure} />
      {draft ? (
        <TaskForm
          editing
          actors={actors}
          busy={busy}
          initial={draft.fields}
          onClose={() => setDraft(null)}
          onSubmit={async (fields) => {
            const updates = Object.fromEntries(
              Object.entries(fields).filter(
                ([key, value]) =>
                  JSON.stringify(value) !== JSON.stringify(draft.fields[key]),
              ),
            )
            if (!Object.keys(updates).length) {
              setDraft(null)
              return
            }
            const receipt = await submit('task.update', {
              taskId,
              updates,
              expectedRevisions: Object.fromEntries(
                Object.keys(updates).map((key) => [key, draft.revisions[key]]),
              ),
            })
            if (receipt) setDraft(null)
          }}
        />
      ) : (
        <>
          <div className="markdown">
            <Markdown remarkPlugins={[remarkGfm]}>
              {task.description || 'No description yet.'}
            </Markdown>
          </div>
          <button
            disabled={!canWrite}
            onClick={() =>
              setDraft({
                fields: Object.fromEntries(
                  [
                    'title',
                    'description',
                    'status',
                    'priority',
                    'assignee',
                    'tags',
                  ].map((field) => [field, task[field]]),
                ),
                revisions,
              })
            }
          >
            Edit task
          </button>
        </>
      )}
      {Object.entries(conflicts).map(([field, choices]) => (
        <section className="conflict" key={field}>
          <h3>Resolve {field}</h3>
          <p>Both edits are preserved. Choose the value to keep.</p>
          {choices.map((choice) => (
            <div key={choice.operationId}>
              <strong>{labelActor(actors[choice.actorId])}</strong>
              <p>
                {typeof choice.value === 'string'
                  ? choice.value
                  : JSON.stringify(choice.value)}
              </p>
              <button
                disabled={!canWrite}
                onClick={() =>
                  submit('task.resolve', {
                    taskId,
                    field,
                    value: choice.value,
                    expectedRevisions: revisions[field],
                  })
                }
              >
                Keep this {field}
              </button>
            </div>
          ))}
        </section>
      ))}
      <section>
        <h3>Hand off work</h3>
        <form
          onFocusCapture={() => {
            setHandoffBase(current => current ?? handoffRevisions)
          }}
          onSubmit={async (event) => {
            event.preventDefault()
            const receipt = await submit('task.handoff', {
              taskId,
              to,
              status: handoffStatus,
              message: handoffMessage,
              expectedRevisions: handoffBase,
            })
            if (receipt) {
              setHandoffMessage(current => current === handoffMessage ? '' : current)
              setHandoffBase(null)
            }
          }}
        >
          {handoffStale && (
            <div className="notice" role="status">
              <p>Assignment or status changed while you were preparing this handoff. Your draft is preserved.</p>
              <p>Current task: {labelActor(actors[task.assignee])} · {LABELS[task.status]}.</p>
              <button type="button" disabled={!canWrite} onClick={() => setHandoffBase(handoffRevisions)}>
                Use latest task details
              </button>
            </div>
          )}
          <SelectActor
            label="Recipient"
            actors={actors}
            value={to}
            onChange={setTo}
          />
          <label>
            Handoff status
            <select
              value={handoffStatus}
              onChange={(event) => setHandoffStatus(event.target.value)}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Handoff message
            <textarea
              aria-label="Handoff message"
              required
              value={handoffMessage}
              onChange={(event) => setHandoffMessage(event.target.value)}
            />
          </label>
          <button disabled={!canWrite || !to || handoffStale}>Hand off</button>
        </form>
      </section>
      <section>
        <div className="section-heading">
          <h3>
            Comments <span>{comments.length}</span>
          </h3>
          <button
            disabled={!canWrite || !context.unreadCount}
            onClick={() =>
              submit('read.mark', {
                taskId,
                comments: comments.flatMap((comment) =>
                  comment.revisionIds.map((revisionId) => ({
                    commentId: comment.id,
                    revisionId,
                  })),
                ),
              })
            }
          >
            Mark displayed comments read
          </button>
        </div>
        <p className="muted">
          {context.unreadCount} unread for{' '}
          {actors[actor]?.handle || 'this Actor'}
        </p>
        {comments.map((comment) => (
          <article className="comment" key={comment.id}>
            <strong>{labelActor(actors[comment.actorId])}</strong>
            <time>{new Date(comment.timestamp).toLocaleString()}</time>
            <div className="markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{comment.content}</Markdown>
            </div>
            {comment.conflicts.map((choice) => (
              <div className="conflict" key={choice.operationId}>
                <strong>{labelActor(actors[choice.actorId])}</strong>
                <p>{choice.value}</p>
                <button
                  disabled={!canWrite}
                  onClick={() =>
                    submit('comment.resolve', {
                      commentId: comment.id,
                      text: choice.value,
                      expectedRevisions: comment.revisionIds,
                    })
                  }
                >
                  Keep this comment
                </button>
              </div>
            ))}
          </article>
        ))}
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const receipt = await submit('comment.add', {
              taskId,
              text: message,
            })
            if (receipt) setMessage(current => current === message ? '' : current)
          }}
        >
          <label>
            Comment
            <textarea
              aria-label="Comment"
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Share progress or mention an Actor with @handle"
            />
          </label>
          <button className="primary" disabled={!canWrite}>
            Add comment
          </button>
        </form>
      </section>
      <section>
        <h3>Evidence</h3>
        {context.evidence.length ? (
          context.evidence.map((commit, index) => (
            <article key={`${commit.hash}:${index}`}>
              <code>{commit.hash}</code>
              <p>{commit.message}</p>
            </article>
          ))
        ) : (
          <p className="muted">No commit evidence linked yet.</p>
        )}
      </section>
      <section>
        <h3>History</h3>
        {history.map((event) => (
          <article className="history" key={event.operationId}>
            <strong>{labelActor(actors[event.actorId])}</strong> · {event.type}
            <time>{new Date(event.timestamp).toLocaleString()}</time>
            {event.changes.map((change) => (
              <p key={change.field}>
                {change.field}: {JSON.stringify(change.old)} →{' '}
                {JSON.stringify(change.new)}
              </p>
            ))}
          </article>
        ))}
      </section>
    </aside>
  )
}
