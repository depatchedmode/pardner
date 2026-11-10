# STORY-005 walk report: Signed out in the middle of a session (server-side revoke)

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-005/`. Setup: hub client "Aisha Bello" (`--public-url http://127.0.0.1:47105`) with project "Billing platform" and task "Migrate billing webhooks to v2"; a second client joined with a **My device** invitation (`client join`) and opened the board in Chromium. The hub then ran `client revoke --project … --kind device --id <device> --operation-id …` (output `{"success":true,"revoked":true,"kind":"device",…}`). Video of the whole sequence in `videos/`.

## Steps
0. **Signed in on the linked device** (`screenshots/step-0-signed-in-board.png`): board with the task, "You: Aisha Bello", "Saved locally · synced". Geometry clean.
1. **Revoke on the other device.** 4.3 s later the board was replaced (presence `401`, session-end `401`, session-start `401`).
2. **Signed-out screen** (`screenshots/step-2-after-revoke.png`): "This browser isn't signed in to your local Pardner client." + "Ask your agent to open Pardner for you…" + **Check again**, no reason given. Geometry clean.
3. **Check again** (`screenshots/step-3-check-again.png`): this time the screen *did* change: "Billing platform / This project didn't open. / **Project access revoked; local data remains saved** / This invitation or membership was revoked. Ask for a new invitation." with **Retry** and **Open another project**. The browser had never been signed out: its cookie session was still valid; only the project admission was revoked. The signed-out screen in step 2 was wrong (F-005-01).
4. **`pardner client open`** on the revoked device succeeded; pasting the new link (`screenshots/step-4-after-reopen.png`) landed on "Welcome, Aisha Bello" Start/Join with no mention that "Billing platform" was revoked or removed (F-005-02). `client status` still reports identity and device.
- **Mobile 390×844** (`screenshots/mobile-check.png`): Welcome screen reflows cleanly.
- **Variation (merged), agent-only device.** A fresh client with the browser on the identity step joined via an **Agent** invitation. The open identity step stayed on screen for 40 s with no change (no polling there) (`screenshots/variation-agent-only-signed-out.png`); a fresh visit then showed the generic signed-out screen (`variation-agent-only-fresh-visit.png`) and `pardner client open` failed `FORBIDDEN: Human authority required`. The screen still advised "Ask your agent to open Pardner", which cannot work.
- **Variation: local service stopped** → see STORY-009/STORY-012 (CLIENT_UNREACHABLE).

Console: 401/403s listed above, all expected from the revoke.

## Flagged claim verdicts
- **#5 The signed-out screen treats an agent-only `FORBIDDEN` as an expired link and advises "Ask your agent to open Pardner", which cannot work there — CONFIRMED** for the agent-only variation (advice shown; `client open` → `FORBIDDEN: Human authority required`). For this story's main path (device revoke) the related defect is worse: a *project* revocation is reported as "This browser isn't signed in", with the real reason only revealed by Check again.

## Flow Log
- Ideal 2 (re-run `pardner open`, board back). Actual: the board cannot come back (access revoked); the correct explanation needed 1 extra click on Check again, which the screen does not suggest will help. After re-open, the project is silently gone.
- No reason is given on the first screen; a person cannot tell revocation from expiry or sign-out.

Status: fail
