# STORY-049: Use the +N People dialog in a crowded project

Setup: same Harbor Billing hub as STORY-048 plus a fourth human, Sam Ortiz (client sam-thinkpad). 9 Actors: 4 humans (Maya, Dev, Priya, Sam) and 5 agents (Otter = Maya's Codex agent, Juniper = Maya's Claude Code agent, and three auto-created "Setup agent" Codex agents for Dev, Priya and Sam). Dev's browser and Juniper's agent session are live. Viewer is Maya (the persona's role; Otter works for Maya here, not Tomás). Chromium 1440×900.

Deviation: the stack sorts by presence, then name, so Otter (offline) still fits in the first 5 here; the Actors behind "+4" are Sam and the three Setup agents. The +N path was walked to Otter and to Sam/Setup agents.

## Steps
1. **Header** (`screenshots/step-1.png`): DP, J, MO (active), O, PR (offline), "+4" ("4 more Actors. Show everyone"). Geometry: clean apart from the multi-line task-card false positive.
2. **Click +4** (`screenshots/step-2.png`): dialog "People in this project" lists all 9 with avatar, name link button, Human/Agent and Active/Offline, sorted as the header. All 9 fit without scrolling. Three identical "Setup agent" rows (F-049-03). Close sits next to the title (F-049-05). Geometry clean.
3. **Find Otter** (`screenshots/step-3.png`): visible without scrolling.
4. **Click Otter** (`screenshots/step-4.png`): People dialog replaced by "Otter / Agent · Maya Okafor's agent · Offline"; Works for Maya Okafor, Harness Codex, Git name Maya Okafor, Git email maya@harbor.test, Devices maya-studio (F-049-04: the story expected "Not reported"); "Live sessions 0" and "No live session reported to this view. Offline means none is connected here, not that work stopped." Geometry clean.
5. Re-reading the note answers "is Otter broken?" adequately.
6. **Escape** (`screenshots/step-6.png`): profile closes, People dialog does not return, and focus is on `<body>` (F-049-01, F-049-02).
- Variation, human from the list (`screenshots/variation-human.png`): Sam Ortiz profile has no Works for/Harness rows. Close also leaves focus on `<body>`.
- Variation, Setup agent (`screenshots/variation-setup-agent.png`): "Agent · Dev Patel's agent · Offline".
- **Mobile 390×844** (`screenshots/mobile-check.png`): People dialog fits; the Human/Agent column is dropped (bot glyph remains). Geometry clean.
- Console/page errors: none.

## Flagged claim verdicts
- #46 (part) "People → Profile loses focus return" — **CONFIRMED**: after Escape or Close on a profile opened from the People dialog, `document.activeElement` is `<body>` (log in evidence dir `log.json`).
- #16 (related, owned by STORY-093/094) — observed that default agents are named "Setup agent", not harness IDs, in this build; three identical names appear in one project.

## Flow Log
- Ideal 3 (+N, click name, read) — actual 3 for the first person; each further person costs 3 more because the People dialog closes.
- Hesitation: three identical "Setup agent" rows; which one is whose?
- Duplicated information: presence word in the People row, header ring and profile heading; agent's Git identity duplicates its human's.

Status: pass
