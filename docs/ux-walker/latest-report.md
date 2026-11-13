# UX Walker Report — 2026-11-09

This report replaces the 2026-11-07 standalone-board report. STORY numbers here refer to the client-mode [catalog](../ux-paths/catalog.md) regenerated on 2026-11-09. They do not match the retired 2026-11-07 numbering.

## 1. Run metadata

| Field | Value |
|---|---|
| Date | 2026-11-09 |
| Branch | `client-only-entry` |
| Catalog | `docs/ux-paths/catalog.md`, regenerated for client mode: 146 stories, 78 of them walked first because they carry flagged claims |
| Target | Private loopback client services (`pardner client serve`) and hubs, one set per topic batch, with personas in separate client data directories |
| Browser driver | `agent-browser` was not installed. Walkers used Playwright (Chromium and WebKit) and the Pardner CLI. Outages and revocations were real: services and hubs were stopped, and access was revoked through the CLI |
| Simulated steps | Some steps were simulated, for example a recipient on "another computer" on one machine. Each simulated step is labelled in its story report (24 reports contain one) |
| Run mode | Full walk: 146 walked, 0 skipped. 42 stories re-verified after the quick fixes |
| Result | **103 pass · 38 fail · 5 blocked** (pass rate 103/146, 70.5%) |
| Evidence | Screenshots, videos and logs are kept outside the repository, under `<evidence-archive>/walker-2026-11-09/` |
| Verification after fixes | `npm run verify` passed: 724/724 tests, the UI build and one acceptance seed |
| Not run | The 20-seed acceptance qualification (`npm run test:acceptance -- --repeat 20 --seed 1`). No storage, sync or delivery qualification is claimed from this run |

Sources: `run-history.json` (last run entry), `walk-plan.json`, `stories/STORY-*/walk-report.md` and `findings.json`, `issues-filed.md` ("Run 2026-11-09"), the ten fix reports in `fixes/`, `reverify-2026-11-09.md`, and the walk triage.

## 2. Findings summary

461 findings across 146 stories (3.2 per story). No critical findings.

### By severity

| Severity | Count | Quick fixed | Issue (new or existing) | Report only |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 42 | 0 | 42 | 0 |
| Medium | 163 | 23 | 140 | 0 |
| Low | 222 | 42 | 174 | 6 |
| Suggestion | 34 | 0 | 0 | 34 |
| **Total** | **461** | **65** | **356** | **40** |

"Report only" findings were recorded in the story reports but not filed, for example F-013-03, F-032-02, F-097-05 and F-146-01.

### By category

| Category | Count | High | Example |
|---|---|---|---|
| Error handling | 144 | 19 | F-005-01: a project revocation shows "This browser isn't signed in"; F-009-01: `client status` after `client stop` gives `INTERNAL_ERROR: fetch failed` |
| Consistency | 65 | 3 | F-090-02, F-091-01: every person's built-in agent is "Setup agent", so recipients cannot be told apart |
| Happy path | 57 | 10 | F-004-01: Check again can never sign the browser in; F-055-01: `@Name` mentions reach no one |
| Flow | 56 | 9 | F-014-01: a saved identity cannot be edited; F-007-02: the `--http-port` advice cannot take effect |
| Hierarchy | 33 | 0 | F-015-05: the dominant "Continue as …" button creates a duplicate identity on a second computer |
| Disclosure | 33 | 0 | F-021-02: revoked devices look like active ones; F-023-03: linking replaces the prefilled identity without saying so |
| Layout | 22 | 1 | F-034-01: a long project name spills 383 px over the header avatars |
| Accessibility | 21 | 0 | F-049-01: focus drops to `<body>` after closing a profile; F-056-01: card names omit who is on the task |
| Visual | 19 | 0 | F-083-03, F-086-02: raw 64-character IDs and handles wrap mid-token |
| Simplicity | 11 | 0 | F-067-03: an outage shows three status messages and two retry buttons |

## 3. Quick fixes applied

Ten quick-fix units covering 65 findings in 42 stories. All ten were merged. Re-verification ([reverify-2026-11-09.md](reverify-2026-11-09.md)) found **54 resolved, 10 partial, 1 not resolved**, and no regressions in the walked pages.

| Unit / report | Findings | Before | After | Files | Re-verify |
|---|---|---|---|---|---|
| qf-1 · [F-001-01](fixes/F-001-01.md) | F-001-01, F-046-03, F-003-01, F-003-02, F-012-02, F-128-01 | Every CLI call printed Node's SQLite `ExperimentalWarning`; a failed launch advised a retry that fails the same way; `open --output-file` did not name the file or the 60 s lifetime; bad `--request` JSON gave `INTERNAL_ERROR` | Warning filtered before the CLI loads; launch failure names `--output-file`; result carries `outputFile` and `expiresInSeconds: 60`; `--request` refusals are `INVALID_ARGUMENT` | `bin/pardner.js`, `lib/client-cli.js` | 4 resolved, 2 partial (F-046-03 epoch `expiresAt` and double-printed errors remain; F-003-02 still says `launchIssued: true`) |
| qf-2 · [F-014-05](fixes/F-014-05.md) | F-014-05, F-123-01, F-043-03, F-045-03, F-130-04, F-014-03, F-019-01, F-022-02 | "Supply a name" for an over-long name; harness and revoke refusals named the wrong problem; `IDENTITY_EXISTS` said "linking requires My device" | "Use a name of at most 200 characters"; harness error lists valid IDs; creator self-revoke and unknown agent ID get their own messages (`NOT_FOUND` for the latter); `IDENTITY_EXISTS` names the saved identity and returns it in `details` | `lib/client-identity.js`, `lib/client-service.js` | 7 resolved, 1 partial (F-019-01: tab B still offers no way to continue as the saved identity) |
| qf-3 · [F-079-01](fixes/F-079-01.md) | F-079-01, F-080-01, F-128-02 | History and Activity read "recorded task.link-issue" | "linked issue owner/repo#N to …" and "unlinked issue … from …" | `ui-prototype/src/events.js` | 3 resolved |
| qf-4 · [F-104-01](fixes/F-104-01.md) | F-104-01, F-082-01, F-088-03, F-138-04, F-080-02, F-075-02, F-075-03 | Raw `event.type` tooltips; two date formats in one panel; identical Unlink buttons; the newer-save notice credited one Actor for every field | Tooltip removed; one date format; Unlink names its issue; each newer field is credited to its author | `ui-prototype/src/Pardner.jsx` | 5 resolved, 2 partial (F-088-03 raw Markdown in Activity; F-080-02 focus still drops after Unlink) |
| qf-5 · [F-052-01](fixes/F-052-01.md) | F-052-01, F-034-04, F-036-03, F-104-02, F-106-01, F-097-06, F-004-04, F-014-04 | "+N" and "Waiting to be used" wrapped; script focus invisible; Goals empty state centred; Courier inline code in WebKit; a long name overflowed the page | `nowrap` on both labels; visible focus on events and goals; left-aligned empty state; system monospace for inline code; the button wraps inside the form | `ui-prototype/src/pardner.css` | 8 resolved |
| qf-6 · [F-004-02](fixes/F-004-02.md) | F-004-02, F-004-03, F-004-05, F-012-03, F-015-03, F-036-02, F-015-04, F-039-02, F-036-04, F-039-01, F-038-01, F-013-01, F-049-01, F-049-02 | Signed-out copy assumed an agent and named `client open`; the new invitation appeared twice; a revoked invitation showed an expiry; identical Revoke names; no way to create another invitation; Git note overclaimed; People focus dropped | "Run `pardner open` … or ask your agent to"; used/expired notice states the 60 s rule; history omits the shown invitation; Create another invitation; distinct Revoke names; Git note matches the fields Git supplied; closing a profile reopens People | `ui-prototype/src/ClientApp.jsx` | 11 resolved, 2 partial (F-004-02 second-browser route; F-012-03 outage banner names no command), **1 not resolved** (F-038-01: in WebKit the first click still does not select the invite text) |
| qf-7 · [F-014-06](fixes/F-014-06.md) | F-014-06, F-020-03, F-049-04, F-125-05, F-045-04, F-049-05 | Profiles said "Git name/Git email"; agent profiles showed the owner's Git identity; "Cursor (ci)" gave initials "C("; People Close misplaced | "Name"/"Email", shown for humans only; initials skip punctuation ("CC"); Close right-aligned | `ui-prototype/src/Avatar.jsx` | 5 resolved, 1 partial (F-020-03: the Setup agent still shows "Harness Codex") |
| qf-8 · [F-030-01](fixes/F-030-01.md) | F-030-01, F-067-01, F-083-05, F-085-01, F-098-02, F-137-01 | An unreachable service showed "Failed to fetch" | `CLIENT_UNREACHABLE`: "The local Pardner client did not respond. Check that it is still running, then retry." The pending operation is kept for retry | `ui-prototype/src/connection.js` | 5 resolved, 1 partial (F-085-01: two retry buttons with the same sentence) |
| qf-9 · [F-132-01](fixes/F-132-01.md) | F-132-01, F-132-02, F-133-01 | Malformed `bridge.json` gave `INTERNAL_ERROR`; a missing `--token-file` said "requires replicaId"; help omitted `--token-file` | `INVALID_ARGUMENT` naming the file; refusal names `--token-file`; help lists it | `lib/agent-bridge.js`, `lib/cli.js` | 2 resolved, 1 partial (F-132-02: a missing credential file is still reported as malformed) |
| qf-10 · [F-134-01](fixes/F-134-01.md) | F-134-01, F-134-02, F-144-01, F-144-02 | Usage mistakes in `control cli` were coded `CONTROL_RUNTIME_UNAVAILABLE`; an empty home printed raw `Errno 2`; the `--` separator was unexplained | `INVALID_ARGUMENT` for usage errors; "not a Pardner control installation"; argparse error explains `--` | `scripts/control-runtime.py` | 4 resolved |

Re-verification also noted low-severity side effects: the invite history's expiry column now wraps, a long unbroken name makes a 6-line Continue button, and the outage sentence appears in both the banner and the inline error.

## 4. Issues filed

39 new issues (#150–#188) and evidence added to 17 existing issues. Story numbers below are STORY-NNN.

### New issues

| # | Title | Severity | Stories |
|---|---|---|---|
| [#150](https://github.com/depatchedmode/pardner/issues/150) | Every person's built-in agent is named "Setup agent", so agents cannot be told apart | high | 002, 013, 016, 027, 041, 049, 054, 059, 070, 072, 090, 091, 092, 095, 097, 105, 125, 139 |
| [#151](https://github.com/depatchedmode/pardner/issues/151) | A saved request refused with FORBIDDEN or OPERATION_INTEGRITY_CONFLICT blocks every edit with only "Retry saved request" | high | 030, 067, 083, 089, 098, 137, 138 |
| [#152](https://github.com/depatchedmode/pardner/issues/152) | No browser control to remove a member, device or agent; CLI revocation needs IDs copied from JSON | high | 021, 043, 044, 045, 140 |
| [#153](https://github.com/depatchedmode/pardner/issues/153) | A revoked agent harness or person can never be re-enrolled, although the advice says to join again | high | 043, 045, 130 |
| [#154](https://github.com/depatchedmode/pardner/issues/154) | Losing one project's membership shows "This browser isn't signed in", and the revoked project vanishes without a trace | high | 005, 021, 130, 140, 141 |
| [#155](https://github.com/depatchedmode/pardner/issues/155) | A My device invitation silently adopts its issuer's identity without showing whose it is | high | 015, 016, 017, 023 |
| [#156](https://github.com/depatchedmode/pardner/issues/156) | A saved identity cannot be edited, and a wrong first choice is a dead end that creates duplicate people | high | 014, 018, 019, 022, 026, 027, 033, 047 |
| [#157](https://github.com/depatchedmode/pardner/issues/157) | Control pane errors are wiped by the next 2-second poll and shown out of view | high | 110, 111, 112, 116, 120 |
| [#158](https://github.com/depatchedmode/pardner/issues/158) | Control accepts verdicts and artifacts for executions that never ran, and hides verdict history | high | 112, 113, 118 |
| [#159](https://github.com/depatchedmode/pardner/issues/159) | Control and Cloud forms require raw Actor, task and run IDs and use internal jargon | high | 112, 114, 115, 117, 121 |
| [#160](https://github.com/depatchedmode/pardner/issues/160) | Any Actor can delete any comment, and non-authors are offered "Keep this comment" | high | 089, 090 |
| [#161](https://github.com/depatchedmode/pardner/issues/161) | The Goals empty state tells people to run a command that fails for them, and people cannot author CLI changes | high | 097 |
| [#162](https://github.com/depatchedmode/pardner/issues/162) | Invitations from a client without --public-url carry a loopback address, and hub failures advise a retry that cannot work | high | 015, 023, 028, 036, 041, 042, 139 |
| [#163](https://github.com/depatchedmode/pardner/issues/163) | Port clashes: a dev server on the saved port gives INTERNAL_ERROR JSON, and the --http-port advice does not work | high | 002, 007, 012, 135 |
| [#164](https://github.com/depatchedmode/pardner/issues/164) | After client stop, client status, list and export fail with INTERNAL_ERROR "fetch failed" | high | 008, 009, 141, 143 |
| [#165](https://github.com/depatchedmode/pardner/issues/165) | Restoring a backup lets two active copies of the same identity run, and backup/export are hand-built | high | 141, 142 |
| [#166](https://github.com/depatchedmode/pardner/issues/166) | Long project names overflow the board header, and projects cannot be renamed or deleted | high | 034, 035 |
| [#167](https://github.com/depatchedmode/pardner/issues/167) | A project runtime failure shows a nameless "board isn't reachable yet" page with only Retry | high | 031 |
| [#168](https://github.com/depatchedmode/pardner/issues/168) | Activity shows goal renames under the current title and never shows the value each person wrote | high | 102 |
| [#169](https://github.com/depatchedmode/pardner/issues/169) | Conflict resolution shows raw Actor IDs, slugs and JSON, and unlabeled alternatives | high | 071, 077, 078, 083, 088, 089, 100, 101, 102 |
| [#170](https://github.com/depatchedmode/pardner/issues/170) | On agent-only devices, browser and CLI advice point to commands that fail there | high | 005, 010, 125 |
| [#171](https://github.com/depatchedmode/pardner/issues/171) | Agents cannot report presence: the credential's apiBase points one level too deep and there is no CLI command | high | 054 |
| [#172](https://github.com/depatchedmode/pardner/issues/172) | On the signed-out screen, Check again can never sign the browser in | high | 004 |
| [#173](https://github.com/depatchedmode/pardner/issues/173) | CLI flags accept only opaque Actor and project IDs, never the names people see | medium | 054, 057, 070, 094, 107, 108, 123, 124, 126, 135 |
| [#174](https://github.com/depatchedmode/pardner/issues/174) | Mention and handoff delivery state is invisible in the browser | medium | 087, 091, 093, 094, 096, 126, 131, 136 |
| [#175](https://github.com/depatchedmode/pardner/issues/175) | Revoked devices and Actors look identical to active offline ones | medium | 021, 043, 130 |
| [#176](https://github.com/depatchedmode/pardner/issues/176) | Control setup has no guided order, mappings cannot be edited, and credential notices have no action | medium | 110, 112, 113, 114, 116, 117, 119, 121 |
| [#177](https://github.com/depatchedmode/pardner/issues/177) | Control pane visual hierarchy: status colours, spacing and duplicated hold text | medium | 110, 111, 112, 113, 114, 116, 117 |
| [#178](https://github.com/depatchedmode/pardner/issues/178) | Focus drops to `<body>` after common actions, view switches add no history, and cards omit presence from their names | medium | 056, 068, 076, 077, 079, 099, 107, 109 |
| [#179](https://github.com/depatchedmode/pardner/issues/179) | Local service outage: duplicated banners, silent Retry, and New task still enabled | medium | 009, 025, 031, 067, 137, 142, 143 |
| [#180](https://github.com/depatchedmode/pardner/issues/180) | STALE_UPDATE on quick selects says "Your draft is preserved" and names no field, value or author | medium | 072, 076, 079, 092, 098, 107, 137 |
| [#181](https://github.com/depatchedmode/pardner/issues/181) | CLI errors leak raw Node, SQLite and transport text and do not name the fix | medium | 008, 011, 070, 103, 108, 122, 127, 129 |
| [#182](https://github.com/depatchedmode/pardner/issues/182) | Presence display: reading counts as idle, the viewer appears twice, and markers are hard to read | medium | 020, 024, 048, 050, 051, 052, 053, 054, 056, 057, 058, 071 |
| [#183](https://github.com/depatchedmode/pardner/issues/183) | Invitation management: history lacks who and when, grows unbounded, and the CLI cannot list or revoke | medium | 017, 037, 038, 039, 040, 042, 046, 047, 124 |
| [#184](https://github.com/depatchedmode/pardner/issues/184) | Start and Join show stale resume notices and wrong advice for invitations you already used | medium | 024, 025, 027, 028, 035, 124 |
| [#185](https://github.com/depatchedmode/pardner/issues/185) | On phones the header, nav and filters consume most of the first screen | medium | 002, 024, 063, 069 |
| [#186](https://github.com/depatchedmode/pardner/issues/186) | Bridge status reports "running" after the bridge is killed, and bridge diagnostics are raw | medium | 131, 132, 133 |
| [#187](https://github.com/depatchedmode/pardner/issues/187) | The standalone service and the local client are easy to confuse | medium | 006, 011 |
| [#188](https://github.com/depatchedmode/pardner/issues/188) | Visual consistency: WebKit native selects, view-tab jump, startup shell mismatch | low | 006, 012, 032, 064, 099, 129 |

### Evidence added to existing issues

| # | Title | Severity | Stories |
|---|---|---|---|
| [#134](https://github.com/depatchedmode/pardner/issues/134#issuecomment-6750687963) | @mentions of unknown handles fail silently; no handle autocomplete | high | 055, 086, 096, 126, 139 |
| [#119](https://github.com/depatchedmode/pardner/issues/119#issuecomment-6750688439) | Show tags (or remove the field) and add a Vein select to the task forms | high | 059, 064 |
| [#128](https://github.com/depatchedmode/pardner/issues/128#issuecomment-6750689069) | Comments cannot be edited or deleted from the browser | medium | 090 |
| [#130](https://github.com/depatchedmode/pardner/issues/130#issuecomment-6750689610) | vein create --goal with an existing goal title silently creates a duplicate goal | medium | 097 |
| [#113](https://github.com/depatchedmode/pardner/issues/113#issuecomment-6750690163) | Show filters only on the board, as removable chips with Clear filters | medium | 063, 064, 065, 071, 099, 109 |
| [#146](https://github.com/depatchedmode/pardner/issues/146#issuecomment-6750690639) | 'Saved locally · synced' is shown when sync state is unknown or pending | medium | 017, 023, 026, 028, 029, 030, 034, 035, 042, 051, 055, 066, 084, 137, 139 |
| [#121](https://github.com/depatchedmode/pardner/issues/121#issuecomment-6750691207) | Unsaved drafts are silently discarded by Escape, Actor switch or opening another card | medium | 061, 062, 068, 073, 074, 084 |
| [#112](https://github.com/depatchedmode/pardner/issues/112#issuecomment-6750691793) | Make edit-after-STALE_UPDATE recoverable in place | medium | 075, 084 |
| [#111](https://github.com/depatchedmode/pardner/issues/111#issuecomment-6750692359) | Collapse Hand off work behind a button, make it the primary action, and default its status sensibly | medium | 073, 095 |
| [#148](https://github.com/depatchedmode/pardner/issues/148#issuecomment-6750692818) | Activity follow-ups: vein status hidden from "Goals and veins", Activity→task lands far from the event, edited comments unmarked | medium | 088, 100, 105 |
| [#144](https://github.com/depatchedmode/pardner/issues/144#issuecomment-6750693489) | A disallowed origin or bind host blocks the app bundle and shows misleading 'rebuild' advice | medium | 002, 003, 145 |
| [#123](https://github.com/depatchedmode/pardner/issues/123#issuecomment-6750694031) | Task side panel covers the header Actor select and New task button | low | 053, 065, 072, 087 |
| [#118](https://github.com/depatchedmode/pardner/issues/118#issuecomment-6750694958) | Humanise History and unify it with Activity | low | 081, 085 |
| [#117](https://github.com/depatchedmode/pardner/issues/117#issuecomment-6750695458) | Stop counting an author's own comments as unread and humanise unread copy | low | 087 |
| [#133](https://github.com/depatchedmode/pardner/issues/133#issuecomment-6750695915) | Activity is unusable at scale: no filters, paging or targets for vein/goal/actor entries | low | 105 |
| [#131](https://github.com/depatchedmode/pardner/issues/131#issuecomment-6750696456) | Goals view shows 'Ready for a verdict' but offers no way to record verdicts or move veins/tasks | low | 099 |
| [#139](https://github.com/depatchedmode/pardner/issues/139#issuecomment-6750697175) | New task form: Actor context, required-field consistency, field sizing, busy state, Cancel (V12) | low | 060, 066 |

## 5. UX audit summary

### Overall assessment

The single-person board is in good shape: creating, editing, filtering and offline saving mostly pass, and local drafts and pending operations survive outages. Most failures sit where Pardner involves more than one person, device or service: identity, invitations, revocation, mentions, conflicts and the Control tab. There, the product often shows internal identifiers, gives advice that cannot work, or offers no browser path at all.

### Flagged claims

The catalog listed 53 code-read claims "for /ux-walker verification". Walkers returned **42 confirmed, 8 mixed, 2 refuted and 1 blocked**.

| # | Claim (short) | Verdict | Stories |
|---|---|---|---|
| 1 | FORBIDDEN is not definitive; pending request stuck, no Dismiss, survives reload | CONFIRMED | 089, 138 |
| 2 | REVOKED on a board write stays pending; no board-specific message | REFUTED in part, BLOCKED in part: the board falls to the signed-out screen before any write (F-140-01); a reload shows a project-revoked screen | 140 |
| 3 | OPERATION_INTEGRITY_CONFLICT: Retry keeps failing, New task disabled | CONFIRMED (pending entry seeded by hand) | 083 |
| 4 | Check again can never sign a browser in and removes the notice | CONFIRMED | 004, 012 |
| 5 | Agent-only FORBIDDEN shown as expired link with advice that cannot work | CONFIRMED | 005, 010, 125 |
| 6 | Revoked agent: cached credential loops; re-grant refused; re-enrolment unclear | CONFIRMED on the server (re-enrolment is impossible); control-runtime half BLOCKED | 130, 134, 144 |
| 7 | Cursor Cloud acceptance is API-only after a restart during submission | BLOCKED: the unknown state could not be produced | 121 |
| 8 | Cancelled-before-submission execution accepts a verdict | CONFIRMED | 113 |
| 9 | HUB_UNAVAILABLE for a loopback endpoint advises a retry that cannot succeed | CONFIRMED (simulated on one machine); BLOCKED where a second computer was required | 015, 041, 028, 034 |
| 10 | `comment-delete` has no author check | CONFIRMED | 090 |
| 11 | Keep this comment offered to every viewer | CONFIRMED | 089 |
| 12 | Another person's My device invitation adopts the sponsor's identity | CONFIRMED | 016, 023 |
| 13 | Welcome Join form has no purpose check | CONFIRMED; your own Agent invitation is silently redeemed with no new Actor | 027, 124 |
| 14 | No warning when inviting from a client without `--public-url` | CONFIRMED | 015, 036, 041 |
| 15 | Handles shown nowhere in the browser; `@name` matches no Actor | CONFIRMED | 055, 070, 086, 095, 096 |
| 16 | Agent display names are harness IDs | REFUTED as worded: the name is "Setup agent" for everyone, a different defect (#150) | 093, 094, 095 |
| 17 | No visible "Notified" or delivery state | CONFIRMED | 091, 093, 096, 136 |
| 18 | Server mention matching skips the email-local check | CONFIRMED | 086 |
| 19 | Identity typo cannot be fixed; IDENTITY_EXISTS misleading; dotless email accepted | CONFIRMED | 014, 018, 019, 022 |
| 20 | Git note shown when Git supplied only a name | CONFIRMED (fixed in qf-6) | 013 |
| 21 | Member revocation needs the identity ID; Actor ID gives NOT_FOUND | CONFIRMED | 043, 140 |
| 22 | Revoked devices stay in Devices with no marker | CONFIRMED | 021, 043 |
| 23 | PORT_IN_USE (foreign) `--http-port` advice cannot take effect | MIXED: CONFIRMED for `pardner open --http-port`; REFUTED for `client serve --http-port` | 007, 012, 143 |
| 24 | `--http-port` silently ignored when already running | CONFIRMED | 002 |
| 25 | Stale connection file: `client status` raw error; `stop` calm; `client open` fails | MIXED: first two CONFIRMED; `client open` REFUTED (it restarts the service) | 009, 141, 143 |
| 26 | Bare token falls back to 8004 and silently becomes the wrong board | REFUTED: the fallback happens, but reads and writes are refused with misleading errors (F-127-01) | 127 |
| 27 | Malformed `client operation` / `bridge.json` JSON gives raw INTERNAL_ERROR | CONFIRMED (fixed in qf-1, qf-9) | 128, 132 |
| 28 | Revoked agent CLI sees people-oriented AUTH_REQUIRED copy | CONFIRMED (hub client; the replica gets a clearer REVOKED) | 130 |
| 29 | `bridge status` shows `running` after a crash | CONFIRMED | 131 |
| 30 | Standalone `actors register` has no first-Actor guidance | MIXED: REFUTED for the first Actor; CONFIRMED for later ones | 135 |
| 31 | Revoked project disappears from `client list`; no list of revoked IDs | CONFIRMED | 141 |
| 32 | Switcher labels stale; "unconfirmed change" next to "synced" | CONFIRMED | 028, 029, 030, 034, 035, 137, 139 |
| 33 | Open another project leads to Start/Join; failure screen has no switcher | CONFIRMED | 031 |
| 34 | Start resume notice during first Starting…; joins lose the textarea | CONFIRMED (the notice stays, not flashes) | 024, 028 |
| 35 | Start accepts a pasted invitation as a name; no rename/delete | CONFIRMED | 034 |
| 36 | Escape silent in a non-empty text field, closes from a select | CONFIRMED | 061, 068, 073 |
| 37 | New task draft memory-only; blocked storage gives no warning | MIXED: first part CONFIRMED; "no warning" REFUTED (a storage notice appears) | 061, 068, 073, 074 |
| 38 | New task has no Vein field; hidden new task gets no notice | CONFIRMED | 064, 065 |
| 39 | STALE_UPDATE "Your draft is preserved" on quick selects | CONFIRMED | 072, 098, 137 |
| 40 | Conflict values render as raw slugs, IDs and JSON | CONFIRMED | 077, 078, 084 |
| 41 | Issue link History rows read "recorded task.link-issue" | CONFIRMED (fixed in qf-3) | 079, 080, 084 |
| 42 | Mark all read counts own revisions; no unread badge on cards | CONFIRMED | 087 |
| 43 | Goals and veins filter excludes verdicts; Activity filters not persisted | CONFIRMED (the catalog's note that resolves go to Status changes was refuted) | 105, 100 |
| 44 | Mistyped `--goal` silently creates a goal | CONFIRMED | 097 |
| 45 | CLI `update` and `resolve` expect different revision shapes | CONFIRMED | 108 |
| 46 | You button no-op; People focus loss; offline avatar outline; reporter errors swallowed | MIXED: People focus and swallowed errors CONFIRMED; You button and avatar outline REFUTED | 020, 023, 049, 051, 056 |
| 47 | No agent presence reporter; `apiBase` must drop `/api` | CONFIRMED | 054 |
| 48 | Read T3 now before pairing looks like nothing happened | CONFIRMED | 110 |
| 49 | Status line still lists old qualified versions after acceptance | CONFIRMED | 117 |
| 50 | "Does not undo changes" only in the Cursor Cloud section | CONFIRMED | 114 |
| 51 | Credential-expiry warning has no link to the fix | CONFIRMED | 119 |
| 52 | Cloud agent field is free text; error mentions T3 | CONFIRMED | 121 |
| 53 | Threads cannot be unmapped or edited in the UI | CONFIRMED | 112 |

### Systemic patterns

| Pattern | Stories | Root cause | Issues |
|---|---|---|---|
| **People cannot tell Actors apart.** Every built-in agent is "Setup agent"; handles, Actor IDs and humanIds appear in mentions, conflicts, Control forms and CLI flags instead of names | 43 | Display names are not unique per owner, and no surface maps names to identifiers | #150, #134, #169, #173, #159 |
| **The UI reports states it does not know.** "Saved locally · synced" while pending or unknown; switcher and header disagree; `bridge status` says running after a crash; revoked looks like offline | 38 (with connection and recovery below) | Status labels are derived from cached or persisted observations, not current liveness | #146, #186, #175, #182 |
| **Advice that cannot work.** Retry for loopback invitations; `--http-port` while the probe has already failed; "join an Agent invitation" after revocation; `pardner client open` on agent-only devices; Goals empty-state command | 20+ | Error hints are written per code, not per situation | #162, #163, #153, #170, #161, #172 |
| **Stuck or lost recovery state.** A refused saved request blocks all writes; Control errors vanish within 2 s; outage banners duplicate retry buttons; CLI "not running" has five wordings | 38 (with the status pattern above) | Pending-operation handling treats only some codes as final; transport errors are not normalised in the CLI | #151, #157, #179, #164, #181 |
| **Membership lifecycle is CLI-only.** No browser revoke, no identity edit, no re-enrolment, revoked projects vanish, a My device invitation adopts another identity unseen | 22 | Identity and admission were built for agents first; no human management surface | #152–#156, #175 |
| **Invitations do not explain themselves.** No warning for loopback endpoints, history without who and when, Human vs My device confusion | 19 | The invite is created without validating where it will be used | #162, #183, #184 |
| **Control tab is an expert tool.** Raw IDs, jargon, unguided order, uneditable mappings, verdicts for runs that never ran | 12 | Forms mirror the API | #157, #158, #159, #176, #177 |

## 6. Visual consistency and flow

### Recurring geometry violations

Each row is one systemic defect seen on several screens.

| Defect | Where | Findings | Status |
|---|---|---|---|
| Long unbroken tokens (IDs, handles, names) wrap mid-token or overflow | Board header, conflict variants, mention chips, identity form | F-034-01, F-014-04, F-078-01, F-083-03, F-086-02, F-096-02 | F-014-04 fixed (qf-5); rest in #166, #169, #134 |
| Short labels wrap where they should not | "+N" avatar marker, "Waiting to be used" | F-052-01, F-034-04, F-036-03 | Fixed (qf-5); the expiry column now wraps instead |
| Phone width: header, nav and filters fill the first screen | Board at 390×844 | F-002-03, F-024-04, F-063-01, F-137-06, F-069-02 | #185 |
| Side panel covers board content | Columns, header controls, filter row | F-065-02, F-072-02, F-053-02 | #123 |
| Layout shift on view change or late data | View nav jumps ~25 px; "Here now" row inserted after open | F-064-04, F-058-01 | #188, #182 |
| Status colour contradicts meaning | Green for cancelled or held Control states | F-113-03, F-117-03 | #177 |
| Uneven spacing in Control settings | Large bands after h3; summary flush on h2 | F-110-03, F-112-02 | #177 |
| WebKit native selects render small | Board filters in Safari | F-012-04 | #188 |

### Flow friction

Stories with the largest gap between the ideal path and the walked path, from each report's Flow Log.

| Story | Ideal | Actual | Main hesitation or dead end |
|---|---|---|---|
| STORY-047 | 4 | 14, plus a permanent duplicate person | Human vs My device; recovery is CLI-only |
| STORY-018 | 3 | ~10 plus a terminal session | One click on "Continue" leaves no in-app way to link |
| STORY-016 | 3 | 9 | Wrong invitation type; Back discards the pasted text |
| STORY-028 | 3 | 9 | After reload nothing shows a join is pending; invitation re-pasted |
| STORY-086 | 3 | ~9 with a terminal detour | Handle needed from `client show` |
| STORY-064 | 5 | 9 plus CLI, needing two IDs the UI never shows | No Vein field; the new task vanishes under filters |
| STORY-012 | 6 | 9, plus 3 on day 2 | 60 s link lifetime unstated; port clash dead end |
| STORY-043 | 2 | 6 | No Remove in the profile; IDs copied from JSON |
| STORY-021 | 6 | 2 dead-end searches, a CLI detour, then 5 | No revoke UI; no confirmation |
| STORY-097 | 3 | 6+ | The suggested command fails for a person |
| STORY-141 | 2 | 5 | Revoked project missing from `client list` |
| STORY-127 | 1 | 5 | Invisible 8004 fallback |
| STORY-126 | 8 | 12 | CLI takes only IDs or handles |
| STORY-112 | 8 | 11 plus 3 failed round trips | Errors off-screen and gone in under 2.5 s |
| STORY-093 | 5 | 8 | `claim-next` cannot target a mention |
| STORY-004 | 2 | 4+ | Check again looks like a fix and is not |
| STORY-105 | 2 | 4 | No single filter for goal and vein changes |
| STORY-089 | 0 | trap; only escape is closing the tab | Refused saved request cannot be dismissed |
| STORY-090 | 3 | impossible for a human | No browser edit; CLI acts as the Setup agent |
| STORY-121 | 9 | not completable in the browser | Raw IDs shown nowhere in the UI |

### Cross-screen duplication

| Duplicated information or control | Stories |
|---|---|
| Sync state in header and switcher, often disagreeing | 026, 029, 030, 137, 139 |
| Two or more retry controls for one outage ("Retry connection", "Retry saved request", "Reload Pardner", "Read T3 now") | 006, 067, 085, 120, 143 |
| Presence in avatar ring, tooltip, profile heading, card and panel; the viewer appears in both the stack and the You button | 020, 048, 049, 052, 055, 058 |
| One handoff in five places (status line, comment, History, Activity, column move) | 091, 095 |
| Activity vs task History vs Evidence for the same event | 081, 082, 085 |
| Three entry points to a vein-filtered board with different side effects | 064, 099, 109 |
| Control hold text repeated up to three times | 113, 114, 117 |
| New invitation shown twice in one dialog | 015, 036 (fixed in qf-6) |

Flow and redundancy signals appear in far more than three stories. **Run `/ux-flow` next** for the simplification pass, starting with the identity and invitation journeys (STORY-016, 018, 047), recovery controls, and the catalog's Redundancy Candidates.

## 7. Top 5 recommendations

1. **Make every Actor identifiable by name.** Would improve 43 stories. Give each built-in agent a name that includes its owner, and accept and show names (with autocomplete for mentions) wherever handles or IDs appear today: pickers, conflicts, Control forms and CLI flags (#150, #134, #169, #173, #159).
2. **Report only what is known, and keep one recovery path per failure.** Would improve 38 stories. Show pending or unknown sync honestly, let people dismiss a refused saved request, keep Control errors visible near the form, return `CLIENT_NOT_RUNNING` from the CLI, and show one retry control per outage (#146, #151, #157, #164, #179, #181).
3. **Give people browser control of their membership.** Would improve 22 stories. Add remove and revoke for members, devices and agents; allow identity correction; show revoked state; make re-enrolment possible; and say plainly when a project's access was revoked rather than "not signed in" (#152–#156, #175, #170).
4. **Make invitations safe to send.** Would improve 19 stories. Warn before creating an invitation with a loopback endpoint, say whose identity a My device invitation carries, show who and when in history, and stop advising retries that cannot succeed (#162, #155, #183, #184).
5. **Replace advice that cannot work.** Would improve about 20 stories, including six currently failing (004, 007, 010, 012, 097, 130). Check each hint against the situation it is shown in: Check again, `--http-port`, "join an Agent invitation", agent-only advice and the Goals empty-state command (#172, #163, #153, #170, #161).

## 8. Stories still failing

No failing story changed status after the quick fixes. The fixes improved copy in several of them (004, 012, 014, 038, 045), but each still has an open high-severity finding or, for STORY-038, an unresolved one.

### Fail (38)

| Story | Title | Reason | Findings | Issues |
|---|---|---|---|---|
| STORY-004 | Reused or expired sign-in link | Check again can never sign the browser in | F-004-01 | #172 |
| STORY-005 | Signed out mid-session (server-side revoke) | Revocation shown as "not signed in"; revoked project vanishes | F-005-01, F-005-02, F-005-03 | #154, #170 |
| STORY-007 | PORT_IN_USE | Dev server on the port gives INTERNAL_ERROR; `--http-port` advice ineffective | F-007-01, F-007-02 | #163 |
| STORY-009 | `client status` / `client stop` | `status` after stop gives `INTERNAL_ERROR: fetch failed` | F-009-01, F-009-03 | #164, #179 |
| STORY-010 | Agent-only device opens a browser | Valid grant refused but shown as expired; advice fails there | F-010-01, F-010-02 | #170 |
| STORY-012 | Long first-day journey | Day 2 port clash is a dead end | F-012-01 | #163 |
| STORY-014 | No Git config, identity typed | Saved identity cannot be edited; dotless email accepted | F-014-01, F-014-02 | #156 |
| STORY-015 | Link a second laptop (My device) | Loopback invitation fails with retry advice | F-015-01, F-015-02, F-015-05 | #162, #155 |
| STORY-016 | Wrong kind of invitation on Link | Another person's My device invitation adopts their identity | F-016-01, F-016-02 | #155 |
| STORY-018 | Duplicate identity, then link | No in-app recovery after one Continue click | F-018-01, F-018-02, F-018-03 | #156 |
| STORY-021 | Lost laptop: revoke and re-link | No revoke UI; revoked device looks active | F-021-01, F-021-02 | #152, #175 |
| STORY-031 | "This project didn't open." | Real runtime failure shows a nameless page; Open another project loops back | F-031-01, F-031-02 | #167 |
| STORY-034 | Two-person onboarding | Long project name overflows header; pasted invitation becomes a project | F-034-01, F-034-02 | #166 |
| STORY-038 | Copy blocked, copy by hand | WebKit first click still does not select the invite text (re-verify: not resolved) | F-038-01 | qf-6, #183 |
| STORY-041 | Recipient on another computer | Loopback invitation dead end (simulated) | F-041-01 | #162 |
| STORY-043 | Remove a member from a leaked invite | No remove UI; revoked person cannot rejoin | F-043-01, F-043-04, F-043-02 | #152, #153 |
| STORY-045 | Retire a laptop and an agent harness | No retire UI; revoked harness cannot re-enrol | F-045-01, F-045-02 | #152, #153 |
| STORY-047 | Wrong invite type and recovering | Recovery is CLI-only and leaves a duplicate person | F-047-01, F-047-02 | #156 |
| STORY-054 | Agent shows Offline until presence | `apiBase` points too deep; no CLI reporter | F-054-01, F-054-02 | #171 |
| STORY-055 | Collaborative morning | `@Name` mentions reach no one | F-055-01 | #134 |
| STORY-059 | Fill every field on a new task | Two identical "Setup agent" assignees | F-059-01 | #150 |
| STORY-064 | Vein filter, then create a task | New task cannot be put in the vein; it vanishes under filters | F-064-01, F-064-02 | #119, #113 |
| STORY-078 | Assignee or tags conflict | Raw Actor IDs and JSON as choices | F-078-01, F-078-02 | #169 |
| STORY-083 | Operation integrity conflict | Retry fails forever; conflict has no action | F-083-01, F-083-02, F-083-03 | #151, #169 |
| STORY-086 | @mention by name | Mentioning by name is effectively impossible | F-086-01 | #134 |
| STORY-089 | Non-author Keep this comment | FORBIDDEN leaves the tab stuck | F-089-01, F-089-02 | #151, #160 |
| STORY-090 | Edit or delete a comment | Any Actor can delete any comment | F-090-01, F-090-02 | #160, #150 |
| STORY-091 | Hand off to a reviewer | Two identical "Setup agent" recipients | F-091-01 | #150 |
| STORY-095 | Full mention, work, handback loop | Delegation target is a coin flip | F-095-02 | #150 |
| STORY-097 | Empty Goals, seeding from CLI | Suggested command fails for the person | F-097-01, F-097-02 | #161 |
| STORY-102 | Conflicting goal edits | Activity rewrites renames under the current title | F-102-01 | #168 |
| STORY-111 | Pair T3, mistyped code | Error wiped by the next poll | F-111-01, F-111-02 | #157 |
| STORY-112 | Control full first run | Validation errors off-screen and cleared | F-112-01 | #157 |
| STORY-113 | Withdraw a follow-up | Verdict accepted for work that never ran | F-113-01 | #158 |
| STORY-121 | Cursor Cloud context | Raw IDs required that the UI never shows | F-121-01, F-121-02 | #159 |
| STORY-130 | Revoke an agent | Re-enrolment impossible; revoked agent looks offline | F-130-01, F-130-02 | #153, #175 |
| STORY-140 | Creator revokes a member | Revoked member sees the signed-out screen | F-140-01, F-140-02, F-140-04 | #154, #152 |
| STORY-142 | Cold backup and restore | Two copies of one identity can run | F-142-01 | #165 |

### Blocked (5)

| Story | Title | Why blocked | Findings from the walkable parts |
|---|---|---|---|
| STORY-008 | Slow or failing start | No honest way to make storage slow without changing code or mounting a slow filesystem, so CLIENT_START_TIMEOUT and dependent steps could not be reproduced | F-008-01, F-008-03 (#181), F-008-04 (#164) |
| STORY-131 | Attach a Codex bridge | No Codex App Server: the real `codex` would start model turns on the user's account, and the repo's stand-in lacks `thread/read`. Live dispatch was not walked | F-131-01 (#174), F-131-02 (#186) |
| STORY-133 | Reconcile an uncertain dispatch | An `uncertain` row needs a dispatch whose response is lost, which needs an App Server | F-133-01 (fixed, qf-9) |
| STORY-134 | Control runtime guarded CLI and wrappers | Needs a sealed control installation started by launchd; the walker did not touch launchd or the user's control home | F-134-01, F-134-02 (fixed, qf-10) |
| STORY-144 | Control runtime start, status, open, stop | `start`, `stop`, `status` and `open` all go through a launchd job label owned by the user's real control runtime | F-144-01, F-144-02 (fixed, qf-10) |

## 9. Run statistics

| Metric | Value |
|---|---|
| Stories walked | 146 of 146 (78 flagged stories first) |
| Pass / fail / blocked | 103 / 38 / 5 |
| Findings | 461 (42 high, 163 medium, 222 low, 34 suggestion) |
| Findings per story | 3.2 |
| Flagged claims checked | 53: 42 confirmed, 8 mixed, 2 refuted, 1 blocked |
| Quick-fix units merged | 10 of 10 (65 findings, 42 stories) |
| Fix success rate | 54/65 findings resolved (83%); 64/65 resolved or partly resolved (98%) |
| Issues | 39 new (#150–#188), 17 existing issues updated |
| Report-only findings | 40 |
| Elapsed time | About 2.5 h from the walk plan (19:00 UTC) to the run-history entry (21:30 UTC), with walkers in parallel; re-verification followed |
| Throughput | About 1 story per minute across parallel walkers |
| Verification | `npm run verify` passed (724/724 tests, UI build, one acceptance seed); 20-seed acceptance qualification not run |

### Run history

| Run | Date | Catalog | Walked | Re-verified | Passed | Failed | Blocked | Fixes | Issues |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 2026-11-09 | client mode (146) | 146 | 42 | 103 | 38 | 5 | 10 | 39 new, 17 updated |
| 3 | 2026-11-07 | retired (138) | 0 | 11 | — | — | — | 0 | 1 |
| 2 | 2026-11-07 | retired (138) | 77 | 0 | — | — | — | 0 | 8 |
| 1 | 2026-11-07 | retired (138) | 61 | 8 | 53 | 7 | 1 | 10 | 14 |

Runs 1–3 used the retired catalog, so their story numbers and pass counts are not comparable with run 4.

---

*Generated by `/ux-walker` Phase 4, 2026-11-09.*
