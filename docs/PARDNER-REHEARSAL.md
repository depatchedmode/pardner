# Two-machine rehearsal

This is a prepared human signoff exercise, separate from automated completion.
Use two humans and two real agents after the automated acceptance gate passes.
The agents may use local or remote model providers; the workspace must remain
usable without its hub regardless of the provider chosen.

## Setup

Use the same Pardner checkout and Node version on both machines. Install root and
UI dependencies and build the UI. Start a fresh version 3 workspace: prior installs
are considered stale and must not be migrated or deleted automatically.

On machine A, run a hub in a separate directory on ports 18004/18005. Bind it to
the intended LAN interface and set a shared token through PARDNER_API_TOKEN:

```sh
PARDNER_BIND_HOST=0.0.0.0 pardner serve --role hub --data ./rehearsal-hub \
  --http-port 18004 --ws-port 18005
```

Register `alice` and `bob` as human Actors and `builder` and `reviewer` as agent
Actors, using `pardner --data ./rehearsal-hub actors register`. The first Actor
registers itself explicitly; subsequent registrations name that Actor as author.
Record each stable Actor ID and the hub workspace ID.

```sh
pardner --data ./rehearsal-hub actors register alice --actor alice --handle alice --kind human
pardner --data ./rehearsal-hub actors register bob --actor alice --handle bob --kind human
pardner --data ./rehearsal-hub actors register builder --actor alice --handle builder --kind agent
pardner --data ./rehearsal-hub actors register reviewer --actor alice --handle reviewer --kind agent
pardner --data ./rehearsal-hub status --json
```


Run an enrolled local replica on **each** machine, in a distinct directory. Point
it to the hub's reachable HTTP/native-WebSocket addresses and supply the hub token.
First enroll a distinct replica ID and secret for each machine using
[the enrollment procedure](PARDNER-CLI.md#enroll-another-machine). Configure the hub's
`PARDNER_REPLICA_CREDENTIALS` registry before startup, and set each machine's
`PARDNER_REPLICA_ID` and `PARDNER_REPLICA_TOKEN` before running its service.
These machines are trusted full document writers.
The two replicas can each use their machine's local ports 8004/8005. On machine A,
the hub and the local replica must have different directories and ports.

On each machine, set `PARDNER_HUB_TOKEN` to the shared hub token, replace
`HUB_LAN_ADDRESS` with machine A's reachable address, and run:

```sh
pardner serve --role replica --data ./rehearsal-local \
  --hub http://HUB_LAN_ADDRESS:18004 \
  --hub-ws ws://HUB_LAN_ADDRESS:18005/automerge \
  --http-port 8004 --ws-port 8005
```

Run CLI commands for that replica with `--data ./rehearsal-local`. Use
`pardner --data ./rehearsal-local status --json` to compare workspace IDs and
sync state. The initial enrollment needs the hub; subsequent restarts use the
saved local workspace even when the hub is stopped.


Open each replica's `/pardner/` page in a browser and enter its local connection
file token. Select Alice on machine A and Bob on machine B. Configure Builder to
use machine A's local service and Reviewer to use machine B's local service. Each
agent must use its own Actor ID and must understand safe operation-ID retries.

## Exercise

1. Alice creates a task with a substantial description and comments. Bob and both
   agents read its complete context. Check that descriptions, comments, history,
   revisions, and evidence are not truncated in `pardner show --json`.
2. Alice hands the task to Builder with an explanation and an explicit status.
   Builder durably records the delivery before acknowledging it. Confirm one
   assignment change, one explanation, and one recipient mention in history.
3. Stop only the hub, leaving both local services running. Both humans edit
   different fields and post comments. Builder continues accepted work and saves
   progress locally. New delivery claims must report the unavailable hub.
4. Restart a local service while the hub remains unavailable. Open the workspace,
   confirm its prior acknowledged changes, and make another local edit. Record
   elapsed startup time and visible save status.
5. While disconnected, have Alice and Bob change the same task field to different
   values. Restore the hub. Verify both alternatives and their authors appear,
   then have one human explicitly resolve them. No alternative may silently vanish.
6. Builder hands the work to Reviewer with evidence. Reviewer records and
   acknowledges its delivery, completes the review, and hands the task back to
   Alice. Alice marks the task completed after inspecting the recorded work.
7. Read comments as Alice on both replicas, then as Bob. Alice's observed revisions
   must stay read across replicas; Bob's unread state must remain independent.
8. Retry one saved operation with its original ID and payload. Check that it
   produces no second comment, handoff, or history entry. A changed payload using
   that same ID must be rejected.
9. Close and reopen all services. Check the final task, comments, evidence, Actor
   attribution, operation history, read receipts, and delivery acknowledgements.

## Record the result

Keep a short signoff record with:

- Date, checkout revision, dependency lock hashes, machine/OS details, Actor IDs,
  and model/harness versions. Never include API tokens.
- The task ID and final workspace heads from all services.
- Local save/visibility times (target ≤2 seconds), offline opening time (≤5 seconds),
  and convergence time after reconnection (≤10 seconds).
- Any confusing wording, duplicate effects, lost drafts, missing context, or
  unexpected synchronization behavior, with screenshots or logs where useful.
- A separate pass/fail decision from each human. Any loss of an acknowledged
  operation, silent conflict overwrite, duplicate delivery effect, or false synced
  indicator is a failure to investigate, even if all replicas eventually agree.

The automated goal does not claim this real-agent rehearsal has been performed.
