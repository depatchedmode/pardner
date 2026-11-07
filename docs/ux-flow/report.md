# UX Flow Critique — 2026-11-07

## Run Summary
| Metric | Value |
|--------|-------|
| Journeys critiqued | 8 |
| Evidence source | Live pass (Playwright/Chromium against a seeded local hub at commit `0768b857`; private empty/LAN services for STORY-001 and STORY-084) |
| Verdicts | 0 minimal · 4 acceptable · 4 convoluted |

Per-journey critiques: [`journeys/`](journeys/). Cross-cutting findings: [`redundancy.md`](redundancy.md).

## Friction Scorecard
| Journey | Steps (actual/ideal) | Needless decisions | Re-entry | Dead ends | Verdict |
|---------|----------------------|--------------------|----------|-----------|---------|
| [STORY-001](journeys/STORY-001.md) First run: empty service → connected → first task | 14/7 (7/3 to connect) | 3 (code vs token, sole Actor, bootstrap `--actor`) | 1 (token copied by hand from `connection.json`) | 2 (root URL returns JSON; disabled **New task** with no reason) | convoluted |
| [STORY-013](journeys/STORY-013.md) Create a fully specified task | 5/3 | 0 | 0 | 0 (tags have no display surface) | acceptable |
| [STORY-021](journeys/STORY-021.md) Morning on the board, triage → wrap-up | ~39/~25 actions (+2 CLI detours) | 2 | 1 | 2 (no vein field; no reorder) | convoluted |
| [STORY-027](journeys/STORY-027.md) Hand off from Task details | 5/4 | 1 (**Handoff status** defaults to Review) | 0 | 0 | acceptable |
| [STORY-030](journeys/STORY-030.md) Review agent work and close the loop | 8/4 | 1 | 0 | 0 | convoluted |
| [STORY-046](journeys/STORY-046.md) Goals vein → filtered board | 2/2 (+1 to clear) | 0 | 0 | 1 (details "Veins:" not a link) | acceptable |
| [STORY-062](journeys/STORY-062.md) STALE_UPDATE while editing | 7/4 | 0 | 1 (draft must be re-typed) | 1 (retry can never succeed — confirmed live) | convoluted |
| [STORY-084](journeys/STORY-084.md) First enable of device access | 7/3 | 1 (interface select) | 0 | 1 (restart outside the browser) | convoluted (see note) |

STORY-084 is convoluted mainly because of the service restart. Removing the restart is a local-service design change: it must be checked against the [acceptance contract](../PARDNER-ACCEPTANCE.md) and [LAN guide](../PARDNER-LAN.md) before anyone treats it as UI polish.

## Redundancy Map
Condensed from [`redundancy.md`](redundancy.md).

**Duplicate paths**
- **Reassign/re-status**: **Edit task** (Assignee/Status) and **Hand off work** (Recipient/Handoff status) both change assignee and status. Only Hand off notifies the recipient. → Make Hand off the single reassignment path, or warn in Edit task that no one is notified.
- **Vein-filtered board**: the Goals vein button resets other filters (deliberate, `Pardner.jsx:388`), while the nav **Vein** select keeps them and can hide tasks silently. → Keep both, but show active filters as chips so both routes leave visible, reversible state.
- **Connect**: on loopback the pairing-code form and the token form are both primary. Pairing cannot work there on a first run. → On loopback, make the token form the only primary.
- **Forget this workspace** appears in the header and on the opening screen. Neither copy asks for confirmation, and the opening-screen copy is suspected broken (catalog D1). → Keep one, inside a workspace menu, with confirmation.

**Duplicate information**
- SaveStatus appears twice when Task details is open: two `role="status"` regions read "Saved locally · synced" (confirmed live). → Keep only the header copy.
- History repeats Comments and Evidence as empty `comment.add`/`task.link-commit` rows, and also shows internal fields (`order`, `type`). → Humanise it and drop those fields.
- Board filters stay visible on Goals and Activity, where they do nothing. → Show them only on Tasks.
- The Actor list appears in 4 selects with 3 different empty labels. Actor/assignee/recipient naming drifts. → Use one term per concept.

**Overlapping features**
- **Hand off** vs **Edit task + @mention comment** → Hand off is canonical.
- **Activity** vs per-task **History** use different renderers and different filters (`read.mark` shown vs hidden). → One shared, humanised renderer.
- CLI aliases (`timeline`/`activity`, `agents`/`actors`, `--agent`/`--actor`) are intentional synonyms. Keep them, but drop them from help.

## Simplification Proposals (ranked)

### 1. Collapse **Hand off work** behind a button, make it the primary action, and default its status sensibly
- **Now**: the Hand off form is always expanded. It takes more than 60% of the first screen of Task details and pushes Comments to y≈842. **Handoff status** always defaults to "Review" (`Pardner.jsx:752`), even on Backlog or Completed tasks. **Add comment** is the only primary-styled button. After a successful handoff the form stays filled and enabled.
- **Proposed**: a **Hand off** button in the panel header opens the form. Status defaults to the task's current status (or the next one: Backlog/Up next → In progress, In progress → Review). Hand off is primary while the form is open. Success collapses the form to a one-line confirmation.
- **Saves**: 1 decision per handoff, about 1 screen of scroll on every Task details visit; improves STORY-021, 027, 030 and every comment-reading journey.
- **Effort**: M
- **Evidence**: STORY-027 screens 06–08; STORY-030 screens 03-panel-scroll-0..2; STORY-021 screen of the 1906px panel; redundancy.md §Duplicate Paths.

### 2. Make edit-after-STALE_UPDATE recoverable in place
- **Now**: saving an edit draft after an agent's concurrent change fails with HTTP 409 every time, because the draft keeps the revisions from when **Edit task** opened (`Pardner.jsx:836-842`). The bottom banner says "Your draft is preserved" but offers no action, and it outlives **Cancel edit**.
- **Proposed**: an inline notice at the changed field ("Builder renamed this to '…'") with **Keep mine**, which rebases the draft onto the current revision, and **Use theirs**. Clear the error on Cancel edit. This reuses the handoff form's existing **Use latest task details** pattern (`Pardner.jsx:925-932`).
- **Saves**: 3 steps plus a full re-type; turns a dead end into a choice. Also a correctness fix.
- **Effort**: M
- **Evidence**: STORY-062 screens 03–09 (two 409s confirmed live).

### 3. Show filters only on the board, as removable chips with **Clear filters**
- **Now**: the three selects persist on Goals and Activity, where they have no effect. A remembered filter has no "active" sign. There is no Clear action. The nav Vein route can silently hide tasks (Goals says "3 tasks"; the board showed 1).
- **Proposed**: render the filter controls only on Tasks. Above the board, show active filters as chips (e.g. "Vein: Edge caching ×"), plus **Clear filters** and a "N hidden by other filters" note. Collapse the controls into one disclosure on mobile.
- **Saves**: up to 3 resets per filter session; removes a false "missing data" state; reclaims mobile header space. Improves STORY-015, 016, 021, 046, 047.
- **Effort**: S–M
- **Evidence**: STORY-046 screens 03–05, 08, 10; STORY-021; redundancy-screens mobile board.

### 4. Demote workspace chrome (**Pair another device**, **Forget this workspace**) into a menu and confirm Forget
- **Now**: two rarely used buttons sit on their own row above the core task nav. On a 390px phone, chrome takes 77% of the first screen, and the first card starts at y=646. Forget has no confirmation, discards pending writes (D8), and its opening-screen copy is suspected broken (D1).
- **Proposed**: a single "Workspace" menu in the header holding both actions. Forget asks for confirmation and warns about any unsaved request.
- **Saves**: one header row on desktop and about 2 rows on mobile; prevents accidental credential loss.
- **Effort**: S
- **Evidence**: redundancy.md §Hierarchy; STORY-084 phone screens; STORY-013.

### 5. Put direct status actions in Task details (e.g. **Complete**) instead of routing through Edit task
- **Now**: closing a reviewed task means opening **Edit task** (a 6-field editor), changing Status, then **Save changes**, followed by a separate **Mark displayed comments read**.
- **Proposed**: make the status in the details header an inline select (with priority and assignee likewise). Offer a reviewer shortcut to complete the task.
- **Saves**: 2–3 steps on the most common close-out path; improves STORY-018, 021, 030, 104.
- **Effort**: M
- **Evidence**: STORY-030 screens; STORY-021.

### 6. First-run on-ramp: a usable start URL, the token form first on loopback, and auto-selecting the sole Actor
- **Now**: `serve` prints JSON whose `httpUrl` (`/`) returns `AUTH_REQUIRED` JSON. On loopback the connection screen leads with the pairing form, which cannot work there. The token must be copied by hand from `connection.json`. Once one Actor exists, **New task** is disabled with no reason given.
- **Proposed**:
  - `serve` prints `Open Pardner: http://127.0.0.1:8004/pardner/`, plus how to read the token. The shared-secret requirement is unchanged.
  - Redirect `/` to `/pardner/`.
  - On loopback, show the token form as the single primary.
  - Auto-select the only human Actor.
  - Explain why **New task** is disabled ("Choose an Actor").
- **Saves**: 4 steps to connect and 7 to the first task; 2 dead ends.
- **Effort**: S–M
- **Evidence**: STORY-001 screens 01–11.

### 7. Stop counting an author's own comments as unread and humanise unread copy
- **Now**: "1 unread for alice" appears right after Alice posts (confirmed live in STORY-021, 027, 030 and redundancy). The label uses the handle, not the display name. "Mark displayed comments read" is ambiguous.
- **Proposed**: record an implicit read receipt for the author, or exclude own comments from the count. Use "Comments 2 · 1 new" and "Mark all read".
- **Saves**: a false signal on every comment; improves STORY-030, 035, 036.
- **Effort**: S (but touches read-receipt semantics; see the [acceptance contract](../PARDNER-ACCEPTANCE.md))
- **Evidence**: STORY-021 screen 17; STORY-030; redundancy.md.

### 8. Humanise History and unify it with Activity
- **Now**: raw op names (`task.create`), JSON values (`order: null → 1794071631546`, `"in-progress"`, Actor IDs), oldest first, about two screens down. Activity uses a different renderer.
- **Proposed**: one renderer with display names, status labels and no internal fields, newest first, collapsed by default in details.
- **Saves**: noise on every audit; improves STORY-128–138.
- **Effort**: M
- **Evidence**: STORY-027 screen 07; STORY-030; redundancy.md.

### 9. Show tags (or remove the field) and add a Vein select to the task forms
- **Now**: tags are asked for in both forms but displayed nowhere. Linking a task to a vein requires the CLI, plus a task ID the UI never shows.
- **Proposed**: show tags as chips on cards and in details, and add a Vein multi-select to New task and Edit task. The `task create --vein` and `vein add` operations already exist.
- **Saves**: a CLI round trip per vein link; makes a captured field visible.
- **Effort**: M
- **Evidence**: STORY-013, STORY-021.

### 10. After **Create task**, return to the board with the new card highlighted; make Escape close the New task panel
- **Now**: Create opens Task details, which hides 4 of 7 columns at 1440px and the whole board at 390px. Escape closes Task details but not the identical-looking New task panel.
- **Proposed**: return to the board and highlight the new card (or keep details open but scroll the card into view). Escape behaves the same on both panels, guarded against discarding drafts.
- **Saves**: 1 step per create; consistency.
- **Effort**: S
- **Evidence**: STORY-013 screens.

### 11. In-browser enable of device access without a manual restart (design check required)
- **Now**: after **Enable device access** the user must restart the service with the same flags and reopen the dialog. The dialog does not poll.
- **Proposed**: bind the LAN listeners from the configure handler, reusing the self-contained startup block at `automerge-sync-server.js:177-195`, which already rolls back on failure. Until then, show the exact restart command with a copy button, and poll so the QR appears automatically.
- **Saves**: 4 steps and a terminal round trip.
- **Effort**: L (local-service lifecycle; check against the LAN guide)
- **Evidence**: STORY-084 screens.

## Already Minimal
- **Goals → vein → filtered board** (STORY-046) already hits the ideal 2 steps, and the filter reset on the vein click is deliberate and correct. Only clarity issues remain.
- **New task form** (STORY-013): one panel, six fields, sensible defaults (Backlog, P2), fits one phone screen.
- **The atomic handoff operation itself** (STORY-027): one action sets assignee and status, adds a comment and queues the mention. The problems are presentation, not the model.
- **Live updates**: the WebSocket push cleared the no-Actors notice and showed new Actors and tasks without a reload (STORY-001). Reopening the next morning restores the view and filters (STORY-021).
- **Retry saved request** is never shown twice (a catalog candidate, ruled out in redundancy.md). Vein membership shown on card, details and Goals is justified.
