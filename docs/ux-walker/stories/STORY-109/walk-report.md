# STORY-109 walk report: Vein filter persistence and stale filters after a vein link

Walked 2026-11-09 as Dev Raman on his replica client (Chromium 1440×900). Two tasks are assigned to Dev and In progress: "Coalesce invoice.paid events", which is in "Batch Stripe webhooks", and "Profile checkout API p95".

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-109/`. Video: `videos/`.

## Steps
0. `screenshots/step-0.png`: Assigned to = Dev Raman · human, Status filter = In progress. The board shows Dev's two In progress tasks. Geometry: clean.
1. **Goals → "Batch Stripe webhooks"**, activated with the keyboard (focus the button, press Enter). `screenshots/step-1.png`:
   - The board shows the vein's tasks in every column (Backlog 1, In progress 1).
   - Assigned to and Status filter are reset to All Actors / All statuses.
   - Focus lands on `<body>`, which confirms F-099-01 for keyboard users.
   - Geometry: clean.
2. **Getting the filters back.** No Back, Undo or Restore control exists. The browser **Back** button leaves Pardner entirely (`screenshots/step-2-back.png`, blank page), because view and filter changes create no history entries (F-109-02). After reopening, restoring the view took 3 controls (Assigned to, Status filter, Vein = All veins) (`screenshots/step-2.png`) (F-109-01).
- **Alternate path.** Choosing the vein in the board's own **Vein** select kept Assigned to and Status filter (`screenshots/alt-vein-select.png`). The two routes to the same filter behave differently (F-109-01).
3. **Reload.** `screenshots/step-3.png`: Assigned to, Status filter and Vein are all restored from preferences, as expected.

### Edge cases
- **Activity vein subject.** Clicking "Batch Stripe webhooks" in an Activity row also resets Assigned to and Status filter to All (`screenshots/edge-activity-vein.png`). Confirmed.
- **Saved vein no longer exists.** BLOCKED: there is no way to delete a vein in the UI or CLI, so a saved vein filter cannot be made stale.
- **Mobile.** `screenshots/mobile-check.png`: the filters stack full-width above the board. The board scrolls horizontally inside its container and the page has no overflow. Geometry: clean.

## Flagged claim verdicts
No flagged claim names STORY-109. The redundancy note "three vein-filter entry points; two reset the other filters" is CONFIRMED: Goals title and Activity subject reset, the nav select keeps.

## Flow Log
- The ideal path is 2 steps (click vein, one Back). The actual path was 1 click plus 3 control changes, and the browser Back exits the app.
- Re-entry of known data: Dev re-selected two filters he had set seconds earlier.
- There are three ways to reach a vein-filtered board, with different side effects.
- Console and page errors: none.

Status: pass
