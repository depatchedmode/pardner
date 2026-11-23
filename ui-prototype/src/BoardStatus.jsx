import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { useEffect, useState } from 'react'
import { Failure, withCode } from './Failure.jsx'
import { replicationStatus } from './sync-status.js'

const SHARE_POLL_MS = 5000
const sharingLabel = { on: 'On', off: 'Off', starting: 'Starting', error: 'Not running' }
const sharingTone = { on: 'good', starting: 'warning', error: 'warning' }
const replicationTone = { synced: 'good', pending: 'warning', warning: 'warning', error: 'error' }
const replicationGlyph = {
  synced: 'm5.3 8 1.8 1.8 3.6-3.6',
  pending: 'M8 4.7V8l2.2 1.5',
  warning: 'M8 5.2v3.1m0 2.3h.01',
  error: 'm6 6 4 4m0-4-4 4',
  unknown: 'M6.2 6.3a1.8 1.8 0 0 1 3.6 0c0 1.1-1.8 1.4-1.8 2.5m0 1.8h.01',
}

function boardReplication(status, connected, busy, heads) {
  return !status && connected && !busy
    ? { state: 'unknown', text: 'Connecting to local service' }
    : replicationStatus(status, { connected, busy, heads })
}

function projectConnection(status, connected, hosted) {
  if (!connected) return { state: 'offline', text: 'Local service disconnected' }
  if (status?.available === false) return { state: 'offline', text: 'Project service unavailable' }
  if (status && hosted) return { state: 'online', text: 'Connected to local service' }
  if (status?.hubConnected === true) return { state: 'online', text: 'Connected to host' }
  if (status?.hubConnected === false) return { state: 'offline', text: 'Host disconnected' }
  return { state: 'checking', text: 'Checking connection' }
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
  if (share?.state === 'error') return <>Route down{routeError(share.error)} Saved work stays here. Pardner retries automatically. If it persists, ask the host to check Sharing on their board.</>
  if (hubConnected === true) return share ? 'Connected through Pardner.' : 'Connected to the host.'
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
  const projectId = project.id
  useEffect(() => {
    let live = true
    const load = () => api.share(projectId).then(result => { if (live) setShare(result.share) }).catch(() => {})
    load()
    const timer = setInterval(load, SHARE_POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [api, projectId])

  const change = async on => {
    setChanging(true)
    setFailure(null)
    try { setShare((await api.setShare(projectId, on)).share) }
    catch (error) { setFailure(error) }
    finally { setChanging(false) }
  }

  const hosted = project.role === 'hub'
  const available = connected && status?.available !== false
  const shareLabel = available && share ? sharingLabel[share.state] : null
  const peers = available && status?.syncPeers
    ? Object.values(status.syncPeers).filter(peer => peer.connected).length
    : null
  const lastSynced = available && !hosted && status?.lastSyncedAt
  const replication = boardReplication(status, connected, busy, heads)
  const connection = projectConnection(status, connected, hosted)
  const shareState = shareLabel ? share.state : 'unknown'
  const sharing = shareLabel ? `Sharing ${shareLabel.toLowerCase()}` : 'Sharing status unavailable'
  const summary = [...new Set([hosted && sharing, connection.text, replication.text].filter(Boolean))].join(', ')

  return <Popover>
    <PopoverTrigger type="button" className="board-status" aria-label={`Project status, ${summary}`} title={summary}>
      {hosted && <StatusIndicator label={sharing} tone={sharingTone[shareState]}>
        <circle cx="4" cy="8" r="1.7" /><circle cx="12" cy="3.5" r="1.7" /><circle cx="12" cy="12.5" r="1.7" />
        <path d="m5.5 7.2 5-2.9m-5 4.5 5 2.9" />
        {shareState === 'off' && <path d="M2 2l12 12" />}
      </StatusIndicator>}
      <StatusIndicator label={connection.text} tone={connection.state === 'online' ? 'good' : 'warning'}>
        <circle cx="8" cy="8" r="5.5" />
        {connection.state === 'online' && <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />}
        {connection.state === 'offline' && <path d="m4 4 8 8" />}
        {connection.state === 'checking' && <path d="M6.3 8h3.4" />}
      </StatusIndicator>
      <StatusIndicator label={replication.text} tone={replicationTone[replication.state]}>
        <circle cx="8" cy="8" r="6" />
        <path d={replicationGlyph[replication.state]} />
      </StatusIndicator>
    </PopoverTrigger>
    <span className="board-status-announcement" role="status">{summary}</span>
    <PopoverContent className="board-status-popover" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
      <PopoverTitle>Project status</PopoverTitle>
      <section aria-label="Replication">
        <h3>Replication</h3>
        <p>{replication.text}</p>
        {hosted && <p className="muted small">{connection.text}. This computer hosts the project.</p>}
        {lastSynced && <p className="muted small">Last synced {new Date(lastSynced).toLocaleString()}.</p>}
      </section>
      {hosted ? <section aria-label="Sharing">
        <div className="sharing-heading">
          <h3>Sharing{shareLabel && <span className="share-state" data-state={share.state}>{shareLabel}</span>}</h3>
          {shareLabel && <Switch className="sharing-switch" aria-label="Project sharing" checked={share.on}
            aria-busy={changing} aria-disabled={changing} onCheckedChange={(on, details) => {
              if (changing) details.cancel()
              else void change(on)
            }}>
            <SwitchThumb />
          </Switch>}
        </div>
        {peers !== null && <p>{peers === 1 ? '1 connected computer' : `${peers} connected computers`}</p>}
        <Failure error={failure} />
        {!shareLabel && <p className="muted small">Sharing status unavailable.</p>}
        {shareLabel && <>
          {share.state === 'off' && <p className="muted small">Turn on to let other computers join and sync through Pardner.</p>}
          {share.state === 'on' && <p className="muted small">Other computers can join and sync through Pardner.</p>}
          {share.state === 'starting' && <p className="muted small" role="status">Starting the route to other computers…</p>}
          {share.state === 'error' && <p className="notice warning" role="status">Sharing is switched on, but its route is not running{routeError(share.error)}</p>}
          {changing && <p className="muted small" role="status">{share.on ? 'Switching sharing off…' : 'Switching sharing on…'}</p>}
        </>}
    </section> : <section aria-label="Connection to host">
        <h3>Connection to host</h3>
        <p role="status">{hostConnectionText(available, share, status?.hubConnected)}</p>
      </section>}
    </PopoverContent>
  </Popover>
}
