# STORY-146: A crash screen caused by blocked browser storage

Setup: client "Owen Fitzgerald", project "Strict Mode". Safari's "Block all cookies" cannot be toggled in Playwright, so I simulated blocked site storage in WebKit with an init script that makes `localStorage` and `sessionStorage` throw `SecurityError: The operation is insecure.`, which is what Safari does. Each attempt used a fresh one-time grant from the client's `/open`. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-146/`.

## Steps
1. **Open the `#grant=…` URL with storage blocked (WebKit).** `screenshots/step-1-storage-blocked.png`: **"Pardner could not open"** / "Allow browser site storage, then reload. If this continues, check that the service and browser build are up to date." with **Reload Pardner**. The grant was removed from the URL. Matches the catalog's second branch. The copy does not say *how* to allow storage in Safari. The "service and browser build" clause is developer-facing (F-146-01). Geometry clean.
2. **Reload Pardner without changing settings.** `screenshots/step-2-reload-without-change.png`: the same crash screen again, because storage still throws. The catalog expected the signed-out screen. In practice the crash screen repeats, which is fine but gives no sign that the retry happened (F-146-02). Geometry clean.
   - **Allow storage, then Reload Pardner in the same tab.** Simulated by blocking storage only on the first load. `screenshots/step-2b-allowed-then-reload.png`: the board opens. The session cookie had already been set during the failed first load, so the used grant does not matter. This is the ideal path, and it works.
3. **Storage allowed (a clean WebKit context), `pardner open` again (new grant).** `screenshots/step-3-allowed.png`: the board opens, "Saved locally · synced". Matches. Geometry: card wrap only.
- Mobile (390x844, board): `screenshots/mobile-check.png`, clean.
- Console in step 1: two `SecurityError: The operation is insecure.` page errors (expected from the simulation).

### Variations and edge cases walked
- **Partial storage (only sessionStorage throws, Chromium).** `screenshots/edge-partial-open.png`: the same "Pardner could not open" crash screen at load. The catalog expected the board to open and the *first change* to fail with "Browser storage is unavailable…". With this simulation that state was not reachable, because the app needs sessionStorage at render.
- **Cookie cannot be set** (simulated by stripping `Set-Cookie` with Playwright request interception). `screenshots/var-cookie-blocked.png`: the board rendered, with "Live updates disconnected. Reconnecting automatically." and "Local service disconnected". **Inconclusive.** Playwright's `route.fetch()` keeps cookies in the context while it removes the header, and WebSockets bypass the interception, so this does not faithfully reproduce Safari's cookie blocking. I am not filing it as a finding. The real Safari cookie-blocked path is BLOCKED here.

## Flagged claim verdicts
- None of the flagged claims name this story.

## Flow Log
- Ideal 2 (allow site storage, reload). Actual: crash screen, Reload (same screen, wasted), change the browser setting, Reload Pardner = 3. That is one wasted reload. The main friction is working out which Safari setting to change (F-146-01).

Status: pass
