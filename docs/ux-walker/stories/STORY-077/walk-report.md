# STORY-077: Resolve a concurrent status conflict with "Keep this status"

Walked 2026-11-09 in Chromium 1440×900. Setup (`outage.mjs`, video in `videos/`): I stopped the hub with `client stop --data hub`. While both joined clients reported `hubConnected:false`:
- Maya's browser used the quick select to move "Add 3DS fallback copy" to Review. The panel and header read **"Saved locally · waiting for hub"** (`screenshots/pre-1-maya-review-waiting-for-hub.png`).
- Juniper, on Theo's computer, ran `pardner update --status completed --token-file …`.

I restarted the hub with the same port and public URL. Both clients reconnected in about 1 s, and the hub held `conflicts.status` with both alternatives (`screenshots/pre-3-after-sync-maya.png`). Priya Raman walked the story in the hub's own browser. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-077/`.

## Steps
1. **Board** (`screenshots/step-1-board.png`): the card sits only in Review (the merged winner) and shows "Maya Okafor · human / Conflicting edits". The label is small muted grey text, the same weight as the assignee line, not red as the catalog says. Geometry: only the known `button.task-card` wrap false positive.
2. **Open the card** (`screenshots/step-2-panel.png`): the summary reads "Maya Okafor · human · Review · P2" (status included). The quick Status select is absent and only **Edit task** and **Hand off work** remain. Matches, apart from the winner: here the merge winner was Maya's Review, not Juniper's Completed, so the summary shows Review. Geometry: one `unevenRows` hit on `div.task-actions` (Edit task 91 px vs Hand off work 130 px). That is label-driven width and not a defect.
3. **Resolve status section** (`screenshots/step-3-resolve-section.png`): an amber box titled "Resolve status" reads "Both edits are preserved. Choose the value to keep." It lists **Maya Okafor · human** / `review` / **Keep this status** and **Juniper · agent** / `completed` / **Keep this status**. Matches. The values are raw lowercase slugs while the board, summary and History say "Review"/"Completed". No times are shown.
4. Hesitation confirmed: the values are slugs and nothing shows when each edit was made.
5. **History** (`screenshots/step-5-history.png`): "Juniper moved this task to Completed" and "Maya Okafor moved this task to Review", both 11:57 AM. Matches. These two contradictory rows carry no "conflict" marker.
6–7. **Keep this status under Juniper** (`screenshots/step-7-resolved.png`): "Saving locally…" → "Saved locally · synced". The Resolve section disappears, the quick Status select returns showing Completed, and "Conflicting edits" leaves the card. Matches. Focus fell to `BODY` because the clicked button was removed.
8. **History** (`screenshots/step-8-history.png`): "Priya Raman resolved conflicting status on this task — Kept Completed". Matches.

Edge cases (run before the resolve):
- **Edit task → change Status → Save changes** (`screenshots/edge-edit-conflicted-field.png`): a red block reads **"Resolve the concurrent alternatives explicitly"** / "Your last confirmed data remains available." / Dismiss. Matches the code `CONFLICT_REQUIRES_RESOLUTION`. The copy is jargon, names no field, and does not point to the Resolve status box under the form.
- **Hand off work while status is conflicted** (`screenshots/edge-handoff-conflicted.png`): the same message. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844, after the resolve): History rows wrap cleanly and the status chips fit. Geometry: card false positives only.

Console/page errors: two `400 (Bad Request)` resource errors, from the two refused edge-case writes.

## Flagged claim verdicts
- **#40** (conflict values render as raw slugs, Actor IDs and JSON, with labels like "Keep this tags"): **CONFIRMED** for status. Values show as `review` / `completed`, and the button reads "Keep this status" (`step-3-resolve-section.png`). Assignee and tags are covered in STORY-078.

## Flow Log
- Ideal 2 (open, Keep this status); actual 3. I scrolled to History to work out which value was right, because the Resolve box shows no time or context.
- The conflict shows in four places: the card label, the summary line (the winner's value), the Resolve box, and two History rows. None of them links to the others.
- The status shows in the column, summary line, Resolve box (slugs) and History (labels).

Status: pass
