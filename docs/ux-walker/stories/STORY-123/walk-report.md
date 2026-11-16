# STORY-123 walk report: Mint the setup agent's credential for a fresh project

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-123/` (full redacted CLI transcript in `cli.log`). Setup: a fresh client service started with `pardner client serve --data DIR --harness openai-codex --model gpt-5.5-codex --managed-by T3`, identity "Priya Raman", project "Ledgerline Billing" with two tasks, seeded through the operator API.

## Steps
1. **`pardner client list --data DIR`** → exit 0. JSON carries `identity`, `device`, `suggestedIdentity` (from Git), `setupAgent:{harnessId:"openai-codex",name:"Setup agent",model:"gpt-5.5-codex",managedBy:"T3"}` and `projects:[{id:"97ed1fd0-…",name:"Ledgerline Billing",role:"hub",actorId:"actor-6fe8…",apiBase:"/pardner/client/v1/projects/…/api",…,controlAvailable:true}]`. As the story predicts, `actorId` is Priya's human Actor and the agent's Actor ID is not listed anywhere here (F-123-02).
2. **`client agent-grant --project ID`** (no `--output-file`) → exit 1, `INVALID_ARGUMENT: Supply --output-file to store the private agent credential`. Clear.
3. **`client agent-grant --project ID --output-file codex.json`** → exit 0, `{success:true, actorId:"actor-513c…", projectId, credentialFile}`. The token is not printed. Matches.
4. **Credential file** → mode `0600`, keys `token, actorId, projectId, harnessId:"openai-codex", model:"gpt-5.5-codex", managedBy:"T3", apiBase:"http://127.0.0.1:60364/pardner/client/v1/projects/…/api"`. Matches, including the model/managedBy variation.
5. **Browser confirmation.** `screenshots/step-5-board.png`: the board shows the avatar stack "PR" and "SA" (bot glyph), Invite, "You: Priya Raman", "Saved locally · synced". Geometry clean. `screenshots/step-5-agent-profile.png`: the Setup agent profile shows "Agent · Priya Raman's agent · Offline", Works for, Harness "Codex", Git name/email, Devices "filament.local", Live sessions 0. Geometry clean. It shows no Actor ID, no handle and no credential action, so the browser offers nothing for this goal and never shows the project ID (F-123-03).

### Variations and edge cases
- `--harness openai-codex` explicitly → same `actorId`, and a second grant returns the **same token** (checked by comparing the two files without printing them). Matches.
- `--token-file codex.json mentions pending` → `{success:true, mentions:[]}`. Works.
- `mentions pending --actor someone-else` with the token file → `ACTOR_MISMATCH: Actor must match authenticated participant`. Matches.
- `--token-file … --token abc` → `INVALID_ARGUMENT: Supply --token or --token-file, not both`. Empty file → `INVALID_ARGUMENT: --token-file is empty`. Matches.
- `--project` omitted → `INVALID_ARGUMENT: Supply --project`. Unknown project → `NOT_FOUND: Project not found`. Matches.
- `--harness claude` → `INVALID_ARGUMENT: Unsupported execution harness`. The valid IDs are not listed (F-123-01).
- `--harness anthropic-claude-code` (not enrolled) → `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`, no file written. Matches.
- Service not running (empty data dir) → `CLIENT_NOT_RUNNING: Start Pardner with pardner open or pardner client serve`. Matches.
- Not walked: the replica `HUB_UNAVAILABLE` grant case (covered in STORY-125's replica setup only for the happy path).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the header wraps to two rows, filters stack, columns scroll sideways inside the board. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
No flagged claim names STORY-123.

## Flow Log
- Ideal 2 (look up the project ID, one grant). Actual 3: the first grant attempt without `--output-file` fails (the help line shows it as required, so this is a reading slip, recovered in one step).
- Hesitation: `client list` gives an `actorId` that is the human's. The agent Actor ID first appears in the grant result.
- Re-entry of known data: the project UUID has to be copied from the `client list` JSON. The command does not accept the project name, and the browser never shows the ID.
- Duplicated information: the project ID appears in `client list`, the grant output and the credential file.

Status: pass
