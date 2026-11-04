# Issue 66 latency investigation, November 4, 2026

**Qualification remains FAILED.** The original 2,384.036 ms acknowledgement
against the unchanged 2,000 ms limit is preserved. This separate investigation
measured normal CLI overhead, but did not establish the cause of that miss or
justify a product repair. It supplies no merge recommendation, full acceptance
pass, native participation or human acceptance.

The coordinator authorized a new **45-minute total** diagnostic budget after the
previous failed-gate publication and explicit lock release. It began at
20:48:07 UTC, with a 21:33:07 deadline. Experiments finished at 21:00:19; cleanup
and lock release followed before publication, within the budget. The original
20-seed failure and both earlier passing seed-5 comparisons remain in
[the integrated evidence](evidence/issue-66-integrated.json).

## Candidate and method

Main was `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`, fingerprint
`3599ddb1c86f0d695120f6fe221c26044d0fd3fbe1fed7350ea11a23354d22d4`.
PR101 was `9d1e8329ca9bb7695c0ee7874a5ddde38cbafd88`, implementation
`34abcf98b9204bc1b564774a84554429c20d35c1`, fingerprint
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Neither implementation changed. Guidance-only publication does not alter these
source/test/lockfile/build fingerprints.

Both arms used Node 24.11.1, matching locked dependencies, the same built UI,
and actual pinned Chromium launches with two browser contexts. Main used an
isolated source archive, dependency symlinks to the candidate installs and an
identical copied UI build. The CLI, acceptance script, service helper, request
handler, workspace, runtime and persistence files are byte-identical between
these heads; lockfiles match as well. This narrows the comparison, but does not
prove that the original failure was unrelated to the candidate.

Temporary scripts and preloads stayed outside the candidate. They retained the
real seed-5 prefix: 100 tasks, 400 substantial comments, two enrolled offline
replicas, browser activity, 200 scripted updates with normal expected revisions,
and the original kill/restart after update index 85. They stopped before the
reconnection/conflict/delivery phases. **These are diagnostic prefixes, not full
acceptance runs.** Existing acknowledgement, visibility, restart and convergence
assertions retained their normal limits.

The preload recorded monotonic timestamps at parent spawn, CLI preload entry,
request, server HTTP admission, workspace admission/application, persistence
flush, response, child exit and parent close. It recorded CPU counters and
one-second aggregate host pressure/event-loop samples. No request bodies,
authorization headers, tokens or credentials were logged by the phase probe.
Raw browser traces and service artifacts remain private.

The first setup attempt exposed a probe bug: wrapping `execFile` lost its custom
promisified return shape. That attempt and its clean watchdog result are
retained. The probe was corrected to wrap `ChildProcess.spawn`; no candidate
code changed. An initial idle lock shell's tool handle was lost during context
compaction. Only that owned idle shell was closed, then the diagnostic batch
acquired nonblocking once; there was no contention retry loop or concurrent test.

## Measurements and intervention

Experiment 1 ran main, then candidate, once each. Experiment 2 reversed order
and alternated CLI and direct HTTP updates within each fixture: 100 of each per
arm. Direct requests kept the same attributed operation payload, expected
revisions, authentication, persistence barrier and connection-close header.
This intentionally varied the client path for diagnosis; it is not a proposed
replacement for CLI acceptance coverage.

| Arm | Updates | Acknowledgement median | Maximum |
| --- | ---: | ---: | ---: |
| Main, traced CLI prefix | 200 | 154.089 ms | 262.091 ms |
| Candidate, traced CLI prefix | 200 | 156.048 ms | 264.580 ms |
| Candidate intervention, CLI half | 100 | 154.901 ms | 204.620 ms |
| Candidate intervention, direct HTTP half | 100 | 61.115 ms | 184.511 ms |
| Main intervention, CLI half | 100 | 157.532 ms | 302.470 ms |
| Main intervention, direct HTTP half | 100 | 62.344 ms | 186.668 ms |

All 800 update phase chains were complete. Their totals account for the outer
acknowledgement within 0.582 ms. In the original CLI prefixes, median spawn to
preload was 49.195/50.868 ms, preload to request 20.819/21.671 ms, and server
application 58.422/58.421 ms, for main/candidate respectively. Persistence flush
maxima were 118.786/119.728 ms. The original failing operation ID,
`seed-5-operation-661`, took 155.215/182.505 ms from spawn to close here.

Removing fresh-process/cold-client work reduced median observed acknowledgement
by 93.786 ms on the candidate and 95.188 ms on main. Median server application
remained approximately 58–59 ms for both client modes. That supports a causal
contribution from the ordinary client path. It does **not** assign the original
2,384 ms outlier to startup, scheduling, persistence or PR101. The intervention
removes both process startup and cold HTTP-client initialization; it does not
isolate OS scheduling alone.

Host pressure was not held constant. One-minute load ranged from 3.67 to 10.64
across the four arms on 10 logical CPUs. The candidate's first arm observed a
97.6% aggregate CPU-busy interval. Guarded two-worker load scripts were prepared
but **never executed**: adding synthetic load on this busy host would not be a
controlled comparison. No workers were started and no unrelated processes or
host settings were changed. These conditions are materially different from the
215.19 load average observed after the original failure.

All four prefix watchdogs exited 0, with no timeouts, hung processes, survivors
or leftover fixture directories. The setup-fault watchdog exited 1 and also
cleaned up. Candidate fingerprints remained stable. No new full seed or 20-seed
gate was run. Probe imports and synchronous trace writes add measurement
overhead, so these observations cannot substitute for uninstrumented gates.

## Commands, evidence and next decision

The exclusive advisory lock at `/tmp/pardner-selfhost-heavy-tests.lock` was held
across both command batches. Under the pinned Node PATH, the external drivers
invoked this command for each recorded arm (with its own root, trace and output
directories):

```sh
DIAG_ROOT="$tree" DIAG_DRIVER=1 DIAG_TRACE="$out/$arm/trace" \
NODE_OPTIONS=--import=/tmp/pardner-101-phase-probe.mjs \
node "$subject/scripts/verify-watchdog.js" --timeout 600 \
  --log "$out/$arm/run.log" --record "$out/$arm/watchdog.json" -- \
  node "/tmp/pardner-101-$variant.mjs" --seed 5 --repeat 1 \
  --output "$out/$arm/report"
```

The external batch commands were `bash /tmp/pardner-101-phase-arms.sh` and
`bash /tmp/pardner-101-direct-arms.sh`. Exact commands, source copies, watchdogs,
per-process phases, dependency/path comparisons and report digests are retained
under private `output/verification/issue-66-phase-diagnostic/`. The
[curated evidence](evidence/issue-66-phase-diagnostic.json) records source hashes,
all attempt counts, phase summaries and cleanup. Counts are one setup fault,
two traced prefixes, two alternating-request prefixes, zero synthetic-load
runs and zero new full acceptance runs.

Both intervention arms again failed to reproduce or localize the original
miss. Further identical runs would seek green results without testing a new
mechanism, so diagnosis stopped. No preexisting product defect or PR101
regression was established, and no repair was added to PR101.

The next falsifiable hypothesis is a transient parent/child scheduling or
event-loop stall, versus waiting inside the persistence queue/flush. A fresh
threshold-crossing operation must show which interval grew: before admission,
inside server application/persistence, or after the response/child exit. The
blocker is the absence of a phase trace for the original failure and inability
to reproduce it under observed conditions. One possible next decision is a
separately authorized, traced seed-1-through-5 diagnostic replay with unchanged
limits, a bounded watchdog and host-pressure observation. That replay has not
been run or treated as permission for a new full 20-seed gate.

All recorded owned processes were absent after the watchdogs drained; the
disposable baseline archive was removed. The lock wrapper exited 0 and its
stable file was retained. There is no Cloud handoff. The coordinator owns the
next diagnostic/qualification decision and merge. Draft status and
`needs-qualification` remain; #66 native/human acceptance and #67 remain separate.
