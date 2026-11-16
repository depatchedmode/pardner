# STORY-056: Keyboard-only and screen-reader pass over presence surfaces

Setup: Harbor Billing hub, 9 Actors (so the header shows "+4" rather than "+2"), Juniper's agent session active and focused on "Migrate invoice PDFs to S3"; Dev offline at this point. Keyboard only (Playwright `keyboard.press`) in Chromium 1440×900; accessible names read from Playwright's ARIA snapshot. Video in `videos/`.

## Steps
1. **Tab into the header** (`screenshots/step-1.png`, `screenshots/step-1-active-focus-zoom.png`): stops in order: "Project: Harbor Billing. Switch project", "Juniper, agent, active. Open profile", "Maya Okafor, human, active. Open profile", "Dev Patel, human, offline. Open profile", "Otter, agent, offline. Open profile", "Priya Raman, human, offline. Open profile", "4 more Actors. Show everyone", Invite, … Labels match the story. On active avatars the focus ring has the same colour as the presence ring (F-056-02).
2. **Enter on +4** (`screenshots/step-2.png`): dialog "People in this project" (h2), focus on Close; a list where each item has an img with "Name, kind, state", a name button and plain text "Agent Active". Tab cycles through the 9 name buttons and back to Close (modal). Pass.
3. **Escape**: focus returns to "4 more Actors. Show everyone". Pass.
4. **Card** (`screenshots/step-4.png`): the card button's accessible name is "P2 Migrate invoice PDFs to S3 Unassigned Here now"; the marker's "Juniper, agent, active, on this task" is not part of it (F-056-01). The story's claim that the card name includes the markers is refuted.
5. **Enter** (`screenshots/step-5.png`): panel opens with its H2 focused. Tab → Close → "Juniper, agent, active, on this task. Open profile". Pass. Geometry clean apart from the multi-line task-card false positive. Maya herself was not yet listed in "Here now" right after opening (see STORY-052).
6. **Enter on the avatar** (`screenshots/step-6.png`): dialog "Juniper" with regions "Identity" (h3, description list) and "Live sessions 1" (h3). Pass.
7. **Escape**: focus returns to the panel's Juniper avatar. Pass.
- Variation, offline avatar focus (`screenshots/variation-offline-focus.png`, `screenshots/variation-offline-focus-zoom.png`): computed `outline` is `none` on offline avatars, but a white offset box-shadow ring is clearly visible around the focused "O". Sighted keyboard users can see focus.
- Live regions: only two `status` elements ("Saved locally · synced"); presence changes are not announced (F-056-03).
- Mobile check: header and People dialog at 390 width covered in STORY-048/049; not repeated.
- Console/page errors: none.

## Flagged claim verdicts
- #46 (part) "offline avatars drop the focus-visible outline" — **REFUTED** as a user-visible defect: the CSS outline is none, but a visible white box-shadow focus ring replaces it (zoom screenshot).

## Flow Log
- Ideal 3 (tab to the stack, hear labels, open +N) — actual 3 (plus one Tab per avatar).
- The card-level summary of who is here is missing for screen readers, so Sam must open each task to learn who is on it.

Status: pass
