# PR105 six-second offline-policy qualification

This run starts from `b7c17775eaab245d8a84fb0d0144edc9ad7eb965` and actual main `6d424e5114f51be2186ebb0e3ac2c553fc073d11`; fetch found no drift. Atomic policy commit `1c35881afc35b7c3d163c651400955a71622a0f9` changes only offline restart enforcement/report metadata, three corresponding offline-reopen expectations and current normative references. Frozen fingerprint: `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`.

## Owner decisions and evidence boundary

The owner made two explicit acceptance-policy decisions on November 5, 2026: local acknowledgement from 2,000 to 2,500 ms (already merged in main), then offline startup/restart from 5,000 to 6,000 ms after reviewing the 5,380.913 ms miss. These are policy decisions, not performance repairs. Both original failures remain failures under their original contracts. The original PR105 gate stopped at seed8 at 5,380.912667 ms; both later instrumented diagnostic arms are preserved unchanged in PARDNER-CURSOR-CLOUD-VERIFICATION.md and its JSON. None supplies success to this new gate. The owner deferred unexplained timing/root-cause investigation until profiling infrastructure #107; no further diagnosis occurred in this run.

The current bounds are local acknowledgement 2,500 ms, UI visibility 2,000 ms, offline restart 6,000 ms and convergence 10,000 ms. The helper startup timeout remains 15,000 ms. No HTTP, retry, watchdog, dispatch or profile limits changed. The independent reliability profile remains at its own 5,000 ms offline target, and the legacy remote runner retains its five-second readiness wait. Its normative six-second requirement is documented separately; no remote run was performed. Historical reports and goal audit were not rewritten.

## Semantic and source review

- Field merges, authored alternatives, conflict resolution and edit/delete behavior: no change in this policy commit.
- Operation identity/retry and durable receipt/persistence barriers: unchanged, including schema5 requestId/stored operationId and revision semantics. The existing Cloud PR introduces separate exact provider run identities; qualification remains required for the integrated PR.
- Offline reopen: only its acceptance time requirement changes, not initialization, cached data, authority or failure behavior. Persistence, privacy, Actor/task authorization, one controller, quarantine, held queue and immutable evidence barriers remain identical to the preceding source.
- Transport/admission/delivery leases: no new changes in this commit. Existing Cloud routes remain behind admitted/admin handlers; external run intent/acceptance recovery is fixture qualified only.
- Measurement: yes, the owner explicitly broadened this one measured bound. The policy consistency check verifies the exact executable deltas and unchanged other limits, fixture size, helper and mapped source files. This invalidates prior qualification and requires a completely fresh gate.
- Milestone/native/human claims: none. Automated checks do not establish live Cloud permissions, paid/native recovery, independent artifact checker results, physical device behavior, power-loss durability or human acceptance.

Planner selection: routine test:verification, test:qualification, test:runtime, test:cli and test:ui; focused verify:model and Cloud fixtures; full npm run verify; then the explicitly authorized 20-seed gate. The additional focused policy run exercised the changed workspace-runtime, CLI-mentions and sync-use-cases tests. No warnings/review-required entries. The four previously published PNGs remain mechanically unclassified, with the owner-authorized manual evidence-only disposition retained; no planner rewrite. The server/model mapping is unchanged from the prior reviewed integrated source and is rechecked fresh.

## Preparation and execution

Node 24.11.1, matching 96 root /191 UI installed package records against committed locks, fresh UI build, no NODE_OPTIONS/preload, actual Chromium151.0.7922.34 and WebKit26.5 launches. One nonblocking acquisition of the stable advisory lock at 05:32:07UTC by PID46368; held across every owned child and cleanup. No host-load admission test, synthetic load, live runtime change or unrelated process termination. Each executed routine command had a 900-second watchdog; the planned deliberate gate would use the normal 3,600-second watchdog, but did not run. No internal test timeout was altered.

Raw acceptance traces/reports remain private because they contain disposable credentials. Published evidence is restricted to source/command/report/snapshot digests, aggregate counts/maxima, policy consistency, cleanup and synthetic screenshots.

## Outcome: routine failed; qualification required, not run

The routine batch stopped on its first failed command. No retry, diagnosis, new timing limit or speculative repair followed. The newly authorized offline six-second policy has not received full qualification.

| Tier | Command | Current candidate result |
| --- | --- | --- |
| Preparation | Node/install consistency, policy consistency, UI build, actual Chromium/WebKit launch | Passed |
| Routine | `npm run verify:model` | Passed; 174,614 states and 679,456 transitions |
| Routine, focused policy | `node --test test/workspace-runtime.test.js test/pardner-cli-mentions.test.js test/sync-use-cases.test.js` | 15 passed |
| Routine | `node --test test/cursor-cloud.test.js` | 26 passed |
| Routine | `npm run test:verification` | 39 passed |
| Routine | `npm run test:qualification` | 12 passed; focused regressions, not the deliberate gate |
| Routine | `npm run test:runtime` | 120 passed |
| Routine | `npm run test:cli` | 12 passed |
| Routine | `npm run test:ui` | **15 passed, 1 failed**, zero skips/cancellations; command exit 1 |
| Routine | `npm run verify` | **Not run** after preceding failure |
| Deliberate, explicitly authorized | `npm run test:acceptance -- --repeat 20 --seed 1` | **Not run** after preceding failure |

The failing test is **recovers pairing after network failure, credential rotation, and replacement links in webkit**, at `test/pardner-connection-ui.test.js:86`. The locator timed out after **5,000 ms** waiting for exact text **Saved locally · synced** following replacement pairing navigation. This is an independent UI readiness wait, not the offline-start acceptance bound. Its test and timeout are unchanged. The cause is unknown; there was no diagnosis in this wave and no assertion adjustment. The prior timing investigation deferred to #107 does not supply a disposition for this new failure.

Both active Cloud cancellation/evidence browser scenarios and the other control-pane scenarios passed in this UI command. That does not make the overall UI result a pass. The failed command took 91,643 ms under the watchdog (Node reported 88,354.675 ms); it ended naturally with no timeout or surviving children. The batch exited 1 after 161.170 seconds and never invoked full verify or the fresh gate. No new full acceptance reports exist to audit, so the required 20-report receipt/effect/timing qualification remains outstanding. Prior partial or standalone results were not reused.

Before/after/current fingerprints are identical. All executed watchdog records have zero survivors/new scratch directories and no watchdog timeout. The cleanup process checked that supervisor PID46368 had no remaining owned child, and the supervisor explicitly released the advisory lock and exited 0; the stable lock file remains. No unrelated process was stopped. No proof-track handoff or merge occurred.

The raw UI failure log contains disposable pairing material in the navigation call log and remains private under `output/verification/cloud-offline6000-20261105/`. Only an allowlisted failure description and file digests are published. No credential-bearing URL, pairing code, raw browser trace, receipt token or raw failure record is copied into this report or PR.

## Reviewable artifacts and remaining decision

- [Revised-policy commands, counts, digests, environment, policy review and cleanup](evidence/cursor-cloud-offline6000.json).
- [Frozen source/test/lock/build manifest](evidence/cursor-cloud-offline6000-candidate.json).
- [Original five-second failure and diagnostic report](PARDNER-CURSOR-CLOUD-VERIFICATION.md), preserved unchanged with its [evidence](evidence/cursor-cloud-integrated.json).
- [Current normative acceptance contract and dated owner decisions](PARDNER-ACCEPTANCE.md#scenario-and-bounds).

PR105 remains draft with `needs-qualification`. A separately scoped decision is needed for investigating the new WebKit readiness failure before new routine/full-gate execution; none is assumed here. Root owns exact-head review, merge decisions and next-track scheduling. Live Cloud/API permissions, native exact-run recovery, checker artifacts and human acceptance remain separate unqualified boundaries.

Proposed evidence-ledger entry (for review, not automatically applied): November 5, 2026; source `1c35881afc35b7c3d163c651400955a71622a0f9`; fingerprint `cfe39179b8635a11a8b805ff127e9cc230a35e21296ba4996be4e7ce363df93d`; exact commands/counts above; routine failed at unchanged WebKit pairing readiness wait; full verify and 20-seed gate not run; no new acceptance timing maxima, native rehearsal or human acceptance claim.
