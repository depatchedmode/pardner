/** What a hub reports about other machines, or what a member's hub said: worth showing before the save state. */
export function hubNotice(status) {
  if (status?.hub?.waiting) return 'Restored hub · waits for a member machine, or pardner client resume, before serving others'
  if (status?.duplicateMachines?.some(entry => entry.sessions > 1)) return 'Two copies of one machine are connected · check for a running backup'
  if (status?.hubRefusal?.code === 'HUB_WAITING') return 'Saved locally · the hub is catching up after a restore'
  return null
}

/** Shared save/sync state and copy for board and client headers. */
export function replicationStatus(status, { connected = true, busy = false, heads } = {}) {
  if (busy) return { state: 'pending', text: 'Saving locally…' }
  if (!connected) return { state: 'unknown', text: 'Local service disconnected' }
  if (!status) return { state: 'unknown', text: 'Status not reported' }
  if (status.available === false) return { state: 'unknown', text: 'Project service unavailable' }
  if (status.storageError) return { state: 'error', text: 'Local save failed' }
  const notice = hubNotice(status)
  if (notice) return { state: 'warning', text: notice }
  if (!status.savedLocally || (heads !== undefined && status.heads?.join(',') !== heads)) {
    return { state: 'pending', text: 'Saving locally…' }
  }
  if (status.syncPending || status.hubConnected === false) return { state: 'pending', text: 'Saved locally · waiting for hub' }
  return { state: 'synced', text: 'Saved locally · synced' }
}

export function syncStatusText(status, options) {
  return replicationStatus(status, options).text
}
