# STORY-074: Edit draft survives a project switch and comes back

Walked 2026-11-09 in Chromium 1440×900 on Maya Okafor's client. Maya belongs to "Lantern Checkout" (joined from the hub) and "Harbor Docs" (her own local project, with the task "Document webhook signing secrets"). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-074/` (video in `videos/`).

## Steps
1. **Draft on "Retry declined cards with SCA challenge"** (`screenshots/step-1-draft.png`): in Edit task I set Assignee to "Theo Lindqvist · human" and typed a description. Geometry: only the known `button.task-card` wrap false positive. Matches.
2. **Open the switcher** (`screenshots/step-2-switcher.png`): a menu lists "Lantern Checkout / Saved locally · synced", "Harbor Docs / Saved locally · synced" and "Start or join a project…". Geometry: one `overflowSpills` hit on `div.menu-anchor` (71 px). That is the dropdown menu itself overflowing its anchor on purpose, not a defect. Matches.
3. **Choose Harbor Docs** (`screenshots/step-3-harbor.png`): the Harbor board loads with its own state. Geometry: clean. Matches.
4. **Open and close a Harbor task** (`screenshots/step-4-harbor-task.png`): no effect on the Lantern draft. Geometry: clean.
5–6. **Switch back to Lantern Checkout** (`screenshots/step-5-6-back-in-lantern.png`): the board was back in about 260 ms. "Opening the project board…" never appeared in my polling, because the load was too fast to see. The previously open task panel reopened straight into the editor with Assignee = Theo Lindqvist and the typed description. Matches.
7. **Save changes** (`screenshots/step-7-history.png`): "Saved locally · synced". History reads "Maya Okafor edited this task — Assignee: Unassigned → Theo Lindqvist · Description edited". Matches.

Variation, **New task draft across a switch** (`screenshots/var-newtask-after-switch.png`): I typed "Add SEPA debit fallback" into New task and went Harbor → Lantern. No panel was open on return and the title was lost. Only edit drafts survive (flag #37). Nothing warned before the switch discarded it.

Mobile check (`screenshots/mobile-check.png`, 390×844): the switcher menu overlays the header correctly and fits the width. Geometry: the same intentional menu spill plus the card false positives.

Console/page errors: none.

## Flagged claim verdicts
- **#37** (New task draft is memory-only and lost on project switch, while edit drafts persist): **CONFIRMED** for the switch case (`var-newtask-after-switch.png`). The edit draft survived the round trip (`step-5-6-back-in-lantern.png`).

## Flow Log
- Ideal 3 (open switcher, pick Harbor, later pick Lantern); actual 4 clicks (switcher, Harbor, switcher, Lantern). That is equal to the ideal once the return trip is counted. The draft reappeared with no extra step.
- No re-entry of known data for edit drafts. The New task title has to be retyped after a switch.
- No board cue marks tasks with unsaved drafts (catalog variation; not separately exercised).

Status: pass
