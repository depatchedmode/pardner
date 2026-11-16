# UX Visual Problem Register — 2026-11-07

> **Evidence archived.** Screenshots, per-story and per-page reports from this run were moved out of the repository; the findings below stand on their own text, and filed issues carry the details.

Built from the six page audits (archived outside the repository) (121 findings: 0 P0, 27 P1, 64 P2, 30 P3). Single reviewer per page; second opinions skipped (no `OPENROUTER_API_KEY`).

**Coverage against [`inventory.md`](inventory.md):** every page (P1–P7) and layout (L1–L4) was audited at all four viewports. Gaps:
- Task-field conflicts (they need a second replica).
- The real "missing UI build" state.
- Two-interface, no-interface, 500 and offline dialog states were simulated with route interception, not produced live.

**Ranking:** severity × reach × centrality ÷ effort. Clusters already decided by `/ux-flow` or filed by `/ux-walker` are not re-argued; where a cluster touches one, the issue is cited.

## Carried forward (5)

### V1 — The app frame scrolls the document instead of its regions (P1)
- **Root cause:** `body` is the scroll container. The header is static, `.board` has `min-height: 65vh`, and columns have `overflow-y: visible`. Side panels don't lock background scroll.
- **Findings:** P2-01, P5-14, P2-08, P3-21, part of P4-06.
- **Surfaces:** Board (long content: page scrolls 1668px at 1440), Activity (a 37,085px page loses nav and **New task**), Goals (240px scroll at 1440), phone panels (background scrolls 308px).
- **Reach:** every workspace view. **Centrality:** core.
- **Acceptance criteria:**
  1. At ≥1024×700 the document never scrolls on Tasks, Goals or Activity (`scrollingElement.scrollHeight <= innerHeight + 1`).
  2. Header and nav stay visible after scrolling content.
  3. On the board, columns scroll vertically inside themselves, and the board scrolls horizontally inside itself when it is narrower than its columns.
  4. With a side panel open at ≤760px, the page behind does not scroll.
  5. Seed-data layouts at 1440, 1920 and 375 are otherwise unchanged.

### V2 — Mid-width breakpoint gap: nav overflow pushes fixed panels off screen (P1)
- **Root cause:**
  - Nav plus filters need 868px.
  - Between 761 and 867px the row doesn't wrap, so the layout viewport widens.
  - The fixed `right: 0` panel then anchors to 868px, which puts **Close** off screen at 768.
  - Filters use `margin-left: auto` per label and size to their content.
- **Findings:** P2-02, P3-01, P2-04, P2-05, part of P4-06 (88px sliver).
- **Surfaces:** 768×1024 (iPad portrait) on every workspace view and panel.
- **Acceptance criteria:**
  1. No horizontal page overflow at any width from 320 to 1920 on the board, with seed and long vein names (`scrollWidth <= innerWidth`).
  2. At 768×1024 the side panel's **Close** sits fully inside the viewport.
  3. Filters form one visual group with stable widths: a long vein title truncates instead of widening its select.
  4. The panel never leaves a clipped sliver of board under 160px; below that width it goes full-width.

### V3 — One contextual message component: errors appear where the work is, not in a page-bottom banner (P1)
- **Root cause:**
  - A single `.error` class serves the page banner, inline field errors and card errors.
  - The workspace `ErrorNotice` is a fixed full-width bottom bar, far from the form that failed.
  - `.notice` inherits the error's red rule.
  - Messages always append "Your last confirmed data remains available."
- **Findings:** P4-02, P3-04, P4-04, P3-16, P7-06, P1-22, P1-03, P1-05 (stale error after Forget), plus P4-01/P1-01 copy, which belongs to #125.
- **Surfaces:** New task, Task details edit, connection screen, pairing dialog.
- **Acceptance criteria:**
  1. An operation error raised while a side panel is open renders inside that panel, next to the form's actions, and never covers **Save changes** / **Cancel edit** at 375.
  2. Inline field errors are compact: attached to the field with `aria-invalid`, and inserting one shifts layout by ≤ 1 line.
  3. Warning, notice and error have distinct, tokenised treatments (border, colour); the notice no longer uses the error's red.
  4. Errors can be dismissed, and are cleared when the form they belong to is cancelled or closed.
  5. On the connection screen, the error renders next to the form that failed and is scrolled into view.

### V4 — Focus management for panels and dialogs (P1, accessibility)
- **Root cause:** panels are plain `<aside>` elements. Opening one doesn't move focus into it; closing one doesn't restore focus to the opener. Controls that unmount (e.g. **Edit task**) drop focus to `<body>`. Tab escapes into obscured background controls.
- **Findings:** P3-03, P4-12, P7-05, P1-04, P1-20, P2-14.
- **Acceptance criteria:**
  1. Opening Task details or New task moves focus to the panel heading (or the first field for New task).
  2. Closing either panel by Close or Escape returns focus to the control that opened it, when it still exists.
  3. **Edit task** moves focus to the Title field; **Save changes** and **Cancel edit** return focus to **Edit task**.
  4. The open card carries `aria-current` and a visible selected style.
  5. In the pairing dialog, focus stays on (or returns to) a meaningful control after Enable, Generate new code and Save network, not `<body>`.
  6. On the connection screen, the first usable field is focused on arrival on loopback.

### V5 — User-authored Markdown needs its own typographic scale (P1)
- **Root cause:** Markdown inside descriptions and comments inherits global element styles. `##` matches the task title, `###` matches panel section headings, blockquotes are unstyled, task-list items break (#124), tables have no borders or padding (#124), and mentions are plain text.
- **Findings:** P3-05, P3-06, P3-17, P3-18, F-013-01, F-017-01 (#124).
- **Acceptance criteria:**
  1. Inside `.markdown`, h1–h3 render smaller than the panel title (20px) and section headings (17px), with a clear but subordinate scale.
  2. Blockquotes have a left rule and muted colour.
  3. Task-list items show the checkbox inline before the text on the same line, with no geometry spill.
  4. Tables have cell borders and ≥ 6px×10px padding.
  5. Code blocks show a scroll affordance.
  6. Applies identically to descriptions and comments.
  7. Resolves #124.

## Deferred (filed as issues)
| ID | Cluster | Findings | Why deferred |
|---|---|---|---|
| V6 | No spacing or type scale; tool surfaces too sparse (cards 103–171px, comments 132px, activity rows 109–154px) | P2-11, P2-15, P2-16, P3-09, P3-13, P3-14, P4-14, P1-17, P5-13, P5-16, P7-15 | A foundational token and density redesign across every surface; too big to land and verify alongside V1–V5. V1–V5 add the first tokens it should build on |
| V7 | Goals/Activity content column misaligned; vein links styled as buttons; status pills don't differ | P5-01–P5-06, P5-11, P5-12, P2-20 | Medium. Depends on V6 tokens |
| V8 | Pairing dialog state and security actions | P7-01, P7-02, P7-03, P7-08, P7-10, P7-12 | Touches LAN lifecycle semantics. The local-first contract applies (STORY-084 / #116) |
| V9 | Connection screen copy and error lifecycle | P1-01, P1-02, P1-07–P1-11, P1-18, P1-19 | Mostly copy and state; overlaps #125 and #116 |
| V10 | Task details section order; composer 4045px down | P3-02, P3-08, P3-10, P3-15 | Decided in #111 / #115 |
| V11 | Board column set, empty and single-column states, mobile snap | P2-09, P2-10, P2-13, P2-19, P2-24 | Design-level; needs a product decision on finished columns |
| V12 | Form details: Actor context, required-field consistency, title/description sizing, busy state, Cancel/footer | P4-03, P4-05, P4-07–P4-10, P4-15 | Medium; partly #123 / #121 |
