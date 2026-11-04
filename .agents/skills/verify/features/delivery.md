# Handoffs and agent delivery

## Sub-features

Atomic assignment/status/message handoffs, lease claims, durable inbox receipt
before acknowledgement, acknowledgement replay, worker restart, and idempotent
effects. Accepted work may continue locally when new hub leases are unavailable.

## How to get to it (user POV)

From a task choose a **Recipient**, enter a **Handoff message**, then **Hand off**.
The CLI offers `handoff`, `mentions pending`, `mentions claim-next --request-id`
(optional `--ttl-ms`), `mentions ack`, and `mentions release`, backed by the
`/automerge/deliveries` routes. Register the human, builder, and reviewer Actors;
supply current assignment/status revisions and the returned claim token.
Repeating `claim-next` with the same request ID replays the same claim, and
repeating `ack` with the same token returns `acknowledged: true, replayed: true`;
a wrong or expired token returns `STALE_CLAIM`. A real harness must persist receipt
before acknowledging a delivery.

## Driving it with CLI and worker subprocesses

Run `node --test test/pardner-cli-workflow.test.js test/acceptance-components.test.js`
and `npm run test:runtime`. The CLI test completes human → builder → reviewer →
human handoffs, checks assignment and mention counts, and rejects stale changes.
The component worker test kills deterministic workers before acknowledgement and
after a saved effect, then inspects their durable SQLite inbox/effect counts and
the public task context. Expected: one completed delivery/effect and no duplicate
authored comment after replay. Idempotent effects come from the worker's
deterministic `--operation-id`, not from the ledger. The full acceptance scenario
adds browser handoff, lost sync-ack responses (not lost delivery acks), and
complete context/evidence checks. `test/mention-lifecycle.test.js` (full
`node --test` only) covers release, lease expiry, simultaneous claims, restart,
and comment-delete cancellation; `test/pardner-cli-mentions.test.js` (in
`npm run test:cli`) covers replica forwarding and `HUB_UNAVAILABLE` while
accepted work still saves locally.

For provider-bridge changes, inspect the relevant `test/bridge-*.test.js` and
`test/codex-bridge-adapter.test.js` assertions; use synthetic fixtures first.
Queued agent mentions are bound to the authorizing comment's content digest,
revision, and editor; a changed or deleted originating comment keeps the delivery
blocked with a reason (`test/bridge-review-regressions.test.js`,
`test/agent-bridge.test.js`, [bridge guide](../../../../docs/PARDNER-BRIDGE.md)).
Do not invoke real provider/remote rehearsal scripts merely because their paths
appear in a diff plan. A real-agent rehearsal is a separate requested exercise.

## Gotchas

Delivery leases are not execution locks. The CLI workflow's direct acknowledgements
exercise the protocol, not a durable production inbox. Use the worker/inbox checks
for receipt guarantees. Exactly-once fake effects do not establish arbitrary
external-side-effect idempotency. Preserve the boundary between automated worker
evidence and the two-machine real-agent rehearsal.

## Bounded three-agent review

[Three-agent runbook](../../../../docs/PARDNER-THREE-AGENT.md) and
[current readiness](../../../../docs/PARDNER-66-READINESS.md) distinguish the
PR70 historical native run from current-candidate evidence. Run
`node --test test/agent-bridge.test.js test/bridge-rehearsal-support.test.js test/three-agent-review.test.js test/three-agent-coordinator.test.js`
for durable context timing, retry after SQLite capacity failures, separate
worktrees, exact submission correlation, two-review same-SHA barriers, rejected
stale/edited/conflicted artifacts, and cancellation/drain containment. These
fixtures make no model requests. The rehearsal script's `--check` creates and
archives a disposable native session; do not run it under a no-archival boundary.
Native `--run` and the separate approval probe require explicit authorization.

Completion cleanup additionally requires local `bridge approve-cleanup` approval
with the bridge stopped. Shared task closure supplies eligibility, not authority.
`bridge-retirement`, `bridge-config-retirement`, and `bridge-review-regressions`
check scope/revision invalidation, revocation between effects, CLI approval and
interrupted retirement. These use disposable worktrees and fake archival adapters;
they do not authorize or establish real-thread cleanup.
