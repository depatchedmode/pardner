# STORY-076: Newer save on a field Maya also changed (STALE_UPDATE then rebase)

Walked 2026-11-09 in Chromium 1440×900 on Maya Okafor's client. Theo Lindqvist's client saved Assignee = Juniper and Status = In progress first. That was a real `task.update` from his replica, synced through the hub. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-076/` (video in `videos/`).

## Steps
1. **Maya's draft** (`screenshots/step-1-draft.png`): Assignee "Maya Okafor · human", Status "Up next". Geometry: only the known `button.task-card` wrap false positive.
2. **Theo's save syncs** (`screenshots/step-2-notice.png`): "Theo Lindqvist · human saved a newer status, assignee since you started editing. Your draft is unchanged." with the rebase button. Matches, apart from the field order: the notice says "status, assignee" where the catalog has "assignee, status".
3. **Save without rebasing** (`screenshots/step-3-stale-update.png`): the server returns 409. A red block appears directly above **Save changes**: **"This field changed since it was read; refresh its context"** / "Your draft is preserved. Review the latest context before making a new edit." / **Dismiss**. Focus returns to **Save changes**. Matches. The block names no field, and "refresh its context" has no matching control. The real fix, **Base my draft on the latest version**, is scrolled out of view above the form at 1440×900. In this state **Hand off work** wraps onto its own row under Save/Cancel.
4. **History** (`screenshots/step-4-history.png`): "Theo Lindqvist edited this task — Status: Backlog → In progress · Assignee: Unassigned → Juniper". Matches.
5. **Dismiss, then rebase** (`screenshots/edge-after-dismiss.png`, `step-5-rebased.png`): after **Dismiss** the error goes away and the notice stays, but focus falls to `BODY`. The rebase kept Maya's touched values (Assignee Maya, Status Up next) and removed the notice. Matches, apart from the lost focus.
6. **Save changes** (`screenshots/step-6-history-after.png`): accepted. History reads "Maya Okafor edited this task — Status: In progress → Up next · Assignee: Juniper → Maya Okafor". Matches word for word.
7. The comment step belongs to the comments topic and was not walked here.

Mobile check (`screenshots/mobile-check.png`, 390×844): History rows wrap cleanly. Geometry: card false positives only.

Console/page errors: one expected `409 (Conflict)` resource error from the refused save.

## Flagged claim verdicts
No flagged claim names STORY-076. The catalog edge "the error text is the raw server message… there is no Refresh button" is **confirmed**.

## Flow Log
- Ideal 3 (read the notice, rebase, save); actual 5 when following the catalog persona, who skims past the notice: Save (refused), read History, Dismiss, rebase, Save.
- Hesitation: the error says "refresh its context", but there is no Refresh control. The fix is a button that has scrolled off screen above the form.
- No data re-entry: the draft survived the refusal.

Status: pass
