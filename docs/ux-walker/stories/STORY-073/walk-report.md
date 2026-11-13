# STORY-073: Edit draft survives closing the panel and reloading the tab

Walked 2026-11-09 in Chromium 1440×900 on Maya Okafor's client (joined to the "Lantern Checkout" hub). The task was "Add Apple Pay to checkout sheet" (Backlog, P2, unassigned, tags payments, ios). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-073/`. Scripts were `s073.mjs` (main run, video in `videos/`), `s073b.mjs` (priority re-run, because my first script's priority selection did not apply) and `s073c.mjs` (storage blocked).

## Steps
1. **Open the card** (`screenshots/step-1-panel.png`): the panel shows "No description yet." Geometry: only the known `button.task-card` wrap false positive (multi-line card button). Matches.
2. **Edit task** (`screenshots/step-2-editor.png`): an inline editor opens below **GitHub issues**, with Title focused (`INPUT`), Description, Status, Priority, Assignee, Tags, **Save changes** and **Cancel edit**. The quick Status select is gone and the summary line reads "Unassigned · Backlog · P2". Geometry: card false positive only. Matches. The Assignee options list "Setup agent · agent" three times (see F-072-03).
3. **Type in Description** (`screenshots/step-3-typing.png`): sessionStorage holds `pardner:{workspace}:{actor}:draft:{task}` with the fields and base revisions. Nothing is sent. Matches.
4. **Escape in the filled textarea** (`screenshots/step-4-escape-textarea.png`): the panel stays open with no feedback. Matches the catalog, including the hesitation.
5. **Close** (`screenshots/step-5-closed.png`): the panel closes and focus returns to the card button. Matches.
6. **Open another task, close it, reopen this one** (`screenshots/step-6-reopened.png`): the panel reopens straight into the editor with the half-typed description. Matches. Nothing marks the editor as a restored, unsaved draft.
7. **Reload** (`screenshots/step-7-reloaded.png`): the board reopens with this panel already open and the draft still in the editor. A "Here now · MO" row appears about a second later and pushes the panel content down by about 36 px. In the separate `s073b` run (`screenshots/step-7b-reloaded-priority.png`) the P1 priority-only draft also survived Close → reload → reopen. Matches.
8. **Finish text, set tags** (`screenshots/step-8-tags.png`, `step-8b-save-row.png`): tags are kept as typed. Matches. **Hand off work** stays beside the editor's buttons (see the variation below).
9. **Save changes** (`screenshots/step-9-saved.png`): "Saving locally…" → "Saved locally · synced". The editor closes, focus goes to **Edit task**, and the description renders. Matches.
10. **History** (`screenshots/step-10-history.png`, `step-10b-history-priority.png`): "Maya Okafor edited this task — Tags: payments, ios, wallet · Description edited", then (from the second save) "Maya Okafor changed the priority of this task to P1". Matches the detailLine order.

Variations and edge cases:
- **Escape with focus on a select** (`screenshots/var-escape-select.png`): the whole panel closes. Reopening the card brings the editor back. Inconsistent with step 4 (flag #36).
- **Blank title** (`screenshots/var-blank-title.png`): "Enter a title that is not only spaces." and Title refocused. Matches.
- **Cancel edit**: no confirmation. The draft is removed from sessionStorage and focus goes to **Edit task**. Matches.
- **New task draft vs reload** (`screenshots/var-newtask-draft.png`, `var-newtask-after-reload.png`): I typed "Wallet pass for receipts" in New task and reloaded. The panel was gone and the title lost, while edit drafts survive (flag #37, first half).
- **Site storage blocked** (`screenshots/edge-blocked-storage-typing.png`, `edge-blocked-storage-after-reload.png`): with `Storage.setItem` throwing, the panel shows a red notice: "Browser storage is unavailable. Allow site storage to keep drafts and safely retry changes. / Your last confirmed data remains available. / Dismiss". After reload the draft is lost and the panel does not reopen. So a warning *is* shown. The catalog's "Maya gets no warning" is wrong for this build. The notice may come from the preferences or pending-request write rather than the draft write, but the user is warned either way.
- **Hand off work while editing** (`screenshots/var-handoff-while-editing.png`): **Hand off work** stays available in edit mode. Clicking it opens the handoff form *under* the open editor, so the screen has two forms, each with its own Status (and Recipient/Assignee) field.

Mobile check (`screenshots/mobile-check.png`, 390×844): the editor stacks cleanly. **Save changes**, **Cancel edit** and **Hand off work** wrap into two rows, so Hand off work looks like part of the edit form. Geometry: card false positives only.

Console/page errors: none.

## Flagged claim verdicts
- **#36** (Escape does nothing while a text field holds text, but closes the panel from a select): **CONFIRMED** (`step-4-escape-textarea.png` vs `var-escape-select.png`).
- **#37** (New task draft is memory-only while edit drafts persist; blocked storage makes edit drafts memory-only with no warning): **partly CONFIRMED**. The New task draft is lost on reload (`var-newtask-after-reload.png`), and with blocked storage the edit draft is lost on reload. The "no warning" part is **REFUTED**: a "Browser storage is unavailable…" notice appears (`edge-blocked-storage-typing.png`).

## Flow Log
- Ideal 4 (open, Edit task, type, Save); actual 4 plus the interruptions, which cost no extra steps. Close → reopen and reload both restored the draft.
- Hesitation: Escape in the textarea did nothing. On reopen nothing says "unsaved draft", so the editor looks like a fresh edit.
- No re-entry of known data.
- Duplicated information: the summary line repeats the editor's Status/Priority, and with the handoff form open, status is editable in two places at once.

Status: pass
