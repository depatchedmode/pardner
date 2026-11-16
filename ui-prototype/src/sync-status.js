/** What a hub reports about other machines, or what a member's hub said: worth showing before the save state. */
export function hubNotice(status) {
  if (status?.hub?.waiting) return 'Restored hub · waits for a member machine, or pardner client resume, before serving others'
  if (status?.duplicateMachines?.some(entry => entry.sessions > 1)) return 'Two copies of one machine are connected · check for a running backup'
  if (status?.hubRefusal?.code === 'HUB_WAITING') return 'Saved locally · the hub is catching up after a restore'
  return null
}

/** Shared save/sync copy for board and client headers. */
export function syncStatusText(status, { connected = true, busy = false, heads } = {}) {
  if (busy) return 'Saving locally…'
  if (!connected) return 'Local service disconnected'
  if (!status) return 'Status not reported'
  if (status.available === false) return 'Project service unavailable'
  if (status.storageError) return 'Local save failed'
  const notice = hubNotice(status)
  if (notice) return notice
  if (!status.savedLocally) return 'Saving locally…'
  if (heads !== undefined && status.heads?.join(',') !== heads) return 'Saving locally…'
  if (status.syncPending || status.hubConnected === false) return 'Saved locally · waiting for hub'
  return 'Saved locally · synced'
}
