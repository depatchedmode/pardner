# Pardner

Local-first task tracking and coordination for humans and agents, built on **Automerge CRDTs** (tasks, comments, mentions, activity, timeline / patchwork, and optional git commit attribution).

## Direction

This section describes **product intent**. The **Current implementation** section below describes what this repository runs today.

### Today (user experience)

- One workspace of tasks, comments, activity, and history—**usable offline** on any device that holds a **replica** of the data.
- **Multiple replicas** (for example laptop + cloud) should **catch up automatically** when a network path exists. If something cannot be merged safely, the system should **surface that clearly** and offer a **manual / explicit** fallback.
- **Many humans and agents** contribute. **Concurrent structured edits** should **merge** without requiring Google Docs–style live co-editing of the same field.
- **Coarse access control** for now: a **shared workspace secret**, effectively **flat permissions** for everyone who has it.
- **Attribution** should be **hard to mess up by accident** (for example multiple agent personas in the same shell or wrong git metadata) and should move toward **self-verifying** actor identity over time.

### Tomorrow (user experience)

- A larger mix of humans and agents across **many sites**; **optional relays** (any node may opt in to help routing). **Intelligent routing** is expected to lean on the **sync ecosystem / dependencies**, not this repo alone.
- **Presence**: see who is “around” in the work—**including across replicas**—before or alongside deeper collaboration features.
- **Capabilities-style authorization** (for example UCAN / Keyhive-shaped ideas) with **cryptographically bound identity**. **Reads** remain broadly available to everyone admitted to the workspace (no emphasis on filtered / constrained read replicas).
- **Rich real-time co-editing** should feel **continuous** with the same local-first model. **Live editing** may assume a **shared session or live network path** between editors, while the **underlying data layer** still tolerates **offline work and partitions** elsewhere.
- **Replica-aware authorship**: part of identity is **which replica** produced a change. **Replicas** have **identity and metadata** (for example **where** they run—region, host—and **form factor**: phone, laptop, cloud VM).

### Key concepts

- **Replicas** are the unit of **storage**, **sync**, and **partition tolerance**.
- **Actors** (humans and agents) are **not bound** to a single replica; they should be able to **act from different places**, with state **converging** across replicas.
- Holding a **full replica** is **opt-in**: for **local-first authoring**, **backup / stewardship**, or running infrastructure—not a requirement for every participant.

### Tasks, veins, and goals

Plans in agent-assisted work are hypotheses, not blueprints. Pardner's vocabulary treats them that way:

- A **task** is one unit of work, never larger than a branch. It can end `completed`, or as a `dead-end` or `abandoned`—both are results worth recording.
- A **vein** is a line of work toward a goal: an approach you follow until it pays out or runs dry. A vein can be started deliberately or recognized after the fact, and one task can contribute to several veins. A person gives each vein its verdict: `proven`, `dead-end`, or `abandoned`. Pardner flags an `open` vein as ready for a verdict once all of its tasks have ended.
- A **goal** is the state a vein pursues. Every vein has one; several veins can pursue the same goal with different approaches. A goal is `achieved` or `abandoned` deliberately—a proven vein never closes it on its own.

## Current implementation

All document strings are immutable scalar values (Automerge `ImmutableString`),
including field registers, operation history and membership records. Reads expose
ordinary JavaScript strings. Different-field merging, authored same-field
alternatives and explicit resolution retain their existing behavior; Pardner
replaces whole values and does not splice collaborative text. Schema 7 refuses
earlier storage directories without migrating or deleting them.

Each client directory has its own Ed25519 machine key, created on first start and
reported as a machine ID by `client status`. Creating a project signs a
`project.genesis` record with that key, naming the creator as owner, and the
project ID is derived from that record, so anyone with the ID can check the
genesis. Signed membership records live in the project document. Each project
also keeps a grow-only local store of every valid record its client has seen,
saved before the client uses one. A record later removed from the document still
counts and is written back. Tampered or foreign records are not stored, and
`client show` reports them beside the membership computed from the store.

**Joining is approved on signed records.** Invitations carry an offer signed by
the issuing machine; only the owner or an admin invites people, and an admin
offers only the member role. A new machine's join request waits in a bounded,
expiring queue on the hub, the project's host client, and receives nothing from
the project until approved. Approval follows a confirmation code that both sides
derive from the offer, the joiner's key and a nonce the approver adds; the
approving machine signs the admission. A person's own machine, the owner or an
admin pairs another machine into that person's identity, and pairing never
creates a second person. Removal (`member.remove`, `machine.remove`) and owner-only
role changes are records too. Every new record enters through one gate on the hub
that refuses removed machines and signers without the needed role. A removed
machine or person returns only as a new machine key or a new person. A person
can leave a project from their own machine; the owner can't.

**Only member machines sync.** Machines authenticate to each other with their
machine keys alone; no bearer token is issued, stored or accepted between machines.
Every sync connection opens with a mutual challenge and response: each side signs
a transcript of the project ID, both machine IDs, both fresh nonces, both roles and
the route dialled, so a recorded or relayed answer is useless elsewhere. The hub
serves only a current member machine of its records, and a joining machine accepts
nothing until the hub proves it is a member machine of the project its invitation
named. Every other request between machines is signed by the machine key within a
short session opened the same way, and a replayed request is refused. When the hub
applies a removal it closes that machine's sync and signed sessions at once. The
Actors a machine may act as come from its records. A write checks this machine's
own records locally and never waits on the hub. A hub restored from a backup, or
shown by a member that it fell behind, serves no other machine until a member that
saw a later state has synced its membership, or its operator runs
`pardner client resume`. Two live sync sessions for one machine are reported.

**The People panel** in each board's header lists every person with their role,
who let them in, their machines (online or last seen where the hub knows it) and
their agents, and lists removed people and machines with who removed them. It
offers only the actions the viewer may take: inviting, approving join requests
with the code, pairing machines, removing machines and people, changing roles,
editing your own name and email (a `profile` record every member's board shows),
and leaving, each removal confirmed with its consequences. Invitation history
names who issued and used each invitation. A computer removed from a project
keeps it listed as removed, says who removed it and how to come back, and is
never shown as signed out. `client people` gives the same listing as text. Last
seen is held in the hub's memory only, so it resets when the hub restarts.

What is not enforced yet: **changes are not signed, so a member machine's word is
taken for who made a change.** Any member may change anything, and the local
service on the machine that made a change attributes it. Agent grants limit agents
only on their own machine. Activity entries do not yet show which machine signed a
change, and nothing flags unattributed changes; both wait for signed changes. A
member running a modified client could still write a record signed by its own
machine straight into the document. The hub harvests that
as history, without the role check, so a demoted admin could still remove a member
that way; records from a removed machine are refused. Records are enforced only at
the hub. A removed machine that synced after a hub's backup was taken, was removed
while offline, and is the first to reach the restored hub can still be served
until a member holding the removal connects. Peers do not sync directly, and hub
routes rely on HTTPS for confidentiality. The rest of the trust rollout remains a
[plan](docs/PARDNER-TRUST-PLAN.md).

The [local client onboarding preview](docs/PARDNER-CLIENT.md) adds a private
identity and project registry, isolated project runtimes, Start/Join, purpose-specific
invitations with approval, and authenticated Actor sessions. `pardner open` (or a bare `pardner`)
starts the client service when it is not running and signs the local browser in
through a one-time link, with no token screen or Actor picker. Git supplies profile defaults; the session
determines authorship. The browser can switch projects and show reported Actor
presence. This preview does not migrate existing standalone installations.
The local client is the only way people open the board, and it listens on this
computer's loopback only. Phone access is not currently offered; it is planned
through the hub over HTTPS.

The standalone service (`pardner serve`) is an agent and integration service: one
project on this computer whose attributed operation API agents and integrations use
through the `pardner` CLI. It serves no other machine, and its data is separate from
the client's projects. Its `/pardner/` page serves no board; it points people to
`pardner open`. Only the client hosts a project for other machines or joins one.
Each service owns a persisted Automerge replica; a hub relays changes and owns a
transactional SQLite delivery ledger. Actor identity is separate from replica
identity, so the same Actor can work from more than one machine.

Local operations are acknowledged only after a disk persistence barrier. Enrolled
replicas reopen without the hub and reconnect with a fresh machine handshake.
Member machines are trusted full document writers: their synchronized changes bypass
operation validation. Ordinary API and Actor credentials authorize only a machine's
own API and UI subscriptions; they are never accepted between machines.
Different-field edits merge; same-field alternatives retain their authors and
require explicit resolution. A synced indicator requires an explicit hub
persistence acknowledgement covering the displayed document heads.

The local client serves the task board at `/pardner/`: full task context,
revision-aware edits, atomic handoffs, comments, read receipts, conflict
alternatives, history, and commit evidence, authored by the signed-in Actor. The
browser authenticates with an HttpOnly session cookie and owns no separate
Automerge database. Task descriptions and comments support Markdown,
but images are displayed as alt text to prevent automatic tracking requests.
The browser image policy permits only same-origin assets and data images, and
outgoing links do not send a referrer.

Agent harnesses claim mentions through their local service, which forwards lease
requests to the hub. They must durably receive a message before acknowledging it.
New dispatch requires the hub; accepted work can continue and save locally while
the hub is unavailable. Delivery leases are not task-execution locks, and external
side effects still require harness-level idempotency.

An opt-in [local agent bridge](docs/PARDNER-BRIDGE.md) can receive deliveries
durably and wake explicitly authorized, dedicated Codex App Server sessions.
It queues busy work and reconciles uncertain dispatch without model polling.
It attaches to a standalone service or, with an agent credential from
`client agent-grant`, to one agent Actor of a client project.
Real co-host rehearsals cover handoff and archive recovery; other adapters and
separate-machine qualification remain follow-up work.

The board's **Control** view is a [project control pane](docs/PARDNER-CONTROL-PANE.md)
for development through T3 Code, available to people on this computer. It maps existing T3 threads to agent Actors with
explicit task and sender authorization, saves follow-ups before sending them one at
a time, and keeps intent, run identity, holds, output and verdicts on this host across
restarts. Execution completion, an independent check and human acceptance are
recorded separately. Tasks can link to existing GitHub issues; Pardner stores the
reference only and never changes GitHub. Live dispatch with a real provider is not
yet qualified.

For development coordination, use the separately pinned
[control runtime](docs/PARDNER-CONTROL-RUNTIME.md), whose data and evidence live
outside candidate checkouts. Its historical compatibility pin is distinct from
the current implementation described here.

## Quick start

Use Node **24.11.1**. From this checkout:

```sh
npm ci
npm ci --prefix ui-prototype
npm run ui:build
node bin/pardner.js open --harness openai-codex --name Alpha
```

`pardner open` (or a bare `pardner`) starts your local client service in the
background if it is not already running, using `~/.pardner/client` unless you pass
`--data`, and opens the board in your browser. `pardner client stop` stops it.

Confirm your Git-derived profile, then start or join a project. Use the actual
setup agent's harness and name; the example registers Alpha as a Codex Actor.
See the [client guide](docs/PARDNER-CLIENT.md) for invitations, private agent
credentials, connectivity and recovery boundaries.
The [recovery guide](docs/PARDNER-CLIENT-RECOVERY.md) covers private content export,
device revocation, complete cold backups and restoring an authority at its existing
address. The [client rehearsal](docs/PARDNER-CLIENT-REHEARSAL.md) records the separate
real-human/real-agent acceptance flow.

### Standalone service

The standalone service is for agents and integrations; people use `pardner open`.
Agents and scripts name their Actor explicitly on each command:

```sh
node bin/pardner.js serve --data .pardner
```

In another terminal, register human and agent Actors explicitly:

```sh
node bin/pardner.js actors register alice --handle alice --kind human --actor alice
node bin/pardner.js actors register builder --handle builder --kind agent --actor alice
node bin/pardner.js task create --title 'Coordinate our first task' --assignee builder --actor alice --operation-id first-task
node bin/pardner.js tasks --assignee builder --json
```

The service writes its credentials to `.pardner/connection.json` (mode 0600) for the
CLI and integrations. Install the package to expose `pardner` directly on PATH; `npm
run sync` also starts the local service.

The standalone service syncs with no other machine. To work on a project from
another machine, host it in the client (`pardner open`, then create a project) and
join it from the other machine's client with an invitation; the
[client guide](docs/PARDNER-CLIENT.md) covers invitations, approval and recovery.

## UI development

Run `pardner client open --data DIR --output-file FILE` to start a local client
(its URL is in `DIR/client-connection.json`), then
`PARDNER_CLIENT_URL=<that URL> npm run dev --prefix ui-prototype`. Open the one-time
grant from `FILE` with its origin replaced by `http://127.0.0.1:5174` within a
minute. The dev server proxies `/pardner/config` and `/pardner/client/` to the
client and presents the client's Origin and Host only for its own page, so the
origin-bound grant, session cookie and socket tickets work. It is loopback-only and
serves files only from `ui-prototype`; workspace state in `.pardner` is denied.
Keep runtime data outside `ui-prototype`, including its `public` directory.
Do not expose this development server with `--host`: its proxy reaches your
client session.

## Coordination commands

| Task | Command |
| --- | --- |
| Agent work queue | `pardner tasks --assignee builder --json` |
| Complete context | `pardner show TASK --actor builder --json` |
| Attributed progress | `pardner comment TASK 'Progress and evidence' --actor builder` |
| Atomic assignment/status/explanation | `pardner handoff TASK --to reviewer --status review --message TEXT --revisions JSON --actor builder` |
| Resolve concurrent values | `pardner resolve TASK --field status --value review --revisions JSON --actor alice` |
| Delivery | `pardner mentions claim-next --actor builder --request-id ID` |
| Explicit observed reads | `pardner read TASK --receipts JSON --actor alice` |
| Commit evidence | `pardner commit --task TASK --actor builder -- -m MESSAGE` |
| Link an existing GitHub issue | `pardner issue link TASK owner/repo#77 --actor alice` |
| Start a vein toward a new or existing goal | `pardner vein create --title TEXT --goal 'GOAL_ID or new goal title' --actor alice` |
| Add a task to a vein | `pardner vein add VEIN TASK --actor builder` |
| Record a vein's verdict | `pardner vein update VEIN --status proven --revisions JSON --actor alice` |
| Goals and their veins | `pardner goals --json`, `pardner goal show GOAL --json` |

An agent Actor of a client project runs the same commands with
`--token-file FILE` (the credential from `client agent-grant`) instead of `--actor`;
see the [client guide](docs/PARDNER-CLIENT.md#actors-and-presence).
Writes require an Actor and field edits require the revisions returned by `show`.
Use the same request operation ID and identical payload to retry an uncertain write.
Receipts expose this retry key as `requestId` and a derived `operationId` for history
and revision tokens; see the [operation identity contract](docs/PARDNER-CLI.md).
Coordination commands emit one JSON result on stdout; errors include stable codes
and details, with diagnostics on stderr. Reads do not implicitly mark comments seen.

Comment edits, conflict resolution, and deletion are author-only, with no moderator
exception. Use `comment-delete COMMENT --revisions '["REVISION"]'` to delete
your own comment; other Actors receive `FORBIDDEN`. The browser disables
**Keep this comment** for non-authors and explains why; edit and delete remain
CLI/API operations. Deletion removes the comment from the conversation, not its
audit history. Retrying the same successful delete operation ID remains idempotent.

## Validation and goal state

The measurable automated goal is a complete two-human/two-agent workflow across
persisted replicas, under partitions, process kills, and acknowledgement loss,
with no missing or duplicate acknowledged effects. The performance fixture has
100 tasks, 400 comments, and 200 scripted updates. Required bounds are 2.5 seconds
for local operation acknowledgement, 2 seconds for local UI visibility,
6 seconds for offline opening, and 10 seconds for
convergence. Completion requires 20 successful varied seeds and fresh-checkout
verification, not just matching final replica states.

```sh
npx playwright install chromium
npm run verify
npm run test:acceptance -- --repeat 20 --seed 1
```

See the [acceptance contract](docs/PARDNER-ACCEPTANCE.md) for scenario details and
artifact locations, and [implementation evidence](docs/PARDNER-EVIDENCE.md) for
what has actually passed. The schema 2 milestone passed the 20-seed acceptance gate
and fresh-checkout verification. Schema 3 review fixes passed `npm run verify`;
see the separate qualification in the [milestone audit](docs/PARDNER-GOAL-AUDIT.md). The [two-machine real-agent rehearsal](docs/PARDNER-REHEARSAL.md)
is prepared for separate human signoff; automated success does not claim it ran.
`npm run verify:model` checks a bounded, code-mapped [lifecycle ordering model](docs/PARDNER-LIFECYCLE-MODEL.md)
of request admission, persistence acknowledgement and shutdown; it establishes
its properties within that model only.

## Storage and dependencies

A schema 7 directory contains workspace metadata, Automerge storage, the
grow-only membership record store, an exclusive service lock, and local connection
settings. The hub additionally holds the SQLite delivery ledger. A client
directory also holds its machine key. Client directories and storage directories
using an earlier schema are refused and left unchanged; choose a fresh directory
rather than migrating or deleting existing data.

Automerge **3.2.3** and Repo/network **2.5.1** are pinned. The persistence wrapper
isolates the pinned Repo storage-subsystem integration and is qualified with fault
injection and process-kill tests. These establish tested process-crash durability,
not power-loss durability or arbitrary filesystem guarantees.

Shared-secret admission currently grants flat workspace access. Federation,
presence, capability-based authorization, browser-only persistence, rich text
co-editing, and old-data migrations remain outside this milestone.

## History

- Original design was a **companion layer to beans**; the project **pivoted** to a full **Automerge-backed** system.
- Tasks were imported during migration; original IDs were preserved as `clawd-<hash>`. **Beans is deprecated.**
- **2026-02-02:** Initial multi-agent coordination features landed.
- **2026-02-08:** Operating deployment was **consolidated** around a **single-operator** workflow; multi-agent infrastructure may still exist in the data model and code paths.

## License

MIT
