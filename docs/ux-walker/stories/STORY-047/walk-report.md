# STORY-047 walk report: Choosing the wrong invite type and recovering

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-047/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

Grace's work Mac was a hub on 47364 (project "Design System Tokens"). The studio Mac was a fresh client directory. The recovery client was a second fresh directory.

## Steps
1. Invite ▾ → **Human** → "Invite a person" (menu as in `../STORY-036/screenshots/step-1-menu.png`; F-047-03).
2. **Create invitation**, **Copy invite** (`screenshots/step-2-human-created.png`). Geometry clean.
3. Studio: Welcome → **Link this device instead** → "Link this device / A My device invitation from your own client adds this computer under your existing identity." (`screenshots/step-3-link-page.png`). Pasting the Human invite and clicking **Link device** gives "This is a Human invitation. Confirm your identity first, then join with it. / Linking this device needs a My device invitation from your own client. Human and Agent invitations work after you confirm your identity." (`screenshots/step-3-refused.png`). This matches the catalog, and the headline leads with the wrong action (F-047-01). Geometry clean.
4. **Back to confirming my identity** → typed Grace Liu / grace@studio.dev (same as the work Mac) with no duplicate warning (`screenshots/step-4-identity.png`). **Continue**, **Join a project**, paste the same Human invite → joined. The invite was not used up by the Link-page refusal (`screenshots/step-4-joined-duplicate.png`). Matches.
5. The work Mac's avatar stack lists "Grace Liu, human, idle" and "Grace Liu, human, offline" plus two "Setup agent" (`screenshots/step-5-work-mac-two-graces.png`). Matches.
6. `client show` on the work Mac: two human Actors with the same name and email and different humanIds. `client revoke --kind member --id <duplicate humanId> --operation-id remove-dup-grace` → `revoked: true`.
7. Studio now shows "Project access revoked; local data remains saved" (`screenshots/step-7-studio-revoked.png`). A My device invite (`screenshots/step-7-mydevice-created.png`) pasted into the existing studio client → `IDENTITY_MISMATCH` "Destination already belongs to another identity". The catalog expected `IDENTITY_EXISTS`; either way a fresh directory is needed. A fresh studio client → Link this device → **Link device** with the full My device prompt → board opens as "You: Grace Liu", but the header still shows **two GL avatars** and the filter lists "Grace Liu · human" twice, because the revoked duplicate remains (`screenshots/step-7-studio2-linked.png`, F-047-02). Geometry clean.

**Mobile (390x844).** `screenshots/mobile-check.png` (studio2 board): clean.

**Console:** no errors on the walked pages (the revoked studio logged expected 401/403). **Videos may show pasted invitation text for a frame before masking — do not publish.**

## Flagged claim verdicts
None of the flagged claims touch this story directly. #19 (identity typo or duplicate cannot be fixed) is consistent with step 7.

## Flow Log
- Ideal 4 (Invite, My device, Copy, Link device) vs actual 14: wrong menu item, create, copy, link (refused), back, retype identity, continue, join, CLI `show`, CLI revoke, new My device invite, new client directory, link, plus a permanent duplicate.
- Re-entry: name and email retyped on the studio. Invitation pasted three times.
- Duplicated information: two identical "Grace Liu" Actors on every board, permanently.

Status: fail
