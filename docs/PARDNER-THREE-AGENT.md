# Three dedicated Codex agents

Issue [#66](https://github.com/depatchedmode/pardner/issues/66) qualifies a bounded
coding fixture using the existing bridge. This topology has one isolated Pardner
replica, one dedicated Codex App Server, three persisted sessions, three distinct
agent Actors, and three independent Git worktrees on one host. It does not wake
existing Desktop tasks or hosted chats.

## Prerequisites and readiness

Use Node **24.11.1**, Git, locked dependencies (`npm ci` and `npm ci --prefix
ui-prototype`), and a production UI build (`npm run ui:build`). Run in a dedicated
checkout; its dependencies must remain unchanged during a frozen qualification.
The rehearsal uses existing Codex authentication and the user's configured model
and effort. It never logs account details, creates credentials, copies auth, or
changes global model configuration. Install/sign in separately if readiness fails.

Select an installed binary with App Server WebSocket and thread injection support:

```sh
node scripts/bridge-three-agent-rehearsal.js --check \
  --codex /absolute/path/to/codex
```

`--check` starts a dedicated loopback App Server, reads authentication readiness
without exposing the account, checks the configured model against its catalog,
creates/resumes/archives a read-only fixture session, and stops the server. It
makes zero model requests. A listed model and existing sign-in do not prove that
inference is available; the real run establishes that separately. With neither
`--check` nor `--run`, the script prints usage and starts nothing.

## Launch, inspect, stop, and restart

```sh
node scripts/bridge-three-agent-rehearsal.js --run \
  --codex /absolute/path/to/codex --drop-dispatch-reply
```

The command stays in the foreground and owns only its new replica, App Server,
sessions, bridge, and fixture worktrees. Use an existing terminal/supervisor to
keep it alive. Normal completion or failure stops its own process groups; private
evidence is retained under `.pardner/three-agent-rehearsals/RUN_ID/`. Inspect
`report.json` for the outcome and cleanup errors. Never upload this directory:
it includes service credentials, inbox data, thread history, and local paths.
Only a curated report belongs in public documentation.
SIGINT/SIGTERM requests a bounded cancellation and cleanup of these owned
processes; it does not approve requests or start another turn. A new `--run`
creates a fresh rehearsal rather than reusing old votes.
`progress.json`, `processes.json`, and the appended `protocol-events.jsonl`
retain observations before final teardown. Closed stdout/stderr pipes are
recorded rather than terminating the driver. After an abrupt executor loss,
verify recorded process identity and liveness before stopping any owned group;
an absent driver without a final report is an interrupted qualification.

For operator-managed bridge sessions, the [bridge setup](PARDNER-BRIDGE.md#setup)
provides the explicit Actor registration, inspected policy, and private mapping
format. Create three dedicated sessions in separate worktrees. Each reviewer
mapping allows only its distinct reviewer task and the coordinator sender. The
builder mapping allows the parent and both reviewer tasks, with the coordinator
and the two named reviewers as senders. Register handles before using `@recipient`.
Copy the **complete inspected policy**, not a template's illustrative permissions.

Launch the replica with `pardner serve --data /absolute/private/replica`, the
dedicated App Server with `codex app-server --listen ws://127.0.0.1:PORT`, and
the sole dispatcher with `pardner bridge run --config /absolute/private/bridge.json`.
Keep all endpoints on loopback. `pardner status --data ...` checks the replica;
`pardner bridge status --config ...` reads persisted inbox observations. Neither
proves process liveness: inspect the terminal or supervisor and its exit status.

Stop the bridge with SIGINT/SIGTERM before changing mappings or inspecting it for
reconciliation. Stop only the dedicated App Server and replica after the bridge.
To restart, start that replica with the **same data directory**, start its dedicated
App Server, then start the bridge with the **same inbox/configuration**. Inspect or
resume the same persisted sessions without policy/model overrides. Never drive a
mapped session from a second client. Do not resume new turns from the inspection
client. Busy deliveries wait for ordinary processing; uncertain ones require
supported exact-history reconciliation or explicit human inspection.

The rehearsal additionally SIGKILLs and restarts its own bridge while a reviewer
has durably queued work. `--drop-dispatch-reply` withholds a real accepted reply,
observes the uncertain state, and restarts for exact-history reconciliation.
No model response or acceptance receipt is fabricated. Missing/ambiguous history
blocks dispatch rather than proving nonacceptance. The workflow coordinator's
small private outbox preserves exact CLI arguments and revisions before submission
so response loss can replay the same operation payload.

## Bounded workflow and evidence

After one Pardner kickoff, the real builder implements the queue fixture and
publishes attributed source/test evidence. The coordinator freezes those exact
bytes into an immutable local Git commit and requests both distinct review tasks.
Each real reviewer reads that commit, writes its own tests in its own worktree,
and addresses its result to `@builder`. Both initial assessments must arrive
before correction. The result binds run ID, round, commit SHA, source SHA256,
reviewer Actor, worktree, verdict, findings, and independent test evidence.
Builder writes are bounded to `queue.mjs`, `queue.test.mjs`, and ignored logs.
Reviewers may write `queue.mjs`, `reviewer.test.mjs`, ignored logs, and optional
`review-result-round-1.json` / `review-result-round-2.json` evidence files. The
task instructions and Git file audit use the same explicit filenames.

The declared second phase adds `blocked === true` exclusion after the two initial
assessments. This exercises correction when the initial implementation is clean;
it does not manufacture a bug. The coordinator addresses that request to
`@builder`, freezes the new submitted artifact, and requests both reviewers again.
Earlier approvals are invalidated. Duplicate assessments count once; mismatched
rounds/SHAs, unrelated runs, wrong attribution, and conflicted comments cannot pass
the barrier. Contradictory results from one reviewer block the bounded run.
Both final-SHA approvals put the parent in `review`, assigned to `human`.
An actual human accept/reject verdict remains a separate checkpoint.

The coordinator is fixture support, not a generic workflow engine. It creates
only two rounds and stops visibly if the final round requests changes. Git carries
the code; Pardner carries requests, results, and the review barrier. The live hub
and its data are never used. Declared scripted fault probes include a duplicate
result, an old-SHA result, mismatched permissions, and unauthorized work; those
operations alone are not evidence of agent participation.

Bounds are fixed before execution: 2 seconds for healthy initial dispatch,
45 seconds for process readiness, 30 seconds for context/queue convergence, and
20 minutes for the complete model workflow. Model latency is measured separately.
Final model acknowledgments use the remaining overall model budget, rather than
the shorter queue/context convergence timeout.
The inbox records context persistence after the durable prompt commit and before
submission, separately from the later acceptance/reconciliation receipt. Legacy
inboxes retain an unknown context timestamp. Requests and accepted replies are
correlated by exact submission, delivery, and thread identity; the timing audit
requires receipt, context, submission, acceptance, and inbox receipt recording in
that order. Completion times come from the live protocol journal and remain
unknown when a restart loses an event; retained native history verifies completed
turns separately. A five-second idle check
makes zero model requests; it does not qualify the hour-long idle gate.
Coordinator reads may retry within the declared convergence interval; each attempt
receives the remaining budget and cancellation, late success is rejected, and
no attempt starts after expiry. Failed read observations and the latest structured
CLI error are retained. Writes are not retried
by this read helper, and absent context never satisfies a review barrier.

Evidence includes `round-1.json`, `round-2.json`, `task-context.json`, real protocol
events and command execution, private session histories, bridge inbox snapshots,
and independently rerun builder/reviewer tests plus external assertions. The
application fingerprint must remain unchanged. Repeated protocol notifications
and logical result replays must not create duplicate accepted turns. Workspace
Actor IDs provide attribution, not cryptographic identity or exactly-once effects.

Run `node --test test/three-agent-review.test.js test/bridge-rehearsal-support.test.js`
and `npm run verify` for regressions. Observe pending approval/input blocking in
the separate `bridge-approval-rehearsal.js` probe; it never answers a request and
does not qualify a human approval UI. Record failures, manual interventions, and
unrun probes explicitly. Neither protocol mocks nor these regression tests count
as three real agents participating.
