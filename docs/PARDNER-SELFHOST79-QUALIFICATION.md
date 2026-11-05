# Issue #79 package: integrated automated qualification

The offline qualification package passed its scoped automated gate on Node
24.11.1, macOS arm64. This qualifies the tooling for review/merge; it does not
complete [#79](https://github.com/depatchedmode/pardner/issues/79), authorize live
access/spending, or establish human acceptance.

## Candidate and provenance

- Original PR104 source: `9abaafd4fad328ebdde295e2e17d754fdf8090eb`.
- Fetched/merged main: `0e62bf7b4651d0e04f616d33344ae811e5043a94`, including the
  coordinator-approved runtime, security, reliability, collaboration and Cloud
  integrations. The remote PR104 head matched the original local head.
- Source tested after reconciliation: `3117fcda5e4d353f2a166f642f49c00180229b9b`.
- Before/after source/test/lock/built-UI fingerprint:
  `8ca60d08e1ed49e97e5a32da14f9c724b40f70ea6df5bfc91e7b0b46ac0f599d`.
  Every fingerprint field matched. Subsequent qualification documentation does
  not change those source bytes.

The merge preserved both planner groups without conflict. The diff against
merged main contains only selfhost79 scripts, fixtures/tests, its narrow planner
classification and documentation. No production adapter, workspace, bridge,
security, UI, runtime guard, acceptance policy or lifecycle model file changed.
No overlays were applied. Reused dependency installs matched both lockfiles:
root `b40167effb550fd7feb01a85876c273f3fb2eedb76ad3be7dcdd1ee8704d592c`,
UI `ad58b07b1d9fbbcf8eb8a18ad5d4658b00442e04922026c813527b5a54a65649`.
The dependency symlinks are environment-only and not committed.

The [curated evidence](evidence/selfhost79-integrated.json) records commands,
counts, outcomes, fingerprint, cleanup and live boundaries. The
[complete candidate hash inventory](evidence/selfhost79-integrated-candidate.json)
identifies the source, tests, locks and actual built UI. Private logs, plan,
watchdog records, before/after fingerprints, semantic review and acceptance audit
remain in `output/verification/selfhost79-integrated-2R9kxF/`. Raw acceptance
traces and receipts stay private; none were copied into public evidence.

## What changed and what was exercised

The independent checker reads immutable Git objects, enforces the one-file
fixture boundary, and runs B/C assertions outside candidate checkouts. Tests
reject false agent success, changed checker/probe/seal, mutated B history,
nonsemantic C, branch refs, symlinks, overwritten evidence and nontermination.
C demonstrably fails on B and passes on C while preserving B behavior.

The new offline Cloud binding CLI compares a separately pinned controller
snapshot with a separately pinned independent checker receipt. It verifies
capture integrity, exact execution/context/agent/run identities, commit, actual
diff/test bytes and artifact sizes/hashes. Tests use the merged
`CursorCloudExecution` and scripted transport, real disposable Git commits and
actual independent checker receipts. They retain B through C and controller
restart, reject internally rehashed false claims/wrong identities, and preserve
manual intervention separately. Human verdicts are never inferred or imported
as authenticated acceptance. No live provider was used.

The runbook now describes schema-5 `requestId` versus stored `operationId`, the
current Cloud capture contract (including cancelled A's capture prerequisite),
and preserved security/bridge/runtime boundaries. The helper only consumes
snapshots; it neither dispatches nor writes provider/controller state.

## Commands and tiers

One nonblocking acquisition of the stable
`/tmp/pardner-selfhost-heavy-tests.lock` covered build, browser preflight and the
entire child-process batch. Each stage used the existing watchdog with a 900s
outer bound. No assertions, timing bounds or retries were changed. All stages
completed on their first integrated qualification attempt.

| Tier | Command | Result |
| --- | --- | --- |
| preparation | `npm run ui:build` | passed |
| preparation | Pinned Playwright Chromium/WebKit launch and close | Chromium 151.0.7922.34 (1234), WebKit 26.5 (2336), passed |
| routine | `node --test test/selfhost79.test.js test/selfhost79-cloud.test.js test/cursor-cloud.test.js` | 39/39, no skips (10 checker, 3 binding, 26 Cloud contract) |
| routine | `npm run test:verification` | 39/39, no skips |
| routine | `npm run test:runtime` | 120/120, no skips |
| routine | `npm run verify` | 565/565 Node tests, 17/17 Python tests, one acceptance seed, no skips |
| deliberate | `npm run test:acceptance -- --repeat 20 --seed 1` | not required by this scoped diff; not run |

The mechanical planner selected verification/runtime, the two proof test files,
and full verify, with no warnings, unknown paths or qualification triggers. Cloud
contract fixtures were added to the focused command because the new binding uses
that seam. Full verify included actual non-loopback LAN Chromium/WebKit checks,
pairing/recovery, Cloud control UI and model/conformance coverage. No visual UI
change was made here; no new UI screenshot or physical-device claim is made.

All six semantic qualification questions were answered **no** relative to the
merged baseline: this package changes no conflict semantics, operation identity
or retries, persistence barrier/offline reopen, delivery/lease behavior,
transport/admission/recovery guarantees, milestone-completion claims or existing
measurement. It adds offline evidence checks. Thus no standalone 20-seed
obligation arises. Lifecycle mapping/implementation bytes are unchanged from
main; the runtime suite exercised the bounded model and conformance checks,
without claiming a new standalone model qualification.

## Acceptance audit and limits

The one seed's candidate hash equals both fingerprints. Its snapshot is schema
5. A post-run read-only audit independently reconstructed expected operations,
checked all 719 receipts' incoming request keys against `requestId`, checked their
content-derived stored `operationId` and saved events, and reran expected-effect
verification. All three reported replicas had the same 719 operations and hash
`efded3a90d30fe7205660399d63dbfaabc81e9d1eb7d5ba5b860d795b6b0614a`.
Equality alone was not the acceptance criterion.

Observed single-seed maxima (not performance benchmarks or a 20-seed result):
local acknowledgement 251.195 ms, agent-effect acknowledgement 162.996 ms,
UI visibility 45.082 ms, offline restart 2,042.366 ms, convergence 3,225.180 ms.
Current policy remains acknowledgement 2,500 ms, UI 2,000 ms, offline 6,000 ms,
convergence 10,000 ms. Pairing locator 5,000 ms and helper startup 15,000 ms remain
unchanged. Historical unexplained failures remain recorded/open in
[#107](https://github.com/depatchedmode/pardner/issues/107) and
[#108](https://github.com/depatchedmode/pardner/issues/108) under the owner's
explicit deferrals. No new failure occurred or was waived in this batch.

## Cleanup, verdict and remaining scope

Every watchdog recorded exit 0, no timeout, no hung/surviving processes and no new
scratch directories. A post-run read-only PID audit found none of the batch or
stage parents remaining. The lock was released after children drained; the stable
file was not unlinked. No unrelated process was killed, and no active data,
credential, mapping, service, deployment or installed schema was changed.

Routine outcome: **passed**. Overall outcome for this offline package:
**passed**. It is ready for the coordinator's exact-head review/merge; this
thread does not merge it.

The six real A/B/C attempts, two isolated real-provider T3 crash probes, native
human approval, independent live artifact acceptance and actual human verdict
remain **not run/not recorded**. The USD100 cap and replacements remain proposals.
A compatible fresh runtime/workspace, authorized access/spending, human presence,
and durable separately protected checker/evidence storage remain live gates.
Read-only temporary review bundles are not proof of that live isolation. Keep
#79 and the milestone open. See [the runnable package](PARDNER-SELFHOST79.md).
