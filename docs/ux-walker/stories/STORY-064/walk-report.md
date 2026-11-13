# STORY-064: Jump from a vein to its tasks, then create a task under that filter

Walked 2026-11-09 in Chromium 1440×900 with video. Project "Quarry ML" on Maya Okafor's client (she stands in for Elena). The goal "Cut inference cost 40%" and the vein "Distill ranker to 50M params" were created through the operation API (`goal.create`, `vein.create`), with 4 vein tasks plus 2 unrelated ones. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-064/` (video in `videos/`).

## Steps
0. **Goals view**, with Status filter set to "Review" beforehand to test the reset — `screenshots/step-0.png`: goal "Cut inference cost 40%" with an Open select; vein button "Distill ranker to 50M params", Open select, "4 tasks". Geometry: one `unevenRows` hit on the nav buttons (widths 69/69/82/81, sized to their labels; intentional). By eye, the view nav sits at y≈107 here but at y≈132 on Tasks, because the filter labels are missing. The tabs jump about 25 px when you switch views.
1–2. **Click the vein title** — `screenshots/step-2.png`: switches to Tasks. Assigned to = All, Status = All (the "Review" filter was reset), Vein = the vein, with the full title in `title`. The four cards each carry the mint vein label; the Vein select truncates to "Distill ranker to 50M …". Geometry: clean. Matches.
3. **New task** — `screenshots/step-3.png`: form labels are Title, Description, Status, Priority, Assignee, Tags. **There is no Vein field**, and nothing says the active vein filter will not apply. Geometry: clean.
4–5. **Fill and create** — `screenshots/step-5.png`: the detail panel opens; the summary line reads "Maya Okafor · human · P1" with no vein entry. Geometry: clean.
6. **Close** — `screenshots/step-6.png`: focus goes to **New task** (the new card is filtered out). The board still shows the 4 vein cards; the new task is nowhere on it, and no notice says it is hidden. Geometry: clean. Confirmed.
7. **Link from the terminal** — `pardner client operation --project … --request '{"type":"task.link-vein",…}' --data …` returned `success:true`. (I used `client operation` because the story's `pardner vein add` needs a token file; the person has to know the task ID and the vein ID.)
8. **Live update** — `screenshots/step-8.png`: within about 2.5 s the new P1 card appears at the top of Backlog with the vein label. Goals now shows "5 tasks" (`screenshots/step-8b.png`). Geometry: clean.
9. **All veins** — `screenshots/step-9.png`: the full board returns. Geometry: two `wrappedControls` on task cards (intentional).

## Variations
- **Nav Vein select** (`screenshots/var-nav-select.png`): with Status = "In progress", choosing the vein in the nav keeps Status at In progress. The Goals entry resets it. The behaviour diverges as the story describes. Confirmed.
- Activity entry point: not walked (owned by the Activity topic).

Mobile check (`screenshots/mobile-check.png`, 390×844, vein-filtered board): no page overflow. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts
- **#38 (New task panel has no Vein field; a task hidden by active filters gets no notice): CONFIRMED.** The form lists only Title, Description, Status, Priority, Assignee and Tags (`screenshots/step-3.png`). After creating under the vein filter, the task is absent from the board, focus falls back to **New task**, and the only live text is "Saved locally · synced" (`screenshots/step-6.png`).

## Flow Log
- Ideal 5; actual 9, plus a terminal detour that needs two IDs the UI never shows (the task ID and the vein ID).
- Hesitation: scanning the form for a Vein field (step 3); wondering where the created task went (step 6).
- Re-entry: the vein must be named again in the CLI although the board is already filtered to it.
- Divergent routes: the Goals vein title resets the other filters; the nav Vein select keeps them.

Status: fail
