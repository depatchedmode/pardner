# STORY-020: Reviewing your own profile ("You") after linking

Walked 2026-11-09 in Chromium 1440×900, continuing from the STORY-015 setup: desktop "priya-studio" (hub) and laptop "priya-air" both linked to "Checkout Revamp" as the same identity, with a browser tab open on each. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-020/`.

## Steps

0. **Laptop board** with both tabs open (`screenshots/step-0-board.png`). Header buttons, in order: "Project: Checkout Revamp. Switch project", "Priya Natarajan, human, idle. Open profile" (her own avatar in the stack), "Setup agent, agent, offline. Open profile", "Invite", "You: Priya Natarajan, human, idle. Open your profile", "New task". Her own presence therefore appears twice in the header (stack avatar plus You button).
1. **Click You.** The aria label is "You: Priya Natarajan, human, idle. Open your profile" (the story expected "active"; it was idle at that moment, which is legitimate). The dialog **Priya Natarajan (you)**, "Human · Idle" (`screenshots/step-1-profile.png`). Geometry: clean (task-card false positive only).
2. **Identity.** Git name "Priya Natarajan", Git email "priya@northbeam.dev", Devices "priya-studio" and "priya-air", and the note "Git details are profile information. They do not sign anyone in." Matches.
3. **Live sessions 2.** Two "Idle · Browser" rows, Device priya-studio and priya-air, Focus "No task", "Expires in 45 s without a report". Nothing marks which row is *this* browser.
4. **Escape.** It closes the dialog, and focus returns to the You button (`document.activeElement` = the You button) (`screenshots/step-4-after-escape.png`). **Close** also returns focus to You.

Variations:
- **Desktop tab closed.** The profile still listed **Live sessions 2** about 1 s later, with priya-studio "Expires in 40 s". The closed tab's session lingers until expiry rather than ending on close. **Devices** still lists both, as expected (`screenshots/var-desktop-closed.png`).
- **Agent profile from the AvatarStack.** **Setup agent**, "Agent · Priya Natarajan's agent · Offline", Works for Priya Natarajan, Harness **Codex**, plus *the human's* Git name and email and both devices, and "Live sessions 0" with an explanatory note (`screenshots/var-agent-profile.png`). The harness says Codex although no harness was chosen (default), and Git details on an agent are the owner's, which reads as though the agent were the person.

Mobile 390×844 with the profile open (`mobile-check.png`): the dialog fits, and "(you)" wraps under the name. Geometry: clean apart from the task-card false positive.

Console errors: none.

## Flagged claim verdicts

- **#46 (part touching this story) The You button is a silent no-op before your Actor syncs — REFUTED in the walked scenarios.** Clicked immediately after a device link here and after a fresh Human join in STORY-023; the dialog opened both times (see STORY-023 for the immediate-click trial). Focus return from Escape and Close works.

## Flow Log

- Ideal 1 (click You); actual 1. No hesitation.
- Redundancy: her own presence shows as both the stack avatar and the You button; the identity also appears on Welcome, the profile, the People data, and `client status`.
- Gap: Live sessions has no "this browser" marker, so with two identically-shaped rows she must read the Device names.

Status: pass
