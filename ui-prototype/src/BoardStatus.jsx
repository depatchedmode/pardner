import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { useEffect, useRef, useState } from 'react'
import Chevron from './Chevron.jsx'
import { Failure, withCode } from './Failure.jsx'
import { replicationStatus } from './sync-status.js'

const SHARE_POLL_MS = 5000
const replicationTone = { synced: 'good', warning: 'warning', error: 'warning', unknown: 'warning' }
const warningGlyph = 'M7.1 2.8a1 1 0 0 1 1.8 0l5.4 9.6a1 1 0 0 1-.9 1.5H2.6a1 1 0 0 1-.9-1.5ZM8 6.35v3m0 2.3h.01'
const replicationGlyph = {
  synced: 'm3.5 8.4 3 3 6-6',
  pending: 'M5 7.5 3.5 10v3h9v-3L11 7.5M3.5 10h2.8l.8 1.3h1.8l.8-1.3h2.8M8 8.1V2.4m-2 2 2-2 2 2',
  warning: warningGlyph,
  error: warningGlyph,
  unknown: warningGlyph,
}

function boardReplication(status, connected, busy, heads) {
  return !status && connected && !busy
    ? { state: 'unknown', text: 'Checking project status…' }
    : replicationStatus(status, { connected, busy, heads })
}

function peerCount(status, available, hosted) {
  if (!available || !status) return null
  if (hosted) return status.syncPeers ? Object.values(status.syncPeers).filter(peer => peer.connected).length : null
  return typeof status.hubConnected === 'boolean' ? Number(status.hubConnected) : null
}

function StatusIndicator({ label, tone, children }) {
  return <svg className="status-indicator" viewBox="0 0 16 16" data-tone={tone} aria-hidden="true" focusable="false">
    <title>{label}</title>
    {children}
  </svg>
}

function routeError(error) {
  if (!error) return '.'
  return <>: {withCode(/[.!?]$/.test(error) ? error : `${error}.`)}</>
}

function hostConnectionText(available, share, hubConnected) {
  if (!available) return 'Connection status unavailable.'
  if (share?.state === 'error') return <>Route down{routeError(share.error)} Saved work stays here. Pardner retries automatically. If it persists, ask the host to check Tailcat sharing.</>
  if (hubConnected === true) return share ? 'Connected through Tailcat.' : 'Connected through the configured route.'
  if (hubConnected === false) return 'Waiting to reconnect to the host. Saved work stays here.'
  return 'Checking the connection…'
}

export function SaveStatus({ status, connected, busy, heads }) {
  return <span className="save-status" role="status" data-pending={Boolean(status?.syncPending)}>
    {boardReplication(status, connected, busy, heads).text}
  </span>
}

export function BoardStatus({ api, project, status, connected, busy, heads }) {
  const [share, setShare] = useState(project.share ?? null)
  const [changing, setChanging] = useState(false)
  const [failure, setFailure] = useState(null)
  const [sharingOpen, setSharingOpen] = useState(false)
  const statusTrigger = useRef(null)
  const projectId = project.id
  useEffect(() => {
    if (changing) return
    let live = true
    const load = () => api.share(projectId).then(result => { if (live) setShare(result.share) }).catch(() => {})
    load()
    const timer = setInterval(load, SHARE_POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [api, projectId, changing, project.share?.state])

  const stopSharing = async () => {
    if (changing) return
    setChanging(true)
    setFailure(null)
    try {
      setShare((await api.setShare(projectId, false)).share)
      setSharingOpen(false)
      requestAnimationFrame(() => statusTrigger.current?.focus())
    } catch (error) { setFailure(error) }
    finally { setChanging(false) }
  }

  const hosted = project.role === 'hub'
  const available = connected && status?.available !== false
  const peers = peerCount(status, available, hosted)
  const peerText = peers === null ? 'Peer count unavailable' : peers === 0 ? 'No peers connected'
    : peers === 1 ? '1 connected computer' : `${peers.toLocaleString()} connected computers`
  const lastSynced = available && !hosted && status?.lastSyncedAt
  const replication = boardReplication(status, connected, busy, heads)
  const summary = `${peerText}, ${replication.text}`
  const checking = !status && connected && !busy
  const sharing = hosted && share?.on
  const sharingText = share?.state === 'error' ? 'Tailcat route down' : share?.state === 'starting' ? 'Tailcat starting' : 'Tailcat on'

  return <div className="project-indicators">
    <Popover>
      <PopoverTrigger ref={statusTrigger} type="button" className="board-status"
        aria-label={`Project status, ${summary}`} title={summary}>
        {peers === null && replication.state === 'unknown' ?
          <span className="status-summary-icon">
            <StatusIndicator label={replication.text} tone={checking ? undefined : 'warning'}>
              <path d={checking ? 'M3 8h.01m5 0h.01m5 0h.01' : warningGlyph} />
            </StatusIndicator>
          </span> : <>
            <StatusIndicator label={peerText} tone={peers > 0 ? 'good' : undefined}>
              <rect x="1.1" y="4.9" width="4.25" height="4.75" rx=".8" />
              <rect x="10.65" y="4.9" width="4.25" height="4.75" rx=".8" />
              <path d="M3.2 9.65v2.2m-1.5 0h3m8.05-2.2v2.2m-1.5 0h3" />
              {peers > 0 && <path d="M5.35 7.3h5.3" />}
            </StatusIndicator>
            <span className="peer-count" aria-hidden="true">{peers?.toLocaleString()}</span>
            <StatusIndicator label={replication.text} tone={replicationTone[replication.state]}>
              <path d={replicationGlyph[replication.state]} />
            </StatusIndicator>
          </>}
        <Chevron />
      </PopoverTrigger>
      <span className="board-status-announcement" role="status">{summary}</span>
      <PopoverContent className="board-status-popover" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
        <PopoverTitle>Project status</PopoverTitle>
        <dl className="status-facts">
          <div className="status-fact">
            <dt>Peers</dt>
            <dd><p>{peerText}</p>
              {!hosted && <p className="muted small" role="status">{hostConnectionText(available, share, status?.hubConnected)}</p>}
            </dd>
          </div>
          <div className="status-fact">
            <dt>Sync</dt>
            <dd><p>{replication.text}</p>
              {lastSynced && <p className="muted small">Last synced {new Date(lastSynced).toLocaleString()}.</p>}
            </dd>
          </div>
          {hosted && project.configuredRoute && <div className="status-fact">
            <dt>Configured route</dt><dd>Managed outside Pardner</dd>
          </div>}
        </dl>
      </PopoverContent>
    </Popover>
    {sharing && <Popover open={sharingOpen} onOpenChange={setSharingOpen}>
      <PopoverTrigger type="button" className="tailcat-status" data-state={share.state}>
        <span className="route-dot" aria-hidden="true" />{sharingText}<Chevron />
      </PopoverTrigger>
      <PopoverContent className="board-status-popover" side="bottom" align="end" sideOffset={6} collisionPadding={12}>
        <PopoverTitle>Tailcat sharing</PopoverTitle>
        {share.state === 'error' && <p className="notice warning" role="status">Sharing is switched on, but its route is not running{routeError(share.error)}</p>}
        <p>Turning it off disconnects this project’s Tailcat peers. {project.configuredRoute
          ? 'Peers on the configured route stay connected.' : 'Peers can keep saving locally.'}</p>
        <button type="button" className="tailcat-stop" disabled={changing} onClick={stopSharing}>
          {changing ? 'Turning off Tailcat…' : 'Turn off Tailcat sharing'}
        </button>
        <Failure error={failure} />
      </PopoverContent>
    </Popover>}
  </div>
}
