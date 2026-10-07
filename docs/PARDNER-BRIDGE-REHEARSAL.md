# Real Codex bridge rehearsal

For issue #66's bounded implementer and two-reviewer workflow, use the
[three-agent rehearsal and lifecycle runbook](PARDNER-THREE-AGENT.md).

This opt-in test makes real model requests through the signed-in Codex CLI account.
It creates a dedicated App Server, two new threads, two disposable Git worktrees,
and a fresh Pardner service. The existing workspace and live Desktop threads are
not used. Threads use the configured model unless explicitly overridden; the
report records the selected model, reasoning effort, and effective permissions.

```sh
# Real builder → reviewer → human round trip, busy queue, duplicate notifications
node scripts/bridge-real-rehearsal.js --run

# Select a newer installed binary without changing the global CLI or model
node scripts/bridge-real-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex

# Also drop a real accepted dispatch reply, SIGKILL the bridge, and restart it
node scripts/bridge-real-rehearsal.js --run --drop-dispatch-reply

# Use Luna with the lightest effort supported by the installed Codex server
node scripts/bridge-real-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex \
  --model gpt-5.6-luna --reasoning-effort low --drop-dispatch-reply

# Add a real one-hour idle observation after the round trip
node scripts/bridge-real-rehearsal.js --run --idle-seconds 3600

# Exercise completion guards, then crash and recover during real archival
node scripts/bridge-real-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex \
  --model gpt-5.6-luna --reasoning-effort low --completion-lifecycle

# Exercise two Actors sharing one linked worktree, with independent test files
node scripts/bridge-real-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex \
  --model gpt-5.6-luna --reasoning-effort low \
  --shared-worktree --drop-dispatch-reply --completion-lifecycle

# Observe a real approval boundary without answering the request
node scripts/bridge-approval-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex
```

Without `--run`, the script prints usage and makes no model requests. Each run
has fresh task IDs and a random challenge. It stops its test-owned process groups
on success or failure and retains evidence under
`.pardner/bridge-rehearsals/RUN_ID/`. Inspect `report.json` for the result and
unqualified scenarios. An idle test omitted from the command is recorded as
`not-run`, never as a pass.

`--model` and `--reasoning-effort` apply only to the new test sessions. The harness
validates the requested settings against the installed server's model catalog,
checks the settings returned at thread creation and resume, and never substitutes
a model. Omit these options to inherit the user's configuration.

`--completion-lifecycle` adds a third related task and a fourth real model turn.
After verifying the coding handoff, it completes tasks individually and proves
that the remaining open task blocks archival. It then holds the real builder
turn behind a file barrier, completes the final task, and observes that cleanup
still waits. Once released, it drops a successful archive response and kills the
bridge before restarting it against the durable retirement record. The test
compares all fixture file hashes and Git status before and after worktree moves,
reruns tests from the archived locations, and restarts again after the moves.
The archived threads and worktrees belong only to that isolated rehearsal.

`--shared-worktree` assigns both sessions to the same linked Git worktree. The
reviewer checks the shared implementation against the attributed handoff and
writes `reviewer.test.mjs`, preserving the builder's implementation and tests.
The controller reruns both test suites and independent assertions. Completion
must archive two threads but move the shared worktree only once.

The separate approval probe uses Luna with low reasoning in a new read-only
session, with approvals explicitly routed to the user. It requests one bounded
fixture write, observes the actual App Server approval request, and verifies for
five seconds that the bridge exposes a blocked state, keeps a second delivery
queued, and never writes the fixture. It then stops the bridge, interrupts the
pending turn, closes the cancelled fixture tasks, and archives the thread. It
never answers an approval request and does not qualify a human approval UI.

The fixed `runId` and `challenge` are now explicit in every coding-task handoff
instruction, separate from per-write operation IDs. Validation still requires
their exact original values.

The frozen application copy is fingerprinted before and after the run. Installed
dependencies are shared read-only by convention; do not install or modify them
while qualification is running. The tiny coding fixture uses a separate Git
repository with builder and reviewer worktrees. Those worktrees have independent
files and Git indexes.

The builder implements a deterministic task-selection function and tests it. It
publishes the full source, hash, test evidence, and challenge through a Pardner
handoff. The reviewer reconstructs that artifact from the handoff in its own
worktree and writes independent tests. The orchestrator checks both files against
additional assertions and verifies attribution, worktree scope, hashes, actual
turn receipts, and the final human handoff. Model-generated claims alone cannot
pass the test.

A second task is assigned while the builder is active. Its dispatch must wait
until the first turn completes. The protocol relay duplicates real status
notifications; the expected run still has exactly two builder turns and one
reviewer turn. With `--drop-dispatch-reply`, the relay withholds one successful
reply from the actual Codex server and restarts the bridge. It never fabricates
model responses or turn receipts.

New test sessions use workspace-write and on-request approvals. Network access is
enabled for these sessions so their CLI can reach the isolated loopback service.
No global Codex configuration is changed. The bridge pins the actual returned
approval and sandbox policy. Unexpected approval or input requests fail visibly;
the script never auto-answers them. This run does not qualify a usable approval UI.

Evidence includes:

- `report.json`: result, candidate fingerprint, session models and permissions,
  checks, dispatch latency, total round-trip time, and cleanup outcome.
- `protocol-events.json`: observed dispatches, real acceptance receipts, completion
  events, duplicate notifications, and injected transport failures.
- `task-context.json`: final task history, attributed handoffs, and transferred source.
- `builder-verification.json` and `reviewer-verification.json`: independently rerun
  tests, external assertions, and actual Git diffs.
- `inbox-status.json`: durable bridge state before teardown.

The run directory also contains private runtime data, including service connection
credentials. Do not publish the directory wholesale. Summary files redact the
service token. The script uses existing Codex authentication without copying it
into the run directory.

This is **co-host qualification**. Separate-machine replicas, hub partition and
recovery, approval round trips, and other harness adapters remain separate gates.
The standard `npm run verify` suite and protocol mocks remain useful regressions;
neither substitutes for the real model run.

## Recorded local qualification

On September 6, 2026, both real runs passed using `gpt-6-astra` through the
installed application binary, Codex CLI 0.153.4:

| Scenario | Run ID | Initial dispatch | Round trip |
| --- | --- | --- | --- |
| Normal handoff | `4244eea5-88c6-4045-bcdf-c276973cd318` | 239 ms | 217.7 s |
| Lost reply and bridge SIGKILL | `2ac8dfb2-738e-4080-b77e-08260792b5f7` | 239 ms | 206.0 s |

Each run recorded exactly three dispatch attempts and three distinct accepted
turns, passed independent artifact tests, exercised busy delivery and duplicate
notifications, and reported no cleanup errors. Reports bind results to each
frozen candidate; this table does not qualify later code changes. The hour-long
idle observation and the other gates above were not run.

The global CLI 0.131.0 could not run the configured model. These runs selected
the newer installed binary without changing the model or global installation:

```sh
node scripts/bridge-real-rehearsal.js --run \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex \
  --drop-dispatch-reply
```

The same day, the scenarios were rerun with `gpt-5.6-luna` and reasoning `low`,
the lightest effort advertised by the installed Codex server. Creation and resume
receipts confirmed those settings for both Actors:

- Normal run `b5691cd2-441b-4e4d-a99b-2a67f943dc21` passed, with a 242 ms initial
  dispatch and a 138.9 s round trip, including independent tests, busy delivery,
  and duplicate notifications.
- Lost-reply run `1e26fab6-f6aa-4654-ab0f-e882dc4718bf` failed evidence validation:
  both coding-task Actors supplied new run IDs rather than preserving the
  rehearsal run ID. The bridge restarted and recorded three dispatches without
  a duplicate attempt, but the overall scenario did not pass.

Both runs cleaned up without errors. These two observations do not establish a
model reliability rate or attribute the evidence failure to crash recovery.

The full completion lifecycle then passed in run
`3f465c70-06d5-4722-8c1c-0f9151985500`, also using Luna with low reasoning.
Initial dispatch was 216 ms. The run verified the open-task and active-thread
guards, recovered after losing a successful archive reply and killing the bridge,
preserved all fixture file hashes and Git status across both worktree moves,
reran artifact tests from the archived locations, and restarted successfully
after the moves. It recorded four model dispatches, two archive requests, and
no process cleanup errors. Both Actors preserved the explicit run ID in this run;
this single observation does not establish a reliability rate.

The subsequent review pass completed `npm run verify`: production UI build,
212 tests, and the complete seed-1 acceptance scenario (100 tasks, 400 comments,
200 operations). The identity guard and reopening checks also passed an
18-test focused run. An earlier acceptance attempt was discarded because a
test edit changed its candidate fingerprint during execution; the successful
rerun used unchanged source throughout acceptance.

## Qualification follow-up

| Gate | Evidence and scope |
| --- | --- |
| Healthy dispatch under two seconds | Real Luna/low: 229 ms with separate worktrees; 217 ms with a shared worktree. |
| Busy delivery, duplicate notifications, uncertain dispatch | Real lost-reply and bridge-restart runs passed in both local topologies. |
| Completion and restart during archival | Both local topologies passed; shared worktree moved once for two archived threads. |
| Permission boundary and visible blocked state | Real pending approval passed; no request was approved. Human approval round trip remains open. |
| Remote partition, conflict, replay, restart | Two isolated VM replicas passed infrastructure checks. Remote Luna sessions require guest authentication. |
| One-hour idle observation | 3,600 real seconds passed with zero bridge model dispatches, followed by successful completion and archive recovery. |

These are scoped observations, not universal exactly-once guarantees or a model
reliability estimate. The complete three-topology agent gate remains open until
real remote sessions are exercised against their own replicas.

Run `badd691a-c34f-4240-a468-2428257a8607` passed the complete idle hour with
Luna/low against candidate
`8b20dc85dd96eed99325dd2f4dd515c979705f76d8d60c054e139e15cb982e37`.
It observed zero bridge `turn/start` calls during 3,600 real idle seconds.
Protocol timestamps place the subsequent completion probe 3,607.154 seconds
after the last coding turn finished. The probe then passed the open-task and
active-thread guards, archive-reply loss and restart, preserved-worktree checks,
and restart after moving the worktrees. The full run recorded four dispatches,
two archive requests, and no cleanup errors. All three recorded session-resume
receipts retained Luna with low reasoning. Initial dispatch was 216 ms and the
coding round trip was 121.1 s, measured separately from the idle interval.

The Luna/low lost-dispatch-reply scenario passed in run
`5f8f9487-a412-4db7-8cd3-6d920d748f39`: 229 ms initial dispatch and a 139.8 s
coding round trip. It also passed the completion lifecycle, including a second
bridge crash after a successful archive response was dropped. Four model
dispatches and two archive requests completed without duplicate dispatch or
cleanup errors. This rerun uses the explicit correlation-ID instructions; it
does not erase the earlier failed evidence validation.

Shared-worktree run `34e30725-f09c-4e50-b6f3-d52ab09a04ec` passed with Luna/low:
217 ms initial dispatch and a 142.2 s coding round trip. Both Actors used the
same linked worktree. The reviewer preserved the builder's source and tests,
and the controller reran both independent test files. Lost-dispatch-reply and
archive-reply recovery passed, with four dispatches, two thread archive
requests, exactly one worktree move, and no cleanup errors.

The real pending-approval boundary passed in run
`70d3b0ec-d444-4878-8d9b-53cf1e8d82e9`. Luna/low requested a real approval in a
read-only session. The second delivery remained queued, the bridge reported
blocked, the policy remained pinned, and the marker was never written. The
controller interrupted the turn, completed the cancelled test tasks, and
archived the thread without cleanup errors. The approval was never answered.

Fresh two-VM infrastructure run `ff960087dd07` passed partition, offline writes,
conflict preservation, operation replay, and replica/hub restart checks against
candidate `8b20dc85dd96eed99325dd2f4dd515c979705f76d8d60c054e139e15cb982e37`.
The slowest CLI call was 385 ms, including SSH overhead; the slowest convergence
was 1,083 ms. The Ubuntu guests had distinct machine and replica identities and
no shared filesystem. Both VMs were stopped afterward, preserving their disks.
An earlier attempt stopped at fingerprint validation because the importing
launcher generated a local Python bytecode file; it did not run the gates.

To repeat infrastructure checks without preparing a manual Claude handoff:

```sh
python3 scripts/remote/rehearse.py --infrastructure-only
```

That committed entry point passed in run `9bea314529dc` against candidate
`8a71de401d222249ecee48056db27fa766e49b631e8192f851acb58ddff2ecb6`, with a
270 ms maximum CLI call and 1,003 ms maximum convergence. It created no manual
agent task, recorded real agents as not run, and both VMs stopped cleanly.

The follow-up code passed `npm run verify`: production UI build, 213 tests,
and the complete seed-1 acceptance scenario. The shared-worktree setup and
retirement checks also passed a focused 10-test run.

The guests currently lack authenticated Codex runtimes. This infrastructure
result does not qualify a bridge-driven remote Luna handoff. VMs also share the
Mac's physical hardware and uplink. A real human approval round trip,
Desktop-owned sessions, and the unimplemented Claude/Cursor adapters remain
unqualified.

The subsequent merge-readiness fix rechecks task and branch status and pending
deliveries before each remaining archive or move. Six new regressions fail
against the prior implementation and pass with the fix, covering reopening
after either thread archive, an added open branch, a new pending delivery,
stopping during an archive, and reopening between worktree moves. The focused
suite passed 24 tests; `npm run verify` passed the build, all 219 tests, and the
complete seed-1 acceptance scenario.

Real Luna/low run `64a2205b-df19-4ca2-8992-c1e838036d1f` passed after that fix,
including lost-dispatch-reply recovery and the completion/archive lifecycle.
It recorded a 230 ms initial dispatch, four dispatches, two archive requests,
preserved worktrees, and no cleanup errors. This run did not repeat the idle hour.

## Five-finding review fix

The review of `7a733637` found incorrect branch projection fixtures, ownership
checks skipped after successful archives, literal working-directory comparison,
unsafe runtime-storage layouts, and queue starvation behind missing context.
The fixes use public `branch_of` relationships, recheck current ownership before
remaining cleanup actions, compare canonical filesystem locations, reject runtime
storage within moving checkouts, and let later eligible deliveries dispatch while
missing-context rows retain their queued state and visible reason.

The regression files were copied into an isolated source snapshot of `7a733637`,
leaving its runtime unchanged. That baseline run had 20 failures and 34 passes
across 54 tests, reproducing all five findings. The same tests pass with the fixes;
the broader bridge, mention-lifecycle, and branching run passed all 78 tests.
Coverage includes real service projections through `BridgeSource`, branch creation
between cleanup steps, ownership changes after a failed move, portable symlink
aliases and parent traversal, preserved inbox state, a deleted originating comment,
temporarily lagged context, and restart after an actual linked-worktree move.

The zero-model Codex smoke passed initialize, thread start/read/resume/archive/list
with zero model turns. `npm run verify` passed the production UI build, all 239
tests, and the complete seed-1 acceptance scenario. Acceptance output is locally
recorded under `output/acceptance/2026-09-08T05-03-11.589Z`, against candidate
`53b13907ec8a3a0b6c850d68dc414026ddf797f78f060f2193b1439a411e8db3`.

Real model rehearsals were not rerun for this fix pass. The historical observations
above remain tied to their original candidates and do not qualify this candidate
for the remaining real-agent gates.
