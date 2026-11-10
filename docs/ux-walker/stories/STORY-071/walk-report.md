# STORY-071: A shared board changes underneath the filters

Walked 2026-11-09 in Chromium 1440×900 with video. Daniel Reyes's hub browser (he stands in for Lina) was filtered to Status = Up next. Priya Nair's separate client made changes through the person operation API and, for presence, through her own browser. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-071/` (video in `videos/`).

Note: an earlier probe through Priya's browser moved "Harbor task 16" to Review while I captured the update payload shape. It appears in Activity as "Priya Nair moved Harbor task 16 to Review".

## Steps
0. **Filtered board** — `screenshots/step-0.png`: single column "Up next 8". Geometry: `wrappedControls` hits on task cards only (intentional).
1. **Priya moves "Refund flow for annual plans" to In progress** — `screenshots/step-1a.png` (150 ms later) and `screenshots/step-1.png`: the card is gone and the count reads 7, with no animation, toast or live-region text (the live region still says "Saved locally · synced"). Geometry: card false positives only. Matches the story; the silent disappearance is confirmed.
2. **Activity** — `screenshots/step-2.png`: the top entry is "Priya Nair moved Refund flow for annual plans to In progress". Clicking the subject opens the detail panel; the view stays on Activity (`screenshots/step-2b.png`). Geometry: clean. Matches.
3. **Concurrent edits** — Daniel and Priya renamed "Chargeback email template" at the same moment from the same base revision; both returned `success`. `screenshots/step-3.png`: the card shows "Chargeback email template v2 / Unassigned / Conflicting edits". Opening it (`screenshots/step-3b.png`) focuses the task heading and shows an amber "Resolve title" block below Status: "Both edits are preserved. Choose the value to keep." with Daniel's and Priya's values and **Keep this title** buttons. Matches. On the card, "Conflicting edits" is plain muted grey text styled like "Unassigned"; it does not stand out (`screenshots/var-presence.png`).

## Variation: presence
- Priya opened "Dunning retry schedule" in her browser. Her PN avatar appeared on Daniel's card 2–5 s later (`screenshots/var-presence.png`), and the panel showed "Here now PN" (`screenshots/var-presence-panel.png`). After Priya closed her browser, PN stayed on the card for 30–40 s. The marker on the card and in the panel is the Redundancy Candidate the story predicted; confirmed.

Mobile check (`screenshots/mobile-check.png`, 390×844, filtered): no overflow.

Console/page errors: none.

## Edge cases
- Not virtualised: not stress-tested with hundreds of cards (out of scope for the time box).

## Flagged claim verdicts
No flagged claim names STORY-071. (#40's raw slugs in conflict values were not seen here; the title conflict rendered human-readable values with Actor names.)

## Flow Log
- Ideal 1 (watch the column update); actual 3. The card vanished without explanation, so the person had to switch to Activity and find the event to learn where it went.
- Presence is shown twice (card and panel) and lags 30–40 s after a viewer leaves.

Status: pass
