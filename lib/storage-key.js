// Keep keys portable across filesystems, including Windows device names and
// encoded separators. Automerge's document IDs, hashes, and UUIDs fit this set.
export function isValidStorageKeyComponent(component) {
  return typeof component === 'string' &&
    /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(component) &&
    !component.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(component)
}

// Peers announce a storage ID that Repo later uses as a storage key component.
export function isValidPeerMetadata(metadata) {
  return metadata === undefined || (
    metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata) &&
    (metadata.storageId === undefined || isValidStorageKeyComponent(metadata.storageId)))
}

export function validateStorageKey(key) {
  if (!Array.isArray(key) || key.length === 0 ||
      !Array.from(key).every(isValidStorageKeyComponent)) {
    throw Object.assign(new Error('Invalid storage key'), { code: 'INVALID_STORAGE_KEY' })
  }
}
