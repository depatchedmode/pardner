# STORY-019: Two tabs racing on the identity step (IDENTITY_EXISTS in the browser)

Walked 2026-11-09 in Chromium 1440×900. One fresh client Git-prefilled "Owen Brooks" / "owen@brooks.dev"; two tabs in the same browser profile, each signed in with its own one-time grant. A second fresh client was used for the identical-values variation. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-019/`.

## Steps

1. **Tab A.** Name changed to "Owen B." → **Continue as Owen B.** → **Welcome, Owen B.** (`screenshots/step-1-tabA.png`).
2. **Tab B, still showing "Owen Brooks".** `screenshots/step-2a-tabB-before.png` shows no sign that another tab already confirmed. Clicking **Continue as Owen Brooks** gives the red box **Identity already initialized; linking requires My device** with no hint, while the identity form and the same button stay in place (`screenshots/step-2-tabB-identity-exists.png`). HTTP 409. Geometry: clean.
3. **Reload tab B** → **Welcome, Owen B.** (`screenshots/step-3-tabB-reloaded.png`). The Start form copy reads "You join as Owen B.." (double period when the name ends in a period).

Variations:
- **Both tabs submit identical name/email** (second client): tab B advanced normally to **Welcome, Owen Brooks** (`screenshots/var-identical-values.png`).
- **Reused (stale) grant link** in a fresh browser context → "This browser isn't signed in to your local Pardner client." / "The sign-in link was already used or has expired. Links from your agent work once." / "Ask your agent to open Pardner for you…" / **Check again** (`screenshots/var-stale-grant.png`).

Mobile 390×844 (reloaded tab B, `mobile-check.png`): clean.

Console: one expected 409 in tab B; no page errors.

## Flagged claim verdicts

- **#19 (`IDENTITY_EXISTS` "linking requires My device" is misleading) — CONFIRMED for the browser.** The message shows raw, with no hint, and points Owen to My device linking, which is irrelevant. The only fix (reload) is not offered, and the form keeps inviting him to click Continue again, which repeats the same error.

## Flow Log

- Ideal 1; actual 3 (Continue in A, Continue in B → error, reload B). The second tab never learns about the first tab's change until a manual reload.
- Hesitation: the error suggests linking a device, which is unrelated to what happened.
- No data re-entry, but tab B's edits (if any) are silently replaced by tab A's values after reload.

The behaviour matched the catalog (including the predicted IDENTITY_EXISTS), and no finding is high or critical, so the story passes despite the misleading error.

Status: pass
