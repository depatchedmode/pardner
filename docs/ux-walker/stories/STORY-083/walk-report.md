# STORY-083: Inspect an operation integrity conflict

Walked 2026-11-09 in Chromium 1440×900 in Priya Raman's hub browser. Setup (`outage.mjs`): with the hub stopped, two replicas each acknowledged a different request under the same retry key `rotate-key-retry-7`:
- Maya's client: `task.update` status → in-progress.
- Juniper on Theo's client: `pardner update --priority p0 --operation-id rotate-key-retry-7 --token-file …`.

After the hub restarted, the task context returned `integrityConflicts` with both variants, and both changes were applied (the task is In progress and P0). Evidence: `<evidence-archive>/walker-2026-11-09/STORY-083/` (video in `videos/`).

## Steps
0. **Board** (`screenshots/step-0-board.png`): the card "Rotate Stripe restricted key" shows only "P0 / Unassigned". Nothing on the board marks the integrity conflict, unlike "Conflicting edits" for field conflicts. Geometry: only the known `button.task-card` wrap false positive.
1–2. **Open the task** (`screenshots/step-1-2-section.png`): below the actions row, an amber section headed **Unresolved operation ID conflict** (aria-label "Operation integrity conflict") reads "Retry key rotate-key-retry-7 acknowledged different requests. Both are preserved. Inspection does not replay or repair them." Matches.
3. **Expand the first variant** (`screenshots/step-3-expand-first.png`): the summary is "task.update by actor-6809f49e…(64 hex) — 47c78c2f…(64 hex)". The full Actor ID and fingerprint wrap over three lines and break mid-token. The body is pretty-printed JSON with `changes: [{field: status, new: in-progress, old: up-next}]`, payload, operationId and replicaId. No name ("Maya Okafor") appears anywhere. Matches the catalog.
4. **Expand the second variant** (`screenshots/step-4-expand-second.png`): a priority change p1 → p0 by `actor-6b8ee6b3…` (Juniper), also unnamed. Each JSON body scrolls inside its own box. Matches.
5. **Look for an action**: the section has no buttons at all (`buttons in section []`). Nothing in the UI picks, acknowledges or dismisses the variants, so the warning stays on the task permanently. The CLI's `show` exposes `integrityConflicts` but offers no resolve. Matches.

Edge case, **the browser's own pending request uses that key** (`s083b.mjs`; `screenshots/edge-1-pending-after-reload.png` … `edge-4-switcher.png`): I seeded the tab's pending request (sessionStorage `…:pending`) with operationId `rotate-key-retry-7` and a different payload (status → review), then reloaded. **Retry saved request** returned **"This retry key has multiple acknowledged requests; inspect every variant before continuing / Your last confirmed data remains available. / Retry saved request"** in a page-wide banner. There is no Dismiss. Retrying again gives the same result. **New task** is disabled. A quick-status change on another task is refused with "Resolve the saved request before starting another change." The project switcher shows "Lantern Checkout · Saved locally · synced · unconfirmed change". The only way out is to close the tab, because the state lives in that tab's sessionStorage. While I set this up, an aborted request showed the raw "Failed to fetch" as the error title (`screenshots/probe-pending.png`).

Mobile check (`screenshots/mobile-check.png`, 390×844): the section fits the width, but the summaries are walls of hex broken mid-token. Geometry: card false positives only.

Console/page errors: `ERR_CONNECTION_REFUSED` (my deliberate abort) and two `400 (Bad Request)` from the refused retries.

## Flagged claim verdicts
- **#3** (`OPERATION_INTEGRITY_CONFLICT` is not definitive, so **Retry saved request** keeps failing and **New task** stays disabled): **CONFIRMED**. See `edge-2-after-retry.png`: no Dismiss, New task disabled, other writes refused, and the state survives reload. To reach the state I seeded the pending entry by hand, because a real browser collision needs two replicas to reuse one retry key.

## Flow Log
- Ideal 2 (open, expand); actual 3 (open, expand both). Interpreting the variants means mapping 64-character Actor IDs to people by hand.
- Dead end: the person learns there is a problem and has no action. In the pending-request case the tab is stuck until it is closed.
- Duplicated or missing information: the conflict appears only in the panel. The board and Activity give no cue.

Status: fail
