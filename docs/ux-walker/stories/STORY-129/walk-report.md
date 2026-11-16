# STORY-129 walk report: Agent tries operations that are outside the board allowlist

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-129/` (redacted CLI/HTTP transcript `cli.log`). Setup: Gamma's (`anthropic-claude-code`) credential from STORY-124. Direct HTTP calls used the credential's `apiBase` and bearer token from a small script that never prints the token.

## Steps
1. **`--token-file claude.json actors register actor-reviewbot --handle reviewbot --kind agent`** → exit 1, `FORBIDDEN: This operation is not available to board credentials`. It does not mention invitations (F-129-01).
2. **`actors list`** → success; the actors come back with `humanId`, `gitIdentity`, `devices`. Matches.
3. **`operation --request '{"type":"actor.register",…}'`** → the same `FORBIDDEN`. Matches.
4. **`GET {apiBase}/pardner/control`** → HTTP 403 `{"code":"FORBIDDEN","error":"Control is available only to a person using Pardner on this computer"}`. Matches.
5. **`GET {apiBase}/automerge/doc?limit=5`** → 403 `FORBIDDEN: Unsupported query parameter`. Plain `GET /automerge/doc` → 200. Matches.
6. **`POST {apiBase}/automerge/ws-ticket {"purpose":"replica"}`** → 403 `REPLICA_REQUIRED: Native replicas require separate enrollment`. Matches.
7. **`comment … "@human-… could you register a reviewbot Actor?"`** → success.

### Variations and edge cases
- Allowed write: `vein create --title "Batch retries" --goal "Reliable webhooks"` → success as Gamma. The Goals view (`screenshots/variation-goals.png`) shows goal "Reliable webhooks" (Open) with vein "Batch retries" (Open, 0 tasks). Geometry reported `unevenRows` on the Tasks/Goals/Activity/Control nav (widths 69/69/82/81). By eye these are content-width tab buttons with even gaps, so I dismissed it. One real inconsistency: the tab bar sits at y≈107 on Goals but y≈132 on Tasks, so it jumps between views (F-129-02).
- `GET /automerge/operations` → 403 `Unsupported workspace endpoint`. `PUT /automerge/doc` and `DELETE /automerge/operations` → 403 `Unsupported method`. Matches.
- Not walked: the operator-token trust boundary (a policy observation, not a UI path).
- **Mobile 390×844** (`screenshots/mobile-check.png`): Goals reflows. Same nav `unevenRows` note (dismissed).
- Console errors: none.

## Flagged claim verdicts
No flagged claim names STORY-129.

## Flow Log
- Ideal 0 (a fast, clear refusal that names the right route). Every refusal was fast and none leaked data. Only the Control refusal names who can use it. The `actor.register` refusal gives no route, so the agent has to guess that it should ask the person, which this story's persona does.
- No re-entry of data. No duplicated information.

Status: pass
