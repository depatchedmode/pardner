# T3 execution contract qualification

This report covers [issue #76](https://github.com/depatchedmode/pardner/issues/76).
Pardner owns intent, tasks and review. T3 owns local execution and its native
approval flow. Everything below applies to **T3 Code 0.1.5** (orchestration
protocol 2, 66 MCP tools listed for a full-access client) and must be requalified on upgrade.

Results come from [`scripts/t3-qualification.js`](../scripts/t3-qualification.js),
which runs the installed T3 server against a disposable home with a
[scripted provider](../support/t3-fake-codex.mjs). It passes the server an allowlisted
environment, makes no model turns and never connects to the owner's T3 server.

The sanitized output is [`evidence/t3-0.1.5-qualification.json`](evidence/t3-0.1.5-qualification.json).
It holds the checks, separately listed observations, request/response transcripts,
per-execution state transitions and submission counts. `submissions` counts sends that
T3 may have accepted, so a deduplicated retry can count twice. Thread, client, project and
request IDs are replaced by stable pseudonyms, keeping the formats the contract depends
on. Read replies are reduced to status, run and item fields, and repeated identical polling
reads are omitted. `source.qualificationFilesSha256` ties the file to the code that produced
it, and any later edit to those files makes it stale. It has a hash of every tool definition, and full
definitions for nine thread, queue, request and project tools. It records one run.

```sh
npm run test:t3-qualification -- --output docs/evidence/t3-0.1.5-qualification.json
node --test test/t3-execution.test.js
```

The script needs an installed T3 (`--t3`, `PARDNER_T3_CLI` or `~/.t3/bin/t3`) and
Playwright Chromium. It is opt-in and not part of `npm run verify`; the fixtures are.

## Capability matrix

| Capability | Interface | Observed in 0.1.5 | Consequence for Pardner |
| --- | --- | --- | --- |
| Authenticate | Pairing code, then MCP OAuth at `/oauth/mcp/*` | Works for an outside client. The token reports a 30-day life and survives a server restart | Store the credential privately and keep one per controller. Plan for expiry: re-pairing changes the deduplication scope |
| Identify work | Environment descriptor, `t3_thread_read` | Observed on a thread read: `threadId`, `projectId`, `latestRunId`, `activeRunId`, `providerInstanceId`, `model`, `runtimeMode`, `interactionMode` and `link`. `branch` and `worktreePath` were absent on a project-folder thread. `environmentId` comes from the descriptor. Worktree threads were not exercised | Store these per execution, and do not invent a worktree when absent |
| Limit permissions | Client `access`: `read-only` to `full-access` | Read-only writes get `capability_denied`; a broader runtime mode gets `runtime_mode_escalation_denied`. An `approval-required` client can launch, send, read, interrupt and remove queued runs, and can send to and interrupt a same-mode thread another client launched | Pair with `approval-required` for controlled sessions. The caller must check `thread.runtimeMode` when mapping: the contract does not, and a broader-mode thread may never reach `blocked` |
| Start | `t3_thread_launch` | `approval-required` reaches the provider as `untrusted`. A repeated `clientRequestId` returns the same thread and run | Choose the mode explicitly. The contract takes an existing thread and does not cover launch |
| Follow up | `t3_thread_send` | With `mode: queue`, a busy thread queues in order, and no 409 was returned. **`steer` and, once a run can be steered, `auto` go into the active run; `restart` restarts it under the same run ID**. During repeated runs not captured in the published file, `auto` queued very early in a run | Always pass `mode: queue`. Treat `queued` as receipt, and still handle 409/429/503 as retained work |
| Deduplicate | `clientRequestId` | Durable across restart, but **scoped to the MCP client**: a new client creates a second run. Reuse with different content silently returns the original run | Use unique IDs and bind them to the credential |
| Read | `t3_thread_read` | Exact runs and statuses. Run IDs end `:ordinal:<n>`, which foreign-run detection parses. No observation time, only `createdAt`/`updatedAt` style fields | Order reads by when they were issued, not when replies land |
| Find a submission | `messageId` on read items | Ends with `:thread-send:<clientRequestId>`, for any client. **Not visible while the message is still in T3's queue** | Reconcile lost replies without resubmitting. Not found does not mean not accepted |
| Cancel | `t3_thread_interrupt` with `runId` | Without `stop`, targets the exact run. Unknown run: `run_not_found`. Queued run: `thread_not_interruptible`, including one stranded on an idle thread. A delayed or repeated interrupt of a finished run reports its status and leaves the next active run running | Always pass `runId`, never `stop`; `interrupt_requested` is not terminal |
| Hold T3's queue | `stop: true` on interrupt | A plain interrupt starts the next queued run. With `stop`, the run ends `interrupted` and queued runs stay `queued`. **But `stop` ignores `runId`: a delayed interrupt of a finished run interrupted the next active run**, the race this contract must prevent | Never send `stop`. Hold work in Pardner, so T3's queue never holds it |
| Remove queued work | `t3_queue` `cancel` | The run becomes `cancelled`. A second cancel fails with `orchestration_error` | Use it for a run T3 refuses to interrupt |
| See an approval | `pendingRequestCount`, `approval_request` item | Thread stays `running`, with the item `waiting`. Not listed by `t3_pending_request`. The count can outlive the run, and a run can show `waiting` just before finishing with nothing pending | Derive `blocked` from a `waiting` item on that run, not the count or run status |
| Decide an approval | T3 UI | Approve and Decline reach the provider. `respond` with the item's ID or the request ID inside it gets `invalid_request` and leaves the approval pending, and the tool description says it cannot approve | Show the block and send the person to T3 |
| Answer input | `t3_pending_request` | Listed and answerable over MCP | Answer only with explicit human authority |
| Survive a crash | Server restart | See below | Treat restart as a boundary needing reconciliation |
| CLI | `t3 thread list/start/send/show` | Has no request ID or interrupt | Unsuitable for dispatch; use MCP |

Among the nine tools with published definitions, these were not exercised:
`t3_thread_wait`, `t3_thread_list`, `t3_queue` `read`, `edit`, `reorder` and
`promote_to_steer`, `t3_pending_request` `read`, how T3 restarts a queue held by `stop`,
reads long enough to page, and sending from a limited client to a thread with a broader
mode. Token renewal and the `no_active_run` interrupt reply in the schema were not seen.
The other 57 tools are inventoried by hash only and were not qualified. That includes `task_cancel` and child threads, which the tool descriptions
treat differently: interrupt is for top-level threads, and sending to a finished child starts
a new task. `thread_not_sendable` was seen only while steering a run too early, in runs not
captured in the published file. How T3's own UI sends a message was not exercised.

### After a T3 crash

Observed after SIGKILL of the T3 server:

- An active run becomes `cancelled`. **T3 may then start its own new run**, posting
  "T3 Code restarted and resumed this turn". Pardner did not request this run, and it
  may repeat external effects. Across repeated runs, including ones not captured in the
  published file, it appeared sometimes and not others, for reasons not established, so
  neither outcome can be assumed.
- An approval-blocked run becomes `cancelled` and had not resumed 5 seconds later.
  The pending approval is gone, so it needs a new decision.
- A run queued before the crash stayed `queued` while the thread reported
  `completed`, 5 seconds later. Thread status alone does not show this.
- MCP sessions are forgotten (HTTP 404), though the credential remains valid.

Separately, after interrupting an approval-blocked run, `pendingRequestCount` stayed at 1
with no active run, and later work still ran. The count carried into that later run. This
used the scripted provider, which reports the request resolved; a real provider may differ.

## Execution states

[`lib/t3-execution.js`](../lib/t3-execution.js) is the reference contract for the
project pane in [issue #77](https://github.com/depatchedmode/pardner/issues/77). It is not
yet connected to the CLI, service or UI.

| State | Meaning | Not implied |
| --- | --- | --- |
| `queued` | Intent is durable in Pardner and awaiting submission. A retried intent may already be in T3, so cancelling it returns `unknown` | Receipt by T3 |
| `submitting` | Saved immediately before the request | Acceptance |
| `running` | T3 returned or reconciled an exact run that is not blocked. Includes runs T3 reports as queued or starting | Progress or success |
| `blocked` | A `waiting` request item exists on this run: `approval_request` (decide in T3 through `thread.link`) or an input request (answerable over MCP). The contract does not distinguish them | That anyone has been told |
| `cancel_requested` | Hold saved and interrupt being requested. If T3 refuses, is busy, or does not confirm removing a queued run, the row returns to its prior state with the reason, and the hold stays. On a blocked run, the next read replaces that reason. An inconclusive interrupt throws and leaves this state, and `cancel` can be repeated | That the run stopped |
| `terminal` | A fresh read reported `completed`, `failed`, `interrupted`, `cancelled` or `rolled_back`, or the intent was cancelled before submission, or the owner abandoned an unknown | Artifact or human acceptance, or rollback of partial effects |
| `unknown` | Acceptance cannot be established or the run has vanished; the thread's context is blocked | Non-acceptance |

The contract is passive: **the caller must poll `observe`, call `reconcile` on startup and
after a lost reply, and call `pump`.** Nothing runs on its own, and `observedAt` marks when
a reply arrived, so a slow reply can look fresher than it is.

Rules the contract enforces:

- Authorization happens before persistence. A wrong route leaves no record and
  makes zero submissions.
- Each thread has one controller per ledger, checked at open and on every operation, and
  each open has one route and Actor per thread. Routes are constructor input, so the caller
  owns persisting them. A second owner gets `CONTROLLER_CONFLICT`, and nothing reassigns ownership yet. Run one
  process per controller: reopening a ledger treats its in-flight sends as crashed.
  Dispatch rechecks the route, so revoked work stays queued. A local write failure after
  a send surfaces as `unknown` on the next read.
- Only one submission is in T3 at a time, and only after a fresh read shows no active
  or queued run. State changes are guarded, so work cancelled during that read is not
  submitted, and each change is logged.
- A dispatcher that cannot be locked out, such as a person typing in T3, a separate
  ledger or T3's restart resume, appears as an unrecognized run and holds the thread.
  Steering or restarting the active run creates no new run, so it is not detected.
  An owned run cancelled or interrupted by anything else holds it too, closing the
  gap before T3's resume appears. `release` must name every unrecognized run, is refused
  if a new hold arrives during its read, and stores the evidence. A queued run nobody
  owns keeps the thread busy until `removeQueuedRun` takes it out.
- After a lost reply or crash, recovery looks for the exact request. If it is found,
  the record takes that run. If not, the outcome stays `unknown`. Only an owner's
  `resolve` can continue. `retry` checks for the request again and reuses the original
  ID. After re-pairing it is refused, at `resolve` and again at submission, because T3
  would not deduplicate it.
- Cancellation saves its hold before a plain interrupt of the exact run. Only a later
  fresh read makes it terminal. Held work needs an explicit `release`. A plain interrupt
  can start a queued run this controller does not own, which then holds the thread.
- A read issued before one already applied is dropped, however late it lands, and cannot
  authorize a submission. A read issued before acceptance cannot mark a run absent.
  Terminal is final.

Safe unknown handling is safety, not automatic recovery.

## Evidence

The published live qualification passed all of its checks against 0.1.5 on Node
24.11.1; see `summary` in the JSON. Observations are listed separately and not counted
as passes. A
lost acknowledgement ran against real T3: T3 accepted the send, the reply was
discarded, and reconciliation found the exact run with one provider turn.

`test/t3-execution.test.js` holds the deterministic fixtures, using real SQLite and a
scripted T3 modeled on these observations: wrong route, busy and 409 retention (T3 itself
never returned a 409, and treating 429 and 503 as not accepted is an assumption),
competing receivers and concurrent pumps, crash before send, crash after
acceptance before local persistence, lost acknowledgement, retry after re-pairing,
stale and out-of-order reads, cancellation races, refused interrupts, and T3's restart
resume. Controller crashes there are simulated by closing the ledger, with a row
patched back to `submitting` where needed. The process kills in the live script target
T3, not the controller.

## Limits

- **The provider is scripted.** This qualifies T3's behavior, not Codex, Claude or
  any model. A real provider may resume differently after a crash; this one has no
  durable history and treats Decline like Approve after recording it, so the check
  proves the decision reached the provider, not what a provider does with it. The
  approval policy is checked at the provider boundary, but no real sandbox enforced it.
- **A scripted browser decided the approvals.** It used T3's real UI with no bypass,
  but no person was involved. Live human approval, restart and cancel proof belongs
  to [issue #79](https://github.com/depatchedmode/pardner/issues/79), after owner approval.
- **Scope of the crash tests.** They kill T3's whole process group, provider included. They
  do not cover power loss, a provider or T3 crash on its own, or a machine restart. Issue #79's attempts restart
  the controller, so T3's resume with a real provider still needs an explicit owner there.
- **Baseline.** Runs are recognized against the highest run seen on the first read, so
  call `observe` when mapping a thread. Runs started before that count as prior history.
- **Read window.** Reads request the 50 most recent runs, so an owned run older than that
  reads as absent and becomes `unknown`. Poll often enough to avoid this.
- **Lost launch replies.** Repeating the launch request ID returns the same thread, but
  the contract does not manage this.
- **Not qualified:** adopting or controlling existing Desktop chats, child threads, other
  providers, remote environments, or the routing and review contracts in
  [#58](https://github.com/depatchedmode/pardner/issues/58) and
  [#66](https://github.com/depatchedmode/pardner/issues/66).
- **Restart resume against the contract.** Whether T3 resumes varies per run, so a
  given evidence file may show the contract's extra hold only through the fixtures.
- **Single-writer limit.** Pardner detects another dispatcher only after its run
  appears, so it cannot prevent one.
