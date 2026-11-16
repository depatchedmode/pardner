# UX Visual Report — 2026-11-07

> **Superseded browser entry.** This record describes the standalone browser
> board (local service token screen, Actor picker, Pair another device, Forget this
> workspace, `PhoneAccess`). People now open the board only through the local
> client (`pardner open`); see the [client guide](../PARDNER-CLIENT.md). Phone
> access is not currently offered; it is planned through the hub over HTTPS. The
> findings and evidence below are kept unchanged.

> **Evidence archived.** Screenshots, per-story and per-page reports from this run were moved out of the repository; the findings below stand on their own text, and filed issues carry the details.

## Summary
| Metric | Value |
|--------|-------|
| Surfaces audited | 6 inspections covering 7 surfaces (connection, board and shell, Task details, New task, Goals, Activity, pairing dialog) × 4–7 states each × 4 viewports (1440, 1920, 768, 375), about 400 screenshots |
| Coverage gaps | Task-field conflicts (needs a second replica); the real missing-UI-build state; 4 pairing-dialog states simulated by route interception; external second opinions skipped (no `OPENROUTER_API_KEY`); judging by one independent agent instead of a 3-agent panel plus external judges |
| Findings | P0 0 · P1 27 · P2 64 · P3 30 (121) |
| Clusters | 12 found · 5 implemented · 7 deferred |

## Implemented
### V5: User-authored Markdown gets its own subordinate scale
- **Problem:** description `##` rendered at the task-title size (20/700) and `###` at the section-heading size. Task lists broke: 44px checkbox boxes sat on their own line, with bullets left alone. Tables had no borders and 1px padding (#124).
- **Decision:** scoped `.markdown` rules (A) plus prose type tokens grafted from B. Chosen over a full type-token restyle (B, which is the deferred V6) and a markdown-body convention (C).
- **Result:** headings run 16/15/14/14 with h3 and h4 muted; blockquote rule; checkboxes inline at 13px; tables have borders and scroll inside `.md-table`; code shows a scroll shadow only when it overflows. All 7 criteria pass, and #124 is fixed on this branch.
- **Before / after:** `pages/p3-task-details/shots/375x812-rich.png` → `verification/shots/v5-375x812-rich.png`.
- **Commit:** `0488eda2`.

### V1: The app frame stops scrolling; regions scroll
- **Problem:** at 1440 the long board scrolled the page 1668px, and Activity scrolled about 36,000px. Header, nav and **New task** scrolled out of view.
- **Decision:** a viewport-height flex column on desktop, with `main`, columns and the board scrolling inside it and sticky column headings. Phones keep document scroll but lock it behind open panels. Chosen over a grid-region shell (B: more DOM churn) and a Trello-style frame (C: wheel mapping steals trackpad scroll).
- **Result:** document scroll is 0 on every view at 1024×700, 1440×900 and 1920×1080. Chrome stays visible. Seed positions are unchanged to the pixel. All 5 criteria pass.
- **Regression found and fixed:** cards bled around the sticky heading (`e16fb54d`).
- **Before / after:** `pages/p2-board/shots/1440x900-long-full.png` → `verification/shots/v1-1440x900-tasks*.png`.
- **Commits:** `6e863b61`, `e16fb54d`.

### V2: No mid-width overflow; panels never leave a sliver
- **Problem:** between 761 and 867px wide the nav forced a horizontal page scroll of up to 107px. At 768 the side panel's **Close** sat off screen, and a long vein title widened its select by 225px.
- **Decision:** shrinkable filters grouped by a single auto margin, a full-width panel below 840px, and a `title` on the Vein select. Chosen over a wrapping toolbar row (B) and a Filters popover with chips (C).
- **Result:** 214 width × vein checks with 0 overflows. **Close** sits at x=742 at 768. The visible board strip is 0px or at least 160px. All 4 criteria pass.
- **Commit:** `e0544103`.

### V3: Errors appear where the work is
- **Problem:** form and operation errors appeared in a fixed full-width bar at the bottom of the page. At 1920 that was 1239px from the form; at 375 it covered **Save changes** and **Cancel edit**. Notices used the error's red rule. Connection errors rendered below both forms, off screen.
- **Decision:**
  - The existing `ErrorNotice` is routed by operation origin into the slot above the failing form's actions.
  - Page-level errors render in normal flow, and the fixed bar is deleted.
  - Errors can be dismissed only when no request is pending; a pending request always keeps **Retry saved request** (local-first durability).
  - Field errors are compact, and tone tokens are added.
  - Connection errors render inside the form that failed.

  Chosen over a new Message component (B) and a Primer/Atlassian-style split (C).
- **Result:** all 5 criteria pass. Retry replays exactly once. The implementer also found the root cause of D1/#122: `forget()` called `showBoard` before it was declared on the opening screen. It is fixed.
- **Commit:** `27137884`.

### V4: Focus moves into panels and comes back
- **Problem:** opening a panel left focus behind it. Escape, Edit task and pairing actions dropped focus to `<body>`. Nothing marked the open card.
- **Decision:** targeted opener tracking and restore, a once-per-open heading focus, edit-flow return focus, `aria-current` on the open card, dialog invoker restore, and token-field autofocus. Chosen over hooks plus `inert` (B) and native `<dialog>` panels (C), which would fight V1 and #121.
- **Result:** all 7 criteria pass. A post-verification timing race, where the deferred refocus could take focus back from the Actor select, was fixed in `0bd21c38`.
- **Commits:** `1194acb5`, `0bd21c38`.

**Tests:** `test/pardner-ui.test.js` and `test/pardner-phone.test.js` gained 14 Chromium and WebKit tests; each was seen failing before its change. A new helper, `support/ui-workspace.js`, supports them. `npm run test:ui` passes 24/24. The full `node --test` passed 372/372 after V4, and `test:runtime` and `test:cli` passed.

## Deferred
| Cluster | Severity | Why deferred | Issue |
|---------|----------|--------------|-------|
| V6 Spacing and type scales; tool-surface density | P1/P2 | Foundational redesign across every surface | #135 |
| V7 Goals/Activity gutter, vein links, status pills | P2 | Builds on V6 tokens | #136 |
| V8 Pairing dialog actions and diagnostics | P1 | LAN lifecycle semantics | #137 |
| V9 Connection screen copy and error lifecycle | P1/P2 | Copy belongs to existing issues | #125, #116 |
| V10 Task details section order (composer 4045px down) | P1 | Already decided | #111, #115 |
| V11 Board column set, empty and single-status states | P2 | Needs a product decision | #138 |
| V12 New task form details | P1/P2 | Medium; overlaps #123/#121 | #139 |

## Still failing or unverified
- Tab can still reach controls behind an open panel. This is a WCAG 2.4.11 gap and the `inert` follow-up.
- Two alerts can still coexist in rare cases: a Task details context-load failure at the same time as an operation error.
- `npm run verify` stops at the control-runtime step on this machine's Node 24.22.1; it requires 24.11.1. The 20-seed acceptance gate was not run.

## Excellent as is
- Keyboard focus ring: 2px accent with a 3px offset everywhere.
- 44px touch targets and 16px inputs on phones.
- No low-contrast text anywhere.
- Self-healing reconnect.
- The stale-handoff notice, which is the pattern #112 should copy.
- Native pairing `<dialog>` sizing with internal scroll.
- Copy feedback and in-place QR regeneration.
- The phone `#pair=` link auto-pairs.
- Goal ordering, and statuses always shown in words.
