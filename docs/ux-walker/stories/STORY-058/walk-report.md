# STORY-058: Create a first task from the empty board

Walked 2026-11-09 in Chromium 1440×900 against a fresh client service (`--data` scratch dir), identity Maya Okafor, project "Lantern Billing", no hub configured. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-058/`.

## Steps
1. **Look at the board** — `screenshots/step-1.png`: seven columns (Backlog, Up next, In progress, Review, Completed, Dead end, Abandoned), each heading `0`, each column "No tasks here". Geometry: clean. Matches. The empty state is generic ("No tasks here" ×7); nothing points the first-time person at **New task**.
2. **Click New task** — `screenshots/step-2.png`: side panel "New task" with **Close**, muted line "Creating as Maya Okafor · human", Title focused. Geometry: clean. Matches.
3. **Type "Draft invoice email copy"** — `screenshots/step-3.png`: **Discard draft** appears beside **Create task**. Geometry: clean. Matches. Clicking **New task** a second time kept the panel and the typed title (edge case confirmed).
4. **Press Enter** — `screenshots/step-4.png`: a MutationObserver recorded the button reading "Creating…", `form[aria-busy=true]`, and the SaveStatus reading "Saving locally…" then "Saved locally · synced". Geometry: one `wrappedControls` hit on `button.task-card` (multi-line card button, intentional, not a defect).
5. **Wait** — `screenshots/step-5.png`: Task details panel for "Draft invoice email copy" with its heading focused (focus = `H2`); Backlog count `1`, card "P2 / Draft invoice email copy / Unassigned" outlined with `aria-current="true"`. Geometry: same card false positive only. Matches. About a second later a "Here now" row with the MO avatar is inserted into the panel header, pushing the summary line and everything below down by ~36 px, and the same avatar appears on the card.

Mobile check (`screenshots/mobile-check.png`, 390×844): the detail panel goes full width, controls are 44 px, nothing overflows. Geometry: clean apart from the card false positive.

Console/page errors: none.

## Edge cases
- No hub configured: header and panel both say "Saved locally · synced" (not "waiting for hub" as the catalog predicted). The same status shows twice on one screen: header and detail panel (Redundancy Candidate confirmed).
- Second **New task** click keeps the draft: confirmed.

## Flagged claim verdicts
No flagged claim names STORY-058.

## Flow Log
- Ideal path 3 (open, type, submit); actual 3. No hesitation, no re-entry.
- Duplicated information: SaveStatus in header and panel; presence (MO) in header avatars, panel "Here now" and on the card at the same time.

Status: pass
