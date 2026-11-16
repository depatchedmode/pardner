# STORY-051: Switch to another tab, then close the window (hidden → Idle, pagehide → Offline)

Setup: Harbor Billing hub (Maya) with Dev Patel's client (dev-mbp) joined as a replica. Two Chromium contexts in one run: Maya on the hub, Dev on his client with "Fix timezone drift in renewal emails" open. Video of Maya's view in `videos/`.

**Simulation note:** headless and headed Playwright Chromium on this machine keep `document.visibilityState === "visible"` when another tab is brought to front or the window is minimized (checked both). Step 1 was therefore driven by overriding `document.visibilityState`/`hidden` to "hidden" and dispatching `visibilitychange` in Dev's page (`s051b.mjs`). Window close used a real `page.close({runBeforeUnload:true})`, which fires `pagehide`.

## Steps
0. (`screenshots/step-0-maya-dev-active.png`) Maya sees "Dev Patel, human, active" and the card's "Here now" marker "Dev Patel, human, active, on this task".
1. **Dev's tab hidden** (`screenshots/step-1-maya-dev-idle.png`, zooms `step-1-card-zoom.png`, `step-1-header-zoom.png`): within ~5 s Maya sees "Dev Patel, human, idle" (dashed ring) and the card keeps "Dev Patel, human, idle, on this task". Matches the story. Idle/active differ only by ring style (F-051-02). Geometry clean apart from the multi-line task-card false positive.
2. **Dev returns and clicks** (`screenshots/step-2-maya-dev-active.png`): Active again within ~5 s. Pass.
3. **Dev closes the window** (`screenshots/step-3-maya-dev-offline.png`): within 4 s Maya sees "Dev Patel, human, offline" (grey DP, no dot) and the card's "Here now" marker is gone. Pass. Geometry clean (false positive only).
4. **Maya opens Dev's profile** (`screenshots/step-4-profile.png`): "Human · Offline", "Live sessions 0" and the "No live session reported to this view…" note. Pass.
- Edge, reporter errors (`screenshots/edge-dev-reporter-failing.png`, `screenshots/edge-maya-view.png`): Dev reopened with every `/sessions` and `/sessions/SID/report` request answered 500. After 20 s Dev's page shows no notice, "Saved locally · synced", and his own avatar reads "Dev Patel, human, offline" in his own header (F-051-01). Maya sees Dev offline.
- Variation "laptop sleeps without pagehide" was not walked here; STORY-054 step 11 verified the 45 s TTL expiry path for an agent session.
- Mobile check: same board layout as STORY-048 `mobile-check.png`; not repeated (no new screen in this story).
- Console/page errors: Maya none, Dev none (the dev2 run logged the simulated 500 resource errors only).

## Flagged claim verdicts
- #46 (part) "reporter errors are swallowed" — **CONFIRMED**: with presence requests failing, nothing is shown to the person; only their own avatar silently turns offline.

## Flow Log
- Ideal 0 user actions — actual 0; transitions arrived within one 5 s poll each (hidden → idle 5 s, return → active 5 s, close → offline 4 s).
- No hesitation for Maya beyond reading dashed vs solid.

Status: pass
