# STORY-062: Throw away a draft with Discard draft

Walked 2026-11-09 in Chromium 1440×900. Project "Fjord CMS" on Maya Okafor's client (she stands in for Kenji). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-062/`.

## Steps
0. **Precondition** — `screenshots/step-0.png`: Title "Reindex products nightly", Status Up next, Assignee Maya Okafor · human, Tags "search". **Create task** and **Discard draft** sit side by side. Geometry: clean.
1. **Discard draft** — `screenshots/step-1.png`: Title is empty, Status Backlog, Priority P2, Assignee Unassigned, Tags empty; the button disappears and focus is in Title. Geometry: clean. Matches.
2. **Close** — `screenshots/step-2.png`: the panel closes and focus goes to **New task**. Matches.

## Variation
- Only Status changed to Review, with an empty title (`screenshots/var-status-only.png`): **Discard draft** shows. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844): **Discard draft** sits beside **Create task** at 44 px. Geometry: clean.

Console/page errors: none.

## Edge cases
- No confirmation and no undo. One click wiped a five-field draft, and the button sits 14 px from **Create task**. The busy/pending disabled state is not exercised here (see STORY-067).

## Flagged claim verdicts
No flagged claim names STORY-062.

## Flow Log
- Ideal 1; actual 1. No hesitation.

Status: pass
