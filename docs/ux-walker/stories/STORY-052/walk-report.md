# STORY-052: See "Here now" on a card and open the task to see who is in it

Setup: Harbor Billing hub. Focused on "Redesign invoice PDF header": Maya (browser, panel open), Juniper and Otter (agent sessions via the presence API). Viewer: Priya Raman on her own client (Chromium 1440×900, video in `videos/`). Later Dev also opened the task for the 4+ variation.

## Steps
1. **To do column** (`screenshots/step-1.png`, `screenshots/step-1-card-zoom.png`): the card shows P2, the title, "Unassigned" and a "Here now" stack J, O, MO. ARIA: group "Here now" with imgs "Juniper, agent, active, on this task", "Otter, …", "Maya Okafor, human, active, on this task". (The card button's own accessible name drops these names; see STORY-056 F-056-01.) Agent marker initials are low contrast (see STORY-054 F-054-05). Geometry: only the multi-line task-card false positive.
   - Variation, 4 focused (`screenshots/variation-four-card-zoom.png`): card shows 3 plus "1 more Actor, on this task"; the "+1" wraps onto two lines (F-052-01).
2. **Click Maya's marker on the card** (`screenshots/step-2.png`): the task panel opens, no profile dialog. As the story predicts (F-052-03).
3. **Panel "Here now"** (`screenshots/step-3.png`): immediately lists Juniper, Otter, Maya, Dev; Priya herself appears within 4 s (F-052-02). The card now shows "+2" (includes Priya). Geometry clean apart from the false positive.
4. **Click J in the panel** (`screenshots/step-4.png`): Juniper's profile opens, "Live sessions 2" (two agent sessions, one per focused task), each block repeating Device/Model/Managed by. Pass.
- **Mobile 390×844** (`screenshots/mobile-check.png`): panel fills the screen; "Here now" row of 5 fits; Status/Edit/Hand off wrap to two lines cleanly. Geometry clean.
- Variation "7+ in panel" not walked (needs more credentialed Actors than this setup has).
- Console/page errors: none (Maya, Priya, Dev).

## Flagged claim verdicts
None of the flagged claims names STORY-052.

## Flow Log
- Ideal 1 (read the card) — actual 1 to see who is there; 3 to reach a profile from the card.
- Duplicated information: who is on this task appears on the card, in the panel and in each profile's Focus.

Status: pass
