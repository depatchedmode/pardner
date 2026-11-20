import { useEffect, useState } from 'react'
import { Failure, withCode } from './Failure.jsx'

const VIEW_POLL_MS = 5000

/**
 * Whether other computers can reach this project (lib/client-share.js). On the computer that hosts it this is a
 * switch; on a joined computer it says how that computer reaches the hub. The route's address is never shown.
 */
/** A route's failure as the end of a sentence: ": why.", or a full stop when no reason is known. */
const reason = error => error ? <>: {withCode(/[.!?]$/.test(error) ? error : `${error}.`)}</> : '.'

export function BoardSharing({ api, project }) {
  const [share, setShare] = useState(project.share ?? null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => api.share(project.id).then(result => { if (live) setShare(result.share) }).catch(() => {})
    load()
    const timer = setInterval(load, VIEW_POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [api, project.id])
  if (!share) return null
  const change = async on => {
    setBusy(true); setFailure(null)
    try { setShare((await api.setShare(project.id, on)).share) } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  const connected = share.state === 'on'
  if (share.role === 'replica') return <section className="board-sharing" aria-label="Route to the hub">
    <details className="board-sharing-details">
      <summary>Route to the hub <span className="share-state" data-state={share.state}>{connected ? 'Connected' : 'Down'}</span></summary>
      <div className="board-sharing-content"><p className="muted small" role="status">{connected
        ? 'Connected through Pardner.'
        : <>Route down{reason(share.error)} Saved work stays here. Pardner retries automatically. If it persists, ask the host to check Sharing on their board.</>}</p></div>
    </details>
  </section>
  return <section className="board-sharing" aria-label="Sharing">
    <details className="board-sharing-details">
      <summary><span>Sharing</span> <span className="share-state" data-state={share.state}>{{ on: 'On', starting: 'Starting', error: 'Not running' }[share.state] ?? 'Off'}</span></summary>
      <div className="board-sharing-content">
        <Failure error={failure} />
        {share.state === 'off' && <p className="muted small">Turn on to let other computers join and sync through Pardner.</p>}
        {connected && <p className="muted small">Other computers can join and sync through Pardner.</p>}
        {share.state === 'starting' && <p className="muted small" role="status">Starting the route to other computers…</p>}
        {share.state === 'error' && <p className="notice warning" role="status">Sharing is switched on, but its route is not running{reason(share.error)}</p>}
        <button type="button" disabled={busy} aria-pressed={share.on} onClick={() => change(!share.on)}>
          {busy ? (share.on ? 'Switching off…' : 'Switching on…') : share.on ? 'Switch sharing off' : 'Switch sharing on'}</button>
      </div>
    </details>
  </section>
}
