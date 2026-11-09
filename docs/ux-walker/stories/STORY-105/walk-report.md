# STORY-105 walk report: Filtering Activity to goal and vein changes, and discovering where verdicts went

Walked 2026-11-09 as Dev Raman on his replica client (Chromium 1440×900), standing in for Priya. The project history from STORY-097 to STORY-104 includes:
- 5 vein creations and 2 goal creations
- 2 renames and 2 description edits
- 15 goal and vein status verdicts
- 4 resolves (status, goal, title, description)

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-105/`. Video: `videos/`.

## Steps
1. **Show → Goals and veins.** The feed was scrolled to y=600 first. After the change it reset to the top, "Showing 21 of 21" (`screenshots/step-1.png`).
   - The rows are resolves, "edited the description", "renamed goal", "moved vein … to goal", "created goal", "started vein …" and "added/removed … to/from vein".
   - **Zero "marked vein/goal" verdict rows.** Geometry: clean.
2. Priya cannot find the verdicts in a filter named for goals and veins (F-105-01).
3. **Show → Status changes and handoffs.** `screenshots/step-3.png`: "Showing 23 of 23". The 15 goal and vein verdict rows ("marked vein … Proven", "marked goal … Achieved") are mixed with 7 task moves.
   - The **status resolve** row ("resolved conflicting status on vein …") is *not* here. It sits under Goals and veins (see STORY-100 F-100-01).
4. **Performed by → Dev Raman · human.** `screenshots/step-4.png`: "Showing 9 of 9", every row by Dev.
   - The Performed by list offers **three identical "Setup agent · agent" options**, one per client, which cannot be told apart (F-105-03; same root as F-097-07).
5. **An actor with no matches** (one of the Setup agents): "Showing 0 of 0" and a centred "No activity matches these filters." (`screenshots/step-5.png`).
   - The `Show` select truncates its label to "Status changes and …" at 1440 px.

### Variations and edge cases
- **Read receipts:** "No activity matches these filters" (no comments had been read). **Actors registered:** "Showing 4 of 4", with rows such as "Maya Okafor registered Setup agent as an agent" (`screenshots/var-actors.png`).
- **Reload.** With Show = Goals and veins and Performed by = Tomás set, a page reload reset both to All changes / Any Actor (`screenshots/edge-reload.png`). Board filters survive a reload (STORY-109 step 3) (F-105-02).
- **Mobile.** `screenshots/mobile-check.png`: filters stacked, clean.

## Flagged claim verdicts
- **#43 Activity's Goals and veins filter excludes verdicts (they are under Status changes and handoffs), and Activity filters are not persisted while board filters are: CONFIRMED (both parts).**
  - Goals and veins showed 21 rows and 0 verdicts (`screenshots/step-1.png`). Status changes showed the 15 verdicts (`screenshots/step-3.png`).
  - After a reload, Show and Performed by were back to defaults (`screenshots/edge-reload.png`), while the board's filters persisted.
  - The catalog adds that status *resolves* go to Status changes. That part was **refuted**: they appear under Goals and veins.

## Flow Log
- The ideal path is 2 steps (one filter covering all plan changes). The actual path was 4 (Goals and veins, notice what is missing, switch to Status changes, mentally merge two lists), and the merged view still splits verdicts from verdict resolutions.
- There is no single filter for "everything about goals and veins".
- Console and page errors: none.

Status: pass
