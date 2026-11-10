# STORY-092 walk report: Someone changes the task while you're writing a handoff

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900 as Priya Raman (hub). Marcus's concurrent edits were sent from his own replica client through its operator API (the same `task.update` his browser's Status select sends), and the walk waited until they synced to Priya's hub. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-092/`. Video: `videos/` (Priya's session).

**Setup.** "Retry failed webhook deliveries" set to In progress, assigned to Priya.

## Steps
1. **Open Hand off work, pick an agent, type a long message** (`screenshots/step-1-draft.png`). Handoff status defaults to Review. The recipient order differs from Marcus's view of the same list (Cursor reviewer comes before the two "Setup agent" entries here). "Cursor reviewer · agent" was chosen, because the two "Setup agent · agent" options are indistinguishable (see F-091-01). Geometry clean.
2. **Marcus sets status to Review** (`screenshots/step-2-changed-notice.png`). Within about 2.5 s a blue notice inside the form reads "This task changed while you were writing: now Priya Raman · human · Review. Your draft is preserved." with **Use latest task details**. **Hand off** is disabled. Geometry clean. Confirmed. The notice names the *assignee* (Priya) rather than who changed it (Marcus) or what changed (Status In progress → Review). Priya reads her own name and may think she caused it.
3. **Try Hand off**: disabled. Confirmed.
4. **Use latest task details** (`screenshots/step-4-use-latest.png`). The notice disappears, the message is kept (213 chars), status stays Review, and **Hand off** is enabled. Pass.
- **Variation: the change lands between click and server check** (`screenshots/var-stale-update.png`). Priya's handoff request was held in the browser while Marcus set status to In progress and priority to P1; the request was then released. The result: a red notice "This field changed since it was read; refresh its context / Your draft is preserved. Review the latest context before making a new edit." with **Dismiss**, plus the blue "This task changed while you were writing… In progress" notice **at the same time**. The form stays open with the message intact. Confirmed. After **Use latest task details** (`screenshots/var-after-stale-recover.png`) the blue notice goes, but **the red STALE notice stays** until dismissed, though the condition is already resolved. Geometry clean.
5. **Hand off** (`screenshots/step-5-handed.png`). "Handed off to Cursor reviewer · agent · Review." The model shows status review and the cursor agent as assignee. Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: one `Failed to load resource: 409 (Conflict)`, which is the forced STALE_UPDATE.

## Flagged claim verdicts
None of the flagged claims name STORY-092. (#39, the "Your draft is preserved" copy on draftless selects, concerns STORY-072/098; here a real draft exists, so the copy is accurate.)

## Flow Log
- Ideal path 2 (acknowledge, resubmit). Actual 2 in the main path; 3 in the race variation (Use latest, Dismiss a stale error, Hand off).
- Hesitation: the notice's "now Priya Raman · human · Review" reads as the current assignee and status but not as a change by Marcus. Two stacked notices in the race variation say the same thing in different words.
- No data was re-entered: the draft survived both paths.

Status: pass
