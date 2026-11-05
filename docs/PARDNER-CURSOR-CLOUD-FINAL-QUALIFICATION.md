# PR105 final qualification after owner disposition

Starting publication head: `d06fceea7734947dc84df88f2136fdbb3710c4ba`. Executable source/policy commit: `1c35881afc35b7c3d163c651400955a71622a0f9`. Fetched actual main: `6d424e5114f51be2186ebb0e3ac2c553fc073d11`; no drift. Frozen source/test/lock/build fingerprint: `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`. This run introduces no speculative product or test changes.

## Explicit owner dispositions

The owner approved tracking the original unreproduced WebKit replacement-pairing occurrence in [#108](https://github.com/depatchedmode/pardner/issues/108) and proceeding with the remaining qualification/merge. That historical occurrence is no longer an unconditional merge block. It is not repaired, proven unrelated or retroactively passed. The test remains enabled with every original assertion and the exact 5,000 ms locator wait. This disposition does not waive any new failure. All prior failure and diagnostic records remain separate and unchanged.

Two earlier November 5 policy decisions set local acknowledgement to 2,500 ms and offline startup/restart to 6,000 ms. UI visibility remains 2,000 ms and convergence 10,000 ms. Helper startup stays 15,000 ms; other HTTP/retry/watchdog/dispatch/profile limits are unchanged. The original acknowledgement and startup misses remain historical failures under their former limits; no performance repair is claimed. Reusable profiling/failure-capture work remains open in [#107](https://github.com/depatchedmode/pardner/issues/107). Both #107 and #108 are independent follow-ups, not issues closed by this PR.

## Candidate and semantic review

The policy consistency check confirms the exact offline-only executable deltas against the previous source, current bounds and unchanged helper/independent limits. Schema5 operation/request identity and persistence barriers remain intact. The Cloud adapter still persists exact intent/acceptance/run identity, fences controllers, holds unknown/cancelled work, re-reads current state and gates later runs on immutable attempt evidence. Actor/task authorization, privacy/admission and the bridge context contracts are unchanged from the integrated reviewed source.

There are no new field-merge, conflict, edit/delete, operation replay, delivery-lease or transport changes in this publication. Existing Cloud transport/recovery and acceptance-harness changes make qualification required; the completed result is recorded below. No native/live/milestone/human completion claim is made. Current planner selection is unchanged: routine test:verification, test:qualification, test:runtime, test:cli, test:ui; focused verify:model and Cloud fixtures; full verify; deliberately invoked 20-seed gate. No warnings or review-required entries. Existing four evidence PNGs retain the explicit manual evidence-only classification; the planner is not rewritten.

## Reused versus fresh evidence

The owner permits reuse only when applicability and the complete source/test/installed-lock/build identity match. Reuse is restricted to successful subcommands of `output/verification/cloud-offline6000-20261105/`, all bound to the same executable source/fingerprint. Their private logs and watchdog records are copied into immutable per-run storage and verified against the earlier published SHA256 digests. Their old overall UI failure is not converted into a pass.

| Tier / command | Evidence treatment |
| --- | --- |
| Routine `npm run verify:model` | Reused bounded model/mapping result: 174,614 states / 679,456 transitions; mapped sources/model/mapping unchanged |
| Routine focused offline-policy tests | Reused 15 passed |
| Routine `node --test test/cursor-cloud.test.js` | Reused 26 passed |
| Routine `npm run test:verification` | Reused 39 passed |
| Routine `npm run test:qualification` | Reused 12 passed; focused regressions, not the deliberate gate |
| Routine `npm run test:runtime` | Reused 120 passed |
| Routine `npm run test:cli` | Reused 12 passed |
| Routine `npm run test:ui` | Fresh uninstrumented run: 16 passed, zero failures/skips/cancellations |
| Routine `npm run verify` | Fresh uninstrumented run: 552 Node tests, 17 Python tests, one acceptance seed passed |
| Deliberate `npm run test:acceptance -- --repeat 20 --seed 1` | Fresh complete run: 20/20 passed; no historical partial seeds reused |

Fresh preparation checks Node 24.11.1, every installed package record against the two lockfiles, current UI build and actual pinned Chromium/WebKit launches. There is no diagnostic preload, artificial load or host-admission veto. The normal routine watchdog is 900 seconds; the 20-seed gate uses 3,600 seconds. Every command stops the batch on failure.

## Artifact retention and scope

The exclusive OS advisory lock is acquired once nonblocking and held through owned children and cleanup. Before and after each preparation/test batch command, all fixed files under `output/playwright/` and `output/verification/cloud-ui/` are copied into private content-addressed immutable blobs with per-stage manifests. The initial shared outputs are archived before the first command. Logs/watchdog records have unique names and become read-only after completion. The original acceptance runner creates a unique private report directory for each invocation. No prior file is used as a green retry.

Raw acceptance/browser records and UI logs can contain disposable credentials and remain private. Published evidence contains only allowlisted outcomes, digests, receipt-inclusive maxima, snapshot checks and reviewed synthetic-image references. Live Cloud access, native exact-run recovery, independent artifact checker results, human acceptance, physical-device behavior and power-loss durability are separate unqualified boundaries. No live dispatch, paid/native session, production data/schema adoption, deployment, issue closure, merge or #104 handoff is performed here.

## Current outcome and audited results

Routine outcome: **passed**. Overall outcome for this explicitly scoped automated qualification: **passed**. Qualification passed for fingerprint `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`. This result applies under the explicit owner disposition of the historical pairing occurrence; it does not erase or explain that occurrence. No implementation/test repair or assertion change was made in this resume.

Fresh `test:ui` ran the original five files with normal concurrency and all assertions, including the WebKit replacement-pairing case. Full `verify` rebuilt the UI and passed all discovered Node tests, Python runtime checks and its acceptance seed. Both fresh suites reported zero skips/cancellations. The only fresh deliberate gate invocation completed all 20 seeds. No diagnostic preload, phase observer, failure retry or additional diagnostic experiment ran.

The audit re-read all 21 reports (one from full verify plus the complete 20-seed gate), their summaries and snapshots. Each retains 100 tasks, 400 comments and 200 scripted operations. Every intent has an acknowledgement; each schema5 receipt retains the caller key as `requestId` and the canonical type/Actor/payload-derived `operationId`. The audit reconstructs expected effects from intents, checks attributed operations, tasks/comments/read receipts/handoffs and matches all three replica verification results against each saved snapshot. Both deterministic workers per seed completed one inbox item and one effect, with the required task context. These are fixture workers, not native agent or human evidence.

The audit checked **15,099 receipts** across 21 reports, all schema5. Canonical report hashes, raw report and snapshot SHA256 hashes, expected snapshot digests, per-seed operation counts and receipt-inclusive maxima are published in the [allowlisted evidence](evidence/cursor-cloud-final-108.json). No failure or cleanup-error report exists in these fresh completed seeds.

| Timing | Fresh 20-seed maximum (ms) | All 21 fresh reports (ms) | Current bound (ms) |
| --- | ---: | ---: | ---: |
| Local acknowledgement, including receipts | 341.710 | 341.710 | 2,500 |
| UI visibility | 85.437 | 85.437 | 2,000 |
| Offline startup/restart | 2145.009 | 2145.009 | 6,000 |
| Convergence | 4039.598 | 4039.598 | 10,000 |

Command durations below are watchdog wall time, not product latency.

- Fresh UI: 40.068 seconds; full verify: 187.738 seconds; 20-seed gate: 2550.556 seconds.
- Cloud fixtures passed in the reused focused 26-test command and again within fresh full verify. The latter also emitted private normalized fixture traces with a published digest. Service/pane checks exercised authorization, disabled-by-default dispatch, exact cancellation, queue holds, immutable evidence and separate simulated verdicts.
- Representative fresh Chromium and WebKit active panes were visually inspected from their immutable post-UI copies: readable exact run/outcome, held zero-submission queue, immutable evidence and explicitly simulated acceptance. Browser/service assertions provide the behavioral readback; screenshots alone do not prove persistence. The evidence lists the exact immutable local paths and hashes.

## Stability, retention and cleanup

Before UI checks, after UI, after full verify, before the gate, after the gate and at cleanup, the complete source/test/lock/build fingerprint remained identical. The final docs/evidence publication is checked against that same fingerprint. Dependency preparation matched 96 root and 191 UI installed package records to committed locks. Actual pinned launches were Chromium 151.0.7922.34 and WebKit 26.5 under Node 24.11.1.

All fixed screenshot outputs were archived before and after each preparation/test batch command. The artifact entries in the post-UI and pre-verify manifests are identical, as are the entries in the post-verify and pre-gate manifests; their capture timestamps and stage labels remain distinct. Every blob is read-only and its hash/size was rechecked. The previous diagnostic's documented shared-output preservation gap remains historical; it was not repeated or rewritten. Raw logs, acceptance receipts/snapshots and traces remain private; published artifacts contain allowlisted metadata only.

Every fresh watchdog recorded exit 0, no watchdog timeout, no survivors and no new scratch directory. The cleanup audit confirmed no remaining owned child processes and rechecked retained artifacts. The supervisor explicitly released the advisory lock and exited 0; the stable file was retained. No unrelated process or setting was changed.

## Review and remaining boundaries

- [Current commands, reused provenance, report/snapshot digests, timing audit, artifact manifests and cleanup](evidence/cursor-cloud-final-108.json).
- [Frozen complete source/test/lock/build manifest](evidence/cursor-cloud-final-108-candidate.json).
- [API contract, exact-run safety and #79 fixture/evidence seam](PARDNER-CURSOR-CLOUD.md).
- [Original five-second startup failure and matched diagnostic arms](PARDNER-CURSOR-CLOUD-VERIFICATION.md).
- [Original revised-policy UI failure](PARDNER-CURSOR-CLOUD-OFFLINE6000-QUALIFICATION.md), [isolated pairing comparison](PARDNER-CURSOR-CLOUD-PAIRING-DIAGNOSTIC.md), and [single full-UI capture](PARDNER-CURSOR-CLOUD-FULL-UI-DIAGNOSTIC.md), all unchanged.

The integrated source preserves main's schema5 identity/revision semantics, bridge context/two-stage begin, privacy/admission, cleanup/revocation and comment authorization. Earlier conflicts were deliberately resolved to retain both planner groups and current lifecycle mapping. Cloud uses the shared private-state helper and refreshes the exact terminal run before freezing output. This publication changes evidence and current status only.

The automated obligations for PR105 are satisfied under the owner's explicit historical-failure disposition. Root still owns exact-head source/evidence review, merge and downstream scheduling. Issues [#107](https://github.com/depatchedmode/pardner/issues/107) and [#108](https://github.com/depatchedmode/pardner/issues/108) remain open. No real provider permissions, paid/native exact-run recovery/cancellation/SSE retention, independent checker, human acceptance, physical-device or power-loss claim is supplied. Live dispatch stays disabled by default. No milestone or #78/#79 completion is asserted.

Proposed evidence-ledger entry (for coordinator review, not automatically applied): November 5, 2026; source `1c35881afc35b7c3d163c651400955a71622a0f9`; fingerprint `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`; fresh UI/full verify/20-seed gate passed with the exact current bounds, reused routine/model evidence explicitly identified; historical policy misses and pairing occurrence retained under owner dispositions; native/human milestone scope remains unqualified.
