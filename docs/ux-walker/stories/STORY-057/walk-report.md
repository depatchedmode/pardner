# STORY-057: Operator/agent reads presence from the CLI

Setup: Harbor Billing hub (`--data …/presence/h`) and Dev's replica (`…/presence/d`) running; Juniper's agent session and Maya's and Priya's browser sessions live; Dev offline. Commands run from the repo root with `--data`.

## Steps
1. **`pardner client show --project harbor-billing`** → `{"success":false,"error":{"code":"NOT_FOUND","message":"Project not found"}}` (F-057-01). `client list` gives the UUID. **`client show --project <uuid>`** → `{success, project:{id,name,role,actorId,apiBase,wsPath,authentication,workspaceId,status,controlAvailable}, actors:[9], presence:{actors:[3 entries], observedAt:1067308.66, available:true}}`. Each presence entry has actorId, state (active/idle), focusTaskIds and sessions with sessionId, deviceId, deviceName, kind, harnessId, managedBy, model, state, focusTaskIds and ttlMs. Matches the story's shape. The same command on Dev's replica returns the same three entries via the hub. Saved output: scratch `show-hub.json` (no secrets).
2. **Look for Dev**: his actorId is absent from `presence.actors`; the reader must map IDs to names via `actors[]` (F-057-02). As the story predicts.
- Variation, hub down (`hubdown-log.json` in the evidence dir): after `client stop` on the hub, `client show` on Dev's replica returns `presence:{actors:[], observedAt:null, available:false, code:"HUB_UNAVAILABLE"}` with all 9 `actors` still listed. Matches the story.
- Edge: `observedAt` is monotonic, not a time (F-057-03). No `--watch`; confirmed by `client --help`.
- Without `--data` the CLI targets `~/.pardner` and returns CLIENT_NOT_RUNNING (expected here; not walked further). `client show` without `--project` → INVALID_ARGUMENT "Supply --project".
- Screenshots: none (CLI story); mobile check not applicable.

## Flagged claim verdicts
None of the flagged claims names STORY-057.

## Flow Log
- Ideal 1 — actual 2 (`client list` to find the UUID, then `client show`), plus a manual ID join to read one person's state.

Status: pass
