# UX auto-improve ledger

The repository is public, so narrated videos are stored outside it, in the owner's local Movies folder (`pardner-ux-auto-improve/round-N/`). Commits are on branch `ux-skill-pack-run`. No pull requests were opened: the branch has not been pushed, and pushing is the owner's call.

| Round | Date | Section | Commits | Video | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-07 | Activity view and task History | `d3518ea5`, `205b2719`, `dfd334f3` | `round-1/activity-history.mp4` (79 s) | merged on branch |

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
- For the full `node --test` on the integrated branch, see the round report.

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
