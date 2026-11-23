import { ActionButton, ActionForm, canQueueFollowUp } from './ControlAction.jsx'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@ui-sdk/react/collapsible'
import { DialogClose, DialogTitle } from '@ui-sdk/react/dialog'
import { BoardDialog } from './BoardDialog.jsx'
import Chevron from './Chevron.jsx'
import CloudControl from './CloudControl.jsx'
import { useCallback, useEffect, useState } from 'react'
import { CANCELLABLE_EXECUTION_STATES as CANCELLABLE } from '@pardner/domain-vocab'
import { createOperationId } from './operation-id.js'

const STATE_LABELS = {
  queued: 'Queued in Pardner', submitting: 'Submitting', running: 'Running', blocked: 'Waiting for approval or input',
  cancel_requested: 'Cancellation requested', terminal: 'Ended', unknown: 'Unknown outcome',
}

const actorName = (actors, id) => actors[id] ? actors[id].displayName || actors[id].handle : id
const age = (now, at) => {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : new Date(at).toLocaleString()
}

/** Server-relative freshness, so a skewed browser clock cannot make a stale read look fresh. */
function Freshness({ now, observedAt, stale, unreachable }) {
  if (!observedAt) return <span className="stale-label">Not read from T3 yet</span>
  if (unreachable) return <span className="stale-label">Stale: the service is unreachable; last known read {new Date(observedAt).toLocaleTimeString()}</span>
  return stale
    ? <span className="stale-label">Stale: last read {age(now, observedAt)} ({new Date(observedAt).toLocaleTimeString()})</span>
    : <span className="fresh-label">Read {age(now, observedAt)}</span>
}

function Verdicts({ execution, actors }) {
  const verdict = value => value ? `${value.verdict} by ${actorName(actors, value.actor)}` : 'Not recorded'
  return <dl className="verdicts">
    <dt>Execution</dt><dd>{execution.completion ?? 'Not ended'}</dd>
    <dt>Independent check</dt><dd>{verdict(execution.checker)}</dd>
    <dt>Human acceptance</dt><dd>{verdict(execution.human)}</dd>
  </dl>
}

function ExecutionCard({ execution, state, actors, actor, act, busy }) {
  const [evidence, setEvidence] = useState('')
  const [verdictKind, setVerdictKind] = useState('human')
  const [artifact, setArtifact] = useState('')
  const ended = execution.state === 'terminal' && execution.completion && execution.completion !== 'abandoned'
  return <article className="execution" aria-label={`Execution ${execution.id}`}>
    <div className="section-heading">
      <span className={`state-label state-${execution.state}`}>{STATE_LABELS[execution.state]}{execution.outcome ? `: ${execution.outcome}` : ''}</span>
    </div>
    <p>{execution.intent.text}</p>
    <p className="muted">
      {actorName(actors, execution.intent.fromActorId)} → {actorName(actors, execution.intent.actorId)} · run {execution.runId ?? 'not established'}
      {execution.runId && execution.state !== 'terminal' && <>{' · '}<Freshness now={state.now} observedAt={execution.observedAt} stale={execution.stale} unreachable={state.unreachable} /></>}
    </p>
    {execution.reason && !execution.approval && <p className="notice">{execution.reason}</p>}
    {execution.approval && <p className="notice" role="status">
      T3 is waiting for a decision on this run. {execution.approval.decideAt
        ? <a href={execution.approval.decideAt} target="_blank" rel="noreferrer">Decide in T3</a> : 'Open the thread in T3 to decide.'}
    </p>}
    {execution.reconciliation && !execution.reconciliation.established && <p className="muted">Last lookup: {execution.reconciliation.reason}</p>}
    {execution.output && <details open={execution.state === 'terminal'}>
      <summary>Output captured from T3{execution.output.truncated ? ' (truncated)' : ''}{execution.output.settled ? '' : ' (may still change)'}</summary>
      {execution.output.text ? <pre className="output">{execution.output.text}</pre> : <p className="muted">Nothing captured.</p>}
      {execution.output.error && <p className="muted">Last capture failed and will be retried: {execution.output.error}</p>}
    </details>}
    <Verdicts execution={execution} actors={actors} />
    {execution.artifacts.length > 0 && <ul className="artifacts">
      {execution.artifacts.map((item, index) => <li key={index}><code>{item.kind}</code> {item.reference} · {actorName(actors, item.actor)}</li>)}
    </ul>}
    <div className="actions">
      {CANCELLABLE.includes(execution.state) && <ActionButton disabled={busy} onClick={() => act('/pardner/control/executions/cancel', { id: execution.id })}>
        {{ queued: 'Withdraw follow-up', cancel_requested: 'Repeat cancellation' }[execution.state] ?? 'Cancel this run'}
      </ActionButton>}
      {execution.state === 'unknown' && <ActionButton disabled={busy} onClick={() => act('/pardner/control/executions/reconcile', { id: execution.id })}>Look for this request in T3</ActionButton>}
    </div>
    {execution.state === 'unknown' && <ActionForm onSubmit={event => act('/pardner/control/executions/resolve', { id: execution.id, decision: event.nativeEvent.submitter.value, evidence })}>
      <label>Reconciliation evidence<textarea required value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <button disabled={busy} value="retry">Retry with the same request</button>
      <button disabled={busy} value="abandon">Abandon this outcome</button>
    </ActionForm>}
    {ended && <ActionForm onSubmit={async event => {
      await act('/pardner/control/executions/verdicts', { id: execution.id, kind: verdictKind, verdict: event.nativeEvent.submitter.value, actorId: actor, evidence })
      setEvidence('')
    }}>
      <label>Verdict type<select aria-label="Verdict type" value={verdictKind} onChange={event => setVerdictKind(event.target.value)}>
        <option value="human">Human acceptance</option>
        <option value="checker">Independent check</option>
      </select></label>
      <label>Verdict evidence<textarea required value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <button disabled={busy || !actor} value="accepted">Accept</button>
      <button disabled={busy || !actor} value="rejected">Reject</button>
    </ActionForm>}
    {ended && <ActionForm onSubmit={async () => {
      const [kind, ...rest] = artifact.trim().split(/\s+/)
      await act('/pardner/control/executions/artifacts', { id: execution.id, kind, reference: rest.join(' '), actorId: actor })
      setArtifact('')
    }}>
      <label>Record artifact<input placeholder="commit abc1234" value={artifact} onChange={event => setArtifact(event.target.value)} /></label>
      <button disabled={busy || !actor || !artifact.trim()}>Record artifact</button>
    </ActionForm>}
  </article>
}

function SessionCard({ session, state, actors, actor, taskId, act, busy }) {
  const [text, setText] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reviewedRuns, setReviewedRuns] = useState('')
  const [acceptVersion, setAcceptVersion] = useState(false)
  const versionHeld = session.holds.some(hold => / is not qualified /.test(hold))
  const setup = taskId === undefined
  const canQueue = !setup && canQueueFollowUp(session, taskId, actor)
  const executions = state.executions.filter(execution => execution.threadId === session.threadId && execution.intent.taskId === taskId)
  return <section className="control-session" aria-label={`T3 thread ${session.identity.title ?? session.threadId}`}>
    <div className="section-heading">
      <h3>{session.identity.title ?? session.threadId}</h3>
      <Freshness now={state.now} observedAt={session.observedAt} stale={session.stale} unreachable={state.unreachable} />
    </div>
    {setup && <dl className="identity">
      <dt>Project</dt><dd>{session.project.name}{session.project.repository ? ` · ${session.project.repository}` : ''}</dd>
      <dt>Agent</dt><dd>{actorName(actors, session.actorId)}</dd>
      <dt>Provider</dt><dd>T3 · {session.identity.providerInstanceId ?? 'unknown'} · {session.identity.model ?? 'unknown model'} · {session.identity.runtimeMode}</dd>
      <dt>Session</dt><dd>{session.identity.link ? <a href={session.identity.link} target="_blank" rel="noreferrer">{session.threadId}</a> : session.threadId}</dd>
      <dt>Location</dt><dd>{session.location.host} · {session.location.worktreePath ?? 'project folder (T3 reports no worktree)'} · {session.location.branch ?? 'no branch reported'}</dd>
      <dt>Environment</dt><dd>{session.identity.environmentId ?? 'Not reported'}</dd>
    </dl>}
    {session.unqualified.map(note => <p key={note} className="notice">{note}</p>)}
    {session.health?.error && <p className="error" role="status">Last T3 pass failed: {session.health.error}</p>}
    {session.blocker && <p className="notice" role="status">Dispatch held: {session.blocker}</p>}
    {session.holds.length > 0 && setup && <ActionForm onSubmit={async () => {
      const runs = reviewedRuns.split(/[\s,]+/).filter(Boolean)
      await act('/pardner/control/sessions/release', { threadId: session.threadId, evidence, reviewedRuns: runs, acceptVersion })
      setEvidence('')
      setReviewedRuns('')
      setAcceptVersion(false)
    }}>
      <ul>{session.holds.map(hold => <li key={hold}>{hold}</li>)}</ul>
      <label>Review evidence<textarea required value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
      <label>Reviewed runs<input placeholder="Run IDs not started by Pardner" value={reviewedRuns} onChange={event => setReviewedRuns(event.target.value)} /></label>
      {versionHeld && <label className="check"><input type="checkbox" checked={acceptVersion} onChange={event => setAcceptVersion(event.target.checked)} />Accept this T3 version for this controller</label>}
      <button disabled={busy}>Release held work</button>
    </ActionForm>}
    {canQueue && <ActionForm onSubmit={async () => {
      await act('/pardner/control/executions', { id: createOperationId(), threadId: session.threadId, actorId: session.actorId, taskId, fromActorId: actor, text })
      setText('')
    }}>
      <label>Follow-up for {actorName(actors, session.actorId)}<textarea required value={text} onChange={event => setText(event.target.value)} /></label>
      <p className="muted">Saved in Pardner first; it is sent to T3 only when the thread is idle and nothing is held.</p>
      <button className="primary" disabled={busy || !actor}>Queue follow-up</button>
    </ActionForm>}
    {executions.map(execution => <ExecutionCard key={execution.id} {...{ execution, state, actors, actor, act, busy }} />)}
  </section>
}

function Setup({ state, actors, tasks, act, busy }) {
  const [origin, setOrigin] = useState(state.credential.origin ?? 'http://127.0.0.1:3773')
  const [pairingCode, setPairingCode] = useState('')
  const [project, setProject] = useState({ id: '', name: '', repository: '' })
  const agents = Object.values(actors).filter(actor => actor.kind === 'agent')
  const [mapping, setMapping] = useState({ projectId: '', threadId: '', actorId: '', allowedTaskIds: [], allowedFromActorIds: [] })
  const toggle = (field, id) => setMapping(current => ({ ...current,
    [field]: current[field].includes(id) ? current[field].filter(value => value !== id) : [...current[field], id] }))
  return <>
    <ActionForm onSubmit={async () => {
      await act('/pardner/control/credential', { origin, pairingCode })
      setPairingCode('')
    }}>
      <h3>T3 credential</h3>
      <p className="muted">One credential per controller, paired as approval-required. Re-pairing changes how T3 deduplicates requests.</p>
      <label>T3 address<input value={origin} onChange={event => setOrigin(event.target.value)} /></label>
      <label>T3 pairing code<input required autoComplete="off" value={pairingCode} onChange={event => setPairingCode(event.target.value)} /></label>
      <button disabled={busy}>{state.credential.status === 'missing' ? 'Pair T3' : 'Pair again'}</button>
    </ActionForm>
    <ActionForm onSubmit={async () => {
      await act('/pardner/control/projects', { ...project, repository: project.repository || null })
      setProject({ id: '', name: '', repository: '' })
    }}>
      <h3>Projects</h3>
      <ul>{state.projects.map(item => <li key={item.id}>{item.name} · {item.repository ?? 'no repository'}</li>)}</ul>
      <label>Project ID<input required value={project.id} onChange={event => setProject({ ...project, id: event.target.value })} /></label>
      <label>Project name<input required value={project.name} onChange={event => setProject({ ...project, name: event.target.value })} /></label>
      <label>GitHub repository<input placeholder="owner/name" value={project.repository} onChange={event => setProject({ ...project, repository: event.target.value })} /></label>
      <button disabled={busy}>Save project</button>
    </ActionForm>
    <ActionForm onSubmit={async () => {
      await act('/pardner/control/sessions', mapping)
      setMapping({ projectId: '', threadId: '', actorId: '', allowedTaskIds: [], allowedFromActorIds: [] })
    }}>
      <h3>Map a T3 thread</h3>
      <p className="muted">Each thread gets one agent Actor. Only top-level, approval-required threads are accepted.</p>
      <label>Project<select aria-label="Project" required value={mapping.projectId} onChange={event => setMapping({ ...mapping, projectId: event.target.value })}>
        <option value="">Choose a project</option>
        {state.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>T3 thread ID<input required value={mapping.threadId} onChange={event => setMapping({ ...mapping, threadId: event.target.value })} /></label>
      <label>Agent Actor<select aria-label="Agent Actor" required value={mapping.actorId} onChange={event => setMapping({ ...mapping, actorId: event.target.value })}>
        <option value="">Choose an agent</option>
        {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.displayName || agent.handle}</option>)}
      </select></label>
      <fieldset><legend>Authorized tasks</legend>
        {Object.values(tasks).map(task => <label key={task.id} className="check">
          <input type="checkbox" checked={mapping.allowedTaskIds.includes(task.id)} onChange={() => toggle('allowedTaskIds', task.id)} />{task.title}
        </label>)}
      </fieldset>
      <fieldset><legend>Authorized senders</legend>
        {Object.values(actors).filter(actor => actor.id !== mapping.actorId).map(actor => <label key={actor.id} className="check">
          <input type="checkbox" checked={mapping.allowedFromActorIds.includes(actor.id)} onChange={() => toggle('allowedFromActorIds', actor.id)} />{actor.displayName || actor.handle}
        </label>)}
      </fieldset>
      <button disabled={busy}>Map thread</button>
    </ActionForm>
  </>
}

function ControlPane({ request, actors, tasks, actor, taskId }) {
  const [state, setState] = useState(null)
  const [pollError, setPollError] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setState(await request('/pardner/control')); setPollError(null) } catch (failure) {
      // Keep the last view, but never let it pass for a current one.
      setState(current => current && { ...current, unreachable: true })
      setPollError(failure)
    }
  }, [request])
  useEffect(() => {
    void load()
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [load])
  const act = async (path, body) => {
    setBusy(true)
    try {
      await request(path, body)
      await load()
    } finally { setBusy(false) }
  }
  const setup = taskId === undefined
  if (!state) return <p role="status">{pollError ? pollError.message : 'Opening agent records…'}</p>
  if (!state.enabled) return <p className="muted">Agent execution is unavailable on this computer.</p>
  const credential = state.credential
  const sessions = setup ? state.sessions : state.sessions.filter(session => canQueueFollowUp(session, taskId, actor)
    || state.executions.some(run => run.threadId === session.threadId && run.intent.taskId === taskId))
  return <div className="control">
    {setup && <>
      <p className="muted">Settings and run records stay on this computer.</p>
      <div className="section-heading">
        <p>T3 credential: {credential.status}{credential.expiresAt ? ` · expires ${new Date(credential.expiresAt).toLocaleDateString()}` : ''}
          {state.environment ? ` · T3 ${state.environment.serverVersion}` : ''}</p>
        <ActionButton disabled={busy} onClick={() => act('/pardner/control/poll', {})}>Read T3 now</ActionButton>
      </div>
      {['expired', 'expiring', 'rejected'].includes(credential.status) && <p className="notice" role="status">Pair T3 again before the credential stops working. Requests that may already be in T3 cannot be retried with a new credential.</p>}
      <Setup {...{ state, actors, tasks, act, busy }} />
    </>}
    {pollError && <div className="error" role="alert"><strong>{pollError.message}</strong></div>}
    {!sessions.length && <p className="muted">{setup ? 'No T3 threads are mapped yet.' : 'No T3 thread is available for you to use on this task. To configure one, open Agent setup in the project menu.'}</p>}
    {sessions.map(session => <SessionCard key={session.threadId} {...{ session, state, actors, actor, taskId, act, busy }} />)}
    <CloudControl cloud={state.cloud} {...{ actor, taskId, act, busy }} />
  </div>
}

export function AgentSetupDialog({ returnFocus, onClose, ...props }) {
  return <BoardDialog className="profile-dialog agent-setup" returnFocus={returnFocus} onClose={onClose}>
    <header className="profile-heading">
      <DialogTitle>Agent setup</DialogTitle>
      <DialogClose className="close">Close</DialogClose>
    </header>
    <ControlPane {...props} />
  </BoardDialog>
}

export function TaskAgentRuns({ taskId, ...props }) {
  const [opened, setOpened] = useState(false)
  return <Collapsible className="task-agent-runs" onOpenChange={open => { if (open) setOpened(true) }}>
    <CollapsibleTrigger>Agent runs <Chevron /></CollapsibleTrigger>
    <CollapsiblePanel keepMounted>
      {opened && <ControlPane {...props} taskId={taskId} />}
    </CollapsiblePanel>
  </Collapsible>
}
