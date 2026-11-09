# UX Walker Report — 2026-11-07

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`). People now open the board only through the local
> client (`pardner open`), and phones pair through the client's **Pair a phone**
> companion; see the [client guide](../PARDNER-CLIENT.md) and the
> [phone companion guide](../PARDNER-LAN.md). The findings and evidence below are
> kept unchanged.

> **Evidence archived.** Screenshots, per-story and per-page reports from this run were moved out of the repository; the findings below stand on their own text, and filed issues carry the details.

## Run Metadata
| Field | Value |
|---|---|
| Date | 2026-11-07 |
| Target | Local Pardner hub UI at `/pardner/`, each batch on its own seeded private hub (ports 8310–8379) |
| Branch / base | `ux-skill-pack-run` (base `e9331731`, which is **behind `main`**; re-check each finding on `main`) |
| Browser driver | Playwright 1.62.1 Chromium at 1440×900, with a 390×844 check per story (`agent-browser` is not installed on this machine) |
| Stories walked | **138 of 138**. Pass 1: 61 browser stories. Pass 2: the 77 multi-service and cli-only stories, using real replicas, hub outages, LAN pairing and CLI flows |
| Stories skipped | 0. STORY-093 is blocked (the host's IP can't safely change mid-run). STORY-107 was blocked in pass 1 |
| Re-verified after fixes | 8 stories' fixed findings (STORY-013, 015, 023, 034, 035, 042, 107, 112) |
| Status | **130 pass · 8 fail · 0 blocked** (after the re-verify run at `a0d307c7`) |

## Findings Summary
| Severity | Count |
|---|---|
| Critical | 0 |
| High | 28 |
| Medium | 117 |
| Low | 124 |
| Suggestion | 8 |
| **Total** | **277** |

| Category | Count |
|---|---|
| happy-path | 60 |
| error-handling | 59 |
| flow | 37 |
| consistency | 29 |
| hierarchy | 26 |
| layout | 21 |
| disclosure | 17 |
| simplicity | 13 |
| visual | 10 |
| a11y | 5 |

Per-story evidence (walk reports, findings, screenshots and videos) was archived outside the repository.

## Quick Fixes Applied (10)
| Finding | Before | After | Files |
|---|---|---|---|
| F-042-01 (+F-003-05, F-009-02, F-044-03, F-128-04) | Board filters shown on Goals and Activity, where they do nothing | Filters render only on Tasks; stored values kept | `ui-prototype/src/Pardner.jsx` |
| F-013-05 (+F-004-05, F-049-04) | Priority options `p0`–`p3` but cards show `P0`–`P3` | Options read P0–P3; values unchanged | `Pardner.jsx` |
| F-034-05 (+F-027-06, F-040-03) | Add comment enabled for blank text (server 400); Hand off relies on native validation | Both disabled until the trimmed text is non-empty | `Pardner.jsx` |
| F-112-01 (+F-013-03) | Whitespace-only title sent to the service, error shown at the page bottom | Inline "Enter a title that is not only spaces." at Title; nothing is sent | `Pardner.jsx` |
| F-023-04 | New task opens with focus on Close | Title field focused | `Pardner.jsx` |
| F-034-03 | Bold text in comment bodies 14px inside 16px text | `.comment > strong` scopes the author style; body bold is 16px | `ui-prototype/src/pardner.css` |
| F-017-03 / F-035-03 | "Mark displayed comments read" at 12–13px | Shared 16px button size | `pardner.css` |
| F-015-04 / F-047-03 / F-104-03 | Single filtered column flanked by grey slabs that look disabled | Unused area uses the page background | `pardner.css` |
| F-107-03 | With JavaScript off, the shell still shows "Opening your workspace…" and Reload | `<noscript>` style hides both | `ui-prototype/index.html` |
| (test) | `pardner-ui.test.js` read Alice's unread count once and raced the live update | Waits for "1 unread for alice" | `test/pardner-ui.test.js` |

Regression assertions for the first five were added to `test/pardner-ui.test.js`. Fix reports and browser re-verification (all confirmed) were archived with the evidence.

**Not merged: F-001-02 (redirect `/` to `/pardner/`).** The fix worked and its test passed. It is held back because editing `automerge-sync-server.js` changes the source hash pinned in `formal/lifecycle/mapping.json`, which fails the lifecycle drift check. Accepting that drift requires reviewing the lifecycle model, which is a decision for the maintainer. It is tracked under #116.

## Issues Filed
14 new issues (#121–#134). Another 24 findings map to issues that were already open: #112, #113, #114, #116, #117, #118, #119 and #60. See [`issues-filed.md`](issues-filed.md).

| Issue | Severity | Title |
|---|---|---|
| #121 | high | Unsaved drafts are silently discarded by Escape, Actor switch or opening another card |
| #122 | high | Forget this workspace on the opening screen throws a ReferenceError (D1) |
| #123 | high | Task side panel covers the header Actor select and New task button |
| #124 | high | Markdown task lists and tables render broken in Task details |
| #125 | high | A mistyped token is reported as "The service credential changed" |
| #126 | high | First-Actor notice is not runnable; bootstrap `--actor` rule unexplained |
| #127 | high | CLI without the right data directory reports Unauthorized |
| #128 | high | Comments cannot be edited or deleted from the browser |
| #129 | high | Deleting a comment leaves its text in Activity output (not redaction) |
| #130 | high | `vein create --goal <existing title>` silently duplicates the goal |
| #131 | high | Goals view says "Ready for a verdict" but cannot record one |
| #132 | high | `PARDNER_ACTOR` silently filters `pardner activity`/`timeline` |
| #133 | high | Activity unusable at scale: no filters, paging or targets |
| #134 | medium | @mentions of unknown handles fail silently; no autocomplete |

## UX Audit Summary
- **Data loss through ordinary gestures is the top systemic risk.** Escape, switching Actor, clicking another card and Forget all discard work without warning. Six stories hit this independently (#121, #114).
- **The browser reads more than it writes.** Comments can't be edited or deleted, verdicts and goal status can't be recorded, and veins can't be linked or reordered from the UI. Each of these sends a human to the CLI and hand-copied revision JSON (#128, #131, #119).
- **Error copy is generic and often misattributed.** "The service credential changed" appears for a typo or cleared storage. "Check that the service is running" appears under errors where the service is fine. "Your last confirmed data remains available" appears after validation errors.
- **Audit surfaces expose storage internals.** Raw op names, `order: null → 1794…`, Actor IDs and JSON-escaped strings appear, and History and Activity disagree with each other (#118).
- **Visual layer is solid.** No horizontal overflow at 1440 or 390 in any story, no console errors except deliberate 4xx responses, and live updates arrive in about 0.1–1.5s. The geometry audit's recurring hits were false positives: content-sized workspace buttons and intentionally multi-line task cards.

## Visual Consistency & Flow
- **Recurring geometry:** none that matter (see above).
- **Recurring layout:** the fixed side panel covers half the board, the header Actor select and New task (#123). On 390px phones, chrome and filters take 70–77% of the first screen (#113, #114).
- **Duplicated information:** SaveStatus is shown twice when a panel is open; History repeats Comments and Evidence; the vein name appears in the filter and on every card.

**Flow friction (worst cases):**

| Story | Steps actual / ideal | Main friction |
|---|---|---|
| STORY-062 STALE_UPDATE | 8 / 4 | Retry can never succeed; draft must be re-typed |
| STORY-030 review and close | 8 / 4 | Hand off form above comments; close needs Edit task |
| STORY-049 record a verdict | browser → CLI | No verdict control |
| STORY-001 first run | 14 / 7 | Root URL JSON; pairing form first on loopback |
| STORY-134 find one approval | Unbounded | No filtering; CLI `--limit 200` misses it |

Flow and redundancy signals appear in far more than 3 stories. `/ux-flow` has already run; see [`../ux-flow/report.md`](../ux-flow/report.md).

## Top 5 Recommendations
1. Protect unsaved drafts: guard Escape in fields, confirm or keep drafts on Actor switch and card clicks, and confirm Forget (#121, #114).
2. Fix D1 and the misattributed credential and storage errors on the opening screen (#122, #125).
3. Stop the side panel covering the header; reflow the board or offset the panel (#123).
4. Give the browser write paths for comments, verdicts and veins (#128, #131, #119).
5. Make Activity useful at scale: filters, targets for vein, goal and Actor entries, and humanised rows (#133, #118).

## Stories Still Failing
| Story | Reason | Findings |
|---|---|---|
| STORY-008 | Actor switch discards Comment and Handoff drafts | F-008-01 → #121 |
| STORY-014 | Closing New task or clicking a card discards the draft | F-014-01 → #121 |
| STORY-036 | Side panel blocks the Actor select; step 3 can't be done as written | F-036-01 → #123 |
| STORY-096 | D1: Forget from the opening screen raises a ReferenceError | F-096-01 → #122 |
| STORY-132 | Vein, goal and actor Activity entries have no destination | F-132-01 → #133 |
| STORY-134 | Long Activity can't be filtered; CLI fallback misses the record | F-134-01 → #133 |
| STORY-136 | A deleted comment leaves no trace in the UI; text persists in CLI output | F-136-01 → #129 |
| STORY-107 (blocked) | A missing `dist` was not reproduced, to avoid deleting the shared build | F-107-01 → #116 |

## Run Statistics
- 7 parallel walker batches of about 12–16 minutes each; 61 stories in about 16 minutes of wall-clock time (about 3.8 stories per minute).
- 10 of 10 quick fixes merged and verified in the browser. 1 additional fix (F-001-02) was held back, as described above.
- `npm run test:ui`: 10/10 pass after the fixes.
- `npm run verify` stops at the control-runtime step because this machine runs Node 24.22.1 and that step requires 24.11.1. The full `node --test` suite, run separately, passes 358/358.


## Second pass: the 77 multi-service and cli-only stories

Walked at HEAD `5be1448f`, after the ux-visual and ux-auto-improve changes. Each batch ran its own hub, replicas or LAN services on private ports (87xx–88xx):

- **Replica conflicts:** two or three replicas, hub stopped and restarted, so the conflicts are real.
- **Offline:** genuine hub outages and service restarts.
- **LAN pairing:** a real `en0` LAN address, with a 390×844 mobile browser context standing in for the phone.
- **Agent CLI:** the bridge ran against a local Codex app server with no login, so no model ran.

| Batch | Stories | Result | Findings (H/M/L/S) |
|---|---|---|---|
| H1 agent CLI | 024, 025, 026, 029, 039, 117, 118, 119, 127 | 9 pass | 1/14/18/2 |
| H2 power CLI | 055, 057, 106, 114, 121, 124, 125, 126 | 8 pass (126 partly walked) | 4/14/7/1 |
| I conflicts | 053, 054, 058–061, 064–066 | 9 pass | 1/9/10/1 |
| J conflicts + audit | 056, 067–071, 115, 123, 135, 137, 138 | 11 pass (115's premise can't happen any more) | 2/15/14/0 |
| K offline/sync | 072–083 | 12 pass | 3/15/13/2 |
| L LAN pairing | 020, 041, 084–095 | 13 pass, 093 blocked | 1/15/14/1 |
| M credentials/errors | 007, 012, 097–101, 103, 105, 108, 109, 111, 113, 116 | 12 pass, 097 and 111 fail | 3/19/12/1 |

**Totals across both passes:** 498 findings (43 high, 218 medium, 221 low, 16 suggestion).

**New issues filed (#140–#147):**
- **#140:** a lost CLI response gives no operation ID, so a retry duplicates the write.
- **#141:** the bridge accepts a human Actor and drains that person's mentions.
- **#142:** list filters accept invalid values and return an empty success.
- **#143:** goal and vein conflicts can't be resolved in the browser.
- **#144:** a disallowed origin or bind host blocks the app bundle, and the error advises a rebuild.
- **#145:** a lost write response blocks every edit even though the change landed.
- **#146:** "synced" is shown when sync is unknown or pending.
- **#147:** pairing codes go invalid silently while the dialog keeps showing them.

**Evidence added to existing issues:** #127 (an unreachable service gives an opaque CLI error) and #114 (Forget discards a pending write).

**No quick fixes this pass.** The run had already used its 10-fix cap.

**Confirmed fixed since pass 1:** STORY-098's predicted crash (the D1 bug, #122) did not reproduce; V3 fixed it. Errors now appear inside the panel above the form's buttons, and "Mark all read" and the comment changes from round 2 were observed in passing.

**Still failing:**
- **STORY-097:** Forget discards a pending write (#114).
- **STORY-111:** an origin that isn't allowed never loads the app (#144).
- **Pass-1 failures not re-walked:** 008, 014, 036, 096, 132, 134 and 136. Several are probably fixed by V1–V5 and rounds 1–3 (for example 132 and 134 by the round 1 Activity work, and 036 by V2/V4). Re-verify with a `/ux-walker` re-run.

**Hygiene.** One throwaway rotated token in `STORY-109/walk-report.md` was redacted before commit. Delivery claim tokens and Automerge heads from deleted test hubs remain in CLI captures; they are not credentials for anything that still exists.


## Re-verify run (`/ux-walker` re-invoked at `a0d307c7`)

**Scope.** The 11 stories whose last status was fail or blocked. All 127 passing stories were skipped under the run-history rules. No quick fixes were made, and 1 issue was filed.

| Story | Before | Now | Notes |
|---|---|---|---|
| 096 | fail | **pass** | The opening-screen Forget crash (#122) is gone |
| 132 | fail | **pass** | Activity rows now name and link veins and goals (round 1) |
| 134 | fail | **pass** | 1,117 operations, with filters, counts and paging. Reviewer + Status filter finds the one approval |
| 107 | blocked | fail | Walked for real against a clone with no build. A missing build still returns raw 401 JSON (#116) |
| 093 | blocked | fail | The address change was simulated with a Node preload, without touching the host network. Steps 7–9 are still blocked, because no second address can be bound without sudo |
| 008 | fail | fail | Switching Actor still discards drafts (#121). Own-comment unread is fixed |
| 014 | fail | fail | The New task draft is still lost (#121) |
| 036 | fail | fail | The panel covers the Actor select (#123) |
| 097 | fail | fail | Forget drops the pending write (#114), and the status line says "synced" while a write is pending (#146) |
| 111 | fail | fail | The bundle is rejected for a disallowed origin (#144) |
| 136 | fail | fail (partial) | Who deleted a comment, and when, is now visible. The deleted text is still CLI-only |

**New issue.** #148: Activity follow-ups.

**Evidence added to existing issues.** #144, #137 and #114.
