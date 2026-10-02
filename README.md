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

Pardner runs one local service per machine. Human and agent Actors use the same
workspace and attributed operation API, through the browser or `pardner` CLI.
Each service owns a persisted Automerge replica; a hub relays changes and owns a
transactional SQLite delivery ledger. Actor identity is separate from replica
identity, so the same Actor can work from more than one machine.

Local operations are acknowledged only after a disk persistence barrier. Enrolled
replicas reopen without the hub and reconnect using fresh WebSocket tickets.
Different-field edits merge; same-field alternatives retain their authors and
require explicit resolution. A synced indicator requires an explicit hub
persistence acknowledgement covering the displayed document heads.

The task board is served locally at `/pardner/`. It supports explicit Actor
selection, full task context, revision-aware edits, atomic handoffs, comments,
read receipts, conflict alternatives, history, and commit evidence. Credentials
are entered at runtime and remembered in browser local storage without application expiry. The browser owns
no separate Automerge database.

Agent harnesses claim mentions through their local service, which forwards lease
requests to the hub. They must durably receive a message before acknowledging it.
New dispatch requires the hub; accepted work can continue and save locally while
the hub is unavailable. Delivery leases are not task-execution locks, and external
side effects still require harness-level idempotency.

An opt-in [local agent bridge](docs/PARDNER-BRIDGE.md) can receive deliveries
durably and wake explicitly authorized, dedicated Codex App Server sessions.
It queues busy work and reconciles uncertain dispatch without model polling.
Real co-host rehearsals cover handoff and archive recovery; other adapters and
separate-machine qualification remain follow-up work.

## Quick start

Use Node **24.11.1**. From this checkout:

```sh
npm ci
npm ci --prefix ui-prototype
npm run ui:build
node bin/pardner.js serve --data .pardner
```

In another terminal, register human and agent Actors explicitly:

```sh
node bin/pardner.js actors register alice --handle alice --kind human --actor alice
node bin/pardner.js actors register builder --handle builder --kind agent --actor alice
node bin/pardner.js task create --title 'Coordinate our first task' --assignee builder --actor alice --operation-id first-task
node bin/pardner.js tasks --assignee builder --json
```

Open `http://127.0.0.1:8004/pardner/`, enter the token from
`.pardner/connection.json`, and choose an Actor. The service generates that file
with mode 0600. Install the package to expose `pardner` directly on PATH; `npm run
sync` also starts the local service.

For a companion device on the same trusted network, choose **Pair another device**
on the desktop, enable LAN access, restart the service, then scan the QR code to pair
automatically. You can also use the address and one-time code to connect manually.
Use the assignee and status filters to find review tasks.
See [companion device and LAN access](docs/PARDNER-LAN.md) for setup, transport,
credential lifecycle, and recovery. Loopback-only defaults remain unchanged.

For another machine, enroll a fresh replica with `pardner serve --role replica
--hub URL --hub-ws URL --hub-token TOKEN`. The hub must be reachable for enrollment;
its role, addresses, and credentials are then remembered locally. The hub defaults
to loopback and must explicitly bind the intended interface for remote machines.
See the [service and CLI guide](docs/PARDNER-CLI.md) for complete examples.

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
| Start a vein toward a new or existing goal | `pardner vein create --title TEXT --goal 'GOAL_ID or new goal title' --actor alice` |
| Add a task to a vein | `pardner vein add VEIN TASK --actor builder` |
| Record a vein's verdict | `pardner vein update VEIN --status proven --revisions JSON --actor alice` |
| Goals and their veins | `pardner goals --json`, `pardner goal show GOAL --json` |

Writes require an Actor and field edits require the revisions returned by `show`.
Use the same operation ID and identical payload to retry an uncertain write.
Coordination commands emit one JSON result on stdout; errors include stable codes
and details, with diagnostics on stderr. Reads do not implicitly mark comments seen.

## Validation and goal state

The measurable automated goal is a complete two-human/two-agent workflow across
persisted replicas, under partitions, process kills, and acknowledgement loss,
with no missing or duplicate acknowledged effects. The performance fixture has
100 tasks, 400 comments, and 200 scripted updates. Required bounds are 2 seconds
for local save/visibility, 5 seconds for offline opening, and 10 seconds for
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

## Storage and dependencies

A version 3 directory contains workspace metadata, Automerge storage, an exclusive
service lock, and local connection settings. The hub additionally holds the
SQLite delivery ledger. Incompatible prior installs are rejected and preserved;
choose a new directory rather than migrating or deleting existing data.

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
