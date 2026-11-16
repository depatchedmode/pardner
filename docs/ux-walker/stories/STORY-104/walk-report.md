# STORY-104 walk report: Reading the Activity feed by day and jumping to subjects

Walked 2026-11-09 as Maya Okafor on the hub client (Chromium 1440×900), standing in for Leon. The project had 61 real events from the earlier stories, plus two comments (one later deleted) added for the comment variation.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-104/`. Video: `videos/`.

## Steps
1. **Activity.** `screenshots/step-1.png`: "Activity  Showing 61 of 61" with a single day heading, **Today**. Rows are `article.event` with a bold actor, a sentence, underlined subject buttons, status pills and a right-aligned time. Geometry: clean.
   - **Multi-day grouping (Yesterday, "Friday, November 6"): BLOCKED.** Event timestamps are assigned by the service at write time, so 2–3 days of history cannot be produced honestly within the walk.
2. **Hover.** `screenshots/step-2-hover.png`: the `<time>` has `title="11/9/2026, 11:48:12 AM"` and a `datetime` attribute, so the full timestamp is available on hover.
   - The row's `title` is the raw event type ("task.update", "vein.update", "comment.add"). Hovering anywhere on a row shows this internal identifier as a tooltip (F-104-01).
3. **Task subject.** "Downsize staging RDS to db.t4g.large" opens the task panel over Activity, and the feed stays behind it (`screenshots/step-3.png`). Matches.
4. **Close.** Focus returns to the subject button that opened the panel (`screenshots/step-4.png`). Matches.
5. **Vein subject.** Before this step, **Show** was set to Goals and veins. Clicking "Lazy-load PDF renderer" in a "started vein" row switched to **Tasks** with Vein = that vein and Assigned to cleared (`screenshots/step-5.png`). The user leaves Activity with no way back except the nav (see STORY-109 F-109-01/02).
6. **Activity again.** The feed is back at the top (scrollY 0). **Show** kept "Goals and veins" (`screenshots/step-6.png`). Matches the catalog.
7. **Goal subject.** "goal-2adcfd" in a "marked goal … Achieved" row switches to **Goals** and focuses that goal's `article` (`screenshots/step-7.png`).
   - The focused article has no visible focus indicator, so a sighted keyboard user cannot see where they landed (F-104-02).
   - No scroll was needed at this viewport.

### Variations and edge cases
- **Comments.** `screenshots/var-comments.png`:
  - "Maya Okafor commented on Coalesce invoice.paid events" with a quoted excerpt truncated at about 140 characters with "…".
  - The deleted comment's row shows "This comment was later deleted."
  - A separate row reads "deleted a comment on …".
  - Matches the catalog.
- **Mobile.** `screenshots/mobile-check.png`: the filters stack. Rows wrap to sentence / subject / time. No overflow. Geometry: clean.
- The live-insert, stale midnight-heading and "unknown vein" edge cases were not exercised.

## Flagged claim verdicts
No flagged claim names STORY-104.

## Flow Log
- The ideal path is 3 steps (Activity, scan, click subject); the actual path was 3 for tasks and goals.
- A vein subject is a one-way trip to a filtered board.
- History in task details shows the same sentences without clickable subjects. This was not re-verified here; the task panel was observed without History rows.
- Console and page errors: none.

Status: pass
