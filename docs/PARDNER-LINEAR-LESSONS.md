# What Pardner can learn from Linear

[Linear](https://linear.app) is a hosted SaaS product for tracking software work.
Its core model is the **issue** inside a **team** workflow, with **projects**,
**initiatives**, time-boxed **cycles**, a personal **Inbox**, team **Triage**,
and a public GraphQL API plus webhooks. It is human-centric issue tracking with
growing agent assignment and MCP surfaces, not a local-first multi-replica
document ledger. It is much larger in adoption than Pardner.

This document records what Linear does well, where Pardner already goes further,
and which ideas are worth keeping in mind. It describes product direction, not
implemented behaviour; the [README](../README.md#current-implementation)
and the [acceptance contract](PARDNER-ACCEPTANCE.md)
remain authoritative for what Pardner guarantees today.

This is a research record only. No feature work is planned from it; the
candidates at the end are recorded so a later decision can start from them.

Linear is a proprietary hosted product. Ideas and interface conventions may be
borrowed; there is no open Linear codebase to copy into Pardner, and nothing here
authorizes dual-writing task bodies into Linear as a second source of truth.

Observations below come from Linear’s public docs (conceptual model, Inbox,
Triage, Cycles, API/webhooks, MCP) and public agent-integration pages, read on
2026-11-15. Marketing claims were checked against those pages where this
document relies on them. Judgments labeled **coordinator/agent judgment** are
Project product framing, not Linear documentation.

## Where the two projects overlap

| Concern | Linear | Pardner |
| --- | --- | --- |
| Source of truth | Hosted workspace cloud (`linear.app/<workspace>`); clients observe API mutations in real time | An Automerge replica owned by each local service |
| Unit of work | An issue (team workflow, optional project/cycle, labels, assignee) | A task, never larger than a branch, inside veins toward goals |
| Planning rhythm | Cycles: repeating 1–8 week team periods with rollover and graphs | Veins and deliberate goal closure; no sprint calendar as product core |
| Who needs a person | Inbox (subscriptions, Priority tab, snooze/reminders); team Triage for intake | Mentions, delivery leases, Control-pane holds, conflict alternatives, veins ready for verdict — spread across views |
| Intake | Triage inbox for cross-team / integration-created issues; accept / decline / duplicate / snooze | Mentions and authorized bridge wakes; no dedicated triage queue yet |
| Identity / trust | Workspace users, team membership, OAuth/API keys; agents assignable as teammates via integrations | Actors (human and agent) separate from replicas; shared-secret admission with flat permissions today |
| Agent execution | Assign/mention cloud or partner agents; MCP at `mcp.linear.app`; status posts back into issues | Opt-in local bridge and Control pane; durable delivery before ack; T3 owns native approvals when mapped |
| Offline | Requires Linear’s hosted service for the product surface | The core differentiator: enrolled replicas reopen and save locally; hub for enrollment and new leases |
| External trackers | First-party integrations (GitHub, support tools, Slack, agents) | Task ↔ GitHub issue **links only**; Pardner never mutates GitHub (README / control pane) |

**Coordinator/agent judgment:** Linear is a human-centric hosted tracker; Pardner
is a local-first multi-Actor ledger. Pardner’s differentiators are offline
reopen, Automerge merge semantics, and the delivery/lease contract. Linear’s
strengths are triage UX, planning cadence, and zero-friction share inside a
hosted org.

## Lessons worth keeping

### 1. Keep Linear as a peer tracker, not a twin ledger

Linear’s conceptual model is explicit: issues are the day-to-day unit, teams own
workflows, projects and initiatives nest outcomes, cycles plan near-term work,
and views re-slice the same data
([conceptual model](https://linear.app/docs/conceptual-model)). That is a strong
hosted tracker. It is not a CRDT multi-Actor workspace.

Pardner already treats GitHub as reference-only: link an existing issue, store
the reference, never move status either way
([control pane](PARDNER-CONTROL-PANE.md),
[README](../README.md#current-implementation)).

**Coordinator/agent judgment:** a thin bridge is OK (wake signals, triage
mirrors, identifiers). Avoid dual-write of task/issue **bodies**. Bodies that
diverge silently destroy the “one ledger” story.

What to keep in mind:

- Mirror identifiers, assignees/wake cues, and coarse state only when a bridge
  exists; keep narrative and conflict alternatives in Pardner.
- Prefer “link out” (as with GitHub today) over “sync both ways” unless
  conflict rules are designed first.
- Label any Linear bridge the way control qualifies T3: versioned, opt-in, and
  honest about what is not synchronized.

### 2. Steal triage and inbox craft, not the hosted inbox as source of truth

Linear’s Inbox is a personal notification center with Priority filtering,
snooze, reminders, keyboard triage, and a hard cap on open notifications
([Inbox](https://linear.app/docs/inbox)). Triage is a **team** intake inbox for
issues from other teams or integrations, with accept / decline / duplicate /
snooze and optional responsibility rotation
([Triage](https://linear.app/docs/triage)).

Pardner has the same *kinds* of “needs a person” work (mentions, holds,
alternatives, vein verdicts, Control acceptance) without one attention surface —
the same gap noted in the [Kortix](PARDNER-KORTIX-LESSONS.md) and
[Herdr](PARDNER-HERDR-LESSONS.md) lessons.

What to keep in mind:

- A read-only “needs a person” view over existing Pardner records is the
  portable lesson; Linear proves the UX bar (Priority vs everything else,
  snooze without losing the item, keyboard accept/decline).
- Triage Responsibility (who is on intake) is a useful *human* role concept
  for multi-Actor shops; do not confuse it with delivery leases or execution
  locks.
- Do not invent a second notification store that can disagree with Automerge
  history; adapters should only project existing records.

### 3. Cycles teach cadence; veins teach closure

Cycles are automated repeating periods with duration, start day, cooldowns,
rollover rules, and progress graphs
([Cycles](https://linear.app/docs/use-cycles)). They optimize for team rhythm,
not offline merge.

Pardner’s veins and goals already encode pursuit and deliberate closure without
calendar automation.

What to keep in mind:

- Optional cycle-like *views* (what we meant to finish this week) can sit on
  top of tasks without becoming the write model.
- Automatic rollover of unfinished work is a Linear convenience; in a
  multi-replica ledger it needs explicit conflict rules, or it becomes silent
  mutation of planning state.
- Keep “ready for a vein verdict” checkable from task endings / evidence, not
  from the clock alone.

### 4. Agent assignment in Linear is interop pressure — keep Pardner’s lease edge

Linear publicly assigns issues to coding agents (Cursor, Codex, Copilot, and
many others), posts progress back into the issue, and exposes a hosted MCP
server for reading and mutating Linear objects
([Agents](https://linear.app/integrations/agents),
[MCP](https://linear.app/docs/mcp)). That raises the bar for “native interop.”

Pardner’s edge is different: durable receipt before delivery acknowledgement,
Actor ≠ replica, opt-in bridge wakes with allowlists, and Control’s separation
of execution / independent check / human acceptance
([bridge](PARDNER-BRIDGE.md),
[control pane](PARDNER-CONTROL-PANE.md)).

**Coordinator/agent judgment — what “beat Linear” means here (always keep the
local-first / agent-lease edge):**

| Linear-strength to match or exceed | Pardner stance |
| --- | --- |
| Wake | Mentions → durable delivery → authorized harness wake, without model polling |
| Org trust / capabilities | Move beyond flat shared-secret admission toward Actor capabilities (direction, not today’s guarantee) |
| Human triage UX | One attention inbox + keyboardable accept/decline/snooze over existing records |
| Zero-setup share | Invitation / enrollment paths that feel as easy as inviting someone to `linear.app/...` — without making the hub required for accepted work |
| Native interop | MCP/CLI/bridge that speak Pardner’s ledger; do not become a thin client of Linear’s cloud |

What to keep in mind:

- Compete on wake reliability and lease honesty, not on matching Linear’s
  cloud agent marketplace feature-for-feature.
- When agents update status, prefer self-reported, attributed operations into
  Pardner — not scraping Linear comments as truth.
- Hosted MCP for Linear is a peer pattern: if Pardner ever exposes tools, bind
  them to Actor credentials and replica admission, never to “whoever has the
  workspace URL.”

### 5. API and webhooks as thin outbound signals

Linear’s GraphQL API is the same surface its own apps use; webhooks push full
objects on create/update for issues, comments, cycles, and more
([API and webhooks](https://linear.app/docs/api-and-webhooks)). That is a
mature extension model for a hosted system of record.

What to keep in mind:

- For a future Linear *mirror*, prefer webhook- or poll-driven **wake/triage
  cues** into Pardner over streaming full description bodies both ways.
- Rate-limit and idempotency lessons apply to any outbound integration;
  Pardner already insists harness-level idempotency for external side effects.
- Treat Linear’s real-time “all clients observe mutations” as a hosted
  property — do not claim it for companion LAN browsers that depend on the
  host service.

### 6. Keyboard-first human triage is product, not chrome

Linear’s Inbox and Triage docs emphasize shortcuts (`G` then `I`, `J`/`K`,
accept `1` / decline `2` / duplicate `3`, snooze `H`). That is how humans clear
intake at speed.

Pardner’s Control pane already separates verdicts carefully but is loopback-
admin heavy for setup; board attention is still multi-surface.

What to keep in mind:

- When building a “needs a person” view, design the keyboard path first.
- Keep destructive or authority-changing actions distinct from “acknowledge /
  snooze,” matching Control’s hold/release discipline.
- Snooze is a personal attention deferral; it must not look like task
  cancellation or lease expiry.

### 7. Views without mutating the work

Linear states that views re-organize the same underlying work without changing
it ([conceptual model](https://linear.app/docs/conceptual-model)). That
separates presentation from authority.

What to keep in mind:

- Custom filters over tasks/veins/Actors are cheap wins if they stay read
  projections.
- Do not let a “My Linear-like board” become a second write path that bypasses
  Automerge operations and attribution.

## Where Linear’s choices would be wrong for Pardner

- **Hosted cloud as the only system of record.** Linear requires its service
  for the product. Pardner requires the hub only for enrollment and new
  delivery leases; accepted work must continue and save locally. Do not move
  that boundary to “always online like Linear.”
- **Dual-write of issue/task bodies.** **Coordinator/agent judgment:** thin
  wake/triage mirrors are fine; body dual-write creates conflicting ledgers and
  fights Automerge conflict alternatives.
- **Assignee-as-single-human model as the Actor model.** Linear’s default
  mental model is people on a team plus bolt-on agents. Pardner’s Actor
  umbrella (human and agent) and replica separation must stay first-class.
- **Cycles as the coordination store.** Calendar rollover is not a substitute
  for vein verdicts, goal closure, or merge-aware task state.
- **Cloud coding agents as the default execution plane.** Linear’s agent
  marketplace optimizes for zero local setup. Pardner’s value includes local
  execution, native harness approvals (see the
  [T3 assessment](PARDNER-T3-LESSONS.md)), and offline reopen — keep those
  layered, not replaced.
- **MCP that writes the tracker as the agent’s home.** Agents that “live in
  Linear” are Linear’s product bet. Agents that **use** Pardner as the
  coordination record (and optionally link Linear) is Pardner’s.

## Candidates if this is revisited

None of these is scheduled. The attention inbox candidate also appears in the
[Kortix](PARDNER-KORTIX-LESSONS.md) and [Herdr](PARDNER-HERDR-LESSONS.md)
assessments.

1. A read-only “needs a person” inbox over existing Pardner records, with
   Priority-like filtering and snooze that does not mutate task status.
2. A thin Linear bridge: identifiers + wake/triage cues only; **no** body
   dual-write; explicit conflict policy before any status mirror.
3. Keyboard-first triage actions (accept into workflow / decline / mark
   duplicate / defer) mapped onto Pardner’s existing mention and hold
   semantics.
4. Optional cycle-like planning *views* without automatic cross-replica
   rollover mutations.
5. Capability-oriented Actor grants (wake, triage, accept work) as the path to
   match Linear’s org-trust feel while keeping local-first and lease edges.
6. Document Linear as a complementary hosted tracker — like GitHub issue links
   today — not as a substitute coordination plane.
