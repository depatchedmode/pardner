# STORY-048: Glance at who is around, then open a teammate's profile from the header

Setup: hub client (Maya, device maya-studio, setup agent named "Otter" via `client serve --harness openai-codex --name Otter`) on 127.0.0.1:18471, Dev Patel and Priya Raman joined on their own clients (dev-mbp, priya-air) with human invitations, Juniper joined as Maya's `anthropic-claude-code` agent. 7 Actors (Dev's and Priya's clients each auto-created a "Setup agent"). Dev's Chromium tab is open on "Fix timezone drift in renewal emails" (keydown every 20 s); Juniper reports an agent session focused on "Migrate invoice PDFs to S3" through the presence API. Engine: Chromium 1440×900.

## Steps
1. **Header** (`screenshots/step-1.png`, zoom `screenshots/step-1-header-zoom.png`): the "People in this project" group shows DP (active, solid ring + dot), J (agent, active, bot glyph), MO (Maya herself, idle/dashed), O (Otter, offline, grey), PR (Priya, offline, grey) and "+2" ("2 more Actors. Show everyone"). Active people sort first as expected. Offline avatars are barely legible (F-048-01). Maya is in the stack and also in "You: Maya Okafor" next to it (F-048-02), and she is Idle right after load (F-048-03). Geometry: no overflow, no uneven rows; `wrappedControls` lists two task-card buttons, which are multi-line cards by design (false positive).
2. **Hover DP** (`screenshots/step-2.png`): the tooltip is a native `title` ("Dev Patel, human, active"), confirmed by attribute; headless Chromium does not paint native tooltips, so the screenshot shows no change. Pass by attribute.
3. **Click DP** (`screenshots/step-3.png`): modal profile "Dev Patel / Human · Active"; Identity: Git name, Git email, Devices dev-mbp, note "Git details are profile information. They do not sign anyone in."; "Live sessions 1": "Active · Browser", Device dev-mbp, Focus link "Fix timezone drift in renewal emails", "Expires in 36 s without a report". Matches the story. Repetition noted (F-048-04). Geometry clean (same task-card false positive).
4. **Escape** (`screenshots/step-4.png`): dialog closed, focus returned to "Dev Patel, human, active. Open profile". Pass.
- Variations: Close button and backdrop click both close and return focus to the DP avatar. Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`, `screenshots/mobile-profile.png`): header wraps to three rows (stack + Invite, You, sync status + New task); no page overflow; profile dialog fits. Geometry clean (same false positive).
- Console/page errors: none.

## Flagged claim verdicts
None of the flagged claims names STORY-048.

## Flow Log
- Ideal 2 (click avatar, read) — actual 2. Presence and focus appear together in the profile, as intended.
- Hesitation: the dashed ring on my own avatar on arrival ("why am I idle?").
- Duplicated information: presence state in avatar ring, tooltip, profile heading and session row; device in Identity and session; viewer in stack and You button.

Status: pass
