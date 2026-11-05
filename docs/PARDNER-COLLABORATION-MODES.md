# Three-mode collaboration rehearsal

Pardner must let two real agent Actors and a human coordinate through complete,
attributed task context in all three topologies. File sharing must never be
mistaken for replication, and an Actor is independent of its working directory
and replica. A scripted CLI call using an agent's Actor ID does not establish
that the real agent participated.

| Mode | Working files | Pardner service | Required proof |
| --- | --- | --- | --- |
| Co-worktree | One shared checkout on one Mac | Shared local service | Claude reads Codex's challenge, writes only its agreed file, and hands back attributed evidence. |
| Co-host | Separate Git worktrees on one Mac | Shared local service | Both see the same task; source files are independent; Claude's response appears only in its worktree. |
| Remote | Separate machines or VMs, no shared checkout or data volume | Independent local replicas connected through a hub | Network-only task exchange, explicit artifact transfer, offline persistence, restart, convergence, and conflict resolution. |

A Docker-only rehearsal is useful additional network isolation coverage, but
containers sharing a kernel are not the full separate-machine acceptance test.
The co-host setup currently shares installed dependency directories; its source
files and Git indexes are separate. Dependency changes require coordination.
Neither task assignment nor a delivery claim locks working files. Co-worktree
participants must agree on file ownership before writing.

## Measurable goal state

Each mode passes only when Codex and the actual Claude session complete a round
trip: Codex creates a scoped task and challenge, Claude reads it, records scope,
produces the requested proof, and hands the task to Codex for review. Codex verifies
the artifact and attribution, then returns a clear result to the human. Preserve
all unrelated files. Record the actual runtime, model/harness where available,
working directory, workspace ID, replica ID, operation IDs, and task history.
Do not include connection tokens in evidence.

Local operation acknowledgement must take at most 2.5 seconds; local UI visibility
must take at most 2 seconds. Remote offline opening
must take at most 5 seconds, and replicas must converge within 10 seconds after
reconnection. Acknowledged operations must survive restart. Same-field conflicts
must preserve both alternatives until explicit resolution. Retrying an operation
with the identical ID and payload must produce one logical effect. Any failed
assertion fails that mode; infrastructure success alone is not agent signoff.

Remote agents may require network access to their model providers. Partition
Pardner's hub connection specifically when testing local-first behavior. Also
verify cached workspace access with the replica fully disconnected; do not claim
that cloud inference itself works offline.

## Repeatable procedure

1. Record the candidate fingerprint and environment. Create a unique run ID and
   fresh challenges; never reuse an old response as evidence of a new run.
2. In co-worktree, give each agent a distinct response path in the shared checkout.
   Verify the response nonce, actual working directory, Actor and service IDs.
   Review the task's scope comment, handoff message, assignee and status revisions.
3. In co-host, populate the second worktree from the current candidate, including
   uncommitted files and tracked deletions. Check matching candidate fingerprints.
   Run its own CLI with the shared service's data directory explicitly selected.
   Repeat the agent handoff. Confirm a test file in one worktree does not appear at
   the corresponding relative path in the other.
4. For remote, provision two separate VM guests with distinct machine IDs and
   disks. Put a fresh test hub on one guest or a third host and run a local replica
   on each guest. Use separate data directories, matching candidate builds, and
   registered human/agent Actors. Do not mount a shared workspace. Do not partition
   or restart the user's normal Mac service.
5. Exchange a task and an artifact over explicit network transport. Confirm the
   recipient can inspect the artifact without the sender's local filesystem.
   Absolute paths alone are not portable artifact evidence.
6. Disconnect each replica from the test hub. Save independent comments and
   conflicting updates using revisions each participant actually observed.
   Restart a replica while disconnected and check its acknowledged local writes.
   Restore connections, measure convergence, inspect both alternatives, and
   resolve them explicitly. Repeat one original operation unchanged and check
   deduplication. Restart services and inspect final context on both replicas.
7. Complete the real-agent round trip on the remote replicas. Capture evidence
   from both guests and obtain human review. Record each mode separately as pass,
   fail, or pending with the unmet condition; never turn pending into pass.

For detailed remote enrollment commands and read/delivery scenarios, use
[PARDNER-REHEARSAL.md](PARDNER-REHEARSAL.md).

## Current Mac run

Run ID: `909302cb96778855`.

- Original checkout: `/Users/ryanbetts/Code/mission-control`.
- Claude worktree: `/Users/ryanbetts/Code/mission-control/.pardner/labs/co-host/claude`.
- Candidate fingerprint in both worktrees:
  `a24cbbd03c3b2e14ecb1c76c3b9e8c26c2ea6c4f6b8aa410f36da28380738fc6`.
- Co-worktree task: `task-4b6ce56f904b6692bdc4938f`.
- Co-host task: `task-643bb40012eae5ebced11412`.
- Both local scoped agent round trips passed Codex review: Claude supplied matching
  nonce and directory proofs, recorded scope, and handed each task back with one
  attributed handoff and recipient mention. Co-host file isolation passed.
  Review evidence: `.pardner/labs/review.json`. This does not establish concurrent
  editing safety or remote/offline behavior. Latest CLI reads took 93–102 ms.
- Remote: two isolated Lima VMs provisioned. Automated failure/recovery checks
  passed; the real Claude handoff and artifact transfer passed Codex review. See
  [PARDNER-REMOTE-TEST.md](PARDNER-REMOTE-TEST.md) for the repeatable procedure.

Recheck the current run from the original checkout:

```sh
python3 .pardner/labs/check-host-modes.py
```

This checks public CLI access, shared service identity, file isolation, response
proofs when present, and records timings. It does not impersonate Claude or mark
an unreviewed handoff complete. Local run data and results are under
`.pardner/labs/run.json` and `.pardner/labs/results.json`. These files are ignored
and are not part of the portable application. The procedure above defines new
runs; this checker rechecks the current Mac fixtures.
