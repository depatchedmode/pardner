# UX Path Catalog: Pardner

Generated: 2026-11-09 (branch client-only-entry; client mode is the only human entry; no phone/LAN companion)
Total Stories: 146
Coverage: 96 / 101 capabilities (95.0%) — unit: the user-facing capabilities listed under the 14 Feature Map areas of `docs/ux-paths/discovery.md` (see Coverage Matrix). By feature area: 14 / 14 (100%).

Sources: `docs/ux-paths/discovery.md` and 12 topic files that are kept outside the repository (159 source stories, 13 merged away). Every story keeps its origin as *(was {topic-slug}/STORY-NNN)*; cross-references inside story text have been rewritten to the global IDs below, and a reference to a merged-away story points at the story it was merged into. Facts in the stories are code reads by the story agents, not observed behavior; the walker should treat them as expectations to verify.

**Catalog structure for /ux-walker.** Each topic is a `###` heading under `## All Stories`. Each story is a `#### STORY-NNN: Title` heading, and its **Steps**, **Variations** and **Edge Cases** are `#####` headings, one level below. /ux-walker's Phase 1 planner (an Explore agent, `~/.claude/skills/ux-walker/SKILL.md`) reads the catalog as text and keys stories by `STORY-NNN` ID; it does not depend on a fixed heading level. `####` stories under `###` topics follow the /ux-paths final-catalog template and the previous catalog's layout. Lines marked *(merged)* came from a merged-away story; **See also** lines list overlapping stories in other topics.

## Summary

| Type | Count |
|------|-------|
| Short | 52 |
| Medium | 72 |
| Long | 22 |
| **Total** | **146** |

| # | Topic | Stories (after dedup) | Short | Medium | Long | Source stories | Global IDs |
|---|-------|------|------|------|------|------|------|
| 1 | First launch and sign-in | 12 | 4 | 7 | 1 | 12 | STORY-001–STORY-012 |
| 2 | Identity confirmation and device linking | 11 | 5 | 4 | 2 | 12 | STORY-013–STORY-023 |
| 3 | Start, join and switch projects | 12 | 4 | 7 | 1 | 12 | STORY-024–STORY-035 |
| 4 | Invitations lifecycle | 12 | 4 | 6 | 2 | 14 | STORY-036–STORY-047 |
| 5 | People, presence, profiles and focus | 10 | 4 | 4 | 2 | 13 | STORY-048–STORY-057 |
| 6 | Task board and creation | 14 | 5 | 6 | 3 | 14 | STORY-058–STORY-071 |
| 7 | Task detail, editing, drafts and conflicts | 13 | 5 | 7 | 1 | 14 | STORY-072–STORY-084 |
| 8 | Comments, mentions, read receipts and handoff | 12 | 3 | 7 | 2 | 14 | STORY-085–STORY-096 |
| 9 | Goals, veins and Activity | 13 | 4 | 8 | 1 | 13 | STORY-097–STORY-109 |
| 10 | Control tab (T3 and Cursor Cloud) | 13 | 7 | 4 | 2 | 14 | STORY-110–STORY-122 |
| 11 | Agent credentials, CLI and bridge attach | 14 | 4 | 7 | 3 | 14 | STORY-123–STORY-136 |
| 12 | Resilience, recovery and boundaries | 10 | 3 | 5 | 2 | 13 | STORY-137–STORY-146 |
| | **Total** | **146** | **52** | **72** | **22** | **159** | |

**Merged stories (13)** — the source story was folded into the kept story; its old ID now resolves to the kept ID.

| Kept story | Merged-away source | Source title |
|------|------|------|
| STORY-005: Signed out in the middle of a session (server-side revoke) | resilience-recovery/STORY-005 | A revoked browser session lands on the signed-out screen |
| STORY-015: Link a second laptop with a My device invitation from the browser | invitations/STORY-007 | Link a second computer with a My device invitation |
| STORY-020: Reviewing your own profile ("You") after linking | presence-profiles/STORY-002 | Open your own "You" profile to check how others see you |
| STORY-021: Lost laptop: revoking a linked device and re-linking a replacement | resilience-recovery/STORY-008 | Replacing a lost laptop by revoking its device |
| STORY-031: "This project didn't open." recovery | resilience-recovery/STORY-010 | A project that won't open, from the switcher |
| STORY-123: Mint the setup agent's credential for a fresh project | comments-mentions-handoff/STORY-009 | Set up an agent credential and list pending mentions |
| STORY-124: Grant refused for a second harness, then enroll it through an Agent invitation | invitations/STORY-006 | Connect a second agent harness with an Agent invitation |
| STORY-125: Set up an agent-only build box from an Agent invitation | identity-device-linking/STORY-008 | Agent-only adoption through an Agent invitation (CLI), and the browser losing human access |
| STORY-130: Revoke an agent and observe what its tools see | presence-profiles/STORY-010 | Revoking an agent removes its presence immediately |
| STORY-136: Agent claims a mention, can't finish, and releases it | comments-mentions-handoff/STORY-011 | Agent releases a mention it cannot handle |
| STORY-137: Wi-Fi drops mid-save and the saved request is replayed | task-detail-conflicts/STORY-013 | Save fails while the local service is down; retry the saved request |
| STORY-139: Working on a replica while the hub is unreachable | presence-profiles/STORY-009 | Joined replica during a hub outage — "Remote presence unavailable" |
| STORY-144: Control runtime start, status, open and stop | control-tab/STORY-013 | Open the board from the control runtime to reach Control |

## Coverage Matrix

Unit: one row per Feature Map area of `docs/ux-paths/discovery.md`; the "Capabilities" column counts the user-facing capabilities in that area and how many at least one story exercises in its Steps or Variations. A capability that appears only in a precondition or an alternate path is counted as a gap.

| # | Feature Area | Capabilities covered | Stories | Gaps |
|---|-------------|---------------------|---------|------|
| 1 | Launch, sign-in and service lifecycle | 10 / 10 — `pardner`/`open` launch and grant exchange; `--output-file`; `client serve` in the foreground; `client status`/`list`; `client stop`; start errors (`PORT_IN_USE`, `CLIENT_START_TIMEOUT`/`FAILED`, `STORAGE_IN_USE`, `INCOMPATIBLE_SCHEMA`, `LAUNCH_UNAVAILABLE`); startup shell, StartupBoundary and config-failure screens; signed-out screen and **Check again**; Host/Origin enforcement; serve-flag passthrough | STORY-001, STORY-002, STORY-003, STORY-004, STORY-005, STORY-006, STORY-007, STORY-008, STORY-009, STORY-010, STORY-012, STORY-142, STORY-143, STORY-146 | `--worktree` appears only as an aside (STORY-022 edge case). `CLIENT_STOP_TIMEOUT` is only a variation. No story verifies the missing-`ui-prototype/dist` response (STORY-001 marks it unverified). |
| 2 | Identity and device linking | 4 / 4 — **Welcome to Pardner** confirmation; **Link this device** page and wrong-kind refusals; `client identity`; `IDENTITY_EXISTS` / `OPERATION_ID_REUSED` | STORY-013, STORY-014, STORY-015, STORY-016, STORY-017, STORY-018, STORY-019, STORY-022, STORY-023, STORY-125 | No identity edit or rename path exists, so none can be walked (STORY-014). |
| 3 | Start, join and switch projects | 7 / 7 — **Start project** and resume; **Join project** and JOIN_HINTS; `client create`/`join`; switcher with sync labels and "unconfirmed change"; "This project didn't open."; `client show`; last-project memory | STORY-024, STORY-025, STORY-026, STORY-027, STORY-028, STORY-029, STORY-030, STORY-031, STORY-032, STORY-033, STORY-034, STORY-035 | `WORKSPACE_MISMATCH` and `REGISTRATION_PENDING` are edge cases only (STORY-028, STORY-124). |
| 4 | Invitations (Human / Agent / My device) | 7 / 7 — Invite menu and dialog; **Copy invite** / **Show invite text**; states, expiry and history; **Revoke**; `client invite`; `client revoke --kind member\|device\|agent`; creator-only revocation and creator-sees-all | STORY-036, STORY-037, STORY-038, STORY-039, STORY-040, STORY-041, STORY-042, STORY-043, STORY-044, STORY-045, STORY-046, STORY-047, STORY-015, STORY-021, STORY-124, STORY-130, STORY-140 | No story walks the invite dialog by keyboard or screen reader. |
| 5 | People, presence, avatars, profiles, focus | 8 / 8 — AvatarStack and **+N** People dialog; **You** profile; Active/Idle/Offline transitions; "Here now" on cards and the panel; profile Focus links; "Remote presence unavailable"; agent presence sessions over HTTP; server limits | STORY-020, STORY-048, STORY-049, STORY-050, STORY-051, STORY-052, STORY-053, STORY-054, STORY-055, STORY-056, STORY-057, STORY-139 | `PRESENCE_LIMIT` (1024 sessions) is reachable only as a code-read edge case (STORY-054). |
| 6 | Task board (Tasks view) | 6 / 6 — seven columns and cards; Assigned to / Status filter / Vein filters persisted per project; **New task** panel (validation, **Discard draft**, Escape); open-after-create; SaveStatus; CLI `tasks` / `task create` | STORY-058, STORY-059, STORY-060, STORY-061, STORY-062, STORY-063, STORY-064, STORY-065, STORY-066, STORY-067, STORY-068, STORY-069, STORY-070, STORY-071, STORY-137, STORY-138 | — |
| 7 | Task detail, edit, drafts, conflicts | 10 / 11 — edit drafts that survive reload and switches; newer-save notice and **Base my draft on the latest version**; quick **Status**; **Resolve {field}** / **Keep this {field}**; integrity conflicts; GitHub issue link/unlink; Evidence; History; `show`/`diff`/`update`/`resolve` CLI; `trace` | STORY-072, STORY-073, STORY-074, STORY-075, STORY-076, STORY-077, STORY-078, STORY-079, STORY-080, STORY-081, STORY-082, STORY-083, STORY-084, STORY-126 | **Uncovered:** CLI `branch`, `branches`, `merge` (and the `task.branch` / `task.merge` operations). `trace list` / `trace show` appear only as alternate paths (STORY-081). |
| 8 | Comments, mentions, read receipts, handoff | 8 / 8 — **Add comment**; @mention hint and "Notified" chips; **New** tags and **Mark all read**; **Keep this comment**; `comment-edit` / `comment-delete`; **Hand off work** and its stale notice; `mentions pending/claim-next/ack/release`; CLI `handoff` | STORY-085, STORY-086, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091, STORY-092, STORY-093, STORY-094, STORY-095, STORY-096, STORY-123, STORY-136 | No browser surface shows delivery state, so claim/ack/release can be verified only from the CLI. |
| 9 | Goals and veins | 5 / 5 — goal and vein status selects; disputed pills and **Keep …** disclosures; **Ready for a verdict**; vein title → filtered board; CLI create/update/resolve/add/remove | STORY-064, STORY-097, STORY-098, STORY-099, STORY-100, STORY-101, STORY-102, STORY-103, STORY-107, STORY-108, STORY-109 | Goal and vein creation and text edits are CLI-only by design, so there is no UI path to walk. |
| 10 | Activity feed | 4 / 4 — **Performed by** / **Show** filters; day grouping and subject navigation; **Show older activity**; CLI `activity` | STORY-104, STORY-105, STORY-106, STORY-108, STORY-126 | — |
| 11 | Control tab (T3 and Cursor Cloud) | 11 / 11 — **Pair T3**; **Save project** / **Map thread**; **Queue follow-up**, approval in T3, output capture; holds and **Release held work**; withdraw/cancel; unknown-outcome reconcile; verdicts and artifacts; Cursor Cloud contexts; freshness and stale states; agent `FORBIDDEN` / `ACTOR_MISMATCH`; credential expiry | STORY-110, STORY-111, STORY-112, STORY-113, STORY-114, STORY-115, STORY-116, STORY-117, STORY-118, STORY-119, STORY-120, STORY-121, STORY-122, STORY-144 | API-only routes have no UI: `/sessions/authorize`, `/cloud/contexts/authorize`, `/cloud/executions/acceptance`. Live Cursor Cloud dispatch needs a configured transport (STORY-121). |
| 12 | Agent CLI, agent grants and the bridge | 9 / 10 — `client agent-grant`; `--token-file` commands; `client operation`; `client export`; board-allowlist refusals; `bridge inspect`; `bridge run`/`status`; bridge config refusals; `bridge reconcile` | STORY-123, STORY-124, STORY-125, STORY-126, STORY-127, STORY-128, STORY-129, STORY-130, STORY-131, STORY-132, STORY-133, STORY-136, STORY-141 | **Uncovered:** `bridge approve-cleanup` and `bridge revoke-cleanup`. |
| 13 | Control runtime | 3 / 6 — `start`/`status`/`stop`; `open` (including `-- --output-file`); `cli --agent` and `entrypoints` wrappers | STORY-134, STORY-144 | **Uncovered:** `restart` (named only as an alternate path in STORY-144), `seal` (only a precondition in STORY-134), `run`. First-run provisioning from `config.identity` / `config.projectName` appears only as steps inside STORY-144. |
| 14 | Standalone service | 4 / 4 — `pardner serve` and its notice page; `OPERATION_REQUIRED`; `actors register`; `--role replica --hub` (variation only) | STORY-011, STORY-135, STORY-145 | The replica role is only a variation; first-Actor bootstrap is unclear in the code (STORY-135). |
| | **Total** | **96 / 101 (95.0%)** | | 5 uncovered capabilities: branch/branches/merge, bridge cleanup approve/revoke, control-runtime `restart`, `seal`, `run`. |

## Story Dependency Graph

Read "A → B" or a child line as "run A before B" (B needs the state A creates). Stories on one line joined by "·" are independent siblings. Revocation and restore stories change or destroy state, so run them last within their branch (see run-order notes below the tree).

```text
STORY-001 First-ever launch: pardner → grant → cookie
├── STORY-002 Reopen when the service is running → STORY-032 Last-project memory
├── STORY-003 Headless --output-file → STORY-004 Reused or expired link, Check again
├── STORY-006 Startup shell stuck · STORY-007 PORT_IN_USE · STORY-008 Slow or failing start · STORY-146 Blocked-storage crash screen
├── STORY-009 client status / client stop → STORY-143 Service stopped while the board is open
├── STORY-145 Phone on the same Wi-Fi (needs only a running client)
├── STORY-012 Long first day (also exercises STORY-013, STORY-024)
└── STORY-013 Confirm identity, Git-prefilled   [alternatives: STORY-014 no Git · STORY-022 agent runs client identity]
    ├── STORY-019 Two tabs racing the identity step
    ├── STORY-016 Wrong invitation kind on the Link page (needs an invitation from STORY-036)
    └── STORY-024 Start the first project   [alternatives: STORY-025 resumed start · STORY-033 agent-led create/join · STORY-035 two-tab race]
        ├── STORY-036 Invite a teammate (Human)
        │   ├── STORY-037 Copy while screen-sharing · STORY-038 Copy blocked · STORY-040 Read states · STORY-046 Invite by CLI · STORY-047 Wrong invite type
        │   ├── STORY-039 Revoke a mistaken invitation
        │   ├── STORY-026 Join a teammate's project   [also STORY-027 join errors · STORY-028 hub offline during join · STORY-041 loopback trap]
        │   │   ├── STORY-029 Switch projects (≥2 projects) → STORY-030 Unconfirmed change in the switcher
        │   │   ├── STORY-042 Non-creator invites from a replica
        │   │   ├── STORY-139 Replica during a hub outage
        │   │   ├── STORY-048 Header presence and profiles
        │   │   │   └── STORY-049 · STORY-050 · STORY-051 · STORY-052 · STORY-053 · STORY-055 · STORY-056 · STORY-057
        │   │   └── STORY-043 Creator removes a member → STORY-044 Non-creator refused
        │   │       └── STORY-140 Member sees REVOKED → STORY-141 Export after revocation
        │   ├── STORY-034 Two-person team onboarding (long)
        │   └── STORY-023 New teammate across two computers (long; also uses STORY-015)
        ├── STORY-015 Link a second computer with My device (needs a second, fresh client)
        │   ├── STORY-018 Duplicate identity, then link
        │   ├── STORY-017 Link a second project → STORY-020 Own profile lists both devices
        │   └── STORY-021 Lost laptop: revoke device, relink → STORY-045 Retire an old laptop and an agent
        ├── STORY-031 "This project didn't open." (needs a failing runtime)
        ├── STORY-058 First task on the empty board
        │   ├── STORY-059 · STORY-060 · STORY-061 · STORY-062 · STORY-066 · STORY-067 · STORY-068 · STORY-069
        │   ├── STORY-063 Filters and persistence → STORY-065 Create hidden by filters · STORY-071 Board changes under filters
        │   ├── STORY-072 Quick Status → STORY-073 Edit draft survives reload → STORY-074 Draft survives project switch (needs STORY-029)
        │   │   └── STORY-075 Newer save, untouched field → STORY-076 STALE_UPDATE and rebase
        │   │       └── STORY-077 Resolve a status conflict · STORY-078 Raw-value conflicts · STORY-083 Integrity conflict · STORY-084 Collaborative day (long)
        │   ├── STORY-079 Link a GitHub issue → STORY-080 Unlink
        │   ├── STORY-082 Reconstruct History
        │   ├── STORY-085 Progress comment → STORY-086 @mention hint · STORY-087 Mark all read · STORY-096 Mixed handles
        │   │   └── STORY-088 Keep this comment (author) → STORY-089 Non-author stuck behind a saved request · STORY-090 CLI edit/delete
        │   ├── STORY-091 Hand off work → STORY-092 Task changed while writing a handoff
        │   └── STORY-137 Wi-Fi drop and replay → STORY-138 Second change while one is pending
        ├── STORY-097 Seed a goal and vein from the CLI
        │   ├── STORY-098 Mark a vein Proven · STORY-099 Ready for a verdict · STORY-102 Goal title conflict
        │   ├── STORY-103 Add tasks to a vein → STORY-064 Vein → filtered board → create · STORY-109 Vein filter persistence
        │   ├── STORY-100 Disputed vein status → STORY-101 Vein in two goals
        │   └── STORY-107 Experiment cycle, goal achieved (long)
        ├── STORY-104 Activity by day → STORY-105 Activity filters · STORY-106 Show older activity
        ├── STORY-110 Control: first visit → STORY-111 Pair T3 → STORY-112 Full first run
        │   ├── STORY-113 Withdraw · STORY-114 Cancel and release hold · STORY-115 Foreign run · STORY-116 Unknown outcome
        │   ├── STORY-117 Unqualified T3 version · STORY-118 Verdicts and artifacts · STORY-120 Stale reads
        │   ├── STORY-119 Credential expiring (re-pairs; run after STORY-116)
        │   └── STORY-121 Cursor Cloud context (needs a saved control project from STORY-112)
        └── STORY-123 Mint the setup agent's grant
            ├── STORY-124 Second harness via Agent invitation → STORY-125 Agent-only build box → STORY-010 Agent-only device refuses a browser
            ├── STORY-126 Agent works a task end to end (also exercises STORY-081 commit evidence)
            │   └── STORY-070 Agent creates a task · STORY-054 Agent presence sessions
            ├── STORY-127 --token-file mistakes · STORY-128 client operation · STORY-129 Allowlist refusals · STORY-122 Agent refused Control
            ├── STORY-093 Claim, reply, ack → STORY-136 Claim and release · STORY-094 Agent handoff by CLI → STORY-095 Full loop (long)
            ├── STORY-108 Agent verdict from the CLI (needs STORY-097)
            ├── STORY-131 Bridge attach → STORY-132 Config refusals · STORY-133 Reconcile an uncertain dispatch
            └── STORY-130 Revoke an agent (destroys the credential: run last)

STORY-005 Signed out mid-session (needs a revoked browser session; after STORY-013)
STORY-142 Cold backup and restore (needs a populated client; run after the project stories)

STORY-144 Control runtime start/status/open/stop (separate launchd installation)
└── STORY-134 Control-runtime agent wrappers (agents enrolled as in STORY-124)

STORY-011 Standalone serve page → STORY-135 Standalone serve for an integration (independent of the client)
```

Run-order notes:
- Destructive or state-changing stories: STORY-005, STORY-021, STORY-039, STORY-043, STORY-045, STORY-130, STORY-140 (revocations), STORY-119 (re-pairing T3 makes earlier uncertain runs unretryable), STORY-142 (stop, copy and restore). Run each after the stories that need the state it removes, or on a separate client directory.
- Multi-machine stories need a second client with an HTTPS `--public-url` hub route: STORY-015, STORY-017, STORY-018, STORY-021, STORY-023, STORY-026, STORY-027, STORY-028, STORY-034, STORY-041, STORY-042, STORY-043, STORY-044, STORY-125, STORY-139, STORY-140. Several also need a hub that can be taken offline (STORY-028, STORY-042, STORY-139).
- Concurrency stories need two writers (a second browser, a replica or an agent CLI): STORY-075, STORY-076, STORY-077, STORY-078, STORY-083, STORY-084, STORY-088, STORY-092, STORY-100, STORY-101, STORY-102.
- Control stories need a local T3 Code (0.1.5/0.1.6) with an approval-required top-level thread (STORY-111 onward); STORY-121's live path needs a configured Cursor Cloud transport.

### Cross-Topic Overlaps

| Overlap cluster | Stories | What they share |
|-----------------|---------|-----------------|
| Signing a browser in | STORY-001, STORY-002, STORY-003, STORY-004, STORY-012, STORY-143, STORY-144 | One-time grant → cookie; `--output-file` is the only way to sign in a second browser. |
| Agent-only device | STORY-010, STORY-005, STORY-125 | `humanAuthority=false` revokes human sessions; the signed-out screen's advice cannot work there. |
| My device linking | STORY-015, STORY-016, STORY-017, STORY-018, STORY-021, STORY-023, STORY-038, STORY-047 | One `POST /join` behind two forms with different labels and validation. |
| Duplicate identity | STORY-014, STORY-018, STORY-047, STORY-023 | No identity edit; recovery is a fresh client directory. |
| Joining with a Human invitation | STORY-026, STORY-027, STORY-028, STORY-034, STORY-041 | JOIN_HINTS, loopback trap, resumable pending join. |
| Revocation (member, device, agent) | STORY-021, STORY-043, STORY-044, STORY-045, STORY-130, STORY-140, STORY-141 | CLI-only, ID lookup through `client show`, permanent. |
| Hub outage on a replica | STORY-028, STORY-034, STORY-042, STORY-139 | "Saved locally · waiting for hub", `HUB_UNAVAILABLE`, "Remote presence unavailable". |
| Saved/pending request | STORY-025, STORY-030, STORY-067, STORY-089, STORY-137, STORY-138, STORY-140 | One pending op per tab; only six definitive codes clear it. |
| Agent credential lifecycle | STORY-123, STORY-124, STORY-125, STORY-126, STORY-127, STORY-130, STORY-134 | `agent-grant` reuse, enrolment through Agent invitations, revocation. |
| Mention delivery | STORY-086, STORY-093, STORY-095, STORY-096, STORY-126, STORY-131, STORY-136 | Opaque handles, claim/ack/release, bridge auto-dispatch. |
| Handoff | STORY-072, STORY-091, STORY-092, STORY-094, STORY-095, STORY-126 | Status + assignee + comment + mention in one write. |
| Commit evidence | STORY-081, STORY-084, STORY-118, STORY-126 | Task Evidence vs Control artifacts. |
| Vein-filtered board | STORY-064, STORY-099, STORY-104, STORY-109 | Three entry points; two reset the other filters. |
| Control runtime | STORY-134, STORY-144, STORY-110 | launchd installation, `control open`, guarded agent wrappers. |
| Standalone service | STORY-011, STORY-135, STORY-145 | Notice page, separate data, `actors register`. |

## All Stories

### First launch and sign-in


Code read for this topic: lib/cli.js:8-17, 153-155; lib/client-cli.js (all); lib/client-auth.js; lib/client-service.js:245-310, 400-436; lib/client-registry.js:17-30; lib/storage-lease.js:17; lib/atomic-file.js; lib/local-service.js; automerge-sync-server.js:504-520; ui-prototype/index.html; src/main.jsx; src/Pardner.jsx:178-200; src/connection.js:10-35; src/client-api.js:1-90; src/ClientApp.jsx:49-110; scripts/control-runtime.py:356-360; docs/PARDNER-CLIENT.md:10-50.

Facts the stories rely on:
- **Same command, three spellings.** A bare `pardner`, `pardner open` and `pardner client open` all reach `runClientCommand('open')` (lib/cli.js:153-155). All three call `ensureRunning`, so all three start the service if needed. `control open` also reaches it, but it requires the control service first (control-runtime.py:356-360).
- **The probe has four results** (client-cli.js:28-40):
  - `absent`: there is no `client-connection.json`.
  - `unreachable`: the fetch fails, or the service answers 503 while it stops.
  - `running`: the service answers 200.
  - `foreign`: the port answers with any other status.
- **The grant is one-use.** It is valid for 60 s, bound to the origin, and stored only as a hash (client-auth.js:10-28). Exchanging it sets the cookie `pardner_<clientId>` (HttpOnly; SameSite=Strict; Max-Age=31536000) (client-service.js:264).
- **Check again calls `open(null)`.** It only re-reads `/session` and never gets a new grant (ClientApp.jsx:85). A fresh grant arrives only through a new tab or a `hashchange` on the same tab (ClientApp.jsx:67-72).
- **A used link does no harm in a browser that is already signed in.** If the bootstrap fails but `/session` succeeds, the board opens with no notice (ClientApp.jsx:62-64).
- **The port is kept between runs.** The first run listens on port 0 (the OS picks one), and that port is then reused on every restart (client-registry.js:28; client-service.js:426-434).

#### STORY-001: First-ever launch on a Mac with a bare `pardner`
*(was first-launch-sign-in/STORY-001)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Priya Raman, a backend engineer at a 6-person startup. She has just cloned the Pardner checkout and built the UI (`npm ci`, `npm ci --prefix ui-prototype`, `npm run ui:build`) on her MacBook. She has never run Pardner before.
**Goal**: Get from the terminal to a signed-in Pardner page in her browser.
**Preconditions**: `~/.pardner/client` does not exist. Node 24.11.1 is installed. The UI build is in `ui-prototype/dist`. macOS, so the `open` launcher exists.
**Ideal path**: 1 — One command should start the service, open the browser and sign it in. The code already does all of this.
**Alternate paths**: `pardner open`, or `pardner client open`, which runs the same code path (lib/cli.js:153-155). Or run `pardner client serve` in the foreground in one terminal and `pardner open` in another. Or `control open` when the launchd control runtime is installed.
**See also**: STORY-012, STORY-013, STORY-144
##### Steps
1. Priya types `node bin/pardner.js` with no subcommand. She wonders whether she needs `open` first, but tries the bare command → `probe` finds no `client-connection.json` (`absent`). The CLI creates `~/.pardner/client` with private permissions, opens `client.log` (0600) and spawns a detached `client serve --data ~/.pardner/client` (client-cli.js:57-73).
2. She waits about a second → The CLI polls every 150 ms (deadline 15 s). The child binds `127.0.0.1` on an OS-chosen port and writes `client-connection.json` with `{url, token, pid}` (client-service.js:426-435). The probe returns `running`.
3. (automatic) → The CLI POSTs `/open` with the operator token. The service mints a grant valid for 60 s and returns `http://127.0.0.1:PORT/pardner/#grant=…` (client-service.js:301-305).
4. (automatic) → `open <url>` launches Safari. The terminal prints `{"success":true,"localUrl":"http://127.0.0.1:PORT/pardner/","launchIssued":true}`. The output has no grant.
5. Safari loads the page → The static shell shows the heading "Pardner", "Opening your workspace…", "If this page does not open, check that Pardner is running on your computer (start it with `pardner open`)." and a **Reload Pardner** button (index.html:11-16).
6. (automatic, before React renders) → `captureBootstrapGrant()` strips `#grant=…` from the address bar with `history.replaceState` (main.jsx:7; client-api.js:8-28). Priya sees only `/pardner/` in the address bar. The startup shell is removed when the app mounts.
7. (automatic) → `/pardner/config` returns `{mode:'client', clientApiBase}`. ClientApp shows "Opening your local client…" (ClientApp.jsx:84).
8. (automatic) → POST `/bootstrap` exchanges the grant and sets the HttpOnly cookie. `/session` returns `identity: null`.
9. The identity step appears, filled in from her Git config ("Filled in from your Git configuration."). Sign-in is done here, and Priya moves on to confirming her identity, which is a separate topic.
##### Variations
- She types `pardner open` instead: the same code path and result.
- She passes `--harness anthropic-claude-code --name Scout --managed-by T3`: the flags go to the spawned `client serve` only because the service was not already running (client-cli.js:16, 67-68).
- `--data ~/work/pardner-alt`: a separate client with its own registry, port and cookie name (`pardner_<clientId>`).
##### Edge Cases
- She runs the command from a directory that is not a Git repository: `suggestedIdentity` comes from `process.cwd()` (client-service.js:35). The helper text becomes "Git didn't provide a name and email here, so enter them once."
- The UI was never built (`ui-prototype/dist` is missing): the CLI still prints success and opens the browser, but the page has no SPA. This story is unverified for the missing-dist response.
- She presses Ctrl-C in the terminal right after the command returns: no effect, because the service is detached and `unref`'d. It keeps running until `pardner client stop`.

---

#### STORY-002: Running `pardner open` again when the service is already up
*(was first-launch-sign-in/STORY-002)*
**Type**: short
**Topic**: First launch and sign-in
**Persona**: Marcus Feld, a staff engineer who started Pardner this morning. He closed the browser tab at lunch and wants the board back.
**Goal**: Reopen the board without restarting anything.
**Preconditions**: The client is running. His browser already has the `pardner_<clientId>` cookie.
**Ideal path**: 1 — Re-run the launcher, or simply reopen the bookmarked `http://127.0.0.1:PORT/pardner/`.
**Alternate paths**: Open the bookmarked or history URL `http://127.0.0.1:PORT/pardner/` directly; the cookie is valid for 1 year (client-service.js:264). Or `pardner client open`, or `control open`.
**See also**: STORY-032
##### Steps
1. Marcus runs `pardner open` → The probe returns `running`, so no new process is spawned (client-cli.js:59).
2. (automatic) → A new grant is minted and the browser opens a new tab.
3. The tab loads → The grant exchange succeeds and creates a *second* browser session for the same browser. The board opens on the last project, read from localStorage `pardner:client:last-project` (ClientApp.jsx:53).
##### Variations
- He opens the URL from history instead: there is no grant, so `/session` authenticates with the existing cookie and the board opens directly.
- He passes `--http-port 9000` this time: the flag is silently ignored because the service is already running on its saved port. The output `localUrl` shows the old port. The CLI gives no warning.
##### Edge Cases
- Each launch adds a session entry to the registry. There is no logout UI, so old sessions build up and can only be revoked server-side (discovery: "There is no logout UI").
- He types `localhost:PORT` from memory instead of `127.0.0.1`: the host check rejects every request with 403 `{"code":"ORIGIN_REJECTED","error":"Open the configured client address"}` (client-service.js:254). This applies to the HTML too, so he sees raw JSON, not the SPA.

---

#### STORY-003: Headless Linux box with no browser launcher (`--output-file`)
*(was first-launch-sign-in/STORY-003)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Dana Okafor, a platform engineer. She runs Pardner on a Linux dev VM through a VS Code Remote session with port forwarding. The VM has no `xdg-open`.
**Goal**: Sign her laptop browser in to the client running on the VM.
**Preconditions**: Linux, `xdg-open` is not installed, and the client is not running yet.
**Ideal path**: 2 — Run the command with `--output-file`, then open the URL from the file.
**Alternate paths**: `pardner client open --output-file FILE`, or `control open -- --output-file FILE` (control-runtime.py:356-360).
**See also**: STORY-004, STORY-012
##### Steps
1. Dana runs `pardner open` → The service starts. `spawn('xdg-open')` emits `error`. The command fails with `{"success":false,"error":{"code":"LAUNCH_UNAVAILABLE","message":"Browser launcher unavailable; retry open with --output-file"}}`, and stderr shows `LAUNCH_UNAVAILABLE: Browser launcher unavailable; retry open with --output-file` (client-cli.js:144; bin/pardner.js:9-11).
2. She re-runs `pardner open --output-file ~/pardner-launch.txt` → The service is already running, so the command mints a fresh grant. `atomicWrite` stores the URL in a 0600 file (atomic-file.js:9). Output: `{"success":true,"localUrl":"http://127.0.0.1:41873/pardner/","launchIssued":true}`.
3. She runs `cat ~/pardner-launch.txt` and copies the URL → The URL `http://127.0.0.1:41873/pardner/#grant=…` is visible on her screen. This is the one place the grant is shown to the person.
4. She pastes it into her laptop browser within 60 s (VS Code forwards port 41873 to her laptop's 127.0.0.1:41873) → The grant is stripped, the exchange succeeds and the cookie is set. The identity step or the board appears.
5. She deletes `~/pardner-launch.txt` → Pardner never removes this file itself.
##### Variations
- Windows: the launcher is `null`, so the command fails immediately with `LAUNCH_UNAVAILABLE` "Use --output-file to store a private browser launch URL on this platform" (client-cli.js:141).
- `xdg-open` exists but exits non-zero: `LAUNCH_UNAVAILABLE` "Browser launch failed; retry client open" (client-cli.js:145). The message suggests `client open`, a different spelling from the one she typed.
- The forwarded port lands on a different local port (for example 41874): the Host header becomes `127.0.0.1:41874`, so every request is refused with `ORIGIN_REJECTED` "Open the configured client address".
##### Edge Cases
- Step 1 failed *after* minting a grant: that unused grant simply expires after 60 s. It is pruned the next time a grant is minted (client-auth.js:13).
- She takes longer than 60 s between steps 2 and 4: she gets the signed-out screen with the expired-link notice (see STORY-004).
- `--output-file` points into a directory that does not exist: `atomicWrite` creates parent directories (`mkdir recursive`).

---

#### STORY-004: Reused or expired sign-in link → signed-out screen and Check again
*(was first-launch-sign-in/STORY-004)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Tomás Rivera, a product designer. His teammate's agent (Codex, under T3) opened Pardner for him earlier. He found the launch URL in a chat scrollback and pasted it into Firefox, a second browser that has no cookie.
**Goal**: Get Firefox signed in.
**Preconditions**: The client is running. The `#grant=` URL was already exchanged in Chrome, or is more than 60 s old. Firefox has no `pardner_` cookie.
**Ideal path**: 2 — Run `pardner open` (or ask his agent to), and the new tab is signed in. If the signed-out screen offered a one-click re-launch, this would be 1, but nothing in the code supports that.
**Alternate paths**: Run `pardner open --output-file F` and paste the new URL into the *same* Firefox tab; the `hashchange` re-runs bootstrap (ClientApp.jsx:69). Or keep using Chrome, which is already signed in.
**See also**: STORY-003, STORY-012, STORY-019
##### Steps
1. Tomás pastes the old URL into Firefox → The grant is stripped. POST `/bootstrap` fails with `AUTH_REQUIRED` "Browser grant expired, used or wrong origin" (client-auth.js:24). `/session` fails with 401.
2. The signed-out screen renders (ClientApp.jsx:100-110). It shows the heading "Pardner", then "This browser isn't signed in to your local Pardner client.", then a notice: "The sign-in link was already used or has expired. Links from your agent work once." Then: "Ask your agent to open Pardner for you. It runs `pardner client open`, which signs this browser in without showing you a key." Then the **Check again** button.
3. He hesitates and clicks **Check again** → `open(null)` re-reads `/session` with no grant. It still gets 401. The screen re-renders *without* the expired-link notice, because `failure` is now null. It looks as if something changed, but he is still signed out.
4. He clicks **Check again** twice more → The result is the same each time. Nothing tells him that Check again can never sign him in by itself.
5. He reads the copy again and runs `pardner open` himself in a terminal → The command opens a new tab in his *default* browser, which is Chrome, not Firefox. Chrome is already signed in.
6. He realises he needs the link in Firefox. He runs `pardner open --output-file /tmp/p.txt` and pastes the URL into the *existing* Firefox tab → Only the hash changes, so `hashchange` fires. `takeBootstrapGrant` strips the grant and `open(grant)` exchanges it. The cookie is set and the board appears.
7. He clicks **Check again** in another stale Firefox tab → `/session` now succeeds with the new cookie, and that tab opens the board too.
##### Variations
- He pastes the reused link into Chrome, which is already signed in: the bootstrap fails, `/session` succeeds and the board opens with no notice at all. "A used link is harmless when this browser is already signed in" (ClientApp.jsx:62).
- The link is older than 60 s but was never used: the screen and notice are the same as for a reused link. The copy does not distinguish the two.
- He opens `/pardner/` with no grant at all in a fresh browser: the signed-out screen appears *without* the notice.
##### Edge Cases
- The copy says "Ask your agent", but a person can run `pardner open` themselves. The code names `pardner client open` here, while the startup shell and the config-failure screen name `pardner open`. These are two spellings for one action across three surfaces.
- The launcher always opens the OS default browser. No flag picks a different browser, so signing in a second browser always needs `--output-file`.
- He opens the grant URL at a different origin (for example a hostname alias): the host check returns `ORIGIN_REJECTED` before the bootstrap runs.

---

#### STORY-005: Signed out in the middle of a session (server-side revoke)
*(was first-launch-sign-in/STORY-005)*
**Merged in**: resilience-recovery/STORY-005 — Aisha Karimi's agent-only laptop whose browser session is revoked; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: short
**Topic**: First launch and sign-in
**Persona**: Aisha Bello. She is working in Pardner on the task "Migrate billing webhooks to v2" while her other self, on a second device, revokes this device with `client revoke --kind device`.
**Goal**: Understand why the board vanished and get back in.
**Preconditions**: She is signed in, ProjectView is open, and her session has been marked revoked.
**Ideal path**: 2 — Re-run `pardner open` (it only helps if this device is still allowed), and the board is back.
**Alternate paths**: There is no in-app re-sign-in. *(merged)* Re-run `pardner client open` or `pardner open` from a terminal; `control open` for control-runtime installations.
**See also**: STORY-010, STORY-125, STORY-130, STORY-143
##### Steps
1. The 5 s presence poll or the 15 s project poll gets `AUTH_REQUIRED` → `onAuthLost()` switches the phase to signed-out (ClientApp.jsx:457, 469, 499).
2. Aisha sees "This browser isn't signed in to your local Pardner client." without the expired-link notice, and the **Check again** button.
3. She clicks **Check again** → Still signed out.
4. She runs `pardner open` → A new grant and a new tab. Her session is created again, if the device's human authority still allows it.
##### Variations
- The local service stops instead (someone ran `pardner client stop`): requests get `CLIENT_UNREACHABLE` "The local Pardner client did not respond. Check that it is still running, then retry." with the hint "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry." This is the error path, not the signed-out screen.
- *(merged)* Agent-only device: the laptop joined through an Agent invitation with no identity, so its human session is revoked (client-projects.js:65-68). Within 5 s the presence poll, or any request, gets `AUTH_REQUIRED` and the signed-out screen appears. **Check again** does not change it, and `pardner client open` fails with `FORBIDDEN` "Human authority required" (see STORY-010, STORY-125).
- *(merged)* A normal revocation of a session on a human device: `pardner client open` issues a new `#grant=`; in the same tab the `hashchange` re-runs bootstrap (ClientApp.jsx:67-72) and the board returns.
- *(merged)* Opening an old grant link a second time: the signed-out screen plus "The sign-in link was already used or has expired. Links from your agent work once."
##### Edge Cases
- Any unsaved task draft on screen is lost when ProjectView unmounts. That behaviour belongs to the editing topic; here it is only noted.
- *(merged)* If she is already signed in and opens a used grant, the cookie still works and the board opens (ClientApp.jsx:58-63, "A used link is harmless").
- *(merged)* The screen does not say why she was signed out (revocation versus an expired cookie). Clarity candidate.

---

#### STORY-006: Startup shell stuck — service down or browser build broken
*(was first-launch-sign-in/STORY-006)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Ken Watanabe, a contractor. He bookmarked `http://127.0.0.1:52011/pardner/` last week. He rebooted, opened the bookmark, and the Pardner service is not running.
**Goal**: Get the board to load.
**Preconditions**: After the reboot, nothing is listening on 52011.
**Ideal path**: 1 — Run `pardner open`. The saved port is reused, so even his bookmark works afterwards.
**Alternate paths**: Run `pardner client serve` in the foreground and then click **Reload Pardner**. Or click **Retry connection** on the config-failure screen once the service is up.
**See also**: STORY-143, STORY-146
##### Steps
1. Ken opens the bookmark → The browser shows its own "connection refused" page. No Pardner page exists without the service, so the startup shell never appears.
2. He remembers the shell's advice from earlier and runs `pardner open` → The probe finds `client-connection.json` but the fetch fails (`unreachable`). The CLI spawns a child, which binds the *saved* port 52011 (state.port; client-service.js:426) and starts the projects marked ready.
3. A new tab opens and signs in. He reloads the old bookmark tab → It works with the cookie.
4. Later, after a `git pull`, he forgets `npm run ui:build` and the JS bundle fails to load → The static shell stays: "Opening your workspace…". After 12 s, or at once on a script error, the message changes to "Pardner could not finish loading. Reload the page; if this continues, rebuild the browser client and restart the service." (index.html:20-26).
5. He clicks **Reload Pardner** → The page reloads with the same result. He runs `npm run ui:build`, `pardner client stop` and `pardner open` → The page loads.
##### Variations
- The service answers but `/pardner/config` fails or times out after 10 s: React shows "Pardner", the failure message, then "Check that Pardner is running on your computer. Start it with `pardner open`, then retry." and a **Retry connection** button (Pardner.jsx:188-193).
- The config is malformed: "The local client configuration is incomplete. Restart Pardner and retry." (connection.js:32). An unreadable response gives "The service returned an unreadable response. Retry the connection."
- Site storage is blocked and React throws: StartupBoundary shows "Pardner could not open", "Allow browser site storage, then reload. If this continues, check that the service and browser build are up to date." and **Reload Pardner** (main.jsx:13-17).
- JavaScript is disabled: "Enable JavaScript to open Pardner." (index.html:16).
##### Edge Cases
- There are four startup failure surfaces, each with its own copy: the static shell, the 12 s failure text, the config failure with **Retry connection**, and StartupBoundary "Pardner could not open". Two buttons do the same thing under different labels (**Reload Pardner** and **Retry connection**). This is a redundancy candidate.
- A port saved in the registry may be taken by another app after the reboot. See STORY-007.

---

#### STORY-007: PORT_IN_USE — another process on the client's port
*(was first-launch-sign-in/STORY-007)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Lena Novak, a frontend engineer. Her Vite dev server happened to grab port 52011, which Pardner had saved, while Pardner was stopped.
**Goal**: Start Pardner despite the port clash.
**Preconditions**: `client-connection.json` points at `http://127.0.0.1:52011`. Vite is answering on 52011.
**Ideal path**: 2 — Read the error, then re-run with `--http-port`. A design that fell back to a free port would need 1.
**Alternate paths**: Stop the other process and re-run `pardner open`. Or `pardner client serve --http-port 52100` in the foreground.
**See also**: STORY-012, STORY-143
##### Steps
1. Lena runs `pardner open` → The probe's GET `/session` with the bearer token gets a non-ok, non-503 answer from Vite, so the state is `foreign`. The command fails at once with `PORT_IN_USE: http://127.0.0.1:52011 is answering but is not this Pardner client; stop that process or start with --http-port` (client-cli.js:42, 60). Nothing is spawned and nothing is stopped.
2. She runs `pardner open --http-port 52100` → The state is still `foreign`. The check runs *before* the flags are used, so she gets the same PORT_IN_USE error. She is confused, because the message told her to use `--http-port`.
3. She stops Vite and runs `pardner open` again → The state is `unreachable`, so a child is spawned on 52011 and she signs in.
##### Variations
- The port is held by something that does not speak HTTP, or the fetch fails: the state is `unreachable`. A child spawns, and `listen` gets EADDRINUSE. The child prints a JSON failure line, and `startFailure` passes on `PORT_IN_USE` "Port 52011 is in use by another process; choose another --http-port" (client-service.js:428-429; client-cli.js:45-53). In this case `--http-port 52100` *does* work, because the flag is passed to the spawned serve and the registry saves the new port.
- `pardner client serve --http-port 52100` in the foreground: it binds 52100 and rewrites `client-connection.json`.
##### Edge Cases
- Two PORT_IN_USE messages with different wording and different fixes come from two code paths (client-cli.js:42 and client-service.js:429). In the `foreign` case the suggested `--http-port` cannot take effect while the stale connection file points at the foreign port. This was not proven by running it; it comes from reading the code order at client-cli.js:58-61.
- After moving to 52100, old bookmarks to 52011 are dead, and the cookie is per-origin, so she must sign in again with a new grant.

---

#### STORY-008: Slow or failing start — CLIENT_START_TIMEOUT, CLIENT_START_FAILED, STORAGE_IN_USE
*(was first-launch-sign-in/STORY-008)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Raj Patel, an SRE. He runs Pardner from a network-mounted home directory on an overloaded build box.
**Goal**: Find out why `pardner open` did not open anything, and recover.
**Preconditions**: The client is not running. Storage is slow, or another client process still holds the directory.
**Ideal path**: 2 — Read the error naming `client.log`, fix the cause, and re-run.
**Alternate paths**: Run `pardner client serve` in the foreground to watch the output directly.
**See also**: STORY-143
##### Steps
1. Raj runs `pardner open` → A child spawns. 15 s pass with no `running` probe. The command fails with `CLIENT_START_TIMEOUT: Client service did not answer within 15s; see /home/raj/.pardner/client/client.log` (client-cli.js:81).
2. He runs `tail ~/.pardner/client/client.log` → He sees the child's output. The child may still be starting, because the timeout does not kill it.
3. He waits and runs `pardner open` again → The probe now returns `running`. The command opens the browser.
4. Another day a forgotten foreground `client serve` holds the lease. He runs `pardner open`, the child exits, and `startFailure` passes on `STORAGE_IN_USE: Another Pardner service is using this storage directory` (storage-lease.js:17).
5. If the child exits with no JSON failure line, he gets `CLIENT_START_FAILED: Client service exited (1): <last log line>; see …/client.log`.
##### Variations
- He runs `pardner open` while a stop is still in progress (the service answers 503 `SERVICE_STOPPING`): the probe treats it as `unreachable` and spawns a child, which may hit `STORAGE_IN_USE` until the old process releases the directory.
- `--data` points at a non-empty directory that is not a client directory: `INCOMPATIBLE_SCHEMA` "Choose a fresh client directory; existing data is preserved" (client-registry.js:17-19). A registry from a newer version gives "Incompatible client registry; preserve this directory".
##### Edge Cases
- After a timeout, a second `pardner open` while the first child is still booting can spawn a *second* child. That child fails with STORAGE_IN_USE and adds more lines to `client.log`.
- `client.log` is append-only and never rotated by Pardner.

---

#### STORY-009: Checking and stopping the service (`client status` / `client stop`)
*(was first-launch-sign-in/STORY-009)*
**Type**: medium
**Topic**: First launch and sign-in
**Persona**: Grace Lindqvist, an engineering manager. She wants to know whether Pardner is running before closing her laptop for the weekend, and wants to stop it cleanly.
**Goal**: Check the service state, then stop it.
**Preconditions**: The client is running with two projects, "Atlas onboarding" and "Q4 infra cleanup".
**Ideal path**: 2 — One status command, one stop command.
**Alternate paths**: `pardner client list` is the same call as `status` (client-cli.js:127). The browser identity, profile and project switcher show the same `/session` data, so this information appears in two places (redundancy candidate). With launchd: `control status` / `control stop`.
**See also**: STORY-142, STORY-143
##### Steps
1. Grace runs `pardner client status` → It reads `client-connection.json` and calls GET `/session` with the operator token. It returns `{"success":true,"identity":{…},"device":{…},"suggestedIdentity":{…},"setupAgent":{…},"projects":[…]}`. There is no explicit `running:true` field or URL. She has to infer "running" from `success:true`.
2. She runs `pardner client stop` → The probe returns `running`. POST `/shutdown` sends the operator token, and the service stops after the response is sent (client-service.js:307-311). The CLI waits up to 15 s for the storage lease and prints `{"success":true,"stopped":true,"running":false}`.
3. Her open browser tab polls on → It gets `CLIENT_UNREACHABLE` "The local Pardner client did not respond. Check that it is still running, then retry."
4. She runs `pardner client stop` again → `{"success":true,"stopped":false,"running":false}`. This is not an error.
5. She runs `pardner client status` → The stale `client-connection.json` still exists, so the CLI tries the fetch, and it fails. The result is a generic error, probably `INTERNAL_ERROR: fetch failed`, not `CLIENT_NOT_RUNNING` (client-cli.js:116-123). This was not run.
##### Variations
- With no `client-connection.json` at all (a fresh data directory): `status` gives `CLIENT_NOT_RUNNING: Start Pardner with pardner open or pardner client serve` (client-cli.js:117).
- The lease is not released within 15 s: `CLIENT_STOP_TIMEOUT: Client service did not release ~/.pardner/client within 15s`.
- The port is answered by a foreign process: `stop` fails with PORT_IN_USE and nothing is stopped.
##### Edge Cases
- A browser cookie session cannot stop the service. `/shutdown` requires the operator token, otherwise `FORBIDDEN` "Local operator authority required". There is no Stop button in the UI.
- `status` and `stop` disagree about a stale connection file. `stop` reports it calmly as not running. `status` reports a raw error.

---

#### STORY-010: Agent-only device tries to open a human browser
*(was first-launch-sign-in/STORY-010)*
**Type**: short
**Topic**: First launch and sign-in
**Persona**: Omar Haddad. He set up a CI mini-Mac whose client joined only through an Agent invitation (`humanAuthority=false`). Now he wants to look at the board on it.
**Goal**: Open the board on that machine.
**Preconditions**: The registry has `humanAuthority: false`.
**Ideal path**: 1 — Run the command and get a clear refusal that explains the alternative (link a device or use his own client).
**Alternate paths**: Open the board from his own human client on another machine.
**See also**: STORY-005, STORY-033, STORY-125
##### Steps
1. Omar runs `pardner open` → The service is running, but POST `/open` calls `this.human()` and fails with `FORBIDDEN: Human authority required` (client-service.js:41, 303). No browser opens.
2. He opens an old `#grant=` URL from before the agent join → The exchange fails with `FORBIDDEN` "Agent-only device has no human browser authority" (client-auth.js:22), and then `/session` gives 401. He sees the signed-out screen *with* the notice "The sign-in link was already used or has expired." That copy is misleading, because the real reason is that the device is agent-only.
3. He clicks **Check again** → He stays signed out.
##### Variations
- None found beyond the two entry points above.
##### Edge Cases
- The signed-out screen does not separate FORBIDDEN from an expired grant (ClientApp.jsx:63-64, 104-106). Its "Ask your agent to open Pardner" advice cannot work on this device.

---

#### STORY-011: Opening a standalone `pardner serve` in the browser
*(was first-launch-sign-in/STORY-011)*
**Type**: short
**Topic**: First launch and sign-in
**Persona**: Ines Moreau, an integrations developer. She ran `pardner serve` for her webhook bridge and then pointed her browser at `http://127.0.0.1:8004/pardner/`, expecting a board.
**Goal**: See the tasks in a browser.
**Preconditions**: Standalone `pardner serve` is running on its default ports, 8004 for HTTP and 8005 for WebSocket (local-service.js:25-26).
**Ideal path**: 2 — Read the notice, then run `pardner open`.
**Alternate paths**: none found; the standalone service serves no board.
**See also**: STORY-135, STORY-145
##### Steps
1. Ines runs `pardner serve` → `{"success":true,"serving":true,"role":"hub","workspaceId":…,"httpUrl":"http://127.0.0.1:8004","wsUrl":"ws://127.0.0.1:8005"}`, and `connection.json` is written.
2. She opens `http://127.0.0.1:8004/pardner/` → The SPA loads. `/pardner/config` returns `{apiBase, wsPath, wsPort, workspaceId}` with no `mode:'client'` (automerge-sync-server.js:504-508). She sees "Pardner" and "This is an agent and integration service. Open Pardner with `pardner open`." (Pardner.jsx:196-199).
3. She runs `pardner open` → A separate local client starts under `~/.pardner/client` with its own port. Her standalone workspace does *not* appear there. She would have to create or join a project in the client.
##### Variations
- `pardner serve --role replica --hub URL`: shows the same notice.
##### Edge Cases
- The notice does not say that the client and the standalone service hold separate data (`~/.pardner/client` versus the `serve` data directory). A user may expect to see the same tasks.
- Both services can run at once on different ports. Nothing tells her which tab is which except the notice.

---

#### STORY-012: Long first-day journey — agent sets up, person signs in, mishaps, restart
*(was first-launch-sign-in/STORY-012)*
**Type**: long
**Topic**: First launch and sign-in
**Persona**: Sofia Castellanos, a tech lead. Her Claude Code agent "Scout", running under T3, sets up Pardner for her on a new laptop. She follows along and later runs commands herself.
**Goal**: End the day with Pardner set up, signed in in two browsers, stopped cleanly and restarted the next morning.
**Preconditions**: A fresh macOS laptop with no `~/.pardner`. Scout has shell access. A Vite app is configured to use port 5173.
**Ideal path**: 6 — The agent runs open, Sofia signs in, she uses `--output-file` once for the second browser, then stop, then open the next day. One status check is optional.
**Alternate paths**: `pardner client serve` in the foreground supervised by T3 (docs/PARDNER-CLIENT.md:36-38). `control open` under launchd. Bookmarking `/pardner/` instead of re-running open on day 2.
**See also**: STORY-001, STORY-003, STORY-004, STORY-007, STORY-009
##### Steps
1. Scout runs `node bin/pardner.js open --harness anthropic-claude-code --name Scout --model claude-opus --managed-by T3` → The service spawns with `setupAgent` metadata. Output: `launchIssued:true`.
2. Safari opens → The startup shell shows "Opening your workspace…", then "Opening your local client…".
3. (automatic) → The grant is stripped and exchanged, and the cookie is set.
4. Sofia sees the identity step with her Git name "Sofia Castellanos" and email filled in → She confirms. The identity flow is covered by another topic.
5. She creates the project "Helios launch" (another topic) → The board appears.
6. Scout copies the launch URL from its own logs and posts it in chat "for Firefox". This is a mistake: the CLI never prints the grant, so Scout would only have the URL by re-running with `--output-file`. Scout reruns `pardner open --output-file ~/Desktop/pardner-link.txt`.
7. Sofia opens the file 3 minutes later and pastes the URL into Firefox → The grant has expired (60 s). She sees the signed-out screen with "The sign-in link was already used or has expired. Links from your agent work once."
8. She clicks **Check again** → She stays signed out, and the notice disappears.
9. She asks Scout to run the command again and pastes the new URL into the same Firefox tab within the minute → `hashchange` triggers the bootstrap, and the board shows "Helios launch".
10. She deletes `~/Desktop/pardner-link.txt`.
11. Before leaving she runs `pardner client status` → JSON with `identity`, `device` and one project.
12. She runs `pardner client stop` → `stopped:true, running:false`.
13. Firefox, still open, starts showing `CLIENT_UNREACHABLE` "The local Pardner client did not respond…" with the hint "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry."
14. Next morning her Vite dev server has grabbed the saved Pardner port by chance. She runs `pardner open` → `PORT_IN_USE: http://127.0.0.1:PORT is answering but is not this Pardner client; stop that process or start with --http-port`.
15. She stops Vite and runs `pardner open` → The service restarts on the saved port and reopens "Helios launch". Safari signs in with a fresh grant.
16. In Firefox she clicks the bookmark `/pardner/` → The year-long cookie is still valid on the same origin, so the board opens with no new grant.
##### Variations
- On day 2 she skips `pardner open` and opens the bookmark while the service is stopped: the browser shows "connection refused" (STORY-006).
- She runs `pardner open --http-port 52100` on day 2 after a clean probe: the new port is saved. Both browsers' cookies are bound to the old origin, so both need new grants.
##### Edge Cases
- The grant is only seen through `--output-file`. The 60 s lifetime combined with a person-in-the-loop hand-off (agent writes the file, human opens it later) is a common way to fail.
- "Not running" guidance appears on five surfaces with three spellings: `pardner open` (startup shell, config failure), `pardner client open` (signed-out screen), "Ask your agent to reopen it" (CLIENT_UNREACHABLE hint), and `pardner open or pardner client serve` (CLIENT_NOT_RUNNING). This is a redundancy candidate.

---

### Identity confirmation and device linking


Source of truth for this topic:
- `ui-prototype/src/ClientApp.jsx:112-158` (IdentityStep and the Link this device sub-page)
- `ui-prototype/src/ClientApp.jsx:160-196` (JoinForm)
- `ui-prototype/src/ClientApp.jsx:21-31` (JOIN_HINTS)
- `ui-prototype/src/client-api.js:37-45` (`invitationPurpose`)
- `lib/client-service.js:313-324` (`POST /identity`, `IDENTITY_EXISTS`)
- `lib/client-identity.js:13-17, 43-46` (`profile()` validation, `gitDefaults`)
- `lib/client-projects.js:46-108` (join and identity adoption)
- `lib/client-invites.js:60-122` (redeem rules)
- `lib/client-registry.js:27` (device name = `--device-name` or hostname)
- `ui-prototype/src/Avatar.jsx:88-152` (ProfileDialog)
- `docs/PARDNER-CLIENT.md:52-55, 85-103`

#### STORY-013: First-run confirmation with Git-prefilled identity
*(was identity-device-linking/STORY-001)*
**Type**: short
**Topic**: Identity confirmation and device linking
**Persona**: Maya Okafor, a backend engineer on her work MacBook ("Mayas-MacBook-Pro"). She has had `git config user.name "Maya Okafor"` / `user.email maya@lanternworks.io` set for years. Her Claude Code agent just ran `pardner open` for her.
**Goal**: Get past the identity step with her usual name and email.
**Preconditions**: A fresh client directory with no `identity` in the registry. The browser was signed in via a `#grant=` link. `suggestedIdentity` was filled by `gitDefaults(process.cwd())` (client-service.js:35).
**Ideal path**: 1 — the fields are already correct, so a single click on the primary button should do.
**Alternate paths**: `pardner client identity --name "Maya Okafor" --email maya@lanternworks.io --operation-id maya-identity` from the CLI (client-cli.js:128). The control runtime's first run creates the identity from `config.identity` (docs discovery section 13). Both skip the browser step: the next `GET /session` already has `identity`, so ClientApp goes straight to Welcome.
**See also**: STORY-001, STORY-022
##### Steps
1. Maya's agent runs `pardner open` → the browser opens `/pardner/#grant=…`. The static shell "Opening your workspace…" changes to "Opening your local client…". The grant is stripped from the URL.
2. The page renders the **Welcome to Pardner** heading with the lead "Confirm how people in your projects will see you." → **Name** shows "Maya Okafor" and **Email** shows "maya@lanternworks.io".
3. Maya reads the helper text: "Filled in from your Git configuration. Your profile shows these to project members. They don't sign you in, and Pardner never changes your Git settings." Below the form she sees "This device: Mayas-MacBook-Pro".
4. She hesitates over whether "Email" means a login. The helper text says it doesn't sign her in, so she clicks **Continue as Maya Okafor** → the button briefly shows **Saving…**. `POST /identity` stores `{id: randomUUID(), name, email}`.
5. → The page switches to the Welcome page with the heading **Welcome, Maya Okafor**, "A project is a shared board for you, the people you invite and your agents.", and the **Start a project** / **Join a project** toggles.
##### Variations
- Maya edits the name to "Maya O." first: the button label updates live to **Continue as Maya O.** (it is computed from `name.trim()`).
- Maya clears the Name field completely: the button reads **Continue as this person**. Submitting is blocked by the HTML `required` attribute.
- Maya presses Enter in the Email field: the form submits the same way as clicking the button.
##### Edge Cases
- The service was started from a directory that isn't a Git repo, or `git` isn't installed: `gitDefaults` returns empty strings, so both fields are blank.
- Git has a name but no email: `fromGit` is true, so the text still says "Filled in from your Git configuration." even though Email is empty. The copy overstates what was filled.
- Maya double-clicks the button: the button is `disabled={busy}`, and the same `attempt.current.operationId` is reused, so the registry `attempt` stays idempotent.
- The response is lost (the service is busy): the error shows. Resubmitting with unchanged fields reuses the same operation ID and gets the stored result.
- Redundancy: the name and email confirmed here appear again on the Welcome heading ("Welcome, {name}"), in the start-form text "You join as {name}.", on the header button **You: {name}**, in the Profile **Git name / Git email**, and in `pardner client status` → `identity`.

---

#### STORY-014: No Git config, so the person types their identity
*(was identity-device-linking/STORY-002)*
**Type**: short
**Topic**: Identity confirmation and device linking
**Persona**: Tomás Rivera, a product designer who doesn't use Git. His agent installed Pardner on his new Mac mini.
**Goal**: Enter a name and email once and continue.
**Preconditions**: A fresh client. `suggestedIdentity` is `{name:'', email:''}`.
**Ideal path**: 3 — type the name, type the email, then continue.
**Alternate paths**: `pardner client identity --name "Tomás Rivera" --email tomas@fernhill.studio --operation-id tomas-1`.
**See also**: STORY-018
##### Steps
1. The page opens on **Welcome to Pardner** → both **Name** and **Email** are empty. The helper text reads "Git didn't provide a name and email here, so enter them once. Your profile shows these to project members…". The button reads **Continue as this person**.
2. Tomás types "Tomás Rivera" in **Name** → the button changes to **Continue as Tomás Rivera**.
3. He types "tomas@fernhill" into **Email** and clicks the button → the browser's built-in `type="email"` validation may accept this. If it does, the server's `profile()` regex `^[^\s@]+@[^\s@]+$` also accepts it (there is no dot requirement), and the identity is saved with the typo.
4. He notices the typo on the Welcome page. The heading only shows "Welcome, Tomás Rivera", and there is no edit control anywhere in the UI.
5. He asks his agent to fix it. The agent runs `pardner client identity --name "Tomás Rivera" --email tomas@fernhill.studio --operation-id fix-email` → the CLI returns `{success:false, error:{code:'IDENTITY_EXISTS', message:'Identity already initialized; linking requires My device'}}` (HTTP 409).
##### Variations
- Tomás types the email with a space ("tomas @fernhill.studio"): the browser email validation blocks submit. If it is bypassed, the server returns `INVALID_ARGUMENT` "Supply an email", which shows in the red inline Failure box.
- Tomás types a name of only spaces: the browser's `required` check passes, but the trimmed name is empty, so the server returns "Supply a name".
##### Edge Cases
- A name longer than 200 characters or an email longer than 320: the server returns "Supply a name" / "Supply an email". The message doesn't mention the length limit.
- There is no identity edit or rename path at all (Update: not supported). The only recovery from a typo is a fresh client directory (`--data`), which loses any projects already made there. This is a key friction finding.
- The `IDENTITY_EXISTS` message mentions "linking requires My device", which doesn't help someone whose real goal is fixing an email.

---

#### STORY-015: Link a second laptop with a My device invitation from the browser
*(was identity-device-linking/STORY-003)*
**Merged in**: invitations/STORY-007 — Ken Watanabe linking his home Mac mini to "Edge Cache Rollout" (long); its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Identity confirmation and device linking
**Persona**: Priya Natarajan, a staff engineer. She already runs Pardner on her desktop "priya-studio", where she created the project "Checkout Revamp". She is setting up her travel laptop "priya-air" before a conference.
**Goal**: Make the laptop act as the same Priya (same Actor) on "Checkout Revamp" instead of creating a second Priya.
**Preconditions**:
- The desktop client has an identity and the project "Checkout Revamp".
- The desktop runs with `--public-url https://pardner.priya.dev` or is otherwise reachable over HTTPS. A loopback-only endpoint would fail from another machine.
- The laptop client is fresh and shows **Welcome to Pardner**, with her Git name and email prefilled.
**Ideal path**: 4 — on the desktop, choose Invite → My device and create and copy the invitation; on the laptop, click Link this device instead, paste, and click Link device.
**Alternate paths**:
- Desktop: `pardner client invite --project <id> --purpose device --output-file ~/priya-device.txt --operation-id dev-1`, then move the file privately.
- Laptop: `pardner client join --invitation-file ~/priya-device.txt --operation-id link-air` before ever confirming an identity. The identity is adopted (`state.identity ??= receipt.identity`).
- Hand the copied setup prompt ("Add this machine to project "Checkout Revamp" under my existing identity. Set up its local client and open the board.") to the laptop's agent, which runs `client join`.
**See also**: STORY-017, STORY-021, STORY-023, STORY-036, STORY-038
##### Steps
1. On the desktop board, Priya clicks **Invite** → the menu shows Human ("A person and their agent"), Agent ("Another agent of yours") and **My device** ("Another computer you use").
2. She clicks **My device** → the dialog **Add one of your devices** opens, with the subtitle "Checkout Revamp" and the body "For another computer you use. It links your existing identity rather than creating a new person." The history section **Invitations for this project** shows "None yet."
3. She clicks **Create invitation** (it shows **Creating…**) → the dialog shows "**Waiting to be used** · Expires in 24 h · Nov 10, 3:12 PM". Below it are **Copy invite**, **Show invite text** and **Revoke**, and "The invitation stays hidden so it can't be read from a shared screen."
4. She clicks **Copy invite** → "Copied. Treat it like a password and send it privately; it works once." She sends it to herself in a private message.
5. On the laptop she sees **Welcome to Pardner** already filled with "Priya Natarajan" / "priya@northbeam.dev". The big **Continue as Priya Natarajan** button tempts her. She reads the line under it: "Already use Pardner on another computer? **Link this device instead**". She clicks the link.
6. → The heading changes to **Link this device**, with the lead "A My device invitation from your own client adds this computer under your existing identity." There is a textarea **My device invitation** (placeholder "Paste the invitation or setup prompt you were sent") and the button **Link device**.
7. She pastes the whole copied setup prompt, including the prose and the `pardner client join …` line. `invitationPurpose` finds the single `pardner-invite-v1.` line and decodes `purpose: 'device'`, so it is accepted.
8. She clicks **Link device** → the button shows **Linking…**. The laptop POSTs `/join`, and the desktop's `/enroll` redeems the invitation. The laptop adopts the sponsor identity (same `identity.id`) and registers the human and agent Actors with the laptop device added.
9. → Because a project now exists, the laptop skips Welcome and opens the board directly. The header shows **Project: Checkout Revamp** and **You: Priya Natarajan**.
10. Back on the desktop, the invitation history row now reads "My device · **Used**" with no Revoke button. The dialog is still open, so the history refreshes only on the next load. Closing and reopening shows it.
11. Priya clicks **You: Priya Natarajan** on either machine → the dialog heading **Priya Natarajan (you)** and "Human · Active". Under **Identity**, **Devices** lists "priya-studio" and "priya-air". The devices are merged in client-service.js:151.
##### Variations
- She pastes only the raw `pardner-invite-v1.…` line: it is accepted the same way.
- She uses **Show invite text** instead of Copy, because the clipboard was blocked ("This browser blocked copying. Use Show invite text and copy it manually."). The warning "Visible on screen. Stop sharing your screen before copying." appears above a read-only textarea that selects all its text on focus.
- The laptop's agent does the join via CLI. The browser, still on **Welcome to Pardner**, keeps showing the identity form until it reloads. After a reload, `/session` has the identity and projects, and the board opens.
- *(merged)* Copy is blocked by a corporate browser policy: Ken uses **Show invite text**, focuses the textarea (which auto-selects), copies, and saves the text as a 1Password secure note before clicking **Close**.
- *(merged)* On the identity step he almost clicks **Continue as Ken Watanabe** and then notices **Link this device instead**. On the link page he first pastes an old Human invitation from his notes by mistake; it is refused before any request: "This is a Human invitation. Confirm your identity first, then join with it." (see STORY-016). He then pastes the right My device text.
- *(merged)* CLI join on the new machine: `pardner client join --invitation-file ~/Downloads/device-invite.txt --operation-id link-mini-1`, then `pardner open`.
##### Edge Cases
- The desktop has no HTTPS public URL, so the endpoint is `http://127.0.0.1:…`. The laptop's client posts to its *own* loopback and the request fails, giving `HUB_UNAVAILABLE` "Project authority unavailable; retry this attempt" with the hint "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." The real cause (wrong machine) is never explained.
- The desktop endpoint is plain `http://` on a LAN IP: invitationData returns `INVALID_INVITATION` "Remote invitations require HTTPS; use a secure private route", plus the hint "Check that you pasted the whole invitation, exactly as it was sent." The hint is misleading here.
- The invitation expired (more than 24 h): `INVITE_EXPIRED` → "Invitation expired" + "Ask for a new invitation; this one has expired."
- Priya reloads the laptop tab mid-**Linking…**: the digest and operation ID are kept in sessionStorage `pardner:client:pending-join` with `identityId: null`. Re-pasting the same text resumes the same attempt, so the invitation isn't consumed twice.
- Device linking is per project. Her desktop's other project "Infra On-call" is not on the laptop. She must repeat steps 1-8 per project; see STORY-017.
- Redundancy: the device names appear in "This device: …" on the identity step, the Profile **Devices** list, the Profile live-session **Device** field, and `client status` → `device`.
- *(merged)* The new machine already has an identity (Continue was clicked): the redeem fails with `IDENTITY_MISMATCH` "Destination already belongs to another identity" (client-invites.js:73-74) plus the JOIN_HINTS text. The invitation stays usable because validation runs before binding (see STORY-018).
- *(merged)* The sponsoring computer is asleep or offline during the link: `HUB_UNAVAILABLE` "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost."
- *(merged)* Wrong person pastes a leaked invite on another identity-bearing client: it is rejected and stays usable for the owner (docs/PARDNER-CLIENT.md:90-93).

---

#### STORY-016: Pasting the wrong kind of invitation on the Link this device page
*(was identity-device-linking/STORY-004)*
**Type**: short
**Topic**: Identity confirmation and device linking
**Persona**: Daniel Kim, joining his teammate Rosa's project "Q4 Pricing Experiments" on his own fresh laptop. Rosa sent him a **Human** invitation. He wrongly assumes "Link this device" is how you join someone else's project.
**Goal**: Join Rosa's project.
**Preconditions**: A fresh client on the identity step, and a Human invitation from Rosa.
**Ideal path**: 3 — Continue as Daniel Kim, then Join a project, paste, and Join project. The wrong route adds roughly 3 wasted steps.
**Alternate paths**: `pardner client identity …` then `pardner client join --invitation-file rosa-invite.txt --operation-id join-q4`.
**See also**: STORY-027, STORY-047
##### Steps
1. On **Welcome to Pardner**, Daniel sees "Already use Pardner on another computer? **Link this device instead**". He thinks "joining" sounds like linking and clicks it → the **Link this device** page opens.
2. He pastes Rosa's Human setup prompt ("Join project "Q4 Pricing Experiments" with my own identity…") into **My device invitation** and clicks **Link device** → he is refused client-side with no network request. The message is "This is a Human invitation. Confirm your identity first, then join with it." The `DEVICE_INVITATION_REQUIRED` hint adds "Linking this device needs a My device invitation from your own client. Human and Agent invitations work after you confirm your identity."
3. Daniel clicks **Back to confirming my identity** → he is back on **Welcome to Pardner**. His prefilled values are re-read from `suggestedIdentity` (the component remounts its state), so any edits he made earlier are lost.
4. He clicks **Continue as Daniel Kim** → he lands on **Welcome, Daniel Kim**.
5. He clicks **Join a project**, pastes the same invitation into **Invitation**, and clicks **Join project** → it shows **Joining…**, then the board for "Q4 Pricing Experiments" opens.
##### Variations
- He pastes an **Agent** invitation: "Agent invitations are for your agent, not this browser."
- He pastes text with no invitation line, a truncated invitation, or two invitations: "Paste one complete My device invitation." (`invitationPurpose` returns null unless exactly one valid line matches).
- He pastes a My device invitation from *Rosa*: it passes the client check and goes to the server. Rosa's identity would be adopted (`identity = sponsor` for non-human purposes). Daniel would become "Rosa" on this computer. This is a dangerous possibility, and the copy only guards it with "from your own client".
##### Edge Cases
- A refused paste never reaches the hub, so the Human invitation stays usable (the test asserts `recipient === undefined`).
- The textarea is not cleared after a refusal, so he can switch back without re-copying. But Back throws the text away.
- Even if the Human invitation's purpose wasn't detected, the server would answer `IDENTITY_REQUIRED` "Confirm your identity before joining".

---

#### STORY-017: Linking a second project on an already-linked laptop
*(was identity-device-linking/STORY-005)*
**Type**: medium
**Topic**: Identity confirmation and device linking
**Persona**: Priya Natarajan again (STORY-015). Her laptop "priya-air" is linked to "Checkout Revamp". She also wants "Infra On-call", which lives on her desktop.
**Goal**: Get the second project onto the laptop under the same identity.
**Preconditions**: The laptop has an identity (adopted) and one project. The desktop owns "Infra On-call".
**Ideal path**: 5 — on the desktop, switch project, then Invite → My device → Create invitation → Copy. On the laptop, Start or join a project… → Join a project → paste → Join project.
**Alternate paths**: `client invite --purpose device` + `client join --invitation-file` via the agents.
**See also**: STORY-015
##### Steps
1. On the desktop, Priya opens the header switcher "Project: Checkout Revamp. Switch project" and picks **Infra On-call**.
2. She chooses **Invite** → **My device** → **Create invitation** → **Copy invite**. She checks the dialog subtitle reads "Infra On-call", because invitations are project-scoped.
3. On the laptop, she opens the switcher and chooses **Start or join a project…** → the heading reads **Start or join a project** (because a current project exists), with **Back to Checkout Revamp** at the bottom.
4. She looks for "Link this device" here and doesn't find it. That link exists only on the identity step. She hesitates, then picks **Join a project**.
5. She pastes into **Invitation** (hint: "Invitations work once and expire. You keep your own identity; nobody else can create it for you.") and clicks **Join project**. This form has no client-side purpose check. The server accepts it because the laptop's identity equals the sponsor's.
6. → The board opens on "Infra On-call". The switcher now lists both projects.
##### Variations
- She pastes a fresh Human invitation from a colleague into the same form: it works as a normal join, as long as her identity isn't already a member.
##### Edge Cases
- The laptop instead had a separately-confirmed "Priya Natarajan" identity (a different `identity.id`, see STORY-018). The server returns `IDENTITY_MISMATCH` "Destination already belongs to another identity", with the hint "This invitation is for a different person or identity…".
- The hint "You keep your own identity; nobody else can create it for you." reads oddly when the pasted invitation is a My device one that adopts nothing new.
- Redundancy: "join with a My device invitation" exists on two surfaces with different labels. The identity step has **Link this device** / **My device invitation** / **Link device**. Welcome has **Join a project** / **Invitation** / **Join project**. The same backend `POST /join` sits behind both.

---

#### STORY-018: Confirmed a duplicate identity by mistake, then tried to link
*(was identity-device-linking/STORY-006)*
**Type**: medium
**Topic**: Identity confirmation and device linking
**Persona**: Grace Liu, an engineering manager setting up her home iMac "grace-imac". She clicks through quickly. Her work laptop already runs "Platform Roadmap 2027".
**Goal**: Have the iMac act as the same Grace on "Platform Roadmap 2027".
**Preconditions**: A fresh iMac client, and a My device invitation from her laptop sitting in her notes.
**Ideal path**: 3 — Link this device instead, paste, Link device. Her mistake makes the goal unreachable without a reset.
**Alternate paths**: Reset with a fresh client directory: `pardner open --data ~/.pardner/client-2`, or stop the client and start it with another `--data`. Then link via the browser or via `client join`.
**See also**: STORY-023, STORY-047
##### Steps
1. The iMac shows **Welcome to Pardner**, prefilled "Grace Liu" / "grace@orbitallabs.com". Grace clicks **Continue as Grace Liu** out of habit, without noticing "Link this device instead".
2. → **Welcome, Grace Liu** appears. She now realizes she wanted to link and looks for the link page. It is gone, because IdentityStep only renders while `!session.identity`.
3. She chooses **Join a project**, pastes the My device invitation and clicks **Join project** → the server returns `IDENTITY_MISMATCH` "Destination already belongs to another identity". The hint reads "This invitation is for a different person or identity. A My device invitation links a computer that has no identity yet; a Human invitation needs your own identity first."
4. Thanks to "validate the recipient before binding", the invitation is still usable. The laptop's invitation history still shows "My device · **Waiting to be used**".
5. She asks her agent to fix it. The agent tries `pardner client identity --name "Grace Liu" --email grace@orbitallabs.com` with a new operation ID → this succeeds as a no-op, because the values are identical. The identity is not replaced, so it doesn't help.
6. The agent stops the client (`pardner client stop`) and runs `pardner open --data ~/.pardner/grace-imac-2` → a fresh **Welcome to Pardner** appears.
7. Grace clicks **Link this device instead**, pastes the same invitation, and clicks **Link device** → **Linking…**, then the board for "Platform Roadmap 2027" opens as **You: Grace Liu**.
##### Variations
- She instead asks the laptop for a **Human** invitation and joins with her duplicate identity. That join would succeed, creating a second "Grace Liu" human in the project. Two avatars with the same name and initials appear in the AvatarStack, and two "Grace Liu" rows in the People dialog. The only difference is the Devices list in each profile.
##### Edge Cases
- The old client directory is preserved, along with any project she started there. Pardner has no "delete identity" or "unlink" function.
- If she had pasted the My device invitation on the identity step *before* confirming, the client would have caught it. After confirming, the error comes from the server and its wording ("Destination already belongs to another identity") doesn't say "reset".
- `IDENTITY_EXISTS` has no JOIN_HINTS entry, so wherever it surfaces it shows only the raw message.

---

#### STORY-019: Two tabs racing on the identity step (IDENTITY_EXISTS in the browser)
*(was identity-device-linking/STORY-007)*
**Type**: short
**Topic**: Identity confirmation and device linking
**Persona**: Owen Brooks, a contractor. His agent ran `pardner open` twice by accident, so two tabs opened.
**Goal**: Confirm his identity once.
**Preconditions**: Two signed-in tabs, both on **Welcome to Pardner**.
**Ideal path**: 1 — Continue in one tab. The other tab should follow automatically, but it doesn't.
**Alternate paths**: none found.
**See also**: STORY-035
##### Steps
1. In tab A, Owen changes **Name** to "Owen B." and clicks **Continue as Owen B.** → tab A moves to **Welcome, Owen B.**.
2. In tab B, still showing "Owen Brooks", he clicks **Continue as Owen Brooks** → the red Failure box shows **Identity already initialized; linking requires My device** (`IDENTITY_EXISTS`, 409). There is no hint text.
3. Confused, he reloads tab B → `/session` now has the identity, and tab B shows **Welcome, Owen B.**.
##### Variations
- Both tabs submit identical name and email: the second request passes the equality check and returns the session, so tab B advances normally.
- The second `pardner open` link is stale: tab B may land on the signed-out screen "This browser isn't signed in to your local Pardner client." together with "The sign-in link was already used or has expired. Links from your agent work once." Grants are one-time and valid for 60 s.
##### Edge Cases
- The message tells Owen to use My device, which is irrelevant here. The correct recovery (reload) isn't offered.

---

#### STORY-020: Reviewing your own profile ("You") after linking
*(was identity-device-linking/STORY-009)*
**Merged in**: presence-profiles/STORY-002 — Priya Raman checking whether her Git email is exposed via the **You** button; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: short
**Topic**: Identity confirmation and device linking
**Persona**: Priya Natarajan (STORY-015), checking that the linking worked before her flight.
**Goal**: Verify that one identity covers both computers.
**Preconditions**: Both devices are linked to "Checkout Revamp", and the laptop tab is active.
**Ideal path**: 1 — click You.
**Alternate paths**: The AvatarStack avatar for herself opens the same ProfileDialog. The **+N** button → **People in this project** → her name link also opens it. `pardner client status` returns `identity`, `device` and `projects[]` as JSON. `pardner client show --project ID` returns the actors with their `devices`.
**See also**: STORY-048, STORY-049
##### Steps
1. She clicks **You: Priya Natarajan** (aria "You: Priya Natarajan, human, active. Open your profile") → a dialog with heading **Priya Natarajan (you)** and "Human · Active".
2. She reads **Identity** → **Git name** "Priya Natarajan", **Git email** "priya@northbeam.dev", **Devices** "priya-studio" and "priya-air". The note says "Git details are profile information. They do not sign anyone in."
3. She reads **Live sessions 2** → one row "Active · Browser" with Device "priya-air", Focus "No task" and "Expires in 40 s without a report". If the desktop tab is open, the second row shows Device "priya-studio".
4. She clicks **Close**, or presses Escape → focus returns to the **You** button.
##### Variations
- The desktop tab is closed: **Live sessions 1**. The **Devices** list still shows both, because devices are registered and sessions are live.
- She opens her agent's profile from the AvatarStack: it shows **Works for** "Priya Natarajan" and **Harness** "Claude Code". Its Devices include both machines.
- *(merged)* With a task panel open first, the Live session Focus lists that task as a link (Pardner.jsx:276-277 reports the selected task).
- *(merged)* An agent-run session adds Model and "Managed by T3" rows; a browser row omits Model (Avatar.jsx:139).
##### Edge Cases
- Device names are hostnames unless `--device-name` was passed. Two Macs both named "MacBook-Pro" would show identical entries. Device IDs aren't shown in the UI, yet `client revoke --kind device` needs the ID (only available from `client status` on that device).
- Redundancy: the identity appears in the identity step, Welcome, the header You button, the Profile Identity section, the People dialog, `client status` and `client show`. The device name appears on the identity step, in Profile Devices, in the Live session Device field and in `client status`.
- *(merged)* Her own presence shows twice in the header (her avatar in the AvatarStack and the **You** button). Redundancy Candidate.
- *(merged)* If her own Actor is not yet in the project's actor list (for example right after a join, before the 15 s project poll), the You button falls back to a synthetic `me`, but clicking does nothing: the dialog renders only when `actorsById[dialog.actorId]` exists (ClientApp.jsx:540). Silent no-op.
- *(merged)* With no Git config, Git name and Git email show "Not reported".

---

#### STORY-021: Lost laptop: revoking a linked device and re-linking a replacement
*(was identity-device-linking/STORY-010)*
**Merged in**: resilience-recovery/STORY-008 — Ravi Menon's laptop "ravi-mbp-old" left in a taxi; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: long
**Topic**: Identity confirmation and device linking
**Persona**: Marcus Bell, a freelance iOS developer. He lost his laptop "marcus-mbp" at an airport. His desktop "marcus-tower" is the hub for "Fitness App v3".
**Goal**: Cut off the lost laptop and set up its replacement "marcus-mbp-2" under the same identity.
**Preconditions**: The desktop is the hub for "Fitness App v3". The lost laptop was linked with a My device invitation, so its device appears in the profile's Devices list. The new laptop is fresh.
**Ideal path**: 6 — revoke the device in one step, then Invite → My device → Create → Copy, then on the new laptop Link this device instead → paste → Link device. There is no UI for revoking, so the CLI is required today.
**Alternate paths**: Revoking can only happen through `pardner client revoke --project ID --kind device --id DEVICE_ID --operation-id ID` (there is no revoke-device UI). The new laptop can link via `client join` instead of the browser.
**See also**: STORY-045, STORY-130, STORY-142
##### Steps
1. On the desktop, Marcus opens **You: Marcus Bell** → **Devices** lists "marcus-tower" and "marcus-mbp". He looks for a remove or revoke control next to "marcus-mbp" and doesn't find one.
2. He opens **Invite** → **My device** to look for a device list. The **Invitations for this project** history shows "My device · **Used**", and Revoke appears only on "Waiting to be used" rows. He closes the dialog.
3. He asks his agent. The agent runs `pardner client show --project <id>` and finds Marcus's human actor's `devices` entry `{id:'3f2c…', name:'marcus-mbp'}`.
4. The agent runs `pardner client revoke --project <id> --kind device --id 3f2c… --operation-id revoke-lost-mbp` → `{revoked:true, kind:'device', id:'3f2c…'}`. Sockets for that admission are terminated, and its presence sessions end.
5. If the lost laptop comes online, the hub refuses its device token ("Device is not admitted to this project", `AUTH_REQUIRED`). Data it already received is not erased (PARDNER-CLIENT.md:194).
6. He reopens **You** → **Devices** still lists "marcus-mbp". The actor record keeps every device ever linked, so there's no visual sign of the revocation.
7. On the desktop he chooses **Invite** → **My device** → **Create invitation** → **Copy invite**.
8. On the new laptop's **Welcome to Pardner** he clicks **Link this device instead**, pastes, and clicks **Link device** → **Linking…**, then the board opens as **You: Marcus Bell**.
9. Profile **Devices** now lists three names: "marcus-tower", "marcus-mbp" and "marcus-mbp-2".
##### Variations
- Marcus tries to revoke a device belonging to his collaborator Zoe: `FORBIDDEN` "Device belongs to another human".
- The agent passes `--kind devices` by mistake: `INVALID_ARGUMENT` "Choose device, agent or member".
- The agent omits `--id`: "Supply --kind device|agent|member and --id".
- The agent passes an unknown ID: `NOT_FOUND` "Admission not found".
- *(merged)* The network blips after the revoke and he is not sure it applied, so he re-runs the identical command: the idempotent attempt returns the same result. Re-running with the same operation ID but a different `--id`: `OPERATION_ID_REUSED`.
- *(merged)* The replacement My device invitation can come from the UI (**Invite ▾** → **My device**) or from `client invite --purpose device`.
##### Edge Cases
- He later recovers the old laptop and wants it back. A new My device invitation won't re-link it into the same local project entry ("a revoked device is not re-linked"). The recovery is a fresh client directory plus new invitations (PARDNER-CLIENT.md:99-103).
- He retries the revoke with the same `--operation-id` and the same input: the registry attempt keeps it idempotent.
- Redundancy and gap: devices are visible only as names in the profile, but are managed only by ID in the CLI.
- *(merged)* Data already on the lost laptop cannot be erased remotely; its local operator can still export (PARDNER-CLIENT-RECOVERY.md).

---

#### STORY-022: CLI-only identity setup by an agent, with validation and operation-ID mistakes
*(was identity-device-linking/STORY-011)*
**Type**: medium
**Topic**: Identity confirmation and device linking
**Persona**: An Anthropic Claude Code agent setting up Pardner for its human, Aisha Rahman, on her Linux workstation "aisha-ws". Aisha is in a meeting.
**Goal**: Initialize the client identity headlessly so Aisha only has to open the board later.
**Preconditions**: `pardner client serve --harness anthropic-claude-code --name Claude --model claude-opus-5-5` is running, and there is no identity yet.
**Ideal path**: 2 — `client status` to read `suggestedIdentity`, then `client identity`.
**Alternate paths**: The browser IdentityStep. The control runtime's `config.identity` on first run.
**See also**: STORY-013, STORY-033
##### Steps
1. The agent runs `pardner client status` → JSON includes `identity: null`, `device: {id, name:'aisha-ws'}`, `suggestedIdentity: {name:'Aisha Rahman', email:'aisha@quillstack.io'}` and `setupAgent: {harnessId:'anthropic-claude-code', name:'Claude', …}`.
2. It runs `pardner client identity --name "Aisha Rahman" --operation-id aisha-identity`, forgetting `--email` → `{success:false, error:{code:'INVALID_ARGUMENT', message:'Supply an email'}}`, and stderr shows `INVALID_ARGUMENT: Supply an email`.
3. It reruns with `--email aisha@quillstack.io` and the **same** `--operation-id aisha-identity`. The failed first attempt was rejected inside `profile()` before `attempt()` stored anything, so this succeeds and returns the session with `identity` set.
4. It retries step 3 verbatim to be safe → it gets the same result (idempotent).
5. It reruns with the same operation ID but `--name "Aisha R."` → `OPERATION_ID_REUSED`.
6. With a new operation ID it gets `IDENTITY_EXISTS` "Identity already initialized; linking requires My device".
7. Later, Aisha's agent runs `pardner client open` → the browser skips **Welcome to Pardner** and shows **Welcome, Aisha Rahman** directly.
##### Variations
- The client isn't running: `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve".
- The agent omits `--operation-id`: the CLI generates a `randomUUID()`, so a blind retry after a lost response creates a new attempt. It is harmless for identical values, but it defeats deduplication.
##### Edge Cases
- `suggestedIdentity` comes from the service's cwd or `--worktree`. If the service was started from a repo with a per-repo `user.email` (say a work alias), that is what gets suggested.
- The browser and the CLI disagree on what happens when Name is missing. The browser blocks it with `required`; the CLI gets a server-side message.

---

#### STORY-023: End-to-end: a new teammate's first day across two computers
*(was identity-device-linking/STORY-012)*
**Type**: long
**Topic**: Identity confirmation and device linking
**Persona**: Sofia Marchetti, who joins the "Atlas Search" team on Monday. She has a work laptop "sofia-work" and a personal desktop "sofia-home". Her lead, Ben Carter, owns the project "Atlas Search Relevance".
**Goal**: Join Ben's project as herself on the work laptop, then add her desktop as the same Sofia.
**Preconditions**:
- Ben's client hosts the project over HTTPS.
- Both of Sofia's clients are fresh.
- Sofia's Git config is correct on the laptop. Her desktop's Git config uses her personal email "sofia.m@fastmail.com".
**Ideal path**: 9 — Ben: Invite → Human → Create/Copy (2). Sofia's laptop: Continue, Join a project, paste, Join project (3). Sofia's laptop: Invite → My device → Create/Copy (2). Desktop: Link this device instead, paste/Link (2).
**Alternate paths**:
- All CLI: `client invite --purpose human` / `client identity` / `client join` / `client invite --purpose device` / `client join`.
- Sofia's agent can run the joins from the copied setup prompts.
**See also**: STORY-015, STORY-026, STORY-036
##### Steps
1. Ben clicks **Invite** → **Human** → the dialog **Invite a person**: "For someone joining with their own identity. Their agent sets up their own board connected to this project." He clicks **Create invitation**, then **Copy invite**, and sends it on Slack DM.
2. Sofia's agent runs `pardner open` on the laptop → **Welcome to Pardner**, prefilled "Sofia Marchetti" / "sofia@atlas-search.com", with "This device: sofia-work".
3. She clicks **Continue as Sofia Marchetti** → **Welcome, Sofia Marchetti**.
4. She clicks **Join a project**, pastes Ben's prompt, and clicks **Join project** → **Joining…**, then the board "Atlas Search Relevance" opens. The header shows **You: Sofia Marchetti**, and Ben's avatar appears in the stack.
5. That evening on her desktop, `pardner open` shows **Welcome to Pardner** prefilled with "Sofia Marchetti" / "sofia.m@fastmail.com". The different email makes her pause. She almost changes it, then reads "Already use Pardner on another computer?" and clicks **Link this device instead**.
6. She realizes she needs an invitation from her laptop. She remotes into the laptop board and chooses **Invite** → **My device** → **Add one of your devices** → **Create invitation** → **Copy invite**.
7. The laptop is a replica of Ben's hub, so the invitation is issued via the hub (`remoteJson(${hubUrl}/invites)`). If Ben's hub is down, this fails with `HUB_UNAVAILABLE` or the hint "This computer can't create invitations for this project yet. Ask the person who started the project, or retry later." (`HUB_REQUIRED`).
8. On the desktop she pastes into **My device invitation** and clicks **Link device** → she adopts the laptop identity (work email) and the board opens. The Git-prefilled personal email is discarded.
9. She opens **You** → **Git email** "sofia@atlas-search.com". **Devices** lists "sofia-work" and "sofia-home".
10. Ben opens Sofia's avatar on his board → he sees the same profile, with both devices and "Human · Active".
##### Variations
- Sofia clicks **Continue as Sofia Marchetti** on the desktop (the personal email) and then joins with a new Human invitation from Ben. The server refuses it with `IDENTITY_MISMATCH` "Existing human identity requires My device proof" only if her identity ID were already in the project. A *new* identity has a different ID, so she would join as a second Sofia (see STORY-018).
- Ben sends a My device invitation instead of a Human one by mistake. If Sofia pasted it on her identity step, the client would accept it, and she would adopt **Ben's** identity. Nothing in the UI shows whose identity a My device invitation carries before linking.
##### Edge Cases
- Ben's Human invitation was pasted by someone else first: `INVITE_USED` "This invitation was already used by someone else. Ask for a new one."
- Ben revoked the invitation before she used it: `REVOKED` + "This invitation or membership was revoked. Ask for a new invitation."
- Sofia's laptop client stopped during **Joining…**: `CLIENT_UNREACHABLE` "The local Pardner client did not respond. Check that it is still running, then retry." + "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry."
- Redundancy: invitation purpose copy appears in the Invite menu detail, the dialog title and body, the setup prompt's first sentence, and the history row label ("My device"). The refusal messages on the Link page restate the same rules a third way.

---

### Start, join and switch projects


Source of truth for this topic: `ui-prototype/src/ClientApp.jsx` (Welcome 199-241, JoinForm 160-197, ProjectSwitcher 286-306, ProjectView 449-555, app shell 49-98), `ui-prototype/src/client-api.js` (syncLabel 121-128, invitationPurpose 37-46, CLIENT_UNREACHABLE 57-59), `lib/client-projects.js` (createProject 27-44, joinProject 45-108), `lib/client-invites.js` (invitationData 7-17, redeem 60-122), `lib/client-registry.js:44-61` (idempotent `attempt`), `lib/client-service.js` (session 162-168, projectView 154-161, binding 47-55, revocation 74-140, status map 401-414), `lib/client-cli.js:126-135`, `lib/onboarding-invitation.js`.

Cross-surface facts the stories below rely on:
- **Where the sync label appears.** The same project sync state shows on three surfaces:
  - the switcher's `menu-detail` (`syncLabel(project.status)`, ClientApp.jsx:296)
  - the board header SaveStatus (Pardner.jsx:133-150)
  - `pardner client list` / `client status` JSON (`projects[].status`)
- **The switcher can be stale.** It reads `session.projects`. That list is refreshed only at sign-in, after a successful Start or Join (ClientApp.jsx:95), and when the Invite dialog closes (ClientApp.jsx:553). The 15 s project poll updates `details` only. So switcher labels for non-current projects can be stale, and so can the list of projects itself.
- **Pending state is split across stores.** "Unconfirmed change" reads sessionStorage `pardner:{projectId}:{actorId}:pending` (ClientApp.jsx:283). That is the same record behind the board notice "A request is awaiting confirmation." / **Retry saved request** (Pardner.jsx:562-564). It is per tab. The last project is kept in localStorage `pardner:client:last-project`, which is per browser profile. The pending create/join keys live in sessionStorage, which is also per tab.
- **Hints are not join-only.** `Failure` (ClientApp.jsx:40-47) attaches a `JOIN_HINTS` line to ANY error whose code matches. That includes Start project errors and the "This project didn't open." screen.

#### STORY-024: First project from the Welcome page
*(was projects-start-join-switch/STORY-001)*
**Type**: short
**Topic**: Start, join and switch projects
**Persona**: Priya Natarajan, staff engineer. She has just confirmed her identity on her MacBook ("This device: priya-mbp"). Her client was started by Claude Code with `--harness anthropic-claude-code --name Wren`.
**Goal**: Create her first shared board, "Checkout rewrite".
**Preconditions**: The browser is signed in and the identity is confirmed. `session.projects` is empty. No `pardner:client:pending-create` exists.
**Ideal path**: 2 — type a name, press Start (the mode toggle already defaults to Start).
**Alternate paths**:
- CLI: `pardner client create --name "Checkout rewrite" --operation-id create-checkout`, then `pardner client open` to see it.
- The control runtime's first run creates `config.projectName` with a stable operation ID (scripts/control-runtime.py).
**See also**: STORY-033, STORY-034
##### Steps
1. Priya lands after **Continue as Priya Natarajan** → She sees the heading **Welcome, Priya Natarajan** (no project yet, ClientApp.jsx:224), the lead "A project is a shared board for you, the people you invite and your agents.", and the group "Choose how to begin" with **Start a project** pressed.
2. She reads the helper text → "You join as Priya Natarajan. Wren (Claude Code) is registered as your agent. It shows as offline until it connects, and as active only while it reports work." (ClientApp.jsx:232-234).
3. The **Project name** field has autofocus. She types "Checkout rewrite" → The field accepts up to 120 characters (maxLength).
4. She clicks **Start project** → The button shows **Starting…**. Before the request is sent, `pardner:client:pending-create` is written with `{name, operationId}`.
5. The server creates a hub project and starts its runtime → `pending-create` is cleared, the session refreshes and the project is selected. `pardner:client:last-project` is set to the new ID.
6. ProjectView shows "Opening project…", then the board → The header shows "Pardner" and the switcher button (accessible name "Project: Checkout rewrite. Switch project"). The avatar stack shows "Wren, agent, offline", and **You: Priya Natarajan** appears.
##### Variations
- No setup agent name reported: the text is just "You join as Priya Natarajan.".
- Unknown harness ID: the raw harness ID is shown in parentheses, e.g. "(my-harness)" (`harnessLabel`, client-api.js:117).
- Keyboard only: type the name and press Enter. The form submits, so there are no extra steps.
##### Edge Cases
- Whitespace-only name: the client sends `name.trim()` = "". The server responds "Supply a project name" (400). This clears pending-create (4xx). Note that the HTML `required` attribute accepts spaces, so the error comes from the server, not the browser.
- 4xx/5xx asymmetry: the server allows up to 200 characters (client-projects.js:31) but the UI caps at 120. A CLI-created 180-character name is displayed unclipped in the switcher.
- Confusing resume notice: the notice "An earlier attempt to start "Checkout rewrite" didn't confirm…" can flash during the first **Starting…** render. `pendingCreate` is re-read from sessionStorage on every render, and it was written just before sending (ClientApp.jsx:200, 210, 231). The user may think they are retrying when they are not.
- Duplicate names: project names are not unique, so starting "Checkout rewrite" twice yields two identically named switcher entries.

---

#### STORY-025: Start project when the response is lost, and the resumed attempt
*(was projects-start-join-switch/STORY-002)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Marcus Bell, a solo founder. He runs Pardner on a laptop that sleeps aggressively.
**Goal**: Get exactly one "Launch plan Q1" project even though the first Start request never answered.
**Preconditions**: Identity is confirmed. The local client service is slow or unreachable during the first click.
**Ideal path**: 3 — type a name, press Start, press Start again after the failure. The same operation ID makes the retry safe.
**Alternate paths**:
- CLI retry with the SAME ID: `pardner client create --name "Launch plan Q1" --operation-id launch-q1`. The registry `attempt` returns the stored result (client-registry.js:52).
**See also**: STORY-035, STORY-067
##### Steps
1. Marcus types "Launch plan Q1" and clicks **Start project** → **Starting…** appears, and `pending-create` = `{name:"Launch plan Q1", operationId:X}` is stored.
2. The laptop sleeps and the fetch times out after 10 s (client-api.js:70) → A Failure appears: "The local Pardner client did not respond. Check that it is still running, then retry." The hint "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry." is added, because CLIENT_UNREACHABLE is in JOIN_HINTS even though this is a create. pending-create is KEPT, because the error has no HTTP status.
3. The notice "An earlier attempt to start "Launch plan Q1" didn't confirm. Starting it again resumes that attempt." is visible above the agent text.
4. Marcus hesitates and reloads the tab to "see if it worked" → The page shows "Opening your local client…", then the Welcome page again. The name field is pre-filled "Launch plan Q1" from pending-create, and the notice is still there (same tab, so sessionStorage survives).
5. He clicks **Start project** → The same operation ID X is sent. If the server had finished, it returns the stored project, with no duplicate. Otherwise it resumes the job.
6. Success → pending-create is cleared and the board opens as "Project: Launch plan Q1. Switch project".
##### Variations
- He edits the name to "Launch plan Q1 (v2)" before retrying: the attempt name differs, so a NEW operation ID is minted (ClientApp.jsx:209). This can produce two projects if the first one actually completed. The notice still names the old attempt until submit.
- He opens a new tab instead of reloading: sessionStorage is per tab, so the new tab shows an empty name field and no notice. Retrying there creates a second project if the first completed.
- CLI without `--operation-id`: client-cli.js:126 defaults to `randomUUID()`. A naive retry therefore creates a duplicate project, and the CLI gives no warning.
##### Edge Cases
- The service is stopping: `SERVICE_STOPPING` 503 keeps pending-create, so a retry resumes.
- `IDENTITY_REQUIRED` "Confirm your identity before creating a project" (400) clears pending-create. In the browser this is only reachable after a race, because the IdentityStep gates Welcome.
- Same operation ID reused with a different name (possible only via the CLI): `OPERATION_ID_REUSED` "Operation ID belongs to different input" (409).
- Runtime fails to start (`LOCAL_SERVICE_UNAVAILABLE` "Project runtime failed to start; retrying after Ns", 503): pending-create is kept. The registry already has the entry in state `starting`, which is hidden from `session.projects` until `ready`.

---

#### STORY-026: Join a teammate's project by pasting the invitation prompt
*(was projects-start-join-switch/STORY-003)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Diego Alvarez, a contractor. Priya sent him a Human invitation for "Checkout rewrite" over Signal. His own client runs on his Linux workstation, and Priya's hub is reachable at `https://pardner.priya.dev`.
**Goal**: Join "Checkout rewrite" under his own identity.
**Preconditions**: Diego's identity is confirmed, and he has one project of his own ("Homelab"). The invitation was issued less than 24 h ago and is unused.
**Ideal path**: 3 — open Start or join, choose Join, paste and submit (the switcher entry plus toggle could arguably be one step).
**Alternate paths**:
- First-run Welcome page (no projects): **Join a project** is directly there.
- CLI: save the prompt to a file, then run `pardner client join --invitation-file ~/private/checkout.txt --operation-id join-checkout`. Usually his agent does this, following the prompt text "join with: pardner client join --data CLIENT_DIR --invitation-file FILE --operation-id STABLE_ID" (onboarding-invitation.js:19).
**See also**: STORY-034, STORY-036, STORY-041
##### Steps
1. Diego opens the switcher on "Homelab" → The `menu` "Projects" lists "Homelab — Saved locally · synced", then a separator and **Start or join a project…**.
2. He chooses **Start or join a project…** → The heading **Start or join a project** appears (not "Welcome", because a project exists), with **Start a project** pressed by default and a **Back to Homelab** button at the bottom.
3. He clicks **Join a project** → The textarea **Invitation** appears, with placeholder "Paste the invitation or setup prompt you were sent" and the hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you."
4. He pastes the whole Signal message, which starts "Join project "Checkout rewrite" with my own identity…" and ends with a `pardner-invite-v1.…` line → It is accepted. The server extracts the single envelope line (onboarding-invitation.js:3-8).
5. He clicks **Join project** → The button shows **Joining…**. The SHA-256 of the trimmed text and an operation ID are saved to `pardner:client:pending-join`.
6. His client enrols with Priya's hub (15 s timeout), registers the replica and starts the runtime → The invitation is cleared, the session refreshes, the project is selected and last-project is updated.
7. The board opens as "Project: Checkout rewrite. Switch project" → SaveStatus may show "Saved locally · waiting for hub" until replica sync settles. Priya, Wren and Diego's own setup agent appear in the avatar stack.
8. He reopens the switcher → Both projects are listed, with "Checkout rewrite" checked.
##### Variations
- He pastes only the raw `pardner-invite-v1.…` line: this works the same way ("The Join form accepts either the complete prompt or the raw invitation", docs/PARDNER-CLIENT.md).
- He changes his mind at step 3: **Back to Homelab** returns him without changes. Toggling back to **Start a project** clears any error (`setFailure(null)`).
- CLI join from an agent with a different harness: add `--harness openai-codex --name Gamma --model gpt-5 --managed-by T3`. Here `--name` is the AGENT name, while on `client create` `--name` is the PROJECT name. The same flag means different things.
##### Edge Cases
- Message contains two invitations (for example a forwarded thread): the envelope regex matches twice, so the response is `INVALID_INVITATION` "Paste one complete Pardner invitation" with the hint "Check that you pasted the whole invitation, exactly as it was sent." That hint is misleading here.
- Prompt longer than 32768 characters: the same INVALID_INVITATION response.
- Already a member: if Diego is already a member of this project on another device, the hub refuses with `IDENTITY_MISMATCH` "Existing human identity requires My device proof", plus the IDENTITY_MISMATCH hint that explains My device versus Human.
- Duplicate information: the switcher label and the header SaveStatus both report "waiting for hub", so the same information appears on two surfaces.

---

#### STORY-027: Join errors: expired, used, revoked, and pasted wrong
*(was projects-start-join-switch/STORY-004)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Hannah Okafor, a product designer, joining "Mobile onboarding v3". Several invitation mishaps happen in sequence.
**Goal**: Understand each refusal and get into the project.
**Preconditions**: Hannah's identity is confirmed and she is on **Start or join a project** → **Join a project**.
**Ideal path**: 3 — with a valid invitation: open Join, paste, submit.
**Alternate paths**:
- `pardner client join` returns the same codes in the JSON envelope `{success:false,error:{code,message}}`, without the friendly hint text.
**See also**: STORY-016, STORY-041, STORY-124
##### Steps
1. She pastes the invitation from yesterday morning's email and clicks **Join project** → **Joining…**, then the Failure "Invitation expired" plus the hint "Ask for a new invitation; this one has expired." (`INVITE_EXPIRED`, 410). pending-join is cleared because the error is a non-retryable 4xx.
2. She asks Tom, the project creator, for a new one. Tom accidentally sends the one he already gave Raj, which Raj had redeemed → She sees "Invitation belongs to a different recipient" and the hint "This invitation was already used by someone else. Ask for a new one." (`INVITE_USED`, 409).
3. Tom creates a fresh invite, realises it went to the wrong chat and revokes it, but she pastes it anyway → She sees "Invitation revoked" and the hint "This invitation or membership was revoked. Ask for a new invitation." (`REVOKED`, 403).
4. On the next one she copies only half the line out of a narrow chat bubble → She sees "Paste one complete Pardner invitation" (or "Invalid invitation"/"Incomplete invitation") and the hint "Check that you pasted the whole invitation, exactly as it was sent." (`INVALID_INVITATION`).
5. She re-copies the whole message and submits → The join succeeds and "Project: Mobile onboarding v3. Switch project" is shown.
##### Variations
- Tom sends a **My device** invitation by mistake: there is no client-side refusal on this form (the Welcome JoinForm has no `accept`, unlike Link this device, ClientApp.jsx:239 versus 136-141). The hub refuses with `IDENTITY_MISMATCH` "Destination already belongs to another identity" plus the IDENTITY_MISMATCH hint. The invitation stays usable by Tom ("validates a recipient before binding").
- Tom sends an **Agent** invitation: the same IDENTITY_MISMATCH. If Hannah pastes HER OWN Agent invitation into her own client, the join would enrol her agent as an extra Actor. The Join page gives no warning that this is an agent invitation.
##### Edge Cases
- Tampered or garbled secret that still decodes: the hub answers `AUTH_REQUIRED` "Invalid invitation" (client-invites.js:64), and the local service maps it to 401. The browser shows "Invalid invitation" with no hint. The attempt is treated as retryable, so pending-join is kept, but the user is NOT sent to the signed-out screen (Welcome does not handle AUTH_REQUIRED).
- Hub served over plain HTTP on a non-loopback host: the response is `INVALID_INVITATION` with the message "Remote invitations require HTTPS; use a secure private route". It is followed by the generic "Check that you pasted the whole invitation…" hint, which contradicts the real cause.
- Revocation landing mid-enrolment: the response is `REVOKED` "Invitation or device revoked during enrollment".
- Duplicate wording: hint text for IDENTITY_MISMATCH and DEVICE_INVITATION_REQUIRED overlaps the Link-this-device refusals (ClientApp.jsx:137-139), so similar explanations exist in two places.

---

#### STORY-028: Hub offline during join, then resuming after reload
*(was projects-start-join-switch/STORY-005)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Sam Whitaker, joining Lena's "Data pipeline audit". Lena's laptop (the hub) is closed on a train.
**Goal**: Finish the join without burning the one-time invitation.
**Preconditions**: Sam's identity is confirmed. The invitation is valid. The hub is unreachable.
**Ideal path**: 3 — paste, submit, and retry once the hub is back. Ideally there would be no re-paste.
**Alternate paths**:
- CLI: rerun `pardner client join --invitation-file inv.txt --operation-id join-audit` with the same ID. The recipient proof is stored in the registry attempt, so the retry reuses it.
**See also**: STORY-042, STORY-139
##### Steps
1. Sam pastes the prompt and clicks **Join project** → After up to 15 s (remoteJson timeout) he sees "Project authority unavailable; retry this attempt" and the hint "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." (`HUB_UNAVAILABLE`, 503). pending-join is KEPT. The textarea still holds the text.
2. He clicks **Join project** again while the hub is still down → The same failure appears. The same operation ID is reused because the digest matches.
3. Impatient, he reloads the tab → He lands on his current project, or on Welcome if he has none. On **Join a project** the textarea is EMPTY. Unlike Start, there is no "earlier attempt didn't confirm" notice for joins.
4. He hesitates and finds the Signal message again. He re-pastes it and submits once Lena's laptop is back online → The digest matches `pending-join.invitationHash` and the identity ID matches, so the stored operation ID is reused. The hub sees the same recipient proof and enrols him.
5. Success → The board for "Data pipeline audit" opens.
##### Variations
- He re-pastes with an extra trailing newline: the text is trimmed before hashing, so the attempt still resumes.
- He re-pastes the raw envelope line instead of the full prompt: the hash differs, so a NEW operation ID and new recipient proof are used. If the first attempt had bound the invitation at the hub, he gets `INVITE_USED` and must ask for a new invitation.
- `crypto.subtle` unavailable: the attempt lives only in memory (`joinAttempt` ref), so a reload loses resumability.
##### Edge Cases
- Invitation without a public URL: the hub had no `--public-url`, so the endpoint is `http://127.0.0.1:PORT`. From another computer that loopback fetch fails and is reported as `HUB_UNAVAILABLE`, telling him to "retry when it is back", but retrying will never succeed.
- Existing project still registering: when joining a project that already exists locally (for example adding another harness), the response is `REGISTRATION_PENDING` "Actor registration is not saved locally yet; retry this join" (503, retryable) after an 8 s wait (client-projects.js:92-99).
- Hub returns another project: `WORKSPACE_MISMATCH` "Enrollment returned another project" (409), which clears pending-join.
- Client service stopped: `CLIENT_UNREACHABLE` plus the hint "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry." (no status, so retryable).

---

#### STORY-029: Switching between projects with the header switcher (mouse and keyboard)
*(was projects-start-join-switch/STORY-006)*
**Type**: short
**Topic**: Start, join and switch projects
**Persona**: Aisha Rahman, engineering manager, in three projects: "Checkout rewrite", "Hiring loop 2026" and "Infra cost cuts".
**Goal**: Jump from "Checkout rewrite" to "Infra cost cuts" and back.
**Preconditions**: She is on the "Checkout rewrite" board. All three projects are ready.
**Ideal path**: 2 — open the switcher, pick the project.
**Alternate paths**:
- Keyboard: focus the switcher, press ArrowDown to open, use Arrow/Home/End to move, Enter to choose.
- Indirect: **Start or join a project…** → **Back to {project}** returns only to the current project, not another one.
- There are no deep links (the URL never encodes the project).
**See also**: STORY-032, STORY-074
##### Steps
1. She clicks the `h1` switcher "Checkout rewrite ⌄" (aria-label "Project: Checkout rewrite. Switch project") → The menu "Projects" opens. Focus lands on the checked item "Checkout rewrite".
2. She scans the items → Each shows a name plus a sync detail: "Checkout rewrite — Saved locally · synced", "Hiring loop 2026 — Saved locally · waiting for hub", "Infra cost cuts — Saved locally · synced", then a separator and **Start or join a project…**.
3. She clicks "Infra cost cuts" → The menu closes, `last-project` is updated and ProjectView remounts (keyed by ID). She sees "Opening project…", then the Infra board with that project's own filters and view.
4. She presses ArrowDown on the focused switcher → The menu opens with focus on "Infra cost cuts". She presses Home to reach "Checkout rewrite" and presses Enter.
5. She is back on Checkout → Any task panel and Edit-task draft she left open are restored (draft in sessionStorage per project and Actor; test/client-onboarding-ui.test.js:376-380).
##### Variations
- Choosing the already-checked project: the menu just closes and nothing reloads (`if (project.id !== current.id)`).
- Escape closes the menu and returns focus to the switcher. Tab closes the menu without refocusing. A click outside closes it.
- She has only one project: the menu still opens, showing that project and **Start or join a project…**.
##### Edge Cases
- Stale labels: "Hiring loop 2026 — waiting for hub" may be stale. The label comes from `session.projects`, captured at sign-in, the last Start/Join or the last Invite dialog close, not from a live poll. A redundancy and freshness candidate: the current project's live SaveStatus can disagree with its own switcher label.
- Identical names: two projects both named "Checkout rewrite" are indistinguishable except by sync detail.
- Narrow window (<760 px): the header wraps. The project name is the only identity cue (pardner.css breakpoints).

---

#### STORY-030: "Unconfirmed change" in the switcher and finding the saved request
*(was projects-start-join-switch/STORY-007)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Ben Kowalski, backend developer. His Wi-Fi drops while he moves "Rotate API keys" to Review in "Security hardening".
**Goal**: Notice that a change is still unconfirmed after switching away, and confirm it.
**Preconditions**: He is in "Security hardening" and "Release 4.2". The local client service briefly stops answering, or its runtime hangs (RUNTIME_TIMEOUT).
**Ideal path**: 3 — see the marker, switch back, press **Retry saved request**.
**Alternate paths**:
- Stay on the board: the notice "A request is awaiting confirmation." with **Retry saved request** (Pardner.jsx:562-564) appears without opening the switcher.
- Reload the same tab: the pending request survives in sessionStorage.
**See also**: STORY-089, STORY-137
##### Steps
1. Ben sets **Status** to Review on "Rotate API keys" → The request fails without a definitive answer. The board shows "A request is awaiting confirmation." **Retry saved request**, and SaveStatus may show "Local service disconnected".
2. He ignores it and switches to "Release 4.2" via the switcher → "Release 4.2" opens normally.
3. Later he opens the switcher → The item reads "Security hardening — Saved locally · synced · unconfirmed change". The sync label may be stale while the pending marker is fresh, because it is read from sessionStorage at render.
4. He hesitates ("synced" and "unconfirmed" seem contradictory), then picks "Security hardening" → The board opens with the same "A request is awaiting confirmation." notice.
5. He clicks **Retry saved request** → The operation is resent with its original operation ID. On confirmation the pending record clears.
6. He opens the switcher again → The " · unconfirmed change" suffix is gone.
##### Variations
- Different tab: Ben opens Pardner in a second tab. The marker is absent there, because sessionStorage is per tab, even though the change is unconfirmed in the first tab.
- Definitive error on retry (`STALE_UPDATE`, `NOT_FOUND`, `OPERATION_ID_REUSED`…): the pending record is cleared (Pardner.jsx:465-476) and the marker disappears.
- Ben tries a new edit before retrying: "Resolve the saved request before starting another change."
##### Edge Cases
- Storage blocked: sessionStorage throws, so `hasPendingRequest` returns false and the marker never shows. The board warns "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes."
- Redundancy: the same pending fact appears in the board notice, the **Retry saved request** button and the switcher suffix. The switcher is the only place it shows for a non-current project.

---

#### STORY-031: "This project didn't open." recovery
*(was projects-start-join-switch/STORY-008)*
**Merged in**: resilience-recovery/STORY-010 — Sofia Alvarez entering a failing "Data Pipeline" from the switcher; its unique variations are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Olivia Chen, data scientist. Her last project was "Churn model v2". Its runtime fails to start after a disk-full event.
**Goal**: Recover, or move on to another project.
**Preconditions**: `last-project` = Churn model v2. `GET /projects/:id` fails, for example with `LOCAL_SERVICE_UNAVAILABLE`, `RUNTIME_TIMEOUT` or `CLIENT_UNREACHABLE`.
**Ideal path**: 1 — **Retry** once the cause clears (or 1 click on **Open another project** plus a switcher pick).
**Alternate paths**:
- **Open another project** → the Start or join page (only **Back to Churn model v2** is offered there, NOT a list of other projects), so reaching another project means going back into the failing one.
- Switcher: not rendered on this screen, because the header only appears once the board loads.
- CLI: `pardner client show --project ID` / `client list` to diagnose.
**See also**: STORY-143
##### Steps
1. Olivia runs `pardner open` → The page shows "Opening your local client…", then `h1` "Churn model v2" and "Opening project…".
2. The load fails → The status changes to "This project didn't open." The Failure shows the server message, e.g. "Project runtime failed to start; retrying after 8s", with buttons **Retry** and **Open another project**.
3. She clicks **Retry** immediately → It fails again with the same screen, because the backoff has not elapsed.
4. She clicks **Open another project** → The heading **Start or join a project** appears with **Back to Churn model v2**. She expects to see her other projects here, and finds none.
5. She is confused. She clicks **Back to Churn model v2** → She is back on the failing screen, which still has no switcher.
6. She frees disk space, waits and clicks **Retry** → The project loads and the board appears.
##### Variations
- `CLIENT_UNREACHABLE`: the screen adds the hint "Your local Pardner client may have stopped. Ask your agent to reopen it, then retry." She runs `pardner open`, then clicks **Retry**.
- The project loads, but the board socket fails: a different screen appears, "The project board isn't reachable yet." with **Retry connection** (Pardner.jsx:490-492).
- `AUTH_REQUIRED` during load: she goes straight to the signed-out screen ("This browser isn't signed in to your local Pardner client.", **Check again**).
- *(merged)* Entering from the switcher instead of a launch: the failing project's item already reads "Project service unavailable". Selecting it anyway shows "Opening project…", then "This project didn't open." with "Project runtime failed to start; retrying after 4s", **Retry** and **Open another project**. `pardner client status` reports the same state.
##### Edge Cases
- Revoked membership on a replica: the response is `REVOKED` "Project access revoked; local data remains saved". The registry marks the project `revoked`, which removes it from future `/session` lists. The REVOKED hint "This invitation or membership was revoked. Ask for a new invitation." is shown. **Retry** then yields "Project membership is not available". After **Open another project**, the stale switcher may still list the project until the session refreshes.
- Last project gone: on reload, if `last-project` points at a project no longer in `session.projects`, the app silently falls back to `projects[0]`. If there are none, it shows **Welcome, {name}**.
- Partial redundancy: the "Open another project" label promises a chooser, but it only offers Start/Join.

---

#### STORY-032: Last-project memory across reloads and sign-ins
*(was projects-start-join-switch/STORY-009)*
**Type**: short
**Topic**: Start, join and switch projects
**Persona**: Raj Mehta, who works in "Release 4.2" most days and occasionally in "Docs revamp".
**Goal**: Have Pardner reopen where he left off.
**Preconditions**: Two ready projects. He last chose "Docs revamp" in this browser profile.
**Ideal path**: 1 — `pardner open`, landing directly on the last project.
**Alternate paths**: none found (no URL deep link; `client open` has no `--project` flag).
**See also**: STORY-029
##### Steps
1. Raj runs `pardner open` the next morning → The grant link opens. "Opening your local client…" is shown, then "Opening project…" for "Docs revamp" (`localStorage['pardner:client:last-project']`).
2. He switches to "Release 4.2" → `last-project` is updated.
3. He closes the browser and later runs `pardner open` again → "Release 4.2" opens.
##### Variations
- Different browser or profile (Safari versus Chrome): there is no memory, so `projects[0]` is used (registry order), which may not be the one he expects.
- Two windows on different projects: the last one switched wins for the next launch.
- After a successful Start or Join, the new project becomes the last project.
##### Edge Cases
- localStorage blocked: the write is silently ignored ("optional convenience"), so he always lands on the first project.
- Not per-person: `last-project` is not keyed by identity or client. A browser that later signs into a different client data directory can carry over an ID that does not exist there, and falls back silently.

---

#### STORY-033: Agent-led setup with `client create` and `client join`
*(was projects-start-join-switch/STORY-010)*
**Type**: medium
**Topic**: Start, join and switch projects
**Persona**: Codex (openai-codex), acting for Felix Wagner, sets up his client headlessly before Felix ever opens a browser.
**Goal**: Create Felix's "Firmware OTA" project and join Nadia's "Sensor fleet" from a pasted invitation file, then hand Felix a browser.
**Preconditions**: The client is serving (`pardner client serve --harness openai-codex --name Cobalt`). `client-connection.json` holds the operator token.
**Ideal path**: 4 — run `identity`, `create`, `join`, `open`.
**Alternate paths**: the browser IdentityStep → Welcome → Start/Join (STORY-024/STORY-026). The control runtime's first run does the same with config values.
**See also**: STORY-022, STORY-123
##### Steps
1. `pardner client create --name "Firmware OTA" --operation-id create-ota` before the identity exists → `{success:false,error:{code:"IDENTITY_REQUIRED",message:"Confirm your identity before creating a project"}}`, with stderr `IDENTITY_REQUIRED: …`.
2. `pardner client identity --name "Felix Wagner" --email felix@wagner.dev --operation-id id-felix` → The identity is saved.
3. Re-run the create command with the same ID → `{project:{id, name:"Firmware OTA", role:"hub", status:{…}}}`.
4. Codex re-runs the same command after a network glitch → The same project is returned (idempotent attempt), with no duplicate.
5. It saves Nadia's prompt privately and runs `pardner client join --invitation-file ~/.private/sensor-fleet.txt --operation-id join-sensor-fleet` → `{project:{role:"replica", name:"Sensor fleet", …}}`.
6. `pardner client list` → `projects[]` shows both projects with `status`, which carries the same data as the browser's switcher labels.
7. `pardner client open` → The browser opens on `projects[0]`, since no last-project exists in this browser yet. Felix uses the switcher for the other project.
##### Variations
- `client join` without `--invitation-file`: "Supply --invitation-file with private invitation data".
- Adding another harness to an existing joined project: `client join … --harness anthropic-claude-code --name Gamma --model claude-opus-5-5 --managed-by T3` merges into the existing local project entry.
- Agent-only device (an Agent invitation joined before any identity): `humanAuthority=false` and human browser sessions are revoked. `client open` afterwards cannot produce a human board ("Agent-only device has no human browser authority").
##### Edge Cases
- Missing `--operation-id`: a random UUID is used for each run, so retrying `create` makes duplicate projects, and retrying `join` with a new proof can hit `INVITE_USED`.
- Reused `--operation-id create-ota` with a different `--name`: `OPERATION_ID_REUSED` "Operation ID belongs to different input".
- Malformed ID (spaces or >128 characters): "Supply a stable operationId".
- Client not running: `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve".

---

#### STORY-034: Full onboarding of a two-person team across two computers
*(was projects-start-join-switch/STORY-011)*
**Type**: long
**Topic**: Start, join and switch projects
**Persona**: Lena Fischer (hub, MacBook, Claude Code agent "Wren") and Tomás Ruiz (Linux desktop, Codex agent "Cobalt") start "Payments ledger migration" together. Lena also keeps "Personal backlog".
**Goal**: Both people are on one shared board, each can switch to their other projects, and both recover from one hiccup.
**Preconditions**: Lena's client was started with `--public-url https://lena.tailnet.example`. Both browsers are signed in and both identities are confirmed. Lena already has "Personal backlog".
**Ideal path**: 9 — Lena: switcher → Start or join → name → Start → Invite ▸ Human → Create → Copy. Tomás: paste → Join.
**Alternate paths**:
- Tomás's agent runs `client join --invitation-file`.
- Lena runs `pardner client invite --project ID --purpose human --output-file inv.txt --operation-id inv-tomas`.
- Lena creates the project via `client create`.
**See also**: STORY-023, STORY-026, STORY-043, STORY-139
##### Steps
1. Lena opens the switcher on "Personal backlog" → She sees "Personal backlog — Saved locally · synced" and **Start or join a project…**.
2. She chooses **Start or join a project…** → **Start or join a project** appears, with **Back to Personal backlog**.
3. She types "Payments ledger migraton" (typo) and catches it before submitting. She fixes it to "Payments ledger migration" → There is no rename feature later, so this matters.
4. She clicks **Start project** → **Starting…**, then the board "Project: Payments ledger migration. Switch project", with Wren shown offline.
5. She opens **Invite ▾** → **Human** ("A person and their agent") → The dialog "Invite a person" opens.
6. She clicks **Create invitation**, then **Copy invite** → "Copied. Treat it like a password and send it privately; it works once."
7. She closes the dialog → `refreshSession` runs, so her switcher labels update as a side effect.
8. She DMs Tomás the prompt.
9. Tomás, on his board "Homelab", opens the switcher → He chooses **Start or join a project…**, then **Join a project**.
10. He pastes the prompt by mistake into **Project name** on the Start tab (the default) and clicks **Start project** → It creates a project named with the start of the prompt text, cut to 120 characters by maxLength: "Join project "Payments ledger migration" with my own identity. Set up or reuse my local client, register yourself as". Oops.
11. Tomás now has a junk project. There is no delete or rename (discovery: "No rename or delete"). It sits in his switcher permanently.
12. He opens the switcher, picks **Start or join a project…**, clicks **Join a project** this time and pastes into **Invitation** → **Joining…**.
13. Lena's hub validates and enrols him → His board opens as "Payments ledger migration" with SaveStatus "Saved locally · waiting for hub", then "Saved locally · synced".
14. Tomás opens the switcher → He sees three items: Homelab, the junk project, and Payments ledger migration (checked).
15. Lena, still on the board, sees Tomás's avatar appear within the 15 s project poll → In the avatar stack she sees "Tomás Ruiz, human, active" and his agent Cobalt.
16. Lena's laptop sleeps. Tomás makes an edit → His SaveStatus shows "Saved locally · waiting for hub" and he keeps working. "Remote presence unavailable" appears in his header.
17. Tomás switches to Homelab and back → Each project keeps its own state. In his switcher the Payments label may still show an older status (stale `session.projects`).
18. Lena wakes the laptop → Replica sync resumes. Tomás's SaveStatus returns to "Saved locally · synced".
19. Next morning Tomás runs `pardner open` → It lands on the last project he selected (Payments ledger migration).
##### Variations
- Tomás opens the link Lena sent a second time after joining: the invitation is now redeemed, so he gets `INVITE_USED` or a resumed result depending on the stored attempt. If the same tab still holds a matching pending-join, it resumes harmlessly.
- Lena's client had no `--public-url`: Tomás gets `HUB_UNAVAILABLE`, which looks retryable but is never fixable without a new invitation.
- Lena uses the CLI `client invite` instead of the dialog: the written file contains the full `invitationPrompt`.
##### Edge Cases
- Pasting the prompt into the wrong field (step 10): nothing on the Start tab detects a `pardner-invite-v1.` payload. The Link-this-device form detects purposes, but Welcome's Start form does not.
- Tomás pastes his own Human invitation into Lena's (hub) client: `IDENTITY_MISMATCH` "Existing human identity requires My device proof" or "Device belongs to another identity".
- Lena later revokes Tomás (`client revoke --kind member`, CLI only): on his next policy check his replica marks the project revoked. Opening it shows "This project didn't open." with the REVOKED hint, and it disappears from his switcher after the next session refresh.

---

#### STORY-035: Two tabs racing the same Start and Join
*(was projects-start-join-switch/STORY-012)*
**Type**: short
**Topic**: Start, join and switch projects
**Persona**: Jordan Lee, who habitually duplicates tabs.
**Goal**: Start "Q3 roadmap" without creating it twice.
**Preconditions**: Identity is confirmed. Two Pardner tabs are both on the Start or join page.
**Ideal path**: 2 — name, Start.
**Alternate paths**: none found beyond CLI create.
**See also**: STORY-019, STORY-025
##### Steps
1. In tab A, Jordan types "Q3 roadmap" and clicks **Start project** → **Starting…** with operation ID A.
2. Unsure, he switches to tab B, types "Q3 roadmap" and clicks **Start project** → Tab B has its own sessionStorage, so it mints operation ID B.
3. Both succeed → Two projects named "Q3 roadmap" exist. Each tab shows its own. Opening either switcher (after a refresh) lists both identical names.
##### Variations
- Pasting the same invitation in two tabs: different operation IDs and recipient proofs. One enrols, the other gets `INVITE_USED` "Invitation belongs to a different recipient".
- Same tab double click: the button is `disabled` while busy, so it is safe.
##### Edge Cases
- Tab B was already open: it does not see A's new project in its switcher until a session refresh, for example after an Invite dialog close, a Start or Join, or a reload.

---

### Invitations lifecycle


Sources read: ui-prototype/src/ClientApp.jsx:21-31 (JOIN_HINTS), :308-447 (INVITES, InviteMenu, STATE_LABELS, formatExpiry, InviteDialog), :519, :552-553; ui-prototype/src/client-api.js:36-41, 92-97; lib/client-invites.js (all); lib/client-service.js:204-233 (revoke), :268-292 (replica `/revoke`, `/invites`), :341-344, :366-380 (invite routes), :433 (gatewayUrl); lib/client-cli.js:150-170; lib/onboarding-invitation.js; lib/client-projects.js:51-75; docs/PARDNER-CLIENT.md:62-120; docs/PARDNER-CLI.md:26-28.

Facts the stories depend on:
- **One invitation per dialog open.** `operationId` is a `useRef` created when InviteDialog mounts (ClientApp.jsx:348). Once an invite exists, the **Create invitation** button is replaced by the "New invitation" section (:404-406). To make a second invite you have to **Close** the dialog and choose from the menu again.
- **The history list is shared.** It shows every purpose, whichever menu item opened the dialog. The hub creator sees every invite in the project; anyone else sees only their own (client-invites.js:47-50). Rows show only purpose, state and expiry. They do not show the recipient, the sponsor or when the invite was used.
- **Revoke appears only on rows whose effective state is `issued`** (:440). The server's `revokeFor` does not check state.
- **Expiry text** comes from `formatExpiry` (:332-344). It uses minutes below 90 minutes and hours above, and redraws every 30 s (:362). Invites last 24 h (client-invites.js:35).
- **There is no UI for member, device or agent revocation.** These are CLI only (`client revoke`). The IDs come from `client show --project ID` (actors with `humanId` and `devices`).
- **The issuing client's address goes into the invite.** The envelope endpoint is `gatewayUrl` = `--public-url` or the loopback URL (client-service.js:433). A recipient on another computer then gets `INVALID_INVITATION` "Remote invitations require HTTPS; use a secure private route" (client-invites.js:13).

#### STORY-036: Invite a teammate to a project from the Invite menu
*(was invitations/STORY-001)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Priya Raman, staff engineer. She started the project "Checkout Revamp" on her laptop this morning with Claude Code as her setup agent, and now wants her colleague Marcus Lee to join.
**Goal**: Create a Human invitation and send it to Marcus privately.
**Preconditions**: Priya's client was started with `--public-url https://priya-mbp.tail1234.ts.net`. Her identity is confirmed and "Checkout Revamp" is open in ProjectView. She is the creator (hub).
**Ideal path**: 3 — open Invite, choose Human (which could create the invite at once), Copy invite.
**Alternate paths**: The CLI `pardner client invite --project <id> --purpose human --output-file ~/invites/marcus.txt --operation-id invite-marcus-1` writes the setup prompt to a file (client-cli.js:164-168). Inside the dialog, **Show invite text** plus a manual select-and-copy from the **Invite text** textarea.
**See also**: STORY-026, STORY-041, STORY-046
##### Steps
1. Priya looks for "Invite" in the header, to the right of the avatar stack, and clicks **Invite ▾** → A menu labelled "Invite" opens with three items: **Human** "A person and their agent", **Agent** "Another agent of yours", **My device** "Another computer you use" (ClientApp.jsx:308-315).
2. She pauses on **Agent** because Marcus will bring his own agent, then picks **Human**, since its detail says "A person and their agent" → A modal opens titled "Invite a person", with "Checkout Revamp" under the title, a **Close** button, and the text "For someone joining with their own identity. Their agent sets up their own board connected to this project."
3. She looks at the lower section, **Invitations for this project** → It shows "Loading…" briefly, then "None yet."
4. She clicks **Create invitation** → The button reads **Creating…**. The "New invitation" section then appears with "**Waiting to be used** · Expires in 24 h · Nov 10, 3:42 PM".
5. The history list refreshes and shows one row: "Human · Waiting to be used · Expires in 24 h · Nov 10, 3:42 PM", with a **Revoke** button (aria "Revoke Human invitation").
6. She reads the status line "The invitation stays hidden so it can't be read from a shared screen." and clicks **Copy invite** → It changes to "Copied. Treat it like a password and send it privately; it works once."
7. She pastes into a Slack DM to Marcus. The pasted text is a setup prompt that starts "Join project "Checkout Revamp" with my own identity. Set up or reuse my local client…" and ends with one `pardner-invite-v1.…` line (onboarding-invitation.js:10-20).
8. She clicks **Close** → The dialog closes, focus goes back to **Invite**, and the session refreshes (ClientApp.jsx:553).
##### Variations
- Escape key: `onCancel` closes the dialog the same way as **Close** (:394).
- Priya reopens **Invite → Human** later: the history row is still there, but the new-invitation section is gone. She cannot copy the same invite again from the UI; see STORY-039.
- Non-creator replica human: the same steps work. The request is forwarded to the hub's `/replica/:id/invites` (client-service.js:285-288).
##### Edge Cases
- **Clipboard blocked** (for example a Safari permission denial): the status reads "This browser blocked copying. Use Show invite text and copy it manually." See STORY-038.
- **Client started without `--public-url`**: the invite carries a `http://127.0.0.1:…` endpoint. Nothing warns Priya when she creates it. Marcus's join fails later (STORY-041).
- **Redundancy candidate**: the same state ("Waiting to be used") and expiry text appear twice in one dialog, in the "New invitation" section and in the history row.

---

#### STORY-037: Copy the invite while screen-sharing
*(was invitations/STORY-002)*
**Type**: short
**Topic**: Invitations lifecycle
**Persona**: Diego Alvarez, an engineering manager presenting "Q4 Platform Roadmap" on a Zoom call. He wants to add a contractor without exposing the credential to the call.
**Goal**: Share an invitation without it ever showing on screen.
**Preconditions**: The project is open and Diego is sharing his whole screen.
**Ideal path**: 3 — Invite, Human, Copy invite (with automatic creation).
**Alternate paths**: `client invite … --output-file` in a terminal that is not being shared.
**See also**: STORY-038
##### Steps
1. **Invite ▾** → **Human** → The "Invite a person" dialog opens.
2. **Create invitation** → The state line appears. The invite text is not in the page DOM ("Both stay out of the DOM until revealed", ClientApp.jsx:374-376).
3. **Copy invite** → "Copied. Treat it like a password and send it privately; it works once." Nothing secret is shown.
##### Variations
- Diego clicks **Show invite text** out of curiosity → The warning "Visible on screen. Stop sharing your screen before copying." appears above the textarea. He clicks **Hide invite text** at once (`aria-expanded` toggles).
##### Edge Cases
- Once the text has been revealed on a shared screen, the safe recovery is **Revoke** and a new invite (STORY-039). The UI does not suggest this.

---

#### STORY-038: Copy is blocked, so copy the text by hand
*(was invitations/STORY-003)*
**Type**: short
**Topic**: Invitations lifecycle
**Persona**: Hannah Okafor uses Firefox with strict clipboard permissions. She is inviting her second laptop to "Mobile Payments SDK".
**Goal**: Get the My device invitation onto her clipboard.
**Preconditions**: The project is open and `navigator.clipboard.writeText` rejects.
**Ideal path**: 4 — Invite, My device, Create, Copy (where copying works).
**Alternate paths**: The CLI `client invite --purpose device --output-file`.
**See also**: STORY-015
##### Steps
1. **Invite ▾** → **My device** → The dialog is titled "Add one of your devices": "For another computer you use. It links your existing identity rather than creating a new person."
2. **Create invitation** → "Waiting to be used · Expires in 24 h · …".
3. **Copy invite** → The status reads "This browser blocked copying. Use Show invite text and copy it manually."
4. **Show invite text** → A warning and a read-only **Invite text** textarea appear (5 rows, spellcheck off).
5. She clicks into the textarea → `onFocus` selects all of it (ClientApp.jsx:424-425). She presses Cmd+C.
6. **Hide invite text**, then **Close**.
##### Variations
- She selects only part of the prompt with the mouse after the auto-select. A partial copy that leaves out the `pardner-invite-v1.` line fails on the other side with `INVALID_INVITATION` "Paste one complete Pardner invitation".
##### Edge Cases
- The text she copies is the full setup prompt, not just the raw envelope (`setupPrompt ?? invitation`, :376). Both are accepted by **Join project** and by **Link this device**.

---

#### STORY-039: Revoke a mistaken invitation and create a new one
*(was invitations/STORY-004)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Priya Raman (creator of "Checkout Revamp"). She pasted a Human invite into the #checkout-general channel instead of the DM to Marcus.
**Goal**: Kill the leaked invite at once and send Marcus a new one.
**Preconditions**: The invite from STORY-036 is still `issued` and Priya has closed the dialog.
**Ideal path**: 4 — Invite, Revoke on the row, Create invitation, Copy invite.
**Alternate paths**: **Revoke** in the "New invitation" section, if the dialog is still open from creating it. There is no CLI command for revoking an invitation: `client revoke` covers only `device|agent|member` (client-cli.js:153-156).
**See also**: STORY-043, STORY-046
##### Steps
1. Priya opens **Invite ▾** and hesitates: there is no "Manage invitations" item. She picks **Human** because the leaked invite was a Human one → The dialog opens with **Create invitation** and the history row "Human · Waiting to be used · Expires in 23 h · …".
2. She clicks **Revoke** on the history row → All buttons are disabled while busy. The list reloads and the row reads "Human · Revoked" with no expiry and no button.
3. She clicks **Create invitation** → A new invite is created, because this dialog has a fresh operation ID. The history now has two rows: Revoked and Waiting to be used.
4. **Copy invite** → She sends it to Marcus by DM. Then **Close**.
##### Variations
- **Revoke right after creating**: inside the "New invitation" section, **Revoke** turns the state line into "**Revoked** · Expires in 24 h · …" and shows "This invitation can no longer be used. Create a new one if you still need it." There is no create button in that state (:404-428). Priya has to **Close** and choose **Invite → Human** again to make a replacement.
- **Opening through the wrong item**: she could revoke the Human invite from a dialog opened as **My device**. The history list is the same for every purpose, but **Create invitation** would then make a My device invite by mistake.
##### Edge Cases
- **Someone in the channel redeemed it first**: the row reads "Used" and has no **Revoke**. The stranger is now a member, and the fix is creator-only member revocation (STORY-043).
- **Leaked invite alongside other identical rows**: rows show no creation time and no recipient, so Priya cannot tell which "Human · Waiting to be used" row was leaked except by the expiry time.
- **Revoke after Marcus has already started joining**: a revoke that lands during enrollment wins. Marcus gets `REVOKED`, with the hint "This invitation or membership was revoked. Ask for a new invitation." (client-invites.js:113-118; ClientApp.jsx:23).

---

#### STORY-040: Read invitation states and expiry in the history list
*(was invitations/STORY-005)*
**Type**: short
**Topic**: Invitations lifecycle
**Persona**: Tomás Becker, tech lead of "Data Pipeline Migration". On Tuesday morning he wonders whether the three people he invited on Monday have joined.
**Goal**: Check which invites were used, which expired and which are still waiting.
**Preconditions**: Tomás is the creator and has issued four invites over the last 30 hours.
**Ideal path**: 1 — a people or invite overview reachable with one click.
**Alternate paths**: The **AvatarStack** "People in this project" and the **+N** People dialog show who actually joined. This overlaps with the history list and is a redundancy candidate. `client show --project ID` lists actors as JSON.
**See also**: STORY-046, STORY-049
##### Steps
1. **Invite ▾** → **Human** (any item would do) → The history list loads.
2. He reads the rows:
   - "Human · Used"
   - "Human · Expired" (no expiry text and no button: `effectiveState` turns an expired `issued` invite into `expired`)
   - "Agent · Waiting to be used · Expires in 47 min · Nov 10, 9:15 AM"
   - "My device · Revoked"
3. He keeps the dialog open for a while. Each 30 s tick (:362) updates the minutes. At 0 the row becomes "Expired" and its **Revoke** button disappears.
4. He wants to know *who* used the Human invite. The row doesn't say, so he closes the dialog and checks the avatar stack.
##### Variations
- **Viewed by a non-creator**: someone who isn't the creator sees only the invites they sponsored (client-invites.js:47-50).
- **Opened right after creating**: the new invite shows both in the "New invitation" section and in the list.
##### Edge Cases
- **Missing timestamp**: an `expiresAt` that can't be parsed shows "Expiry not reported" (:336).
- **Ambiguous "Used" label**: "Used" covers both a successful redemption and one that was later followed by member revocation. The label does not show that the member was removed.
- **Unknown state**: an unknown purpose or state falls back to the raw string (`?? invite.purpose`, `?? state`).

---

#### STORY-041: A recipient on another computer redeems a Human invitation (and the loopback trap)
*(was invitations/STORY-008)*
**Type**: long
**Topic**: Invitations lifecycle
**Persona**: Marcus Lee, a backend developer at the same company as Priya (STORY-036). He has never used Pardner and gets her setup prompt by Slack DM on his Linux workstation.
**Goal**: Join "Checkout Revamp" with his own identity.
**Preconditions**: Pardner is installed on Marcus's machine. Two cases: (A) Priya's hub was started without `--public-url`; (B) she restarts it with `--public-url https://priya-mbp.tail1234.ts.net` and sends a new invite.
**Ideal path**: 4 — `pardner open`, Continue as Marcus, Join a project, paste and Join project.
**Alternate paths**: Marcus's agent runs `pardner client join --invitation-file FILE --operation-id STABLE_ID` from the prompt's own instructions, after `pardner client identity` or the browser confirmation.
**See also**: STORY-026, STORY-028
##### Steps
1. Marcus pastes the whole Slack message into Claude Code. The agent asks him to confirm his identity first, since the prompt says "with my own identity".
2. He runs `pardner open` → **Welcome to Pardner** opens, prefilled "Marcus Lee / marcus.lee@acme.dev".
3. **Continue as Marcus Lee** → The **Welcome, Marcus** page has the toggle group "Choose how to begin".
4. He selects **Join a project** → The **Invitation** textarea appears, with the placeholder "Paste the invitation or setup prompt you were sent" and the hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you."
5. He pastes the whole prompt (prose plus envelope) and clicks **Join project** (**Joining…**).
6. Case A: an error appears, "Remote invitations require HTTPS; use a secure private route", with the INVALID_INVITATION hint "Check that you pasted the whole invitation, exactly as it was sent." The hint misleads him into pasting again.
7. He pastes again → The same error. He messages Priya.
8. Priya stops her client and restarts it with `--public-url https://priya-mbp.tail1234.ts.net`. She opens **Invite → Human**, revokes the old row (or leaves it to expire) and creates and copies a new invite.
9. Case B: Marcus clicks **Join project** with the new prompt → The client enrolls with the hub and registers Marcus and his setup agent. "Checkout Revamp" opens as a replica.
10. The header shows the avatar stack with Priya, Marcus and their agents, and **You: Marcus Lee**.
11. Priya's dialog history now reads "Human · Used". Her avatar stack also gains Marcus. This is the same fact on two surfaces.
##### Variations
- **Reload during joining**: the SHA-256 digest of the invitation and the operation ID are kept in `pardner:client:pending-join`, so the attempt resumes without using another invite.
- **Agent path**: `pardner client join --invitation-file ~/.pardner/private/checkout-invite --operation-id join-checkout-revamp`.
##### Edge Cases
- **Join before confirming identity** (CLI): `IDENTITY_REQUIRED` "Confirm your identity before joining".
- **Marcus already a member through another device**: `IDENTITY_MISMATCH` "Existing human identity requires My device proof".
- **Someone else already redeemed it**: `INVITE_USED` "Invitation belongs to a different recipient", with the hint "This invitation was already used by someone else. Ask for a new one."
- **Hub briefly down**: `HUB_UNAVAILABLE`. Retrying the same attempt is safe.
- **Plain HTTP public URL**: a `--public-url http://…` that is not loopback is refused when the hub starts (client-service.js:388-392).

---

#### STORY-042: Non-creator invites from a replica, and the hub is unreachable
*(was invitations/STORY-009)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Marcus Lee, now a member of "Checkout Revamp" through his own client (a replica). He wants to bring in his teammate Sofia Russo.
**Goal**: Issue a Human invite from a replica and manage only his own invites.
**Preconditions**: Marcus is a member and the hub is Priya's laptop.
**Ideal path**: 3 — Invite, Human, Copy.
**Alternate paths**: `pardner client invite --project <id> --purpose human --output-file …`. This is forwarded to the hub the same way (client-invites.js:30).
**See also**: STORY-139
##### Steps
1. **Invite ▾** → **Human** → The history shows only the invites Marcus sponsored ("None yet."). He does not see Priya's.
2. **Create invitation** → The request goes through `/replica/:id/invites` with `action: 'issue'`. The invite's sponsor is Marcus.
3. **Copy invite** and send it to Sofia.
4. The next day Priya's laptop is closed. Marcus opens **Invite → Human** → The history fails to load. A Failure alert shows "Project authority unavailable; retry this attempt" with the hint "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." The list stays at "Loading…".
5. He closes the dialog. Next to the avatars, the header shows "Remote presence unavailable".
##### Variations
- **Priya opens her dialog** (as creator): she sees Marcus's invite to Sofia in her history list and can revoke it (creator override, client-invites.js:51-55).
- **Marcus tries a row he doesn't own** through the API: `FORBIDDEN` "Invitation is owned by another human".
##### Edge Cases
- **Redundancy / clarity**: Priya's history has no "sponsored by" column, so she cannot tell her own invites from Marcus's.
- **Agent-only replica**: an admission with `humanAllowed=false` that tries to issue gets `FORBIDDEN` "Human authority required" (client-service.js:286).
- **HUB_REQUIRED**: hint "This computer can't create invitations for this project yet. Ask the person who started the project, or retry later."

---

#### STORY-043: Creator removes a member who joined from a leaked invite
*(was invitations/STORY-010)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Priya Raman, creator of "Checkout Revamp". An unknown "J. Doe" redeemed the invite she pasted into #checkout-general before she could revoke it.
**Goal**: Revoke J. Doe's membership.
**Preconditions**: J. Doe is an active replica member. Priya has a terminal and the operator token.
**Ideal path**: 2 — the person's profile, then a **Remove from project** action. That action doesn't exist; the CLI takes 2 commands.
**Alternate paths**: CLI only (`client revoke --kind member`). The board has no member-revocation button (discovery "There is no UI for member, device or agent revocation").
**See also**: STORY-044, STORY-140
##### Steps
1. In the browser, Priya opens the avatar **+N** → People dialog → J. Doe's profile. She finds the identity and devices, but no remove action.
2. She opens **Invite → Human** and finds the leaked invite reads "Used" and has no **Revoke** button.
3. Terminal: `pardner client show --project <checkout-id>` → She finds J. Doe's actor and its `humanId`.
4. First try: `pardner client revoke --project <id> --kind member --id <J. Doe actor id> --operation-id revoke-jdoe-1` → `NOT_FOUND` "Admission not found". She used the actor ID, but member matching uses `admission.identity.id` (client-service.js:212).
5. Second try, with the `humanId` and a new `--operation-id revoke-jdoe-2` → `{ success: true, revoked: true, kind: "member", id: … }`. J. Doe's sockets are terminated and their presence ends.
6. On J. Doe's client, the next hub policy check marks the project revoked: "Project admission revoked; local data is preserved" (`REVOKED`).
7. Priya's avatar stack drops J. Doe's presence (they show offline). The invite history still reads "Used".
##### Variations
- **Missing flags**: `--kind` or `--id` left out → "Supply --kind device|agent|member and --id".
- **Bad kind**: `--kind person` → "Choose device, agent or member".
##### Edge Cases
- **Reused operation ID**: reusing `revoke-jdoe-1` with a different `--id` fails with `OPERATION_ID_REUSED`.
- **Revocation is permanent**: the same identity cannot be re-admitted by a new Human invitation (docs/PARDNER-CLIENT.md:96-100).
- **Creator tries to revoke herself**: `--id <her own id>` fails with `FORBIDDEN` "Only creator may revoke other memberships".

---

#### STORY-044: A non-creator tries to remove a member
*(was invitations/STORY-011)*
**Type**: short
**Topic**: Invitations lifecycle
**Persona**: Marcus Lee (a replica member) thinks a stale contractor account should be removed from "Checkout Revamp".
**Goal**: Revoke another person's membership.
**Preconditions**: Marcus is not the creator.
**Ideal path**: 1 — the command is refused right away with a clear reason.
**Alternate paths**: Ask Priya (the creator) to run it.
**See also**: STORY-043
##### Steps
1. `pardner client revoke --project <id> --kind member --id <contractor humanId> --operation-id rm-contractor` → It is forwarded to the hub `/revoke`, which fails with `FORBIDDEN` "Only creator may revoke other memberships". stderr shows `FORBIDDEN: Only creator may revoke other memberships`.
2. Marcus messages Priya, who runs the same command.
##### Variations
- **Marcus's own stray device**: `--kind device --id <his old laptop device id>` succeeds, because the device belongs to him.
##### Edge Cases
- **Someone else's device**: `--kind device` with another person's device ID fails with `FORBIDDEN` "Device belongs to another human".

---

#### STORY-045: Retire an old laptop and a retired agent harness
*(was invitations/STORY-012)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Ken Watanabe (STORY-015) is giving back his old ThinkPad, which was linked to "Edge Cache Rollout", and is dropping Cursor in favour of Claude Code.
**Goal**: Revoke the ThinkPad device and the Cursor agent Actor.
**Preconditions**: Both were enrolled through earlier My device and Agent invitations.
**Ideal path**: 2 — one revoke action per item from a Devices / Agents list in the profile.
**Alternate paths**: CLI only.
**See also**: STORY-021, STORY-130
##### Steps
1. Ken opens his own profile (**You** → Identity → Devices) and sees "thinkpad-x1" listed with no action. He looks for the device ID there and doesn't find one.
2. `pardner client show --project <id>` → He finds the device ID in his actor's `devices`, and the Cursor agent's actor ID.
3. `pardner client revoke --project <id> --kind device --id <thinkpad id> --operation-id retire-thinkpad` → `revoked: true`. The ThinkPad's sockets close. On its next policy refresh, the ThinkPad shows the project as revoked, with its local data kept.
4. `pardner client revoke --project <id> --kind agent --id <cursor actor id> --operation-id retire-cursor` → Cursor's actor ID is removed from the admission and its sessions are revoked. Cursor's next call fails with `ACTOR_REVOKED`.
5. Ken checks the avatar stack. Cursor shows offline but is still listed as an Actor.
##### Variations
- **Agent with no admission**: `--kind agent` succeeds even when no admission matches, because the actor is added to `revokedActors` (client-service.js:219-223).
##### Edge Cases
- **Agent belonging to someone else**: `--kind agent` with Priya's agent ID fails with `FORBIDDEN` "Agent belongs to another human".
- **Revoked device can't be relinked**: a later My device invitation does not relink a revoked device into the same project entry. Recovery needs a fresh client directory (docs/PARDNER-CLIENT.md:98-101).
- **Device ID that matches nothing**: `--kind device` → `NOT_FOUND` "Admission not found".

---

#### STORY-046: The full life of one invite, from creation to expiry, by CLI
*(was invitations/STORY-013)*
**Type**: long
**Topic**: Invitations lifecycle
**Persona**: An ops agent (Claude Code) acting for Lena Fischer. She asked it to "send Rahul an invite for Infra Cost Audit and check tomorrow whether he used it".
**Goal**: Script the invite, follow its state, and replace it if it expired.
**Preconditions**: The local operator token is in `client-connection.json` and the project ID is known from `client list`.
**Ideal path**: 3 — invite, (wait), check state.
**Alternate paths**: The browser dialog (STORY-036 and STORY-040). The CLI cannot list or revoke invitations; there is no `client invites` command (client-cli.js:181).
**See also**: STORY-039, STORY-040
##### Steps
1. `pardner client list` → `projects[]`. The agent picks "Infra Cost Audit".
2. `pardner client invite --project <id> --purpose human --output-file ~/.pardner-private/rahul.txt --operation-id invite-rahul-2026-11-09` → `{ success: true, invite: { id, purpose: "human", state: "issued", expiresAt }, invitationFile: "/Users/lena/.pardner-private/rahul.txt" }`. stdout has no secret.
3. The agent tells Lena where the file is so she can send it privately.
4. The agent retries the same command after a timeout → The same invite comes back (idempotent `attempt`) and the file is rewritten with the same content.
5. With `--purpose humans` (a typo) → "Choose Human, Agent or My device".
6. Without `--output-file` → "Supply --output-file to store the private invitation".
7. Next day, to check the state, the agent has no list command. It asks Lena to open **Invite → Human**, and the row reads "Expired".
8. It issues a new one with a new operation ID → A new invite.
##### Variations
- **Reused operation ID, different purpose**: `invite-rahul-2026-11-09` with `--purpose agent` → `OPERATION_ID_REUSED`.
- **Leaked file**: to revoke it, someone has to use the browser Revoke button.
##### Edge Cases
- **Retry after a browser revoke**: re-running the original command after Lena revoked the invite in the browser returns `REVOKED` "Invitation revoked" (client-invites.js:43), not a new invite.
- **Agent token**: running `client invite` with an agent token gets `FORBIDDEN` "Human authority required".
- **Redundancy / gap**: invite state can be read only in the browser history list. The CLI summary is a snapshot taken when the invite is created.

---

#### STORY-047: Choosing the wrong invite type and recovering
*(was invitations/STORY-014)*
**Type**: medium
**Topic**: Invitations lifecycle
**Persona**: Grace Liu, a product designer new to Pardner. She wants her own iPad-less second Mac ("studio") on "Design System Tokens" and assumes "Human" means "me".
**Goal**: Get her second computer linked under her identity.
**Preconditions**: Grace is the creator. The studio Mac has Pardner and no identity.
**Ideal path**: 4 — Invite, My device, Copy, then Link device on the other machine.
**Alternate paths**: CLI `client invite --purpose device` and `client join`.
**See also**: STORY-016, STORY-018
##### Steps
1. **Invite ▾** → She reads "Human — A person and their agent", thinks "I'm a person" and clicks **Human** → "Invite a person".
2. **Create invitation**, then **Copy invite**.
3. Studio Mac: `pardner open` → **Link this device instead** → she pastes → "This is a Human invitation. Confirm your identity first, then join with it."
4. Confused, she goes back (**Back to confirming my identity**) and clicks **Continue as Grace Liu**, which creates a *second* identity. Then she joins with the Human invite → It succeeds as a new person also named "Grace Liu".
5. The work Mac's avatar stack now shows two Grace Lius (redundancy and confusion).
6. Recovery: on the work Mac (creator), `client show` gives her the second identity's `humanId`. Then `client revoke --kind member --id <that id> --operation-id remove-dup-grace`.
7. The studio Mac now holds a revoked project and the wrong identity. She needs a fresh client directory there (docs/PARDNER-CLIENT.md:98-101). On the work Mac she uses **Invite → My device** → Create → Copy, and links the fresh studio client with **Link device**.
##### Variations
- **Caught early**: Grace notices at step 3 and goes back to the work Mac, where **Revoke** in the dialog (or on the history row) kills the Human invite. She then reopens through **My device**.
##### Edge Cases
- **Wrong-kind refusal is local**: refusals at the link page happen in the browser before any request, so the invite is not used up.
- **Identity can't be changed**: after step 4, the studio client hits `IDENTITY_EXISTS` "Identity already initialized; linking requires My device" if she tries to change identity.
- **Clarity gap**: the menu details ("A person and their agent" against "Another computer you use") are the only things telling Human and My device apart before an invite is created. The dialog body text is shown only after she has already chosen.

---

### People, presence, profiles and focus


Code covered: `ui-prototype/src/ClientApp.jsx:449-555` (ProjectView header, presence polling and reporter wiring, dialogs), `ui-prototype/src/Avatar.jsx` (Avatar, AvatarStack, ProfileDialog, PeopleDialog), `ui-prototype/src/presence.js` (browser reporter, index, sort), `ui-prototype/src/Pardner.jsx:276-286, 675, 776-786, 1254-1272` (focus reporting, card and panel "Here now"), `lib/client-presence.js` (server sessions), `lib/client-service.js:175-202, 226-230, 381-393` (presence actions, revoke, routes), `ui-prototype/src/pardner.css:1088-1174` (presence styling).

Key facts the stories rely on:
- **Timers.** Browser heartbeat every 15 s. A browser goes idle 120 s after its last pointerdown, keydown or input on a visible page. Reports are coalesced to at least 1 s apart. The page polls presence every 5 s and the project (actor list) every 15 s. The server session TTL is 45 s. The default agent activity lease is 90 s and the maximum `activeForMs` is 300000.
- **Header sort order.** Active people come first, then Idle, then Offline, then by name (presence.js:113-116). The header shows at most 5 avatars plus a "+N" button.
- **Card markers can't be clicked.** On a task card, "Here now" shows at most 3 avatars and is a non-interactive `role="img"` stack, because it sits inside the card button (Pardner.jsx:779-786). In the task panel, "Here now" shows at most 6 avatars, each opens a profile, and its "+N" is a non-interactive span (no `onMore`).
- **No built-in agent reporter.** Nothing in lib/ or scripts/ reports presence for an agent: no CLI command, no bridge code. An agent shows as anything but Offline only if its harness calls `POST /pardner/client/v1/projects/ID/sessions` and `.../sessions/SID/report` with its agent-grant bearer token (docs/PARDNER-ONBOARDING-CONTRACT.md:96-98).

#### STORY-048: Glance at who is around, then open a teammate's profile from the header
*(was presence-profiles/STORY-001)*
**Type**: short
**Topic**: People, presence, profiles and focus
**Persona**: Maya Okafor, tech lead who started the "Harbor Billing" project, opening the board on Monday morning
**Goal**: See who is active and check what Dev Patel is working on
**Preconditions**: Maya is signed in via `pardner open`. Dev Patel (human, joined replica) has a browser open on task "Fix timezone drift in renewal emails" and has been clicking in it within the last 2 minutes.
**Ideal path**: 2 — a single click on Dev's avatar should show presence and focus together; reading the header is step zero
**Alternate paths**: "+N" → People dialog → name link → profile (only if Dev is beyond the first 5); task card "Here now" (view only) → open the card → panel "Here now" avatar → profile; hover the avatar to read the `title` tooltip "Dev Patel, human, active" with no click
**See also**: STORY-020, STORY-049, STORY-055
##### Steps
1. Look at the header group labelled "People in this project" → Up to 5 round avatars with initials ("DP", "MO", "J" plus a bot glyph for agent Juniper). Active avatars have a solid accent outline and dot, idle ones a dashed outline, offline ones are grey with no dot (pardner.css:1088-1107). Active people sort first.
2. Hover the "DP" avatar and hesitate over whether the outline means "selected" → Tooltip reads "Dev Patel, human, active".
3. Click the "DP" avatar (aria-label "Dev Patel, human, active. Open profile") → A modal ProfileDialog opens. Heading "Dev Patel", then "Human · Active". **Identity** shows Git name, Git email and Devices (e.g. "dev-mbp"). **Live sessions 1** shows a row "Active · Browser" with Device, Focus "Fix timezone drift in renewal emails" (a link) and "Expires in 38 s without a report".
4. Press Escape → The dialog closes and focus returns to the "DP" avatar (Avatar.jsx:69-78).
##### Variations
- Close by clicking the backdrop or the **Close** button: same result.
- Dev is idle (no input for more than 120 s, tab still visible): dashed outline, tooltip "…, idle", profile shows "Human · Idle" and the session row "Idle · Browser".
- Dev has two browser tabs on different tasks: "Live sessions 2", each row with its own Focus. His header state is Active if either tab is active (client-presence.js:127).
##### Edge Cases
- The header shows the same presence state in several places: the avatar outline, the tooltip/aria-label, the profile heading, each session row, the People dialog row, and the card and panel markers. This is a Redundancy Candidate.
- Dev's Device appears both under Identity → Devices and in each session's Device row (the same name when he has one machine). This is a Redundancy Candidate.
- Display lags by up to 5 s (presence poll interval). A just-opened task may not appear in Focus at once.

---

#### STORY-049: Use the +N People dialog in a crowded project
*(was presence-profiles/STORY-003)*
**Type**: medium
**Topic**: People, presence, profiles and focus
**Persona**: Tomás Lindqvist, engineering manager of "Atlas Data Platform", which has 4 humans and 5 agents
**Goal**: Find the Codex agent "Otter" (offline, so sorted last) and check which human it works for
**Preconditions**: 9 Actors. Only 5 avatars fit, so "+4" shows. Otter has no live session.
**Ideal path**: 3 — open +N, click Otter, read "Works for"
**Alternate paths**: none for an offline Actor outside the first 5. If Otter were active it would sort into the first 5 and could be opened directly.
**See also**: STORY-048, STORY-056
##### Steps
1. Scan the header and fail to find Otter → 5 avatars (active people first) and a "+4" button (aria-label "4 more Actors. Show everyone").
2. Click "+4" → Dialog **People in this project** lists all 9 Actors: avatar, name as a link button, "Agent"/"Human" and a presence word (Active/Idle/Offline), sorted the same way.
3. Scroll to "Otter · Agent · Offline".
4. Click "Otter" → The People dialog is replaced by Otter's ProfileDialog: "Otter", "Agent · Tomás Lindqvist's agent · Offline". **Identity**: Works for "Tomás Lindqvist", Harness "Codex", Git name/email "Not reported", Devices. **Live sessions 0**: "No live session reported to this view. Offline means none is connected here, not that work stopped."
5. Wonder whether Otter is broken. Re-read the note: offline only means no session reported.
6. Press Escape → The profile closes. It does not return to the People dialog.
##### Variations
- With exactly 6 Actors the button reads "+1" and "1 more Actor. Show everyone".
- Choose a human in the list: no "Works for"/"Harness" rows.
##### Edge Cases
- Going from People to Profile swaps the dialog, so the People dialog is gone after Close. To check another person, Tomás must click "+4" again. The return-focus element (the name link inside the People dialog) is detached, so focus is not restored to the "+4" button (Avatar.jsx:74 checks `isConnected`). This is friction plus a focus-loss bug candidate.
- People dialog presence words repeat the header avatars and the profile heading. This is a Redundancy Candidate.
- An agent whose human isn't in the actor list: "Agent" without the "· X's agent" suffix, and Works for "Not reported".

---

#### STORY-050: Watch your own state go Active → Idle → Active (idle timeout)
*(was presence-profiles/STORY-004)*
**Type**: medium
**Topic**: People, presence, profiles and focus
**Persona**: Maya Okafor again, with two browser windows side by side (her own board and a colleague's screen-share) to see what others see
**Goal**: Understand when Pardner calls her Idle
**Preconditions**: Maya is on the Tasks board with the tab visible.
**Ideal path**: 0 user actions — the transition is automatic. Observing it takes about 3 glances.
**Alternate paths**: observe through the You button state, a header avatar, the profile heading, or another user's view. Agents/operators can see it via `pardner client show --project ID` (`presence` in the JSON).
**See also**: STORY-051
##### Steps
1. Click anywhere on the board → The You avatar is Active (solid outline). The reporter sends `{active:true, activeForMs≤120000}` (presence.js:19-24).
2. Read a long task description without touching mouse or keyboard. Note that mouse movement alone does not count: only pointerdown, keydown and input do (ClientApp.jsx:484).
3. Wait a little over 2 minutes → After the next heartbeat (15 s cadence) and presence poll (5 s), the You avatar turns dashed and the aria-label reads "You: Maya Okafor, human, idle". Open the profile: "Human · Idle", session "Idle · Browser".
4. Press a key (for example Tab) → The reporter sees the idle-to-active change and reports within about 1 s. Within 5 s the avatar is Active again.
##### Variations
- Scrolling with a wheel or trackpad is not pointerdown, so a reader who only scrolls goes Idle.
- Typing in a comment box (`input`) keeps her Active.
##### Edge Cases
- The server lease and the client agree. The browser sends `activeForMs` equal to the time left in its idle window, so a heartbeat never extends activity past the last real interaction (presence.js:17-24).
- Idle is not offline: the session stays live as long as heartbeats arrive every 15 s (TTL 45 s).

---

#### STORY-051: Switch to another tab, then close the window (hidden → Idle, pagehide → Offline)
*(was presence-profiles/STORY-005)*
**Type**: medium
**Topic**: People, presence, profiles and focus
**Persona**: Dev Patel, who flips between Pardner and his IDE all day; his teammate Maya watches his avatar
**Goal**: Know what teammates see when Dev leaves the tab or closes it
**Preconditions**: Dev is Active, with task "Fix timezone drift in renewal emails" open in the panel. Maya sees his "DP" on that card's "Here now".
**Ideal path**: 0 — automatic. Dev's actions are switching tabs and closing the window.
**Alternate paths**: none found (only the browser's own visibility and pagehide events drive this).
**See also**: STORY-050, STORY-143
##### Steps
1. Dev switches to his IDE tab → `visibilitychange` fires, `visible()` is false, and the reporter sends `active:false` about 1 s later. Maya sees Dev's avatar go Idle (dashed) within 5 s. The card still shows his "Here now" marker, because focus is kept while idle.
2. Dev returns and clicks → Active again.
3. Dev closes the window → `pagehide` calls `stop()`, which ends the session (`/sessions/SID/end`). On her next poll Maya sees "Dev Patel, human, offline", grey with no dot, and the "Here now" marker disappears from the card (offline Actors have no focus, presence.js:97).
4. Maya opens Dev's profile → "Live sessions 0" and the "No live session reported to this view…" note.
##### Variations
- Dev closes only one of two tabs: the remaining session keeps him Idle or Active, and the closed tab's focus drops.
- Dev's laptop sleeps without `pagehide`: no end call, so he stays Idle until the 45 s TTL lapses, then shows Offline. A 0–45 s window of stale "Here now" is possible.
##### Edge Cases
- Background timer throttling in a hidden tab could delay heartbeats past 45 s. The session then expires and Dev shows Offline. The next report gets `SESSION_EXPIRED` ("The presence session has expired; start a fresh session"), and the reporter silently starts a fresh session (presence.js:41-45). His Expires countdown in the profile resets.
- Reporter errors other than expiry are swallowed (`onError: () => {}`, ClientApp.jsx:479), so a failing reporter shows nothing to the user.

---

#### STORY-052: See "Here now" on a card and open the task to see who is in it
*(was presence-profiles/STORY-006)*
**Type**: short
**Topic**: People, presence, profiles and focus
**Persona**: Priya Raman, about to edit "Redesign invoice PDF header", who wants to avoid colliding with someone
**Goal**: See who else is on the task before editing
**Preconditions**: Maya and agent Juniper (Claude Code, reporting focus) are both focused on that task.
**Ideal path**: 1 — the card itself shows the avatars
**Alternate paths**: open the card → panel "Here now" (up to 6, clickable); a profile's Focus rows from the header avatar or People dialog
**See also**: STORY-055, STORY-071
##### Steps
1. Look at the To do column → The card shows "P1", the title, "Unassigned" or "{assignee} · {kind}", and a small "Here now" stack with "MO" and "J" plus a bot glyph. The aria-label reads "Maya Okafor, human, active, on this task".
2. Try to click Maya's tiny avatar on the card to open her profile → The whole card opens instead: markers inside the card button aren't interactive (Pardner.jsx:779-780).
3. The Task details panel opens with Priya's own focus now reported → Under SaveStatus, "Here now" lists Maya, Juniper and Priya herself (opening a task makes you "here").
4. Click "J" in the panel → Juniper's profile opens.
##### Variations
- Four or more focused Actors: the card shows 3 plus a non-interactive "+1" ("1 more Actor, on this task"). The panel shows up to 6.
- Seven or more in the panel: "+N" is a span with no way to list them. The People dialog has no "on this task" filter.
##### Edge Cases
- Priya sees her own avatar in "Here now" on the card and panel after opening. This is likely noise for the viewer.
- Focus markers appear on cards, in the panel, and in each profile's Focus. This is a Redundancy Candidate.
- Card markers are hidden for actors not in the actor list (`focusedActors` filters unknown IDs).

---

#### STORY-053: Jump from a profile's Focus link straight into the task
*(was presence-profiles/STORY-007)*
**Type**: short
**Topic**: People, presence, profiles and focus
**Persona**: Maya Okafor, who wants to review whatever Juniper is touching right now
**Goal**: Open the task Juniper is focused on
**Preconditions**: Juniper has a live agent session reporting `focusTaskIds:["…"]` for "Migrate invoice PDFs to S3"
**Ideal path**: 2 — open the profile, click the focus link
**Alternate paths**: find the card with the "J" marker on the Tasks board and open it; Activity subject links
**See also**: STORY-048
##### Steps
1. Click Juniper's header avatar → Profile shows "Agent · Maya Okafor's agent · Active". The session row "Active · Claude Code" lists Device, Model "claude-opus-5-5", Managed by "T3", Focus "Migrate invoice PDFs to S3" and "Expires in 31 s without a report".
2. Click the Focus link "Migrate invoice PDFs to S3" → The dialog closes and the task panel opens with its heading focused (Pardner.jsx:279-286). Maya's own focus is now reported on that task too.
3. Press Close → Focus falls back to **New task** (opener is cleared for profile-opened tasks).
##### Variations
- Maya is on the Goals or Activity view: the link still opens the side panel for the task.
- A session focused on several tasks lists several links.
##### Edge Cases
- A focus ID not in the loaded doc is dropped from the list. If none remain, Focus shows "No task" (Avatar.jsx:130).
- The board's filters (vein, status, text) don't block opening, but the card may not be visible behind the panel.

---

#### STORY-054: Agent shows Offline after onboarding, until its harness reports presence
*(was presence-profiles/STORY-008)*
**Type**: long
**Topic**: People, presence, profiles and focus
**Persona**: Kenji Watanabe, solo developer onboarding his Codex agent "Otter" to project "Kumo Notes"
**Goal**: Get Otter to show as Active with a focus marker while it works on "Add offline sync to note editor"
**Preconditions**: Kenji started the project. Onboarding text read "You join as Kenji Watanabe. Otter (Codex) is registered as your agent. It shows as offline until it connects, and as active only while it reports work." (ClientApp.jsx:238)
**Ideal path**: 3 — issue an agent grant, then the agent starts a session and reports; Kenji just looks
**Alternate paths**: none in the UI. There is no CLI subcommand for presence sessions. The only way is HTTP (`/sessions`, `/sessions/SID/report`, `/sessions/SID/end`). Kenji can read state via `pardner client show --project ID`.
**See also**: STORY-123, STORY-126, STORY-130
##### Steps
1. Open the board → Otter's avatar is grey with a bot glyph, "Otter, agent, offline".
2. Open Otter's profile → "Agent · Kenji Watanabe's agent · Offline", Harness "Codex", "Live sessions 0" with the note.
3. Ask Otter to pick up the task. Otter edits the task via `pardner --token-file otter.json task update …` → The edit lands (authored by Otter), but Otter stays Offline. Board writes don't create presence.
4. Kenji is confused and re-reads the onboarding hint and docs/PARDNER-CLIENT.md "Actors and presence".
5. Run `pardner client agent-grant --project kumo-notes --harness openai-codex --output-file otter.json` → `{actorId, projectId, credentialFile}`. The file contains `apiBase` ending in `/api`.
6. Otter's harness calls `POST /pardner/client/v1/projects/ID/sessions` with `{kind:"agent", model:"gpt-5-codex", managedBy:"t3"}`. It has to strip `/api` from `apiBase`, which is a trap → `{sessionId, ttlMs:45000}`.
7. On Kenji's next poll Otter shows **Idle** (connected, no activity yet; the session starts with `activeUntil = now`).
8. Otter reports `{seq:1, active:true, focusTaskIds:["<task id>"]}` → Otter is Active, and "O" plus a bot glyph appears in the card's "Here now".
9. Kenji opens the profile → "Live sessions 1": "Active · Codex", Device "kenji-studio" (the client device name), Model "gpt-5-codex", Managed by "T3", Focus link, Expires countdown.
10. Otter stops reporting active but keeps heartbeating with `active:false` → After the lease (default 90 s, or `activeForMs` up to 300000) Otter is Idle and still focused.
11. Otter stops all reports → After 45 s, Offline. The marker disappears.
12. Otter calls `/sessions/SID/end` on finishing → Offline immediately.
##### Variations
- Wrong `kind` (`"browser"`) from an agent token → `ACTOR_MISMATCH` "Presence kind must match the authenticated Actor".
- Harness mismatch → `ACTOR_MISMATCH` "Harness must match admitted Actor".
- Credential for another project → `PROJECT_MISMATCH` "Credential belongs to another project".
##### Edge Cases
- Replaying the same seq with a different body → `STALE_PRESENCE_REPORT` 409 "Report sequence must advance; a replay cannot renew presence". An identical replay returns the prior receipt without renewing.
- Focus naming a task that isn't in the project → `INVALID_ARGUMENT` "Focus must name tasks in this project". More than 32 IDs → "Supply at most 32 focused task IDs".
- A report after expiry → `SESSION_EXPIRED`. More than 1024 live sessions → `PRESENCE_LIMIT` 429 "Too many live presence sessions".
- The model shown is only what the agent reports. Grant defaults are "not proof of the active model" (PARDNER-CLIENT.md:111-113).

---

#### STORY-055: Full collaborative morning — triage by presence, coordinate via focus
*(was presence-profiles/STORY-011)*
**Type**: long
**Topic**: People, presence, profiles and focus
**Persona**: Maya Okafor running a standup-less morning on "Harbor Billing" with Dev (replica), Priya, and agents Juniper (Claude Code via T3) and Otter (Codex)
**Goal**: Find who is working on what, avoid duplicate work, and hand Priya an idle task
**Preconditions**: All four are members. Juniper and Otter report presence via their harnesses. Dev's hub link is up.
**Ideal path**: 6 — read the header, open one or two profiles, open the target task, assign it
**Alternate paths**: card "Here now" scanning instead of profiles; People dialog; `pardner client show --project ID` for the JSON snapshot; the Activity view for recent edits (history, not presence)
**See also**: STORY-048, STORY-052, STORY-086
##### Steps
1. `pardner open` → The board loads. The header lists Juniper (Active), Dev (Active), Otter (Idle), Priya (Offline), with no "+N" (4 Actors plus Maya = 5).
2. Hover each → Tooltips confirm the states. Maya is unsure whether Otter's dashed ring means "error" and opens Otter's profile → "Agent · Maya Okafor's agent · Idle", session "Idle · Codex", Focus "Fix timezone drift in renewal emails".
3. Close → Focus returns to Otter's avatar.
4. Notice on the board that "Fix timezone drift in renewal emails" shows both "DP" and "O" in "Here now". A possible collision.
5. Open that card → The panel's "Here now" shows Dev, Otter and Maya herself.
6. Click "DP" in the panel → Dev's profile: Focus also lists "Fix timezone drift in renewal emails". Device "dev-mbp".
7. Close, then use the comment box to @mention Dev and Otter about the overlap (typing keeps Maya Active).
8. Open Juniper's profile from the header → Focus "Migrate invoice PDFs to S3", Model "claude-opus-5-5", Managed by "T3", "Expires in 40 s without a report".
9. Click the focus link → The panel switches to "Migrate invoice PDFs to S3".
10. Close the panel and look for an unclaimed task: "Redesign invoice PDF header" has no "Here now".
11. Priya's avatar turns Active (she just opened Pardner). Within 5 s she sorts ahead of Otter.
12. Open "Redesign invoice PDF header", assign it to Priya via the panel's edit controls (covered in the task-editing topic), and close.
13. A minute later the card shows "PR" in "Here now". Priya has opened it.
14. Maya goes to lunch with the tab open → after 2 minutes she is Idle to the others. Closing the lid later leaves her Idle until the 45 s TTL lapses, then Offline.
##### Variations
- Dev's hub link drops mid-morning: Dev's view shows "Remote presence unavailable". Maya, on the hub, sees Dev go Offline after 45 s.
- More than 5 Actors: Otter or Priya moves behind "+N", which adds the People dialog round-trip from STORY-049.
##### Edge Cases
- The same "who is on this task" answer is reachable four ways (card markers, panel markers, profile Focus, `client show` JSON). This is a Redundancy Candidate.
- Presence never says what an Actor is doing beyond task IDs. "Idle" for an agent mid-tool-call is possible if the harness doesn't renew `active`.
- Up to 5 s presence lag and 15 s actor-list lag can show a newly joined Actor's focus marker with no avatar. Unknown IDs are filtered until the actor list refreshes.

---

#### STORY-056: Keyboard-only and screen-reader pass over presence surfaces
*(was presence-profiles/STORY-012)*
**Type**: medium
**Topic**: People, presence, profiles and focus
**Persona**: Sam Ortiz, a screen-reader user on "Atlas Data Platform"
**Goal**: Learn who is here and their states without a mouse
**Preconditions**: 7 Actors (so "+2" shows). One task has focus markers.
**Ideal path**: 3 — tab to the stack, hear the labels, open +N
**Alternate paths**: tab to the You button for his own state; open a task and tab into "Here now"
**See also**: STORY-068
##### Steps
1. Tab into the header → The group "People in this project" announces each avatar button as "Juniper, agent, active. Open profile", and so on.
2. Tab to "+2" → "2 more Actors. Show everyone". Press Enter → **People in this project** dialog. Each row has a name link button, and the kind and presence text are read as plain text.
3. Press Escape → Back to the "+2" button.
4. Tab onto a task card → The card's accessible name includes its markers ("Maya Okafor, human, active, on this task"), read as part of the card button.
5. Enter → Panel heading focused. Tab to "Here now" → each avatar is a button ("…, on this task. Open profile").
6. Enter on one → Profile. Its sections are announced via the "Identity" and "Live sessions N" headings.
7. Escape → Focus returns to that panel avatar.
##### Variations
- Offline avatars remove the focus-visible outline (`.avatar[data-presence='offline']:focus-visible { outline: none; }`, pardner.css:1093). Sighted keyboard users can lose track of focus on offline avatars.
##### Edge Cases
- Presence is color- and outline-only visually (solid, dashed, grey). Text exists only in labels and in the dialogs.
- Presence changes are not announced live. Sam must re-visit avatars to notice a transition.

---

#### STORY-057: Operator/agent reads presence from the CLI
*(was presence-profiles/STORY-013)*
**Type**: short
**Topic**: People, presence, profiles and focus
**Persona**: Juniper (Claude Code agent) or Maya in a terminal, checking whether Dev is around before pinging
**Goal**: Read actors and presence as JSON
**Preconditions**: The local client is running.
**Ideal path**: 1 — a single command
**Alternate paths**: the browser header, profiles and People dialog; `GET /pardner/client/v1/projects/ID/presence` directly
**See also**: STORY-048
##### Steps
1. Run `pardner client show --project harbor-billing` → The JSON envelope `{success:true, project, actors:[…], presence:{actors:[{actorId, state:"active"|"idle", focusTaskIds, sessions:[{sessionId, deviceName, kind, harnessId, managedBy, model, state, focusTaskIds, ttlMs}]}], observedAt, available:true}}`.
2. Look for Dev's actorId → It is absent from `presence.actors`, meaning Offline. The CLI has no explicit "offline" entry, which the user may misread as an error.
##### Variations
- Replica with the hub down: `presence.available:false, code:"HUB_UNAVAILABLE"`, empty actors.
##### Edge Cases
- `observedAt` is a monotonic `performance.now()` value, not a wall-clock timestamp, so it can't be read as a time.
- There is no `--watch`. Seeing transitions means polling by hand.

---

### Task board and creation


Source basis (paths are relative to the repository root):
- ui-prototype/src/Pardner.jsx:18-19 (STATUSES), 40-49 (`escapeKeepsPanel`), 52-82 (`labelActor`, `SelectActor`), 230-275 (state and preferences), 393-402 (focus return), 430-486 (`submit`, `showBoard`), 540-683 (header, nav filters, columns, cards), 734-748 (New task mount), 905-1081 (`TaskForm`), 1219-1226 (detail Escape)
- ui-prototype/src/connection.js:40-60 (preferences in localStorage under `pardner:{workspaceId}:{actorId}:preferences`)
- ui-prototype/src/pardner.css:32-34, 202-290, 680-745, 746-848, 1261-1281
- ui-prototype/src/ClientApp.jsx:96, 544 (Workspace is keyed by project, so in-memory state resets when you switch projects)
- lib/cli.js:34-36, 181-198, 234-236; lib/workspace-schema.js:47-50, 98-121; lib/workspace-commands.js:13-23, 103-115

Facts from the code that the stories depend on:
- **Status filter changes the layout, not just the cards.** Choosing a status renders only that one column. It is centred, at most 760 px wide, and marked `data-filtered="true"` (Pardner.jsx:632-633; pardner.css:680-688). Assigned to and Vein only hide cards; all seven columns stay.
- **Saved filters.** `filter`, `statusFilter`, `veinFilter`, `view` and `selected` (the open task) are saved per project and Actor in localStorage (Pardner.jsx:271-275). A reload reopens the last open task panel. The New task draft is in memory only (Pardner.jsx:232-233), so a reload or a project switch loses it.
- **Two kinds of blank-title validation.** The Title input has `required` and the form has no `noValidate` (Pardner.jsx:987-990). A completely empty title is therefore stopped by the browser's own "Please fill out this field." bubble. Pardner's message "Enter a title that is not only spaces." appears only for a title that is all spaces (Pardner.jsx:976-980, 1001). The server rejects it anyway with "Title must be text with content" (workspace-schema.js:48).
- **Escape** closes the New task panel unless (Pardner.jsx:40-49):
  - focus is in a text input or textarea that holds non-blank text, or
  - a `<dialog>` is open, which closes first.

  When focus is on a select or a button, Escape closes the panel even with a dirty draft. The draft is kept.
- **"Dirty" draft.** It counts as dirty when any of these is true (Pardner.jsx:909-911):
  - non-blank title, description or tags
  - status other than Backlog
  - priority other than P2
  - an assignee is set

  **Discard draft** appears only while the draft is dirty.
- **Focus.**
  - Opening New task autofocuses Title.
  - Close returns focus to the opener; if that is gone, to **New task**; if that is gone, to the pressed view button (Pardner.jsx:393-402).
  - After a create, the opener is recorded as the new task's card `{taskId}` (Pardner.jsx:453-457). Closing the detail panel then focuses that card if it is visible under the current filters; otherwise focus goes to New task.
- **The create form has no Vein field** and does not show tags on cards. The CLI `task create --vein v1,v2` can attach veins at creation (cli.js:235); the UI cannot.
- **Blocking during a request.** **New task** is disabled while `busy` or while a request is pending (Pardner.jsx:549). Inside the form, while busy or pending, text inputs become readOnly and selects are disabled (Pardner.jsx:940).
- **Breakpoints** (`--panel-width: 680px`):
  - ≤1100 px: the header controls (SaveStatus, New task) wrap onto their own row.
  - ≤839 px: the side panel goes full width.
  - ≤760 px: phone layout. The document scrolls, controls are at least 44 px tall, the nav labels go full width, columns are `minmax(230px, 75vw)`, and the page scroll locks while a panel is open.
  - ≥761 px and height ≥600 px: desktop frame. Columns scroll on their own, column headings stick, and the side panel sits below the client header.

#### STORY-058: Create a first task from the empty board
*(was board-task-creation/STORY-001)*
**Type**: short
**Topic**: Task board and creation
**Persona**: Maya Okafor, a product engineer who just started the project "Lantern Billing" and sees an empty board for the first time.
**Goal**: Add the first task and confirm it landed in the right column.
**Preconditions**: Signed in through `pardner open`. Project "Lantern Billing" is open on the Tasks view, all filters are at their defaults, and Maya's Actor has synced.
**Ideal path**: 3 — open the creator, type a title, submit. Defaults (Backlog, P2, Unassigned) need no input.
**Alternate paths**: CLI `pardner task create --title "Draft invoice email copy"` (cli.js:36, 234-236), from an agent via `--token-file` or `pardner client operation --project ID --request JSON`.
**See also**: STORY-059, STORY-070
##### Steps
1. Look at the board → Seven columns: Backlog, Up next, In progress, Review, Completed, Dead end, Abandoned. Each heading shows `0` and each column says "No tasks here" (Pardner.jsx:639-680).
2. Click **New task** (header, top right) → A side panel opens with heading "New task" and **Close**, and the muted line "Creating as Maya Okafor · human". Title has focus (Pardner.jsx:960-969, 990).
3. Type "Draft invoice email copy" → **Discard draft** appears next to **Create task**, because the draft is now dirty.
4. Press Enter (or click **Create task**) → The button reads **Creating…**, the form gets `aria-busy`, and the header SaveStatus reads "Saving locally…".
5. Wait → The New task panel is replaced by the Task details panel for "Draft invoice email copy", with its heading focused. The card shows under Backlog (count `1`) as "P2 / Draft invoice email copy / Unassigned", outlined with `aria-current`.
##### Variations
- Clicking **Create task** with the mouse instead of Enter gives the same result.
- Maya hesitates over the Description box, decides it is optional and leaves it empty: no effect, because description defaults to `''`.
##### Edge Cases
- Maya clicks **New task** a second time while the panel is open: the panel stays open and the draft is kept, because `creating` is already true.
- SaveStatus stays "Saved locally · waiting for hub" when no hub is configured. This status also appears inside the detail panel (Pardner.jsx:1263) — a Redundancy Candidate (same status in the header and the panel).

---

#### STORY-059: Fill every field on a new task, including tags and an assignee
*(was board-task-creation/STORY-002)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: Daniel Reyes, the tech lead on "Harbor Mobile", planning the sprint with his AI agent "codex-harbor" on the board.
**Goal**: Create an urgent, assigned, tagged task that goes straight to Up next.
**Preconditions**: Project "Harbor Mobile" has Actors Daniel Reyes · human, Priya Nair · human and codex-harbor · agent.
**Ideal path**: 7 — open, title, description, status, priority, assignee, submit (tags optional).
**Alternate paths**: CLI `pardner task create --title "…" --description "…" --assignee codex-harbor --status up-next --priority p0 --tags '["auth","ios"]'`. The generic field flags accept these (cli.js:90, 181-187), and `--tags` must be JSON, not comma text. Alternatively, create with defaults and then **Edit task** in the detail panel.
**See also**: STORY-058, STORY-078
##### Steps
1. Click **New task** → Panel opens, "Creating as Daniel Reyes · human".
2. Title: "Fix token refresh loop on iOS 18 cold start".
3. Description: "Reproduces on TestFlight build 4.12; refresh fires twice and logs the user out."
4. **Status** select: change Backlog → "Up next".
5. **Priority** select: Daniel first picks "P1", reconsiders, then picks "P0".
6. **Assignee** select: options are "Unassigned", "Daniel Reyes · human", "Priya Nair · human", "codex-harbor · agent". He picks "codex-harbor · agent".
7. **Tags, separated by commas**: types "auth, ios, , auth".
8. Click **Create task** → On submit, tags are split, trimmed and stripped of blanks to `["auth","ios","auth"]`. The server removes the duplicate, leaving `["auth","ios"]` (workspace-schema.js:113-116).
9. → The detail panel opens. Its line reads "codex-harbor · agent · Up next · P0", or the status shows as the quick **Status** select when that is editable.
10. Look at the board behind the panel (wide screen) → The card sits at the top of Up next, because cards sort by priority, then order (Pardner.jsx:647-650).
##### Variations
- Daniel leaves tags blank: `tags: []`.
- He sets the Status to "Completed" to log work already done. That is allowed, and the card lands under Completed.
##### Edge Cases
- Tags are not shown on cards. Only vein labels, the priority, the assignee and conflict labels are (Pardner.jsx:662-675). Daniel may look for the tags on the board and not find them.
- Assignee and priority appear on both the card and the detail line — a Redundancy Candidate (the same summary on two surfaces).
- The status and priority selects sit side by side in a `.form-row`. At ≤760 px they get at least 44 px height and 16 px font.

---

#### STORY-060: Submit a title that is empty or only spaces
*(was board-task-creation/STORY-003)*
**Type**: short
**Topic**: Task board and creation
**Persona**: Tomás Lindqvist, a designer on "Fjord CMS" who presses Enter too early.
**Goal**: Understand why the task was not created, and fix it.
**Preconditions**: The New task panel is open with an empty draft.
**Ideal path**: 2 — get an inline error on submit, type a title and resubmit.
**Alternate paths**: none found (the CLI gives a server error instead: `INVALID_ARGUMENT` "Title must be text with content").
**See also**: STORY-073
##### Steps
1. With Title empty, press Enter → The browser's native constraint bubble ("Please fill out this field.") appears on Title, because of `required`. Pardner's own message is not shown and no request is sent.
2. Type three spaces and press Enter → The native check passes, because the value is not empty. Pardner shows "Enter a title that is not only spaces." (`role="alert"`, Pardner.jsx:1001), sets `aria-invalid` on Title and focuses it.
3. Type "Hero image crop on article page" → The error clears on the first keystroke (`setTitleBlank(false)`).
4. Press Enter → The task is created and its detail panel opens.
##### Variations
- Tomás clicks **Discard draft** while the space-only error is showing → The error clears, the fields reset, and Title is refocused (Pardner.jsx:1062-1067).
##### Edge Cases
- Two different messages can appear for nearly the same mistake (native versus custom) — inconsistent copy, worth flagging.
- A whitespace-only title does not count as dirty (`fields.title.trim()`), so **Discard draft** is hidden in step 2 unless another field was changed.

---

#### STORY-061: Close a half-written draft with Escape, then come back to it
*(was board-task-creation/STORY-004)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: Aisha Bello, an operations lead on "Northwind Logistics" who gets interrupted while writing a task.
**Goal**: Look at the board without losing the task she is writing, then finish it.
**Preconditions**: New task panel open. Title is "Audit carrier rate cards for Q1", Priority is P1, Description is empty.
**Ideal path**: 3 — close, look, reopen with the draft intact.
**Alternate paths**: **Close** button (Pardner.jsx:962); Escape; opening a task card from the board, which swaps the panel and keeps the draft in memory.
**See also**: STORY-068, STORY-073
##### Steps
1. With the cursor still in Title, press Escape → Nothing happens. The input holds non-blank text, so `escapeKeepsPanel` keeps the panel open to protect it (Pardner.jsx:46-48). Aisha is unsure whether Escape is broken.
2. She presses Tab to the Description textarea, which is empty, and presses Escape → The panel closes. Focus returns to **New task** (the opener) (Pardner.jsx:393-399).
3. She scans the In progress column for a related task.
4. She clicks **New task** again → The panel reopens with Title "Audit carrier rate cards for Q1" and Priority P1 restored, **Discard draft** visible, and Title autofocused.
5. Description: "Compare DHL, Maersk and local carriers; flag >5% variance." Then **Create task** → Created; the detail panel opens.
##### Variations
- Aisha uses **Close** instead of Escape → Same result, and the error slot is cleared too (`closeCreate`, Pardner.jsx:538).
- Focus is on the Priority select when she presses Escape → The panel closes even though the draft is dirty. Selects are not "typed text", and the draft is still kept.
- She clicks a task card instead → The detail panel replaces New task (`setCreating(false)`), and the draft stays in memory for the next **New task**.
##### Edge Cases
- She reloads the browser tab → The draft is lost (in memory only, Pardner.jsx:232). Edit drafts, by contrast, are kept in sessionStorage — an inconsistent persistence model.
- She switches project in the ProjectSwitcher and back → The draft is lost, because Workspace remounts per `workspaceId` (ClientApp.jsx:544).
- A Profile or Invite `<dialog>` is open over the panel → Escape closes only the dialog (Pardner.jsx:45).

---

#### STORY-062: Throw away a draft with Discard draft
*(was board-task-creation/STORY-005)*
**Type**: short
**Topic**: Task board and creation
**Persona**: Kenji Watanabe, a backend engineer on "Atlas Search" who started a duplicate task by mistake.
**Goal**: Reset the New task form to its defaults.
**Preconditions**: New task panel open with Title "Reindex products nightly", Status "Up next" and Assignee "Kenji Watanabe · human".
**Ideal path**: 1 — one discard control.
**Alternate paths**: Clear each field by hand and reset Status to Backlog, Priority to P2 and Assignee to Unassigned; **Discard draft** disappears once the draft is no longer dirty. Closing the panel does not discard. A page reload does.
##### Steps
1. Click **Discard draft** → All fields return to their defaults (Title empty, Backlog, P2, Unassigned, no tags). The button disappears, and focus moves to Title (Pardner.jsx:1058-1070).
2. Kenji closes the panel with **Close** → Focus goes to **New task**.
##### Variations
- He changes only Status to "Review" and nothing else → Even with an empty title the draft is dirty, so **Discard draft** shows.
##### Edge Cases
- There is no confirmation and no undo for Discard draft.
- While a create is in flight (`busy`) or a request is pending, **Discard draft** is disabled.

---

#### STORY-063: Filter the board to one person's open work and have it remembered
*(was board-task-creation/STORY-006)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: Priya Nair, an engineering manager on "Harbor Mobile" who checks each morning what codex-harbor is working on.
**Goal**: See only codex-harbor's tasks that are In progress, and come back tomorrow to the same view.
**Preconditions**: About 40 tasks across all columns. Actors include codex-harbor · agent.
**Ideal path**: 2 — set two filters; they persist automatically.
**Alternate paths**:
- CLI `pardner tasks --assignee codex-harbor --status in-progress --json` (cli.js:194-198).
- Profile dialog (avatar → Live sessions → Focus links) shows which task an agent is focused on.
- Activity view **Performed by** filter shows what the agent has done, not what is assigned to it.
**See also**: STORY-099, STORY-109
##### Steps
1. On Tasks, open **Assigned to** (default "All Actors") and pick "codex-harbor · agent" → Every column now shows only its cards; the counts update; empty columns say "No tasks here".
2. Open **Status filter** (default "All statuses") and pick "In progress" → The board collapses to a single centred "In progress" column, at most 760 px wide (pardner.css:680-688).
3. Priya expected seven narrower columns and briefly thinks the other columns broke. She sees the heading "In progress 3".
4. She clicks a card, reads it, and presses Escape on the detail heading → The panel closes and focus returns to that card.
5. She closes the tab. The next morning she runs `pardner open` → The board opens on Tasks with "codex-harbor · agent" and "In progress" still selected. The last open task panel reopens too, because `selected` is saved (Pardner.jsx:273).
6. She resets both selects to "All Actors" and "All statuses" → All seven columns return.
##### Variations
- She switches to Goals and back → The filters are kept. Board filters show in the nav only when `view === 'board'` (Pardner.jsx:596-614).
- She switches project → That project has its own saved filters (key `pardner:{workspaceId}:{actorId}`).
##### Edge Cases
- There is no "Clear filters" control and no visible "filtered" indicator besides the select values. A Status filter left on from yesterday can make the board look nearly empty.
- localStorage is blocked → `savePreferences` throws "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes." and it shows as the page error (Pardner.jsx:274; connection.js:51).
- The URL never encodes filters, so a filtered view cannot be shared.

---

#### STORY-064: Jump from a vein to its tasks, then create a task under that filter
*(was board-task-creation/STORY-007)*
**Type**: long
**Topic**: Task board and creation
**Persona**: Elena Petrova, a research lead on "Quarry ML" running the vein "Distill ranker to 50M params" under the goal "Cut inference cost 40%".
**Goal**: Review the vein's tasks and add a follow-up task that belongs to the vein.
**Preconditions**: The goal and vein were created with `pardner vein create --title "Distill ranker to 50M params" --goal "Cut inference cost 40%"`. The vein has 4 tasks. Elena is on Goals.
**Ideal path**: 5 — click the vein, see its tasks, open New task with the vein preselected, title, create.
**Alternate paths**:
- Nav **Vein** select on Tasks.
- In Activity, click a vein subject in an event sentence; it calls `openVein`, which also focuses the pressed view button (Pardner.jsx:515-518).
- CLI `pardner tasks --vein <veinId> --json`.
- To attach at creation: `pardner task create --title … --vein <veinId>`.
- To attach afterwards: `pardner vein add <veinId> <taskId>`.
**See also**: STORY-099, STORY-103, STORY-109
##### Steps
1. On Goals, under "Cut inference cost 40%", click the vein title button "Distill ranker to 50M params" → The view switches to Tasks. `showBoard` sets Vein to that vein and resets Assigned to and Status to "All" (Pardner.jsx:484-486, 503).
2. Look at the board → 4 cards across Backlog, In progress and Review, each with the vein label "Distill ranker to 50M params". The **Vein** select shows the vein title, with its full name in a tooltip (`title`, Pardner.jsx:609).
3. Click **New task** → The panel opens. There is no Vein field (Pardner.jsx:985-1052). Elena scans the form twice for it.
4. Title "Evaluate 8-bit quantised student on held-out set", Priority P1, Assignee "Elena Petrova · human".
5. **Create task** → The detail panel opens. Its line shows no "Veins:" entry, because the task has none.
6. Close the panel → Focus does not go to a card: the new task is filtered out by the Vein filter, so focus falls back to **New task** (Pardner.jsx:397-399). The vein's columns still show 4 cards, and the new task is nowhere on the filtered board.
7. Elena realises the task is not linked. She opens a terminal: `pardner tasks --json` to find the new task ID, then `pardner vein add <veinId> <taskId>`.
8. Back in the browser, the live update arrives → The card appears under Backlog with the vein label; the Goals view now shows "5 tasks" for the vein.
9. She picks "All veins" in the **Vein** select → The full board returns.
##### Variations
- Elena enters through the nav **Vein** select instead of Goals → Only the vein filter changes; Assigned to and Status keep their current values (unlike the preset in step 1).
- Elena starts from Activity: clicking a vein subject in "… linked … to vein Distill ranker …" gives the same filtered board.
##### Edge Cases
- The vein is later removed or not yet synced → `activeVeinFilter` falls back to "" (All veins) without notice (Pardner.jsx:498).
- The same vein filter can be reached from three places (Goals vein title, Activity vein subject, nav Vein select) — a Redundancy Candidate, and also a consistency issue: one entry point resets the other filters and one does not.
- Goals and veins cannot be created in the UI; the empty Goals state points to `pardner vein create --title … --goal …`.

---

#### STORY-065: Create a task that the active filters hide
*(was board-task-creation/STORY-008)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: Marcus Chen, a QA lead on "Pinecrest HR" who keeps the board filtered to "Review".
**Goal**: Log a new bug as an unassigned Backlog task without losing his filtered view.
**Preconditions**: Status filter is "Review" and Assigned to is "Marcus Chen · human" (both saved).
**Ideal path**: 3 — open, title, create; then a clear signal of where the task went.
**Alternate paths**: CLI `pardner task create --title "…"`.
**See also**: STORY-063
##### Steps
1. Click **New task** → The panel opens with defaults: Status Backlog, Assignee Unassigned. The filters do not prefill the form.
2. Title "Leave balance shows negative after carry-over".
3. **Create task** → The detail panel for the new task opens, so the create clearly succeeded.
4. Close (Escape on the focused heading) → The board still shows only the "Review" column with Marcus's cards. The new task is not visible, and focus lands on **New task** because the new card is not rendered.
5. Marcus thinks the task might be missing. He switches Status filter to "All statuses" and Assigned to "All Actors" → The card appears in Backlog.
##### Variations
- He sets the form's Status to "Review" and Assignee to himself before creating → The new card appears in his filtered column, and closing the panel focuses it.
##### Edge Cases
- No notice says "This task is hidden by the current filters". The only confirmation is the detail panel that opens after a create.
- With a 1-column Status filter, the panel (680 px) can cover most of the centred 760 px column on laptop widths.

---

#### STORY-066: Create a task before your Actor has synced
*(was board-task-creation/STORY-009)*
**Type**: short
**Topic**: Task board and creation
**Persona**: Ruth Adeyemi, who just accepted a Join invitation to "Saltmarsh Grants" on a new laptop.
**Goal**: Start writing a task right away.
**Preconditions**: The board document has loaded, but Ruth's Actor is not yet in `doc.actors`.
**Ideal path**: 2 — write the draft, then create once the Actor syncs.
**Alternate paths**: none found.
**See also**: STORY-024, STORY-026
##### Steps
1. Click **New task** → The panel shows "Your Actor isn't on this board yet. Wait for the project to sync; your draft is kept." **Create task** is disabled, with `aria-describedby="new-task-actor"` pointing to that line (Pardner.jsx:942, 966-969, 1055).
2. She types Title "Collect Q3 budget receipts" anyway → Typing is allowed.
3. The live update brings in her Actor → The line changes to "Creating as Ruth Adeyemi · human" and **Create task** enables.
4. **Create task** → Created; the detail panel opens.
##### Variations
- She closes and reopens the panel while waiting → The draft is kept in memory.
##### Edge Cases
- If sync never completes she gets no progress signal besides the header SaveStatus ("Saved locally · waiting for hub") and any "Live updates disconnected. Reconnecting automatically." notice.

---

#### STORY-067: The create request fails or stays pending
*(was board-task-creation/STORY-010)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: Owen Gallagher, a contractor on "Brightline Retail" whose local service restarts mid-click.
**Goal**: Make sure the task is created exactly once.
**Preconditions**: New task panel open with Title "Update POS receipt footer". The local service becomes unreachable just as he submits.
**Ideal path**: 2 — submit, then one retry.
**Alternate paths**: The page-level "A request is awaiting confirmation." notice with **Retry saved request** (Pardner.jsx:560-567), shown once the panel is closed.
**See also**: STORY-025, STORY-137, STORY-138
##### Steps
1. Click **Create task** → **Creating…**. The operation is saved to sessionStorage as pending before it is sent (Pardner.jsx:443-446).
2. The request fails because of the network → An ErrorNotice shows inside the form, above the actions: the error message, "Your last confirmed data remains available." and **Retry saved request**. There is no Dismiss button while the request is pending (Pardner.jsx:91-106, 532-536). Focus returns to **Create task**, but that button stays disabled while the request is pending. Title and Tags become read-only; Status, Priority and Assignee are disabled.
3. Owen clicks **Create task** again → Nothing happens. He then sees **Retry saved request**.
4. He clicks **Retry saved request** → The same operation ID is resent, so the task cannot be created twice. On success the detail panel opens.
##### Variations
- He closes the panel before retrying → The error leaves the form; the header shows "A request is awaiting confirmation." with **Retry saved request**. **New task** is disabled until the request resolves (Pardner.jsx:549).
- He reloads the tab → The pending operation is kept in sessionStorage and the retry notice returns. The New task draft text is lost (in memory only), but the payload sits in the pending operation.
##### Edge Cases
- The server rejects with a definitive code (`INVALID_ARGUMENT`, for example a whitespace title sent through a race, or `AMBIGUOUS_ACTOR`, `NOT_FOUND`) → The pending request is cleared, and the error becomes dismissible with **Dismiss** (Pardner.jsx:465-476).
- Trying another change while one is pending shows "Resolve the saved request before starting another change."

---

#### STORY-068: Create and triage tasks with the keyboard only
*(was board-task-creation/STORY-011)*
**Type**: long
**Topic**: Task board and creation
**Persona**: Sam Whitfield, a screen-reader user and staff engineer on "Ironbark API" who works without a mouse.
**Goal**: Filter the board, create two tasks, and open an existing one, all from the keyboard.
**Preconditions**: Tasks view; VoiceOver on; about 15 tasks.
**Ideal path**: 12 — two creates of about 4 key actions each, plus navigation.
**Alternate paths**: The CLI for bulk creation (`pardner task create` in a loop).
**See also**: STORY-056, STORY-061
##### Steps
1. Tab through the header (project switcher, avatars, **Invite**, **You**) to SaveStatus and **New task**. SaveStatus is a `role="status"` live region, so changes are announced.
2. Tab into the nav "Workspace views" → **Tasks** is announced as pressed (`aria-pressed`). Then **Goals**, **Activity**, and **Control** if Sam is the local person.
3. Tab to **Assigned to**, **Status filter** and **Vein** (each select has an accessible label) and leave them at "All".
4. Tab into the board → Each column is a `section` labelled by its status name (Pardner.jsx:634-638). Cards are buttons announced as "P1 Rotate signing keys Sam Whitfield · human …".
5. Shift+Tab back to **New task** and press Enter → Focus lands in Title; the panel is labelled "New task".
6. Type "Add rate-limit headers to /v2/orders", Tab to Description, Tab to Status, Priority and Assignee (select values with arrow keys), Tab to Tags, then Enter → Created. The detail panel opens, and the task heading takes focus (`tabIndex=-1`, claimHeadingFocus).
7. Press Escape → The detail panel closes and focus goes to the new card "Add rate-limit headers to /v2/orders" in Backlog.
8. Shift+Tab to **New task**, Enter, type "Deprecate /v1/orders", press Escape by habit → Nothing happens, because Title has text. Sam hears no feedback and pauses.
9. He presses Enter instead → Created; the detail panel opens.
10. Escape → Focus goes to the "Deprecate /v1/orders" card.
11. He Tabs across cards to "Rotate signing keys" and presses Enter → Its detail panel opens with the heading focused; the card gets `aria-current="true"`.
##### Variations
- A failed submit puts focus back on **Create task** once it re-enables. The error is announced through `role="alert"`, not focused (Pardner.jsx:952-953, 982).
##### Edge Cases
- There are no keyboard shortcuts for New task or for filters; the header is long to Tab through. The side panel is not a modal: Tab can leave it into the board behind.
- The column count is inside the `h2` (for example "Backlog 4"), so it is read as part of the heading name.
- The Escape behaviour in step 8 is silent, and the same key does different things depending on where focus is — a clarity finding.

---

#### STORY-069: Use the board on a narrow window and a small laptop
*(was board-task-creation/STORY-012)*
**Type**: long
**Topic**: Task board and creation
**Persona**: Grace Mwangi, a freelance PM on "Kestrel Events" who docks the browser to half her 13" screen, then makes it narrower.
**Goal**: Create a task and review columns at about 1050 px, 820 px and 700 px window widths.
**Preconditions**: Tasks view, about 25 tasks, no filters. (There is no phone or LAN access; this is only a narrow desktop window.)
**Ideal path**: 4 — create a task and scan the columns at each width without layout breaks.
**Alternate paths**: none found.
##### Steps
1. Window at about 1300 px → The header is one row. The seven columns are each at least 180 px; the board scrolls sideways if needed. Each column scrolls on its own with a sticky heading (pardner.css:701-745).
2. Narrow to about 1050 px (≤1100) → The header controls (SaveStatus and **New task**) wrap onto their own row, spread to both ends (pardner.css:1261-1264).
3. Click **New task** → The 680 px panel opens below the client header (top = header height, pardner.css:1277-1281). About 370 px of board stays visible on the left.
4. Narrow to about 820 px (≤839) → The panel takes the full width and covers the board, because the visible board would be under 160 px (pardner.css:692-698).
5. Create "Book caterer tasting for 14 March" → The detail panel opens, also full width. Grace closes it to see the card.
6. Narrow to about 700 px (≤760) → The phone layout applies:
   - the header stacks and the project switcher shrinks
   - the nav filters take one full-width row each
   - controls are at least 44 px with 16 px font
   - columns become `minmax(230px, 75vw)` and swipe sideways
   - the desktop frame is off, so the whole document scrolls
7. Open a card → The full-width panel locks page scroll (`html:has(.side-panel)`, pardner.css:786-789); the panel itself scrolls.
8. With Status filter = "Review" → The single column fills the width, up to 760 px.
##### Variations
- Window height under 600 px at a wide width → The desktop frame is off, so headings are not sticky and the document scrolls.
##### Edge Cases
- Between 761 and 839 px the panel is full width but still sits below the header, so the header stays visible. At ≤760 px it is fixed from `top: 0`.
- Seven columns at 230 px minimum is about 1610 px of horizontal scroll on a 700 px window; there is no "jump to column" control.

---

#### STORY-070: An agent creates a task from the CLI and the person sees it appear
*(was board-task-creation/STORY-013)*
**Type**: medium
**Topic**: Task board and creation
**Persona**: codex-harbor (an AI agent on "Harbor Mobile") files a follow-up while Daniel Reyes watches the board.
**Goal**: Agent-created tasks show up live, attributed to the agent.
**Preconditions**: The operator ran `pardner client agent-grant --project <ID> --output-file ~/.pardner/harbor-codex.json --harness openai-codex`. Daniel's board is open with no filters.
**Ideal path**: 1 — one CLI command; the board updates live.
**Alternate paths**:
- `pardner client operation --project ID --request '{"type":"task.create",…}'`.
- The control-runtime wrapper `control cli --agent openai-codex -- task create --title …`.
**See also**: STORY-103, STORY-126
##### Steps
1. The agent runs `pardner --token-file ~/.pardner/harbor-codex.json task create --title "Add retry jitter to push registration" --assignee codex-harbor --priority p1 --json` → `{success:true, …, result:{taskId:"task_…"}}`.
2. Daniel's board receives a websocket update → A new card "P1 / Add retry jitter to push registration / codex-harbor · agent" appears in Backlog; the count goes up by one.
3. Daniel opens Activity → The event sentence names codex-harbor as creator, and the task subject opens the detail panel.
4. Back on Tasks, Daniel filters **Assigned to** = "codex-harbor · agent" to check the agent's queue.
##### Variations
- The agent passes `--vein <veinId>` → The card shows the vein label right away. The UI has no equivalent field.
- The agent passes `--tags auth,ios` (not JSON) → The CLI rejects `--tags` as invalid JSON. The UI accepts comma text. The two input formats differ.
##### Edge Cases
- `--assignee none` sets Unassigned (cli.js:185). An unknown handle fails through `resolveActor` (for example `NOT_FOUND` or `AMBIGUOUS_ACTOR`).
- `--status todo` and `--status in-review` are accepted as aliases for backlog and review (workspace-schema.js:106-107). The UI does not show these aliases.
- The "who created it" information appears in Activity and in detail History, not on the card — a Redundancy Candidate (creation attribution on two surfaces, but not the card).

---

#### STORY-071: A shared board changes underneath the filters
*(was board-task-creation/STORY-014)*
**Type**: short
**Topic**: Task board and creation
**Persona**: Lina Haddad, a support lead on "Copperleaf Support", filtered to "Up next" while Priya moves tasks.
**Goal**: Keep track of the queue while others change status.
**Preconditions**: Status filter = "Up next"; Priya is active in another browser.
**Ideal path**: 1 — watch the column update live.
**Alternate paths**: The Activity view with Show = "Status changes and handoffs".
**See also**: STORY-077, STORY-104
##### Steps
1. Priya moves "Refund flow for annual plans" to In progress → Lina's card disappears from Up next and the count drops, without warning or animation.
2. Lina is confused about where it went. She opens Activity, sees "Priya Nair changed … to In progress", and clicks the task subject → The detail panel opens.
3. A card shows **Conflicting edits** after concurrent edits → Lina opens it and is sent to the Resolve section (covered in the Task detail topic).
##### Variations
- Priya is viewing a task → Its card shows a "Here now" avatar stack (max 3) (Pardner.jsx:675, 780-786). The same marker shows in the panel (max 6) — a Redundancy Candidate.
##### Edge Cases
- The board is not virtualised; a column holding hundreds of cards in one status renders them all.

---

### Task detail, editing, drafts and conflicts


Source anchors (paths are relative to the repository root):
- `ui-prototype/src/Pardner.jsx`: TaskDetail 1117-1655, IssueLinks 1083-1115, TaskForm 913-1080, ErrorNotice 91-107, SaveStatus 133-150, submit / pending 430-484, error routing 526-539, card "Conflicting edits" 670-674, panel mount 749-770, `escapeKeepsPanel` 41-49
- `ui-prototype/src/task-status.js`: quick Status rule
- `ui-prototype/src/connection.js`: 40-71, drafts in sessionStorage keyed `pardner:{workspaceId}:{actorId}:draft:{taskId}`; preferences, including the open task, in localStorage
- `ui-prototype/src/events.js`: `describeEvent`
- `lib/workspace-schema.js`: `checkRevisions` 135-139, `issueReference` 218-224, `issueLinkIndex` 229-245, `operationIntegrityConflicts` 285-295, `taskContext` 370-390
- `lib/workspace-commands.js`: `fieldChanges` 39-48, `issueLinkChange` 201-213, prepareUpdate / prepareResolve 215-228, integrity / reuse 367-374
- `lib/cli.js`: usage 34-70, handlers 237-265
- `lib/cli-trace.js`: 1-40

Cast used in the stories: **Maya Okafor** (human, product engineer), **Theo Lindqvist** (human, teammate), **Juniper** (agent, handle `@juniper`, a coding agent that uses the CLI with `--token-file`), and **Priya Raman** (human, operator of the project). The project is **Lantern Checkout**, with a second project **Harbor Docs**.

#### STORY-072: Move a task to Review with the quick Status select
*(was task-detail-conflicts/STORY-001)*
**Type**: short
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor, human product engineer. She just finished fixing a flaky test and wants the board to show it is ready for review.
**Goal**: Change the task's status from In progress to Review without opening the full editor.
**Preconditions**: Maya is signed in to Lantern Checkout. Task "Fix flaky webhook retry test" is In progress and assigned to her. There is no open editor or handoff form, no status conflict, and no pending request.
**Ideal path**: 2 — open the task, pick the new status (a status control on the card itself could make it 1).
**Alternate paths**:
- (a) **Edit task**, change **Status** in the form, **Save changes**.
- (b) **Hand off work** with **Handoff status** set to Review. Its default is already Review when the task is In progress (handoff.js:3), but this also reassigns the task and requires a message.
- (c) CLI: `pardner show <task>` to read `revisions.status`, then `pardner update <task> --status review --revisions '{"status":["op-…"]}'`.
- (d) Raw: `pardner operation --request JSON`.
**See also**: STORY-091, STORY-137
##### Steps
1. On the Tasks board, click the card "Fix flaky webhook retry test" in the In progress column → The Task details side panel opens. The heading "Fix flaky webhook retry test" gets focus. The card gets `aria-current`. The line under SaveStatus reads "Maya Okafor · human · P1". The status is left out of this line because the quick select shows it (Pardner.jsx:1273-1276).
2. Look for the status → A **Status** select, showing "In progress", sits in the actions row next to **Edit task** and **Hand off work** (Pardner.jsx:1350-1374).
3. Choose "Review" → The select shows Review right away (optimistic `statusChoice`). SaveStatus shows "Saving locally…", then "Saved locally · synced", or "Saved locally · waiting for hub" if the hub is behind. `task.update` is sent with `expectedRevisions: { status: revisions.status }`.
4. Look at the board behind the panel → The card has moved to the Review column and the column counts have updated. Focus goes back to the Status select (refocusStatus).
5. Scroll to **History** → A new row at the top reads "Maya Okafor moved this task to Review" (events.js `task.update` single status change), with a medium/short timestamp.
##### Variations
- Maya picks the same status by mistake: `next === task.status` returns early, and nothing is sent.
- Maya picks "Completed" instead of "Review": the card moves to the Completed column. If the task is on a vein whose other tasks are all closed, Goals may show "Ready for a verdict" (different topic).
- Mouse versus keyboard: Tab from the heading reaches the GitHub issue form first, because the issue section comes before the actions row (Pardner.jsx:1282 vs 1349). The Status select takes several Tab presses to reach.
##### Edge Cases
- Status conflict on the task: the select is hidden (`!conflicts?.status`, task-status.js:3-4). The summary line falls back to "Maya Okafor · human · In progress · P1" and a **Resolve status** section appears instead (see STORY-077).
- Editor or handoff form open: the select is hidden and the status moves into the summary line. The same information jumps between two places depending on mode.
- Someone else changed the status since the panel loaded and before the refetch landed: the server returns `STALE_UPDATE`, "This field changed since it was read; refresh its context". The panel-top notice adds "Your draft is preserved. Review the latest context before making a new edit." That wording is misleading, because the quick select has no draft. The select snaps back to the server value.
- A request is pending: the select is enabled (only `busy` disables it), but submit refuses with "Resolve the saved request before starting another change." (Pardner.jsx:434-439).
- Redundancy: status appears in the board column, the quick select or summary line, the Edit form, the Handoff status select, and History.

---

#### STORY-073: Edit draft survives closing the panel and reloading the tab
*(was task-detail-conflicts/STORY-002)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor. She is rewriting the acceptance criteria of a task when a Slack ping makes her close the panel, and she later hits Cmd-R by habit.
**Goal**: Finish a half-written edit after interruptions without losing text.
**Preconditions**: Task "Add Apple Pay to checkout sheet" (Backlog, P2, unassigned, tags `payments, ios`). Maya is signed in. Site storage is allowed.
**Ideal path**: 4 — open the task, Edit task, type, Save changes (interruptions add no steps because the draft persists).
**Alternate paths**:
- CLI `pardner update <task> --description "…" --priority p1 --revisions '{"description":["op-…"],"priority":["op-…"]}'`. The CLI has no draft, so it is a one-shot write.
- Activity subject buttons or a Profile focus link open the same panel.
**See also**: STORY-061, STORY-074
##### Steps
1. Click the card "Add Apple Pay to checkout sheet" → The panel opens with the description rendered as Markdown, or "No description yet." if it is empty.
2. Click **Edit task** → An inline "Edit task" editor replaces the description. It has **Title** (autofocused), **Description**, **Status**, **Priority**, **Assignee** (Unassigned / Actors), **Tags, separated by commas**, **Save changes** and **Cancel edit**. The quick Status select disappears and the summary line now includes "Backlog".
3. Change **Priority** to P1 and start typing in **Description**: "Acceptance: sheet shows Apple Pay when `canMakePayments` …" → Each keystroke is written to sessionStorage (`persistDraftEdits`, Pardner.jsx:1158-1162). Nothing is sent.
4. Press Escape while focus is in the Description textarea → The panel stays open, because Escape keeps the panel when the focused text field has content (`escapeKeepsPanel`). Maya hesitates, because she expected it to close.
5. Click **Close** in the panel header → The panel closes. The draft is not discarded.
6. Do something else, then click the same card again → The panel reopens straight into the editor with P1 and the half-written description (`client.draft(taskId)`, Pardner.jsx:1151).
7. Press Cmd-R → The page reloads. The board reopens with this task's panel already open, because `selected` is restored from localStorage preferences (Pardner.jsx:230). The editor still holds the draft from sessionStorage.
8. Finish the description and change **Tags** to "payments, ios, wallet" → The tags text is kept as typed (`tagsText`).
9. Click **Save changes** → Only the changed fields (description, priority, tags) are sent, each with its expected revision (Pardner.jsx:1321-1339). SaveStatus shows "Saving locally…". On success the editor closes, focus returns to **Edit task**, and the rendered description shows the new text.
10. Check **History** → It reads "Maya Okafor edited this task — Priority: P2 → P1 · Tags: payments, ios, wallet · Description edited" (events.js detailLine order: status, assignee, priority, title, tags, description).
##### Variations
- Maya clicks **Cancel edit** instead: the draft is cleared from storage (`setDraft(null)`) and focus returns to **Edit task**. There is no confirmation even when there is a lot of typed text.
- Maya clicks **Save changes** without changing anything: the editor just closes and no request is sent (Pardner.jsx:1328-1332).
- Maya blanks the Title to spaces: "Enter a title that is not only spaces." appears and Title is focused again.
##### Edge Cases
- Opening the task in a new browser tab or window: sessionStorage is per tab, so the draft is not there. The new tab shows the read view.
- Site storage blocked: `saveDraft` throws "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes." TaskDetail swallows it (`catch {}`), so the draft only lives in memory and Maya gets no warning. A reload loses it.
- The Escape press in step 4 with an empty textarea, or with focus on a select, closes the whole panel. The draft survives, but the behaviour feels inconsistent.
- Contrast with the **New task** draft, which is memory-only (Pardner.jsx:232) and is lost on reload. The two kinds of draft persist differently.

---

#### STORY-074: Edit draft survives a project switch and comes back
*(was task-detail-conflicts/STORY-003)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor. She works in two projects and jumps to Harbor Docs to answer a question while mid-edit in Lantern Checkout.
**Goal**: Return to Lantern Checkout and find the in-progress edit intact.
**Preconditions**: Maya belongs to Lantern Checkout and Harbor Docs. An edit draft is open on "Retry declined cards with SCA challenge" in Lantern Checkout.
**Ideal path**: 3 — open the project switcher, pick Harbor Docs, later pick Lantern Checkout (the draft reappears with no extra step).
**Alternate paths**: none found for switching (the project switcher is the only in-app route; `pardner client list/show --project` only reads).
**See also**: STORY-029, STORY-073
##### Steps
1. With the editor open, change **Assignee** to "Theo Lindqvist · human" and add a sentence to the description → The draft is saved under `pardner:{lantern workspaceId}:{maya actorId}:draft:{taskId}`.
2. Click the header switcher "Project: Lantern Checkout. Switch project" → A menu of projects appears as `menuitemradio` items (ClientApp.jsx:290-300).
3. Choose "Harbor Docs" → The Workspace remounts for Harbor Docs (ClientApp.jsx:544, `key={config.workspaceId}`), with its own filters, view and open task.
4. Open a Harbor Docs task, read it and close it → No effect on Lantern drafts.
5. Open the switcher and choose "Lantern Checkout" → The Lantern board loads ("Opening the project board…"). The previously open task panel reopens from preferences.
6. Look at the panel → The editor is open with Assignee = Theo and the extra sentence (draft restored per project, Actor and task).
7. Click **Save changes** → Assignee and description are sent with their revisions. History reads "Maya Okafor edited this task — Assignee: Unassigned → Theo Lindqvist · Description edited".
##### Variations
- Maya had also started a **New task** draft in Lantern before switching. It is gone on return, because it lives in Workspace memory and the remount discards it. Only edit drafts survive.
- Maya returns but a different task is open (she changed the selection in Lantern earlier): the draft for the first task stays in storage and reappears only when she opens that task again. Nothing on the board marks tasks that have an unsaved draft.
##### Edge Cases
- While Maya was away, Theo changed the assignee: the newer-save notice appears on return (see STORY-076).
- `WORKSPACE_MISMATCH` during a refresh: "The service workspace changed. Reopening the current workspace." Configuration reloads. Drafts are keyed by workspace, so they are not mixed across projects.
- The signed-in Actor changes (TaskDetail key `${selected}:${actor}`): drafts are per Actor, so a different Actor sees no draft.

---

#### STORY-075: Newer save on a field Maya did not touch
*(was task-detail-conflicts/STORY-004)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor, editing a task title. Meanwhile the agent Juniper bumps its priority through the CLI.
**Goal**: Save her title change without overwriting or being blocked by Juniper's priority change.
**Preconditions**: Task "Checkout button double-submits on slow 3G", P2, with Maya's edit draft open. Juniper runs `pardner update <task> --priority p0 --revisions '{"priority":["op-…"]}' --token-file ~/.pardner/juniper.token`.
**Ideal path**: 2 — read the notice, Save changes.
**Alternate paths**:
- Click **Base my draft on the latest version** first, then Save changes.
- Cancel edit and redo the edit.
- CLI `update --title` with fresh revisions from `show`.
**See also**: STORY-076
##### Steps
1. Maya changes **Title** to "Checkout button double-submits on slow networks" → The draft is persisted.
2. Juniper's CLI update lands. The heads change and the panel refetches context → A notice appears above the editor: "Juniper · agent saved a newer priority since you started editing. Your draft is unchanged." Below it, in small muted text: "If you also changed that field, saving is refused until you choose. Basing your draft on the latest version makes your save an explicit replacement." It ends with the button **Base my draft on the latest version** (Pardner.jsx:1283-1309).
3. Maya looks at the form: **Priority** still shows P2 although the task is now P0. She hesitates and wonders whether saving will revert it.
4. She clicks **Save changes** → Only `title` is sent, because priority equals the draft's base value and is not part of `updates`. The save succeeds and the priority stays P0.
5. The editor closes → The summary line reads "Unassigned · P0" (with the status hidden behind the quick select) and the heading shows the new title.
6. History shows "Juniper changed the priority of this task to P0" and "Maya Okafor renamed this task — Was “Checkout button double-submits on slow 3G”".
##### Variations
- Maya clicks **Base my draft on the latest version** before saving: the form remounts (`generation`+1). Priority now reads P0 and her title edit is kept, because untouched fields follow the latest version and touched ones are kept (Pardner.jsx:1293-1306). The notice disappears.
- Juniper changed tags while Maya had not touched the tags text: after rebasing, the tags text becomes the new tags (`tagsUntouched`).
- The newer save comes from a human through the quick Status select: the notice names "Theo Lindqvist · human saved a newer status".
##### Edge Cases
- The notice credits the last actor whose History event touched any of the newer fields (`newerBy`). If that event is missing, it says "Someone saved".
- More than one field is newer: "a newer priority, tags", with field keys joined raw. Field names are internal keys (`assignee`, `tags`), not form labels.
- Without rebasing, the form keeps showing stale values for untouched fields. This is a clarity risk, because the screen does not match what will be saved.

---

#### STORY-076: Newer save on a field Maya also changed (STALE_UPDATE then rebase)
*(was task-detail-conflicts/STORY-005)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor. She is reassigning a task to herself in the editor while Theo hands it to Juniper from his laptop.
**Goal**: Decide deliberately whose assignee wins, without silently clobbering Theo's change.
**Preconditions**: Task "Migrate Stripe webhooks to v2 endpoint", unassigned. Maya's draft sets Assignee = Maya. Theo saves Assignee = Juniper and Status = In progress first.
**Ideal path**: 3 — read the notice, Base my draft on the latest version, Save changes.
**Alternate paths**:
- **Cancel edit** and accept Theo's choice.
- Quick Status select or **Hand off work** after cancelling.
- CLI `pardner show` then `update --assignee maya --revisions …`.
**See also**: STORY-075, STORY-092
##### Steps
1. Maya picks "Maya Okafor · human" in **Assignee** and sets **Status** to "Up next" → The draft is stored.
2. Theo's save syncs → The notice reads "Theo Lindqvist · human saved a newer assignee, status since you started editing. Your draft is unchanged." and offers **Base my draft on the latest version**.
3. Maya skims past the notice and clicks **Save changes** → The server rejects the request with `STALE_UPDATE`. An error block appears above the Save button (FORM_SLOTS `task.update`): **"This field changed since it was read; refresh its context"** followed by "Your draft is preserved. Review the latest context before making a new edit." with a **Dismiss** button. The pending request is cleared because the error is definitive (Pardner.jsx:465-476). Focus returns to **Save changes**.
4. Maya reads History → "Theo Lindqvist edited this task — Status: Backlog → In progress · Assignee: Unassigned → Juniper".
5. She decides she still wants the task. She clicks **Base my draft on the latest version** → The form remounts. Her touched fields stay (Assignee = Maya, Status = Up next) and the base revisions move to Theo's. The notice goes away.
6. Click **Save changes** → The save is accepted as an explicit replacement. History reads "Maya Okafor edited this task — Status: In progress → Up next · Assignee: Juniper → Maya Okafor".
7. Maya adds a comment "@theo grabbing this, Juniper is on the SCA task" (comments topic).
##### Variations
- Maya picks **Cancel edit** at step 5: the draft is discarded and Theo's values stand.
- Maya only changed the assignee and Theo only changed the status: there is no STALE_UPDATE, because only the assignee is sent and its revision still matches (same as STORY-075).
##### Edge Cases
- After Dismiss the error is gone but the notice remains. The rebase button is the only path forward other than cancelling.
- The error text is the raw server message, which talks about "refresh its context". There is no Refresh button: the context refetches automatically on heads change, and the rebase button is the actual fix.
- Theo and Maya saved at the same instant on different replicas, so neither saw the other: no STALE_UPDATE happens. Both values survive as a field conflict (STORY-077).

---

#### STORY-077: Resolve a concurrent status conflict with "Keep this status"
*(was task-detail-conflicts/STORY-006)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Priya Raman, operator. She notices a red "Conflicting edits" label on a card after the hub link came back.
**Goal**: Pick the correct status so the task leaves the conflicted state.
**Preconditions**: While Maya's client showed "Saved locally · waiting for hub", Maya moved "Add 3DS fallback copy" to Review and Juniper, on the hub, moved it to Completed. After sync both alternatives are preserved.
**Ideal path**: 2 — open the task, click Keep this status on the right value.
**Alternate paths**:
- CLI: `pardner diff <task>` (returns `conflicts`) or `pardner show <task>` (`conflicts.status` and `revisions.status`), then `pardner resolve <task> --field status --value completed --revisions '["op-a","op-b"]'`.
- Raw `operation` with `task.resolve`.
**See also**: STORY-084, STORY-100
##### Steps
1. On the board, see "Conflicting edits" on the card (Pardner.jsx:670-674). The card sits in one column only, the merged winner's status.
2. Click the card → The panel opens. The summary line shows "Juniper · agent · Completed · P2". The quick **Status** select is absent (task-status.js:3-4).
3. Scroll past the actions row → A section headed **Resolve status** reads "Both edits are preserved. Choose the value to keep." It lists two blocks: **Maya Okafor · human** with the value `review`, and **Juniper · agent** with the value `completed` (Pardner.jsx:1432-1460).
4. Priya hesitates: the values are raw slugs (`review`, `completed`), not the labels "Review" / "Completed" used everywhere else, and nothing shows when each edit was made.
5. She checks History → It has "Maya Okafor moved this task to Review" and "Juniper moved this task to Completed".
6. She clicks **Keep this status** under Juniper → `task.resolve` is sent with `expectedRevisions: revisions.status` (both IDs). SaveStatus cycles.
7. The Resolve section disappears, the quick Status select returns showing Completed, and the "Conflicting edits" label is gone from the card.
8. History shows "Priya Raman resolved conflicting status on this task — Kept Completed" (events.js `task.resolve`).
##### Variations
- Priya instead runs `pardner resolve <task> --field status --value review --revisions '["op-a","op-b"]'` → The same result appears in the panel after sync.
- Several fields conflict at once: one **Resolve {field}** section per field, each with its own **Keep this {field}** buttons. They must be resolved one by one.
##### Edge Cases
- Trying to change the conflicted field through **Edit task** → Save changes: `CONFLICT_REQUIRES_RESOLUTION`, "Resolve the concurrent alternatives explicitly". The draft is kept. Saving other fields works.
- **Hand off work** writes status and assignee, so it also fails with `CONFLICT_REQUIRES_RESOLUTION` while either field is conflicted.
- Resolve with stale revisions (a third concurrent edit arrived): `STALE_UPDATE`.
- CLI resolve with only one of the revisions: `STALE_UPDATE`, because the expected set must match exactly.
- Redundancy: the conflict is flagged on the card, in the Resolve section, in History (two contradictory events), and in `diff` / `show`.

---

#### STORY-078: Resolve an assignee or tags conflict where the values are raw data
*(was task-detail-conflicts/STORY-007)*
**Type**: short
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Theo Lindqvist, human. He finds a task that two people assigned concurrently.
**Goal**: Keep the right assignee.
**Preconditions**: "Localize receipt emails (de, fr)" has concurrent assignee values (Maya and Juniper) and concurrent tags (`["i18n"]` and `["i18n","email"]`).
**Ideal path**: 3 — open the task, Keep this assignee, Keep this tags.
**Alternate paths**: `pardner resolve <task> --field assignee --value <actorId> --revisions …`; `--field tags --value '["i18n","email"]'` (the value is parsed as JSON for tags and order); `--value null` for unassigned.
**See also**: STORY-102
##### Steps
1. Open the task → Two sections, **Resolve assignee** and **Resolve tags**.
2. Read **Resolve assignee** → Author lines read "Maya Okafor · human" and "Juniper · agent", but the values are raw Actor IDs (e.g. `actor-7f3c…`), because `choice.value` is a string and is printed verbatim (Pardner.jsx:1440-1442). Theo has to work out which ID is whom.
3. Click **Keep this assignee** under the alternative authored by Maya → The section disappears. History: "Theo Lindqvist resolved conflicting assignee on this task — Kept Maya Okafor".
4. In **Resolve tags**, values render as JSON, e.g. `["i18n","email"]`. Click **Keep this tags** (the label is ungrammatical) → History: "… resolved conflicting tags … — Kept i18n, email".
##### Variations
- Description conflict: each alternative's full text appears as a plain `<p>` (no Markdown). History reads "Kept the chosen version".
- Title conflict: "Keep this title", and the heading shows only the merged winner.
##### Edge Cases
- Assignee alternative of null (unassigned): JSON `null` shows as an empty or "null" paragraph.
- Button labels use field keys ("Keep this tags", "Keep this assignee"), unlike goal and vein conflicts, which say "Keep {value}" or "Keep {authors}'s {field}" (RecordConflicts.jsx). This is inconsistent copy for the same concept.

---

#### STORY-079: Link a GitHub issue to a task (with input mistakes)
*(was task-detail-conflicts/STORY-008)*
**Type**: short
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor. She wants the task to point at the bug report a customer filed on GitHub.
**Goal**: Record `acme/lantern-checkout#418` on the task.
**Preconditions**: Task "Fix tax rounding on multi-currency carts" is open, with no linked issues.
**Ideal path**: 2 — type the reference, click Link issue.
**Alternate paths**: CLI `pardner issue link <task> acme/lantern-checkout#418`. Agents go through `client operation` / `--token-file`, and the proxy allows `task.link-issue` (client-proxy.js:5-7).
**See also**: STORY-128
##### Steps
1. In the panel, find **GitHub issues** directly under the header → "No linked issues. Linking does not contact GitHub." with the field **Link GitHub issue** (placeholder `owner/repo#123`). **Link issue** is disabled while the field is empty.
2. Paste "#418" → Click **Link issue** → "Name the issue as owner/repo#number." (role=alert). Nothing is sent.
3. Fix it to "acme/lantern-checkout 418" → Same error.
4. Type "Acme/Lantern-Checkout#418" → Click **Link issue** → `task.link-issue` is sent. The repository is lowercased by the server (`issueReference`). The list shows the link "acme/lantern-checkout#418" (opens `https://github.com/acme/lantern-checkout/issues/418` in a new tab) with **Unlink**. The field clears.
5. Look at History → A row reads "Maya Okafor recorded task.link-issue on this task". `describeEvent` has no case for issue links, so it falls to the default branch (events.js default case) with the raw type name and no issue number.
##### Variations
- Linking a second issue `acme/payments-sdk#77`: the list sorts by repository, then number.
- Linking the same issue twice: no error. One row is shown, with an extra revision added underneath (`issueLinkIndex`).
##### Edge Cases
- "acme/lantern-checkout#0" passes the UI regex but the server rejects it: "Issue number must be a positive integer". The error appears at the panel top, not beside the issue form, because `task.link-issue` is not in FORM_SLOTS.
- A repository with characters outside `[a-z0-9._-]`, or an owner longer than 39 characters: "Repository must be a GitHub owner/name".
- The CLI regex has no trimming (`/^([^#\s]+)#(\d+)$/`), while the UI trims surrounding spaces.
- The issue state is never fetched. A closed GitHub issue does not move the task (IssueLinks doc comment, Pardner.jsx:1082).
- Pardner has two GitHub-related settings: this per-task issue link, and the Control tab's per-project **GitHub repository**. They are not connected. (Discovery mentions the second one, and the issue form does not default to it.)

---

#### STORY-080: Unlink a wrongly linked GitHub issue
*(was task-detail-conflicts/STORY-009)*
**Type**: short
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Theo Lindqvist. He linked the wrong issue number.
**Goal**: Remove `acme/lantern-checkout#481` from the task.
**Preconditions**: The task has that link.
**Ideal path**: 1 — click Unlink.
**Alternate paths**: CLI `pardner show <task>` (read `issues[].revisions`), then `pardner issue unlink <task> acme/lantern-checkout#481 --revisions '["op-…"]'`.
##### Steps
1. Click **Unlink** beside "acme/lantern-checkout#481" → `task.unlink-issue` is sent with that link's revisions. There is no confirmation.
2. The row disappears. If it was the only link, "No linked issues. Linking does not contact GitHub." returns.
3. History adds "Theo Lindqvist recorded task.unlink-issue on this task" (raw default sentence).
4. Theo types "acme/lantern-checkout#418" and clicks **Link issue** to add the right one.
##### Variations
- Two links: only the clicked one goes away.
##### Edge Cases
- Add-wins: if Maya re-linked #481 on another replica concurrently, Theo's unlink retires only the revisions he observed. The link reappears after sync (workspace-schema.js:228 comment).
- CLI unlink of an issue that is not linked: `NOT_FOUND`, "This task is not linked to that issue". Stale `--revisions`: `STALE_UPDATE`.
- **Unlink** is disabled while busy. A pending request blocks the click with "Resolve the saved request before starting another change."

---

#### STORY-081: Agent commits work and the human reviews Evidence and History
*(was task-detail-conflicts/STORY-010)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Juniper (agent) commits a fix. Maya Okafor (human) checks the proof before moving the task to Review.
**Goal**: Attach commit evidence to the task and confirm it from the board.
**Preconditions**: Juniper has a token file from `client agent-grant`. The repo is a Git repository. The task is "Retry webhook delivery with jitter" (In progress).
**Ideal path**: 3 — the agent runs one `pardner commit`, the human opens the task and reads Evidence.
**Alternate paths**:
- `git commit` then `pardner link-commit <task> --commit '{"hash":"…","message":"…"}'`.
- Read the evidence with `pardner trace task <task>`, `pardner trace show <commit>`, Activity filtered to commits, or `pardner activity --task <id>`.
**See also**: STORY-118, STORY-126
##### Steps
1. Juniper runs `pardner commit --task task-… --model gpt-5 --session s-91 --token-file ~/.pardner/juniper.token -- -am "Retry webhook delivery with exponential jitter"` → Git output goes to stderr. stdout prints `{success:true, trace, receipt}`. The trace is recorded and `task.link-commit` executed (cli-trace.js:16-38).
2. Maya sees the panel refresh (heads change) → **Evidence** now lists `3f9a2c1d…` (full hash in `<code>`) and the message "Retry webhook delivery with exponential jitter". There is no author or time.
3. She scrolls to **History** → "Juniper linked commit 3f9a2c1 to this task — “Retry webhook delivery with exponential jitter”" (short hash, first line truncated at 100 characters).
4. She opens **Activity** in a separate view, chooses the commits filter, and finds the same event with the task as a button.
5. Satisfied, she uses the quick **Status** select to choose Review (see STORY-072).
##### Variations
- Without `--task`, the trace is recorded but nothing is linked, and Evidence stays "No commit evidence linked yet."
- Juniper adds a comment summarizing the change (comments topic).
##### Edge Cases
- Outside a repo: `GIT_REPOSITORY_REQUIRED`, "Run this command inside a Git repository".
- No actor: `ACTOR_REQUIRED`. No args after `--`: "Put Git commit arguments after --". Git failure: `GIT_COMMIT_FAILED`.
- The commit succeeds but link-commit fails: the error details carry `commitHash`, `traceRecorded: true` and `recovery: "Use link-commit with this existing commit; do not create another Git commit"`.
- Redundancy: the same commit appears in Evidence (full hash and message), History (short hash and quote), Activity, `trace task` and `activity`. Evidence adds nothing that History lacks except the full hash.

---

#### STORY-082: Reconstruct what happened to a task from History
*(was task-detail-conflicts/STORY-011)*
**Type**: short
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Priya Raman, operator. She is asked why "Remove legacy PayPal button" ended up Abandoned.
**Goal**: Read the task's change trail.
**Preconditions**: The task has several edits, a handoff and comments.
**Ideal path**: 2 — open the task, scroll to History.
**Alternate paths**:
- Activity view, filtered by Actor or category, with clickable subjects.
- `pardner activity --task <id> --limit 50`, or `pardner diff <task>` (field-level old/new with actorId and operationId).
- `pardner show <task>` (`history`).
**See also**: STORY-104
##### Steps
1. Open the task → Scroll to **History** at the very bottom, below Comments, the composer and Evidence.
2. Read the rows, newest first (`sortEvents`) → For example: "Theo Lindqvist moved this task to Abandoned", "Juniper handed this task to Theo Lindqvist and set it to Review — “Blocked on finance sign-off…”", "Maya Okafor created this task — Backlog · P2 · Unassigned".
3. She notices that plain comments are missing (filtered out, Pardner.jsx:1643), but the handoff message excerpt is shown, and comment edits appear as "… edited a comment on this task".
4. Hovering a row shows the event type (`title={event.type}`). The timestamps are medium date with short time.
##### Variations
- Read receipts never appear (filtered server-side, workspace-schema.js:374).
##### Edge Cases
- Subjects in History are plain text (no handlers), unlike Activity where they are buttons.
- Long-lived tasks: History has no paging, unlike Activity's **Show older activity**.
- Deleted comment referenced by a handoff: "This comment was later deleted."
- Issue link and unlink rows read "recorded task.link-issue" (raw).

---

#### STORY-083: Inspect an operation integrity conflict
*(was task-detail-conflicts/STORY-012)*
**Type**: medium
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Priya Raman, operator. She was alerted because the bridge refused to continue for a task.
**Goal**: Understand the conflicting acknowledged requests sharing one retry key.
**Preconditions**: Two replicas each acknowledged a different request under the same `operationId` (retry key) touching "Rotate Stripe restricted key".
**Ideal path**: 2 — open the task, expand the variants.
**Alternate paths**:
- `pardner show <task>` returns `integrityConflicts`.
- A write with that key returns `OPERATION_INTEGRITY_CONFLICT` with `details.variants`.
- The agent bridge and bridge retirement stop on `integrityConflicts` (agent-bridge.js:294, bridge-retirement.js:86).
**See also**: STORY-133, STORY-137
##### Steps
1. Open the task → A section **Unresolved operation ID conflict** appears after the actions row (aria-label "Operation integrity conflict").
2. Read: "Retry key {requestId} acknowledged different requests. Both are preserved. Inspection does not replay or repair them." (Pardner.jsx:1420-1431).
3. Expand the first `<details>` → The summary reads "task.update by actor-2c91… — {fingerprint}", with the raw actor ID rather than a name. The body is pretty-printed JSON of the event.
4. Expand the second → It is a different payload, e.g. a status change and a priority change.
5. Priya looks for a button to pick one. There is none in the UI or the CLI. She records the finding and fixes the fields with normal edits or resolves.
##### Variations
- Several groups: one section per retry key, sorted by requestId.
##### Edge Cases
- If the browser's own pending request is the one with that key, retrying returns `OPERATION_INTEGRITY_CONFLICT`. This code is not in the definitive list (Pardner.jsx:465-476), so the pending request is kept. **Retry saved request** keeps failing, **Dismiss** is hidden while pending, and **New task** stays disabled. This is a potential dead end.
- `OPERATION_ID_REUSED` ("This operation ID already belongs to a different request") is definitive and clears pending.

---

#### STORY-084: A full collaborative day on one task
*(was task-detail-conflicts/STORY-014)*
**Type**: long
**Topic**: Task detail, editing, drafts and conflicts
**Persona**: Maya Okafor (human lead), Juniper (agent) and Theo Lindqvist (human reviewer), on Lantern Checkout.
**Goal**: Take "Support partial refunds in admin" from Backlog to Review with an issue link, evidence and a clean conflict history.
**Preconditions**: The task exists in Backlog, P2, unassigned. All three Actors are on the project. Juniper works through the CLI with a token file.
**Ideal path**: 12 — open the task, link the issue, edit (assign, status, description), save, agent commit, resolve one conflict, quick status to Review, verify History.
**Alternate paths**: Every UI step has a CLI equivalent (`issue link`, `update`, `resolve`, `commit`, `diff`, `show`). Status could also move by **Hand off work**.
**See also**: STORY-076, STORY-077, STORY-081
##### Steps
1. Maya clicks the card → The panel opens. The heading is focused and the summary line reads "Unassigned · P2".
2. She types "acme/lantern-checkout#512" in **Link GitHub issue** and clicks **Link issue** → The link appears with **Unlink**.
3. She clicks **Edit task** → The editor opens and the quick Status select disappears.
4. She sets **Assignee** to "Juniper · agent", **Status** to "Up next" and **Priority** to P1, and starts a checklist in **Description**.
5. A meeting starts. She clicks **Close** → The panel closes and the draft is kept.
6. She switches to Harbor Docs to answer something, then switches back → The task panel reopens with her draft.
7. Meanwhile Theo changed the priority to P0 → The notice reads "Theo Lindqvist · human saved a newer priority since you started editing. Your draft is unchanged."
8. Maya clicks **Save changes** without rebasing → `STALE_UPDATE`: "This field changed since it was read; refresh its context" / "Your draft is preserved…".
9. She reads History, agrees with P0, and decides to drop her priority edit. She sets **Priority** back to P2, the draft's base, so it is no longer an update. She hesitates over whether that is right.
10. **Save changes** → Assignee, status and description are saved. Priority stays P0.
11. Juniper runs `pardner show <task> --token-file …`, reads its assignment, and later runs `pardner commit --task <id> -- -am "Add partial refund endpoint and admin form"` → Evidence lists the commit, and History says "Juniper linked commit 9b1e4a0 to this task — “Add partial refund endpoint and admin form”".
12. While Maya's client was "Saved locally · waiting for hub", she moved the task to In progress with the quick select, and Juniper moved it to Review on the hub.
13. After sync the card shows "Conflicting edits". In the panel the quick select is gone and **Resolve status** lists `in-progress` (Maya) and `review` (Juniper).
14. Maya clicks **Keep this status** under Juniper → History: "Maya Okafor resolved conflicting status on this task — Kept Review".
15. Theo opens the task and reads Evidence and History. He uses **Hand off work** to return it to Juniper with feedback (handoff topic).
16. Maya confirms the GitHub issue link is still present and opens it in a new tab to post her own update (Pardner never posts to GitHub).
17. Final History check: create, link-issue (raw sentence), edits, commit, the two status moves, the resolve, and the handoff with its excerpt.
##### Variations
- At step 8 Maya uses **Base my draft on the latest version**: her P1 would replace Theo's P0 on save. This is a deliberate overwrite, made explicit by the copy.
- At step 14 she resolves through `pardner resolve <task> --field status --value review --revisions '[…]'`.
##### Edge Cases
- If step 12's offline edit also touched the assignee, a second **Resolve assignee** section appears with raw Actor IDs as values.
- If Maya's step-12 change was still pending when the hub returned, the pending notice and the conflict could stack. The request and the conflict are independent.
- The task's status shows in up to five places during this flow: card column, summary line, quick select or Resolve section, editor, and History.

---

### Comments, mentions, read receipts and handoff


Source files read: `ui-prototype/src/Pardner.jsx` (TaskPanel 1117-1655, submit and pending ops 430-480, ErrorNotice 91-107, SelectActor/labelActor 52-80), `ui-prototype/src/mentions.js`, `ui-prototype/src/comments.js`, `ui-prototype/src/handoff.js`, `ui-prototype/src/events.js`, `lib/cli.js` (HELP 38-48, 79-85; runCommand 160-283), `lib/workspace-commands.js` (mentions and comments 58-100, handoff/comment/edit/delete/read 222-286), `lib/workspace-schema.js` (checkRevisions 135-139, resolveActor 89-96, activeMentions 345-351, unread 367-388), `lib/delivery-ledger.js`, `lib/workspace-runtime.js:225-262`, `lib/client-proxy.js`, `lib/client-cli.js:170-174`, `lib/client-service.js:349-364`, `lib/client-identity.js:35-41`, `test/mention-lifecycle.test.js`.

Findings that apply to several stories:
- **Handles are opaque in client projects.** Client Actors get handles `human-<identityId>` and `agent-<20-hex>-<harnessId>` (lib/client-identity.js:38-39). No browser surface shows a handle: profiles, People, the Recipient select and comment authors all use `displayName · kind`. To @mention someone in the browser you have to get their handle from the CLI (`pardner client show --project ID` → `actors`, or the `actors` command). `@dana` or `@codex` therefore almost always gets the hint "@dana matches no Actor and won't notify anyone."
- **Comment edit, resolve and delete:**
  - Edit and resolve are author-only on the server: `FORBIDDEN` "Only the comment author may edit or resolve it" (workspace-commands.js:251).
  - **Delete has no author check** (workspace-commands.js:263-267). Any Actor holding the current revisions can delete anyone's comment. The "authors only" rule covers edit and resolve only.
  - The browser has no edit or delete UI. It offers only **Keep this comment**, and shows it to every viewer, not just the author.
- **FORBIDDEN leaves a stuck pending request.** `FORBIDDEN` is not in the list of errors that clear the pending operation (Pardner.jsx:464-476). After it, the notice shows only **Retry saved request**, because Dismiss is hidden while an op is pending. Every other change is then refused with "Resolve the saved request before starting another change." (Pardner.jsx:434-438), and the project switcher shows " · unconfirmed change".
- **Agent display names are harness IDs.** An agent's `displayName` is its harness ID (client-service.js:148), so agents appear as "openai-codex · agent", "anthropic-claude-code · agent" or "cursor · agent".
- **Reads never mark comments seen.** `show` and `comments` do not mark anything read (cli.js:85). Only **Mark all read** or `pardner read --receipts` writes receipts.

#### STORY-085: Post a progress comment with no mentions
*(was comments-mentions-handoff/STORY-001)*
**Type**: short
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Priya Raman, backend lead on project "Ledger Sync", working in the browser opened with `pardner open`
**Goal**: Leave a quick status note on the task "Retry failed webhook deliveries"
**Preconditions**: Signed in, identity confirmed, project open, the task exists, the Actor has synced (so `canWrite` is true)
**Ideal path**: 3 — open the task, type, submit
**Alternate paths**: CLI `pardner comment <task> "text"` (an operator or `--actor` caller in standalone mode); agent `pardner comment <task> "text" --token-file FILE`
**See also**: STORY-104
##### Steps
1. Click the "Retry failed webhook deliveries" card in the **In progress** column → the **Task details** side panel opens, the title gets focus, and SaveStatus shows "Saved locally · synced".
2. Scroll past GitHub issues, Edit task, **Hand off work**, then **Comments 2** → the existing comments appear with author "Priya Raman · human", a localized timestamp and Markdown bodies.
3. Click the **Comment** textarea (placeholder "Share progress or mention an Actor with @handle") and type "Backoff now caps at 5 attempts; `deliveries.retry_count` added." → **Add comment** becomes enabled once the text is non-blank (Pardner.jsx:1623).
4. Click **Add comment** → the button disables while busy, the comment appears at the bottom, the heading becomes **Comments 3**, and the textarea clears (only if the text was not changed mid-request; Pardner.jsx:1604).
##### Variations
- Text is only whitespace: **Add comment** stays disabled. The textarea is also `required`.
- A Markdown image `![trace](https://…)`: shown as alt text only (discovery §8).
- Same content in other places: the comment appears in the panel's Comments, and in **Activity** as "Priya Raman commented on Retry failed webhook deliveries" (events.js:172-176), filterable by **Show: Comments**. The task's **History** section leaves comments out (Pardner.jsx:1643). This is a candidate for redundancy review.
##### Edge Cases
- The local service drops mid-submit: the error notice shows the message, "Your last confirmed data remains available." and **Retry saved request**. The project switcher shows " · unconfirmed change".
- Another pending request already exists: "Resolve the saved request before starting another change." (Pardner.jsx:434-438).
- The Actor is not yet on the board (`actor` null): **Add comment** is disabled, and **Mark all read** plus the new-count are hidden.

---

#### STORY-086: Try to @mention a teammate by name and get the "matches no Actor" hint
*(was comments-mentions-handoff/STORY-002)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Marcus Hale, frontend dev on "Ledger Sync", wants Priya to review a UI change
**Goal**: Notify Priya through a comment mention
**Preconditions**: Priya joined via a Human invitation; Marcus is viewing task "Settings page: webhook secret rotation"
**Ideal path**: 3 — open the task, type @ and pick from autocomplete, submit (no autocomplete exists today)
**Alternate paths**: **Hand off work** to Priya (the recipient is always notified, with no handle needed); CLI `pardner comment <task> "@human-… …"` after looking up the handle with `pardner client show --project ID`
**See also**: STORY-096, STORY-126
##### Steps
1. Open the task panel → Comments section visible.
2. Type "@priya can you review the rotation modal?" → while the textarea is focused and the handle is still at the end, no hint shows (unmatchedHandles waits for a terminator; mentions.js:9-21). After the space it shows "@priya matches no Actor and won't notify anyone." linked by `aria-describedby="comment-mention-hint"`.
3. Hesitate and try "@Priya" → the same hint ("@Priya matches no Actor…"); matching is case-insensitive but on handle, not display name.
4. Open the **You: Marcus Hale** button, then the AvatarStack, then Priya's profile → the ProfileDialog shows "Works for", Harness, Git name/email and Devices, but no handle.
5. Give up in the browser and run `pardner client show --project <id>` in a terminal → the `actors` list shows Priya's handle `human-3f2c…` (a UUID-like value).
6. Replace the text with "@human-3f2c… can you review the rotation modal?" → the hint disappears.
7. Click **Add comment** → the comment renders. `@human-3f2c…` becomes a mention chip with tooltip "Notified Priya Raman · human" (mentions.js:51-55; Pardner.jsx:1242-1244).
8. Priya (on her own client) opens the task → the comment shows the **New** tag and the heading reads **Comments N · 1 new**.
##### Variations
- Two unknown handles: "@priya and @dana match no Actor and won't notify anyone." Three or more: "@a, @b and @c match…".
- Email text "ops@priya.dev": skipped by the UI hint and by chip rendering (EMAIL_LOCAL check). See the Edge Cases.
- Handles inside `inline code` or links: no chip (SKIP set, mentions.js:36).
##### Edge Cases
- Server matching differs from the UI. `mentionedActors` (workspace-commands.js:58-61) has no email-local check, so "ops@human-3f2c…" in text would notify that Actor server-side but render no chip.
- Mentioning an Actor whose comment is later deleted cancels the delivery (`activeMentions` excludes deleted comments; test/mention-lifecycle.test.js:114-124).
- The same handle typed twice gives one delivery per (comment, Actor) (idempotency key digest; workspace-commands.js:67-68).
- Redundancy: "who was notified" exists only as the chip tooltip. Mentions are not listed anywhere else in the browser.

---

#### STORY-087: Catch up on new comments and Mark all read
*(was comments-mentions-handoff/STORY-003)*
**Type**: short
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Priya Raman returning after a day off
**Goal**: Read new comments on "Retry failed webhook deliveries" and clear the New markers
**Preconditions**: Marcus and the agent "openai-codex · agent" commented since Priya's last receipt
**Ideal path**: 2 — open the task, mark read (or auto-read on view)
**Alternate paths**: `pardner read <task> --receipts '[{"commentId":"…","revisionId":"…"}]'` with revisionIds from `pardner show <task>`
**See also**: STORY-093
##### Steps
1. Open the task → the heading shows **Comments 5 · 2 new**. Two articles have class `is-new` and a **New** tag.
2. Read the comments → nothing changes. Viewing does not write receipts (cli.js:85).
3. Click **Mark all read** → `read.mark` sends every revision of every comment, including Priya's own. The **New** tags disappear, the count suffix goes away, and the button disables (`!newCount`).
4. Open **Activity** with **Show: Read receipts** → "Priya Raman read 5 comments on Retry failed webhook deliveries" (events.js:182-185).
##### Variations
- No new comments: **Mark all read** is visible but disabled.
- Own comments never count as new (comments.js:3-6).
- Read with CLI: `pardner comments <task>` lists them without marking; `pardner read …` marks only the revisions supplied.
##### Edge Cases
- A comment edited after reading gets a new revision, so it shows **New** again (unread is per revision).
- A receipt for a revision from another task: "A read receipt must refer to an observed revision of this task’s comment" (workspace-commands.js:279-280).
- `--receipts` missing or bad JSON: "Supply --receipts" / "--receipts must be valid JSON" (`INVALID_ARGUMENT`).
- Redundancy: the unread count shows only inside the task panel. Board cards carry no unread badge, so a person must open each task to find new comments.

---

#### STORY-088: Resolve a concurrent comment edit with Keep this comment (author)
*(was comments-mentions-handoff/STORY-004)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Marcus Hale, who edited his own comment from two devices (laptop and desktop, linked via My device) while offline
**Goal**: Choose which version of his comment survives
**Preconditions**: Two `comment.edit` revisions of the same comment merged, so `comment.conflicts` lists both
**Ideal path**: 2 — open the task, click Keep on the preferred version
**Alternate paths**: `pardner comment-resolve <comment> "final text" --revisions '["op-a","op-b"]'` (CLI also accepts new text, not just one of the alternatives)
**See also**: STORY-089
##### Steps
1. Open the task → the comment shows its current content followed by one `.conflict` block per alternative: author "Marcus Hale · human", that version's text, and **Keep this comment**.
2. Compare "Rotation modal uses 2-step confirm" with "Rotation modal uses typed confirmation".
3. Click **Keep this comment** under the second → `comment.resolve` with `expectedRevisions: comment.revisionIds`. The conflict blocks disappear and the content updates.
4. The comment shows **New** to other readers (new revision).
5. Activity: "Marcus Hale kept one version of a comment on Settings page: webhook secret rotation".
##### Variations
- Resolving with the CLI: `pardner comment-resolve` needs `--revisions` listing all alternatives (allowConflict true).
- Editing instead with the CLI while conflicted: `comment-edit` fails `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly".
##### Edge Cases
- A new edit lands between view and click: `STALE_UPDATE` "This field changed since it was read; refresh its context". The UI clears pending and adds "Your draft is preserved. Review the latest context before making a new edit."
- Mentions in the kept text are re-evaluated. Delivery stays active only for Actors mentioned in a surviving alternative (activeMentions).

---

#### STORY-089: A non-author clicks Keep this comment and gets stuck behind a saved request
*(was comments-mentions-handoff/STORY-005)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Priya Raman, tidying a conflicted comment that Marcus wrote
**Goal**: Pick a version of someone else's conflicted comment
**Preconditions**: Marcus's comment has two alternatives; Priya is viewing it
**Ideal path**: 0 — the button should not be offered to non-authors (it is)
**Alternate paths**: Ask Marcus to resolve it; Marcus runs `pardner comment-resolve`
**See also**: STORY-137, STORY-138
##### Steps
1. Open the task → Priya sees the **Keep this comment** buttons, enabled (only `!canWrite` disables them).
2. Click **Keep this comment** → the request fails with `FORBIDDEN` "Only the comment author may edit or resolve it".
3. The error notice shows "Only the comment author may edit or resolve it", "Your last confirmed data remains available." and only **Retry saved request**. There is no Dismiss, because FORBIDDEN does not clear pending (Pardner.jsx:464-476).
4. Priya tries to add a normal comment → "Resolve the saved request before starting another change."
5. Click **Retry saved request** → it fails again with FORBIDDEN.
6. Open the project switcher → the project row shows " · unconfirmed change".
7. Reload → the pending op persists in sessionStorage, so she stays stuck until the session's storage is cleared.
##### Variations
- Same trap for any FORBIDDEN on a board op, e.g. a revoked membership with "Human authority required".
##### Edge Cases
- Severity: blocks all further writes in that tab. Strong UX defect.

---

#### STORY-090: Edit or delete a comment (CLI only) and the delete-permission gap
*(was comments-mentions-handoff/STORY-006)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Marcus Hale, who mistyped a migration name in a comment
**Goal**: Fix the comment, and later delete an obsolete one
**Preconditions**: CLI access as the client operator, or as an agent with `--token-file`
**Ideal path**: 3 — hover the comment, Edit, Save (the browser has no such UI)
**Alternate paths**: none in browser; `pardner operation --request JSON` with type `comment.edit`/`comment.delete`
**See also**: STORY-128
##### Steps
1. Look for an Edit or Delete affordance on the comment in the browser → none exists.
2. Run `pardner show task-… --token-file ~/.pardner/agent-codex.json` (or as operator) → find the comment's `id` and `revisionIds` in `comments`.
3. Run `pardner comment-edit comment-… "Ran migration 0042_webhook_retry" --revisions '["op-…"]'` → `{success:true, …}`.
4. The browser refreshes → the content updates and other readers see **New** again. Activity: "… edited a comment on …".
5. Later: `pardner comment-delete comment-… --revisions '["op-…"]'` → the comment disappears and the count drops. Activity: "… deleted a comment on …", and older events referencing it note "This comment was later deleted." (events.js:10).
##### Variations
- Omit `--revisions`: "Supply --revisions" (`INVALID_ARGUMENT`). A non-array gives `REVISION_REQUIRED` "Supply the observed field revisions".
- Edit by a non-author: `FORBIDDEN` "Only the comment author may edit or resolve it".
##### Edge Cases
- **Delete by a non-author succeeds.** `prepareCommentDelete` has no author check (workspace-commands.js:263-267), so any Actor, including an agent, can delete a human's comment.
- Deleting a comment with mentions tombstones pending deliveries. An outstanding claim then gets `STALE_CLAIM` on ack.
- Deleted/missing comment ID: `NOT_FOUND` "Comment not found: …".

---

#### STORY-091: Hand off in-progress work to a reviewer
*(was comments-mentions-handoff/STORY-007)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Marcus Hale finishing "Settings page: webhook secret rotation"
**Goal**: Reassign to Priya for review with a note
**Preconditions**: Task status In progress, assignee Marcus, no field conflicts
**Ideal path**: 4 — Hand off work, choose recipient, write message, Hand off
**Alternate paths**: CLI `pardner handoff <task> --to <actor id|handle> --status review --message "…" --revisions '{"assignee":[…],"status":[…]}'`; separately do Edit task (assignee + status) and then Add comment, which takes more steps and needs a handle to notify
**See also**: STORY-072, STORY-094
##### Steps
1. Click **Hand off work** → the section **Hand off work** opens and focus goes to **Recipient** ("Choose an Actor"). **Handoff status** is preset to **Review** because the task is In progress (handoff.js:3). The quick Status select hides while the handoff is open (task-status.js).
2. Choose "Priya Raman · human".
3. Leave status Review. Type the **Handoff message** "Ready for review — QA notes in PR #212." → **Hand off** enables (needs recipient, message, not stale).
4. Click **Hand off** → the form closes and focus returns to **Hand off work**. Status line: "Handed off to Priya Raman · human · Review."
5. The panel line updates to "Priya Raman · human · Review · P2". The card moves to the **Review** column.
6. The message appears in **Comments** as a comment by Marcus. Priya is notified even without an @handle, since the recipient is added to mentions (workspace-commands.js:65).
7. Activity: "Marcus Hale handed Settings page… to Priya Raman and set it to Review".
##### Variations
- The task is in Backlog: status defaults to Backlog (unchanged). The handoff then only reassigns.
- Change the status manually to In progress: marks `handoffStatusTouched`, so "Use latest task details" won't override it.
- **Cancel handoff** clears recipient, message and base, and returns focus to the opener.
- Recipient list includes yourself and agents. Handing off to yourself is not blocked.
##### Edge Cases
- Redundancy: one handoff shows up in five places: the success status line, the Comments list (as a comment), the History section, Activity ("Status changes and handoffs" and not "Comments") and the board column move.
- No chip renders for the recipient unless the message contains their @handle, so there is no visible "Notified" cue for the handoff recipient.
- Task has an assignee/status conflict: `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly". Resolve via **Keep this assignee**/**Keep this status** first.

---

#### STORY-092: Someone changes the task while you're writing a handoff
*(was comments-mentions-handoff/STORY-008)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Priya Raman handing "Retry failed webhook deliveries" to the agent while Marcus edits it
**Goal**: Complete the handoff against the latest task state without losing the message
**Preconditions**: Handoff form open with a draft; Marcus changes status or assignee concurrently
**Ideal path**: 2 — acknowledge the change, resubmit
**Alternate paths**: Cancel handoff and start again; CLI with fresh `--revisions` from `pardner show`
**See also**: STORY-076
##### Steps
1. Open **Hand off work**, choose "openai-codex · agent", type a long message.
2. Marcus sets the status to Review from his browser → after sync, a notice appears: "This task changed while you were writing: now Marcus Hale · human · Review. Your draft is preserved." with **Use latest task details**. **Hand off** disables.
3. Hesitate and try to click **Hand off** → disabled.
4. Click **Use latest task details** → the base revisions update. If status was untouched it resets to `defaultHandoffStatus('review')`, i.e. Review. The notice disappears and the message stays.
5. Click **Hand off** → "Handed off to openai-codex · agent · Review."
##### Variations
- Priya had already chosen a status manually: it is kept after Use latest task details.
- The change lands after clicking Hand off but before the server checks: `STALE_UPDATE` "This field changed since it was read; refresh its context" plus "Your draft is preserved. Review the latest context before making a new edit." The form stays open.
##### Edge Cases
- Only assignee and status revisions are watched (`handoffRevisions`). Title or description edits don't trigger the notice.
- The base is captured on open and on first focus (`onFocusCapture`).
- If the handoff form is closed while an error is pending, the error moves to the panel top so Retry stays visible (Pardner.jsx:1255-1258).

---

#### STORY-093: Agent claims a mention, replies, and acknowledges
*(was comments-mentions-handoff/STORY-010)*
**Type**: long
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: The "openai-codex · agent" Actor working for Priya on "Ledger Sync", driven by a script
**Goal**: Process one mention end to end: claim, read context, reply, mark read, ack
**Preconditions**: Credential file exists; Marcus mentioned the agent's handle `agent-…-openai-codex` in a comment on "Retry failed webhook deliveries"
**Ideal path**: 5 — claim, show, comment, read, ack
**Alternate paths**: `pardner bridge run` does claim and ack automatically and wakes the harness; `mentions deliver` is an alias of `ack` (cli.js:279)
**See also**: STORY-126, STORY-131, STORY-136
##### Steps
1. In the browser, Marcus types "@agent-9a1c…-openai-codex please add a jitter test" and clicks **Add comment** → the chip tooltip "Notified openai-codex · agent".
2. Agent: `pardner mentions pending --token-file F` → one mention.
3. Agent: `pardner mentions claim-next --request-id run-2026-11-09-a --ttl-ms 120000 --token-file F` → `{claimed:true, replayed:false, mention:{id:"mention-…", taskId:"task-…", commentId:"comment-…"}, claimToken:"…", claimExpiresAt:…}`.
4. Agent: `pardner mentions pending --token-file F` → empty (claimed and unexpired items are excluded).
5. Agent: `pardner show task-… --token-file F` → task, comments (with `unreadRevisionIds` for this Actor), mentions and revisions.
6. Agent: `pardner comments task-… --token-file F` → comments only; no receipt written.
7. Agent does the work, then `pardner comment task-… "Added jitter test in retry.test.js; passes." --token-file F` → `{commentId, mentionIds:[]}`.
8. Agent: `pardner read task-… --receipts '[{"commentId":"comment-…","revisionId":"op-…"}]' --token-file F` → `{receipts:1}`.
9. Agent: `pardner mentions ack mention-… --claim-token <token> --token-file F` → `{acknowledged:true, replayed:false}`.
10. In Marcus's browser → a new comment by "openai-codex · agent" with the **New** tag. Activity shows "openai-codex commented on …" and, under Read receipts, "openai-codex read 1 comment on …".
##### Variations
- Re-running claim-next with the same `--request-id` returns the same claim (`replayed:true`) if still active. A request ID that belongs to another Actor gives `OPERATION_ID_REUSED`.
- No pending mentions: `{claimed:false, replayed:false}`.
- Ack twice: `{acknowledged:true, replayed:true}`.
- Replica project (joined from another client): claim, ack and release are forwarded to the hub's `/delivery`. If the hub is down: `HUB_UNAVAILABLE`.
##### Edge Cases
- `--ttl-ms 50`: "Claim lifetime must be between 100 and 300000 milliseconds".
- Ack after the TTL expires: `STALE_CLAIM` "The delivery claim has expired". The mention reappears in `pending`.
- Wrong token: `STALE_CLAIM` "The delivery claim does not match".
- The comment is deleted while claimed: the delivery is tombstoned and the ack fails `STALE_CLAIM` (test/mention-lifecycle.test.js:114-124).
- Steps 5 and 6 overlap: `show` already includes the comments. This is a redundancy candidate.

---

#### STORY-094: Agent hands work back to a human via CLI
*(was comments-mentions-handoff/STORY-012)*
**Type**: medium
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: The "openai-codex · agent" Actor finishing "Retry failed webhook deliveries"
**Goal**: Reassign to Priya in Review with a summary message
**Preconditions**: Credential file; task In progress assigned to the agent
**Ideal path**: 2 — show (for revisions), handoff
**Alternate paths**: Priya does it in the browser (**Hand off work**); `pardner update <task> --assignee … --status review --revisions …` plus a separate `comment`
**See also**: STORY-091, STORY-126
##### Steps
1. `pardner show task-… --token-file F` → read `revisions.assignee` and `revisions.status`.
2. Mistake: `pardner handoff task-… --to Priya --status review --message "Done" --token-file F` → fails "Supply --revisions" (INVALID_ARGUMENT).
3. Retry with `--revisions '{"assignee":["op-1"],"status":["op-2"]}'` and `--to Priya` → `UNKNOWN_ACTOR` "Unknown Actor: Priya", because `--to` takes an Actor ID or handle, not a display name (workspace-schema.js:89-96).
4. Use `--to actor-…` (from `pardner client show` or `actors`) → `{taskId, commentId, mentionIds:["mention-…"]}`.
5. Priya's browser → the card moves to Review, the comment "Done" by "openai-codex · agent" shows **New**, and Activity reads "openai-codex handed Retry failed webhook deliveries to Priya Raman and set it to Review".
##### Variations
- `--status` omitted: the status is set to undefined and normalize behavior applies. The help text always shows `--status review`.
- Priya then runs `pardner mentions pending` as her human Actor? Humans have no browser inbox for mentions. Only the **New** tag in the task signals it.
##### Edge Cases
- Stale revisions: `STALE_UPDATE` "This field changed since it was read; refresh its context" (details include `current`).
- Ambiguous handle: `AMBIGUOUS_ACTOR`.
- Retrying with the same `--operation-id` but different input: `OPERATION_ID_REUSED`.

---

#### STORY-095: Full loop: human mentions agent, agent works, hands back, human reviews and catches up
*(was comments-mentions-handoff/STORY-013)*
**Type**: long
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Priya Raman (human, browser) and her Codex agent (CLI with `--token-file`), on "Ledger Sync" task "Add idempotency keys to POST /payments"
**Goal**: Delegate a task to the agent through comments and handoff, and close the review loop
**Preconditions**: Project with Priya and her Codex agent; agent credential at ~/.pardner/codex-ledger.json; task in Up next assigned to Priya
**Ideal path**: 12 — mention or hand off, agent claim/show/work/comment/ack/handoff, human read/mark/review
**Alternate paths**: Hand off to the agent instead of mentioning (recipient notified automatically); `pardner bridge run` to wake the agent automatically; Edit task for reassignment
**See also**: STORY-091, STORY-093, STORY-126
##### Steps
1. Priya opens the task → the panel shows "Priya Raman · human · Up next · P1".
2. Priya wants to mention the agent, types "@codex take this" → hint "@codex matches no Actor and won't notify anyone."
3. Priya chooses **Hand off work** instead → Recipient "openai-codex · agent". Handoff status defaults to Up next (unchanged); she changes it to In progress.
4. Message "Use the existing request_id header; see RFC in docs/payments.md" → **Hand off** → "Handed off to openai-codex · agent · In progress."
5. The card moves to **In progress** showing "openai-codex · agent".
6. Agent: `pardner mentions pending --token-file F` → one mention from the handoff comment.
7. Agent: `pardner mentions claim-next --request-id pay-idem-1 --ttl-ms 300000 --token-file F` → claimToken.
8. Agent: `pardner show task-… --token-file F` → reads the message and revisions.
9. Agent works and links commits (`pardner link-commit …` or `pardner commit --task …`; see the evidence topic).
10. Agent: `pardner comment task-… "Implemented; 14 tests added." --token-file F`.
11. Agent: `pardner read task-… --receipts '[…handoff comment revision…]' --token-file F`.
12. Agent: `pardner mentions ack mention-… --claim-token … --token-file F` → acknowledged.
13. Agent: `pardner show …` again for fresh revisions, then `pardner handoff task-… --to actor-<priya> --status review --message "Ready for review" --revisions '{…}' --token-file F`.
14. Priya's browser (live sync) → the card moves to **Review**, and the heading **Comments 4 · 2 new** shows the agent's two comments with **New**.
15. Priya reads the comments and checks **Evidence** for commits.
16. Priya clicks **Mark all read** → the New tags clear.
17. Priya sets Status to **Completed** via the quick Status select.
18. Activity (Show: Status changes and handoffs) lists both handoffs and the completion.
##### Variations
- Priya uses the agent's real handle from `pardner client show` in step 2. Then the comment alone notifies, and the chip "Notified openai-codex · agent" renders.
- The agent's claim expires during long work (TTL max 300000 ms = 5 min). Ack fails `STALE_CLAIM`, and the agent must claim-next again, possibly getting a different mention first (FIFO by created_at).
##### Edge Cases
- Priya edits the task while the agent's handoff is in flight: the agent gets `STALE_UPDATE` and must re-show.
- If Priya is writing her own handoff when the agent's lands: "This task changed while you were writing: now Priya Raman · human · Review…" with **Use latest task details**.
- Redundancy: the handoff message is a comment and also a History event and also an Activity sentence. The mention inbox for humans does not exist, so the **New** tag is the only cue.

---

#### STORY-096: Comment with mixed known and unknown handles, then review the chips
*(was comments-mentions-handoff/STORY-014)*
**Type**: short
**Topic**: Comments, mentions, read receipts and handoff
**Persona**: Marcus Hale pinging both agents and a nonexistent "@qa"
**Goal**: Notify the right Actors and know who was actually notified
**Preconditions**: Marcus knows the two agents' handles (from the CLI)
**Ideal path**: 2 — type, submit
**Alternate paths**: CLI `pardner comment`
**See also**: STORY-086
##### Steps
1. Type "@agent-…-openai-codex @agent-…-cursor @qa please verify" and blur the textarea → hint "@qa matches no Actor and won't notify anyone."
2. Submit anyway → the comment renders. The two agent handles become chips titled "Notified openai-codex · agent" and "Notified cursor · agent". "@qa" stays plain text.
3. Hover each chip to confirm → the tooltip is the only confirmation of delivery.
##### Variations
- Mentioning yourself: your own handle is a known Actor, so a delivery is created to yourself.
##### Edge Cases
- The hint does not block submission. It is advisory only.
- A chip means a mention record exists, not that the agent claimed or acked it. No delivery state is shown in the browser.

---

### Goals, veins and Activity


Source anchors used throughout:
- Goals view: ui-prototype/src/Pardner.jsx:794-903 (`RecordStatusSelect`, `Goals`)
- Conflict disclosure: ui-prototype/src/RecordConflicts.jsx; ui-prototype/src/record-conflicts.js
- Statuses: ui-prototype/src/record-status.js; lib/workspace-schema.js:7 (`CLOSED_TASK_STATUSES = completed, dead-end, abandoned`)
- Ready for a verdict: lib/workspace-schema.js:253-261
- Activity: Pardner.jsx:20-38 (filters, `dayHeading`), 403-422, 503-526 (`showVein`, `showOlder`, `openVein`, `openGoal`), 614-627 (filters), 700-731 (feed); ui-prototype/src/events.js (`describeEvent`, `eventGroup`)
- CLI: lib/cli.js:49-64 (help), 200-228 (goals/veins), 265-272 (activity); validation in lib/workspace-schema.js:135-167 and lib/workspace-commands.js:131-181

#### STORY-097: First visit to an empty Goals view, then seeding a goal and vein from the CLI
*(was goals-veins-activity/STORY-001)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Maya Okafor is the tech lead on the "Ledgerline" invoicing project. She opened Pardner with `pardner open` for the first time this week and wants to frame the Q4 "Cut checkout latency" effort.
**Goal**: Create a goal and a first vein under it, and see both on the Goals view.
**Preconditions**: Maya is signed in to the local client in the Ledgerline project. The project has tasks but no goals or veins. She has a terminal with the CLI connected to the project, either through `--data` or a `client agent-grant` token file.
**Ideal path**: 3 — open Goals, create a goal and vein in one step, see it appear live.
**Alternate paths**: (a) `pardner goal create --title …` followed by `pardner vein create --title … --goal goal-<id>`, which takes two commands and needs the goal ID copied from the first JSON result. (b) `pardner vein create --title … --goal "Cut checkout latency"` creates the goal implicitly in one command (lib/cli.js:216-218; workspace-commands.js:157-167). There is no UI create route.
**See also**: STORY-103, STORY-107
##### Steps
1. Click **Goals** in the "Workspace views" nav → the heading **Goals** shows the empty state "No goals yet. Start a vein with `pardner vein create --title … --goal …`." (Pardner.jsx:858-860). There is no create button.
2. Maya looks for a "New goal" button next to **New task** and finds none → she hesitates, then copies the hinted command.
3. In the terminal, run `pardner vein create --title "Cache tax rates at the edge" --goal "Cut checkout latency"` → she gets a JSON envelope `{success:true, …}` with `result: {veinId: "vein-…", goalId: "goal-…", createdGoal: true}`.
4. Return to the browser without reloading → the goal "Cut checkout latency" appears live with a **Status of goal Cut checkout latency** select showing Open. Under it is a vein button "Cache tax rates at the edge" with a **Status of vein …** select (Open) and "0 tasks".
5. She wants to know what "veins" are and checks the empty-state hint → nothing in the UI explains goals or veins.
6. Click **Activity** → the row reads "Maya Okafor started vein Cache tax rates at the edge for new goal Cut checkout latency" under the **Today** heading (events.js:208-209).
##### Variations
- Two-step CLI: `pardner goal create --title "Cut checkout latency" --description "p95 under 400 ms"` gives a goal with the description shown muted under the heading. Then `pardner vein create … --goal goal-<24 hex>`. Activity then shows two rows: "created goal …" and "started vein … for goal …".
- Description on a vein: `--description` is accepted, but the Goals view never shows vein descriptions; only goal descriptions render (Pardner.jsx:870).
##### Edge Cases
- Missing `--goal`: `GOAL_REQUIRED` "Every vein pursues a goal: supply --goal with a goal ID or a new goal title" (cli.js:217).
- Typo in a goal ID that is not ID-shaped (for example `--goal goal-3fa2`): `isRecordId` needs `goal-` plus 24 hex characters (workspace-schema.js:21). The value is treated as a **new goal title**, so a goal literally named "goal-3fa2" is silently created. A correctly shaped but unknown ID returns `NOT_FOUND` "Goal not found: …".
- No Actor: `ACTOR_REQUIRED` "Supply --actor or PARDNER_ACTOR" unless the credential binds one (cli.js:177).
- Empty title: rejected by `text(values.title, 'Title')` with `INVALID_ARGUMENT`.

---

#### STORY-098: Marking a vein Proven from the Goals view
*(was goals-veins-activity/STORY-002)*
**Type**: short
**Topic**: Goals, veins and Activity
**Persona**: Dev Raman is a backend engineer on Ledgerline. He just confirmed that edge caching cut p95 by 30%.
**Goal**: Record the verdict that the vein "Cache tax rates at the edge" is proven.
**Preconditions**: The goal "Cut checkout latency" has that vein with status Open and no conflicts.
**Ideal path**: 2 — open Goals, pick Proven.
**Alternate paths**: CLI `pardner vein show vein-<id>` to read `revisions.status`, then `pardner vein update vein-<id> --status proven --revisions '{"status":["<rev>"]}'` (cli.js:57, 220-223).
**See also**: STORY-108
##### Steps
1. Click **Goals** → the vein row shows the **Status of vein Cache tax rates at the edge** select set to Open.
2. Choose **Proven** → the select is disabled while the request is in flight (`disabled = busy || pending`). It sends `vein.update` with `expectedRevisions.status`. When it settles, focus returns to the select (`useRefocus`).
3. Optionally open **Activity** → he sees "Dev Raman marked vein Cache tax rates at the edge" followed by a **Proven** status pill (events.js:211).
##### Variations
- Choosing the current value again does nothing (`if (next === record.status) return`).
- Goal status: the same **Status of goal …** select offers Open/Achieved/Abandoned. The goals list re-sorts by status (open, then achieved, then abandoned), so a goal marked Achieved jumps below every open goal and can move away from where Dev was looking.
##### Edge Cases
- A teammate changed the status first: `STALE_UPDATE` "This field changed since it was read; refresh its context". The notice also reads "Your draft is preserved. Review the latest context before making a new edit." (Pardner.jsx:97-98), which is misleading because a status select has no draft. The notice sits under the goal heading or vein row (Pardner.jsx:850-856).
- Network failure: the request stays pending. The page shows "A request is awaiting confirmation." with **Retry saved request**, and every goal and vein select is disabled until it resolves.
- The vein's tasks do not change status. Setting Proven is independent of the task columns.

---

#### STORY-099: Spotting "Ready for a verdict" and drilling into the vein's tasks
*(was goals-veins-activity/STORY-003)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Priya Nandakumar is the product manager on Ledgerline. She does a Friday sweep to close out experiments.
**Goal**: Find veins whose work is finished, check their tasks, and give a verdict.
**Preconditions**: The vein "Lazy-load PDF renderer" has 3 tasks: two Completed and one Dead end. Its status is Open. Another vein, "Batch Stripe webhooks", has one task In progress.
**Ideal path**: 4 — Goals, see label, click vein, return and set status.
**Alternate paths**: CLI `pardner veins --status open` lists veins with `readyForVerdict` in the JSON (cli.js:203-205). `pardner vein show <vein>` returns tasks and history (workspace-schema.js:302-309). On the board, **Vein** filter plus All statuses shows the same tasks.
**See also**: STORY-063, STORY-064
##### Steps
1. Click **Goals** → "Lazy-load PDF renderer" shows "3 tasks" and the **Ready for a verdict** label. "Batch Stripe webhooks" shows "1 task" with no label.
2. Priya wonders whether "Ready for a verdict" means it was approved → there is no tooltip. The rule is: every task has ended (completed, dead-end or abandoned), the vein has at least one task, and every status alternative is open (workspace-schema.js:255-258).
3. Click the vein title button "Lazy-load PDF renderer" → the view switches to **Tasks** with the **Vein** select set to that vein. **Assigned to** resets to All Actors and **Status filter** to All statuses (`showBoard` sets every filter, Pardner.jsx:484-486). Focus lands on the pressed **Tasks** nav button.
4. Scan the Completed and Dead end columns → she sees 2 and 1 cards, each with a "Lazy-load PDF renderer" vein label. Other columns read "No tasks here".
5. Open the Dead end card "Swap pdf.js for pdfium wasm" → the detail panel shows "Veins: Lazy-load PDF renderer (Open)" as plain, non-clickable text (Pardner.jsx:1277-1279).
6. Close the panel and click **Goals** → the Vein filter stays applied on the board (persisted per project via `savePreferences`).
7. Set **Status of vein Lazy-load PDF renderer** to **Proven** → the **Ready for a verdict** label disappears because the status is no longer open.
8. Back on **Tasks**, she forgets the Vein filter is still set → the board seems to be missing tasks until she resets **Vein** to All veins.
##### Variations
- Dead end verdict: choosing **Dead end** also clears the label. **Abandoned** does the same.
- A vein with 0 tasks never shows the label, even when every status is open.
##### Edge Cases
- One task reopened (moved from Completed back to In progress): the label vanishes on the next snapshot.
- A task with a disputed status where one alternative is not closed is not "ended" (`taskEnded` checks every alternative), so the vein is not ready.
- A vein with a disputed status is never ready ("a disputed verdict is not waiting for one").
- Redundancy: vein membership appears in four places. These are the board card vein labels, the Vein filter, the "N tasks" count on Goals, and the "Veins: …" line in task details. Only the Goals title button navigates.

---

#### STORY-100: Resolving a disputed vein status with the Keep buttons
*(was goals-veins-activity/STORY-004)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Tomás Ferreira, an engineer, and Ada (an agent, `ada · agent`) both judged "Batch Stripe webhooks" at the same time while Tomás was offline on a train.
**Goal**: Settle the conflicting verdict to one value.
**Preconditions**: Tomás set the vein to Dead end offline, and Ada set it to Proven. The replicas merged, so the vein's `conflicts.status` has two alternatives.
**Ideal path**: 3 — see dispute, open disclosure, Keep one.
**Alternate paths**: CLI `pardner vein show vein-<id>` to get `revisions.status`, then `pardner vein resolve vein-<id> --field status --value proven --revisions '["<rev1>","<rev2>"]'` (cli.js:58, 224). Note that the help example uses `--field goalId`.
**See also**: STORY-077, STORY-107
##### Steps
1. Open **Goals** → in place of the select, the vein row shows the pill "Proven or Dead end" with `data-status="disputed"`. The order comes from the operation IDs (record-conflicts.js:20-23).
2. Tomás tries to click the pill to change it → it is a non-interactive span, so nothing happens.
3. Notice the closed disclosure **Conflicting edits: status** under the vein and expand it → it reads "Status: both edits are kept until you choose one." There are two choices, each with an author line ("Tomás Ferreira · human" / "ada · agent"), a value, and a button.
4. Read the buttons **Keep Proven** and **Keep Dead end**. Their accessible names are "Keep Proven for vein Batch Stripe webhooks" and so on.
5. Click **Keep Dead end** → it sends `vein.resolve` with both revisions. On success the disclosure disappears and focus moves to the vein's status select, which now shows Dead end (Pardner.jsx:829-845).
6. Check **Activity** → the row reads "Tomás Ferreira resolved conflicting status on vein Batch Stripe webhooks — Kept Dead end" (events.js:146-155). It is grouped under **Status changes and handoffs**.
##### Variations
- Same value from both authors: alternatives are grouped, so a single **Keep Proven** with "Tomás Ferreira · human and ada · agent" appears.
- Three-way dispute: the pill reads "Open, Proven or Dead end".
- Goal disputes are identical, using **Keep Achieved** / **Keep Abandoned** and the select **Status of goal …**.
##### Edge Cases
- Failure (for example `STALE_UPDATE` because a third edit arrived): focus returns to the clicked Keep button, and the error renders by the vein row.
- While another request is pending, every Keep button is disabled.
- Trying `vein update --status proven` on the CLI while disputed gives `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly" (workspace-schema.js:138).
- `vein resolve` with a bad field gives "Choose a valid vein field to resolve".

---

#### STORY-101: A vein moved to two goals at once (goal conflict)
*(was goals-veins-activity/STORY-005)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Maya Okafor (lead) and Dev Raman both re-homed the vein "Cache tax rates at the edge" from the CLI during a reorg, to different goals.
**Goal**: Decide which goal the vein belongs to.
**Preconditions**: Goals "Cut checkout latency" and "Reduce infra spend" exist. Concurrent `vein update --goal` calls left `conflicts.goalId` with two values.
**Ideal path**: 3 — open Goals, expand disclosure, Keep one goal.
**Alternate paths**: `pardner vein resolve vein-<id> --field goalId --value goal-<id> --revisions '[…]'` (the help example, cli.js:58).
**See also**: STORY-100
##### Steps
1. Open **Goals** → the same vein is listed under **both** goals, because `goalIds` holds every concurrent value (workspace-schema.js:259-260). Each copy shows its own disclosure.
2. Maya thinks it was duplicated → she expands **Conflicting edits: goal** under one copy. It reads "Goal: both edits are kept until you choose one."
3. Read the choices, which show goal titles: **Keep Cut checkout latency** and **Keep Reduce infra spend**.
4. Click **Keep Reduce infra spend** → the vein disappears from "Cut checkout latency". Focus jumps to the vein's select inside the "Reduce infra spend" article (Pardner.jsx:835-838), which may scroll the page.
5. Open **Activity** → she sees "Maya Okafor resolved conflicting goal on vein Cache tax rates at the edge — Kept Reduce infra spend". The earlier rows read "… moved vein … to goal …".
##### Variations
- The goal title is in conflict too: the disclosure summary lists "Conflicting edits: title, goal", and the title buttons read **Keep Dev Raman · human's title**.
##### Edge Cases
- One goal ID unknown to this replica: the value text reads "Unknown goal" (RecordConflicts.jsx:8).
- The conflict is only visible on Goals. The task board and task details show nothing about it.

---

#### STORY-102: Conflicting goal title and description edits
*(was goals-veins-activity/STORY-006)*
**Type**: short
**Topic**: Goals, veins and Activity
**Persona**: Priya Nandakumar (PM) and Leon Brandt (designer) both reworded the goal "Cut checkout latency" through the CLI.
**Goal**: Keep Priya's wording.
**Preconditions**: The goal has `conflicts.title` with two alternatives.
**Ideal path**: 2 — expand disclosure, click Keep.
**Alternate paths**: `pardner goal resolve goal-<id> --field title --value "Checkout p95 under 400 ms" --revisions '[…]'`.
**See also**: STORY-078
##### Steps
1. On **Goals**, the heading `h3` shows the merge's pick, for example Leon's "Faster checkout". Below it is **Conflicting edits: title**.
2. Expand it → the choices show each author and their title text. The buttons read **Keep Priya Nandakumar · human's title** and **Keep Leon Brandt · human's title**. The button names the author, not the value.
3. Click Priya's → the heading updates and focus moves to the goal's status select.
##### Variations
- Description conflict: the summary shows "description", and the value shows the full description text inline.
##### Edge Cases
- There is no way to edit a goal title or description in the UI. The only UI write for these fields is choosing between existing alternatives.
- Activity row: "resolved conflicting title on goal … — Kept “Checkout p95 under 400 ms”".

---

#### STORY-103: Adding tasks to a vein and watching the counts change
*(was goals-veins-activity/STORY-007)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Ada, an agent working on Ledgerline through a `client agent-grant` token file, organizes new tasks into the "Batch Stripe webhooks" vein.
**Goal**: Attach two existing tasks and create a third directly in the vein.
**Preconditions**: The vein exists. Tasks "Coalesce invoice.paid events" and "Add webhook dedupe table" exist.
**Ideal path**: 3 — one link command per task, one create with `--vein`.
**Alternate paths**: `pardner task create --title … --vein vein-a,vein-b` attaches at creation (cli.js:233-235). The UI **New task** panel has no vein field, so attaching is CLI-only.
**See also**: STORY-064, STORY-070
##### Steps
1. `pardner vein add vein-<id> task-<id1> --token-file ada.json` → `task.link-vein`. Activity: "ada added Coalesce invoice.paid events to vein Batch Stripe webhooks".
2. Repeat for task-<id2>.
3. `pardner task create --title "Retry 429s with jitter" --vein vein-<id>` → Activity row "ada created Retry 429s with jitter" with detail "Backlog · P2 · Unassigned · Vein: Batch Stripe webhooks".
4. A human watching **Goals** sees the counter go from "0 tasks" to "3 tasks" live.
5. Later, `pardner vein remove vein-<id> task-<id2> --revisions '["<linkRev>"]'` → "removed Add webhook dedupe table from vein …".
##### Variations
- `pardner veins --goal goal-<id> --status open` filters the list. `pardner tasks --vein vein-<id>` mirrors the board's Vein filter.
##### Edge Cases
- Removing a task that is not linked: `NOT_FOUND` "This task is not part of that vein".
- Omitting `--revisions` on remove: "Supply --revisions" or `REVISION_REQUIRED`. Getting the link revision needs `vein show` (`linkRevisions` per task) or `show <task>`.
- Unknown vein ID: `NOT_FOUND` "Vein not found: …".

---

#### STORY-104: Reading the Activity feed by day and jumping to subjects
*(was goals-veins-activity/STORY-008)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Leon Brandt, a designer, is back from two days off and wants to catch up on Ledgerline.
**Goal**: Skim what happened since Friday and open the items that matter.
**Preconditions**: About 60 events exist across Today, Yesterday and "Friday, November 6".
**Ideal path**: 3 — Activity, scan, click subject.
**Alternate paths**: CLI `pardner activity --limit 60`, which returns raw JSON events with no sentences or day groups. Per-task **History** in task details shows the same sentences, but subjects there are plain text (EventRow without handlers, Pardner.jsx:152-153).
**See also**: STORY-071, STORY-082
##### Steps
1. Click **Activity** → heading **Activity** with "Showing 60 of 60". Rows are grouped under `h3` day headings **Today**, **Yesterday**, and "Friday, November 6". The year is added only for other years (Pardner.jsx:26-33).
2. Read a row such as "Dev Raman moved Add webhook dedupe table to **In progress**". The task title is a button, and the status is a pill. Hovering the time shows the full local timestamp, and hovering the row shows the event type (`title={event.type}`).
3. Click the task subject → the task detail panel opens over Activity, and the feed stays behind it.
4. Close the panel → focus returns to the opener.
5. Click a vein subject in "Maya Okafor started vein Cache tax rates…" → the view switches to **Tasks**, filtered to that vein, and **Assigned to** and **Status filter** are cleared. Leon is surprised that he left Activity.
6. Click **Activity** again → the feed resets to the top. The Show filter and Performed by state survive because they are component state, not persisted across reloads.
7. Click a goal subject "Cut checkout latency" in a "marked goal … Achieved" row → the view switches to **Goals** and scrolls to and focuses that goal article (Pardner.jsx:519-526).
##### Variations
- Commit rows: "linked commit 3f9a2c1 to …" with the first line of the commit message quoted as detail.
- Comment rows include a 140-character excerpt. A deleted comment shows "This comment was later deleted."
##### Edge Cases
- A subject whose record is gone or not yet synced renders as plain text, for example "an unknown vein" (events.js:113-117).
- New events arriving while Leon reads are inserted at the top. "Showing X of Y" grows, and the loaded window never shrinks because of the cutoff logic (Pardner.jsx:35-38, 505-507).
- The "Yesterday" and "Today" headings are computed at render. A tab left open past midnight keeps stale labels until it re-renders.

---

#### STORY-105: Filtering Activity to goal and vein changes, and discovering where verdicts went
*(was goals-veins-activity/STORY-009)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Priya Nandakumar (PM) prepares a weekly planning digest.
**Goal**: List every goal and vein change this week, including verdicts.
**Preconditions**: This week: two `vein.create` events, one `goal.update` that changed only a title, three `vein.update` status verdicts, and one `vein.resolve` on status.
**Ideal path**: 2 — choose a "Goals and veins" filter that includes verdicts.
**Alternate paths**: CLI `pardner activity --limit 100`, then filter types by hand (there is no type flag). `pardner goal show` / `vein show` return per-record `history`.
##### Steps
1. Open **Activity** and set **Show** to **Goals and veins** → the cutoff resets and "Showing 3 of 3" lists the two "started vein…" rows and the "renamed goal …" row.
2. Priya notices the three Proven/Dead end verdicts are missing → she thinks they weren't saved.
3. Switch **Show** to **Status changes and handoffs** → the verdicts and the status resolve appear here, mixed with task moves and handoffs. `eventGroup` sends any goal or vein update or resolve that changes status to 'status' first (events.js:236-238).
4. Narrow with **Performed by** set to "Dev Raman" → only Dev's events. Switching an actor or Show option resets paging.
5. Choose an actor with no matches → "No activity matches these filters."
##### Variations
- **Read receipts** shows "read 2 comments on …" rows, which **All changes** excludes.
- **Actors registered** shows "joined as a human" / "registered ada as an agent".
##### Edge Cases
- A brand-new project shows "No activity yet." instead of the filter message (Pardner.jsx:704-706).
- Filters are not saved in preferences (`activityActor` and `activityShow` are plain state, Pardner.jsx:238-239), so a reload resets them to Any Actor / All changes, while the board filters persist.
- Redundancy and taxonomy friction: the "Goals and veins" label suggests it covers verdicts, but it does not.

---

#### STORY-106: Paging back with Show older activity to the start of the project
*(was goals-veins-activity/STORY-010)*
**Type**: short
**Topic**: Goals, veins and Activity
**Persona**: Dev Raman is auditing when the "Batch Stripe webhooks" vein was first started, months ago.
**Goal**: Reach the oldest events.
**Preconditions**: About 340 events, page size 100.
**Ideal path**: 2 — filter to Goals and veins, then page once (a type filter shrinks the set).
**Alternate paths**: `pardner vein show vein-<id>` returns the full ordered `history` in one call. `pardner activity --limit 1000`.
##### Steps
1. On **Activity**, "Showing 100 of 340" with **Show older activity** at the bottom.
2. Click **Show older activity** → 100 more load, and focus moves to the first newly shown row (`activityFocus`, Pardner.jsx:418-422, 509-513). "Showing 200 of 340".
3. Click twice more → "Showing 340 of 340", and the button is replaced by "Start of activity".
4. He scrolls back up and changes **Show** → paging resets to the first 100.
##### Edge Cases
- There is no search or date jump. Reaching an old event means paging or switching to the CLI.
- Ties in timestamp are ordered by operationId, so the boundary is stable across replicas.

---

#### STORY-107: End-to-end experiment cycle: goal, veins, work, verdicts, goal achieved
*(was goals-veins-activity/STORY-011)*
**Type**: long
**Topic**: Goals, veins and Activity
**Persona**: Maya Okafor (lead) runs a two-week latency push with Dev Raman (human) and Ada (agent) on Ledgerline.
**Goal**: Frame a goal, run two competing veins, judge each one, and mark the goal Achieved, with an audit trail.
**Preconditions**: An empty plan layer. The CLI is connected for Maya, and Ada uses a token file.
**Ideal path**: 12 — 2 creates, 2 task batches, work, 2 verdicts, 1 goal status, 1 review in Activity, with the rest carried by live updates.
**Alternate paths**: Every write here also exists as CLI (`vein update --status`, `goal update --status`). Only the status selects and Keep buttons exist in the UI. Creation, linking, title edits and descriptions are CLI-only.
**See also**: STORY-097, STORY-100
##### Steps
1. Maya opens **Goals** → "No goals yet. …".
2. `pardner vein create --title "Cache tax rates at the edge" --goal "Checkout p95 under 400 ms"` → the goal and vein appear live.
3. She copies the goal ID from the JSON and runs `pardner vein create --title "Precompute invoice PDFs" --goal goal-<id>` → the second vein is listed under the same goal, ordered by creation time.
4. `pardner task create --title "Edge KV for tax tables" --vein vein-A --assignee dev` and two more tasks → the vein shows "3 tasks". The board cards show the vein label.
5. Ada runs `pardner vein add vein-B task-<id>` for two existing tasks → "2 tasks".
6. Maya clicks the vein title "Precompute invoice PDFs" → the board is filtered to it. She sees Ada's tasks in Up next.
7. Over the week, Dev and Ada move tasks through In progress, Review and Completed (task topic). Activity shows "moved … to **Completed**" rows.
8. Ada's PDF experiment fails, and she moves its last task to **Dead end** → vein B shows **Ready for a verdict**.
9. Maya opens **Goals**, sets **Status of vein Precompute invoice PDFs** to **Dead end** → the label clears.
10. Dev finishes vein A's tasks → **Ready for a verdict** appears on vein A.
11. At the same moment Maya picks **Proven** in the UI and Ada runs `pardner vein update vein-A --status proven --revisions …` → both write Proven, so there is no visible dispute. The second writer may get `STALE_UPDATE` if it read before the first landed, and the error notice appears beside the vein row.
12. Maya dismisses the notice (**Dismiss**) and checks that the select reads Proven.
13. Set **Status of goal Checkout p95 under 400 ms** to **Achieved** → the goal is sorted after any open goals.
14. Open **Activity**, set **Show** to **Status changes and handoffs** → she sees the verdict rows "marked vein … Dead end", "marked vein … Proven" and "marked goal … Achieved".
15. Switch to **Goals and veins** → the creation rows "started vein … for new goal …", "started vein … for goal …" and the "added … to vein …" rows.
16. She clicks the goal subject → Goals scrolls to it.
##### Variations
- Abandon instead: set the goal to **Abandoned**. The veins keep their own statuses because goal status does not cascade.
- Reopen: set the goal back to Open, and it re-sorts to the top.
##### Edge Cases
- If Ada's offline update had been Dead end while Maya chose Proven, STORY-100's "Proven or Dead end" pill and **Keep …** buttons would appear.
- Completed tasks never auto-prove a vein. "Closed tasks are a prompt for a verdict, never a verdict themselves" (workspace-schema.js:255).
- Redundancy: the verdict is visible on Goals (select), in task details ("Veins: Cache tax rates at the edge (Proven)"), in Activity, and in `vein show`.

---

#### STORY-108: Agent reads the plan layer and records a verdict through the CLI only
*(was goals-veins-activity/STORY-012)*
**Type**: medium
**Topic**: Goals, veins and Activity
**Persona**: Ada, an agent, is asked in a comment to "close out veins that are ready".
**Goal**: Find ready veins and set verdicts without the browser.
**Preconditions**: Ada has a token file from `pardner client agent-grant --project <ID> --output-file ada.json`.
**Ideal path**: 3 — list veins, show one for revisions, update.
**Alternate paths**: None for agents. The board needs a signed-in browser session.
**See also**: STORY-098
##### Steps
1. `pardner veins --status open --token-file ada.json` → JSON list. She filters for `readyForVerdict: true`.
2. `pardner vein show vein-<id>` → `{vein, revisions, conflicts, goal, tasks, history}`. She reads `revisions.status`.
3. She first tries `pardner vein update vein-<id> --status proven` without `--revisions` → `INVALID_ARGUMENT` "Supply --revisions".
4. Retry with `--revisions '{"status":["op-…"]}'` → success. Humans see the select change live.
5. `pardner activity --actor ada --limit 5` → her own events as raw JSON. Note that `--actor` here both filters and selects the author.
##### Edge Cases
- Passing `--revisions '["op-…"]'` (array form, as `resolve` uses) to `update` gives `REVISION_REQUIRED` "Supply the observed field revisions", because update expects a per-field object while resolve expects an array. This inconsistency is easy to trip over.
- An invalid status such as `--status done` gives "Vein status must be one of: open, proven, dead-end, abandoned".
- Unknown subcommand gives "Use vein create, show, update, resolve, add, or remove".
- `pardner goals --status achieved` filters goals. There is no equivalent goal status filter in the UI.

---

#### STORY-109: Vein filter persistence and stale filters after a vein link
*(was goals-veins-activity/STORY-013)*
**Type**: short
**Topic**: Goals, veins and Activity
**Persona**: Dev Raman has the board filtered to "Assigned to: Dev Raman" and "Status filter: In progress".
**Goal**: Glance at one vein's tasks, then get his personal view back.
**Preconditions**: Personal filters are set. The vein "Batch Stripe webhooks" exists.
**Ideal path**: 2 — click vein, then restore (ideally one Back).
**Alternate paths**: Choose the vein directly in the board's **Vein** select, which keeps his other filters.
**See also**: STORY-063, STORY-064
##### Steps
1. **Goals** → click "Batch Stripe webhooks" → the board shows all of the vein's tasks across every column. His assignee and status filters are wiped (`showBoard`).
2. He wants his filters back → there is no undo or back. He re-selects **Assigned to** Dev Raman and **Status filter** In progress, and sets **Vein** to All veins: 3 controls.
3. Reload the page → the board filters and view are restored from preferences.
##### Edge Cases
- If the vein in a saved filter no longer exists in the snapshot, `activeVeinFilter` falls back to All veins silently (Pardner.jsx:498).
- The same vein link from an Activity subject has the same reset behavior.

---

### Control tab (T3 and Cursor Cloud)


Source files: `ui-prototype/src/ControlPane.jsx`, `ui-prototype/src/CloudControl.jsx`, `ui-prototype/src/Pardner.jsx:590-598, 697-698`, `ui-prototype/src/ClientApp.jsx:527`, `lib/client-proxy.js`, `lib/client-service.js:38-41, 160, 401-412`, `automerge-sync-server.js:425-474`, `lib/control-pane.js`, `lib/t3-execution.js`, `lib/cursor-cloud-execution.js`, `scripts/control-runtime.py`, `docs/PARDNER-CONTROL-RUNTIME.md:162-173`, `test/client-control.test.js`, `test/pardner-control-ui.test.js`.

How the surface is built (this applies to every story):
- **Who sees it.** The **Control** nav button appears only when `project.controlAvailable === true`. That requires `humanAuthority !== false` and a principal of kind `human` or `operator` (client-service.js:38-41).
- **Polling.** The pane polls `GET /pardner/control` every 2 s (ControlPane.jsx:227-231). Thread and execution reads count as stale after 6 s (`staleAfterMs = pollMs*3`, control-pane.js:43). Cloud contexts count as stale after 6000 ms (cursor-cloud-execution.js:313).
- **Errors.** Every action error appears in one `role="alert"` banner under the header, showing only `error.message` (ControlPane.jsx:255). The code is not shown.
- **API-only routes.** These routes exist but have no UI and no CLI subcommand. The only way to reach them is a direct HTTP call through the client proxy with a person's or operator's credential:
  - `/sessions/authorize` (change a mapped thread's authorized tasks or senders)
  - `/cloud/contexts/authorize`
  - `/cloud/executions/acceptance` (owner-supplied Cloud acceptance evidence)
  - `pardner client operation` posts only to `/automerge/operations` (client-cli.js:176-180).

#### STORY-110: First visit to the Control tab on a fresh client
*(was control-tab/STORY-001)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor, staff engineer, on her MacBook. She just created the project "Ledgerline" with `pardner open` and wants to see what "Control" is.
**Goal**: Open the Control view and understand what is missing before T3 work can run.
**Preconditions**: Signed in through the browser as the local person. No T3 credential, projects or mappings yet.
**Ideal path**: 2 — click Control, then read a single "next step" call-out.
**Alternate paths**: The board can also be opened with `"$PARDNER_CONTROL_HOME/control" open` (STORY-144). There is no deep link to the Control view. The view selection is saved per project and Actor, so a reload goes back to Control.
**See also**: STORY-144
##### Steps
1. Click **Control** in the "Workspace views" nav (Pardner.jsx:590-594) → The button gets `aria-pressed=true`. The pane briefly shows "Opening control records…" (ControlPane.jsx:241).
2. Wait for the first poll → The heading **Control** appears with a **Read T3 now** button. The status line reads "T3 credential: missing · qualified 0.1.5, 0.1.6. These records stay on this computer and are not synchronized or published to GitHub." (ControlPane.jsx:249-253).
3. Look below → The **Control settings** disclosure is already open because there are no sessions (ControlPane.jsx:163). It shows three forms: **T3 credential**, **Projects** and **Map a T3 thread**.
4. Scroll past it → "No T3 threads are mapped yet." Then a **Cursor Cloud** section reads "Live dispatch disabled · Access not configured · Live qualification pending." with the note "Intent and evidence are saved on this service. Cancellation holds the queue and does not undo changes." (CloudControl.jsx:66-67).
5. Maya hesitates. Nothing says which form to fill first, and two separate "Projects" ideas (Pardner project vs. control project) are now on screen.
##### Variations
- Pane disabled (`controlOptions === false`): the page shows only "This service is not running a control pane." (ControlPane.jsx:242).
- First load fails: the page shows the raw error message in place of "Opening control records…" (ControlPane.jsx:241), with no retry button. The 2 s poll keeps retrying.
##### Edge Cases
- Maya clicks **Read T3 now** before pairing: the poll succeeds, so no error appears. The thread loop records "T3 credential is missing; pair again to continue" as health only, and with no threads mapped nothing is shown (control-pane.js:365-368, 388-390). The button looks like it did nothing.
- Redundancy: "Not read from T3 yet" / freshness also appears per session and per execution, and Cloud has its own "Fresh read" / "Stale / not observed" wording (CloudControl.jsx:15). That is three freshness vocabularies.

---

#### STORY-111: Pair T3, mistyping the code first
*(was control-tab/STORY-002)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. T3 Code is running locally on its default port and has just shown her a pairing code.
**Goal**: Store an approval-required T3 credential for this controller.
**Preconditions**: Control tab open. Credential status "missing".
**Ideal path**: 2 — paste the code, click Pair.
**Alternate paths**: `POST /pardner/control/credential` through the client proxy with an operator token (admin route, loopback only, automerge-sync-server.js:466). There is no CLI command.
##### Steps
1. In **Control settings › T3 credential**, read "One credential per controller, paired as approval-required. Re-pairing changes how T3 deduplicates requests." → Leave **T3 address** at its prefilled `http://127.0.0.1:3773`.
2. Type the code into **T3 pairing code** with a transposed character (`K7QF-92MX` as `K7FQ-92MX`) and click **Pair T3** → The button disables while the request runs. The alert shows "T3 did not approve the pairing code" or "T3 sign-in failed with HTTP 4xx" (t3-mcp-client.js:44, 59). Status is HTTP 502 `T3_REJECTED`.
3. Correct the code and click **Pair T3** again → On success the pairing-code field clears (ControlPane.jsx:167). The status line changes to "T3 credential: valid · expires 11/12/2026 · T3 0.1.6 · qualified 0.1.5, 0.1.6. …".
4. Notice the button now reads **Pair again** (ControlPane.jsx:173).
##### Variations
- T3 runs on another port: Maya edits **T3 address** (for example `http://127.0.0.1:3780`). A wrong address fails with a T3 transport error, shown as a 503/504 `T3_BUSY`/`T3_UNKNOWN` message.
- Credential with no expiry: the "· expires …" part is left out.
##### Edge Cases
- Submitting with the pairing code empty is blocked by HTML `required`. Server side: "Pairing code" text validation.
- Pairing from a non-loopback request: `LOCAL_ADMIN_REQUIRED` "Open Pardner on this computer through its loopback address to change control settings." (automerge-sync-server.js:443). In practice the client binds loopback only.

---

#### STORY-112: Full first run — project, thread mapping, follow-up, approval, verdict, artifact
*(was control-tab/STORY-003)*
**Type**: long
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. She wants her Codex agent "Builder" (harness `openai-codex`), which runs in the T3 thread "Fix CSV export rounding", to work on the Pardner task "Fix CSV export rounding in invoices".
**Goal**: Send a follow-up from Pardner to the T3 thread, approve it in T3, then record a human verdict and the resulting commit.
**Preconditions**: T3 paired (STORY-111). A Pardner task exists. An agent Actor "Builder" is enrolled. The T3 thread exists and is top-level.
**Ideal path**: 8 — save project, map thread (pick agent, task, sender), type follow-up, queue, decide in T3, accept with evidence, record artifact.
**Alternate paths**: Every step is also a POST under `/pardner/control/*` via the proxy. Thread authorization can later be changed only through `/sessions/authorize` (no UI).
**See also**: STORY-131
##### Steps
1. In **Projects**, enter **Project ID** `ledgerline`, **Project name** `Ledgerline`, **GitHub repository** `okafor-labs/ledgerline`, then click **Save project** → The list shows "Ledgerline · okafor-labs/ledgerline" and the fields clear.
2. Maya first typed `https://github.com/okafor-labs/ledgerline` into GitHub repository → It is rejected by `issueReference` validation, which expects `owner/name` (control-pane.js:184). She retypes it as `okafor-labs/ledgerline`.
3. In **Map a T3 thread**, choose **Project** "Ledgerline" and paste the **T3 thread ID** `thr_01JD8M4Q`. In **Agent Actor** choose "Builder" (only agent Actors are listed, ControlPane.jsx:159).
4. Click **Map thread** without ticking anything → Alert: "Authorize explicit task IDs; wildcard dispatch is not supported" (control-pane.js:23-24).
5. Under **Authorized tasks** tick "Fix CSV export rounding in invoices". Every task in the project is listed, with no filter or search. Click **Map thread** again → Alert: "Authorize explicit sender Actor IDs; wildcard dispatch is not supported".
6. Under **Authorized senders** tick "Maya Okafor" (Builder is excluded from this list), then click **Map thread** → A session card appears, headed by the T3 thread title "Fix CSV export rounding". **Control settings** no longer opens by default on later loads.
7. Read the identity list: **Project** "Ledgerline · okafor-labs/ledgerline", **Agent** "Builder", **Provider** "T3 · {instance} · {model} · approval-required", **Session** (a link to T3), **Location** "{host} · project folder (T3 reports no worktree) · no branch reported", **Environment** → The freshness label reads "Read 1s ago".
8. Under the card's form, **Task for this run** is preselected with the first authorized task. Type into **Follow-up for Builder**: "Round line-item totals with banker's rounding before summing; add a test for 0.005 cases." Read "Saved in Pardner first; it is sent to T3 only when the thread is idle and nothing is held."
9. Click **Queue follow-up** → The textarea clears. **Runs 1** shows an execution card "Fix CSV export rounding in invoices" with "Queued in Pardner" and the line "Maya Okafor → Builder · run not established".
10. Within one or two polls → The state changes to "Submitting", then "Running". The run ID appears and "Read 0s ago" is shown on the card.
11. Builder asks to edit files → The state becomes "Waiting for approval or input". The notice reads "T3 is waiting for a decision on this run." with the link **Decide in T3** (ControlPane.jsx:52-55).
12. Click **Decide in T3** → T3 opens in a new tab. Maya approves there; Pardner cannot approve.
13. Back in Pardner → The card shows "Running", then "Ended: completed". **Output captured from T3 (may still change)** opens automatically and later loses "(may still change)" once a second read settles (control-pane.js:445).
14. Read the verdict list: Execution "completed", Independent check "Not recorded", Human acceptance "Not recorded".
15. In the verdict form, leave **Verdict type** as "Human acceptance", type into **Verdict evidence** "Ran npm test, 214 passed; spot-checked invoice INV-2291 totals", then click **Accept** → Human acceptance reads "accepted by Maya Okafor" and the evidence field clears.
16. In **Record artifact** type `commit 9f3c2ab` and click **Record artifact** → The artifact list shows `commit` 9f3c2ab · Maya Okafor.
##### Variations
- Maya maps a thread whose T3 runtime mode is not approval-required: `UNQUALIFIED_THREAD` "T3 thread runtime mode is {mode}; only approval-required is qualified to block on approvals" (control-pane.js:20, 213).
- A child thread: `UNQUALIFIED_THREAD` "Child threads are not qualified; map a top-level thread".
- A worktree thread maps, but the card shows the notice "Worktree threads were not qualified on T3 0.1.5" (control-pane.js:467).
- The thread is busy when the follow-up is queued: the card stays "Queued in Pardner" and shows "T3 thread is {status}" or "T3 still holds {runId} as {status}" (t3-execution.js:191-195).
##### Edge Cases
- Mapping before pairing: the thread read fails with `T3_REJECTED` "Pair a T3 credential before dispatching" (control-pane.js:107).
- Mapping "Builder" to a second thread: `AMBIGUOUS_ROUTE` "Each T3 thread needs one route and each route its own Actor". Mapping the same thread twice: "This T3 thread is already mapped".
- Mapping an agent already used by a Cloud context: `AMBIGUOUS_ROUTE` "Actor is already mapped to Cloud".
- Typos in Project ID such as `Ledger Line` fail `identifier` validation.
- No way to unmap a thread or edit the authorized tasks/senders in the UI. The `/sessions/delete` route does not exist (refused `FORBIDDEN` "Unsupported control endpoint", test/client-control.test.js:60).
- Redundancy: the task title appears as the execution heading, in **Task for this run**, and in the main board. The agent name appears in the identity list, in the follow-up label and in the "→" line.

---

#### STORY-113: Withdraw a follow-up before it is sent
*(was control-tab/STORY-004)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. She queued a follow-up while Builder was still busy and then realized it named the wrong invoice table.
**Goal**: Stop the follow-up before it reaches T3.
**Preconditions**: An execution in state "Queued in Pardner" with zero submissions.
**Ideal path**: 1 — click Withdraw.
**Alternate paths**: `POST /pardner/control/executions/cancel {id}`. The same button handles every cancellable state.
##### Steps
1. Find the card showing "Queued in Pardner" with the reason "T3 thread is running" → Click **Withdraw follow-up** (label mapping, ControlPane.jsx:67-69).
2. Next poll → The state reads "Ended: cancelled" with the reason "Cancelled before submission" (t3-execution.js:316-317). No hold is created.
3. Maya re-queues corrected text with **Queue follow-up**.
##### Variations
- The queued row is a retry that T3 may already have accepted (`submissions > 0`): it goes to "Unknown outcome" with "Cancelled a retry that T3 may already have accepted". Continue with STORY-116.
##### Edge Cases
- The verdict and **Record artifact** forms appear on this "Ended: cancelled" card even though there was no run (`ended` checks only terminal and not abandoned, ControlPane.jsx:40). The server accepts this because `cancelled` is in RUN_OUTCOMES (control-pane.js:15, 296). Maya could "accept" work that never ran.

---

#### STORY-114: Cancel a running T3 run, then release the cancellation hold
*(was control-tab/STORY-005)*
**Type**: medium
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. Builder started rewriting the whole export module, which is far beyond the request.
**Goal**: Stop the exact run and resume dispatch for the next follow-up.
**Preconditions**: An execution in "Running" (or "Waiting for approval or input"), with a second follow-up queued behind it.
**Ideal path**: 3 — cancel, give release evidence, release.
**Alternate paths**: Stopping it inside T3 itself. Pardner then sees an outside end and places a different hold: "Run {id} ended {status} outside this controller; T3 may resume it" (t3-execution.js:253). API: `/executions/cancel`, `/sessions/release`.
##### Steps
1. Click **Cancel this run** → The state becomes "Cancellation requested". The session shows "Dispatch held: Cancellation of run_000042 holds queued work" (t3-execution.js:321).
2. If T3 is slow → Maya clicks **Repeat cancellation**, which appears on `cancel_requested`. Pardner also repeats it on its own every 10 s (control-pane.js:424-430).
3. Maya tries **Release held work** immediately, with the evidence "Stopped scope creep" → Alert: "Cancellation has not reached a terminal state" (`INVALID_EXECUTION_STATE`).
4. Next poll → The state reads "Ended: interrupted" (or cancelled). Partial output appears under **Output captured from T3**.
5. In the hold form, the list shows the hold text. Fill in **Review evidence**: "Run interrupted; git status shows only src/export/csv.ts touched, reverted by hand." Leave **Reviewed runs** empty.
6. Click **Release held work** → The holds disappear, the "Dispatch held" notice clears and the fields reset. The queued follow-up moves to "Submitting" on the next pass.
##### Variations
- T3 refuses the interrupt: the card goes back to "Running" or "Waiting for approval or input" with the reason "T3 did not confirm cancellation: {message}" (t3-execution.js:335). The hold stays.
- T3 reports `thread_not_interruptible` (a queued run): Pardner removes it from T3's queue instead.
##### Edge Cases
- The note "Cancellation holds the queue and does not undo changes" appears only in the Cursor Cloud section, not in the T3 section, so T3 users do not see it.
- A new hold arriving during release: `HOLD_CHANGED` "Review this new hold first: …".

---

#### STORY-115: Review a foreign run that someone started directly in T3
*(was control-tab/STORY-006)*
**Type**: medium
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. Her colleague Jonas Weber typed directly into the T3 thread from T3's own window while Maya was at lunch.
**Goal**: Clear the hold Pardner placed on the thread so her queued follow-up can go out.
**Preconditions**: The mapped thread has a run that Pardner did not submit.
**Ideal path**: 3 — read the hold, enter the run ID and evidence, release.
**Alternate paths**: The `/sessions/release` API with `reviewedRuns`. The internal `removeQueuedRun` exists in t3-execution.js:349 but has no route or UI.
##### Steps
1. Open Control → The session shows "Dispatch held: Run run_000057 is not linked to an execution here; review before reuse" (t3-execution.js:234). The queued card shows the same text as its reason.
2. Fill in **Review evidence** with "Jonas ran a lint fix; diff reviewed" and click **Release held work** without filling in **Reviewed runs** → Alert: "Review these runs first: run_000057" (`UNREVIEWED_RUN`, t3-execution.js:371).
3. Copy `run_000057` from the hold text into **Reviewed runs** (placeholder "Run IDs not started by Pardner"; separate several IDs with spaces or commas). Click **Release held work** → The hold clears and the baseline moves past this run.
4. The queued follow-up submits on the next idle pass.
##### Variations
- Two foreign runs: both IDs must be listed, for example "run_000057, run_000058".
##### Edge Cases
- If the foreign run is still active, the follow-up stays queued with "T3 thread is running" even after the release.
- Redundancy: the hold text appears three times, in the "Dispatch held:" notice, in the hold form's bullet list and as the queued execution's reason.

---

#### STORY-116: Unknown outcome after a lost reply — look up, then retry or abandon
*(was control-tab/STORY-007)*
**Type**: medium
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. Her Wi-Fi dropped and T3 restarted while a follow-up was being submitted.
**Goal**: Find out whether T3 accepted the request and either continue it or give it up safely.
**Preconditions**: An execution in "Unknown outcome" with the reason "Lost reply: T3 may have accepted this submission" (or "Controller stopped during submission").
**Ideal path**: 2 — look up; if nothing is found, retry with evidence.
**Alternate paths**: Pardner reconciles automatically right after a lost reply and on startup (control-pane.js:404, 393). API: `/executions/reconcile`, `/executions/resolve`.
**See also**: STORY-133
##### Steps
1. See "Unknown outcome" and the session line "Dispatch held: Unknown outcome: context blocked until reconciled" (t3-execution.js:142) → Click **Look for this request in T3**.
2. Found → The state moves to "Running" with the exact run ID. Done.
3. Not found → The card shows "Last lookup: No T3 record of this request; absence does not prove non-acceptance" (t3-execution.js:271).
4. Maya checks the T3 thread history herself and fills in **Reconciliation evidence**: "T3 thread shows no message after 14:02; safe to resend."
5. Click **Retry with the same request** → The state goes back to "Queued in Pardner" with the same request ID, so T3 deduplicates.
6. Alternatively, click **Abandon this outcome** → The state reads "Ended: abandoned". No verdict or artifact forms appear for abandoned outcomes.
##### Variations
- Maya clicks **Abandon** with empty evidence: blocked by `required` on the textarea.
##### Edge Cases
- Maya re-paired T3 in the meantime (STORY-119): **Retry** fails with `CREDENTIAL_CHANGED` "T3 deduplicates per credential, so retrying with another credential could run this twice". Only **Abandon** remains. The header notice "Requests that may already be in T3 cannot be retried with a new credential." warned about this.
- Queued work whose credential changed after a submission goes to "Unknown outcome" with "Credential changed after a possibly accepted submission" (t3-execution.js:165).

---

#### STORY-117: Unqualified T3 version holds every thread
*(was control-tab/STORY-008)*
**Type**: medium
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. She updated T3 Code to 0.1.7 over the weekend.
**Goal**: Resume dispatch, consciously accepting the new T3 version.
**Preconditions**: Paired. T3 now reports `serverVersion` 0.1.7.
**Ideal path**: 3 — fill in evidence, tick the accept-version box, release.
**Alternate paths**: Downgrade T3 to 0.1.5/0.1.6, which still requires releasing the hold. `/sessions/release` with `acceptVersion: true`.
##### Steps
1. Open Control → The status line reads "… · T3 0.1.7 · qualified 0.1.5, 0.1.6." Every session shows "Dispatch held: T3 0.1.7 is not qualified (qualified: 0.1.5, 0.1.6); requalify it before dispatch" (control-pane.js:19, 385).
2. Fill in **Review evidence** and click **Release held work**, without noticing the checkbox → Alert: "Accepting T3 0.1.7 is a separate decision; release with acceptVersion after requalifying it" (`VERSION_ACCEPTANCE_REQUIRED`).
3. Tick "Accept this T3 version for this controller" (shown only when a version hold exists, ControlPane.jsx:109, 135) and click **Release held work** again → This thread's hold clears and 0.1.7 is added to `acceptedVersions`.
4. Other mapped threads still show the hold, which Maya must release one by one, but the checkbox is no longer required because the version is now accepted.
##### Edge Cases
- The status line still says "qualified 0.1.5, 0.1.6" after acceptance. The accepted versions are in the snapshot (control-pane.js:496) but not shown.
- If the environment cannot be read, queued work waits with "T3 environment descriptor not read yet; dispatch waits for a qualified version" (control-pane.js:399).

---

#### STORY-118: Record an independent check and a rejected human verdict, with artifact mistakes
*(was control-tab/STORY-009)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor, reviewing Builder's ended run "Add retry to webhook sender".
**Goal**: Record that tests pass (independent check) but the result is rejected for style, and attach a PR reference.
**Preconditions**: Execution "Ended: completed".
**Ideal path**: 4 — check plus evidence, reject plus evidence, artifact text, record.
**Alternate paths**: `/executions/verdicts` and `/executions/artifacts` via the proxy. The `actorId` is always forced to the signed-in person (client-proxy.js:14).
**See also**: STORY-081
##### Steps
1. Switch **Verdict type** to "Independent check". Type evidence "CI run #881 green on 3 Node versions" and click **Accept** → Independent check reads "accepted by Maya Okafor".
2. Switch back to "Human acceptance" and type evidence "Retry loop lacks jitter; send back". Click **Reject** → Human acceptance reads "rejected by Maya Okafor". Both verdicts are kept separately (control-pane.js:311-315).
3. In **Record artifact** type `pr 412` → Alert: "Artifact kind must be one of: commit, branch, pull_request, test_result, note" (control-pane.js:16, 303).
4. Retype it as `pull_request okafor-labs/ledgerline#412` → It is recorded.
5. She also tries `commit main` → Alert: "Supply a commit hash".
##### Variations
- Only the latest verdict of each kind is shown (`findLast`). Earlier ones exist in `verdicts` but are not displayed.
##### Edge Cases
- Through the API, an independent check naming the agent that ran the work gets `FORBIDDEN` "An independent check cannot come from the Actor that ran the work". Human acceptance from a non-human gets `FORBIDDEN` "Human acceptance must come from a human Actor". Naming another `actorId` at all is refused by the proxy with `ACTOR_MISMATCH` first.
- The allowed artifact kinds are listed only in the error. The placeholder suggests just `commit abc1234`.
- Redundancy: the Pardner task detail has its own commit and issue links (`task.link-commit`, **Link GitHub issue**). Control artifacts are a second, host-local place to record a commit for the same work.

---

#### STORY-119: Credential expiring — pair again
*(was control-tab/STORY-010)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor, returning after two weeks.
**Goal**: Keep the T3 credential working without losing in-flight work.
**Preconditions**: The credential expires within 3 days (EXPIRY_WARNING_MS), has expired, or was rejected by T3 (401/403 → `auth_invalid`).
**Ideal path**: 3 — open the settings, enter a new code, click Pair again.
**Alternate paths**: `/credential` API.
**See also**: STORY-116
##### Steps
1. Open Control → The status line reads "T3 credential: expiring · expires 11/11/2026". The notice reads "Pair T3 again before the credential stops working. Requests that may already be in T3 cannot be retried with a new credential." (ControlPane.jsx:254).
2. Session cards may show "Last T3 pass failed: T3 credential is expired; pair again to continue" or "T3 refused the credential (401)".
3. **Control settings** is collapsed because sessions exist. Maya expands it, gets a code from T3, enters it and clicks **Pair again** → Status returns to "valid". Every thread is put into recovery (reconcile plus repeated cancel) on its next pass.
##### Edge Cases
- Any execution with a possibly accepted submission under the old credential can no longer be retried (STORY-116).
- The settings disclosure being closed hides the only fix for a warning shown at the top. The notice has no link to it.

---

#### STORY-120: Stale reads and an unreachable service
*(was control-tab/STORY-011)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Maya Okafor. Her laptop slept and the client service restarted.
**Goal**: Tell whether what she sees is current.
**Preconditions**: At least one mapped thread with a running execution.
**Ideal path**: 1 — read the label, or click Read T3 now.
**Alternate paths**: Wait for the 2 s poll. **Read T3 now** forces `/poll`, which also polls Cloud.
##### Steps
1. T3 stops answering → Labels change from "Read 3s ago" to "Stale: last read 1m ago (14:31:07)" on the session and on running cards (ControlPane.jsx:21-23).
2. The Pardner service itself is unreachable → The last view is kept and labels read "Stale: the service is unreachable; last known read 14:31:07". The alert shows the fetch error (ControlPane.jsx:220-225).
3. Service back → Click **Read T3 now** → Labels return to "Read 0s ago".
##### Edge Cases
- Ended executions show no freshness label, by design (ControlPane.jsx:49).
- Cloud contexts use different words ("Stale / not observed" / "Fresh read") and an ISO timestamp, while T3 uses local time (CloudControl.jsx:15-16). The information is the same, presented two ways.
- The age uses server `now`, so a skewed browser clock does not hide staleness (ControlPane.jsx:17).

---

#### STORY-121: Cursor Cloud context — register, save intent, cancel, freeze evidence, verdict, release hold
*(was control-tab/STORY-012)*
**Type**: long
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: Priya Raman, the local person on her Linux workstation, running project "Atlas Billing". She wants her Cursor agent Actor "Cora" to work in Cursor Cloud.
**Goal**: Run one Cloud attempt end to end and accept it with frozen evidence.
**Preconditions**: A control project `atlas` is saved (Projects form). Cora is an agent Actor not mapped to T3. A task exists. For live runs, a Cloud transport is configured and dispatch is enabled. In the default client the section says "Live dispatch disabled · Access not configured".
**Ideal path**: 9 — register context, save intent, (run), freeze evidence, give verdict evidence, accept.
**Alternate paths**: The `/cloud/*` API. There is no UI for `/cloud/contexts/authorize` or `/cloud/executions/acceptance`.
**See also**: STORY-112
##### Steps
1. In **Cursor Cloud**, expand **Register Cloud context** and read "Use a registered project and agent Actor with explicit task and sender IDs. This reserves a new Cloud agent identity; it does not adopt an existing chat."
2. Fill in **Cloud context ID** `atlas-cora-1`, **Cloud project ID** `atlas`, **Cloud agent Actor** (free text, so Priya must know the Actor ID; she first types "Cora", which fails `UNKNOWN_ACTOR` "Map a T3 thread to a registered agent Actor", and the message wrongly mentions T3).
3. Fix it with the Actor ID. Enter **Cloud repository URL** `git@github.com:raman/atlas-billing.git` → Alert: "Use a credential-free HTTPS repository URL". Change it to `https://github.com/raman/atlas-billing`.
4. Enter **Cloud starting ref** `main`, **Cloud authorized task IDs (comma separated)** (raw task IDs copied from the board) and **Cloud authorized sender Actors (comma separated)** (her own Actor ID). Click **Register Cloud context** → An article "Cursor Cloud · atlas-cora-1" appears with "https://github.com/raman/atlas-billing · main", "Agent: `{agentId}` · Not created · Stale / not observed" and "Cloud location · no local working directory. Observed: never".
5. Pick **Cloud task** (it lists raw IDs, not titles). Type **Cloud follow-up** "Migrate proration calc to integer cents" and click **Save Cloud intent** → An execution heading "{executionId} · queued" with "Run: Acceptance not established · submissions: 0 · execution outcome: pending".
6. With dispatch disabled → The reason reads "Live Cloud dispatch disabled", or "Cloud access not configured" (cursor-cloud-execution.js:106). Priya stops here unless the service is configured.
7. With dispatch enabled → The state goes from queued to running. The output stream shows in the `<pre>`. "Event history incomplete; fresh run reads establish state." may appear.
8. Priya decides to stop and clicks **Cancel exact Cloud run** → The context notice reads "Cancellation holds queued work; effects are not rolled back".
9. The run ends `terminal` → The form shows **Full commit hash**, **Diff evidence** and **Test command and results**. She pastes a 7-character short hash → Alert: "Full commit hash, diff bytes and test evidence required". She pastes the full 40-character hash and the output of `pytest -q: 88 passed`, then clicks **Freeze attempt evidence** → "Immutable evidence: `{sha256}`. Independent check and human acceptance remain separate."
10. In **Cloud verdict kind** "Human acceptance", fill in **Cloud verdict evidence** and click **Accept Cloud result** → A line "human: accepted by {actorId} · {evidence}" appears (a raw Actor ID, unlike T3's display names).
11. Fill in **Cloud hold review** "Cancelled attempt reviewed; partial branch deleted" and click **Release reviewed Cloud hold** → The hold clears.
##### Variations
- Restart during submission: "Restart during submission; acceptance is unresolved". The state becomes `unknown` and **Reconcile Cloud acceptance** appears. Clicking it gives "No documented follow-up request lookup; exact acceptance evidence required. No retry is authorized." There is no UI to supply that evidence (`/cloud/executions/acceptance` is API-only), so the UI is a dead end.
- A foreign run on the Cloud agent: hold "Foreign or unresolved run; context quarantined". Release fails with "Foreign or busy context cannot be released" until the agent is idle on a known run.
##### Edge Cases
- Trying **Accept Cloud result** before freezing: the form appears only after evidence exists. The API refuses with "Freeze attempt evidence before recording acceptance".
- Freeze after a later run: "Later run already changed this context; cannot attribute mutable evidence". Large artifact sets: "Evidence exceeds the 32 MiB capture limit" / "Artifact listing may be truncated; capture is incomplete".
- Release with work in flight: "Unresolved work blocks release".
- Registering Cora when she is already on a T3 thread: `AMBIGUOUS_ROUTE` "Actor is already mapped to T3".
- Redundancy and inconsistency: T3 uses checkbox pickers with names for tasks and senders, while Cloud uses comma-separated raw IDs. Verdict labels differ (**Accept** vs **Accept Cloud result**), and Cloud shows all verdicts while T3 shows only the latest of each kind.

---

#### STORY-122: An agent credential tries to use Control
*(was control-tab/STORY-014)*
**Type**: short
**Topic**: Control tab (T3 and Cursor Cloud)
**Persona**: The Builder Codex agent, holding a `client agent-grant` token file. It was asked by Maya to "queue yourself a follow-up in T3".
**Goal**: (The agent's attempt) read or post control records.
**Preconditions**: An agent credential from `pardner client agent-grant --output-file builder.json` or the `pardner-openai-codex` wrapper.
**Ideal path**: 1 — the refusal should be immediate and explain the reason.
**Alternate paths**: none found. Agents have no Control route. The only legitimate path is for the local person to queue the follow-up.
**See also**: STORY-129
##### Steps
1. The agent `GET`s `…/projects/{id}/api/pardner/control` with its bearer token → 403 `FORBIDDEN` "Control is available only to a person using Pardner on this computer" (client-proxy.js:25).
2. The agent's project details report `controlAvailable: false`, so a browser session under an agent would not show the **Control** button (test/client-control.test.js:48).
3. The agent tries `POST …/pardner/control/poll` or `/projects` → Same `FORBIDDEN`.
##### Variations
- A person's session posting `/executions` with `fromActorId: 'builder'` → 403 `ACTOR_MISMATCH` "Actor must match authenticated participant". The proxy refuses rather than rewriting (client-proxy.js:34-37, 40-42). An omitted sender is filled in as the person.
- A person posting an unknown route (`/sessions/delete`, `/executions?actor=x`) → `FORBIDDEN` "Unsupported control endpoint" or "Unsupported query parameter".
##### Edge Cases
- An agent that tries `pardner client operation` to reach control cannot. It posts only board operations, and non-board types get "This operation is not available to board credentials".
- An agent-only device exchanging a browser grant: `FORBIDDEN` "Agent-only device has no human browser authority".

---

### Agent credentials, CLI and bridge attach


Source files read for this topic: lib/client-cli.js, lib/cli.js, lib/cli-trace.js, lib/client-service.js, lib/client-proxy.js, lib/client-auth.js, lib/client-identity.js, lib/client-projects.js, lib/agent-bridge.js, lib/bridge-inbox.js, lib/codex-bridge-adapter.js, lib/local-service.js, lib/sync-client.js, scripts/control-runtime.py, automerge-sync-server.js:495-520, ui-prototype/src/Pardner.jsx:194-199, docs/PARDNER-CLIENT.md, docs/PARDNER-BRIDGE.md, docs/PARDNER-CONTROL-RUNTIME.md. Every CLI result is one JSON envelope on stdout, `{success:true,…}` or `{success:false,error:{code,message,details}}`, plus `CODE: message` on stderr, with exit 1 on failure (bin/pardner.js:4-13).

#### STORY-123: Mint the setup agent's credential for a fresh project
*(was agent-credentials-bridge/STORY-001)*
**Merged in**: comments-mentions-handoff/STORY-009 — Priya's Codex agent granting a credential and listing pending mentions; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: short
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Priya Raman, backend engineer. She started the project "Ledgerline Billing" in the browser yesterday with Codex as her setup agent and now wants Codex to read the board from its terminal.
**Goal**: Get a private agent credential file for her Codex Actor.
**Preconditions**: The client service is running (`pardner open` was used). Priya's identity is confirmed. She created "Ledgerline Billing" (setup agent harness `openai-codex`).
**Ideal path**: 2 — find the project ID, then run one `agent-grant` command. The project ID lookup could be skipped if the command accepted a project name, but it does not.
**Alternate paths**: `pardner client operation` mints a grant on every call without writing a file (client-cli.js:174-178). The control runtime fetches the grant itself on first `control cli --agent` use (control-runtime.py:303-319). There is no browser UI for agent credentials.
**See also**: STORY-054, STORY-126
##### Steps
1. Runs `pardner client list` → JSON `/session` comes back with `identity`, `device`, `setupAgent:{harnessId:"openai-codex",name:"Setup agent",…}` and `projects:[{id:"…",name:"Ledgerline Billing",actorId:"actor-…",apiBase:"/pardner/client/v1/projects/…/api",controlAvailable:true,…}]`. The `actorId` here is Priya's human Actor, not the agent. This is a point of hesitation.
2. Copies the project `id`. Her first attempt is `pardner client agent-grant --project 7f3c… ` without `--output-file` → `INVALID_ARGUMENT: Supply --output-file to store the private agent credential` (client-cli.js:169).
3. Runs `pardner client agent-grant --project 7f3c… --output-file ~/.pardner/ledgerline-codex.json` → `{success:true, actorId:"actor-9a1e…", projectId:"7f3c…", credentialFile:"/Users/priya/.pardner/ledgerline-codex.json"}`. The token is never printed.
4. Opens the file (written atomically) → `{token, actorId, projectId, harnessId:"openai-codex", model?, managedBy?, apiBase:"http://127.0.0.1:PORT/pardner/client/v1/projects/7f3c…/api"}` (client-cli.js:171).
##### Variations
- Harness flag given explicitly (`--harness openai-codex`): the result is the same, because the default is `state.setupAgent.harnessId` (client-service.js:349).
- The setup agent was started with `--model gpt-5.5-codex --managed-by T3`: the grant carries `model` and `managedBy` as reporting defaults (client-service.js:360-362).
- Run again later: the **same token** comes back. Grants are reused until revoked (client-auth.js:36-44).
- *(merged)* Right after the grant, list what is waiting: `pardner mentions pending --token-file ~/.pardner/codex-ledger.json` → `{mentions:[{id:"mention-…", taskId, commentId, toActorId, fromActorId, timestamp, deliveryState:"pending"}]}`.
- *(merged)* `--harness anthropic-claude-code` grants the Claude Code agent instead (it must be enrolled; see STORY-124).
- *(merged)* `--actor someone-else` with a token file: the proxy refuses with `ACTOR_MISMATCH` "Actor must match authenticated participant".
- *(merged)* `pardner bridge run --config … --token-file FILE` polls pending deliveries automatically instead (agent-bridge.js:138-140; STORY-131).
##### Edge Cases
- `--project` omitted: `INVALID_ARGUMENT: Supply --project` (client-cli.js:150).
- Wrong or unknown project ID: `NOT_FOUND: Project not found` (client-service.js:44).
- Service not running: `CLIENT_NOT_RUNNING: Start Pardner with pardner open or pardner client serve` (client-cli.js:117). `agent-grant` does not start the service the way `open` does.
- `--harness claude` (a typo for `anthropic-claude-code`): `INVALID_ARGUMENT: Unsupported execution harness` (client-service.js:350). The message does not list the valid IDs (`openai-codex`, `anthropic-claude-code`, `cursor`; client-identity.js:9).
- The project is a replica and the hub is unreachable: the grant forces a fresh admission check (`refreshAdmission … fresh:true`, client-service.js:359) and can fail with `HUB_UNAVAILABLE`.
- Redundancy: the project ID appears in `client list`, `client status`, `client show` and the grant file. The browser never shows it.
- *(merged)* Harness not enrolled: `FORBIDDEN` "Harness is not enrolled on this device; join an Agent invitation first".
- *(merged)* Both `--token` and `--token-file`: "Supply --token or --token-file, not both". An empty file gives "--token-file is empty". A credential for another project: `PROJECT_MISMATCH`.

---

#### STORY-124: Grant refused for a second harness, then enroll it through an Agent invitation
*(was agent-credentials-bridge/STORY-002)*
**Merged in**: invitations/STORY-006 — Aisha Karim connecting Cursor to "Billing Service v2" with an Agent invitation; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Priya Raman again. She wants Claude Code (driven from T3) on the same laptop to work "Ledgerline Billing" alongside Codex.
**Goal**: Get a working credential for an `anthropic-claude-code` Actor.
**Preconditions**: As in STORY-123. Only `openai-codex` is enrolled on this device.
**Ideal path**: 4 — create an Agent invitation, join with harness metadata, grant, then use. A well-designed flow could fold "enroll a harness I own" into one command, but the code needs an invitation round-trip.
**Alternate paths**: (a) Invitation from the browser: **Invite ▾** → **Agent** ("Another agent of yours") → dialog "Connect another of your agents" → **Create invitation** → **Copy invite** or **Show invite text**. (b) Invitation from the CLI: `pardner client invite --project ID --purpose agent --output-file FILE --operation-id ID`. (c) Join on a different machine instead (see STORY-125).
**See also**: STORY-036
##### Steps
1. Runs `pardner client agent-grant --project 7f3c… --harness anthropic-claude-code --output-file ~/.pardner/ledgerline-claude.json` → `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first` (client-service.js:355-358). No file is written.
2. Unsure what an "Agent invitation" is, she opens the browser board and clicks **Invite ▾** → **Agent**. The dialog reads "Connect another of your agents … It joins as your agent; Pardner doesn't start or instruct it."
3. Clicks **Create invitation** → the state line shows **Waiting to be used** and "Expires in 24 h · {date}".
4. Clicks **Copy invite** → "Copied. Treat it like a password and send it privately; it works once." She pastes it into `~/tmp/claude-invite.txt`.
5. Alternatively, from the CLI: `pardner client invite --project 7f3c… --purpose agent --output-file ~/tmp/claude-invite.txt --operation-id inv-claude-1` → `{invite:{…}, invitationFile:"…"}`.
6. Runs `pardner client join --invitation-file ~/tmp/claude-invite.txt --operation-id join-claude-1 --harness anthropic-claude-code --name "Gamma" --model claude-opus-5-5 --managed-by T3` → `{project:{id:"7f3c…", …}}`. The existing project gets a new agent Actor plus agent admission and reporting (client-projects.js:71-81).
7. Back in the browser, the avatar stack shows a new bot avatar "Gamma, agent, offline". The invitation row under **Invitations for this project** now reads **Used**.
8. Runs the grant again with `--harness anthropic-claude-code` → `{actorId:"actor-c42d…", projectId, credentialFile}`. The file includes `model:"claude-opus-5-5"` and `managedBy:"T3"`.
9. Runs `pardner --token-file ~/.pardner/ledgerline-claude.json tasks --json` → the task list and `status`.
##### Variations
- `--harness` left off the join: the agent metadata falls back to `state.setupAgent` (Codex) (client-projects.js:57). This re-enrolls Codex rather than adding Claude Code, so the later grant with `--harness anthropic-claude-code` still fails.
- `--harness cursor`: the same flow. The avatar label reads "Cursor".
- *(merged)* Cursor on the same Mac joins with `pardner client join --invitation-file … --operation-id cursor-join-billing --harness cursor --name Cursor --model gpt-5.5`. The copied prompt reads "Join project "…" as my agent using your actual harness and model… this invitation does not grant human browser access." Reopening **Invite → Agent** then shows "Agent · Used"; the avatar stack gains a Cursor agent, offline until it reports.
- *(merged)* Fresh client on another machine: if the agent redeems on a client with no identity, that client becomes agent-only (`humanAuthority=false`) and has no browser access (`FORBIDDEN` "Agent-only device has no human browser authority"; see STORY-125).
- *(merged)* Pasted into her own **Join project** box by mistake: the Welcome Join form has no client-side purpose check (`ClientApp.jsx:242`; only the Link this device form checks, `:136`), so the request goes to the server. Per STORY-027, her own Agent invitation would enrol her agent as an extra Actor. Verify this.
##### Edge Cases
- Join retried after a slow registration: `REGISTRATION_PENDING: Actor registration is not saved locally yet; retry this join` (client-projects.js:99). Re-run with the same `--operation-id`.
- Join retried with the same `--operation-id` but a different file: `OPERATION_ID_REUSED`.
- Invitation pasted after 24 h: `INVITE_EXPIRED`. Already used: `INVITE_USED`. Revoked in the dialog: `REVOKED: Invitation revoked`.
- Pasting the Agent invitation into the browser's **Link this device** page is refused: "Agent invitations are for your agent, not this browser." (ClientApp.jsx:132-141).
- Redundancy: invitation creation exists both in the **Invite** dialog and in `client invite`. The used or expired state is visible only in the dialog's history list, not in the CLI.
- *(merged)* An agent principal calling the invite route: `FORBIDDEN` "Human authority required".
- *(merged)* Retry after an uncertain response: with the same operation ID and unchanged file the retry resumes and does not use up the invite. With a changed `--model` or harness the hub rejects it with `OPERATION_ID_REUSED` "Invitation retry changed recipient or input".

---

#### STORY-125: Set up an agent-only build box from an Agent invitation
*(was agent-credentials-bridge/STORY-003)*
**Merged in**: identity-device-linking/STORY-008 — Lena Hoffmann enrolling Cursor on the shared build box "ci-mac-02" while a browser tab sits on its identity step; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Marcus Oyelaran, platform engineer. He is preparing a headless Mac mini, "ci-mini-02", so Priya's Codex agent can work "Ledgerline Billing" overnight without a human identity on that machine.
**Goal**: Have Codex on ci-mini-02 read and write the board with no human browser authority.
**Preconditions**: Priya's client is the hub and reachable over HTTPS (`--public-url https://pardner.priya.example`). Priya created an Agent invitation and sent it privately. ci-mini-02 has no Pardner data yet.
**Ideal path**: 3 — start the service, join, grant.
**Alternate paths**: `pardner open` starts the service but then fails to launch a browser, because `client open` needs human authority. Use `pardner client serve` directly or a supervised process.
**See also**: STORY-005, STORY-010
##### Steps
1. On ci-mini-02 he runs `pardner client serve --device-name ci-mini-02 --harness openai-codex` → `{serving:true, mode:"client", localUrl:"http://127.0.0.1:PORT/pardner/"}`. The process stays in the foreground.
2. In a second shell he runs `pardner client join --invitation-file ~/ledgerline-agent-invite.txt --operation-id ci-join-1 --harness openai-codex --name "Overnight Codex"` → `{project:{…}}`. Because there is no local identity and the receipt has `humanAllowed:false`, the registry sets `humanAuthority=false` and revokes any human sessions (client-projects.js:65-68).
3. Out of habit, tries `pardner client open` → `FORBIDDEN: Human authority required` (client-service.js:302-304 calls `this.human`).
4. Runs `pardner client agent-grant --project 7f3c… --output-file /Users/ci/.pardner/agent.json` → succeeds with Priya's agent Actor ID for this harness.
5. Runs `pardner --token-file /Users/ci/.pardner/agent.json mentions pending` → `{mentions:[…]}`, served through the hub `/delivery` because this is a replica (client-proxy.js:56-58).
##### Variations
- Someone opens `http://127.0.0.1:PORT/pardner/` on ci-mini-02 with an old grant link: the exchange fails with `FORBIDDEN: Agent-only device has no human browser authority` (client-auth.js:22).
- Writes from this device are checked against the hub's `/policy` with a 10 s admission cache (client-service.js:18, 101-142).
- *(merged)* Issuing the invitation from the browser: **Invite ▾** → **Agent** → dialog **Connect another of your agents** ("For an agent you already run in another app. It joins as your agent; Pardner doesn't start or instruct it.") → **Create invitation** → **Copy invite**. The copied prompt says "Join project "…" as my agent… otherwise start an agent-only client… this invitation does not grant human browser access."
- *(merged)* Joining with full reporting metadata: `pardner client join --invitation-file /secure/inv.txt --operation-id ci-join --harness cursor --name "Cursor (ci)" --model gpt-5.5 --managed-by T3`. The box adopts the sponsor identity (`state.identity ??= receipt.identity`).
- *(merged)* A browser tab left open on the box's **Welcome to Pardner** gets `AUTH_REQUIRED` on its next request and shows "This browser isn't signed in to your local Pardner client."; **Check again** doesn't help (see STORY-005, STORY-010).
- *(merged)* On the sponsor's board the AvatarStack shows the new agent. Its profile reads "Agent · {human}'s agent", with **Works for**, **Harness** (e.g. Cursor) and **Devices** including the box name.
##### Edge Cases
- Plain-HTTP public hub: the join fails with "Remote invitations require HTTPS; use a secure private route" (client-invites.js:13).
- Hub offline during the join: `HUB_UNAVAILABLE`. Retry with the same `--operation-id`.
- Priya later runs `client revoke --kind agent --id actor-…`: the ci-mini-02 grant stops authenticating (STORY-130).
- `client invite` from ci-mini-02 is refused with `FORBIDDEN: Human authority required`.
- *(merged)* If the box's client had already confirmed a different identity, the join fails with `IDENTITY_MISMATCH` "Destination already belongs to another identity".
- *(merged)* The signed-out screen tells the person to "Ask your agent to open Pardner for you", which can never work on an agent-only client. The cause isn't explained.
- *(merged)* On the Link this device page an Agent invitation is refused with "Agent invitations are for your agent, not this browser.", so the browser cannot do this enrolment at all.

---

#### STORY-126: Agent works a task end to end with `--token-file`
*(was agent-credentials-bridge/STORY-004)*
**Type**: long
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: The Codex agent working for Priya. It was told in a T3 thread: "Pick up the Stripe webhook retry task in Ledgerline; credential at ~/.pardner/ledgerline-codex.json."
**Goal**: Find its assigned task, report progress, commit with evidence and hand the task back to Priya for review.
**Preconditions**: The credential from STORY-123 exists. The task "Retry failed Stripe webhooks with backoff" (task-3b9e0c1d2a4f5e6b7c8d9e0f) is assigned to the Codex Actor in Up next. Priya commented "@{codex handle} please start with the idempotency key". The cwd is a Git worktree of the billing repo.
**Ideal path**: 8 — list, show, claim and ack the mention, set In progress, comment, commit, hand off. Fewer steps are not possible while each write needs revisions taken from `show`.
**Alternate paths**: The `pardner-openai-codex` control-runtime wrapper runs the same commands without `--token-file` (STORY-132). `client operation --request` can send any of these as raw operations (STORY-128). The person can do the human-side equivalents in the browser: **Status** quick select, **Add comment**, **Hand off work**.
**See also**: STORY-081, STORY-093, STORY-094, STORY-134
##### Steps
1. `pardner --token-file ~/.pardner/ledgerline-codex.json tasks --assignee actor-9a1e… --json` → `{tasks:[…], status:{savedLocally:true,…}}`. `--server` defaults to the credential's `apiBase` and the Actor is the credential's own (cli.js:111-121). The agent first tried `--assignee me`, which failed with `UNKNOWN_ACTOR: Unknown Actor: me` (workspace-schema.js:94). It then used its `actorId` from the credential file.
2. `pardner --token-file … show task-3b9e…` → the task context with `fields`, per-field revisions, `comments`, `mentions`, `history`, `evidence` and `conflicts`. The proxy appends `?actor=` with the credential's Actor (client-proxy.js:59).
3. `pardner --token-file … mentions pending` → one pending mention from Priya.
4. `pardner --token-file … mentions claim-next --request-id codex-run-17` → `{claimed:true, mention:{id,…}, claimToken:"…"}` (cli.js:269-270).
5. `pardner --token-file … mentions ack mention-… --claim-token …` → acknowledged. The mention stops showing as pending.
6. `pardner --token-file … update task-3b9e… --status in-progress --revisions '{"status":["op-…"]}'`. The revision is copied from step 2.
   - The agent first passed an old revision → `STALE_UPDATE: This field changed since it was read; refresh its context`, with `details.current` / `expected` (workspace-schema.js:137).
   - It re-ran `show` and retried successfully.
7. In the browser, Priya's card moves to In progress. The panel shows "Here now" only if the agent opened a presence session, which the CLI does not do.
8. `pardner --token-file … comment task-3b9e… "Added idempotency key on webhook_events; backoff 2^n capped at 10 min. @human-… please check the cap."` → `{taskId, commentId, mentionIds:[…]}`. In the browser, the comment shows a "Notified …" chip.
9. Edits code. `git add -A`.
10. `pardner --token-file … commit --task task-3b9e… --model gpt-5.5-codex -- -m "Retry Stripe webhooks with capped backoff"` → runs `git commit`, records a trace and sends `task.link-commit` → `{trace, receipt}` (cli-trace.js:16-36). The browser's **Evidence** section lists the commit.
11. `pardner --token-file … show task-3b9e…` again to get fresh `status` and `assignee` revisions.
12. `pardner --token-file … handoff task-3b9e… --to human-… --status review --message "Ready for review: see commit abc1234 and tests in webhook_retry.test.ts" --revisions '{"status":["…"],"assignee":["…"]}'` → `{taskId, commentId, mentionIds}`. The handoff changes assignee and status and writes a mention comment (workspace-commands.js:230-239).
13. In the browser the task moves to Review, assigned to Priya. History reads the handoff sentence. Activity shows it under "Status changes and handoffs".
14. `pardner --token-file … activity --task task-3b9e… --limit 5` → the agent's own events, newest first.
##### Variations
- Using `trace task task-3b9e…` instead of `show` to see only `evidence`.
- `link-commit task-3b9e… --commit '{"hash":"…","message":"…"}'` for a commit made earlier without the wrapper.
- `--operation-id` supplied on each write so that retries are idempotent. Without it, a random UUID is generated per call (cli.js:154), so a blind retry can duplicate a comment.
##### Edge Cases
- `git commit` fails (nothing staged): `GIT_COMMIT_FAILED`. No trace is recorded.
- Git succeeds but `link-commit` fails (e.g., client stopped): the error details include `commitHash`, `traceRecorded:true` and `recovery:"Use link-commit with this existing commit; do not create another Git commit"` (cli-trace.js:29-32).
- Run outside a Git repo: `GIT_REPOSITORY_REQUIRED: Run this command inside a Git repository`.
- `--to Priya` when two Actors share a matching reference: `AMBIGUOUS_ACTOR` "…use an unambiguous Actor reference".
- The handoff message is required by the UI, but the CLI passes `--message` as is. If it is omitted, the server-side validation decides.
- Redundancy: task state appears in `tasks`, `show`, the board card, the task panel and Activity. The comment appears in `comments`, `show` and the panel's Comments.

---

#### STORY-127: Mistakes with `--token-file` and how each one fails
*(was agent-credentials-bridge/STORY-005)*
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Dana Whitfield, a contractor scripting a Cursor agent for the project "Harbor Docs Revamp". She is copying commands from README.md and gets several things wrong.
**Goal**: Make a working read and write from a script using the agent credential.
**Preconditions**: The credential `~/harbor-cursor.json` came from `client agent-grant --harness cursor`.
**Ideal path**: 1 — `pardner --token-file ~/harbor-cursor.json tasks --json`.
**Alternate paths**: A bare token file plus explicit `--server PROJECT_API_BASE` (docs/PARDNER-CLIENT.md:127-131). `PARDNER_API_TOKEN` plus `--server`, though the token then sits in the environment rather than a file.
**See also**: STORY-135
##### Steps
1. Runs `pardner --token "$(jq -r .token ~/harbor-cursor.json)" --token-file ~/harbor-cursor.json tasks --json` → `INVALID_ARGUMENT: Supply --token or --token-file, not both` (cli.js:103).
2. Extracts the token into `~/harbor.token` and runs `pardner --token-file ~/harbor.token tasks --json`. With no `apiBase` in the file, the URL falls back to `.pardner/connection.json` or `http://127.0.0.1:8004` (cli.js:109) → `LOCAL_SERVICE_UNAVAILABLE` (sync-client transport error). If a standalone `pardner serve` happens to listen on 8004, she silently gets the wrong board.
3. Adds `--server http://127.0.0.1:PORT/pardner/client/v1/projects/ID/api` → the read works. The CLI resolves the Actor by matching the URL and calling `/session` (cli.js:112-118).
4. Tries a write with `--actor priya` to "be safe": `pardner --token-file ~/harbor.token --server … comment task-… "Draft outline uploaded" --actor priya` → `ACTOR_MISMATCH: Actor must match authenticated participant` (client-proxy.js:47-48, 62).
5. Drops `--actor` and switches back to the JSON credential: `pardner --token-file ~/harbor-cursor.json comment task-… "Draft outline uploaded"` → success, authored by the Cursor Actor.
##### Variations
- `--token-file` pointing at an empty file: `INVALID_ARGUMENT: --token-file is empty`.
- A JSON file without `token`: "--token-file JSON must contain a token". Malformed JSON: "--token-file must be valid JSON".
- `--agent X` is accepted as an alias for `--actor` (cli.js:131), with the same mismatch behavior.
##### Edge Cases
- Using the Harbor credential against another project's `--server` URL: `PROJECT_MISMATCH: Credential belongs to another project` (client-service.js:49).
- Client stopped between calls: `LOCAL_SERVICE_UNAVAILABLE`. The client restarted on a new port: the `apiBase` in the file is stale and needs a fresh `agent-grant` (control-runtime cures this by fixing `httpPort`).
- `--actor` used only on `activity` is a filter, so `activity --actor priya` works with a token file. The same flag on a write is refused. This inconsistency is a clarity issue.
- Unknown flag such as `--project`: `Unknown option: --project` (cli.js:84). Only `client …` commands take `--project`.

---

#### STORY-128: Send a raw operation with `client operation`
*(was agent-credentials-bridge/STORY-006)*
**Type**: short
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Priya Raman. She is scripting a one-off backfill to link GitHub issue `ledgerline/billing#412` to a task, as her agent, without managing a credential file.
**Goal**: Run a single board operation attributed to her agent.
**Preconditions**: The client is running. Codex is enrolled.
**Ideal path**: 1 — a single command.
**Alternate paths**: `pardner --token-file FILE issue link task-… ledgerline/billing#412`. `pardner --token-file FILE operation --request JSON`. In the browser, the task panel's **Link GitHub issue** field and **Link issue** button, which act as the human, not the agent.
**See also**: STORY-079
##### Steps
1. Runs `pardner client operation --project 7f3c… --request '{"type":"task.link-issue","payload":{"taskId":"task-3b9e…","repository":"ledgerline/billing","number":412}}'`. Internally this mints or reuses the agent grant and POSTs to `…/api/automerge/operations`, with the `operationId` defaulted (client-cli.js:174-178) → the result of the operation.
2. Opens the task in the browser → under **GitHub issues** the link `ledgerline/billing#412` appears with **Unlink**. Activity attributes it to the Codex agent.
##### Variations
- `--harness anthropic-claude-code`: performs it as the Claude Code Actor, if that harness is enrolled.
- `"operationId":"backfill-412"` inside the request: re-running replays rather than duplicating. The same ID with a different payload gives `OPERATION_ID_REUSED`.
##### Edge Cases
- Malformed `--request` (single quotes lost by the shell): `JSON.parse` is not wrapped here (client-cli.js:176), so the error is `INTERNAL_ERROR` with a raw SyntaxError message. Compare `pardner operation`, which reports "--request must be valid JSON" (cli.js:93).
- `--request` omitted: it defaults to `{}` → `FORBIDDEN: This operation is not available to board credentials` (no `type`), which is a misleading message.
- A body naming `"actorId":"actor-<Priya human>"`: `ACTOR_MISMATCH`.
- A body with `"projectId":"other"`: `PROJECT_MISMATCH: Operation belongs to another project` (client-proxy.js:66).

---

#### STORY-129: Agent tries operations that are outside the board allowlist
*(was agent-credentials-bridge/STORY-007)*
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: The Claude Code agent "Gamma", trying to "set up the project properly" on its own initiative.
**Goal**: Register a new reviewer bot Actor, and read the Control pane to see T3 runs.
**Preconditions**: Gamma holds a valid credential for "Ledgerline Billing".
**Ideal path**: 0 — neither goal is permitted for agent credentials. The ideal UX is a fast, clear refusal that names the correct route.
**Alternate paths**: Actors join only through invitations (Invite ▾ → Human/Agent/My device). Control is reached only by the local person, through the browser **Control** view or `control open`. `actors register` works only on a standalone `pardner serve` (STORY-134).
**See also**: STORY-122, STORY-135
##### Steps
1. `pardner --token-file ~/.pardner/ledgerline-claude.json actors register actor-reviewbot --handle reviewbot --kind agent` → `FORBIDDEN: This operation is not available to board credentials` (client-proxy.js:65). The message does not say "use an Agent invitation".
2. `pardner --token-file … actors list` → works (a read of `/automerge/doc` with people merged, client-proxy.js:61).
3. `pardner --token-file … operation --request '{"type":"actor.register","payload":{…}}'` → the same `FORBIDDEN`.
4. Gamma tries the Control API directly over HTTP with its bearer token (`GET …/projects/ID/api/pardner/control`) → `FORBIDDEN: Control is available only to a person using Pardner on this computer` (client-proxy.js:29). There is no CLI command for Control.
5. Gamma tries `GET …/api/automerge/doc?limit=5` → `FORBIDDEN: Unsupported query parameter` (client-proxy.js:44).
6. Gamma tries `POST …/api/automerge/ws-ticket` with `{"purpose":"replica"}` → `REPLICA_REQUIRED: Native replicas require separate enrollment`.
7. Gamma asks Priya, in a task comment through `comment`, to register the bot. Priya uses **Invite ▾** → **Agent** instead.
##### Variations
- Allowed types run fine. These are `task.*` (create, update, resolve, handoff, link-commit, branch, merge, link-vein, unlink-vein, link-issue, unlink-issue), `comment.*` (add, edit, delete, resolve), `read.mark`, and `goal.*` / `vein.*` (create, update, resolve) (client-proxy.js:5-7). For example, `vein create --title "Batch retries" --goal "Reliable webhooks"` succeeds.
##### Edge Cases
- `client invite` with the operator token is human authority, not agent authority. An agent with shell access to `client-connection.json` effectively is the operator, so this is a trust boundary documented only by file permissions.
- Any other GET path, e.g. `/automerge/operations`: `FORBIDDEN: Unsupported workspace endpoint`.
- PUT or DELETE: `FORBIDDEN: Unsupported method`.

---

#### STORY-130: Revoke an agent and observe what its tools see
*(was agent-credentials-bridge/STORY-008)*
**Merged in**: presence-profiles/STORY-010 — Maya Okafor retiring the Cursor agent "Wren" and watching its presence marker; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Priya Raman. She learns the overnight Codex on ci-mini-02 posted noisy comments and wants to cut it off now.
**Goal**: Revoke the agent so its credential stops working everywhere.
**Preconditions**: Codex holds credentials on her laptop and ci-mini-02 (STORY-125). A bridge and the control wrapper may be using them.
**Ideal path**: 2 — find the agent Actor ID, then revoke. A UI with a **Revoke** button next to the agent avatar would make this 1; no such UI exists ("There is no UI for member, device or agent revocation").
**Alternate paths**: `client revoke --kind device --id DEVICE_ID` for ci-mini-02 alone. `--kind member` (creator only). Revoking only the unused invitation in the **Invite** dialog does not affect an already-joined agent.
**See also**: STORY-021, STORY-045, STORY-134
##### Steps
1. Runs `pardner client show --project 7f3c…` → `{project, actors:[…], presence}`. She finds the agent with `kind:"agent"`, `harnessId:"openai-codex"`, `id:"actor-9a1e…"`. The browser profile dialog shows name, harness and devices but not the Actor ID, so she cannot get it there.
2. Runs `pardner client revoke --project 7f3c… --kind agent --id actor-9a1e… --operation-id revoke-codex-1` → `{revoked:true, kind:"agent", id:"actor-9a1e…"}`. Agent sessions are marked revoked, `revokedActors` is updated, sockets are terminated and presence ends (client-service.js:208-235).
3. On her laptop, Codex runs `pardner --token-file ~/.pardner/ledgerline-codex.json tasks --json` → `AUTH_REQUIRED: Open Pardner through client open to authenticate` (client-auth.js:47). The wording is aimed at people, which confuses an agent.
4. She tries to mint a fresh grant: `client agent-grant --project 7f3c… --output-file …` → `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`, because the Actor is in `revokedActors` (client-service.js:355-358).
5. The bridge using that credential records `source` as `AUTH_REQUIRED` in `bridge status` and stops dispatching.
##### Variations
- Running `client revoke` with an `--operation-id` it has already used, but a different `--id`: `OPERATION_ID_REUSED`.
- On a replica: revoke is forwarded to the hub `/revoke` and needs `humanAllowed`.
- *(merged)* Presence effect, seen from the board: the revoked agent's "Here now" marker (e.g. "W" plus a bot glyph on its card) is gone within 5 s and its avatar shows Offline; within 15 s the project poll refreshes the actor list. Live presence sessions bound to the agent are ended (client-service.js:226-230). The profile has no revoke button; profiles are read-only.
- *(merged)* `--kind device` ends every session from that device, so the human and their agents on it all go Offline. `--kind member` (creator only) ends all sessions for that human's Actors.
- *(merged)* Stopping the agent's harness instead only lets its presence session lapse after the 45 s TTL.
##### Edge Cases
- `--kind agent --id` naming another person's agent: `FORBIDDEN: Agent belongs to another human`.
- Missing `--kind` or `--id`: "Supply --kind device|agent|member and --id".
- The control runtime keeps reusing its cached `credentials/openai-codex.json` and fails with `AUTH_REQUIRED` "until you remove its file to request a fresh grant" (PARDNER-CONTROL-RUNTIME.md:194-195). Removing the file still fails, because the re-grant is refused (step 4). The docs suggest a recovery that the code does not allow.
- Recovery means a new Agent invitation, but the same harness ID maps to the same deterministic Actor ID (`actorId(humanId, harnessId)`), which remains in `revokedActors`. Whether re-enrollment can succeed is unclear from the code. Docs say "Recovery after revocation means a fresh client directory and new invitations."
- *(merged)* The revoked agent's later presence reports fail with `REVOKED` "Project membership is not available".

---

#### STORY-131: Attach a Codex bridge to a client project
*(was agent-credentials-bridge/STORY-009)*
**Type**: long
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Marcus Oyelaran. He wants @-mentions of Priya's Codex agent in "Ledgerline Billing" to wake a dedicated Codex App Server thread automatically.
**Goal**: A running `pardner bridge run` that dispatches authorized mentions to one bridge-owned Codex session.
**Preconditions**: Codex App Server is listening on `ws://127.0.0.1:9001`. There is a dedicated bridge-owned thread `thr_7c1…` whose cwd is `/Users/priya/wt/ledgerline-retry`. The agent credential is at `/Users/priya/.pardner/ledgerline-codex.json`.
**Ideal path**: 5 — inspect, write the config, run, check status, then trigger and verify. The config could be generated from the inspect output, but it is hand-written today.
**Alternate paths**: `credentialFile` inside bridge.json instead of `--token-file` on each command (agent-bridge.js:36). Standalone mode with `dataDirectory`, where the bridge reads `connection.json` and the prompt says "Use pardner with --data and --actor explicitly" (agent-bridge.js:327-328). Control's **Map a T3 thread** in the browser is a separate T3 integration, not this bridge.
**See also**: STORY-093, STORY-112
##### Steps
1. `pardner bridge inspect --endpoint ws://127.0.0.1:9001 --session thr_7c1… --worktree /Users/priya/wt/ledgerline-retry` → `{threadId, worktree:"/Users/priya/wt/ledgerline-retry", expectedPolicy:{approvalPolicy, approvalsReviewer, sandbox}}` (codex-bridge-adapter.js:119-125).
   - On a first attempt he forgot `--worktree` → "Supply --session and --worktree for a dedicated Codex session".
2. Writes `/Users/priya/bridge/ledgerline.json` with:
   - `workspaceId` (the project ID) and `inboxDirectory: "/Users/priya/bridge/inbox"`
   - `mappings:[{actorId:"actor-9a1e…", adapter:"codex-app-server", sessionOwner:"bridge", endpoint:"ws://127.0.0.1:9001", threadId:"thr_7c1…", worktree:"/Users/priya/wt/ledgerline-retry", expectedPolicy:{…pasted…}, enabled:true, allowedTaskIds:["task-3b9e…"], allowedFromActorIds:["actor-<Priya human>"]}]`
3. `pardner bridge run --config /Users/priya/bridge/ledgerline.json --token-file /Users/priya/.pardner/ledgerline-codex.json` → validation passes and it acquires the inbox storage lease. It returns `{bridging:true, workspaceId, replicaId:"client", actors:[…], sourceError}` and keeps running until SIGINT.
4. In another shell: `pardner bridge status --config … --token-file …` → `states:[{scope:"bridge",state:"running"},{scope:"source",state:"connected"},{scope:"delivery:actor-9a1e…",state:"connected"},{scope:"actor-9a1e…",state:"idle"}]`, `deliveries:[]`.
5. In the browser, Priya opens "Retry failed Stripe webhooks with backoff" and comments "@{codex handle} rerun the flaky backoff test". The comment chip reads "Notified …".
6. Within about 1-2 s the bridge claims and acks the delivery. It checks the comment digest and authorization, confirms the thread is `ready`, and sends a turn whose prompt includes "Pardner agent credential file: /Users/priya/.pardner/ledgerline-codex.json. Use pardner with --token-file explicitly." (agent-bridge.js:325-332).
7. `bridge status` → the delivery row has `state:"accepted"`, a `turnId` and timestamps. The Actor state is `accepted`, then `busy` or `idle`.
8. The Codex thread runs `pardner --token-file … show task-3b9e…` and replies with a comment. Priya sees it in **Comments**.
9. Priya comments from a different task that is not in `allowedTaskIds` → the row shows `reason:"blocked: task or sender is not authorized by this mapping"`, and the Actor state is `blocked: queued work requires authorization`.
10. Marcus adds the task ID to `allowedTaskIds`, stops the bridge (Ctrl-C → `bridge` state `stopped`) and re-runs `bridge run`. The queued row dispatches.
##### Variations
- `enabled:false`: the Actor state is `disabled`. Nothing is claimed or dispatched.
- The thread is active with approval flags: the state is `blocked: harness input or approval required`. Simply active: `busy`.
- The comment was edited after mentioning: `blocked: originating comment changed or lacks an authorized content binding; send a new comment`.
- The hub delivery arrived before replica sync: `waiting: originating context has not arrived or the mention was withdrawn`.
##### Edge Cases
- Codex permissions changed since inspect: `PERMISSION_POLICY_CHANGED: Codex permissions differ from the authorized session policy`. The thread's cwd moved: `WORKTREE_MISMATCH`.
- A second `bridge run` on the same inbox: the storage lease fails (`STORAGE_IN_USE`).
- `bridge status` reports persisted observations, not liveness (PARDNER-BRIDGE.md). After a crash it still shows `running`.
- Redundancy: the mention is visible as a chip in the browser panel, in `mentions pending` (until the bridge acks it) and in `bridge status` deliveries.

---

#### STORY-132: Bridge config refusals under client-credential rules
*(was agent-credentials-bridge/STORY-010)*
**Type**: short
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Marcus Oyelaran. He reuses an older two-agent bridge.json (Codex plus Claude Code) with a single Codex credential.
**Goal**: Get `bridge run` to accept the config.
**Preconditions**: The old config maps two Actors and uses `"allowedTaskIds":["*"]`.
**Ideal path**: 2 — split into one config per credential, then run.
**Alternate paths**: Run one bridge per agent credential, each with its own `inboxDirectory`.
##### Steps
1. `pardner bridge run --config /Users/priya/bridge/two-agents.json --token-file …/ledgerline-codex.json` → `ACTOR_MISMATCH: A client agent credential wakes only its own Actor; map that Actor alone` (agent-bridge.js:44-45).
2. Deletes the Claude mapping and re-runs → `INVALID_ARGUMENT: Authorize explicit task IDs; wildcard dispatch is not supported`.
3. Lists task IDs and re-runs → it is still bound to the wrong project → `WORKSPACE_MISMATCH: The bridge credential belongs to another project`. He fixes `workspaceId` and the run succeeds.
##### Variations
- A separate config for Claude Code with `--token-file …/ledgerline-claude.json` and a different `inboxDirectory`.
##### Edge Cases
- Credential file is a bare token or missing: "The bridge credential file must hold the JSON written by client agent-grant". The bridge is stricter than `pardner --token-file`, which accepts a bare token.
- `apiBase` in the file is not `…/projects/{projectId}/api`: "The bridge credential apiBase must be a client project API".
- Non-loopback endpoint: "Bridge endpoints must be local loopback URLs without credentials or query parameters".
- `adapter:"t3"`: "This bridge supports codex-app-server; other adapters are not implemented". `sessionOwner:"desktop"`: "Use a dedicated bridge-owned session; Desktop-owned tasks are not qualified".
- Missing `expectedPolicy` keys: "Pin expectedPolicy to the approvalPolicy, approvalsReviewer, and sandbox returned by the authorized Codex session".
- `inboxDirectory` equal to the credential path: "Keep bridge storage separate from service storage". A relative path: "Bridge directories must be absolute".
- Missing `enabled`: "Set enabled explicitly for every Actor mapping". Duplicate thread: "Map each Actor and session only once".
- Malformed bridge.json: a raw JSON SyntaxError (`INTERNAL_ERROR`), because `JSON.parse` is unwrapped (agent-bridge.js:35).

---

#### STORY-133: Reconcile an uncertain bridge dispatch
*(was agent-credentials-bridge/STORY-011)*
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Marcus Oyelaran. Codex App Server restarted mid-dispatch overnight.
**Goal**: Resolve a delivery stuck as `uncertain` so the queue moves again, without double-running the work.
**Preconditions**: The bridge is running with `--token-file`. One delivery is `uncertain`.
**Ideal path**: 3 — check status, look in the thread, reconcile. Automatic reconciliation (exactly one matching turn) often makes this 0.
**Alternate paths**: The bridge's own `reconcile` on the next pass finds exactly one turn whose user message equals the saved prompt and accepts it automatically (agent-bridge.js:271-276; codex-bridge-adapter.js:171-176). There is no browser surface for this.
**See also**: STORY-116
##### Steps
1. `pardner bridge status --config … --token-file …` → the delivery shows `state:"uncertain"` and `reason:"Dispatch response uncertain; reconcile before retry"`. The Actor state is `uncertain: reconcile dispatch before continuing`.
2. He opens the Codex thread and finds no turn with that prompt.
3. Stops the bridge (Ctrl-C), because reconcile needs the inbox lease.
4. `pardner bridge reconcile --config … --delivery dlv-… --decision retry --evidence "No turn in thr_7c1… after restart at 03:12; safe to resend"` → `{reconciled:true, delivery, decision:"retry"}`. The row returns to `queued` with the evidence as its reason.
5. Restarts `bridge run` → the delivery dispatches and becomes `accepted`.
##### Variations
- The turn exists: `--decision accepted --turn-id turn_… --evidence "Turn turn_… contains the delivery"`.
- `--turn-id` missing with `accepted`: "A harness turn ID is required".
##### Edge Cases
- Reconcile on a queued row: `INVALID_BRIDGE_STATE: Only uncertain dispatches can be reconciled`.
- Empty `--evidence`: "Supply reconciliation evidence". `--decision maybe`: "Use --decision accepted or retry".
- Reconcile while `bridge run` holds the lease: `STORAGE_IN_USE`.
- The mapping was edited before restart: `MAPPING_CHANGED: Mapping changed for uncertain work`. Queued rows show "blocked: mapping changed; restore the original mapping".

---

#### STORY-134: Use the control runtime's guarded agent CLI and wrapper scripts
*(was agent-credentials-bridge/STORY-012)*
**Type**: long
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Priya Raman. She runs a launchd-managed control installation at `~/PardnerControl` for "Ledgerline Billing", with `config.agents:["openai-codex","anthropic-claude-code"]`, and wants agents to have a single safe command.
**Goal**: Give each agent a wrapper that runs coordination commands as itself, with no way to pick another Actor or connection.
**Preconditions**: The installation is sealed and started. `control status` is healthy. `project.json` was created on first start from `config.projectName`.
**Ideal path**: 3 — generate entrypoints, run one wrapper command, and confirm in the browser.
**Alternate paths**:
- `control cli --agent openai-codex -- …` (control-runtime.py:321-336).
- Manual `client agent-grant` plus `pardner --token-file` against the installation's data (STORY-123/STORY-126).
- People use `control open` (or `control open -- --output-file FILE`), never a wrapper.
**See also**: STORY-130, STORY-144
##### Steps
1. `PARDNER_CONTROL_HOME=~/PardnerControl ~/PardnerControl/control status` → JSON including `healthy:true`, `checks:{release,owner,launch,configuration,listeners,authenticated,project,saved}` and `live:{identity:true, projectId, projects, status}`. Exit 0.
2. `~/PardnerControl/control entrypoints` → writes `pardner-openai-codex` and `pardner-anthropic-claude-code` (mode 0700) next to the controller. Nothing is printed.
3. `~/PardnerControl/pardner-openai-codex tasks --json` → on first use it calls the operator-only agent grant, saves `credentials/openai-codex.json` (0600), then execs `pardner --data … --server API_BASE --token-file …/openai-codex.json tasks --json` → the usual JSON (control-runtime.py:303-336).
4. The agent tries `~/PardnerControl/pardner-openai-codex activity --actor actor-9a1e…` to filter its own events → `{"success":false,"error":{"code":"CONTROL_RUNTIME_UNAVAILABLE","message":"The control installation selects connection settings and the entrypoint Actor"}}`, with stderr "Control runtime: …". It switches to plain `activity --limit 1000` and filters by `actorId` itself (the docs recommend this).
5. `~/PardnerControl/pardner-openai-codex mentions pending` → its own mentions.
6. `~/PardnerControl/pardner-openai-codex comment task-3b9e… "Backoff cap confirmed at 10 min"` → authored by Codex. It appears in the browser panel.
7. Priya tries `~/PardnerControl/control cli --agent cursor -- tasks --json` → `CONTROL_RUNTIME_UNAVAILABLE: Name an agent harness from config.agents; people use control open`.
8. An agent tries `~/PardnerControl/pardner-openai-codex client list` → "Supply a coordination command; lifecycle, client and bridge commands are not Actor entrypoints". The same refusal applies to `serve`, `bridge`, `open` and a leading `--flag`.
9. `~/PardnerControl/control cli --agent anthropic-claude-code -- show task-3b9e…`. If that harness never joined an Agent invitation: "The client refused an agent credential for anthropic-claude-code (HTTP 403); only the client's enrolled agent harnesses have one".
10. Priya opens the board with `~/PardnerControl/control open` → the browser signs in through the one-time grant. She sees Codex's comment.
##### Variations
- `control status --agent x`: argparse error "Only cli accepts --agent". `control start -- foo`: "Only cli and open accept arguments after --".
- Commit through the wrapper: `pardner-openai-codex commit --task task-3b9e… -- -m "…"`. It runs in the caller's cwd.
- `control open -- --output-file /tmp/launch.url` writes the launch URL. Any other `open` argument gives "open accepts only --output-file FILE".
##### Edge Cases
- Service down or unverified: "The selected managed service cannot be verified; inspect control status" (control-runtime.py:296-300).
- `control start` while loaded: "A control job is already loaded; inspect status or explicitly restart its installation".
- First start with no `config.identity`: "Record the person this client acts for in config.identity (name and email) before the first start". An existing client with projects but no `config.projectId`: "This client already has projects; name the one to manage in config.projectId".
- Agent revoked: the cached credential is reused (it matches `projectId` and `apiBase`) and keeps failing with `AUTH_REQUIRED`. Removing the file leads to a re-grant that fails with HTTP 403 (see STORY-130).
- Only `cli` failures print a JSON envelope. `status`, `start` and others print "Control runtime: …" on stderr only.
- Redundancy: the same agent access exists as the `pardner-<harness>` wrapper, `control cli --agent`, and raw `pardner --token-file`. Three spellings lead to one path.

---

#### STORY-135: Run a standalone `pardner serve` for an integration
*(was agent-credentials-bridge/STORY-013)*
**Type**: medium
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Tomás Herrera, integration developer. He is building a CI job that files flaky-test tasks into a throwaway Pardner workspace, "ci-flakes", without any human client.
**Goal**: Start a standalone service, register an Actor and create tasks as that Actor.
**Preconditions**: An empty directory `/srv/pardner-ci`. No client involvement.
**Ideal path**: 3 — serve, register the Actor, create a task with `--actor`.
**Alternate paths**: `PARDNER_ACTOR=ci-bot` instead of `--actor`. `pardner operation --request JSON` with an explicit `actorId`. `--server` and `--token` overrides instead of `--data`.
**See also**: STORY-011
##### Steps
1. `pardner serve --data /srv/pardner-ci` → `{serving:true, role:"hub", workspaceId:"…", httpUrl:"http://127.0.0.1:8004", wsUrl:"ws://127.0.0.1:8005"}`. It writes `/srv/pardner-ci/connection.json` with the token and stays in the foreground.
2. Opens `http://127.0.0.1:8004/pardner/` in a browser out of curiosity → the page shows "Pardner" and "This is an agent and integration service. Open Pardner with `pardner open`." There is no board (Pardner.jsx:194-199).
3. `pardner --data /srv/pardner-ci task create --title "Flaky: webhook_retry.test.ts times out"` → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR` (cli.js:153).
4. `pardner --data /srv/pardner-ci actors register ci-bot --handle ci-bot --kind agent --actor ci-bot` → `INVALID_ARGUMENT: Unknown Actor: ci-bot` or similar, because the author must already exist. He hesitates, then reads the HELP line `actors register <id> --handle name --kind human|agent --actor author`.
5. Registers a human operator first, with the author field set to the Actor being registered (bootstrap behavior depends on workspace rules). Then registers `ci-bot` with `--actor` set to that human.
6. `PARDNER_ACTOR=ci-bot pardner --data /srv/pardner-ci task create --title "Flaky: webhook_retry.test.ts times out" --description "3/50 runs on ci-mini-02"` → `{taskId, …}`.
7. `pardner --data /srv/pardner-ci tasks --json` → the task, plus status.
8. A curl POST to a non-operation route (e.g. `/automerge/doc`) → `409 OPERATION_REQUIRED: Use attributed Pardner operations for workspace changes` (automerge-sync-server.js:517-520).
##### Variations
- `--role replica --hub URL --hub-ws URL` for a replica of another standalone hub.
- With no `--data`: it defaults to `./.pardner` relative to the cwd (cli.js:102). Running from another directory starts a second, separate workspace.
##### Edge Cases
- Port 8004 taken: the server start fails (`--http-port` / `PARDNER_HTTP_PORT` overrides).
- A client credential (`--token-file`) pointed at this service: the URL regex does not match a client project, so no session Actor is resolved, and writes need `--actor`.
- Step 4 is the uncertain point: the CLI gives no guidance on bootstrapping the first Actor. Flag it for clarity review.
- Redundancy: `actors register` exists only here. Clients enroll Actors through invitations (STORY-124/STORY-129).

---

#### STORY-136: Agent claims a mention, can't finish, and releases it
*(was agent-credentials-bridge/STORY-014)*
**Merged in**: comments-mentions-handoff/STORY-011 — the Claude Code agent returning a mention it cannot handle; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: short
**Topic**: Agent credentials, CLI and bridge attach
**Persona**: Cursor agent for Dana Whitfield on "Harbor Docs Revamp". It was mentioned about a docs task, but its sandbox can't reach the docs repo.
**Goal**: Give the mention back so it is redelivered later, rather than silently dropping it.
**Preconditions**: A valid Cursor credential. One pending mention.
**Ideal path**: 2 — claim, then release.
**Alternate paths**: Let the lease expire (`--ttl-ms`, default 30000 shown in the help). A bridge does claim and ack automatically (STORY-131).
**See also**: STORY-093
##### Steps
1. `pardner --token-file ~/harbor-cursor.json mentions claim-next --request-id cursor-try-3 --ttl-ms 60000` → `{claimed:true, mention:{id:"mention-…", taskId, fromActorId,…}, claimToken:"…"}`.
2. Discovers that it can't do the work.
3. `pardner --token-file ~/harbor-cursor.json mentions release mention-… --claim-token …` → released. `mentions pending` lists it again.
4. Comments `"Can't reach docs repo from this sandbox; released for another agent"`.
##### Variations
- `mentions deliver` is an alias of `ack` (cli.js:271).
- On a replica, claim, ack and release are forwarded to the hub `/delivery` (client-proxy.js:72).
- *(merged)* Receipts: the first release returns `{released:true, replayed:false}`; releasing again returns `{released:true, replayed:true}`.
- *(merged)* Letting the claim expire (default TTL 30000 ms) also returns the mention to `pending` with `deliveryState:"pending"`.
##### Edge Cases
- Wrong or expired claim token: `STALE_CLAIM`. The bridge treats this as non-fatal (agent-bridge.js:217-220).
- Nothing pending: `claimed:false`.
- `mentions foo`: "Use mentions pending, claim-next, ack, or release".
- `mentions pending --actor someone-else` with a token file: `ACTOR_MISMATCH`, because the query names another Actor (client-proxy.js:45).
- *(merged)* Release after expiry: `STALE_CLAIM` "The delivery claim has expired".
- *(merged)* Releasing gives the human no signal. Nothing in the browser shows delivery state (claimed, acked, released). Visibility gap.

---

### Resilience, recovery and boundaries


Sources read: docs/ux-paths/discovery.md, docs/PARDNER-CLIENT-RECOVERY.md, docs/PARDNER-CLIENT.md:143-165, README.md:44-56, ui-prototype/index.html, ui-prototype/src/main.jsx, Pardner.jsx, ClientApp.jsx, client-api.js, connection.js, lib/client-service.js, lib/client-cli.js, lib/client-proxy.js, lib/client-projects.js, lib/client-runtime.js, scripts/control-runtime.py.

Code facts the stories depend on:
- **Pending request.** The board keeps one pending operation per tab, in sessionStorage under `pardner:{projectId}:{actorId}:pending` (connection.js:61-62). `submit()` refuses a new change while one is pending with "Resolve the saved request before starting another change." (Pardner.jsx:434-438).
- **What clears it.** A pending request is cleared only on confirmation or on one of six definitive codes: `STALE_UPDATE`, `CONFLICT_REQUIRES_RESOLUTION`, `INVALID_ARGUMENT`, `AMBIGUOUS_ACTOR`, `NOT_FOUND`, `OPERATION_ID_REUSED` (Pardner.jsx:465-476). `REVOKED`, `ACTOR_REVOKED`, `HUB_UNAVAILABLE`, `RUNTIME_TIMEOUT`, `SERVICE_STOPPING` and `CLIENT_UNREACHABLE` all keep it.
- **Retry cannot be dismissed.** The ErrorNotice gives no **Dismiss** while a request is pending (Pardner.jsx:532-536). **New task** is disabled while one is pending (Pardner.jsx:549).
- **Replica writes.** Before each replica write, `refreshAdmission` reuses a positive answer for `ADMISSION_CACHE_MS = 10000` and refreshes it in the background. Once the cache expires and the hub is disconnected, the last positive answer stands. `HUB_UNAVAILABLE` from `/policy` is ignored, so offline writes go through (client-service.js:19, 99-142).
- **No phone or LAN board.** The client listens on `127.0.0.1` only (client-service.js:430-432). The Host header check returns `ORIGIN_REJECTED` "Open the configured client address" (client-service.js:253-254).

#### STORY-137: Wi-Fi drops mid-save and the saved request is replayed
*(was resilience-recovery/STORY-001)*
**Merged in**: task-detail-conflicts/STORY-013 — Maya Okafor's **Edit task** → **Save changes** failing while the client service restarts; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Resilience, recovery and boundaries
**Persona**: Priya Natarajan, backend lead on the "Ledger Sync v2" project. She works from a café on a laptop, and the Wi-Fi keeps dropping while she has the Pardner tab open.
**Goal**: Change "Migrate invoices table to UUID keys" from In progress to Review without losing or duplicating the change.
**Preconditions**: Signed in to the local client. The project is open on Tasks. The local client service is stopped or sleeping mid-request, so the browser gets a network failure (the same path covers a laptop wake with the service killed).
**Ideal path**: 3 — pick the status, see the change saved; if the service drops, one Retry once it is back.
**Alternate paths**: The page-level notice "A request is awaiting confirmation." with **Retry saved request** (Pardner.jsx:560-566). The ErrorNotice **Retry saved request** inside the task panel (Pardner.jsx:102). CLI `pardner --token-file … update <task> --status review --revisions …` as the agent (this does not reuse the browser's operation ID).
**See also**: STORY-030, STORY-067, STORY-143
##### Steps
1. Click the "Migrate invoices table to UUID keys" card in the In progress column → The task detail panel opens. SaveStatus reads "Saved locally · synced".
2. Change the quick **Status** select to Review → SaveStatus reads "Saving locally…". The operation is written to sessionStorage first (Pardner.jsx:440-444).
3. The request fails before a response arrives → An ErrorNotice appears beside the update form: "The local Pardner client did not respond…" or the board's fetch error, followed by "Your last confirmed data remains available." There is a **Retry saved request** button and no **Dismiss**.
4. Priya hesitates and clicks **Close** on the panel to see whether the board changed → The panel closes and its error clears. Under the header the notice "A request is awaiting confirmation." shows, with **Retry saved request** (Pardner.jsx:537-566). The card is still in In progress.
5. The live socket closes → A notice reads "Live updates disconnected. Reconnecting automatically." with **Retry connection**. SaveStatus reads "Local service disconnected".
6. She tries **New task** to note something else → The button is disabled (Pardner.jsx:549).
7. Wi-Fi returns or the service comes back. The `online`/`focus` events trigger a reconnect (Pardner.jsx:370-376) → The disconnect notice clears and SaveStatus returns.
8. Click **Retry saved request** → The same operation ID is resent, so the runtime does not apply it twice. The notice disappears, the card moves to Review, and SaveStatus reads "Saved locally · synced".
##### Variations
- Reload instead of retry: the pending request survives a reload in the same tab (sessionStorage), and the notice reappears with **Retry saved request**.
- Retry before the service is back: the same error comes back and the pending request is kept.
- Retry hits `RUNTIME_TIMEOUT` "Runtime response unknown; retry the same request" (client-runtime.js:36): the pending request is kept. Retrying is safe.
- *(merged)* Same failure from the full editor: **Save changes** shows "Saving locally…", then "Local service disconnected". The error appears above Save with the network error, "Your last confirmed data remains available." and **Retry saved request** (no Dismiss while pending). The editor and draft stay. Changing the quick **Status** on another task meanwhile gives "Resolve the saved request before starting another change." and nothing is sent. Once SaveStatus is back to "Saved locally · synced", **Retry saved request** replays the same operationId and the editor closes on success.
- *(merged)* Closing the panel before retrying clears the panel error; the page notice "A request is awaiting confirmation." with **Retry saved request** stays under the header (Pardner.jsx:537-560).
##### Edge Cases
- A new tab or browser restart loses the pending request, because sessionStorage is per tab. The change may or may not have landed, and nothing tells her. She has to check History or Activity.
- Retry returns `STALE_UPDATE` (someone moved the task meanwhile): the pending request is cleared and the notice reads "Your draft is preserved. Review the latest context before making a new edit."
- Site storage is blocked: before sending, the notice reads "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes." and nothing is sent (connection.js:51).
- Redundancy: the pending state shows in up to four places: the panel ErrorNotice, the page notice, the project switcher's " · unconfirmed change" suffix (ClientApp.jsx:298), and the disabled **New task** button.
- *(merged)* An edit replay that meets a newer save on the server gets `STALE_UPDATE`, which clears pending; the draft notice and **Base my draft on the latest version** flow from STORY-076 follow.
- *(merged)* **New task** is disabled while anything is pending.

---

#### STORY-138: Trying a second change while one is unconfirmed
*(was resilience-recovery/STORY-002)*
**Type**: short
**Topic**: Resilience, recovery and boundaries
**Persona**: Marcus Oyelaran, product engineer on "Checkout Revamp". He clicks quickly and has a flaky local service.
**Goal**: Add a comment while an earlier handoff is still unconfirmed.
**Preconditions**: A pending `task.handoff` from an earlier failed attempt is stored. The panel for "Apple Pay sheet freezes on iOS 17" is open.
**Ideal path**: 2 — resolve the saved request, then comment.
**Alternate paths**: **Retry saved request** on the page notice or the panel ErrorNotice. The CLI `pardner comment <task> "…"` as an agent is not blocked by the browser's pending request.
**See also**: STORY-089
##### Steps
1. Type "Reproduced on 17.4 simulator, attaching trace next" in **Comment** and click **Add comment** → Nothing is sent. The notice reads "Resolve the saved request before starting another change." It is a preflight error, so there is no "last confirmed data" line (Pardner.jsx:96-101).
2. Marcus looks for a way to discard the stuck handoff → There is no **Dismiss** or discard while a request is pending. The only action is **Retry saved request**.
3. Click **Retry saved request** → The handoff is confirmed: "Handed off to {name · kind} · Review." The pending request clears.
4. Click **Add comment** again → The comment posts. The comment text was kept in the textarea.
##### Variations
- Goal or vein status select while pending: the selects are disabled (`disabled = busy || Boolean(pending)`, Pardner.jsx:823).
##### Edge Cases
- There is no way to abandon a pending request the server will never accept (for example after `REVOKED`) except clearing site data or closing the tab. Friction candidate.

---

#### STORY-139: Working on a replica while the hub is unreachable
*(was resilience-recovery/STORY-003)*
**Merged in**: presence-profiles/STORY-009 — Dev Patel on a "Harbor Billing" replica asking why everyone, including himself, looks offline; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: long
**Topic**: Resilience, recovery and boundaries
**Persona**: Tomás Herrera joined Dana Whitfield's "Atlas Mobile" project from his own laptop, so his client is a replica. Dana's laptop (the hub) is asleep in her bag on a flight.
**Goal**: Keep triaging tasks during Dana's outage, then confirm everything reached the hub.
**Preconditions**: Tomás's client is a replica of Atlas Mobile, enrolled through a Human invitation. He has written to the hub within the last 10 s, or the runtime reports `hubConnected: false`.
**Ideal path**: 6 — open the project, make edits, notice the waiting state, try a hub-only action, wait, confirm synced.
**Alternate paths**: CLI `pardner client list` / `client status` show each project's `status.syncPending` / `hubConnected`. The project switcher shows the sync label of every project. The task-panel SaveStatus repeats the header SaveStatus.
**See also**: STORY-028, STORY-034, STORY-042
##### Steps
1. Run `pardner open` → The browser opens with Atlas Mobile, the last project. SaveStatus shows "Connecting to local service", then the local state.
2. Look at the header → It shows "Remote presence unavailable" next to the avatars, because `presence.available === false` or `hubConnected === false` (ClientApp.jsx:513, 518). Dana's avatar shows Offline.
3. Open the switcher (the "Project: Atlas Mobile. Switch project" button) → The Atlas Mobile item reads "Saved locally · waiting for hub" (client-api.js:126).
4. Press Escape → The menu closes.
5. Open "Crash on cold start with empty cache" and set **Status** to In progress → The write passes the admission check from the cached or last-known positive answer (client-service.js:105-112). SaveStatus reads "Saving locally…", then "Saved locally · waiting for hub".
6. Click **Edit task**, set Priority to P0, and click **Save changes** → The save is confirmed locally and SaveStatus stays "Saved locally · waiting for hub".
7. Add the comment "@dana this blocks the 3.2 release" → The comment is saved locally. Delivery of the mention to Dana's agent waits for the hub.
8. Tomás wants to bring in QA. He clicks **Invite ▾**, chooses **Human** and clicks **Create invitation** → The replica forwards to the hub's `/invites` and fails. The dialog shows "Project authority unavailable; retry this attempt" with the hint "The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." (ClientApp.jsx:28, 429).
9. He closes the dialog → Focus returns to **Invite**.
10. He opens **Invitations for this project** in the dialog again → The list also needs the hub (`remoteJson … { action: 'list' }`, client-service.js:220) and shows the same failure.
11. He hesitates and opens the **You** profile to check whether his own session counts → Live sessions may show "No live session reported to this view. Offline means none is connected here, not that work stopped."
12. He keeps working: he creates the **New task** "Add cache warm-up telemetry" → It is saved locally and its detail panel opens.
13. In a terminal he runs `pardner client status` → JSON `projects[]` shows Atlas Mobile with `status.syncPending: true`.
14. Dana lands and her laptop wakes. The hub becomes reachable and the replica's native socket reconnects → SaveStatus changes to "Saved locally · synced". "Remote presence unavailable" disappears within the 5 s presence poll.
15. Open the switcher → The label reads "Saved locally · synced".
16. Retry **Create invitation** in the Human dialog → The invitation is created and shows **Waiting to be used**.
##### Variations
- The hub is down past the 10 s cache, and the runtime still believes it is connected: `checkAdmission` gets `HUB_UNAVAILABLE` and lets the write through anyway (client-service.js:130).
- Revoking a My device or Agent invitation during the outage fails the same way as creating one (`remoteJson … revoke`).
- `pardner client revoke --kind device …` during the outage: "Project authority unavailable; retry this attempt". The doc says "The authority must be reachable. Retry uncertain requests with identical IDs and arguments." (PARDNER-CLIENT-RECOVERY.md).
- *(merged)* Presence during the outage: every avatar, including the person's own **You** button, is grey Offline, because the replica forwards all presence actions to the hub and his own session can't be started or reported (client-service.js:177-183). Opening a task shows no "Here now" at all, not even himself. A teammate's profile shows "Offline" and "No live session reported to this view. Offline means none is connected here, not that work stopped."
- *(merged)* The hub is reachable but its sync adapter is disconnected (`hubConnected:false`): the notice shows while snapshots may still arrive.
- *(merged)* When the hub wakes, within 5 s the notice disappears, the reporter retries on its next heartbeat and shows him Active, and others reappear.
- *(merged)* `pardner client show --project ID` returns `presence:{actors:[], available:false, code:"HUB_UNAVAILABLE"}`.
##### Edge Cases
- Joining a new project whose hub is down: the **Join project** failure shows the `HUB_UNAVAILABLE` hint. The pending join is kept in `pardner:client:pending-join`, so retrying resumes it.
- Agent `mentions claim-next` on the replica needs the hub's `/delivery` and fails with `HUB_UNAVAILABLE` (client-proxy.js:72-74).
- Redundancy: "waiting for hub" appears in the header SaveStatus, the task-panel SaveStatus, the switcher sync label and the CLI `status` JSON. "Remote presence unavailable" overlaps with offline avatars.
- *(merged)* His own You avatar shows "Offline" while he is actively typing, with no explanation beyond the small notice.
- *(merged)* The actor list falls back to the cached `project.people` (client-service.js:85-88), so avatars still render by name.

---

#### STORY-140: The creator revokes a member, who sees REVOKED on their next write
*(was resilience-recovery/STORY-004)*
**Type**: medium
**Topic**: Resilience, recovery and boundaries
**Persona**: Dana Whitfield, creator of "Atlas Mobile", removes contractor Kevin Brandt, whose engagement ended. Kevin has the board open on his replica.
**Goal**: Dana cuts Kevin's access. Kevin understands what happened and keeps his local copy.
**Preconditions**: Dana's client is the hub. Kevin is a member with a replica. Both are online. Dana knows Kevin's identity ID from `pardner client show --project <id>`.
**Ideal path**: 2 for Dana (find the ID, revoke). 1 for Kevin (see a clear revoked state).
**Alternate paths**: CLI only: `pardner client revoke --project ID --kind member --id KEVIN_ID --operation-id …`. There is no UI for member revocation (discovery.md:167). Revoking an unused invitation is a separate UI path (**Revoke** in the InviteDialog).
**See also**: STORY-031, STORY-043
##### Steps
1. Dana runs `pardner client show --project atlas-mobile-id` → JSON lists actors and presence. She finds Kevin's human identity ID, but has to work out which ID is the identity and which is the Actor.
2. Dana runs `pardner client revoke --project atlas-mobile-id --kind member --id <kevin-identity> --operation-id revoke-kevin-2026-11-09` → It prints `{revoked: true, kind: "member", id}`. The hub marks Kevin's admissions revoked and terminates his sockets (client-service.js:209-226).
3. On Kevin's board the live socket closes → "Live updates disconnected. Reconnecting automatically."
4. Kevin, unaware, changes the status of "Settings screen dark mode" → The replica's `refreshAdmission` gets `AUTH_REQUIRED` or `REVOKED` from `/policy`, marks the project `revoked`, and returns 403 `REVOKED` "Project admission revoked; local data is preserved". The ErrorNotice shows it with **Retry saved request**, because `REVOKED` is not definitive and the request stays pending.
5. Kevin clicks **Retry saved request** → The binding check now throws `REVOKED` "Project membership is not available". The request is still pending and the notice still cannot be dismissed.
6. The reconnect loop calls `reloadConfiguration` and fails → "Project membership is not available" is shown with **Retry connection**.
7. Kevin reloads → `/session` filters out revoked projects. If Atlas Mobile was his only project, he lands on **Welcome, Kevin**. Otherwise his other project opens, and Atlas Mobile no longer appears in the switcher.
##### Variations
- Inside the 10 s admission cache, Kevin's first write may still go through locally. The background refresh records the revocation, and the next write is refused.
- Dana revokes from her own UI: there is no surface for it, so she has to use the CLI.
- `--kind member` run by someone who is not the creator: `FORBIDDEN` "Only creator may revoke other memberships".
##### Edge Cases
- The tasks Kevin edited after the revocation are kept on his machine only.
- A message tailored to this case is missing on the board. The `JOIN_HINTS.REVOKED` text appears only on Welcome or Join failures.
- If Kevin was offline when revoked, he keeps the last-known policy until he reconnects (PARDNER-CLIENT-RECOVERY.md, "Offline clients retain last-known policy").

---

#### STORY-141: Exporting retained work after revocation
*(was resilience-recovery/STORY-006)*
**Type**: medium
**Topic**: Resilience, recovery and boundaries
**Persona**: Kevin Brandt (from STORY-140) wants a private record of his task notes from "Atlas Mobile" before archiving his laptop.
**Goal**: Produce a readable export of the project content.
**Preconditions**: Atlas Mobile is revoked on Kevin's replica. Kevin kept the project ID from an earlier `client list` receipt. The client is running.
**Ideal path**: 2 — find the project ID, run the export.
**Alternate paths**: None in the UI. Export is operator-only, and browser and agent credentials get `FORBIDDEN` "Local operator authority required" (client-service.js:184). The alternative is a full cold backup.
**See also**: STORY-140, STORY-142
##### Steps
1. Run `pardner client list` → Atlas Mobile is missing, because revoked projects are filtered out of the session.
2. Kevin is confused. He reads docs/PARDNER-CLIENT-RECOVERY.md: "Keep the project ID from a prior receipt when a revoked project disappears from `list`."
3. He finds the ID in an old terminal log.
4. Run `pardner client export --project atlas-mobile-id` → `Supply --output-file for the private content export`.
5. Run `pardner client export --project atlas-mobile-id --output-file ~/private/atlas-export.json` → `{projectId, format: "pardner-workspace-view-v1", savedLocally: true, exportFile}`. The file includes `restoreRequires: "Complete cold client backup; this readable content view is not a replica or credential backup"`.
##### Variations
- Exporting a live, non-revoked project works the same way.
- With `--data /private/path/client` for a client directory other than the default.
##### Edge Cases
- If local storage is not confirmed saved: `STORAGE_FAILED` (507) "Local storage is not confirmed saved".
- The client is not running: `CLIENT_NOT_RUNNING` "Start Pardner with pardner open or pardner client serve".
- If the ID is lost, nothing lists revoked project IDs, so the work cannot be found again. Friction candidate.

---

#### STORY-142: Cold backup and restore into a fresh installation
*(was resilience-recovery/STORY-007)*
**Type**: long
**Topic**: Resilience, recovery and boundaries
**Persona**: Lena Sørensen, platform engineer, is replacing her failing MacBook. She is a replica member of "Harbor Infra" and the creator (hub) of "Billing Alerts".
**Goal**: Move her complete client to a new machine without enrolling a second device.
**Preconditions**: Same repo revision and Node 24.11.1 on both machines. The client lives at `~/.pardner/client`. The UI has been built on the new machine.
**Ideal path**: 8 — record, stop, copy, transfer, serve, list, open, verify.
**Alternate paths**: A My device invitation enrolls the new machine as an additional device, followed by `client revoke --kind device` for the old one. That route is right when the old machine survives but does not preserve the device identity. `client export` gives content only.
**See also**: STORY-021
##### Steps
1. Run `pardner client list` and record project IDs, roles, and `savedLocally`/`syncPending` for each → JSON. "Billing Alerts" shows `savedLocally: true`.
2. Check the browser for unsaved **Edit task** drafts and save or note them. They live in sessionStorage, not in the backup.
3. Run `pardner client stop` → `{stopped: true, running: false}` after the storage lease is released. The doc says to stop with Ctrl-C in the owning terminal; `client stop` is the equivalent for a detached service.
4. Lena forgets and runs `pardner client stop` again → `{stopped: false, running: false}`.
5. Run `umask 077; test ! -e "$client_backup" && cp -Rp ~/.pardner/client /private/backup/client-2026-11-09` → The whole directory is copied, including `client.sqlite` with its sidecars, `projects/`, `repo/` and `deliveries.sqlite`.
6. Transfer it securely to the new Mac, keeping the permission modes, and copy it into a new private directory such as `/private/restored-client`.
7. On the new Mac run `node bin/pardner.js client serve --data /private/restored-client` → `{serving: true, mode: "client", localUrl}`. The saved port is reused.
8. In another terminal run `client list --data /private/restored-client` → The same identity, device and project IDs.
9. Run `client open --data /private/restored-client` → The browser opens and signs in. Harbor Infra shows "Saved locally · waiting for hub" until it reconnects, and Billing Alerts (the hub) shows synced.
10. Compare task counts and recent Activity with the record from step 1. Keep the backup.
##### Variations
- A non-authority client may restart with `--http-port 7420` and issue a fresh `client open` link there.
- Running `pardner open` without `--data` on the new Mac starts a fresh, empty `~/.pardner/client` and the **Welcome to Pardner** identity step. That is a mistake: the doc says "Do not initialize a new identity or create replacement projects in restored data".
##### Edge Cases
- The old Mac is still running: two copies of the same device identity are active, which the doc forbids ("Only one active copy… may run").
- Incompatible data format: `INCOMPATIBLE_SCHEMA` "Choose a fresh client directory; existing data is preserved".
- The directory is still leased by another process: `STORAGE_IN_USE`.
- Restoring a stale hub backup can roll back revocations. The doc says to reconcile them before reopening the route.

---

#### STORY-143: The client service crashes or is stopped while the board is open
*(was resilience-recovery/STORY-009)*
**Type**: medium
**Topic**: Resilience, recovery and boundaries
**Persona**: Jordan Lee, frontend dev on "Design Tokens". They ran `pardner client stop` in one terminal while a board tab was open in another window.
**Goal**: Get the board back without losing an in-progress **Edit task** draft.
**Preconditions**: The board is open. An **Edit task** draft for "Rename spacing scale to rem" has unsaved changes.
**Ideal path**: 2 — restart with `pardner open`, continue the draft.
**Alternate paths**: `pardner client open` (it does not start the service, so it gives `CLIENT_NOT_RUNNING` if the service is down). `pardner client serve` in a foreground terminal. **Retry connection** in the browser once the service is up.
**See also**: STORY-006, STORY-009
##### Steps
1. Run `pardner client stop` → `{stopped: true}`. During shutdown, requests get 503 `SERVICE_STOPPING` "Client is stopping".
2. The board's socket closes → "Live updates disconnected. Reconnecting automatically." SaveStatus reads "Local service disconnected". Reconnects back off up to 15 s.
3. Jordan clicks **Retry connection** → The notice changes to "The local Pardner client did not respond…" or a fetch failure, and the backoff continues.
4. Jordan runs `pardner client open` by mistake → `CLIENT_NOT_RUNNING` is not raised, because the connection file still exists. The `/open` fetch fails with a network error, since `client open` only reads the connection file.
5. Run `pardner open` → The probe finds the service unreachable and spawns a detached `client serve` that logs to `client.log`. The browser opens a new tab with a fresh grant.
6. In the original tab, focus triggers a reconnect → The board returns. The **Edit task** draft is still in sessionStorage, and **Save changes** is available.
##### Variations
- Reloading the original tab while the service is down: the static shell shows "Opening your workspace…". The config fetch fails, then shows "Check that Pardner is running on your computer. Start it with `pardner open`, then retry." with **Retry connection** (Pardner.jsx:188-193).
- After 12 s with no script: "Pardner could not finish loading. Reload the page…" with **Reload Pardner**.
- A project runtime child crashed while the parent is up: `LOCAL_SERVICE_UNAVAILABLE` "Project runtime failed to start; retrying after Ns". The switcher label reads "Project service unavailable".
##### Edge Cases
- The port is taken by another process: `PORT_IN_USE` "… is answering but is not this Pardner client; stop that process or start with --http-port".
- The service starts slowly: `CLIENT_START_TIMEOUT` "Client service did not answer within 15s; see …/client.log".
- Stop hangs: `CLIENT_STOP_TIMEOUT`.
- The new tab and the old tab now both show the board, with drafts per tab.

---

#### STORY-144: Control runtime start, status, open and stop
*(was resilience-recovery/STORY-011)*
**Merged in**: control-tab/STORY-013 — Sam Ortiz opening the board from a launchd control runtime to reach the Control tab; its unique variations and edge cases are folded in below, marked *(merged)*.
**Type**: medium
**Topic**: Resilience, recovery and boundaries
**Persona**: Ben Achterberg runs a launchd-managed Pardner installation for "Release Bot" on a Mac mini.
**Goal**: Start the managed client, check that it is healthy, open the board, and stop it for maintenance.
**Preconditions**: A sealed installation with `config.identity`, `config.projectName`, `agents` and `httpPort`.
**Ideal path**: 4 — `start`, `status`, `open`, `stop`.
**Alternate paths**: `restart`. `pardner client open --data <install data>` directly (it bypasses the health check). Agents use `control cli --agent openai-codex -- tasks --json`.
**See also**: STORY-110, STORY-134
##### Steps
1. Run `scripts/control-runtime.py start` → launchd bootstraps the job. On first run it provisions the identity and project from config. It prints status JSON once `healthy`.
2. Run `start` again → `Control runtime: A control job is already loaded; inspect status or explicitly restart its installation`, exit code 1.
3. Run `status` → JSON with checks `release`, `owner`, `launch`, `configuration`, `listeners`, `authenticated`, `project` and `saved`, and `healthy: true`. Exit code 0.
4. Run `open` → It runs `client open` against the installation and the browser opens the Release Bot board. It never starts a service.
5. He tries `control cli -- tasks --json` without `--agent` → `CONTROL_RUNTIME_UNAVAILABLE` "Name an agent harness from config.agents; people use control open".
6. Run `stop` → launchctl bootout. It waits up to 20 s for the process to exit.
7. Run `status` → `healthy: false` with errors such as "Control job is not loaded". Exit code 1.
##### Variations
- `open -- --output-file /private/launch.url` writes the grant URL instead of launching a browser. Any other argument gives "open accepts only --output-file FILE".
- A first start with no `config.identity`: "Record the person this client acts for in config.identity (name and email) before the first start".
- *(merged)* Reaching Control: after `control open` signs the browser in through a one-time grant as the client's person, click **Control** in the nav and the pane loads as in STORY-110. The unmanaged alternative is `pardner open`.
- *(merged)* `control open --output-file x` (without the `--` separator) fails with argparse "Only cli and open accept arguments after --".
##### Edge Cases
- `open` while unhealthy: "The selected managed service cannot be verified; inspect control status".
- A job loaded by another installation: "Loaded control job belongs to another installation; refusing access".
- Health information appears in three places: the `status` JSON, the board SaveStatus (`saved` check), and `client status`. Redundancy candidate.
- *(merged)* `control cli --agent openai-codex -- open` is refused with "Supply a coordination command; lifecycle, client and bridge commands are not Actor entrypoints".
- *(merged)* Service not verifiable: `CONTROL_RUNTIME_UNAVAILABLE` JSON with "The selected managed service cannot be verified; inspect control status" (control-runtime.py:315-318).

---

#### STORY-145: Trying to open the board from a phone on the same Wi-Fi
*(was resilience-recovery/STORY-012)*
**Type**: short
**Topic**: Resilience, recovery and boundaries
**Persona**: Hannah Cho wants to check "Sprint 14" tasks from her iPhone on the couch, using her laptop's LAN IP.
**Goal**: Find out whether the phone can reach the board.
**Preconditions**: The client is running on the laptop.
**Ideal path**: 1 — learn quickly that phone access isn't offered.
**Alternate paths**: none found. There is no phone or LAN companion. `--public-url` exposes only the enrollment and replica routes, not the board (client-service.js:253).
**See also**: STORY-011
##### Steps
1. On the phone she opens `http://192.168.1.20:<port>/pardner/` → The connection is refused, because the server binds `127.0.0.1` only (client-service.js:430).
2. She checks the README → "listens on this computer's loopback only. Phone access is not currently offered; it is planned through the hub over HTTPS." (README.md:50-52, docs/PARDNER-CLIENT.md:157-158).
##### Variations
- With a `--public-url https://pardner.example.dev` gateway, browser routes are refused with `ORIGIN_REJECTED` "Open the configured client address". Only `/enroll` and `/replica/*` are allowed.
- Opening a standalone `pardner serve` page shows "This is an agent and integration service. Open Pardner with `pardner open`."
##### Edge Cases
- Pasting a `#grant=` URL forwarded from the laptop to the phone fails for the same reasons. Grants are origin-bound and expire after 60 s.

---

#### STORY-146: A crash screen caused by blocked browser storage
*(was resilience-recovery/STORY-013)*
**Type**: short
**Topic**: Resilience, recovery and boundaries
**Persona**: Owen Fitzgerald uses Safari with "Block all cookies" and strict site-data settings.
**Goal**: Open the board.
**Preconditions**: The client is running. Owen ran `pardner open`.
**Ideal path**: 2 — allow site storage, reload.
**Alternate paths**: The **Reload Pardner** button. A different browser.
**See also**: STORY-006
##### Steps
1. The browser opens `#grant=…` → Either the HttpOnly cookie can't be set, so he sees the signed-out screen, or storage throws during render and he sees **Pardner could not open** "Allow browser site storage, then reload…" with **Reload Pardner** (main.jsx:9-20).
2. He clicks **Reload Pardner** without changing settings → The grant was already removed from the URL, so he lands on the signed-out screen.
3. He allows site data and runs `pardner open` again → The board opens.
##### Edge Cases
- If storage is partly available, the board opens, but the first change fails with "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes."

---

## Redundancy Candidates

Built from the stories' **Alternate paths** fields and their multi-surface notes. Each entry names the stories that record it. "Same result" means the routes end in the same state; "divergent" means they differ in side effects, validation or what they leave behind.

### Duplicate paths (same goal, multiple routes)
- **Open the board**: bare `pardner`, `pardner open`, `pardner client open`, `control open`, or a bookmarked `/pardner/` URL (STORY-001, STORY-002, STORY-143, STORY-144). Divergent: `pardner`/`pardner open` start the service; `client open` never does (it fails on a stale connection file, STORY-143); `control open` first verifies the managed service; the bookmark needs a still-valid cookie and a running service (STORY-006).
- **Sign in a second browser**: `--output-file` then paste into a new tab, or into the *same* tab so `hashchange` re-runs bootstrap (STORY-003, STORY-004, STORY-012). Same result; the launcher always opens the default browser, and **Check again** is not a route at all.
- **Recover from a load or connection failure**: **Reload Pardner** (static shell, StartupBoundary), **Retry connection** (config failure, board socket), **Retry** (ClientApp error, project open failure), **Check again** (signed-out) (STORY-004, STORY-006, STORY-031, STORY-143). Divergent: four buttons for "try again", and **Check again** never fetches a new grant.
- **Set up an identity**: IdentityStep, `pardner client identity`, or the control runtime's `config.identity` on first start (STORY-013, STORY-022, STORY-144). Same result; the browser blocks a missing name with `required`, the CLI gets a server message.
- **Redeem a My device invitation**: **Link this device** → **My device invitation** → **Link device** on the identity step, **Join a project** → **Invitation** → **Join project** on Welcome, or `client join` (STORY-015, STORY-017, STORY-027, STORY-047). Same backend `POST /join`; divergent client-side checks (only the Link page checks the purpose, and it is reachable only before an identity exists).
- **Start a project**: **Start project**, `client create`, control-runtime `config.projectName` (STORY-024, STORY-033, STORY-144). Same result; the CLI without `--operation-id` duplicates on retry (STORY-025, STORY-033).
- **Get back to another project after a failure**: **Open another project** (leads to Start/Join with only **Back to {project}**) vs the header switcher, which is not rendered on the failure screen (STORY-031). Divergent: the button's label promises a chooser it does not offer.
- **Change a task's status**: quick **Status** select, **Edit task** → **Status**, **Hand off work** → **Handoff status**, CLI `update --status` (STORY-072, STORY-091). Divergent: handoff also reassigns, needs a message and posts a comment.
- **Reassign a task**: **Edit task** → **Assignee** vs **Hand off work** vs CLI `handoff` / `update --assignee` (STORY-091, STORY-094). Divergent: only handoff notifies the recipient.
- **Notify someone**: an @handle in a comment vs **Hand off work** (STORY-086, STORY-095). Divergent: handoff works without knowing the opaque handle; a comment mention needs it.
- **Reach a vein-filtered board**: Goals vein title, Activity vein subject, nav **Vein** select, CLI `tasks --vein` (STORY-064, STORY-099, STORY-104, STORY-109). Divergent: the first two reset **Assigned to** and **Status filter**; the nav select keeps them.
- **Attach a task to a vein**: `task create --vein`, `vein add`; no UI route (STORY-064, STORY-070, STORY-103). The New task panel has no Vein field, so a task created "inside" a filtered vein is not in it.
- **Create a goal**: `goal create` then `vein create --goal goal-ID`, or `vein create --goal "new title"` in one step (STORY-097). Same result; a mistyped ID silently creates a goal titled with the typo.
- **Open a task**: board card, Activity subject, profile Focus link, panel "Here now" avatar → profile → Focus (STORY-053, STORY-104). Same panel; divergent focus return (profile-opened tasks fall back to **New task**).
- **Read a task's trail**: panel **History**, Activity view, `pardner activity --task`, `diff`, `show`, `trace task` (STORY-082, STORY-104, STORY-081). Divergent: History has no paging and plain-text subjects; Activity has paging, filters and clickable subjects.
- **Retry a saved request**: panel ErrorNotice **Retry saved request** vs page notice **Retry saved request** (STORY-067, STORY-137). Same operation ID; the panel copy moves to the page when the panel closes.
- **Resolve a conflict**: UI **Keep …** buttons vs CLI `resolve` / `vein resolve` / `comment-resolve` (STORY-077, STORY-100, STORY-088). Divergent: CLI `update` wants per-field revision objects while `resolve` wants arrays (STORY-108); `comment-resolve` accepts new text, the UI only existing alternatives.
- **Create an invitation**: Invite dialog vs `client invite` (STORY-036, STORY-046, STORY-124). Divergent: the CLI cannot list or revoke invitations; the dialog cannot re-copy an invite after it closes (STORY-036, STORY-039).
- **Revoke access**: invitation **Revoke** in the dialog (UI only) vs `client revoke --kind member|device|agent` (CLI only) (STORY-039, STORY-043, STORY-021, STORY-130). Divergent surfaces for one concept, and revoking an unused invite does not affect a joined Actor.
- **Act as an agent**: `pardner --token-file FILE …`, `client operation --request`, `control cli --agent H -- …`, `pardner-<harness>` wrappers (STORY-126, STORY-128, STORY-134). Same Actor; divergent guards (wrappers refuse `--actor` even as an `activity` filter) and divergent JSON error handling (STORY-128).
- **Process a mention**: manual `mentions claim-next` / `ack` / `release` vs `pardner bridge run` doing it automatically (STORY-093, STORY-131, STORY-136).
- **Dispatch work to an agent session**: Control **Map a T3 thread** + **Queue follow-up** vs `pardner bridge` mapping to a Codex App Server thread (STORY-112, STORY-131). Divergent integrations with different authorization UIs (checkbox pickers vs JSON `allowedTaskIds`).
- **Stop the service**: `pardner client stop`, Ctrl-C on a foreground `client serve`, `control stop` (STORY-009, STORY-142, STORY-144). Same result; `client stop` and `client status` disagree on a stale connection file (STORY-009).
- **Back up or move a client**: `client export` (content view only) vs cold directory copy vs My device enrolment plus device revoke (STORY-141, STORY-142, STORY-021). Divergent: only the cold copy preserves the device identity.

### Duplicate information (same fact, multiple surfaces)
- **Project sync state**: header SaveStatus, task-panel SaveStatus, switcher `syncLabel`, `client list` / `client status` JSON (STORY-026, STORY-029, STORY-058, STORY-139). The switcher copy can be stale and disagree with the live SaveStatus (STORY-029, STORY-030).
- **Pending request**: panel ErrorNotice, page notice "A request is awaiting confirmation.", switcher " · unconfirmed change", disabled **New task** (STORY-030, STORY-137). Per tab only.
- **Presence state**: avatar outline, tooltip/aria-label, ProfileDialog heading, each Live session row, People dialog row, card and panel "Here now", plus the **You** button beside your own stack avatar (STORY-048, STORY-049, STORY-020).
- **Who is on this task**: card markers (max 3, not clickable), panel markers (max 6), profile Focus links, `client show` JSON (STORY-052, STORY-055).
- **Identity name and email**: IdentityStep, "Welcome, {name}", "You join as {name}.", **You: {name}**, Profile Git name/email, `client status` (STORY-013, STORY-020).
- **Device names**: "This device:", Profile **Devices**, Live session **Device**, `client status` (STORY-015, STORY-020). Revoked devices stay listed in the profile (STORY-021), and device IDs appear only in the CLI.
- **Task status**: board column, quick select or summary line (they swap with mode), Edit form, Handoff status, History (STORY-072, STORY-084).
- **Assignee and priority**: card and detail summary line (STORY-059).
- **Conflict**: card "Conflicting edits", **Resolve {field}** section, two contradictory History rows, `diff`/`show` (STORY-077).
- **Commit**: Evidence (full hash), History (short hash), Activity, `trace task`, `activity`, and separately Control **Record artifact** (STORY-081, STORY-118).
- **Handoff**: success status line, Comments (as a comment), History, Activity, column move (STORY-091, STORY-095).
- **Comment**: panel Comments and Activity "commented on"; excluded from History (STORY-085).
- **Creation attribution**: Activity and History, never the card (STORY-070).
- **Vein membership**: card vein labels, **Vein** filter, "N tasks" on Goals, "Veins: …" line in task detail; only the Goals title navigates (STORY-099).
- **Vein or goal verdict**: Goals select, task-detail "Veins: … (Proven)", Activity, `vein show` (STORY-107).
- **Invitation state and expiry**: the "New invitation" section and the history row in the same dialog (STORY-036); "Used" in history vs the new avatar in the stack (STORY-040, STORY-041).
- **Invitation purpose rules**: Invite menu detail, dialog title and body, setup prompt, history row label, Link-page refusals, JOIN_HINTS (STORY-023, STORY-027).
- **Project ID**: `client list`, `client status`, `client show`, the grant file; never in the browser (STORY-123).
- **"Pardner is not running" guidance**: five surfaces with three spellings (`pardner open`, `pardner client open`, "Ask your agent to reopen it", `pardner open or pardner client serve`) (STORY-004, STORY-012).
- **Startup failure copy**: static shell, 12 s failure text, config failure, StartupBoundary (STORY-006).
- **PORT_IN_USE**: two messages with different fixes from two code paths (STORY-007).
- **Control hold text**: "Dispatch held:" notice, hold-form list, queued execution reason (STORY-115).
- **Control freshness**: per-session and per-execution "Read Ns ago"/"Stale: …" vs Cloud "Fresh read"/"Stale / not observed" with ISO time (STORY-110, STORY-120).
- **Service health**: `control status` JSON, board SaveStatus, `client status` (STORY-144).
- **Mention**: comment chip tooltip, `mentions pending`, `bridge status` deliveries (STORY-131); `show` already contains what `comments` returns (STORY-093).

### Overlapping features/tools
- **Activity view vs task History**: the same `describeEvent` sentences; History lacks paging and clickable subjects, Activity lacks a per-task filter in the UI (STORY-082, STORY-104). Candidate: link History to a task-filtered Activity.
- **Task Evidence (`link-commit`) vs Control Record artifact**: two places to record a commit for the same work, never cross-linked (STORY-081, STORY-118).
- **Task GitHub issue link vs Control project GitHub repository**: unconnected, and the issue form does not default to the repository (STORY-079, STORY-112).
- **Control T3 mapping vs agent bridge**: both wake an agent session from Pardner work, with different authorization models (STORY-112, STORY-131).
- **T3 controls vs Cursor Cloud controls**: names and checkboxes vs raw comma-separated IDs; **Accept** vs **Accept Cloud result**; latest verdict only vs all verdicts; different freshness wording (STORY-121). Distinct backends, but the UI patterns could be shared.
- **Link this device vs Join a project**: one endpoint, two forms (STORY-017).
- **`actors register` vs invitations**: Actor creation exists only on the standalone service; clients use invitations (STORY-129, STORY-135).
- **`client operation` vs `pardner --token-file operation`**: same purpose, different malformed-JSON handling (STORY-128).
- **`client status` vs `client list`**: the same call under two names (STORY-009).
- **`mentions deliver` vs `mentions ack`**: alias (STORY-093, STORY-136).
- **`--name`**: the project name on `client create`, the agent name on `client join` (STORY-026).
- **`--actor`**: a filter on `activity`, refused as an author override on writes (STORY-127, STORY-108).
- **Edit-task draft vs New-task draft**: sessionStorage per task vs memory only, so they survive different events (STORY-061, STORY-073, STORY-074).
- **Two blank-title validations**: the browser's "Please fill out this field." vs "Enter a title that is not only spaces." (STORY-060).
- **Conflict-resolution copy**: "Keep this {field}" (tasks) vs "Keep {value}" / "Keep {authors}'s {field}" (goals and veins) vs "Keep this comment" (STORY-078, STORY-102).
- **People dialog vs invitation history**: two half-answers to "who joined from my invite"; neither shows recipient or sponsor (STORY-040, STORY-042).
- **Presence vs Activity**: "what is X doing now" vs "what did X do"; the board's Assigned to filter is a third view (STORY-055, STORY-063).
- **Three control-runtime agent spellings**: `pardner-<harness>`, `control cli --agent`, raw `--token-file` (STORY-134).

## Gaps & Recommendations

### Uncovered features and flows
- **Task branches and merges**: CLI `branch`, `branches`, `merge` and the `task.branch` / `task.merge` operations have no story. Add a medium agent story: branch a task, work on it, merge, and check History/Activity.
- **Bridge cleanup**: `bridge approve-cleanup` and `bridge revoke-cleanup` have no story. Add a short story after STORY-131.
- **Control runtime `restart`, `seal`, `run`**: only `start/status/open/stop` and the wrappers are walked (STORY-144, STORY-134). Add a story that seals a fresh installation, runs it, and restarts it after a config change.
- **`trace list` / `trace show`**: alternate paths only (STORY-081). Fold into the branch/merge story.
- **Configuring a remote hub route**: every multi-machine story assumes `--public-url https://…` is already set. No story starts a client with `--public-url` and confirms the board stays loopback-only while `/enroll` and `/replica/*` work (STORY-145 covers only the refusal side).
- **Live Cursor Cloud dispatch**: STORY-121 stops at "Live dispatch disabled" unless a transport is configured; its live half needs an environment with Cloud access.
- **Keyboard and screen-reader passes** exist only for the board (STORY-068) and presence (STORY-056). Add passes for the Invite dialog, task detail (Resolve, Edit, Hand off), Goals/Activity, and Control.
- **Narrow-window checks** exist only for the board (STORY-069). Add the header, Invite dialog, task panel and Control pane at ≤760 px.
- **Live `client export`** of a non-revoked project is only a variation (STORY-141).
- **Real-agent rehearsal** is outside this catalog: the agent stories (STORY-123 onward) are scripted CLI sequences, not a harness actually running.

### Flagged for /ux-walker verification
These are code-read claims from the story agents. None has been verified in a running app; walk the named stories and confirm or refute each one.

**Dead ends and stuck states**
1. `FORBIDDEN` is not a definitive code, so the pending request is never cleared: the notice shows only **Retry saved request** (no Dismiss), every other change is refused with "Resolve the saved request before starting another change.", and the stuck state survives reload — STORY-089 (non-author **Keep this comment**), STORY-138.
2. `REVOKED` on a board write also keeps the request pending and undismissable; there is no board-specific revoked message — STORY-140.
3. `OPERATION_INTEGRITY_CONFLICT` is not definitive either, so **Retry saved request** keeps failing and **New task** stays disabled — STORY-083.
4. **Check again** only re-reads `/session` and can never sign a browser in; it also removes the expired-link notice, so it looks as if something changed — STORY-004, STORY-012.
5. The signed-out screen treats an agent-only `FORBIDDEN` as an expired link and advises "Ask your agent to open Pardner", which cannot work there — STORY-010, STORY-125, STORY-005.
6. Control-runtime recovery after an agent is revoked: the cached credential keeps failing with `AUTH_REQUIRED`; the documented fix (remove the file to re-grant) is refused with HTTP 403 because the Actor is in `revokedActors` — STORY-130, STORY-134. Whether a new Agent invitation can re-enrol the same deterministic Actor ID is unclear — STORY-130.
7. Cursor Cloud acceptance is API-only: after "Restart during submission", **Reconcile Cloud acceptance** says exact acceptance evidence is required, but no UI accepts it (`/cloud/executions/acceptance`) — STORY-121.
8. A cancelled-before-submission ("Ended: cancelled") execution shows the verdict and **Record artifact** forms, and the server accepts a verdict for work that never ran — STORY-113.
9. `HUB_UNAVAILABLE` for an invitation whose endpoint is the hub's loopback URL tells the person to retry, but retrying can never succeed — STORY-015, STORY-028, STORY-034.

**Permissions and safety**
10. `comment-delete` has no author check, so any Actor (including an agent) can delete anyone's comment, while edit and resolve are author-only — STORY-090.
11. **Keep this comment** is offered to every viewer, not only the author — STORY-089.
12. A My device invitation from *another person* passes the Link-page check and adopts the sponsor's identity on this computer; nothing shows whose identity an invitation carries — STORY-016, STORY-023.
13. Resolved by reading the code: only the **Link this device** form checks the invitation purpose (`ClientApp.jsx:136`). The Welcome **Join a project** form (`ClientApp.jsx:242`) has no purpose check, so STORY-027 is right. STORY-124's claim that an Agent invitation is refused there is wrong. Verify what the server does with your own Agent invitation pasted into Join project.
14. Creating an invitation on a client without `--public-url` gives no warning; the loopback endpoint fails only later on the recipient's machine — STORY-036, STORY-041.

**Mentions and identity**
15. Client handles (`human-<id>`, `agent-<hex>-<harness>`) are shown nowhere in the browser, so typing `@name` almost always gets "matches no Actor"; the handle comes only from `client show` — STORY-086, STORY-095, STORY-096.
16. Agent display names are their harness IDs ("openai-codex · agent") — STORY-093, STORY-094.
17. A handoff recipient gets no visible "Notified" cue; no browser surface shows mention delivery state — STORY-091, STORY-096, STORY-136.
18. Server-side mention matching skips the UI's email-local check, so text like `ops@human-…` notifies without a chip — STORY-086.
19. An identity typo cannot be fixed (no edit path; `IDENTITY_EXISTS` "linking requires My device" is misleading); the email regex accepts addresses with no dot — STORY-014, STORY-018, STORY-019.
20. "Filled in from your Git configuration." shows even when Git supplied only a name — STORY-013.
21. Member revocation needs the identity ID, not the Actor ID; using the Actor ID returns `NOT_FOUND` "Admission not found" — STORY-043, STORY-140.
22. Revoked devices stay in the profile **Devices** list with no sign of revocation — STORY-021.

**CLI and service lifecycle**
23. `PORT_IN_USE` in the `foreign` case tells the person to use `--http-port`, but the probe runs before the flag is used, so the advice cannot take effect — STORY-007, STORY-012.
24. `--http-port` is silently ignored when the service is already running — STORY-002.
25. `client status` with a stale connection file returns a raw error (probably `INTERNAL_ERROR: fetch failed`) rather than `CLIENT_NOT_RUNNING`; `client stop` reports the same state calmly; `client open` fails with a network error — STORY-009, STORY-143.
26. A bare token file with no `apiBase` falls back to `.pardner/connection.json` or `127.0.0.1:8004`, so a standalone service there silently becomes the wrong board — STORY-127.
27. `client operation` with malformed JSON returns `INTERNAL_ERROR` with a raw SyntaxError; an omitted `--request` gives a misleading `FORBIDDEN` — STORY-128. Malformed `bridge.json` has the same raw error — STORY-132.
28. A revoked agent's CLI sees `AUTH_REQUIRED` "Open Pardner through client open to authenticate", copy aimed at people — STORY-130.
29. `bridge status` keeps showing `running` after a crash (persisted observations, not liveness) — STORY-131.
30. Standalone `actors register` has no guidance for bootstrapping the first Actor — STORY-135.
31. After revocation the project disappears from `client list`, and nothing lists revoked project IDs needed for `client export` — STORY-141.

**Board, editing and planning friction**
32. Switcher labels and the project list are stale between session refreshes, and " · unconfirmed change" can sit next to "synced" — STORY-029, STORY-030, STORY-035.
33. **Open another project** leads to Start/Join, not to a project list, and the failure screen has no switcher — STORY-031.
34. Start's resume notice can flash during the first **Starting…**; joins have no resume notice and the textarea is empty after reload — STORY-024, STORY-028.
35. The Start tab accepts a pasted invitation prompt as a project name, and projects cannot be renamed or deleted — STORY-034.
36. Escape does nothing (silently) while a text field holds typed text, but closes the panel from a select — STORY-061, STORY-068, STORY-073.
37. The New task draft is memory-only (lost on reload or project switch) while edit drafts persist; blocked storage makes edit drafts memory-only with no warning — STORY-061, STORY-073, STORY-074.
38. The New task panel has no Vein field, and a task hidden by the active filters gets no notice — STORY-064, STORY-065.
39. The `STALE_UPDATE` notice says "Your draft is preserved" for quick Status, goal and vein selects that have no draft — STORY-072, STORY-098.
40. Conflict values render as raw slugs, Actor IDs and JSON, with labels like "Keep this tags" — STORY-077, STORY-078.
41. Issue link/unlink History rows read "recorded task.link-issue"; an `owner/repo#0` error shows at the panel top, not beside the issue form — STORY-079, STORY-080, STORY-082.
42. **Mark all read** sends the reader's own revisions; board cards carry no unread badge — STORY-087.
43. Activity's **Goals and veins** filter excludes verdicts (they are under **Status changes and handoffs**), and Activity filters are not persisted while board filters are — STORY-105.
44. A mistyped, non-ID-shaped `--goal` value silently creates a new goal — STORY-097.
45. CLI `update` expects per-field revision objects and `resolve` expects arrays — STORY-108.
46. The You button is a silent no-op before your Actor syncs; People → Profile loses focus return; offline avatars drop the focus-visible outline; reporter errors are swallowed — STORY-020, STORY-049, STORY-056, STORY-051.
47. Agents have no built-in presence reporter, and the grant's `apiBase` must have `/api` stripped for the sessions routes — STORY-054.

**Control tab friction**
48. **Read T3 now** before pairing looks like it did nothing — STORY-110.
49. After accepting T3 0.1.7 the status line still says "qualified 0.1.5, 0.1.6" — STORY-117.
50. "Cancellation holds the queue and does not undo changes" appears only in the Cursor Cloud section — STORY-114.
51. The credential-expiry warning has no link to the collapsed **Control settings** that holds the fix — STORY-119.
52. The Cloud agent field is free text and its error mentions T3 ("Map a T3 thread to a registered agent Actor") — STORY-121.
53. Threads cannot be unmapped and their authorized tasks or senders cannot be edited in the UI — STORY-112.

### Recommendations
- Walk the "Dead ends and stuck states" items first; items 1-3 can block every write in a tab.
- Add the missing stories listed above (branch/merge, bridge cleanup, control-runtime seal/run/restart, remote hub route, accessibility and narrow-window passes beyond the board).
- Feed the Redundancy Candidates to /ux-flow, starting with the four "try again" buttons, the two My device forms, the three vein-filter entry points, and Activity vs History.
