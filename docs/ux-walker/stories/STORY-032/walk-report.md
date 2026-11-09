# STORY-032: Last-project memory across reloads and sign-ins

Setup: Aisha's three-project client stands in for Raj ("Infra cost cuts" = "Docs revamp", "Hiring loop 2026" = "Release 4.2"). Each "launch" is a new Chromium browser with the saved profile storage plus a fresh `/open` grant (what `pardner open` does). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-032/`.

## Steps
0. Day 1: chose "Infra cost cuts", closed the browser.
1. **Next morning launch.** `screenshots/step-1-reopen-last.png`: opens "Infra cost cuts". Geometry: task-card false positive only. Matches.
2. **Switch to Hiring loop 2026.** `screenshots/step-2-switched.png`: last-project updated to Hiring's ID. Matches.
3. **Close and launch again.** `screenshots/step-3-relaunch.png`: opens "Hiring loop 2026". Matches.
- **Edge: last-project points at a non-existent ID.** Falls back silently to "Checkout rewrite" (the first project). Matches.
- **Variation: different browser (WebKit, no memory).** `screenshots/var-webkit-first-project.png`: opens "Checkout rewrite" (first in registry order). Matches. WebKit renders the filter selects much smaller than Chromium (F-032-01).
- Mobile (WebKit 390x844) `screenshots/mobile-check.png`: no overflow.
- Console: none. Video: `videos/next-morning.webm`.

## Flow Log
- Ideal path 1 (`pardner open` lands on the last project). Actual 1 in the same browser profile. In a different browser 1 + 2 (switcher, pick). No deep link exists (F-032-02).

Status: pass
