import { actorId } from './client-identity.js'
import { mayAuthor } from './membership.js'

// The People view (#198): who is in a project, their machines and agents, who let each in, who was removed and
// by whom, and what the viewing machine may do. It is computed from this machine's own record store, so it works
// offline; the hub re-checks every action when it is taken. Facts a person can act on use plain words; machine
// IDs appear only as a short secondary label.

export const shortMachineId = id => typeof id === 'string' ? id.slice('machine-'.length, 'machine-'.length + 6) : null
const ROLES = { owner: 'Owner', admin: 'Admin', member: 'Member' }
const allow = () => ({ allowed: true, reason: null })
const deny = reason => ({ allowed: false, reason })

/**
 * `membership` is computeMembership's result; `project` the registry entry (its `people` name the devices);
 * `machineId` the viewing machine; `presence` a presence snapshot or null; `seen` the hub's
 * `{ [machineId]: { connected, lastSeenAt } }` or null when it could not be asked.
 */
export function peopleView({ membership, project, machineId, localDevice, presence = null, seen = null, hubReachable = null, now = Date.now() }) {
  const actors = Object.values(project.people ?? {})
  const deviceNames = new Map(), machineOfDevice = new Map()
  for (const actor of actors) for (const device of actor.devices ?? []) {
    if (!device?.machineId) continue
    if (device.name) deviceNames.set(device.machineId, device.name)
    if (device.id) machineOfDevice.set(device.id, device.machineId)
  }
  if (localDevice?.name) { deviceNames.set(machineId, localDevice.name); machineOfDevice.set(localDevice.id, machineId) }
  const live = new Set()
  for (const actor of presence?.actors ?? []) for (const session of actor.sessions ?? []) {
    const id = machineOfDevice.get(session.deviceId)
    if (id) live.add(id)
  }
  const everyone = [...membership.people, ...(membership.formerPeople ?? [])]
  const emailOf = person => person.email || actors.find(actor => actor.kind === 'human' && actor.humanId === person.id)?.gitIdentity?.email || null
  const nameOf = personId => everyone.find(person => person.id === personId)?.displayName
    ?? actors.find(actor => actor.kind === 'human' && actor.humanId === personId)?.displayName ?? 'Someone'
  const who = entry => entry ? { personId: entry.personId, name: nameOf(entry.personId) } : null
  // The hub is the machine that started the project: the genesis machine, admitted by nobody.
  const hubMachineId = [...membership.machines, ...(membership.formerMachines ?? [])]
    .find(machine => machine.admittedBy === null && machine.personId === membership.people.find(person => person.role === 'owner')?.id)?.id ?? null
  const me = membership.machines.find(machine => machine.id === machineId) ?? null
  const viewer = me && membership.people.find(person => person.id === me.personId)
  const manager = Boolean(viewer && !me.agentsOnly && ['owner', 'admin'].includes(viewer.role))
  const draft = fields => Boolean(me) && mayAuthor(membership, { ...fields, signer: machineId })

  const machineName = id => deviceNames.get(id) ?? 'Unnamed machine'
  const status = id => {
    if (id === machineId) return { status: 'this', lastSeenAt: null }
    if (id === hubMachineId) return { status: hubReachable === false ? 'unreachable' : 'online', lastSeenAt: null }
    const known = seen?.[id]
    if (live.has(id) || known?.connected) return { status: 'online', lastSeenAt: null }
    return { status: 'offline', lastSeenAt: Number.isFinite(known?.lastSeenAt) ? known.lastSeenAt : null }
  }

  const removeMachine = (machine, person) => {
    if (!viewer || me.agentsOnly || !(person.id === viewer.id || manager)) return null
    if (machine.id === machineId) return deny('You can’t remove the machine you’re using. Remove it from another of your machines, or leave the project.')
    if (machine.id === hubMachineId) return deny('This machine hosts the project, so it can’t be removed.')
    if (draft({ kind: 'machine.remove', subject: machine.id })) return allow()
    return deny(person.role === 'owner' ? 'Only the owner removes the owner’s machines.' : 'Only the owner can remove machines of someone who is or was an admin.')
  }
  const personActions = person => {
    const self = viewer && person.id === viewer.id
    const actions = {}
    if (manager && !self) {
      actions.remove = person.role === 'owner' ? deny('The owner can’t be removed.')
        : draft({ kind: 'member.remove', subject: person.id }) ? allow() : deny('Only the owner can remove someone who is or was an admin.')
    }
    if (viewer?.role === 'owner' && !me.agentsOnly && person.role !== 'owner') actions.changeRole = draft({ kind: 'member.role', subject: person.id }) ? allow() : deny('Only the owner changes roles.')
    if ((self && !me.agentsOnly) || (manager && !self)) {
      actions.pairMachine = draft({ kind: 'machine.add', personId: person.id }) ? allow()
        : deny(person.role === 'owner' ? 'Only the owner pairs the owner’s machines.' : 'Only the owner can pair a machine for someone who is or was an admin.')
    }
    if (self && !me.agentsOnly) actions.editProfile = allow()
    return actions
  }

  const agentsOf = person => {
    const byId = new Map()
    for (const label of membership.agentNames) {
      if (label.id !== actorId(person.id, label.harness)) continue
      const entry = byId.get(label.id) ?? { id: label.id, name: label.displayName, harness: label.harness, machines: [] }
      entry.machines.push({ id: label.machineId, name: machineName(label.machineId), shortId: shortMachineId(label.machineId) })
      byId.set(label.id, entry)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
  const order = { owner: 0, admin: 1, member: 2 }
  const people = membership.people.map(person => ({
    id: person.id, name: person.displayName, email: emailOf(person), role: person.role, roleLabel: ROLES[person.role],
    everAdmin: person.everAdmin === true, you: Boolean(viewer && person.id === viewer.id), admittedBy: who(person.admittedBy),
    machines: membership.machines.filter(machine => machine.personId === person.id).map(machine => {
      const remove = removeMachine(machine, person)
      return { id: machine.id, shortId: shortMachineId(machine.id), name: machineName(machine.id), thisMachine: machine.id === machineId,
        hostsProject: machine.id === hubMachineId, agentsOnly: machine.agentsOnly === true, ...status(machine.id),
        admittedBy: who(machine.admittedBy), actions: remove ? { remove } : {} }
    }).sort((a, b) => Number(b.thisMachine) - Number(a.thisMachine) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    agents: agentsOf(person),
    actions: personActions(person),
  })).sort((a, b) => Number(b.you) - Number(a.you) || order[a.role] - order[b.role] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const removedBy = subject => (membership.removals ?? []).filter(entry => entry.subject === subject).map(entry => ({ ...who(entry.by), left: entry.left }))
  const former = (membership.formerMachines ?? [])
  const removedPeople = (membership.formerPeople ?? []).map(person => {
    const by = removedBy(person.id)
    return { id: person.id, name: person.displayName, email: emailOf(person), role: person.role, roleLabel: ROLES[person.role],
      left: by.some(entry => entry.left), removedBy: by.filter(entry => !entry.left).map(({ left, ...entry }) => entry), admittedBy: who(person.admittedBy),
      machines: former.filter(machine => machine.personId === person.id).map(machine => ({ id: machine.id, shortId: shortMachineId(machine.id), name: machineName(machine.id) })) }
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const current = new Set(membership.people.map(person => person.id))
  const removedMachines = former.filter(machine => current.has(machine.personId)).map(machine => ({
    id: machine.id, shortId: shortMachineId(machine.id), name: machineName(machine.id), personId: machine.personId, personName: nameOf(machine.personId),
    agentsOnly: machine.agentsOnly === true, removedBy: removedBy(machine.id).map(({ left, ...entry }) => entry),
  })).sort((a, b) => a.personName.localeCompare(b.personName) || a.name.localeCompare(b.name))

  const actions = {}
  if (viewer && !me.agentsOnly) {
    actions.invite = manager ? { ...allow(), roles: viewer.role === 'owner' ? ['member', 'admin'] : ['member'] }
      : { ...deny('Only the owner or an admin can let people in. You can pair your own machines.'), roles: [] }
    actions.leave = viewer.role === 'owner' ? deny('As the owner, you can’t leave. The owner stays with the project for as long as it exists.') : allow()
  }
  const ownMachines = viewer ? membership.machines.filter(machine => machine.personId === viewer.id).length : 0
  return {
    projectId: membership.projectId, projectName: project.name, observedAt: now,
    you: viewer ? { personId: viewer.id, machineId, role: viewer.role, agentsOnly: me.agentsOnly === true } : null,
    // A just-joined machine may not hold its own admission record yet.
    syncing: !viewer, hubReachable,
    // An owner who loses every machine can no longer change admins: suggest a second one (#198).
    suggestPairing: viewer?.role === 'owner' && ownMachines === 1,
    people, removed: { people: removedPeople, machines: removedMachines }, actions,
    counts: { people: people.length, machines: membership.machines.length, agents: people.reduce((sum, person) => sum + person.agents.length, 0),
      removed: removedPeople.length + removedMachines.length },
  }
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
function ago(at, now) {
  const minutes = Math.round((now - at) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 90) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}
export function machineState(machine, now = Date.now()) {
  if (machine.status === 'this') return 'this machine'
  if (machine.status === 'online') return 'online'
  if (machine.status === 'unreachable') return 'hub unreachable'
  return machine.lastSeenAt ? `last seen ${ago(machine.lastSeenAt, now)}` : 'offline'
}

/** The same facts as plain text, for `pardner client people`. */
export function peopleListing(view) {
  const lines = [`${view.projectName}: ${plural(view.counts.people, 'person', 'people')}, ${plural(view.counts.machines, 'machine')}, ${plural(view.counts.agents, 'agent')}`
    + (view.counts.removed ? `, ${view.counts.removed} removed` : '')]
  if (view.syncing) lines.push('', 'This machine is still receiving the member list. Try again in a moment.')
  for (const person of view.people) {
    lines.push('', `${person.name}${person.you ? ' (you)' : ''} · ${person.roleLabel}${person.email ? ` · ${person.email}` : ''}`)
    lines.push(`  ${person.admittedBy ? `Let in by ${person.admittedBy.name}` : 'Started the project'}`)
    lines.push('  Machines:')
    for (const machine of person.machines) {
      const tags = [machine.hostsProject && 'hosts the project', machine.agentsOnly && 'agents only'].filter(Boolean)
      lines.push(`    ${machine.name} [${machine.shortId}] · ${machineState(machine, view.observedAt)}${tags.length ? ` · ${tags.join(' · ')}` : ''}`
        + (machine.admittedBy && machine.admittedBy.personId !== person.id ? ` · paired by ${machine.admittedBy.name}` : ''))
    }
    if (!person.machines.length) lines.push('    none: someone with access must pair a new one')
    if (person.agents.length) {
      lines.push('  Agents:')
      for (const agent of person.agents) lines.push(`    ${agent.name} · on ${agent.machines.map(machine => machine.name).join(', ')}`)
    }
    lines.push(`  Person ID: ${person.id}`)
  }
  if (view.removed.people.length || view.removed.machines.length) {
    lines.push('', 'Removed')
    for (const person of view.removed.people) {
      const how = person.left ? 'left the project' : `removed by ${person.removedBy.map(entry => entry.name).join(', ') || 'someone'}`
      lines.push(`  ${person.name} · was ${person.roleLabel.toLowerCase()} · ${how}${person.machines.length ? ` · machines: ${person.machines.map(machine => machine.name).join(', ')}` : ''}`)
    }
    for (const machine of view.removed.machines) {
      lines.push(`  ${machine.personName}’s ${machine.name} [${machine.shortId}] · machine removed by ${machine.removedBy.map(entry => entry.name).join(', ') || 'someone'}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/** Who removed `machineId`, and whether its person left, from the records: `{ kind, left, by }`, or null if unknown. */
export function removalFor(membership, machineId) {
  const machine = [...(membership.formerMachines ?? []), ...membership.machines].find(entry => entry.id === machineId)
  const removals = membership.removals ?? []
  const entry = (machine && removals.find(removal => removal.kind === 'member.remove' && removal.subject === machine.personId))
    ?? removals.find(removal => removal.kind === 'machine.remove' && removal.subject === machineId)
  if (!entry) return null
  const name = [...membership.people, ...(membership.formerPeople ?? [])].find(person => person.id === entry.by.personId)?.displayName ?? null
  return { kind: entry.kind === 'member.remove' ? 'person' : 'machine', left: entry.left === true, by: { personId: entry.by.personId, name } }
}

/** What a removed machine is told: removal is a project fact, never "signed out" (#154). */
export function removedMessage(removal) {
  if (removal?.left) return 'You left this project. Its copy on this computer stays saved here.'
  const by = removal?.by?.name ? ` by ${removal.by.name}` : ''
  if (removal?.kind === 'machine') return `This computer was removed from the project${by}. Its copy here stays saved.`
  if (removal?.kind === 'person') return `You were removed from this project${by}. Its copy on this computer stays saved here.`
  return 'This computer is no longer a member of this project. Its copy here stays saved.'
}
