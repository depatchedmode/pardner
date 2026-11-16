# Offline replicas and conflicts

## Sub-features

Save locally during hub outages, reopen an enrolled replica offline, merge
different fields, expose authored same-field alternatives, resolve them, and
distinguish locally saved heads from explicit hub persistence acknowledgement.

## How to get to it (user POV)

Join a hub with `pardner serve --role replica --hub URL --hub-ws ws://host:port/automerge --hub-token TOKEN`
after provisioning a separate replica ID/secret and the hub registry as described
in [the CLI guide](../../../../docs/PARDNER-CLI.md#enroll-another-machine)
(there is no `enroll` command; without the hub's token the replica fails with
`AUTH_REQUIRED`), then use its CLI. Later restarts reuse the saved role, hub
settings, and ports. Keep that local service reachable while disconnecting its hub
path. The standalone service serves no board; for the browser, each person's local
client joins the project (`withClientReplicas` in `support/client-workspace.js`
does this with a hub client and a human invite) and opens through `pardner client
open`, authoring as its signed-in Actor. After reconnect, inspect alternatives and
use **Resolve status** and **Keep this status** for a task status conflict.

## Driving it with service fixtures and public clients

Run `npm run test:qualification` and `npm run test:runtime`. In
`test/workspace-runtime.test.js`, the public-operation scenario joins a replica,
stops the replica and then the hub, reopens the replica offline, saves an
offline task, then restores the hub.
Expected: unchanged workspace identity, startup under six seconds, locally
saved offline work with sync pending, and convergence after reconnect. Other
cases inspect stale acknowledgements, authored conflicts, and SIGKILL recovery.

`npm run verify` also runs one complete acceptance scenario on client mode: a hub
client, Alice's laptop (device invitation) and Bob's laptop (human invitation)
behind per-laptop network gates, with every mutation through a client project
API proxy (operator, agent `--token-file` CLI, or browser session). Inspect `output/acceptance/<run>/seed-1/report.json`, the intent
manifest, per-replica readback, and browser traces. Those traces and the seed
report contain disposable credentials; retain them only through
`verify:sanitize` (SKILL.md, Artifact privacy). Required qualification adds
the deliberate 20-seed gate only when requested. The current acceptance contract
sets local operation acknowledgement to 2,500 ms and local UI visibility to
2,000 ms; the November 5, 2026 owner policy sets offline startup/restart to
6,000 ms. Inspect enforcement and report metadata when these policies change;
prior 5,000 ms failures stay historical failures. The helper startup timeout
remains 15,000 ms, and independent benchmark targets are separate. A new conflict/recovery behavior
needs direct coverage even if the existing gate passes. The browser's
**Resolve status** / **Keep this status** controls are exercised only by
`scripts/acceptance.js`, not by `test/pardner-ui.test.js`.

## Lifecycle ordering model

`npm run verify:model` checks a bounded, code-mapped model of request admission,
persistence acknowledgement and shutdown ordering, with implementation checks in
`test/lifecycle-conformance.test.js`. Use the
[verify-lifecycle-model skill](../../verify-lifecycle-model/SKILL.md) when the
mapped runtime files change or the check reports drift; see
[PARDNER-LIFECYCLE-MODEL.md](../../../../docs/PARDNER-LIFECYCLE-MODEL.md).

## Gotchas

Browsers own no offline Automerge replica. Cutting the hub path must
leave the local service available; the acceptance network gate cuts both HTTP
and native WebSocket paths. Equal snapshots alone cannot detect shared data
loss—check expected operation intents and receipts. Process kills do not prove
power-loss durability. Acknowledged heads live in memory only, so a reopened
replica reports `syncPending: true` until the hub acknowledges again. Follow the
local-first design skill for transport changes.

`test/native-replica-auth.test.js` checks that ordinary API tokens and UI tickets
cannot open the raw native writer, even in insecure-local mode, and that enrolled
tickets are scoped, single-use and expiring. Enrolled replicas remain trusted full
writers. `test/private-state.test.js` checks private workspace/database/trace modes,
existing sidecar repair and unsafe final-link rejection under permissive umasks.
