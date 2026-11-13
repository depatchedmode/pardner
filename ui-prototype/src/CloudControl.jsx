import { useState } from 'react'
import { createOperationId } from './operation-id.js'

function CloudContext({ context, cloud, actor, act, busy, canManage }) {
  const [text, setText] = useState('')
  const [taskId, setTaskId] = useState(context.allowedTaskIds[0] ?? '')
  const [capture, setCapture] = useState({ commit: '', diff: '', tests: '' })
  const [review, setReview] = useState('')
  const [verdictKind, setVerdictKind] = useState('human')
  const [verdictEvidence, setVerdictEvidence] = useState('')
  const authority = { actorId: context.actorId, taskId, fromActorId: actor }
  return <article className="control-session" aria-label={`Cloud context ${context.contextId}`}>
    <h3>Cursor Cloud · {context.contextId}</h3>
    <p>{context.repository} · {context.startingRef}</p>
    <p>Agent: <code>{context.agentId}</code> · {context.identity?.status ?? 'Not created'} · {context.stale ? 'Stale / not observed' : 'Fresh read'}</p>
    <p className="muted">Cloud location · no local working directory. Observed: {context.observedAt ? new Date(context.observedAt).toISOString() : 'never'}</p>
    {context.blocker && <p className="notice">{context.blocker}</p>}
    {context.health && <p role="status">{context.health}</p>}
    <form onSubmit={async event => { event.preventDefault(); if (await act('/pardner/control/cloud/executions', { executionId: createOperationId(), contextId: context.contextId, ...authority, text })) setText('') }}>
      <label>Cloud task<select value={taskId} onChange={event => setTaskId(event.target.value)}>{context.allowedTaskIds.map(id => <option key={id}>{id}</option>)}</select></label>
      <label>Cloud follow-up<textarea required value={text} onChange={event => setText(event.target.value)} /></label>
      <button disabled={busy || !actor}>Save Cloud intent</button>
    </form>
    {cloud.executions.filter(row => row.contextId === context.contextId).map(row => <section key={row.executionId} aria-label={`Cloud execution ${row.executionId}`}>
      <h4>{row.executionId} · {row.state}</h4>
      <p>Run: <code>{row.runId ?? 'Acceptance not established'}</code> · submissions: {row.submissions} · execution outcome: {row.outcome ?? 'pending'}</p>
      {row.reason && <p>{row.reason}</p>}
      <pre>{row.output}</pre>
      {row.eventsIncomplete && <p>Event history incomplete; fresh run reads establish state.</p>}
      {['queued', 'running', 'blocked', 'cancel_requested'].includes(row.state) && <button disabled={busy || !actor} onClick={() => act('/pardner/control/cloud/executions/cancel', { ...authority, taskId: row.intent.taskId, executionId: row.executionId })}>Cancel exact Cloud run</button>}
      {row.state === 'unknown' && <button disabled={busy} onClick={() => act('/pardner/control/cloud/executions/reconcile', { executionId: row.executionId })}>Reconcile Cloud acceptance</button>}
      {row.reconciliation && <p>{row.reconciliation.reason}</p>}
      {(row.verdicts ?? []).map((verdict, index) => <p key={index}>{verdict.kind}: {verdict.verdict} by {verdict.actorId} · {verdict.evidence}</p>)}
      {row.evidence && <form onSubmit={event => {
        event.preventDefault()
        void act('/pardner/control/cloud/executions/verdicts', { executionId: row.executionId, actorId: actor, kind: verdictKind, verdict: event.nativeEvent.submitter.value, evidence: verdictEvidence })
      }}>
        <label>Cloud verdict kind<select value={verdictKind} onChange={event => setVerdictKind(event.target.value)}><option value="human">Human acceptance</option><option value="checker">Independent check</option></select></label>
        <label>Cloud verdict evidence<textarea required value={verdictEvidence} onChange={event => setVerdictEvidence(event.target.value)} /></label>
        <button disabled={busy || !actor} value="accepted">Accept Cloud result</button>
        <button disabled={busy || !actor} value="rejected">Reject Cloud result</button>
      </form>}

      {row.evidence ? <p>Immutable evidence: <code>{row.evidence.sha256}</code>. Independent check and human acceptance remain separate.</p> : row.state === 'terminal' && row.runId && canManage && <form onSubmit={event => {
        event.preventDefault()
        void act('/pardner/control/cloud/executions/freeze', { ...capture, ...authority, taskId: row.intent.taskId, executionId: row.executionId })
      }}>
        <label>Full commit hash<input required value={capture.commit} onChange={event => setCapture({ ...capture, commit: event.target.value })} /></label>
        <label>Diff evidence<textarea value={capture.diff} onChange={event => setCapture({ ...capture, diff: event.target.value })} /></label>
        <label>Test command and results<textarea required value={capture.tests} onChange={event => setCapture({ ...capture, tests: event.target.value })} /></label>
        <button disabled={busy || !actor}>Freeze attempt evidence</button>
      </form>}
    </section>)}
    {context.hold && canManage && <form onSubmit={event => { event.preventDefault(); void act('/pardner/control/cloud/contexts/release', { contextId: context.contextId, evidence: review }) }}>
      <label>Cloud hold review<input required value={review} onChange={event => setReview(event.target.value)} /></label>
      <button disabled={busy}>Release reviewed Cloud hold</button>
    </form>}
  </article>
}

export default function CloudControl({ cloud, actor, act, busy, canManage }) {
  const [mapping, setMapping] = useState({ contextId: '', projectId: '', actorId: '', repository: '', startingRef: '', allowedTaskIds: '', allowedFromActorIds: '' })
  if (!cloud) return null
  return <section aria-label="Cursor Cloud">
    <h2>Cursor Cloud</h2>
    <p>{cloud.dispatchEnabled ? 'Dispatch enabled' : 'Live dispatch disabled'} · {cloud.configured ? 'Transport configured' : 'Access not configured'} · Live qualification pending.</p>
    <p className="muted">Intent and evidence are saved on this service. Cancellation holds the queue and does not undo changes.</p>
    {canManage && <details><summary>Register Cloud context</summary>
      <p>Use a registered project and agent Actor with explicit task and sender IDs. This reserves a new Cloud agent identity; it does not adopt an existing chat.</p>
      <form onSubmit={event => {
        event.preventDefault()
        void act('/pardner/control/cloud/contexts', { ...mapping,
          allowedTaskIds: mapping.allowedTaskIds.split(',').map(id => id.trim()).filter(Boolean),
          allowedFromActorIds: mapping.allowedFromActorIds.split(',').map(id => id.trim()).filter(Boolean) })
      }}>
        {Object.entries({ contextId: 'Cloud context ID', projectId: 'Cloud project ID', actorId: 'Cloud agent Actor', repository: 'Cloud repository URL', startingRef: 'Cloud starting ref', allowedTaskIds: 'Cloud authorized task IDs (comma separated)', allowedFromActorIds: 'Cloud authorized sender Actors (comma separated)' }).map(([field, label]) =>
          <label key={field}>{label}<input required value={mapping[field]} onChange={event => setMapping({ ...mapping, [field]: event.target.value })} /></label>)}
        <button disabled={busy}>Register Cloud context</button>
      </form>
    </details>}
    {cloud.contexts.map(context => <CloudContext key={context.contextId} {...{ context, cloud, actor, act, busy, canManage }} />)}
  </section>
}
