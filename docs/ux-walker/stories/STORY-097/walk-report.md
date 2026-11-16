# STORY-097 walk report: First visit to an empty Goals view, then seeding a goal and vein from the CLI

Walked 2026-11-09 against branch `client-only-entry`, Chromium 1440×900. Setup: three client services. Maya Okafor's client is the hub of "Ledgerline" (4 tasks). Dev Raman and Tomás Ferreira joined it as humans. "Ada" is Dev's client agent from `client agent-grant`; the UI names her **Setup agent**, because a client agent cannot be given another name.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-097/` (paths below are relative to it). Video: `videos/` (first two runs).

## Steps

1. **Goals, empty.** `screenshots/step-1.png`: the "Goals" heading sits at x=298 and "No goals yet. Start a vein with `pardner vein create --title … --goal …`." is centred below it. There is no create button. Geometry: the only hit is the nav tab widths (69/69/82/81), which follow the labels on purpose, so it is clean. LOOK: the centred empty-state line does not align with the left-aligned heading (F-097-06).
2. **Look for "New goal".** `screenshots/step-2.png`: the page is unchanged. The only buttons are New task, Tasks, Goals, Activity, Control and the header controls. Nothing explains what a goal or a vein is (F-097-04).
3. **Run the hinted command as Maya.**
   - `pardner vein create --title "Cache tax rates at the edge" --goal "Cut checkout latency" --data <Maya's client dir>` → `ACTOR_REQUIRED` "Supply --actor or PARDNER_ACTOR".
   - Adding `--actor "Maya Okafor"` → `LOCAL_SERVICE_UNAVAILABLE` "Could not reach sync server: fetch failed".
   - The person's own client CLI, `client operation --project … --request '{"type":"vein.create",…}'`, worked only after hand-writing the payload. A first attempt with `goal:"…"` failed with "Goal must be an object". The result was `{veinId, goalId, createdGoal:true}`.
   - The command the UI hints at does not work for the signed-in person (F-097-01).
4. **Live update.** `screenshots/step-4.png`: without a reload, "Cut checkout latency" appears with an **Open** select labelled "Status of goal Cut checkout latency". Below it, the vein button "Cache tax rates at the edge" has its own Open select and "0 tasks". The update arrived within the same tick the CLI returned. Geometry: clean (only the nav widths).
5. **What is a vein?** No tooltip, help text or link exists. The vein title button has no `title` attribute (F-097-04).
6. **Activity.** `screenshots/step-6.png`: under **Today**, the row reads "**Setup agent** started vein Cache tax rates at the edge for new goal Cut checkout latency". It is attributed to Setup agent, not Maya, because `client operation` acts as the client's setup agent (F-097-02). Geometry: clean.
- **Mobile.** `screenshots/mobile-check.png` (390×844): the goal heading, select and vein button stack cleanly with no horizontal scroll. Geometry: clean.

### Variations and edge cases (Ada's token file)
- Missing `--goal` → `GOAL_REQUIRED` "Every vein pursues a goal: …", as documented.
- Empty `--title ""` → `INVALID_ARGUMENT` "title must be text with content". The catalog expected a "Title" wording; the message is close enough.
- A well-formed unknown ID, `--goal goal-000000000000000000000000` → `NOT_FOUND` "Goal not found: …".
- Two-step path: `goal create --title "Reduce infra spend" --description "…"`, then `vein create … --goal goal-<24 hex> --description "Staging runs on prod-sized instances"`.
  - `screenshots/edge-typo-goal.png`: the goal description is shown muted under the heading. The vein description is shown nowhere (F-097-05).
- Typo `--goal goal-2adcfd` (meant as Cut checkout latency's ID) → success with `createdGoal:true`. A third goal literally titled "goal-2adcfd" appears on Goals (`screenshots/edge-typo-goal.png`). Activity reads "started vein Precompute invoice PDFs for new goal goal-2adcfd" (`screenshots/edge-activity.png`) (F-097-03).

## Flagged claim verdicts
- **#44 A mistyped, non-ID-shaped `--goal` value silently creates a new goal: CONFIRMED.** `--goal goal-2adcfd` created goal `goal-9b4e…` titled "goal-2adcfd" with no warning; the only signal is `createdGoal:true` in the JSON. See `screenshots/edge-typo-goal.png`.

## Flow Log
- The ideal path is 3 steps (open Goals, one command, see it). The actual path for a person was 6+: open Goals, copy the hint, hit `ACTOR_REQUIRED`, retry with `--actor`, hit `LOCAL_SERVICE_UNAVAILABLE`, discover `client operation` and hand-write a JSON payload (one more failure on payload shape), then see it.
- Hesitation at step 2: there is no in-UI create and no explanation of veins.
- Re-entry: the two-step path needs the goal ID copied from the first JSON result.
- Attribution: the one route that works for a person records the change as "Setup agent".
- Console and page errors: none.

Status: fail
