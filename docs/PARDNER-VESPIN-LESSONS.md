# What Pardner can learn from Vespin

[Vespin](https://vespin.dev/) is an inbox for coding agents, with task management,
agent orchestration, and pull-request review. Its strongest lesson for Pardner
is to organize the experience around what needs an Actor's attention: a question,
a decision, a manual step, or a review, with enough context to act in place.

Pardner's clearest current advantages are persisted local ownership, work across
disconnected replicas, and explicit goals with multiple approaches and verdicts.
Vespin demonstrates a more complete documented experience for asking people to
unblock agents and reviewing their work.

This review follows the [Kanzo review](PARDNER-KANZO-LESSONS.md). It separates
current functionality from proposed follow-ups; the
[current implementation](../README.md#current-implementation) and
[acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for Pardner's
guarantees. None of the suggestions below changes those guarantees.

## Scope and sources

Reviewed on 2026-11-03: Vespin's landing page, changelog through v0.25.1, and
repository documentation on `main`. Pardner's comparison uses documentation
and selected implementation paths at `4a0ec26fc00e16fd39353d8612bfa91c3843aac9`.
Vespin was not installed or exercised, and this was not a full source audit or
a comparative reliability benchmark. A capability absent from the reviewed
material is described as unestablished, not proven absent.

Vespin sources:

- [Landing page](https://vespin.dev/): inbox, decision examples, mobile flow,
  agent collaboration, and provider connections.
- [README](https://github.com/ReviewStage/vespin/blob/main/README.md): task
  management, orchestration, and pull-request review.
- [Changelog](https://vespin.dev/changelog): shipped behavior as reported by
  the project, including ask lifecycle, page comments, subtasks, and chapters.
- [Task behavior](https://github.com/ReviewStage/vespin/blob/main/docs/TASKS.md):
  shared plans, attributed revisions, editing, and conflict handling.
- [Design contract](https://github.com/ReviewStage/vespin/blob/main/docs/DESIGN.md):
  components, copy, accessibility, responsive behavior, and motion verification.
- [Privacy policy](https://github.com/ReviewStage/vespin/blob/main/PRIVACY.md):
  local and hosted storage. It also describes local/host agent execution;
  local execution alone does not establish an offline workspace replica.

These are live links, not an archived Vespin source snapshot.

## Where the two projects overlap

| Concern | Vespin, as documented | Pardner today |
| --- | --- | --- |
| Shared work | Tasks, plans, subtasks, dependencies, and agents | Tasks, comments, goals, veins, and human/agent Actors |
| Attention | Cross-agent inbox with questions, approvals, to-dos, and review | Mentions, explicit read receipts, review filters, and atomic handoffs |
| Ownership | Service stores tasks, plans, and conversations; desktop keeps layout and unsent messages | Local service owns a persisted Automerge replica |
| Concurrent edits | Server merges plan edits and prompts on conflicting lines | Different-field merges and authored same-field alternatives across replicas |
| Agent integration | Built-in orchestration, agent messaging, Claude Code and Codex | Shared CLI/HTTP operation API; opt-in dedicated Codex App Server bridge |
| Review | In-app PR diffs, chapters, and comments on agent-created pages | Task history, commit evidence, comments, and review handoffs |
| Phone use | Web inbox and decisions in place | None currently; planned through the hub over HTTPS |

## Lessons worth adopting

### 1. An Actor's inbox should answer “What needs me?”

Vespin's landing page makes the value of opening the app immediately clear:
agents bring outstanding actions to one inbox. The task and agent remain
available as context around the request.

What to take:

- Give an Actor a view of outstanding requests across tasks and veins.
- Distinguish unread activity from unresolved action. Reading a request must
  not answer it; answering it must not silently complete its task.
- Show who is asking, what they need, and the relevant work before requiring
  navigation into a long conversation.

Pardner already has mentions and handoffs, but those do not by themselves
constitute the structured human-request experience proposed here.

### 2. A request needs explicit state

Vespin demonstrates choices with recommendations and consequences, approvals,
and multi-step manual actions. Its changelog describes answered, withdrawn,
and replaced asks, with answers reaching the asking agent.

What to take:

- Model the request's author, intended respondent, task, question or action,
  and current state explicitly. Comments supply discussion around that record.
- Preserve the answer and its author after the request leaves the active inbox.
- Make withdrawal and replacement visible so an Actor cannot accidentally
  answer an obsolete request as though it were current.
- Keep answer persistence, answer delivery, and resumed execution distinct.
  A successful answer submission does not prove the agent has continued.

This is a proposed domain addition. Concurrent answers, edits versus answers,
withdrawal races, retries, and task deletion need semantics before implementation.
An inbox choice must not bypass the harness's own permission boundary.

### 3. Keep the current understanding attached to the work

Vespin gives a task a shared saved plan. Agents update it as they discover
facts, and the UI exposes attributed revisions and changed sections.

What to take:

- Make the current hypothesis, unresolved assumptions, and evidence easy to
  find when another Actor takes over.
- Use Pardner's existing goals and veins to explain why an approach was tried
  and why it was proven, abandoned, or found to be a dead end.
- Consider a “changed since you last looked” presentation, while preserving
  Pardner's explicit observed-revision receipt semantics.

A shared rich-text plan would be additional work. The immediate opportunity
is to present existing task, vein, goal, comment, and evidence records coherently.

### 4. Put the evidence beside the decision

Vespin documents PR review grouped into chapters and comments anchored to
elements on agent-created pages that reach the responsible agent.

What to take:

- A review handoff should identify what changed, supporting evidence,
  outstanding concerns, and the decision requested.
- Keep the relevant commit or artifact reachable from the request.
- Preserve which revision was reviewed; later changes must not inherit a
  reviewer's decision without an explicit rule.

Pardner already records commit evidence and attributed handoffs. A concise
review package could build on those before attempting a complete diff viewer.

### 5. Make one useful phone journey complete

Vespin's phone example lets someone read a question, compare choices, and
answer without returning to the agent's full conversation.

What to take:

- Make “unblock an Actor from my phone” a concrete companion-device scenario.
- Keep context, answer controls, and saved/delivery state usable on a narrow
  screen, including after a lost response or reconnect.
- Validate the whole journey on the supported browsers and a physical phone.

Pardner currently offers no phone access; this would build on the planned phone
access through the hub over HTTPS. It would not make the phone an offline
replica.

### 6. Make interaction rules concrete and reviewable

Vespin's design contract specifies shared components, keyboard access, zoom
behavior, reduced motion, and measurement of animation. Its copy guidance
keeps instructions and state while removing text that merely repeats controls.

What to take:

- Define consistent wording and behavior for local save, pending sync,
  delivery, conflicts, handoffs, and failed operations.
- Use shared controls and semantic styles so a request behaves consistently
  in a task, an inbox, and a phone browser.
- Preserve drafts, focus, and useful context through failures and navigation.
- Verify keyboard and narrow-screen behavior as part of each complete flow.

## Where Pardner already offers more

### Offline ownership and disconnected collaboration

An enrolled Pardner service can reopen its persisted workspace without the
hub and accept local operations. Different-field edits merge on reconnect;
authored same-field alternatives survive for explicit resolution. Vespin's
documented workspace storage is hosted, and its plan-conflict handling does
not establish equivalent disconnected-replica operation.

The boundary matters: Pardner needs the hub for enrollment and new delivery
leases. Accepted work can continue through a reachable local service. The
browser has no separate Automerge database. See the
[service guide](PARDNER-CLI.md).

### Goals, competing approaches, and meaningful negative outcomes

Pardner explicitly models several veins toward one goal, tasks that contribute
to several veins, and separate task outcomes, vein verdicts, and goal closure.
A completed task does not prove its vein; a proven vein does not automatically
achieve its goal. These are implemented concepts, including CLI operations,
not suggestions from this review.

Vespin documents tasks, subtasks, dependencies, and plans. An equivalent explicit
model of competing approaches and verdicts was not found in the reviewed
material. This is Pardner's clearest product distinction beyond offline work.
See [goals and veins](PARDNER-CLI.md#pursue-goals-through-veins).

### A coordination interface for existing tools

Pardner's CLI and HTTP API expose complete context, attributed operations,
revision-aware edits, and atomic assignment/status/explanation handoffs.
Actor identity is separate from replica identity. Scripts and existing agents
can participate without making Pardner their conversation interface.

This is a useful integration shape, not a claim of broader turnkey support.
The current wake-up bridge supports dedicated bridge-owned Codex App Server
threads; arbitrary Desktop, Claude, and Cursor sessions are not supported
adapters. See the [bridge scope](PARDNER-BRIDGE.md).

### Explicit recovery semantics

Pardner acknowledges local operations after its disk persistence barrier and
distinguishes that from explicit hub persistence acknowledgement. Delivery
acknowledgement means durable receipt. The bridge persists dispatch prompts
and treats lost dispatch responses as uncertain until reconciled.

These are implemented Pardner strengths. This review did not establish Vespin's
equivalent internal guarantees, so it does not prove superior reliability.
Historical qualification is recorded in the [milestone audit](PARDNER-GOAL-AUDIT.md)
and [implementation evidence](PARDNER-EVIDENCE.md); this review reran none of it
and does not extend those results to later candidates. Process-crash evidence
does not establish power-loss durability, and delivery leases do not guarantee
exactly-once external effects.

## What this review does not justify

- Moving workspace authority to a hosted service to imitate Vespin's UX.
- Replacing explicit observed-revision receipts with “opened means read.”
- Treating a persisted answer as delivered, or delivered work as completed.
- Claiming stronger security from Actor attribution: Pardner still uses
  shared-secret admission and flat workspace access, not cryptographically
  authenticated individual Actors.
- Claiming a better inbox, onboarding, integration breadth, or review UI today.
  Vespin documents a broader experience in those areas.
- Calling local replicas a complete backup/export product. Synchronization
  and recoverable backups are separate concerns.

## Suggested follow-ups

1. Specify one request-and-answer workflow: an agent asks on a task, the human
   sees it in “Needs me,” answers on desktop or phone, and the answer reaches
   the requesting agent with attribution retained on the task.
2. Define request lifecycle and conflict behavior before adding controls,
   including concurrent answers, withdrawal, replacement, deletion, and retry.
3. Build the Actor inbox and a compact review package on existing task context,
   handoffs, comments, and evidence, preserving the current operation contract.
4. Exercise disconnect/restart, lost answer responses, duplicate retries, and
   a busy or unavailable requesting agent. Confirm saved, delivered, and acted-on
   states cannot be confused. Include phone-browser and physical-phone checks.
5. Make goals and veins easier to understand at handoff: what outcome is sought,
   which approach is being tried, and what evidence supports its current verdict.

These are proposals, not an implementation plan or completed acceptance work.
The product opportunity is to make Pardner's existing coordination guarantees
visible through a small, complete human decision workflow.
