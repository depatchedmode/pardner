# Issue 66 local qualification

This report accompanies the [three-agent runbook](PARDNER-THREE-AGENT.md) for
[issue #66](https://github.com/depatchedmode/pardner/issues/66). Implementation
is based on main `d1d1b91fe97388438716bc95541b7e7135b29bdd`. The reviewed changes
are being submitted as a draft PR. The dependent issue #67, merge, and deployment
remain outside this change.

**Status:** the corrected current candidate passed an observed automatic
three-Codex qualification and a separate non-answering approval probe. The same
source passed the canonical verification command: production build, all **298
default parallel regressions**, and **719 independently verified seed-1
acceptance operations** with the user-approved 10-second acknowledgment budget.
The earlier serial verification also passed. Independent source and native
evidence review closed both P2 findings and the P3 manifest label with no
outstanding actionable finding. The independent review record accompanies the
canonical-verification addendum. An earlier default parallel
run timed out during unchanged runtime teardown; its cause remains unexplained
and its failure is preserved. Neither the budget nor passing samples establish
the original repeatable 2-second performance target. Every correctness and
recovery check is retained. Human acceptance is separate and remains pending.

## Observed runs and corrections

All three-agent runs used Node 24.11.1 and Codex CLI 0.160.1, with the configured
`gpt-6.1-sol` model and `xhigh` reasoning. Each created one isolated Pardner
replica, one dedicated App Server, three distinct agent Actors/sessions, and
three independent fixture worktrees on one host. Existing services, checkouts,
and credentials were preserved.

| Run | Overall result | Observed outcome |
| --- | --- | --- |
| `d31d02e9-8399-46d7-b224-2a1196b7bd0e` | Fail | Both initial and final reviews completed and the parent reached human review; a 30-second wait prematurely timed out remaining model acknowledgments. |
| `3d4fd83b-d53d-4b8e-b493-0834cf08aada` | Fail | Both final-SHA approvals and human-review handoff completed; the file audit rejected reviewers' saved JSON evidence because its whitelist disagreed with the instructions. |
| `9a71f3f1-5f23-4967-b658-e65837d1c417` | Interrupted, not qualified | Both final approvals were saved, then executor connectivity was lost; the driver vanished without writing its final audit. Its three orphaned owned processes were identified, session evidence recovered, and only those groups stopped. |
| `701bcdab-8690-4498-a1a8-5a5a9d37772f` | Fail | Stopped after the initial barrier on a coordinator CLI task read; cleanup succeeded. Reopening only that fixture replica read the persisted task successfully. The original CLI error body was unavailable, so its exact cause remains undiagnosed. |
| `281f237a-7cab-471d-80a9-755db2ca9c02` | Functional gates passed; timing evidence superseded | Three real agents completed both immutable review rounds, automatic correction, independent tests, recovery probes, and human-review handoff. Independent source review later invalidated its per-delivery context/submission timing. The original report is retained unchanged. |
| `109fa5e6-c6aa-4f31-838b-001bc7193795` | Interrupted, not qualified | The corrected candidate observed accepted-reply-loss and busy-work restarts. Three native turns completed and both initial reviewer artifacts were saved, but executor loss removed the driver before its barrier/final audit. Native histories were recovered and the three verified orphan groups stopped with zero cleanup errors; no new inference was requested during recovery. |
| `0ab28948-11b8-49eb-8138-2499de36cfcd` | Cancelled while blocked, not qualified | Reviewer B ran 14 passing tests but requested approval to publish its review because the service directory was outside its worktree. Native status and the exact request were retained. The CLI uses HTTP RPC rather than writing that directory; no normal handoff attempt had failed. The operator cancelled without answering approval or changing permissions. |
| `8430e6e8-bca4-4b4d-93b6-ba7312e85e8a` | Fail | The clarified candidate observed both restart probes and five accepted turns. Repeated coordinator CLI reads produced no output before their process timeout; the corrected helper rejected them at the declared 30-second convergence deadline. Final audit did not pass; cleanup had zero errors. The exact underlying read failure remains undiagnosed. |
| `16bf233e-ed84-422a-b84a-ed493342fad6` | Pass | The unchanged clarified candidate completed both immutable review rounds, automatic correction, all 13 real accepted turns, recovery/fault probes, corrected delivery timings, independent tests, and the final human-review queue. Cleanup had zero errors. |

The first failure was fixed by using the remaining declared 20-minute model
workflow budget for final acknowledgments. Queue/context convergence retains its
separate 30-second bound. The second was fixed by explicitly permitting named
review-result JSON artifacts in both the reviewer instructions and Git audit;
unexpected executable files still fail. Regressions cover both corrections.
The failures remain failures; successful model handoffs alone did not override
either audit.
The executor interruption prompted immediate protocol journaling, a private
process manifest and progress record, and protection against closed output pipes.
These records help diagnose interruption; they do not manufacture a pass.
The failed read prompted structured CLI diagnostics and read-only retries within
the existing convergence interval. Mutations do not use that retry helper.

## Earlier three-agent baseline

The passing run used the frozen application fingerprint
`fc1a9c00bb18cede69bb5adad7f86d205f55dc103b0d9e677eca858187f61440`.
It remained unchanged throughout qualification. Both reviewers approved initial
fixture commit `866db7b2672bf662544511ef7610f0a39bd699f7` before the declared
correction. Both then independently approved final fixture commit
`f853ab20c118d9298d64cdfda673fab2c4ceef6d`. The parent ended in `review`, assigned
to `human`, with both attributed final-SHA approvals and passing test evidence.

| Actor | Real accepted turns | Completed turns in retained session history | Observed successful test commands |
| --- | ---: | ---: | ---: |
| `builder` | 8 | 8 | 2 |
| `reviewer-a` | 3 | 3 | 3 |
| `reviewer-b` | 2 | 2 | 1 |

There were 13 real submissions and 13 distinct accepted turn IDs. Retained native
history confirms all 13 completed, with all sessions idle. The live protocol
journal contains 11 completion events; restarting the bridge can miss live
events, so it is not presented as complete history. Every agent's final tests
were also rerun outside its session, alongside stronger external assertions,
source-hash checks, and a Git audit of allowed files.

Observed gates passed: unauthorized-task and policy-mismatch blocking without
turns; real accepted-reply loss becoming visibly uncertain and reconciling the
original turn after restart; durable busy work surviving SIGKILL and dispatching
after the active review; duplicate results counting once; the explicitly late
old-SHA result being rejected; 64 repeated protocol notifications; both final
approvals before human-review handoff; and a five-second idle interval with zero
model requests. No coordinator read retries were needed in the passing run.
Cleanup had zero errors.

Healthy initial dispatch took **233 ms**, within the declared 2-second bound.
The model workflow and final independent checks took **437.372 seconds**, within
the separate 20-minute budget. The initial dispatch observation remains valid.
Independent review found that the per-delivery collector used the acceptance/
reconciliation timestamp as context persistence and selected a later request on
the same thread. Ten of 13 collected submission times followed acceptance and
three were absent. Those per-delivery timing claims are withdrawn; retained
native history still supports the functional workflow observations above.

## Independent source review and corrections

An independent Codex source reviewer inspected the entire original 15-file patch
(`84e856dc55861d6daa6c69eec70ad115fbf57d6e1d6b754bdc0abfe5d72f86a6`),
ran 19 focused tests, reconstructed all 719 acceptance operations, and reviewed
the real native histories. It found two P2 issues:

1. Per-delivery timing did not identify durable context or correlate its exact
   submission and accepted reply.
2. A successful coordinator read could arrive after its convergence deadline;
   the retry loop could also begin another read at expiry.

The inbox now records context persistence separately after the prompt's durable
commit, before adapter submission. Old inboxes migrate with an unknown (`null`)
context timestamp rather than fabricating history. Proxy requests and replies
carry matching submission and delivery IDs. Timing validation requires those
identities and ordered observations, retaining acceptance separately from the
inbox receipt recorded during acceptance or reconciliation.

Reads now check the remaining budget before each attempt, reject late success,
and cancel the underlying CLI at expiry. Tests cover durable context across
restart, legacy migration, exact correlation across later same-thread requests,
zero budget, late success, and absence of an expired retry. All 41 focused tests
passed; an earlier new migration test failed because its fixture encoded the
workspace identity noncanonically, and passed after correcting that fixture.

The same independent reviewer inspected the corrected fingerprint
`31aa0b65a850921a08d60c5db3c4427f0b2b0c20be9c91313581733960819290`
and closed both findings with no new actionable findings. Lightweight independent
reproductions confirmed cancellation of a late read, one attempt across expiry,
and exact timing correlation despite delayed receipt recording. This source
verdict does not infer approval of pending runtime evidence or human acceptance.

The later blocked run prompted a fixture instruction clarification: task comments
and handoffs are already authorized HTTP RPC to the loopback service, and the
service owns its data writes. A data path outside the agent worktree is not a
direct write by the CLI. Agents should use normal execution and retain concrete
failures rather than request escalation merely to publish fixture results.
The inspected sandbox, approval policy, mapping scopes, and bridge's non-answering
behavior are unchanged. The blocked run remains unqualified; this clarification
was subsequently exercised by the passing current-candidate run described below.

An offline audit of the retained failed run `8430e6e8` validated all five actual
accepted deliveries with the corrected correlation and timing helper, spanning
all three Actors. All had measured context and exact ordered submission/receipt
links. Three lacked a live completion event and retain `null` completion timing.
This inspection requested no inference and changed no inbox state. It validates
those observed timing rows; it does not complete the failed workflow or qualify
its missing final barrier.

## Other checks and interventions

- No-inference readiness confirmed the current binary, existing sign-in,
  configured model catalog, and isolated session creation/resumption.
- The protocol smoke passed without any model request.
- The focused bridge/coordinator run initially passed 43 tests. The final
  deadline, duplicate ordering, three-worktree isolation and file-audit checks
  plus bounded read-recovery regressions passed all 14 focused tests.
- The separate real approval probe `42b7709a-ef2b-4b00-8a7c-428e6d4a382a`
  passed: Luna/low requested approval in a read-only session, queued work stayed
  blocked, the marker was never written, and the controller cancelled and
  archived its own thread. No request was answered. This probe's own frozen
  candidate is retained privately; it does not establish a human approval UI.
- The approval probe was repeated as
  `12e98791-5c3d-43bd-b0d0-5bf42969a3b1` against the three-agent candidate fingerprint
  listed above. It passed all five gates with zero cleanup errors: a real request,
  queued blocked work, preserved policy, no marker write, and interruption/archive.
  This is still non-answering and cancellation, not human approval/resumption.
- A no-inference SIGTERM probe passed graceful cancellation and cleanup with
  no cleanup errors.
- A readiness probe with a closed stdout pipe passed without inference and
  recorded the pipe error; cleanup had zero errors.
- An initial full verification passed the production UI build, 286 tests,
  and seed-1 acceptance (100 tasks, 400 comments, 200 operation schedules).
- Two later full regression runs exposed an unchanged UI locator race: saved
  comment text also matched the draft textarea. Both cases passed alone. The
  existing assertion was narrowed to the saved-comment paragraph, and the
  next full regression run passed all 287 tests.
- That run's seeded acceptance failed its existing two-second local
  acknowledgment bound at 2.794 seconds during concurrent qualification.
  The bound was preserved; subsequent verification runs were separated from
  model qualification.
- The first standard verification on the pre-budget source passed 286 of 290 tests;
  three failed and one was cancelled on existing service/socket/bridge
  deadlines, before acceptance ran. All 21 tests in the four affected files
  then passed with file concurrency limited to one, without changing any bound.
  Read-only host inspection showed heavy unrelated load. The cause of each
  deadline failure is not conclusively established.
- The standard verification retry passed all **290 tests** and the production UI
  build. Its seed-1 acceptance then failed the unchanged 2-second local
  acknowledgment bound at **2.362 seconds**. Model qualification had already
  stopped; this failure is not attributed conclusively to concurrent inference.
- A subsequent acceptance-only seed-1 retry failed at **4.802 seconds** during
  fixture creation, on the same fingerprint and without overlapping model work.
  Its failure report and service logs are retained privately. Acceptance runtime,
  production code, and existing bounds are unchanged from the main baseline.
  At that checkpoint the required repository gate remained open. Those failed
  attempts are retained, and no unrelated host process was altered.

## User-approved acknowledgment budget

The follow-up adds `--local-ack-ms`, forwarded by `verify` to acceptance. The
default remains 2,000 ms; this qualification explicitly uses 10,000 ms. The
selected budget is logged and written to `configuration.json` before execution,
and included in successful reports, failure reports, and the final summary.
Actual measurements remain recorded. Incorrect receipts, replica attribution,
missing effects, durability, and recovery assertions still fail; UI visibility,
restart, convergence, and native bridge dispatch bounds are unchanged.

```sh
npm run verify -- --local-ack-ms 10000
```

The acceptance-only follow-up fingerprint was
`e360ddbcce8f5945abdd13112f1b8fe0151b8da8ab13920eb6b9d2d0696990e7`.
At that checkpoint, compared with the real three-agent candidate, only `scripts/acceptance.js`,
`scripts/verify.js`, `support/acceptance/expected-operations.js`, and
`test/acceptance-components.test.js` changed among fingerprinted files. Production
bridge code, the real-agent rehearsal, and its support/coordinator files matched
the recorded real run exactly. The later independent-review corrections require
a fresh model run and verification. Five focused component tests passed, including budget
validation and continued rejection of incorrect or incomplete effects.
Both CLI entry points also rejected an invalid zero budget before launching
verification or services.

The earlier complete command above exited zero: production UI build, all 292 tests,
and one full seed-1 scenario passed. The scenario retained 100 tasks, 400
comments, and 200 scripted schedules, then verified all 719 acknowledged
operations independently on each of the three replicas. Their snapshot hashes
matched. The selected bounds in configuration, report, and summary agree;
the report hash was recomputed successfully, the source fingerprint matches,
and cleanup had zero errors.

| Measured observation | Maximum | Declared bound |
| --- | ---: | ---: |
| Local operation acknowledgment | 5.621 s | 10 s |
| Offline UI visibility | 1.305 s | 2 s |
| Offline replica restart | 2.320 s | 5 s |
| Replica convergence | 3.708 s | 10 s |
| Agent effect acknowledgment | 0.270 s | 10 s |

Private evidence is retained at
`output/acceptance/2026-10-06T23-33-44.093Z/`, alongside the full command log.
The original 2-second acknowledgment performance target remains unqualified on
this host; optimization is deferred as authorized.

## Current-candidate native qualification

Run `16bf233e-ed84-422a-b84a-ed493342fad6` passed on fingerprint
`999dd55d83f1f8ab4f15f027a161347cbd9efbc6bf22a5362c220f12ac1eae82`.
The builder and two reviewers were actual native Codex sessions, with separate
Actors and worktrees under the same inspected policies. Both initial assessments
referenced immutable commit `3b9e49534a0878c3ee6ead2d4e88d48cef195567` before
the automatic correction. Both reviewers subsequently approved the same final
commit `1924e50a78b46cf589c5a86f0bd05a03adf63cf7` before the parent reached
human review. The fixture required independently created reviewer tests and
retained native command history, attributed results, and external verification.

There were 13 distinct accepted turns: eight builder, three reviewer-a, and two
reviewer-b. Retained native histories confirm all 13 completed, with all sessions
idle. All 13 corrected timing rows identify their actual durable context,
submission, accepted reply, and receipt in order. Two lack a live completion
event after restart and retain `null` completion timing; native histories are
used separately to establish completion rather than inventing timestamps.

Every reported functional gate passed: task/policy blocking, accepted-reply-loss
reconciliation after restart, busy queued work surviving restart, duplicate
results/notifications, stale old-SHA rejection, automatic correction, both final
approvals, independent real tests, and the human-review queue. Five seconds of
idle observation requested zero model turns. The script recorded no operator
interventions, no read retries, and zero cleanup errors. Initial dispatch was
**268 ms** within the unchanged 2-second bridge bound; the workflow was
**430.514 seconds** within the unchanged 20-minute model budget. This bounded
same-host fixture does not establish hosted/Desktop wake-up or human acceptance.

The separate real approval probe `6dea05df-9e44-4cd1-bf48-e41eeb33fc92` passed
on that same fingerprint. Its read-only Luna/low session made a real approval
request, queued work stayed blocked, policy was preserved, the marker was never
written, and its own thread was interrupted and archived. All five gates passed
with zero cleanup errors. No request was answered or permission changed; human
approval and resumption remain unqualified.

## Current-candidate verification history

The clarified candidate fingerprint is
`999dd55d83f1f8ab4f15f027a161347cbd9efbc6bf22a5362c220f12ac1eae82`.
The standard `npm run verify -- --local-ack-ms 10000` attempt passed the production
build and 297 of 298 regressions. An unchanged native-broadcast runtime test
exceeded its 15-second deadline while stopping its hub, and its asynchronous
teardown remained stalled. Only that verified test child received SIGTERM; the
runner reported one timed-out cancellation and exited one before acceptance.
This is not a passing repository gate on the current candidate.

A complete verification with one test file at a time exited zero: the build,
all 298 tests, and complete seed-1 acceptance passed. It ran
the production build, `node --test --test-concurrency=1`, and seed-1 acceptance
with the declared 10-second acknowledgment budget. Assertions, individual test
deadlines, and acceptance recovery/visibility/convergence bounds are unchanged.
The altered scheduling tests a contention hypothesis; the specific cause of the
standard-profile timeout is not established. Both profiles and their provenance
are retained separately.

All 719 operations were independently verified on each of the three replicas;
their snapshot hashes matched
`3f981e264f0b992559356584cd20428fa9ce182da195b8b03e3bf42ce580644c`.
Configuration, report, summary, and the unchanged candidate fingerprint agree.
No cleanup-error report was produced. Private evidence is retained in
`output/acceptance/2026-10-07T01-30-25.454Z/` and the serial verification log.

| Current-candidate observation | Maximum | Declared bound |
| --- | ---: | ---: |
| Local operation acknowledgment | 1.040 s | 10 s |
| Offline UI visibility | 0.077 s | 2 s |
| Offline replica restart | 2.386 s | 5 s |
| Replica convergence | 2.276 s | 10 s |
| Agent effect acknowledgment | 0.147 s | 10 s |

Those samples were below two seconds, but this invocation declared ten seconds.
The earlier strict failures are preserved; this serial invocation establishes no
repeatable two-second performance qualification. The subsequent default parallel
verification is recorded separately below.

## Parallel teardown diagnosis and canonical verification

The exact earlier failure was `test/workspace-runtime.test.js:194`,
"broadcasts native replica changes to every UI subscriber and rejects JSON
mutations": `test timed out after 15000ms`, observed at 15007.862 ms while awaiting
`hub.stop()`. Its abort diagnostic reported both WebSocket-server fields absent,
which is consistent with reaching the later runtime shutdown step; no retained
trace identifies the exact pending promise. The original 297-pass/one-cancellation
log, ownership evidence, and scoped SIGTERM intervention are retained unchanged.

Diagnosis exported unchanged main `d1d1b91fe97388438716bc95541b7e7135b29bdd`
into an isolated directory and used the same task-owned dependencies, Node
24.11.1, built UI, inherited environment, default `node --test` scheduling, and
unchanged individual deadlines. Base and candidate ran sequentially, without
native qualification overlap or changes to unrelated processes. The 16 local
modules in the runtime test's static import path, along with the dependency lock,
are byte-identical. The suites differ because the candidate adds its regressions;
historical host conditions cannot be recreated exactly.

| Default parallel invocation | Result | Affected test |
| --- | --- | ---: |
| Unchanged main | 280 passed; zero failures/cancellations | 247.468 ms |
| Current candidate diagnostic | 298 passed; zero failures/cancellations | 342.116 ms |
| Current candidate canonical verification | 298 passed; zero failures/cancellations | 395.312 ms |

The timeout reproduced on neither base nor current candidate. No direct source
edit lies in the failed runtime path, but indirect test contention, host load,
and the historical cause remain unresolved. The comparisons do not prove an
environmental cause or establish repeatability. No source fix, scheduling change,
deadline relaxation, or process intervention was used for these passing runs.

The actual canonical command `npm run verify -- --local-ack-ms 10000` then exited
zero after 176.466 seconds: production build, all default parallel regressions,
and complete seed-1 acceptance. It verified all 719 acknowledged operations on
each of three replicas. An offline audit independently reconstructed the expected
operations from the saved original intents/receipts, checked the snapshot, and
matched all three reported verifications. Their snapshot hash is
`1edc9019f066ab5c3f4c668c16f41aed36bc646765a3618d0dbc7c0b831542a4`.
The report hash, selected bounds, and unchanged `999dd55d` candidate fingerprint
match; cleanup had no error artifact and the runner recorded no intervention.
Private evidence is retained at `output/acceptance/2026-10-07T01-52-28.026Z/`
and in the isolated comparison logs/audit outside the repository.

| Canonical acceptance observation | Maximum | Declared bound |
| --- | ---: | ---: |
| Local operation acknowledgment | 0.841 s | 10 s |
| Offline UI visibility | 0.139 s | 2 s |
| Offline replica restart | 2.952 s | 5 s |
| Replica convergence | 2.384 s | 10 s |
| Agent effect acknowledgment | 0.172 s | 10 s |

The canonical gate now has an observed pass on the qualified native candidate.
The earlier default failure remains disclosed, and its underlying shutdown race
or environmental condition is not diagnosed conclusively. Strict repeatable
two-second acknowledgment performance remains deferred as authorized.

Between runs, the operator corrected the harness timeout, aligned artifact
filenames, and narrowed the ambiguous UI-test locator, then started fresh runs.
There was no manual forwarding of routine review messages. Fault injection,
bridge restarts, duplicate/stale result probes, and initial kickoff are declared
script operations. They are not counted as real agent participation. The model
requests, command execution, independent test creation, attributed results, and
accepted turns are retained separately as private evidence.

## Boundaries

Human acceptance remains pending; the automated endpoint is a parent task in
`review` assigned to the human with both named final-SHA approvals. These fixture
approvals do not approve the Pardner implementation diff. Independent source and
evidence review is recorded separately for this local patch; human acceptance
and publication remain separate.

Separate-machine execution, existing Desktop/hosted-chat wake-up, hub-loss
recovery, quota routing, multi-user authorization, other adapters, one-hour idle
observation, a usable human approval-and-resume client, and real missing/ambiguous
history reconciliation remain unqualified. Existing protocol regressions cover
some of these failure states; they do not substitute for real execution.

Full runtime directories, inboxes, credentials, session histories, account
information, and local infrastructure details remain private. Publish only this
curated report after review, not raw runtime data.
