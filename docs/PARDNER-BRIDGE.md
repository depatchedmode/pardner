# Event-driven agent wake-up

`pardner bridge` is an opt-in local harness bridge for issue #50. It watches a
running local Pardner service, receives deliveries into its own SQLite inbox,
then starts authorized work in a dedicated mapped provider session. Each host
runs its own bridge against its own replica. Checking for work makes no model
requests.

Adapters support existing **bridge-owned Codex App Server threads** and
**Cursor CLI ACP sessions**. See [Cursor configuration and limitations](PARDNER-CURSOR-ACP.md)
for its mode-only policy and protocol receipts. They do not attach to arbitrary
Codex Desktop tasks, Claude sessions, or Cursor editor chats. One bridge must be
the sole dispatcher for each mapped session; stop other clients driving it.

## Setup

Use Node 24.11.1 and a running local Pardner service. Keep existing workspace
data, and use a separate directory for the bridge inbox.

1. Register an agent Actor. Identify specific tasks and sender Actors authorized
   to wake it. Get local identity with `pardner status --data /absolute/data/path`.
2. Run a dedicated `codex app-server --listen ws://127.0.0.1:9001`, using the Codex
   account and configuration intended for this agent. Choose an existing persisted
   thread with conversation history in the intended worktree. Newly created empty
   threads may not yet have a readable rollout. The bridge does not create threads
   or pick models.
3. Inspect its directory and effective permissions without starting a model turn:

   ```sh
   pardner bridge inspect --endpoint ws://127.0.0.1:9001 \
     --session THREAD_ID --worktree /absolute/path/to/worktree
   ```

   This briefly resumes/subscribes to the existing thread. Review the returned
   `expectedPolicy` and copy the complete object into a private local JSON file:

   ```json
   {
     "workspaceId": "WORKSPACE_ID",
     "replicaId": "LOCAL_REPLICA_ID",
     "dataDirectory": "/absolute/path/to/pardner-data",
     "inboxDirectory": "/absolute/path/to/pardner-bridge",
     "mappings": [{
       "actorId": "builder",
       "enabled": true,
       "adapter": "codex-app-server",
       "sessionOwner": "bridge",
       "endpoint": "ws://127.0.0.1:9001",
       "threadId": "THREAD_ID",
       "worktree": "/absolute/path/to/worktree",
       "expectedPolicy": {
         "approvalPolicy": "on-request",
         "approvalsReviewer": "user",
         "sandbox": { "type": "readOnly" }
       },
       "allowedTaskIds": ["TASK_ID"],
       "allowedFromActorIds": ["alice", "reviewer"]
     }]
   }
   ```

   Replace example values. The policy above is illustrative: use the full inspected
   object, including additional sandbox fields. Authorization requires IDs, not
   handles or wildcards. `sessionOwner: "bridge"` is your declaration of exclusive
   ownership, not automatic Desktop compatibility detection. Workspace admission
   still uses a shared secret; Actor IDs are not cryptographic identities.
4. Run and inspect the bridge:

   ```sh
   pardner bridge run --config /absolute/path/to/bridge.json
   pardner bridge status --config /absolute/path/to/bridge.json
   ```

`run` stays alive until SIGINT/SIGTERM. Use a supervised terminal or an existing
process supervisor. It rereads the local service's protected `connection.json`
when reconnecting. The inbox directory is private (0700) and contains task context
and lease credentials; do not publish it. Credentials do not appear in prompts or
WebSocket URLs. Service and Codex endpoints must be loopback URLs; Cursor uses
a local stdio process. Treat the Codex endpoint as a trusted local control
interface; do not expose it publicly.

`status` reports persisted observations, not a process-liveness guarantee; use
your terminal or supervisor to check whether the bridge process is still running.

Stop and restart to apply configuration changes. Explicit task/sender allowlists
can be expanded or revoked. Received work retains its original Actor, endpoint,
thread, worktree, and expected permission policy; configuration changes cannot
silently redirect it. Disabled mappings do not claim or dispatch. Unauthorized
deliveries remain visibly queued while other authorized deliveries can proceed.

## Delivery and recovery

Provider selection uses the code-defined registry in `lib/bridge-providers.js`.
The registry implements `codex-app-server` and `cursor-acp`. Existing private
Codex configurations and the inspection command above keep their shape and
behavior. Inspection may also explicitly select `--adapter codex-app-server`,
or inspect a configured mapping with `pardner bridge inspect --config PATH
--actor ACTOR_ID`. Inspection never starts a model turn.

The bridge owns common Actor/task/sender authorization, durable intake, dispatch
intent, and uncertain-send state. Each registered provider owns connection
validation, session/permission validation, adapter construction, inspection,
and the connection fields included in a saved route. Changing those fields
blocks queued or uncertain work rather than redirecting it. Provider IDs are
not module paths; private configuration cannot load code. Session IDs remain
unique across all mappings. Completion cleanup requires the provider to declare
actual session-discovery and archive support; Cursor configurations reject it.
Claude is not implemented. The Codex qualification runner remains specific to
Codex, and prior #70/#71 evidence does not qualify native Cursor execution.

Document subscriptions provide immediate hints. A one-second local HTTP catch-up
checks for missed notifications and expired leases, without calling a model.
Healthy fixture handoffs dispatch within two seconds; unavailable harnesses and
network failures can exceed that bound. Model response latency is separate.

Claim request IDs are persisted before requesting leases. Mentions are persisted
with SQLite WAL/FULL synchronization before hub acknowledgment. Acknowledgment
means durable receipt, not completion. New claims need the hub; received work can
continue through a reachable local service while the hub is offline. A missing
local service or mismatched replica identity stops dispatch.

If a hub delivery arrives ahead of replica synchronization, dispatch waits until
the originating mention and comment are present in local task context. Withdrawn
mentions remain visibly queued instead of waking an agent on stale context.
Such a row does not block later authorized deliveries with complete context.
The bridge dispatches at most one eligible delivery per Actor per pass, retaining
the waiting row and its reason so later replica synchronization can release it.
Busy sessions, approvals, and uncertain dispatch still block that Actor's dispatch.

Deliveries progress through `queued → dispatching → accepted`. Busy sessions retain
queued work. `accepted` means the harness supplied an observed receipt or matching
history established receipt, not that the task succeeded. Codex receipts are
native turn IDs. Cursor receipts identify a completed prompt response or a
replayed native message ID; they are not immediate native turn acceptance.
Pending approvals and input
requests are reported as blocked and never auto-answered. Resolve them through
the harness's approval/input client; this adapter supplies no approval UI. The
bridge passes no model, mode, or permission overrides. Codex validates the native
directory and full expected policy. Cursor explicitly binds its directory using
`session/load` cwd and validates only its observed mode, as described in its runbook.

Before dispatch, the exact prompt is persisted. Lost replies and crashes during
dispatch produce `uncertain`. Recovery checks stored history for an exact matching
user message in one Codex turn or one identified Cursor message. Missing,
compacted, truncated, or ambiguous history does
not prove non-acceptance. Further dispatch for that Actor waits for reconciliation.
A disconnected harness may leave execution state unobserved; its durable dispatch
receipt remains valid.

For manual reconciliation, stop the bridge, inspect actual harness history and
external effects, then record evidence:

```sh
pardner bridge reconcile --config /absolute/path/to/bridge.json \
  --delivery MENTION_ID --decision accepted --turn-id TURN_ID \
  --evidence 'Verified this delivery in turn TURN_ID'

# Only after confirming the original dispatch was not accepted:
pardner bridge reconcile --config /absolute/path/to/bridge.json \
  --delivery MENTION_ID --decision retry \
  --evidence 'Inspected the stopped harness and confirmed no accepted turn'
```

Reconciliation requires exclusive inbox ownership. Retry preserves the original
prompt. This is not universal exactly-once execution: external effects still need
idempotency, and delivery leases do not lock shared worktrees.

## Completion cleanup

For a dedicated group of related work, add this to its bridge configuration:

```json
"completionCleanup": { "archiveDirectory": "/absolute/path/to/archived-worktrees" }
```

All mappings in that configuration form one ownership group. The bridge waits
until every allowed or received task, and its branch-related tasks, has ended
(`completed`, `dead-end`, or `abandoned`) with no field conflicts. `review`, missing tasks, pending deliveries,
outstanding claims, uncertain dispatches, busy threads, and approval requests all
prevent cleanup. Unmapped threads using a worktree or descended from a mapped
thread also prevent cleanup. Explicitly include every associated task/session;
the bridge cannot infer relationships in other applications.
Branch discovery follows the public task projection's `branch_of` links through
parents, siblings, and descendants, including branches added during cleanup.

Keep `inboxDirectory` and `dataDirectory` outside every checkout scheduled for
movement. Cleanup validates canonical containment, including symlinked ancestors
and runtime directories that do not exist yet, before recording retirement or
archiving a thread. Invalid layouts report the field and path to reconfigure;
the bridge does not relocate runtime databases or rewrite connections.

Once eligible, the bridge durably retires the group from dispatch, archives its
Codex threads, then uses `git worktree move` to relocate each linked checkout
once. Tracked edits, untracked files, ignored evidence, and Git metadata are
preserved. The main checkout is never moved. No commits, branches, or files are
deleted. `bridge status` includes the retirement record and source/destination
paths; failed archive operations retry from that record after restart.

Before each remaining thread archive or worktree move, cleanup rereads task and
branch status and pending deliveries. Reopened work pauses the remaining steps,
including during a single cleanup attempt. The durable record preserves progress
for retry once the group is eligible again. A request already in flight may
finish; these checkpoints do not lock task edits across Codex and Git operations.
Current session ownership is also checked before each remaining step and retry,
even after all mapped threads have archive receipts. An unmapped session at the
source or planned archive location blocks remaining moves. Thread working
directories are compared by canonical filesystem location, preserving descendant
checks and tolerating missing historical paths after a move. Archived sessions
are inspected read-only; their successful archive requests are not repeated.

Cleanup requires the bridge, Pardner service, and Codex server to be running.
Rehearsal configurations enable it, but a test returning to human review does
not complete its tasks. Reopening tasks after retirement requires explicitly
restoring the archived resources and setting up a new bridge ownership group;
the old group never resumes dispatch automatically.

## Validation and follow-ups

For actual model execution, use the [real-agent rehearsal](PARDNER-BRIDGE-REHEARSAL.md).
It runs isolated builder/reviewer sessions and preserves independent evidence.

```sh
node --test test/agent-bridge.test.js test/bridge-integration.test.js \
  test/bridge-process.test.js test/codex-bridge-adapter.test.js
node scripts/bridge-codex-smoke.js
npm run verify
```

Tests cover simulated idle time, permissions, busy queues, lost responses,
duplicates, wrong replicas, hub outages, and SIGKILL during CLI dispatch. Shared
worktree, separate worktree, and independent-replica fixtures run on one host with
a protocol test harness. They are not real-agent or separate-machine signoff.
The opt-in smoke creates isolated Codex configuration and a fixture thread without
model turns. It checks initialize/read/resume against the installed CLI; this was
exercised with codex-cli 0.131.0. See the
[official App Server protocol](https://learn.chatgpt.com/docs/app-server).

Issue #50 remains the umbrella for these implementation follow-ups:

- **Codex Desktop:** qualify a supported connection to Desktop-owned tasks,
  including approvals and ownership. This adapter does not establish compatibility.
- **Claude Code Channels:** verify feature availability, notify an open authorized
  session, report a closed session as unavailable, and qualify receipt/retry behavior.
- **Cursor ACP:** the mapped-session adapter implements mode-only pins,
  completion-response and exact replay receipts. Native reply/recovery and mixed
  provider qualification remain blocked on CLI authentication; see its runbook.
- **Real-agent qualification:** measure dispatch separately from inference and
  rehearse the three collaboration modes, including separate machines and restart.
  Keep #50 open until its agreed adapter and qualification scope is satisfied.
