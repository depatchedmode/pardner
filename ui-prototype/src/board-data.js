// The board as the service sends it, with each of its dictionaries keyed by board data (Actors, tasks, goals, veins,
// comments, mentions, operations, read receipts) held without a prototype: a lookup such as `actors[task.assignee]`
// then finds only what the board holds, so an ID like `__proto__` or `constructor` names nothing.

const DICTIONARIES = ['actors', 'tasks', 'goals', 'veins', 'comments', 'mentions', 'operations', 'readReceipts']
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** A copy of `value`'s own entries without a prototype (empty when it is not a map). */
export const dictionary = (...values) => Object.assign(Object.create(null), ...values.filter(isMap))

/** `doc` with every board dictionary held without a prototype; anything else as sent. */
export function boardData(doc) {
  if (!isMap(doc)) return doc
  const next = { ...doc }
  for (const name of DICTIONARIES) next[name] = dictionary(doc[name])
  return next
}
