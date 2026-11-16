# STORY-095 walk report: Full loop: human mentions agent, agent works, hands back, human reviews and catches up

Walked 2026-11-09 on branch `client-only-entry`. Priya Raman in Chromium 1440×900 (one live session for the whole loop). Her built-in openai-codex agent ("Setup agent") driven by `node bin/pardner.js … --token-file <scratch credential>`. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-095/`. Video: `videos/page@89cb3cc4e3f704873d0e082acba485d5.webm`. Claim tokens are redacted.

**Setup.** "Add idempotency keys to POST /payments": Up next, P1, assigned to Priya.

## Steps
1. **Open the task** (`screenshots/step-01-open.png`). The panel line reads "Priya Raman · human · P1" (the status is in the Status select, not the line). Geometry clean.
2. **"@codex take this"** (`screenshots/step-02-codex-hint.png`): "@codex matches no Actor and won't notify anyone." Confirmed.
3. **Hand off work** (`screenshots/step-03-handoff-form.png`). Handoff status defaults to **Up next** (unchanged), changed to In progress. Recipient: the list shows **two identical "Setup agent · agent" options**. Priya's own agent could only be picked by reading the option values in the DOM (`actor-eed3…` against Marcus's `actor-ead0…`); a real user would have to guess. Geometry clean.
4. **Hand off** (`screenshots/step-04-handed.png`): "Handed off to Setup agent · agent · In progress." Pass.
5. **Card moves to In progress.** Pass.
6. **Agent `mentions pending`**: one mention for this task (from the handoff comment). Pass.
7. **`claim-next --request-id pay-idem-1 --ttl-ms 300000`**: `claimed:true`, token issued. Pass.
8. **`show`**: status in-progress, assignee the agent, one comment holding the handoff message. Pass.
9. **`link-commit --commit '{hash,message,diff}'`**: success. Pass.
10. **`comment "Implemented; 14 tests added."`**: success.
11. **`read --receipts [handoff comment revision]`**: success.
12. **`mentions ack`**: `{acknowledged:true, replayed:false}`.
13. **`show` again, then `handoff --to actor-<priya> --status review --message "Ready for review" --revisions {assignee,status}`**: success.
14. **Priya's browser, live** (`screenshots/step-14-live-update.png`). Within 3 s the card is in **Review** and the heading reads "Comments 3 · 2 new". (The story expected "4 · 2 new"; the walk had 3 comments because Priya's "@codex" draft was not posted.) Pass.
15. **Read comments and Evidence** (`screenshots/step-15-comments.png`, `step-15b-evidence.png`). Both agent comments carry **New**. Evidence shows the hash `a1b2c3d4…` and the message, with subject and body run together on one line ("Add idempotency keys to POST /payments Reuse request_id header."). Geometry clean.
16. **Mark all read** (`screenshots/step-16-marked.png`): the heading becomes "Comments 3" and the button is disabled. Pass.
17. **Status → Completed** (`screenshots/step-17-completed.png`). The card moves to Completed. **Under the Status row, the panel still says "Handed off to Setup agent · agent · In progress."** That is the stale success line from step 4, now false twice over (the agent handed it back, and it is Completed). Geometry clean.
18. **Activity → Status changes and handoffs** (`screenshots/step-18-activity.png`): "Priya Raman moved … to Completed", "Setup agent handed … to Priya Raman and set it to Review", "Priya Raman handed … to Setup agent and set it to In progress". Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#15 (handles shown nowhere; `@name` gets "matches no Actor"): CONFIRMED.** Step 2. The only working route was Hand off work.
- **#16 (agent display names are harness IDs): REFUTED as worded.** The agent shows as "Setup agent", never "openai-codex". The real defect is that all built-in agents share that name (step 3).

## Flow Log
- Ideal path 12. Actual: human 7 browser actions (open, failed mention, Hand off work, recipient guess, status change, message, Hand off) + agent 8 commands + human 4 (read, evidence, Mark all read, Completed). Roughly the ideal plus the failed mention.
- Hesitation: choosing between two identical "Setup agent · agent" recipients. A wrong guess would hand the payments task to Marcus's agent.
- Duplicated information: the handoff message appears as a comment, a History row and an Activity row. The stale "Handed off to … In progress" line contradicts the current Completed state.
- Status is fail because of the high finding F-095-02 (indistinguishable agent recipients); every step of the loop itself worked.

Status: fail
