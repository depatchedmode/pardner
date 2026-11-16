# STORY-136 walk report: Agent claims a mention, can't finish, and releases it

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-136/` (redacted CLI transcript `cli.log`; claim tokens are redacted). Setup: the Cursor credential from STORY-127. As Priya (operator API) I commented on "Reconcile invoice totals nightly": "@agent-5cf3…-cursor can you update the docs for the nightly reconcile?" → one mention ID.

## Steps
1. **`mentions claim-next --request-id cursor-try-3 --ttl-ms 60000`** → `{claimed:true, replayed:false, mention:{id, taskId, commentId, toActorId, fromActorId, operationId, timestamp, commentDigest}, claimToken:"…", claimExpiresAt}`. `mentions pending` then returns `[]`. Matches.
2. (Agent decides it cannot do the work.)
3. **`mentions release … --claim-token …`** → `{released:true, replayed:false}`. Releasing again → `{released:true, replayed:true}`. `mentions pending` lists the mention again. Matches.
4. **`comment … "Can't reach docs repo from this sandbox; released for another agent"`** → success. In the browser (`screenshots/step-4-panel.png`, `screenshots/step-4-panel-scrolled.png`) Priya's mention comment and Cursor's reply sit in Comments. Nothing on the mention comment shows it was claimed and then released, or that it is waiting again (F-136-01). Geometry clean.

### Variations and edge cases
- Wrong claim token → `STALE_CLAIM: The delivery claim does not match`. Matches.
- Claim with `--ttl-ms 2000`, then `claim-next` again → `{claimed:false, replayed:false}` (nothing else pending). After 3.5 s `mentions pending` shows it again with `deliveryState:"pending"`. Releasing with the expired token → `STALE_CLAIM: The delivery claim has expired`. Matches.
- `mentions foo` → `INVALID_ARGUMENT: Use mentions pending, claim-next, ack, or release`. Matches.
- `mentions pending --actor someone-else` → `ACTOR_MISMATCH` (walked in STORY-123).
- Not walked: replica forwarding of claim/ack/release to the hub `/delivery` (the STORY-125 box had no mentions), and the `mentions deliver` alias.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the panel reflows. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#17 A handoff recipient gets no visible "Notified" cue; no browser surface shows mention delivery state — CONFIRMED** for this story. After claim, release, expiry and re-pending, the task panel showed the same plain comment throughout. No surface in the browser shows notified, claimed, acknowledged or released. The same holds for the agent's own mention of Priya ("@human-… could you register a reviewbot Actor?"), which shows no "Notified" cue.

## Flow Log
- Ideal 2 (claim, release). Actual 2 plus the courtesy comment. The receipts are clear and idempotent.
- Hesitation: none for the agent. For the person, the release is invisible: she cannot tell whether her request is in progress, refused or waiting, so the agent's explanatory comment is the only signal.
- Re-entry: the mention ID and claim token are copied from the claim output into the release command.

Status: pass
