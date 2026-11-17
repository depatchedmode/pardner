# What Pardner can learn from sessionpipe

[sessionpipe](https://github.com/spacesheep-dev/sessionpipe) is an open protocol
and client for what coding agents are doing on a machine. It installs hooks into
Claude Code, Codex, Gemini CLI, Antigravity, Devin and Grok Build, turns them into
one event stream, and can carry signed commands back to a session. Pardner owns
intent, tasks and review. sessionpipe knows what each session is doing right now
and how to reach it. The two overlap very little, which makes sessionpipe a
candidate layer under Pardner and a source of contracts worth borrowing.

This is a research record, not a feature plan. All candidates below are
unscheduled. The [current implementation](../README.md#current-implementation)
and [acceptance contract](PARDNER-ACCEPTANCE.md) remain authoritative for
Pardner's implemented guarantees.

## Scope and sources

Sources are sessionpipe's repository at commit `8eada32` (CLI 0.17.0), read on
2026-11-16: its README, `ROADMAP.md`, `GOVERNANCE.md`, the specs under `spec/`
(`PROTOCOL.md`, `OUTBOX.md`, `HTTP.md`, `PRIVACY.md`, `CONTROL.md`,
`ADAPTERS.md`), and the layout of `packages/` and `conformance/`. Pardner sources
are the README, [bridge](PARDNER-BRIDGE.md), [control pane](PARDNER-CONTROL-PANE.md),
[client guide](PARDNER-CLIENT.md), [onboarding contract](PARDNER-ONBOARDING-CONTRACT.md)
and [agent trace](AGENT-TRACE.md) documents.

Nothing was installed or run. Every statement about sessionpipe's behaviour is
what its documents say, not something observed. The specs were read in part:
`CONTROL.md` and `ADAPTERS.md` are long, and only the sections cited here were
read. No sessionpipe code is incorporated or proposed for incorporation by this
record. Its code is Apache-2.0 and its spec CC BY 4.0.

sessionpipe is young. Its packages were first published on 2026-09-28, it lists
one maintainer, its spec is marked Draft until two independent receivers pass
conformance, and its outbox document describes the reference client "as of
0.13.3". Any contract below can change.

## Where the two layers overlap

| Concern | sessionpipe | Pardner |
| --- | --- | --- |
| Unit | A harness session, named by the harness's own id | A task, in veins toward goals; Actors act on it |
| Source of session state | Harness hooks and the harness's own files, with no agent cooperation | Explicit reports from an authenticated session (`active`, `focusTaskIds`, `model`) |
| Local store | Append-only JSONL outbox per session, with a byte cursor per sink | Persisted Automerge replica; SQLite bridge inbox and control ledger |
| Delivery to a remote | A sink's cursor moves only on a 2xx; the receiver deduplicates on harness, session and `seq` | Durable receipt before delivery acknowledgement; hub delivery leases |
| Reaching a session | Waiter, turn boundary, session inbox, ACP, headless resume or fork, chosen per message | Bridge wakes dedicated Codex App Server threads it owns; Control queues follow-ups to mapped T3 threads |
| Who may command a session | A passkey or hardware device key enrolled at the machine's own terminal; the receiver only carries | Signed membership records and machine keys; explicit task and sender allowlists per mapping |
| What leaves the machine | Per-sink privacy tier, allowlisted per event type; secrets removed before the outbox above tier 0 | Workspace operations sync to member machines; control and bridge records stay host-local |
| Identity | Harness account id, machine name, session id | Actors, people, machines, each with signed provenance |

Pardner's differentiators remain mergeable attributed records, offline reopen
and delivery leases. sessionpipe's strength is breadth of harness coverage and a
carefully specified path into a live session.

## Lessons worth keeping

### 1. Facts and timestamps, never verdicts

sessionpipe's protocol "never carries a verdict". What "stale" means, and when a
session that never said goodbye is "done", are a receiver's readings. Four of
its harnesses never fire a session-end, so a receiver infers "done" from silence
and must present that as its own reading. An absent field means unknown:
`attended` absent is never read as `false`, and an absent `submitted_by` is never
read as "a person submitted this".

What to keep in mind:

- Pardner presence already says active, idle or offline from explicit reports
  and leaves unknown models unreported. The same rule should hold for any
  harness-derived state: show "no report" and "inferred from silence" as
  different things.
- This complements the [Herdr](PARDNER-HERDR-LESSONS.md) lesson to prefer
  explicit reports and define their limits. Hook-derived facts are a second
  source with different limits, not a replacement.

### 2. "Needs you" has a precise lifecycle

`attention.needed` opens a question and names its kind (`permission`,
`question`, `elicitation`, `idle`, `error`). sessionpipe specifies exactly which
later events close it: a tool result from the thread that asked, the turn's end
when the main thread asked, a subagent's end when it asked, or the session's
end. It also records the cases it gets wrong, such as a thread running several
tool calls side by side. An earlier, simpler rule ("the session's next hook
event") closed the main thread's question within a second or two whenever a
subagent was working.

What to keep in mind:

- A "needs a person" projection, raised in the [T3](PARDNER-T3-LESSONS.md),
  [Kortix](PARDNER-KORTIX-LESSONS.md) and [Linear](PARDNER-LINEAR-LESSONS.md)
  assessments, needs a closing rule as careful as its opening rule, or it shows
  stale prompts.
- Subagents make "is this session waiting?" a per-thread question.

### 3. The carrier decides whether to send; only the machine decides whether to run

A sessionpipe receiver queues commands and can refuse them, but holds no key the
machine trusts, so it cannot forge one. A bearer token authenticates transport
only. The machine parses the exact bytes it received and never re-serializes
them, records the nonce before it runs the command and refuses if it cannot
record it, and judges age by signing time, so a message sent while the lid was
shut still runs within 24 hours. A key enters the trust store only from that
machine's own terminal.

What to keep in mind:

- This is the same shape as Pardner's trust gate: the hub relays, and peers
  verify signed records. The ordering rules are the transferable part,
  especially "record the nonce before acting" and "verify the bytes received".
- Every refusal has a named code, and a receiver is encouraged to run the same
  verifier early so the person sees why a command was refused.

### 4. Shared vectors are the contract

`conformance/` holds 170 control-vector files, byte-level outbox read cases,
redaction vectors and delivery scenarios. Adapter fixtures are recorded from
real hook payloads, and a mutation suite feeds each one broken shapes to prove
no adapter can throw. A second implementation is expected to pass the same
files.

What to keep in mind:

- Pardner's membership gate and machine handshake have rules of the same kind
  (limits, refusal reasons, replay). Language-neutral vectors would make them
  checkable by a second implementation, which matters if Rust is ever
  introduced.
- "Recorded from a real payload" is the adapter equivalent of Pardner's rule
  against claiming a real-agent rehearsal from automated evidence.

### 5. One writer per transcript, detected and not only declared

sessionpipe never resumes a session that a live process holds. It decides
"held" from the harness's own session registry, and also treats a transcript
written in the last 90 seconds by something it cannot account for as held. A
held session gets an in-place delivery mode or a fork.

What to keep in mind:

- Pardner's bridge relies on `sessionOwner: "bridge"`, a declaration of
  exclusive ownership. Detection would catch the case the declaration cannot: a
  person opening the mapped thread in another client.
- A fork creates a second copy of a session. sessionpipe tracks that with
  `copy_of` on the ack. Pardner would need the same honesty about which copy
  answered.

### 6. Pick the delivery mode per message, and say which one was used

For each message the daemon takes the first mode that fits: a session it
started itself, a background waiter, the next turn boundary, the session's own
inbox, an ACP connection, a headless resume, or a fork. The ack names the mode.
Acks distinguish `taken` (verified, delivering), `delivered`, `expired`,
`unsupported`, `failed` and `refused`. A `failed` ack with code `held` means the
message was written to a live session that did not provably take it, and
nothing was retried on another mode.

What to keep in mind:

- `held` is the same state as Pardner's uncertain dispatch: the safe response
  is to stop and reconcile, not to try another path and risk a duplicate.
- The waiter is cheap to borrow. A background command blocks on a local socket
  with no polling and no model requests, prints the message and exits, and the
  harness wakes the session with that output. It reaches live Claude Code
  sessions that the bridge's Codex-only adapter cannot.

### 7. Privacy is an allowlist per destination, applied before the first write

Each sink has a tier from 0 (presence) to 3 (full replay). Filtering keeps only
the fields the spec names for that event type at that tier, so an unknown field
is never sent. The secrets ruleset runs before an event reaches the outbox and
cannot be turned off above tier 0.

What to keep in mind:

- An Automerge document keeps its history. Anything harness-derived that
  reaches a synchronized document is permanent on every member machine, so only
  tier 0 or 1 facts should ever be candidates, and transcripts should stay on
  the machine that produced them.
- Tier 0 is not redacted and carries the session title, which for some
  harnesses is the first prompt cut short. "Presence only" can still include a
  person's words.

### 8. Lineage between sessions is data, never authority

`sessionpipe ask` lets one session hand a task to another agent on the same
machine. The request stays on the local socket, the child runs at `safe` or
narrower whatever the machine's mode, chains stop at two deep, and loops are
refused. Both sides emit events (`delegation.started`, `delegation.ended`,
`delegated_by`), and the spec says a receiver treats this as "lineage, never
authority".

What to keep in mind:

- Pardner records handoffs between Actors as attributed operations. A harness
  delegating work on its own is a separate fact that could be shown beside a
  task without changing who is responsible for it.

## Where adopting sessionpipe would be wrong for Pardner

- **Becoming a control receiver.** That needs passkey enrolment and a second
  trust system beside machine keys and signed membership. Pardner would carry
  commands it cannot verify under its own rules.
- **Letting sessionpipe authorize a wake.** `ask` trusts any process of the
  same user. Pardner's explicit task and sender allowlists, and its durable
  inbox before acknowledgement, must stay in front of any such path.
- **Syncing session events into the workspace document.** Volume alone rules
  it out: sessionpipe reports 97,243 events from one machine by 10 a.m., 87 % of
  them subagent tool calls. Session state belongs in the ephemeral presence
  path.
- **Depending on an unpinned daemon.** The sessionpipe daemon installs new
  releases itself, at most once a day, unless `sessionpipe update off` is set.
  Layering on it means a version pin and requalification, as with T3.
- **Relying on the account pool.** It keeps several Claude accounts behind one
  listener so a session continues past an account's limit. Pardner should not
  depend on or promote it.
- **Treating hook-derived state as an Actor's own report.** A session's events
  say what a harness did, not which Actor did it or on which task.

## Candidates if this is revisited

None of these is scheduled.

1. A read-only local adapter that reads the sessionpipe outbox at tier 0 or 1
   and submits presence reports for mapped agent Actors. The outbox layout is a
   documented interface, so this needs no remote service. The open question is
   the mapping from a session to an Actor and a task: `session.branch` and
   `cwd` are candidates, and `pardner commit --session` already records a
   session key.
2. A `pardner mentions wait` background command modelled on the waiter, so a
   live Claude Code session can be woken by a durable mention without polling.
3. A second bridge adapter that delivers through `sessionpipe ask` to harnesses
   the Codex adapter cannot reach, behind Pardner's existing authorization and
   inbox.
4. Held-session detection for the bridge, beside the `sessionOwner`
   declaration.
5. Language-neutral conformance vectors for the membership gate and machine
   handshake.
6. A closing rule for any "needs a person" row, written before the row exists.

## Questions if this is revisited

- Does hook-derived presence agree with explicit reports on a real multi-agent
  day, and which one do people trust when they differ?
- Can a session be mapped to one Actor and one task reliably, or only to a
  branch?
- Is the outbox contract stable enough to read directly, or should Pardner
  consume a file sink that sessionpipe writes for it?
- What does a machine show when sessionpipe is absent, stopped or mid-update?
