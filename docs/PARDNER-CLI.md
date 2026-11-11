# Pardner local service and CLI

The default service and executable now use the schema 8 workspace. Human and
agent Actors author through the same local HTTP operations. See the
[implementation evidence](PARDNER-EVIDENCE.md) for tested candidates and limitations.

## Open the local UI

People open Pardner with `pardner` (or `pardner open`). It uses the
[local client](PARDNER-CLIENT.md) in the per-user directory `~/.pardner/client`
(override with `--data`). If no client service answers there, it starts
`pardner client serve` in the background, logging to `client.log` (mode 0600) in
that directory, waits up to 15 seconds for it, and then signs the browser in
through a one-time link. `--output-file FILE` writes the private launch URL
instead of launching a browser. Serve flags such as `--http-port` and `--harness`
are passed to a service it starts. If the recorded port answers but rejects the
client's operator token, it reports `PORT_IN_USE` and stops nothing. If a started
service exits, it reports the service's error, such as `STORAGE_IN_USE`.

`pardner client status` reports the running client. `pardner client stop` asks it
to shut down with the local operator token (browser sessions cannot) and waits
until it releases its data directory. Each project runs in a separate local
runtime. The standalone `pardner serve` instructions below are for agents and
integrations.

`pardner client invite --project ID --purpose human|agent|device --output-file FILE
--operation-id ID` writes a private invitation to `FILE`. Human and My device
invitations are joined from another computer, so they need the client started with
`--public-url <https origin>`; without it they fail with `PUBLIC_URL_REQUIRED`,
naming the loopback address and the fix, and nothing is written. Agent invitations
work without it for an agent on the same computer. `pardner client join
--invitation-file FILE --operation-id ID` fails with `INVITATION_UNREACHABLE`, naming
the address, when an invitation points to another computer's loopback address; a
temporary hub outage reports `HUB_UNAVAILABLE` and can be retried with the same
operation ID. See [Invite and join](PARDNER-CLIENT.md#invite-and-join).

The client also supports `show --project ID` and `export --project ID
--output-file FILE`. Use the [recovery guide](PARDNER-CLIENT-RECOVERY.md) for full
cold backups, fresh-install restoration and authority replacement. A content
export does not replace the private registry and replica backup.

Joining and membership use signed records ([client guide](PARDNER-CLIENT.md#invite-and-join)):

| Command | What it does |
| --- | --- |
| `client invite --project ID --purpose human\|agent\|device --output-file FILE --operation-id ID [--role admin\|member] [--person PERSON_ID]` | Signs an offer with this machine's key and writes the private invitation to FILE. Human invitations are for the owner and admins; `--role admin` is the owner's alone. `--person` pairs a machine for someone else (owner or admin) |
| `client join --invitation-file FILE --operation-id ID [--wait SECONDS]` | Sends a join request and reports `{ join: { state, requestId, code } }` until it is approved, then `{ project }`. Run it again with the same operation ID to continue; `--wait` polls and prints the code to stderr |
| `client requests --project ID` | Lists the join requests this machine may approve, adding this approver's nonce so each shows its confirmation code |
| `client approve --project ID --request REQUEST_ID --code CODE` | Signs the admission, only if CODE matches the code this machine derives for the request |
| `client reject --project ID --request REQUEST_ID` | Rejects a waiting request |
| `client revoke --project ID --kind member\|machine\|agent --id ID --operation-id ID` | `member` signs `member.remove` for a person ID or a person's human Actor ID; `machine` (or the older `device`, with a machine or device ID) signs `machine.remove`; `agent` revokes one of this machine's own agents locally. A wrong kind of ID is refused before the operation ID is used |
| `client role --project ID --person PERSON_ID --role admin\|member --operation-id ID` | The owner signs `member.role`, naming the role record it replaces |
| `client resume --project ID` | On the computer that hosts the project: confirms that no machine holds newer state than this restored hub, so it serves other machines again ([recovery](PARDNER-CLIENT-RECOVERY.md#a-restored-hub)) |
| `client people --project ID [--json]` | Lists, as text, each person with their role, who let them in, their machines (short ID, this machine, hosting the project, agents only, online or last seen), agents and person ID, then removed people and machines with who removed them. `--json` prints the same view as data |
| `client review --project ID [--json]` | Lists, as text, the changes that need review: unattributed changes (no valid signature by a member machine, with the reason and the machine that relayed it), changes made by a removed machine, changes claiming an Actor their machine may not act as, changes that altered, replaced or deleted an Activity entry another change wrote (each entry described as it was signed), and changes that left no Activity entry, each with the Activity entries it wrote and its signer, then any equivocation with the machine it names. An unattributed change that carries this computer's own actor says so. Change hashes appear only as details. `--json` prints `changes` and `equivocations` as data |
| `client leave --project ID --operation-id ID` | Signs `member.remove` for this machine's own person: every machine of theirs loses access. The owner can't leave |
| `client profile --project ID --name NAME --email EMAIL --operation-id ID` | Signs a `profile` record so every member sees the new name and email; this computer also keeps them for later projects. Agent names don't change |
| `client invites --project ID [--limit N] [--offset N]` | Lists invitations newest first (10 by default, at most 50 at a time), with who issued each and when, its state, and who used or revoked it |
| `client revoke-invite --project ID --invite INVITE_ID` | Revokes an unused invitation |

`client list` and `client status` also report `removedProjects`: each project this
computer was removed from, or whose person was removed or left, with who removed
it. The project's local copy stays, and `client export` still works.

`client create` suggests pairing a second machine: if the owner loses every
machine, nobody can remove or demote admins.

Build the browser client with `npm ci --prefix ui-prototype` and `npm run ui:build`
before opening it. The board is signed in by the client session: the signed-in
Actor authors every change, and filters are remembered per project and Actor. No
token is entered in or compiled into the browser. The standalone service's
`/pardner/` page serves no board; it points people to `pardner open`.

Phone access is not currently offered; it is planned through the hub over HTTPS.

The board, task editor, handoff form, comments, conflict alternatives, explicit
read receipts, history, and commit evidence use the same operation API as the CLI.
The browser owns no Automerge database; the client's project runtime persists and
synchronizes its workspace. Keep the client running for local authoring.

`npm run test:ui` builds the UI and tests client-mode boards in independent
Chromium and WebKit contexts, connection failures and the session-bound
connection. Install pinned engines with `npx playwright install chromium webkit`
after installing root dependencies. The full multi-replica gate is a separate
qualification step.

## Start a workspace

Use Node 24.11.1 and `npm ci`. Run `node bin/pardner.js` from this checkout, or
install the package to put `pardner` on PATH. The examples below use `pardner`.

```sh
pardner serve --data .pardner
```

This starts the standalone agent and integration service on loopback ports
8004/8005: one project on this computer for agents and scripts. It generates a local
API token and writes `.pardner/connection.json` with mode 0600. CLI commands discover
that file; `--data`, `--server`, and `--token` override connection settings. The
equivalent environment variables are `PARDNER_DATA_DIR`, `PARDNER_LOCAL_URL`, and
`PARDNER_API_TOKEN`. `npm run sync` also starts this runtime.

The standalone service is **not** the client. It keeps its own data, so its tasks do
not appear in `pardner open`, and the client's projects do not appear here. It serves
no other machine: it signs its project genesis with a one-time key that it does not
keep, so no machine can ever be admitted to it. Use the
[local client](PARDNER-CLIENT.md) for a project that people open or that other
machines join.

Register the first Actor explicitly, then register the other humans and agents:

```sh
pardner actors register alice --handle alice --kind human --actor alice
pardner actors register builder --handle builder --kind agent --actor alice
pardner actors register reviewer --handle reviewer --kind agent --actor alice
pardner task create --title 'Ship Pardner' --assignee builder --actor alice --operation-id create-001 --json
pardner tasks --assignee builder --json
```

Actor IDs remain stable across replicas. Handles are accepted where an Actor is
selected. Mutations require `--actor` or `PARDNER_ACTOR`; there is no implicit
human or agent identity. `--agent` is an Actor-selection alias.

## Another machine

Machines sync only through the client, and only as member machines: each client
directory's machine key is its only credential towards other machines. Host a project
in one client and join it from another with an invitation
([client guide](PARDNER-CLIENT.md)). There is no shared secret to provision or
rotate: to cut a machine off, remove it (`pardner client revoke --kind machine`).

The hand-run hub and replica roles are retired. `pardner serve --role hub|replica`,
`--hub`, `--hub-ws` and `--hub-token`, and the environment variables
`PARDNER_ROLE`, `PARDNER_HUB_URL`, `PARDNER_HUB_WS_URL`, `PARDNER_HUB_TOKEN`,
`PARDNER_REPLICA_ID`, `PARDNER_REPLICA_TOKEN` and `PARDNER_REPLICA_CREDENTIALS` are
refused with an explanation. A directory that held a hand-run replica is left
unchanged and refused (`ROLE_MISMATCH`); a hand-run hub's directory still opens as a
standalone service.

How machines authenticate:
- **Sync socket.** The native socket opens with the machine handshake: both sides
  sign a transcript of the protocol version, project ID, both machine IDs, both
  fresh nonces, both roles and the route as dialled. The hub serves only a current
  member machine, and the joining machine accepts nothing until the hub is a member
  machine in the log rooted at the project ID it expected.
- **HTTP.** A session opens with the same exchange (`POST …/session`, then
  `…/session/confirm`); each later request is signed by the machine key over the
  session, a sequence number, the method, the URL as dialled, the body and the
  project, in the `x-pardner-session`, `x-pardner-seq` and `x-pardner-signature`
  headers. A replayed request is refused.
- **Inside one machine.** The client's own loopback hop to its project runtime keeps
  its local token and ticket, as do browser cookies, the operator token and agent
  grants. None of them is accepted between machines.

Member machines are trusted full document writers: their synchronized changes bypass
the operation API's schema, attribution, revision and command validation. Changes
are not signed yet, so a member machine's word is taken for who made a change.

Existing incompatible storage is rejected and left intact. Choose a fresh
directory; there is no automatic migration. A second process cannot own the same
directory, and process death releases its OS-backed lock.

Version 4 stores mutable task, vein, and goal fields and comment bodies in shared
register maps. Retried creation requests on disconnected replicas therefore share
each field's merge location. A shared map records superseded field revisions, so
a late retry cannot resurrect an initial value after an edit or explicit
resolution. Version 4 added goals, veins, and task–vein links to version 3;
schema 5 adds request-bound stored operation identities and integrity inspection;
schema 6 adds the signed project genesis and membership records, and derives the
workspace ID from the genesis. Schema 7 stores every string as an immutable scalar
value, including operation payload copies and membership records. Reads remain
ordinary strings; field-level authored alternatives, explicit resolution and retry
identity are unchanged. Schema 8 moves membership records to version 2: each
admission or pairing carries the joining machine's signed consent, and person IDs
are derived from machine keys. Earlier directories must be preserved and replaced with a fresh workspace; all
services participating in a workspace must use the same schema version.

## Read, edit, and hand off

`pardner show <task> --actor builder --json` returns the full description,
comments, revisions, conflicts, history, commit evidence, and sync status. It does
not mark comments read. Comment `revisionIds` includes every concurrent revision;
submit only revisions actually observed using `pardner read --receipts`.
With `--actor`, each comment also lists `unreadRevisionIds`, the revisions that Actor has no receipt for, authors included.

An edit supplies the revisions observed in `show` for the affected fields:

```sh
pardner update TASK --actor builder --status in-progress \
  --revisions '{"status":["OBSERVED_OPERATION_ID"]}' --operation-id update-001
pardner handoff TASK --actor builder --to reviewer --status review \
  --message 'Implementation is ready; please review the evidence.' \
  --revisions '{"assignee":["ASSIGNMENT_REVISION"],"status":["STATUS_REVISION"]}' \
  --operation-id handoff-001
```

Handoff atomically changes assignment/status, adds the explanation, and mentions
the recipient. Different-field edits merge. Concurrent same-field alternatives
remain attributed; `pardner resolve` requires the full observed revision set.
`STALE_UPDATE` means refresh context and decide again. Never silently retry a
stale edit using freshly fetched revisions.

For transport failures, retry the **same payload with the same operation ID**.
An existing matching operation is replayed; reuse for a different payload returns
`OPERATION_ID_REUSED`. `pardner operation --request JSON` exposes the complete
shared-operation envelope for deterministic agent clients.

The request's `operationId` is a caller-selected retry key. Receipts and history
return it as `requestId`; their `operationId` is a service-derived SHA-256 identity
binding that key to the operation type, resolved Actor ID, and canonical payload.
Use returned operation IDs as revision tokens; retry with the original request
key and payload. Identical requests on disconnected replicas remain one logical
operation. Different requests sharing a key receive distinct stored identities,
so both effects and history survive convergence; subsequent reuse of that
ambiguous key returns `OPERATION_INTEGRITY_CONFLICT` (HTTP 409), with
`details.requestId`, `status: unresolved`, and every acknowledged variant.
Local incompatible reuse before a conflict is known remains `OPERATION_ID_REUSED`.
`show`/task context includes `integrityConflicts`, and the task browser shows an
unresolved operation ID conflict with full variants. Each variant's `origins`
lists every recorded replica/timestamp; these are provenance, not request identity.
No inspection or retry repairs/replays the conflicting mutations. Ordinary field
resolution does not resolve operation integrity. Same-field collisions also
require explicit field resolution.

This identity format requires schema 8 on every service. Older workspace data is
preserved and rejected as incompatible; do not overwrite or automatically migrate
it. Enroll a new workspace using compatible services.

## Link GitHub issues

A task can link to one or more existing GitHub issues, and one issue to several
tasks. Pardner records the reference only: it does not contact GitHub, and task
status never changes the issue.

```sh
pardner issue link TASK depatchedmode/pardner#77 --actor alice
pardner issue unlink TASK depatchedmode/pardner#77 --actor alice \
  --revisions '["LINK_REVISION"]'
```

`show` lists each link's `repository`, `number`, `url` and `revisions`. An unlink
needs the revisions it observed, so a link another replica added concurrently stays.

## Pursue goals through veins

A vein is a line of work toward a goal. Every vein pursues exactly one goal.
`--goal` takes an existing goal ID, or the title of a new goal to create in the
same operation. A mistyped generated goal ID is rejected rather than becoming a
title.

```sh
pardner vein create --title 'Edge caching' --goal 'p95 under 200ms' --actor alice
pardner vein create --title 'Rewrite the hot path' --goal GOAL --actor alice
pardner task create --title 'Add latency instrumentation' --vein VEIN_A,VEIN_B --actor builder
pardner vein add VEIN TASK --actor builder
pardner tasks --vein VEIN --json
pardner veins --goal GOAL --json
pardner vein show VEIN --json
```

One task can contribute to several veins. Links are recorded individually, so
links made on different machines at the same time all survive. Removing a link
supplies the link revisions observed in `show` (task) or `vein show`; a link added
concurrently that the removal did not observe is kept:

```sh
pardner vein remove VEIN TASK --revisions '["OBSERVED_LINK_REVISION"]' --actor builder
```

If a vein is moved to different goals on different machines at the same time,
it is listed under each of those goals, with its `goalIds`, until someone
resolves the move with `vein resolve`.

Tasks end `completed`, `dead-end`, or `abandoned`. When every task in an `open`
vein has ended under every concurrent status, `vein show` and `veins` report
`readyForVerdict`; a person then records the vein's verdict. Goals are closed
separately:

```sh
pardner vein update VEIN --status proven --revisions '{"status":["OBSERVED_REVISION"]}' --actor alice
pardner goal update GOAL --status achieved --revisions '{"status":["OBSERVED_REVISION"]}' --actor alice
```

Vein statuses are `open`, `proven`, `dead-end`, and `abandoned`; goal statuses are
`open`, `achieved`, and `abandoned`. Vein and goal edits follow the same revision
and conflict rules as task edits. Moving a vein uses `vein update --goal GOAL`;
concurrent moves are kept as alternatives until `vein resolve --field goalId`.
Task branches start without veins, and merging a branch never changes the
parent's veins.

## Agent delivery

```sh
pardner mentions pending --actor builder
pardner mentions claim-next --actor builder --request-id inbox-poll-001
pardner mentions ack MENTION --actor builder --claim-token TOKEN
pardner mentions release MENTION --actor builder --claim-token TOKEN
```

The local service forwards delivery requests to the hub's transactional SQLite
ledger. A harness must durably store the claimed message in its own inbox before
acknowledging it. Claims are delivery leases, not task execution locks. Reuse a
claim request ID only to retry that request; subsequent polls need new IDs. An
empty claim response is also replayable. Expired, released, or superseded tokens
cannot acknowledge work.

New dispatch requires the hub. `HUB_UNAVAILABLE` does not prevent an agent from
continuing accepted work and saving comments or task operations locally. External
side effects still need harness-level idempotency; a delivery acknowledgement is
not an exactly-once execution guarantee.

## Results and verification

Coordination commands emit exactly one JSON value on stdout, including failures.
Diagnostics and Git output go to stderr. Successful commands exit 0; errors exit
1 and expose `error.code`, `error.message`, and `error.details`. A Git commit whose
task link fails returns the existing commit hash and recovery instructions; use
`link-commit` to finish the link without making another Git commit.

`savedLocally` confirms the acknowledged operation crossed the local disk barrier.
`syncPending` clears only after an explicit hub persistence acknowledgement covers
the current heads. An open socket alone is insufficient.

```sh
npm run test:qualification
npm run test:runtime
npm run test:cli
```

These focused suites exit naturally. `npm run verify` builds the UI, runs the full
regression suite without forced exit and exercises one acceptance scenario.
`npm run test:acceptance -- --repeat 20 --seed 1` is the separate deliberate gate;
its deterministic workers do not establish the [real-agent rehearsal](PARDNER-CLIENT-REHEARSAL.md).

## Native transport diagnostics

The `smoke:native-peer` and `stress:native-peer` tools drove hand-run replicas with
shared tokens and are retired with them. Their scenarios run in the regression suite
with member machines: one Actor and two Actors across replicas and offline recovery
(`test/sync-use-cases.test.js`), and transport admission
(`test/native-replica-auth.test.js`).
