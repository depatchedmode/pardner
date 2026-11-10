# STORY-086 walk report: Try to @mention a teammate by name and get the "matches no Actor" hint

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-086/`. Video: `videos/` (Marcus's session).

**Setup.** "Ledger Sync" hosted by Priya Raman; Marcus Hale joined from his own client with a Human invitation. Marcus walks in his browser; Priya checks the result in hers.

## Steps
1. **Open "Settings page: webhook secret rotation"**. The Comments section and the textarea (placeholder "Share progress or mention an Actor with @handle") are visible.
2. **Type "@priya …"** (`screenshots/step-2a-typing-no-hint.png`, `screenshots/step-2b-hint.png`). While "@priya" is still at the end of the text, no hint shows. After the space, "@priya matches no Actor and won't notify anyone." appears under the textarea, and the textarea has `aria-describedby="comment-mention-hint"`. Geometry clean. Confirmed.
3. **Try "@Priya"** (`screenshots/step-3-capital.png`): "@Priya matches no Actor and won't notify anyone." Confirmed. The hint never suggests the right handle or the display-name match.
   - Variations checked: two unknown handles give "@priya and @dana match no Actor and won't notify anyone." Three give "@a, @b and @c match no Actor…". `ops@priya.dev` gives no hint. **Inline code "`@priya`" still shows the hint**, though code is skipped for chips (minor inconsistency).
4. **Look for the handle in the UI** (`screenshots/step-4a-you.png`, `step-4b-avatar.png`, `step-4c-profile.png`). **You: Marcus Hale** opens his profile dialog (Identity: Git name, Git email, Devices; Live sessions). Priya's avatar ("Priya Raman, human, offline. Open profile") opens her profile with Git name/email, Devices and Live sessions 0. **No handle anywhere**: the page text never contains `human-524f…`. Geometry clean. Confirmed.
5. **Terminal: `pardner client show --project <id> --data <marcus>`.** `project.actors[]` lists Priya with `handle: "human-524f986e-…"` (a UUID). Confirmed. Marcus's two device entries are both named "filament.local" (an artefact of both test clients running on one Mac).
6. **Paste "@human-524f986e-… can you review the rotation modal?" and blur** (`screenshots/step-6-real-handle.png`). The hint disappears. Confirmed.
7. **Add comment** (`screenshots/step-7-chip.png`). The textarea clears. The comment renders with a green chip whose **text is the raw handle** `@human-524f986e-15f9-4996-a464-a2acaa56f3cf` and whose `title` is "Notified Priya Raman · human". Confirmed. The only confirmation of who was notified is a hover tooltip on a UUID. Geometry clean.
8. **Priya's browser** (`screenshots/step-8-priya-new.png`). "Comments 2 · 2 new", with Marcus's comment tagged **New**. Confirmed. Nothing outside this task panel (no board card badge, no inbox) tells Priya she was mentioned.
- **Edge: email-local text** (`screenshots/edge-email-local-mention.png`). Marcus posted "Logs forwarded to ops@human-524f… for the audit." No hint showed and no chip rendered (plain `<p>` text), **but the model created a mention record** to Priya's Actor for that comment. Priya is notified with no visible sign in the comment.
- **Mobile 390×844** (`screenshots/mobile-check.png`). Geometry reports clean, but by eye the raw-UUID chip wraps mid-handle across two lines ("…a464-" / "a2acaa56f3cf").

Console/page errors: none.

## Flagged claim verdicts
- **#15 (handles shown nowhere in the browser; `@name` gets "matches no Actor"; handle only from `client show`): CONFIRMED.** Steps 2–5.
- **#18 (server mention matching skips the UI's email-local check, so `ops@human-…` notifies without a chip): CONFIRMED.** A mention record was created for `ops@human-…` and no chip or hint was shown.
- #17 (no browser surface shows delivery state): consistent with what was seen here. The chip title is the only cue. Covered in STORY-091/096.

## Flow Log
- Ideal path 3 (open, type @ and pick, submit). Actual: 3 failed attempts (@priya, @Priya, profile hunt), then leave the browser for a terminal, run `client show`, read JSON, copy a 43-character UUID handle, paste and submit. About 9 steps with a context switch.
- Hesitation points: after the first hint (what is the handle?), and in the profile dialog (no handle, no "mention" action).
- Re-entry of known data: the app knows Priya's display name and handle but makes Marcus fetch and paste the handle.
- Alternative (Hand off work) notifies without a handle, but it changes the assignee, which is not what Marcus wants.

Status: fail
