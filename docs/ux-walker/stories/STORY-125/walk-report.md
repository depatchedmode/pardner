# STORY-125 walk report: Set up an agent-only build box from an Agent invitation

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-125/` (redacted CLI transcript `cli.log`, video of the signed-out box in `videos/`). Setup: a hub client for Priya started with `--http-port 48125 --public-url http://127.0.0.1:48125 --harness openai-codex` (plain HTTP is allowed only on loopback, so the HTTPS public route is simulated), project "Ledgerline Billing". Two fresh "build boxes" on this Mac: `ci-mini-02` (`client serve --device-name ci-mini-02 --harness openai-codex`) and `ci-mini-03` (`--harness cursor`). Agent invitations were made with `client invite --purpose agent` on the hub.

## Steps
1. **`client serve --device-name ci-mini-02 --harness openai-codex`** → `{success:true, serving:true, mode:"client", localUrl:"http://127.0.0.1:59228/pardner/"}`. Matches (`--device-name` is accepted although the help line does not list it).
2. **`client join --invitation-file … --operation-id ci-join-1 --harness openai-codex --name "Overnight Codex"`** → exit 0, `{project:{role:"replica", actorId:"actor-ceb3…", controlAvailable:false, status:{hubConnected:true, syncPending:true…}}}`.
3. **`client open`** → exit 1, `FORBIDDEN: Human authority required`. `client invite` gives the same. Matches, but nothing says the box is agent-only or what to do instead (F-125-03).
4. **`client agent-grant --project … --output-file ci-agent.json`** → exit 0, `actorId:"actor-ceb3…"`, file `harnessId:"openai-codex"`, `apiBase` on the box's own port. Matches.
5. **`--token-file ci-agent.json mentions pending`** → `{success:true, mentions:[]}`. `tasks --json` → the hub's task. Matches.
6. **Hub browser** (`screenshots/step-6-hub-avatars.png`, `screenshots/step-6-hub-codex-profile.png`): the avatar stack shows PR, "C(" and SA. There is **no "Overnight Codex"**. The box's Codex joined as the *same* Actor as the hub's "Setup agent" (`actor-ceb3…`, deterministic per person and harness). Its profile now lists Devices "filament.local, ci-mini-02". The `--name` was dropped without a word (F-125-01). Geometry clean.

### Variations and edge cases
- **Old grant link on an agent-only box** (`ci-mini-03`: a grant URL was minted before the join and opened after it; `screenshots/variation-old-grant.png`): `POST /bootstrap` 403, then `GET /session` 401. Screen: "This browser isn't signed in to your local Pardner client." Notice: "The sign-in link was already used or has expired. Links from your agent work once." Advice: "Ask your agent to open Pardner for you. It runs `pardner client open`…", plus **Check again**. **Check again** (`screenshots/variation-old-grant-check-again.png`) → 401, the notice disappears and nothing else changes. Geometry clean on both (F-125-02).
- Plain visit to the box with no grant (`screenshots/step-3-box-plain-visit.png`): same screen without the notice. The advice cannot work on this box.
- Joining with full metadata (`--harness cursor --name "Cursor (ci)" --model gpt-5.5 --managed-by T3`) → a separate Cursor Actor. Its profile (`screenshots/variation-hub-cursor-profile.png`) reads "Agent · Priya Raman's agent · Offline", Harness "Cursor", Devices "ci-mini-03". The avatar initials render as **"C("** (F-125-05).
- The box adopted the sponsor identity: `client list` on ci-mini-02 shows `identity:{name:"Priya Raman"…}` and does not say the box is agent-only. On the hub, Priya's own human profile (`screenshots/variation-hub-human-profile.png`) now lists Devices "filament.local, ci-mini-02, ci-mini-03", although she has no browser authority on either box (F-125-04).
- `client invite` from the box → `FORBIDDEN: Human authority required`. Matches.
- Not walked: the HTTPS refusal for a non-loopback plain-HTTP hub (only loopback is available here), hub offline during the join, `IDENTITY_MISMATCH`, and the 10 s admission cache.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the signed-out screen reflows cleanly. Geometry clean.
- Console: only the expected 401/403 resource errors on the signed-out box. None on the hub board.

## Flagged claim verdicts
- **#5 The signed-out screen treats an agent-only `FORBIDDEN` as an expired link and advises "Ask your agent to open Pardner", which cannot work — CONFIRMED.** Bootstrap returned 403 for an unused link on an agent-only box, the screen said "already used or has expired", and the advised `pardner client open` returns `FORBIDDEN: Human authority required` on that box.

## Flow Log
- Ideal 3 (serve, join, grant). Actual 3 for the CLI goal, plus one wasted `client open` out of habit.
- Hesitation: after joining with `--name "Overnight Codex"`, Marcus cannot find that agent on the board. It is the laptop's "Setup agent" with an extra device, so comments from the box and from the laptop are indistinguishable.
- Re-entry: the project UUID has to be read from the join output to run the grant.
- Duplicated information: the box name appears under both the human and the agent profile Devices lists.

Status: pass
