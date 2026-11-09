# STORY-094 walk report: Agent hands work back to a human via CLI

Walked 2026-11-09 on branch `client-only-entry`. Agent: Priya's built-in openai-codex Actor ("Setup agent") through `node bin/pardner.js … --token-file <scratch credential>`. Browser: Chromium 1440×900 as Priya Raman. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-094/`.

**Setup.** "Retry failed webhook deliveries" was In progress; Priya reassigned it to the agent before the walk.

## Steps
1. **`show task-…`**: `revisions` holds `assignee` and `status` arrays alongside title, priority and the rest. Pass.
2. **Mistake: no `--revisions`**: `INVALID_ARGUMENT: Supply --revisions`. Confirmed.
3. **`--to Priya` with revisions**: `UNKNOWN_ACTOR: Unknown Actor: Priya`. `--to "Priya Raman"` gives `Unknown Actor: Priya Raman`. Confirmed. The error does not suggest `pardner actors list` (which works with `--token-file` and lists IDs and handles).
4. **`--to actor-3eac…` and `--operation-id ho-094-1`**: success, `result: {taskId, commentId, mentionIds:["mention-…"]}`. Pass.
   - Variations: reusing `ho-094-1` with a different message gives `OPERATION_ID_REUSED: This operation ID already belongs to a different request`. Re-sending the old revisions gives `STALE_UPDATE: This field changed since it was read; refresh its context` with `details.current`/`expected`. Both match the catalog.
5. **Priya's browser.**
   - Board (`screenshots/step-5a-board.png`): the card sits in **Review** (count 1), labelled "Priya Raman · human". The card has **no unread or "handed to you" badge**, though 3 comments are new for her. Geometry clean.
   - Panel (`screenshots/step-5b-comment.png`): "Comments 5 · 3 new", with "Done" by **"Setup agent · agent"** tagged **New**. The comment looks like any other comment: nothing marks it as a handoff message or says it was addressed to Priya. Geometry clean.
   - History (`screenshots/step-5c-history.png`) and Activity → Status changes and handoffs (`screenshots/step-5d-activity.png`): "Setup agent handed Retry failed webhook deliveries to Priya Raman and set it to Review / “Done”". Geometry clean. Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#16 (agent display names are harness IDs, "openai-codex · agent"): REFUTED as worded.** The agent appears as "Setup agent" everywhere (comment author, History, Activity). The harness ID is never shown. Every person's built-in agent shares that name (F-090-02).

## Flow Log
- Ideal path 2 (show, handoff). Actual 4 including the two documented mistakes; 3 if the agent knew to run `actors list` (show, actors list, handoff).
- Re-entry of known data: the agent hand-builds the `--revisions` JSON from two fields of `show` output and copies a 70-character Actor ID.
- `--to` accepts IDs and handles but not display names, though the display name is unique here.
- Redundancy: the single handoff appears as the board column move, a comment, a History row and an Activity row, but none of these is marked "for you" on the board.

Status: pass
