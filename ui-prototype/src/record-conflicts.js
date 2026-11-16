// Pure helpers for goal and vein conflicts. A conflict is a list of alternatives
// ({ operationId, actorId, value }) that were written from the same base.
export const FIELD_LABELS = { title: 'title', description: 'description', status: 'status', goalId: 'goal' }

// Alternatives with the same value become one group naming each author once,
// ordered by the group's first operationId so every replica lists them alike.
export function conflictGroups(choices) {
  const groups = new Map()
  for (const choice of [...choices].sort((a, b) => String(a.operationId).localeCompare(String(b.operationId)))) {
    const key = JSON.stringify(choice.value)
    const group = groups.get(key) ?? { value: choice.value, actorIds: [], operationIds: [] }
    if (!group.actorIds.includes(choice.actorId)) group.actorIds.push(choice.actorId)
    group.operationIds.push(choice.operationId)
    groups.set(key, group)
  }
  return [...groups.values()]
}

// "A or B", or "A, B or C": what a disputed status pill reads instead of the merge's pick.
export function disputedStatusText(choices, labels) {
  const names = conflictGroups(choices).map(group => labels[group.value] ?? String(group.value))
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}
