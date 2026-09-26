import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

function isPairingReady(access) {
  return access.phoneUrl && access.saved.enabled && !access.restartRequired
}

export default function PhoneAccess({ request, onClose, canManageAccess }) {
  const dialog = useRef(null)
  const [access, setAccess] = useState(null)
  const [interfaceName, setInterfaceName] = useState('')
  const [pairing, setPairing] = useState(null)
  const [qr, setQr] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const pairingUrl = access?.phoneUrl && pairing ? `${access.phoneUrl}#pair=${pairing.code}` : null
  const deviceUrl = pairingUrl || access?.phoneUrl
  const load = async () => {
    const state = await request('/pardner/access')
    setAccess(state)
    if (isPairingReady(state)) {
      setPairing(await request('/pardner/access/pairing', {}))
    }
    setInterfaceName(state.saved.interfaceName || (state.interfaces.length === 1 ? state.interfaces[0].name : ''))
  }
  useEffect(() => {
    dialog.current.showModal()
    load().catch(setError)
  }, [request])
  useEffect(() => {
    let stale = false
    setQr(null)
    if (pairingUrl) QRCode.toDataURL(pairingUrl, { width: 240, margin: 2 })
      .then(url => { if (!stale) setQr(url) }).catch(setError)
    return () => { stale = true }
  }, [pairingUrl])
  const perform = async action => {
    setBusy(true)
    setError(null)
    try { await action() } catch (failure) { setError(failure) }
    finally { setBusy(false) }
  }
  const configure = enabled => perform(async () => {
    setAccess(await request('/pardner/access', { enabled, interfaceName }))
    setPairing(null)
  })
  const copyAddress = () => perform(async () => {
    if (!navigator.clipboard) throw new Error('Select the device address above and copy it manually.')
    await navigator.clipboard.writeText(deviceUrl)
    setCopied(true)
  })
  const generatePairing = () => perform(async () => {
    setPairing(await request('/pardner/access/pairing', {}))
    setCopied(false)
  })
  return <dialog ref={dialog} className="phone-dialog" aria-labelledby="phone-title" onClose={onClose}>
    <div className="panel-heading">
      <h2 id="phone-title">Pair another device</h2>
      <button onClick={() => dialog.current.close()} aria-label="Close device pairing">Close</button>
    </div>
    <p className="muted">Scan with a device on the same Wi-Fi to connect.</p>
    {error && <div role="alert" className="error"><p>{error.message}</p><button onClick={() => perform(load)}>Try again</button></div>}
    {!access && !error && <p role="status">Finding available networks…</p>}
    {access && <>
      {!canManageAccess && !access.phoneUrl && <p>Open Pardner on the service computer through its local address to enable device access.</p>}
      {access.restartRequired && <p className="notice" role="status">Settings saved. Restart the Pardner service with the same data directory to apply them, then reopen this dialog. Existing access stays active until restart.</p>}
      {access.diagnostic && <p role="status">{access.diagnostic}</p>}
      {isPairingReady(access) && <section className="phone-pairing">
        {qr && <img width="240" height="240" src={qr} alt="QR code for the device address" />}
        <details>
          <summary>Connect manually</summary>
          <label>Device address<input readOnly value={deviceUrl} onFocus={event => event.target.select()} /></label>
          <button onClick={copyAddress}>{copied ? 'Address copied' : 'Copy address'}</button>
          {pairing && <p className="pairing-code" aria-label="Pairing code">{pairing.code}</p>}
        </details>
        <div className="pairing-footer">
          {pairing && <p className="muted">Use once before {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>}
          <button disabled={busy} onClick={generatePairing}>{pairing ? 'Generate new code' : 'Generate pairing code'}</button>
        </div>
      </section>}
      {canManageAccess && <details open={!access.phoneUrl}>
        <summary>Network settings</summary>
        <label>Network interface
          <select value={interfaceName} onChange={event => setInterfaceName(event.target.value)}>
            <option value="">Choose a network</option>
            {access.interfaces.map(item => <option key={`${item.name}:${item.address}`} value={item.name}>{item.name} · {item.address}</option>)}
          </select>
        </label>
        {!access.interfaces.length && <p>No LAN IPv4 address is available. Connect this computer to Wi-Fi or Ethernet, then try again.</p>}
        <div className="actions">
          <button disabled={busy || !interfaceName} onClick={() => configure(true)}>
            {access.saved.enabled ? 'Save network' : 'Enable phone access'}
          </button>
          {access.saved.enabled && <button disabled={busy} onClick={() => configure(false)}>Disable phone access</button>}
        </div>
      </details>}
      <p className="pairing-network-note muted">Trusted networks only. This connection is unencrypted.</p>
    </>}
  </dialog>
}
