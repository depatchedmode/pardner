# STORY-070: An agent creates a task from the CLI and the person sees it appear

Walked 2026-11-09. Daniel Reyes's browser (Chromium 1440×900) was on "Harbor Mobile" with no filters. The agent CLI used a token file from `pardner client agent-grant --harness openai-codex`; the harness `codex-harbor` is refused, see STORY-059. The agent therefore appears as "Setup agent · agent". Evidence: `<evidence-archive>/walker-2026-11-09/STORY-070/` (CLI transcript in `cli-log.txt`, tokens not recorded).

## Steps
1. **Agent runs `task create`.** `--assignee "Setup agent"` (the only name the browser shows) fails with `UNKNOWN_ACTOR: Unknown Actor: Setup agent`. With the handle `agent-7b62…-openai-codex` (taken from `actors list`) it returns `success:true` with a task ID. The handle appears nowhere in the browser.
2. **Live update.** `screenshots/step-2.png`: the card "P1 / Add retry jitter to push registration / Setup agent · agent" was already in Backlog when the CLI returned (under 100 ms later), and Backlog went from 5 to 6. Geometry: `wrappedControls` hits on task cards only (intentional). Matches.
3. **Activity.** `screenshots/step-3.png`: the entry reads "**Setup agent** created Add retry jitter to push registration · Backlog · P1 · Assigned to Setup agent". Clicking the subject opens the task detail (`screenshots/step-3b.png`). Geometry: clean. Matches, but "Setup agent" does not say *which* setup agent: the project has two, Daniel's and Priya's.
4. **Filter Assigned to = the agent.** `screenshots/step-4.png`: Backlog 1, Up next 1, In progress 3, Review 1. Geometry: clean. Matches.

## Variations and edge cases (CLI)
- `--tags auth,ios` → `INVALID_ARGUMENT: --tags must be valid JSON`. The UI accepts comma text. Confirmed.
- `--status todo` → accepted; the task lands in Backlog. Confirmed.
- `--assignee none` → Unassigned. Confirmed.
- `--assignee nobody-here` → `UNKNOWN_ACTOR` (not `NOT_FOUND` as the story guessed).
- Creation attribution is shown in Activity and History, not on the card. Confirmed.
- `--vein`: not exercised for this story; vein linking is covered in STORY-064.

Mobile check (`screenshots/mobile-check.png`, 390×844): filtered board, no overflow. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts
- Related #15 (client handles shown nowhere in the browser): CONFIRMED in this context. The CLI needs the handle for `--assignee`; the display name "Setup agent" is rejected with `UNKNOWN_ACTOR`.
- Related #16 (agent display names): here the names are "Setup agent" rather than harness IDs. Two agents share the name, so attribution is ambiguous.

## Flow Log
- Ideal 1; actual 2 for the agent (the first attempt with the visible display name failed; the handle had to be looked up with `actors list`).
- Duplicated or ambiguous info: "Setup agent" in Activity cannot be told apart from the other setup agent.

Status: pass
