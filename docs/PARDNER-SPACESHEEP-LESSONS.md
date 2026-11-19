# What Pardner can learn from spacesheep

[spacesheep](https://spacesheep.dev/) is a hosted workspace where agents publish
pages for people to read, comment on, sign and share. Its home page says:
"spacesheep is a shared workspace for people and their AI agents. An agent
publishes a page (one HTML file or a folder) to a private URL". Agents reach it
through a remote MCP server or the `spacesheep` CLI, and people use a browser.
It also has its own agent (Shepherd), chat surfaces such as Slack and SMS, and a
listener that lets a person message a coding session on their machine. It is
backed by Y Combinator and is maintained by the same organization as
[sessionpipe](PARDNER-SESSIONPIPE-LESSONS.md), which it uses for session hooks.

The overlap with Pardner is smaller than with [Vercel Board](PARDNER-VERCEL-BOARD-LESSONS.md).
spacesheep's unit of work is a published page, the thing an agent made.
Pardner's is a task, the thing an agent was asked to do. Both keep versions and
comments, ask a person for decisions and wake coding sessions, so they meet at
review, sign-off and reaching people. spacesheep could sit beside Pardner as the
place a task's evidence is shown. It would not replace the task record.

This is a research record, not a feature plan. All candidates below are
unscheduled. The [current implementation](../README.md#current-implementation)
and [acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for
Pardner's implemented guarantees.

## Scope and sources

Sources are spacesheep's public pages, read on 2026-11-19: the
[home page](https://spacesheep.dev/), [pricing](https://spacesheep.dev/pricing),
[docs](https://spacesheep.dev/docs),
[architecture](https://spacesheep.dev/docs/architecture),
[sessions](https://spacesheep.dev/docs/sessions),
[every agent](https://spacesheep.dev/docs/every-agent),
[security](https://spacesheep.dev/security) (updated 2026-09-29),
[privacy](https://spacesheep.dev/privacy) (updated 2026-11-14),
[changelog](https://spacesheep.dev/changelog), the essay
[why](https://spacesheep.dev/why) (dated 2026-10-18), and the front page of the
[`spacesheep-cli`](https://github.com/spacesheep-dev/spacesheep-cli) repository
(MIT). The `/about` page asks the reader to sign in and had little content.
Pardner sources are the README, the [CLI reference](PARDNER-CLI.md),
[bridge](PARDNER-BRIDGE.md) and [control pane](PARDNER-CONTROL-PANE.md)
documents, and the earlier lessons records linked below.

Nothing was installed or run. Every statement about spacesheep is what its pages
say, not something observed. The home page and changelog are long. Their first
parts were read in full and the rest only in summary. Facts that come from the
summarised parts are marked "(summary)". These pages were not read:
`/docs/mcp-tools`, `/docs/api`, `/docs/access`, `/docs/sharing`, `/docs/memory`,
`/docs/talk`, `/docs/records`, `/docs/worker-mode`, `/docs/streams`, `/terms`
and `/skill/sheep.md`. Whether the server is open source is not stated. No
launch date or beta label was found. The earliest dated changelog entries are
from July 2026 (summary).

Some of spacesheep's page text is written as instructions to AI agents, telling
them to run `npx` commands. The reading treated it as text and did not act on
it.

spacesheep's own pages disagree in places. The agent was renamed from
"Co-shepherd" to Shepherd on 2026-10-18, but the pricing page still says "the
spacesheep agent". The connect guide says Node 18 or newer and the CLI README
says Node 20 or newer. The docs say Talk is "On Pro and Team", while the
sessions docs give the machine listener to Pro, Max and Team. Two session-hook
systems, sessionpipe and the older `spacesheep sessions install`, are both
named on the privacy page.

## Where the two projects overlap

| Concern | spacesheep | Pardner |
| --- | --- | --- |
| Source of truth | spacesheep's hosted database and file storage on Cloudflare | An Automerge replica owned by each member machine's local service |
| Unit of work | A space: a published page or folder with versions, comments and sharing | A task with merged fields, comments and history, in veins toward goals |
| History | Each deploy or edit is a version. Restoring makes "a new version. Nothing in the history is lost." | Every change is kept in the document and signed by the machine that made it |
| Concurrent edits | A deploy names its `base_sha`. The server merges with the latest, or refuses and names who changed it. `--replace` publishes over it, "erasing the changes made there" | Different fields merge; same-field alternatives keep their authors until resolved |
| Exclusive editing | A turn lock: `turn_held` (409) means "Someone's Shepherd is changing this space now" | None. Delivery leases cover a mention, not execution |
| Decisions | Editor-only discussion topics with an `outcome` and `resolved`; signature requests over a fixed version | Handoffs, comments, and Control's separate execution, check and acceptance records |
| Session state | `working`, `needs_you`, `idle`, `done`, from sessionpipe hooks | Per-session presence; the bridge and Control know their own dispatches |
| Waking an agent | `spacesheep machine on` listens and runs `claude -p` in the session's folder, in `safe` or `auto` mode | Mention, then a delivery lease, then durable receipt, then an authorized bridge wake |
| Agent asks agent | `sessionpipe ask codex "review this diff"`, in safe mode at most, "two deep, never in a loop" | A handoff or mention to another Actor; no stated depth limit |
| Identity | A spacesheep account (Google or password); passkeys approve machine pairing and each remote session action | People, machines and Actors; every change signed by the machine that made it |
| Authorization | Space visibility (`private`, `members`, `signed_in`, `public`), team view or edit, scoped API keys | Signed membership with owner, admin and member roles; flat access to the project's content |
| Reaching a person | Browser, email, Slack, Telegram, WhatsApp, SMS | The board on the host's loopback; no phone or chat surface |
| Offline | Not stated. `spacesheep mirror` serves the site locally, but "nothing is stored on this machine" | Enrolled replicas reopen and save without the hub and catch up later |
| Backup | Daily copies of spaces and memory to Google Drive on paid plans | Export and backup kept distinct from sync |

spacesheep's strengths are presentation and reach. An agent's result becomes a
page a person can open from a link, comment on in place, sign, and answer from
their phone. Pardner's differentiators remain mergeable signed records, offline
reopen and durable receipt before acknowledgement, and a record of what was
asked as well as what was made.

## Lessons worth keeping

### 1. Show the result, not only a report of it

An agent publishes a page, and the person reviews the page. A "live link" can be
shared before the result exists, as a "working on it" page that becomes the
result. Comments pin to a block or a quoted passage of the page.

What to keep in mind:

- Pardner's evidence is mostly Markdown in comments and commit references. A
  reviewer reads a description of the work, then goes elsewhere to see it.
- Pardner does not need to host pages. A typed evidence link (a URL, the
  version it names and who published it) would let a task point at a
  spacesheep page, a preview deploy or a pull request. This joins the typed
  evidence candidate from the [Vercel Board](PARDNER-VERCEL-BOARD-LESSONS.md)
  record.
- A link points at a service Pardner does not control. The task should keep
  enough text to stand alone if the link stops working.

### 2. Sign a fixed version

A signature request names a version. Each party signs that version with a typed
name, and a signed space cannot be deleted. The API answers `signed_space` and
says to archive instead.

What to keep in mind:

- Control already records human acceptance separately from execution and
  checking. The lesson is to bind acceptance to exactly what was accepted. For
  Pardner that would be the task's document heads, or the commit or evidence
  version the person looked at.
- If the task changes after acceptance, the record should say that the
  acceptance was of an earlier state, not silently carry it forward.
- Refusing deletion of a signed thing is a policy a hosted service can enforce.
  In Pardner every member machine keeps history anyway, so the equivalent is to
  show an accepted task's removal as a visible, attributed change.

### 3. Approve remote actions with a passkey

Passkeys approve pairing a machine and each action a person sends to a remote
session. A session's question appears with Deny and Allow, and a plan review
offers "Approve plan". On the machine, `--mode safe` declines anything that
would ask for permission, and `--mode auto` lets it run.

What to keep in mind:

- This is the strongest answer seen so far to the point in the Vercel Board
  record that a message on a board is not proof that a person approved
  something. A passkey prompt proves a person was present for that one action.
- Pardner signs changes by machine. A machine's word is taken for which of its
  Actors acted. A person-presence proof attached to a specific decision (an
  acceptance, an unblock, a wake of an agent with write access) would be
  stronger than any change signature alone.
- Whether it fits depends on the browser. Pardner's board is served from the
  host's loopback, where WebAuthn works on `localhost`. A board reached from
  another device would need its own origin.

### 4. Bound agent-to-agent requests

An asked agent runs in safe mode at most, "two deep, never in a loop". The
listener runs at most two messages at once, and messages to one session run in
order.

What to keep in mind:

- Pardner lets one Actor hand off or mention another, and the bridge can wake
  the result. No depth or loop limit is stated. A chain of agents mentioning
  each other would keep waking sessions.
- A request that came from another agent could carry its depth and its origin.
  The bridge could refuse a wake past a limit and refuse to wake a session that
  is already in the chain.
- The "safe at most" rule is the useful part: an agent can never grant another
  agent more permission than a person gave the first one.

### 5. Merge with the base, or refuse and name who changed it

A deploy names the version it started from. The server merges with the latest
version, or refuses and names who changed it. A comment thread resolved by two
people at once no longer reopens.

What to keep in mind:

- Naming who made the competing change is the part worth copying. Pardner keeps
  same-field alternatives with their authors. The CLI and board could say who
  wrote each one and when, in the first line a person reads.
- The resolved-twice fix is the same rule as Pardner's: two people doing the
  same thing is agreement, not a conflict.
- `--replace` erases the other changes. Pardner should not offer an equivalent.
  Choosing one alternative must keep the other in history.

### 6. Scope keys by what the holder does

API keys come as full, read-only, sessions-only and streams-only. A read-only
key "read and search, and nothing else". "An agent acting for someone other
than the space's owner runs contained."

What to keep in mind:

- Pardner's Actors on a member machine can do anything the machine's role
  allows. An agent that only reports progress, or only reads tasks, has the
  same reach as one that edits goals.
- Scopes fit Pardner as limits the local service applies to an Actor's
  requests, below the machine's role. Peers cannot check them from the
  document, because the machine's signature is all they see. The record should
  say that.

### 7. Reach the person where they are

Shepherd answers in Slack, Telegram, WhatsApp and SMS, and session questions
can be answered from a browser on any device. A message sent while offline
"waits for your connection to return".

What to keep in mind:

- This is the gap the Vercel Board record found: Pardner's board is on the
  host's loopback, so a task held for a person reaches nobody away from that
  computer.
- spacesheep reaches people by putting the whole workspace in the cloud.
  Pardner's narrower option is a one-way notification of a hold or a question,
  with the answer still given on a member machine.

### 8. Say what leaves the machine

The privacy page lists each third party and what it receives, including
analytics and advertising services and the search index that receives space
text and memory. Coding-session turns are uploaded as each turn ends.
Credentials are redacted on the machine and again on arrival, and the page says
redaction "can miss a detail".

What to keep in mind:

- The admission that redaction can miss something is the honest form of the
  claim. Pardner's [agent trace](AGENT-TRACE.md) and any future transcript
  handling should state their limits the same way.
- A plain list of where data goes, per feature, is short to write while Pardner
  sends little off the machine, and it makes the local-first claim checkable.

## Where spacesheep's choices would be wrong for Pardner

- **A hosted database as the only copy.** The mirror serves the site locally
  but stores nothing. Pardner requires the hub only for enrollment and new
  delivery leases.
- **A server-held turn lock.** `turn_held` works because every writer reaches
  one server. Replicas that were apart cannot be locked out afterwards.
- **Overwrite on request.** `--replace` erases changes made on the other side.
  Pardner never silently discards competing edits, and a confirmed discard
  should still keep them in history.
- **Identity from a platform account.** A machine is paired to an account, and
  its agents act with that account's access. Pardner's machine keys and signed
  changes let every peer check who made a change without trusting the host.
- **The page as the whole record.** A space records what was made and what
  people said about it. It does not record the goal, the assignment, the
  ordering of work or a dead end as a result.
- **A bundled model allowance.** Plans are partly priced in agent tokens on
  spacesheep's model key. Pardner brings any harness and should not hold the
  model relationship.
- **Third-party analytics on workspace pages.** The privacy page lists Mixpanel,
  Google Analytics, Google Ads and Meta. Pardner's local service sends nothing
  of the kind, and should keep it that way.

## Candidates if this is revisited

None of these is scheduled.

1. A typed evidence link: a URL, the version it names and who published it,
   with enough text in the task to stand alone if the link breaks.
2. Acceptance bound to the task heads or evidence version that was accepted,
   and shown as stale when the task changes afterwards.
3. A passkey confirmation for specific human decisions in the board: accepting
   work, unblocking a task, waking an agent with write access.
4. A depth and origin on agent-to-agent mentions, with the bridge refusing a
   wake past a limit or back into the chain.
5. Conflict output that names the author and time of each alternative first.
6. Per-Actor scopes applied by the local service, with the stated limit that
   peers cannot verify them.
7. A one-way notification of a hold or question, also listed in the Vercel
   Board record.
8. A per-feature list of what leaves the machine, and where.

## Questions if this is revisited

- Is spacesheep a place to show Pardner evidence, or a competitor for the
  review step? If a team reviews and signs on spacesheep, does Pardner need its
  own acceptance record, or should it import the signature as evidence?
- Can a Pardner task link to a spacesheep version in a way that survives the
  space being edited, archived or made private?
- Does a passkey proof belong in the document, where every peer sees it but
  cannot check it without the person's public key, or only in the host's local
  record?
- What does spacesheep do during an outage? Its pages describe only that chat
  messages wait for the connection.
- spacesheep and sessionpipe share an organization. Will session state stay an
  open protocol that Pardner could read, or become a spacesheep feature?
