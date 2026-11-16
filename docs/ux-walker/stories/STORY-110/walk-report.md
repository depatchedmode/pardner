# STORY-110 walk report: First visit to the Control tab on a fresh client

Walked 2026-11-09 on branch `client-only-entry`, Chromium 1440×900. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-110/`.

**Setup.** A CLI-started client (`client serve --data <scratch>/control/maya`) with identity "Maya Okafor", project "Ledgerline" and three tasks. One agent Actor was enrolled with `client agent-grant --harness openai-codex`; the UI names it "Setup agent". No T3 credential, control projects or mappings. The page scrolls inside `<main>`, so "full page" captures were taken by scrolling sections into view.

## Steps
0. **Board** (`screenshots/step-0-board.png`): the Tasks view with three cards. Geometry: one wrapped-control hit on a task card button (card content, not a control label; ignored).
1. **Click Control** (`screenshots/step-1-loading.png`): `aria-pressed=true` confirmed. The control records arrived before the screenshot, so "Opening control records…" was not observed. In this frame the Tasks button still had its green pressed border alongside Control (a one-frame transition). Geometry not run.
2. **First poll** (`screenshots/step-2-control.png`): heading **Control** with **Read T3 now** on the right. The status line reads exactly "T3 credential: missing · qualified 0.1.5, 0.1.6. These records stay on this computer and are not synchronized or published to GitHub." Matches the story. Geometry: only the nav row of Tasks/Goals/Activity/Control widths (69/69/82/81 px), which follows label length. Not a defect.
3. **Control settings** (`screenshots/step-2-control.png`, `screenshots/step-3-map-form.png`): the disclosure is open, with **T3 credential**, **Projects** and **Map a T3 thread**. Under the **Projects** heading there is a 74 px empty band before "Project ID" (the h3 sits at y=587 and the first label at about y=681). Every h3 is followed by 37 px of empty space before its intro text. The Authorized tasks and Authorized senders pickers are native `<fieldset>` boxes with about 12 px checkboxes, which look different from the dark rounded inputs above them. Geometry: clean apart from the nav row.
4. **Scroll on** (`screenshots/step-4-cloud.png`, `screenshots/step-4-cloud-register-open.png`): "No T3 threads are mapped yet." is centred, while everything else is left-aligned. **Cursor Cloud** reads "Live dispatch disabled · Access not configured · Live qualification pending." in body-size text (16 px), larger than the 13 px T3 status line, and is followed by "Intent and evidence are saved on this service. Cancellation holds the queue and does not undo changes." Matches the story. Geometry: clean apart from the nav row.
5. **Hesitation confirmed.** Nothing names a first step. The page shows three equal-weight full-width grey buttons (**Pair T3**, **Save project**, **Map thread**) and a fourth form (**Register Cloud context**). The words "Projects" / "Project" (the control project) sit under a header showing the Pardner project "Ledgerline". The Map form is fully interactive before pairing or saving a project. Its **Project** select is empty, so the dependency only shows when it fails.
- **Edge: Read T3 now before pairing** (`screenshots/step-5-readnow-immediate.png`, `screenshots/step-5-readnow-after.png`): clicking it changes nothing visible apart from the button's focus ring. There is no spinner, toast or "nothing to read: pair T3 first".
- **Reload** (`screenshots/step-6-reload.png`): the view comes back on Control, as the story says.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the header wraps into three rows (logo/project; avatars, Invite and You; sync status and New task) and Control takes the rest. No horizontal overflow. The status text wraps to four lines. The same 37 px gap under "T3 credential" is visible. Geometry: clean apart from the nav row.
- Console/page errors: none.

## Flagged claim verdicts
- **#48 "Read T3 now before pairing looks like it did nothing" — CONFIRMED.** Before and after screenshots are identical apart from the focus ring. No message tells Maya to pair first.

## Flow Log
- Ideal path: 2 (click Control, read one next-step call-out). Actual: 2 actions, but the "read" step means scanning about 1,500 px of four forms. There is no next-step call-out, so Maya has to infer the order (pair → project → map) from the layout.
- Hesitations: which form comes first; "Projects" (control) vs the Pardner project "Ledgerline"; what "Setup agent" is (the CLI-enrolled agent's display name).
- Duplicated information: the T3 status line and the T3 credential section both describe the credential. The Cancellation note is in the Cloud section only.

Status: pass
