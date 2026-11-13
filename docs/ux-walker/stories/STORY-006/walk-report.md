# STORY-006 walk report: Startup shell stuck — service down or browser build broken

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-006/`. Client from STORY-009 (stopped, saved port 56726, project "Atlas onboarding"). **Simulation:** a broken or missing UI build was simulated in the browser with Playwright request routing (JS asset 404, or a JS request that never answers) instead of touching `ui-prototype/dist`. Config failures were also simulated by routing `/pardner/config` (500, `{}`, HTML). Blocked storage was simulated with an init script that makes `localStorage` throw. Video in `videos/`.

## Steps
1. **Bookmark with service down** (`screenshots/step-1-bookmark-service-down.png`): Chromium's own `ERR_CONNECTION_REFUSED` page; no Pardner surface exists (expected, as the story says).
2. **`pardner open`** with the stale connection file → `{"success":true,"localUrl":"http://127.0.0.1:56726/pardner/",…}`: restarted on the **saved** port, so the bookmark stays valid.
3. **Reload the bookmark** with the cookie (`screenshots/step-3-bookmark-after-open.png`): board opens. Geometry: task-card false positive only.
4. **Broken bundle.** JS 404: the failure text appears at once (`step-4a-bundle-404-immediate.png`). Hanging JS: "Opening your workspace…" at 3 s (`step-4b-bundle-hang-3s.png`), then at 13 s (`step-4c-bundle-hang-13s.png`) "Pardner could not finish loading. Reload the page; if this continues, rebuild the browser client and restart the service." The old line "If this page does not open, check that Pardner is running… (`pardner open`)" stays underneath, so two different diagnoses are shown at once (F-006-01). Geometry clean.
5. **Reload Pardner** → back to "Opening your workspace…" with the same result (`step-5-reload-pardner-click.png`).
- **Config 500** (`variation-config-500.png`): React screen "Pardner / The request failed. Try again. / Check that Pardner is running on your computer. Start it with `pardner open`, then retry." + **Retry connection**. Geometry clean. After un-routing, **Retry connection** recovered to the board (`variation-retry-connection-recovers.png`).
- **Config unreadable** (`variation-config-unreadable.png`): "The service returned an unreadable response. Retry the connection." Matches the story.
- **Config `{}`** (`variation-config-malformed.png`): shows "This is an agent and integration service. Open Pardner with `pardner open`." rather than the story's "configuration is incomplete" copy. An empty config is classified as a standalone service (F-006-03).
- **Storage blocked** (`variation-storage-blocked.png`): "Pardner could not open / Allow browser site storage, then reload…" + **Reload Pardner**. Matches.
- **JS disabled** (`variation-js-disabled.png`): "If this page does not open…" is shown *above* "Enable JavaScript to open Pardner.", so the less relevant advice comes first.
- **Mobile 390×844** (`screenshots/mobile-check.png`, config-500 state): clean reflow.
- Moving from the static shell to any React screen, the heading jumps from ~20 px to ~28 px and the text column shifts left by 20 px (505 → 485 px), visible as a jolt on load (F-006-02).

## Flagged claim verdicts
None of the flagged claims touch STORY-006.

## Flow Log
- Ideal 1 (`pardner open`, bookmark works again). Actual 1 + reload. Matches the ideal.
- Redundancy confirmed: four startup failure surfaces with different copy, and two buttons (**Reload Pardner** vs **Retry connection**) for the same act.

Status: pass
