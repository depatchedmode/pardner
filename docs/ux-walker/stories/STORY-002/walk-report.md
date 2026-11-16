# STORY-002 walk report: Running `pardner open` again when the service is already up

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-002/`. Reused the STORY-001 client (data dir passed explicitly with `--data`), seeded with identity "Marcus Feld" and project "Atlas onboarding" with two tasks. Browser: Chromium with the STORY-001 cookie/storage state. Fake `open` launcher on PATH.

## Steps
0. **History URL (variation).** Opening `http://127.0.0.1:52178/pardner/` with the existing cookie went straight to the board (`screenshots/step-0-history-url-board.png`). Geometry flags `button.task-card` as a wrapped control; the screenshot shows this is the intended multi-line card (priority / title / assignee), not a defect.
1. **`pardner open --data …` again.** `{"success":true,"localUrl":"http://127.0.0.1:52178/pardner/","launchIssued":true}`; `client-connection.json` PID unchanged (85196), so no new process.
2–3. **New tab with grant.** Board opened directly on "Atlas onboarding" with both tasks (`screenshots/step-3-new-tab-board.png`). Header: project switcher, avatars MF + SA, Invite, "You: Marcus Feld", "Saved locally · synced", **New task**. Geometry: only the task-card false positive.
- **Mobile 390×844** (`screenshots/mobile-check.png`): header wraps to three rows and the three filter selects stack full width, so the first task card starts ~490 px down. No horizontal page overflow. Logged as low (F-002-03).
- **Variation `--http-port 9000`.** `pardner open --http-port 9000` and `pardner client open --http-port 9000` both succeeded with `localUrl` still on port 52178; nothing listened on 9000; no warning (F-002-01).
- **Edge `localhost:52178`.** The browser shows raw JSON `{"code":"ORIGIN_REJECTED","error":"Open the configured client address"}` with a 403 (`screenshots/edge-localhost.png`). It does not name the configured address (F-002-02).
- A board Actor "SA" / "Setup agent · agent" appears although the client was started with no `--harness`/`--name` flags: `client status` shows a default `setupAgent` {openai-codex, "Setup agent"} (F-002-04).

Console/page errors: none on the board; one 403 resource error on the localhost page (expected).

## Flagged claim verdicts
- **#24 `--http-port` is silently ignored when the service is already running — CONFIRMED.** Output `localUrl` stayed `http://127.0.0.1:52178/pardner/`, exit 0, no warning, `lsof` shows nothing on 9000.

## Flow Log
- Ideal 1 step; actual 1 (re-run launcher) or 1 (history URL). Matches.
- Re-running `open` adds another browser session each time; there is no sign-out/session list in the UI (not observable further from the browser).
- Hesitation risk: typing `localhost` instead of `127.0.0.1` dead-ends on raw JSON.

Status: pass
