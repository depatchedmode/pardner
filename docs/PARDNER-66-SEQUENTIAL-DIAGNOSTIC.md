# Issue 66 sequential diagnostic replay

**Qualification remains FAILED.** One instrumented invocation of the original
full acceptance scenarios for seeds 1–5 completed successfully. It did not
reproduce the original 2,384.036 ms acknowledgement failure and does not replace
the required uninterrupted 20-seed gate. No implementation repair is supported
by this result; PR101 remains draft with `needs-qualification`.

## Question and bounds

The coordinator authorized a separate **30-minute total budget**, starting
November 4, 2026 at 21:04:43 UTC, with a 21:34:43 deadline. The distinct hypothesis
was that complete predecessor seeds 1–4 accumulate scenario, child-process or
event-loop effects that a seed-5-only run omits.

Exactly **one** invocation ran, from 21:06:00 to 21:18:15 UTC, under a
1,500-second watchdog. Its measured duration was 735.143 seconds. Setup,
inspection, cleanup and publication stayed within the total budget. There was
no restart, second replay, direct-HTTP substitution, synthetic load, product
edit or new 20-seed gate. The original fixture, CLI process path, scenarios,
assertions and timing limits were unchanged. The program retained its normal
stop-on-first-failure behavior; no failure occurred.

## Frozen candidate and probe

Tested head: `f708fe69511a6a8714b5337dac4d977804f89680`.
Base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`.
Implementation head: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Source/test/lockfile/build fingerprint, unchanged before and after:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Later publication changes documentation only.

The run used Node **24.11.1**, the frozen UI build and the matching installed
root/UI dependencies. Installed package versions and integrity entries were
checked against both lockfiles. Playwright **1.62.1** launched the original
pinned `chromium-1234` fixture with two contexts per seed. This diagnostic did
not add a separate WebKit run.

The reviewed preload remained outside the candidate at
`/tmp/pardner-101-sequential-probe.mjs`. It forwards the original spawn, HTTP,
workspace and persistence arguments, receivers, resolved values and rejections.
It does not change request bodies, credentials, headers or admission. The CLI
response object and JSON result are preserved. The host/process observer was
restricted to the actual acceptance driver; service/client probes remained as
reviewed. Its hash stayed constant throughout the run.

Instrumentation adds imports, AsyncLocalStorage, promise boundaries and
synchronous trace writes. These can perturb timing and scheduling, so this is
an **instrumented diagnostic**, not uninstrumented qualification evidence.
Phase correlation covers CLI `task.update` operations. All operation kinds
retain the original acceptance assertions and receipt-inclusive timing records.

The probe records monotonic parent spawn, child preload, request, server HTTP
admission, workspace admission/queue, preparation/change, persistence flush,
response, child exit and parent-close spans. It also records process CPU
counters, one-second aggregate host pressure and driver event-loop delay. A
bounded read-only observer sampled the owned driver's RSS and descendants every
two seconds; its clock alignment with Node was checked. No request body,
authorization header, token or credential is emitted by either observer.
Original browser/service artifacts remain private.

## Audited results

All five full reports and their summary digests were checked. The audit
reconstructed **3,595 acknowledged operations** from independent intent
manifests, reverified five retained snapshots and checked all **15 recorded
live replica-verification results**, schema5 request/stored identities and
unchanged limits. Deterministic worker handoff effects also passed their
existing assertions; this is not native-session or human-acceptance evidence.

| Seed | Maximum receipt-inclusive acknowledgement | Traced task updates |
| --- | ---: | ---: |
| 1 | 1,686.246 ms | 202 |
| 2 | 653.403 ms | 202 |
| 3 | 359.814 ms | 202 |
| 4 | 299.685 ms | 202 |
| 5 | 290.171 ms | 202 |

All **1,010 task-update phase chains** are complete. The largest difference
between the outer acknowledgement and measured spawn-to-close span was
13.029 ms; the probe does not pretend to cover that outer setup/parsing/scheduling
interval. Other measured maxima were 60.913 ms UI visibility, 2,404.595 ms
offline restart, 4,677.679 ms convergence and 496.005 ms worker-effect
acknowledgement, all within the unchanged limits.

The slowest traced request was `seed-1-operation-666`, with 1,685.888 ms from
spawn to close and 1,686.246 ms outer acknowledgement. Its observed intervals
included 222.721 ms spawn-to-preload, 172.283 ms preload-to-request,
668.324 ms preparation/change, 385.330 ms persistence flush and 123.391 ms
child-exit-to-parent-close. Server application took 1,054.200 ms wall time and
109.818 ms whole-process CPU time over that span. These measurements describe
this successful instrumented request only. A flush span includes queueing,
storage and scheduling; CPU deltas are not exclusive-thread accounting or proof
of a particular waiting mechanism. There is **no threshold-crossing request to
attribute**, and no evidence that this request shares the original failure's
cause.

One-minute host load ranged from 4.23 to 518.50 on 10 logical CPUs; sampled
aggregate CPU busy percentage had a 52.154% median and 100% maximum. Maximum
driver event-loop delay was 269.222 ms. No unrelated workload or host setting
was changed. Load averages are context, not a diagnosis of request latency.

At the first sampled update-phase points, driver RSS was approximately
261.6, 355.7, 401.7, 423.6 and 450.6 MiB across seeds 1–5. Comparable update
phases consistently had 8–9 sampled descendants. RSS growth is observable;
it does not establish retained unreachable objects, a leak, or the cause of the
original miss. No heap dump, forced collection or implementation intervention
was introduced.

## Evidence, cleanup and conclusion

With the pinned Node PATH and this worktree as `subject`, the single command was:

```sh
node scripts/verify-watchdog.js --timeout 1500 \
  --log "$out/run.log" --record "$out/watchdog.json" -- \
  env DIAG_ROOT="$subject" DIAG_DRIVER=1 DIAG_TRACE="$out/trace" \
  NODE_OPTIONS=--import=/tmp/pardner-101-sequential-probe.mjs \
  npm run test:acceptance -- --repeat 5 --seed 1 --output "$out/reports"
```

Exact source copies, commands, hashes, report audits and private traces are in
`output/verification/issue-66-sequential-diagnostic/`. The
[allowlisted evidence record](evidence/issue-66-sequential-diagnostic.json)
contains environment/lockfile hashes, attempt count, per-seed metrics, report
and probe digests, timing limits and causal boundaries. The earlier failed gate
and diagnostic records remain preserved.

The stable heavy lock was acquired **once, nonblocking**, and held through the
children and cleanup. The watchdog exited 0, without timeout, orphaned/hung
processes, survivors or new scratch directories. The read-only observer exited
0 after 332 samples. The owned root, driver and process group were absent after
completion. The lock wrapper exited 0 and its stable file was retained. No
production data/credentials were changed and there is no downstream handoff.

Complete predecessor scenarios were not sufficient to reproduce the miss in
this trial. Intermittent accumulated effects remain possible; the observed
memory and host-pressure changes do not establish causality. Diagnosis stops
here as authorized. No second replay or automatic budget extension is implied.
The original qualification failure remains unresolved, and the coordinator owns
any next decision. #66 native/human acceptance and #67 remain separate.
