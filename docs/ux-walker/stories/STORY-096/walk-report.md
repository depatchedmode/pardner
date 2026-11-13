# STORY-096 walk report: Comment with mixed known and unknown handles, then review the chips

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-096/`. Video: `videos/`.

**Setup.** "Ledger Sync" with two agents enrolled on Priya's client: the built-in openai-codex agent (display name "Setup agent", handle `agent-04d9f305fe442c1739ad-openai-codex`) and a cursor agent joined through an Agent invitation as "Cursor reviewer" (`agent-04d9f305fe442c1739ad-cursor`). Marcus took both handles from `pardner client show`.

## Steps
1. **Type the three handles and blur** (`screenshots/step-1-hint.png`). The hint reads "@qa matches no Actor and won't notify anyone." **Add comment** stays enabled; the hint is advisory. Geometry clean. Pass.
2. **Submit** (`screenshots/step-2-chips.png`). The comment renders with two chips: `@agent-04d9f305fe442c1739ad-openai-codex` titled "Notified Setup agent · agent", and `@agent-04d9f305fe442c1739ad-cursor` titled "Notified Cursor reviewer · agent". "@qa" stays plain text. The model holds exactly two mention records (cursor and codex). Pass. By eye, the cursor chip wraps mid-handle ("…1739ad-" / "cursor") even at 1440px; geometry did not flag it because it is an inline span.
3. **Hover each chip** (`screenshots/step-3-hover.png`). The only confirmation is the native `title` tooltip (not captured in headless screenshots; the attribute was read from the DOM). The chips are `<span>` with tabIndex -1, so keyboard and touch users cannot reach the tooltip. "Setup agent" does not say whose agent was notified (Priya's and Marcus's built-in agents share that name).
- **Mobile 390×844** (`screenshots/mobile-check.png`): geometry clean. By eye, both long handles wrap mid-chip.

Console/page errors: none.

## Flagged claim verdicts
- **#15 (handles shown nowhere in the browser): CONFIRMED.** Marcus needed `client show` for both agent handles. Nothing in the UI lists them, and the profile dialogs show no handle (see STORY-086).
- **#17 (no visible delivery state; a chip only means a mention record exists): CONFIRMED.** Chips look the same whether or not the agent has claimed or acknowledged. No browser surface shows delivery state.

## Flow Log
- Ideal path 2 (type, submit). Actual 2 in the browser, plus a prerequisite trip to the CLI to copy two 40-character handles.
- Confirmation of who was notified sits in a hover-only tooltip on non-focusable spans.
- The handle prefix `04d9f305fe442c1739ad` is the same for all of Priya's agents and means nothing to Marcus.

Status: pass
