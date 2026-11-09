# Issues filed by ux-walker

> **Retired story IDs.** STORY numbers in this record refer to the retired 2026-11-07 catalog. The current [catalog](../ux-paths/catalog.md) was regenerated for client mode on 2026-11-09 and uses different numbering.

| Issue | Story | Severity | Title | Findings | URL |
|---|---|---|---|---|---|
| #121 | STORY-019 | high | Unsaved drafts are silently discarded by Escape, Actor switch or opening another card | F-019-01, F-019-02, F-008-01, F-014-01, F-027-02, F-133-01, F-017-02 | https://github.com/depatchedmode/pardner/issues/121 |
| #122 | STORY-096 | high | Forget this workspace on the opening screen throws a ReferenceError (D1) | F-096-01 | https://github.com/depatchedmode/pardner/issues/122 |
| #123 | STORY-036 | high | Task side panel covers the header Actor select and New task button | F-036-01, F-019-03, F-023-01 | https://github.com/depatchedmode/pardner/issues/123 |
| #124 | STORY-013 | high | Markdown task lists and tables render broken in Task details | F-013-01, F-017-01 | https://github.com/depatchedmode/pardner/issues/124 |
| #125 | STORY-006 | high | A mistyped token is reported as 'The service credential changed', with misleading service hints | F-006-01, F-102-01, F-010-03, F-110-01 | https://github.com/depatchedmode/pardner/issues/125 |
| #126 | STORY-002 | high | First-Actor notice is not runnable and the bootstrap --actor rule is unexplained | F-002-01, F-002-02 | https://github.com/depatchedmode/pardner/issues/126 |
| #127 | STORY-005 | high | CLI run without the right data directory reports Unauthorized instead of pointing at the data dir | F-005-01 | https://github.com/depatchedmode/pardner/issues/127 |
| #128 | STORY-037 | high | Comments cannot be edited or deleted from the browser | F-037-01, F-038-01 | https://github.com/depatchedmode/pardner/issues/128 |
| #129 | STORY-038 | high | Deleting a comment leaves its text in Activity output with no warning (deletion is not redaction) | F-038-02, F-136-01, F-136-02 | https://github.com/depatchedmode/pardner/issues/129 |
| #130 | STORY-045 | high | vein create --goal with an existing goal title silently creates a duplicate goal | F-045-01, F-045-02 | https://github.com/depatchedmode/pardner/issues/130 |
| #131 | STORY-049 | high | Goals view shows 'Ready for a verdict' but offers no way to record verdicts or move veins/tasks | F-049-01, F-050-01, F-051-02, F-052-02 | https://github.com/depatchedmode/pardner/issues/131 |
| #132 | STORY-120 | high | PARDNER_ACTOR silently filters pardner activity/timeline to one Actor | F-120-01, F-120-02 | https://github.com/depatchedmode/pardner/issues/132 |
| #133 | STORY-134 | high | Activity is unusable at scale: no filters, paging or targets for vein/goal/actor entries | F-134-01, F-132-01, F-134-03, F-134-04 | https://github.com/depatchedmode/pardner/issues/133 |
| #134 | STORY-034 | medium | @mentions of unknown handles fail silently; no handle autocomplete | F-034-02, F-043-01, F-033-02 | https://github.com/depatchedmode/pardner/issues/134 |

## Findings mapped to existing issues (not re-filed)

| Findings | Existing issue |
|---|---|
| F-062-01, F-062-03, F-062-04 (STALE_UPDATE retry can never succeed) | #112 |
| F-016-01, F-001-06, F-013-06 (Forget has no confirmation; chrome placement) | #114 |
| F-001-01, F-001-03, F-010-01, F-001-02, F-107-01 (first-run on-ramp, root URL JSON) | #116 |
| F-034-01, F-008-03, F-027-03, F-063-03 (own comments count as unread) | #117 |
| F-027-04, F-018-02, F-048-01 (raw History/Activity) | #118 |
| F-004-01 tags never shown; F-048-03 no vein picker | #119 |
| F-031-01 (editing a handoff comment cancels the assignee's delivery) | #60 |
| F-015-01 no active-filter indicator / Clear filters | #113 |

## Second pass (multi-service and cli-only stories)

| Issue | Story | Severity | Title | URL |
|---|---|---|---|---|
| #140 | STORY-117 | high | CLI write whose response is lost reports failure with no operation ID | https://github.com/depatchedmode/pardner/issues/140 |
| #141 | STORY-126 | high | Bridge accepts a mapping to a human Actor and drains their mentions | https://github.com/depatchedmode/pardner/issues/141 |
| #142 | STORY-057 | high | CLI list filters accept invalid values and return an empty success | https://github.com/depatchedmode/pardner/issues/142 |
| #143 | STORY-053 | high | Goal and vein conflicts show only a badge | https://github.com/depatchedmode/pardner/issues/143 |
| #144 | STORY-111 | high | A disallowed origin or bind host blocks the app bundle | https://github.com/depatchedmode/pardner/issues/144 |
| #145 | STORY-077 | high | A lost write response blocks all edits though the change landed | https://github.com/depatchedmode/pardner/issues/145 |
| #146 | STORY-081 | high | "Saved locally · synced" shown when sync is unknown or pending | https://github.com/depatchedmode/pardner/issues/146 |
| #147 | STORY-085 | high | A pairing code goes invalid silently while the dialog keeps showing it | https://github.com/depatchedmode/pardner/issues/147 |

Evidence was added as comments on #127 (F-125-01, F-106-01) and #114 (F-097-001).

## Run 2026-11-09 (client mode, catalog regenerated)

### New issues

| Issue | Severity | Stories | Title |
|---|---|---|---|
| [#150](https://github.com/depatchedmode/pardner/issues/150) | high | STORY-002, STORY-013, STORY-016, STORY-027, STORY-041, STORY-049 … | UX: Every person's built-in agent is named "Setup agent", so agents cannot be told apart |
| [#151](https://github.com/depatchedmode/pardner/issues/151) | high | STORY-030, STORY-067, STORY-083, STORY-089, STORY-098, STORY-137 … | UX: A saved request refused with FORBIDDEN or OPERATION_INTEGRITY_CONFLICT blocks every edit with only "Retry saved request" |
| [#152](https://github.com/depatchedmode/pardner/issues/152) | high | STORY-021, STORY-043, STORY-044, STORY-045, STORY-140 | UX: No browser control to remove a member, device or agent; CLI revocation needs IDs copied from JSON |
| [#153](https://github.com/depatchedmode/pardner/issues/153) | high | STORY-043, STORY-045, STORY-130 | UX: A revoked agent harness or person can never be re-enrolled, although the advice says to join again |
| [#154](https://github.com/depatchedmode/pardner/issues/154) | high | STORY-005, STORY-021, STORY-130, STORY-140, STORY-141 | UX: Losing one project's membership shows "This browser isn't signed in", and the revoked project vanishes without a trace |
| [#155](https://github.com/depatchedmode/pardner/issues/155) | high | STORY-015, STORY-016, STORY-017, STORY-023 | UX: A My device invitation silently adopts its issuer's identity without showing whose it is |
| [#156](https://github.com/depatchedmode/pardner/issues/156) | high | STORY-014, STORY-018, STORY-019, STORY-022, STORY-026, STORY-027 … | UX: A saved identity cannot be edited, and a wrong first choice is a dead end that creates duplicate people |
| [#157](https://github.com/depatchedmode/pardner/issues/157) | high | STORY-110, STORY-111, STORY-112, STORY-116, STORY-120 | UX: Control pane errors are wiped by the next 2-second poll and shown out of view |
| [#158](https://github.com/depatchedmode/pardner/issues/158) | high | STORY-112, STORY-113, STORY-118 | UX: Control accepts verdicts and artifacts for executions that never ran, and hides verdict history |
| [#159](https://github.com/depatchedmode/pardner/issues/159) | high | STORY-112, STORY-114, STORY-115, STORY-117, STORY-121 | UX: Control and Cloud forms require raw Actor, task and run IDs and use internal jargon |
| [#160](https://github.com/depatchedmode/pardner/issues/160) | high | STORY-089, STORY-090 | UX: Any Actor can delete any comment, and non-authors are offered "Keep this comment" |
| [#161](https://github.com/depatchedmode/pardner/issues/161) | high | STORY-097 | UX: The Goals empty state tells people to run a command that fails for them, and people cannot author CLI changes |
| [#162](https://github.com/depatchedmode/pardner/issues/162) | high | STORY-015, STORY-023, STORY-028, STORY-036, STORY-041, STORY-042 … | UX: Invitations from a client without --public-url carry a loopback address, and hub failures advise a retry that cannot work |
| [#163](https://github.com/depatchedmode/pardner/issues/163) | high | STORY-002, STORY-007, STORY-012, STORY-135 | UX: Port clashes: a dev server on the saved port gives INTERNAL_ERROR JSON, and the --http-port advice does not work |
| [#164](https://github.com/depatchedmode/pardner/issues/164) | high | STORY-008, STORY-009, STORY-141, STORY-143 | UX: After client stop, client status, list and export fail with INTERNAL_ERROR "fetch failed" |
| [#165](https://github.com/depatchedmode/pardner/issues/165) | high | STORY-141, STORY-142 | UX: Restoring a backup lets two active copies of the same identity run, and backup/export are hand-built |
| [#166](https://github.com/depatchedmode/pardner/issues/166) | high | STORY-034, STORY-035 | UX: Long project names overflow the board header, and projects cannot be renamed or deleted |
| [#167](https://github.com/depatchedmode/pardner/issues/167) | high | STORY-031 | UX: A project runtime failure shows a nameless "board isn't reachable yet" page with only Retry |
| [#168](https://github.com/depatchedmode/pardner/issues/168) | high | STORY-102 | UX: Activity shows goal renames under the current title and never shows the value each person wrote |
| [#169](https://github.com/depatchedmode/pardner/issues/169) | high | STORY-071, STORY-077, STORY-078, STORY-083, STORY-088, STORY-089 … | UX: Conflict resolution shows raw Actor IDs, slugs and JSON, and unlabeled alternatives |
| [#170](https://github.com/depatchedmode/pardner/issues/170) | high | STORY-005, STORY-010, STORY-125 | UX: On agent-only devices, browser and CLI advice point to commands that fail there |
| [#171](https://github.com/depatchedmode/pardner/issues/171) | high | STORY-054 | UX: Agents cannot report presence: the credential's apiBase points one level too deep and there is no CLI command |
| [#172](https://github.com/depatchedmode/pardner/issues/172) | high | STORY-004 | UX: On the signed-out screen, Check again can never sign the browser in |
| [#173](https://github.com/depatchedmode/pardner/issues/173) | medium | STORY-054, STORY-057, STORY-070, STORY-094, STORY-107, STORY-108 … | UX: CLI flags accept only opaque Actor and project IDs, never the names people see |
| [#174](https://github.com/depatchedmode/pardner/issues/174) | medium | STORY-087, STORY-091, STORY-093, STORY-094, STORY-096, STORY-126 … | UX: Mention and handoff delivery state is invisible in the browser |
| [#175](https://github.com/depatchedmode/pardner/issues/175) | medium | STORY-021, STORY-043, STORY-130 | UX: Revoked devices and Actors look identical to active offline ones |
| [#176](https://github.com/depatchedmode/pardner/issues/176) | medium | STORY-110, STORY-112, STORY-113, STORY-114, STORY-116, STORY-117 … | UX: Control setup has no guided order, mappings cannot be edited, and credential notices have no action |
| [#177](https://github.com/depatchedmode/pardner/issues/177) | medium | STORY-110, STORY-111, STORY-112, STORY-113, STORY-114, STORY-116 … | UX: Control pane visual hierarchy: status colours, spacing and duplicated hold text |
| [#178](https://github.com/depatchedmode/pardner/issues/178) | medium | STORY-056, STORY-068, STORY-076, STORY-077, STORY-079, STORY-099 … | UX: Focus drops to <body> after common actions, view switches add no history, and cards omit presence from their names |
| [#179](https://github.com/depatchedmode/pardner/issues/179) | medium | STORY-009, STORY-025, STORY-031, STORY-067, STORY-137, STORY-142 … | UX: Local service outage: duplicated banners, silent Retry, and New task still enabled |
| [#180](https://github.com/depatchedmode/pardner/issues/180) | medium | STORY-072, STORY-076, STORY-079, STORY-092, STORY-098, STORY-107 … | UX: STALE_UPDATE on quick selects says "Your draft is preserved" and names no field, value or author |
| [#181](https://github.com/depatchedmode/pardner/issues/181) | medium | STORY-008, STORY-011, STORY-070, STORY-103, STORY-108, STORY-122 … | UX: CLI errors leak raw Node, SQLite and transport text and do not name the fix |
| [#182](https://github.com/depatchedmode/pardner/issues/182) | medium | STORY-020, STORY-024, STORY-048, STORY-050, STORY-051, STORY-052 … | UX: Presence display: reading counts as idle, the viewer appears twice, and markers are hard to read |
| [#183](https://github.com/depatchedmode/pardner/issues/183) | medium | STORY-017, STORY-037, STORY-038, STORY-039, STORY-040, STORY-042 … | UX: Invitation management: history lacks who and when, grows unbounded, and the CLI cannot list or revoke |
| [#184](https://github.com/depatchedmode/pardner/issues/184) | medium | STORY-024, STORY-025, STORY-027, STORY-028, STORY-035, STORY-124 | UX: Start and Join show stale resume notices and wrong advice for invitations you already used |
| [#185](https://github.com/depatchedmode/pardner/issues/185) | medium | STORY-002, STORY-024, STORY-063, STORY-069 | UX: On phones the header, nav and filters consume most of the first screen |
| [#186](https://github.com/depatchedmode/pardner/issues/186) | medium | STORY-131, STORY-132, STORY-133 | UX: Bridge status reports "running" after the bridge is killed, and bridge diagnostics are raw |
| [#187](https://github.com/depatchedmode/pardner/issues/187) | medium | STORY-006, STORY-011 | UX: The standalone service and the local client are easy to confuse |
| [#188](https://github.com/depatchedmode/pardner/issues/188) | low | STORY-006, STORY-012, STORY-032, STORY-064, STORY-099, STORY-129 | UX: Visual consistency: WebKit native selects, view-tab jump, startup shell mismatch |

### Evidence added to existing issues

| Issue | Severity | Stories | Cluster |
|---|---|---|---|
| [#134](https://github.com/depatchedmode/pardner/issues/134#issuecomment-6750687963) | high | STORY-055, STORY-086, STORY-096, STORY-126, STORY-139 | UX: @mentions of unknown handles fail silently; no handle autocomplete |
| [#119](https://github.com/depatchedmode/pardner/issues/119#issuecomment-6750688439) | high | STORY-059, STORY-064 | UX-flow: Show tags (or remove the field) and add a Vein select to the task forms |
| [#128](https://github.com/depatchedmode/pardner/issues/128#issuecomment-6750689069) | medium | STORY-090 | UX: Comments cannot be edited or deleted from the browser |
| [#130](https://github.com/depatchedmode/pardner/issues/130#issuecomment-6750689610) | medium | STORY-097 | UX: vein create --goal with an existing goal title silently creates a duplicate goal |
| [#113](https://github.com/depatchedmode/pardner/issues/113#issuecomment-6750690163) | medium | STORY-063, STORY-064, STORY-065, STORY-071, STORY-099, STORY-109 | UX-flow: Show filters only on the board, as removable chips with **Clear filters** |
| [#146](https://github.com/depatchedmode/pardner/issues/146#issuecomment-6750690639) | medium | STORY-017, STORY-023, STORY-026, STORY-028, STORY-029, STORY-030 … | UX: 'Saved locally · synced' is shown when sync state is unknown or pending |
| [#121](https://github.com/depatchedmode/pardner/issues/121#issuecomment-6750691207) | medium | STORY-061, STORY-062, STORY-068, STORY-073, STORY-074, STORY-084 | UX: Unsaved drafts are silently discarded by Escape, Actor switch or opening another card |
| [#112](https://github.com/depatchedmode/pardner/issues/112#issuecomment-6750691793) | medium | STORY-075, STORY-084 | UX-flow: Make edit-after-STALE_UPDATE recoverable in place |
| [#111](https://github.com/depatchedmode/pardner/issues/111#issuecomment-6750692359) | medium | STORY-073, STORY-095 | UX-flow: Collapse **Hand off work** behind a button, make it the primary action, and default its status sensibly |
| [#148](https://github.com/depatchedmode/pardner/issues/148#issuecomment-6750692818) | medium | STORY-088, STORY-100, STORY-105 | UX: Activity follow-ups — vein status hidden from "Goals and veins", Activity→task lands far from the event, edited comments unmarked |
| [#144](https://github.com/depatchedmode/pardner/issues/144#issuecomment-6750693489) | medium | STORY-002, STORY-003, STORY-145 | UX: A disallowed origin or bind host blocks the app bundle and shows misleading 'rebuild' advice |
| [#123](https://github.com/depatchedmode/pardner/issues/123#issuecomment-6750694031) | low | STORY-053, STORY-065, STORY-072, STORY-087 | UX: Task side panel covers the header Actor select and New task button |
| [#118](https://github.com/depatchedmode/pardner/issues/118#issuecomment-6750694958) | low | STORY-081, STORY-085 | UX-flow: Humanise History and unify it with Activity |
| [#117](https://github.com/depatchedmode/pardner/issues/117#issuecomment-6750695458) | low | STORY-087 | UX-flow: Stop counting an author's own comments as unread and humanise unread copy |
| [#133](https://github.com/depatchedmode/pardner/issues/133#issuecomment-6750695915) | low | STORY-105 | UX: Activity is unusable at scale: no filters, paging or targets for vein/goal/actor entries |
| [#131](https://github.com/depatchedmode/pardner/issues/131#issuecomment-6750696456) | low | STORY-099 | UX: Goals view shows 'Ready for a verdict' but offers no way to record verdicts or move veins/tasks |
| [#139](https://github.com/depatchedmode/pardner/issues/139#issuecomment-6750697175) | low | STORY-060, STORY-066 | UX-visual: New task form: Actor context, required-field consistency, field sizing, busy state, Cancel (V12) |
