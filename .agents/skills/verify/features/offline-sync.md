# Offline replicas and conflicts

## Sub-features

Save locally during hub outages, reopen an enrolled replica offline, merge
different fields, expose authored same-field alternatives, resolve them, and
distinguish locally saved heads from explicit hub persistence acknowledgement.

## How to get to it (user POV)

Enroll a local service against a hub, then use its CLI or `/pardner/` browser.
Keep that local service reachable while disconnecting its hub path. Select the
editing Actor. After reconnect, inspect alternatives and use **Resolve status**
and **Keep this status** for a task status conflict.

## Driving it with service fixtures and public clients

Run `npm run test:qualification` and `npm run test:runtime`. In
`test/workspace-runtime.test.js`, the public-operation scenario enrolls a replica,
stops its hub, reopens the replica, saves an offline task, then restores the hub.
Expected: unchanged workspace identity, startup under five seconds, locally
saved offline work with sync pending, and convergence after reconnect. Other
cases inspect stale acknowledgements, authored conflicts, and SIGKILL recovery.

`npm run verify` also runs one complete acceptance scenario with public CLI and
browser mutations. Inspect `output/acceptance/<run>/seed-1/report.json`, the intent
manifest, per-replica readback, and browser traces. Required qualification adds
the deliberate 20-seed gate only when requested. A new conflict/recovery behavior
needs direct coverage even if the existing gate passes.

## Gotchas

Companion browsers own no offline Automerge replica. Cutting the hub path must
leave the local service available; the acceptance network gate cuts both HTTP
and native WebSocket paths. Equal snapshots alone cannot detect shared data
loss—check expected operation intents and receipts. Process kills do not prove
power-loss durability. Follow the local-first design skill for transport changes.
