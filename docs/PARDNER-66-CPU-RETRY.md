# Issue 66 quiet-window retry after reported idle state

**Qualification remains FAILED.** After the user reported “Machine is idle
now,” one newly authorized preflight retry ran on this machine. It did not
meet the unchanged runnable-process criteria, so no fixture or controlled-load
arm ran. This supplies no new causal evidence about the original latency miss.
It does not contradict the report of low machine activity or establish general
CPU/memory saturation.

The fresh 30-minute budget began November 5, 2026 at 02:42:01 UTC. Preflight
lasted **283.234 seconds**, within its five-minute bound. Setup, audit, cleanup
and publication stayed within the total budget. There was one nonblocking
stable-lock acquisition and exactly one preflight attempt; no further retry,
threshold relaxation or budget extension followed.

Checked head: `c89185191247ab3370a7b6a3a671b9dfd7a7a1b7`.
Base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`.
Implementation: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Source/test/lockfile/build fingerprint remains:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Node was **24.11.1**. There was no rebase, product change, dependency installation
or UI rebuild; no application qualification was rerun.

## Unchanged prerequisite and observations

The [previous preflight criteria](PARDNER-66-CPU-PREFLIGHT.md) and observer were
retained exactly. Source comparison confirmed that only the external observer's
absolute deadline changed. The original failed preflight and all earlier gate
and diagnostic results remain separate and intact.

The audit reconstructed **110 evaluated rolling windows from 139 samples**.
None qualified. Runnable-process criteria failed in all 110 windows; load
failed in 37 early windows. CPU, blocked-process, event-loop, memory-pressure
and paging criteria did not fail any evaluated window.

Across all samples, mean CPU activity was 20.244%, p95 28.909%, and peak
34.581%. Runnable-process p95 was 7, with a peak of 15. Load ranged from 2.62
to 6.76. Memory-pressure level remained normal, reported memory free was 76–78%,
and no swap-out or page-out growth occurred. Peak observer event-loop delay
was 14.213 ms.

In the final 61-second window, mean CPU activity was 18.785%, p95 22.239%, and
peak 22.441%. All checks except runnable counts passed. Runnable p95 was **7**
and peak **8**, versus the unchanged required bounds of **3** and **5**.
The observer's own activity is included in aggregate process-state sampling;
no particular unrelated process was identified or manipulated.

These are conservative experimental control criteria, not product acceptance
limits or a determination that bounded CPU load would necessarily be unsafe.
The user explicitly required stopping if the unchanged prerequisite failed.
It was therefore not loosened or bypassed to obtain a comparison.

## Unexecuted design and cleanup

The planned order remained main→candidate quiet, candidate→main loaded, then
main→candidate unload recovery if time permitted. The fixed load was two owned
workers, 75% duty cycle, 100 ms periods and a 90-second cap. An external
controller with cleanup and pressure guards was prepared but **never executed**.
No fixture source archive or application service was created. There were zero
fixture arms, load workers, recovery arms, full acceptance runs or 20-seed gates.

The exact supervised command was:

```sh
node scripts/verify-watchdog.js --timeout 290 \
  --log output/verification/issue-66-cpu-retry/preflight.log \
  --record output/verification/issue-66-cpu-retry/preflight.watchdog.json -- \
  node /tmp/pardner-101-quiet-retry.mjs \
  output/verification/issue-66-cpu-retry/preflight.json
```

External source, the preserved design, aggregate samples, window reconstruction
and cleanup are retained under private
`output/verification/issue-66-cpu-retry/`. The
[allowlisted evidence](evidence/issue-66-cpu-retry.json) records the exact
identities, unchanged criteria, hashes, observations and zero executed arms.
No credentials, request bodies or process command lines were emitted.

The preflight/watchdog completed with exit **2**, the explicit non-quiet
result, without timeout, orphaned/hung processes, survivors or scratch. The
owned process group was absent before release. The lock wrapper also exited 2,
released the advisory lock, and retained its stable file. There is no downstream
handoff. No unrelated process, application or host setting was changed.

The missing prerequisite is a window satisfying the unchanged predeclared
runnable/control criteria. The coordinator owns any future environment or
predeclared-design decision. No automatic retry, product repair, gate rerun,
merge, deployment, native/paid session, production-data change, archival or issue
closure is authorized by this result. PR101 remains draft with
`needs-qualification`; the original qualification failure remains unresolved.
