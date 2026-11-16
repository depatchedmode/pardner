# STORY-063: Filter the board to one person's open work and have it remembered

Walked 2026-11-09 in Chromium 1440×900 as Priya Nair, on her own client that joined Daniel Reyes's hub project "Harbor Mobile". 39 tasks across all columns; 4 assigned to the agent (3 In progress, 1 Review). The agent is the grant-backed "Setup agent · agent" standing in for codex-harbor (see STORY-059). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-063/`.

## Steps
0. **Full board** — `screenshots/step-0.png`: 39 cards in 7 columns. Geometry: `wrappedControls` hits on task cards only (intentional).
1. **Assigned to → the agent** — `screenshots/step-1.png`: counts update (Up next 1, In progress 3, Review 1; the rest 0, "No tasks here"). Geometry: clean. The options list has **two identical "Setup agent · agent" entries** (Daniel's and Priya's setup agents); I picked the right one only by its value (see F-059-01).
2. **Status filter → In progress** — `screenshots/step-2.png`: one centred column 760 px wide (x = 340–1100) with heading "In progress 3". Geometry: clean. Matches. The wide empty gutters on both sides look like a different layout rather than a filtered one; nothing says "filtered".
4. **Open a card, Escape on the heading** — `screenshots/step-4.png`: the panel closes and focus returns to the card "Agent: migrate keychain wrapper". Matches.
5. **Next morning** — the browser state was saved, a new `/open` grant used, and later the client service was stopped and restarted (same port 53275 kept, so the same origin). `screenshots/step-5-sameport.png` and `screenshots/step-5-restarted.png`: Assigned to = the agent, Status = In progress, and the last open task panel ("Agent: migrate keychain wrapper") reopened. Geometry: clean. Matches. The reopened panel covers the filter selects and the column count, so the morning view gives no hint that filters are active.
   A fresh browser profile (no saved localStorage) opens unfiltered, as expected for per-browser storage (`screenshots/step-5.png`).
6. **Reset both selects** — `screenshots/step-6.png`: all seven columns return. Matches.

## Variations
- Goals and back: the filters are kept (Status "in-progress", agent still selected). Matches.
- Per-project filters: not walked separately; Priya has a single project.

Mobile check (`screenshots/mobile-check.png`, 390×844, Status = In progress): header (3 rows), view nav and three full-width filter selects take ~545 px, so only about 1.5 cards are above the fold. Geometry: `wrappedControls` on task cards only.

Console/page errors: none.

## Edge cases
- No "Clear filters" control and no filtered indicator: confirmed (see F-065-03). Not separately logged here.
- Blocked localStorage: not tested.
- The URL does not encode filters: confirmed (the URL is just `/pardner/`).

## Flagged claim verdicts
No flagged claim names STORY-063.

## Flow Log
- Ideal 2; actual 2. Persistence works across browser restart and service restart.
- Hesitation: the duplicate "Setup agent · agent" options; the single centred column.
- No re-entry.

Status: pass
