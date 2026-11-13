# STORY-034: Full onboarding of a two-person team across two computers

Setup: two clients on one machine. Lena (hub) `--http-port 52103 --public-url http://127.0.0.1:52103 --harness anthropic-claude-code --name Wren`, project "Personal backlog". Tomás `--harness openai-codex --name Cobalt`, project "Homelab". Two Chromium contexts (one per person), 1440x900. The walk ran in three parts because two script selectors failed on the junk project's name (part 2 used a second Human invitation issued through Lena's operator API, after the dialog path had been walked in part 1). Invitation text masked. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-034/`.

## Steps
1. **Lena opens switcher.** `screenshots/step-01-lena-switcher.png`: "Personal backlog — Saved locally · synced", **Start or join a project…**. Geometry: menu overlay spill and a task-card wrap, both false positives.
2. `screenshots/step-02-start-or-join.png`: "Start or join a project", Back to Personal backlog. Clean.
3. Typo then fix. `screenshots/step-03-typo.png`. Clean.
4. **Start.** `screenshots/step-04-lena-board.png`: "Payments ledger migration", Wren offline. Clean.
5. **Invite ▾.** `screenshots/step-05-invite-menu.png`: Human "A person and their agent" / Agent "Another agent of yours" / My device "Another computer you use". Clean.
6. **Create invitation → Copy invite.** `screenshots/step-06-copied.png`: "Copied. Treat it like a password and send it privately; it works once." History row wraps "Waiting to be / used" (F-034-04). Clean geometry.
7-8. Closed the dialog; prompt handed to Tomás (clipboard, 785 chars).
9. **Tomás opens switcher → Start or join.** Homelab listed.
10. **Pastes prompt into Project name.** `screenshots/step-10-prompt-in-name.png`: field shows the first 120 characters only.
11. **Start project.** `screenshots/step-11-junk-project.png`: project created and opened; the 120-character name overflows the header across the avatars, Invite and You button (geometry `div.client-identity` spill 383px). F-034-01, F-034-02.
12-13. **Join correctly.** Board "Payments ledger migration" (`screenshots/step-13-tomas-board.png`); SaveStatus already "Saved locally · synced" (the brief "waiting for hub" phase was not observed in 8 s of polling). Clean.
14. **Tomás switcher.** `screenshots/step-14-tomas-switcher.png`: Homelab, the four-line junk entry, "Payments ledger migration — Saved locally · waiting for hub" (stale; header says synced). Clean geometry.
15. **Lena sees Tomás.** After 6 s: "Tomás Ruiz, human, active", "Cobalt, agent, offline" (`screenshots/step-15-lena-sees-tomas.png`). Clean.
16. **Hub stopped; Tomás creates "Map ledger tables".** `screenshots/step-16-hub-down-edit.png`: amber "Saved locally · waiting for hub" in the header and the panel, "Remote presence unavailable" in the header; the task saved. Matches.
17. **Homelab and back.** `screenshots/step-17-switcher-stale.png`, `screenshots/step-17-back-on-payments.png`: Payments still shows the task and "waiting for hub". Matches.
18. **Hub back.** Header returned to "Saved locally · synced" in 12 s and "Remote presence unavailable" cleared (`screenshots/step-18-resynced.png`); switcher still says "waiting for hub" (`screenshots/step-18-switcher.png`, F-034-03).
19. **Next morning.** New browser context with the same profile storage plus a fresh grant: opened "Payments ledger migration" (`screenshots/step-19-next-morning.png`). Matches.
- Mobile `screenshots/mobile-check.png`: no overflow.
- Console: one 503 during the hub outage. Videos: `videos/part1/`, `videos/part2/`, `videos/part3/`.

## Flagged claim verdicts
- **#35 (Start accepts a pasted invitation prompt as a project name; projects cannot be renamed or deleted):** CONFIRMED (`screenshots/step-11-junk-project.png`, `screenshots/step-14-tomas-switcher.png`). No rename/delete exists in the board header, the switcher or `pardner --help`.
- **#9 (HUB_UNAVAILABLE for a loopback-endpoint invitation):** BLOCKED. Both "computers" are on one machine, so a loopback endpoint is reachable.
- **#32 (stale switcher labels):** CONFIRMED (`screenshots/step-18-switcher.png`).

## Flow Log
- Ideal 9 steps. Actual for Lena: 7 (switcher, Start or join, name, Start, Invite, Human, Create, Copy = 8 with the typo fix). Tomás: 4 extra steps and a permanent junk project from the wrong-field paste.
- Hesitation: two switcher entries that start with "…Payments ledger migration…".

Status: fail
