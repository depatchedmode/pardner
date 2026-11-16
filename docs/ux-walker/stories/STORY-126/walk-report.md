# STORY-126 walk report: Agent works a task end to end with `--token-file`

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-126/` (redacted CLI transcript `cli.log`). Setup: the STORY-123 client and Codex credential. As Priya (through the operator API), "Retry failed Stripe webhooks with backoff" was set to Up next, assigned to the Codex Actor, and given the comment "@agent-5cf3…-openai-codex please start with the idempotency key". The Git steps ran in a scratch repository outside the product repo.

## Steps
1. **`tasks --assignee me --json`** → `UNKNOWN_ACTOR: Unknown Actor: me`. With `--assignee actor-513c…` (copied from the credential) → the task in `up-next` plus `status`. Matches (F-126-02).
2. **`show task-673c…`** → `task`, per-field `revisions`, `conflicts`, `comments` (with `unreadRevisionIds`) and `history`. Matches.
3. **`mentions pending`** → one mention from Priya, `deliveryState:"pending"`, with `commentDigest`. Matches.
4. **`mentions claim-next --request-id codex-run-17`** → `{claimed:true, replayed:false, mention:{…}, claimToken:"…", claimExpiresAt}`. Matches.
5. **`mentions ack … --claim-token …`** → `{acknowledged:true, replayed:false}`. `mentions pending` → `[]`. Matches.
6. **`update --status in-progress`** with the creation revision → `STALE_UPDATE: This field changed since it was read; refresh its context`, with `details.current`/`expected`. Retried with the revision from `show` → success, `savedLocally:true`. Matches.
7. **Browser** (`screenshots/step-7-panel.png`): the card is in In progress, "Setup agent · agent". The panel shows "Here now PR" (Priya's own session only; the CLI opens no presence) and the agent's comment marked "New". Geometry clean.
8. **`comment … "@human-cce5… please check the cap." --operation-id codex-c1`** → `{commentId, mentionIds:[…]}`. In the browser the comment appears with the handle highlighted. **There is no "Notified …" chip**, and nothing in the panel shows that a mention was delivered (F-126-01). Handles render as raw `@agent-5cf3628a2782edcea198-openai-codex` / `@human-cce56e60-…` text (F-126-03).
9–10. **`commit --task … --model gpt-5.5-codex -- -m "…"`** with nothing staged → `GIT_COMMIT_FAILED: Git commit failed`, `details:null`. Git's "nothing to commit" went to stderr only (F-126-04). After staging a file → git output on stderr and `{trace:{commit:{hash:"ebfa4b1…"}, agent:{name:"actor-513c…", model:"gpt-5.5-codex"}, …}, receipt:{…}}`. Matches.
11. **`show`** again for fresh `status` and `assignee` revisions. Matches.
12. **`handoff --to Priya …`** → `UNKNOWN_ACTOR: Unknown Actor: Priya`. A display name is not accepted, so the agent needs Priya's `human-<uuid>` handle (F-126-02). With the handle and `--operation-id codex-handoff-1` → `{commentId, mentionIds}`. Matches.
13. **Browser** (`screenshots/step-13-panel.png`, `screenshots/step-13-panel-scrolled.png`): the card is in Review, "Priya Raman · human". Evidence lists `ebfa4b1dbcd8…` "Retry Stripe webhooks with capped backoff". History reads "Setup agent handed this task to Priya Raman and set it to Review" with the quoted message, "Setup agent linked commit ebfa4b1 to this task" and "Setup agent moved this task to In progress". Activity (`screenshots/step-13-activity.png`) lists the same events newest first. Geometry clean on all.
14. **`activity --task … --limit 5`** → the handoff first, with `changes` (assignee, status). Matches.

### Variations and edge cases
- `trace task …` → `{evidence:[{hash, message, diff}]}`. Matches.
- Run outside a Git repository → `GIT_REPOSITORY_REQUIRED: Run this command inside a Git repository`. Matches.
- Not walked: `link-commit` failure recovery (needs the client stopped mid-command), `AMBIGUOUS_ACTOR`.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the panel takes the full width and Status, Edit task and Hand off work wrap to two rows. Long handles wrap mid-token. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
No flagged claim names STORY-126. The missing "Notified" cue bears on flag #17 (walked in STORY-136).

## Flow Log
- Ideal 8. Actual 12: two wasted calls (`--assignee me`, `--to Priya`) because the CLI takes only IDs or handles, plus one stale-revision retry that the design expects.
- Hesitation: the agent has to hunt for Priya's handle in comment text or `client show`. The credential file carries no handle for the agent or its owner.
- Re-entry: revisions are copied from `show` into JSON by hand for each write.
- Duplicated information: task state shows in `tasks`, `show`, the card, the panel, History and Activity. The handoff message appears both as a comment and in History.

Status: pass
