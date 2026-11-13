# STORY-091 walk report: Hand off in-progress work to a reviewer

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900 as Marcus Hale (replica client). Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-091/`. Video: `videos/`.

**Setup.** "Settings page: webhook secret rotation" is In progress, assigned to Marcus, with no field conflicts.

## Steps
1. **Hand off work** (`screenshots/step-1-form-open.png`). The **Hand off work** section opens and focus lands on **Recipient** ("Choose an Actor"). **Handoff status** is preset to **Review**, the quick Status select is hidden, and **Hand off** is disabled. Geometry clean. Pass.
   - Recipient options: "Priya Raman · human", "Marcus Hale · human" (self), **"Setup agent · agent", "Setup agent · agent"**, "Cursor reviewer · agent". The two "Setup agent" entries (Priya's and Marcus's built-in agents) cannot be told apart.
   - **Cancel handoff** (variation): focus returns to **Hand off work**, and reopening shows an empty recipient. Pass.
2. **Choose "Priya Raman · human"** (`screenshots/step-2-recipient.png`). Geometry clean.
3. **Leave Review, type "Ready for review — QA notes in PR #212."** (`screenshots/step-3-message.png`). **Hand off** becomes enabled. Geometry clean. Pass.
4. **Hand off** (`screenshots/step-4-handed.png`). The form closes and focus returns to **Hand off work**. The status line reads "Handed off to Priya Raman · human · Review." Pass.
5. **Panel and board.** The panel line reads "Priya Raman · human · P2", Status shows Review, and the card moved to **Review** (count 2). Pass. The open panel covers most of the Review column, so the moved card is half-hidden.
6. **Comments** (`screenshots/step-6-comment.png`). The message appears as a plain comment by "Marcus Hale · human". There is **no chip or "Notified Priya" cue** and no sign it was a handoff. The model holds a mention for Priya (recipient added server-side). History (`screenshots/step-6b-history.png`) records the handoff. Geometry clean.
7. **Activity** (`screenshots/step-7-activity.png`). "Marcus Hale handed Settings page: webhook secret rotation to Priya Raman and set it to Review / “Ready for review — QA notes in PR #212.”" Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#17 (a handoff recipient gets no visible "Notified" cue): CONFIRMED.** The handoff comment renders with no chip, tooltip or label naming Priya.

## Flow Log
- Ideal path 4 (Hand off work, recipient, message, Hand off). Actual 4. Pass.
- Status is fail because of the high finding F-091-01; the handoff flow itself worked.
- Hesitation: the duplicated "Setup agent · agent" options. Handing off to "the agent" is a coin flip between Priya's and Marcus's agent.
- Duplicated information: one handoff appears in 5 places (status line, comment, History, Activity, column move), as the catalog predicted. The comment copy is the only one without handoff context.
- Handing off to yourself is offered with no warning (Marcus appears in the list).

Status: fail
