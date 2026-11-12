import * as A from '@automerge/automerge'

// Test-only: changes written by encoding Automerge operations directly, as a modified client can, rather than through
// Automerge's JavaScript API. Each operation's ID is (startOp + its index)@actor, so `op()` returns the ID later
// operations name it by. Values are written as Pardner writes them (strings as plain scalars, never text) unless an
// operation is given in full.

const isObject = value => value !== null && typeof value === 'object'

export class ChangeEncoder {
  /** A change by `actor` on top of `doc`'s current heads (or `deps`), with the next free operation counter. */
  constructor(doc, actor, { deps = A.getHeads(doc), time = 1794000000 } = {}) {
    const metas = A.getChangesMetaSince(doc, [])
    this.doc = doc
    this.actor = actor
    this.deps = deps
    this.time = time
    this.seq = metas.filter(meta => meta.actor === actor).reduce((max, meta) => Math.max(max, meta.seq), 0) + 1
    this.startOp = metas.reduce((max, meta) => Math.max(max, meta.maxOp), 0) + 1
    this.ops = []
  }

  /** The ID the next operation will have. */
  get nextId() { return `${this.startOp + this.ops.length}@${this.actor}` }

  /** Appends one operation as decodeChange describes it; returns its ID. */
  op(op) {
    const id = this.nextId
    this.ops.push({ pred: [], ...op })
    return id
  }

  /** The object ID of the top-level map `name` in the document. */
  root(name) { return A.getObjectId(this.doc[name]) }

  /**
   * Writes `value` at `where` (`{ obj, key }` for a map, `{ obj, elemId, insert }` for a list): maps and lists as
   * objects, strings as scalars, integers as `int`, other numbers as `float64`. Returns the ID of the operation that
   * wrote it (for an object, its object ID).
   */
  value(where, value, pred = []) {
    if (Array.isArray(value)) {
      const list = this.op({ action: 'makeList', ...where, pred })
      let after = '_head'
      for (const item of value) after = this.value({ obj: list, elemId: after, insert: true }, item)
      return list
    }
    if (isObject(value)) {
      const map = this.op({ action: 'makeMap', ...where, pred })
      for (const [key, item] of Object.entries(value)) this.value({ obj: map, key }, item)
      return map
    }
    if (typeof value === 'number') return this.op({ action: 'set', ...where, value, datatype: Number.isInteger(value) ? 'int' : 'float64', pred })
    return this.op({ action: 'set', ...where, value, pred })
  }

  /** The encoded change and its hash. */
  encode() {
    const bytes = A.encodeChange({ actor: this.actor, seq: this.seq, startOp: this.startOp, time: this.time, message: null, deps: this.deps, ops: this.ops })
    return { bytes, hash: A.decodeChange(bytes).hash }
  }

  /** Applies the change to a copy of the document: `{ doc, hash }`. */
  apply(doc = this.doc) {
    const { bytes, hash } = this.encode()
    const [next] = A.applyChanges(A.clone(doc), [bytes])
    return { doc: next, hash }
  }
}
