# M7 recovery and onboarding qualification

This follows the [initial onboarding verification](onboarding-verification.md). It records the new client's recovery work, actual agent participation and the remaining acceptance boundaries; it does not declare M7 complete.

## Relationship to the current PR

This thread tested `e591b7b8`. Before its documentation push, a concurrent
interrogation thread advanced the PR through additional source/UI repairs and
routine verification. Those commits are preserved. The [combined verification
record](onboarding-verification.md#interrogation-repairs-2026-11-06) reports 617
Node tests and three separate failed qualification attempts in that stream;
its current acceptance fingerprint is `ee4fb01330582b4cdf356b9cce74801cf7dea710c0c601c9dea1bc44d70a622d`.
Those later tests were not rerun by this thread. The 608-test result, actual-agent
exchange and failed gate below belong specifically to the earlier `e591b7b8`
candidate. The two streams' successful seeds are not combined. Observed host
load is context, not an established cause of this thread's timing failure.

## Candidate and environment

Source: `e591b7b8268b2a6cd6ed4f192024d275c4e93f33`, compared with main `4a7ae50e4a1a114c242c1f34936ee3979a7c4f40`. Node 24.11.1; pinned Playwright 1.62.1 Chromium and WebKit. The candidate was checked in a fresh Git clone with fresh root/UI `npm ci` installs, real browser launches and the UI build. No dependency symlinks or source overlays were used for final evidence. The clone was advanced from the recovery commit to the repaired source without changing either lockfile.

Source/tests/locks/built-UI fingerprint: `9f23a65a5029fd89096bf75698331b8b89b475da67f50e111654b38398ee816a`. Documentation added after verification is outside this executable fingerprint. Raw logs and credentials remain private under `output/verification/onboarding-m7/`.

## Behavior covered

Cold restoration into fresh directories preserves client identity, independent projects, retry receipts, invitations and acknowledged deliveries. The restored replica reopens and edits offline, then converges with its restored authority at the original origin. An owned second device can revoke a lost device. Revocation survives authority restoration; revoked data remains available through a private operator content export, while further writes are refused. That export is a readable view, not a complete replica backup. Attachments and external agent inboxes require separate backup. These tests establish process restart/recovery behavior, not power-loss durability or rollback-proof recovery from an obsolete backup.

A real Codex/Claude exchange found lost grant reporting metadata, an invitation command that omitted the client directory, and an unusable browser launch on an agent-only client. The repaired grant retains each enrolled harness's model/manager defaults without changing authenticated authorship. Agents still report their actual current model per session. Short invitations name the client directory, and agent-only clients deny human browser launch before producing a private link.

Full verification exposed shutdown defects. Four deterministic regressions failed on preserved pre-fix source: an upgrade pending its upstream ticket, a rejected upgrade with a peer holding the socket open, a late upgrade on an accepted connection, and an admitted HTTP response finishing after shutdown began. Tracing also observed a replica continuing discovery requests on a connection left reusable during shutdown. The repair closes rejected/late upgrades, tracks in-flight upgrades and closes HTTP keep-alive connections as admitted responses finish, before stopping runtimes and closing the registry. The complete affected suite then passed 51 checks without instrumentation.

## Verification results

| Check | Observed result |
| --- | --- |
| `npm run verify` | UI build, 608 Node tests, 17 Python tests and one complete acceptance scenario passed; zero failed/cancelled/skipped Node tests |
| Required routine scripts | Verification 39; qualification regressions 12; runtime 120; CLI 12; UI 24; control-runtime Python 17 — all passed |
| Affected client/recovery/shutdown/planner suite | 51 passed, zero failed/cancelled/skipped |
| New-client browsers | Both pinned Chromium and WebKit passed real two-client journeys |
| Deliberate 20-seed gate | Failed in seed 2: browser acknowledgement 3378.425292 ms exceeded 2500 ms; seed 1 passed |

| Tier | Command |
| --- | --- |
| Routine | `npm run test:verification`, `npm run test:qualification`, `npm run test:runtime`, `npm run test:cli`, `npm run test:ui`, `npm run test:control-runtime`; focused client/recovery/shutdown/presence/invitation tests; `npm run verify` |
| Deliberate | `npm run test:acceptance -- --repeat 20 --seed 1` |

Semantic review: operation/retry identity, persistent enrollment/recovery, Actor-bound delivery and admission require qualification. Existing task/vein/goal merge and conflict semantics were preserved. No mapped lifecycle implementation file changed. Adding the new UI suite to `test:ui` extends coverage without weakening an existing command, bound or assertion. Planner unclassified paths: zero. Chromium and WebKit both exercise real local services, not mocked APIs.

## Actual agent participation

The isolated rehearsal project `00446586-c750-4809-b0ad-86c026b43e28` and task `task-3263595e2001d0e1b42ea951` contain the actual exchange. The coordinator used the name Alpha in this new project and ran through Codex with gpt-6-astra; this is a different Actor from the earlier Cursor Cloud Alpha. Gamma ran through Claude Code with claude-opus-5-5; T3 managed both. They shared one actual human identity and ran separate local client services. This is local participation evidence, not a two-human or remote-machine rehearsal.

Gamma joined using the Agent invitation, read Alpha's actual task, saved its own critique, and replayed an unchanged comment request with one effect. Alpha read the critique from Pardner and posted a concrete repair handoff. On the repaired source Gamma restarted the same data/port without reenrollment, obtained a correctly populated private grant, confirmed that `client open` returns FORBIDDEN without creating a launch file, durably received and acknowledged the actual mention, and replayed the same receipt successfully. Both agents reported bounded actual presence and ended their sessions. Gamma's final readback was saved locally, connected and without pending sync.

Durable comment references: Gamma critique `comment-93ab43bb475bbba4d295d9c1`; Alpha handoff `comment-ad2c1860e737e8ef3b75a12e`; Gamma final result `comment-a8808ecf4e73397b63b33818`. The final result identified a follow-up ergonomic issue: mentions require a generated handle even when an Actor has an obvious display name. This remains recorded follow-up work; no claim is made that display-name mentions were implemented.

## Deliberate qualification failure

The authorized command `npm run test:acceptance -- --repeat 20 --seed 1` exited
1 on seed 2. A browser operation acknowledgement measured **3378.425292 ms**,
exceeding the unchanged **2500 ms** limit. Seed 1 passed, but this is not a
20-seed pass. The tested and working source fingerprints match. The failure was in the
browser response-queue assertion, which became an unhandled rejection before
the normal seed failure/cleanup path. Seed 2 therefore has no normal report or
failure JSON; that missing evidence is not treated as success. The watchdog
retained the top-level log, reclaimed three owned orphans and found no survivors.

Qualification directory: `output/acceptance/2026-11-06T08-24-47.106Z/` in the
private fresh checkout. The parent evidence directory retains
`qualification-20.log` and `qualification-20.watchdog.json`. This attempt is not
combined with any subsequent isolated success. The PR remains draft and carries
`needs-qualification`.

One isolated seed-2 run on the prior verified candidate `874e7f3` passed. One
completed current-candidate run with a parent-only browser timing observer also
passed: six browser acknowledgements were observed, with a maximum of
204.010084 ms. Neither run reproduced the original 3378.425292 ms outlier or
identified its cause. Their isolated successes do not qualify the failed gate,
and observer effects are not ruled out. These are one run per condition, not a
failure-rate estimate.

The first diagnostic observer accidentally propagated to a worker and failed
during worker startup; the next launch had an observer-file path setup error.
Both are diagnostic setup failures, not product failures. The corrected observer
runs only in the acceptance parent. It retains bounded non-secret request,
response and acknowledgement timing, without changing assertions or limits.
Its source and all attempts remain in the private evidence directory.

The [diagnostic procedure](../../.agents/skills/verify/references/diagnostics.md)
says to stop when “two successive experiments produce no new information.” The
two completed comparison arms provided no causal explanation, so speculative
reruns stopped. The next falsifiable investigation needs a trace of an actual
slow operation spanning browser receipt/body completion, parent event-loop and
queue delay, service application and persistence. No such trace exists for the
original failure. This falls within the timing/failure-capture work already
deferred to [issue #107](https://github.com/depatchedmode/pardner/issues/107).
The qualification outcome remains **failed**; neither #107 nor another issue
was closed or silently adopted as new implementation scope.

## Failed attempts and limits

The first fresh focused CLI command hit its existing 30-second scenario deadline. The prior candidate and current candidate then passed unchanged CLI runs. A controlled one-second delay per CLI subprocess reproduced that deadline on the prior candidate. This establishes total startup-time sensitivity; it does not prove which external process caused the first failure or that the timing issue is eliminated. No deadline or concurrency was relaxed. See private `cli-timeout-diagnostic.json` for exact arms.

The original M7 full verification was interrupted after 747 seconds with client test runtimes still alive. Partial shutdown repairs also timed out; those results were retained, not relabeled. Controlled regressions and HTTP tracing established the final repair. An initial copied-test path error is separately recorded as a setup failure. See private `shutdown-diagnostic-result.md` and the distinct watchdog/log files.

Remaining: resolve the failed qualification gate, exercise the new client over a real remote route, and obtain human acceptance. Automatic approval review rejected transfer of the full source and then the smaller runtime bundle to the existing exe.dev host. No source was transferred and no remote access policy changed. The request to transfer the minimal runtime bundle was pending at that point; the approved transfer is recorded below. Existing cloud participation used the older coordination runtime, so it cannot fill this evidence gap. No power-loss durability or physical-device result is claimed.


## Approved runtime transfer (2026-11-06)

The owner explicitly approved copying the reviewed runtime bundle to the existing
`pardner-hub.exe.xyz` host. The 45 files from `e591b7b8268b2a6cd6ed4f192024d275c4e93f33`
were copied into the new private directory
`/home/exedev/pardner-onboarding-m7-20261106-e591b7b`. All extracted file hashes
match the local manifest. The archive SHA-256 is
`6d5c21dbd6d49d290a4ffb69737522b9bf8efd50d27569a71344fc7663ec8f11`.
The source files total 808,621 bytes; the archive contains no repository history,
task data or credentials. The destination and runtime directory are mode 0700.

Locked production dependencies were installed in that isolated directory, and
`startClient` imported successfully under Node 24.11.1. No remote client was
started, and no existing remote service or access policy was changed. The
source-transfer approval blocker is cleared for this bundle.

This is the earlier local-rehearsal candidate, not the later combined PR candidate.
Copying and loading it does not establish remote enrollment, native sync, a usable
public route or human acceptance. Those exercises and the unresolved qualification
gate remain outstanding. Exact transfer metadata is retained privately in
`output/verification/onboarding-m7/runtime-transfer-completed.json`.
