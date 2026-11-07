# UX Walker Report — 2026-11-07

## Run Metadata
| Field | Value |
|---|---|
| Date | 2026-11-07 |
| Target | Local Pardner hub UI at `/pardner/`, each batch on its own seeded private hub (ports 8310–8379) |
| Branch / base | `ux-skill-pack-run` (base `e9331731`, which is **behind `main`**; re-check each finding on `main`) |
| Browser driver | Playwright 1.62.1 Chromium at 1440×900, with a 390×844 check per story (`agent-browser` is not installed on this machine) |
| Stories walked | 61 (every `browser` and `browser+cli` story in the catalog) |
| Stories skipped | 77 (`multi-service` and `cli-only`: replicas, hub outages, LAN restarts, bridge) — listed in `walk-plan.json` under `deferred` |
| Re-verified after fixes | 8 stories' fixed findings (STORY-013, 015, 023, 034, 035, 042, 107, 112) |
| Status | 53 pass · 7 fail · 1 blocked |

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

Per-story evidence is under [`stories/`](stories/): `walk-report.md`, `findings.json`, screenshots and videos for each story.

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

Regression assertions for the first five were added to `test/pardner-ui.test.js`. Fix reports: [`fixes/`](fixes/). Browser re-verification (all confirmed): [`reverify/`](reverify/).

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
