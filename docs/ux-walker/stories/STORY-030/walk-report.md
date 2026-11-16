# STORY-030: "Unconfirmed change" in the switcher and finding the saved request

Setup: Aisha's three-project client from STORY-029 stands in for Ben's "Security hardening" / "Release 4.2" ("Checkout rewrite" / "Hiring loop 2026"). The Wi-Fi drop was simulated by aborting the board operations request in Playwright (`route.abort('internetdisconnected')`), then restoring it. Walked twice (run 1 Backlog→Review, run 2 Review→In progress, screenshots from run 2). Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-030/`.

## Steps
1. **Set Status with the network dropping.** `screenshots/step-1-unconfirmed.png`: task panel shows red "Failed to fetch" / "Your last confirmed data remains available." / **Retry saved request**; the Status select shows the old value; header still "Saved locally · synced" (not "Local service disconnected"). Geometry clean apart from task-card false positives. F-030-01, F-030-02.
- **Variation: new change before retry.** `screenshots/var-new-edit-blocked.png`: New task disabled; banner "A request is awaiting confirmation." with Retry saved request. The "Resolve the saved request before starting another change." text did not appear because the button is disabled rather than refusing.
2. **Switch to Hiring loop 2026.** `screenshots/step-2-release.png`: opens normally. Geometry clean.
3. **Open switcher.** `screenshots/step-3-switcher-marker.png`: "Checkout rewrite — Saved locally · synced · unconfirmed change" (wraps to three lines). F-030-03.
4. **Pick Checkout rewrite.** `screenshots/step-4-notice.png`: full-width banner "A request is awaiting confirmation." + **Retry saved request**; card still in its old column. Geometry clean.
5. **Retry saved request (network restored).** `screenshots/step-5-retried.png`: banner gone; doc confirms the status changed (run 1: review, run 2: in-progress).
6. **Switcher again.** `screenshots/step-6-marker-gone.png`: suffix gone. Matches.
- **Variation: second tab.** `screenshots/var-second-tab.png`: no marker, no banner (F-030-04). Matches catalog.
- Mobile `screenshots/mobile-check.png`: no overflow.
- Console: one `net::ERR_INTERNET_DISCONNECTED` per run (the simulated drop). Videos: `videos/unconfirmed-change.webm`, `videos/second-tab.webm`, `videos/run1/`.

## Flagged claim verdicts
- **#32 (" · unconfirmed change" can sit next to "synced"):** CONFIRMED (`screenshots/step-3-switcher-marker.png`).

## Flow Log
- Ideal path 3 (see marker, switch back, Retry). Actual 3. Hesitation: "synced · unconfirmed change" and a generic banner that does not say which change is pending. The raw "Failed to fetch" at the moment of failure gives no reassurance.

Status: pass
