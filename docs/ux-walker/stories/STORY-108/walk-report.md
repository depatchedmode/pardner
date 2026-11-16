# STORY-108 walk report: Agent reads the plan layer and records a verdict through the CLI only

Walked 2026-11-09. Ada is the agent Actor from `client agent-grant` on Dev's client and is displayed as "Setup agent". She used only `pardner … --token-file ada.json`. Maya watched Goals on the hub (Chromium 1440×900).

Precondition: Ada created "Downsize staging RDS to db.t4g.large" in the vein "Right-size staging DB" and completed it, which made that vein ready.

Evidence: `<evidence-archive>/walker-2026-11-09/STORY-108/`. The JSON for every CLI call is in `cli-transcript.txt` (it contains no token).

## Steps
0. `screenshots/step-0.png`: Maya's Goals view shows "Right-size staging DB", Open, "1 task", **Ready for a verdict**. Geometry: clean (the only hit is the nav tab widths, which follow their labels on purpose).
1. `veins --status open` returns a JSON list. Filtering `readyForVerdict:true` gives exactly one vein, Right-size staging DB.
2. `vein show vein-<id>` returns `{vein, revisions, conflicts, goal, tasks, history, workspaceId, heads, status}`. `revisions.status` is `["op-…"]`.
3. `vein update … --status proven` without `--revisions` → `INVALID_ARGUMENT` "Supply --revisions".
4. Retry with `--revisions '{"status":["op-…"]}'` succeeds. `screenshots/step-4.png`: Maya's select changed to Proven live within 1.5 s and the label is gone.
5. `activity --actor ada --limit 5` → `UNKNOWN_ACTOR` "Unknown Actor: ada". The display name, `--actor "Setup agent"`, also gives `UNKNOWN_ACTOR`. Only the full `actor-<64 hex>` ID worked, returning 5 raw events (`vein.update`, `task.update`, …). An agent cannot easily filter to "my own" events (F-108-02).

### Edge cases
- Array form on `update`: `--revisions '["op-…"]'` → `REVISION_REQUIRED` "Supply the observed field revisions", with `details.current` listing the revision. The revision was correct, but the shape was wrong, and the message does not say so.
- Object form on `resolve`: `--revisions '{"status":[…]}'` gives the same `REVISION_REQUIRED` message. So both commands reject the other's shape with an identical, shape-blind message (F-108-01).
- `--status done` → "Vein status must be one of: open, proven, dead-end, abandoned". This is good.
- `vein close` → "Use vein create, show, update, resolve, add, or remove". This is good.
- `goals --status achieved` → `[]` (the filter works). There is no equivalent filter in the UI.
- Mobile: `screenshots/mobile-check.png` is clean.

## Flagged claim verdicts
- **#45 CLI `update` expects per-field revision objects and `resolve` expects arrays: CONFIRMED.** `update` with an array and `resolve` with an object both return `REVISION_REQUIRED` "Supply the observed field revisions", although the revision values were current. See `cli-transcript.txt` sections "update array revs" and "resolve with object revs (no conflict)".

## Flow Log
- The ideal path is 3 calls (list, show, update); the actual path was 4, because the first update attempt omitted `--revisions`. The mismatch in revision shape costs one more call for any agent that has used `resolve`.
- The verdict reached the human UI live.
- `--actor` filtering needs the full actor ID. The handle "ada" and the display name both fail.
- Console and page errors: none.

Status: pass
