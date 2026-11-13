# STORY-088 walk report: Resolve a concurrent comment edit with Keep this comment (author)

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-088/`. Video: `videos/` (Marcus's session).

**Setup.** Marcus Hale's comment on "Settings page: webhook secret rotation" was edited concurrently from two of his computers (laptop = Human-invite client, desktop = My device client) while the hub was stopped. After reconnecting, the comment held the alternatives "Rotation modal uses 2-step confirm" and "Rotation modal uses typed confirmation". (STORY-089 ran first on the same conflict from Priya's side.)

## Steps
1. **Open the task as Marcus** (`screenshots/step-1-conflict-shown.png`). "Comments 1" shows the current text "Rotation modal uses typed confirmation" and then two amber blocks, both headed "Marcus Hale · human", each with its text and **Keep this comment**. Nothing says which computer each version came from, or that these are competing versions. Geometry clean.
2. **Compare.** Easy with two short lines. The current text repeats the second alternative.
3. **Keep the second version** (`screenshots/step-3-resolved.png`). The conflict blocks vanish within about 1 s and the comment reads "Rotation modal uses typed confirmation". The model confirms 1 revision and 0 conflicts. The timestamp is still the original 11:31:59 AM, with no "edited" marker. History adds "Marcus Hale kept one version of a comment on this task". Geometry clean. Pass.
4. **Other reader** (`screenshots/step-4-other-reader-new.png`). Priya's browser shows "Comments 1 · 1 new" with the **New** tag on the resolved comment. Pass. She had never marked it read, so this cannot separate "new revision" from "never read"; that is covered in STORY-087.
5. **Activity** (`screenshots/step-5-activity.png`). "Marcus Hale kept one version of a comment on Settings page: webhook secret rotation / “Rotation modal uses typed confirmation”". Pass. The two "edited a comment" rows above it still quote both alternatives, including the discarded one, without marking it superseded. Other rows show raw Markdown (`**retries forever**`, backticks) in their quotes. Geometry clean.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#11** (Keep offered to every viewer) concerns non-authors; see STORY-089 (CONFIRMED there). For the author the button works as intended.

## Flow Log
- Ideal path 2 (open, Keep). Actual: 2. Pass.
- Hesitation: both blocks carry the same author line, and nothing says which device wrote which, or that one is already shown as the current text.
- Duplicated information: the winning text appears in the comment body, the History row, and Activity. The losing text remains quoted in History/Activity "edited a comment" rows with no "discarded" note.
- Date formats differ inside one panel: comment "11/9/2026, 11:31:59 AM" against History "Nov 9, 2026, 11:35 AM".

Status: pass
