# Pardner behavior map

Start with the changed behavior and read the corresponding entry. These are
maintained routes to evidence, not a claim that every feature or edge case is
already covered. Match the exact assertions to the task's expected result.

- [Tasks, comments, and safe retry](tasks.md): browser/CLI authoring, attribution,
  stale drafts, operation replay, and restart. Includes the retained CLI smoke.
- [Goals and veins](goals-veins.md): membership, deliberate verdicts, concurrent
  moves, links, and explicit resolution.
- [Offline replicas and conflicts](offline-sync.md): local save, hub outage,
  restart, convergence, and competing authored edits.
- [Handoffs and agent delivery](delivery.md): human/agent handoffs, durable
  receipt, acknowledgement loss, and effect replay.
- [Companion browsers](companion.md): pairing, Actor/filter persistence,
  reconnect, response loss, and browser credential lifecycle.

Shared launch/doctor/cleanup and reporting instructions are in
[SKILL.md](../SKILL.md). Exercise each affected entry point: a CLI check cannot
establish a changed browser control's behavior. Use existing tests where their
observations suffice; add focused coverage where they do not.
