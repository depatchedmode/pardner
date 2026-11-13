# STORY-138: Trying a second change while one is unconfirmed

Setup: client "Marcus Oyelaran", project "Checkout Revamp", with "Apple Pay sheet freezes on iOS 17" in In progress. To produce the precondition for real, I filled **Hand off work** (recipient Setup agent · agent, status Review, a message), stopped the service with `client stop` and clicked **Hand off**. Then I restarted the service and reloaded, so the pending `task.handoff` is the stored earlier attempt. Chromium 1440x900. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-138/`.

## Steps
0. **Precondition.** `screenshots/pre-pending-handoff.png`: the handoff failed while the service was down. `screenshots/pre-after-reload.png`: after the restart and reload, the page notice reads "A request is awaiting confirmation. **Retry saved request**", and the task panel reopened, still In progress and Unassigned. Geometry clean (one card-title wrap, by design).
1. **Type the comment and click Add comment.** `screenshots/step-1-typed.png`, `screenshots/step-1-refused.png`: **Add comment** looks enabled. After the click, a red notice under the comment box reads "Resolve the saved request before starting another change." with **Retry saved request**. There is no "last confirmed data" line, and nothing is sent. The page-level notice disappears when the panel notice appears. The notice does not say which saved request is pending (a handoff to Setup agent on another screen state), so Marcus cannot tell what he would be retrying (F-138-01). Geometry clean. Matches.
2. **Look for a way to discard.** `screenshots/step-2-no-discard.png`: the only matching buttons on the page are the two **Retry saved request** buttons (DOM scan: `["Retry saved request"]`). There is no Dismiss, Discard or Cancel (F-138-02). Matches the catalog, and it is a dead end whenever the server will never accept the request.
3. **Retry saved request.** `screenshots/step-3-retried.png`: the card moves to Review, the panel reads "Setup agent · agent · P2", and the handoff message appears as Comment 1. There is no confirmation text such as "Handed off to Setup agent · agent · Review". The state just changes (F-138-03). The typed comment is still in the textarea. Geometry clean.
4. **Add comment again.** `screenshots/step-4-commented.png`: the comment posts, Comments 2. Matches. The comment timestamps use "11/9/2026, 11:42:56 AM" while History, in the same panel, uses "Nov 9, 2026, 11:42 AM" (F-138-04).
- Mobile (390x844, panel scrolled to the comments): `screenshots/mobile-check.png`. **Hand off work** wraps onto its own row and nothing overflows. Geometry clean.
- Variation (goal or vein selects while pending): not walked. In this state the task **Status** select is *not* disabled. Choosing a value gives the same "Resolve the saved request…" refusal, which I saw in STORY-137.
- Console: no errors apart from the deliberate connection refusals.

## Flagged claim verdicts
- **#1 (pending request never cleared; only Retry saved request, no Dismiss; every other change refused; the stuck state survives reload):** CONFIRMED for a pending handoff after a network failure. There is no Dismiss (step 2), the comment is refused (step 1), and the state survived reload (step 0). I did not produce the `FORBIDDEN` trigger itself (non-author Keep this comment, STORY-089) here, so that part is BLOCKED for this story.

## Flow Log
- Ideal path 2: retry, then comment. Actual: click Add comment and get refused, look for discard, Retry, Add comment = 4 actions. The first attempt is wasted because **Add comment** looks enabled while a request is pending (+1). The search for a discard option is a hesitation.
- No data re-entry: the comment text was kept.
- Hesitation: the refusal notice does not name the pending change. Marcus has to remember that his earlier handoff failed.

Status: pass
