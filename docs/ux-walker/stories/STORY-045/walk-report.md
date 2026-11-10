# STORY-045 walk report: Retire an old laptop and a retired agent harness

Evidence dir: `<evidence-archive>/walker-2026-11-09/STORY-045/`. Screenshot paths below are relative to it.

Walked 2026-11-09 on branch `client-only-entry` with Playwright (Chromium 1440x900 unless noted; WebKit where noted). Services were separate client data dirs under the walker scratchpad: Priya's hub `client serve --http-port 47361 --public-url http://127.0.0.1:47361` (project "Checkout Revamp"), plus replicas for Marcus, J. Doe, Marcus's second laptop and Priya's "ThinkPad", a no-`--public-url` hub on 47362 for the loopback case, and Grace's hub on 47364 with two studio clients. All were stopped at the end. Invitation text, envelopes and grants are not reproduced here; textareas were masked before screenshots where possible.

**Geometry note.** On every board state the audit's only hit is `wrappedControls: button.task-card "P2 Add Apple Pay button Unassigned"`. Task cards are multi-line buttons by design (priority, title, assignee), so this is a false positive confirmed by eye and is not logged. "clean" below means no other violations.

Ken's setup was simulated on Priya's hub. A second client ("ThinkPad") was linked with a My device invite, and a "Cursor" agent Actor (harness `cursor`) was enrolled on Priya's client through an Agent invite. An earlier attempt with harness `cursor-agent` was refused with `INVALID_ARGUMENT` "Unsupported execution harness".

## Steps
1. Priya opens **You** → profile: "Priya Raman (you) · Human · Active", Devices "filament.local / filament.local" (both computers share a hostname here, which is a simulation artifact), no IDs and only Close (`screenshots/step-1-profile.png`, F-045-01). The People list shows Cursor plus three identical "Setup agent" rows (`screenshots/step-1-people.png`; Close placement F-045-04). Geometry clean.
2. `client show --project <id>` gives the ThinkPad device ID (in Priya's `devices`) and Cursor's actor ID. Matches.
3. `client revoke --kind device --id <thinkpad> --operation-id retire-thinkpad` → `revoked: true`. The ThinkPad shows "Project access revoked; local data remains saved / … Ask for a new invitation." (`screenshots/step-3-thinkpad-revoked.png`). A new My device invite fails with `REVOKED` "Project membership is not available" (see F-043-04). Matches the catalog's "can't be relinked".
4. `client revoke --kind agent --id <cursor actor> --operation-id retire-cursor` → `revoked: true`. Cursor's next call (`client operation --harness cursor`) fails with `FORBIDDEN: Harness is not enrolled on this device; join an Agent invitation first`, not ACTOR_REVOKED. Following that advice, a fresh Agent invite joined with HTTP 200 and the row became "Used", yet the harness is still refused with the same message. A never-revoked harness enrolled the same way worked at once (F-045-02).
5. The avatar stack and People still list "Cursor, agent, offline" and the profile still lists both devices (`screenshots/step-5-profile.png`, `screenshots/step-5-people.png`). Matches the catalog. Logged under F-043-05 and F-045-01.

**Variations / edge cases.** A non-existent agent ID → `FORBIDDEN: Agent belongs to another human` (the catalog expected success; F-045-03). Marcus's agent revoked by Priya → `FORBIDDEN: Agent belongs to another human`. Matches. A device ID matching nothing → `NOT_FOUND: Admission not found`. Matches.

**Mobile (390x844).** `screenshots/mobile-check.png` (profile open): clean.

**Console:** none on Priya's pages. The revoked ThinkPad logged 401/403 (expected).

## Flagged claim verdicts
- None assigned to this story. Related evidence: **#22** (revoked devices stay in the profile Devices list with no sign of revocation) is corroborated. **#6** (can a new Agent invitation re-enrol a revoked agent?): the join reports success and consumes the invite, but the harness stays refused.

## Flow Log
- Ideal 2 (one revoke per item from the profile) vs actual 4+: profile (dead end), `client show`, read JSON, two revoke commands.
- Re-entry: device and actor IDs are copied by hand.
- A revoked device or agent still looks like an offline one everywhere. The error text after agent revocation sends the person into an invite-burning loop.

Status: fail
