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
replaces whole values and does not splice collaborative text. Schema 10, whose
changes are signed by the machine that made them and whose signature cache keeps
equivocation reports, refuses earlier storage directories, and version 4 client
directories refuse earlier ones, without migrating or deleting them.

Each client directory has its own Ed25519 machine key, created on first start and
reported as a machine ID by `client status`. Creating a project signs a
`project.genesis` record with that key, naming the creator as owner, and the
project ID is derived from that record, so anyone with the ID can check the
genesis. A person's ID is derived from the public key of the machine they were
first admitted with (the creator's, for the owner), so nobody can admit a new key
under an existing person. Further machines join a person only by pairing, and a
computer paired into someone's identity can't start a project or join another as
a new person. Signed membership records live in the project document. Each project
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
creates a second person. Every admission or pairing record carries the joining
machine's own signed join request, naming the project, the person and a hash of
the whole offer, and counts only with it: nobody can certify a key they don't
hold, and a consent can't be reused for another role or purpose. Certifications
never displace each other, whatever order records arrive in: a key certified twice
for one person is one machine, agents-only only if every certification says so; a
person admitted twice holds the highest role any admission gave; and a key
certified for two people is removed, while what it signed still counts. An
agents-only machine signs only its own agents' labels: it can't admit, pair,
remove, leave, change a role or edit a profile. Removal (`member.remove`,
`machine.remove`) and owner-only role changes are records too. Every new record enters through one gate on the hub
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
named. The hub answers every handshake alike and judges a machine only once it
has proved its key, so nobody can learn without the private key whether a key was
ever certified; a removed machine that proves its key is told who removed it. Every other request between machines is signed by the machine key within a
short session opened the same way, and a replayed request is refused. When the hub
applies a removal it closes that machine's proven sync and signed sessions at once.
Unproven pending sessions expire uniformly, so revocation does not reveal membership. The
Actors a machine may act as come from its records. A write checks this machine's
own records locally and never waits on the hub. A hub restored from a backup, or
shown by a member that it fell behind, serves no other machine until a member that
saw a later state has synced its membership, or its operator runs
`pardner client resume`. Without `hub-state.json`, a checkpoint must show more
records than the restored store, and verified records must bring the store up to
that count; an old start count cannot vouch. That waiting state is saved with the point checkpoints
are compared against, so it survives any number of restarts and a process kill at
any step, and an established hub whose state file is missing waits too. Two live
sync sessions for one machine are reported. Resume attempts are serialized and
serving stays blocked until the resumed state is saved; a failed write leaves it waiting.

Membership records are limited to 64 KiB of serialized UTF-8 JSON, nesting depth 16
(root depth 0), and 4,096 UTF-16 code units per string or property name, including
unknown fields, offers and join requests. `RECORD_LIMITS` in `lib/membership.js`
defines these rules. Oversized records are refused with a reason before
canonicalization or signature checks at the gate and during harvest. The reducer
uses append-only certification lists, aggregate authority and a queue of newly
gained authority; repeated certifications do not trigger whole-log rescans.

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

**Every change shows which machine made it.** Each Automerge change carries an
actor ID that starts with its machine's ID and ends with 8 random bytes drawn each
time the document is loaded, so a restored backup and its original never reuse an
actor and sequence number. A machine signs only the changes its own write path makes
(operations, the record gate, record write-backs and the board's creation), each
at once with its key, over the project ID and Automerge's change hash; it never
infers authorship from a change's actor ID. It saves the signature in a local,
grow-only signature cache before the change can be saved, and writes it into the
project's signature document, a second document beside the board whose ID every
member derives from the project ID; that document is saved and synced in the
background, off the acknowledgement path, and at start-up and whenever an entry it
verified is deleted or overwritten a machine writes back the signatures it holds
that the document lacks. Every peer applies every change it receives, as before,
then checks that the signature verifies under the machine the actor names and that
this machine is or was a member, and keeps each signature it verified in its own
cache, so deleting an entry from the shared document unattributes nothing it
already checked. No change is refused, dropped or hidden. A received change that
carries this machine's own actor but that it did not sign is unattributed, and the
machine reports that another machine used its actor.

Activity names each entry's signer, the person and the machine; says "signature
pending" while a signature may still be on its way; says "unattributed" and names
the machine that relayed it once the machine that delivered the change has had a
second on a live connection to send one; and says "made by a removed machine" for a
signed change that does not come before that machine's removal in the board's
history. Work from before a removal stays attributed. **A signer line is bound to
the content its change wrote.** Pardner writes every object below the board's
top-level maps once, in the change that creates it, never replaces or deletes an
Activity entry, and leaves an Activity entry or a membership record with every
change; each peer reads every change's operations once and finds any change that
breaks this. An entry a later change altered is shown as its signed change wrote
it, read from the board's history, and marked "altered after signing" with the
altering change's own signer; the altering change, a change that replaced or
deleted an entry, and a change that left no Activity entry are listed for review.
Membership records appear in Activity with their signer, from the verified record
store. The board announces changes that need review, with a filter for them, and
`pardner client review` lists them. Two different changes signed by one machine
with the same actor and sequence number are reported as equivocation, naming the
machine, and the report is kept across restarts: Automerge refuses the second, so
board changes from the peer that carries it stop applying until that machine is
removed and its copy rebuilt. The hub's persistence acknowledgement covers the heads
of both the board and the signature document, and a replica asks for it only once
every signature it made is in the signature document it asks about.

Everything read from the signature document is checked for shape and bounded:
only map shards, change-hash keys and 64-byte values, and a few concurrent values.
A malformed shard is made again as a map and its entries written back. A failure in
a background attribution task is contained, logged and shown in status
(`attribution.failures`), and never stops the service. A member asks the hub about
every change still waiting for a verdict in turn, 500 at a time.

What is not enforced: **a member may still change anything**, as in git. Peers
check who made a change, not whether it was allowed, and people review and undo a
bad change. **A machine's word is taken for which of its Actors acted:** peers
verify the machine and flag only a change claiming an Actor that machine is not
certified for, such as another person's Actor, or a person on an agents-only
machine; agent grants limit agents only on their own machine. **The sync stream
after the handshake is protected only by TLS** (#215): whoever terminates TLS in
front of the hub, such as a reverse proxy or tunnel provider, could relay a
member's handshake and then inject sync traffic, which peers apply and flag as
unattributed. Changes to the signature document are not signed themselves: a
member can delete or overwrite an entry, which unattributes a change only on peers
that never verified it. A member can also front-run another machine's next change
with an unsigned change under that machine's actor and sequence number; the real
change is then refused by Automerge where the forgery arrived first, which is
reported as a conflicting change, not proven equivocation. Whether a change came
after its machine's removal is read from the board's history, so a member who
deletes a removal record from the document can move that point when peers write
the record back; the machine stays removed either way. A member
running a modified client could still write a record signed by its own
machine straight into the document. The hub harvests that
as history, without the current-role check, so a demoted admin could still remove
a member that way; records from a removed machine are refused. Consent, derived
person IDs and the agents-only rule are part of computing membership, so they hold
for such records too. Records are enforced only at
the hub. A removed machine that synced after a hub's backup was taken, was removed
while offline, and is the first to reach the restored hub can still be served
until a member holding the removal connects. Peers do not sync directly, and hub
routes rely on HTTPS for confidentiality. Because the hub answers every hello, any
party can hold one of its 256 pending HTTP sessions for up to 30 seconds without
a member's key. The rest of the trust rollout remains a
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
operation validation, and each is attributed to the machine that signed it. Ordinary API and Actor credentials authorize only a machine's
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
Without `--name`, an agent is named after you and its harness, such as “Maya’s Codex”.
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

A schema 10 directory contains workspace metadata, Automerge storage (the board
and its signature document), the grow-only membership record store, the grow-only
signature cache (`signatures.sqlite`: verified change signatures and equivocation
reports), an exclusive service lock, and local connection settings. The hub additionally holds the SQLite delivery ledger and its own
waiting state after a restore (`hub-state.json`). A client
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
