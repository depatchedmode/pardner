# Handoffs and agent delivery

## Sub-features

Atomic assignment/status/message handoffs, lease claims, durable inbox receipt
before acknowledgement, acknowledgement replay, worker restart, and idempotent
effects. Accepted work may continue locally when new hub leases are unavailable.

## How to get to it (user POV)

From a task choose a **Recipient**, enter a **Handoff message**, then **Hand off**.
The CLI offers `handoff`, `mentions claim-next`, and `mentions ack`. Register
the human, builder, and reviewer Actors; supply current assignment/status
revisions and the returned claim token. A real harness must persist receipt
before acknowledging a delivery.

## Driving it with CLI and worker subprocesses

Run `node --test test/pardner-cli-workflow.test.js test/acceptance-components.test.js`
and `npm run test:runtime`. The CLI test completes human → builder → reviewer →
human handoffs, checks assignment and mention counts, and rejects stale changes.
The component worker test kills deterministic workers before acknowledgement and
after a saved effect, then inspects their durable SQLite inbox/effect counts and
the public task context. Expected: one completed delivery/effect and no duplicate
authored comment after replay. The full acceptance scenario adds browser handoff,
hub response loss, and complete context/evidence checks.

For provider-bridge changes, inspect the relevant `test/bridge-*.test.js` and
`test/codex-bridge-adapter.test.js` assertions; use synthetic fixtures first.
Do not invoke real provider/remote rehearsal scripts merely because their paths
appear in a diff plan. A real-agent rehearsal is a separate requested exercise.

## Gotchas

Delivery leases are not execution locks. The CLI workflow's direct acknowledgements
exercise the protocol, not a durable production inbox. Use the worker/inbox checks
for receipt guarantees. Exactly-once fake effects do not establish arbitrary
external-side-effect idempotency. Preserve the boundary between automated worker
evidence and the two-machine real-agent rehearsal.
