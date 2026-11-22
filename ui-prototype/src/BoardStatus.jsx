import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { useEffect, useState } from 'react'
import Chevron from './Chevron.jsx'
import { Failure, withCode } from './Failure.jsx'
import { syncStatusText } from './sync-status.js'

const SHARE_POLL_MS = 5000
const sharingLabel = { on: 'On', off: 'Off', starting: 'Starting', error: 'Not running' }

function saveText(status, connected, busy, heads) {
  return !status && connected && !busy
    ? 'Connecting to local service'
    : syncStatusText(status, { connected, busy, heads })
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
    {saveText(status, connected, busy, heads)}
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
  const save = saveText(status, connected, busy, heads)
  const sharing = hosted && shareLabel ? `Sharing ${shareLabel.toLowerCase()}` : null

  return <Popover>
    <PopoverTrigger type="button" className="board-status" aria-label={['Project status', save, sharing].filter(Boolean).join(', ')}>
      <SaveStatus status={status} connected={connected} busy={busy} heads={heads} />
      {sharing && <span className="share-state" data-state={share.state}>{sharing}</span>}
      <Chevron />
    </PopoverTrigger>
    <PopoverContent className="board-status-popover" side="bottom" align="end" sideOffset={6} collisionPadding={12}>
      <PopoverTitle>Project status</PopoverTitle>
      <section aria-label="Replication">
        <h3>Replication</h3>
        <p>{save}</p>
        {hosted && <p className="muted small">This computer hosts the project.</p>}
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
