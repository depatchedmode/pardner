# STORY-102 walk report: Conflicting goal title and description edits

Walked 2026-11-09 as Dev Raman on his replica client (Chromium 1440×900), standing in for Priya. Leon's role is played by Tomás.

The conflicts were created during the STORY-100 hub outage:
- On goal "Cut checkout latency", Dev titled it "Faster checkout" and Tomás titled it "Checkout p95 under 400 ms".
- On "Reduce infra spend", both edited the description: Dev wrote "Cloud bill down 15%" and Tomás wrote a 125-character sentence.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-102/`. Video: `videos/`.

## Steps
0. **Activity before resolving.** `screenshots/pre-activity-rename.png`: both edits read "Dev Raman renamed goal **Checkout p95 under 400 ms** / Was "Cut checkout latency"" and "Tomás Ferreira renamed goal **Checkout p95 under 400 ms** / Was "Cut checkout latency"".
   - Each row's subject is the goal's *current* title, not the title that person wrote.
   - After Dev kept his own title, both rows changed to "renamed goal Faster checkout" (`screenshots/step-activity.png`). Tomás's row now claims he renamed the goal to Dev's wording.
   - Neither row ever shows the new value each person chose (F-102-01).
1. **Goals.** `screenshots/step-1.png`: the h3 shows the merge's pick, "Checkout p95 under 400 ms", with "▸ Conflicting edits: title" beneath. Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
2. **Expand.** `screenshots/step-2.png`: "Title: both edits are kept until you choose one.", then "Dev Raman · human — Faster checkout [Keep Dev Raman · human's title]" and "Tomás Ferreira · human — Checkout p95 under 400 ms [Keep Tomás Ferreira · human's title]".
   - As the catalog says, the buttons name the author, not the value. The "· human's" suffix reads awkwardly (F-102-02).
3. **Keep Dev's.** `screenshots/step-3.png`: the heading updates to "Faster checkout" and focus moves to "Status of goal Faster checkout". Matches the catalog.

### Variations
- **Description conflict.** `screenshots/var-description.png`: "Description: both edits are kept until you choose one." Tomás's full 125-character description is shown inline, and Dev's "Cloud bill down 15%". The buttons read "Keep Tomás Ferreira · human's description" and "Keep Dev Raman · human's description".
  - Keeping Tomás's version produced the Activity row "resolved conflicting description on goal Reduce infra spend", with the detail "**Kept the chosen version**", which does not say which (F-102-03). The earlier "edited the description of goal …" rows carry no text either.
- There is no UI to edit a goal title or description; this was confirmed again.
- **Mobile.** `screenshots/mobile-check.png`: the stacked layout is fine. The one "wrapped" hit is a 44 px summary (false positive).

## Flagged claim verdicts
No flagged claim names STORY-102.

## Flow Log
- The ideal path is 2 steps (expand, Keep); the actual path was 2.
- Activity is unreliable as an audit trail for concurrent renames. It rewrites every rename row to the current title, so the trail cannot show who proposed what.
- Console and page errors: none.

Status: fail
