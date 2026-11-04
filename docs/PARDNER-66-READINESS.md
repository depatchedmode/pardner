# Issue 66 readiness on integrated main

This is the November 4, 2026 integration of [PR70](https://github.com/depatchedmode/pardner/pull/70)
through [PR101](https://github.com/depatchedmode/pardner/pull/101), for
[#66](https://github.com/depatchedmode/pardner/issues/66) under
[#50](https://github.com/depatchedmode/pardner/issues/50). It assesses an automated
implementation candidate, not the remaining native/human acceptance of #66.
**Routine verification passed; deliberate qualification failed. No merge
recommendation is made while the latency failure remains unexplained.**
It does not implement or close #67. The coordinator owns the merge decision.

Integrated main: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`, including #103 runtime,
#102 security/PR85 cleanup approval, and #106 schema5 operation integrity.
Tested implementation: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Source/test/lockfile/built-UI fingerprint:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Guidance-only evidence commits can follow this implementation without altering
that fingerprint. No #105/#104 union is included or qualified here.

## Reconciliation and behavior

PR70 `17d65d1c1aa011f90bfa5d24a7c3e9f9c5aa9243` supplies the bounded two-round
coordinator, native-execution rehearsal, durable-context timing/retry repairs,
and their regressions. Its history/provenance and this branch's planner repair
`42547d4` are retained. Main was integrated in `416f34c`; the only textual merge
conflict was the delivery feature map, resolved by retaining both sections.
No provider registry, other-provider branch, acceptance-budget override or
unrelated UI assertion change was imported.

The integrated bridge preserves all of these independent requirements:

- Explicit Actor/task/sender/session/worktree/policy mapping and sole dispatch.
- Durable inbox receipt before delivery acknowledgement; durable prompt then
  timestamp/dispatch-intent commit before RPC. Preparation failure remains queued
  and retries fresh authorized context; uncertain submission retains its exact
  saved prompt for supported history reconciliation.
- Main's originating-comment digest, editor and observed-revision checks.
  Schema5 `receipt.requestId` is the caller's retry key; `receipt.operationId`
  is the stored content-bound identity used by mentions and comment revisions.
- Both `cleanupApproval` and `contextPersistedAt` in status. Local cleanup approval
  and revocation remain private, with ownership/scope/revision checks before each
  archive or move effect. Timing changes do not authorize retirement.
- Unresolved operation-integrity groups in task context block queued dispatch,
  builder-artifact selection, review votes, local cleanup approval and the next
  retirement effect. All variants/provenance remain intact; coordinator failures
  retain structured integrity-error details and never silently retry writes.
- Two independent same-immutable-SHA approvals. Old-round/old-SHA, duplicate,
  contradictory and misattributed reviews cannot supply the second vote.
  Foreign-edited, deleted or conflicted builder artifacts cannot be frozen.

The local service still owns the persisted replica. No transport, shared-secret
admission, schema migration or broad Actor identity redesign was introduced here.
Same-host loopback remains the native baseline; enrolled replicas/new hub leases
retain their existing dependency boundaries. All merged native credentials,
private-state, browser/privacy, LAN and controller safeguards remain present.
Tests use disposable data and fake archival adapters; no live controller data,
credentials, native sessions, worktrees or approval prompts were operated on.

## Fresh automated evidence

Node **24.11.1**, both locked installs and current UI build on macOS arm64.
Pinned Chromium **151.0.7922.34** and WebKit **26.5** actually launched.
The planner reports no warnings or unclassified paths. All checks run with the
same integrated executable candidate under one exclusive nonblocking OS advisory
lock at `/tmp/pardner-selfhost-heavy-tests.lock`; the lock is retained across
subprocesses and never unlinked. Normal assertions and latency bounds are intact.

| Check | Result |
| --- | --- |
| Targeted bridge/cleanup/rehearsal, schema5 integrity, native auth/storage and private-state union | 142/142 passed |
| Verification tooling / runtime / CLI | 39/39, 118/118, 12/12 passed |
| Storage/conflict qualification regression suite | 12/12 passed |
| UI suite, including Chromium/WebKit actual LAN HTTP and privacy coverage | 14/14 passed |
| Lifecycle model/mapping | 174,614 states, 679,456 transitions; invariants, progress and all coverage witnesses passed within declared bounds |
| `npm run verify` | Build, 17 Python + 522 Node tests, then seed-1 acceptance passed; no test skips/cancellations |
| Routine seed audit | 719 operations, 3 recorded replica verifications; snapshot/report digests and schema5 request/stored identities checked |
| `npm run test:acceptance -- --repeat 20 --seed 1` | Failed on seed 5: 2,384.036 ms local acknowledgement exceeded 2,000 ms; seeds 1–4 passed, 6–20 not run |

Before/after routine, failed-gate and diagnostic fingerprints match. The 20-seed
invocation exited 1 after 662.039 seconds, without timeout, skipped seeds or
retries. The failed operation was `seed-5-operation-661`, a scripted offline
`task.update` of priority, after the fixture's restart. A prior operation took
1,818.734 ms, also retained. The failure is not a qualification pass; no summary
was generated. The four completed reports and snapshots were re-audited, and the
failed seed's manifest/cleanup artifacts were inspected. See the curated
[evidence record](evidence/issue-66-integrated.json).

A declared 30-minute diagnostic budget covered a sequential matched seed-5 run
on actual main (disposable source archive, matching dependency links/UI build)
and this candidate. Both passed: maximum receipt-inclusive acknowledgements
**336.009 ms** and **258.382 ms**. The affected CLI task-update path is unchanged
from main; changed bridge modules are loaded only for bridge commands. This does
not establish the original failure's cause. Host load averages observed after
the miss were 215.19/142.51/65.08 and later fell to 39.25/99.08/57.97; no thermal
warning was reported. Those observations are correlation, not proof that host
pressure caused this operation's delay. Passing isolated reruns do not clear the
failure, so diagnosis stopped instead of silently retrying the full gate.

A separately authorized 45-minute [phase investigation](PARDNER-66-LATENCY-DIAGNOSTIC.md)
subsequently measured 800 offline updates across four diagnostic prefixes. It
quantified ordinary CLI/client overhead but did not reproduce or explain the
original miss. It left qualification **FAILED**, preserved these results, and
ran no new full acceptance gate.

A later, separately authorized [single sequential diagnostic](PARDNER-66-SEQUENTIAL-DIAGNOSTIC.md)
ran the original full seeds 1–5 in one traced invocation. All five passed, but
the original threshold failure was not reproduced or explained. This diagnostic
does not replace the 20-seed gate; qualification remains **FAILED**.

A subsequent authorized [controlled-CPU investigation](PARDNER-66-CPU-PREFLIGHT.md)
stopped at preflight: no sustained quiet window met its predeclared CPU and
runnable-process criteria. No fixture/load arms or gate ran. This missing
environment prerequisite supplies no diagnosis and leaves qualification **FAILED**.

All watchdogs completed and recorded no hung processes, survivors or leftover
scratch. Owned test processes were absent after diagnosis, the disposable baseline
archive was removed, and the lock wrapper exited 0, releasing the stable lock
without unlinking it. No downstream track was handed the slot automatically.
The next investigation must distinguish CLI spawn/scheduling, request/service
handling and persistence time under recorded pressure, or use an explicitly
controlled host/time window; then rerun the entire 20-seed gate unchanged.

The routine seed's evidence remains a separate single-seed result. The routine seed's maximum measured
receipt-inclusive acknowledgement was **322.595 ms** (2,000 ms limit), UI visibility
**77.602 ms** (2,000 ms), offline reopen **2,048.637 ms** (5,000 ms), and convergence
**2,647.113 ms** (10,000 ms). These are observed values, not budget substitutions.

Private raw artifacts and the detailed report live at
`output/verification/issue-66-integrated/`; acceptance traces and receipts stay
under `output/acceptance/`. Browser traces contain disposable credentials and are
not public evidence. The audit rechecks the first retained snapshot per seed;
the other two replicas have recorded live verification results, not separately
retained snapshots. Model bounds, deterministic workers, simulated devices and
process kills do not establish arbitrary external effects, physical devices,
native model participation or power-loss durability.

## Historical results and failed attempt

PR70's [historical report](PARDNER-66-QUALIFICATION.md) records source
`febaf78ad073350fb888427a5eec64e6b483501c`, fingerprint
`b2d0a60b0b925795acaca96c9c15da319e355d9d854d3bb7567307f79abbf630`:
331 tests, a three-native-agent two-round run, a non-answering approval probe
and a 20-seed gate. PR70 reports that its October 21 rebase retained that
fingerprint. Those private artifacts were not re-audited in this wave and do not
qualify the current candidate's native execution.

Metadata/evidence was read for open PR71 `fc0e50a5` (340 tests + seed 1), PR72
`3b99b722` (383 tests + seed 1) and PR73 `7f59e3c0` (366 tests + seed 1). None
reported fresh native/mixed-provider qualification after restack; earlier explicit
10-second-budget runs do not prove today's 2-second default. None was imported.

The initial current-main reconciliation `1277bf70` passed 74 focused tests and
build; guidance head `07a4b39` passed 116 runtime and 12 CLI tests, then full verify
passed 14 Python and 471/472 Node tests. Its one failure was this change's missing
four planner classifications; **acceptance did not run**. Repair `42547d4` retained
the assertion, added the paths, and passed 16 planner tests. Initial fingerprint
`b50f467b…` and repaired `a985f43d…` are historical only. These attempts, the initial
sandbox preflight failure (no test child started), and lock-busy outcome remain
in `output/verification/issue-66-readiness/`. No failed or earlier candidate's
seeds are combined into current qualification.

## Acceptance matrix and remaining boundaries

| #66 requirement | Current evidence | Remaining observation |
| --- | --- | --- |
| Fresh operator setup/lifecycle | [Runbook](PARDNER-THREE-AGENT.md), explicit mappings and inspected policy | Fresh native operator rehearsal |
| One kickoff → two reviewers → correction → final human queue | Bounded coordinator and deterministic regressions | Fresh actual three-agent run |
| Independent Actors/worktrees and immutable revision | Real Git worktree fixtures, review barriers, command/timing journal | Native participation on this fingerprint |
| Delayed/busy, duplicates, stale results and authorization | Bridge/review regressions, restart/reconciliation fixtures | Fresh native busy/reply-loss probes |
| Input blocking without answering | Preserved adapter regressions and separate probe | Native probe; human approval/resume remains unqualified |
| Durable receipt, queued retry, lost reply and recovery | Fresh context, SQLite capacity, restart, precise saved-prompt and cancellation tests | No universal exactly-once external-effect guarantee |
| Bounds/idle | Unchanged 2s dispatch, 45s startup, 30s context, 20min model workflow; deterministic idle ticks | Native timing and real one-hour idle unqualified |
| Repository verification | Fresh integrated routine passes; deliberate gate failed as above | Actual human accept/reject remains separate |
| Preserve data/credentials/privacy | Disposable automated fixtures; merged security checks retained | No live deployment/migration or archival authorized |

Keep #50 and #66 open. #67 waits for its separately qualified native/human
baseline. Automated code qualification permits a bounded implementation merge
review; it does not satisfy these remaining issue acceptance criteria.

## Bounded next native rehearsal proposal

After the automated integration is accepted, separately authorize one same-host
replica, one dedicated App Server, three independent sessions/Actors/worktrees,
and two immutable fixture rounds with `--drop-dispatch-reply`. Record exact source,
build fingerprint, native CLI version, model/effort and spending ceiling first.
The 20-minute workflow bound is not a dollar cap; disclose any inability to enforce
a hard monetary cap before running. No paid/native session is authorized by the
automated qualification or merge request.

Retain the declared busy restart, duplicate/stale, unauthorized task and policy
mismatch probes. A clean initial review is valid: the correction adds the declared
blocked-task requirement rather than inventing a bug. Stop on input/approval
requests without answering. The separate non-answering approval probe needs its
own bounded native authorization. Even `--check` creates/archives a disposable
readiness session, so it was not run in this wave. Any permission must name only
that disposable session, not existing user sessions or worktrees.

Automation ends at two final-SHA approvals and the human-review queue. Record an
actual human verdict separately. A human approval/resume UI, physical/separate
machines, other providers, hub-loss native qualification, one-hour idle and
arbitrary external-effect idempotency remain outside that proposed run.
