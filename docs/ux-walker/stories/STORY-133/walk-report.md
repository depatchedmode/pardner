# STORY-133 walk report: Reconcile an uncertain bridge dispatch

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-133/` (redacted CLI transcript `cli.log`). Setup: the STORY-131 bridge inbox, holding one `queued` delivery (`mention-9804…`, queued because Codex was unreachable) and one blocked row.

**An `uncertain` row cannot be produced without a Codex App Server.** It needs a dispatch whose response is lost, and no App Server was available (see STORY-131 for why neither the real `codex` nor the repo's fake could be used). The core path (status shows uncertain, reconcile retry, row returns to queued, it re-dispatches) is therefore **BLOCKED**. I walked the reconcile command's refusals against the real inbox.

## Steps
1. **`bridge status`** showing `state:"uncertain"` — **BLOCKED**.
2. **Look in the Codex thread** — **BLOCKED**.
3. **Stop the bridge** (SIGINT) → it exits and status shows `bridge: stopped` (walked in STORY-131).
4. **`bridge reconcile --config … --delivery … --decision retry --evidence "No turn in thr_7c1…"`**, exactly as the story and the help line write it (no `--token-file`) → `INVALID_ARGUMENT: Bridge configuration requires replicaId`. The help line for `bridge reconcile` does not list `--token-file`, yet a client bridge needs it (F-133-01). With `--token-file` added, on the queued row → `INVALID_BRIDGE_STATE: Only uncertain dispatches can be reconciled`. Matches the story's queued-row edge case.
5. **Restart and dispatch** — **BLOCKED**.

### Variations and edge cases
- Empty `--evidence` → `INVALID_ARGUMENT: Supply reconciliation evidence`. Matches.
- `--decision maybe` and `--decision accepted` without `--turn-id` → `INVALID_BRIDGE_STATE: Only uncertain dispatches can be reconciled`. The state check runs first, so "Use --decision accepted or retry" and "A harness turn ID is required" could not be reached (**BLOCKED**, they need an uncertain row).
- Unknown delivery ID (`dlv-nope`) → `INVALID_BRIDGE_STATE: Only uncertain dispatches can be reconciled`. It should say the delivery was not found (F-133-02).
- Reconcile while `bridge run` holds the lease → `STORAGE_IN_USE: Another Pardner service is using this storage directory`. Matches (wording in F-131-04).
- `MAPPING_CHANGED` → **BLOCKED** (needs uncertain work).
- **Mobile 390×844** (`screenshots/mobile-check.png`): the board (no browser surface for reconciliation exists). Geometry clean.

## Flagged claim verdicts
No flagged claim names STORY-133.

## Flow Log
- Ideal 3. Not measurable end to end. Following the help text exactly, the first reconcile fails with an internal-sounding message, and the person must guess to add `--token-file`.
- No browser surface. The person cannot see that a delivery is stuck.

Status: blocked
