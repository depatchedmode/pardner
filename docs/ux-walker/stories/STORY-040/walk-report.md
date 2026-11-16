# STORY-040 walk report: Read invitation states and expiry in the history list

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-040/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

Expiry needs 24 h of real time, so it was **simulated with Playwright's browser clock** (`page.clock.install` at 23 h 13 min after the newest invite, then `fastForward`). The server still held those invites as issued. Only the browser's effective-state rendering was exercised. A 401 console error during the simulated run comes from the faked clock outrunning the session and is not logged as a defect.

## Steps
1. Invite → Human loads the history (Priya's hub, 9 invites at this point).
2. Rows at the simulated time (`screenshots/step-2-rows-simclock.png`): "Human · Revoked" (no expiry, no button), "Human · Used" (no details), "Agent · Waiting to be used · Expires in 47 min · Nov 10, 11:10 AM" with Revoke, older issued rows "Expires in 40/41 min". Matches the story's mix (Used, Revoked, Waiting, plus Expired after the jump). Geometry clean, but the state column wraps unevenly by eye (see F-036-03).
3. After +46.5 min, the older rows read "Expired" with no button. In its final minute the Agent row reads "**Waiting to be used** · Expired Nov 10, 11:10 AM" with **Revoke** still shown (`screenshots/step-3-near-zero.png`, F-040-01). After +48 min all issued rows read "Expired" with no expiry text or button (`screenshots/step-3-expired.png`). The 30 s tick works.
4. "Human · Used" says nothing about who used it (F-040-02). The avatar stack shows Marcus, so the "who" lives on another surface.

**Mobile (390x844).** `screenshots/mobile-check.png`: rows stack, no overflow, and the dialog fits (scrollHeight 698). Geometry clean.

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Ideal 1 (one-click overview) vs actual 2 (Invite, any purpose) plus a detour to the avatar stack or People to learn who joined.
- Duplicated information: the "who joined" fact lives in People/avatars and the invite list only says "Used".

Status: pass
