// The inline Status select is offered only when nothing else owns status:
// an Actor to write as, no open editor or handoff, and no unresolved status conflict.
export const quickStatusEditable = ({ actor, editing, handingOff, conflicts }) =>
  Boolean(actor) && !editing && !handingOff && !conflicts?.status
