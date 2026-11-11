# Board open benchmark (#209)

Run with Node 24.11.1 and the pinned dependencies:

```sh
node scripts/bench-open.js --sizes 1000,10000 --runs 5
```

The script creates only synthetic fixtures in an owned temporary directory and
removes them on completion. Seed 209 chooses prose, task references and comment
lengths. Operation IDs and timestamps are fixed; project identity and Automerge
actors remain randomly generated as in the product. Four Actors (two human, two
agent) author 20% task creates, 45% comments, 20% priority edits, 10% description
replacements and 5% issue links. Titles are 45 characters, descriptions 2,000,
comments 100–599, with periodic mentions. Each operation uses `prepareOperation`,
a handle change and the real `DurableRepo.flush` barrier. Normal upstream
compaction determines the snapshot/incremental layout; fixtures are not committed.

Every measured open uses a fresh Node process and a fresh copy of the persisted
fixture, through `WorkspaceRuntime.init`, with no connected network adapter.
`openMs` runs from script entry through initialization (including imports);
`usableMs` additionally includes the complete `getDoc()` board projection. It
excludes process spawning and browser rendering. Disk cache is not flushed.
`peakRssMiB` is the OS process high-water RSS through the first view; `savedBytes`
is the entire repo directory before reopening. Phases are nested, not additive:
storage reads and decoding are inside find, and flush is inside initialization.
The remainder of find includes the Repo's initial handle update/diff and registration.

All samples include `uptime` and 1/5/15-minute load averages. Summaries give medians
and min/max for all runs and the three samples with the lowest one-minute load
(max of load before and after). Compare the same workload and toolchain, preferably
with one-minute load below 5 on this ten-core machine. Run no competing test suite
while collecting open samples. Builds are slower because they fsync every operation.

Regression procedure: rerun this benchmark after changes to storage, workspace
projection, Automerge or Repo. Investigate a >10% increase in the low-load median
against the recorded baseline; repeat under comparable load before treating it
as a regression. The product goal is initialization below 3,000 ms at 10,000
operations. Report the first-view latency separately. No wall-clock assertion
is added to shared-machine CI. The 6-second offline-reopen and 10-second convergence
acceptance bounds remain separate gates at the acceptance fixture size.

## Implementation and boundaries

The loader uses the pinned Repo 2.5.1 `loadDocData` method to discover and combine
all snapshots and incremental chunks, including overlapping chunks left by an
interrupted compaction. It replaces only decoding with validated `Automerge.load`
(no `unchecked` option), retaining the original document ID, history and heads.
No schema bump is needed: stored values, operation events and backup files are
unchanged. Activity, timeline, trace, request retries and conflict alternatives
continue to read exactly the same records.

A separate loaded-head baseline avoids rewriting a read-only document. It is not
an acknowledgement: `persistedHeads` is still published by the existing queued
flush. Changed heads always await the upstream save before acknowledgement. A
failure retains the loaded baseline so retry still writes. Removal invalidates
that baseline before touching files. The first changed save after loading may
write the full history again, because Repo's private stored-head map cannot be
seeded through its public API. Subsequent writes use its ordinary incremental
saving and compaction. This trades a one-time first-edit cost and temporary
storage duplication for faster open; backup must still include the entire repo
directory. There is no new cache file to recover or invalidate.

The benchmark also measures that first acknowledged edit after the view, outside
the open/memory measurement. Pass `--upstream` to compare the pinned upstream
loader and save bookkeeping with the same workload. Initialization includes the
existing manifest writes, membership harvest and persistence barrier. Nothing
is moved past the ready signal to improve the reported number.

Offline reopen and accepted local work remain independent of the hub. Enrollment,
delivery leases, durable receipt before delivery acknowledgement, transport,
shared-secret admission and recovery requirements are unchanged. No new transport
is introduced, so there is no new direct-peer discovery/reachability decision.
Process kills establish process-crash behavior only, not power-loss durability.

Next options if the three-second goal remains unmet: a schema change that stores
immutable operation payloads once, auditing activity/timeline/trace, request-ID
retries and conflict-alternative readers; or upstream loader/handle initialization
hooks that avoid replaying initial patches and seed save bookkeeping. The former
requires refusing/preserving prior installs and a new storage qualification; the
latter requires an upstream release or a maintained fork and requalification of
initial sync. This change does not establish a hard performance floor.

## Measured results (2026-11-11)

Apple M1 Max, 10 cores, 32 GB. Node 24.11.1, Automerge 3.2.3, Repo
2.5.1. Before is stacked base `28e796723b74a86b64738118d51a04bd3a743176`.
Five fresh-process samples per row; medians (min–max). Units are seconds
and MiB; saved size is bytes. The workload is fixed but randomized project
identity explains the small saved-size difference. Other agents share the host.

| Operations / loader | Open | First full view | Peak RSS | Saved bytes | 1-minute load |
| --- | --- | --- | --- | --- | --- |
| 1,000 / before | 0.792 (0.785–0.804) | 0.926 (0.921–0.943) | 324.672 (303.641–325.906) | 745,186 | 1.75–1.77 |
| 10,000 / before | 6.391 (6.355–6.463) | 7.492 (7.461–7.567) | 1429.484 (1427.453–1431.375) | 7,437,216 | 2.96–3.12 |
| 1,000 / after | 0.656 (0.646–0.664) | 0.790 (0.775–0.804) | 254.000 (247.656–255.531) | 745,196 | 3.08–3.23 |
| 10,000 / after | 4.955 (4.935–5.743) | 6.096 (6.038–6.896) | 1173.422 (1170.141–1177.328) | 7,437,228 | 4.67–8.41 |

At 10,000 operations, the three lowest-load samples' first-view median was
7.492 s before and 6.053 s after. The higher-load after sample reached 6.896 s;
it is retained in the range, not discarded. **The <3 s open target is not met.**

Phase medians at 10,000 operations (seconds; nested times):

| Phase | Before | After |
| --- | ---: | ---: |
| Imports | 0.0689 | 0.0690 |
| Chunk reads (inside find) | 0.0336 | 0.0348 |
| Decode (inside find) | 4.9273 | 2.8493 |
| Repo find, total | 6.2825 | 4.8373 |
| Initialization flush | 0.0003 | 0.0002 |

The remaining find work grows from roughly 1.32 s to 1.95 s, predominantly
Repo's initial handle update/diff after decoding. The first full projection
adds about 1.1 s in both arms. Storage reads are tens of milliseconds.

A separate alternating comparison used the exact same saved fixture, three
fresh processes per loader. At 10,000 operations: upstream open 6.368 s
(6.336–6.398), direct 4.918 s (4.912–4.953); one-minute load 5.08–7.18.
First full view: 7.465 s versus 6.024 s. This is about 23% faster initialization,
not a claim that the host was idle. At 1,000 operations the paired opens were
0.781 s versus 0.650 s at load 7.18–7.46.

The first acknowledged edit costs **0.111 s upstream versus 1.122 s direct**
at 10,000 operations. Its full-history incremental grows repo storage from
7,437,228 to **49,137,284 bytes** (upstream: 7,440,647). The next changed save
qualifies for upstream compaction because incrementals exceed the snapshot.
This temporary expansion is a material cost, not just a smaller cache. At 1,000
operations the first edit is 0.043 s versus 0.147 s.

[Machine-readable summaries](../evidence/board-open-time.json) retain phase
ranges, sample counts and loads. No generated fixtures or private traces are
committed. The routine acceptance seed checks the README bounds at its own
fixture size; the separate 20-seed qualification is still required.

## Verification of this implementation

Node 24.11.1: runtime 205, CLI 22, UI 68, storage/conflict regression 15 and
verification-tooling 39 tests passed without skips. `npm run verify` passed the
UI build, 23 Python tests, 766 Node tests and one acceptance seed. The seed's
maxima were 774.2 ms offline startup and 1,320.9 ms convergence, within the
README bounds at that fixture size. All eight lifecycle mutation demonstrations
passed; the default bounded model retains 174,614 states and 679,456 transitions.
The final source/build fingerprint matched before and after the full gate:
`ed3d2a4700ef5e534f90813c0662d90957b2a48a7dd10ec015f59623552f78a2`.

Qualification is **required, not run**: the orchestrator schedules the 20-seed
acceptance gate for the final candidate. No merge recommendation, real-agent
rehearsal, physical-device or power-loss claim is made. The 3-second goal remains
open; these results are an improvement, not completion of #209.
