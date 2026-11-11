import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Avatar } from './Avatar.jsx'
import { harnessLabel } from './client-api.js'
import { Failure } from './Failure.jsx'
import { InvitationHistory, InviteDialog, formatTime } from './Invitations.jsx'
import { createOperationId } from './operation-id.js'
import { presenceOf } from './presence.js'

// The People panel (#198): who is in the project, their machines and agents, who let them in, who was removed,
// and the actions this person may take. Roles govern only who may let people in or out; inside, every member may
// change anything on the board.

const VIEW_POLL_MS = 5000
const REQUESTS_POLL_MS = 3000

const REQUEST_TITLES = {
  human: request => `${request.person.name} wants to join as ${request.role === 'admin' ? 'an admin' : 'a member'}`,
  device: request => `A new machine wants to join as ${request.person.name}`,
  agent: request => `A machine for ${request.person.name}’s agents only wants to join`,
}

const list = names => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
function ago(at, now) {
  const minutes = Math.round((now - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 90) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}
function machineState(machine, now) {
  if (machine.status === 'this') return null
  if (machine.status === 'online') return 'Online'
  if (machine.status === 'unreachable') return 'Hub unreachable'
  return machine.lastSeenAt ? `Last seen ${ago(machine.lastSeenAt, now)}` : 'Offline'
}

/** A modal that states what an action does before it is taken. The safe choice has focus first. */
function ConfirmDialog({ title, intro, consequences, confirmLabel, busyLabel, danger = true, onConfirm, onClose, returnFocus }) {
  const dialog = useRef(null)
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    dialog.current.showModal()
    return () => { if (returnFocus?.isConnected) returnFocus.focus() }
  }, [returnFocus])
  const confirm = async () => {
    setBusy(true); setFailure(null)
    try { await onConfirm() } catch (error) { setFailure(error); setBusy(false) }
  }
  return <dialog ref={dialog} className="invite-dialog confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id={`${id}-title`}>{title}</h2>
    <div id={`${id}-body`}>
      {intro && <p>{intro}</p>}
      <ul className="consequences">{consequences.filter(Boolean).map(text => <li key={text}>{text}</li>)}</ul>
    </div>
    <Failure error={failure} />
    <div className="actions confirm-actions">
      <button type="button" autoFocus disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className={danger ? 'danger' : 'primary'} disabled={busy} onClick={confirm}>{busy ? busyLabel : confirmLabel}</button>
    </div>
  </dialog>
}

/** A control the person may see but not use here: focusable, with the reason read out and shown. */
function Unavailable({ label, reason }) {
  const id = useId()
  return <span className="unavailable">
    <button type="button" aria-disabled="true" aria-describedby={id} onClick={event => event.preventDefault()}>{label}</button>
    <span id={id} className="muted small">{reason}</span>
  </span>
}

function ProfileEditor({ api, project, person, onSaved, onCancel }) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const attempt = useRef(null)
  const nameField = useRef(null)
  useEffect(() => { nameField.current?.focus() }, [])
  const save = async event => {
    event.preventDefault()
    const input = { name: name.trim(), email: email.trim() }
    if (!attempt.current || attempt.current.name !== input.name || attempt.current.email !== input.email) attempt.current = { ...input, operationId: createOperationId() }
    setBusy(true); setFailure(null)
    try { await api.editProfile(project.id, attempt.current); await onSaved() }
    catch (error) { setFailure(error); if (error.code === 'OPERATION_ID_REUSED') attempt.current = null }
    finally { setBusy(false) }
  }
  return <form className="profile-editor" aria-label="Your name and email" onSubmit={save}>
    <label>Name<input ref={nameField} required maxLength={200} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Email<input required type="email" maxLength={320} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <p className="muted small">Everyone in “{project.name}” sees the new details. Projects you start or join from this computer later use them too.
      Your agents keep the names they were given when they joined, such as “{person.agents[0]?.name ?? `${person.name}’s Codex`}”.</p>
    <Failure error={failure} />
    <div className="actions">
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}

/** Join requests this machine may approve. Opening one adds this approver's nonce, so both screens show its code. */
function JoinRequests({ api, project, always, onChanged }) {
  const [requests, setRequests] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    const { requests: listed } = await api.joinRequests(project.id)
    const opened = await Promise.all(listed.map(request => request.code ? request
      : api.revealCode(project.id, request.id).then(result => result.request, error => { setFailure(error); return null })))
    setRequests(opened.filter(Boolean))
  }, [api, project.id])
  useEffect(() => {
    let stopped = false
    load().catch(error => { if (!stopped) setFailure(error) })
    const timer = setInterval(() => load().catch(() => {}), REQUESTS_POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [load])
  const decide = async (request, approved) => {
    setBusy(request.id); setFailure(null)
    try {
      if (approved) await api.approveRequest(project.id, request.id, request.code)
      else await api.rejectRequest(project.id, request.id)
      await load()
      onChanged?.()
    } catch (error) { setFailure(error) } finally { setBusy(null) }
  }
  if (!always && !requests?.length && !failure) return null
  return <section className="people-section" aria-labelledby="join-requests-title">
    <h3 id="join-requests-title">Waiting to join {requests?.length ? <span className="count">{requests.length}</span> : null}</h3>
    {requests?.length ? <p className="muted small">Approve only if the person reads you exactly the code shown here. Compare it face to face or by voice, not through the channel the invitation came through.</p> : null}
    <Failure error={failure} />
    {requests === null ? <p className="muted">Loading…</p> : !requests.length ? <p className="muted">No one is waiting to join.</p> :
      <ul className="join-request-list">
        {requests.map(request => {
          const name = request.person.name
          const duplicates = request.possibleDuplicates?.map(entry => entry.name).join(', ')
          return <li key={request.id} aria-label={REQUEST_TITLES[request.purpose](request)}>
            <p><strong>{REQUEST_TITLES[request.purpose](request)}</strong></p>
            <p className="muted small">{request.purpose === 'human'
              ? `${request.person.email} · ${request.device.name}`
              : `${request.device.name} · joins as ${name}${request.person.email ? ` <${request.person.email}>` : ''}`}</p>
            {duplicates && <p className="warning-text">{duplicates} is already a member with this name or email. If this is the same person, reject this request and pair their computer with a My device invitation instead.</p>}
            <p className="muted small">Confirmation code</p>
            <p className="confirmation-code">{request.code ?? '…'}</p>
            <div className="actions">
              <button className="primary" disabled={!request.code || Boolean(busy)} aria-label={`Approve ${name}, code ${request.code ?? 'not shown'}`}
                onClick={() => decide(request, true)}>{busy === request.id ? 'Approving…' : 'Approve'}</button>
              <button disabled={Boolean(busy)} aria-label={`Reject ${name}`} onClick={() => decide(request, false)}>Reject</button>
            </div>
          </li>
        })}
      </ul>}
  </section>
}

function MachineRow({ machine, person, now, onRemove }) {
  const state = machineState(machine, now)
  const tags = [machine.thisMachine && 'This machine', machine.hostsProject && 'Hosts the project', machine.agentsOnly && 'Agents only'].filter(Boolean)
  const paired = machine.paired && machine.admittedBy && machine.admittedBy.personId !== person.id ? `Paired by ${machine.admittedBy.name}` : null
  const remove = machine.actions.remove
  return <li className="machine" aria-label={`${machine.name}${tags.length ? `, ${tags.join(', ').toLowerCase()}` : ''}${state ? `, ${state.toLowerCase()}` : ''}`}>
    <div className="machine-main">
      <span className="machine-name">{machine.name}</span>
      {tags.map(tag => <span key={tag} className="tag" data-tag={tag}>{tag}</span>)}
      {state && <span className="machine-state" data-status={machine.status}>{state}</span>}
    </div>
    <span className="machine-id muted small">ID {machine.shortId}{paired ? ` · ${paired}` : ''}</span>
    {remove?.allowed && <button type="button" className="danger quiet" aria-label={`Remove ${machine.name}`} onClick={event => onRemove(machine, event.currentTarget)}>Remove</button>}
    {remove && !remove.allowed && <span className="muted small machine-note">{remove.reason}</span>}
  </li>
}

function PersonRow({ api, project, person, index, now, editing, onEdit, onAction, onSaved }) {
  const titleId = useId()
  const actor = { id: person.actorId, kind: 'human', displayName: person.name }
  const actions = person.actions
  const admitted = person.admittedBy ? `Let in by ${person.admittedBy.name}` : 'Started the project'
  return <li className="member" aria-labelledby={titleId}>
    <div className="member-heading">
      <Avatar actor={actor} state={presenceOf(index, person.actorId)} />
      <div>
        <h4 id={titleId}>{person.name}{person.you && <span className="you-tag"> (you)</span>}</h4>
        <p className="muted small">{[person.email, admitted].filter(Boolean).join(' · ')}</p>
      </div>
      <span className="role-badge" data-role={person.role}>{person.roleLabel}</span>
    </div>
    {editing ? <ProfileEditor api={api} project={project} person={person} onSaved={onSaved} onCancel={() => onEdit(false)} /> : <>
      <div className="member-part">
        <h5>Machines</h5>
        {person.machines.length ? <ul className="machine-list" aria-label={`${person.name}’s machines`}>
          {person.machines.map(machine => <MachineRow key={machine.id} machine={machine} person={person} now={now}
            onRemove={(target, element) => onAction({ type: 'remove-machine', person, machine: target }, element)} />)}
        </ul> : <p className="muted small">No machines. {person.name} can’t use the project until someone with access pairs a new one.</p>}
      </div>
      {person.agents.length > 0 && <div className="member-part">
        <h5>Agents</h5>
        <ul className="agent-list" aria-label={`${person.name}’s agents`}>
          {person.agents.map(agent => <li key={agent.id}>
            <Avatar actor={{ id: agent.id, kind: 'agent', displayName: agent.name }} state={presenceOf(index, agent.id)} size="sm" />
            <span>{agent.name}</span>
            <span className="muted small">{[harnessLabel(agent.harness), `on ${list(agent.machines.map(machine => machine.name))}`].filter(Boolean).join(' · ')}</span>
          </li>)}
        </ul>
      </div>}
      {actions.note && <p className="muted small member-note">{actions.note}</p>}
      {Object.keys(actions).some(key => key !== 'note') && <div className="actions member-actions">
        {actions.editProfile && <button type="button" onClick={() => onEdit(true)}>Edit name and email</button>}
        {actions.pairMachine?.allowed && <button type="button" onClick={event => onAction({ type: 'pair', person }, event.currentTarget)}>
          {person.you ? 'Pair another machine' : `Pair a machine for ${person.name}`}</button>}
        {actions.pairMachine && !actions.pairMachine.allowed && <Unavailable label={`Pair a machine for ${person.name}`} reason={actions.pairMachine.reason} />}
        {actions.changeRole?.allowed && <button type="button" onClick={event => onAction({ type: 'role', person }, event.currentTarget)}>
          {person.role === 'admin' ? 'Make member' : 'Make admin'}</button>}
        {actions.remove?.allowed && <button type="button" className="danger" onClick={event => onAction({ type: 'remove-person', person }, event.currentTarget)}>
          Remove {person.name}</button>}
        {actions.remove && !actions.remove.allowed && <Unavailable label={`Remove ${person.name}`} reason={actions.remove.reason} />}
      </div>}
    </>}
  </li>
}

function RemovedList({ view, onInviteAgain }) {
  const { people, machines } = view.removed
  if (!people.length && !machines.length) return null
  const invite = view.actions.invite?.allowed
  return <section className="people-section" aria-labelledby="removed-title">
    <h3 id="removed-title">Removed <span className="count">{people.length + machines.length}</span></h3>
    <p className="muted small">Removed people and machines can’t sync any more. Work they did before stays under their name.</p>
    <ul className="removed-list">
      {people.map(person => {
        const how = person.left ? 'Left the project' : `Removed by ${list(person.removedBy.map(entry => entry.name)) || 'someone'}`
        return <li key={person.id} aria-label={`${person.name}, ${person.left ? 'left' : 'removed'}`}>
          <div className="removed-main">
            <strong>{person.name}</strong>
            <span className="tag removed-tag">{person.left ? 'Left' : 'Removed'}</span>
          </div>
          <p className="muted small">{[`Was ${person.role === 'admin' ? 'an admin' : 'a member'}`, how,
            person.machines.length ? `${plural(person.machines.length, 'machine')}: ${list(person.machines.map(machine => machine.name))}` : null].filter(Boolean).join(' · ')}</p>
          {invite && <button type="button" onClick={event => onInviteAgain(person, event.currentTarget)}>Invite {person.name} again</button>}
        </li>
      })}
      {machines.map(machine => <li key={machine.id} aria-label={`${machine.name} (${machine.personName}’s machine), removed`}>
        <div className="removed-main">
          <strong>{machine.name}</strong>
          <span className="muted small">{machine.personName}’s machine · ID {machine.shortId}</span>
          <span className="tag removed-tag">Removed</span>
        </div>
        <p className="muted small">Removed by {list(machine.removedBy.map(entry => entry.name)) || 'someone'}. To use that computer again, pair it as a new machine from a fresh client directory.</p>
      </li>)}
    </ul>
  </section>
}

/** What each confirmation says, in plain words: what loses access, what stays, and how to come back (#152). */
function confirmation(action, view) {
  const { person, machine } = action
  if (action.type === 'remove-person') {
    const machines = person.machines.map(entry => entry.name)
    return { title: `Remove ${person.name} from “${view.projectName}”?`,
      consequences: [
        `${machines.length ? `${person.name}’s ${machines.length === 1 ? 'machine' : 'machines'} (${list(machines)})` : person.name}${person.agents.length ? ` and agents (${list(person.agents.map(agent => agent.name))})` : ''} stop syncing and lose access right away.`,
        `${person.name}’s past work stays in the project under their name.`,
        `People ${person.name} let in stay in the project.`,
        `To come back, ${person.name} needs a new invitation, used from a fresh client directory. They join as a new person.`,
      ], confirmLabel: `Remove ${person.name}`, busyLabel: 'Removing…',
      run: api => api.removeMember(view.projectId, { kind: 'member', id: person.id, operationId: createOperationId() }) }
  }
  if (action.type === 'remove-machine') {
    const own = person.you
    const last = person.machines.length === 1
    return { title: `Remove ${machine.name}${own ? '' : ` (${person.name}’s)`}?`,
      consequences: [
        `${machine.name} stops syncing with “${view.projectName}” and loses access right away, including any agents running there.`,
        `Work done from it stays under ${own ? 'your' : `${person.name}’s`} name.`,
        last ? `It is ${own ? 'your' : `${person.name}’s`} only machine, so ${own ? 'you' : person.name} can’t use the project until someone pairs a new one.` : null,
        'To use that computer again, pair it as a new machine from a fresh client directory.',
      ], confirmLabel: 'Remove machine', busyLabel: 'Removing…',
      run: api => api.removeMember(view.projectId, { kind: 'machine', id: machine.id, operationId: createOperationId() }) }
  }
  if (action.type === 'role') {
    const promote = person.role !== 'admin'
    return { title: promote ? `Make ${person.name} an admin?` : `Make ${person.name} a member?`, danger: false,
      consequences: promote ? [
        `${person.name} will be able to let people in and remove members.`,
        'Only you, the owner, can change roles or remove an admin.',
      ] : [
        `${person.name} will no longer be able to let people in or remove anyone.`,
        `People ${person.name} let in while an admin stay in the project.`,
        `To cut off ${person.name}’s access completely, remove them instead.`,
      ], confirmLabel: promote ? 'Make admin' : 'Make member', busyLabel: 'Saving…',
      run: api => api.changeRole(view.projectId, { personId: person.id, role: promote ? 'admin' : 'member', operationId: createOperationId() }) }
  }
  if (action.type === 'leave') {
    const me = view.people.find(entry => entry.you)
    return { title: `Leave “${view.projectName}”?`,
      consequences: [
        `${me?.machines.length > 1 ? `All your machines (${list(me.machines.map(entry => entry.name))}) stop` : 'This computer stops'} syncing with the project, and your agents lose access.`,
        'Your past work stays in the project under your name.',
        'People you let in stay in the project.',
        'To come back, you need a new invitation, used from a fresh client directory. You’d join as a new person.',
      ], confirmLabel: 'Leave project', busyLabel: 'Leaving…',
      run: api => api.leave(view.projectId, { operationId: createOperationId() }) }
  }
  return null
}

export function PeoplePanel({ api, project, index, returnFocus, onClose, onChanged, onRemoved }) {
  const dialog = useRef(null)
  const [view, setView] = useState(null)
  const [failure, setFailure] = useState(null)
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState(null)
  const [invite, setInvite] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const removed = useCallback(error => { if (error.code === 'REVOKED') onRemoved?.(); else setFailure(error) }, [onRemoved])
  const load = useCallback(() => api.people(project.id).then(next => { setView(next); setNow(Date.now()) }), [api, project.id])
  useEffect(() => {
    dialog.current.showModal()
    return () => { if (returnFocus?.isConnected) returnFocus.focus() }
  }, [returnFocus])
  useEffect(() => {
    let stopped = false
    load().catch(error => { if (!stopped) removed(error) })
    // Online state and other people's changes show while the panel is open.
    const timer = setInterval(() => load().catch(error => { if (!stopped && error.code === 'REVOKED') onRemoved?.() }), VIEW_POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [load, removed, onRemoved])
  const changed = async () => { setRefresh(value => value + 1); await load().catch(removed); onChanged?.() }
  const act = (next, element) => {
    if (next.type === 'pair') setInvite({ purpose: 'device', person: next.person.you ? null : { id: next.person.id, name: next.person.name }, returnFocus: element })
    else setAction({ ...next, returnFocus: element })
  }
  const confirm = action && view && confirmation(action, view)
  const me = view?.people.find(person => person.you)
  const inviteAction = view?.actions.invite
  const leave = view?.actions.leave
  return <>
    <dialog ref={dialog} className="people-panel" aria-labelledby="people-panel-title" onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="profile-heading">
        <div>
          <h2 id="people-panel-title">People</h2>
          <p className="muted">{project.name}{view && ` · ${plural(view.counts.people, 'person', 'people')} · ${plural(view.counts.machines, 'machine')} · ${plural(view.counts.agents, 'agent')}`
            + (view?.counts.removed ? ` · ${view.counts.removed} removed` : '')}</p>
        </div>
        <button type="button" className="close" onClick={onClose}>Close</button>
      </div>
      <p className="people-intro muted small">Everyone here can work on the whole board. Roles decide only who may let people in or remove them.</p>
      <Failure error={failure} />
      {!view ? !failure && <p className="muted" role="status">Loading…</p> : <>
        {view.syncing && <p className="notice" role="status">This machine is still receiving the member list from the project’s hub. It appears here in a moment.</p>}
        {view.hubReachable === false && <p className="notice warning" role="status">The project’s hub is unreachable, so this list is what this computer last received. Changes need the hub.</p>}
        {view.suggestPairing && <div className="notice" role="note" aria-label="Pair a second machine">
          <p><strong>Pair a second machine.</strong> If you lose every machine you own, nobody can remove or demote an admin any more, because only the owner can.</p>
          <div className="actions"><button type="button" onClick={event => setInvite({ purpose: 'device', person: null, returnFocus: event.currentTarget })}>Pair a machine</button></div>
        </div>}
        {inviteAction?.allowed && <div className="actions people-actions">
          <button type="button" className="primary" onClick={event => setInvite({ purpose: 'human', returnFocus: event.currentTarget })}>Invite someone</button>
        </div>}
        {inviteAction && !inviteAction.allowed && <p className="muted small">{inviteAction.reason}</p>}
        <JoinRequests api={api} project={project} always={Boolean(inviteAction?.allowed)} onChanged={changed} />
        <section className="people-section" aria-labelledby="members-title">
          <h3 id="members-title">Members <span className="count">{view.counts.people}</span></h3>
          <ul className="member-list">
            {view.people.map(person => <PersonRow key={person.id} api={api} project={project} person={person} index={index} now={now}
              editing={person.you && editing} onEdit={setEditing} onAction={act}
              onSaved={async () => { setEditing(false); await changed() }} />)}
          </ul>
        </section>
        <RemovedList view={view} onInviteAgain={(person, element) => setInvite({ purpose: 'human', again: person, returnFocus: element })} />
        <section className="people-section" aria-labelledby="people-invites-title">
          <h3 id="people-invites-title">Invitations</h3>
          <InvitationHistory api={api} projectId={project.id} refresh={refresh} emptyText="No invitations yet." onFailure={removed} />
        </section>
        {leave && <section className="people-section" aria-labelledby="leave-title">
          <h3 id="leave-title">Leave this project</h3>
          {leave.allowed ? <>
            <p className="muted small">Your machines stop syncing with “{project.name}”. Your past work stays under your name.</p>
            <button type="button" className="danger" onClick={event => setAction({ type: 'leave', returnFocus: event.currentTarget })}>Leave project</button>
          </> : <p className="muted small">{leave.reason}</p>}
        </section>}
        <p className="muted small observed">Updated {formatTime(view.observedAt)}. Online and last seen come from the project’s hub.</p>
      </>}
    </dialog>
    {confirm && <ConfirmDialog {...confirm} returnFocus={action.returnFocus} onClose={() => setAction(null)}
      onConfirm={async () => {
        await confirm.run(api)
        setAction(null)
        if (action.type === 'leave') { onRemoved?.(); return }
        await changed()
      }} />}
    {invite && <InviteDialog api={api} project={project} purpose={invite.purpose} person={invite.person ?? null} again={invite.again ?? null}
      returnFocus={invite.returnFocus} onClose={() => { setInvite(null); void changed() }} />}
  </>
}
