# STORY-004 walk report: Reused or expired sign-in link → signed-out screen and Check again

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-004/`. Client from STORY-001/002 (project "Atlas onboarding"). "Chrome" = a Chromium context that consumed the grant first; "Firefox" = a second, cookie-less Chromium context (Firefox engine not installed). Grants minted with `pardner open --output-file F --data DIR`; values redacted as `#grant=…`. Video: `videos/` (Firefox context).

## Steps
1. **Paste the used link into Firefox.** `POST /bootstrap` 401, `GET /session` 401. Address bar shows `/pardner/` (grant stripped).
2. **Signed-out screen with notice** (`screenshots/step-2-signed-out-with-notice.png`): "Pardner / This browser isn't signed in to your local Pardner client." amber-bordered notice "The sign-in link was already used or has expired. Links from your agent work once." then "Ask your agent to open Pardner for you. It runs `pardner client open`, which signs this browser in without showing you a key." and **Check again**. Geometry clean. The inline code renders in a Courier-style serif monospace that differs from the static shell's monospace, and `pardner client open` breaks across lines at 1440 px (F-004-04).
3. **Check again** (`screenshots/step-3-check-again-1.png`): 401 again; the notice disappears, everything else identical and the screen shifts up ~95 px. Geometry clean.
4. **Check again ×2 more** (`step-3-check-again-2.png`, `-3.png`): identical; no feedback at all that the click did anything.
5. **Run `pardner open`.** With the fake launcher the URL goes to the OS default browser, not this one (no flag selects a browser). Simulated by step 6.
6. **New `--output-file` URL pasted into the same tab** (hash-only change): board appeared within ~40 ms (`screenshots/step-6-hashchange-board.png`). Geometry: only the known task-card multi-line false positive.
7. **Check again in a second stale tab** (`screenshots/step-7-stale-tab-check-again-board.png`): `/session` now succeeds with the cookie set by the other tab; board opens.
- **Variation: no grant at all** (`screenshots/variation-no-grant-signed-out.png`): signed-out screen without the notice. Clean.
- **Variation: unused link older than 60 s** (`screenshots/variation-expired-unused.png`, waited 66 s): identical notice to the reused case; copy does not distinguish.
- **Mobile 390×844** (`screenshots/mobile-check.png`, `mobile-focus.png`): reflows cleanly; Tab gives a clear green focus ring on **Check again**.

Console: only the expected 401s on `/bootstrap` and `/session`.

## Flagged claim verdicts
- **#4 Check again only re-reads `/session` and can never sign a browser in; it also removes the expired-link notice — CONFIRMED.** Three clicks: each a `GET /session` 401; the notice vanished on the first click so the screen looked changed while still signed out. Nuance: Check again *does* recover when another tab of the same browser has since obtained a cookie (step 7), and when the "signed-out" screen was shown in error (see STORY-005). It never helps in the story's main situation.

## Flow Log
- Ideal 2 (run `pardner open`, new tab signed in). Actual for a non-default browser: 4+ (paste → Check again ×3 wasted → realise `pardner open` targets the default browser → `--output-file` → paste into same tab). 3 extra steps; Check again is a dead end that looks like a fix.
- The screen tells a person to "Ask your agent"; nothing says they can run the command themselves, nor that a second browser needs `--output-file`.
- Spelling drift: this screen says `pardner client open`; the startup shell says `pardner open`.

Status: fail
