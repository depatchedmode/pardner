# Pardner thread model: threads, kinds, state and outcome

Status: **decided; not implemented.**

This file records decisions the owner made on 2026-11-23, after comparing Pardner
with Vercel Board ([assessment](PARDNER-VERCEL-BOARD-LESSONS.md)). Nothing here is
built. [README](../README.md#current-implementation) and the
[acceptance contract](PARDNER-ACCEPTANCE.md) still describe what Pardner does, and
they stay authoritative until this work lands.

A line marked **Proposed** is a detail put forward in that discussion that the
owner has not confirmed. Everything else is decided.

## Why

- **A conversation has no home before work exists.** A comment and a mention
  always belong to a task. A question to a colleague's agent, asked before anyone
  knows what the work is, has nowhere to go.
- **Veins and goals cannot hold discussion.** Their value is the verdict and the
  evidence behind it, and that evidence has no place to be written.
- **A status mixes two things.** `backlog`, `up-next`, `in-progress` and `review`
  say where work is. `completed`, `dead-end` and `abandoned` say how it ended.
- **Pardner stays work first.** Board makes the conversation primary and adds
  state to it. Pardner keeps the work primary and gives conversation a place at
  every level of it.

**What does not change**

- Every member machine holds a signed copy of the record.
- Edits to different fields merge. Competing edits to one field keep their authors
  until someone chooses.
- Work continues and saves while offline.
- A mention is acknowledged only after it is stored on disk.
- Only member machines can connect.
- A vein ends with a verdict and pursues one goal. A task can serve several veins.

## 1. One item: the thread

Everything in a project is a **thread**. A thread has a title, a description and
one flat list of comments. Threads never nest: a comment cannot start a thread or
have replies of its own.

A thread has a **kind**, which is one of four:

| Kind | What it is | Its vocabulary |
| --- | --- | --- |
| Plain thread | A question or a conversation | Unsettled or settled |
| Task | A piece of work | Waiting, ready, in progress or blocked, then an outcome |
| Vein | One approach toward a goal | Ready, in progress, then an outcome |
| Goal | The state being pursued | Ready, in progress, then an outcome |

```mermaid
flowchart LR
  p["Plain thread"] -->|about| t1["Task"]
  t1 -->|serves| v["Vein"]
  t2["Task"] -->|needs| t1
  t2 -->|serves| v
  v -->|pursues| g["Goal"]
```

**Kind is fixed when the thread is created and never changes.**

- A plain thread is never converted. A task, a vein or a goal is *created from* it
  and linked back, and the conversation stays a conversation. One conversation can
  yield several pieces of work.
- There is no undo for a kind picked by mistake. Cancel the thread and create
  another from the same conversation.
- A task that grows into an approach is not converted either. Create the vein; the
  task serves it.

The reason is that a thread's kind gives meaning to what other people wrote about
it. A member machine cannot be refused a write and cannot see writes still held on
an offline machine, so a kind that changed would change the meaning of records
nobody is able to check.

A mention can point at a thread of any kind.

## 2. Tasks: state is worked out, not stored

A task has no stored status. Its state is the first of these that applies:

1. It has an outcome: **ended**.
2. It has a hold: **blocked**.
3. It needs a task that is not completed: **waiting**.
4. Someone started it: **in progress**.
5. Otherwise: **ready**.

Nothing stores the state, so two replicas cannot hold contradictory ones. Each fact
underneath is a field or a relation that already merges or keeps competing values.

**Starting is explicit.** The Actor that begins writes a start marker. Starting is
one operation, and it sets the assignee when there is none. Two machines that start
the same task leave two competing markers, shown like any competing edit. Stopping
without finishing clears the marker.

**The assignee says who may start.**

| Assigned to | Who may start it |
| --- | --- |
| A person | That person, or any of their agents |
| One agent | Only that agent |
| Nobody | Anyone |

A start by an Actor outside that group is refused on the machine that tries it and
flagged in Activity when it arrives from another machine. It cannot be refused
across machines.

**A hold blocks a task.** A hold names the Actor it waits on, a kind and a reason.
Review is a kind of hold, and so are a question, an approval and a worker that gave
up. Releasing the hold returns the task to the state underneath it. Holds apply to
tasks only; a vein or a goal shows a hold through its tasks.

**A handoff takes one of two forms**, each a single operation:

- Passing the work on changes the assignee and clears the start marker, so the task
  is ready and assigned to the new Actor.
- Asking for review adds a hold and leaves the marker alone.

**Proposed.** A start marker can go stale when an agent stops without clearing it.
Until #282 settles claims, show the marker beside the starter's presence, and let
any member clear it.

## 3. Outcomes

An outcome is a final judgment about a piece of work. One list serves tasks, veins
and goals:

| Outcome | Meaning | Replaces |
| --- | --- | --- |
| `completed` | Done | Task `completed`, vein `proven`, goal `achieved` |
| `dead-end` | It was tried and the answer is no | Task and vein `dead-end` |
| `abandoned` | We chose to stop | `abandoned` on all three |

No outcome means the thread is open. Clearing an outcome reopens it. A vein's
outcome is its verdict.

**`failed` is not an outcome.** On Board, `failed` means "a worker gave up on it,
with a reason", which describes one try and not the work. Pardner records that as a
hold of kind "gave up" on the person responsible, so it appears with everything
else waiting on someone, and releasing it makes the task ready again. Work that
cannot or should not be done is a `dead-end` or `abandoned`. A worker that crashed
records nothing.

**Veins and goals** are ready when they exist and in progress when something under
them is. A vein keeps its prompt for a verdict, worked out from its tasks as today.

## 4. Plain threads: settled

A plain thread is **unsettled** or **settled**. Settling is cheap and can be undone.
The list of unsettled threads shows where attention is needed, including for people
who were not mentioned.

A task that is waiting for an answer carries the hold. The question itself lives on
a plain thread about that task. When the answer arrives, the thread is settled and
the hold released.

**Proposed.** A new comment un-settles a thread. The settle marker records the last
comment it covers, so a thread with anything newer reads as unsettled, and a comment
written on an offline machine brings the thread back when it syncs.

## 5. Fields, relations and labels

Three words describe what is recorded on a thread. They share one mechanism
underneath: one signed, mergeable record per value.

| | Examples | What is checked on read |
| --- | --- | --- |
| **Field** | Assignee, start marker, hold, outcome | The value is one the field allows |
| **Relation** (`rel`) | Serves, pursues, needs, about | The target exists and is the right kind |
| **Label** | `area=sync`, `risk=high` | Nothing |

Reading is uniform: one filter and one `wait` work across all three. Writing is
not: each field and relation is written by the command that knows its rules, and
only labels are written freely. "Link" keeps its meaning of a pointer outside the
project, such as a GitHub issue or a commit.

**Relations are named by their verb and direction.**

| Relation | From | To | Notes |
| --- | --- | --- | --- |
| serves | Task | Vein | Many. One record per relation, keyed by both threads. The vein owns it |
| pursues | Vein | Goal | One. Competing moves are kept until someone chooses, as today |
| needs | Task | Task | Many. See section 6 |
| about | Plain thread | Any thread | Changes no state |

The vein owns its relations to tasks: adding or removing a task is a change to the
vein, it appears in the vein's history, and it is the vein's subscribers who are
woken. Creating a task in a vein remains one operation.

Because kind is fixed and `serves` and `pursues` each point one way, those two
relations cannot form a cycle.

Labels replace task tags and gain a key.

## 6. Prerequisites

A task can need another task.

**Proposed rules.**

1. Only a task can need another task.
2. Only `completed` satisfies a prerequisite. If machines recorded competing
   outcomes, it counts only when every one of them is `completed`.
3. A task whose prerequisite ended as `dead-end` or `abandoned` says so, and does
   not read as plainly waiting.
4. Creating a cycle is refused on the machine that tries it. A cycle that forms by
   merging is flagged, and each task in it reads as waiting on a cycle.

## 7. Waking an agent

Decided order of work:

1. `wait`, a command that blocks until a mention, a reply or a matching change, and
   is answered by the local replica.
2. A reminder: a comment that mentions an Actor at a set time.
3. A worker command that runs any agent or script on the next ready task, after
   #282.
4. A one-way notice to a person, and GitHub state arriving as labels, each after a
   design of its own.

## 8. Decided against, or deferred

- **Channels** are deferred. Nothing above needs them, and one could be added later
  as a label on a thread.
- **A changeable kind, a time limit on changing it, and an undo command** are
  decided against. See section 1.
- **A stored status** and **`failed` as an outcome** are decided against. See
  sections 2 and 3.

## 9. Beside Board's statuses

| Board | Pardner |
| --- | --- |
| `waiting` | Waiting |
| `ready` | Ready |
| `claimed` | In progress |
| `blocked` | Blocked |
| `completed` | `completed` |
| `failed` | A hold of kind "gave up" |
| `canceled` | `abandoned` |
| (none) | `dead-end` |

Board stores one status and is the only writer of it. Pardner stores the outcome
and the facts beneath the state, and works the state out when read.

## 10. Open questions

- **Claims on work, and whether a worker's run is its own record:** #282. Until it
  is settled, a run is recorded on the task.
- **What stays in the Automerge board:** #283.
- **What task branches are for** under this model.
- **Who may record which outcome** before permissions by kind exist.
- **How label keys that drift apart are flagged.**
