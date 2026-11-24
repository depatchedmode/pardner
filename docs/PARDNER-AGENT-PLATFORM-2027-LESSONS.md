# What Pardner can learn from "Agent platform 2027"

"Agent platform 2027" is an essay posted on X by
[@john_ssuh](https://x.com/john_ssuh/status/2124336124172935336). It predicts the
shape of a hosted agent platform: agents run as isolated actors, work across many
sandboxes and people's own computers, share a cloud filesystem with access
control, talk to people through conversations instead of raw sessions, ask for
decisions through an inbox, define their own listeners and workflows, and build
the interfaces people use as apps.

Most of that is a runtime, which Pardner deliberately is not. The README sends
anyone who needs to launch and supervise agents elsewhere. The overlap is in the
parts about how people and agents talk: conversations, the inbox, provenance of a
turn and views built over shared data. Two points are new to Pardner's lessons
records: what happens to machine identity when agents run in cloned sandboxes,
and recording on whose word an agent acted.

This is a research record, not a feature plan. All candidates below are
unscheduled. The [current implementation](../README.md#current-implementation)
and [acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for
Pardner's implemented guarantees, and the
[thread model](PARDNER-THREAD-MODEL.md) records the decided, unbuilt direction.

## Scope and sources

x.com refused an automated read (HTTP 402). The source is four screenshots of
the essay supplied by the owner on 2026-11-22, which appear to cover the whole
text. The post's date, any replies and any thread beyond the essay were not
seen. The essay's "Relevant" lines name products (Cloudflare Durable Objects,
Rivet, Vercel Eve, Archil, JuiceFS, Claude Code Monitor and others) that were
not looked up.

Pardner sources are the README, [product vision](../PRODUCT.md),
[thread model](PARDNER-THREAD-MODEL.md), [client recovery](PARDNER-CLIENT-RECOVERY.md),
[bridge](PARDNER-BRIDGE.md) and [control pane](PARDNER-CONTROL-PANE.md)
documents, the earlier [Vercel Board](PARDNER-VERCEL-BOARD-LESSONS.md) record,
and short searches of `lib/` and `ui-prototype/src/` on 2026-11-24 at commit
`36fb2cc8`. Statements about the code below come from those searches, not from
a full reading.

The essay is opinion and prediction. It describes no product that can be run, so
nothing was installed or observed.

## Where the essay and Pardner meet

| Essay section | The essay's claim | Pardner today, or as decided |
| --- | --- | --- |
| Agents as actors | Separate an agent's definition from its instances and sessions; isolate each harness's runtime | An Actor belongs to a person and a harness; sessions and devices sit under it. Running agents is the harness's job |
| Environments and computers | N agents on M computers, mostly cloned checkpointed sandboxes, plus people's own machines | Every member machine is enrolled and signs its changes. "Bring what you have" covers machines |
| RBAC-ed filesystem | A shared cloud POSIX filesystem with access control, including permission by who started the turn | Flat access within a project, by design. A mention records who sent it |
| Session and conversation | People read a conversation; agents post to it with a tool call; sessions are for debugging | Agents write comments through the CLI. Plain threads give conversation a home before work exists, but work stays primary |
| Inbox | A focused list of approvals and questions | Decided, not built: holds, unsettled plain threads, a one-way notice |
| Listeners and monitors | Agents define their own event sources and triggers | `pardner wait` blocks on the local replica (planned as #285; added in #303). Reminders and GitHub state are planned |
| Workflows | Durable, code-defined workflows mixing agent and deterministic steps | Prerequisites between tasks are decided (#295). No workflow engine |
| Apps | Every interface is an app in the user's filesystem that they can fork | "We build the views we need in the tools we use"; the UI SDK is aspirational |

## Lessons worth keeping

### 1. Cloned sandboxes make duplicate machine keys routine

The essay expects most agent computers to be "clones of checkpointed sandboxes
across a variety of providers", with examples such as one agent starting five
sandboxes or 1,000 agents on 100 VMs.

Pardner's identity is per machine. [Client recovery](PARDNER-CLIENT-RECOVERY.md)
says only one active copy of a restored replica identity may run: "Running both
copies duplicates the machine key. The hub reports two live sync sessions for
one machine in its project status … but does not refuse either; the remedy is
`machine.remove` and a fresh client directory paired as a new machine."

What to keep in mind:

- That text treats a duplicate as a restore mistake. If a sandbox is checkpointed
  after its client enrolled, every clone of it is a duplicate, and nothing
  refuses them. This is an inference from the recovery text, not something
  tested.
- Enrolling each sandbox as a new member machine avoids the duplicate, but
  enrollment needs the project's hub, and every membership record stays in the
  signed history. A project used by short-lived sandboxes would collect members
  that existed for minutes.
- Two shapes would fit. A sandbox could enroll after it starts, never before a
  checkpoint. Or a member machine could hand its sandboxes short-lived
  credentials it signs for, so the sandbox acts under its parent's membership.
  The second connects to the `did:key` identity work (#254) and outside
  identities (#257).
- Whatever the shape, a clone of an enrolled client should be refused or
  flagged loudly, not only shown as a second session in status.

### 2. Record on whose word an agent acted

The essay lists, as one access-control choice, "permission granted based on who
initiated the particular turn". Pardner has no per-person permissions, and this
record does not suggest adding them. The provenance underneath is the useful
part.

Pardner already knows who starts a turn. A mention carries `fromActorId`, and the
bridge delivers it only if the mapping lists that sender and task
(`lib/agent-bridge.js`). The [Vercel Board](PARDNER-VERCEL-BOARD-LESSONS.md)
record's lesson 6, "text on the board is information, never permission", makes
the same point from the other side.

What to keep in mind:

- The changes an agent saves during that turn carry its own Actor and its
  machine's signature. A search of `lib/` found no field linking them to the
  mention or comment that started the turn.
- Carrying the delivery's mention ID onto the operations saved while handling it
  would let a reader ask "on whose word?" without trusting the agent's summary.
  Any later rule about who may ask an agent for what would need this first.
- It is a claim made by the agent's machine, not proof. A machine's word is
  already taken for which of its Actors acted, and this would be the same kind of
  claim.

### 3. Conversation first is the opposite bet to the one decided

The essay says the thing people use should be a conversation "at the same level
of abstraction as a Slack channel", and that content for people should be
"posted through a tool call rather than by directly exposing the assistant
messages". Agent sessions should be like reading the codebase: for inspection,
not the main interface.

The second half matches Pardner: agents write comments through the CLI, and the
harness owns the session. The first half is the bet the
[thread model](PARDNER-THREAD-MODEL.md) decided against: "Board makes the
conversation primary and adds state to it. Pardner keeps the work primary and
gives conversation a place at every level of it." Channels are deferred.

What to keep in mind:

- The essay is a reason to watch whether people use plain threads as
  free-standing conversations once they exist (#290), not a reason to reopen the
  decision now. If they do, the deferred channel can arrive as a label on a
  thread, as the thread model already allows.
- The tool-call rule implies one Pardner should write down: the record holds what
  an agent chose to say, and links to session transcripts rather than copying
  them. That keeps the signed, replicated history small and keeps private session
  content off other machines.

### 4. Listeners write into Pardner; Pardner should not run them

The essay wants agents to build listeners "on the fly", over email, WebSockets,
Kafka or change-data capture, and translate events "deterministically or
agentically" into signals. It calls hourly cron and bespoke webhooks the current
state of the industry.

Pardner has the receiving end. `pardner wait` blocks until a mention, a reply or
a matching change, and the thread model plans reminders (#291) and GitHub state
as labels (#296).

What to keep in mind:

- Pardner should be where signals land and where agents wait, not a host for
  integrations.
- A deterministic listener that writes into a project is neither a person nor an
  agent, and "Actor" currently means one of those two. #296 will meet this first:
  which Actor, on which machine, signs a GitHub state label?

### 5. A default view should be one anyone can fork

The essay wants interfaces to be apps in the user's own space, with defaults
shipped like an operating system's applications and changed by agents on request.
This matches "Pardner runs headless" and the planned UI SDK.

The board's document reads and writes use the same `/automerge/*` paths that the
CLI and bridge use (`lib/sync-protocol.js`, `ui-prototype/src/Pardner.jsx`).
Control and the cloud adapter add their own routes. No full audit was made.

What to keep in mind:

- Keeping the board a client of the same API any other view would use is what
  makes a forked or agent-written view possible. A board-only route would quietly
  break that.
- The essay's list of view containers (panes, canvases, chat in a sidebar) is for
  whoever builds views. Pardner needs a stable API, not a choice among them.

### 6. The essay's warning about session wrappers applies to the control pane

The essay predicts that tools wrapping coding-agent sessions, naming T3, "will
face the same kind of dilemma Cursor faced", and that most will not survive.

Pardner's core does not wrap sessions. The [control pane](PARDNER-CONTROL-PANE.md)
does: its qualified dispatch path maps Pardner tasks to T3 threads. The
[Cursor Cloud adapter](PARDNER-CURSOR-CLOUD.md) is a second path, with live
dispatch off by default.

What to keep in mind:

- The worker command decided in the thread model (run any command on the next
  ready task, after #282) needs no harness adapter. If the essay is right, that is
  the path that survives a change of harness.

## Where the essay's assumptions would be wrong for Pardner

- **One hosted platform carries every data flow.** The essay takes this for
  granted and never considers local operation. Pardner's record lives on member
  machines, and the hub is a role a member takes on, not an authority.
- **A shared cloud filesystem holding `.env` files.** Pardner keeps credentials
  in private local files and treats synchronization as distinct from backup. A
  replicated store holding secrets would put them on every member machine.
- **Access control as the main design question.** Every member of a Pardner
  project can change anything in it, as in a shared Git repository. Provenance
  (lesson 2) comes before permission.
- **An actor runtime and sandbox provisioning.** These are the harness's or the
  cloud's job. Pardner records which machine did what.
- **Durable workflows.** "Plans are guesses" and dead ends are results. Ordering
  between tasks (#295) is as far as Pardner goes.

## Candidates if this is revisited

None of these is scheduled.

1. Refuse or loudly flag a second live copy of one machine identity, and say in
   the client guide how to use Pardner from cloned sandboxes.
2. A way for a member machine to give short-lived sandboxes credentials under its
   own membership, as part of the `did:key` and outside-identity work.
3. Record the mention or comment that started an agent's turn on the operations
   saved during it.
4. A written rule that the record holds what agents say and links to session
   transcripts instead of copying them.
5. An Actor kind, or another stated answer, for deterministic listeners that
   write into a project.
6. A check that the board uses no route that another view could not, ahead of
   the UI SDK.

## Questions if this is revisited

- Do people use plain threads as conversations apart from any task, once #290
  lands? That is the evidence that would reopen channels.
- Where do agents in practice run: long-lived machines, or cloned sandboxes? The
  answer decides whether candidate 1 is a footnote or a blocker.
- Should a sandbox's changes be signed as its parent machine, as itself, or as
  both?
- Is "on whose word" enough without permissions, or does it only become useful
  once some rule reads it?
