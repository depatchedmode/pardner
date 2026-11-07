# UX auto-improve ledger

The repository is public, so narrated videos are stored outside it, in the owner's local Movies folder (`pardner-ux-auto-improve/round-N/`). Commits are on branch `ux-skill-pack-run`. No pull requests were opened: the branch has not been pushed, and pushing is the owner's call.

| Round | Date | Section | Commits | Video | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-07 | Activity view and task History | `d3518ea5`, `205b2719`, `dfd334f3` | `round-1/activity-history.mp4` (79 s) | merged on branch |
| 2 | 2026-11-07 | Comments, @mentions and unread state | `0d3b6c1f`, `b1c66222`, `f147724e`, `84f92442` | `round-2/comments-mentions.mp4` (76 s) | merged on branch |

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
