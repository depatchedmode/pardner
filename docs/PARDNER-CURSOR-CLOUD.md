# Cursor Cloud control adapter

This implements the fixture-qualified portion of [#78](https://github.com/depatchedmode/pardner/issues/78).
It is separate from T3 and Cursor ACP. **Live dispatch is disabled by default.**
No credential is read from the environment, no existing Cloud agent is adopted,
and no paid run is made by setup or tests. Live permissions, cancellation,
recovery and artifact acceptance remain unqualified under
[#79](https://github.com/depatchedmode/pardner/issues/79).

## Contract source

Reviewed 2026-11-04 against Cursor's official
[v1 endpoint documentation](https://cursor.com/docs/cloud-agent/api/endpoints) and
[OpenAPI specification](https://cursor.com/docs-static/cloud-agents-openapi.yaml).
The downloaded specification SHA-256 was
`dd3b836c4e95ad68892274280e53c348619cdd2051988793d2a85e8213d9a489`.
This public-beta document is a contract source, not evidence of account access.

| Operation | Documented contract used here |
| --- | --- |
| Authentication | User or service-account key, Bearer authentication. Account/repository permissions need live qualification. |
| Start | `POST /v1/agents` returns `agent` and initial `run`. Persist a randomly generated `bc-<uuid>` as `agentId` before sending. The documented client-supplied ID prevents duplicate agents via `409 agent_id_conflict`; it does not prove which prompt/run was accepted. |
| Follow-up | `POST /v1/agents/{id}/runs`, prompt only, returns a separate run. `409 agent_busy` leaves the intent queued locally. Steering is deliberately not used: it can lack a run receipt and is a different operation. |
| Read | Agent metadata and exact `GET /v1/agents/{id}/runs/{runId}`. Agent lifecycle and run execution status are separate. Run-list pagination is consumed for reconciliation evidence, never prompt matching. |
| Cancel | `POST /v1/agents/{id}/runs/{runId}/cancel`. A response is not terminal proof. `409 run_not_cancellable` also needs a fresh exact-run read. |
| Stream | Exact-run SSE. Opaque IDs, `Last-Event-ID`, repeated leading status without an ID. The result/done frames may share an ID. `410 stream_expired` falls back to exact run GET. |
| Artifacts | Agent-scoped list and signed download URL. List caps at 100; a full page is treated as potentially truncated. Signed URLs are never stored and never receive the API key. |
| Git | `Run.git` is agent-wide mutable branch/PR state, including when read on older runs. It is not a per-attempt commit/diff proof. |
| Retry/reconciliation | No documented follow-up idempotency key or lookup by client request. Ambiguous POSTs are never retried. Run list, latest run, a singleton run, prompt text and timestamps are insufficient acceptance proof. |

The adapter supports only explicit new contexts and text prompts. It does not
invent approval APIs, local working directories, remote commit/diff endpoints,
request idempotency keys, steering receipts or automatic recovery of ambiguous
acceptance. `WAITING_FOR_BACKGROUND_WORK` is shown as blocked; it does **not**
mean a human approval request. Unknown statuses and regressing run timestamps
fail closed.

## Stored state and execution

`cursor-cloud.sqlite` is a host-local SQLite ledger (`WAL`, `synchronous=FULL`,
mode 0600). It uses the shared private-state helper to reject symlinked or linked files and repair existing sidecar modes. It stores contexts, explicit task/Actor/sender authorization, immutable
intent, acceptance receipt, exact agent/run identities, transitions, send counts,
fresh read timestamps, event cursor/deduplication records, output, owner
interventions, evidence and verdicts. It does not use workspace operation IDs or
assume an Automerge schema version. Browser companions own no separate ledger.

A separate SQLite file, `cursor-cloud.sqlite.controller`, holds an exclusive OS
SQLite lock for the controller lifetime. A second controller, even with the same
owner ID, cannot open it. Process death releases the lock. The ledger also rejects
a different workspace/replica owner. This fences processes using the same ledger;
it cannot fence an external tool or a copied ledger impersonating the same replica.
Only newly reserved random agent IDs are mapped, and unexpected latest runs
quarantine reuse. No provider-side distributed lease is claimed.

Per-context serialization prevents concurrent pump/read/cancel/capture operations
from applying out of order. Authorization is checked before enqueue and again
before send. Cancellation checks the exact execution's task, agent Actor and
sender before saving a queue hold and `cancel_requested`. Pending cancellation
is repeated on restart against that run ID only. A completion race preserves
`FINISHED`; no cancellation response can mark a different run cancelled.
Cancellation does not roll back changes. Queue release is an explicit reviewed
owner action, and does not bypass unresolved acceptance or the evidence gate.

Intent reaches disk before POST. Acceptance must reach disk before a run becomes
known. A crash during POST leaves `submitting`, recovered to `unknown`. Lost
acknowledgements, invalid receipts and ambiguous errors quarantine the context.
Known exact runs recover through fresh reads without another prompt. If an owner
supplies an original acceptance receipt through the local-admin acceptance route,
its identity is checked against a fresh run and the intervention is recorded.
This is manual recovery evidence, never inferred or automatic recovery. No
abandon/retry button can clear unresolved acceptance.

Polling starts/reconnects one SSE consumer per active attempt. Events persist
with their cursor atomically, duplicate ID/type frames are ignored, conflicting
replays fail closed, and incomplete/expired history stays labeled. SSE statuses
are hints: fresh GETs establish run state. A terminal exact read takes precedence
over partial deltas, and later sticky/status frames cannot reopen the attempt.
Reads and observations are local receipt timestamps, alongside provider timestamps;
they do not claim synchronized clocks or a complete transcript.

## Immutable evidence and the #79 seam

A later run cannot start until each earlier terminal attempt with a run ID has a
freeze receipt. `freeze` requires a full commit hash, diff bytes (empty is valid),
and nonempty test command/results supplied by an authorized Actor. It captures
fresh exact-terminal run output (including a late final reply), mutable Git metadata and downloaded artifact bytes with
SHA-256. The agent must still identify that exact run as latest before and after
capture. Failed reads, changed context, size mismatch or potentially truncated
listing leave no receipt and keep the queue held. Limits are 16 MiB per artifact
and 32 MiB total artifact bytes; larger evidence remains blocked, never silently
truncated.

The receipt is inserted once, with a hash of its canonical JSON. Later artifact
or branch changes cannot overwrite it. The receipt establishes which bytes were
captured, **not** the correctness of an Actor's supplied commit/diff/tests. An
independent checker must verify those assertions; human acceptance is separate.
Checker/human verdicts require the frozen attempt, and keep append-only history.
These Actor checks share the existing workspace-token trust model: they do not
authenticate a human person.

Adapter fixture command:

```sh
node --test test/cursor-cloud.test.js
```

The #79 normalizer can read `snapshot().cloud` from the control pane:

- `contexts[]`: `contextId`, `agentId`, `actorId`, repository/ref, last provider
  identity, `location.kind=cloud`, `observedAt`, `stale`, `hold`, `blocker`.
- `executions[]`: `executionId`, `contextId`, `agentId`, exact `runId` (null until
  established), `createdAt`, `sentAt`, `acceptedAt`, `observedAt`,
  `providerUpdatedAt`, `submissions`, `state`, `outcome`, `transitions`,
  `acceptance`, `reconciliation`, optional `intervention`, `eventsIncomplete`.
- `executions[].evidence`: immutable `sha256`, `capturedAt`, exact identities,
  commit/diff/test evidence and artifact bytes/hashes. This is the B-freeze
  prerequisite for C; a mutable branch/PR reference alone is not enough.
- `executions[].verdicts`: checker/human decisions, Actor, evidence and timestamp.

`submissions` counts persisted POST attempts, including definite rejections and
crash windows before the actual HTTP call. Fixture provider submission arrays
establish actual receives. Do not treat the durable count as exact network
receipt proof. A quarantine is **safety containment**, not successful recovery.

## Control pane and HTTP interface

Register a project in Control settings. Under Cursor Cloud, register a context
with that project, an agent Actor, repository URL, starting ref, explicit tasks
and senders. This saves only local configuration. Save a Cloud intent to queue
it; the default pane explicitly shows dispatch disabled and missing access.
There is no HTTP credential or enable-dispatch endpoint in this initial wave.
A future authorized host composition can supply `control.cloud.transport` using
`CursorCloudClient` and `dispatchEnabled: true`; fixtures inject their transport
at that same boundary. Do not enable this on the live controller before #79's
access/spending and candidate approvals.

All paths below start with `/pardner/control/cloud`, use the existing shared
workspace-token admission and return the pane's standard result envelope.

| POST path | Body | Authority |
| --- | --- | --- |
| `/contexts` | `contextId, projectId, actorId, repository, startingRef, allowedTaskIds, allowedFromActorIds` | Local admin; registered project/tasks/Actors |
| `/contexts/authorize` | `contextId, allowedTaskIds, allowedFromActorIds` | Local admin |
| `/contexts/release` | `contextId, evidence` | Local admin; fresh known idle context |
| `/executions` | `executionId, contextId, actorId, taskId, fromActorId, text` | Explicit route |
| `/executions/cancel` | `executionId, actorId, taskId, fromActorId` | Exact attempt's route |
| `/executions/reconcile` | `executionId` | Workspace token; no POST/retry to provider |
| `/executions/acceptance` | `executionId, actorId, taskId, fromActorId, acceptance, evidence` | Local admin and route; original provider receipt required |
| `/executions/freeze` | `executionId, actorId, taskId, fromActorId, commit, diff, tests` | Local admin and route |
| `/executions/verdicts` | `executionId, kind, verdict, actorId, evidence` | Separate checker or human Actor |

## Outages, backup and service boundaries

Local enqueue, inspection and prior evidence remain available when Cloud is
unreachable. New execution, observations, cancellation and artifact downloads
require Cursor. Stale reads and errors remain visible; queued work is not sent
on an unavailable/invalid observation. Known accepted remote work may continue
while Pardner is down. The Cloud provider is required for its agent runtime;
there is no documented direct-peer equivalent on supported browsers/hosts.
This adds no new workspace transport and changes no hub admission or delivery
lease semantics. Git source access and independent checker access remain separate
requirements; synchronization is not backup.

Back up the stopped service's whole directory, including the Cloud database/WAL,
control registry and workspace identity. Evidence blobs, prompts and output may
contain private repository data; keep backups private. No Cloud credential is
stored by this adapter. Preserve the separate credential source for an authorized
host composition. Restore to the same replica with the old controller stopped;
a new replica cannot automatically take ownership. Preserve incompatible stores
and inspect them separately. Agent deletion/expiry or artifact retention loss
can make further capture impossible; retain local frozen evidence. Process-restart
fixtures do not establish power-loss durability.

## Qualification and remaining decisions

Deterministic tests model the documented API, not a real Cursor account. Service
and Chromium/WebKit checks verify pane integration against disposable data, including simulated active cancellation, evidence capture and separate verdicts.
The initial integrated routine suite passed, but its 20-seed qualification failed
on seed 8: offline restart 5,380.912667 ms exceeded the then-current 5,000 ms limit.
The [historical verification report](PARDNER-CURSOR-CLOUD-VERIFICATION.md) preserves
that candidate, failure and diagnostic limits. The owner subsequently authorized
a six-second offline acceptance policy; see the [current contract](PARDNER-ACCEPTANCE.md#scenario-and-bounds).
The [revised-policy verification run](PARDNER-CURSOR-CLOUD-OFFLINE6000-QUALIFICATION.md)
stopped at a WebKit pairing-readiness failure in routine UI checks; full verify
and the fresh 20-seed gate did not run. The draft remains `needs-qualification`;
the original offline failure is not retroactively passed.
A [bounded WebKit pairing investigation](PARDNER-CURSOR-CLOUD-PAIRING-DIAGNOSTIC.md)
passed one isolated instrumented candidate/main comparison without localizing
the new UI failure. The original routine failure remains unresolved.

Before live qualification authorize a specific account/repository/key scope,
reviewed runtime/workspace, six-attempt plan and replacement/spending budget
through #79. Then establish actual permissions for create/follow-up/read/cancel,
client-agent-ID conflicts, SSE reconnect and retention behavior, repository
checkout/environment identity, artifact availability and commit/checker capture.
No API key, live agent, paid attempt, human approval or active runtime was used
for this implementation. #58 routing and #66 review remain broader open contracts.
