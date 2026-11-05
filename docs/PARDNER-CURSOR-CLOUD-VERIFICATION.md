# PR105 integrated Cloud verification

Subject: existing PR105, integrated with actual origin/main `6d424e5114f51be2186ebb0e3ac2c553fc073d11`. Source candidate commit `84156124` follows merge `bc5a52e4`; no tooling overlays. The merge was explicitly requested by the coordinator (not a verification overlay). No other worktree or live service/data was modified.

Frozen candidate fingerprint: `f0b8d0b5e5794715086a55f6ed2f146a683bb12af7a94a5da73315631ec24b1f`. Node 24.11.1, macOS arm64. Existing root/UI installs came from npm ci against identical lockfiles (the merged main changed scripts but not either lockfile). Both pinned Chromium and WebKit actually launched; UI rebuilt from integrated source. Current main's sole authorized timing-policy change is retained: local acknowledgement 2,500 ms; UI 2,000, offline restart 5,000, convergence 10,000. No thresholds, fixture sizes, HTTP/retry/dispatch limits changed here.

Exclusive lock acquired once, nonblocking, by Python PID21451, on the coordinator's explicit slot handoff. `/tmp/pardner-selfhost-heavy-tests.lock` remains the stable file. That process held the lock through all owned child batches and cleanup; it released the lock and exited 0 at 05:12 UTC. No stale handoff or unrelated process termination.

## Integration and semantic review

Conflicts: scripts/verify-plan.js retained both the Cloud group and current main's reliability group. formal/lifecycle/mapping.json retained current main's workspace/runtime/durable-repo mappings and revision, with the reviewed integrated server hash. Relative to current main the server adds only nine control routes behind the existing admission/admin checks. Arrive/UpgradeArrive, persistence acknowledgement, StopBegin/StoreClose ordering and all model guards remain unchanged. Model and conformance checks are required and exercised; the bounded model does not prove Cloud HTTP semantics.

Cloud uses schema-independent local execution IDs, not workspace operation IDs. The merged schema5 content-derived operation/revision identity, retry requestId, integrity-conflict guards, native/privacy/LAN admission, cleanup approval/revocation, comment authorization and durable two-stage bridge context behavior remain intact. New Cloud files now use the shared private-state helper for symlink/hardlink/sidecar checks. Evidence freeze re-reads the exact terminal run to include late final output before later work can start.

Semantic answers: no CRDT field-merge/edit-delete change; yes new external operation identity/retry semantics, local SQLite intent/acceptance/evidence barriers, transport and restart recovery (qualification required). No hub lease/delivery receipt changes. No milestone/native acceptance claim and no weakened measurement. At the frozen source candidate, unclassified paths: none. New simulated fixture support is explicitly mapped. The old draft's standalone fixture evidence remains historical and is not integrated qualification.

## Failures retained before final freeze

1. `cloud.log` failed one new permission assertion because SQLite removed its repaired journal during open. The test now keeps an open inode handle and still asserts mode 0600; the same safety assertion is retained.
2. `cloud-2.log` failed after extracting the shared simulated transport: authority constant was moved with the class and an import replacement accidentally touched the child-process snippet. Restored the test-local constant and exact child import. The exited test process left 21 owned scratch directories; exact paths from that watchdog were removed, recorded in cleanup-fixture-failure.json. No unrelated paths/processes touched.
3. `cloud-ui-3.log` passed both new active Cloud flows but failed both older pane flows because Project ID matched Cloud project ID too. Exact existing-field locators fixed that ambiguity; Agent Actor was likewise made exact. `cloud-ui-4.log`: all four passed. No UI expectation/time budget removed.

The additional fresh-terminal-evidence regression was introduced during source review, before final freeze. All affected checks are rerun on the final candidate. Initial/development logs are not combined with the final pass.

## Final batch

Routine tier: model; Cloud fixtures; test:verification; test:qualification (focused regression, not the deliberate gate); test:runtime; test:cli; test:ui; npm run verify. Every long command uses the project watchdog. Deliberate tier: npm run test:acceptance -- --repeat 20 --seed 1, explicitly authorized, after routine success. Final command records/logs are under final/; candidate.before.json is captured after build and before tests.

Planner tiers and actual final-candidate outcomes:

| Tier | Command | Result |
| --- | --- | --- |
| Routine | `npm run verify:model` | Passed bounded model and implementation checks |
| Routine | `node --test test/cursor-cloud.test.js` | 26 passed |
| Routine | `npm run test:verification` | 39 passed |
| Routine | `npm run test:qualification` | 12 passed; this is the focused regression suite |
| Routine | `npm run test:runtime` | 120 passed |
| Routine | `npm run test:cli` | 12 passed |
| Routine | `npm run test:ui` | 16 passed, including four control-pane scenarios |
| Routine | `npm run verify` | 17 Python + 552 Node checks and one acceptance seed passed |
| Deliberate, explicitly authorized | `npm run test:acceptance -- --repeat 20 --seed 1` | Failed seed 8; required qualification remains unsatisfied |

Screenshots under `output/verification/cloud-ui/` pair DOM/HTTP assertions with visual inspection in both engines. The cancelled exact run, partial output, held unsent follow-up, immutable SHA, verdict controls and separately labeled simulated human record are legible without overlap. Default disabled/withdrawn flow also inspected. These are disposable, synthetic scenarios; no live approval was answered. Final screenshots and hashes are linked in the published evidence below.

## Evidence boundary

Cloud contract fixture and service/browser tests are simulated provider evidence. No Cloud credential, paid request, live deployment, production data migration, real-agent rehearsal, physical-device or power-loss proof. Unknown acceptance remains quarantine; owner receipt intervention is separate from automatic recovery. The required live #78/#79 cases remain unqualified. Raw acceptance/browser traces and any credential-bearing failure records remain private; published evidence contains only aggregate outcomes, digests, measured maxima, and synthetic UI/Cloud data.

## Final outcome: failed qualification

All final-candidate routine checks passed: 26 Cloud fixtures; 39 verification-planner tests; 12 focused qualification regressions; 120 runtime tests; 12 CLI tests; 16 UI tests; lifecycle model (174,614 states / 679,456 transitions); and full `npm run verify` (17 Python checks, 552 Node tests, one acceptance seed). Zero skips in the final Node suites. These results do not qualify the deliberate 20-seed gate.

`npm run test:acceptance -- --repeat 20 --seed 1` exited 1 after 1,060.926 seconds. Seeds 1–7 completed; seed 8 failed at `scripts/acceptance.js:148`: offline restart **5,380.912667 ms > 5,000 ms**. Seeds 9–20 did not run. This is a distinct failure from the historical #101 local-ack failure tracked by #107. No timing limit, fixture size, assertion, helper timeout or scheduling policy was changed; no full-gate retry was run.

The original timer begins after awaiting SIGKILL stop and measures `startCliService` through the first successful stdout JSON. It includes process spawn/import/startup and parent stdout handling; it excludes stop latency. The helper's separate 15-second timeout was not the failing assertion and remains unchanged. Cloud initialization adds work before readiness, so it is a candidate mechanism; this observation does not establish attribution.

The independent effects/receipt audit passed for the eight completed reports (verify seed 1 and gate seeds 1–7), rebuilding expected effects from each intent manifest and checking all three converged replicas against its saved snapshot. Completed-report maxima: receipt-inclusive local acknowledgement 410.821750 ms; UI visibility 95.139500 ms; offline restart 2,925.461708 ms; convergence 3,108.193291 ms. Seed 8 has 595 partial receipts with maximum acknowledgement 714.646375 ms; their schema5 request/stored identities were checked, but final effects were not verified. Its failure remains a failure, not a partial gate pass.

The before/after/current candidate fingerprint is identical. Final watchdogs, including the failed gate, report no timeout, surviving owned process or new scratch directory. Raw reports remain private locally under `output/acceptance/2026-11-05T04-42-04.971Z` (verify) and `output/acceptance/2026-11-05T04-44-09.155Z` (failed gate); published JSON carries report/snapshot digests, measured maxima and the failed artifact digest without credentials.

## Bounded diagnostics and disposition

One matched comparison ran sequentially: candidate `84156124`, then exact base `6d424e51`, each with `node scripts/acceptance.js --repeat 1 --seed 8 --output <arm-directory>`. Both used Node 24.11.1, identical dependency locks and shared installed dependencies, independently built UI bundles, the unchanged 100-task/400-comment/200-operation fixture, restart at operation index 88 on side 1, and the same external `NODE_OPTIONS --import` trace. The pair plus baseline UI build took 484.813 seconds within the original 30-minute budget. No other experiments, synthetic load, full-gate retry or threshold change followed.

| Instrumented observation | Candidate | Base |
| --- | ---: | ---: |
| Original end-to-end offline restart clock | 2,024.462458 ms | 2,704.667125 ms |
| Runtime/store initialization | 1,834.322208 ms | 2,448.010500 ms |
| Control-pane open, including Cloud on candidate | 8.402958 ms | 8.592292 ms |
| Entire server start (includes the preceding phases) | 1,851.729666 ms | 2,467.591708 ms |

Both instrumented arms passed and their final effects/receipts were independently audited. These nested phase durations must not be added together. The trace imports server dependencies into CLI children and appends synchronous timing records; it is diagnostic evidence, not an uninstrumented performance result or qualification replacement. Before/after fingerprints for each arm matched its own candidate manifest. The first supplemental audit mistakenly compared the base report to the subject fingerprint; its corrected check validates each report against its own summary and candidate. No product assertion was altered.

Coverage gaps: no spawn-to-entry phase, separate Cloud-constructor phase, separate listener/connection-file phase, or parent stdout phase. The original failing restart had no phase trace. Each arm reran only seed 8 and omitted the preceding seeds 1–7; one sample per condition cannot establish failure rates, causation or that Cloud is unrelated. No mechanism emerged, so diagnostics stopped after this pair. The original qualification remains **failed and unexplained**. The new Cloud initialization is a possible mechanism, not an attributed cause.

Next falsifiable question, requiring a separately authorized investigation: under the original preceding seed history, where does a slow restart accumulate delay—spawn/import, runtime/store initialization, Cloud/T3 initialization, listener/connection readiness, or parent stdout handling? Trace those boundaries without replacing the original clock before choosing a targeted intervention. No speculative repair is included.

The exact owned baseline archive was removed after both arms exited; all final and diagnostic watchdogs show no survivors or new scratch. The supervisor observed no remaining owned child and released the advisory lock, exited 0, and retained the stable lock file. No unrelated process or runtime setting was changed. PR105 stays draft with `needs-qualification`; root owns the next scheduling/merge decision. There was no proof-track handoff.

## Published artifacts

- [Integrated command results, report/snapshot digests, timing maxima, diagnostics and cleanup](evidence/cursor-cloud-integrated.json).
- [Exact frozen source/test/lock/UI-build fingerprint manifest](evidence/cursor-cloud-candidate.json).
- Synthetic UI screenshots: [Chromium active](evidence/cursor-cloud-chromium-active.png), [WebKit active](evidence/cursor-cloud-webkit-active.png), [Chromium disabled](evidence/cursor-cloud-chromium.png), [WebKit disabled](evidence/cursor-cloud-webkit.png).
- [Historical initial draft fixtures](evidence/cursor-cloud-fixtures.json) remain historical; the integrated 26-test run and trace digest are recorded separately above.

No live Cloud capability, native recovery, independent artifact checker result or human acceptance is established by these automated fixtures. #78 and #79 live cases remain unqualified.

Publication-only planner follow-up: the four generated PNGs under `docs/evidence/cursor-cloud-*.png` are mechanically unclassified because the planner recognizes Markdown and JSON evidence but not image extensions. Each was manually reviewed as a synthetic screenshot artifact and checked against its published SHA256. The supplemental publication check expecting zero unclassified paths therefore failed; this is recorded rather than changing the planner or the frozen candidate. Their semantic classification is guidance/evidence only, with no runtime, test, UI-source or acceptance-harness change. The publication plan has no warnings. This manual disposition does not clear the failed qualification.
