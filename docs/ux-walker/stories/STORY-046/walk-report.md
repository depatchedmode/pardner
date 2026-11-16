# STORY-046 walk report: The full life of one invite, from creation to expiry, by CLI

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-046/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

## Steps
1. `pardner client list` → identity, device, setupAgent and `projects[]` including "Checkout Revamp". Matches.
2. `client invite --project <id> --purpose human --output-file <private>/rahul.txt --operation-id invite-rahul-2026-11-09` → `{"success":true,"invite":{"id":…,"purpose":"human",…,"expiresAt":1794338581508,"state":"issued"},"invitationFile":"…/rahul.txt"}`. stdout has no secret, and the file is `-rw-------`. Matches. `expiresAt` is raw epoch ms (F-046-03).
3. (Tell Lena) — n/a.
4. Re-running the same command returns the same invite ID and rewrites an identical file (checksums equal). Matches.
5. `--purpose humans` → `INVALID_ARGUMENT: Choose Human, Agent or My device`. Matches.
6. No `--output-file` → `INVALID_ARGUMENT: Supply --output-file to store the private invitation`. Matches.
7. There is no list command: `client invites` → `INVALID_ARGUMENT: Use client serve, open, stop, …` (F-046-01). Expiry after 24 h was **BLOCKED** in real time; the browser rendering of "Expired" is covered by the simulated clock in STORY-040. Lena's browser view of the list (20 rows by now) needs the whole dialog to scroll (`screenshots/step-7-browser-history.png`, `screenshots/step-7-browser-history-bottom.png`, F-046-02). Geometry clean.
8. A new operation ID gives a new invite. Matches. Note: omitting `--operation-id` is accepted (help lists it as required), so a retry without it would create duplicates.

**Variations / edge cases.** The same operation ID with `--purpose agent` → `OPERATION_ID_REUSED: Operation ID belongs to different input`. Matches. After the invite is revoked through the browser's revoke route, re-running the original command → `REVOKED: Invitation revoked`. Matches (stale file left behind, F-046-04). With an agent token, `POST /invites` → 403 `FORBIDDEN` "Human authority required". Matches.

**Mobile (390x844).** `screenshots/mobile-check.png` (history dialog): clean, long vertical scroll.

**Console:** no errors.

## Flagged claim verdicts
None of the flagged claims touch this story.

## Flow Log
- Ideal 3 (invite, wait, check) vs actual: the check step can't be done from the CLI and needs a human in the browser. That breaks the agent-only flow.
- Every CLI call also prints Node's SQLite ExperimentalWarning, and errors are printed twice (F-046-03).

Status: pass
