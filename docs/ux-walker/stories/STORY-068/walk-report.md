# STORY-068: Create and triage tasks with the keyboard only

Walked 2026-11-09 in Chromium 1440×900 with video. Keyboard events only after the page loaded; no screen reader was run. VoiceOver itself is BLOCKED (no assistive-technology automation here), so the announcements are inferred from the accessibility tree (`ariaSnapshot`) and the ARIA attributes. Project "Ironbark API" with 15 tasks, including "Rotate signing keys" (P1, assigned to Maya Okafor, who stands in for Sam). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-068/` (video in `videos/`).

## Steps
1. **Tab through the header** — `screenshots/step-1-focus.png`: the tab order is project switcher ("Project: Ironbark API. Switch project"), the MO avatar, the SA avatar, **Invite**, **You: Maya Okafor**, **New task**. Focus rings are 2 px solid mint on buttons. The avatars use a box-shadow ring instead: the human avatar has a dashed outline plus the ring; the offline agent avatar has outline `none` and only the box-shadow ring (#46 belongs to another story). Geometry: twelve `wrappedControls` hits, all `button.task-card` (intentional multi-line cards). Clean otherwise. SaveStatus is not focusable; it is a `role=status` region.
2. **Workspace views** — **Tasks** has `aria-pressed=true`; Goals, Activity and Control have `false`. Matches.
3. **Filters** — `screenshots/step-3.png`: **Assigned to**, **Status filter** and **Vein** are labelled selects. It takes 13 Tabs to reach the first card.
4. **Board** — the regions are named "Backlog" … "Abandoned"; the headings read "Backlog 1" (count inside the h2, as the story says); cards read e.g. "P2 Draft invoice email copy Unassigned". Matches.
5. **Focus New task, Enter** — focus lands in Title; the panel is labelled "New task".
6. **Type, Tab through the fields** — Tab order: Description, Status, Priority, Assignee, Tags, **Create task**. Enter in Tags submits. `screenshots/step-6.png`: created; focus is on the `H2` "Add rate-limit headers to /v2/orders" with a visible ring.
7. **Escape** — `screenshots/step-7.png`: the panel closes and focus goes to the new card in Backlog (visible mint ring). Matches.
8. **New task, type "Deprecate /v1/orders", Escape** — `screenshots/step-8.png`: nothing happens. The panel stays open and no alert or live text appears, so a screen-reader user hears nothing. Confirmed.
9. **Enter** — `screenshots/step-9.png`: created.
10. **Escape** — `screenshots/step-10.png`: focus goes to the "Deprecate /v1/orders" card. Matches.
11. **Tab to "Rotate signing keys", Enter** — four Tabs from the new card. `screenshots/step-11.png`: the detail panel opens with the heading focused, and the card has `aria-current="true"`. Matches.

## Edge cases
- No keyboard shortcuts for New task or the filters; 6 Tabs to New task and 13 to the first card.
- The side panel is not modal. Seven Tabs from the detail heading leave the panel to the document body or the browser chrome; focus is not trapped, which is fine for a non-modal panel. The panel comes last in DOM order, so a keyboard user who wants to go back to the board must Shift+Tab or press Escape.
- Edit-draft persistence (the other half of flag #37): I typed into **Edit task** Description on "Rotate signing keys", reloaded, and the edit form came back with "Edit draft text before reload" (`screenshots/edit-draft-reload.png`). Edit drafts persist; New task drafts do not (STORY-061).

Mobile check (`screenshots/mobile-check.png`, 390×844): reflows without horizontal page overflow.

Console/page errors: none.

## Flagged claim verdicts
- **#36 (Escape silent while a text field has text; closes from a select): CONFIRMED.** Step 8: Escape in a Title holding "Deprecate /v1/orders" left the panel open with no alert or live-region output (`screenshots/step-8.png`). The select half is confirmed in STORY-061.
- **#37 (New task draft memory-only while edit drafts persist): CONFIRMED.** The edit draft survived a reload (`screenshots/edit-draft-reload.png`); the New task draft did not (STORY-061 `edge-reload.png`). Blocked storage was not tested.

## Flow Log
- Ideal 12; actual about 16 key actions for two creates plus the open, excluding the header traversal. The extra steps were the silent Escape and re-finding the New task button by Shift+Tab or Tab across the header.
- Hesitation at step 8 (silent Escape).
- No re-entry of data.

Status: pass
