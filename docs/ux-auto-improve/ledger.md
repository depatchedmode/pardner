# UX auto-improve ledger

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`). People now open the board only through the local
> client (`pardner open`), and phones pair through the client's **Pair a phone**
> companion; see the [client guide](../PARDNER-CLIENT.md) and the
> [phone companion guide](../PARDNER-LAN.md). The findings and evidence below are
> kept unchanged.

The repository is public, so narrated videos are stored outside it, in the owner's local Movies folder (`pardner-ux-auto-improve/round-N/`). Commits are on branch `ux-skill-pack-run`, rebased onto `main` (`b3c36fc0`) on 2026-11-08; the SHAs below are the rebased ones (pre-rebase tip kept at `backup/ux-skill-pack-run-pre-rebase`). No pull requests were opened: the branch has not been pushed, and pushing is the owner's call.

| Round | Date | Section | Commits | Video | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-07 | Activity view and task History | `98a9d66f`, `82fd33a4`, `ee600bb8` | `round-1/activity-history.mp4` (79 s) | merged on branch |
| 2 | 2026-11-07 | Comments, @mentions and unread state | `437f7591`, `8e6e4ea1`, `7c7a6896`, `7badb746` | `round-2/comments-mentions.mp4` (76 s) | merged on branch |
| 3 | 2026-11-07 | Hand off work | `db6758c4`, `13635ae1`, `dff17008` | `round-3/hand-off.mp4` (83 s) | merged on branch; acceptance gate owed |
| 4 | 2026-11-07 | Task status and close-out (#115) — loop 2, iteration 1 | `9263f4c8` | `round-4/status-close-out.mp4` (58 s) | merged on branch |
| 5 | 2026-11-07 | Goals view: verdicts, goal status, conflicts (#131, #143) (loop 2, iteration 2) | `24655dbc`, `19e82720`, `79771f4e` | `round-5/goals-verdicts-conflicts.mp4` (69 s) | merged on branch |
| 6 | 2026-11-07 | New task panel (#139, #120, #121) (loop 2, iteration 3) | `919e9d4a`, `a71c8fc6`, `8a1d9449` | `round-6/new-task.mp4` (80 s) | merged on branch |

## Round 1 — Activity view and task History

**Why.** Activity rows began with raw operation names (`comment.add`, `task.update`). Task History printed JSON field diffs, including internal fields like `order: null → 1794…`. The feed couldn't be filtered and rendered every operation; one walk produced a 37,085px page. This round continues #118 and #133.

**What changed.**
- `ui-prototype/src/events.js` is a pure module that describes every operation type as a plain sentence, with fallbacks for unknown types, missing records and deleted comments. It has 31 unit tests.
- Activity and History share one `EventRow`. Rows read like "Alice Moreno moved *Task* to [Review]". Subjects are links, status changes show as pills, and Activity shows a short quote from each comment or handoff.
- History lists newest first and never shows raw values. It drops `comment.add` rows (the Comments section already covers them) but keeps commit links, because Evidence doesn't show who made them or when.
- Activity has **Performed by** and **Show** filters, and read receipts are hidden by default. Entries are grouped under day headings and loaded 100 at a time ("Showing N of M", **Show older activity**). Paging uses a cutoff, so rows a user has already opened are never unmounted.

**Tests.**
- New tests: `test/event-copy.test.js` (31) and two Chromium UI regressions, "describes Activity and task History as plain sentences" and "filters, groups and pages the Activity feed".
- Updated tests: the frame test and the V4 focus-return test, neither weakened.
- `npm run test:ui` passes 26/26 in Chromium and WebKit on the package branch.
- The full `node --test` on the integrated branch passed 405/405. A first run was killed after `workspace-runtime.test.js` hung under machine load; that file passed 6/6 when rerun alone.

**Hand tested.** Activity at 1440 and 375, and History, on a seeded hub. The idempotent seed script used for testing and recording lives in the session scratchpad and is not committed.

**Process.**
- A Sonnet reviewer proposed 8 changes, and the lead verified the cited code.
- An Opus judge approved 3 packages. It changed several proposals: the page size became 100, the filter label became "Performed by", History gets no quotes (to avoid exact-text collisions in the acceptance script), and link-commit rows stay in History. It rejected collapsing History, removing the h2, and the Workspace menu (#114).
- Sonnet implementers built the packages, and the lead merged them after reading the diffs and screenshots.

**Deferred.**
- CLI `activity --type`, plus total/hasMore counts (#133 F-134-03).
- Vein and goal detail views with their own history.
- Activity deep links.
- A live "N new" indicator.
- Seeding `comment.resolve` and the `*.resolve` conflict rows, and backdated days so the Yesterday and older headings can be checked by hand.

**User stories now addressed.** "When did the reviewer last approve something?" (STORY-134). "What changed on this task, readably?" (STORY-129, STORY-131).

**Unverified.**
- Goal-subject focus and scroll were not hand tested.
- The P3 test runs in Chromium only.
- The 20-seed acceptance gate was not run, because this machine was under load from other sessions.

## Round 2 — Comments, @mentions and unread state

**Why.** Posting a comment immediately showed "1 unread for alice" (#117). That false signal appeared on every post and taught people to ignore the counter. Unread comments had no visible marker. A mistyped `@handle` saved silently and notified nobody (#134). With no Actor chosen, the panel said "20 unread for this Actor".

**What changed.**
- **Server (read-only, additive).** Each comment in the task context now carries `unreadRevisionIds`. The public `unreadCount` and CLI output are unchanged, and nothing new is written durably.
- **Browser.**
  - The Comments heading reads "Comments 14 · 6 new". Your own revisions are excluded, judged per revision, so another Actor's edit to your comment still counts as new.
  - Each new comment carries a "New" tag and an accent border.
  - "Mark all read" replaces "Mark displayed comments read" and appears only when an Actor is chosen. The separate unread line is gone.
  - Comment cards are denser.
- **Composer.** While typing, it warns "@buildr matches no Actor and won't notify anyone." Delivered mentions render as chips, built from the actual deliveries rather than from the text. Code, links and email addresses stay plain.

**Tests.**
- New: `test/workspace-operations.test.js` (unread revisions, concurrent revisions, deleted comments, the `unreadCount` invariant), `test/ui-comments.test.js` (9), `test/ui-mentions.test.js` (11).
- `test/pardner-ui.test.js`: the "1 unread for alice" assertions were rewritten so they still prove that two Actors' read state is independent.
- The CLI `unreadCount` contract (`test/pardner-cli-workflow.test.js:34-37`) and `scripts/acceptance.js:263-264` are untouched.
- The full `node --test` on the integrated branch passed 426/426.

**Hand tested.** Comments as Alice and as Bob, at 1440 and 375 wide, using the idempotent seed thread. The thread includes valid, mistyped, emailed, backticked and linked handles, a self-mention, a comment edited by another Actor, and partial reads.

**Process.**
- A Sonnet reviewer proposed 8 changes. The lead verified that `unreadCount` counts own comments and that the CLI and acceptance contracts pin that number.
- An Opus judge ruled out both proposed semantic fixes:
  - an implicit author receipt (a durable write);
  - an author-excluding `unreadCount` (changes public output).
  
  Instead it chose a raw read-only server field, with the "not mine" rule applied in the browser. It also rejected scrolling to the new comment, rejected removing the visible "Comment" label (WCAG 3.3.2), and deferred editing comments in the browser.
- Three Sonnet implementers built the work; the lead merged it after reviewing the diffs and screenshots.

**Deferred.**
- Editing your own comment in the browser (#128). It needs an error slot, a refocus target, STALE_UPDATE draft handling, and a decision on how edits affect mention delivery.
- Unread or new indicators on board cards.
- Handle autocomplete.
- Mentions inside code still deliver. This is a known mismatch with the chip rules and is documented.
- #111: the Hand off form pushes Comments down the panel.

**Video notes.** The highlight ring on the Comments heading is slightly clipped at the top edge. One caption covers a timestamp. The "Mentions look like text" ring surrounds the whole line rather than the token.

**Unverified.** The `comments.js` unit tests were written before the module, but were never run red. The 20-seed acceptance gate was not run.

## Round 3 — Hand off work

**Why.**
- The Hand off form was always expanded. It took about 430px of every Task details visit and pushed Comments below the fold (#111).
- The status always defaulted to Review, so handing over a Completed task silently reopened it.
- After a successful handoff, the form stayed filled in.
- The stale-draft notice took 190–260px.
- Escape threw away typed drafts (#121), and pressing Escape inside the pairing dialog also closed the task panel.

**What changed.**
- **Collapsed form.** **Hand off work** is now a button next to **Edit task**. Opening it focuses Recipient. **Cancel handoff** resets the form. A successful handoff collapses it to "Handed off to Builder · agent · Review." The submit button is now the primary action, still named **Hand off**.
- **Error slots (V3).** When the form is closed, errors and Retry fall back to the panel, so a pending request is always reachable.
- **Status default** comes from the task: In progress → Review; every other status stays as it is. "Use latest task details" re-derives an untouched status. The stale notice is one line, and the deliberate re-confirmation (commit 92a117d1) is unchanged.
- **Escape** no longer closes the panel when the focused text field has content, or when focus is inside a dialog. On buttons, selects and empty fields it closes the panel as before.

**Tests.**
- New: `test/ui-handoff.test.js`, plus three Chromium/WebKit UI tests: collapse/success/Retry, status defaults, and Escape safety.
- Updated, without weakening anything: an extra "Hand off work" click at `pardner-ui` ~82, `scripts/acceptance.js` ~179, and one phone test whose panel no longer overflowed.
- `npm run test:ui`: 32/32 on the integrated branch. Full `node --test`: 433/433.

**Not run: the 20-seed acceptance gate.** It is owed because `scripts/acceptance.js` changed (one extra click before the browser handoff). Run `npm run test:acceptance -- --repeat 20 --seed 1` under Node 24.11.1 on an idle machine. This machine's load average stayed at 7–8 because of other sessions.

**Process.**
- A Sonnet reviewer made 8 proposals.
- An Opus judge narrowed them:
  - The button is named "Hand off work" to avoid colliding with "Hand off".
  - Only In progress → Review changes the default.
  - "Hand off anyway" was rejected, because it would defeat the deliberate stale re-confirmation.
  - The Escape fix was narrowed to keep the existing Escape tests.
  - The header status select (#115) was deferred.
  - Sticky composer and StatusSelect DRY were rejected.
- Two Sonnet implementers worked in parallel. The lead resolved a test-file conflict between them.

**Deferred.**
- #115: a one-click Complete or status select in the header.
- Drafts lost when switching Actor (#121 F-019-02; the drafts need lifting out of the keyed panel).
- Opening the form automatically when a draft exists.

**Video notes.** In the "before" clip, Comments sat at the very bottom edge rather than fully below the fold, so its caption reads "Comments pushed down". The "Draft lost" caption sits over the board, because the panel is gone at that point.

## Round 4 — Task status and close-out (#115)

The second `/loop` started this round. It was a separate `Skill ux-auto-improve` invocation.

**Why.** To close out a task, a reviewer had to:
1. Click **Edit task**.
2. Work through a six-field form, which opens with focus on Title.
3. Set **Status**.
4. Click **Save changes**.

That is four steps for one field. The status itself was plain muted text in the details line, so nothing suggested it could be changed (#115; STORY-018, -021, -030, -104).

**What changed.**
- A **Status** select now sits first in the Task details actions row, labelled "Status" both visibly and for assistive tech. Choosing a value sends one `task.update {status}` with its expected revision. Closing out a task is now a single change, and focus returns to the select.
- The details line drops the status word while the select is visible.
- The select is hidden in these cases, so only one status control is on screen at a time:
  - no Actor is chosen;
  - **Edit task** is open;
  - **Hand off work** is open;
  - the status field has a conflict.
- Errors and **Retry saved request** use the existing panel slot. A shared `StatusOptions` helper now supplies the four status lists.

**Tests.**
- New: `test/ui-task-status.test.js`, plus Chromium and WebKit UI tests for close-out (at 1440 and 375), mutual exclusion, the 375 layout, the stale case (shows **Dismiss**, nothing overwritten), and the lost-response case (Retry replays the same `operationId` once).
- Existing acceptance and phone steps that go through **Edit task** are unchanged.
- `npm run test:ui`: 36/36. Full `node --test`: 438/438.

**Process.**
- A Sonnet reviewer proposed 8 changes.
- An Opus judge approved one package. It moved the select out of the details line into the actions row with a visible label (WCAG 3.3.2), and deferred an inline Priority select.
- The judge rejected:
  - removing the panel SaveStatus, because it is durability UI;
  - dropping Title autofocus in Edit, because that was V4 criterion 3;
  - a separate "Complete" button;
  - a "Moved to Completed." line.

**Deferred.**
- Inline Priority.
- Rendering a real two-replica status conflict in the UI tests. Only a unit test covers it.

**Note.** On Windows and Linux, an arrow key on a closed select fires `change`, so one stray arrow press saves a change. The judge accepted this because status changes are reversible and recorded in History.

## Round 5 — Goals view: vein verdicts, goal status and goal/vein conflicts (#131, #143)

**Why.** The Goals view was read-only.
- "Ready for a verdict" asked the user to act, but recording a verdict took four CLI calls.
- When two people recorded different verdicts on separate replicas, the vein pill showed only one of them. Nothing said who disagreed, and resolving it took three CLI calls (STORY-049, -050, -053, -068, -069).

**What changed.**
- **Status selects.** Each vein and goal gets a select named "Status of vein {title}" or "Status of goal {title}". These names avoid colliding with the Task details "Status" control, which can stay open over Goals. Each select sends `vein.update` or `goal.update` with its expected revision. The selects are disabled while a request is busy or pending, and nothing cascades between goals, veins and tasks.
- **Errors** for goal and vein operations now appear in that goal's or vein's row, never inside an unrelated task panel.
- **Disputed status.** The pill reads "Dead end or Proven". A closed "Conflicting edits: status" disclosure lists each value with its authors and a "Keep {value}" button, which calls `vein.resolve` or `goal.resolve`. Identical concurrent values collapse into one Keep. A vein whose goal is disputed stays listed under both goals, each naming both goal titles.
- **375 fix.** The status selects no longer clip "Dead end" or "Abandoned".

**Tests.**
- New `support/replica-workspace.js`: the first browser harness that runs a real hub and two replicas through a partition. A characterization test covers the existing task-conflict UI.
- Four browser conflict cases: vein status, goal status, vein goalId, and stale Keep.
- `test/ui-record-status.test.js` and `test/ui-record-conflicts.test.js`.
- `npm run test:ui`: 46/46 on the package branch.
- Full `node --test` on the integrated branch: 446/448. The two failures were `pardner-connection-ui` (pairing recovery) and `pardner-ui` ("uses shared browser operations", a strict-mode duplicate match on a comment's text). Both ran while the video recorder had services up. Rerun alone, both files passed twice, and the `pardner-ui` test passed 5 more times. It is recorded here as **flaky under load**; a short-lived duplicate comment render is not ruled out and should be watched.

**Process.**
- A Sonnet reviewer proposed 8 changes.
- An Opus judge found that a task panel can stay open over Goals, then required page-unique names and record-row error routing. It required both busy and pending to disable the controls, turned the always-open conflict panel into a closed disclosure with one Keep per value, kept a disputed-goal vein listed under both goals, and asked for a real two-replica browser harness first.
- Sonnet implementers built WP1 and WP2 in parallel, then WP3.

**Deferred.**
- Moving tasks between veins, and moving a vein to another goal, in the browser.
- Moving the task and comment conflict blocks onto the shared component, now that a harness exists.
- `partition()` in the harness should wait for `!syncPending` before stopping the hub. A test works around this today.

**Video notes.** The goal-conflict disclosure is visible but not opened on camera. The Keep shown is the first button.

## Round 6 — New task panel (#139, #120, #121)

This round is the third and last iteration of the second `/loop`.

**Why.**
- Closing New task, or clicking a card, threw away the draft (#121).
- Escape did nothing on New task (#120).
- The panel covers the header Actor select, so the form never said who was creating the task. With no Actor, Create stayed enabled and then failed.
- While a create was saving, only the button faded.
- A description over 100 kB failed with "Send a valid JSON request." (#139).

**What changed.**
- **Draft kept until created or discarded.** The New task draft now lives in memory in the workspace. It survives Close, card clicks, Activity links and Actor changes. It is cleared only by a confirmed `task.create`, including a replayed Retry (cleared inside `submit()`, so there is no duplicate-create hazard), by **Discard draft**, or by **Forget this workspace**. It is never persisted.
- **Saving state.** While saving or pending, the fields lock, the button reads **Creating…**, and the form is marked `aria-busy`.
- **Escape.** Escape now closes New task unless a text field has content. This uses the round-3 guard, now shared as `escapeKeepsPanel`.
- **Activity links.** Opening a task from Activity closes New task, so two panels no longer stack.
- **Actor line.** The panel shows "Creating as {Actor}". With no Actor it says "No Actor chosen. Close this panel and choose one in the header; your draft is kept." and disables Create.
- **Pre-flight notices.** These two notices no longer add "Your last confirmed data remains available.":
  - "Choose the Actor making this change."
  - "Resolve the saved request before starting another change."
- **Oversized requests.** The server answers 413 INVALID_ARGUMENT with "This change is larger than the 100 kB request limit. Shorten it and try again."

**Tests.**
- New UI tests in Chromium and WebKit:
  - draft kept, restored, discarded and cleared on create, through a lost-response Retry, and after Forget;
  - busy and lock behaviour;
  - Escape cases;
  - the Actor line and the no-Actor state;
  - the pre-flight notice suffix;
  - Activity stacking;
  - a 110 kB UI case.
- New server test in `test/error-resilience.test.js` (413 and the malformed-JSON 400).
- `npm run test:ui`: 54/54. Full `node --test`: 457/457, with the recorder running at the same time.

**Process.**
- A Sonnet reviewer proposed 8 changes.
- An Opus judge found that a lifted draft cleared from the form, rather than inside `submit()`, would duplicate a Retry. It moved the clear point and added the lock while pending.
- The judge rejected Cancel (ambiguous with a kept draft), a textarea Title (breaks Enter and IME input), a taller Description, a length counter, and a "Draft restored" note. It deferred the sticky footer.
- V4's "no Escape on New task until #121" condition is now met by the kept draft.

**Deferred.**
- Sticky actions footer at 667×375.
- The oversize alert still ends with "Your last confirmed data remains available." because it is a server error.

**Note.** This branch has no lifecycle source-hash check, unlike `main`'s newer base. The earlier held-back `GET /` → `/pardner/` redirect could be applied here without drift; that is still the owner's call (#116).

## Rebase onto main and re-recorded videos (2026-11-08)

- **Rebase:** the branch was rebased onto `main` at `b3c36fc0`. All 42 commits were kept, plus 4 follow-ups:
  - `30a3bb2b`: the replica fixture now uses main's replica credentials.
  - `124a69e9`: in the context test, the concurrent comment revision is now the author's own, because main allows only authors to edit their comments.
  - `62e6cef4`: lifecycle-model drift for the 413 change was reviewed per `verify-lifecycle-model` and accepted. Nothing changed semantically.
  - `00218d76`: the verify plan now classifies the new UI fixtures.
- **Verify:** `npm run verify` under Node 24.11.1 passed: 716/716 tests, then one acceptance scenario.
- **Videos:** all six were re-recorded on the rebased checkouts (each round's parent vs its last code commit), with the same seed data on both sides.
  - The UI now opens on main's pairing screen and shows the Control tab.
  - Seeds now make comment edits as the comment's author, because main's CLI rejects edits by anyone else.
  - Round 5 now also opens and resolves the goal conflict.
  - Round 6 now also shows "Creating…" and the no-Actor state.
  - The previous recordings are kept beside the new ones as `*-pre-rebase.mp4`.
- **Still owed:** the 20-seed acceptance gate. Load was above 100 during this work.
