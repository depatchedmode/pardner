# STORY-131 walk report: Attach a Codex bridge to a client project

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-131/` (redacted CLI transcript `cli.log`). Setup: the STORY-123 client and Codex credential, with `bridge.json` hand-written as in step 2 (one mapping for the Codex Actor, `endpoint:"ws://127.0.0.1:9001"`, `threadId:"thr_7c1"`, an absolute worktree, pinned `expectedPolicy`, `enabled:true`, `allowedTaskIds:["task-673c…"]`, `allowedFromActorIds:[Priya]`).

**No Codex App Server was used, so live dispatch is BLOCKED.** A real `codex` CLI is installed and supports `app-server --listen ws://…`, but running it would start real model turns on the user's Codex account inside a worktree. That is outside a walk. The repo's scripted stand-in (`support/t3-fake-codex.mjs`) speaks stdio and lacks `thread/read`, which the bridge adapter needs. `test/bridge-integration.test.js` injects an in-process harness through `adapterFactory`, which the `pardner bridge run` CLI cannot use. So no fake can be driven through the real CLI honestly. I walked everything up to the App Server boundary with nothing listening on 9001.

## Steps
1. **`bridge inspect --endpoint ws://127.0.0.1:9001 --session thr_7c1`** (no `--worktree`) → `INVALID_ARGUMENT: Supply --session and --worktree for a dedicated Codex session`. Matches. With `--worktree` → `ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:9001`, a raw socket code with no hint to start the App Server (F-131-03). The `expectedPolicy` output is **BLOCKED**.
2. **Config written** by hand (policy values taken from the bridge's own fixture shape, because inspect could not run).
3. **`bridge run --config … --token-file codex.json`** (background) → `{success:true, bridging:true, workspaceId, replicaId:"client", actors:["actor-513c…"], sourceError:null}`, and it keeps running. Matches.
4. **`bridge status`** → `states:[{actor:"idle"},{bridge:"running"},{delivery:…:"connected"},{source:"connected"}]`, `deliveries:[]`. Matches.
5. **Priya mentions Codex** on the allowed task ("@agent-…-openai-codex rerun the flaky backoff test"). Within 4 s `bridge status` shows the delivery `state:"queued"` and the Actor state **`"ECONNREFUSED"`**. `mentions pending` for the agent is now `[]`: the bridge took the delivery off the hub queue even though it cannot reach Codex. In the browser (`screenshots/step-5-panel.png`, `screenshots/step-5-panel-scrolled.png`) Priya's comment shows **no "Notified" chip** and nothing says the agent did not get it (F-131-01). Geometry clean.
6–8. **Dispatch to the Codex thread, `accepted` row with `turnId`, Codex replying with a comment — BLOCKED** (no App Server).
9. **Mention on a task not in `allowedTaskIds`** ("Reconcile invoice totals nightly") → the row is `queued` with `reason:"blocked: task or sender is not authorized by this mapping"`. Matches the story's reason text. I could not see the "blocked: queued work requires authorization" Actor state, because the Actor state stayed `ECONNREFUSED`.
10. **Ctrl-C (SIGINT)** → the process exits silently with no stop receipt on stdout. `bridge status` then shows `{bridge:"stopped"}`. Re-running after editing `allowedTaskIds` and seeing the row dispatch is **BLOCKED** (no App Server).

### Variations and edge cases
- **Second `bridge run` on the same inbox** while one runs → `STORAGE_IN_USE: Another Pardner service is using this storage directory`. Correct code, but the text says "service" where the person ran a second bridge (F-131-04).
- **Crash** (`kill -9` on a running bridge) → `bridge status` still reports `{scope:"bridge", state:"running"}` and `{source:"connected"}` (F-131-02).
- `enabled:false`, approval/active-thread states, the edited-comment block, `PERMISSION_POLICY_CHANGED` and `WORKTREE_MISMATCH` → **BLOCKED** (each needs a live Codex thread).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the task panel reflows. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#29 `bridge status` keeps showing `running` after a crash — CONFIRMED.** After `kill -9`, status reported `bridge: running` and `source: connected` with no process alive. After a clean SIGINT it correctly reports `stopped`.

## Flow Log
- Ideal 5. Up to the App Server boundary: inspect (2 tries), hand-write the config, run, status. The config had to be typed by hand from documentation. Inspect output cannot be turned into a mapping automatically.
- Hesitation: when Codex is unreachable the Actor state is a bare `ECONNREFUSED`, and the person's board shows the mention as if all were well.
- Duplicated information: the mention appears in the browser comment, in `mentions pending` (until the bridge takes it), and in `bridge status` deliveries. Only the last tells the truth about whether it was delivered.

Status: blocked
