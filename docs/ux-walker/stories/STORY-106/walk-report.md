# STORY-106 walk report: Paging back with Show older activity to the start of the project

Walked 2026-11-09 as Maya Okafor on the hub (Chromium 1440×900). The project had 341 real events: the 61 from earlier stories plus 280 priority changes Dev made to "Audit tax-rate lookups" through the operations API, generated to reach the catalog's ~340.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-106/`. Video: `videos/`.

## Steps
1. **Activity.** "Showing 100 of 341" with 100 rows. **Show older activity** is at the bottom (`screenshots/step-1.png`). Geometry: clean.
2. **Show older activity.** "Showing 200 of 341". Focus moved to row index 100, the first newly shown row, as documented (`screenshots/step-2.png`).
   - The focused `article.event` has no visible focus style, so the user cannot see where the new rows begin (F-106-01, same root as F-104-02).
   - The "Showing … of …" counter is in the page heading, which has scrolled out of view.
3. **Twice more.** "Showing 300 of 341" (focus at index 200), then "Showing 341 of 341" (focus at index 300). The button is replaced by the muted text "Start of activity" (`screenshots/step-3-start.png`).
4. **Change Show.** Status changes gives "Showing 23 of 23". Back to All changes gives "Showing 100 of 341", so paging reset (`screenshots/step-4.png`).
- **Ideal path check.** Show = Goals and veins gives "Showing 21 of 21" with no paging needed. "Setup agent started vein Batch Stripe webhooks …" can be reached in 1 step.
- **Mobile.** `screenshots/mobile-check.png`: the Show older button is full-width at the bottom. Geometry: clean.

### Edge cases
- There is no search or date jump. Confirmed: the only controls are Performed by, Show and the paging button.
- The 280 consecutive "Dev Raman changed the priority of Audit tax-rate lookups to P1/P2/P3" rows are not collapsed, so the meaningful events are buried 280 rows deep (F-106-02).
- Timestamp-tie ordering was not separately verified.

## Flagged claim verdicts
No flagged claim names STORY-106.

## Flow Log
- Ideal path: 2 steps. Actual: 2 steps with the Goals and veins filter, or 4 (three Show older clicks) with All changes.
- Paging behaves exactly as documented.
- Console and page errors: none.

Status: pass
