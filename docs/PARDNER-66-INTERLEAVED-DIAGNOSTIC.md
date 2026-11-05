# Issue 66 interleaved CPU diagnostic

**Inconclusive about the original failure; qualification remains FAILED.** The
fixed CPU intervention actually ran on both sources. Every assigned loaded
update overlapped both workers, every unloaded update avoided their busy
intervals, and all intended effects passed local-replica checks. No 2,000 ms
crossing occurred. Loaded/unloaded acknowledgement medians differed by less than
one millisecond in opposite directions on main and candidate. This provides no
consistent slowdown or causal explanation of the original 2,384.036 ms miss.

All prior failed and passing investigations remain separate, including the two
[v2/v2.1 prerequisite failures](PARDNER-66-CPU-V2.md), which performed zero
controlled updates/workers. Their cleanup, explicit release and publication
finished before this newly authorized investigation. No earlier result is
relabelled. PR101 stays draft with `needs-qualification`.

## Prospective protocol and identities

The new total budget began **2026-11-05 03:08:05 UTC**, with a hard deadline of
03:38:05 UTC including preparation, execution, inspection, cleanup and publication.
The measurement implementation and complete design were written and hashed
before any observation. Design SHA-256:
`4f70261c12499edc39438e2580095623beb09d7f4d84b8f8a6f1016f9e4074f2`.
A copy of the reviewed protocol and exact external sources remain private with
the evidence. Post-run analysis scripts are separately hashed; they did not
change the frozen instruments or measurements.

Checked documentation head: `822e61803e2d7d81b896f828d05e97c190f5ade5`.
Implementation: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Main/base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`.
Subject source/test/lock/build fingerprint:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Main fingerprint:
`3599ddb1c86f0d695120f6fe221c26044d0fd3fbe1fed7350ea11a23354d22d4`.
Both before/after fingerprints matched exactly. No product source, test,
assertion, fixture, timing limit or build changed.

Node was **24.11.1**. Main was an exact disposable base archive, using the same
installed dependencies and a byte-identical copy of the current UI build.
Installed lock metadata matched versions/integrities for 96 root and 191 UI
entries. Playwright was 1.62.1, Automerge 3.2.3 and Automerge Repo 2.5.1. Each
fixture actually launched Chromium with two browser contexts. This prefix did
not run a new WebKit or native-provider acceptance check.

Exactly one main fixture and one candidate fixture ran, sequentially. Each
retained the original seed-5 prefix: 100 tasks, 400 CLI comments, two offline
replicas/browser comments, 200 real CLI updates, original operation order and
payloads, and the original restart at update index 85. The unchanged timer
includes the CLI child and its receipt; the bound remains 2,000 ms. Ten blocks
of 20 updates alternate loaded/unloaded conditions. Main begins unloaded and
candidate begins loaded. No direct-HTTP substitution, retry, excluded operation,
extra fixture, ramp or additional experiment occurred.

Two owned Node worker processes per fixture use 75 ms busy work per 100 ms
period, enabled only in loaded blocks. Each has a 90-second cumulative active
cap and 180-second absolute lifetime cap, with redundant parent guards and a
420-second outer command watchdog. Load starts at the update phase. Mode and
CPU snapshot RPCs happen outside the unchanged acknowledgement timer; load also
covers the original `task.show` and restart when these fall in a loaded block.
Every busy interval records monotonic boundaries and actual worker CPU use.

A separate supervised observer asynchronously samples CPU, process states, load,
memory pressure, paging and responsiveness. No synchronous observer subprocess
runs in the timed parent. One initial 10-second observation produced nine
samples with mean CPU busy 20.271%; candidate's one-second observer startup was
not another admission gate. Runnable/load/pageout counts are covariates, not
vetoes. The predeclared stops were non-normal memory pressure, CPU above 85% for
two consecutive samples, or observer/driver delay above 250 ms for two samples;
missing observer heartbeat and failed worker RPC also stop the batch. No guard
fired and no rule changed after measurement began.

## Results and delay localization

Each row below comprises 100 updates in five **correlated blocks**, not five
independent acceptance runs. Milliseconds include the original receipt timer.

| Source / condition | Update median | p95 | Maximum | Range of the five block medians |
| --- | ---: | ---: | ---: | ---: |
| Main unloaded | 153.796 | 161.768 | 188.485 | 151.322–154.994 |
| Main loaded | 154.062 | 187.538 | 261.069 | 132.258–156.093 |
| Candidate unloaded | 154.405 | 188.712 | 262.349 | 132.029–155.663 |
| Candidate loaded | 153.607 | 168.238 | 211.554 | 151.355–155.270 |

The loaded-minus-unloaded medians are +0.266 ms on main and −0.798 ms on
candidate, much smaller than block variation. Opposite starting conditions
expose an operation/order effect: the lowest block median is block 5 in both
sources, which is loaded on main and unloaded on candidate. This is descriptive,
not a demonstrated cache/restart mechanism. The restart remains in block 4 and
is included; its measured durations were 2,123.870 ms and 2,096.114 ms, within
the unchanged 5,000 ms bound.

The largest acknowledgement in each fixture was the same scripted operation,
`seed-5-operation-698`, in opposite conditions: main loaded (261.069 ms) and
candidate unloaded (262.349 ms). Its measured flush spans were 119.069 ms and
119.483 ms. Spawn-to-preload was 48.042/48.998 ms; preload-to-request
20.329/20.334 ms; request-to-admission 8.876/8.442 ms; admission-to-execute
0.348/0.403 ms; queue 0.091/0.088 ms; prepare/change 52.305/50.952 ms;
flush-to-response 0.803/1.079 ms. Remaining response/body/exit spans are retained
in the evidence. These localize these recorded observations, not the original
untraced miss. A `flush` span is an awaited persistence interval, not proof that
a particular disk operation or scheduling mechanism caused its duration.

Across all 400 updates, measured maxima for main/candidate respectively were
56.095/63.605 ms spawn-to-preload, 22.745/33.947 ms preload-to-request,
10.409/12.525 ms request-to-admission, 6.697/7.298 ms admission-to-execute,
0.383/5.881 ms queue, 53.877/83.689 ms prepare/change and 119.069/119.483 ms
flush. The allowlisted evidence retains every phase maximum and block aggregate,
including response and child-exit intervals. Maxima are from different requests
and must not be added together as one request.

## Did the work and intervention happen?

Both fixtures completed all ten blocks and 200 updates, producing **400 complete
phase chains**, zero incomplete chains, zero non-success traced responses or
CLI exits, zero mode mismatches and zero worker-coverage gaps. Both workers had
positive measured CPU in busy intervals overlapping every assigned loaded
request's traced spawn-to-close interval. No worker busy interval overlapped an
unloaded request. Busy-interval CPU cannot be apportioned exactly to the portion
of an interval inside a request; the report claims overlap, not per-request
CPU attribution.

Main workers were active for 32.408/32.481 seconds and consumed 24.158/24.225
CPU-seconds inside their busy intervals. Candidate workers were active for
33.314/33.314 seconds and consumed 24.699/24.765 CPU-seconds. These are about
74–75% of active time per worker, consistent with the requested duty cycle;
combined demand is approximately 1.5 logical CPUs during loaded blocks, below
the ten-logical-CPU host capacity. Worker lifetimes were under 61 seconds.
Neither active nor lifetime cap expired.

The median of block CPU medians increased from 37.598% unloaded to 48.403%
loaded on main, and 35.930% to 50.519% on candidate. Host CPU peaks over the
whole fixtures were 60.000% and 83.414%. Memory pressure stayed normal, swapout
counters unchanged, while pageouts increased 31 and 8. Runnable peaks were 15
and 17; blocked peaks 2 and 4. These are measured covariates, not evidence of
saturation. Observer loop peaks were 20.857/23.904 ms and driver peaks
20.251/24.232 ms. Background CPU variation and the main-before-candidate order
remain confounders; this was not a perfectly isolated or identically quiet pair.

Each fixture recorded **706 intents and 706 receipts**: 504 shared setup
operations, two browser comments and 200 CLI updates. The existing
`ExpectedOperations` checker reconciled task fields and operation
identity/payload/provenance, comments and read receipts in the authoritative
local replicas. Each source produced snapshot counts of 504 on the hub, 597 on
one offline replica and 613 on the other, retaining the correct shared-plus-local
operation sets. All checks passed; there were no hidden retries or excluded
failures. This is service readback plus saved-locally receipt evidence, not a
new power-loss durability test or the full acceptance scenario.

## Limits, evidence and cleanup

The benchmark checklist supports an **inconclusive** verdict: there is no
consistent slowdown, no established limiter for the original failure, and no
independent repetition supporting a production effect claim. This explicitly
authorized two-fixture design does not meet five independent full runs per
condition. Synchronous phase-log appends, worker RPCs, observers, tracing,
operation order, restart and cache state can affect timings. No uninstrumented
profile run or production capacity claim is inferred. The original failure had
no phase trace; an ordinary overhead difference or passing diagnostic cannot
identify its cause. This intervention does not rule out a different intensity,
kind or transient episode of contention, nor establish a PR101-specific defect.

[Allowlisted evidence](evidence/issue-66-interleaved.json) retains prospective
hashes, identities, exact counts, all block aggregates, phase maxima, operation
and snapshot digests, host covariates and cleanup outcomes. Raw traces, browser
archives, service logs, manifests and snapshots remain private under
`output/verification/issue-66-interleaved/`. Exact external commands use the
frozen fixture driver with `--seed 5 --repeat 1`, Node's phase preload and a
420-second watchdog; the frozen batch and every measurement source are retained.

Both watchdogs exited 0 after 130.950 and 120.666 seconds. All four workers and
two observers exited 0; browser/service/gate cleanup completed normally.
Watchdogs recorded no timeouts, hung processes, survivors or new scratch.
A subsequent process audit found no attributable survivors. The owned baseline
archive was removed, source/build and instrument hashes remained unchanged, and
the lock wrapper explicitly exited 0 at 03:22 UTC. The stable lock file remained
present with the same inode; it was not unlinked or reacquired. No unrelated
process, app, host setting, production storage or credential changed.

The measurement is complete; the cause remains unresolved. No further amendment,
experiment, product repair, full-20-seed gate, merge, label clearing, deployment,
native/paid session, human acceptance, issue closure or downstream handoff was
performed. Root owns the next decision. #50/#66 human/native acceptance and #67
remain separate; passing these diagnostics does not complete them.

Publication verification is separate from product qualification. The refreshed
planner against the pre-publication HEAD classifies only the three documentation
and evidence paths, with zero unclassified paths and no new qualification
trigger. Semantic review found no change to storage, sync, recovery, authority,
lifecycle mappings or accepted behavior. JSON/count/hash invariants, local links
and whitespace/diff checks passed. No routine suite/model/full acceptance rerun
was performed for this documentation-only publication. The existing product
qualification failure is retained and continues to block merge readiness.
