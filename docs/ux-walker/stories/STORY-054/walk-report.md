# STORY-054: Agent shows Offline after onboarding, until its harness reports presence

Setup: Harbor Billing hub; Maya plays Kenji. Otter is Maya's Codex agent, named by starting the hub with `client serve --harness openai-codex --name Otter --model gpt-5-codex` (see F-054-03 for why). Otter works on "Add dunning retry schedule" (stands in for "Add offline sync to note editor"). Maya watches in Chromium 1440×900 (video in `videos/`). Agent HTTP calls are made by `s054.mjs` with the token from the CLI-written credential file (not reproduced here).

## Steps
1. **Board** (`screenshots/step-1.png`): "Otter, agent, offline", grey O with bot glyph. Geometry clean apart from the multi-line task-card false positive.
2. **Otter's profile** (`screenshots/step-2.png`): "Agent · Maya Okafor's agent · Offline", Harness Codex, "Live sessions 0" plus the note. Pass.
3. **Otter edits via CLI**: `pardner --token-file otter.json update TASK --status in-progress --revisions …` succeeded (actorId = Otter; first try with `in_progress` was rejected with a clear list of statuses). `comment` also succeeded. Otter stayed "offline". Matches the story (board writes do not create presence).
4. No CLI presence command exists (`client --help`, `--help`) (F-054-02).
5. **`client agent-grant --project ID --harness openai-codex --output-file otter.json`** → `{success, actorId, projectId, credentialFile}`; the file holds token, actorId, projectId, harnessId, model and `apiBase` ending in `/api`. With the project name instead of the ID: NOT_FOUND (F-054-04).
6. **Harness starts a session.** `POST {apiBase}/sessions` → 403 FORBIDDEN "Unsupported workspace endpoint" (F-054-01). Stripping `/api` → 200 `{sessionId, ttlMs:45000}`.
7. (`screenshots/step-7.png`) After 4 s Maya sees "Otter, agent, idle". Pass.
8. **Report `{seq:1, active:true, focusTaskIds:[task]}`** (`screenshots/step-8.png`, `screenshots/step-8-card-zoom.png`): Active within 5 s; card shows "Otter, agent, active, on this task". Marker initial is low-contrast (F-054-05). Geometry clean (false positive).
9. **Profile** (`screenshots/step-9.png`): "Live sessions 1", "Active · Codex", Device maya-studio, Model gpt-5-codex, Managed by T3, Focus link "Add dunning retry schedule", "Expires in 41 s without a report". Pass.
10. **Heartbeats with `active:false`** (`screenshots/step-10.png`): Otter turned Idle within 4 s (next poll), still focused ("Otter, agent, idle, on this task"). The story expected Idle only after the 90 s lease; the observed behaviour is immediate and arguably better. Catalog step is inaccurate.
11. **All reports stop** (`screenshots/step-11.png`): Offline after 45 s exactly, card marker removed. A later report → 410 SESSION_EXPIRED "The presence session has ended; start a fresh session". Pass.
12. **New session, then `/end`** (`screenshots/step-12.png`): 200 `{ended:true}`; Offline at the next poll (5 s). Pass.
- Variations: `kind:"browser"` → 403 ACTOR_MISMATCH "Presence kind must match the authenticated Actor"; `harnessId:"cursor"` → 403 ACTOR_MISMATCH "Harness must match admitted Actor". Credential for another project not tried.
- Edge cases: identical seq replay → 200 prior receipt; different body same seq → 409 STALE_PRESENCE_REPORT; unknown task → 400 "Focus must name tasks in this project"; 33 IDs → 400 "Supply at most 32 focused task IDs". All match the story. PRESENCE_LIMIT not tried.
- Mobile check: profile at 390 width covered in STORY-048 (`mobile-profile.png`); not repeated.
- Console/page errors: none.

## Flagged claim verdicts
- #47 "Agents have no built-in presence reporter, and the grant's `apiBase` must have `/api` stripped for the sessions routes" — **CONFIRMED** on both counts; the unstripped call fails with a misleading 403 FORBIDDEN.

## Flow Log
- Ideal 3 (grant, agent starts session, agent reports) — actual 3 for an agent author who already knows the routes; a harness following the credential file hits the 403 trap and has no CLI fallback.
- Hesitation: Otter is the author of fresh edits but shows Offline.
- Re-entry: project ID must be copied from `client list`/JSON; the name is refused.

Status: fail
