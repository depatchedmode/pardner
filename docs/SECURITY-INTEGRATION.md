# Security integration for the dogfood candidate

Assessment date: 2026-11-04. Current base: `1f484062b2d3fe99b9e318a56786ea72413f69f3`
(actual main after #103). Initial source review used `bd55f246bacae5068b761c999e7b849501e7a5e3`.
Branch: `t3/selfhost-security-integration`. This schema-4 source candidate has passed
the post-#103 automated gate below; the coordinator owns the exact-head merge. It is
not an installed runtime.
The historical schema-2 installation remains untouched. PR86's schema-5 candidate
belongs to reliability and is not incorporated here.

## Source dispositions

All eight actual heads were fetched and reviewed against main before integration.
GitHub reported no status checks for these heads. Their descriptions contain useful
historical focused evidence but unresolved broader failures; none is reused as a
fresh pass. Original branches are unchanged. Proposed disposition for each is
**supersede through this integration after review and qualification**, not close now.

| PR | Exact source head | Integration commit | Relevant exposure and preserved fix |
| --- | --- | --- | --- |
| [80](https://github.com/depatchedmode/pardner/pull/80) | `fd9fb3c9952790adf7d476de7f4cca1d8e53aeef` | `0390d9fc` | Companion pairing: one socket source cannot exhaust other devices' budgets. Ten admitted attempts per address, 100 global per minute; forwarding/Origin headers do not choose identity. Shared NAT addresses still share a budget. |
| [81](https://github.com/depatchedmode/pardner/pull/81) | `ccc9220a85dfade6b54e0623297f20b4e5913709` | `43ac054c` | Local and companion viewers: Actor-authored Markdown cannot load tracking images. Alt text, image CSP and no-referrer links remain; QR images must still load. |
| [82](https://github.com/depatchedmode/pardner/pull/82) | `9f0b3e425280262ca7d948e024976fa201175881` | `03781334` | Authenticated control UI: framing is denied, including redirects/errors. Existing Express CSP directives are preserved. |
| [83](https://github.com/depatchedmode/pardner/pull/83) | `f8a93287e3abdf5e9a02c040ce50479f15507301` | `6229de88` | Development server: loopback binding, UI-only filesystem allowlist and secret/state path denials. Runtime data must stay outside the UI/public tree; overriding host remains unsupported. |
| [84](https://github.com/depatchedmode/pardner/pull/84) | `14972a39fac313576ba021deecda73bced4d7c2a` | `60bb3d87` | Local accounts: workspace/trace directories 0700, runtime/delivery SQLite and trace files 0600, existing sidecar repair and unsafe final-link rejection. POSIX modes do not establish ACL or Windows guarantees. |
| [85](https://github.com/depatchedmode/pardner/pull/85) | `f4bcb0036f09c9563f6e7e0c940af51281cf2d51` | `7cc65a88` | Shared-token task closure must not authorize privileged thread archival/worktree moves. Private local approval binds OS user, workspace, replica, mappings, destination, task content and revisions; rechecked before each remaining effect. |
| [87](https://github.com/depatchedmode/pardner/pull/87) | `6ff16d25e1fc022323d5c9397392403e19505e49` | `26c9c58b` | Accidental unauthenticated exposure: empty-token listeners require explicit insecure opt-in and numeric loopback at construction/start/listen. Saved LAN configuration stays inactive without a token. |
| [88](https://github.com/depatchedmode/pardner/pull/88) | `47db5daa99b4fefb28515686825f077b009ee130` | `13e2245d` | API/shared-token clients cannot open raw native document writes. Separate enrolled replica credentials mint native-only, expiring, single-use tickets. Enrollment grants full-writer trust, not per-operation attestation. |

PR88 is a merge head; its delta was taken relative to its main parent
`07a71f2b831a938a6f7de6cb9fa91b5c1420c6ce`, preserving the native-validation
integration already in that head. This did not import unrelated old-main changes.

## Reconciliation and dependency map

- `package.json`: retain every current-main runtime, CLI and control-pane UI test,
  adding Markdown privacy coverage. No current tests removed.
- `automerge-sync-server.js`: framing headers are installed synchronously before
  the existing stopping rejection; retain its 503/Connection-close behavior.
  Listener host validation precedes the existing idle-connection reclamation hook;
  retain the hook and main's listener-before-store shutdown order.
- `test/bridge-review-regressions.test.js`: retain both main's comment content/
  revision authorization check and PR85's shared-token cleanup refusal check.
- PR87/88 semantic conflict: insecure HTTP/UI remain available only on loopback,
  but native sockets still reject anonymous upgrades and require enrolled tickets.
  IPv6 test helpers now correctly bracket URL authorities and strip brackets for
  the Node HTTP hostname option.
- PR88 missed bridge replica fixtures, main's newer in-flight-ack shutdown
  fixture, the malformed-CBOR fixture and the native smoke-command fixture. They now supply explicit disposable replica credentials; assertions
  and timing bounds remain unchanged. The original 20-second LAN integration
  bound is restored instead of carrying PR80's historical increase to 60 seconds.
  Malformed payloads are still checked individually against the only admitted
  transport (enrolled native tickets); the API-token/UI-ticket refusal cases live
  in `native-replica-auth`. No malformed-message assertion was removed.
- The first combined focused run exposed an IPv6 credential parsing defect:
  interpolating `::1` into a URL base made query parsing fail and rejected valid
  native tickets. Commit `509a835` uses a fixed base for query extraction, with
  explicit IPv6 UI/native ticket and legacy UI-token coverage. Native API-token
  rejection remains asserted. The diagnosed run (101/102) is retained alongside
  the repaired run (103/103).
- PR81's generic data-image test alone did not prove that the actual pairing QR
  loads. The existing both-engine phone flow now requires `decode()` and nonzero
  width. That is image loading, not QR payload decoding or camera scannability.
- The verification map classifies private-state helpers as persistence and replica
  credential fixtures as transport. Its feature entries identify the new checks.
- **Collaboration/PR70:** agreed interface is additive `context_persisted_at` inbox
  persistence, queued-prompt refresh, status timing, and rehearsal support. Keep
  those changes alongside PR85's approval table, status and CLI commands; do not
  auto-approve cleanup in production or remove main's comment binding. Shared
  paths are `agent-bridge`, `bridge-inbox`, bridge docs/tests and rehearsal support.
  This branch does not contain that track's changes or qualify their combination.
- **Reliability/PR86:** exclusive external ownership. Its operation ID becomes a
  content-derived stored identity while `requestId` retains the caller retry key;
  schema 5 rejects/preserves schema 4 stores. Shared reconciliation includes
  `test/workspace-runtime.test.js` and lifecycle mapping (security changes server/
  runtime hashes; reliability changes workspace hash). Re-review/recompute the
  mapping on the final union rather than choosing one mapping file. Neither native
  enrollment nor this security pass fixes collision semantics.
- **Runtime:** owns deployment/schema selection and credential provisioning. No
  live data, credentials, mapping, launch job or service was changed by this work.

## Local-first and trust decision

The local service still owns the persisted replica. Browser pages, including LAN
companions, have no independent database and need that service. (Since the client
cutover the board opens only through the local client, and the LAN companion is
the client's opt-in [phone companion](PARDNER-LAN.md); this decision is unchanged.) Existing enrolled
replicas can reopen/save offline; online sync now additionally needs an enrolled
replica credential. The hub remains required for enrollment and new delivery
leases; accepted work may continue saving locally during a hub outage.

No routing protocol or peer discovery is introduced. Direct native WebSocket
access to a deliberately reachable trusted hub is practical on LAN and already
supported; it gets the same enrollment boundary. Arbitrary peer-to-peer meshes
are not enabled: browsers are not replicas, no discovery/NAT traversal or mesh
admission registry exists, and delivery authority still resides at the hub.
Adding that infrastructure is outside the credential-boundary fix. Neither this
assessment nor loopback tests establishes WAN reachability.

An administrator must provision distinct replica secrets and restart the hub on
rotation/removal to drop existing sessions/tickets. Offline copies cannot be
revoked retroactively. Recovering a replica requires its persisted directory and
private connection/enrollment credentials; replacement hubs need workspace state
and a deliberately provisioned registry. Synchronization is not backup. Existing
incompatible directories must be preserved, not migrated or deleted here.

Ordinary API credentials still confer shared workspace/API authority, with
existing control route restrictions; they are not per-Actor authentication.
Native credentials explicitly trust the holder with raw full-document changes.
Cleanup approval is local OS authority, not authority conveyed by a task author.
The bridge must be stopped for approve/revoke; no actual cleanup was authorized
or exercised against a user's worktree or thread.

## Lifecycle review

The initial `npm run verify:model` detected expected whole-file drift in the
server and runtime (exit 2, no missing anchors). Reviewed actions: Arrive,
UpgradeArrive, ReplicaEdit, SyncDown, ReplicaSendAck, StopBegin,
IdleConnectionEnds, Handle, Respond, ReclaimIdle, ListenerClosed, StoreCloseBegin,
StoreCloseComplete, ReplicaReceive and ReplicaAckCommit.

Headers do not yield before the stopping guard. Host validation occurs before
listeners open; authorization narrows admitted native traffic. Credential fields
and ticket requests do not change local persistence, ack snapshot guards, flush
queues or shutdown ordering. The model already assumes an enrolled replica and
excludes credential/ticket/pairing internals, so no model action change is proposed.
The reviewed mapping was refreshed against source revision
`509a8357a4ef0197825eacf70a5d7a5504fb1795`. The fresh default model check passed
174,614 states and 679,456 transitions, all four invariants, shutdown progress and
all ten coverage witnesses. Runtime conformance checks passed with the runtime
suite. Historical wider-bound and mutation runs were not repeated. Bounded-model results cannot prove the implementation,
merge semantics, power-loss durability or real-provider behavior.

## Historical standalone validation before #103

The reserved batch uses Node 24.11.1 on macOS with matching root/UI dependency
lockfiles and pinned Chromium/WebKit. Dependencies are symlinked from the existing
checkout; no dependency pins changed. Candidate source/build/test fingerprint:
`b6aabf2afe479f4512483e9ece1ea0802c394f1e00f12716d75197cf671d0881`.
Source revision after repairs: `b2dd0df` (mapping records mapped source `509a835`).

| Check | Fresh result |
| --- | --- |
| UI production build | Passed, 364 modules |
| Initial light pairing/private-state units | 9 passed |
| Combined security regressions after IPv6 repair | 103 passed, no skips |
| Remaining native protocol/smoke/admission callers after enrollment repair | 10 passed, no skips |
| Browser privacy visual exercise | 2 passed; Chromium and WebKit screenshots inspected |
| Verification tooling | 39 passed |
| Storage/conflict/ticket regression (`test:qualification`) | 12 passed |
| Runtime, including lifecycle conformance | 116 passed |
| CLI | 12 passed |
| UI/companion, including actual QR image decode | 14 passed; no LAN/browser skips |
| Controller runtime | 14 Python tests passed |
| Lifecycle model | 174,614 states; all properties and witnesses passed |
| Full `npm run verify` | Passed: 480 Node tests, 14 Python tests and one complete acceptance seed |
| 20-seed acceptance | Passed seeds 1–20 in one run; candidate stable |

All listed successful test commands exited zero with no cancelled/skipped tests,
with full verify now complete. Original PR reports remain historical.
The initial focused run failed IPv6 ticket admission (101 passed, 1 failed), repaired
in `509a835`. The first full verify passed 478/480 Node tests but failed two stale
native-auth fixtures; it did not reach acceptance. Commit `b2dd0df` enrolls those
fixtures. Logs retain both failures and their successful targeted reruns; no timeout,
latency bound or admission requirement was relaxed. The final full discovery covers
all these tests together on the repaired candidate.

The privacy visual exercise reuses the Markdown regression in an external probe
with only import paths and screenshot capture adapted. Both screenshots show alt
text, readable Markdown formatting and an explicit link, without credential entry
fields; DOM/network assertions also passed. Pairing checks decode actual QR images
in both engines, without claiming QR payload/camera verification or physical devices.

Routine tier: security regressions, planner scripts `test:verification`,
`test:qualification`, `test:runtime`, `test:cli`, `test:ui`, `test:control-runtime`,
lifecycle check, then `npm run verify`. Deliberate tier:
`npm run test:acceptance -- --repeat 20 --seed 1`, required and requested. Routine outcome: **passed**. Standalone qualification and overall verification
outcome for the recorded candidate: **passed**. At that checkpoint, ordered merge readiness was **pending** for the post-#103
integration gate. That standalone result could not certify the later union;
`needs-qualification` was retained until the fresh gate recorded below.

The single 20-seed attempt completed in 2,506.189 seconds with all reports for
seeds 1–20, successful scenario outcomes, no failure records, and the same source/
built-UI fingerprint before and after. Observed maxima (not threshold values):
local acknowledgement 1,703.723 ms (14,220 observations), convergence 2,832.040 ms
(200), local UI visibility 104.157 ms (40), offline startup 3,544.665 ms (20), and
agent-effect acknowledgement 151.312 ms (70). All asserted contract bounds held.
The summary is in `output/verification/security-slot-1/qualification-summary.json`;
private originals are in `output/acceptance/2026-11-04T16-58-57.608Z/`.

Final qualification cleanup found no watchdog survivors, unverified processes or
new scratch directories. The driver exited normally, releasing the stable lock
without unlinking it. Runtime received the handoff as requested by the updated
merge order (#103 → #102 → #106 → #101 → #105 → #104); Cloud was not resumed by
this handoff. No rebase or merge occurred during the frozen run.

The stable advisory lock file was held during all heavy children. The model batch's
interactive driver initially released on an empty line; it reacquired nonblocking
before any further heavy work. No heavy work ran unlocked and no handoff was sent
during that gap. Subsequent batch/diagnostic children share the retained lock.
Watchdogs retained exact commands, deadlines, exits and cleanup records. The failed
native fixture left one disposable `pardner-public-test-wxlgiW` directory; after
confirming no watchdog survivors and no open files with `lsof +D`, it was removed.
No unrelated process or directory was touched.

Semantic qualification review: conflict/merge rules **no**; operation identity
**no** (PR86 excluded); persistence ordering/offline reopen promises **no** but
private storage paths/credentials affect their prerequisites; delivery authority
**yes**, local cleanup approval changes effects/replay admission; transport/
enrollment **yes**; milestone completion claim **no**; weakened measurement **no**.
The additive Markdown test entry measures browser privacy, with no removed test
or changed command option. Final planner has no unclassified paths.

Local artifacts: `output/verification/security-integration/` retains preparation
and original-head metadata. `output/verification/security-slot-1/` retains the
reserved batch logs, fingerprints, plan, external visual probe, screenshots,
watchdog records and cleanup note. Raw acceptance artifacts remain private under
`output/acceptance/`; no raw trace or credential is published. No paid real-agent
rehearsal, human acceptance, physical-device test, live cutover or power-loss test
occurred.

## Post-#103 qualification for the current candidate

Actual target main: `1f484062b2d3fe99b9e318a56786ea72413f69f3` (merged #103 head
`8d359be6346ea4c04236866b69381e3ee5f03b91`). Merge commit
`e7ff4264fb0437cca640191e5176342285054c59` preserves both main and prior security head
`735a9acf8ae29bb6524c22cf82efb2e6779e4c5e`; it applied cleanly. No other track
union is included. The changed fingerprint inputs are exactly
`scripts/control-runtime.py` and `test/control_runtime_test.py`. Schema remains 4.

The imported controller guard reads the selected release's literal schema and
manifest without loading application code or opening old storage. Its disposable
regressions verify rejection of unknown/incompatible schemas before seal/start
and before stopping for restart, while preserving existing bytes. This changes
recovery/start prerequisites, so it required fresh qualification. It is not a
dependency-integrity sandbox. The four mapped lifecycle source files and mapping
are unchanged; review found no new model action or drift to accept. The fresh
model and implementation conformance both passed.

The refreshed plan has no unclassified paths. Its merge-head warning describes
integration of the actual target base, not a tooling overlay. Every semantic
answer from the security review remains applicable. The new guard adds a recovery
admission obligation. Node 24.11.1, matching root/UI lockfiles, a fresh 364-module
UI build, and actual launches of pinned Chromium 151.0.7922.34/WebKit 26.5 preceded
all checks. Source, tests, dependencies and build stayed fixed through the batch.

| Tier | Command/exercise | Fresh result |
| --- | --- | --- |
| Routine | Focused security regressions (15 files) | 108 passed |
| Routine | `npm run test:control-runtime` | 17 Python tests passed, including imported guard |
| Routine | `npm run test:verification` | 39 passed |
| Routine | `npm run test:qualification` | 12 passed |
| Routine | `npm run test:runtime` | 116 passed, including lifecycle conformance |
| Routine | `npm run test:cli` | 12 passed |
| Routine | `npm run test:ui` | 14 passed, including real LAN and both-engine QR image loading |
| Routine | External Markdown privacy visual probe | 2 passed; both screenshots inspected |
| Routine | `npm run verify:model` | 174,614 states, 679,456 transitions; all properties and ten witnesses passed |
| Routine | `npm run verify` | 480 Node tests, 17 Python tests and one acceptance seed passed |
| Deliberate qualification | `npm run test:acceptance -- --repeat 20 --seed 1` | All seeds 1–20 passed in one run, 2,406.208 seconds |

All commands exited zero; there were no skipped/cancelled tests or failing test
attempts in this post-#103 batch. Earlier failures and repairs remain recorded
above. All 21 report digests (the full-verify seed and separate 20-seed run) were
checked. The twenty gate reports share the same candidate, successful outcomes,
three matching replica snapshots per seed and the unchanged asserted limits.
Their measured maxima, rather than thresholds, were:

| Observation | Maximum ms | Count |
| --- | ---: | ---: |
| Local acknowledgement | 1,043.212 | 14,220 |
| Convergence | 3,192.733 | 200 |
| Local UI visibility | 95.185 | 40 |
| Offline startup | 2,081.524 | 20 |
| Agent-effect acknowledgement | 174.977 | 70 |

Before/after fingerprint: `402b2719f6b583253fdaa4aae40d16fdc64694de2acd682fb174052169173e65`.
Routine outcome: **passed**. Qualification: **passed for this fingerprint**.
Overall automated verification outcome: **passed**. The remaining publication
edits are guidance/evidence only and leave that executable fingerprint unchanged.
The post-#103 qualification obligation is satisfied; the coordinator owns the
exact-head merge. This result does not qualify a later schema-5/bridge/cloud/proof
union or authorize deployment.

One nonblocking OS-lock acquisition covered preparation, routine tests, the
20-seed child and cleanup. Every watchdog reported zero survivors, unverified
processes and new scratch directories. An additional process/cwd inspection found
only four pre-existing CUA/Xcode tooling processes, all older than the lock driver;
these were preserved. No test orphan remained. The driver exited zero and released
`/tmp/pardner-selfhost-heavy-tests.lock` without unlinking it. No automatic handoff
to another track was sent; the coordinator controls the next slot after #102.

The [public evidence summary](evidence/security-post103-qualification.json) contains
only allowlisted identities, counts, timing measurements and outcomes. Local exact
commands, plan/semantic review, logs, screenshots, fingerprints and process attribution
are in `output/verification/security-post103-1/`. Original acceptance artifacts
remain private in `output/acceptance/2026-11-04T18-30-08.318Z/` and
`output/acceptance/2026-11-04T18-34-59.428Z/`; no raw traces, claim tokens or credentials
are published. No fresh-checkout milestone claim or separate real-agent/human
acceptance is inferred from this automated gate.

## Recommended runtime gate

Do not deploy or close source PRs based solely on this candidate
qualification. Select the exact combined source/schema with runtime and reliability,
preserve the old install, and obtain fresh applicable regressions plus the
20-seed qualification on that immutable candidate. Before shared-token execution,
retain #85 local cleanup approval and #88 separation of API/native authority.
Before companion use retain #80–82 and #87; before development-server use retain
#83; private state modes from #84 apply to local execution too. Even a local-only
control pane can display untrusted authored content and trigger privileged work.
No security fix is waived merely because the service binds loopback.
