# STORY-037 walk report: Copy the invite while screen-sharing

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-037/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. Invite → Human opens "Invite a person" (`screenshots/step-1-dialog.png`). Geometry clean.
2. **Create invitation**: the state line appears, there is no textarea, and `pardner-invite-v1.` is absent from `page.content()` (`screenshots/step-2-created.png`). Matches. Geometry clean.
3. **Copy invite** → "Copied. Treat it like a password…", and the envelope is still not in the DOM (`screenshots/step-3-copied.png`). Matches. Geometry clean.

**Variation (Show invite text).** The button has `aria-expanded="false"` and `aria-controls="invite-text"`. Clicking it shows the warning "Visible on screen. Stop sharing your screen before copying." **in the same frame as** the read-only textarea (`screenshots/var-shown-masked.png`, textarea masked) — F-037-01. The button becomes "Hide invite text" with `aria-expanded="true"`. Hiding removes the text from the DOM again (`screenshots/var-hidden-again.png`). No recovery hint after a reveal (F-037-02). Geometry clean in all states.

**Keyboard.** Tab order inside the modal: Close → Copy invite → Show invite text → Revoke → Revoke Human invitation (×N) and then the browser chrome, so the native modal focus is contained (`screenshots/kbd-focus.png`). The rows share identical accessible names (see F-036-04).

**Mobile (390x844).** `screenshots/mobile-check.png`: clean, no overflow.

**Console:** no errors. **Video `videos/` may contain a frame of revealed invite text before masking — do not publish.**

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Steps match the story (3 actions after creation). There is no safeguard before the reveal.
- Nothing is re-entered or duplicated beyond the shared F-036-02 duplication.

Status: pass
