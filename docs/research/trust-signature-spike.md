# Trust spike: how change signatures travel, and what signing costs

Status: **research** for [#193](https://github.com/depatchedmode/pardner/issues/193), part of [#201](https://github.com/depatchedmode/pardner/issues/201). No product code changed. It gates PR 1d of the [trust plan](../PARDNER-TRUST-PLAN.md) and answers the spike in the [design's Rollout](../PARDNER-TRUST-DESIGN.md#rollout).

Every number in this document was **measured** on the machine described in [Method](#method), unless it is marked **reasoned**. Prototypes were throwaway scripts outside the repository. They are not committed.

## Answer

1. **Use a signature store (option A).** Keep signatures in a second Automerge document beside the board, synced by automerge-repo as it is today. Apply every change, then check it. A change without a valid signature shows as "signature pending", then "unattributed". Never refuse a change.
2. **Do not refuse changes (option B).** A refused change blocks every later change built on it. With "enforced from arrival", a peer that refuses and a peer that accepted then diverge for good. On automerge-repo's sync, one refusal also made two nodes exchange about 1,100 to 2,100 messages a second until the test ended. All measured.
3. **Signing is cheap.** Signing takes 38–61 µs and checking 111–155 µs. Computing the signature adds 0.05% to 1.3% to authoring time. Checking signatures uses about 1% of the time budget at 50 operations a second. Both measured. Keep the signature's own disk write off the acknowledgement path: Ed25519 signatures are deterministic (measured), so a writer can sign its own changes again after a crash.
4. **Stop storing strings as Automerge text.** At 10,000 operations a text board takes 52 s to open and needs 4.9 GB. At 50,000 operations Automerge 3.2.3 cannot load it at all. Plain string values open in 6.5 s at 10,000. All measured.
5. **The decision rule fails on open time, not on signing.** No variant opens in under 3 s at 10,000 operations through automerge-repo. Loading the same plain-value bytes with `Automerge.load` takes 2.8 s, against 6.5 s through automerge-repo (measured). Open time needs its own work before 1d.
6. **Pick the actor suffix each time a document is loaded, not once per process.** One suffix per process failed 16 of 166 runtime tests with Automerge's "duplicate seq" refusal. One suffix per load passed all 166. Both measured.

## Method

### Machine and load

- Apple M1 Max, 10 cores, 32 GB memory, macOS 27.2.1. Internal SSD.
- Node 24.11.1, `@automerge/automerge` 3.2.3 (WebAssembly, 32-bit), `@automerge/automerge-repo` 2.5.1, installed with `npm ci` from the lockfile.
- Other agents shared the machine. One-minute load averages ranged from about 3 to 62 during the session. Each result below names its load. Timing runs were repeated, and medians are reported with the spread. Runs at load above 10 are flagged.
- Disk barrier: Pardner's `atomicWrite` calls `fsync` once per file. On macOS this does not use `F_FULLFSYNC`, so the numbers are process-crash durability, not power-loss durability.

### Workload

Operations go through Pardner's unchanged `prepareOperation` (`lib/workspace-commands.js`), one Automerge change each. A seeded generator draws English-like prose from a fixed word list. The mix, per 100 operations:

| Share | Operation | Content |
|---|---|---|
| 20 | `task.create` | Title of 30–60 characters, description of 2,000 characters |
| 45 | `comment.add` | 100–600 characters; one in ten mentions an Actor |
| 25 | `task.update` | Status, priority or assignee |
| 10 | `task.update` | A new 2,000-character description |

Four Actors (two people, two agents) author the operations. Pardner keeps each event in the `operations` map with its payload and its old and new values, so a 2,000-character description is stored three or four times per operation.

### Storage arms

- **text**: Pardner's code unchanged. Every string, nested or not, becomes Automerge text. A 2,000-character string is 2,002 Automerge operations (measured).
- **plain**: a scratch copy of `workspace-schema.js` and `workspace-commands.js`. Writes wrap strings in `ImmutableString`, one Automerge operation each. Reads unwrap them, because `ImmutableString` reads back as an object and breaks `===` comparisons. After 400 operations both arms produced byte-identical JSON (measured).

### Document sizes

| Operations | How it was built |
|---|---|
| 1,000 and 10,000 | One writer, one actor, in sequence |
| 50,000 | The 10,000 build plus 40 branches of 1,000 operations each. Every branch starts from the 1,000 checkpoint and has its own actor suffix. Result: 41 actors and 41 heads |

A 50,000-operation build in sequence was not feasible. Each change copies Pardner's flat maps (see [Authoring](#authoring)), so the build slowed to 100 ms per operation by 7,000 operations under load. The branched build has the same maps and the same number of changes. It has more actors, as a long-lived project would: a new actor suffix per load means one actor for each time a machine opens the board.

### Prototypes

Both prototypes run real automerge-repo nodes in one Node process, over WebSockets on localhost:
- a hub: Pardner's `DurableRepo`, `NodeFSStorageAdapter` and `ValidatedWebSocketServerAdapter`;
- replicas: `DurableRepo` and `NodeFSStorageAdapter` with the upstream `WebSocketClientAdapter`.

Writes go through `prepareOperation`, `handle.change` and `repo.flush`, which is Pardner's persistence barrier. Each change is signed with Node's built-in Ed25519 over `"pardner/change/v1" ‖ projectId ‖ changeHash`. The verifier finds the signer's key from the first 16 bytes of the change's actor ID and never trusts a separate signer field.

- **A, signature store.** A second Automerge document holds `s[firstHashByte][changeHash] = signature`, sharded by the first byte of the hash. automerge-repo syncs both documents. A receiver scans new changes on every board `change` event with `getChangesMetaSince` and checks each one. A missing signature is "pending" until the signature document brings it.
- **B, verify-then-apply.** A wrapper around the network adapter, on both the hub and the replicas, adds a `signatures` field to every outgoing board sync message. On receipt it decodes the sync message and checks every change before the Repo sees it. It appends accepted signatures to a log with `fsync`, then passes the message on. Changes that fail are stripped from the message and logged.

### What was run and what was reasoned

- **Run:** everything in the tables. The fault scenarios ran three times in each mode. Each table says how many runs or samples it has. Open-time and load-phase benchmarks used a fresh process per sample.
- **Run, Q2:** Pardner's `npm run test:runtime` and `npm run test:qualification`, with a preload outside the repository that sets machine-prefixed actors on every handle.
- **Not run:** the acceptance suite, any 20-seed qualification, a real two-machine network, a power-loss test, or a real agent. The prototypes are not Pardner's client service, so nothing here qualifies an implementation.
- **Reasoned:** how much of today's code each option touches, how hub acknowledgement must change, the README acceptance bounds, and every proposed rule. These are marked.

## 1. How signatures travel

### Behaviour under faults

The board was the 1,000-operation text document. Each row ran three times in each mode, with the same result each time.

| Scenario | A: signature store | B: verify-then-apply |
|---|---|---|
| Two machines edit the same field while both are offline | Both changes verify on every node. Both alternatives are kept for explicit resolution. Converged in 291–511 ms | The same. Converged in 311–383 ms |
| A request is retried with the same operation ID | Replays; no new change and no new signature | The same |
| A sync message is delivered twice | No change to the heads; no refusal | The same |
| The writer's link drops for 3 s after the change leaves | The reader holds the change "pending" for 3.02–3.12 s. It is attributed 35–145 ms after the link returns | The change and its signature arrive together. Unattributed for 0 ms |
| A member sends one unsigned change, then three signed changes on top | All four are applied everywhere. The unsigned one stays "pending" (the rule that would mark it "unattributed" was not built); the three later ones verify. Every node converges. No extra sync traffic | The hub refuses the unsigned change and blocks the three later ones. They reach no other node. The member and the hub then exchanged 5,648 to 10,434 messages each way in 5 s, until the test ended |
| The reader already holds a removal of machine M. M writes c2. The writer, not yet aware of the removal, builds c3 on c2 | Every node applies c2 and c3 and converges. The reader flags c2 as made by a removed machine; c3 verifies | The reader refuses c2 and blocks c3, an honest change by a member. The reader never converges with the hub and the writer |

The B livelock is automerge-repo's sync working as designed. The receiver keeps asking for the missing dependency, and the sender keeps sending it. Stripping refused hashes from the receiver's outgoing `need` list did not fix it: three of three runs still exchanged 9,694 to 10,368 messages each way in 5 s. Ending the loop would need a new "refused" message that the sender honours, or closing the peer's session.

B's results above are from runs after the framing fix described below. Earlier runs gave the same outcomes whenever they completed.

Prototype failures, with their status:
- **Fixed: unchecked documents.** B first passed a newly announced board through unchecked, because the hub learned the board's ID after the first sync message. A verifier must check every document by default, and never only the ones it already knows.
- **Fixed: Automerge's framing.** Automerge 3.2.3 packs several change chunks, back to back, into one entry of a sync message (measured: three changes in one 489-byte entry). For an empty peer it sends one document-format chunk instead. B first decoded each entry as one change. At 10 operations a second the decode failed with "leftover data after parsing", the message was dropped, and sync stalled: about 181,000 messages, with 47 of 50 changes undelivered. After splitting entries on the chunk framing, B delivered every change. A verify-then-apply design must parse Automerge's binary framing itself, and one parsing fault stops sync.
- **Not confirmed.** With four nodes, the reader's `repo.find` failed with "Document … is unavailable" in two B runs, at load 8.5 and 11.2. Both were before the framing fix, which is a plausible cause. None of six four-node B runs after the fix failed, at load 3.4–6.2. Injected verification delays of 1–6 s did not reproduce it.

### What a receiver knows, and when

- **B.** A receiver never sees a change without its verdict. A refused change is invisible on the board and exists only in a log on the refusing node. Its author is not told.
- **A.** A change is visible as soon as automerge-repo applies it. Its signature can arrive before it, which is harmless, or after it. automerge-repo throttles each document's sync separately, by 100 ms, so the two documents travel in separate messages with no ordering between them.
  - In normal running every change was unattributed briefly. At 1 operation a second the window was 1.0 ms median and 1.4 ms at most (30 of 30 changes, three runs). See [Receiving at write rates](#receiving-at-write-rates) for 10 and 50 operations a second.
  - If the link drops between the two messages, the change stays pending for as long as the outage lasts: 3.0–3.1 s for a 3 s outage.
  - Absence is never final. A rule is needed to turn "pending" into "unattributed". Proposal (**reasoned**): pending while the signature document is not yet in sync with the peer that sent the change; unattributed once it is in sync and still has no valid entry. automerge-repo exposes each peer's last synced heads (`handle.getSyncInfo`), which is enough to decide this.

### Tampering

The signature document is shared and writable by any member. A member could overwrite or delete another machine's entry. The prototype accepts any concurrent value that verifies, so an overwrite by itself does nothing. A deletion makes the change unattributed for a peer that never saw the entry. Mitigations (**reasoned**):
- each peer keeps signatures it has verified in a local, grow-only cache, as it keeps membership records;
- each writer checks at start-up that every change with its own machine prefix has a valid entry, and writes back any that are missing. Ed25519 is deterministic, so the entry is identical.

Changes to the signature document are themselves unsigned, so tampering with it is not attributed. B's per-node log has neither problem.

### Storage growth

| Store | Per signed change | At 50,000 changes |
|---|---|---|
| A: signature document, sharded | 103–112 bytes saved | 5.2 MB |
| B: signature log as text, as prototyped | 194 bytes | 9.7 MB |
| B: the same in binary (**reasoned**) | 96 bytes | 4.8 MB |

For comparison, a Pardner operation costs about 1,000 bytes saved with plain values and 1,600 bytes with text at 50,000 operations. A flat signature map costs the same bytes but not the same time. One write into a flat map took 0.47 ms at 1,000 keys, 4.6 ms at 10,000 and 28.7 ms at 50,000. With 256 shards it took 0.26, 0.34 and 1.15 ms. That probe ran at load 30.

### Persistence barrier and hub acknowledgement

- **Writer, both options.** A separate durable signature write before acknowledgement costs one more `fsync`: 4.7–9.0 ms (see [Authoring](#authoring)). It is not needed. Ed25519 signatures are deterministic, so after a crash the writer signs its own changes again and gets the same bytes (measured). The writer can save its signature in the background. automerge-repo saves each document at most once per 100 ms, and `DurableRepo` runs every save through one queue. So at 50 operations a second the background save adds about one `fsync` per five writes to that queue (**reasoned** from the code).
- **Receivers under A.** Nothing new. automerge-repo saves the signature document like the board.
- **Receivers under B.** A peer's signature cannot be recomputed, so the hub must make it durable before Automerge applies the change. Otherwise a crash leaves a saved change whose signature is lost, and sync will not resend it. That is one `fsync` per incoming message, 5–15 ms measured, on the hub's relay path.
- **Hub acknowledgement, A (reasoned).** Today `/automerge/sync-ack` checks the board's heads only. Under A the hub could hold a change without its signature at acknowledgement time. If the writer's disk is then lost, the change is unattributed for ever. The acknowledgement must cover the heads of both documents.
- **Hub acknowledgement, B (reasoned).** The hub stores signatures before applying, so acknowledging the board's heads already implies the signatures. The new log must join the hub's cold backup.

### What each option touches (reasoned)

| | A: signature store | B: verify-then-apply |
|---|---|---|
| automerge-repo sync | Unchanged | Wrapped on both sides: the client's `TicketNetworkAdapter` path and the hub's `ValidatedWebSocketServerAdapter` |
| Coupling to automerge-repo internals | None beyond public document events | Its message shapes (`sync`, `request`), Automerge chunk type bytes, and the sync state machine |
| New store | None; a second document in the existing repository storage and backup | A durable signature table on every node, in its backup |
| New protocol | None | A "refused" message, or the loop above |
| Changes to existing code | Create and record the second document; allow both IDs in `shareConfig`; flush order; acknowledgement for two heads; the verifier and its pending state | All of A's verifier, plus the adapters, the table, refusal handling and first-sync handling |
| Prototype size | About 40 lines for the checker and its pending state | About 80 more for the adapter wrapper, the sidecar and the log, without the refusal protocol |

B's first sync is expensive. For an empty peer, Automerge 3.2.3 sends the whole document as one compressed chunk, not as changes (measured). B must load that chunk once more to list its changes before the Repo loads it again. At 1,000 text operations one such check took about 2.6 s, and B's first sync took 8.75 s against 3.98 s for A (see [First full check](#first-full-check)). At 10,000 text operations a second copy does not fit in memory (see [Open time and memory](#open-time-and-memory)).

### Relayed changes

In both prototypes every change reached the reader through the hub. It verified against the original writer's key. The hub never re-signs. Under A the signature travels in the shared document. Under B the hub must keep the original signature and attach it when it forwards.

## 2. Actor IDs

Checked through Pardner's own `WorkspaceRuntime`, with a preload that sets the actor on every handle: `handle.update(doc => A.clone(doc, { actor }))` after `find` and `import`. The actor is the 16-byte machine digest plus 8 random bytes.

| Check | Result |
|---|---|
| The creation change | `Repo.create` uses a random actor. Creating the document with `A.from(data, { actor })` makes the first change carry the machine actor |
| Every operation after the swap | Carries the machine actor |
| Reopen in a new process | A new suffix; its sequence starts at 1; earlier changes are intact; `savedLocally` is true |
| A backup restored and run beside its original | Both write; the two documents merge (9 changes, 4 tasks) |
| The same, with a fixed suffix | Automerge refuses the merge: "duplicate seq 4 found for actor …" |
| `npm run test:runtime`, one suffix per process | 150 of 166 pass. All 16 failures trace to "duplicate seq", because several replicas of one document run in one test process |
| `npm run test:runtime`, one suffix per load | 166 of 166 pass. The preload was active in 49 processes |
| `npm run test:qualification`, one suffix per load | 12 of 12 pass |
| Cost of the swap | `A.clone` took 0.7–4.6 ms at 1,000 and 10,000 operations and 25 ms at 50,000. In a separate probe it took 7–10 ms, and memory did not grow |

A suffix per process start is not enough. Two live handles of one document in one process must not share an actor. Today that happens in tests. It would also happen in any process that hosts two roles. The suffix should be drawn each time a document is loaded.

There is no cheaper way in automerge-repo 2.5.1. Its storage subsystem loads with `A.loadIncremental(A.init(), binary)` and keeps the stored heads in a private field. Loading with an actor directly would skip that bookkeeping. The clone is cheap enough.

## 3. Cost

### Signing and verifying

Node's built-in Ed25519, over 20,000 changes, seven runs:

| Load | Sign, median (range) | Verify, median (range) |
|---|---|---|
| 23 | 61 µs (50–99) | 155 µs (136–393) |
| 3 | 38 µs (38.3–38.6) | 111 µs (110–112) |

In the fresh-process full checks below, a check cost 119–150 µs per change, including the signature lookup.

### Authoring

Through `prepareOperation`, `DocHandle.change` and Pardner's `repo.flush`, on the loaded document. Each run timed 20–60 operations. The table gives the median of the run medians, in milliseconds, with the range across runs where it matters. Load 3–7.

| Document | Runs | Prepare | Change | With disk barrier | Sign | Sign, share | A: signature write and save | B: log append and `fsync` |
|---|---|---|---|---|---|---|---|---|
| text, 1k | 3 | 0.16 | 7.5 (7.2–7.6) | 14.2 (13.6–14.2) | 0.078 | 1.0% | 6.3 (45%) | 4.8 (34%) |
| plain, 1k | 3 | 0.15 | 5.2 (5.0–5.2) | 10.8 (10.7–11.0) | 0.074 | 1.3% | 6.2 (56%) | 4.8 (45%) |
| text, 10k | 3 | 0.19 | 40.4 (40.1–40.8) | 46.2 (45.1–46.4) | 0.084 | 0.21% | 7.3 (16%) | 4.7 (10%) |
| plain, 10k | 3 | 0.18 | 30.8 (30.5–30.9) | 36.4 (36.2–36.7) | 0.085 | 0.27% | 7.0 (19%) | 4.8 (13%) |
| plain, 50k | 1 | 0.16 | 169 | 175 | 0.085 | 0.05% | 9.0 (5.1%) | 4.8 (2.7%) |
| text, 50k | — | Cannot be loaded | | | | | | |

- "Sign, share" is the signature's share of in-memory authoring (prepare and change).
- The percentages for A and B are against authoring with the disk barrier.
- With the signature saved in the background, as proposed above, the cost on the acknowledgement path is the signing alone, plus 0.5–2.0 ms to write the entry into the sharded signature document under A.

Authoring time itself grows with the document: 5–8 ms at 1,000 operations, 31–41 ms at 10,000 and 169 ms at 50,000, in memory. Almost all of it is `change`. Automerge's JavaScript layer copies a map each time one of its keys changes, and Pardner keeps one flat map entry per operation (`operations`, `operationRequests`) and per field. Text and plain behave alike here. So one process cannot author 50 operations a second at 10,000 operations, signed or not.

### Receiving at write rates

automerge-repo's 100 ms sync throttle batches changes, so at 50 operations a second a message carries about five. For each batch the receiver applies the changes, then checks them (A), or checks them and saves signatures first (B). Ten batches each (six at 50k), load 5–9. Medians in milliseconds.

| Document | Batch | Apply | A: check after | B: check before | B: `fsync` | Changes a second, apply only | With A | With B |
|---|---|---|---|---|---|---|---|---|
| text, 1k | 1 | 6.7 | 0.19 | 3.7 | 5.6 | 149 | 145 | 62 |
| text, 1k | 5 | 25.0 | 0.72 | 31.4 | 6.6 | 200 | 194 | 79 |
| plain, 1k | 1 | 4.6 | 0.22 | 0.35 | 7.3 | 216 | 206 | 75 |
| plain, 1k | 5 | 8.4 | 0.68 | 1.4 | 5.2 | 594 | 550 | 327 |
| plain, 10k | 1 | 29.8 | 0.23 | 0.31 | 6.9 | 34 | 33 | 27 |
| plain, 10k | 5 | 61.5 | 0.73 | 1.5 | 15.4 | 81 | 80 | 64 |
| plain, 50k | 1 | 173 | 0.29 | 0.33 | 5.8 | 5.8 | 5.8 | 5.6 |
| plain, 50k | 5 | 262 | 0.76 | 1.3 | 6.5 | 19 | 19 | 18 |
| text, 10k | — | Two copies do not fit in one process | | | | | | |

- Checking after applying used 0.7–1.4% of the 20 ms budget per change at 50 operations a second.
- B's check of text changes is slow because `decodeChange` builds every per-character operation. B does not need to decode. Hashing the chunk after its 8-byte header gave Automerge's change hash in every batch (measured).
- At 10,000 operations the receiver keeps up with 50 a second only because of batching. At 50,000 it cannot keep up at all: 19 changes a second in batches of five. In both cases the limit is Automerge's apply, not the signature check.

In the prototype topology (writer, hub, reader in one process), the writer wrote at a target rate for 10 s. The reader recorded when each change appeared and when it was attributed. Medians across runs, with the range of the run medians. Load 3–6.

| Board | Target rate | Mode | Runs | Achieved rate | Reader sees the change after | Unattributed for, median (worst) | Changes ever unattributed |
|---|---|---|---|---|---|---|---|
| text, 1k | 1/s | A | 3 | 1.1/s | 30 ms (30–36) | 1.0 ms (1.4 ms) | 30 of 30 |
| text, 1k | 1/s | B | 3 | 1.1/s | 54 ms (47–57) | 0 | 0 of 30 |
| text, 1k | 10/s | A | 3 | 10.0/s | 97 ms (71–117) | 0.2 ms (93 ms) | 300 of 300 |
| text, 1k | 10/s | B | 3 | 10.0/s | 119 ms (115–125) | 0 | 0 of 300 |
| text, 1k | 50/s | A | 3 | 15.1/s | 94 ms (90–98) | 1.3 ms (119 ms) | 1,500 of 1,500 |
| text, 1k | 50/s | B | 3 | 13.3/s | 128 ms (126–130) | 0 | 0 of 1,500 |
| plain, 1k | 1/s | A | 2 | 1.1/s | 26 ms (25–27) | 0.9 ms (1.7 ms) | 20 of 20 |
| plain, 1k | 1/s | B | 2 | 1.1/s | 43 ms (43–44) | 0 | 0 of 20 |
| plain, 1k | 10/s | A | 2 | 10.1/s | 64 ms (56–71) | 2.7 ms (83 ms) | 200 of 200 |
| plain, 1k | 10/s | B | 2 | 10.1/s | 92 ms (85–99) | 0 | 0 of 200 |
| plain, 1k | 50/s | A | 2 | 27.0/s | 86 ms (65–108) | 4.1 ms (35 ms) | 1,000 of 1,000 |
| plain, 1k | 50/s | B | 2 | 31.4/s | 99 ms (81–116) | 0 | 0 of 1,000 |

- No run in this table lost a change, and every change verified. The two B runs that stalled before the framing fix are described in section 1.
- One writer could not reach 50 operations a second. It shares one thread with the hub and the reader, and it waits for the disk barrier on each write. The receiver's capacity at 50 a second is the table above, not this one.
- Under A, every change was briefly unattributed, because its signature travels in a separate message. A user interface should show nothing for a short wait, then "signature pending".
- B adds 13–34 ms of latency, from checking each change and the `fsync` before applying, on both the hub and the reader.

### First full check

Every change's signature checked after opening, in a fresh process. Medians.

| Document | Changes | A: signature document | B: log |
|---|---|---|---|
| text, 1k | 1,001 | 150 ms | 123 ms |
| plain, 1k | 1,001 | 152 ms | 124 ms |
| text, 10k | 10,001 | 1.31 s | 1.19 s |
| plain, 10k | 10,001 | 1.31 s | 1.20 s |
| plain, 50k | 50,001 | 6.43 s (0.50 s to load the document) | 5.95 s |

A replica need not repeat this on every reopen. It can save the heads it has checked and check only later changes (**reasoned**).

A new replica's first sync, in the prototype topology: from connecting to the hub until every change is applied and checked. Load 3–7.

| Document | Runs | A | B | B: time spent checking |
|---|---|---|---|---|
| text, 1k | 3 | 3.98 s (3.97–3.99) | 8.75 s (8.70–8.84) | 5.0 s (4.96–5.06) |
| plain, 10k | 2 | 10.2–10.4 s | 14.5–14.6 s | 5.5 s (5.50–5.55) |
| text, 10k | — | Not run: the hub and the new replica cannot both hold it in one process | | |

- Under A the check runs after the Repo has applied the document; it is the 1.2–1.3 s of the full check above, inside the total.
- B checks before applying. It loads the document chunk an extra time to list its changes. The slow check also delayed the reader's reply, so the hub sent the whole document again: two document chunks arrived and were checked in each of two instrumented runs.
- At 10,000 plain operations even A's first sync takes over 10 s. Most of that is the document transfer and load, not the check.

### Open time and memory

A fresh process opens the board with Pardner's `DurableRepo` and `NodeFSStorageAdapter` and reads it, as `WorkspaceRuntime` does.

| Document | Saved size | Open, median (range) | Samples | Load | Memory after open |
|---|---|---|---|---|---|
| text, 1k | 1.04 MB | 3.82 s (3.80–3.91) | 5 | 7 | 656 MB |
| plain, 1k | 0.71 MB | 0.65 s (0.64–0.66) | 5 | 8 | 246 MB |
| text, 10k | 10.4 MB | 51.7 s (51.6–54.5) | 3 | 3–5 | 4.9 GB |
| plain, 10k | 7.3 MB | 6.48 s (6.46–6.58) | 3 | 5 | 1.25 GB |
| plain, 50k | 50.0 MB | 58.7 s | 1 | 3–6 | 5.6 GB |
| text, 50k | 79.9 MB | Cannot be loaded | — | — | — |

The 50,000-operation text document fails in `A.load` after 8 s, at 1.1 GB, with `RuntimeError: unreachable` in a WebAssembly allocation. It could be built only from incremental pieces. Once automerge-repo compacts such a document into one snapshot, which it does by itself, it can no longer be opened.

Where the time goes. Each phase ran three times, in a fresh process, at load 3–6. Medians; every range was within 4%.

| Document | `A.load`: WebAssembly | `A.load`: JavaScript tree | `A.load`, total | automerge-repo's load call | Open through the Repo |
|---|---|---|---|---|---|
| plain, 1k | 0.18 s | 0.14 s | 0.32 s | 0.51 s | 0.65 s |
| text, 1k | 2.56 s | 0.34 s | 2.90 s | 3.53 s | 3.82 s |
| plain, 10k | 1.53 s | 1.24 s | 2.77 s | 5.25 s | 6.48 s |
| text, 10k | 38.4 s (one run, load 7) | | | | 51.7 s |

- automerge-repo 2.5.1 loads with `loadIncremental(init(), binary)`. That builds the document by applying patches to an empty one. At 10,000 plain operations it takes 1.9 times as long as `A.load`. The Repo's own start-up and storage reads add another 1.2 s.
- Text costs its time in WebAssembly: 32 million Automerge operations at 10,000 Pardner operations, against 476,000 with plain values.
- Every Automerge document in a process shares one 32-bit WebAssembly memory. A second copy of the 10,000-operation text document failed with "error inflating document chunk ops: out of memory".

## 4. Automerge text against plain values

Pardner replaces whole field values and never splices text, so text buys nothing it uses.

| Operations | Saved: text | Saved: plain | Automerge ops: text | Automerge ops: plain | Open: text | Open: plain | Authoring: text | Authoring: plain |
|---|---|---|---|---|---|---|---|---|
| 1,000 | 1.04 MB | 0.71 MB | 3.1 million | 46,700 | 3.8 s | 0.65 s | 7.7 ms | 5.5 ms |
| 10,000 | 10.4 MB | 7.3 MB | 32.0 million | 476,000 | 51.7 s | 6.5 s | 40.7 ms | 31.1 ms |
| 50,000 | 79.9 MB | 50.0 MB | 159 million | 2.38 million | Cannot load | 58.7 s | Cannot load | 169 ms |

Authoring is in-memory: prepare and change. Saved size is one Automerge snapshot.

Plain values are necessary, not sufficient. They remove the WebAssembly cost and the memory ceiling. They do not remove the JavaScript cost of large flat maps, or the slow load path.

## 5. The decision rule

At 10,000 operations:

| Condition | Result | Evidence |
|---|---|---|
| Signing adds under 10% to authoring time | **Holds** for the signature: 0.21% (text), 0.27% (plain). A separate durable signature write before acknowledgement would add 10–19%, so it must stay off that path | Measured |
| Verification keeps up with 50 operations a second | **Holds.** The check uses about 1% of the budget. Automerge's apply is the limit: 81 changes a second in batches of five, 34 one at a time | Measured |
| The document opens in under 3 s | **Fails.** Text 51.7 s. Plain 6.5 s through automerge-repo. Plain through `A.load` 2.8 s, which is borderline | Measured |
| README bounds (6 s offline open, 10 s convergence) hold with verification on | **Likely at the fixture's size, not shown.** The acceptance fixture is about 700 operations. A full check at 1,000 operations adds 0.15 s, and checking a sync message adds under 1 ms. The text board alone opens in 3.8 s at 1,000 operations, so the margin under 6 s is thin today. At 10,000 plain operations a new replica's first sync already takes 10.2–10.4 s; the 10 s bound applies to existing replicas after communication returns, but the margin is gone | Reasoned from measured parts; the acceptance suite was not run |

By the rule, Automerge text does not stay. The mechanism choice stands: signing is not the problem.

## Recommendation

- **Signature transport: A**, a second Automerge document `signatures`, sharded by the first byte of the change hash. Each value is the 64-byte signature. The signer is read from the change's actor prefix, never from the entry.
- **Unsigned or badly signed changes: apply and flag, never refuse.**
  - "signature pending" while the signature document has not caught up with the sender;
  - "unattributed: relayed by <machine>" once it has;
  - "made by a removed machine" when the signer's removal is held.
- **Writers** sign each change at once (0.08 ms) and save the entry with the next background save. At start-up they write back any of their own entries that are missing.
- **Hub acknowledgement** covers the heads of both documents.
- **Actor suffix:** 8 random bytes each time a document is loaded. The creation change uses the machine actor.
- **Text storage:** store every string Pardner writes as a plain value. This is a breaking storage change, so it belongs in 1b, where prior installs are already rejected and preserved.
- **Open time:** before 1d, cut open time at 10,000 operations below 3 s. Candidates (**reasoned**): open with `A.load` instead of automerge-repo's incremental path; stop copying each payload into the `operations` log three or four times; shard or bound the flat maps. This is outside the trust work but gates it, because a new replica's first full check sits on top of the open.

**Trade-offs of A.**
- A change can be visible before its signature. That is milliseconds in normal running and the length of an outage after a cut.
- The signature document can be tampered with, though not forged, and tampering with it is not attributed.
- The hub acknowledgement grows to two documents.

In exchange, A keeps automerge-repo's sync untouched, keeps every peer converging, adds no store and no protocol, and relays signatures through any peer.

**If the gap is ever unacceptable** (**reasoned**): a hybrid would carry signatures on the sync messages, as B does, but keep A's apply-then-flag rule. That closes the gap and the tampering. It brings back B's durable table, its `fsync` on the relay path and its coupling to automerge-repo's message shapes. It was not built.

## Changes needed in the design doc

In [PARDNER-TRUST-DESIGN.md](../PARDNER-TRUST-DESIGN.md):

1. **Section 2, "Stale signers".** Replace "refuse any new record or change from a removed machine from the moment they hold the removal" with: the gate refuses sessions from a removed machine once a peer holds the removal. A change from a removed machine that still arrives, for example relayed by a member, is applied and flagged "made by a removed machine". It is never refused, because refusal blocks every later change built on it and leaves peers diverged (this spike, section 1). Records keep the current rule: a record is data in the document, so not counting it does not split the document.
2. **Section 2, "Demoted signers".** It says "the same arrival-time rule". Say that for changes this means flagging, as in item 1.
3. **Section 3, "Actor IDs".** Replace "8 random bytes chosen at each process start" with "8 random bytes chosen each time the document is loaded". Add: the creation change is made with the machine actor (`Automerge.from(data, { actor })`), because `Repo.create` uses a random one.
4. **Section 3, "What is signed".** State that `changeHash` is the raw 32-byte Automerge change hash, as `getChangesMetaSince` reports it. It equals SHA-256 of the change chunk after its 8-byte header (measured), so no decoding is needed.
5. **Section 3, "What a peer checks".** Replace "the signer was a member machine when the peer received the change" with: the signature verifies, the actor prefix names the signing machine, and the signer was a member. A change that fails is flagged, not refused.
6. **Section 3, "Where signatures travel".** Record the choice: a second Automerge document, sharded by the first byte of the change hash, synced by automerge-repo. Writers save their entry off the acknowledgement path and repair missing entries at start-up. Each peer keeps a grow-only cache of verified signatures.
7. **Section 3, "Unsigned or badly signed changes are never silent".** Drop the exchange branch. Add the three states above and the rule that turns "pending" into "unattributed".
8. **Section 3, "Equivocation".** "Automerge refuses the second on each side" is right for `merge` (measured). What automerge-repo does when such a change arrives by sync is unverified.
9. **Backup, restore and loss, "Restoring".** "Each process picks its own actor suffix" becomes "each load picks its own actor suffix". Add that the signature document is part of the repository storage and so of the cold backup.
10. **Required services and outages, Hub row.** Add that the hub's persistence acknowledgement covers the board and the signature document.
11. **Rollout, spike.** Record the outcome: signing and verification pass; open time fails at 10,000 operations; text goes. Add the open-time work as a step before 1d.
12. **Validation plan.**
    - Row "A change with a missing or bad signature": "Applied and flagged as pending, then unattributed; never refused or dropped".
    - New row: "A change from a removed machine is relayed by a member. It is applied and flagged; every peer converges".
    - New row: "A signature arrives after its change. Pending, then attributed".
    - New row: "Two handles of one document in one process. Distinct actors; no duplicate sequence numbers".
13. **Decisions table.**
    - "Revocation": "Enforced from arrival at the gate. Changes from a removed machine that still arrive are flagged, not refused".
    - "Text storage": "Plain string values. Automerge text crossed the decision rule".
    - "Signing": add "in a second Automerge document".

The [plan](../PARDNER-TRUST-PLAN.md) would also need:
- a storage step for plain values and open time, in 1b or before 1d;
- for 1d, a note that the hub acknowledgement covers two documents.

## Open risks and what is unproven

- **Open time is not solved.** Plain values through `A.load` take 2.8 s, under the 3 s rule by little, and that is the load alone. No variant was built that passes the rule through the Repo.
- **A's "pending" rule is untested.** The rule that turns "pending" into "unattributed" using sync state was not built.
- **A's tampering mitigations are untested.** The local cache and the start-up repair were not built.
- **Flags differ by arrival.** Under A, "made by a removed machine" depends on when a peer learned of the removal. The documents converge, but two peers can show different flags for one change. A rule based on causal order, which flags the changes that do not precede the removal, would make every peer agree. It was not built.
- **The B availability failure is not confirmed fixed.** Two `find` failures happened before the framing fix and none after, in six runs. That is too few to rule it out. It concerns any design that delays or rewrites automerge-repo's messages, including the hybrid.
- **Equivocation through automerge-repo is unverified.** If a "duplicate seq" error is thrown during `receiveSyncMessage`, it may break that document's sync with the peer.
- **Topology.** All nodes ran in one process, on localhost, on one machine shared with other agents. Separate processes, real networks and slow disks are untested. So are power loss, Windows and Linux.
- **Fixtures.** The documents are synthetic. A real board's mix and history depth may differ. The 50,000-operation documents have 41 actors and 41 heads.
- **Not run.** The acceptance suite and the 20-seed qualification. The README bounds are reasoned, not shown. `test:cli` and `test:ui` were not run with machine-prefixed actors.
- **First sync at 10,000 operations.** It took 10.2–10.4 s even with plain values and A, so a large board's first sync is slow before any trust work.
