# STORY-130 walk report: Revoke an agent and observe what its tools see

Walked 2026-11-09. Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-130/` (redacted CLI transcript `cli.log`). Setup: the STORY-125 hub client ("Ledgerline Billing" on 127.0.0.1:48125) and its agent-only box ci-mini-02. The Codex Actor `actor-ceb3…` held credentials on both the hub (`hub-codex.json`) and the box (`ci-agent.json`). A `bridge run` was running on the hub with the hub credential.

## Steps
1. **`client show --project …`** → `{success, project, actors, presence}`. The Codex agent is `{kind:"agent", displayName:"Setup agent", harnessId:"openai-codex", id:"actor-ceb3…"}`. The browser profile (`screenshots/step-2-revoked-agent-profile.png`) shows name, harness and devices, but no Actor ID. Matches.
2. **`client revoke --project … --kind agent --id actor-ceb3… --operation-id revoke-codex-1`** → `{success:true, revoked:true, kind:"agent", id:"actor-ceb3…"}`. Matches.
3. **Hub credential: `tasks --json`** → `AUTH_REQUIRED: Open Pardner through client open to authenticate`, people-oriented copy shown to an agent (F-130-03). **Box credential** → `REVOKED: Project access revoked; local data remains saved`. A write from the box → `REVOKED: Project membership is not available`. The same revocation reads differently on each machine.
4. **Fresh grant on the hub** → `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`. On the box → `REVOKED: Project admission revoked; local data is preserved`. Matches the story.
5. **Bridge** → `bridge status` shows `{scope:"source", state:"AUTH_REQUIRED"}`, while `bridge` stays `running` and the Actor stays `idle`. Matches.

### Recovery attempt (flagged claim #6)
- Following the grant error's advice, I made a new Agent invitation on the hub (`client invite --purpose agent`) and joined it with `--harness openai-codex --name "Codex (re-enrolled)"` → **join succeeded** and the invitation shows **Used** in the dialog (`screenshots/variation-invite-history.png`).
- `client agent-grant` again → still `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`. The actor list is unchanged ("Setup agent", same ID). The advised recovery uses up an invitation and changes nothing. There is no path back for this harness in this project (F-130-01).

### Variations and edge cases
- Missing `--id` → `INVALID_ARGUMENT: Supply --kind device|agent|member and --id`. Matches.
- Unknown agent ID (`actor-nope`) → `FORBIDDEN: Agent belongs to another human`. It should say not found (F-130-04).
- Same `--operation-id`, different `--id` → `OPERATION_ID_REUSED: Operation ID belongs to different input`. Matches.
- **Board after revocation** (`screenshots/step-2-board-after-revoke.png`): the revoked agent's avatar still reads "Setup agent, agent, offline", exactly like an active offline agent. Its profile has no "Revoked" state and no revoke control, and Activity (`screenshots/step-2-activity.png`) records no revocation (F-130-02). Geometry clean on all.
- Presence marker removal → **not observable**: agents have no built-in presence reporter, so the agent was never "Here now" before the revoke.
- **Mobile 390×844** (`screenshots/mobile-check.png`): the board header wraps. Geometry clean.
- Console errors: none.

## Flagged claim verdicts
- **#6 Recovery after an agent is revoked: the documented fix is refused because the Actor is in `revokedActors`; whether a new Agent invitation can re-enrol the same deterministic Actor ID is unclear — CONFIRMED, and the open question is answered: it cannot.** A re-grant is refused with `FORBIDDEN … join an Agent invitation first`. Joining a fresh Agent invitation with the same harness succeeds and consumes the invitation, but the grant is still refused because the deterministic Actor ID stays revoked. (The control-runtime cache half of this claim is BLOCKED; see STORY-134.)
- **#28 A revoked agent's CLI sees `AUTH_REQUIRED` "Open Pardner through client open to authenticate", copy aimed at people — CONFIRMED** for the credential on the hub client. The replica (box) credential instead gets `REVOKED`, which is clearer.

## Flow Log
- Ideal 2 (find the ID, revoke). Actual 2: one `client show` with JSON digging, then revoke. There is no browser path, and the profile does not expose the Actor ID.
- Hesitation: after revoking, the board looks the same, so Priya has to trust the CLI receipt.
- Dead end: when she later wants Codex back, the error tells her to join an Agent invitation. She does, and nothing changes.

Status: fail
