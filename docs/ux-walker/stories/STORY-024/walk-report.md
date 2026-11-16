# STORY-024: First project from the Welcome page

Walked 2026-11-09 in Chromium 1440x900 against a fresh client (`client serve --harness anthropic-claude-code --name Wren`). Identity was confirmed in the browser as Priya Natarajan before step 1. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-024/`.

## Steps
1. **Welcome after Continue.** `screenshots/step-1-welcome.png`: heading "Welcome, Priya Natarajan", the lead sentence, toggle "Start a project" (aria-pressed=true) / "Join a project", Project name field focused (autofocus confirmed). Geometry clean. Matches expected.
2. **Helper text.** Same screenshot: "You join as Priya Natarajan. Wren (Claude Code) is registered as your agent. It shows as offline until it connects, and as active only while it reports work." Matches.
3. **Type name.** `screenshots/step-3-typed.png`; maxlength=120 confirmed. Geometry clean.
4. **Start (pressed Enter, the keyboard variation).** `screenshots/step-4-starting.png`: button "Starting…" disabled, and the resume notice "An earlier attempt to start "Checkout rewrite" didn't confirm. Starting it again resumes that attempt." is shown on this first attempt (F-024-01). The notice also shifts the helper text and button down ~78px.
5-6. **Board.** `screenshots/step-6-board.png`: header "Pardner", switcher "Checkout rewrite ⌄" (aria-label "Project: Checkout rewrite. Switch project"), avatars "Wren, agent, offline" and "You: Priya Natarajan", "Saved locally · synced". `pardner:client:last-project` set to the new ID, `pending-create` cleared. Geometry clean. The agent badge sits visually under Priya's avatar (F-024-02, `screenshots/header-zoom.png`); Priya appears twice in the header (F-024-03).
- **Edge: whitespace-only name.** `screenshots/edge-whitespace-name.png`: browser accepted "   ", server error "Supply a project name" shown under the helper text; pending-create was null afterwards. Matches the catalog. Geometry clean. The message has no hint and no field association, acceptable.
- **Mobile.** `screenshots/mobile-check.png`: no horizontal page overflow (geometry clean), but the header stacks into three rows and the You button truncates (F-024-04).
- Video: `videos/start-project.webm`. Console: one 400 from the deliberate whitespace submit; nothing else.

## Flagged claim verdicts
- **#34 (resume notice flashes during the first Starting…)**: CONFIRMED. A MutationObserver installed before the first submit recorded the notice text, and `screenshots/step-4-starting.png` shows it beside "Starting…". It is not a flash: it stays for the whole in-flight period.

## Flow Log
- Ideal path 2 (type, Start). Actual 2 (type, Enter). No re-entry. Hesitation point: the "earlier attempt didn't confirm" notice on a first try invites the user to think something already went wrong.
- Duplicated information: the person appears in the avatar stack and the You button.

Status: pass
