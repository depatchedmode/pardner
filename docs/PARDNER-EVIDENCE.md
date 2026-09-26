# Pardner implementation evidence

This records completed checks, not milestone completion. The accepted goal remains
the full local-first human/agent workflow, public UI/CLI acceptance, 20 seeded
acceptance runs, and a prepared two-machine rehearsal. No acceptance gate may be
replaced by these lower-level tests.

## Companion device pairing regression check — 2026-09-26

`npm run test:ui` rebuilt the production browser client and passed all 10 tests,
with zero failures or skips. Coverage includes Chromium/WebKit LAN pairing and
persistent profiles, network failure and credential rotation recovery, replacement
pairing links, late authentication failures after successful re-pairing, bootstrap
errors, same-origin WebSocket proxy writes, and the existing task/comment workflows
with and without `crypto.randomUUID`.

This automated check does not close the physical-phone qualification gaps below.

## Companion device and LAN access — 2026-09-09

Issue #51 implementation on the `7afc80ad` baseline adds saved LAN settings,
desktop pairing, indefinitely remembered shared credentials, My reviews filters,
browser recovery, and configurable WebSocket endpoints. The current credential
storage supersedes the historical tab-only credential description below; pending
operations still use tab storage, scoped to workspace identity.

- `npm run verify`: 258 tests passed, zero skipped, followed by one complete
  acceptance scenario. Report directory:
  `output/acceptance/2026-09-09T19-37-40.009Z`.
- After the connection-validation and listener-deduplication cleanup, the four
  browser-connection tests, all six `npm run test:ui` cases, and 19 focused
  server/LAN/CLI tests passed.
- Mobile Chromium and WebKit ran against this host's actual LAN IPv4 HTTP
  address with `isSecureContext === false`. They paired through the desktop UI,
  reopened persistent browser profiles, preserved Actor/review filters, received
  cross-client updates, retried a lost write response without duplication, and
  recovered after service restart with attributed comments/status intact.
- A local proxy fixture verified same-origin WebSocket-path routing and writes.
  It does not qualify HTTPS certificates or public authentication. Public access
  is tracked in [#56](https://github.com/depatchedmode/pardner/issues/56).
- Desktop setup and mobile review screenshots were inspected. Pairing codes are
  masked in saved setup images under `output/playwright/`.
- **Physical-phone rehearsal is partially confirmed.** The user opened an isolated
  LAN workspace from their phone and reported leaving a comment and reassigning
  its review task. Service readback confirmed the phone comment and a change from
  review to completed, both attributed to `ryan`, with `savedLocally: true` and no
  storage error. After the user repeated the assignment change, readback confirmed
  `ryan` → `builder`, authored by `ryan` at 19:59:10 UTC, with the completed status
  retained and the write saved locally. The user also confirmed closing the phone
  tab and reopening the same address without pairing again, with the remembered
  Actor/filter check passing, but reported that loading felt slow. A Chromium
  measurement from the host through the LAN address reached the workspace in
  275 ms cold and 233 ms warm, and live sync in 313/326 ms; these are not phone
  timings. The trace showed a 350,257-byte uncompressed initial JavaScript asset
  and two sequential configuration fetches. The user localized the delay to before
  the page appeared. A subsequent host-side LAN request took 1,779 ms to receive
  the initial 1,358-byte HTML response; four immediate repeat probes took 17–30 ms
  to first byte (loopback: 3–4 ms). The host reported a one-minute load average of
  285.37 and active sleep-prevention assertions. This supports an intermittent
  delivery/host-contention explanation, but does not establish the phone's cause.
  Device/browser identity and physical restart/reconnect confirmation remain
  outstanding. The procedure
  is in [companion device and LAN access](PARDNER-LAN.md#verification-and-physical-phone-rehearsal).

## Persistence and CRDT qualification — 2026-09-04

Qualified versions: Node 24.11.1, Automerge Repo/network 2.5.1, Automerge 3.2.3.
Automerge versions are pinned in the root manifest and lockfile.

- `node --test test/storage-durability.test.js`: six cases passed. A child process
  persisted 100 attributed operations through repeated snapshot compaction, sent
  a receipt, and was immediately killed with SIGKILL. An independent process with
  no network adapter recovered exactly those operations and heads, saved another
  operation, and survived a second kill/reopen. Fault injection covers failed
  replacement, background-save failure/retry, incomplete temporary files, and
  buffer ownership.
- `node --test test/conflict-qualification.test.js`: three cases passed. Checked
  attributed different-field merges, persisted same-field alternatives, explicit
  resolution with a later concurrent alternative, and Actor-scoped receipt union.
- `npm test` after storage integration: 159 tests passed, zero failures (before
  adding the three CRDT qualification cases).
- `npm run test:gaps` after storage integration: seven tests passed.

The stronger adapter exposed background writes continuing after upstream
`Repo.shutdown()`. `DurableRepo` isolates the pinned storage-subsystem integration,
serializes saves, drains initialization and persistence, and captures background
errors. It does not treat the upstream `doc-saved` metric as a disk acknowledgement.
These tests prove the tested storage cases; they do not yet prove application
offline startup, authenticated reconnect, public-client behavior, or power-loss
durability.

Pre-existing uncommitted README/package changes and native peer scripts were
preserved. No legacy data directory was migrated or deleted.

## Authenticated transport and naming — 2026-09-04

- `npm run test:qualification`: 11 tests passed without forced process exit.
  In addition to storage and conflict checks, a single persistent Repo recovers
  from three socket disconnects with four distinct single-use tickets and zero
  authorization rejections. Shutdown during a pending handshake is covered too.
- `npm test` after the Pardner rename: 163 tests passed (before adding the two
  naming tests and the pending-handshake test).
- `node --test test/pardner-brand.test.js`: two tests passed. A temporary npm
  installation exposes a working `pardner` executable, and the renamed storage
  configuration creates `.pardner` while preserving a pre-existing legacy marker.
- `npm run ui:build`: passed after the UI/package/proxy rename.
- `git diff --check`: passed.

The ticket adapter currently qualifies native transport independently. The
operator peer helper still needs local-first startup and integration with this
adapter. The UI/CLI still need the shared attributed command layer, complete
machine-readable context, handoffs, receipts, conflicts, and durable save status.
The 20-run public-client acceptance gate has not been implemented or executed.

## Attributed operations and local runtime — 2026-09-04

- `npm run test:runtime`: 17 tests passed with natural process exit and no skips.
  Nine shared-operation cases cover explicit human/agent Actors, atomic handoff,
  storage-failure retries, full context, stale revision rejection, attributed
  conflicts, receipts, branch merges, commit evidence, and deleted-comment audit.
  Two ledger cases cover durable claims, response replay, expiry, stale tokens,
  acknowledgements, and permanent cancellation tombstones.
- Six runtime cases exercise authenticated HTTP operations and native Automerge
  transport between persisted services. They cover offline opening under five
  seconds, reconnect, exclusive directory ownership, delayed acknowledgement of
  older heads, native updates reaching both JSON subscribers, and human/agent
  same-field alternatives across a hub outage followed by explicit resolution.
- A subprocess case SIGKILLs the service after task and delivery-claim receipts,
  reopens the same data, verifies the task and original claim token, acknowledges
  delivery, then SIGKILLs/reopens again and confirms acknowledgement replay and
  no redelivery. This uses public HTTP endpoints throughout.
- `npm test`: 183 tests passed before the final shutdown upgrade guard. The legacy
  regression command still uses forced exit; its success is not lifecycle proof.
  The separate runtime command above verifies natural exit after that guard.
- The natural-exit run exposed a shutdown/reconnect race. The server now rejects
  new WebSocket upgrades while stopping and terminates existing native sockets.
  Document broadcasts come from the store change event, including native edits,
  and reach every subscriber. Version 2 rejects legacy HTTP/JSON mutation paths.
- `git diff --check`: passed after the final shutdown guard.

The runtime is currently injected into the existing server in integration tests.
The default server, CLI, and UI have not yet been switched to version 2. The hub's
SQLite delivery ledger is implemented, but the durable agent harness and full
UI/CLI acceptance workflow remain outstanding. These checks do not substitute for
the required two-browser/two-agent scenario, 20 varied seeds, performance fixture,
fresh-checkout verification command, or two-machine rehearsal instructions.

## Default local service and agent-facing CLI — 2026-09-04

The default `AutomergeSyncServer`, `npm run sync`, and `pardner serve` now use
WorkspaceRuntime v2. Startup generates protected local credentials and a
mode-0600 connection file. Reopening that directory restores its role and hub
configuration without enrollment HTTP. New Actors are explicitly registered;
the production runtime no longer invents default agents.

The CLI now uses the shared attributed operation endpoint. Coordination commands
emit one JSON value on stdout, including errors with stable codes and details;
diagnostics and Git output use stderr. Full context, assignee filtering, explicit
revisions, handoffs, comments, conflict resolution, receipts, branches, commits,
and trace lookup have public command paths. Expected revisions are supplied by the
caller, never silently refreshed for a stale write. Agent delivery requests are
forwarded by replicas to the hub ledger; claim, release, and acknowledgement
retain their transactional authority there.

- `npm run test:cli`: 11 tests passed with natural exit. The subprocess workflow
  registers human/agent Actors and completes human → agent → agent → human
  handoffs, delivery receipts, full long context, Actor-specific reads, operation
  replay, and structured stale-write rejection. Delivery tests include release,
  stale tokens, and replica SIGKILL/offline restart before continued agent work.
- Auth/commit CLI regressions were ported to the v2 public contract. They prove
  HTTP and network failures do not open a fallback data store, failed preflight
  does not create a Git commit, successful commits get trace/evidence links, and
  failed post-commit links expose the existing hash and recovery instructions.
- `npm run test:runtime`: 18 tests passed with natural exit, including the new
  case where a comment stays unread until all concurrent revisions are observed.
- `node --test test/mention-lifecycle.test.js test/storage-durability.test.js`:
  22 tests passed with natural exit after the storage file-mode change and legacy
  fixture correction.
- `npm test`: 183 tests passed, zero failures/skips. This still uses the legacy
  forced-exit runner and does not replace the focused natural-exit checks.
- `git diff --check`: passed.

Remaining integration work is explicit: the UI still targets the old mutation
contract; static local UI serving and runtime credential entry are not implemented.
Some older regression fixtures explicitly inject the legacy store while their
scenarios are being reconciled with v2; the legacy store/routes must be retired
before final completion. The full two-browser/two-agent harness, seeded schedules,
independent expected-operation manifest, performance fixture, 20-run acceptance,
fresh-checkout `verify`, and rehearsal guide remain outstanding. The current
service/CLI instructions are in [PARDNER-CLI.md](PARDNER-CLI.md); the README's older
prototype reference still needs consolidation.

## Local browser integration — 2026-09-04

The local service serves the built UI at `/pardner/` and a credential-free runtime
configuration endpoint. The browser accepts a local API token at runtime and
keeps it in tab session storage. It selects explicit human/agent Actors and sends
the same attributed HTTP operations as the CLI. The browser no longer uses the
legacy JSON mutation protocol or a separate Automerge persistence layer; unused
browser Repo/IndexedDB/BroadcastChannel and canvas packages were removed.

The preserved dark task board now includes Actor assignment, full task context,
revision-aware task editing, atomic handoffs, comments, explicit read receipts,
conflict alternatives, history/evidence, and local-save/hub-sync status. An open
draft retains its original revisions when a remote update arrives. Save status
also appears inside mobile task details, and cannot display synced against a
different displayed head set. Unconfirmed requests retain their operation ID in
tab session storage for an explicit retry.

- `npm run test:ui`: the built-UI integration test passed with two independent
  Chromium sessions, real authenticated service endpoints, and zero page errors.
  It verifies runtime credential entry, Actor selection, task creation, a CLI
  agent's live update, preserved/rejected stale human draft, comment broadcasts,
  separate human read receipts, handoff, and assignee effects.
- Desktop (1440×1000) and mobile (390×844) captures were inspected in two bounded
  visual passes. Fixed accessible Actor naming, filter wording, mobile save-status
  visibility, and tag entry. Captures are under ignored `output/playwright/`.
- The UI detector reported no primary findings. `git diff --check` passed.
- A full-suite run exposed an intermittent native-peer shutdown timeout. Isolated
  shutdown schedules did not reproduce it. The server now closes both listening
  sockets before draining WebSockets and HTTP requests, preventing new transport
  connections during that drain. After this change `npm test` passed all 184 tests
  with zero failures/cancellations/skips. Natural-exit checks remain separate from
  that legacy forced-exit command.
- `node --test test/workspace-runtime.test.js test/pardner-ui.test.js`: all seven
  cases passed and exited naturally after the shutdown ordering change.

This is not the final acceptance result. The two-browser test currently uses one
service. Browser behavior during hub partitions, conflict resolution across real
replicas, response loss/replay, harness inbox/effect durability, the 100-task/
400-comment/200-operation fixture, independent expected-operation checks, 20 varied
seeds, `verify`, legacy retirement, and the rehearsal guide remain to be completed.

## Full-size acceptance fixture and harness components — 2026-09-04

Added real TCP/HTTP network gates, a deterministic CLI agent worker with a SQLite
inbox/effect ledger, and an independent intent/receipt manifest verifier. The gates
destroy existing sockets during partitions and can discard responses only after
the hub has handled a request. The worker durably records receipt before delivery
acknowledgement and uses a stable operation ID when recovering a saved effect.

- `node --test test/acceptance-components.test.js`: three tests passed naturally.
  They prove gated hub HTTP/native connectivity leaves local authoring available;
  lost hub acknowledgements recover; worker kills before acknowledgement and after
  a saved effect produce one inbox entry, one effect entry, and one agent comment;
  and the independent verifier rejects a missing effect despite matching history.
- `node scripts/acceptance.js --repeat 1 --seed 1`: the **fixture stage** passed
  naturally with a hub, two persisted replica subprocesses, two real browser
  contexts, 100 tasks, 400 comments, 200 varied offline updates, a killed/reopened
  replica, two lost hub-ack responses, and browser resolution of a real concurrent
  status conflict. All three snapshots independently passed verification of 707
  acknowledged operations and their final effects, with matching snapshot hashes.
- Observed maxima in that run: local CLI durable acknowledgement **204 ms**,
  convergence **3.233 s**, and offline restart **2.002 s**, against 2 s / 10 s / 5 s
  limits respectively. Browser visual-latency assertions still need integration.
- Reports, snapshots, manifests, timings, gate schedules, and browser traces are
  written under ignored `output/acceptance/`. The initial report is under
  `2026-09-05T01-49-12.007Z/seed-1/`. New runs also record service logs and expected
  replica identities separately from operation receipts.

The runner deliberately reports `complete: false`. It has not yet integrated
both agent worker processes into the human → agent → agent → human scenario,
browser response-loss recovery, or all final gates. This single full-size fixture
run is not the required 20-run acceptance result. The remaining scope is unchanged.

### Regression migration: native sync and commit evidence

The full regression run without forced exit exposed a legacy raw-Repo fixture failure: its cleanup removed the storage directory while a background sync-state save was still renaming a temporary file. The surviving `test/sync-use-cases.test.js` child was explicitly terminated, and that run is failed evidence, not a passing gate.

The four sync use cases now exercise the production schema and command layer: concurrent Actors on one hub, one Actor on two persisted replicas, human/agent edits on two replicas during a real HTTP/WebSocket partition, and offline cold reopen followed by convergence. These check Actor attribution separately from replica identity, durable receipts, history uniqueness, and the five-second startup/ten-second convergence bounds. All four pass and exit naturally.

Commit-evidence regression coverage now uses the production HTTP operation API. It checks complete messages and diffs, attributed history and operation records, multiple commits alongside ordinary edits, replay without duplicate evidence, optional diff statistics, and invalid links without partial effects. The previous truncation expectation is deliberately replaced by the accepted complete-context contract.

The subsequent full natural-exit regression run passed **185 tests**, with zero failures, cancellations, or skips, in 10.33 seconds. Its log is `/tmp/pardner-natural-regression-v2.log`. This was before the following branch-test migration, which independently passed all six replacement cases. Branch coverage now verifies field-copy and parent relationships, isolated edits, three-way merge preservation of unrelated parent work, attributed activity, retry versus double merge, divergent-edit rejection, and retained branch evidence.

`npm test` now builds the UI and runs `node --test` without forced exit or the former GAP skip pattern. The targeted `test:gaps` command also no longer forces exit. Final candidate verification and twenty seeded acceptance runs remain outstanding.

### Regression migration: concurrency, UI transport, branding, and former gaps

Concurrent-write coverage now uses production operations and explicit revisions. It checks disjoint edits, one acknowledged local same-field winner plus a `STALE_UPDATE` rejection, complete concurrent comments, ten sequential revisions with exact attribution, distinct task creation, shared activity, and fifty comments from five registered agents. Its seven tests pass.

Nine production WebSocket tests verify the initial Actor-aware snapshot, task/comment broadcasts, identical broadcasts to multiple subscribers, ping/pong, and rejection of all three former JSON mutation variants without changing the document. The old tests expecting JSON writes to succeed are replaced by the accepted HTTP-only mutation contract. Branding/storage coverage now instantiates the production runtime and verifies schema-2 metadata while preserving a separate legacy marker.

The former GAP tests no longer suppress logs, skip by name, or write the old schema. They verify native CBOR transfer of an actual production task, real mention keys across operation replay and separate identical comments, and one observed Automerge change containing both task effects and attributed history. All three pass with natural process exit. Durable harness deduplication remains covered by the worker/acceptance tests rather than a toy in-memory Set.

### Production-only store and mutation paths

The remaining error, canonical-task-reference, delivery-lifecycle, authentication, and ticket-renewal fixtures now use the production schema and runtime. Focused runs passed 19 validation cases, four task-reference/schema-isolation cases, eight delivery lifecycle cases, and 14 authentication/transport cases. Native reconnect tests now author attributed operations through `Workspace` instead of directly writing raw task fields.

The old `AutomergeStore` and its legacy task-reference normalization helpers have been removed. The server no longer contains the duplicate task/comment/branch mutation routes, global last-seen writes, default implicit agent registration, or JSON WebSocket mutation implementation. Retired HTTP mutations still return `OPERATION_REQUIRED`; retired JSON mutations return `HTTP_MUTATION_REQUIRED`. Native Automerge synchronization, UI subscriptions, ticket issuance, trace reads, and the shared operation/delivery APIs remain.

Schema-1 read-time normalization is intentionally superseded by explicit incompatible-schema rejection, with tests proving that existing metadata is preserved. Delivery tests retain the applicable lease/claim/ack/release/restart/deletion behavior with explicit stale-token errors. Full-suite verification after removal is recorded separately when complete; native smoke/stress tooling still needs reconciliation with the production runtime.

### Native diagnostic tooling reconciled with schema 2

The native peer helper now opens `WorkspaceRuntime` instead of a raw Repo with a one-use ticket. Smoke/stress mutations use attributed operations with expected revisions and disk acknowledgements. Shutdown errors are surfaced rather than swallowed. Smoke watch handles termination gracefully; commands return structured JSON, and stable operation-ID retries reuse the original revisions while rejecting changed payloads.

All three native stress scenarios passed twice against a temporary production hub: UC2 140–182 ms, UC3 286–296 ms, UC4 164–171 ms. UC4 now partitions actual HTTP and WebSocket transports, authors offline, closes and reopens the same persisted identity while still offline, and then converges. A subprocess smoke test passed Actor validation, persistent edit, same-ID replay, mismatched-payload rejection, and full context/history checks.

The post-store-removal full regression run passed 162 tests with no skips or forced exit; 27 focused server tests passed after removing now-unreachable compatibility guards. The new native smoke test is additional coverage. The complete `verify` command is being exercised separately before final-candidate acceptance.

### Complete verification and final-candidate evidence

The development `npm run verify` run completed successfully: UI build, 163 regression tests with no skips/forced exit, and one complete acceptance scenario. Its scenario report is `output/acceptance/2026-09-05T02-34-32.668Z/seed-1/report.json`; this predates the following acceptance additions.

The final acceptance runner now records hashes of source files, test/harness code, both dependency lockfiles, and the actual built UI in `candidate.json`. It compares that fingerprint again at completion, so a run cannot silently mix candidates. Cleanup attempts every resource and reports cleanup errors instead of skipping later cleanup when an earlier step fails. Acceptance now also checks complete commit evidence and the union of one human Actor’s offline read receipts from both replicas, with another human’s unread state remaining independent. The independent manifest checks receipt contents and comment/handoff authors and text in addition to operation provenance and task effects.

A clean Git checkout of the candidate was prepared in a temporary directory from the current worktree, including new implementation files and excluding removed legacy files. This is a temporary verification repository, not a commit to the user’s repository. Installation and fresh-checkout execution remain to be verified. The 20-seed gate was started against the fingerprinted candidate; it is not yet recorded as passed.

The first fingerprinted 20-seed attempt stopped in seed 1 because the newly added commit-evidence fixture accidentally supplied a hash longer than Git’s accepted limit. The production API returned `INVALID_ARGUMENT`; that failed attempt is preserved under `output/acceptance/2026-09-05T02-37-37.626Z`. The fixture was corrected to 40 hexadecimal characters. The convergence loop now checks the elapsed bound before accepting success as well as before continuing, closing a boundary case where a final poll could have finished after ten seconds. A new complete 20-seed attempt was started; the temporary candidate checkout was refreshed to these exact changes.

The corrected candidate fingerprint is `a24cbbd03c3b2e14ecb1c76c3b9e8c26c2ea6c4f6b8aa410f36da28380738fc6`. The isolated clean checkout installed 96 root and 162 UI packages from the lockfiles, then passed its UI build and regression tests. Its source, locks, and built UI fingerprint match the current worktree exactly (zero differing files). Its acceptance scenario remains in progress.

Seed 1 of the corrected 20-seed run passed with 719 independently checked operations. Maxima were 193 ms local acknowledgement, 58 ms offline UI visibility, 1,887 ms offline restart, 2,334 ms convergence, and 140 ms agent-effect acknowledgement. The report is `output/acceptance/2026-09-05T02-39-58.873Z/seed-1/report.json`. This is one passing seed, not the completed 20-seed gate.

Fresh-checkout verification completed successfully on the identical candidate: lockfile installation, UI build, all 163 regression tests, and the strengthened 719-operation acceptance scenario. The command exited naturally with status 0 and the acceptance runner confirmed an unchanged candidate fingerprint at completion. Reports, browser traces, service logs, candidate hashes, checkout identity, and the full verify log are preserved under `output/acceptance/fresh-checkout-2026-09-05/`. The main 20-seed gate has passed seeds 1 and 2 and remains in progress; fresh-checkout success does not substitute for that gate.

### Final automated milestone result

The corrected 20-seed gate completed in one uninterrupted run and exited 0. All seeds 1–20 passed with 719 acknowledged operations each: **14,380 total**, across 20 distinct operation schedules. Independent artifact inspection found complete browser traces/service logs, one completed inbox/effect record for each worker, matching heads and snapshot hashes, no cleanup errors, no missing acknowledged operations, and no timing violations. Report hashes and snapshot hashes were recomputed and matched. The source/build fingerprint still matches the starting candidate and clean checkout.

Across all seeds, rounded-up maxima were 293 ms local acknowledgement, 66 ms offline UI visibility, 2,016 ms offline startup, 2,776 ms convergence, and 211 ms agent-effect acknowledgement. Final artifacts, the complete command log, and audit output are under `output/acceptance/2026-09-05T02-39-58.873Z/`. The final requirement-by-requirement audit is `docs/PARDNER-GOAL-AUDIT.md`.

The agreed automated milestone is complete. The two-machine/two-real-agent guide is prepared, but its manual execution/signoff is not claimed. No user-repository commit or push was made.
