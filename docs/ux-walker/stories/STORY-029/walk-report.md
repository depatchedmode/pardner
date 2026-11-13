# STORY-029: Switching between projects with the header switcher (mouse and keyboard)

Setup: one client ("Aisha Rahman") with three hub projects: "Checkout rewrite" (tasks Rotate API keys, Split payment service), "Hiring loop 2026" (Draft rubric), "Infra cost cuts" (Audit idle instances). Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-029/`.

## Steps
0. **Checkout board with an Edit-task draft.** Opened Rotate API keys, typed "Rotate API keys (draft edit)" in Title. `screenshots/step-0-checkout-with-draft.png`. Geometry: two wrappedControls hits on task cards (multi-line cards by design; not defects).
1. **Open switcher by click.** `screenshots/step-1-menu-open.png`: menu with three `menuitemradio` items plus **Start or join a project…**; focus lands on the checked "Checkout rewrite". Geometry: `.menu-anchor` spill is the dropdown overlay (intentional). Matches.
2. **Scan items.** Each item shows name + "Saved locally · synced" (all hubs here, so no "waiting for hub" item could be produced). Current item repeats the header status (F-029-01).
3. **Pick Infra cost cuts.** `screenshots/step-3-opening.png` (transition), `screenshots/step-3-infra.png`: Infra board with "Audit idle instances"; `last-project` updated to Infra's ID. Geometry clean apart from the card false positive.
4. **Keyboard.** Focus switcher, ArrowDown → menu opens with focus on "Infra cost cuts"; End → "Start or join a project…"; Home → "Checkout rewrite"; `screenshots/step-4-keyboard-home.png`. Enter → Checkout opens. Matches.
5. **Back on Checkout.** `screenshots/step-5-back-on-checkout.png`: Task details panel for Rotate API keys reopened with Title still "Rotate API keys (draft edit)". Matches.
- **Variations:** Escape closes the menu and returns focus to the switcher (confirmed). Tab closes the menu and moves focus to the next control (Aisha's avatar). Choosing the already-checked project closes the menu with no "Opening project…" (confirmed).
- **Narrow:** `screenshots/narrow-700.png` and `screenshots/mobile-check.png` (390x844, menu open): menu fits, no page overflow, labels on one line. At 390 the Task details panel becomes a full-screen sheet that covers the header (`screenshots/mobile-panel-open.png`); Close is visible, so the switcher is one tap away. Acceptable.
- Console: no errors. Video: `videos/switcher.webm`.

## Flagged claim verdicts
- **#32 (switcher labels and project list stale between session refreshes):** CONFIRMED by other stories on this run: STORY-028 (`../STORY-028/screenshots/step-5-switcher.png`, switcher "waiting for hub" while header "synced") and STORY-035 (a project created in another tab is missing from the switcher until reload). Not reproducible with three always-synced hub projects here.

## Flow Log
- Ideal path 2 (open, pick). Actual 2 by mouse; 4 key presses by keyboard. No hesitations, no re-entry; the draft was preserved.
- Duplicated information: current project's sync status in both switcher and header.

Status: pass
