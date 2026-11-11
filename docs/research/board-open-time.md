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
