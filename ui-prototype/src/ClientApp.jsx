import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Workspace } from './Pardner.jsx'
import { Avatar, AvatarStack, PeopleDialog, ProfileDialog, actorName, avatarLabel } from './Avatar.jsx'
import {
  consumeCapturedGrant, createClientApi, harnessLabel, invitationPreview, projectConfiguration, syncLabel, takeBootstrapGrant,
} from './client-api.js'
import { Failure } from './Failure.jsx'
import { INVITES, InviteDialog } from './Invitations.jsx'
import { createOperationId } from './operation-id.js'
import { PeoplePanel } from './PeoplePanel.jsx'
import { createPresenceReporter, focusByTask, presenceIndex, presenceOf, sortParticipants } from './presence.js'

const LAST_PROJECT = 'pardner:client:last-project'
const PENDING_CREATE = 'pardner:client:pending-create'
const PENDING_JOIN = 'pardner:client:pending-join'
const PRESENCE_POLL_MS = 5000
const PROJECT_POLL_MS = 15000
const JOIN_POLL_MS = 1500
const REQUESTS_POLL_MS = 5000
const PAIRING_DISMISSED = projectId => `pardner:${projectId}:pairing-suggestion-dismissed`

const readJson = (store, key) => { try { return JSON.parse(store.getItem(key)) } catch { return null } }
const writeJson = (store, key, value) => {
  try { value === null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value)) } catch { /* optional convenience */ }
}

async function digest(text) {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

export default function ClientApp({ config }) {
  const api = useMemo(() => createClientApi(config), [config])
  const [phase, setPhase] = useState({ name: 'loading' })
  const [session, setSession] = useState(null)
  const [projectId, setProjectId] = useState(() => { try { return localStorage.getItem(LAST_PROJECT) } catch { return null } })
  const [choosing, setChoosing] = useState(false)
  const open = useCallback(async grant => {
    let bootstrapFailure = null
    if (grant) { try { await api.bootstrap(grant) } catch (failure) { bootstrapFailure = failure } }
    try {
      setSession(await api.session())
      setPhase({ name: 'ready' })
    } catch (failure) {
      // A used link is harmless when this browser is already signed in.
      setPhase(failure.code === 'AUTH_REQUIRED' || failure.status === 401
        ? { name: 'signed-out', failure: bootstrapFailure } : { name: 'error', failure })
    }
  }, [api])
  useEffect(() => {
    void open(consumeCapturedGrant())
    const onHash = () => { const grant = takeBootstrapGrant(); if (grant) void open(grant) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [open])
  const refreshSession = useCallback(async () => {
    try { const next = await api.session(); setSession(next); return next }
    catch (failure) { if (failure.code === 'AUTH_REQUIRED') setPhase({ name: 'signed-out' }); throw failure }
  }, [api])
  const selectProject = useCallback(id => {
    setProjectId(id)
    setChoosing(false)
    try { localStorage.setItem(LAST_PROJECT, id) } catch { /* optional convenience */ }
  }, [])
  const authLost = useCallback(() => setPhase({ name: 'signed-out' }), [])

  if (phase.name === 'loading') return <main className="connection"><h1>Pardner</h1><p role="status">Opening your local client…</p></main>
  if (phase.name === 'signed-out') return <SignedOut failure={phase.failure} retry={() => open(null)} />
  if (phase.name === 'error') return <main className="connection">
    <h1>Pardner</h1>
    <Failure error={phase.failure}><button onClick={() => { setPhase({ name: 'loading' }); void open(null) }}>Retry</button></Failure>
  </main>
  if (!session.identity) return <IdentityStep api={api} session={session} onDone={next => setSession(next)} />
  const projects = session.projects ?? []
  // A project this computer was removed from stays visible as removed, never as "signed out" or gone (#154).
  const removedProjects = (session.removedProjects ?? []).map(project => ({ ...project, removed: true }))
  const current = projects.find(project => project.id === projectId) ?? removedProjects.find(project => project.id === projectId)
    ?? projects[0] ?? removedProjects[0]
  if (choosing || !current) return <Welcome api={api} session={session} current={current}
    onBack={current ? () => setChoosing(false) : null}
    onReady={async project => { await refreshSession().catch(() => {}); selectProject(project.id) }} />
  const switcher = { projects: [...projects, ...removedProjects], onSelect: selectProject, onStartOrJoin: () => setChoosing(true) }
  if (current.removed) return <RemovedProject project={current} switcher={switcher} />
  return <ProjectView key={current.id} api={api} session={session} project={current} switcher={switcher}
    onAuthLost={authLost} refreshSession={refreshSession} />
}

/** Shown on a computer removed from a project, or whose person was removed or left: what happened and how to come back. */
function RemovedProject({ project, switcher }) {
  const removal = project.removal
  const by = removal?.by?.name
  const machine = removal?.kind === 'machine'
  const title = removal?.left ? `You left “${project.name}”`
    : machine ? `This computer was removed from “${project.name}”`
      : removal?.kind === 'person' ? `You were removed from “${project.name}”` : `This computer is no longer in “${project.name}”`
  const lead = removal?.left ? 'You chose to leave this project.'
    : by ? `${by} removed ${machine ? 'this computer' : 'you'}.` : 'Its removal was recorded by the project.'
  const [copied, setCopied] = useState(null)
  const exportCommand = `pardner client export --project ${project.id} --output-file board.json`
  const copyCommand = async () => { try { await navigator.clipboard.writeText(exportCommand); setCopied('done') } catch { setCopied('failed') } }
  // The page scrolls as a document: this screen has no board to keep in view.
  return <div className="removed-app" data-client>
    <header className="client-header">
      <div className="client-identity">
        <span className="brand">Pardner</span>
        <ProjectSwitcher {...switcher} current={project} />
      </div>
    </header>
    <main className="connection client-entry removed-project" aria-labelledby="removed-title">
      <p className="tag removed-tag">{removal?.left ? 'Left' : 'Removed'}</p>
      <h1 id="removed-title">{title}</h1>
      <p className="lead">{lead} {machine ? 'You may still be a member on your other machines.' : ''}</p>
      <section aria-labelledby="removed-means">
        <h2 id="removed-means">What this means</h2>
        <ul>
          <li>This computer no longer syncs with the project, and nothing new from it reaches the others.</li>
          <li>{machine ? 'Work done from this computer stays in the project under your name.' : 'Your earlier work stays in the project under your name.'}</li>
          <li>The copy on this computer stays saved here. It isn’t updated any more.</li>
        </ul>
      </section>
      <section aria-labelledby="removed-back">
        <h2 id="removed-back">To come back</h2>
        {machine ? <p>Ask for a My device invitation from one of your other machines in the project, or from the owner or an admin.
          Then start Pardner on this computer with a fresh client directory, for example <code>pardner open --data ~/.pardner/client-2</code>, and join from there.
          This computer then joins as a new machine of yours.</p>
          : <p>Ask the owner or an admin for a new invitation. Then start Pardner with a fresh client directory, for example <code>pardner open --data ~/.pardner/client-2</code>,
          and join from there. You join as a new person; your earlier work stays under your old entry.</p>}
      </section>
      <section aria-labelledby="removed-copy">
        <h2 id="removed-copy">Keep a readable copy</h2>
        <p>Run this on this computer to save the board as a readable file:</p>
        <pre className="command"><code>{exportCommand}</code></pre>
        <p className="muted small"><button type="button" className="link-button" onClick={copyCommand}>Copy command</button>
          <span role="status">{copied === 'done' ? ' Copied.' : copied === 'failed' ? ' This browser blocked copying; select the command instead.' : ''}</span></p>
      </section>
      <div className="actions">
        <button type="button" onClick={switcher.onStartOrJoin}>Start or join a project</button>
      </div>
    </main>
  </div>
}

function SignedOut({ failure, retry }) {
  return <main className="connection client-entry">
    <h1>Pardner</h1>
    <p className="lead">This browser isn’t signed in to your local Pardner client.</p>
    {failure && <div className="notice inline-notice" role="status">
      <p>This sign-in link was already used or is more than 60 seconds old. Links work once.</p>
    </div>}
    <p>Run <code>pardner open</code> on this computer, or ask your agent to. It signs this browser in without showing you a key.</p>
    <button onClick={retry}>Check again</button>
  </main>
}

function IdentityStep({ api, session, onDone }) {
  const suggested = session.suggestedIdentity ?? {}
  const [name, setName] = useState(suggested.name ?? '')
  const [email, setEmail] = useState(suggested.email ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const attempt = useRef(null)
  const gitNote = suggested.name && suggested.email ? 'Filled in from your Git configuration. '
    : suggested.name ? 'Name filled in from your Git configuration; enter your email. '
      : suggested.email ? 'Email filled in from your Git configuration; enter your name. '
        : 'Git didn’t provide a name and email here, so enter them once. '
  const submit = async event => {
    event.preventDefault()
    const input = { name: name.trim(), email: email.trim() }
    if (!attempt.current || attempt.current.name !== input.name || attempt.current.email !== input.email) {
      attempt.current = { ...input, operationId: createOperationId() }
    }
    setBusy(true); setFailure(null)
    try { onDone(await api.setIdentity(attempt.current)) }
    catch (error) { setFailure(error); if (error.code === 'OPERATION_ID_REUSED') attempt.current = null }
    finally { setBusy(false) }
  }
  const [linking, setLinking] = useState(false)
  if (linking) return <main className="connection client-entry welcome">
    <h1>Link this device</h1>
    <p className="lead">A My device invitation from your own client adds this computer under your existing identity.</p>
    <JoinForm api={api} identityId={null} label="Link this device" invitationLabel="My device invitation" action="Link device" busyLabel="Linking…"
      accept={purpose => purpose === 'device' ? null : Object.assign(new Error(purpose === 'agent' ? 'Agent invitations are for your agent, not this browser.'
        : purpose === 'human' ? 'This is a Human invitation. Confirm your identity first, then join with it.' : 'Paste one complete My device invitation.'),
      { code: 'DEVICE_INVITATION_REQUIRED' })}
      onReady={async () => onDone(await api.session())} />
    <button type="button" className="back" onClick={() => setLinking(false)}>Back to confirming my identity</button>
  </main>
  return <main className="connection client-entry">
    <h1>Welcome to Pardner</h1>
    <p className="lead">Confirm how people in your projects will see you.</p>
    <form onSubmit={submit}>
      <label>Name<input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <p className="muted small">
        {gitNote}
        Your profile shows these to project members. They don’t sign you in, and Pardner never changes your Git settings.
      </p>
      <Failure error={failure} />
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : `Continue as ${name.trim() || 'this person'}`}</button>
    </form>
    <p className="muted small">This device: {session.device?.name || 'Not reported'}</p>
    <p className="muted small">Already use Pardner on another computer? <button type="button" className="link-button" onClick={() => setLinking(true)}>Link this device instead</button></p>
  </main>
}

/** Join with a pasted invitation. Only a digest and the attempt ID are stored, never the invitation,
 *  so a reload and re-paste resumes the same recipient-bound attempt. A new machine then waits for
 *  approval: the form polls the same attempt and shows its confirmation code once the approver opens it. */
function JoinForm({ api, identityId, label, invitationLabel = 'Invitation', action = 'Join project', busyLabel = 'Joining…', hint, accept, onReady }) {
  const [invitation, setInvitation] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [waiting, setWaiting] = useState(null)
  const joinAttempt = useRef(null)
  const preview = useMemo(() => invitationPreview(invitation), [invitation])
  const finish = useCallback(async project => {
    writeJson(sessionStorage, PENDING_JOIN, null)
    joinAttempt.current = null
    setInvitation(''); setWaiting(null)
    await onReady(project)
  }, [onReady])
  const failed = useCallback(error => {
    setFailure(error); setWaiting(null)
    const retryable = !error.status || error.status >= 500 || error.code === 'AUTH_REQUIRED'
    if (!retryable) { writeJson(sessionStorage, PENDING_JOIN, null); joinAttempt.current = null }
  }, [])
  // Each answer schedules the next poll; an outage keeps waiting on the same attempt.
  useEffect(() => {
    if (!waiting) return
    let stopped = false
    const timer = setTimeout(async () => {
      try {
        const result = await api.join({ invitation: waiting.text, operationId: waiting.operationId })
        if (stopped) return
        if (result.project) await finish(result.project)
        else setWaiting(current => current && { ...current, join: result.join, outage: null })
      } catch (error) {
        if (stopped) return
        if (!error.status || error.status >= 500) setWaiting(current => current && { ...current, outage: error })
        else failed(error)
      }
    }, JOIN_POLL_MS)
    return () => { stopped = true; clearTimeout(timer) }
  }, [api, waiting, finish, failed])
  const join = async event => {
    event.preventDefault()
    const text = invitation.trim()
    setFailure(null)
    // A refused purpose never reaches the server, so the invitation stays usable by its intended recipient.
    const refused = accept?.(preview?.purpose ?? null)
    if (refused) { setFailure(refused); return }
    setBusy(true)
    const invitationHash = await digest(text)
    const stored = readJson(sessionStorage, PENDING_JOIN)
    const attempt = invitationHash && stored?.invitationHash === invitationHash && stored.identityId === identityId
      ? stored : invitationHash ? { invitationHash, identityId, operationId: createOperationId() }
        : joinAttempt.current?.text === text ? joinAttempt.current : { text, operationId: createOperationId() }
    if (invitationHash) writeJson(sessionStorage, PENDING_JOIN, attempt)
    else joinAttempt.current = attempt
    try {
      const result = await api.join({ invitation: text, operationId: attempt.operationId })
      if (result.project) await finish(result.project)
      else setWaiting({ join: result.join, text, operationId: attempt.operationId })
    } catch (error) { failed(error) } finally { setBusy(false) }
  }
  if (waiting) return <JoinWaiting join={waiting.join} outage={waiting.outage} onStop={() => setWaiting(null)} />
  return <form onSubmit={join} aria-label={label}>
    <label>{invitationLabel}<textarea required rows={4} spellCheck={false} autoComplete="off" value={invitation}
      onChange={event => setInvitation(event.target.value)} placeholder="Paste the invitation or setup prompt you were sent" /></label>
    {preview?.person && preview.purpose !== 'human' && <p className="small" role="status">
      This computer will be linked as <strong>{preview.person.name}</strong>{preview.person.email ? ` <${preview.person.email}>` : ''}
      {preview.purpose === 'agent' ? ', for their agents only' : ''}{preview.projectName ? ` in “${preview.projectName}”` : ''}.
    </p>}
    {hint && <p className="muted small">{hint}</p>}
    <Failure error={failure} />
    <button className="primary" disabled={busy}>{busy ? busyLabel : action}</button>
  </form>
}

/** The joiner's side of the confirmation: nothing from the project arrives until the request is approved. */
function JoinWaiting({ join, outage, onStop }) {
  const linking = join.linkingAs ? `${join.linkingAs.name}${join.linkingAs.email ? ` <${join.linkingAs.email}>` : ''}` : null
  const what = join.purpose === 'human' ? `to join “${join.projectName}”`
    : `to link this computer${linking ? ` as ${linking}` : ''}${join.purpose === 'agent' ? ' for agents only' : ''} in “${join.projectName}”`
  const who = join.purpose === 'human' ? 'The person who invited you, or another admin, approves it.'
    : join.purpose === 'device' ? 'Approve it from one of your computers already in the project, or ask an admin.'
      : 'Approve it from one of your computers already in the project.'
  return <section className="join-waiting" aria-label="Waiting for approval">
    <h2>Waiting for approval</h2>
    <p>Your request {what} is saved with the project’s hub. {who}</p>
    {join.code ? <>
      <p className="muted small">Your confirmation code</p>
      <p className="confirmation-code" data-testid="join-code">{join.code}</p>
      <p className="muted small">Read this code to the person approving you, face to face or by voice rather than where the invitation came from. They approve only if their screen shows the same code.</p>
    </> : <p className="muted small" role="status">Your confirmation code appears here when the person approving opens your request.</p>}
    {outage && <p className="warning-text" role="status">The project’s hub is unreachable right now. Still waiting; nothing was lost.</p>}
    <button type="button" onClick={onStop}>Stop waiting</button>
  </section>
}

function Welcome({ api, session, current, onBack, onReady }) {
  const pendingCreate = readJson(sessionStorage, PENDING_CREATE)
  const [mode, setMode] = useState('start')
  const [name, setName] = useState(pendingCreate?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const agent = session.setupAgent
  const start = async event => {
    event.preventDefault()
    const trimmed = name.trim()
    let attempt = readJson(sessionStorage, PENDING_CREATE)
    if (!attempt || attempt.name !== trimmed) attempt = { name: trimmed, operationId: createOperationId() }
    // Persist before sending so a lost response retries the same creation.
    writeJson(sessionStorage, PENDING_CREATE, attempt)
    setBusy(true); setFailure(null)
    try {
      const { project } = await api.createProject(attempt)
      writeJson(sessionStorage, PENDING_CREATE, null)
      await onReady(project)
    } catch (error) {
      setFailure(error)
      if (error.status >= 400 && error.status < 500 && error.code !== 'AUTH_REQUIRED') writeJson(sessionStorage, PENDING_CREATE, null)
    } finally { setBusy(false) }
  }
  return <main className="connection client-entry welcome">
    <h1>{current ? 'Start or join a project' : `Welcome, ${session.identity.name}`}</h1>
    <p className="lead">A project is a shared board for you, the people you invite and your agents.</p>
    <div className="choice" role="group" aria-label="Choose how to begin">
      <button type="button" aria-pressed={mode === 'start'} onClick={() => { setMode('start'); setFailure(null) }}>Start a project</button>
      <button type="button" aria-pressed={mode === 'join'} onClick={() => { setMode('join'); setFailure(null) }}>Join a project</button>
    </div>
    {mode === 'start' ? <form onSubmit={start} aria-label="Start a project">
      <label>Project name<input required autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
      {pendingCreate && <p className="muted small">An earlier attempt to start “{pendingCreate.name}” didn’t confirm. Starting it again resumes that attempt.</p>}
      <p className="muted small">
        You join as {session.identity.name}.{agent?.name ? ` Your ${harnessLabel(agent.harnessId) ? `${harnessLabel(agent.harnessId)} ` : ''}agent is registered as ${agent.name}. It shows as offline until it connects, and as active only while it reports work.` : ''}
      </p>
      <Failure error={failure} />
      <button className="primary" disabled={busy}>{busy ? 'Starting…' : 'Start project'}</button>
    </form> : <JoinForm api={api} identityId={session.identity.id} label="Join a project" onReady={onReady}
      hint="Invitations work once and expire. You keep your own identity; nobody else can create it for you." />}
    {onBack && <button type="button" className="back" onClick={onBack}>Back to {current.name}</button>}
  </main>
}

function useMenu() {
  const [open, setOpen] = useState(false)
  const button = useRef(null)
  const menu = useRef(null)
  const items = () => [...(menu.current?.querySelectorAll('[role^="menuitem"]') ?? [])]
  useEffect(() => {
    if (!open) return
    const current = items().find(item => item.getAttribute('aria-checked') === 'true') ?? items()[0]
    current?.focus()
    const outside = event => { if (!menu.current?.contains(event.target) && !button.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus() }
  const onKeyDown = event => {
    const list = items(), at = list.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); close() }
    else if (event.key === 'Tab') close(false)
    else if (event.key === 'ArrowDown') { event.preventDefault(); list[(at + 1) % list.length]?.focus() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus() }
    else if (event.key === 'Home') { event.preventDefault(); list[0]?.focus() }
    else if (event.key === 'End') { event.preventDefault(); list.at(-1)?.focus() }
  }
  const buttonProps = {
    ref: button, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(value => !value),
    onKeyDown: event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } },
  }
  return { open, close, buttonProps, menuProps: { ref: menu, role: 'menu', onKeyDown } }
}

function Chevron() {
  return <svg className="chevron" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="m1 1.5 5 5 5-5" /></svg>
}

function hasPendingRequest(project) {
  try { return sessionStorage.getItem(`pardner:${project.id}:${project.actorId}:pending`) !== null } catch { return false }
}

function ProjectSwitcher({ projects, current, onSelect, onStartOrJoin }) {
  const { open, close, buttonProps, menuProps } = useMenu()
  return <div className="menu-anchor">
    <h1 className="project-title">
      <button type="button" className="switcher" {...buttonProps} aria-label={`Project: ${current.name}. Switch project`}>
        <span>{current.name}</span><Chevron />
      </button>
    </h1>
    {open && <div className="menu" {...menuProps} aria-label="Projects">
      {projects.map(project => <button type="button" key={project.id} role="menuitemradio"
        aria-checked={project.id === current.id} onClick={() => { close(); if (project.id !== current.id) onSelect(project.id) }}>
        <span className="menu-label">{project.name}</span>
        <span className="menu-detail">{project.removed ? (project.removal?.left ? 'You left · no longer syncs' : 'Removed · no longer syncs')
          : `${syncLabel(project.status)}${hasPendingRequest(project) ? ' · unconfirmed change' : ''}`}</span>
      </button>)}
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" onClick={() => { close(false); onStartOrJoin() }}>
        <span className="menu-label">Start or join a project…</span>
      </button>
    </div>}
  </div>
}

function InviteMenu({ memberRole, onChoose }) {
  const { open, close, buttonProps, menuProps } = useMenu()
  // Only the owner and admins admit people; a member still pairs their own devices and agents.
  const unavailable = purpose => purpose === 'human' && memberRole === 'member'
  return <div className="menu-anchor">
    <button type="button" className="invite-button" {...buttonProps}>Invite<Chevron /></button>
    {open && <div className="menu menu-end" {...menuProps} aria-label="Invite">
      {Object.entries(INVITES).map(([purpose, copy]) => <button type="button" role="menuitem" key={purpose} aria-disabled={unavailable(purpose) || undefined}
        onClick={event => { if (unavailable(purpose)) { event.preventDefault(); return } close(false); onChoose(purpose, buttonProps.ref.current) }}>
        <span className="menu-label">{copy.menu}</span>
        <span className="menu-detail">{unavailable(purpose) ? 'Only the owner or an admin invites people' : copy.detail}</span>
      </button>)}
    </div>}
  </div>
}

function ProjectView({ api, session, project, switcher, onAuthLost, refreshSession }) {
  const [details, setDetails] = useState(null)
  const [presence, setPresence] = useState(null)
  const [failure, setFailure] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [requestedTask, setRequestedTask] = useState(null)
  const [tasks, setTasks] = useState({})
  const [waitingRequests, setWaitingRequests] = useState(0)
  const [pairingDismissed, setPairingDismissed] = useState(() => { try { return localStorage.getItem(PAIRING_DISMISSED(project.id)) === 'true' } catch { return false } })
  const reporter = useRef(null)
  // Losing this project's membership is a project fact, shown as removed; only a lost browser session signs out (#154).
  const removed = useCallback(() => { void refreshSession().catch(() => {}) }, [refreshSession])
  const handle = useCallback(error => {
    if (error.code === 'AUTH_REQUIRED') onAuthLost(); else if (error.code === 'REVOKED') removed(); else setFailure(error)
  }, [onAuthLost, removed])
  const load = useCallback(async () => {
    const next = await api.project(project.id)
    setDetails(next)
    if (next.presence) setPresence(next.presence)
    setFailure(null)
    return next
  }, [api, project.id])
  useEffect(() => {
    let stopped = false
    load().catch(error => { if (!stopped) handle(error) })
    // A revoked or expired session ends here too, without waiting for the board's socket; so does a removal.
    const lost = error => { if (stopped) return; if (error.code === 'AUTH_REQUIRED') onAuthLost(); else if (error.code === 'REVOKED') removed() }
    const presenceTimer = setInterval(() => api.presence(project.id)
      .then(next => { if (!stopped) setPresence(next) }).catch(lost), PRESENCE_POLL_MS)
    const projectTimer = setInterval(() => load().catch(lost), PROJECT_POLL_MS)
    // Requests this machine may approve; an outage or an agent-only client simply shows none.
    const requests = () => api.joinRequests(project.id).then(result => { if (!stopped) setWaitingRequests(result.requests.length) }, () => {})
    void requests()
    const requestsTimer = setInterval(requests, REQUESTS_POLL_MS)
    return () => { stopped = true; clearInterval(presenceTimer); clearInterval(projectTimer); clearInterval(requestsTimer) }
  }, [api, project.id, load, handle, onAuthLost, removed])
  useEffect(() => {
    const instance = createPresenceReporter({ api, projectId: project.id, onError: () => {} })
    reporter.current = instance
    instance.start()
    const interaction = () => instance.interaction()
    const visibility = () => instance.visibilityChanged()
    const leave = () => { void instance.stop() }
    for (const type of ['pointerdown', 'keydown', 'input']) window.addEventListener(type, interaction, true)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', leave)
    return () => {
      for (const type of ['pointerdown', 'keydown', 'input']) window.removeEventListener(type, interaction, true)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', leave)
      reporter.current = null
      void instance.stop()
    }
  }, [api, project.id])
  const current = details?.project ?? project
  const config = useMemo(() => projectConfiguration(current),
    // The board remounts only when its identity or routes change.
    [current.id, current.apiBase, current.wsPath, current.actorId]) // eslint-disable-line react-hooks/exhaustive-deps
  const reloadConfiguration = useCallback(async () => {
    try { return projectConfiguration((await load()).project) }
    catch (error) { if (error.code === 'AUTH_REQUIRED') onAuthLost(); else if (error.code === 'REVOKED') removed(); throw error }
  }, [load, onAuthLost, removed])
  const index = useMemo(() => presenceIndex(presence), [presence])
  const actors = useMemo(() => details?.actors ?? [], [details])
  const actorsById = useMemo(() => Object.fromEntries(actors.map(actor => [actor.id, actor])), [actors])
  // Removed people stay in the board's history but not among the people here now (#175); the People panel lists them.
  const participants = useMemo(() => sortParticipants(actors.filter(actor => !actor.removed), index), [actors, index])
  const me = actorsById[current.actorId] ?? { id: current.actorId, handle: current.actorId, kind: 'human', displayName: session.identity.name }
  const openProfile = useCallback((actor, element) => setDialog({ type: 'profile', actorId: actor.id, returnFocus: element }), [])
  const close = () => setDialog(null)
  const remotePresenceUnavailable = presence?.available === false || current.status?.hubConnected === false
  const header = <>
    <div className="client-identity">
      <span className="brand">Pardner</span>
      <ProjectSwitcher {...switcher} current={current} />
    </div>
    <div className="client-people">
      {participants.length > 0 && <AvatarStack actors={participants} index={index} max={5} label="People in this project"
        onOpen={openProfile} onMore={element => setDialog({ type: 'people', returnFocus: element })} />}
      {remotePresenceUnavailable && <span className="muted small">Remote presence unavailable</span>}
      <button type="button" className="people-button" aria-label={`People${waitingRequests ? `, ${waitingRequests} waiting to join` : ''}`}
        onClick={event => setDialog({ type: 'members', returnFocus: event.currentTarget })}>
        People{waitingRequests > 0 && <span className="badge" aria-hidden="true">{waitingRequests} waiting</span>}
      </button>
      <InviteMenu memberRole={current.memberRole} onChoose={(purpose, element) => setDialog({ type: 'invite', purpose, returnFocus: element })} />
      <button type="button" className="you" aria-label={`You: ${avatarLabel(me, presenceOf(index, me.id))}. Open your profile`}
        onClick={event => openProfile(me, event.currentTarget)}>
        <Avatar actor={me} state={presenceOf(index, me.id)} size="sm" />
        <span>You: {actorName(me)}</span>
      </button>
    </div>
  </>
  const canControl = details?.project.controlAvailable === true
  const refreshRequests = () => api.joinRequests(project.id).then(result => setWaitingRequests(result.requests.length), () => {})
  // If the owner loses every machine, nobody can remove or demote admins: suggest pairing a second one early.
  const ownMachines = details?.membership?.machines?.filter(machine => machine.personId === session.identity.id).length
  const suggestPairing = current.memberRole === 'owner' && ownMachines === 1 && !pairingDismissed
  const dismissPairing = () => { setPairingDismissed(true); try { localStorage.setItem(PAIRING_DISMISSED(project.id), 'true') } catch { /* optional convenience */ } }
  // Dismissing the board notice keeps the suggestion in the People panel until a second machine is paired.
  const notice = suggestPairing ? <div className="notice" role="status" aria-label="Pair a second machine">
    <p><strong>Pair a second machine with this project.</strong> If you lose every machine you own, nobody can remove or demote an admin any more, because only the owner can.</p>
    <div className="actions">
      <button onClick={event => setDialog({ type: 'invite', purpose: 'device', returnFocus: event.currentTarget })}>Pair a machine</button>
      <button onClick={dismissPairing}>Not now</button>
    </div>
  </div> : null
  const sessionProps = useMemo(() => ({
    actorsById, index, focus: focusByTask(index), onOpenProfile: openProfile, requestedTask,
    onFocusChange: taskIds => reporter.current?.setFocus(taskIds),
    onTasks: setTasks, onAuthLost, onRemoved: removed, canControl,
  }), [actorsById, index, openProfile, requestedTask, onAuthLost, removed, canControl])
  if (!details) return <main className="connection">
    <h1>{project.name}</h1>
    <p role="status">{failure ? 'This project didn’t open.' : 'Opening project…'}</p>
    <Failure error={failure}>
      <div className="actions">
        <button onClick={() => load().catch(handle)}>Retry</button>
        <button onClick={switcher.onStartOrJoin}>Open another project</button>
      </div>
    </Failure>
  </main>
  return <>
    <Workspace key={config.workspaceId} config={config} reloadConfiguration={reloadConfiguration}
      session={{ ...sessionProps, header, notice }} />
    {dialog?.type === 'profile' && actorsById[dialog.actorId] && <ProfileDialog actor={actorsById[dialog.actorId]}
      actors={actors} entry={index.get(dialog.actorId)} tasks={tasks} currentActorId={current.actorId}
      returnFocus={dialog.returnFocus}
      onClose={dialog.from === 'people' ? () => setDialog({ type: 'people', returnFocus: dialog.returnFocus }) : close}
      onOpenTask={taskId => { close(); setRequestedTask({ taskId, at: Date.now() }) }} />}
    {dialog?.type === 'people' && <PeopleDialog actors={participants} index={index} returnFocus={dialog.returnFocus}
      onClose={close} onOpen={actor => setDialog({ type: 'profile', actorId: actor.id, returnFocus: dialog.returnFocus, from: 'people' })}
      onManage={() => setDialog({ type: 'members', returnFocus: dialog.returnFocus })} />}
    {dialog?.type === 'members' && <PeoplePanel api={api} project={current} index={index} returnFocus={dialog.returnFocus}
      onClose={close} onRemoved={removed} onChanged={() => { void load().catch(() => {}); void refreshRequests() }} />}
    {dialog?.type === 'invite' && <InviteDialog api={api} project={current} purpose={dialog.purpose}
      returnFocus={dialog.returnFocus} onClose={() => { close(); void refreshSession().catch(() => {}) }} />}
  </>
}
