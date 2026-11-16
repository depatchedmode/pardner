import { useCallback, useEffect, useRef, useState } from 'react'
import { Failure, INVITE_HINTS, failureText, withCode } from './Failure.jsx'
import { createOperationId } from './operation-id.js'

export const INVITES = {
  human: { menu: 'Human', detail: 'A person and their agent', title: 'Invite a person',
    body: 'For someone joining with their own identity. Their agent sets up their own board connected to this project. You approve their request after comparing a confirmation code.' },
  agent: { menu: 'Agent', detail: 'Another agent of yours', title: 'Connect another of your agents',
    body: 'For an agent you already run in another app. It joins as your agent; Pardner doesn’t start or instruct it. On another computer, you approve it like a new machine.' },
  device: { menu: 'My device', detail: 'Another computer you use', title: 'Pair one of your machines',
    body: 'For another computer you use. It joins as you rather than as a new person. You approve it from this computer after comparing a confirmation code.' },
}

const STATE_LABELS = { issued: 'Waiting to be used', redeemed: 'Used', revoked: 'Revoked', expired: 'Expired' }
const INVITE_POLL_MS = 5000
const PAGE = 10
const MOST = 50
// Times may be epoch milliseconds or an ISO timestamp.
const timeOf = value => typeof value === 'number' ? value : Date.parse(value)
export function effectiveState(invite, now) {
  return invite.state === 'issued' && timeOf(invite.expiresAt) <= now ? 'expired' : invite.state
}
export const formatTime = value => {
  const at = timeOf(value)
  return Number.isFinite(at) ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
}
export function formatExpiry(value, now) {
  const at = timeOf(value)
  if (!Number.isFinite(at)) return 'Expiry not reported'
  const minutes = Math.round((at - now) / 60000)
  if (minutes <= 0) return `Expired ${formatTime(at)}`
  const relative = minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
  return `Expires in ${relative} · ${formatTime(at)}`
}
const kindLabel = invite => invite.purpose === 'human' ? `Person${invite.role === 'admin' ? ' · admin' : ''}`
  : invite.purpose === 'device' ? `Machine${invite.for?.name ? ` for ${invite.for.name}` : ''}` : `Agent${invite.for?.name ? ` for ${invite.for.name}` : ''}`

/**
 * One project's invitations, newest first, refreshed while shown (#183): what each was for, who issued it and when,
 * its state, and who used or revoked it. Shows ten at a time, up to the newest fifty. Loading the list is not the
 * person's action, so its failure stays here with a Retry rather than raising an alert (#162); only a removal is
 * passed to `onFailure`. `actionFailure` is the alert above, whose cause the list does not repeat.
 */
export function InvitationHistory({ api, projectId, excludeId = null, refresh = 0, emptyText = 'None yet.', onFailure, hints, actionFailure = null }) {
  const [page, setPage] = useState(null)
  const [loadFailure, setLoadFailure] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const load = useCallback(() => api.invites(projectId, { limit: Math.min(MOST, limit) }).then(next => { setPage(next); setLoadFailure(null) }), [api, projectId, limit])
  const listFailed = useCallback(error => { if (error.code === 'REVOKED') onFailure?.(error); else setLoadFailure(error) }, [onFailure])
  useEffect(() => {
    let stopped = false
    const tick = () => { setNow(Date.now()); load().catch(error => { if (!stopped) listFailed(error) }) }
    tick()
    const timer = setInterval(tick, INVITE_POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [load, refresh, listFailed])
  const revoke = async invite => {
    setBusy(invite.id)
    try { await api.revokeInvite(projectId, invite.id); await load() } catch (error) { onFailure?.(error) } finally { setBusy(null) }
  }
  if (loadFailure) {
    const { heading, hint } = failureText(loadFailure, hints)
    const explanation = actionFailure?.code !== loadFailure.code ? hint ?? heading : null
    return <div className="invite-history-failure">
      <p><strong>Couldn’t load invitations.</strong>{explanation && <> {withCode(explanation)}</>}</p>
      <button type="button" onClick={() => { load().catch(listFailed) }}>Retry</button>
    </div>
  }
  if (!page) return <p className="muted">Loading…</p>
  const shown = page.invites.filter(invite => invite.id !== excludeId)
  const total = page.total - (page.invites.length !== shown.length ? 1 : 0)
  if (!shown.length) return <p className="muted">{emptyText}</p>
  return <>
    <ul className="invite-list">
      {shown.map(invite => {
        const state = effectiveState(invite, now)
        const issued = [invite.issuedBy?.name && `Issued by ${invite.issuedBy.name}`, formatTime(invite.createdAt)].filter(Boolean).join(' · ')
        const outcome = state === 'redeemed' && invite.usedBy ? `Used by ${invite.usedBy.name ?? 'someone'}${invite.usedBy.removed ? ', since removed' : ''}${invite.usedAt ? ` · ${formatTime(invite.usedAt)}` : ''}`
          : state === 'revoked' ? `Revoked${invite.revokedBy?.name ? ` by ${invite.revokedBy.name}` : ''}${invite.revokedAt ? ` · ${formatTime(invite.revokedAt)}` : ''}`
            : state === 'issued' ? `${formatExpiry(invite.expiresAt, now)}${invite.pending ? ` · ${invite.pending} waiting for approval` : ''}`
              : state === 'expired' ? formatExpiry(invite.expiresAt, now) : ''
        return <li key={invite.id} aria-label={`${kindLabel(invite)} invitation, ${STATE_LABELS[state] ?? state}${issued ? `, ${issued}` : ''}`}>
          <span className="invite-kind">{kindLabel(invite)}</span>
          <span className="invite-state" data-state={state}>{STATE_LABELS[state] ?? state}</span>
          <span className="invite-meta">{issued}{outcome && <><br />{outcome}</>}</span>
          {state === 'issued' && <button type="button" disabled={Boolean(busy)} onClick={() => revoke(invite)}
            aria-label={`Revoke ${kindLabel(invite)} invitation${issued ? `, ${issued}` : ''}`}>{busy === invite.id ? 'Revoking…' : 'Revoke'}</button>}
        </li>
      })}
    </ul>
    {total > shown.length && <p className="muted small invite-more">
      Showing the newest {shown.length} of {total}.{' '}
      {limit < MOST ? <button type="button" className="link-button" onClick={() => setLimit(value => Math.min(MOST, value + PAGE))}>Show older invitations</button>
        : 'Older ones are listed by pardner client invites --offset 50.'}
    </p>}
  </>
}

/**
 * Creates one invitation and shows it hidden until revealed. `person` is the person a machine invitation pairs
 * for, when it is not the viewer; `again` is a removed person this Human invitation is meant for.
 */
export function InviteDialog({ api, project, purpose, person = null, again = null, returnFocus, onClose }) {
  const dialog = useRef(null)
  const operationId = useRef(createOperationId())
  // The owner may offer the admin role; an admin offers only the member role.
  const [role, setRole] = useState(again?.role === 'admin' && project.memberRole === 'owner' ? 'admin' : 'member')
  const [created, setCreated] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const copy = INVITES[purpose]
  const hints = project.role === 'replica' ? INVITE_HINTS : undefined
  const title = person ? `Pair a machine for ${person.name}` : again ? `Invite ${again.name} again` : copy.title
  const body = person ? `For a new computer of ${person.name}’s, for example after they lost every machine. ${person.name} runs Pardner there with a fresh client directory and joins with this invitation; you approve the request after comparing a confirmation code. It joins as ${person.name}, not as a new person.`
    : again ? `${again.name} was removed, so they join again as a new person, from a fresh client directory on their computer. Their earlier work stays under their old entry. You approve their request after comparing a confirmation code.`
      : copy.body
  useEffect(() => {
    dialog.current.showModal()
    const tick = setInterval(() => setNow(Date.now()), 30000)
    return () => { clearInterval(tick); if (returnFocus?.isConnected) returnFocus.focus() }
  }, [returnFocus])
  const create = async () => {
    setBusy(true); setFailure(null)
    try {
      setCreated(await api.createInvite(project.id, { purpose, operationId: operationId.current, ...(purpose === 'human' ? { role } : {}),
        ...(person ? { personId: person.id } : {}) }))
      setRevealed(false); setCopied(null); setRefresh(value => value + 1)
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
      setRefresh(value => value + 1)
    } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  const createAnother = () => {
    operationId.current = createOperationId()
    setCreated(null)
    void create()
  }
  const createdState = created && effectiveState(created.invite, now)
  const usable = createdState === 'issued' && Boolean(shareText)
  return <dialog ref={dialog} className="invite-dialog" aria-labelledby="invite-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="profile-heading">
      <div>
        <h2 id="invite-title">{title}</h2>
        <p className="muted">{project.name}</p>
      </div>
      <button type="button" className="close" onClick={onClose}>Close</button>
    </div>
    <p>{body}</p>
    {purpose === 'human' && project.memberRole === 'owner' && !created && <label className="role-choice">Role
      <select value={role} onChange={event => setRole(event.target.value)}>
        <option value="member">Member</option>
        <option value="admin">Admin: may also let people in and remove members</option>
      </select>
    </label>}
    {!created ? <div className="actions">
      <button className="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create invitation'}</button>
    </div> : <section className="invite-ready" aria-label="New invitation">
      <p className="invite-state" data-state={createdState}>
        <strong>{STATE_LABELS[createdState]}</strong>{createdState === 'issued' && ` · ${formatExpiry(created.invite.expiresAt, now)}`}
      </p>
      {usable ? <>
        <div className="actions">
          <button className="primary" onClick={copyInvite}>Copy invite</button>
          <button aria-expanded={revealed} aria-controls="invite-text" onClick={() => setRevealed(value => !value)}>
            {revealed ? 'Hide invite text' : 'Show invite text'}
          </button>
          <button disabled={busy} aria-label="Revoke this invitation" onClick={() => revoke(created.invite.id)}>Revoke</button>
        </div>
        <p className="muted small" role="status">
          {copied === 'done' ? 'Copied. Treat it like a password and send it privately; it works once.'
            : copied === 'failed' ? 'This browser blocked copying. Use Show invite text and copy it manually.'
              : revealed ? '' : 'The invitation stays hidden so it can’t be read from a shared screen.'}
        </p>
        {revealed && <div id="invite-text" className="reveal">
          <p className="warning-text">Visible on screen. Stop sharing your screen before copying.</p>
          <textarea readOnly rows={5} spellCheck={false} aria-label="Invite text" value={shareText}
            onFocus={event => event.target.select()} onClick={event => event.currentTarget.select()} />
        </div>}
      </> : <>
        <p className="muted">This invitation can no longer be used. Create a new one if you still need it.</p>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={createAnother}>Create another invitation</button>
        </div>
      </>}
    </section>}
    <Failure error={failure} hints={hints} />
    <section aria-labelledby="invite-history">
      <h3 id="invite-history">Invitations for this project</h3>
      <InvitationHistory api={api} projectId={project.id} excludeId={created?.invite.id ?? null} refresh={refresh}
        emptyText={created ? 'No other invitations.' : 'None yet.'} onFailure={setFailure} hints={hints} actionFailure={failure} />
    </section>
  </dialog>
}
