# What Pardner can learn from Herdr

Herdr makes running agents easier to supervise. Pardner preserves attributed,
mergeable coordination records across replicas. Their architectures serve
different purposes, but both must help a person decide what needs attention next.
Pardner's opportunity is to connect that immediate clarity to durable tasks,
evidence and human decisions.

This is a research record, not a feature plan. All candidates below are
unscheduled. The [current implementation](../README.md#current-implementation)
and [acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for Pardner's
implemented guarantees. This comparison does not establish that either product
is a better supervisor in practice; that would require observing real workflows.

## Scope and sources

This assessment reconciles the original comparison with a second opinion from
Fable 5.2 on 2026-11-12 (America/Vancouver). The reviewers agreed on the central
product lesson and the boundaries below. Fable additionally identified contracts
that the original comparison had mixed between Herdr TUI and herdr-core.

Sources are Herdr's live documentation linked below, read on that date, and
Pardner's repository documentation. These pages can change. The original research
named TUI commit `ee5bfb5` and core commit `ec63ef3`; this revision does not claim
to have reverified every observation against those historical commits. It makes
no adoption ranking: public repository popularity does not establish usage.
No Herdr code is incorporated or proposed for incorporation by this record.

## Distinguish the Herdr products

[Herdr TUI](https://herdr.dev/tui/) and
[herdr-core](https://herdr.dev/core/) are separate runtimes. The newer Herdr app
uses core. A property of one should not be attributed to the whole family.

| Concern | Herdr TUI | herdr-core |
| --- | --- | --- |
| Status | `working`, `blocked`, `done`, `idle`, `unknown`; integrations include screen detection | Program-reported OSC 7501 status; no screen inference; an unreporting program has no status |
| Seen state | Each client tracks viewed completions; CLI/API uses server seen state | Do not import the TUI's seen-dependent status semantics into core |
| Restart | Detach preserves processes; server restart restores layout and may invoke native agent resume | Core restart/update can preserve running terminals; `--keep` recovery starts a fresh shell without rerunning the task |
| Integration context | `HERDR_ENV` and pane/socket variables | `HC_SESSION`, `HC_SOCKET`, `HC_TERMINAL_ID` |
| Input protection | Agent prompting can refuse an already-blocked agent | Sends and parent notes can wait for quiet and a bounded draft delay |

Sources: [TUI concepts](https://herdr.dev/tui/docs/concepts/),
[integrations](https://herdr.dev/tui/docs/integrations/),
[session restoration](https://herdr.dev/tui/docs/session-state/),
[agent skill](https://herdr.dev/tui/docs/agent-skill/), and
[core README](https://github.com/herdrdev/herdr-core/blob/master/README.md).
Core's restart continuity is not a promise of surviving machine reboot or of
resuming the original agent conversation after process loss.

## The product challenge

Offline reopen, authored conflict alternatives and durable delivery remain
valuable Pardner guarantees. Their existence does not establish that supervising
agents feels easy. A person may still have to inspect several views to discover
which decision would unblock work.

Herdr's rolled-up attention state is therefore more than a cosmetic lesson.
It suggests a question for Pardner: can a person identify the next useful
intervention, understand why it is needed, and record a decision without
reconstructing the situation across tasks and sessions?

This is a hypothesis about supervision friction, not evidence that Herdr has
solved durable, cross-replica coordination. A runtime could host agents that use
Pardner; integration feasibility and the runtime's release contract still need
assessment before recommending a supported adapter.

## Where the assessments converge

### 1. Keep execution, intervention, seen and acceptance separate

A running agent, a request for approval, an unread result and a human acceptance
are four different facts. Herdr TUI's `done` combines completion with a viewer
fact, which is why client badges can differ from CLI/API status. That is a useful
warning as well as an interface precedent.

Pardner already has [explicit read receipts](PARDNER-CLI.md),
[per-session presence](PARDNER-CLIENT.md), and a
[Control pane](PARDNER-CONTROL-PANE.md) that separates execution completion,
independent checking and human acceptance. The opportunity is to connect these
signals without erasing their meanings.

A possible attention inbox could derive items from mentions, review handoffs,
conflict alternatives, veins ready for verdict and Control holds. Those records
do not establish that an agent is blocked at an interactive prompt right now;
that requires a harness signal. Each item would need a reason, intended recipient,
source and clearing condition. Per-client viewing, per-Actor read receipts and
acceptance must not become interchangeable. Merely opening a result must not
accept it or resolve its underlying conflict.

### 2. Prefer explicit reports, but define their limits

Core's explicit-report approach is a better precedent for harness status than
owning terminal scrapers. Self-report is still an observation from a reporter,
not proof that work succeeded or that all child processes finished.

The [TUI integration protocol](https://herdr.dev/tui/docs/add-herdr-support/)
offers optional report sequencing. Core's
[event stream](https://github.com/herdrdev/herdr-core/blob/master/schema/README.md)
has a different sequence contract, including restart and reconnect handling.
Neither should be copied as an Actor-wide logical clock.

A future Pardner protocol would need to distinguish Actor, host, session and run;
define ordering within that identity; handle restart and concurrent sessions;
and expire stale observations to unknown. Presence, delivery leases, execution
state and task status must remain distinct. A timeout cannot by itself prove
that a prompt was never received, so uncertain dispatch needs reconciliation
before retry. The existing bridge and Control pane already address parts of
that problem; this is not a proposal to replace them.

### 3. Describe the actual trust boundaries

Herdr's environment markers tell an integration where it is running. They are
not authentication. Core documents a same-account trust boundary rather than
per-client isolation; remote access relies on SSH. See
[core security](https://github.com/herdrdev/herdr-core/blob/master/docs/security.md).

Pardner must also describe its present boundaries accurately. Authenticated Actor
sessions and API credentials are distinct from enrolled replica credentials.
Native replicas are trusted full-document writers whose synchronized changes
bypass operation validation. Standalone mode supports explicit Actor selection;
shared-secret admission grants flat workspace access. Actor attribution must not
be presented as comprehensive capability-based isolation.

A future reporter or adapter should use the expected local service and appropriate
credential/session mapping. An environment variable alone must not grant authority
to mutate records or claim deliveries. See the
[current implementation](../README.md#current-implementation).

### 4. Scope offline behavior and identifiers to their owners

Pardner's local service already owns the persisted replica; the browser owns no
separate Automerge database. A disconnected
[companion LAN browser](PARDNER-LAN.md) cannot acknowledge new writes as locally
saved. A browser connected to its functioning enrolled local service can author
while the hub is unavailable. These are different disconnections.

Likewise, runtime addresses need host/session context, while replicated document
identities must survive synchronization. Herdr's pane and terminal addressing is
not a reason to adopt machine-local identity for shared tasks. Actor, replica,
UI session and execution run must remain distinct concepts.

### 5. Make the persistence ladder visible

Herdr TUI's restoration documentation distinguishes running processes, layout,
screen history and agent resume. Its optional screen history is disabled by
default because terminal output can contain secrets. That is a useful precedent
for any future transcript feature, not a reason to sync shell output into the
workspace by default.

Pardner should explain browser close, local service restart, hub outage, process
kill, lease expiry and recovery separately. Locally persisted heads, explicit hub
persistence acknowledgement and durable delivery receipt are different barriers.
Accepted work may continue and save locally during hub outage; new delivery
leases require the hub. Delivery leases do not lock task execution or make external
side effects idempotent. The acceptance evidence establishes tested process-crash
behavior, not power-loss durability. Synchronization is not backup; see the
[recovery guide](PARDNER-CLIENT-RECOVERY.md).

## Other ideas worth retaining

Both runtimes expose agent instructions through the installed binary's `--skill`.
A short, version-matched Pardner operating guide could complement CLI help and
reduce invented commands, while explaining actual credential and revision
requirements. This is a documentation/discovery candidate, not a change to
command authorization.

Core's draft protection is a bounded delay, not an indefinite guarantee that
human input cannot be interrupted. Before proposing an equivalent, compare it
with the [bridge](PARDNER-BRIDGE.md) and Control pane's existing queues and holds.
Parent/child lifetime rules are also worth studying, but terminating a runtime
helper must never imply deleting its task, evidence or durable delivery history.

## Questions if this is revisited

None of these is scheduled. The attention candidate also appears in the
[Kortix assessment](PARDNER-KORTIX-LESSONS.md).

1. Which attention items can existing records derive, and which need new harness
   observations? What action clears each item, and for which viewer or Actor?
2. Which state belongs in the replicated document, host-local Control storage or
   ephemeral presence? How are stale and conflicting observations displayed?
3. How should session/run identity, report ordering, expiration and reporter
   authority work across restarts and concurrent sessions for one Actor?
4. Can a persistence table and binary-matched operating guide make today's
   contracts easier to understand without implying stronger guarantees?
5. Does draft-aware input add value beyond current queues and holds? Could Herdr
   be a complementary runtime without becoming a required dependency?

If explored, evaluate concrete workflows: an unread result viewed on another
client, a stale blocked report after restart, simultaneous sessions for one Actor,
a hub outage with local authoring, and an uncertain prompt submission. Observe
whether people identify and resolve the right intervention, while verifying that
viewing never becomes acceptance and existing persistence and delivery contracts
remain intact. No such comparative workflow trial was run for this record.
