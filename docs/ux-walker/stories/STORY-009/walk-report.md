# STORY-009 walk report: Checking and stopping the service (`client status` / `client stop`)

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-009/`. Client "Grace Lindqvist" with projects "Atlas onboarding" and "Q4 infra cleanup", all CLI calls with `--data DIR`. A Chromium tab held the board during the stop. Video in `videos/`.

## Steps
1. **`client status`** (158 ms) → `{"success":true,"identity":{…},"device":{…},"suggestedIdentity":{…},"setupAgent":{…},"projects":[…]}`, ~2 KB of JSON including per-project heads, replica IDs and API paths. No `running` field and no URL; "running" must be inferred from `success:true` (F-009-02).
0. **Board before stop** (`screenshots/step-0-board-before-stop.png`): "Atlas onboarding", "Saved locally · synced". Geometry: task-card multi-line false positive only.
2. **`client stop`** (265 ms) → `{"success":true,"stopped":true,"running":false}`.
3. **Open tab** (`screenshots/step-3-after-stop-browser.png`), 1.3 s after stop: header status changes to "Local service disconnected"; full-width banner "The local Pardner client did not respond. Check that it is still running, then retry." + **Retry connection**. The board stays visible and **New task** stays enabled. The banner does not name the command to restart (`pardner open`) (F-009-03). The hint "Ask your agent to reopen it" quoted in the story did not appear on this surface. **Retry connection** while stopped (`step-3b-after-retry-click.png`): no visible change, no "still unreachable" feedback. A reload gives the browser's own connection-refused page (`step-3c-reload-while-stopped.png`).
4. **`client stop` again** → `{"success":true,"stopped":false,"running":false}`, exit 0. Calm and correct.
5. **`client status` with the stale connection file** → exit 1, `INTERNAL_ERROR: fetch failed` (F-009-01). `client list` gives the same.
- **`client open` with the stale file** → it restarted the service and succeeded (`launchIssued:true`), the same as `pardner open`.
- **Variation: fresh data dir** → `status`: `CLIENT_NOT_RUNNING: Start Pardner with pardner open or pardner client serve`; `stop`: `{"success":true,"stopped":false,"running":false}`. Neither created the directory.
- **Mobile 390×844, disconnected** (`screenshots/mobile-check.png`): header wraps to 3 rows, "You: Grace Lindq…" truncates with ellipsis; banner + 3 stacked filters push the board below ~720 px. No horizontal overflow.
- No Stop button exists in the browser UI (as the story says).

## Flagged claim verdicts
- **#25 `client status` with a stale connection file returns a raw error rather than `CLIENT_NOT_RUNNING`; `client stop` reports the same state calmly; `client open` fails with a network error — PARTLY CONFIRMED.** `status` (and `list`) → `INTERNAL_ERROR: fetch failed`: CONFIRMED. `stop` → `stopped:false, running:false`: CONFIRMED. `client open` failing: REFUTED: it restarts the service and opens normally.

## Flow Log
- Ideal 2 (status, stop). Actual 2. But the status output is a developer dump; reading "is it running?" from it needs inference, and after a stop the same command errors with `fetch failed`, so status cannot answer its own question in the not-running case.

Status: fail
