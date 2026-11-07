import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActorMarkdown from './ActorMarkdown.jsx'
import './pardner.css'
import { createOperationId } from './operation-id.js'
import { createConnection, loadConfiguration, websocketUrl } from './connection.js'
import PhoneAccess from './PhoneAccess.jsx'
import ControlPane from './ControlPane.jsx'
import ClientApp from './ClientApp.jsx'
import { AvatarStack } from './Avatar.jsx'
import { isNewComment } from './comments.js'
import { defaultHandoffStatus } from './handoff.js'
import { mentionHint, remarkMentionChips, unmatchedHandles } from './mentions.js'
import { STATUS_LABELS as LABELS, describeEvent, eventGroup, sortEvents } from './events.js'

const STATUSES = ['backlog', 'up-next', 'in-progress', 'review', 'completed', 'dead-end', 'abandoned']
const GOAL_STATUSES = ['open', 'achieved', 'abandoned']
const ACTIVITY_SHOWS = [
  ['changes', 'All changes'], ['status', 'Status changes and handoffs'], ['comments', 'Comments'],
  ['commits', 'Commits and branches'], ['plans', 'Goals and veins'], ['actors', 'Actors registered'], ['reads', 'Read receipts'],
]
const ACTIVITY_PAGE = 100
const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate())
function dayHeading(date, now = new Date()) {
  const days = Math.round((dayStart(now) - dayStart(date)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
// True when `event` sorts at or after `cutoff` in newest-first order.
const atOrAfter = (event, cutoff) => {
  const a = Date.parse(event.timestamp) || 0
  const b = Date.parse(cutoff.timestamp) || 0
  return a !== b ? a > b : String(event.operationId) >= String(cutoff.operationId)
}
// Task details operations whose errors render above that form's submit button.
const FORM_SLOTS = ['task.update', 'task.handoff', 'comment.add']
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
function MarkdownBody({ children, extraPlugins = [] }) {
  return (
    <div className="markdown">
      <ActorMarkdown extraPlugins={extraPlugins}>{children}</ActorMarkdown>
    </div>
  )
}
// Buttons are type="button": the notice can sit inside the form that failed.
function ErrorNotice({ error, retry, onDismiss }) {
  if (!error) return null
  return (
    <div className="error" role="alert">
      <strong>{error.message}</strong>
      <p>
        {error.code === 'STALE_UPDATE'
          ? 'Your draft is preserved. Review the latest context before making a new edit.'
          : 'Your last confirmed data remains available.'}
      </p>
      {(retry || onDismiss) && <div className="actions">
        {retry && <button type="button" onClick={retry}>Retry saved request</button>}
        {onDismiss && <button type="button" onClick={onDismiss}>Dismiss</button>}
      </div>}
    </div>
  )
}
// Focuses the returned ref's control once it is connected and enabled again,
// after `request()` is called. Used to keep focus off <body> when a control
// unmounts or disables itself while a request runs.
function useRefocus() {
  const ref = useRef(null)
  const wanted = useRef(false)
  useEffect(() => {
    if (!wanted.current) return
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      // Only recover lost focus: never take it back from a control the user
      // has moved to while the request was running.
      if (active && active !== document.body) {
        wanted.current = false
        return
      }
      const element = ref.current
      if (!element?.isConnected || element.disabled) return
      wanted.current = false
      element.focus()
    })
    return () => cancelAnimationFrame(frame)
  })
  return [ref, useCallback(() => { wanted.current = true }, [])]
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

// One event as a plain sentence. Activity passes handlers so subjects become
// buttons; History passes none and stays plain text.
function EventRow({ event, lookups, within, onTask, onVein, onGoal, formatTime, ...articleProps }) {
  const description = describeEvent(event, lookups, { within })
  const when = new Date(event.timestamp)
  const handlers = { task: onTask, vein: onVein, goal: onGoal }
  return (
    <article className="event" title={event.type} {...articleProps}>
      <p className="event-line">
        <strong>{description.actor}</strong>
        {description.parts.map((part, index) => {
          if (typeof part === 'string') return part
          if (part.status) return <span key={index} className="record-status" data-status={part.status}>{part.label}</span>
          const open = handlers[part.subject]
          if (!open || part.missing) return part.label
          return <button key={index} type="button" className="subject" {...(part.subject === 'task' ? { 'data-task-id': part.id } : {})}
            onClick={click => open(click.currentTarget, part.id)}>{part.label}</button>
        })}
      </p>
      {description.detail && <p className="event-detail">{description.detail}</p>}
      {description.excerpt && <p className="event-detail">{description.excerpt}</p>}
      <time dateTime={when.toISOString()} title={when.toLocaleString()}>{formatTime(when)}</time>
    </article>
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
  if (config.mode === 'client') return <ClientApp config={config} />
  return <Workspace key={config.workspaceId} config={config} reloadConfiguration={reload} />
}

/**
 * The board. Standalone services authenticate with a token or pairing code; in
 * local client mode `session` is supplied, the cookie authenticates, and the
 * author is the signed-in Actor (there is no author picker).
 */
export function Workspace({ config, reloadConfiguration, session = null }) {
  const client = useMemo(() => createConnection(config), [config])
  // The session prop changes every render (presence, header); effects depend only on the mode.
  const sessionMode = Boolean(session)
  const sessionRef = useRef(session)
  sessionRef.current = session
  // Task panels open below the client header so people, Invite and the project stay reachable.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const element = headerRef.current
    if (!sessionMode || !element || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => setHeaderHeight(Math.ceil(element.getBoundingClientRect().height)))
    observer.observe(element)
    return () => observer.disconnect()
  })
  // Let a scanned link validate stored authentication before normal requests begin.
  const [token, setToken] = useState(() => !session && new URLSearchParams(window.location.hash.slice(1)).has('pair') ? '' : client.credential())
  const [credential, setCredential] = useState('')
  const [pairCode, setPairCode] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('pair') ?? '')
  const [pairBusy, setPairBusy] = useState(false)
  const [phoneSetup, setPhoneSetup] = useState(false)
  // { failure, source }: source names the form that failed ('pair' / 'token') or 'open'.
  const [connectionError, setConnectionError] = useState(null)
  // Failures from before a Forget belong to a workspace the user already left.
  const connectionGeneration = useRef(0)
  const credentialSource = useRef(config.canManageAccess ? 'token' : 'pair')
  const connectionAlert = useRef(null)
  const failConnection = useCallback((failure, source, generation = connectionGeneration.current) => {
    if (generation === connectionGeneration.current) setConnectionError({ failure, source })
  }, [])
  const [doc, setDoc] = useState(null)
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const [actor, setActor] = useState(() => session ? config.actorId : client.preferences().actor || '')
  const [selected, setSelected] = useState(() => session ? client.preferences().selected || null : null)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState(() => client.preferences().view || 'board')
  const [filter, setFilter] = useState(() => client.preferences().filter || '')
  const [statusFilter, setStatusFilter] = useState(() => client.preferences().statusFilter || '')
  const [veinFilter, setVeinFilter] = useState(() => client.preferences().veinFilter || '')
  const [activityActor, setActivityActor] = useState('')
  const [activityShow, setActivityShow] = useState('changes')
  // { timestamp, operationId } of the oldest rendered row; rows at or after it always render.
  const [activityCutoff, setActivityCutoff] = useState(null)
  const [error, setError] = useState(null)
  // { type, taskId } of the operation that failed, so its message renders beside that form.
  const [errorOrigin, setErrorOrigin] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmedOperation, setConfirmedOperation] = useState(null)
  const [pending, setPending] = useState(() => client.pending())
  const inflight = useRef(false)
  const docUpdates = useRef(0)
  const statusUpdates = useRef(0)
  const refreshGeneration = useRef(0)
  const [retryGeneration, setRetryGeneration] = useState(0)
  // Focus: the control that opened the current panel ({ taskId } for a card, else
  // the element), and which open has already moved focus to its heading.
  const opener = useRef(null)
  const openCount = useRef(0)
  const headingFocusedFor = useRef(0)
  const newTaskButton = useRef(null)
  const viewNav = useRef(null)
  const panelWasOpen = useRef(false)
  const openPanel = (from, open) => {
    opener.current = from
    openCount.current++
    open()
  }
  const claimHeadingFocus = useCallback(() => {
    if (headingFocusedFor.current === openCount.current) return false
    headingFocusedFor.current = openCount.current
    return true
  }, [])
  const pairDevice = useCallback(async code => {
    const generation = connectionGeneration.current
    credentialSource.current = 'pair'
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
    catch (failure) { failConnection(failure, 'pair', generation) }
    finally { setPairBusy(false) }
  }, [client, failConnection])
  useEffect(() => {
    if (sessionMode) return
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
  }, [pairDevice, sessionMode])

  useEffect(() => {
    try {
      client.savePreferences(sessionMode ? { filter, statusFilter, veinFilter, view, selected }
        : { actor, filter, statusFilter, veinFilter, view })
    } catch (failure) { setError(failure) }
  }, [client, sessionMode, actor, filter, statusFilter, veinFilter, view, selected])
  const onFocusChange = session?.onFocusChange
  useEffect(() => { onFocusChange?.(selected ? [selected] : []) }, [onFocusChange, selected])
  const requestedTask = session?.requestedTask
  // A task opened from a profile is a new open: focus its heading; closing falls back to New task.
  useEffect(() => {
    if (!requestedTask) return
    opener.current = null
    openCount.current++
    setSelected(requestedTask.taskId)
    setCreating(false)
  }, [requestedTask])
  const onTasks = session?.onTasks
  useEffect(() => { if (doc) onTasks?.(doc.tasks) }, [onTasks, doc])
  const request = useCallback(async (path, body) => {
    const generation = connectionGeneration.current
    try { return await client.request(path, body) } catch (failure) {
      if (failure.code === 'AUTH_REQUIRED' && sessionRef.current) sessionRef.current.onAuthLost()
      else if (failure.code === 'AUTH_REQUIRED' && !client.credential()) {
        setToken('')
        setDoc(null)
        failConnection(new Error('The service credential changed. Pair again or enter the current local service token.'), credentialSource.current, generation)
      }
      if (failure.code === 'WORKSPACE_MISMATCH') await reloadConfiguration()
      throw failure
    }
  }, [client, reloadConfiguration, failConnection])
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
              void reloadConfiguration().catch(failure => { if (!stopped) failConnection(failure, 'open') })
              return
            }
            if (message.doc) { docUpdates.current++; setDoc(message.doc) }
            if (message.status) { statusUpdates.current++; setStatus(message.status) }
          } catch {
            failConnection(new Error('The service sent an unreadable update. Reconnecting…'), 'open')
            socket.close()
          }
        }
        socket.onclose = () => {
          clearTimeout(openingTimer)
          connecting = false
          if (stopped) return
          setConnected(false)
          failConnection(new Error('Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable.'), 'open')
          schedule()
        }
        socket.onerror = () => socket.close()
      } catch (failure) {
        connecting = false
        if (stopped) return
        setConnected(false)
        failConnection(failure, failure.code === 'AUTH_REQUIRED' ? credentialSource.current : 'open')
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
  }, [token, config, refresh, request, reloadConfiguration, retryGeneration, failConnection])
  useEffect(() => {
    connectionAlert.current?.scrollIntoView({ block: 'nearest' })
  }, [connectionError])
  useEffect(() => {
    if (!sessionMode && doc && actor && !doc.actors[actor]) setActor('')
  }, [doc, actor, sessionMode])
  // Once a panel unmounts, return focus to its opener, else New task, else the current view's button.
  useEffect(() => {
    const open = Boolean(selected || creating)
    if (panelWasOpen.current && !open) {
      const from = opener.current
      const card = from?.taskId && document.querySelector(`.task-card[data-task-id="${CSS.escape(from.taskId)}"]`)
      const usable = element => element?.isConnected && !element.disabled
      ;[card || from, newTaskButton.current, viewNav.current?.querySelector('[aria-pressed="true"]')].find(usable)?.focus()
    }
    panelWasOpen.current = open
  }, [selected, creating])
  const activityEvents = useMemo(() => {
    const actorId = doc?.actors?.[activityActor] ? activityActor : ''
    return sortEvents(Object.values(doc?.operations ?? {}).filter(event => {
      if (actorId && event.actorId !== actorId) return false
      const group = eventGroup(event)
      return activityShow === 'changes' ? group !== 'reads' : group === activityShow
    }))
  }, [doc?.operations, doc?.actors, activityActor, activityShow])
  const activityFocus = useRef(null)
  useEffect(() => {
    if (!activityCutoff && activityEvents.length) {
      const last = activityEvents[Math.min(ACTIVITY_PAGE, activityEvents.length) - 1]
      setActivityCutoff({ timestamp: last.timestamp, operationId: last.operationId })
    }
  }, [activityCutoff, activityEvents])
  useEffect(() => {
    const id = activityFocus.current
    activityFocus.current = null
    if (id) document.querySelector(`.event[data-operation-id="${CSS.escape(id)}"]`)?.focus()
  }, [activityCutoff])
  // A subject that switches views asks for focus once the new view has rendered.
  const focusAfterView = useRef(null)
  useEffect(() => {
    const focus = focusAfterView.current
    focusAfterView.current = null
    focus?.()
  }, [view])
  const submit = async (type, payload, replay = null) => {
    if (inflight.current) return null
    setErrorOrigin({ type: replay?.type ?? type, taskId: (replay?.payload ?? payload)?.taskId })
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
      if (operation.type === 'task.create') openPanel({ taskId: receipt.result.taskId }, () => {
        setCreating(false)
        setSelected(receipt.result.taskId)
      })
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
  // Each board preset sets every filter, so a stale one never hides its tasks.
  // Declared before the connection screen's early return: forget() uses it there too.
  const showBoard = ({ assignee = '', status = '', vein = '' }) => {
    setFilter(assignee); setStatusFilter(status); setVeinFilter(vein); setView('board')
  }
  const forget = () => {
    try {
      connectionGeneration.current++
      client.forget()
      setToken('')
      setActor('')
      setActivityActor('')
      setActivityShow('changes')
      setActivityCutoff(null)
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
    credentialSource.current = 'token'
    setConnectionError(null)
    try {
      client.remember(credential)
      setToken(client.credential())
      setCredential('')
    } catch (failure) { failConnection(failure, 'token') }
  }
  const retryConnection = () => {
    if (!token) void pairDevice(pairCode)
    else setRetryGeneration(value => value + 1)
  }
  if (session && !doc) return <main className="connection">
    <h1>Pardner</h1>
    <p role="status">{connectionError ? 'The project board isn’t reachable yet.' : 'Opening the project board…'}</p>
    {connectionError && <div role="alert" className="error" ref={connectionAlert}><p>{connectionError.failure.message}</p>
      <button type="button" onClick={retryConnection}>Retry connection</button>
    </div>}
  </main>
  if (!token || !doc) {
    // While opening, the error sits under the status; otherwise inside the form that failed.
    const connectionSlot = !connectionError ? null : token ? 'open' : connectionError.source === 'token' ? 'token' : 'pair'
    const connectionNotice = connectionError && <div role="alert" className="error" ref={connectionAlert}><p>{connectionError.failure.message}</p>
      <p>Check that the service is running. For a changed address, reopen Pair another device on the desktop.</p>
      <button type="button" disabled={pairBusy || (!token && !pairCode)} onClick={retryConnection}>Retry connection</button>
    </div>
    return <main className="connection">
    <h1>Pardner</h1>
    <p>One workspace for human and agent Actors.</p>
    {!token && <>
      <form onSubmit={async event => {
        event.preventDefault()
        await pairDevice(pairCode)
      }}>
        <label>Pairing code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required autoFocus={!config.canManageAccess} disabled={pairBusy} value={pairCode} onChange={event => { setPairCode(event.target.value); setConnectionError(null) }} /></label>
        <p className="muted">Open Pair another device on the desktop to get a code. This browser will remember your workspace. Use a trusted network: HTTP traffic is unencrypted.</p>
        {connectionSlot === 'pair' && connectionNotice}
        <button className="primary" disabled={pairBusy}>{pairBusy ? 'Connecting…' : 'Pair this device'}</button>
      </form>
      <details open={config.canManageAccess}>
        <summary>Connect with a local service token</summary>
        <form onSubmit={connectWithToken}>
          <label>Local service token<input type="password" autoComplete="off" required autoFocus={config.canManageAccess} value={credential} onChange={event => { setCredential(event.target.value); setConnectionError(null) }} /></label>
          <p className="muted">Use the token from the service’s connection.json file. This browser remembers it until you forget the workspace or the secret changes.</p>
          {connectionSlot === 'token' && connectionNotice}
          <button className="primary" disabled={pairBusy}>Connect</button>
        </form>
      </details>
    </>}
    {token && <p role="status">Opening your local workspace…</p>}
    {connectionSlot === 'open' && connectionNotice}
    <ErrorNotice error={error} />
    {token && <button onClick={forget}>Forget this workspace</button>}
  </main>
  }
  const actors = doc.actors
  const veins = doc.veins || {}
  const goals = doc.goals || {}
  const activeVeinFilter = veins[veinFilter] ? veinFilter : ''
  const tasks = Object.values(doc.tasks).filter(
    (task) => (!filter || task.assignee === filter) && (!statusFilter || task.status === statusFilter)
      && (!activeVeinFilter || task.veinIds?.includes(activeVeinFilter)),
  )
  const showVein = (veinId) => showBoard({ vein: veinId })
  const shownActivityActor = actors[activityActor] ? activityActor : ''
  const visibleCount = activityCutoff
    ? activityEvents.filter(event => atOrAfter(event, activityCutoff)).length
    : Math.min(ACTIVITY_PAGE, activityEvents.length)
  const visibleEvents = activityEvents.slice(0, visibleCount)
  const showOlder = () => {
    const next = activityEvents[Math.min(visibleCount + ACTIVITY_PAGE, activityEvents.length) - 1]
    activityFocus.current = activityEvents[visibleCount].operationId
    setActivityCutoff({ timestamp: next.timestamp, operationId: next.operationId })
  }
  const lookups = { actors, tasks: doc.tasks, veins, goals, comments: doc.comments }
  const openVein = (_element, veinId) => {
    focusAfterView.current = () => viewNav.current?.querySelector('[aria-pressed="true"]')?.focus()
    showVein(veinId)
  }
  const openGoal = (_element, goalId) => {
    focusAfterView.current = () => {
      const goal = document.querySelector(`.goal[data-goal-id="${CSS.escape(goalId)}"]`)
      goal?.scrollIntoView({ block: 'start' })
      goal?.focus({ preventScroll: true })
    }
    setView('goals')
  }
  // One routed message: inside the open panel (beside the form that failed), else under the header.
  // A pending request keeps Retry and cannot be dismissed, wherever the message sits.
  const errorSlot = !error ? null : creating ? 'create' : selected
    ? (errorOrigin?.taskId === selected ? errorOrigin.type : 'panel') : 'page'
  const errorNotice = <ErrorNotice
    error={error}
    retry={pending && !busy ? () => submit(null, null, pending) : null}
    onDismiss={pending ? null : () => setError(null)}
  />
  // Closing a panel clears its message but never the pending request; the page notice then offers Retry.
  const closeCreate = () => { setCreating(false); setError(null) }
  const closeDetails = () => { setSelected(null); setError(null) }
  return (
    <div className="app" data-client={sessionMode || undefined}
      style={sessionMode ? { '--client-header-height': `${headerHeight}px` } : undefined}>
      <header ref={headerRef} className={session ? 'client-header' : undefined}>
        {session ? session.header : <div>
          <h1>Pardner</h1>
          <SaveStatus status={status} connected={connected} busy={busy} heads={doc.heads.join(',')} />
        </div>}
        <div className="header-controls">
          {session ? <SaveStatus status={status} connected={connected} busy={busy} heads={doc.heads.join(',')} />
            : <SelectActor actors={actors} value={actor} onChange={setActor} />}
          <button
            ref={newTaskButton}
            className="primary"
            disabled={!actor || busy || Boolean(pending)}
            onClick={event => openPanel(event.currentTarget, () => {
              setCreating(true)
              setSelected(null)
            })}
          >
            New task
          </button>
        </div>
      </header>
      {errorSlot === 'page' && errorNotice}
      {pending && !error && (
        <div className="notice">
          A request is awaiting confirmation.{' '}
          <button disabled={busy} onClick={() => submit(null, null, pending)}>
            Retry saved request
          </button>
        </div>
      )}
      {phoneSetup && <PhoneAccess canManageAccess={config.canManageAccess} request={request} onClose={() => setPhoneSetup(false)} />}
      {connectionError && <div className="notice" role="status"><p>{connectionError.failure.message}</p>
        <button onClick={retryConnection}>Retry connection</button>
      </div>}
      {!session && !Object.keys(actors).length && (
        <div className="notice">
          Register your first human or agent Actor with{' '}
          <code>pardner actors register</code> to begin.
        </div>
      )}
      {!session && <div className="workspace-actions">
        <button onClick={() => setPhoneSetup(true)}>Pair another device</button>
        <button disabled={busy} onClick={forget}>Forget this workspace</button>
      </div>}
      <nav aria-label="Workspace views" ref={viewNav}>
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
        {!session && <button
          aria-pressed={view === 'control'}
          onClick={() => setView('control')}
        >
          Control
        </button>}
        {view === 'board' && <>
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
        <label>Vein<select aria-label="Vein" title={veins[activeVeinFilter]?.title ?? 'All veins'} value={activeVeinFilter} onChange={event => setVeinFilter(event.target.value)}>
          <option value="">All veins</option>
          {Object.values(veins).sort((a, b) => a.title.localeCompare(b.title)).map(vein =>
            <option key={vein.id} value={vein.id}>{vein.title}</option>)}
        </select></label>
        </>}
        {view === 'activity' && <>
        <SelectActor
          label="Performed by"
          emptyLabel="Any Actor"
          actors={actors}
          value={shownActivityActor}
          onChange={value => { setActivityActor(value); setActivityCutoff(null) }}
          optional
        />
        <label>Show<select aria-label="Show" value={activityShow} onChange={event => { setActivityShow(event.target.value); setActivityCutoff(null) }}>
          {ACTIVITY_SHOWS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>
        </>}
      </nav>
      {/* Keyed by view so a view switch never inherits a stale scroll position. */}
      <main key={view}>
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
                      data-task-id={task.id}
                      aria-current={selected === task.id ? 'true' : undefined}
                      onClick={() => openPanel({ taskId: task.id }, () => {
                        setSelected(task.id)
                        setCreating(false)
                      })}
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
                      {session?.focus[task.id]?.length > 0 && <FocusMarkers session={session} actorIds={session.focus[task.id]} />}
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
        ) : view === 'control' && !session ? (
          <ControlPane request={request} actors={actors} tasks={doc.tasks} actor={actor} canManageAccess={config.canManageAccess} />
        ) : (
          <section className="activity">
            <div className="activity-heading">
              <h2>Activity</h2>
              <span className="muted">Showing {visibleCount.toLocaleString()} of {activityEvents.length.toLocaleString()}</span>
            </div>
            {!activityEvents.length && <p className="empty">
              {Object.keys(doc.operations).length ? 'No activity matches these filters.' : 'No activity yet.'}
            </p>}
            {visibleEvents.map((event, index) => {
              const when = new Date(event.timestamp)
              const heading = dayHeading(when)
              const newDay = index === 0 || heading !== dayHeading(new Date(visibleEvents[index - 1].timestamp))
              return (
                <Fragment key={event.operationId}>
                  {newDay && <h3 className="day">{heading}</h3>}
                  <EventRow
                    event={event}
                    lookups={lookups}
                    data-operation-id={event.operationId}
                    tabIndex={-1}
                    formatTime={time => time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    onTask={(element, id) => openPanel(element, () => setSelected(id))}
                    onVein={openVein}
                    onGoal={openGoal}
                  />
                </Fragment>
              )
            })}
            {activityEvents.length > 0 && (visibleCount < activityEvents.length
              ? <button type="button" onClick={showOlder}>Show older activity</button>
              : <p className="muted">Start of activity</p>)}
          </section>
        )}
      </main>
      {creating && (
        <TaskForm
          actors={actors}
          busy={busy}
          notice={errorSlot === 'create' && errorNotice}
          onClose={closeCreate}
          onSubmit={async (fields) => {
            return submit('task.create', fields)
          }}
        />
      )}
      {selected && (
        <TaskDetail
          key={`${selected}:${actor}`}
          taskId={selected}
          actors={actors}
          lookups={lookups}
          actor={actor}
          heads={doc.heads.join(',')}
          request={request}
          confirmedOperation={confirmedOperation}
          submit={submit}
          busy={busy}
          status={status}
          connected={connected}
          session={session}
          client={client}
          errorSlot={errorSlot}
          errorNotice={errorNotice}
          clearError={() => setError(null)}
          claimHeadingFocus={claimHeadingFocus}
          onClose={closeDetails}
        />
      )}
    </div>
  )
}

function focusedActors(session, actorIds) {
  return actorIds.map(id => session.actorsById[id]).filter(Boolean)
}
/** Non-interactive markers inside a card button; profiles open from the task panel or header. */
function FocusMarkers({ session, actorIds }) {
  const list = focusedActors(session, actorIds)
  if (!list.length) return null
  return <span className="focus-markers">
    <AvatarStack actors={list} index={session.index} max={3} size="sm" labelSuffix=", on this task" label="Here now" />
  </span>
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
          <article className="goal" key={goal.id} aria-label={goal.title} data-goal-id={goal.id} tabIndex={-1}>
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
  initialTags,
  onChange,
  editing = false,
  notice,
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
  const [tags, setTags] = useState(initialTags ?? fields.tags.join(', '))
  useEffect(() => { onChange?.(fields, tags) }, [onChange, fields, tags])
  const [titleBlank, setTitleBlank] = useState(false)
  // A failed submit returns focus to its button once it re-enables; the error is announced, not focused.
  const [submitButton, refocusSubmit] = useRefocus()
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
          if (!fields.title.trim()) {
            setTitleBlank(true)
            event.currentTarget.elements.namedItem('title')?.focus()
            return
          }
          void Promise.resolve(onSubmit({ ...fields, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean) }))
            .then(receipt => { if (!receipt) refocusSubmit() })
        }}
      >
        <label>
          Title
          <input
            name="title"
            required
            autoFocus
            aria-invalid={titleBlank || undefined}
            aria-describedby={titleBlank ? `task-title-error-${editing ? 'edit' : 'new'}` : undefined}
            value={fields.title}
            onChange={(event) => {
              set('title', event.target.value)
              setTitleBlank(false)
            }}
          />
        </label>
        {titleBlank && <p className="field-error" role="alert" id={`task-title-error-${editing ? 'edit' : 'new'}`}>Enter a title that is not only spaces.</p>}
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
                <option key={value} value={value}>{value.toUpperCase()}</option>
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
        {notice}
        <div className="actions">
          <button className="primary" ref={submitButton} disabled={busy}>
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
/** Links to existing GitHub issues. Pardner stores the reference only; GitHub status never moves the task. */
function IssueLinks({ taskId, issues, canWrite, submit }) {
  const [reference, setReference] = useState('')
  const [invalid, setInvalid] = useState(false)
  return (
    <section aria-label="GitHub issues">
      <h3>GitHub issues</h3>
      {issues.length ? (
        <ul className="issue-links">
          {issues.map(issue => (
            <li key={`${issue.repository}#${issue.number}`}>
              <a href={issue.url} target="_blank" rel="noreferrer">{issue.repository}#{issue.number}</a>{' '}
              <button disabled={!canWrite} onClick={() => submit('task.unlink-issue', {
                taskId, repository: issue.repository, number: issue.number, expectedRevisions: issue.revisions,
              })}>Unlink</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No linked issues. Linking does not contact GitHub.</p>}
      <form onSubmit={async event => {
        event.preventDefault()
        const match = /^\s*([^#\s]+\/[^#\s]+)#(\d+)\s*$/.exec(reference)
        setInvalid(!match)
        if (!match) return
        const receipt = await submit('task.link-issue', { taskId, repository: match[1], number: Number(match[2]) })
        if (receipt) setReference(current => current === reference ? '' : current)
      }}>
        <label>Link GitHub issue<input placeholder="owner/repo#123" value={reference} onChange={event => setReference(event.target.value)} /></label>
        {invalid && <p className="error" role="alert">Name the issue as owner/repo#number.</p>}
        <button disabled={!canWrite || !reference.trim()}>Link issue</button>
      </form>
    </section>
  )
}

function TaskDetail({
  taskId,
  actors,
  lookups,
  actor,
  heads,
  request,
  confirmedOperation,
  submit,
  busy,
  status,
  connected,
  session = null,
  client = null,
  errorSlot,
  errorNotice,
  clearError,
  claimHeadingFocus,
  onClose,
}) {
  const [context, setContext] = useState(null)
  const heading = useRef(null)
  const [editButton, refocusEdit] = useRefocus()
  const [handoffButton, refocusHandoff] = useRefocus()
  const [handoffOpener, refocusHandoffOpener] = useRefocus()
  const [commentButton, refocusComment] = useRefocus()
  // Focus the heading once per open; a remount on Actor switch must not steal focus.
  useEffect(() => {
    if (context && heading.current && claimHeadingFocus()) heading.current.focus()
  }, [context, claimHeadingFocus])
  // In client mode an edit draft survives closing the panel, reloading the tab and
  // switching projects. It is stored per project, Actor and task, never sent until saved.
  const [draft, setDraftState] = useState(() => session ? client.draft(taskId) : null)
  const draftRef = useRef(draft)
  const setDraft = useCallback(value => {
    draftRef.current = value
    setDraftState(value)
    if (session) try { client.saveDraft(taskId, value) } catch { /* the in-memory draft remains */ }
  }, [session, client, taskId])
  const persistDraftEdits = useCallback((edited, tagsText) => {
    if (!session || !draftRef.current) return
    draftRef.current = { ...draftRef.current, edited, tagsText }
    try { client.saveDraft(taskId, draftRef.current) } catch { /* the in-memory draft remains */ }
  }, [session, client, taskId])
  const [message, setMessage] = useState('')
  const [commentFocused, setCommentFocused] = useState(false)
  const [to, setTo] = useState('')
  const [handoffStatus, setHandoffStatus] = useState('review')
  const [handoffStatusTouched, setHandoffStatusTouched] = useState(false)
  const [handoffMessage, setHandoffMessage] = useState('')
  const [failure, setFailure] = useState(null)
  const [handoffBase, setHandoffBase] = useState(null)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoffDone, setHandoffDone] = useState(null)
  const handoffForm = useRef(null)
  const focusRecipient = useRef(false)
  // Latest values for async completions, which must not act on a stale closure.
  const handoffLive = useRef({})
  handoffLive.current = { open: handoffOpen, message: handoffMessage }
  useEffect(() => {
    if (!handoffOpen || !focusRecipient.current) return
    focusRecipient.current = false
    handoffForm.current?.querySelector('select')?.focus()
  }, [handoffOpen])
  const finishHandoff = useCallback(({ to: sentTo, status }) => {
    setHandoffOpen(false)
    setTo('')
    setHandoffMessage('')
    setHandoffBase(null)
    setHandoffStatusTouched(false)
    setHandoffDone({ to: sentTo, status })
    refocusHandoffOpener()
  }, [refocusHandoffOpener])
  useEffect(() => {
    if (confirmedOperation?.payload.taskId !== taskId) return
    if (confirmedOperation.type === 'comment.add') {
      setMessage(current => current === confirmedOperation.payload.text ? '' : current)
    }
    if (confirmedOperation.type === 'task.handoff') {
      const { open, message: current } = handoffLive.current
      if (open && current === confirmedOperation.payload.message) finishHandoff(confirmedOperation.payload)
    }
  }, [confirmedOperation, taskId, finishHandoff])
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
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      // A modal dialog owns its own Escape; typed text is never discarded by it.
      // An open dialog (profile, invite) closes first, not the panel beneath it.
      if (target?.closest?.('dialog') || document.querySelector('dialog[open]')) return
      const typed = target?.tagName === 'TEXTAREA' ||
        (target?.tagName === 'INPUT' && ['', 'text', 'search', 'url', 'email'].includes(target.getAttribute('type') ?? ''))
      if (typed && target.value.trim() !== '') return
      onClose()
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
        {errorNotice}
      </aside>
    )
  const { task, comments, history, conflicts, revisions } = context
  const canWrite = Boolean(actor) && !busy
  const newCount = actor ? comments.filter(comment => isNewComment(comment, actor)).length : 0
  // Lowercase handle -> "Name · kind" for Actors a comment actually notified.
  const deliveredFor = (commentId) => new Map(context.mentions
    .filter(mention => mention.commentId === commentId && actors[mention.toActorId])
    .map(mention => [String(actors[mention.toActorId].handle).toLowerCase(), labelActor(actors[mention.toActorId])]))
  const hint = mentionHint(unmatchedHandles(message, actors, { focused: commentFocused }))
  const handoffRevisions = { assignee: revisions.assignee, status: revisions.status }
  const handoffStale = handoffBase && JSON.stringify(handoffBase) !== JSON.stringify(handoffRevisions)
  const newerFields = session && draft
    ? Object.keys(draft.fields).filter(field => JSON.stringify(revisions[field]) !== JSON.stringify(draft.revisions[field]))
    : []
  const newerBy = newerFields.length
    ? [...history].reverse().find(event => event.changes.some(change => newerFields.includes(change.field)))?.actorId
    : null
  const here = session?.focus[taskId] ? focusedActors(session, session.focus[taskId]) : []
  // An edit error falls back to the panel top once its form has closed.
  // A handoff error does too while its form is closed, so Retry stays visible.
  const formSlot = (errorSlot === 'task.update' && !draft) || (errorSlot === 'task.handoff' && !handoffOpen)
    ? 'panel'
    : errorSlot
  const noticeFor = slot => formSlot === slot && errorNotice
  return (
    <aside className="side-panel" aria-label="Task details">
      <div className="panel-heading">
        <h2 tabIndex={-1} ref={heading}>{task.title}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <SaveStatus status={status} connected={connected} busy={busy} heads={heads} />
      {here.length > 0 && <div className="here-now">
        <span className="muted">Here now</span>
        <AvatarStack actors={here} index={session.index} max={6} size="sm" label="Here now" labelSuffix=", on this task"
          onOpen={session.onOpenProfile} />
      </div>}
      <p className="muted">
        {labelActor(actors[task.assignee])} · {LABELS[task.status]} ·{' '}
        {task.priority.toUpperCase()}
      </p>
      {context.veins?.length > 0 && (
        <p className="muted">Veins: {context.veins.map(vein => `${vein.title} (${LABELS[vein.status]})`).join(', ')}</p>
      )}
      <ErrorNotice error={failure} />
      {!FORM_SLOTS.includes(formSlot) && errorNotice}
      <IssueLinks taskId={taskId} issues={context.issues ?? []} canWrite={canWrite} submit={submit} />
      {draft && newerFields.length > 0 && (
        <div className="notice draft-notice" role="status">
          <p>
            {newerBy ? `${labelActor(actors[newerBy])} saved` : 'Someone saved'} a newer {newerFields.join(', ')} since
            you started editing. Your draft is unchanged.
          </p>
          <p className="muted small">If you also changed {newerFields.length === 1 ? 'that field' : 'those fields'}, saving is
            refused until you choose. Basing your draft on the latest version makes your save an explicit replacement.</p>
          <button type="button" onClick={() => {
            // Fields this user never touched follow the latest version; fields they changed stay as an explicit replacement.
            const current = draftRef.current
            const edited = current.edited ?? current.fields
            const untouched = field => JSON.stringify(edited[field]) === JSON.stringify(current.fields[field])
            const latest = Object.fromEntries(newerFields.map(field => [field, task[field]]))
            const tagsUntouched = (current.tagsText ?? current.fields.tags.join(', ')) === current.fields.tags.join(', ')
            setDraft({
              ...current,
              fields: { ...current.fields, ...latest },
              revisions: { ...current.revisions, ...Object.fromEntries(newerFields.map(field => [field, revisions[field]])) },
              edited: { ...edited, ...Object.fromEntries(newerFields.filter(untouched).map(field => [field, task[field]])) },
              tagsText: newerFields.includes('tags') && tagsUntouched ? task.tags.join(', ') : current.tagsText,
              // The form seeds its state once, so a rebase remounts it on the new base.
              generation: (current.generation ?? 0) + 1,
            })
          }}>Base my draft on the latest version</button>
        </div>
      )}
      {draft ? (
        <TaskForm
          key={draft.generation ?? 0}
          editing
          actors={actors}
          busy={busy}
          initial={draft.edited ?? draft.fields}
          initialTags={draft.tagsText}
          onChange={persistDraftEdits}
          notice={noticeFor('task.update')}
          onClose={() => { setDraft(null); clearError(); refocusEdit() }}
          onSubmit={async (fields) => {
            const updates = Object.fromEntries(
              Object.entries(fields).filter(
                ([key, value]) =>
                  JSON.stringify(value) !== JSON.stringify(draft.fields[key]),
              ),
            )
            if (!Object.keys(updates).length) {
              setDraft(null)
              refocusEdit()
              return true
            }
            const receipt = await submit('task.update', {
              taskId,
              updates,
              expectedRevisions: Object.fromEntries(
                Object.keys(updates).map((key) => [key, draft.revisions[key]]),
              ),
            })
            if (receipt) { setDraft(null); refocusEdit() }
            return receipt
          }}
        />
      ) : (
        <>
          <MarkdownBody>{task.description || 'No description yet.'}</MarkdownBody>
        </>
      )}
      <div className="task-actions">
        {!draft && (
          <button
            ref={editButton}
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
        )}
        {!handoffOpen && (
          <button
            ref={handoffOpener}
            disabled={!canWrite}
            onClick={() => {
              focusRecipient.current = true
              setHandoffDone(null)
              setHandoffStatus(defaultHandoffStatus(task.status))
              setHandoffStatusTouched(false)
              setHandoffBase(handoffRevisions)
              setHandoffOpen(true)
            }}
          >
            Hand off work
          </button>
        )}
        {handoffDone && (
          <p role="status" className="muted">
            Handed off to {labelActor(actors[handoffDone.to])} · {LABELS[handoffDone.status]}.
          </p>
        )}
      </div>
      {(context.integrityConflicts ?? []).map(group => (
        <section className="conflict integrity-conflict" key={group.requestId} aria-label="Operation integrity conflict">
          <h3>Unresolved operation ID conflict</h3>
          <p>Retry key {group.requestId} acknowledged different requests. Both are preserved. Inspection does not replay or repair them.</p>
          {group.variants.map(variant => (
            <details key={variant.fingerprint}>
              <summary>{variant.type} by {variant.actorId} — {variant.fingerprint}</summary>
              <pre>{JSON.stringify(variant, null, 2)}</pre>
            </details>
          ))}
        </section>
      ))}
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
      {handoffOpen && (
      <section>
        <h3>Hand off work</h3>
        <form
          ref={handoffForm}
          onFocusCapture={() => {
            setHandoffBase(current => current ?? handoffRevisions)
          }}
          onSubmit={async (event) => {
            event.preventDefault()
            const sent = { taskId, to, status: handoffStatus, message: handoffMessage }
            const receipt = await submit('task.handoff', { ...sent, expectedRevisions: handoffBase })
            const { open, message: current } = handoffLive.current
            if (!receipt) refocusHandoff()
            else if (open && current === sent.message) finishHandoff(sent)
          }}
        >
          {handoffStale && (
            <div className="notice" role="status">
              <p>This task changed while you were writing: now {labelActor(actors[task.assignee])} · {LABELS[task.status]}. Your draft is preserved.</p>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setHandoffBase(handoffRevisions)
                  if (!handoffStatusTouched) setHandoffStatus(defaultHandoffStatus(task.status))
                }}
              >
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
              onChange={(event) => {
                setHandoffStatus(event.target.value)
                setHandoffStatusTouched(true)
              }}
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
          {noticeFor('task.handoff')}
          <div className="actions">
            <button className="primary" ref={handoffButton} disabled={!canWrite || !to || handoffStale || !handoffMessage.trim()}>Hand off</button>
            <button
              type="button"
              onClick={() => {
                setHandoffOpen(false)
                setTo('')
                setHandoffMessage('')
                setHandoffBase(null)
                setHandoffStatusTouched(false)
                clearError()
                refocusHandoffOpener()
              }}
            >
              Cancel handoff
            </button>
          </div>
        </form>
      </section>
      )}
      <section>
        <div className="section-heading">
          <h3>
            Comments <span>{comments.length}</span>
            {actor && newCount > 0 && <span className="comment-new-count"> · {newCount} new</span>}
          </h3>
          {actor && (
            <button
              disabled={!canWrite || !newCount}
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
              Mark all read
            </button>
          )}
        </div>
        {comments.map((comment) => {
          const isNew = isNewComment(comment, actor)
          return (
          <article className={isNew ? 'comment is-new' : 'comment'} key={comment.id}>
            <div className="comment-head">
              <strong>{labelActor(actors[comment.actorId])}</strong>
              <time>{new Date(comment.timestamp).toLocaleString()}</time>
              {isNew && <span className="comment-tag">New</span>}
            </div>
            <MarkdownBody extraPlugins={[remarkMentionChips(deliveredFor(comment.id))]}>{comment.content}</MarkdownBody>
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
          )
        })}
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const receipt = await submit('comment.add', {
              taskId,
              text: message,
            })
            if (receipt) setMessage(current => current === message ? '' : current)
            else refocusComment()
          }}
        >
          <label>
            Comment
            <textarea
              aria-label="Comment"
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onFocus={() => setCommentFocused(true)}
              onBlur={() => setCommentFocused(false)}
              aria-describedby={hint ? 'comment-mention-hint' : undefined}
              placeholder="Share progress or mention an Actor with @handle"
            />
          </label>
          {hint && <p id="comment-mention-hint" className="muted mention-hint">{hint}</p>}
          {noticeFor('comment.add')}
          <button className="primary" ref={commentButton} disabled={!canWrite || !message.trim()}>
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
        {sortEvents(history.filter(event => event.type !== 'comment.add')).map(event => (
          <EventRow
            key={event.operationId}
            event={event}
            lookups={lookups}
            within={taskId}
            formatTime={when => when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          />
        ))}
      </section>
    </aside>
  )
}
