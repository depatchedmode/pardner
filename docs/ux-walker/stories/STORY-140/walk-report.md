# STORY-140: The creator revokes a member, who sees REVOKED on their next write

Setup: hub "Dana Whitfield" (Atlas Mobile, `--public-url http://127.0.0.1:52301`). "Kevin Brandt" joined from his own client as a replica. Kevin's board was open in Chromium 1440x900 when Dana revoked him with the real CLI. I repeated the revocation with a second member client ("Kevin Brandt", kevin.b@…, who also has his own project "Kevin side notes") to confirm the behaviour and to walk the "other project" branch. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-140/`.

## Steps
0. **Kevin's board before revocation.** `screenshots/step-0-kevin-board.png`: Atlas Mobile, "Saved locally · synced". Geometry: card-title wraps only.
1. **Dana: `client show --project …`.** The JSON lists `actors[]`, and each has `id` (the Actor ID, `actor-…`), `humanId` and `handle`. The word "identity" appears nowhere. The person has to guess that `humanId` is the "identity ID" the revoke command needs (F-140-02).
2. **Dana: revoke.** With Kevin's **Actor ID**: `NOT_FOUND: Admission not found` (flag #21). With his `humanId`: `{"success":true,"revoked":true,"kind":"member","id":…}`. Matches, once the right ID is found.
3. **Kevin's open board** (about 4.7 s after the revoke in the repeat run). `screenshots/step-3-socket.png`: the board is replaced by the **signed-out screen**: "This browser isn't signed in to your local Pardner client. Ask your agent to open Pardner for you. It runs `pardner client open`…" with **Check again**. Revocation is not mentioned. Kevin is still signed in to his own client; only one project's membership ended (F-140-01). The catalog expected "Live updates disconnected. Reconnecting automatically." The behaviour differs and the copy is wrong. Geometry clean.
4. **Change the status of "Settings screen dark mode".** BLOCKED in the UI, because the board is gone before any write is possible (both runs). The same write through Kevin's local client API returns 403 `REVOKED` "Project membership is not available". `client show --project …` on Kevin's client also returns `REVOKED: Project membership is not available`.
5. **Retry saved request.** BLOCKED for the same reason. There was no pending request to retry.
6. **Check again** (repeat run). `screenshots/repeat-check-again.png`: Check again *does* recover. It shows "Atlas Mobile — This project didn't open." / **"Project access revoked; local data remains saved"** / "This invitation or membership was revoked. Ask for a new invitation." with **Retry** and **Open another project**. The signed-out screen was therefore a misdiagnosis of a 401 from the revoked project (F-140-01). Geometry: one `unevenRows` hit, the two buttons sized to their labels (not a defect).
7. **Reload or fresh open.**
   - Atlas Mobile was his only project: `screenshots/step-7-fresh-open.png` shows the same revoked screen. **Retry** is offered although it can never succeed (F-140-03). `client list` on Kevin's client now returns `projects: []`.
   - With another project (repeat client): `screenshots/step-7c-reload.png` opens "Kevin side notes", and Atlas Mobile has quietly gone from the switcher. Nothing on the board says it was revoked (F-140-04). Matches the catalog's mechanics, but it is a disclosure gap.
- Mobile (390x844, revoked screen): `screenshots/mobile-check.png`. Clean, and the buttons fit.
- Console: 401s (the project endpoints after revocation) then 403s. No page errors.

## Flagged claim verdicts
- **#2 (REVOKED on a board write keeps the request pending and undismissable; no board-specific revoked message):** partly REFUTED, partly BLOCKED. The live board never reaches a write: it falls to the generic signed-out screen within about 5 s of revocation (a different and worse defect, F-140-01). After a reload or Check again there *is* a project-specific "Project access revoked; local data remains saved" screen. The pending-request part could not be produced from the UI.
- **#21 (member revocation needs the identity ID; the Actor ID gives NOT_FOUND "Admission not found"):** CONFIRMED. `client show` does not label any field "identity" (it is `humanId`).

## Flow Log
- Dana. Ideal 2 (find the ID, revoke). Actual: `client show`, read the JSON and pick between `id`, `humanId` and `handle`, revoke with the Actor ID (fails), revoke with `humanId` = 4. One wrong guess and the JSON reading are friction. There is no UI route.
- Kevin. Ideal 1 (see a clear revoked state). Actual: signed-out screen with wrong advice, then Check again, then the revoked screen = 2+. If he follows the on-screen advice ("Ask your agent to open Pardner"), the agent's `client open` lands him on the same revoked screen, so the outcome is right but he was misled on the way. With other projects he gets no message at all.

Status: fail
