# STORY-035: Two tabs racing the same Start and Join

Setup: client "Jordan Lee" with project "Ops backlog"; two tabs (A and B) in one browser context (shared localStorage, separate sessionStorage). For the Join variation, Lena's hub issued one Human invitation for "Data pipeline audit". Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-035/`.

## Steps
1. **Tab A and tab B on Start or join, both typed "Q3 roadmap".** `screenshots/step-0-tabA-ready.png`. Geometry clean.
2. **Both pressed Start project concurrently.** Both tabs reached "Project: Q3 roadmap".
3. **Both succeed.** Tab A's switcher (`screenshots/step-3-tabA-switcher.png`) and tab B's (`screenshots/step-3-tabB-switcher.png`) list "Ops backlog", "Q3 roadmap", "Q3 roadmap", indistinguishable except for the check mark. Same after reload (`screenshots/step-3-after-reload.png`). The `.menu-anchor` geometry spill is the dropdown overlay. Confirms the catalog; F-035-01.
- **Variation: same invitation pasted in both tabs.** Tab A joined (`screenshots/var-join-race-tabA.png`); tab B (`screenshots/var-join-race-tabB.png`): "Invitation belongs to a different recipient" / "This invitation was already used by someone else. Ask for a new one." F-035-02. Invitation text masked.
- **Edge: tab B already open.** Tab A started "Q4 plan"; after 17 s tab B's switcher still lacked it (`screenshots/edge-tabB-stale-list.png`). F-035-03.
- Same-tab double click: not separately exercised; the button is disabled while busy (seen in STORY-024).
- Mobile `screenshots/mobile-check.png`: no overflow.
- Console: no errors. Videos: `videos/tabA.webm`, `videos/tabB.webm`.

## Flagged claim verdicts
- **#32 (switcher labels and project list stale between session refreshes):** CONFIRMED for the project list (`screenshots/edge-tabB-stale-list.png`).

## Flow Log
- Ideal path 2 (name, Start). Actual 2 per tab, but the goal "without creating it twice" failed: nothing de-duplicates by name across tabs and nothing warns.
- After the join race, tab B's advice ("Ask for a new one") would send Jordan on an unnecessary errand.

Status: pass
