# STORY-080: Unlink a wrongly linked GitHub issue

Walked 2026-11-09 in Chromium 1440×900 on Theo Lindqvist's client. Task "Show saved cards in wallet" had `acme/lantern-checkout#481`, linked by Theo through his client API (`task.link-issue`). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-080/` (video in `videos/`).

## Steps
0. **Linked state** (`screenshots/step-0-linked.png`): "acme/lantern-checkout#481 **Unlink**". Geometry: only the known `button.task-card` wrap false positive.
1–2. **Click Unlink** (`screenshots/step-1-2-unlinked.png`): there is no confirmation. "Saving locally…" → "Saved locally · synced", and the row is replaced by "No linked issues. Linking does not contact GitHub." Matches. Focus fell to `BODY`. The **Unlink** button's accessible name is just "Unlink", with no issue reference, so with several links a screen-reader user hears identical buttons (see the three in STORY-079's `mobile-check.png`).
3. **History** (`screenshots/step-3-history.png`): "Theo Lindqvist recorded task.unlink-issue on this task" above "Theo Lindqvist recorded task.link-issue on this task". Neither row names the issue, so the History cannot show *which* issue was wrong. Matches.
4. **Link the right one** (`screenshots/var-url-paste.png`, `step-4-relinked.png`): pasting the full URL `https://github.com/acme/lantern-checkout/issues/418` was rejected ("Name the issue as owner/repo#number."). Typing `acme/lantern-checkout#418` linked it. Matches.

Mobile check (`screenshots/mobile-check.png`, 390×844): the section fits, with one link and its Unlink button. Geometry: card false positives only.

Console/page errors: none.

## Flagged claim verdicts
- **#41** (issue unlink History rows read "recorded task.unlink-issue"): **CONFIRMED** (`step-3-history.png`).

## Flow Log
- Ideal 1 (Unlink); actual 1. Relinking the right issue took 2 more (one failed URL paste, then typed).
- No undo after an unconfirmed destructive click, though relinking is cheap.
- History cannot tell the two link rows apart.

Status: pass
