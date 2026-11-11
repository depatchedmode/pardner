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
- [Control pane and issue links](control.md): T3 credential, registry, routes,
  queued intent, stale reads, approvals, cancellation, verdicts, and GitHub links.
- [Machine keys and membership library](trust-library.md): signing,
  fixed-point authority, removals and deterministic conflict choices.
- [Signed genesis and record store](trust-records.md): per-directory machine key,
  derived project ID, grow-only record store, write-back and prior-install refusal.
- [Invitations, pairing and removal](trust-enrollment.md): signed offers, join
  requests and codes, approval, bounds, pairing, roles, removal and re-admission.
- [Client onboarding and presence](client-onboarding.md): authenticated Actor
  sessions, device aggregation, expiry and integration evidence boundaries.

Entries describe the checks that exist in this checkout. When a coverage
overlay under trial adds assertions (for example tracker receipts), report them as overlay coverage; update the map in the
change that lands the assertions, not in the candidate under trial.

Shared launch/doctor/cleanup and reporting instructions are in
[SKILL.md](../SKILL.md). Exercise each affected entry point: a CLI check cannot
establish a changed browser control's behavior. Use existing tests where their
observations suffice; add focused coverage where they do not.
