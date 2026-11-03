/**
 * Explicit-state bounded model checker for guarded-action models.
 *
 * A model supplies an initial state, a list of actions, state invariants and a
 * conditional progress property. The checker enumerates every reachable state
 * (breadth first), checks each invariant on each state, then checks progress
 * under weak fairness of the actions marked `fair`: once the trigger holds, an
 * execution that never reaches the goal is a counterexample unless it is
 * explained by a fair action that was never enabled again. This is the same
 * fairness notion as TLA+ WF_vars(A) for each fair action A.
 *
 * States are plain JSON-serializable objects; the serialization is the identity.
 */

export class StateLimitExceeded extends Error {}

/**
 * Nodes hold only the serialized state (the Map key), the parent link and the
 * outgoing edges; states are re-parsed on demand. Invariants are checked as
 * each state is discovered so a violation stops exploration early.
 */
export function explore(model, { maxStates = Infinity } = {}) {
  const key = state => JSON.stringify(state)
  const nodes = new Map()
  const order = []
  const labels = new Map()
  const intern = label => { if (!labels.has(label)) labels.set(label, label); return labels.get(label) }
  const witnesses = Object.fromEntries((model.witnesses ?? []).map(witness => [witness.name, 0]))
  const root = key(model.initial())
  nodes.set(root, { parent: null, via: null, edges: [] })
  order.push(root)
  let violation = null
  const admit = (target, parent, via) => {
    if (nodes.has(target)) return
    if (nodes.size >= maxStates) throw new StateLimitExceeded(`More than ${maxStates} states; tighten the bounds or raise --max-states`)
    nodes.set(target, { parent, via, edges: [] })
    order.push(target)
  }
  for (let cursor = 0; cursor < order.length && !violation; cursor++) {
    const current = order[cursor]
    const node = nodes.get(current)
    const state = JSON.parse(current)
    for (const invariant of model.invariants) {
      if (!invariant.holds(state)) { violation = { invariant: invariant.name, at: current }; break }
    }
    if (violation) break
    for (const witness of model.witnesses ?? []) if (witness.holds(state)) witnesses[witness.name]++
    for (const action of model.actions) {
      for (const { label, next } of action.apply(state)) {
        const target = key(next)
        const via = intern(label ?? action.name)
        admit(target, current, via)
        node.edges.push({ action: action.name, label: via, to: target })
      }
    }
  }
  return { nodes, order, root, violation, witnesses }
}

export function trace(graph, target) {
  const steps = []
  for (let cursor = target; cursor !== null; cursor = graph.nodes.get(cursor).parent) {
    const node = graph.nodes.get(cursor)
    steps.unshift({ via: node.via, state: JSON.parse(cursor) })
  }
  return steps
}

/** Tarjan's algorithm restricted to the candidate subgraph. */
function stronglyConnectedComponents(graph, candidates) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], components = []
  let counter = 0
  const visit = start => {
    const work = [{ node: start, edge: 0 }]
    index.set(start, counter); low.set(start, counter); counter++
    stack.push(start); onStack.add(start)
    while (work.length) {
      const frame = work[work.length - 1]
      const edges = graph.nodes.get(frame.node).edges
      if (frame.edge < edges.length) {
        const next = edges[frame.edge++].to
        if (!candidates.has(next)) continue
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter); counter++
          stack.push(next); onStack.add(next)
          work.push({ node: next, edge: 0 })
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node), index.get(next)))
        }
      } else {
        work.pop()
        if (work.length) {
          const parent = work[work.length - 1].node
          low.set(parent, Math.min(low.get(parent), low.get(frame.node)))
        }
        if (low.get(frame.node) === index.get(frame.node)) {
          const component = new Set()
          let member
          do { member = stack.pop(); onStack.delete(member); component.add(member) } while (member !== frame.node)
          components.push(component)
        }
      }
    }
  }
  for (const candidate of candidates) if (!index.has(candidate)) visit(candidate)
  return components
}

function cycleWithin(graph, component, start) {
  const previous = new Map([[start, null]])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()
    for (const edge of graph.nodes.get(current).edges) {
      if (!component.has(edge.to)) continue
      if (edge.to === start) {
        const steps = [{ via: edge.label, state: JSON.parse(start) }]
        for (let cursor = current; cursor !== start; cursor = previous.get(cursor).from) {
          steps.unshift({ via: previous.get(cursor).label, state: JSON.parse(cursor) })
        }
        return steps
      }
      if (!previous.has(edge.to)) { previous.set(edge.to, { from: current, label: edge.label }); queue.push(edge.to) }
    }
  }
  return []
}

export function checkProgress(model, graph) {
  const { trigger, goal, name } = model.progress
  const fairActions = model.actions.filter(action => action.fair).map(action => action.name)
  const candidates = new Set()
  for (const current of graph.order) {
    const state = JSON.parse(current)
    if (trigger(state) && !goal(state)) candidates.add(current)
  }
  for (const current of candidates) {
    const node = graph.nodes.get(current)
    const enabled = new Set(node.edges.map(edge => edge.action))
    if (!fairActions.some(action => enabled.has(action))) {
      const unfair = [...enabled]
      return { property: name, kind: 'stutter', trace: trace(graph, current), enabledUnfairActions: unfair }
    }
  }
  for (const component of stronglyConnectedComponents(graph, candidates)) {
    const nontrivial = component.size > 1
      || [...component].some(member => graph.nodes.get(member).edges.some(edge => edge.to === member))
    if (!nontrivial) continue
    const takenInside = new Set()
    const disabledSomewhere = new Set()
    for (const member of component) {
      const enabled = new Set()
      for (const edge of graph.nodes.get(member).edges) {
        enabled.add(edge.action)
        if (component.has(edge.to)) takenInside.add(edge.action)
      }
      for (const action of fairActions) if (!enabled.has(action)) disabledSomewhere.add(action)
    }
    const fair = fairActions.every(action => takenInside.has(action) || disabledSomewhere.has(action))
    if (!fair) continue
    const entry = graph.order.find(current => component.has(current))
    return {
      property: name, kind: 'cycle', trace: trace(graph, entry), cycle: cycleWithin(graph, component, entry),
      componentSize: component.size, fairActionsTaken: [...takenInside].filter(action => fairActions.includes(action)),
    }
  }
  return null
}

export function check(model, options = {}) {
  const started = performance.now()
  const graph = explore(model, options)
  const invariant = graph.violation ? { invariant: graph.violation.invariant, trace: trace(graph, graph.violation.at) } : null
  const progress = invariant ? null : checkProgress(model, graph)
  const edges = [...graph.nodes.values()].reduce((count, node) => count + node.edges.length, 0)
  return { states: graph.nodes.size, edges, durationMs: Math.round(performance.now() - started), invariant, progress, witnesses: graph.witnesses }
}
