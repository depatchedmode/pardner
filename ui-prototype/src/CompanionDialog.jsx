import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatCountdown, groupPairingCode, pairingState } from './client-api.js'

const POLL_MS = 2000
// Each QR module is a whole number of pixels with the standard four-module quiet zone, so the code stays sharp.
const QR_OPTIONS = { margin: 4, scale: 5, errorCorrectionLevel: 'M' }

const FAILURES = {
  COMPANION_UNAVAILABLE: 'Phone access isn’t running. Turn it on, or rebind it, then make a code.',
  PAIRING_LIMIT: 'Five codes are already waiting. Cancel one below, or wait for one to expire.',
  INVALID_ARGUMENT: 'Choose a network that has one IPv4 address.',
}

const clock = value => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function lastSeen(companion, now) {
  if (!companion.lastSeenAt) return `Paired ${clock(companion.createdAt)}`
  const minutes = Math.round((now - companion.lastSeenAt) / 60000)
  if (minutes < 1) return 'Seen just now'
  if (minutes < 90) return `Seen ${minutes} min ago`
  return `Seen ${new Date(companion.lastSeenAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Pair a phone with this project. The plaintext code exists only in this dialog's state: the service keeps a hash.
 * The phone reaches the board over unencrypted HTTP on the chosen network, so the secret link is never offered for copying.
 */
export default function CompanionDialog({ api, project, ownerName, returnFocus, onClose, onAuthLost }) {
  const dialog = useRef(null)
  const closeButton = useRef(null)
  // The button that started the current action; it gets focus back once busy clears.
  const invoker = useRef(null)
  const chosen = useRef(false)
  const [status, setStatus] = useState(null)
  const [interfaceName, setInterfaceName] = useState('')
  const [issued, setIssued] = useState(null)
  const [qr, setQr] = useState(null)
  const [phoneName, setPhoneName] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [stale, setStale] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Where focus goes once a confirmation opens or closes: the swapped-out button is gone from the DOM.
  const focusAfter = useRef(null)
  const confirm = (key, opener) => { focusAfter.current = opener; setConfirming(key) }
  useEffect(() => {
    const selector = focusAfter.current
    focusAfter.current = null
    if (selector) dialog.current?.querySelector(selector)?.focus()
  }, [confirming])

  const apply = useCallback(next => {
    setStatus(next)
    setStale(false)
    if (!chosen.current) {
      chosen.current = true
      setInterfaceName(next.settings.interfaceName || (next.interfaces.length === 1 ? next.interfaces[0].name : ''))
    }
    return next
  }, [])
  const load = useCallback(() => api.companion().then(apply), [api, apply])
  const fail = useCallback(error => { if (error.code === 'AUTH_REQUIRED') onAuthLost?.(); else setFailure(error) }, [onAuthLost])

  useEffect(() => {
    dialog.current.showModal()
    load().catch(fail)
    // Polling shows a phone redeeming its code, an expiry and a changed address while the dialog is open.
    const poll = setInterval(() => load().catch(() => setStale(true)), POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(poll); clearInterval(tick); if (returnFocus?.isConnected) returnFocus.focus() }
  }, [load, fail, returnFocus])

  const summary = issued && status?.pairings.find(pairing => pairing.id === issued.id)
  const state = issued && pairingState(summary, issued.expiresAt, now)
  const pairingUrl = issued && state === 'pending' ? `${issued.phoneUrl}#pair=${issued.code}` : null
  useEffect(() => {
    let current = true
    setQr(null)
    if (pairingUrl) QRCode.toDataURL(pairingUrl, QR_OPTIONS).then(url => { if (current) setQr(url) }).catch(setFailure)
    return () => { current = false }
  }, [pairingUrl])

  useEffect(() => {
    if (busy || !invoker.current) return
    const frame = requestAnimationFrame(() => {
      const target = invoker.current
      invoker.current = null
      if (!dialog.current?.open) return
      const usable = target?.isConnected && !target.disabled && dialog.current.contains(target)
      ;(usable ? target : dialog.current.querySelector('[data-focus-after]') ?? closeButton.current)?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [busy])
  // WebKit does not focus a clicked button, so the invoker comes from the event.
  const perform = async (action, event) => {
    invoker.current = event?.currentTarget ?? null
    setBusy(true)
    setFailure(null)
    try { await action() } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const network = (enabled, event) => perform(async () => {
    setConfirming(null)
    apply(await api.setCompanionNetwork({ enabled, interfaceName }))
    if (!enabled) setIssued(null)
  }, event)
  const newCode = event => perform(async () => {
    setIssued(await api.createPairing(project.id, { name: phoneName.trim() }))
    setPhoneName('')
    await load()
  }, event)
  const cancelCode = (pairingId, event) => perform(async () => {
    await api.cancelPairing(pairingId)
    await load()
  }, event)
  const revoke = (companionId, event) => perform(async () => {
    setConfirming(null)
    await api.revokeCompanion(companionId)
    await load()
  }, event)

  const settings = status?.settings
  const healthy = Boolean(status?.phoneUrl)
  // Not running while turned on: the saved network vanished, changed address or could not be bound.
  const switching = Boolean(settings?.enabled && interfaceName && interfaceName !== (status.active?.interfaceName ?? settings.interfaceName))
  const needsRebind = Boolean(settings?.enabled && !healthy && !switching)
  const waiting = status?.pairings.filter(pairing => pairing.projectId === project.id && pairing.state === 'pending' && pairing.id !== issued?.id) ?? []
  const phones = status?.companions.filter(companion => !companion.revokedAt) ?? []
  const pairedName = summary?.companionId ? status.companions.find(item => item.id === summary.companionId)?.name ?? summary.name : summary?.name
  const defaultName = `${ownerName}'s phone`

  return <dialog ref={dialog} className="companion-dialog" aria-labelledby="companion-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="companion-heading">
      <div>
        <h2 id="companion-title">Pair a phone</h2>
        <p className="muted">{project.name}</p>
      </div>
      <button ref={closeButton} type="button" className="close" onClick={onClose}>Close</button>
    </div>
    {failure && <div role="alert" className="error inline-error">
      <strong>{FAILURES[failure.code] ?? failure.message}</strong>
    </div>}
    {!status && !failure && <p role="status" className="muted">Checking this computer’s networks…</p>}
    {status && <>
      <section className="companion-network" aria-labelledby="companion-network-title">
        <h3 id="companion-network-title">Phone access <span className="companion-state" data-on={healthy || undefined}>
          {healthy ? 'On' : settings.enabled ? 'Not running' : 'Off'}</span></h3>
        {!status.interfaces.length ? <div className="notice inline-notice" role="status">
          <p>This computer has no Wi-Fi or Ethernet address right now. Connect it to your network, then check again.</p>
          <div className="actions"><button disabled={busy} onClick={event => perform(load, event)}>Check again</button></div>
        </div> : <>
          {healthy ? <p className="companion-address">Phones open <span className="mono">{status.phoneUrl}</span></p>
            : !settings.enabled && <p>Your phone opens this board through this computer, over your local network.</p>}
          {status.interfaces.length > 1 ? <label>Network
            <select value={interfaceName} disabled={busy} onChange={event => setInterfaceName(event.target.value)}>
              <option value="">Choose a network</option>
              {status.interfaces.map(item => <option key={`${item.name}:${item.address}`} value={item.name}>{item.name} · {item.address}</option>)}
            </select>
          </label> : !healthy && <p className="muted small">Network: {status.interfaces[0].name} · {status.interfaces[0].address}</p>}
        </>}
        {settings?.enabled && !healthy && status.diagnostic && <div className="notice inline-notice" role="status">
          <p>{status.diagnostic}</p>
        </div>}
        {confirming === 'off' ? <div className="companion-confirm" role="group" aria-label="Confirm turning off phone access">
          <p>Turn off phone access? Paired phones disconnect until you turn it on again, and waiting codes stop working.</p>
          <div className="actions">
            <button className="danger" disabled={busy} onClick={event => network(false, event)}>Turn off</button>
            <button disabled={busy} data-focus-after onClick={() => confirm(null, '[data-opener="off"]')}>Keep on</button>
          </div>
        </div> : status.interfaces.length > 0 && <div className="actions">
          {!settings.enabled && <button className="primary" disabled={busy || !interfaceName} onClick={event => network(true, event)}>
            Turn on phone access</button>}
          {needsRebind && <button className="primary" disabled={busy || !interfaceName} onClick={event => network(true, event)}>Rebind</button>}
          {switching && <button disabled={busy} onClick={event => network(true, event)}>Use this network</button>}
          {settings.enabled && <button disabled={busy} data-opener="off" onClick={() => confirm('off', '[data-focus-after]')}>
            Turn off phone access</button>}
        </div>}
        <p className="companion-warning">Unencrypted HTTP. Use only on a network you trust, such as your home Wi-Fi, never public Wi-Fi.</p>
      </section>

      {healthy && <section className="companion-pairing" aria-labelledby="companion-pairing-title">
        <h3 id="companion-pairing-title">Pairing code</h3>
        <div className="companion-code" data-state={state ?? 'none'}>
          <div className="companion-qr">
            {!issued ? <p className="muted">Make a code, then scan it with the phone’s camera.</p>
              : state === 'pending' ? (qr ? <img src={qr} alt={`QR code that pairs a phone, valid until ${clock(issued.expiresAt)}`} />
                : <p className="muted">Drawing code…</p>)
              : state === 'redeemed' ? <p className="companion-result" data-tone="success"><strong>Paired: {pairedName}</strong>It can open {project.name} now.</p>
              : <p className="companion-result"><strong>{state === 'expired' ? 'This code expired' : 'This code was cancelled'}</strong>Make a new code to pair a phone.</p>}
          </div>
          {issued && state === 'pending' && <div className="companion-digits">
            <p className="pairing-digits" aria-label={`Pairing code ${issued.code.split('').join(' ')}`}>{groupPairingCode(issued.code)}</p>
            <p className="muted small" role="timer">Use once before {clock(issued.expiresAt)} · {formatCountdown(issued.expiresAt - now)} left</p>
            <p className="small" role="status">Waiting for the phone… Or open the address above on the phone and type the code.</p>
          </div>}
        </div>
        <div className="companion-new">
          <label>Phone name<input value={phoneName} maxLength={100} placeholder={defaultName}
            onChange={event => setPhoneName(event.target.value)} /></label>
          <div className="actions">
            <button className={issued && state === 'pending' ? undefined : 'primary'} disabled={busy} onClick={newCode}>New code</button>
            {issued && state === 'pending' && <button disabled={busy} onClick={event => cancelCode(issued.id, event)}>Cancel code</button>}
          </div>
        </div>
        {waiting.length > 0 && <>
          <h4>Other codes still waiting</h4>
          <ul className="companion-list">
            {waiting.map(pairing => <li key={pairing.id}>
              <span>{pairing.name}</span>
              <span className="muted small">Until {clock(pairing.expiresAt)}</span>
              <button disabled={busy} onClick={event => cancelCode(pairing.id, event)} aria-label={`Cancel code for ${pairing.name}`}>Cancel</button>
            </li>)}
          </ul>
        </>}
      </section>}

      <section aria-labelledby="companion-phones-title">
        <h3 id="companion-phones-title">Paired phones <span className="count">{phones.length}</span></h3>
        {!phones.length ? <p className="muted">None yet.</p> : <ul className="companion-list">
          {phones.map(phone => <li key={phone.id}>
            {confirming === phone.id ? <div className="companion-confirm" role="group" aria-label={`Confirm revoking ${phone.name}`}>
              <p>Revoke {phone.name}? It is signed out now and needs a new code to pair again.</p>
              <div className="actions">
                <button className="danger" disabled={busy} onClick={event => revoke(phone.id, event)}>Revoke</button>
                <button disabled={busy} data-focus-after onClick={() => confirm(null, `[data-opener="${phone.id}"]`)}>Keep</button>
              </div>
            </div> : <>
              <span>{phone.name}</span>
              <span className="muted small">{lastSeen(phone, now)}</span>
              <button disabled={busy} data-opener={phone.id} onClick={() => confirm(phone.id, '[data-focus-after]')}
                aria-label={`Revoke ${phone.name}`}>Revoke</button>
            </>}
          </li>)}
        </ul>}
      </section>
      {stale && <p className="muted small" role="status">Can’t reach the local client; this status may be out of date.</p>}
    </>}
  </dialog>
}
