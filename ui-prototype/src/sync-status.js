/** What a hub reports about other machines, or what a member's hub said: worth showing before the save state. */
export function hubNotice(status) {
  if (status?.hub?.waiting) return 'Restored hub · waits for a member machine, or pardner client resume, before serving others'
  if (status?.duplicateMachines?.some(entry => entry.sessions > 1)) return 'Two copies of one machine are connected · check for a running backup'
  if (status?.hubRefusal?.code === 'HANDSHAKE_VERSION') return 'Sync paused · the connection reported a version mismatch. Check Pardner on both machines.'
  if (status?.hubRefusal?.code === 'HUB_WAITING' && status.hubRefusal.authenticated) return 'Saved locally · the hub is catching up after a restore'
  return null
}

export const pendingReplicationText = 'Waiting to replicate'

export function isReplicationPending(status, { connected = true, heads } = {}) {
  return Boolean(connected && status?.available !== false && status?.role === 'replica' &&
    !status.storageError && status.savedLocally && status.syncPending &&
    (heads === undefined || status.heads?.join(',') === heads))
}

/** Show replication only for work awaiting host acknowledgement. */
export function replicationStatus(status, options = {}) {
  const { connected = true } = options
  if (!connected) return { state: 'unknown', text: 'Local service disconnected' }
  if (!status) return { state: 'unknown', text: 'Status not reported' }
  if (status.available === false) return { state: 'unknown', text: 'Project service unavailable' }
  if (status.storageError) return { state: 'error', text: 'Local save failed' }
  const notice = hubNotice(status)
  if (notice) return { state: 'warning', text: notice }
  if (isReplicationPending(status, options)) return { state: 'pending', text: pendingReplicationText }
  return null
}

export function syncStatusText(status, options) {
  return replicationStatus(status, options)?.text ?? null
}
