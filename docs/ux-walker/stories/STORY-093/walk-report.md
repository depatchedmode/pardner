# STORY-093 walk report: Agent claims a mention, replies, and acknowledges

Walked 2026-11-09 on branch `client-only-entry`. Browser: Chromium 1440×900 (Marcus Hale). Agent: Priya's built-in openai-codex Actor, driven with `node bin/pardner.js … --token-file <scratch credential from client agent-grant>`. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-093/`. Claim tokens are redacted.

## Steps
1. **Marcus mentions the agent** (`screenshots/step-1-mention-agent.png`). "@agent-04d9f305fe442c1739ad-openai-codex please add a jitter test" on "Retry failed webhook deliveries". The chip title is **"Notified Setup agent · agent"**, not "openai-codex · agent" (the display name is the default "Setup agent"). Geometry clean.
2. **`mentions pending`** returns **two** mentions: the older one from STORY-096 (Settings page) and this one. Each item carries IDs, digest and `deliveryState:"pending"`, but **no comment text or task title**, so the agent cannot triage without a `show` per item.
3. **`mentions claim-next --request-id run-2026-11-09-a --ttl-ms 120000`** gives `{claimed:true, replayed:false, mention:{…}, claimToken:"…", …}`. As FIFO it claimed the **older Settings-page mention**, not the jitter one. The agent acked that one and ran claim-next again (`run-2026-11-09-b`) to reach the jitter mention. Re-running with the same request ID gives `replayed:true`. `--ttl-ms 50` gives `INVALID_ARGUMENT: Claim lifetime must be between 100 and 300000 milliseconds`.
4. **`mentions pending`** after the claim: 0 items. Pass.
5. **`show task-…`**: task, 3 comments with `unreadRevisionIds`, `unreadCount: 3`, mentions and revisions. Pass.
6. **`comments task-…`**: `{success, taskId, comments[3]}`, the same comments again (redundant with `show`, as the story notes). No receipt was written.
7. **`comment task-… "Added jitter test in retry.test.js; passes."`**: `{success:true, …, result:{commentId, mentionIds:[]}}` inside the operation envelope. Pass.
8. **`read task-… --receipts '[{commentId, revisionId}]'`**: success (operation envelope, not the `{receipts:1}` shape the story expected). Bad JSON gives `--receipts must be valid JSON`; a missing flag gives `Supply --receipts`. Pass.
9. **`mentions ack <id> --claim-token …`**: `{acknowledged:true, replayed:false}`. A second ack gives `replayed:true`. A wrong token gives `STALE_CLAIM: The delivery claim does not match`. Pass.
10. **Marcus's browser** (`screenshots/step-10-marcus-sees-reply.png`). "Comments 4 · 3 new", and the reply "Added jitter test in retry.test.js; passes." by **"Setup agent · agent"** with **New**. Marcus's own mention comment shows no sign that the agent claimed or acknowledged it. Activity **Show: Read receipts** (`screenshots/step-10-activity-receipts.png`): "Setup agent read 1 comment on Retry failed webhook deliveries". **Show: Comments** (`screenshots/step-10-activity-comments.png`): "Setup agent commented on …". Geometry clean on all three. Pass.
- **Edge cases run with the cursor agent:** a claim with `--ttl-ms 100`, acked 2 s later, gives `STALE_CLAIM: The delivery claim has expired`, and the mention reappears in `pending` as `pending`. Claim-next with a request ID used by another Actor gives `OPERATION_ID_REUSED: This claim request belongs to another Actor`. All match the catalog.
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean. The handle chip wraps mid-handle by eye (see F-096-02).

Console/page errors: none.

## Flagged claim verdicts
- **#16 (agent display names are their harness IDs, "openai-codex · agent"): REFUTED as worded.** The built-in agent shows as **"Setup agent · agent"** and the joined cursor agent as the `--name` given ("Cursor reviewer"). The harness ID appears nowhere in the UI. The underlying problem is real but different: every person's built-in agent is called "Setup agent", so two people's agents are indistinguishable (see F-090-02).
- **#17 (no browser surface shows mention delivery state): CONFIRMED.** After claim and ack, Marcus's comment and chip look exactly as before.

## Flow Log
- Ideal path 5 (claim, show, comment, read, ack). Actual 8 here: pending, claim (wrong item via FIFO), ack it, claim again, show, comment, read, ack. The extra steps come from a pending item the agent did not choose. `claim-next` cannot target a specific mention.
- Data re-entry: the agent copies the mention ID, claim token, comment ID and revision ID between JSON outputs by hand.
- Redundancy: `comments` repeats what `show` returned; `pending` lacks the text, which forces `show`.

Status: pass
