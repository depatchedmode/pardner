# STORY-137: Wi-Fi drops mid-save and the saved request is replayed

Setup: client "Priya Natarajan", project "Ledger Sync v2" with "Migrate invoices table to UUID keys" (In progress) and "Backfill ledger checksums" (Backlog). The outage was real: `client stop --data …` on the running service, then a restart on the same data directory (the saved port 61735 was reused). Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-137/`.

## Steps
1. **Open the task.** `screenshots/step-1-panel-open.png`: the panel shows "Saved locally · synced", Status select = In progress. Geometry: one `wrappedControls` hit, the multi-line task card title (by design). Matches.
2. **Service stopped, Status → Review.** `screenshots/step-2-saving.png` then `screenshots/step-3-error.png`: the panel shows a red notice with the heading **"Failed to fetch"**, then "Your last confirmed data remains available." and **Retry saved request**, with no Dismiss. The select falls back to In progress. The header and panel both read "Local service disconnected", and a page banner says "The local Pardner client did not respond. Check that it is still running, then retry." with **Retry connection**. Geometry is the same as step 1. The behaviour matches, but the heading is the raw browser error (F-137-01). The panel still shows "Here now PN" with a green presence dot while the service is down (F-137-05).
3. **Close the panel.** `screenshots/step-4-closed.png`: the page notice reads "A request is awaiting confirmation." with **Retry saved request**, stacked above the "did not respond" banner. The card is still in In progress. Geometry clean (card wrap only). Matches.
4. **Socket closed.** `screenshots/step-5-disconnect.png`: the second banner is "The local Pardner client did not respond…" with **Retry connection**, not the expected "Live updates disconnected. Reconnecting automatically." The header shows "Local service disconnected". Geometry clean. The copy differs from the catalog but is acceptable.
5. **New task.** `screenshots/step-6-newtask-disabled.png`: **New task** is disabled. Matches.
6. **Variation: retry while the service is still down.** `screenshots/step-6b-retry-while-down.png`: the page notice turns into a red "Failed to fetch / Your last confirmed data remains available / Retry saved request" block. The pending request (same operationId) is still in sessionStorage. Matches.
7. **Switcher while down.** `screenshots/step-6c-switcher.png`: the item reads "Saved locally · synced · unconfirmed change" while the header reads "Local service disconnected" (F-137-03). The geometry spill is the open menu overlay, which is intended.
8. **Service restarted, online/focus fired.** `screenshots/step-7-service-back.png`: the header returns to "Saved locally · synced", but the red **"Failed to fetch"** block stays under the header until the person clicks Retry (F-137-02). The task is still `in-progress` on disk, so nothing was applied. Geometry clean.
9. **Retry saved request.** `screenshots/step-8-retried.png`: the notice clears and the card moves to Review. On disk the status has exactly one revision, so the replay was applied once with no duplicate. sessionStorage pending is empty. Matches.

### Variations walked
- **Full editor Save changes while down (merged).** `screenshots/var-editor-save-down.png`: the editor stays open with P0 and the description intact. "Failed to fetch / Your last confirmed data remains available. / Retry saved request" sits above **Save changes**, which stays enabled. **Hand off work** wraps onto a second row under Save/Cancel. Matches apart from the raw heading.
- **Reload with a pending request (service back up).** `screenshots/var-reload-pending.png`: after the reload, "A request is awaiting confirmation. Retry saved request" is shown again. Matches.
- **Second change while pending.** `screenshots/var-second-change-refused.png`: a quick Status change on the other task gives "Resolve the saved request before starting another change." with **Retry saved request**, and nothing is sent. Matches.
- **Retry replays the editor save.** `screenshots/var-editor-retried.png`: the task saved as P0 with the new description. Matches.
- **STALE_UPDATE.** The status was changed to Dead end through the API while the browser held a pending Review change. `screenshots/var-stale-update.png`: **"This field changed since it was read; refresh its context"** / "Your draft is preserved. Review the latest context before making a new edit." with **Dismiss**. Pending was cleared. A quick Status select has no draft, so "Your draft is preserved" is wrong here (F-137-04, flag #39).
- **Mobile (390x844), pending and disconnected.** `screenshots/mobile-check.png`: two stacked notices plus the wrapped header take the first ~490px, and only the column headers of the board are visible (F-137-06). Geometry clean. `screenshots/mobile-after-retry.png` shows the recovered state.
- Not walked: `RUNTIME_TIMEOUT` (it cannot be produced from the browser without fault injection), and a new tab losing the pending request (by design, sessionStorage is per tab).

Console: 12 `ERR_CONNECTION_REFUSED` during the deliberate outage, one 410 (Gone) after the restart (most likely the pre-restart socket or presence session), and one 409 for the deliberate stale replay. No page errors.

## Flagged claim verdicts
- **#32 (switcher labels stale, " · unconfirmed change" next to "synced"):** CONFIRMED. `screenshots/step-6c-switcher.png` shows "Saved locally · synced · unconfirmed change" while the service is down.
- **#39 (STALE_UPDATE says "Your draft is preserved" for a quick Status select):** CONFIRMED. See `screenshots/var-stale-update.png`.

## Flow Log
- Ideal path 3: pick the status, see it saved, Retry once. Actual: pick the status, then (after the outage) Retry once. The retry is the only extra step, and it is the one the ideal path allows. There was no data re-entry.
- Hesitation points: after the restart the header says "synced" while a red "Failed to fetch" block remains, so it is unclear whether the change is safe. Nothing tells the person that Retry is now expected to work.
- Duplicated information: the pending state appears as the panel notice, the page notice, the switcher suffix and the disabled New task. "Local service disconnected" appears in both the header and the panel SaveStatus, next to a third "did not respond" banner.

Status: pass
