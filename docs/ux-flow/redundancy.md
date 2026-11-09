# Redundancy and IA critique

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`). People now open the board only through the local
> client (`pardner open`), and phones pair through the client's **Pair a phone**
> companion; see the [client guide](../PARDNER-CLIENT.md) and the
> [phone companion guide](../PARDNER-LAN.md). The findings and evidence below are
> kept unchanged.

> **Evidence archived.** Screenshots, per-story and per-page reports from this run were moved out of the repository; the findings below stand on their own text, and filed issues carry the details.

Scope: the Pardner browser UI (`ui-prototype/src/Pardner.jsx`, `PhoneAccess.jsx`, `ui-prototype/index.html`) and the CLI surface (`lib/cli.js`). Lead list: `docs/ux-paths/catalog.md` → "Redundancy Candidates" (line 5211). Heuristics: `simplification-heuristics.md` #8–#16.

Evidence: a seeded hub at `http://127.0.0.1:8004/pardner/`, signed in as Alice, read-only (no tasks created or edited). Screenshots (now archived outside the repository) were:

| File | Surface |
|---|---|
| `01-opening-fresh.png` | Opening screen in a fresh context (loopback, no credential) |
| `02-board.png`, `02b-board-full.png` | Board at 1440×900 |
| `03-goals.png` | Goals view |
| `04-activity.png` | Activity view |
| `05-task-details-top.png`, `-scroll1.png`, `-scroll2.png` | Task details for "Add latency instrumentation to checkout", scrolled in full |
| `06-new-task.png` | New task panel |
| `07-pair-dialog.png` | Pair another device dialog. LAN is disabled, so only Network settings shows. |
| `08-goals-with-assignee-filter.png`, `09-board-via-goals-vein.png` | Vein filter route comparison |
| `10-mobile-board.png`, `10b-mobile-board-full.png` | Board at 390×844 |

Measured geometry (Playwright `getBoundingClientRect`):

| Viewport | Header | Workspace actions row | Nav + filters | First card top |
|---|---|---|---|---|
| 1440×900 | 0–110 | 110–166 | 166–267 | **321** |
| 390×844 | 0–170 | 170–284 | 284–592 | **646** (77% of the first screen is chrome) |

Task details section offsets from the top of the panel (desktop / mobile): Hand off work 413 / 449, **Comments 842 / 890**, Evidence 1417 / 1520, History 1566 / 1670. Total height 2217 / 2334.

Effort: **S** means copy, CSS or one component. **M** means a component restructure or behaviour change with tests. **L** means a new surface or a cross-layer change.

---

## Duplicate Paths

### P1. Changing status has three UI routes, and one of them changes status without being asked to. **Drift.**
- Routes: Task details → **Edit task** → **Status** → **Save changes**; Task details → **Hand off work** → **Handoff status** → **Hand off**; **Keep this status** (conflicts only). In the CLI: `update --status`, `handoff --status` and `resolve --field status`.
- **Handoff status** defaults to `review` whatever the task's current status is (`Pardner.jsx:752`; visible as "Review" in `05-task-details-top.png` for a task that is **In progress**). So every handoff is also a status change unless the user notices and re-picks. "Handing off to myself with Completed" (catalog Duplicate paths #1) is the result of the form offering a status selector that duplicates Edit task.
- The routes do not give the same result. Edit task writes a field and nothing else. Hand off also writes assignee, adds a comment and creates a delivery.
- **Recommendation:** Make **Edit task** the canonical place to change status. In Hand off, default **Handoff status** to the task's current status, with the option label "Keep current status (In progress)". Keep the selector as an accelerator, not a second editor. **Keep this status** is a resolution action, not a duplicate, so keep it. **Effort S.**

### P2. Reassigning has two UI routes with different side effects. **Drift.**
- **Edit task** → **Assignee** changes the owner silently: no comment, no delivery (`Pardner.jsx:836-842` sends only `task.update`). **Hand off** changes the owner, posts a message and creates a delivery (`:912-918`). Both forms are on the same panel at once (`05-task-details-top.png`: Edit task button, then the open Hand off form directly below).
- A user who reassigns through Edit task never learns that the recipient was not notified. The catalog notes that **New task** → **Assignee** creates no delivery either (STORY-023/033).
- **Recommendation:** Make **Hand off** the canonical reassignment. In the Edit task form, replace the **Assignee** select with read-only text plus a "Hand off…" link that opens the handoff form prefilled. Alternatively, keep the select but show "Bob won't be notified. Use Hand off to send a message." when it changes. Leave New task as it is. **Effort M.**

### P3. Filtering to a vein through Goals and through the nav select gives different boards. **Deliberate but invisible.**
- Verified live: with **Assigned to** set to the first Actor (`08-goals-with-assignee-filter.png`), clicking **Edge caching** in Goals cleared **Assigned to** and set **Vein** (`09-board-via-goals-vein.png`; logged `assigned='' vein=vein-883e…`). Picking the same vein in the nav **Vein** select keeps the other filters (`Pardner.jsx:471`).
- The code comment at `Pardner.jsx:388` ("Each board preset sets every filter, so a stale one never hides its tasks") shows the reset is intended. The problem is that nothing on the board says a preset replaced the filters.
- **Recommendation:** Keep both routes. The Goals link is a preset and the select is a refinement. On the board, show the active filters as a chip row ("Vein: Edge caching ×"), so either route leaves a legible, reversible state. **Effort S.**

### P4. Four connect routes, two primary buttons, and the default one can't work on loopback. **Drift.**
- `01-opening-fresh.png`: **Pair this device** and **Connect** are both `.primary` (`Pardner.jsx:361`, `:368`). On loopback, `canManageAccess` opens the token `<details>` (`:363`), but the pairing form still comes first and is styled as the main action. LAN is off (`07-pair-dialog.png`), so no pairing code exists.
- The QR `#pair=` link and **Copy address** are accelerators of the pairing-code route (the same `pairDevice`, `:147-158`), so they are fine.
- **Recommendation:** Pick one primary by context. If `canManageAccess` (service computer), show the token form first and as primary, with pairing collapsed. Otherwise (LAN device), show the pairing code as primary and collapse the token form. **Effort S.**

### P5. Forget this workspace appears in two places. **Mostly deliberate.**
- The opening screen (`Pardner.jsx:378`, shown only when a credential exists but the doc has not loaded) and the header actions row (`:438`). The opening-screen button is a real escape hatch when a stored credential is stale, so keep it. It is the copy suspected of throwing (catalog D1: `showBoard` is used at `:329` but declared at `:389`).
- **Recommendation:** Keep both. Fix D1. Demote the header copy into a workspace menu (see H1). **Effort S** (D1 fix plus the move).

### P6. Three triggers mint a pairing code and invalidate each other. **Drift.**
- Opening the dialog auto-mints a code (`PhoneAccess.jsx:22-24`). **Generate new code** mints another (`:54-57`, `:82`), and **Try again** re-runs `load` (`:63`), which mints again. Not reproduced live because LAN is disabled on the shared hub. This finding is from code only.
- **Recommendation:** Mint on open only if no unexpired code exists. Show **Generate new code** only after expiry or after an explicit "This code was used". **Effort M** (needs a server read of the current code).

### P7. Recovering a stale Edit task draft has three routes, all of which discard the draft. **Gap, not a duplicate.**
- After `STALE_UPDATE`, **Save changes** keeps resubmitting old revisions (`Pardner.jsx:839-841`, catalog D2). **Cancel edit** → **Edit task**, close/reopen and reload all discard the draft. The handoff form already has the right pattern: **Use latest task details** (`:929-931`).
- **Recommendation:** Add the same "Use latest task details" rebase to Edit task, so there is one canonical recovery that keeps the draft. **Effort M.**

### P8. CLI aliases and parallel commands. **Drift.**
- From `lib/cli.js`: `actors` = `agents` (`:173`), `activity` = `timeline` (`:202`), `mentions ack` = `mentions deliver` (`:216`, undocumented), and `--actor` = `--agent` (`OPTIONS` `:62`). Commit evidence has two routes: `link-commit` and `commit --task`, and only `commit` records model and session.
- **Recommendation:** Keep `actors`, `activity`, `ack` and `--actor` as the canonical forms. Either list the aliases in HELP as "(alias)" or drop them. AGENTS.md allows breaking changes. Make `commit --task` canonical and describe `link-commit` as "for commits made outside pardner". **Effort S.**

### P9. Conflict resolution: the UI is restricted, but the CLI accepts any value. **Divergent semantics.**
- The UI offers only **Keep this {field}** for each preserved alternative (`Pardner.jsx:875-903`). The CLI `resolve --value` accepts any value (`lib/cli.js` resolve branch; catalog D20).
- **Recommendation:** Treat "choose one of the preserved edits" as the canonical model. Have the CLI reject values that are not one of the alternatives, or rename it `resolve --choose <operationId>` and keep `update` for new values. **Effort M.**

**Clean:** **Retry saved request** is not duplicated. The ErrorNotice button and the pending notice are mutually exclusive (`Pardner.jsx:418-429`, `pending && !error`). **Close** vs Escape is a standard pairing; the only problem is that Escape discards drafts (catalog D6), which is a guard issue, not redundancy. **New task** has exactly one entry point.

---

## Duplicate Information

### I1. SaveStatus is rendered twice on one screen.
- Verified: with Task details open, the page has two `role="status"` regions that both read "Saved locally · synced" (header `Pardner.jsx:398`, panel `:809`; `05-task-details-top.png` top left and panel top). Screen readers announce every save twice.
- **Recommendation:** Keep the header copy as canonical. Remove it from Task details, or keep a visual copy without `role="status"` on mobile, where the panel covers the header. **Effort S.**

### I2. History repeats the Comments and Evidence sections and leaks internal fields.
- `05-task-details-scroll2.png`: the History rows "Builder · agent · comment.add" and "task.link-commit" have no content; the content is already in **Comments** and **Evidence** just above. The `task.create` row dumps `order: null → 1794071631205`, `type: null → "task"` and `tags: null → []`, which are internal fields the user never set.
- **Recommendation:** Make **Comments** and **Evidence** canonical for their facts. In History, render comment and evidence rows as one-line references ("commented", "linked a1b2c3d"), drop `order`, `type` and empty defaults from create, and humanise values (Up next, Builder). **Effort S.**

### I3. Two comment counts disagree on the same screen.
- `05-task-details-scroll1.png`: "Comments 2" and "2 unread for alice". The second comment was written by Alice herself, which confirms catalog D4 live.
- **Recommendation:** Use one line, "Comments 2 · 1 new", and exclude the reader's own comments. Fold **Mark displayed comments read** into that line. **Effort M** (the server `unreadCount` changes).

### I4. Board filters appear where they do nothing.
- `03-goals.png` and `04-activity.png`: **Assigned to**, **Status filter** and **Vein** stay visible and editable, but only the board reads them (`Pardner.jsx:384-387`).
- **Recommendation:** Render the filters only when `view === 'board'`. Better, make Activity honour **Assigned to** and **Vein** (see O2). **Effort S** to hide, **M** to apply to Activity.

### I5. The Actor roster appears in four selects with four labels and three empty texts.
- Header **Actor** ("Choose an Actor"), nav **Assigned to** ("All Actors"), New task / Edit **Assignee** ("Unassigned") and handoff **Recipient** ("Choose an Actor") (`Pardner.jsx:401`, `:459-466`, `:707-713`, `:934-939`; visible in `02-board.png`, `06-new-task.png`, `05-task-details-top.png`). The options are the same everywhere, which is fine. The labels are the issue, covered in H4. History shows raw IDs (`assignee: null → "builder"`, `05-task-details-scroll2.png`).
- **Recommendation:** Keep the four selects; they are different roles. Unify the labels (H4) and humanise History (I2). **Effort S.**

### I6. Startup copy repeats across three loaders.
- `index.html:10-12` ("Opening your workspace…"), `Pardner.jsx:95-99` (the same string) and `:372` ("Opening your local workspace…"). A slow load shows the same message twice with no sign of progress.
- **Recommendation:** Use one string, and make the second stage say what is happening ("Connecting to the local service…"). **Effort S.**

### I7. "Open Pair another device on the desktop" appears where that button does not exist, or where the user already is the desktop.
- `01-opening-fresh.png` (the service computer itself, on loopback) shows "Open Pair another device on the desktop to get a code." Also `index.html:12`, `Pardner.jsx:98`, `:374`.
- **Recommendation:** Show the advice only when `!canManageAccess`. On the service computer, point to the token in `connection.json`. **Effort S.**

### I8. Assignee, status and priority shown in the card and the panel meta line. **Acceptable.**
- `05-task-details-top.png`: the selected card and the meta line "Builder · agent · In progress · P1" are on screen together at desktop width. On mobile the panel covers the board, so the meta line is needed. The only real inconsistency is `p2` in forms vs `P1` on cards (`06-new-task.png`; catalog D26).
- **Recommendation:** Keep both. Uppercase the priority options. **Effort S.**

**Clean:** Vein membership (card label, "Veins: Edge caching (Open)" in details, "3 tasks" in Goals) is three read-only views of one fact at different zoom levels, and each is justified. The handoff stale notice repeats the current assignee and status on purpose (`Pardner.jsx:928`). The pairing code plus `#pair=` address in the dialog (`PhoneAccess.jsx:76-79`) serve two input methods, typing and copying, so they are fine (not visible live because LAN is off).

---

## Overlapping Features

### O1. Hand off work vs Edit task + Add comment.
- Same end state, different guarantees: Hand off is atomic with a delivery, while Edit + comment takes two operations and creates a delivery only with an `@mention`. In the UI the Hand off form is always expanded and sits between the description and Comments, which pushes Comments to y≈842 desktop / 890 mobile (below the fold on both).
- **Recommendation:** Make **Hand off** the single "give this to someone" feature. Collapse it behind a **Hand off…** button next to **Edit task**, so the panel reads description → Comments. With P2, Edit task no longer reassigns. **Effort M.**

### O2. Activity view vs task History vs CLI `activity`/`diff`.
- Activity lists every operation newest first with raw type strings ("Builder · agent · task.update", `04-activity.png`). History lists one task's operations oldest first with raw field diffs (`05-task-details-scroll2.png`). Both use the same row header format. Activity has no filter and ignores the visible nav filters (I4).
- **Recommendation:** Use one renderer with one ordering (newest first) and human verbs ("moved to Review", "commented"). Activity becomes History with the nav filters applied, and task History is that same view filtered to one task. CLI `diff` stays an agent-only view. **Effort M.**

### O3. Three notions of "waiting for me", and no UI for any of them.
- Assignment (card), mention delivery (CLI `mentions …` only, `lib/cli.js:210-218`) and read receipts ("N unread for …"). There is no "Mine" view; the closest is **Assigned to** = self, which takes three clicks and is reset by the Goals vein link (P3).
- **Recommendation:** Add a **Mine** preset (assigned to the current Actor, or mentioning them and unread) as the first view tab. **Effort L.**

### O4. CLI verbs: "mentions" vs "deliveries", and namespaced vs bare commands.
- The CLI's `mentions pending|claim-next|ack` calls `/automerge/deliveries/*` (`lib/cli.js:212-217`); HELP never says "delivery". Tasks mix `task create` with bare `update`, `handoff`, `resolve` and `comment`, while goals and veins are fully namespaced (`goal update`, `vein resolve`; HELP `:9-47`).
- **Recommendation:** Rename to `deliveries pending|claim|ack|release`, keeping `mentions` as an alias, and add `task update|handoff|resolve` with the bare forms as aliases. **Effort M.**

### O5. Pairing code vs service token. **Same secret, so this is a copy problem only.**
- Both routes hand the browser the shared `apiToken` (catalog Overlapping #10). The pairing UI ("Pair this device", "Pair another device") implies per-device credentials that do not exist, and Forget revokes nothing (catalog Duplicate paths #11).
- **Recommendation:** Keep both. Change the copy to say pairing "shares this workspace's access with the device", and say in the Forget confirmation that access is not revoked. **Effort S.**

**Clean:** Goals and Tasks do not overlap. Goals is a read-only index that links into the board.

---

## Hierarchy & IA

### H1. Rare workspace admin actions get a top-level row above the core navigation.
- `02-board.png`: **Pair another device** and **Forget this workspace** sit on their own row (56 px desktop, 114 px mobile stacked, `10-mobile-board.png`), styled exactly like the view tabs and above them. **Forget** is one unconfirmed click away from the board and silently drops pending writes (catalog D8; `Pardner.jsx:438` is disabled only while `busy`, not while `pending`).
- **Recommendation:** Move both into a "Workspace ▾" menu next to SaveStatus in the header. Put **Forget** behind a confirmation that names what is lost. This frees a whole row. **Effort S.**

### H2. On mobile, 77% of the first screen is chrome.
- `10-mobile-board.png`: the first card starts at y=646 of 844. The header with Actor and New task takes 170 px, the workspace actions 114 px, and the three tabs plus three full-width filter selects 308 px.
- **Recommendation:** With H1 applied, collapse the three filters into one **Filters** disclosure on narrow screens that shows the active-chip row from P3. The target is the first card above y≈300. **Effort M.**

### H3. Task details put the write forms above the content people read.
- Panel order (`Pardner.jsx:804-1071`): meta → description → Edit task → **Hand off form (always open)** → Comments → Add comment → Evidence → History. Comments, the most-read section, start at y=842 (`05-task-details-top.png` ends with the Hand off button and the Comments heading just visible).
- **Recommendation:** Order the panel as meta → description → [Edit task] [Hand off…] → Comments + composer → Evidence → History (collapsed). This is the same change as O1. **Effort M.**

### H4. One concept, one name: Actor labels and filter labels drift.
- The same roster is labelled **Actor** (header: this means "who am I"), **Assigned to**, **Assignee** and **Recipient**. The header **Actor** select is an identity switch, but it looks like the filters and silently remounts Task details (`key={`${selected}:${actor}`}`, `:568`, catalog D6).
- **Status filter** is the only filter label with "filter" in it; its siblings are **Assigned to** and **Vein** (`02-board.png`). **Handoff status** vs **Status** names one field twice.
- The **Tasks** tab shows a board; "Workspace activity" is the heading under the **Activity** tab.
- **Recommendation:** Header **Acting as**; nav **Assignee** / **Status** / **Vein**; handoff **Hand off to** and **New status**. Keep "Actor" as the umbrella term, as AGENTS.md requires. **Effort S.**

### H5. Two equal primaries on the opening screen.
- See P4 (`01-opening-fresh.png`). Everywhere else there is exactly one primary per surface: **New task** in the header, **Create task** in the panel, **Add comment** in details. **Hand off** is a secondary button, which is right if O1 lands. That part is clean.
- **Recommendation:** As in P4. **Effort S.**

### H6. Goals is shallow but correctly placed. **Mostly clean.**
- `03-goals.png`: a top-level tab, one level deep, with vein buttons that jump to the board. Its depth matches how often it is used. Gaps: no vein descriptions (catalog D27), and the empty state sends users to a CLI command (`Pardner.jsx:597`). This is acceptable for a prototype, since goal and vein editing is CLI-only by design.
- **Recommendation:** None structural. Show the vein description under each vein. **Effort S.**

---

## Counts

| Section | Findings | Explicitly clean |
|---|---|---|
| Duplicate Paths | 9 (P1–P9) | 3 (Retry saved request, Close/Escape, New task entry) |
| Duplicate Information | 8 (I1–I8; I8 acceptable) | 3 (vein membership, stale notice, pairing code + link) |
| Overlapping Features | 5 (O1–O5) | 1 (Goals vs Tasks) |
| Hierarchy & IA | 6 (H1–H6; H6 mostly clean) | primary-button discipline inside the workspace |

## Top recommendations

1. **Make Hand off the single reassignment path and collapse it** (P2, O1, H3). Take Assignee out of Edit task, or warn on it. Put Hand off behind a button so Comments move above the fold. M.
2. **Default Handoff status to the current status** (P1), so a handoff stops silently moving tasks to Review. S.
3. **Move Pair another device and Forget into a workspace menu, and confirm Forget** (H1, P5, with the D1/D8 fixes). Then collapse the filters on mobile (H2) to get the board above y≈300. S + M.
4. **Show filters only on the board, as an active-chip row** (I4, P3). Both vein routes then leave a visible, reversible state. S.
5. **Merge Activity and History into one humanised renderer** (O2, I2). Drop internal fields and empty comment/evidence rows, and show one SaveStatus (I1) and one comment count (I3). M.

Limitations: Pair-dialog code minting (P6) and the pairing-code display (catalog Duplicate information #10) were not exercised live, because LAN access is disabled on the shared hub and enabling it would change other critics' environment. CLI findings are from reading the code, not from running it.
