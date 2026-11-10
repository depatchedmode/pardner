# STORY-010 walk report: Agent-only device tries to open a human browser

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-010/`. Setup: a fresh client (the "CI mini-Mac") minted a browser grant via the operator API, then joined the hub's "Billing platform" project with an **Agent** invitation (`client join --invitation-file … --harness openai-codex --name "CI runner"`), making it agent-only. Video in `videos/`.

## Steps
1. **`pardner open --data …`** → exit 1, stdout `{"success":false,"error":{"code":"FORBIDDEN","message":"Human authority required","details":null}}`, stderr `FORBIDDEN: Human authority required`. `pardner client open` gives the same. No browser opened. The message does not explain that this computer joined as an agent or what to do instead (F-010-02).
2. **Old `#grant=…` URL from before the join** (`screenshots/step-2-old-grant-signed-out.png`): `POST /bootstrap` 403, `GET /session` 401. Screen: "This browser isn't signed in…", notice "The sign-in link was already used or has expired. Links from your agent work once.", "Ask your agent to open Pardner for you. It runs `pardner client open`…", **Check again**. Geometry clean. The notice is false: the link was neither used nor expired; it was refused because the device is agent-only (F-010-01).
3. **Check again** (`screenshots/step-3-check-again.png`): 401, notice disappears, still signed out.
- **Mobile 390×844** (`screenshots/mobile-check.png`): clean reflow.

## Flagged claim verdicts
- **#5 The signed-out screen treats an agent-only `FORBIDDEN` as an expired link and advises "Ask your agent to open Pardner", which cannot work — CONFIRMED.** Bootstrap returned 403, yet the screen said "already used or has expired", and the advised `pardner client open` returns `FORBIDDEN: Human authority required`.

## Flow Log
- Ideal 1 (one command, clear refusal with an alternative). Actual: the CLI refusal is terse jargon with no alternative; the browser route gives a wrong reason and advice that loops back to the failing command. The person is stranded with no stated way forward (link a device / use own client).

Status: fail
