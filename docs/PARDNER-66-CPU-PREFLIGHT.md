# Issue 66 controlled-CPU investigation: prerequisite not met

**Qualification remains FAILED.** The authorized controlled-CPU comparison did
not run because preflight found no sustained window meeting the predeclared
quiet criteria. This is an environment prerequisite result, not a new product
failure or a causal explanation for the original 2,384.036 ms acknowledgement.
All earlier failed and passing evidence remains preserved.

The new 30-minute total budget began November 4, 2026 at 22:22:22 UTC. One
nonblocking acquisition obtained the stable heavy-test lock. The read-only
preflight ran from 22:23:25.997 for **236.585 seconds**, below its five-minute
bound. It stopped without starting fixtures or load workers. Cleanup and
publication remained within the total budget.

Frozen head: `fca977c00e17f7d4972c7ea80f4b061b2246edda`.
Base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`.
Implementation: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Source/test/lockfile/build fingerprint was checked unchanged:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
The observer used Node **24.11.1**. No dependency installation, UI rebuild or
application qualification was rerun, and no implementation changed.

## Predeclared design and criteria

Before experiments, the recorded plan was main→candidate quiet arms, then
candidate→main loaded arms, followed by a main→candidate unload recovery pair
if at least eight minutes remained. Each arm would preserve the original
seed-5 offline prefix: 100 tasks, 400 comments, 200 CLI updates, two offline
replicas/browser contexts and restart at update index 85, with original
assertions and limits. No direct-HTTP substitution was planned.

The fixed intervention was **two test-owned workers at 75% duty cycle**, using
100 ms periods and a **90-second maximum** per arm. No ramp, oversubscription or
ramp-until-failure loop was planned. Pressure guards would stop owned load on
unexpected saturation, memory/paging pressure or lost responsiveness. None of
this load or fixture code was executed: the prerequisite failed first.

The quiet criteria used rolling windows of approximately 60 seconds, sampled
every two seconds. These were conservative control criteria for this experiment,
not product acceptance limits:

- CPU mean ≤25%, p95 ≤40%, peak ≤60%.
- Runnable-process p95 ≤3 and peak ≤5; blocked-process p95 ≤2.
- One-minute load ≤5 on this 10-logical-CPU host, alongside the other metrics.
- Observer event-loop p95 ≤40 ms and peak ≤150 ms.
- Normal macOS memory-pressure level, at least 15% reported memory free, and no
  swap-out or page-out growth within the window.

The observer read aggregate CPU counters, process-state counts, load averages,
event-loop delay, `memory_pressure -Q`, the read-only memory-pressure sysctl and
`vm_stat`. It did not inspect or emit process command lines, credentials or
request bodies. No unrelated processes, applications or host settings changed.

## Result and interpretation

The audit reconstructed **87 evaluated windows from 116 samples**. **Zero**
windows met all criteria. Every evaluated window failed CPU-spike and
runnable-process criteria. Additional failures were CPU mean in 34 windows,
load in 84, and page-out growth in 21. Criteria were not loosened after observing
the result.

Across all samples, CPU mean was 25.368%, p95 59.803%, and peak 76.352%.
Runnable-process p95 was 24, with a peak of 46. Load ranged from 2.55 to 13.86.
Memory pressure stayed normal, reported free memory ranged from 60–69%, and
there were no swap-outs. Page-outs increased by 18 pages. The maximum observer
event-loop delay was 21.414 ms.

The final 61-second window had mean CPU 19.072%, normal memory pressure and a
responsive event loop. It still failed the predeclared CPU p95 bound
(40.483% versus 40%) and runnable bounds (p95 6 and peak 19 versus 3 and 5).
Low mean CPU alone therefore did not establish the specified sustained control
window. Process-state samples are aggregate observations, not attribution to
any particular application or proof of the original failure's cause.

There were **zero quiet fixture arms, zero controlled-load arms, zero recovery
arms and zero CPU workers**. No full acceptance or 20-seed gate ran. There is
no controlled-intervention result to compare or use for a product repair.

## Evidence and cleanup

The supervised preflight command was:

```sh
node scripts/verify-watchdog.js --timeout 275 \
  --log output/verification/issue-66-cpu-diagnostic/preflight.log \
  --record output/verification/issue-66-cpu-diagnostic/preflight.watchdog.json -- \
  node /tmp/pardner-101-quiet-preflight.mjs \
  output/verification/issue-66-cpu-diagnostic/preflight.json
```

The probe had its own absolute preflight deadline. Its external source, exact
command, predeclared design, aggregate samples and reconstructed windows are
retained in private `output/verification/issue-66-cpu-diagnostic/`. The
[allowlisted evidence](evidence/issue-66-cpu-preflight.json) includes criteria,
metrics, source/report hashes, candidate identity, attempt counts and cleanup.

The preflight and watchdog completed with exit **2**, the explicit non-quiet
result, without timeout, orphaned/hung processes, survivors or scratch. The
owned process group was absent before lock release. The wrapper also exited 2,
reflecting that result; the advisory lock was released and its stable file was
retained. No downstream handoff occurred.

The missing prerequisite is a sustained, defensible quiet/control window on
this machine. The coordinator owns any new window or revised predeclared design;
no automatic retry, budget extension or gate rerun is scheduled. PR101 remains
draft with `needs-qualification`. No native/paid session, human acceptance,
production-data change, deployment, merge, archival or issue closure occurred.
