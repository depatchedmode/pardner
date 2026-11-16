# STORY-114 walk report: Cancel a running T3 run, then release the cancellation hold

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-114/`.

**Setup.** Uses the fake T3 thread `thr_01JD8M4Q` (mapped in STORY-112). Follow-up A ("Refactor only the rounding helper…") was Running as T3 run 4, with partial output "Partial: rewrote src/export/csv.ts and src/export/xlsx.ts". Follow-up B ("Then add a changelog entry.") was queued behind it. Before cancelling, `slowInterrupt` was turned on in the fake, so T3 acknowledges the interrupt without ending the run. This stands in for a slow T3.

## Steps
0. **Running** (`screenshots/step-0-running.png`): A shows **Cancel this run**. Geometry: clean.
1. **Cancel this run** (`screenshots/step-1-cancel-click.png`, `screenshots/step-1-cancel-requested.png`): A reads "Cancellation requested" in amber. The session shows "Dispatch held: Cancellation of run:thread:thr_01JD8M4Q:ordinal:4 holds queued work". Confirmed, apart from the raw run ID format. There is no confirmation prompt; the hold makes it safe. Geometry: clean.
2. **Repeat cancellation** is shown on the `cancel_requested` card. Clicking it returns 200 (`screenshots/step-2-repeat.png`). Confirmed.
3. **Release too early** with the evidence "Stopped scope creep": 409 `INVALID_EXECUTION_STATE` "Cancellation has not reached a terminal state" (`screenshots/step-3-release-too-early.png`). Confirmed. As in F-111-01, the message appears at the top of the pane, out of view, and is cleared by the next poll.
4. **T3 ends the run as interrupted** (`screenshots/step-4-ended.png`): "Ended: interrupted", with the partial output under **Output captured from T3 (may still change)**. Confirmed. B stays "Queued in Pardner", with the reason now "Cancellation of run:… holds queued work".
5. **Hold form** (`screenshots/step-5-hold-form.png`): the hold text appears **twice in a row**: once as the boxed "Dispatch held: …" notice and again as a bullet directly underneath. A third copy is B's reason. **Reviewed runs** (placeholder "Run IDs not started by Pardner") is shown even though this hold involves no foreign run. "Run interrupted; git status shows only src/export/csv.ts touched, reverted by hand." was entered and Reviewed runs left empty (`screenshots/step-5-filled.png`).
6. **Release held work** (`screenshots/step-6-release.png`, `screenshots/step-6-released.png`): 200. The hold disappears and B goes to "Running" as T3 run 5 on the next pass. Confirmed. The session line goes back to "Dispatch held: Awaiting this controller's active run" (the routine wording criticised in F-112-03).
- **Run list** (`screenshots/step-1-cancel-requested.png`): every run card has the same heading, "Fix CSV export rounding in invoices" (the task title). After five runs, the cards can only be told apart by the body text and the raw run IDs. Ended runs stay fully expanded with their verdict forms, so the list keeps growing.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console: one 409 for the deliberate early release. There are no page errors.

## Flagged claim verdicts
- **#50 "'Cancellation holds the queue and does not undo changes' appears only in the Cursor Cloud section" — CONFIRMED.** The T3 thread region contains no "does not undo" text; the only match on the page is the Cursor Cloud intro paragraph. Neither the T3 Cancel button nor the cancellation hold says that changes made before the interrupt remain.

## Flow Log
- Ideal path: 3 (cancel, give evidence, release). Actual: 3 actions, plus a wasted Release attempt whose error vanished, and an optional Repeat cancellation.
- Hesitation: whether **Reviewed runs** must be filled in (it need not be here, but nothing says so). Nothing tells Maya when release becomes possible; she has to wait for "Ended: interrupted".
- Duplicated information: the hold text is shown three times (session notice, bullet in the hold form, B's reason). The task title heads every run card.

Status: pass
