# What Pardner can learn from T3 Code

[T3 Code](https://t3code.com) (as used in Pardner’s development path) is a
**local execution and approval surface**: it owns threads, runs, queues, native
approvals, and harness/provider sessions on a machine. Pardner’s own contract is
explicit: **Pardner owns intent, tasks and review; T3 owns local execution and
its native approval flow**
([T3 qualification](PARDNER-T3-QUALIFICATION.md),
[README](../README.md#current-implementation)).

This document is not a vendor feature tour. It records product lessons from
**layering** with T3 — drawn from Pardner’s qualification, control pane, bridge,
and onboarding retrospective — so a later decision can improve the boundary
without absorbing T3 into Pardner. It describes product direction, not
implemented guarantees; the README’s current-implementation section and the
[acceptance contract](PARDNER-ACCEPTANCE.md)
remain authoritative for what Pardner guarantees today. Live dispatch with a
real provider is not yet acceptance-qualified.

This is a research record only. No feature work is planned from it; the
candidates at the end are recorded so a later decision can start from them.

T3 is a third-party product with its own licence and release cadence. Ideas and
boundary conventions may be borrowed; T3’s code and protocols are not to be
copied into Pardner as a substitute runtime. Observations below come from
Pardner docs read on 2026-11-15: `docs/PARDNER-T3-QUALIFICATION.md` (0.1.5 /
0.1.6 evidence), `docs/PARDNER-CONTROL-PANE.md`, `docs/PARDNER-BRIDGE.md`,
`docs/PARDNER-ONBOARDING-RETROSPECTIVE.md`, and the README Control / bridge
paragraphs. Where behaviour is only observed under a scripted provider, that
limit is kept.

## Where the two layers overlap

| Concern | T3 Code | Pardner |
| --- | --- | --- |
| Source of truth for coordination | Thread/run state inside T3’s local server | Automerge workspace: tasks, veins, goals, comments, Actors |
| Source of truth for execution | Runs, queue items, approval UI, provider turns | Control ledger (`control.sqlite`): intent, request IDs, observed runs, holds, verdicts — **not** synchronized |
| Unit of work | A thread / run (MCP tools: launch, send, read, interrupt, queue) | A task inside veins toward goals; Control maps one top-level T3 thread ↔ one agent Actor |
| Approvals | Native T3 UI for `approval_request`; MCP cannot approve (qualified) | Shows **Waiting…** and **Decide in T3**; human acceptance is a separate Pardner verdict |
| Wake / dispatch | `t3_thread_send` modes (`queue` / `steer` / …); CLI lacks request IDs | Intent saved in Pardner first; one submission in T3 at a time; bridge is a separate Codex path |
| Deduplication | `clientRequestId` durable across T3 restart, **scoped to MCP client/credential** | Bind IDs to the paired credential; re-pair refuses blind retry |
| Offline / crash | Server restart forgets MCP sessions; may cancel/resume runs unpredictably | Intent stays queued; reconciliation looks for exact request; enrolled workspace work continues per local-first rules |
| Identity | Pairing code → MCP OAuth token; thread/project/run IDs from T3 | Actors + routes + allowlisted tasks/senders; loopback for admin pairing |

Pardner’s differentiators remain offline reopen, merge semantics, and delivery
leases. T3’s strength is a real local harness with native approval UX. The
product lesson is to **keep that split sharp**.

## Lessons worth keeping

### 1. Name the ownership split in one sentence — and never blur it in UI copy

Qualification opens with the contract: Pardner owns intent, tasks and review;
T3 owns local execution and native approval
([PARDNER-T3-QUALIFICATION.md](PARDNER-T3-QUALIFICATION.md)).
The control pane repeats it: GitHub owns milestone/issue outcomes; Pardner owns
tasks, dispatch intent, execution context and review; T3 executes
([PARDNER-CONTROL-PANE.md](PARDNER-CONTROL-PANE.md)).

What to keep in mind:

- User-facing strings should say “decide in T3” for sandbox/approval policy and
  “accept in Pardner” for product acceptance — never one button that implies
  both.
- Absorbing T3’s approval UI into Pardner would fight the qualified contract
  (`respond` over MCP is `invalid_request`; approvals are UI-only).
- New adapters (Cloud, other harnesses) should reuse the same sentence with the
  peer’s name substituted.

### 2. Persist intent before submission; hold work in Pardner, not in the peer’s queue

The control pane saves follow-ups before sending, and the contract keeps only
one submission in T3 at a time. Qualification forbids `stop: true` on interrupt
because it can race into the next run; Pardner holds queued work locally instead
([qualification](PARDNER-T3-QUALIFICATION.md),
[control pane](PARDNER-CONTROL-PANE.md)).

What to keep in mind:

- “Queued in Pardner” vs “accepted by T3” is a durability ladder users must see.
- Peer queues are hostile places for multi-controller correctness; treat them as
  transient, not as the backlog UI.
- The same pattern applies to the Codex bridge: durable inbox first, then wake
  ([PARDNER-BRIDGE.md](PARDNER-BRIDGE.md)).

### 3. Execution completion ≠ independent check ≠ human acceptance

Control records three separate verdicts: how T3 ended the run, a checker Actor
other than the runner, and a human Actor’s acceptance. None implies another
([control pane](PARDNER-CONTROL-PANE.md)).
Contract states map T3 outcomes carefully: `terminal` is not artifact proof;
`blocked` is derived from a `waiting` item on **that** run, not from
`pendingRequestCount` alone
([qualification](PARDNER-T3-QUALIFICATION.md)).

What to keep in mind:

- Product language should keep “T3 said completed,” “checker accepted,” and
  “human accepted” as three columns forever.
- Do not collapse harness `blocked` into task status or delivery-lease state.
- When designing a “needs a person” inbox, Control holds and acceptance rows are
  first-class sources — still read-only projections of existing records.

### 4. Qualify the peer; do not invent its behaviour

The qualification matrix pins authenticate, identify, permissions, send modes,
dedupe, interrupt, approvals, and crash behaviour against T3 0.1.5 / 0.1.6 with
published JSON evidence. Unqualified tools and child threads stay out of the
contract. Unqualified T3 versions hold every mapped thread until explicit
`acceptVersion`
([qualification](PARDNER-T3-QUALIFICATION.md),
[control pane](PARDNER-CONTROL-PANE.md)).

What to keep in mind:

- Layering products means **version pins and requalification**, not hope.
- Scripted-provider limits are part of the lesson: they qualify T3’s
  orchestration surface, not model or power-loss behaviour — do not overclaim
  in product docs.
- Foreign-run / restart-resume holds are features: another dispatcher (person in
  T3, second ledger, T3 resume) must stop silent dual control.

### 5. Credentials and dedupe scope are part of the product boundary

T3 tokens report ~30-day life, survive server restart, and scope
`clientRequestId` deduplication to the MCP client. Re-pairing changes that
scope; blind retry after re-pair is refused
([qualification](PARDNER-T3-QUALIFICATION.md)).
Control stores one credential privately (`t3-credential.json`, mode 0600), never
returns it on the API, and stops calling T3 when status is not usable
([control pane](PARDNER-CONTROL-PANE.md)).

What to keep in mind:

- Pairing, expiry, and “abandon vs reconcile” are user-visible lifecycle
  events, not just ops chores.
- One controller per ledger per thread — and a copied ledger on another replica
  is refused (`WORKSPACE_MISMATCH`) — preserves the layer split across machines.
- Never sync the T3 credential through Automerge; control records stay
  host-local by design.

### 6. Map existing peer threads; do not become the peer’s session manager

Control maps **existing** top-level `approval-required` T3 threads to agent
Actors with explicit task and sender allowlists. The contract does not manage
launch as the primary path; CLI without request IDs is unsuitable for dispatch
([control pane](PARDNER-CONTROL-PANE.md),
[qualification](PARDNER-T3-QUALIFICATION.md)).
The bridge similarly resumes dedicated Codex sessions it owns, and does not
attach to arbitrary Desktop chats
([PARDNER-BRIDGE.md](PARDNER-BRIDGE.md)).

What to keep in mind:

- “Attach with authorization” beats “Pardner spawns every runtime.”
- Identity fields come from what the peer reported (thread, project, link,
  runtime mode) — never invent worktrees or branches when absent.
- Sole-dispatcher declarations (`sessionOwner: bridge`, one Control ledger)
  are product safety, not optional polish.

### 7. Keep the coordination record in Pardner — even when execution lives in T3

The onboarding retrospective’s main coordination lesson: Pardner was used for
assignments and durable reports, but important answers, scope changes and
integration decisions stayed in T3 and coordinator context. Recording reports is
not the same as coordinating from the record. Follow-ups emphasize operating
skill and rehearsal before assuming a new inbox feature
([PARDNER-ONBOARDING-RETROSPECTIVE.md](PARDNER-ONBOARDING-RETROSPECTIVE.md)).
M7 improved when the coordinator recorded handoffs in Pardner and used T3 only
to point workers at that record.

What to keep in mind:

- T3 threads are execution scratchpads; Pardner tasks are the shared ledger.
- Product should make “paste the Pardner task / revision in the T3 turn” the
  easy path — skill and prompts before schema churn.
- Do not “fix” the gap by mirroring T3 transcripts into Automerge by default
  (secrets, noise, wrong authority).

### 8. Passive contracts need an active driver — and honest stale labels

`T3Execution` is passive: the caller must poll `observe`, `reconcile`, and
`pump`. Control does that on an interval, labels stale reads, and measures
`observedAt` as reply arrival time — which can look fresher than the peer’s
truth
([qualification](PARDNER-T3-QUALIFICATION.md),
[control pane](PARDNER-CONTROL-PANE.md)).

What to keep in mind:

- Layered UIs must show **fresh vs stale** peer state; cached T3 views must not
  accept writes as live.
- Outage tables (local service / T3 / GitHub / hub) are the right product
  pattern for every required dependency.
- Safe `unknown` handling is safety, not automatic recovery — keep that
  wording in human-facing Control copy.

## Where absorbing T3 would be wrong for Pardner

- **Making Pardner a T3 clone.** Threads, provider sandboxes and approval
  widgets are T3’s job. Rebuilding them inside Pardner duplicates a moving
  target and breaks the qualified “Decide in T3” path.
- **Synchronizing the control ledger through Automerge.** Intent, credentials
  and run identity are host-local so two replicas cannot become dual
  controllers for the same thread. Syncing them would recreate the foreign-run
  problem the contract exists to detect.
- **Using T3 (or bridge) queues as the team backlog.** Team planning belongs in
  tasks/veins; peer queues are execution buffers.
- **Treating T3 restart resume as Pardner delivery.** Qualification shows
  resume may invent runs Pardner did not request. That is a hold/reconcile
  event, not a successful wake.
- **Approving sandbox policy inside Pardner “for convenience.”** Native
  approval is the point of `approval-required` mode; bypassing it for UX would
  void the trust story.
- **Letting execution-thread chat replace the Automerge record.** The
  retrospective already showed that failure mode; product direction is the
  opposite.

## Candidates if this is revisited

None of these is scheduled. The “needs a person” projection also appears in the
[Kortix](PARDNER-KORTIX-LESSONS.md), [Herdr](PARDNER-HERDR-LESSONS.md), and
[Linear](PARDNER-LINEAR-LESSONS.md) assessments.

1. Stronger operating guidance (skill / prompts) so T3 turns always cite the
   current Pardner task, revision and open questions — rehearse before new UI.
2. A read-only “needs a person” row type for Control holds, approval blocks and
   missing human acceptance, projected beside mention/conflict items.
3. Clearer durability ladder copy: queued in Pardner → submitted → running /
   blocked in T3 → terminal → checker → human acceptance.
4. Same layering template for additional harnesses (Cloud adapter already
   separated): qualify, map existing sessions, hold on foreign runs, never
   dual-write bodies into Automerge.
5. Explicit backup/restore checklist UX for `control.sqlite` + credential
   files, distinct from workspace sync (already documented; still easy to
   confuse).
6. Keep documenting T3 as a complementary local execution plane — not as
   Pardner’s coordination store and not as a component to absorb.
