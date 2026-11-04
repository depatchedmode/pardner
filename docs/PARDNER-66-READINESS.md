# Issue 66 readiness on current main

This is the November 4, 2026 reconciliation of [PR70](https://github.com/depatchedmode/pardner/pull/70)
for [#66](https://github.com/depatchedmode/pardner/issues/66), under the
[#50](https://github.com/depatchedmode/pardner/issues/50) umbrella. It prepares a
reviewable baseline; it does not close either issue or authorize #67.

Base: `bd55f246bacae5068b761c999e7b849501e7a5e3` (current main when fetched).
Imported source: PR70 `17d65d1c1aa011f90bfa5d24a7c3e9f9c5aa9243`.
Initial implementation: `1277bf70b26eb47459df0efcfe6e37feb047693c`.
Planner-repaired candidate: `42547d4a39c0209e2f2157e58638da3d2de2b075`.

## Reconciliation and trust boundaries

The bridge's durable-context timing and retry repairs, bounded two-round
coordinator, real-execution rehearsal, focused regressions, and runbooks come
from PR70. Main's authorizing-comment digest/revision/editor check remains intact;
ported capacity fixtures now retain that authorized context. No provider
registry or other-provider branch was imported. No acceptance budget override,
acceptance assertion change, or unrelated UI test change was imported.

One additional correctness repair rejects builder artifacts edited by another
Actor or carrying unresolved conflicts/deletion before freezing their source.
The prior coordinator checked original authorship but discarded these fields.
Review results already checked them. Actor attribution remains workspace evidence,
not cryptographic isolation of mutually hostile agents.

The local replica remains authoritative. Inbox receipt precedes delivery ack;
the prompt commit and timestamp/dispatch-intent commit precede RPC. Failure before
RPC leaves queued work retryable with fresh authorized context. After uncertain
submission, the exact stored prompt is retained for history reconciliation.
Legacy inboxes gain a nullable timing column without inventing historical timing
or changing accepted receipts. Tests exercise disposable SQLite databases, not
active controller data. Process-crash and SQLite capacity evidence does not prove
power-loss durability.

No transport changed: same-host loopback service and App Server remain the
supported baseline. The hub is still required for enrollment/new delivery leases;
accepted work can save locally during outages. App Server/model unavailability
leaves work visibly pending or uncertain; it does not permit a second dispatcher.
Existing bridge reconciliation, export/recovery requirements and explicit
sender/task/session/worktree/policy mappings are preserved.

Security owns PR85's local approval for session archival/worktree retirement.
The overlapping changes here are limited to `BridgeInbox.begin`, the additive
`context_persisted_at` column, fresh queued prompts, and status timing. Security
was notified of these exact overlaps. PR85 is not included or qualified here;
its local approval checks must survive combination. The three-agent configuration
does not enable completion cleanup. Broader Actor/Location identity remains with
the reliability track. #91/#92 maintenance and #67 feature work are untouched.

## Evidence provenance

The [historical report](PARDNER-66-QUALIFICATION.md) records PR70's prior
`febaf78ad073350fb888427a5eec64e6b483501c` source and fingerprint
`b2d0a60b0b925795acaca96c9c15da319e355d9d854d3bb7567307f79abbf630`:
331 default tests, a three-native-agent two-round run, a non-answering approval
probe, and an uninterrupted 20-seed gate. PR70 reports its October 21 rebase
preserved that fingerprint. These are retained reports, not newly reproduced
results; their private artifacts were not re-audited here. Current main has
substantive source changes, so that qualification does not transfer.

Related branch metadata read from GitHub:

| PR | Inspected head | Reported evidence and boundary |
| --- | --- | --- |
| #71 provider foundation | `fc0e50a5b1ca237cca0570ef1d3ab8cce762e287` | 340 tests + seed 1 after restack; no fresh native-provider qualification |
| #72 Cursor ACP | `3b99b722f3e7b024881d783aa457d3269de61b33` | 383 tests + seed 1; native/mixed-provider qualification unrun |
| #73 Claude channel | `7f59e3c0ad4d8d94615e58ce1323bd622d8bd1c0` | 366 tests + seed 1; cooperative receipts are not native acceptance |

All three remained open. Their older explicit 10-second-budget results do not
establish the current 2-second default, and their implementations are unnecessary
for #66's Codex-only baseline.

## Acceptance matrix

“Historical” refers only to the PR70 report above. Automated fixtures cannot count
as actual agent participation or human acceptance.

| #66 requirement | Implemented evidence path | Current readiness / remaining observation |
| --- | --- | --- |
| Fresh operator setup and lifecycle | [Runbook](PARDNER-THREE-AGENT.md), explicit mappings and policy inspection | Documented; fresh native operator rehearsal pending |
| One kickoff, two reviews, correction, human queue | Three-agent script; two bounded rounds | Deterministic coordinator checks; native flow historical only |
| Three real independent Actors/worktrees | Per-Actor sessions, immutable Git source, command journal | Worktree fixtures; fresh three-agent participation pending |
| Same-SHA two-review barrier, stale/duplicate rejection | `three-agent-review.test.js` | Focused regression; one result/receipt cannot supply two votes |
| Builder attribution survives edits/conflicts | `builderArtifacts`, new regression | Foreign edits/conflicted/deleted source rejected before freezing |
| Busy queue, unauthorized tasks/senders, policy mismatch | Bridge tests; script's declared probes | Automated evidence; fresh native busy probe pending |
| Approval/input blocking without answering | Adapter regressions; separate approval script | Historical native probe only; no approval-and-resume claim |
| Durable receipt, restart, duplicate containment | Bridge SQLite/restart regressions | Automated fixtures; fresh native restart pending |
| Lost accepted reply and uncertain reconciliation | Exact stored prompt and submission identity | Automated fixtures; native reply-loss run pending; ambiguity stays blocked |
| Bounds and zero idle inference | 2s dispatch, 45s startup, 30s context, 20min workflow | Limits unchanged; native 5s idle historical, one-hour idle unqualified |
| Tests and final human acceptance | Independent tests plus both final approvals; parent in review | Required full checks pending; actual human accept/reject not run |
| Preserve data and private evidence | Disposable fixtures; no live operations | No model requests, native sessions, archival, live approvals or deployment in this wave |

## Fresh validation and qualification

On implementation SHA `1277bf70b26eb47459df0efcfe6e37feb047693c`, the five-file
focused batch passed **74/74**, with zero failures, cancellations or skips
(18.070 seconds). It covers bridge inbox/context, existing bridge authorization
and cleanup regressions, rehearsal support, review barriers and coordinator
cancellation. The production UI build also passed. The post-build source/test/UI
fingerprint is `b50f467b3b018cbffdd90bb7d3a66a659ca585feec2bdb9e826f030964c8d22b`;
it differs from PR70's historical candidate. The fingerprint was captured after
the focused tests/build, not before them; the tested source is the clean committed
implementation SHA, with only guidance edits outstanding.

The local verification report is `output/verification/issue-66-readiness/report.md`.
It records exact commands, outcomes, environment, and retained logs. Node is
24.11.1; dependencies use both lockfiles. Automated tests use disposable services
and test adapters, never paid models. No test assertion, latency limit, or Node
pin was relaxed.

The first reserved heavy batch ran on `07a4b39cd016127badc8ea238cadfb15647156e0`
(the initial implementation plus guidance), holding the shared advisory lock
through all subprocesses. Runtime passed **116/116**, CLI **12/12**. Full verify
passed the build and **14 Python tests**, then **471/472 Node tests** passed with
zero skips/cancellations. The sole failure was the planner's explicit file-map
assertion: the four new rehearsal files were unclassified. **Acceptance did not
run.** Before/after fingerprints matched the initial `b50f467b…` candidate.

Repair `42547d4` classifies those four files in the existing bridge group without
weakening the map assertion. All **16 planner tests passed** and the regenerated
plan has zero unclassified paths. Repaired fingerprint:
`a985f43d531c319ed1f1eb1c828b4cdfd745015feaaf80e57d20ea7dba389e02`.
This is not a full-verification pass. The failed attempt remains in the local
report/logs. The watchdog completed normally, reported no survivors or scratch,
and no checkout-owned test processes remained; the lock was released without
unlinking it and security was notified.

A repair-verification slot is reserved after security, cloud and proof. On proof's
release, run `npm run test:verification` then `npm run verify`, with 900-second
watchdogs and the lock held across both child processes. Capture the repaired
candidate before/after and keep the new logs separate. Runtime/CLI's preceding
passes establish the unchanged runtime code only; no combined candidate,
acceptance or native success is inferred. The initial sandbox watchdog preflight
also remains recorded: process enumeration failed before any child started.

Qualification is **required, not run** on this candidate: delivery persistence
and recovery changed. The required 20-seed command remains
`npm run test:acceptance -- --repeat 20 --seed 1` on Node 24.11.1, with prepared
UI and pinned browsers, holding the exclusive advisory lock for the entire
watchdog/child process. No historical result releases that gate. Routine and
overall readiness remain incomplete until the missing checks are satisfied.
No merge recommendation is made.

## Bounded next native rehearsal proposal

After integration with required security fixes, freeze the exact implementation
SHA, source/test/build fingerprint, native CLI version, configured model/effort,
and test artifacts. First finish routine checks and the deliberate 20-seed gate
under the shared lock at unchanged bounds. A combined candidate needs its own
results; this branch's focused checks do not qualify PR85 or other tracks.

The next separately authorized native exercise is one same-host isolated replica,
one dedicated App Server, three independent sessions/Actors/worktrees, and two
immutable fixture rounds with `--drop-dispatch-reply`. Retain the declared busy
restart, duplicate-result/notification, old-SHA, unauthorized-task and policy
mismatch probes. The correction adds the documented blocked-task requirement;
clean initial reviews are valid. No #67 code is involved. Stop on any approval
request without answering; record interruption as incomplete, not a pass.

The exact remaining authorization is permission to spend on the inspected model
for this bounded fixture and the separate non-answering approval probe, plus
permission to create and archive **only the disposable readiness session**.
Even `--check` creates/archives that session, so it was not run in this wave.
Before authorization, disclose the chosen model/effort and obtain an explicit
spending ceiling; the 20-minute workflow timeout is not a dollar cap. If a hard
monetary cap cannot be enforced, report that limitation before running.
Retain evidence privately; publish only a manually inspected, redacted report.

Successful automation ends at two same-final-SHA approvals and the human-review
queue. Obtain an actual human accept/reject verdict separately. A human
approval-and-resume UI, one-hour idle observation, separate machines, other
providers, hub-loss qualification, and arbitrary external-effect idempotency
remain outside this proposed run. #50 stays an open umbrella; #66 remains open
pending fresh qualification and human acceptance; #67 waits for that baseline.
