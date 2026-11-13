# STORY-098 walk report: Marking a vein Proven from the Goals view

Walked 2026-11-09 as Dev Raman on his own replica client, Chromium 1440×900. The hub is Maya's client. The goal "Cut checkout latency" holds the vein "Cache tax rates at the edge" (Open). "Ada" is Dev's client agent, which the UI shows as "Setup agent".

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-098/`. Video: `videos/`.

## Steps

1. **Goals.** `screenshots/step-1.png`: the vein row shows the **Status of vein Cache tax rates at the edge** select set to Open. Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
2. **Choose Proven.** The request was held at the network layer to observe the in-flight state.
   - `screenshots/step-2-inflight.png`: the chosen select and every other goal and vein select are disabled. The header reads "Saving locally…", **New task** is greyed, and a page banner reads "A request is awaiting confirmation." with a **Retry saved request** button (F-098-03).
   - Once released, `screenshots/step-2-settled.png` shows Proven, enabled. Geometry: clean.
   - A separate focus probe (keyboard focus on the select, with and without an 800 ms delay) confirmed that focus returns to the same select after it settles.
   - The first run, aborted by a script error, also marked the vein Proven. The vein was reset to Open through Ada's CLI before this walk, so Activity carries two extra rows.
3. **Activity.** `screenshots/step-3.png`: "Dev Raman marked vein Cache tax rates at the edge" followed by a green **Proven** pill. Geometry: clean.

### Variations and edge cases
- **Goal Achieved re-sort.** `screenshots/var-goal-achieved.png`: setting **Status of goal Cut checkout latency** to Achieved moves the whole goal from first to last place (below "Reduce infra spend" and "goal-2adcfd"). Focus follows the select. Nothing besides the select value marks it as achieved: no dimming and no section header (F-098-04). Setting it back to Open re-sorts it to the top.
- **STALE_UPDATE.** While Dev's request was in flight, Ada set "Precompute invoice PDFs" to Abandoned. `screenshots/edge-stale.png`:
  - A red notice under the vein reads "This field changed since it was read; refresh its context / Your draft is preserved. Review the latest context before making a new edit." with **Dismiss**.
  - The select already shows Abandoned, so nothing needs refreshing. There is no draft, and the notice does not say who changed it or what to.
  - The response was a 409 in the console (F-098-01).
- **Network failure.** Request aborted. `screenshots/edge-network.png`:
  - A notice under "Right-size staging DB" reads "**Failed to fetch** / Your last confirmed data remains available." with **Retry saved request** (F-098-02).
  - Every goal and vein select is disabled.
  - Retry succeeded (`screenshots/edge-network-retried.png`, value Proven).
- **Mobile.** `screenshots/mobile-check.png`: the layout stacks cleanly. The goal-status select sits inline for "Reduce infra spend" but wraps below "Cut checkout latency", so placement depends on title length. Cosmetic, not logged separately. Geometry: clean.

## Flagged claim verdicts
- **#39 The STALE_UPDATE notice says "Your draft is preserved" for goal/vein selects that have no draft: CONFIRMED.** See `screenshots/edge-stale.png`: "Your draft is preserved. Review the latest context before making a new edit." appears under a status select.

## Flow Log
- The ideal path is 2 steps (Goals, pick Proven); the actual path was 2. No hesitation on the happy path.
- On STALE, the user's choice (Proven) is dropped silently, the select shows the teammate's value, and the copy talks about a draft and a refresh that do not exist. The user has to re-pick and wonder whether Proven was saved.
- Network failure surfaces a raw browser string ("Failed to fetch").
- Console errors: `409 (Conflict)` and `net::ERR_FAILED`, both from the deliberate edge cases. No page errors.

Status: pass
