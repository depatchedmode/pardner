---
name: pardner-harness
description: Coordinate external human and agent sessions through Pardner's CLI using registered Actors, full task context, explicit revisions, and durable mention delivery.
---

# Pardner Harness

Pardner is a coordination surface, not an agent orchestrator. The harness owns
its sessions, wakeups, inbox, retries, and external effects. Use the public CLI;
do not mutate Pardner storage or call its implementation internals.

## Connection and identity

Use `PARDNER_DATA_DIR` (or `--data`) for the running local service's directory.
The CLI reads its protected `connection.json`. Set `PARDNER_ACTOR` or pass
`--actor` explicitly; the Actor must already be registered. Actor identity is
separate from replica identity. A local wrapper may supply these options.

`--server` and `--token` are explicit connection overrides. Avoid copying tokens
into instructions or shared documents. `--model` and `--session` add optional
trace context to `pardner commit`.

## Read work and coordinate

```sh
pardner tasks --assignee "$PARDNER_ACTOR" --json
pardner mentions pending --actor "$PARDNER_ACTOR" --json
pardner show TASK_ID --actor "$PARDNER_ACTOR" --json
pardner comments TASK_ID --json
pardner activity --task TASK_ID --json
```

`show` includes complete descriptions, comments, history, revisions, conflicts,
evidence, unread state, and sync status. Reads do not mark comments seen.

Before editing a shared working tree, agree on file scope. Assignment and delivery
claims do not lock files or reserve exclusive execution. Preserve others' dirty
changes; use separate worktrees for overlapping implementation tasks.

## Attributed writes

```sh
pardner task create --title 'Short title' --assignee "$PARDNER_ACTOR" --actor "$PARDNER_ACTOR" --operation-id CREATE_ID --json
pardner comment TASK_ID 'Progress and evidence' --actor "$PARDNER_ACTOR" --operation-id COMMENT_ID --json
pardner update TASK_ID --status in-progress --revisions '{"status":["OBSERVED_REVISION"]}' --actor "$PARDNER_ACTOR" --operation-id UPDATE_ID --json
pardner handoff TASK_ID --to reviewer --status review --message 'Work and review request' --revisions '{"assignee":["OBSERVED_REVISION"],"status":["OBSERVED_REVISION"]}' --actor "$PARDNER_ACTOR" --operation-id HANDOFF_ID --json
```

Take revisions from the context you actually observed. Preserve the original
operation ID and identical payload across uncertain retries. `STALE_UPDATE`
requires rereading and reconciling; do not silently refresh revisions and overwrite
intervening work. `OPERATION_ID_REUSED` means the ID belongs to a different request.
Resolve visible alternatives explicitly with `pardner resolve`.

Tasks can belong to veins, lines of work toward a goal. When the work you are
doing belongs to a vein, add it; record a task that did not work out as
`dead-end` rather than `completed`:

```sh
pardner veins --json
pardner vein add VEIN_ID TASK_ID --actor "$PARDNER_ACTOR" --operation-id LINK_ID --json
pardner update TASK_ID --status dead-end --revisions '{"status":["OBSERVED_REVISION"]}' --actor "$PARDNER_ACTOR" --operation-id UPDATE_ID --json
```

Leave vein and goal verdicts to the people who own them unless asked.

A successful write is acknowledged only after local persistence. Check
`savedLocally` and `syncPending`; local durability is distinct from hub sync.

## Durable mention delivery

Interactive sessions may coordinate through assignee queues and comments without
claiming delivery. A harness that claims must durably save the message before ack:

```sh
pardner mentions claim-next --actor "$PARDNER_ACTOR" --request-id CLAIM_REQUEST_ID --json
```

If `claimed` is false, no work was claimed. A claimed result includes `mention.id`,
`mention.taskId`, `mention.fromActorId`, `mention.toActorId`,
`mention.idempotency_key`, `claimToken`, and `claimExpiresAt`. Read the complete task
context for the comment content. Persist the mention and idempotency key to the
harness's own inbox before acknowledging receipt:

```sh
pardner mentions ack MENTION_ID --actor "$PARDNER_ACTOR" --claim-token CLAIM_TOKEN --json
```

Acknowledgement means durable receipt, not completed execution. Accepted work can
continue through the local service while the hub is offline. New delivery claims
require the hub. Use stable effect IDs or other durable deduplication for external
side effects; Pardner cannot make arbitrary external actions exactly once.

If delivery cannot be accepted, release an active claim:

```sh
pardner mentions release MENTION_ID --actor "$PARDNER_ACTOR" --claim-token CLAIM_TOKEN --json
```

Use a fresh request ID for a new poll; reuse the old request ID only to recover its
uncertain result. `STALE_CLAIM` means the token is no longer valid. Reacquire through
a new poll and deduplicate against the durable inbox. Never treat a lease as an
execution lock or acknowledge work that has not been durably received.

## Observed reads and commit evidence

```sh
pardner read TASK_ID --receipts '[{"commentId":"COMMENT_ID","revisionId":"OBSERVED_REVISION"}]' --actor "$PARDNER_ACTOR" --operation-id READ_ID --json
pardner commit --task TASK_ID --actor "$PARDNER_ACTOR" --model MODEL --session SESSION -- -m 'Commit message'
```

Commit only when authorized by the user. If git succeeds but evidence linking
fails, preserve the returned commit hash and follow the recovery details; do not
create another commit as a retry.

Coordination commands emit one JSON value on stdout and diagnostics on stderr.
Treat nonzero exit codes as failures and inspect their structured error codes.
If the local service is unavailable, surface it or restart it when authorized;
do not bypass its ownership or persistence rules by writing storage directly.
