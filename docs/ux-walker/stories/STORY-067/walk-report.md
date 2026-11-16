# STORY-067: The create request fails or stays pending

Walked 2026-11-09 in Chromium 1440×900 with video, on a dedicated client service for Owen Gallagher (fixed `--http-port`), project "Brightline Retail". The outage was real: I stopped the client service with `client stop` after the draft was typed, clicked **Create task**, then restarted the service with `serve.sh`. A second pass used a Playwright route abort to check the Create-again behaviour. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-067/` (video in `videos/`).

## Steps
0. **Draft** — `screenshots/step-0.png`: Title "Update POS receipt footer". Geometry: clean.
1–2. **Service stopped, Create task** — `screenshots/step-2.png`: inside the form, above the actions, an error box reads "**Failed to fetch**" / "Your last confirmed data remains available." / **Retry saved request**, with no Dismiss. Title is read-only; Status, Priority and Assignee are disabled; **Discard draft** is disabled; focus is on **Create task**. The header reads "Local service disconnected" and **New task** is disabled. A page-level banner also appears: "The local Pardner client did not respond. Check that it is still running, then retry." with **Retry connection**. Geometry: clean.
   - Deviation from the story: **Create task is not disabled** (`disabled=false`, no `aria-disabled`, still styled primary).
3. **Create task again** — `screenshots/step-3.png` (route-abort pass): no request is sent. The error box text changes to "Resolve the saved request before starting another change." and replaces the original "Failed to fetch" cause.
- **Variation: close the panel first** (`screenshots/var-closed.png`): the page shows "A request is awaiting confirmation." with **Retry saved request**, stacked above "The local Pardner client did not respond…" with **Retry connection**. Two retry buttons and three status messages are on screen at once. **New task** is disabled.
- **Service back** (`screenshots/step-3a.png`): the header recovers to "Saved locally · synced" by itself. The pending notice stays, and **New task** stays disabled until the request is retried.
- **Variation: reload** (`screenshots/var-reload.png`): the pending notice returns after the reload. The draft panel is gone, but the payload sits in the pending operation.
4. **Retry saved request** — `screenshots/step-4.png`: the task "Update POS receipt footer" is created and its detail opens. The document holds **exactly one** task with that title, and both POSTs carried the same operationId (`bb7106a7-…`). **New task** is enabled again. Matches the story's goal (exactly once).

Mobile check (`screenshots/mobile-check.png`, 390×844): no overflow.

Console/page errors: `net::ERR_CONNECTION_REFUSED` ×4 during the deliberate outage (expected); none otherwise.

## Edge cases
- Definitive-code rejections (`INVALID_ARGUMENT` etc.) clearing the pending request were not exercised.

## Flagged claim verdicts
No numbered flagged claim names STORY-067. Related #1–#3 (non-definitive codes leave the request stuck) concern `FORBIDDEN`, `REVOKED` and `OPERATION_INTEGRITY_CONFLICT`, which were not produced here. A network failure is correctly retryable.

## Flow Log
- Ideal 2 (submit, one retry); actual 3–4. The person may click **Create task** again (it looks enabled) before finding **Retry saved request**. After the service returns, the pending request still needs a manual retry.
- Duplicated controls: **Retry saved request** and **Retry connection** on the same screen; three status messages ("Local service disconnected", "did not respond…", "awaiting confirmation").

Status: pass
