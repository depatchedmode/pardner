# STORY-128 walk report: Send a raw operation with `client operation`

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-128/` (redacted CLI transcript `cli.log`). Setup: the STORY-123/124 client, with Codex (setup agent) and Claude Code ("Gamma") enrolled.

## Steps
1. **`client operation --project ID --request '{"type":"task.link-issue","payload":{"taskId":"task-673c…","repository":"ledgerline/billing","number":412}}'`** → exit 0, `{success:true, operationId, requestId:<random>, actorId:"actor-513c…" (Codex), replayed:false, savedLocally:true…}`. No credential file was needed. Matches.
2. **Browser** (`screenshots/step-2-panel.png`): under **GitHub issues** the task shows a bulleted link "ledgerline/billing#412" with **Unlink**. Geometry clean. History (`screenshots/step-2-panel-scrolled.png`) and Activity (`screenshots/step-2-activity.png`) attribute it to the agent, but the row reads **"Setup agent recorded task.link-issue on this task"**, a raw operation type (F-128-02).

### Variations and edge cases
- `--harness anthropic-claude-code` with `"operationId":"backfill-412"` → success as Gamma. Re-run → same `operationId`, `replayed:true`. Same ID with `number:414` → `OPERATION_ID_REUSED: This operation ID already belongs to a different request`. Matches.
- **Malformed `--request`** (`{type:task.link-issue,…}`, as if the shell had eaten the quotes) → exit 1, `INTERNAL_ERROR: Expected property name or '}' in JSON at position 1 (line 1 column 2)`. By contrast `pardner operation --request "{bad"` → `INVALID_ARGUMENT: --request must be valid JSON` (F-128-01).
- **`--request` omitted** → `FORBIDDEN: This operation is not available to board credentials`. It does not say `--request` is missing (F-128-01).
- Body naming Priya's human `actorId` → `ACTOR_MISMATCH: Actor must match authenticated participant`. Matches.
- Body with `"projectId":"other"` → `PROJECT_MISMATCH: Operation belongs to another project`. Matches.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the panel reflows. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#27 (STORY-128 part) `client operation` with malformed JSON returns `INTERNAL_ERROR` with a raw SyntaxError; an omitted `--request` gives a misleading `FORBIDDEN` — CONFIRMED.** Both outputs are shown above. The standalone `pardner operation` handles the same input with a proper `INVALID_ARGUMENT`.

## Flow Log
- Ideal 1. Actual 1 for the happy path. The person never sees which agent acted unless she reads `actorId` in the output. The command does not echo the harness, so "as her agent" means "as the setup agent" by default.
- Hesitation: the payload shape (`repository` + `number` versus `owner/repo#n`) is not in the help. The help shows only `--request JSON`.
- Duplicated information: the same link can be made through `issue link`, `operation`, `client operation` and the panel's **Link issue**. Only the last acts as the human.

Status: pass
