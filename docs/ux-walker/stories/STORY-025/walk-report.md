# STORY-025: Start project when the response is lost, and the resumed attempt

Setup: fresh client "Marcus Bell" (identity via operator API, no project). The lost response was simulated in Playwright by letting the first `POST /projects` reach the server (`route.fetch()`) and then aborting the response (`connectionreset`), so the server really created the project. Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-025/`.

## Steps
1. **Type and Start.** "Starting…" (as in STORY-024).
2. **Response lost.** `screenshots/step-2-failure.png`: resume notice + "The local Pardner client did not respond. Check that it is still running, then retry." + "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry." pending-create kept with the operation ID. The server already had "Launch plan Q1". Geometry clean. Matches; duplicated advice F-025-02.
3. The notice is visible above the agent text. Matches.
4. **Reload.** `screenshots/step-4-after-reload.png`: because the server had completed, the session now lists the project and the board "Launch plan Q1" opens directly (the catalog expected the Welcome page with a pre-filled name; that only applies when the server had not finished). pending-create is still stored. Geometry clean.
5. **Start or join a project…** `screenshots/step-5-stale-notice.png`: name pre-filled "Launch plan Q1" and "An earlier attempt … didn't confirm" although the project exists (F-025-01). Pressing Start project reused the operation ID and returned the same project.
6. **Single project.** `screenshots/step-6-single-project.png`: switcher lists one "Launch plan Q1"; pending-create cleared. Matches the goal.
- **Variation: edited name before retry.** "Hiring plan" lost its response; renamed to "Hiring plan (v2)": notice still names "Hiring plan" (`screenshots/var-edited-name-notice.png`); Start created a second project (`screenshots/var-edited-name-duplicate.png`). F-025-03.
- **CLI:** same `--operation-id launch-q1` twice returned the same project ID; without `--operation-id` a duplicate "Launch plan CLI" was created; same ID with a different name gave `OPERATION_ID_REUSED: Operation ID belongs to different input`. All match the catalog.
- New-tab variation: not separately walked; per-tab sessionStorage behaviour was confirmed in STORY-030/035.
- Mobile `screenshots/mobile-check.png`: clean. Console: two `ERR_CONNECTION_RESET` from the simulation. Video: `videos/lost-response.webm`.

## Flow Log
- Ideal path 3 (type, Start, Start again). Actual: type, Start, reload (board appeared), switcher, Start or join, Start = 6, with one misleading notice. The resume itself was safe and produced exactly one project.

Status: pass
