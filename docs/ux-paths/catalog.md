# UX Path Catalog: Pardner
Generated: 2026-11-07
Total Stories: 138
Coverage: 75 / 77 (97%)

Consolidated from `docs/ux-paths/discovery.md` and the 12 topic files in `docs/ux-paths/topics/`. The topic files held 156 stories numbered locally; 18 near-duplicates were merged into another story, leaving 138. Each story notes its original ID as *(was topic/STORY-NNN)*. Story references inside story text have been rewritten to the global IDs. Facts and code locations come from the topic agents' code reading and have not been re-verified here.

## Summary

| Topic | Short | Medium | Long | Total | Merged in |
|---|---:|---:|---:|---:|---:|
| First run and onboarding (STORY-001–012) | 6 | 4 | 2 | 12 | 1 |
| Daily task work on the board (STORY-013–022) | 3 | 5 | 2 | 10 | 0 |
| Human ↔ agent handoff round trip (STORY-023–033) | 4 | 5 | 2 | 11 | 1 |
| Comments, mentions and read receipts (STORY-034–043) | 4 | 5 | 1 | 10 | 1 |
| Goals and veins (STORY-044–057) | 6 | 6 | 2 | 14 | 2 |
| Concurrent edits and conflict resolution (STORY-058–071) | 3 | 9 | 2 | 14 | 5 |
| Offline, sync status and reconnection (STORY-072–083) | 4 | 5 | 3 | 12 | 3 |
| Companion device pairing over LAN (STORY-084–095) | 5 | 5 | 2 | 12 | 0 |
| Credential lifecycle and cleanup (destructive) (STORY-096–105) | 3 | 5 | 2 | 10 | 2 |
| Error and bootstrap failures (STORY-106–116) | 4 | 4 | 3 | 11 | 1 |
| Agent power user on the CLI (STORY-117–127) | 2 | 6 | 3 | 11 | 2 |
| Activity and history audit (STORY-128–138) | 5 | 4 | 2 | 11 | 0 |
| **Total** | **49** | **63** | **26** | **138** | **18** |

Walkability: `browser` 26, `browser+cli` 35, `multi-service` 60, `cli-only` 17.

## Coverage Matrix

Each row is a feature from the discovery Feature Map (the developer control runtime is excluded as out of scope for UI walks). A feature counts as covered when at least one story exercises it in its steps, variations or edge cases. **75 of 77 features covered (97%).** Stories are listed by global ID; long lists are truncated.

| Area | Feature | Stories | # |
|---|---|---|---:|
| Startup & connection | Static startup shell and 12 s load-failure text | STORY-001, STORY-107, STORY-110 | 3 |
| Startup & connection | StartupBoundary "Pardner could not open" | STORY-110 | 1 |
| Startup & connection | Config load + Retry connection on failure | STORY-001, STORY-006, STORY-010, STORY-075, STORY-089, STORY-098, STORY-100, STORY-108, … (+3) | 11 |
| Startup & connection | Config validation failure ("configuration is incomplete") | STORY-108 | 1 |
| Pairing screen | Pairing code field + Pair this device | STORY-001, STORY-006, STORY-010, STORY-085, STORY-088, STORY-089, STORY-090, STORY-096, … (+2) | 10 |
| Pairing screen | Connect with a local service token | STORY-001, STORY-005, STORY-006, STORY-010, STORY-011, STORY-073, STORY-083, STORY-088, … (+8) | 16 |
| Pairing screen | Auto-pair from `#pair=CODE` | STORY-085, STORY-087, STORY-088, STORY-093, STORY-094, STORY-100, STORY-111 | 7 |
| Pairing screen | Stored-token "Opening your local workspace…" + opening-screen Forget | STORY-001, STORY-005, STORY-006, STORY-007, STORY-016, STORY-041, STORY-073, STORY-075, … (+7) | 15 |
| Pairing screen | Pairing errors (PAIRING_INVALID / PAIRING_THROTTLED / ORIGIN_REQUIRED / WORKSPACE_MISMATCH on pair) | STORY-006, STORY-010, STORY-085, STORY-088, STORY-089, STORY-100, STORY-111 | 7 |
| Pairing screen | AUTH_REQUIRED returns to pairing ("The service credential changed") | STORY-006, STORY-073, STORY-076, STORY-098, STORY-100, STORY-101, STORY-102, STORY-105, … (+1) | 9 |
| Workspace header | SaveStatus live-region states | STORY-001, STORY-013, STORY-019, STORY-028, STORY-034, STORY-049, STORY-053, STORY-058, … (+23) | 31 |
| Workspace header | Actor select, remembered per workspace | STORY-001, STORY-002, STORY-003, STORY-005, STORY-007, STORY-008, STORY-011, STORY-013, … (+30) | 38 |
| Workspace header | New task button gating (Actor / busy / pending) | STORY-001, STORY-002, STORY-004, STORY-005, STORY-008, STORY-011, STORY-013, STORY-016, … (+9) | 17 |
| Workspace header | Workspace actions (Pair another device / Forget this workspace) | STORY-001, STORY-012, STORY-016, STORY-041, STORY-077, STORY-096, STORY-097, STORY-098, … (+3) | 11 |
| Workspace header | Views nav Tasks / Goals / Activity | STORY-003, STORY-005, STORY-009, STORY-011, STORY-014, STORY-016, STORY-020, STORY-021, … (+30) | 38 |
| Workspace header | Filters Assigned to / Status filter / Vein | STORY-002, STORY-003, STORY-009, STORY-015, STORY-016, STORY-020, STORY-021, STORY-022, … (+14) | 22 |
| Workspace header | View + filter persistence (localStorage preferences) | STORY-002, STORY-007, STORY-016, STORY-075, STORY-093, STORY-100, STORY-103, STORY-109 | 8 |
| Task board | Seven columns with counts; status filter collapses to one column | STORY-015, STORY-021, STORY-023, STORY-030, STORY-038, STORY-047, STORY-059, STORY-065, … (+2) | 10 |
| Task board | Card content and sort (priority, assignee, vein labels) | STORY-004, STORY-005, STORY-013, STORY-021, STORY-022, STORY-023, STORY-030, STORY-046, … (+3) | 11 |
| Task board | Conflicting edits badge on card | STORY-029, STORY-053, STORY-054, STORY-058, STORY-059, STORY-060, STORY-061, STORY-062, … (+10) | 18 |
| Task board | Empty column "No tasks here" | STORY-004, STORY-015, STORY-020, STORY-046, STORY-051, STORY-083 | 6 |
| Create task | New task panel with all fields (Title, Description, Status, Priority, Assignee, Tags) | STORY-004, STORY-013, STORY-018, STORY-023, STORY-058, STORY-071, STORY-112, STORY-116, … (+1) | 9 |
| Create task | Success opens new task details; vein not settable in UI | STORY-004, STORY-011, STORY-013, STORY-021, STORY-023, STORY-032, STORY-056, STORY-077, … (+5) | 13 |
| Task details | Opening task… / Close / Escape | STORY-004, STORY-014, STORY-017, STORY-018, STORY-019, STORY-020, STORY-021, STORY-027, … (+5) | 13 |
| Task details | Header meta line and "Veins:" line | STORY-021, STORY-046, STORY-048, STORY-049, STORY-051 | 5 |
| Task details | Markdown description / "No description yet." | STORY-004, STORY-013, STORY-017, STORY-021, STORY-027, STORY-034, STORY-037, STORY-038, … (+3) | 11 |
| Task details | Edit task → Save changes / Cancel edit (expectedRevisions) | STORY-018, STORY-019, STORY-020, STORY-021, STORY-030, STORY-032, STORY-049, STORY-056, … (+14) | 22 |
| Task details | STALE_UPDATE keeps draft ("Your draft is preserved") | STORY-040, STORY-059, STORY-062, STORY-063, STORY-064, STORY-067, STORY-077, STORY-079, … (+2) | 10 |
| Task details | Resolve {field} / Keep this {field} | STORY-029, STORY-054, STORY-059, STORY-060, STORY-061, STORY-062, STORY-064, STORY-065, … (+7) | 15 |
| Task details | Hand off work form (Recipient, Handoff status, Handoff message) | STORY-011, STORY-017, STORY-019, STORY-021, STORY-027, STORY-040, STORY-063, STORY-064, … (+2) | 10 |
| Task details | Stale-handoff notice + Use latest task details | STORY-040, STORY-063, STORY-064, STORY-105 | 4 |
| Task details | Comments list + Add comment + @mention delivery | STORY-011, STORY-033, STORY-034, STORY-036, STORY-041, STORY-043, STORY-053, STORY-074, … (+7) | 15 |
| Task details | Mark displayed comments read / "N unread for handle" | STORY-011, STORY-028, STORY-030, STORY-032, STORY-035, STORY-036, STORY-041, STORY-067, … (+3) | 11 |
| Task details | Keep this comment (comment conflicts) | STORY-031, STORY-038, STORY-067, STORY-071, STORY-137 | 5 |
| Task details | Evidence section | STORY-027, STORY-028, STORY-030, STORY-032, STORY-080, STORY-122, STORY-129, STORY-130, … (+1) | 9 |
| Task details | History section | STORY-013, STORY-018, STORY-020, STORY-021, STORY-022, STORY-027, STORY-035, STORY-037, … (+16) | 24 |
| Goals view | Goals list with status pills and conflicts | STORY-044, STORY-045, STORY-046, STORY-049, STORY-050, STORY-051, STORY-052, STORY-053, … (+5) | 13 |
| Goals view | Vein button → filtered board (showBoard) | STORY-009, STORY-046, STORY-068, STORY-132 | 4 |
| Goals view | Ready for a verdict | STORY-044, STORY-049, STORY-051, STORY-053, STORY-054, STORY-056, STORY-069 | 7 |
| Goals view | Empty states ("No goals yet…", "No veins pursue this goal yet.") | STORY-009, STORY-044, STORY-045, STORY-052 | 4 |
| Activity view | Workspace activity list + task link button | STORY-003, STORY-005, STORY-009, STORY-011, STORY-014, STORY-020, STORY-021, STORY-028, … (+23) | 31 |
| Pair another device | Dialog open/close, loading, Try again | STORY-084, STORY-085, STORY-087, STORY-092, STORY-099 | 5 |
| Pair another device | Non-admin with LAN disabled message | STORY-092 | 1 |
| Pair another device | "Settings saved. Restart…" notice | STORY-084, STORY-092, STORY-093, STORY-099 | 4 |
| Pair another device | Diagnostics (interface unavailable, multiple IPv4, address changed, listeners failed, token required) | STORY-073, STORY-083, STORY-093, STORY-095 | 4 |
| Pair another device | QR, Connect manually, Copy address, code expiry, Generate new code | STORY-085, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091, STORY-099, STORY-100, … (+2) | 10 |
| Pair another device | Network settings: Enable / Save network / Disable device access | STORY-084, STORY-099, STORY-105 | 3 |
| Pending writes | One write at a time; "Choose the Actor making this change." | STORY-021, STORY-027, STORY-035, STORY-071, STORY-077, STORY-083, STORY-086, STORY-101, … (+2) | 10 |
| Pending writes | Retry saved request (same operation ID) | STORY-004, STORY-020, STORY-021, STORY-041, STORY-062, STORY-071, STORY-077, STORY-083, … (+5) | 13 |
| Forget | Header Forget this workspace clears credential/prefs/pending | STORY-001, STORY-012, STORY-016, STORY-041, STORY-077, STORY-096, STORY-097, STORY-098, … (+3) | 11 |
| CLI | `serve` / `status` | STORY-005, STORY-018, STORY-022, STORY-024, STORY-030, STORY-032, STORY-048, STORY-049, … (+38) | 46 |
| CLI | `actors list` / `actors register` | STORY-001, STORY-002, STORY-003, STORY-005, STORY-011, STORY-043, STORY-080, STORY-083, … (+2) | 10 |
| CLI | `tasks` / `show` / `task create` / `update` / `handoff` / `resolve` / `diff` | STORY-058, STORY-065, STORY-068, STORY-069, STORY-119, STORY-131, STORY-137, STORY-138 | 8 |
| CLI | `comment` / `comments` / `comment-edit` / `comment-resolve` / `comment-delete` / `read --receipts` | STORY-025, STORY-028, STORY-031, STORY-037, STORY-038, STORY-039, STORY-041, STORY-043, … (+8) | 16 |
| CLI | `mentions pending|claim-next|ack|release` | STORY-023, STORY-025, STORY-026, STORY-032, STORY-033, STORY-056, STORY-071, STORY-074, … (+5) | 13 |
| CLI | `goals` / `goal create|show|update|resolve` | STORY-009, STORY-044, STORY-045, STORY-050, STORY-052, STORY-053, STORY-055, STORY-056, … (+4) | 12 |
| CLI | `veins` / `vein create|show|update|resolve|add|remove` | STORY-009, STORY-013, STORY-021, STORY-044, STORY-045, STORY-048, STORY-049, STORY-050, … (+11) | 19 |
| CLI | `branch` / `branches` / `merge` | STORY-121 | 1 |
| CLI | `link-commit` / `commit` / `trace list|show|task` | STORY-028, STORY-056, STORY-120, STORY-122, STORY-123, STORY-130, STORY-131, STORY-138 | 8 |
| CLI | `activity` / `timeline` | STORY-042, STORY-065, STORY-117, STORY-120, STORY-127, STORY-131, STORY-134, STORY-135, … (+3) | 11 |
| CLI | `operation --request` | STORY-124 | 1 |
| CLI | `bridge run|status|inspect|reconcile` | STORY-126 | 1 |
| CLI | Globals (`--operation-id`, `--data/--server/--token`, env vars) | STORY-002, STORY-005, STORY-028, STORY-038, STORY-065, STORY-080, STORY-115, STORY-117, … (+5) | 13 |
| HTTP / WS | Direct HTTP API use (`/automerge/operations`, `/pardner/access`, curl) | STORY-004, STORY-092, STORY-111 | 3 |
| HTTP / WS | WS live updates and reconnect ("Live updates disconnected…") | STORY-020, STORY-028, STORY-041, STORY-060, STORY-076, STORY-077, STORY-082, STORY-083, … (+7) | 15 |
| HTTP / WS | Hub ↔ replica sync (enrollment, sync-ack) | STORY-073, STORY-075, STORY-083, STORY-100, STORY-114 | 5 |
| HTTP / WS | `/automerge/github-remote` and `/automerge/trace/:hash` endpoints | STORY-130 | 1 |
| Errors | Storage unavailable / Local save failed / STORAGE_FAILED | STORY-006, STORY-016, STORY-072, STORY-074, STORY-077, STORY-081, STORY-096, STORY-102, … (+2) | 10 |
| Errors | ORIGIN_REJECTED | STORY-073, STORY-083, STORY-111 | 3 |
| Errors | WORKSPACE_MISMATCH remount | STORY-012, STORY-077, STORY-078, STORY-103, STORY-126 | 5 |
| Errors | Operation error codes in ErrorNotice (INVALID_ARGUMENT, NOT_FOUND, AMBIGUOUS_ACTOR, …) | STORY-005, STORY-013, STORY-022, STORY-024, STORY-025, STORY-028, STORY-029, STORY-034, … (+27) | 35 |
| Errors | Unreadable update / unreadable response | STORY-076, STORY-082, STORY-108 | 3 |
| Errors | Serve-time INCOMPATIBLE_SCHEMA / ROLE_MISMATCH | STORY-001, STORY-073, STORY-075, STORY-114 | 4 |
| Layout | Mobile layout ≤760px (stacked header, sideways board) | STORY-014, STORY-015, STORY-020, STORY-041, STORY-046, STORY-056, STORY-062, STORY-074, … (+4) | 12 |
| Integrations | T3 execution contract | **none** | 0 |
| Integrations | HTTPS proxy path `PARDNER_BROWSER_WS_PATH` | **none** | 0 |
| Integrations | Vite dev mode proxies (5174) | STORY-001, STORY-073 | 2 |

## Story Dependency Graph

Read top to bottom: a child needs the state its parent leaves behind (a running hub, registered Actors, seeded tasks, a replica, LAN access). Siblings can run in any order. Destructive stories (Forget, Disable, token rotation, offboarding) are at the end of their branch so they don't break later walks. A story listed under more than one parent needs only one of them.

```
ENV  Built UI + empty data dir (npm ci, ui:build)
│
├─ STORY-001 Empty service, token connect ─────────────── (failure variants: STORY-107 no UI build, STORY-108 service down, STORY-114 incompatible dir, STORY-106 CLI before serve, STORY-110 storage blocked)
│  ├─ STORY-006 Mistyped token        STORY-010 Pairing form on loopback
│  └─ STORY-002 Bootstrap first Actor (CLI)    ← every write below needs ≥1 Actor
│     ├─ STORY-003 Register the team  ══►  STANDARD SEED (alice, bob, builder, reviewer + vein "Edge caching")
│     │  ├─ STORY-008 Choose/switch Actor     STORY-009 Empty Goals/Activity     STORY-113 No Actor chosen
│     │  ├─ STORY-004 First task in browser
│     │  │  ├─ DAILY BOARD: STORY-013 → STORY-018 → STORY-015 / STORY-016 / STORY-017 / STORY-014 / STORY-019 / STORY-112
│     │  │  │  └─ STORY-021 Full morning (long)      STORY-022 Agent grooms via CLI
│     │  │  ├─ HANDOFF: STORY-023 → STORY-024 → STORY-027 → STORY-025 → STORY-026
│     │  │  │  ├─ STORY-028 Work + evidence → STORY-029 Stale CLI handoff → STORY-030 Human closes loop
│     │  │  │  ├─ STORY-063 Stale-handoff notice     STORY-031 Retract handoff comment     STORY-033 Reply by @mention
│     │  │  │  └─ STORY-032 Full round trip (long) → STORY-138 Weekly audit of it (long)
│     │  │  ├─ COMMENTS: STORY-034 → STORY-035 → STORY-036 → STORY-039
│     │  │  │  ├─ STORY-037 comment-edit → STORY-038 comment-delete → STORY-136 Audit deleted comment
│     │  │  │  ├─ STORY-040 Handoff mentioning third Actor     STORY-042 Activity vs History
│     │  │  │  └─ STORY-043 Mention newly registered agent
│     │  │  ├─ STALE EDITS (one hub): STORY-062 STALE_UPDATE draft     STORY-118 CLI revisions     STORY-117 Idempotent retry
│     │  │  ├─ ACTIVITY/AUDIT: STORY-128 → STORY-129 → STORY-130 → STORY-131 / STORY-119 / STORY-120 / STORY-133 / STORY-134
│     │  │  ├─ CLI POWER: STORY-125 → STORY-124 / STORY-121 / STORY-122 → STORY-123
│     │  │  │  └─ STORY-127 Full agent session (long) → STORY-126 Bridge (needs Codex App Server)
│     │  │  └─ CLEANUP (non-credential): STORY-104 Close out instead of delete
│     │  ├─ GOALS/VEINS: STORY-044 → STORY-045 → STORY-046 → STORY-047 → STORY-048
│     │  │  ├─ STORY-051 Wrong vein → STORY-052 Move vein → STORY-055 Edit goal → STORY-057 Planner read
│     │  │  ├─ STORY-049 Ready for a verdict → STORY-050 Goal achieved → STORY-132 Goal/vein activity
│     │  │  └─ STORY-056 Quarter end to end (long)
│     │  ├─ ONE-HUB RESTARTS: STORY-007 Reopen after reboot     STORY-076 Restart with board open     STORY-077 Uncertain write
│     │  │  └─ STORY-123 Commit landed, link failed
│     │  └─ STORY-011 / STORY-005 / STORY-116 End-to-end onboarding variants (run on their own fresh data dir)
│     │
│     ├─ REPLICA BRANCH (needs a second service): STORY-073 Enroll replica
│     │  ├─ STORY-072 status check → STORY-081 "synced" misread → STORY-078 Converge
│     │  ├─ STORY-074 Work while hub down → STORY-075 Reopen with no hub → STORY-082 Stale address
│     │  ├─ STORY-080 Agent through outage     STORY-135 Which machine made it     STORY-115 Ambiguous Actor
│     │  ├─ CONFLICTS: STORY-058 Different fields merge → STORY-060 Acceptance status conflict / STORY-079
│     │  │  ├─ STORY-059 Keep this status → STORY-070 Conflict reopened by late edit
│     │  │  ├─ STORY-061 Edit a conflicted field     STORY-064 Hand off while conflicted     STORY-066 Assignee/tags raw values
│     │  │  ├─ STORY-065 Resolve via CLI     STORY-067 Comment conflict     STORY-137 Reconstruct a conflict
│     │  │  ├─ STORY-068 Goal conflict / STORY-069 Vein in two goals / STORY-053 Conflicting verdicts / STORY-054 Blocked verdict
│     │  │  └─ STORY-071 Full outage day (long)
│     │  └─ STORY-083 Two-machine setup and outage drill (long; can replace STORY-073 as entry)
│     │
│     └─ LAN BRANCH (needs LAN interface + restart): STORY-084 Enable device access
│        ├─ STORY-095 BIND_HOST blocks setup     STORY-092 Non-admin desktop
│        └─ STORY-085 Restart + pair phone by QR
│           ├─ STORY-086 Live updates on phone → STORY-020 Phone triage / STORY-041 Phone + desktop comments
│           ├─ STORY-087 Copy link     STORY-088 Type code → STORY-089 Wrong code → STORY-090 Throttled
│           ├─ STORY-091 Code from phone     STORY-094 Rescan when paired     STORY-111 Hostname origin rejected
│           ├─ STORY-093 Address changed
│           └─ CREDENTIAL TEARDOWN (destructive; run last):
│              STORY-096 Forget borrowed laptop → STORY-097 Forget drops pending → STORY-098 Forget from opening screen
│              STORY-102 Cleared storage     STORY-103 Different data dir     STORY-012 Forget during onboarding
│              STORY-101 Rotation mid-save → STORY-109 Restart with rotated token → STORY-100 Rotate after lost phone
│              STORY-099 Disable device access → STORY-105 Offboard contractor (long)
```

Suggested walk order for /ux-walker: run the `browser` and `browser+cli` stories on one standard-seed hub first (Foundation → Daily board → Handoff → Comments → Goals → Activity → CLI), then the one-hub restart stories, then the replica branch on a fresh hub + replica, then the LAN branch, and the credential teardown last.

## Walkability

`browser`: fully walkable in the UI against one local hub, after the standard seed in discovery (Actors alice, bob, builder, reviewer; vein "Edge caching"). `browser+cli`: needs CLI seeding or CLI actions during the story alongside the browser. `multi-service`: needs a replica, a service restart, a stopped service, a second data directory or LAN/companion devices. `cli-only`: no browser steps.

| ID | Title | Type | Walkability | Note |
|---|---|---|---|---|
| STORY-001 | Solo developer brings up an empty service and connects the browser with the token | medium | `browser+cli` |  |
| STORY-002 | Bootstrap the first Actor from the CLI while the browser waits | short | `browser+cli` |  |
| STORY-003 | Register a team of humans and agents after the bootstrap | medium | `browser+cli` |  |
| STORY-004 | Create the very first task in the browser | medium | `browser` |  |
| STORY-005 | Agent-first bootstrap entirely from the CLI, then the human opens the browser | long | `browser+cli` |  |
| STORY-006 | Mistyped or stale token on the connection screen | short | `browser` |  |
| STORY-007 | Returning to a remembered workspace after a reboot | short | `multi-service` | single hub restart only |
| STORY-008 | Choosing an Actor when several exist, then switching | short | `browser` |  |
| STORY-009 | First visit to Goals and Activity on an empty workspace | short | `browser` |  |
| STORY-010 | A first-time user on loopback tries the pairing form instead of the token | medium | `browser` |  |
| STORY-011 | End-to-end first afternoon: from clone to a handed-off first task seen by the agent | long | `browser+cli` |  |
| STORY-012 | Starting over with "Forget this workspace" during onboarding | short | `multi-service` | restart the hub on a second `--data` dir |
| STORY-013 | Create a fully specified task from the header | medium | `browser` |  |
| STORY-014 | Close the New task panel and discover the draft is gone | short | `browser` |  |
| STORY-015 | Narrow the board to "my reviews" with Assigned to + Status filter | short | `browser` |  |
| STORY-016 | Filters and view survive a reload, but the open task does not | medium | `browser` |  |
| STORY-017 | Read a task with a rich markdown description and close with Escape | short | `browser` |  |
| STORY-018 | Change priority and status with Edit task and watch the card move | medium | `browser` |  |
| STORY-019 | Lose an edit draft to Escape or an Actor switch | medium | `browser` |  |
| STORY-020 | Triage on a phone: scroll the board sideways and update a task | medium | `multi-service` | needs LAN pairing; a 390×844 loopback viewport covers the layout half |
| STORY-021 | A full morning on the board, from triage to wrap-up | long | `browser+cli` |  |
| STORY-022 | An agent creates and grooms tasks entirely from the CLI while a human watches the board | long | `browser+cli` |  |
| STORY-023 | Alice assigns a new task to the builder agent from the board | short | `browser` |  |
| STORY-024 | Builder agent discovers its queue and reads the task through the CLI | short | `cli-only` |  |
| STORY-025 | Builder claims, durably stores and acknowledges a handoff mention | medium | `cli-only` |  |
| STORY-026 | Builder releases a lease it cannot handle right now | short | `cli-only` |  |
| STORY-027 | Alice hands off an existing task to builder from Task details | medium | `browser` |  |
| STORY-028 | Builder starts work, comments progress and links commit evidence while Alice watches live | long | `browser+cli` |  |
| STORY-029 | Builder hands off with stale revisions and recovers correctly | medium | `cli-only` |  |
| STORY-030 | Human reviews an agent's work and closes the loop from the UI | medium | `browser+cli` |  |
| STORY-031 | Handoff comment deleted or edited after delivery was queued | medium | `browser+cli` |  |
| STORY-032 | Full round trip — human to agent to agent to human | long | `browser+cli` |  |
| STORY-033 | Human answers an agent's question by @mention instead of handoff | short | `browser+cli` |  |
| STORY-034 | Post a progress comment with an @mention for an agent | short | `browser` |  |
| STORY-035 | Mark a burst of comments read and confirm the count drops | short | `browser+cli` |  |
| STORY-036 | Switch Actors to compare unread state between two humans | medium | `browser` |  |
| STORY-037 | Fix a typo in a comment with `comment-edit` | medium | `browser+cli` |  |
| STORY-038 | Delete a mistaken comment and cancel its mention | short | `browser+cli` |  |
| STORY-039 | Mark read from the CLI with explicit receipts | medium | `cli-only` |  |
| STORY-040 | Hand off with a message that mentions a third Actor | medium | `browser+cli` |  |
| STORY-041 | Comment and catch up across a phone and a desktop | long | `multi-service` |  |
| STORY-042 | Audit who discussed what in the Activity view vs task History | short | `browser+cli` |  |
| STORY-043 | Mention a newly registered agent and confirm delivery routing | medium | `browser+cli` |  |
| STORY-044 | Start a vein toward a brand-new goal and find it in the Goals view | short | `browser+cli` |  |
| STORY-045 | Add a second competing vein to an existing goal (and the duplicate-goal trap) | short | `browser+cli` |  |
| STORY-046 | Jump from a vein in Goals to the board filtered to that vein | short | `browser` |  |
| STORY-047 | Use the Vein filter directly on the board and clear it | short | `browser+cli` |  |
| STORY-048 | Agent files tasks into veins from the CLI and they show up labelled | medium | `browser+cli` |  |
| STORY-049 | Close the last task in the UI, see "Ready for a verdict", record the verdict on the CLI | medium | `browser+cli` |  |
| STORY-050 | Mark the goal achieved separately after a proven vein | short | `browser+cli` |  |
| STORY-051 | Remove a task that was linked to the wrong vein | medium | `browser+cli` |  |
| STORY-052 | Move a vein to a different goal | medium | `browser+cli` |  |
| STORY-053 | Two leads record conflicting verdicts on different machines | long | `multi-service` |  |
| STORY-054 | A conflicting task status quietly blocks "Ready for a verdict" | medium | `multi-service` |  |
| STORY-055 | Edit a goal's title and description from the CLI | short | `cli-only` |  |
| STORY-056 | Run a quarter's latency push end to end across humans, agents and surfaces | long | `multi-service` |  |
| STORY-057 | Read goal and vein state entirely from the CLI as an agent planner | medium | `cli-only` |  |
| STORY-058 | Two people edit different fields of the same task offline and both edits survive | medium | `multi-service` | hub + two replicas |
| STORY-059 | Spot a conflicting card on the board and keep the right status | short | `multi-service` |  |
| STORY-060 | Two-replica status conflict resolved in the browser (acceptance scenario) | medium | `multi-service` | hub + two replicas (acceptance scenario) |
| STORY-061 | Trying to edit a conflicted field through Edit task | medium | `multi-service` |  |
| STORY-062 | An agent renames the task while a human is mid-edit (STALE_UPDATE, draft preserved) | medium | `browser+cli` |  |
| STORY-063 | Stale handoff notice — someone reassigns the task while the handoff is being written | medium | `browser+cli` | two browser tabs on one hub |
| STORY-064 | Hand off a task whose status is in conflict | medium | `multi-service` | needs a replica-produced conflict |
| STORY-065 | An agent inspects and resolves a conflict entirely from the CLI | long | `multi-service` |  |
| STORY-066 | Choosing between conflicting assignees and tags shows raw values | short | `multi-service` | needs a replica-produced assignee/tags conflict |
| STORY-067 | Conflicting edits to the same comment | medium | `multi-service` |  |
| STORY-068 | A goal's status conflict is visible in the UI but resolvable only from the CLI | medium | `multi-service` |  |
| STORY-069 | A vein moved to two different goals concurrently | medium | `multi-service` |  |
| STORY-070 | A late offline edit reopens a conflict that was already resolved | short | `multi-service` |  |
| STORY-071 | A full outage day with multi-field conflicts across two replicas and an agent | long | `multi-service` |  |
| STORY-072 | Check whether a replica has caught up using `pardner status` | short | `multi-service` |  |
| STORY-073 | Enroll a laptop replica against the desktop hub | medium | `multi-service` |  |
| STORY-074 | Keep working on a replica while the hub is down | medium | `multi-service` |  |
| STORY-075 | Reopen an enrolled replica with no hub at all | medium | `multi-service` |  |
| STORY-076 | Service restarts while the board is open | medium | `multi-service` | single hub restart |
| STORY-077 | Recover a request that might not have saved | medium | `multi-service` | kill/restart the single local service mid-write |
| STORY-078 | Watch a replica converge when the hub comes back | short | `multi-service` |  |
| STORY-079 | Same field edited on both sides during an outage | long | `multi-service` |  |
| STORY-080 | Agent keeps working through a hub outage | long | `multi-service` |  |
| STORY-081 | Hub operator reads "synced" and assumes everyone is up to date | short | `multi-service` |  |
| STORY-082 | Wrong or stale address after moving the service | short | `multi-service` |  |
| STORY-083 | First-time two-machine setup, outage drill and recovery | long | `multi-service` |  |
| STORY-084 | First-time enable of device access from the host laptop | medium | `multi-service` |  |
| STORY-085 | Restart the service and pair a phone by scanning the QR code | long | `multi-service` |  |
| STORY-086 | Pair a phone and watch desktop updates arrive live | medium | `multi-service` |  |
| STORY-087 | Copy the pairing link to a tablet via a chat message | short | `multi-service` |  |
| STORY-088 | Type the 8-digit code on a phone that can't scan | medium | `multi-service` |  |
| STORY-089 | Wrong or expired code and the retry trap | medium | `multi-service` |  |
| STORY-090 | Throttled after repeated attempts | short | `multi-service` |  |
| STORY-091 | Generate a code from an already-paired phone for a third device | medium | `multi-service` |  |
| STORY-092 | Non-admin desktop opens the dialog while LAN is disabled | short | `multi-service` | needs a second LAN machine |
| STORY-093 | The laptop moved networks and the device address changed | long | `multi-service` |  |
| STORY-094 | Scanning a fresh QR on an already-paired phone | short | `multi-service` |  |
| STORY-095 | Service started with PARDNER_BIND_HOST override blocks device setup | short | `multi-service` |  |
| STORY-096 | Forget a borrowed laptop's workspace from the header | short | `browser` |  |
| STORY-097 | Forgetting the workspace silently discards an unconfirmed comment | medium | `multi-service` |  |
| STORY-098 | Forget from the opening screen while the service is down | short | `multi-service` | stop the single hub after config loads |
| STORY-099 | Turn off companion device access and confirm the phone is locked out | medium | `multi-service` |  |
| STORY-100 | Rotate the shared secret after a phone is lost, then re-pair the remaining devices | long | `multi-service` |  |
| STORY-101 | Credential rotated mid-save — pending write survives re-authentication | medium | `multi-service` | single hub restart with new token |
| STORY-102 | Cleared site storage while the board is open | short | `browser` |  |
| STORY-103 | A different data directory now answers on the same address | medium | `multi-service` | restart on a different `--data` dir |
| STORY-104 | Close out work that should have been deleted | medium | `browser` |  |
| STORY-105 | Offboarding a contractor end to end | long | `multi-service` |  |
| STORY-106 | CLI agent runs a command before the service is started | short | `cli-only` |  |
| STORY-107 | Opening the UI when the browser build was never made | medium | `browser+cli` | start the service without `ui:build` |
| STORY-108 | Service is down when the page first loads (config fetch fails) | short | `multi-service` | service stopped; cached shell or Vite dev server |
| STORY-109 | Service stops mid-session and restarts with a rotated token | long | `multi-service` | single hub restart with new token |
| STORY-110 | Browser site storage is blocked | medium | `browser` | browser configured to block site data |
| STORY-111 | Opening Pardner from a hostname the service does not allow | medium | `multi-service` |  |
| STORY-112 | Creating a task with a whitespace-only title | short | `browser` |  |
| STORY-113 | Trying to change work with no Actor chosen | short | `multi-service` | loopback browser with no Actor reproduces most of it |
| STORY-114 | Starting the service on a directory from an incompatible prior install | medium | `cli-only` |  |
| STORY-115 | Ambiguous Actor after two replicas register overlapping names offline | long | `multi-service` |  |
| STORY-116 | Full first-run bootstrap with each failure hit along the way | long | `multi-service` |  |
| STORY-117 | Retrying a task creation safely after a timeout | medium | `cli-only` |  |
| STORY-118 | Updating a field with expected revisions and recovering from STALE_UPDATE | medium | `cli-only` |  |
| STORY-119 | Reading a task's change log with diff | short | `cli-only` |  |
| STORY-120 | Auditing recent activity by Actor and task | medium | `browser+cli` |  |
| STORY-121 | Experimenting on a branch and merging it back | long | `cli-only` |  |
| STORY-122 | Committing code with trace attribution linked to a task | medium | `browser+cli` |  |
| STORY-123 | Recovering when Git committed but the evidence link failed | medium | `multi-service` | stop the service between git commit and link |
| STORY-124 | Scripting raw operations with operation --request | medium | `cli-only` |  |
| STORY-125 | Pointing the CLI at the right workspace from any directory | short | `cli-only` |  |
| STORY-126 | Wiring an agent to wake on mentions with the bridge | long | `cli-only` | needs a Codex App Server for `bridge run` |
| STORY-127 | A full agent work session from mention to handoff | long | `cli-only` |  |
| STORY-128 | Jump from the newest activity entry to the task it touched | short | `browser` |  |
| STORY-129 | Find out who moved a task to Review and from what | short | `browser` |  |
| STORY-130 | Confirm a task has commit evidence before approving | short | `browser` |  |
| STORY-131 | Audit everything an agent did on one task via the CLI | medium | `browser+cli` |  |
| STORY-132 | Workspace activity entries for goals and veins have no destination | short | `browser+cli` |  |
| STORY-133 | Activity link opened while the New task panel is still open | short | `browser` |  |
| STORY-134 | Long-running workspace: scanning hundreds of activity entries | medium | `browser+cli` |  |
| STORY-135 | Which machine made this change? Attribution across hub and replica | medium | `multi-service` |  |
| STORY-136 | Auditing a deleted comment | medium | `browser+cli` |  |
| STORY-137 | Reconstructing a conflicting edit and its resolution | long | `multi-service` |  |
| STORY-138 | End-to-end weekly audit of a human ↔ agent handoff | long | `multi-service` |  |

## All Stories

### First run and onboarding

<details><summary>Topic background (from first-run-onboarding.md)</summary>

Sources: `ui-prototype/index.html`, `ui-prototype/src/main.jsx`, `ui-prototype/src/Pardner.jsx` (connection screen at lines 351-379, header and no-Actors notice at 393-476, `TaskForm` at 625-734, `Goals` at 586-623, Activity at 531-549), `ui-prototype/src/connection.js`, `lib/cli.js`, `lib/local-service.js`, `lib/workspace-commands.js` (`prepareOperation` bootstrap rule), `lib/workspace-schema.js` (`actorRecord`, `checkActorNames`, `resolveActor`), `lib/workspace-runtime.js`, `automerge-sync-server.js`, `README.md#quick-start`, `docs/PARDNER-CLI.md`, `test/pardner-ui.test.js`, `test/pardner-connection-ui.test.js`.

Background facts that every story relies on:
- `pardner serve --data DIR` on an empty directory creates a new hub workspace. It always generates a 32-byte hex token when none is given, and writes it to `DIR/connection.json` with mode 0600. The command prints one JSON line on stdout (`{"success":true,"serving":true,"role":"hub","workspaceId":…,"httpUrl":"http://127.0.0.1:8004","wsUrl":"ws://127.0.0.1:8005","phoneAccess":…}`) and emoji log lines on stderr (`📡 HTTP API listening on 127.0.0.1:8004`, `🔐 Auth mode: token required`). Neither output contains the token or the `/pardner/` UI path.
- The bootstrap rule: while the workspace has no Actors, an `actor.register` is accepted only if the authoring `--actor` equals the new Actor's **ID** (`request.actorId === payload.id`). Every later operation resolves `--actor` by ID or handle.
- The browser has no way to register Actors. Registration exists only in the CLI (`actors register`, alias `agents register`) or as a raw `operation --request`.

</details>

#### STORY-001: Solo developer brings up an empty service and connects the browser with the token
*(was first-run-onboarding/STORY-001)*

**Type**: medium
**Topic**: First run and onboarding
**Persona**: Priya Shah, a staff engineer trying Pardner on her laptop before she points her two coding agents at it
**Goal**: Get from a fresh checkout to a connected browser workspace.
**Preconditions**: Node 24.11.1; `npm ci`, `npm ci --prefix ui-prototype` and `npm run ui:build` already done; `.pardner/` does not exist; nothing is listening on 8004/8005.
**Ideal path**: 3 steps. Start the service, open the printed URL, and be connected automatically on loopback (or with one paste).
**Alternate paths**: `npm run sync` starts the service directly (`node automerge-sync-server.js`) instead of `pardner serve`. In dev, `npm run dev --prefix ui-prototype` serves the UI on `http://localhost:5174/pardner/` with proxies. Pairing with a code is not available yet: `POST /pardner/access/pairing` returns `LAN_UNAVAILABLE` ("Enable LAN access and restart the service before pairing") until LAN access is enabled, and enabling it needs a connected browser first.
**Walkability**: `browser+cli`
**Related**: STORY-006, STORY-010, STORY-107, STORY-108, STORY-114, STORY-116
##### Steps
1. Runs `node bin/pardner.js serve --data .pardner` in terminal A → stderr shows `🚀 Starting Automerge Sync Server...`, `📡 HTTP API listening on 127.0.0.1:8004`, `🌐 WebSocket sync on 127.0.0.1:8005`, `🔐 Auth mode: token required`. Stdout prints one JSON line with `"httpUrl":"http://127.0.0.1:8004"`. Priya looks for a "open this link" line, finds none, and guesses that the UI is at the root.
2. Opens `http://127.0.0.1:8004/` → the server returns raw JSON `{"error":"Unauthorized","code":"AUTH_REQUIRED"}`, because only `/pardner` is mounted as static UI and everything else falls through to the auth middleware. She thinks she needs to log in somewhere. She re-reads the README Quick start and finds `http://127.0.0.1:8004/pardner/`.
3. Opens `http://127.0.0.1:8004/pardner/` → the static startup shell shows **Pardner**, "Opening your workspace…" and a **Reload Pardner** button. React then replaces it with the connection screen.
4. Reads the connection screen → heading **Pardner**, "One workspace for human and agent Actors.", a **Pairing code** field with the primary button **Pair this device**, and below it an expanded `<details>` **Connect with a local service token**. It is open by default because she is on loopback (`canManageAccess`). She hesitates: the pairing form comes first and is styled as the primary action, but she has no other device to get a code from.
5. Reads the token helper text "Use the token from the service's connection.json file. This browser remembers it until you forget the workspace or the secret changes." → in terminal B runs `cat .pardner/connection.json` and copies the `"token"` value (64 hex characters).
6. Pastes it into **Local service token** (a password field, so she cannot see what she pasted) and clicks **Connect** → the token is trimmed and stored in localStorage under `pardner:<workspaceId>:credential`. The screen shows "Opening your local workspace…" and **Forget this workspace**.
7. Waits → the workspace shell renders: `h1` **Pardner**, save status "Connecting to local service", which becomes "Saved locally · synced" once the WebSocket opens. The header has an **Actor** select whose only option is "Choose an Actor" and a disabled **New task** button. A notice reads "Register your first human or agent Actor with `pardner actors register` to begin." (continues in STORY-002).
##### Variations
- With `--data` omitted, the CLI defaults to `.pardner` in the current directory (`localConnection`). Running `serve` from a different directory therefore silently creates a second, separate workspace.
- `PARDNER_API_TOKEN=… pardner serve` or `--token` uses that token instead of generating one. The token is still written to `connection.json`.
- In Vite dev mode (`localhost:5174`), `loadConfiguration` rewrites `apiBase`/`wsPath` to `/pardner-api` and `/pardner-ws/`. The screens are the same.
##### Edge Cases
- The UI was never built (`ui-prototype/dist` missing): the static mount falls through to the auth middleware, so `/pardner/` returns raw JSON `{"error":"Unauthorized","code":"AUTH_REQUIRED"}` instead of the startup shell. Nothing tells her to run `npm run ui:build`.
- The JS bundle fails to load: after 12 s, or on a script error, the startup shell changes to "Pardner could not finish loading. Reload the page; if this continues, rebuild the browser client and restart the service." (`index.html`).
- `GET /pardner/config` fails or times out (10 s): the screen shows the error message (for example "Configuration unavailable" in tests), "Check that the service is running. If the address changed, open Pair another device on the desktop." and **Retry connection**. On a first run the "Pair another device" advice does not apply.
- `--data` points at a non-empty directory with no workspace metadata: `serve` exits with `INCOMPATIBLE_SCHEMA` "This directory contains data without compatible workspace metadata; choose a new directory". An old schema gives "Workspace metadata is incompatible; preserve this directory and enroll a new workspace". Data is left intact.
- Ports already in use: `serve` fails to start (listen error on stderr, JSON error on stdout). The UI is unreachable and the startup shell never appears.
- **Multi-surface:** the "Pardner" `h1` appears on the startup shell, the config loader, the connection screen and the workspace header. "Opening your workspace…" appears both in the static shell and in the React config loader, so a slow load shows the same text twice in a row with no visible progress.

---

#### STORY-002: Bootstrap the first Actor from the CLI while the browser waits
*(was first-run-onboarding/STORY-002)* — **Merged sources:** errors-bootstrap/STORY-002 "First Actor bootstrap typed with the wrong author"

**Type**: short
**Topic**: First run and onboarding
**Persona**: Priya Shah (continuing STORY-001), with the browser open on the empty workspace
**Goal**: Register herself as the first human Actor so the empty-workspace notice goes away.
**Preconditions**: Browser connected to a workspace with zero Actors; the service is running with `--data .pardner`.
**Ideal path**: 1 step. A "Register yourself" form in the browser would do it. Today it needs one CLI command plus a selection.
**Alternate paths**: `pardner agents register …` (alias). `pardner operation --request '{"type":"actor.register","actorId":"priya","operationId":"boot-1","payload":{"id":"priya","handle":"priya","kind":"human"}}'`. Setting `PARDNER_ACTOR=priya` instead of `--actor`. No UI path.
**Walkability**: `browser+cli`
**Related**: STORY-003, STORY-043, STORY-115, STORY-124
**Why merged**: Both are the bootstrap `actors register` of the first Actor, including the `--actor` must equal the new ID rule.
##### Steps
1. Reads the notice "Register your first human or agent Actor with `pardner actors register` to begin." → copies `pardner actors register`, but `pardner` is not on PATH in a checkout ("command not found"). She switches to `node bin/pardner.js`.
2. Runs `node bin/pardner.js actors register priya --handle priya --kind human --display-name "Priya Shah" --actor priya` → stdout `{"success":true,"operationId":"…","result":{"actorId":"priya"},…}`. She notes that registering herself requires naming herself as the author too (`--actor priya`).
3. Looks at the browser without reloading → the WebSocket `document-state` push removes the notice. The **Actor** select now offers "Priya Shah · human".
4. Chooses "Priya Shah · human" in **Actor** → **New task** becomes enabled. The choice is saved in `pardner:<workspaceId>:preferences`.
##### Variations
- Without `--display-name`, the label falls back to the handle: "priya · human".
- `--kind agent` for the first Actor is also accepted. The notice says "human or agent", so a workspace can bootstrap with an agent.
##### Edge Cases
- Omitting `--actor` and `PARDNER_ACTOR`: `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR` on stderr, with `{"success":false,…}` on stdout and exit code 1.
- `--actor` differs from the ID (for example `actors register priya-shah --handle priya --kind human --actor priya`): the bootstrap rule compares against the **ID** `priya-shah`, so it fails with `UNKNOWN_ACTOR: Unknown Actor: priya`. This is confusing because "priya" is the handle she just typed.
- Invalid handle `--handle "Priya Shah"`: "Actor handles must start with a letter and contain letters, numbers, underscores, or hyphens". Mixed-case handles are lowercased silently (`--handle Priya` is stored as `priya`).
- `--kind person`: "Actor kind must be human or agent".
- Running the same command a second time with a fresh operation ID: `ALREADY_EXISTS` "Actor ID already exists". With the same `--operation-id`, the stored receipt is replayed as a success.
- The service is not running: the CLI returns `LOCAL_SERVICE_UNAVAILABLE`.
- **Multi-surface:** the new Actor appears at once in three selects (header **Actor**, nav **Assigned to** under "All Actors", and later the New task **Assignee**), always as `displayName · kind`.

##### Merged source: errors-bootstrap/STORY-002 — First Actor bootstrap typed with the wrong author

**Type**: short
**Topic**: Error and bootstrap failures
**Persona**: Priya, a staff engineer setting up Pardner for her team for the first time and following the README
**Goal**: Register the first human Actor so the UI notice "Register your first human or agent Actor with `pardner actors register` to begin." goes away
**Preconditions**: Service running on an empty `--data .pardner-team`. No Actors exist.
**Ideal path**: 1 — `actors register priya --handle priya --kind human --actor priya`.
**Alternate paths**: `pardner agents register …` (alias); `pardner operation --request '{"type":"actor.register",…}'`.

**Steps (from errors-bootstrap/STORY-002):**

1. Priya assumes `--actor` names whoever runs the command, so she types her laptop username: `pardner actors register priya --handle priya --kind human --actor pkumar` → `{"success":false,"error":{"code":"UNKNOWN_ACTOR","message":"Unknown Actor: pkumar",…}}`. The bootstrap exception only applies when `actorId === payload.id` (`workspace-commands.js:346`).
2. She leaves out `--actor` → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`.
3. She reruns with `--actor priya` → `{"success":true,…}`. The open browser receives a `document-state` push, and the no-Actors notice disappears.
4. In the browser, she picks "priya · human" in the **Actor** select → **New task** becomes enabled.

**Variations (from errors-bootstrap/STORY-002):**

- `--handle Priya` is lowercased to `priya`. `--handle 9lives` fails with "Actor handles must start with a letter and contain letters, numbers, underscores, or hyphens".
- `--kind person` → "Actor kind must be human or agent".

**Edge Cases (from errors-bootstrap/STORY-002):**

- Nothing in the "Unknown Actor" message explains the bootstrap rule (the author must be the Actor being registered). Priya has to find it in the docs.
- Once the workspace has an Actor, registering more Actors requires an existing author, and the bootstrap exception no longer applies.

---

#### STORY-003: Register a team of humans and agents after the bootstrap
*(was first-run-onboarding/STORY-003)*

**Type**: medium
**Topic**: First run and onboarding
**Persona**: Marcus Lee, an engineering manager setting up Pardner for himself, his colleague Dana and two coding agents, "builder" and "reviewer"
**Goal**: Have all four Actors available in the browser before work starts.
**Preconditions**: Fresh workspace; the browser is connected and shows the no-Actors notice.
**Ideal path**: 2 steps. One bootstrap registration, then one batch or form to add the rest.
**Alternate paths**: `agents register` alias; `operation --request`; `PARDNER_ACTOR=marcus` exported once for the session. None in the UI.
**Walkability**: `browser+cli`
**Related**: STORY-002, STORY-043, STORY-115, STORY-124
##### Steps
1. `node bin/pardner.js actors register marcus --handle marcus --kind human --display-name "Marcus Lee" --actor marcus` → success. The browser notice disappears.
2. `node bin/pardner.js actors register dana --handle dana --kind human --display-name "Dana Ortiz"` (forgot `--actor`) → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`. He exports `PARDNER_ACTOR=marcus` to stop repeating it.
3. Re-runs the dana command → success, authored by marcus.
4. `actors register builder --handle builder --kind agent` → success.
5. `actors register reviewer --handle reviewer --kind agent` → success.
6. `node bin/pardner.js actors list` → `{"success":true,"actors":[…4 records…]}` showing id, handle, kind and displayName.
7. In the browser, opens **Actor** → "Choose an Actor", "Marcus Lee · human", "Dana Ortiz · human", "builder · agent", "reviewer · agent" (in insertion order, not grouped by kind).
8. Chooses "Marcus Lee · human".
9. Opens **Assigned to** in the nav → "All Actors" plus the same four entries.
##### Variations
- Dana registers herself from her own terminal with `--actor dana`: this fails with `UNKNOWN_ACTOR: Unknown Actor: dana`, because only an existing Actor can author a new registration once the workspace has one.
- Using a handle as the author (`--actor MARCUS`): `resolveActor` lowercases it and matches the handle `marcus`.
##### Edge Cases
- `actors register bob --handle builder --kind human`: `ALREADY_EXISTS` "Actor handle already exists".
- `actors register Builder2 --handle builder2` where another Actor's ID equals the new handle: "Actor IDs and handles must not refer to different Actors".
- Actors cannot be renamed, deactivated or deleted (no `actor.update` operation exists), so a typo in a display name is permanent.
- Each registration appears in **Activity** as "Marcus Lee · human · actor.register" with a timestamp and no link button.
- **Multi-surface:** `actors list` (CLI JSON) and the three UI selects show the same roster. The CLI shows IDs and the UI shows only `displayName · kind`, so two Actors with the same display name and kind would be indistinguishable in the UI.

---

#### STORY-004: Create the very first task in the browser
*(was first-run-onboarding/STORY-004)*

**Type**: medium
**Topic**: First run and onboarding
**Persona**: Priya Shah, now registered, wanting to give the "builder" agent its first job
**Goal**: Create a task assigned to builder and confirm it landed.
**Preconditions**: Actors `priya` (human) and `builder` (agent) exist. Browser connected; **Actor** is "Priya Shah · human"; the board is empty.
**Ideal path**: 4 steps. Click **New task**, type a title, pick an assignee, submit.
**Alternate paths**: CLI `node bin/pardner.js task create --title 'Coordinate our first task' --assignee builder --actor priya --operation-id first-task` (README Quick start), which can also set `--vein`. Raw `operation --request` with `task.create`.
**Walkability**: `browser`
**Related**: STORY-013, STORY-014, STORY-023, STORY-077, STORY-097, STORY-101, STORY-112, STORY-117, STORY-133
##### Steps
1. Looks at the Tasks board → seven columns (Backlog, Up next, In progress, Review, Completed, Dead end, Abandoned), each with count 0 and "No tasks here". The view is clear, but there is no prompt to create a first task.
2. Clicks **New task** → a right side panel "New task" with **Close** opens. Fields: **Title**, **Description**, **Status** (Backlog), **Priority** (p2), **Assignee** (Unassigned), **Tags, separated by commas**.
3. Types the title "Add latency instrumentation to the sync server".
4. Types a markdown description: "Measure p95 of `/automerge/operations`.\n\n- add timer\n- log histogram".
5. Sets **Status** to "Up next" and **Priority** to "p1". She notices the priority options are lowercase (p0–p3) while cards show "P1".
6. Sets **Assignee** to "builder · agent".
7. Types tags "perf, sync".
8. Clicks **Create task** → the button is disabled while busy and the header status reads "Saving locally…". The panel closes and **Task details** opens on the new task.
9. Reads the detail panel → heading "Add latency instrumentation to the sync server", its own save status, "builder · agent · Up next · P1", the rendered markdown, **Edit task**, a **Hand off work** form, "Comments (0)", "0 unread for priya", Evidence "No commit evidence linked yet.", and a History entry "Priya Shah · human · task.create" with lines like `title: null → "Add latency instrumentation to the sync server"` and `assignee: null → "builder"`.
10. Presses Escape → the detail panel closes. The Up next column shows count 1 and a card "P1 / Add latency instrumentation… / builder · agent".
##### Variations
- Leaving Assignee "Unassigned": the card and detail show "Unassigned".
- Submitting with an empty Title: browser `required` validation blocks submission.
##### Edge Cases
- The tags "perf, sync" are saved but shown nowhere except when reopening **Edit task**: not on the card, the detail header or the board filters. Priya cannot confirm they were saved.
- Clicking **Close** on the New task panel discards the draft with no confirmation.
- The service drops mid-submit: "A request is awaiting confirmation." with **Retry saved request**. The pending write is kept in sessionStorage, and **New task** stays disabled until it resolves.
- **Multi-surface:** the assignee is shown on the card ("builder · agent"), in the detail header ("builder · agent · Up next · P1") and in History as the raw ID `"builder"`. Status is shown by column placement, in the detail header label "Up next" and in History as the raw value `"up-next"`. Save status is shown twice when the panel is open (header and detail panel).

---

#### STORY-005: Agent-first bootstrap entirely from the CLI, then the human opens the browser
*(was first-run-onboarding/STORY-005)*

**Type**: long
**Topic**: First run and onboarding
**Persona**: Theo Nakamura, a platform engineer who scripts his environment and wants his agent "builder" to see a task before he touches the UI
**Goal**: Bootstrap the workspace, Actors and first task from the shell, then verify everything in the browser.
**Preconditions**: UI built; empty `.pardner-theo` directory.
**Ideal path**: 6 steps. Serve, register two Actors, create the task, open the UI, connect.
**Alternate paths**: The browser **New task** form for the task step. `operation --request` for any mutation.
**Walkability**: `browser+cli`
**Related**: STORY-011, STORY-032, STORY-116, STORY-138
##### Steps
1. `node bin/pardner.js serve --data .pardner-theo` → JSON line with `"serving":true,"role":"hub"`. The terminal stays attached.
2. In a new terminal: `export PARDNER_DATA_DIR=.pardner-theo` so the CLI reads the matching `connection.json` (url and token).
3. `node bin/pardner.js status` → hub status JSON, which confirms the CLI and service agree.
4. `node bin/pardner.js actors list` → `{"success":true,"actors":[]}`.
5. `node bin/pardner.js actors register theo --handle theo --kind human --display-name "Theo Nakamura" --actor theo` → success.
6. `export PARDNER_ACTOR=theo`.
7. `node bin/pardner.js actors register builder --handle builder --kind agent` → success.
8. `node bin/pardner.js task create --title 'Wire Pardner into the nightly build' --assignee builder --priority p1 --status up-next --operation-id first-task --json` → `result.taskId` like `task-…`.
9. Re-runs the same command (shell history slip) → it replays the same receipt instead of creating a duplicate, because `--operation-id first-task` matches.
10. `PARDNER_ACTOR=builder node bin/pardner.js tasks --assignee builder --json` → one task, plus `status`.
11. `PARDNER_ACTOR=builder node bin/pardner.js show <taskId> --json` → context with `revisions`, empty comments and history.
12. Opens `http://127.0.0.1:8004/pardner/` → connection screen (STORY-001 step 4).
13. `cat .pardner-theo/connection.json`, then pastes the token into **Local service token** → **Connect** → "Opening your local workspace…".
14. The workspace renders → no no-Actors notice. **Actor** shows "Choose an Actor" and **New task** is disabled. Theo wonders why he is not "logged in" when the CLI already knows him as theo; the browser has its own Actor choice.
15. The board → Up next has 1 card "P1 / Wire Pardner into the nightly build / builder · agent".
16. Chooses "Theo Nakamura · human" in **Actor** → **New task** is enabled.
17. Clicks **Activity** → "Workspace activity" lists, newest first: "Theo Nakamura · human · task.create" with a "Wire Pardner into the nightly build" button, "Theo Nakamura · human · actor.register", and "Theo Nakamura · human · actor.register" again (builder's registration, attributed to its author). Each has a local timestamp.
18. Clicks the "Wire Pardner into the nightly build" button → **Task details** opens over Activity.
19. Clicks **Close**, then **Tasks** → he is back on the board.
##### Variations
- Skipping step 2: the CLI uses `.pardner` (default) and finds no `connection.json`, so it defaults to `http://127.0.0.1:8004` with no token and the commands fail with `AUTH_REQUIRED` even though the service is running.
- Using `--data .pardner-theo` on each command instead of `PARDNER_DATA_DIR`.
##### Edge Cases
- Without `--operation-id` in step 9, a second identical task is created with no warning.
- Reusing `--operation-id first-task` with a different title: `OPERATION_ID_REUSED` "This operation ID already belongs to a different request".
- In Activity, both registrations read "Theo Nakamura · human · actor.register" and do not name the Actor that was registered.
- **Multi-surface:** the task appears in CLI `tasks`, CLI `show`, the board card, Activity (task button) and Task details. Its creation appears both in Activity and in the task's History.

---

#### STORY-006: Mistyped or stale token on the connection screen
*(was first-run-onboarding/STORY-006)*

**Type**: short
**Topic**: First run and onboarding
**Persona**: Dana Ortiz, a designer who copied the token from a Slack message and accidentally included a trailing quote
**Goal**: Recover from a bad token and connect.
**Preconditions**: The service is running; the browser is on the connection screen on loopback.
**Ideal path**: 2 steps. Re-paste the correct token and click **Connect**.
**Alternate paths**: Pairing with a code from another already-connected device (needs LAN access enabled; see the companion-device topic).
**Walkability**: `browser`
**Related**: STORY-001, STORY-010, STORY-107, STORY-108, STORY-116
##### Steps
1. Pastes `a3f9…e1"` into **Local service token** and clicks **Connect** → the credential is stored and "Opening your local workspace…" appears briefly. The first request returns 401 `AUTH_REQUIRED`, so the stored credential is forgotten and the token form reappears with an alert. The alert shows the service's error text (for example "Unauthorized", or "The service credential changed. Pair again or enter the current local service token."), followed by "Check that the service is running. For a changed address, reopen Pair another device on the desktop." and a disabled **Retry connection**.
2. Dana is confused: the advice is about the service and the address, not the token. **Retry connection** is greyed out because there is neither a token nor a pairing code.
3. Re-copies the token from `connection.json`, pastes it and clicks **Connect** → the workspace opens (covered in `test/pardner-connection-ui.test.js`).
##### Variations
- Surrounding whitespace is harmless: `remember` trims the token.
##### Edge Cases
- Pressing Enter in the empty token field: the browser's `required` validation blocks the submit.
- Clicking **Pair this device** with an empty pairing field: blocked by `required` and the `pattern="[0-9]{8}"`. Typing a random 8-digit code: "The pairing code is incorrect or expired. Generate a new code on the desktop." Ten tries per minute leads to "Too many attempts. Wait a minute and try again."
- Browser storage blocked: "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes." She cannot connect at all, because the credential must be written to localStorage.

---

#### STORY-007: Returning to a remembered workspace after a reboot
*(was first-run-onboarding/STORY-007)*

**Type**: short
**Topic**: First run and onboarding
**Persona**: Priya Shah, the morning after her first session
**Goal**: Reopen Pardner and land back where she was, with her Actor still selected.
**Preconditions**: Yesterday she connected with the token and chose "Priya Shah · human". The service was restarted with the same `--data .pardner`.
**Ideal path**: 1 step. Open the URL.
**Alternate paths**: none found.
**Walkability**: `multi-service` (single hub restart only)
**Related**: STORY-016, STORY-076
##### Steps
1. Runs `node bin/pardner.js serve --data .pardner` again → it reuses the token, ports and workspace ID from `connection.json` and `workspace.json`.
2. Opens `http://127.0.0.1:8004/pardner/` → "Opening your workspace…", then "Opening your local workspace…". The workspace renders with **Actor** "Priya Shah · human" and her last view (Tasks, Goals or Activity) and filters restored from `pardner:<workspaceId>:preferences`.
##### Variations
- She had started the service with an explicit `--token new-secret` instead: the stored credential fails and she is sent back to the token form (STORY-006 path).
##### Edge Cases
- Serving a fresh `--data` directory on the same port gives a new `workspaceId`. The stored credential is keyed by the old workspace ID, so she sees the connection screen as on a first run, with no hint that a different workspace is now on that port.
- If the saved preferences name an Actor ID that is not in the document, the selection silently resets to "Choose an Actor" (`useEffect` on `doc.actors`).

---

#### STORY-008: Choosing an Actor when several exist, then switching
*(was first-run-onboarding/STORY-008)*

**Type**: short
**Topic**: First run and onboarding
**Persona**: Marcus Lee, opening the browser on the shared team workspace for the first time
**Goal**: Act as himself, and understand what the Actor choice changes.
**Preconditions**: Four Actors registered (STORY-003); the browser has just connected; no Actor chosen yet.
**Ideal path**: 1 step. Pick his name.
**Alternate paths**: none found (Actor identity in the browser is only this select; CLI identity is `--actor`/`PARDNER_ACTOR`).
**Walkability**: `browser`
**Related**: STORY-019, STORY-036, STORY-113
##### Steps
1. Sees **New task** disabled and no explanation. The no-Actors notice is gone because Actors exist. He clicks the disabled button; nothing happens.
2. Notices the **Actor** select showing "Choose an Actor" → picks "Marcus Lee · human" → **New task** is enabled.
3. Opens an existing task → the detail panel shows "N unread for marcus".
4. Switches **Actor** to "Dana Ortiz · human" while the panel is open → the panel remounts (keyed by task and Actor) and the unread line changes to "… unread for dana". Any draft comment or handoff text he had typed is lost.
##### Variations
- Choosing an agent ("builder · agent") is allowed. The UI makes no distinction, so Marcus can act as an agent from the browser.
##### Edge Cases
- There is no authentication of the Actor choice: any connected browser can act as any Actor. This is consistent with the shared-secret design, but surprising to a first-time user.
- **Multi-surface:** the "N unread for {handle}" label uses the handle, while the selects use the display name ("Marcus Lee · human" versus "unread for marcus").

---

#### STORY-009: First visit to Goals and Activity on an empty workspace
*(was first-run-onboarding/STORY-009)*

**Type**: short
**Topic**: First run and onboarding
**Persona**: Priya Shah, exploring the nav after creating her first task
**Goal**: Understand what Goals and Activity are for.
**Preconditions**: One task exists; no goals or veins; Actor chosen.
**Ideal path**: 2 steps. Click **Goals**, click **Activity**.
**Alternate paths**: CLI `goals`, `veins`, `activity --limit 20`.
**Walkability**: `browser`
**Related**: STORY-044, STORY-128, STORY-132
##### Steps
1. Clicks **Goals** in `nav[aria-label="Workspace views"]` → the button gets `aria-pressed=true`. The **Assigned to**, **Status filter** and **Vein** filters stay visible but have no effect on Goals. The content shows heading "Goals" and "No goals yet. Start a vein with `pardner vein create --title … --goal …`."
2. Priya wonders what a "vein" is. Nothing in the UI defines it, and the empty state sends her back to the CLI.
3. Clicks **Activity** → "Workspace activity" lists "Priya Shah · human · task.create" with the task-title button and "Priya Shah · human · actor.register", each with a timestamp. The raw operation type names (`task.create`) are shown verbatim.
4. Clicks **Tasks** → back to the board. Her chosen view is persisted, so a reload would reopen the last view.
##### Variations
- After `node bin/pardner.js vein create --title 'Edge caching' --goal 'p95 under 200ms' --actor priya`, Goals shows "p95 under 200ms" with an **Open** pill and a vein button "Edge caching" with **Open** and "0 tasks". The **Vein** filter gains "Edge caching".
##### Edge Cases
- A goal created with `goal create` and no vein shows "No veins pursue this goal yet."
- Activity has no filter, paging or limit, so it grows without bound (the CLI `activity` defaults to 20).

---

#### STORY-010: A first-time user on loopback tries the pairing form instead of the token
*(was first-run-onboarding/STORY-010)*

**Type**: medium
**Topic**: First run and onboarding
**Persona**: Ana Ruiz, a product manager told by a colleague to "just pair with Pardner"
**Goal**: Connect her desktop browser to her own freshly started service.
**Preconditions**: Fresh service on her own machine; LAN access never enabled; she is on `http://127.0.0.1:8004/pardner/`.
**Ideal path**: 2 steps. On loopback, a well-designed UI would lead with the token (or auto-connect).
**Alternate paths**: The token form (STORY-001). There is no pairing path until a browser is already connected and LAN is enabled.
**Walkability**: `browser`
**Related**: STORY-001, STORY-006, STORY-107, STORY-108, STORY-116
##### Steps
1. Sees **Pairing code** with the primary **Pair this device**, and the helper "Open Pair another device on the desktop to get a code…". She *is* on the desktop, but there is no "Pair another device" button on this screen.
2. Types a guess "12345678" and clicks **Pair this device** → "Connecting…", then the alert "The pairing code is incorrect or expired. Generate a new code on the desktop.", "Check that the service is running. For a changed address, reopen Pair another device on the desktop." and **Retry connection** (enabled, because the code field is filled).
3. Clicks **Retry connection** → the same code is re-submitted and fails again. Each attempt counts toward the 10-per-minute throttle.
4. Notices the already-open **Connect with a local service token** section below, reads "Use the token from the service's connection.json file", and asks her colleague where that file is.
5. Opens `.pardner/connection.json` in a text editor, copies `token`, pastes it and clicks **Connect** → the workspace opens.
6. In the workspace, sees **Pair another device**. It is now clear that this is where pairing codes come from, for *other* devices.
##### Variations
- On a non-loopback address (for example a LAN IP), the token `<details>` is collapsed by default, which pushes users even harder toward pairing.
##### Edge Cases
- After 10 attempts in a minute: "Too many attempts. Wait a minute and try again." (HTTP 429).
- **Multi-surface:** the phrase "Pair another device" is used in the startup shell, the config-failure text, the connection helper and both connection-error texts, but the button exists only inside the connected workspace.

---

#### STORY-011: End-to-end first afternoon: from clone to a handed-off first task seen by the agent
*(was first-run-onboarding/STORY-011)*

**Type**: long
**Topic**: First run and onboarding
**Persona**: Priya Shah, setting Pardner up for herself and her coding agent "builder", and wanting proof that the agent can see what she assigns
**Goal**: Complete onboarding and one human-to-agent round trip.
**Preconditions**: A fresh clone; Node 24.11.1; nothing running.
**Ideal path**: 10 steps. Install, build, serve, connect, register two Actors, create, comment, agent reads.
**Alternate paths**: CLI-only task creation (STORY-005); `npm run sync` to serve; Vite dev server for the UI.
**Walkability**: `browser+cli`
**Related**: STORY-005, STORY-032, STORY-116, STORY-138
##### Steps
1. `npm ci` → dependencies installed.
2. `npm ci --prefix ui-prototype` → UI dependencies installed.
3. `npm run ui:build` → `ui-prototype/dist/` built.
4. `node bin/pardner.js serve --data .pardner` → JSON `"serving":true`, plus stderr listening logs.
5. Opens `http://127.0.0.1:8004/pardner/` → the connection screen.
6. Copies the token from `.pardner/connection.json` into **Local service token** → **Connect**.
7. The workspace shows the "Register your first human or agent Actor…" notice.
8. `node bin/pardner.js actors register priya --handle priya --kind human --display-name "Priya Shah" --actor priya` → success; the notice disappears live.
9. `node bin/pardner.js actors register builder --handle builder --kind agent --actor priya` → "builder · agent" appears in **Actor** live.
10. Chooses "Priya Shah · human" in **Actor**.
11. **New task** → Title "Draft the release checklist", Priority p1, Assignee "builder · agent" → **Create task** → the detail panel opens with "builder · agent · Backlog · P1".
12. In **Comment** (placeholder "Share progress or mention an Actor with @handle"), types "@builder please start with the CLI section" → **Add comment** → "Comments (1)" lists the comment with author and time.
13. In terminal: `PARDNER_ACTOR=builder node bin/pardner.js tasks --assignee builder --json` → the task is listed.
14. `PARDNER_ACTOR=builder node bin/pardner.js mentions pending` → one pending delivery for the comment's mention.
15. `PARDNER_ACTOR=builder node bin/pardner.js show <taskId> --json` → comments include Priya's text; `unreadCount` for builder is 1.
16. `node bin/pardner.js comment <taskId> 'On it — starting with the CLI section.' --actor builder` → in the browser, "Comments (2)" updates live. Priya's unread line shows "2 unread for priya". She is surprised: her own comment counts as unread for her, because reads are only explicit (the same behaviour is asserted in `test/pardner-ui.test.js`, where alice sees "1 unread" after her own comment).
17. Clicks **Mark displayed comments read** → "0 unread for priya".
18. Clicks **Activity** → entries for comment.add (builder), read.mark (Priya), comment.add (Priya), task.create and the two actor.register entries, newest first.
##### Variations
- Step 11 done via CLI `task create … --assignee builder --actor priya`: the card appears on the board live without a reload.
- Using **Hand off work** (Recipient "builder · agent", **Handoff status** Review, **Handoff message**) instead of a comment: this changes assignee and status and creates a mention in one operation.
##### Edge Cases
- Typing "@Builder" in the comment still works: mention parsing (`/@([A-Za-z][A-Za-z0-9_-]*)/`) lowercases the handle. "@build" or "@builder-bot" silently creates no mention, and there is no inline feedback.
- Forgetting step 10 makes **New task** disabled with no explanation (STORY-008).
- **Multi-surface:** the comment appears in the browser Comments list, CLI `show`/`comments`, Activity (comment.add) and History. The mention appears only in the CLI (`mentions pending`), with no UI indicator for the recipient.

---

#### STORY-012: Starting over with "Forget this workspace" during onboarding
*(was first-run-onboarding/STORY-012)*

**Type**: short
**Topic**: First run and onboarding
**Persona**: Theo Nakamura, who connected the browser to a scratch workspace by mistake and wants to point it at the real one
**Goal**: Clear the browser's stored credential and reconnect with a different token.
**Preconditions**: The browser is connected to workspace A; Theo has restarted the service on the same port with a different `--data` directory (workspace B).
**Ideal path**: 2 steps. Reload, then paste the new token.
**Alternate paths**: The **Forget this workspace** button exists in two places: on the connection screen (while "Opening your local workspace…") and in the workspace actions row.
**Walkability**: `multi-service` (restart the hub on a second `--data` dir)
**Related**: STORY-096, STORY-097, STORY-098, STORY-103
##### Steps
1. While still connected to A, clicks **Forget this workspace** in the workspace actions row → he returns immediately to the pairing/token screen with no confirmation. The credential, preferences (chosen Actor, view, filters) and any pending write for A are removed. The token on the service is not revoked.
2. Restarts the service with `--data .pardner-b`, then reloads the page → the config now reports workspace B's ID. The connection screen appears as if new. (Step 1 was not strictly needed: A's credential is keyed to A's workspace ID and would not have been used for B anyway.)
3. Pastes B's token from `.pardner-b/connection.json` → **Connect** → the workspace opens with B's Actors and "Choose an Actor".
##### Variations
- Clicking **Forget this workspace** while a request is pending: in the workspace header it is disabled while busy, but a saved pending request is still discarded if he forgets after the request settles.
##### Edge Cases
- A stale tab still on A during the restart gets `WORKSPACE_MISMATCH` and reloads its configuration, remounting into B's connection screen.
- **Multi-surface:** **Forget this workspace** appears both on the connection screen and in the workspace actions, next to **Pair another device**. It is the same action with different surroundings.

---

### Daily task work on the board

<details><summary>Topic background (from daily-board-work.md)</summary>

Source of truth: `ui-prototype/src/Pardner.jsx` (board 478-527, `TaskForm` 625-734, `TaskDetail` 735-1073, preferences 116-162), `ui-prototype/src/connection.js` (preferences in `localStorage` key `pardner:<workspaceId>:preferences`), `ui-prototype/src/pardner.css` (board grid 159-200, filtered board 392-397, mobile 473-528), `lib/cli.js` (`tasks`, `task create`, `update`), `lib/workspace-schema.js` (`normalizeFields`, `checkRevisions`), `lib/workspace-commands.js` (`newTask`: default `order = Date.parse(timestamp)`).

Seed assumed by these stories (see `docs/ux-paths/discovery.md`): Actors `alice` (human), `bob` (human), `builder` (agent), `reviewer` (agent); vein "Edge caching" for goal "p95 under 200ms"; service at `http://127.0.0.1:8004/pardner/`, connected with the local service token.

</details>

#### STORY-013: Create a fully specified task from the header
*(was daily-board-work/STORY-001)*

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Alice Moreno, staff engineer who triages work every morning and wants each new task fully specified before an agent picks it up.
**Goal**: Create a task with every field the UI offers (title, markdown description, status, priority, assignee, tags) and confirm it lands in the right column.
**Preconditions**: Workspace open; Actor `alice` registered; agent `builder` registered; no pending saved request.
**Ideal path**: 3 steps — open the form, fill the fields, submit; the fields are already in one panel so there's little room to shorten it further.
**Alternate paths**: CLI `pardner task create --title "…" --description "…" --status up-next --priority p1 --assignee builder --tags '["cache","perf"]' --actor alice` (`lib/cli.js:178`, `fields()` accepts every `TASK_FIELDS` entry, including `--tags` as JSON and `--vein`, which the UI cannot set). Raw `pardner operation --request '{"type":"task.create",…}'`.
**Walkability**: `browser`
**Related**: STORY-004, STORY-014, STORY-017, STORY-023, STORY-112, STORY-133
##### Steps
1. In the header **Actor** select (placeholder "Choose an Actor"), choose "alice · human" → **New task** becomes enabled (it is disabled with no Actor, while busy, or with a pending request).
2. Click **New task** → a right side panel with heading "New task" and a **Close** button opens. Any open Task details panel closes (`setSelected(null)`).
3. Type "Add cache-hit metrics to the edge proxy" into **Title** → the field is `required`.
4. In **Description** (a plain 5-row textarea with no preview), type:
   ```
   Track hit/miss per route.

   - [ ] emit `cache_hit` counter
   - [ ] dashboard panel
   ```
   → no rendering yet; Alice wonders whether the checklist will render (it will, in details, via remark-gfm).
5. In **Status** (default "Backlog"), choose "Up next".
6. In **Priority** (default `p2`; options are lowercase `p0`–`p3`), choose `p1`.
7. In **Assignee** (default "Unassigned"), choose "builder · agent".
8. In **Tags, separated by commas**, type "cache, perf, cache " → Alice adds "cache" twice by mistake.
9. Click **Create task** → header **SaveStatus** reads "Saving locally…", then "Saved locally · synced" (hub) once the disk barrier is reached.
10. The New task panel closes and **Task details** opens for the new task → heading "Add cache-hit metrics to the edge proxy", muted line "builder · agent · Up next · P1", rendered markdown with a bulleted checklist.
11. Click **Close** → the board shows the card in the **Up next** column, whose count went up by one, with "P1", the title, and "builder · agent".
##### Variations
- Leave every optional field at its default → the card lands in **Backlog** as "P2" with "Unassigned".
- Select "Completed" as the initial status → the task is created already closed; nothing warns about this.
- Choose an Actor such as "bob · human" in the header and leave **Assignee** "Unassigned" → the creator and the assignee are independent.
##### Edge Cases
- Tags: the duplicate "cache" and trailing spaces are trimmed and deduplicated (`tags.split(',').map(trim).filter(Boolean)` in the UI, `new Set` in `normalizeFields`). Tags are then **not shown on the card or in the details header**. They appear only when you reopen **Edit task** and in **History** as `tags: [] → ["cache","perf"]`. Alice can't confirm her tags went in without opening the editor.
- A title of only spaces passes the HTML `required` check, then the server rejects it with `INVALID_ARGUMENT` "title must be text with content". The error renders in the workspace-level `ErrorNotice` under the header, and the New task panel stays open with the draft intact.
- Veins cannot be set here. Alice must run `pardner vein add VEIN_ID TASK_ID --actor alice` afterwards.
- **Multi-surface:** after creation, assignee, status and priority are shown on the card ("P1" / "builder · agent" / column = status), in the details muted line ("builder · agent · Up next · P1"), in the **Edit task** form, and as `field: old → new` in **History**. Priority casing differs: lowercase `p1` in the form and uppercase `P1` on the card and in the details line.

---

#### STORY-014: Close the New task panel and discover the draft is gone
*(was daily-board-work/STORY-002)*

**Type**: short
**Topic**: Daily task work on the board
**Persona**: Bob Okafor, product designer who starts drafting a task, gets distracted, and expects his half-written draft to survive.
**Goal**: Leave the New task panel without creating a task, and later resume the draft.
**Preconditions**: Actor `bob` chosen; at least one existing task on the board.
**Ideal path**: 2 steps — dismiss, then reopen with the draft restored; currently restoring isn't possible.
**Alternate paths**: none found (no draft persistence for New task; `TaskForm` state is local React state).
**Walkability**: `browser`
**Related**: STORY-004, STORY-013, STORY-023, STORY-112, STORY-133
##### Steps
1. Click **New task**, type "Audit empty states on Goals" into **Title**, and start a **Description** → the "New task" panel shows the draft.
2. Press Escape out of habit → nothing happens. The Escape handler exists only in `TaskDetail` (`Pardner.jsx:784-790`), not in the New task panel.
3. Click an existing card on the board to check something → the New task panel closes (`setCreating(false)`) and Task details opens. No confirmation appears.
4. Click **Close**, then **New task** again → the form is empty: Title "", Status "Backlog", Priority `p2`. Bob's draft is lost.
##### Variations
- Click **Close** in the New task panel directly → same loss of the draft.
- Click **Activity**, then a task link → also replaces the panel (it sets `selected` without closing `creating`. Both panels are `position: fixed` on the right, and details renders after the form in the DOM, so it stacks on top).
##### Edge Cases
- Escape works on Task details but not on the New task panel, even though the two panels look identical.
- On a phone (≤760px) the panel is full width (`width: min(680px, 100%)`), so the board is hidden and an accidental tap outside isn't possible. Closing still discards the draft.

---

#### STORY-015: Narrow the board to "my reviews" with Assigned to + Status filter
*(was daily-board-work/STORY-003)*

**Type**: short
**Topic**: Daily task work on the board
**Persona**: Alice Moreno, who starts each day by reviewing only the work assigned to her that's waiting in Review.
**Goal**: See only tasks assigned to alice with status Review.
**Preconditions**: Several tasks across columns; at least one assigned to alice in Review and one assigned to bob in Review.
**Ideal path**: 1 step — a single "My reviews" preset; currently 2 (two selects).
**Alternate paths**: CLI `pardner tasks --assignee alice --status review --json` (filtering mirrors the UI, `lib/cli.js` `tasks`).
**Walkability**: `browser`
**Related**: STORY-016, STORY-046, STORY-047
##### Steps
1. In `nav[aria-label="Workspace views"]`, set **Assigned to** (default "All Actors") to "alice · human" → every column now counts only alice's tasks. Seven columns remain, most showing "No tasks here".
2. Set **Status filter** (default "All statuses") to "Review" → the board collapses to one centered **Review** column (`data-filtered="true"`, max 760px) showing only alice's review cards.
3. Click a card → Task details opens; Alice sees her review.
##### Variations
- Set **Status filter** first → one column with everyone's reviews, then narrowed by assignee.
- Use the header **Actor** select thinking it filters the board → it doesn't. **Actor** chooses who is *writing*; **Assigned to** filters. Two adjacent selects list the same Actor names with different meanings.
##### Edge Cases
- There is no "Unassigned" option in **Assigned to**. Its empty value means "All Actors" (`SelectActor` with `emptyLabel`), so Alice can't find tasks nobody owns. The CLI can't either (`--assignee` resolves an Actor, and `none` is accepted only by `update`/`create`).
- When filters hide everything, each column repeats "No tasks here". The board doesn't say a filter is active and has no "Clear filters" control.
- **Multi-surface:** the same Actor list appears in the header **Actor**, the nav **Assigned to**, the form **Assignee**, and **Recipient** in Hand off work. The labels are all "name · kind" with different empty labels: "Choose an Actor", "All Actors", "Unassigned".

---

#### STORY-016: Filters and view survive a reload, but the open task does not
*(was daily-board-work/STORY-004)*

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Priya Shah, engineering manager who keeps Pardner pinned in a tab and reloads after laptop sleep.
**Goal**: Confirm her chosen Actor, view and filters come back after a reload, and reopen the task she was reading.
**Preconditions**: Actor `alice` chosen (Priya uses alice's seat in this walk); vein "Edge caching" exists with at least one task linked.
**Ideal path**: 1 step — reload and land exactly where she was, open task included; currently 2 (reload, then reopen the task), because the selected task isn't persisted or in the URL.
**Alternate paths**: none found for restoring UI state. The CLI has no view state; `pardner tasks --assignee builder --status in-progress --vein VEIN_ID` reproduces the same list.
**Walkability**: `browser`
**Related**: STORY-007, STORY-015, STORY-046, STORY-047, STORY-076
##### Steps
1. Choose "alice · human" in **Actor**, set **Assigned to** to "builder · agent", **Status filter** to "In progress", and **Vein** to "Edge caching" → one **In progress** column with builder's edge-caching work.
2. Click the "Add latency instrumentation" card → Task details opens.
3. Reload the browser → the startup shell reads "Opening your workspace…", then "Opening your local workspace…", then the workspace.
4. Check the nav → **Actor** = alice, **Assigned to** = builder, **Status filter** = In progress, **Vein** = Edge caching. All of them persisted (`client.savePreferences({ actor, filter, statusFilter, veinFilter, view })`).
5. Look for the task panel → it is closed. `selected` isn't persisted, and the URL never changed, so the task can't be bookmarked or deep-linked.
6. Click the card again → Task details opens.
7. Click **Goals**, then reload → the app reopens on **Goals** (`view` persisted). The **Assigned to**, **Status filter** and **Vein** selects are still visible in the nav, with no effect on Goals.
8. Click **Tasks** → the board comes back with the same three filters still applied.
##### Variations
- Open the same `/pardner/` in a second tab → the tab shares `localStorage`, so it starts with Priya's filters. Changing a filter in either tab overwrites the shared preferences on the next change. There is no cross-tab sync, so the tabs drift.
- On a companion phone (`test/pardner-phone.test.js:78-93`): after closing the browser context and reopening `phoneUrl`, **Actor** = alice and **Status filter** = review are restored.
- Click **Forget this workspace** → preferences are deleted (`write(storage,'preferences',null)`) together with the credential. After reconnecting, every filter is back to its default.
##### Edge Cases
- If the "Edge caching" vein is ever missing from the document (for example after reconnecting to a different workspace), `activeVeinFilter` falls back to "" and the select shows "All veins". The stale ID still sits in preferences.
- If the remembered Actor no longer exists, `setActor('')` clears it (`Pardner.jsx:268-270`). **New task** and **Edit task** go disabled again until an Actor is chosen.
- Blocked storage: `savePreferences` throws, and the workspace `ErrorNotice` shows "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes." on every filter change.
- **Multi-surface:** the nav filters are rendered on Tasks, Goals and Activity, but only the board reads them. Activity always lists every operation regardless of **Assigned to**. Users may assume Activity is filtered.

---

#### STORY-017: Read a task with a rich markdown description and close with Escape
*(was daily-board-work/STORY-006)*

**Type**: short
**Topic**: Daily task work on the board
**Persona**: Dana Whitfield, QA engineer who reads acceptance criteria that agents wrote in markdown.
**Goal**: Read a description with GFM tables and checklists, then return to the board quickly.
**Preconditions**: Task created via CLI with `--description` containing a table, `- [x]` items, `**bold**`, and a link.
**Ideal path**: 2 steps — open the card, press Escape.
**Alternate paths**: **Close** button; CLI `pardner show TASK --json` (raw markdown in `task.description`).
**Walkability**: `browser`
**Related**: STORY-013
##### Steps
1. Click the task card → the side panel shows "Opening task…" briefly, then heading = title, a **SaveStatus** line, and the muted line "builder · agent · Review · P1".
2. Read the description → remark-gfm renders the table, checkboxes (disabled, read-only), bold and the link inside `.markdown` (max width 70ch).
3. Try to tick a checklist box → it doesn't toggle. Checklists are display-only, and the only way to change them is **Edit task** and editing the text.
4. Press Escape → the panel closes (document-level `keydown` listener).
##### Variations
- A task with an empty description → "No description yet." (it renders through Markdown as a paragraph).
- Raw HTML in the description is shown as text, not rendered (react-markdown default, no `rehype-raw`).
##### Edge Cases
- Escape closes the panel even while focus is inside the **Comment** or **Handoff message** textarea, or inside the **Edit task** form. See STORY-019.
- **Multi-surface:** the panel has its own **SaveStatus** in addition to the header **SaveStatus**. Both show the same text.

---

#### STORY-018: Change priority and status with Edit task and watch the card move
*(was daily-board-work/STORY-007)*

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Alice Moreno, reprioritising after a production incident.
**Goal**: Raise a Backlog task to P0 and move it to In progress, then confirm its new position in the column ordering.
**Preconditions**: Actor `alice` chosen. The **In progress** column holds "Add latency instrumentation" (P1) and "Rotate CDN keys" (P0, created earlier). The Backlog task "Purge stale edge objects" is P2.
**Ideal path**: 2 steps — change both fields directly on the card or in details (inline selects); currently 5.
**Alternate paths**: **Hand off work** with **Handoff status** "In progress" changes status (and requires a **Recipient** and a message). CLI `pardner update TASK --priority p0 --status in-progress --revisions '{"priority":["…"],"status":["…"]}'` (revisions come from `pardner show TASK`. The help line only shows `--status`, but `fields()` accepts every task field).
**Walkability**: `browser`
**Related**: STORY-019, STORY-029, STORY-062, STORY-118
##### Steps
1. Click "Purge stale edge objects" in **Backlog** → Task details opens: "Unassigned · Backlog · P2".
2. Click **Edit task** → an inline editor (`aria-label="Edit task"`) replaces the description with **Title**, **Description**, **Status**, **Priority**, **Assignee**, **Tags, separated by commas**, **Save changes** and **Cancel edit**. There is no "Edit task" heading.
3. Set **Priority** to `p0` and **Status** to "In progress".
4. Click **Save changes** → "Saving locally…", then the editor closes. The muted line reads "Unassigned · In progress · P0". Only the changed `priority` and `status` were sent, with their `expectedRevisions`.
5. Scroll to **History** → a new entry "alice · human · task.update" with `status: "backlog" → "in-progress"` and `priority: "p2" → "p0"`. Values are JSON-quoted.
6. Press Escape and look at **In progress** → "Rotate CDN keys" (P0) is first, then "Purge stale edge objects" (P0), then "Add latency instrumentation" (P1). Sorting is priority first, then `order`, which defaults to creation time, so older P0s stay above newer P0s.
##### Variations
- Click **Save changes** without changing anything → the editor just closes (no operation is sent).
- Alice wants "Purge stale edge objects" above "Rotate CDN keys" within P0 → the UI has no drag, reorder or move control. The only route is the CLI: `pardner update TASK --order 0 --revisions '{"order":["…"]}'` (`--order` is converted with `Number`).
##### Edge Cases
- Card-level edits aren't possible. Every priority or status nudge costs open → Edit task → change → Save → Close.
- The editor's **Status** select and the **Handoff status** select further down the same panel both change status, with different semantics: Edit leaves the assignee alone, while Hand off reassigns and comments.
- With no Actor chosen, **Edit task** is disabled (`canWrite` false) and the panel gives no hint why.

---

#### STORY-019: Lose an edit draft to Escape or an Actor switch
*(was daily-board-work/STORY-008)*

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Bob Okafor, rewriting a long task description while also covering for an agent.
**Goal**: Rewrite a description over several minutes without losing work.
**Preconditions**: Actors `bob` and `builder`; task "Draft caching runbook" open in details.
**Ideal path**: 3 steps — Edit task, type, Save changes.
**Alternate paths**: CLI `pardner update TASK --description "…" --revisions '{"description":["…"]}' --actor bob`.
**Walkability**: `browser`
**Related**: STORY-008, STORY-018, STORY-029, STORY-036, STORY-062, STORY-113, STORY-118
##### Steps
1. Click **Edit task** and start rewriting **Description** (several paragraphs).
2. Press Escape, intending to dismiss browser autocomplete → the whole Task details panel closes. The draft lived in `TaskDetail` state (`draft`) and is gone. No confirmation appears.
3. Reopen the card and click **Edit task** → the form is back to the saved description.
4. Retype part of the text, then switch the header **Actor** to "builder · agent" to check something on builder's behalf → `TaskDetail` is keyed `${selected}:${actor}`, so it remounts and the draft is lost again. The panel reloads with "Opening task…".
5. Switch **Actor** back to "bob · human", click **Edit task**, retype, and click **Save changes** → "Saved locally · synced".
##### Variations
- A half-typed **Comment** or **Handoff message** is discarded the same way by Escape or an Actor switch.
##### Edge Cases
- Unlike the pending-write mechanism (sessionStorage `pardner:<ws>:pending`), unsent drafts are never persisted. A reload also loses them.

---

#### STORY-020: Triage on a phone: scroll the board sideways and update a task
*(was daily-board-work/STORY-010)*

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Sam Reyes, on-call engineer checking the board on an iPhone (390×844) via a paired companion browser.
**Goal**: Find the review waiting for Sam, read it, and mark it Completed from the phone.
**Preconditions**: The phone is paired (see the LAN topic); Actor "alice · human" was remembered from a previous visit (Sam uses alice's seat in this walk); the board has tasks in all seven statuses.
**Ideal path**: 4 steps — filter, open, change status, save.
**Alternate paths**: Desktop browser; CLI `pardner update`.
**Walkability**: `multi-service` (needs LAN pairing; a 390×844 loopback viewport covers the layout half)
**Related**: STORY-041, STORY-086
##### Steps
1. Open the companion URL → the header stacks vertically. **Actor** and **New task** share a row, and the nav buttons **Tasks**, **Goals** and **Activity** wrap, followed by three full-width selects (**Assigned to**, **Status filter**, **Vein**). All controls are at least 44px tall, and inputs use 16px text so iOS doesn't zoom.
2. Scroll down past the header and nav → only the **Backlog** column and part of **Up next** fit. Columns are `minmax(230px, 75vw)`.
3. Swipe horizontally on the board → the board scrolls sideways (`overflow-x: auto`) while the page itself doesn't scroll horizontally (asserted by `scrollWidth <= innerWidth` in `test/pardner-phone.test.js`). Swiping across five columns to reach **Review** is tedious.
4. Instead, set **Assigned to** "alice · human" and **Status filter** "Review" → a single full-width **Review** column with "Review phone connection evidence".
5. Tap the card → Task details fills the screen (`width: 100%`, 20px padding).
6. Tap **Edit task**, set **Status** "Completed", and tap **Save changes** → the editor closes. The muted line reads "alice · human · Completed · P2".
7. Tap **Close** → the **Review** column is now empty ("No tasks here"), because the filter still says Review. The task lives under **Completed**.
##### Variations
- The service restarts mid-session → the banner reads "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." with **Retry connection**. The edit was already saved, and after reconnecting the CLI `show` reports `completed`.
- A lost response on save → "A request is awaiting confirmation." with **Retry saved request**, which replays the same operation ID.
##### Edge Cases
- Column headings with counts scroll away with the board. With seven columns at 75vw, Sam can't see which column he's in once he has scrolled sideways.
- The nav takes several screen-heights of 44px controls on the phone before the board starts.
- The phone has no Escape key, so **Close** at the top of the panel is the only way out. After scrolling down to **History**, Sam must scroll all the way back up.

---

#### STORY-021: A full morning on the board, from triage to wrap-up
*(was daily-board-work/STORY-011)*

**Type**: long
**Topic**: Daily task work on the board
**Persona**: Alice Moreno, who runs a mixed human/agent team. She plans the day on the board, delegates to `builder`, and tidies up before lunch.
**Goal**: Triage yesterday's work, create and refine new tasks, use filters to check each Actor's load, and leave the board in a clean state that persists for tomorrow.
**Preconditions**: Workspace connected; Actors `alice`, `bob`, `builder`, `reviewer`; vein "Edge caching"; about 10 tasks spread across Backlog, Up next, In progress and Review; previous preferences set to **Status filter** "Review".
**Ideal path**: about 18 steps — the core actions (3 creations, 2 edits, filter checks) can't shrink much, but having no card-level editing, no reorder and no tag display adds steps.
**Alternate paths**: The whole flow can be scripted with CLI `tasks`, `task create`, `update` and `show`. Status changes can also go through **Hand off work**.
**Walkability**: `browser+cli`
**Related**: STORY-022
##### Steps
1. Open `http://127.0.0.1:8004/pardner/` → "Opening your workspace…", then the workspace. The board opens with a single **Review** column because yesterday's **Status filter** "Review" persisted, and Alice briefly thinks the other columns vanished.
2. Set **Status filter** to "All statuses" → seven columns with counts.
3. Confirm the header **Actor** is "alice · human" (remembered).
4. Click **New task** → the "New task" panel opens.
5. Enter **Title** "Load-test the edge cache", a markdown **Description** with a `| route | target |` table, **Status** "Up next", **Priority** `p1`, **Assignee** "builder · agent", **Tags** "perf, load-test".
6. Click **Create task** → the panel closes and details opens: "builder · agent · Up next · P1", with the table rendered.
7. Realising it belongs to the "Edge caching" vein, Alice looks for a vein field in details and in **Edit task** → there is none. She copies the task ID from **Activity** (only titles are shown) or the CLI `pardner tasks --json`, then runs `pardner vein add VEIN_ID TASK_ID --actor alice`. Details then shows "Veins: Edge caching (Open)" and the card gets the vein label.
8. Press Escape → back to the board.
9. Click **New task** again and create "Write cache invalidation runbook" with defaults (Backlog, `p2`, Unassigned) → details opens.
10. Click **Edit task**, set **Assignee** "bob · human" and **Tags** "docs", then click **Save changes** → "bob · human · Backlog · P2".
11. Click **Close**.
12. Set **Assigned to** "builder · agent" → builder's tasks only. Alice counts three in **In progress** and decides that's too many.
13. Open the lowest-value in-progress card, "Investigate TLS handshake jitter" (P2) → **Edit task** → **Status** "Backlog", **Priority** `p3` → **Save changes**.
14. **History** shows "alice · human · task.update" with `status: "in-progress" → "backlog"` and `priority: "p2" → "p3"`. Press Escape.
15. Set **Assigned to** "bob · human" → bob's load, including the new runbook in **Backlog**.
16. Set **Assigned to** "All Actors" and **Vein** "Edge caching" → only the vein's tasks, now including "Load-test the edge cache".
17. In **Up next**, Alice wants "Load-test the edge cache" (P1, newest) above another older P1 → no reorder control exists. She accepts the creation-order tie-break or runs `pardner update TASK --order …` with revisions.
18. Click **Activity** → "Workspace activity" lists her `task.create`, `task.update` and `task.link-vein` operations newest first, with title buttons. The **Vein** filter is still displayed in the nav but doesn't affect this list.
19. Click the "Load-test the edge cache" button in Activity → details opens over the Activity view.
20. Press Escape and click **Tasks** → the board comes back with **Vein** = "Edge caching" still applied.
21. Set **Vein** "All veins" → the full board, ready for tomorrow.
22. Close the tab and reopen it the next morning → the board view and "All" filters are restored. No task panel is open.
##### Variations
- Alice does steps 12-15 with the CLI instead: `pardner tasks --assignee builder --status in-progress` gives the same counts in JSON.
- Instead of step 13's Edit, Alice uses **Hand off work** → **Recipient** "bob · human", **Handoff status** "Backlog", **Handoff message** "Parking this; pick up next sprint" → **Hand off**. This reassigns and adds a comment that mentions the recipient.
##### Edge Cases
- Step 1: a remembered single-column filter can look like missing data. Nothing on the board indicates an active filter beyond the select values.
- Step 7: the UI can't set veins, and Activity doesn't show task IDs, so there is a CLI round trip with an ID hunt (`tasks --json`).
- Tags entered in steps 5 and 10 never appear on any board or details surface, so they can't be used to filter either (neither UI nor CLI `tasks` filters by tag).
- If a write is pending (a lost response), **New task** stays disabled and every other change shows "Resolve the saved request before starting another change." until **Retry saved request** succeeds.
- **Multi-surface:** creation confirms in three places at once: the closing panel and opening details, the card in its column with the count incremented, and the Activity entry. Status is editable from two forms in one panel (**Edit task** → **Status**, and **Hand off work** → **Handoff status**), and is also mirrored by the nav **Status filter**, which uses the same seven labels.

---

#### STORY-022: An agent creates and grooms tasks entirely from the CLI while a human watches the board
*(was daily-board-work/STORY-012)*

**Type**: long
**Topic**: Daily task work on the board
**Persona**: `builder`, a coding agent driven by a harness with `PARDNER_ACTOR=builder`; observed by Alice in the browser.
**Goal**: Create a fully specified task, adjust its priority, tags and order, and filter its own queue. Every change should appear live on Alice's board.
**Preconditions**: Service running; `PARDNER_ACTOR=builder` exported; Alice's browser open on Tasks with all filters at defaults.
**Ideal path**: 4 commands — create, show, update, list.
**Alternate paths**: The same changes through the UI (STORY-013, STORY-018), or `pardner operation --request JSON`.
**Walkability**: `browser+cli`
**Related**: STORY-021
##### Steps
1. `pardner tasks --assignee builder --status in-progress --json` → `{ tasks: [...], status: {...} }` lists builder's in-progress work, the same as the UI's **Assigned to** + **Status filter**.
2. `pardner task create --title "Cache warmup on deploy" --description "Warm top 100 routes" --status up-next --priority p1 --assignee builder --tags '["cache","deploy"]' --vein VEIN_ID` → a JSON receipt with `result.taskId`. On Alice's board a card "P1 · Cache warmup on deploy · builder · agent · Edge caching" appears in **Up next** within a second, with no reload (WebSocket `document-state`).
3. The agent tries `--tags cache,deploy` first → `INVALID_ARGUMENT` "--tags must be valid JSON". The CLI requires a JSON array while the UI takes comma-separated text.
4. `pardner show TASK --json` → `task`, `revisions` (per-field operation IDs), `comments`, `history`, `conflicts`, `veins`, `evidence`.
5. `pardner update TASK --priority p0 --revisions '{"priority":["<rev>"]}'` → Alice's card jumps to the top of **Up next** (P0 sorts first). Her open details, if any, re-fetches its context and shows "· P0".
6. `pardner update TASK --order 0 --revisions '{"order":["<rev>"]}'` → within P0 the card now sorts above older P0 cards. This control isn't available in the UI.
7. Alice opens the card and checks **History** → "builder · agent · task.update" entries with `priority: "p1" → "p0"` and `order: 1730… → 0`.
8. The agent reruns step 5 with the old revision → `STALE_UPDATE` "This field changed since it was read; refresh its context", with `details.current` and `details.expected`.
9. `pardner update TASK --assignee none --revisions '{"assignee":["<rev>"]}'` → the card shows "Unassigned". On Alice's board, a filter of **Assigned to** "builder · agent" now hides it.
##### Variations
- Omit `--revisions` → `REVISION_REQUIRED` "Supply the observed field revisions".
- Use the legacy status `todo` or `in-review` → normalized to `backlog` or `review` (`normalizeFields`).
- `--priority P1` (uppercase, as the card displays it) → `INVALID_ARGUMENT` "Priority must be p0, p1, p2, or p3". The display casing doesn't match the accepted input.
##### Edge Cases
- The CLI help shows `update <task> --status status` only. Discovering that `--priority`, `--tags`, `--order`, `--title`, `--description` and `--assignee` also work requires reading `lib/cli.js`.
- **Multi-surface:** the same filter semantics exist twice, in the UI nav selects and in CLI `tasks --assignee/--status/--vein`. The CLI accepts a handle or ID for `--assignee`, while the UI shows display names.

---

### Human ↔ agent handoff round trip

<details><summary>Topic background (from human-agent-handoff.md)</summary>

Source code read for these stories: `ui-prototype/src/Pardner.jsx` (`TaskDetail`, `submit`, `ErrorNotice`, `SaveStatus`, WebSocket refresh), `lib/cli.js` (HELP and command dispatch), `lib/workspace-commands.js` (`prepareHandoff`, `commentParts`, `prepareCommit`), `lib/workspace-schema.js` (`checkRevisions`, `taskContext`, `resolveActor`), `lib/delivery-ledger.js`, `lib/workspace-runtime.js` (delivery forwarding), `lib/cli-trace.js`, `bin/pardner.js`, `docs/PARDNER-CLI.md`, `test/pardner-ui.test.js`, `test/pardner-cli-workflow.test.js`, `test/pardner-cli-mentions.test.js`.

Shared seed (from `docs/ux-paths/discovery.md`): hub on `127.0.0.1:8004/8005` with `--data .pardner-walk`; Actors `alice` (human), `bob` (human), `builder` (agent), `reviewer` (agent). `P="node bin/pardner.js --data .pardner-walk"`. Task IDs look like `task-` + 24 hex characters; revisions are operation IDs (UUIDs, or the `--operation-id` you supplied). Every CLI command prints one JSON line `{"success":true,...}` or `{"success":false,"error":{"code","message","details"}}` and also writes `CODE: message` to stderr.

Facts that recur across stories:
- A handoff (`task.handoff`) atomically writes `assignee` and `status`, adds the handoff message as a comment, and creates a mention delivery for the recipient even when the message has no `@handle` (`commentParts(..., recipient.id)`). Recipients are de-duplicated, so `--to reviewer` plus `@reviewer` in the message yields one `mentionIds` entry.
- The mention payload returned by `mentions claim-next` carries `id`, `taskId`, `commentId`, `toActorId`, `fromActorId`, `operationId`, `timestamp`, but **not** the comment text; the agent must run `show` to read the message.
- Reads (`show`, `comments`) never mark comments read; delivery `ack` does not mark comments read either. These are three separate notions: delivery lease, read receipt, task assignment.
- The UI has no mentions inbox. A human learns about work through the board (assignee on the card, the Review column count), the **Comments (N)** section and its "N unread for {handle}" line, and the Activity view.

</details>

#### STORY-023: Alice assigns a new task to the builder agent from the board
*(was human-agent-handoff/STORY-001)*

**Type**: short
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice, the human lead, at the loopback browser with Actor already set to "alice · human"
**Goal**: Put a concrete piece of work into the builder agent's queue.
**Preconditions**: Workspace connected, header shows "Saved locally · synced", Actors seeded, no pending request.
**Ideal path**: 3 — open the create form, fill title and assignee, submit; assignment at creation needs no separate handoff.
**Alternate paths**: CLI `pardner task create --title ... --assignee builder --actor alice`; or create Unassigned and use **Hand off work** (adds a comment + mention, which creation does not).
**Walkability**: `browser`
**Related**: STORY-004, STORY-013, STORY-014, STORY-112, STORY-133
##### Steps
1. Alice clicks **New task** in the header → the right side panel "New task" opens with **Close**, fields **Title**, **Description**, **Status** (Backlog), **Priority** (p2), **Assignee** ("Unassigned"), **Tags, separated by commas**.
2. She types Title "Add latency instrumentation", Description "Wrap the `/search` handler with a p95 histogram. Report numbers in a comment.", sets **Status** to "Up next", **Priority** "p1", **Assignee** "builder · agent" → fields hold her values.
3. She clicks **Create task** → header briefly shows "Saving locally…", the panel closes and the Task details panel opens on the new task: "builder · agent · Up next · P1", "No commit evidence linked yet.", **Comments 0**.
4. She glances at the board behind the panel → the **Up next** column count increments and the card shows "P1", "Add latency instrumentation", "builder · agent".
##### Variations
- She leaves Status as Backlog; the agent's `tasks --assignee builder` still lists it (the CLI filter does not care about status).
- She uses the **Assigned to** filter set to "builder · agent" to see the agent's full queue afterwards; this preference is remembered per workspace.
##### Edge Cases
- Creating with an assignee does **not** create a mention delivery: `mentions claim-next --actor builder` returns `{"claimed":false,"replayed":false}`. An agent that only polls mentions will never notice this task; it must also poll `tasks --assignee builder`. Alice may expect a notification that never happens (friction).
- If Alice has not chosen an Actor, **New task** is disabled; no explanatory text appears next to it.
- **Multi-surface:** the assignee appears on the card, in the detail header line, in History (`task.create` with `assignee: null → "builder"`), and in CLI `tasks`/`show`.

---

#### STORY-024: Builder agent discovers its queue and reads the task through the CLI
*(was human-agent-handoff/STORY-002)*

**Type**: short
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder`, a coding agent running in a terminal harness with `PARDNER_ACTOR` unset
**Goal**: Find work assigned to it and get enough context (description, revisions) to act.
**Preconditions**: STORY-023 done; the agent knows its Actor ID `builder` and the data directory.
**Ideal path**: 2 — list own tasks, show one.
**Alternate paths**: `pardner activity --actor alice --limit 5` to see what Alice just did; `pardner comments TASK` (comments only, no revisions); `pardner operation --request` cannot read.
**Walkability**: `cli-only`
**Related**: STORY-025, STORY-026, STORY-033, STORY-034, STORY-043, STORY-127
##### Steps
1. Agent runs `$P tasks --assignee builder --json` → `{"success":true,"tasks":[{"id":"task-9c41e0…","title":"Add latency instrumentation","status":"up-next","priority":"p1","assignee":"builder",...}],"status":{...,"savedLocally":true,"syncPending":false}}`.
2. Agent copies the ID and runs `$P show task-9c41e0… --actor builder --json` → full `task`, `comments: []`, `revisions` keyed by field (e.g. `"status":["4b7e…"]`, `"assignee":["4b7e…"]`), `conflicts: {}`, `history`, `veins`, `mentions`, `evidence: []`, `unreadCount: 0`, `status`.
3. The agent records `revisions.status` and `revisions.assignee` for later writes.
##### Variations
- Agent runs `tasks --assignee builder --status in-progress` to resume only active work.
- Agent passes the handle instead of the ID (`--assignee Builder`): handles resolve case-insensitively via `resolveActor`.
##### Edge Cases
- Agent omits `--actor` on `show`: the call succeeds but `unreadCount` equals the total comment count (it is computed for no observer), which can mislead a harness into thinking everything is unread.
- Typo `--assignee buidler` → `{"success":false,"error":{"code":"UNKNOWN_ACTOR","message":"Unknown Actor: buidler"}}`.
- Typo in the task ID → `NOT_FOUND`.
- `tasks` returns raw task records (including `conflicts`), not a summary; a large workspace means a large JSON line.

---

#### STORY-025: Builder claims, durably stores and acknowledges a handoff mention
*(was human-agent-handoff/STORY-003)* — **Merged sources:** comments-mentions/STORY-004 "An agent finds, claims and acknowledges its mention from the CLI"

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder` agent harness with its own on-disk inbox file
**Goal**: Receive Alice's handoff exactly once through the hub delivery ledger without losing it if the harness crashes.
**Preconditions**: Alice has handed the task to builder via the UI **Hand off work** form (STORY-027) or CLI; harness is connected to the hub (role `hub`).
**Ideal path**: 3 — claim, store, ack; reading the message (`show`) is the unavoidable fourth.
**Alternate paths**: `mentions pending --actor builder` (lists without leasing); `mentions release` to give a lease back; `mentions deliver` is an undocumented alias of `ack` in `lib/cli.js`.
**Walkability**: `cli-only`
**Related**: STORY-024, STORY-026, STORY-033, STORY-034, STORY-043, STORY-080, STORY-126, STORY-127
**Why merged**: Both are the agent `mentions pending` → `claim-next` → `show` → `ack` loop for one mention.
##### Steps
1. Harness polls `$P mentions pending --actor builder` → `{"success":true,"mentions":[{"id":"mention-5a0f…","taskId":"task-9c41e0…","commentId":"comment-…","toActorId":"builder","fromActorId":"alice","deliveryState":"pending",...}]}`.
2. Harness runs `$P mentions claim-next --actor builder --request-id inbox-poll-001` → `{"success":true,"claimed":true,"replayed":false,"mention":{...},"claimToken":"e2c1…","claimExpiresAt":1762520000000}`; the lease lasts 30000 ms by default.
3. The agent realises the mention has no message text. It runs `$P show task-9c41e0… --actor builder` and finds the comment whose `id` matches `mention.commentId`: "Please implement and record the evidence."
4. The harness writes the mention and comment text to its own inbox file and fsyncs.
5. Harness runs `$P mentions ack mention-5a0f… --actor builder --claim-token e2c1…` → `{"success":true,"acknowledged":true,"replayed":false}`.
6. Harness polls again with a **new** request ID `inbox-poll-002` → `{"claimed":false,"replayed":false}`; `mentions pending --actor builder` → `"mentions":[]`.
7. Back in the UI, Alice still sees "1 unread for alice"-style counts unchanged: the ack does not mark the comment read for builder (read receipts are separate; see STORY-029).
##### Variations
- Harness crashed after step 2 and retries with the **same** `--request-id inbox-poll-001` → same `claimToken`, `"replayed":true`.
- Harness takes longer than 30 s to store; it passes `--ttl-ms 120000` on claim (allowed range 100–300000).
- Two mentions queued: claim-next returns the oldest (`ORDER BY created_at, id`).
##### Edge Cases
- Ack after the lease expired → `{"error":{"code":"STALE_CLAIM","message":"The delivery claim has expired"}}`; another poll re-leases the same mention with a new token, and only the new token can ack (tested in `pardner-cli-mentions.test.js`).
- Ack with a token from a different claim → `STALE_CLAIM` "The delivery claim does not match".
- Reusing `inbox-poll-001` as `--actor reviewer` → `OPERATION_ID_REUSED` "This claim request belongs to another Actor".
- `claim-next` without `--actor` → `ACTOR_REQUIRED` "Supply --actor or PARDNER_ACTOR"; `mentions pending` without `--actor` silently lists every Actor's pending mentions.
- `--ttl-ms 500000` → `INVALID_ARGUMENT` "Claim lifetime must be between 100 and 300000 milliseconds".
- Acknowledgement is a delivery receipt, not an execution lock: the harness still needs its own idempotency for side effects (`docs/PARDNER-CLI.md`).
- **Multi-surface:** delivery state exists only in the hub SQLite ledger and the CLI; no UI surface shows pending/claimed/acknowledged.

##### Merged source: comments-mentions/STORY-004 — An agent finds, claims and acknowledges its mention from the CLI

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: `builder`, a coding agent that polls Pardner in its harness loop with `PARDNER_ACTOR=builder`
**Goal**: Pick up the comment that mentions it, read the context, act, and acknowledge the delivery so it is not redelivered.
**Preconditions**: Alice posted "The requirements are ready for @builder." on the task (STORY-034). Hub running. `.pardner-walk/connection.json` present.
**Ideal path**: 4 steps: claim-next, show, comment, ack. Every step is needed for at-least-once delivery.
**Alternate paths**: `pardner mentions pending --actor builder` to peek without leasing. The bridge (`pardner bridge run`) automates claim/ack for Codex sessions. `mentions deliver` is an undocumented alias for `ack`.

**Steps (from comments-mentions/STORY-004):**

1. `pardner mentions pending --actor builder --data .pardner-walk` → `{"mentions":[{"id":"mention-…","taskId":"task-…","commentId":"comment-…","toActorId":"builder","fromActorId":"alice",…,"deliveryState":"pending"}]}`.
2. `pardner mentions claim-next --request-id builder-loop-0142 --ttl-ms 60000 --actor builder` → `{"claimed":true,"replayed":false,"mention":{…},"claimToken":"…","claimExpiresAt":…}`.
3. The agent copies `mention.taskId` and runs `pardner show task-… --actor builder` → full context with `comments[]` (each has `id`, `content`, `revisionId`, `revisionIds`), `mentions`, and `unreadCount: 1`.
4. It does the work and replies: `pardner comment task-… 'Instrumentation landed behind a flag; @alice ready for a look.' --actor builder` → `{"success":true,"result":{"taskId":"task-…","commentId":"comment-…","mentionIds":["mention-…"]},"savedLocally":true,…}`.
5. `pardner mentions ack mention-… --claim-token TOKEN --actor builder` → `{"acknowledged":true,"replayed":false}`.
6. Optional hygiene: `pardner read task-… --receipts '[{"commentId":"comment-…","revisionId":"…"}]' --actor builder` → `{"result":{"taskId":"task-…","receipts":1}}`. Acknowledging a delivery does **not** mark the comment read.
7. `pardner mentions pending --actor builder` → `{"mentions":[]}`.

**Variations (from comments-mentions/STORY-004):**

- The harness crashes after step 2 and retries `claim-next` with the same `--request-id builder-loop-0142` → `"replayed":true` with the same token, while the lease is live.
- The agent cannot finish in time and runs `pardner mentions release mention-… --claim-token TOKEN --actor builder` → the mention is pending again.
- `PARDNER_ACTOR` is exported, so `mentions pending` without `--actor` filters to `builder` anyway.

**Edge Cases (from comments-mentions/STORY-004):**

- The lease expires before `ack` → "The delivery claim has expired" (`STALE_CLAIM`). It reappears in `pending` and must be re-claimed.
- Wrong or old token → "The delivery claim does not match" (`STALE_CLAIM`).
- Run on a replica while the hub is down → `HUB_UNAVAILABLE`. New delivery leases need the hub, although `comment` in step 4 still saves locally.
- Reusing a `--request-id` that belongs to another Actor → "This claim request belongs to another Actor" (`OPERATION_ID_REUSED`).

---

#### STORY-026: Builder releases a lease it cannot handle right now
*(was human-agent-handoff/STORY-004)*

**Type**: short
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder` agent whose sandbox is busy with another task
**Goal**: Return a claimed mention so it is redelivered promptly instead of waiting for lease expiry.
**Preconditions**: builder holds a live claim (`claimToken` from STORY-025 step 2).
**Ideal path**: 1 — release.
**Alternate paths**: let the lease expire (30 s default); the next `claim-next` re-leases it.
**Walkability**: `cli-only`
**Related**: STORY-024, STORY-025, STORY-033, STORY-034, STORY-043, STORY-127
##### Steps
1. Agent runs `$P mentions release mention-5a0f… --actor builder --claim-token e2c1…` → `{"success":true,"released":true,"replayed":false}`.
2. Agent runs `$P mentions pending --actor builder` → the mention is back with `"deliveryState":"pending"`.
3. Later the agent claims with a new request ID `inbox-poll-003` → `claimed: true` and a different `claimToken`.
##### Variations
- Releasing twice → second call `{"released":true,"replayed":true}`.
##### Edge Cases
- Release after expiry → `STALE_CLAIM` "The delivery claim has expired" even though the mention is effectively pending again; the agent may worry the mention is lost (it is not).
- Ack with the old token right after release → `STALE_CLAIM` "The delivery claim has expired" (the row is back in `pending`, so the `claimed` check fails). The wording says "expired" although the agent released it on purpose — misleading copy.

---

#### STORY-027: Alice hands off an existing task to builder from Task details
*(was human-agent-handoff/STORY-005)*

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice, human lead, at her desktop
**Goal**: Move "Add latency instrumentation" to builder, set it In progress, and explain what she wants, in one atomic action.
**Preconditions**: Task currently "alice · human · Backlog · P1"; Alice's Actor selected; no pending request.
**Ideal path**: 4 — open task, pick recipient, write message, submit (status default "Review" needs changing here, making it 5).
**Alternate paths**: **Edit task** (change Assignee + Status, then **Add comment** with `@builder`) — two operations, not atomic, and Edit creates no delivery unless the comment mentions builder; CLI `pardner handoff` (STORY-063).
**Walkability**: `browser`
**Related**: STORY-030, STORY-040, STORY-063, STORY-064
##### Steps
1. Alice clicks the card "Add latency instrumentation" in **Backlog** → Task details opens: "Opening task…" then title, SaveStatus, "alice · human · Backlog · P1", description, **Edit task**, **Hand off work**, **Comments 0**, "0 unread for alice", **Evidence**, **History**.
2. She scrolls to **Hand off work**. **Recipient** shows "Choose an Actor"; **Handoff status** shows "Review"; **Handoff message** is empty; **Hand off** is disabled.
3. She selects **Recipient** "builder · agent" → **Hand off** becomes enabled. (Focusing the form records the assignee/status revisions she is acting on.)
4. She hesitates over **Handoff status**: the default "Review" is wrong for starting work. She changes it to "In progress".
5. She types in **Handoff message**: "Please implement and record the evidence. Use the staging dataset, not prod."
6. She clicks **Hand off** → SaveStatus "Saving locally…", then the header line updates to "builder · agent · In progress · P1"; the message field clears; Recipient stays "builder · agent".
7. **Comments 1** now lists "alice · human", a timestamp, and her message rendered as markdown. The line below the heading reads "1 unread for alice": authors get no implicit read receipt, so her own handoff message counts as unread for her (friction).
8. **History** gains "alice · human · task.handoff" with `assignee: "alice" → "builder"` and `status: "backlog" → "in-progress"`.
9. She closes the panel with Escape → the card has moved to the **In progress** column showing "builder · agent".
##### Variations
- She leaves status at "Review" by mistake; the task lands in **Review** assigned to builder. She must hand off again or use **Edit task** to fix it.
- She includes "@reviewer FYI" in the message → `mentionIds` has two entries (builder and reviewer), both get deliveries.
- She hands off to herself (Recipient lists every Actor including the current one); this is allowed and creates a mention for herself.
##### Edge Cases
- Empty **Handoff message**: the textarea is `required`, so the browser's native "Please fill out this field" bubble appears; no Pardner message.
- She switches the header **Actor** select mid-draft → `TaskDetail` remounts (keyed by task and Actor) and the recipient, status and message draft are lost without warning.
- Another request is pending ("A request is awaiting confirmation.") → **Hand off** is disabled (`busy`) or rejected with "Resolve the saved request before starting another change." shown at the top of the workspace, not inside the panel.
- **Multi-surface:** the same handoff appears as a comment (Comments), a field change (History), a card move (board), an Activity entry ("alice · human · task.handoff" with a task button), and CLI `show`/`activity`/`mentions pending`.

---

#### STORY-028: Builder starts work, comments progress and links commit evidence while Alice watches live
*(was human-agent-handoff/STORY-006)*

**Type**: long
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder` agent in a Git checkout; Alice with Task details open in her browser
**Goal**: Do the work, show progress and attach a real commit so the human can trust it, ending in a handoff to reviewer.
**Preconditions**: STORY-027 done (task In progress, assigned to builder); builder acknowledged its mention (STORY-025); the agent's working directory is a Git repository with staged changes; Alice's browser shows "Saved locally · synced".
**Ideal path**: 5 — show, comment, commit-with-link, show, handoff; the revision bookkeeping is inherent to the safety model.
**Alternate paths**: `link-commit` for a commit made outside Pardner instead of `pardner commit`; `update --status` then `comment` instead of `handoff` (non-atomic, no automatic mention); Alice could perform the reviewer handoff from the UI.
**Walkability**: `browser+cli`
**Related**: STORY-122, STORY-123, STORY-127, STORY-130
##### Steps
1. Builder runs `$P show task-9c41e0… --actor builder` → `unreadCount: 1` (Alice's handoff comment), `revisions.status: ["<handoff-op>"]`, `revisions.assignee: ["<handoff-op>"]`.
2. Builder marks the handoff comment read: `$P read task-9c41e0… --actor builder --receipts '[{"commentId":"comment-…","revisionId":"<handoff-op>"}]'` → `success: true`. (It had to copy both IDs from `show`; there is no "mark all read" CLI shortcut.)
3. Builder comments: `$P comment task-9c41e0… 'Started. Histogram wired into `/search`; running the staging load test now.' --actor builder` → `result.commentId`, `mentionIds: []`, `savedLocally: true`.
4. In Alice's browser, within a moment and without reload, **Comments 2** shows "builder · agent" with that text; the line reads "2 unread for alice" (her own handoff comment plus builder's). The SaveStatus flickers "Saving locally…" then "Saved locally · synced" as the WebSocket delivers new heads.
5. Builder finishes the code and runs `$P commit --task task-9c41e0… --actor builder --model gpt-5 --session sess-42 -- -m 'feat: instrument /search latency'` → Git output on stderr; stdout `{"success":true,"trace":{...},"receipt":{"result":{"taskId":"task-9c41e0…","commitHash":"a1b2c3d…"},...}}`.
6. Alice's **Evidence** section replaces "No commit evidence linked yet." with `a1b2c3d…` and "feat: instrument /search latency"; History adds "builder · agent · task.link-commit" (no field changes listed).
7. Builder comments the numbers: `$P comment task-9c41e0… 'p95 dropped from 340ms to 180ms on staging. @alice numbers attached in the commit message.' --actor builder` → `mentionIds: ["mention-…"]` (Alice now has a delivery she will only see as an unread comment in the UI).
8. Builder re-runs `show` to get current revisions (nobody else touched assignee/status, so they are unchanged).
9. Builder hands off: `$P handoff task-9c41e0… --actor builder --to reviewer --status review --message 'Implementation is ready; please review the evidence. @alice FYI.' --revisions '{"assignee":["<handoff-op>"],"status":["<handoff-op>"]}' --operation-id handoff-builder-001` → `result.mentionIds` has two entries (reviewer, alice).
10. Alice's open panel updates live to "reviewer · agent · Review · P1"; **Comments 4**; History shows "builder · agent · task.handoff" `assignee: "builder" → "reviewer"`, `status: "in-progress" → "review"`.
11. Alice closes the panel; the card sits in **Review** with "reviewer · agent".
12. Alice opens **Activity** → newest first: "builder · agent · task.handoff", "builder · agent · comment.add", "builder · agent · task.link-commit", "builder · agent · comment.add", "builder · agent · read.mark", each with an "Add latency instrumentation" button.
13. She clicks one of those buttons → Task details reopens on the task (the view stays Activity behind it).
14. She clicks **Mark displayed comments read** → "0 unread for alice"; the button disables.
15. The reviewer agent picks up its delivery (STORY-025 steps with `--actor reviewer`).
##### Variations
- Commit made earlier by a human: builder runs `$P link-commit task-9c41e0… --commit '{"hash":"a1b2c3d","message":"feat: instrument /search latency"}' --actor builder`.
- Builder checks trace attribution with `$P trace task task-9c41e0…` → `{"taskId":...,"evidence":[...]}`, or `trace show a1b2c3d`.
- Alice is on a phone companion device; the same live updates arrive over LAN WebSocket.
##### Edge Cases
- `pardner commit` outside a Git repo → `GIT_REPOSITORY_REQUIRED` "Run this command inside a Git repository"; with nothing staged → `GIT_COMMIT_FAILED`.
- Git commit succeeds but the task link fails (e.g. service down) → error with `details.commitHash`, `traceRecorded: true`, `recovery: "Use link-commit with this existing commit; do not create another Git commit"`. The agent must not re-run `commit`.
- `link-commit` with `"hash":"HEAD"` → `INVALID_ARGUMENT` "Supply a git commit hash" (7–40 hex chars required).
- Retrying step 9 after a transport timeout with the same `--operation-id handoff-builder-001` and same payload → `replayed: true`; same ID with a changed message → `OPERATION_ID_REUSED`.
- Live updates drop: Alice sees "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." with **Retry connection**; the panel shows stale data until reconnect.
- **Multi-surface:** commit evidence appears in **Evidence**, in History (`task.link-commit`), in Activity, in `show.evidence`, `trace task`, and the `.agent-trace` record; the comment count appears as the "Comments N" heading and the unread line, which are computed differently (all comments vs. per-Actor unread).

---

#### STORY-029: Builder hands off with stale revisions and recovers correctly
*(was human-agent-handoff/STORY-007)*

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder` agent; Bob, a second human who edits the task meanwhile
**Goal**: Hand off to reviewer without overwriting a change Bob made after builder last read the task.
**Preconditions**: Builder fetched `show` (revisions R1) earlier; since then Bob, in the UI, used **Edit task** to set Status from "In progress" to "Up next" (he thinks it is blocked).
**Ideal path**: 3 — failed handoff, re-read, decide and hand off again; the failure is the designed safety stop.
**Alternate paths**: `pardner diff TASK` to see field changes with authors; `activity --task TASK`.
**Walkability**: `cli-only`
**Related**: STORY-018, STORY-019, STORY-062, STORY-118
##### Steps
1. Builder runs `$P handoff task-9c41e0… --actor builder --to reviewer --status review --message 'Ready for review.' --revisions '{"assignee":["R1a"],"status":["R1s"]}'` → exit 1, `{"success":false,"error":{"code":"STALE_UPDATE","message":"This field changed since it was read; refresh its context","details":{"current":["<bob-edit-op>"],"expected":["R1s"]}}}`.
2. Builder runs `$P diff task-9c41e0…` → `changes` includes `{"field":"status","old":"in-progress","new":"up-next","actorId":"bob",...}`.
3. Builder runs `show` again, reads Bob's comment "Blocked on staging access — leaving this in Up next", and decides the work is in fact done (access was granted).
4. Builder comments `'@bob staging access works now; the load test passed. Handing to reviewer.'`.
5. Builder retries handoff with fresh revisions from step 3 → success; task now "reviewer · agent · Review".
##### Variations
- Bob changed only the **Priority**: different-field edit, builder's handoff succeeds with old revisions because only assignee/status revisions are checked.
##### Edge Cases
- Builder omits `--revisions` → `INVALID_ARGUMENT` "Supply --revisions".
- Builder passes `--revisions '{"status":["R1s"]}'` without `assignee` → `STALE_UPDATE` on assignee (expected `[]` vs current).
- Malformed JSON → `INVALID_ARGUMENT` "--revisions must be valid JSON".
- Anti-pattern warned by `docs/PARDNER-CLI.md`: "Never silently retry a stale edit using freshly fetched revisions." A naive harness that auto-refetches and retries would overwrite Bob's decision.
- Bob and builder on different replicas while disconnected: no STALE_UPDATE locally; both edits survive as alternatives and the card shows **Conflicting edits** with "Resolve status" / **Keep this status** in Task details.

---

#### STORY-030: Human reviews an agent's work and closes the loop from the UI
*(was human-agent-handoff/STORY-009)*

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice, after the reviewer agent hands the task back to her
**Goal**: See the review result, check evidence, and mark the task Completed.
**Preconditions**: reviewer ran `pardner handoff task-9c41e0… --to alice --status review --message 'LGTM. One nit: histogram bucket names. @alice please complete.' …`; Alice has the board open with **Assigned to** "All Actors".
**Ideal path**: 4 — open the task, read, set status Completed, save.
**Alternate paths**: **Hand off work** to herself with **Handoff status** "Completed" (adds a comment); CLI `pardner update TASK --status completed --revisions …`.
**Walkability**: `browser+cli`
**Related**: STORY-027, STORY-040, STORY-063, STORY-064, STORY-104
##### Steps
1. Alice notices the **Review** column card now shows "alice · human". There is no badge for unread comments on cards, so she only knows to look because the assignee changed.
2. She opens the card → "alice · human · Review · P1" and an unread line such as "2 unread for alice" (comments since she last clicked **Mark displayed comments read**, including any of her own).
3. She reads reviewer's comment and checks **Evidence** (`a1b2c3d…`, "feat: instrument /search latency").
4. She clicks **Edit task**, sets **Status** to "Completed", clicks **Save changes** → header "alice · human · Completed · P1"; History "alice · human · task.update" `status: "review" → "completed"`.
5. She clicks **Mark displayed comments read** → "0 unread for alice".
6. She closes with **Close**; the card is in **Completed**.
##### Variations
- She disagrees: uses **Hand off work** → Recipient "builder · agent", status "In progress", message "Please rename buckets to `le_*` per reviewer." → builder gets a new delivery.
- She uses **Assigned to** "alice · human" to see only her items.
##### Edge Cases
- Mention deliveries addressed to alice remain `pending` in the hub ledger forever because no human harness acks them; `mentions pending` for all Actors grows with human items (friction for operators).
- Saving the Completed edit while the reviewer concurrently changes status → `STALE_UPDATE` alert at top; the editor keeps her draft.
- **Multi-surface:** Review column count, card assignee, detail header, History and Activity all reflect the reviewer's handoff.

---

#### STORY-031: Handoff comment deleted or edited after delivery was queued
*(was human-agent-handoff/STORY-011)*

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice, who handed off to the wrong agent's handle in the message; `reviewer` agent polling
**Goal**: Retract a mention before the agent acts on it.
**Preconditions**: Alice handed off to builder with message "@reviewer please also look" by mistake; reviewer has not claimed yet.
**Ideal path**: 2 — edit the comment to drop `@reviewer` (CLI), confirm pending list.
**Alternate paths**: `comment-delete` removes the whole handoff message (and builder's mention too). No UI path: comment edit/delete are CLI-only.
**Walkability**: `browser+cli`
**Related**: STORY-037, STORY-038, STORY-067, STORY-136
##### Steps
1. Alice looks for an edit control on her comment in Task details → none exists (only **Keep this comment** for conflicts). She switches to a terminal.
2. She runs `$P show task-9c41e0… --actor alice` to get the comment `id` and `revisionIds`.
3. She runs `$P comment-edit comment-… 'Please implement and record the evidence.' --revisions '["<handoff-op>"]' --actor alice` → `success: true`.
4. Reviewer polls `mentions pending --actor reviewer` → the mention is gone (tombstoned on the next ledger reconcile, because the active comment body no longer mentions reviewer).
5. Builder's mention is tombstoned as well, unless already acknowledged: `comment-edit` rebuilds the body with `commentParts(..., null, ...)`, so the handoff recipient is no longer in `mentionedActorIds` unless the new text says `@builder`.
##### Variations
- `comment-delete comment-… --revisions '["<handoff-op>"]'` removes the comment from the UI's **Comments** list; the assignee/status change from the handoff stays.
##### Edge Cases
- If reviewer already claimed or acknowledged, the retraction cannot recall it; acknowledged deliveries are never tombstoned.
- Editing the handoff comment to remove the recipient's implicit mention is surprising: the handoff recipient loses its delivery although the task is still assigned to it (friction / likely unintended).
- Wrong revisions → `STALE_UPDATE`.

---

#### STORY-032: Full round trip — human to agent to agent to human
*(was human-agent-handoff/STORY-012)*

**Type**: long
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice (UI), `builder` (CLI), `reviewer` (CLI)
**Goal**: Complete one task through three handoffs with deliveries acknowledged at each step and the human closing it.
**Preconditions**: Seeded workspace; Alice in UI with Actor "alice · human"; both agents run harness loops.
**Ideal path**: 12 — UI: create (3) + hand off (3); builder: claim/show/ack (3), commit (1), handoff (1); reviewer: claim/ack + handoff (≈3); Alice: mark complete (2). Revision copying adds overhead on each CLI write.
**Alternate paths**: All CLI as in `test/pardner-cli-workflow.test.js`; Alice could assign at creation (no delivery) instead of handing off.
**Walkability**: `browser+cli`
**Related**: STORY-005, STORY-011, STORY-116, STORY-138
##### Steps
1. Alice clicks **New task**, enters Title "Cache search results for 60s", **Assignee** "Unassigned", clicks **Create task** → Task details "Unassigned · Backlog · P2".
2. In **Hand off work** she selects **Recipient** "builder · agent", **Handoff status** "In progress", message "Implement a 60s cache; measure hit rate." → **Hand off**.
3. Header: "builder · agent · In progress · P2"; Comments 1.
4. Builder: `mentions claim-next --actor builder --request-id b-001` → `claimed: true`, `mention.taskId` matches.
5. Builder: `show TASK --actor builder` → reads the message, stores it, then `mentions ack MENTION --actor builder --claim-token TOKEN` → `acknowledged: true`.
6. Builder: `comment TASK 'Cache added behind a feature flag.'` → Alice sees it live; "2 unread for alice" (her own handoff message also counts).
7. Builder: `commit --task TASK --actor builder -- -am 'feat: 60s search cache'` → Alice's **Evidence** shows the hash.
8. Builder: `show TASK` for revisions, then `handoff TASK --to reviewer --status review --message 'Ready; hit rate 72% on staging.' --revisions '{"assignee":[…],"status":[…]}'`.
9. Alice's panel: "reviewer · agent · Review · P2"; if she had a draft in **Hand off work** open, the stale notice appears.
10. Reviewer: `mentions claim-next --actor reviewer --request-id r-001` → claims; `show`; `ack`.
11. Reviewer: `comment TASK 'Reviewed; TTL should be configurable. Otherwise good.'`.
12. Reviewer: `show` then `handoff TASK --to alice --status review --message 'Approved with a nit, back to @alice.' --revisions …`.
13. Alice's panel: "alice · human · Review · P2"; "5 unread for alice" (her handoff, builder's comment and handoff, reviewer's comment and handoff).
14. Alice clicks **Edit task**, **Status** "Completed", **Save changes**.
15. Alice clicks **Mark displayed comments read** → "0 unread for alice".
16. She switches to **Activity** and sees three "task.handoff" entries by alice, builder, reviewer.
17. Builder runs `mentions pending --actor builder` → `[]`; reviewer likewise `[]`; `mentions pending --actor alice` still lists the reviewer's mention to alice (no human harness acks it).
##### Variations
- Alice uses `Status filter` "Review" to watch only the review column during the loop.
##### Edge Cases
- Any agent that reuses its earlier request ID (`b-001`) for a later poll gets the old replayed result (`replayed: true`) instead of new work — a subtle harness bug.
- Agents that forget `--actor` on write commands get `ACTOR_REQUIRED` "Supply --actor or PARDNER_ACTOR"; setting `PARDNER_ACTOR=builder` once in the harness environment avoids repetition.
- **Multi-surface:** the round trip is visible in the board, Task details (header, Comments, Evidence, History), Activity, CLI `show`/`diff`/`activity`, and the hub delivery ledger — five places, none of which aggregates "what is waiting for me" for a human.

---

#### STORY-033: Human answers an agent's question by @mention instead of handoff
*(was human-agent-handoff/STORY-013)*

**Type**: short
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice; `builder` asked "@alice should the cache key include locale?"
**Goal**: Reply to the agent without changing assignment.
**Preconditions**: Task assigned to builder, In progress; builder's question is a comment.
**Ideal path**: 2 — type reply with `@builder`, add comment.
**Alternate paths**: **Hand off work** back to builder with the same status (changes nothing but adds a comment and a delivery; noisier history).
**Walkability**: `browser+cli`
**Related**: STORY-024, STORY-025, STORY-026, STORY-034, STORY-043, STORY-127
##### Steps
1. Alice opens the task; "1 unread for alice"; reads the question.
2. She types in **Comment** (placeholder "Share progress or mention an Actor with @handle"): "@builder yes, include locale." and clicks **Add comment** → comment appears; field clears.
3. Builder's next `mentions claim-next --actor builder --request-id b-014` returns the mention for this comment.
##### Variations
- Alice writes "@Builder" — handles are matched case-insensitively.
##### Edge Cases
- Alice writes "@build" (wrong handle): no mention is created and no error appears; the comment simply has `mentionIds: []`. The UI gives no feedback about whether a mention resolved (friction).
- Alice writes "builder, yes" without `@` → no delivery; builder only sees it if it re-reads `show`.

---

### Comments, mentions and read receipts

<details><summary>Topic background (from comments-mentions.md)</summary>

Source of truth for this topic:
- UI: `ui-prototype/src/Pardner.jsx` `TaskDetail` Comments section (lines ~964-1042), `submit` (271-323), Activity view (531-549), History (1056-1070).
- Operations: `lib/workspace-commands.js` `mentionedActors`, `commentParts`, `prepareComment`, `prepareCommentEdit` (also used for `comment.resolve`), `prepareCommentDelete`, `prepareRead`, `prepareHandoff`.
- Views: `lib/workspace-schema.js` `commentView`, `activeMentions`, `taskContext` (`unreadCount`), `checkRevisions`.
- CLI: `lib/cli.js` `comment`, `comments`, `comment-edit`, `comment-resolve` (accepted but not listed in HELP), `comment-delete`, `read --receipts`, `mentions pending|claim-next|ack|release`.
- Delivery: `lib/workspace-runtime.js` `prepareDelivery` and `lib/delivery-ledger.js` `reconcile` (an inactive mention is tombstoned).

Facts these stories depend on:
- Mentions match `@([A-Za-z][A-Za-z0-9_-]*)` against Actor **handles** (case-insensitive), not Actor IDs. Unknown handles are ignored and nothing tells the author.
- `unreadCount` counts every non-deleted comment that has any revision without a receipt from the observing Actor. **The author's own comments count as unread for the author.** With no Actor selected it equals the comment count.
- Receipts are recorded per Actor, comment and **revision**. An edit or resolve creates a new revision, so the comment becomes unread again for everyone, including the person who made the edit.
- Any Actor can edit, resolve or delete any comment. The UI keeps showing the original author (`comment.actorId`) and the creation time. `editedBy` is returned but not shown.
- The Task details **History** filters out `read.mark`. The **Activity** view does not, so it lists `read.mark` entries.
- The board **Conflicting edits** badge only reflects task-field conflicts. A comment conflict is visible only inside Task details.

</details>

#### STORY-034: Post a progress comment with an @mention for an agent
*(was comments-mentions/STORY-001)*

**Type**: short
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno, a human product lead who coordinates the release in the browser on her laptop
**Goal**: Tell the `builder` agent that requirements are ready, so the agent gets a delivery.
**Preconditions**: Hub running, Alice connected at `http://127.0.0.1:8004/pardner/`. Actors `alice`, `bob`, `builder`, `reviewer` registered. Task "Add latency instrumentation" exists in **In progress**.
**Ideal path**: 3 steps. Open the task, type the comment, submit it. The mention needs no separate action.
**Alternate paths**: CLI `pardner comment TASK 'The requirements are ready for @builder.' --actor alice`. Also `pardner handoff` with a mentioning message, or **Hand off** in the UI (both always mention the recipient).
**Walkability**: `browser`
**Related**: STORY-024, STORY-025, STORY-026, STORY-033, STORY-043, STORY-127
##### Steps
1. In the header **Actor** select, Alice picks "alice · human" → **New task** and the comment controls become enabled.
2. She clicks the "Add latency instrumentation" card in the **In progress** column → the **Task details** panel shows "Opening task…", then the title, "builder · in-progress · P1" and a **Comments** heading with count `0`. Below it: "0 unread for alice".
3. She clicks the **Comment** textarea (placeholder "Share progress or mention an Actor with @handle") and types `The requirements are ready for @builder. Spec is in the **description**.` → the text appears. The **Add comment** button is enabled.
4. She clicks **Add comment** → the header SaveStatus shows "Saving locally…" and then "Saved locally · synced". The textarea clears. A comment card shows "alice · human", the local time, and the rendered markdown with **description** in bold. The heading count becomes `1`.
5. She notices "1 unread for alice" under the heading and frowns. Her own comment counts as unread for her.
##### Variations
- Alice types `@Builder` → it still matches, because handles are compared in lowercase.
- Several handles in one comment (`@builder @reviewer please sync`) → one delivery for each mentioned Actor, sorted and deduplicated.
- Alice mentions herself (`@alice remind me`) → a delivery for `alice` is created like any other.
**Multi-surface:** Bob, who has the same task open on a phone paired over the LAN, sees the comment appear live through the WS subscription. His panel shows "1 unread for bob". A CLI `pardner mentions pending --actor builder` lists the new mention with `deliveryState: "pending"`.
##### Edge Cases
- She types `@buildr` by mistake → the comment saves, but no delivery is created and nothing warns her (`mentionedActors` silently drops unknown handles). She only finds out if she checks `mentions pending`.
- She types only spaces → the browser `required` check passes, the server rejects it with "Comment must be text with content" in the alert, and "Your last confirmed data remains available." The pending write is cleared (INVALID_ARGUMENT).
- An email address in the text such as `ping ops@builder.dev` matches `@builder` and creates a delivery for `builder`.
- No Actor selected → **Add comment** is disabled (`canWrite` false).

---

#### STORY-035: Mark a burst of comments read and confirm the count drops
*(was comments-mentions/STORY-002)*

**Type**: short
**Topic**: Comments, mentions and read receipts
**Persona**: Bob Okafor, a human reviewer catching up on a task after lunch
**Goal**: Clear his unread count on one task after reading the thread.
**Preconditions**: Task "Add latency instrumentation" has 3 comments from `builder` and `alice` that Bob has not marked read. Bob is connected in the browser.
**Ideal path**: 2 steps. Open the task, then mark as read. (Arguably 1 if opening the panel counted as reading. Pardner deliberately never marks implicitly.)
**Alternate paths**: CLI `pardner show TASK --actor bob` followed by `pardner read TASK --receipts '[...]' --actor bob`.
**Walkability**: `browser+cli`
**Related**: STORY-036, STORY-039, STORY-041
##### Steps
1. Bob picks "bob · human" in **Actor** and clicks the task card → the panel shows **Comments** `3` and "3 unread for bob". The **Mark displayed comments read** button is enabled.
2. He scrolls through the three comment cards and reads them.
3. He clicks **Mark displayed comments read** → "Saving locally…". After the panel re-fetches, the text reads "0 unread for bob" and the button turns disabled.
##### Variations
- Bob clicks the button before scrolling, expecting it to mark only what is on screen. It marks every comment returned for the task ("displayed" means loaded in the panel, not visible in the viewport).
- He closes the panel with Escape and reopens it → still "0 unread for bob". Receipts persist.
##### Edge Cases
- While he is reading, `builder` posts a fourth comment. The panel re-fetches on new heads, so the button marks all 4 current comments. If the click lands in the gap before the re-fetch, only the 3 observed comments are marked, and "1 unread for bob" remains afterwards.
- A saved request is still pending from an earlier failed write → the click shows "Resolve the saved request before starting another change." Nothing is marked.
- He opens **Activity** and sees a new "bob · human · read.mark" entry, although the task's **History** section does not show it.

---

#### STORY-036: Switch Actors to compare unread state between two humans
*(was comments-mentions/STORY-003)*

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno, checking whether Bob has caught up before she schedules a review, on a shared desktop where both humans sometimes work
**Goal**: See that read receipts belong to each Actor, and confirm what Bob still has unread.
**Preconditions**: Task "Add latency instrumentation" has 2 comments. Alice has marked both read. Bob has not.
**Ideal path**: 3 steps. Open the task, then switch the Actor select twice (to `bob` and back). A better design would show per-Actor read state without impersonating.
**Alternate paths**: CLI `pardner show TASK --actor bob` (read the `unreadCount` field) and `pardner show TASK --actor alice`. `pardner show TASK` with no Actor returns `unreadCount` equal to the comment count.
**Walkability**: `browser`
**Related**: STORY-008, STORY-019, STORY-035, STORY-039, STORY-041, STORY-113
##### Steps
1. Alice, with **Actor** set to "alice · human", opens the task → "0 unread for alice". **Mark displayed comments read** is disabled.
2. She wonders whether Bob saw her note. Pardner has no "seen by" list on comments.
3. She changes **Actor** to "bob · human" with the task panel still open → the panel re-requests `/automerge/task/:id/context?actor=bob` and shows "2 unread for bob". The button becomes enabled.
4. She hesitates over the enabled **Mark displayed comments read**. Clicking it would record receipts *as Bob*, with no confirmation.
5. She does not click. She changes **Actor** back to "alice · human" → "0 unread for alice" again.
6. She types `@bob two notes waiting here when you get a chance` in **Comment** and clicks **Add comment** → the comment appears, and the text now reads "1 unread for alice" (her own comment).
7. She switches to "bob · human" once more → "3 unread for bob".
8. She switches back to `alice`, clicks **Mark displayed comments read** → "0 unread for alice".
##### Variations
- She picks the blank "Choose an Actor" option → the text reads "3 unread for this Actor" (the comment count) and both write buttons are disabled.
- The Actor choice is remembered per workspace, so the next visit opens as whichever Actor she left selected. If she left it on `bob`, her next comment is attributed to Bob.
**Multi-surface:** Bob, on his own paired phone, sees "3 unread for bob" too. Receipts are per Actor, not per device.
##### Edge Cases
- Accidentally marking read as Bob cannot be undone. There is no "mark unread" operation in the UI, CLI or operation table.
- If another session removed an Actor, the select clears itself (`setActor('')` when the Actor is no longer in the doc).

---

#### STORY-037: Fix a typo in a comment with `comment-edit`
*(was comments-mentions/STORY-005)*

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno at her terminal, after noticing she wrote "p59" instead of "p95" in a comment
**Goal**: Correct the comment text without posting a second comment.
**Preconditions**: Alice's comment "Target is p59 under 200ms" exists on the task. Bob and `builder` have both marked it read.
**Ideal path**: 2 steps: an edit control on the comment and a save. The real path needs 3 CLI steps and copying a revision ID, because the browser has no edit control.
**Alternate paths**: `pardner operation --request '{"type":"comment.edit",…}'`. No UI path exists.
**Walkability**: `browser+cli`
**Related**: STORY-031, STORY-038, STORY-067, STORY-136
##### Steps
1. In the browser she looks for an edit control on her comment card. There is none (author, time and markdown only), so she opens a terminal.
2. `pardner comments task-… --data .pardner-walk` → `{"taskId":"task-…","comments":[{"id":"comment-…","content":"Target is p59 under 200ms","revisionId":"3c1f…","revisionIds":["3c1f…"],"conflicts":[],…}]}`.
3. `pardner comment-edit comment-… 'Target is p95 under 200ms' --revisions '["3c1f…"]' --actor alice` → `{"success":true,"result":{"taskId":"task-…","commentId":"comment-…"},…}`.
4. Back in the browser, the comment card now renders "Target is p95 under 200ms". Author and timestamp are unchanged, and there is no "edited" marker.
5. Bob's panel goes from "0 unread for bob" to "1 unread for bob". The new revision has no receipt. Alice's own panel also shows "1 unread for alice".
##### Variations
- She forgets `--revisions` → "Supply the observed field revisions" (`REVISION_REQUIRED`).
- She passes `--revisions '3c1f…'` without JSON brackets → the CLI's JSON parse error for `--revisions`.
- Her edit adds `@reviewer` → a new mention and delivery for `reviewer` is created. Mentions removed from the text become inactive and are tombstoned in the ledger the next time deliveries are prepared.
**Multi-surface:** The **Activity** view shows "alice · human · comment.edit" with the task button. Task **History** shows the same entry with no field-change lines.
##### Edge Cases
- `builder` edited the comment a moment earlier → "This field changed since it was read; refresh its context" (`STALE_UPDATE`, with `current` and `expected` in the JSON). She must re-run `comments` and retry.
- Bob can run `comment-edit` on Alice's comment. Nothing stops it, and the UI still credits "alice · human".
- The comment was already deleted → "Comment not found: comment-…" (`NOT_FOUND`).

---

#### STORY-038: Delete a mistaken comment and cancel its mention
*(was comments-mentions/STORY-006)* — **Merged sources:** credential-lifecycle-cleanup/STORY-010 "Delete a comment that leaked a secret (CLI only)"

**Type**: short
**Topic**: Comments, mentions and read receipts
**Persona**: Bob Okafor, who posted "@reviewer ship it" on the wrong task
**Goal**: Remove the comment so the reviewer agent is not sent to the wrong task.
**Preconditions**: Bob's comment exists on task "Add latency instrumentation". Its delivery to `reviewer` has not been acknowledged.
**Ideal path**: 2 steps: delete on the comment, then confirm. The real path is 3 CLI steps, because deletion is CLI-only.
**Alternate paths**: `pardner operation --request` with `comment.delete`. No UI path exists.
**Walkability**: `browser+cli`
**Related**: STORY-031, STORY-037, STORY-067, STORY-136
**Why merged**: Both delete a comment with CLI `comment-delete` (no UI path) and confirm its mention stops being delivered.
##### Steps
1. `pardner comments task-…` → he finds his comment's `id` and `revisionIds: ["9ab2…"]`.
2. `pardner comment-delete comment-… --revisions '["9ab2…"]' --actor bob` → `{"success":true,"result":{"taskId":"task-…","commentId":"comment-…"}}`.
3. In the browser the comment card disappears, the **Comments** count drops by one, and the unread counts drop for anyone who had not read it.
4. `pardner mentions pending --actor reviewer` → the mention no longer appears (tombstoned by `reconcile`).
##### Variations
- He wanted to post it on the right task too: he runs `pardner comment OTHER_TASK '@reviewer ship it' --actor bob` separately. There is no move operation.
##### Edge Cases
- `reviewer` had already claimed and acknowledged the delivery → the acknowledged row is kept (`tombstone` skips `acknowledged`). The agent may already have acted.
- The comment has concurrent edit alternatives → `CONFLICT_REQUIRES_RESOLUTION` ("Resolve the concurrent alternatives explicitly"). He must `comment-resolve` it before deleting.
- Deletion is permanent from the user's view. No restore command exists, though the `comment.add` operation stays in **Activity**.

##### Merged source: credential-lifecycle-cleanup/STORY-010 — Delete a comment that leaked a secret (CLI only)

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Builder, an agent Actor whose operator notices it pasted a staging DB URL with a password into a task comment
**Goal**: Remove the comment from the task view and stop its mention from being delivered.
**Preconditions**: Task "Add latency instrumentation" has a comment by `builder` containing "@reviewer staging is at postgres://app:hunter2@…"; the browser has the task open.
**Ideal path**: 2 (find the comment; delete it with a confirmation, ideally from the UI).
**Alternate paths**: `pardner operation --request '{"type":"comment.delete",…}'`. There is no UI delete. `comment-edit` can replace the text instead, but both keep the original in operation history.

**Steps (from credential-lifecycle-cleanup/STORY-010):**

1. The operator looks in Task details for a delete control on the comment → Only author, time and markdown are shown. Comment IDs are not visible.
2. Runs `pardner comments task-3f… --data .pardner --json` → Finds the comment's `id` (`comment-…`) and `revisionIds`.
3. Runs `pardner comment-delete comment-9a… --revisions '["<revision>"]' --actor builder` → `{"success":true,…,"result":{"taskId":"task-3f…","commentId":"comment-9a…"}}`.
4. The browser's Task details refreshes. The comment disappears and **Comments (N)** drops by one. The **Activity** view and **History** gain a `builder · agent · comment.delete` entry.
5. Reviewer's agent runs `pardner mentions pending --actor reviewer` → The mention from the deleted comment is no longer listed (`activeMentions` excludes deleted comments).

**Variations (from credential-lifecycle-cleanup/STORY-010):**

- The operator forgets `--revisions` → `REVISION_REQUIRED` "Supply the observed field revisions".
- Passes an outdated revision because someone ran `comment-edit` in between → `STALE_UPDATE` "This field changed since it was read; refresh its context".
- The comment has concurrent edits (UI shows **Keep this comment** choices) → `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly". The operator must first resolve via **Keep this comment** or `comment-resolve`, then delete.

**Edge Cases (from credential-lifecycle-cleanup/STORY-010):**

- Running the same delete twice with a new operation ID → `NOT_FOUND` "Comment not found: comment-9a…". Re-running with the same `--operation-id` returns the original receipt.
- **Not a scrub:** the text remains in Automerge history and the operation log, on every replica. The secret must still be rotated. The CLI help and the UI never say this.
- A human cannot do this from the UI at all, even for their own comment.

---

#### STORY-039: Mark read from the CLI with explicit receipts
*(was comments-mentions/STORY-007)*

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: `reviewer`, an agent that wants a clean unread count so its next poll only surfaces new discussion
**Goal**: Record receipts for exactly the comments it processed.
**Preconditions**: Task has 4 comments. `reviewer` has read none of them. `PARDNER_ACTOR=reviewer`.
**Ideal path**: 2 steps (show, then read). A `--all` shortcut would make it 1, but none exists.
**Alternate paths**: The browser **Mark displayed comments read** with **Actor** set to "reviewer · agent".
**Walkability**: `cli-only`
**Related**: STORY-035, STORY-036, STORY-041
##### Steps
1. `pardner show task-…` → `unreadCount: 4`, `comments[]` with `id` and `revisionIds`.
2. The agent builds the receipt list, one entry for each `(commentId, revisionId)` across all `revisionIds`.
3. `pardner read task-… --receipts '[{"commentId":"comment-a","revisionId":"r1"},{"commentId":"comment-b","revisionId":"r2"},{"commentId":"comment-c","revisionId":"r3"},{"commentId":"comment-d","revisionId":"r4"}]'` → `{"result":{"taskId":"task-…","receipts":4}}`.
4. `pardner show task-…` → `unreadCount: 0`.
5. `pardner show task-… --actor bob` → Bob's count is unchanged.
##### Variations
- It marks only comments a and b → `unreadCount: 2`. Partial receipts are fine.
- It submits the same receipts again with a new operation ID → accepted. Receipt keys are idempotent, so the count stays 0.
- `pardner comments task-…` does not return `unreadCount`. The agent must use `show`.
##### Edge Cases
- It uses a comment from a different task, or the revision of another comment → "A read receipt must refer to an observed revision of this task’s comment".
- It uses `revisionId` only for a comment with two concurrent `revisionIds` → that comment stays unread (`unreadCount: 1`) until every revision has a receipt.
- `--receipts` is not an array (for example a single object) → "Supply the observed comment revisions".
- Running `show` alone never marks anything read ("reads never mark comments seen", from the CLI help).

---

#### STORY-040: Hand off with a message that mentions a third Actor
*(was comments-mentions/STORY-009)*

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: `builder`, which drives the browser through an automated test harness (no agent/human distinction in the UI), handing work to `reviewer` and copying Alice
**Goal**: Move the task to Review for `reviewer` and notify Alice in the same atomic operation.
**Preconditions**: Task in **In progress**, assigned to `builder`. Panel open with **Actor** "builder · agent".
**Ideal path**: 4 steps: recipient, status (default Review), message, Hand off.
**Alternate paths**: `pardner handoff task-… --to reviewer --status review --message '… @alice' --revisions '{"assignee":[…],"status":[…]}' --actor builder`. Or two separate actions: **Edit task** and then **Add comment** (not atomic).
**Walkability**: `browser+cli`
**Related**: STORY-027, STORY-030, STORY-063, STORY-064
##### Steps
1. In **Hand off work**, it picks **Recipient** "reviewer · agent" → **Hand off** is enabled once the message is filled.
2. **Handoff status** stays at "Review".
3. **Handoff message**: `Instrumentation is ready; dashboards attached. @alice FYI for the rollout call.`
4. It clicks **Hand off** → "Saving locally…". The header line becomes "reviewer · review · P1", the task moves to the **Review** column, and a new comment card from "builder · agent" appears in **Comments** with the message.
5. `pardner mentions pending` (no Actor filter) → two new mentions for this comment: one for `alice` (from `@alice`) and one for `reviewer` (implicit recipient, with no `@reviewer` in the text).
6. Alice's panel shows "1 unread for alice". Reviewer's agent loop will pick up its delivery with `claim-next`.
##### Variations
- The message also says `@reviewer` → still one delivery for reviewer (the recipient set is deduplicated).
##### Edge Cases
- Bob changes the status from another tab while the form is focused → "Assignment or status changed while you were preparing this handoff. Your draft is preserved." **Hand off** stays disabled until **Use latest task details** is clicked. The message is kept.
- An empty handoff message → the browser's `required` validation blocks submission.

---

#### STORY-041: Comment and catch up across a phone and a desktop
*(was comments-mentions/STORY-010)*

**Type**: long
**Topic**: Comments, mentions and read receipts
**Persona**: Bob Okafor, reviewing from his phone on the office Wi-Fi in the morning and finishing at his desk in the afternoon
**Goal**: Keep up with a busy thread on mobile, reply with a mention, and find his read state consistent at the desk.
**Preconditions**: Alice (local admin) has enabled device access on the hub and paired Bob's phone with a code (390×844 viewport). Task "Add latency instrumentation" has 5 comments, all unread for Bob. Bob's desktop browser is also paired.
**Ideal path**: About 8 steps across two devices. An unread indicator on board cards would remove the step of opening each task to check.
**Alternate paths**: CLI `show --actor bob` from a laptop. The desktop browser alone.
**Walkability**: `multi-service`
**Related**: STORY-020, STORY-035, STORY-036, STORY-039, STORY-086
##### Steps
1. On the phone Bob opens `http://192.168.1.24:8004/pardner/`. His stored credential gives "Opening your local workspace…", then the board.
2. **Actor** is empty on this device (remembered per workspace per browser), so he picks "bob · human".
3. He scrolls the board sideways (columns at 75vw) to **In progress**. Cards show priority, title, assignee and veins, with **no unread indicator**, so he cannot tell which tasks have new comments.
4. He taps "Add latency instrumentation" → the full-width Task details panel. He scrolls past the description, **Edit task**, conflicts and **Hand off work** to reach **Comments** `5` and "5 unread for bob".
5. He reads three of five comments, then is pulled into a meeting.
6. He considers tapping **Mark displayed comments read**, but it would mark all five, including the two he skipped. He leaves it.
7. Later he taps the **Comment** textarea and types `@builder can you add the p99 series too?` → **Add comment** (44px touch target) → the comment appears and the count becomes "6 unread for bob" (his own comment).
8. At his desk he opens the same task in the desktop browser (Actor "bob · human" already remembered there) → "6 unread for bob". This matches the phone, because receipts live in the workspace, not the device.
9. He reads the remaining comments and clicks **Mark displayed comments read** → "0 unread for bob".
10. He glances at the phone, still open on the task → it updates live to "0 unread for bob".
11. `builder` replies "Added p99; see commit abc1234." → both devices show the new comment and "1 unread for bob".
12. He marks it read on the desktop.
**Multi-surface:** The phone is a companion device. It has no offline replica, so if the hub laptop sleeps, the phone shows "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." and cannot post comments until the service returns.
##### Variations
- On the phone he chooses the wrong Actor, "builder · agent" (adjacent in the select), and posts → the comment is attributed to builder. There is no edit or delete in the UI to fix it. He would need CLI `comment-delete`.
##### Edge Cases
- The phone's write fails mid-request on flaky Wi-Fi → "A request is awaiting confirmation." with **Retry saved request**. Retrying uses the same operation ID, so the comment is not duplicated.
- He clicks **Forget this workspace** on the phone → credential, preferences and the pending write are cleared. Receipts already recorded stay in the workspace.

---

#### STORY-042: Audit who discussed what in the Activity view vs task History
*(was comments-mentions/STORY-011)*

**Type**: short
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno, preparing a retro and checking how a discussion unfolded
**Goal**: See the sequence of comment operations on a task.
**Preconditions**: A task with `comment.add`, `comment.edit`, `comment.resolve` and several `read.mark` operations.
**Ideal path**: 2 steps: open the task's History, which should be filterable to comments.
**Alternate paths**: **Activity** view (all operations in the workspace). CLI `pardner activity --task task-… --limit 50` or `pardner timeline --task task-…`.
**Walkability**: `browser+cli`
**Related**: STORY-119, STORY-120, STORY-128, STORY-129, STORY-131, STORY-134
##### Steps
1. She opens the task and scrolls to **History** → entries like "builder · agent · comment.add" and "alice · human · comment.edit" with timestamps. There are no `read.mark` rows and no comment text or diff.
2. She clicks **Activity** in the nav → "Workspace activity" lists every operation newest first, including "bob · human · read.mark", each with a task-title button.
3. She clicks a task button under a `read.mark` row → Task details opens for that task.
4. To narrow it down she switches to the CLI: `pardner activity --task task-… --actor bob --limit 10` → JSON with `payload.comments` receipts, which shows exactly which revisions Bob marked.
##### Edge Cases
- The Activity view has no filter or pagination. On a long-lived workspace, `read.mark` noise from every Actor buries real comment events.
- The History rows show the operation type string (`comment.resolve`) rather than a human label, and nothing indicates which comment was affected.

---

#### STORY-043: Mention a newly registered agent and confirm delivery routing
*(was comments-mentions/STORY-012)*

**Type**: medium
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno, onboarding a new `qa-bot` agent mid-project
**Goal**: Register the agent, then mention it so its first delivery is waiting when the harness starts.
**Preconditions**: Hub running. Task "Add latency instrumentation" open in Alice's browser.
**Ideal path**: 3 steps: register, comment, verify. Registration is CLI-only.
**Alternate paths**: none found for registration outside the CLI (`actors register`, alias `agents register`).
**Walkability**: `browser+cli`
**Related**: STORY-002, STORY-003, STORY-024, STORY-025, STORY-026, STORY-033, STORY-034, STORY-115, STORY-124, STORY-127
##### Steps
1. In the browser she types `@qa-bot please smoke-test the flag` and nearly submits, then remembers the agent does not exist yet. She stops.
2. Terminal: `pardner actors register qa-bot --handle qa-bot --kind agent --display-name 'QA Bot' --actor alice` → `{"result":{"actorId":"qa-bot"}}`.
3. In the browser, **Actor** and **Recipient** selects now include "QA Bot · agent".
4. She clicks **Add comment** with the drafted text → the comment card shows "alice · human". The rendered text keeps `@qa-bot` as plain text (mentions are not linkified).
5. `pardner mentions pending --actor qa-bot` → one mention with `fromActorId: "alice"`.
##### Variations
- She registers the agent with ID `qa-bot` but handle `qa`. Then `@qa-bot` does **not** mention it, because only handles match. She needs `@qa`.
##### Edge Cases
- She had already posted `@qa-bot …` before registering → no mention was created, and registering afterwards does not retroactively create one. She must post again, or `comment-edit` the comment (the edit recomputes mentions).
- A handle collision such as `--handle builder` → "Actor handle already exists" (`ALREADY_EXISTS`).
- A handle with a dot such as `qa.bot` → rejected: "Actor handles must start with a letter and contain letters, numbers, underscores, or hyphens".

---

### Goals and veins

<details><summary>Topic background (from goals-veins.md)</summary>

Source of truth: `ui-prototype/src/Pardner.jsx` (`Goals`, Vein filter, card `vein-label`, Task details "Veins:" line), `lib/cli.js` (`goal`/`vein`/`goals`/`veins`/`task create --vein`), `lib/workspace-commands.js` (`prepareVeinCreate`, `recordEdit`, `linkChange`), `lib/workspace-schema.js` (`veinSummary.readyForVerdict`, `checkRevisions`), `docs/PARDNER-CLI.md` "Pursue goals through veins", tests `test/veins-goals.test.js`, `test/pardner-cli-veins.test.js`, `test/pardner-ui.test.js`.

Shared facts used below:
- `P="node bin/pardner.js --data .pardner-walk"`; Actors `alice` (human), `bob` (human), `builder` (agent), `reviewer` (agent).
- Mutations print `{"success":true,…,"result":{…}}`; errors print `{"success":false,"error":{"code","message","details"}}` on stdout and `CODE: message` on stderr, exit 1.
- The UI has **no** controls to create, edit, verdict, resolve, link or unlink goals/veins. Goals view is read-only; the only UI vein interactions are clicking a vein (switch to filtered board) and the **Vein** select.
- `readyForVerdict` = every concurrent vein status is `open` AND the vein has ≥1 linked task AND every linked task's every concurrent status is `completed`, `dead-end` or `abandoned`.
- `update`-style commands take `--revisions` as an object keyed by field (`'{"status":["op…"]}'`); `resolve` and `vein remove` take a JSON array.

</details>

#### STORY-044: Start a vein toward a brand-new goal and find it in the Goals view
*(was goals-veins/STORY-001)*

**Type**: short
**Topic**: Goals and veins
**Persona**: Alice, engineering lead (human), who just decided the team's latency target and wants it visible to everyone
**Goal**: Create the goal "p95 under 200ms" and the first vein "Edge caching" in one command, then see both in the browser.
**Preconditions**: Service running on `.pardner-walk`; Actors registered; Alice's browser is connected with **Actor** = alice; no goals exist.
**Ideal path**: 2 — one command that creates goal + vein, one click on **Goals** (a UI create form could make it 2 clicks without leaving the browser).
**Alternate paths**: `goal create --title 'p95 under 200ms'` then `vein create --title 'Edge caching' --goal GOAL_ID` (two operations); raw `operation --request '{"type":"vein.create",…,"payload":{"title":"Edge caching","goal":{"title":"p95 under 200ms"}}}'`.
**Walkability**: `browser+cli`
**Related**: STORY-009, STORY-128, STORY-132
##### Steps
1. In the browser, Alice clicks **Goals** in the `Workspace views` nav → heading "Goals" and the empty state "No goals yet. Start a vein with `pardner vein create --title … --goal …`." She notices the hint asks for a vein, not a goal, and pauses: does she need a goal first?
2. In a terminal she runs `$P vein create --title 'Edge caching' --goal 'p95 under 200ms' --actor alice` → `{"success":true,…,"result":{"veinId":"vein-…","goalId":"goal-…","createdGoal":true}}`. `createdGoal: true` confirms the title became a new goal.
3. Back in the browser (no reload; live WS update) → an article "p95 under 200ms" with status pill **Open**; under it a list item: button **Edge caching**, pill **Open**, "0 tasks". No "Ready for a verdict" (an empty vein has nothing to judge).
##### Variations
- Omit `--actor` and `PARDNER_ACTOR` → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`.
- Add `--description 'Serve cached reads from the edge'` → stored on the vein, but the Goals view never shows vein descriptions (only `vein show`). Goal descriptions are shown only when set via `goal create/update --description`.
**Multi-surface:** Created on the CLI, appears live in every connected browser including LAN companion devices; the **Vein** select in the nav gains "Edge caching".
##### Edge Cases
- Forgetting `--goal`: `$P vein create --title 'Edge caching' --actor alice` → `GOAL_REQUIRED: Every vein pursues a goal: supply --goal with a goal ID or a new goal title`.
- `--goal '  '` (blank) → `title must be text with content` style INVALID_ARGUMENT; nothing is created.
- A non-generated string that merely looks like an ID (`--goal goal-123`) does not match `goal-[a-f0-9]{24}` and silently becomes a goal titled "goal-123".

---

#### STORY-045: Add a second competing vein to an existing goal (and the duplicate-goal trap)
*(was goals-veins/STORY-002)*

**Type**: short
**Topic**: Goals and veins
**Persona**: Bob, backend engineer (human), who thinks rewriting the hot path beats caching
**Goal**: Start vein "Rewrite hot path" under the existing goal "p95 under 200ms".
**Preconditions**: STORY-044 done; Bob knows the goal title but not its ID.
**Ideal path**: 2 — find the goal ID, create the vein with it (a UI "Add vein" on the goal card would be 1).
**Alternate paths**: `$P goal show GOAL --json` to confirm before creating; `$P veins --json` to read `goalIds` off an existing vein.
**Walkability**: `browser+cli`
**Related**: STORY-048, STORY-051, STORY-052, STORY-069
##### Steps
1. Bob, assuming titles work like on create, runs `$P vein create --title 'Rewrite hot path' --goal 'p95 under 200ms' --actor bob` → success with `"createdGoal":true`. He doesn't notice the flag.
2. In the Goals view → two articles both titled "p95 under 200ms", each **Open**: the first holds **Edge caching**, the second **Rewrite hot path**. Bob realises he forked the goal.
3. He runs `$P goals --json` → two goal objects with the same title, different `id`s and `created_at`. He copies the older `id`.
4. There is no delete for veins or goals. Bob runs `$P vein update VEIN_REWRITE --goal GOAL_ORIGINAL --revisions '{"goalId":["OBSERVED"]}' --actor bob` using `goalId` revisions from `$P vein show VEIN_REWRITE --json` → the vein moves; Goals view now lists both veins under the original goal and the stray goal shows "No veins pursue this goal yet."
5. He closes the stray goal: `$P goal update GOAL_STRAY --status abandoned --revisions '{"status":["OBSERVED"]}' --actor bob` → the stray article drops to the bottom (sorted open → achieved → abandoned) with pill **Abandoned**.
##### Variations
- Correct first attempt: `$P vein create --title 'Rewrite hot path' --goal goal-<24 hex> --actor bob` → `"goalId"` equals the existing one, no `createdGoal`.
- Mistyped generated ID (`goal-000000000000000000000000`) → `NOT_FOUND: Goal not found: goal-0000…` (it is not turned into a title).
##### Edge Cases
- Duplicate goal titles are never deduplicated or warned about; the Goals view gives no ID or creator to tell them apart.
- The stray abandoned goal remains forever (no delete).

---

#### STORY-046: Jump from a vein in Goals to the board filtered to that vein
*(was goals-veins/STORY-003)* — **Merged sources:** daily-board-work/STORY-005 "Jump from a vein in Goals to a filtered board"

**Type**: short
**Topic**: Goals and veins
**Persona**: Priya, product manager (human, registered as `bob`'s colleague Actor `priya`), checking what work belongs to "Edge caching"
**Goal**: See only the tasks contributing to "Edge caching".
**Preconditions**: Vein "Edge caching" has 3 linked tasks; Priya's board currently has **Assigned to** = builder and **Status filter** = In progress from an earlier session (persisted in `pardner:<workspaceId>:preferences`).
**Ideal path**: 2 — click **Goals**, click the vein.
**Alternate paths**: On **Tasks**, pick "Edge caching" in the **Vein** select (but stale Assigned to / Status filters would still apply); CLI `$P tasks --vein VEIN --json`.
**Walkability**: `browser`
**Related**: STORY-015, STORY-016, STORY-047
**Why merged**: Both walk Goals → click vein button → board filtered to that vein, with the same filter-reset behaviour.
##### Steps
1. Click **Goals** → article "p95 under 200ms"; list item **Edge caching** · **Open** · "3 tasks".
2. Click the **Edge caching** button → view switches to **Tasks** (`aria-pressed`), **Assigned to** resets to "All Actors", **Status filter** resets to "All statuses", **Vein** shows "Edge caching". All seven columns return; only the 3 vein tasks are shown, each card carrying the accent "Edge caching" vein label.
3. Priya sees a card in **Dead end** and wonders whether that hurts the vein; she opens it → Task details shows "Veins: Edge caching (Open)".
##### Variations
- A task in two veins shows two vein labels on its card, e.g. "Edge caching" and "Rewrite hot path".
- A vein with 0 tasks: clicking it shows every column with "No tasks here".
##### Edge Cases
- Clicking the vein wipes the Assigned-to and Status filters she had set; there is no "back to previous filters".
- The vein name in Task details ("Veins: …") is plain text, not a link back to the vein or Goals view.
**Multi-surface:** At ≤760px the nav filters wrap full width and the board scrolls sideways at 75vw per column, so the 3 filtered cards may sit in off-screen columns.

##### Merged source: daily-board-work/STORY-005 — Jump from a vein in Goals to a filtered board

**Type**: short
**Topic**: Daily task work on the board
**Persona**: Marco Lindqvist, tech lead tracking whether the "Edge caching" vein is ready for a verdict.
**Goal**: See all tasks in the "Edge caching" vein on the board.
**Preconditions**: Goal "p95 under 200ms" with vein "Edge caching" linked to two tasks; Marco previously left **Status filter** = "Review".
**Ideal path**: 1 step — clicking the vein; the code does exactly that.
**Alternate paths**: Choose "Edge caching" in the nav **Vein** select on Tasks (does *not* clear other filters); CLI `pardner tasks --vein VEIN_ID`.

**Steps (from daily-board-work/STORY-005):**

1. Click **Goals** → the "Goals" heading, an article "p95 under 200ms" with an "Open" pill, and a list item with the **Edge caching** button, "Open", "2 tasks".
2. Click **Edge caching** → the view switches to **Tasks**. `showBoard({ vein })` resets **Assigned to** to "All Actors" and **Status filter** to "All statuses", and sets **Vein** to "Edge caching". Cards show the "Edge caching" vein label.
3. Set **Vein** back to "All veins" → the full board returns.

**Variations (from daily-board-work/STORY-005):**

- Pick **Vein** = "Edge caching" from the nav instead while **Status filter** = "Review" is still set → only edge-caching tasks *in Review* show, possibly none. Marco may think the vein has no tasks.

**Edge Cases (from daily-board-work/STORY-005):**

- **Multi-surface:** a task's vein membership appears as a card `vein-label`, as the "Veins: Edge caching (Open)" line in details, and as "N tasks" in Goals. None of them are editable in the UI.

---

#### STORY-047: Use the Vein filter directly on the board and clear it
*(was goals-veins/STORY-004)*

**Type**: short
**Topic**: Goals and veins
**Persona**: Bob (human) triaging his own work
**Goal**: See his in-progress tasks in "Rewrite hot path", then return to everything.
**Preconditions**: Two veins exist; Bob has tasks in both and outside them.
**Ideal path**: 3 — set Assigned to, set Vein, (later) reset Vein.
**Alternate paths**: Goals → click vein (resets the other filters, STORY-046); CLI `$P tasks --assignee bob --vein VEIN --status in-progress --json`.
**Walkability**: `browser+cli`
**Related**: STORY-015, STORY-016, STORY-046
##### Steps
1. On **Tasks**, choose **Assigned to** → "bob · human" → board shows only Bob's cards.
2. Choose **Vein** → "Rewrite hot path" (options are sorted by title after "All veins") → cards outside the vein disappear; column counts update.
3. Choose **Status filter** → "In progress" → the board collapses to the single **In progress** column (`data-filtered`).
4. Reload the page → all three filters are restored from preferences.
5. Choose **Vein** → "All veins" → Bob's in-progress cards outside any vein reappear.
##### Variations
- The Vein select lists every vein regardless of status, including **Proven**, **Dead end** and **Abandoned** veins, with no status hint.
##### Edge Cases
- Two veins with the same title (e.g. "Edge caching" created twice) appear as two identical options.
- If the stored vein no longer exists in the snapshot (e.g. different workspace), the filter silently falls back to "All veins".
- CLI `tasks --vein 'Rewrite hot path'` (a title) returns `{"tasks":[]}` with no error — only IDs match.

---

#### STORY-048: Agent files tasks into veins from the CLI and they show up labelled
*(was goals-veins/STORY-005)*

**Type**: medium
**Topic**: Goals and veins
**Persona**: `builder`, a coding agent working through the CLI with `PARDNER_ACTOR=builder`
**Goal**: Create one task that contributes to both latency veins, one task in a single vein, and link an existing task.
**Preconditions**: Veins "Edge caching" (VEIN_A) and "Rewrite hot path" (VEIN_B) exist; existing task "Cache headers" (TASK_C) has no vein.
**Ideal path**: 3 — one create with two veins, one create with one vein, one link.
**Alternate paths**: `task create` without `--vein` then `vein add` per vein; raw `operation` with `task.create` `veinIds` or `task.link-vein`. The browser **New task** form has no vein field, so a human creating in the UI must link via CLI afterwards.
**Walkability**: `browser+cli`
**Related**: STORY-045, STORY-051, STORY-052, STORY-069
##### Steps
1. `$P veins --json` → array of veins with `id`, `title`, `status`, `goalIds`, `taskIds`, `readyForVerdict`. Builder copies the two IDs.
2. `$P task create --title 'Add latency instrumentation' --priority p1 --status in-progress --assignee builder --vein VEIN_A,VEIN_B` → `"result":{"taskId":"task-…","veinIds":["vein-A…","vein-B…"]}`.
3. `$P task create --title 'Benchmark the cache hit path' --vein VEIN_A` → one vein ID in result.
4. `$P vein add VEIN_A TASK_C` → `"result":{"taskId":"TASK_C","veinId":"VEIN_A"}`.
5. `$P tasks --vein VEIN_A --json` → three tasks.
6. Alice in the browser, on **Tasks** with all filters cleared, sees "Add latency instrumentation" in **In progress** with priority **P1**, "builder · agent", and two vein labels "Edge caching" and "Rewrite hot path".
7. She opens it → Task details: "builder · agent · In progress · P1" and "Veins: Edge caching (Open), Rewrite hot path (Open)". **History** shows `task.create`.
8. She opens "Cache headers" → its History shows a `task.link-vein` entry by builder with no field-change lines.
9. She clicks **Activity** → "builder · task.link-vein" with a "Cache headers" button; "builder · task.create" entries link their tasks.
10. On **Goals**: **Edge caching** now "3 tasks", **Rewrite hot path** "1 task".
##### Variations
- Spaces in the list (`--vein 'VEIN_A, VEIN_B'`) are trimmed; duplicates are de-duplicated.
- `vein add` on an already-linked task succeeds again and adds another `task.link-vein` to Activity.
##### Edge Cases
- `--vein 'Edge caching'` (title) → `INVALID_ARGUMENT: Vein ID must be a nonempty identifier` (space) and the task is not created.
- `--vein vein-typo` → `NOT_FOUND: Vein not found: vein-typo`; the whole create fails, not just the link.
- `vein add VEIN_A task-missing` → `NOT_FOUND: Task not found: task-missing`.
- Adding a task to a vein already judged **Proven** is allowed with no warning.
**Multi-surface:** CLI writes; browser board, details, Activity and Goals counts update live.

---

#### STORY-049: Close the last task in the UI, see "Ready for a verdict", record the verdict on the CLI
*(was goals-veins/STORY-006)*

**Type**: medium
**Topic**: Goals and veins
**Persona**: Alice (human lead) wrapping up the caching experiment
**Goal**: Finish the vein's work and declare "Edge caching" **Proven**.
**Preconditions**: VEIN_A has 3 tasks: two already **Completed**, "Benchmark the cache hit path" in **Review**.
**Ideal path**: 3 — set the task's status, see the readiness flag, record the verdict (a UI verdict control would avoid the terminal and the revisions lookup).
**Alternate paths**: CLI `update TASK --status completed --revisions …` for the task; `vein update` is the only verdict route (raw `operation` with `vein.update` is equivalent).
**Walkability**: `browser+cli`
**Related**: STORY-050, STORY-054, STORY-056, STORY-057
##### Steps
1. On **Goals**, Alice sees **Edge caching** · **Open** · "3 tasks" with no flag. She clicks it → filtered board; "Benchmark the cache hit path" in **Review**.
2. She clicks the card → Task details → **Edit task** → **Status** → "Completed" → **Save changes** → "Saving locally…" then "Saved locally · synced"; the card moves to **Completed**.
3. Back on **Goals** → **Edge caching** now shows the warning-coloured "Ready for a verdict". The vein pill still reads **Open** — readiness never sets the verdict.
4. She looks for a button to record the verdict and finds none. She opens the terminal.
5. `$P vein show VEIN_A --json` → `"vein":{…,"status":"open","readyForVerdict":true}`, `"revisions":{"status":["op-…"],…}`, `"goal":{"title":"p95 under 200ms",…}`, `"tasks":[…]`.
6. First attempt she types `--revisions '["op-…"]'` (array, as in `resolve`) → `REVISION_REQUIRED: Supply the observed field revisions`. She re-reads help.
7. `$P vein update VEIN_A --status proven --revisions '{"status":["op-…"]}' --actor alice` → `"result":{"veinId":"VEIN_A"}`.
8. Goals view → **Edge caching** pill **Proven** (accent colour), "Ready for a verdict" gone. The goal "p95 under 200ms" is still **Open**.
9. Opening any vein task → "Veins: Edge caching (Proven)".
##### Variations
- Verdict `dead-end` → pill **Dead end**; `abandoned` → **Abandoned**.
- The last task ended as **Dead end** or **Abandoned** instead of Completed still triggers "Ready for a verdict".
##### Edge Cases
- `--status completed` (a task status) → `INVALID_ARGUMENT: Vein status must be one of: open, proven, dead-end, abandoned`.
- Reusing revisions read before someone else's edit → `STALE_UPDATE: This field changed since it was read; refresh its context`.
- Reopening a task (Completed → In progress) removes "Ready for a verdict" again; after a verdict, reopening does nothing visible.
- Recording a verdict while tasks are still open is allowed — the flag is a prompt, not a gate.
**Multi-surface:** Task closed in the browser, verdict on CLI, result visible in browser Goals view and Task details.

---

#### STORY-050: Mark the goal achieved separately after a proven vein
*(was goals-veins/STORY-007)*

**Type**: short
**Topic**: Goals and veins
**Persona**: Alice (human lead)
**Goal**: Close "p95 under 200ms" as **Achieved** and stop the competing vein.
**Preconditions**: "Edge caching" is **Proven**; "Rewrite hot path" is **Open** with one in-progress task.
**Ideal path**: 3 — goal status, abandon competing vein (with revision lookups folded in by a UI it would be 2 clicks).
**Alternate paths**: `goal resolve` only when there is a conflict; raw `operation` `goal.update`.
**Walkability**: `browser+cli`
**Related**: STORY-049, STORY-054, STORY-056, STORY-057
##### Steps
1. `$P goal show GOAL --json` → `"goal":{"status":"open",…}`, `"revisions":{"status":["op-…"]}`, `"veins":[…both…]`, `"history":[…]`.
2. `$P goal update GOAL --status achieved --revisions '{"status":["op-…"]}' --actor alice` → success. Goals view: the goal pill turns **Achieved** and the article sorts below open goals.
3. She notices **Rewrite hot path** still **Open** under an achieved goal. `$P vein show VEIN_B --json` for revisions, then `$P vein update VEIN_B --status abandoned --revisions '{"status":["op-…"]}' --actor alice` → pill **Abandoned**.
4. The in-progress task in VEIN_B remains on the board in **In progress**; nothing cascades to tasks.
##### Variations
- `$P goals --status achieved --json` lists it; `$P veins --goal GOAL --status open --json` finds veins left dangling.
##### Edge Cases
- `--status proven` on a goal → `Goal status must be one of: open, achieved, abandoned`.
- Using the same goal revisions twice (e.g. achieved then abandoned) → `STALE_UPDATE`.
- A proven vein never auto-closes the goal; an achieved goal never closes its veins or tasks.

---

#### STORY-051: Remove a task that was linked to the wrong vein
*(was goals-veins/STORY-008)* — **Merged sources:** credential-lifecycle-cleanup/STORY-011 "Remove a task from the wrong vein"

**Type**: medium
**Topic**: Goals and veins
**Persona**: `reviewer`, a review agent that notices "Cache headers" really belongs to "Rewrite hot path"
**Goal**: Unlink TASK_C from VEIN_A and link it to VEIN_B.
**Preconditions**: TASK_C linked to VEIN_A only.
**Ideal path**: 2 — unlink, link (a UI vein picker in Task details would be 1).
**Alternate paths**: Read link revisions from `$P vein show VEIN_A --json` (`tasks[].linkRevisions`) instead of `show TASK_C`; raw `task.unlink-vein` operation.
**Walkability**: `browser+cli`
**Related**: STORY-045, STORY-048, STORY-052, STORY-069
**Why merged**: Both unlink a task from the wrong vein with `vein remove` and link it to the right one with `vein add`.
##### Steps
1. `$P vein remove VEIN_A TASK_C --actor reviewer` → `INVALID_ARGUMENT: Supply --revisions`.
2. `$P show TASK_C --actor reviewer --json` → `"veins":[{"id":"VEIN_A","title":"Edge caching","status":"open","goalId":"goal-…","linkRevisions":["op-link"]}]`.
3. Reviewer passes the object shape by habit: `--revisions '{"link":["op-link"]}'` → `REVISION_REQUIRED: Supply the observed field revisions`.
4. `$P vein remove VEIN_A TASK_C --revisions '["op-link"]' --actor reviewer` → `"result":{"taskId":"TASK_C","veinId":"VEIN_A"}`.
5. `$P vein add VEIN_B TASK_C --actor reviewer` → success.
6. Browser: the "Cache headers" card's label changes from "Edge caching" to "Rewrite hot path"; Goals counts drop/rise by one; Activity shows "reviewer · task.unlink-vein" and "reviewer · task.link-vein", each with a "Cache headers" button.
##### Variations
- If Alice is viewing the board filtered to "Edge caching", "Cache headers" disappears from it live.
##### Edge Cases
- Removing again → `NOT_FOUND: This task is not part of that vein`.
- Another replica concurrently re-added the link and the removal did not observe it → the remove succeeds but the link survives (add-wins); the card keeps the "Edge caching" label, which looks like the remove failed.
- Wrong/old revision → `STALE_UPDATE`.
- If VEIN_A becomes empty, it can no longer show "Ready for a verdict" (needs ≥1 task).

##### Merged source: credential-lifecycle-cleanup/STORY-011 — Remove a task from the wrong vein

**Type**: short
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Sofia Petrov, a research lead who mistakenly linked "Add latency instrumentation" to the "Edge caching" vein instead of "Observability"
**Goal**: Unlink the task from the wrong vein and link it to the right one.
**Preconditions**: Both veins exist; task is linked only to "Edge caching"; the browser is on the **Goals** view.
**Ideal path**: 2 (unlink, link; ideally both in the task details UI).
**Alternate paths**: `pardner operation --request` with `task.unlink-vein`. No UI path exists; Task details only shows "Veins: Edge caching (Open)".

**Steps (from credential-lifecycle-cleanup/STORY-011):**

1. Runs `pardner show task-3f… --json` → Reads `veins[0].linkRevisions` for the "Edge caching" vein.
2. Runs `pardner vein remove vein-a1… task-3f… --revisions '["<link-op-id>"]' --actor sofia` → `"success":true`. The Goals view updates: "Edge caching" drops to one fewer "N task(s)", and Task details no longer lists it under "Veins:".
3. Runs `pardner vein add vein-c7… task-3f… --actor sofia` → Task details shows "Veins: Observability (Open)", and the **Vein** filter "Observability" now includes the card.

**Variations (from credential-lifecycle-cleanup/STORY-011):**

- She swaps the argument order (`vein remove task-… vein-…`) → `NOT_FOUND` with a "… not found: …" message from the record lookup (`recordOf`), which names the ID it could not find.
- Runs `vein remove` on a task that is not linked → `NOT_FOUND` "This task is not part of that vein".

**Edge Cases (from credential-lifecycle-cleanup/STORY-011):**

- Concurrent links of the same pair from two replicas: `vein remove` accepts conflicting link revisions (`allowConflict`) but needs *all* of them in `--revisions`, otherwise `STALE_UPDATE`.
- If she unlinks the last task while the board's **Vein** filter is set to that vein, the board shows "No tasks here" in every column. The filter itself stays, since the vein still exists.

---

#### STORY-052: Move a vein to a different goal
*(was goals-veins/STORY-009)*

**Type**: medium
**Topic**: Goals and veins
**Persona**: Bob (human), who realises "Rewrite hot path" mainly saves money
**Goal**: Move VEIN_B from "p95 under 200ms" to a new goal "Cut hosting cost".
**Preconditions**: Goal "Cut hosting cost" does not exist yet.
**Ideal path**: 2 — create goal, move vein (a single "move to new goal" would be 1).
**Alternate paths**: none found for moving to a new goal in one step — `vein update --goal` accepts only an existing goal ID, unlike `vein create --goal`.
**Walkability**: `browser+cli`
**Related**: STORY-045, STORY-048, STORY-051, STORY-069
##### Steps
1. Bob tries `$P vein update VEIN_B --goal 'Cut hosting cost' --revisions '{"goalId":["op-…"]}' --actor bob` → `INVALID_ARGUMENT: Goal ID must be a nonempty identifier`. He's surprised because create accepted a title.
2. `$P goal create --title 'Cut hosting cost' --description 'Halve the monthly bill' --actor bob` → `"result":{"goalId":"goal-…"}`. Goals view: new article "Cut hosting cost" · **Open**, description "Halve the monthly bill", "No veins pursue this goal yet."
3. `$P vein show VEIN_B --json` → copy `revisions.goalId`.
4. `$P vein update VEIN_B --goal GOAL_COST --revisions '{"goalId":["op-…"]}' --actor bob` → success.
5. Goals view: **Rewrite hot path** leaves "p95 under 200ms" and appears under "Cut hosting cost" with its task count and status intact. Its tasks keep their vein label.
6. `$P goal show GOAL_LATENCY --json` → `history` still includes the `vein.update` move (a goal records veins that leave it).
##### Variations
- Passing the revisions under `status` instead of `goalId` → `REVISION_REQUIRED`.
##### Edge Cases
- Goal ID that doesn't exist → `NOT_FOUND: Goal not found: …`.
- Moving onto an **Achieved** or **Abandoned** goal is allowed with no warning.
- Goal history is only available on CLI; the Goals view has no history.

---

#### STORY-053: Two leads record conflicting verdicts on different machines
*(was goals-veins/STORY-010)*

**Type**: long
**Topic**: Goals and veins
**Persona**: Alice on the hub laptop and Bob on a replica laptop on a train
**Goal**: Converge on one verdict for "Edge caching" after concurrent, offline disagreement.
**Preconditions**: Hub on 8004/8005 with `.pardner-walk`; replica `serve --data .pardner-replica --role replica --hub http://127.0.0.1:8004 --hub-ws ws://127.0.0.1:8005/automerge --hub-token TOKEN --http-port 8014 --ws-port 8015` already enrolled; VEIN_A **Open**, all tasks ended, "Ready for a verdict" showing on both.
**Ideal path**: 4 — each records a verdict, one sees the conflict, one resolves (a UI "Keep this verdict" would replace the CLI resolve).
**Alternate paths**: Resolve from either machine; raw `operation` `vein.resolve`.
**Walkability**: `multi-service`
**Related**: STORY-054, STORY-068, STORY-069
##### Steps
1. Both browsers show **Edge caching** · **Open** · "Ready for a verdict".
2. Bob's replica loses the hub (stop the hub process). His header SaveStatus changes once he writes.
3. Bob: `node bin/pardner.js --data .pardner-replica vein show VEIN_A --json` → reads `revisions.status`.
4. Bob: `… vein update VEIN_A --status dead-end --revisions '{"status":["op-open"]}' --actor bob` → success on the replica; his browser shows **Dead end** and "Saved locally · waiting for hub".
5. Alice on the hub (restarted, still disconnected from Bob): `$P vein update VEIN_A --status proven --revisions '{"status":["op-open"]}' --actor alice` → success; her Goals view shows **Proven**.
6. The replica reconnects; changes sync. Bob's SaveStatus → "Saved locally · synced".
7. Both Goals views now show **Edge caching** with one of the two status pills (whichever Automerge selected), plus "Conflicting edits". "Ready for a verdict" is absent — a disputed verdict is not waiting for one.
8. Alice is unsure which value is "winning" — the UI shows only one. She runs `$P vein show VEIN_A --json` → `"conflicts":{"status":[{"value":"dead-end","actorId":"bob",…},{"value":"proven","actorId":"alice",…}]}`, `"revisions":{"status":["op-bob","op-alice"]}`.
9. She tries `$P vein update VEIN_A --status proven --revisions '{"status":["op-bob","op-alice"]}' --actor alice` → `CONFLICT_REQUIRES_RESOLUTION: Resolve the concurrent alternatives explicitly`.
10. She comments on a vein task in the browser ("@bob your benchmark shows the cache helps p95; keeping Proven?") using **Add comment** — there's no comment thread on veins themselves.
11. Bob replies agreeing.
12. Alice: `$P vein resolve VEIN_A --field status --value proven --revisions '["op-bob","op-alice"]' --actor alice` → `"result":{"veinId":"VEIN_A"}`.
13. Both Goals views: **Proven**, no "Conflicting edits".
14. `$P vein show VEIN_A --json` → `history` lists `vein.create`, `vein.update` ×3, `vein.resolve`.
##### Variations
- Concurrent **goal** verdicts (achieved vs abandoned) show "Conflicting edits" under the goal title; resolve with `$P goal resolve GOAL --field status --value achieved --revisions '[…]'`.
- Concurrent title edits on a vein: the Goals list item shows one title + "Conflicting edits"; resolve with `--field title`.
- They could also resolve back to `open` (`--value open`) to keep working; "Ready for a verdict" reappears if all tasks are ended.
##### Edge Cases
- `vein resolve` with only one of the two revisions → `STALE_UPDATE`.
- `--field verdict` → `INVALID_ARGUMENT: Choose a valid vein field to resolve`.
- `--value completed` → `Vein status must be one of: open, proven, dead-end, abandoned`.
**Multi-surface:** Conflict appears in both browsers (and companion devices); resolution only on CLI.

---

#### STORY-054: A conflicting task status quietly blocks "Ready for a verdict"
*(was goals-veins/STORY-011)*

**Type**: medium
**Topic**: Goals and veins
**Persona**: Alice (human) wondering why a finished vein isn't flagged
**Goal**: Get "Rewrite hot path" flagged for a verdict.
**Preconditions**: Hub + replica; VEIN_B has one task "Inline the parser". Alice set it **Completed** on the hub while Bob, offline on the replica, set it **In progress**; replicas synced.
**Ideal path**: 2 — open the conflicted task, keep one status.
**Alternate paths**: CLI `$P resolve TASK --field status --value completed --revisions '["op-a","op-b"]' --actor alice`.
**Walkability**: `multi-service`
**Related**: STORY-049, STORY-050, STORY-053, STORY-056, STORY-057, STORY-068, STORY-069
##### Steps
1. Goals view: **Rewrite hot path** · **Open** · "1 task", no "Ready for a verdict". Alice expected the flag because her board shows the card in **Completed**.
2. She clicks **Rewrite hot path** → board filtered; the card has a "Conflicting edits" badge.
3. Clicking it → Task details with "Resolve status", "Both edits are preserved. Choose the value to keep." and two alternatives (alice → completed, bob → in-progress), each with **Keep this status**.
4. After a comment from Bob confirming he's done, she clicks **Keep this status** on the completed alternative → badge disappears.
5. Goals view → "Ready for a verdict" now appears on **Rewrite hot path**.
##### Variations
- Keeping **Dead end** instead also makes the vein ready.
##### Edge Cases
- Nothing in the Goals view explains why the flag is missing; the user must infer it from task badges.
- Keeping **In progress** keeps the vein un-flagged.

---

#### STORY-055: Edit a goal's title and description from the CLI
*(was goals-veins/STORY-012)*

**Type**: short
**Topic**: Goals and veins
**Persona**: Priya (human PM) sharpening the wording
**Goal**: Rename "p95 under 200ms" to "p95 page load under 200ms" and add a description.
**Preconditions**: Goal open; Priya registered as an Actor.
**Ideal path**: 2 — read revisions, update both fields (inline edit on the goal card would be 1).
**Alternate paths**: Two separate `goal update` calls; raw `goal.update` operation.
**Walkability**: `cli-only`
##### Steps
1. `$P goal show GOAL --json` → `revisions.title` and `revisions.description`.
2. `$P goal update GOAL --title 'p95 page load under 200ms' --description 'Measured at the edge for logged-in users' --revisions '{"title":["op-t"],"description":["op-d"]}' --actor priya` → success.
3. Goals view: heading and muted description update live.
##### Variations
- Supplying only `title` revisions while updating both → `REVISION_REQUIRED: Supply the observed field revisions` (for description).
##### Edge Cases
- `goal update GOAL --revisions '{}'` with no fields → `Supply at least one goal field`.
- `--title '   '` → title must be text with content.
- Vein titles and descriptions are edited the same way with `vein update`; vein descriptions never appear in the UI.

---

#### STORY-056: Run a quarter's latency push end to end across humans, agents and surfaces
*(was goals-veins/STORY-013)*

**Type**: long
**Topic**: Goals and veins
**Persona**: Alice (lead, browser + CLI), Bob (human, browser), `builder` and `reviewer` (agents, CLI)
**Goal**: Pursue "p95 under 200ms" with two veins, reach verdicts for both, and close the goal.
**Preconditions**: Fresh workspace with the four Actors; Alice's browser connected (token) and Actor = alice; Bob's phone paired via **Pair another device**.
**Ideal path**: 14 — 1 goal+vein create, 1 second vein, ~4 task creations/links, ~4 status changes, 2 verdicts, 1 goal close, 1 view check; the many `show`→revisions lookups add roughly 5 more real steps.
**Alternate paths**: Create goal first with `goal create`; create tasks in the browser **New task** and link them with `vein add`; close tasks via CLI `update` or `handoff`.
**Walkability**: `multi-service`
**Related**: STORY-049, STORY-050, STORY-054, STORY-057
##### Steps
1. Alice: `$P vein create --title 'Edge caching' --goal 'p95 under 200ms' --actor alice` → copy `veinId` (VEIN_A) and `goalId`.
2. Alice: `$P vein create --title 'Rewrite hot path' --goal GOAL --actor alice` → VEIN_B; no `createdGoal`.
3. Browser **Goals**: one goal, two veins, each "0 tasks".
4. Alice clicks **New task** → Title "Measure p95 baseline", Priority p1, Assignee "builder · agent" → **Create task** → details open. She looks for a vein field and finds none.
5. `$P vein add VEIN_A TASK_BASELINE --actor alice` and `$P vein add VEIN_B TASK_BASELINE --actor alice` → card shows both vein labels.
6. builder: `$P task create --title 'Add CDN cache rules' --assignee builder --vein VEIN_A --actor builder`.
7. builder: `$P task create --title 'Inline the JSON parser' --assignee builder --vein VEIN_B --actor builder`.
8. Goals: **Edge caching** "2 tasks", **Rewrite hot path** "2 tasks".
9. builder works baseline, links a commit (`link-commit`) and hands off: `$P handoff TASK_BASELINE --to alice --status review --message 'Baseline is 340ms p95' --revisions …` → card in **Review**.
10. Alice opens it, reads Evidence, **Edit task** → Status "Completed" → **Save changes**.
11. builder finishes CDN rules; reviewer approves via comment; builder sets `update … --status completed`.
12. Goals: **Edge caching** now "Ready for a verdict" (both its tasks ended). **Rewrite hot path** is not (parser task open).
13. Bob on his phone opens **Goals** (nav wraps full width at ≤760px), taps **Rewrite hot path** → filtered board scrolls sideways; he taps the parser card and comments "@builder this regressed cold start; stop".
14. builder: `$P mentions claim-next --request-id poll-1 --actor builder`, reads it, `ack`s, then `update TASK_PARSER --status dead-end --revisions …`.
15. Goals: **Rewrite hot path** "Ready for a verdict".
16. Alice: `vein show VEIN_A` → `vein update VEIN_A --status proven --revisions '{"status":[…]}'` → **Proven**.
17. Alice: `vein show VEIN_B` → `vein update VEIN_B --status dead-end --revisions '{"status":[…]}'` → **Dead end**. Both flags gone.
18. Alice: `goal show GOAL` → `goal update GOAL --status achieved --revisions '{"status":[…]}'` → **Achieved**.
19. Alice reviews the board with **Vein** = "Rewrite hot path": the dead-end parser task in **Dead end**, the shared baseline task in **Completed**.
20. Activity view: `vein.create`, `task.link-vein`, `vein.update`, `goal.update` entries — vein/goal entries show no target button, only task-linked ones do.
##### Variations
- Bob records a verdict from his laptop CLI rather than Alice — any Actor can; there is no role gate on verdicts.
- Leave the goal **Open** and start a third vein; Goals view shows the achieved/dead-end history only via pills.
##### Edge Cases
- Shared baseline task: closing it contributed to both veins' readiness at once.
- No UI shows *why* a vein is ready or which tasks are still open other than filtering the board.
- Activity lists `vein.update` without naming which vein or what changed.
**Multi-surface:** Desktop browser, phone companion, two agent CLIs and the lead's CLI all act on the same goal/veins; verdicts are CLI-only on every device.

---

#### STORY-057: Read goal and vein state entirely from the CLI as an agent planner
*(was goals-veins/STORY-014)*

**Type**: medium
**Topic**: Goals and veins
**Persona**: `planner`, an orchestration agent deciding what to pick up next
**Goal**: Find open veins ready for a verdict and open tasks in open veins, then mention the lead.
**Preconditions**: Several goals and veins with mixed statuses.
**Ideal path**: 3 — list veins, list tasks for chosen vein, comment.
**Alternate paths**: `goal show` per goal (includes vein summaries); browser Goals view.
**Walkability**: `cli-only`
**Related**: STORY-049, STORY-050, STORY-054, STORY-056
##### Steps
1. `$P goals --status open --json` → open goals only.
2. `$P veins --status open --json` → filter client-side for `"readyForVerdict":true`; there is no `--ready` flag.
3. For a ready vein, `$P vein show VEIN --json` → `goal.title`, `tasks[]` with statuses.
4. Because verdicts are for a person, planner comments on one of the vein's tasks: `$P comment TASK '@alice Edge caching is ready for a verdict' --actor planner` → Alice gets a mention delivery and sees the comment in Task details.
5. For an open vein with live work: `$P tasks --vein VEIN --status up-next --json` → candidates.
##### Variations
- `veins --goal GOAL` matches any of the vein's `goalIds`, so a vein with a disputed move appears under both goals.
##### Edge Cases
- `veins --goal 'p95 under 200ms'` (title) → empty list, no error.
- `goal show goal-missing` → `NOT_FOUND`.
- There is no way to mention or comment on a vein or goal itself; the agent must pick a task.

---

### Concurrent edits and conflict resolution

<details><summary>Topic background (from conflict-resolution.md)</summary>

Sources read: `ui-prototype/src/Pardner.jsx` (board card badge ~515, Goals view ~586-623, `ErrorNotice` ~52, `submit` ~271-323, `TaskDetail` ~735-1030), `lib/workspace-commands.js` (`fieldChanges`, `prepareResolve`, `prepareHandoff`, `prepareCommentEdit`, `recordEdit`, `linkChange`), `lib/workspace-schema.js` (`checkRevisions`, `recordState`, `commentView`, `taskContext`), `lib/cli.js` (HELP and dispatch), `bin/pardner.js` (CLI JSON envelope), `test/conflict-qualification.test.js`, `test/pardner-ui.test.js` (stale draft and stale handoff), `scripts/acceptance.js` (two-replica status conflict, **Keep this status**), `docs/PARDNER-ACCEPTANCE.md`.

Shared setup for replica stories (from `docs/ux-paths/discovery.md`): a hub plus two replicas, each with its own data directory and its own browser at its own port.

```sh
node bin/pardner.js serve --data .pardner-hub                       # hub, 8004/8005
node bin/pardner.js serve --data .pardner-a --role replica --hub http://127.0.0.1:8004 \
  --hub-ws ws://127.0.0.1:8005/automerge --hub-token HUB_TOKEN --http-port 8014 --ws-port 8015
node bin/pardner.js serve --data .pardner-b --role replica --hub http://127.0.0.1:8004 \
  --hub-ws ws://127.0.0.1:8005/automerge --hub-token HUB_TOKEN --http-port 8024 --ws-port 8025
```

Reference facts the stories rely on (all from code):

- A field has a conflict when it holds more than one un-superseded alternative (`recordState`: `if (choices.length > 1) conflicts[field] = choices`). Every field in `TASK_FIELDS` (`title, description, status, priority, assignee, tags, order, type`) can conflict; goals (`title, description, status`) and veins (`title, description, status, goalId`) too.
- `checkRevisions` errors, in order: `REVISION_REQUIRED` "Supply the observed field revisions" (missing / not an array of strings), `STALE_UPDATE` "This field changed since it was read; refresh its context" (the observed revision set differs), `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly" (more than one alternative and the operation is not a resolve).
- The browser shows operation errors in the workspace-level `ErrorNotice` (`role="alert"`) above the board, not inside the Task details panel. For `STALE_UPDATE` the second line is "Your draft is preserved. Review the latest context before making a new edit."; for all other codes it is "Your last confirmed data remains available.". Both `STALE_UPDATE` and `CONFLICT_REQUIRES_RESOLUTION` clear the saved pending write, so no **Retry saved request** button appears.
- The CLI prints `{"success":false,"error":{"code","message","details"}}` on stdout, `CODE: message` on stderr, exit code 1.

</details>

#### STORY-058: Two people edit different fields of the same task offline and both edits survive
*(was conflict-resolution/STORY-001)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno (human, product lead, on replica A laptop) and Bob Okafor (human, engineer, on replica B laptop), both on a train with no Wi-Fi to the hub
**Goal**: Confirm that changing different fields on two disconnected replicas merges cleanly without any conflict UI
**Preconditions**: Hub and both replicas enrolled and synced; task "Add latency instrumentation" (P1, In progress, assignee builder) exists on all three; Alice's browser is on `http://127.0.0.1:8014/pardner/` with Actor alice, Bob's on `:8024` with Actor bob; hub process then stopped.
**Ideal path**: 6 — each person makes one edit (2 steps each), reconnect, glance once at the card; nothing should be asked of the user.
**Alternate paths**: CLI on each side: `pardner --data .pardner-a update TASK --title '…' --revisions '{"title":["REV"]}' --actor alice` and `pardner --data .pardner-b update TASK --priority p0 --revisions '{"priority":["REV"]}' --actor bob`, revisions taken from `pardner show TASK`.
**Walkability**: `multi-service` (hub + two replicas)
##### Steps
1. Alice opens the "Add latency instrumentation" card and clicks **Edit task** → inline form appears with **Title**, **Description**, **Status**, **Priority**, **Assignee**, **Tags, separated by commas**, **Save changes**, **Cancel edit**.
2. Alice changes **Title** to "Add p95 latency instrumentation" and clicks **Save changes** → panel header becomes "Add p95 latency instrumentation"; SaveStatus reads "Saved locally · waiting for hub" (the hub is down, so `syncPending` stays true).
3. Bob, on replica B, opens the same card (still titled "Add latency instrumentation"), clicks **Edit task**, sets **Priority** to `p0`, clicks **Save changes** → card moves to the top of In progress with "P0"; SaveStatus "Saved locally · waiting for hub".
4. Bob wonders whether Alice touched the same task; he has no way to know offline and carries on.
5. The hub is restarted with the same `--data .pardner-hub`; both replicas reconnect → each SaveStatus changes to "Saved locally · synced".
6. Alice looks at the board → the card shows "P0", "Add p95 latency instrumentation", "builder · agent", and no **Conflicting edits** badge.
7. Alice opens the card and scrolls to **History** → two entries, "Alice Moreno · task.update" with `title: Add latency instrumentation → Add p95 latency instrumentation` and "Bob Okafor · task.update" with `priority: p1 → p0`, each with its own author (qualified by "merges different fields together with each operation and its attribution").
##### Variations
- Bob changes **Tags, separated by commas** instead of priority → same clean merge; tags is a whole-list field, so only concurrent tag edits would conflict.
- Both sides edit through the CLI; `pardner diff TASK` afterward returns both changes and `"conflicts":{}`.
##### Edge Cases
- If either side's TaskForm submits an unchanged field it is filtered out (`JSON.stringify(value) !== JSON.stringify(draft.fields[key])`), so opening **Edit task** and saving without changes never causes a conflict; it simply closes the editor.
- Editing **Description** on both sides is a same-field edit and does conflict (whole-string register, no text merge); see STORY-066 Variations.

---

#### STORY-059: Spot a conflicting card on the board and keep the right status
*(was conflict-resolution/STORY-002)* — **Merged sources:** daily-board-work/STORY-013 "Spot and open a conflicted card from the board"

**Type**: short
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno, back at her desk after a sync, scanning the board
**Goal**: Find the task that needs a decision and resolve it with one click
**Preconditions**: Task "Pardner task 0 alice" has two status alternatives after a partitioned sync: alice set In progress on replica A, bob set Review on replica B. Alice's browser on replica A, Actor alice.
**Ideal path**: 3 — see badge, open card, choose value.
**Alternate paths**: `pardner resolve TASK --field status --value in-progress --revisions '["OP_A","OP_B"]' --actor alice` (STORY-065).
**Walkability**: `multi-service`
**Related**: STORY-060, STORY-061, STORY-064, STORY-066, STORY-070, STORY-079
**Why merged**: Both spot the **Conflicting edits** badge on a card, open it and click **Keep this {field}**.
##### Steps
1. Alice scans the board → one card in a column shows the red-ish **Conflicting edits** label under the assignee; the card sits in only one column (the server's selected alternative), so she is unsure which status "won".
2. She clicks the card → Task details opens; below the description a section headed "Resolve status" reads "Both edits are preserved. Choose the value to keep." with two entries: "Alice Moreno · human" / `in-progress` and "Bob Okafor · human" / `review`, each with a **Keep this status** button.
3. She hesitates: the values show raw status keys (`in-progress`, `review`), not the board labels "In progress"/"Review", and there is no timestamp to tell which edit was later. She remembers Bob finished his part and clicks **Keep this status** under Bob's `review` → SaveStatus "Saving locally…", then the "Resolve status" section disappears and the card moves to Review without the badge.
##### Variations
- **Multi-surface:** on replica B, Bob's open board and Task details update live (WS `document-state`) and the "Resolve status" section disappears from his panel too once sync completes; the History on both shows "Alice Moreno · task.resolve" with `status: … → review`.
- With no Actor chosen, **Keep this status** is disabled (`canWrite` false).
##### Edge Cases
- If a third alternative arrives (e.g. builder's offline edit) between opening the panel and clicking, the panel refreshes on new heads; if the click races it, the server returns `STALE_UPDATE` "This field changed since it was read; refresh its context" in the top alert with "Your draft is preserved…" — misleading here, since there is no draft for a resolve.
- There is no board filter for conflicting tasks; on a 100-task board Alice must scroll every column to find badges.

##### Merged source: daily-board-work/STORY-013 — Spot and open a conflicted card from the board

**Type**: short
**Topic**: Daily task work on the board
**Persona**: Bob Okafor, scanning the board after his laptop's replica reconnected to the hub.
**Goal**: Notice a task with competing edits and settle it.
**Preconditions**: Task "Purge stale edge objects" has two concurrent `priority` values (p0 from bob's replica, p1 from alice on the hub).
**Ideal path**: 3 steps — notice the badge, open, keep a value.
**Alternate paths**: CLI `pardner resolve TASK --field priority --value p0 --revisions '["revA","revB"]'`.

**Steps (from daily-board-work/STORY-013):**

1. Scan the board → the card shows a **Conflicting edits** badge in warning color. Its "P0" or "P1" label shows whichever value the CRDT picked, and the column sort uses that value.
2. Click the card → details shows a "Resolve priority" section: "Both edits are preserved. Choose the value to keep." Below it, "bob · human" with `p0` and "alice · human" with `p1`, each with **Keep this priority**.
3. Click **Keep this priority** under bob's `p0` → the badge disappears and the card settles under P0 ordering.

**Edge Cases (from daily-board-work/STORY-013):**

- Trying **Edit task** → **Priority** while the conflict exists → `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly". The edit path refuses and points to the resolve buttons.
- The conflict section headings use raw field names ("Resolve priority", "Keep this assignee"), and assignee alternatives show raw Actor IDs rather than "name · kind".

---

#### STORY-060: Two-replica status conflict resolved in the browser (acceptance scenario)
*(was conflict-resolution/STORY-003)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: QA engineer Priya Shah reproducing the acceptance gate's explicit conflict step by hand
**Goal**: Produce a real same-field conflict across replicas and verify browser resolution converges everywhere
**Preconditions**: Shared setup with hub + replicas A and B running; Actors alice and bob registered; task "Pardner task 0 alice" exists and is synced; Browser 1 on `:8014` (Actor alice), Browser 2 on `:8024` (Actor bob).
**Ideal path**: 7 — partition, one edit per side, heal, resolve, verify on both.
**Alternate paths**: The automated version in `scripts/acceptance.js` uses `task.update` via `/automerge/operations` and a network gate instead of stopping the hub.
**Walkability**: `multi-service` (hub + two replicas (acceptance scenario))
**Related**: STORY-059, STORY-061, STORY-064, STORY-066, STORY-070, STORY-079
##### Steps
1. Priya stops the hub process → both browsers keep working; SaveStatus shows "Saved locally · synced" until the next write.
2. In Browser 1 she runs `node bin/pardner.js --data .pardner-a show TASK --actor alice` → JSON with `"revisions":{"status":["OP_CREATE"], …}` and `"conflicts":{}`.
3. She runs `pardner --data .pardner-a update TASK --status in-progress --revisions '{"status":["OP_CREATE"]}' --actor alice` → `{"success":true,…}`; Browser 1 card moves to In progress; SaveStatus "Saved locally · waiting for hub".
4. She runs the same against replica B with `--status review --actor bob` → Browser 2 card moves to Review.
5. She restarts the hub with the same `--data` → after reconnection both SaveStatus labels read "Saved locally · synced".
6. In Browser 1 she opens the card → heading "Resolve status" with two entries and two **Keep this status** buttons; the card on the board carries **Conflicting edits**. `pardner --data .pardner-a show TASK` returns `conflicts.status` with two entries (each with `value`, `operationId`, `actorId`, `replicaId`, `timestamp`).
7. She clicks the first **Keep this status** → "Resolve status" heading goes hidden.
8. She checks Browser 2 → Bob's board shows the same status, no badge; `pardner --data .pardner-b show TASK` returns `"conflicts":{}` and `revisions.status` with one ID (the resolution operation).
##### Variations
- Stopping a replica instead of the hub: the stopped replica's browser drops to "Live updates disconnected. Reconnecting automatically…" with **Retry connection**, so it cannot author the offline edit through the UI; stopping the hub is the practical way to author on both sides from browsers.
- Resolve from Browser 2 instead; outcome is identical.
##### Edge Cases
- The first **Keep this status** button belongs to the alternative with the lexically smallest operation ID (alternatives are sorted by `operationId`), not the earliest or the local edit; picking "first" blindly is arbitrary.
- If both Priya and Bob click **Keep this status** on their own replicas before syncing, each resolve supersedes both originals and writes a new value concurrently; by the register semantics in `writeFields` this produces a fresh two-alternative conflict between the two resolutions, which shows "Resolve status" again (even if both chose the same value, two identical-looking entries appear).

---

#### STORY-061: Trying to edit a conflicted field through Edit task
*(was conflict-resolution/STORY-004)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Bob Okafor, who did not notice the conflict section and wants to set the task to Completed
**Goal**: Change the status of a task whose status is in conflict
**Preconditions**: Task "Add latency instrumentation" has a status conflict (`in-progress` by alice, `review` by bob). Bob on replica B, Actor bob.
**Ideal path**: 2 — open card, choose **Keep this status** (or a resolve that accepts a new value); a well-designed UI would route the edit into resolution.
**Alternate paths**: CLI `pardner resolve TASK --field status --value completed --revisions '["OP_A","OP_B"]'` accepts a value that is neither alternative (STORY-065).
**Walkability**: `multi-service`
**Related**: STORY-059, STORY-060, STORY-064, STORY-066, STORY-070, STORY-079
##### Steps
1. Bob opens the card → Task details; header reads "builder · agent · Review · P1" (one alternative is displayed as current) and "Resolve status" is below the description.
2. Bob skips past the conflict section and clicks **Edit task** → form opens with **Status** preset to the displayed value.
3. He sets **Status** to "Completed" and clicks **Save changes** → the editor stays open; at the top of the workspace (above the board, not in the panel) an alert reads "Resolve the concurrent alternatives explicitly" / "Your last confirmed data remains available."
4. Bob does not see the alert at first on a tall panel; he clicks **Save changes** again → same alert (each attempt sends a new operation ID and is rejected again).
5. He clicks **Cancel edit** → editor closes; the alert remains visible until his next write.
6. He realises he must first decide between the two existing values: clicks **Keep this status** under `review` → conflict section disappears.
7. He clicks **Edit task**, sets **Status** to "Completed", **Save changes** → card moves to Completed.
##### Variations
- Bob edits **Title** only while status is conflicted → succeeds; only the touched fields are checked (`fieldChanges` iterates `updates`), so the status conflict persists and the card keeps **Conflicting edits**.
- Same flow via CLI: `pardner update TASK --status completed --revisions '{"status":["OP_A","OP_B"]}'` → `CONFLICT_REQUIRES_RESOLUTION`; with only one of the two IDs → `STALE_UPDATE` instead, which is a confusing message for an agent that just read the task.
##### Edge Cases
- Two operations to reach "Completed" (resolve then update) produce two History entries; no single-step "resolve to a new value" exists in the UI although the server supports it.
- The UI's resolve button only offers existing alternatives, so the UI path is strictly longer than the CLI's.

---

#### STORY-062: An agent renames the task while a human is mid-edit (STALE_UPDATE, draft preserved)
*(was conflict-resolution/STORY-005)* — **Merged sources:** daily-board-work/STORY-009 "Hit STALE_UPDATE while an agent changes the same task"

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno (human, browser) and builder (agent, CLI) on the same hub
**Goal**: Alice saves her title edit without silently overwriting the agent's newer title
**Preconditions**: One hub; task "Add latency instrumentation" exists; Alice's browser on `:8004`, Actor alice; builder works with `PARDNER_ACTOR=builder`.
**Ideal path**: 4 — see the conflict, compare, keep or re-apply the draft, save.
**Alternate paths**: none found in the UI for merging a draft onto the new value; the only route is cancel and re-edit.
**Walkability**: `browser+cli`
**Related**: STORY-018, STORY-019, STORY-029, STORY-118
**Why merged**: Both hit `STALE_UPDATE` in **Edit task** while an agent updates the same task via CLI; both find that the preserved draft keeps stale revisions and only Cancel edit → Edit task recovers.
##### Steps
1. Alice clicks **Edit task** and types "A stale local draft" into **Title** (she is rewording slowly).
2. Builder runs `pardner show TASK` then `pardner update TASK --title 'A newer agent title' --revisions '{"title":["REV"]}'` → `{"success":true,…}`.
3. Alice's panel heading live-updates to "A newer agent title", but her **Title** input still shows "A stale local draft" (draft revisions were captured when she clicked **Edit task**). Nothing in the form says the field changed underneath her.
4. Alice clicks **Save changes** → top alert: "This field changed since it was read; refresh its context" / "Your draft is preserved. Review the latest context before making a new edit."; the editor stays open with her text; `pardner show TASK` still reports "A newer agent title".
5. She clicks **Save changes** again hoping it now works → same `STALE_UPDATE` (the draft keeps the old revisions; there is no rebase action).
6. She copies her draft text, clicks **Cancel edit** (draft discarded), clicks **Edit task** again (form now holds "A newer agent title" and the current revisions), pastes or retypes her wording, **Save changes** → heading shows her title; History shows builder's and Alice's `task.update` entries.
##### Variations
- Builder changes **Status** instead of Title while Alice edits only Title → her save succeeds; only changed fields send `expectedRevisions`.
- Alice edits both Title and Priority, builder changed Priority → whole save rejected; neither field is written.
##### Edge Cases
- "Your draft is preserved" is only true while the editor stays open; **Cancel edit**, Escape (closes the whole panel), or selecting another card loses it. There is no "Apply my draft to latest" control.
- The `STALE_UPDATE` alert lives above the board; on a phone (≤760px) with the panel open it may be off-screen.

##### Merged source: daily-board-work/STORY-009 — Hit STALE_UPDATE while an agent changes the same task

**Type**: medium
**Topic**: Daily task work on the board
**Persona**: Alice Moreno, editing a task's priority while `builder` (an agent on the CLI) moves it to Review.
**Goal**: Save her priority change despite the concurrent status update, without discarding either edit.
**Preconditions**: Task "Add latency instrumentation" open in details for `alice`; `builder` can run CLI commands.
**Ideal path**: 3 steps — Save changes, see the conflicting field inline, confirm a refreshed draft; currently 7.
**Alternate paths**: Re-run the edit via CLI with fresh `--revisions` from `pardner show`.

**Steps (from daily-board-work/STORY-009):**

1. Alice clicks **Edit task** → the draft snapshots the current `revisions`.
2. Meanwhile, in a terminal: `pardner update TASK --status review --revisions '{"status":["<rev>"]}' --actor builder` → the live update arrives over the WebSocket. The details muted line changes to "… · Review · P1" above Alice's still-open editor, and the card moves to **Review**.
3. Alice changes **Status** in her editor to "Up next" (it still showed "In progress") and **Priority** to `p0`, then clicks **Save changes** → the server rejects the operation with `STALE_UPDATE`. The workspace-level `ErrorNotice` shows "This field changed since it was read; refresh its context" and "Your draft is preserved. Review the latest context before making a new edit."
4. Alice looks for the error → it renders under the header, behind the fixed side panel. On a narrow window or a phone the panel covers it. From inside the panel she only sees that **Save changes** did nothing.
5. She clicks **Save changes** again → `STALE_UPDATE` again. The preserved draft still carries the revisions captured in step 1, so retrying can never succeed.
6. She clicks **Cancel edit**, then **Edit task** → the form now shows "Review" and fresh revisions.
7. She sets **Priority** `p0`, leaves **Status** "Review", and clicks **Save changes** → it succeeds. **History** shows builder's status change and alice's priority change as separate entries.

**Variations (from daily-board-work/STORY-009):**

- If Alice only edits **Priority** in step 3 (leaving the status untouched), only `priority` is sent with its own revision. That save succeeds, because the field-level revision check means a concurrent different-field edit isn't stale.

**Edge Cases (from daily-board-work/STORY-009):**

- If both edits happened on disconnected replicas instead, the card shows **Conflicting edits** and details shows "Resolve status" with **Keep this status** for each alternative. That is covered by the conflict topic.
- STALE_UPDATE is a definitive error, so the pending write is cleared and no **Retry saved request** button appears.

---

#### STORY-063: Stale handoff notice — someone reassigns the task while the handoff is being written
*(was conflict-resolution/STORY-006)* — **Merged sources:** human-agent-handoff/STORY-008 "Stale-handoff notice in the UI when the agent moves the task mid-draft"

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno handing work to builder; she changes status herself in the editor partway through
**Goal**: Complete the handoff without overwriting an assignment or status change she has not seen
**Preconditions**: Task in Backlog assigned to alice; Alice's browser, Actor alice; Bob also viewing the task in another browser.
**Ideal path**: 4 — fill handoff, see notice, accept latest, hand off.
**Alternate paths**: CLI `pardner handoff TASK --to builder --status review --message '…' --revisions '{"assignee":["R1"],"status":["R2"]}'`.
**Walkability**: `browser+cli` (two browser tabs on one hub)
**Related**: STORY-027, STORY-030, STORY-040, STORY-064
**Why merged**: Both exercise the stale-handoff notice "Assignment or status changed while you were preparing this handoff." and **Use latest task details**.
##### Steps
1. In **Hand off work** Alice picks **Recipient** "builder · agent" (focusing the form captures the current assignee/status revisions) and types **Handoff message** "Please implement and record the evidence."
2. Before submitting she scrolls up, clicks **Edit task**, sets **Status** to "In progress", **Save changes** → editor closes, header shows "In progress".
3. Back in Hand off work a notice appears: "Assignment or status changed while you were preparing this handoff. Your draft is preserved." / "Current task: Alice Moreno · human · In progress." with **Use latest task details**; **Hand off** is disabled; her message is intact.
4. She reads "Current task" and confirms the new status is fine, then clicks **Use latest task details** → notice disappears, **Hand off** enabled.
5. She leaves **Handoff status** at "Review" and clicks **Hand off** → message field clears; card shows "builder · agent" in Review; Bob's browser shows the comment "Please implement and record the evidence." live.
##### Variations
- **Multi-surface:** if Bob changes the assignee from his browser (or an agent via CLI `pardner update`) instead of Alice's own edit, the same notice appears in Alice's panel after the live update.
- Recipient changed to a different Actor after accepting latest details: no new notice; the base is only reset by **Use latest task details** or a successful handoff.
##### Edge Cases
- The notice only watches `assignee` and `status`; a title or description change mid-handoff does not trigger it.
- If the change lands after Alice clicks **Hand off** but before the server processes it, the server returns `STALE_UPDATE` in the top alert instead of the in-form notice.
- **Use latest task details** is disabled while busy or with no Actor.

##### Merged source: human-agent-handoff/STORY-008 — Stale-handoff notice in the UI when the agent moves the task mid-draft

**Type**: medium
**Topic**: Human ↔ agent handoff round trip
**Persona**: Alice, human lead, drafting a handoff while builder is active on the CLI
**Goal**: Avoid handing off based on an assignment/status that has already changed.
**Preconditions**: Task "builder · agent · In progress"; Alice opens it to reassign it to bob.
**Ideal path**: 2 — accept the latest details, then hand off (the notice itself is unavoidable).
**Alternate paths**: Close and reopen the panel, or reload the page — both unmount `TaskDetail` and discard the draft, then a fresh handoff starts from current revisions.

**Steps (from human-agent-handoff/STORY-008):**

1. Alice opens the task, selects **Recipient** "bob · human", leaves **Handoff status** "Review", and types **Handoff message** "Bob, can you pair on the dashboard part?".
2. Meanwhile builder runs `pardner handoff … --to reviewer --status review …` with correct revisions → succeeds.
3. Alice's panel updates live: the header becomes "reviewer · agent · Review · P1" and a notice appears above the form: "Assignment or status changed while you were preparing this handoff. Your draft is preserved." and "Current task: reviewer · agent · Review." with **Use latest task details**.
4. **Hand off** is now disabled; her message text is still in **Handoff message**.
5. She reads the new builder comment in **Comments** and hesitates: should she override builder's handoff to reviewer? She decides bob should still pair after review, keeps **Recipient** "bob · human", and rewrites the message to "After review, Bob please pair on the dashboard part."
6. She clicks **Use latest task details** → the notice disappears; **Hand off** is enabled.
7. She clicks **Hand off** → task becomes "bob · human · Review"; the message is added as a comment mentioning bob.

**Variations (from human-agent-handoff/STORY-008):**

- The change is Alice's own **Edit task** status save (tested in `pardner-ui.test.js`): her own edit also triggers the stale notice, which can surprise her.
- Builder only comments (no assignee/status change): no notice; handoff proceeds.

**Edge Cases (from human-agent-handoff/STORY-008):**

- If builder's handoff lands in the gap after Alice clicks **Hand off** but before the server checks, the server returns `STALE_UPDATE`; the alert "This field changed since it was read; refresh its context" + "Your draft is preserved. Review the latest context before making a new edit." appears at the **top of the workspace**, not in the panel, and the panel's stale notice then appears too — two messages for one event.
- The notice wording says "Your draft is preserved" but **Use latest task details** only rebases revisions; it does not refresh Recipient or Status, so Alice may unknowingly overwrite the reviewer assignment.
- The stale check only covers `assignee` and `status`; a concurrent title or description change does not trigger it.

---

#### STORY-064: Hand off a task whose status is in conflict
*(was conflict-resolution/STORY-007)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Bob Okafor finishing a review shift, handing a task to reviewer (agent)
**Goal**: Hand off to reviewer while an unresolved status conflict exists
**Preconditions**: Task has a status conflict (`in-progress` alice / `review` bob). Bob's browser, Actor bob.
**Ideal path**: 3 — choose status in the handoff itself and submit; a handoff already sets status, so it could double as the resolution.
**Alternate paths**: Resolve with **Keep this status** first, then hand off (the only path that works).
**Walkability**: `multi-service` (needs a replica-produced conflict)
**Related**: STORY-027, STORY-030, STORY-040, STORY-059, STORY-060, STORY-061, STORY-063, STORY-066, STORY-070, STORY-079
##### Steps
1. Bob opens the card → "Resolve status" section is shown above **Hand off work**; he assumes the handoff status will settle it.
2. He picks **Recipient** "reviewer · agent", keeps **Handoff status** "Review", types **Handoff message** "@reviewer ready for a look", clicks **Hand off** → top alert "Resolve the concurrent alternatives explicitly" / "Your last confirmed data remains available."; message stays in the textarea; no comment or mention is created (the handoff is atomic).
3. Bob clicks **Keep this status** under `review` → conflict section disappears; because the status revisions changed, the stale-handoff notice now appears: "Assignment or status changed while you were preparing this handoff. Your draft is preserved." with **Use latest task details**.
4. He clicks **Use latest task details** → **Hand off** enabled.
5. He clicks **Hand off** → task assigned to reviewer in Review; comment with the mention appears in **Comments (N)**.
##### Variations
- Assignee rather than status is conflicted → same `CONFLICT_REQUIRES_RESOLUTION` (`prepareHandoff` checks both fields).
- Via CLI: `pardner handoff TASK --to reviewer --status review --message '…' --revisions '{"assignee":["R"],"status":["OP_A","OP_B"]}'` → `CONFLICT_REQUIRES_RESOLUTION`.
##### Edge Cases
- After resolving, the user must click **Use latest task details** for a change they made themselves; three actions (resolve, accept, hand off) where intent was one.

---

#### STORY-065: An agent inspects and resolves a conflict entirely from the CLI
*(was conflict-resolution/STORY-008)* — **Merged sources:** cli-power-user/STORY-004 "Resolving a replica status conflict entirely from the CLI"

**Type**: long
**Topic**: Concurrent edits and conflict resolution
**Persona**: reviewer (agent Actor, `PARDNER_ACTOR=reviewer`, `PARDNER_DATA_DIR=.pardner-b`), scripted but making realistic mistakes
**Goal**: Detect conflicting fields on assigned tasks, understand who wrote what, and resolve them correctly
**Preconditions**: Replica B synced after an outage; task "Add latency instrumentation" has conflicts on `status` (alice `in-progress`, bob `review`) and `tags` (alice `["perf"]`, bob `["perf","edge"]`).
**Ideal path**: 4 — one read listing conflicts with revision IDs, then one resolve per field, then a verifying read.
**Alternate paths**: `pardner operation --request '{"operationId":"…","actorId":"reviewer","type":"task.resolve","payload":{…}}'`; browser **Keep this status** / **Keep this tags**.
**Walkability**: `multi-service`
**Related**: STORY-070, STORY-071, STORY-083, STORY-137
**Why merged**: Both resolve a replica-produced status conflict entirely with `pardner show`/`diff`/`resolve`.
##### Steps
1. `pardner tasks --assignee reviewer --json` → list of tasks; each task carries a `conflicts` object; reviewer filters for non-empty ones and finds "Add latency instrumentation".
2. `pardner diff TASK` → `{"success":true,"taskId":…,"changes":[{field,old,new,actorId,operationId},…],"conflicts":{"status":[…],"tags":[…]}}` — the agent sees each alternative's `actorId`, `replicaId`, `timestamp`.
3. `pardner show TASK --actor reviewer` → `"revisions":{"status":["OP_A","OP_B"],"tags":["OP_C","OP_D"],…}`.
4. Mistake: reviewer copies the `update` example from HELP and runs `pardner resolve TASK --field status --value review --revisions '{"status":["OP_A","OP_B"]}'` → `{"success":false,"error":{"code":"REVISION_REQUIRED","message":"Supply the observed field revisions",…}}`; stderr `REVISION_REQUIRED: …`; exit 1. (`resolve` takes a plain array, `update` takes an object keyed by field.)
5. Corrects it: `pardner resolve TASK --field status --value review --revisions '["OP_A"]'` (forgot one ID) → `STALE_UPDATE` "This field changed since it was read; refresh its context" with `details.current` listing both IDs.
6. `pardner resolve TASK --field status --value review --revisions '["OP_A","OP_B"]'` → success; result `{"taskId":…}`.
7. Tags next: `pardner resolve TASK --field tags --value perf,edge --revisions '["OP_C","OP_D"]'` → `{"success":false,"error":{"code":"INVALID_ARGUMENT","message":"--value must be valid JSON",…}}` (tags and order values are parsed as JSON).
8. `pardner resolve TASK --field tags --value '["perf","edge"]' --revisions '["OP_C","OP_D"]'` → success.
9. Reviewer retries step 8 after a network hiccup without `--operation-id` → a new operation is attempted; the revisions now name superseded IDs, so `STALE_UPDATE`. It reruns with `--operation-id resolve-tags-1` on the first attempt in future runs so retries are idempotent.
10. `pardner show TASK` → `"conflicts":{}`; `revisions.status` and `revisions.tags` each have one ID.
11. `pardner activity --task TASK --limit 5` → newest entries are two `task.resolve` operations by reviewer.
12. Reviewer comments: `pardner comment TASK 'Resolved status → review and tags → perf, edge after the sync conflict. @alice FYI'` → comment and mention created.
13. **Multi-surface:** Alice's browser shows the **Conflicting edits** badge disappear from the card and the new comment with "1 unread for alice".
14. Reviewer re-checks its queue: `pardner tasks --assignee reviewer --json` → no task carries a non-empty `conflicts` object.
15. Reviewer confirms the hub has the resolves: `pardner status` → `"syncPending":false` once the hub acknowledges the replica's heads (the browser equivalent is "Saved locally · synced").
##### Variations
- Resolve to a value that is not one of the alternatives: `pardner resolve TASK --field status --value completed --revisions '["OP_A","OP_B"]'` succeeds (`prepareResolve` does not check membership).
- Assignee conflict: `--field assignee --value builder`, or `--value null` to unassign.
- `--field order --value 1700000000000` (numeric JSON); `--field priority --value p0`.
##### Edge Cases
- `--field estimate` → "Choose a valid task field to resolve".
- `resolve` on a field with a single alternative is allowed (`allowConflict` only relaxes the >1 check), so a misused resolve behaves like an update.
- `comment-resolve` exists in dispatch but is absent from `pardner --help`, so an agent learning from HELP cannot discover it.

##### Merged source: cli-power-user/STORY-004 — Resolving a replica status conflict entirely from the CLI

**Type**: long
**Topic**: Agent power user on the CLI
**Persona**: `reviewer`, an agent on the hub; `ryan`, a human on a replica laptop that was offline on a train
**Goal**: Detect the competing `status` values written on two replicas and keep one explicitly, without losing either author's intent.
**Preconditions**: Hub on 8004/8005; replica on 8014/8015 enrolled; task `task-2d7be1f0a39c55e84b16f0aa` in `review`.
**Ideal path**: 3 — `show` (see `conflicts.status` with alternatives and revisions), `resolve` with chosen value and those revisions, `show` to confirm.
**Alternate paths**: UI Task details "Resolve status" with **Keep this status** (`task.resolve`); UI **Conflicting edits** badge on the card; `diff` exposes `conflicts` too; `operation --request` with `task.resolve`.

**Steps (from cli-power-user/STORY-004):**

1. Ryan, offline on the replica: `pardner update task-2d7b… --status completed --revisions '{"status":["op-handoff-review"]}' --data ~/.pardner-replica --actor ryan` → receipt `savedLocally: true`, `syncPending: true`, `status.hubConnected: false`.
2. Ryan checks `pardner status --data ~/.pardner-replica` → `syncPending: true`, `syncError` non-null. Saved locally, not yet at the hub.
3. Reviewer on the hub, unaware: `pardner show task-2d7b… --actor reviewer` → `status: "review"`, `revisions.status: ["op-handoff-review"]`.
4. Reviewer: `pardner update task-2d7b… --status in-progress --revisions '{"status":["op-handoff-review"]}' --actor reviewer --operation-id rev-reject-1` → success on hub.
5. Ryan reconnects; replica sync completes. Ryan's `pardner status` → `syncPending: false`, `lastSyncedAt` updated.
6. Reviewer polls `pardner tasks --status review` → task gone; `pardner tasks --status in-progress` → task present (selected winner) but its `conflicts` contains `status`.
7. Reviewer opens detail: `pardner show task-2d7b… --actor reviewer` → `conflicts.status` is an array of two alternatives `{value:"completed", operationId:"<ryan op>", actorId:"ryan", replicaId:"…", timestamp}` and `{value:"in-progress", operationId:"rev-reject-1", actorId:"reviewer", ...}`; `revisions.status` lists both IDs.
8. Wants a compact picture first: `pardner diff task-2d7b…` → `changes` flattened `{field:"status", old:"review", new:"completed", actorId:"ryan", operationId:"…"}` and the reviewer's change, plus the same `conflicts`.
9. Tries `update` to pick in-progress: `pardner update task-2d7b… --status in-progress --revisions '{"status":["<ryan op>","rev-reject-1"]}' --actor reviewer` → `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly".
10. Switches to resolve, first passing an object out of habit: `--revisions '{"status":[...]}'` → `REVISION_REQUIRED` "Supply the observed field revisions" with `details.current` listing both IDs.
11. Correct: `pardner resolve task-2d7b… --field status --value in-progress --revisions '["<ryan op>","rev-reject-1"]' --actor reviewer --operation-id rev-resolve-1` → receipt `result.taskId`, `replayed: false`.
12. `pardner show task-2d7b…` → `conflicts: {}`, `revisions.status: ["rev-resolve-1"]`, history has `task.resolve` with `status` change.
13. Reviewer explains: `pardner comment task-2d7b… '@ryan kept in-progress: the latency test still fails on CI'`.
14. Ryan on the replica `pardner mentions pending --actor ryan --data ~/.pardner-replica` → the new mention (delivery list comes from the hub ledger).

**Variations (from cli-power-user/STORY-004):**

- Resolving `assignee` to unassigned: `--field assignee --value null` (the string `null` is converted).
- Resolving `tags` or `order` requires JSON: `--field tags --value '["perf"]'`.
- Resolve also works when there is only one revision (no conflict); it behaves like an update.
- Goals/veins: `pardner goal resolve <goal> --field status --value achieved --revisions '[...]'`, `pardner vein resolve <vein> --field goalId --value goal-… --revisions '[...]'`.
- **Multi-surface:** the UI shows **Conflicting edits** on the card and "Resolve status" / "Both edits are preserved. Choose the value to keep." / **Keep this status** in Task details; History shows `task.resolve`.

**Edge Cases (from cli-power-user/STORY-004):**

- A third alternative arrives between steps 7 and 11 → `STALE_UPDATE` with `details.current` of three IDs.
- `--field estimate` → "Choose a valid task field to resolve".
- Branching a conflicted task is refused (STORY-121).
- `tasks --status` filters by the CRDT-selected winner only, so a task with a pending status conflict appears under just one column/filter.

---

#### STORY-066: Choosing between conflicting assignees and tags shows raw values
*(was conflict-resolution/STORY-009)*

**Type**: short
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno resolving a task after two offline reassignments
**Goal**: Pick the right assignee and tag set from the conflict section
**Preconditions**: Task has conflicts on `assignee` (bob set `builder`, alice set unassigned/`null`) and on `tags` (`["perf"]` vs `["perf","edge"]`). Alice in browser, Actor alice.
**Ideal path**: 3 — open card, choose assignee, choose tags.
**Alternate paths**: CLI `pardner resolve TASK --field assignee --value builder --revisions '[…]'`.
**Walkability**: `multi-service` (needs a replica-produced assignee/tags conflict)
**Related**: STORY-059, STORY-060, STORY-061, STORY-064, STORY-070, STORY-079
##### Steps
1. Alice opens the card → two sections, "Resolve assignee" and "Resolve tags", each with "Both edits are preserved. Choose the value to keep."
2. Under "Resolve assignee" the entries read "Bob Okafor · human" / `builder` and "Alice Moreno · human" / `null` — the value is the Actor ID or the literal text `null`, not "builder · agent" or "Unassigned" as elsewhere in the UI. She works out that `null` means unassigned and clicks **Keep this assignee** under `builder` → section disappears; card shows "builder · agent".
3. Under "Resolve tags" the values are `["perf"]` and `["perf","edge"]` (JSON). She clicks **Keep this tags** under the second → section disappears.
##### Variations
- "Resolve order" with two millisecond numbers and **Keep this order**: meaningless to a human (order is not editable in the UI).
- "Resolve description" shows raw markdown with no rendering, which can be long.
##### Edge Cases
- Button grammar is generated: **Keep this tags**, **Keep this description**; section heading uses the raw field key ("Resolve assignee").

---

#### STORY-067: Conflicting edits to the same comment
*(was conflict-resolution/STORY-010)* — **Merged sources:** comments-mentions/STORY-008 "Resolve a comment edited on two offline replicas with **Keep this comment**"

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: builder (agent, replica A) and Bob Okafor (human using the CLI on replica B) both correcting the same progress comment while the hub is down
**Goal**: End up with one agreed comment text without losing either correction
**Preconditions**: Comment "p95 is 340ms after the first pass" by builder on task "Add latency instrumentation", synced to both replicas; hub stopped. Alice watches in the browser on replica A.
**Ideal path**: 3 — see the alternatives, pick one, confirm read state.
**Alternate paths**: CLI `pardner comment-resolve COMMENT 'text' --revisions '["OP_A","OP_B"]'` (not listed in HELP).
**Walkability**: `multi-service`
**Related**: STORY-031, STORY-037, STORY-038, STORY-136
**Why merged**: Both produce conflicting edits of one comment on two offline replicas and settle with **Keep this comment**.
##### Steps
1. Builder: `pardner --data .pardner-a comments TASK` → comment with `"revisionIds":["OP_ADD"]`; then `pardner --data .pardner-a comment-edit COMMENT 'p95 is 310ms after the first pass' --revisions '["OP_ADD"]' --actor builder` → success.
2. Bob: `pardner --data .pardner-b comment-edit COMMENT 'p95 is 340ms (cold cache) after the first pass' --revisions '["OP_ADD"]' --actor bob` → success.
3. Hub restarts; replicas sync → in Alice's Task details, under the comment, two `.conflict` blocks appear, each with the editor's name ("builder · agent", "Bob Okafor · human"), the plain-text value, and **Keep this comment**. The comment body above shows one of the two texts rendered as markdown; there is no heading or explanatory sentence (unlike "Resolve {field}").
4. Alice notices **Comments (N)** reports "1 unread for alice" again even though she read the original: an unread check runs per revision ID.
5. Alice cannot write a merged text in the UI; she clicks **Keep this comment** under Bob's version → blocks disappear; comment shows Bob's text.
6. She clicks **Mark displayed comments read** → "0 unread for alice".
##### Variations
- Builder tries another `comment-edit` before anyone resolves → `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly"; `comment-delete` likewise.
- Combined text via CLI: `pardner comment-resolve COMMENT 'p95 is 310ms warm / 340ms cold after the first pass' --revisions '["OP_B","OP_C"]' --actor alice` writes a third value.
##### Edge Cases
- `@handle` mentions in either alternative remain active (`activeMentions` checks any alternative), so a mention added in the losing edit was already delivered.
- The conflict buttons show the raw text, so markdown formatting is not previewed.

##### Merged source: comments-mentions/STORY-008 — Resolve a comment edited on two offline replicas with **Keep this comment**

**Type**: long
**Topic**: Comments, mentions and read receipts
**Persona**: Alice Moreno on the hub laptop and Bob Okafor on a replica laptop on a train, both editing the same summary comment
**Goal**: Notice the conflicting comment edits and choose one, without losing either version.
**Preconditions**: Hub on 8004/8005 (`.pardner-walk`). Replica enrolled (`serve --data .pardner-replica --role replica --hub http://127.0.0.1:8004 --hub-ws ws://127.0.0.1:8005/automerge --hub-token TOKEN --http-port 8014 --ws-port 8015`). Alice's comment "Rollout plan: 10% on Monday" exists on task "Add latency instrumentation" with a single revision `r0`. Both humans have it read.
**Ideal path**: 6 steps: two concurrent edits, a reconnect, open the task, review the alternatives, keep one. Discovering the conflict should be possible from the board, but it is not.
**Alternate paths**: CLI `pardner comment-resolve comment-… 'text' --revisions '["rA","rB"]' --actor alice` (accepted by the CLI but missing from HELP). `pardner operation` with `comment.resolve`.

**Steps (from comments-mentions/STORY-008):**

1. Bob's replica loses the hub (train Wi-Fi). His browser on `http://127.0.0.1:8014/pardner/` still shows the task. SaveStatus reads "Saved locally · waiting for hub" after his next write.
2. Bob runs `pardner --data .pardner-replica comments task-…` → `revisionIds: ["r0"]`.
3. Bob: `pardner --data .pardner-replica comment-edit comment-… 'Rollout plan: 10% on Tuesday (Monday is a holiday)' --revisions '["r0"]' --actor bob` → `savedLocally: true`, `syncPending: true`.
4. Meanwhile Alice on the hub: `pardner --data .pardner-walk comment-edit comment-… 'Rollout plan: 25% on Monday' --revisions '["r0"]' --actor alice` → success.
5. Bob's train reaches the station and the replica reconnects. SaveStatus moves to "Saved locally · synced".
6. Alice glances at the board. The task card shows **no** "Conflicting edits" badge, because the badge covers task fields only.
7. She opens the task by chance → the comment card shows one alternative as its main body (the deterministic pick), then two conflict blocks below it. One is "alice · human / Rollout plan: 25% on Monday", the other "bob · human / Rollout plan: 10% on Tuesday (Monday is a holiday)", each with **Keep this comment**.
8. The header text reads "1 unread for alice". Both new revisions lack receipts, including the one she wrote.
9. She reads Bob's reason and decides his date wins, but wants her percentage. There is no merge editor. She can only keep one alternative as written.
10. She clicks **Keep this comment** under Bob's block → "Saving locally…". The conflict blocks disappear and the body reads "Rollout plan: 10% on Tuesday (Monday is a holiday)".
11. She still wants 25%. She runs `pardner comments task-…` to get the new single revision, then `pardner comment-edit comment-… 'Rollout plan: 25% on Tuesday (Monday is a holiday)' --revisions '["rC"]' --actor alice`.
12. In the panel the body updates. "1 unread for alice" is still shown, because the resolve and the edit each created a fresh revision.
13. She clicks **Mark displayed comments read** → "0 unread for alice".
14. On Bob's replica browser, the comment shows the final text and "1 unread for bob".
**Multi-surface:** Activity on both machines lists `comment.edit` (bob), `comment.edit` (alice), `comment.resolve` (alice), `comment.edit` (alice), and the `read.mark` entries. The comment card still credits "alice · human" as author although Bob wrote the winning text.

**Variations (from comments-mentions/STORY-008):**

- Bob resolves on the replica while still offline → his `comment.resolve` supersedes both revisions he observed and syncs later without a new conflict, unless Alice also resolved concurrently.
- Alice tries CLI `comment-edit` while the conflict exists → `CONFLICT_REQUIRES_RESOLUTION` ("Resolve the concurrent alternatives explicitly"). Only `comment-resolve` (or **Keep this comment**) accepts multiple expected revisions.

**Edge Cases (from comments-mentions/STORY-008):**

- Alice clicks **Keep this comment** after a third concurrent revision synced in but before her panel re-fetched → `STALE_UPDATE`. The alert reads "This field changed since it was read; refresh its context" with "Your draft is preserved. Review the latest context before making a new edit." The pending write clears and she can click again on the refreshed list.
- One alternative mentioned `@reviewer` and the kept one does not → that mention becomes inactive once the discarded alternative is superseded, and it disappears from `mentions pending`.
- She clicks **Mark displayed comments read** *before* resolving → both revisions receive receipts. The count goes to 0 and the conflict remains. "Read" and "resolved" are separate states.

---

#### STORY-068: A goal's status conflict is visible in the UI but resolvable only from the CLI
*(was conflict-resolution/STORY-011)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno (product lead) after she and Bob both recorded a goal verdict offline
**Goal**: Settle whether goal "p95 under 200ms" is achieved or abandoned
**Preconditions**: Goal "p95 under 200ms" with vein "Edge caching"; offline, alice ran `goal update GOAL --status achieved` on replica A and bob ran `--status abandoned` on replica B; synced.
**Ideal path**: 2 — open goal, choose value.
**Alternate paths**: `pardner operation --request` with `goal.resolve`.
**Walkability**: `multi-service`
**Related**: STORY-053, STORY-054, STORY-069
##### Steps
1. Alice clicks **Goals** in the workspace nav → goal "p95 under 200ms" shows one status pill (Achieved or Abandoned, whichever is selected) and a **Conflicting edits** line.
2. She clicks the goal heading expecting a detail view → nothing happens; only vein buttons are clickable, and clicking "Edge caching" switches to **Tasks** filtered by that vein, which shows no conflict info for the goal.
3. She opens a terminal: `pardner goal show GOAL` → `{"goal":{…},"revisions":{"status":["OP_A","OP_B"]},"conflicts":{"status":[{"value":"achieved","actorId":"alice",…},{"value":"abandoned","actorId":"bob",…}]},…}`.
4. She tries `pardner goal update GOAL --status achieved --revisions '{"status":["OP_A","OP_B"]}' --actor alice` → `CONFLICT_REQUIRES_RESOLUTION`.
5. `pardner goal resolve GOAL --field status --value achieved --revisions '["OP_A","OP_B"]' --actor alice` → success `{"goalId":…}`.
6. Back in the browser (live) → Goals view shows "Achieved" pill and no **Conflicting edits**.
##### Variations
- Title conflict on the goal: `goal resolve GOAL --field title --value 'p95 under 200ms in EU' --revisions '[…]'`.
- `--field goalId` on a goal → "Choose a valid goal field to resolve".
##### Edge Cases
- Goal **description** conflicts show only the selected description text plus the badge; the other alternative is invisible in the UI.
- The empty-state hint teaches `pardner vein create`, but nothing in the UI teaches `goal resolve`.

---

#### STORY-069: A vein moved to two different goals concurrently
*(was conflict-resolution/STORY-012)*

**Type**: medium
**Topic**: Concurrent edits and conflict resolution
**Persona**: Bob Okafor reorganising veins; builder (agent) doing the same on another replica
**Goal**: Leave "Edge caching" under exactly one goal
**Preconditions**: Goals "p95 under 200ms" (GOAL_1), "Cut CDN spend 20%" (GOAL_2) and "Reduce origin load" (GOAL_3); vein "Edge caching" under GOAL_1. While the hub is down: bob on replica B runs `vein update VEIN --goal GOAL_2 --revisions '{"goalId":["R"]}'`; builder on replica A runs `vein update VEIN --title 'Edge caching (EU)' --goal GOAL_3 --revisions '{"title":["T"],"goalId":["R"]}'`. Then sync.
**Ideal path**: 3 — see vein in two places, choose goal, confirm.
**Alternate paths**: none found in the UI.
**Walkability**: `multi-service`
**Related**: STORY-045, STORY-048, STORY-051, STORY-052, STORY-053, STORY-054, STORY-068
##### Steps
1. After sync, Alice opens **Goals** → "Edge caching (EU)" appears under both "Cut CDN spend 20%" and "Reduce origin load" (the view lists a vein under every alternative `goalIds`), each row with **Conflicting edits**; the title edit merged without conflict.
2. She thinks the vein was duplicated and clicks one row → board filtered by that vein shows the same tasks, confirming it is one vein.
3. `pardner vein show VEIN` → `"revisions":{"goalId":["OP_B","OP_C"]}` and `"conflicts":{"goalId":[…]}`.
4. `pardner vein resolve VEIN --field goalId --value GOAL_2 --revisions '["OP_B","OP_C"]' --actor bob` → success.
5. Goals view → vein listed only under "Cut CDN spend 20%", no badge.
##### Variations
- `--value` with a mistyped goal ID → `NOT_FOUND` "Goal not found: …".
- Vein status conflict (`proven` vs `dead-end`): `vein resolve VEIN --field status --value proven --revisions '[…]'`; until then the row's **Ready for a verdict** and pill still render alongside **Conflicting edits**.
##### Edge Cases
- Task–vein links are add-wins: if bob ran `vein remove VEIN TASK --revisions '[…]'` while builder concurrently ran `vein add VEIN TASK`, the link survives and no conflict badge appears; Bob sees the task still labelled with the vein and may think his remove failed.

---

#### STORY-070: A late offline edit reopens a conflict that was already resolved
*(was conflict-resolution/STORY-013)*

**Type**: short
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno; builder's replica was offline for a day
**Goal**: Understand why a resolved task shows **Conflicting edits** again
**Preconditions**: Status conflict resolved to `review` by bob; meanwhile builder's long-offline replica had set `in-progress` from the original state and now reconnects.
**Ideal path**: 2 — see conflict, choose.
**Alternate paths**: CLI `pardner resolve`.
**Walkability**: `multi-service`
**Related**: STORY-059, STORY-060, STORY-061, STORY-064, STORY-065, STORY-066, STORY-071, STORY-079, STORY-083, STORY-137
##### Steps
1. Builder's replica reconnects → card shows **Conflicting edits** again; "Resolve status" lists `review` (author "Bob Okafor · human", the resolution) and `in-progress` ("builder · agent", the late edit) — as qualified by the late-edit test.
2. Alice checks **History** → sees bob's earlier `task.resolve`; the late `task.update` by builder appears by its timestamp, possibly older than the resolve, so it is not at the top.
3. She clicks **Keep this status** under `review` → section disappears.
##### Variations
- The late edit is a value equal to the resolved one: still two alternatives, two identical-looking entries.
##### Edge Cases
- Nothing distinguishes "this was the previous resolution" from an ordinary edit in the conflict list.

---

#### STORY-071: A full outage day with multi-field conflicts across two replicas and an agent
*(was conflict-resolution/STORY-014)*

**Type**: long
**Topic**: Concurrent edits and conflict resolution
**Persona**: Alice Moreno (replica A browser), Bob Okafor (replica B browser), builder (agent CLI on replica A)
**Goal**: Keep working through a hub outage, then reconcile every conflicting field and comment so all replicas converge with nothing silently lost
**Preconditions**: Shared setup synced; tasks "Add latency instrumentation" (T1) and "Write CDN runbook" (T2); Actors alice, bob, builder, reviewer.
**Ideal path**: 14 — about one action per offline edit, one glance per surface after reconnect, one choice per conflicted field.
**Alternate paths**: Every resolution can be done from the CLI (STORY-065, STORY-067); goal/vein parts only from CLI.
**Walkability**: `multi-service`
**Related**: STORY-065, STORY-070, STORY-074, STORY-080, STORY-083, STORY-137
##### Steps
1. Hub operator stops the hub → both browsers stay usable; no banner, since each browser talks to its local replica.
2. Alice opens T1, **Edit task**, sets **Status** "Review" and **Description** "Instrumentation done; dashboards linked." → **Save changes**; SaveStatus "Saved locally · waiting for hub".
3. Bob opens T1 on replica B, **Edit task**, sets **Status** "Completed", **Priority** "p0" → **Save changes**; "Saved locally · waiting for hub".
4. Builder on replica A: `pardner show T1` (sees Alice's status) and `pardner update T1 --description 'Instrumentation merged in abc1234' --revisions '{"description":["OP_ALICE_DESC"]}'` → success (same replica, sequential, no conflict yet); Alice's panel live-updates the description.
5. Bob on T2: **Edit task**, **Title** "Write CDN runbook v2" → saved.
6. Alice on T2: **Edit task**, **Tags, separated by commas** "docs, cdn" → saved.
7. Builder edits its earlier comment on T1 via `comment-edit`; Bob on replica B edits the same comment via `pardner --data .pardner-b comment-edit …` (Bob uses CLI because the UI has no comment edit).
8. Bob tries **Hand off work** on T1 to reviewer while offline → succeeds locally (handoff only needs local replica), assignee reviewer, status Review, comment with mention; delivery to reviewer waits for the hub (hub required for new delivery leases).
9. Hub restarts with the same data → both SaveStatus labels reach "Saved locally · synced".
10. Alice's board → T1 shows **Conflicting edits**; T2 shows "Write CDN runbook v2" with tags merged and no badge (different fields).
11. Alice opens T1 → only one section, "Resolve status", with two entries: "Alice Moreno · human" / `review` and "Bob Okafor · human" / `review` (Bob's handoff superseded his own `completed` on replica B, so the alternatives are Alice's update and Bob's handoff). Both say `review`; she is puzzled why identical values still need a choice. There is no description conflict (Alice and builder edited sequentially on the same replica) and priority merged cleanly (only Bob changed it).
12. She reads the `assignee` line: header shows "reviewer · agent" — no conflict, only Bob's handoff changed it.
13. Under "Resolve status" she clicks either **Keep this status** (both are `review`) → section disappears; the task stays in Review assigned to reviewer.
14. Under the comment, two **Keep this comment** blocks; she keeps builder's text.
15. **Comments (N)** shows unread for alice including the handoff comment; she clicks **Mark displayed comments read** → "0 unread for alice".
16. **Multi-surface:** Bob's browser updates live — badge gone on T1; his History shows "Alice Moreno · task.resolve" and "Alice Moreno · comment.resolve".
17. Reviewer (agent) on the hub: `pardner mentions claim-next --request-id r1 --actor reviewer` → receives Bob's handoff mention now that the hub is back; `pardner show T1 --actor reviewer` returns `"conflicts":{}`.
18. Operator verifies convergence: `pardner --data .pardner-a show T1` and `pardner --data .pardner-b show T1` return identical `revisions`.
19. Alice opens **Activity** → every offline operation from all three Actors is listed newest first with its Actor and type; the two resolves are at the top.
##### Variations
- Bob had instead tried to hand off after reconnecting while the status conflict existed → `CONFLICT_REQUIRES_RESOLUTION` (STORY-064).
- If Alice's browser had a pending uncertain write when the hub came back, she must first use **Retry saved request** — "Resolve the saved request before starting another change." blocks **Keep this status**.
##### Edge Cases
- `task.branch` / `merge` on T1 while conflicted → "Resolve parent task conflicts before branching" / "Resolve branch conflicts before merging" (`CONFLICT_REQUIRES_RESOLUTION`).
- SaveStatus "Saved locally · synced" proves hub persistence acknowledgement, not that the other replica has received the change; convergence is only visible when the other browser updates.
- Process-crash tests do not establish power-loss durability; the story does not claim it.

---

### Offline, sync status and reconnection

<details><summary>Topic background (from offline-sync.md)</summary>

Source of truth for this topic: `ui-prototype/src/Pardner.jsx` (`SaveStatus` 66-83, connection effect 190-267, `submit` 271-323, header notices 415-429, `TaskDetail` 809), `ui-prototype/src/connection.js`, `lib/workspace-runtime.js` (`init`, `status`, `synchronizeAcknowledgement`, `forwardDelivery`), `lib/local-service.js`, `lib/ticket-network-adapter.js`, `lib/sync-client.js`, `lib/cli.js`, `automerge-sync-server.js`, `README.md`, `docs/PARDNER-CLI.md`, `docs/PARDNER-ACCEPTANCE.md`.

Reference facts used across stories:

- `SaveStatus` text is decided in this order: busy → "Saving locally…"; socket not open → "Local service disconnected"; `storageError` → "Local save failed"; local heads not persisted or not equal to displayed heads → "Saving locally…"; `syncPending` → "Saved locally · waiting for hub"; otherwise "Saved locally · synced". Before the first status arrives it reads "Connecting to local service".
- On a **hub**, `syncPending` is only `!savedLocally`, so the hub's own UI reads "Saved locally · synced" as soon as it has saved to disk, whether or not any replica is connected. On a **replica**, `syncPending` stays true until a `/automerge/sync-ack` response from the hub covers the current heads.
- `pardner status` returns `{ success, role, workspaceId, heads, replicaId, savedLocally, hubConnected, syncPending, lastSyncedAt, storageError, syncError }`. The browser never shows `hubConnected`, `syncError` or `lastSyncedAt`.
- **Multi-surface:** `SaveStatus` is rendered twice when a task is open: once under the header `h1` and once in the **Task details** panel. Both are `role="status"` live regions with identical text.

</details>

#### STORY-072: Check whether a replica has caught up using `pardner status`
*(was offline-sync/STORY-001)* — **Merged sources:** cli-power-user/STORY-001 "Agent checks the local service before starting a session"

**Type**: short
**Topic**: Offline, sync status and reconnection
**Persona**: Priya Natarajan, a backend engineer running a replica on her laptop who wants to know if her morning comments reached the hub before she closes the lid
**Goal**: Confirm from the terminal that the laptop replica's latest changes are persisted by the hub.
**Preconditions**: Replica enrolled in `.pardner-replica` and serving on `http://127.0.0.1:8014`; the hub is reachable; Priya added two comments a minute ago.
**Ideal path**: 1 step: one read-only command already returns every field she needs.
**Alternate paths**: The browser header `SaveStatus` on `http://127.0.0.1:8014/pardner/` ("Saved locally · synced"); `pardner tasks --json` and `pardner show TASK --json` both embed the same `status` object.
**Walkability**: `multi-service`
**Related**: STORY-073, STORY-074, STORY-075, STORY-078, STORY-081, STORY-083, STORY-106, STORY-125, STORY-135
**Why merged**: Both read `pardner status` on a replica to learn identity, `syncPending` and `hubConnected`.
##### Steps
1. Runs `node bin/pardner.js --data .pardner-replica status` → One JSON line: `{"success":true,"role":"replica","workspaceId":"…","heads":["…"],"replicaId":"replica-…","savedLocally":true,"hubConnected":true,"syncPending":false,"lastSyncedAt":"2026-11-07T09:41:12.884Z","storageError":null,"syncError":null}`.
2. Reads `syncPending: false` and a fresh `lastSyncedAt`, and closes the lid → (No further output.) She hesitates over `hubConnected` vs `syncPending`; the CLI guide says "An open socket alone is insufficient", so `syncPending` is the one that matters.
##### Variations
- She forgets `--data` while her shell is in the repo root: the CLI reads `.pardner/connection.json` (the hub's directory on this machine) and reports `"role":"hub"`, `"hubConnected":true`, `"syncPending":false` for the wrong service. Nothing tells her she queried the hub rather than her replica except the `role` field.
- She sets `PARDNER_DATA_DIR=.pardner-replica` once and then runs `pardner status` without flags.
##### Edge Cases
- Replica service is not running: `{"success":false,"error":{"code":"LOCAL_SERVICE_UNAVAILABLE","message":"Could not reach sync server: fetch failed","details":null}}` and stderr `LOCAL_SERVICE_UNAVAILABLE: Could not reach sync server: fetch failed`, exit code 1.
- Hub down: `hubConnected:false`, `syncPending:true`, and `syncError` holds the last transport message (for example a "Could not reach sync server: …" string or "WebSocket handshake timed out"). `lastSyncedAt` keeps the previous time, so it can look recent while she is in fact out of date.
- Disk failure on the replica: `storageError` is non-null and `savedLocally` false.
- After a replica restart `lastSyncedAt` is `null` until the first acknowledgement in the new process, because it lives in memory only.

##### Merged source: cli-power-user/STORY-001 — Agent checks the local service before starting a session

**Type**: short
**Topic**: Agent power user on the CLI
**Persona**: `builder`, a Codex agent Actor starting a fresh shell in `/Users/dev/pardner-work` on a replica laptop
**Goal**: Confirm the local service is up, which workspace/replica it is, and whether local writes are synced to the hub.
**Preconditions**: `pardner serve --role replica ...` running with `--data /Users/dev/.pardner-replica`; hub currently reachable.
**Ideal path**: 1 — a single `status` read returns identity, durability and hub state together.
**Alternate paths**: UI header **SaveStatus** live region ("Saved locally · synced" / "Saved locally · waiting for hub" / "Local service disconnected"); `GET /automerge/status` directly; `tasks` also embeds the same `status` object; every mutation receipt carries `status`.

**Steps (from cli-power-user/STORY-001):**

1. Runs `pardner status --json` from the repo root, adding `--json` out of habit → the CLI looks for `.pardner/connection.json` relative to cwd, finds none, falls back to `http://127.0.0.1:8004` (the replica's port here) with no token → stdout `{"success":false,"error":{"code":"AUTH_REQUIRED","message":"Unauthorized","details":null}}`, stderr `AUTH_REQUIRED: Unauthorized`, exit 1.
2. Realises the data dir is elsewhere and reruns `pardner status --data /Users/dev/.pardner-replica` (drops `--json`; the output is the same JSON either way) → `{"success":true,"role":"replica","workspaceId":"…","heads":[…],"replicaId":"…","savedLocally":true,"hubConnected":true,"syncPending":false,"lastSyncedAt":"2026-11-07T15:02:11.482Z","storageError":null,"syncError":null}`.
3. Notes `workspaceId` and `replicaId` for later bridge configuration (STORY-126).

**Variations (from cli-power-user/STORY-001):**

- Hub down: `hubConnected: false`, `syncPending: true`, `syncError` holds the last fetch error text; `savedLocally` stays `true`.
- On a hub: `role: "hub"`, `hubConnected` is always `true`, `syncPending` only reflects local flush.
- `pardner help` prints plain text; `pardner help --json` returns the same text wrapped in JSON — the only place `--json` matters.

**Edge Cases (from cli-power-user/STORY-001):**

- Service not running → `LOCAL_SERVICE_UNAVAILABLE`, message "Could not reach sync server: fetch failed".
- `storageError` non-null means the replica cannot persist; subsequent writes fail with `STORAGE_FAILED`.
- **Multi-surface:** the same `status` object appears inside `tasks`, `show` (`status` field), every receipt, and drives the UI SaveStatus text; four ways to read one fact.

---

#### STORY-073: Enroll a laptop replica against the desktop hub
*(was offline-sync/STORY-002)*

**Type**: medium
**Topic**: Offline, sync status and reconnection
**Persona**: Marcus Webb, a staff engineer setting up his laptop so he can keep working on the train; the hub runs on his desk machine `desk.local`
**Goal**: Create a replica that holds the full workspace and syncs with the hub.
**Preconditions**: Hub started with `PARDNER_BIND_HOST=192.168.1.20 node bin/pardner.js serve --data .pardner` on the desk machine; ports 8004/8005 reachable from the laptop; Marcus has the hub token from the desk's `.pardner/connection.json`; the laptop has an empty `.pardner` directory or none.
**Ideal path**: 2 steps: one enrollment command, then open the local UI with the token it generated.
**Alternate paths**: Environment variables instead of flags: `PARDNER_ROLE=replica PARDNER_HUB_URL=… PARDNER_HUB_WS_URL=… PARDNER_HUB_TOKEN=… pardner serve`. No UI path exists for enrollment.
**Walkability**: `multi-service`
**Related**: STORY-072, STORY-074, STORY-075, STORY-078, STORY-081, STORY-083, STORY-135
##### Steps
1. Runs `node bin/pardner.js help` to recall the flags → The usage line reads `pardner serve [--role hub|replica] [--data directory] [--hub URL] [--hub-ws URL]`. `--hub-token`, `--http-port` and `--ws-port` are not listed, so he opens `docs/PARDNER-CLI.md` "Enroll another machine" to find them.
2. Runs `node bin/pardner.js serve --data .pardner --role replica --hub http://192.168.1.20:8004 --hub-ws ws://192.168.1.20:8005/automerge --hub-token "$PARDNER_HUB_TOKEN"` → The process stays in the foreground and prints `{"success":true,"serving":true,"role":"replica","workspaceId":"…","httpUrl":"http://127.0.0.1:8004","wsUrl":"ws://127.0.0.1:8005","phoneAccess":{…}}`. The workspace ID matches the hub's.
3. In a second terminal runs `node bin/pardner.js status` → `"role":"replica"`, `"hubConnected":true`, and within a second `"syncPending":false`.
4. Runs `node -e "console.log(require('./.pardner/connection.json').token)"` → Prints the laptop's own local API token (newly generated, different from the hub token). The file also holds `hubToken`.
5. Opens `http://127.0.0.1:8004/pardner/` → Connection screen: "Pardner", "One workspace for human and agent Actors.", **Connect with a local service token** is open (loopback, so `canManageAccess` is true).
6. Pastes the laptop token into **Local service token** and clicks **Connect** → "Opening your local workspace…" then the board with every hub task; header status passes "Connecting to local service" → "Saved locally · synced".
7. Picks **Actor** "Marcus Webb · human" and opens a task → The **Task details** panel shows the same "Saved locally · synced".
##### Variations
- Hub and replica on the same machine for a rehearsal: Marcus must add `--http-port 8014 --ws-port 8015` (as in the discovery guide), otherwise the replica cannot bind 8004/8005.
- He pastes the hub's token into the laptop UI by mistake: it fails with `AUTH_REQUIRED` and the pairing screen says "The service credential changed. Pair again or enter the current local service token.", which suggests the credential changed rather than that he used the wrong machine's token.
##### Edge Cases
- `--hub-token` omitted: `hubToken` falls back to the replica's freshly generated local token, the hub replies 401, and enrollment fails with `{"success":false,"error":{"code":"AUTH_REQUIRED","message":"Unauthorized",…}}`.
- `--hub-ws` omitted: the hub identity fetch succeeds first, then enrollment fails with `INVALID_ARGUMENT` "Configure the hub HTTP URL and native WebSocket URL".
- `--hub` omitted: `INVALID_ARGUMENT` "Configure PARDNER_HUB_URL before enrolling a replica".
- Hub not reachable: the very first request fails with `LOCAL_SERVICE_UNAVAILABLE` "Could not reach sync server: fetch failed". The code names the *local* service even though the hub is what is down. (A 2-second timeout instead gives an abort error with `INTERNAL_ERROR`.) No manifest is written, so retrying the same command later works.
- Directory already holds an old or foreign layout: `INCOMPATIBLE_SCHEMA` "This directory contains data without compatible workspace metadata; choose a new directory". The data is left untouched.
- Directory previously used as a hub: `ROLE_MISMATCH` "Use the role recorded for this storage directory".
- Hub bound with `PARDNER_BIND_HOST` while LAN device access was enabled earlier: the hub's **Pair another device** dialog reports "Companion device setup requires a token-protected loopback service. Remove PARDNER_BIND_HOST overrides and restart." A hub cannot serve remote replicas and LAN companion pairing at the same time.
- With `PARDNER_BIND_HOST=192.168.1.20` the hub no longer listens on 127.0.0.1, so the desk browser must use `http://192.168.1.20:8004/pardner/`. That origin is not in the default allowed list (localhost/127.0.0.1 on 8004 and 5174), so POSTs from that page are rejected with "Origin not allowed. Open the current address shown in Pair another device." unless `PARDNER_ALLOWED_ORIGINS=http://192.168.1.20:8004` is also set (see STORY-083).

---

#### STORY-074: Keep working on a replica while the hub is down
*(was offline-sync/STORY-003)*

**Type**: medium
**Topic**: Offline, sync status and reconnection
**Persona**: Marcus Webb (laptop replica on 8014/8015) on a train with no network; the desk hub is unreachable
**Goal**: Edit a task and comment while offline, with a clear indication that the changes are local only.
**Preconditions**: Replica enrolled, its UI open and connected at `http://127.0.0.1:8014/pardner/`, Actor "Marcus Webb · human" selected. Task "Add latency instrumentation" exists. Hub unreachable.
**Ideal path**: 3 steps: open task, save the change, read the status. The status already distinguishes local save from hub persistence.
**Alternate paths**: CLI `pardner --data .pardner-replica comment TASK 'text' --actor marcus` and `update … --revisions` give the same local-save receipt; the receipt includes `"syncPending":true` and a `status` object.
**Walkability**: `multi-service`
**Related**: STORY-071, STORY-072, STORY-073, STORY-075, STORY-078, STORY-080, STORY-081, STORY-083, STORY-135
##### Steps
1. Glances at the header → "Saved locally · waiting for hub". Nothing else on screen mentions the hub or that it is unreachable.
2. Clicks the card "Add latency instrumentation" → **Task details** opens; its own status line also reads "Saved locally · waiting for hub".
3. Clicks **Edit task**, changes **Priority** from P1 to P0, clicks **Save changes** → Both status lines briefly show "Saving locally…", then return to "Saved locally · waiting for hub". History gains "marcus · task.update · …" with `priority: p1 → p0`.
4. Types in **Comment** ("Share progress or mention an Actor with @handle"): "Measured p95 at 340ms on the staging box, see trace" and clicks **Add comment** → The comment appears under **Comments (N+1)** right away and the textarea clears. Status reads "Saved locally · waiting for hub".
5. Wonders whether the comment reached anyone and looks for a hub indicator → There is none. The amber "waiting" state is the same whether the hub is down for hours or just slow to acknowledge.
6. Runs `node bin/pardner.js --data .pardner-replica status` in a terminal → `"hubConnected":false`, `"syncPending":true`, and `syncError` with the transport message. The terminal is the only place to see why it is waiting.
##### Variations
- He types `@reviewer please look` in the comment: the comment and the mention record save locally, but no delivery can be leased until the hub is back (`mentions claim-next` on the replica fails with `HUB_UNAVAILABLE`).
- Same session at 390×844 (phone-width laptop window): header stacks; the status text is still in the header and in the panel.
##### Edge Cases
- Marcus tries to register a new Actor from the replica CLI: `HUB_REQUIRED` "Register new Actors on the hub" (even when the hub is up; registration is hub-only).
- The replica disk fills: status changes to "Local save failed" and the operation returns `STORAGE_FAILED` (507), shown in the header alert with "Your last confirmed data remains available."
- The hub comes back while the panel is open: within about a second both status lines flip to "Saved locally · synced" with no other notice (see STORY-078).

---

#### STORY-075: Reopen an enrolled replica with no hub at all
*(was offline-sync/STORY-004)*

**Type**: medium
**Topic**: Offline, sync status and reconnection
**Persona**: Aiko Tanaka, a product designer whose laptop rebooted on a plane; she has an enrolled replica and no Wi-Fi
**Goal**: Restart the local service and get back to her tasks without the hub.
**Preconditions**: `.pardner` on the laptop was enrolled earlier as a replica (`workspace.json` has `"role":"replica"`, `"state":"ready"`, hub URLs). Browser previously connected, so the token is in localStorage. No network.
**Ideal path**: 2 steps: start the service with only `--data`, reload the tab. Role, hub addresses, ports and credentials are remembered.
**Alternate paths**: `npm run sync` also starts the local service (README). None other found.
**Walkability**: `multi-service`
**Related**: STORY-072, STORY-073, STORY-074, STORY-078, STORY-081, STORY-083, STORY-135
##### Steps
1. Opens the Pardner tab that was restored after reboot → The service isn't running yet: "Pardner", the raw browser fetch error (for example "Failed to fetch" in Chromium, "Load failed" in WebKit), "Check that the service is running. If the address changed, open Pair another device on the desktop.", and **Retry connection**.
2. Unsure whether she must repeat the long enrollment command, she runs just `node bin/pardner.js serve --data .pardner` → `{"success":true,"serving":true,"role":"replica",…}` within a few seconds (acceptance bound: 5 seconds with the hub inaccessible). Role and hub addresses come from `workspace.json`, ports and tokens from `connection.json`.
3. Clicks **Retry connection** in the tab → "Opening your local workspace…", then the full board with her tasks, Actor "Aiko Tanaka · human" still selected, and her last **Tasks**/**Goals**/**Activity** view and filters restored.
4. Reads the header → "Saved locally · waiting for hub" (the replica's acknowledged heads reset to empty on every start, so it stays "waiting" until the hub is reached again, even if everything was synced before the reboot).
5. Opens a task and adds a comment → Saves immediately; status unchanged.
##### Variations
- She passes the original flags again (`--role replica --hub … --hub-ws … --hub-token …`): accepted; same result.
- She passes `--role hub` by mistake: `ROLE_MISMATCH` "Use the role recorded for this storage directory". Nothing is changed.
##### Edge Cases
- The service was already running in another terminal: `STORAGE_IN_USE` "Another Pardner service is using this storage directory".
- Her first enrollment had been interrupted (`"state":"enrolling"`): reopening offline has to find the workspace document from the hub and fails after about 8 seconds. Only a finished enrollment can reopen offline.
- Retry on the top-level startup screen does not repeat on its own: the `config` load has no automatic backoff, so unless she clicks **Retry connection** or reloads, the tab stays on the error.

---

#### STORY-076: Service restarts while the board is open
*(was offline-sync/STORY-005)*

**Type**: medium
**Topic**: Offline, sync status and reconnection
**Persona**: Dev Okafor, an engineer who restarts the hub on his desktop after pulling a new build, with the board open in Chrome
**Goal**: See that live updates stopped, and get them back without reloading or re-entering the token.
**Preconditions**: Hub serving `.pardner` on 8004/8005; UI open and connected; Actor "Dev Okafor · human" selected; Tasks view filtered by **Assigned to** "Dev Okafor".
**Ideal path**: 1 step: restart the service; the UI reconnects by itself. **Retry connection** only skips the backoff.
**Alternate paths**: Focusing the window, coming back to the tab (`visibilitychange`) or the browser `online` event also triggers an immediate reconnect attempt. Reloading the page also works.
**Walkability**: `multi-service` (single hub restart)
**Related**: STORY-007, STORY-016
##### Steps
1. Presses Ctrl-C in the service terminal → In the browser the header status changes to "Local service disconnected" and a notice appears below the header: "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." with **Retry connection**. The board stays visible with the last data.
2. Waits about a second → The first automatic attempt fails while reloading `/pardner/config`. The notice text is replaced with the raw browser error (for example "Failed to fetch"), so the helpful "Reconnecting automatically" sentence is gone even though retries continue (1s, 2s, 4s, 8s, then every 15s).
3. Clicks **Retry connection** while the service is still down → Another immediate attempt, same raw message.
4. Runs `node bin/pardner.js serve --data .pardner` again → `{"success":true,"serving":true,"role":"hub",…}`.
5. Switches back to the browser tab → Focus triggers a reconnect at once: notice disappears, status returns to "Saved locally · synced"; filter and Actor unchanged.
6. Opens a task and adds a comment to confirm writes work → Comment appears; status goes "Saving locally…" → "Saved locally · synced".
##### Variations
- He leaves the tab in the background for 10 minutes: retries continue every 15 seconds; on return the `visibilitychange` event reconnects immediately.
- Only the WebSocket port (8005) is blocked by a firewall: HTTP calls succeed but the socket never opens. After 10 seconds the open timeout closes it and the "Live updates disconnected…" message returns repeatedly. The "both service ports" hint is the only clue.
- With the **Task details** panel open, its status line also shows "Local service disconnected". Its content stays from the last load.
##### Edge Cases
- Restarted with a rotated `PARDNER_API_TOKEN`: the reconnect gets `AUTH_REQUIRED`, the stored credential is dropped, and the UI goes back to the connection screen with "The service credential changed. Pair again or enter the current local service token." Automatic retries stop.
- Restarted against a different `--data` directory: the new `workspaceId` remounts the app. Credentials are stored per workspace, so the connection screen appears with no explanation that this is a different workspace.
- The service sends a malformed frame: "The service sent an unreadable update. Reconnecting…" and the socket is closed and retried.
- An HTTP response that isn't JSON: "The service returned an unreadable response. Retry the connection."

---

#### STORY-077: Recover a request that might not have saved
*(was offline-sync/STORY-006)* — **Merged sources:** errors-bootstrap/STORY-010 "A write is interrupted and must be confirmed before the next change"

**Type**: medium
**Topic**: Offline, sync status and reconnection
**Persona**: Lena Hoffmann, an engineering manager who changes a task's status just as her laptop's local service crashes
**Goal**: Find out whether her edit was applied and finish it once, with no duplicate.
**Preconditions**: Laptop service on 8004; UI connected; Actor "Lena Hoffmann · human"; task "Write rollout runbook" in Up next.
**Ideal path**: 2 steps: after the service is back, one click on **Retry saved request**, then read the result. The saved operation ID makes the retry safe.
**Alternate paths**: CLI retry with the same ID: `pardner update TASK --status in-progress --revisions JSON --operation-id <same id> --actor lena` (README: "Use the same operation ID and identical payload to retry an uncertain write"). The ID is in sessionStorage `pardner:<workspaceId>:pending`, which is not shown in the UI.
**Walkability**: `multi-service` (kill/restart the single local service mid-write)
**Related**: STORY-004, STORY-097, STORY-101, STORY-117
**Why merged**: Both lose a response mid-write, see "A request is awaiting confirmation." / "Resolve the saved request before starting another change.", and finish with **Retry saved request**.
##### Steps
1. In **Task details**, clicks **Edit task**, sets **Status** to In progress, clicks **Save changes** while the service process is being killed → Status reads "Saving locally…". The request fails with the browser transport error. The header alert shows that raw message (for example "Failed to fetch"), "Your last confirmed data remains available.", and **Retry saved request**.
2. Tries to start something else: clicks **Add comment** in the panel (still enabled, because the panel only checks Actor and busy) → The header alert changes to "Resolve the saved request before starting another change." with **Retry saved request**. **New task** in the header is disabled.
3. Clicks **Retry saved request** while the service is still down → Same transport error again; pending kept.
4. Reloads the tab out of habit → After the service restarts and the board opens, a notice reads "A request is awaiting confirmation." with **Retry saved request**. The earlier error text is gone, so she has to remember what the request was. The notice does not say which task or change it is.
5. Clicks **Retry saved request** → "Saving locally…", then the notice disappears; the task shows In progress, History has one "lena · task.update" entry (if the first attempt had already been saved, the service returns the earlier receipt with `replayed: true`, so there is no second entry).
##### Variations
- The uncertain write was **Create task**: the retry closes the form (if open) and opens the new task's details; only one task is created.
- She closes the tab instead of reloading: the pending request lives in sessionStorage, so a new tab does not show "A request is awaiting confirmation." and she cannot tell from the UI whether it saved; she has to check History or Activity.
- She clicks **Forget this workspace** while pending: credential, preferences and the pending request are all removed without warning.
##### Edge Cases
- Retry ends in a definite rejection (`STALE_UPDATE`, `CONFLICT_REQUIRES_RESOLUTION`, `INVALID_ARGUMENT`, `AMBIGUOUS_ACTOR`, `NOT_FOUND`, `OPERATION_ID_REUSED`): the pending request is cleared and the error stays. For `STALE_UPDATE` the second line is "Your draft is preserved. Review the latest context before making a new edit."
- Retry ends in another non-transport error that is not on that list (for example `UNKNOWN_ACTOR`, `STORAGE_FAILED`, `WORKSPACE_MISMATCH`): the request stays pending, so every new change is blocked with "Resolve the saved request before starting another change." until a retry succeeds or she forgets the workspace.
- Browser storage blocked: the write is refused before sending with "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes."
- Retry does not need an Actor: a replay goes through even after she clears the **Actor** select, and keeps the original `actorId`.

##### Merged source: errors-bootstrap/STORY-010 — A write is interrupted and must be confirmed before the next change

**Type**: medium
**Topic**: Error and bootstrap failures
**Persona**: Ravi, a human Actor moving tasks to Review on hotel Wi-Fi from a companion laptop
**Goal**: Make sure his status change landed, then make a second change
**Preconditions**: LAN-paired browser. **Actor** chosen. Task "Add latency instrumentation" open.
**Ideal path**: 3 — see "awaiting confirmation", retry once, continue.
**Alternate paths**: **Forget this workspace** discards the pending write (and the credential and preferences). Not recommended.

**Steps (from errors-bootstrap/STORY-010):**

1. **Edit task** → **Status** = Review → **Save changes**. SaveStatus "Saving locally…". The operation is first written to `sessionStorage` (`pardner:<ws>:pending`).
2. Wi-Fi drops. The fetch fails with a transport error (not a definitive code), so the pending write is kept → `ErrorNotice` shows the browser error (for example "Failed to fetch") / "Your last confirmed data remains available." with **Retry saved request**.
3. Ravi tries to start another change. **New task** is disabled. **Add comment** on another task → "Resolve the saved request before starting another change."
4. Wi-Fi returns; the "Live updates disconnected…" notice clears. He clicks **Retry saved request** → the same `operationId` is sent. If the first send had already reached the service, it is replayed idempotently. Either way the notice clears and SaveStatus shows "Saved locally · synced".
5. He makes the comment → succeeds.

**Variations (from errors-bootstrap/STORY-010):**

- After step 2, before the error renders, a reload restores `pending` from sessionStorage. The UI shows "A request is awaiting confirmation." with **Retry saved request** (shown when `pending && !error`).
- The retry returns STALE_UPDATE (someone changed status meanwhile) → "Your draft is preserved. Review the latest context before making a new edit." and the pending write is cleared.
- The service responds `507 STORAGE_FAILED` → not definitive → the pending write remains and retry is offered. SaveStatus may show "Local save failed".

**Edge Cases (from errors-bootstrap/STORY-010):**

- Pending writes are per tab (sessionStorage). Closing the tab drops the uncertain write without warning.
- `UNKNOWN_ACTOR`, `HUB_UNAVAILABLE` and `LOCAL_SERVICE_UNAVAILABLE` are not in the definitive list, so they keep the request pending. Retrying an UNKNOWN_ACTOR request can never succeed, and the user is blocked until they choose **Forget this workspace**.

---

#### STORY-078: Watch a replica converge when the hub comes back
*(was offline-sync/STORY-007)*

**Type**: short
**Topic**: Offline, sync status and reconnection
**Persona**: Marcus Webb, back at his desk after the train ride in STORY-074
**Goal**: Confirm his offline edits reached the hub and appear there.
**Preconditions**: Laptop replica has unacknowledged changes ("Saved locally · waiting for hub"); desk hub running again.
**Ideal path**: 2 steps: reconnect happens automatically; check the status and look at the hub.
**Alternate paths**: `pardner --data .pardner-replica status` (`syncPending:false`, new `lastSyncedAt`); `pardner activity --limit 5` against the hub.
**Walkability**: `multi-service`
**Related**: STORY-072, STORY-073, STORY-074, STORY-075, STORY-081, STORY-083, STORY-135
##### Steps
1. Laptop joins the office Wi-Fi and Marcus keeps the replica UI open → No action needed. The replica's ticket adapter fetches a fresh WebSocket ticket, retries about every second, and the replica posts a persistence acknowledgement request. The header changes from "Saved locally · waiting for hub" to "Saved locally · synced" (acceptance bound: converge within 10 seconds).
2. Opens the desk hub UI at `http://127.0.0.1:8004/pardner/` and clicks **Activity** → "Workspace activity" lists his offline "marcus · task.update" and "marcus · comment.add" entries with their original local times.
##### Variations
- He switches to the hub first: its status already said "Saved locally · synced" the whole time, so that indicator cannot show whether the replica's changes have arrived. Only the content (Activity, the comment) shows that.
##### Edge Cases
- The hub is reachable but now belongs to a different workspace (rebuilt with a fresh `--data`): the replica refuses to connect with "The configured hub belongs to a different workspace" (`WORKSPACE_MISMATCH`), visible only in `pardner status` `syncError`. The UI stays on "waiting for hub" forever.
- The hub acknowledges heads the replica has moved past (Marcus edits again in the same moment): the replica only marks synced when the acknowledged heads match its current heads, so the status stays "waiting" for one more round before turning "synced".

---

#### STORY-079: Same field edited on both sides during an outage
*(was offline-sync/STORY-008)*

**Type**: long
**Topic**: Offline, sync status and reconnection
**Persona**: Alice Moreno (hub on her desktop) and Bob Lin (laptop replica), two humans who both change one task's status while the link between them is down
**Goal**: Keep both edits, see the conflict after reconnect, and settle on one value explicitly.
**Preconditions**: Hub serving `.pardner-walk` on 8004/8005; replica serving `.pardner-replica` on 8014/8015, enrolled earlier; Actors alice, bob, builder, reviewer registered. Task "Add latency instrumentation" in In progress. Both UIs open (Alice on 8004, Bob on 8014).
**Ideal path**: 6 steps: two offline edits, reconnect, open the badged card, choose a value, confirm sync. Detection and the resolution controls are already on the task card and panel.
**Alternate paths**: CLI: `pardner diff TASK` and `pardner show TASK --json` show `conflicts`; `pardner resolve TASK --field status --value review --revisions '["rev1","rev2"]' --actor alice`. Different-field edits (for example Alice changes priority, Bob changes status) merge without a conflict.
**Walkability**: `multi-service`
**Related**: STORY-059, STORY-060, STORY-061, STORY-064, STORY-066, STORY-070
##### Steps
1. Bob stops the hub link by switching his laptop's Wi-Fi off (or, in the rehearsal, Alice stops the hub process) → Bob's header still says "Saved locally · synced" from before; nothing changes until he writes.
2. Bob opens "Add latency instrumentation", **Edit task**, sets **Status** to Review, **Save changes** → Bob's status: "Saving locally…" → "Saved locally · waiting for hub". The card moves to the Review column on Bob's board.
3. Alice (hub, restarted if it was stopped) opens the same task and sets **Status** to Dead end with **Save changes** → Alice's status: "Saved locally · synced" (hub-local save). The card moves to Dead end on her board.
4. Alice wonders why Bob hasn't reacted → Nothing on her screen indicates that a replica is offline or behind.
5. Bob reconnects (Wi-Fi on) → Within seconds Bob's status flips to "Saved locally · synced". Both boards re-render.
6. Both look at the board → The card shows the **Conflicting edits** badge on both machines. The column it sits in is decided by Automerge's deterministic winner, the same on both, so one of them sees the card "jump" columns.
7. Alice clicks the card → **Task details** shows "Resolve status" with "Both edits are preserved. Choose the value to keep." and two alternatives, each with author and value (bob: Review, alice: Dead end), each with **Keep this status**.
8. Alice is unsure if Bob is still deciding and leaves a comment first: "@bob I marked this dead end because the cache key is wrong; ok to keep Review?" → **Add comment**; the comment appears on Bob's panel after the next sync update.
9. Bob replies in his panel "Agree, dead end" → Comment appears on Alice's side.
10. Alice clicks **Keep this status** next to her "Dead end" alternative → "Saving locally…" → "Saved locally · synced". The badge disappears, the card sits in Dead end; History records "alice · task.resolve".
11. Bob's board updates → Card in Dead end, no badge. His status: "Saving locally…" while the new heads arrive, then "Saved locally · waiting for hub" briefly, then "Saved locally · synced" once the hub acknowledges the merged heads.
12. Bob runs `node bin/pardner.js --data .pardner-replica status` → `"syncPending":false`.
##### Variations
- Bob edits a different field (Description) while Alice changes Status: no badge; both edits appear after reconnect.
- Bob tries to edit the conflicted status again with **Edit task** instead of resolving: the server returns `CONFLICT_REQUIRES_RESOLUTION`; the header alert shows the message with "Your last confirmed data remains available."
- Bob had the **Edit task** form open while Alice's resolution arrived: his save gets `STALE_UPDATE` and "Your draft is preserved. Review the latest context before making a new edit."
##### Edge Cases
- If Alice resolves before Bob's replica has reconnected, she sees only her own value and no conflict; the conflict only appears after Bob's edit syncs, and she has to resolve again.
- Same-field edits on the description produce "Resolve description" alternatives with full markdown values, which can be long in the panel.
- Bob's comment written while offline appears on Alice's side with its original local timestamp, so it can land above comments she wrote later.

---

#### STORY-080: Agent keeps working through a hub outage
*(was offline-sync/STORY-009)* — **Merged sources:** human-agent-handoff/STORY-010 "Agent hands off while its replica is cut off from the hub"

**Type**: long
**Topic**: Offline, sync status and reconnection
**Persona**: `builder`, a coding agent running on Bob's laptop replica through the CLI with `PARDNER_ACTOR=builder` and `PARDNER_DATA_DIR=.pardner-replica`
**Goal**: Finish an already-claimed task during a hub outage, and pick up new work once the hub returns, without losing or duplicating effects.
**Preconditions**: Replica on 8014/8015 enrolled; hub up at start. A mention for builder exists on "Add latency instrumentation" (`@builder please instrument the cache path`).
**Ideal path**: 8 steps: claim, store, ack, work and comment offline, notice the failed claim, wait for hub, claim next, hand off. Leases need the hub; task writes do not.
**Alternate paths**: `pardner bridge run` with a bridge config handles claims for a Codex App Server session (`docs/PARDNER-BRIDGE.md`); not covered here.
**Walkability**: `multi-service`
**Related**: STORY-025, STORY-071, STORY-074, STORY-126, STORY-127
**Why merged**: Both have an agent on a replica keep working (comment, handoff) while `mentions claim-next` fails with `HUB_UNAVAILABLE`, then converge when the hub returns.
##### Steps
1. `pardner mentions pending` → `{"success":true,"mentions":[{…"id":"mention-…"…}]}` (forwarded to the hub).
2. `pardner mentions claim-next --request-id claim-0001 --ttl-ms 30000` → A lease with `claimToken`.
3. The harness writes the claimed message to its own inbox file, then runs `pardner mentions ack mention-… --claim-token TOKEN` → Acknowledged. (CLI guide: "A harness must durably store the claimed message in its own inbox before acknowledging it.")
4. `pardner show TASK --json` → Full context including `revisions` and `status` with `"syncPending":false`.
5. The hub goes down (Alice's desktop sleeps).
6. `pardner update TASK --status in-progress --revisions '{"status":["REV"]}' --operation-id builder-upd-001` → Success, with `"savedLocally":true` and `"syncPending":true`.
7. `pardner commit --task TASK -- -m "feat: instrument cache path"` → Git commit made and evidence linked locally.
8. `pardner comment TASK 'Instrumented; p95 now 180ms on staging' --operation-id builder-cmt-001` → Success, `syncPending:true`.
9. The harness polls for new work: `pardner mentions claim-next --request-id claim-0002` → `{"success":false,"error":{"code":"HUB_UNAVAILABLE","message":"Could not reach sync server: fetch failed",…}}`, exit 1. The agent's instructions say this does not stop accepted work, so it doesn't retry the task writes.
10. The comment command timed out on the agent's side (uncertain), so it reruns `pardner comment TASK 'Instrumented; p95 now 180ms on staging' --operation-id builder-cmt-001` → Success with `replayed: true`; no duplicate comment.
11. Polls `pardner status` until `"hubConnected":true` and `"syncPending":false` after the hub wakes.
12. Retries `pardner mentions claim-next --request-id claim-0002` (same ID, because the earlier attempt failed before reaching the hub) → A claim or an empty, replayable result.
13. `pardner show TASK --json` to refresh revisions, then `pardner handoff TASK --to reviewer --status review --message "Ready for review; trace attached" --revisions JSON` → Saved, mention created for reviewer; with the hub up the receipt shows `syncPending:false` shortly afterwards.
14. In the hub UI, Alice's board shows the card in Review, assigned to "reviewer · agent", with builder's comment and the commit under **Evidence**.
##### Variations
- The lease expires while the hub is down (TTL 30s) and nobody acknowledged it: after the hub returns the mention can be claimed again; the harness's inbox must deduplicate.
- The agent reuses `builder-cmt-001` with different text: `OPERATION_ID_REUSED`.
##### Edge Cases
- `claim-next` to a hub that is up but slow beyond the 2-second hub request timeout surfaces as an abort error, not `HUB_UNAVAILABLE`, so a harness matching only that code may treat it as fatal.
- `pardner mentions release` during the outage also fails with `HUB_UNAVAILABLE`; the lease simply expires on the hub.
- Delivery acknowledgement is not an execution lock: if the hub had re-leased the mention to a second builder process, both could act; external side effects need harness-level idempotency.

##### Merged source: human-agent-handoff/STORY-010 — Agent hands off while its replica is cut off from the hub

**Type**: long
**Topic**: Human ↔ agent handoff round trip
**Persona**: `builder` running on a laptop replica (`serve --role replica`, HTTP 8014); Alice on the hub machine UI
**Goal**: Keep working and hand off during a hub outage, and have Alice and reviewer see it once connectivity returns.
**Preconditions**: Replica enrolled earlier with `--hub http://127.0.0.1:8004 --hub-ws ws://127.0.0.1:8005/automerge --hub-token TOKEN --http-port 8014 --ws-port 8015`; builder's CLI uses `--data .pardner-replica`; the hub process is then stopped.
**Ideal path**: 3 — show, handoff locally, (after reconnect) nothing more; reviewer claims on the hub.
**Alternate paths**: wait for the hub before handing off; comment only.

**Steps (from human-agent-handoff/STORY-010):**

1. Builder runs `node bin/pardner.js --data .pardner-replica mentions claim-next --actor builder --request-id offline-poll-1` → `{"success":false,"error":{"code":"HUB_UNAVAILABLE",...}}`. The agent realises new deliveries need the hub.
2. Builder continues accepted work: `show task-9c41e0… --actor builder` succeeds from the local replica; `status.syncPending` is `true`.
3. Builder comments "Finished offline; will sync when the hub is back." → `savedLocally: true`, `syncPending: true`.
4. Builder runs `handoff … --to reviewer --status review --message 'Ready for review (written offline).' --revisions '{...}' --operation-id handoff-offline-1` → success, `savedLocally: true`, `syncPending: true`.
5. A browser connected to the replica's UI (port 8014) shows "Saved locally · waiting for hub" and the task as "reviewer · agent · Review".
6. Alice's hub UI cannot load (hub is down): "Opening your workspace…" then the config error with **Retry connection**.
7. The operator restarts the hub with the same `--data .pardner-walk`.
8. Alice's browser reconnects (on focus/online or after backoff ≤15s); the board shows the task in **Review** with "reviewer · agent".
9. The replica browser's status changes to "Saved locally · synced" after the hub's persistence acknowledgement.
10. Reviewer (on the hub) runs `mentions claim-next --actor reviewer --request-id rev-poll-7` → `claimed: true`, mention from builder.
11. Reviewer acks after storing it.

**Variations (from human-agent-handoff/STORY-010):**

- Alice edited the status on the hub while builder was offline → after sync, the card shows **Conflicting edits**; Task details shows "Resolve status" with both alternatives and **Keep this status** buttons; the handoff comment is still present.

**Edge Cases (from human-agent-handoff/STORY-010):**

- `actors register` on the replica → `HUB_REQUIRED` "Register new Actors on the hub"; builder cannot introduce a new reviewer Actor while offline.
- Builder retries step 4 after a lost response with the same `--operation-id` → `replayed: true`, no duplicate comment.
- Builder must not interpret `syncPending: true` as failure; `savedLocally: true` is the local acknowledgement.
- **Multi-surface:** two UIs (hub and replica) render the same task differently during the outage; only the replica UI shows "waiting for hub".

---

#### STORY-081: Hub operator reads "synced" and assumes everyone is up to date
*(was offline-sync/STORY-010)*

**Type**: short
**Topic**: Offline, sync status and reconnection
**Persona**: Alice Moreno, running the hub on her desktop, about to announce in standup that "everything is in"
**Goal**: Find out whether Bob's laptop replica has sent its changes.
**Preconditions**: Hub UI open; Bob's replica offline since yesterday with unsynced comments.
**Ideal path**: 2 steps at best today: the hub has no per-replica view, so she has to ask Bob or check on his machine.
**Alternate paths**: Bob runs `pardner --data .pardner-replica status` on his machine. None on the hub.
**Walkability**: `multi-service`
**Related**: STORY-072, STORY-073, STORY-074, STORY-075, STORY-078, STORY-083, STORY-135
##### Steps
1. Looks at her header → "Saved locally · synced". She reads it as "all replicas synced".
2. Runs `node bin/pardner.js --data .pardner-walk status` → `"role":"hub"`, `"hubConnected":true`, `"syncPending":false`. There is no list of replicas or last-seen times.
3. Checks **Activity** for Bob's entries from yesterday afternoon → None after 15:10; she can't tell whether he stopped working or is offline.
4. Messages Bob, who runs `status` on his laptop → `"syncPending":true`, `"hubConnected":false`.
##### Variations
- Bob's replica connected but not yet acknowledged: Bob sees "Saved locally · waiting for hub" while Alice sees "synced". The same words mean different things on the two roles.
##### Edge Cases
- The hub's `storageError` turns its status into "Local save failed" for everyone using the hub UI, but replicas keep showing "waiting for hub" with no reason in the UI.

---

#### STORY-082: Wrong or stale address after moving the service
*(was offline-sync/STORY-011)*

**Type**: short
**Topic**: Offline, sync status and reconnection
**Persona**: Dev Okafor, who restarted his replica on ports 8014/8015 after a port clash, but has the old tab open on 8004
**Goal**: Reach the running service again.
**Preconditions**: Tab at `http://127.0.0.1:8004/pardner/` from before; the service now listens on 8014.
**Ideal path**: 2 steps: read the error, open the right address.
**Alternate paths**: `connection.json` holds `httpUrl`, which he can open directly.
**Walkability**: `multi-service`
**Related**: STORY-093, STORY-103, STORY-111
##### Steps
1. Old tab shows "Local service disconnected" and the notice "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable.", then the raw fetch error once retries start.
2. Clicks **Retry connection** twice → Same message each time; nothing names the new port.
3. Runs `node -e "console.log(require('./.pardner-replica/connection.json').httpUrl)"` → `http://127.0.0.1:8014`; opens `http://127.0.0.1:8014/pardner/` → The connection screen, because credentials are stored per browser origin and 8014 is a new origin. He pastes the token and clicks **Connect**.
##### Variations
- Something else is now running on 8004 that returns HTML: "The service returned an unreadable response. Retry the connection."
##### Edge Cases
- Companion devices that paired against 8004 also need a new pairing on the new address; the error hint says "For a changed address, reopen Pair another device on the desktop."

---

#### STORY-083: First-time two-machine setup, outage drill and recovery
*(was offline-sync/STORY-012)*

**Type**: long
**Topic**: Offline, sync status and reconnection
**Persona**: Sofia Ruiz, a solo founder who wants her MacBook (replica) and her Mac mini (hub) to share one Pardner workspace, and rehearses an outage before relying on it
**Goal**: Set up hub and replica, create work on both, simulate an outage on each side, and check that everything converges with no lost or duplicated work.
**Preconditions**: Repo checked out on both machines with `npm ci && npm ci --prefix ui-prototype && npm run ui:build` done; Node 24.11.1; same LAN; neither machine has a `.pardner` directory.
**Ideal path**: 14 steps: start hub (with the right bind and origin settings), register Actor, enroll replica, connect both UIs, write on each, take each down, reconnect, verify. Every step is required by the current CLI/UI split.
**Alternate paths**: The single-machine rehearsal in `docs/ux-paths/discovery.md` (hub 8004/8005, replica 8014/8015 on one host). `npm run stress:native-peer -- all --runs 2` automates a similar check.
**Walkability**: `multi-service`
**Related**: STORY-065, STORY-070, STORY-071, STORY-072, STORY-073, STORY-074, STORY-075, STORY-078, STORY-081, STORY-135, STORY-137
##### Steps
1. Mac mini: `PARDNER_BIND_HOST=192.168.1.30 node bin/pardner.js serve --data .pardner` → `{"success":true,"serving":true,"role":"hub",…,"httpUrl":"http://192.168.1.30:8004",…}`.
2. Mac mini: `node bin/pardner.js actors register sofia --handle sofia --kind human --display-name "Sofia Ruiz" --actor sofia` → Actor created (first registration allowed with no Actors).
3. Mac mini: opens `http://127.0.0.1:8004/pardner/` out of habit → The browser can't connect (the hub now listens only on 192.168.1.30). She opens `http://192.168.1.30:8004/pardner/` instead → The connection screen. Because the page is not on loopback, **Connect with a local service token** is collapsed; she opens it, pastes the hub token, **Connect** → The board loads (the GETs pass), but the WebSocket ticket POST is refused: notice "Origin not allowed. Open the current address shown in Pair another device." with **Retry connection**, and status "Local service disconnected". The message sends her to a dialog that can't help on a bound hub.
4. Mac mini: stops the hub and restarts it as `PARDNER_BIND_HOST=192.168.1.30 PARDNER_ALLOWED_ORIGINS=http://192.168.1.30:8004 node bin/pardner.js serve --data .pardner` → The tab reconnects; board with no tasks ("No tasks here" in every column); picks **Actor** "Sofia Ruiz · human". Status "Saved locally · synced".
5. MacBook: `node bin/pardner.js serve --data .pardner --role replica --hub http://192.168.1.30:8004 --hub-ws ws://192.168.1.30:8005/automerge --hub-token <hub token>` → `{"success":true,"serving":true,"role":"replica",…}`.
6. MacBook: `node bin/pardner.js status` → `"role":"replica"`, `"hubConnected":true`, `"syncPending":false`.
7. MacBook: opens `http://127.0.0.1:8004/pardner/`, pastes the MacBook's token from its own `.pardner/connection.json`, **Connect** → board (empty), **Actor** "Sofia Ruiz · human" (the Actor came from the hub).
8. MacBook: **New task** → panel "New task"; **Title** "Draft pricing page", **Priority** p1, **Create task** → Panel closes, task details open; status "Saving locally…" → "Saved locally · waiting for hub" → "Saved locally · synced".
9. Mac mini board shows "Draft pricing page" in Backlog within seconds.
10. Outage A, hub down: Mac mini `Ctrl-C` on the hub. MacBook status for new writes becomes "Saved locally · waiting for hub" (the existing state stays "synced" until she writes). Mac mini's own browser shows "Local service disconnected" and "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable."
11. MacBook: adds comment "Hero copy v2 in Figma" and changes **Status** to In progress → both save locally; "Saved locally · waiting for hub".
12. MacBook: stops the replica (`Ctrl-C`) and restarts it with only `node bin/pardner.js serve --data .pardner` → Starts offline in a few seconds; UI reconnects on tab focus; data intact; "Saved locally · waiting for hub".
13. Mac mini: restarts the hub with the same command as step 4 → Mac mini's tab reconnects by itself; within ~10 seconds the MacBook status flips to "Saved locally · synced", and the Mac mini board shows the task In progress with the comment.
14. Outage B, replica down: MacBook sleeps. Mac mini: **New task** "Set up Stripe test keys" → "Saved locally · synced" on the hub (immediately, even though the replica hasn't seen it).
15. MacBook wakes → the replica reconnects on its own; the MacBook browser tab reconnects on focus; "Set up Stripe test keys" appears; `pardner status` shows `syncPending:false`.
16. Verifies no duplicates: **Activity** on both machines lists the same operations once each, newest first.
##### Variations
- Sofia tries to pair the MacBook browser to the hub over **Pair another device** instead: if LAN access was enabled, the dialog reports "Companion device setup requires a token-protected loopback service. Remove PARDNER_BIND_HOST overrides and restart." That path is not available on a hub bound for remote replicas, and a companion browser would not be an offline replica anyway.
- She runs the drill on one machine with `--http-port 8014 --ws-port 8015` for the replica; then no bind host or origin override is needed.
- A write made while the origin is being rejected fails with `ORIGIN_REJECTED`, which is not on the list of definitive errors, so it stays pending ("Resolve the saved request before starting another change.") until the hub is restarted with the origin allowed and she clicks **Retry saved request**.
##### Edge Cases
- Step 2 run from the MacBook replica instead: `HUB_REQUIRED` "Register new Actors on the hub".
- Step 5 before the hub finishes starting (hub not yet listening): `LOCAL_SERVICE_UNAVAILABLE` "Could not reach sync server: fetch failed"; rerun after the hub prints its JSON.
- An uncertain write during step 11 (the replica service itself dies mid-request) follows STORY-077: "A request is awaiting confirmation." + **Retry saved request**.
- The acceptance contract warns that process-kill tests do not prove power-loss durability; this drill only exercises clean stops and sleeps.

---

### Companion device pairing over LAN

<details><summary>Topic background (from lan-companion-pairing.md)</summary>

Sources: `ui-prototype/src/PhoneAccess.jsx`, `ui-prototype/src/Pardner.jsx` (pairing screen, `pairDevice`, `#pair=` handling, `request` AUTH_REQUIRED handling), `ui-prototype/src/connection.js` (`pair`, `forget`), `ui-prototype/src/pardner.css` (`.phone-dialog`, `@media (max-width: 760px)`), `lib/lan-access.js` (`LanAccess.status/configure/createPairing/redeem`, `canManageAccess`), `automerge-sync-server.js` (LAN listener start, `/pardner/pair`, `/pardner/access`, origin middleware), `docs/PARDNER-LAN.md`, `test/pardner-phone.test.js`.

Behaviour notes that several stories rely on:
- Opening the dialog when pairing is ready calls `POST /pardner/access/pairing` automatically, so **every open of Pair another device (and every Try again) mints a new code and invalidates the previous one**.
- The **Device address** field and **Copy address** both carry the full pairing link (`http://<lan-ip>:8004/pardner/#pair=<code>`) whenever a code exists, not just the bare address.
- Redemption attempts are throttled per service, not per device: 10 per rolling minute across all browsers, successful or not.
- `restartRequired` is true both after a saved settings change and when the active interface address went stale, so the "Settings saved…" notice also appears when nothing was saved.

</details>

#### STORY-084: First-time enable of device access from the host laptop
*(was lan-companion-pairing/STORY-001)*

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Priya, a solo developer running `pardner serve --data .pardner` on her MacBook, who wants to check review tasks from her phone on the couch.
**Goal**: Turn on LAN device access so a QR code can be shown.
**Preconditions**: Service running on loopback with an API token; Priya is connected at `http://127.0.0.1:8004/pardner/` with the token from `.pardner/connection.json`; Actor `priya` registered; Mac on Wi-Fi `en0 · 192.168.1.42` and also has a Docker bridge interface with an IPv4 address; no `access.json` yet.
**Ideal path**: 3 — open dialog, choose interface, enable; a well-designed UI would apply listeners without a manual restart, which Pardner cannot (listeners bind at start).
**Alternate paths**: none found in the UI; `access.json` can be hand-written (`{"version":1,"enabled":true,"interfaceName":"en0"}`) before `serve`, but that is not a supported UI path.
**Walkability**: `multi-service`
**Related**: STORY-085, STORY-086, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091, STORY-092, STORY-094, STORY-095
##### Steps
1. Priya clicks **Pair another device** in the workspace actions → modal dialog "Pair another device" opens with "Scan with a device on the same Wi-Fi to connect." and briefly "Finding available networks…".
2. Waits for load → no QR (LAN disabled). Because `canManageAccess` is true and there is no `phoneUrl`, the **Network settings** section is open by default. The **Network interface** select shows "Choose a network" because two interfaces exist (not auto-selected).
3. She hesitates: the options read "en0 · 192.168.1.42" and "bridge100 · 192.168.64.1". She knows her phone is on home Wi-Fi, so she picks "en0 · 192.168.1.42" → **Enable device access** becomes enabled (it was disabled while the value was empty).
4. Clicks **Enable device access** → `access.json` saved (mode 0600); notice: "Settings saved. Restart the Pardner service with the same data directory to apply them, then reopen this dialog. Existing access stays active until restart." The button now reads **Save network** and **Disable device access** appears.
5. She looks for a QR code; there is none yet. Footer still reads "Trusted networks only. This connection is unencrypted."
6. Clicks **Close** (aria "Close device pairing") → dialog closes, board unchanged.
##### Variations
- Only one eligible IPv4 interface: it is preselected and **Enable device access** is immediately clickable (2 effective steps).
- Priya presses Escape instead of **Close** — native `<dialog>` closes the same way.
##### Edge Cases
- No LAN address at all (laptop on Ethernet unplugged, Wi-Fi off): "No LAN IPv4 address is available. Connect this computer to Wi-Fi or Ethernet, then try again." and the select contains only "Choose a network"; the button stays disabled.
- Two clicks in quick succession while saving: server returns `CONFIG_BUSY` "Another configuration change is being saved. Try again." in the dialog's alert with **Try again**.
- Data directory not writable: "Could not save device access. Check the service data directory and try again."
- Friction: the dialog's intro says "Scan with a device…" even though nothing is scannable until a restart outside the UI.

---

#### STORY-085: Restart the service and pair a phone by scanning the QR code
*(was lan-companion-pairing/STORY-002)*

**Type**: long
**Topic**: Companion device pairing over LAN
**Persona**: Priya (from STORY-084), iPhone 15 with Safari, same Wi-Fi.
**Goal**: Get from "settings saved" to a paired phone showing her review tasks.
**Preconditions**: STORY-084 completed (`access.json` enabled for `en0`); desktop tab still open on loopback; tasks exist: "Review phone connection evidence" (review, assignee priya), "Someone else's review" (review, assignee bob), "Work still in progress" (in-progress, priya).
**Ideal path**: 4 — restart, open dialog, scan, choose Actor; restart is mandatory because LAN listeners only bind at start.
**Alternate paths**: open the link manually (STORY-087); type the 8-digit code (STORY-088).
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-086, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091, STORY-094
##### Steps
1. In the terminal, Priya presses Ctrl-C on `pardner serve` → desktop header status changes to "Local service disconnected".
2. Runs `node bin/pardner.js serve --data .pardner` again (same directory) → service logs HTTP listening; LAN listeners bind on 192.168.1.42:8004 and :8005.
3. Desktop tab reconnects on its own (bounded backoff); status returns to "Saved locally · synced" or "Saved locally · waiting for hub".
4. Clicks **Pair another device** → "Finding available networks…", then a 240px QR image (alt "QR code for the device address") appears, plus "Use once before 8:47 PM" (10 minutes from now) and a **Generate new code** button. No restart notice this time.
5. She opens the iPhone Camera and points it at the screen → Safari offers `http://192.168.1.42:8004/pardner/#pair=04819273`.
6. Taps the banner → phone shows "Opening your workspace…" (startup shell), then the pairing screen momentarily with **Pair this device** showing "Connecting…".
7. The page strips `#pair=…` from the URL via `history.replaceState` and redeems it → the workspace loads on the phone with the **Actor** select showing "Choose an Actor".
8. Priya glances at the desktop: the dialog still shows the same QR and "Use once before 8:47 PM" — nothing indicates the code was consumed.
9. On the phone she chooses **Actor** → "priya".
10. Sets **Assigned to** → "priya" and **Status filter** → "Review" (full-width stacked selects under the ≤760px layout, 44px touch targets).
11. Board collapses to the Review column showing only "Review phone connection evidence"; she scrolls sideways once to make sure the other columns are gone — they are (filtered single column).
12. Taps the card → Task details panel opens full-height on the phone.
13. Back on the desktop she clicks **Close** on the dialog.
14. Phone: she locks it, unlocks a minute later → page reconnects when foregrounded; no re-pairing.
15. She closes Safari's tab and reopens `http://192.168.1.42:8004/pardner/` from history → workspace opens straight to the board with **Actor** "priya" and **Status filter** "Review" restored from local storage.
##### Variations
- Android Chrome: the camera app shows a link chip; same flow.
- Priya restarts with a different `--data` directory by mistake → LAN stays off (new directory has no `access.json`), dialog again shows Network settings with no QR.
##### Edge Cases
- **Multi-surface:** the QR on the desktop, the pairing redeem on the phone, and the CLI (`pardner show <task>`) all read the same service; no surface reports "code used" back to the desktop.
- If the desktop tab was reopened (dialog re-opened) between scanning and tapping the banner, the scanned code is already replaced → PAIRING_INVALID on the phone (see STORY-089).
- Firewall blocks 8005 only: page and pairing succeed over 8004, but live updates fail; LAN guide says to "allow both displayed ports through the host firewall" — the UI does not diagnose this.
- Friction: 4 user-facing surfaces (dialog, terminal, dialog again, phone) for a first pairing; the restart notice cannot be acted on from the browser.

---

#### STORY-086: Pair a phone and watch desktop updates arrive live
*(was lan-companion-pairing/STORY-003)*

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Marcus, tech lead, pairs his Pixel to follow an agent's handoff while away from his desk.
**Goal**: Confirm that changes made on the desktop/CLI appear on the phone without reload, and that phone edits are attributed to him.
**Preconditions**: Phone already paired (STORY-085 pattern); **Actor** "marcus" chosen on the phone; task "Migrate billing webhooks" in Review assigned to marcus; agent Actor `codex-1` uses the CLI.
**Ideal path**: 3 — open task on phone, see new comment arrive, post reply.
**Alternate paths**: the CLI `pardner comment` from the laptop instead of the desktop UI; the phone can also use **Edit task** to change status.
**Walkability**: `multi-service`
**Related**: STORY-020, STORY-041, STORY-084, STORY-085, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091, STORY-094
##### Steps
1. On the phone Marcus taps "Migrate billing webhooks" → Task details panel with Comments (2).
2. On the laptop the agent runs `pardner comment <task> "Webhook retries verified against staging" --actor codex-1` → within a second the phone shows the new comment "Webhook retries verified against staging" by codex-1 (WebSocket document-state push), Comments (3).
3. Marcus types in **Comment** ("Share progress or mention an Actor with @handle"): "Looks good, merging after lunch @codex-1" and taps **Add comment** → phone status "Saving locally…" then saved.
4. On the desktop browser (also open) the comment appears live in the same task.
5. He taps **Edit task**, sets **Status** to "Completed", taps **Save changes** → panel returns to read mode; board count for Completed increments on the desktop.
6. On the laptop: `pardner show <task>` → comment authored by `marcus`, status `completed`.
##### Variations
- The desktop user and the phone user are different humans sharing one credential; attribution only reflects whichever Actor each chose in the **Actor** select.
##### Edge Cases
- Network blip during **Add comment**: phone shows "A request is awaiting confirmation." with **Retry saved request**; retry re-sends the same operation ID, so the comment appears exactly once.
- Service restarted mid-session: phone shows "Local service disconnected", then reconnects and receives later comments without re-pairing.
- Marcus forgets to choose an Actor on a freshly paired phone: **New task** is disabled and comment actions report "Choose the Actor making this change."

---

#### STORY-087: Copy the pairing link to a tablet via a chat message
*(was lan-companion-pairing/STORY-004)*

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Dana, product manager whose iPad camera can't focus on her matte external monitor.
**Goal**: Pair the iPad without scanning.
**Preconditions**: LAN active (post-restart); Dana's desktop browser connected; iPad on same Wi-Fi and signed in to the same messaging app.
**Ideal path**: 3 — open dialog, copy link, open it on the iPad.
**Alternate paths**: select the text in **Device address** manually (it auto-selects on focus); type the 8-digit code (STORY-088).
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-088, STORY-089, STORY-090, STORY-091, STORY-094
##### Steps
1. Clicks **Pair another device** → QR and "Use once before 3:12 PM".
2. Expands **Connect manually** → **Device address** shows `http://192.168.1.42:8004/pardner/#pair=55203118`, the large pairing code "55203118", and **Copy address**.
3. Clicks **Copy address** → button text becomes "Address copied". She pastes it into a note-to-self chat and opens it on the iPad → iPad pairs automatically and shows the **Actor** select.
##### Variations
- Browser without `navigator.clipboard` (plain HTTP on some browsers, since LAN mode is not a secure context): error alert "Select the device address above and copy it manually." with **Try again** — which reloads the dialog and mints a new code, so the text she was about to select changes.
##### Edge Cases
- Friction: the field is labelled "Device address" and the button "Copy address", but the copied value is a one-time secret-bearing pairing link; pasting it in a team chat lets whoever opens it first pair (until used or 10 min).
- She later clicks **Generate new code** → button reverts from "Address copied" to "Copy address" and the previously pasted link is now invalid.

---

#### STORY-088: Type the 8-digit code on a phone that can't scan
*(was lan-companion-pairing/STORY-005)*

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Tomás, contractor with an older Android phone whose camera app lacks QR support.
**Goal**: Pair using the manual fallback.
**Preconditions**: LAN active at `192.168.1.42`; desktop dialog open.
**Ideal path**: 3 — type address, type code, tap Pair this device; a better design would show the bare address outside the collapsed section.
**Alternate paths**: STORY-085 (QR), STORY-087 (copied link).
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-087, STORY-089, STORY-090, STORY-091, STORY-094
##### Steps
1. On the desktop, Tomás expands **Connect manually** → **Device address** `http://192.168.1.42:8004/pardner/#pair=31005827` and code "31005827".
2. He types `192.168.1.42:8004/pardner/` into the phone's Chrome address bar, dropping the `#pair=` part because it looked like noise → page loads to the pairing screen: "Pardner", "One workspace for human and agent Actors.", **Pairing code** field, helper "Open Pair another device on the desktop to get a code. This browser will remember your workspace. Use a trusted network: HTTP traffic is unencrypted."
3. Taps **Pairing code** → numeric keypad appears (`inputMode="numeric"`); Android may offer one-time-code autofill (none here).
4. Types "31005827" and taps **Pair this device** → "Connecting…", then the workspace opens.
5. **Connect with a local service token** stays collapsed on the phone (non-admin), so he never sees the token option.
##### Variations
- He types the full link including `#pair=31005827` → pairs automatically without touching the field.
- He types only 7 digits → browser validation blocks submit (`pattern="[0-9]{8}"`, required).
##### Edge Cases
- Typo "31005872" → alert "The pairing code is incorrect or expired. Generate a new code on the desktop." with **Retry connection** (STORY-089).
- Friction: manual fallback requires reading two values from inside a collapsed `<details>`, while "Use once before …" sits outside it; the address shown already contains the code, so the separate code is redundant once the full address is typed.
- `http://` omitted is fine in Chrome; adding `https://` fails at TLS (no HTTPS listener) with a browser error page, not app guidance.

---

#### STORY-089: Wrong or expired code and the retry trap
*(was lan-companion-pairing/STORY-006)*

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Jun, designer pairing a second phone after lunch with a code he wrote on a sticky note before lunch.
**Goal**: Recover from PAIRING_INVALID and pair successfully.
**Preconditions**: LAN active; code "77412093" was generated 40 minutes ago (expired after 10 minutes).
**Ideal path**: 3 — see error, get fresh code, enter it.
**Alternate paths**: scan a fresh QR instead of typing (STORY-085).
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-087, STORY-088, STORY-090, STORY-091, STORY-094
##### Steps
1. On the phone's pairing screen Jun enters "77412093" and taps **Pair this device** → alert: "The pairing code is incorrect or expired. Generate a new code on the desktop." followed by "Check that the service is running. For a changed address, reopen Pair another device on the desktop." and **Retry connection**.
2. He taps **Retry connection** hoping it was a hiccup → the same code is resubmitted (retry calls `pairDevice(pairCode)`), same error, and one more throttle attempt consumed.
3. Walks to the desktop, clicks **Pair another device** → a new code is generated automatically on open; QR updates; "Use once before 2:31 PM".
4. Expands **Connect manually**, reads "09184466", replaces the field on the phone, taps **Pair this device** → workspace opens.
##### Variations
- Jun scans an old QR photo he took earlier → URL fragment is stripped, error shown, and the **Pairing code** field is prefilled with the stale code; he must clear it before typing a new one.
- A code that was already used once (link opened on another browser first) yields the identical message; the UI cannot distinguish "used", "expired" and "mistyped".
##### Edge Cases
- Service restarted since the code was generated → unused codes are memory-only, same PAIRING_INVALID.
- Desktop "Generate new code" pressed by a colleague meanwhile → Jun's fresh code invalidated silently.
- Friction: the message tells him to "Generate a new code", but simply reopening the dialog already does that; and the generic "Check that the service is running…" line is misleading for a code error.

---

#### STORY-090: Throttled after repeated attempts
*(was lan-companion-pairing/STORY-007)*

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Leah, IT-curious parent helping her teenager pair a tablet; both keep tapping the button.
**Goal**: Understand and get past PAIRING_THROTTLED.
**Preconditions**: LAN active; several wrong codes already tried within the last minute from two devices.
**Ideal path**: 2 — wait the minute, enter the current code.
**Alternate paths**: none found (no admin reset of the throttle).
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-087, STORY-088, STORY-089, STORY-091, STORY-094
##### Steps
1. Leah submits a code for the 11th time this minute (across both devices) → alert "Too many attempts. Wait a minute and try again." (HTTP 429).
2. She waits ~60 s, gets the current code from the desktop's **Connect manually**, enters it, taps **Pair this device** → workspace opens.
##### Variations
- Even a correct code is rejected while throttled; the counter includes successful redemptions.
##### Edge Cases
- Friction: the throttle is service-wide, so one person mashing **Retry connection** blocks every other device for the rest of the window; no countdown is shown.
- Reopening the desktop dialog during the wait silently replaces the code she was planning to use.

---

#### STORY-091: Generate a code from an already-paired phone for a third device
*(was lan-companion-pairing/STORY-008)*

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Priya again, away from the laptop, wants to pair her partner's phone as Actor "sam".
**Goal**: Pair a third device using the phone as the code display.
**Preconditions**: Priya's phone paired via LAN; LAN active; Actor `sam` registered via CLI earlier; desktop dialog not open.
**Ideal path**: 3 — open dialog on phone, partner scans, partner chooses Actor.
**Alternate paths**: walk back to the desktop and open the dialog there.
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-087, STORY-088, STORY-089, STORY-090, STORY-094
##### Steps
1. On her phone Priya taps **Pair another device** → dialog fills the narrow screen (`width: min(440px, 100% - 32px)`, sticky heading); QR appears with "Use once before 9:05 PM".
2. She notices there is no **Network settings** section (non-admin LAN origin) — only QR, **Connect manually**, **Generate new code**, and the footer note.
3. Partner scans the QR on Priya's phone with their own camera → their phone pairs and shows "Choose an Actor".
4. Partner chooses **Actor** "sam".
5. Priya taps **Generate new code** just to be safe → new code and expiry; the used one was already consumed anyway.
6. Taps **Close** → back to her board, filters intact.
##### Variations
- A second desktop opened through the LAN address behaves identically (can show QR and generate codes; cannot change the interface).
##### Edge Cases
- Scanning a QR off a phone screen with brightness low may fail; she can expand **Connect manually** and read out the 8 digits (large 32px tabular digits).
- If Priya's laptop dialog is also open, the phone's open just invalidated the laptop's displayed code; the laptop still shows the stale QR with no warning.
- Nothing in the UI distinguishes "sam's phone" from "Priya's phone" — all browsers share one flat credential; there is no device list or per-device revocation.

---

#### STORY-092: Non-admin desktop opens the dialog while LAN is disabled
*(was lan-companion-pairing/STORY-009)*

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Owen, teammate on a second desktop who connected through a `PARDNER_ALLOWED_ORIGINS` entry and the local service token.
**Goal**: Pair his phone.
**Preconditions**: LAN access not enabled; Owen's browser is not loopback, so `canManageAccess` is false.
**Ideal path**: 2 — open dialog, read the instruction; enabling is legitimately host-only.
**Alternate paths**: ask the host operator to enable it on the loopback browser (STORY-084).
**Walkability**: `multi-service` (needs a second LAN machine)
**Related**: STORY-084, STORY-095
##### Steps
1. Clicks **Pair another device** → "Finding available networks…".
2. Dialog shows "Open Pardner on the service computer through its local address to enable device access." and the footer note; no QR, no Network settings, no buttons other than **Close**.
##### Variations
- If LAN was enabled but the host hasn't restarted yet, Owen sees the restart notice "Settings saved. Restart the Pardner service…" too, though he cannot restart anything.
##### Edge Cases
- Owen calls `POST /pardner/access` by hand → `LOCAL_ADMIN_REQUIRED` "Open Pardner on this computer through its loopback address to manage device access."
- Friction: the instruction says "the service computer" but Owen may not know which machine that is; the dialog doesn't show the host name.

---

#### STORY-093: The laptop moved networks and the device address changed
*(was lan-companion-pairing/STORY-010)*

**Type**: long
**Topic**: Companion device pairing over LAN
**Persona**: Rafael, freelancer who takes his laptop between home and a co-working space.
**Goal**: Reconnect his phone after DHCP gave the laptop a new IP.
**Preconditions**: LAN active on `en0` at home (`192.168.1.42`); phone paired with origin `http://192.168.1.42:8004`; at the co-working space `en0` is now `10.20.4.117`; service still running from home.
**Ideal path**: 4 — restart, reopen dialog, scan new QR, choose Actor (new origin needs a new pairing because browser storage is origin-specific).
**Alternate paths**: on the phone, use the connection-failure screen guidance then the manual code (STORY-088).
**Walkability**: `multi-service`
**Related**: STORY-082, STORY-103, STORY-111
##### Steps
1. Rafael opens the bookmarked `http://192.168.1.42:8004/pardner/` on his phone → browser's own "can't reach this page" error; no Pardner recovery (stale address unreachable on first load).
2. On the laptop, the desktop tab still works over loopback. He clicks **Pair another device**.
3. Dialog shows diagnostic "The device address has changed. Restart the service, then scan the current address." and also the notice "Settings saved. Restart the Pardner service with the same data directory to apply them, then reopen this dialog. Existing access stays active until restart." No QR.
4. He frowns at "Settings saved" — he saved nothing — but follows the restart advice.
5. **Network settings** is already expanded (it opens by default whenever there is no `phoneUrl`) → **Network interface** still shows "en0 · 10.20.4.117"; he leaves it alone.
6. Closes the dialog, Ctrl-C the service, runs `pardner serve --data .pardner` again → LAN listeners bind on 10.20.4.117.
7. Reopens **Pair another device** → QR for `http://10.20.4.117:8004/pardner/#pair=…`, "Use once before 11:20 AM".
8. Scans with the phone → new origin, no stored credential → auto-pairs and shows "Choose an Actor".
9. Picks **Actor** "rafael" again; **Assigned to**/**Status filter** preferences from the old origin are gone (local storage is per origin) — he re-sets **Assigned to** "rafael".
10. Next day at home the IP is back to 192.168.1.42 but the service was started at co-working → dialog again shows the address-changed diagnostic; repeat restart; the old home bookmark's stored credential is still valid, so opening the home URL goes straight to the board.
##### Variations
- Co-working Wi-Fi uses client isolation → page from the phone never loads even after restart; the LAN guide's "check Wi-Fi client isolation/guest-network settings" is not surfaced in the UI.
- Laptop now has only a link-local 169.254.x address → interface filtered out; after restart: "The selected network interface is unavailable. Choose an available interface and restart the service."
##### Edge Cases
- Interface has two IPv4 addresses after joining a VPN → after restart: "The selected interface has multiple IPv4 addresses. Choose another interface."
- Port 8004 taken on the new network by another process at restart → "LAN listeners could not start (EADDRINUSE). Check the interface and both ports, then restart." Loopback keeps working.
- Friction: the stale-address case reuses the "Settings saved…" restart notice, which is inaccurate; the phone cannot learn the new address on its own.

---

#### STORY-094: Scanning a fresh QR on an already-paired phone
*(was lan-companion-pairing/STORY-012)*

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Marcus (STORY-086), who forgot his phone was already paired.
**Goal**: Get back into the workspace from the QR.
**Preconditions**: Phone has a valid stored credential for the LAN origin; desktop dialog open with code "88120456".
**Ideal path**: 1 — scan.
**Alternate paths**: just open the bookmarked LAN URL.
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-085, STORY-086, STORY-087, STORY-088, STORY-089, STORY-090, STORY-091
##### Steps
1. Scans the QR → page strips `#pair=88120456`, checks the stored credential against `/automerge/status`, finds it valid, skips redemption → board opens with his remembered **Actor** and filters.
2. The code "88120456" remains unused and still valid on the desktop until it expires or is replaced.
##### Variations
- Stored credential is stale (token rotated): the status check returns AUTH_REQUIRED, the credential is forgotten, and the code is redeemed instead → he is back in with the new secret.
##### Edge Cases
- No visible confirmation either way that pairing was skipped; a second person could still use that code within 10 minutes.

---

#### STORY-095: Service started with PARDNER_BIND_HOST override blocks device setup
*(was lan-companion-pairing/STORY-015)*

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Ivan, who earlier set `PARDNER_BIND_HOST=0.0.0.0` in his shell profile for a replica experiment.
**Goal**: Understand why no QR appears after enabling and restarting.
**Preconditions**: `access.json` enabled for `wlan0`; service started with `PARDNER_BIND_HOST=0.0.0.0`.
**Ideal path**: 2 — read diagnostic, restart without override.
**Alternate paths**: none found.
**Walkability**: `multi-service`
**Related**: STORY-084, STORY-092
##### Steps
1. Opens **Pair another device** on loopback → diagnostic "Companion device setup requires a token-protected loopback service. Remove PARDNER_BIND_HOST overrides and restart." No QR; **Network settings** open.
2. Runs `unset PARDNER_BIND_HOST`, restarts `pardner serve --data .pardner`, reopens the dialog → QR appears.
##### Variations
- Service started without an API token → same diagnostic; additionally `/pardner/access` returns `LOCAL_ADMIN_REQUIRED` because access management requires a token.
##### Edge Cases
- If Ivan's loopback browser isn't actually loopback under the override (opened via `http://0.0.0.0:8004`), `canManageAccess` is false and he sees only the non-admin message from STORY-092.

---

### Credential lifecycle and cleanup (destructive)

<details><summary>Topic background (from credential-lifecycle-cleanup.md)</summary>

Stories for forgetting a workspace, disabling device access, rotating the shared
secret, a changed workspace behind an address, cleared browser storage, losing a
pending write, closing tasks (there is no task delete), deleting comments and
removing tasks from veins.

Code read for these stories: `ui-prototype/src/Pardner.jsx` (`Workspace`, `forget`,
`request`, `pairDevice`, `submit`, `ErrorNotice`), `ui-prototype/src/connection.js`
(`createConnection().forget/request/pair`), `ui-prototype/src/PhoneAccess.jsx`,
`lib/lan-access.js`, `automerge-sync-server.js` (`authMiddleware`, `/pardner/pair`,
`/pardner/access`), `lib/local-service.js` (token precedence), `lib/cli.js`,
`lib/workspace-commands.js` (`prepareCommentDelete`, `linkChange`),
`lib/workspace-schema.js` (`checkRevisions`, `taskContext`), `docs/PARDNER-LAN.md`.

Facts that shape these stories:
- Browser storage keys are per workspace: `pardner:<workspaceId>:credential` and
  `:preferences` in localStorage, `:pending` in sessionStorage.
- Pairing returns the service's single shared `apiToken`. There is no per-device
  credential and no per-device revocation (`docs/PARDNER-LAN.md`).
- Token precedence at `serve`: `--token` > `PARDNER_API_TOKEN` > `connection.json`
  > random. The token in use is written back to `connection.json`, so one restart
  with a new token makes it permanent. The CLI uses `--token` > `PARDNER_API_TOKEN` >
  `connection.json`.
- Neither **Forget this workspace** button asks for confirmation. The header button is
  disabled only while `busy`. A pending write does not disable it.
- **Possible defect, seen only by reading the code:** the opening-screen
  **Forget this workspace** button calls `forget()`, which calls `showBoard({})`.
  `showBoard` is a `const` declared *after* the early `return` that renders the
  opening screen (`Pardner.jsx:324-337` vs `:389`). On that render path,
  `showBoard` is uninitialized, so the click should throw a ReferenceError. The
  `try/catch` turns it into an `ErrorNotice`, after `client.forget()` has already
  cleared storage. The automated tests click only the header button
  (`test/pardner-connection-ui.test.js:70`, `test/pardner-phone.test.js:128`).
  Walkers should verify this (STORY-098).

</details>

#### STORY-096: Forget a borrowed laptop's workspace from the header
*(was credential-lifecycle-cleanup/STORY-001)*

**Type**: short
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Priya Raman, a product lead who opened Pardner on a colleague's spare laptop during an offsite and wants to leave no access behind
**Goal**: Remove this browser's stored Pardner credential and preferences before handing the laptop back.
**Preconditions**: Browser is connected to `http://127.0.0.1:8004/pardner/` via the local service token; header shows "Saved locally · synced"; Actor `priya · human` is selected; no request is awaiting confirmation.
**Ideal path**: 2 (one click to forget, one confirmation that it really happened; there is no confirmation step today, so the real path is 1 click plus a reload to check).
**Alternate paths**: The browser's own "Clear site data" also removes the credential (STORY-102), but it removes every workspace's keys for this origin and is not offered in the UI.
**Walkability**: `browser`
**Related**: STORY-012, STORY-097, STORY-098, STORY-103
##### Steps
1. Priya looks for a "sign out" and finds **Forget this workspace** next to **Pair another device** under the header → No tooltip or explanation. She hesitates over whether "forget" deletes the workspace's tasks.
2. Clicks **Forget this workspace** → No confirmation dialog. The board disappears and the connection screen shows "Pardner", "One workspace for human and agent Actors.", the **Pairing code** field with **Pair this device**, and **Connect with a local service token** (expanded, because this is a loopback browser with `canManageAccess`).
3. Reloads the page to make sure → The same connection screen appears. "Opening your local workspace…" does not appear, because no credential is stored.
4. Runs `node bin/pardner.js --data .pardner tasks --json` in the colleague's terminal → The tasks are still there (`"success":true`). Forget only removed browser state.
##### Variations
- Priya was on the **Activity** view with **Status filter** set to "Review". Forget calls `showBoard({})`, and the preferences key is removed. After re-connecting she lands on **Tasks** with "All Actors", "All statuses" and "All veins", and the **Actor** select shows "Choose an Actor".
- Mobile 390×844: **Forget this workspace** sits in the `workspace-actions` row under the stacked header. It is the same control at 44px touch height.
##### Edge Cases
- The service keeps the same shared secret. Anyone who copied `connection.json` or paired another device still has access ("It does not revoke the shared secret or disconnect other browsers." in `docs/PARDNER-LAN.md`). The UI never says this.
- The header button is disabled while a write is in flight (`busy`), but not while a request is pending (see STORY-097).
- If localStorage throws (storage blocked), `forget()` catches the error, so the alert shows "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes." with "Your last confirmed data remains available." The workspace stays visible.

---

#### STORY-097: Forgetting the workspace silently discards an unconfirmed comment
*(was credential-lifecycle-cleanup/STORY-002)*

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Marcus Oyelaran, a QA engineer reviewing tasks from his phone over shaky café-adjacent office Wi-Fi
**Goal**: Leave a review comment, then sign out of the shared tablet, without losing the comment.
**Preconditions**: Companion tablet paired over LAN at `http://192.168.1.42:8004/pardner/`; Actor `marcus · human`; task "Add latency instrumentation" open in Task details; Wi-Fi drops packets intermittently.
**Ideal path**: 3 (add comment; the UI blocks or warns on forget while a write is unconfirmed; retry then forget).
**Alternate paths**: none found for recovering a pending write after forget. The pending operation lives only in this tab's sessionStorage, and forget removes it.
**Walkability**: `multi-service`
**Related**: STORY-004, STORY-012, STORY-077, STORY-096, STORY-098, STORY-101, STORY-103, STORY-117
##### Steps
1. Types "Verified p95 numbers on staging — **looks good**" in **Comment** ("Share progress or mention an Actor with @handle") and taps **Add comment** → SaveStatus shows "Saving locally…". The request times out on the network.
2. Sees the alert with the raw fetch error (for example "Load failed" on WebKit) and "Your last confirmed data remains available.", plus **Retry saved request**. Nothing in it says whether the comment was saved.
3. Thinks the comment probably went through. Taps **Close** on Task details → Back on the board. Above it: the error notice with **Retry saved request**. **New task** is disabled because a request is pending.
4. Needs to hand the tablet to a colleague and taps **Forget this workspace** → Enabled even though a request is pending. No warning. The connection screen with **Pairing code** appears.
5. Later, on his laptop, Marcus opens the task → The comment may or may not exist. If the original request never reached the service, it is gone. The tablet's sessionStorage `pardner:<ws>:pending` was cleared by `forget()`.
6. Corrective path: on another attempt he taps **Retry saved request** *before* forgetting → Same operation ID is replayed. The service accepts the first copy and dedupes a repeat. The alert clears, SaveStatus returns to "Saved locally · synced", the comment appears once under **Comments (N)**, and then **Forget this workspace** is safe.
##### Variations
- The pending write is an **Edit task** status change to "Completed" rather than a comment. Forget drops it the same way.
- Desktop browser on loopback: same behaviour. The pending write lives in tab sessionStorage only, so closing the tab also drops it (`docs/PARDNER-LAN.md`: "do not close the tab before resolving an uncertain save").
##### Edge Cases
- `docs/PARDNER-LAN.md` says "Resolve an uncertain write before forgetting its pending request.", but the UI neither disables the header **Forget this workspace** while `pending` is set nor shows that advice.
- An AUTH_REQUIRED (credential rotated) does **not** discard the pending write (`connection.js` forgets only the credential; tested in `test/browser-connection.test.js`). Forget is the only UI action that discards it.
- Definitive errors (STALE_UPDATE, CONFLICT_REQUIRES_RESOLUTION, INVALID_ARGUMENT, AMBIGUOUS_ACTOR, NOT_FOUND, OPERATION_ID_REUSED) also clear the pending write, but there the service has proven that nothing was mutated.

---

#### STORY-098: Forget from the opening screen while the service is down
*(was credential-lifecycle-cleanup/STORY-003)*

**Type**: short
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Dana Whitfield, an engineering manager whose desktop Pardner tab shows a spinner after she shut down the service last night
**Goal**: Clear this browser's credential without first getting the service running.
**Preconditions**: Browser has a stored credential for the workspace. The service process was stopped after `/pardner/config` loaded (for example, the tab was left open and the laptop slept), so `token` is set and `doc` is null.
**Ideal path**: 1 (click **Forget this workspace** on the opening screen; see the pairing form).
**Alternate paths**: Header **Forget this workspace** (needs a loaded workspace); browser site-data clearing.
**Walkability**: `multi-service` (stop the single hub after config loads)
**Related**: STORY-012, STORY-096, STORY-097, STORY-103
##### Steps
1. Sees "Pardner", "One workspace for human and agent Actors.", "Opening your local workspace…". Below it is the alert "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." (or the browser's raw fetch error), "Check that the service is running. For a changed address, reopen Pair another device on the desktop.", **Retry connection** and **Forget this workspace**.
2. Clicks **Forget this workspace** → Intended: the pairing form appears. **Expected from code reading:** `client.forget()` clears storage, then `showBoard({})` throws because `showBoard` is not yet initialized on this render path. The `ErrorNotice` shows a ReferenceError message (for example "Cannot access 'X' before initialization", with a minified name) and "Your last confirmed data remains available.". The page stays on "Opening your local workspace…".
3. Confused, clicks **Retry connection** → The reconnect loop runs with an empty credential. Once the service is back, it gets AUTH_REQUIRED and drops to the pairing form with "The service credential changed. Pair again or enter the current local service token.", which is misleading because nothing changed on the service.
4. Reloads → The pairing form appears (storage was cleared in step 2).
##### Variations
- Service reachable but the first `/automerge/doc` is slow: the opening screen is visible only briefly. A fast click on **Forget this workspace** hits the same code path.
##### Edge Cases
- Walkers should record the actual message in step 2. If no error appears, note that the TDZ concern did not reproduce in the built bundle.
- Storage is cleared before the exception, so this is a confusing-feedback defect, not a credential leak.

---

#### STORY-099: Turn off companion device access and confirm the phone is locked out
*(was credential-lifecycle-cleanup/STORY-004)* — **Merged sources:** lan-companion-pairing/STORY-014 "Disable device access and return a phone to the pairing screen"

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Lena Fischer, a solo founder who enabled phone access for a demo and now wants the LAN listeners closed
**Goal**: Stop companion devices from reaching the workspace over Wi-Fi.
**Preconditions**: Service running `node bin/pardner.js serve --data .pardner`; `access.json` has `enabled: true, interfaceName: "en0"`; a phone at `http://192.168.1.42:8004/pardner/` is paired and live; Lena is on the loopback desktop browser.
**Ideal path**: 3 (open dialog, **Disable device access**, restart applied, ideally automatically or with one action).
**Alternate paths**: `POST /pardner/access {"enabled":false}` with the token from loopback (same endpoint the dialog uses). Editing or removing `access.json` and restarting. Stopping the service entirely.
**Walkability**: `multi-service`
**Related**: STORY-100, STORY-101, STORY-105, STORY-109
**Why merged**: Both use **Network settings** → **Disable device access**, restart, and confirm the phone is cut off.
##### Steps
1. Clicks **Pair another device** → Modal "Pair another device", "Scan with a device on the same Wi-Fi to connect.", a 240px QR, **Connect manually**, "Use once before 3:47 PM", **Generate new code**. The **Network settings** disclosure is collapsed because `phoneUrl` exists.
2. Expands **Network settings** → **Network interface** shows "en0 · 192.168.1.42". The buttons are **Save network** and **Disable device access**.
3. Clicks **Disable device access** → The QR and code section disappear (saved `enabled` is now false, so `isPairingReady` is false). The notice reads "Settings saved. Restart the Pardner service with the same data directory to apply them, then reopen this dialog. Existing access stays active until restart." The unused pairing code is discarded on the server.
4. Glances at the phone → It is still live and can still add comments. "Existing access stays active until restart" is literally true.
5. Presses Ctrl-C in the service terminal and runs `node bin/pardner.js serve --data .pardner` again → The service starts with loopback listeners only.
6. Phone: live updates drop. The notice shows "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable.", then the browser's raw fetch failure on retries, with **Retry connection**. The header is still visible from the last snapshot.
7. Desktop: reopens **Pair another device** → No QR. **Network settings** is expanded (`open={!access.phoneUrl}`), with **Network interface** "Choose a network" and **Enable device access** disabled until an interface is chosen.
##### Variations
- Lena clicks **Close** after step 3 without restarting. Reopening the dialog shows the same restart notice, because `restartRequired` compares saved and started settings.
- She changes her mind before restarting, picks "en0 · 192.168.1.42" and clicks **Enable device access**. Saved now equals started, so `restartRequired` is false and the QR returns once she clicks **Generate pairing code**.
##### Edge Cases
- **Disabling is not revocation.** The phone's localStorage still holds the shared secret. If Lena re-enables the same interface later, the phone reconnects without pairing. To lock it out for good she must rotate the token (STORY-100).
- A companion device opening this dialog sees no **Network settings** (`canManageAccess` false). A direct POST returns 403 `LOCAL_ADMIN_REQUIRED` "Open Pardner on this computer through its loopback address to manage device access."
- If two saves race, the second gets 409 `CONFIG_BUSY` "Another configuration change is being saved. Try again.", shown with **Try again**.
- **Multi-surface:** the desktop dialog, the phone notice and the service terminal all change state at different moments (on save vs on restart).

##### Merged source: lan-companion-pairing/STORY-014 — Disable device access and return a phone to the pairing screen

**Type**: medium
**Topic**: Companion device pairing over LAN
**Persona**: Priya, done for the weekend, wants LAN access off and her phone signed out.
**Goal**: Turn off LAN listeners and clear the phone.
**Preconditions**: LAN active; phone paired.
**Ideal path**: 3 — Forget on phone, Disable on desktop, restart.
**Alternate paths**: rotate the token (STORY-100) to also invalidate the shared secret.

**Steps (from lan-companion-pairing/STORY-014):**

1. On the phone she taps **Forget this workspace** (workspace actions) → local credential, preferences and pending request cleared; pairing screen with **Pair this device**.
2. Reloads the phone page → still the pairing screen (nothing remembered).
3. On the loopback desktop: **Pair another device** → QR shown; she expands **Network settings** (collapsed, since `phoneUrl` exists) and clicks **Disable device access**.
4. Dialog: "Settings saved. Restart the Pardner service with the same data directory to apply them, then reopen this dialog. Existing access stays active until restart." QR disappears; button reads **Enable device access**.
5. Ctrl-C and restart the service → LAN listeners not started; reopening the dialog shows Network settings open and no QR.
6. Phone at the LAN URL now gets a browser connection error.

**Variations (from lan-companion-pairing/STORY-014):**

- She skips step 1: after restart the phone shows "Local service disconnected"/connection errors but keeps its stored credential; re-enabling later lets it reconnect without pairing.

**Edge Cases (from lan-companion-pairing/STORY-014):**

- Until restart, the phone (if not forgotten) keeps working — the notice says so but it's easy to miss.
- **Forget this workspace** does not revoke the shared secret; any other paired browser keeps access.
- Clicking **Save network** with the unchanged interface clears the current code: QR vanishes and the button reads **Generate pairing code** with no restart notice — surprising side effect.

---

#### STORY-100: Rotate the shared secret after a phone is lost, then re-pair the remaining devices
*(was credential-lifecycle-cleanup/STORY-005)* — **Merged sources:** lan-companion-pairing/STORY-013 "Token rotation forces every companion device to re-pair"

**Type**: long
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Tomás Herrera, a team lead whose phone, paired to the team's Pardner hub, was left in a taxi
**Goal**: Make the lost phone's stored credential useless, keep agents and the CLI working, and re-pair his tablet, without losing the unsaved work on the desktop.
**Preconditions**: Hub `serve --data .pardner` with LAN enabled on `en0`; tablet and lost phone paired; desktop loopback tab open with Actor `tomas · human`; agent `builder` uses the CLI with `--data .pardner`; a replica at `.pardner-replica` was started with `--hub-token OLD`; Tomás's shell has `PARDNER_API_TOKEN` exported from an earlier tutorial.
**Ideal path**: 6 (rotate in one command, desktop re-auth, tablet re-pair, replica re-token; the remaining steps are verification).
**Alternate paths**: `serve --token NEW` instead of the `PARDNER_API_TOKEN` env. Deleting `connection.json` before restart (generates a random token, but also forgets saved ports). No in-UI rotation exists.
**Walkability**: `multi-service`
**Related**: STORY-099, STORY-101, STORY-105, STORY-109
**Why merged**: Both rotate `PARDNER_API_TOKEN` by restarting the service, watch every browser drop to AUTH_REQUIRED, and re-pair only trusted devices.
##### Steps
1. Searches the UI for "revoke device" → Finds nothing. **Pair another device** only offers pairing, and **Forget this workspace** works only on the browser it runs in. He opens `docs/PARDNER-LAN.md`, "Transport and credential lifecycle": "There is no per-device revocation."
2. Desktop: types a comment on "Add latency instrumentation" but has not sent it. Decides to finish the rotation first.
3. Stops the hub with Ctrl-C → Desktop SaveStatus shows "Local service disconnected". The notice reads "Live updates disconnected. Reconnecting automatically…".
4. Generates a secret via his password manager and runs `PARDNER_API_TOKEN=<new> node bin/pardner.js serve --data .pardner` → The service starts. `connection.json` (0600) is rewritten with the new token, so future plain `serve` restarts keep it.
5. Desktop tab reconnects: `/pardner/config` succeeds, then `/automerge/doc` returns 401 AUTH_REQUIRED. The stored credential is dropped and the connection screen appears with the alert "The service credential changed. Pair again or enter the current local service token.", "Check that the service is running…", and **Retry connection** disabled.
6. The comment draft in Task details is gone with the unmounted workspace (it was never sent, so there is no pending write). Tomás grumbles and retypes it later.
7. Expands **Connect with a local service token** (already open on loopback), pastes the new token into **Local service token**, clicks **Connect** → "Opening your local workspace…", then the board. **Actor** is still `tomas · human`, because preferences survived; only the credential was cleared.
8. Runs `node bin/pardner.js --data .pardner status` in his old shell → Fails with `AUTH_REQUIRED` on stderr and `{"success":false,"error":{"code":"AUTH_REQUIRED",…}}` on stdout, because the stale exported `PARDNER_API_TOKEN` outranks `connection.json`. He runs `unset PARDNER_API_TOKEN` and retries → `"success":true`.
9. Agent `builder` runs `pardner mentions claim-next --request-id r-77 --actor builder --data .pardner` with no env override → Works, reading the new token from `connection.json`.
10. Tablet: live updates drop when the hub restarts. On reconnect it gets AUTH_REQUIRED and shows the pairing screen with "The service credential changed. Pair again or enter the current local service token."
11. Desktop: **Pair another device** → QR and "Use once before 4:12 PM". Tablet scans the QR → `#pair=CODE` is stripped from the URL and redeemed → "Saved locally · synced". The **Actor** selection is preserved.
12. The lost phone (if someone opens it) reconnects with the old secret → AUTH_REQUIRED → pairing screen. Pairing needs a fresh code from a trusted device, so the phone is locked out.
13. Replica: shows "Saved locally · waiting for hub" for its writes, because the hub rejects the old `hubToken`. Tomás stops it and restarts with `serve --data .pardner-replica --role replica --hub http://127.0.0.1:8004 --hub-ws ws://127.0.0.1:8005/automerge --hub-token <new>` → Its pending changes sync and SaveStatus reaches "Saved locally · synced".
14. Verifies in **Activity** that the replica's offline edits arrived, attributed to the right Actors.
##### Variations
- Uses `serve --data .pardner --token <new>` instead. Same result, but the token may land in shell history; the LAN doc warns "Do not print it into logs or put it in URLs."
- Tomás pairs the tablet by typing the 8-digit code from **Connect manually** instead of scanning.
##### Edge Cases
- If a write was pending on the desktop when AUTH_REQUIRED hit, it survives. After reconnecting, "A request is awaiting confirmation." and **Retry saved request** appear (STORY-101).
- An old in-flight request that rejects *after* re-pairing does not wipe the new credential (`credential() === token` guard; tested in `test/browser-connection.test.js` and "stays paired when an old authentication rejection arrives late").
- Ten wrong codes in a minute on the tablet → `PAIRING_THROTTLED` "Too many attempts. Wait a minute and try again."
- **Multi-surface:** desktop, tablet, lost phone, CLI shell, agent and replica each find out about the rotation through different messages. Only the browsers get human-readable guidance.

##### Merged source: lan-companion-pairing/STORY-013 — Token rotation forces every companion device to re-pair

**Type**: long
**Topic**: Companion device pairing over LAN
**Persona**: Hannah, hub operator who rotates `PARDNER_API_TOKEN` after an intern copied a pairing link into a public channel.
**Goal**: Cut off all old browsers and re-pair only the trusted phone.
**Preconditions**: LAN active; two phones and one LAN desktop paired; Hannah's loopback browser connected.
**Ideal path**: 5 — restart with new token, reconnect loopback browser, open dialog, scan on trusted phone, choose Actor; there is no per-device revocation, so a single rotation is the only lever.
**Alternate paths**: none found for selective revocation; **Forget this workspace** only clears one browser and does not revoke.

**Steps (from lan-companion-pairing/STORY-013):**

1. Hannah stops the service and restarts with a newly generated `PARDNER_API_TOKEN` supplied from her secret manager, same `--data` → `connection.json` updated; unused pairing codes cleared.
2. Her loopback desktop tab: next request returns AUTH_REQUIRED → pairing screen with "The service credential changed. Pair again or enter the current local service token."; **Connect with a local service token** is open by default (admin).
3. She pastes the new token into **Local service token** and clicks **Connect** → board loads.
4. Old phones: on next request they drop to the pairing screen with the same message; the intern's leaked link, if opened, yields "The pairing code is incorrect or expired. Generate a new code on the desktop."
5. She clicks **Pair another device** → QR with fresh code.
6. Her own phone (showing the pairing screen) — she scans the QR → pairs with the new secret; chooses **Actor** "hannah".
7. Closes the dialog.
8. Verifies with `pardner status` on the laptop that the service is healthy.

**Variations (from lan-companion-pairing/STORY-013):**

- Instead of scanning, the phone user types the code into the already-visible **Pairing code** field.

**Edge Cases (from lan-companion-pairing/STORY-013):**

- A phone mid-write when the token rotated keeps its pending request in tab session storage; after re-pairing, **Retry saved request** completes it with the original operation ID.
- Phones that never make a request stay on their last-rendered board until they reconnect; there is no push revoke.
- Friction: the only remediation for a leaked secret is a restart with a new token, which disconnects everything including CLI/replica configs using the old token.

---

#### STORY-101: Credential rotated mid-save — pending write survives re-authentication
*(was credential-lifecycle-cleanup/STORY-006)*

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Aiko Tanaka, a designer who marks a task Completed at the moment ops restarts the hub with a new token
**Goal**: Make sure her status change is not lost when the credential changes underneath her.
**Preconditions**: Loopback browser, Actor `aiko · human`, Task details open for "Ship onboarding illustrations" (status "Review"); hub is being restarted with a new `PARDNER_API_TOKEN`.
**Ideal path**: 3 (save, re-enter token, the pending write auto-retries or is retried with one click).
**Alternate paths**: Re-pair via code instead of token. Make the change via CLI `pardner update <task> --status completed --revisions '{"status":["<rev>"]}'` after re-authenticating.
**Walkability**: `multi-service` (single hub restart with new token)
**Related**: STORY-004, STORY-077, STORY-097, STORY-099, STORY-100, STORY-105, STORY-109, STORY-117
##### Steps
1. Clicks **Edit task**, sets **Status** to "Completed", clicks **Save changes** → "Saving locally…". The request lands on the restarted hub and returns 401 AUTH_REQUIRED.
2. The workspace unmounts to the connection screen with the alert "The service credential changed. Pair again or enter the current local service token." The pending operation stays in sessionStorage.
3. Asks ops for the new token and pastes it into **Local service token** → **Connect** → The board loads with the notice "A request is awaiting confirmation." and **Retry saved request**. **New task** is disabled.
4. Clicks **Retry saved request** → The same operation ID is sent and accepted, "Saved locally · synced", and the card moves to the **Completed** column.
5. Opens the task → **History** shows `aiko · human · task.update` with `status: "review" → "completed"`, exactly once.
##### Variations
- She reopens Task details after step 3 instead of retrying, clicks **Edit task** and tries to save → "Resolve the saved request before starting another change."
- If a teammate also changed the status meanwhile, the retry returns STALE_UPDATE "This field changed since it was read; refresh its context" with "Your draft is preserved. Review the latest context before making a new edit." The pending write is cleared.
##### Edge Cases
- If she clicks **Forget this workspace** on the connection screen instead of reconnecting, the pending status change is lost (STORY-097, STORY-098).
- The pending key is per workspace and per tab. Re-authenticating in a *different* tab shows no saved request.

---

#### STORY-102: Cleared site storage while the board is open
*(was credential-lifecycle-cleanup/STORY-007)*

**Type**: short
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Rafael Costa, a developer who clears browser site data for `127.0.0.1:8004` to debug an unrelated app on a different port of the same host
**Goal**: Understand why Pardner suddenly asks him to pair, and get back in.
**Preconditions**: Loopback browser connected, Actor `rafael · human`, **Vein** filter "Edge caching".
**Ideal path**: 2 (notice the storage was cleared; reconnect with the token).
**Alternate paths**: Pair via code from another trusted device's **Pair another device**.
**Walkability**: `browser`
**Related**: STORY-110
##### Steps
1. Clears site data in DevTools (Application → Clear storage) without reloading → The board stays visible. The next request (a WS reconnect or any save) sends an empty bearer and gets AUTH_REQUIRED.
2. The page drops to the connection screen with "The service credential changed. Pair again or enter the current local service token." Rafael is puzzled, because nobody changed the credential.
3. Pastes the token from `.pardner/connection.json` into **Local service token** → **Connect** → The board appears, but **Actor** shows "Choose an Actor" and filters are back to "All Actors" / "All statuses" / "All veins" (preferences were wiped too).
##### Variations
- He reloads after clearing → Goes straight to the pairing form with no message at all.
- Private browsing window closed and reopened: same as reload (`docs/PARDNER-LAN.md`: "Private browsing can discard credentials when its session ends.").
##### Edge Cases
- If storage is now *blocked* (not just cleared), **Connect** shows "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes."
- Opening Pardner at `http://localhost:8004/pardner/` instead of `127.0.0.1` is a different origin with empty storage, so it needs a fresh connect even though nothing was cleared.

---

#### STORY-103: A different data directory now answers on the same address
*(was credential-lifecycle-cleanup/STORY-008)*

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Grace Mbeki, a consultant who keeps one Pardner data directory per client and swaps between them on port 8004
**Goal**: Switch from client A's workspace to client B's without writing to the wrong one, then switch back.
**Preconditions**: Tab connected to `serve --data ~/pardner/acme`; `~/pardner/borealis` is a separate, initialized data directory with its own `connection.json` token.
**Ideal path**: 3 (stop A, start B, enter B's token; switching back should need 0 extra steps since A's credential is still stored).
**Alternate paths**: Run B on other ports (`--http-port 8014 --ws-port 8015`) and keep both tabs open. That uses a different origin and separate storage.
**Walkability**: `multi-service` (restart on a different `--data` dir)
**Related**: STORY-012, STORY-082, STORY-093, STORY-096, STORY-097, STORY-098, STORY-111
##### Steps
1. Stops Acme's service, runs `node bin/pardner.js serve --data ~/pardner/borealis` → The Acme tab shows "Local service disconnected" and the reconnect notice.
2. On reconnect, `/pardner/config` returns Borealis's `workspaceId`. `Pardner` remounts `Workspace` for the new key. No message explains the switch. Borealis's token differs, so the tab shows the connection screen with no alert.
3. Grace wonders why she was "logged out". She pastes Borealis's token → **Connect** → The Borealis board. Actor "Choose an Actor" (no preferences stored for this workspace yet).
4. Later stops Borealis and starts Acme again → The tab remounts for Acme's `workspaceId`. Acme's credential and preferences are still in localStorage under `pardner:<acme-id>:*`, so the Acme board opens directly with her previous Actor and filters.
##### Variations
- She had exported the same `PARDNER_API_TOKEN` for both directories. The token is accepted, but `X-Pardner-Workspace` mismatches, so the service returns 409 `WORKSPACE_MISMATCH` "The service workspace changed. Reload before continuing." The UI reloads config and remounts, and she still has to re-enter the token for the new workspace key.
- During a pairing redemption, the code is redeemed by a service whose workspace differs from the loaded config. The connection screen shows "The service workspace changed. Reload before pairing." and the returned token is not stored.
- A WS `document-state` arrives with a foreign `workspaceId`. The socket closes and config reloads. If only the refresh path notices, the message is "The service workspace changed. Reopening the current workspace.".
##### Edge Cases
- A pending write from Acme in this tab stays under Acme's key and reappears as "A request is awaiting confirmation." when Acme is back. It is never sent to Borealis.
- Forgetting while on Borealis clears only Borealis's keys. Acme's credential persists, which surprises a user who expected "Forget" to sign this browser out of everything.

---

#### STORY-104: Close out work that should have been deleted
*(was credential-lifecycle-cleanup/STORY-009)*

**Type**: medium
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Owen Liu, a staff engineer cleaning up a board after a spike: one task was finished, one approach failed, one was a duplicate
**Goal**: Remove three tasks from the active columns, given that there is no delete.
**Preconditions**: Actor `owen · human`; tasks "Prototype Redis edge cache" (In progress), "Try Varnish ESI" (In progress) and "Add latency instrumentation (dup)" (Backlog) on the board.
**Ideal path**: 6 (per task: open, set terminal status, save would be 3; a card-level status menu could make it 1 per task).
**Alternate paths**: CLI `pardner update <task> --status dead-end --revisions '{"status":["<rev>"]}' --actor owen` (revisions from `pardner show <task>`). **Hand off work** with **Handoff status** set to a terminal status (requires a **Recipient** and **Handoff message**).
**Walkability**: `browser`
**Related**: STORY-030
##### Steps
1. Looks for "Delete" on a card or in Task details → None exists. He reads `docs/` or asks a teammate and learns tasks are closed by status.
2. Opens "Prototype Redis edge cache" → **Edit task** → **Status** "Completed" → **Save changes** → The card moves to **Completed**. History shows `status: "in-progress" → "completed"`.
3. Opens "Try Varnish ESI" → **Edit task** → **Status** "Dead end" → **Save changes** → It moves to **Dead end**.
4. Opens the duplicate → **Edit task** → **Status** "Abandoned". He also edits **Title** to "Add latency instrumentation (dup — see original)" → **Save changes** → Both changed fields are sent with their revisions; the card is in **Abandoned**.
5. Sets **Status filter** to "In progress" → Only live work remains in the single filtered column.
##### Variations
- Owen does it via CLI for speed: `pardner show task-… --json` to get `revisions.status`, then `pardner update task-… --status abandoned --revisions '{"status":["<op-id>"]}' --actor owen` → The board updates live in his open tab.
- He opens **Edit task** and saves without changing anything → The editor closes with no operation (empty `updates`).
##### Edge Cases
- If a teammate changed the status concurrently on a replica, the card shows **Conflicting edits**. Saving a new status returns CONFLICT_REQUIRES_RESOLUTION until he uses "Resolve status" → **Keep this status**.
- Closed tasks stay in the seven-column board forever. **Completed**, **Dead end** and **Abandoned** keep growing, and no archive or hide exists.
- The vein still counts closed tasks ("N tasks" in Goals) until they are unlinked (STORY-051).

---

#### STORY-105: Offboarding a contractor end to end
*(was credential-lifecycle-cleanup/STORY-012)*

**Type**: long
**Topic**: Credential lifecycle and cleanup (destructive)
**Persona**: Nadia Karim, operations manager offboarding Jordan, a contractor who used a personal phone (paired) and a laptop CLI, and who owned tasks and a mention lease
**Goal**: Reassign Jordan's work, clean up his traces where appropriate, and make sure none of his devices can reach the workspace afterwards.
**Preconditions**: Hub on Nadia's machine with LAN enabled; Actor `jordan · human` registered; Jordan holds a claimed mention lease and two In progress tasks; his phone is paired; his laptop CLI has the token in `PARDNER_API_TOKEN`.
**Ideal path**: 10 (reassign two tasks, release the lease, rotate the secret, re-pair the team's own devices; there is no Actor removal, so that step does not exist).
**Alternate paths**: CLI `handoff` instead of the UI **Hand off work**. `serve --token` instead of the env var. Disabling device access instead of rotating (does not revoke; STORY-099).
**Walkability**: `multi-service`
**Related**: STORY-099, STORY-100, STORY-101, STORY-109
##### Steps
1. Nadia sets **Assigned to** to `jordan · human` → The board shows his two In progress tasks.
2. Opens "Migrate billing webhooks" → **Hand off work**: **Recipient** `bob · human`, **Handoff status** "Up next", **Handoff message** "Jordan's contract ended — @bob please pick this up; notes in the description." → **Hand off** → Assignee and status change atomically, and the message appears under **Comments**.
3. The second task is half-done and the approach is abandoned → **Edit task** → **Status** "Dead end" → **Save changes**.
4. Checks for Jordan's outstanding leases: `pardner mentions pending --actor jordan` → Lists one claimed mention. She lacks his `--claim-token`, so `mentions release` is not possible for her. She waits for the lease TTL to expire.
5. Notices a comment where Jordan pasted his personal phone number. Runs `pardner comments <task>` and `pardner comment-delete <comment> --revisions '[…]' --actor nadia` → It disappears from Task details (still in history).
6. Looks for "Remove Actor" in the **Actor** select and CLI help → None. `actors` only has `list` and `register`. Jordan stays selectable in the **Actor** and **Assigned to** menus.
7. Opens **Pair another device** → There is no list of paired devices to revoke.
8. Stops the hub. Restarts with `PARDNER_API_TOKEN=<fresh> node bin/pardner.js serve --data .pardner`.
9. Her own desktop tab gets "The service credential changed. Pair again or enter the current local service token." She pastes the new token → **Connect** → the board, with Actor preserved.
10. Team devices: for each teammate's phone, **Pair another device** → **Generate new code** (the old code is replaced). Each phone redeems the code via QR. A code is single-use, so she regenerates per device; "Use once before …" shows each new expiry.
11. Jordan's phone (if still in use) reconnects → AUTH_REQUIRED → the pairing screen. He has no code, so he is locked out.
12. Jordan's laptop CLI with the old token → `AUTH_REQUIRED`.
13. Sends the remaining agents' operators the new token through the secret manager. Agents using `--data .pardner` pick it up from `connection.json` automatically.
14. Verifies in **Activity**: the handoff, the status update, `comment.delete` and the subsequent agent operations are all attributed correctly.
##### Variations
- Nadia only clicks **Disable device access** and restarts. Jordan's phone is cut off from the LAN, but his laptop CLI on the same network could still use the token against loopback if he had shell access to the host. Rotation is the only real revocation.
- Handoff blocked: someone changed the status while Nadia was typing → "Assignment or status changed while you were preparing this handoff. Your draft is preserved." She clicks **Use latest task details**, then **Hand off**.
##### Edge Cases
- There is no Actor delete. Old Actors accumulate in every Actor select, and the UI does not mark them inactive.
- The deleted comment and Jordan's whole operation history remain in Automerge, which matters for privacy requests.
- Rotating the token logs out *every* browser and CLI at once. For a team of five plus agents, the re-pair fan-out (one 10-minute single-use code at a time) is the dominant cost.
- **Multi-surface:** UI handoff, CLI mention and comment commands, service restart, and re-pairing on several devices are all needed. No single surface shows "who has access".

---

### Error and bootstrap failures

<details><summary>Topic background (from errors-bootstrap.md)</summary>

Sources read: `ui-prototype/index.html`, `ui-prototype/src/main.jsx`, `ui-prototype/src/Pardner.jsx` (lines 52-102 `ErrorNotice`/`Pardner`, 104-430 `Workspace`, 625-734 `TaskForm`), `ui-prototype/src/connection.js`, `automerge-sync-server.js` (origin, auth, config, static, operation failure mapping), `lib/cli.js`, `bin/pardner.js`, `lib/sync-client.js`, `lib/workspace-schema.js` (`requireValue`, `text`, `resolveActor`, `checkActorNames`), `lib/workspace-commands.js:340-347` (bootstrap rule), `lib/workspace-runtime.js:37-60`, `lib/workspace.js:17-18`, `lib/storage-lease.js`, `lib/local-service.js`, `test/pardner-connection-ui.test.js:159-198`.

Notes for walkers:
- The static shell (`#startup`) belongs to `index.html`. React removes it on first mount, so its 12-second failure text only shows when the bundle never mounts.
- `ui-prototype/dist/` is served by `express.static`. When a file is missing, the request falls through to `authMiddleware` and the browser receives `401 {"error":"Unauthorized","code":"AUTH_REQUIRED"}` JSON, not an HTML error page.
- CLI errors come back as one JSON line on stdout, `{"success":false,"error":{"code":…,"message":…,"details":…}}`, plus `CODE: message` on stderr and exit code 1 (`bin/pardner.js`).

</details>

#### STORY-106: CLI agent runs a command before the service is started
*(was errors-bootstrap/STORY-001)*

**Type**: short
**Topic**: Error and bootstrap failures
**Persona**: "builder", a coding agent in a fresh terminal whose harness runs `pardner tasks --assignee builder` at startup
**Goal**: Find out why the task list is empty and get it working
**Preconditions**: `.pardner/` exists from an earlier session. `pardner serve` is not running. No `--server` or `PARDNER_LOCAL_URL` is set.
**Ideal path**: 2 — run the command, see a clear "service not running" error that names the fix, start the service, rerun.
**Alternate paths**: `pardner status` hits the same `api('/automerge/status')` path and fails the same way. `--server http://127.0.0.1:8004` changes the URL but not the outcome.
**Walkability**: `cli-only`
**Related**: STORY-072, STORY-125
##### Steps
1. Run `node bin/pardner.js tasks --assignee builder --actor builder` → stdout `{"success":false,"error":{"code":"LOCAL_SERVICE_UNAVAILABLE","message":"Could not reach sync server: fetch failed","details":null}}`; stderr `LOCAL_SERVICE_UNAVAILABLE: Could not reach sync server: fetch failed`; exit code 1.
2. The agent reads "sync server". It has to work out that this means the local Pardner service and not the hub. Nothing in the message mentions `pardner serve`.
3. In another shell, run `node bin/pardner.js serve` → the long-running process prints `{"success":true,"serving":true,"role":"hub",…,"httpUrl":"http://127.0.0.1:8004",…}`. Startup logs such as "🚀 Starting Automerge Sync Server..." go to stderr.
4. Rerun step 1 → `{"success":true,"tasks":[…],"status":{…}}`.
##### Variations
- `.pardner/connection.json` stores `httpUrl`. If an earlier `serve --http-port 8014` wrote it, the CLI targets 8014, while a fresh `serve` with no flag reuses the saved `httpPort` (`lib/local-service.js` reads `saved.httpPort`).
- The service is running but hung. The 10s `AbortSignal.timeout` fires; `requestJson` rethrows the abort as-is (`sync-client.js` lines 60-61), so the code is not `LOCAL_SERVICE_UNAVAILABLE`. It falls back to `INTERNAL_ERROR` or the error's own name.
##### Edge Cases
- The message text "fetch failed" comes from Node's undici, and the root cause (ECONNREFUSED) is only in `cause`, which is not printed.
- `LOCAL_SERVICE_UNAVAILABLE` can also come from inside a running service ("The local service is not ready", `workspace-runtime.js:206`), returned as HTTP 503. Same code, different situation.

---

#### STORY-107: Opening the UI when the browser build was never made
*(was errors-bootstrap/STORY-003)*

**Type**: medium
**Topic**: Error and bootstrap failures
**Persona**: Marco, a contributor who cloned the repo, ran `npm ci`, and went straight to `node bin/pardner.js serve`
**Goal**: See the Pardner UI at `http://127.0.0.1:8004/pardner/`
**Preconditions**: `ui-prototype/dist/` does not exist (no `npm run ui:build`). Service running with a token.
**Ideal path**: 3 — open the URL, see a page that says the browser build is missing and gives the command, build, then reload.
**Alternate paths**: `npm run dev --prefix ui-prototype` and open `http://localhost:5174/pardner/` (Vite serves source and proxies `/pardner/config`, `/pardner-api`, `/pardner-ws`).
**Walkability**: `browser+cli` (start the service without `ui:build`)
**Related**: STORY-001, STORY-006, STORY-010, STORY-108, STORY-116
##### Steps
1. Open `http://127.0.0.1:8004/pardner/` → no HTML is returned. Static serving misses, the request falls through to `authMiddleware`, and the browser shows raw JSON: `{"error":"Unauthorized","code":"AUTH_REQUIRED"}`.
2. Marco thinks he needs a token. He checks `.pardner/connection.json` but finds nowhere on this page to enter it. He hesitates.
3. He tries `http://127.0.0.1:8004/pardner/config` → valid JSON `{"apiBase":"","wsPath":"/","wsPort":8005,"workspaceId":"…","canManageAccess":true}`. This tells him the service itself is healthy.
4. He finds the run instructions and runs `npm ci --prefix ui-prototype && npm run ui:build`.
5. He reloads → the static shell "Opening your workspace…" flashes, then the React connection screen appears: "Pardner", "One workspace for human and agent Actors.", the **Pairing code** field, and **Connect with a local service token** open by default (loopback `canManageAccess`).
6. He pastes the token into **Local service token** and clicks **Connect** → "Opening your local workspace…", then the workspace header.
##### Variations
- **Stale build**: `dist/index.html` exists, but its hashed `assets/*.js` file was deleted by a partial rebuild. The shell shows "Opening your workspace…" plus the hint "If this page does not open, check that the service is running and use the current address from Pair another device on the desktop." The asset request gets a 401 JSON body, the module script fails, and the `error` listener (or the 12s timer) swaps the text to "Pardner could not finish loading. Reload the page; if this continues, rebuild the browser client and restart the service." **Reload Pardner** keeps the same result until the rebuild. (Covered by `test/pardner-connection-ui.test.js:169-172`, which aborts `**/assets/*.js`.)
- JavaScript disabled: `<noscript>` adds "Enable JavaScript to open Pardner." beneath the shell text, which still says "Opening your workspace…".
##### Edge Cases
- A missing build looks like an authentication failure (AUTH_REQUIRED), which sends people looking for a credential problem.
- Started with `PARDNER_ALLOW_INSECURE_LOCAL=1` and no token, `authMiddleware` passes, and the route ends in Express's default "Cannot GET /pardner/" page instead.
- The shell's hint mentions "Pair another device", which a first-time loopback user has never seen.

---

#### STORY-108: Service is down when the page first loads (config fetch fails)
*(was errors-bootstrap/STORY-004)*

**Type**: short
**Topic**: Error and bootstrap failures
**Persona**: Dana, a product manager who reopens her pinned `http://127.0.0.1:8004/pardner/` tab after a laptop reboot
**Goal**: Get back to her board
**Preconditions**: Browser restores the tab from cache, or the dev server on 5174 is up while the service is not. Valid credential stored in localStorage.
**Ideal path**: 2 — see "service not running", start it, click **Retry connection**.
**Alternate paths**: **Reload Pardner** is not offered on this screen; a browser reload goes back through the static shell.
**Walkability**: `multi-service` (service stopped; cached shell or Vite dev server)
**Related**: STORY-001, STORY-006, STORY-010, STORY-107, STORY-116
##### Steps
1. The page mounts → `<p role="status">` "Opening your workspace…" while `GET /pardner/config` runs (10s timeout).
2. The fetch fails → the status line shows the raw failure message (Chromium "Failed to fetch", WebKit "Load failed", or "The service returned an unreadable response. Retry the connection." when a proxy returns non-JSON). Below it: "Check that the service is running. If the address changed, open Pair another device on the desktop." and **Retry connection**.
3. Dana starts the service from her terminal, then clicks **Retry connection** → the config loads, the credential is reused, and "Opening your local workspace…" leads to the workspace with her remembered **Actor** and view.
##### Variations
- Service returns `500 {"error":"Configuration unavailable"}` → the status line shows "Configuration unavailable" (exact `error` text), with **Retry connection** (test line 174-177).
- Config is JSON but has no `workspaceId` (for example a different app on port 8004) → "The service configuration is incomplete. Restart the service and retry."
- 10s abort → the browser's timeout message, such as "signal timed out".
##### Edge Cases
- Browser-native error strings ("Failed to fetch") appear as the main message. Only the second line is Pardner's own wording.
- **Multi-surface:** If the browser cannot reach the service at all, it shows its own "can't be reached" page and no Pardner text appears. This screen only appears in dev mode or with a cached shell.

---

#### STORY-109: Service stops mid-session and restarts with a rotated token
*(was errors-bootstrap/STORY-005)*

**Type**: long
**Topic**: Error and bootstrap failures
**Persona**: Alice, a human Actor triaging her board while the host operator restarts the service with a new `--token`
**Goal**: Keep working without losing her Actor choice or view
**Preconditions**: Alice is connected by token, **Actor** = "alice · human", **Status filter** = "Review". Mirrors `test/pardner-connection-ui.test.js:159-198`.
**Ideal path**: 4 — notice the disconnect, wait or retry, enter the new token when asked, carry on.
**Alternate paths**: Pair with an 8-digit code instead of the token (**Pair another device** on the host → **Generate pairing code** → enter it in **Pairing code** → **Pair this device**). **Forget this workspace** then reconnect (this loses preferences).
**Walkability**: `multi-service` (single hub restart with new token)
**Related**: STORY-099, STORY-100, STORY-101, STORY-105
##### Steps
1. The operator stops the service. The WebSocket closes → SaveStatus changes to "Local service disconnected". A `role=status` notice reads "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable." with **Retry connection**.
2. Alice keeps reading the board. Cards remain visible (last `doc`), and the **Review** column filter persists.
3. Reconnect attempts back off 1s, 2s, 4s … up to 15s. Each failure replaces the notice text with the config fetch error ("Failed to fetch").
4. Alice clicks **Retry connection** impatiently → another attempt starts immediately and fails the same way.
5. She tabs to Slack and back → the `focus`/`visibilitychange` handlers trigger another attempt.
6. The operator restarts with `--token rotated-secret` on the same ports.
7. The next attempt reloads config, then `GET /automerge/doc` returns `401 AUTH_REQUIRED` → `connection.request` forgets the stored credential, and `Workspace.request` clears `token`/`doc`.
8. The screen goes back to the connection view: "Pardner", "One workspace for human and agent Actors.", the pairing form, **Connect with a local service token** (open on loopback), and an alert "The service credential changed. Pair again or enter the current local service token." + "Check that the service is running. For a changed address, reopen Pair another device on the desktop." + **Retry connection** (disabled because there is no token and no code).
9. Alice asks the operator for the new token and receives it in chat.
10. She first pastes it with a trailing newline → `remember` trims it, so it still works. **Connect** → "Opening your local workspace…".
11. The workspace returns with **Actor** still "alice · human" and **Status filter** still "Review" (preferences are keyed by workspaceId and survive credential loss).
12. SaveStatus: "Saved locally · synced".
##### Variations
- She enters `incorrect` first → after the attempt, 401 again → the alert reappears and she can retry the field (test line 181-183).
- The service restarts with the same token → step 7 is skipped and the notice clears silently on `socket.onopen`.
- Only the WS port (8005) is blocked by a firewall → HTTP refresh succeeds, the WS never opens, and the 10s opening timer closes it. The notice "…Check that both service ports are reachable." is the only hint.
##### Edge Cases
- If a late 401 from the old token arrives after a new credential is stored, `credential() === token` prevents forgetting the new one (test at line 88).
- With a pending saved write (sessionStorage), the request survives the round trip. **Retry saved request** reappears after reconnection.
- On step 8 the second line ("Check that the service is running…") misleads, because the service is running and only the secret changed.

---

#### STORY-110: Browser site storage is blocked
*(was errors-bootstrap/STORY-006)*

**Type**: medium
**Topic**: Error and bootstrap failures
**Persona**: Tomás, a privacy-minded reviewer whose Chromium profile has "Block third-party and site data" enabled
**Goal**: Open Pardner and make one edit
**Preconditions**: Service running and built. Chromium blocks site data for `127.0.0.1`.
**Ideal path**: 3 — open, see a clear storage message, allow storage for the site, reload.
**Alternate paths**: none found. There is no in-memory fallback; `createConnection` defaults to the `localStorage` and `sessionStorage` globals.
**Walkability**: `browser` (browser configured to block site data)
**Related**: STORY-102
##### Steps
1. Open `http://127.0.0.1:8004/pardner/` → the static shell mounts React, `/pardner/config` succeeds, and `Workspace` constructs `createConnection(config)`.
2. Reading `localStorage` throws a SecurityError during render → `StartupBoundary` catches it → `role=alert` heading "Pardner could not open", "Allow browser site storage, then reload. If this continues, check that the service and browser build are up to date.", **Reload Pardner**.
3. Tomás clicks **Reload Pardner** without changing anything → the same screen appears.
4. He opens the site settings, allows cookies and site data for `127.0.0.1:8004`, then clicks **Reload Pardner** → connection screen.
5. He enters the token and clicks **Connect** → workspace.
##### Variations
- **Storage readable but writes fail** (quota exceeded or Safari restrictions): render succeeds. **Connect** → `remember` throws → the connection alert shows "Browser storage is unavailable. Allow site storage to remember this workspace and safely retry changes." followed by "Check that the service is running. For a changed address, reopen Pair another device on the desktop."
- Inside the workspace, the preferences save in a `useEffect` fails → `ErrorNotice` shows the same storage message plus "Your last confirmed data remains available."
- `savePending` failing on **Create task** → the same notice. The operation is never sent (the write must persist before send).
##### Edge Cases
- The boundary text leads with storage even when the real render error is something else (for example a stale build). The fallback has no detail and does not log the error.
- In the write-failure variation the "Check that the service is running" line is wrong, since the service is fine.

---

#### STORY-111: Opening Pardner from a hostname the service does not allow
*(was errors-bootstrap/STORY-007)* — **Merged sources:** lan-companion-pairing/STORY-011 "Opening the device page through a hostname instead of the shown IP (ORIGIN_REJECTED)"

**Type**: medium
**Topic**: Error and bootstrap failures
**Persona**: Sam, a designer who bookmarked `http://sams-mbp.local:8004/pardner/` instead of the loopback or paired LAN address
**Goal**: Connect from that bookmark
**Preconditions**: Service on the default origin allowlist (`localhost`/`127.0.0.1` on 8004 and 5174, plus LAN origins when device access is enabled). Bonjour resolves `sams-mbp.local` to the LAN IP. LAN access is enabled (so the HTTP port is reachable).
**Ideal path**: 2 — see a message pointing to the right address, open it.
**Alternate paths**: The operator adds the origin with `PARDNER_ALLOWED_ORIGINS=http://sams-mbp.local:8004` (it must be an explicit list; "*" makes startup throw "PARDNER_ALLOWED_ORIGINS must be an explicit comma-separated allowlist. Wildcard "*" is not supported."). Note that an explicit list replaces the defaults (`parseAllowedOrigins`).
**Walkability**: `multi-service`
**Related**: STORY-082, STORY-093, STORY-103
**Why merged**: Both open the UI through an mDNS hostname, hit `ORIGIN_REJECTED` on pairing, and recover by opening the **Device address** IP.
##### Steps
1. Open the bookmark → the shell and bundle load (static GETs carry no Origin). `/pardner/config` loads → pairing screen. **Connect with a local service token** is closed (`canManageAccess` false off-loopback).
2. Sam types the 8-digit code from the desktop's **Pair another device** dialog into **Pairing code** → **Pair this device** ("Connecting…").
3. `POST /pardner/pair` carries `Origin: http://sams-mbp.local:8004` → `403 ORIGIN_REJECTED` → alert "Origin not allowed. Open the current address shown in Pair another device." + "Check that the service is running. For a changed address, reopen Pair another device on the desktop." + **Retry connection**.
4. Sam clicks **Retry connection** → the same 403. He wonders whether the code expired.
5. On the desktop dialog, under **Connect manually**, he reads **Device address** (for example `http://192.168.1.24:8004/pardner/`) and clicks **Copy address** → "Address copied".
6. He opens that address on his laptop, enters the code, and clicks **Pair this device** → the workspace opens.
##### Variations
- A token-based visitor from a disallowed origin gets past config and `GET /automerge/doc`, then `POST /automerge/ws-ticket` returns 403. The workspace renders with the notice "Origin not allowed. Open the current address shown in Pair another device." and keeps retrying with backoff.
- The WS upgrade itself is rejected with `{"code":"ORIGIN_REJECTED","error":"Origin not allowed. Open the current device address."}`. The UI does not read this body and shows "Live updates disconnected…".
- Pairing via curl with no Origin → `403 ORIGIN_REQUIRED` "Pair from the device page using its pairing form."
##### Edge Cases
- Two wordings for the same rejection: HTTP says "…shown in Pair another device", WS says "…current device address".
- The code is not consumed by the rejected attempt (origin middleware runs before the pair handler), so Sam does not need a new code.

##### Merged source: lan-companion-pairing/STORY-011 — Opening the device page through a hostname instead of the shown IP (ORIGIN_REJECTED)

**Type**: short
**Topic**: Companion device pairing over LAN
**Persona**: Grace, sysadmin by habit, who prefers `http://graces-mbp.local:8004/pardner/` over numeric IPs.
**Goal**: Pair her phone using the mDNS name.
**Preconditions**: LAN active at `192.168.1.42`; current code "60218834".
**Ideal path**: 2 — open the displayed address, pair.
**Alternate paths**: open the displayed IP link (STORY-085/004).

**Steps (from lan-companion-pairing/STORY-011):**

1. On the phone she opens `http://graces-mbp.local:8004/pardner/#pair=60218834` → page and config load (GET requests carry no Origin), auto-pair POST is rejected: alert "Origin not allowed. Open the current address shown in Pair another device."
2. She opens the exact **Device address** from the desktop's **Connect manually** (IP-based) with a fresh code → pairs.

**Variations (from lan-companion-pairing/STORY-011):**

- If she had a stored credential for the `.local` origin, the WebSocket subscription would be refused with ORIGIN_REJECTED "Origin not allowed. Open the current device address." (and authenticated POSTs with the HTTP variant), so live updates never arrive.

**Edge Cases (from lan-companion-pairing/STORY-011):**

- The rejected POST hit origin middleware before redemption, so the code is not consumed and no throttle attempt is counted; but she may have reopened the dialog meanwhile, invalidating it.
- Adding `http://graces-mbp.local:8004` to `PARDNER_ALLOWED_ORIGINS` makes this work; the dialog never mentions that option.

---

#### STORY-112: Creating a task with a whitespace-only title
*(was errors-bootstrap/STORY-008)*

**Type**: short
**Topic**: Error and bootstrap failures
**Persona**: Jordan, a human Actor quickly capturing a placeholder card on a phone
**Goal**: Create a task
**Preconditions**: Workspace open, **Actor** chosen, no pending request.
**Ideal path**: 3 — **New task**, type the title, **Create task**.
**Alternate paths**: CLI `pardner task create --title '   ' --actor jordan` → `INVALID_ARGUMENT: title must be text with content`.
**Walkability**: `browser`
**Related**: STORY-004, STORY-013, STORY-014, STORY-023, STORY-133
##### Steps
1. Click **New task** → side panel "New task" with **Title**, **Description**, **Status** (Backlog), **Priority** (p2), **Assignee** (Unassigned), **Tags, separated by commas**.
2. Leave **Title** empty and press **Create task** → the browser's native `required` bubble ("Please fill out this field.") appears. Nothing is sent.
3. Jordan types three spaces and presses **Create task** → this passes `required`. The request is sent → `ErrorNotice` at the top of the workspace: "title must be text with content" / "Your last confirmed data remains available."
4. INVALID_ARGUMENT is definitive, so the pending write is cleared and the panel stays open with the spaces still in the field. Jordan types "Fix login redirect" → **Create task** → the panel closes and Task details opens for the new task. The error clears on submit.
##### Variations
- Editing an existing task: **Edit task** → clear the title to spaces → **Save changes** → the same "title must be text with content".
- Tags field `,,,` → filtered to `[]`, no error.
##### Edge Cases
- The message is lowercase and uses the field key ("title"), not the label "Title". It renders in the page-level notice, not next to the field, which may be off-screen on mobile when the side panel covers the board.

---

#### STORY-113: Trying to change work with no Actor chosen
*(was errors-bootstrap/STORY-009)*

**Type**: short
**Topic**: Error and bootstrap failures
**Persona**: Lee, a human who opened Pardner on a newly paired tablet
**Goal**: Comment on a task
**Preconditions**: Paired companion device. **Actor** = "Choose an Actor" (no preference on this device). Tasks exist.
**Ideal path**: 3 — choose the Actor, open the task, comment.
**Alternate paths**: none found for UI writes; CLI requires `--actor`.
**Walkability**: `multi-service` (loopback browser with no Actor reproduces most of it)
**Related**: STORY-008, STORY-019, STORY-036
##### Steps
1. Lee sees **New task** disabled but does not notice why. He clicks a card → Task details opens.
2. He types "Looks good to me" in the **Comment** box and clicks **Add comment** → `ErrorNotice`: "Choose the Actor making this change." / "Your last confirmed data remains available." No request is sent.
3. He scrolls to the header, picks his Actor in **Actor**, returns, and clicks **Add comment** again → the comment appears under **Comments (N)**.
##### Variations
- **Hand off** and **Mark displayed comments read** fail with the same message when no Actor is set (both go through `submit`).
- The stored Actor no longer exists in this workspace (prefs copied or doc changed) → the effect resets **Actor** to empty, so the next write gets the same message.
##### Edge Cases
- **New task** is disabled while other write buttons stay enabled and fail on click. The two cases behave differently.
- On mobile the notice renders at the top of the page, far from the comment box.

---

#### STORY-114: Starting the service on a directory from an incompatible prior install
*(was errors-bootstrap/STORY-011)*

**Type**: medium
**Topic**: Error and bootstrap failures
**Persona**: Hana, an early adopter upgrading after months away, with `~/.pardner` from a schema-3 build
**Goal**: Start Pardner without losing her old data
**Preconditions**: `~/.pardner/workspace.json` has `schemaVersion` 3 (or the directory holds old Automerge files with no manifest).
**Ideal path**: 3 — start, read a clear "preserved, use a new directory" error, start on a new `--data`.
**Alternate paths**: `PARDNER_DATA_DIR=~/.pardner-v4 pardner serve`. Migration is intentionally not provided.
**Walkability**: `cli-only`
**Related**: STORY-001
##### Steps
1. Run `pardner serve --data ~/.pardner` → startup log "🚀 Starting Automerge Sync Server..." on stderr, then stdout `{"success":false,"error":{"code":"INCOMPATIBLE_SCHEMA","message":"Workspace metadata is incompatible; preserve this directory and enroll a new workspace",…}}`, exit 1.
2. Hana wonders whether "enroll" means she needs a hub. She checks that the directory is untouched (nothing is deleted).
3. She runs `pardner serve --data ~/.pardner-v4` → `{"success":true,"serving":true,"role":"hub",…}`. This is a new workspace with no Actors.
4. She bootstraps her Actor (see STORY-002) and re-creates key tasks manually.
##### Variations
- Directory with stray files and no `workspace.json` → "This directory contains data without compatible workspace metadata; choose a new directory".
- Manifest is OK but the Automerge document schema differs → "This workspace uses an incompatible schema. Preserve its data and enroll a new Pardner workspace." (`lib/workspace.js`).
- `serve --role replica` on a hub directory → `ROLE_MISMATCH` "Use the role recorded for this storage directory".
- A second `serve` on the same directory → `STORAGE_IN_USE` "Another Pardner service is using this storage directory".
- Replica enrolling against a hub that exposes no compatible workspace → "The hub does not expose a compatible Pardner workspace".
##### Edge Cases
- There are three different wordings for INCOMPATIBLE_SCHEMA ("enroll a new workspace", "choose a new directory", "enroll a new Pardner workspace"), and only one names the action concretely.
- Any open browser tab pointed at the old port shows the STORY-108 "service down" state. Nothing tells the user that the workspace was replaced; once a new service is up, `workspaceId` changes and the tab remounts and asks for the token.

---

#### STORY-115: Ambiguous Actor after two replicas register overlapping names offline
*(was errors-bootstrap/STORY-012)*

**Type**: long
**Topic**: Error and bootstrap failures
**Persona**: Kenji (hub host) and Mei (replica laptop on a train), both onboarding a new agent while disconnected
**Goal**: Get the agent able to post comments again after the replicas sync
**Preconditions**: Hub on 8004/8005, replica on 8014/8015 enrolled earlier, replica currently offline. Registration only checks names against the local document (`checkActorNames`).
**Ideal path**: 3 — see the ambiguity, address the Actor by its unique id, continue.
**Alternate paths**: Address the Actor by id with `--actor reviewer-bot` vs handle. There is no Actor rename or delete command, so the overlap is permanent.
**Walkability**: `multi-service`
**Related**: STORY-002, STORY-003, STORY-043, STORY-124
##### Steps
1. Kenji on the hub: `pardner actors register reviewer --handle reviewer --kind agent --actor kenji` → success.
2. Mei on the replica (offline): `pardner --data .pardner-replica actors register reviewer-bot --handle reviewer --kind agent --actor mei` → success locally. SaveStatus in her browser: "Saved locally · waiting for hub".
3. Mei's train reaches Wi-Fi. The replica syncs. Both Actors now exist and both have handle `reviewer`.
4. The agent harness runs `pardner comment TASK 'Ready for review' --actor reviewer` → `{"success":false,"error":{"code":"AMBIGUOUS_ACTOR","message":"Ambiguous Actor: reviewer; use an unambiguous Actor reference",…}}`. Id `reviewer` matches one Actor and handle `reviewer` matches the other.
5. The harness retries with the same `--operation-id` → the same error (validation runs before replay lookup).
6. Kenji runs `pardner actors list` → sees `{"id":"reviewer","handle":"reviewer",…}` and `{"id":"reviewer-bot","handle":"reviewer",…}`.
7. He hesitates, expecting the new id to fail the same way, but sets `PARDNER_ACTOR=reviewer-bot` for the agent → `comment` succeeds, because `reviewer-bot` matches only by id (no Actor has handle `reviewer-bot`).
8. The `reviewer` Actor (id) stays ambiguous for every write. Kenji has no way to retire it.
9. **Multi-surface:** In the UI, the **Actor** select lists both as "reviewer · agent". Choosing the first (id `reviewer`) and clicking **Add comment** → `ErrorNotice` "Ambiguous Actor: reviewer; use an unambiguous Actor reference" / "Your last confirmed data remains available." AMBIGUOUS_ACTOR is definitive, so the pending write is cleared.
10. Mei picks the second "reviewer · agent" entry → the write succeeds.
##### Variations
- Kenji and Mei have Mei's agent use `--actor reviewer-bot` from the start; no error appears until someone uses `reviewer`.
##### Edge Cases
- The two select entries have identical labels (`labelActor` uses displayName or handle plus kind), so the UI gives the user no way to tell which is safe.
- The message tells the user to "use an unambiguous Actor reference" but the UI has no way to enter one.

---

#### STORY-116: Full first-run bootstrap with each failure hit along the way
*(was errors-bootstrap/STORY-013)*

**Type**: long
**Topic**: Error and bootstrap failures
**Persona**: Olivia, an engineering manager setting up Pardner for herself plus one coding agent on a new Mac, following `docs/ux-paths/discovery.md` "How to Run"
**Goal**: Go from a clean clone to her first task on the board in the browser
**Preconditions**: Node 24.11.1, repo cloned, nothing built, no data directory.
**Ideal path**: 6 — install, build, serve, register Actor, open and connect, create task.
**Alternate paths**: Vite dev server on 5174 instead of a build. Pairing code instead of token (needs LAN enabled first, so not suitable for loopback-only).
**Walkability**: `multi-service`
**Related**: STORY-001, STORY-005, STORY-006, STORY-010, STORY-011, STORY-032, STORY-107, STORY-108, STORY-138
##### Steps
1. `npm ci` → succeeds.
2. She skips the UI build and runs `node bin/pardner.js serve --data .pardner-olivia` → `{"success":true,"serving":true,…,"httpUrl":"http://127.0.0.1:8004",…}`.
3. Opens `http://127.0.0.1:8004/pardner/` → raw JSON `{"error":"Unauthorized","code":"AUTH_REQUIRED"}` (STORY-107).
4. She runs `npm ci --prefix ui-prototype && npm run ui:build` without stopping the service, and reloads → the shell "Opening your workspace…" → connection screen with **Connect with a local service token** expanded.
5. She looks for the token. The helper says "Use the token from the service’s connection.json file." She opens `.pardner-olivia/connection.json` and copies `token`.
6. She pastes the token and clicks **Connect** → "Opening your local workspace…" → workspace header with SaveStatus, an **Actor** select showing only "Choose an Actor", and the notice "Register your first human or agent Actor with `pardner actors register` to begin."
7. She clicks **New task** → disabled.
8. In the terminal: `node bin/pardner.js --data .pardner-olivia actors register olivia --handle olivia --kind human` (no `--actor`) → `ACTOR_REQUIRED: Supply --actor or PARDNER_ACTOR`.
9. She adds `--actor olivia` → success. The browser notice disappears live.
10. `actors register builder --handle builder --kind agent --actor builder` → `UNKNOWN_ACTOR: Unknown Actor: builder` (bootstrap applies only to the first Actor).
11. She reruns with `--actor olivia` → success.
12. Browser: **Actor** → "olivia · human". **New task** becomes enabled.
13. **New task** → **Title** "Set up CI cache", **Priority** p1, **Assignee** "builder · agent", **Tags, separated by commas** "infra, ci" → **Create task** → the panel closes, Task details opens, and the card appears in **Backlog**.
14. She stops the service (Ctrl-C) to update Node → SaveStatus "Local service disconnected" + "Live updates disconnected. Reconnecting automatically. Check that both service ports are reachable."
15. She tries to start a second service in another terminal before the first one has fully exited → `STORAGE_IN_USE: Another Pardner service is using this storage directory`.
16. Once the first process has exited, she restarts → the browser reconnects on the next backoff tick or focus. The notice clears and SaveStatus shows "Saved locally · synced". **Actor** is still olivia.
##### Variations
- If step 2 omits `--data`, the service uses `.pardner` in the cwd. Later commands with `--data .pardner-olivia` find no `connection.json`, so they still target `http://127.0.0.1:8004` but send no token → `AUTH_REQUIRED` ("Unauthorized").
##### Edge Cases
- Steps 3, 8 and 10 are three separate guesses in the first ten minutes. None of the messages names the next command.
- The no-Actors notice names the command but not the bootstrap rule (`--actor` must equal the new id).

---

### Agent power user on the CLI

<details><summary>Topic background (from cli-power-user.md)</summary>

Sources: `lib/cli.js`, `bin/pardner.js`, `lib/workspace-commands.js`, `lib/workspace-schema.js`, `lib/workspace.js`,
`lib/workspace-runtime.js`, `lib/sync-client.js`, `lib/cli-trace.js`, `lib/agent-trace.js`, `lib/agent-bridge.js`,
`lib/bridge-inbox.js`, `lib/codex-bridge-adapter.js`, `docs/AGENT-TRACE.md`, `docs/PARDNER-BRIDGE.md`,
`test/pardner-cli-workflow.test.js`, `test/patchwork-branching.test.js`, `test/pardner-cli-auth-fallback.test.js`.

Shared facts used across stories (all from code):

- `bin/pardner.js` prints exactly one JSON line on stdout: `{"success":true,...result}` or
  `{"success":false,"error":{"code","message","details"}}`, and on failure also `CODE: message` on stderr with exit code 1.
- `--json` is a boolean flag that only changes `help` output (`pardner help --json` returns `{"success":true,"help":"..."}`).
  Every other command already prints JSON whether or not `--json` is passed, although HELP lists `--json` on `tasks` and `show`.
- A mutation receipt is `{success, operationId, actorId, replicaId, result, replayed, savedLocally: true, heads, syncPending, status}`.
- Operation IDs must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$` ("Operation ID must be a nonempty identifier"); the CLI uses
  `randomUUID()` when `--operation-id` is absent. Record IDs derive from it: `task-` + first 24 hex chars of sha256(operationId).
- Field revisions are the operation IDs that wrote each field (`show` → `revisions.status` etc.).
- Aliases: `agents` = `actors`, `timeline` = `activity`, `--agent` = `--actor`, `mentions deliver` = `mentions ack`.
- `--actor`/`PARDNER_ACTOR` is both the mutation author and the read filter/observer for `show` (unreadCount), `activity`
  and `mentions pending`.

</details>

#### STORY-117: Retrying a task creation safely after a timeout
*(was cli-power-user/STORY-002)*

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `planner`, a Claude Code agent scripting backlog creation from an issue list over a flaky VPN to a hub
**Goal**: Create one task for "Add p95 latency histogram" exactly once, even though the first call's response was lost.
**Preconditions**: `PARDNER_ACTOR=planner`, `PARDNER_DATA_DIR=/Users/dev/.pardner`; `planner` is a registered agent.
**Ideal path**: 2 — create with a caller-chosen operation ID; on uncertainty rerun the identical command and read `replayed`.
**Alternate paths**: UI **Retry saved request** reuses the stored operation ID after an uncertain failure (`Pardner.jsx:285`); `pardner operation --request` with an explicit `operationId` (STORY-124).
**Walkability**: `cli-only`
**Related**: STORY-004, STORY-077, STORY-097, STORY-101
##### Steps
1. First attempt without thinking about retries: `pardner task create --title 'Add p95 latency histogram' --priority p1 --tags '["perf","metrics"]'` → hangs, then after the 10 s `AbortSignal.timeout` prints `{"success":false,"error":{"code":"LOCAL_SERVICE_UNAVAILABLE","message":"Could not reach sync server: The operation was aborted due to timeout","details":null}}`.
2. Hesitates: the generated UUID is not in the error, so it cannot know whether the write landed. Runs `pardner tasks --status backlog` → finds a task titled "Add p95 latency histogram" with `revisions.title: ["5b0f…-uuid"]`. The first write did land.
3. Decides to adopt a deterministic ID scheme for the rest of the batch: `--operation-id issue-412-create`.
4. Creates the next task: `pardner task create --title 'Export traces to OTLP' --priority p2 --operation-id issue-413-create` → receipt `operationId: "issue-413-create"`, `result.taskId: "task-…"`, `replayed: false`, `savedLocally: true`.
5. VPN drops on the response for issue 414; reruns the identical command `pardner task create --title 'Sample slow queries' --operation-id issue-414-create` → `replayed: true`, same `result.taskId`, no second task.
6. Copy-paste mistake: reuses `issue-414-create` for 'Alert on error budget' → `{"code":"OPERATION_ID_REUSED","message":"This operation ID already belongs to a different request"}` (HTTP 409), nothing written.
7. Fixes the ID to `issue-415-create` → `replayed: false`.
8. Verifies with `pardner activity --limit 5` → newest-first `task.create` events with `operationId` values `issue-415-create`, `issue-414-create`, `issue-413-create`, each once.
##### Variations
- `--tags` must be JSON; `--tags perf,metrics` → "--tags must be valid JSON".
- `--vein vein-a,vein-b` attaches veins at creation (comma list, not JSON — different from `--tags`).
- `--assignee none` maps to unassigned.
##### Edge Cases
- `--operation-id issue.412` → `INVALID_ARGUMENT` "Operation ID must be a nonempty identifier" (dots and colons rejected).
- Replay ignores later state: replaying an `update` whose `--revisions` are now stale still returns the original receipt with `replayed: true`, not `STALE_UPDATE`.
- Fingerprint covers type, resolved actorId and payload, so `--actor Planner` (handle, lowercased) replays the same as `--actor planner`, but a different Actor with the same ID gets `OPERATION_ID_REUSED`.
- Because the taskId is derived from the operation ID, the same `--operation-id` on two disconnected replicas yields the same `task-` ID.
- Friction: transport errors carry `details: null`, so an agent that did not pre-choose `--operation-id` cannot retry idempotently. Only `STORAGE_FAILED` includes `details.operationId` ("Retry with the same operation ID").

---

#### STORY-118: Updating a field with expected revisions and recovering from STALE_UPDATE
*(was cli-power-user/STORY-003)*

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `builder`, an agent moving its assigned task to review while a human edits the same task
**Goal**: Change `status` to `review` and `priority` to `p1` without clobbering a concurrent edit.
**Preconditions**: Task `task-9c41e07a2b5d8f3361a0c7de` exists, assigned to `builder`, `PARDNER_ACTOR=builder`.
**Ideal path**: 2 — `show` to read revisions, then `update` with those revisions.
**Alternate paths**: UI **Edit task** → **Save changes** (sends only changed fields with `expectedRevisions`; on `STALE_UPDATE` shows "Your draft is preserved. Review the latest context…"); `handoff` for assignee+status together; `operation --request` with type `task.update`.
**Walkability**: `cli-only`
**Related**: STORY-018, STORY-019, STORY-029, STORY-062
##### Steps
1. `pardner show task-9c41e07a2b5d8f3361a0c7de` → `task.status: "in-progress"`, `revisions: {"status":["op-alice-start"],"priority":["create-412"],...}`, `conflicts: {}`.
2. Tries the shortcut it half-remembers: `pardner update task-9c41… --status review` → `INVALID_ARGUMENT` "Supply --revisions".
3. Passes revisions as an array by mistake (the `resolve` shape): `--revisions '["op-alice-start"]'` → server treats `expected.status` as undefined → `REVISION_REQUIRED` "Supply the observed field revisions", `details.current: ["op-alice-start"]`.
4. Correct object shape: `pardner update task-9c41… --status review --priority p1 --revisions '{"status":["op-alice-start"],"priority":["create-412"]}' --operation-id builder-412-review`.
5. Meanwhile `alice` changed status in the UI; response → `STALE_UPDATE` "This field changed since it was read; refresh its context", `details: {"current":["op-ui-7f2…"],"expected":["op-alice-start"]}` (HTTP 409). Nothing written, including priority.
6. Re-reads `pardner show task-9c41…` → `status: "up-next"` with `history` showing alice · task.update `status: "in-progress" → "up-next"`. Decides alice deprioritised it on purpose; drops the status change.
7. `pardner update task-9c41… --priority p1 --revisions '{"priority":["create-412"]}' --operation-id builder-412-prio` → `replayed: false`, `result.taskId`.
8. Comments to explain: `pardner comment task-9c41… '@alice left status at up-next; bumped to p1'` → `result.commentId`, `result.mentionIds: ["mention-…"]`.
##### Variations
- Updating only `--title` needs only `{"title":[...]}`; extra keys in the revisions object are ignored.
- `--order 1700000000000` is coerced with `Number()`; `--order soon` → "Task order must be a finite number".
- `--status done` → "Status must be one of: backlog, up-next, in-progress, review, completed, dead-end, abandoned".
##### Edge Cases
- Field already in conflict → `CONFLICT_REQUIRES_RESOLUTION` "Resolve the concurrent alternatives explicitly" even with correct revisions; must use `resolve` (STORY-065).
- Retrying step 4 with the same `--operation-id` after a lost response returns `replayed: true` even though revisions are now stale.
- Friction: `update`/`handoff`/`goal update`/`vein update`/`merge` take an object `{field:[rev]}` while `resolve`/`goal resolve`/`vein resolve`/`comment-edit`/`comment-delete`/`vein remove` take a bare array; HELP shows both shapes without explaining why.
- Friction: no flag to "take latest" revisions; every write needs a preceding `show` and hand-built JSON.

---

#### STORY-119: Reading a task's change log with diff
*(was cli-power-user/STORY-005)*

**Type**: short
**Topic**: Agent power user on the CLI
**Persona**: `reviewer` agent asked "who changed the priority on the caching task?"
**Goal**: See every field change on one task with its author and operation ID.
**Preconditions**: Task `task-61e0b9a4c2f7d83e15a9b06c` with several edits.
**Ideal path**: 1 — `diff <task>` returns field changes with authors.
**Alternate paths**: `show` → `history[].changes` (same data, nested, with timestamps and types); `activity --task` (events, not field-level); UI Task details **History** ("field: old → new").
**Walkability**: `cli-only`
**Related**: STORY-042, STORY-120, STORY-128, STORY-129, STORY-131, STORY-134
##### Steps
1. `pardner diff task-61e0…` → `{"taskId":"task-61e0…","changes":[{"field":"title","old":null,"new":"Edge cache warmup","actorId":"alice","operationId":"…"}, …, {"field":"priority","old":"p2","new":"p0","actorId":"bob","operationId":"op-…"}],"conflicts":{}}`.
2. Wants a time for the priority change; `diff` has none. Falls back to `pardner show task-61e0…` and finds the history event with that `operationId` → `timestamp`, `type: "task.update"`, `replicaId`.
3. Reports "bob set p0 at 14:22 from replica …".
##### Variations
- Created fields appear as `old: null` entries for every field (title, description, status, priority, assignee, tags, order, type).
- Handoffs contribute assignee and status changes; comments contribute nothing to `changes`.
##### Edge Cases
- `diff` without a task → "Supply a task ID"; unknown ID → `NOT_FOUND` "Task not found: …".
- Redundancy: `diff` is a client-side reshaping of `show.history`; it drops `timestamp` and `type`, so most audits still need `show`.

---

#### STORY-120: Auditing recent activity by Actor and task
*(was cli-power-user/STORY-006)* — **Merged sources:** activity-history-audit/STORY-004 "Agent misses its own filter and sees only its own activity"

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `ryan`, a human operator reviewing overnight agent work from a terminal
**Goal**: List the last 50 operations by `builder`, then everything that happened on one task.
**Preconditions**: Shell profile exports `PARDNER_ACTOR=ryan` for convenience.
**Ideal path**: 2 — `activity --actor builder --limit 50`, then `activity --task <id>`.
**Alternate paths**: `timeline` (exact alias); UI **Activity** view (all operations newest first, no filter/pagination); `show` → `history` per task; `diff` per task.
**Walkability**: `browser+cli`
**Related**: STORY-042, STORY-119, STORY-128, STORY-129, STORY-131, STORY-134
**Why merged**: Both fall into the `PARDNER_ACTOR`-doubles-as-`activity`-filter trap and recover with an empty/unset env var.
##### Steps
1. `pardner activity` → only 20 events, all by `ryan`. Confused: expected the whole workspace.
2. Realises `activity` filters by `--actor` *or* `PARDNER_ACTOR`, which is set in the profile. No flag says "all actors".
3. Runs `PARDNER_ACTOR= pardner activity --limit 50` (empty env) → workspace-wide newest first, sorted by `timestamp` then `operationId` descending.
4. `pardner activity --actor builder --limit 50` → events with `type` (`task.update`, `comment.add`, `task.link-commit`, `task.handoff`…), `taskId`, `changes`, `result`, `replicaId`, `fingerprint`, `payload`.
5. Picks a task and runs `pardner timeline --task task-9c41e07a2b5d8f3361a0c7de` → still filtered to `ryan` because `PARDNER_ACTOR` is set again in this shell; gets only ryan's events on that task.
6. `PARDNER_ACTOR= pardner timeline --task task-9c41… --limit 100` → full task log including `read.mark` events (which `show.history` excludes).
7. Tries `--limit all` → `INVALID_ARGUMENT` "Supply a positive --limit"; uses `--limit 1000`.
##### Variations
- `--actor` accepts a handle: `--actor Builder` resolves (lowercased) to `builder`.
- `--actor ghost` → `UNKNOWN_ACTOR` "Unknown Actor: ghost".
- Two Actors sharing a reference → `AMBIGUOUS_ACTOR`.
- **Multi-surface:** UI Activity shows the same operations with "Actor · operation type", a task link and local time, but no filters; `docs/AGENT-TRACE.md` says commit events appear in `pardner timeline`.
##### Edge Cases
- `--task` with a nonexistent or mistyped ID silently returns `{"activity":[]}` (not `NOT_FOUND`).
- Actor-registration and goal/vein events have no `taskId`, so `--task` never shows them.
- `activity` downloads the whole document (`/automerge/doc`) and filters client-side; no cursor/offset beyond `--limit`.
- Friction: the author flag doubling as a read filter makes `PARDNER_ACTOR` unsafe for audit commands; the same applies to `mentions pending` (STORY-127).

##### Merged source: activity-history-audit/STORY-004 — Agent misses its own filter and sees only its own activity

**Type**: medium
**Topic**: Activity and history audit
**Persona**: `builder` agent's operator, Sam Cho, scripting a nightly summary in a shell where `export PARDNER_ACTOR=builder` is set
**Goal**: Get the 50 most recent workspace operations by anyone.
**Preconditions**: Workspace with 200+ operations by `priya`, `marco`, `builder`, `reviewer`; `PARDNER_DATA_DIR=.pardner-walk`.
**Ideal path**: 1 step — `pardner activity --limit 50` returning all Actors.
**Alternate paths**: Browser **Activity** view (unfiltered, but all operations at once); `pardner operation` is write-only, not an alternative.

**Steps (from activity-history-audit/STORY-004):**

1. Sam runs `pardner activity --limit 50` → JSON `{ "activity": [ ... ] }`, every entry has `"actorId": "builder"`.
2. Sam thinks the other Actors were idle; he opens the browser **Activity** view → sees "priya · human · task.update" entries interleaved. Confusion.
3. Sam re-reads HELP: `pardner activity [--task id] [--actor Actor] [--limit 20]` and "Mutations require --actor (or PARDNER_ACTOR)". He realises the env var doubles as the filter.
4. Runs `env -u PARDNER_ACTOR pardner activity --limit 50` → mixed Actors, newest first.
5. Tries `pardner activity --limit 0` by mistake while experimenting → error "Supply a positive --limit".
6. Runs `pardner activity --actor marco --limit 50` → only Marco's operations; `--actor MARCO` also works (handles are lower-cased in `resolveActor`).

**Variations (from activity-history-audit/STORY-004):**

- `pardner timeline --limit 50` is an identical alias.
- `--actor nobody` → `UNKNOWN_ACTOR` "Unknown Actor: nobody".

**Edge Cases (from activity-history-audit/STORY-004):**

- There is no way to say "all Actors" while `PARDNER_ACTOR` is set other than unsetting it; `--actor ''` is not a documented reset.
- `--limit` defaults to 20 silently; there is no `--since` or offset, so paging older history needs ever-larger `--limit` values.
- Output includes full `payload` (comment text, handoff messages) and `fingerprint`, which is verbose for a summary.

---

#### STORY-121: Experimenting on a branch and merging it back
*(was cli-power-user/STORY-007)*

**Type**: long
**Topic**: Agent power user on the CLI
**Persona**: `builder` agent trying an alternate scope for a task without disturbing the parent; `alice`, the human owner
**Goal**: Fork a task, change fields on the fork, merge only those changes back, and handle a conflicting merge.
**Preconditions**: Parent task `task-a07c33e912b84f6d5e0c1b27` with no conflicts; `PARDNER_ACTOR=builder`.
**Ideal path**: 4 — `branch`, `update` the branch, `show` parent for revisions, `merge`.
**Alternate paths**: none found in the UI (branches appear as ordinary cards; no branch or merge controls); `operation --request` with `task.branch` / `task.merge`.
**Walkability**: `cli-only`
**Related**: STORY-138
##### Steps
1. `pardner branch task-a07c… try-smaller-scope --operation-id builder-branch-1` → receipt `result: {"taskId":"task-…b1","branchId":"task-…b1","parentId":"task-a07c…"}`.
2. First tries a multi-word name: `pardner branch task-a07c… try smaller scope` → succeeds with name `try` (extra words silently dropped). Notices in `branches` output later.
3. `pardner branches task-a07c…` → `branches` array of tasks with `branch_of: "task-a07c…"`, `branch_name`, `merged: false`; both branches listed.
4. Abandons the accidental one: `pardner show <try branch>` for revisions, then `pardner update <try branch> --status abandoned --revisions '{"status":["builder-branch-2-uuid"]}'`.
5. On the real branch: `pardner show task-…b1` → `revisions.title: ["builder-branch-1"]`.
6. `pardner update task-…b1 --title 'Edge cache warmup (top 100 routes only)' --description '...' --revisions '{"title":["builder-branch-1"],"description":["builder-branch-1"]}'` → success.
7. Links evidence on the branch: `pardner commit --task task-…b1 -- -m 'feat: warm top 100 routes'` (see STORY-122).
8. Reads parent revisions: `pardner show task-a07c…` → `revisions` map.
9. Forgets revisions: `pardner merge task-…b1` → `INVALID_ARGUMENT` "Supply --revisions".
10. `pardner merge task-…b1 --revisions '<full parent revisions JSON>' --operation-id builder-merge-1` → receipt `result: {"taskId":"task-a07c…","parentId":"task-a07c…","branchId":"task-…b1"}`.
11. `pardner show task-a07c…` → parent title/description updated; untouched fields keep parent edits; history has `task.merge`; branch commit evidence visible in history with origin.
12. `pardner branches task-a07c…` → branch now `merged: true`, `status: "completed"`.
13. Lost response, reruns step 10 with the same ID → `replayed: true`. Reruns without `--operation-id` → `INVALID_BRANCH` "Choose an unmerged branch".
14. Second experiment: `pardner branch task-a07c… priority-bump`; `update` the branch `--priority p0`.
15. Meanwhile alice sets parent priority to `p1` in the UI.
16. `pardner merge <priority-bump> --revisions '<parent revisions>'` → `BRANCH_CONFLICT` "Both the parent and branch changed priority; reconcile them before merging", `details: {"field":"priority","parent":"p1","branch":"p0"}`. Branch stays `merged: false`.
17. Reconciles by updating the branch to `p1` (matching parent), then merges → success, no priority change.
##### Variations
- A branch with no changed fields merges with `--revisions '{}'` (no parent fields are checked).
- Branches of branches: `branch <branch> name` works; `branches` only lists direct children.
- **Multi-surface:** the UI board shows each branch as a separate card with the same title as the parent and no branch marker (`Pardner.jsx:384` filters all `doc.tasks`); merged branches sit in **Completed**.
##### Edge Cases
- Parent with field conflicts → `CONFLICT_REQUIRES_RESOLUTION` "Resolve parent task conflicts before branching".
- Branch with conflicts → "Resolve branch conflicts before merging".
- `merge <parent task>` (not a branch) → `INVALID_BRANCH`.
- Merge with stale parent revisions for a changed field → `STALE_UPDATE`.
- Branches do not copy vein links; the branch is absent from the parent's vein filter.
- Friction: `order` is never merged; the `name` positional is undocumented as single-token.

---

#### STORY-122: Committing code with trace attribution linked to a task
*(was cli-power-user/STORY-008)* — **Merged sources:** activity-history-audit/STORY-006 "Trace a commit from Pardner evidence back to the agent model and session"

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `builder`, a Claude Code agent with `PARDNER_ACTOR=builder`, `PARDNER_AGENT_MODEL=claude-opus`, `PARDNER_AGENT_SESSION_KEY=agent:builder:main`
**Goal**: Commit staged work, record a local trace, and attach the commit as evidence on the task.
**Preconditions**: Inside a Git repo with staged changes; service running; task `task-9c41e07a2b5d8f3361a0c7de`.
**Ideal path**: 1 — `commit --task <id> -- -m msg` does git commit, trace and `task.link-commit` in one step.
**Alternate paths**: plain `git commit` + `link-commit <task> --commit '{"hash","message"}'` (no trace file); UI Task details **Evidence** (read-only).
**Walkability**: `browser+cli`
**Related**: STORY-028, STORY-123, STORY-127, STORY-130
**Why merged**: Both run `pardner commit --task … -- -m …`, then read **Evidence** and `trace show/list/task`.
##### Steps
1. `git add lib/latency.js test/latency.test.js`.
2. Forgets the separator: `pardner commit --task task-9c41… -m 'feat: p95 histogram'` → `-m` is not a `--` option, so the parser treats it as a positional and passthrough is empty → `INVALID_ARGUMENT` "Put Git commit arguments after --". No commit is made.
3. `pardner commit --task task-9c41… -- -m 'feat: p95 histogram'` → Git output on stderr; stdout `{"success":true,"trace":{"version":1,"timestamp":"…","commit":{"hash":"e41a…","message":"feat: p95 histogram","author":"builder-bot <…>"},"agent":{"name":"builder","model":"claude-opus","sessionKey":"agent:builder:main"},"task":"task-9c41…","diff":{"stat":"…","shortstat":" 2 files changed, 84 insertions(+)"}},"receipt":{"operationId":"…","result":{"taskId":"task-9c41…","commitHash":"e41a…"},...}}`.
4. Notices `.gitignore` gained `.agent-trace/` (first trace in the repo) and the file `.agent-trace/2026-11-07-e41a….json`.
5. `pardner trace list --limit 5` → `traces` newest-first by filename.
6. `pardner trace show e41a` → `trace` record. `pardner trace task task-9c41…` → `{"taskId":"…","evidence":[{"hash":"e41a…","message":"feat: p95 histogram","diff":{…}}]}`.
7. `pardner show task-9c41…` → same `evidence` array; history has `task.link-commit`.
##### Variations
- Without `--task`: `receipt: null`, no service needed; works offline.
- `-- -am 'msg'`: commit succeeds, but `diff` stats were taken from `git diff --cached` before the commit, so unstaged tracked changes staged by `-a` are missing from `diff.stat`.
- `-- --amend --no-edit`: creates a new hash and a new trace; the old trace file remains.
- **Multi-surface:** evidence shows in UI Task details **Evidence** (hash + message), in `show.evidence`, and in `trace task`; the `.agent-trace` file is only in the repo.
##### Edge Cases
- Outside a repo → `GIT_REPOSITORY_REQUIRED` "Run this command inside a Git repository" (also for `trace list/show`, but not `trace task`).
- Nothing staged → `GIT_COMMIT_FAILED` with git's message on stderr.
- `--task` mistyped → `NOT_FOUND` before any commit; service down → `LOCAL_SERVICE_UNAVAILABLE`, HEAD unchanged.
- `trace show 2026` matches every filename containing "2026" and returns the first one (filter is `includes`, not a hash prefix).
- `trace list --limit abc` silently returns `[]`; same-day traces are ordered by hash, not time.
- Redundancy: `trace task` == `show .evidence`; `commit --task` duplicates `link-commit`.

##### Merged source: activity-history-audit/STORY-006 — Trace a commit from Pardner evidence back to the agent model and session

**Type**: medium
**Topic**: Activity and history audit
**Persona**: `builder` agent (Claude-based) and its human supervisor Lena Park
**Goal**: Commit work with attribution, show it as Evidence, and later recover model/session details.
**Preconditions**: Repo is a Git checkout; Pardner service running; task `task-…` "Add latency instrumentation"; `PARDNER_AGENT_MODEL=claude-opus` exported.
**Ideal path**: 3 steps — commit with `--task`, view Evidence, `trace show` the hash.
**Alternate paths**: Manual `git commit` + `pardner link-commit <task> --commit JSON` (no trace file, no model/session); `pardner trace list`.

**Steps (from activity-history-audit/STORY-006):**

1. Agent runs `pardner commit --actor builder --task task-… --session agent:builder:main -- -m "feat: add p95 histogram"` → Git output on stderr; stdout `{ trace: { version: 1, commit: { hash, message, author }, agent: { name: "builder", model: "claude-opus", sessionKey: "agent:builder:main" }, task, diff }, receipt }`.
2. Lena, in the browser with the task open, sees **Evidence** update live: the full 40-char hash in code style and "feat: add p95 histogram"; **History** gains "builder · agent · task.link-commit".
3. Lena copies the first 8 chars and runs `pardner trace show 1a2b3c4d` from inside the repo → `{ trace: {...} }` with model and session.
4. She runs `pardner trace task task-…` → `{ taskId, evidence: [ { hash, message, diff } ] }` (Pardner evidence, not trace files).
5. She runs `pardner trace list --limit 5` → most recent trace records.

**Variations (from activity-history-audit/STORY-006):**

- Without `--task`: `receipt` is `null`, nothing appears in Pardner Evidence; only the `.agent-trace/YYYY-MM-DD-<shortHash>.json` file exists.
- If the commit succeeds but `link-commit` fails (service down), the error carries `commitHash`, `traceRecorded: true` and recovery "Use link-commit with this existing commit; do not create another Git commit".

**Edge Cases (from activity-history-audit/STORY-006):**

- `.agent-trace/` is added to `.gitignore`, so traces live only on the machine that committed; Lena on another laptop gets `NOT_FOUND` "Commit trace not found" from `trace show` even though the UI shows the Evidence.
- `trace list` sorts by filename (`date-shortHash`), so traces from the same day are ordered by hash, not time.
- `trace show` outside a repo → `GIT_REPOSITORY_REQUIRED` "Run this command inside a Git repository"; `trace task` does not need a repo.
- `-- --amend` creates a new hash and trace; the old Evidence row for the pre-amend hash stays.
- The UI Evidence row shows neither model, session, diff stats nor author.

---

#### STORY-123: Recovering when Git committed but the evidence link failed
*(was cli-power-user/STORY-009)*

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `builder` agent whose local service restarted mid-command
**Goal**: Attach the existing commit to the task without creating a second commit.
**Preconditions**: As STORY-122; service stops between the git commit and `task.link-commit`.
**Ideal path**: 2 — read `details.commitHash` from the error, run `link-commit` once with a fixed operation ID.
**Alternate paths**: `operation --request` with `task.link-commit`.
**Walkability**: `multi-service` (stop the service between git commit and link)
**Related**: STORY-028, STORY-122, STORY-127, STORY-130
##### Steps
1. `pardner commit --task task-9c41… -- -m 'fix: clamp histogram buckets'` → git succeeds (stderr), then stdout `{"success":false,"error":{"code":"LOCAL_SERVICE_UNAVAILABLE","message":"Could not reach sync server: …","details":{"commitHash":"7bd02c9…","traceRecorded":true,"recovery":"Use link-commit with this existing commit; do not create another Git commit"}}}`.
2. Instinct is to rerun `pardner commit`; reads `recovery` and stops.
3. Waits for the service: `pardner status` → `success: true`.
4. `pardner link-commit task-9c41… --commit '{"hash":"7bd02c9…","message":"fix: clamp histogram buckets"}' --operation-id link-7bd02c9` → `result: {"taskId":"…","commitHash":"7bd02c9…"}`.
5. Lost response, reruns with same ID → `replayed: true`.
6. `pardner trace task task-9c41…` → two evidence items, no duplicate.
##### Variations
- Supplying `"diff"` in `--commit` JSON is accepted and kept in evidence; `link-commit` never writes a trace file.
##### Edge Cases
- `--commit '{"hash":"HEAD","message":"x"}'` → "Supply a git commit hash" (7–40 hex).
- Missing message → `INVALID_ARGUMENT` "Commit message must be text with content".
- If the link had actually landed before the failure, a new `link-commit` with a fresh operation ID adds a second, identical evidence entry; the error does not include the operation ID used by `commit`.

---

#### STORY-124: Scripting raw operations with operation --request
*(was cli-power-user/STORY-010)*

**Type**: medium
**Topic**: Agent power user on the CLI
**Persona**: `ops-script`, a shell script run by a human admin to bootstrap a workspace
**Goal**: Register Actors and create a goal-backed vein through the raw operation API with explicit IDs.
**Preconditions**: Fresh hub with no Actors; `PARDNER_DATA_DIR=/srv/pardner`.
**Ideal path**: 1 per operation — one `operation --request` per write.
**Alternate paths**: `actors register`, `vein create --goal`, `task create` high-level commands (same operation types); `POST /automerge/operations` with curl.
**Walkability**: `cli-only`
**Related**: STORY-002, STORY-003, STORY-043, STORY-115
##### Steps
1. `pardner operation --request '{"type":"actor.register","actorId":"alice","operationId":"boot-alice","payload":{"id":"alice","handle":"alice","kind":"human"}}'` → bootstrap allowed (no Actors and `actorId` equals `payload.id`) → `result.actorId: "alice"`.
2. Second registration copy-paste forgets `operationId` → `INVALID_ARGUMENT` "Operation ID must be a nonempty identifier". Note `--operation-id` is ignored here.
3. Adds it: `{"type":"actor.register","actorId":"alice","operationId":"boot-builder","payload":{"id":"builder","handle":"builder","kind":"agent"}}` → success.
4. Passes `--actor builder` hoping it sets author → ignored; author is the JSON `actorId`.
5. `{"type":"vein.create","actorId":"alice","operationId":"boot-vein-cache","payload":{"title":"Edge caching","goal":{"title":"p95 under 200ms"}}}` → `result: {"veinId":"vein-…","goalId":"goal-…","createdGoal":true}`.
6. Typo `"type":"task.creat"` → "Unknown operation type: task.creat".
7. Reruns the whole script → every step `replayed: true`.
##### Variations
- Running on a replica: `actor.register` → `HUB_REQUIRED` "Register new Actors on the hub".
- Bad JSON → "--request must be valid JSON".
##### Edge Cases
- Payload with both `goalId` and `goal` → `GOAL_REQUIRED` "Every vein pursues a goal: supply goalId or a new goal".
- Redundancy: every high-level mutation command is a thin wrapper over this; it is the only CLI path accepting payload fields that have no flag.

---

#### STORY-125: Pointing the CLI at the right workspace from any directory
*(was cli-power-user/STORY-011)*

**Type**: short
**Topic**: Agent power user on the CLI
**Persona**: `builder` agent spawned in a nested worktree `/Users/dev/pardner-work/packages/api`
**Goal**: Make all commands use the correct data dir and Actor without repeating flags.
**Preconditions**: Service data in `/Users/dev/.pardner`.
**Ideal path**: 2 — export `PARDNER_DATA_DIR` and `PARDNER_ACTOR`, then run commands.
**Alternate paths**: per-command `--data`/`--actor`; `--server URL --token TOKEN` or `PARDNER_LOCAL_URL`/`PARDNER_API_TOKEN`.
**Walkability**: `cli-only`
**Related**: STORY-072, STORY-106
##### Steps
1. `pardner tasks --assignee builder` → `AUTH_REQUIRED` (default `.pardner` resolves relative to cwd; no token loaded).
2. `export PARDNER_DATA_DIR=/Users/dev/.pardner PARDNER_ACTOR=builder`.
3. `pardner tasks --assignee builder` → `tasks` array + `status`.
4. `pardner comment task-9c41… 'started'` → authored as `builder`.
##### Variations
- `--agent builder` equals `--actor builder`; if both are supplied, `--actor` wins silently.
- `--data` overrides `PARDNER_DATA_DIR`; `--server`/`--token` override the file.
##### Edge Cases
- Missing actor on a mutation → `ACTOR_REQUIRED` "Supply --actor or PARDNER_ACTOR".
- `--actor builder --actor reviewer` → "Repeated option: --actor".
- `--message '--force is risky'` → "Supply a value for --message" (values can't start with `--`).
- `pardner comment task-9c41… started work` stores only `started`; extra words dropped.

---

#### STORY-126: Wiring an agent to wake on mentions with the bridge
*(was cli-power-user/STORY-012)*

**Type**: long
**Topic**: Agent power user on the CLI
**Persona**: `ryan`, a human bridge operator setting up `builder` on a dedicated Codex App Server thread
**Goal**: Configure and run `pardner bridge`, observe a delivery, and reconcile an uncertain dispatch after a crash.
**Preconditions**: Replica running; `builder` registered as agent; `codex app-server --listen ws://127.0.0.1:9001` with an existing thread `thr_7d1…` in worktree `/Users/dev/wt/builder`.
**Ideal path**: 5 — `status` (ids), `bridge inspect`, write config, `bridge run`, `bridge status`.
**Alternate paths**: polling with `mentions claim-next`/`ack` from any harness (STORY-127); T3 execution contract (`lib/t3-execution.js`).
**Walkability**: `cli-only` (needs a Codex App Server for `bridge run`)
**Related**: STORY-025, STORY-080, STORY-127
##### Steps
1. `pardner status --data /Users/dev/.pardner-replica` → copies `workspaceId`, `replicaId`.
2. `pardner bridge inspect --session thr_7d1… --worktree /Users/dev/wt/builder` (forgot `--endpoint`; HELP shows it but there is no default) → `{"success":false,"error":{"code":"ERR_INVALID_URL","message":"Invalid URL"}}` — a raw Node error, not a Pardner message.
3. Adds `--endpoint ws://127.0.0.1:9001` → `{threadId, worktree: "<realpath>", expectedPolicy: {approvalPolicy, approvalsReviewer, sandbox}}`.
4. Tries `--endpoint ws://192.168.1.20:9001` out of curiosity → "Bridge endpoints must be local loopback URLs without credentials or query parameters".
5. Writes `/Users/dev/bridge.json` with `workspaceId`, `replicaId`, `dataDirectory`, `inboxDirectory`, one mapping `{actorId:"builder", enabled:true, adapter:"codex-app-server", sessionOwner:"bridge", endpoint, threadId, worktree, expectedPolicy, allowedTaskIds:["task-9c41…"], allowedFromActorIds:["alice","reviewer"]}`.
6. First attempt uses relative `inboxDirectory` → "Bridge directories must be absolute".
7. Uses same directory for both → "Keep bridge storage separate from service storage".
8. Considers `"allowedFromActorIds": ["*"]` to save time → "Authorize explicit sender Actor IDs"; lists `["alice","reviewer"]` (IDs, not handles, per the bridge guide).
9. `pardner bridge run --config /Users/dev/bridge.json` → stdout `{"success":true,"bridging":true,"workspaceId":"…","replicaId":"…","actors":["builder"],"sourceError":null}`; process stays alive.
10. In another terminal, alice comments `@builder please profile the cache` on `task-9c41…`.
11. `pardner bridge status --config /Users/dev/bridge.json` → `states: [{scope:"builder", state:"accepted"}]`, `deliveries: [{id:"mention-…", actor:"builder", state:"accepted", turnId:"turn_…", receivedAt, dispatchedAt}]`.
12. A mention on a non-allowlisted task → delivery row stays `queued`, reason "blocked: task or sender is not authorized by this mapping"; state "blocked: queued work requires authorization".
13. Laptop sleeps mid-dispatch; bridge killed. Restart: row becomes `uncertain`, reason "Bridge stopped during dispatch; reconcile before retry"; state "uncertain: reconcile dispatch before continuing".
14. Tries reconcile while bridge running → `STORAGE_IN_USE` "Another Pardner service is using this storage directory". Stops the bridge (Ctrl-C).
15. Inspects Codex history; finds the turn. `pardner bridge reconcile --config /Users/dev/bridge.json --delivery mention-… --decision accepted --turn-id turn_… --evidence 'Verified in turn turn_…'` → `{"reconciled":true,"delivery":"mention-…","decision":"accepted"}`.
16. Restarts `bridge run`; `bridge status` shows `idle`/`accepted`.
##### Variations
- `--decision retry` requeues with the original prompt.
- `completionCleanup.archiveDirectory` archives threads and moves worktrees once all tasks end.
##### Edge Cases
- Reconcile a delivery that is not `uncertain` → `INVALID_BRIDGE_STATE` "Only uncertain dispatches can be reconciled".
- Missing `--evidence` → "Supply reconciliation evidence".
- Wrong replica → `WORKSPACE_MISMATCH` "Local service does not match the configured workspace and replica".
- `bridge` ignores `--data`/`PARDNER_DATA_DIR`; uses config `dataDirectory`.
- `bridge status` is persisted observation, not liveness.
- Mapping to a human Actor → `ACTOR_MISMATCH` "Mapping must name a registered agent Actor ID".

---

#### STORY-127: A full agent work session from mention to handoff
*(was cli-power-user/STORY-013)*

**Type**: long
**Topic**: Agent power user on the CLI
**Persona**: `builder`, a Codex agent working the latency task end to end; `reviewer` agent; `alice` human
**Goal**: Pick up assigned work, claim the mention, do the work with retries and evidence, and hand off for review.
**Preconditions**: `PARDNER_DATA_DIR`, `PARDNER_ACTOR=builder` exported; alice handed `task-9c41…` to builder with `@builder`.
**Ideal path**: 7 — `mentions claim-next`, `show`, `update`, `commit --task`, `show`, `handoff`, `mentions ack`.
**Alternate paths**: UI for alice (Hand off work, Comments, Evidence); bridge-driven wake-up (STORY-126).
**Walkability**: `cli-only`
**Related**: STORY-024, STORY-025, STORY-026, STORY-028, STORY-033, STORY-034, STORY-043, STORY-080, STORY-122, STORY-123, STORY-126, STORY-130
##### Steps
1. `pardner status` → `hubConnected: true`.
2. `pardner mentions pending` → `mentions` with one entry for builder (filtered via `PARDNER_ACTOR`).
3. `pardner mentions claim-next --request-id builder-claim-0711 --ttl-ms 600000` → `claimed: true`, `mention.taskId`, `claimToken`, `claimExpiresAt`.
4. `pardner show task-9c41…` → `task`, `revisions`, `comments`, `unreadCount: 2`, `mentions`, `evidence: []`.
5. Marks read: `pardner read task-9c41… --receipts '[{"commentId":"comment-…","revisionId":"op-…"}, …]'` → `result.receipts: 2`.
6. `pardner update task-9c41… --status in-progress --revisions '{"status":["op-handoff"]}' --operation-id builder-9c41-start`.
7. Response lost; reruns → `replayed: true`.
8. Does the work; `git add -A`; `pardner commit --task task-9c41… --session agent:builder:main -- -m 'feat: p95 histogram'` → `trace`, `receipt`.
9. `pardner tasks --assignee builder --status in-progress` → confirms.
10. Comment: `pardner comment task-9c41… 'Histogram live; see evidence'`.
11. `pardner show task-9c41…` → fresh `revisions.assignee`, `revisions.status`.
12. `pardner handoff task-9c41… --to reviewer --status review --message '@reviewer ready for review' --revisions '{"assignee":["…"],"status":["builder-9c41-start"]}' --operation-id builder-9c41-handoff` → `result.commentId`, `result.mentionIds` (one, for reviewer).
13. `pardner mentions ack mention-… --claim-token <token>` → `acknowledged: true`.
14. `pardner activity --limit 10` → builder's events only (PARDNER_ACTOR filter) — fine for self-audit.
15. `pardner status` → `syncPending: false`.
##### Variations
- `mentions release` returns the lease if the agent cannot take the work.
- Mentioning `@reviewer` in `--message` and `--to reviewer` produces one mention (recipients deduplicated).
##### Edge Cases
- Lease expiry before ack → `STALE_CLAIM` "The delivery claim has expired".
- `handoff` with stale revisions → `STALE_UPDATE`; **Multi-surface:** UI shows "Assignment or status changed while you were preparing this handoff."
- Friction: ack happens on the mention ID, not on the task; delivery ack is durable receipt, not task completion.

---

### Activity and history audit

<details><summary>Topic background (from activity-history-audit.md)</summary>

Source anchors: `ui-prototype/src/Pardner.jsx` (Activity view lines 531-549, Evidence 1043-1055, History 1056-1069, `labelActor` line 23), `lib/workspace-schema.js` (`recordHistory`, `taskContext`), `lib/workspace-commands.js` (`prepareOperation`, handlers), `lib/cli.js` (`activity`/`timeline`, `diff`, `show`), `lib/cli-trace.js`, `lib/agent-trace.js`, `docs/AGENT-TRACE.md`.

Facts the stories rely on:
- Every write is appended to `doc.operations` as `{ operationId, type, actorId, replicaId, timestamp, fingerprint, payload, taskId?, recordIds, changes, result }`. `timestamp` comes from the clock of the replica that ran the operation (`lib/workspace.js`).
- **Activity** view ("Workspace activity") renders every operation, newest first (sorted by `timestamp` only), as `<strong>{displayName || handle} · {kind}</strong> · {type}`, a task-title button when `event.taskId` is set, and `toLocaleString()` time. There is no filter, search or pagination, and the nav filters (**Assigned to**, **Status filter**, **Vein**) stay visible but do not affect it. `replicaId` is never shown.
- Per-task **History** is oldest first, excludes `read.mark`, and prints `{field}: {JSON old} → {JSON new}` for each change. Assignee values are raw Actor IDs in quotes (e.g. `"bob"`), not labels. `comment.*`, `task.link-commit`, `task.link-vein` and `task.unlink-vein` events have no change lines.
- **Evidence** lists `task.link-commit` payloads as `<code>{hash}</code>` + message, or "No commit evidence linked yet."
- CLI: `pardner activity [--task id] [--actor Actor] [--limit 20]` (alias `timeline`) returns `{ activity: [...] }` newest first with an `operationId` tiebreak; `--actor` is the same flag (and `PARDNER_ACTOR` fallback) used to author mutations. `pardner diff <task>` flattens history changes with `actorId` and `operationId`. `pardner trace list|show|task` reads `.agent-trace/` in the current Git repo (or Pardner evidence for `task`).

</details>

#### STORY-128: Jump from the newest activity entry to the task it touched
*(was activity-history-audit/STORY-001)*

**Type**: short
**Topic**: Activity and history audit
**Persona**: Priya Raman, engineering lead (human Actor `priya`), checking what happened overnight before stand-up
**Goal**: See the most recent change in the workspace and open the affected task.
**Preconditions**: Browser connected to the hub at `http://127.0.0.1:8004/pardner/`; Actor `priya` chosen in the header **Actor** select; agent `builder` commented on task "Add latency instrumentation" overnight.
**Ideal path**: 2 steps — open the activity feed, click the entry's task.
**Alternate paths**: CLI `pardner activity --limit 1` then `pardner show <taskId>`; or the board card "Add latency instrumentation" in the **In progress** column (requires knowing which task changed).
**Walkability**: `browser`
**Related**: STORY-009, STORY-042, STORY-044, STORY-119, STORY-120, STORY-129, STORY-131, STORY-132, STORY-134
##### Steps
1. Click **Activity** in the `Workspace views` nav → button gets `aria-pressed="true"`; heading "Workspace activity"; top entry reads "builder · agent · comment.add", a button "Add latency instrumentation", and a local time such as "11/7/2026, 6:42:10 AM".
2. Click the "Add latency instrumentation" button → right side panel `aria-label="Task details"` opens over the activity list, briefly "Opening task…", then the title, "builder · agent · In progress · P1", and Comments (N) with builder's new comment at the bottom.
3. Priya presses Escape → panel closes; she is still on "Workspace activity" (view was never changed).
##### Variations
- Priya has not chosen an Actor: the jump still works (read-only); "N unread for {handle}" text is absent because the context is fetched without `?actor=`.
- Entry is `task.handoff`: one entry only, even though the handoff changed assignee, status and added a comment.
##### Edge Cases
- The activity entry's button text falls back to the raw task ID (e.g. `task-3f9c0a1b2d4e5f6a7b8c9d0e`) if `doc.tasks[event.taskId]` is missing.
- The entry does not say *what* was commented; Priya must open the task to find out. Activity shows only the operation type string (`comment.add`), not human wording like "commented on".

---

#### STORY-129: Find out who moved a task to Review and from what
*(was activity-history-audit/STORY-002)*

**Type**: short
**Topic**: Activity and history audit
**Persona**: Marco Silva, QA engineer (human Actor `marco`), surprised a task he never saw finished is in **Review**
**Goal**: Identify which Actor changed the status and what the previous value was.
**Preconditions**: Task "Fix flaky checkout test" exists; agent `builder` handed it off to `reviewer` with status Review via `pardner handoff`.
**Ideal path**: 2 steps — open task, read the attributed status change.
**Alternate paths**: `pardner diff <taskId>` (flat list `{ field, old, new, actorId, operationId }`); `pardner activity --task <taskId>`.
**Walkability**: `browser`
**Related**: STORY-042, STORY-119, STORY-120, STORY-128, STORY-131, STORY-134
##### Steps
1. On **Tasks**, click the "Fix flaky checkout test" card in the **Review** column → Task details opens.
2. Scroll past **Hand off work**, **Comments (N)** and **Evidence** to **History** → entries oldest first; the first is "priya · human · task.create" with lines like `title: null → "Fix flaky checkout test"`, `status: null → "backlog"`, `order: null → 1793972400000`, `type: null → "task"`.
3. Marco reads further down → "builder · agent · task.handoff" with `assignee: "builder" → "reviewer"` and `status: "in-progress" → "review"`.
##### Variations
- If the move was a plain **Edit task** in the UI, the type is `task.update` and only the changed fields are listed.
##### Edge Cases
- Assignee lines use Actor IDs (`"reviewer"`), not the "reviewer · agent" label used everywhere else; with IDs differing from handles (e.g. `act-7`) this becomes hard to read.
- History is at the very bottom of a long panel; on a phone (≤760px) Marco has to scroll past every comment first. There is no anchor or collapse.
- Status values appear as raw keys (`"in-progress"`) while the header shows "In progress".

---

#### STORY-130: Confirm a task has commit evidence before approving
*(was activity-history-audit/STORY-003)*

**Type**: short
**Topic**: Activity and history audit
**Persona**: Dana Whitfield, reviewer (human Actor `dana`)
**Goal**: Check which commit backs a task in Review.
**Preconditions**: `builder` ran `pardner link-commit TASK --commit '{"hash":"abc1234","message":"feat: instrument"}' --actor builder`.
**Ideal path**: 2 steps — open task, read Evidence.
**Alternate paths**: `pardner trace task <taskId>` → `{ taskId, evidence: [...] }`; `pardner show <taskId>` (`evidence` array).
**Walkability**: `browser`
**Related**: STORY-028, STORY-122, STORY-123, STORY-127
##### Steps
1. Click the task card → Task details.
2. Look at **Evidence** → `abc1234` in code style and "feat: instrument" beneath it.
3. Dana scrolls to **History** to see who linked it → "builder · agent · task.link-commit" with no change lines.
##### Variations
- No commit linked: **Evidence** shows "No commit evidence linked yet."
- Two `link-commit` calls with the same hash produce two identical evidence rows (keys are `hash:index`).
##### Edge Cases
- Evidence does not show who linked it or when; Dana must cross-reference History.
- The hash is not a link; `/automerge/github-remote` and `/automerge/trace/:commitHash` exist on the server but the UI does not use them, so she copies `abc1234` into GitHub by hand.

---

#### STORY-131: Audit everything an agent did on one task via the CLI
*(was activity-history-audit/STORY-005)*

**Type**: medium
**Topic**: Activity and history audit
**Persona**: Priya Raman, auditing agent `builder` after a regression
**Goal**: List every change `builder` made to "Add latency instrumentation", with old/new values.
**Preconditions**: Task ID known from `pardner tasks --assignee builder`; Priya's shell has no `PARDNER_ACTOR`.
**Ideal path**: 2 steps — filter by task and Actor, read changes.
**Alternate paths**: UI Task details **History** (no Actor filter; read by eye); `pardner show <task>` (`history` array).
**Walkability**: `browser+cli`
**Related**: STORY-042, STORY-119, STORY-120, STORY-128, STORY-129, STORY-134
##### Steps
1. `pardner tasks --assignee builder` → finds `"title": "Add latency instrumentation"`, `"id": "task-…"`.
2. `pardner activity --task task-… --actor builder --limit 100` → newest-first list of `comment.add`, `task.link-commit`, `task.update`, `task.handoff` events with `changes`.
3. `pardner diff task-…` → `{ taskId, changes: [{ field, old, new, actorId, operationId }], conflicts }` across all Actors, oldest first.
4. Priya filters mentally for `"actorId": "builder"` in the diff output (diff has no `--actor` flag).
5. Opens the same task in the browser → **History** matches the diff, oldest first, but shows "builder · agent" rather than `builder`.
6. She wants the `read.mark` events too → they appear in `pardner activity --task` but are filtered out of **History** and `diff`.
##### Variations
- Mistyped task ID: `pardner activity --task task-wrong` returns `{ "activity": [] }` with no error, unlike `pardner show task-wrong` which returns `NOT_FOUND`.
##### Edge Cases
- `activity --task` matches only `event.taskId`; a `task.branch` that created branch task B has `taskId` = parent, so `activity --task B` misses B's creation while B's **History** (via `recordIds`) includes it.
- Activity order is newest first and History/diff oldest first; comparing them side by side requires reversing one.

---

#### STORY-132: Workspace activity entries for goals and veins have no destination
*(was activity-history-audit/STORY-007)*

**Type**: short
**Topic**: Activity and history audit
**Persona**: Priya Raman
**Goal**: Find out who created the vein "Edge caching" and when its status changed.
**Preconditions**: `alice` ran `vein create --title 'Edge caching' --goal 'p95 under 200ms'`; later `vein update … --status proven`.
**Ideal path**: 2 steps — click the activity entry, read the vein's history.
**Alternate paths**: `pardner vein show <vein>` (`history` array with `changes`); `pardner goal show <goal>`; Goals view (current state only).
**Walkability**: `browser+cli`
**Related**: STORY-009, STORY-044, STORY-128
##### Steps
1. Open **Activity** → entries "alice · human · vein.create" and "alice · human · vein.update" with timestamps but no button (no `taskId`).
2. Priya clicks **Goals** → "p95 under 200ms" with "Edge caching" and a "Proven" status pill; no history is shown here.
3. She falls back to `pardner veins` to find the vein ID, then `pardner vein show vein-…` → `history` with `status: "open" → "proven"` by `alice`.
##### Variations
- `pardner vein add VEIN TASK` produces `task.link-vein` with a task button in Activity, and a History line "· task.link-vein" without change lines on the task.
##### Edge Cases
- `actor.register` and `goal.create` entries are also unlinked; nothing in Activity says which vein/goal was touched.
- Clicking the vein button in Goals switches to **Tasks** filtered by that vein, not to its history.

---

#### STORY-133: Activity link opened while the New task panel is still open
*(was activity-history-audit/STORY-008)*

**Type**: short
**Topic**: Activity and history audit
**Persona**: Marco Silva, half-way through drafting a task
**Goal**: Glance at a related task from Activity without losing his draft.
**Preconditions**: Actor `marco` chosen; **New task** panel open with Title "Retry checkout webhook" typed.
**Ideal path**: 2 steps — open related task, return to draft.
**Alternate paths**: Close New task first, use the board card (card click sets `creating` false and discards the draft).
**Walkability**: `browser`
**Related**: STORY-004, STORY-013, STORY-014, STORY-023, STORY-112
##### Steps
1. With the New task panel open, Marco clicks **Activity** → the activity list renders behind the open "New task" panel.
2. He clicks the "Fix flaky checkout test" button on an entry → Task details renders as a second side panel; `setSelected` runs but the New task form stays mounted (Activity does not call `setCreating(false)`, unlike board cards).
3. Marco presses Escape → Task details closes; his "Retry checkout webhook" draft is still there.
##### Variations
- From a board card instead, the New task panel closes and the draft is lost.
##### Edge Cases
- Two `side-panel` asides overlap; which one is visible depends on CSS stacking, so Marco may think the click did nothing. Inconsistent behaviour between the two jump routes.

---

#### STORY-134: Long-running workspace: scanning hundreds of activity entries
*(was activity-history-audit/STORY-009)*

**Type**: medium
**Topic**: Activity and history audit
**Persona**: Priya Raman, three months into using Pardner with four agents; ~3,000 operations
**Goal**: Find when `reviewer` last approved something.
**Preconditions**: Large workspace; many `read.mark` and `comment.add` entries from agents.
**Ideal path**: 2 steps — filter the feed by Actor and type, open the result.
**Alternate paths**: `pardner activity --actor reviewer --limit 200` then scan for `task.handoff`/`task.update` with status `completed`.
**Walkability**: `browser+cli`
**Related**: STORY-042, STORY-119, STORY-120, STORY-128, STORY-129, STORY-131
##### Steps
1. Click **Activity** → the browser renders every operation in one list; noticeable delay on a laptop and a very long scroll on a phone.
2. Priya picks **Assigned to** = "reviewer · agent" in the nav expecting the feed to filter → nothing changes (filters only affect **Tasks**).
3. She sets **Status filter** = "Completed" → still nothing changes.
4. She uses the browser's Find (Cmd+F) for "reviewer · agent" → hundreds of matches, many "· read.mark" and "· comment.add".
5. She gives up and runs `pardner activity --actor reviewer --limit 200` → filters, then searches the JSON for `"field": "status"` with `"new": "completed"`.
6. She opens the task from the board and confirms in **History**.
##### Variations
- Same scan on a 390×844 phone (companion device): filters stack full-width above the feed, consuming the first screen.
##### Edge Cases
- `read.mark` entries appear in Activity but are hidden in History, so Activity is noisier than any per-task view.
- No count, "load more" or date grouping; timestamps are full `toLocaleString()` values in the viewer's locale.
- The UI sort uses `timestamp` only; operations with identical timestamps can appear in arbitrary order, whereas the CLI breaks ties by `operationId`.

---

#### STORY-135: Which machine made this change? Attribution across hub and replica
*(was activity-history-audit/STORY-010)*

**Type**: medium
**Topic**: Activity and history audit
**Persona**: Owen Brandt, runs the hub on a desktop and a replica on his laptop (`--role replica --http-port 8014 --ws-port 8015`)
**Goal**: Determine whether a `task.update` came from the laptop replica while offline.
**Preconditions**: Laptop replica edited "Add latency instrumentation" priority p1→p0 while the hub was down, then reconnected; both browsers show "Saved locally · synced".
**Ideal path**: 2 steps — open the entry, read its replica attribution.
**Alternate paths**: CLI `pardner activity --task <task>` on either machine (`replicaId` field) plus `pardner status` on the laptop (`replicaId`).
**Walkability**: `multi-service`
**Related**: STORY-072, STORY-073, STORY-074, STORY-075, STORY-078, STORY-081, STORY-083
##### Steps
1. On the hub browser, **Activity** → "owen · human · task.update" with a time from the laptop's clock; no indication of which replica.
2. Click the task → **History** shows `priority: "p1" → "p0"` attributed to "owen · human" — same Actor on both machines.
3. Owen runs on the hub `pardner --data .pardner-walk activity --task task-… --limit 5` → entry includes `"replicaId": "replica-…"`.
4. He runs `pardner --data .pardner-replica status` on the laptop → `replicaId` matches.
5. He runs `pardner --data .pardner-walk status` on the hub → different `replicaId`, confirming origin.
##### Variations
- On the laptop browser before the hub ack, the save status reads "Saved locally · waiting for hub"; the activity entry is already present locally.
##### Edge Cases
- Replica timestamps come from the laptop clock; if it is 10 minutes slow, the offline edit sorts below later hub edits in Activity even though it happened earlier in wall time.
- There is no human-friendly replica name; Owen must compare `replica-<uuid>` strings.

---

#### STORY-136: Auditing a deleted comment
*(was activity-history-audit/STORY-011)*

**Type**: medium
**Topic**: Activity and history audit
**Persona**: Marco Silva and agent `builder`
**Goal**: Learn what a removed comment said and who removed it.
**Preconditions**: `builder` added a comment "@reviewer ignore the test failures, they're flaky" then deleted it with `pardner comment-delete <comment> --revisions '["…"]' --actor builder`.
**Ideal path**: 2 steps — open task history, see deletion with the original text.
**Alternate paths**: `pardner activity --task <task>` (payload of the original `comment.add`).
**Walkability**: `browser+cli`
**Related**: STORY-031, STORY-037, STORY-038, STORY-067
##### Steps
1. Marco opens the task → **Comments (N)** no longer lists it; nothing shows a comment was removed.
2. He scrolls to **History** → "builder · agent · comment.add" followed later by "builder · agent · comment.delete"; neither has change lines or text.
3. In **Activity**, the same two entries appear with the task button.
4. Marco runs `pardner activity --task task-… --limit 50` → the `comment.add` entry still has `"payload": { "taskId": "…", "text": "@reviewer ignore the test failures, they're flaky" }`; the `comment.delete` entry has `"payload": { "commentId": "comment-…", "expectedRevisions": [...] }`.
5. He runs `pardner mentions pending --actor reviewer` → the mention is gone (inactive once the comment is deleted).
##### Variations
- `comment-edit` instead of delete: History shows `comment.edit` with no diff; old text is only visible in the earlier operation's payload via CLI.
##### Edge Cases
- Deletion is "soft" for audit purposes: text persists in the operation log, which matters if someone deleted a secret pasted into a comment — no UI hint that it remains.
- History gives no way to correlate `comment.delete` with the comment it removed.

---

#### STORY-137: Reconstructing a conflicting edit and its resolution
*(was activity-history-audit/STORY-012)*

**Type**: long
**Topic**: Activity and history audit
**Persona**: Owen Brandt (hub desktop and laptop replica) and Priya Raman (hub browser)
**Goal**: After a conflict, establish who set each competing value, who resolved it, and confirm nothing was silently discarded.
**Preconditions**: Hub 8004/8005 and replica 8014/8015 running with seeded Actors; task "Add latency instrumentation" status `in-progress`.
**Ideal path**: 5 steps — see badge, read both alternatives, resolve, read History, confirm via CLI.
**Alternate paths**: `pardner show <task>` (`conflicts`, `revisions`); `pardner diff <task>`; `pardner resolve <task> --field status --value review --revisions '[...]'`.
**Walkability**: `multi-service`
**Related**: STORY-065, STORY-070, STORY-071, STORY-083
##### Steps
1. Owen stops the hub. On the laptop browser (`http://127.0.0.1:8014/pardner/`) as `owen`, he opens the task, **Edit task**, sets **Status** to "Review", **Save changes** → "Saved locally · waiting for hub".
2. Owen stops the laptop replica, then restarts the hub (same `--data`). Priya's hub browser shows "Live updates disconnected…" until it reconnects; she clicks **Retry connection** rather than waiting for the backoff.
3. Priya on the hub browser opens the same task, **Edit task**, **Status** "Dead end", **Save changes** → "Saved locally · synced".
4. Owen restarts the replica; it syncs. On the board the card shows **Conflicting edits**.
5. Priya opens the task → "Resolve status" with "Both edits are preserved. Choose the value to keep." and two alternatives: "owen · human" `review`, "priya · human" `dead-end`, each with **Keep this status**.
6. Before choosing, Priya scrolls to **History** → two `task.update` entries: "owen · human · task.update" `status: "in-progress" → "review"` and "priya · human · task.update" `status: "in-progress" → "dead-end"`, ordered by their timestamps.
7. She opens **Activity** → both updates appear; neither is marked as conflicting.
8. Priya comments "Owen confirmed review is correct" and clicks **Add comment**.
9. She clicks **Keep this status** under Owen's alternative → badge disappears; header "… · Review · P1".
10. **History** gains "priya · human · task.resolve" with `status: … → "review"`.
11. Owen runs `pardner diff task-…` → three status changes with `actorId` and `operationId`, and `conflicts: {}`.
12. Owen runs `pardner activity --task task-… --limit 10` → entries include `replicaId`; the `owen` update carries the laptop's replica ID.
13. Owen checks `pardner show task-…` → `revisions.status` now a single revision (the resolve operation).
##### Variations
- Resolve via CLI: `pardner resolve task-… --field status --value review --revisions '["<opA>","<opB>"]' --actor priya` → identical History entry type `task.resolve`.
- The conflict is in a comment (concurrent `comment-edit`): **Keep this comment** resolves it; History shows `comment.resolve` without text.
##### Edge Cases
- The `task.resolve` line's `old` value is whatever the current winner was at resolve time, not both alternatives; the losing value is recoverable only from the earlier `task.update` line.
- If the laptop clock is skewed, History may show Owen's update after Priya's, misleading anyone reading "last write".
- Neither Activity nor History shows that the two updates were concurrent; that knowledge exists only while the conflict badge is present.
- Pressing **Keep this status** while another write is pending → "Resolve the saved request before starting another change."

---

#### STORY-138: End-to-end weekly audit of a human ↔ agent handoff
*(was activity-history-audit/STORY-013)*

**Type**: long
**Topic**: Activity and history audit
**Persona**: Priya Raman (human lead), agents `builder` and `reviewer`, plus Marco on a companion phone
**Goal**: Reconstruct the full lifecycle of one task — creation, handoffs, comments, evidence, read receipts — across UI and CLI, and verify every step is attributed.
**Preconditions**: Seeded workspace per discovery; LAN access enabled; Marco paired on a 390×844 phone.
**Ideal path**: 6 steps — open task, read History, read Evidence, read Comments, cross-check CLI activity, cross-check trace.
**Alternate paths**: Entirely CLI (`show`, `diff`, `activity --task`, `trace task`); entirely UI (no read receipts or replica IDs).
**Walkability**: `multi-service`
**Related**: STORY-005, STORY-011, STORY-032, STORY-116, STORY-121
##### Steps
1. Priya creates the task in the UI: **New task** → Title "Cache warmup job", **Priority** p1, **Assignee** "builder · agent", **Tags, separated by commas** "perf, cache" → **Create task** → Task details opens.
2. She scrolls to **History** → "priya · human · task.create" with lines like `tags: null → ["perf","cache"]`, `assignee: null → "builder"`, `order: null → 17…`.
3. `builder` runs `pardner mentions claim-next --request-id r1 --actor builder` (nothing yet — creation does not mention) then `pardner tasks --assignee builder` → sees the task.
4. `builder` runs `pardner update task-… --status in-progress --revisions '{"status":["<op>"]}' --actor builder` → Priya's open panel refreshes; **History** adds `status: "backlog" → "in-progress"`.
5. `builder` commits with `pardner commit --actor builder --task task-… -- -m "feat: warm cache on boot"` → **Evidence** shows the hash and message.
6. `builder` runs `pardner handoff task-… --to reviewer --status review --message "@reviewer ready, see evidence" --revisions '{...}' --actor builder` → **History** "builder · agent · task.handoff" with `assignee: "builder" → "reviewer"`, `status: "in-progress" → "review"`; **Comments (N)** gains the message.
7. `reviewer` comments via CLI `pardner comment task-… 'LGTM, @priya please close' --actor reviewer`.
8. Marco on the phone opens **Activity** → the latest entries "reviewer · agent · comment.add", "builder · agent · task.handoff", "builder · agent · task.link-commit"; he taps the task button → full-width Task details.
9. Marco (Actor `marco`) clicks **Mark displayed comments read** → "0 unread for marco". Activity now shows "marco · human · read.mark"; the task's **History** does not.
10. Priya, as `priya`, sees "N unread for priya" still >0 (receipts are per Actor). She clicks **Hand off work**: **Recipient** "priya · human", **Handoff status** "Completed", **Handoff message** "Closing after review" → **Hand off**.
11. **History** shows "priya · human · task.handoff" with `assignee: "reviewer" → "priya"`, `status: "review" → "completed"`.
12. Priya runs `pardner activity --task task-… --limit 50` → 8+ entries newest first, including Marco's `read.mark` and every `replicaId`.
13. She runs `pardner diff task-…` → oldest-first field changes matching **History**.
14. She runs `pardner trace task task-…` → evidence with `diff` stats; from the repo, `pardner trace show <hash>` → `agent.name: "builder"`.
15. She switches header **Actor** to `builder` to check what the agent sees → Task details remounts (keyed by task and Actor), "N unread for builder".
16. Priya compares the Activity feed timestamps against the trace `timestamp`; they differ by seconds (trace written before the `link-commit` operation).
##### Variations
- **Multi-surface:** the same operation renders as an Activity row ("Actor · type"), a History block with change lines, a Comments entry (for handoff/comment), an Evidence row (link-commit) and a raw JSON event in `pardner activity`; only the CLI shows `replicaId`, `payload` and `read.mark` per task.
- Priya uses `pardner timeline` instead of `activity` → same output.
##### Edge Cases
- Handoff is a single `task.handoff` operation; the comment it creates has no separate `comment.add` in Activity, so counting comment events undercounts comments.
- `mentions` delivery state (claim/ack/release) is in the hub SQLite ledger and never appears in Activity or History; Priya cannot see in the UI whether `reviewer` acknowledged.
- If Priya had no Actor selected at step 10, the write controls are disabled (`canWrite` requires an Actor) with no inline explanation next to **Hand off**.
- On the phone, the History section is reached only after scrolling through **Hand off work**, all comments and **Evidence**.

---

## Redundancy Candidates

Primary input for /ux-flow. Built from every story's **Alternate paths** field, its **Multi-surface:** notes, and the topic background facts. Each item names the screens and labels involved and the stories where a walker can see it. Ranked roughly by how often users meet it.

### Duplicate paths (same goal, multiple routes)

1. **Changing a task's status: four UI routes and two CLI routes.** Task details → **Edit task** → **Status** → **Save changes**; Task details → **Hand off work** → **Handoff status** (needs a **Recipient** and a **Handoff message**, and adds a comment and a delivery); **Keep this status** when the field is in conflict; CLI `update --status --revisions`, `handoff --status`, `resolve --field status`. People close tasks by "handing off to themselves" with Completed. The nav **Status filter** repeats the same seven labels. Stories: STORY-018, STORY-027, STORY-030, STORY-104, STORY-021, STORY-040.
2. **Reassigning: Edit task vs Hand off work vs Edit + @mention.** **Edit task** → **Assignee** changes the owner with no delivery and no comment. **Hand off work** changes assignee and status and adds a mentioning comment in one atomic step. **Edit task** plus **Add comment** with `@handle` is the same result in two non-atomic steps. Creating a task with an **Assignee** creates no delivery at all. Stories: STORY-023, STORY-027, STORY-033, STORY-034, STORY-040.
3. **Filtering to a vein: Goals vein button vs nav Vein select vs CLI.** Clicking a vein button in **Goals** calls `showBoard({vein})`, which resets **Assigned to** and **Status filter**. Picking the same vein in the nav **Vein** select keeps the other filters. So the two routes give different boards. CLI `tasks --vein` is a third route. Stories: STORY-046, STORY-047, STORY-015.
4. **Connecting a browser: token form, pairing code field, QR `#pair=` link, copied link.** **Connect with a local service token** → **Connect**; **Pairing code** → **Pair this device**; scanning the QR (auto-pair from `#pair=CODE`); pasting the **Copy address** link. All four yield the same single shared secret. On loopback the primary-styled **Pair this device** cannot work until LAN is enabled. Stories: STORY-001, STORY-010, STORY-085, STORY-087, STORY-088.
5. **Forget this workspace in two places, plus browser Clear site data.** The opening screen ("Opening your local workspace…") and the header workspace actions both have **Forget this workspace**. Browser site-data clearing is a third route that wipes every workspace for the origin. The opening-screen button is the one suspected to throw (see Suspected Defects). Stories: STORY-012, STORY-096, STORY-098, STORY-102.
6. **Getting a fresh pairing code: three triggers that silently invalidate each other.** Opening **Pair another device** mints a code automatically; **Generate pairing code** / **Generate new code** and **Try again** mint another; opening the dialog on a paired phone mints another and invalidates the QR still shown on the laptop. Stories: STORY-089, STORY-091, STORY-094.
7. **Retrying an uncertain write: Retry saved request vs CLI same `--operation-id` vs reload.** **Retry saved request** resends the stored operation ID. The CLI needs `--operation-id` chosen up front, because transport errors return `details: null`. A reload brings back "A request is awaiting confirmation." without the original error. Closing the tab drops it. Stories: STORY-077, STORY-117, STORY-101.
8. **Reading history: five tools.** **Activity** view (all operations, newest first, includes `read.mark`, no filter), Task details **History** (oldest first, excludes `read.mark`, raw values), CLI `activity`/`timeline`, `diff` (flat field changes), `show` → `history`. Stories: STORY-128, STORY-129, STORY-131, STORY-119, STORY-120, STORY-042.
9. **Resolving a conflict: Keep this {field} vs CLI resolve vs raw operation.** The UI offers only the existing alternatives. CLI `resolve --value` accepts a value that is neither alternative. Goal and vein conflicts have no UI route. Stories: STORY-059, STORY-061, STORY-065, STORY-068, STORY-069.
10. **Recovering a stale draft: Cancel edit + Edit task vs close/reopen vs reload.** Retrying **Save changes** never works because the draft keeps its old revisions. All three recovery routes throw the draft away. Stories: STORY-062, STORY-063.
11. **Removing access: Forget vs Disable device access vs token rotation.** **Forget this workspace** clears one browser and revokes nothing. **Network settings** → **Disable device access** applies only after a restart. A restart with a new `PARDNER_API_TOKEN` cuts off every browser, CLI shell and replica. No route revokes a single device. Stories: STORY-096, STORY-099, STORY-100, STORY-105.
12. **Closing panels: Close vs Escape.** **Close** and Escape both close Task details (and the native dialog). Escape also throws away drafts. Stories: STORY-017, STORY-019, STORY-084.
13. **Starting the service and registering Actors.** `pardner serve` vs `npm run sync` vs `node automerge-sync-server.js`; `actors register` vs `agents register` vs `operation --request`. Plus CLI aliases `timeline`=`activity`, `--agent`=`--actor`, and `mentions deliver`=`mentions ack` (undocumented). Stories: STORY-001, STORY-002, STORY-124, STORY-025.
14. **Linking commit evidence: `commit --task` vs `link-commit` vs raw `task.link-commit`.** Only `commit` writes a trace with model and session. Stories: STORY-122, STORY-123, STORY-028.

### Duplicate information (same fact, multiple surfaces)

1. **SaveStatus rendered twice.** When a task is open, the header live region and the **Task details** panel both show the same text ("Saved locally · synced" etc.) as two `role="status"` live regions with identical text. Stories: STORY-076, STORY-013, STORY-023.
2. **Startup text repeated.** The "Pardner" `h1` appears on the static shell, config loader, connection screen and workspace header. "Opening your workspace…" shows in the static shell and again in the React config loader, so a slow load shows the same text twice with no visible progress. Stories: STORY-001, STORY-108.
3. **The Actor roster in four selects with three empty labels.** Header **Actor** ("Choose an Actor"), nav **Assigned to** ("All Actors"), New task **Assignee** ("Unassigned") and handoff **Recipient** all show `displayName · kind`. The unread line uses the handle ("2 unread for marcus"). History shows raw IDs (`"bob"`). The CLI shows IDs. Two Actors with the same display name and kind can't be told apart in the UI. Stories: STORY-002, STORY-003, STORY-008, STORY-115.
4. **Assignee, status and priority in four renderings.** Card (column, "P1", "builder · agent"), details meta line ("builder · agent · Up next · P1"), **Edit task** form (lowercase `p1`) and **History** (raw `"up-next"`, `"builder"`). Stories: STORY-013, STORY-023, STORY-129.
5. **Two comment counts.** "Comments (N)" counts all comments. "N unread for {handle}" is per Actor and includes the reader's own comments, so the two disagree in confusing ways. Stories: STORY-034, STORY-035, STORY-036.
6. **Commit evidence in six places.** **Evidence**, History `task.link-commit`, **Activity**, `show.evidence`, `trace task` and the `.agent-trace/` file. Only the file has model and session. Stories: STORY-122, STORY-130, STORY-028.
7. **One handoff shown five ways.** A comment in **Comments**, field changes in **History**, a card move on the board, an **Activity** row ("alice · human · task.handoff"), and CLI `show`/`activity`/`mentions pending`. None of them is a "waiting for me" inbox for humans. Stories: STORY-027, STORY-032, STORY-040, STORY-138.
8. **Vein membership in three read-only places.** Card `vein-label`, the details line "Veins: Edge caching (Open)", and "N tasks" in **Goals**. None can be edited in the UI. Stories: STORY-048, STORY-046, STORY-051.
9. **One `status` object, four readers.** `pardner status`, the `status` embedded in `tasks`/`show`, every mutation receipt, and the UI SaveStatus. The UI never shows `hubConnected`, `syncError` or `lastSyncedAt`. Stories: STORY-072, STORY-081.
10. **The pairing secret shown twice in the dialog.** **Device address** and **Copy address** already contain the full `#pair=CODE` link, and the 8-digit code is shown separately. "Use once before HH:MM" sits outside the collapsed **Connect manually** details. Stories: STORY-087, STORY-088.
11. **"Settings saved. Restart…" reused.** The same notice shows after a real save and when the interface address went stale (nothing saved). Stories: STORY-093, STORY-099, STORY-084.
12. **"Pair another device" advice where the button doesn't exist.** The startup shell, config-failure text, connection helper and both connection-error texts tell users to open **Pair another device**, but that button exists only inside a connected workspace. Stories: STORY-001, STORY-108, STORY-089.
13. **Nav filters visible where they do nothing.** **Assigned to**, **Status filter** and **Vein** stay on the **Goals** and **Activity** views, but only the board reads them. Stories: STORY-009, STORY-128.
14. **Two wordings for one origin rejection.** HTTP: "Origin not allowed. Open the current address shown in Pair another device." WS: "…Open the current device address." (the UI shows the generic "Live updates disconnected…" instead). Story: STORY-111.

### Overlapping features/tools

1. **Hand off work vs Edit task + Add comment.** Same outcome, but one is atomic with a delivery and the other is two operations and creates a delivery only if the comment @mentions someone. Consider making one the obvious route. Stories: STORY-027, STORY-040, STORY-033.
2. **Three notions of "waiting for me": assignment, mention delivery, read receipt.** Delivery state lives only in the hub ledger and CLI (`mentions pending|claim-next|ack`). Read receipts are per Actor and revision (**Mark displayed comments read**, `read --receipts`). Assignment is on the card. An `ack` doesn't mark anything read. No UI shows deliveries. Stories: STORY-025, STORY-039, STORY-035, STORY-032.
3. **Activity view vs History vs CLI `activity`/`diff`.** They overlap heavily but differ in order, filtering and whether `read.mark` is included. The Activity view has no filter or pagination, and goal/vein rows have no destination. Stories: STORY-120, STORY-132, STORY-134, STORY-120.
4. **`--actor` / `PARDNER_ACTOR` is both the author and a read filter.** It filters `activity`, `mentions pending` and the `show` unread count, so an exported variable quietly narrows audit reads. Stories: STORY-120, STORY-127.
5. **Forget / Disable device access / token rotation.** Three access tools, none per device. See Duplicate paths #11. Stories: STORY-099, STORY-100, STORY-092.
6. **Revision argument shapes.** `update`/`handoff`/`goal update`/`vein update`/`merge` take `{field:[rev]}`, while `resolve`/`vein remove`/`comment-edit`/`comment-delete` take a bare array. There's no "take latest" flag. Stories: STORY-118, STORY-051, STORY-052.
7. **Goal status vs vein verdict vs "Ready for a verdict".** Proving a vein doesn't close the goal. "Ready for a verdict" also fires for Dead end/Abandoned tasks, and a hidden status conflict blocks it. Stories: STORY-049, STORY-050, STORY-054.
8. **Branches are indistinguishable from tasks.** `branch` creates ordinary cards with the parent's title, and merged branches sit in **Completed**. Story: STORY-121.
9. **`--json` flag.** Listed for `tasks`/`show` but has an effect only on `help`; every command already prints JSON. Story: STORY-072.
10. **Pairing code vs token.** Both hand out the same shared `apiToken`. The pairing UI suggests per-device credentials that don't exist. Stories: STORY-085, STORY-100.

## Suspected Defects (unverified)

Topic agents flagged these from reading the code; nothing here has been reproduced. Walkers should confirm or reject each one and update this list. Severity is a rough guess: **H** loses work or blocks a task, **M** misleads or forces a workaround, **L** cosmetic or copy.

| # | Sev | Suspected defect | Where (per topic agents) | Stories |
|---|---|---|---|---|
| D1 | M | **Forget this workspace** on the opening screen ("Opening your local workspace…") calls `forget()` → `showBoard({})`, but `showBoard` is a `const` declared after the early `return` that renders the opening screen. The click should throw a ReferenceError ("Cannot access … before initialization") and show it in `ErrorNotice`, *after* `client.forget()` has already cleared storage. A following **Retry connection** then shows the misleading "The service credential changed…". Tests click only the header button. | `ui-prototype/src/Pardner.jsx:324-337` (`forget`), opening screen `:351-379`, `showBoard` declared at `:389`; tests `test/pardner-connection-ui.test.js:70`, `test/pardner-phone.test.js:128` | STORY-098, STORY-012, STORY-096 |
| D2 | H | After `STALE_UPDATE`, the preserved **Edit task** draft keeps the revisions captured when **Edit task** was clicked, so every later **Save changes** fails again with `STALE_UPDATE`. The only way out is **Cancel edit** (which discards the draft) → **Edit task**. There is no rebase or "use latest" action, unlike the handoff form. | `TaskDetail` draft `expectedRevisions` (`Pardner.jsx:735-1073`) | STORY-062 (incl. merged daily-board-work/STORY-009) |
| D3 | M | The `STALE_UPDATE` / operation error renders in the workspace-level `ErrorNotice` under the header, behind the fixed Task details panel. On narrow windows and phones the panel covers it, so the user sees nothing happen. | `ErrorNotice` placement (`Pardner.jsx:52`, header notices `:415-429`) | STORY-062, STORY-061 |
| D4 | M | The author's own comments count as unread for the author ("1 unread for alice" right after Alice posts). Editing or resolving a comment creates a new revision, so it becomes unread again for everyone, including the editor. | `lib/workspace-schema.js` `taskContext` `unreadCount` | STORY-034, STORY-036, STORY-041, STORY-011, STORY-037 |
| D5 | M | Tags are never displayed: not on the card and not in the Task details header. They show up only in the **Edit task** form and as JSON in **History** and the conflict section (`["perf","edge"]`). | board card + `TaskDetail` header (`Pardner.jsx:478-527`, `:735+`) | STORY-013, STORY-066 |
| D6 | H | Escape closes Task details (`Pardner.jsx:784-790`) and silently discards any **Edit task** draft, half-typed **Comment** or **Handoff message**, with no confirmation. Switching the header **Actor** does the same, because `TaskDetail` is keyed `${selected}:${actor}` and remounts. | `Pardner.jsx:784-790`; `TaskDetail` key | STORY-019, STORY-027, STORY-008 |
| D7 | M | The **New task** draft is local `TaskForm` state. **Close**, clicking any board card or clicking an **Activity** task link discards it with no confirmation. The Activity and card jump routes behave differently. | `TaskForm` (`Pardner.jsx:625-734`), `setCreating(false)` | STORY-014, STORY-133, STORY-004 |
| D8 | H | **Forget this workspace** stays enabled while a write is pending and silently discards the pending (unconfirmed) operation along with the credential. Pending writes also live in per-tab `sessionStorage`, so closing the tab drops them without warning. | `Pardner.jsx:324-337`, `connection.js forget()`, `pardner:<ws>:pending` | STORY-097, STORY-077, STORY-101 |
| D9 | M | An unknown `@handle` (typo such as `@buildr`) is silently dropped. The comment saves, no delivery is created, and nothing warns the author. | `lib/workspace-commands.js` `mentionedActors` | STORY-034 |
| D10 | L | `mentions ack` after a deliberate `mentions release` returns `STALE_CLAIM` "The delivery claim has expired" — wrong wording for a released lease. | `lib/delivery-ledger.js` | STORY-026 |
| D11 | M | When the UI was never built (`ui-prototype/dist` missing), `/pardner/` falls through `express.static` to the auth middleware and returns raw `401 {"error":"Unauthorized","code":"AUTH_REQUIRED"}` JSON. Nothing says "run `npm run ui:build`". `/` returns the same JSON. | `automerge-sync-server.js` static mount + `authMiddleware` | STORY-001, STORY-107, STORY-116 |
| D12 | M | Pair-dialog diagnostics: an address that went stale shows "Settings saved. Restart the Pardner service…" even though nothing was saved (`restartRequired` is true in both cases). | `src/PhoneAccess.jsx`, `lib/lan-access.js` | STORY-093 |
| D13 | M | Opening **Pair another device** on a paired phone mints a new code and invalidates the QR still shown on the laptop dialog, with no warning on the laptop. Every open or **Try again** mints a code. | `PhoneAccess.jsx` auto `POST /pardner/access/pairing` | STORY-091, STORY-089 |
| D14 | L | WS origin rejection sends `{"code":"ORIGIN_REJECTED","error":"…Open the current device address."}`, but the UI ignores the body and shows the generic "Live updates disconnected…". HTTP and WS use different wording. | `automerge-sync-server.js:172-196`, `connection.js` | STORY-111 |
| D15 | L | `pardner branch <task> try smaller scope` silently keeps only the first word (`try`) as the branch name. | `lib/cli.js` `branch` positional | STORY-121 |
| D16 | M | Branch tasks render as ordinary board cards with the parent's title and no branch marker; merged branches sit in **Completed**. | `Pardner.jsx:384` (filters all `doc.tasks`) | STORY-121 |
| D17 | L | `--json` is listed in HELP for `tasks` and `show` but only changes `help` output. `comment-resolve` is accepted but missing from HELP. `mentions deliver` is an undocumented alias. | `lib/cli.js` HELP | STORY-072, STORY-067, STORY-025 |
| D18 | M | `PARDNER_ACTOR` doubles as a read filter for `activity`, `mentions pending` and `show` unread counts. An agent's shell sees only its own activity, and there is no "all Actors" flag (only `PARDNER_ACTOR=`). | `lib/cli.js` `activity` | STORY-120, STORY-127 |
| D19 | M | CLI transport errors return `details: null`, so an agent that didn't pre-choose `--operation-id` can't retry idempotently. Only `STORAGE_FAILED` includes `details.operationId`. | `bin/pardner.js`, `lib/sync-client.js` | STORY-117 |
| D20 | M | `pardner resolve --value` accepts a value that is neither alternative, which bypasses the "choose one of the preserved edits" model the UI enforces. | `lib/workspace-commands.js` `prepareResolve` | STORY-061, STORY-065 |
| D21 | L | Comment cards keep crediting the original author and creation time after another Actor edits or resolves the comment. `editedBy` is returned but not shown. | `Pardner.jsx` Comments ~964-1042 | STORY-067, STORY-037 |
| D22 | L | Conflict section uses raw field keys and generated grammar ("Resolve assignee", **Keep this tags**), and shows raw IDs/JSON values. | `TaskDetail` conflict section | STORY-066 |
| D23 | M | "Ready for a verdict" also fires when the last task ends **Dead end** or **Abandoned**, and an unresolved task-status conflict silently blocks it. | `lib/workspace-schema.js` `veinSummary.readyForVerdict` | STORY-049, STORY-054 |
| D24 | L | `lastSyncedAt` lives in memory only: it is `null` after a replica restart, and during a hub outage it keeps the old time, so it can look recent while the replica is behind. | `lib/workspace-runtime.js` `status` | STORY-072, STORY-081 |
| D25 | M | On a hub, SaveStatus reads "Saved locally · synced" once the hub saved to disk, even if replicas are offline or behind (`syncPending` = `!savedLocally` on hubs). Operators read it as "everyone is up to date". | `Pardner.jsx` `SaveStatus` 66-83 | STORY-081, STORY-079 |
| D26 | L | Priority casing is inconsistent: lowercase `p1` in forms, uppercase `P1` on the card and details line. | `TaskForm`, card | STORY-013 |
| D27 | L | Goals view never shows vein descriptions. `vein update --goal` accepts only an existing goal ID, though `vein create --goal` accepts a title. | `Goals` (`Pardner.jsx:586-623`), `lib/cli.js` | STORY-044, STORY-052 |
| D28 | L | Activity entries for goals/veins have no task link and no destination; `replicaId` is never shown in the UI. | Activity view `Pardner.jsx:531-549` | STORY-132, STORY-135 |
| D29 | M | Pairing throttle is service-wide (10 attempts per rolling minute across all browsers), with no countdown, so one user hitting **Retry connection** locks out every other device. | `lib/lan-access.js` `redeem` | STORY-090 |

## Gaps & Recommendations

### Feature Map items with no story

- Integrations: T3 execution contract
- Integrations: HTTPS proxy path `PARDNER_BROWSER_WS_PATH`

### Thin coverage (one or two stories)

- Startup & connection: StartupBoundary "Pardner could not open" (STORY-110)
- Startup & connection: Config validation failure ("configuration is incomplete") (STORY-108)
- Pair another device: Non-admin with LAN disabled message (STORY-092)
- CLI: `branch` / `branches` / `merge` (STORY-121)
- CLI: `operation --request` (STORY-124)
- CLI: `bridge run|status|inspect|reconcile` (STORY-126)
- HTTP / WS: `/automerge/github-remote` and `/automerge/trace/:hash` endpoints (STORY-130)
- Integrations: Vite dev mode proxies (5174) (STORY-001, STORY-073)

### Gaps not visible in the Feature Map

1. **No story for export, backup or fresh-install recovery.** The project guidance (AGENTS.md) requires export, backup and fresh-install recovery to be usable, including metadata, credentials and attachment requirements. No story copies a data directory, restores it on a new machine, or recovers after losing `connection.json`. Add a long `multi-service` story: back up `.pardner`, wipe the machine, restore, reconnect browser and CLI, and re-enroll a replica.
2. **No hub-loss or hub-replacement story.** Replicas reopen offline (STORY-075), but nothing covers a hub that is gone for good: new enrollment, delivery ledger loss, and what replicas do. AGENTS.md asks for outage and replacement behaviour to be documented per required service.
3. **No keyboard or screen-reader walk.** The only keyboard path covered is Escape (STORY-017, STORY-019). Nobody walks Tab order through the header, New task panel, Task details and Pair dialog, focus return after Close, or the duplicate SaveStatus live regions. Add a short `browser` story per surface.
4. **WebKit and real mobile Safari are walked only for pairing.** The LAN guide pins WebKit for companion checks; layout stories (STORY-020, STORY-041) assume Chromium at 390×844.
5. **Two browsers on one hub watching each other live** is covered only incidentally. A short story of two tabs with different Actors (edit in one, live update and unread count in the other) would be cheap and `browser`-walkable.
6. **Large data.** Only STORY-134 touches hundreds of activity entries. Nothing covers a board with many cards per column, long comment threads or very long markdown.
7. **Delivery lease expiry** is covered only from the release side (STORY-026). Nothing covers a harness crash after `claim-next` without ack, then automatic redelivery after `--ttl-ms`.
8. **The bridge** has one long story (STORY-126), which needs a Codex App Server. `bridge inspect`, `bridge status` and `bridge reconcile` need their own short `cli-only` stories.
9. **T3 execution contract and HTTPS-proxy deployments (`PARDNER_BROWSER_WS_PATH`)** have no story. Add one `cli-only` story each if they are in scope for UX walks.
10. **Direct peer transport.** AGENTS.md asks transport changes to assess direct peer operation. No story covers or records that it's excluded. This is low priority unless transport work is planned.

### Recommendations

1. **Walk the `browser` set first.** That is the stories marked `browser` in the Walkability table, on one hub with the standard seed. They cover the board, Task details, comments and Activity, and the most likely high-severity defects (D2, D6, D7, D8).
2. **Verify D1 early.** It's one click on the opening screen (STORY-098) and, if confirmed, a small fix.
3. **Give /ux-flow these top candidates:** (a) status change through four UI routes and handoff-to-self, (b) Hand off work vs Edit task + comment, (c) Goals vein button vs nav Vein select giving different boards, (d) four connect routes on the pairing screen with a primary button that can't work on loopback, (e) five history tools with different `read.mark` and ordering rules.
4. **Add a UI affordance for deliveries** (a "waiting for me" list) or state plainly that humans learn about work only through assignment and unread counts. Every handoff story shows humans with no inbox.
5. **Seed scripts.** Most `browser+cli` stories differ only in their seed. A small seeding script per walk group (standard seed, conflict seed via replica, LAN seed) would turn many of them into plain `browser` walks.
6. **Keep merged sources in mind.** 18 stories were merged; the "Merged source" blocks keep their steps, so walkers should run the variant steps too rather than treat the merge as one path.
