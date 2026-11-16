import { canonical, fieldKey, supersededRevisionKey } from './workspace-schema.js'

// The board as one change's write path read it: its state as of that change's dependencies (docs/PARDNER-TRUST-DESIGN.md,
// section 3). Read only through Automerge's faithful history reads at those heads (getAll, keys and length; pinned in
// test/automerge-history-reads.test.js), never by materialising a view. Every concurrent value at a key is examined:
// a check accepts values that agree on what it needs, and only a real disagreement is reported.
//
// Values are read as plain JSON, as lib/change-log.js reads content; one that is not (text, a counter, several values
// at one key inside it, nesting too deep) is a candidate that can be read only as `{ unreadable: reason }`, and no
// check accepts it as any value.

const MAX_DEPTH = 32
/** At most this many sets of carried-over branch base IDs are considered for one register (originChoices). */
const MAX_ORIGINS = 64
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function define(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  return target
}

class Unreadable extends Error {}

/** A board as of `heads`, read through `backend`; reads are kept for the life of the object (one change's check). */
export class BoardAt {
  constructor(backend, heads) {
    this.backend = backend
    this.heads = heads
    this.memo = new Map()
    this.reads = 0
  }

  getAll(obj, prop) {
    this.reads++
    try { return this.backend.getAll(obj, prop, this.heads) } catch { return [] }
  }

  /** The object IDs of the board's top-level maps named `name` there (each concurrent one). */
  maps(name) {
    const key = `maps\u0000${name}`
    if (!this.memo.has(key)) this.memo.set(key, this.getAll('_root', name).filter(([type]) => type === 'map').map(([, id]) => id))
    return this.memo.get(key)
  }

  /** `full` (as getAll returns it) as plain JSON, or Unreadable. */
  value(full, depth = 1) {
    if (depth > MAX_DEPTH) throw new Unreadable('nested too deeply')
    const [type, value] = full
    switch (type) {
      case 'str': case 'boolean': return value
      case 'null': return null
      case 'int': case 'uint': case 'f64':
        if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0) && (type === 'f64' || Number.isSafeInteger(value))) return value
        throw new Unreadable('a number JSON cannot hold exactly')
      case 'map': {
        const out = {}
        this.reads++
        let keys = []
        try { keys = this.backend.keys(value, this.heads) } catch { keys = [] }
        for (const key of keys) define(out, key, this.one(value, key, depth + 1))
        return out
      }
      case 'list': {
        const out = []
        this.reads++
        let length = 0
        try { length = this.backend.length(value, this.heads) } catch { length = 0 }
        for (let index = 0; index < length; index++) out.push(this.one(value, index, depth + 1))
        return out
      }
      default: throw new Unreadable(`a ${type} value, which is not plain data`)
    }
  }

  one(obj, prop, depth) {
    const values = this.getAll(obj, prop)
    if (values.length !== 1) throw new Unreadable(values.length ? 'several values at one key' : 'a key with no value')
    return this.value(values[0], depth)
  }

  /**
   * Every value at `key` of the board's top-level map `map` there, each `{ value }` or `{ unreadable }`, with the ID
   * of the operation that wrote it; Automerge's winner is last.
   */
  candidates(map, key) {
    const memo = `values\u0000${map}\u0000${key}`
    if (this.memo.has(memo)) return this.memo.get(memo)
    const out = []
    for (const obj of this.maps(map)) {
      for (const full of this.getAll(obj, key)) {
        const writer = full.length === 2 ? full[1] : full[2]
        try { out.push({ value: this.value(full), writer }) } catch (error) {
          if (!(error instanceof Unreadable)) throw error
          out.push({ unreadable: error.message, writer })
        }
      }
    }
    this.memo.set(memo, out)
    return out
  }

  /** The readable values at `key` of `map`. */
  values(map, key) { return this.candidates(map, key).filter(candidate => !Object.hasOwn(candidate, 'unreadable')).map(candidate => candidate.value) }

  /** Whether the board held anything at `key` of `map`. */
  holds(map, key) { return this.candidates(map, key).length > 0 }

  /** The keys of the board's top-level map `map` there. */
  keys(map) {
    const memo = `keys\u0000${map}`
    if (!this.memo.has(memo)) {
      const keys = new Set()
      for (const obj of this.maps(map)) {
        this.reads++
        try { for (const key of this.backend.keys(obj, this.heads)) keys.add(key) } catch { /* None there. */ }
      }
      this.memo.set(memo, [...keys])
    }
    return this.memo.get(memo)
  }

  /** Whether a revision of `field` is retired there (lib/workspace-schema.js alternatives). */
  retired(field, operationId) { return this.values('supersededRevisions', supersededRevisionKey(field, operationId)).some(Boolean) }

  /**
   * The current alternatives of a field or comment register there, as lib/workspace-schema.js alternatives() reads
   * them: the readable registers not retired, one per operation, by operation ID; `winner` is the operation Automerge
   * picks, which recordState prefers. One operation can hold several registers at one key (a request retried on two
   * replicas writes it twice, with each replica's own time), and which of them the write path read is not recorded:
   * each alternative's `registers` lists every one, and a check accepts a value one of them gives. `choices` keeps one
   * register per operation for what they all share (the operation and the bookkeeping a check does not compare).
   * Unreadable values are counted in `unreadable`.
   */
  alternatives(container, key) {
    const memo = `alternatives\u0000${container}\u0000${key}`
    if (this.memo.has(memo)) return this.memo.get(memo)
    const candidates = this.candidates(container, key)
    const byId = new Map()
    for (const { value } of candidates) {
      if (!isPlainObject(value) || typeof value.operationId !== 'string' || this.retired(key, value.operationId)) continue
      if (!byId.has(value.operationId)) byId.set(value.operationId, [])
      byId.get(value.operationId).push(value)
    }
    const winner = candidates.at(-1)?.value
    const ids = [...byId.keys()].sort()
    const result = { choices: ids.map(id => byId.get(id)[0]), groups: ids.map(id => ({ operationId: id, registers: byId.get(id) })),
      winner: isPlainObject(winner) ? winner.operationId : null, unreadable: candidates.filter(candidate => Object.hasOwn(candidate, 'unreadable')).length }
    this.memo.set(memo, result)
    return result
  }

  /**
   * Every value the write path may have read for a field with exactly one alternative there (lib/workspace-schema.js
   * recordState): one per register of that alternative, each `null` where the register holds none. Empty when the
   * field had no alternative, or more than one.
   */
  soleValues(container, key) {
    const { groups } = this.alternatives(container, key)
    return groups.length === 1 ? groups[0].registers.map(register => (Object.hasOwn(register, 'value') ? register.value : null)) : []
  }

  /** Every value a field held there (each register of each alternative), as canonical text: what an `old` value may be. */
  heldValues(container, id, field) {
    const { groups } = this.alternatives(container, fieldKey(id, field))
    return [...new Set(groups.flatMap(({ registers }) => registers.map(register => canonical(Object.hasOwn(register, 'value') ? register.value : null))))]
  }

  /**
   * Each set of branch base IDs the write path may have carried over from a register's alternatives there
   * (lib/workspace-commands.js branchOrigins over one register per alternative), as sorted lists of distinct IDs, the
   * first from each alternative's first register. At most MAX_ORIGINS sets are listed.
   */
  originChoices(container, key) {
    const memo = `origins\u0000${container}\u0000${key}`
    if (this.memo.has(memo)) return this.memo.get(memo)
    let sets = [[]]
    for (const { registers } of this.alternatives(container, key).groups) {
      const next = []
      for (const set of sets) {
        for (const register of registers) {
          if (next.length >= MAX_ORIGINS) break
          next.push([...set, ...(Array.isArray(register.branchBaseIds) ? register.branchBaseIds.filter(id => typeof id === 'string') : [])])
        }
      }
      sets = next
    }
    const distinct = new Map(sets.map(set => [...new Set(set)].sort()).map(set => [canonical(set), set]))
    const result = [...distinct.values()]
    this.memo.set(memo, result)
    return result
  }

  /**
   * The Actors there: for each key of the board's Actors, its readable records (every concurrent value; the write path
   * reads the one Automerge picks, so a check accepts what any one of them gives).
   */
  actorsByKey() {
    if (!this.memo.has('actors')) {
      const actors = new Map()
      for (const key of this.keys('actors')) {
        const records = this.values('actors', key).filter(isPlainObject)
        if (records.length) actors.set(key, records)
      }
      this.memo.set('actors', actors)
    }
    return this.memo.get('actors')
  }

  /** Every readable Actor record there. */
  actors() { return [...this.actorsByKey().values()].flat() }
}
