# STORY-072: Move a task to Review with the quick Status select

Walked 2026-11-09 in Chromium 1440×900. Setup: hub client (Priya Raman, `--http-port 47621 --public-url http://127.0.0.1:47621`) owning "Lantern Checkout"; Maya Okafor and Theo Lindqvist joined from their own client services; the agent Juniper enrolled on Theo's client (`client agent-grant`). The browser was Maya's. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-072/`.

## Steps
0. **Board** (`screenshots/step-0-board.png`): seven columns, "Fix flaky webhook retry test" in In progress (P1, Maya Okafor · human). Geometry: two `wrappedControls` hits on `button.task-card` (multi-line card buttons, intentional, not a defect). The header shows avatars "MO J PR SA SA +2": three of the project's Actors are "Setup agent · agent", one per computer.
1. **Click the card** (`screenshots/step-1-panel.png`): the Task details panel opens over the right half of the board. Focus goes to the `H2` heading and the card gets `aria-current="true"`. The summary line reads "Maya Okafor · human · P1", without the status. Geometry: card false positive only. Matches.
2. **Find the status** (`screenshots/step-2-status-select.png`): the **Status** select ("In progress") sits beside **Edit task** and **Hand off work**. Matches. The board's own "Status filter" select is also on the page, hidden under the panel. That gives two Status selects in the DOM.
3. **Choose Review** (`screenshots/step-3-review-chosen.png`): the select shows Review at once. Polling the status line read "Saving locally…" at 0 ms and "Saved locally · synced" by 250 ms. Geometry: card false positive only. Matches.
4. **Board behind the panel** (`screenshots/step-3-review-chosen.png`, `step-4-board-behind.png`): In progress drops to 2 and the card appears in Review. Review is the column the panel covers at 1440 px, so the moved card is clipped to "Fix flaky webhoc…". The story expected focus on the Status select; the walk measured the `H2` heading after Playwright's `selectOption`, which is not a reliable test of focus. In the edge-case run the select was focused before the change and kept focus. Inconclusive, not logged.
5. **History** (`screenshots/step-5-history.png`): the top row reads "Maya Okafor moved this task to [Review]" with "Nov 9, 2026, 11:38 AM". Matches.

Variations:
- Picking the same status (Review → Review) sent nothing: the document heads did not change. Matches.
- Tab order from the heading: Close → Link GitHub issue input → Status → Edit task → Hand off work → Comment. **Link issue** is disabled and is skipped, so Status is the 3rd Tab stop. The story said "several"; it is fewer than predicted.

Edge case, `STALE_UPDATE` from the quick select (`screenshots/step-edge-stale-update.png`, video in `videos/`): I froze the panel's task context, the "changed before the refetch landed" window, by replaying the first context response. Juniper then ran `pardner update --status completed --token-file …` on Theo's computer. When Maya chose In progress, the server refused with 409. The panel shows a red block: **"This field changed since it was read; refresh its context"** / **"Your draft is preserved. Review the latest context before making a new edit."** / **Dismiss**. The select snapped back to its last-read value. The notice names no field, says nothing about who changed it or to what, and the quick select has no draft. Because I froze the context to force this window, the select showed Review while the board already showed Completed. That mismatch comes from the simulation, not the app.

Mobile check (`screenshots/mobile-check.png`, 390×844): the panel is full width. **Hand off work** wraps to a second row under Status/Edit task. Nothing overflows. Geometry: card false positives only.

Console/page errors: none on the happy path. The edge-case run logged the expected `409 (Conflict)` resource error.

## Flagged claim verdicts
- **#39** (`STALE_UPDATE` notice says "Your draft is preserved" for the quick Status select, which has no draft): **CONFIRMED**. See `screenshots/step-edge-stale-update.png`.

## Flow Log
- Ideal 2 (open, pick); actual 2. No hesitation on the happy path.
- At 1440 px the panel hides the destination column, so the board feedback that the card moved is partly hidden.
- Duplicated information: the status shows in the board column, the quick select, the History row and (under the panel) the Status filter. The header and the panel both show "Saved locally · synced".

Status: pass
