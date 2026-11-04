# Security integration for the dogfood candidate

Assessment date: 2026-11-04. Base: `bd55f246bacae5068b761c999e7b849501e7a5e3`
(current `origin/main` when fetched). Branch: `t3/selfhost-security-integration`.
This is a schema-4 source candidate, not an installed runtime or a merge recommendation.
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
- PR88 missed bridge replica fixtures and main's newer in-flight-ack shutdown
  fixture. They now supply explicit disposable replica credentials; assertions
  and timing bounds remain unchanged. The original 20-second LAN integration
  bound is restored instead of carrying PR80's historical increase to 60 seconds.
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
companions, have no independent database and need that service. Existing enrolled
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
Model execution, acceptance of the reviewed mapping and conformance checks remain
pending the reserved verification slot. The old mapping is intentionally not
silently marked current. Bounded-model results cannot prove the implementation,
merge semantics, power-loss durability or real-provider behavior.

## Fresh validation and Qualification

Routine outcome: **incomplete**. Overall outcome: **incomplete**.
Merge recommendation: **blocked** pending required checks and qualification.

Fresh environment: macOS, Node 24.11.1 for checks/build. Root/UI dependency installs
are symlinked from the existing checkout; both lockfiles were byte-compared and
match. No dependency pins were changed. Source/built-UI fingerprint before the
pending heavy batch: `7a533ebc8f73877a5763afda876e44535d1b90f27ad9351ed1701e2bcae1aa2f`.

- `npm run ui:build`: passed (364 modules).
- Watchdog-supervised `node --test test/lan-access.test.js test/private-state.test.js`:
  9 passed, 0 failed/cancelled/skipped. This covers pairing budget units and private
  state modes/link rejection, not HTTP isolation or browser behavior.
- `git diff --check`: passed during preparation; repeated before publication.
- `npm run verify:model`: expected drift, exit 2; model exploration did not run.
- Three nonblocking lock attempts exited 75 without starting a child suite.
  Coordinator then reserved security after collaboration. No competing test
  processes were started and the lock file was not unlinked.
- Browser/security integration regressions, actual QR loading, affected scripts,
  model checks and `npm run verify`: **pending**. No browser launch/visual pass,
  full-suite pass or acceptance pass is claimed.

Routine tier: security-specific regressions; `test:qualification`, `test:runtime`,
`test:cli`, `test:ui`, `test:control-runtime`, `test:verification`; lifecycle check;
then `npm run verify`. Deliberate tier: `npm run test:acceptance -- --repeat 20 --seed 1`,
required and requested, pending passing routine prerequisites. Run the declared
batch under the exclusive advisory lock and watchdog, preserving failures and
candidate identity. Release to cloud at completion or investigated failure boundary.

Semantic qualification review: conflict/merge rules **no**; operation identity
**no** (PR86 excluded); persistence ordering/offline reopen promises **no** but
private storage paths/credentials affect their prerequisites; delivery authority
**yes**, local cleanup approval changes effects/replay admission; transport/
enrollment **yes**; milestone completion claim **no**; weakened measurement **no**.
The additive Markdown test entry measures browser privacy, with no removed test
or changed command option. Path-triggered storage/admission obligations remain.

Local artifacts: `output/verification/security-integration/` contains fetched PR
metadata/diffs, plan, source fingerprint and light-check/watchdog logs. Historical
PR reports remain historical. No paid real-agent rehearsal, human acceptance,
physical-device exercise, live cutover or power-loss test occurred.

## Recommended runtime gate

Do not deploy this draft or close source PRs on the strength of its historical
reports. Select the exact combined source/schema with runtime and reliability,
preserve the old install, and obtain fresh applicable regressions plus the
20-seed qualification on that immutable candidate. Before shared-token execution,
retain #85 local cleanup approval and #88 separation of API/native authority.
Before companion use retain #80–82 and #87; before development-server use retain
#83; private state modes from #84 apply to local execution too. Even a local-only
control pane can display untrusted authored content and trigger privileged work.
No security fix is waived merely because the service binds loopback.
