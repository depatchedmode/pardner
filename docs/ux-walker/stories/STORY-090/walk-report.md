# STORY-090 walk report: Edit or delete a comment (CLI only) and the delete-permission gap

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900 plus CLI. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-090/`. CLI transcripts: below.

**Setup.** Same three-client "Ledger Sync" project as STORY-088/089. Marcus Hale owns a browser-written comment on "Settings page: webhook secret rotation". Priya's agent credential (`client agent-grant`, harness openai-codex) is at a scratch token file.

## Steps
1. **Look for Edit/Delete in the browser** (`screenshots/step-1-no-affordance.png`). Hovering Marcus's comment reveals nothing. The panel's only buttons are Link issue, Edit task, Hand off work, Mark all read and Add comment. Confirmed: no browser path. Geometry clean.
2. **Find the comment ID and revisions.** The standalone `pardner show <task> --data <marcus client dir>` fails with `LOCAL_SERVICE_UNAVAILABLE: Could not reach sync server: fetch failed`, and `pardner comment …` with `--data` fails `ACTOR_REQUIRED`: the person's own client data dir does not work for standalone commands. With the agent's `--token-file`, `pardner show` returns `comments[]` with `id`, `revisionIds` and `unreadRevisionIds`. Works for agents only.
3. **Edit.** Marcus's only CLI route as the client operator is `pardner client operation --project … --request '{"type":"comment.edit",…}'`. It runs as his **"Setup agent"** Actor, not as Marcus, so editing his own browser comment returns `FORBIDDEN: Only the comment author may edit or resolve it`. **A human cannot edit his own comment anywhere.** A comment written through `client operation` (authored by "Setup agent") can be edited that way: `{success:true}`, and the browser shows "Ran migration 0042_webhook_retry" by "Setup agent · agent" with a **New** tag in Marcus's own browser (`screenshots/step-1-no-affordance.png`, taken after the edit), because his own CLI writes come from a different Actor.
   - Variations: omitting `--revisions` gives `INVALID_ARGUMENT: Supply --revisions`. Passing a string in `expectedRevisions` gives `REVISION_REQUIRED: Supply the observed field revisions`. The agent editing Marcus's comment gives `FORBIDDEN` (edit is author-only, as documented). An unknown comment gives `NOT_FOUND: Comment not found: comment-doesnotexist`.
4. **Browser refresh after edit.** The content updated live. Activity: "Setup agent edited a comment on …".
5. **Delete by a non-author.** Priya's openai-codex agent ran `pardner comment-delete <Marcus's comment> --revisions '["op-…"]' --token-file …` and got **`{success:true}`**. In Marcus's browser (`screenshots/step-5-after-agent-delete.png`) the heading dropped to "Comments 1" and his comment vanished, with no notice in the panel. Activity (`screenshots/step-5-activity-deleted.png`) reads "Setup agent deleted a comment on Settings page…", and the four older rows about Marcus's comment now say "This comment was later deleted." Geometry clean on both.
   - **Attribution is ambiguous.** Both Priya's and Marcus's agents are named "Setup agent", and the avatar stack shows two identical "SA" chips. Marcus cannot tell from Activity that the delete came from *Priya's* agent rather than his own: rows 1 and 2 both read "Setup agent".
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean.

Console/page errors: none.

## Flagged claim verdicts
- **#10 (`comment-delete` has no author check; edit and resolve are author-only): CONFIRMED.** Priya's agent deleted Marcus's human comment (success). The same agent's `comment-edit` on that comment was refused with FORBIDDEN.

## Flow Log
- Ideal path 3 (hover, Edit, Save). Actual for a human: impossible. No browser UI exists, and the CLI operator acts as "Setup agent", so the author check refuses it. For an agent: 2 commands (`show`, then `comment-edit`), plus copying IDs from JSON.
- Re-entry of known data: the comment ID and the revision op ID must be copied out of `show` JSON by hand.
- Hesitation: `--data` works for `client …` commands but not for `show`/`comment`, and the errors (`LOCAL_SERVICE_UNAVAILABLE`, `ACTOR_REQUIRED`) do not point to `client operation` or `--token-file`.
- Destructive action without confirmation or undo: the delete removed another person's comment silently.

Status: fail
