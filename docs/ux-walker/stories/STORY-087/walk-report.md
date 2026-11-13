# STORY-087 walk report: Catch up on new comments and Mark all read

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900 as Priya Raman. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-087/`. Video: `videos/`.

**Setup.** On "Retry failed webhook deliveries", Priya wrote 2 comments. Since then Marcus mentioned the agent, and the agent ("Setup agent") replied and handed the task back to Priya with "Done" (STORY-093/094). Priya had never marked anything read.

## Steps
0. **Board.** The card reads "P2 / Retry failed webhook deliveries / Priya Raman · human", with **no unread count or badge**, though 3 comments are new for her.
1. **Open the task** (`screenshots/step-1-new.png`). The heading reads "Comments 5 · 3 new", and 3 articles carry `is-new` and the **New** tag. Comments are oldest-first, so the new ones are below the fold, and nothing jumps to the first new one. The panel also covers the Review column, clipping the selected card ("Retry failed webl…"). Geometry clean. Pass.
2. **Read the comments** (scrolled to the bottom, waited 3 s, reloaded) (`screenshots/step-2-still-new.png`). The heading still reads "Comments 5 · 3 new": viewing writes no receipt. Confirmed.
3. **Mark all read** (`screenshots/step-3-marked.png`). The New tags disappear, the heading becomes "Comments 5", and **Mark all read** is disabled. Geometry clean. Pass.
4. **Activity → Show: Read receipts** (`screenshots/step-4-activity.png`). "**Priya Raman read 5 comments** on Retry failed webhook deliveries", above "Setup agent read 1 comment…". Only 3 were unread; the other 2 are Priya's own. The receipt and the sentence count her own comments. Geometry clean.
- **Edge: edit after reading** (`screenshots/edge-edited-new-again.png`). The agent edited its reply via `comment-edit`; Priya's panel then showed "Comments 5 · 1 new". Confirmed. The comment shows no "edited" marker, so Priya cannot tell why an already-read comment is New again.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#42 (Mark all read sends the reader's own revisions; board cards carry no unread badge): CONFIRMED.** The receipt covered 5 comments including Priya's 2 own, and Activity says "read 5 comments". No board card shows an unread indicator (step 0).

## Flow Log
- Ideal path 2 (open, mark read). Actual 3: open, scroll past GitHub issues/status/older comments to reach the new ones, Mark all read. To *find* which tasks have new comments, Priya would have to open every task, since the board gives no signal.
- Duplicated information: none on this screen. The Activity sentence overstates the count.
- Hesitation: after an edit, a comment she already read shows New again with no "edited" cue.

Status: pass
