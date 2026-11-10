# STORY-143: The client service crashes or is stopped while the board is open

Setup: client "Jordan Lee", project "Design Tokens" with "Rename spacing scale to rem". The board is open in Chromium 1440x900 with an unsaved **Edit task** draft (new description, Priority P1). The outages were real `client stop` runs. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-143/`, video `videos/stop-restart-draft-survives.webm`.

## Steps
0. **Draft in progress.** `screenshots/step-0-draft.png`. Geometry: card wraps only.
1. **`client stop`.** `{"success":true,"stopped":true,"running":false}`. Matches. I did not catch a 503 `SERVICE_STOPPING` during the short shutdown.
2. **Board after the stop.** `screenshots/step-2-disconnected.png`: the banner reads "The local Pardner client did not respond. Check that it is still running, then retry." with **Retry connection**. The header and panel SaveStatus read "Local service disconnected", avatars switch to dashed/offline, and the draft stays. The banner copy differs from the catalog ("Live updates disconnected. Reconnecting automatically.") but is clear. **New task** stays enabled. Geometry clean.
3. **Retry connection.** `screenshots/step-3-retry-connection.png`: the result is identical to step 2, with no spinner, attempt counter or "still unreachable" change. Nothing shows the click did anything (F-143-03). Geometry clean.
4. **CLI with the service down.**
   - `client status`: **`INTERNAL_ERROR: fetch failed`** (`screenshots/step-4-client-status-stale.png`), not `CLIENT_NOT_RUNNING` (F-143-01).
   - `client open --output-file …`: **starts the service** and returns `{"success":true,…,"launchIssued":true}`. A detached `client serve --data …/jordan` process appears (`screenshots/step-4-client-open-starts-service.png`, reproduced twice). The catalog said `client open` never starts the service and fails with a network error. That is no longer true, and the new behaviour is better (see the flag #25 verdict).
5. **`pardner open --data … --output-file …`** (once the service was up again): returns in about 200 ms. Opening the grant URL in a new tab (`screenshots/step-5-new-tab.png`) shows the board, "Saved locally · synced". `client.log` exists. Matches.
6. **Original tab, focus.** `screenshots/step-6-original-tab-back.png`: the banner clears, "Saved locally · synced" shows, and the draft is intact (description text and P1). `screenshots/step-6b-saved.png`: **Save changes** succeeds and shows P1 with the new description. Matches. Geometry clean.
- Mobile (390x844, panel after save): `screenshots/mobile-check.png`, clean.
- Console: a single 410 (Gone) after the restart, the same as in STORY-137 (probably the pre-restart presence session). No page errors.

### Variations and edge cases walked
- **Reload the tab while the service is down.** `screenshots/var-reload-while-down.png`: `net::ERR_CONNECTION_REFUSED`, which the headless browser shows as a blank page (a real browser shows its own "can't be reached" page). The catalog's "Opening your workspace…" static shell cannot appear, because the service is what serves it. Reloading during an outage therefore drops the in-app Retry connection path (F-143-02). The draft is still in sessionStorage and returns when the service does.
- **`PORT_IN_USE` (foreign).** With a plain HTTP server on the saved port, both `pardner open` and `client open` give "http://127.0.0.1:65045 is answering but is not this Pardner client; stop that process or start with --http-port" (`screenshots/edge-port-in-use-foreign.png`). **Following the advice works:** `client serve --data … --http-port 65047` starts, and the next `pardner open` uses :65047 (`screenshots/edge-follow-http-port-advice.png`). The advice could name the exact command, since `pardner open` itself does not take `--http-port`.
- Not produced: `CLIENT_START_TIMEOUT`, `CLIENT_STOP_TIMEOUT`, and a project-runtime child crash with the parent still up (no fault injection available).

## Flagged claim verdicts
- **#25 (`client status` with a stale connection file returns a raw error; `client stop` is calm; `client open` fails with a network error):** partly CONFIRMED. `client status` gives `INTERNAL_ERROR: fetch failed`, and `client export` does the same (STORY-141). `client stop` is calm (`stopped:false`). The `client open` part is REFUTED: it now starts the service and issues a launch.
- **#23 (`PORT_IN_USE` foreign advice to use `--http-port` cannot take effect):** REFUTED. `client serve --http-port N` succeeds, and later `pardner open` follows the new port. (STORY-142 shows the opposite risk: the same advice lets a second copy of a restored client run.)

## Flow Log
- Ideal 2 (restart with `pardner open`, continue the draft). Actual: `client stop` (the cause), Retry connection (no effect), `client open` (which in fact restarted the service), refocus, Save = 2 effective recovery actions. That matches the ideal. No data re-entry: the draft survived.
- Hesitation: Retry connection gives no feedback, and `client status` replies with a raw INTERNAL_ERROR, so Jordan cannot easily tell whether the service is down.
- Duplicate paths: `pardner open` and `client open` now both start the service. The catalog's divergence note ("client open never does") is out of date.

Status: pass
