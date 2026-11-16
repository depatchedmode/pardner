# STORY-115 walk report: Review a foreign run that someone started directly in T3

Walked 2026-11-09, Chromium 1440×900, with video. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-115/`.

**Setup.** Uses the fake T3 thread `thr_01JD8M4Q`. Jonas's direct use of T3 was simulated with the fake's `foreignRun('thr_01JD8M4Q')`, which created run 6 with the assistant output "Jonas: ran eslint --fix on src/export". It was then finished as completed. Maya queued "Add a test for negative line-item totals." while it was running.

## Steps
1. **Open Control** (`screenshots/step-1-open.png`, `screenshots/step-1-queued-card.png`): the session shows "Dispatch held: Run run:thread:thr_01JD8M4Q:ordinal:6 is not linked to an execution here; review before reuse". The queued card's reason is the same sentence. Confirmed. **The foreign run itself appears nowhere in Pardner**: there is no card, output or link to run 6, so "review" means leaving for T3. The only way there is the Session link in the identity list.
2. **Release without Reviewed runs**, with the evidence "Jonas ran a lint fix; diff reviewed" (`screenshots/step-2-hold-form.png`, `screenshots/step-2-unreviewed.png`): 409 `UNREVIEWED_RUN` "Review these runs first: run:thread:thr_01JD8M4Q:ordinal:6". Confirmed. The banner is off-screen and short-lived (F-111-01).
3. **Copy the run ID into Reviewed runs**: the ID has to be selected out of the middle of a sentence, and it is long (`run:thread:thr_01JD8M4Q:ordinal:6`). There is no copy button or checkbox. **Release held work** returns 200 and the hold clears (`screenshots/step-3-release.png`). Confirmed.
4. **Queued follow-up submits** (`screenshots/step-4-submitted.png`): "Running" as T3 run 7 on the next idle pass. Confirmed. Geometry: clean.
- **Redundancy**: the hold text appears three times (session notice, bullet in the hold form, queued card's reason). Confirmed (`screenshots/step-2-hold-form.png`).
- **Mobile 390×844** (`screenshots/mobile-check.png`, taken after release): no overflow. The same flush "Control settings"/"Cursor Cloud" join as in F-112-02 is visible. Geometry: clean.
- Console: one 409 for the deliberate unreviewed release. There are no page errors.

## Flagged claim verdicts
None of the flagged claims touch STORY-115.

## Flow Log
- Ideal path: 3 (read the hold, enter the run ID and evidence, release). Actual: 4. The first release fails because the free-text Reviewed runs field gives no hint that this hold needs it, and the error vanishes.
- Re-entry of known data: Maya copies a run ID that Pardner already knows and is displaying, back into a text field.
- Detour: reviewing the foreign run means going to T3, because Pardner does not show the run's output, although it captures output for its own runs.

Status: pass
