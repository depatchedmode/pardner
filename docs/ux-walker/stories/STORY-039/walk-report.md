# STORY-039 walk report: Revoke a mistaken invitation and create a new one

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-039/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. Invite ▾ has no "Manage invitations" item (`screenshots/step-1-menu.png`). Human opens the dialog with Create invitation and five history rows, oldest first. Two rows read "Human · Waiting to be used" and differ only by expiry minute (`screenshots/step-1-dialog.png`, F-039-03). Geometry clean.
2. **Revoke** on the first Human row: the list reloads and the row reads "Human · Revoked" with no expiry and no button (`screenshots/step-2-revoked.png`). The busy-disable state was too brief to capture (0 disabled buttons 60 ms after the click, so the request finished within the first frame). Matches.
3. **Create invitation** works from the same dialog because it has a fresh operation ID. The new row is appended at the bottom (`screenshots/step-3-new.png`). Matches.
4. **Copy invite** → "Copied…" (`screenshots/step-4-copied.png`). Matches.

**Variation: Revoke in the New invitation block** → "**Revoked** · Expires in 24 h · Nov 10, 11:05 AM" and "This invitation can no longer be used. Create a new one if you still need it." There is no Create button (`screenshots/var-revoke-new-section.png`). Matches the catalog, logged as a dead end (F-039-01) and a contradictory expiry (F-039-02).
**Variation: wrong item.** The My device dialog shows the same list, including the Human rows and their Revoke buttons (`screenshots/var-wrong-item.png`, F-039-04).

**Mobile (390x844).** `screenshots/mobile-check.png`: rows stack with full-width Revoke. The dialog is taller than the viewport (scrollHeight 915 against 810) and scrolls as a whole. There is no horizontal overflow. Geometry clean.

**Console:** no errors.

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Ideal 4 vs actual 5 (Invite, *choose a purpose*, Revoke, Create, Copy). The purpose choice is forced and irrelevant.
- Hesitation: which "Human · Waiting to be used" row was leaked. Only the expiry minute tells them apart.
- In the revoke-right-after-create variation, recovery needs Close and Invite → Human again (+2 steps).

Status: pass
