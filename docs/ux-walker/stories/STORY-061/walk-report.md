# STORY-061: Close a half-written draft with Escape, then come back to it

Walked 2026-11-09 in Chromium 1440×900 with video. Client service for Maya Okafor (the persona Aisha Bello is played by Maya; one identity per client). Project "Northwind Logistics" with two In progress tasks and one Backlog task. Evidence: `<evidence-archive>/walker-2026-11-09/STORY-061/` (video `videos/page@f4bd1a555cd9b520d205a736834ca169.webm`).

## Steps
0. **Precondition** — `screenshots/step-0.png`: New task panel with Title "Audit carrier rate cards for Q1" and Priority P1. Geometry: three `wrappedControls` hits, all on `button.task-card` (intentional multi-line cards). Treated as clean.
1. **Escape with the cursor in Title** — `screenshots/step-1.png`: nothing happens. The panel stays open, focus stays in Title, and no alert or live-region text is produced. The screen is pixel-identical to step 0, so the person cannot tell whether Escape was ignored on purpose. Geometry: card false positives only.
2. **Tab to the empty Description, Escape** — `screenshots/step-2.png`: the panel closes and focus returns to the **New task** button. Geometry: clean.
4. **New task again** — `screenshots/step-4.png`: Title "Audit carrier rate cards for Q1" and Priority P1 are restored, **Discard draft** is visible, and Title is focused. Geometry: clean.
5. **Description, then Create task** — `screenshots/step-5.png`: the task is created and its detail panel opens with heading "Audit carrier rate cards for Q1". Geometry: clean.

## Variations and edge cases
- **Escape on the Priority select**: the panel closes even though the draft is dirty, and the draft is kept. Confirmed.
- **Click a card while drafting** (`screenshots/var-card-swap.png`): the detail panel replaces New task, and the draft is restored on the next **New task**. Nothing on screen tells the person a draft is waiting.
- **Reload** (`screenshots/edge-reload.png`): the draft is lost. **New task** reopens with an empty Title and P2, with no warning before or after.
- **Switch project and back** (`screenshots/edge-switch.png`): the draft is lost (Title empty).
- Not walked: Escape with a Profile/Invite `<dialog>` open over the panel (dialogs belong to other topics).

Mobile check (`screenshots/mobile-check.png`, 390×844): the New task panel is full width with 44 px controls. Geometry: clean.

Console/page errors: none.

## Flagged claim verdicts
- **#36 (Escape does nothing silently while a text field holds typed text, but closes the panel from a select): CONFIRMED.** Escape in a non-empty Title left the panel open with no feedback (no alert or live text; `screenshots/step-1.png` is identical to `screenshots/step-0.png`). Escape from the Priority select closed the panel with the same dirty draft.
- **#37 (New task draft is memory-only, lost on reload or project switch): CONFIRMED** for the New task draft (`screenshots/edge-reload.png`, `screenshots/edge-switch.png`). The edit-draft persistence half is checked in STORY-068's run (see that report). The blocked-storage half was not tested here.

## Flow Log
- Ideal 3 (close, look, reopen); actual 4. The first Escape in Title did nothing, so the person moved focus and pressed Escape again.
- Hesitation: whether Escape is broken (step 1).
- The draft is re-entered from scratch after any reload or project switch.

Status: pass
