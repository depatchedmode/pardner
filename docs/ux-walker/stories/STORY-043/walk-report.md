# STORY-043 walk report: Creator removes a member who joined from a leaked invite

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-043/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

J. Doe was simulated by a separate client that confirmed the identity "J. Doe" and joined with a Human invite issued from Priya's browser dialog.

## Steps
1. Priya's avatar stack shows JD. **J. Doe's profile** (`screenshots/step-1-profile.png`) lists Identity (Git name, email), Devices "filament.local" and Live sessions 0, with only **Close**. There is no remove action (F-043-01). Geometry clean.
2. Invite → Human: the leaked row reads "Human · Used" with no Revoke (`screenshots/step-2-history.png`). Matches.
3. `pardner client show --project <id>` → actors JSON. J. Doe appears twice (human Actor and his "Setup agent"), each with a `humanId` and `id`.
4. `client revoke --kind member --id <J. Doe actor ID> --operation-id revoke-jdoe-1` → `NOT_FOUND: Admission not found`. Matches the catalog, F-043-02. The same operation ID with the correct humanId then gave `OPERATION_ID_REUSED: Operation ID belongs to different input`.
5. `--id <humanId> --operation-id revoke-jdoe-2` → `{"success":true,"revoked":true,"kind":"member","id":"…"}`. Re-running it is idempotent.
6. J. Doe's client: "Checkout Revamp / This project didn't open. / Project access revoked; local data remains saved / This invitation or membership was revoked. Ask for a new invitation." with Retry and Open another project (`screenshots/step-6-jdoe-revoked.png`). The project is gone from his `client list` (`projects: []`). Following the advice, a new Human invite from Priya → `IDENTITY_MISMATCH` "Existing human identity requires My device proof" (the invite stayed issued), F-043-04. Geometry: `unevenRows div.actions "Retry / Open another project" widths [66,183]`. These are two buttons whose different label lengths explain the width difference, so it is not a defect.
7. Priya's board still lists "J. Doe, human, offline" in the avatar stack and People, and the invite row still reads "Used" (`screenshots/step-7-priya-after.png`, F-043-05).

**Variations / edge cases.** Missing `--id` → `INVALID_ARGUMENT: Supply --kind device|agent|member and --id`. `--kind person` → `INVALID_ARGUMENT: Choose device, agent or member`. Both match. Priya revoking her own humanId → `FORBIDDEN: Only creator may revoke other memberships` (F-043-03).

**Mobile (390x844).** `screenshots/mobile-check.png` (Priya's board): clean.

**Console:** J. Doe's revoked client logged 401/403 resource errors (expected after revocation). Priya's had none.

## Flagged claim verdicts
- **#21 (member revocation needs the identity ID; actor ID → NOT_FOUND "Admission not found"): CONFIRMED.** See step 4.
- **#22 (not assigned here):** revoked members likewise stay visible with no marker (step 7).

## Flow Log
- Ideal 2 (profile, Remove) vs actual 6: profile (dead end), Invite history (dead end), terminal `client show`, read JSON, failed revoke with the actor ID, revoke with a new operation ID.
- Re-entry: IDs copied by hand from JSON. A wrong first attempt costs the operation ID.
- After success, the UI gives Priya no confirmation and the member still looks present.

Status: fail
