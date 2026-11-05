# Project control pane

This covers [issue #77](https://github.com/depatchedmode/pardner/issues/77). The
control pane makes Pardner a working view for its own development. GitHub owns
milestone scope and issue-level outcomes. Pardner owns tasks, dispatch intent,
execution context and review. Tasks link to existing GitHub issues, but nothing
is published to GitHub and no status moves in either direction.

Execution goes through T3 Code, using the contract qualified in
[the T3 qualification report](PARDNER-T3-QUALIFICATION.md). Cursor Cloud
now has a separate [Cloud adapter](PARDNER-CURSOR-CLOUD.md) with live dispatch disabled by default.

## Use it

Open the board on the service computer through its loopback address, choose an
Actor, then choose **Control**. Control settings need that loopback page.

1. **Pair T3.** Run `t3 auth pairing create`, then enter the T3 address and code.
   Pardner pairs one `approval-required` credential and keeps it in
   `t3-credential.json` (mode 0600). The token is never returned by the API.
2. **Register a project** with an ID, a name and an optional GitHub repository.
3. **Map a T3 thread** to one agent Actor, with explicit task IDs and sender Actors.
   Only top-level `approval-required` threads are accepted.
4. **Queue a follow-up** from the thread. It is saved in Pardner first and sent only
   when T3 shows the thread idle and nothing is held.

In a task, **Link GitHub issue** takes `owner/repo#number`. The CLI equivalents are
`pardner issue link TASK owner/repo#77` and `pardner issue unlink TASK owner/repo#77 --revisions JSON`.

## Where records live

| Record | Stored in | Synchronized |
| --- | --- | --- |
| Task ↔ GitHub issue links | Workspace operations (`task.link-issue`, `task.unlink-issue`) | Yes, like other task history |
| Projects, mapped threads, routes and Actor authorization | `control.sqlite` | No |
| T3 credential, pairing time and expiry | `t3-credential.json` | No |
| Dispatch intent, queue, request ID, run ID, state, submissions, credential used, transitions | `control.sqlite` (the `T3Execution` ledger) | No |
| Holds, release reviews and their evidence | `control.sqlite` | No |
| Captured output, artifacts, checker and human verdicts | `control.sqlite` | No |

The control files sit in the service's data directory, are created when the service
starts, and belong to that workspace and replica. A copied ledger opened by another
replica is refused with `WORKSPACE_MISMATCH`, so a copy cannot become a second
controller for the same threads. The browser holds none of these records.

Issue links are derived from link events. An unlink retires only the link revisions
it observed, so a link added concurrently on another replica survives. No schema
version change was needed, and existing schema-4 workspaces keep working.

## Identity

Each mapped thread records what T3 reported, never a guess:

| Field | Source | When absent |
| --- | --- | --- |
| Project, repository | Registered in Pardner | Repository is optional |
| Environment | T3's environment descriptor | Shown as not reported |
| Host | This service's host name | Always present for T3 |
| Provider | `t3`, plus T3's `providerInstanceId`, `model`, `runtimeMode`, `interactionMode` | — |
| Session | T3 `threadId`, `projectId`, `link` | — |
| Run | Exact T3 `runId` per execution | `not established` until accepted or reconciled |
| Branch, worktree | T3 thread read | A project-folder thread reports neither; none is invented |

Branch and worktree are the thread's last observed values, not a snapshot per run.
Cloud runs will need a location without a local path; this slice only models T3's
local threads.

## How the pane drives the contract

`T3Execution` is passive. The pane runs one poll pass every 2 seconds by default,
and immediately after a follow-up is queued or held work is released. For each
mapped thread it:

1. On the first pass after startup, looks for the exact request of every `unknown`
   execution. It never resubmits to find out.
2. Repeats cancellation for any execution left in `cancel_requested`, because a crash
   can land after the hold is saved and before the interrupt is sent. It repeats at
   startup and then at most every 10 seconds. The interrupt names the exact run and
   never sends `stop`.
3. Reads the thread. The read updates the recorded identity, holds the thread if its
   runtime mode is no longer `approval-required`, and marks owned runs.
4. Captures output from runs that ended, including the partial output of a cancelled
   run. A failed capture is retried, and a successful one is read once more on a later
   pass, because T3 can report the end before its last message is written.
5. Submits the oldest queued intent if a fresh read allows it. After a lost reply, it
   looks for the request immediately.

Reads request T3's 50 most recent runs, and an owned run older than that reads as
absent and becomes `unknown`. With one Pardner submission in T3 at a time and a
2-second poll, an owned active run stays in that window unless more than 50 other
runs start between polls or while the service is stopped.

The pane also holds every mapped thread while T3 reports a version that was not
qualified, and submits nothing until it has read T3's version. Releasing that hold
needs an explicit `acceptVersion`, which accepts the version for this controller;
the evidence is stored with the review.

## What the pane shows

- **Fresh versus stale reads.** Each thread and active execution shows when T3 last
  answered, measured on the service clock. A read older than 3 poll intervals is
  labeled stale, and the last read error is shown. `observedAt` marks when a reply
  arrived, not when T3 produced it.
- **Approval and input blocks.** A `waiting` request item on the run shows as
  **Waiting for approval or input** with a **Decide in T3** link to the thread. T3
  approvals cannot be decided over MCP, and the pane does not tell approvals from input requests.
- **Held follow-ups.** Queued work stays **Queued in Pardner** while the thread is busy,
  blocked, cancelling, unknown or held, with the reason.
- **Cancellation.** **Cancellation requested** is not terminal. A later fresh read
  must report the run ended. Partial output is kept; nothing is rolled back.
- **Three separate verdicts.** *Execution* is how T3 ended the run. *Independent
  check* must come from an Actor other than the one that ran the work. *Human
  acceptance* must come from a human Actor. None implies another, and every verdict
  is kept with its evidence.

## Authority

| Action | Needs |
| --- | --- |
| Pair T3, register projects, map threads, change authorization, release holds, resolve unknown outcomes | The local loopback page (`LOCAL_ADMIN_REQUIRED` otherwise) |
| Queue follow-ups, cancel, look up an unknown request, record artifacts and verdicts | The workspace token, plus the route's Actor, task and sender check for dispatch |

Dispatch is authorized before anything is saved, so a wrong Actor, task, sender or
thread leaves no record and makes no T3 call. Revoking a task leaves its queued work
queued rather than sending it.

These checks rest on the Actor the request names, like every workspace operation
under shared-secret admission. Anyone holding the workspace token, including a
paired companion device, can queue work as an authorized sender, cancel runs, and
record a verdict as any human Actor. The human-Actor and independent-checker rules
keep the records consistent. They do not authenticate the person.

## API

All paths need the workspace token. `GET /pardner/control` returns the full view. Each
`POST` below returns `{ success, result }` or `{ success: false, code, error }`.
T3 failures use `T3_REJECTED` (502, with `t3Code`), `T3_BUSY` (503) or `T3_UNKNOWN` (504).

| Path | Body |
| --- | --- |
| `/pardner/control/credential` | `origin`, `pairingCode` |
| `/pardner/control/projects` | `id`, `name`, `repository` |
| `/pardner/control/sessions` | `projectId`, `threadId`, `actorId`, `allowedTaskIds`, `allowedFromActorIds` |
| `/pardner/control/sessions/authorize` | `threadId`, `allowedTaskIds`, `allowedFromActorIds` |
| `/pardner/control/sessions/release` | `threadId`, `evidence`, `reviewedRuns`, `acceptVersion` |
| `/pardner/control/executions` | `id`, `threadId`, `actorId`, `taskId`, `fromActorId`, `text` |
| `/pardner/control/executions/cancel` | `id` |
| `/pardner/control/executions/reconcile` | `id` |
| `/pardner/control/executions/resolve` | `id`, `decision` (`retry` or `abandon`), `evidence` |
| `/pardner/control/executions/artifacts` | `id`, `kind` (`commit`, `branch`, `pull_request`, `test_result`, `note`), `reference`, `actorId` |
| `/pardner/control/executions/verdicts` | `id`, `kind` (`checker` or `human`), `verdict` (`accepted` or `rejected`), `actorId`, `evidence` |
| `/pardner/control/poll` | none; runs one pass and returns the view |

## Services, outages and recovery

| Dependency | Required for | When unavailable |
| --- | --- | --- |
| Local Pardner service | Everything here | The browser shows nothing new; records are kept on disk |
| T3 | Submission, reads, cancellation, approvals | Intent stays queued, reads are labeled stale with the error, and nothing is resubmitted. After T3 restarts, the existing holds and reconciliation rules apply |
| GitHub | Nothing | Issue links are references only and keep working |
| Hub | Synchronizing issue links to other replicas | Links save locally and sync later; control records never sync |

**Credential life.** T3 reported a 30-day token in qualification. The pane shows
`valid`, `expiring` (under 3 days), `expired`, `rejected` (T3 answered 401/403) or
`missing`, and stops calling T3 when it cannot be used. Token renewal was not
qualified, so plan to pair again before expiry. T3 deduplicates `clientRequestId`
per credential, so after pairing again, work that may already be in T3 cannot be
retried. Reconcile it, or abandon it with evidence.

**Restart.** Restarting the service reconstructs projects, routes, the credential,
intent, queue, run identity, holds, reviews, output and verdicts from disk. The first
pass then reconciles unknown outcomes, repeats interrupted cancellations and reads
every thread. No one has to prompt again.

**Backup and fresh install.** Synchronization is not backup. Back up the whole data
directory while the service is stopped, including `control.sqlite`,
`control.sqlite-wal` and `t3-credential.json`. Treat that file as a secret. Restoring
it to the same replica directory restores everything above. A fresh install or a new
replica has a new replica identity, so it does not take over an old ledger. It starts
an empty one, and needs a new T3 pairing and thread mapping. Keep the old directory
to inspect earlier executions. A T3 credential belongs to the T3 server that issued
it, so a new T3 install also needs pairing again.

## Verification

```sh
node --test test/control-pane.test.js test/issue-links.test.js test/t3-execution.test.js
node --test test/pardner-cli-issues.test.js
npm run ui:build && node --test test/pardner-control-ui.test.js
```

`test/control-pane.test.js` runs the real service, ledger and MCP client over HTTP
against [a scripted T3](../support/fake-t3-server.js) with manual polling. It covers
pairing, registry identity, unqualified threads, local authority, wrong and revoked
routes with zero submissions, approval blocks, held follow-ups, restart
reconstruction, a lost reply reconciled without resubmitting, an unresolved outcome
blocking reuse, a crash after acceptance and before persistence, cancellation
repeated after a crash, cancellation of the exact run with partial output, delayed
cancellation of a finished run, stale reads, version and runtime-mode holds,
credential expiry, refusing a retry after pairing again, startup recovery deferred
through a T3 outage, and retried output capture. Competing receivers,
out-of-order reads and cancellation races are covered by the contract fixtures in
`test/t3-execution.test.js`.

`test/pardner-control-ui.test.js` drives the same flow in Chromium and WebKit:
an issue link, pairing, project and thread mapping, a queued follow-up, an approval
block with its T3 link, a held follow-up, a stale read while T3 is down, cancellation
with partial output, and separate verdicts.

## Live smoke

On 2026-11-03 the pane ran against the owner's installed T3 0.1.6, with a throwaway
Pardner service and a scratch git project. The pane paired its own `approval-required`
credential and launched a new thread, which used Claude Opus 5.5 through T3's
`claudeAgent` provider. Then:

- A harmless prompt was sent once and reached `completed`. Its captured output was the
  assistant's reply alone.
- A long prompt was cancelled after 6 seconds. The interrupt named the exact run, and
  a fresh read reported `interrupted`. T3 had recorded only reasoning by then, so nothing
  was captured.
- A follow-up queued behind it stayed `queued` with the cancellation hold, was never
  sent, and was then withdrawn.

The first attempt found a defect. T3 marks a prompt sent over MCP as
`createdBy: agent`, so the captured output included the prompt. Output now keeps
only `assistant_message` items, and the scripted T3 models this. No approval was
exercised, and no person was involved. That proof remains with
[#79](https://github.com/depatchedmode/pardner/issues/79).

## Limits

- **The scripted T3 is a model.** The live qualification against installed T3 is in
  the qualification report. The pane's own live run is the smoke above; approvals,
  restarts and human acceptance against a real provider belong to
  [#79](https://github.com/depatchedmode/pardner/issues/79).
- **Output capture uses read fields that were not qualified.** It reads the run's
  assistant messages after T3 reports the run ended and once more to confirm, up to
  20,000 characters. Treat it as evidence, not a transcript.
- **Worktree threads were not qualified** and are labeled so. Child threads are
  refused. Paging through very long threads was not qualified.
- **Provider boundaries.** T3 and the separate Cloud adapter have independent ledgers; live Cloud qualification is pending. One controller owns each thread, and the
  pane cannot stop a person or another tool from sending to it. It can only hold
  the thread once their run appears.
- **Approvals and input look the same.** Both show as blocked and point to T3.
- **Issue links are references.** They do not fetch titles or state and never close
  issues. Publication and broader linking stay with
  [#52](https://github.com/depatchedmode/pardner/issues/52).
- **Unresolved contracts.** Routing ([#58](https://github.com/depatchedmode/pardner/issues/58))
  and review ([#66](https://github.com/depatchedmode/pardner/issues/66)) are contained
  here with explicit routes and separate verdicts, not resolved.
- **Durability.** SQLite runs with `synchronous = FULL`. The tests restart the
  service and patch the ledger to simulate crashes; they do not cover power loss.
