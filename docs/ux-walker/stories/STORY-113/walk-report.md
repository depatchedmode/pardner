# STORY-113 walk report: Withdraw a follow-up before it is sent

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-113/`.

**Setup.** Uses the fake T3 thread `thr_01JD8M4Q`, mapped in STORY-112. To keep a follow-up queued, a first follow-up ("Add a regression test for INV-2291 totals.") was queued and left Running in the fake. A second one ("Also update the invoice_lines table rounding (WRONG TABLE).") then waited behind it.

## Steps
1. **Queued card** (`screenshots/step-1-queued.png`): "Queued in Pardner", with the reason in an amber box: "Awaiting this controller's active run". The story expected "T3 thread is running"; this queue was held by Pardner's own active run rather than by T3. The session shows "Dispatch held: Awaiting this controller's active run". The only button on the card is **Withdraw follow-up**. Confirmed. Geometry: clean (nav widths only).
   Click **Withdraw follow-up** (`screenshots/step-1-withdraw-click.png`): POST `/executions/cancel` returns 200. There is no confirmation, which suits a cheap action.
2. **Next poll** (`screenshots/step-2-cancelled.png`): "Ended: cancelled" in green, with the reason "Cancelled before submission" in an amber box. No hold is created; the session hold line is still the existing "Awaiting this controller's active run" from the first run. Confirmed. **The card now offers Verdict type / Verdict evidence / Accept / Reject and Record artifact**, for work that never ran.
3. **Re-queue the corrected text** (`screenshots/step-3-requeue.png`, `screenshots/step-3-requeued.png`): it queues behind the active run. The withdrawn text is not offered for editing, so Maya retypes the follow-up from scratch. When the first run finished in the fake, the corrected follow-up was submitted, became T3 run 3 and completed. The withdrawn one never reached T3: the fake recorded only 3 sends, for runs 1–3. Confirmed.
- **Edge (flag #8)** (`screenshots/edge-accept-never-ran.png`, `screenshots/edge-accept-never-ran-after.png`): with the evidence "Looks good", **Accept** on the cancelled-before-submission card returns HTTP 200. The card then reads "Execution cancelled · Human acceptance accepted by Maya Okafor". A human acceptance is now on record for a follow-up that T3 never received.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean.
- Console/page errors: none.

## Flagged claim verdicts
- **#8 "A cancelled-before-submission execution shows the verdict and Record artifact forms, and the server accepts a verdict for work that never ran" — CONFIRMED.** The forms are visible, `POST /executions/verdicts` returned 200, and the card shows "accepted by Maya Okafor".

## Flow Log
- Ideal path: 1 (Withdraw). Actual: 1 click to withdraw, then the corrected text has to be retyped in full, because the withdrawn text is not offered for editing.
- Hesitation: the green "Ended: cancelled" next to an amber "Cancelled before submission" box sends mixed signals. The verdict form invites a decision that has no meaning here.
- Duplicated information: "Awaiting this controller's active run" appears both as the session's "Dispatch held" notice and as the card's reason.

Status: fail
