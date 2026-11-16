/** Compare Automerge head arrays the same way across persistence and sync-ack. */
export function sameHeads(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}
