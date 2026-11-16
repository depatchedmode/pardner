# STORY-132 walk report: Bridge config refusals under client-credential rules

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-132/` (redacted CLI transcript `cli.log`). Setup: the STORY-131 valid `bridge.json` and the Codex credential. Each case is a copy of the valid config with one change. No Codex App Server is needed: every refusal comes before dispatch.

## Steps
1. **Two-Actor config (Codex plus Gamma, `allowedTaskIds:["*"]`)** → `ACTOR_MISMATCH: A client agent credential wakes only its own Actor; map that Actor alone`. Matches.
2. **Claude mapping removed, wildcard kept** → `INVALID_ARGUMENT: Authorize explicit task IDs; wildcard dispatch is not supported`. Matches.
3. **Explicit IDs, but `workspaceId` of another project** → `WORKSPACE_MISMATCH: The bridge credential belongs to another project`. Matches. With the right `workspaceId` the run succeeds (shown in STORY-131).

### Variations and edge cases
- Bare token file → `INVALID_ARGUMENT: The bridge credential file must hold the JSON written by client agent-grant`. A missing file gives the same message, which is fair but does not say the file is missing (F-132-02).
- `apiBase` not a project API → `The bridge credential apiBase must be a client project API`. Matches.
- Non-loopback endpoint → `Bridge endpoints must be local loopback URLs without credentials or query parameters`. `adapter:"t3"` → `This bridge supports codex-app-server; other adapters are not implemented`. `sessionOwner:"desktop"` → `Use a dedicated bridge-owned session; Desktop-owned tasks are not qualified`. Missing policy keys → `Pin expectedPolicy to the approvalPolicy, approvalsReviewer, and sandbox returned by the authorized Codex session`. Matches.
- `inboxDirectory` equal to the credential file path → `Keep bridge storage separate from service storage`. Matches. `inboxDirectory` set to the client's own data directory → `STORAGE_IN_USE` (refused; nothing was written there). `inboxDirectory` set to the directory that *holds* the credential → **accepted**: the bridge started and wrote `inbox.sqlite` next to the private credential (F-132-03).
- Relative inbox → `Bridge directories must be absolute`. Missing `enabled` → `Set enabled explicitly for every Actor mapping`. Duplicate mapping → `Map each Actor and session only once`. Matches.
- **Malformed `bridge.json`** → `INTERNAL_ERROR: Expected double-quoted property name in JSON at position 24 (line 1 column 25)`. The message does not name the file (F-132-01).
- `--token-file` omitted → `INVALID_ARGUMENT: Bridge configuration requires replicaId`. It should ask for `--token-file` (F-132-02).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the board (this story has no browser surface). Geometry clean.

## Flagged claim verdicts
- **#27 (STORY-132 part) Malformed `bridge.json` gives a raw JSON SyntaxError as `INTERNAL_ERROR` — CONFIRMED.** Output is shown above.

## Flow Log
- Ideal 2 (split the config, run). Actual 4: one refusal at a time (actor, then wildcard, then workspace). Each message names its fix, but the bridge validates and reports only the first problem per run.
- Re-entry: task IDs must be copied from `tasks --json` into the config by hand.

Status: pass
