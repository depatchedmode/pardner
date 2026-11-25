import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OUTCOMES, STATE_LABELS as LABELS, WORK_STATES } from '@pardner/domain-vocab'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs'
import { Dialog, DialogContent } from '@ui-sdk/react/dialog'
import ActorMarkdown from './ActorMarkdown.jsx'
import Chevron from './Chevron.jsx'
import './pardner.css'
import { createOperationId } from './operation-id.js'
import { createConnection, loadConfiguration, websocketUrl } from './connection.js'
import { AgentSetupDialog, TaskAgentRuns } from './ControlPane.jsx'
import ClientApp from './ClientApp.jsx'
import { AvatarStack } from './Avatar.jsx'
import RecordConflicts from './RecordConflicts.jsx'
import { disputedOutcomeText } from './record-conflicts.js'
import { BoardStatus, PendingReplication } from './BoardStatus.jsx'
import { isNewComment } from './comments.js'
import { mentionHint, remarkMentionChips, unmatchedHandles } from './mentions.js'
import { presenceOf } from './presence.js'
import { describeEvent, eventGroup, sortEvents } from './events.js'
import { boardData, dictionary } from './board-data.js'
import { emptyFields, unreadableLines } from './unreadable.js'
import { activityRows, alternativeChangedBySomeoneElse, changedBySomeoneElse, describeChange, describeRecord, emptyReview, needsReview, newerAuthors, reviewNotice, signerLine, taskRows, waitingLong } from './attribution.js'

const OutcomeOptions = () => <><option value="">No outcome</option>{OUTCOMES.map(value =>
  <option key={value} value={value}>{LABELS[value]}</option>)}</>
const openTodoLabel = count => `${count} open ${count === 1 ? 'to-do' : 'to-dos'}`
const actorName = (actors, id) => actors[id]?.displayName || actors[id]?.handle || id
const ACTIVITY_SHOWS = [
  ['changes', 'All changes'], ['review', 'Needs review'], ['work', 'Assignments, to-dos and outcomes'], ['comments', 'Comments'],
  ['commits', 'Commits and branches'], ['plans', 'Goals and veins'], ['members', 'People and machines'], ['actors', 'Actors registered'], ['reads', 'Read receipts'],
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
function hasTypedText(target) {
  const typed = target?.tagName === 'TEXTAREA' ||
    (target?.tagName === 'INPUT' && ['', 'text', 'search', 'url', 'email'].includes(target.getAttribute('type') ?? ''))
  return Boolean(typed && target.value.trim() !== '')
}

// Match the breakpoint where .side-panel fills the viewport.
const fullWidthPanel = '(width < 840px), (height < 600px)'
function useFullWidthPanel() {
  const [modal, setModal] = useState(() => matchMedia(fullWidthPanel).matches)
  useEffect(() => {
    const query = matchMedia(fullWidthPanel)
    const update = () => setModal(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return modal
}
function TaskPanel({ label, modal, onClose, children }) {
  const panel = useRef(null)
  const revealFocus = event => {
    const pane = event.currentTarget
    const target = event.target
    if (!modal || target === pane || !pane.contains(target)) return
    const viewport = target.closest('.task-panel-body') ?? pane
    const bounds = viewport.getBoundingClientRect()
    const item = target.getBoundingClientRect()
    if (item.top < bounds.top || item.bottom > bounds.bottom) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
  useLayoutEffect(() => {
    if (modal && !panel.current.contains(document.activeElement) && !document.activeElement?.closest('[aria-modal="true"]')) {
      panel.current.focus({ preventScroll: true })
    }
  }, [modal])
  useEffect(() => {
    if (modal) return
    // Escape still closes a desktop panel if a disappearing form briefly leaves focus on the page.
    const escapeFromPage = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.target !== document.body) return
      if (document.querySelector('[aria-modal="true"]:not([hidden])')) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', escapeFromPage, true)
    return () => document.removeEventListener('keydown', escapeFromPage, true)
  }, [modal, onClose])
  return <Dialog defaultOpen modal={modal} closeOnOutsidePress={false} onOpenChange={(open, details) => {
    if (open) return
    if (details.reason === 'escape-key' && hasTypedText(details.event?.target)) details.cancel()
    else onClose()
  }}>
    <DialogContent ref={panel} className="side-panel" inline aria-label={label} initialFocus="none" finalFocus="none" onFocusCapture={revealFocus}>
      {children}
    </DialogContent>
  </Dialog>
}
function TaskPanelClose({ onClose, autoFocus }) {
  return <button type="button" className="task-panel-close" aria-label="Close" title="Close" autoFocus={autoFocus} onClick={onClose}>
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  </button>
}
// Task details operations whose errors render above that form's submit button.
const FORM_SLOTS = ['task.update', 'task.handoff', 'todo.add', 'comment.add', 'task.link-issue', 'task.unlink-issue']
const labelActor = (actor) =>
  actor ? `${actor.displayName || actor.handle} · ${actor.kind}` : 'Unassigned'

function BoardSelect(props) {
  return <span className="board-select">
    <select {...props} />
    <Chevron />
  </span>
}

function SelectActor({
  actors,
  value,
  onChange,
  label = 'Actor',
  optional = false,
  emptyLabel,
  disabled = false,
}) {
  return (
    <label>
      {label}
      <BoardSelect
        aria-label={label}
        value={value || ''}
        disabled={disabled || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel || (optional ? 'Unassigned' : 'Choose an Actor')}</option>
        {Object.values(actors).map((actor) => (
          <option key={actor.id} value={actor.id}>
            {labelActor(actor)}
          </option>
        ))}
      </BoardSelect>
    </label>
  )
}
function MarkdownBody({ children, extraPlugins = [], labelFor, assigneeHandle }) {
  return (
    <div className="markdown">
      <ActorMarkdown extraPlugins={extraPlugins} labelFor={labelFor} assigneeHandle={assigneeHandle}>{children}</ActorMarkdown>
    </div>
  )
}
// Buttons are type="button": the notice can sit inside the form that failed.
function ErrorNotice({ error, retry, busy, onDismiss }) {
  if (!error) return null
  return (
    <div className="error" role="alert">
      <strong>{error.message}</strong>
      {(error.code === 'STALE_UPDATE' || !error.preflight) && <p>
        {error.code === 'STALE_UPDATE'
          ? 'Your draft is preserved. Review the latest context before making a new edit.'
          : 'Your last confirmed data remains available.'}
      </p>}
      {(retry || onDismiss) && <div className="actions">
        {retry && <button type="button" aria-disabled={busy} onClick={retry}>Retry saved request</button>}
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
      if (active && active !== document.body && !active.matches('.side-panel')) {
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
const CURRENT_TITLE = 'As named now: not part of what was signed'

/** A name or title looked up now, marked as current. */
const Current = ({ children }) => <span className="current-label" title={CURRENT_TITLE}>{children}</span>

/** Text parts of a sentence or detail: plain strings, statuses, and names or titles marked as current. */
function renderParts(parts, handlers = {}) {
  return parts.map((part, index) => {
    if (typeof part === 'string') return part
    if (part.status) return <span key={index} className="record-status" data-status={part.status}>{part.label}</span>
    const open = part.subject && handlers[part.subject]
    if (open && !part.missing) {
      return <button key={index} type="button" className={part.current ? 'subject current-label' : 'subject'} title={part.current ? CURRENT_TITLE : undefined}
        {...(part.subject === 'task' ? { 'data-task-id': part.id } : {})} onClick={click => open(click.currentTarget, part.id)}>{part.label}</button>
    }
    return part.current ? <Current key={index}>{part.label}</Current> : part.label
  })
}

// One Activity entry as a plain sentence, derived from the change that wrote it (lib/activity.js on the service):
// what it shows is what that change wrote, and its signer line is that change's own verdict. Names and titles are
// looked up now and marked so. Activity passes handlers so subjects become buttons; History passes none and stays
// plain text.
function EventRow({ event: row, lookups, within, onTask, onVein, onGoal, formatTime, ...articleProps }) {
  const { attribution } = lookups
  const { entry } = row
  const description = entry.kind === 'record' ? describeRecord(row, attribution) : entry.kind === 'unrecognised' ? describeChange(row, attribution)
    : describeEvent(entry.shows ?? {}, lookups, { within })
  const signer = signerLine(attribution, entry)
  const when = new Date(row.timestamp || 0)
  // A time a date cannot show is unknown, never a failure of the row.
  const timed = Boolean(row.timestamp) && Number.isFinite(when.getTime())
  const handlers = { task: onTask, vein: onVein, goal: onGoal }
  return (
    <article className="event" {...articleProps}>
      <p className="event-line">
        <strong>{description.actorCurrent ? <Current>{description.actor}</Current> : description.actor}</strong>
        {renderParts(description.parts, handlers)}
      </p>
      {description.detail && <p className="event-detail">{renderParts(description.detailParts ?? [description.detail])}</p>}
      {description.excerpt && <p className="event-detail">{description.excerpt}</p>}
      {signer && <p className="event-signer" data-tone={signer.tone}>{signer.text}</p>}
      {/* A record's own signature covers the record, not this time: it is when a machine wrote it to the board. */}
      {timed ? <time dateTime={when.toISOString()} title={entry.kind === 'record' ? `${when.toLocaleString()}: when a machine wrote this record to the board. The record’s signer didn’t sign this time.` : when.toLocaleString()}>
        {entry.kind === 'record' ? `Written to the board ${formatTime(when)}` : formatTime(when)}</time> : <time className="muted">Time unknown</time>}
    </article>
  )
}

/** The note Activity and History carry: what is verified, what is the author's description, and what is looked up now. */
const CurrentLegend = () => <p className="muted current-legend">Only the signer line is verified. What an entry says is its author’s description, checked against what the change wrote where Pardner can. Names and titles marked <Current>like this</Current> are as they are now.</p>

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
    {failure && <><p>Check that Pardner is running on your computer. Start it with <code>pardner up</code>, then retry.</p>
      <button onClick={() => reload().catch(setFailure)}>Retry connection</button></>}
  </main>
  if (config.mode === 'client') return <ClientApp config={config} />
  // A standalone service has no human board: people use the local client, which keeps its own projects.
  return <main className="connection">
    <h1>Pardner</h1>
    <p>This is the standalone agent and integration service, for agents and scripts on this computer. It serves no other machine.</p>
    <p>People use the Pardner client: run <code>pardner up</code>. The client keeps its own projects, so this service’s tasks do not appear there.</p>
  </main>
}

/**
 * The board inside the local client. The session cookie authenticates and the
 * author is the signed-in Actor; `session` carries the client's header, presence
 * and callbacks.
 */
export function Workspace({ config, reloadConfiguration, session }) {
  const client = useMemo(() => createConnection(config), [config])
  // The session prop changes every render (presence, header); callbacks read it through this ref.
  const sessionRef = useRef(session)
  // The project grants control to people on this computer.
  const canControl = Boolean(session.canControl)
  sessionRef.current = session
  // Desktop task panels open below the client header so project controls stay reachable.
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const element = headerRef.current
    if (!element || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => setHeaderHeight(Math.ceil(element.getBoundingClientRect().height)))
    observer.observe(element)
    return () => observer.disconnect()
  })
  const [connectionError, setConnectionError] = useState(null)
  const connectionAlert = useRef(null)
  const [doc, setDoc] = useState(null)
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const actor = config.actorId
  const [selected, setSelected] = useState(() => client.preferences().selected || null)
  const [creating, setCreating] = useState(false)
  const [commentDrafts, setCommentDrafts] = useState(() => new Map())
  const updateCommentDraft = (taskId, text) => setCommentDrafts(current => {
    const next = new Map(current)
    if (text) next.set(taskId, text)
    else next.delete(taskId)
    return next
  })
  const fullWidth = useFullWidthPanel()
  const panelOpen = Boolean(selected || creating)
  const modalPanel = fullWidth && panelOpen
  // In-memory New task draft ({ fields, tags }); null means the defaults. Never persisted.
  const [newTaskDraft, setNewTaskDraft] = useState(null)
  const [view, setView] = useState(() => {
    const saved = client.preferences().view
    return saved === 'goals' || saved === 'activity' ? saved : 'board'
  })
  const [filter, setFilter] = useState(() => client.preferences().filter || '')
  const [stateFilter, setStateFilter] = useState(() => WORK_STATES.includes(client.preferences().stateFilter) ? client.preferences().stateFilter : '')
  const [todoFilter, setTodoFilter] = useState('')
  const [veinFilter, setVeinFilter] = useState(() => client.preferences().veinFilter || '')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
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
  const editDrafts = useRef(new Map())
  const readEditDraft = useCallback(taskId => editDrafts.current.has(taskId)
    ? editDrafts.current.get(taskId)
    : client.draft(taskId), [client])
  const saveEditDraft = useCallback((taskId, draft) => {
    editDrafts.current.set(taskId, draft)
    try { client.saveDraft(taskId, draft) } catch { /* the in-memory draft remains */ }
  }, [client])
  const retryFocus = useRef(null)
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
  const boardViewport = useRef(null)
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
  useEffect(() => {
    try {
      client.savePreferences({ filter, stateFilter, veinFilter, view, selected })
    } catch (failure) { setError(failure) }
  }, [client, filter, stateFilter, veinFilter, view, selected])
  const onFocusChange = session.onFocusChange
  useEffect(() => { onFocusChange?.(selected ? [selected] : []) }, [onFocusChange, selected])
  const requestedTask = session.requestedTask
  // A task opened from a profile is a new open: focus its heading; closing falls back to New task.
  useEffect(() => {
    if (!requestedTask) return
    opener.current = null
    openCount.current++
    setSelected(requestedTask.taskId)
    setCreating(false)
  }, [requestedTask])
  const onTasks = session.onTasks
  useEffect(() => { if (doc) onTasks?.(doc.tasks) }, [onTasks, doc])
  const request = useCallback(async (path, body) => {
    try { return await client.request(path, body) } catch (failure) {
      if (failure.code === 'AUTH_REQUIRED') sessionRef.current.onAuthLost()
      if (failure.code === 'REVOKED') sessionRef.current.onRemoved?.()
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
    if (observedDoc === docUpdates.current) setDoc(boardData(next))
    if (observedStatus === statusUpdates.current) setStatus(state)
  }, [request, config.workspaceId, reloadConfiguration])
  useEffect(() => {
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
              void reloadConfiguration().catch(failure => { if (!stopped) setConnectionError(failure) })
              return
            }
            if (message.doc) { docUpdates.current++; setDoc(boardData(message.doc)) }
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
          setConnectionError(new Error('Live updates disconnected. Reconnecting automatically.'))
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
  }, [config, refresh, request, reloadConfiguration, retryGeneration])
  useEffect(() => {
    connectionAlert.current?.scrollIntoView({ block: 'nearest' })
  }, [connectionError])
  // Once a panel unmounts, return focus to its opener, else New task, else the current view's button.
  useEffect(() => {
    if (panelWasOpen.current && !panelOpen) {
      const from = opener.current
      const card = from?.taskId && document.querySelector(`.task-card[data-task-id="${CSS.escape(from.taskId)}"]`)
      const usable = element => element?.isConnected && !element.disabled
      ;[card || from, newTaskButton.current, viewNav.current?.querySelector('[aria-selected="true"]')].find(usable)?.focus()
    }
    panelWasOpen.current = panelOpen
  }, [panelOpen])
  const selectedLane = selected && doc?.tasks[selected]?.state
  useLayoutEffect(() => {
    const board = boardViewport.current
    if (!board || fullWidth || view !== 'board' || !selectedLane) return
    const revealSelection = () => {
      const card = board.querySelector(`.task-card[data-task-id="${CSS.escape(selected)}"]`)
      if (!card || !board.offsetWidth) return
      const viewport = board.getBoundingClientRect()
      const bounds = card.getBoundingClientRect()
      const scale = viewport.width / board.offsetWidth
      const inset = (parseFloat(getComputedStyle(board).scrollPaddingInlineStart) || 0) * scale
      const start = bounds.left - (viewport.left + inset)
      const end = bounds.right - (viewport.right - inset)
      if (start < 0) board.scrollBy({ left: start / scale })
      else if (end > 0) board.scrollBy({ left: end / scale })
    }
    revealSelection()
    // Resizing the split can hide the selection again. Leave manual scrolling
    // alone while the available width and selected lane stay the same.
    if (typeof ResizeObserver !== 'function') return
    let width = board.clientWidth
    const resize = new ResizeObserver(() => {
      if (width === board.clientWidth) return
      width = board.clientWidth
      revealSelection()
    })
    resize.observe(board)
    return () => resize.disconnect()
  }, [fullWidth, selected, selectedLane, view])
  useEffect(() => {
    if (busy || !retryFocus.current) return
    const { button, panel, record, todo } = retryFocus.current
    const frame = requestAnimationFrame(() => {
      retryFocus.current = null
      if (button.isConnected || !document.activeElement?.matches('body, .side-panel')) return
      const heading = panel?.isConnected && panel.querySelector('h2')
      const status = record?.isConnected && record.querySelector(':scope > .goal-heading select, :scope > .vein-meta select')
      const recordControl = status && !status.disabled ? status
        : record?.isConnected && (record.querySelector(':scope > .vein-title') || record)
      const tab = viewNav.current?.querySelector('[aria-selected="true"]')
      ;(todo?.isConnected ? todo : heading || recordControl || tab)?.focus()
    })
    return () => cancelAnimationFrame(frame)
  })
  const activityEvents = useMemo(() => {
    const actorId = doc?.actors?.[activityActor] ? activityActor : ''
    // Every entry is derived from one change; sorting, grouping and filtering use what that change signed.
    return sortEvents(activityRows(doc).filter(row => {
      if (actorId && row.actorId !== actorId) return false
      // Changes that have waited long for a signature are listed too, as pending.
      if (activityShow === 'review') return needsReview(row) || waitingLong(row)
      const group = row.entry.kind === 'record' ? 'members' : row.entry.kind === 'unrecognised' ? 'other' : eventGroup(row)
      return activityShow === 'changes' ? group !== 'reads' : group === activityShow
    }))
  }, [doc?.activity, doc?.actors, doc?.attribution, activityActor, activityShow])
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
  const submit = async (type, payload, { replay, fromEditor } = {}) => {
    if (inflight.current) return null
    const requestOrigin = replay ?? (pending?.type === 'todo.complete' ? pending : { type, payload })
    const origin = requestOrigin.payload
    const todoId = requestOrigin.type === 'todo.complete' ? origin.commentId : null
    setErrorOrigin({ type: requestOrigin.type, taskId: todoId ? doc.comments[todoId]?.taskId : origin?.taskId,
      recordId: origin?.veinId ?? origin?.goalId, todoId })
    if (pending && !replay) {
      setError({
        message: 'Resolve the saved request before starting another change.',
        preflight: true,
      })
      return null
    }
    let operation
    try {
      operation = replay || { operationId: createOperationId(), actorId: actor, type, payload }
      if (fromEditor) {
        saveEditDraft(payload.taskId, { ...readEditDraft(payload.taskId), pendingEdit: operation.operationId })
      }
      client.savePending(operation)
    } catch (failure) { setError(failure); return null }
    setPending(operation)
    inflight.current = true
    setBusy(true)
    if (!replay) setError(null)
    try {
      const receipt = await request('/automerge/operations', operation)
      let editDraft
      if (operation.type === 'task.update') {
        const { taskId } = operation.payload
        const current = readEditDraft(taskId)
        if (current && (current.pendingEdit === operation.operationId || (replay && matchesLegacyEdit(current, operation.payload)))) {
          editDraft = rebaseConfirmedEdit(current, operation.payload, receipt.operationId)
          saveEditDraft(taskId, editDraft)
        }
      }
      setConfirmedOperation({ ...operation, editDraft })
      if (operation.type === 'comment.add') {
        const { taskId, text } = operation.payload
        setCommentDrafts(current => {
          if (current.get(taskId) !== text) return current
          const next = new Map(current)
          next.delete(taskId)
          return next
        })
      }
      if (operation.type === 'task.create') openPanel({ taskId: receipt.result.taskId }, () => {
        setCreating(false)
        setNewTaskDraft(null)
        setSelected(receipt.result.taskId)
      })
      client.savePending(null)
      // Keep the retry disabled until the view can reflect the confirmed write.
      try { await refresh() } finally { setPending(null) }
      setError(null)
      return receipt
    } catch (failure) {
      // A write rejection can arrive before the live update that made it stale.
      if (failure.code === 'STALE_UPDATE' || failure.code === 'CONFLICT_REQUIRES_RESOLUTION') {
        try { await refresh() } catch { /* Keep the original rejection if the board cannot be read. */ }
      }
      setError(failure)
      // Definitive validation errors did not mutate; a new decision may follow.
      if (
        [
          'STALE_UPDATE',
          'CONFLICT_REQUIRES_RESOLUTION',
          'INVALID_ARGUMENT',
          'AMBIGUOUS_ACTOR',
          'NOT_FOUND',
          'FORBIDDEN',
          'ALREADY_COMPLETED',
          'REVISION_REQUIRED',
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
  const showBoard = ({ assignee = '', state = '', vein = '', todoFor = '' }) => {
    setFilter(assignee); setStateFilter(state); setVeinFilter(vein); setTodoFilter(todoFor); setView('board')
  }
  const retryConnection = () => setRetryGeneration(value => value + 1)
  if (!doc) return <main className="connection">
    <h1>Pardner</h1>
    <p role="status">{connectionError ? 'The project board isn’t reachable yet.' : 'Opening the project board…'}</p>
    {connectionError && <div role="alert" className="error" ref={connectionAlert}><p>{connectionError.message}</p>
      <button type="button" onClick={retryConnection}>Retry connection</button>
    </div>}
  </main>
  // The client's Actors carry each person's current profile name (and removal); the document keeps enrollment names.
  // Each is held without a prototype (boardData), so a lookup by an ID from the board finds only what the board holds.
  const actors = session.actorsById ? dictionary(doc.actors, session.actorsById) : doc.actors
  const veins = doc.veins
  const goals = doc.goals
  const activeVeinFilter = veins[veinFilter] ? veinFilter : ''
  const openTodos = new Map()
  for (const comment of Object.values(doc.comments)) {
    if (!comment.todo || comment.todo.completion) continue
    const list = openTodos.get(comment.taskId) ?? []
    list.push(comment.todo.assignee)
    openTodos.set(comment.taskId, list)
  }
  const activeFilterCount = [filter, stateFilter, activeVeinFilter, todoFilter].filter(Boolean).length
  const tasks = Object.values(doc.tasks).filter(
    (task) => (!filter || task.assignee === filter) && (!stateFilter || task.state === stateFilter)
      && (!activeVeinFilter || task.veinIds?.includes(activeVeinFilter))
      && (!todoFilter || openTodos.get(task.id)?.includes(todoFilter)),
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
  const lookups = { actors, tasks: doc.tasks, veins, goals, comments: doc.comments, attribution: doc.attribution ?? null, deletions: doc.attribution?.deletions ?? null,
    activity: doc.activity ?? [] }
  // Changes whose signer couldn't be confirmed, or that came from a removed machine, are announced on every view.
  const review = reviewNotice(doc.attribution)
  // Records the board could not read: each is listed instead of stopping the whole board (lib/workspace.js snapshot).
  const unreadableItems = Array.isArray(doc.unreadable) ? doc.unreadable : []
  // A top-level part of the board a change rewrote (its tasks, say) is named, and so is each other record and field.
  const rootIds = concurrent => [...new Set(unreadableItems.filter(item => item?.kind === 'root' && typeof item.id === 'string' && Boolean(item.concurrent) === concurrent).map(item => item.id))]
  const unreadableParts = rootIds(false)
  // A part holding values written concurrently is shown as the one Automerge picks.
  const concurrentParts = rootIds(true).filter(id => !unreadableParts.includes(id))
  const unreadableRecords = unreadableLines(unreadableItems, { tasks: doc.tasks, goals, veins })
  const openVein = (_element, veinId) => {
    focusAfterView.current = () => viewNav.current?.querySelector('[aria-selected="true"]')?.focus()
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
  const errorSlot = !error ? null : /^(goal|vein)\./.test(errorOrigin?.type ?? '') ? (view === 'goals' ? 'record' : 'page')
    : creating ? 'create' : selected
    ? (errorOrigin?.taskId === selected ? errorOrigin.type : 'panel') : 'page'
  const errorNotice = <ErrorNotice
    error={error}
    retry={pending ? retrySavedRequest : null}
    busy={busy}
    onDismiss={pending ? null : () => setError(null)}
  />
  const pendingTodoId = pending?.type === 'todo.complete' && doc.comments[pending.payload.commentId]?.taskId === selected
    ? pending.payload.commentId : null
  const pendingNotice = pending && !error && <div className="notice">
    A request is awaiting confirmation.{' '}
    <button type="button" aria-disabled={busy} onClick={retrySavedRequest}>Retry saved request</button>
  </div>
  const todoNotice = errorSlot === 'todo.complete' ? { id: errorOrigin.todoId, content: errorNotice }
    : pendingTodoId && !error && !busy ? { id: pendingTodoId, content: pendingNotice } : null
  function retrySavedRequest(event) {
    if (inflight.current) return
    const button = event.currentTarget
    if (document.activeElement === button) retryFocus.current = {
      button,
      panel: button.closest('.side-panel'),
      record: button.closest('[data-goal-id], [data-vein-id]'),
      todo: button.closest('.task-todo-row'),
    }
    void submit(null, null, { replay: pending })
  }
  // Closing a panel clears its message but never the pending request; the page notice then offers Retry.
  const closeCreate = () => { setCreating(false); setError(null) }
  const closeDetails = () => { setSelected(null); setError(null) }
  const boardContent = (
    <div className="board-content" inert={modalPanel}>
      <header ref={headerRef} className="client-header">
        <div className="client-identity">
          {session.projectSwitcher}
          <BoardStatus api={session.api} project={session.project} status={status} connected={connected} heads={doc.heads.join(',')} />
        </div>
        {session.people}
      </header>
      <button
        type="button"
        ref={newTaskButton}
        className="primary new-task-fab"
        inert={panelOpen}
        disabled={busy || Boolean(pending)}
        onClick={event => openPanel(event.currentTarget, () => {
          setCreating(true)
          setSelected(null)
        })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 3v10M3 8h10" vectorEffect="non-scaling-stroke" />
        </svg>
        New task
      </button>
      {session.notice}
      {errorSlot === 'page' && errorNotice}
      {!pendingTodoId && pendingNotice}
      {connectionError && <div className="notice" role="status"><p>{connectionError.message}</p>
        <button onClick={retryConnection}>Retry connection</button>
      </div>}
      {(unreadableRecords.length > 0 || unreadableParts.length > 0 || concurrentParts.length > 0) && <div className="notice warning unreadable-notice" role="status">
        {unreadableParts.length > 0 && <p>Part of this board can’t be read, so what it holds isn’t shown: {unreadableParts.join(', ')}. Activity lists the changes that wrote it.</p>}
        {concurrentParts.length > 0 && <p>Part of this board was written twice at once, and only one version of it is shown: {concurrentParts.join(', ')}. Activity lists the changes that wrote it.</p>}
        {unreadableRecords.length > 0 && <p>Some records on this board can’t be read. {unreadableRecords.join(' ')} Activity lists every change and who signed it.</p>}
      </div>}
      {review && <div className="notice warning review-notice" role="status">
        {review.map(line => <p key={line}>{line}</p>)}
        {!(view === 'activity' && activityShow === 'review') && <button onClick={() => { setView('activity'); setActivityShow('review'); setActivityCutoff(null) }}>
          Review changes
        </button>}
      </div>}
      <nav aria-label="Workspace views" data-view={view} ref={viewNav}>
        <TabsList className="workspace-tabs" aria-label="Workspace views">
          <TabsTab value="board">Tasks</TabsTab>
          <TabsTab value="goals">Goals</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
        </TabsList>
        {view === 'board' && <>
          {actor && <button type="button" className="quiet-button my-todos" aria-pressed={todoFilter === actor}
            onClick={() => showBoard({ todoFor: todoFilter === actor ? '' : actor })}>My to-dos</button>}
          <button type="button" className="workspace-filter-toggle"
            aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : undefined}
            aria-expanded={filtersExpanded} aria-controls="task-board-filters"
            onClick={() => setFiltersExpanded(open => !open)}>
            <span>Filters</span>
            {activeFilterCount > 0 && <span className="count" aria-hidden="true">{activeFilterCount}</span>}
            <Chevron />
          </button>
          <div className="workspace-filters" id="task-board-filters" data-expanded={filtersExpanded || undefined}
            onFocusCapture={() => setFiltersExpanded(true)}>
            <SelectActor
              label="Assigned to"
              emptyLabel="All Actors"
              actors={actors}
              value={filter}
              onChange={setFilter}
              optional
            />
            <label>State<BoardSelect aria-label="State filter" value={stateFilter} onChange={event => setStateFilter(event.target.value)}>
              <option value="">Any state</option>
              {WORK_STATES.map(state => <option key={state} value={state}>{LABELS[state]}</option>)}
            </BoardSelect></label>
            <SelectActor label="Open to-dos for" emptyLabel="All tasks" actors={actors}
              value={todoFilter} onChange={setTodoFilter} optional />
            <label className="vein-filter">Vein<BoardSelect aria-label="Vein" title={veins[activeVeinFilter]?.title ?? 'All veins'} value={activeVeinFilter} onChange={event => setVeinFilter(event.target.value)}>
              <option value="">All veins</option>
              {Object.values(veins).sort((a, b) => a.title.localeCompare(b.title)).map(vein =>
                <option key={vein.id} value={vein.id}>{vein.title}</option>)}
            </BoardSelect></label>
          </div>
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
        <label>Show<BoardSelect aria-label="Show" value={activityShow} onChange={event => { setActivityShow(event.target.value); setActivityCutoff(null) }}>
          {ACTIVITY_SHOWS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </BoardSelect></label>
        </>}
      </nav>
      {/* Keyed by view so a view switch never inherits a stale scroll position. */}
      <main key={view}>
        <TabsPanel value="board" className="board-panel" keepMounted>
          {view === 'board' && tasks.length === 0 && <div className="board-empty actions">
            <p role="status">{todoFilter ? 'No open to-dos match these filters.' : activeFilterCount ? 'No tasks match these filters.' : 'No tasks yet. Use New task to add the first one.'}</p>
            {activeFilterCount > 0 && <button type="button" onClick={() => {
              showBoard({})
              setFiltersExpanded(false)
              viewNav.current?.querySelector('[aria-selected="true"]')?.focus()
            }}>Clear filters</button>}
          </div>}
          {view === 'board' && (
          <div className="board" ref={boardViewport} data-filtered={Boolean(stateFilter)} style={{ '--columns': WORK_STATES.length }}
            onFocusCapture={event => {
              if (event.target.matches('.task-card:focus-visible')) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }}>
            {WORK_STATES.filter(column => !stateFilter || column === stateFilter).map((column) => (
              <section
                className="column"
                key={column}
                aria-label={LABELS[column]}
              >
                <h2>
                  {LABELS[column]}{' '}
                  <span className="count">
                    {tasks.filter((task) => task.state === column).length}
                  </span>
                </h2>
                {tasks
                  .filter((task) => task.state === column)
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
                      <strong><bdi>{task.title}</bdi></strong>
                      {(task.assignee || task.priority !== 'p2') && <span className="task-meta">
                        {task.assignee && <bdi>{labelActor(actors[task.assignee])}</bdi>}
                        {task.priority !== 'p2' && <span className="priority">{task.priority}</span>}
                      </span>}
                      {task.state === 'ended' && <span className="task-meta">{task.conflicts.outcome
                        ? 'Outcome disputed' : LABELS[task.outcome]}</span>}
                      {openTodos.has(task.id) && <span className="task-meta">
                        {openTodoLabel(openTodos.get(task.id).length)}
                      </span>}
                      {task.veinIds?.filter(veinId => veins[veinId]).map(veinId => (
                        <span className="vein-label" key={veinId}>{veins[veinId].title}</span>
                      ))}
                      {Object.keys(task.conflicts).length > 0 && (
                        <span className="conflict-label">
                          Conflicting edits
                        </span>
                      )}
                      {session.focus[task.id]?.length > 0 && <FocusMarkers session={session} actorIds={session.focus[task.id]} />}
                    </button>
                  ))}
              </section>
            ))}
          </div>
          )}
        </TabsPanel>
        <TabsPanel value="goals" keepMounted>
          {view === 'goals' && (
          <Goals
            goals={goals}
            veins={veins}
            openTodos={openTodos}
            showVein={showVein}
            actor={actor}
            actors={actors}
            attribution={doc.attribution ?? null}
            submit={submit}
            busy={busy}
            pending={pending}
            errorNotice={errorSlot === 'record' && errorNotice}
            errorOrigin={errorOrigin}
          />
          )}
        </TabsPanel>
        <TabsPanel value="activity" keepMounted>
          {view === 'activity' && (
          <section className="activity">
            <div className="activity-heading">
              <h2>Activity</h2>
              <span className="muted">Showing {visibleCount.toLocaleString()} of {activityEvents.length.toLocaleString()}</span>
            </div>
            {activityEvents.length > 0 && <CurrentLegend />}
            {doc.attribution?.summary?.notDerived > 0 && <p className="muted" role="status">Reading {doc.attribution.summary.notDerived.toLocaleString()} more changes…</p>}
            {!activityEvents.length && <p className="empty">
              {activityShow === 'review' ? emptyReview(doc.attribution)
                : (doc.activity ?? []).length ? 'No activity matches these filters.' : 'No activity yet.'}
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
                    onTask={(element, id) => openPanel(element, () => { setCreating(false); setSelected(id) })}
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
        </TabsPanel>
      </main>
    </div>
  )
  return (
    <Tabs className="app" data-client value={view} onValueChange={setView} style={{ '--client-header-height': `${headerHeight}px` }}>
      {boardContent}
      {creating && (
        <TaskPanel label="New task" modal={fullWidth} onClose={closeCreate}>
          <TaskForm
            actors={actors}
            actor={actor}
            busy={busy}
            pending={Boolean(pending)}
            draft={newTaskDraft}
            onDraftChange={setNewTaskDraft}
            notice={errorSlot === 'create' && errorNotice}
            onClose={closeCreate}
            onSubmit={async (fields) => {
              return submit('task.create', fields)
            }}
          />
        </TaskPanel>
      )}
      {canControl && session.agentSetupOrigin && <AgentSetupDialog request={request} actors={actors} tasks={doc.tasks} actor={actor}
        returnFocus={session.agentSetupOrigin} onClose={session.closeAgentSetup} />}
      {selected && (
        <TaskPanel key={`${selected}:${actor}`} label="Task details" modal={fullWidth} onClose={closeDetails}>
          <TaskDetail
            taskId={selected}
            message={commentDrafts.get(selected) ?? ''}
            onMessageChange={text => updateCommentDraft(selected, text)}
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
            readEditDraft={readEditDraft}
            saveEditDraft={saveEditDraft}
            errorSlot={errorSlot}
            errorNotice={errorNotice}
            todoNotice={todoNotice}
            pendingTodoId={pendingTodoId}
            clearError={() => setError(null)}
            claimHeadingFocus={claimHeadingFocus}
            onClose={closeDetails}
          />
        </TaskPanel>
      )}
    </Tabs>
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

function RecordOutcomeSelect({ kind, record, submit, disabled }) {
  const [choice, setChoice] = useState(null)
  const [select, refocus] = useRefocus()
  return (
    <select
      ref={select}
      aria-label={`Outcome of ${kind} ${record.title}`}
      value={choice ?? record.outcome ?? ''}
      disabled={disabled}
      onChange={async event => {
        const next = event.target.value
        if ((next || null) === record.outcome) return
        setChoice(next)
        await submit(`${kind}.update`, {
          [`${kind}Id`]: record.id,
          updates: { outcome: next || null },
          expectedRevisions: { outcome: record.revisions.outcome },
        })
        setChoice(null)
        refocus()
      }}
    >
      <OutcomeOptions />
    </select>
  )
}

function Goals({ goals, veins, openTodos, showVein, actor, actors, attribution = null, submit, busy, pending, errorNotice, errorOrigin }) {
  const list = Object.values(goals).sort((a, b) =>
    Number(a.state === 'ended') - Number(b.state === 'ended') || a.created_at.localeCompare(b.created_at))
  // Keyed by board data: a Map, so a goal ID such as __proto__ is only a key.
  const veinsByGoal = new Map()
  for (const vein of Object.values(veins).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    for (const goalId of vein.goalIds) veinsByGoal.set(goalId, [...(veinsByGoal.get(goalId) ?? []), vein])
  }
  const disabled = busy || Boolean(pending)
  const outcomeControl = (kind, record) =>
    record.conflicts.outcome
      ? <span className="record-status" data-status="disputed">{disputedOutcomeText(record.conflicts.outcome, LABELS)}</span>
      : <div className="record-outcome">
          <span className="record-status" data-status={record.state}>{LABELS[record.state]}</span>
          {actor ? <RecordOutcomeSelect kind={kind} record={record} submit={submit} disabled={disabled} />
            : record.outcome && <span>{LABELS[record.outcome]}</span>}
        </div>
  const focusAfter = useRef(null)
  const [focusTick, setFocusTick] = useState(0)
  const keptRecord = target => { focusAfter.current = target; setFocusTick(tick => tick + 1) }
  useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    let element = target.element
    if (!element) {
      const root = target.kind === 'goal'
        ? document.querySelector(`.goal[data-goal-id="${CSS.escape(target.record.id)}"]`)
        : target.field === 'goalId'
          ? document.querySelector(`.goal[data-goal-id="${CSS.escape(target.value)}"] li[data-vein-id="${CSS.escape(target.record.id)}"]`)
          : document.querySelector(`li[data-vein-id="${CSS.escape(target.record.id)}"]`)
      element = target.kind === 'goal' ? root?.querySelector('.goal-heading select') ?? root
        : root?.querySelector('select') ?? root?.querySelector('.vein-title')
    }
    if (!element?.isConnected) return
    if (element.disabled) return
    focusAfter.current = null
    element.focus()
  }, [goals, veins, disabled, focusTick])
  const conflicts = (kind, record) => Object.keys(record.conflicts).length > 0 && (
    <RecordConflicts
      kind={kind} record={record} actors={actors} goals={goals} labels={LABELS} labelActor={labelActor}
      submit={submit} disabled={!actor || disabled} onDone={keptRecord}
      changedBy={(field, operationId) => alternativeChangedBySomeoneElse(attribution, `${kind}Fields`, `${record.id}:${field}`, operationId)}
    />
  )
  // The notice sits by its record: under a goal's heading, or in the first row that lists a vein.
  const recordId = errorNotice ? errorOrigin?.recordId : null
  const noticeGoal = goals[recordId]
    ? recordId
    : list.find(goal => (veinsByGoal.get(goal.id) ?? []).some(vein => vein.id === recordId))?.id
  const noticeFallback = errorNotice && !noticeGoal
  return (
    <section className="goals" aria-label="Goals">
      <h2>Goals</h2>
      {noticeFallback && errorNotice}
      {!list.length && <p className="empty">
        No goals yet. Start a vein with <code>pardner vein create --title … --goal …</code>.
      </p>}
      {list.map(goal => {
        const goalVeins = veinsByGoal.get(goal.id) ?? []
        return (
          <article className="goal" key={goal.id} aria-label={goal.title} data-goal-id={goal.id} tabIndex={-1}>
            <div className="goal-heading">
              <h3><bdi>{goal.title}</bdi></h3>
              {outcomeControl('goal', goal)}
            </div>
            {recordId === goal.id && errorNotice}
            {goal.description && <p className="muted goal-description" dir="auto">{goal.description}</p>}
            {conflicts('goal', goal)}
            {!goalVeins.length && <p className="muted">No veins pursue this goal yet.</p>}
            <ul>
              {goalVeins.map(vein => {
                const openCount = vein.taskIds.reduce((total, taskId) => total + (openTodos.get(taskId)?.length ?? 0), 0)
                return (
                <li key={vein.id} data-vein-id={vein.id}>
                  <button className="vein-title" onClick={() => showVein(vein.id)}>{vein.title}</button>
                  <div className="vein-meta">
                    {outcomeControl('vein', vein)}
                    <span className="muted">{vein.taskIds.length} {vein.taskIds.length === 1 ? 'task' : 'tasks'}</span>
                    {vein.readyForVerdict && <span className="verdict-label">Ready for a verdict</span>}
                    {vein.readyForVerdict && openCount > 0 && <span className="muted">{openTodoLabel(openCount)}</span>}
                  </div>
                  {conflicts('vein', vein)}
                  {recordId === vein.id && noticeGoal === goal.id && errorNotice}
                </li>
                )
              })}
            </ul>
          </article>
        )
      })}
    </section>
  )
}

const EMPTY_TASK_DRAFT = {
  fields: { title: '', description: '', priority: 'p2', outcome: null, assignee: null, tags: [] },
  tags: '',
}
const draftIsDirty = ({ fields, tags }) =>
  Boolean(fields.title.trim() || fields.description.trim() || tags.trim()) ||
  fields.outcome !== null || fields.priority !== 'p2' || fields.assignee !== null
const parseTags = text => text.split(',').map(tag => tag.trim()).filter(Boolean)

function matchesLegacyEdit(draft, { updates, expectedRevisions }) {
  // Drafts from before pendingEdit was recorded can be identified by their
  // submitted values and base revisions. Keep ambiguous drafts intact.
  if (draft.pendingEdit || !draft.edited) return false
  const edited = { ...draft.edited, tags: parseTags(draft.tagsText ?? draft.edited.tags.join(', ')) }
  return Object.entries(updates).every(([field, value]) =>
    JSON.stringify(edited[field]) === JSON.stringify(value) &&
    JSON.stringify(draft.revisions[field]) === JSON.stringify(expectedRevisions[field]))
}

function rebaseConfirmedEdit(draft, { updates, expectedRevisions }, operationId) {
  // Use the receipt's revision, not the latest context. Another Actor may have
  // changed a field since this operation, including while its reply was lost.
  const fields = { ...draft.fields }
  const revisions = { ...draft.revisions }
  for (const [field, value] of Object.entries(updates)) {
    // An explicit rebase while pending may already have a newer base.
    if (JSON.stringify(revisions[field]) !== JSON.stringify(expectedRevisions[field])) continue
    fields[field] = field === 'tags' ? [...new Set(value)] : value
    revisions[field] = [operationId]
  }
  const edited = draft.edited ?? draft.fields
  const tags = [...new Set(parseTags(draft.tagsText ?? edited.tags.join(', ')))]
  const dirty = Object.keys(fields).some(field =>
    JSON.stringify(field === 'tags' ? tags : edited[field]) !== JSON.stringify(fields[field]))
  if (!dirty) return null
  const { pendingEdit, ...rest } = draft
  return { ...rest, fields, revisions }
}

function TaskForm({
  actors,
  actor,
  busy,
  pending = false,
  onClose,
  onSubmit,
  initial,
  initialTags,
  onChange,
  editing = false,
  notice,
  draft,
  onDraftChange,
}) {
  // The create form is controlled by Workspace so its draft survives closing; edit keeps local state.
  const controlled = Boolean(onDraftChange)
  const [local, setLocal] = useState(() => ({
    fields: initial || EMPTY_TASK_DRAFT.fields,
    tags: initialTags ?? (initial || EMPTY_TASK_DRAFT.fields).tags.join(', '),
  }))
  const { fields, tags } = controlled ? draft ?? EMPTY_TASK_DRAFT : local
  const update = (patch) => {
    const next = { fields, tags, ...patch }
    if (controlled) onDraftChange(next)
    else {
      setLocal(next)
      onChange?.(next.fields, next.tags)
    }
  }
  const set = (field, value) => update({ fields: { ...fields, [field]: value } })
  const setTags = (value) => update({ tags: value })
  // Per control, not <fieldset disabled>: Retry inside the form must stay enabled.
  const locked = controlled && (busy || pending)
  const [titleBlank, setTitleBlank] = useState(false)
  const noActor = !editing && !actors[actor]
  // A failed submit returns focus to its button once it re-enables; the error is announced, not focused.
  const [submitButton, refocusSubmit] = useRefocus()
  const Container = editing ? 'section' : Fragment
  const containerProps = editing ? { className: 'editor', 'aria-label': 'Edit task' } : {}
  return (
    <Container {...containerProps}>
      {!editing && (
        <div className="panel-heading">
          <h2>New task</h2>
          <TaskPanelClose onClose={onClose} />
        </div>
      )}
      {!editing && (
        <p className="muted" id="new-task-actor">
          {noActor
            ? 'Your Actor isn’t on this board yet. Wait for the project to sync; your draft is kept.'
            : `Creating as ${labelActor(actors[actor])}`}
        </p>
      )}
      <form
        aria-busy={(controlled && busy) || undefined}
        onSubmit={(event) => {
          event.preventDefault()
          if (!fields.title.trim()) {
            setTitleBlank(true)
            event.currentTarget.elements.namedItem('title')?.focus()
            return
          }
          void Promise.resolve(onSubmit({ ...fields, tags: parseTags(tags) }))
            .then(receipt => { if (!receipt) refocusSubmit() })
        }}
      >
        <label>
          Title
          <input
            name="title"
            required
            autoFocus
            readOnly={locked}
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
            readOnly={locked}
            value={fields.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Outcome
            <BoardSelect
              aria-label="Outcome"
              disabled={locked}
              value={fields.outcome ?? ''}
              onChange={(event) => set('outcome', event.target.value || null)}
            >
              <OutcomeOptions />
            </BoardSelect>
          </label>
          <label>
            Priority
            <BoardSelect
              aria-label="Priority"
              disabled={locked}
              value={fields.priority}
              onChange={(event) => set('priority', event.target.value)}
            >
              {['p0', 'p1', 'p2', 'p3'].map((value) => (
                <option key={value} value={value}>{value.toUpperCase()}</option>
              ))}
            </BoardSelect>
          </label>
        </div>
        <SelectActor
          label="Assignee"
          actors={actors}
          value={fields.assignee}
          onChange={(value) => set('assignee', value || null)}
          optional
          disabled={locked}
        />
        <label>
          Tags, separated by commas
          <input
            readOnly={locked}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
        {notice}
        <div className="actions">
          <button className="primary" ref={submitButton} disabled={busy || noActor} aria-describedby={noActor ? 'new-task-actor' : undefined}>
            {editing ? 'Save changes' : busy ? 'Creating…' : 'Create task'}
          </button>
          {controlled && draftIsDirty({ fields, tags }) && (
            <button
              type="button"
              disabled={busy || pending}
              onClick={(event) => {
                const form = event.currentTarget.form
                onDraftChange(null)
                setTitleBlank(false)
                form?.elements.namedItem('title')?.focus()
              }}
            >
              Discard draft
            </button>
          )}
          {editing && (
            <button type="button" onClick={onClose}>
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </Container>
  )
}
/** Links to existing GitHub issues. Pardner stores the reference only; GitHub status never moves the task. */
function IssueLinks({ taskId, issues, canWrite, submit, notice }) {
  const [reference, setReference] = useState('')
  const [invalid, setInvalid] = useState(false)
  return (
    <section aria-label="GitHub issues">
      <h3>GitHub issues</h3>
      {issues.length > 0 && (
        <ul className="issue-links" role="list">
          {issues.map(issue => (
            <li key={`${issue.repository}#${issue.number}`}>
              <a href={issue.url} target="_blank" rel="noreferrer">{issue.repository}#{issue.number}</a>
              <button className="quiet-button" disabled={!canWrite} aria-label={`Unlink ${issue.repository}#${issue.number}`} onClick={() => submit('task.unlink-issue', {
                taskId, repository: issue.repository, number: issue.number, expectedRevisions: issue.revisions,
              })}>Unlink</button>
            </li>
          ))}
        </ul>
      )}
      <form className="issue-link-form" onSubmit={async event => {
        event.preventDefault()
        const match = /^\s*([^#\s]+\/[^#\s]+)#(\d+)\s*$/.exec(reference)
        setInvalid(!match)
        if (!match) return
        const receipt = await submit('task.link-issue', { taskId, repository: match[1], number: Number(match[2]) })
        if (receipt) setReference(current => current === reference ? '' : current)
      }}>
        <label>Link GitHub issue<input placeholder="owner/repo#123" value={reference} onChange={event => setReference(event.target.value)} /></label>
        <button disabled={!canWrite || !reference.trim()}>Link issue</button>
        {invalid && <p className="error" role="alert">Name the issue as owner/repo#number.</p>}
        {notice}
      </form>
    </section>
  )
}

function TaskDetail({
  taskId,
  message,
  onMessageChange,
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
  session,
  readEditDraft,
  saveEditDraft,
  errorSlot,
  errorNotice,
  todoNotice,
  pendingTodoId,
  clearError,
  claimHeadingFocus,
  onClose,
}) {
  const [context, setContext] = useState(null)
  const [contextAttempt, setContextAttempt] = useState(0)
  const heading = useRef(null)
  const [actionSummary, refocusActions] = useRefocus()
  const [handoffButton, refocusHandoff] = useRefocus()
  const [commentButton, refocusComment] = useRefocus()
  const commentsHeading = useRef(null)
  const [outcomeChoice, setOutcomeChoice] = useState(null)
  const [outcomeSelect, refocusOutcome] = useRefocus()
  const [todoOpener, refocusTodoOpener] = useRefocus()
  const failedTodoId = errorSlot === 'todo.complete' ? todoNotice?.id : null
  useLayoutEffect(() => {
    if (!failedTodoId) return
    const row = document.getElementById(`todo-check-${failedTodoId}`)?.closest('.task-todo-row')
    if (row === document.activeElement) row.querySelector(':scope > [role="alert"]')?.scrollIntoView({ block: 'nearest' })
  }, [failedTodoId])
  // Focus before the new controls can receive input, once per open.
  useLayoutEffect(() => {
    if (context && heading.current && claimHeadingFocus()) heading.current.focus()
  }, [context, claimHeadingFocus])
  // An edit draft survives closing the panel, reloading the tab and switching
  // projects. It is stored per project, Actor and task, never sent until saved.
  const [draft, setDraftState] = useState(() => readEditDraft(taskId))
  const setDraft = useCallback(value => {
    setDraftState(value)
    saveEditDraft(taskId, value)
  }, [saveEditDraft, taskId])
  const persistDraftEdits = useCallback((edited, tagsText) => {
    const current = readEditDraft(taskId)
    if (current) saveEditDraft(taskId, { ...current, edited, tagsText })
  }, [readEditDraft, saveEditDraft, taskId])
  const [commentFocused, setCommentFocused] = useState(false)
  const [to, setTo] = useState('')
  const [handoffMessage, setHandoffMessage] = useState('')
  const [failure, setFailure] = useState(null)
  const [handoffBase, setHandoffBase] = useState(null)
  const [handoffMode, setHandoffMode] = useState(null)
  const handoffOpen = handoffMode !== null
  const assigningTodo = handoffMode === 'todo'
  const [handoffDone, setHandoffDone] = useState(null)
  const handoffForm = useRef(null)
  const focusRecipient = useRef(false)
  // Latest values for async completions, which must not act on a stale closure.
  const handoffLive = useRef({})
  handoffLive.current = { mode: handoffMode, message: handoffMessage, to }
  useEffect(() => {
    if (!handoffOpen || !focusRecipient.current) return
    focusRecipient.current = false
    handoffForm.current?.querySelector('select')?.focus()
  }, [handoffOpen])
  const finishHandoff = useCallback((mode, sentTo) => {
    setHandoffMode(null)
    setTo('')
    setHandoffMessage('')
    setHandoffBase(null)
    setHandoffDone({ to: sentTo, mode })
    if (mode === 'todo') heading.current?.focus({ preventScroll: true })
    else refocusActions()
  }, [refocusActions])
  useEffect(() => {
    if (confirmedOperation?.payload.taskId !== taskId) return
    if (confirmedOperation.editDraft !== undefined && readEditDraft(taskId) === confirmedOperation.editDraft) {
      setDraftState(confirmedOperation.editDraft)
      if (!confirmedOperation.editDraft) refocusActions()
    }
    const { mode, message: current } = handoffLive.current
    const { type, payload } = confirmedOperation
    if (mode === 'transfer' && type === 'task.handoff' && current === payload.message && handoffLive.current.to === payload.to) finishHandoff(mode, payload.to)
    if (mode === 'todo' && type === 'todo.add' && current === payload.text && handoffLive.current.to === payload.to) finishHandoff(mode, payload.to)
  }, [confirmedOperation, taskId, finishHandoff, readEditDraft, refocusActions])
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
  }, [taskId, actor, heads, request, contextAttempt])
  const panelHeading = (
    <div className="panel-heading task-panel-heading">
      <h2 className={context ? 'task-title' : undefined} tabIndex={0} ref={heading} onKeyDown={event => {
        const title = event.currentTarget
        if (title.scrollHeight <= title.clientHeight || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        title.scrollBy({ top: title.clientHeight / 2 * (event.key === 'ArrowDown' ? 1 : -1) })
      }}>
        {context ? <bdi>{context.task.title}</bdi> : 'Task details'}
      </h2>
      <TaskPanelClose autoFocus={!context} onClose={onClose} />
    </div>
  )
  const readError = failure && (
    <div className="error" role="alert">
      <strong>{context ? 'Couldn’t refresh task' : 'Couldn’t open task'}</strong>
      <p>{failure.message}</p>
      <button type="button" onClick={() => {
        heading.current.focus({ preventScroll: true })
        setFailure(null)
        setContextAttempt(attempt => attempt + 1)
      }}>Retry</button>
    </div>
  )
  if (!context)
    return (
      <>
        {panelHeading}
        <div className="task-panel-body">
          {readError || <p role="status">Opening task…</p>}
          {todoNotice?.content ?? errorNotice}
        </div>
      </>
    )
  const { task, comments, conflicts, revisions } = context
  const todos = comments.filter(comment => comment.todo)
  const inlineTodoNotice = !draft && todos.some(comment => comment.id === todoNotice?.id)
  const confirmedTodo = confirmedOperation?.type === 'todo.complete' && todos.some(comment =>
    comment.id === confirmedOperation.payload.commentId && comment.todo.completion)
  // History is the task's Activity entries, each derived from the change that wrote it, newest first.
  const historyRows = sortEvents(taskRows({ activity: lookups.activity, attribution: lookups.attribution }, taskId).filter(row => row.type !== 'comment.add'))
  const canWrite = Boolean(actor) && !busy
  const newCount = actor ? comments.filter(comment => isNewComment(comment, actor)).length : 0
  // Lowercase handle -> "Name · kind" for Actors a comment actually notified.
  const deliveredFor = (commentId) => new Map(context.mentions
    .filter(mention => mention.commentId === commentId && actors[mention.toActorId])
    .map(mention => [String(actors[mention.toActorId].handle).toLowerCase(), labelActor(actors[mention.toActorId])]))
  const hint = mentionHint(unmatchedHandles(message, actors, { focused: commentFocused }))
  const handoffRevisions = { assignee: revisions.assignee }
  const openHandoff = mode => {
    actionSummary.current?.parentElement.removeAttribute('open')
    focusRecipient.current = true
    setHandoffDone(null)
    setHandoffBase(mode === 'transfer' ? handoffRevisions : null)
    setHandoffMode(mode)
  }
  const showTodos = !draft && (todos.length > 0 || assigningTodo)
  const assignTodo = !handoffOpen && <button type="button" className="quiet-button" ref={todos.length > 0 ? todoOpener : undefined}
    disabled={!canWrite} onClick={() => openHandoff('todo')}>Assign to-do</button>
  const statusLabel = conflicts.outcome ? 'Outcome disputed' : LABELS[task.outcome ?? task.state]
  const handoffStale = handoffBase && JSON.stringify(handoffBase.assignee) !== JSON.stringify(revisions.assignee)
  // A receipt can arrive before the context refresh. Its previous revision
  // is older than the rebased draft, so wait for context to catch up.
  const previousRevisions = draft && confirmedOperation?.editDraft === draft
    ? confirmedOperation.payload.expectedRevisions
    : {}
  const newerFields = draft
    ? Object.keys(draft.fields).filter(field => {
      const observed = JSON.stringify(revisions[field])
      return observed !== JSON.stringify(draft.revisions[field]) &&
        (!Object.hasOwn(previousRevisions, field) || observed !== JSON.stringify(previousRevisions[field]))
    })
    : []
  const newerGroups = newerAuthors({ fields: newerFields, taskId, revisions, historyRows, attribution: lookups.attribution, activity: lookups.activity })
  const listFields = fields => fields.length < 2 ? fields.join('') : `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}`
  const newerNotice = newerGroups.map(({ by, unconfirmed, fields }) =>
    `${by ? `${labelActor(actors[by])}${unconfirmed ? ' (unconfirmed, see Activity)' : ''}` : 'Someone'} saved ${fields.length === 1 && fields[0] === 'tags' ? '' : 'a '}newer ${listFields(fields)}`).join('; ')
  const here = session.focus[taskId] ? focusedActors(session, session.focus[taskId]) : []
  // An edit error falls back to the panel top once its form has closed.
  // A handoff error does too while its form is closed, so Retry stays visible.
  const formSlot = (errorSlot === 'task.update' && !draft) || (['task.handoff', 'todo.add'].includes(errorSlot) && !handoffOpen)
    ? 'panel'
    : errorSlot
  const noticeFor = slot => formSlot === slot && errorNotice
  const handoffEditor = handoffOpen && (
    <form
      ref={handoffForm}
      onFocusCapture={() => {
        if (!assigningTodo) setHandoffBase(current => current ?? handoffRevisions)
      }}
      onSubmit={async (event) => {
        event.preventDefault()
        const sent = assigningTodo
          ? { taskId, to, text: handoffMessage }
          : { taskId, to, message: handoffMessage, expectedRevisions: handoffBase }
        const receipt = await submit(assigningTodo ? 'todo.add' : 'task.handoff', sent)
        const { mode, message: current, to: recipient } = handoffLive.current
        if (!receipt) refocusHandoff()
        else if (mode === handoffMode && current === handoffMessage && recipient === to) finishHandoff(mode, to)
      }}
    >
      {handoffStale && (
        <div className="notice" role="status">
          <p>This task changed while you were writing: now {labelActor(actors[task.assignee])} · {LABELS[task.state]}. Your draft is preserved.</p>
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => {
              setHandoffBase(handoffRevisions)
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
        {assigningTodo ? 'To-do' : 'Handoff message'}
        <textarea
          aria-label={assigningTodo ? 'To-do' : 'Handoff message'}
          required
          value={handoffMessage}
          onChange={(event) => setHandoffMessage(event.target.value)}
        />
      </label>
      {noticeFor(assigningTodo ? 'todo.add' : 'task.handoff')}
      <div className="actions">
        <button className="primary" ref={handoffButton} disabled={!canWrite || !to || handoffStale || !handoffMessage.trim()}>{assigningTodo ? 'Assign to-do' : 'Hand off'}</button>
        <button
          type="button"
          onClick={() => {
            setHandoffMode(null)
            setTo('')
            setHandoffMessage('')
            setHandoffBase(null)
            clearError()
            if (assigningTodo && todos.length > 0) refocusTodoOpener()
            else refocusActions()
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
  const details = (
    <div className="task-panel-body">
      <div className="task-overview">
        <div className="task-context">
          <div className="task-meta">
            <p className="task-identifiers">
              <strong>{statusLabel}</strong>
              <span><bdi>{labelActor(actors[task.assignee])}</bdi>{' · '}<span className="priority">{task.priority}</span></span>
            </p>
            {here.length > 0 && <div className="here-now">
              <span className="muted">Here now</span>
              <AvatarStack actors={here} index={session.index} max={6} size="sm" label="Here now" labelSuffix=", on this task"
                onOpen={session.onOpenProfile} />
            </div>}
          </div>
          {context.veins?.length > 0 && <p className="muted">Veins: {context.veins.map(vein => vein.title).join(', ')}</p>}
        </div>
        {!draft && actor && (
          <details className="task-action-disclosure">
            <summary className="quiet-button" ref={actionSummary}>Task actions <Chevron /></summary>
            <div className="task-secondary-actions">
              {!handoffOpen && !conflicts.outcome && (
                <label className="status-field">
                  Set outcome
                  <BoardSelect aria-label="Outcome" ref={outcomeSelect} disabled={!canWrite} value={outcomeChoice ?? task.outcome ?? ''}
                    onChange={async event => {
                      const next = event.target.value
                      if ((next || null) === task.outcome) return
                      setOutcomeChoice(next)
                      await submit('task.update', { taskId, updates: { outcome: next || null }, expectedRevisions: { outcome: revisions.outcome } })
                      setOutcomeChoice(null)
                      refocusOutcome()
                    }}>
                    <OutcomeOptions />
                  </BoardSelect>
                </label>
              )}
              <div className="actions">
                <button type="button" className="quiet-button" disabled={!canWrite} onClick={() => setDraft({
                  fields: Object.fromEntries(
                    ['title', 'description', 'outcome', 'priority', 'assignee', 'tags'].map(field => [field, task[field]]),
                  ),
                  revisions,
                })}>Edit task</button>
                {!handoffOpen && <button type="button" className="quiet-button" disabled={!canWrite || Boolean(conflicts.assignee)}
                  onClick={() => openHandoff('transfer')}>Hand off work</button>}
                {todos.length === 0 && assignTodo}
              </div>
            </div>
          </details>
        )}
      </div>
      {handoffDone && (
        <p role="status" className="muted">
          {handoffDone.mode === 'todo' ? 'To-do assigned to' : 'Handed off to'} {actorName(actors, handoffDone.to)}.
        </p>
      )}
      {emptyFields(context.unreadable, 'task', taskId).length > 0 && <p className="notice warning" role="status">
        Shown empty, because what this task holds there can’t be read: {emptyFields(context.unreadable, 'task', taskId).join(', ')}.</p>}
      {readError}
      {!inlineTodoNotice && !FORM_SLOTS.includes(formSlot) && (todoNotice?.content ?? errorNotice)}
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
              {alternativeChangedBySomeoneElse(lookups.attribution, 'taskFields', `${taskId}:${field}`, choice.operationId)
                && <p className="comment-changed" role="note">Changed by someone other than {labelActor(actors[choice.actorId])}. See Activity.</p>}
              <p>
                {field === 'outcome' ? LABELS[choice.value] ?? 'No outcome'
                  : typeof choice.value === 'string' ? choice.value : JSON.stringify(choice.value)}
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
      {draft && newerFields.length > 0 && (
        <div className="notice warning draft-notice" role="status">
          <p>
            {newerNotice} since
            you started editing. Your draft is unchanged.
          </p>
          <p className="muted small">If you also changed {newerFields.length === 1 ? 'that field' : 'those fields'}, saving is
            refused until you choose. Basing your draft on the latest version makes your save an explicit replacement.</p>
          <button type="button" onClick={() => {
            // Fields this user never touched follow the latest version; fields they changed stay as an explicit replacement.
            const current = readEditDraft(taskId)
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
          onClose={() => { setDraft(null); clearError(); refocusActions() }}
          onSubmit={async (fields) => {
            const updates = Object.fromEntries(
              Object.entries(fields).filter(
                ([key, value]) =>
                  JSON.stringify(value) !== JSON.stringify(draft.fields[key]),
              ),
            )
            if (!Object.keys(updates).length) {
              setDraft(null)
              refocusActions()
              return true
            }
            return submit('task.update', {
              taskId,
              updates,
              expectedRevisions: Object.fromEntries(
                Object.keys(updates).map(key => [key, draft.revisions[key]]),
              ),
            }, { fromEditor: true })
          }}
        />
      ) : <MarkdownBody>{task.description || 'No description yet.'}</MarkdownBody>}
      {showTodos && (
        <section className="task-todos" aria-labelledby="task-todos-heading">
          <div className="section-heading">
            <h3 id="task-todos-heading">To-dos</h3>
            {assignTodo}
          </div>
          <div className="task-todo-status muted small" role="status">
            {confirmedTodo && <span key={confirmedOperation.operationId}>To-do marked done.</span>}
          </div>
          {todos.length > 0 && <ul role="list">
            {todos.map(({ id, content, todo }) => (
              <li key={id} id={`todo-item-${id}`} className="task-todo-row" tabIndex={-1}>
                <label className="task-todo-control">
                  <input
                    id={`todo-check-${id}`}
                    type="checkbox"
                    aria-labelledby={`todo-text-${id}`}
                    checked={Boolean(todo.completion)}
                    disabled={!canWrite || pendingTodoId === id || todo.assignee !== actor || Boolean(todo.completion)}
                    onChange={event => {
                      event.currentTarget.closest('li').focus({ preventScroll: true })
                      void submit('todo.complete', { commentId: id })
                    }}
                  />
                </label>
                <div>
                  <div id={`todo-text-${id}`}>
                    <MarkdownBody labelFor={`todo-check-${id}`} assigneeHandle={actors[todo.assignee]?.handle || todo.assignee}
                      extraPlugins={[remarkMentionChips(deliveredFor(id))]}>{content}</MarkdownBody>
                  </div>
                  {todo.completion && <p className="task-todo-done muted"><strong>Done</strong></p>}
                </div>
                {id === todoNotice?.id && todoNotice.content}
              </li>
            ))}
          </ul>}
          {assigningTodo && handoffEditor}
        </section>
      )}
      {!draft && handoffMode === 'transfer' && (
        <section className="task-handoff">
          <h3>Hand off work</h3>
          {handoffEditor}
        </section>
      )}
      <section className="task-discussion">
        <div className="section-heading">
          <div className="discussion-title">
            <h3 ref={commentsHeading} tabIndex={-1}>
              Comments{comments.length > 0 && <span className="count"> {comments.length}</span>}
              {actor && newCount > 0 && <span className="comment-new-count"> · {newCount} new</span>}
            </h3>
            <PendingReplication status={status} connected={connected} heads={heads} />
          </div>
          {newCount > 0 && (
            <button
              className="quiet-button"
              disabled={!canWrite}
              onClick={event => {
                if (document.activeElement === event.currentTarget) commentsHeading.current.focus({ preventScroll: true })
                void submit('read.mark', {
                  taskId,
                  comments: comments.flatMap((comment) =>
                    comment.revisionIds.map((revisionId) => ({
                      commentId: comment.id,
                      revisionId,
                    })),
                  ),
                })
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        {comments.map((comment) => {
          const isNew = isNewComment(comment, actor)
          const todo = comment.todo
          const completion = todo?.completion
          const hasConflict = comment.conflicts.length > 0
          const distinctAuthors = comment.conflicts.some(choice => choice.actorId !== comment.actorId)
          return (
            <article className={`comment${todo ? ' todo-activity' : ''}${isNew ? ' is-new' : ''}`} key={comment.id}>
              <div className="comment-head">
                <div className="comment-byline">
                  <strong><bdi>{labelActor(actors[comment.actorId])}</bdi></strong>
                  {isNew && <span className="comment-tag">New</span>}
                </div>
                <time dateTime={comment.timestamp} dir="auto">{new Date(comment.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </div>
              {/* The comment as it is now names its recorded author, with no signer line; a change by anyone else to it says so. */}
              {changedBySomeoneElse(lookups.attribution, comment.id) && <p className="comment-changed" role="note">Changed by someone other than its author. See Activity for who made each change.</p>}
              {!todo && !hasConflict && (
                <MarkdownBody extraPlugins={[remarkMentionChips(deliveredFor(comment.id))]}>{comment.content}</MarkdownBody>
              )}
              {todo && <div className="comment-todo">
                {showTodos ? (
                  <button type="button" className="quiet-button todo-activity-link" aria-describedby={`todo-text-${comment.id}`} onClick={() => {
                    const item = document.getElementById(`todo-item-${comment.id}`)
                    item.scrollIntoView({ block: 'center' })
                    item.focus({ preventScroll: true })
                  }}>To-do for <bdi>{actorName(actors, todo.assignee)}</bdi></button>
                ) : <span>To-do for <bdi>{actorName(actors, todo.assignee)}</bdi></span>}
                {completion && <div><span>Done by <bdi>{actorName(actors, completion.actorId)}</bdi></span> · <time dateTime={completion.timestamp} dir="auto">
                  {new Date(completion.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </time></div>}
              </div>}
              {hasConflict && comment.actorId !== actor && (
                <p className="muted small">Only the comment author can resolve these edits.</p>
              )}
              {hasConflict && (
                <div className="conflict comment-conflict" role="group" aria-label="Competing comment edits">
                  {comment.conflicts.map(choice => (
                    <div key={choice.operationId}>
                      {distinctAuthors && <strong><bdi>{labelActor(actors[choice.actorId])}</bdi></strong>}
                      {alternativeChangedBySomeoneElse(lookups.attribution, 'commentBodies', comment.id, choice.operationId)
                        && <p className="comment-changed" role="note">Changed by someone other than {labelActor(actors[choice.actorId])}. See Activity.</p>}
                      <MarkdownBody>{choice.value}</MarkdownBody>
                      <button
                        disabled={!canWrite || comment.actorId !== actor}
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
                </div>
              )}
            </article>
          )
        })}
      </section>
      <div className="task-supporting">
        {session.canControl && <TaskAgentRuns request={request} actors={actors} taskId={taskId} actor={actor} />}
        <IssueLinks taskId={taskId} issues={context.issues ?? []} canWrite={canWrite} submit={submit}
          notice={noticeFor('task.link-issue') || noticeFor('task.unlink-issue')} />
        {context.evidence.length > 0 && <section>
          <h3>Evidence</h3>
          {context.evidence.map((commit, index) => (
              <article key={`${commit.hash}:${index}`}>
                <code>{commit.hash}</code>
                <p>{commit.message}</p>
              </article>
            ))}
        </section>}
        <section>
          <h3>History</h3>
          {historyRows.length > 0 && <CurrentLegend />}
          {historyRows.map(event => (
            <EventRow
              key={event.operationId}
              event={event}
              lookups={lookups}
              within={taskId}
              formatTime={when => when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            />
          ))}
        </section>
      </div>
    </div>
  )
  return (
    <>
      {panelHeading}
      {details}
      <form className="comment-composer"
        onSubmit={async (event) => {
          event.preventDefault()
          const receipt = await submit('comment.add', { taskId, text: message })
          if (!receipt) refocusComment()
        }}
      >
        <label>
          Comment
          <textarea
            aria-label="Comment"
            rows={2}
            required
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onFocus={() => setCommentFocused(true)}
            onBlur={() => setCommentFocused(false)}
            aria-describedby={hint ? 'comment-mention-hint' : undefined}
            placeholder="Share progress or mention an Actor with @handle"
          />
        </label>
        {hint && <p id="comment-mention-hint" className="muted mention-hint">{hint}</p>}
        {noticeFor('comment.add')}
        <button className={draft || handoffOpen ? undefined : 'primary'} ref={commentButton} disabled={!canWrite || !message.trim()}>
          Add comment
        </button>
      </form>
    </>
  )
}
