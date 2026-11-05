# Reliability qualification after runtime and security integration

PR #106 now includes actual main `c636854cbf307bc67529e670c6658ff856267535`,
which contains merged #103 and #102. Integration commit
`5b281eb451fd7bc9c584baeb708809f9432ca447` preserves the prior reliability head
`9e8d14b7510a532c5a9dbee503701f8e79e09e7b` and its atomic commits. No #101, #105
or #104 branch was incorporated. The coordinator owns the exact-head merge.

**Routine outcome: passed. Qualification: passed. Overall automated outcome
for this PR's bounded source-integration scope: passed.** The final executable,
test, dependency and built-UI fingerprint was unchanged throughout routine and
20-seed qualification:

`3599ddb1c86f0d695120f6fe221c26044d0fd3fbe1fed7350ea11a23354d22d4`

Subsequent publication changes are guidance/evidence only, outside that
fingerprint. The [public evidence summary](evidence/reliability/post102-qualification.json)
contains exact commands, counts, durations, report checks and timing maxima.
The [initial-wave report](PARDNER-RELIABILITY-REPORT.md), original PR86 failures,
and original fixed-source baseline remain historical evidence, not proof for
this changed combined candidate.

## Integration decisions

The merge conflicts were lifecycle mapping/evidence. Both historical security and
integrity records were retained. The combined mapping was refreshed only after
review of the server, runtime, workspace and persistence boundaries.

- Native replica credential admission is intact. Integrity fixtures now use two
  distinct native credentials, including after service restart. These do not
  replace the two independent persisted replica identities; provenance assertions
  compare exact persisted IDs. API-only callers still cannot acquire native access.
- The server diff from actual main adds only `OPERATION_INTEGRITY_CONFLICT: 409`
  to operation error mapping. Both request variants remain in response details;
  the public regression explicitly checks HTTP 409.
- Original retry keys, stored fingerprint-bound operation IDs, returned revisions,
  explicit collision groups and complete origins remain intact. Main's comment
  digest, author and observed-revision authorization are unchanged. Issue-link
  behavior remains on the conflict-aware history reader.
- Browser conflict inspection keeps complete variants and bounded, wrapped text.
  `ActorMarkdown`, blocked image tracking, CSP/frame protection, LAN pairing and
  private-state protections from #102 remain intact. Chromium and WebKit screenshots
  were inspected for both integrity and Markdown privacy, paired with DOM/network
  assertions. The published report contains no credential-entry screenshots.
- Planner classifications retain security private-state/replica-credential files
  alongside reliability tooling. No unclassified paths remain. The merge-head
  warning refers to integration of actual target main, not an undeclared overlay.
- #103's fail-before-stop schema guard and #102's local cleanup approval remain
  unchanged. No live controller data, credentials, mappings or services were
  modified. Source schema 5 does not authorize adopting it in any existing install.

The model's actions, invariants, witnesses and mutation anchors still describe
admission, persistence acknowledgement and shutdown ordering. Credential checking
narrows admission outside the modeled enrolled-replica boundary; error status and
history projection do not move the flush barrier. Initial expected source drift
(exit 2) was retained; reviewed skip-drift, refreshed mapping and normal model
checks passed. Implementation conformance passed in runtime/full verification.
The model explores 174,614 states and 679,456 transitions; all four invariants,
shutdown progress and all ten witnesses passed. Historical wider-bound and
mutation demonstrations were not rerun or relabeled as fresh evidence.

Semantic qualification review: authored alternatives **yes**; operation identity/
replay **yes**; persistence ordering **no**; delivery lease/receipt ordering **no**
relative to actual main; transport/enrollment/recovery prerequisites **yes**;
milestone completion or weakened measurement **no**. These obligations were
covered by the focused exercises and the expressly authorized fresh gate.

## Fresh verification

Node 24.11.1, matching root/UI dependency locks and a fresh production UI build
were used. The reused dependency installs were checked against both lockfiles.
Actual launches confirmed pinned Chromium 151.0.7922.34 and WebKit 26.5.

| Tier | Check | Result |
| --- | --- | --- |
| Routine | Public integrity, both reconnect orders/restart and both browser engines | 2 passed |
| Routine | Native/auth/private-state/LAN/retirement/security integration regressions | 121 passed |
| Routine | Separate Markdown privacy visual exercise | 2 passed |
| Routine | Controller runtime, including fail-before-stop guard | 17 Python tests passed |
| Routine | Verification tooling | 39 passed |
| Routine | Storage/conflict/ticket qualification suite | 12 passed |
| Routine | Runtime, including lifecycle conformance | 118 passed |
| Routine | CLI | 12 passed |
| Routine | UI/companion, including actual LAN and both-engine privacy/QR checks | 14 passed |
| Routine | CLI smoke and schema-4 preservation probe | Passed |
| Routine | Bounded lifecycle model | Passed |
| Routine | `npm run verify` | 17 Python tests, 484 Node tests and one acceptance seed passed |
| Deliberate qualification | `npm run test:acceptance -- --repeat 20 --seed 1` | Seeds 1–20 passed in one run |

All commands exited zero, with no skipped/cancelled tests, failed test attempts or
hidden retries in this combined-candidate batch. The model's expected drift check
was a review trigger, not a failed implementation test. No workload size, test
assertion, timeout or latency limit was relaxed. The gate took 2,517.012 seconds.

All 21 acceptance report digests were independently recomputed: the full-verify
seed plus the separate twenty-seed gate. Each report had successful outcomes,
three matching replica projections, an independently checked snapshot digest,
exact operation accounting, schema-5 stored IDs corresponding to manifest intents,
and unchanged fixture/limit definitions. All expected trace/service artifacts
existed, and no failure or cleanup-error artifact was present.

The gate's observed maxima were:

| Measurement | Maximum ms | Observations |
| --- | ---: | ---: |
| Local acknowledgement timing entries | 1,482.253 | 14,220 |
| Local acknowledgement receipt records | 1,482.253 | 14,380 |
| All local acknowledgement observations, including receipts and retries | 1,482.253 | 14,410 |
| Convergence | 3,605.952 | 200 |
| Local UI visibility | 93.901 | 40 |
| Offline startup | 2,367.498 | 20 |
| Agent-effect acknowledgement timing entries | 206.916 | 70 |

The inclusive acknowledgement row unions local/agent timing entries and every
manifest receipt's `elapsedMs`, deduplicating only identical seed/request-ID/time
observations. Distinct retry observations remain counted. This captures browser
receipts that are absent from the local-ack timing list. Every measured observation
satisfied its existing bound: 2,000 ms acknowledgement/UI visibility, 5,000 ms
offline startup and 10,000 ms convergence. These are observations, not thresholds
reported as measurements, and not a full #63 capacity qualification.

The schema probe created an actual disposable schema-4 workspace from frozen
`bd55f246`, acknowledged a task and closed it. The new runtime rejected it with
`INCOMPATIBLE_SCHEMA`; hashes of all data and metadata files remained unchanged,
excluding runtime ownership SQLite lease files. No existing installation was used.

## Evidence, cleanup and scope

One nonblocking advisory-lock acquisition covered preparation, routine checks,
the twenty-seed child and final cleanup. Driver PID 17145 then exited normally,
releasing `/tmp/pardner-selfhost-heavy-tests.lock` without unlinking it. Every
watchdog reported zero survivors, unverified processes and new scratch directories.
A final process/cwd audit found only the lock/audit processes and five pre-existing
tooling processes; the latter were preserved. No owned test process remained.
No downstream track was resumed automatically.

Local plan, semantic review, exact logs/commands, model review, fingerprints,
screenshots, receipt-inclusive inspection and cleanup evidence are in
`output/verification/reliability-post102/`. Private acceptance originals are in
`output/acceptance/2026-11-04T19-27-08.715Z/` and
`output/acceptance/2026-11-04T19-30-38.290Z/`. These raw reports/traces include
disposable credentials and are not published. Public JSON contains only
allowlisted aggregates, synthetic schema-preservation facts and hashes.

The source qualification obligation for this bounded #106 integration is
satisfied. The coordinator may assess the exact published head for merge; no
merge or deployment was performed here. Future #101/#105/#104 integration needs
its own fresh qualification. Full #63 capacity work, remaining #58–62 design/
implementation, fresh-checkout milestone claims, physical-device checks,
power-loss durability and real-provider/human acceptance remain separate.
No issue closure, milestone completion, migration or paid execution is claimed.

Proposed evidence-log entry: on 2026-11-04, #106 integrated actual main c636854c
and passed the focused checks above, full verification and one uninterrupted
20-seed gate for fingerprint 3599ddb1c86f0d695120f6fe221c26044d0fd3fbe1fed7350ea11a23354d22d4.
This report is the reviewable evidence entry; the goal audit is unchanged.
