# STORY-089 walk report: A non-author clicks Keep this comment and gets stuck behind a saved request

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-089/`. Video: `videos/page@6bffdebd32d74d54c5e0e8f06da711f9.webm`.

**Setup.** Three clients: Priya Raman hosts "Ledger Sync" (hub, `--public-url` on loopback); Marcus Hale joined with a Human invitation; Marcus's second computer joined with a My device invitation. With the hub stopped, Marcus edited his comment on "Settings page: webhook secret rotation" from both computers ("Rotation modal uses 2-step confirm" and "Rotation modal uses typed confirmation"). After the hub restarted the comment carried two alternatives. Priya walked the story in her browser.

## Steps
1. **Open the task** (`screenshots/step-1-keep-offered.png`). The comment shows its current text, then two amber conflict blocks, each "Marcus Hale · human", the alternative text and **Keep this comment**. Both buttons are enabled for Priya, who is not the author. Geometry clean. Confirmed.
2. **Click Keep this comment** (`screenshots/step-2-forbidden.png`). A red notice at the panel top reads "Only the comment author may edit or resolve it / Your last confirmed data remains available." with only **Retry saved request**. No Dismiss, Discard or Cancel control exists (button census: none). The header **New task** turns grey (disabled). Geometry clean. Confirmed.
3. (Notice content checked in step 2.)
4. **Add a normal comment** "Can you pick one, Marcus?" (`screenshots/step-4-add-comment-blocked.png`). **Add comment** looks enabled; clicking it shows "Resolve the saved request before starting another change." with another **Retry saved request** under the textarea. The comment was not saved (the task still has 1 comment). Geometry clean. Confirmed.
5. **Retry saved request** (`screenshots/step-5-retry.png`). Fails again with the same FORBIDDEN text. Confirmed.
6. **Project switcher** (`screenshots/step-6-switcher.png`). The row reads "Ledger Sync / Saved locally · synced · unconfirmed change". "synced" and "unconfirmed change" sit side by side, which contradicts itself. Geometry: one spill on `div.menu-anchor` (118px); that is the open dropdown overlay and is intentional, not a defect. Confirmed.
7. **Reload** (`screenshots/step-7-after-reload.png`). A page-level banner now reads "A request is awaiting confirmation." with **Retry saved request**. The reason (author-only) is gone, so Priya no longer knows why it fails or what the request was. **New task** is still disabled. Geometry clean. Confirmed: the stuck state survives reload within the tab (sessionStorage). Only a new tab or browser session escapes it.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the conflict blocks and Keep buttons stack cleanly; geometry clean.

Console/page errors: two `Failed to load resource: 403 (Forbidden)` entries, one per Keep/Retry attempt. These are expected for the refused request but show up as console errors.

## Flagged claim verdicts
- **#1 (FORBIDDEN is not definitive; no Dismiss; every other change refused; survives reload): CONFIRMED.** Steps 2, 4, 5 and 7, plus **New task** disabled after the reload.
- **#11 (Keep this comment offered to every viewer): CONFIRMED.** Step 1: both buttons are enabled for a non-author.

## Flow Log
- Ideal path 0 (the button should not be offered). Actual: 1 click into a trap, then 2 failed escape attempts (Add comment, Retry), and reloading does not help. The only real escape is to close the tab.
- Hesitation: after the reload the banner gives no reason, so Priya has to guess what "a request" means.
- Duplicated information: the current comment text repeats one of the two alternatives directly above it, with no label saying these are competing versions.

Status: fail
