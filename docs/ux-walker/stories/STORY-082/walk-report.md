# STORY-082: Reconstruct what happened to a task from History

Walked 2026-11-09 in Chromium 1440×900 in Priya Raman's hub browser. Task "Remove legacy PayPal button" was seeded with real writes from three replicas:
- Maya: two edits and a comment.
- Juniper: a `pardner handoff` to Theo with status Review and a message.
- Theo: moved it to Abandoned.
- Priya: a comment.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-082/` (video in `videos/`).

## Steps
1. **Open the task, scroll to History** (`screenshots/step-1-2-history.png`): panel order is header → GitHub issues → description → actions → Comments (3 · 2 new) → composer → Evidence → History. History is last and needs a long scroll. Geometry: only the known `button.task-card` wrap false positive. Matches.
2. **Read the rows** (same screenshot), newest first:
   - "Theo Lindqvist moved this task to [Abandoned]"
   - "Juniper handed this task to Theo Lindqvist and set it to [Review] — “Blocked on finance sign-off: 14 merchants still use PayPal. Theo, please decide.”"
   - "Maya Okafor edited this task — Status: Backlog → In progress · Assignee: Unassigned → Juniper"
   - "Maya Okafor edited this task — Priority: P2 → P1 · Description edited"
   - "Maya Okafor created this task — Backlog · P2 · Unassigned"

   Matches. The trail answers "why Abandoned" only indirectly: the reason is in a comment ("Finance confirmed: keep PayPal for now."), which History leaves out.
3. **Comments filtered out** (`screenshots/step-3-comments.png`): the two plain comments (Maya's, Priya's) do not appear in History. The handoff message does, as an excerpt. Matches. Comments show times as "11/9/2026, 11:36:42 AM" (numeric, with seconds), while History uses "Nov 9, 2026, 11:36 AM". Two date formats appear in one panel.
4. **Hover**: rows carry `title="task.update"`, `task.handoff`, `task.create`. The timestamps carry the full locale time in `title`. Matches. History has no buttons or links (`interactive in history 0`), so Actor names and the recipient are plain text. Matches.

Edge cases:
- **Deleted handoff comment** (`screenshots/edge-deleted-handoff-comment.png`, `edge-deleted-comments.png`): Juniper ran `pardner comment-delete <handoff comment> --token-file …`. The handoff row now reads "This comment was later deleted." and a new top row says "Juniper deleted a comment on this task". Matches.
- **Issue link rows**: this task has none. STORY-079/080 confirmed the raw "recorded task.link-issue" sentence.
- **Paging**: with 6 rows there was nothing to page. There is no "Show older" control, as the catalog says.

Mobile check (`screenshots/mobile-check.png`, 390×844): History rows wrap cleanly. Geometry: card false positives only.

Console/page errors: none.

## Flagged claim verdicts
- **#41** (issue link/unlink History rows read "recorded task.link-issue"): **CONFIRMED** in STORY-079/080 (`../STORY-079/screenshots/step-5-history.png`). It does not apply to this task's rows.

## Flow Log
- Ideal 2 (open, scroll to History); actual 2, but the scroll is long because History sits at the very bottom.
- To learn *why* the task was abandoned, Priya also has to read Comments, because History leaves out plain comments. That costs one extra scroll back up.
- Duplicated information: the handoff message appears in both Comments and History.

Status: pass
