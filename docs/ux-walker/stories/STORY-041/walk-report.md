# STORY-041 walk report: A recipient on another computer redeems a Human invitation (and the loopback trap)

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-041/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

A second computer is not available. Case A was simulated honestly. Priya's no-`--public-url` hub (port 47362) issued the invite, whose envelope endpoint is `http://127.0.0.1:47362/…`. That hub was then stopped, so the loopback address in the invite reached nothing, which is what Marcus's own machine would see. Case B used the hub with `--public-url http://127.0.0.1:47361`; a loopback HTTP origin is the only non-HTTPS form the hub accepts.

## Steps
1. (Agent conversation) — not applicable to the browser walk.
2. Welcome to Pardner opened prefilled from this machine's Git config ("Ryan Betts", a GitHub noreply email), with "Filled in from your Git configuration…" (`screenshots/step-2-welcome-caseA.png`). Name and email were replaced with Marcus Lee / marcus.lee@acme.dev (`screenshots/step-2b-filled-caseA.png`). Geometry clean.
3. **Continue as Marcus Lee** → "Welcome, Marcus Lee" with Start a project / Join a project (`screenshots/step-3-welcome-marcus-caseA.png`). Matches.
4. **Join a project** → Invitation textarea and the hint "Invitations work once and expire. You keep your own identity; nobody else can create it for you." (`screenshots/step-4-join-form-caseA.png`). Matches. Geometry clean.
5. Pasted the whole prompt and clicked **Join project** (`screenshots/step-5-joining-caseA.png`).
6. **Case A result differs from the catalog:** after about 0.5 s the page shows "Project authority unavailable; retry this attempt / The project's hub is unreachable, so this can't finish yet. Retry when it is back; nothing was lost." (`screenshots/step-6-result-caseA.png`). It did not show INVALID_INVITATION "Remote invitations require HTTPS". The advice sends both people to wait or retry forever (F-041-01). Geometry clean.
7. Retrying the same attempt cannot change the outcome (the endpoint is fixed in the invite).
8. A hub with a non-loopback HTTP public URL refuses to start: `INVALID_ARGUMENT: Public gateway must be an explicit HTTPS origin, or an HTTP origin on loopback`. Priya created a new invite on the hub with a public URL (`screenshots/step-8-priya-new-invite.png`).
9. Case B: after reopening, the welcome page defaults back to Start a project and the Invitation textarea is empty (`screenshots/step-9-reopen-before-caseB.png`). The pasted new prompt joined, and "Checkout Revamp" opened as a replica (`screenshots/step-9-result-caseB.png`).
10. The header shows PR, ML and two identical "SA" agent avatars and "You: Marcus Lee"; the Assigned to filter lists "Setup agent · agent" twice (`screenshots/step-10-header.png`, F-041-02). Geometry clean.
11. Priya's dialog history now ends "Human · Used" and her avatar stack shows Marcus (`screenshots/step-11-priya-history.png`, `screenshots/step-11-priya-board.png`). The same fact appears on two surfaces, as the catalog says.

**Mobile (390x844).** `screenshots/mobile-check.png` (Marcus's board): header wraps into two rows, no horizontal overflow. Geometry clean.

**Console:** Case A logged one 503 (expected for the unreachable hub). Case B had no errors. **Videos show the pasted invitation for a moment before masking — do not publish.**

## Flagged claim verdicts
- **#14: CONFIRMED** (see STORY-036). Creating the Case A invite gave no warning, and its endpoint was loopback.
- **#9 (not assigned here, related evidence):** for a loopback-endpoint invite the recipient sees HUB_UNAVAILABLE "retry" advice that cannot succeed. This supports #9.

## Flow Log
- Ideal 4 (open, Continue, Join a project, paste+Join) vs actual Case B 5, because the name and email had to be retyped (the Git prefill was the machine owner's). Case A is a dead end: two retries, a message to Priya, a hub restart and a new invite, about 10 extra steps.
- Re-entry: the invitation textarea is empty after reopening, so the person pastes again.
- Duplicated or confusing information: two indistinguishable "Setup agent" Actors.

Status: fail
