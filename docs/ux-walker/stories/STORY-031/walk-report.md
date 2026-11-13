# STORY-031: "This project didn't open." recovery

Setup: Aisha's client (three projects). Two failure modes:
- **Real runtime failure:** stopped the client, made the "Infra cost cuts" project directory unreadable (`chmod 000`, standing in for the disk-full event), restarted the client, set last-project to Infra and reloaded. Later restored permissions.
- **Simulated CLIENT_UNREACHABLE:** Playwright aborted only `GET /projects/<Infra>` so the "This project didn't open." screen could be walked.
Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-031/`.

## Steps (real runtime failure)
- **Variation (merged): switcher before entering.** `screenshots/var-switcher-label.png`: "Infra cost cuts — Project service unavailable". Matches.
1. **Open.** `screenshots/step-1-opening.png`: "Opening project…".
2. **Load fails.** `screenshots/step-2-failed.png`: heading "Pardner" (no project name), "The project board isn't reachable yet.", "Project runtime failed to start; retrying after 5s", **Retry connection** only. NOT the catalog's "This project didn't open." screen. No switcher, no Open another project. Geometry clean. F-031-01.
3. **Retry immediately.** `screenshots/step-3-retry-again.png`: same screen, "retrying after 2s". Matches the backoff behaviour.
4-5. Not reachable in this mode: there is no Open another project.
6. **Cause cleared (permissions restored).** The screen recovered on its own within ~10 s and the board loaded (`screenshots/step-6-recovered.png`, "Audit idle instances" visible). Geometry: task-card false positive only.

## Steps (simulated CLIENT_UNREACHABLE)
2. `screenshots/sim-1-didnt-open.png`: heading "Infra cost cuts", "This project didn't open.", failure + hint (duplicated advice, F-031-03), **Retry** and **Open another project**. Geometry: unevenRows on the two buttons (66 vs 183px wide), which is just label length, not a defect.
3. **Retry** → same screen (`screenshots/sim-2-retry.png`).
4. **Open another project** → `screenshots/sim-3-open-another.png`: "Start or join a project", Start form, **Back to Infra cost cuts**; no list of other projects. Geometry clean. F-031-02.
5. **Back** → `screenshots/sim-4-back.png`: the failing screen again, still no switcher.
6. Network restored, **Retry** → board loads (`screenshots/sim-5-recovered.png`).
- Mobile: `screenshots/mobile-check.png` (recovered board) no overflow.
- Console: 503s during the real failure; aborted requests during the simulation. Videos: `videos/runtime-failure.webm`, `videos/didnt-open-simulated.webm`.

## Flagged claim verdicts
- **#33 (Open another project leads to Start/Join, not a project list, and the failure screen has no switcher):** CONFIRMED (`screenshots/sim-3-open-another.png`, `screenshots/sim-1-didnt-open.png`). Worse in the real runtime-failure case: that screen has no Open another project at all (`screenshots/step-2-failed.png`).

## Flow Log
- Ideal path 1 (Retry when the cause clears). Actual: auto-recovered in the real case (0 clicks), 1 Retry in the simulated case.
- Goal "or move on to another project": impossible from either failure screen without the failing project recovering. Open another project → Back → same failure is a loop.

Status: fail
