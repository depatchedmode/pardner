# What Pardner can learn from Kanzo

[Kanzo](https://github.com/emanuele-em/kanzo) is a self-hosted kanban board for
humans and coding agents. It is the closest neighbour to Pardner in the open
source field: one local service per machine, a browser board, a CLI, agents
attached over MCP, LAN sharing, and multi-machine sync. This document records
what it does well, where Pardner already goes further, and which ideas are worth
adopting. It describes product direction, not implemented behaviour; the
[README](../README.md#current-implementation) and the
[acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for what
Pardner guarantees today.

Kanzo is AGPL-3.0. Ideas, interface conventions and measurements may be
borrowed; code may not be copied into Pardner.

Observations below come from Kanzo's README and source at commit `862399f` on
`main`, read on 2026-11-03: roughly 4.7k lines of Rust and 1.5k lines of
browser JavaScript.

## Where the two projects overlap

| Concern | Kanzo | Pardner |
| --- | --- | --- |
| Shape | One local service, browser board, CLI | One local service, browser board, CLI |
| Agent access | MCP over stdio or `/mcp` HTTP in the same process | Local service HTTP, CLI, opt-in Codex bridge; MCP is consumed for T3, not exposed |
| Multi-machine | Live sharing from one host, or turn-taking through a private git repo | Automerge replicas relayed through a hub |
| LAN | `kanzo share on` opens the board; `kanzo join <ip>` proxies a second machine to it | Companion LAN browsers against the host service |
| Identity | Comment author string, no actor model | Actor identity separate from replica identity |
| Conflicts | SQLite file cannot merge; user picks `--keep-local` or `--keep-remote` | Different-field merges; authored same-field alternatives need explicit resolution |
| Delivery | None; agents pull `next_task` | Delivery leases, durable receipt, hub ledger |

Pardner's differentiators are the sync and delivery columns. Nothing in Kanzo
challenges them, and nothing below suggests weakening them.

## Lessons worth adopting

### 1. A tiny, prose-first MCP surface

Kanzo exposes nine tools: `list_projects`, `create_project`, `link_repo`,
`list_tasks`, `get_task`, `create_task`, `update_task`, `add_comment`,
`next_task`, plus `delete_task`. Every reply is plain text, not JSON. A task
line is `api#12 [doing] Title {tags} (2 comments)`; a task detail is a handful
of lines plus comments. The README claims the tool list costs about 900 tokens
once per session and each reply costs 10 to 60 tokens.

The server instructions are two sentences that tell the agent how to behave
without being asked: move a task to `doing` when starting, comment on what was
done, move to `review` when finished or stuck, leave `done` and human tasks
alone.

What to take:

- Pardner's agent-facing API should have an MCP server with a comparably small
  tool list and prose replies. Operation IDs, revision hashes and Actor IDs can
  stay in the text where an agent needs to echo them back, but the default
  reply should be readable, not a document dump.
- Put the behavioural contract in the server instructions. For Pardner that
  means: claim before acting, comment on handoff, never acknowledge a delivery
  you have not durably received, and how to pick an Actor.
- Keep JSON for the CLI and browser, where it already exists.

### 2. Project resolution from the working directory

`kanzo mcp` reads `git remote -v` in its current directory on startup, with
`origin` first, and matches the owner/repo against projects. If nothing
matches, the error names the remote, lists known projects, and tells the agent
exactly which tool call would link or create one. Over HTTP, where the server
cannot see the agent's folder, the instructions say to pass `project`
explicitly.

What to take:

- Agents in Pardner should be able to default their workspace, and possibly a
  task filter, from the repository they are running in. Pardner already
  records git commit attribution, so the remote is a natural key.
- Error messages that name the next tool call are cheap and remove a round
  trip. Pardner's "no Actor selected" and "stale revision" errors should do
  the same.
- Actor identity must not come from the folder. Kanzo has no actor model so it
  does not face this; Pardner's rule that an Actor is independent of working
  directory and replica stands.

### 3. A human-only flag on tasks

A task marked `human` is skipped by `next_task` and labelled
"for the user, not for agents" in the detail text. Backlog is also a column
agents skip. Both are one column in SQLite and one line in the reply.

What to take:

- Add an equivalent to Pardner tasks. It belongs beside delivery: a human-only
  task should never produce a delivery lease, and an agent that is handed one
  should see why.
- Consider the inverse too, an agent-only or specific-Actor-only hint, since
  Pardner already addresses work through mentions.

### 4. Resource measurement as a CI gate

Every pull request builds `main` and the merged branch, then a dependency-free
Python script seeds 3,000 tasks into each and reports binary size, crate count,
start time over ten runs, idle and loaded resident memory, thread count, board
payload size and latency, the serialized size of the MCP tool list, and the
exact text of seven representative tool replies. The numbers are posted as a PR
comment. The build profile is tuned for size (`opt-level = "s"`, LTO, stripped)
and SQLite is compiled without the features Kanzo never uses.

What to take:

- Pardner has a strong correctness evidence culture and almost no cost
  evidence. A small script that starts the service, seeds a workspace, and
  records start time, memory, and the token size of agent-facing replies would
  fit the existing qualification pattern.
- Track the size of what an agent reads per call. It is the one number that
  will decide whether agents keep Pardner open across a long session.

### 5. Frictionless install and operation

Kanzo is one binary with SQLite built in. `kanzo init` creates the data folder,
`kanzo service install` keeps it running at login, `kanzo update` fetches a
signed release and restarts the service, and `kanzo export` writes Markdown or
JSON. Releases carry GitHub attestations.

What to take:

- Pardner requires Node 24.11.1, dependencies and a UI build. Packaging the
  service as a single executable, with Node's single executable application
  support or Bun's compiler, removes most of that without a rewrite.
- Add service install and uninstall commands for macOS launchd and systemd.
  Pardner expects one long-lived service per machine; users should not
  manage that by hand.
- Markdown export is a good complement to backup. It is readable without
  Pardner and gives agents a cheap way to read a whole workspace.
- Sign releases once there are releases.

### 6. Small operational details

- **Change counter for polling.** Every write bumps one integer in a `meta`
  table through triggers. The board polls one tiny endpoint and only reloads
  when it changes. Pardner's browser gets live updates another way, but the
  idea of one cheap "has anything changed" value is useful for companion
  devices and for agents that want to wait without reading the document.
- **One lock file across sync.** Git sync takes an exclusive lock only while
  reading or replacing the database, never across the network or a commit.
  Pardner's persistence barrier already draws this boundary; it is worth
  stating as explicitly in the docs.
- **Honest conflict messages.** When both sides changed, Kanzo says so, names
  the two commands that resolve it, and keeps a backup of the losing side.
  Pardner's conflict alternatives are stronger, but the wording is a model.
- **Join state checked on every call.** A machine that joined another board
  forwards every MCP call to the host, and checks that state per call so
  running agents switch without restarting. Pardner's companion browsers could
  use the same per-request check.
- **Migrations never rewrite the shipped schema.** The first schema is frozen
  and later changes are numbered migrations; a failed migration after a pull
  leaves the pulled file in place and tells the user to update. Pardner's
  stance that prior installs are stale is fine for now, but this is the
  pattern to adopt once installs persist.

## Where Kanzo's choices would be wrong for Pardner

- **Git as sync.** A SQLite file in git cannot merge. Kanzo accepts that and
  makes the user choose a side. Pardner exists to avoid exactly that choice.
- **No login on the LAN.** Kanzo opens the board to anyone on the network.
  Pardner's shared-secret admission and ticketed WebSockets stay.
- **Author as a string.** Kanzo's comments carry whatever name the client
  sent. Pardner's attributed operations and Actor identity are the point.
- **Pull-only agents.** `next_task` is first come, first served, with no
  lease, no receipt and no idempotency story. Pardner's delivery contract
  remains the harder and more valuable problem.

## On the single Rust binary

The binary is an outcome of Kanzo's scope, not only of its language. Still,
the advantage is real: no runtime, no version pin, no build step, 2 ms start,
a few megabytes of memory, and a natural fit for always-on hosts. Automerge is
itself a Rust crate, so a Rust core for Pardner would remove a WASM layer
rather than add one.

The recommended order is packaging first, language second:

1. Ship Pardner as a single executable from the current JavaScript codebase.
2. Keep storage, sync, delivery and leases behind the operation API so they
   form one movable core.
3. Revisit a Rust core when the acceptance contract has stabilised and a
   concrete driver appears, such as an embedded or mobile replica or hub cost.
   The acceptance suite, not the language, is what must carry over.

## Suggested follow-ups

1. Design and implement a Pardner MCP server with prose replies, repo-based
   workspace defaults, and behavioural instructions.
2. Add a human-only task flag that delivery respects.
3. Add a resource measurement script and record its numbers alongside existing
   evidence.
4. Package the service as a single executable and add service install and
   update commands.
5. Add Markdown export.
