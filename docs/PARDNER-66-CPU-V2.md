# Issue 66 prospective CPU designs v2 and v2.1

**Qualification remains FAILED.** V2 global preflight passed. The first v2
quiet arm and the one authorized v2.1 replacement arm then stopped at retained
diagnostic prerequisites before any of the 200 scripted CLI updates or CPU
workers started. No matched quiet/load comparison occurred. These are unmet
experimental criteria, not demonstrated environment or product defects.
The original 2,384.036 ms qualification failure remains unexplained.

The single total budget began November 5, 2026 at 02:53 UTC and ended at
03:23 UTC. V2.1 was authorized within that same deadline, without an extension.
Both stopped attempts and their private traces are retained separately. Root
confirmed stopping after v2.1; no additional amendment or arm followed.

## Frozen identities and prospective changes

Checked branch head: `ef0eec9c3140f7b17dc73ad4bf65cfa5dabe69f2`.
Implementation: `34abcf98b9204bc1b564774a84554429c20d35c1`.
Main/base: `e0fee59cbdeac55733aca15de73d45c2e2d14bfb`.
Candidate source/test/lockfile/build fingerprint stayed unchanged:
`0b0e483ec7c790f90ad50973e0dabcab19ca5b8e34f8267f1ad1b9e5a3ad3ca3`.
Main fingerprint:
`3599ddb1c86f0d695120f6fe221c26044d0fd3fbe1fed7350ea11a23354d22d4`.
Node was 24.11.1. Installed versions/integrities matched both dependency locks;
main used dependency symlinks and an identical copied UI build. No product
source, fixture, operation semantics, assertion or acceptance limit changed.

V2 was written and hashed **before measurement**:
`80dd617dff3effe4e783d0c5049c11632fa7d83f85f31005c689fa4a446849a9`.
It removed the process-state `R` count as a preflight/post-fixture veto and the
`runnable >8` continuous-stop analog. Runnable counts remained measured
covariates. All other preflight criteria and continuous guards were retained.
A process-state count is not a capacity-grounded measure of CPU contention on
this 10-logical-CPU host. Prospective CPU headroom and responsiveness support a
limited paired intervention; they do not establish perfect isolation or the
original failure's cause. V1 results remain failures of V1, not retrospective
passes of V2.

V2.1 was separately written and hashed **before its new arm**:
`e35a402c0711aa8ef04cfdb21b8e924c19c4e8ceb770ddc05bb73b82cd4207ce`.
It retained the passed global preflight and removed **only** the post-fixture
10-second `load1 <=5` veto, keeping load measured. Exact controller-source
comparison confirmed that no other check changed. The rationale was that the
lagging load average immediately after fixture creation includes the fixture's
own work and cannot independently identify background contention.

The intended sequence remained main→candidate quiet, candidate→main loaded,
then optional main→candidate recovery if the original time condition permitted.
Load was fixed at two owned workers, 75% duty, 100 ms periods and a 90-second
cap, starting at the update phase. External tracing/controller code was prepared
to record per-thread CPU and update coverage. It never started load. Tracing and
observer overhead remains a limitation; no intervention effect can be estimated.

## V2 observations

Global preflight passed with CPU mean 17.514%, p95 27.627%, peak 28.881%,
and event-loop peak 14.615 ms. Runnable p95 7 and peak 10 were retained only as
covariates. Other global criteria, including load, blocked processes,
memory/paging and responsiveness, remained unchanged.

The first main-quiet arm created the original 100 tasks and 400 comments,
enrolled two replicas, launched two browser contexts, partitioned the replicas
and acknowledged the two browser comments. Its retained 10-second idle-fixture
check then stopped solely on load1, observed at 5.595–5.947 against a bound of 5.
Current CPU mean was 16.984%, peak 23.494%, event-loop peak 19.481 ms, memory
pressure normal and paging counters unchanged. The lagging average may include
fixture setup. It is not proof of unrelated saturation.

The watchdog exited 1 after 69.005 seconds, without timeout or cleanup failures.
The 506 setup receipts were checked against their intents, replica identities,
schema5 request/stored IDs and normal acknowledgement limit. Maximum
receipt-inclusive acknowledgement was 172.713 ms. There is no retained final
snapshot for this aborted prefix, so no full-state or complete-scenario pass
is claimed. The 200-update loop and restart-at-85 stage were not reached.

## V2.1 observations

After the explicit prospective amendment, exactly one new main-quiet arm
recreated the same fixture. The load veto was absent and load remained recorded.
The retained zero-paging-growth check then stopped the arm: `Pageouts` increased
from 12,256 to 12,258 during the 10-second observation. `Swapouts` stayed at
851,516, memory-pressure level stayed normal, CPU mean was 21.078% with peak
27.098%, blocked-process peak was 1, and event-loop peak was 19.333 ms.

**Two Pageouts with normal pressure is not proof of saturation.** This is a
brittle diagnostic criterion unmet, not an environment or product defect.
The CPU, blocked-process and responsiveness checks passed. No guard was silently
removed or relaxed after observing this result, and the amended arm was not
repeated.

The 506 setup receipts again passed their existing checks; maximum
receipt-inclusive acknowledgement was 174.607 ms. No 2,000 ms crossing occurred.
There is no final snapshot or completed scenario result. The watchdog exited 1
and reclaimed no orphaned/hung processes; fixture cleanup completed normally.

Across both designs: two main-quiet arms started, zero completed, zero candidate
arms, zero load/recovery arms, zero scripted update-phase operations and zero
CPU workers. There are no worker CPU contribution or phase-delay measurements
for the intended intervention. The setup timings do not explain the original
qualification miss.

## Evidence, cleanup and boundary

[Allowlisted v2 evidence](evidence/issue-66-cpu-v2.json) and
[separate v2.1 evidence](evidence/issue-66-cpu-v2-1.json) contain design hashes,
source hashes, identities, environment checks, aggregate observations, partial
receipt audits and watchdog/cleanup outcomes. Exact commands, external source
copies and credential-bearing raw browser/service traces remain private under
`output/verification/issue-66-cpu-v2/` and
`output/verification/issue-66-cpu-v2-1/`.

The external batches used the original diagnostic prefix with `--seed 5
--repeat 1`, one 300-second watchdog per attempted arm, a hard budget reserve,
and the reviewed external phase preload. No original workload or timing-limit
change, direct-HTTP substitution, ramp or oversubscription occurred.

V2's lock was explicitly released after cleanup. V2.1 then made the separately
authorized single nonblocking acquisition, held it through its children and
cleanup, and explicitly released it. Both wrappers exited 1, reflecting the
respective diagnostic guard result. The stable lock file was never unlinked. Both owned
root/process groups were absent, no survivors or fixture scratch remained, and
both disposable source archives were removed. No unrelated processes, apps,
settings or production data changed. There is no downstream handoff.

Publication finished within the original budget. Root is reviewing the
experimental design as a whole before any next authorization. No automatic
retry, new gate, implementation repair, merge, deployment, native/paid session,
human acceptance, archival or issue closure follows. PR101 remains draft with
`needs-qualification`; all original failed and passing evidence is preserved.
