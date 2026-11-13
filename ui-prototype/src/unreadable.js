// What the board could not read, in words (lib/workspace.js snapshot): each record left out, and each field shown
// empty because what is stored there is of the wrong kind. A top-level part of the board is named on its own.

const own = (map, key) => (map && typeof map === 'object' && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null)
const titled = (word, record, id) => `${word} “${typeof record?.title === 'string' && record.title ? record.title : id}”`
const MAX_NAMED = 3

/** The record `item` names, in a few words. */
function recordWords(item, { tasks, goals, veins }) {
  if (item.kind === 'actor') return `Actor ${item.id}`
  if (item.kind === 'task') return titled('task', own(tasks, item.id), item.id)
  if (item.kind === 'goal') return titled('goal', own(goals, item.id), item.id)
  if (item.kind === 'vein') return titled('vein', own(veins, item.id), item.id)
  return { comment: 'a comment', mention: 'a mention', operation: 'an Activity entry', readReceipt: 'a read receipt', link: 'a task’s place in a vein' }[item.kind] ?? 'a record'
}

const named = list => (list.length > MAX_NAMED ? `${list.slice(0, MAX_NAMED).join('; ')}; and ${list.length - MAX_NAMED} more` : list.join('; '))

/**
 * The sentences naming what the board could not read, apart from its top-level parts: the records not shown, and the
 * fields shown empty. Empty when there is nothing to say.
 */
export function unreadableLines(items, lookups) {
  const hidden = [], empty = [], seen = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.kind === 'root' || typeof item.id !== 'string') continue
    const words = recordWords(item, lookups)
    // A vein link and an Activity entry are each one value: whatever part of one can't be read, it is not shown in full.
    const field = typeof item.field === 'string' && !['link', 'operation'].includes(item.kind) ? item.field : null
    const text = field ? `${field} of ${words}` : words
    if (seen.has(text)) continue
    seen.add(text)
    ;(field ? empty : hidden).push(text)
  }
  return [...(hidden.length ? [`Not shown: ${named(hidden)}.`] : []), ...(empty.length ? [`Shown empty: ${named(empty)}.`] : [])]
}

/** The fields of record `id` of `kind` that are shown empty because what is stored there can't be read. */
export function emptyFields(items, kind, id) {
  return [...new Set((Array.isArray(items) ? items : []).filter(item => item?.kind === kind && item.id === id && typeof item.field === 'string').map(item => item.field))]
}
