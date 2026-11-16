# STORY-127 walk report: Mistakes with `--token-file` and how each one fails

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-127/` (redacted CLI transcript `cli.log`). Setup: on the STORY-123 client a Cursor harness was enrolled through an Agent invitation (`client join --harness cursor --name Cursor`), and `client agent-grant --harness cursor` wrote `harbor-cursor.json`. A bare `harbor.token` (token only, mode 0600) was extracted from it. I ran the bare-token cases from a scratch directory with no `.pardner/`. For flagged claim #26 I then started a standalone `pardner serve --data …/standalone` on the default 127.0.0.1:8004.

## Steps
1. **`--token "$(jq …)" --token-file harbor-cursor.json tasks --json`** → `INVALID_ARGUMENT: Supply --token or --token-file, not both`. Matches.
2. **`--token-file harbor.token tasks --json`** with nothing on 8004 → `LOCAL_SERVICE_UNAVAILABLE: Could not reach sync server: fetch failed`. The message names neither the URL it tried nor the missing `apiBase` (F-127-01). With a standalone `pardner serve` listening on 8004 → `AUTH_REQUIRED: Unauthorized`, and a write → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`. The CLI does fall back to 8004, but the standalone rejects the client token, so she does **not** silently get the wrong board. The errors point her at the token or `--actor` instead of the missing server (F-127-01).
3. **`--server http://127.0.0.1:60364/pardner/client/v1/projects/…/api`** with the bare token → the read works. Matches.
4. **`comment … --actor priya`** → `ACTOR_MISMATCH: Actor must match authenticated participant`. `--agent priya` gives the same. Matches.
5. **`--token-file harbor-cursor.json comment … "Draft outline uploaded"`** → success, `actorId` is the Cursor Actor. In the browser (`screenshots/step-5-panel.png`) "Reconcile invoice totals nightly" shows the comment by "Cursor · agent", marked New. Geometry clean.

### Variations and edge cases
- Empty file → `--token-file is empty` (walked in STORY-123). JSON without `token` → `INVALID_ARGUMENT: --token-file JSON must contain a token`. Malformed JSON → `INVALID_ARGUMENT: --token-file must be valid JSON`. Matches.
- Credential used against another project on the same client (a second project "Harbor Docs Revamp") → `PROJECT_MISMATCH: Credential belongs to another project`. Matches. Against a project this client does not have → `NOT_FOUND: Project not found`.
- Credential used against a different client's port → `AUTH_REQUIRED: Open Pardner through client open to authenticate`. That copy is written for people, not agents (F-127-02).
- `activity --actor priya` → `UNKNOWN_ACTOR: Unknown Actor: priya`. The story expected a working filter. `activity --actor actor-6fe8…` (an ID) works as a filter, while the same flag on a write is refused. The inconsistency stands, but a display name or slug does not work in either place.
- `tasks --project ID` with a token file → accepted silently and ignored. The story expected `Unknown option: --project` (F-127-03). A genuinely unknown flag (`--bogus-flag`) → `INVALID_ARGUMENT: Unknown option: --bogus-flag`.
- Not walked: the client restarting on a new port (stale `apiBase`).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the panel is full width. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#26 A bare token file with no `apiBase` falls back to `.pardner/connection.json` or `127.0.0.1:8004`, so a standalone service there silently becomes the wrong board — REFUTED (fallback confirmed, silent wrong board refuted).** With a standalone `pardner serve` on 8004 the bare client token got `AUTH_REQUIRED: Unauthorized` on read and `ACTOR_REQUIRED` on write. Nothing was read or written. The fallback does happen, and the resulting errors are misleading (F-127-01).

## Flow Log
- Ideal 1. Actual 5, matching the scripted mistakes. Each mistake was refused, but steps 2 and 4 needed outside knowledge: the 8004 fallback is invisible, and the fix (`--server` with the full project API URL) must be read from docs or the credential file.
- Re-entry: with a bare token she has to rebuild the full `apiBase` URL by hand, though the JSON credential already carries it.

Status: pass
