/** Shared save/sync copy for board and client headers. */
export function syncStatusText(status, { connected = true, busy = false, heads } = {}) {
  if (busy) return 'Saving locally…'
  if (!connected) return 'Local service disconnected'
  if (!status) return 'Status not reported'
  if (status.available === false) return 'Project service unavailable'
  if (status.storageError) return 'Local save failed'
  if (!status.savedLocally) return 'Saving locally…'
  if (heads !== undefined && status.heads?.join(',') !== heads) return 'Saving locally…'
  if (status.syncPending || status.hubConnected === false) return 'Saved locally · waiting for hub'
  return 'Saved locally · synced'
}
