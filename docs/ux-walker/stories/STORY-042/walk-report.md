# STORY-042 walk report: Non-creator invites from a replica, and the hub is unreachable

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-042/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. On Marcus's replica, Invite → Human shows "Invitations for this project / None yet." He does not see Priya's 9 invites (`screenshots/step-1-dialog.png`; F-042-03 on the heading). Geometry clean.
2. **Create invitation** succeeded in 37 ms, forwarded to the hub (`screenshots/step-2-created.png`). Matches.
3. **Copy invite** → "Copied…" (`screenshots/step-3-copied.png`). Matches.
4. Priya's hub was stopped. Marcus's board header shows "Remote presence unavailable" next to "Saved locally · synced" (`screenshots/step-4-board-hub-down.png`, F-042-04). Invite → Human then shows the alert "Project authority unavailable; retry this attempt / The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." directly under Create invitation, while the history stays at "Loading…" (`screenshots/step-4-dialog-hub-down.png`). Clicking Create invitation changes nothing visible (`screenshots/step-4b-create-hub-down.png`). The CLI equivalent prints `HUB_UNAVAILABLE: Project authority unavailable; retry this attempt`. Matches the catalog, logged as F-042-01.
5. After Close, the header still shows "Remote presence unavailable" (`screenshots/step-5-closed-hub-down.png`). Matches.

**Variations.** With the hub back, Priya's history includes Marcus's invite as a plain "Human · Waiting to be used" row with no sponsor (`screenshots/var-priya-sees-marcus-invite.png`, F-042-02). Her Revoke worked through `POST /projects/:id/invites/:inviteId/revoke` (`screenshots/var-priya-revoked-marcus-invite.png`), confirming the creator override. Marcus calling the same route on one of Priya's invites gets 403 `FORBIDDEN` "Invitation is owned by another human". Matches.

**Mobile (390x844).** `screenshots/mobile-check.png`: clean.

**Console:** 503s while the hub was down (expected).

## Flagged claim verdicts
None of the flagged claims touch this story (the catalog lists STORY-042 under "Hub outage" but makes no flagged claim for it).

## Flow Log
- Ideal 3 matched (Invite, Human, Copy) plus Create.
- While the hub is down the person waits on a "Loading…" that never resolves and has no Retry, so the only way out is Close.

Status: pass
