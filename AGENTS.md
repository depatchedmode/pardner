## Learned User Preferences

- When clarifying product requirements or scenarios, ask one question at a time rather than batching many questions together.
- When implementing work from an attached plan, do not edit the plan file; use the existing todo list, mark items in progress, and avoid recreating todos.
- Prefer small commits that are atomic, logically scoped, and semantically grouped when the user asks for a commit pass.
- Breaking migrations and intentional backwards-incompatible changes are acceptable when nothing external depends on the repo and prior installs are considered stale.

## Learned Workspace Facts

- Hook runtime state under `.cursor/hooks/state/` is gitignored so Cursor metadata stays out of git while hook scripts under `.cursor/hooks/` can still be shared if desired.
- Continual-learning incremental transcript indexing for this repo uses `.cursor/hooks/state/continual-learning-index.json`.
- Multi-replica Automerge/sync planning and validation should be reconciled against branch `cursor/native-automerge-ws-sync-cda6`, not only `main`, to avoid plan drift.
- Product vocabulary uses "Actor" as the umbrella term for human users and agents in the UI and related APIs.

<!-- Adapted from depatchedmode/oughta at 4701bcffc43b779a41b239c61353191f96157c20. -->

## Local-first

Use the [local-first design skill](.agents/skills/local-first-design/SKILL.md) and [references](.agents/references/local-first.md) for storage, sync, recovery and service-dependency work. [README.md](README.md#current-implementation) describes current behavior; preserve the [acceptance contract](docs/PARDNER-ACCEPTANCE.md) and distinguish product direction from implemented guarantees. Pardner currently uses Node/Automerge; Rust conventions do not apply unless Rust implementation is separately introduced.

- The local service owns the persisted replica; the browser owns no separate Automerge database. [Companion LAN browsers](docs/PARDNER-LAN.md) depend on the host service and are not offline replicas. Acknowledge local operations only after the disk persistence barrier. Preserve offline reopen of enrolled replicas and distinguish locally saved heads from explicit hub persistence acknowledgement. Do not claim power-loss durability from process-crash tests.
- Preserve different-field merges and explicit resolution of authored same-field alternatives for tasks, veins and goals. Define edit/delete conflicts, interrupted sync and duplicate-operation retries before changing semantics; never silently discard competing edits.
- The hub is required for enrollment and new delivery leases; accepted work may continue and save locally during outages. Document outage and replacement behavior for each required service. Preserve durable receipt before delivery acknowledgement, and distinguish delivery leases from execution locks and external-side-effect idempotency.
- When changing transport, assess direct peer operation on the supported devices/networks alongside the current hub/WebSocket path, and offer it where feasible and practical. Record concrete discovery, reachability, platform and operational constraints if excluded. This does not authorize replacing the hub or relaxing shared-secret admission.
- Make export, backup and fresh-install recovery usable, including metadata, credentials and attachment requirements. Keep synchronization distinct from backup. Preserve incompatible prior installs; do not migrate or delete user data as part of guidance adoption.
- For implementation changes run the affected `test:runtime`, `test:qualification`, `test:cli` or `test:ui` scripts from [package.json](package.json), then `npm run verify`. Storage/sync/delivery milestone qualification also requires `npm run test:acceptance -- --repeat 20 --seed 1` under Node 24.11.1 with dependencies, Chromium and the UI build prepared as in the acceptance contract. UI/companion-device checks also require pinned Chromium and WebKit as documented in the LAN guide. Report actual results and gaps; do not claim the separate real-agent rehearsal ran from automated evidence. Guidance-only edits require path/link and diff checks.
