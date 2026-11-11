import { ImmutableString, isImmutableString } from '@automerge/automerge'

// Pardner replaces whole values; collaborative text would add one CRDT operation
// per character. Use this at every document write, including nested log payloads.
export function storageValue(value) {
  if (isImmutableString(value)) return value
  if (typeof value === 'string') return new ImmutableString(value)
  if (Array.isArray(value)) return value.map(storageValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, storageValue(entry)]))
  }
  return value
}
