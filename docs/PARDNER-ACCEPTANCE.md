# Pardner automated goal state

Two human Actors and two agent Actors coordinate through their local services,
with a hub relaying persisted Automerge changes and issuing delivery leases. A
human can assign work to an agent, receive agent-to-agent progress and evidence,
and complete the task after the second agent returns it. The same workflow must
preserve acknowledged operations through network partitions and process kills.

## Repeatable commands

From a fresh checkout using Node 24.11.1:

```sh
npm ci
npm ci --prefix ui-prototype
npx playwright install chromium
npm run verify
npm run test:acceptance -- --repeat 20 --seed 1
```

`verify` builds the UI, runs the regression suite without forced exit, then runs
one full acceptance scenario. `test:acceptance` assumes dependencies, Chromium,
and the UI build are present. The 20-run gate must finish in one successful run;
there are no automatic test retries or skipped seeds. A failed assertion exits
nonzero and writes failure evidence rather than silently proceeding to the next
seed. The real-agent rehearsal in [PARDNER-REHEARSAL.md](PARDNER-REHEARSAL.md) is a
separate human signoff exercise.

## Scenario and bounds

Every seed uses one hub and two persisted replica subprocesses, two independent
Chromium contexts, and two separate deterministic agent worker subprocesses.
All task mutations use the public CLI or browser HTTP operation path. Workers
read their assignee lists and complete task context through the CLI. No live LLM
is used in the automated gate.

The baseline is 100 tasks and 400 substantial comments, followed by 200 scripted
updates. Additional operations exercise human offline authoring, concurrent
same-field conflicts and browser resolution, the full handoff chain, delivery
acknowledgement loss, worker crashes, browser response loss, and completion.

Required bounds are asserted, not merely printed:

| Observation | Bound |
| --- | --- |
| Each measured local operation acknowledgement | 2.5 seconds |
| Human offline comment visible in the local UI | 2 seconds |
| Cold restart of an enrolled replica with the hub inaccessible | 6 seconds |
| All replicas converge after communication is restored | 10 seconds |

On November 5, 2026, the owner explicitly changed only the local operation
acknowledgement bound from 2,000 to 2,500 ms. This is an acceptance-policy
decision, not a diagnosed performance repair. The original 2,384.036 ms failure
and all earlier diagnostics remain historical evidence under their original
2,000 ms contract; they are not retroactive passes. Deeper timing/root-cause
work is deferred separately by the owner to [#107](https://github.com/depatchedmode/pardner/issues/107),
which is not an additional merge gate. Fresh complete qualification under
this revised contract is required before the scoped implementation can be
accepted. That decision left UI visibility, offline restart, convergence, HTTP
timeouts, retries and watchdog limits unchanged. See its [readiness record](PARDNER-66-READINESS.md).

Later on November 5, 2026, after reviewing an offline restart of 5,380.913 ms,
the owner explicitly changed the offline startup/restart acceptance bound from
5,000 to 6,000 ms. This is a second acceptance-policy decision, not a performance
repair. The [original failed gate and two diagnostic arms](PARDNER-CURSOR-CLOUD-VERIFICATION.md)
remain historical evidence under their original 5,000 ms contract; they are not
retroactive passes. The unexplained startup cause is deferred until profiling
infrastructure in [#107](https://github.com/depatchedmode/pardner/issues/107) is available.
Fresh complete qualification under the six-second policy is required. Local
acknowledgement stays 2,500 ms, UI visibility 2,000 ms and convergence 10,000 ms.
The helper startup timeout stays 15,000 ms; HTTP, retry, watchdog, dispatch and
independent benchmark limits are unchanged.

Seeds vary operation ordering/replica use, the killed replica and point in the
schedule, reconnect ordering and delay, the number of lost hub acknowledgements,
and worker crash points. The final scenario also checks complete commit evidence
and the union of one Actor’s offline read receipts across both replicas, while
another Actor’s unread state remains independent. Network gates cut both HTTP and native WebSocket paths
and destroy existing connections; the local HTTP/UI service stays reachable.

## Evidence, not equality alone

The runner records expected operation intents before sending them, and associates
acknowledgements with the known originating replica. At the end, each replica is
checked independently for operation ID, Actor, type, full payload, originating
replica, created task count, final task fields, comment contents/cardinality, and
handoff comment/mention effects. Only then are snapshot hashes compared.

Each agent has a durable SQLite inbox and effect ledger outside the workspace.
The runner kills workers before acknowledgement and after effects have been saved,
then requires exactly one completed inbox entry and one effect entry per delivered
handoff. Workspace operation IDs prevent replay from creating a second comment.
This tests idempotent fake effects; it does not claim arbitrary external side
effects are exactly once.

Reports are written below `output/acceptance/` (gitignored). Each seed contains its
intent/receipt manifest, timing observations, gate schedule, worker evidence,
final heads, snapshot/hash, service logs, and browser traces. A failed seed writes
`failure.json`. `candidate.json` binds the run to source, harness/test code, both
dependency lockfiles, and the actual UI build; the runner checks it again before
writing the final summary. Successful scenario reports do not alone establish the entire
project goal: final review must also cover regression applicability, legacy-path
retirement, documentation, fresh-checkout execution, and the completed 20-seed run.

## Verified milestone

The 20-seed run and clean-checkout verification passed for the candidate recorded
in [PARDNER-GOAL-AUDIT.md](PARDNER-GOAL-AUDIT.md). That audit lists final artifacts,
measured maxima, and the separate manual rehearsal boundary.
