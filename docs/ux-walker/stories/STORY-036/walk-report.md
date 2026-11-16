# STORY-036 walk report: Invite a teammate to a project from the Invite menu

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-036/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. **Invite ▾** (header, right of the avatar stack) opens a menu with Human "A person and their agent", Agent "Another agent of yours", My device "Another computer you use" (`screenshots/step-1-menu.png`): the menu is anchored under Invite and readable. Geometry clean.
2. **Human** opens "Invite a person" with "Checkout Revamp", Close and the body text as described (`screenshots/step-2-dialog.png`). Geometry clean.
3. History showed "None yet." (`screenshots/step-3-history-empty.png`); the dialog sits centred with Create invitation as the only primary action. Geometry clean.
4. **Create invitation** → "Waiting to be used · Expires in 24 h · Nov 10, 11:02 AM" with Copy invite / Show invite text / Revoke and "The invitation stays hidden so it can't be read from a shared screen." (`screenshots/step-4-created.png`). The envelope is not in the DOM. The same state/expiry and a second Revoke also appear in the history row (F-036-02); "Waiting to be used" wraps in the row (F-036-03). Geometry clean (the wrap is below the script's control-label heuristic; confirmed by eye).
5. History row "Human · Waiting to be used · Expires in 24 h · …" with Revoke (aria "Revoke Human invitation"). Matches.
6. **Copy invite** → "Copied. Treat it like a password and send it privately; it works once." (`screenshots/step-6-copied.png`). Geometry clean.
7. Clipboard: 5 lines; first line `Join project "Checkout Revamp" with my own identity. Set up or reuse my local client, register yourself as my agent…`, a CLI instruction line, and one `pardner-invite-v1.…` line. The envelope endpoint is the hub's public URL `http://127.0.0.1:47361/pardner/client/v1/enroll`. Matches.
8. **Close** → dialog closes and focus returns to **Invite** (`screenshots/step-8-closed.png`). Matches.

**Variations.** Escape closes the dialog and returns focus to Invite. Reopening Invite → Human shows the history row but no way to copy that invite again (`screenshots/var-reopen.png`, F-036-05). The non-creator replica path is walked in STORY-042 and works.

**Mobile (390x844).** `screenshots/mobile-check.png`: the dialog fills the width, Close has a visible focus ring, and history rows stack (state right-aligned, full-width Revoke). There is no horizontal scroll. Geometry clean.

**Console:** no errors.

## Flagged claim verdicts
- **#14 (no warning without `--public-url`): CONFIRMED.** A client started with only `--http-port 47362` created a Human invite with the normal UI and no warning. The decoded envelope endpoint was `http://127.0.0.1:47362/pardner/client/v1/enroll` (evidence: `../STORY-041/screenshots/step-0-caseA-priya-created.png`). Logged as F-036-01.

## Flow Log
- Ideal 3 (Invite, Human, Copy) vs actual 4 (Invite, Human, Create invitation, Copy invite). Create is a separate step.
- Hesitation: Agent vs Human in the menu (as in the story). Nothing is re-entered.
- Duplicated information: the new invite's state and expiry are shown twice, with two Revoke buttons.
- Once the dialog is closed the invite can't be copied again.

Status: pass
