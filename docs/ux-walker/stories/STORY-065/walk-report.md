# STORY-065: Create a task that the active filters hide

Walked 2026-11-09 in Chromium at 1280×800 (laptop) with video. Project "Pinecrest HR" on Maya Okafor's client (she stands in for Marcus Chen): 3 Review tasks assigned to Maya, 2 Backlog tasks. Filters: Status = Review, Assigned to = Maya Okafor · human. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-065/`.

## Steps
0. **Filtered board** — `screenshots/step-0.png`: a single centred "Review 3" column with Maya's three cards. Geometry: clean.
1. **New task** — `screenshots/step-1.png`: the defaults are Status Backlog and Assignee Unassigned; the filters do not prefill the form. Matches. The 680 px panel covers 420 px of the 760 px Review column, and it also covers the whole filter row, so the active filters are out of sight while composing. Geometry: clean.
2–3. **Title, Create task** — `screenshots/step-3.png`: the detail panel opens, so the create clearly succeeded. Geometry: clean.
4. **Escape on the focused heading** — `screenshots/step-4.png`: the board still shows only Review with 3 cards; focus lands on **New task**; the only live text is "Saved locally · synced". No hidden-by-filter notice. Geometry: clean. Matches the story, and the defect is confirmed.
5. **Reset both filters** — `screenshots/step-5.png`: "Leave balance shows negative after carry-over" is in Backlog (count 3). Geometry: two `wrappedControls` on task cards (intentional).

## Variation
- Status Review and Assignee Maya set in the form (`screenshots/var-matching.png`): the card appears in the filtered column, and Escape focuses the card "Timesheet approval reminder". Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844, filtered board): single column, full width, no overflow. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts
- **#38 (a task hidden by the active filters gets no notice): CONFIRMED.** After create and close, the task is not rendered, focus falls back to **New task**, and no notice or live text mentions the filters (`screenshots/step-4.png`). (The "no Vein field" half is confirmed in STORY-064.)

## Flow Log
- Ideal 3 plus a clear signal; actual 3 plus 2 filter resets to find the task. No signal is given.
- Hesitation: "is the task missing?" (step 4).
- The panel hides the filter row, so the cause is not visible while creating.

Status: pass
