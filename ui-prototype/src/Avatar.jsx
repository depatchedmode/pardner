import { useEffect, useRef } from 'react'
import { harnessLabel, managerLabel } from './client-api.js'
import { PRESENCE_LABELS, presenceOf } from './presence.js'

export const NOT_REPORTED = 'Not reported'
export const actorName = actor => actor?.displayName || actor?.handle || 'Unknown Actor'

export function initials(name) {
  const words = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const [word = '?'] = words
  return word.slice(0, 1).toUpperCase() + word.slice(1, 2).toLowerCase()
}

// A stable, muted tint per Actor: a secondary cue only, never the sole distinction.
function hue(id) {
  let value = 0
  for (const character of String(id)) value = (value * 31 + character.charCodeAt(0)) % 360
  return value
}

function BotGlyph() {
  return <svg className="avatar-kind" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path d="M6 1.4v1.9" /><circle cx="6" cy="1.3" r="0.9" />
    <rect x="1.6" y="3.6" width="8.8" height="6.6" rx="1.8" />
    <circle cx="4.3" cy="6.8" r="0.9" className="fill" /><circle cx="7.7" cy="6.8" r="0.9" className="fill" />
  </svg>
}

export function avatarLabel(actor, state, extra = '') {
  const kind = actor?.kind === 'agent' ? 'agent' : 'human'
  return `${actorName(actor)}, ${kind}, ${PRESENCE_LABELS[state].toLowerCase()}${extra}`
}

export function Avatar({ actor, state = 'offline', size = 'md', onOpen, labelSuffix = '' }) {
  const kind = actor?.kind === 'agent' ? 'agent' : 'human'
  const label = avatarLabel(actor, state, labelSuffix)
  const content = <>
    <span className="avatar-initials" aria-hidden="true">{initials(actorName(actor))}</span>
    {kind === 'agent' && <BotGlyph />}
    <span className="avatar-presence" aria-hidden="true" />
  </>
  const props = {
    className: `avatar avatar-${size}`, 'data-kind': kind, 'data-presence': state,
    style: { '--avatar-hue': hue(actor?.id ?? '') }, title: label,
  }
  if (!onOpen) return <span {...props} role="img" aria-label={label}>{content}</span>
  return <button type="button" {...props} aria-label={`${label}. Open profile`} onClick={event => onOpen(actor, event.currentTarget)}>
    {content}
  </button>
}

/** Up to `max` avatars, then a "+N" control that opens the full list. */
export function AvatarStack({ actors, index, max = 5, size = 'md', onOpen, onMore, labelSuffix = '', label }) {
  const shown = actors.slice(0, max)
  const hidden = actors.length - shown.length
  return <div className={`avatar-stack avatar-stack-${size}`} role="group" aria-label={label}>
    {shown.map(actor => <Avatar key={actor.id} actor={actor} state={presenceOf(index, actor.id)} size={size}
      onOpen={onOpen} labelSuffix={labelSuffix} />)}
    {hidden > 0 && (onMore
      ? <button type="button" className={`avatar-more avatar-${size}`} onClick={event => onMore(event.currentTarget)}
        aria-label={`${hidden} more ${hidden === 1 ? 'Actor' : 'Actors'}${labelSuffix}. Show everyone`}>+{hidden}</button>
      : <span className={`avatar-more avatar-${size}`} role="img"
        aria-label={`${hidden} more ${hidden === 1 ? 'Actor' : 'Actors'}${labelSuffix}`}>+{hidden}</span>)}
  </div>
}

function useModal(onClose, returnFocus) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    if (!element.open) element.showModal()
    return () => { if (returnFocus?.isConnected) returnFocus.focus() }
  }, [returnFocus])
  return { ref: dialog, onCancel: event => { event.preventDefault(); onClose() },
    onClick: event => { if (event.target === dialog.current) onClose() } }
}

const value = text => text ? text : <span className="not-reported">{NOT_REPORTED}</span>

function relativeAge(ms) {
  if (!Number.isFinite(ms)) return null
  const seconds = Math.max(0, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}

export function ProfileDialog({ actor, actors, entry, tasks, currentActorId, returnFocus, onClose, onOpenTask }) {
  const modal = useModal(onClose, returnFocus)
  const state = entry?.state ?? 'offline'
  const human = actor.kind === 'agent' && actor.humanId
    ? actors.find(candidate => candidate.kind === 'human' && candidate.humanId === actor.humanId) : null
  const devices = Array.isArray(actor.devices) ? actor.devices.filter(device => device?.name || device?.id) : []
  const sessions = entry?.sessions ?? []
  const titleId = `profile-${actor.id}`
  return <dialog className="profile-dialog" aria-labelledby={titleId} {...modal}>
    <div className="profile-heading">
      <Avatar actor={actor} state={state} size="lg" />
      <div>
        <h2 id={titleId}>{actorName(actor)}{actor.id === currentActorId && <span className="you-tag"> (you)</span>}</h2>
        <p className="profile-kind">
          {actor.kind === 'agent' ? `Agent${human ? ` · ${actorName(human)}’s agent` : ''}` : 'Human'}
          {' · '}<span className="presence-text" data-presence={state}>{PRESENCE_LABELS[state]}</span>
        </p>
      </div>
      <button type="button" className="close" onClick={onClose}>Close</button>
    </div>
    <section aria-labelledby={`${titleId}-identity`}>
      <h3 id={`${titleId}-identity`}>Identity</h3>
      <dl className="profile-fields">
        {actor.kind === 'agent' && <>
          <dt>Works for</dt><dd>{value(human && actorName(human))}</dd>
          <dt>Harness</dt><dd>{value(harnessLabel(actor.harnessId))}</dd>
        </>}
        <dt>Git name</dt><dd>{value(actor.gitIdentity?.name)}</dd>
        <dt>Git email</dt><dd>{value(actor.gitIdentity?.email)}</dd>
        <dt>Devices</dt>
        <dd>{devices.length ? <ul className="plain-list">{devices.map(device =>
          <li key={device.id ?? device.name}>{device.name || device.id}</li>)}</ul> : value(null)}</dd>
      </dl>
      <p className="muted small">Git details are profile information. They do not sign anyone in.</p>
    </section>
    <section aria-labelledby={`${titleId}-sessions`}>
      <h3 id={`${titleId}-sessions`}>Live sessions <span className="count">{sessions.length}</span></h3>
      {!sessions.length && <p className="muted">
        No live session reported to this view. Offline means none is connected here, not that work stopped.
      </p>}
      <ul className="session-list">
        {sessions.map(session => {
          const focused = (session.focusTaskIds ?? []).filter(id => tasks[id])
          const sessionState = session.state === 'active' ? 'active' : 'idle'
          return <li key={session.sessionId} className="session-row">
            <p className="session-title">
              <span className="presence-text" data-presence={sessionState}>{PRESENCE_LABELS[sessionState]}</span>
              {' · '}{session.kind === 'browser' ? 'Browser' : harnessLabel(session.harnessId) || 'Agent session'}
            </p>
            <dl className="profile-fields">
              <dt>Device</dt><dd>{value(session.deviceName)}</dd>
              {session.kind !== 'browser' && <><dt>Model</dt><dd>{value(session.model)}</dd></>}
              {session.managedBy && <><dt>Managed by</dt><dd>{managerLabel(session.managedBy)}</dd></>}
              <dt>Focus</dt>
              <dd>{focused.length ? <ul className="plain-list">{focused.map(id =>
                <li key={id}><button type="button" className="link-button" onClick={() => onOpenTask(id)}>{tasks[id].title}</button></li>)}
              </ul> : <span className="muted">No task</span>}</dd>
              {relativeAge(session.ttlMs) && <><dt>Expires</dt><dd>in {relativeAge(session.ttlMs)} without a report</dd></>}
            </dl>
          </li>
        })}
      </ul>
    </section>
  </dialog>
}

export function PeopleDialog({ actors, index, returnFocus, onClose, onOpen }) {
  const modal = useModal(onClose, returnFocus)
  return <dialog className="profile-dialog" aria-labelledby="people-title" {...modal}>
    <div className="profile-heading">
      <h2 id="people-title">People in this project</h2>
      <button type="button" className="close" onClick={onClose}>Close</button>
    </div>
    <ul className="people-list">
      {actors.map(actor => {
        const state = presenceOf(index, actor.id)
        return <li key={actor.id}>
          <Avatar actor={actor} state={state} />
          <button type="button" className="link-button" onClick={event => onOpen(actor, event.currentTarget)}>{actorName(actor)}</button>
          <span className="muted">{actor.kind === 'agent' ? 'Agent' : 'Human'}</span>
          <span className="presence-text" data-presence={state}>{PRESENCE_LABELS[state]}</span>
        </li>
      })}
    </ul>
  </dialog>
}
