# Lifecycle ordering model

A bounded, code-mapped model of how the Pardner hub admits requests, returns
local-save receipts and hub persistence acknowledgements, and shuts down, with
one enrolled replica. It covers the properties listed in issue #97 for the
runtime repairs in #89 and #90. It is a follow-up to that qualified stack, not
an additional merge gate.

| Command | Purpose | Cost |
| --- | --- | --- |
| `npm run verify:model` | Drift check of the mapped sources, then the bounded model check with coverage witnesses | about 5 s, 0.8 GB |
| `npm run verify:model -- --mutate NAME` | Mirror one source mutation in the model and print its counterexample | under 5 s |
| `npm run verify:model:mutations` | Mutate disposable copies of the real sources and show that the implementation checks, the drift check and the model each catch them | about 30 s |
| `npm run test:runtime` | Includes the implementation checks and the checker self-test | about 10 s |

Agents use the [verify-lifecycle-model skill](../.agents/skills/verify-lifecycle-model/SKILL.md).
The recorded outcomes are in [evidence/lifecycle-model.json](evidence/lifecycle-model.json).

## Tooling choice

The issue names TLA+ with TLC as the expected starting point. This repository
instead uses a small explicit-state checker written in Node
(`formal/lifecycle/checker.js`, about 170 lines) with the model written as
guarded actions in `formal/lifecycle/model.js`. Reasons:

- The project pins exactly one runtime, Node 24.11.1, and its verification
  policy requires every check to be repeatable from that toolchain. No Java
  runtime is installed on the development host, and TLC would add a JVM plus a
  pinned `tla2tools.jar` to provision for every contributor and agent shell.
- The model is tiny. Its default bound explores 174,614 states in about five
  seconds; breadth-first enumeration with weak-fairness analysis over strongly
  connected components is sufficient and needs no symmetry or symbolic machinery.
- Keeping the model in the same language and directory as the code lets each
  action carry its source anchors, lets one command run the drift check and the
  model check together, and lets `node --test` exercise the checker itself.
- The cost is the absence of an independent, widely reviewed tool. The checker
  is therefore itself tested: every mirrored mutation must produce a
  counterexample on the expected property, every coverage witness must be
  reachable, and the state limit must stop exploration (`test/lifecycle-model.test.js`).

The actions are written as guards and effects on a plain state record, so a
port to TLA+ is mechanical if an independent checker is wanted later: each
action becomes a TLA+ action, `within` becomes a conjunction of `<=`, the
invariants become `INVARIANT`s and the progress property becomes
`stopping ~> done` under `WF_vars` of the fair actions.

## Mapping to the implementation

The earlier mapping was recorded against source revision `d849d26a51d27b2788092bdbae0c08a280ab1616`. That review, for
[#77](https://github.com/depatchedmode/pardner/issues/77), confirmed that the control pane's routes sit behind the same
admission middleware and that it closes after `listenersClosed` and before `store.close()`; no action changed.
`formal/lifecycle/mapping.json` holds that revision and the SHA-256 of each
mapped file; `npm run verify:model` fails with exit code 2 when any of those
files changes or when an anchor string no longer occurs exactly once.

State abstraction. Document heads are a pair `{r, h}`: the number of
replica-authored edits and hub-authored operations the document contains. Each
side authors edits sequentially, so Automerge `hasHeads(doc, heads)` is the
componentwise comparison `within(heads, doc)`. `hub` is the hub's in-memory
document, `disk` the heads the hub has persisted (`DurableRepo.persistedHeads`),
`replica` the replica's document and `acked` the replica's `acknowledgedHeads`.
Requests are a fixed pool: `hubOps` operations, `ackAttempts` sync-ack requests,
and one WebSocket upgrade. Each request records its connection (`none`, `active`,
`idle`, `ws`, `closed`) and whether it is keep-alive.

| Action | Fair | Code it abstracts | Atomicity assumption |
| --- | --- | --- | --- |
| `Arrive(op)`, `Arrive(ack)` | no | `setupHTTPAPI` first middleware (`automerge-sync-server.js`): 503 with `Connection: close` when `stopping`; else the route is reached | `stopping` is read synchronously in the first middleware, so admission is decided atomically on arrival. A request arrives on a new connection only while the listener is open, or reuses another request's idle keep-alive connection (pipelining) |
| `UpgradeArrive` | no | `wsUpgradeHandler`: 503 reject when `stopping`, else `handleUpgrade` | same as above; an accepted upgrade is a `ws` connection |
| `ReplicaEdit` | no | `Workspace.execute` on the replica | the replica's own local-save barrier is the same `apply()` path as `Handle(op)`; it is folded into one step on the replica side |
| `SyncUp` | no | native sync delivers a replica edit; `DurableRepo` patches `storage.saveDoc` into a throttled `background()` save; `background()` drops the save once `closing` | the hub document gains one edit atomically; consecutive pending background saves coalesce because `persistDocument` reads the current document when it runs. Allowed while the store is open, which over-approximates the real cut at `client.terminate()` |
| `SyncDown` | no | native sync delivers a hub operation to the replica | atomic |
| `ReplicaSendAck` | no | `synchronizeAcknowledgement`: `requestedHeads = getHeads(doc)` then `POST /automerge/sync-ack` | the requested heads are snapshotted before the request; the request then arrives through `Arrive(ack)` |
| `StopBegin` | no | `stop()`: `this.stopping = true`, `server.close()` on every listener, `client.terminate()` on WebSocket clients | all synchronous before the first `await`; `server.close()` closes connections that are idle at that moment |
| `IdleConnectionEnds` | no | client closes a keep-alive socket, or Node's `keepAliveTimeout` fires | neither is assumed to happen (unfair), so the model cannot rely on the 5 s timeout |
| `Handle(op)` | yes | `WorkspaceRuntime.execute` (refuses after `stopController.abort()`), `Workspace.apply`: `handle.change`, then `repo.flush` enqueued. The hub's membership record gate (`WorkspaceRuntime.addRecords`, `POST /automerge/membership/records`) is the same kind of request: it joins the operation queue, saves the records to the record store, makes one `handle.change` and answers after `repo.flush` | the change and the flush enqueue are one step; `STORAGE_FAILED` is the failure outcome of the flush |
| `Handle(ack)` | yes | `WorkspaceRuntime.acknowledge` (no readiness guard), `Workspace.acknowledge`: `hasHeads` check, then `repo.flush` | same |
| `PersistRun` | yes | `DurableRepo.enqueue` chain runs one job at a time; `persistDocument` saves the current document and updates `persistedHeads`; a failing flush rethrows | a job's save is atomic and either persists the whole current document or nothing. `storageFailures` bounds how many jobs may fail |
| `Respond` | yes | `res.json(...)` of the receipt or acknowledgement; `res.once('finish')` | writing the response and the socket becoming idle (keep-alive) or closed are one step |
| `ReclaimIdle` | yes | `listen()` finish hook: `if (this.stopping) setImmediate(() => server.closeIdleConnections())` | the `setImmediate` callback eventually runs (fair); modeled for any idle connection while stopping, which also covers the idle connections `server.close()` closed itself |
| `ListenerClosed` | yes | `server.close` callbacks settle (`listenersClosed`) | fires once no connection is active, idle or upgraded; one listener stands for the HTTP and WebSocket listeners, which `stop()` closes together with `Promise.allSettled` |
| `StoreCloseBegin` | yes | `await this.store.close()` after `listenersClosed`; `closeResources`: `abort()`, `await workspace.queue`, a pending hub-state write settles, `repo.shutdown()` sets `closing` | `workspace.queue` is already drained because every operation arrives through a drained listener. The upstream `Repo.shutdown()` flush is a no-op once `closing` is set, so the model does not persist anything here |
| `StoreCloseComplete` | yes | `await this.persistenceQueue`, then `lease.close()` and `closed = true` in `finally` | the queue drains before ownership is released |
| `ReplicaReceive` | yes | `synchronizeAcknowledgement`: first guard `getHeads(doc) == requestedHeads && hasHeads(doc, hubHeads)`; errors only set `lastSyncError` | the response is consumed atomically up to the guard; the local flush that follows is a separate step |
| `ReplicaAckCommit` | yes | second guard after the local flush; `acknowledgedHeads = requestedHeads` | the guard and the assignment are synchronous; the recorded value is the requested snapshot, never the current heads |

What the model does not contain: Automerge merge semantics (heads are counters),
the replica's own storage, the delivery ledger, ticket minting,
origin and token checks, the machine handshake and signed-request checks, express
body parsing, and the JSON UI subscription socket. Each of those is either orthogonal to the five properties or handled by
other regression suites.

## Bounds, initial state, failures and assumptions

Default bounds: 2 replica edits, 1 hub operation, 1 acknowledgement attempt,
1 WebSocket upgrade, at most 1 persistence failure. Every request may use a new
connection with or without keep-alive, or reuse an idle connection. `stop()`
may begin at any point, or never. The initial state has empty documents, an
open listener and an open store. Failure cases: a persistence job fails
(`STORAGE_FAILED` receipt or failed acknowledgement), an acknowledgement is
rejected with 503 or ignored because the replica moved on, a request is
pipelined after `stop()` began, a keep-alive socket goes idle after the listener
started closing, a synced change is still unpersisted when the store closes.

Why these bounds cover the properties: two replica edits allow a newer edit to
exist both before the acknowledgement is answered and between the replica's two
guards; one hub operation exercises the receipt barrier and the replica's
`hasHeads(doc, hubHeads)` guard; one acknowledgement attempt already reaches
every outcome (acknowledged, not acknowledged, failed, rejected, ignored);
one failure distinguishes a failed from a successful barrier. The checker counts
the states reaching each coverage witness and exits with code 4 if any witness
becomes unreachable, so the bounds cannot silently stop covering a scenario.

Wider bounds were also run once (see the evidence record): two acknowledgement
attempts add retry after rejection or failure and pass with 218,314 states
(1 replica edit) and 1,006,412 states (2 replica edits, about two minutes and
4 GB). They are not part of the routine command.

Environment assumptions: request arrival, replica edits, sync delivery, the
start of shutdown, and the end of an idle connection are environment actions
with no fairness. Fairness assumptions for the conditional progress property:
weak fairness of every system action listed as fair above. This is the issue's
"admitted work settles and relevant events run": handlers run, queued
persistence jobs complete (successfully or not), responses are written,
`setImmediate` callbacks run, `server.close` callbacks fire, and the store
close steps execute. Nothing is assumed about `keepAliveTimeout` or about
clients closing their sockets.

## Properties

| Issue property | Model property | Implementation check (real Node) |
| --- | --- | --- |
| A local-save receipt or hub acknowledgement is returned only after the persistence barrier succeeds | invariant `ReceiptAfterBarrier`: an operation with an `ok` receipt has its edit within `disk`; an acknowledged sync-ack has its requested heads and reported `hubHeads` within `disk` | `lifecycle-conformance`: receipt stays pending behind a held storage write, no receipt on a failed write; acknowledgement stays pending behind a held write; unknown heads are not acknowledged |
| Shutdown keeps storage available until admitted requests finish using it | invariant `StorageAvailableWhileAdmitted`: while the store is closed no request is admitted, flushing or responding and the persistence queue is empty | `lifecycle-conformance`: storage ownership observed at entry and exit of every write during an acknowledgement admitted before `stop()`; `close()` waits for a queued background save before releasing the lease, and the save is on disk after reopening |
| Once stopping begins, new HTTP requests and WebSocket upgrades are rejected | invariant `NoAdmissionWhileStopping` | `workspace-runtime`: pipelined request after `stop()` receives 503 with `Connection: close`. Upgrades after `stop()` are refused by the closed listener; see limits |
| An acknowledgement for older heads cannot mark newer local edits as synchronized | invariant `AckedHeadsPersisted`: `acknowledgedHeads` is always within `disk`, so `syncPending == false` implies every local edit is hub-persisted | `workspace-runtime`: a delayed acknowledgement does not clear newer local work |
| Under the fairness assumptions shutdown completes, including when an accepted keep-alive response becomes idle after listener closure begins | progress `ShutdownCompletes`: `stopping` leads to `done`; a fair stutter or fair cycle without `done` is a counterexample | `workspace-runtime`: a keep-alive socket that goes idle after `stop()` does not hold shutdown (3 s bound); an accepted acknowledgement completes after `stop()` began |

## Results

Recorded on 2026-11-03 with Node 24.11.1 against mapping revision
`d849d26a51d27b2788092bdbae0c08a280ab1616` (file hashes in `mapping.json`). No external tools.

Model check with the default bounds: 174,614 states, 679,456 transitions, about
5 s. All four invariants hold and `ShutdownCompletes` holds under weak fairness
of the nine fair action families. Coverage witnesses (states reaching each):

| Witness | States |
| --- | --- |
| acknowledgement admitted before stop() is still in flight while the listener drains | 34,944 |
| operation admitted before stop() is still in flight while the listener drains | 47,632 |
| keep-alive connection becomes idle after stop() began | 23,362 |
| request rejected with 503 after stop() began | 2,046 |
| persistence failure reported to a request | 35,068 |
| acknowledgement for older heads pending while the replica has newer edits | 29,008 |
| replica edits acknowledged | 760 |
| hub operation acknowledged by the replica | 2,590 |
| synced change still unpersisted when shutdown completes (never acknowledged) | 3,248 |
| shutdown completed with every persisted head acknowledged | 150 |

Mutation demonstration (`npm run verify:model:mutations`). Each row mutates a
disposable copy of the real source file, runs the named implementation check in
the copy, runs the drift check against the copy, and runs the mirrored model
mutation. All eight controls passed unmutated; the working tree's mapped-file
hashes were identical before and after; every copy was restored and removed.

| Mutation of real source | File | Implementation check | Drift check | Mirrored model mutation |
| --- | --- | --- | --- | --- |
| `apply()` returns `savedLocally` without awaiting the flush | `lib/workspace.js` | caught: receipt test failed | reported | counterexample on `ReceiptAfterBarrier` |
| `acknowledge()` responds without awaiting the flush | `lib/workspace.js` | caught: acknowledgement test failed | reported | counterexample on `ReceiptAfterBarrier` |
| `acknowledge()` skips the `hasHeads` check | `lib/workspace.js` | caught: unknown-heads test failed | reported | counterexample on `ReceiptAfterBarrier` |
| `synchronizeAcknowledgement` records current heads without the guards | `lib/workspace-runtime.js` | caught: delayed-acknowledgement test failed | reported | counterexample on `AckedHeadsPersisted` |
| stopping middleware removed | `automerge-sync-server.js` | caught: pipelined 503 test failed | reported | counterexample on `NoAdmissionWhileStopping` |
| `stop()` closes the store before the listeners drain | `automerge-sync-server.js` | caught: a write ran with the store closed | reported | counterexample on `StorageAvailableWhileAdmitted` |
| `closeResources` releases the lease before draining | `lib/workspace-runtime.js` | caught: a queued save finished without the lease | reported | counterexample on `StorageAvailableWhileAdmitted` |
| idle-reclaim finish hook removed | `automerge-sync-server.js` | caught: shutdown exceeded the 3 s bound | reported | counterexample on `ShutdownCompletes` (fair stutter) |

The ninth model mutation, `upgrade-while-stopping`, has a counterexample in the
model but no implementation mutation: see limits.

Observation, not a defect: the model reaches shutdown with a synced replica
change in memory but not on the hub's disk (3,248 states). This matches the
code: `DurableRepo.shutdown()` sets `closing` before the upstream flush, so a
change that only had a pending throttled background save is not written. Such a
change was never acknowledged, the replica keeps it with `syncPending`, and the
acknowledgement protocol re-persists it after restart. No listed property is
violated; the behavior is now explicit.

## Operation-integrity mapping review (2026-11-04)

The #61 integration refreshes hashes for `lib/workspace.js` (request identity in
receipts and conflict-aware snapshot projection) and `automerge-sync-server.js`
(the integrity error's HTTP 409 mapping). Admission, persistence barriers and
shutdown ordering are unchanged; model actions and mutation anchors remain
applicable. The default check passed again: 174,614 states, 679,456 transitions,
all invariants, progress and coverage witnesses. See `operationIntegrityMappingReview`
in the evidence JSON for exact hashes. The wider-bound and mutation runs above
remain historical evidence, not fresh runs for this candidate.

## What the model assumes about Node boundaries

The model keeps these facts as assumptions and relies on the real Node tests
for them:

- `http.Server.close()` refuses new connections and closes idle connections at
  the moment it is called, and its callback fires only after every connection
  has ended. Covered by the pipelined-request and in-flight acknowledgement
  tests in `test/workspace-runtime.test.js`.
- A keep-alive socket whose response finishes after `close()` was called is not
  reclaimed by Node until `keepAliveTimeout` (5 s by default) unless
  `closeIdleConnections()` is called again. The finish hook does that on the
  next `setImmediate`. The model treats the hook as a fair action and the
  timeout as unfair; the 3 s bound in "does not let a keep-alive socket that
  goes idle after stop() begins hold shutdown" establishes the real timing.
- `stopping` is set before any `await` in `stop()`, and the first middleware
  reads it synchronously. There is no window in which a request parsed after
  `stop()` began is admitted.
- `res.once('finish')` fires after the response body has been handed to the
  socket; the socket's keep-alive state is then idle. Node, not Pardner, decides
  the keep-alive status from the request headers.
- The persistence queue is a promise chain; a job enqueued before `closing`
  completes before `shutdown()` resolves. The conformance test "drains queued
  persistence before releasing the storage lease" observes this with a held
  write.

## Limits

- A passing check establishes the properties within the declared model, bounds
  and assumptions only. It does not prove the JavaScript, Node internals,
  Automerge, filesystem durability, power-loss recovery, real-agent behavior or
  physical-device behavior. The conformance tests observe process-level
  boundaries only.
- Heads are counters. Concurrent edits that merge, conflict or are received out
  of order are outside this model; the conflict and acceptance suites cover them.
- The replica's own persistence barrier is folded into `ReplicaEdit`; its
  `savedLocally` receipt is the same `apply()` code the hub-side `Handle(op)`
  maps to, and the same conformance test exercises it.
- The upgrade guard in `wsUpgradeHandler` is defense in depth: an upgrade
  arriving after `stop()` is refused by the closed listener before the handler
  runs, so no real Node test distinguishes the guard's presence. The model keeps
  it because the guard is the only protection for an upgrade parsed on an
  already-accepted keep-alive connection, and the mirrored model mutation shows
  the invariant would detect its removal.
- One listener stands for the HTTP and WebSocket listeners. They
  share `listen()`, the middleware and `stop()`; the model does not explore
  listener-specific interleavings.
- The drift check compares whole files. Any edit to a mapped file, including a
  comment, requires a mapping review and `--accept-drift`. This is deliberate:
  the mapping is the claim that the model still describes the code.
- The mutation runner demonstrates eight mutations. It does not measure mutation
  coverage of the mapped files in general.

## Maintenance

- Run `npm run verify:model` whenever a mapped file changes. On drift, follow
  the [skill](../.agents/skills/verify-lifecycle-model/SKILL.md): re-review the
  listed actions, update anchors, mutations, witnesses or properties, then record
  the mapping with `--accept-drift` and rerun. Describe the model change in the PR.
- Add a witness for every new scenario an action is meant to cover; the check
  exits with code 4 if a witness becomes unreachable.
- When adding an implementation mutation, use an existing or new real Node test
  that fails for that defect, and give the model a mirrored mutation so both
  arms stay distinct and both are exercised by the runner.
- Update the results in this document and in `docs/evidence/lifecycle-model.json`
  when the mapping revision, bounds or outcomes change. Those files are guidance;
  the routine command is the live result.

## Security integration mapping review (2026-11-04)

The current mapping records source revision `509a8357a4ef0197825eacf70a5d7a5504fb1795`.
The security integration narrows native admission to enrolled credentials, validates
loopback-only insecure listeners, partitions pairing budgets and installs framing
headers synchronously before the stopping guard. Query credential parsing now uses
a fixed URL base so IPv6 binds work. Persistence/acknowledgement barriers, head
guards, idle reclamation and listener-before-store shutdown order are unchanged.
No model action, invariant, witness or mutation anchor needed modification.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The model assumes
an enrolled replica and excludes credential/ticket internals. Prior wider-bound
and mutation evidence above is historical, not freshly rerun for this candidate.
The security review record in `docs/evidence/lifecycle-model.json` retains the new
mapping and observed duration; implementation checks are reported separately in
`SECURITY-INTEGRATION.md`.

## Oversize request message mapping review (2026-11-08)

The current mapping records source revision `124a69e9b7599c315aaddec8a9633887dfa91b80`.
Only `automerge-sync-server.js` changed: the JSON body limit is named (`100kb`, the
body-parser default, so admission is unchanged) and an `entity.too.large` parse
error now answers 413 with a size message instead of the generic 400. The error
is raised before any route handler, so no operation is admitted, persisted or
acknowledged, and body parsing stays outside the model. No model action,
invariant, witness or mutation anchor needed modification.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. Prior wider-bound
and mutation evidence above is historical, not freshly rerun for this candidate.
See `oversizeRequestMessageReview` in `docs/evidence/lifecycle-model.json`.

## Standalone LAN removal mapping review (2026-11-09)

The current mapping records source revision `182a8fb2706e91459a4ee9c15ad64d5d6048b41e`.
Only `automerge-sync-server.js` changed: the standalone service no longer opens
LAN listeners or serves `/pardner/pair` and `/pardner/access`, and the loopback
check for control routes moved unchanged to `lib/loopback.js`. The listener set
that `stop()` closes together shrinks to the HTTP and WebSocket listeners. Both
still pass through `listen()`, the stopping 503 middleware stays first, and
`stop()` still closes the listeners, terminates WebSocket clients and awaits
`listenersClosed` before it closes the store. No model action, invariant or
witness changed; the `close-store-before-drain` mutation text dropped its
`lanServers` line.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught by their implementation
check, reported as drift and reproduced as a model counterexample, with the
working tree unchanged. Prior wider-bound evidence above is historical. See
`standaloneLanRemovalReview` in `docs/evidence/lifecycle-model.json`.

## Machine handshake mapping review (2026-11-11)

The current mapping records source revision `ff19342b18c8847b6981a31e0bdeb71fa9b5d63d`.
`automerge-sync-server.js` and `lib/workspace-runtime.js` changed (#199). The
acknowledgement route is still reached only after the stopping middleware and
admission; admission now accepts the local API token or a request signed by a
member machine's key within a session, and a refused signature is a failed
acknowledgement (`ReplicaReceive`). The new `/session` routes and
`/automerge/hub/resume` sit behind the same middleware and listener drain and never
touch the persistence queue. A native upgrade still becomes a WebSocket client at
`handleUpgrade`, which `stop()` terminates; it reaches Automerge only after the
machine handshake. On the replica, the socket opens with the handshake and the
acknowledgement request is signed; `synchronizeAcknowledgement`'s guards and
`closeResources` are unchanged. Records offered in a welcome or a membership
exchange join the grow-only store and are written back by the existing harvest.
No action guard, effect, atomicity, invariant, witness or mutation text changed;
the notes on `Arrive(ack)` and `UpgradeArrive` describe the new admission.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught by their implementation
check, reported as drift and reproduced as a model counterexample, with the
working tree unchanged. Prior wider-bound evidence above is historical. See
`machineHandshakeReview` in `docs/evidence/lifecycle-model.json`.

## Plain string storage mapping review (2026-11-11)

For #208, workspace reads unwrap immutable strings and membership write-back
encodes string values. Re-reviewed `ReplicaEdit`, `SyncDown`, `ReplicaSendAck`,
`Handle`, `Respond`, `StoreCloseBegin`, `StoreCloseComplete`, `ReplicaReceive`
and `ReplicaAckCommit`: guards, effects, persistence barriers and atomicity are
unchanged. Only the membership write-back source anchor changed; no model
transition, invariant, witness or mutation needed changing.

Fresh default check: 174,614 states, 679,456 transitions, all invariants,
progress and witnesses pass. All eight mutation demonstrations were caught by
implementation checks, reported as drift and reproduced by model counterexamples.
See `plainStringStorageReview` in the evidence JSON. The model still excludes
field merge semantics; those are covered by the operation and conflict tests.

## Trust stage 1 integration mapping review (2026-11-11)

The current mapping records source revision `925898299a680da92a8e49106388696455b90676`,
the integration of #210, #211, #213 and #214. All three mapped runtime files had
changed since the handshake review. In `lib/workspace.js` and
`lib/workspace-runtime.js`, #211's reads unwrap immutable strings, and both
membership writes (the harvest write-back and the hub's record gate) now encode
records with `storageValue`. Each is still one `handle.change`. The write-back is
a local edit without a request (`ReplicaEdit`); the gate joins the operation
queue and answers after `repo.flush` (`Arrive(op)`, `Handle(op)`, `Respond(op)`).
A hub's status also reports its live sync sessions (`syncPeers`), and a
replica's `hubRefusal` keeps the refusal's details. Both are in-memory reporting
that touch neither persistence nor acknowledgement. In `automerge-sync-server.js`,
a removed machine that presents the key it held completes the handshake
signatures. It is then refused in `admit`, before any welcome, so it never
reaches `registerSyncSession` or the Automerge adapter. A native upgrade is still
a WebSocket client at `handleUpgrade`, which `stop()` terminates (`UpgradeArrive`).
The signed-session routes still never touch the persistence queue. No action
guard, effect, atomicity note, invariant, witness or mutation text changed; only
the gate anchor followed its line.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught by their implementation
check, reported as drift and reproduced as a model counterexample, with the
working tree unchanged. See `trustStageOneIntegrationReview` in
`docs/evidence/lifecycle-model.json`.

## Membership consent mapping review (2026-11-11)

The mapping records source revision `0ee274a88ebedb53adef35879122593b6dcc9fd2`.
Membership now counts a certification only with its machine's consent, and a
person's ID is derived from the key they were admitted with. The only mapped
change is in `lib/workspace-runtime.js`: the standalone service's throwaway
genesis names the person ID derived from its one-time key. `standaloneGenesis`
is a pure record builder called in `init` before the record store, the
repository or any listener exists, so it touches no request, persistence
barrier, acknowledgement or shutdown step. No action guard, effect, atomicity
note, invariant, witness or mutation text changed, and no anchor moved.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught, reported as drift and
reproduced as a model counterexample, with the working tree unchanged. See
`membershipConsentReview` in `docs/evidence/lifecycle-model.json`.

## Durable restored-hub state mapping review (2026-11-11)

The mapping records source revision `d20c2a9086d821064481be320afde3a8fa395cb4`.
A hub that waits after a restore now saves that state durably. In
`lib/workspace-runtime.js`, `startHubState` writes the waiting state, its fixed
comparison point and the newest checkpoint seen together with the new file
identity, in one atomic write before the repository opens; `noteCheckpoint`
saves a newly learned waiting state or a newer checkpoint before it answers,
and does nothing once the runtime is stopping; `resumeHub` saves before it
returns. These writes go through one serialized chain, and `closeResources`
lets a pending write settle before `repo.shutdown()` and the lease release.
That is a new anchor in `StoreCloseBegin`; it admits no request and touches no
document persistence, so its guard and effect are unchanged. In
`automerge-sync-server.js`, the handshake's screen awaits `noteCheckpoint`; it
still runs before any welcome and never reaches the Automerge adapter
(`UpgradeArrive`). The `lease-before-drain` mutation's text follows the new
`closeResources` body; what it mutates is unchanged. No other action guard,
effect, atomicity note, invariant or witness changed. The hub's own waiting
state is outside the model's state; its kill and restart behaviour is checked
by `test/hub-restore.test.js`.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught, reported as drift and
reproduced as a model counterexample, with the working tree unchanged. See
`durableHubStateReview` in `docs/evidence/lifecycle-model.json`.

## Uniform handshake mapping review (2026-11-11)

The mapping records source revision `3549af6a26652e22aac18a027b5e1849ce4cf307`.
In `automerge-sync-server.js`, `acceptMachine` no longer judges a machine
before it proves its key: every well-formed hello gets the same reply, and
membership, the checkpoint comparison, a waiting hub's record exchange and the
refusal all run in `admit`, after both signatures verify and before any
welcome. A native upgrade therefore still reaches `registerSyncSession` and the
Automerge adapter only as a current member (`UpgradeArrive`), and `stop()`
still terminates it. No action guard, effect, atomicity note, invariant,
witness or mutation text changed.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught, reported as drift and
reproduced as a model counterexample, with the working tree unchanged. See
`uniformHandshakeReview` in `docs/evidence/lifecycle-model.json`.

## Signed changes mapping review (2026-11-11)

The mapping records source revision `f514d0b902d3bce17017d599b0511df5005ed045`.
Every change is now signed by the machine that makes it (`lib/attribution.js`,
not mapped), and the hub's persistence acknowledgement covers the board and its
signature document (#197).

- `lib/workspace.js`: `acknowledge(heads, signatureHeads)` refuses unless both
  are held, then one flush job persists both documents before it answers
  (`Handle(ack)`, `Respond`).
- `lib/workspace-runtime.js`: the replica requests both heads. Its first guard
  also requires the hub's reported signature heads to be held, and its second
  guard records both requested snapshots, never the current heads
  (`ReplicaReceive`, `ReplicaAckCommit`). `syncPending` stays true until both
  are acknowledged, so the model's heads now stand for the pair of documents
  (`ReplicaEdit`). Writing a signature into the signature document is a
  deferred local change off the acknowledgement path, like a membership
  write-back. `closeResources` stops asking the hub for signatures before
  `abort()`, writes pending signatures into the signature document after the
  operation queue drains and before `repo.shutdown()`, and closes the
  signature cache in `finally`, before the lease (`StoreCloseBegin`).
- `automerge-sync-server.js`: `sync-ack` passes the signature heads; a new
  signed route answers a member's question about a change's signature.
  `stop()` destroys connections that never carried a request: an aborted
  `fetch` can leave one open for three seconds, and it holds no modeled request
  (`StopBegin`).

No action guard, effect, invariant or witness changed. The `ack-before-persist`,
`stale-ack-accepted` and `lease-before-drain` mutation texts follow the new
code; what each mutates is unchanged.

Fresh default check: 174614 states, 679456 transitions, all four invariants and
`ShutdownCompletes` hold; all ten witnesses remain reachable. The mutation
demonstration was rerun: all eight mutations were caught by their implementation
check, reported as drift and reproduced as a model counterexample, with the
working tree unchanged. See `signedChangesReview` in
`docs/evidence/lifecycle-model.json`.
