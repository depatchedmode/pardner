// Mention helpers for the comment composer and rendered comments.
// The handle pattern mirrors mentionedActors in lib/workspace-commands.js.
const HANDLE = /@([A-Za-z][A-Za-z0-9_-]*)/g
const EMAIL_LOCAL = /[A-Za-z0-9._%+-]/
const HANDLE_CHAR = /[A-Za-z0-9_-]/

// Typed handles with no matching Actor, in first-seen order. While the
// textarea is focused, a handle at the very end of the text may still be
// half-typed, so it is not reported until a terminator follows or focus is lost.
export function unmatchedHandles(text, actors, { focused = false } = {}) {
  const known = new Set(Object.values(actors ?? {}).map(actor => String(actor.handle).toLowerCase()))
  const source = String(text ?? '')
  const seen = new Set()
  const result = []
  for (const match of source.matchAll(HANDLE)) {
    const before = source[match.index - 1]
    if (before && EMAIL_LOCAL.test(before)) continue
    const next = source[match.index + match[0].length]
    if (next === undefined ? focused : HANDLE_CHAR.test(next)) continue
    const key = match[1].toLowerCase()
    if (known.has(key) || seen.has(key)) continue
    seen.add(key)
    result.push(match[1])
  }
  return result
}

export function mentionHint(handles) {
  if (!handles?.length) return null
  const tagged = handles.map(handle => `@${handle}`)
  const list = tagged.length === 1 ? tagged[0] : `${tagged.slice(0, -1).join(', ')} and ${tagged.at(-1)}`
  return `${list} ${tagged.length === 1 ? 'matches' : 'match'} no Actor and won't notify anyone.`
}

const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html', 'image', 'imageReference'])

// Remark plugin factory. deliveredHandles is a Set of lowercase handles, or a
// Map of lowercase handle -> label used in the "Notified {label}" title.
export function remarkMentionChips(deliveredHandles) {
  const labelFor = handle => (typeof deliveredHandles?.get === 'function' ? deliveredHandles.get(handle) : undefined) ?? `@${handle}`
  const delivered = handle => deliveredHandles?.has?.(handle) ?? false

  function split(value) {
    const nodes = []
    let last = 0
    for (const match of value.matchAll(HANDLE)) {
      const before = value[match.index - 1]
      const key = match[1].toLowerCase()
      if ((before && EMAIL_LOCAL.test(before)) || !delivered(key)) continue
      if (match.index > last) nodes.push({ type: 'text', value: value.slice(last, match.index) })
      nodes.push({
        type: 'mention',
        data: { hName: 'span', hProperties: { className: ['mention'], title: `Notified ${labelFor(key)}` } },
        children: [{ type: 'text', value: match[0] }],
      })
      last = match.index + match[0].length
    }
    if (!nodes.length) return null
    if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) })
    return nodes
  }

  function walk(node) {
    if (!node.children || SKIP.has(node.type)) return
    node.children = node.children.flatMap(child => {
      if (child.type !== 'text') {
        walk(child)
        return [child]
      }
      return split(child.value) ?? [child]
    })
  }

  return () => walk
}
