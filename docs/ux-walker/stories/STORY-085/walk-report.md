# STORY-085 walk report: Post a progress comment with no mentions

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900 as Priya Raman (hub client). Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-085/`. Video: `videos/page@52221f32b46f0f6da4d89bebdcc31c7e.webm`.

**Setup.** "Retry failed webhook deliveries" in "Ledger Sync". This was walked after the other topic stories, so the task already had 6 comments (not 2) and was in Review (not In progress). That does not change the comment flow.

## Steps
1. **Click the card** (`screenshots/step-1-open.png`). The Task details panel opens, focus is on the title H2 "Retry failed webhook deliveries", and SaveStatus shows "Saved locally · synced". Geometry clean. Pass.
2. **Scroll to Comments** (`screenshots/step-2-comments.png`). "Comments 6 · 1 new". Comments show "Name · human/agent", a localized timestamp and rendered Markdown (bold, lists, inline code). Geometry clean. Pass.
3. **Type the note** (`screenshots/step-3-typed.png`). The placeholder is "Share progress or mention an Actor with @handle". **Add comment** is disabled when empty and when the text is only whitespace, and becomes enabled once real text exists. The textarea is `required`. Geometry clean. Pass.
4. **Add comment** (`screenshots/step-4-posted.png`). The button is disabled while busy. The comment appears at the bottom with `deliveries.retry_count` as inline code, the heading becomes "Comments 7 · 1 new", and the textarea clears. Geometry clean. Pass.
- **Variation: Markdown image** (`screenshots/var-image.png`). `![trace](https://…)` renders as "Trace: trace" (alt text in a span). Confirmed, as documented.
- **Variation: History** (`screenshots/var-history.png`). History does **not** list "commented on this task" entries, but it **does** list "edited a comment" and "kept one version of a comment" (seen in STORY-088/090). Comment additions and comment edits are handled inconsistently. Activity's **Show: Comments** lists the additions (verified in STORY-093).
- **Edge: local service stops mid-submit** (`screenshots/edge-service-down.png`, `edge-switcher.png`, `edge-after-retry.png`). With the client service stopped, Add comment produced a page banner "The local Pardner client did not respond. Check that it is still running, then retry." with **Retry connection**, a header status "Local service disconnected", and under the textarea "**Failed to fetch** / Your last confirmed data remains available." with **Retry saved request**. The switcher row read "Saved locally · synced · unconfirmed change" while the service was down. After restarting the service on the same port the banner cleared, and **Retry saved request** saved the comment (one copy, confirmed in the model). Recovery works, but "Failed to fetch" is a raw browser error. The open switcher's `menu-anchor` spill is the dropdown overlay, not a defect.
- **Mobile 390×844** (`screenshots/mobile-check.png`): comments and composer stack cleanly; geometry clean.

Console/page errors: four `net::ERR_CONNECTION_REFUSED` and one `410 (Gone)`, all during the deliberate service stop. None in the normal path.

## Flagged claim verdicts
None of the flagged claims name STORY-085.

## Flow Log
- Ideal path 3 (open, type, submit). Actual 3, plus scrolling past GitHub issues, Status/Edit/Hand off and the existing comments to reach the composer at the bottom of a long panel.
- Duplicated information: a comment appears in the panel and in Activity, and edits (but not additions) also appear in History.
- During the outage two different "retry" buttons are visible at once (Retry connection, Retry saved request), and the switcher still says "synced".

Status: pass
