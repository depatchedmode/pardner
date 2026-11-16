# STORY-099 walk report: Spotting "Ready for a verdict" and drilling into the vein's tasks

Walked 2026-11-09 as Maya Okafor on the hub client (Chromium 1440×900), standing in for Priya. Ada's CLI set up the data:
- "Lazy-load PDF renderer" has 3 tasks: two Completed and "Swap pdf.js for pdfium wasm" in Dead end.
- "Batch Stripe webhooks" has 2 tasks: Coalesce is In progress and Retry is in Backlog.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-099/`. Video: `videos/`.

## Steps
0. On Tasks, the Status filter was set to In progress first, to test whether it resets (`screenshots/step-0-filters.png`). Setting **Assigned to** by name failed because its options read "Maya Okafor · human", so only the status filter was pre-set.
1. **Goals.** `screenshots/step-1.png`: "Lazy-load PDF renderer" reads "3 tasks" with an amber **Ready for a verdict** label. "Batch Stripe webhooks" reads "2 tasks" with no label. Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
2. **What does it mean?** The label is a plain `span.verdict-label` with no `title` and no help. Hovering shows nothing (`screenshots/step-2-hover.png`) (F-099-02).
3. **Click the vein title.** `screenshots/step-3.png`: the view switches to Tasks with **Vein** = "Lazy-load PDF rende…", which is truncated in the select (F-099-04). Assigned to and Status filter were both reset to All, so the In progress filter was wiped as the catalog describes. **Focus went to `<body>`**, not to the Tasks nav button the catalog expects (F-099-01). Geometry: clean.
4. **Columns.** Completed shows 2, Dead end 1, and every other column "No tasks here". Each card carries the green "Lazy-load PDF renderer" label.
5. **Dead end card.** `screenshots/step-5.png`: the panel shows "Veins: Lazy-load PDF renderer (Open)" as a plain `<p>` with no link (F-099-05). Esc closes it and returns focus to the card.
6. **Edge, reopened task.** Ada moved one Completed task back to In progress. The label vanished on Goals (`screenshots/edge-reopened.png`) and came back when the task was completed again (`screenshots/step-6.png`).
7. **Proven.** Setting **Status of vein Lazy-load PDF renderer** to Proven removed the label (`screenshots/step-7.png`).
8. **Back on Tasks.** `screenshots/step-8.png`: the Vein filter is still "Lazy-load PDF renderer". The board shows only that vein's tasks. The only signal is the select's value: no "filtered" chip, count or Clear (F-099-03).
- **Mobile.** `screenshots/mobile-check.png`: the vein rows stack as button / select + count. No overflow. Geometry: clean.

## Flagged claim verdicts
No flagged claim touches this story directly. Claim #38 (a hidden-task notice) belongs to STORY-064/065.

## Flow Log
- The ideal path is 4 steps (Goals, see label, click vein, return and set status); the actual path was 4.
- Hesitation at step 2: "Ready for a verdict" is not explained and could be read as "approved".
- The vein click silently discarded the pre-set Status filter (In progress). Restoring it needs re-entry (see STORY-109).
- Vein membership is shown in 4 places (card label, Vein filter, "N tasks", "Veins:" line). Only the Goals title navigates.
- Console and page errors: none.

Status: pass
