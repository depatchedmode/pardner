# STORY-107 walk report: End-to-end experiment cycle (goal, veins, work, verdicts, goal achieved)

Walked 2026-11-09 in a fresh project, "Ledgerline latency push" (empty plan layer), hosted on Maya's hub client. Dev's client joined as a human. Ada is Dev's client agent from a new `client agent-grant` and is displayed as "Setup agent". Maya used Chromium at 1440×900.

Maya's CLI writes used `client operation`, because `pardner vein create` does not work for a person (see STORY-097 F-097-01). Those writes therefore appear as "Setup agent". Dev's task moves were run by Ada's CLI.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-107/`. Video: `videos/` (two runs).

## Steps
1. **Goals, empty.** The first run logged "No goals yet. Start a vein with `pardner vein create --title … --goal …`."
   - The `screenshots/step-01.png` file was overwritten when the run was resumed and now shows the populated state. See STORY-097 `screenshots/step-1.png` for the identical empty state.
2. **Create the goal and vein A.** `vein.create {title, goal:{title}}` gives `createdGoal:true`. "Checkout p95 under 400 ms" with "Cache tax rates at the edge" appears live (`screenshots/step-02.png`). Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
3. **Second vein with the goal ID.** "Precompute invoice PDFs" is listed under the same goal, below A in creation order (`screenshots/step-03.png`).
4. **Three tasks in vein A, assigned to Dev.**
   - `task create … --vein vein-A --assignee "Dev Raman"` gives `UNKNOWN_ACTOR`, and `--assignee dev` and `dev-raman` fail the same way. The only handle Dev has is `human-5907ef66-a6b5-…` (F-107-02).
   - With the actor ID instead, A shows "3 tasks" (`screenshots/step-04.png`).
5. **Ada adds two existing tasks to vein B.** B shows "2 tasks" (`screenshots/step-05.png`).
6. **Click the "Precompute invoice PDFs" title.** The board is filtered to B and shows Ada's two tasks in Up next. The Vein select truncates the name to "Precompute invoice …" (`screenshots/step-06.png`).
7–8. **Work happens through the CLI.** Ada moves B's last task to Dead end. B shows **Ready for a verdict** (`screenshots/step-08.png`).
9. **Maya sets B to Dead end.** The label clears (`screenshots/step-09.png`).
10. **Dev finishes A.** **Ready for a verdict** appears on A (`screenshots/step-10.png`).
11. **Concurrent Proven.** While Maya's Proven request was in flight, Ada's `vein update --status proven` landed first. Maya then sees a red notice under A: "This field changed since it was read; refresh its context / Your draft is preserved. Review the latest context before making a new edit." The select already reads Proven, the value she chose, and the console shows a 409 (`screenshots/step-11.png`) (F-107-01).
12. **Dismiss.** The select still reads Proven. Focus falls to `<body>` (F-107-03) (`screenshots/step-12.png`).
13. **Goal Achieved.** A second open goal, "Reduce infra spend", was added so the sort would be visible. Setting **Status of goal Checkout p95 under 400 ms** to Achieved moves it below "Reduce infra spend" (`screenshots/step-13.png`).
14. **Activity, Status changes and handoffs.** "Maya Okafor marked goal Checkout p95 under 400 ms Achieved", "Setup agent marked vein Cache tax rates at the edge Proven", "Maya Okafor marked vein Precompute invoice PDFs Dead end" (`screenshots/step-14.png`). Maya's own Proven is absent because it was rejected as stale.
15. **Goals and veins.** "started vein … for new goal …", "started vein … for goal …", "added … to vein …" ×2, "created goal Reduce infra spend". No verdicts, as found in STORY-105 (`screenshots/step-15.png`).
16. **Goal subject.** Clicking "Checkout p95 under 400 ms" in the "started vein" row switches to Goals and focuses that goal's article (`screenshots/step-16.png`).
- **Redundancy.** Task details for "Edge KV for tax tables" read "Veins: Cache tax rates at the edge (Proven)" (`screenshots/redundancy-task-veins.png`). The verdict is visible on Goals, in task details, in Activity and in `vein show`. Confirmed.
- **Mobile.** `screenshots/mobile-check.png` is clean.

## Flagged claim verdicts
No flagged claim names STORY-107. #39 (STALE "draft" copy) recurs at step 11. #43 (Goals and veins excludes verdicts) recurs at step 15.

## Flow Log
- The ideal path is about 12 steps. The actual path was about 14, because two extra attempts were needed to find an assignee value the CLI accepts.
- Re-entry: the goal ID and vein IDs had to be copied from JSON for every follow-up command.
- In step 11 both writers wanted Proven, yet the human got an error and her action was not recorded in Activity.
- Every creation was attributed to "Setup agent" rather than Maya.
- Console: one 409 Conflict from step 11. No page errors.

Status: pass
