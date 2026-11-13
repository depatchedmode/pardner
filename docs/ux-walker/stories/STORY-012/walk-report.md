# STORY-012 walk report: Long first-day journey — agent sets up, person signs in, mishaps, restart

Walked 2026-11-09 as one scripted run (`first-launch/s012.mjs`). Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-012/`. "Safari" = Playwright WebKit, "Firefox" = a separate Chromium context (Firefox engine not installed); both keep their own cookie state across day 1/day 2. Fresh `--data` dir; a fake `open` launcher on PATH records the URL. Day 2's port squatter is the repo's **real Vite 4.5.14**. Videos in `videos/`.

## Steps
1. **Scout runs `open --harness anthropic-claude-code --name Scout --model claude-opus --managed-by T3 --data …`** → `{"success":true,"localUrl":"http://127.0.0.1:60502/pardner/","launchIssued":true}` in 0.5 s.
2. **Safari startup shell** (`screenshots/step-2-startup-shell.png`): "Opening your workspace…" (JS delayed 1.2 s to observe it).
3. **Grant** stripped (`#grant` absent after mount).
4. **Identity step** (`screenshots/step-4-identity-step.png`): "Filled in from your Git configuration.", button "Continue as <git name>". Geometry clean. Typed Sofia Castellanos / sofia@example.test and continued.
5. **Welcome → Start** (`screenshots/step-5a-welcome-start.png`): "You join as Sofia Castellanos. Scout (Claude Code) is registered as your agent…" (the setup-agent flags were carried through). Created "Helios launch" → empty board (`screenshots/step-5b-board-helios.png`), "Saved locally · synced". Geometry clean. In WebKit the three filter selects render as small native controls (~24 px tall) next to 40 px tab buttons (F-012-04).
6. **`open --output-file desktop/pardner-link.txt`** → success; the URL with `#grant=…` is only in the 0600 file.
7. **Firefox pastes the link 65 s later** (`screenshots/step-7-firefox-expired.png`): signed-out screen with "The sign-in link was already used or has expired. Links from your agent work once." Geometry clean.
8. **Check again** (`screenshots/step-8-check-again.png`): still signed out; the notice disappears.
9. **New link pasted into the same tab** → board "Helios launch" with "Scout · agent" and "Sofia Castellanos · human" (`screenshots/step-9-firefox-board.png`). Geometry clean.
10. Link file deleted (Pardner never removes it).
11. **`client status`** → JSON with identity, device, `setupAgent` {anthropic-claude-code, Scout, claude-opus, T3}, one project.
12. **`client stop`** → `{"success":true,"stopped":true,"running":false}`.
13. **Firefox** (`screenshots/step-13-firefox-unreachable.png`): "Local service disconnected" + banner "The local Pardner client did not respond. Check that it is still running, then retry." + **Retry connection**. The hint quoted in the story ("Ask your agent to reopen it") did not appear. Geometry clean.
14. **Day 2, real Vite on the saved port 60502, `pardner open`** → `INTERNAL_ERROR: Unexpected end of JSON input`, not the PORT_IN_USE the story expects. `pardner open --http-port 47199` → the same INTERNAL_ERROR.
15. **Vite stopped, `pardner open`** → restarted on 60502; Safari with the fresh grant shows "Helios launch" (`screenshots/step-15-safari-day2.png`).
16. **Firefox bookmark `/pardner/`** with its day-1 cookie → board with no new grant (`screenshots/step-16-firefox-bookmark.png`). Geometry clean.
- **Mobile 390×844** (`screenshots/mobile-check.png`): same header-wrap/filter-stack issue as STORY-002 F-002-03; no overflow.

Console: WebKit logged WebSocket/connection failures only during the deliberate stop; Firefox logged the expected 401s.

## Flagged claim verdicts
- **#4 Check again can never sign a browser in and removes the expired-link notice — CONFIRMED** (step 8).
- **#23 `PORT_IN_USE` (foreign) advises `--http-port` that cannot take effect — CONFIRMED, and worse:** with a real Vite dev server on the saved port the person gets `INTERNAL_ERROR: Unexpected end of JSON input` instead of PORT_IN_USE, both with and without `--http-port` (see STORY-007 F-007-01/02).

## Flow Log
- Ideal 6. Actual 9 on the happy parts (open, sign in, `--output-file`, wasted paste, wasted Check again, second `--output-file`, paste, status, stop) plus day 2's 3 (failed open, diagnose and stop Vite, open). The 60 s link lifetime combined with a human hand-off caused the wasted round trip; nothing on screen says the lifetime.
- Day 2 is a dead end without outside knowledge: the CLI error names neither the port nor Vite.
- "Not running" guidance seen in this run: `pardner open` (startup shell), `pardner client open` (signed-out), "Check that it is still running" (banner, no command), `pardner open or pardner client serve` (CLIENT_NOT_RUNNING, STORY-009). Four wordings.

Status: fail
