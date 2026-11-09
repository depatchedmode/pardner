import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Workspace } from './Pardner.jsx'
import { Avatar, AvatarStack, PeopleDialog, ProfileDialog, actorName, avatarLabel } from './Avatar.jsx'
import {
  consumeCapturedGrant, createClientApi, groupPairingCode, harnessLabel, invitationPurpose, pairingDigits, projectConfiguration, syncLabel,
  takeBootstrapGrant, takePairingCode,
} from './client-api.js'
import CompanionDialog from './CompanionDialog.jsx'
import { createOperationId } from './operation-id.js'
import { createPresenceReporter, focusByTask, presenceIndex, presenceOf, sortParticipants } from './presence.js'

const LAST_PROJECT = 'pardner:client:last-project'
const PENDING_CREATE = 'pardner:client:pending-create'
const PENDING_JOIN = 'pardner:client:pending-join'
const PRESENCE_POLL_MS = 5000
const PROJECT_POLL_MS = 15000

const readJson = (store, key) => { try { return JSON.parse(store.getItem(key)) } catch { return null } }
const writeJson = (store, key, value) => {
  try { value === null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value)) } catch { /* optional convenience */ }
}

const JOIN_HINTS = {
  INVITE_EXPIRED: 'Ask for a new invitation; this one has expired.',
  REVOKED: 'This invitation or membership was revoked. Ask for a new invitation.',
  INVITE_USED: 'This invitation was already used by someone else. Ask for a new one.',
  INVALID_INVITATION: 'Check that you pasted the whole invitation, exactly as it was sent.',
  IDENTITY_MISMATCH: 'This invitation is for a different person or identity. A My device invitation links a computer that has no identity yet; a Human invitation needs your own identity first.',
  DEVICE_INVITATION_REQUIRED: 'Linking this device needs a My device invitation from your own client. Human and Agent invitations work after you confirm your identity.',
  HUB_UNAVAILABLE: 'The project’s hub is unreachable, so this can’t finish yet. Retry when it is back; nothing was lost.',
  HUB_REQUIRED: 'This computer can’t create invitations for this project yet. Ask the person who started the project, or retry later.',
  CLIENT_UNREACHABLE: 'Your local Pardner client may have stopped. Ask your agent to reopen it, then retry.',
}

async function digest(text) {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

function Failure({ error, children }) {
  if (!error) return null
  return <div className="error inline-error" role="alert">
    <strong>{error.message}</strong>
    {JOIN_HINTS[error.code] && <p>{JOIN_HINTS[error.code]}</p>}
    {children}
  </div>
}

export default function ClientApp({ config }) {
  const api = useMemo(() => createClientApi(config), [config])
  // A phone served by the computer's opt-in phone listener: it signs in with a pairing code, never a grant.
  const companion = config.companion === true
  const [phase, setPhase] = useState({ name: 'loading' })
  const [session, setSession] = useState(null)
  const [projectId, setProjectId] = useState(() => { try { return localStorage.getItem(LAST_PROJECT) } catch { return null } })
  const [choosing, setChoosing] = useState(false)
  // The scanned code leaves the address bar on the first render, before anything else can read or log it.
  const entryCode = useRef(undefined)
  if (entryCode.current === undefined) entryCode.current = companion ? takePairingCode() : null
  const open = useCallback(async ({ grant = null, code = null } = {}) => {
    let entryFailure = null
    if (grant) { try { await api.bootstrap(grant) } catch (failure) { entryFailure = failure } }
    if (code) {
      setPhase({ name: 'loading', label: 'Pairing this phone…' })
      try { await api.redeemCompanion(code) } catch (failure) { entryFailure = failure }
    }
    try {
      setSession(await api.session())
      setPhase({ name: 'ready' })
    } catch (failure) {
      // A used link is harmless when this browser is already signed in.
      setPhase(failure.code === 'AUTH_REQUIRED' || failure.status === 401
        ? { name: 'signed-out', failure: entryFailure } : { name: 'error', failure })
    }
  }, [api])
  useEffect(() => {
    const code = entryCode.current
    entryCode.current = null
    void open({ grant: consumeCapturedGrant(), code })
    const onHash = () => {
      const grant = takeBootstrapGrant(), code = companion ? takePairingCode() : null
      if (grant || code) void open({ grant, code })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [open, companion])
  const refreshSession = useCallback(async () => {
    try { const next = await api.session(); setSession(next); return next }
    catch (failure) { if (failure.code === 'AUTH_REQUIRED') setPhase({ name: 'signed-out', reason: 'ended' }); throw failure }
  }, [api])
  const selectProject = useCallback(id => {
    setProjectId(id)
    setChoosing(false)
    try { localStorage.setItem(LAST_PROJECT, id) } catch { /* optional convenience */ }
  }, [])
  const authLost = useCallback(() => setPhase({ name: 'signed-out', reason: 'ended' }), [])
  const signOutPhone = useCallback(async () => {
    // A pairing that already ended is as signed out as this request would make it.
    try { await api.logoutCompanion() } catch (failure) { if (failure.code !== 'AUTH_REQUIRED') throw failure }
    setSession(null)
    setPhase({ name: 'signed-out', reason: 'signed-out' })
  }, [api])
  const paired = useCallback(next => { setSession(next); setPhase({ name: 'ready' }) }, [])

  if (phase.name === 'loading') return <main className="connection"><h1>Pardner</h1>
    <p role="status">{phase.label ?? (companion ? 'Opening Pardner…' : 'Opening your local client…')}</p></main>
  if (phase.name === 'signed-out') return companion
    ? <CompanionPair api={api} failure={phase.failure} reason={phase.reason} onPaired={paired} />
    : <SignedOut failure={phase.failure} retry={() => open()} />
  if (phase.name === 'error') return <main className="connection">
    <h1>Pardner</h1>
    <Failure error={phase.failure}><button onClick={() => { setPhase({ name: 'loading' }); void open() }}>Retry</button></Failure>
  </main>
  if (!session.identity) return <IdentityStep api={api} session={session} onDone={next => setSession(next)} />
  const projects = session.projects ?? []
  const current = projects.find(project => project.id === projectId) ?? projects[0]
  // A phone opens only the projects it was paired for; with none left it pairs again.
  if (session.companion && !current) return <CompanionPair api={api} reason="no-projects" onPaired={paired} />
  if (choosing || !current) return <Welcome api={api} session={session} current={current}
    onBack={current ? () => setChoosing(false) : null}
    onReady={async project => { await refreshSession().catch(() => {}); selectProject(project.id) }} />
  return <ProjectView key={current.id} api={api} session={session} project={current}
    onSelect={selectProject} onStartOrJoin={() => setChoosing(true)} onAuthLost={authLost} refreshSession={refreshSession}
    onSignOutPhone={signOutPhone} />
}

const PAIR_FAILURES = {
  PAIRING_INVALID: ['That code didn’t work.', 'It may be mistyped, already used, cancelled or more than 10 minutes old. On the computer, choose New code and enter the new one.'],
  PAIRING_THROTTLED: ['Too many attempts.', 'Wait a minute, then try again.'],
  ORIGIN_REJECTED: ['Open the phone address shown on the computer.', 'This page was opened through a different address.'],
  CLIENT_UNREACHABLE: ['The computer didn’t respond.', 'Check that it’s awake, Pardner is running, and this phone is on the same network.'],
}
const PAIR_REASONS = {
  ended: 'This phone’s pairing ended: it was revoked on the computer or has expired. Pair it again with a new code.',
  'signed-out': 'This phone is signed out. To use it again, pair it with a new code.',
  'no-projects': 'This phone has no project it can open. Pair it again from a project on the computer.',
}

/** A phone without a session: pair with the eight-digit code the computer shows (scanning its QR code fills it in). */
function CompanionPair({ api, failure: initialFailure = null, reason, onPaired }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(initialFailure)
  const field = useRef(null)
  useEffect(() => { setFailure(initialFailure) }, [initialFailure])
  const submit = async event => {
    event.preventDefault()
    const digits = pairingDigits(code)
    if (digits.length !== 8) { setFailure({ code: 'INCOMPLETE' }); field.current?.focus(); return }
    setBusy(true); setFailure(null)
    try {
      await api.redeemCompanion(digits)
      onPaired(await api.session())
    } catch (error) {
      setFailure(error)
      // A refused code can never succeed, so the field is ready for the next one.
      if (error.code === 'PAIRING_INVALID') setCode('')
      field.current?.focus()
    } finally { setBusy(false) }
  }
  const [title, hint] = failure?.code === 'INCOMPLETE' ? ['Enter all 8 digits.', null]
    : failure ? PAIR_FAILURES[failure.code] ?? [failure.message, null] : []
  return <main className="connection client-entry companion-pair">
    <h1>Pair this phone</h1>
    <p className="lead">On the computer running Pardner, open the project and choose Pair a phone. Scan its code with this phone’s camera, or type the 8 digits here.</p>
    {reason && PAIR_REASONS[reason] && <div className="notice inline-notice" role="status"><p>{PAIR_REASONS[reason]}</p></div>}
    <form onSubmit={submit} aria-label="Pair this phone">
      <label>Pairing code<input ref={field} className="pairing-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*"
        maxLength={9} placeholder="1234 5678" value={code} aria-invalid={failure ? true : undefined}
        aria-describedby={failure ? 'pair-failure' : undefined} onChange={event => setCode(groupPairingCode(event.target.value))} /></label>
      {failure && <div id="pair-failure" className="error inline-error" role="alert">
        <strong>{title}</strong>{hint && <p>{hint}</p>}
      </div>}
      <button className="primary" disabled={busy}>{busy ? 'Pairing…' : 'Pair this phone'}</button>
    </form>
    <p className="muted small companion-note">The phone connects over unencrypted HTTP, so pair only on a network you trust. It works while the computer is on, running Pardner and reachable on this network; it keeps no copy of the board.</p>
  </main>
}

function SignedOut({ failure, retry }) {
  return <main className="connection client-entry">
    <h1>Pardner</h1>
    <p className="lead">This browser isn’t signed in to your local Pardner client.</p>
    {failure && <div className="notice inline-notice" role="status">
      <p>The sign-in link was already used or has expired. Links from your agent work once.</p>
    </div>}
    <p>Ask your agent to open Pardner for you. It runs <code>pardner client open</code>, which signs this browser in without showing you a key.</p>
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
  const fromGit = Boolean(suggested.name || suggested.email)
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
        {fromGit ? 'Filled in from your Git configuration. ' : 'Git didn’t provide a name and email here, so enter them once. '}
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
 *  so a reload and re-paste resumes the same recipient-bound attempt. */
function JoinForm({ api, identityId, label, invitationLabel = 'Invitation', action = 'Join project', busyLabel = 'Joining…', hint, accept, onReady }) {
  const [invitation, setInvitation] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const joinAttempt = useRef(null)
  const join = async event => {
    event.preventDefault()
    const text = invitation.trim()
    setFailure(null)
    // A refused purpose never reaches the server, so the invitation stays usable by its intended recipient.
    const refused = accept?.(invitationPurpose(text))
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
      const { project } = await api.join({ invitation: text, operationId: attempt.operationId })
      writeJson(sessionStorage, PENDING_JOIN, null)
      joinAttempt.current = null
      setInvitation('')
      await onReady(project)
    } catch (error) {
      setFailure(error)
      const retryable = !error.status || error.status >= 500 || error.code === 'AUTH_REQUIRED'
      if (!retryable) { writeJson(sessionStorage, PENDING_JOIN, null); joinAttempt.current = null }
    } finally { setBusy(false) }
  }
  return <form onSubmit={join} aria-label={label}>
    <label>{invitationLabel}<textarea required rows={4} spellCheck={false} autoComplete="off" value={invitation}
      onChange={event => setInvitation(event.target.value)} placeholder="Paste the invitation or setup prompt you were sent" /></label>
    {hint && <p className="muted small">{hint}</p>}
    <Failure error={failure} />
    <button className="primary" disabled={busy}>{busy ? busyLabel : action}</button>
  </form>
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
        You join as {session.identity.name}.{agent?.name ? ` ${agent.name}${harnessLabel(agent.harnessId) ? ` (${harnessLabel(agent.harnessId)})` : ''} is registered as your agent. It shows as offline until it connects, and as active only while it reports work.` : ''}
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

function ProjectSwitcher({ projects, current, onSelect, onStartOrJoin = null, companion = false }) {
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
        <span className="menu-detail">{syncLabel(project.status, { companion })}{hasPendingRequest(project) ? ' · unconfirmed change' : ''}</span>
      </button>)}
      {onStartOrJoin && <>
        <div className="menu-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => { close(false); onStartOrJoin() }}>
          <span className="menu-label">Start or join a project…</span>
        </button>
      </>}
    </div>}
  </div>
}

const INVITES = {
  human: { menu: 'Human', detail: 'A person and their agent', title: 'Invite a person',
    body: 'For someone joining with their own identity. Their agent sets up their own board connected to this project.' },
  agent: { menu: 'Agent', detail: 'Another agent of yours', title: 'Connect another of your agents',
    body: 'For an agent you already run in another app. It joins as your agent; Pardner doesn’t start or instruct it.' },
  device: { menu: 'My device', detail: 'Another computer you use', title: 'Add one of your devices',
    body: 'For another computer you use. It links your existing identity rather than creating a new person.' },
}

function InviteMenu({ onChoose }) {
  const { open, close, buttonProps, menuProps } = useMenu()
  return <div className="menu-anchor">
    <button type="button" className="invite-button" {...buttonProps}>Invite<Chevron /></button>
    {open && <div className="menu menu-end" {...menuProps} aria-label="Invite">
      {Object.entries(INVITES).map(([purpose, copy]) => <button type="button" role="menuitem" key={purpose}
        onClick={event => { close(false); onChoose(purpose, buttonProps.ref.current) }}>
        <span className="menu-label">{copy.menu}</span><span className="menu-detail">{copy.detail}</span>
      </button>)}
    </div>}
  </div>
}

const STATE_LABELS = { issued: 'Waiting to be used', redeemed: 'Used', revoked: 'Revoked', expired: 'Expired' }
// expiresAt may be epoch milliseconds or an ISO timestamp.
const timeOf = value => typeof value === 'number' ? value : Date.parse(value)
function effectiveState(invite, now) {
  return invite.state === 'issued' && timeOf(invite.expiresAt) <= now ? 'expired' : invite.state
}
function formatExpiry(value, now) {
  const at = timeOf(value)
  if (!Number.isFinite(at)) return 'Expiry not reported'
  const minutes = Math.round((at - now) / 60000)
  const absolute = new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  if (minutes <= 0) return `Expired ${absolute}`
  const relative = minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
  return `Expires in ${relative} · ${absolute}`
}

function InviteDialog({ api, project, purpose, returnFocus, onClose }) {
  const dialog = useRef(null)
  const operationId = useRef(createOperationId())
  const [created, setCreated] = useState(null)
  const [invites, setInvites] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const copy = INVITES[purpose]
  const loadInvites = useCallback(() => api.invites(project.id).then(result => setInvites(result.invites ?? [])), [api, project.id])
  useEffect(() => {
    dialog.current.showModal()
    loadInvites().catch(setFailure)
    const tick = setInterval(() => setNow(Date.now()), 30000)
    return () => { clearInterval(tick); if (returnFocus?.isConnected) returnFocus.focus() }
  }, [loadInvites, returnFocus])
  const create = async () => {
    setBusy(true); setFailure(null)
    try {
      setCreated(await api.createInvite(project.id, { purpose, operationId: operationId.current }))
      setRevealed(false); setCopied(null)
      await loadInvites()
    } catch (error) {
      setFailure(error)
      if (error.code === 'OPERATION_ID_REUSED') operationId.current = createOperationId()
    } finally { setBusy(false) }
  }
  // What the recipient's agent receives: a short, scannable setup prompt when the
  // backend supplies one, otherwise the raw invitation. Both stay out of the DOM until revealed.
  const shareText = created ? created.setupPrompt ?? created.invitation : null
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(shareText); setCopied('done') }
    catch { setCopied('failed') }
  }
  const revoke = async inviteId => {
    setBusy(true); setFailure(null)
    try {
      const result = await api.revokeInvite(project.id, inviteId)
      const summary = result.invite ?? result
      if (created?.invite.id === inviteId) { setCreated({ invite: summary, invitation: null, setupPrompt: null }); setRevealed(false) }
      await loadInvites()
    } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  const createdState = created && effectiveState(created.invite, now)
  const usable = createdState === 'issued' && Boolean(shareText)
  return <dialog ref={dialog} className="invite-dialog" aria-labelledby="invite-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="profile-heading">
      <div>
        <h2 id="invite-title">{copy.title}</h2>
        <p className="muted">{project.name}</p>
      </div>
      <button type="button" className="close" onClick={onClose}>Close</button>
    </div>
    <p>{copy.body}</p>
    {!created ? <div className="actions">
      <button className="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create invitation'}</button>
    </div> : <section className="invite-ready" aria-label="New invitation">
      <p className="invite-state" data-state={createdState}>
        <strong>{STATE_LABELS[createdState]}</strong> · {formatExpiry(created.invite.expiresAt, now)}
      </p>
      {usable ? <>
        <div className="actions">
          <button className="primary" onClick={copyInvite}>Copy invite</button>
          <button aria-expanded={revealed} aria-controls="invite-text" onClick={() => setRevealed(value => !value)}>
            {revealed ? 'Hide invite text' : 'Show invite text'}
          </button>
          <button disabled={busy} onClick={() => revoke(created.invite.id)}>Revoke</button>
        </div>
        <p className="muted small" role="status">
          {copied === 'done' ? 'Copied. Treat it like a password and send it privately; it works once.'
            : copied === 'failed' ? 'This browser blocked copying. Use Show invite text and copy it manually.'
              : 'The invitation stays hidden so it can’t be read from a shared screen.'}
        </p>
        {revealed && <div id="invite-text" className="reveal">
          <p className="warning-text">Visible on screen. Stop sharing your screen before copying.</p>
          <textarea readOnly rows={5} spellCheck={false} aria-label="Invite text" value={shareText}
            onFocus={event => event.target.select()} />
        </div>}
      </> : <p className="muted">This invitation can no longer be used. Create a new one if you still need it.</p>}
    </section>}
    <Failure error={failure} />
    <section aria-labelledby="invite-history">
      <h3 id="invite-history">Invitations for this project</h3>
      {invites === null ? <p className="muted">Loading…</p> : !invites.length ? <p className="muted">None yet.</p> :
        <ul className="invite-list">
          {invites.map(invite => {
            const state = effectiveState(invite, now)
            return <li key={invite.id}>
              <span>{INVITES[invite.purpose]?.menu ?? invite.purpose}</span>
              <span className="invite-state" data-state={state}>{STATE_LABELS[state] ?? state}</span>
              <span className="muted">{state === 'issued' ? formatExpiry(invite.expiresAt, now) : ''}</span>
              {state === 'issued' && <button disabled={busy} onClick={() => revoke(invite.id)}
                aria-label={`Revoke ${INVITES[invite.purpose]?.menu ?? invite.purpose} invitation`}>Revoke</button>}
            </li>
          })}
        </ul>}
    </section>
  </dialog>
}

function ProjectView({ api, session, project, onSelect, onStartOrJoin, onAuthLost, refreshSession, onSignOutPhone }) {
  const phone = session.companion === true
  const [details, setDetails] = useState(null)
  const [presence, setPresence] = useState(null)
  const [failure, setFailure] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [requestedTask, setRequestedTask] = useState(null)
  const [tasks, setTasks] = useState({})
  const reporter = useRef(null)
  const handle = useCallback(error => { if (error.code === 'AUTH_REQUIRED') onAuthLost(); else setFailure(error) }, [onAuthLost])
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
    // A revoked or expired session ends here too, so a phone returns to pairing without waiting for its socket.
    const lost = error => { if (!stopped && error.code === 'AUTH_REQUIRED') onAuthLost() }
    const presenceTimer = setInterval(() => api.presence(project.id)
      .then(next => { if (!stopped) setPresence(next) }).catch(lost), PRESENCE_POLL_MS)
    const projectTimer = setInterval(() => load().catch(lost), PROJECT_POLL_MS)
    return () => { stopped = true; clearInterval(presenceTimer); clearInterval(projectTimer) }
  }, [api, project.id, load, handle, onAuthLost])
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
    catch (error) { if (error.code === 'AUTH_REQUIRED') onAuthLost(); throw error }
  }, [load, onAuthLost])
  const index = useMemo(() => presenceIndex(presence), [presence])
  const actors = useMemo(() => details?.actors ?? [], [details])
  const actorsById = useMemo(() => Object.fromEntries(actors.map(actor => [actor.id, actor])), [actors])
  const participants = useMemo(() => sortParticipants(actors, index), [actors, index])
  const me = actorsById[current.actorId] ?? { id: current.actorId, handle: current.actorId, kind: 'human', displayName: session.identity.name }
  const openProfile = useCallback((actor, element) => setDialog({ type: 'profile', actorId: actor.id, returnFocus: element }), [])
  const close = () => setDialog(null)
  const remotePresenceUnavailable = presence?.available === false || current.status?.hubConnected === false
  const header = <>
    <div className="client-identity">
      <span className="brand">Pardner</span>
      <ProjectSwitcher projects={session.projects} current={current} onSelect={onSelect}
        onStartOrJoin={phone ? null : onStartOrJoin} companion={phone} />
    </div>
    <div className="client-people">
      {participants.length > 0 && <AvatarStack actors={participants} index={index} max={5} label="People in this project"
        onOpen={openProfile} onMore={element => setDialog({ type: 'people', returnFocus: element })} />}
      {remotePresenceUnavailable && <span className="muted small">Remote presence unavailable</span>}
      {phone ? <button type="button" className="you" title={session.device.name}
        aria-label={`You (phone): ${session.device.name}, signed in as ${actorName(me)}. Open phone settings`}
        onClick={event => setDialog({ type: 'phone', returnFocus: event.currentTarget })}>
        <Avatar actor={me} state={presenceOf(index, me.id)} size="sm" />
        <span>You (phone)</span>
      </button> : <>
        <InviteMenu onChoose={(purpose, element) => setDialog({ type: 'invite', purpose, returnFocus: element })} />
        <button type="button" onClick={event => setDialog({ type: 'companion', returnFocus: event.currentTarget })}>Pair a phone</button>
        <button type="button" className="you" aria-label={`You: ${avatarLabel(me, presenceOf(index, me.id))}. Open your profile`}
          onClick={event => openProfile(me, event.currentTarget)}>
          <Avatar actor={me} state={presenceOf(index, me.id)} size="sm" />
          <span>You: {actorName(me)}</span>
        </button>
      </>}
    </div>
  </>
  const canControl = details?.project.controlAvailable === true
  const sessionProps = useMemo(() => ({
    actorsById, index, focus: focusByTask(index), onOpenProfile: openProfile, requestedTask,
    onFocusChange: taskIds => reporter.current?.setFocus(taskIds),
    onTasks: setTasks, onAuthLost, canControl, companion: phone,
  }), [actorsById, index, openProfile, requestedTask, onAuthLost, canControl, phone])
  if (!details) return <main className="connection">
    <h1>{project.name}</h1>
    <p role="status">{failure ? 'This project didn’t open.' : 'Opening project…'}</p>
    <Failure error={failure}>
      <div className="actions">
        <button onClick={() => load().catch(handle)}>Retry</button>
        <button onClick={onStartOrJoin}>Open another project</button>
      </div>
    </Failure>
  </main>
  return <>
    <Workspace key={config.workspaceId} config={config} reloadConfiguration={reloadConfiguration}
      session={{ ...sessionProps, header }} />
    {dialog?.type === 'profile' && actorsById[dialog.actorId] && <ProfileDialog actor={actorsById[dialog.actorId]}
      actors={actors} entry={index.get(dialog.actorId)} tasks={tasks} currentActorId={current.actorId}
      returnFocus={dialog.returnFocus} onClose={close}
      onOpenTask={taskId => { close(); setRequestedTask({ taskId, at: Date.now() }) }} />}
    {dialog?.type === 'people' && <PeopleDialog actors={participants} index={index} returnFocus={dialog.returnFocus}
      onClose={close} onOpen={(actor, element) => setDialog({ type: 'profile', actorId: actor.id, returnFocus: element })} />}
    {dialog?.type === 'invite' && <InviteDialog api={api} project={current} purpose={dialog.purpose}
      returnFocus={dialog.returnFocus} onClose={() => { close(); void refreshSession().catch(() => {}) }} />}
    {dialog?.type === 'companion' && <CompanionDialog api={api} project={current} ownerName={session.identity.name}
      returnFocus={dialog.returnFocus} onClose={close} onAuthLost={onAuthLost} />}
    {dialog?.type === 'phone' && <PhoneSessionDialog session={session} me={me} returnFocus={dialog.returnFocus}
      onClose={close} onSignOut={onSignOutPhone} />}
  </>
}

/** On a paired phone: which phone this is, whose changes it makes, and Sign out. */
function PhoneSessionDialog({ session, me, returnFocus, onClose, onSignOut }) {
  const dialog = useRef(null)
  const cancel = useRef(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    dialog.current.showModal()
    return () => { if (returnFocus?.isConnected) returnFocus.focus() }
  }, [returnFocus])
  useEffect(() => { if (confirming) cancel.current?.focus() }, [confirming])
  const signOut = async () => {
    setBusy(true); setFailure(null)
    try { await onSignOut() } catch (error) { setFailure(error); setBusy(false) }
  }
  return <dialog ref={dialog} className="profile-dialog" aria-labelledby="phone-session-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="profile-heading">
      <div>
        <h2 id="phone-session-title">{session.device.name}</h2>
        <p className="profile-kind">This phone</p>
      </div>
      <button type="button" className="close" onClick={onClose}>Close</button>
    </div>
    <dl className="profile-fields">
      <dt>Signed in as</dt><dd>{actorName(me)}</dd>
      <dt>Changes</dt><dd>Saved as {actorName(me)}, through the computer that paired this phone</dd>
    </dl>
    <section aria-labelledby="phone-session-sign-out">
      <h3 id="phone-session-sign-out">Sign out</h3>
      {confirming ? <div className="companion-confirm" role="group" aria-label="Confirm signing out this phone">
        <p>Sign out this phone? To use it again, pair it with a new code from the computer.</p>
        <div className="actions">
          <button className="danger" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button>
          <button ref={cancel} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </div> : <>
        <p className="muted">The pairing ends on the computer too. This phone keeps no copy of the board.</p>
        <button onClick={() => setConfirming(true)}>Sign out this phone</button>
      </>}
      <Failure error={failure} />
    </section>
  </dialog>
}
