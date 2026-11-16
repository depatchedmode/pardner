# STORY-059: Fill every field on a new task, including tags and an assignee

Walked 2026-11-09 in Chromium 1440×900. Setup: hub client for Daniel Reyes (project "Harbor Mobile", `--public-url` loopback), a second client for Priya Nair joined by human invitation, and an agent grant. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-059/`.

Setup deviation: `client agent-grant --harness codex-harbor` is refused with `INVALID_ARGUMENT: Unsupported execution harness`, so an agent cannot be called "codex-harbor". The grant with `--harness openai-codex` resolves to the existing "Setup agent" Actor; the agent is shown as "Setup agent · agent" throughout, and it stands in for codex-harbor.

## Steps
1. **New task** — `screenshots/step-1.png`: panel opens, "Creating as Daniel Reyes · human". Geometry: clean.
2–7. **Fill every field** — `screenshots/step-7.png`: Title, Description, Status "Up next", Priority P1 then P0, Assignee, Tags "auth, ios, , auth". Geometry: clean. The Assignee options are `Unassigned, Setup agent · agent, Daniel Reyes · human, Priya Nair · human, Setup agent · agent`: **two identical "Setup agent · agent" entries** (Daniel's and Priya's setup agents) with nothing to tell them apart. The header avatar row shows "SA SA" too. I picked the first one, which turned out to be Daniel's agent (the agent-grant one).
8. **Create task** — the stored task has `tags ["auth","ios"]`, `status up-next`, `priority p0`: blanks dropped and the duplicate removed, as the story expects.
9. **Detail** — `screenshots/step-9.png`: line reads "Setup agent · agent · P0" and the quick **Status** select shows "Up next". Geometry: clean. **The tags appear nowhere in the detail panel**; they are visible only inside **Edit task** (`screenshots/step-9b-edit.png`).
10. **Board** — `screenshots/step-10.png`: card at the top of Up next, "P0 / Fix token refresh loop on iOS 18 cold start / Setup agent · agent". Geometry: clean. No tags on the card. A "DR" here-now avatar remains on the card right after Close; it was gone on a fresh load (`screenshots/step-10b.png`).

Mobile check (`screenshots/mobile-check.png`, 390×844, New task form): Title, the selects and Tags are each 44 px tall with 16 px font. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts
No flagged claim names STORY-059. Related: #16 (agent display names): here, agents show as "Setup agent" rather than harness IDs, but two different agents share that name. The finding is logged below.

## Flow Log
- Ideal 7; actual 8 (P1 then P0 is persona hesitation). Defaults sensible.
- Hesitation: choosing between two identical "Setup agent · agent" options.
- Tags entered but never shown back outside the edit form, so Daniel cannot confirm them without re-entering edit mode.
- Duplicated info: assignee and priority on the card and the detail line (expected Redundancy Candidate, confirmed).

Status: fail
