# STORY-101 walk report: A vein moved to two goals at once (goal conflict)

Walked 2026-11-09 as Maya Okafor on the hub client (Chromium 1440×900).

The conflict was created for real during a hub outage (see STORY-100 for setup): with the hub stopped, Tomás's replica moved "Cache tax rates at the edge" to "Reduce infra spend" and Dev's replica moved it to "Lower payment fees". The goal "Lower payment fees" was created before the outage, because the vein's original goal "Cut checkout latency" could not be one side of a move. The catalog's two choices are therefore "Reduce infra spend" and "Lower payment fees", not "Cut checkout latency".

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-101/`. Video: `videos/`.

## Steps
1. **Goals.** `screenshots/step-1.png`: the same vein row (`data-vein-id` identical) is listed under **Reduce infra spend** and again under **Lower payment fees**. Each copy has its own select (Proven), "0 tasks" and a closed "▸ Conflicting edits: goal". Neither copy says it is also listed under another goal (F-101-01). Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
2. **Expand one copy.** `screenshots/step-2.png`: "Goal: both edits are kept until you choose one." with "Dev Raman · human — Lower payment fees" and "Tomás Ferreira · human — Reduce infra spend".
3. **Buttons** show goal titles, as documented: **Keep Lower payment fees** and **Keep Reduce infra spend**. Their aria labels are "Keep … for vein Cache tax rates at the edge". The buttons are right-aligned far from their values, the same pattern as F-100-02.
4. **Keep Reduce infra spend.** `screenshots/step-4.png`: the copy under Lower payment fees disappears, and that goal now reads "No veins pursue this goal yet." Focus lands on the vein's select inside the **Reduce infra spend** article (focus ring visible). There was no scroll jump, because the article was already in view (scrollY 0 → 0).
5. **Activity.** `screenshots/step-5.png`:
   - "Maya Okafor resolved conflicting goal on vein Cache tax rates at the edge", with the detail "Kept Reduce infra spend".
   - Earlier rows: "Dev Raman moved vein Cache tax rates at the edge to goal Lower payment fees" and "Tomás Ferreira moved vein … to goal Reduce infra spend". Matches the catalog.
- **Mobile.** `screenshots/mobile-check.png`: stacks cleanly. The 3 "wrapped" hits are the 44 px conflict summaries (false positive; see F-100-04 for the missing marker).

### Edge cases
- "Unknown goal" for a goal ID this replica lacks was not reproduced (BLOCKED): every replica had synced both goals before the outage.
- The conflict is visible only on Goals. No board or task surface shows it, but the vein has no tasks here, so this is not separately verified.

## Flagged claim verdicts
No flagged claim names STORY-101.

## Flow Log
- The ideal path is 3 steps; the actual path was 3.
- Hesitation at step 1: two identical rows with no "also in …" note look like a duplicate until the disclosure is opened.
- Console and page errors: none.

Status: pass
